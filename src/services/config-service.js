/**
 * @module ConfigService
 * @requires fs
 * @requires path
 * @requires logger
 * @version 0.0.2
 * @license MIT
 * @author Christian Meiners
 * @description This module provides configuration management, loading settings from files and environment variables.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

const FILENAME = 'services/config-service.js';

class ConfigService {
    /**
     * Create a new ConfigService
     * @param {Object} options - Configuration options
     * @param {string} options.configDir - Directory for configuration files
     */
    constructor(options = {}) {
        // Get config directory from options, environment variable or default path
        this.configDir = options.configDir || 
                        process.env.CONFIG_DIR || 
                        process.env.CERT_MANAGER_CONFIG_DIR || 
                        '/config';
        
        // Ensure config directory exists
        try {
            if (!fs.existsSync(this.configDir)) {
                fs.mkdirSync(this.configDir, { recursive: true });
                logger.info(`Created configuration directory: ${this.configDir}`, null, FILENAME);
            }
        } catch (error) {
            logger.error(`Error creating config directory ${this.configDir}:`, error, FILENAME);
            // Fall back to a directory we know should be writable
            this.configDir = process.env.HOME || process.env.USERPROFILE || '/tmp';
            logger.info(`Using fallback config directory: ${this.configDir}`, null, FILENAME);
        }
        
        this.settingsPath = path.join(this.configDir, 'settings.json');
        
        this.certPath = options.certPath || 
                       process.env.CERT_PATH || 
                       process.env.CERT_MANAGER_CERT_PATH || 
                       '/certs';
                       
        // Ensure certificate directory exists
        try {
            if (!fs.existsSync(this.certPath)) {
                fs.mkdirSync(this.certPath, { recursive: true });
                logger.info(`Created certificates directory: ${this.certPath}`, null, FILENAME);
            }
        } catch (error) {
            logger.error(`Error creating certificates directory ${this.certPath}:`, error, FILENAME);
            // Fall back to a directory we know should be writable
            this.certPath = process.env.HOME || process.env.USERPROFILE || '/tmp';
            logger.info(`Using fallback config directory: ${this.certPath}`, null, FILENAME);
        }
        // Define default settings
        this.defaultSettings = {
            configDir: this.configDir,
            certPath: this.certPath,
            enableHttps: false,
            httpsPort: 4443,
            httpsCertPath: null,
            httpsKeyPath: null,
            openSSLPath: "openssl",
            caValidityPeriod: {
                rootCA: 3650, // 10 years
                intermediateCA: 1825, // 5 years
                standard: 90   // 3 months
            },
            autoRenewByDefault: true,
            renewDaysBeforeExpiry: 30,
            logLevel: "info",
            jsonOutput: false,
            enableCertificateBackups: true,
            keepBackupsForever: true,
            backupRetention: 90,
            signStandardCertsWithCA: false,
            enableAutoRenewalJob: true,
            renewalSchedule: "0 0 * * *",
            enableFileWatch: true,
            // Add deployment settings to the default settings
            deployment: {
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
                    password: '',
                    accessToken: '',
                    refreshToken: '',
                    tokenExpiry: null
                },
                dockerDefaults: {
                    socketPath: '/var/run/docker.sock',
                    host: '',
                    port: 2375,
                    useTLS: false
                }
            }
        };

        // Security config
        this.security = {
            disableAuth: process.env.DISABLE_AUTH === 'true',
            authMode: process.env.AUTH_MODE || 'basic',  // basic, oidc, ldap
            jwtSecret: process.env.JWT_SECRET || '',     // Will be auto-generated if empty
            tokenExpiration: process.env.TOKEN_EXPIRATION || '8h'
        };
        
        // Load settings from file
        this.fileSettings = this.loadSettings();
        
        // Process environment variables and create effective settings
        this.processEnvironmentVariables();
        
        this.config = {};
        this.loaded = false;
        
        logger.debug('ConfigService initialized with settings from file and environment variables', null, FILENAME);
    }

    /**
     * Process environment variables to override file settings
     * This centralizes all environment variable processing
     */
    processEnvironmentVariables() {
        // Start with file-based settings
        this.effectiveSettings = { ...this.fileSettings };
        
        // Environment variable mapping - define mappings for special/complex cases
        const envMappings = {
            'PORT': 'port',
            'CERTS_DIR': 'certPath',
            'ENABLE_AUTO_RENEWAL': 'enableAutoRenewalJob',
            'ENABLE_FILE_WATCHER': 'enableFileWatch',
            'RENEWAL_SCHEDULE': 'renewalSchedule'
        };
        
        // Process direct mappings first
        Object.entries(envMappings).forEach(([envName, settingKey]) => {
            if (process.env[envName] !== undefined) {
                const value = this.parseEnvValue(process.env[envName]);
                this.effectiveSettings[settingKey] = value;
                logger.debug(`Setting '${settingKey}' overridden by environment variable ${envName}=${value}`, null, FILENAME);
            }
        });
        
        // Process standard CERT_MANAGER_ environment variables
        Object.keys(process.env)
            .filter(key => key.startsWith('CERT_MANAGER_'))
            .forEach(envName => {
                const settingKey = this.envToSettingKey(envName.replace('CERT_MANAGER_', ''));
                if (settingKey) {
                    const value = this.parseEnvValue(process.env[envName]);
                    this.effectiveSettings[settingKey] = value;
                    logger.debug(`Setting '${settingKey}' overridden by environment variable ${envName}=${value}`, null, FILENAME);
                }
            });
    }
    
    /**
     * Convert environment variable name to settings key
     * @param {string} envName - Environment variable name (without prefix)
     * @returns {string} Settings key
     */
    envToSettingKey(envName) {
        // Convert SNAKE_CASE to camelCase
        return envName.toLowerCase()
            .replace(/_([a-z])/g, (match, letter) => letter.toUpperCase());
    }
    
    /**
     * Parse environment variable value to appropriate type
     * @param {string} value - Environment variable value
     * @returns {*} Parsed value
     */
    parseEnvValue(value) {
        if (value === 'true') return true;
        if (value === 'false') return false;
        if (!isNaN(value) && value !== '') return Number(value);
        return value;
    }

    /**
     * Load settings from configuration file
     * @returns {Object} The loaded settings
     */
    loadSettings() {
        try {
            // Create config directory if it doesn't exist
            if (!fs.existsSync(this.configDir)) {
                fs.mkdirSync(this.configDir, { recursive: true });
            }

            // Create default settings file if it doesn't exist
            if (!fs.existsSync(this.settingsPath)) {
                this.saveSettings(this.defaultSettings);
                return this.defaultSettings;
            }

            try {
                // Read settings from file
                const fileContents = fs.readFileSync(this.settingsPath, 'utf8');
                
                // Try to parse JSON, but handle JSON with comments
                let settings;
                try {
                    settings = JSON.parse(fileContents);
                } catch (jsonError) {
                    logger.warn(`Invalid JSON in settings file: ${jsonError.message}. Removing comments and trying again...`, null, FILENAME);
                    
                    // Try to fix common JSON issues (comments and trailing commas)
                    const cleanedJson = fileContents
                        // Remove comments (both // and /* */)
                        .replace(/\/\/.*$/gm, '')
                        .replace(/\/\*[\s\S]*?\*\//g, '')
                        // Remove trailing commas
                        .replace(/,(\s*[\]}])/g, '$1');
                    
                    try {
                        settings = JSON.parse(cleanedJson);
                        // Since we successfully parsed after cleaning, save the clean version
                        fs.writeFileSync(this.settingsPath, JSON.stringify(settings, null, 2), 'utf8');
                        logger.info('Settings file has been automatically reformatted to valid JSON', null, FILENAME);
                    } catch (fallbackError) {
                        // If we still can't parse it, use default settings
                        logger.error(`Could not parse settings file even after cleaning: ${fallbackError.message}`, null, FILENAME);
                        return this.defaultSettings;
                    }
                }

                // Merge with default settings to ensure all properties exist
                return { ...this.defaultSettings, ...settings };
            } catch (error) {
                logger.error('Error reading settings file:', error, FILENAME);
                return this.defaultSettings;
            }
        } catch (error) {
            logger.error('Error loading settings:', error, FILENAME);
            return this.defaultSettings;
        }
    }

    /**
     * Save settings to configuration file
     * @param {Object} settings - Settings to save
     * @returns {boolean} Success status
     */
    saveSettings(settings) {
        try {
            // Create config directory if it doesn't exist
            if (!fs.existsSync(this.configDir)) {
                fs.mkdirSync(this.configDir, { recursive: true });
            }

            // Write settings to file
            fs.writeFileSync(
                this.settingsPath,
                JSON.stringify(settings, null, 2),
                'utf8'
            );

            // Update file settings
            this.fileSettings = settings;
            
            // Re-process environment variables to update effective settings
            this.processEnvironmentVariables();
            
            return true;
        } catch (error) {
            logger.error('Error saving settings:', error, FILENAME);
            return false;
        }
    }

    /**
     * Update specific settings
     * @param {Object} newSettings - Settings to update
     * @returns {boolean} Success status
     */
    updateSettings(newSettings) {
        try {
            // Merge new settings with existing file settings
            const updatedSettings = { ...this.fileSettings, ...newSettings };
            const result = this.saveSettings(updatedSettings);
            
            // Update effective settings
            if (result) {
                this.effectiveSettings = { ...this.effectiveSettings, ...newSettings };
            }
            
            return result;
        } catch (error) {
            logger.error('Error updating settings:', error, FILENAME);
            return false;
        }
    }

    /**
     * Update method alias for updateSettings (for compatibility)
     * @param {Object} newConfig - New configuration
     * @param {string} section - Not used, kept for compatibility
     * @returns {boolean} Success status
     */
    update(newConfig, section = null) {
        logger.debug('ConfigService.update called (compatibility method)', null, FILENAME);
        return this.updateSettings(newConfig);
    }

    /**
     * Get settings value(s)
     * @param {string|null} key - Setting key or null to get all settings
     * @param {*} defaultValue - Default value if key not found
     * @returns {*} The setting value or entire settings object
     */
    get(key = null, defaultValue = null) {
        // Return all settings if no key provided
        if (key === null) {
            return { ...this.effectiveSettings };
        }
        
        // Return specific setting or default value
        return this.effectiveSettings[key] !== undefined ? 
            this.effectiveSettings[key] : defaultValue;
    }
}

// Create and export singleton instance
const configService = new ConfigService();
module.exports = configService;