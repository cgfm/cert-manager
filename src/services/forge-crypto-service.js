/**
 * @fileoverview Forge Crypto Service - Provides cryptographic operations using node-forge
 * @module services/forge-crypto-service
 * @requires fs
 * @requires path
 * @requires node-forge
 * @requires ./logger
 * @version 0.1.0
 * @license MIT
 * @author Christian Meiners (adapted by AI)
 */

const fs = require('fs').promises;
const path = require('path');
const forge = require('node-forge');
const logger = require('./logger');

const { pki, util, md, asn1 } = forge;
const FILENAME = 'services/forge-crypto-service.js';

/**
 * Forge Crypto Service for certificate management operations using node-forge library.
 * Provides key generation, certificate creation, validation, and file operations.
 */
class ForgeCryptoService {
    /**
     * Create a new ForgeCryptoService instance
     */
    constructor() {
        logger.info('ForgeCryptoService initialized', null, FILENAME);
        this.renewalService = null;
        this.defaultIgnoreDuration = 5000; // 5 seconds
    }    /**
     * Set the renewal service instance for file change coordination.
     * Allows the crypto service to register file changes with the renewal service.
     * @param {Object} renewalService - The renewal service instance with ignoreFilePaths method
     */
    setRenewalService(renewalService) {
        this.renewalService = renewalService;
        logger.debug('Renewal service set for ForgeCryptoService', null, FILENAME);
    }    /**
     * Register file paths with the renewal service to prevent file watching conflicts.
     * Tells the renewal service to temporarily ignore specific files during operations.
     * @param {string|string[]} filePaths - Single file path or array of file paths to register
     * @param {number} [duration] - Duration in milliseconds to ignore the files (default: this.defaultIgnoreDuration)
     * @param {string} [certName=null] - Certificate name for logging context
     */
    registerFilesWithRenewalService(filePaths, duration, certName = null) {
        if (!this.renewalService || typeof this.renewalService.ignoreFilePaths !== 'function') {
            logger.debug('No renewal service registered or ignoreFilePaths not a function, skipping file registration', null, FILENAME, certName);
            return;
        }

        const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
        const instance = certName || 'forge-ops';

        if (paths.length === 0 || paths.some(p => !p)) {
            logger.fine('No valid paths provided for renewal service registration.', null, FILENAME, instance);
            return;
        }

        const validPaths = paths.filter(p => p);
        if (validPaths.length === 0) return;

        const pathsStr = validPaths.map(p => path.basename(p)).join(', ');
        logger.debug(`Registering ${validPaths.length} file(s) with renewal service: ${pathsStr}`, { duration }, FILENAME, instance);

        try {
            this.renewalService.ignoreFilePaths(validPaths, duration || this.defaultIgnoreDuration);
        } catch (error) {
            logger.warn(`Failed to register files with renewal service: ${pathsStr}: ${error.message}`, error, FILENAME, instance);
        }
    }

