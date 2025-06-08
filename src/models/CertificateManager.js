const fs = require('fs');
const path = require('path');
const Certificate = require('./Certificate');
const PassphraseManager = require('../services/PassphraseManager');
const logger = require('../services/logger');

const FILENAME = 'models/CertificateManager.js';

/**
 * Certificate Manager class for handling SSL certificate operations
 * Enhanced with caching mechanism to improve performance when refreshing the frontend
 * @class CertificateManager
 */
class CertificateManager {

    /**
     * Constructor for CertificateManager
     * Initializes the certificate manager with required services and sets up caching
     * @param {Object} configService - Configuration service instance for accessing settings
     * @param {Object} cryptoService - Crypto service instance for certificate operations (note: parameter name was incorrect)
     * @param {Object} [activityService=null] - Activity service instance for logging operations
     */
    constructor(configService, cryptoService, activityService = null) {
        // Initialization state flag
        this.isInitialized = false;

        // Assign configService
        this.configService = configService;
        
        // Ensure certsDir is an absolute path
        this.certsDir = configService.get('certsDir');
        logger.debug(`Using certificates directory: ${this.certsDir}`, null, FILENAME);

        // Set up config directory and paths
        this.configDir = configService.get('configDir');
        logger.debug(`Using configuration directory: ${this.configDir}`, null, FILENAME);

        this.configPath = path.join(this.configDir, 'certificates.json');
        logger.debug(`Certificate configuration path: ${this.configPath}`, null, FILENAME);

        this.archiveBaseDir = this.configService.get('archiveBaseDir');
        logger.debug(`Using archive base directory: ${this.archiveBaseDir}`, null, FILENAME);

        // Initialize passphrase manager
        this.passphraseManager = new PassphraseManager(this.configDir);
          // Assign cryptoService wrapper
        this.cryptoService = cryptoService;

        // Assign activity service
        this.activityService = activityService;

        this.certificates = new Map();

        // Cache-related properties
        this.lastRefreshTime = 0;
        this.cacheExpiryTime = 5 * 60 * 1000; // Default 5 minutes
        this.configLastModified = 0;
        this.certificatesLastModified = {}; // Map of fingerprint -> last modified time
        this.pendingChanges = new Set(); // Set of fingerprints with pending changes


        this.loadCertificates().then(() => {
            this.isInitialized = true;
            logger.info('Certificate manager initialization complete', null, FILENAME);
            if (logger.isLevelEnabled('fine', FILENAME)) {
                logger.fine('Certificate manager initialized with certificates:', this.getAllCertificatesWithMetadata(), FILENAME);
            }
        }).catch(error => {
            logger.error('Error during certificate manager initialization:', error, FILENAME);
            // Still mark as initialized to prevent permanent loading state
            this.isInitialized = true;
        });

        // Load the configuration file's last modified time
        try {
            const stats = fs.statSync(this.configPath);
            this.configLastModified = stats.mtimeMs;
        } catch (error) {
            // Config file might not exist yet
            logger.debug(`No certificate config found at ${this.configPath} or couldn't read stats`, null, FILENAME);
        }
    }    /**
     * Set cache expiry time for certificate data
     * @param {number} milliseconds - Time in milliseconds for cache to live (must be >= 0)
     * @returns {void}
     */
    setCacheExpiryTime(milliseconds) {
        if (typeof milliseconds === 'number' && milliseconds >= 0) {
            this.cacheExpiryTime = milliseconds;
            logger.info(`Certificate cache expiry time set to ${milliseconds}ms`, null, FILENAME);
        } else {
            logger.warn(`Invalid cache expiry time: ${milliseconds}, using default`, null, FILENAME);
        }
    }    /**
     * Check if certificate cache is still valid
     * Validates cache based on time expiry and optionally file modification times
     * @param {boolean} [deepCheck=false] - Whether to check file modifications as well as time-based expiry
     * @returns {boolean} True if cache is valid and can be used, false if refresh is needed
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
                const cert = await this.loadCertificateFromJSON(fingerprint);
                // TODO: Refresh from File as well
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
     * Load all certificates from directory with improved loading strategy
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

            // Step 1: Load the JSON configuration first
            await this.loadConfigurationFile();
            logger.info(`Loaded certificate configuration with ${Object.keys(this.certificatesConfig?.certificates || {}).length} certificates`, null, FILENAME);

            // Step 2: Create certificate objects from configuration
            await this.createCertificatesFromConfig();
            logger.debug(`Created ${this.certificates.size} certificates from configuration`, null, FILENAME);

            // Step 3: Find all certificate files in the directory
            const certFiles = await this.findCertificateFiles();
            logger.info(`Found ${certFiles.length} certificate files on disk`, null, FILENAME);

            // Step 4: Process each certificate file and update existing certificates
            let updatedCount = 0;
            let newCount = 0;

            for (const certFile of certFiles) {
                try {
                    // Extract certificate data from file
                    const certInfo = await this.parseCertificateFile(certFile);
                    
                    if (!certInfo || !certInfo.fingerprint) {
                        logger.warn(`Failed to extract data from certificate file: ${certFile}`, null, FILENAME);
                        continue;
                    }

                    // Check if certificate already exists by fingerprint
                    if (this.certificates.has(certInfo.fingerprint)) {
                        // Update existing certificate with file data (which takes priority)
                        const cert = this.certificates.get(certInfo.fingerprint);
                        cert.updateConfig(certInfo, { preserveConfig: false });
                        logger.fine(`Updated certificate from file: ${cert.name} (${certInfo.fingerprint})`, null, FILENAME);
                        updatedCount++;
                    } else {
                        // Create new certificate
                        const Certificate = require('./Certificate');
                        const newCert = new Certificate(certInfo);
                        this.certificates.set(certInfo.fingerprint, newCert);
                        logger.info(`Added new certificate from file: ${newCert.name} (${certInfo.fingerprint})`, null, FILENAME);
                        newCount++;
                    }
                } catch (error) {
                    logger.error(`Error processing certificate file ${certFile}:`, error, FILENAME);
                }
            }
            
            logger.info(`Updated ${updatedCount} existing certificates and added ${newCount} new certificates from files`, null, FILENAME);

            // Step 5: Update passphrase status for all certificates
            await this.updateHasPassphrase();

            // Step 6: Update CA relationships between certificates
            await this.updateCertificateCARelationships();

            // Step 7: Save updated configuration if there were changes
            const needsToSave = (newCount > 0) || this._checkIfConfigNeedsSaving();
            if (needsToSave) {
                logger.info('Detected changes that need to be saved to configuration', null, FILENAME);
                await this.saveCertificateConfigs();
            } else {
                logger.debug('No changes detected in certificate configuration, skipping save', null, FILENAME);
            }

            return this.certificates.size > 0;
        } catch (error) {
            logger.error('Error loading certificates:', error, FILENAME);
            return false;
        }
    }

    /**
     * Load certificate configuration from JSON file
     * @returns {Promise<Object>} The loaded configuration
     */
    async loadConfigurationFile() {
        try {
            const absoluteConfigPath = path.resolve(this.configPath);
            logger.debug(`Loading certificate config from: ${absoluteConfigPath}`, null, FILENAME);

            // If config file doesn't exist, initialize empty config
            if (!fs.existsSync(absoluteConfigPath)) {
                logger.info(`Certificate config file not found at ${absoluteConfigPath}, initializing empty config`, null, FILENAME);
                this.certificatesConfig = {
                    version: 1,
                    lastUpdate: new Date().toISOString(),
                    certificates: {}
                };
                return this.certificatesConfig;
            }

            // Read and parse the config file
            try {
                const stats = fs.statSync(absoluteConfigPath);
                logger.debug(`Certificate config file stats: size=${stats.size}, mode=${stats.mode.toString(8)}, uid=${stats.uid}, gid=${stats.gid}`, null, FILENAME);

                if (stats.size === 0) {
                    logger.warn(`Certificate config file exists but is empty: ${absoluteConfigPath}`, null, FILENAME);
                    this.certificatesConfig = {
                        version: 1,
                        lastUpdate: new Date().toISOString(),
                        certificates: {}
                    };
                    return this.certificatesConfig;
                }

                const configContent = fs.readFileSync(absoluteConfigPath, 'utf8');
                logger.debug(`Read ${configContent.length} bytes from certificate config file`, null, FILENAME);

                if (!configContent || configContent.trim() === '') {
                    logger.warn(`Certificate config file is empty, initializing empty config`, null, FILENAME);
                    this.certificatesConfig = {
                        version: 1,
                        lastUpdate: new Date().toISOString(),
                        certificates: {}
                    };
                    return this.certificatesConfig;
                }

                const config = JSON.parse(configContent);
                logger.debug(`Successfully parsed certificate config with ${Object.keys(config.certificates || {}).length} certificates`, null, FILENAME);

                // Store the loaded configuration
                this.certificatesConfig = config;
                return config;
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

                // Initialize with empty config
                this.certificatesConfig = {
                    version: 1,
                    lastUpdate: new Date().toISOString(),
                    certificates: {}
                };
                return this.certificatesConfig;
            }
        } catch (error) {
            logger.error(`Failed to load certificate configuration: ${error.message}`, error, FILENAME);
            throw error;
        }
    }

