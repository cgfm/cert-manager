/**
 * Settings API Routes
 * This module defines the routes for managing application settings.
 * It provides endpoints to get and update settings.
 * @module api/routes/settings
 * @requires express
 * @requires services/logger
 * @version 0.0.2
 * @license MIT
 * @author Christian Meiners
 * @description This module exports a function that initializes an Express router for handling settings-related requests.
 * The router provides endpoints to get and update application settings.
 */

const express = require('express');
const logger = require('../../services/logger');

function initSettingsRouter(services) {
    const router = express.Router();
    const { configService, renewalService } = services;

    // Get all settings
    router.get('/', async (req, res) => {
        try {
            const settings = configService.get();
            res.json(settings);
        } catch (error) {
            logger.error('Error getting settings:', error);
            res.status(500).json({
                message: 'Failed to get settings',
                error: error.message,
                statusCode: 500
            });
        }
    });

    // Get certificate-specific settings
    router.get('/certificates', async (req, res) => {
        try {
            const settings = configService.get();
            
            // Extract only the certificate-relevant settings
            const certificateSettings = {
                validity: settings.validity || 365,
                renewBefore: settings.renewBefore || 30,
                keySize: settings.keySize || 2048,
                preferredChallenge: settings.preferredChallenge || 'http-01',
                autoRenew: settings.autoRenew !== undefined ? settings.autoRenew : true
            };
            
            res.json(certificateSettings);
        } catch (error) {
            logger.error('Error getting certificate settings:', error);
            res.status(500).json({
                message: 'Failed to get certificate settings',
                error: error.message,
                statusCode: 500
            });
        }
    });

    // Update settings
    router.patch('/', async (req, res) => {
        try {
            const newSettings = req.body;
            const result = configService.updateSettings(newSettings);
            
            if (!result) {
                return res.status(500).json({
                    message: 'Failed to update settings',
                    statusCode: 500
                });
            }
            
            // Apply renewal settings if they were changed
            if (
                newSettings.renewalSchedule !== undefined ||
                newSettings.enableAutoRenewalJob !== undefined ||
                newSettings.enableFileWatch !== undefined
            ) {
                // Update renewal service with new settings
                if (newSettings.renewalSchedule !== undefined) {
                    renewalService.options.renewalSchedule = newSettings.renewalSchedule;
                }
                
                if (newSettings.enableAutoRenewalJob !== undefined) {
                    renewalService.options.disableRenewalCron = !newSettings.enableAutoRenewalJob;
                }
                
                if (newSettings.enableFileWatch !== undefined) {
                    renewalService.options.enableWatcher = newSettings.enableFileWatch;
                }
                
                // Apply changes
                if (newSettings.renewalSchedule !== undefined || 
                    newSettings.enableAutoRenewalJob !== undefined) {
                    if (!renewalService.options.disableRenewalCron) {
                        renewalService.scheduleCronJob();
                    } else if (renewalService.cronJob) {
                        renewalService.cronJob.stop();
                        renewalService.cronJob = null;
                    }
                }
                
                // Restart file watcher if setting was changed
                if (newSettings.enableFileWatch !== undefined) {
                    if (renewalService.options.enableWatcher) {
                        await renewalService.startFileWatcher();
                    } else if (renewalService.watcher) {
                        await renewalService.watcher.close();
                        renewalService.watcher = null;
                    }
                }
            }
            
            res.json({
                success: true,
                message: 'Settings updated successfully',
                settings: configService.get()
            });
        } catch (error) {
            logger.error('Error updating settings:', error);
            res.status(500).json({
                message: 'Failed to update settings',
                error: error.message,
                statusCode: 500
            });
        }
    });

    // Update certificate-specific settings
    router.patch('/certificates', async (req, res) => {
        try {
            const certificateSettings = req.body;
            
            // Extract only the certificate-relevant settings
            const settingsToUpdate = {};
            
            if (certificateSettings.validity !== undefined) {
                settingsToUpdate.validity = parseInt(certificateSettings.validity, 10);
            }
            
            if (certificateSettings.renewBefore !== undefined) {
                settingsToUpdate.renewBefore = parseInt(certificateSettings.renewBefore, 10);
            }
            
            if (certificateSettings.keySize !== undefined) {
                settingsToUpdate.keySize = parseInt(certificateSettings.keySize, 10);
            }
            
            if (certificateSettings.preferredChallenge !== undefined) {
                settingsToUpdate.preferredChallenge = certificateSettings.preferredChallenge;
            }
            
            if (certificateSettings.autoRenew !== undefined) {
                settingsToUpdate.autoRenew = !!certificateSettings.autoRenew;
            }
            
            const result = configService.updateSettings(settingsToUpdate);
            
            if (!result) {
                return res.status(500).json({
                    message: 'Failed to update certificate settings',
                    statusCode: 500
                });
            }
            
            res.json({
                success: true,
                message: 'Certificate settings updated successfully',
                settings: {
                    validity: configService.get('validity') || 365,
                    renewBefore: configService.get('renewBefore') || 30,
                    keySize: configService.get('keySize') || 2048,
                    preferredChallenge: configService.get('preferredChallenge') || 'http-01',
                    autoRenew: configService.get('autoRenew') !== undefined ? configService.get('autoRenew') : true
                }
            });
        } catch (error) {
            logger.error('Error updating certificate settings:', error);
            res.status(500).json({
                message: 'Failed to update certificate settings',
                error: error.message,
                statusCode: 500
            });
        }
    });

    return router;
};

module.exports = initSettingsRouter;