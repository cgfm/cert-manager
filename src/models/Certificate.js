/**
 * Certificate Model
 * Represents a certificate in the system with all its properties and methods
 * @module models/Certificate
 * @requires fs - File system module for file operations
 * @requires services/logger - Logger service for logging messages
 * @version 0.0.2
 * @license MIT
 * @author Christian Meiners
 * @description This module exports a Certificate class that represents a certificate with various properties and methods for managing it.
 * The class provides methods to create, renew, convert, and manage certificates, as well as to check their status and execute deployment actions.
 */

const logger = require('../services/logger');

class Certificate {
    /**
     * Create a new Certificate instance
     * @param {Object|string} data - Certificate data object or name for a new certificate
     */
    constructor(data = {}) {
        // Default values
        this._name = null;
        this._fingerprint = null;
        this._subject = null; 
        this._issuer = null;
        this._validFrom = null;
        this._validTo = null;
        this._certType = 'standard';
        this._acmeSettings = null;
        this._pathes = {
            crtPath: null,
            pemPath: null,
            p12Path: null,
            csrPath: null,
            extPath: null,
            keyPath: null
        };
        this._san = {
            domains: [],
            ips: []
        };
        this._config = {
            autoRenew: false,
            renewDaysBeforeExpiry: 30,
            signWithCA: false,
            caFingerprint: null,
            deployActions: []
        };
        this._previousVersions = {};
        this._modificationTime = Date.now();

        // If data is a string, use it as name for new certificate
        if (typeof data === 'string') {
            this._name = data;
            this._addDomainFromName();
            return;
        }

        // Initialize from data object
        if (data) {
            this._fromData(data);
        }
    }

    /**
     * Convert certificate object to JSON representation
     * @returns {Object} JSON representation of the certificate
     */
    toJSON() {
        return {
            name: this._name,
            fingerprint: this._fingerprint,
            subject: this._subject,
            issuer: this._issuer,
            validFrom: this._validFrom,
            validTo: this._validTo,
            certType: this._certType,
            "acme-settings": this._acmeSettings,
            pathes: this._pathes,
            san: this._san,
            config: this._config,
            previousVersions: this._previousVersions,
            modificationTime: this._modificationTime
        };
    }

    /**
     * Initialize the certificate from data object
     * @private
     * @param {Object} data - Certificate data
     */
    _fromData(data) {
        // Basic properties
        this._name = data.name || null;
        this._fingerprint = data.fingerprint || null;
        this._subject = data.subject || null;
        this._issuer = data.issuer || null;
        this._validFrom = data.validFrom || null;
        this._validTo = data.validTo || null;
        this._certType = data.certType || 'standard';
        
        // ACME settings
        this._acmeSettings = data["acme-settings"] || null;
        
        // File paths
        if (data.pathes) {
            this._pathes = {
                crtPath: data.pathes.crtpath || data.pathes.crtPath || null,
                pemPath: data.pathes.pempath || data.pathes.pemPath || null,
                p12Path: data.pathes.p12path || data.pathes.p12Path || null,
                csrPath: data.pathes.csrPath || null,
                extPath: data.pathes.extPath || null,
                keyPath: data.pathes.keyPath || null
            };
        }
        
        // SAN entries
        if (data.san) {
            this._san = {
                domains: Array.isArray(data.san.domains) ? [...data.san.domains] : [],
                ips: Array.isArray(data.san.ips) ? [...data.san.ips] : []
            };
        } else if (data.domains) {
            // Handle the simplified format where domains is at the top level
            this._san.domains = Array.isArray(data.domains) ? [...data.domains] : [];
        }
        
        // Configuration
        if (data.config) {
            this._config = {
                autoRenew: data.config.autoRenew !== undefined ? data.config.autoRenew : false,
                renewDaysBeforeExpiry: data.config.renewDaysBeforeExpiry || 30,
                signWithCA: data.config.signWithCA || false,
                caFingerprint: data.config.caFingerprint || null,
                deployActions: Array.isArray(data.config.deployActions) ? [...data.config.deployActions] : []
            };
        }
        
        // Previous versions
        if (data.previousVersions && typeof data.previousVersions === 'object') {
            this._previousVersions = { ...data.previousVersions };
        }
        
        // Modification time
        this._modificationTime = data.modificationTime || Date.now();
        
        // If we have a name but no domains, add name as a domain
        if (this._name && (!this._san.domains || this._san.domains.length === 0)) {
            this._addDomainFromName();
        }
    }

