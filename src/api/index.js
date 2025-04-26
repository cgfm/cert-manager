/**
 * @file api/index.js
 * @module api/index
 * @requires express
 * @requires cors
 * @requires path
 * @requires fs
 * @requires swagger-ui-express
 * @requires js-yaml
 * @requires express-openapi-validator
 * @requires routes/ca
 * @requires routes/certificates
 * @requires routes/renewal
 * @requires routes/security
 * @requires routes/settings
 * @requires services/logger
 * @version 0.0.2
 * @license MIT 
 * @author Christian Meiners
 * @description API router for managing certificates and CA operations.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const logger = require('../services/logger');

const swaggerUi = require('swagger-ui-express');
const OpenApiValidator = require('express-openapi-validator');
const yaml = require('js-yaml');


// Import routes - with safety checks
let certificatesRouter, caRouter, dockerRoutes, securityRouter, renewalRouter, settingsRouter, filesystemRouter;

try {
  certificatesRouter = require('./routes/certificates');
  logger.debug('Loaded certificates router');
} catch (error) {
  logger.error(`Failed to load certificates router: ${error.message}`);
  certificatesRouter = null;
}

try {
  caRouter = require('./routes/ca');
  logger.debug('Loaded CA router');
} catch (error) {
  logger.error(`Failed to load CA router: ${error.message}`);
  caRouter = null;
}

try {
  dockerRoutes = require('./routes/docker');
  logger.debug('Loaded Docker router');
} catch (error) {
  logger.error(`Failed to load Docker router: ${error.message}`);
  dockerRoutes = null;
}

try {
  securityRouter = require('./routes/security');
  logger.debug('Loaded security router');
} catch (error) {
  logger.error(`Failed to load security router: ${error.message}`);
  securityRouter = null;
}

try {
  renewalRouter = require('./routes/renewal');
  logger.debug('Loaded renewal router');
} catch (error) {
  logger.error(`Failed to load renewal router: ${error.message}`);
  renewalRouter = null;
}

try {
  settingsRouter = require('./routes/settings');
  logger.debug('Loaded settings router');
} catch (error) {
  logger.error(`Failed to load settings router: ${error.message}`);
  settingsRouter = null;
}

// Filesystem routes
try {
  filesystemRouter = require('./routes/filesystem');
  logger.debug('Loaded filesystem router');
} catch (error) {
  logger.error('Error loading filesystem router:', error);
  filesystemRouter = null;
}

// Add in your requires at the top
const activityRoutes = require('./routes/activity');
const logsRoutes = require('./routes/logs');

/**
 * Setup API with Express
 * @param {Object} deps - Dependencies
 * @param {CertificateManager} deps.certificateManager - Certificate manager instance
 * @param {OpenSSLWrapper} deps.openSSL - OpenSSL wrapper instance
 * @returns {express.Router} Express router
 */
