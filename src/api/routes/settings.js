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
const nodemailer = require('nodemailer');
const https = require('https');
const { Agent } = require('https');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const axios = require('axios');

// Filename for better logging
const FILENAME = 'api/routes/settings.js';

function initSettingsRouter(services) {
    const router = express.Router();
    const { configService, renewalService, npmIntegrationService } = services;

    // Get all settings
    router.get('/', async (req, res) => {
        try {
            const settings = configService.get();
            res.json(settings);
        } catch (error) {
            logger.error('Error getting settings:', error, FILENAME);
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

    // DEPLOYMENT SETTINGS ROUTES

    // Get all deployment settings
    router.get('/deployment', async (req, res) => {
        try {
            const settings = configService.get();

            // Extract deployment settings with defaults
            const deploymentSettings = {
                deployment: JSON.parse(JSON.stringify(settings.deployment || {
                    email: {
                        smtp: {
                            host: '',
                            port: 587,
                            secure: false,
                            user: '',
                            password: '',
                            from: 'Certificate Manager <cert-manager@localhost>'
                        }
                    },
                    nginxProxyManager: {
                        host: '',
                        port: 81,
                        useHttps: false,
                        username: '',
                        password: ''
                    },
                    dockerDefaults: {
                        socketPath: '/var/run/docker.sock',
                        host: '',
                        port: 2375,
                        useTLS: false
                    }
                }))
            };

            // Mask sensitive information
            if (deploymentSettings.deployment.email.smtp.password) {
                deploymentSettings.deployment.email.smtp.password = '••••••••';
            }

            if (deploymentSettings.deployment.nginxProxyManager.password) {
                deploymentSettings.deployment.nginxProxyManager.password = '••••••••';
            }
            
            logger.debug('Retrieved deployment settings', deploymentSettings, FILENAME);
            deploymentSettings.success = true;
            res.json(deploymentSettings);
        } catch (error) {
            logger.error('Error getting deployment settings:', error, FILENAME);
            res.status(500).json({
                message: 'Failed to get deployment settings',
                error: error.message,
                statusCode: 500
            });
        }
    });

    // Update all deployment settings
    router.put('/deployment', async (req, res) => {
        try {
            const { deployment } = req.body;

            if (!deployment) {
                return res.status(400).json({
                    message: 'Invalid deployment settings format',
                    statusCode: 400
                });
            }

            // Get current settings
            const currentSettings = configService.get();

            // Check for masked passwords and restore them from current settings if needed
            if (deployment.email?.smtp?.password === '••••••••' && currentSettings.deployment?.email?.smtp?.password) {
                deployment.email.smtp.password = currentSettings.deployment.email.smtp.password;
            }

            if (deployment.nginxProxyManager?.password === '••••••••' && currentSettings.deployment?.nginxProxyManager?.password) {
                deployment.nginxProxyManager.password = currentSettings.deployment.nginxProxyManager.password;
            }

            // Update deployment settings
            const updatedSettings = {
                ...currentSettings,
                deployment
            };

            // Save settings
            const result = configService.updateSettings(updatedSettings);

            if (!result) {
                return res.status(500).json({
                    message: 'Failed to update deployment settings',
                    statusCode: 500
                });
            }

            // Get updated settings
            const newSettings = configService.get();

            // Make a copy to mask sensitive data
            const safeSettings = JSON.parse(JSON.stringify(newSettings.deployment || {}));

            // Mask sensitive information
            if (safeSettings.email?.smtp?.password) {
                safeSettings.email.smtp.password = '••••••••';
            }

            if (safeSettings.nginxProxyManager?.password) {
                safeSettings.nginxProxyManager.password = '••••••••';
            }

            res.json({
                success: true,
                message: 'Deployment settings updated successfully',
                deployment: safeSettings
            });
        } catch (error) {
            logger.error('Error updating deployment settings:', error, FILENAME);
            res.status(500).json({
                message: 'Failed to update deployment settings',
                error: error.message,
                statusCode: 500
            });
        }
    });

    // Update email settings
    router.put('/deployment/email', async (req, res) => {
        try {
            const { smtp } = req.body;

            if (!smtp) {
                return res.status(400).json({
                    message: 'Invalid email settings format',
                    statusCode: 400
                });
            }

            // Get current settings
            const currentSettings = configService.get();

            // Check for masked password and restore it from current settings if needed
            if (smtp.password === '••••••••' && currentSettings.deployment?.email?.smtp?.password) {
                smtp.password = currentSettings.deployment.email.smtp.password;
            }

            // Create updated settings
            const updatedSettings = {
                ...currentSettings,
                deployment: {
                    ...currentSettings.deployment,
                    email: {
                        ...currentSettings.deployment?.email,
                        smtp
                    }
                }
            };

            // Save settings
            const result = configService.updateSettings(updatedSettings);

            if (!result) {
                return res.status(500).json({
                    message: 'Failed to update email settings',
                    statusCode: 500
                });
            }

            // Get updated settings
            const newSettings = configService.get();

            // Make a copy to mask sensitive data
            const safeSettings = JSON.parse(JSON.stringify(newSettings.deployment?.email || {}));

            // Mask password
            if (safeSettings.smtp?.password) {
                safeSettings.smtp.password = '••••••••';
            }

            res.json({
                success: true,
                message: 'Email settings updated successfully',
                email: safeSettings
            });
        } catch (error) {
            logger.error('Error updating email settings:', error, FILENAME);
            res.status(500).json({
                message: 'Failed to update email settings',
                error: error.message,
                statusCode: 500
            });
        }
    });

    // Test email settings
    router.post('/deployment/email/test', async (req, res) => {
        try {
            const { smtp, recipient } = req.body;

            if (!smtp || !recipient) {
                return res.status(400).json({
                    success: false,
                    message: 'SMTP settings and recipient email are required',
                    statusCode: 400
                });
            }

            logger.info(`Testing SMTP settings with host ${smtp.host}:${smtp.port}`, null, FILENAME);

            // Create transporter with more flexible SSL options
            const transportOptions = {
                host: smtp.host,
                port: parseInt(smtp.port) || 587,
                auth: smtp.user ? {
                    user: smtp.user,
                    pass: smtp.password
                } : undefined,
                tls: {
                    // Don't fail on invalid certs
                    rejectUnauthorized: false,
                    // Add minimumTLS setting to support older servers
                    minVersion: 'TLSv1'
                },
                debug: true, // Enable debug output
                logger: true  // Log to console
            };

            // Special handling for secure option
            if (smtp.secure === true) {
                // For explicit SSL/TLS on ports like 465
                transportOptions.secure = true;
            } else {
                // For STARTTLS on ports like 587 or 25
                transportOptions.secure = false;

                // Enable workaround for certain servers that need forced STARTTLS
                transportOptions.requireTLS = true;
                transportOptions.opportunisticTLS = true;
            }

            logger.debug(`Creating SMTP transport with options: ${JSON.stringify({
                ...transportOptions,
                auth: transportOptions.auth ? {
                    user: transportOptions.auth.user,
                    pass: '********'
                } : undefined
            })}`, null, FILENAME);

            // Create transporter
            const transporter = nodemailer.createTransport(transportOptions);

            // Verify connection configuration
            logger.debug('Verifying SMTP connection...', null, FILENAME);
            try {
                await transporter.verify();
                logger.debug('SMTP connection verification successful', null, FILENAME);
            } catch (verifyError) {
                logger.error('SMTP connection verification failed:', verifyError, FILENAME);

                // Try alternative connection methods if verification fails
                if (verifyError.code === 'ESOCKET' && verifyError.message.includes('wrong version number')) {
                    logger.debug('Trying alternative SSL/TLS configuration...', null, FILENAME);

                    // For some providers, try the opposite of the current secure setting
                    transportOptions.secure = !transportOptions.secure;
                    transportOptions.requireTLS = !transportOptions.secure;

                    logger.debug(`Retrying with secure=${transportOptions.secure}`, null, FILENAME);

                    // Create a new transporter with modified settings
                    transporter = nodemailer.createTransport(transportOptions);

                    // Verify again
                    await transporter.verify();
                    logger.debug('Alternative SMTP connection verification successful', null, FILENAME);
                } else {
                    // If it's another type of error or the alternative failed, re-throw
                    throw verifyError;
                }
            }

            // Send test email
            const info = await transporter.sendMail({
                from: smtp.from || 'Certificate Manager <cert-manager@localhost>',
                to: recipient,
                subject: 'Certificate Manager - Test Email',
                text: 'This is a test email from Certificate Manager. If you received this, your SMTP settings are working correctly.',
                html: `
                <div style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2 style="color: #2c3e50;">Certificate Manager - Test Email</h2>
                    <p>This is a test email from Certificate Manager.</p>
                    <p>If you received this, your SMTP settings are working correctly.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #7f8c8d; font-size: 12px;">
                        Sent from Certificate Manager at ${new Date().toISOString()}
                    </p>
                </div>
            `
            });

            logger.info(`Test email sent: ${info.messageId}`, null, FILENAME);

            res.json({
                success: true,
                message: 'Test email sent successfully',
                messageId: info.messageId
            });
        } catch (error) {
            logger.error('Error sending test email:', error, FILENAME);

            // Provide more helpful error messages based on common SMTP issues
            let errorMessage = error.message;
            let suggestions = [];

            if (error.code === 'EAUTH') {
                errorMessage = 'Authentication failed. Please check your username and password.';
                suggestions = ['Verify your username and password', 'Make sure you have permission to send emails'];
            } else if (error.code === 'ESOCKET' && error.message.includes('wrong version number')) {
                errorMessage = 'SSL/TLS protocol mismatch. Try changing the "secure" option.';
                suggestions = [
                    'If using port 587, try unchecking the "Use SSL/TLS" option',
                    'If using port 465, try checking the "Use SSL/TLS" option'
                ];
            } else if (error.code === 'ECONNREFUSED') {
                errorMessage = 'Connection refused. Please check your SMTP host and port.';
                suggestions = ['Verify the SMTP server address', 'Check if the port is correct'];
            } else if (error.code === 'ETIMEDOUT') {
                errorMessage = 'Connection timed out. Server may be down or blocked.';
                suggestions = ['Check firewall settings', 'Verify the SMTP server is online'];
            }

            res.status(500).json({
                success: false,
                message: `Failed to send test email: ${errorMessage}`,
                suggestions: suggestions,
                error: {
                    code: error.code || 'UNKNOWN',
                    message: error.message
                },
                statusCode: 500
            });
        }
    });

    // Update Nginx Proxy Manager settings
    router.put('/deployment/nginx-proxy-manager', async (req, res) => {
        try {
            const npmSettings = req.body;

            if (!npmSettings || !npmSettings.host) {
                return res.status(400).json({
                    message: 'Invalid NPM settings format',
                    statusCode: 400
                });
            }

            // Get current settings
            const currentSettings = configService.get();

            // Check for masked password and restore it from current settings if needed
            if (!npmSettings.password || npmSettings.password === '••••••••'){
                if(currentSettings.deployment?.nginxProxyManager?.password) {
                    logger.fine("Restoring password from current settings", null, FILENAME);
                    npmSettings.password = currentSettings.deployment.nginxProxyManager.password;
                } else {
                    logger.error('No password provided and no current password found', null, FILENAME);
                }
            } else {
                logger.debug("Using provided password", null, FILENAME);
            }

            // Create updated settings
            const updatedSettings = {
                ...currentSettings,
                deployment: {
                    ...currentSettings.deployment,
                    nginxProxyManager: npmSettings
                }
            };

            // Save settings
            const result = configService.updateSettings(updatedSettings);

            if (!result) {
                return res.status(500).json({
                    message: 'Failed to update NPM settings',
                    statusCode: 500
                });
            }

            // Get updated settings
            const newSettings = configService.get();

            // Make a copy to mask sensitive data
            const safeSettings = JSON.parse(JSON.stringify(newSettings.deployment?.nginxProxyManager || {}));

            // Mask password
            if (safeSettings.password) {
                safeSettings.password = '••••••••';
            }

            if (safeSettings.accessToken) {
                safeSettings.accessToken = '••••••••';
            }

            if (safeSettings.refreshToken) {
                safeSettings.refreshToken = '••••••••';
            }

            res.json({
                success: true,
                message: 'Nginx Proxy Manager settings updated successfully',
                nginxProxyManager: safeSettings
            });
        } catch (error) {
            logger.error('Error updating NPM settings:', error, FILENAME);
            res.status(500).json({
                message: 'Failed to update NPM settings',
                error: error.message,
                statusCode: 500
            });
        }
    });

    // Test Nginx Proxy Manager connection
    router.post('/deployment/nginx-proxy-manager/test', async (req, res) => {
        try {
            const npmSettings = req.body;

            logger.debug(`Received NPM test request with settings: ${JSON.stringify({
                ...npmSettings,
                password: npmSettings.password ? '****' : undefined
            })}`, null, FILENAME);

            if (!npmSettings || !npmSettings.host) {
                return res.status(400).json({
                    success: false,
                    message: 'NPM host and credentials are required',
                    statusCode: 400
                });
            }

            logger.info(`Testing NPM connection to ${npmSettings.host}:${npmSettings.port}`, null, FILENAME);

            // Get current settings
            const currentSettings = configService.get();
            
            // Check for masked password and restore it
            if (!npmSettings.password || npmSettings.password === '••••••••'){
                if(currentSettings.deployment?.nginxProxyManager?.password) {
                    logger.fine("Restoring password from current settings", null, FILENAME);
                    npmSettings.password = currentSettings.deployment.nginxProxyManager.password;
                } else {
                    logger.error('No password provided and no current password found', null, FILENAME);
                }
            }

            // Test connection using the service
            const connectionResult = await npmIntegrationService.testConnection(npmSettings);
            
            if (!connectionResult.success) {
                return res.status(500).json({
                    success: false,
                    message: connectionResult.message,
                    statusCode: 500
                });
            }
            
            // If connection is successful, try to get a token
            const tokenResult = await npmIntegrationService.getAuthToken(npmSettings);
            
            if (!tokenResult.success) {
                return res.status(401).json({
                    success: false,
                    message: tokenResult.message,
                    statusCode: 401
                });
            }
            
            // Now try to get certificates
            const certificatesResult = await npmIntegrationService.getCertificates({
                ...npmSettings,
                accessToken: tokenResult.token
            });
            
            // Get certificate count
            const certificateCount = certificatesResult.success ? 
                (certificatesResult.certificates ? certificatesResult.certificates.length : 0) : 0;
            
            // Success - return info to client
            return res.json({
                success: true,
                message: 'Connection to Nginx Proxy Manager successful',
                certificates: certificateCount
            });
        } catch (error) {
            logger.error('Error testing NPM connection:', error, FILENAME);
            res.status(500).json({
                success: false,
                message: `Connection failed: ${error.message}`,
                error: error.stack,
                statusCode: 500
            });
        }
    });

    // Helper route to handle misc deployment settings category (SSH, FTP, Docker)
    const handleDeploymentCategory = (category) => {
        return async (req, res) => {
            try {
                const categorySettings = req.body;

                // Get current settings
                const currentSettings = configService.get();

                // Create updated settings
                const updatedSettings = {
                    ...currentSettings,
                    deployment: {
                        ...currentSettings.deployment,
                        [category]: categorySettings
                    }
                };

                // Save settings
                const result = configService.updateSettings(updatedSettings);

                if (!result) {
                    return res.status(500).json({
                        message: `Failed to update ${category} settings`,
                        statusCode: 500
                    });
                }

                res.json({
                    success: true,
                    message: `${category} settings updated successfully`,
                    [category]: categorySettings
                });
            } catch (error) {
                logger.error(`Error updating ${category} settings:`, error, FILENAME);
                res.status(500).json({
                    message: `Failed to update ${category} settings`,
                    error: error.message,
                    statusCode: 500
                });
            }
        };
    };

    // Docker settings routes
    router.put('/deployment/docker', handleDeploymentCategory('dockerDefaults'));

    // Renewal settings routes
    router.get('/renewal', async (req, res) => {
    try {
        const settings = configService.get();

        // Extract renewal-related settings
        const renewalSettings = {
        enableAutoRenewalJob: settings.enableAutoRenewalJob || false,
        renewalSchedule: settings.renewalSchedule || '0 0 * * *',
        renewDaysBeforeExpiry: settings.renewDaysBeforeExpiry || 30,
        enableFileWatch: settings.enableFileWatch || false,
        includeIdleDomainsOnRenewal: settings.includeIdleDomainsOnRenewal !== false
        };

        res.json(renewalSettings);
    } catch (error) {
        logger.error('Error getting renewal settings:', error, FILENAME);
        res.status(500).json({
        message: 'Failed to get renewal settings',
        error: error.message,
        statusCode: 500
        });
    }
    });

    router.put('/renewal', async (req, res) => {
    try {
        const renewalSettings = req.body;

        if (!renewalSettings) {
        return res.status(400).json({
            message: 'Invalid renewal settings format',
            statusCode: 400
        });
        }

        // Validate cron schedule if provided
        if (renewalSettings.renewalSchedule) {
        try {
            // Simple validation for cron format (5 or 6 fields)
            const cronParts = renewalSettings.renewalSchedule.split(/\s+/);
            if (cronParts.length < 5 || cronParts.length > 6) {
            return res.status(400).json({
                message: 'Invalid cron schedule format',
                statusCode: 400
            });
            }
        } catch (error) {
            return res.status(400).json({
            message: 'Invalid cron schedule format',
            statusCode: 400
            });
        }
        }

        // Get current settings
        const currentSettings = configService.get();

        // Update settings
        const updatedSettings = {
        ...currentSettings,
        enableAutoRenewalJob: renewalSettings.enableAutoRenewalJob,
        renewalSchedule: renewalSettings.renewalSchedule || '0 0 * * *',
        renewDaysBeforeExpiry: renewalSettings.renewDaysBeforeExpiry || 30,
        enableFileWatch: renewalSettings.enableFileWatch,
        includeIdleDomainsOnRenewal: renewalSettings.includeIdleDomainsOnRenewal
        };

        // Save settings
        const result = configService.updateSettings(updatedSettings);

        if (!result) {
        return res.status(500).json({
            message: 'Failed to update renewal settings',
            statusCode: 500
        });
        }

        // Apply changes to renewal service
        if (renewalService) {
        // Update renewal service settings
        renewalService.options.disableRenewalCron = !updatedSettings.enableAutoRenewalJob;
        renewalService.options.renewalSchedule = updatedSettings.renewalSchedule;
        renewalService.options.renewDaysBeforeExpiry = updatedSettings.renewDaysBeforeExpiry;
        renewalService.options.enableWatcher = updatedSettings.enableFileWatch;
        renewalService.options.includeIdleDomainsOnRenewal = updatedSettings.includeIdleDomainsOnRenewal;

        // Apply schedule changes
        if (!renewalService.options.disableRenewalCron) {
            renewalService.scheduleCronJob();
        } else if (renewalService.cronJob) {
            renewalService.cronJob.stop();
            renewalService.cronJob = null;
            logger.info('Renewal cron job stopped', null, FILENAME);
        }

        // Apply file watcher changes
        if (renewalService.options.enableWatcher && !renewalService.watcher) {
            await renewalService.startFileWatcher();
        } else if (!renewalService.options.enableWatcher && renewalService.watcher) {
            await renewalService.watcher.close();
            renewalService.watcher = null;
            logger.info('File watcher stopped', null, FILENAME);
        }
        }

        res.json({
        success: true,
        message: 'Renewal settings updated successfully',
        settings: {
            enableAutoRenewalJob: updatedSettings.enableAutoRenewalJob,
            renewalSchedule: updatedSettings.renewalSchedule,
            renewDaysBeforeExpiry: updatedSettings.renewDaysBeforeExpiry,
            enableFileWatch: updatedSettings.enableFileWatch,
            includeIdleDomainsOnRenewal: updatedSettings.includeIdleDomainsOnRenewal
        }
        });
    } catch (error) {
        logger.error('Error updating renewal settings:', error, FILENAME);
        res.status(500).json({
        message: 'Failed to update renewal settings',
        error: error.message,
        statusCode: 500
        });
    }
    });

    // Logging settings routes
    router.get('/logging', async (req, res) => {
        try {
            // Get current settings
            const settings = configService.get();

            // Create a response with the current logging configuration
            const loggingSettings = {
                logLevel: settings.logLevel || 'info',
                fileLogLevels: settings.fileLogLevels || {}
            };

            logger.debug('Retrieved logging settings', loggingSettings, FILENAME);
            res.json(loggingSettings);
        } catch (error) {
            logger.error('Error getting logging settings:', error, FILENAME);
            res.status(500).json({
                message: 'Failed to get logging settings',
                error: error.message,
                statusCode: 500
            });
        }
    });

    // Update default log level
    router.post('/logging/default', async (req, res) => {
        try {
            const { level } = req.body;

            if (!level || typeof level !== 'string') {
                return res.status(400).json({
                    message: 'Invalid log level',
                    statusCode: 400
                });
            }

            // Check if level is valid
            const validLevels = Object.keys(logger.levels);
            if (!validLevels.includes(level)) {
                return res.status(400).json({
                    message: `Invalid log level: ${level}. Valid levels are: ${validLevels.join(', ')}`,
                    statusCode: 400
                });
            }

            // Get current settings
            const settings = configService.get();

            // Update log level in settings
            settings.logLevel = level;

            // Save settings
            const result = configService.updateSettings(settings);

            if (!result) {
                return res.status(500).json({
                    message: 'Failed to update default log level',
                    statusCode: 500
                });
            }

            // Apply the new log level immediately
            logger.setLevel(level);
            logger.info(`Default log level changed to ${level}`, null, FILENAME);

            res.json({
                success: true,
                message: `Default log level changed to ${level}`,
                logLevel: level
            });
        } catch (error) {
            logger.error('Error updating default log level:', error, FILENAME);
            res.status(500).json({
                message: 'Failed to update default log level',
                error: error.message,
                statusCode: 500
            });
        }
    });

    // Update file-specific log level
    router.post('/logging/file', async (req, res) => {
        try {
            const { filename, level } = req.body;

            if (!filename || typeof filename !== 'string' || !level || typeof level !== 'string') {
                return res.status(400).json({
                    message: 'Both filename and level are required',
                    statusCode: 400
                });
            }

            // Check if level is valid
            const validLevels = Object.keys(logger.levels);
            if (!validLevels.includes(level)) {
                return res.status(400).json({
                    message: `Invalid log level: ${level}. Valid levels are: ${validLevels.join(', ')}`,
                    statusCode: 400
                });
            }

            // Get current settings
            const settings = configService.get();

            // Initialize fileLogLevels if it doesn't exist
            if (!settings.fileLogLevels) {
                settings.fileLogLevels = {};
            }

            // Update file log level
            settings.fileLogLevels[filename] = level;

            // Save settings
            const result = configService.updateSettings(settings);

            if (!result) {
                return res.status(500).json({
                    message: `Failed to update log level for ${filename}`,
                    statusCode: 500
                });
            }

            // Apply the new log level immediately
            logger.setLevel(level, filename);
            logger.info(`Log level for ${filename} changed to ${level}`, null, FILENAME);

            res.json({
                success: true,
                message: `Log level for ${filename} changed to ${level}`,
                filename: filename,
                level: level
            });
        } catch (error) {
            logger.error('Error updating file log level:', error, FILENAME);
            res.status(500).json({
                message: 'Failed to update file log level',
                error: error.message,
                statusCode: 500
            });
        }
    });

    // Remove file-specific log level
    router.delete('/logging/file/:filename', async (req, res) => {
        try {
            const { filename } = req.params;

            if (!filename) {
                return res.status(400).json({
                    message: 'Filename is required',
                    statusCode: 400
                });
            }

            // Get current settings
            const settings = configService.get();

            // Check if fileLogLevels exists
            if (!settings.fileLogLevels) {
                return res.status(404).json({
                    message: `No file log levels configured`,
                    statusCode: 404
                });
            }

            // Check if file exists in fileLogLevels
            if (!settings.fileLogLevels[filename]) {
                return res.status(404).json({
                    message: `No log level configured for ${filename}`,
                    statusCode: 404
                });
            }

            // Remove file from fileLogLevels
            delete settings.fileLogLevels[filename];

            // Save settings
            const result = configService.updateSettings(settings);

            if (!result) {
                return res.status(500).json({
                    message: `Failed to remove log level for ${filename}`,
                    statusCode: 500
                });
            }

            // Update logger's fileLogLevels
            logger.fileLogLevels = { ...settings.fileLogLevels };

            logger.info(`Removed log level configuration for ${filename}`, null, FILENAME);

            res.json({
                success: true,
                message: `Removed log level configuration for ${filename}`,
                filename: filename
            });
        } catch (error) {
            logger.error('Error removing file log level:', error, FILENAME);
            res.status(500).json({
                message: 'Failed to remove file log level',
                error: error.message,
                statusCode: 500
            });
        }
    });

    // Update all logging settings at once
    router.put('/logging', async (req, res) => {
        try {
            const { logLevel, fileLogLevels } = req.body;

            // Validate logLevel if provided
            if (logLevel) {
                const validLevels = Object.keys(logger.levels);
                if (!validLevels.includes(logLevel)) {
                    return res.status(400).json({
                        message: `Invalid log level: ${logLevel}. Valid levels are: ${validLevels.join(', ')}`,
                        statusCode: 400
                    });
                }
            }

            // Validate fileLogLevels if provided
            if (fileLogLevels && typeof fileLogLevels === 'object') {
                const validLevels = Object.keys(logger.levels);
                for (const [file, level] of Object.entries(fileLogLevels)) {
                    if (!validLevels.includes(level)) {
                        return res.status(400).json({
                            message: `Invalid log level for ${file}: ${level}. Valid levels are: ${validLevels.join(', ')}`,
                            statusCode: 400
                        });
                    }
                }
            }

            // Get current settings
            const settings = configService.get();

            // Update settings with new values
            if (logLevel) {
                settings.logLevel = logLevel;
            }

            if (fileLogLevels) {
                settings.fileLogLevels = { ...fileLogLevels };
            }

            // Save settings
            const result = configService.updateSettings(settings);

            if (!result) {
                return res.status(500).json({
                    message: 'Failed to update logging settings',
                    statusCode: 500
                });
            }

            // Apply new settings immediately
            if (logLevel) {
                logger.setLevel(logLevel);
            }

            if (fileLogLevels) {
                logger.fileLogLevels = { ...fileLogLevels };

                // Apply file-specific log levels
                Object.entries(fileLogLevels).forEach(([filename, level]) => {
                    logger.setLevel(level, filename);
                });
            }

            logger.info('Updated logging configuration', null, FILENAME);

            res.json({
                success: true,
                message: 'Logging settings updated successfully',
                logLevel: settings.logLevel,
                fileLogLevels: settings.fileLogLevels
            });
        } catch (error) {
            logger.error('Error updating logging settings:', error, FILENAME);
            res.status(500).json({
                message: 'Failed to update logging settings',
                error: error.message,
                statusCode: 500
            });
        }
    });

    // Add updateConfig method to logger to support runtime configuration changes
    router.post('/logging/apply', async (req, res) => {
        try {
            // Load current settings from config
            const settings = configService.get();

            if (!settings.logLevel) {
                return res.status(400).json({
                    message: 'No log level configuration found in settings',
                    statusCode: 400
                });
            }

            // Apply logger configuration from settings
            logger.logLevel = settings.logLevel;
            logger.fileLogLevels = settings.fileLogLevels || {};

            // If using Winston, update transports
            if (logger.logger && logger.logger.transports) {
                logger.logger.transports.forEach(transport => {
                    transport.level = settings.logLevel;
                });
            }

            logger.info(`Applied logging configuration: Default level = ${settings.logLevel}, File specific levels = ${Object.keys(settings.fileLogLevels || {}).length}`, null, FILENAME);

            res.json({
                success: true,
                message: 'Logging configuration applied successfully',
                logLevel: settings.logLevel,
                fileLogLevels: settings.fileLogLevels || {}
            });
        } catch (error) {
            logger.error('Error applying logging configuration:', error, FILENAME);
            res.status(500).json({
                message: 'Failed to apply logging configuration',
                error: error.message,
                statusCode: 500
            });
        }
    });

    return router;
};

module.exports = initSettingsRouter;