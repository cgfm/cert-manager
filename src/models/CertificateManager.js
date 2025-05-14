const fs = require('fs');
const path = require('path');
const Certificate = require('./Certificate');
const PassphraseManager = require('../services/PassphraseManager');
const OpenSSLWrapper = require('../services/openssl-wrapper');
const logger = require('../services/logger');

const FILENAME = 'models/CertificateManager.js';

/**
 * @class CertificateManager
 * Enhanced with a caching mechanism to improve performance when refreshing the frontend.
 */
class CertificateManager {
    /**
     * Create a certificate manager
     * @param {string} certsDir - Directory where certificates are stored
     * @param {string} configPath - Path to certificate configuration file
     * @param {string} configDir - Directory for configuration files
          */
    constructor(certsDir, configPath, configDir, openSSL, activityService = null) {
        const DEFAULT_CERTS_DIR = path.join(process.cwd(), 'certs');
        const DEFAULT_CONFIG_DIR = path.join(process.cwd(), 'config');

        // Initialization state flag
        this.isInitialized = false;

        // Ensure certsDir is an absolute path
        this.certsDir = certsDir ? path.resolve(certsDir) : DEFAULT_CERTS_DIR;
        logger.debug(`Using certificates directory: ${this.certsDir}`, null, FILENAME);

        // Set up config directory and paths
        this.configDir = configDir ? path.resolve(configDir) : DEFAULT_CONFIG_DIR;
        logger.debug(`Using configuration directory: ${this.configDir}`, null, FILENAME);

        // If configPath is provided, use it directly; otherwise construct the path
        if (configPath) {
            // If configPath is relative, make it absolute based on configDir
            this.configPath = path.isAbsolute(configPath) ?
                configPath : path.join(this.configDir, configPath);
        } else {
            this.configPath = path.join(this.configDir, 'certificates.json');
        }

        logger.debug(`Certificate configuration path: ${this.configPath}`, null, FILENAME);

        // Create directories if they don't exist
        try {
            if (!fs.existsSync(this.certsDir)) {
                fs.mkdirSync(this.certsDir, { recursive: true });
                logger.info(`Created certificates directory: ${this.certsDir}`, null, FILENAME);
            }

            if (!fs.existsSync(this.configDir)) {
                fs.mkdirSync(this.configDir, { recursive: true });
                logger.info(`Created configuration directory: ${this.configDir}`, null, FILENAME);
            }

            // Make sure the parent directory of configPath exists
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
                logger.info(`Created config parent directory: ${configDir}`, null, FILENAME);
            }
        } catch (error) {
            logger.error(`Error creating directory structure: ${error.message}`, null, FILENAME);
        }

        this.certificates = new Map();

        // Cache-related properties
        this.lastRefreshTime = 0;
        this.cacheExpiryTime = 5 * 60 * 1000; // Default 5 minutes
        this.configLastModified = 0;
        this.certificatesLastModified = {}; // Map of fingerprint -> last modified time
        this.pendingChanges = new Set(); // Set of fingerprints with pending changes

        // Initialize passphrase manager
        this.passphraseManager = new PassphraseManager(configDir);

        // Initialize OpenSSL wrapper
        this.openssl = openSSL;

        // Initialize activity service
        this.activityService = activityService;

        this.loadCertificates().then(() => {
            this.isInitialized = true;
            logger.info('Certificate manager initialization complete', null, FILENAME);
        }).catch(error => {
            logger.error('Error during certificate manager initialization:', error, FILENAME);
            // Still mark as initialized to prevent permanent loading state
            this.isInitialized = true;
        });