    /**
     * Helper to parse a subject string "CN=Test,O=Org" into an array of forge attributes.
     * @param {string} subjectString - The subject string.
     * @returns {Array<Object>} Array of attribute objects for node-forge.
     * @private
     */
    _parseSubjectString(subjectString) {
        if (!subjectString || typeof subjectString !== 'string') {
            return [];
        }
        const attributes = [];
        // More robust regex to handle various spaces and delimiters
        const parts = subjectString.match(/([a-zA-Z0-9.]+)\s*=\s*(("(?:[^"\\]|\\.)*")|([^,]+))(?:,|$)/g);
        if (!parts) return [];

        parts.forEach(part => {
            const match = part.match(/([a-zA-Z0-9.]+)\s*=\s*(("(?:[^"\\]|\\.)*")|([^,]+))/);
            if (match) {
                let value = match[3].startsWith('"') && match[3].endsWith('"') ? match[3].slice(1, -1) : match[3];
                value = value.replace(/\\"/g, '"').replace(/\\,/g, ','); // Handle escaped quotes and commas

                const type = match[1].toUpperCase();
                // Map common names to forge shortNames if possible, otherwise use OID name
                const shortName = pki.oids[type] ? type : null; // pki.oids maps friendly names to OIDs, we need reverse or use as is
                if (shortName) { // CN, O, OU, L, ST, C etc.
                    attributes.push({ shortName: type, value });
                } else { // If not a common shortName, assume it's an OID string or other type name
                    attributes.push({ type: type, value });
                }
            }
        });
        return attributes;
    }


    /**
     * Helper function to convert distinguishedName attributes to a string.
     * @param {Array<Object>} attributes - Array of attribute objects from node-forge.
     * @returns {string} Formatted DN string.
     * @private
     */
    _formatDN(attributes) {
        if (!attributes || attributes.length === 0) {
            return '';
        }
        const typicalOrder = ['CN', 'L', 'ST', 'O', 'OU', 'C', 'E', 'DC', 'UID']; // Order for display

        const sortedAttributes = [...attributes].sort((a, b) => {
            const aName = a.shortName || a.name || a.type;
            const bName = b.shortName || b.name || b.type;
            const aIndex = typicalOrder.indexOf(aName.toUpperCase());
            const bIndex = typicalOrder.indexOf(bName.toUpperCase());

            if (aIndex === -1 && bIndex === -1) return aName.localeCompare(bName);
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        });
        return sortedAttributes.map(attr => `${attr.shortName || attr.name || attr.type}=${attr.value}`).join(', ');
    }


    /**
     * Extract certificate information using node-forge.
     * (Adapted from previous OpenSSLWrapper implementation)
     * @param {string} certPath - Path to certificate file.
     * @param {string} [certNameLog] - Certificate name for logging.
     * @returns {Promise<Object|null>} Certificate information or null on error.
     */
    async getCertificateInfo(certPath, certNameLog = null) {
        const instance = certNameLog || path.basename(certPath, path.extname(certPath));
        logger.debug(`Getting certificate info from: ${certPath} using node-forge`, null, FILENAME, instance);
        let cert; 
        let originalEncoding = null; 

        try {
            // Try parsing as PEM first
            logger.debug(`Attempting to parse ${certPath} as PEM.`, null, FILENAME, instance);
            const certPemString = await fs.readFile(certPath, 'utf8');
            try {
                cert = pki.certificateFromPem(certPemString);
                originalEncoding = 'PEM';
                logger.fine(`Successfully parsed ${certPath} as PEM.`, null, FILENAME, instance);
            } catch (pemError) {
                if (pemError.message.includes('Invalid PEM formatted message') || pemError.message.includes('Invalid PEM message') || pemError.message.includes('No PEM data found')) {
                    // Likely not PEM, try DER
                    const certDerBuffer = await fs.readFile(certPath); // Read as buffer
                    try {
                        const asn1Cert = forge.asn1.fromDer(certDerBuffer.toString('binary')); // node-forge expects a binary string for fromDer
                        cert = pki.certificateFromAsn1(asn1Cert);
                        originalEncoding = 'DER';
                        logger.fine(`Successfully parsed ${certPath} as DER.`, null, FILENAME, instance);
                    } catch (derError) {
                        logger.error(`Failed to parse ${certPath} as DER after PEM attempt failed: ${derError.message}`, { error: derError.toString() }, FILENAME, instance);
                        throw new Error(`Failed to parse certificate from ${certPath} as PEM or DER. PEM error: ${pemError.message}, DER error: ${derError.message}`);
                    }
                } else {
                    logger.debug(`Failed to parse ${certPath} as PEM: ${pemError.message}.`, { error: pemError.toString() }, FILENAME, instance);
                    // PEM parsing failed for a reason other than it not being PEM (e.g., corrupted PEM)
                    throw pemError;
                }
            }

            if (!cert) {
                // This case should ideally be caught by the errors above, but as a safeguard:
                logger.error(`Failed to parse certificate from ${certPath} (cert object is null after attempts).`, null, FILENAME, instance);
                throw new Error(`Failed to parse certificate from ${certPath} (unknown reason).`);
            } else {
                logger.finest(`Parsed certificate from ${certPath} successfully.`, null, FILENAME, instance);
            }

            const subjectString = this._formatDN(cert.subject.attributes);
            const issuerString = this._formatDN(cert.issuer.attributes);

            const commonNameAttr = cert.subject.getField('CN');
            const commonName = commonNameAttr ? commonNameAttr.value : null;

            const issuerCNAttr = cert.issuer.getField('CN');
            const issuerCN = issuerCNAttr ? issuerCNAttr.value : null;

            // Calculate SHA256 fingerprint of the certificate (hash of its DER encoding)
            const derBytes = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes();
            const hasher = forge.md.sha256.create();
            hasher.update(derBytes);
            const fingerprintSha256 = hasher.digest().toHex().toUpperCase();
            
            let keyType = null;
            let keySize = null;
            if (cert.publicKey) {
                if (cert.publicKey.n) { keyType = 'RSA'; keySize = cert.publicKey.n.bitLength(); }
                else if (cert.publicKey.q) { keyType = 'DSA'; keySize = cert.publicKey.q.bitLength(); }
                else if (cert.publicKey.data && (cert.publicKey.oid === pki.oids.ecPublicKey || cert.publicKey.algorithm === 'ecPublicKey')) {
                    keyType = 'EC';
                    const curveOid = cert.publicKey.curveOid || (cert.signatureParameters && cert.signatureParameters.value);
                    if (curveOid === pki.oids.secp256r1) keySize = 256;
                    else if (curveOid === pki.oids.secp384r1) keySize = 384;
                    else if (curveOid === pki.oids.secp521r1) keySize = 521;
                }
            }

            const sans = { domains: [], ips: [] };
            const altNamesExt = cert.getExtension({ name: 'subjectAltName' });
            if (altNamesExt && altNamesExt.altNames) { // Check altNamesExt.altNames exists
                altNamesExt.altNames.forEach(name => {
                    if (name.type === 2) sans.domains.push(name.value); // dNSName
                    else if (name.type === 7 && name.value) sans.ips.push(forge.util.bytesToIP(name.value));
                });
            }
            if (commonName && !sans.domains.some(d => d.toLowerCase() === commonName.toLowerCase())) {
                sans.domains.unshift(commonName);
            }
            sans.domains = [...new Set(sans.domains.map(d => d.toLowerCase()))].sort();
            sans.ips.sort();

            let isCA = false;
            let pathLenConstraint;
            const basicConstraintsExt = cert.getExtension({ name: 'basicConstraints' });
            if (basicConstraintsExt) {
                isCA = basicConstraintsExt.cA === true;
                if (isCA && basicConstraintsExt.pathLenConstraint !== undefined && basicConstraintsExt.pathLenConstraint !== null) {
                    pathLenConstraint = basicConstraintsExt.pathLenConstraint;
                }
            }

            let isSelfSigned = false; // Default to false
            // Defensive check before calling cert.isIssuer
            if (cert.issuer && cert.subject && typeof cert.isIssuer === 'function') {
                try {
                    logger.finest('Cert Issuer Attributes:', cert.issuer.attributes, FILENAME, instance);
                    logger.finest('Cert Subject Attributes:', cert.subject.attributes, FILENAME, instance);
                    // Then the try-catch for cert.isIssuer...
                    isSelfSigned = cert.isIssuer(cert.subject);
                } catch (isIssuerError) {
                    logger.info(`Error calling cert.isIssuer for ${certPath}: ${isIssuerError.message}. Trying fallback.`, null, FILENAME, instance);
                    // isSelfSigned remains false
                    if (cert.issuer.attributes && cert.subject.attributes) {
                        const issuerDN = this._formatDN(cert.issuer.attributes);
                        const subjectDN = this._formatDN(cert.subject.attributes);
                        if (issuerDN === subjectDN && issuerDN !== '') { // Check if formatted DNs are identical and not empty
                            logger.debug(`Fallback: Issuer and Subject DNs are identical for ${certPath}. Considering it self-signed despite isIssuer error.`, null, FILENAME, instance);
                            isSelfSigned = true;
                        }else{
                            logger.debug(`Fallback: Issuer and Subject DNs are different for ${certPath}. Not self-signed.`, null, FILENAME, instance);
                        }
                    }
                }
            } else {
                logger.warn(`Cannot determine self-signed status for ${certPath}: cert.issuer or cert.subject is invalid, or cert.isIssuer is not a function.`, {
                    hasIssuer: !!cert.issuer,
                    hasSubject: !!cert.subject,
                    isIssuerFuncType: typeof cert.isIssuer
                }, FILENAME, instance);
            }

            const isRootCA = isCA && isSelfSigned;

            const subjectKeyIdExt = cert.getExtension({ name: 'subjectKeyIdentifier' });
            let subjectKeyIdentifier = null;

            if (subjectKeyIdExt) {
                if (subjectKeyIdExt.subjectKeyIdentifier && typeof subjectKeyIdExt.subjectKeyIdentifier === 'string' && /^[0-9a-fA-F]+$/.test(subjectKeyIdExt.subjectKeyIdentifier)) {
                    // If node-forge provides a pre-parsed hex string, use it directly.
                    subjectKeyIdentifier = subjectKeyIdExt.subjectKeyIdentifier.toUpperCase();
                    logger.fine(`Used pre-parsed Subject Key Identifier hex from forge for ${instance}`, { rawForgeSki: subjectKeyIdExt.subjectKeyIdentifier, hexValue: subjectKeyIdentifier }, FILENAME, instance);
                } else if (typeof subjectKeyIdExt.value === 'string' && subjectKeyIdExt.value.length > 0) {
                    // Fallback: Parse from the raw DER value of the extension.
                    // The SKI extension value is directly an OCTET STRING.
                    try {
                        const skiAsn1 = forge.asn1.fromDer(subjectKeyIdExt.value);
                        if (skiAsn1 && skiAsn1.tagClass === forge.asn1.Class.UNIVERSAL && skiAsn1.type === forge.asn1.Type.OCTETSTRING && typeof skiAsn1.value === 'string') {
                            subjectKeyIdentifier = forge.util.bytesToHex(skiAsn1.value).toUpperCase();
                            logger.fine(`Successfully extracted and converted Subject Key Identifier from DER value for ${instance}`, { extensionValuePreview: subjectKeyIdExt.value.substring(0,10), hexValue: subjectKeyIdentifier }, FILENAME, instance);
                        } else {
                            logger.warn(`Could not parse Subject Key Identifier from DER value for ${instance}: ASN.1 structure not as expected.`, { skiAsn1 }, FILENAME, instance);
                        }
                    } catch (skiParseError) {
                        logger.warn(`Error parsing Subject Key Identifier DER value for ${instance}: ${skiParseError.message}`, { error: skiParseError }, FILENAME, instance);
                    }
                } else {
                    logger.fine(`Subject Key Identifier extension found for ${instance}, but no usable value (subjectKeyIdentifier field or .value field) found. SKI will be null.`, { extension: subjectKeyIdExt }, FILENAME, instance);
                }
            } else {
                logger.fine(`Subject Key Identifier extension not found for ${instance}. SKI will be null.`, null, FILENAME, instance);
            }
            
            const authorityKeyIdExt = cert.getExtension({ name: 'authorityKeyIdentifier' });
            let authorityKeyIdentifier = null; // Default to null

            if (authorityKeyIdExt && typeof authorityKeyIdExt.value === 'string') {
                try {
                    // The 'value' of the AKI extension is an ASN.1 DER-encoded string.
                    // We need to parse this ASN.1 structure to find the subjectKeyIdentifierentifier.
                    const akiAsn1 = forge.asn1.fromDer(authorityKeyIdExt.value);
                    
                    // The AuthorityKeyIdentifier is a SEQUENCE.
                    // Iterate through its components to find the subjectKeyIdentifierentifier (CONTEXT-SPECIFIC [0])
                    if (akiAsn1 && akiAsn1.value && Array.isArray(akiAsn1.value)) {
                        for (const component of akiAsn1.value) {
                            // subjectKeyIdentifierentifier is IMPLICIT OCTET STRING, tagClass UNIVERSAL, type 4 (OCTET STRING)
                            // but wrapped in a CONTEXT-SPECIFIC tag [0] (0x80)
                            if (component.tagClass === forge.asn1.Class.CONTEXT_SPECIFIC && component.type === 0) {
                                // The actual value of the subjectKeyIdentifierentifier is in component.value (which is a binary string)
                                if (typeof component.value === 'string' && component.value.length > 0) {
                                    authorityKeyIdentifier = forge.util.bytesToHex(component.value).toUpperCase();
                                    logger.fine(`Successfully extracted and converted Authority Key Identifier to hex for ${instance}`, {extension: authorityKeyIdExt, hexValue: authorityKeyIdentifier }, FILENAME, instance);
                                    break; // Found it
                                }
                            }
                        }
                    }

                    if (!authorityKeyIdentifier) {
                        logger.fine(`Parsed AKI for ${instance}, but subjectKeyIdentifierentifier component not found or was empty.`, { akiAsn1Value: akiAsn1 ? akiAsn1.value : null }, FILENAME, instance);
                    }

                } catch (asn1Error) {
                    logger.warn(
                        `Failed to parse ASN.1 or convert Authority Key Identifier for ${instance}: ${asn1Error.message}`,
                        { rawValuePreview: authorityKeyIdExt.value.substring(0, 20) }, // Log a preview of the raw value
                        FILENAME,
                        instance
                    );
                }
            } else if (authorityKeyIdExt) {
                 logger.fine(`Authority Key Identifier extension found for ${instance}, but its 'value' is not a string or is empty. AKI will be null.`, { extensionValueType: typeof authorityKeyIdExt.value }, FILENAME, instance);
            }
             else {
                logger.fine(`Authority Key Identifier extension not found for ${instance}. AKI will be null.`, null, FILENAME, instance);
            }
            // If authorityKeyIdExt is null or authorityKeyIdExt.subjectKeyIdentifierentifier is null/undefined,
            // authorityKeyIdentifier remains null by default.


            const result = {
                fingerprint: fingerprintSha256,
                commonName: commonName,
                subject: subjectString,
                issuer: issuerString,
                issuerCN: issuerCN,
                validFrom: cert.validity.notBefore,
                validTo: cert.validity.notAfter,
                serialNumber: cert.serialNumber.startsWith('0x') ? cert.serialNumber.substring(2).toUpperCase() : cert.serialNumber.toUpperCase(),
                keyType: keyType,
                keySize: keySize,
                originalEncoding: originalEncoding,
                signatureAlgorithm: pki.oids[cert.signatureOid] || cert.signatureOid,
                subjectKeyIdentifier: subjectKeyIdentifier,
                authorityKeyIdentifier: authorityKeyIdentifier,
                authorityKeyId: authorityKeyIdentifier,
                isCA: isCA,
                pathLenConstraint: pathLenConstraint,
                isSelfSigned: isSelfSigned,
                isRootCA: isRootCA,
                sans: sans,
            };
            logger.fine(`Got certificate info from ${certPath} using node-forge`, result, FILENAME, instance);
            return result;
        } catch (error) {
            logger.error(`Failed to get certificate info from ${certPath} using node-forge: ${error.message}`, error, FILENAME, instance);
            throw new Error(`Failed to get certificate info with node-forge: ${error.message}`);
        }
    }

    /**
     * Generates a private key.
     * @param {Object} options - Key generation options.
     * @param {string} options.keyPath - Path to save the generated key.
     * @param {string} [options.algorithm='RSA'] - Algorithm ('RSA' or 'EC').
     * @param {number} [options.bits=2048] - Key size in bits (for RSA).
     * @param {string} [options.curve='secp256r1'] - Curve name for EC (e.g., 'secp256r1', 'secp384r1').
     * @param {boolean} [options.encrypt=false] - Whether to encrypt the key.
     * @param {string} [options.passphrase] - Passphrase for key encryption.
     * @param {string} [options.certName] - Certificate name for logging.
     * @returns {Promise<{keyPath: string, privateKey: Object, publicKey: Object}>} Path to key and forge key objects.
     */
    async generatePrivateKey(options = {}) {
        const {
            keyPath,
            algorithm = 'RSA',
            bits = 2048,
            curve = 'secp256r1', // NIST P-256
            encrypt = false,
            passphrase,
            certName: certNameLog
        } = options;

        const instance = certNameLog || path.basename(keyPath, path.extname(keyPath)) || 'private-key';
        logger.debug(`Generating private key: Algo=${algorithm}, Path=${keyPath}`, { options }, FILENAME, instance);

        if (!keyPath) {
            throw new Error('keyPath is required for generating private key.');
        }

        let keys;
        if (algorithm.toUpperCase() === 'RSA') {
            keys = pki.rsa.generateKeyPair({ bits: bits, workers: -1 }); // Use workers for speed
        } else if (algorithm.toUpperCase() === 'EC') {
            keys = pki.ec.generateKeyPair({ curve: curve });
        } else {
            throw new Error(`Unsupported key algorithm: ${algorithm}`);
        }

        let pemPrivateKey = pki.privateKeyToPem(keys.privateKey);

        if (encrypt) {
            if (!passphrase) {
                throw new Error('Passphrase is required for encrypting private key.');
            }
            pemPrivateKey = pki.encryptPrivateKeyInfo(keys.privateKey, passphrase, {
                algorithm: 'aes256', // Stronger encryption
            });
            logger.fine(`Private key for ${instance} will be encrypted.`, null, FILENAME, instance);
        }

        await fs.writeFile(keyPath, pemPrivateKey);
        this.registerFilesWithRenewalService(keyPath, null, instance);
        logger.info(`Private key generated and saved to ${keyPath}`, null, FILENAME, instance);
        return { keyPath, privateKey: keys.privateKey, publicKey: keys.publicKey };
    }


    /**
     * Creates a self-signed certificate.
     * @param {Object} config - Certificate configuration.
     * @param {string} config.certPath - Path to save the certificate.
     * @param {string} config.keyPath - Path to the private key (will be generated if not provided and no privateKeyObj).
     * @param {Object} [config.privateKeyObj] - Optional existing node-forge private key object.
     * @param {Object} [config.publicKeyObj] - Optional existing node-forge public key object (paired with privateKeyObj).
     * @param {string} [config.keyAlgorithm='RSA'] - Algorithm for new key if generated.
     * @param {number} [config.keyBits=2048] - Bits for new RSA key.
     * @param {string} [config.keyCurve='secp256r1'] - Curve for new EC key.
     * @param {string} [config.keyPassphrase] - Passphrase if new key needs encryption or existing key is encrypted.
     * @param {string} config.subject - Subject string (e.g., "CN=Test CA,O=MyOrg").
     * @param {number} [config.days=365] - Validity period in days.
     * @param {Array<Object>} [config.extensions] - Array of node-forge extension objects. If not provided, basic self-signed CA extensions will be used.
     * @param {string} [config.name] - Name for logging.
     * @returns {Promise<{certPath: string, keyPath: string, certificate: Object, privateKey: Object, publicKey: Object}>}
     */
    async createSelfSignedCertificate(config = {}) {
        const {
            certPath,
            keyPath,
            privateKeyObj,
            publicKeyObj,
            keyAlgorithm = 'RSA',
            keyBits = 2048,
            keyCurve = 'secp256r1',
            keyPassphrase,
            subject,
            days = 365,
            extensions, // User can provide fully formed forge extensions
            name: certNameLog
        } = config;

        const instance = certNameLog || (subject ? (this._parseSubjectString(subject).find(attr => attr.shortName === 'CN') || {}).value : null) || path.basename(certPath, path.extname(certPath)) || 'self-signed-cert';
        logger.debug(`Creating self-signed certificate: ${instance}`, { config }, FILENAME, instance);

        if (!certPath || !keyPath || !subject) {
            throw new Error('certPath, keyPath, and subject are required for self-signed certificate.');
        }

        let keys = { privateKey: privateKeyObj, publicKey: publicKeyObj };

        if (!keys.privateKey || !keys.publicKey) {
            logger.fine(`No key objects provided, generating/reading key for ${instance} from ${keyPath}`, null, FILENAME, instance);
            if (await fs.access(keyPath).then(() => true).catch(() => false)) {
                const keyPem = await fs.readFile(keyPath, 'utf8');
                keys.privateKey = pki.decryptPrivateKeyInfo(keyPem, keyPassphrase) || pki.privateKeyFromPem(keyPem); // Try decrypt first
                if (!keys.privateKey) throw new Error(`Could not read private key from ${keyPath}`);
                // Re-derive public key to ensure it matches
                if (keys.privateKey.type === 'RSA') keys.publicKey = pki.rsa.setPublicKey(keys.privateKey.n, keys.privateKey.e);
                else if (keys.privateKey.type === 'EC') keys.publicKey = pki.ec.setPublicKey(keys.privateKey.curve, keys.privateKey.publicKey);
                else throw new Error('Unsupported key type in existing key file for deriving public key.');

                logger.fine(`Loaded existing private key from ${keyPath} for ${instance}`, null, FILENAME, instance);
            } else {
                const genKeyOpts = {
                    keyPath,
                    algorithm: keyAlgorithm,
                    bits: keyBits,
                    curve: keyCurve,
                    encrypt: !!keyPassphrase,
                    passphrase: keyPassphrase,
                    certName: instance
                };
                const generated = await this.generatePrivateKey(genKeyOpts);
                keys = { privateKey: generated.privateKey, publicKey: generated.publicKey };
            }
        }


        const cert = pki.createCertificate();
        cert.publicKey = keys.publicKey;
        cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(19)); // Ensure positive and random
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + days);

        cert.setSubject(this._parseSubjectString(subject));
        cert.setIssuer(this._parseSubjectString(subject)); // Self-signed

        // Default extensions for a self-signed (typically root CA) certificate
        const defaultExtensions = [
            { name: 'basicConstraints', cA: true, critical: true },
            { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
            { name: 'subjectKeyIdentifier' } // Calculated by forge
        ];

        cert.setExtensions(extensions || defaultExtensions);

        // Sign the certificate
        cert.sign(keys.privateKey, md.sha256.create());

        const pemCertificate = pki.certificateToPem(cert);
        await fs.writeFile(certPath, pemCertificate);
        this.registerFilesWithRenewalService([certPath, keyPath], null, instance);

        logger.info(`Self-signed certificate ${instance} created and saved to ${certPath}`, null, FILENAME, instance);
        return { certPath, keyPath, certificate: cert, privateKey: keys.privateKey, publicKey: keys.publicKey };
    }

    
    /**
     * Creates a Certificate Signing Request (CSR).
     * @param {Object} config - CSR configuration.
     * @param {string} config.csrPath - Path to save the CSR.
     * @param {string} config.keyPath - Path to the private key.
     * @param {Object} [config.privateKeyObj] - Optional existing node-forge private key object.
     * @param {Object} [config.publicKeyObj] - Optional existing node-forge public key object.
     * @param {string} [config.keyPassphrase] - Passphrase for the private key if encrypted.
     * @param {string} config.subject - Subject string for the CSR.
     * @param {Array<Object>} [config.extensions] - Array of node-forge extension objects for CSR attributes (e.g., SANs).
     * @param {string} [config.name] - Name for logging.
     * @returns {Promise<{csrPath: string, csr: Object, privateKey: Object, publicKey: Object}>}
     */
    async createCSR(config = {}) {
        const {
            csrPath,
            keyPath,
            privateKeyObj,
            publicKeyObj,
            keyPassphrase,
            subject,
            extensions, // e.g., [{ name: 'subjectAltName', altNames: [...] }]
            name: certNameLog
        } = config;

        const instance = certNameLog || (subject ? (this._parseSubjectString(subject).find(attr => attr.shortName === 'CN') || {}).value : null) || path.basename(csrPath, path.extname(csrPath)) || 'csr';
        logger.debug(`Creating CSR: ${instance}`, { config }, FILENAME, instance);

        if (!csrPath || !keyPath || !subject) {
            throw new Error('csrPath, keyPath, and subject are required for creating CSR.');
        }

        let keys = { privateKey: privateKeyObj, publicKey: publicKeyObj };

        if (!keys.privateKey || !keys.publicKey) {
            logger.fine(`No key objects provided for CSR, loading key for ${instance} from ${keyPath}`, null, FILENAME, instance);
            if (!(await fs.access(keyPath).then(() => true).catch(() => false))) {
                throw new Error(`Private key file not found at ${keyPath} for CSR creation.`);
            }
            const keyPem = await fs.readFile(keyPath, 'utf8');
            keys.privateKey = pki.decryptPrivateKeyInfo(keyPem, keyPassphrase) || pki.privateKeyFromPem(keyPem);
            if (!keys.privateKey) throw new Error(`Could not read private key from ${keyPath} (ensure passphrase is correct if encrypted).`);

            if (keys.privateKey.type === 'RSA') keys.publicKey = pki.rsa.setPublicKey(keys.privateKey.n, keys.privateKey.e);
            else if (keys.privateKey.type === 'EC') keys.publicKey = pki.ec.setPublicKey(keys.privateKey.curve, keys.privateKey.publicKey);
            else throw new Error('Unsupported key type in existing key file for deriving public key for CSR.');
            logger.fine(`Loaded private key from ${keyPath} for CSR ${instance}`, null, FILENAME, instance);
        }

        const csr = pki.createCertificationRequest();
        csr.publicKey = keys.publicKey;
        csr.setSubject(this._parseSubjectString(subject));

        // Add attributes for extensions, commonly SANs
        if (extensions && extensions.length > 0) {
            csr.setAttributes([{
                name: 'extensionRequest',
                extensions: extensions
            }]);
        }

        // Sign the CSR
        csr.sign(keys.privateKey, md.sha256.create());

        const pemCSR = pki.certificationRequestToPem(csr);
        await fs.writeFile(csrPath, pemCSR);
        this.registerFilesWithRenewalService(csrPath, null, instance);

        logger.info(`CSR ${instance} created and saved to ${csrPath}`, null, FILENAME, instance);
        return { csrPath, csr, privateKey: keys.privateKey, publicKey: keys.publicKey };
    }

    /**
     * Signs a certificate using a CA (issues a new certificate).
     * @param {Object} config - Signing configuration.
     * @param {string} config.certPath - Path to save the new signed certificate.
     * @param {string|Object} config.csr - Path to the CSR file or a node-forge CSR object.
     * @param {string} config.caCertPath - Path to the CA's certificate file.
     * @param {string} config.caKeyPath - Path to the CA's private key file.
     * @param {string} [config.caKeyPassphrase] - Passphrase for the CA's private key.
     * @param {number} [config.days=365] - Validity period in days for the new certificate.
     * @param {Array<Object>} [config.extensions] - Array of node-forge extension objects for the new certificate.
     *                                            If null, attempts to use extensions from CSR.
     * @param {string} [config.name] - Name for logging.
     * @returns {Promise<{certPath: string, certificate: Object}>}
     */
    async signCertificateWithCA(config = {}) {
        const {
            certPath,
            csr, // Can be path or CSR object
            caCertPath,
            caKeyPath,
            caKeyPassphrase,
            days = 365,
            extensions, // User-provided extensions for the certificate itself
            name: certNameLog
        } = config;

        const instance = certNameLog || path.basename(certPath, path.extname(certPath)) || 'signed-cert';
        logger.debug(`Signing certificate with CA: ${instance}`, { config }, FILENAME, instance);

        if (!certPath || !csr || !caCertPath || !caKeyPath) {
            throw new Error('certPath, csr, caCertPath, and caKeyPath are required for signing with CA.');
        }

        // Load CA private key
        const caKeyPem = await fs.readFile(caKeyPath, 'utf8');
        const caPrivateKey = pki.decryptPrivateKeyInfo(caKeyPem, caKeyPassphrase) || pki.privateKeyFromPem(caKeyPem);
        if (!caPrivateKey) throw new Error(`Could not load CA private key from ${caKeyPath}. Check passphrase if encrypted.`);

        // Load CA certificate
        const caCertPem = await fs.readFile(caCertPath, 'utf8');
        const caCert = pki.certificateFromPem(caCertPem);
        if (!caCert) throw new Error(`Could not load CA certificate from ${caCertPath}.`);

        // Load CSR
        let csrObj;
        if (typeof csr === 'string') {
            const csrPem = await fs.readFile(csr, 'utf8');
            csrObj = pki.certificationRequestFromPem(csrPem);
        } else if (typeof csr === 'object' && csr.publicKey && csr.subject) { // Basic check for forge CSR object
            csrObj = csr;
        }
        if (!csrObj) throw new Error('Invalid CSR provided. Must be a file path or a node-forge CSR object.');

        // Verify CSR signature (optional but good practice)
        if (!csrObj.verify()) {
            throw new Error('CSR signature verification failed.');
        }

        const cert = pki.createCertificate();
        cert.publicKey = csrObj.publicKey; // Use public key from CSR
        cert.serialNumber = '02' + forge.util.bytesToHex(forge.random.getBytesSync(19)); // Ensure positive and random, different prefix
        cert.validity.notBefore = new Date();
        cert.validity.notAfter = new Date();
        cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + days);

        cert.setSubject(csrObj.subject.attributes); // Use subject from CSR
        cert.setIssuer(caCert.subject.attributes); // Issuer is the CA

        // Handle extensions
        let finalExtensions = [];
        if (extensions) {
            finalExtensions = extensions;
        } else {
            // Try to get extensions from CSR attributes (extensionRequest)
            const reqExtensions = csrObj.getAttribute({ name: 'extensionRequest' });
            if (reqExtensions) {
                finalExtensions = reqExtensions.extensions;
            }
        }
        // Add Authority Key Identifier (points to CA's subjectKeyIdentifier)
        const caSki = caCert.getExtension({name: 'subjectKeyIdentifier'});
        if (caSki) {
            finalExtensions.push({ name: 'authorityKeyIdentifier', subjectKeyIdentifierentifier: caSki.subjectKeyIdentifier });
        }
        // Add Subject Key Identifier (for the new cert)
        finalExtensions.push({ name: 'subjectKeyIdentifier' });


        // Ensure basicConstraints is appropriate (not a CA unless specified)
        const hasBasicConstraints = finalExtensions.some(ext => ext.name === 'basicConstraints');
        if (!hasBasicConstraints) {
            finalExtensions.push({ name: 'basicConstraints', cA: false, critical: true });
        }
        // Ensure keyUsage is appropriate for end-entity
        const hasKeyUsage = finalExtensions.some(ext => ext.name === 'keyUsage');
        if (!hasKeyUsage) {
             finalExtensions.push({ name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true });
        }


        cert.setExtensions(finalExtensions);

        // Sign the certificate with CA's private key
        cert.sign(caPrivateKey, md.sha256.create());

        const pemCertificate = pki.certificateToPem(cert);
        await fs.writeFile(certPath, pemCertificate);
        this.registerFilesWithRenewalService(certPath, null, instance);

        logger.info(`Certificate ${instance} signed by CA and saved to ${certPath}`, null, FILENAME, instance);
        return { certPath, certificate: cert };
    }

    /**
     * Renews a certificate. This is essentially creating a new certificate
     * with the same subject, public key, and extensions but new validity dates,
     * signed by the original issuer.
     * @param {Object} config - Renewal configuration.
     * @param {string} config.existingCertPath - Path to the existing certificate to renew.
     * @param {string} config.newCertPath - Path to save the renewed certificate.
     * @param {string} config.issuerCertPath - Path to the issuer's (CA) certificate.
     * @param {string} config.issuerKeyPath - Path to the issuer's (CA) private key.
     * @param {string} [config.issuerKeyPassphrase] - Passphrase for the issuer's key.
     * @param {number} [config.days=365] - New validity period in days.
     * @param {string} [config.originalEncoding='PEM'] - The original encoding ('PEM' or 'DER') of the certificate being renewed.
     * @param {string} [config.name] - Name for logging.
     * @returns {Promise<{certPath: string, certificate: Object}>}
     */
    async renewCertificate(config = {}) {
        const {
            existingCertPath,
            newCertPath,
            issuerCertPath, // For self-signed, this would be existingCertPath
            issuerKeyPath,  // For self-signed, this would be the key of existingCertPath
            issuerKeyPassphrase,
            days = 365,
            originalEncoding = 'PEM', // Default to PEM if not provided
            name: certNameLog
        } = config;

        const instance = certNameLog || path.basename(newCertPath, path.extname(newCertPath)) || 'renewed-cert';
        logger.debug(`Renewing certificate: ${instance} from ${existingCertPath} (original format: ${originalEncoding})`, { config }, FILENAME, instance);

        if (!existingCertPath || !newCertPath || !issuerCertPath || !issuerKeyPath) {
            throw new Error('existingCertPath, newCertPath, issuerCertPath, and issuerKeyPath are required for renewal.');
        }

        // Load existing certificate
        const existingCertPem = await fs.readFile(existingCertPath, 'utf8'); // Assume existing is readable as PEM for info extraction
        const existingCert = pki.certificateFromPem(existingCertPem);
        if (!existingCert) throw new Error(`Could not load existing certificate from ${existingCertPath}.`);

        // Load issuer (CA) private key
        const issuerKeyPem = await fs.readFile(issuerKeyPath, 'utf8');
        const issuerPrivateKey = pki.decryptPrivateKeyInfo(issuerKeyPem, issuerKeyPassphrase) || pki.privateKeyFromPem(issuerKeyPem);
        if (!issuerPrivateKey) throw new Error(`Could not load issuer private key from ${issuerKeyPath}.`);

        // Load issuer (CA) certificate
        const issuerCertPem = await fs.readFile(issuerCertPath, 'utf8');
        const issuerCert = pki.certificateFromPem(issuerCertPem);
        if (!issuerCert) throw new Error(`Could not load issuer certificate from ${issuerCertPath}.`);

        // Create the new certificate (the "renewed" one)
        const renewedCert = pki.createCertificate();
        renewedCert.publicKey = existingCert.publicKey; // Use the same public key
        renewedCert.serialNumber = '03' + forge.util.bytesToHex(forge.random.getBytesSync(19)); // New serial
        renewedCert.validity.notBefore = new Date();
        renewedCert.validity.notAfter = new Date();
        renewedCert.validity.notAfter.setDate(renewedCert.validity.notBefore.getDate() + days);

        renewedCert.setSubject(existingCert.subject.attributes); // Same subject
        renewedCert.setIssuer(issuerCert.subject.attributes);   // Issued by the same CA

        // Copy extensions from the old certificate, excluding SKI/AKI if they will be re-added
        const extensionsToCopy = existingCert.extensions.filter(ext =>
            ext.name !== 'subjectKeyIdentifier' && ext.name !== 'authorityKeyIdentifier'
        );
         // Add Authority Key Identifier (points to CA's subjectKeyIdentifier)
        const caSki = issuerCert.getExtension({name: 'subjectKeyIdentifier'});
        if (caSki && caSki.subjectKeyIdentifier) { // Check if subjectKeyIdentifier exists
            extensionsToCopy.push({ name: 'authorityKeyIdentifier', keyIdentifier: caSki.subjectKeyIdentifier });
        }
        // Add Subject Key Identifier (for the new cert)
        extensionsToCopy.push({ name: 'subjectKeyIdentifier' });


        renewedCert.setExtensions(extensionsToCopy);

        // Sign the renewed certificate
        renewedCert.sign(issuerPrivateKey, md.sha256.create());

        if (originalEncoding.toUpperCase() === 'DER') {
            const derBytes = Buffer.from(asn1.toDer(pki.certificateToAsn1(renewedCert)).getBytes(), 'binary');
            await fs.writeFile(newCertPath, derBytes, { encoding: 'binary' });
            logger.info(`Certificate ${instance} renewed and saved to ${newCertPath} in DER format.`, null, FILENAME, instance);
        } else { // Default to PEM
            const pemRenewedCertificate = pki.certificateToPem(renewedCert);
            await fs.writeFile(newCertPath, pemRenewedCertificate, 'utf8');
            logger.info(`Certificate ${instance} renewed and saved to ${newCertPath} in PEM format.`, null, FILENAME, instance);
        }
        
        this.registerFilesWithRenewalService(newCertPath, null, instance);

        logger.info(`Certificate ${instance} renewed successfully.`, null, FILENAME, instance);
        return { certPath: newCertPath, certificate: renewedCert };
    }

    /**
     * Validates if a private key and certificate match.
     * @param {string} certPath - Path to the certificate file.
     * @param {string} keyPath - Path to the private key file.
     * @param {string} [passphrase] - Passphrase for the private key if encrypted.
     * @param {string} [certName] - Certificate name for logging.
     * @returns {Promise<boolean>} True if they match, false otherwise.
     */
    async validateKeyPair(certPath, keyPath, passphrase, certName = null) {
        const instance = certName || path.basename(certPath, path.extname(certPath)) || 'keypair-validation';
        logger.debug(`Validating key pair: Cert=${certPath}, Key=${keyPath}`, null, FILENAME, instance);

        try {
            const certPem = await fs.readFile(certPath, 'utf8');
            const certificate = pki.certificateFromPem(certPem);
            if (!certificate) {
                logger.warn(`Failed to parse certificate for validation: ${certPath}`, null, FILENAME, instance);
                return false;
            }

            const keyPem = await fs.readFile(keyPath, 'utf8');
            const privateKey = pki.decryptPrivateKeyInfo(keyPem, passphrase) || pki.privateKeyFromPem(keyPem);
            if (!privateKey) {
                logger.warn(`Failed to parse private key for validation: ${keyPath}`, null, FILENAME, instance);
                return false;
            }

            // Compare the public key from the certificate with the public key derived from the private key
            const pubKeyFromCert = certificate.publicKey;
            let pubKeyFromPrivate;

            if (privateKey.type === 'RSA') {
                pubKeyFromPrivate = pki.rsa.setPublicKey(privateKey.n, privateKey.e);
            } else if (privateKey.type === 'EC') {
                pubKeyFromPrivate = pki.ec.setPublicKey(privateKey.curve, privateKey.publicKey);
            } else {
                logger.warn(`Unsupported key type for validation: ${privateKey.type}`, null, FILENAME, instance);
                return false;
            }

            // node-forge doesn't have a direct pki.comparePublicKeys, so we compare PEM outputs
            const pemPubKeyFromCert = pki.publicKeyToPem(pubKeyFromCert);
            const pemPubKeyFromPrivate = pki.publicKeyToPem(pubKeyFromPrivate);

            const match = pemPubKeyFromCert === pemPubKeyFromPrivate;
            logger.info(`Key pair validation for ${instance}: ${match ? 'Match' : 'Mismatch'}`, null, FILENAME, instance);
            return match;

        } catch (error) {
            logger.error(`Error during key pair validation for ${instance}: ${error.message}`, error, FILENAME, instance);
            return false; // Return false on error to indicate validation failure
        }
    }

    /**
     * Exports a certificate, its private key, and an optional CA chain to a PKCS#12 file.
     * @param {string} certPath - Path to the end-entity certificate PEM file.
     * @param {string} keyPath - Path to the private key PEM file for the certificate.
     * @param {string} [keyPassphrase] - Passphrase for the private key if it's encrypted.
     * @param {Array<string>} [caChainPaths=[]] - Array of paths to CA certificate PEM files in the chain (optional).
     * @param {string} outputPath - Path to save the generated PKCS#12 (.p12 or .pfx) file.
     * @param {string} pkcs12Passphrase - Passphrase to encrypt the PKCS#12 file.
     * @param {string} [friendlyName='My Certificate'] - A friendly name/alias for the certificate entry in the P12 file.
     * @param {string} [certNameLog] - Name for logging context.
     * @returns {Promise<{outputPath: string}>}
     */
    async exportToPkcs12(certPath, keyPath, keyPassphrase, caChainPaths = [], outputPath, pkcs12Passphrase, friendlyName = 'My Certificate', certNameLog = null) {
        const instance = certNameLog || path.basename(outputPath, path.extname(outputPath)) || 'pkcs12-export';
        logger.debug(`Exporting to PKCS#12: ${instance} -> ${outputPath}`, { certPath, keyPath, caChainPathsCount: caChainPaths.length }, FILENAME, instance);

        if (!certPath || !keyPath || !outputPath || !pkcs12Passphrase) {
            throw new Error('certPath, keyPath, outputPath, and pkcs12Passphrase are required for PKCS#12 export.');
        }

        try {
            // Load end-entity certificate
            const certPem = await fs.readFile(certPath, 'utf8');
            const certificate = pki.certificateFromPem(certPem);
            if (!certificate) throw new Error(`Failed to load certificate from ${certPath}`);

            // Load private key
            const keyPem = await fs.readFile(keyPath, 'utf8');
            const privateKey = pki.decryptPrivateKeyInfo(keyPem, keyPassphrase) || pki.privateKeyFromPem(keyPem);
            if (!privateKey) throw new Error(`Failed to load private key from ${keyPath}. Check passphrase if encrypted.`);

            // Load CA chain certificates
            const caChain = [];
            for (const caPath of caChainPaths) {
                const caPem = await fs.readFile(caPath, 'utf8');
                const caCert = pki.certificateFromPem(caPem);
                if (caCert) {
                    caChain.push(caCert);
                } else {
                    logger.warn(`Could not parse CA certificate from ${caPath}, skipping.`, null, FILENAME, instance);
                }
            }

            // Create PKCS#12 ASN.1 object
            // Note: node-forge's toPkcs12Asn1 uses a default encryption algorithm for the overall PFX.
            // For more control, you might need to manually construct SafeBag objects.
            const p12Asn1 = forge.pkcs12.toPkcs12Asn1(
                privateKey,
                certificate,
                caChain,
                {
                    passphrase: pkcs12Passphrase,
                    algorithm: '3des', // or 'aes256', 'aes128' etc. for key protection within P12
                    friendlyName: friendlyName
                }
            );

            // Convert to DER
            const p12Der = forge.asn1.toDer(p12Asn1).getBytes();

            await fs.writeFile(outputPath, p12Der, { encoding: 'binary' });
            this.registerFilesWithRenewalService(outputPath, null, instance);

            logger.info(`Successfully exported to PKCS#12: ${outputPath}`, null, FILENAME, instance);
            return { outputPath };

        } catch (error) {
            logger.error(`Error exporting to PKCS#12 for ${instance}: ${error.message}`, error, FILENAME, instance);
            throw new Error(`Failed to export to PKCS#12: ${error.message}`);
        }
    }

    /**
     * Imports a certificate, private key, and CA chain from a PKCS#12 file.
     * @param {string} p12Path - Path to the PKCS#12 (.p12 or .pfx) file.
     * @param {string} pkcs12Passphrase - Passphrase to decrypt the PKCS#12 file.
     * @param {string} [certNameLog] - Name for logging context.
     * @returns {Promise<{certificatePem: string|null, privateKeyPem: string|null, caChainPems: Array<string>}>}
     *          PEM encoded certificate, private key, and CA chain.
     */
    async importFromPkcs12(p12Path, pkcs12Passphrase, certNameLog = null) {
        const instance = certNameLog || path.basename(p12Path, path.extname(p12Path)) || 'pkcs12-import';
        logger.debug(`Importing from PKCS#12: ${p12Path}`, null, FILENAME, instance);

        if (!p12Path) {
            throw new Error('p12Path is required for PKCS#12 import.');
        }
        // Passphrase can be empty string for unencrypted P12, but node-forge might require null.
        // For simplicity, we assume a passphrase is provided if needed.

        try {
            const p12Der = await fs.readFile(p12Path, { encoding: 'binary' });
            const p12Asn1 = forge.asn1.fromDer(p12Der);

            const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, pkcs12Passphrase); // false for strict DER checking

            let userCertificatePem = null;
            let privateKeyPem = null;
            const caChainPems = [];

            // Iterate over SafeBag objects
            // Each SafeBag can contain a private key, a certificate, or CRLs
            // Typically, one bag for the user cert, one for its key, and others for CAs.
            for (const bagType in p12.safeContents) {
                const bags = p12.safeContents[bagType];
                for (const bag of bags) {
                    if (bag.type === forge.pki.oids.pkcs8ShroudedKeyBag || bag.type === forge.pki.oids.keyBag) { // Key bag
                        if (bag.key) { // keyBag (unencrypted) or decrypted pkcs8ShroudedKeyBag
                            privateKeyPem = forge.pki.privateKeyToPem(bag.key);
                        }
                    } else if (bag.type === forge.pki.oids.certBag) { // Certificate bag
                        if (bag.cert) {
                            // Check if it's the end-entity certificate (often has a friendlyName or is associated with the key)
                            // A common heuristic: the cert whose public key matches the extracted private key.
                            // Or, the one with a specific friendlyName if available and reliable.
                            // For now, we'll assume the first cert that isn't clearly a CA is the user cert.
                            // A more robust way is to check if bag.attributes.friendlyName matches what was used during export.
                            if (!userCertificatePem && bag.cert.publicKey && privateKeyPem) { // Attempt to match with key
                                const tempKey = forge.pki.privateKeyFromPem(privateKeyPem);
                                if (tempKey && bag.cert.publicKey.n && tempKey.n && bag.cert.publicKey.n.compareTo(tempKey.n) === 0) { // RSA example
                                     userCertificatePem = forge.pki.certificateToPem(bag.cert);
                                } else if (tempKey && bag.cert.publicKey.q && tempKey.q && bag.cert.publicKey.q.compareTo(tempKey.q) === 0) { // EC example (simplified)
                                     userCertificatePem = forge.pki.certificateToPem(bag.cert);
                                } else {
                                     caChainPems.push(forge.pki.certificateToPem(bag.cert));
                                }
                            } else if (!userCertificatePem) { // Fallback if key not yet processed or no match possible yet
                                userCertificatePem = forge.pki.certificateToPem(bag.cert);
                            }
                            else {
                                caChainPems.push(forge.pki.certificateToPem(bag.cert));
                            }
                        }
                    }
                }
            }
            
            // If after iterating, userCertificatePem is still null but we have multiple certs,
            // and a private key, try to find the cert that matches the key.
            if (!userCertificatePem && privateKeyPem && caChainPems.length > 0) {
                const tempKey = forge.pki.privateKeyFromPem(privateKeyPem);
                const foundIndex = caChainPems.findIndex(pem => {
                    const cert = forge.pki.certificateFromPem(pem);
                    if (cert.publicKey.n && tempKey.n && cert.publicKey.n.compareTo(tempKey.n) === 0) return true; // RSA
                    if (cert.publicKey.q && tempKey.q && cert.publicKey.q.compareTo(tempKey.q) === 0) return true; // EC
                    return false;
                });
                if (foundIndex > -1) {
                    userCertificatePem = caChainPems.splice(foundIndex, 1)[0];
                }
            }


            logger.info(`Successfully imported from PKCS#12: ${p12Path}. Found cert: ${!!userCertificatePem}, key: ${!!privateKeyPem}, CAs: ${caChainPems.length}`, null, FILENAME, instance);
            return {
                certificatePem: userCertificatePem,
                privateKeyPem: privateKeyPem,
                caChainPems: caChainPems
            };

        } catch (error) {
            logger.error(`Error importing from PKCS#12 ${p12Path}: ${error.message}`, error, FILENAME, instance);
            if (error.message && (error.message.includes('Invalid password') || error.message.includes('MAC verification failed'))) {
                 throw new Error(`Failed to import from PKCS#12: Invalid passphrase or corrupt file.`);
            }
            throw new Error(`Failed to import from PKCS#12: ${error.message}`);
        }
    }


