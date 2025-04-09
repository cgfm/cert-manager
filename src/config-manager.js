const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor(configPath) {
        // Use environment variable for config path if available
        this.configPath = process.env.CONFIG_PATH || configPath || '/config/cert-config.json';
        this.configs = {};
        
        // Default values which will be overridden by env vars if present
        const defaultSettings = {
            autoRenewByDefault: false, // Changed to false by default
            renewDaysBeforeExpiry: 30,
            caValidityPeriod: {
                rootCA: 3650, // 10 years in days
                intermediateCA: 1825, // 5 years in days
                standard: 90 // 3 months in days
            },
            enableCertificateBackups: true,
            // New HTTPS settings
            enableHttps: false,
            httpsCertPath: '',
            httpsKeyPath: '',
            httpsPort: 4443
        };
        
        // Initialize this.config before trying to access its properties
        this.config = {
            globalDefaults: {},
            certificates: {}
        };
        
        // Override defaults with environment variables if they exist
        this.globalDefaults = {
            autoRenewByDefault: this.getBooleanEnv('AUTO_RENEW_DEFAULT', defaultSettings.autoRenewByDefault),
            renewDaysBeforeExpiry: this.getNumberEnv('RENEW_DAYS_BEFORE_EXPIRY', defaultSettings.renewDaysBeforeExpiry),
            caValidityPeriod: {
                rootCA: this.getNumberEnv('ROOT_CA_VALIDITY_DAYS', defaultSettings.caValidityPeriod.rootCA),
                intermediateCA: this.getNumberEnv('INTERMEDIATE_CA_VALIDITY_DAYS', defaultSettings.caValidityPeriod.intermediateCA),
                standard: this.getNumberEnv('STANDARD_CERT_VALIDITY_DAYS', defaultSettings.caValidityPeriod.standard)
            },
            enableCertificateBackups: this.getBooleanEnv('ENABLE_CERTIFICATE_BACKUPS', defaultSettings.enableCertificateBackups),
            enableHttps: this.getBooleanEnv('ENABLE_HTTPS', defaultSettings.enableHttps),
            httpsCertPath: process.env.HTTPS_CERT_PATH || defaultSettings.httpsCertPath,
            httpsKeyPath: process.env.HTTPS_KEY_PATH || defaultSettings.httpsKeyPath,
            httpsPort: this.getNumberEnv('HTTPS_PORT', defaultSettings.httpsPort)
        };
        
        this.load();

        // Set default global settings if they don't exist
        if (!this.config.globalDefaults) {
            this.config.globalDefaults = {
                autoRenewByDefault: false,
                renewDaysBeforeExpiry: 30,
                caValidityPeriod: {
                    rootCA: 3650,
                    intermediateCA: 1825,
                    standard: 90
                },
                enableCertificateBackups: true,
                backupRetention: 3,
                enableHttps: false,
                httpsPort: 4443,
                httpsCertPath: '',
                httpsKeyPath: '',
                managedCertName: '',
                openSSLPath: 'openssl',
                logLevel: 'info',
                jsonOutput: false
            };
            this.saveConfig();
        } else {
            // Ensure all settings exist with default values
            const defaults = {
                autoRenewByDefault: false,
                renewDaysBeforeExpiry: 30,
                caValidityPeriod: {
                    rootCA: 3650,
                    intermediateCA: 1825,
                    standard: 90
                },
                enableCertificateBackups: true,
                backupRetention: 3,
                enableHttps: false,
                httpsPort: 4443,
                httpsCertPath: '',
                httpsKeyPath: '',
                managedCertName: '',
                openSSLPath: 'openssl',
                logLevel: 'info',
                jsonOutput: false
            };
            
            // Merge defaults with existing values
            this.config.globalDefaults = {
                ...defaults,
                ...this.config.globalDefaults,
                caValidityPeriod: {
                    ...defaults.caValidityPeriod,
                    ...(this.config.globalDefaults.caValidityPeriod || {})
                }
            };
            
            this.saveConfig();
        }
        
        if (!this.config.certificates) {
            this.config.certificates = {};
            this.saveConfig();
        }
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

    load() {
        try {
            // Initialize default configuration structure
            this.config = {
                globalDefaults: {},
                certificates: {}
            };
            
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                const parsed = JSON.parse(data);
                
                // Load cert-specific configs
                this.configs = parsed.certificates || {};
                
                // For global defaults, we merge the stored values with environment variables
                // Environment variables take precedence
                if (parsed.globalDefaults) {
                    this.globalDefaults = {
                        autoRenewByDefault: this.getBooleanEnv('AUTO_RENEW_DEFAULT', parsed.globalDefaults.autoRenewByDefault),
                        renewDaysBeforeExpiry: this.getNumberEnv('RENEW_DAYS_BEFORE_EXPIRY', parsed.globalDefaults.renewDaysBeforeExpiry),
                        caValidityPeriod: {
                            rootCA: this.getNumberEnv('ROOT_CA_VALIDITY_DAYS', parsed.globalDefaults.caValidityPeriod?.rootCA || this.globalDefaults.caValidityPeriod.rootCA),
                            intermediateCA: this.getNumberEnv('INTERMEDIATE_CA_VALIDITY_DAYS', parsed.globalDefaults.caValidityPeriod?.intermediateCA || this.globalDefaults.caValidityPeriod.intermediateCA),
                            standard: this.getNumberEnv('STANDARD_CERT_VALIDITY_DAYS', parsed.globalDefaults.caValidityPeriod?.standard || this.globalDefaults.caValidityPeriod.standard)
                        },
                        enableCertificateBackups: this.getBooleanEnv('ENABLE_CERTIFICATE_BACKUPS', parsed.globalDefaults.enableCertificateBackups),
                        enableHttps: this.getBooleanEnv('ENABLE_HTTPS', parsed.globalDefaults.enableHttps),
                        httpsCertPath: process.env.HTTPS_CERT_PATH || parsed.globalDefaults.httpsCertPath,
                        httpsKeyPath: process.env.HTTPS_KEY_PATH || parsed.globalDefaults.httpsKeyPath,
                        httpsPort: this.getNumberEnv('HTTPS_PORT', parsed.globalDefaults.httpsPort)
                    };
                }
            } else {
                console.log(`Config file not found at ${this.configPath}. Using default settings.`);
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
            console.log('Using default settings instead.');
        }
    }

    saveConfig() {
        try {
            const dir = path.dirname(this.configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            const fullConfig = {
                globalDefaults: this.globalDefaults,
                certificates: this.configs
            };
            
            fs.writeFileSync(this.configPath, JSON.stringify(fullConfig, null, 2));
        } catch (error) {
            console.error('Error saving configuration:', error);
        }
    }

    getCertConfig(fingerprint) {
        return this.configs[fingerprint] || {
            autoRenew: this.globalDefaults.autoRenewByDefault,
            renewDaysBeforeExpiry: this.globalDefaults.renewDaysBeforeExpiry,
            deployActions: []
        };
    }

    setCertConfig(fingerprint, config) {
        this.configs[fingerprint] = config;
        this.saveConfig(); // If this was using save(), change it
    }

    getGlobalDefaults() {
        return this.globalDefaults;
    }

    setGlobalDefaults(defaults) {
        // Environment variables always take precedence over UI-set values
        this.globalDefaults = { 
            ...defaults,
            autoRenewByDefault: this.getBooleanEnv('AUTO_RENEW_DEFAULT', defaults.autoRenewByDefault),
            renewDaysBeforeExpiry: this.getNumberEnv('RENEW_DAYS_BEFORE_EXPIRY', defaults.renewDaysBeforeExpiry),
            caValidityPeriod: {
                rootCA: this.getNumberEnv('ROOT_CA_VALIDITY_DAYS', defaults.caValidityPeriod.rootCA),
                intermediateCA: this.getNumberEnv('INTERMEDIATE_CA_VALIDITY_DAYS', defaults.caValidityPeriod.intermediateCA),
                standard: this.getNumberEnv('STANDARD_CERT_VALIDITY_DAYS', defaults.caValidityPeriod.standard)
            },
            enableCertificateBackups: this.getBooleanEnv('ENABLE_CERTIFICATE_BACKUPS', defaults.enableCertificateBackups),
            enableHttps: this.getBooleanEnv('ENABLE_HTTPS', defaults.enableHttps),
            httpsCertPath: process.env.HTTPS_CERT_PATH || defaults.httpsCertPath,
            httpsKeyPath: process.env.HTTPS_KEY_PATH || defaults.httpsKeyPath,
            httpsPort: this.getNumberEnv('HTTPS_PORT', defaults.httpsPort)
        };
        this.saveConfig(); // If this was using save(), change it
        
        // Return the actual values after environment variable processing
        return this.globalDefaults;
    }

    getAllConfigs() {
        return this.configs;
    }

    updateGlobalDefaults(newDefaults) {
        // Validate the new defaults first
        if (!newDefaults || typeof newDefaults !== 'object') {
            throw new Error('Invalid global defaults object');
        }
        
        // Keep required structures if they exist in current settings
        if (!newDefaults.caValidityPeriod && this.config.globalDefaults.caValidityPeriod) {
            newDefaults.caValidityPeriod = this.config.globalDefaults.caValidityPeriod;
        }
        
        // Update the configuration
        this.config.globalDefaults = newDefaults;
        
        // Save the configuration to disk
        this.saveConfig();
        
        return true;
    }
}

module.exports = ConfigManager;