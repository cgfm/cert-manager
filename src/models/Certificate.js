/**
 * Certificate Model
 * Represents a certificate in the system with all its properties and methods
 * @module models/Certificate
 * @requires fs - File system module for file operations
 * @requires path - Path module for path operations
 * @requires crypto - Crypto module for generating unique IDs
 * @requires services/logger - Logger service for logging messages
 * @version 0.0.4
 * @license MIT
 * @author Christian Meiners
 * @description This module exports a Certificate class that represents a certificate with various properties and methods.
 * The class provides a standardized structure throughout all methods.
 */

const logger = require('../services/logger');
const fs = require('fs');
const path = require('path'); // Added path module
const crypto = require('crypto'); // Added crypto module

const FILENAME = 'models/Certificate.js';


/**
 * @typedef {Object} SnapshotFilePaths
 * @property {string} [crt] - Path to the certificate file (.crt)
 * @property {string} [key] - Path to the private key file (.key)
 * @property {string} [pem] - Path to the PEM file (cert + key)
 * @property {string} [chain] - Path to the chain file
 * @property {string} [fullchain] - Path to the fullchain file
 * // Add other relevant file types like p12, csr if they are part of a snapshot
 */

/**
 * @typedef {'version' | 'backup'} SnapshotType
 * Represents the type of snapshot.
 */

/**
 * @typedef {'initial-creation' | 'pre-renewal' | 'pre-restore' | 'pre-delete' | 'manual'} SnapshotTrigger
 * Represents the event or reason that triggered the snapshot creation.
 */

/**
 * @typedef {Object} SnapshotEntry
 * @property {string} id - Unique identifier for the snapshot (e.g., timestamp-nanoseconds or crypto-generated).
 * @property {SnapshotType} type - Distinguishes automatic versions from manual backups.
 * @property {string} createdAt - ISO 8601 timestamp of when the snapshot was created.
 * @property {SnapshotTrigger} [trigger] - Context for why it was created.
 * @property {string} [description] - User-provided description, primarily for 'backup' type.
 * @property {number} versionNumber - A sequential number for 'version' types. 'backup' types will be associated with a 'version's number.
 * @property {string} archiveDirectory - Path to the directory where this snapshot's files are stored.
 * @property {string} sourceFingerprint - The fingerprint of the certificate at the time this snapshot was taken.
 * @property {string} [sourceCommonName] - Common Name at the time of snapshot (for quick display).
 * @property {string} [sourceValidTo] - Valid-to date at the time of snapshot (for quick display).
 * @property {SnapshotFilePaths} paths - Paths to the archived certificate files for this snapshot.
 */

class Certificate {
    /**
     * Create a new Certificate instance
     * @param {Object|string} data - Certificate data object or name for a new certificate
     */
    constructor(data = {}) {
        logger.finest(`Creating new certificate instance ${typeof data === 'string' ? data : data.name || 'unnamed'}`, null, FILENAME, data.name);

        // Basic metadata
        this._name = null;
        this._commonName = null;
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
        this._signatureAlgorithm = null;
    
        // Key identifiers
        this._serialNumber = null;     // Serial Number
        this._subjectKeyIdentifier = null;            // Subject Key Identifier
        this._authorityKeyIdentifier = null;   // Authority Key Identifier
        this._selfSigned = false;
        this._isCA = false;
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
            autoRenew: true,
            renewDaysBeforeExpiry: 30,
            signWithCA: false,
            caFingerprint: null,
            caName: null,
            deployActions: []
        };

        /** @type {SnapshotEntry[]} */
        this._snapshots = [];
        this._currentVersionNumber = 0; // Start at 0, first 'version' snapshot will make it 1
        
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
        logger.fine(`Initializing certificate from data: ${data.name || 'unnamed'}`, data, FILENAME, data.name);

