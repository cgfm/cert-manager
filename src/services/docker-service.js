/**
 * @fileoverview Docker Service - Manages Docker integration and container operations
 * @module services/docker-service
 * @requires dockerode
 * @requires fs
 * @requires ./logger
 * @version 0.0.2
 * @license MIT
 * @author Christian Meiners
 */

const Docker = require('dockerode');
const fs = require('fs');
const logger = require('./logger');

const FILENAME = 'services/docker-service.js';

/**
 * Docker Service for managing Docker integration and container operations.
 * Provides methods to interact with Docker containers, list volumes, and restart services.
 * Handles cross-platform Docker socket initialization.
 */
class DockerService {
    /**
     * Create a new DockerService instance.
     * Automatically initializes Docker client connection.
     */
    constructor() {
        this.docker = null;
        this.isAvailable = false;
        this.initDocker();
    }

    /**
     * Initialize Docker client connection with cross-platform support.
     * Attempts to connect via Windows named pipe, Unix socket, or environment variables.
     * @private
     */
    initDocker() {
        try {
            if (process.platform === 'win32') {
                // Windows-specific Docker socket path
                this.docker = new Docker({ socketPath: '//./pipe/docker_engine' });
                this.isAvailable = true;
                logger.info('Docker integration initialized successfully (Windows)', null, FILENAME);
            } 
            else if (fs.existsSync('/var/run/docker.sock')) {
                // Linux/Mac Docker socket path
                this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
                this.isAvailable = true;
                logger.info('Docker integration initialized successfully', null, FILENAME);
            } 
            else {
                // Try to initialize Docker from environment variables as fallback
                this.docker = new Docker();
                
                // Test the connection
                this.docker.ping().then(() => {
                    this.isAvailable = true;
                    logger.info('Docker integration initialized from environment', null, FILENAME);
                }).catch(err => {
                    logger.warn('Docker not available:', err.message, FILENAME);
                    this.isAvailable = false;
                });
            }
        } catch (error) {
            logger.error('Error initializing Docker client:', error, FILENAME);
            this.isAvailable = false;
        }
    }

    async getContainers() {
        if (!this.isAvailable) {
            throw new Error('Docker is not available');
        }

        try {
            // List all containers (running and stopped)
            const containers = await this.docker.listContainers({ all: true });
            return containers;
        } catch (error) {
            logger.error('Error listing Docker containers:', error, FILENAME);
            throw error;
        }
    }

    async restartContainer(containerId) {
        if (!this.isAvailable) {
            throw new Error('Docker is not available');
        }

        try {
            const container = this.docker.getContainer(containerId);
            await container.restart();
            return true;
        } catch (error) {
            logger.error(`Error restarting container ${containerId}:`, error, FILENAME);
            throw error;
        }
    }

    /**
     * Get the mount points of the container this application is running in
     * @returns {Promise<Array>} Array of mount objects with name, path and isWritable properties
     */
    async getThisContainerMounts() {
        try {
            // First check if we're running in Docker
            const isInDocker = await this.isRunningInDocker();
            if (!isInDocker) {
                logger.info('Not running in a Docker container', null, FILENAME);
                return [];
            }

            // If Docker API is not available.
            if (!this.isAvailable) {
                logger.info('Docker Socket not available.', null, FILENAME);
                return [];
            }

            // Get this container's ID
            const containerId = await this.getThisContainerId();
            if (!containerId) {
                logger.warn('Could not determine current container ID', null, FILENAME);
                return [];
            }

            // Get container details using Docker API
            const container = this.docker.getContainer(containerId);
            const containerInfo = await container.inspect();
            
            // Process mounts
            const mounts = [];
            if (containerInfo && containerInfo.Mounts) {
                for (const mount of containerInfo.Mounts) {
                    // Get a user-friendly name
                    let name = '';
                    if (mount.Name) {
                        // Use volume name if available
                        name = mount.Name;
                    } else if (mount.Source) {
                        // Otherwise use last part of source path
                        const parts = mount.Source.split('/');
                        name = parts[parts.length - 1] || mount.Source;
                    } else {
                        // Fallback to destination path
                        const parts = mount.Destination.split('/');
                        name = parts[parts.length - 1] || mount.Destination;
                    }
                    
                    mounts.push({
                        name: name,
                        path: mount.Destination,
                        source: mount.Source || '',
                        type: mount.Type || 'volume'
                    });
                }
            }
            
            logger.info(`Found ${mounts.length} mounts for container ${containerId.substring(0, 12)}`, null, FILENAME);
            return mounts;
        } catch (error) {
            logger.error('Error getting container mounts:', error, FILENAME);
            return [];
        }
    }

    /**
     * Check if the application is running in a Docker container
     * @returns {Promise<boolean>} True if running in Docker
     */
    async isRunningInDocker() {
        try {
            // Method 1: Check for .dockerenv file
            if (fs.existsSync('/.dockerenv')) {
                return true;
            }
            
            // Method 2: Check Docker cgroup
            if (fs.existsSync('/proc/1/cgroup')) {
                const cgroupContent = fs.readFileSync('/proc/1/cgroup', 'utf8');
                if (cgroupContent.includes('docker') || cgroupContent.includes('containerd')) {
                    return true;
                }
            }
            
            // Method 3: Check hostname (often Docker sets hostname to container ID)
            const { hostname } = require('os');
            const containerHostname = hostname();
            if (containerHostname && containerHostname.length === 12 && /^[0-9a-f]+$/.test(containerHostname)) {
                return true;
            }
            
            return false;
        } catch (error) {
            logger.debug('Error checking if running in Docker:', error, FILENAME);
            return false;
        }
    }

    /**
     * Get the ID of the container this application is running in
     * @returns {Promise<string|null>} Container ID or null if not in a container
     */
    async getThisContainerId() {
        try {
            // Method 1: Use hostname (common Docker behavior)
            const { hostname } = require('os');
            const containerHostname = hostname();
            if (containerHostname && containerHostname.length === 12 && /^[0-9a-f]+$/.test(containerHostname)) {
                return containerHostname;
            }
            
            // Method 2: Check cgroup file for container ID
            if (fs.existsSync('/proc/self/cgroup')) {
                const cgroupContent = fs.readFileSync('/proc/self/cgroup', 'utf8');
                const match = cgroupContent.match(/[0-9a-f]{64}/i);
                if (match && match[0]) {
                    return match[0];
                }
            }
            
            // Method 3: If we can list containers, find one with matching PID 1
            if (this.isAvailable) {
                const containers = await this.docker.listContainers();
                for (const containerInfo of containers) {
                    // Get detailed container info
                    const container = this.docker.getContainer(containerInfo.Id);
                    const details = await container.inspect();
                    
                    // Compare with our own PID namespace
                    if (fs.existsSync('/proc/1/cmdline')) {
                        const ourPid1Cmdline = fs.readFileSync('/proc/1/cmdline', 'utf8');
                        // This comparison isn't perfect but can help
                        if (details.Config && details.Config.Cmd && 
                            details.Config.Cmd.join(' ').includes(ourPid1Cmdline.replace(/\0/g, ' ').trim())) {
                            return containerInfo.Id;
                        }
                    }
                }
            }
            
            return null;
        } catch (error) {
            logger.debug('Error getting this container ID:', error, FILENAME);
            return null;
        }
    }
}

// Create and export a singleton instance
const dockerService = new DockerService();
module.exports = dockerService;