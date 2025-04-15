const Docker = require('dockerode');
const fs = require('fs');
const logger = require('./logger');

class DockerService {
    constructor() {
        this.docker = null;
        this.isAvailable = false;
        this.initDocker();
    }

    initDocker() {
        try {
            if (process.platform === 'win32') {
                // Windows-specific Docker socket path
                this.docker = new Docker({ socketPath: '//./pipe/docker_engine' });
                this.isAvailable = true;
                logger.info('Docker integration initialized successfully (Windows)');
            } 
            else if (fs.existsSync('/var/run/docker.sock')) {
                // Linux/Mac Docker socket path
                this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
                this.isAvailable = true;
                logger.info('Docker integration initialized successfully');
            } 
            else {
                // Try to initialize Docker from environment variables as fallback
                this.docker = new Docker();
                
                // Test the connection
                this.docker.ping().then(() => {
                    this.isAvailable = true;
                    logger.info('Docker integration initialized from environment');
                }).catch(err => {
                    logger.warn('Docker not available:', err.message);
                    this.isAvailable = false;
                });
            }
        } catch (error) {
            logger.error('Error initializing Docker client:', error);
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
            logger.error('Error listing Docker containers:', error);
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
            logger.error(`Error restarting container ${containerId}:`, error);
            throw error;
        }
    }
}

// Create and export a singleton instance
const dockerService = new DockerService();
module.exports = dockerService;