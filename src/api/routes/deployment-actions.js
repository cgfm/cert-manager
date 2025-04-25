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
      logger.debug(`API received GET request for /api/certificates/${fingerprint}/deploy-actions.`);

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
      
      logger.debug(`API received POST request for /api/certificates/${fingerprint}/deploy-actions with action data:`, actionData);

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
      
      let deployActions = [];
      
      // Check if deployActions is in cert._config
      if (cert._config && Array.isArray(cert._config.deployActions)) {
        deployActions = cert._config.deployActions;
        logger.debug(`Found deployActions in cert._config.deployActions: ${deployActions.length} actions`);
      }
      // Fallback to cert.deployActions if available
      else if (Array.isArray(cert.deployActions)) {
        deployActions = cert.deployActions;
        logger.debug(`Found deployActions in cert.deployActions: ${deployActions.length} actions`);
      }
      // Otherwise, initialize as empty array
      else {
        logger.debug('No deployActions found, initializing as empty array');
      }
      
      // Add the new action
      deployActions.push(actionData);
      logger.debug(`Added new action, now have ${deployActions.length} actions`);
      
      // Update the certificate with the new deployActions
      // The key insight: need to update _config.deployActions, not deployActions directly
      await certificateManager.updateCertificateConfig(fingerprint, {
        deployActions: deployActions
      });
      
      // Verify the update worked
      const updatedCert = certificateManager.getCertificate(fingerprint);
      const updatedActions = updatedCert._config ? updatedCert._config.deployActions : updatedCert.deployActions;
      logger.debug(`After update, certificate has ${updatedActions ? updatedActions.length : 0} actions`);
      
      // Return success with the action data
      res.json({ 
        success: true,
        message: 'Deployment action added successfully',
        action: actionData
      });
    } catch (error) {
      logger.error(`Error adding deployment action: ${error.message}`, error);
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
      logger.debug(`API received POST request for /api/certificates/${fingerprint}/deploy-actions/${actionIndex}/test with request params:`, req.params);

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
      logger.debug(`API received DELETE request for /api/certificates/${fingerprint}/deploy-actions/${actionIndex}.`);

      if (isNaN(index)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid action index',
          statusCode: 400 
        });
      }
      
      // Get certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ 
          success: false,
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404 
        });
      }
      
      // Get deployment actions using the same approach as in POST
      let deployActions = [];
      
      // Check if deployActions is in cert._config
      if (cert._config && Array.isArray(cert._config.deployActions)) {
        deployActions = cert._config.deployActions;
        logger.debug(`Found deployActions in cert._config.deployActions: ${deployActions.length} actions`);
      }
      // Fallback to cert.deployActions if available
      else if (Array.isArray(cert.deployActions)) {
        deployActions = cert.deployActions;
        logger.debug(`Found deployActions in cert.deployActions: ${deployActions.length} actions`);
      }
      // Otherwise, initialize as empty array
      else {
        logger.debug('No deployActions found, initializing as empty array');
        return res.status(404).json({ 
          success: false,
          message: `Deployment action with index ${index} not found`,
          statusCode: 404 
        });
      }
      
      // Check if action exists
      if (index < 0 || index >= deployActions.length) {
        return res.status(404).json({ 
          success: false,
          message: `Deployment action with index ${index} not found`,
          statusCode: 404 
        });
      }
      
      // Get the action being removed for logging
      const actionBeingRemoved = deployActions[index];
      
      // Remove the action
      deployActions.splice(index, 1);
      logger.debug(`Removed action at index ${index}, now have ${deployActions.length} actions`);
      
      // Save updated certificate configuration
      await certificateManager.updateCertificateConfig(fingerprint, {
        deployActions: deployActions
      });
      
      // Verify the update worked
      const updatedCert = certificateManager.getCertificate(fingerprint);
      const updatedActions = updatedCert._config ? updatedCert._config.deployActions : updatedCert.deployActions;
      logger.debug(`After update, certificate has ${updatedActions ? updatedActions.length : 0} actions`);
      
      res.json({ 
        success: true,
        message: 'Deployment action removed',
        removedAction: actionBeingRemoved,
        remainingActions: deployActions.length
      });
    } catch (error) {
      logger.error(`Error removing deployment action for ${req.params.fingerprint}:`, error);
      res.status(500).json({ 
        success: false,
        message: `Failed to remove deployment action: ${error.message}`,
        statusCode: 500 
      });
    }
  });
  
  // Execute all deployment actions
  router.post('/execute', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      logger.debug(`API received POST request for /api/certificates/${fingerprint}/deploy-actions/execute.`);

      // Get certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ 
          success: false,
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404 
        });
      }
      
      // Get deployment actions using the same approach
      let deployActions = [];
      
      // Check if deployActions is in cert._config
      if (cert._config && Array.isArray(cert._config.deployActions)) {
        deployActions = cert._config.deployActions;
        logger.debug(`Found deployActions in cert._config.deployActions: ${deployActions.length} actions`);
      }
      // Fallback to cert.deployActions if available
      else if (Array.isArray(cert.deployActions)) {
        deployActions = cert.deployActions;
        logger.debug(`Found deployActions in cert.deployActions: ${deployActions.length} actions`);
      }
      
      // Check if certificate has deployment actions
      if (!deployActions || deployActions.length === 0) {
        return res.json({
          success: true,
          message: 'No deployment actions to execute',
          actionsExecuted: 0
        });
      }
      
      // Execute deployment actions
      const results = [];
      let executedCount = 0;
      let successCount = 0;
      
      // Execute each action
      for (let i = 0; i < deployActions.length; i++) {
        const action = deployActions[i];
        try {
          // Use deploy service to execute the action
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
              result = { success: false, message: `Unknown action type: ${action.type}` };
              break;
          }
          
          // Track execution
          executedCount++;
          if (result && result.success) {
            successCount++;
          }
          
          // Add result to results array
          results.push({
            index: i,
            name: action.name,
            type: action.type,
            success: result && result.success ? true : false,
            message: result ? result.message : 'No result returned'
          });
          
        } catch (actionError) {
          logger.error(`Error executing action ${i} (${action.name}):`, actionError);
          results.push({
            index: i,
            name: action.name,
            type: action.type,
            success: false,
            message: actionError.message || 'Unknown error'
          });
        }
      }
      
      // Return the results
      res.json({
        success: true,
        message: `Executed ${successCount} of ${executedCount} deployment actions successfully`,
        actionsExecuted: executedCount,
        actionsSucceeded: successCount,
        results: results
      });
      
    } catch (error) {
      logger.error(`Error executing deployment actions for ${req.params.fingerprint}:`, error);
      res.status(500).json({ 
        success: false,
        message: `Failed to execute deployment actions: ${error.message}`,
        statusCode: 500 
      });
    }
  });

  // Update a deployment action
  router.put('/:actionIndex', async (req, res) => {
    try {
      const { fingerprint, actionIndex } = req.params;
      const actionData = req.body;
      logger.debug(`API received PUT request for /api/certificates/${fingerprint}/deploy-actions/${actionIndex} with action data:`, actionData);

      if (!actionData || !actionData.type) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing action type or invalid action data',
        });
      }
      
      // Get certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ 
          success: false,
          message: `Certificate not found with fingerprint: ${fingerprint}` 
        });
      }
      
      // Get deployment actions using the same approach as in POST
      let deployActions = [];
      
      // Check if deployActions is in cert._config
      if (cert._config && Array.isArray(cert._config.deployActions)) {
        deployActions = cert._config.deployActions;
        logger.debug(`Found deployActions in cert._config.deployActions: ${deployActions.length} actions`);
      }
      // Fallback to cert.deployActions if available
      else if (Array.isArray(cert.deployActions)) {
        deployActions = cert.deployActions;
        logger.debug(`Found deployActions in cert.deployActions: ${deployActions.length} actions`);
      }
      // Otherwise, initialize as empty array
      else {
        logger.debug('No deployActions found, initializing as empty array');
      }
      
      // Check if action index is valid
      const index = parseInt(actionIndex, 10);
      if (isNaN(index) || index < 0 || index >= deployActions.length) {
        return res.status(404).json({
          success: false,
          message: `Invalid action index: ${actionIndex}`
        });
      }
      
      // Update the action at the specified index
      deployActions[index] = actionData;
      logger.debug(`Updated action at index ${index}, now have ${deployActions.length} actions`);
      
      // Save the updated  configurationcertificate configuration
      await certificateManager.updateCertificateConfig(fingerprint, {
        deployActions: deployActions
      });
      
      // Verify the update worked
      const updatedCert = certificateManager.getCertificate(fingerprint);
      const updatedActions = updatedCert._config ? updatedCert._config.deployActions : updatedCert.deployActions;
      logger.debug(`After update, certificate has ${updatedActions ? updatedActions.length : 0} actions`);
      
      // Log the successful update
      logger.info(`Deployment action updated at index ${index} for certificate`, {
        fingerprint,
        actionType: actionData.type
      });
      
      // Return success response with the updated action
      res.json({ 
        success: true,
        message: 'Deployment action updated successfully',
        action: actionData
      });
      
    } catch (error) {
      logger.error(`Error updating deployment action for ${req.params.fingerprint}:`, error);
      res.status(500).json({ 
        success: false,
        message: `Failed to update deployment action: ${error.message}`
      });
    }
  });
  
  return router;
}

module.exports = initDeploymentActionsRouter;