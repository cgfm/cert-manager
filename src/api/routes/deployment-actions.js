/**
 * Deployment Actions Router
 */
const express = require('express');
const logger = require('../../services/logger');
const crypto = require('crypto');

const FILENAME = 'api/routes/deployment-actions.js';

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
    logger.debug(`API received GET request for /api/certificates/${req.params.fingerprint}/deploy-actions`, null, FILENAME);
    try {
      const { fingerprint } = req.params;
      const cert = certificateManager.getCertificate(fingerprint);

      if (!cert) {
        return res.status(404).json({ error: 'Certificate not found' });
      }

      // Access deployment actions from the consistent structure
      const deployActions = cert._config?.deployActions || [];
      if (logger.isLevelEnabled('fine', FILENAME)) {
        logger.fine(`Found ${deployActions.length} deployment actions for certificate: ${fingerprint}`, deployActions, FILENAME);
      } else {
        logger.debug(`Found ${deployActions.length} deployment actions for certificate: ${fingerprint}`, null, FILENAME);
      }
      res.json(deployActions);
    } catch (error) {
      logger.error('Error getting deployment actions:', error, FILENAME);
      res.status(500).json({ error: 'Failed to get deployment actions' });
    }
  });

  // Add a new deployment action
  router.post('/', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      const action = req.body;

      if (!action || !action.type) {
        return res.status(400).json({ success: false, error: 'Action type is required' });
      }

      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ success: false, error: 'Certificate not found' });
      }

      // Ensure _config.deployActions exists
      if (!cert._config) cert._config = {};
      if (!Array.isArray(cert._config.deployActions)) cert._config.deployActions = [];

      // Add action ID if not present
      if (!action.id) {
        action.id = crypto.randomUUID();
      }

      // Add the action to _config.deployActions
      cert._config.deployActions.push(action);

      logger.debug(`Adding deployment action: ${action.type} for certificate: ${fingerprint}`, action, FILENAME);
      
      // Save the updated certificate
      await certificateManager.saveCertificateConfigs();

      // Return success property along with the action
      res.json({
        success: true,
        action: action,
        message: 'Deployment action added successfully'
      });
    } catch (error) {
      logger.error('Error adding deployment action:', error, FILENAME);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to add deployment action',
        message: error.message || 'Unknown error'
      });
    }
  });

  // Update a deployment action
  router.put('/:actionIndex', async (req, res) => {
    try {
      const { fingerprint, actionIndex } = req.params; // Changed from actionId to actionIndex
      const updatedAction = req.body;

      if (!updatedAction || !updatedAction.type) {
        return res.status(400).json({ success: false, error: 'Action type is required' });
      }

      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ success: false, error: 'Certificate not found' });
      }

      // Ensure _config.deployActions exists
      if (!cert._config) cert._config = {};
      if (!Array.isArray(cert._config.deployActions)) cert._config.deployActions = [];

      // Find the action by ID (which is stored in actionIndex parameter)
      const actionId = actionIndex; // This is the UUID coming from the client
      const actionArrayIndex = cert._config.deployActions.findIndex(action => action.id === actionId);

      if (actionArrayIndex === -1) {
        logger.warn(`Deployment action with ID ${actionId} not found for certificate ${fingerprint}`, null, FILENAME);
        return res.status(404).json({ success: false, error: 'Deployment action not found' });
      }

      // Update the action with the new properties
      cert._config.deployActions[actionArrayIndex] = {
        ...cert._config.deployActions[actionArrayIndex],
        ...updatedAction,
        id: actionId // Ensure ID remains the same
      };

      logger.debug(`Updating deployment action at index ${actionArrayIndex} with ID ${actionId}:`, updatedAction, FILENAME);

      // Save the updated certificate
      await certificateManager.saveCertificateConfigs();

      // Return success property along with the updated action
      res.json({
        success: true,
        action: cert._config.deployActions[actionArrayIndex],
        message: 'Deployment action updated successfully'
      });
    } catch (error) {
      logger.error('Error updating deployment action:', error, FILENAME);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update deployment action',
        message: error.message || 'Unknown error'
      });
    }
  });

  // Delete a deployment action
  router.delete('/:actionIndex', async (req, res) => {
    try {
      const { fingerprint, actionIndex } = req.params; // Changed from actionId to actionIndex

      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({ error: 'Certificate not found' });
      }

      // Check if deployActions exists
      if (!cert._config || !Array.isArray(cert._config.deployActions)) {
        return res.status(404).json({ error: 'No deployment actions found' });
      }

      // Find the action by ID (which is stored in actionIndex parameter)
      const actionId = actionIndex; // This is the UUID coming from the client
      const actionArrayIndex = cert._config.deployActions.findIndex(action => action.id === actionId);

      if (actionArrayIndex === -1) {
        logger.warn(`Deployment action with ID ${actionId} not found for certificate ${fingerprint}`, null, FILENAME);
        return res.status(404).json({ error: 'Deployment action not found' });
      }

      // Remove the action
      cert._config.deployActions.splice(actionArrayIndex, 1);

      // Save the updated certificate
      await certificateManager.saveCertificateConfigs();

      res.json({ 
        success: true, 
        message: 'Deployment action deleted',
        remainingActions: cert._config.deployActions.length
      });
    } catch (error) {
      logger.error('Error deleting deployment action:', error, FILENAME);
      res.status(500).json({ error: 'Failed to delete deployment action' });
    }
  });

  // Test a deployment action
  router.post('/:actionIndex/test', async (req, res) => {
    try {
      const { fingerprint, actionIndex } = req.params;
      const index = parseInt(actionIndex, 10);
      logger.debug(`API received POST request for /api/certificates/${fingerprint}/deploy-actions/${actionIndex}/test with request params:`, req.params, FILENAME);

      if (isNaN(index)) {
        return res.status(400).json({
          message: 'Invalid action index',
          statusCode: 400
        });
      }

      // Get certificate
      const cert = await certificateManager.getCertificate(fingerprint);
      if (!cert) {
        return res.status(404).json({
          message: `Certificate with fingerprint ${fingerprint} not found`,
          statusCode: 404
        });
      }

      // Use the same approach to get deployActions as in the GET handler
      let deployActions = [];

      // Check if deployActions is in cert._config
      if (cert._config && Array.isArray(cert._config.deployActions)) {
        deployActions = cert._config.deployActions;
        logger.debug(`Found deployActions in cert._config.deployActions: ${deployActions.length} actions`, null, FILENAME);
      }
      // Fallback to cert.config.deployActions if available
      else if (cert.config && Array.isArray(cert.config.deployActions)) {
        deployActions = cert.config.deployActions;
        logger.debug(`Found deployActions in cert.config.deployActions: ${deployActions.length} actions`, null, FILENAME);
      }

      // Check if action exists
      if (!deployActions || !deployActions[index]) {
        logger.error(`Deployment action with index ${index} not found. Found ${deployActions?.length || 0} actions`, null, FILENAME);
        return res.status(404).json({
          message: `Deployment action with index ${index} not found`,
          statusCode: 404
        });
      }

      const action = deployActions[index];
      logger.debug(`Testing deployment action at index ${index}:`, action, FILENAME);

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
      logger.error(`Error testing deployment action for ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        success: false,
        message: `Failed to test deployment action: ${error.message}`,
        statusCode: 500
      });
    }
  });

  // Execute all deployment actions
  router.post('/execute', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      logger.debug(`API received POST request for /api/certificates/${fingerprint}/deploy-actions/execute.`, null, FILENAME);

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
        logger.debug(`Found deployActions in cert._config.deployActions: ${deployActions.length} actions`, null, FILENAME);
      }
      // Fallback to cert.config.deployActions if available
      else if (Array.isArray(cert.config.deployActions)) {
        deployActions = cert.config.deployActions;
        logger.debug(`Found deployActions in cert.config.deployActions: ${deployActions.length} actions`, null, FILENAME);
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
          logger.error(`Error executing action ${i} (${action.name}):`, actionError, FILENAME);
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
      logger.error(`Error executing deployment actions for ${req.params.fingerprint}:`, error, FILENAME);
      res.status(500).json({
        success: false,
        message: `Failed to execute deployment actions: ${error.message}`,
        statusCode: 500
      });
    }
  });

  /**
   * Reorder deployment actions
   */
  router.post('/reorder', async (req, res) => {
    try {
      const { fingerprint } = req.params;
      const { order } = req.body;

      logger.debug(`API received POST request to reorder deployment actions for certificate: ${fingerprint}`,
        { orderRequest: order }, FILENAME);

      // Validate order array
      if (!Array.isArray(order)) {
        return res.status(400).json({
          success: false,
          message: 'Order must be an array of action indices',
          statusCode: 400
        });
      }

      // Get certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        logger.warn(`Certificate not found: ${fingerprint}`, null, FILENAME);
        return res.status(404).json({
          success: false,
          message: 'Certificate not found',
          statusCode: 404
        });
      }

      // Get current deploy actions using the same approach as in other methods
      let deployActions = [];

      // Check if deployActions is in cert._config
      if (cert._config && Array.isArray(cert._config.deployActions)) {
        deployActions = [...cert._config.deployActions];
      }
      // Fallback to cert.config.deployActions if available
      else if (Array.isArray(cert.config.deployActions)) {
        deployActions = [...cert.config.deployActions];
      }

      // Log current state for debugging
      logger.debug(`Current deployActions: ${deployActions.length}, order indices: ${JSON.stringify(order)}`, null, FILENAME);

      // Validate indices more permissively - just make sure they're valid integers within range
      const invalidIndices = order.filter(index =>
        !Number.isInteger(index) || index < 0 || index >= deployActions.length
      );

      if (invalidIndices.length > 0) {
        logger.warn(`Invalid action indices in reorder request: ${JSON.stringify(invalidIndices)}`, null, FILENAME);
        return res.status(400).json({
          success: false,
          message: `Invalid action indices: ${invalidIndices.join(', ')}`,
          statusCode: 400
        });
      }

      // Check if the order contains the right number of elements
      if (order.length !== deployActions.length) {
        logger.warn(`Order length (${order.length}) doesn't match actions length (${deployActions.length})`, null, FILENAME);
        return res.status(400).json({
          success: false,
          message: `Order length (${order.length}) doesn't match actions length (${deployActions.length})`,
          statusCode: 400
        });
      }

      // Create new array based on order
      const newActions = order.map(index => deployActions[index]);

      // Log what we're about to save
      logger.debug(`Reordering actions from [${deployActions.map(a => a.name || a.type).join(', ')}] to [${newActions.map(a => a.name || a.type).join(', ')}]`, null, FILENAME);

      // Update certificate using the sync method
      await certificateManager.updateCertificateConfigAndSync(fingerprint, {
        deployActions: newActions
      });

      logger.info(`Reordered deployment actions for certificate: ${fingerprint}`, null, FILENAME);

      return res.json({
        success: true,
        message: 'Deployment actions reordered successfully',
        actions: newActions
      });
    } catch (error) {
      logger.error(`Error reordering deployment actions: ${error.message}`, error, FILENAME);

      return res.status(500).json({
        success: false,
        message: `Failed to reorder deployment actions: ${error.message}`,
        statusCode: 500
      });
    }
  });

  /**
   * Toggle deployment action enabled/disabled state
   */
  router.post('/:actionIndex/toggle', async (req, res) => {
    try {
      const { fingerprint, actionIndex } = req.params;
      const { enabled } = req.body;

      logger.debug(`API received POST request to toggle deployment action ${actionIndex} for certificate: ${fingerprint}`,
        { enabled }, FILENAME);

      // Validate index
      const index = parseInt(actionIndex, 10);
      if (isNaN(index) || index < 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid action index',
          statusCode: 400
        });
      }

      // Check if enabled is boolean
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'Enabled status must be a boolean',
          statusCode: 400
        });
      }

      // Get certificate
      const cert = certificateManager.getCertificate(fingerprint);
      if (!cert) {
        logger.warn(`Certificate not found: ${fingerprint}`, null, FILENAME);
        return res.status(404).json({
          success: false,
          message: 'Certificate not found',
          statusCode: 404
        });
      }

      // Get current deploy actions
      let actions = [];

      // Check if deployActions is in cert._config
      if (cert._config && Array.isArray(cert._config.deployActions)) {
        actions = [...cert._config.deployActions];
      }
      // Fallback to cert.config.deployActions if available
      else if (Array.isArray(cert.config.deployActions)) {
        actions = [...cert.config.deployActions];
      }

      // Check if action exists
      if (index >= actions.length) {
        return res.status(404).json({
          success: false,
          message: 'Action not found',
          statusCode: 404
        });
      }

      // Update action
      actions[index].enabled = enabled;

      // Save changes
      await certificateManager.updateCertificateConfigAndSync(fingerprint, {
        deployActions: actions
      });

      logger.info(`Toggled deployment action ${index} to ${enabled ? 'enabled' : 'disabled'} for certificate: ${fingerprint}`,
        null, FILENAME);

      return res.json({
        success: true,
        message: `Action ${enabled ? 'enabled' : 'disabled'} successfully`,
        action: actions[index]
      });
    } catch (error) {
      logger.error(`Error toggling deployment action: ${error.message}`, error, FILENAME);

      return res.status(500).json({
        success: false,
        message: `Failed to toggle deployment action: ${error.message}`,
        statusCode: 500
      });
    }
  });


  return router;
}

module.exports = initDeploymentActionsRouter;