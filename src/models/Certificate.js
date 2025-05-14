/**
 * Certificate Model
 * Represents a certificate in the system with all its properties and methods
 * @module models/Certificate
 * @requires fs - File system module for file operations
 * @requires services/logger - Logger service for logging messages
 * @version 0.0.3
 * @license MIT
 * @author Christian Meiners
 * @description This module exports a Certificate class that represents a certificate with various properties and methods.
 * The class provides a standardized structure throughout all methods.
 */

const logger = require('../services/logger');
const fs = require('fs');

const FILENAME = 'models/Certificate.js';

class Certificate {
    /**
     * Create a new Certificate instance
     * @param {Object|string} data - Certificate data object or name for a new certificate
     */
    constructor(data = {}) {
        logger.finest(`Creating new certificate instance ${typeof data === 'string' ? data : data.name || 'unnamed'}`, null, FILENAME, data.name);

        // Basic metadata
        this._name = null;
        this._fingerprint = null;
        this._subject = null;
        this._issuer = null;
        this._validFrom = null;
        this._validTo = null;
        this._description = null;

        // Certificate type and attributes
        this._certType = 'standard'; // standard, rootCA, intermediateCA, acme
        this._keyType = 'RSA';
        this._keySize = 2048;
        this._sigAlg = null;
    
        // Key identifiers
        this._serialNumber = null;     // Serial Number
        this._keyId = null;            // Subject Key Identifier
        this._authorityKeyId = null;   // Authority Key Identifier
        this._selfSigned = false;
        this._isRootCA = false;
        this._pathLenConstraint = null; // Path Length Constraint

        // Passphrase information
        this._hasPassphrase = false;
        this._needsPassphrase = false;
        this._passphraseChecked = false;

        // File paths - using "paths" not "pathes"
        this._paths = {};

        // Subject Alternative Names
        this._sans = {
            domains: [],      // Active domains
            ips: [],          // Active IPs
            idleDomains: [],  // Pending domains
            idleIps: []       // Pending IPs
        };

        // ACME settings
        this._acmeSettings = null;

        // Configuration
        this._config = {
            autoRenew: false,
            renewDaysBeforeExpiry: 30,
            signWithCA: false,
            caFingerprint: null,
            caName: null,
            deployActions: []
        };

        // Version history
        this._previousVersions = {};
        this._modificationTime = Date.now();

        // Initialize from data object if provided
        if (typeof data === 'string') {
            this._name = data;
            this._addDomainFromName();
            logger.debug(`Simple certificate initialized with name: ${this._name}`, null, FILENAME, this._name);
        } else if (data && typeof data === 'object') {
            this._fromData(data);
            logger.debug(`Certificate initialized: ${this._name || 'unnamed'} (${this._fingerprint || 'no fingerprint'})`, null, FILENAME, this._name);
        }

        logger.finest(`Certificate details: ${this._name}, Type: ${this._certType}, Domains: ${this._sans?.domains?.length || 0}, IPs: ${this._sans?.ips?.length || 0}`, null, FILENAME, this._name);
    }

    /**
     * Initialize the certificate from data object
     * @private
     * @param {Object} data - Certificate data
     */
    _fromData(data) {
        logger.fine(`Initializing certificate from data: ${data.name || 'unnamed'}`, null, FILENAME, data.name);

        try {
            // Basic properties
            this._name = data.name || null;
            this._fingerprint = data.fingerprint || null;
            this._subject = data.subject || null;
            this._issuer = data.issuer || null;
            this._validFrom = data.validFrom || null;
            this._validTo = data.validTo || null;
            this._description = data.description || null;

            // Certificate type and attributes
            this._certType = data.certType || 'standard';
            this._keyType = data.keyType || 'RSA';
            this._keySize = data.keySize || 2048;
            this._sigAlg = data.sigAlg || null;

            // Additional certificate technical details
            if (data.serialNumber) this._serialNumber = data.serialNumber;
            if (data.keyId) this._keyId = data.keyId;                           // Added Subject Key ID
            if (data.authorityKeyId) this._authorityKeyId = data.authorityKeyId; // Added Authority Key ID
            if (data.selfSigned !== undefined) this._selfSigned = data.selfSigned;
            if (data.isRootCA !== undefined) this._isRootCA = data.isRootCA;
            if (data.pathLenConstraint !== undefined) this._pathLenConstraint = data.pathLenConstraint;

            // Passphrase information
            this._hasPassphrase = data.hasPassphrase || false;
            this._needsPassphrase = data.needsPassphrase || false;
            this._passphraseChecked = data.needsPassphrase !== undefined;

            // ACME settings
            this._acmeSettings = data.acmeSettings || null;

            // Initialize paths
            this._paths = {};
            if (data.paths && typeof data.paths === 'object') {
                Object.entries(data.paths).forEach(([key, value]) => {
                    if (value) {
                        this._paths[key] = value;
                        logger.fine(`Added path from data: ${key} = ${value}`, null, FILENAME, this._name);
                    }
                });
                logger.debug(`Loaded paths: ${JSON.stringify(this._paths)}`, null, FILENAME, this._name);
            }

            // Initialize sans structure with proper defaults
            this._sans = {
                domains: [],
                ips: [],
                idleDomains: [],
                idleIps: []
            };

            // Load sans data
            if (data.sans && typeof data.sans === 'object') {
                // Process domains
                if (Array.isArray(data.sans.domains)) {
                    this._sans.domains = [...data.sans.domains].map(d => d.trim().toLowerCase());
                }

                // Process IPs
                if (Array.isArray(data.sans.ips)) {
                    this._sans.ips = [...data.sans.ips].map(ip => ip.trim());
                }

                // Process idle domains
                if (Array.isArray(data.sans.idleDomains)) {
                    this._sans.idleDomains = [...data.sans.idleDomains].map(d => d.trim().toLowerCase());
                }

                // Process idle IPs - fix inconsistent property name
                if (Array.isArray(data.sans.idleIps)) {
                    this._sans.idleIps = [...data.sans.idleIps].map(ip => ip.trim());
                } else if (Array.isArray(data.sans.idleIPs)) { // Handle legacy format
                    this._sans.idleIps = [...data.sans.idleIPs].map(ip => ip.trim());
                }
            }

            // Configuration with consistent structure
            this._config = {
                autoRenew: false,
                renewDaysBeforeExpiry: 30,
                signWithCA: false,
                caFingerprint: null,
                caName: null,
                deployActions: []
            };

            // Update config from data
            if (data.config && typeof data.config === 'object') {
                // Use defined structure and extract values from data.config
                this._config.autoRenew = data.config.autoRenew !== undefined ? data.config.autoRenew : this._config.autoRenew;
                this._config.renewDaysBeforeExpiry = data.config.renewDaysBeforeExpiry || this._config.renewDaysBeforeExpiry;
                this._config.signWithCA = data.config.signWithCA !== undefined ? data.config.signWithCA : this._config.signWithCA;
                this._config.caFingerprint = data.config.caFingerprint || this._config.caFingerprint;
                this._config.caName = data.config.caName || this._config.caName;

                // Handle deployActions consistently
                if (Array.isArray(data.config.deployActions)) {
                    this._config.deployActions = [...data.config.deployActions];
                    logger.fine(`Loaded ${this._config.deployActions.length} deployment actions from config.`, null, FILENAME, this._name);
                }
            }

            // Handle top-level properties (for backward compatibility) but maintain proper structure
            if (data.autoRenew !== undefined) {
                this._config.autoRenew = data.autoRenew;
            }
            if (data.renewDaysBeforeExpiry) {
                this._config.renewDaysBeforeExpiry = data.renewDaysBeforeExpiry;
            }
            if (data.signWithCA !== undefined) {
                this._config.signWithCA = data.signWithCA;
            }
            if (data.caFingerprint) {
                this._config.caFingerprint = data.caFingerprint;
            }
            if (data.caName) {
                this._config.caName = data.caName;
            }
            // Handle top-level deployActions (legacy format)
            if (Array.isArray(data.deployActions)) {
                this._config.deployActions = [...data.deployActions];
                logger.fine(`Loaded ${this._config.deployActions.length} deployment actions from top-level.`, null, FILENAME, this._name);
            }

            // Previous versions
            this._previousVersions = {};
            if (data.previousVersions && typeof data.previousVersions === 'object') {
                this._previousVersions = { ...data.previousVersions };
            }

            // Modification time
            this._modificationTime = data.modificationTime || Date.now();

            // Add domain from name if we have a name but no domains
            if (this._name && this._sans.domains.length === 0) {
                this._addDomainFromName();
            }

            logger.debug(`Certificate initialized: ${this._name || 'unnamed'} (${this._fingerprint || 'no fingerprint'})`, null, FILENAME, this._name);
        } catch (error) {
            logger.error(`Error initializing certificate from data:`, error, FILENAME, this._name);
            throw new Error(`Failed to initialize certificate: ${error.message}`);
        }
    }

