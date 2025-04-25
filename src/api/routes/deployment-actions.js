/**
 * Deployment Actions Router
 */
const express = require('express');
const logger = require('../../services/logger');

/**
 * Initialize the deployment actions router with dependencies
 * @param {Object} deps - Dependencies
 * @param {CertificateManager} deps.certificateManager - Certificate manager instance
 * @param {Object} deps.deployService - Deploy service instance
 * @returns {express.Router} Express router
 */
function initDeploymentActionsRouter(deps) {
  const router = express.Router({ mergeParams: true });
  const { certificateManager, deployService } = deps;

  // Get all deployment actions for a certificate
  router.get('/', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      
      // Get certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ 
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404 
        });
      }
      
      // Return deployment actions
      res.json(cert.deployActions || []);
    } catch (error) {
      logger.error(`Error getting deployment actions for ${req.params.fingerprint}:`, error);
      res.status(500).json({ 
        message: `Failed to get deployment actions: ${error.message}`,
        statusCode: 500 
      });
    }
  });
  
  // Add a new deployment action
  router.post('/', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      const actionData = req.body;
      
      if (!actionData || !actionData.type) {
        return res.status(400).json({ 
          message: 'Missing action type',
          statusCode: 400 
        });
      }
      
      // Get certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ 
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404 
        });
      }
      
      // Initialize deployActions array if it doesn't exist
      if (!cert.deployActions) {
        cert.deployActions = [];
      }
      
      // Add action to certificate
      cert.deployActions.push(actionData);
      
      // Save updated certificate configuration
      await certificateManager.updateCertificateConfig(fingerprint, {
        deployActions: cert.deployActions
      });
      
      // Return updated list of actions
      res.status(201).json(cert.deployActions);
    } catch (error) {
      logger.error(`Error adding deployment action for ${req.params.fingerprint}:`, error);
      res.status(500).json({ 
        message: `Failed to add deployment action: ${error.message}`,
        statusCode: 500 
      });
    }
  });
  
  // Test a deployment action
  router.post('/:actionIndex/test', async (req, res) => {
    try {
      const { fingerprint, actionIndex } = req.params;
      const index = parseInt(actionIndex, 10);
      
      if (isNaN(index)) {
        return res.status(400).json({ 
          message: 'Invalid action index',
          statusCode: 400 
        });
      }
      
      // Get certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ 
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404 
        });
      }
      
      // Check if action exists
      if (!cert.deployActions || !cert.deployActions[index]) {
        return res.status(404).json({ 
          message: `Deployment action with index ${index} not found`,
          statusCode: 404 
        });
      }
      
      const action = cert.deployActions[index];
      
      // Use deploy service to test the action (simulated execution)
      let result;
      
      switch (action.type) {
        case 'copy':
          result = await deployService.executeCopyAction(cert, action);
          break;
        case 'ssh-copy':
          result = await deployService.executeSshCopyAction(cert, action);
          break;
        case 'command':
          result = await deployService.executeCommandAction(cert, action);
          break;
        case 'docker-restart':
          result = await deployService.executeDockerRestartAction(cert, action);
          break;
        case 'nginx-proxy-manager':
          result = await deployService.executeNginxProxyManagerAction(cert, action);
          break;
        case 'smb-copy':
          result = await deployService.executeSmbCopyAction(cert, action);
          break;
        case 'ftp-copy':
          result = await deployService.executeFtpCopyAction(cert, action);
          break;
        case 'api-call':
          result = await deployService.executeApiCallAction(cert, action);
          break;
        case 'webhook':
          result = await deployService.executeWebhookAction(cert, action);
          break;
        case 'email':
          result = await deployService.executeEmailAction(cert, action);
          break;
        default:
          return res.status(400).json({ 
            message: `Unknown action type: ${action.type}`,
            statusCode: 400 
          });
      }
      
      res.json({
        success: true,
        message: `Test execution completed for ${action.type} action`,
        result
      });
    } catch (error) {
      logger.error(`Error testing deployment action for ${req.params.fingerprint}:`, error);
      res.status(500).json({ 
        success: false,
        message: `Failed to test deployment action: ${error.message}`,
        statusCode: 500 
      });
    }
  });
  
  // Delete a deployment action
  router.delete('/:actionIndex', async (req, res) => {
    try {
      const { fingerprint, actionIndex } = req.params;
      const index = parseInt(actionIndex, 10);
      
      if (isNaN(index)) {
        return res.status(400).json({ 
          message: 'Invalid action index',
          statusCode: 400 
        });
      }
      
      // Get certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ 
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404 
        });
      }
      
      // Check if action exists
      if (!cert.deployActions || !cert.deployActions[index]) {
        return res.status(404).json({ 
          message: `Deployment action with index ${index} not found`,
          statusCode: 404 
        });
      }
      
      // Remove the action
      cert.deployActions.splice(index, 1);
      
      // Save updated certificate configuration
      await certificateManager.updateCertificateConfig(fingerprint, {
        deployActions: cert.deployActions
      });
      
      res.json({ 
        success: true,
        message: 'Deployment action removed',
        remainingActions: cert.deployActions.length
      });
    } catch (error) {
      logger.error(`Error removing deployment action for ${req.params.fingerprint}:`, error);
      res.status(500).json({ 
        message: `Failed to remove deployment action: ${error.message}`,
        statusCode: 500 
      });
    }
  });
  
  // Execute all deployment actions
  router.post('/execute', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      
      // Get certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ 
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404 
        });
      }
      
      // Check if certificate has deployment actions
      if (!cert.deployActions || cert.deployActions.length === 0) {
        return res.json({
          success: true,
          message: 'No deployment actions to execute',
          actionsExecuted: 0
        });
      }
      
      // Execute deployment actions
      const result = await cert.executeDeployActions(deployService);
      
      res.json(result);
    } catch (error) {
      logger.error(`Error executing deployment actions for ${req.params.fingerprint}:`, error);
      res.status(500).json({ 
        success: false,
        message: `Failed to execute deployment actions: ${error.message}`,
        statusCode: 500 
      });
    }
  });

  return router;
}

module.exports = initDeploymentActionsRouter;