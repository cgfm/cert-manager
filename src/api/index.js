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

const logsRoutes = require('./routes/logs');

const FILENAME = 'api/index.js';

// Import routes - with safety checks
let certificatesRouter, caRouter, dockerRoutes, securityRouter, renewalRouter, settingsRouter, filesystemRouter, authRouter, publicRouter, setupRouter, integrationsRouter, activityRoutes;

try {
  certificatesRouter = require('./routes/certificates');
  logger.debug('Loaded certificates router', null, FILENAME);
} catch (error) {
  logger.error(`Failed to load certificates router: ${error.message}`, null, FILENAME);
  certificatesRouter = null;
}

try {
  caRouter = require('./routes/ca');
  logger.debug('Loaded CA router', null, FILENAME);
} catch (error) {
  logger.error(`Failed to load CA router: ${error.message}`, null, FILENAME);
  caRouter = null;
}

try {
  dockerRoutes = require('./routes/docker');
  logger.debug('Loaded Docker router', null, FILENAME);
} catch (error) {
  logger.error(`Failed to load Docker router: ${error.message}`, null, FILENAME);
  dockerRoutes = null;
}

try {
  securityRouter = require('./routes/security');
  logger.debug('Loaded security router', null, FILENAME);
} catch (error) {
  logger.error(`Failed to load security router: ${error.message}`, null, FILENAME);
  securityRouter = null;
}

try {
  renewalRouter = require('./routes/renewal');
  logger.debug('Loaded renewal router', null, FILENAME);
} catch (error) {
  logger.error(`Failed to load renewal router: ${error.message}`, null, FILENAME);
  renewalRouter = null;
}

try {
  settingsRouter = require('./routes/settings');
  logger.debug('Loaded settings router', null, FILENAME);
} catch (error) {
  logger.error(`Failed to load settings router: ${error.message}`, null, FILENAME);
  settingsRouter = null;
}

// Filesystem routes
try {
  filesystemRouter = require('./routes/filesystem');
  logger.debug('Loaded filesystem router', null, FILENAME);
} catch (error) {
  logger.error('Error loading filesystem router:', error, FILENAME);
  filesystemRouter = null;
}

// Filesystem routes
try {
  authRouter = require('./routes/auth');
  logger.debug('Loaded authentication router', null, FILENAME);
} catch (error) {
  logger.error('Error loading authentication router:', error, FILENAME);
  filesystemRouter = null;
}

try {
  // Public routes (no auth required)
  publicRouter = require('./routes/public');
  logger.debug('Loaded public router', null, FILENAME);
} catch (error) {
  logger.error('Error loading public router:', error, FILENAME);
  filesystemRouter = null;
}
try {
  // Setup routes (before auth middleware is applied)
  setupRouter = require('./routes/setup');
  logger.debug('Loaded setup routes', null, FILENAME);
} catch (error) {
  logger.error('Error loading setup router:', error, FILENAME);
  filesystemRouter = null;
}
try {
  // Setup routes (before auth middleware is applied)
  integrationsRouter = require('./routes/integrations');
  logger.debug('Loaded NPM integrations routes', null, FILENAME);
} catch (error) {
  logger.error('Error loading NPM integrations router:', error, FILENAME);
  integrationsRouter = null;
}
try {
  // Setup routes (before auth middleware is applied)
  activityRoutes = require('./routes/activity');
  logger.debug('Loaded activity routes', null, FILENAME);
} catch (error) {
  logger.error('Error loading activity router:', error, FILENAME);
  activityRoutes = null;
}