    /**
     * Update certificate data from parsed certificate information
     * @param {Object} data - Certificate data extracted from file
     * @param {Object} options - Additional options for the update
     * @param {boolean} options.preserveConfig - Whether to preserve configuration settings
     * @returns {Certificate} - Returns this for method chaining
     */
    updateFromData(data, options = {}) {
        const preserveConfig = options.preserveConfig !== false;
        logger.finest(`Updating certificate data for ${this._name || data.name}`, null, FILENAME);

        // Update basic properties
        if (data.fingerprint) this._fingerprint = data.fingerprint;
        if (data.name) this._name = data.name;
        if (data.subject) this._subject = data.subject;
        if (data.issuer) this._issuer = data.issuer;
        if (data.validFrom) this._validFrom = data.validFrom;
        if (data.validTo) this._validTo = data.validTo;
        if (data.description) this._description = data.description;

        // Update technical details
        if (data.certType) this._certType = data.certType;
        if (data.keyType) this._keyType = data.keyType;
        if (data.keySize) this._keySize = data.keySize;
        if (data.sigAlg) this._sigAlg = data.sigAlg;

        // Additional certificate technical details
        if (data.serialNumber) this._serialNumber = data.serialNumber;
        if (data.keyId) this._keyId = data.keyId;
        if (data.authorityKeyId) this._authorityKeyId = data.authorityKeyId;
        if (data.selfSigned !== undefined) this._selfSigned = data.selfSigned;
        if (data.isRootCA !== undefined) this._isRootCA = data.isRootCA;
        if (data.pathLenConstraint !== undefined) this._pathLenConstraint = data.pathLenConstraint;

        // Update passphrase settings
        if (data.needsPassphrase !== undefined) {
            this._needsPassphrase = data.needsPassphrase;
            this._passphraseChecked = true;
        }
        if (data.hasPassphrase !== undefined) {
            this._hasPassphrase = data.hasPassphrase;
        }

        // Update SANS structure (preserve idle entries)
        if (data.sans) {
            // Create updated sans object with existing values as defaults
            const updatedSans = {
                domains: Array.isArray(data.sans.domains) ?
                    data.sans.domains.map(d => d.trim().toLowerCase()) :
                    this._sans.domains,

                ips: Array.isArray(data.sans.ips) ?
                    data.sans.ips.map(ip => ip.trim()) :
                    this._sans.ips,

                idleDomains: Array.isArray(data.sans.idleDomains) ?
                    data.sans.idleDomains.map(d => d.trim().toLowerCase()) :
                    this._sans.idleDomains,

                idleIps: Array.isArray(data.sans.idleIps) ?
                    data.sans.idleIps.map(ip => ip.trim()) :
                    (Array.isArray(data.sans.idleIPs) ? // Check legacy format
                        data.sans.idleIPs.map(ip => ip.trim()) :
                        this._sans.idleIps)
            };

            this._sans = updatedSans;
        }

        // Update paths if provided
        if (data.paths) {
            for (const [key, value] of Object.entries(data.paths)) {
                if (value) {
                    this._paths[key] = value;
                }
            }
        }

        // Update configuration (if not preserving or if explicitly updating)
        if (!preserveConfig || data.config) {
            const existingConfig = { ...this._config };

            if (data.config) {
                // Update config from data.config, preserving structure
                this._config = {
                    autoRenew: data.config.autoRenew !== undefined ? data.config.autoRenew : existingConfig.autoRenew,
                    renewDaysBeforeExpiry: data.config.renewDaysBeforeExpiry || existingConfig.renewDaysBeforeExpiry,
                    signWithCA: data.config.signWithCA !== undefined ? data.config.signWithCA : existingConfig.signWithCA,
                    caFingerprint: data.config.caFingerprint || existingConfig.caFingerprint,
                    caName: data.config.caName || existingConfig.caName,
                    deployActions: Array.isArray(data.config.deployActions) ?
                        [...data.config.deployActions] : existingConfig.deployActions
                };
                logger.fine(`Updated certificate config from data.config`, null, FILENAME, this._name);
            } else if (!preserveConfig) {
                // If we're not preserving config and no new config was provided,
                // initialize with defaults but keep existing deploy actions
                this._config = {
                    autoRenew: false,
                    renewDaysBeforeExpiry: 30,
                    signWithCA: false,
                    caFingerprint: null,
                    caName: null,
                    deployActions: existingConfig.deployActions
                };
                logger.fine(`Reset certificate config to defaults while preserving deployActions`, null, FILENAME, this._name);
            }

            // Handle top-level properties (for backward compatibility)
            if (data.autoRenew !== undefined) {
                this._config.autoRenew = data.autoRenew;
            }
            if (data.renewDaysBeforeExpiry) {
                this._config.renewDaysBeforeExpiry = data.renewDaysBeforeExpiry;
            }
            if (data.signWithCA !== undefined) {
                this._config.signWithCA = data.signWithCA;
            }
            if (data.caFingerprint) {
                this._config.caFingerprint = data.caFingerprint;
            }
            if (data.caName) {
                this._config.caName = data.caName;
            }

            // Handle top-level deployActions (for backward compatibility)
            if (Array.isArray(data.deployActions)) {
                this._config.deployActions = [...data.deployActions];
                logger.fine(`Updated deployActions from top-level property (${data.deployActions.length} actions)`, null, FILENAME, this._name);
            }
        }

        // Update ACME settings if provided
        if (data.acmeSettings) {
            this._acmeSettings = data.acmeSettings;
        }

        // Update previous versions if provided
        if (data.previousVersions && typeof data.previousVersions === 'object') {
            this._previousVersions = { ...data.previousVersions };
        }

        // Update modification time
        this._modificationTime = Date.now();

        return this;
    }