    /**
     * Create certificate objects from configuration
     * @returns {Promise<void>}
     */
    async createCertificatesFromConfig() {
        try {
            if (!this.certificatesConfig || !this.certificatesConfig.certificates) {
                logger.debug('No certificate configuration loaded, skipping certificate creation from config', null, FILENAME);
                return;
            }

            const certificates = this.certificatesConfig.certificates;
            let createdCount = 0;

            for (const [fingerprint, certConfig] of Object.entries(certificates)) {
                try {
                    // Skip if certificate already exists (already loaded)
                    if (this.certificates.has(fingerprint)) {
                        continue;
                    }

                    // Create certificate from config
                    const Certificate = require('./Certificate');
                    const cert = new Certificate(certConfig);
                    
                    // Ensure the fingerprint is set
                    if (!cert.fingerprint) {
                        cert.fingerprint = fingerprint;
                    }

                    // Add to certificates map
                    this.certificates.set(fingerprint, cert);
                    createdCount++;
                    
                    logger.fine(`Created certificate from config: ${cert.name} (${fingerprint})`, null, FILENAME);
                } catch (error) {
                    logger.error(`Failed to create certificate from config for ${fingerprint}:`, error, FILENAME);
                }
            }

            logger.debug(`Created ${createdCount} certificates from configuration`, null, FILENAME);
        } catch (error) {
            logger.error('Error creating certificates from config:', error, FILENAME);
            throw error;
        }
    }

