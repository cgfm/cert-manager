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
        this.certsDir = certsDir;
        this.configPath = configPath;
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

        this.loadCertificates();

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
     * Load certificates from the file system and configuration
     * @param {boolean} forceRefresh - Force refresh even if cache is valid
     * @param {string} [specificFilePath] - Only refresh certificate from this file path
     * @returns {Promise<Map<string, Certificate>>} Loaded certificates
     */
    async loadCertificates(forceRefresh = false, specificFilePath = null) {
        logger.debug(`Loading certificates (forceRefresh=${forceRefresh}, specificFile=${specificFilePath || 'none'})`, null, FILENAME);

        try {
            // Check if we need to refresh the cache
            if (!forceRefresh && this.isCacheValid()) {
                logger.finest('Using cached certificates data', null, FILENAME);
                logger.debug(`Certificate cache contains ${this.certificates.size} certificates`, null, FILENAME);

                // If there are pending changes, refresh just those certificates
                // But do it in a non-blocking way to improve API response times
                if (this.pendingChanges.size > 0) {
                    logger.fine(`Scheduling background refresh for ${this.pendingChanges.size} certificates with pending changes`, null, FILENAME);
                    setTimeout(async () => {
                        try {
                            logger.fine(`Starting background refresh of ${this.pendingChanges.size} certificates with pending changes`, null, FILENAME);
                            const refreshed = await this.refreshCachedCertificates([...this.pendingChanges]);
                            logger.debug(`Background certificate refresh completed, updated ${refreshed} certificates`, null, FILENAME);
                        } catch (error) {
                            logger.error('Error in background certificate refresh:', error, FILENAME);
                        }
                    }, 0);
                } else {
                    logger.finest('No pending certificate changes to refresh', null, FILENAME);
                }

                // If a specific file path was provided, process that in a non-blocking way too
                if (specificFilePath) {
                    if (fs.existsSync(specificFilePath)) {
                        logger.fine(`Scheduling background processing of specific certificate file: ${specificFilePath}`, null, FILENAME);
                        setTimeout(async () => {
                            try {
                                logger.fine(`Processing specific certificate file: ${specificFilePath}`, null, FILENAME);
                                const result = await this.processSingleCertificateFile(specificFilePath);
                                logger.debug(`Processed certificate file ${specificFilePath}: ${result ? 'success' : 'failed'}`, null, FILENAME);
                            } catch (error) {
                                logger.error(`Error processing certificate file ${specificFilePath}:`, error, FILENAME);
                            }
                        }, 0);
                    } else {
                        logger.warn(`Specified certificate file does not exist: ${specificFilePath}`, null, FILENAME);
                    }
                }

                return this.certificates;
            }

            const now = Date.now();
            logger.info(`Performing ${forceRefresh ? 'forced' : 'required'} refresh of certificates cache`, null, FILENAME);
            logger.debug('Loading certificates from filesystem and config', null, FILENAME);

            // Only do full reload if force refresh or cache is empty
            if (forceRefresh || this.certificates.size === 0) {
                try {
                    // Only clear certificates on full refresh
                    if (!specificFilePath) {
                        logger.fine('Clearing existing certificates cache for full refresh', null, FILENAME);
                        this.certificates.clear();
                    } else {
                        logger.fine('Keeping existing certificates cache for specific file refresh', null, FILENAME);
                    }

                    // Step 1: If we're processing a specific file, just do that one
                    if (specificFilePath && fs.existsSync(specificFilePath)) {
                        logger.info(`Processing specific certificate file: ${specificFilePath}`, null, FILENAME);
                        await this.processSingleCertificateFile(specificFilePath);
                    } else {
                        // Find and process all certificate files
                        logger.debug('Finding all certificate files...', null, FILENAME);
                        const certFiles = await this.findCertificateFiles();
                        logger.info(`Found ${certFiles.length} certificate files`, null, FILENAME);

                        if (certFiles.length === 0) {
                            logger.warn('No certificate files found in configured directory', null, FILENAME);
                        }

                        // Limit concurrent processing to avoid overloading the system
                        const concurrencyLimit = 5;
                        logger.fine(`Processing certificate files with concurrency limit of ${concurrencyLimit}`, null, FILENAME);
                        const chunks = [];

                        // Split files into chunks for processing
                        for (let i = 0; i < certFiles.length; i += concurrencyLimit) {
                            chunks.push(certFiles.slice(i, i + concurrencyLimit));
                        }

                        logger.finest(`Split certificate files into ${chunks.length} processing chunks`, null, FILENAME);

                        // Process each chunk of files
                        let processedCount = 0;
                        let successCount = 0;
                        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                            const chunk = chunks[chunkIndex];
                            logger.finest(`Processing chunk ${chunkIndex + 1}/${chunks.length} with ${chunk.length} files`, null, FILENAME);

                            const results = await Promise.all(chunk.map(file => this.processSingleCertificateFile(file)));

                            // Count successes
                            const chunkSuccesses = results.filter(result => result).length;
                            processedCount += chunk.length;
                            successCount += chunkSuccesses;

                            logger.fine(`Processed chunk ${chunkIndex + 1}/${chunks.length}, success: ${chunkSuccesses}/${chunk.length} files`, null, FILENAME);
                            logger.finest(`Total progress: ${processedCount}/${certFiles.length} files (${successCount} successful)`, null, FILENAME);
                        }

                        logger.info(`Certificate processing complete: ${successCount}/${certFiles.length} successfully loaded`, null, FILENAME);
                    }

                    // Step 3: Load additional data from configuration
                    logger.debug('Merging certificate configurations from config file', null, FILENAME);
                    const configExists = await this.mergeCertificateConfigs();
                    logger.fine(`Configuration ${configExists ? 'loaded' : 'not found'}, merged with loaded certificates`, null, FILENAME);

                    // Create config file if it doesn't exist and we have certificates
                    if (!configExists && this.certificates.size > 0) {
                        logger.info('Creating new certificate configuration file', null, FILENAME);
                        await this.saveCertificateConfigs();
                    }

                    // Update cache metadata
                    logger.finest(`Updating cache metadata, setting lastRefreshTime to ${now}`, null, FILENAME);
                    this.lastRefreshTime = now;
                    this.pendingChanges.clear();

                    // Update config file last modified time
                    try {
                        const stats = fs.statSync(this.configPath);
                        this.configLastModified = stats.mtimeMs;
                        logger.finest(`Updated config file last modified time: ${new Date(this.configLastModified).toISOString()}`, null, FILENAME);
                    } catch (error) {
                        logger.fine(`Couldn't get stats for config file:`, error, FILENAME);
                    }

                    logger.info(`Loaded ${this.certificates.size} certificates`, null, FILENAME);

                    // After loading all certificates, scan for CA relationships
                    logger.debug(`Scanning certificates for CA relationships...`, null, FILENAME);
                    let caRelationshipsUpdated = 0;

                    // Go through non-CA certificates to identify their signing CAs
                    for (const cert of this.certificates.values()) {
                        // Skip CA certificates and self-signed certificates
                        if (cert.isCA() || (cert.subject === cert.issuer)) {
                            logger.finest(`Skipping CA relationship check for CA or self-signed cert: ${cert.name}`, null, FILENAME);
                            continue;
                        }

                        // Check if certificate is missing caFingerprint but has signWithCA=true
                        if (cert.signWithCA === true && !cert.caFingerprint) {
                            logger.fine(`Certificate ${cert.name} is marked for CA signing but missing CA fingerprint, attempting to update`, null, FILENAME);
                            const wasUpdated = await this.updateCertificateCAFingerprint(cert);
                            if (wasUpdated) {
                                caRelationshipsUpdated++;
                                logger.debug(`Updated CA fingerprint for certificate: ${cert.name}`, null, FILENAME);
                            } else {
                                logger.fine(`Could not determine CA fingerprint for certificate: ${cert.name}`, null, FILENAME);
                            }
                        } else if (cert.signWithCA === true) {
                            logger.finest(`Certificate ${cert.name} already has CA fingerprint: ${cert.caFingerprint}`, null, FILENAME);
                        }
                    }

                    if (caRelationshipsUpdated > 0) {
                        logger.info(`Updated CA fingerprints for ${caRelationshipsUpdated} certificates`, null, FILENAME);
                    } else {
                        logger.debug('No CA relationships needed updating', null, FILENAME);
                    }

                    const loadDuration = Date.now() - now;
                    logger.debug(`Certificate loading completed in ${loadDuration}ms`, null, FILENAME);
                    return this.certificates;
                } catch (error) {
                    logger.error('Error loading certificates:', error, FILENAME);
                    throw error;
                }
            } else {
                logger.debug('Performing partial refresh of certificates cache', null, FILENAME);

                // For non-forced refreshes with a populated cache, just process pending changes
                if (this.pendingChanges.size > 0) {
                    logger.info(`Refreshing ${this.pendingChanges.size} certificates with pending changes`, null, FILENAME);
                    const refreshed = await this.refreshCachedCertificates([...this.pendingChanges]);
                    logger.debug(`Refreshed ${refreshed}/${this.pendingChanges.size} certificates with pending changes`, null, FILENAME);
                } else {
                    logger.fine('No pending changes to refresh', null, FILENAME);
                }

                // And handle any specific file path
                if (specificFilePath && fs.existsSync(specificFilePath)) {
                    logger.info(`Processing specific certificate file: ${specificFilePath}`, null, FILENAME);
                    const result = await this.processSingleCertificateFile(specificFilePath);
                    logger.debug(`Processed specific certificate file: ${result ? 'success' : 'failed'}`, null, FILENAME);
                } else if (specificFilePath) {
                    logger.warn(`Specified certificate file does not exist: ${specificFilePath}`, null, FILENAME);
                }

                logger.debug(`Partial refresh complete, cache contains ${this.certificates.size} certificates`, null, FILENAME);
                return this.certificates;
            }
        } catch (error) {
            logger.error('Unhandled error in loadCertificates method:', error, FILENAME);
            logger.error(`Stack trace: ${error.stack}`, null, FILENAME);
            throw error;
        }
    }

    /**
     * Process a certificate file, extract its information and add it to the manager
     * @param {string} certPath - Path to certificate file
     * @returns {Promise<boolean>} True if processing was successful 
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
                certificate.subject = certInfo.subject;
                certificate.issuer = certInfo.issuer;
                certificate.validFrom = certInfo.validFrom;
                certificate.validTo = certInfo.validTo;
                certificate.keyType = certInfo.keyType;
                certificate.keySize = certInfo.keySize;
                certificate.sigAlg = certInfo.sigAlg;

                // Add paths
                certificate.addPath('crt', certPath);
            } else {
                // Create new certificate
                certificate = new Certificate({
                    name: certInfo.commonName || path.basename(certPath, '.crt'),
                    fingerprint: certInfo.fingerprint,
                    subject: certInfo.subject,
                    issuer: certInfo.issuer,
                    validFrom: certInfo.validFrom,
                    validTo: certInfo.validTo,
                    keyType: certInfo.keyType,
                    keySize: certInfo.keySize,
                    sigAlg: certInfo.sigAlg,
                    domains: certInfo.domains || [],
                    ips: certInfo.ips || []
                });

                // Add paths
                certificate.addPath('crt', certPath);

                // Add other paths that might exist
                this.addRelatedPaths(certificate, certPath);

                // Add to certificates map
                this.certificates.set(certificate.fingerprint, certificate);
                logger.fine(`Added certificate ${certificate.name} (${certificate.fingerprint})`, null, FILENAME);
            }

            // Check if certificate is a CA
            if (certInfo.isCA) {
                certificate.certType = certInfo.isRootCA ? 'rootCA' : 'intermediateCA';
                logger.fine(`Certificate ${certificate.name} identified as ${certificate.certType}`, null, FILENAME);
            }

            // Check passphrase requirement if openssl is available - this is key to our optimization
            if (this.openssl) {
                try {
                    const needsPassphrase = await certificate.checkNeedsPassphrase(this.openssl);
                    logger.fine(`Passphrase requirement checked for ${certificate.name}: ${needsPassphrase ? 'Needs passphrase' : 'No passphrase required'}`, null, FILENAME);
                } catch (passphraseError) {
                    logger.warn(`Error checking passphrase requirement for ${certificate.name}: ${passphraseError.message}`, null, FILENAME);
                }
            } else {
                logger.fine(`OpenSSL not available, skipping passphrase check for ${certificate.name}`, null, FILENAME);
            }

            return true;
        } catch (error) {
            logger.error(`Error processing certificate file ${certPath}:`, error, FILENAME);
            return false;
        }
    }

    /**
     * Add related certificate files to the certificate paths
     * @param {Certificate} certificate - Certificate to add paths to
     * @param {string} certPath - Path to the certificate file
     * @private
     */
    addRelatedPaths(certificate, certPath) {
        logger.finest(`Finding related paths for certificate: ${certificate.name}`, null, FILENAME);

        try {
            if (!certPath || !fs.existsSync(certPath)) {
                logger.warn(`Cannot find related paths: invalid certificate path ${certPath}`, null, FILENAME);
                return;
            }

            // Extract base name and directory
            const baseName = path.basename(certPath, path.extname(certPath));
            const certDir = path.dirname(certPath);

            logger.finest(`Looking for related files in ${certDir} with base name ${baseName}`, null, FILENAME);

            // Define possible related files with their types
            const relatedFiles = [
                { suffix: '.key', pathKey: 'keyPath' },
                { suffix: '.pem', pathKey: 'pemPath' },
                { suffix: '.p12', pathKey: 'p12Path' },
                { suffix: '.pfx', pathKey: 'pfxPath' },
                { suffix: '.csr', pathKey: 'csrPath' },
                { suffix: '.fullchain', pathKey: 'fullchainPath' },
                { suffix: '.chain', pathKey: 'chainPath' },
                { suffix: '.ext', pathKey: 'extPath' }
            ];

            // Check for each possible file
            for (const { suffix, pathKey } of relatedFiles) {
                const possiblePath = path.join(certDir, `${baseName}${suffix}`);

                if (fs.existsSync(possiblePath)) {
                    logger.finest(`Found related file: ${possiblePath}`, null, FILENAME);
                    certificate.addPath(pathKey.replace(/Path$/, ''), possiblePath);
                } else {
                    // Try alternate names for common patterns (e.g., privkey.pem)
                    if (suffix === '.key') {
                        // Common alternative key filenames
                        const alternateKeyFiles = [
                            'privkey.pem',
                            'private.key',
                            `${certificate.name}.key`
                        ];

                        for (const keyFile of alternateKeyFiles) {
                            const altPath = path.join(certDir, keyFile);
                            if (fs.existsSync(altPath)) {
                                logger.finest(`Found alternate key file: ${altPath}`, null, FILENAME);
                                certificate.addPath('key', altPath);
                                break;
                            }
                        }
                    }
                }
            }

            logger.debug(`Found ${Object.keys(certificate.paths).length - 1} related files for ${certificate.name}`, null, FILENAME);
        } catch (error) {
            logger.error(`Error finding related paths for certificate ${certificate.name || 'unknown'}:`, error, FILENAME);
        }
    }

    /**
     * Find certificate files in the certificates directory
     * @returns {Promise<string[]>} Array of certificate file paths
     */
    async findCertificateFiles() {
        try {
            const certFiles = [];

            // Helper function to recursively scan directories
            const scanDirectory = (dir) => {
                try {
                    const items = fs.readdirSync(dir);

                    for (const item of items) {
                        const fullPath = path.join(dir, item);

                        // Skip special directories
                        if (item === 'backups' || item === 'archive') {
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
            logger.finest(`- Domains: ${JSON.stringify(certInfo.domains || [])}`, null, FILENAME);
            logger.finest(`- IPs: ${JSON.stringify(certInfo.ips || [])}`, null, FILENAME);

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
                extPath: path.join(dirName, `${baseName}.ext`)
            };

            // Add each path only if the file exists
            Object.entries(possiblePaths).forEach(([pathType, pathValue]) => {
                if (fs.existsSync(pathValue)) {
                    paths[pathType] = pathValue;
                }
            });

            logger.fine(`Generated paths for certificate: ${JSON.stringify(paths)}`, null, FILENAME);

            // Ensure we have domains array
            const domains = Array.isArray(certInfo.domains) ? certInfo.domains : [];
            // Ensure we have IPs array
            const ips = Array.isArray(certInfo.ips) ? certInfo.ips : [];

            // Create result object with all necessary fields
            const result = {
                name: certInfo.name,
                fingerprint: certInfo.fingerprint,
                subject: certInfo.subject,
                issuer: certInfo.issuer,
                validFrom: certInfo.validFrom,
                validTo: certInfo.validTo,
                certType: certInfo.certType,
                paths,
                signWithCA: certInfo.subject !== certInfo.issuer && certInfo.certType !== 'rootCA',
                domains: domains,
                ips: ips
            };

            logger.debug(`Extracted certificate data: ${JSON.stringify({
                name: result.name,
                fingerprint: result.fingerprint,
                subject: result.subject,
                issuer: result.issuer,
                domains: result.domains.length,
                paths: Object.keys(result.paths).length,
                certType: result.certType
            })}`, null, FILENAME);

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
     * Merge certificate configuration data from config file with certificates
     * @returns {Promise<boolean>} Whether the config file exists
     */
    async mergeCertificateConfigs() {
        try {
            // Skip if config file doesn't exist
            if (!fs.existsSync(this.configPath)) {
                logger.info(`Certificate config file not found at ${this.configPath}, using defaults`, null, FILENAME);
                return false;
            }

            // Read and parse the config file
            const configContent = fs.readFileSync(this.configPath, 'utf8');
            const config = JSON.parse(configContent);

            // Process certificate-specific configurations
            if (config.certificates && typeof config.certificates === 'object') {
                for (const [fingerprint, certConfig] of Object.entries(config.certificates)) {
                    // Find the certificate in our loaded set
                    if (this.certificates.has(fingerprint)) {
                        const cert = this.certificates.get(fingerprint);

                        // Update configuration
                        if (certConfig.autoRenew !== undefined) {
                            cert.autoRenew = certConfig.autoRenew;
                        }

                        if (certConfig.renewDaysBeforeExpiry) {
                            cert.renewDaysBeforeExpiry = certConfig.renewDaysBeforeExpiry;
                        }

                        if (certConfig.signWithCA !== undefined) {
                            cert.signWithCA = certConfig.signWithCA;
                            cert.caFingerprint = certConfig.caFingerprint || null;
                        } else if (certConfig.config && certConfig.config.signWithCA !== undefined) {
                            cert.signWithCA = certConfig.config.signWithCA;
                            cert.caFingerprint = certConfig.config.caFingerprint || null;
                        }

                        if (certConfig.deployActions) {
                            cert.deployActions = certConfig.deployActions;
                        }

                        // Update previous versions
                        if (certConfig.previousVersions) {
                            for (const [prevFingerprint, prevVersion] of Object.entries(certConfig.previousVersions)) {
                                cert.addPreviousVersion(prevFingerprint, prevVersion);
                            }
                        }

                        // Make sure to load the needsPassphrase property from config
                        if (certConfig.needsPassphrase !== undefined) {
                            certificate.needsPassphrase(certConfig.needsPassphrase);
                        }

                        // Load paths from config if available
                        if (certConfig.paths) {
                            // Add the paths to the certificate
                            cert.loadPaths(certConfig.paths);
                        }

                        if (certConfig.metadata) {
                            if (certConfig.metadata.subject) {
                                cert._subject = certConfig.metadata.subject;
                            }
                            if (certConfig.metadata.issuer) {
                                cert._issuer = certConfig.metadata.issuer;
                            }
                            if (certConfig.metadata.name) {
                                cert._name = certConfig.metadata.name;
                            }
                            if (certConfig.metadata.certType) {
                                cert._certType = certConfig.metadata.certType;
                            }
                            if (certConfig.metadata.domains) {
                                cert._domains = [...certConfig.metadata.domains];
                            }
                            if (certConfig.metadata.ips) {
                                cert._ips = [...certConfig.metadata.ips];
                            }
                        }

                        
                    }
                }
            }
            return true;
        } catch (error) {
            logger.error('Error merging certificate configs:', error, FILENAME);
            return false;
        }
    }

    /**
     * Save certificate configurations to file
     * @returns {Promise<boolean>} Success status
     */
    async saveCertificateConfigs() {
        try {
            logger.debug(`Saving certificate configurations to ${this.configPath}`, null, FILENAME);

            // Create config object
            const config = {
                version: this.CONFIG_VERSION,
                lastUpdate: new Date().toISOString(),
                certificates: {}
            };

            // Add each certificate configuration
            this.certificates.forEach((cert, fingerprint) => {
                config.certificates[fingerprint] = {
                    name: cert.name,
                    fingerprint: cert.fingerprint,
                    certType: cert.certType,
                    keyType: cert.keyType,
                    keySize: cert.keySize,
                    sigAlg: cert.sigAlg,
                    needsPassphrase: cert.needsPassphrase, // Store this cached value
                    domains: [...cert.domains],
                    ips: [...cert.ips],
                    idleDomains: [...cert.idleDomains],
                    idleIps: [...cert.idleIps],
                    paths: { ...cert.paths },
                    config: {
                        autoRenew: cert.autoRenew,
                        renewDaysBeforeExpiry: cert.renewDaysBeforeExpiry,
                        signWithCA: cert.signWithCA,
                        caFingerprint: cert.caFingerprint,
                        deployActions: [...cert.deployActions]
                    },
                    previousVersions: cert._previousVersions || {},
                    modificationTime: cert.modificationTime
                };
            });

            // Write to file
            await fs.promises.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf8');
            logger.info(`Saved configuration for ${this.certificates.size} certificates`, null, FILENAME);

            // Update config file last modified time
            const stats = fs.statSync(this.configPath);
            this.configLastModified = stats.mtimeMs;

            return true;
        } catch (error) {
            logger.error('Failed to save certificate configurations:', error, FILENAME);
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

            // Update basic metadata
            if (config.name !== undefined) {
                cert.name = config.name;
            }

            if (config.description !== undefined) {
                cert.description = config.description;
            }

            if (config.group !== undefined) {
                cert.group = config.group;
            }

            if (config.tags !== undefined) {
                cert.tags = config.tags;
            }

            // Update renewal settings
            if (config.autoRenew !== undefined) {
                cert.autoRenew = config.autoRenew;
            }

            if (config.renewDaysBeforeExpiry !== undefined) {
                cert.renewDaysBeforeExpiry = config.renewDaysBeforeExpiry;
            }

            if (config.validity !== undefined) {
                cert.validity = config.validity;
            }

            if (config.renewBefore !== undefined) {
                cert.renewBefore = config.renewBefore;
            }

            if (config.keySize !== undefined) {
                cert.keySize = config.keySize;
            }

            // Update CA settings
            if (config.signWithCA !== undefined) {
                cert.signWithCA = config.signWithCA;
                cert.caFingerprint = config.caFingerprint || null;
            }

            // Update deployment settings
            if (config.deployActions !== undefined) {
                cert.deployActions = config.deployActions;
            }

            // Update notification settings
            if (config.notifications !== undefined) {
                cert.notifications = {
                    ...cert.notifications || {},
                    ...config.notifications
                };
            }

            // Update custom metadata
            if (config.metadata !== undefined) {
                cert.metadata = {
                    ...cert.metadata || {},
                    ...config.metadata
                };
            }

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

            // Update configuration first
            const updateResult = await this.updateCertificateConfig(fingerprint, config);
            if (!updateResult) {
                throw new Error('Failed to update certificate configuration');
            }

            // Handle deployment actions specifically since that's where we're having issues
            if (config.deployActions !== undefined) {
                cert.deployActions = [...config.deployActions]; // Use spread operator to clone the array
                logger.debug(`Synchronized deployActions, now has ${cert.deployActions.length} actions`, null, FILENAME);
            }

            // Sync other properties as needed
            if (config.name !== undefined) {
                cert.name = config.name;
            }

            if (config.description !== undefined) {
                cert.description = config.description;
            }

            if (config.autoRenew !== undefined) {
                cert.autoRenew = config.autoRenew;
            }

            if (config.renewDaysBeforeExpiry !== undefined) {
                cert.renewDaysBeforeExpiry = config.renewDaysBeforeExpiry;
            }

            if (config.signWithCA !== undefined) {
                cert.signWithCA = config.signWithCA;
                if (config.caFingerprint !== undefined) {
                    cert.caFingerprint = config.caFingerprint;
                }
            }

            if (config.group !== undefined) {
                cert.group = config.group;
            }

            if (config.tags !== undefined) {
                cert.tags = config.tags;
            }

            // Ensure the certificate in our map is updated
            this.certificates.set(fingerprint, cert);

            // Add notification about the change
            this.notifyCertificateChanged(fingerprint, 'update');

            return true;
        } catch (error) {
            logger.error(`Error updating and syncing certificate config for ${fingerprint}:`, error, FILENAME);
            return false;
        }
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
            cert.verifyPaths();
            return cert;
        }

        // For backward compatibility, try with original fingerprint
        if (this.certificates.has(fingerprint)) {
            const cert = this.certificates.get(fingerprint);
            cert.verifyPaths();
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
     * Avoids unnecessary filesystem checks when the cache is valid
     * @returns {Array} Array of certificate objects with metadata
     */
    getAllCertificatesWithMetadata() {
        // If there are pending changes, only refresh those specific certificates
        if (this.pendingChanges.size > 0) {
            logger.fine(`Refreshing ${this.pendingChanges.size} certificates with pending changes`, null, FILENAME);
            // Use a non-blocking refresh approach to avoid delaying response
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

        // Use existing cache data immediately to improve response time    
        return Array.from(this.certificates.values())
            .map(cert => {
                const response = cert.toApiResponse(this.passphraseManager);

                // Add CA name if available
                if (response.signWithCA && response.caFingerprint) {
                    response.caName = this.getCAName(response.caFingerprint);
                }

                return response;
            });
    }

    /**
     * Get all CA certificates
     * @returns {Certificate[]} Array of CA certificates
     */
    getCAcertificates() {
        return this.getAllCertificates().filter(cert => cert.isCA());
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

            // Renew the certificate
            const OpenSSLWrapper = require('../services/openssl-wrapper');
            const openSSL = new OpenSSLWrapper();

            const renewalResult = await cert.createOrRenew(openSSL, {
                certsDir: this.certsDir,
                signingCA,
                passphrase: certPassphrase,
                ...options
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

            // Define backup directory
            // Fix: Use this.certsDir instead of this.certPath
            const certDir = path.join(this.certsDir, fingerprint);
            const backupsDir = path.join(certDir, 'backups');

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
     * Save certificate config to JSON file
     * @param {string} fingerprint - Certificate fingerprint
     * @param {Certificate} certificate - Certificate object
     * @returns {Promise<void>}
     */
    async saveCertificateConfig(fingerprint, certificate) {
        try {
            const config = await this.loadCertificatesConfig();

            // Make sure the certificate exists in config
            if (!config.certificates[fingerprint]) {
                config.certificates[fingerprint] = {
                    autoRenew: false,
                    renewDaysBeforeExpiry: 30,
                    signWithCA: false,
                    caFingerprint: null,
                    keyType: certificate.keyType,
                    keySize: certificate.keySize,
                    sigAlg: certificate.sigAlg,
                    deployActions: [],
                    previousVersions: {},
                    metadata: {}
                };
            }

            // Update metadata
            config.certificates[fingerprint].metadata = {
                name: certificate.name,
                subject: certificate.subject,
                issuer: certificate.issuer,
                validFrom: certificate.validFrom,
                validTo: certificate.validTo,
                certType: certificate.certType,
                domains: certificate.domains,
                ips: certificate.ips || []
            };

            // Add paths object if it doesn't exist
            if (!config.certificates[fingerprint].paths) {
                config.certificates[fingerprint].paths = {};
            }

            // Save only paths for files that actually exist
            const fs = require('fs');
            const paths = {};

            if (certificate._pathes) {
                Object.entries(certificate._pathes).forEach(([key, path]) => {
                    if (path && fs.existsSync(path)) {
                        // Save path without the key suffix "Path"
                        const cleanKey = key.endsWith('Path') ? key.slice(0, -4) : key;
                        paths[cleanKey] = path;
                    }
                });
            }

            // Update paths in config
            config.certificates[fingerprint].paths = paths;

            // Save the config
            await fs.promises.writeFile(
                this.configPath,
                JSON.stringify(config, null, 2),
                'utf8'
            );
        } catch (error) {
            this.logger.error(`Failed to save certificate config for ${fingerprint}:`, error, FILENAME);
            throw error;
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
            const certMetadata = certConfig.metadata || {};

            // Create certificate with basic details
            const Certificate = require('./Certificate');
            const cert = new Certificate();
            cert.name = certMetadata.name || '';
            cert.fingerprint = fingerprint;
            cert.subject = certMetadata.subject || '';
            cert.issuer = certMetadata.issuer || '';

            cert.validFrom = certMetadata.validFrom || '';
            cert.validTo = certMetadata.validTo || '';
            cert.certType = certMetadata.certType || 'standard';
            cert.domains = certMetadata.domains || [];
            cert.ips = certMetadata.ips || [];

            // Set certificate configuration
            cert.autoRenew = certConfig.autoRenew || false;
            cert.renewDaysBeforeExpiry = certConfig.renewDaysBeforeExpiry || 30;
            cert.signWithCA = certConfig.signWithCA || false;
            cert.caFingerprint = certConfig.caFingerprint || null;

            // Load paths from config if available
            if (certConfig.paths) {
                // Need to convert the paths from certConfig format to _pathes format
                const paths = {};
                Object.entries(certConfig.paths).forEach(([key, path]) => {
                    // For each key, add "Path" suffix if missing
                    const pathKey = key.endsWith('Path') ? key : `${key}Path`;
                    paths[pathKey] = path;
                });
                cert.loadPaths(paths);
            } else {
                // Fall back to generating paths
                const certDir = path.join(this.certsDir, fingerprint);
                cert.generatePaths(certDir);
            }

            return cert;
        } catch (error) {
            logger.error(`Failed to load certificate ${fingerprint}:`, error, FILENAME);
            return null;
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
     * Scan certificate directory and update metadata
     * @returns {Promise<Map<string, Certificate>>} Updated certificates map
     */
    async rescanCertificates() {
        logger.info('Rescanning certificate directory for changes', null, FILENAME);

        try {
            // Find all certificate files
            const certFiles = await this.findCertificateFiles(this.certsDir);
            logger.debug(`Found ${certFiles.length} certificate files`, null, FILENAME);

            // Process each certificate file
            const processedCerts = new Map();
            const existingFingerprints = new Set(this.certs.keys());

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

                        // Update certificate data with new parsed data
                        cert.subject = certData.subject || cert.subject;
                        cert.issuer = certData.issuer || cert.issuer;
                        cert.validFrom = certData.validFrom || cert.validFrom;
                        cert.validTo = certData.validTo || cert.validTo;
                        cert.certType = certData.certType || cert.certType;

                        // Update domains and IPs while preserving existing ones
                        if (certData.san && certData.domains && certData.domains.length > 0) {
                            // If certificate has domains in SAN, update them
                            cert.domains = certData.domains;
                        }

                        if (certData.san && certData.ips && certData.ips.length > 0) {
                            // If certificate has IPs in SAN, update them
                            cert.ips = certData.ips;
                        }

                        // Update paths
                        Object.entries(certData.paths).forEach(([key, value]) => {
                            if (value) cert.paths[key] = value;
                        });

                        logger.debug(`Updated existing certificate: ${cert.name} (${fingerprint})`, null, FILENAME);
                    } else {
                        // Create new certificate object
                        const Certificate = require('./Certificate');
                        cert = new Certificate(certData);
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
                logger.info(`Found signing CA for ${certificate.name}: ${issuerCA.name} (${issuerCA.fingerprint})`, null, FILENAME);

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
                logger.debug(`Could not find a matching CA for issuer: ${certificate.issuer}`, null, FILENAME);
            }

            return false;
        } catch (error) {
            logger.error(`Error updating CA fingerprint for ${certificate.name}:`, error, FILENAME);
            return false;
        }
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
     * Get certificate API response without OpenSSL operations
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Object} Enhanced certificate API response
     */
    getCertificateApiResponse(fingerprint) {
        logger.finest(`Getting API response for certificate fingerprint: ${fingerprint}`, null, FILENAME);

        try {
            // Validate input
            if (!fingerprint) {
                logger.warn(`Invalid fingerprint provided: ${fingerprint}`, null, FILENAME);
                return null;
            }

            // Find certificate
            const certificate = this.getCertificate(fingerprint);
            if (!certificate) {
                logger.warn(`Certificate not found with fingerprint: ${fingerprint}`, null, FILENAME);
                return null;
            }

            logger.fine(`Found certificate: ${certificate.name} (${certificate.fingerprint})`, null, FILENAME);

            // Get basic API response - no OpenSSL operation here
            logger.debug(`Building API response for certificate: ${certificate.name}`, null, FILENAME);
            let response;
            try {
                response = certificate.toApiResponse(this.passphraseManager);
                logger.finest(`Base response created with ${Object.keys(response).length} properties`, null, FILENAME);
            } catch (apiError) {
                logger.error(`Error creating base API response for certificate ${certificate.name}:`, apiError, FILENAME);
                throw new Error(`Failed to create API response: ${apiError.message}`);
            }

            // Add CA name if available
            if (response.signWithCA && response.caFingerprint) {
                logger.debug(`Certificate is signed by CA with fingerprint: ${response.caFingerprint}`, null, FILENAME);
                try {
                    response.caName = this.getCAName(response.caFingerprint);
                    logger.debug(`Found CA name: ${response.caName || 'Unknown CA'}`, null, FILENAME);
                } catch (caError) {
                    logger.warn(`Error getting CA name for fingerprint ${response.caFingerprint}:`, caError, FILENAME);
                    response.caName = 'Unknown CA';
                }
            }

            // All passphrase checks happen on certificate loading, not during API response
            if (response.signWithCA && response.caFingerprint) {
                const signingCA = this.getCertificate(response.caFingerprint);
                if (signingCA) {
                    response.signingCANeedsPassphrase = signingCA.needsPassphrase || false;
                    response.signingCAHasPassphrase = signingCA.hasStoredPassphrase(this.passphraseManager);
                }
            }

            // Add certificate deployment actions count
            const deployActionsCount = Array.isArray(certificate.deployActions) ? certificate.deployActions.length : 0;
            logger.finest(`Certificate has ${deployActionsCount} deployment actions configured`, null, FILENAME);

            // Check if certificate has previous versions
            const previousVersionsCount = certificate._previousVersions ? Object.keys(certificate._previousVersions).length : 0;
            response.hasPreviousVersions = previousVersionsCount > 0;
            logger.finest(`Certificate has ${previousVersionsCount} previous versions`, null, FILENAME);

            // Calculate days until expiry for API response
            try {
                if (response.validTo) {
                    const validToDate = new Date(response.validTo);
                    const now = new Date();
                    const daysUntilExpiry = Math.ceil((validToDate - now) / (1000 * 60 * 60 * 24));
                    response.daysUntilExpiry = daysUntilExpiry;
                    logger.finest(`Certificate expires in ${daysUntilExpiry} days`, null, FILENAME);
                }
            } catch (dateError) {
                logger.warn(`Error calculating days until expiry:`, dateError, FILENAME);
            }

            logger.debug(`API response preparation complete for certificate: ${certificate.name}`, null, FILENAME);
            return response;
        } catch (error) {
            logger.error(`Failed to generate API response for certificate ${fingerprint}:`, error, FILENAME);
            return null;
        }
    }
}

module.exports = CertificateManager;