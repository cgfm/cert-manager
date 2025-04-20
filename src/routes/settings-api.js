const express = require('express');
const router = express.Router();
const logger = require('../services/logger');
const fs = require('fs');
const path = require('path');

const settingsPath = process.env.SETTINGS_PATH || path.join(process.env.CONFIG_DIR || '/config', 'settings.json');

// Default settings
const defaultSettings = {
    enableHttps: false,
    httpsPort: 4443,
    httpsCertPath: null,
    httpsKeyPath: null,
    openSSLPath: 'openssl',
    caValidityPeriod: {
        rootCA: 3650, // 10 years
        intermediateCA: 1825, // 5 years
        standard: 90   // 3 months
    },
    autoRenewByDefault: true,
    renewDaysBeforeExpiry: 30,
    logLevel: 'info',
    jsonOutput: false,
    enableCertificateBackups: true,
    keepBackupsForever: true,  // Changed default to true
    backupRetention: 90,
    signStandardCertsWithCA: false,  // Default to false for backward compatibility
    enableAutoRenewalJob: true,
    renewalSchedule: '0 0 * * *'  // Daily at midnight
};

let configManager = null;

// Initialize with the config manager
function initialize(configManagerInstance) {
    if (!configManagerInstance) {
        logger.error('No config manager instance provided to settings-api');
        throw new Error('Config manager is required for settings API');
    }
    
    // Store the config manager instance
    configManager = configManagerInstance;
    
    // Log successful initialization
    logger.info('Settings API initialized with config manager');
    
    // Define routes
    
    // GET /api/settings - Get current settings
    router.get('/', (req, res) => {
        logger.info('GET /api/settings');
        const settings = loadSettings();
        res.json(settings);
    });

    // POST /api/settings - Update settings
    router.post('/', (req, res) => {
        logger.info('POST /api/settings', req.body);
        try {
            const newSettings = req.body;
            
            // Validate required fields
            if (newSettings.enableAuth && !newSettings.username) {
                return res.status(400).json({
                    success: false,
                    error: 'Username is required when authentication is enabled'
                });
            }
            
            // Merge with existing settings to handle partial updates
            const currentSettings = loadSettings();
            const mergedSettings = { ...currentSettings, ...newSettings };
            
            // Save settings
            if (saveSettings(mergedSettings)) {
                logger.info('Settings saved successfully');
                res.json({ success: true });
            } else {
                logger.error('Failed to save settings');
                res.status(500).json({
                    success: false,
                    error: 'Failed to save settings'
                });
            }
        } catch (error) {
            logger.error('Error updating settings:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Get global settings
    router.get('/global', (req, res) => {
        try {
            logger.debug('GET /api/settings/global requested');
            
            // Verify configManager is available
            if (!configManager) {
                logger.error('Config manager not available in settings-api');
                return res.status(500).json({ 
                    error: 'Configuration manager not initialized',
                    details: 'The settings API was not properly initialized with a config manager'
                });
            }            

            const settings = configManager.getGlobalDefaults();
            logger.debug('Returning global settings', settings);
            res.json(settings);
        } catch (error) {
            logger.error('Error getting global settings:', error);
            res.status(500).json({ 
                error: 'Failed to get global settings',
                details: error.message
            });
        }
    });
    
    // Save global settings
    router.post('/global', (req, res) => {
        try {
            logger.info('POST /api/settings/global requested');
            
            const settings = req.body;
            logger.info('Saving global settings', settings);
            
            configManager.setGlobalDefaults(settings);
            
            res.json({ success: true });
        } catch (error) {
            logger.error('Error saving global settings:', error);
            res.status(500).json({ 
                error: 'Failed to save global settings',
                details: error.message
            });
        }
    });
    
    // Get certificate-specific settings
    router.get('/cert/:fingerprint', (req, res) => {
        try {
            const { fingerprint } = req.params;
            const certConfig = configManager.getCertConfig(fingerprint);
            res.json(certConfig);
        } catch (error) {
            logger.error(`Error getting certificate config for ${req.params.fingerprint}:`, error);
            res.status(500).json({ error: 'Failed to get certificate configuration' });
        }
    });
    
    // Save certificate-specific settings
    router.post('/cert/:fingerprint', (req, res) => {
        try {
            const { fingerprint } = req.params;
            const certConfig = req.body;
            
            // Save the configuration
            configManager.setCertConfig(fingerprint, certConfig);
            
            logger.info(`Certificate configuration saved for ${fingerprint}`, {
                autoRenew: certConfig.autoRenew,
                renewDaysBeforeExpiry: certConfig.renewDaysBeforeExpiry,
                deployActions: certConfig.deployActions ? certConfig.deployActions.length : 0
            });
            
            res.json({ success: true });
        } catch (error) {
            logger.error(`Error saving certificate config for ${req.params.fingerprint}:`, error);
            res.status(500).json({ error: 'Failed to save certificate configuration' });
        }
    });
    
    return router;
}

/**
 * Load settings from file or create defaults
 * @returns {Object} Settings object
 */
function loadSettings() {
    try {
        logger.debug(`Loading settings from ${settingsPath}`);
        if (fs.existsSync(settingsPath)) {
            const data = fs.readFileSync(settingsPath, 'utf8');
            const settings = JSON.parse(data);
            logger.debug(`Settings loaded successfully: ${Object.keys(settings).join(', ')}`);
            return settings;
        } else {
            // Create default settings file
            logger.info(`Settings file not found at ${settingsPath}, creating with defaults`);
            fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
            fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings, null, 2));
            return defaultSettings;
        }
    } catch (error) {
        logger.error(`Error loading settings from ${settingsPath}: ${error.message}`);
        return defaultSettings;
    }
}

function saveSettings(settings) {
    try {
        logger.debug(`Saving settings to ${settingsPath}`);
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        logger.info(`Settings saved successfully to ${settingsPath}`);
        return true;
    } catch (error) {
        logger.error(`Error saving settings to ${settingsPath}: ${error.message}`);
        return false;
    }
}

module.exports = {
    initialize
};