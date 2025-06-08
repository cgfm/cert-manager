/**
 * @fileoverview Setup Service - Manages application initialization and first-time setup process
 * @module services/setup-service
 * @requires fs
 * @requires crypto
 * @requires ./logger
 * @version 0.0.1
 * @license MIT
 * @author Christian Meiners
 */

const fs = require('fs').promises;
const crypto = require('crypto');
const logger = require('./logger');

const FILENAME = 'services/setup-service.js';

/**
 * Setup Service for managing application initialization and first-time setup process.
 * Handles setup validation, user creation during setup, and configuration initialization.
 */
class SetupService {
    /**
     * Create a new SetupService instance
     * @param {Object} [deps={}] - Dependencies object containing required services
     * @param {Object} deps.userManager - User manager service for handling user operations
     * @param {Object} deps.configService - Configuration service for managing app settings
     * @param {Object} deps.activityService - Activity logging service for audit trails
     */
    constructor(deps = {}) {
        this.userManager = deps.userManager;
        this.configService = deps.configService;
        this.activityService = deps.activityService;
    }    /**
     * Check if initial application setup is required.
     * Determines if the application needs to go through first-time setup process.
     * @async
     * @returns {Promise<boolean>} True if setup is needed, false if already completed
     * @throws {Error} Returns true on errors to ensure setup can proceed
     */
    async isSetupNeeded() {
        try {
            if (!this.userManager) {
                logger.warn('UserManager not available, assuming setup needed', null, FILENAME);
                return true;
            }
            return await this.userManager.isSetupNeeded();
        } catch (error) {
            logger.error('Error checking setup status', { error: error.message }, FILENAME);
            return true;
        }
    }    /**
     * Get detailed setup status including authentication configuration and requirements.
     * Provides comprehensive information about the current setup state.
     * @async
     * @returns {Promise<Object>} Setup status object with detailed information
     * @returns {boolean} returns.setupNeeded - Whether setup is required
     * @returns {Object} returns.authConfig - Authentication configuration details
     * @returns {string} returns.message - Status message describing current state
     */
    async getSetupStatus() {
        try {
            const setupNeeded = await this.isSetupNeeded();
            const authDisabled = this.configService?.getSettings()?.security?.disableAuth || false;
            
            return {
                setupNeeded,
                authDisabled,
                completed: !setupNeeded
            };
        } catch (error) {
            logger.error('Error getting setup status', { error: error.message }, FILENAME);
            return {
                setupNeeded: true,
                authDisabled: false,
                completed: false,
                error: error.message
            };
        }
    }