function setupApi(deps) {
  const apiRouter = express.Router();
  
  // Enable CORS
  apiRouter.use(cors());
  
  // Parse JSON body
  apiRouter.use(express.json());
  
  // Basic route for health check
  apiRouter.get('/health', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
  });
  
  apiRouter.get('/config/log-level', (req, res) => {
    res.json({
      level: logger.getLevel().toLowerCase(),
      timestamp: new Date().toISOString()
    });
  });

  apiRouter.put('/config/log-level', (req, res) => {
    try {
      const { level } = req.body;
      
      // Validate level
      const validLevels = ['trace', 'debug', 'info', 'warn', 'error'];
      if (!level || !validLevels.includes(level.toLowerCase())) {
        return res.status(400).json({
          message: `Invalid log level. Must be one of: ${validLevels.join(', ')}`,
          statusCode: 400
        });
      }
      
      // Set log level
      logger.setLevel(level.toLowerCase());
      
      // Return success
      res.json({
        message: `Log level updated to ${level}`,
        level: logger.getLevel().toLowerCase(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error updating log level:', error);
      res.status(500).json({
        message: `Failed to update log level: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Set up OpenAPI validation if available
  if (swaggerUi && OpenApiValidator && yaml) {
    try {
      // Load OpenAPI spec
      const apiSpecPath = path.join(__dirname, 'openapi.yaml');
      
      // Make sure the file exists
      if (!fs.existsSync(apiSpecPath)) {
        logger.error(`OpenAPI spec file not found at: ${apiSpecPath}`);
      } else {
        const apiSpec = yaml.load(fs.readFileSync(apiSpecPath, 'utf8'));

        // Serve Swagger UI - this should work without waiting for validation middleware
        apiRouter.use('/docs', swaggerUi.serve, swaggerUi.setup(apiSpec, {
          explorer: true, // Enable the explorer
          customCss: '.swagger-ui .topbar { display: none }' // Hide the top bar
        }));
        
        // Serve OpenAPI spec as JSON
        apiRouter.get('/openapi.json', (req, res) => {
          res.json(apiSpec);
        });

        // Setup OpenAPI validator - use synchronous version instead of async
        try {
          // Use synchronously if possible
          apiRouter.use(
            OpenApiValidator.middleware({
              apiSpec: apiSpecPath,
              validateRequests: true,
              validateResponses: false
            })
          );
          logger.info('OpenAPI validation middleware installed');
        } catch (validatorError) {
          // Fall back to async if needed
          logger.warn('Using async OpenAPI validator initialization');
          new OpenApiValidator({
            apiSpec: apiSpecPath,
            validateRequests: true,
            validateResponses: false
          }).install(apiRouter).then(() => {
            logger.info('OpenAPI validation middleware installed asynchronously');
          }).catch(err => {
            logger.error('Failed to install OpenAPI validation middleware', err);
          });
        }
      }
    } catch (error) {
      logger.error(`Error setting up OpenAPI: ${error.message}`);
    }
  } else {
    logger.warn('OpenAPI dependencies not available. API documentation and validation are disabled.', "swaggerUi: " + swaggerUi + ", expressOpenApiValidator: " + expressOpenApiValidator +  ", OpenApiValidator: " + OpenApiValidator + ", yaml: " + yaml);
    
    // Add a placeholder route for docs when Swagger is unavailable
    apiRouter.get('/docs', (req, res) => {
      res.send('API documentation is not available. Missing dependencies: swagger-ui-express, express-openapi-validator, or js-yaml.');
    });
  }

  // Register API routes with safety checks
  if (certificatesRouter) {
    apiRouter.use('/certificates', certificatesRouter(deps));
    logger.debug('Registered certificates routes');
  } else {
    logger.warn('Certificates routes not available');
    apiRouter.use('/certificates', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }
  
  if (caRouter) {
    apiRouter.use('/ca', caRouter(deps));
    logger.debug('Registered CA routes');
  } else {
    logger.warn('CA routes not available');
    apiRouter.use('/ca', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }
  
  if (securityRouter) {
    apiRouter.use('/security', securityRouter(deps));
    logger.debug('Registered security routes');
  } else {
    logger.warn('Security routes not available');
    apiRouter.use('/security', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }
  
  if (renewalRouter) {
    apiRouter.use('/renewal', renewalRouter(deps));
    logger.debug('Registered renewal routes');
  } else {
    logger.warn('Renewal routes not available');
    apiRouter.use('/renewal', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }
  
  if (settingsRouter) {
    apiRouter.use('/settings', settingsRouter(deps));
    logger.debug('Registered settings routes');
  } else {
    logger.warn('Settings routes not available');
    apiRouter.use('/settings', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }
  
  if (filesystemRouter) {
    apiRouter.use('/filesystem', filesystemRouter({
      fileSystemService: deps.fileSystemService, // Make sure the name matches
      logger
    }));
    logger.debug('Registered filesystem routes');
  } else {
    logger.warn('Filesystem routes not available');
    apiRouter.use('/filesystem', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }

  // For Docker routes
  if (dockerRoutes) {
    apiRouter.use('/docker', dockerRoutes({
      dockerService: deps.dockerService
    }));
    logger.debug('Registered Docker routes');
  } else {
    logger.warn('Docker routes not available');
    apiRouter.use('/docker', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }
  
  // Activity routes
  const activityRouter = activityRoutes({
    activityService: deps.activityService,
    logger
  });

  apiRouter.use('/activity', activityRouter);
  logger.debug('Registered activity routes');
  
  // Logs routes
  const logsRouter = logsRoutes({
    logsService: deps.logsService,
    logger
  });

  apiRouter.use('/logs', logsRouter);
  logger.debug('Registered logs routes');

  // After all routes are registered:

  // Debug log to show all registered routes
  if (logger.isLevelEnabled('debug')) {
    const routes = [];
    apiRouter.stack.forEach((middleware) => {
      if (middleware.route) {
        // Routes registered directly
        routes.push(`${Object.keys(middleware.route.methods)[0].toUpperCase()} /api${middleware.route.path}`);
      } else if (middleware.name === 'router') {
        // Router middleware
        const path = middleware.regexp.toString().split('/')[1].replace('\\', '');
        middleware.handle.stack.forEach((handler) => {
          if (handler.route) {
            const method = Object.keys(handler.route.methods)[0].toUpperCase();
            routes.push(`${method} /api/${path}${handler.route.path}`);
          }
        });
      }
    });
    
    logger.debug('Registered API routes:');
    routes.sort().forEach(route => logger.debug(`- ${route}`));
  }
  
  // Error handler for OpenAPI validation errors
  apiRouter.use((err, req, res, next) => {
    logger.error('API error', err);
    
    // Handle validation errors
    if (err.status && err.errors) {
      return res.status(err.status).json({
        message: 'Validation error',
        statusCode: err.status,
        errors: err.errors
      });
    }
    
    // Handle other errors
    res.status(err.status || 500).json({
      message: err.message || 'Internal server error',
      statusCode: err.status || 500
    });
  });

  return apiRouter;
}

module.exports = setupApi;