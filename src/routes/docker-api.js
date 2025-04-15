const express = require('express');
const router = express.Router();
const dockerService = require('../services/docker-service');
const logger = require('../services/logger');

function initialize() {
    // List all containers
    router.get('/containers', async (req, res) => {
        try {
            if (!dockerService.isAvailable) {
                return res.json({
                    success: false,
                    error: 'Docker is not available',
                    containers: []
                });
            }

            const containers = await dockerService.getContainers();
            return res.json({
                success: true,
                containers
            });
        } catch (error) {
            logger.error('Error listing Docker containers:', error);
            return res.status(500).json({
                success: false,
                error: 'Error listing Docker containers: ' + error.message,
                containers: []
            });
        }
    });

    // Restart a container
    router.post('/containers/:id/restart', async (req, res) => {
        try {
            const { id } = req.params;
            
            if (!dockerService.isAvailable) {
                return res.status(503).json({
                    success: false,
                    error: 'Docker is not available'
                });
            }
            
            await dockerService.restartContainer(id);
            return res.json({
                success: true,
                message: `Container ${id} restarted successfully`
            });
        } catch (error) {
            logger.error(`Error restarting container ${req.params.id}:`, error);
            return res.status(500).json({
                success: false,
                error: `Error restarting container: ${error.message}`
            });
        }
    });

    // Check Docker availability
    router.get('/status', async (req, res) => {
        res.json({
            success: true,
            available: dockerService.isAvailable
        });
    });

    return router;
}

module.exports = { router, initialize };