    /**
     * Converts a PEM-encoded certificate to DER format.
     * @param {string} pemInput - PEM string of the certificate or path to a PEM file.
     * @param {string} [outputPath] - Optional path to save the DER output. If not provided, DER bytes are returned.
     * @param {string} [certNameLog] - Name for logging context.
     * @returns {Promise<{derBytes: Buffer, outputPath?: string}>} DER bytes and output path if saved.
     */
    async convertCertificatePemToDer(pemInput, outputPath, certNameLog = null) {
        const instance = certNameLog || 'pem-to-der';
        logger.debug(`Converting certificate PEM to DER for ${instance}`, { outputPathProvided: !!outputPath }, FILENAME, instance);

        try {
            let pemString = pemInput;
            if (await fs.access(pemInput).then(() => true).catch(() => false)) {
                pemString = await fs.readFile(pemInput, 'utf8');
            }

            const certificate = pki.certificateFromPem(pemString);
            if (!certificate) {
                throw new Error('Failed to parse PEM certificate.');
            }

            const derBytes = Buffer.from(asn1.toDer(pki.certificateToAsn1(certificate)).getBytes(), 'binary');

            if (outputPath) {
                await fs.writeFile(outputPath, derBytes, { encoding: 'binary' });
                this.registerFilesWithRenewalService(outputPath, null, instance);
                logger.info(`Certificate converted from PEM to DER and saved to ${outputPath}`, null, FILENAME, instance);
                return { derBytes, outputPath };
            }

            logger.info(`Certificate converted from PEM to DER (bytes returned)`, null, FILENAME, instance);
            return { derBytes };

        } catch (error) {
            logger.error(`Error converting certificate PEM to DER for ${instance}: ${error.message}`, error, FILENAME, instance);
            throw new Error(`PEM to DER conversion failed: ${error.message}`);
        }
    }

