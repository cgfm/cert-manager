const express = require('express');
const router = express.Router();
const dockerService = require('../services/docker-service');

// GET /api/docker/containers - List all containers
router.get('/containers', async (req, res) => {
    try {
        // Check if Docker is available
        if (!dockerService.isAvailable) {
            return res.json({
                success: false,
                error: 'docker_not_available',
                message: 'Docker socket not found or not accessible'
            });
        }
        
        // Get container list
        const containers = await dockerService.getContainers();
        
        // Return container data
        return res.json({
            success: true,
            containers: containers.map(container => ({
                Id: container.Id,
                Names: container.Names,
                Image: container.Image,
                State: container.State,
                Status: container.Status
            }))
        });
    } catch (error) {
        console.error('Error in /api/docker/containers:', error);
        return res.status(500).json({
            success: false,
            error: 'server_error',
            message: error.message || 'Error retrieving Docker containers'
        });
    }
});

// POST /api/docker/restart/:containerId - Restart a container
router.post('/restart/:containerId', async (req, res) => {
    try {
        const { containerId } = req.params;
        
        if (!containerId) {
            return res.status(400).json({
                success: false,
                error: 'missing_container_id',
                message: 'Container ID is required'
            });
        }
        
        // Restart the container
        await dockerService.restartContainer(containerId);
        
        return res.json({
            success: true,
            message: `Container ${containerId} restarted successfully`
        });
    } catch (error) {
        console.error(`Error in /api/docker/restart/${req.params.containerId}:`, error);
        return res.status(500).json({
            success: false,
            error: 'restart_failed',
            message: error.message || 'Failed to restart container'
        });
    }
});

module.exports = router;