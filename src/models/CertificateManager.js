const fs = require('fs');
const path = require('path');
const Certificate = require('./Certificate');
const PassphraseManager = require('../services/PassphraseManager');
const OpenSSLWrapper = require('../services/openssl-wrapper');
const logger = require('../services/logger');

class CertificateManager {
    /**
     * Create a certificate manager
     * @param {string} certsDir - Directory where certificates are stored
     * @param {string} configPath - Path to certificate configuration file
     * @param {string} configDir - Directory for configuration files
     */
    constructor(certsDir, configPath, configDir) {
        this.certsDir = certsDir;
        this.configPath = configPath;
        this.certificates = new Map();
        this.lastRefreshTime = 0;
        
        // Initialize passphrase manager
        this.passphraseManager = new PassphraseManager(configDir);
        
        // Initialize OpenSSL wrapper
        this.openssl = new OpenSSLWrapper();
    }
    
    /**
     * Load certificates from the file system and configuration
     * @param {boolean} forceRefresh - Force refresh even if recently loaded
     * @returns {Promise<Map<string, Certificate>>} Loaded certificates
     */
    async loadCertificates(forceRefresh = false) {
        const now = Date.now();
        
        // If certificates were recently loaded and no refresh is forced, return cached data
        if (!forceRefresh && 
            this.certificates.size > 0 && 
            (now - this.lastRefreshTime < 5 * 60 * 1000)) {  // 5 minute cache
            return this.certificates;
        }
        
        try {
            // Clear current certificates
            this.certificates.clear();
            
            // Step 1: Find certificates in the file system
            const certFiles = await this.findCertificateFiles();
            
            // Step 2: Parse each certificate file
            for (const file of certFiles) {
                try {
                    const certData = await this.parseCertificateFile(file);
                    if (certData && certData.fingerprint) {
                        const cert = new Certificate(certData);
                        this.certificates.set(cert.fingerprint, cert);
                    }
                } catch (error) {
                    logger.error(`Error parsing certificate file ${file}:`, error);
                }
            }
            
            // Step 3: Load additional data from configuration
            const configExists = await this.mergeCertificateConfigs();
            
            // Create config file if it doesn't exist and we have certificates
            if (!configExists && this.certificates.size > 0) {
                await this.saveCertificateConfigs();
            }
            
            this.lastRefreshTime = now;
            logger.info(`Loaded ${this.certificates.size} certificates`);
            
            return this.certificates;
        } catch (error) {
            logger.error('Error loading certificates:', error);
            throw error;
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
                            logger.warn(`Error accessing ${fullPath}:`, error);
                        }
                    }
                } catch (error) {
                    logger.error(`Error scanning directory ${dir}:`, error);
                }
            };
            
            // Start scanning from the certificates directory
            scanDirectory(this.certsDir);
            
            return certFiles;
        } catch (error) {
            logger.error('Error finding certificate files:', error);
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
            
            // Use OpenSSL wrapper instead of direct execution
            const certInfo = await this.openssl.getCertificateInfo(filePath);
            
            // Find related key file
            const keyPath = this.findKeyFile(filePath);
            
            // Construct paths object
            const pathes = {
                crtPath: filePath,
                keyPath,
                pemPath: filePath.replace(/\.(crt|cer|cert)$/, '.pem'),
                p12Path: filePath.replace(/\.(crt|cer|cert|pem)$/, '.p12'),
                csrPath: filePath.replace(/\.(crt|cer|cert|pem)$/, '.csr'),
                extPath: filePath.replace(/\.(crt|cer|cert|pem)$/, '.ext')
            };
            
            return {
                name: certInfo.name,
                fingerprint: certInfo.fingerprint,
                subject: certInfo.subject,
                issuer: certInfo.issuer,
                validFrom: certInfo.validFrom,
                validTo: certInfo.validTo,
                certType: certInfo.certType,
                pathes,
                signWithCA: certInfo.subject !== certInfo.issuer && certInfo.certType !== 'rootCA',
                san: {
                    domains: certInfo.domains,
                    ips: certInfo.ips
                }
            };
        } catch (error) {
            logger.error(`Error parsing certificate file ${filePath}:`, error);
            return null;
        }
    }
    
    /**
     * Parse domains from certificate text
     * @param {string} certText - OpenSSL certificate text output
     * @param {string} defaultDomain - Default domain name to use if no SANs found
     * @returns {string[]} Array of domain names
     */
    parseDomains(certText, defaultDomain) {
        const domains = [];
        
        // Extract Subject Alternative Name domains
        const sanMatch = certText.match(/X509v3 Subject Alternative Name:[^]*?DNS:([^]*?)(?:\n\s*[A-Za-z]|\n\n|$)/);
        if (sanMatch && sanMatch[1]) {
            // Extract DNS entries
            const sanText = sanMatch[1];
            const dnsMatches = sanText.matchAll(/DNS:([^,\n]+)/g);
            
            for (const match of dnsMatches) {
                domains.push(match[1].trim());
            }
        }
        
        // If no domains found, use the default domain from CN
        if (domains.length === 0 && defaultDomain) {
            domains.push(defaultDomain);
        }
        
        return domains;
    }
    
    /**
     * Parse IP addresses from certificate text
     * @param {string} certText - OpenSSL certificate text output
     * @returns {string[]} Array of IP addresses
     */
    parseIPs(certText) {
        const ips = [];
        
        // Extract Subject Alternative Name IP addresses
        const sanMatch = certText.match(/X509v3 Subject Alternative Name:[^]*?(?:IP Address|IP):([^]*?)(?:\n\s*[A-Za-z]|\n\n|$)/);
        if (sanMatch && sanMatch[1]) {
            // Extract IP entries
            const sanText = sanMatch[1];
            const ipMatches = sanText.matchAll(/(?:IP Address|IP):([^,\n]+)/g);
            
            for (const match of ipMatches) {
                ips.push(match[1].trim());
            }
        }
        
        return ips;
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
                logger.info(`Certificate config file not found at ${this.configPath}, using defaults`);
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

                        // Load paths from config if available
                        if (certConfig.paths) {
                            // Add the paths to the certificate
                            cert.loadPaths(certConfig.paths);
                        }
                    }
                }
            }            
            return true;
        } catch (error) {
            logger.error('Error merging certificate configs:', error);
            return false;
        }
    }
    
    /**
     * Save certificate configurations to the config file
     * @returns {Promise<boolean>} Success status
     */
    async saveCertificateConfigs() {
        try {
            // Create initial config structure
            const config = {
                certificates: {}
            };
            
            // Add each certificate's config
            for (const [fingerprint, cert] of this.certificates.entries()) {
                // Verify paths exist before saving
                cert.verifyPaths();
                
                // Extract paths and remove the "Path" suffix
                const paths = {};
                if (cert._pathes) {
                    Object.entries(cert._pathes).forEach(([key, path]) => {
                        if (path && fs.existsSync(path)) {
                            // Save path without the key suffix "Path"
                            const cleanKey = key.endsWith('Path') ? key.slice(0, -4) : key;
                            paths[cleanKey] = path;
                        }
                    });
                }

                config.certificates[fingerprint] = {
                    autoRenew: cert.autoRenew,
                    renewDaysBeforeExpiry: cert.renewDaysBeforeExpiry,
                    signWithCA: cert.signWithCA,
                    caFingerprint: cert.caFingerprint,
                    deployActions: cert.deployActions,
                    previousVersions: cert.previousVersions,
                    paths: paths,
                    metadata: {
                        name: cert.name,
                        subject: cert.subject,
                        issuer: cert.issuer,
                        validFrom: cert.validFrom,
                        validTo: cert.validTo,
                        certType: cert.certType,
                        domains: cert.domains,
                        ips: cert.ips
                    }
                };
            }
            
            // Ensure directory exists
            const configDir = path.dirname(this.configPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            // Write the config file
            fs.writeFileSync(
                this.configPath, 
                JSON.stringify(config, null, 2), 
                'utf8'
            );
            
            logger.info(`Saved certificate configs to ${this.configPath}`);
            return true;
        } catch (error) {
            logger.error('Error saving certificate configs:', error);
            return false;
        }
    }
    
    /**
     * Update a certificate's configuration
     * @param {string} fingerprint - Certificate fingerprint
     * @param {Object} config - Updated configuration
     * @returns {Promise<boolean>} Success status
     */
    async updateCertificateConfig(fingerprint, config) {
        logger.debug(`Updating certificate config for ${fingerprint}`, config);
        try {
            if (!fingerprint) {
                throw new Error('Fingerprint is required');
            }
            
            // Find the certificate
            if (!this.certificates.has(fingerprint)) {
                throw new Error(`Certificate not found with fingerprint: ${fingerprint}`);
            }
            
            const cert = this.certificates.get(fingerprint);
            
            // Update configuration values
            if (config.autoRenew !== undefined) {
                cert.autoRenew = config.autoRenew;
            }
            
            if (config.renewDaysBeforeExpiry !== undefined) {
                cert.renewDaysBeforeExpiry = config.renewDaysBeforeExpiry;
            }
            
            if (config.signWithCA !== undefined) {
                cert.signWithCA = config.signWithCA;
                cert.caFingerprint = config.caFingerprint || null;
            }
            
            if (config.deployActions !== undefined) {
                cert.deployActions = config.deployActions;
            }
            
            // Save all configurations
            await this.saveCertificateConfigs();
            
            return true;
        } catch (error) {
            logger.error(`Error updating certificate config for ${fingerprint}:`, error);
            return false;
        }
    }
    
    /**
     * Get a certificate by fingerprint
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Certificate} - Certificate object or null if not found
     */
    getCertificate(fingerprint) {
        // Clean any potential prefix from the fingerprint
        const cleanedFingerprint = fingerprint.replace(/SHA256 FINGERPRINT=|sha256 Fingerprint=/i, '');
        
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
     * Get all certificates
     * @returns {Certificate[]} Array of all certificates
     */
    getAllCertificates() {
        return Array.from(this.certificates.values());
    }
    
    /**
     * Get all certificates with metadata
     * @returns {Array} Array of certificate objects with metadata
     */
    getAllCertificatesWithMetadata() {
        const result = [];
        
        for (const cert of this.certificates.values()) {
            result.push(cert.toApiResponse(this.passphraseManager));
        }
        
        return result;
    }
    
    /**
     * Get all CA certificates
     * @returns {Certificate[]} Array of CA certificates
     */
    getCAcertificates() {
        return this.getAllCertificates().filter(cert => cert.isCA());
    }
    
    /**
     * Delete a certificate
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
                        logger.info(`Deleted certificate file: ${filePath}`);
                    } catch (error) {
                        logger.error(`Error deleting file ${filePath}:`, error);
                    }
                }
            }
            
            // Remove from certificates map
            this.certificates.delete(fingerprint);
            
            // Save updated configuration
            await this.saveCertificateConfigs();
            
            return { success: true };
        } catch (error) {
            logger.error(`Error deleting certificate ${fingerprint}:`, error);
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
                        logger.info(`Backed up ${key} file to ${backupPath}`);
                    } catch (error) {
                        logger.error(`Error backing up ${filePath}:`, error);
                    }
                }
            }
            
            return { 
                success: true, 
                backupDir, 
                paths: backupResults 
            };
        } catch (error) {
            logger.error(`Error backing up certificate ${cert.name}:`, error);
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
            logger.error(`Error storing passphrase: ${error.message}`);
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
     * Renew a certificate and execute deployment actions
     * @param {string} fingerprint - Certificate fingerprint
     * @param {Object} options - Renewal options
     * @returns {Promise<Object>} Result of renewal and deployment
     */
    async renewAndDeployCertificate(fingerprint, options = {}) {
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
            
            return {
                success: true,
                renewalResult
            };
        } catch (error) {
            logger.error(`Error renewing and deploying certificate ${fingerprint}`, error);
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
            this.logger.error(`Error getting backups for certificate ${fingerprint}:`, error);
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
            this.logger.error(`Error getting backup ${backupId} for certificate ${fingerprint}:`, error);
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
            logger.error(`Error creating backup for certificate ${fingerprint}:`, error);
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
            this.logger.error(`Error deleting backup ${backupId} for certificate ${fingerprint}:`, error);
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
            logger.error(`Error restoring backup ${backupId} for certificate ${fingerprint}:`, error);
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
            this.logger.error(`Failed to save certificate config for ${fingerprint}:`, error);
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
                    logger.warn(`No certificates config found at ${this.configPath}`);
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
            logger.error(`Failed to load certificate ${fingerprint}:`, error);
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
                    logger.warn(`No certificates config found at ${this.configPath}`);
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
            logger.error(`Error getting certificate config for ${fingerprint}:`, error);
            return {};
        }
    }
}

module.exports = CertificateManager;