        // Load the configuration file's last modified time
        try {
            const stats = fs.statSync(configPath);
            this.configLastModified = stats.mtimeMs;
        } catch (error) {
            // Config file might not exist yet
            logger.debug(`No certificate config found at ${configPath} or couldn't read stats`, null, FILENAME);
        }
    }

    /**
     * Set cache expiry time
     * @param {number} milliseconds - Time in milliseconds for cache to live
     */
    setCacheExpiryTime(milliseconds) {
        if (typeof milliseconds === 'number' && milliseconds >= 0) {
            this.cacheExpiryTime = milliseconds;
            logger.info(`Certificate cache expiry time set to ${milliseconds}ms`, null, FILENAME);
        } else {
            logger.warn(`Invalid cache expiry time: ${milliseconds}, using default`, null, FILENAME);
        }
    }

    /**
     * Check if cache is still valid
     * @param {boolean} deepCheck - Whether to check file modifications as well
     * @returns {boolean} True if cache is valid
     */
    isCacheValid(deepCheck = false) {
        // If we have certificates and no pending changes, consider the cache valid
        // This relies on the renewal manager to notify us of any filesystem changes
        if (this.certificates.size > 0 && this.pendingChanges.size === 0) {
            logger.fine('Certificate cache is valid - using cached data', null, FILENAME);
            return true;
        }

        // If we have pending changes but the cache is otherwise populated,
        // we can just refresh those specific certificates
        if (this.certificates.size > 0 && this.pendingChanges.size > 0) {
            logger.fine(`Certificate cache has ${this.pendingChanges.size} pending changes - partial refresh needed`, null, FILENAME);
            return true;
        }

        // Cache is not valid (empty or invalid)
        logger.fine('Certificate cache is not valid - full refresh needed', null, FILENAME);
        return false;
    }

    /**
     * Invalidate the cache for specific certificates or entire cache
     * @param {string|Array<string>} [fingerprints] - Specific certificate fingerprint(s) to invalidate, or all if omitted
     */
    invalidateCache(fingerprints = null) {
        if (fingerprints === null) {
            // Invalidate entire cache
            this.lastRefreshTime = 0;
            this.pendingChanges.clear(); // Clear pending changes since we're reloading everything
            logger.fine('Invalidated entire certificate cache', null, FILENAME);
        } else {
            // Convert single fingerprint to array if needed
            const fingerprintArray = Array.isArray(fingerprints) ? fingerprints : [fingerprints];

            // Add to pending changes
            fingerprintArray.forEach(fingerprint => {
                this.pendingChanges.add(fingerprint);
                logger.fine(`Marked certificate ${fingerprint} as needing refresh`, null, FILENAME);
            });
        }
    }

    /**
     * Notify the certificate manager about a certificate change
     * @param {string} fingerprint - Certificate fingerprint that was changed
     * @param {string} [changeType='update'] - Type of change ('update', 'create', 'delete')
     */
    notifyCertificateChanged(fingerprint, changeType = 'update') {
        if (!fingerprint) return;

        this.pendingChanges.add(fingerprint);
        logger.fine(`Certificate ${fingerprint} changed (${changeType})`, null, FILENAME);

        // For created or deleted certificates, we should also invalidate filesystem scanning
        if (changeType === 'create' || changeType === 'delete') {
            // Mark last refresh time as expired
            this.lastRefreshTime = 0;
        }
    }

    /**
     * Refresh specific certificates in the cache
     * @param {Array<string>} fingerprints - Certificate fingerprints to refresh 
     * @returns {Promise<number>} Number of certificates refreshed
     */
    async refreshCachedCertificates(fingerprints) {
        if (!fingerprints || fingerprints.length === 0) return 0;

        let refreshed = 0;

        for (const fingerprint of fingerprints) {
            try {
                // Try to load certificate from disk
                const cert = await this.loadCertificate(fingerprint);

                if (cert) {
                    this.certificates.set(fingerprint, cert);
                    refreshed++;
                    this.pendingChanges.delete(fingerprint);
                    logger.fine(`Refreshed certificate ${fingerprint} in cache`, null, FILENAME);
                } else {
                    // If certificate no longer exists, remove from cache
                    this.certificates.delete(fingerprint);
                    this.pendingChanges.delete(fingerprint);
                    logger.fine(`Removed certificate ${fingerprint} from cache`, null, FILENAME);
                }
            } catch (error) {
                logger.error(`Error refreshing certificate ${fingerprint}:`, error, FILENAME);
            }
        }

        return refreshed;
    }

    /**
     * Force a complete refresh of the certificate cache
     * Should be called only when absolutely necessary
     * @returns {Promise<Map<string, Certificate>>} Refreshed certificates
     */
    async forceRefresh() {
        logger.info('Forcing complete refresh of certificate cache', null, FILENAME);
        this.invalidateCache();
        return await this.loadCertificates(true);
    }

    /**
     * Load all certificates from directory
     * @param {boolean} reloadConfig - Whether to reload configuration
     * @returns {Promise<boolean>}
     */
    async loadCertificates(reloadConfig = false) {
        try {
            logger.info(`Loading certificates from ${this.certsDir}`, null, FILENAME);

            // Only clear certificates if explicitly reloading
            if (reloadConfig) {
                logger.debug('Reloading requested, clearing current certificates', null, FILENAME);
                this.certificates.clear();
            }

            // Find all certificate files in the directory
            const certFiles = await this.findCertificateFiles();

            // Process each certificate file
            const results = await Promise.all(certFiles.map(file => this.processSingleCertificateFile(file)));
            const successCount = results.filter(result => result).length;

            logger.info(`Successfully loaded ${successCount} of ${certFiles.length} certificates`, null, FILENAME);

            // Merge with existing config
            const mergeResult = await this.mergeCertificateConfigs();

            // Update CA relationships between certificates - using our new method
            await this.updateCertificateCARelationships();

            // Only save if we have new certificates that need to be added to config
            const needsToSave = this._checkIfConfigNeedsSaving();

            if (needsToSave) {
                logger.info('Detected changes that need to be saved to configuration', null, FILENAME);
                await this.saveCertificateConfigs();
            } else {
                logger.debug('No changes detected in certificate configuration, skipping save', null, FILENAME);
            }

            return successCount > 0;
        } catch (error) {
            logger.error('Error loading certificates:', error, FILENAME);
            return false;
        }
    }

    /**
     * Load certificate from the filesystem
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Certificate} Certificate object
     */
    loadCertificate(fingerprint) {
        try {
            // First, make sure we have loaded the config file
            if (!this.certificatesConfig) {
                // Load certificates config once
                try {
                    const configContent = fs.readFileSync(this.configPath, 'utf8');
                    this.certificatesConfig = JSON.parse(configContent);
                } catch (error) {
                    logger.warn(`No certificates config found at ${this.configPath}`, null, FILENAME);
                    this.certificatesConfig = { certificates: {} };
                }
            }

            // Exit if certificate not found in config
            if (!this.certificatesConfig.certificates?.[fingerprint]) {
                return null;
            }

            const certConfig = this.certificatesConfig.certificates[fingerprint];

            // Create certificate with constructor and let it handle the data properly
            const Certificate = require('./Certificate');
            const cert = new Certificate(certConfig);

            return cert;
        } catch (error) {
            logger.error(`Failed to load certificate ${fingerprint}:`, error, FILENAME);
            return null;
        }
    }

    /**
     * Merge certificate configurations from loaded files with existing configuration
     * @returns {Promise<boolean>} Whether the config was successfully merged
     */
    async mergeCertificateConfigs() {
        try {
            const absoluteConfigPath = path.resolve(this.configPath);
            logger.debug(`Attempting to load certificate config from: ${absoluteConfigPath}`, null, FILENAME);

            // If config file doesn't exist, we'll need to create it but only after loading certificates
            if (!fs.existsSync(absoluteConfigPath)) {
                logger.info(`Certificate config file not found at ${absoluteConfigPath}, will create after loading certificates`, null, FILENAME);
                return true;
            }

            // Check file stats and read the config file
            let config;
            try {
                // Check file stats
                const stats = fs.statSync(absoluteConfigPath);
                logger.debug(`Certificate config file stats: size=${stats.size}, mode=${stats.mode.toString(8)}, uid=${stats.uid}, gid=${stats.gid}`, null, FILENAME);

                if (stats.size === 0) {
                    logger.warn(`Certificate config file exists but is empty: ${absoluteConfigPath}`, null, FILENAME);
                    return true;
                }

                // Read and parse the config file
                const configContent = fs.readFileSync(absoluteConfigPath, 'utf8');
                logger.debug(`Read ${configContent.length} bytes from certificate config file`, null, FILENAME);

                if (!configContent || configContent.trim() === '') {
                    logger.warn(`Certificate config file is empty, will maintain existing certificates before updating`, null, FILENAME);
                    return true;
                }

                config = JSON.parse(configContent);
                logger.debug(`Successfully parsed certificate config with ${Object.keys(config.certificates || {}).length} certificates`, null, FILENAME);

                // Store the loaded configuration
                this.certificatesConfig = config;
            } catch (error) {
                logger.error(`Error reading or parsing certificate config file: ${error.message}`, null, FILENAME);

                // Make a backup of the problematic file before replacing
                try {
                    if (error instanceof SyntaxError) {
                        const backupPath = `${absoluteConfigPath}.corrupt-${Date.now()}`;
                        fs.writeFileSync(backupPath, fs.readFileSync(absoluteConfigPath), 'utf8');
                        logger.info(`Created backup of corrupt configuration: ${backupPath}`, null, FILENAME);
                    }
                } catch (backupError) {
                    logger.error(`Failed to back up corrupt config: ${backupError.message}`, null, FILENAME);
                }

                // Initialize with empty config but don't write yet
                this.certificatesConfig = {
                    version: 1,
                    lastUpdate: new Date().toISOString(),
                    certificates: {}
                };

                return true;
            }

            // Process certificate-specific configurations
            if (config.certificates && typeof config.certificates === 'object') {
                for (const [fingerprint, certConfig] of Object.entries(config.certificates)) {
                    // Find the certificate in our loaded set
                    if (this.certificates.has(fingerprint)) {
                        // Update existing certificate using its own updateFromData method
                        const cert = this.certificates.get(fingerprint);
                        cert.updateFromData(certConfig, { preserveConfig: true });
                        logger.fine(`Updated certificate ${cert.name} (${fingerprint}) from config`, null, FILENAME);
                    } else {
                        // Create a new Certificate instance from the config using Certificate's constructor
                        try {
                            const Certificate = require('./Certificate');
                            const newCert = new Certificate(certConfig); // Use existing _fromData via constructor

                            // Add the certificate to our collection
                            this.certificates.set(fingerprint, newCert);
                            logger.info(`Added certificate ${newCert.name} from config (not found on disk)`, null, FILENAME);
                        } catch (error) {
                            logger.error(`Error creating certificate from config: ${error.message}`, null, FILENAME);
                        }
                    }
                }
            }

            return true;
        } catch (error) {
            logger.error(`Error merging certificate configs: ${error.message}`, error, FILENAME);
            return false;
        }
    }

    /**
     * Save all certificate configurations to JSON file
     * @returns {Promise<boolean>} Whether the save was successful
     */
    async saveCertificateConfigs() {
        try {
            // Create configDir if it doesn't exist yet
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
                logger.info(`Created config directory: ${configDir}`, null, FILENAME);
            }

            // Create initial config object if it doesn't exist yet
            if (!this.certificatesConfig) {
                this.certificatesConfig = {
                    version: 1,
                    lastUpdate: new Date().toISOString(),
                    certificates: {}
                };
            }

            // Update lastUpdate timestamp
            this.certificatesConfig.lastUpdate = new Date().toISOString();

            // Create a copy of the current certificates in an object structure
            for (const [fingerprint, certificate] of this.certificates.entries()) {
                // Skip if certificate has no fingerprint
                if (!fingerprint) {
                    continue;
                }

                // Store the complete JSON representation directly from the certificate
                this.certificatesConfig.certificates[fingerprint] = certificate.toJSON();
            }

            // Write the config to file with proper error handling
            try {
                const jsonConfig = JSON.stringify(this.certificatesConfig, null, 2);
                logger.debug(`Writing ${jsonConfig.length} bytes to certificate config file: ${this.configPath}`, null, FILENAME);

                // First write to a temporary file to avoid corruption
                const tempPath = `${this.configPath}.tmp`;
                await fs.promises.writeFile(tempPath, jsonConfig, 'utf8');

                // Then rename to the actual config file
                await fs.promises.rename(tempPath, this.configPath);

                logger.info(`Saved certificate configurations to ${this.configPath}`, null, FILENAME);
                return true;
            } catch (writeError) {
                logger.error(`Failed to write certificate config file: ${writeError.message}`, writeError, FILENAME);

                // Try direct write as a fallback
                try {
                    await fs.promises.writeFile(this.configPath, JSON.stringify(this.certificatesConfig, null, 2), 'utf8');
                    logger.info(`Saved certificate configurations with direct write to ${this.configPath}`, null, FILENAME);
                    return true;
                } catch (directWriteError) {
                    logger.error(`Final attempt to write config failed: ${directWriteError.message}`, null, FILENAME);
                    throw directWriteError;
                }
            }
        } catch (error) {
            logger.error(`Error saving certificate configurations: ${error.message}`, error, FILENAME);
            return false;
        }
    }

    /**
     * Update a certificate's configuration and notify about changes
     * @param {string} fingerprint - Certificate fingerprint
     * @param {Object} config - Updated configuration
     * @returns {Promise<boolean>} Success status
     */
    async updateCertificateConfig(fingerprint, config) {
        logger.fine(`Updating certificate config for ${fingerprint}`, config, FILENAME);
        try {
            if (!fingerprint) {
                throw new Error('Fingerprint is required');
            }

            // Find the certificate
            if (!this.certificates.has(fingerprint)) {
                throw new Error(`Certificate not found with fingerprint: ${fingerprint}`);
            }

            const cert = this.certificates.get(fingerprint);

            // Use the Certificate's updateFromData method to handle updates with the proper structure
            cert.updateFromData({
                name: config.name,
                description: config.description,
                keySize: config.keySize,
                validity: config.validity,

                // Configuration properties mapped directly to the consistent structure
                config: {
                    autoRenew: config.autoRenew,
                    renewDaysBeforeExpiry: config.renewDaysBeforeExpiry,
                    renewBefore: config.renewBefore,
                    signWithCA: config.signWithCA,
                    caFingerprint: config.caFingerprint,
                    deployActions: config.deployActions
                },

                // Additional metadata
                group: config.group,
                tags: config.tags,
                notifications: config.notifications,
                metadata: config.metadata
            }, { preserveConfig: true });

            // Save all configurations
            await this.saveCertificateConfigs();

            // Add notification about the change
            this.notifyCertificateChanged(fingerprint, 'update');

            return true;
        } catch (error) {
            logger.error(`Error updating certificate config for ${fingerprint}:`, error, FILENAME);
            return false;
        }
    }

    /**
     * Update a certificate's configuration and sync in-memory properties
     * @param {string} fingerprint - Certificate fingerprint
     * @param {Object} config - Updated configuration
     * @returns {Promise<boolean>} Success status
     */
    async updateCertificateConfigAndSync(fingerprint, config) {
        logger.fine(`Updating certificate config and syncing for ${fingerprint}`, config, FILENAME);
        try {
            if (!fingerprint) {
                throw new Error('Fingerprint is required');
            }

            // Find the certificate
            if (!this.certificates.has(fingerprint)) {
                throw new Error(`Certificate not found with fingerprint: ${fingerprint}`);
            }

            const cert = this.certificates.get(fingerprint);

            // First use updateCertificateConfig to handle the configuration update
            const updateResult = await this.updateCertificateConfig(fingerprint, config);
            if (!updateResult) {
                throw new Error('Failed to update certificate configuration');
            }

            // The certificate already has updated data internally via updateFromData
            // But to ensure full synchronization across potential public properties
            // or any properties that might be accessed directly, update these explicitly

            // Log synchronization for clarity
            logger.debug(`Synchronized certificate properties for ${cert.name} (${fingerprint})`, null, FILENAME);

            // Ensure the certificate in our map is up to date
            this.certificates.set(fingerprint, cert);

            return true;
        } catch (error) {
            logger.error(`Error updating and syncing certificate config for ${fingerprint}:`, error, FILENAME);
            return false;
        }
    }

    /**
     * Check if there are changes that need to be saved to the configuration
     * @returns {boolean} True if config needs to be saved
     * @private
     */
    _checkIfConfigNeedsSaving() {
        // If we don't have a config object at all, we need to save
        if (!this.certificatesConfig) {
            return true;
        }

        // If certificates object doesn't exist in config, we need to save
        if (!this.certificatesConfig.certificates) {
            return true;
        }

        // Check for new certificates that don't exist in config
        const configFingerprints = new Set(Object.keys(this.certificatesConfig.certificates));
        for (const fingerprint of this.certificates.keys()) {
            if (!configFingerprints.has(fingerprint)) {
                return true;
            }
        }

        // Check if any certificates have been updated since config was last saved
        for (const [fingerprint, cert] of this.certificates.entries()) {
            const configCert = this.certificatesConfig.certificates[fingerprint];
            if (!configCert) continue;

            // Check if properties have changed - using the proper structure
            if (cert._name !== configCert.name ||
                cert._subject !== configCert.subject ||
                cert._validTo !== configCert.validTo ||
                cert._validFrom !== configCert.validFrom ||
                cert._certType !== configCert.certType ||
                cert._needsPassphrase !== configCert.needsPassphrase) {
                return true;
            }
        }

        return false;
    }

    /**
     * Process a single certificate file
     * @param {string} certPath - Path to certificate file
     * @returns {Promise<boolean>} Whether the certificate was successfully processed
     */
    async processSingleCertificateFile(certPath) {
        try {
            // Parse certificate info with OpenSSL
            const certInfo = await this.parseCertificateFile(certPath);
            if (!certInfo) {
                logger.warn(`Failed to parse certificate file: ${certPath}`, null, FILENAME);
                return false;
            }

            // Create or update certificate
            let certificate;

            // Check if certificate already exists by fingerprint
            if (certInfo.fingerprint && this.certificates.has(certInfo.fingerprint)) {
                logger.fine(`Updating existing certificate with fingerprint: ${certInfo.fingerprint}`, null, FILENAME);
                certificate = this.certificates.get(certInfo.fingerprint);

                // Update certificate with new information
                certificate.updateFromData(certInfo);
            } else {
                // Create new certificate with the consistent structure
                const Certificate = require('./Certificate');
                certificate = new Certificate(certInfo);

                // Add to certificates map
                this.certificates.set(certificate.fingerprint, certificate);
                logger.fine(`Added certificate ${certificate.name} (${certificate.fingerprint})`, null, FILENAME);
            }

            // Check passphrase requirement if openssl is available
            if (this.openssl) {
                try {
                    // Get key path from the certificate
                    const keyPath = certificate.paths?.keyPath || certificate.paths?.key;

                    if (keyPath && fs.existsSync(keyPath)) {
                        // Use isKeyEncrypted directly to check if the key needs a passphrase
                        const needsPassphrase = await this.openssl.isKeyEncrypted(keyPath);
                        logger.info(`Passphrase requirement checked for ${certificate.name}: ${needsPassphrase ? 'Needs passphrase' : 'No passphrase required'}`, null, FILENAME);

                        // Update the certificate using its own method
                        certificate.needsPassphrase = needsPassphrase;

                        // Check if certificate has a stored passphrase if we have a passphrase manager
                        if (this.passphraseManager && needsPassphrase) {
                            certificate.updatePassphraseStatus(this.passphraseManager);
                        }
                    } else {
                        logger.debug(`No key file found to check passphrase requirement for ${certificate.name}`, null, FILENAME);
                    }
                } catch (passphraseError) {
                    logger.warn(`Error checking passphrase requirement for ${certificate.name}: ${passphraseError.message}`, null, FILENAME);
                    // Set needsPassphrase to true if we can't check, to be safe
                    certificate.needsPassphrase = true;
                }
            }

            // Make sure to save the updated certificate with the correct passphrase setting
            this.certificates.set(certificate.fingerprint, certificate);

            return true;
        } catch (error) {
            logger.error(`Error processing certificate file ${certPath}:`, error, FILENAME);
            return false;
        }
    }

    /**
     * Find certificate files in the certificates directory
     * @returns {Promise<string[]>} Array of certificate file paths
     */
    async findCertificateFiles() {
        try {
            const certFiles = [];
            logger.debug(`Scanning certificates directory: ${this.certsDir}`, null, FILENAME);

            // Helper function to recursively scan directories
            const scanDirectory = (dir) => {
                try {
                    if (!fs.existsSync(dir)) {
                        logger.warn(`Directory does not exist: ${dir}`, null, FILENAME);
                        return;
                    }

                    const items = fs.readdirSync(dir);
                    logger.finest(`Found ${items.length} items in directory ${dir}`, null, FILENAME);

                    for (const item of items) {
                        const fullPath = path.join(dir, item);

                        // Skip special directories and hidden files
                        if (item === 'backups' || item === 'archive' || item.startsWith('.')) {
                            continue;
                        }

                        try {
                            const stats = fs.statSync(fullPath);

                            if (stats.isDirectory()) {
                                // Recursively scan subdirectories
                                scanDirectory(fullPath);
                            } else if (this.isCertificateFile(item)) {
                                // Found a certificate file
                                certFiles.push(fullPath);
                                logger.finest(`Found certificate file: ${fullPath}`, null, FILENAME);
                            }
                        } catch (error) {
                            logger.warn(`Error accessing ${fullPath}:`, error, FILENAME);
                        }
                    }
                } catch (error) {
                    logger.error(`Error scanning directory ${dir}:`, error, FILENAME);
                }
            };

            // Start scanning from the certificates directory
            scanDirectory(this.certsDir);
            logger.info(`Found ${certFiles.length} certificate files in total`, null, FILENAME);

            return certFiles;
        } catch (error) {
            logger.error('Error finding certificate files:', error, FILENAME);
            throw error;
        }
    }

    /**
     * Check if a file is a certificate file based on its extension
     * @param {string} filename - Name of the file
     * @returns {boolean} True if it appears to be a certificate file
     */
    isCertificateFile(filename) {
        const ext = path.extname(filename).toLowerCase();
        return ['.crt', '.pem', '.cer', '.cert'].includes(ext);
    }

    /**
     * Parse a certificate file to extract certificate data
     * @param {string} filePath - Path to certificate file
     * @returns {Object|null} Certificate data or null on error
     */
    async parseCertificateFile(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                throw new Error(`Certificate file not found: ${filePath}`);
            }

            logger.fine(`Parsing certificate file: ${filePath}`, null, FILENAME);

            // Use OpenSSL wrapper instead of direct execution
            const certInfo = await this.openssl.getCertificateInfo(filePath);

            // Log extracted certificate info for debugging
            logger.finest(`Certificate info extracted from ${filePath}:`, null, FILENAME);
            logger.finest(`- Name: ${certInfo.name}`, null, FILENAME);
            logger.finest(`- Subject: ${certInfo.subject}`, null, FILENAME);
            logger.finest(`- Issuer: ${certInfo.issuer}`, null, FILENAME);
            logger.finest(`- Domains: ${JSON.stringify(certInfo.sans?.domains || [])}`, null, FILENAME);
            logger.finest(`- IPs: ${JSON.stringify(certInfo.sans?.ips || [])}`, null, FILENAME);

            // Find related key file
            const keyPath = this.findKeyFile(filePath);
            logger.fine(`Found key file: ${keyPath || 'not found'}`, null, FILENAME);

            // Get the file extension to determine correct path assignments
            const fileExt = path.extname(filePath).toLowerCase();

            // Construct paths object based on actual file extension
            const paths = {};

            // Assign the certificate path to the appropriate property based on extension
            if (fileExt === '.pem') {
                paths.pemPath = filePath;
                // Create corresponding paths with proper extensions
                paths.crtPath = filePath.replace(/\.pem$/, '.crt');
                if (!fs.existsSync(paths.crtPath)) {
                    // If .crt doesn't exist, don't include it
                    delete paths.crtPath;
                }
            } else if (fileExt === '.crt' || fileExt === '.cer' || fileExt === '.cert') {
                paths.crtPath = filePath;
                // Create corresponding paths with proper extensions
                paths.pemPath = filePath.replace(/\.(crt|cer|cert)$/, '.pem');
                if (!fs.existsSync(paths.pemPath)) {
                    // If .pem doesn't exist, don't include it
                    delete paths.pemPath;
                }
            } else {
                // For other extensions, just use the original path
                paths.crtPath = filePath;
            }

            // Add other related paths
            if (keyPath) paths.keyPath = keyPath;

            // Only add these paths if they exist
            const baseName = path.basename(filePath, path.extname(filePath));
            const dirName = path.dirname(filePath);

            const possiblePaths = {
                csrPath: path.join(dirName, `${baseName}.csr`),
                p12Path: path.join(dirName, `${baseName}.p12`),
                pfxPath: path.join(dirName, `${baseName}.pfx`),
                extPath: path.join(dirName, `${baseName}.ext`),
                derPath: path.join(dirName, `${baseName}.der`),
                cerPath: path.join(dirName, `${baseName}.cer`),
                p7bPath: path.join(dirName, `${baseName}.p7b`),
                chainPath: path.join(dirName, `${baseName}.chain`),
                fullchainPath: path.join(dirName, `${baseName}.fullchain`)
            };

            // Add each path only if the file exists
            Object.entries(possiblePaths).forEach(([pathType, pathValue]) => {
                if (fs.existsSync(pathValue)) {
                    paths[pathType] = pathValue;
                }
            });

            logger.fine(`Generated paths for certificate: ${JSON.stringify(paths)}`, null, FILENAME);

            // Get domains and IPs from the new SANS structure
            const domains = certInfo.sans?.domains || [];
            const ips = certInfo.sans?.ips || [];

            // Set CA fingerprint when available
            const caFingerprint = certInfo.authorityKeyId && !certInfo.selfSigned ?
                certInfo.authorityKeyId.toUpperCase() : null;

            // Create result object with all necessary fields
            const result = {
                name: certInfo.name,
                fingerprint: certInfo.fingerprint,
                subject: certInfo.subject,
                issuer: certInfo.issuer,
                issuerCN: certInfo.issuerCN,
                validFrom: certInfo.validFrom,
                validTo: certInfo.validTo,
                certType: certInfo.certType,
                paths,
                sans: {
                    domains,
                    ips,
                    idleDomains: [],
                    idleIps: []
                },
                isCA: certInfo.isCA,
                isRootCA: certInfo.isRootCA,
                pathLenConstraint: certInfo.pathLenConstraint,
                serialNumber: certInfo.serialNumber,
                keyId: certInfo.keyId,
                authorityKeyId: certInfo.authorityKeyId,
                keyType: certInfo.keyType,
                keySize: certInfo.keySize,
                sigAlg: certInfo.sigAlg,
                selfSigned: certInfo.selfSigned,
                signWithCA: !certInfo.selfSigned && certInfo.certType !== 'rootCA',
                caFingerprint: caFingerprint
            };

            logger.fine(`Extracted certificate data:`, result, FILENAME);

            return result;
        } catch (error) {
            logger.error(`Error parsing certificate file ${filePath}:`, error, FILENAME);
            return null;
        }
    }

    /**
     * Find the key file associated with a certificate
     * @param {string} certPath - Certificate file path
     * @returns {string|null} Key file path or null if not found
     */
    findKeyFile(certPath) {
        const baseName = path.basename(certPath, path.extname(certPath));
        const certDir = path.dirname(certPath);

        // Possible key file patterns
        const keyPatterns = [
            `${baseName}.key`,
            `${baseName}-key.pem`,
            'privkey.pem',
            'private.key'
        ];

        // Check each pattern
        for (const pattern of keyPatterns) {
            const keyPath = path.join(certDir, pattern);
            if (fs.existsSync(keyPath)) {
                return keyPath;
            }
        }

        return null;
    }

    /**
     * Get a certificate by fingerprint
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Certificate} - Certificate object or null if not found
     */
    getCertificate(fingerprint) {
        if (!fingerprint) {
            return null;
        }

        // Clean any potential prefix from the fingerprint
        const cleanedFingerprint = fingerprint.replace(/SHA256 FINGERPRINT=|sha256 Fingerprint=/i, '');

        // Check if this certificate needs refresh
        if (this.pendingChanges.has(cleanedFingerprint) || this.pendingChanges.has(fingerprint)) {
            logger.debug(`Certificate ${fingerprint} has pending changes, refreshing`, null, FILENAME);
            this.refreshCachedCertificates([cleanedFingerprint]);
        }

        if (this.certificates.has(cleanedFingerprint)) {
            const cert = this.certificates.get(cleanedFingerprint);
            return cert;
        }

        // For backward compatibility, try with original fingerprint
        if (this.certificates.has(fingerprint)) {
            const cert = this.certificates.get(fingerprint);
            return cert;
        }

        // Try to load certificate from disk
        const loadedCert = this.loadCertificate(cleanedFingerprint) ||
            this.loadCertificate(fingerprint);

        if (loadedCert) {
            // Store with clean fingerprint
            this.certificates.set(cleanedFingerprint, loadedCert);
            return loadedCert;
        }

        return null;
    }

    /**
     * Get all certificates - with caching optimizations
     * @returns {Certificate[]} Array of all certificates
     */
    getAllCertificates() {
        // Trust the cache more - don't do unnecessary refresh checks
        return Array.from(this.certificates.values());
    }

    /**
     * Get all certificates with metadata - frontend optimized
     * @returns {Array} Array of certificate objects with metadata
     */
    getAllCertificatesWithMetadata() {
        // If there are pending changes, refresh those specific certificates
        if (this.pendingChanges.size > 0) {
            logger.fine(`Refreshing ${this.pendingChanges.size} certificates with pending changes`, null, FILENAME);
            // Use a non-blocking refresh approach
            setTimeout(() => {
                this.refreshCachedCertificates([...this.pendingChanges])
                    .then(count => {
                        logger.fine(`Background refresh updated ${count} certificates`, null, FILENAME);
                    })
                    .catch(error => {
                        logger.error('Error in background certificate refresh:', error, FILENAME);
                    });
            }, 0);
        }

        // Return certificates with consistent structure using toJSON()
        return Array.from(this.certificates.values())
            .map(cert => {
                // Use toJSON directly for a consistent representation
                const response = cert.toJSON();

                // Add CA name if available
                if (response.config.signWithCA && response.config.caFingerprint) {
                    response.config.caName = this.getCAName(response.config.caFingerprint);
                }

                // Add passphrase information
                if (this.passphraseManager) {
                    response.hasPassphrase = this.passphraseManager.hasPassphrase(response.fingerprint);
                }

                // Add days until expiry calculation
                if (response.validTo) {
                    try {
                        const validToDate = new Date(response.validTo);
                        const now = new Date();
                        response.daysUntilExpiry = Math.ceil((validToDate - now) / (1000 * 60 * 60 * 24));
                    } catch (e) {
                        logger.fine(`Error calculating days until expiry for ${response.name}: ${e.message}`, null, FILENAME);
                    }
                }

                // Add CA passphrase information if needed
                if (response.config.signWithCA && response.config.caFingerprint) {
                    const signingCA = this.getCertificate(response.config.caFingerprint);
                    if (signingCA) {
                        response.signingCANeedsPassphrase = signingCA.needsPassphrase;
                        response.signingCAHasPassphrase =
                            this.passphraseManager && signingCA.fingerprint ?
                                this.passphraseManager.hasPassphrase(signingCA.fingerprint) : false;
                    }
                }

                return response;
            });
    }

    /**
     * Get all CA certificates
     * @returns {Certificate[]} Array of CA certificates
     */
    getCAcertificates() {
        return this.getAllCertificates().filter(cert => cert.isCA);
    }

    /**
     * Delete a certificate and notify about the change
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Promise<Object>} Result object with success status
     */
    async deleteCertificate(fingerprint) {
        try {
            // Find certificate
            const cert = this.getCertificate(fingerprint);

            if (!cert) {
                return { success: false, error: 'Certificate not found' };
            }

            // Backup the certificate files
            await this.backupCertificate(cert);

            // Delete certificate files
            const paths = cert.paths;

            for (const [key, filePath] of Object.entries(paths)) {
                if (filePath && fs.existsSync(filePath)) {
                    try {
                        fs.unlinkSync(filePath);
                        logger.info(`Deleted certificate file: ${filePath}`, null, FILENAME);
                    } catch (error) {
                        logger.error(`Error deleting file ${filePath}:`, error, FILENAME);
                    }
                }
            }

            // Remove from certificates map
            this.certificates.delete(fingerprint);

            // Save updated configuration
            await this.saveCertificateConfigs();

            // Add notification about the change
            this.notifyCertificateChanged(fingerprint, 'delete');

            return { success: true };
        } catch (error) {
            logger.error(`Error deleting certificate ${fingerprint}:`, error, FILENAME);
            return { success: false, error: error.message };
        }
    }

    /**
     * Backup a certificate
     * @param {Certificate} cert - Certificate to backup
     * @returns {Promise<Object>} Result with backup paths
     */
    async backupCertificate(cert) {
        try {
            // Create timestamp for backup folder
            const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');

            // Create backup directory
            const backupDir = path.join(this.certsDir, 'backups', timestamp);
            fs.mkdirSync(backupDir, { recursive: true });

            const backupResults = {};
            const paths = cert.paths;

            // Backup each file
            for (const [key, filePath] of Object.entries(paths)) {
                if (filePath && fs.existsSync(filePath)) {
                    const fileName = path.basename(filePath);
                    const backupPath = path.join(backupDir, fileName);

                    try {
                        fs.copyFileSync(filePath, backupPath);
                        backupResults[key] = backupPath;
                        logger.info(`Backed up ${key} file to ${backupPath}`, null, FILENAME);
                    } catch (error) {
                        logger.error(`Error backing up ${filePath}:`, error, FILENAME);
                    }
                }
            }

            return {
                success: true,
                backupDir,
                paths: backupResults
            };
        } catch (error) {
            logger.error(`Error backing up certificate ${cert.name}:`, error, FILENAME);
            return { success: false, error: error.message };
        }
    }

    /**
     * Store a passphrase for a certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @param {string} passphrase - Passphrase to store
     * @returns {boolean} Success status
     */
    storePassphrase(fingerprint, passphrase) {
        try {
            if (!fingerprint) {
                throw new Error('Fingerprint is required');
            }

            this.passphraseManager.storePassphrase(fingerprint, passphrase);
            return true;
        } catch (error) {
            logger.error(`Error storing passphrase: ${error.message}`, null, FILENAME);
            return false;
        }
    }

    /**
     * Get passphrase for a certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {string|null} Passphrase or null if not found
     */
    getPassphrase(fingerprint) {
        if (!fingerprint) {
            return null;
        }

        return this.passphraseManager.getPassphrase(fingerprint);
    }

    /**
     * Get CA certificate name by fingerprint
     * @param {string} fingerprint - CA certificate fingerprint
     * @returns {string|null} CA certificate name or null if not found
     */
    getCAName(fingerprint) {
        if (!fingerprint) return null;

        const caCert = this.getCertificate(fingerprint);
        logger.debug(`CA certificate name for ${fingerprint}: ${caCert ? caCert.name : 'not found'}`, null, FILENAME);
        return caCert ? caCert.name : null;
    }

    /**
     * Check if a certificate has a stored passphrase
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {boolean} True if the certificate has a stored passphrase
     */
    hasPassphrase(fingerprint) {
        if (!fingerprint) {
            return false;
        }

        return this.passphraseManager.hasPassphrase(fingerprint);
    }

    /**
     * Delete a stored passphrase
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {boolean} Success status
     */
    deletePassphrase(fingerprint) {
        if (!fingerprint) {
            return false;
        }

        return this.passphraseManager.deletePassphrase(fingerprint);
    }

    /**
     * Rotate the encryption key for passphrases
     * @returns {boolean} Success status
     */
    rotateEncryptionKey() {
        return this.passphraseManager.rotateEncryptionKey();
    }

    /**
     * Renew a certificate and execute deployment actions, then notify about the change
     * @param {string} fingerprint - Certificate fingerprint
     * @param {Object} options - Renewal options
     * @param {Object} user - User performing the action
     * @returns {Promise<Object>} Result of renewal and deployment
     */
    async renewAndDeployCertificate(fingerprint, options = {}, user = null) {
        try {
            const cert = this.getCertificate(fingerprint);
            if (!cert) {
                throw new Error(`Certificate not found with fingerprint: ${fingerprint}`);
            }

            // Find signing CA if needed
            let signingCA = null;
            if (cert.signWithCA && cert.caFingerprint) {
                signingCA = this.getCertificate(cert.caFingerprint);
            }

            // Get stored passphrase if available
            let certPassphrase = options.passphrase;
            if (!certPassphrase && cert.hasStoredPassphrase(this.passphraseManager)) {
                certPassphrase = cert.getPassphrase(this.passphraseManager);
            }

            const renewalResult = await openssl.renewWithFormatPreservation(certificate, {
                days: 365,
                passphrase: certPassphrase,
                signingCA: parentCA
            });

            // Save certificate configuration
            await this.saveCertificateConfigs();

            // Execute deployment actions if specified
            if (options.deploy !== false && cert.deployActions?.length > 0) {
                const deployService = require('../services/deploy-service');
                const deployResult = await cert.executeDeployActions(deployService);

                // Combine results
                return {
                    success: renewalResult.success && deployResult.success,
                    renewalResult,
                    deployResult
                };
            }

            // Add notification about the change
            this.notifyCertificateChanged(fingerprint, 'update');

            // Record activity
            if (this.activityService) {
                await this.activityService.recordCertificateActivity('renew', cert, user);
            }

            return {
                success: true,
                renewalResult
            };
        } catch (error) {
            logger.error(`Error renewing and deploying certificate ${fingerprint}`, error, FILENAME);
            throw error;
        }
    }

    /**
     * Get deployment actions for a certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Array} Array of deployment actions or empty array if none found
     */
    getDeploymentActions(fingerprint) {
        const cert = this.getCertificate(fingerprint);
        if (!cert) {
            logger.warn(`Cannot get deployment actions: Certificate not found: ${fingerprint}`, null, FILENAME);
            return [];
        }

        // Access the deployment actions directly from _config.deployActions
        if (cert._config && Array.isArray(cert._config.deployActions)) {
            logger.debug(`Found ${cert._config.deployActions.length} deployment actions`, null, FILENAME);
            return [...cert._config.deployActions];
        }

        // If no deployment actions found, return empty array
        logger.debug(`No deployment actions found for certificate ${fingerprint}`, null, FILENAME);
        return [];
    }

    /**
     * Get all backups for a certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Promise<Array>} Array of backup objects
     */
    async getCertificateBackups(fingerprint) {
        try {
            const certificate = this.getCertificate(fingerprint);
            if (!certificate) {
                throw new Error(`Certificate with fingerprint ${fingerprint} not found`);
            }

            // Define backups directory (create a backups folder in the certificate directory)
            const backupsDir = path.join(this.certsDir, fingerprint, 'backups');

            // Create directory if it doesn't exist
            if (!fs.existsSync(backupsDir)) {
                fs.mkdirSync(backupsDir, { recursive: true });
                return []; // No backups yet
            }

            // Read backup files
            const files = fs.readdirSync(backupsDir).filter(file => file.endsWith('.zip'));

            // Format backup info
            const backups = [];
            for (const file of files) {
                const filePath = path.join(backupsDir, file);
                const stats = fs.statSync(filePath);

                // Extract timestamp from filename
                const timestamp = file.replace(/^backup-(\d+)\.zip$/, '$1');
                const date = new Date(parseInt(timestamp));

                backups.push({
                    id: timestamp,
                    date: date.toISOString(),
                    size: stats.size,
                    filename: file,
                    filePath: filePath
                });
            }

            // Sort by date (newest first)
            return backups.sort((a, b) => new Date(b.date) - new Date(a.date));
        } catch (error) {
            this.logger.error(`Error getting backups for certificate ${fingerprint}:`, error, FILENAME);
            throw error;
        }
    }

    /**
     * Get a specific backup by ID
     * @param {string} fingerprint - Certificate fingerprint
     * @param {string} backupId - Backup ID
     * @returns {Promise<Object>} Backup object
     */
    async getCertificateBackup(fingerprint, backupId) {
        try {
            const backups = await this.getCertificateBackups(fingerprint);
            const backup = backups.find(b => b.id === backupId);

            if (!backup) {
                throw new Error(`Backup ${backupId} not found for certificate ${fingerprint}`);
            }

            return backup;
        } catch (error) {
            this.logger.error(`Error getting backup ${backupId} for certificate ${fingerprint}:`, error, FILENAME);
            throw error;
        }
    }

    /**
     * Create or renew a certificate
     * @param {string} fingerprint - Certificate fingerprint (for renewal)
     * @param {Object} options - Creation/renewal options
     * @returns {Promise<Object>} Result of the operation
     */
    async createOrRenewCertificate(fingerprint, options = {}) {
        // If fingerprint is provided, it's a renewal
        const isRenewal = !!fingerprint;

        let certificate;

        if (isRenewal) {
            certificate = this.getCertificate(fingerprint);
            if (!certificate) {
                return { success: false, error: 'Certificate not found' };
            }
        } else {
            // Creating new certificate
            certificate = new Certificate(options.name || 'New Certificate');
            // Initialize certificate properties
            this._initializeNewCertificate(certificate, options);
        }

        // Perform the actual creation/renewal logic
        const result = await this._performCertificateCreation(certificate, options);

        // If successful, add to certificates and save config
        if (result.success) {
            this.certificates.set(certificate.fingerprint, certificate);
            await this.saveCertificateConfigs();
            this.notifyCertificateChanged(certificate.fingerprint, isRenewal ? 'update' : 'create');
        }

        return result;
    }

    /**
     * Initialize a new certificate with the provided options
     * @param {Certificate} certificate - Certificate object to initialize
     * @param {Object} options - Certificate options from request
     * @private
     */
    _initializeNewCertificate(certificate, options) {
        // Extract certificate info from options
        const certInfo = options.certificate || {};

        // Set certificate properties from options
        if (certInfo.name) certificate.name = certInfo.name;
        if (certInfo.subject) certificate.subject = certInfo.subject;
        if (certInfo.description) certificate.description = certInfo.description;

        // Set certificate type
        certificate.certType = certInfo.certType || 'standard';

        // Set key properties
        certificate.keyType = certInfo.keyType || 'RSA';
        certificate.keySize = certInfo.keySize || 2048;

        // Initialize domains and IPs
        if (Array.isArray(certInfo.domains)) {
            certificate.sans.domains = [...certInfo.domains];
        } else if (certInfo.commonName) {
            certificate.sans.domains = [certInfo.commonName];
        }

        if (Array.isArray(certInfo.ips)) {
            certificate.sans.ips = [...certInfo.ips];
        }

        // Set configuration
        if (certInfo.autoRenew !== undefined) certificate.config.autoRenew = certInfo.autoRenew;
        if (certInfo.renewDaysBeforeExpiry) certificate.config.renewDaysBeforeExpiry = certInfo.renewDaysBeforeExpiry;

        // Set CA signing information
        certificate.config.signWithCA = certInfo.signWithCA || false;
        certificate.config.caFingerprint = certInfo.caFingerprint || null;

        // Generate paths in a proper location
        certificate.generatePaths(path.join(this.certsDir, certificate.name.replace(/[^a-zA-Z0-9-_]/g, '_')));

        logger.debug(`Initialized new certificate: ${certificate.name}`, null, FILENAME);
    }

    /**
     * Perform the actual certificate creation or renewal using OpenSSL
     * @param {Certificate} certificate - Certificate to create or renew
     * @param {Object} options - Creation/renewal options
     * @returns {Promise<Object>} Result object with creation/renewal results
     * @private
     */
    async _performCertificateCreation(certificate, options) {
        try {
            // Get options
            const days = options.days || 365;
            const passphrase = options.passphrase;

            // Get signing CA if provided
            let signingCA = null;
            let signingCAPassphrase = null;

            if (certificate.config.signWithCA && certificate.config.caFingerprint) {
                // If specific CA is provided in options, use that
                if (options.signingCA) {
                    signingCA = options.signingCA;
                    signingCAPassphrase = options.signingCAPassphrase;
                } else {
                    // Otherwise, look up the CA by fingerprint
                    signingCA = this.getCertificate(certificate.config.caFingerprint);
                    if (signingCA && signingCA.needsPassphrase && this.passphraseManager) {
                        signingCAPassphrase = this.passphraseManager.getPassphrase(signingCA.fingerprint);
                    }
                }

                if (!signingCA) {
                    logger.warn(`Signing CA not found: ${certificate.config.caFingerprint}`, null, FILENAME);
                    return { success: false, error: 'Signing CA certificate not found' };
                }
            }

            // Make sure certificate has valid paths
            if (!certificate.paths || !certificate.paths.crtPath || !certificate.paths.keyPath) {
                certificate.generatePaths(path.join(this.certsDir, certificate.name.replace(/[^a-zA-Z0-9-_]/g, '_')));
            }

            // Create directory if it doesn't exist
            const certDir = path.dirname(certificate.paths.crtPath);
            if (!fs.existsSync(certDir)) {
                fs.mkdirSync(certDir, { recursive: true });
                logger.debug(`Created certificate directory: ${certDir}`, null, FILENAME);
            }

            // Prepare OpenSSL configuration
            const config = {
                certPath: certificate.paths.crtPath,
                keyPath: certificate.paths.keyPath,
                subject: certificate.subject || `CN=${certificate.sans.domains[0] || certificate.name}`,
                days: days,
                keyType: certificate.keyType || 'RSA',
                keySize: certificate.keySize || 2048,
                passphrase: passphrase,
                sans: {
                    domains: certificate.sans.domains,
                    ips: certificate.sans.ips
                },
                isCA: certificate.certType === 'rootCA' || certificate.certType === 'intermediateCA',
                pathLengthConstraint: certificate.certType === 'rootCA' ? -1 : 0,
            };

            // If we have a signing CA, add it to the config
            if (signingCA && signingCA.paths && signingCA.paths.crtPath && signingCA.paths.keyPath) {
                // Add validation for CA paths
                const absoluteCertPath = path.isAbsolute(signingCA.paths.crtPath) ?
                    signingCA.paths.crtPath : path.resolve(this.certsDir, signingCA.paths.crtPath);

                const absoluteKeyPath = path.isAbsolute(signingCA.paths.keyPath) ?
                    signingCA.paths.keyPath : path.resolve(this.certsDir, signingCA.paths.keyPath);

                // Check if files exist at the calculated absolute paths
                if (!fs.existsSync(absoluteCertPath)) {
                    logger.error(`CA certificate file not found: ${absoluteCertPath}`, null, FILENAME);
                    return { success: false, error: `CA certificate file not found: ${absoluteCertPath}` };
                }

                if (!fs.existsSync(absoluteKeyPath)) {
                    logger.error(`CA key file not found: ${absoluteKeyPath}`, null, FILENAME);
                    return { success: false, error: `CA key file not found: ${absoluteKeyPath}` };
                }

                config.signingCA = {
                    certPath: absoluteCertPath,
                    keyPath: absoluteKeyPath,
                    passphrase: signingCAPassphrase
                };
                logger.debug(`Using signing CA: ${signingCA.name} with absolute paths`, config.signingCA, FILENAME);
            }

            // Create or renew certificate with OpenSSL
            logger.info(`${certificate.fingerprint ? 'Renewing' : 'Creating'} certificate: ${certificate.name}`, null, FILENAME);

            const result = await this.openssl.createOrRenewCertificate(config);

            if (result.success) {
                // Update certificate with results from OpenSSL
                if (result.fingerprint) certificate.fingerprint = result.fingerprint;
                if (result.subject) certificate.subject = result.subject;
                if (result.issuer) certificate.issuer = result.issuer;
                if (result.validFrom) certificate.validFrom = result.validFrom;
                if (result.validTo) certificate.validTo = result.validTo;
                if (result.serialNumber) certificate.serialNumber = result.serialNumber;
                if (result.keyType) certificate.keyType = result.keyType;
                if (result.keySize) certificate.keySize = result.keySize;
                if (result.sigAlg) certificate.sigAlg = result.sigAlg;

                // Store passphrase if provided and not empty
                if (passphrase && this.passphraseManager) {
                    this.passphraseManager.storePassphrase(certificate.fingerprint, passphrase);
                    certificate.needsPassphrase = true;
                    certificate.updatePassphraseStatus(this.passphraseManager);
                    logger.debug(`Stored passphrase for certificate: ${certificate.name}`, null, FILENAME);
                }

                logger.info(`Certificate ${certificate.fingerprint ? 'renewed' : 'created'} successfully: ${certificate.name} (${certificate.fingerprint})`, null, FILENAME);
            } else {
                logger.error(`Failed to ${certificate.fingerprint ? 'renew' : 'create'} certificate: ${result.error}`, null, FILENAME);
            }

            return result;
        } catch (error) {
            logger.error(`Error ${certificate.fingerprint ? 'renewing' : 'creating'} certificate ${certificate.name}:`, error, FILENAME);
            return { success: false, error: error.message };
        }
    }

    /**
     * Create a backup of a certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Promise<Object>} Created backup object
     */
    async createCertificateBackup(fingerprint) {
        try {
            const certificate = this.getCertificate(fingerprint);
            if (!certificate) {
                throw new Error(`Certificate with fingerprint ${fingerprint} not found`);
            }

            // Define backup directory - Don't use fingerprint as a directory name
            const certName = certificate.name.replace(/[^a-zA-Z0-9-_]/g, '_');
            const certDir = path.join(this.certsDir, 'backups', certName);
            const backupsDir = path.join(certDir, new Date().toISOString().replace(/:/g, '-'));

            // Create directory if it doesn't exist
            if (!fs.existsSync(backupsDir)) {
                fs.mkdirSync(backupsDir, { recursive: true });
            }

            // Create timestamp
            const timestamp = Date.now();
            const backupFile = path.join(backupsDir, `backup-${timestamp}.zip`);

            // Create zip file
            const archiver = require('archiver');
            const output = fs.createWriteStream(backupFile);
            const archive = archiver('zip', { zlib: { level: 9 } }); // Maximum compression

            archive.pipe(output);

            // Add certificate files to the archive
            const files = fs.readdirSync(certDir).filter(file => !file.startsWith('.') && file !== 'backups');

            files.forEach(file => {
                const filePath = path.join(certDir, file);
                archive.file(filePath, { name: file });
            });

            // Add metadata.json
            const metadata = {
                name: certificate.name,
                fingerprint: certificate.fingerprint,
                domains: certificate.domains,
                createdAt: new Date().toISOString(),
                backupDate: new Date().toISOString()
            };

            archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

            // Finalize the archive
            await archive.finalize();

            // Return backup info
            const stats = fs.statSync(backupFile);

            return {
                id: timestamp.toString(),
                date: new Date(timestamp).toISOString(),
                size: stats.size,
                filename: path.basename(backupFile),
                filePath: backupFile
            };
        } catch (error) {
            logger.error(`Error creating backup for certificate ${fingerprint}:`, error, FILENAME);
            throw error;
        }
    }

    /**
     * Delete a certificate backup
     * @param {string} fingerprint - Certificate fingerprint
     * @param {string} backupId - Backup ID
     * @returns {Promise<void>}
     */
    async deleteCertificateBackup(fingerprint, backupId) {
        try {
            const backup = await this.getCertificateBackup(fingerprint, backupId);

            // Delete the backup file
            fs.unlinkSync(backup.filePath);
        } catch (error) {
            this.logger.error(`Error deleting backup ${backupId} for certificate ${fingerprint}:`, error, FILENAME);
            throw error;
        }
    }

    /**
     * Restore a certificate from backup
     * @param {string} fingerprint - Certificate fingerprint
     * @param {string} backupId - Backup ID
     * @returns {Promise<void>}
     */
    async restoreCertificateBackup(fingerprint, backupId) {
        try {
            const backup = await this.getCertificateBackup(fingerprint, backupId);
            // Fix: Use this.certsDir instead of this.certPath
            const certDir = path.join(this.certsDir, fingerprint);

            // Extract the backup
            const extract = require('extract-zip');
            await extract(backup.filePath, { dir: certDir + '-temp' });

            // Read metadata.json to verify it's the right certificate
            const metadataPath = path.join(certDir + '-temp', 'metadata.json');
            if (!fs.existsSync(metadataPath)) {
                throw new Error('Invalid backup: metadata.json not found');
            }

            const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
            if (metadata.fingerprint !== fingerprint) {
                throw new Error('Backup contains a different certificate');
            }

            // Backup current config before restoring
            const config = this.getCertificateConfig(fingerprint);
            fs.writeFileSync(
                path.join(certDir, 'config-before-restore.json'),
                JSON.stringify(config, null, 2)
            );

            // Delete all files in the certificate directory except backups
            const files = fs.readdirSync(certDir).filter(file => !file.startsWith('.') && file !== 'backups');
            files.forEach(file => {
                const filePath = path.join(certDir, file);
                fs.unlinkSync(filePath);
            });

            // Copy restored files to the certificate directory
            const restoredFiles = fs.readdirSync(certDir + '-temp')
                .filter(file => !file.startsWith('.') && file !== 'metadata.json');

            restoredFiles.forEach(file => {
                const source = path.join(certDir + '-temp', file);
                const destination = path.join(certDir, file);
                fs.copyFileSync(source, destination);
            });

            // Clean up temp directory
            fs.rmdirSync(certDir + '-temp', { recursive: true });

            // Reload certificate to update in-memory cache
            this.certificates.set(fingerprint, this.loadCertificate(fingerprint));
        } catch (error) {
            logger.error(`Error restoring backup ${backupId} for certificate ${fingerprint}:`, error, FILENAME);
            throw error;
        }
    }

    /**
     * Get certificate config from certificates.json
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Object} Certificate configuration
     */
    getCertificateConfig(fingerprint) {
        try {
            // Ensure config is loaded
            if (!this.certificatesConfig) {
                try {
                    const configContent = fs.readFileSync(this.configPath, 'utf8');
                    this.certificatesConfig = JSON.parse(configContent);
                } catch (error) {
                    logger.warn(`No certificates config found at ${this.configPath}`, null, FILENAME);
                    this.certificatesConfig = { certificates: {} };
                }
            }

            // Return certificate config or empty object
            if (this.certificatesConfig.certificates &&
                this.certificatesConfig.certificates[fingerprint]) {
                return this.certificatesConfig.certificates[fingerprint];
            }

            return {};
        } catch (error) {
            logger.error(`Error getting certificate config for ${fingerprint}:`, error, FILENAME);
            return {};
        }
    }

    /**
     * Save certificate config to JSON file
     * @param {string} fingerprint - Certificate fingerprint
     * @param {Certificate} certificate - Certificate object
     * @returns {Promise<void>}
     */
    async saveCertificateConfig(fingerprint, certificate) {
        try {
            // Create default config structure if it doesn't exist yet
            if (!this.certificatesConfig) {
                this.certificatesConfig = {
                    version: 1,
                    lastUpdate: new Date().toISOString(),
                    certificates: {}
                };
            }

            // Ensure certificates object exists
            if (!this.certificatesConfig.certificates) {
                this.certificatesConfig.certificates = {};
            }

            // Get the complete JSON representation directly from the certificate
            const certJson = certificate.toJSON();

            // Store the entire certificate data as returned by toJSON()
            this.certificatesConfig.certificates[fingerprint] = certJson;

            // Save the config
            await fs.promises.writeFile(
                this.configPath,
                JSON.stringify(this.certificatesConfig, null, 2),
                'utf8'
            );

            logger.debug(`Saved certificate config for ${certificate.name} (${fingerprint})`, null, FILENAME);
        } catch (error) {
            logger.error(`Failed to save certificate config for ${fingerprint}:`, error, FILENAME);
            // Don't throw the error to prevent cascading failures
        }
    }

    /**
     * Update paths for a specific certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Promise<boolean>} Success status
     */
    async updateCertificatePaths(fingerprint) {
        try {
            if (!fingerprint) {
                logger.warn('Cannot update paths: No fingerprint provided', null, FILENAME);
                return false;
            }

            // Get certificate from storage
            const certificate = this.certificates.get(fingerprint);
            if (!certificate) {
                logger.warn(`Cannot update paths: Certificate not found: ${fingerprint}`, null, FILENAME);
                return false;
            }

            // Get certificate base name for path discovery
            const certName = certificate.name;
            const certPath = certificate.paths.crtPath;

            if (!certName || !certPath) {
                logger.warn(`Cannot update paths: Certificate missing name or path: ${fingerprint}`, null, FILENAME);
                return false;
            }

            logger.debug(`Updating paths for certificate: ${certName} (${fingerprint})`, null, FILENAME);

            // Get base directory
            const baseDir = path.dirname(certPath);

            // Look for related files by name pattern
            const baseName = path.basename(certPath, path.extname(certPath));

            // Extensions to search for
            const extensions = [
                { ext: '.key', pathKey: 'keyPath' },
                { ext: '.p12', pathKey: 'p12Path' },
                { ext: '.pfx', pathKey: 'p12Path' }, // Also mapping .pfx to p12Path
                { ext: '.pem', pathKey: 'pemPath' },
                { ext: '.csr', pathKey: 'csrPath' },
                { ext: '.chain', pathKey: 'chainPath' },
                { ext: '.fullchain', pathKey: 'fullchainPath' }
            ];

            // Update paths
            let pathsUpdated = false;

            for (const { ext, pathKey } of extensions) {
                // Try exact name match
                let filePath = path.join(baseDir, `${baseName}${ext}`);

                // If exact match not found, try name match
                if (!fs.existsSync(filePath)) {
                    filePath = path.join(baseDir, `${certName}${ext}`);
                }

                // If found, update path
                if (fs.existsSync(filePath)) {
                    logger.debug(`Found ${ext} file for certificate ${certName}: ${filePath}`, null, FILENAME);
                    certificate.paths[pathKey] = filePath;
                    pathsUpdated = true;
                }
            }

            if (pathsUpdated) {
                // Save to config
                await this.saveCertificate(certificate);

                logger.info(`Updated paths for certificate: ${certName} (${fingerprint})`, null, FILENAME);
                return true;
            } else {
                logger.debug(`No new paths found for certificate: ${certName} (${fingerprint})`, null, FILENAME);
                return false;
            }
        } catch (error) {
            logger.error(`Error updating certificate paths for ${fingerprint}:`, error, FILENAME);
            return false;
        }
    }

    /**
     * Update certificates metadata in config
     * @returns {Promise<boolean>} Success status
     */
    async updateCertificatesMetadata() {
        try {
            // Load config
            await this.loadConfig();

            // Update metadata for each certificate in config
            const certificatesConfig = this.certificatesConfig.certificates || {};

            for (const [fingerprint, certificate] of this.certificates.entries()) {
                if (!certificatesConfig[fingerprint]) {
                    certificatesConfig[fingerprint] = {};
                }

                // Ensure metadata object exists
                if (!certificatesConfig[fingerprint].metadata) {
                    certificatesConfig[fingerprint].metadata = {};
                }

                // Update metadata fields
                certificatesConfig[fingerprint].metadata = {
                    name: certificate.name,
                    subject: certificate.subject,
                    issuer: certificate.issuer,
                    validFrom: certificate.validFrom,
                    validTo: certificate.validTo,
                    certType: certificate.certType,
                    domains: [...certificate.domains],
                    ips: [...certificate.ips]
                };

                // Update paths
                if (!certificatesConfig[fingerprint].paths) {
                    certificatesConfig[fingerprint].paths = {};
                }

                // Convert paths from certificate (removing Path suffix)
                const paths = certificate.paths;
                if (paths) {
                    Object.entries(paths).forEach(([key, value]) => {
                        if (value) {
                            const cleanKey = key.endsWith('Path') ? key.slice(0, -4) : key;
                            certificatesConfig[fingerprint].paths[cleanKey] = value;
                        }
                    });
                }
            }

            // Save the updated config
            await this.saveConfig();

            return true;
        } catch (error) {
            logger.error('Failed to update certificate metadata:', error, FILENAME);
            return false;
        }
    }

    /**
     * Update a certificate with its issuer CA fingerprint
     * @param {Certificate} certificate - Certificate to update
     * @returns {Promise<boolean>} - Whether the certificate was updated
     */
    async updateCertificateCAFingerprint(certificate) {
        try {
            if (!certificate || !certificate.issuer) {
                return false;
            }

            // Skip self-signed certificates
            if (this._isSelfSigned(certificate.subject, certificate.issuer)) {
                logger.debug(`${certificate.name} is self-signed, not updating caFingerprint`, null, FILENAME);
                return false;
            }

            // Get all CA certificates
            const caCerts = this.getAllCertificates().filter(cert => cert.isCA());

            if (caCerts.length === 0) {
                logger.debug(`No CA certificates found to match as issuer`, null, FILENAME);
                return false;
            }

            // Find CA where subject matches this certificate's issuer
            const issuerCA = caCerts.find(ca => {
                // Compare normalized subjects to handle format variations
                const normalizeString = str => {
                    const components = [];
                    const regex = /(C|ST|L|O|OU|CN)\s*=\s*([^,/]+)/gi;
                    let match;
                    while (match = regex.exec(str)) {
                        components.push({ key: match[1].toUpperCase(), value: match[2].trim() });
                    }
                    components.sort((a, b) => a.key.localeCompare(b.key));
                    return components.map(c => `${c.key}=${c.value}`).join(', ');
                };

                return normalizeString(ca.subject) === normalizeString(certificate.issuer);
            });

            if (issuerCA) {
                logger.debug(`Found signing CA for ${certificate.name}: ${issuerCA.name} (${issuerCA.fingerprint})`, null, FILENAME);

                // Only update if different
                if (certificate.caFingerprint !== issuerCA.fingerprint) {
                    certificate.caFingerprint = issuerCA.fingerprint;
                    certificate.signWithCA = true;

                    // Save the updated certificate configuration
                    await this.saveCertificateConfigs();

                    logger.debug(`Updated caFingerprint for ${certificate.name} to ${issuerCA.fingerprint}`, null, FILENAME);
                    return true;
                }
            } else {
                logger.info(`Could not find a matching CA for issuer: ${certificate.issuer}`, null, FILENAME);
            }

            return false;
        } catch (error) {
            logger.error(`Error updating CA fingerprint for ${certificate.name}:`, error, FILENAME);
            return false;
        }
    }

    /**
     * Update certificate CA relationships using key identifiers
     * @returns {Promise<void>}
     */
    async updateCertificateCARelationships() {
        logger.info('Updating certificate CA relationships', null, FILENAME);

        try {
            // Get all certificates
            const allCerts = Array.from(this.certificates.values());
            const caCount = allCerts.filter(cert => cert.isRootCA || cert.certType === 'intermediateCA').length;

            logger.debug(`Found ${allCerts.length} certificates, including ${caCount} CA certificates`, null, FILENAME);

            // Track updates for logging
            let updatedCount = 0;
            let missingCACount = 0;

            // Process each certificate that isn't self-signed
            for (const cert of allCerts) {
                // Skip self-signed certificates
                if (cert.selfSigned || cert.isRootCA) {
                    logger.finest(`Skipping self-signed certificate: ${cert.name}`, null, FILENAME);
                    continue;
                }

                // For each certificate, try to find its signing CA
                const signingCA = cert.findSigningCA(this);

                if (signingCA) {
                    logger.fine(`Found signing CA for ${cert.name}: ${signingCA.name} (${signingCA.fingerprint})`, null, FILENAME);

                    // Update certificate config with CA info
                    const previousCA = cert._config?.caFingerprint;
                    cert._config.signWithCA = true;
                    cert._config.caFingerprint = signingCA.fingerprint;
                    cert._config.caName = signingCA.name;

                    // Track if this was a change
                    if (previousCA !== signingCA.fingerprint) {
                        updatedCount++;
                        logger.info(`Updated CA reference for ${cert.name}: ${signingCA.name}`, null, FILENAME);
                    }
                } else {
                    missingCACount++;
                    logger.warn(`Could not find signing CA for ${cert.name}`, null, FILENAME);

                    // Clear CA info if we couldn't find a signing CA
                    if (cert._config?.signWithCA) {
                        cert._config.signWithCA = false;
                        cert._config.caFingerprint = null;
                        cert._config.caName = null;
                        updatedCount++;
                        logger.info(`Cleared invalid CA reference for ${cert.name}`, null, FILENAME);
                    }
                }
            }

            logger.info(`Certificate CA relationship update complete: updated ${updatedCount}, missing CAs: ${missingCACount}`, null, FILENAME);

            if (updatedCount > 0) {
                // Save updated configurations
                await this.saveCertificateConfigs();
            }
        } catch (error) {
            logger.error('Error updating certificate CA relationships:', error, FILENAME);
        }
    }

    /**
     * Get changes since last frontend refresh
     * @returns {Promise<Object>} Object with added, updated, and deleted certificates
     */
    async getChangesSinceLastRefresh() {
        try {
            const changes = {
                added: [],
                updated: [...this.pendingChanges],
                deleted: []
            };

            // If cache is expired, need to do a full refresh
            if (!this.isCacheValid()) {
                return null; // Signal that a full refresh is needed
            }

            // Process pending changes
            for (const fingerprint of this.pendingChanges) {
                try {
                    const cert = await this.loadCertificate(fingerprint);

                    if (cert) {
                        // Update in cache
                        this.certificates.set(fingerprint, cert);
                    } else {
                        // Certificate no longer exists
                        this.certificates.delete(fingerprint);
                        changes.updated = changes.updated.filter(fp => fp !== fingerprint);
                        changes.deleted.push(fingerprint);
                    }
                } catch (error) {
                    logger.error(`Error processing certificate change for ${fingerprint}:`, error, FILENAME);
                }
            }

            // Clear pending changes
            this.pendingChanges.clear();

            return changes;
        } catch (error) {
            logger.error('Error getting certificate changes:', error, FILENAME);
            return null; // Signal that a full refresh is needed
        }
    }

    /**
     * Add a domain to a certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @param {string} domain - Domain to add
     * @param {boolean} [idle=true] - Whether the domain should be idle until renewal
     * @returns {Promise<object>} Result object with success status and message
     */
    async addDomain(fingerprint, domain, idle = true) {
        try {
            const cert = this.getCertificate(fingerprint);
            if (!cert) {
                return { success: false, message: 'Certificate not found' };
            }

            const result = cert.addDomain(domain, idle);

            if (result.success) {
                // Save changes to configuration
                await this.saveCertificateConfigs();

                // Notify about certificate change
                this.notifyCertificateChanged(fingerprint, 'update');
            }

            return result;
        } catch (error) {
            logger.error(`Error adding domain to certificate ${fingerprint}:`, error, FILENAME);
            return { success: false, message: error.message };
        }
    }

    /**
     * Remove a domain from a certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @param {string} domain - Domain to remove
     * @param {boolean} [fromIdle=false] - Whether to remove from idle domains
     * @returns {Promise<boolean>} Success status
     */
    async removeDomain(fingerprint, domain, fromIdle = false) {
        try {
            const cert = this.getCertificate(fingerprint);
            if (!cert) {
                return false;
            }

            const removed = cert.removeDomain(domain, fromIdle);

            if (removed) {
                // Save changes to configuration
                await this.saveCertificateConfigs();

                // Notify about certificate change
                this.notifyCertificateChanged(fingerprint, 'update');
            }

            return removed;
        } catch (error) {
            logger.error(`Error removing domain from certificate ${fingerprint}:`, error, FILENAME);
            return false;
        }
    }

    /**
     * Add an IP address to a certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @param {string} ip - IP address to add
     * @param {boolean} [idle=true] - Whether the IP should be idle until renewal
     * @returns {Promise<object>} Result object with success status and message
     */
    async addIp(fingerprint, ip, idle = true) {
        try {
            const cert = this.getCertificate(fingerprint);
            if (!cert) {
                return { success: false, message: 'Certificate not found' };
            }

            const result = cert.addIp(ip, idle);

            if (result.success) {
                // Save changes to configuration
                await this.saveCertificateConfigs();

                // Notify about certificate change
                this.notifyCertificateChanged(fingerprint, 'update');
            }

            return result;
        } catch (error) {
            logger.error(`Error adding IP to certificate ${fingerprint}:`, error, FILENAME);
            return { success: false, message: error.message };
        }
    }

    /**
     * Remove an IP address from a certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @param {string} ip - IP address to remove
     * @param {boolean} [fromIdle=false] - Whether to remove from idle IPs
     * @returns {Promise<boolean>} Success status
     */
    async removeIp(fingerprint, ip, fromIdle = false) {
        try {
            const cert = this.getCertificate(fingerprint);
            if (!cert) {
                return false;
            }

            const removed = cert.removeIp(ip, fromIdle);

            if (removed) {
                // Save changes to configuration
                await this.saveCertificateConfigs();

                // Notify about certificate change
                this.notifyCertificateChanged(fingerprint, 'update');
            }

            return removed;
        } catch (error) {
            logger.error(`Error removing IP from certificate ${fingerprint}:`, error, FILENAME);
            return false;
        }
    }

    /**
     * Apply idle domains and IPs (moves them to active) and renews the certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Promise<Object>} Result of renewal operation
     */
    async applyIdleSubjectsAndRenew(fingerprint) {
        try {
            const cert = this.getCertificate(fingerprint);
            if (!cert) {
                throw new Error(`Certificate not found: ${fingerprint}`);
            }

            // Apply idle domains and IPs to active lists
            const hadChanges = cert.applyIdleSubjects();

            if (!hadChanges) {
                return {
                    success: false,
                    message: 'No idle subjects to apply'
                };
            }

            // Save configuration changes
            await this.saveCertificateConfigs();

            // Now renew the certificate with the new subjects
            const renewResult = await this.renewAndDeployCertificate(fingerprint);

            return {
                success: true,
                message: 'Applied idle subjects and renewed certificate',
                renewResult
            };
        } catch (error) {
            logger.error(`Error applying idle subjects for certificate ${fingerprint}:`, error, FILENAME);
            throw error;
        }
    }

    /**
     * Save certificate to configuration
     * @param {Certificate} certificate - Certificate object to save
     * @returns {Promise<boolean>} Success status
     */
    async saveCertificate(certificate) {
        if (!certificate || !certificate.fingerprint) {
            logger.error('Invalid certificate data provided for saving', null, FILENAME);
            return false;
        }

        try {
            // Load existing config
            await this.loadConfig();

            // Initialize certificates object if it doesn't exist
            if (!this.certificatesConfig.certificates) {
                this.certificatesConfig.certificates = {};
            }

            // Prepare certificate data for saving
            const fingerprint = certificate.fingerprint;

            logger.fine(`Saving certificate ${certificate.name} (${fingerprint})`, null, FILENAME);
            logger.finest(`- Subject: ${certificate.subject}`, null, FILENAME);
            logger.finest(`- Issuer: ${certificate.issuer}`, null, FILENAME);

            const certConfig = {
                autoRenew: certificate.autoRenew,
                renewDaysBeforeExpiry: certificate.renewDaysBeforeExpiry,
                signWithCA: certificate.signWithCA,
                caFingerprint: certificate.caFingerprint,
                deployActions: certificate.deployActions,
                previousVersions: certificate.previousVersions,
                paths: {}
            };

            // Add paths
            const paths = certificate.paths;
            if (paths) {
                // Remove the "Path" suffix for storage
                Object.entries(paths).forEach(([key, value]) => {
                    if (value && fs.existsSync(value)) {
                        const cleanKey = key.endsWith('Path') ? key.slice(0, -4) : key;
                        certConfig.paths[cleanKey] = value;
                        logger.finest(`Adding path to config: ${cleanKey} = ${value}`, null, FILENAME);
                    } else if (value) {
                        logger.fine(`Skipping non-existent path: ${key} = ${value}`, null, FILENAME);
                    }
                });

                logger.debug(`Saving paths: ${JSON.stringify(certConfig.paths)}`, null, FILENAME);
            }

            // Add metadata for storage
            certConfig.metadata = {
                name: certificate.name,
                subject: certificate.subject,
                issuer: certificate.issuer,
                validFrom: certificate.validFrom,
                validTo: certificate.validTo,
                certType: certificate.certType,
                domains: Array.isArray(certificate.domains) ? [...certificate.domains] : [],
                ips: Array.isArray(certificate.ips) ? [...certificate.ips] : []
            };

            // Update config
            this.certificatesConfig.certificates[fingerprint] = certConfig;

            // Save config to file
            await this.saveConfig();

            // Update in-memory cache
            this.certificates.set(fingerprint, certificate);

            return true;
        } catch (error) {
            logger.error(`Failed to save certificate ${certificate.name}:`, error, FILENAME);
            return false;
        }
    }

    /**
     * Rescan certificates directory and update certificates
     * @returns {Promise<Map<string, Certificate>>} Updated certificates map
     */
    async rescanCertificates() {
        logger.info('Rescanning certificate directory for changes', null, FILENAME);

        try {
            // Find all certificate files
            const certFiles = await this.findCertificateFiles();
            logger.debug(`Found ${certFiles.length} certificate files`, null, FILENAME);

            // Process each certificate file
            const processedCerts = new Map();
            const existingFingerprints = new Set(this.certificates.keys());

            // Process each certificate file
            for (const certFile of certFiles) {
                try {
                    // Parse certificate file to extract data
                    logger.debug(`Processing certificate file: ${certFile}`, null, FILENAME);
                    const certData = await this.parseCertificateFile(certFile);

                    if (!certData || !certData.fingerprint) {
                        logger.warn(`Failed to extract valid data from certificate file: ${certFile}`, null, FILENAME);
                        continue;
                    }

                    const fingerprint = certData.fingerprint;
                    let cert;

                    // Check if we already have this certificate
                    if (this.certificates.has(fingerprint)) {
                        // Update existing certificate
                        cert = this.certificates.get(fingerprint);

                        // Update certificate with new data using updateFromData method
                        cert.updateFromData(certData, { preserveConfig: true });
                        logger.debug(`Updated existing certificate: ${cert.name} (${fingerprint})`, null, FILENAME);
                    } else {
                        // Create new certificate object with Certificate constructor
                        const Certificate = require('./Certificate');
                        cert = new Certificate({
                            name: certData.name || path.basename(certFile, path.extname(certFile)),
                            fingerprint: certData.fingerprint
                        });

                        // Initialize with all data
                        cert.updateFromData(certData, { preserveConfig: false });
                        logger.debug(`Created new certificate: ${cert.name} (${fingerprint})`, null, FILENAME);
                    }

                    // Add to processed certificates
                    processedCerts.set(fingerprint, cert);
                    existingFingerprints.delete(fingerprint);
                } catch (error) {
                    logger.error(`Failed to process certificate file ${certFile}:`, error, FILENAME);
                }
            }

            // Merge with existing certificates that weren't found during scan
            // (might not have files anymore but we don't want to lose their config)
            for (const fingerprint of existingFingerprints) {
                const cert = this.certificates.get(fingerprint);
                if (cert) {
                    processedCerts.set(fingerprint, cert);
                }
            }

            // Replace the certificates map with the new one
            this.certificates = processedCerts;

            // Merge with certificate configurations
            await this.mergeCertificateConfigs();

            // Update the metadata in the config file
            await this.updateCertificatesMetadata();

            return this.certificates;
        } catch (error) {
            logger.error('Error scanning certificates:', error, FILENAME);
            throw error;
        }
    }

    /**
     * Handle a frontend refresh request efficiently
     * @param {Object} options - Refresh options
     * @param {boolean} options.force - Whether to force a complete refresh
     * @returns {Array} Array of certificate objects with metadata
     */
    handleFrontendRefresh(options = {}) {
        const force = options.force === true;

        if (force) {
            // For explicit force refresh requests, schedule a background refresh
            setTimeout(() => {
                this.forceRefresh()
                    .then(() => {
                        logger.info('Completed forced certificate refresh', null, FILENAME);
                    })
                    .catch(error => {
                        logger.error('Error during forced certificate refresh:', error, FILENAME);
                    });
            }, 0);

            logger.info('Scheduled forced certificate refresh in background', null, FILENAME);
        }
        else if (this.pendingChanges.size > 0) {
            // If we have pending changes, refresh just those
            setTimeout(() => {
                this.refreshCachedCertificates([...this.pendingChanges])
                    .then(count => {
                        logger.fine(`Background refresh updated ${count} certificates`, null, FILENAME);
                    })
                    .catch(error => {
                        logger.error('Error in background certificate refresh:', error, FILENAME);
                    });
            }, 0);

            logger.fine(`Returning cached certificates while refreshing ${this.pendingChanges.size} pending changes`, null, FILENAME);
        }

        // Always return the current cache state immediately
        return this.getAllCertificatesWithMetadata();
    }

    /**
 * Determines if a certificate is self-signed by comparing subject and issuer
 * @param {string} subject - Certificate subject
 * @param {string} issuer - Certificate issuer
 * @returns {boolean} True if certificate appears to be self-signed
 * @private
 */
    _isSelfSigned(subject, issuer) {
        if (!subject || !issuer) {
            return false;
        }

        // For exact matches, easy comparison
        if (subject === issuer) {
            return true;
        }

        // For more complex cases, normalize and compare DN components
        try {
            // Parse the DNs into components
            const parseDistinguishedName = (dn) => {
                const components = {};
                const regex = /(C|ST|L|O|OU|CN)=([^,/]+)/gi;
                let match;

                while (match = regex.exec(dn)) {
                    const key = match[1].toUpperCase();
                    const value = match[2].trim();
                    components[key] = value;
                }

                return components;
            };

            const subjectComponents = parseDistinguishedName(subject);
            const issuerComponents = parseDistinguishedName(issuer);

            // If CN is the same and we have at least one matching component, consider it self-signed
            if (subjectComponents.CN &&
                subjectComponents.CN === issuerComponents.CN) {

                // Check if other components match
                let matchingComponents = 0;
                let totalComponents = 0;

                for (const key in subjectComponents) {
                    totalComponents++;
                    if (issuerComponents[key] === subjectComponents[key]) {
                        matchingComponents++;
                    }
                }

                // If more than half of components match, consider it self-signed
                return (matchingComponents / totalComponents) > 0.5;
            }

            return false;
        } catch (error) {
            logger.error('Error comparing certificate subject and issuer:', error, FILENAME);
            // If there's an error in parsing, default to comparing the raw strings
            return subject === issuer;
        }
    }

    /**
     * Get formatted certificate data for API response
     * @param {string} fingerprint - Certificate fingerprint
     * @param {object} [options={}] - Options for response generation
     * @param {boolean} [options.includePaths=true] - Whether to include file paths
     * @param {boolean} [options.includeConfig=true] - Whether to include configuration
     * @param {boolean} [options.includeHistory=false] - Whether to include version history
     * @returns {object|null} Certificate data or null if not found
     */
    getCertificateApiResponse(fingerprint, options = {}) {
        const includePaths = options.includePaths !== false;
        const includeConfig = options.includeConfig !== false;
        const includeHistory = options.includeHistory === true;

        logger.fine(`Getting API response for certificate ${fingerprint}`, null, FILENAME);

        // Get the certificate by fingerprint
        const certificate = this.getCertificate(fingerprint);
        if (!certificate) {
            logger.warn(`Certificate not found with fingerprint: ${fingerprint}`, null, FILENAME);
            return null;
        }

        // Check if certificate has a stored passphrase if we have a passphrase manager
        const hasPassphrase = certificate._hasPassphrase !== undefined ?
            certificate._hasPassphrase :
            certificate.hasStoredPassphrase(this.passphraseManager);

        // Calculate days until expiry
        const daysUntilExpiry = certificate.daysUntilExpiry();

        // Determine if certificate is expiring soon or expired
        const isExpired = certificate.isExpired();
        const isExpiringSoon = certificate.isExpiringSoon(certificate.renewDaysBeforeExpiry);

        // Get basic JSON representation from certificate
        const baseData = certificate.toJSON();

        // Create API response with all necessary fields
        const response = {
            name: baseData.name,
            fingerprint: baseData.fingerprint,
            subject: baseData.subject,
            issuer: baseData.issuer,
            validFrom: baseData.validFrom,
            validTo: baseData.validTo,
            description: baseData.description || '',
            certType: baseData.certType,
            keyType: baseData.keyType,
            keySize: baseData.keySize,
            sigAlg: baseData.sigAlg || '',
            sans: baseData.sans,
            isExpired,
            isExpiringSoon,
            daysUntilExpiry,
            needsPassphrase: baseData.needsPassphrase,
            hasPassphrase: hasPassphrase,
            modificationTime: baseData.modificationTime
        };

        // Add paths if requested
        if (includePaths) {
            response.paths = baseData.paths || {};
        }

        // Add configuration if requested
        if (includeConfig) {
            response.config = {
                autoRenew: baseData.config.autoRenew,
                renewDaysBeforeExpiry: baseData.config.renewDaysBeforeExpiry,
                signWithCA: baseData.config.signWithCA,
                caFingerprint: baseData.config.caFingerprint,
                deployActions: baseData.config.deployActions || []
            };
        }

        // Add history if requested
        if (includeHistory) {
            const previousVersions = certificate.getPreviousVersions();
            response.previousVersions = previousVersions.map(pv => ({
                fingerprint: pv.fingerprint,
                archivedAt: pv.archivedAt,
                version: pv.version
            }));
        }

        // Add ACME settings if they exist
        if (baseData.acmeSettings) {
            response.acmeSettings = baseData.acmeSettings;
        }

        // Add CA information if available
        if (baseData.config.caFingerprint && this.certificates.has(baseData.config.caFingerprint)) {
            response.config.caName = this.getCAName(baseData.config.caFingerprint);
        }

        logger.debug(`Generated API response for certificate ${baseData.name}`, null, FILENAME);
        return response;
    }

    /**
     * Find a CA certificate by subject
     * @param {string} subject - Subject to match against CA certificates
     * @returns {string|null} Fingerprint of matching CA certificate or null if none found
     */
    findCABySubject(subject) {
        // Normalize the subject for comparison
        const normalizedSubject = this.normalizeSubject(subject);

        // Search for CA certificates
        for (const [fingerprint, cert] of this.certificates.entries()) {
            if (cert.isCA() && cert.subject) {
                // Normalize CA's subject for comparison
                const normalizedCASubject = this.normalizeSubject(cert.subject);

                // Check if subjects match
                if (normalizedSubject === normalizedCASubject) {
                    logger.fine(`Found CA match: ${cert.name} subject ${normalizedCASubject} matches ${normalizedSubject}`, null, FILENAME);
                    return fingerprint;
                }
            }
        }

        return null;
    }

    /**
     * Normalize a subject string for comparison
     * @param {string} subject - Subject to normalize
     * @returns {string} Normalized subject
     */
    normalizeSubject(subject) {
        if (!subject) return '';

        // Extract key-value pairs
        const pairs = [];
        const regex = /(C|ST|L|O|OU|CN)\s*=\s*([^,\/]+)/gi;
        let match;

        while (match = regex.exec(subject)) {
            const key = match[1].toUpperCase();
            const value = match[2].trim();
            pairs.push(`${key}=${value}`);
        }

        // Sort pairs for consistent comparison
        pairs.sort();

        return pairs.join(',');
    }

    /**
     * Create periodic backups of the certificate configuration
     */
    async createConfigBackup() {
        try {
            if (!fs.existsSync(this.configPath)) {
                return false;
            }

            // Create backup directory if it doesn't exist
            const backupDir = path.join(path.dirname(this.configPath), 'backups');
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            // Create a timestamped backup file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(backupDir, `certificates-${timestamp}.json`);

            // Copy the current config file
            fs.copyFileSync(this.configPath, backupPath);
            logger.info(`Created backup of certificates configuration: ${backupPath}`, null, FILENAME);

            // Clean up old backups (keep last 10)
            const backups = fs.readdirSync(backupDir)
                .filter(file => file.startsWith('certificates-'))
                .map(file => path.join(backupDir, file))
                .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());

            if (backups.length > 10) {
                for (let i = 10; i < backups.length; i++) {
                    fs.unlinkSync(backups[i]);
                    logger.fine(`Removed old certificate config backup: ${backups[i]}`, null, FILENAME);
                }
            }

            return true;
        } catch (error) {
            logger.error('Error creating certificate config backup:', error, FILENAME);
            return false;
        }
    }
}

module.exports = CertificateManager;