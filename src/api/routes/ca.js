/**
 * CA Certificates API Router
 * This module defines the routes for managing CA certificates.
 * It provides an endpoint to retrieve all CA certificates in the system.
 * @module api/routes/ca
 * @requires express
 * @requires services/logger
 * @version 0.0.2
 * @license MIT
 * @author Christian Meiners
 * @description This module exports a function that initializes an Express router for handling CA certificate-related requests.
 * The router provides a single endpoint to retrieve all CA certificates from the certificate manager.
 */

const express = require('express');
const logger = require('../../services/logger');

/**
 * Initialize the CA certificates router with dependencies
 * @param {Object} deps - Dependencies
 * @param {CertificateManager} deps.certificateManager - Certificate manager instance
 * @returns {express.Router} Express router
 */
function initCARouter(deps) {
  const router = express.Router();
  const { certificateManager } = deps;

  // Get all CA certificates
  router.get('/', async (req, res) => {
    try {
      await certificateManager.loadCertificates();
      const caCerts = certificateManager.getCAcertificates();
      
      const response = caCerts.map(cert => 
        cert.toApiResponse(certificateManager.passphraseManager)
      );
      
      res.json(response);
    } catch (error) {
      logger.error('Error getting CA certificates:', error);
      res.status(500).json({ message: 'Failed to retrieve CA certificates', statusCode: 500 });
    }
  });

  return router;
}

module.exports = initCARouter;