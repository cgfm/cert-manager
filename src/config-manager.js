const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor(configPath) {
        this.configPath = configPath;
        this.configs = {};
        this.globalDefaults = {
            autoRenewByDefault: true,
            renewDaysBeforeExpiry: 30,
            caValidityPeriod: {
                rootCA: 3650, // 10 years in days
                intermediateCA: 1825, // 5 years in days
                standard: 90 // 3 months in days
            }
        };
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = fs.readFileSync(this.configPath, 'utf8');
                const parsed = JSON.parse(data);
                
                // Load cert-specific configs
                this.configs = parsed.certificates || {};
                
                // Load global defaults, if present, otherwise use built-in defaults
                this.globalDefaults = parsed.globalDefaults || this.globalDefaults;
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
            // Keep default configs
        }
    }

    save() {
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
        this.save();
    }

    getGlobalDefaults() {
        return this.globalDefaults;
    }

    setGlobalDefaults(defaults) {
        this.globalDefaults = { ...this.globalDefaults, ...defaults };
        this.save();
    }

    getAllConfigs() {
        return this.configs;
    }
}

module.exports = ConfigManager;