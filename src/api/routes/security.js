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

/**
 * Initialize the security router with dependencies
 * @param {Object} deps - Dependencies
 * @param {CertificateManager} deps.certificateManager - Certificate manager instance
 * @returns {express.Router} Express router
 */
function initSecurityRouter(deps) {
  const router = express.Router();
  const { certificateManager } = deps;

  // Rotate encryption key for passphrases
  router.post('/rotate-encryption-key', (req, res) => {
    try {
      const success = certificateManager.rotateEncryptionKey();
      
      if (!success) {
        return res.status(500).json({ message: 'Failed to rotate encryption key', statusCode: 500 });
      }
      
      res.json({ success: true });
    } catch (error) {
      logger.error('Error rotating encryption key:', error);
      res.status(500).json({ message: 'Failed to rotate encryption key', statusCode: 500 });
    }
  });

  return router;
}

module.exports = initSecurityRouter;