    /**
     * Load certificate from the filesystem
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Certificate} Certificate object
     */
    loadCertificateFromJSON(fingerprint) {
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
                        // Update existing certificate using its own updateConfig method
                        const cert = this.certificates.get(fingerprint);
                        cert.updateConfig(certConfig, { preserveConfig: true });
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
     * Update passphrase status for all certificates
     * Uses the passphrase manager to check if certificates with passphrase requirements
     * have a stored passphrase, and updates their status accordingly
     * 
     * @returns {Promise<void>}
     */
    async updateHasPassphrase() {
        logger.debug("Starting passphrase status update for all certificates", null, FILENAME);

        if (!this.passphraseManager) {
            logger.info("Passphrase manager not available, skipping passphrase status update", null, FILENAME);
            return;
        }

        // CertificateManager uses a Map for certificates, not an array
        if (!this.certificates || this.certificates.size === 0) {
            logger.debug("No certificates to update passphrase status for", null, FILENAME);
            return;
        }

        logger.debug(`Updating passphrase status for ${this.certificates.size} certificates`, null, FILENAME);
        let updatedCount = 0;

        // Process all certificates that need passphrase
        for (const [fingerprint, certificate] of this.certificates.entries()) {
            const certName = certificate.name || certificate.commonName || "unnamed";

            try {
                // Check if certificate needs a passphrase by checking the key file
                const needsPassphrase = certificate.needsPassphrase;

                if (needsPassphrase) {
                    logger.fine(`Updating passphrase status for certificate: ${certName}`, null, FILENAME, certName);
                    certificate.updatePassphraseStatus(this.passphraseManager);
                    updatedCount++;
                } else {
                    // Certificate doesn't need passphrase, ensure status is correct
                    if (certificate.hasPassphrase !== false) {
                        certificate.hasPassphrase = false;
                        certificate.needsPassphrase = false;
                        logger.fine(`Set no-passphrase status for certificate: ${certName}`, null, FILENAME, certName);
                        updatedCount++;
                    }
                }
            } catch (error) {
                logger.warn(`Error updating passphrase status for certificate ${certName}: ${error.message}`, error, FILENAME, certName);
            }
        }

        logger.info(`Updated passphrase status for ${updatedCount} certificates`, null, FILENAME);
    }

    /**
     * Process a single certificate file
     * @param {string} certsDir - Path to certificate file
     * @returns {Promise<boolean>} Whether the certificate was successfully processed
     */
    async processSingleCertificateFile(certsDir) {
        try {
            // Parse certificate info with cryptoService
            const certInfo = await this.parseCertificateFile(certsDir);
            if (!certInfo) {
                logger.warn(`Failed to parse certificate file: ${certsDir}`, null, FILENAME);
                return false;
            }

            // Create or update certificate
            let certificate;

            // Check if certificate already exists by fingerprint
            if (certInfo.fingerprint && this.certificates.has(certInfo.fingerprint)) {
                certificate = this.certificates.get(certInfo.fingerprint);
                logger.fine(`Updating existing certificate with fingerprint: ${certInfo.fingerprint}`, null, FILENAME, certificate.name);

                // Update certificate with new information
                certificate.updateConfig(certInfo);
            } else {
                certificate = new Certificate(certInfo);

                // Add to certificates map
                this.certificates.set(certificate.fingerprint, certificate);
                logger.fine(`Added certificate ${certificate.name} (${certificate.fingerprint})`, null, FILENAME, certificate.name);
            }

            // Check passphrase requirement if cryptoService is available
            if (this.cryptoService) {
                try {
                    // Get key path from the certificate
                    const keyPath = certificate.paths?.keyPath || certificate.paths?.key;

                    if (keyPath && fs.existsSync(keyPath)) {
                        // Use isKeyEncrypted directly to check if the key needs a passphrase
                        const needsPassphrase = await this.cryptoService.isKeyEncrypted(keyPath);
                        logger.info(`Passphrase requirement checked for ${certificate.name}: ${needsPassphrase ? 'Needs passphrase' : 'No passphrase required'}`, null, FILENAME, certificate.name);

                        // Update the certificate using its own method
                        certificate.needsPassphrase = needsPassphrase;
                    } else {
                        logger.debug(`No key file found to check passphrase requirement for ${certificate.name}`, null, FILENAME, certificate.name);
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
            logger.error(`Error processing certificate file ${certsDir}:`, error, FILENAME);
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

            // Use cryptoService wrapper instead of direct execution
            const certInfo = await this.cryptoService.getCertificateInfo(filePath);

            // Log extracted certificate info for debugging
            logger.finest(`Certificate info extracted from ${filePath}:`, null, FILENAME);
            logger.finest(`- CommonName: ${certInfo.commonName}`, null, FILENAME);
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

            // Create result object with all necessary fields
            const result = {
                commonName: certInfo.commonName,
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
                    ips
                },
                isCA: certInfo.isCA,
                isRootCA: certInfo.isRootCA,
                pathLenConstraint: certInfo.pathLenConstraint,
                serialNumber: certInfo.serialNumber,
                subjectKeyIdentifier: certInfo.subjectKeyIdentifier,
                authorityKeyIdentifier: certInfo.authorityKeyIdentifier,
                keyType: certInfo.keyType,
                keySize: certInfo.keySize,
                signatureAlgorithm: certInfo.signatureAlgorithm,
                selfSigned: certInfo.selfSigned,
                config: {
                    signWithCA: !certInfo.selfSigned && certInfo.certType !== 'rootCA',
                }
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
     * @param {string} certsDir - Certificate file path
     * @returns {string|null} Key file path or null if not found
     */
    findKeyFile(certsDir) {
        const baseName = path.basename(certsDir, path.extname(certsDir));
        const certDir = path.dirname(certsDir);

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
        const loadedCert = this.loadCertificateFromJSON(cleanedFingerprint) ||
            this.loadCertificateFromJSON(fingerprint);

        if (loadedCert) {
            // Store with clean fingerprint
            this.certificates.set(cleanedFingerprint, loadedCert);
            return loadedCert;
        }

        return null;
    }

    /**
     * Add or update a certificate in the manager
     * @param {Certificate} certificate - Certificate object to add or update
     * @returns {void}
     * @throws {Error} If the certificate is invalid or missing fingerprint
     */
    addCertificate(certificate) {
        if (certificate && certificate.fingerprint) {
            this.certificates.set(certificate.fingerprint, certificate);
            logger.debug(`Added/Updated certificate ${certificate.name} (${certificate.fingerprint}) in manager.`, null, FILENAME, certificate.name);
        } else {
            logger.warn('Attempted to add invalid certificate to manager.', certificate, FILENAME);
        }
    }

    /**
     * Remove a certificate from the manager
     * @param {string} fingerprint - Certificate fingerprint to remove
     * @returns {void}
     * @throws {Error} If the fingerprint is not found in the manager
     */
    removeCertificate(fingerprint) {
        if (this.certificates[fingerprint]) {
            const certName = this.certificates[fingerprint].name;
            this.certificates.delete(fingerprint);
            logger.debug(`Removed certificate ${certName} (${fingerprint}) from manager.`, null, FILENAME, certName);
        }
    }

    /**
     * Get all certificates in a consistent JSON format
     * @returns {Array} Array of certificate objects in JSON format
     */
    getAllCertificates() {
        return Array.from(this.certificates.values()).map(certificateObject => certificateObject.toJSON());
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

            // TODO: May we implement a trash bin?

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
     * Store a passphrase for a certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @param {string} passphrase - Passphrase to store
     * @returns {boolean} Success status
     */
    storePassphrase(fingerprint, passphrase) {
        logger.debug(`Storing passphrase for certificate ${fingerprint}`, null, FILENAME);
        try {
            if (!fingerprint) {
                throw new Error('Fingerprint is required');
            }

            this.passphraseManager.storePassphrase(fingerprint, passphrase);
            // Update the certificate to reflect that it now has a stored passphrase
            const cert = this.getCertificate(fingerprint);
            if (cert) {
                cert.needsPassphrase = true;
                cert.updatePassphraseStatus(this.passphraseManager);
                logger.info(`Updated certificate ${cert.name} to reflect stored passphrase`, null, FILENAME);
            }
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

        const result = this.passphraseManager.deletePassphrase(fingerprint);
        if (result) {
            const cert = this.getCertificate(fingerprint);
            if (cert) {
                cert.updatePassphraseStatus(this.passphraseManager);
                logger.info(`Updated certificate ${cert.name} to reflect stored passphrase`, null, FILENAME);
            }
        }
        return result;
    }

    /**
     * Rotate the encryption key for passphrases
     * @returns {boolean} Success status
     */
    rotateEncryptionKey() {
        return this.passphraseManager.rotateEncryptionKey();
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
     * Prepares an array of node-forge compatible extension objects.
     * This is a conceptual placeholder and needs full implementation.
     * @param {Certificate} certificate - The certificate object containing desired properties (SANs, isCA, etc.).
     * @param {boolean} [forCsr=false] - If true, prepares extensions suitable for a CSR (e.g., subjectAltName).
     * @returns {Array<Object>} Array of node-forge extension objects.
     * @private
     */
    _prepareForgeExtensions(certificate, forCsr = false) {
        const extensions = [];
        const pki = require('node-forge').pki; // For OIDs

        // 1. Subject Key Identifier (SKI) - Forge adds this if the extension name is present
        extensions.push({ name: 'subjectKeyIdentifier' });

        // 2. Basic Constraints
        if (certificate.isCA) {
            const bc = { name: 'basicConstraints', cA: true, critical: true };
            if (typeof certificate.pathLengthConstraint === 'number' && certificate.pathLengthConstraint >= 0) {
                bc.pathLenConstraint = certificate.pathLengthConstraint;
            }
            extensions.push(bc);
        } else if (!forCsr) { // For final cert, not CSR if not CA
            extensions.push({ name: 'basicConstraints', cA: false, critical: true });
        }

        // 3. Key Usage
        let ku = {};
        if (certificate.config?.keyUsage && Object.keys(certificate.config.keyUsage).length > 0) {
            ku = { name: 'keyUsage', critical: true, ...certificate.config.keyUsage };
        } else { // Defaults
            if (certificate.isCA) {
                ku = { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true };
            } else {
                ku = { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true };
            }
        }
        extensions.push(ku);

        // 4. Extended Key Usage (EKU)
        if (certificate.config?.extendedKeyUsage && certificate.config.extendedKeyUsage.length > 0) {
            const ekuExt = { name: 'extKeyUsage' };
            certificate.config.extendedKeyUsage.forEach(ekuName => {
                // Assuming ekuName is a standard string like 'serverAuth', 'clientAuth'
                // or an OID string that node-forge understands for extKeyUsage.
                if (ekuName === 'serverAuth' || ekuName === pki.oids.serverAuth) ekuExt.serverAuth = true;
                else if (ekuName === 'clientAuth' || ekuName === pki.oids.clientAuth) ekuExt.clientAuth = true;
                else if (ekuName === 'codeSigning' || ekuName === pki.oids.codeSigning) ekuExt.codeSigning = true;
                else if (ekuName === 'emailProtection' || ekuName === pki.oids.emailProtection) ekuExt.emailProtection = true;
                else if (ekuName === 'timeStamping' || ekuName === pki.oids.timeStamping) ekuExt.timeStamping = true;
                // Add more or handle raw OIDs if necessary
            });
            if (Object.keys(ekuExt).length > 1) extensions.push(ekuExt);
        } else if (!certificate.isCA && !forCsr) { // Default EKU for non-CA cert if not specified
            extensions.push({ name: 'extKeyUsage', serverAuth: true, clientAuth: true });
        }

        // 5. Subject Alternative Name (SAN)
        const altNames = [];
        const sansFromCert = certificate.sans; // Assumes Certificate.getSANs() returns { domains: [], ips: [] }

        if (sansFromCert.domains && sansFromCert.domains.length > 0) {
            sansFromCert.domains.forEach(domain => altNames.push({ type: 2, value: domain })); // dNSName
        }
        if (sansFromCert.ips && sansFromCert.ips.length > 0) {
            sansFromCert.ips.forEach(ip => altNames.push({ type: 7, value: ip })); // iPAddress
        }
        // Ensure CN is in SANs if not already present and CN exists
        const cn = certificate.commonName;
        if (cn && !altNames.some(an => an.type === 2 && an.value.toLowerCase() === cn.toLowerCase())) {
            altNames.unshift({ type: 2, value: cn });
        }

        if (altNames.length > 0) {
            extensions.push({ name: 'subjectAltName', altNames: altNames, critical: certificate.config?.sanCritical || false });
        }
        
        // Note: Authority Key Identifier (AKI) is typically added by the signing function in ForgeCryptoService
        // based on the CA's SKI, so it's not usually prepared here.

        logger.fine(`Prepared ${extensions.length} extensions for ${certificate.name}${forCsr ? ' (CSR)' : ''}`, extensions, FILENAME, certificate.name);
        return extensions;
    }


    /**
     * Create or renew a certificate
     * @param {string} fingerprintOrName - Certificate fingerprint or name
     * @param {Object} [options={}] - Options for creation or renewal
     * @param {string} [options.name] - Name for the new certificate (if creating)
     * @param {string} [options.subject] - Subject for the new certificate (if creating)
     * @param {string} [options.description] - Description for the new certificate (if creating)
     * @param {number} [options.days=365] - Validity period in days (default: 365)
     * @param {boolean} [options.createBackup=true] - Whether to create a backup before renewal
     * @param {boolean} [options.deploy=true] - Whether to execute deployment actions after renewal
     * @param {boolean} [options.recordActivity=true] - Whether to record activity for the operation
     * @param {Object} [options.user] - User object for activity logging
     * @param {string} [options.caPassphrase] - Passphrase for the CA certificate (if signing with CA)
     * @param {string} [options.passphrase] - Passphrase for the new certificate's key
     * @param {Object} [options.certificate] - Detailed certificate properties for creation (replaces individual options like subject, name)
     * @param {Object} [options.config] - Initial configuration for the new certificate (merged with options.certificate.config)
     * @return {Promise<Object>} Result object with success status and additional data
     * @throws {Error} If an error occurs during the operation
     */
    async createOrRenewCertificate(fingerprintOrName, options = {}) {
        logger.info(`CreateOrRenew request for: ${fingerprintOrName}`, options, FILENAME);
        
        let existingCertificate = this.getCertificate(fingerprintOrName);
        const isRenewal = !!existingCertificate;
        let certificate; // This will be the Certificate object we operate on
        let oldFingerprint = null;

        if (isRenewal) {
            certificate = existingCertificate;
            oldFingerprint = certificate.fingerprint;
            if (!certificate.fingerprint) {
                 logger.error(`Renewal requested for '${fingerprintOrName}', but existing certificate object lacks a fingerprint.`, null, FILENAME, certificate.name);
                 return { success: false, error: 'Certificate for renewal is invalid (missing fingerprint).' };
            }
            logger.debug(`Preparing for renewal of: ${certificate.name} (FP: ${certificate.fingerprint})`, null, FILENAME, certificate.name);
        } else {
            // For creation, use options.name or fingerprintOrName if it's not a fingerprint
            const nameForNewCert = options.name || (this.getCertificate(fingerprintOrName) ? 'New Certificate' : fingerprintOrName);
            certificate = new Certificate(nameForNewCert); // Initialize with name
            
            // Apply detailed certificate properties if provided in options.certificate
            if (options.certificate) {
                this._initializeNewCertificate(certificate, options.certificate); // Pass options.certificate directly
            } else { // Fallback to individual options for basic setup
                 this._initializeNewCertificate(certificate, { name: nameForNewCert, subject: options.subject, description: options.description });
            }
            // Apply initial config from options.config if provided
            if (options.config) certificate.updateConfig(options.config, { preserveConfig: false });

            certificate.generatePaths(this.certsDir); // Generate paths based on its name and certsDir
            logger.debug(`Preparing for creation of new certificate: ${certificate.name}`, { paths: certificate.paths }, FILENAME, certificate.name);
        }

        if (!certificate.name) {
            logger.error(`Certificate name is missing for operation on '${fingerprintOrName}'.`, null, FILENAME);
            return { success: false, error: 'Certificate name is required.' };
        }
        // Ensure paths are generated if not already
        if (!certificate.paths || Object.keys(certificate.paths).length === 0) {
            certificate.generatePaths(this.certsDir);
        }


        const currentArchiveBaseDir = this.archiveBaseDir;
        if (!currentArchiveBaseDir) {
            logger.error('Archive directory not configured. Cannot proceed with snapshot-dependent operation.', null, FILENAME, certificate.name);
            return { success: false, error: 'Archive directory not configured.' };
        }

        let operationResult = { success: false }; // To store result from cryptoService

        try {
            if (isRenewal) {
                logger.info(`Renewing existing certificate: ${certificate.name} (FP: ${oldFingerprint})`, null, FILENAME, certificate.name);

                if (options.createBackup !== false) {
                    logger.info(`Creating pre-renewal version snapshot for certificate ${certificate.name}`, null, FILENAME, certificate.name);
                    const snapshotResult = await certificate.createSnapshot('version', 'pre-renewal', '', currentArchiveBaseDir);
                    if (!snapshotResult) {
                        logger.warn(`Failed to create pre-renewal version snapshot for ${certificate.name}. Proceeding cautiously.`, null, FILENAME, certificate.name);
                        // Potentially return: return { success: false, error: 'Failed to create pre-renewal snapshot.' };
                    }
                }

                let issuerConfig = null;
                if (certificate.config?.signWithCA && certificate.config?.caFingerprint) {
                    const signingCA = this.getCertificate(certificate.config.caFingerprint);
                    if (!signingCA) {
                        logger.error(`Signing CA (FP: ${certificate.config.caFingerprint}) not found for renewing ${certificate.name}.`, null, FILENAME, certificate.name);
                        throw new Error('Signing CA certificate not found');
                    }
                    issuerConfig = {
                        issuerCertPath: signingCA.paths.crtPath || signingCA.paths.pemPath || signingCA.paths.cerPath, // Prefer .crt, then .pem
                        issuerKeyPath: signingCA.paths.keyPath,
                        issuerKeyPassphrase: options.caPassphrase || (this.passphraseManager && signingCA.needsPassphrase ? this.passphraseManager.getPassphrase(signingCA.fingerprint) : null)
                    };
                    if (!issuerConfig.issuerCertPath || !issuerConfig.issuerKeyPath) {
                        throw new Error(`Signing CA '${signingCA.name}' is missing critical path information (cert or key).`);
                    }
                } else { // Self-signed renewal
                     issuerConfig = {
                        issuerCertPath: certificate.paths.crtPath || certificate.paths.pemPath, // Use its own cert
                        issuerKeyPath: certificate.paths.keyPath,    // Use its own key
                        issuerKeyPassphrase: options.passphrase || (this.passphraseManager && certificate.needsPassphrase ? this.passphraseManager.getPassphrase(oldFingerprint) : null)
                    };
                }
                
                const renewalForgeConfig = {
                    existingCertPath: certificate.paths.crtPath || certificate.paths.pemPath,
                    newCertPath: certificate.paths.crtPath || certificate.paths.pemPath, // Overwrite existing
                    issuerCertPath: issuerConfig.issuerCertPath,
                    issuerKeyPath: issuerConfig.issuerKeyPath,
                    issuerKeyPassphrase: issuerConfig.issuerKeyPassphrase,
                    days: options.days || certificate.config?.validityDays || 365,
                    name: certificate.name
                };

                const forgeResult = await this.cryptoService.renewCertificate(renewalForgeConfig);
                // Assuming forgeResult contains { certPath, certificate (forge object) } on success
                if (forgeResult.certificate && forgeResult.certPath) {
                    operationResult.success = true;
                } else {
                    operationResult.error = forgeResult.error || "Renewal failed in crypto service.";
                }

            } else { // Creation
                logger.info(`Creating new certificate: ${certificate.name}`, null, FILENAME, certificate.name);
                
                const certPaths = {
                    crt: certificate.paths.crtPath || certificate.paths.pemPath || `${this.certsDir}/${certificate.getSanitizedName()}.pem`, // Ensure a CRT or PEM path
                    key: certificate.paths.keyPath || `${this.certsDir}/${certificate.getSanitizedName()}.key`,
                    csr: certificate.paths.csrPath || `${this.certsDir}/${certificate.getSanitizedName()}.csr`
                };
                 // Ensure directory for paths exists
                const certDir = path.dirname(certPaths.crt);
                if (!fs.existsSync(certDir)) {
                    fs.mkdirSync(certDir, { recursive: true });
                }


                const keyOptions = {
                    algorithm: certificate.keyType || 'RSA',
                    bits: certificate.keySize || 2048,
                    curve: certificate.keyCurve || 'secp256r1', // Default for EC
                };
                const certSubject = certificate.subject || `CN=${certificate.name}`;
                const validityDays = options.days || certificate.config?.validityDays || 365;
                const certPassphrase = options.passphrase; // For the new key

                if (certificate.config?.signWithCA && certificate.config?.caFingerprint) {
                    // Sign with CA
                    const signingCA = this.getCertificate(certificate.config.caFingerprint);
                    if (!signingCA) {
                        logger.error(`Signing CA (FP: ${certificate.config.caFingerprint}) not found for creating ${certificate.name}.`, null, FILENAME, certificate.name);
                        throw new Error('Signing CA certificate not found');
                    }
                    const caConfig = {
                        caCertPath: signingCA.paths.crtPath || signingCA.paths.pemPath,
                        caKeyPath: signingCA.paths.keyPath,
                        caKeyPassphrase: options.caPassphrase || (this.passphraseManager && signingCA.needsPassphrase ? this.passphraseManager.getPassphrase(signingCA.fingerprint) : null)
                    };
                     if (!caConfig.caCertPath || !caConfig.caKeyPath) {
                        throw new Error(`Signing CA '${signingCA.name}' is missing critical path information (cert or key).`);
                    }

                    // 1. Generate key for the new certificate
                    await this.cryptoService.generatePrivateKey({
                        keyPath: certPaths.key,
                        algorithm: keyOptions.algorithm,
                        bits: keyOptions.bits,
                        curve: keyOptions.curve,
                        encrypt: !!certPassphrase,
                        passphrase: certPassphrase,
                        certName: certificate.name
                    });

                    // 2. Create CSR
                    const csrExtensions = this._prepareForgeExtensions(certificate, true); // Extensions for CSR (e.g., SANs)
                    await this.cryptoService.createCSR({
                        csrPath: certPaths.csr,
                        keyPath: certPaths.key,
                        keyPassphrase: certPassphrase,
                        subject: certSubject,
                        extensions: csrExtensions,
                        name: certificate.name
                    });

                    // 3. Sign CSR with CA
                    const finalCertExtensions = this._prepareForgeExtensions(certificate, false); // Extensions for the final certificate
                    const forgeResult = await this.cryptoService.signCertificateWithCA({
                        certPath: certPaths.crt,
                        csr: certPaths.csr,
                        caCertPath: caConfig.caCertPath,
                        caKeyPath: caConfig.caKeyPath,
                        caKeyPassphrase: caConfig.caKeyPassphrase,
                        days: validityDays,
                        extensions: finalCertExtensions,
                        name: certificate.name
                    });
                    if (forgeResult.certificate && forgeResult.certPath) {
                        operationResult.success = true;
                    } else {
                        operationResult.error = forgeResult.error || "Signing with CA failed in crypto service.";
                    }

                } else { // Self-signed (or Root CA)
                    const extensions = this._prepareForgeExtensions(certificate, false);
                    const forgeResult = await this.cryptoService.createSelfSignedCertificate({
                        certPath: certPaths.crt,
                        keyPath: certPaths.key,
                        keyAlgorithm: keyOptions.algorithm,
                        keyBits: keyOptions.bits,
                        keyCurve: keyOptions.curve,
                        keyPassphrase: certPassphrase,
                        subject: certSubject,
                        days: validityDays,
                        extensions: extensions,
                        name: certificate.name
                    });
                     if (forgeResult.certificate && forgeResult.certPath) {
                        operationResult.success = true;
                    } else {
                        operationResult.error = forgeResult.error || "Self-signed creation failed in crypto service.";
                    }
                }
            }

            if (operationResult.success) {
                // CRITICAL: Refresh certificate object properties from the newly created/updated files
                await certificate.refreshPropertiesFromFiles(this.cryptoService);
                
                if (!certificate.fingerprint) {
                    logger.error(`Certificate ${certificate.name} lacks a fingerprint after refresh. Crypto operation might have failed to write files or refresh failed.`, null, FILENAME, certificate.name);
                    throw new Error("Certificate fingerprint missing after operation and refresh.");
                }

                if (isRenewal && oldFingerprint && certificate.fingerprint !== oldFingerprint) {
                    logger.info(`Fingerprint changed for ${certificate.name}: from ${oldFingerprint} to ${certificate.fingerprint}. Updating manager.`, null, FILENAME, certificate.name);
                    this.removeCertificate(oldFingerprint); // Remove old entry
                    this.addCertificate(certificate);     // Add new entry with new fingerprint
                } else if (!isRenewal) {
                    this.addCertificate(certificate); // Add the newly created certificate
                } else {
                    // Fingerprint same, ensure the object in map is updated if it was re-fetched
                    this.addCertificate(certificate);
                }
                
                // Passphrase storage
                if (options.passphrase && this.passphraseManager) {
                    this.passphraseManager.storePassphrase(certificate.fingerprint, options.passphrase);
                    certificate.needsPassphrase = true; // Mark it as needing a passphrase
                    certificate.updatePassphraseStatus(this.passphraseManager); // Update hasPassphrase status
                } else if (certificate.needsPassphrase === undefined && certificate.paths.keyPath) { // Check if key is encrypted if no passphrase was to be set
                    certificate.needsPassphrase = await this.cryptoService.isKeyEncrypted(certificate.paths.keyPath);
                    certificate.updatePassphraseStatus(this.passphraseManager);
                }


                await this.saveCertificateConfigs();
                this.notifyCertificateChanged(certificate.fingerprint, isRenewal ? 'update' : 'create');
                logger.info(`Certificate ${certificate.name} (FP: ${certificate.fingerprint}) ${isRenewal ? 'renewed' : 'created'} successfully.`, null, FILENAME, certificate.name);
                
                operationResult.certificate = certificate.toJSON(); // Return the JSON representation
                operationResult.fingerprint = certificate.fingerprint; // Ensure fingerprint is in result

                // Deployment Actions
                if (options.deploy !== false && certificate.config?.deployActions?.length > 0) {
                    logger.info(`Executing ${certificate.config.deployActions.length} deployment actions for ${certificate.name}`, null, FILENAME, certificate.name);
                    try {
                        const deployService = require('../services/deploy-service'); // Consider making deployService a member if used often
                        const deployResult = await deployService.executeDeployActions(
                            certificate.config.deployActions,
                            { certificate: certificate, paths: certificate.paths, user: options.user?.username || 'system' }
                        );
                        logger.info(`Deployment actions for ${certificate.name} completed with status: ${deployResult.success ? 'success' : 'failure'}`, null, FILENAME, certificate.name);
                        operationResult.deployResult = deployResult;
                    } catch (deployError) {
                        logger.error(`Error executing deployment actions for ${certificate.name}: ${deployError.message}`, deployError, FILENAME, certificate.name);
                        operationResult.deployResult = { success: false, error: deployError.message };
                    }
                }

                // Activity Recording
                if (options.recordActivity !== false && this.activityService && options.user) {
                    try {
                        await this.activityService.recordCertificateActivity(isRenewal ? 'renew' : 'create', certificate, options.user);
                    } catch (activityError) {
                        logger.warn(`Failed to record certificate activity for ${certificate.name}: ${activityError.message}`, null, FILENAME, certificate.name);
                    }
                }

            } else {
                logger.error(`Failed to ${isRenewal ? 'renew' : 'create'} certificate ${certificate.name}: ${operationResult.error}`, null, FILENAME, certificate.name);
            }

            return operationResult;

        } catch (error) {
            logger.error(`Critical error during ${isRenewal ? 'renewal' : 'creation'} of certificate ${certificate.name}: ${error.message}`, error, FILENAME, certificate.name);
            return { success: false, error: error.message || 'Unknown critical error' };
        }
    }
    
    /**
     * Create a manual backup of a certificate
     * @param {string} fingerprint - Certificate fingerprint
     * @param {string} [description=''] - Optional description for the backup
     * @return {Promise<Object>} Result of the backup operation
     * @description Creates a manual backup of the specified certificate by creating a snapshot entry.
     */
    async createManualBackup(fingerprint, description = '') {
        logger.info(`Attempting to create manual backup for certificate with fingerprint: ${fingerprint}`, { description }, FILENAME);
        const certificate = this.getCertificate(fingerprint);

        if (!certificate) {
            logger.warn(`Certificate with fingerprint '${fingerprint}' not found. Cannot create manual backup.`, null, FILENAME);
            return { success: false, error: 'Certificate not found' };
        }

        const currentArchiveBaseDir = this.archiveBaseDir;
        if (!currentArchiveBaseDir) {
            logger.error('Archive directory not configured. Cannot create manual backup.', null, FILENAME, certificate.name);
            return { success: false, error: 'Archive directory not configured.' };
        }

        try {
            const snapshotEntry = await certificate.createSnapshot('backup', 'manual', description, currentArchiveBaseDir);

            if (snapshotEntry) {
                await this.saveCertificateConfigs();
                logger.info(`Successfully created manual backup (ID: ${snapshotEntry.id}) for certificate '${certificate.name}'`, null, FILENAME, certificate.name);
                return { success: true, snapshot: snapshotEntry };
            } else {
                logger.error(`Failed to create manual backup for certificate '${certificate.name}' (snapshot creation returned null).`, null, FILENAME, certificate.name);
                return { success: false, error: 'Failed to create snapshot entry' };
            }
        } catch (error) {
            logger.error(`Error creating manual backup for certificate '${certificate.name}':`, error, FILENAME, certificate.name);
            return { success: false, error: error.message || 'Unknown error creating manual backup' };
        }
    }
    
    /**
     * Get snapshots for a certificate.
     * @param {string} fingerprint - Certificate fingerprint.
     * @param {string} [snapshotType='all'] - Type of snapshots to retrieve ('backup', 'version', or 'all').
     * @return {Promise<Object>} Result object with success status and an array of snapshots.
     * @description Retrieves snapshots of the specified type(s) for the certificate.
     */
    async getCertificateSnapshots(fingerprint, snapshotType = 'all') {
        logger.info(`Attempting to retrieve ${snapshotType} snapshots for certificate with fingerprint: ${fingerprint}`, null, FILENAME);
        const certificate = this.getCertificate(fingerprint);

        if (!certificate) {
            logger.warn(`Certificate with fingerprint '${fingerprint}' not found. Cannot retrieve snapshots.`, null, FILENAME);
            return { success: false, error: 'Certificate not found', snapshots: [] };
        }

        const certName = certificate.name;

        try {
            let snapshots = [];
            // Assuming Certificate.js has a method getSnapshots(type)
            // that returns an array of snapshot objects (or their toJSON() representations)
            // And if getSnapshots() is called without a type, it returns all snapshots.
            // Or, we fetch specific types and combine if 'all' is requested.

            if (snapshotType === 'backup') {
                snapshots = certificate.getSnapshots('backup');
            } else if (snapshotType === 'version') {
                snapshots = certificate.getSnapshots('version');
            } else if (snapshotType === 'all') {
                const backupSnapshots = certificate.getSnapshots('backup');
                const versionSnapshots = certificate.getSnapshots('version');
                snapshots = [...backupSnapshots, ...versionSnapshots];
                // Optionally sort combined snapshots by date if needed
                snapshots.sort((a, b) => new Date(b.date) - new Date(a.date));
            } else {
                logger.warn(`Invalid snapshotType '${snapshotType}' requested for certificate '${certName}'. Defaulting to 'all'.`, null, FILENAME, certName);
                const backupSnapshots = certificate.getSnapshots('backup');
                const versionSnapshots = certificate.getSnapshots('version');
                snapshots = [...backupSnapshots, ...versionSnapshots];
                snapshots.sort((a, b) => new Date(b.date) - new Date(a.date));
            }
            
            logger.info(`Successfully retrieved ${snapshots.length} ${snapshotType} snapshots for certificate '${certName}'`, null, FILENAME, certName);
            return { success: true, snapshots: snapshots };
        } catch (error) {
            logger.error(`Error retrieving ${snapshotType} snapshots for certificate '${certName}':`, error, FILENAME, certName);
            return { success: false, error: error.message || `Unknown error retrieving ${snapshotType} snapshots`, snapshots: [] };
        }
    }

    /**
     * Restore a certificate from a snapshot
     * @param {string} currentFingerprint - Current fingerprint of the certificate to restore
     * @param {string} snapshotId - ID of the snapshot to restore from
     * @return {Promise<Object>} Result of the restore operation
     * @description Restores a certificate from a specified snapshot ID, creating a pre-restore version snapshot first.
     */
    async restoreCertificateFromSnapshot(currentFingerprint, snapshotId) {
        logger.info(`Attempting to restore certificate (current fingerprint: ${currentFingerprint}) from snapshot ID: ${snapshotId}`, null, FILENAME);
        const certificate = this.getCertificate(currentFingerprint);

        if (!certificate) {
            logger.warn(`Certificate with current fingerprint '${currentFingerprint}' not found. Cannot restore.`, null, FILENAME);
            return { success: false, error: 'Certificate not found' };
        }
        const certName = certificate.name; // For logging

        const currentArchiveBaseDir = this.archiveBaseDir;
        if (!currentArchiveBaseDir) {
            logger.error('Archive directory not configured. Cannot proceed with restore.', null, FILENAME, certName);
            return { success: false, error: 'Archive directory not configured.' };
        }

        try {
            logger.info(`Creating pre-restore version snapshot for certificate '${certName}' before restoring from snapshot '${snapshotId}'`, null, FILENAME, certName);
            const preRestoreSnapshot = await certificate.createSnapshot('version', 'pre-restore', `Auto-version before restoring from snapshot ${snapshotId}`, currentArchiveBaseDir);
            if (!preRestoreSnapshot) {
                logger.warn(`Failed to create pre-restore snapshot for '${certName}'. Proceeding with restore cautiously. Consider this a potential issue.`, null, FILENAME, certName);
                // Decide if this should be fatal: return { success: false, error: 'Failed to create pre-restore snapshot.' };
            }

            const restoreFilesSuccess = await certificate.restoreFromSnapshot(snapshotId);
            if (!restoreFilesSuccess) {
                logger.error(`File restoration from snapshot '${snapshotId}' failed for certificate '${certName}'. Aborting operation.`, null, FILENAME, certName);
                return { success: false, error: 'Failed to restore files from snapshot' };
            }

            // CRITICAL STEP: Refresh certificate properties from its newly restored files
            logger.info(`Refreshing properties for certificate '${certName}' after restoring files...`, null, FILENAME, certName);
            await certificate.refreshPropertiesFromFiles(this.cryptoService); // This MUST be implemented in Certificate.js
            const newFingerprint = certificate.fingerprint;

            logger.info(`Certificate '${certName}' properties refreshed. Old fingerprint: ${currentFingerprint}, New fingerprint: ${newFingerprint}`, null, FILENAME, certName);

            if (!newFingerprint) {
                 logger.error(`Certificate '${certName}' has no fingerprint after refresh from restore. This indicates a problem with refreshPropertiesFromFiles or the restored cert.`, null, FILENAME, certName);
                 return { success: false, error: 'Certificate has no fingerprint after restore and refresh.' };
            }

            if (newFingerprint !== currentFingerprint) {
                logger.info(`Fingerprint changed for '${certName}' after restore. Updating manager list. From ${currentFingerprint} to ${newFingerprint}`, null, FILENAME, certName);
                this.removeCertificate(currentFingerprint);
                this.addCertificate(certificate); // Adds with the new fingerprint
            }
            // If fingerprint is the same, the existing entry in this.certificates is already the correct object.

            await this.saveCertificateConfigs();
            logger.info(`Successfully restored certificate '${certName}' from snapshot '${snapshotId}'. Current fingerprint: ${newFingerprint}`, null, FILENAME, certName);
            return { success: true, certificate: certificate.toJSON(), newFingerprint: newFingerprint };

        } catch (error) {
            logger.error(`Error restoring certificate (current fingerprint: ${currentFingerprint}) from snapshot '${snapshotId}':`, error, FILENAME, certName || currentFingerprint);
            return { success: false, error: error.message || 'Unknown error during snapshot restore' };
        }
    }

    /**
     * Delete a certificate snapshot
     * @param {string} fingerprint - Certificate fingerprint
     * @param {string} snapshotId - ID of the snapshot to delete
     * @return {Promise<Object>} Result of the delete operation
     * @description Deletes a specified snapshot from a certificate, ensuring the certificate exists and the snapshot ID is valid.
     * @throws {Error} If the certificate does not exist or if there is an error during deletion.
     */
    async deleteCertificateSnapshot(fingerprint, snapshotId) {
        logger.info(`Attempting to delete snapshot ID '${snapshotId}' for certificate with fingerprint: ${fingerprint}`, null, FILENAME);
        const certificate = this.getCertificate(fingerprint);

        if (!certificate) {
            logger.warn(`Certificate with fingerprint '${fingerprint}' not found. Cannot delete snapshot.`, null, FILENAME);
            return { success: false, error: 'Certificate not found' };
        }
        const certName = certificate.name;

        try {
            const deleteSuccess = await certificate.deleteSnapshot(snapshotId);

            if (deleteSuccess) {
                await this.saveCertificateConfigs();
                logger.info(`Successfully deleted snapshot ID '${snapshotId}' for certificate '${certName}'`, null, FILENAME, certName);
                return { success: true };
            } else {
                logger.warn(`Failed to delete snapshot '${snapshotId}' from certificate '${certName}' (deleteSnapshot returned false).`, null, FILENAME, certName);
                return { success: false, error: `Failed to delete snapshot '${snapshotId}'` };
            }
        } catch (error) {
            logger.error(`Error deleting snapshot ID '${snapshotId}' for certificate '${certName}':`, error, FILENAME, certName);
            return { success: false, error: error.message || 'Unknown error deleting snapshot' };
        }
    }

    /**
     * Delete a certificate and its associated files and snapshots
     * @param {string} fingerprint - Certificate fingerprint
     * @param {Object} [options={}] - Options for deletion
     * @param {boolean} [options.deleteFiles=true] - Whether to delete live files
     * @param {boolean} [options.deleteSnapshots=true] - Whether to delete associated snapshots
     * @return {Promise<Object>} Result of the delete operation
     * @description Deletes a certificate by its fingerprint, removing its files and snapshots if specified.
     * @throws {Error} If the certificate does not exist or if there is an error during deletion.
     */
    async deleteCertificate(fingerprint, options = {}) {
        const { deleteFiles = true, deleteSnapshots = true } = options;
        logger.info(`Attempting to delete certificate with fingerprint: ${fingerprint}`, { options }, FILENAME);

        const certificate = this.getCertificate(fingerprint);
        if (!certificate) {
            logger.warn(`Certificate with fingerprint '${fingerprint}' not found for deletion.`, null, FILENAME);
            return { success: false, error: 'Certificate not found' };
        }

        const certName = certificate.name;

        try {
            if (deleteFiles) {
                logger.debug(`Deleting live files for certificate '${certName}'`, null, FILENAME, certName);
                for (const key in certificate.paths) {
                    const filePath = certificate.paths[key];
                    if (filePath && fs.existsSync(filePath)) {
                        try {
                            await fs.promises.unlink(filePath);
                            logger.fine(`Deleted certificate file: ${filePath}`, null, FILENAME, certName);
                        } catch (fileError) {
                            logger.warn(`Failed to delete certificate file ${filePath} for ${certName}: ${fileError.message}`, null, FILENAME, certName);
                        }
                    }
                }
            }

            if (deleteSnapshots) {
                const currentArchiveBaseDir = this.archiveBaseDir;
                if (currentArchiveBaseDir && certName) {
                    const sanitizedCertName = certName.replace(/[^\w.-]/g, '_');
                    const certArchiveRoot = path.join(currentArchiveBaseDir, sanitizedCertName);

                    if (fs.existsSync(certArchiveRoot)) {
                        logger.info(`Deleting entire snapshot archive directory for certificate '${certName}': ${certArchiveRoot}`, null, FILENAME, certName);
                        try {
                            await fs.promises.rm(certArchiveRoot, { recursive: true, force: true });
                            logger.debug(`Successfully deleted snapshot archive root: ${certArchiveRoot}`, null, FILENAME, certName);
                        } catch (archiveError) {
                            logger.error(`Failed to delete snapshot archive root ${certArchiveRoot} for ${certName}: ${archiveError.message}`, null, FILENAME, certName);
                        }
                    } else {
                        logger.fine(`Snapshot archive root for '${certName}' ('${certArchiveRoot}') not found. Nothing to delete.`, null, FILENAME, certName);
                    }
                } else {
                    logger.warn(`Cannot delete snapshot archives for '${certName}': archive directory or certificate name is missing.`, null, FILENAME, certName);
                }
            }

            this.removeCertificate(fingerprint);
            await this.saveCertificateConfigs();

            logger.info(`Successfully deleted certificate '${certName}' (fingerprint: ${fingerprint}) and associated data.`, null, FILENAME, certName);
            return { success: true };

        } catch (error) {
            logger.error(`Error deleting certificate '${certName}' (fingerprint: ${fingerprint}):`, error, FILENAME, certName);
            return { success: false, error: error.message || 'Unknown error deleting certificate' };
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
     * Update a certificate's configuration and sync in-memory properties
     * @param {string} fingerprint - Certificate fingerprint
     * @param {Object} config - Updated configuration
     * @returns {Promise<boolean>} Success status
     */
    async updateCertificateConfig(fingerprint, config) {
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

            // Use the Certificate's updateConfig method to handle updates with the proper structure
            cert.updateConfig({
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

            // The certificate already has updated data internally via updateConfig
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
                await this.saveCertificateConfigs();

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
            await this.saveCertificateConfigs();

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
            if (certificate.selfSigned || certificate.isRootCA) {
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
                    logger.warn(`Could not find signing CA for ${cert.name}`, 
                        {
                            authorityKeyIdentifier: cert._authorityKeyIdentifier,
                            config: {
                                signWithCA: cert._config.signWithCA,
                                caFingerprint: cert._config.caFingerprint,
                                caName: cert._config.caName
                            } 
                        }, FILENAME);

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
                    const cert = await this.loadCertificateFromJSON(fingerprint);

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
    * @param {Object} [options={}] - Renewal options
    * @param {Object} [user=null] - User performing the action
    * @returns {Promise<Object>} Result of renewal operation
    */
    async applyIdleSubjectsAndRenew(fingerprint, options = {}, user = null) {
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

            logger.info(`Applied idle subjects for certificate ${cert.name}, proceeding with renewal`, null, FILENAME);

            // Now renew the certificate with the new subjects using createOrRenewCertificate
            const renewResult = await this.createOrRenewCertificate(fingerprint, {
                // Default options for renewal
                days: options.days || 365,
                passphrase: options.passphrase,
                caPassphrase: options.caPassphrase,
                deploy: options.deploy !== false,
                preserveFormats: options.preserveFormats !== false,
                createBackup: options.createBackup !== false,
                recordActivity: options.recordActivity !== false,
                user: user,
                includeIdle: false // We've just applied the idle subjects, so no need to include them again
            });

            return {
                success: renewResult.success,
                message: renewResult.success
                    ? 'Applied idle subjects and renewed certificate'
                    : `Applied idle subjects but renewal failed: ${renewResult.error || 'Unknown error'}`,
                renewResult
            };
        } catch (error) {
            logger.error(`Error applying idle subjects for certificate ${fingerprint}:`, error, FILENAME);
            throw error;
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

                        // Update certificate with new data using updateConfig method
                        cert.updateConfig(certData, { preserveConfig: false });
                        logger.debug(`Updated existing certificate: ${cert.name} (${fingerprint})`, null, FILENAME);
                    } else {
                        // Create new certificate object with Certificate constructor
                        const Certificate = require('./Certificate');
                        cert = new Certificate({
                            name: certData.name || path.basename(certFile, path.extname(certFile)),
                            fingerprint: certData.fingerprint
                        });

                        // Initialize with all data
                        cert.updateConfig(certData, { preserveConfig: false });
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

            // Update passphrase status for all certificates
            await this.updateHasPassphrase();

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
        let certs = this.getAllCertificatesWithMetadata();
        if(options.caOnly) {
            certs = certs.filter(cert => cert.isCA);
        }
        return certs;
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
            signatureAlgorithm: baseData.signatureAlgorithm || '',
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
            const previousVersions = certificate.getSnapshots('version');
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

        if (logger.isLevelEnabled('fine', FILENAME)) {
            logger.fine(`API response for certificate ${baseData.name}`, response, FILENAME);
        } else {
            logger.debug(`Generated API response for certificate ${baseData.name}`, null, FILENAME);
        }

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