    /**
     * Converts a DER-encoded certificate to PEM format.
     * @param {Buffer|string} derInput - DER Buffer of the certificate or path to a DER file.
     * @param {string} [outputPath] - Optional path to save the PEM output. If not provided, PEM string is returned.
     * @param {string} [certNameLog] - Name for logging context.
     * @returns {Promise<{pemString: string, outputPath?: string}>} PEM string and output path if saved.
     */
    async convertCertificateDerToPem(derInput, outputPath, certNameLog = null) {
        const instance = certNameLog || 'der-to-pem';
        logger.debug(`Converting certificate DER to PEM for ${instance}`, { outputPathProvided: !!outputPath }, FILENAME, instance);

        try {
            let derBuffer = derInput;
            if (typeof derInput === 'string' && (await fs.access(derInput).then(() => true).catch(() => false))) {
                derBuffer = await fs.readFile(derInput); // Reads as Buffer by default without encoding
            } else if (typeof derInput === 'string') { // Assume it's a hex string or similar if not a path
                 throw new Error('DER input string provided but not a valid file path. Please provide a Buffer or file path.');
            }


            if (!Buffer.isBuffer(derBuffer)) {
                throw new Error('Invalid DER input. Must be a Buffer or a file path to a DER file.');
            }

            const certificate = pki.certificateFromAsn1(asn1.fromDer(derBuffer.toString('binary'))); // toString('binary') is key
            if (!certificate) {
                throw new Error('Failed to parse DER certificate.');
            }

            const pemString = pki.certificateToPem(certificate);

            if (outputPath) {
                await fs.writeFile(outputPath, pemString, 'utf8');
                this.registerFilesWithRenewalService(outputPath, null, instance);
                logger.info(`Certificate converted from DER to PEM and saved to ${outputPath}`, null, FILENAME, instance);
                return { pemString, outputPath };
            }

            logger.info(`Certificate converted from DER to PEM (string returned)`, null, FILENAME, instance);
            return { pemString };

        } catch (error) {
            logger.error(`Error converting certificate DER to PEM for ${instance}: ${error.message}`, error, FILENAME, instance);
            throw new Error(`DER to PEM conversion failed: ${error.message}`);
        }
    }

