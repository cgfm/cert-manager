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
const fs = require('fs');

const FILENAME = 'models/Certificate.js';

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
            crtPath: null,     // Certificate file
            pemPath: null,     // PEM format certificate
            p12Path: null,     // PKCS#12 format
            pfxPath: null,     // PFX format (alternative to p12)
            csrPath: null,     // Certificate signing request
            extPath: null,     // Extensions
            keyPath: null,     // Private key
            cerPath: null,     // CER format certificate
            derPath: null,     // DER format certificate
            p7bPath: null,     // PKCS#7 format
            chainPath: null,   // Certificate chain
            fullchainPath: null // Full certificate chain
        };
        this._domains = [];
        this._ips = [];
        this._idleDomains = [];
        this._idleIps = [];

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
            // Only add domain from name if no explicit domains provided
            this._addDomainFromName();
        }
        // Initialize from data object
        else if (data) {
            this._fromData(data);
        }

        logger.fine(`Certificate initialized: ${this._name || 'unnamed'} (${this._fingerprint || 'no fingerprint'})`, null, FILENAME, this._name);
        logger.finest(`Certificate details: ${JSON.stringify(this.toJSON())}`, null, FILENAME, this._name);
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
            keyType: this._keyType,
            keySize: this._keySize,
            sigAlg: this._sigAlg,
            "acme-settings": this._acmeSettings,
            pathes: { ...this._pathes },  // Make sure we copy all path properties
            domains: [...this._domains],
            ips: [...this._ips],
            idleDomains: [...this._idleDomains],
            idleIps: [...this._idleIps],
            config: {
                autoRenew: this._config.autoRenew,
                renewDaysBeforeExpiry: this._config.renewDaysBeforeExpiry,
                signWithCA: this._config.signWithCA,
                caFingerprint: this._config.caFingerprint,
                deployActions: [...this._config.deployActions]
            },
            previousVersions: { ...this._previousVersions },
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
        logger.fine(`Initializing certificate from data: ${data.name || 'unnamed'}`, null, FILENAME, data.name);

        this._name = data.name || null;
        this._fingerprint = data.fingerprint || null;
        this._subject = data.subject || null;
        this._issuer = data.issuer || null;
        this._validFrom = data.validFrom || null;
        this._validTo = data.validTo || null;
        this._certType = data.certType || 'standard';

        this._keyType = data.keyType || 'RSA';
        this._keySize = data.keySize || 2048;
        this._sigAlg = data.sigAlg || null;

        this._needsPassphrase = null;
        this._passphraseChecked = false;

        // ACME settings
        this._acmeSettings = data["acme-settings"] || null;

        // File paths - log actual paths object
        logger.debug(`Processing paths object: ${JSON.stringify(data.paths || data.pathes || {})}`, null, FILENAME, data.name);

        // Initialize paths with empty object
        this._pathes = {};

        // Try to load paths from various sources
        const pathsObj = data.paths || data.pathes || {};

        if (typeof pathsObj === 'object' && pathsObj !== null) {
            // Process each path from the paths object
            Object.entries(pathsObj).forEach(([key, value]) => {
                if (value) {
                    // Ensure the key has the "Path" suffix
                    const pathKey = key.endsWith('Path') ? key : `${key}Path`;
                    this._pathes[pathKey] = value;
                    logger.fine(`Added path from data: ${pathKey} = ${value}`, null, FILENAME, data.name);
                }
            });

            logger.debug(`Loaded paths: ${JSON.stringify(this._pathes)}`, null, FILENAME, data.name);
        }

        // DOMAINS: Merge from all possible sources
        // Collect domains from all potential sources
        const domainsFromDirectProperty = Array.isArray(data.domains) ? data.domains : [];
        const domainsFromSan = Array.isArray(data.san?.domains) ? data.san.domains : [];
        const domainsFromMetadata = data.metadata?.domains || [];

        // Debug log all sources
        logger.debug(`Domain sources: direct=${domainsFromDirectProperty.length}, san=${domainsFromSan.length}, metadata=${domainsFromMetadata.length}`, null, FILENAME, this._name);

        // Merge all domain sources into a Set to remove duplicates
        const uniqueDomains = new Set([
            ...domainsFromDirectProperty,
            ...domainsFromSan,
            ...domainsFromMetadata
        ].filter(domain => domain && typeof domain === 'string'));

        // Convert back to array - Start with empty array
        this._domains = [...uniqueDomains].map(d => d.trim().toLowerCase());

        logger.fine(`Merged domains from multiple sources. Total: ${this._domains.length}`, null, FILENAME, this._name);
        logger.finest(`Domains: ${JSON.stringify(this._domains)}`, null, FILENAME, this._name);

        // IPS: Merge from all possible sources
        // Collect IPs from all potential sources
        const ipsFromDirectProperty = Array.isArray(data.ips) ? data.ips : [];
        const ipsFromSan = Array.isArray(data.san?.ips) ? data.san.ips : [];
        const ipsFromMetadata = data.metadata?.ips || [];

        // Debug log all sources
        logger.debug(`IP sources: direct=${ipsFromDirectProperty.length}, san=${ipsFromSan.length}, metadata=${ipsFromMetadata.length}`, null, FILENAME, this._name);

        // Merge all IP sources into a Set to remove duplicates
        const uniqueIPs = new Set([
            ...ipsFromDirectProperty,
            ...ipsFromSan,
            ...ipsFromMetadata
        ].filter(ip => ip && typeof ip === 'string'));

        // Convert back to array - Start with empty array
        this._ips = [...uniqueIPs].map(ip => ip.trim());

        logger.fine(`Merged IPs from multiple sources. Total: ${this._ips.length}`, null, FILENAME, this._name);
        logger.finest(`IPs: ${JSON.stringify(this._ips)}`, null, FILENAME, this._name);

        // Idle domains and IPs - Process both direct properties and SAN
        const idleDomainsFromDirect = Array.isArray(data.idleDomains) ? data.idleDomains : [];
        const idleDomainsFromSan = Array.isArray(data.san?.idleDomains) ? data.san.idleDomains : [];

        // Merge idle domains
        const uniqueIdleDomains = new Set([
            ...idleDomainsFromDirect,
            ...idleDomainsFromSan
        ].filter(domain => domain && typeof domain === 'string'));

        this._idleDomains = [...uniqueIdleDomains].map(d => d.trim().toLowerCase());
        logger.fine(`Loaded ${this._idleDomains.length} idle domains`, null, FILENAME, this._name);

        // Idle IPs - Process both direct properties and SAN
        const idleIpsFromDirect = Array.isArray(data.idleIps) ? data.idleIps : [];
        const idleIpsFromSan = Array.isArray(data.san?.idleIps) ? data.san.idleIps : [];

        // Merge idle IPs
        const uniqueIdleIps = new Set([
            ...idleIpsFromDirect,
            ...idleIpsFromSan
        ].filter(ip => ip && typeof ip === 'string'));

        this._idleIps = [...uniqueIdleIps].map(ip => ip.trim());
        logger.fine(`Loaded ${this._idleIps.length} idle IPs`, null, FILENAME, this._name);

        // Configuration
        if (data.config) {
            this._config = {
                autoRenew: data.config.autoRenew !== undefined ? data.config.autoRenew : false,
                renewDaysBeforeExpiry: data.config.renewDaysBeforeExpiry || 30,
                signWithCA: data.config.signWithCA || false,
                caFingerprint: data.config.caFingerprint || null,
                deployActions: Array.isArray(data.config.deployActions) ? [...data.config.deployActions] : []
            };
            logger.fine(`Certificate config loaded: autoRenew=${this._config.autoRenew}, signWithCA=${this._config.signWithCA}`, null, FILENAME, this._name);
        } else {
            // Backward compatibility with flat structure
            this._config = {
                autoRenew: data.autoRenew !== undefined ? data.autoRenew : false,
                renewDaysBeforeExpiry: data.renewDaysBeforeExpiry || 30,
                signWithCA: data.signWithCA || false,
                caFingerprint: data.caFingerprint || null,
                deployActions: Array.isArray(data.deployActions) ? [...data.deployActions] : []
            };
        }

        // Previous versions
        if (data.previousVersions && typeof data.previousVersions === 'object') {
            this._previousVersions = { ...data.previousVersions };
            logger.fine(`Loaded ${Object.keys(this._previousVersions).length} previous versions`, null, FILENAME, this._name);
        }

        // Modification time
        this._modificationTime = data.modificationTime || Date.now();

        // If we have a name but no domains, add name as a domain
        if (this._name && this._domains.length === 0) {
            this._addDomainFromName();
        }
    }

    /**
     * Add the certificate name as a domain if it looks like a valid domain
     * @private
     */
    _addDomainFromName() {
        if (this._name && this._name.includes('.') && !this._domains.includes(this._name)) {
            this._domains.push(this._name);
            logger.fine(`Added certificate name as domain: ${this._name}`, null, FILENAME, this._name);
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
        const fs = require('fs');

        logger.fine(`Generating paths for certificate ${this._name} in directory ${certsDir}`, null, FILENAME, this._name);

        // Define potential paths based on naming convention
        const potentialPaths = {
            crtPath: `${certsDir}/${baseName}.crt`,
            cerPath: `${certsDir}/${baseName}.cer`,
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

        logger.finest(`Potential paths: ${JSON.stringify(potentialPaths)}`, null, FILENAME, this._name);

        // Initialize paths object with only paths that exist
        this._pathes = {};

        // Check each potential path and only add to _pathes if file exists
        Object.entries(potentialPaths).forEach(([key, path]) => {
            if (fs.existsSync(path)) {
                this._pathes[key] = path;
                logger.finest(`Found existing file for ${key}: ${path}`, null, FILENAME, this._name);
            }
        });

        // If this is a new certificate (no existing files),
        // add the essential paths for creation
        if (Object.keys(this._pathes).length === 0) {
            logger.fine(`No existing files found. Adding essential paths for new certificate.`, null, FILENAME, this._name);
            this._pathes.crtPath = potentialPaths.crtPath;
            this._pathes.keyPath = potentialPaths.keyPath;
            this._pathes.csrPath = potentialPaths.csrPath;
            this._pathes.extPath = potentialPaths.extPath;
        }

        logger.debug(`Generated paths for certificate ${this._name}`, null, FILENAME, this._name);
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
            domains: [...this._domains],
            ips: [...this._ips]
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
        logger.finest(`Getting name: ${this._name}`, null, FILENAME, this._name);
        return this._name;
    }

    set name(value) {
        logger.finest(`Setting name from '${this._name}' to '${value}'`, null, FILENAME, this._name || 'unnamed');
        this._name = value;
        this._addDomainFromName();
    }

    get fingerprint() {
        logger.finest(`Getting fingerprint: ${this._fingerprint}`, null, FILENAME, this._name);
        return this._fingerprint;
    }

    set fingerprint(value) {
        logger.finest(`Setting fingerprint from '${this._fingerprint}' to '${value}'`, null, FILENAME, this._name);
        this._fingerprint = value;
    }

    get subject() {
        logger.finest(`Getting subject: ${this._subject}`, null, FILENAME, this._name);
        return this._subject;
    }

    set subject(value) {
        logger.finest(`Setting subject from '${this._subject}' to '${value}'`, null, FILENAME, this._name);
        this._subject = value;
    }

    get issuer() {
        logger.finest(`Getting issuer: ${this._issuer}`, null, FILENAME, this._name);
        return this._issuer;
    }

    set issuer(value) {
        logger.finest(`Setting issuer from '${this._issuer}' to '${value}'`, null, FILENAME, this._name);
        this._issuer = value;
    }

    get validFrom() {
        logger.finest(`Getting validFrom: ${this._validFrom}`, null, FILENAME, this._name);
        return this._validFrom;
    }

    set validFrom(value) {
        logger.finest(`Setting validFrom from '${this._validFrom}' to '${value}'`, null, FILENAME, this._name);
        this._validFrom = value;
    }

    get validTo() {
        logger.finest(`Getting validTo: ${this._validTo}`, null, FILENAME, this._name);
        return this._validTo;
    }

    set validTo(value) {
        logger.finest(`Setting validTo from '${this._validTo}' to '${value}'`, null, FILENAME, this._name);
        this._validTo = value;
    }

    get certType() {
        logger.finest(`Getting certType: ${this._certType}`, null, FILENAME, this._name);
        return this._certType;
    }

    set certType(value) {
        logger.finest(`Setting certType from '${this._certType}' to '${value}'`, null, FILENAME, this._name);
        if (['standard', 'rootCA', 'intermediateCA', 'acme'].includes(value)) {
            this._certType = value;
        } else {
            logger.warn(`${this._name} - Invalid certificate type: ${value}`, null, FILENAME);
            throw new Error(`Invalid certificate type: ${value}`);
        }
    }

    get acmeSettings() {
        logger.finest(`Getting acmeSettings: ${JSON.stringify(this._acmeSettings)}`, null, FILENAME, this._name);
        return this._acmeSettings;
    }

    set acmeSettings(value) {
        logger.finest(`Setting acmeSettings: ${JSON.stringify(value)}`, null, FILENAME, this._name);
        this._acmeSettings = value;
    }

    get paths() {
        logger.finest(`Getting paths: ${JSON.stringify(this._pathes)}`, null, FILENAME, this._name);
        return this._pathes || {};
    }

    set paths(value) {
        logger.finest(`Setting paths from ${JSON.stringify(this._pathes)} to ${JSON.stringify(value)}`, null, FILENAME, this._name);
        if (value && typeof value === 'object') {
            this._pathes = {
                crtPath: value.crtPath || value.crtpath || this._pathes.crtPath,
                pemPath: value.pemPath || value.pempath || this._pathes.pemPath,
                p12Path: value.p12Path || value.p12path || this._pathes.p12Path,
                csrPath: value.csrPath || this._pathes.csrPath,
                extPath: value.extPath || this._pathes.extPath,
                keyPath: value.keyPath || this._pathes.keyPath
            };
            logger.finest(`Updated paths: ${JSON.stringify(this._pathes)}`, null, FILENAME, this._name);
        }
    }

    get domains() {
        logger.finest(`Getting domains: ${JSON.stringify(this._domains)}`, null, FILENAME, this._name);
        return [...this._domains];
    }

    set domains(value) {
        logger.finest(`Setting domains from ${JSON.stringify(this._domains)} to ${JSON.stringify(value)}`, null, FILENAME, this._name);
        if (Array.isArray(value)) {
            // Clean up and normalize domain values
            const newDomains = value.filter(domain =>
                domain && typeof domain === 'string' && domain.trim().length > 0
            ).map(domain => domain.trim().toLowerCase());

            // Create a set of all domains (existing + new) to remove duplicates
            const allDomains = new Set([...this._domains, ...newDomains]);
            this._domains = [...allDomains];

            logger.debug(`Updated certificate ${this._name} domains to ${this._domains.length} domains`, null, FILENAME, this._name);
            logger.finest(`Domains: ${JSON.stringify(this._domains)}`, null, FILENAME, this._name);
        } else {
            logger.warn(`Attempted to set invalid domains value: ${JSON.stringify(value)}`, null, FILENAME, this._name);
        }
    }

    get ips() {
        logger.finest(`Getting IPs: ${JSON.stringify(this._ips)}`, null, FILENAME, this._name);
        return [...this._ips];
    }

    set ips(value) {
        logger.finest(`Setting IPs from ${JSON.stringify(this._ips)} to ${JSON.stringify(value)}`, null, FILENAME, this._name);
        if (Array.isArray(value)) {
            // Clean up and normalize IP values
            const newIPs = value.filter(ip =>
                ip && typeof ip === 'string' && ip.trim().length > 0
            ).map(ip => ip.trim());

            // Create a set of all IPs (existing + new) to remove duplicates
            const allIPs = new Set([...this._ips, ...newIPs]);
            this._ips = [...allIPs];

            logger.debug(`Updated certificate ${this._name} IPs to ${this._ips.length} IPs`, null, FILENAME, this._name);
            logger.finest(`IPs: ${JSON.stringify(this._ips)}`, null, FILENAME, this._name);
        } else {
            logger.warn(`Attempted to set invalid IPs value: ${JSON.stringify(value)}`, null, FILENAME, this._name);
        }
    }

    get autoRenew() {
        logger.finest(`Getting autoRenew: ${this._config.autoRenew}`, null, FILENAME, this._name);
        return this._config.autoRenew;
    }

    set autoRenew(value) {
        logger.finest(`Setting autoRenew from ${this._config.autoRenew} to ${Boolean(value)}`, null, FILENAME, this._name);
        this._config.autoRenew = Boolean(value);
    }

    get renewDaysBeforeExpiry() {
        logger.finest(`Getting renewDaysBeforeExpiry: ${this._config.renewDaysBeforeExpiry}`, null, FILENAME, this._name);
        return this._config.renewDaysBeforeExpiry;
    }

    set renewDaysBeforeExpiry(value) {
        const parsedValue = parseInt(value, 10) || 30;
        logger.finest(`Setting renewDaysBeforeExpiry from ${this._config.renewDaysBeforeExpiry} to ${parsedValue}`, null, FILENAME, this._name);
        this._config.renewDaysBeforeExpiry = parsedValue;
    }

    get signWithCA() {
        logger.finest(`Getting signWithCA: ${this._config.signWithCA}`, null, FILENAME, this._name);
        return this._config.signWithCA;
    }

    set signWithCA(value) {
        logger.finest(`Setting signWithCA from ${this._config.signWithCA} to ${Boolean(value)}`, null, FILENAME, this._name);
        this._config.signWithCA = Boolean(value);
    }

    get caFingerprint() {
        logger.finest(`Getting caFingerprint: ${this._config.caFingerprint}`, null, FILENAME, this._name);
        return this._config.caFingerprint;
    }

    set caFingerprint(value) {
        logger.finest(`Setting caFingerprint from ${this._config.caFingerprint} to ${value}`, null, FILENAME, this._name);
        this._config.caFingerprint = value;
    }

    get deployActions() {
        logger.finest(`Getting deployActions: ${JSON.stringify(this._config.deployActions)}`, null, FILENAME, this._name);
        return [...this._config.deployActions];
    }

    set deployActions(value) {
        logger.finest(`Setting deployActions from ${JSON.stringify(this._config.deployActions)} to ${JSON.stringify(value)}`, null, FILENAME, this._name);
        if (Array.isArray(value)) {
            this._config.deployActions = [...value];
        }
    }

    get previousVersions() {
        logger.finest(`Getting previousVersions: ${Object.keys(this._previousVersions).length} versions`, null, FILENAME, this._name);
        return { ...this._previousVersions };
    }

    get modificationTime() {
        logger.finest(`Getting modificationTime: ${this._modificationTime}`, null, FILENAME, this._name);
        return this._modificationTime;
    }


    get keyType() {
        logger.finest(`Getting keyType: ${this._keyType}`, null, FILENAME, this._name);
        return this._keyType;
    }

    set keyType(value) {
        logger.finest(`Setting keyType from '${this._keyType}' to '${value}'`, null, FILENAME, this._name);
        this._keyType = value || 'RSA';
    }

    get keySize() {
        logger.finest(`Getting keySize: ${this._keySize}`, null, FILENAME, this._name);
        return this._keySize;
    }

    set keySize(value) {
        const size = parseInt(value, 10) || 2048;
        logger.finest(`Setting keySize from ${this._keySize} to ${size}`, null, FILENAME, this._name);
        this._keySize = size;
    }

    get sigAlg() {
        logger.finest(`Getting sigAlg: ${this._sigAlg}`, null, FILENAME, this._name);
        return this._sigAlg;
    }

    set sigAlg(value) {
        logger.finest(`Setting sigAlg from '${this._sigAlg}' to '${value}'`, null, FILENAME, this._name);
        this._sigAlg = value;
    }
    
    get needsPassphrase() {
        return this._needsPassphrase;
    }
    
    set needsPassphrase(value) {
        this._needsPassphrase = Boolean(value);
        this._passphraseChecked = true;
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
     * Convert to a flat representation for API responses
     * @returns {Object} Flat representation
     */
    toApiResponse(passphraseManager = null) {
        // Check and verify all paths exist
        this.verifyPaths();

        // Log what we're returning in API response for debugging
        logger.fine(`Creating API response for certificate: ${this._name} (${this._fingerprint})`, null, FILENAME, this._name);
        logger.finest(`Domains in certificate: ${JSON.stringify(this._domains)}`, null, FILENAME, this._name);
        logger.finest(`IPs in certificate: ${JSON.stringify(this._ips)}`, null, FILENAME, this._name);

        // Format paths for API response - remove 'Path' suffix
        const apiPaths = {};
        if (this._pathes) {
            // Log raw paths
            logger.fine(`Raw paths before processing: ${JSON.stringify(this._pathes)}`, null, FILENAME, this._name);

            // Verify all paths exist
            const fs = require('fs');
            Object.entries(this._pathes).forEach(([key, value]) => {
                if (value && fs.existsSync(value)) {
                    // Save path without the "Path" suffix
                    const cleanKey = key.endsWith('Path') ? key.slice(0, -4) : key;
                    apiPaths[cleanKey] = value;
                    logger.finest(`Adding path ${cleanKey}: ${value}`, null, FILENAME, this._name);
                } else if (value) {
                    logger.fine(`Skipping non-existent path: ${key}=${value}`, null, FILENAME, this._name);
                }
            });

            logger.debug(`Processed paths for API response: ${JSON.stringify(apiPaths)}`, null, FILENAME, this._name);
        }

        const response = {
            name: this._name,
            fingerprint: this._fingerprint,
            subject: this._subject,
            issuer: this._issuer,
            validFrom: this._validFrom,
            validTo: this._validTo,
            certType: this._certType,
            domains: [...(this._domains || [])],
            idleDomains: [...(this._idleDomains || [])],
            ips: [...(this._ips || [])],
            idleIps: [...(this._idleIps || [])],
            paths: apiPaths,
            autoRenew: this._config.autoRenew,
            renewDaysBeforeExpiry: this._config.renewDaysBeforeExpiry,
            signWithCA: this._config.signWithCA,
            caFingerprint: this._config.caFingerprint,
            keyType: this._keyType || 'RSA',
            keySize: this._keySize || 2048,
            sigAlg: this._sigAlg,
            hasPassphrase: passphraseManager && this._fingerprint ? 
                passphraseManager.hasPassphrase(this._fingerprint) : false,
            needsPassphrase: this._needsPassphrase || false,
            deployActions: [...this._config.deployActions],
            isExpired: this.isExpired(),
            isExpiringSoon: this.isExpiringSoon(),
            daysUntilExpiry: this.daysUntilExpiry(),
            modificationTime: this._modificationTime,
            needsRenewal: (this._idleDomains && this._idleDomains.length > 0) ||
                (this._idleIps && this._idleIps.length > 0)
        };

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
            logger.error(`OpenSSL wrapper is required for certificate operations`, null, FILENAME, this._name);
            throw new Error('OpenSSL wrapper is required');
        }

        // Generate paths if they don't exist
        if (!this._pathes.crtPath || !this._pathes.keyPath) {
            if (!options.certsDir) {
                logger.error(`Certificate directory is required to generate paths`, null, FILENAME, this._name);
                throw new Error('Certificate directory is required to generate paths');
            }
            this.generatePaths(options.certsDir);
        }

        try {
            let result;
            const fs = require('fs');
            const renewingExisting = this._fingerprint &&
                fs.existsSync(this._pathes.crtPath) &&
                fs.existsSync(this._pathes.keyPath);

            if (renewingExisting) {
                logger.info(`Renewing existing certificate: ${this._name}`, null, FILENAME, this._name);
            } else {
                logger.info(`Creating new certificate: ${this._name}`, null, FILENAME, this._name);
            }

            logger.debug(`Certificate type: ${this._certType}`, null, FILENAME, this._name);
            logger.debug(`Sign with CA: ${this._config.signWithCA}`, null, FILENAME, this._name);

            if (this._config.signWithCA) {
                logger.debug(`CA fingerprint: ${this._config.caFingerprint}`, null, FILENAME, this._name);
                if (!options.signingCA) {
                    logger.warn(`No signing CA provided despite signWithCA=true`, null, FILENAME, this._name);
                }
            }

            // Based on certificate type, call appropriate creation method
            switch (this._certType) {
                case 'rootCA':
                    if (renewingExisting) {
                        logger.info(`Renewing root CA certificate: ${this._name}`, null, FILENAME, this._name);
                        result = await openssl.renewCertificate(this, options);
                    } else {
                        logger.info(`Creating new root CA certificate: ${this._name}`, null, FILENAME, this._name);
                        result = await openssl.createRootCA(this, options);
                    }
                    break;

                case 'intermediateCA':
                    // For intermediate CA, we need a signing CA
                    if (!options.signingCA) {
                        logger.error(`Signing CA is required for intermediate CA certificates`, null, FILENAME, this._name);
                        throw new Error('Signing CA is required for intermediate CA certificates');
                    }

                    if (renewingExisting) {
                        logger.info(`Renewing intermediate CA certificate: ${this._name}`, null, FILENAME, this._name);
                        result = await openssl.renewCertificate(this, {
                            ...options,
                            signingCA: options.signingCA
                        });
                    } else {
                        logger.info(`Creating new intermediate CA certificate: ${this._name}`, null, FILENAME, this._name);
                        result = await openssl.createIntermediateCA(this, options.signingCA, options);
                    }
                    break;

                default:
                    // Standard certificate
                    if (this._config.signWithCA && options.signingCA) {
                        // CA-signed certificate
                        if (renewingExisting) {
                            logger.info(`Renewing CA-signed certificate: ${this._name}`, null, FILENAME, this._name);
                            result = await openssl.renewCertificate(this, {
                                ...options,
                                signingCA: options.signingCA
                            });
                        } else {
                            logger.info(`Creating new CA-signed certificate: ${this._name}`, null, FILENAME, this._name);
                            result = await openssl.createSignedCertificate(this, options.signingCA, options);
                        }
                    } else {
                        // Self-signed certificate
                        if (renewingExisting) {
                            logger.info(`Renewing self-signed certificate: ${this._name}`, null, FILENAME, this._name);
                            result = await openssl.renewCertificate(this, options);
                        } else {
                            logger.info(`Creating new self-signed certificate: ${this._name}`, null, FILENAME, this._name);
                            result = await openssl.createSelfSigned(this, options);
                        }
                    }
                    break;
            }

            if (result.success) {
                logger.info(`Successfully ${renewingExisting ? 'renewed' : 'created'} certificate: ${this._name}`, null, FILENAME, this._name);
            } else {
                logger.error(`Failed to ${renewingExisting ? 'renew' : 'create'} certificate: ${this._name}`, null, FILENAME, this._name);
            }

            return result;
        } catch (error) {
            logger.error(`Failed to ${this._fingerprint ? 'renew' : 'create'} certificate ${this.name}:`, error, FILENAME, this._name);
            throw error;
        }
    }

    /**
     * Verify if the certificate's private key matches
     * @param {OpenSSLWrapper} openssl - OpenSSL wrapper instance
     * @returns {Promise<boolean>} True if certificate and key match
     */
    async verifyKeyMatch(openssl) {
        if (!this._pathes.crtPath || !this._pathes.keyPath) {
            logger.error(`Certificate and key paths are required for verification`, null, FILENAME, this._name);
            throw new Error('Certificate and key paths are required');
        }

        logger.debug(`Verifying key match for certificate: ${this._name}`, null, FILENAME, this._name);
        logger.fine(`Certificate path: ${this._pathes.crtPath}`, null, FILENAME, this._name);
        logger.fine(`Key path: ${this._pathes.keyPath}`, null, FILENAME, this._name);

        try {
            const result = await openssl.verifyCertificateKeyPair(this._pathes.crtPath, this._pathes.keyPath);
            if (result) {
                logger.info(`Certificate and key match verified for: ${this._name}`, null, FILENAME, this._name);
            } else {
                logger.warn(`Certificate and key DO NOT match for: ${this._name}`, null, FILENAME, this._name);
            }
            return result;
        } catch (error) {
            logger.error(`Error verifying certificate/key pair: ${error.message}`, null, FILENAME, this._name);
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
            return result;
        } catch (error) {
            logger.error(`Failed to delete passphrase for certificate ${this._name}:`, error, FILENAME, this._name);
            return false;
        }
    }

    /**
     * Add a new version of the certificate to previous versions history
     * @param {string} fingerprint - Previous certificate fingerprint
     * @param {Object} versionData - Certificate version data
     * @returns {boolean} Success status
     */
    addPreviousVersion(fingerprint, versionData) {
        if (!fingerprint || !versionData) {
            logger.warn(`Failed to add previous version: missing fingerprint or data`, null, FILENAME, this._name);
            return false;
        }

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
    }

    /**
     * Get previous versions of this certificate
     * @returns {Array} Array of previous versions
     */
    getPreviousVersions() {
        if (!this._previousVersions) {
            return [];
        }

        // Convert from object to array, adding the fingerprint to each version
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

        if (!this._pathes?.keyPath || !fs.existsSync(this._pathes.keyPath)) {
            logger.debug(`No key file found to check for passphrase requirement: ${this._name}`, null, FILENAME, this._name);
            this._needsPassphrase = false;
            this._passphraseChecked = true;
            return false;
        }

        try {
            logger.debug(`Checking if certificate key requires passphrase: ${this._name}`, null, FILENAME, this._name);
            const isEncrypted = await openssl.isKeyEncrypted(this._pathes.keyPath);
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

        logger.finest(`Verifying paths for certificate: ${this._name}`, null, FILENAME, this._name);

        const fs = require('fs');
        const pathsToRemove = [];

        // Check each path
        Object.entries(this._pathes).forEach(([key, filePath]) => {
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
                delete this._pathes[key];
            });
            logger.debug(`Removed ${pathsToRemove.length} non-existent paths`, null, FILENAME, this._name);
        }
    }

    /**
     * Load certificate paths from a path object (typically from JSON config)
     * @param {Object} pathsObject - Object containing path keys and values
     * @returns {Object} The updated paths object
     */
    loadPaths(pathsObject) {
        if (!pathsObject || typeof pathsObject !== 'object') {
            logger.debug(`Invalid paths object provided to loadPaths for certificate ${this._name}`, null, FILENAME, this._name);
            return this._pathes || {};
        }

        logger.debug(`Loading paths for certificate ${this._name}: ${JSON.stringify(pathsObject)}`, null, FILENAME, this._name);

        this._pathes = this._pathes || {};
        const fs = require('fs');

        // Check and set each path, verifying existence
        Object.entries(pathsObject).forEach(([key, filePath]) => {
            // Skip empty paths
            if (!filePath) {
                logger.fine(`Skipping empty path for key: ${key}`, null, FILENAME, this._name);
                return;
            }

            try {
                // Add the "Path" suffix if it's not present
                const pathKey = key.endsWith('Path') ? key : `${key}Path`;

                // Check if file exists before adding
                if (fs.existsSync(filePath)) {
                    this._pathes[pathKey] = filePath;
                    logger.fine(`Added path ${pathKey}: ${filePath}`, null, FILENAME, this._name);
                } else {
                    logger.fine(`Path file does not exist, skipping: ${filePath}`, null, FILENAME, this._name);
                }
            } catch (error) {
                logger.fine(`Error checking path ${key}: ${error.message}`, null, FILENAME, this._name);
            }
        });

        logger.debug(`Final paths after loading: ${JSON.stringify(this._pathes)}`, null, FILENAME, this._name);
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
        logger.finest(`${this._name} - Getting paths: ${JSON.stringify(this._pathes)}`, null, FILENAME);
        return { ...this._pathes };
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
        if (this._domains.includes(sanitizedDomain)) {
            logger.debug(`Domain ${domain} already exists as an active domain`, null, FILENAME, this._name);
            return {
                success: false,
                message: `Domain ${domain} already exists as an active domain in this certificate`,
                existsIn: 'active'
            };
        }

        // Check if domain is in idle list
        if (this._idleDomains.includes(sanitizedDomain)) {
            logger.debug(`Domain ${domain} already exists as a pending domain`, null, FILENAME, this._name);
            return {
                success: false,
                message: `Domain ${domain} already exists as a pending domain in this certificate`,
                existsIn: 'idle'
            };
        }

        // Add to appropriate list
        if (idle) {
            this._idleDomains.push(sanitizedDomain);
            logger.info(`Added ${domain} as pending domain to certificate ${this._name}`, null, FILENAME, this._name);
        } else {
            this._domains.push(sanitizedDomain);
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
            const idleIndex = this._idleDomains.indexOf(sanitizedDomain);
            if (idleIndex !== -1) {
                this._idleDomains.splice(idleIndex, 1);
                removed = true;
                logger.info(`Removed ${domain} from pending domains of certificate ${this._name}`, null, FILENAME, this._name);
            } else {
                logger.debug(`Domain ${domain} not found in pending domains`, null, FILENAME, this._name);
            }
        } else {
            // Remove from active domains
            const activeIndex = this._domains.indexOf(sanitizedDomain);
            if (activeIndex !== -1) {
                this._domains.splice(activeIndex, 1);
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
            return { success: false, message: 'Invalid IP address' };
        }

        const sanitizedIp = ip.trim();

        // Check if IP already exists in active IPs
        if (this._ips.includes(sanitizedIp)) {
            return {
                success: false,
                message: `IP ${ip} already exists as an active IP address in this certificate`,
                existsIn: 'active'
            };
        }

        // Check if IP is in idle list
        if (this._idleIps.includes(sanitizedIp)) {
            return {
                success: false,
                message: `IP ${ip} already exists as a pending IP address in this certificate`,
                existsIn: 'idle'
            };
        }

        // Add to appropriate list
        if (idle) {
            this._idleIps.push(sanitizedIp);
        } else {
            this._ips.push(sanitizedIp);
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
            return false;
        }

        const sanitizedIp = ip.trim();
        let removed = false;

        if (fromIdle) {
            // Remove from idle IPs
            const idleIndex = this._idleIps.indexOf(sanitizedIp);
            if (idleIndex !== -1) {
                this._idleIps.splice(idleIndex, 1);
                removed = true;
            }
        } else {
            // Remove from active IPs
            const activeIndex = this._ips.indexOf(sanitizedIp);
            if (activeIndex !== -1) {
                this._ips.splice(activeIndex, 1);
                removed = true;
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
        const idleDomainCount = this._idleDomains.length;
        const idleIpsCount = this._idleIps.length;

        const hadChanges = idleDomainCount > 0 || idleIpsCount > 0;

        if (hadChanges) {
            logger.info(`Applying ${idleDomainCount} pending domains and ${idleIpsCount} pending IPs for certificate ${this._name}`, null, FILENAME, this._name);

            // Move idle domains to active domains
            if (idleDomainCount > 0) {
                logger.fine(`Applying domains: ${JSON.stringify(this._idleDomains)}`, null, FILENAME, this._name);
                this._domains.push(...this._idleDomains);
                this._idleDomains = [];
            }

            // Move idle IPs to active IPs
            if (idleIpsCount > 0) {
                logger.fine(`Applying IPs: ${JSON.stringify(this._idleIps)}`, null, FILENAME, this._name);
                this._ips.push(...this._idleIps);
                this._idleIps = [];
            }

            this._modificationTime = Date.now();
        } else {
            logger.debug(`No pending domains or IPs to apply for certificate ${this._name}`, null, FILENAME, this._name);
        }

        return hadChanges;
    }

    // Add these getters
    get idleDomains() {
        logger.finest(`${this._name} - Getting idleDomains: ${JSON.stringify(this._idleDomains)}`, null, FILENAME);
        return [...this._idleDomains];
    }

    get idleIps() {
        logger.finest(`${this._name} - Getting idleIps: ${JSON.stringify(this._idleIps)}`, null, FILENAME);
        return [...this._idleIps];
    }
}

module.exports = Certificate;