        try {
            // Basic properties
            this._name = data.name || null;
            this._commonName = data.commonName || null;
            if (!this._name && this._commonName) this._name = this._commonName;
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
            this._signatureAlgorithm = data.signatureAlgorithm || null;

            // Additional certificate technical details
            if (data.serialNumber) this._serialNumber = data.serialNumber;
            if (data.subjectKeyIdentifier) this._subjectKeyIdentifier = data.subjectKeyIdentifier;                           // Added Subject Key ID
            if (data.authorityKeyIdentifier) this._authorityKeyIdentifier = data.authorityKeyIdentifier; // Added Authority Key ID
            if (data.selfSigned !== undefined) this._selfSigned = data.selfSigned;
            if (data.isCA !== undefined) this._isCA = data.isCA;
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
                autoRenew: true,
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

            if (Array.isArray(data._snapshots)) {
                // Basic validation could be added here if desired, e.g., checking for required fields
                this._snapshots = data._snapshots.map(s => ({ ...s })); // Shallow copy
            } else {
                this._snapshots = [];
            }
            this._currentVersionNumber = typeof data._currentVersionNumber === 'number' ? data._currentVersionNumber : 0;

            // Modification time
            this._modificationTime = data.modificationTime || Date.now();

            // Add domain from name if we have a name but no domains
            if (this._commonName && this._sans.domains.length === 0) {
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
    updateConfig(data, options = {}) {
        const preserveConfig = options.preserveConfig !== false;
        logger.fine(`Updating certificate data for ${this._name || data.name}`, data, FILENAME);

        // Update basic properties
        if (data.fingerprint) this._fingerprint = data.fingerprint;
        if (data.name) this._name = data.name;
        if (data.commonName) this._commonName = data.commonName;
        if (!this._name && this._commonName) this._name = this._commonName;
        if (data.subject) this._subject = data.subject;
        if (data.issuer) this._issuer = data.issuer;
        if (data.validFrom) this._validFrom = data.validFrom;
        if (data.validTo) this._validTo = data.validTo;
        if (data.description) this._description = data.description;

        // Update technical details
        if (data.certType) this._certType = data.certType;
        if (data.keyType) this._keyType = data.keyType;
        if (data.keySize) this._keySize = data.keySize;
        if (data.signatureAlgorithm) this._signatureAlgorithm = data.signatureAlgorithm;

        // Additional certificate technical details
        if (data.serialNumber) this._serialNumber = data.serialNumber;
        if (data.subjectKeyIdentifier) this._subjectKeyIdentifier = data.subjectKeyIdentifier;
        if (data.authorityKeyIdentifier) this._authorityKeyIdentifier = data.authorityKeyIdentifier;
        if (data.selfSigned !== undefined) this._selfSigned = data.selfSigned;
        if (data.isCA !== undefined) this._isCA = data.isCA;
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
                    autoRenew: true,
                    renewDaysBeforeExpiry: 30,
                    signWithCA: false,
                    caFingerprint: null,
                    caName: null,
                    deployActions: existingConfig.deployActions
                };
                logger.fine(`Reset certificate config to defaults while preserving deployActions`, null, FILENAME, this._name);
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
            if (!this._commonName) {
                return;
            }
            
            const name = this._commonName.toLowerCase();
            
            // Don't add if it's already in the domains list
            if (this._sans.domains.includes(name)) {
                logger.finest(`Certificate name ${this._name} already exists in domains list`, null, FILENAME, this._name);
                return;
            }
            
            // Check if name is a valid domain
            if (this._isValidDomain(name)) {
                this._sans.domains.push(name);
                logger.fine(`Added certificate name as domain: ${name}`, null, FILENAME, this._name);
            } else {
                logger.fine(`Certificate name '${name}' does not appear to be a valid domain, not adding to domains list`, null, FILENAME, this._name);
            }
        } catch (error) {
            logger.error(`Error adding domain from name: ${error.message}`, error, FILENAME, this._name);
        }
    }