    /**
     * Exports certificates to a PKCS#7 bundle (P7B file).
     * Typically contains the end-entity certificate and its chain of CA certificates.
     * Does NOT include private keys.
     * @param {string} endEntityCertPath - Path to the end-entity certificate PEM file.
     * @param {Array<string>} [caChainPaths=[]] - Array of paths to CA certificate PEM files in the chain.
     * @param {string} outputPath - Path to save the generated PKCS#7 (.p7b) file.
     * @param {string} [certNameLog] - Name for logging context.
     * @returns {Promise<{outputPath: string}>}
     */
    async exportToPkcs7(endEntityCertPath, caChainPaths = [], outputPath, certNameLog = null) {
        const instance = certNameLog || path.basename(outputPath, path.extname(outputPath)) || 'pkcs7-export';
        logger.debug(`Exporting to PKCS#7 (P7B): ${instance} -> ${outputPath}`, { endEntityCertPath, caChainPathsCount: caChainPaths.length }, FILENAME, instance);

        if (!endEntityCertPath || !outputPath) {
            throw new Error('endEntityCertPath and outputPath are required for PKCS#7 export.');
        }

        try {
            const certificates = [];

            // Load end-entity certificate
            const endEntityPem = await fs.readFile(endEntityCertPath, 'utf8');
            const endEntityCert = pki.certificateFromPem(endEntityPem);
            if (!endEntityCert) throw new Error(`Failed to load end-entity certificate from ${endEntityCertPath}`);
            certificates.push(endEntityCert);

            // Load CA chain certificates
            for (const caPath of caChainPaths) {
                const caPem = await fs.readFile(caPath, 'utf8');
                const caCert = pki.certificateFromPem(caPem);
                if (caCert) {
                    certificates.push(caCert);
                } else {
                    logger.warn(`Could not parse CA certificate from ${caPath} for P7B, skipping.`, null, FILENAME, instance);
                }
            }

            if (certificates.length === 0) {
                throw new Error('No valid certificates found to include in PKCS#7 bundle.');
            }

            // Create PKCS#7 message
            const p7 = forge.pkcs7.createSignedData();
            certificates.forEach(cert => p7.addCertificate(cert));
            // Note: For a simple P7B (certs-only bundle), we don't add signers or content.
            // The structure is a SignedData type, but it can be used to just convey certificates.

            const p7Asn1 = p7.toAsn1();
            const p7Der = forge.asn1.toDer(p7Asn1).getBytes();

            await fs.writeFile(outputPath, p7Der, { encoding: 'binary' });
            this.registerFilesWithRenewalService(outputPath, null, instance);

            logger.info(`Successfully exported to PKCS#7 (P7B): ${outputPath}`, null, FILENAME, instance);
            return { outputPath };

        } catch (error) {
            logger.error(`Error exporting to PKCS#7 for ${instance}: ${error.message}`, error, FILENAME, instance);
            throw new Error(`Failed to export to PKCS#7: ${error.message}`);
        }
    }

