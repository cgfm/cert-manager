/**
 * @fileoverview CA Certificates API Router - Manages Certificate Authority certificate operations
 * @module api/routes/ca
 * @requires express
 * @requires ../../services/logger
 * @version 0.0.2
 * @license MIT
 * @author Christian Meiners
 */

const express = require('express');
const logger = require('../../services/logger');

const FILENAME = 'api/routes/ca.js';

/**
 * Initialize the CA certificates router with required dependencies.
 * Provides endpoints for retrieving and managing Certificate Authority certificates.
 * @param {Object} deps - Dependencies object containing required services
 * @param {Object} deps.certificateManager - Certificate manager instance for CA certificate operations
 * @returns {express.Router} Configured Express router with CA certificate endpoints
 */
function initCARouter(deps) {
  const router = express.Router();
  const { certificateManager } = deps;

  // Get all CA certificates
  router.get('/', async (req, res) => {
    try {
      const caCerts = deps.certificateManager.handleFrontendRefresh({ caOnly:true });
      
      res.json(caCerts);
    } catch (error) {
      logger.error('Error getting CA certificates:', error, FILENAME);
      res.status(500).json({ message: 'Failed to retrieve CA certificates', statusCode: 500 });
    }
  });

  return router;
}

module.exports = initCARouter;