    /**
     * Validate a domain name
     * @param {string} domain - Domain to validate
     * @returns {boolean} True if domain is valid
     * @private
     */
    _isValidDomain(domain) {
        if (!domain || typeof domain !== 'string') {
            return false;
        }
        
        // Trim the domain
        const trimmedDomain = domain.trim();
        
        // Check for empty string
        if (trimmedDomain === '') {
            return false;
        }
        
        // Domain regex pattern - supports standard domains and wildcards
        const domainRegex = /^(\*\.)?((([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9]))$/;
        
        // Basic validation check
        if (!domainRegex.test(trimmedDomain)) {
            return false;
        }
        
        // Check domain label length and format
        const labels = trimmedDomain.split('.');
        
        // Domain must have at least 2 labels (example.com)
        if (labels.length < 2) {
            return false;
        }
        
        // Each label must be 1-63 characters
        for (let i = 0; i < labels.length; i++) {
            const label = labels[i];
            
            // First label can be a wildcard (exactly "*")
            if (i === 0 && label === '*') {
                continue;
            }
            
            // Check length of each label
            if (label.length < 1 || label.length > 63) {
                return false;
            }
        }
        
        return true;
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
                commonName: this.commonName,
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
                signatureAlgorithm: this._signatureAlgorithm,
                originalEncoding: this._originalEncoding,
                // Key identifiers
                serialNumber: this._serialNumber,
                subjectKeyIdentifier: this._subjectKeyIdentifier,                 // Added Subject Key ID
                authorityKeyIdentifier: this._authorityKeyIdentifier, // Added Authority Key ID
                selfSigned: this._selfSigned,
                isRootCA: this._isRootCA,
                isCA: this._isCA,
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

                snapshots: this._snapshots.map(s => ({ ...s })), // Shallow copy for serialization
                currentVersionNumber: this._currentVersionNumber,

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
     * Creates a snapshot of the current certificate state (files and metadata).
     * @param {SnapshotType} type - The type of snapshot ('version' or 'backup').
     * @param {SnapshotTrigger} trigger - The reason for creating the snapshot.
     * @param {string} [description=''] - A user-provided description, mainly for 'backup' type.
     * @param {string} archiveBaseDir - The base directory where all archives are stored (e.g., config/archive).
     * @returns {Promise<SnapshotEntry|null>} The created SnapshotEntry object or null on failure.
     */
    async createSnapshot(type, trigger, description = '', archiveBaseDir) {
        logger.info(`Creating snapshot for certificate '${this.name}': type='${type}', trigger='${trigger}'`, null, FILENAME, this.name);

        if (!this.name) {
            logger.error('Cannot create snapshot: Certificate name is missing.', null, FILENAME);
            return null;
        }
        if (!this.fingerprint) {
            logger.warn(`Creating snapshot for certificate '${this.name}' which has no fingerprint yet. This might be for an initial creation.`, null, FILENAME, this.name);
            // Allow proceeding, but sourceFingerprint will be null or a placeholder
        }

        const snapshotId = crypto.randomBytes(16).toString('hex'); // Generates a 32-character hex string
        const createdAt = new Date().toISOString();
        let versionNumberToAssign = this._currentVersionNumber;

        if (type === 'version') {
            this._currentVersionNumber += 1;
            versionNumberToAssign = this._currentVersionNumber;
        }
        // For 'backup' type, it uses the current _currentVersionNumber

        // Sanitize certificate name for use in directory path
        const sanitizedCertName = this.name.replace(/[^\w.-]/g, '_');
        const certArchiveDir = path.join(archiveBaseDir, sanitizedCertName);
        const snapshotSpecificDir = path.join(certArchiveDir, 'snapshots', snapshotId);

        try {
            // Ensure certificate-specific archive directory and snapshots subdirectory exist
            await fs.promises.mkdir(snapshotSpecificDir, { recursive: true });
            logger.debug(`Ensured snapshot directory exists: ${snapshotSpecificDir}`, null, FILENAME, this.name);

            const snapshotFilePaths = {};
            const filesToCopy = [];

            // Identify current live files to copy
            for (const [fileKey, livePath] of Object.entries(this._paths)) {
                if (livePath && typeof livePath === 'string' && fs.existsSync(livePath)) {
                    const destFileName = path.basename(livePath);
                    const destPath = path.join(snapshotSpecificDir, destFileName);
                    filesToCopy.push({ src: livePath, dest: destPath });
                    snapshotFilePaths[fileKey] = destPath; // Store the path within the snapshot dir
                } else {
                    logger.fine(`Skipping snapshot for path key '${fileKey}': path '${livePath}' does not exist or is invalid.`, null, FILENAME, this.name);
                }
            }

            if (filesToCopy.length === 0) {
                logger.warn(`No valid files found to copy for snapshot ${snapshotId} of certificate '${this.name}'. Snapshot will be metadata-only.`, null, FILENAME, this.name);
            }

            // Copy files
            for (const file of filesToCopy) {
                await fs.promises.copyFile(file.src, file.dest);
                logger.fine(`Copied for snapshot: ${file.src} -> ${file.dest}`, null, FILENAME, this.name);
            }

            /** @type {SnapshotEntry} */
            const snapshotEntry = {
                id: snapshotId,
                type: type,
                createdAt: createdAt,
                trigger: trigger,
                description: description || (type === 'backup' ? `Manual backup created on ${createdAt.split('T')[0]}` : ''),
                versionNumber: versionNumberToAssign,
                archiveDirectory: snapshotSpecificDir, // Path to this specific snapshot's files
                sourceFingerprint: this.fingerprint || 'N/A', // Use current fingerprint
                sourceCommonName: this.commonName || this.name,
                sourceValidTo: this.validTo,
                paths: snapshotFilePaths,
            };

            // Save snapshot-info.json within the snapshot's directory
            const snapshotInfoPath = path.join(snapshotSpecificDir, 'snapshot-info.json');
            await fs.promises.writeFile(snapshotInfoPath, JSON.stringify(snapshotEntry, null, 2));
            logger.debug(`Saved snapshot metadata to ${snapshotInfoPath}`, null, FILENAME, this.name);

            this._snapshots.push(snapshotEntry);
            this._modificationTime = Date.now(); // Update modification time of the certificate

            logger.info(`Successfully created snapshot ${snapshotId} (version ${versionNumberToAssign}) for certificate '${this.name}'`, null, FILENAME, this.name);
            return snapshotEntry;

        } catch (error) {
            logger.error(`Error creating snapshot ${snapshotId} for certificate '${this.name}':`, error, FILENAME, this.name);
            // Attempt to clean up partially created snapshot directory if error occurs
            try {
                if (fs.existsSync(snapshotSpecificDir)) {
                    await fs.promises.rm(snapshotSpecificDir, { recursive: true, force: true });
                    logger.info(`Cleaned up partially created snapshot directory: ${snapshotSpecificDir}`, null, FILENAME, this.name);
                }
            } catch (cleanupError) {
                logger.error(`Error cleaning up snapshot directory '${snapshotSpecificDir}':`, cleanupError, FILENAME, this.name);
            }
            return null;
        }
    }

    /**
     * Get snapshots for this certificate, optionally filtered by type and sorted.
     * @param {SnapshotType | 'all'} [snapshotType='all'] - Type of snapshots to retrieve ('backup', 'version', or 'all').
     * @param {'asc' | 'desc'} [sortByDate='desc'] - Sort order by creation date.
     * @returns {SnapshotEntry[]}
     */
    getSnapshots(snapshotType = 'all', sortByDate = 'desc') {
        let filteredSnapshots;

        if (snapshotType === 'backup') {
            filteredSnapshots = this._snapshots.filter(s => s.type === 'backup');
        } else if (snapshotType === 'version') {
            filteredSnapshots = this._snapshots.filter(s => s.type === 'version');
        } else { // 'all' or any other value
            filteredSnapshots = [...this._snapshots];
        }

        const sortedSnapshots = filteredSnapshots.sort((a, b) => {
            const dateA = new Date(a.createdAt).getTime();
            const dateB = new Date(b.createdAt).getTime();
            return sortByDate === 'desc' ? dateB - dateA : dateA - dateB;
        });
        return sortedSnapshots;
    }

    /**
     * Restores the certificate's live files from a given snapshot.
     * Note: This method only copies files. The CertificateManager is responsible for
     * creating a pre-restore snapshot and then calling refreshPropertiesFromFiles() on this instance.
     * @param {string} snapshotId - The ID of the snapshot to restore from.
     * @returns {Promise<boolean>} True if files were successfully copied, false otherwise.
     */
    async restoreFromSnapshot(snapshotId) {
        logger.info(`Attempting to restore certificate '${this.name}' from snapshot ID '${snapshotId}'`, null, FILENAME, this.name);

        const snapshotEntry = this._snapshots.find(s => s.id === snapshotId);
        if (!snapshotEntry) {
            logger.error(`Snapshot ID '${snapshotId}' not found for certificate '${this.name}'. Cannot restore.`, null, FILENAME, this.name);
            return false;
        }

        if (!snapshotEntry.archiveDirectory || !fs.existsSync(snapshotEntry.archiveDirectory)) {
            logger.error(`Archive directory for snapshot '${snapshotId}' ('${snapshotEntry.archiveDirectory}') does not exist. Cannot restore.`, null, FILENAME, this.name);
            return false;
        }
        if (!snapshotEntry.paths || Object.keys(snapshotEntry.paths).length === 0) {
            logger.warn(`Snapshot ID '${snapshotId}' for certificate '${this.name}' has no file paths defined. Nothing to restore.`, null, FILENAME, this.name);
            return false; // Or true if "nothing to do" is considered success
        }

        try {
            // Ensure target directories for live files exist
            for (const livePathKey of Object.keys(this._paths)) {
                const livePath = this._paths[livePathKey];
                if (livePath) {
                    const liveDir = path.dirname(livePath);
                    if (!fs.existsSync(liveDir)) {
                        await fs.promises.mkdir(liveDir, { recursive: true });
                        logger.fine(`Ensured live directory exists: ${liveDir}`, null, FILENAME, this.name);
                    }
                }
            }

            let filesRestoredCount = 0;
            for (const [snapshotFileKey, archivedPath] of Object.entries(snapshotEntry.paths)) {
                const livePath = this._paths[snapshotFileKey]; // Get the corresponding live path key

                if (livePath && fs.existsSync(archivedPath)) {
                    await fs.promises.copyFile(archivedPath, livePath);
                    logger.fine(`Restored: ${archivedPath} -> ${livePath}`, null, FILENAME, this.name);
                    filesRestoredCount++;
                } else {
                    if (!livePath) {
                        logger.warn(`No corresponding live path for snapshot file key '${snapshotFileKey}' in certificate '${this.name}'. Skipping restore for this file from snapshot '${snapshotId}'.`, null, FILENAME, this.name);
                    }
                    if (livePath && !fs.existsSync(archivedPath)) {
                        logger.warn(`Archived file '${archivedPath}' for snapshot '${snapshotId}' does not exist. Skipping restore for this file.`, null, FILENAME, this.name);
                    }
                }
            }

            if (filesRestoredCount === 0) {
                logger.warn(`No files were actually restored for certificate '${this.name}' from snapshot '${snapshotId}'. Check live path configuration and snapshot contents.`, null, FILENAME, this.name);
                // Depending on strictness, you might return false here.
                // For now, if no errors occurred, we'll say the copy operation itself was "successful".
            }

            this._modificationTime = Date.now();
            logger.info(`File copy phase for restore of certificate '${this.name}' from snapshot '${snapshotId}' completed. Certificate object requires property refresh.`, null, FILENAME, this.name);
            return true;
        } catch (error) {
            logger.error(`Error during file copy phase for restoring certificate '${this.name}' from snapshot '${snapshotId}':`, error, FILENAME, this.name);
            return false;
        }
    }


    /**
     * Refreshes the certificate's internal properties by parsing its live files.
     * This method should be called after certificate files are created, renewed, or restored.
     * @param {object} cryptoServiceService - An instance of the cryptoService service capable of parsing certificate files.
     * @returns {Promise<void>}
     * @throws {Error} if parsing or updating fails, or if essential services/files are missing.
     */
    async refreshPropertiesFromFiles(cryptoServiceService) {
        logger.info(`Refreshing properties from files for certificate '${this.name}'...`, null, FILENAME, this.name);

        if (!cryptoServiceService || typeof cryptoServiceService.getCertificateInfo !== 'function') {
            logger.error(`cryptoService service is not available or 'getCertificateInfo' method is missing. Cannot refresh properties for '${this.name}'.`, null, FILENAME, this.name);
            throw new Error('cryptoService service unavailable for refreshing certificate properties.');
        }

        // Determine the primary certificate file to parse.
        // Prioritize .pem, then .crt. Add other fallbacks if necessary.
        let primaryCertPath = null;
        if (this._paths.pemPath && fs.existsSync(this._paths.pemPath)) {
            primaryCertPath = this._paths.pemPath;
        } else if (this._paths.crtPath && fs.existsSync(this._paths.crtPath)) {
            primaryCertPath = this._paths.crtPath;
        }
        // Add more specific checks if needed, e.g., for ACME certs that might only have .cer
        // else if (this._paths.cerPath && fs.existsSync(this._paths.cerPath)) {
        //     primaryCertPath = this._paths.cerPath;
        // }


        if (!primaryCertPath) {
            logger.error(`No primary certificate file (pem, crt) found in paths for certificate '${this.name}'. Cannot refresh properties. Paths: ${JSON.stringify(this._paths)}`, null, FILENAME, this.name);
            throw new Error(`No primary certificate file found for '${this.name}'.`);
        }

        logger.debug(`Using primary certificate file for refresh: ${primaryCertPath}`, null, FILENAME, this.name);

        try {
            const certDetails = await cryptoServiceService.getCertificateInfo(primaryCertPath);

            if (!certDetails || typeof certDetails !== 'object') {
                logger.error(`Failed to retrieve valid details from cryptoService service for '${primaryCertPath}'. Received: ${JSON.stringify(certDetails)}`, null, FILENAME, this.name);
                throw new Error(`Invalid details received from cryptoService service for '${this.name}'.`);
            }

            logger.fine(`Successfully parsed details for '${this.name}' from '${primaryCertPath}'. Updating properties.`, certDetails, FILENAME, this.name);

            // Update internal properties based on parsed details
            // It's safer to check for existence of each property in certDetails
            // before assigning to avoid 'undefined' values if the parser omits some fields.

            this._fingerprint = certDetails.fingerprint || this._fingerprint;
            this._commonName = certDetails.commonName || this._commonName;
            // If name was derived from commonName and commonName changed, update name
            if (this._name === (certDetails.previousCommonNameForComparison || null) || !this._name) { // You might need to pass old CN if logic is complex
                this._name = certDetails.commonName || this._name;
            }
            this._subject = certDetails.subject || this._subject;
            this._issuer = certDetails.issuer || this._issuer;
            this._validFrom = certDetails.validFrom || this._validFrom;
            this._validTo = certDetails.validTo || this._validTo;

            this._keyType = certDetails.keyType || this._keyType;
            this._keySize = certDetails.keySize || this._keySize;
            this._signatureAlgorithm = certDetails.signatureAlgorithm || certDetails.signatureAlgorithm || this._signatureAlgorithm; // Allow for different naming
            this._originalEncoding = certDetails.originalEncoding || this._originalEncoding; // Assuming cryptoServiceService provides this

            this._serialNumber = certDetails.serialNumber || this._serialNumber;
            this._subjectKeyIdentifier = certDetails.subjectKeyIdentifier || certDetails.subjectKeyIdentifier || this._subjectKeyIdentifier;
            this._authorityKeyIdentifier = certDetails.authorityKeyIdentifier || certDetails.authorityKeyIdentifier || this._authorityKeyIdentifier;

            this._selfSigned = certDetails.selfSigned !== undefined ? certDetails.selfSigned : this._selfSigned;
            this._isCA = certDetails.isCA !== undefined ? certDetails.isCA : this._isCA;
            this._isRootCA = certDetails.isRootCA !== undefined ? certDetails.isRootCA : this._isRootCA; // Assuming cryptoServiceService can determine this
            this._pathLenConstraint = certDetails.pathLenConstraint !== undefined ? certDetails.pathLenConstraint : this._pathLenConstraint;


            if (certDetails.sans && typeof certDetails.sans === 'object') {
                this._sans.domains = Array.isArray(certDetails.sans.domains) ? certDetails.sans.domains.map(d => d.trim().toLowerCase()) : this._sans.domains;
                this._sans.ips = Array.isArray(certDetails.sans.ips) ? certDetails.sans.ips.map(ip => ip.trim()) : this._sans.ips;
                // Note: Idle domains/IPs are usually managed by user input, not directly from cert details,
                // unless your cryptoServiceService specifically extracts them from an extension or CSR.
                // If not, they should remain as they are.
            }

            // Passphrase status might need re-evaluation if the key file changed,
            // but `needsPassphrase` is often a config, and `hasPassphrase` is about storage.
            // For now, we assume these are not directly changed by parsing the cert itself.
            // If `cryptoServiceService.getCertificateInfo` also checks if the key is encrypted, update `_needsPassphrase`.
            if (certDetails.isKeyEncrypted !== undefined) {
                this._needsPassphrase = certDetails.isKeyEncrypted;
            }


            // Cert type might be derivable by cryptoServiceService (e.g. based on extensions)
            // For now, we assume it's mostly set by config or initial creation logic.
            // If `certDetails.certType` is provided by your service, you can update it:
            // this._certType = certDetails.certType || this._certType;

            this._modificationTime = Date.now();
            logger.info(`Properties for certificate '${this.name}' successfully refreshed from file. New fingerprint: ${this._fingerprint}`, null, FILENAME, this.name);

        } catch (error) {
            logger.error(`Error refreshing properties for certificate '${this.name}' from file '${primaryCertPath}':`, error, FILENAME, this.name);
            throw error; // Re-throw the error so the calling method can handle it
        }
    }

    /**
     * Deletes a specific snapshot (metadata and archived files).
     * @param {string} snapshotId - The ID of the snapshot to delete.
     * @returns {Promise<boolean>} True if deletion was successful, false otherwise.
     */
    async deleteSnapshot(snapshotId) {
        logger.info(`Attempting to delete snapshot ID '${snapshotId}' for certificate '${this.name}'`, null, FILENAME, this.name);

        const snapshotIndex = this._snapshots.findIndex(s => s.id === snapshotId);
        if (snapshotIndex === -1) {
            logger.warn(`Snapshot ID '${snapshotId}' not found for certificate '${this.name}'. Cannot delete.`, null, FILENAME, this.name);
            return false;
        }

        const snapshotEntry = this._snapshots[snapshotIndex];

        try {
            // Delete the archive directory from the filesystem
            if (snapshotEntry.archiveDirectory && fs.existsSync(snapshotEntry.archiveDirectory)) {
                await fs.promises.rm(snapshotEntry.archiveDirectory, { recursive: true, force: true });
                logger.debug(`Successfully deleted snapshot archive directory: ${snapshotEntry.archiveDirectory}`, null, FILENAME, this.name);
            } else {
                logger.warn(`Snapshot archive directory '${snapshotEntry.archiveDirectory}' not found or not specified for snapshot '${snapshotId}'. Skipping directory deletion.`, null, FILENAME, this.name);
            }

            // Remove the snapshot entry from the array
            this._snapshots.splice(snapshotIndex, 1);
            this._modificationTime = Date.now();

            logger.info(`Successfully deleted snapshot ID '${snapshotId}' (metadata and files) for certificate '${this.name}'`, null, FILENAME, this.name);
            return true;
        } catch (error) {
            logger.error(`Error deleting snapshot ID '${snapshotId}' for certificate '${this.name}':`, error, FILENAME, this.name);
            return false;
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
            const result = expiryDate >= now && expiryDate <= warningThreshold;

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
            logger.debug(`Finding signing CA for certificate ${this._name} (${this._fingerprint}) with AKI: ${this._authorityKeyIdentifier}, Issuer: ${this._issuer}`, null, FILENAME, this._name);

            if (!this._authorityKeyIdentifier && !this._issuer) { // Adjusted condition slightly
                logger.fine(`No Authority Key ID or Issuer available for this certificate, can't reliably find signing CA by these methods.`, null, FILENAME, this._name);
                // Still allow fallback to stored caFingerprint
            }

            const allCerts = certManager.getAllCertificates(); // This returns an array of JSON objects
            logger.debug(`Total certificates from certManager: ${allCerts.length}`, null, FILENAME, this._name);

            const caByKeyId = allCerts.find(cert => { // cert here is a JSON object
                const isMatch = cert.isCA &&
                                cert.subjectKeyIdentifier && // Use public property
                                cert.subjectKeyIdentifier.toUpperCase() === (this._authorityKeyIdentifier ? this._authorityKeyIdentifier.toUpperCase() : '');
                if (cert.isCA) { // Log details for all CAs being checked
                    // Use public properties for logging from the JSON object
                    logger.debug(`Checking CA by Key ID: Name='${cert.name}', Fingerprint='${cert.fingerprint}', isCA='${cert.isCA}', SKI='${cert.subjectKeyIdentifier}', MatchAttempt=${isMatch}`, null, FILENAME, this._name);
                }
                return isMatch;
            });

            if (caByKeyId) {
                // caByKeyId is a JSON object here. We need its fingerprint and name.
                logger.fine(`Found signing CA by Key ID: ${caByKeyId.name} (${caByKeyId.fingerprint})`, null, FILENAME, this._name);
                this._config.caFingerprint = caByKeyId.fingerprint; // Correctly use fingerprint from JSON
                this._config.caName = caByKeyId.name;         // Correctly use name from JSON
                // To return a Certificate instance, we'd need to get it from certManager again,
                // or ensure findSigningCA is robust enough if it only needs fingerprint/name.
                // For now, let's assume setting fingerprint/name in config is the main goal here
                // and returning the JSON object might be acceptable if the caller handles it.
                // If a full Certificate instance is needed, it should be fetched:
                // return certManager.getCertificate(caByKeyId.fingerprint);
                return certManager.getCertificate(caByKeyId.fingerprint); // Fetch the actual Certificate instance
            }

            if (this._issuer) {
                const caByIssuer = allCerts.find(cert => { // cert here is a JSON object
                    const isMatch = cert.isCA &&
                                    cert.subject && // Use public property
                                    cert.subject === this._issuer;
                    if (cert.isCA) { // Log details for all CAs being checked
                        // Use public properties for logging from the JSON object
                        logger.debug(`Checking CA by Issuer: Name='${cert.name}', Fingerprint='${cert.fingerprint}', isCA='${cert.isCA}', Subject='${cert.subject}', MatchAttempt=${isMatch}`, null, FILENAME, this._name);
                    }
                    return isMatch;
                });

                if (caByIssuer) {
                    // caByIssuer is a JSON object here.
                    logger.fine(`Found signing CA by issuer subject: ${caByIssuer.name} (${caByIssuer.fingerprint})`, null, FILENAME, this._name);
                    this._config.caFingerprint = caByIssuer.fingerprint;
                    this._config.caName = caByIssuer.name;
                    // return caByIssuer; // This would return the JSON object
                    return certManager.getCertificate(caByIssuer.fingerprint); // Fetch the actual Certificate instance
                }
            }

            if (this._config?.caFingerprint) {
                const caByFingerprint = certManager.getCertificate(this._config.caFingerprint); // This returns a Certificate instance
                if (caByFingerprint && caByFingerprint.isCA) { // Access isCA getter on the instance
                    logger.fine(`Found signing CA by stored fingerprint: ${caByFingerprint.name} (Fingerprint: ${caByFingerprint.fingerprint})`, null, FILENAME, this._name);
                    return caByFingerprint;
                } else {
                    logger.debug(`Stored CA fingerprint ${this._config.caFingerprint} did not resolve to a valid CA.`, null, FILENAME, this._name);
                }
            }

            logger.debug(`No signing CA found for certificate ${this._name} after all checks.`, null, FILENAME, this._name);
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
    }

    get commonName() {
        return this._commonName;
    }

    set commonName(value) {
        logger.finest(`Setting commonName from '${this._commonName}' to '${value}'`, null, FILENAME, this._name);
        this._commonName = value;
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

    get signatureAlgorithm() {
        return this._signatureAlgorithm;
    }

    set signatureAlgorithm(value) {
        logger.finest(`Setting signatureAlgorithm from '${this._signatureAlgorithm}' to '${value}'`, null, FILENAME, this._name);
        this._signatureAlgorithm = value;
    }

    get subjectKeyIdentifier() {
        return this._subjectKeyIdentifier;
    }

    set subjectKeyIdentifier(value) {
        this._subjectKeyIdentifier = value;
    }

    get authorityKeyIdentifier() {
        return this._authorityKeyIdentifier;
    }

    set authorityKeyIdentifier(value) {
        this._authorityKeyIdentifier = value;
    }

    get selfSigned() {
        return this._selfSigned;
    }

    set selfSigned(value) {
        this._selfSigned = Boolean(value);
    }

    get isCA() {
        return this._isCA;
    }

    get isRootCA() {
        return this._isRootCA;
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

    get modificationTime() {
        return this._modificationTime;
    }
}

module.exports = Certificate;