    /**
     * Add the certificate name as a domain if it looks like a valid domain
     * @private
     */
    _addDomainFromName() {
        if (this._name && this._name.includes('.') && !this._san.domains.includes(this._name)) {
            this._san.domains.push(this._name);
        }
    }

    /**
     * Create file paths for a certificate based on name and directory
     * @param {string} certsDir - Base directory for certificates
     */
    generatePaths(certsDir) {
        if (!this._name) {
            throw new Error('Certificate name is required to generate paths');
        }

        const baseName = this._name.replace(/[^\w.-]/g, '_');
        const fs = require('fs');
        
        // Define potential paths based on naming convention
        const potentialPaths = {
            crtPath: `${certsDir}/${baseName}.crt`,
            pemPath: `${certsDir}/${baseName}.pem`,
            p12Path: `${certsDir}/${baseName}.p12`,
            pfxPath: `${certsDir}/${baseName}.pfx`,
            keyPath: `${certsDir}/${baseName}.key`,
            csrPath: `${certsDir}/${baseName}.csr`,
            extPath: `${certsDir}/${baseName}.ext`,
            chainPath: `${certsDir}/${baseName}-chain.pem`,
            fullchainPath: `${certsDir}/${baseName}-fullchain.pem`,
            p7bPath: `${certsDir}/${baseName}.p7b`,
            derPath: `${certsDir}/${baseName}.der`
        };
        
        // Initialize paths object with only paths that exist
        this._pathes = {};
        
        // Check each potential path and only add to _pathes if file exists
        Object.entries(potentialPaths).forEach(([key, path]) => {
            if (fs.existsSync(path)) {
                this._pathes[key] = path;
            }
        });
        
        // If this is a new certificate (no existing files),
        // add the essential paths for creation
        if (Object.keys(this._pathes).length === 0) {
            this._pathes.crtPath = potentialPaths.crtPath;
            this._pathes.keyPath = potentialPaths.keyPath;
            this._pathes.csrPath = potentialPaths.csrPath;
            this._pathes.extPath = potentialPaths.extPath;
        }
        
        return this._pathes;
    }

    /**
     * Add a new version of the certificate to previous versions
     * @param {string} fingerprint - Old certificate fingerprint
     * @param {Object} versionData - Certificate version data
     */
    addPreviousVersion(fingerprint, versionData) {
        if (!fingerprint || !versionData) {
            return;
        }
        
        this._previousVersions[fingerprint] = versionData;
        this._modificationTime = Date.now();
    }

    /**
     * Clone this certificate with a new fingerprint
     * @param {string} newFingerprint - New fingerprint for the cloned certificate
     * @returns {Certificate} New Certificate instance
     */
    cloneWithNewFingerprint(newFingerprint) {
        // Store the current certificate data as a previous version
        const previousVersion = {
            name: this._name,
            fingerprint: this._fingerprint,
            pathes: {
                crtpath: this._pathes.crtPath,
                pempath: this._pathes.pemPath,
                p12path: this._pathes.p12Path,
                csrPath: this._pathes.csrPath,
                extPath: this._pathes.extPath,
                keyPath: this._pathes.keyPath
            },
            validFrom: this._validFrom,
            validTo: this._validTo,
            certType: this._certType,
            san: {
                domains: [...this._san.domains],
                ips: [...this._san.ips]
            }
        };
        
        // Create a clone with new data
        const clone = new Certificate(this.toJSON());
        
        // Update the fingerprint
        clone._fingerprint = newFingerprint;
        
        // Add the previous version
        if (this._fingerprint) {
            clone.addPreviousVersion(this._fingerprint, previousVersion);
        }
        
        return clone;
    }

    // Getters and setters for properties

    get name() {
        return this._name;
    }

    set name(value) {
        this._name = value;
        this._addDomainFromName();
    }

    get fingerprint() {
        return this._fingerprint;
    }

    set fingerprint(value) {
        this._fingerprint = value;
    }

    get subject() {
        return this._subject;
    }
    
    set subject(value) {
        this._subject = value;
    }
    
    get issuer() {
        return this._issuer;
    }
    
    set issuer(value) {
        this._issuer = value;
    }
    
    get validFrom() {
        return this._validFrom;
    }
    
    set validFrom(value) {
        this._validFrom = value;
    }
    
    get validTo() {
        return this._validTo;
    }
    
    set validTo(value) {
        this._validTo = value;
    }
    
    get certType() {
        return this._certType;
    }
    
    set certType(value) {
        if (['standard', 'rootCA', 'intermediateCA', 'acme'].includes(value)) {
            this._certType = value;
        } else {
            throw new Error(`Invalid certificate type: ${value}`);
        }
    }
    