    /**
     * Add the certificate name as a domain if it looks like a valid domain
     * @private
     */
    _addDomainFromName() {
        try {
            if (this._name &&
                this._name.includes('.') &&
                !this._sans.domains.includes(this._name.toLowerCase())) {
                this._sans.domains.push(this._name.toLowerCase());
                logger.fine(`Added certificate name as domain: ${this._name}`, null, FILENAME, this._name);
            }
        } catch (error) {
            logger.error(`Error adding domain from name: ${error.message}`, null, FILENAME, this._name);
        }
    }

    /**
     * Convert certificate object to JSON representation
     * @returns {Object} JSON representation of the certificate
     */
    toJSON() {
        logger.finest(`Converting certificate ${this._name} to JSON`, null, FILENAME, this._name);

        try {
            return {
                // Basic metadata
                name: this._name,
                description: this._description,
                fingerprint: this._fingerprint,
                subject: this._subject,
                issuer: this._issuer,
                validFrom: this._validFrom,
                validTo: this._validTo,

                // Computed properties
                isExpired: this.isExpired(),
                isExpiringSoon: this.isExpiringSoon(this._config.renewDaysBeforeExpiry),

                // Certificate type and attributes
                certType: this._certType,
                keyType: this._keyType,
                keySize: this._keySize,
                sigAlg: this._sigAlg,

                // Key identifiers
                serialNumber: this._serialNumber,
                keyId: this._keyId,                 // Added Subject Key ID
                authorityKeyId: this._authorityKeyId, // Added Authority Key ID
                selfSigned: this._selfSigned,
                isRootCA: this._isRootCA,
                pathLenConstraint: this._pathLenConstraint,

                // Passphrase information
                needsPassphrase: this._needsPassphrase,
                hasPassphrase: this._hasPassphrase,

                // File paths
                paths: { ...this._paths },

                // Subject Alternative Names
                sans: {
                    domains: [...this._sans.domains],
                    ips: [...this._sans.ips],
                    idleDomains: [...this._sans.idleDomains],
                    idleIps: [...this._sans.idleIps]
                },

                // ACME settings
                acmeSettings: this._acmeSettings,

                // Configuration - always consistent
                config: {
                    autoRenew: this._config.autoRenew,
                    renewDaysBeforeExpiry: this._config.renewDaysBeforeExpiry,
                    signWithCA: this._config.signWithCA,
                    caFingerprint: this._config.caFingerprint,
                    caName: this._config.caName,
                    deployActions: [...this._config.deployActions]
                },

                // Version history
                previousVersions: { ...this._previousVersions },
                modificationTime: this._modificationTime
            };
        } catch (error) {
            logger.error(`Error generating JSON for certificate ${this._name}:`, error, FILENAME, this._name);
            return { name: this._name, error: error.message };
        }
    }

