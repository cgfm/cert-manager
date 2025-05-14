/**
 * Activity API Routes
 */
const express = require('express');
const router = express.Router();
const logger = require('../../services/logger');

const FILENAME = 'api/routes/activity.js';

/**
 * Initialize activity router
 * @param {Object} deps - Dependencies
 * @returns {express.Router} Express router
 */
function initActivityRouter(deps) {
  const { activityService } = deps;
  
  // Get recent activities
  router.get('/', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const type = req.query.type || null;
      const search = req.query.search || null;
      
      const activities = activityService.getActivities(limit, type, search);
      
      res.json({
        success: true,
        activities: activities // Make sure activities is an array here
      });
    } catch (error) {
      logger.error('Error getting activities', { error: error.message }, FILENAME);
      res.status(500).json({
        success: false,
        message: 'Error retrieving activities',
        error: error.message
      });
    }
  });
  
  // Clear all activities (admin only)
  router.delete('/', (req, res) => {
    try {
      // Check if user is admin
      if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Admin privileges required'
        });
      }
      
      activityService.clearAllActivities();
      
      res.json({
        success: true,
        message: 'All activities cleared'
      });
    } catch (error) {
      logger.error('Error clearing activities', { error: error.message }, FILENAME);
      res.status(500).json({
        success: false,
        message: 'Error clearing activities',
        error: error.message
      });
    }
  });
  
  return router;
}

module.exports = initActivityRouter;