    /**
     * Imports certificates from a PKCS#7 bundle (P7B file).
     * @param {string} p7bPath - Path to the PKCS#7 (.p7b) file.
     * @param {string} [certNameLog] - Name for logging context.
     * @returns {Promise<{certificatesPem: Array<string>}>} Array of PEM encoded certificates.
     */
    async importFromPkcs7(p7bPath, certNameLog = null) {
        const instance = certNameLog || path.basename(p7bPath, path.extname(p7bPath)) || 'pkcs7-import';
        logger.debug(`Importing from PKCS#7 (P7B): ${p7bPath}`, null, FILENAME, instance);

        if (!p7bPath) {
            throw new Error('p7bPath is required for PKCS#7 import.');
        }

        try {
            const p7bDer = await fs.readFile(p7bPath, { encoding: 'binary' });
            const p7bAsn1 = forge.asn1.fromDer(p7bDer);

            const message = forge.pkcs7.messageFromAsn1(p7bAsn1);

            const certificatesPem = [];
            if (message.certificates && message.certificates.length > 0) {
                message.certificates.forEach(cert => {
                    certificatesPem.push(pki.certificateToPem(cert));
                });
            }

            logger.info(`Successfully imported ${certificatesPem.length} certificates from PKCS#7 (P7B): ${p7bPath}`, null, FILENAME, instance);
            return { certificatesPem };

        } catch (error) {
            logger.error(`Error importing from PKCS#7 ${p7bPath}: ${error.message}`, error, FILENAME, instance);
            throw new Error(`Failed to import from PKCS#7: ${error.message}`);
        }
    }

    
    /**
     * Loads a certificate from a file, attempting to parse as PEM then DER.
     * Handles common extensions like .pem, .crt, .cer, .der.
     * @param {string} filePath - Path to the certificate file.
     * @param {string} [certNameLog] - Name for logging context.
     * @returns {Promise<Object|null>} node-forge certificate object or null if parsing fails.
     */
    async loadCertificateFromFile(filePath, certNameLog = null) {
        const instance = certNameLog || path.basename(filePath, path.extname(filePath)) || 'cert-loader';
        logger.debug(`Loading certificate from file: ${filePath}`, null, FILENAME, instance);

        if (!filePath || !(await fs.access(filePath).then(() => true).catch(() => false))) {
            logger.warn(`Certificate file not found or path invalid: ${filePath}`, null, FILENAME, instance);
            return null;
        }

        try {
            // Try PEM first
            const fileContent = await fs.readFile(filePath, 'utf8');
            const certFromPem = pki.certificateFromPem(fileContent);
            if (certFromPem) {
                logger.fine(`Successfully loaded certificate as PEM from ${filePath}`, null, FILENAME, instance);
                return certFromPem;
            }
        } catch (pemError) {
            logger.finest(`Failed to parse ${filePath} as PEM: ${pemError.message}. Attempting DER.`, null, FILENAME, instance);
        }

        try {
            // Try DER
            const derBuffer = await fs.readFile(filePath); // Read as buffer
            const certFromDer = pki.certificateFromAsn1(asn1.fromDer(derBuffer.toString('binary')));
            if (certFromDer) {
                logger.fine(`Successfully loaded certificate as DER from ${filePath}`, null, FILENAME, instance);
                return certFromDer;
            }
        } catch (derError) {
            logger.finest(`Failed to parse ${filePath} as DER: ${derError.message}`, null, FILENAME, instance);
        }

        logger.warn(`Failed to load certificate from ${filePath}. Could not parse as PEM or DER.`, null, FILENAME, instance);
        return null;
    }