    /**
     * Create file paths for a certificate based on name and directory
     * @param {string} certsDir - Base directory for certificates
     */
    generatePaths(certsDir) {
        if (!this._name) {
            logger.error(`Cannot generate paths: Certificate name is required`, null, FILENAME, this._name);
            throw new Error('Certificate name is required to generate paths');
        }

        const baseName = this._name.replace(/[^\w.-]/g, '_');

        logger.fine(`Generating paths for certificate ${this._name} in directory ${certsDir}`, null, FILENAME, this._name);

        // Define potential paths based on naming convention
        const potentialPaths = {
            crt: `${certsDir}/${baseName}.crt`,
            key: `${certsDir}/${baseName}.key`,
            csr: `${certsDir}/${baseName}.csr`,
            pem: `${certsDir}/${baseName}.pem`,
            p12: `${certsDir}/${baseName}.p12`,
            pfx: `${certsDir}/${baseName}.pfx`,
            ext: `${certsDir}/${baseName}.ext`,
            cer: `${certsDir}/${baseName}.cer`,
            der: `${certsDir}/${baseName}.der`,
            p7b: `${certsDir}/${baseName}.p7b`,
            chain: `${certsDir}/${baseName}-chain.pem`,
            fullchain: `${certsDir}/${baseName}-fullchain.pem`
        };

        logger.finest(`Potential paths: ${JSON.stringify(potentialPaths)}`, null, FILENAME, this._name);

        // Initialize paths object with only paths that exist
        this._paths = {};

        try {
            // Check each potential path and only add to _paths if file exists
            Object.entries(potentialPaths).forEach(([key, filePath]) => {
                if (fs.existsSync(filePath)) {
                    this._paths[key] = filePath;
                    logger.finest(`Found existing file for ${key}: ${filePath}`, null, FILENAME, this._name);
                }
            });

            // If this is a new certificate (no existing files),
            // add the essential paths for creation
            if (Object.keys(this._paths).length === 0) {
                logger.fine(`No existing files found. Adding essential paths for new certificate.`, null, FILENAME, this._name);
                this._paths.crt = potentialPaths.crt;
                this._paths.key = potentialPaths.key;
                this._paths.csr = potentialPaths.csr;
                this._paths.ext = potentialPaths.ext;
            }

            logger.debug(`Generated paths for certificate ${this._name}`, null, FILENAME, this._name);
            return this._paths;
        } catch (error) {
            logger.error(`Error generating paths for certificate ${this._name}:`, error, FILENAME, this._name);
            throw error;
        }
    }

    /**
     * Verify that all paths in the certificate exist
     * Remove paths that don't exist
     */
    verifyPaths() {
        if (!this._paths) return;

        logger.finest(`Verifying paths for certificate: ${this._name}`, null, FILENAME, this._name);

        const pathsToRemove = [];

        try {
            // Check each path
            Object.entries(this._paths).forEach(([key, filePath]) => {
                if (!filePath || !fs.existsSync(filePath)) {
                    logger.fine(`Path ${key} not found: ${filePath}`, null, FILENAME, this._name);
                    pathsToRemove.push(key);
                } else {
                    logger.finest(`Path ${key} exists: ${filePath}`, null, FILENAME, this._name);
                }
            });

            // Remove non-existent paths
            if (pathsToRemove.length > 0) {
                pathsToRemove.forEach(key => {
                    delete this._paths[key];
                });
                logger.debug(`Removed ${pathsToRemove.length} non-existent paths`, null, FILENAME, this._name);
            }
        } catch (error) {
            logger.warn(`Error verifying paths for certificate ${this._name}:`, error, FILENAME, this._name);
        }
    }

    /**
     * Add a new version of the certificate to previous versions
     * @param {string} fingerprint - Old certificate fingerprint
     * @param {Object} versionData - Certificate version data
     */
    addPreviousVersion(fingerprint, versionData) {
        if (!fingerprint || !versionData) {
            logger.warn(`Failed to add previous version: missing fingerprint or data`, null, FILENAME, this._name);
            return false;
        }

        try {
            // Initialize previous versions if needed
            if (!this._previousVersions) {
                this._previousVersions = {};
            }

            // Add basic version metadata if not provided
            if (!versionData.archivedAt) {
                versionData.archivedAt = new Date().toISOString();
            }

            if (!versionData.version) {
                versionData.version = Object.keys(this._previousVersions).length + 1;
            }

            // Store the previous version
            this._previousVersions[fingerprint] = versionData;

            // Update modification time
            this._modificationTime = Date.now();

            logger.info(`Added previous version ${versionData.version} with fingerprint ${fingerprint} to certificate ${this._name}`, null, FILENAME, this._name);

            return true;
        } catch (error) {
            logger.error(`Error adding previous version: ${error.message}`, null, FILENAME, this._name);
            return false;
        }
    }

    /**
     * Get previous versions of this certificate
     * @returns {Array} Array of previous versions
     */
    getPreviousVersions() {
        if (!this._previousVersions) {
            return [];
        }

        return Object.entries(this._previousVersions)
            .map(([fingerprint, data]) => ({
                fingerprint,
                ...data,
                // Ensure these fields are present
                archivedAt: data.archivedAt || data.renewedAt || null,
                version: data.version || 0
            }))
            .sort((a, b) => (b.version || 0) - (a.version || 0)); // Sort by version, newest first
    }

    /**
     * Check if this certificate's private key requires a passphrase
     * @param {OpenSSLWrapper} openssl - OpenSSL wrapper instance
     * @param {boolean} forceCheck - Force rechecking even if already cached
     * @returns {Promise<boolean>} True if private key is encrypted
     */
    async checkNeedsPassphrase(openssl, forceCheck = false) {
        // Return cached value if available and not forcing a check
        if (this._passphraseChecked && !forceCheck) {
            logger.finest(`Using cached passphrase requirement value: ${this._needsPassphrase}`, null, FILENAME, this._name);
            return this._needsPassphrase;
        }

        if (!this._paths?.key || !fs.existsSync(this._paths.key)) {
            logger.debug(`No key file found to check for passphrase requirement: ${this._name}`, null, FILENAME, this._name);
            this._needsPassphrase = false;
            this._passphraseChecked = true;
            return false;
        }

        try {
            logger.debug(`Checking if certificate key requires passphrase: ${this._name}`, null, FILENAME, this._name);
            const isEncrypted = await openssl.isKeyEncrypted(this._paths.key);
            logger.debug(`Certificate key is${isEncrypted ? '' : ' not'} encrypted: ${this._name}`, null, FILENAME, this._name);

            // Cache the result
            this._needsPassphrase = isEncrypted;
            this._passphraseChecked = true;

            return isEncrypted;
        } catch (error) {
            logger.warn(`Error checking if key needs passphrase: ${error.message}`, null, FILENAME, this._name);
            // If we can't check, assume it might need a passphrase to be safe
            this._needsPassphrase = true;
            this._passphraseChecked = true;
            return true;
        }
    }

    /**
     * Check if the certificate has a stored passphrase
     * @param {PassphraseManager} passphraseManager - Passphrase manager instance
     * @returns {boolean} True if the certificate has a stored passphrase
     */
    hasStoredPassphrase(passphraseManager) {
        if (!passphraseManager || !this._fingerprint) {
            return false;
        }

        const result = passphraseManager.hasPassphrase(this._fingerprint);
        logger.finest(`Certificate ${this._name} has stored passphrase: ${result}`, null, FILENAME, this._name);
        return result;
    }

