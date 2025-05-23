/**
 * Setup API Routes
 */
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const logger = require('../../services/logger');

const FILENAME = 'api/routes/setup.js';

/**
 * Initialize setup router
 * @param {Object} deps - Dependencies
 * @returns {express.Router} Express router
 */
function initSetupRouter(deps) {
  const { userManager, configService, activityService, authMiddleware } = deps;
  
  // Check if setup is needed
  router.get('/status', async (req, res) => {
    try {
      // If authentication is disabled, report that no setup is needed
      if (authMiddleware && authMiddleware.isAuthDisabled()) {
        logger.debug('Auth is disabled, reporting setup not needed', null, FILENAME);
        return res.json({
          success: true,
          setupNeeded: false,
          authDisabled: true
        });
      }
      
      // Normal check if authentication is enabled
      const setupNeeded = await userManager.isSetupNeeded();
      
      res.json({
        success: true,
        setupNeeded,
        authDisabled: false
      });
    } catch (error) {
      logger.error('Error checking setup status', { error: error.message }, FILENAME);
      res.status(500).json({
        success: false,
        message: 'Error checking setup status'
      });
    }
  });
  
  // Complete setup
  router.post('/complete', async (req, res) => {
    try {
      // Check if setup is already completed
      const setupNeeded = await userManager.isSetupNeeded();
      
      if (!setupNeeded) {
        logger.warn('Setup already completed, rejecting request', null, FILENAME);
        return res.status(400).json({
          success: false,
          message: 'Setup has already been completed'
        });
      }
      
      const { admin, config } = req.body;
      
      // Validate admin user
      if (!admin || !admin.username || !admin.password) {
        return res.status(400).json({
          success: false,
          message: 'Missing admin credentials'
        });
      }
      
      // Validate config
      if (!config || !config.certPath) {
        return res.status(400).json({
          success: false,
          message: 'Missing required configuration'
        });
      }
      
      // Create admin user
      await userManager.createUser({
        username: admin.username,
        password: admin.password,
        name: admin.name || admin.username,
        role: 'admin'
      });
      
      logger.info('Created admin user during setup', { username: admin.username }, FILENAME);
      
      // Generate a secure JWT secret if needed
      const jwtSecret = crypto.randomBytes(64).toString('hex');
      
      // Create new settings object
      const newSettings = {
        certPath: config.certPath,
        port: config.port || 3000,
        // Security settings
        security: {
          disableAuth: false,
          authMode: 'basic',
          jwtSecret: jwtSecret,
          tokenExpiration: '8h'
        }
      };
      
      // Add HTTPS config if enabled
      if (config.enableHttps) {
        newSettings.enableHttps = true;
        newSettings.httpsPort = config.httpsPort || 9443;
        newSettings.httpsCertPath = config.httpsCert;
        newSettings.httpsKeyPath = config.httpsKey;
      }
      
      // Update settings with the correct method
      const configUpdated = configService.updateSettings(newSettings);
      
      if (!configUpdated) {
        throw new Error('Failed to update configuration');
      }
      
      logger.info('Updated configuration during setup', null, FILENAME);
      
      // Create cert directory if it doesn't exist
      try {
        const certPath = config.certPath;
        await fs.mkdir(certPath, { recursive: true });
        logger.info('Created certificates directory', { path: certPath }, FILENAME);
      } catch (error) {
        logger.warn('Error creating certificates directory', { 
          error: error.message, 
          path: config.certPath 
        }, FILENAME);
      }
      
      // Record activity if service is available
      if (activityService) {
        await activityService.recordSystemActivity('setup-complete', {
          username: admin.username,
          certPath: config.certPath
        });
      }
      
      // Mark setup as completed
      await userManager.markSetupCompleted();
      
      // Disable setup mode in the auth middleware
      if (authMiddleware) {
        authMiddleware.setSetupMode(false);
        logger.info('Disabled setup mode in auth middleware', null, FILENAME);
      }
      
      res.json({
        success: true,
        message: 'Setup completed successfully'
      });
    } catch (error) {
      logger.error('Error completing setup', { 
        error: error.message, 
        stack: error.stack 
      }, FILENAME);
      
      res.status(500).json({
        success: false,
        message: `Error during setup: ${error.message}`
      });
    }
  });
  
  return router;
}

module.exports = initSetupRouter;