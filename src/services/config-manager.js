const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class ConfigManager {
    constructor(configDir) {
        this.configDir = configDir;
        this.certConfigPath = path.join(configDir, 'cert-config.json');
        
        // Ensure the config directory exists
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        // Load configuration
        this.loadConfig();
    }
    

    // Helper method to get boolean env var
    getBooleanEnv(name, defaultValue) {
        const value = process.env[name];
        if (value === undefined) return defaultValue;
        return value.toLowerCase() === 'true' || value === '1';
    }

    // Helper method to get number env var
    getNumberEnv(name, defaultValue) {
        const value = process.env[name];
        if (value === undefined) return defaultValue;
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? defaultValue : parsed;
    }

    /**
     * Load configuration from file
     */
    loadConfig() {
        try {
            if (fs.existsSync(this.certConfigPath)) {
                const configData = fs.readFileSync(this.certConfigPath, 'utf8');
                this.certConfig = JSON.parse(configData);
                
                // Ensure required structures exist
                if (!this.certConfig.globalDefaults) {
                    this.certConfig.globalDefaults = {
                        autoRenewByDefault: false,
                        renewDaysBeforeExpiry: 30,
                        caValidityPeriod: {
                            rootCA: 3650,
                            intermediateCA: 1825,
                            standard: 90
                        },
                        enableCertificateBackups: true
                    };
                }
                
                if (!this.certConfig.certificates) {
                    this.certConfig.certificates = {};
                }
                
                logger.info(`Loaded configuration with ${Object.keys(this.certConfig.certificates).length} certificates`);
            } else {
                // Create default configuration
                this.certConfig = {
                    globalDefaults: {
                        autoRenewByDefault: false,
                        renewDaysBeforeExpiry: 30,
                        caValidityPeriod: {
                            rootCA: 3650,
                            intermediateCA: 1825,
                            standard: 90
                        },
                        enableCertificateBackups: true
                    },
                    certificates: {}
                };
                
                // Save the default configuration
                this.saveConfig();
                logger.info('Created default configuration');
            }
        } catch (error) {
            logger.error(`Error loading configuration: ${error.message}`);
            
            // Create default configuration in case of error
            this.certConfig = {
                globalDefaults: {
                    autoRenewByDefault: false,
                    renewDaysBeforeExpiry: 30,
                    caValidityPeriod: {
                        rootCA: 3650,
                        intermediateCA: 1825,
                        standard: 90
                    },
                    enableCertificateBackups: true
                },
                certificates: {}
            };
        }
    }
    
    /**
     * Save configuration to file
     */
    saveConfig() {
        try {
            const configData = JSON.stringify(this.certConfig, null, 2);
            fs.writeFileSync(this.certConfigPath, configData, 'utf8');
            logger.info('Configuration saved successfully');
        } catch (error) {
            logger.error(`Error saving configuration: ${error.message}`);
        }
    }
    
    /**
     * Get configuration for a specific certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Object|null} - Certificate configuration
     */
    getCertConfig(fingerprint) {
        // Normalize fingerprint by removing prefix if present
        const normalizedFingerprint = fingerprint.replace(/^sha256\s+Fingerprint=\s*/i, '');
        
        // First try exact match
        if (this.certConfig.certificates[fingerprint]) {
            return this.certConfig.certificates[fingerprint];
        }
        
        // Then try normalized match
        if (this.certConfig.certificates[normalizedFingerprint]) {
            return this.certConfig.certificates[normalizedFingerprint];
        }
        
        // Try to find by normalized fingerprint in all keys
        for (const [key, value] of Object.entries(this.certConfig.certificates)) {
            const normalizedKey = key.replace(/^sha256\s+Fingerprint=\s*/i, '');
            if (normalizedKey === normalizedFingerprint) {
                return value;
            }
        }
        
        // No matching configuration found
        return null;
    }
    
    /**
     * Set configuration for a specific certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @param {Object} config - Certificate configuration
     */
    setCertConfig(fingerprint, config) {
        // Create default config if none exists
        this.certConfig.certificates[fingerprint] = {
            ...config,
            // Preserve metadata if it exists
            metadata: this.certConfig.certificates[fingerprint]?.metadata || {}
        };
        
        this.saveConfig();
    }

    /**
     * Get global defaults
     * @returns {Object} - Global defaults
     */
    getGlobalDefaults() {
        return this.certConfig.globalDefaults;
    }
    
    /**
     * Set global defaults
     * @param {Object} defaults - Global defaults
     */
    setGlobalDefaults(defaults) {
        this.certConfig.globalDefaults = defaults;
        this.saveConfig();
    }

    /**
     * Get all certificate configurations
     * @returns {Object} - All certificate configurations
     */
    getAllCertConfigs() {
        return this.certConfig;
    }
    
    /**
     * Save all certificate configurations
     * @param {Object} config - Certificate configurations
     */
    saveAllCertConfigs(config) {
        this.certConfig = config;
        this.saveConfig();
    }
    
    /**
     * Get certificate metadata by fingerprint
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Object|null} - Certificate metadata
     */
    getCertificateMetadata(fingerprint) {
        const config = this.getCertConfig(fingerprint);
        return config?.metadata || null;
    }
    
    /**
     * Get all certificates with metadata
     * @returns {Array} - Array of certificate objects with metadata
     */
    getAllCertificatesWithMetadata() {
        const result = [];
        
        for (const [fingerprint, config] of Object.entries(this.certConfig.certificates)) {
            // Only include certificates with metadata
            if (config.metadata) {
                result.push({
                    ...config.metadata,
                    fingerprint,
                    domains: config.domains || [],
                    autoRenew: config.autoRenew,
                    renewDaysBeforeExpiry: config.renewDaysBeforeExpiry,
                    deployActions: config.deployActions || []
                });
            }
        }
        
        return result;
    }
}

module.exports = ConfigManager;