    /**
     * Loads a private key from a file, attempting to parse as PEM.
     * Handles common extensions like .pem, .key.
     * @param {string} filePath - Path to the private key file.
     * @param {string} [passphrase] - Passphrase if the key is encrypted.
     * @param {string} [keyNameLog] - Name for logging context.
     * @returns {Promise<Object|null>} node-forge private key object or null if parsing fails.
     */
    async loadPrivateKeyFromFile(filePath, passphrase, keyNameLog = null) {
        const instance = keyNameLog || path.basename(filePath, path.extname(filePath)) || 'key-loader';
        logger.debug(`Loading private key from file: ${filePath}`, null, FILENAME, instance);

         if (!filePath || !(await fs.access(filePath).then(() => true).catch(() => false))) {
            logger.warn(`Private key file not found or path invalid: ${filePath}`, null, FILENAME, instance);
            return null;
        }

        try {
            const keyPem = await fs.readFile(filePath, 'utf8');
            let privateKey = null;

            // Try to decrypt if passphrase provided, otherwise parse directly
            if (passphrase) {
                privateKey = pki.decryptPrivateKeyInfo(keyPem, passphrase);
            }
            if (!privateKey) { // If no passphrase, or decryption failed, try as unencrypted
                privateKey = pki.privateKeyFromPem(keyPem);
            }

            if (privateKey) {
                logger.fine(`Successfully loaded private key from ${filePath}`, null, FILENAME, instance);
                return privateKey;
            } else {
                logger.warn(`Failed to parse private key from ${filePath}. If encrypted, ensure passphrase is correct.`, null, FILENAME, instance);
                return null;
            }
        } catch (error) {
            logger.error(`Error loading private key from ${filePath}: ${error.message}`, error, FILENAME, instance);
            return null;
        }
    }