/**
 * Register all API routes
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

  // Set up OpenAPI validation if available
  if (swaggerUi && OpenApiValidator && yaml) {
    try {
      // Load OpenAPI spec
      const apiSpecPath = path.join(__dirname, 'openapi.yaml');

      // Make sure the file exists
      if (!fs.existsSync(apiSpecPath)) {
        logger.error(`OpenAPI spec file not found at: ${apiSpecPath}`, null, FILENAME);
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
          logger.info('OpenAPI validation middleware installed', null, FILENAME);
        } catch (validatorError) {
          // Fall back to async if needed
          logger.warn('Using async OpenAPI validator initialization', null, FILENAME);
          new OpenApiValidator({
            apiSpec: apiSpecPath,
            validateRequests: true,
            validateResponses: false
          }).install(apiRouter).then(() => {
            logger.info('OpenAPI validation middleware installed asynchronously', null, FILENAME);
          }).catch(err => {
            logger.error('Failed to install OpenAPI validation middleware', err, FILENAME);
          });
        }
      }
    } catch (error) {
      logger.error(`Error setting up OpenAPI: ${error.message}`, null, FILENAME);
    }
  } else {
    logger.warn('OpenAPI dependencies not available. API documentation and validation are disabled.', "swaggerUi: " + swaggerUi + ", expressOpenApiValidator: " + expressOpenApiValidator + ", OpenApiValidator: " + OpenApiValidator + ", yaml: " + yaml, null, FILENAME);

    // Add a placeholder route for docs when Swagger is unavailable
    apiRouter.get('/docs', (req, res) => {
      res.send('API documentation is not available. Missing dependencies: swagger-ui-express, express-openapi-validator, or js-yaml.');
    });
  }


  // Public routes (no auth required)
  if (publicRouter) {
    apiRouter.use('/public', publicRouter(deps));
    logger.debug('Registered public routes', null, FILENAME);
  } else {
    logger.warn('Public routes not available', null, FILENAME);
    apiRouter.use('/public', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }

  // Setup routes (before auth middleware is applied)
  if (setupRouter) {
    apiRouter.use('/setup', setupRouter(deps));
    logger.debug('Registered setup routes', null, FILENAME);
  } else {
    logger.warn('Setup routes not available', null, FILENAME);
    apiRouter.use('/setup', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }

  // Auth routes - ensure these are registered directly
  if (authRouter) {
    apiRouter.use('/auth', authRouter({
      authMiddleware: deps.authMiddleware,
      userManager: deps.userManager
    }));
    logger.debug('Registered authentication routes', null, FILENAME);
  } else {
    logger.warn('Authentication routes not available', null, FILENAME);
    apiRouter.use('/auth', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }

  // Register API routes with safety checks
  if (certificatesRouter) {
    apiRouter.use('/certificates', certificatesRouter(deps));
    logger.debug('Registered certificates routes', null, FILENAME);
  } else {
    logger.warn('Certificates routes not available', null, FILENAME);
    apiRouter.use('/certificates', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }

  if (caRouter) {
    apiRouter.use('/ca', caRouter(deps));
    logger.debug('Registered CA routes', null, FILENAME);
  } else {
    logger.warn('CA routes not available', null, FILENAME);
    apiRouter.use('/ca', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }

  if (securityRouter) {
    apiRouter.use('/security', securityRouter(deps));
    logger.debug('Registered security routes', null, FILENAME);
  } else {
    logger.warn('Security routes not available', null, FILENAME);
    apiRouter.use('/security', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }

  if (renewalRouter) {
    apiRouter.use('/renewal', renewalRouter(deps));
    logger.debug('Registered renewal routes', null, FILENAME);
  } else {
    logger.warn('Renewal routes not available', null, FILENAME);
    apiRouter.use('/renewal', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }

  if (settingsRouter) {
    apiRouter.use('/settings', settingsRouter(deps));
    logger.debug('Registered settings routes', null, FILENAME);
  } else {
    logger.warn('Settings routes not available', null, FILENAME);
    apiRouter.use('/settings', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }

  if(integrationsRouter) {
    apiRouter.use('/integrations', integrationsRouter(deps));
    logger.debug('Registered NPM integrations routes', null, FILENAME);
  } else {
    logger.warn('NPM integrations routes not available', null, FILENAME);
    apiRouter.use('/integrations', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }

  if (filesystemRouter) {
    apiRouter.use('/filesystem', filesystemRouter({
      fileSystemService: deps.fileSystemService, // Make sure the name matches
      logger
    }));
    logger.debug('Registered filesystem routes', null, FILENAME);
  } else {
    logger.warn('Filesystem routes not available', null, FILENAME);
    apiRouter.use('/filesystem', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }

  // For Docker routes
  if (dockerRoutes) {
    apiRouter.use('/docker', dockerRoutes({
      dockerService: deps.dockerService
    }));
    logger.debug('Registered Docker routes', null, FILENAME);
  } else {
    logger.warn('Docker routes not available', null, FILENAME);
    apiRouter.use('/docker', (req, res) => res.status(503).json({ error: 'Service unavailable' }));
  }

  // Activity routes
  const activityRouter = activityRoutes({
    activityService: deps.activityService,
    logger
  });

  apiRouter.use('/activity', activityRouter);
  logger.debug('Registered activity routes', null, FILENAME);

  // Apply auth middleware to all routes except /setup and /public
  apiRouter.use((req, res, next) => {
    if (req.path.startsWith('/setup/') || req.path.startsWith('/public/')) {
      return next();
    }
    deps.authMiddleware.authenticate(req, res, next);
  });

  // Logs routes
  const logsRouter = logsRoutes({
    logsService: deps.logsService,
    logger
  });

  apiRouter.use('/logs', logsRouter);
  logger.debug('Registered logs routes', null, FILENAME);

  if (logger.isLevelEnabled('fine', FILENAME)) {
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

    logger.fine('Registered API routes', routes, FILENAME);
  }

  // Error handler for OpenAPI validation errors
  apiRouter.use((err, req, res, next) => {
    logger.error('API error', err, FILENAME);

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