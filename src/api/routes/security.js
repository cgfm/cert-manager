/**
 * @fileoverview Security API Routes - Encryption and security management endpoints
 * 
 * This module provides endpoints for managing security-related operations:
 * - Encryption key rotation for stored passphrases
 * - Security event logging and audit trails
 * - Certificate security management
 * 
 * All operations are logged for security audit purposes and require
 * appropriate authentication and authorization.
 * 
 * @module api/routes/security
 * @requires express
 * @requires services/logger
 * @author Certificate Manager
 * @since 1.0.0
 */
const express = require('express');
const logger = require('../../services/logger');

const FILENAME = 'api/routes/security.js';

/**
 * Initializes the security router with endpoints for security operations
 * 
 * @param {Object} deps - Required dependencies for security operations
 * @param {Object} deps.certificateManager - Certificate manager for key operations
 * @param {Object} deps.activityService - Activity service for audit logging
 * @returns {express.Router} Configured Express router with security endpoints
 */
function initSecurityRouter(deps) {
  const router = express.Router();
  const { certificateManager, activityService } = deps;

  /**
   * POST /api/security/rotate-encryption-key
   * Rotates the encryption key used for storing certificate passphrases
   * 
   * This security-critical operation:
   * - Generates a new encryption key
   * - Re-encrypts all stored passphrases with the new key
   * - Logs the operation for audit trails
   * - Maintains data integrity throughout the process
   * 
   * @async
   * @param {express.Request} req - Express request object
   * @param {express.Response} res - Express response object
   * @returns {Promise<void>} JSON response confirming key rotation success or failure
   */
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