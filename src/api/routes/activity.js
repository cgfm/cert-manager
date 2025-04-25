/**
 * Activity API Routes
 * @module activityRoutes
 * @requires express
 */

const express = require('express');

/**
 * Activity routes
 * @param {Object} deps - Dependencies
 * @returns {express.Router} Router
 */
function activityRoutes(deps) {
  const router = express.Router();
  const { activityService, logger } = deps;
  
  // Get recent activities
  router.get('/', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const type = req.query.type;
      
      let activities;
      if (type) {
        activities = activityService.getActivitiesByType(type, limit);
      } else {
        activities = activityService.getRecentActivities(limit);
      }
      
      res.json(activities);
    } catch (error) {
      logger.error('Error retrieving activities:', error);
      res.status(500).json({
        error: 'Failed to retrieve activities',
        message: error.message
      });
    }
  });

  // Add a new activity
  router.post('/', (req, res) => {
    try {
      const { action, type, target, metadata } = req.body;
      
      if (!action || !type || !target) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Action, type, and target are required'
        });
      }
      
      const activity = activityService.addActivity(action, type, target, metadata);
      
      res.status(201).json(activity);
    } catch (error) {
      logger.error('Error adding activity:', error);
      res.status(500).json({
        error: 'Failed to add activity',
        message: error.message
      });
    }
  });

  // Clear all activities
  router.delete('/', (req, res) => {
    try {
      activityService.clearActivities();
      
      res.json({
        success: true,
        message: 'Activities cleared successfully'
      });
    } catch (error) {
      logger.error('Error clearing activities:', error);
      res.status(500).json({
        error: 'Failed to clear activities',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = activityRoutes;