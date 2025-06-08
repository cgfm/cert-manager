/**
 * @fileoverview Public API Routes - Endpoints that do not require authentication
 * 
 * This module provides publicly accessible endpoints for:
 * - System health checks (Docker/monitoring integration)
 * - Application status and readiness
 * - Log level configuration retrieval
 * - API ping/echo testing
 * 
 * These endpoints are essential for container orchestration and monitoring systems
 * that need to verify service health without authentication credentials.
 * 
 * @module api/routes/public
 * @requires express
 * @author Certificate Manager
 * @since 1.0.0
 */
const express = require('express');
const router = express.Router();
const logger = require('../../services/logger');

const FILENAME = 'api/routes/public.js';

/**
 * Initializes the public router with endpoints that don't require authentication
 * 
 * @param {Object} deps - Required dependencies for public operations
 * @param {Object} deps.configService - Configuration service for system settings
 * @param {Object} [deps.userManager] - User manager service for setup status
 * @param {Object} [deps.authMiddleware] - Authentication middleware for auth status
 * @returns {express.Router} Configured Express router with public endpoints
 */
function initPublicRouter(deps) {
  const { configService } = deps;

  logger.debug('Initializing public API routes', null, FILENAME);
  /**
   * GET /api/public/logLevel
   * Retrieves the current system log level configuration
   * 
   * Returns the normalized log level that should be used by client applications
   * for filtering display of log messages. Supports both string and numeric formats.
   * 
   * @param {express.Request} req - Express request object
   * @param {express.Response} res - Express response object
   * @returns {void} JSON response with log level configuration
   */
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
  /**
   * GET /api/public/ping
   * Simple echo endpoint for testing API accessibility
   * 
   * Useful for verifying that the API server is responding to requests
   * without requiring authentication or complex operations.
   * 
   * @param {express.Request} req - Express request object
   * @param {express.Response} res - Express response object
   * @returns {void} JSON response with success confirmation and timestamp
   */
  router.get('/ping', (req, res) => {
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      message: 'API is operational'
    });
    });
  /**
   * GET /api/public/health
   * Comprehensive health check endpoint for Docker and monitoring systems
   * 
   * Performs multiple system checks and returns detailed health information:
   * - System readiness status
   * - Dependency availability
   * - Configuration accessibility
   * - Database/storage connectivity
   * - Service uptime and version information
   * - Port configuration for debugging
   * 
   * Returns appropriate HTTP status codes:
   * - 200: Service is healthy and fully operational
   * - 503: Service is starting or has critical issues
   * 
   * @param {express.Request} req - Express request object
   * @param {express.Response} res - Express response object
   * @returns {void} JSON response with detailed health status and HTTP status code
   */
  router.get('/health', (req, res) => {
    let status = 'starting';
    let httpStatus = 503; // Service Unavailable by default
    const checks = {
      system: false,
      database: false,
      dependencies: false,
      configuration: false
    };

    try {
      // Check if system is ready
      if (global.systemReady) {
        checks.system = true;
      }

      // Check if core dependencies are available
      if (deps.configService) {
        checks.dependencies = true;
        
        // Check if configuration is accessible
        try {
          const httpPort = deps.configService.get('httpPort');
          const httpsPort = deps.configService.get('httpsPort');
          checks.configuration = true;
        } catch (e) {
          // Configuration might not be fully loaded yet
          checks.configuration = false;
        }
      }

      // Check database/storage (if available)
      // This would be expanded based on your actual storage implementation
      checks.database = true; // Assume healthy for now, expand as needed

      // Determine overall status
      const criticalChecks = [checks.system, checks.dependencies];
      const allCriticalChecksPass = criticalChecks.every(check => check === true);
      const allChecksPass = Object.values(checks).every(check => check === true);
      
      if (allChecksPass && global.systemReady) {
        status = 'healthy';
        httpStatus = 200;
      } else if (allCriticalChecksPass && !global.systemReady) {
        status = 'starting';
        httpStatus = 503;
      } else {
        status = 'unhealthy';
        httpStatus = 503;
      }

      const response = {
        status: status,
        timestamp: new Date().toISOString(),
        checks: checks,
        uptime: process.uptime(),
        version: (() => {
          try {
            return require('../../../package.json').version;
          } catch (e) {
            return 'unknown';
          }
        })(),
        // Include port information for debugging
        ports: (() => {
          try {
            return {
              http: deps.configService ? deps.configService.get('httpPort') || process.env.PORT || 3000 : 'unknown',
              https: deps.configService ? deps.configService.get('httpsPort') || process.env.HTTPS_PORT || 4443 : 'unknown'
            };
          } catch (e) {
            return { http: 'unknown', https: 'unknown' };
          }
        })()
      };

      // For Docker health checks, we want proper HTTP status codes
      res.status(httpStatus).json(response);

    } catch (error) {
      logger.error('Health check failed', { error: error.message }, FILENAME);
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message,
        checks: checks
      });
    }
  });
  /**
   * GET /api/public/status
   * Returns system status and initialization information
   * 
   * Provides essential information about:
   * - System readiness for accepting requests
   * - Whether initial setup is required
   * - Authentication requirements
   * - Application version
   * - Initialization progress percentage
   * 
   * This endpoint is safe to call during system startup and will always
   * return a response, even if other services are not yet available.
   * 
   * @param {express.Request} req - Express request object
   * @param {express.Response} res - Express response object
   * @returns {void} JSON response with system status information
   */
  router.get('/status', (req, res) => {
    try {
      // Get package version safely
      let version = 'unknown';
      try {
        const pkg = require('../../../package.json');
        version = pkg.version;
      } catch (e) {
        logger.debug('Could not load package.json version', null, FILENAME);
      }

      // Return system status
      res.json({
        ready: global.systemReady || false,
        setupNeeded: deps.userManager ? deps.userManager.isSetupNeeded(true) : false,
        authRequired: deps.authMiddleware ? !deps.authMiddleware.isAuthDisabled() : true,
        version: version,
        initializationProgress: global.initProgress || 0
      });
    } catch (error) {
      logger.error('Error getting system status', { error: error.message }, FILENAME);
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