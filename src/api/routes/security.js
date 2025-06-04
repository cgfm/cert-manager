/**
 * Security router for handling encryption key rotation
 * @module api/routes/security
 * @requires express
 * @requires services/logger
 * @version 0.0.2
 * @license MIT
 * @author Christian Meiners
 * @description This module exports a function that initializes an Express router for handling security-related requests.
 */
const express = require('express');
const logger = require('../../services/logger');

const FILENAME = 'api/routes/security.js';

/**
 * Initialize the security router with dependencies
 * @param {Object} deps - Dependencies
 * @param {CertificateManager} deps.certificateManager - Certificate manager instance
 * @param {ActivityService} deps.activityService - Activity service instance
 * @returns {express.Router} Express router
 */
function initSecurityRouter(deps) {
  const router = express.Router();
  const { certificateManager, activityService } = deps;

  // Rotate encryption key for passphrases
  router.post('/rotate-encryption-key', async (req, res) => {
    try {
      const success = certificateManager.rotateEncryptionKey();
      
      if (!success) {
        return res.status(500).json({ 
          message: 'Failed to rotate encryption key', 
          statusCode: 500 
        });
      }

      // Log activity
      try {
        if (activityService && typeof activityService.addActivity === 'function') {
          await activityService.addActivity({
            action: 'Rotated encryption key for stored passphrases',
            type: 'security',
            target: 'encryption-key',
            metadata: {
              operation: 'key-rotation',
              timestamp: new Date().toISOString()
            }
          });
          logger.info('Logged encryption key rotation activity', null, FILENAME);
        } else {
          logger.debug('Activity logging skipped: service not available or missing addActivity function', null, FILENAME);
        }
      } catch (activityError) {
        logger.warn('Failed to log encryption key rotation activity:', activityError, FILENAME);
      }
      
      logger.info('Encryption key rotated successfully', null, FILENAME);
      res.json({ 
        success: true,
        message: 'Encryption key rotated successfully'
      });
    } catch (error) {
      logger.error('Error rotating encryption key:', error, FILENAME);
      
      // Log failed attempt
      try {
        if (activityService && typeof activityService.addActivity === 'function') {
          await activityService.addActivity({
            action: 'Failed to rotate encryption key',
            type: 'security',
            target: 'encryption-key',
            metadata: {
              operation: 'key-rotation',
              error: error.message,
              timestamp: new Date().toISOString()
            }
          });
        }
      } catch (activityError) {
        logger.warn('Failed to log encryption key rotation failure activity:', activityError, FILENAME);
      }

      res.status(500).json({ 
        message: 'Failed to rotate encryption key', 
        statusCode: 500 
      });
    }
  });

  return router;
}

module.exports = initSecurityRouter;