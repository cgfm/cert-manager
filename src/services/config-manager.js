const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor(configPath) {
        // Define config directory from environment or default
        const configDir = process.env.CONFIG_DIR || '/config';
        
        // Use environment variable for config path if available
        this.configPath = process.env.CONFIG_PATH || configPath || path.join(configDir, 'cert-config.json');
        
        // Define additional config paths
        this.certInfoPath = process.env.CERT_INFO_PATH || path.join(configDir, 'cert-info.json');
        this.settingsPath = process.env.SETTINGS_PATH || path.join(configDir, 'settings.json');
        
        this.configs = {};
        
        // Default values which will be overridden by env vars if present
        this.defaultSettings = {
            autoRenewByDefault: process.env.AUTO_RENEW_DEFAULT === 'true',
            renewDaysBeforeExpiry: parseInt(process.env.RENEW_DAYS_BEFORE_EXPIRY) || 30,
            caValidityPeriod: {
                rootCA: parseInt(process.env.ROOT_CA_VALIDITY_DAYS) || 3650, // 10 years in days
                intermediateCA: parseInt(process.env.INTERMEDIATE_CA_VALIDITY_DAYS) || 1825, // 5 years in days
                standard: parseInt(process.env.STANDARD_CERT_VALIDITY_DAYS) || 90 // 3 months in days
            },
            enableCertificateBackups: process.env.ENABLE_CERTIFICATE_BACKUPS !== 'false',
            enableHttps: false,
            httpsCertPath: '',
            httpsKeyPath: '',
            httpsPort: parseInt(process.env.HTTPS_PORT) || 4443,
            // Add backupRetention setting
            backupRetention: parseInt(process.env.BACKUP_RETENTION_DAYS) || 30
        };
        
        // Load global config or use defaults
        try {
            this.loadConfig();
        } catch (error) {
            console.error(`Failed to load config: ${error.message}`);
            console.info('Using default configuration');
            this.configs.global = { ...this.defaultSettings };
            
            // Try to write the default config
            try {
                this.saveConfig();
                console.info(`Created default config at ${this.configPath}`);
            } catch (writeError) {
                console.error(`Failed to write default config: ${writeError.message}`);
            }
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

    loadConfig() {
        // Implement loading configuration from file
        if (fs.existsSync(this.configPath)) {
            try {
                const data = fs.readFileSync(this.configPath, 'utf8');
                this.configs = JSON.parse(data);
                
                // Ensure we have global config
                if (!this.configs.global) {
                    this.configs.global = { ...this.defaultSettings };
                }
            } catch (err) {
                console.error(`Error reading config file: ${err.message}`);
                this.configs = { global: { ...this.defaultSettings } };
            }
        } else {
            console.log(`Config file not found at ${this.configPath}, using defaults`);
            this.configs = { global: { ...this.defaultSettings } };
            this.saveConfig(); // Create the config file with defaults
        }
    }

    saveConfig() {
        // Make sure directory exists
        const dir = path.dirname(this.configPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        // Write config to file
        fs.writeFileSync(this.configPath, JSON.stringify(this.configs, null, 2));
    }

    getCertConfig(fingerprint) {
        if (!this.configs.certs) {
            this.configs.certs = {};
        }
        
        if (!this.configs.certs[fingerprint]) {
            // Return default settings for new certificates
            return {
                autoRenew: this.configs.global.autoRenewByDefault || false,
                renewDaysBeforeExpiry: this.configs.global.renewDaysBeforeExpiry || 30,
                deployActions: []
            };
        }
        
        return this.configs.certs[fingerprint];
    }

    setCertConfig(fingerprint, config) {
        if (!this.configs.certs) {
            this.configs.certs = {};
        }
        
        this.configs.certs[fingerprint] = { ...config };
        this.saveConfig();
    }

    deleteCertConfig(fingerprint) {
        if (this.configs.certs && this.configs.certs[fingerprint]) {
            delete this.configs.certs[fingerprint];
            this.saveConfig();
            return true;
        }
        return false;
    }

    getGlobalConfig() {
        // Ensure we have a global config
        if (!this.configs.global) {
            this.configs.global = { ...this.defaultSettings };
        }
        
        // Make sure required structures exist to prevent errors later
        if (!this.configs.global.caValidityPeriod) {
            this.configs.global.caValidityPeriod = { ...this.defaultSettings.caValidityPeriod };
        }
        
        // Make sure validity periods have values
        ['rootCA', 'intermediateCA', 'standard'].forEach(certType => {
            if (!this.configs.global.caValidityPeriod[certType]) {
                this.configs.global.caValidityPeriod[certType] = this.defaultSettings.caValidityPeriod[certType];
            }
        });
        
        return this.configs.global;
    }

    setGlobalConfig(settings) {
        this.configs.global = { ...settings };
        this.saveConfig();
    }

    getGlobalDefaults() {
        return { ...this.defaultSettings };
    }

    getAllConfigs() {
        return this.configs;
    }

    updateGlobalDefaults(newDefaults) {
        if (!newDefaults || typeof newDefaults !== 'object') {
            throw new Error('Invalid global defaults object');
        }
        
        if (!newDefaults.caValidityPeriod && this.configs.global.caValidityPeriod) {
            newDefaults.caValidityPeriod = this.configs.global.caValidityPeriod;
        }
        
        this.configs.global = newDefaults;
        this.saveConfig();
        
        return true;
    }
}

module.exports = ConfigManager;