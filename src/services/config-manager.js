const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger');

class ConfigManager {
    constructor(configDir) {
        this.configDir = configDir;
        this.certConfigPath = path.join(configDir, 'cert-config.json');
        
        // Ensure the config directory exists
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        // Initialize the caPassphrases object
        this.caPassphrases = {};
        
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
        if (!fingerprint) {
            throw new Error('Fingerprint is required');
        }
        
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

    /**
     * Check if a stored passphrase exists for a CA certificate
     * @param {string} fingerprint - The CA certificate fingerprint
     * @returns {boolean} True if a passphrase is stored
     */
    hasCACertPassphrase(fingerprint) {
        if (!fingerprint) return false;
    
        // First check in-memory cache
        if (this.caPassphrases && this.caPassphrases[fingerprint]) {
        return true;
        }
        
        // Then check persistent storage
        const certConfig = this.getCertConfig(fingerprint) || {};
        return certConfig.hasStoredPassphrase === true;
    }

    /**
     * Store a CA passphrase securely
     * @param {string} fingerprint - The CA certificate fingerprint
     * @param {string} passphrase - The passphrase to store
     * @param {boolean} persistent - Whether to store persistently (default: false)
     */
    setCACertPassphrase(fingerprint, passphrase, persistent = false) {
        if (!fingerprint) {
            throw new Error('Fingerprint is required to store a passphrase');
        }

        // Get current certificate config
        const certConfig = this.getCertConfig(fingerprint) || {};
        
        // In-memory storage (always)
        if (!this.caPassphrases) {
            this.caPassphrases = {};
        }
        this.caPassphrases[fingerprint] = passphrase;
        
        // Persistent storage (optional)
        if (persistent) {
            try {
                // Store an indicator that we have a passphrase
                certConfig.hasStoredPassphrase = true;
                
                // Encrypt the passphrase before storing
                const crypto = require('crypto');
                const key = this.getEncryptionKey();
                const iv = crypto.randomBytes(16);
                const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
                
                let encrypted = cipher.update(passphrase, 'utf8', 'hex');
                encrypted += cipher.final('hex');
                
                // Store the encrypted passphrase and IV
                certConfig.encryptedPassphrase = encrypted;
                certConfig.passphraseIV = iv.toString('hex');
                
                // Save updated config
                this.setCertConfig(fingerprint, certConfig);
                logger.info(`Passphrase stored securely for CA certificate: ${fingerprint}`);
            } catch (error) {
                logger.error(`Failed to store CA passphrase: ${error.message}`);
                throw new Error(`Failed to store CA passphrase: ${error.message}`);
            }
        }
    }

    /**
     * Retrieve a CA passphrase
     * @param {string} fingerprint - The CA certificate fingerprint
     * @returns {string|null} The passphrase or null if not found
     */
    getCACertPassphrase(fingerprint) {
        if (!fingerprint) {
            return null;
        }
        
        // First check in-memory cache
        if (this.caPassphrases && this.caPassphrases[fingerprint]) {
            return this.caPassphrases[fingerprint];
        }
        
        // Then check persistent storage
        const certConfig = this.getCertConfig(fingerprint) || {};
        if (certConfig.hasStoredPassphrase && certConfig.encryptedPassphrase && certConfig.passphraseIV) {
            try {
                // Decrypt the passphrase
                const crypto = require('crypto');
                const key = this.getEncryptionKey();
                const iv = Buffer.from(certConfig.passphraseIV, 'hex');
                
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
                let decrypted = decipher.update(certConfig.encryptedPassphrase, 'hex', 'utf8');
                decrypted += decipher.final('utf8');
                
                // Cache it in memory for future use
                if (!this.caPassphrases) {
                    this.caPassphrases = {};
                }
                this.caPassphrases[fingerprint] = decrypted;
                
                return decrypted;
            } catch (error) {
                logger.error(`Failed to retrieve CA passphrase: ${error.message}`);
                return null;
            }
        }
        
        return null;
    }
    
    /**
     * Delete a stored passphrase
     * @param {string} fingerprint - The CA certificate fingerprint
     */
    deleteCACertPassphrase(fingerprint) {
        // Remove from memory cache
        if (this.caPassphrases && this.caPassphrases[fingerprint]) {
        delete this.caPassphrases[fingerprint];
        }
        
        // Remove from persistent storage
        const certConfig = this.getCertConfig(fingerprint);
        if (certConfig) {
        delete certConfig.hasStoredPassphrase;
        delete certConfig.encryptedPassphrase;
        delete certConfig.passphraseIV;
        this.setCertConfig(fingerprint, certConfig);
        }
    }

    /**
     * Delete a stored passphrase
     * @param {string} fingerprint - The CA certificate fingerprint
     */
    deleteCACertPassphrase(fingerprint) {
        // Remove from memory cache
        if (this.caPassphrases && this.caPassphrases[fingerprint]) {
            delete this.caPassphrases[fingerprint];
        }
        
        // Remove from persistent storage
        const certConfig = this.getCertConfig(fingerprint);
        if (certConfig) {
            delete certConfig.hasStoredPassphrase;
            delete certConfig.encryptedPassphrase;
            delete certConfig.passphraseIV;
            this.setCertConfig(fingerprint, certConfig);
        }
    }

    /**
     * Get encryption key for passphrase storage
     * @private
     * @returns {Buffer} 32-byte encryption key
     */
    getEncryptionKey() {
        // Check if we already have a key in memory
        if (this.encryptionKey) {
            return this.encryptionKey;
        }

        const crypto = require('crypto');
        const fs = require('fs');
        const path = require('path');
        
        // Get the key file path
        const keyFilePath = path.join(this.configDir, '.encryption-key');
        
        // Check if the key file exists
        if (fs.existsSync(keyFilePath)) {
            // Read the existing key
            this.encryptionKey = fs.readFileSync(keyFilePath);
            return this.encryptionKey;
        }
        
        // Generate a new encryption key
        this.encryptionKey = crypto.randomBytes(32);
        
        // Save the key to file
        fs.writeFileSync(keyFilePath, this.encryptionKey, { mode: 0o600 });
        
        return this.encryptionKey;
    }
}

module.exports = ConfigManager;