    get acmeSettings() {
        return this._acmeSettings;
    }
    
    set acmeSettings(value) {
        this._acmeSettings = value;
    }
    
    get paths() {
        return this._pathes || {};
    }
    
    set paths(value) {
        if (value && typeof value === 'object') {
            this._pathes = {
                crtPath: value.crtPath || value.crtpath || this._pathes.crtPath,
                pemPath: value.pemPath || value.pempath || this._pathes.pemPath,
                p12Path: value.p12Path || value.p12path || this._pathes.p12Path,
                csrPath: value.csrPath || this._pathes.csrPath,
                extPath: value.extPath || this._pathes.extPath,
                keyPath: value.keyPath || this._pathes.keyPath
            };
        }
    }
    
    get domains() {
        return [...this._san.domains];
    }
    
    set domains(value) {
        if (Array.isArray(value)) {
            this._san.domains = [...value];
        }
    }
    
    get ips() {
        return [...this._san.ips];
    }
    
    set ips(value) {
        if (Array.isArray(value)) {
            this._san.ips = [...value];
        }
    }
    
    get autoRenew() {
        return this._config.autoRenew;
    }
    
    set autoRenew(value) {
        this._config.autoRenew = Boolean(value);
    }
    
    get renewDaysBeforeExpiry() {
        return this._config.renewDaysBeforeExpiry;
    }
    
    set renewDaysBeforeExpiry(value) {
        this._config.renewDaysBeforeExpiry = parseInt(value, 10) || 30;
    }
    
    get signWithCA() {
        return this._config.signWithCA;
    }
    
    set signWithCA(value) {
        this._config.signWithCA = Boolean(value);
    }
    
    get caFingerprint() {
        return this._config.caFingerprint;
    }
    
    set caFingerprint(value) {
        this._config.caFingerprint = value;
    }
    
    get deployActions() {
        return [...this._config.deployActions];
    }
    
    set deployActions(value) {
        if (Array.isArray(value)) {
            this._config.deployActions = [...value];
        }
    }
    
    get previousVersions() {
        return { ...this._previousVersions };
    }
    
