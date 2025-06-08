/**
 * @fileoverview Docker API Routes - Provides Docker container and volume management endpoints
 * @module api/routes/docker
 * @requires express
 * @requires ../../services/logger
 * @author Certificate Manager
 */

const express = require('express');
const router = express.Router();
const logger = require('../../services/logger');

const FILENAME = 'api/routes/docker.js';

/**
 * Initialize Docker router with required dependencies.
 * Provides endpoints for Docker container and volume management operations.
 * @param {Object} deps - Dependencies object containing required services
 * @param {Object} deps.dockerService - Docker service instance for container operations
 * @returns {express.Router} Configured Express router with Docker management endpoints
 */
function dockerRouter(deps) {
  const { dockerService } = deps;
  
  if (!dockerService) {
    logger.error('Docker service not provided to docker routes', null, FILENAME);
    return router; // Return empty router
  }
  
  /**
   * @route GET /api/docker/containers
   * @description Get list of available Docker containers
   * @access Private
   */
  router.get('/containers', async (req, res) => {
    try {
      // Check if Docker is available
      if (!dockerService.isAvailable) {
        return res.status(503).json({ 
          error: 'Docker service is not available',
          dockerAvailable: false
        });
      }
      
      // Get containers from Docker service
      const containers = await dockerService.getContainers();
      
      // Map containers to a simplified format
      const containerList = containers.map(container => {
        return {
          id: container.Id,
          shortId: container.Id.substring(0, 12),
          name: container.Names[0].replace(/^\//, ''), // Remove leading slash from name
          image: container.Image,
          status: container.State,
          created: container.Created
        };
      });
      
      res.json({
        dockerAvailable: true,
        containers: containerList
      });
    } catch (error) {
      logger.error('Error fetching Docker containers:', error, FILENAME);
      res.status(500).json({ 
        error: `Failed to fetch Docker containers: ${error.message}`,
        dockerAvailable: dockerService.isAvailable
      });
    }
  });

  /**
   * @route POST /api/docker/containers/:id/restart
   * @description Restart a Docker container
   * @access Private
   */
  router.post('/containers/:id/restart', async (req, res) => {
    const containerId = req.params.id;
    
    try {
      if (!dockerService.isAvailable) {
        return res.status(503).json({ error: 'Docker service is not available' });
      }
      
      await dockerService.restartContainer(containerId);
      res.json({ success: true, message: `Container ${containerId} restarted successfully` });
    } catch (error) {
      logger.error(`Error restarting Docker container ${containerId}:`, error, FILENAME);
      res.status(500).json({ error: `Failed to restart container: ${error.message}` });
    }
  });

  return router;
}

module.exports = dockerRouter;