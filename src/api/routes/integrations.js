const express = require('express');
const logger = require('../../services/logger');

const FILENAME = 'api/routes/integrations.js';

/**
 * Initialize the integrations router
 * @param {Object} deps - Dependencies
 * @returns {Object} Express router
 */
function initIntegrationsRouter(deps) {
    const router = express.Router();
    const { npmIntegrationService, configService } = deps;

    // Check if NPM integration service is available
    if (!npmIntegrationService) {
        logger.warn('NPM integration service not available', null, FILENAME);
    }

    /**
     * Save NPM connection settings to config
     * @param {Object} settings - NPM connection settings
     * @returns {Promise<boolean>} Success status
     */
    async function saveNpmSettings(settings) {
        try {
            if (!configService) {
                logger.error('Config service not available', null, FILENAME);
                return false;
            }

            // Get current deployment settings
            const deploymentSettings = configService.get().deployment || {};
            
            // Update NPM settings
            deploymentSettings.nginxProxyManager = {
                ...(deploymentSettings.nginxProxyManager || {}),
                ...settings
            };
            
            // Save updated settings
            await configService.updateDeploymentSettings(deploymentSettings);
            return true;
        } catch (error) {
            logger.error(`Error saving NPM settings: ${error.message}`, error, FILENAME);
            return false;
        }
    }

    /**
     * Get current NPM settings from config
     * @returns {Object} NPM settings
     */
    function getNpmSettings() {
        try {
            if (!configService) {
                logger.error('Config service not available', null, FILENAME);
                return {};
            }

            const deploymentSettings = configService.get().deployment || {};
            logger.debug('Current NPM settings', deploymentSettings.nginxProxyManager, FILENAME);
            return deploymentSettings.nginxProxyManager || {};
        } catch (error) {
            logger.error(`Error getting NPM settings: ${error.message}`, error, FILENAME);
            return {};
        }
    }

    /**
     * Extract URL components into settings object
     * @param {string} apiUrl - Full NPM API URL
     * @returns {Object} Settings object with host, port, useHttps
     */
    function parseApiUrl(apiUrl) {
        try {
            if (!apiUrl) return null;
            
            const url = new URL(apiUrl);
            return {
                host: url.hostname,
                port: url.port || (url.protocol === 'https:' ? '443' : '80'),
                useHttps: url.protocol === 'https:'
            };
        } catch (error) {
            logger.error(`Error parsing API URL: ${error.message}`, error, FILENAME);
            return null;
        }
    }

    // NPM API routes
    
    /**
     * Check NPM connection
     * POST /api/integrations/npm/check-connection
     */
    router.post('/npm/check-connection', async (req, res) => {
        try {
            logger.debug('POST /api/integrations/npm/check-connection', req.body, FILENAME);
            const { apiUrl } = req.body;

            if (!npmIntegrationService) {
                return res.status(500).json({
                    success: false,
                    message: 'NPM integration service not available'
                });
            }
            
            // Parse API URL into settings
            const urlSettings = parseApiUrl(apiUrl);
            if (!urlSettings && !apiUrl) {
                return res.status(400).json({
                    success: false,
                    message: 'API URL is required'
                });
            }
            
            // Save URL settings to config (without credentials)
            if (urlSettings) {
                await saveNpmSettings(urlSettings);
            }
            
            // Test connection with parsed settings
            const result = await npmIntegrationService.testConnection(urlSettings);
            
            return res.json(result);
        } catch (error) {
            logger.error(`Error in check-connection: ${error.message}`, error, FILENAME);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    /**
     * Request NPM authentication token
     * POST /api/integrations/npm/request-token
     */
    router.post('/npm/request-token', async (req, res) => {
        try {
            logger.debug('POST /api/integrations/npm/request-token', null, FILENAME); // Don't log credentials
            const { apiUrl, email, password } = req.body;

            if (!npmIntegrationService) {
                return res.status(500).json({
                    success: false,
                    message: 'NPM integration service not available'
                });
            }
            
            if (!email || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Email and password are required'
                });
            }
            
            // Get current settings or parse from URL
            let settings = getNpmSettings();
            
            // If API URL provided, parse and use those settings
            if (apiUrl) {
                const urlSettings = parseApiUrl(apiUrl);
                if (urlSettings) {
                    settings = { ...settings, ...urlSettings };
                }
            }
            
            // Add credentials to settings
            settings.username = email;
            settings.password = password;
            
            // Request token
            const result = await npmIntegrationService.getAuthToken(settings);
            
            if (result.success && result.token) {
                // Save token and settings (without password)
                const { password, ...settingsToSave } = settings;
                settingsToSave.accessToken = result.token;
                settingsToSave.tokenExpiry = result.tokenExpiry;
                
                await saveNpmSettings(settingsToSave);
                
                // Don't return the token to the client
                return res.json({
                    success: true,
                    message: 'Authentication successful',
                    user: result.user
                });
            }
            
            return res.json(result);
        } catch (error) {
            logger.error(`Error in request-token: ${error.message}`, error, FILENAME);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    /**
     * Validate NPM token
     * GET /api/integrations/npm/validate-token
     */
    router.get('/npm/validate-token', async (req, res) => {
        try {
            logger.debug('GET /api/integrations/npm/validate-token', null, FILENAME);

            if (!npmIntegrationService) {
                return res.status(500).json({
                    success: false,
                    message: 'NPM integration service not available'
                });
            }
            
            // Validate the token
            const result = await npmIntegrationService.validateToken();
            
            return res.json(result);
        } catch (error) {
            logger.error(`Error in validate-token: ${error.message}`, error, FILENAME);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    /**
     * Get NPM certificates
     * GET /api/integrations/npm/certificates
     */
    router.get('/npm/certificates', async (req, res) => {
        try {
            logger.debug('GET /api/integrations/npm/certificates', null, FILENAME);

            if (!npmIntegrationService) {
                return res.status(500).json({
                    success: false,
                    message: 'NPM integration service not available'
                });
            }
            
            // Get certificates
            const result = await npmIntegrationService.getCertificates();
            
            return res.json(result);
        } catch (error) {
            logger.error(`Error in get-certificates: ${error.message}`, error, FILENAME);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    /**
     * Update NPM certificate
     * POST /api/integrations/npm/certificates/:id
     */
    router.post('/npm/certificates/:id', async (req, res) => {
        try {
            logger.debug('POST /api/integrations/npm/certificates/:id', { id: req.params.id }, FILENAME);
            const { id } = req.params;
            const { certData } = req.body;

            if (!npmIntegrationService) {
                return res.status(500).json({
                    success: false,
                    message: 'NPM integration service not available'
                });
            }
            
            if (!id) {
                return res.status(400).json({
                    success: false,
                    message: 'Certificate ID is required'
                });
            }
            
            if (!certData || !certData.certificate || !certData.key) {
                return res.status(400).json({
                    success: false,
                    message: 'Certificate and key data are required'
                });
            }
            
            // Update certificate
            const result = await npmIntegrationService.updateCertificate(id, certData);
            
            return res.json(result);
        } catch (error) {
            logger.error(`Error in update-certificate: ${error.message}`, error, FILENAME);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    /**
     * Get NPM connection status
     * GET /api/integrations/npm/status
     */
    router.get('/npm/status', async (req, res) => {
        try {
            logger.debug('GET /api/integrations/npm/status', null, FILENAME);

            if (!npmIntegrationService) {
                return res.status(500).json({
                    success: false,
                    message: 'NPM integration service not available'
                });
            }
            
            // Get current settings
            const settings = getNpmSettings();
            
            // Check if we have basic settings
            if (!settings.host) {
                return res.json({
                    success: false,
                    message: 'NPM not configured',
                    configured: false
                });
            }
            
            // Check if we have a token
            const hasToken = !!settings.accessToken;
            
            // Validate connection and token
            let connectionStatus = {
                success: false,
                configured: true,
                hasToken,
                connected: false,
                tokenValid: false,
                user: null
            };
            
            // Test the connection
            const connectionResult = await npmIntegrationService.testConnection();
            connectionStatus.connected = connectionResult.success;
            
            // If connected and has token, validate it
            if (connectionStatus.connected && hasToken) {
                const tokenResult = await npmIntegrationService.validateToken();
                connectionStatus.tokenValid = tokenResult.valid;
                connectionStatus.user = tokenResult.user;
                connectionStatus.success = tokenResult.valid;
            }
            
            return res.json(connectionStatus);
        } catch (error) {
            logger.error(`Error in get-status: ${error.message}`, error, FILENAME);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    return router;
}

module.exports = initIntegrationsRouter;