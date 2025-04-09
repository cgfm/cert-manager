const express = require('express');
const router = express.Router();
const logger = require('../services/logger');

// Initialize with required services
let configManager;

function initialize(configMgr) {
    configManager = configMgr;
    return router;
}

// GET endpoint
router.get('/global', (req, res) => {
    try {
        const globalSettings = configManager.getGlobalDefaults();
        res.json(globalSettings);
    } catch (error) {
        logger.error('Error getting global settings:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST endpoint
router.post('/global', (req, res) => {
    try {
        const newSettings = req.body;
        
        // Get current settings to merge
        const currentSettings = configManager.getGlobalDefaults();
        
        // Validate required settings (add more validation as needed)
        if (newSettings.httpsPort && (newSettings.httpsPort < 1 || newSettings.httpsPort > 65535)) {
            return res.status(400).json({
                success: false,
                error: 'HTTPS port must be between 1 and 65535'
            });
        }
        
        // Update settings with new values
        const updatedSettings = {
            ...currentSettings,
            ...newSettings
        };
        
        // Save to config
        configManager.updateGlobalDefaults(updatedSettings);
        
        logger.info('Global settings updated', {
            httpsEnabled: newSettings.enableHttps,
            httpsPort: newSettings.httpsPort
        });
        
        res.json({
            success: true,
            message: 'Settings updated successfully'
        });
    } catch (error) {
        logger.error('Error updating global settings:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = { router, initialize };