    /**
     * Update and cache the passphrase status
     * @param {PassphraseManager} passphraseManager - Passphrase manager instance
     * @returns {boolean} Current passphrase status
     */
    updatePassphraseStatus(passphraseManager) {
        this._hasPassphrase = this.hasStoredPassphrase(passphraseManager);
        logger.finest(`Certificate ${this._name} has passphrase: ${this._hasPassphrase}`, null, FILENAME, this._name);
        return this._hasPassphrase;
    }

    /**
     * Get the stored passphrase for this certificate
     * @param {PassphraseManager} passphraseManager - Passphrase manager instance
     * @returns {string|null} Passphrase or null if not found
     */
    getPassphrase(passphraseManager) {
        if (!passphraseManager || !this._fingerprint) {
            return null;
        }

        return passphraseManager.getPassphrase(this._fingerprint);
    }

    /**
     * Store a passphrase for this certificate
     * @param {PassphraseManager} passphraseManager - Passphrase manager instance
     * @param {string} passphrase - Passphrase to store
     * @returns {boolean} Success status
     */
    storePassphrase(passphraseManager, passphrase) {
        if (!passphraseManager || !this._fingerprint) {
            logger.warn(`Cannot store passphrase: Missing passphrase manager or fingerprint`, null, FILENAME, this._name);
            return false;
        }

        try {
            passphraseManager.storePassphrase(this._fingerprint, passphrase);
            logger.info(`Passphrase stored for certificate: ${this._name}`, null, FILENAME, this._name);
            this._hasPassphrase = true;
            return true;
        } catch (error) {
            logger.error(`Failed to store passphrase for certificate ${this._name}:`, error, FILENAME, this._name);
            return false;
        }
    }

    /**
     * Delete the stored passphrase for this certificate
     * @param {PassphraseManager} passphraseManager - Passphrase manager instance
     * @returns {boolean} Success status
     */
    deletePassphrase(passphraseManager) {
        if (!passphraseManager || !this._fingerprint) {
            logger.warn(`Cannot delete passphrase: Missing passphrase manager or fingerprint`, null, FILENAME, this._name);
            return false;
        }

        try {
            const result = passphraseManager.deletePassphrase(this._fingerprint);
            if (result) {
                logger.info(`Passphrase deleted for certificate: ${this._name}`, null, FILENAME, this._name);
            } else {
                logger.warn(`No passphrase found to delete for certificate: ${this._name}`, null, FILENAME, this._name);
            }
            this._hasPassphrase = false;
            return result;
        } catch (error) {
            logger.error(`Failed to delete passphrase for certificate ${this._name}:`, error, FILENAME, this._name);
            return false;
        }
    }

    /**
     * Check if certificate is expired
     * @returns {boolean} True if certificate is expired
     */
    isExpired() {
        if (!this._validTo) return false;

        try {
            const expiryDate = new Date(this._validTo);
            const now = new Date();
            const result = expiryDate < now;

            if (result) {
                logger.debug(`Certificate ${this._name} is expired (valid to: ${this._validTo})`, null, FILENAME, this._name);
            }

            return result;
        } catch (e) {
            logger.warn(`Error checking certificate expiration: ${e.message}`, null, FILENAME, this._name);
            return false;
        }
    }

    /**
     * Check if certificate is expiring soon
     * @param {number} days - Days threshold for "expiring soon"
     * @returns {boolean} True if certificate is expiring within the specified days
     */
    isExpiringSoon(days = 30) {
        if (!this._validTo) return false;

        try {
            const expiryDate = new Date(this._validTo);
            const warningThreshold = new Date();
            warningThreshold.setDate(warningThreshold.getDate() + days);

            const now = new Date();
            const result = !this.isExpired() && expiryDate <= warningThreshold;

            if (result) {
                const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
                logger.debug(`Certificate ${this._name} is expiring soon (${daysLeft} days left)`, null, FILENAME, this._name);
            }

            return result;
        } catch (e) {
            logger.warn(`Error checking if certificate is expiring soon: ${e.message}`, null, FILENAME, this._name);
            return false;
        }
    }

    /**
     * Calculate days until certificate expires
     * @returns {number} Days until expiry, or -1 if already expired
     */
    daysUntilExpiry() {
        if (!this._validTo) return -1;

        try {
            const expiryDate = new Date(this._validTo);
            const now = new Date();

            const diffTime = expiryDate - now;
            const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            logger.finest(`Certificate ${this._name} expires in ${days} days`, null, FILENAME, this._name);
            return days;
        } catch (e) {
            logger.warn(`Error calculating days until expiry: ${e.message}`, null, FILENAME, this._name);
            return -1;
        }
    }

    /**
     * Find the CA certificate that signed this certificate
     * @param {CertificateManager} certManager - Certificate manager instance
     * @returns {Certificate|null} The CA certificate or null if not found
     */
    findSigningCA(certManager) {
        try {
            logger.debug(`Finding signing CA for certificate ${this._name} (${this._fingerprint})`, null, FILENAME, this._name);

            if (!this._authorityKeyId) {
                logger.fine(`No Authority Key ID available for this certificate, can't reliably find signing CA`, null, FILENAME, this._name);
                return null;
            }

            // First try to find by Authority Key ID matching CA's Subject Key ID (most reliable)
            const allCerts = certManager.getAllCertificates();

            const caByKeyId = allCerts.find(cert =>
                cert.isCA &&
                cert._keyId &&
                cert._keyId.toUpperCase() === this._authorityKeyId.toUpperCase()
            );

            if (caByKeyId) {
                logger.fine(`Found signing CA by Key ID: ${caByKeyId._name} (${caByKeyId._fingerprint})`, null, FILENAME, this._name);

                // Update the certificate's CA reference
                this._config.caFingerprint = caByKeyId._fingerprint;
                this._config.caName = caByKeyId._name;

                return caByKeyId;
            }

            // If we can't find by Key ID, fall back to issuer name matching
            if (this._issuer) {
                const caByIssuer = allCerts.find(cert =>
                    cert.isCA &&
                    cert._subject &&
                    cert._subject === this._issuer
                );

                if (caByIssuer) {
                    logger.fine(`Found signing CA by issuer subject: ${caByIssuer._name} (${caByIssuer._fingerprint})`, null, FILENAME, this._name);

                    // Update the certificate's CA reference
                    this._config.caFingerprint = caByIssuer._fingerprint;
                    this._config.caName = caByIssuer._name;

                    return caByIssuer;
                }
            }

            // As a last resort, try the stored caFingerprint
            if (this._config?.caFingerprint) {
                const caByFingerprint = certManager.getCertificate(this._config.caFingerprint);
                if (caByFingerprint && caByFingerprint.isCA) {
                    logger.fine(`Found signing CA by stored fingerprint: ${caByFingerprint._name}`, null, FILENAME, this._name);
                    return caByFingerprint;
                }
            }

            logger.debug(`No signing CA found for certificate ${this._name}`, null, FILENAME, this._name);
            return null;
        } catch (error) {
            logger.error(`Error finding signing CA for ${this._name}:`, error, FILENAME, this._name);
            return null;
        }
    }

