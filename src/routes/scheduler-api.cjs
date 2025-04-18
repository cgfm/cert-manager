const express = require('express');
const logger = require('../services/logger');

function initRouter(services) {
    const router = express.Router();
    const { schedulerService, configManager, io } = services;
    
    // GET /api/scheduler/status - Get scheduler status
    router.get('/status', (req, res) => {
        try {
            const settings = configManager.getGlobalDefaults();
            const nextExecution = schedulerService.getNextExecutionInfo();
            
            res.json({
                enabled: settings.enableAutoRenewalJob || false,
                schedule: settings.renewalSchedule || '0 0 * * *',
                nextExecution,
                lastRun: settings.lastRenewalCheck
            });
        } catch (error) {
            logger.error('Error getting scheduler status:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // POST /api/scheduler/settings - Update scheduler settings
    router.post('/settings', async (req, res) => {
        try {
            const { enableAutoRenewalJob, renewalSchedule } = req.body;
            
            // Get current global defaults
            const globalDefaults = configManager.getGlobalDefaults();
            
            // Update scheduler settings
            const updatedSettings = {
                ...globalDefaults,
                enableAutoRenewalJob: enableAutoRenewalJob,
                renewalSchedule: renewalSchedule
            };
            
            // Save to config
            configManager.setGlobalDefaults(updatedSettings);
            
            // Update the scheduler
            const success = schedulerService.updateSchedule(updatedSettings);
            
            // Emit scheduler status changed event via socket.io
            if (io) {
                io.emit('scheduler-status-changed', {
                    enabled: enableAutoRenewalJob,
                    schedule: renewalSchedule
                });
            }
            
            if (success) {
                res.json({
                    success: true,
                    message: 'Scheduler settings updated',
                    settings: updatedSettings
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to update scheduler settings'
                });
            }
        } catch (error) {
            logger.error('Error updating scheduler settings:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    // POST /api/scheduler/run - Run a manual check
    router.post('/run', async (req, res) => {
        try {
            logger.info('Manual certificate renewal check requested');
            
            const result = await schedulerService.runManualCheck();
            
            // Update last run timestamp
            const globalDefaults = configManager.getGlobalDefaults();
            globalDefaults.lastRenewalCheck = new Date().toISOString();
            configManager.setGlobalDefaults(globalDefaults);
            
            res.json({
                success: true,
                message: 'Manual certificate renewal check completed',
                result
            });
        } catch (error) {
            logger.error('Error running manual renewal check:', error);
            res.status(500).json({ error: error.message });
        }
    });
    
    return router;
}

module.exports = initRouter;