    get modificationTime() {
        return this._modificationTime;
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
            return expiryDate < now;
        } catch (e) {
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
            return !this.isExpired() && expiryDate <= warningThreshold;
        } catch (e) {
            return false;
        }
    }
    
    /**
     * Check if certificate is a CA certificate
     * @returns {boolean} True if certificate is a CA
     */
    isCA() {
        return this._certType === 'rootCA' || this._certType === 'intermediateCA';
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
            
            if (expiryDate < now) return -1;
            
            const diffTime = expiryDate - now;
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } catch (e) {
            return -1;
        }
    }
    
    /**
     * Convert to a flat representation for API responses
     * @returns {Object} Flat representation
     */
    toApiResponse(passphraseManager = null) {
        // Check and verify all paths exist
        this.verifyPaths();
        
        // Format paths for API response - remove 'Path' suffix
        const apiPaths = {};
        if (this._pathes) {
            Object.entries(this._pathes).forEach(([key, value]) => {
                const cleanKey = key.endsWith('Path') ? key.slice(0, -4) : key;
                apiPaths[cleanKey] = value;
            });
        }
        
        const response = {
            name: this._name,
            fingerprint: this._fingerprint,
            subject: this._subject,
            issuer: this._issuer,
            validFrom: this._validFrom,
            validTo: this._validTo,
            certType: this._certType,
            domains: [...this._san.domains],
            ips: [...this._san.ips], 
            paths: apiPaths,
            autoRenew: this._config.autoRenew,
            renewDaysBeforeExpiry: this._config.renewDaysBeforeExpiry,
            signWithCA: this._config.signWithCA,
            caFingerprint: this._config.caFingerprint,
            deployActions: [...this._config.deployActions],
            isExpired: this.isExpired(),
            isExpiringSoon: this.isExpiringSoon(),
            daysUntilExpiry: this.daysUntilExpiry(),
            modificationTime: this._modificationTime
        };
        
        // Add passphrase information if a passphrase manager is provided
        if (passphraseManager && this._fingerprint) {
            response.hasPassphrase = passphraseManager.hasPassphrase(this._fingerprint);
        } else {
            response.hasPassphrase = false;
        }
        
        return response;
    }

    /**
     * Create or renew this certificate
     * @param {OpenSSLWrapper} openssl - OpenSSL wrapper instance
     * @param {Object} options - Creation options
     * @returns {Promise<Object>} Result object
     */
    async createOrRenew(openssl, options = {}) {
        if (!openssl) {
            throw new Error('OpenSSL wrapper is required');
        }
        
        // Generate paths if they don't exist
        if (!this._pathes.crtPath || !this._pathes.keyPath) {
            if (!options.certsDir) {
                throw new Error('Certificate directory is required to generate paths');
            }
            this.generatePaths(options.certsDir);
        }
        
        try {
            let result;
            const renewingExisting = this._fingerprint && 
                                    fs.existsSync(this._pathes.crtPath) && 
                                    fs.existsSync(this._pathes.keyPath);
            
            // Based on certificate type, call appropriate creation method
            switch (this._certType) {
                case 'rootCA':
                    if (renewingExisting) {
                        result = await openssl.renewCertificate(this, options);
                    } else {
                        result = await openssl.createRootCA(this, options);
                    }
                    break;
                    
                case 'intermediateCA':
                    // For intermediate CA, we need a signing CA
                    if (!options.signingCA) {
                        throw new Error('Signing CA is required for intermediate CA certificates');
                    }
                    
                    if (renewingExisting) {
                        result = await openssl.renewCertificate(this, {
                            ...options,
                            signingCA: options.signingCA
                        });
                    } else {
                        result = await openssl.createIntermediateCA(this, options.signingCA, options);
                    }
                    break;
                    
                default:
                    // Standard certificate
                    if (this._config.signWithCA && options.signingCA) {
                        // CA-signed certificate
                        if (renewingExisting) {
                            result = await openssl.renewCertificate(this, {
                                ...options,
                                signingCA: options.signingCA
                            });
                        } else {
                            result = await openssl.createSignedCertificate(this, options.signingCA, options);
                        }
                    } else {
                        // Self-signed certificate
                        if (renewingExisting) {
                            result = await openssl.renewCertificate(this, options);
                        } else {
                            result = await openssl.createSelfSigned(this, options);
                        }
                    }
                    break;
            }
            
            return result;
        } catch (error) {
            logger.error(`Failed to create/renew certificate ${this.name}:`, error);
            throw error;
        }
    }

    /**
     * Convert this certificate to PKCS#12 (P12) format
     * @param {OpenSSLWrapper} openssl - OpenSSL wrapper instance
     * @param {Object} options - Conversion options
     * @returns {Promise<Object>} Result object
     */
    async convertToP12(openssl, options = {}) {
        if (!this._pathes.crtPath || !this._pathes.keyPath) {
            throw new Error('Certificate and key paths are required');
        }
        
        return openssl.convertCertificate(this, 'p12', options);
    }

    /**
     * Convert this certificate to PEM format
     * @param {OpenSSLWrapper} openssl - OpenSSL wrapper instance
     * @param {Object} options - Conversion options
     * @returns {Promise<Object>} Result object
     */
    async convertToPEM(openssl, options = {}) {
        if (!this._pathes.crtPath) {
            throw new Error('Certificate path is required');
        }
        
        return openssl.convertCertificate(this, 'pem', options);
    }

    /**
     * Create a certificate chain including this certificate
     * @param {OpenSSLWrapper} openssl - OpenSSL wrapper instance
     * @param {Certificate[]} caCertificates - Array of CA certificates to include in the chain
     * @param {string} chainPath - Path to save the chain file
     * @returns {Promise<Object>} Result object
     */
    async createChain(openssl, caCertificates = [], chainPath = null) {
        if (!this._pathes.crtPath) {
            throw new Error('Certificate path is required');
        }
        
        // Determine chain path if not provided
        const outputChainPath = chainPath || `${this._pathes.crtPath.replace(/\.(crt|pem|cer)$/, '')}-chain.pem`;
        
        // Build array of certificates in the chain, starting with this certificate
        const chainCertPaths = [this._pathes.crtPath];
        
        // Add CA certificates to the chain
        for (const caCert of caCertificates) {
            if (caCert.paths && caCert.paths.crtPath) {
                chainCertPaths.push(caCert.paths.crtPath);
            }
        }
        
        // Create the chain
        const result = await openssl.createCertificateChain(outputChainPath, chainCertPaths);
        
        // Update certificate paths
        this._pathes.chainPath = outputChainPath;
        
        return result;
    }

    /**
     * Verify if the certificate's private key matches
     * @param {OpenSSLWrapper} openssl - OpenSSL wrapper instance
     * @returns {Promise<boolean>} True if certificate and key match
     */
    async verifyKeyMatch(openssl) {
        if (!this._pathes.crtPath || !this._pathes.keyPath) {
            throw new Error('Certificate and key paths are required');
        }
        
        return openssl.verifyCertificateKeyPair(this._pathes.crtPath, this._pathes.keyPath);
    }

    /**
     * Check if the certificate's private key is encrypted
     * @param {OpenSSLWrapper} openssl - OpenSSL wrapper instance
     * @returns {Promise<boolean>} True if key is encrypted
     */
    async checkKeyEncryption(openssl) {
        if (!this._pathes.keyPath) {
            throw new Error('Key path is required');
        }
        
        const isEncrypted = await openssl.isKeyEncrypted(this._pathes.keyPath);
        
        return isEncrypted;
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
        
        return passphraseManager.hasPassphrase(this._fingerprint);
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
            return false;
        }
        
        passphraseManager.storePassphrase(this._fingerprint, passphrase);
        return true;
    }

    /**
     * Delete the stored passphrase for this certificate
     * @param {PassphraseManager} passphraseManager - Passphrase manager instance
     * @returns {boolean} Success status
     */
    deletePassphrase(passphraseManager) {
        if (!passphraseManager || !this._fingerprint) {
            return false;
        }
        
        return passphraseManager.deletePassphrase(this._fingerprint);
    }

    /**
     * Execute deployment actions for this certificate
     * @param {DeployService} deployService - Deploy service instance
     * @returns {Promise<Object>} Result of deployment operations
     */
    async executeDeployActions(deployService) {
        if (!this._fingerprint) {
            throw new Error('Certificate must have a fingerprint to execute deployment actions');
        }
        
        return deployService.executeDeployActions(this);
    }

    /**
     * Add or update a file path for this certificate
     * @param {string} pathType - Type of path (crt, key, p12, etc.)
     * @param {string} filePath - Actual file path
     * @returns {boolean} True if file exists and path was added
     */
    addPath(pathType, filePath) {
        const fs = require('fs');
        
        // Only add if the file exists
        if (!filePath || !fs.existsSync(filePath)) {
            return false;
        }
        
        // Initialize paths object if needed
        if (!this._pathes) {
            this._pathes = {};
        }
        
        // Normalize the path key
        const normalizedKey = pathType.endsWith('path') || pathType.endsWith('Path') ?
            pathType : `${pathType}Path`;
        
        // Add to paths
        this._pathes[normalizedKey] = filePath;
        return true;
    }

    /**
     * Clean all paths that refer to non-existent files
     */
    cleanPaths() {
        if (!this._pathes) return;

        const fs = require('fs');
        const pathKeys = Object.keys(this._pathes);
        
        pathKeys.forEach(key => {
            const filePath = this._pathes[key];
            if (!filePath || !fs.existsSync(filePath)) {
                delete this._pathes[key];
            }
        });
    }

    /**
     * Verify that all paths in the certificate exist
     * Remove paths that don't exist
     */
    verifyPaths() {
        if (!this._pathes) return;
        
        const fs = require('fs');
        const pathsToRemove = [];
        
        // Check each path
        Object.entries(this._pathes).forEach(([key, filePath]) => {
            if (!filePath || !fs.existsSync(filePath)) {
                pathsToRemove.push(key);
            }
        });
        
        // Remove non-existent paths
        pathsToRemove.forEach(key => {
            delete this._pathes[key];
        });
    }

    /**
     * Load certificate paths from a path object (typically from JSON config)
     * @param {Object} pathsObject - Object containing path keys and values
     * @returns {Object} The updated paths object
     */
    loadPaths(pathsObject) {
        if (!pathsObject || typeof pathsObject !== 'object') {
            return this._pathes || {};
        }
        
        this._pathes = this._pathes || {};
        const fs = require('fs');
        
        // Check and set each path, verifying existence
        Object.entries(pathsObject).forEach(([key, filePath]) => {
            // Validate the file exists
            if (filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                // Add the "Path" suffix if it's not present
                const pathKey = key.endsWith('Path') ? key : `${key}Path`;
                this._pathes[pathKey] = filePath;
            }
        });
        
        return this._pathes;
    }

    /**
     * Get a specific path
     * @param {string} pathType - Type of path (without 'Path' suffix)
     * @returns {string|null} The path or null if not found
     */
    getPath(pathType) {
        if (!this._pathes) return null;
        
        const key = pathType.endsWith('Path') ? pathType : `${pathType}Path`;
        return this._pathes[key] || null;
    }

    /**
     * Get getter for all paths
     * @returns {Object} A copy of all paths
     */
    get paths() {
        return { ...this._pathes };
    }
}

module.exports = Certificate;