    /**
     * Verifies a certificate chain.
     * @param {string} certToVerifyPath - Path to the PEM certificate file to verify.
     * @param {Array<string>} caCertPaths - Array of paths to PEM CA certificates forming the trust chain (intermediates and root).
     * @param {string} [certNameLog] - Name for logging context.
     * @returns {Promise<{verified: boolean, error: string|null, message: string}>} Verification result.
     */
    async verifyCertificateChain(certToVerifyPath, caCertPaths = [], certNameLog = null) {
        const instance = certNameLog || path.basename(certToVerifyPath, path.extname(certToVerifyPath)) || 'chain-validation';
        logger.debug(`Verifying certificate chain for: ${certToVerifyPath}`, { caCount: caCertPaths.length }, FILENAME, instance);

        if (!certToVerifyPath) {
            throw new Error('certToVerifyPath is required for chain verification.');
        }

        try {
            const certToVerifyPem = await fs.readFile(certToVerifyPath, 'utf8');
            const certificateToVerify = pki.certificateFromPem(certToVerifyPem);
            if (!certificateToVerify) {
                return { verified: false, error: 'Failed to parse certificate to verify.', message: 'Could not parse the certificate file.' };
            }

            const caStore = pki.createCaStore();
            const intermediateCerts = [];

            for (const caPath of caCertPaths) {
                try {
                    const caPem = await fs.readFile(caPath, 'utf8');
                    const caCert = pki.certificateFromPem(caPem);
                    if (caCert) {
                        // Heuristic: if a CA cert is self-signed, treat it as a potential trust anchor.
                        // Otherwise, treat it as an intermediate.
                        // For a more robust system, you might have a separate list of explicit trust anchors.
                        if (caCert.isIssuer(caCert.subject)) { // Self-signed, likely a root
                            caStore.addCertificate(caCert);
                        } else {
                            intermediateCerts.push(caCert);
                        }
                    } else {
                         logger.warn(`Could not parse CA certificate from ${caPath} during chain verification.`, null, FILENAME, instance);
                    }
                } catch (fileError) {
                    logger.warn(`Error reading CA certificate file ${caPath}: ${fileError.message}`, null, FILENAME, instance);
                }
            }
            
            if (caStore.listAllCertificates().length === 0 && intermediateCerts.length > 0) {
                // If no self-signed CAs were found to add to store, but we have intermediates,
                // it implies the user might have provided only intermediates and expects one of them
                // (or the system's default store, which node-forge doesn't use by default) to be the root.
                // For this function, we require the explicit chain including the root to be provided.
                // A common pattern is that the last cert in caCertPaths is the root.
                // Let's try adding the last intermediate as a trust anchor if no other roots are in the store.
                // This is a heuristic.
                const lastCertInChain = intermediateCerts[intermediateCerts.length -1];
                if(lastCertInChain && lastCertInChain.isIssuer(lastCertInChain.subject)) { // Check if it's self-signed
                    caStore.addCertificate(lastCertInChain);
                    logger.fine(`Added last CA in chain (${lastCertInChain.subject.getField('CN').value}) as trust anchor as no other roots were found in store.`, null, FILENAME, instance);
                } else {
                     logger.warn(`No root CAs found in the CA store for chain verification of ${instance}. Verification might fail if certificate is not self-signed.`, null, FILENAME, instance);
                }
            }


            let verified = false;
            let verificationError = null;
            let message = '';

            try {
                // The second argument to verifyCertificateChain is an array of untrusted intermediate certs.
                pki.verifyCertificateChain(caStore, [certificateToVerify, ...intermediateCerts]);
                verified = true;
                message = 'Certificate chain verified successfully.';
                logger.info(message, null, FILENAME, instance);
            } catch (e) {
                verified = false;
                verificationError = e.message || 'Unknown verification error';
                if (e.error && e.message) { // forge often has e.error and e.message
                    verificationError = `${e.message} (Code: ${e.error})`;
                }
                message = `Certificate chain verification failed: ${verificationError}`;
                logger.warn(message, e, FILENAME, instance);
            }

            return { verified, error: verificationError, message };

        } catch (error) {
            logger.error(`Error during certificate chain verification setup for ${instance}: ${error.message}`, error, FILENAME, instance);
            return { verified: false, error: error.message, message: `Setup error: ${error.message}` };
        }
    }

}

module.exports = ForgeCryptoService;