    /**
     * Add a domain to the certificate
     * @param {string} domain - Domain to add
     * @param {boolean} [idle=true] - Whether the domain is idle (waiting for renewal)
     * @returns {object} Result with success status and message
     */
    addDomain(domain, idle = true) {
        if (!domain || typeof domain !== 'string') {
            logger.warn(`Invalid domain provided for addDomain: ${domain}`, null, FILENAME, this._name);
            return { success: false, message: 'Invalid domain' };
        }

        const sanitizedDomain = domain.trim().toLowerCase();

        // Check if domain already exists in active domains
        if (this._sans.domains.includes(sanitizedDomain)) {
            logger.debug(`Domain ${domain} already exists as an active domain`, null, FILENAME, this._name);
            return {
                success: false,
                message: `Domain ${domain} already exists as an active domain in this certificate`,
                existsIn: 'active'
            };
        }

        // Check if domain is in idle list
        if (this._sans.idleDomains.includes(sanitizedDomain)) {
            logger.debug(`Domain ${domain} already exists as a pending domain`, null, FILENAME, this._name);
            return {
                success: false,
                message: `Domain ${domain} already exists as a pending domain in this certificate`,
                existsIn: 'idle'
            };
        }

        // Add to appropriate list
        if (idle) {
            this._sans.idleDomains.push(sanitizedDomain);
            logger.info(`Added ${domain} as pending domain to certificate ${this._name}`, null, FILENAME, this._name);
        } else {
            this._sans.domains.push(sanitizedDomain);
            logger.info(`Added ${domain} as active domain to certificate ${this._name}`, null, FILENAME, this._name);
        }

        this._modificationTime = Date.now();
        return { success: true };
    }

    /**
     * Remove a domain from the certificate
     * @param {string} domain - Domain to remove
     * @param {boolean} [fromIdle=false] - Whether to remove from idle domains
     * @returns {boolean} True if domain was removed
     */
    removeDomain(domain, fromIdle = false) {
        if (!domain || typeof domain !== 'string') {
            logger.warn(`Invalid domain provided for removeDomain: ${domain}`, null, FILENAME, this._name);
            return false;
        }

        const sanitizedDomain = domain.trim().toLowerCase();
        let removed = false;

        if (fromIdle) {
            // Remove from idle domains
            const idleIndex = this._sans.idleDomains.indexOf(sanitizedDomain);
            if (idleIndex !== -1) {
                this._sans.idleDomains.splice(idleIndex, 1);
                removed = true;
                logger.info(`Removed ${domain} from pending domains of certificate ${this._name}`, null, FILENAME, this._name);
            } else {
                logger.debug(`Domain ${domain} not found in pending domains`, null, FILENAME, this._name);
            }
        } else {
            // Remove from active domains
            const activeIndex = this._sans.domains.indexOf(sanitizedDomain);
            if (activeIndex !== -1) {
                this._sans.domains.splice(activeIndex, 1);
                removed = true;
                logger.info(`Removed ${domain} from active domains of certificate ${this._name}`, null, FILENAME, this._name);
            } else {
                logger.debug(`Domain ${domain} not found in active domains`, null, FILENAME, this._name);
            }
        }

        if (removed) {
            this._modificationTime = Date.now();
        }

        return removed;
    }

    /**
     * Add an IP to the certificate
     * @param {string} ip - IP address to add
     * @param {boolean} [idle=true] - Whether the IP is idle (waiting for renewal)
     * @returns {object} Result with success status and message
     */
    addIp(ip, idle = true) {
        if (!ip || typeof ip !== 'string') {
            logger.warn(`Invalid IP provided for addIp: ${ip}`, null, FILENAME, this._name);
            return { success: false, message: 'Invalid IP address' };
        }

        const sanitizedIp = ip.trim();

        // Check if IP already exists in active IPs
        if (this._sans.ips.includes(sanitizedIp)) {
            logger.debug(`IP ${ip} already exists as an active IP address`, null, FILENAME, this._name);
            return {
                success: false,
                message: `IP ${ip} already exists as an active IP address in this certificate`,
                existsIn: 'active'
            };
        }

        // Check if IP is in idle list
        if (this._sans.idleIps.includes(sanitizedIp)) {
            logger.debug(`IP ${ip} already exists as a pending IP address`, null, FILENAME, this._name);
            return {
                success: false,
                message: `IP ${ip} already exists as a pending IP address in this certificate`,
                existsIn: 'idle'
            };
        }

        // Add to appropriate list
        if (idle) {
            this._sans.idleIps.push(sanitizedIp);
            logger.info(`Added ${ip} as pending IP to certificate ${this._name}`, null, FILENAME, this._name);
        } else {
            this._sans.ips.push(sanitizedIp);
            logger.info(`Added ${ip} as active IP to certificate ${this._name}`, null, FILENAME, this._name);
        }

        this._modificationTime = Date.now();
        return { success: true };
    }