    /**
     * Complete the initial setup process
     * @param {Object} setupData - Setup configuration data
     * @param {Object} setupData.admin - Admin user data
     * @param {string} setupData.admin.username - Admin username
     * @param {string} setupData.admin.password - Admin password
     * @param {string} [setupData.admin.name] - Admin display name
     * @param {Object} setupData.config - Application configuration
     * @param {string} setupData.config.certsDir - Certificates directory path
     * @param {number} [setupData.config.port] - HTTP port
     * @param {boolean} [setupData.config.enableHttps] - Enable HTTPS
     * @param {number} [setupData.config.httpsPort] - HTTPS port
     * @param {string} [setupData.config.httpsCert] - HTTPS certificate path
     * @param {string} [setupData.config.httpsKey] - HTTPS key path
     * @returns {Promise<Object>} Setup result
     */
    async completeSetup(setupData) {
        try {
            const { admin, config } = setupData;

            // Validate input
            if (!admin || !admin.username || !admin.password) {
                throw new Error('Missing admin credentials');
            }

            if (!config || !config.certsDir) {
                throw new Error('Missing required configuration');
            }

            // Check if setup is already completed
            const setupNeeded = await this.isSetupNeeded();
            if (!setupNeeded) {
                throw new Error('Setup has already been completed');
            }

            // Create admin user
            if (this.userManager) {
                await this.userManager.createUser({
                    username: admin.username,
                    password: admin.password,
                    name: admin.name || admin.username,
                    role: 'admin'
                });
                logger.info('Created admin user during setup', { username: admin.username }, FILENAME);
            }

            // Generate secure JWT secret
            const jwtSecret = crypto.randomBytes(64).toString('hex');

            // Create configuration
            const newSettings = {
                certsDir: config.certsDir,
                port: config.port || 3000,
                security: {
                    disableAuth: false,
                    authMode: 'basic',
                    jwtSecret: jwtSecret,
                    tokenExpiration: '8h'
                }
            };

            // Add HTTPS configuration if enabled
            if (config.enableHttps) {
                newSettings.enableHttps = true;
                newSettings.httpsPort = config.httpsPort || 9443;
                newSettings.httpsCertPath = config.httpsCert;
                newSettings.httpsKeyPath = config.httpsKey;
            }

            // Update configuration
            if (this.configService) {
                const configUpdated = this.configService.updateSettings(newSettings);
                if (!configUpdated) {
                    throw new Error('Failed to update configuration');
                }
                logger.info('Updated configuration during setup', null, FILENAME);
            }

            // Create certificates directory
            try {
                await fs.mkdir(config.certsDir, { recursive: true });
                logger.info('Created certificates directory', { path: config.certsDir }, FILENAME);
            } catch (error) {
                logger.warn('Error creating certificates directory', { 
                    error: error.message, 
                    path: config.certsDir 
                }, FILENAME);
            }

            // Record activity
            if (this.activityService) {
                await this.activityService.recordSystemActivity('setup-complete', {
                    username: admin.username,
                    certsDir: config.certsDir
                });
            }

            // Mark setup as completed
            if (this.userManager) {
                await this.userManager.markSetupCompleted();
            }

            return {
                success: true,
                message: 'Setup completed successfully',
                config: newSettings
            };

        } catch (error) {
            logger.error('Error completing setup', { 
                error: error.message, 
                stack: error.stack 
            }, FILENAME);
            
            throw error;
        }
    }

    /**
     * Reset setup status (for testing purposes)
     * @returns {Promise<boolean>} True if reset successful
     */
    async resetSetup() {
        try {
            if (this.userManager) {
                await this.userManager.resetSetup();
            }
            
            logger.info('Setup reset completed', null, FILENAME);
            return true;
        } catch (error) {
            logger.error('Error resetting setup', { error: error.message }, FILENAME);
            return false;
        }
    }

    /**
     * Validate setup configuration
     * @param {Object} config - Configuration to validate
     * @returns {Object} Validation result
     */
    validateSetupConfig(config) {
        const errors = [];
        const warnings = [];

        if (!config) {
            errors.push('Configuration is required');
            return { valid: false, errors, warnings };
        }

        // Validate admin user
        if (!config.admin) {
            errors.push('Admin user configuration is required');
        } else {
            if (!config.admin.username || config.admin.username.length < 3) {
                errors.push('Admin username must be at least 3 characters');
            }
            if (!config.admin.password || config.admin.password.length < 6) {
                errors.push('Admin password must be at least 6 characters');
            }
        }

        // Validate application config
        if (!config.config) {
            errors.push('Application configuration is required');
        } else {
            if (!config.config.certsDir) {
                errors.push('Certificates directory is required');
            }
            if (config.config.port && (config.config.port < 1 || config.config.port > 65535)) {
                errors.push('Port must be between 1 and 65535');
            }
            if (config.config.enableHttps) {
                if (!config.config.httpsPort || config.config.httpsPort < 1 || config.config.httpsPort > 65535) {
                    errors.push('HTTPS port must be between 1 and 65535');
                }
                if (!config.config.httpsCert) {
                    errors.push('HTTPS certificate path is required when HTTPS is enabled');
                }
                if (!config.config.httpsKey) {
                    errors.push('HTTPS key path is required when HTTPS is enabled');
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
}

module.exports = SetupService;
