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
            // Check if Docker socket is accessible
            if (fs.existsSync('/var/run/docker.sock')) {
                this.docker = new Docker({ socketPath: '/var/run/docker.sock' });
                this.isAvailable = true;
                logger.info('Docker integration initialized successfully');
            } else {
                logger.info('Docker socket not found, Docker integration disabled');
                this.isAvailable = false;
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