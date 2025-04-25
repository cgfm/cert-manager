/**
 * Logs API Routes
 * @module logsRoutes
 * @requires express
 */

const express = require('express');

/**
 * Logs routes
 * @param {Object} deps - Dependencies
 * @returns {express.Router} Router
 */
function logsRoutes(deps) {
  const router = express.Router();
  const { logsService, logger } = deps;
  
  // Get available log files
  router.get('/', async (req, res) => {
    try {
      const files = await logsService.getLogFiles();
      res.json(files);
    } catch (error) {
      logger.error('Error retrieving log files:', error);
      res.status(500).json({
        error: 'Failed to retrieve log files',
        message: error.message
      });
    }
  });

  // Get content of a specific log file
  router.get('/:filename', async (req, res) => {
    try {
      const filename = req.params.filename;
      const limit = parseInt(req.query.limit) || 1000;
      const filter = req.query.filter || null;
      
      const content = await logsService.getLogContent(filename, limit, filter);
      res.json(content);
    } catch (error) {
      logger.error(`Error retrieving log content:`, error);
      res.status(500).json({
        error: 'Failed to retrieve log content',
        message: error.message
      });
    }
  });

  // Clear a log file
  router.delete('/:filename', async (req, res) => {
    try {
      const filename = req.params.filename;
      const success = await logsService.clearLog(filename);
      
      if (success) {
        res.json({
          success: true,
          message: `Log file ${filename} cleared`
        });
      } else {
        res.status(404).json({
          success: false,
          error: `Log file ${filename} not found`
        });
      }
    } catch (error) {
      logger.error(`Error clearing log file:`, error);
      res.status(500).json({
        error: 'Failed to clear log file',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = logsRoutes;