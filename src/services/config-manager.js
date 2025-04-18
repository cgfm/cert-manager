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
                this.certConfig = this.getDefaultConfig();
                
                // Save the default configuration
                this.saveConfig();
                logger.info('Created default configuration');
            }
        } catch (error) {
            logger.error(`Error loading configuration: ${error.message}`);
            
            // Create default configuration in case of error
            this.certConfig = this.getDefaultConfig();
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

    // Add the normalizeFingerprint function
    normalizeFingerprint(fingerprint) {
        if (!fingerprint) return '';
        
        // Convert to string if needed
        const fp = String(fingerprint);
        
        // Remove common prefixes
        let normalized = fp.replace(/^sha256\s+Fingerprint=\s*/i, '')
                        .replace(/^SHA256 Fingerprint=\s*/i, '')
                        .replace(/^SHA-256 Fingerprint=\s*/i, '');
        
        // Remove all colons and spaces
        normalized = normalized.replace(/[:\s]/g, '');
        
        // Convert to uppercase for consistency
        return normalized.toUpperCase();
    }
    
    /**
     * Get configuration for a specific certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Object|null} - Certificate configuration
     */
    getCertConfig(fingerprint) {
        const normalizedFingerprint = this.normalizeFingerprint(fingerprint);
        
        // Try to find with normalized fingerprint
        for (const [key, value] of Object.entries(this.certConfig.certificates || {})) {
            if (this.normalizeFingerprint(key) === normalizedFingerprint) {
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
     * Remove a certificate configuration
     * @param {string} fingerprint - Certificate fingerprint
     */
    removeCertConfig(fingerprint) {
        // Normalize fingerprint by removing prefix if present
        const normalizedFingerprint = this.normalizeFingerprint(fingerprint);
        
        // First try exact match
        if (this.certConfig.certificates[fingerprint]) {
            delete this.certConfig.certificates[fingerprint];
            this.saveConfig();
            return;
        }
        
        // Then try normalized match
        if (this.certConfig.certificates[normalizedFingerprint]) {
            delete this.certConfig.certificates[normalizedFingerprint];
            this.saveConfig();
            return;
        }
        
        // Try to find by normalized fingerprint in all keys
        for (const key of Object.keys(this.certConfig.certificates)) {
            if (this.normalizeFingerprint(key) === normalizedFingerprint) {
                delete this.certConfig.certificates[key];
                this.saveConfig();
                return;
            }
        }
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

    /**
     * Get default configuration
     * @returns {Object} - Default configuration
     */
    getDefaultConfig() {
        return {
            certificates: {},
            globalDefaults: {
                caValidityPeriod: {
                    rootCA: 3650, // 10 years
                    intermediateCA: 1825, // 5 years
                    standard: 365 // 1 year
                },
                renewDaysBeforeExpiry: 30,
                enableAutoRenew: true,
                // New scheduler settings
                enableAutoRenewalJob: true,
                renewalSchedule: '0 0 * * *', // Default: Run daily at midnight
                lastRenewalCheck: null
            }
        };
    }
}

module.exports = ConfigManager;