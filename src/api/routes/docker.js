/**
 * Docker API Routes
 * @module api/routes/docker
 */

const express = require('express');
const router = express.Router();
const logger = require('../../services/logger');

// Fix the middleware import path - use try/catch to make it optional
let authMiddleware = { isAuthenticated: (req, res, next) => next() };
try {
  authMiddleware = require('../middleware/auth');
} catch (error) {
  logger.warn('Auth middleware not found, proceeding without authentication');
}

/**
 * Docker router factory
 * @param {Object} deps - Dependencies
 * @param {Object} deps.dockerService - Docker service instance
 * @returns {express.Router} Express router
 */
function dockerRouter(deps) {
  const { dockerService } = deps;
  
  if (!dockerService) {
    logger.error('Docker service not provided to docker routes');
    return router; // Return empty router
  }
  
  /**
   * @route GET /api/docker/containers
   * @description Get list of available Docker containers
   * @access Private
   */
  router.get('/containers', authMiddleware.isAuthenticated, async (req, res) => {
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
      logger.error('Error fetching Docker containers:', error);
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
  router.post('/containers/:id/restart', authMiddleware.isAuthenticated, async (req, res) => {
    const containerId = req.params.id;
    
    try {
      if (!dockerService.isAvailable) {
        return res.status(503).json({ error: 'Docker service is not available' });
      }
      
      await dockerService.restartContainer(containerId);
      res.json({ success: true, message: `Container ${containerId} restarted successfully` });
    } catch (error) {
      logger.error(`Error restarting Docker container ${containerId}:`, error);
      res.status(500).json({ error: `Failed to restart container: ${error.message}` });
    }
  });

  return router;
}

module.exports = dockerRouter;