    /**
     * Remove an IP from the certificate
     * @param {string} ip - IP address to remove
     * @param {boolean} [fromIdle=false] - Whether to remove from idle IPs
     * @returns {boolean} True if IP was removed
     */
    removeIp(ip, fromIdle = false) {
        if (!ip || typeof ip !== 'string') {
            logger.warn(`Invalid IP provided for removeIp: ${ip}`, null, FILENAME, this._name);
            return false;
        }

        const sanitizedIp = ip.trim();
        let removed = false;

        if (fromIdle) {
            // Remove from idle IPs
            const idleIndex = this._sans.idleIps.indexOf(sanitizedIp);
            if (idleIndex !== -1) {
                this._sans.idleIps.splice(idleIndex, 1);
                removed = true;
                logger.info(`Removed ${ip} from pending IPs of certificate ${this._name}`, null, FILENAME, this._name);
            } else {
                logger.debug(`IP ${ip} not found in pending IPs`, null, FILENAME, this._name);
            }
        } else {
            // Remove from active IPs
            const activeIndex = this._sans.ips.indexOf(sanitizedIp);
            if (activeIndex !== -1) {
                this._sans.ips.splice(activeIndex, 1);
                removed = true;
                logger.info(`Removed ${ip} from active IPs of certificate ${this._name}`, null, FILENAME, this._name);
            } else {
                logger.debug(`IP ${ip} not found in active IPs`, null, FILENAME, this._name);
            }
        }

        if (removed) {
            this._modificationTime = Date.now();
        }

        return removed;
    }

    /**
     * Apply all idle domains and IPs by moving them to active lists
     * @returns {boolean} True if any domains or IPs were applied
     */
    applyIdleSubjects() {
        const idleDomainCount = this._sans.idleDomains.length;
        const idleIpsCount = this._sans.idleIps.length;

        const hadChanges = idleDomainCount > 0 || idleIpsCount > 0;

        if (hadChanges) {
            logger.info(`Applying ${idleDomainCount} pending domains and ${idleIpsCount} pending IPs for certificate ${this._name}`, null, FILENAME, this._name);

            // Move idle domains to active domains
            if (idleDomainCount > 0) {
                logger.fine(`Applying domains: ${JSON.stringify(this._sans.idleDomains)}`, null, FILENAME, this._name);
                this._sans.domains.push(...this._sans.idleDomains);
                this._sans.idleDomains = [];
            }

            // Move idle IPs to active IPs
            if (idleIpsCount > 0) {
                logger.fine(`Applying IPs: ${JSON.stringify(this._sans.idleIps)}`, null, FILENAME, this._name);
                this._sans.ips.push(...this._sans.idleIps);
                this._sans.idleIps = [];
            }

            this._modificationTime = Date.now();
        } else {
            logger.debug(`No pending domains or IPs to apply for certificate ${this._name}`, null, FILENAME, this._name);
        }

        return hadChanges;
    }

    /**
     * Load certificate paths from a path object
     * @param {Object} pathsObject - Object containing path keys and values
     * @returns {Object} The updated paths object
     */
    loadPaths(pathsObject) {
        if (!pathsObject || typeof pathsObject !== 'object') {
            logger.debug(`Invalid paths object provided to loadPaths for certificate ${this._name}`, null, FILENAME, this._name);
            return this._paths || {};
        }

        logger.debug(`Loading paths for certificate ${this._name}: ${JSON.stringify(pathsObject)}`, null, FILENAME, this._name);

        this._paths = this._paths || {};

        // Check and set each path, verifying existence
        Object.entries(pathsObject).forEach(([key, filePath]) => {
            // Skip empty paths
            if (!filePath) {
                logger.fine(`Skipping empty path for key: ${key}`, null, FILENAME, this._name);
                return;
            }

            try {
                // Check if file exists before adding
                if (fs.existsSync(filePath)) {
                    this._paths[key] = filePath;
                    logger.fine(`Added path ${key}: ${filePath}`, null, FILENAME, this._name);
                } else {
                    logger.fine(`Path file does not exist, skipping: ${filePath}`, null, FILENAME, this._name);
                }
            } catch (error) {
                logger.fine(`Error checking path ${key}: ${error.message}`, null, FILENAME, this._name);
            }
        });

        logger.debug(`Final paths after loading: ${JSON.stringify(this._paths)}`, null, FILENAME, this._name);
        return this._paths;
    }

    // Getters and setters for properties

    get name() {
        return this._name;
    }

    set name(value) {
        logger.finest(`Setting name from '${this._name}' to '${value}'`, null, FILENAME, this._name);
        this._name = value;
        this._addDomainFromName();
    }

    get fingerprint() {
        return this._fingerprint;
    }

    set fingerprint(value) {
        logger.finest(`Setting fingerprint from '${this._fingerprint}' to '${value}'`, null, FILENAME, this._name);
        this._fingerprint = value;
    }

    get subject() {
        return this._subject;
    }

    set subject(value) {
        logger.finest(`Setting subject from '${this._subject}' to '${value}'`, null, FILENAME, this._name);
        this._subject = value;
    }

    get issuer() {
        return this._issuer;
    }

    set issuer(value) {
        logger.finest(`Setting issuer from '${this._issuer}' to '${value}'`, null, FILENAME, this._name);
        this._issuer = value;
    }

    get validFrom() {
        return this._validFrom;
    }

    set validFrom(value) {
        logger.finest(`Setting validFrom from '${this._validFrom}' to '${value}'`, null, FILENAME, this._name);
        this._validFrom = value;
    }

    get validTo() {
        return this._validTo;
    }

    set validTo(value) {
        logger.finest(`Setting validTo from '${this._validTo}' to '${value}'`, null, FILENAME, this._name);
        this._validTo = value;
    }

    get description() {
        return this._description;
    }

    set description(value) {
        logger.finest(`Setting description from '${this._description}' to '${value}'`, null, FILENAME, this._name);
        this._description = value;
    }

    get certType() {
        return this._certType;
    }

    set certType(value) {
        logger.finest(`Setting certType from '${this._certType}' to '${value}'`, null, FILENAME, this._name);
        if (['standard', 'rootCA', 'intermediateCA', 'acme'].includes(value)) {
            this._certType = value;
        } else {
            logger.warn(`Invalid certificate type: ${value}`, null, FILENAME, this._name);
            throw new Error(`Invalid certificate type: ${value}`);
        }
    }

    get keyType() {
        return this._keyType;
    }

