/**
 * Public API Routes (no authentication required)
 */
const express = require('express');
const router = express.Router();
const logger = require('../../services/logger');

const FILENAME = 'api/routes/public.js';

/**
 * Initialize public router
 * @param {Object} deps - Dependencies
 * @returns {express.Router} Express router
 */
function initPublicRouter(deps) {
  const { configService } = deps;

  logger.debug('Initializing public API routes', null, FILENAME);

  // Get log level (no authentication required)
  router.get('/logLevel', (req, res) => {
    try {
      // Get log level from config
      const logLevel = configService.get('logLevel') || 'info';

      // Convert string level to standard format
      let normalizedLevel;

      if (typeof logLevel === 'string') {
        normalizedLevel = logLevel.toLowerCase();

        // Validate level is a recognized level
        const validLevels = ['debug', 'info', 'warn', 'error'];
        if (!validLevels.includes(normalizedLevel)) {
          normalizedLevel = 'info'; // default to info if invalid
        }
      } else if (typeof logLevel === 'number') {
        // If it's numeric, validate range
        if (logLevel >= 0 && logLevel <= 3) {
          normalizedLevel = logLevel;
        } else {
          normalizedLevel = 1; // default to info (1) if out of range
        }
      } else {
        normalizedLevel = 'info'; // default fallback
      }

      logger.debug('Serving log level to client', {
        originalLevel: logLevel,
        normalizedLevel: normalizedLevel
      }, FILENAME);

      res.json({
        success: true,
        logLevel: normalizedLevel
      });
    } catch (error) {
      logger.error('Error getting log level', { error: error.message }, FILENAME);
      res.status(500).json({
        success: false,
        message: 'Error retrieving log level',
        error: error.message
      });
    }
  });

  // Echo endpoint - useful for testing if API is accessible
  router.get('/ping', (req, res) => {
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      message: 'API is operational'
    });
  });

  // Status endpoint to check if system is ready
  router.get('/status', (req, res) => {
    try {
      // Return system status
      res.json({
        ready: global.systemReady || false,
        setupNeeded: userManager ? userManager.isSetupNeeded(true) : false,
        authRequired: authMiddleware ? !authMiddleware.isAuthDisabled() : true,
        version: pkg.version,
        initializationProgress: global.initProgress || 0
      });
    } catch (error) {
      // Even on error, send a response with ready: false
      res.json({
        ready: false,
        error: error.message
      });
    }
  });

  logger.debug('Public API routes initialized', null, FILENAME);
  return router;
}

module.exports = initPublicRouter;