    set keyType(value) {
        logger.finest(`Setting keyType from '${this._keyType}' to '${value}'`, null, FILENAME, this._name);
        this._keyType = value || 'RSA';
    }

    get keySize() {
        return this._keySize;
    }

    set keySize(value) {
        const size = parseInt(value, 10) || 2048;
        logger.finest(`Setting keySize from ${this._keySize} to ${size}`, null, FILENAME, this._name);
        this._keySize = size;
    }

    get sigAlg() {
        return this._sigAlg;
    }

    set sigAlg(value) {
        logger.finest(`Setting sigAlg from '${this._sigAlg}' to '${value}'`, null, FILENAME, this._name);
        this._sigAlg = value;
    }

    get keyId() {
        return this._keyId;
    }

    set keyId(value) {
        this._keyId = value;
    }

    get authorityKeyId() {
        return this._authorityKeyId;
    }

    set authorityKeyId(value) {
        this._authorityKeyId = value;
    }

    get selfSigned() {
        return this._selfSigned;
    }

    set selfSigned(value) {
        this._selfSigned = Boolean(value);
    }

    get isCA() {
        return this._certType === 'rootCA' || this._certType === 'intermediateCA';
    }

    get acmeSettings() {
        return this._acmeSettings;
    }

    set acmeSettings(value) {
        logger.finest(`Setting acmeSettings to: ${JSON.stringify(value)}`, null, FILENAME, this._name);
        this._acmeSettings = value;
    }

    get paths() {
        return { ...this._paths };
    }

    get sans() {
        return {
            domains: [...this._sans.domains],
            ips: [...this._sans.ips],
            idleDomains: [...this._sans.idleDomains],
            idleIps: [...this._sans.idleIps]
        };
    }

    get autoRenew() {
        return this._config.autoRenew;
    }

    set autoRenew(value) {
        logger.finest(`Setting autoRenew from ${this._config.autoRenew} to ${Boolean(value)}`, null, FILENAME, this._name);
        this._config.autoRenew = Boolean(value);
    }

    get renewDaysBeforeExpiry() {
        return this._config.renewDaysBeforeExpiry;
    }

    set renewDaysBeforeExpiry(value) {
        const days = parseInt(value, 10) || 30;
        logger.finest(`Setting renewDaysBeforeExpiry from ${this._config.renewDaysBeforeExpiry} to ${days}`, null, FILENAME, this._name);
        this._config.renewDaysBeforeExpiry = days;
    }

    get signWithCA() {
        return this._config.signWithCA;
    }

    set signWithCA(value) {
        logger.finest(`Setting signWithCA from ${this._config.signWithCA} to ${Boolean(value)}`, null, FILENAME, this._name);
        this._config.signWithCA = Boolean(value);
    }

    get caFingerprint() {
        return this._config.caFingerprint;
    }

    set caFingerprint(value) {
        logger.finest(`Setting caFingerprint from ${this._config.caFingerprint} to ${value}`, null, FILENAME, this._name);
        this._config.caFingerprint = value;
    }

    get caName() {
        return this._config.caName;
    }

    set caName(value) {
        logger.finest(`Setting caName from ${this._config.caName} to ${value}`, null, FILENAME, this._name);
        this._config.caName = value;
    }

    get deployActions() {
        return [...this._config.deployActions];
    }

    set deployActions(value) {
        logger.finest(`Setting deployActions: ${JSON.stringify(value)}`, null, FILENAME, this._name);
        if (Array.isArray(value)) {
            this._config.deployActions = [...value];
        }
    }

    get config() {
        return {
            autoRenew: this._config.autoRenew,
            renewDaysBeforeExpiry: this._config.renewDaysBeforeExpiry,
            signWithCA: this._config.signWithCA,
            caFingerprint: this._config.caFingerprint,
            caName: this._config.caName,
            deployActions: [...this._config.deployActions]
        };
    }

    set config(value) {
        if (!value || typeof value !== 'object') return;

        logger.finest(`Setting config: ${JSON.stringify(value)}`, null, FILENAME, this._name);

        // Update _config properties individually to maintain structure
        this._config.autoRenew = value.autoRenew !== undefined ? value.autoRenew : this._config.autoRenew;
        this._config.renewDaysBeforeExpiry = value.renewDaysBeforeExpiry || this._config.renewDaysBeforeExpiry;
        this._config.signWithCA = value.signWithCA !== undefined ? value.signWithCA : this._config.signWithCA;
        this._config.caFingerprint = value.caFingerprint || this._config.caFingerprint;
        this._config.caName = value.caName || this._config.caName;
        
        // Handle deployActions consistently
        if (Array.isArray(value.deployActions)) {
            this._config.deployActions = [...value.deployActions];
        }
    }

    get needsPassphrase() {
        return this._needsPassphrase;
    }

    set needsPassphrase(value) {
        logger.finest(`Setting needsPassphrase from ${this._needsPassphrase} to ${Boolean(value)}`, null, FILENAME, this._name);
        this._needsPassphrase = Boolean(value);
        this._passphraseChecked = true;
    }

    get config() {
        return {
            autoRenew: this._config.autoRenew,
            renewDaysBeforeExpiry: this._config.renewDaysBeforeExpiry,
            signWithCA: this._config.signWithCA,
            caFingerprint: this._config.caFingerprint,
            deployActions: [...this._config.deployActions]
        };
    }

    set config(value) {
        if (!value || typeof value !== 'object') return;

        logger.finest(`Setting config: ${JSON.stringify(value)}`, null, FILENAME, this._name);

        this._config = {
            autoRenew: value.autoRenew !== undefined ? value.autoRenew : this._config.autoRenew,
            renewDaysBeforeExpiry: value.renewDaysBeforeExpiry || this._config.renewDaysBeforeExpiry,
            signWithCA: value.signWithCA !== undefined ? value.signWithCA : this._config.signWithCA,
            caFingerprint: value.caFingerprint || this._config.caFingerprint,
            deployActions: Array.isArray(value.deployActions) ? [...value.deployActions] : this._config.deployActions
        };
    }

    get previousVersions() {
        return { ...this._previousVersions };
    }

    get modificationTime() {
        return this._modificationTime;
    }
}

module.exports = Certificate;