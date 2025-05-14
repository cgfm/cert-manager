/**
 * OpenSSL Wrapper Module using direct command execution
 * @module OpenSSLWrapper
 * @version 0.3.0
 * @license MIT
 * @author Christian Meiners
 * @description This module provides a reliable wrapper around OpenSSL for certificate management operations.
 * Updated to work with the new Certificate structure using sans object.
 */

const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { exec, execSync } = require('child_process');
const logger = require('./logger');

const execAsync = promisify(exec);
const fsPromises = fs.promises;

const FILENAME = 'services/openssl-wrapper.js';

/**
 * OpenSSL Wrapper for certificate operations
 */
class OpenSSLWrapper {
  /**
   * Create a new OpenSSL wrapper instance
   */
  constructor() {
    logger.debug('Initializing OpenSSL wrapper', null, FILENAME);

    // Check if OpenSSL is installed
    try {
      const versionOutput = execSync('openssl version', { encoding: 'utf8' });
      logger.info(`OpenSSL version detected: ${versionOutput.trim()}`, null, FILENAME);

      // Default duration for file ignores (in milliseconds)
      this.defaultIgnoreDuration = 5000; // 5 seconds

      // Reference to renewal service (will be set later if needed)
      this.renewalService = null;
    } catch (error) {
      logger.error('OpenSSL is not installed or not available in PATH', error, FILENAME);
      throw new Error('OpenSSL is not installed or not available in PATH');
    }
  }

  /**
   * Set the renewal service instance
   * @param {Object} renewalService - The renewal service instance
   */
  setRenewalService(renewalService) {
    this.renewalService = renewalService;
    logger.debug('Renewal service set for OpenSSL wrapper', null, FILENAME);
  }

  /**
   * Register files that will be created or modified with the renewal service
   * @param {string|string[]} filePaths - Single file path or array of file paths
   * @param {number} [duration] - Duration in ms to ignore the files (default: this.defaultIgnoreDuration)
   */
  registerFilesWithRenewalService(filePaths, duration) {
    if (!this.renewalService) {
      logger.debug('No renewal service registered, skipping file registration', null, FILENAME);
      return;
    }

    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];

    if (paths.length === 0 || paths.some(p => !p)) {
      return;
    }

    // Filter null/undefined paths and log the registration
    const validPaths = paths.filter(p => p);

    logger.debug(`Registering ${validPaths.length} file(s) with renewal service to be ignored during operations`, null, FILENAME);
    logger.fine(`Files to ignore: ${validPaths.join(', ')}`, null, FILENAME);

    try {
      this.renewalService.ignoreFilePaths(validPaths, duration || this.defaultIgnoreDuration);
    } catch (error) {
      logger.warn(`Failed to register files with renewal service: ${error.message}`, error, FILENAME);
    }
  }

  /**
   * Execute an OpenSSL command
   * @param {string} cmd - Command to execute
   * @returns {Promise<string>} Command output
   */
  async execute(cmd) {
    try {
      // Mask sensitive information for logging
      const logCmd = cmd.replace(/pass:"[^"]*"/g, 'pass:"***"');
      logger.fine(`Executing OpenSSL command: ${logCmd}`, null, FILENAME);

      const { stdout, stderr } = await execAsync(cmd);

      if (stderr && !stderr.includes('Loading') && !stderr.includes('writing')) {
        logger.warn(`OpenSSL warning`, stderr, FILENAME);
      }

      return stdout.trim();
    } catch (error) {
      logger.error('OpenSSL execution error', error, FILENAME);
      throw new Error(`OpenSSL execution failed: ${error.stderr || error.message}`);
    }
  }

  /**
   * Create a temporary file with content
   * @param {string} content - Content for the file
   * @param {string} [ext='.tmp'] - File extension
   * @returns {Promise<string>} Path to the temporary file
   */
  async _createTempFile(content, ext = '.tmp') {
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `cert-${crypto.randomBytes(8).toString('hex')}${ext}`);

    logger.finest(`Creating temporary file with extension ${ext} at ${tempFilePath}`, null, FILENAME);
    await fsPromises.writeFile(tempFilePath, content);
    return tempFilePath;
  }

  /**
   * Delete a temporary file
   * @param {string} filePath - Path to the file
   */
  async _deleteTempFile(filePath) {
    if (!filePath) return;

    try {
      logger.finest(`Deleting temporary file: ${filePath}`, null, FILENAME);
      await fsPromises.unlink(filePath);
    } catch (error) {
      logger.warn(`Failed to delete temporary file ${filePath}`, error, FILENAME);
    }
  }

  /**
   * Create a temporary directory for certificate operations
   * @param {string} certificateName - Name of the certificate (for nice naming)
   * @returns {Promise<string>} Path to temporary directory
   * @private
   */
  async _createTempCertDir(certificateName) {
    const safeName = certificateName?.replace(/[^a-zA-Z0-9-]/g, '_') || 'cert';
    const randomId = crypto.randomBytes(4).toString('hex');
    const tempDirPath = path.join(os.tmpdir(), `certmgr-${safeName}-${randomId}`);

    logger.fine(`Creating temporary directory for certificate operations: ${tempDirPath}`, null, FILENAME);
    await fsPromises.mkdir(tempDirPath, { recursive: true });

    return tempDirPath;
  }

  /**
   * Create temp certificate paths for a certificate
   * @param {string} certName - Certificate name
   * @param {Object} options - Options like file extensions
   * @returns {Object} Object with paths
   */
  async createTempCertPaths(certName, options = {}) {
    const tempDir = await this._createTempCertDir(certName);
    const safeName = certName.replace(/[^a-zA-Z0-9-]/g, '_');

    const crtExt = options.crtExt || '.crt';
    const keyExt = options.keyExt || '.key';
    const csrExt = options.csrExt || '.csr';

    const result = {
      tempDir,
      certPath: path.join(tempDir, `${safeName}${crtExt}`),
      keyPath: path.join(tempDir, `${safeName}${keyExt}`),
      csrPath: path.join(tempDir, `${safeName}${csrExt}`)
    };

    logger.fine(`Created temporary certificate paths:`, null, FILENAME);
    logger.fine(`  Cert: ${result.certPath}`, null, FILENAME);
    logger.fine(`  Key: ${result.keyPath}`, null, FILENAME);
    logger.fine(`  CSR: ${result.csrPath}`, null, FILENAME);

    return result;
  }

  /**
   * Extract certificate information
   * @param {string} certPath - Path to certificate file
   * @returns {Promise<Object>} Certificate information
   */
  async getCertificateInfo(certPath) {
    if (!fs.existsSync(certPath)) {
      logger.error(`Certificate file not found: ${certPath}`, null, FILENAME);
      throw new Error(`Certificate file not found: ${certPath}`);
    }

    logger.debug(`Extracting certificate information from: ${certPath}`, null, FILENAME);

    try {
      // Get certificate text representation
      logger.fine(`Getting full certificate text representation`, null, FILENAME);
      const certText = await this.execute(`openssl x509 -in "${certPath}" -text -noout`);
      logger.finest(`Certificate text length: ${certText.length} characters`, null, FILENAME);

      // Get fingerprint
      const fingerprintRaw = await this.execute(`openssl x509 -in "${certPath}" -fingerprint -sha256 -noout`);
      logger.finest(`Raw fingerprint output: ${fingerprintRaw}`, null, FILENAME);

      // Clean fingerprint: Remove "SHA256 Fingerprint=" prefix and colons
      const fingerprint = fingerprintRaw
        .trim()
        .toUpperCase()
        .replace(/SHA256 FINGERPRINT=|sha256 Fingerprint=/i, '')
        .replace(/:/g, '');
      logger.fine(`Cleaned fingerprint: ${fingerprint}`, null, FILENAME);

      // Extract subject
      let subject = '';
      let subjectMatch = certText.match(/Subject:([^\n]+)(?:\n|$)/);
      if (!subjectMatch) {
        // Try with multiline subject
        subjectMatch = certText.match(/Subject:(.+?)(?=\n(?!\s))/s);
      }

      if (subjectMatch) {
        subject = subjectMatch[1].trim();
        logger.fine(`Extracted subject: ${subject}`, null, FILENAME);
      } else {
        // Try one more method - directly from openssl
        try {
          subject = await this.execute(`openssl x509 -in "${certPath}" -noout -subject`);
          subject = subject.replace(/^subject=\s*/i, '').trim();
          logger.fine(`Extracted subject using direct method: ${subject}`, null, FILENAME);
        } catch (subjectError) {
          logger.warn(`Failed to extract subject: ${subjectError.message}`, null, FILENAME);
        }
      }

      // Extract issuer
      let issuer = '';
      let issuerMatch = certText.match(/Issuer:([^\n]+)(?:\n|$)/);
      if (!issuerMatch) {
        // Try with multiline issuer
        issuerMatch = certText.match(/Issuer:(.+?)(?=\n(?!\s))/s);
      }

      if (issuerMatch) {
        issuer = issuerMatch[1].trim();
        logger.fine(`Extracted issuer: ${issuer}`, null, FILENAME);
      } else {
        // Try one more method - directly from openssl
        try {
          issuer = await this.execute(`openssl x509 -in "${certPath}" -noout -issuer`);
          issuer = issuer.replace(/^issuer=\s*/i, '').trim();
          logger.fine(`Extracted issuer using direct method: ${issuer}`, null, FILENAME);
        } catch (issuerError) {
          logger.warn(`Failed to extract issuer: ${issuerError.message}`, null, FILENAME);
        }
      }

      // Extract CN
      let name = path.basename(certPath, path.extname(certPath));
      const cnMatch = subject.match(/CN\s*=\s*([^,/]+)/i);
      if (cnMatch) {
        name = cnMatch[1].trim();
        logger.fine(`Extracted name (CN): ${name}`, null, FILENAME);
      }

      // Extract validity dates
      const validFromMatch = certText.match(/Not Before\s*:\s*(.+?)(?: GMT| UTC)?(?=\n)/i);
      const validToMatch = certText.match(/Not After\s*:\s*(.+?)(?: GMT| UTC)?(?=\n)/i);
      logger.finest(`Validity matches - From: ${JSON.stringify(validFromMatch)}, To: ${JSON.stringify(validToMatch)}`, null, FILENAME);

      const validFrom = validFromMatch ? validFromMatch[1].trim() : '';
      const validTo = validToMatch ? validToMatch[1].trim() : '';
      logger.fine(`Extracted validity dates - From: ${validFrom}, To: ${validTo}`, null, FILENAME);

      // Check if certificate is a CA
      const isCA = certText.includes('CA:TRUE');
      logger.fine(`Is CA: ${isCA}`, null, FILENAME);

      // Extract CA path length if present
      let pathLenConstraint = null;
      const pathLenMatch = certText.match(/pathlen\s*:\s*(\d+)/i);
      if (pathLenMatch) {
        pathLenConstraint = parseInt(pathLenMatch[1], 10);
        logger.fine(`Found path length constraint: ${pathLenConstraint}`, null, FILENAME);
      }

      // Determine certificate type
      let certType = 'standard';
      if (isCA) {
        logger.fine(`Checking if certificate is self-signed by comparing:`, null, FILENAME);
        logger.finest(`Subject: ${subject}`, null, FILENAME);
        logger.finest(`Issuer:  ${issuer}`, null, FILENAME);

        const selfSigned = this._isSelfSigned(subject, issuer);
        logger.fine(`Self-signed result: ${selfSigned}`, null, FILENAME);

        if (selfSigned && pathLenConstraint === null) {
          certType = 'rootCA';
        } else {
          certType = 'intermediateCA';
        }
        logger.debug(`Determined certificate type: ${certType}`, null, FILENAME);
      }

      // Extract domains from SAN
      const domains = [];

      // Check for Subject Alternative Names (SAN)
      logger.fine(`Looking for Subject Alternative Names (SAN) section`, null, FILENAME);
      const sanMatch = certText.match(/X509v3 Subject Alternative Name:[^]*?((?:DNS|IP Address|IP):[^]*?)(?=\n\s*[A-Za-z0-9]|\n\n|$)/);
      logger.finest(`SAN match: ${JSON.stringify(sanMatch)}`, null, FILENAME);

      if (sanMatch && sanMatch[1]) {
        const sanText = sanMatch[1].trim();
        logger.fine(`Found SAN text: "${sanText}"`, null, FILENAME);

        // Log every DNS entry found with detailed regex matches
        logger.fine(`Extracting DNS entries with regex: /DNS:([^,\s]+)/g`, null, FILENAME);
        const dnsMatches = [...sanText.matchAll(/DNS:([^,\s]+)/g)];
        logger.fine(`DNS matches count: ${dnsMatches.length}`, null, FILENAME);

        // Log each match for detailed examination
        dnsMatches.forEach((match, index) => {
          logger.finest(`DNS match #${index + 1}: ${JSON.stringify(match)}`, null, FILENAME);
          domains.push(match[1].trim());
        });
      }

      // Log final domains list
      logger.debug(`Final domains list (length: ${domains.length}): ${JSON.stringify(domains)}`, null, FILENAME);

      // If no SAN domains and we have a CN that looks like a domain, add it
      if (domains.length === 0 &&
        cnMatch &&
        cnMatch[1].includes('.')) {
        logger.fine(`No SAN domains found. Adding CN as domain: ${cnMatch[1].trim()}`, null, FILENAME);
        domains.push(cnMatch[1].trim());
      }

      // Extract IP addresses from SAN
      const ips = [];
      if (sanMatch && sanMatch[1]) {
        const sanText = sanMatch[1].trim();
        logger.fine(`Extracting IP addresses from SAN section`, null, FILENAME);

        // Look for IP Address entries
        const ipMatches = [...sanText.matchAll(/IP(?:\s*Address)?:([^,\s]+)/g)];
        logger.fine(`IP matches count: ${ipMatches.length}`, null, FILENAME);

        ipMatches.forEach((match, index) => {
          logger.finest(`IP match #${index + 1}: ${JSON.stringify(match)}`, null, FILENAME);
          ips.push(match[1].trim());
        });
      }

      // Log final IPs list
      logger.debug(`Final IPs list (length: ${ips.length}): ${JSON.stringify(ips)}`, null, FILENAME);

      // Extract issuer CN to identify the CA name
      let issuerCN = '';
      const issuerCNMatch = issuer.match(/CN\s*=\s*([^,/]+)/i);
      logger.finest(`Issuer CN match: ${JSON.stringify(issuerCNMatch)}`, null, FILENAME);
      if (issuerCNMatch) {
        issuerCN = issuerCNMatch[1].trim();
        logger.fine(`Extracted issuer CN: ${issuerCN}`, null, FILENAME);
      }

      // Extract serial number
      const serialMatch = certText.match(/Serial Number:(?:\s+|:)([0-9a-fA-F:]+)/);
      logger.finest(`Serial number match: ${JSON.stringify(serialMatch)}`, null, FILENAME);
      const serialNumber = serialMatch ? serialMatch[1].replace(/:/g, '') : '';
      logger.fine(`Extracted serial number: ${serialNumber}`, null, FILENAME);

      // Extract subject key identifier
      const subjectKeyIdMatch = certText.match(/Subject Key Identifier:(?:[^]*?(?:keyid:)?)?([0-9a-fA-F:]+)/);
      logger.finest(`Subject key identifier match: ${JSON.stringify(subjectKeyIdMatch)}`, null, FILENAME);
      const keyId = subjectKeyIdMatch ? subjectKeyIdMatch[1].replace(/:/g, '') : '';
      logger.fine(`Extracted subject key ID: ${keyId}`, null, FILENAME);

      // Extract certificate authority key identifier if available
      const keyIdMatch = certText.match(/Authority Key Identifier:(?:[^]*?(?:keyid:)?)([0-9a-fA-F:]+)/);
      logger.finest(`Authority key identifier match: ${JSON.stringify(keyIdMatch)}`, null, FILENAME);
      const authorityKeyId = keyIdMatch ? keyIdMatch[1].replace(/:/g, '') : '';
      logger.fine(`Extracted authority key ID: ${authorityKeyId}`, null, FILENAME);

      // Determine if self-signed by comparing subject and issuer
      const selfSigned = this._isSelfSigned(subject, issuer);
      logger.fine(`Certificate is self-signed: ${selfSigned}`, null, FILENAME);

      // Extract key type and size
      logger.fine(`Extracting key type and size from certificate`, null, FILENAME);
      let keyType = 'RSA'; // Default
      let keySize = 2048; // Default
      let sigAlg = null;

      // Look for signature algorithm
      const sigAlgMatch = certText.match(/Signature Algorithm: ([^\s]+)/);
      if (sigAlgMatch) {
        sigAlg = sigAlgMatch[1].trim();
        logger.fine(`Extracted signature algorithm: ${sigAlg}`, null, FILENAME);
      }

      // Look for key type and size
      const keyInfoMatch = certText.match(/Public Key: ([^(]+)\(([0-9]+) bit\)/);
      if (keyInfoMatch) {
        keyType = keyInfoMatch[1].trim();
        keySize = parseInt(keyInfoMatch[2], 10);
        logger.fine(`Extracted key type: ${keyType}, size: ${keySize}`, null, FILENAME);
      } else {
        // Alternative method for key size
        if (certText.includes('Public-Key: (')) {
          const keySizeMatch = certText.match(/Public-Key: \(([0-9]+) bit\)/);
          if (keySizeMatch) {
            keySize = parseInt(keySizeMatch[1], 10);
            logger.fine(`Extracted key size using alternative method: ${keySize}`, null, FILENAME);

            // Try to determine key type
            if (certText.includes('RSA Public-Key')) {
              keyType = 'RSA';
            } else if (certText.includes('EC Public-Key')) {
              keyType = 'EC';
            } else if (certText.includes('DSA Public-Key')) {
              keyType = 'DSA';
            }
            logger.fine(`Determined key type: ${keyType}`, null, FILENAME);
          }
        }
      }

      // Create result object using the new structure
      const result = {
        fingerprint,
        name,
        subject,
        issuer,
        issuerCN,
        validFrom,
        validTo,
        certType,
        sans: {
          domains,
          ips,
          idleDomains: [], // Will be populated later when needed
          idleIps: []      // Will be populated later when needed
        },
        isCA,
        isRootCA: certType === 'rootCA',
        pathLenConstraint,
        serialNumber,
        keyId,
        authorityKeyId,
        keyType,
        keySize,
        sigAlg,
        selfSigned,
        commonName: name
      };

      logger.debug(`Certificate info extraction complete for: ${certPath}`, null, FILENAME);
      logger.debug(`Name: ${result.name}`, null, FILENAME);
      logger.debug(`Subject: ${result.subject}`, null, FILENAME);
      logger.debug(`Issuer: ${result.issuer}`, null, FILENAME);
      logger.debug(`Fingerprint: ${result.fingerprint}`, null, FILENAME);
      logger.debug(`Domains count: ${domains.length}`, null, FILENAME);
      logger.debug(`Certificate type: ${certType}`, null, FILENAME);

      return result;
    } catch (error) {
      logger.error(`Failed to extract certificate information for ${certPath}`, error, FILENAME);
      throw error;
    }
  }

  /**
   * Check if a certificate is self-signed by comparing subject and issuer
   * @param {string} subject - Certificate subject
   * @param {string} issuer - Certificate issuer
   * @returns {boolean} True if self-signed
   * @private
   */
  _isSelfSigned(subject, issuer) {
    logger.fine(`isSelfSigned check - Comparing:`, null, FILENAME);
    logger.finest(`Subject: "${subject}"`, null, FILENAME);
    logger.finest(`Issuer:  "${issuer}"`, null, FILENAME);

    // Direct string comparison first as most efficient check
    if (subject === issuer) {
      logger.fine(`Direct string comparison matched - self-signed: true`, null, FILENAME);
      return true;
    }

    // We need to normalize the strings to handle cases where order or spacing might differ
    const normalizeString = (str) => {
      logger.finest(`Normalizing string: "${str}"`, null, FILENAME);
      // Extract components
      const components = [];
      const regex = /(C|ST|L|O|OU|CN)\s*=\s*([^,/]+)/gi;
      let match;

      while (match = regex.exec(str)) {
        components.push({ key: match[1].toUpperCase(), value: match[2].trim() });
        logger.finest(`  Found component: ${match[1].toUpperCase()}=${match[2].trim()}`, null, FILENAME);
      }

      logger.finest(`  Extracted ${components.length} components`, null, FILENAME);

      // Sort by key
      components.sort((a, b) => a.key.localeCompare(b.key));

      // Reconstruct normalized string
      const normalized = components.map(c => `${c.key}=${c.value}`).join(', ');
      logger.finest(`  Normalized result: "${normalized}"`, null, FILENAME);
      return normalized;
    };

    const normalizedSubject = normalizeString(subject);
    const normalizedIssuer = normalizeString(issuer);

    const result = normalizedSubject === normalizedIssuer;
    logger.fine(`Normalized comparison result - self-signed: ${result}`, null, FILENAME);
    return result;
  }

  /**
   * Find the parent certificate (issuer) for a given certificate
   * @param {Object} cert - Certificate object with full details
   * @param {Array} allCerts - Array of all known certificates
   * @returns {Object|null} Parent certificate or null if not found
   */
  async findParentCertificate(cert, allCerts) {
    if (!cert || !allCerts || !Array.isArray(allCerts) || allCerts.length === 0) {
      logger.debug(`findParentCertificate: Invalid parameters`, null, FILENAME);
      return null;
    }

    logger.debug(`Finding parent certificate for: ${cert.name} (${cert.fingerprint})`, null, FILENAME);
    logger.fine(`Total certificates to search: ${allCerts.length}`, null, FILENAME);

    // If self-signed, this is its own parent
    if (cert.selfSigned) {
      logger.fine(`Certificate is self-signed - returning itself as parent`, null, FILENAME);
      return cert;
    }

    // Try to find the parent using authority key identifier
    if (cert.authorityKeyId) {
      logger.fine(`Looking for parent by authorityKeyId: ${cert.authorityKeyId}`, null, FILENAME);

      // Log all available keyIds for debugging
      const availableKeyIds = allCerts
        .filter(c => c.isCA && c.keyId)
        .map(c => ({ name: c.name, keyId: c.keyId, fingerprint: c.fingerprint }));

      logger.finest(`Available CA keyIds: ${JSON.stringify(availableKeyIds)}`, null, FILENAME);

      const parentByKeyId = allCerts.find(c =>
        c.fingerprint !== cert.fingerprint && // Not the same cert
        c.isCA && // Must be a CA
        c.keyId === cert.authorityKeyId // Match by Authority Key ID
      );

      if (parentByKeyId) {
        logger.debug(`Found parent by keyId: ${parentByKeyId.name} (${parentByKeyId.fingerprint})`, null, FILENAME);
        return parentByKeyId;
      } else {
        logger.fine(`No parent found by authorityKeyId`, null, FILENAME);
      }
    } else {
      logger.fine(`Certificate has no authorityKeyId`, null, FILENAME);
    }

    // Try to find by issuer name (less reliable)
    logger.fine(`Looking for parent by issuer name: "${cert.issuer}"`, null, FILENAME);

    // Log all available subjects for debugging
    const availableSubjects = allCerts
      .filter(c => c.isCA)
      .map(c => ({ name: c.name, subject: c.subject, fingerprint: c.fingerprint }));

    logger.finest(`Available CA subjects: ${JSON.stringify(availableSubjects)}`, null, FILENAME);

    const parentBySubject = allCerts.find(c =>
      c.fingerprint !== cert.fingerprint && // Not the same cert
      c.isCA && // Must be a CA
      c.subject === cert.issuer // Issuer matches subject
    );

    if (parentBySubject) {
      logger.debug(`Found parent by subject: ${parentBySubject.name} (${parentBySubject.fingerprint})`, null, FILENAME);
      return parentBySubject;
    } else {
      logger.fine(`No parent found by issuer name`, null, FILENAME);
    }

    // Last resort: try to find by issuer CN in subject
    if (cert.issuerCN) {
      logger.fine(`Looking for parent by issuerCN: ${cert.issuerCN}`, null, FILENAME);

      const parentByCN = allCerts.find(c =>
        c.fingerprint !== cert.fingerprint && // Not the same cert
        c.isCA && // Must be a CA
        c.subject.includes(`CN=${cert.issuerCN}`) // Issuer CN in subject
      );

      if (parentByCN) {
        logger.debug(`Found parent by CN: ${parentByCN.name} (${parentByCN.fingerprint})`, null, FILENAME);
        return parentByCN;
      } else {
        logger.fine(`No parent found by issuerCN`, null, FILENAME);
      }
    }

    logger.debug(`No parent certificate found for: ${cert.name} (${cert.fingerprint})`, null, FILENAME);
    return null;
  }

  /**
   * Identify the certificate chain
   * @param {Object} certificate - Certificate object
   * @param {Array} allCerts - Array of all certificates
   * @returns {Promise<Array>} Chain of certificates from leaf to root
   */
  async buildCertificateChain(certificate, allCerts) {
    if (!certificate || !allCerts || !Array.isArray(allCerts)) {
      logger.debug(`buildCertificateChain: Invalid parameters`, null, FILENAME);
      return [];
    }

    logger.debug(`Building certificate chain for: ${certificate.name} (${certificate.fingerprint})`, null, FILENAME);
    logger.fine(`Total certificates to search: ${allCerts.length}`, null, FILENAME);

    const chain = [certificate];
    let current = certificate;

    // Prevent infinite loops with a reasonable limit
    const maxChainLength = 10;

    while (chain.length < maxChainLength) {
      // If we reached a self-signed cert, we're at the root
      if (current.selfSigned) {
        logger.fine(`Reached self-signed certificate - chain is complete`, null, FILENAME);
        break;
      }

      logger.fine(`Looking for parent of: ${current.name} (${current.fingerprint})`, null, FILENAME);
      const parent = await this.findParentCertificate(current, allCerts);

      if (!parent) {
        logger.fine(`No parent found - chain is incomplete`, null, FILENAME);
        break;
      }

      if (parent.fingerprint === current.fingerprint) {
        logger.fine(`Parent is same as current certificate - stopping to prevent loop`, null, FILENAME);
        break;
      }

      logger.fine(`Adding parent to chain: ${parent.name} (${parent.fingerprint})`, null, FILENAME);
      chain.push(parent);
      current = parent;
    }

    // Log the full chain for debugging
    const chainInfo = chain.map(cert => ({ name: cert.name, fingerprint: cert.fingerprint, isCA: cert.isCA }));
    logger.fine(`Certificate chain (length: ${chain.length}): ${JSON.stringify(chainInfo)}`, null, FILENAME);
    logger.debug(`Certificate chain complete with ${chain.length} certificates`, null, FILENAME);

    return chain;
  }

  /**
   * Generate a private key
   * @param {string} keyPath - Path to save the key
   * @param {Object} options - Key generation options
   * @returns {Promise<Object>} Result with key path
   */
  async generatePrivateKey(keyPath, options = {}) {
    const bits = options.bits || 2048;
    const encrypt = options.encrypt || false;
    const passphrase = options.passphrase || '';

    try {
      // Register the key file with renewal service
      this.registerFilesWithRenewalService(keyPath);

      let cmd = `openssl genrsa -out "${keyPath}" `;

      // Add encryption if requested
      if (encrypt && passphrase) {
        logger.debug(`Generating encrypted private key with ${bits} bits`, null, FILENAME);
        cmd += `-aes256 -passout pass:"${passphrase}" `;
      } else {
        logger.debug(`Generating unencrypted private key with ${bits} bits`, null, FILENAME);
      }

      cmd += bits;

      // Execute the command
      await this.execute(cmd);

      // Set proper permissions on the key file (Unix-like systems only)
      if (os.platform() !== 'win32') {
        await fsPromises.chmod(keyPath, 0o600);
        logger.finest(`Set permissions 0600 on key file: ${keyPath}`, null, FILENAME);
      }

      logger.info(`Generated ${encrypt ? 'encrypted' : 'unencrypted'} ${bits}-bit private key at ${keyPath}`, null, FILENAME);

      return {
        success: true,
        keyPath,
        encrypted: encrypt,
        bits: bits
      };
    } catch (error) {
      logger.error(`Failed to generate private key`, error, FILENAME);
      throw error;
    }
  }

  /**
   * Create or renew any type of certificate (including CAs)
   * @param {Object} config - Certificate configuration
   * @returns {Promise<Object>} Result with certificate details and temp paths
   */
  async createOrRenewCertificate(config) {
    // Special handling for CA certificates
    if (config.isCA) {
      logger.debug(`Creating/renewing CA certificate: ${config.subject || config.name}`, null, FILENAME);
      // Set CA defaults if not provided
      config.keySize = config.keySize || 4096; // CAs typically use stronger keys
      config.days = config.days || 3650;       // CA certificates typically last longer
    } else {
      logger.debug(`Creating/renewing certificate: ${config.subject || config.name}`, null, FILENAME);
      // Regular certificate defaults
      config.keySize = config.keySize || 2048;
      config.days = config.days || 365;
    }

    logger.fine(`Certificate config: certPath=${config.certPath}, keyPath=${config.keyPath}, days=${config.days}, keySize=${config.keySize}`, null, FILENAME);

    try {
      // Extract certificate name from config or subject
      const certName = config.name || (config.subject?.match(/CN\s*=\s*([^,\/]+)/i)?.[1]?.trim()) || 'certificate';

      // Create temporary paths for certificate files
      const tempPaths = await this.createTempCertPaths(certName, {
        crtExt: path.extname(config.certPath) || '.crt',
        keyExt: path.extname(config.keyPath) || '.key'
      });

      logger.debug(`Using temporary paths for initial certificate creation`, null, FILENAME);

      // Register temp files with renewal service
      this.registerFilesWithRenewalService([
        tempPaths.certPath,
        tempPaths.keyPath,
        tempPaths.csrPath
      ]);

      // Generate a new private key if one doesn't exist
      if (!config.keyPath || !fs.existsSync(config.keyPath)) {
        logger.info(`Key file doesn't exist, generating new private key`, null, FILENAME);
        await this.generatePrivateKey(tempPaths.keyPath, {
          bits: config.keySize,
          encrypt: !!config.passphrase,
          passphrase: config.passphrase || ''
        });
      } else {
        logger.fine(`Using existing key file: ${config.keyPath}`, null, FILENAME);
        // Copy the existing key to temp location
        await fsPromises.copyFile(config.keyPath, tempPaths.keyPath);
        logger.fine(`Copied existing key to temp location: ${tempPaths.keyPath}`, null, FILENAME);
      }

      // OpenSSL has a limitation on field lengths, particularly for the CN field
      const safeSubject = this._createSafeSubject(config.subject);
      logger.fine(`Original subject: ${config.subject}`, null, FILENAME);
      logger.fine(`Safe subject for OpenSSL: ${safeSubject}`, null, FILENAME);

      // Create OpenSSL config file with appropriate subject and extensions
      let configContent = `
  [req]
  distinguished_name = dn
  req_extensions = v3_req
  prompt = no
  default_bits = ${config.keySize}
  default_md = sha256
  
  [dn]
  ${safeSubject}
  
  [v3_req]
  subjectKeyIdentifier = hash
  `;

      // Add specific extensions based on certificate type
      if (config.isCA) {
        // CA certificate extensions
        configContent += `
  basicConstraints = critical, CA:true${config.pathLengthConstraint !== undefined && config.pathLengthConstraint >= 0 ? `, pathlen:${config.pathLengthConstraint}` : ''}
  keyUsage = critical, digitalSignature, keyCertSign, cRLSign
  `;
      } else {
        // Regular certificate extensions
        configContent += `
  basicConstraints = CA:FALSE
  keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
  extendedKeyUsage = serverAuth, clientAuth
  `;
      }

      // Add SAN section and entries
      configContent += `
  subjectAltName = @alt_names
  
  [alt_names]
  `;

      // Add domains to SAN
      if (config.sans?.domains?.length > 0) {
        logger.fine(`Adding ${config.sans.domains.length} domains to certificate config`, null, FILENAME);
        config.sans.domains.forEach((domain, index) => {
          if (domain && domain.length <= 253) {
            configContent += `DNS.${index + 1} = ${domain}\n`;
          }
        });
      } else if (certName && !certName.match(/^[\d.]+$/)) { // Don't add IP addresses as DNS
        // If no domains provided, add the certificate name as a domain if it looks like a domain
        configContent += `DNS.1 = ${certName}\n`;
      }

      // Add IPs to SAN
      if (config.sans?.ips?.length > 0) {
        logger.fine(`Adding ${config.sans.ips.length} IPs to certificate config`, null, FILENAME);
        config.sans.ips.forEach((ip, index) => {
          configContent += `IP.${index + 1} = ${ip}\n`;
          logger.finest(`Added IP: IP.${index + 1} = ${ip}`, null, FILENAME);
        });
      }

      // Add idle domains if requested
      if (options.includeIdle && certificate.sans && certificate.sans.idleDomains && certificate.sans.idleDomains.length > 0) {
        logger.fine(`Adding ${config.sans.idleDomains.length} idle domains to certificate config`, null, FILENAME);
        config.sans.idleDomains.forEach((domain, index) => {
          if (domain && domain.length <= 253) { // DNS names have a max length of 253 characters
            configContent += `DNS.${index + 1} = ${domain}\n`;
            logger.finest(`Added domain: DNS.${index + 1} = ${domain}`, null, FILENAME);
          } else {
            logger.warn(`Skipping domain that exceeds length limit: ${domain}`, null, FILENAME);
          }
        });
      }

      // Add idle IPs if requested
      if (options.includeIdle && certificate.sans && certificate.sans.idleIps && certificate.sans.idleIps.length > 0) {
        logger.fine(`Adding ${config.sans.idleIps.length} idle IPs to certificate config`, null, FILENAME);
        config.sans.idleIps.forEach((ip, index) => {
          configContent += `IP.${index + 1} = ${ip}\n`;
          logger.finest(`Added IP: IP.${index + 1} = ${ip}`, null, FILENAME);
        });
      }

      // Write config to temp file
      const configPath = await this._createTempFile(configContent, '.cnf');
      logger.fine(`Created certificate configuration at: ${configPath}`, null, FILENAME);
      logger.finest(`Configuration contents:\n${configContent}`, null, FILENAME);

      // For CA certificates, we can directly create the certificate in one step
      // For non-CA certificates or if requested, use the CSR + signing approach
      if (config.isCA && !config.useCSR) {
        // Direct certificate creation for CAs (faster and simpler)
        let caCmd = `openssl req -new -x509 -key "${tempPaths.keyPath}" -days ${config.days}`;

        if (config.passphrase) {
          caCmd += ` -passin pass:"${config.passphrase}"`;
        }

        caCmd += ` -out "${tempPaths.certPath}" -config "${configPath}"`;

        await this.execute(caCmd);
        logger.info(`CA certificate created at temp location: ${tempPaths.certPath}`, null, FILENAME);
      } else {
        // Standard approach with CSR (more flexible)
        // Create CSR first
        let csrCmd = `openssl req -new -key "${tempPaths.keyPath}" -out "${tempPaths.csrPath}" -config "${configPath}"`;
        if (config.passphrase) {
          csrCmd += ` -passin pass:"${config.passphrase}"`;
        }

        logger.debug(`Creating Certificate Signing Request (CSR)`, null, FILENAME);
        await this.execute(csrCmd);
        logger.fine(`CSR created at: ${tempPaths.csrPath}`, null, FILENAME);

        // Then sign it either with a CA or self-sign
        if (config.signingCA && config.signingCA.certPath && config.signingCA.keyPath) {
          // Sign with CA
          await this._signWithCA(tempPaths, config, configPath);
        } else {
          // Self-sign
          await this._selfSignCertificate(tempPaths, config, configPath);
        }
      }

      // Clean up temporary files
      await this._deleteTempFile(configPath);
      logger.finest(`Deleted temporary config file: ${configPath}`, null, FILENAME);

      // Parse the certificate to extract information
      logger.debug(`Extracting information from newly created certificate`, null, FILENAME);
      const certInfo = await this.getCertificateInfo(tempPaths.certPath);

      logger.info(`Successfully created certificate: ${certInfo.name} (${certInfo.fingerprint})`, null, FILENAME);

      // For CA certificates, if a certificate object was passed in, update it with new info
      if (config.isCA && config.certificateObject) {
        this._updateCertificateObject(config.certificateObject, certInfo, {
          keyPath: config.keyPath,
          certPath: config.certPath,
          needsPassphrase: !!config.passphrase
        });
      }

      // Return both the certificate info and the paths
      return {
        success: true,
        fingerprint: certInfo.fingerprint,
        subject: certInfo.subject,
        issuer: certInfo.issuer,
        validFrom: certInfo.validFrom,
        validTo: certInfo.validTo,
        serialNumber: certInfo.serialNumber,
        keyType: certInfo.keyType,
        keySize: certInfo.keySize,
        sigAlg: certInfo.sigAlg,
        isCA: certInfo.isCA,
        certType: certInfo.certType,
        tempPaths: tempPaths,
        finalPaths: {
          certPath: config.certPath,
          keyPath: config.keyPath,
          csrPath: tempPaths.csrPath.replace(path.dirname(tempPaths.csrPath), path.dirname(config.certPath))
        }
      };
    } catch (error) {
      logger.error(`Failed to create/renew certificate with subject ${config.subject || config.name}`, error, FILENAME);
      return {
        success: false,
        error: error.message || 'Unknown error creating certificate'
      };
    }
  }

  /**
   * Helper method to sign a certificate with a CA
   * @param {Object} tempPaths - Paths to temp files
   * @param {Object} config - Certificate configuration
   * @param {string} configPath - Path to OpenSSL config file
   * @private
   */
  async _signWithCA(tempPaths, config, configPath) {
    logger.debug(`Signing certificate with CA: ${config.signingCA.certPath}`, null, FILENAME);

    // Ensure paths are correct
    if (!fs.existsSync(config.signingCA.certPath)) {
      throw new Error(`CA certificate file not found: ${config.signingCA.certPath}`);
    }

    if (!fs.existsSync(config.signingCA.keyPath)) {
      throw new Error(`CA key file not found: ${config.signingCA.keyPath}`);
    }

    // Create a serial file for the CA if it doesn't exist
    const caDir = path.dirname(config.signingCA.certPath);
    const serialPath = path.join(caDir, `${path.basename(config.signingCA.certPath, path.extname(config.signingCA.certPath))}.srl`);
    if (!fs.existsSync(serialPath)) {
      logger.fine(`Creating serial file for CA at ${serialPath}`, null, FILENAME);
      const serialNumber = crypto.randomBytes(16).toString('hex');
      await fsPromises.writeFile(serialPath, serialNumber);
      this.registerFilesWithRenewalService(serialPath);
    }

    // Sign the certificate with CA
    let signingCmd = `openssl x509 -req -in "${tempPaths.csrPath}" -CA "${config.signingCA.certPath}" -CAkey "${config.signingCA.keyPath}"`;

    // Add CA passphrase if provided
    if (config.signingCA.passphrase) {
      signingCmd += ` -passin pass:"${config.signingCA.passphrase}"`;
    }

    signingCmd += ` -out "${tempPaths.certPath}" -days ${config.days} -sha256 -extensions v3_req -extfile "${configPath}"`;

    await this.execute(signingCmd);
    logger.info(`Certificate signed by CA and saved to temp location: ${tempPaths.certPath}`, null, FILENAME);
  }

  /**
   * Helper method to self-sign a certificate
   * @param {Object} tempPaths - Paths to temp files
   * @param {Object} config - Certificate configuration
   * @param {string} configPath - Path to OpenSSL config file
   * @private
   */
  async _selfSignCertificate(tempPaths, config, configPath) {
    logger.debug(`Self-signing certificate`, null, FILENAME);
    let selfSignCmd = `openssl x509 -req -in "${tempPaths.csrPath}" -signkey "${tempPaths.keyPath}"`;

    // Add passphrase if provided
    if (config.passphrase) {
      selfSignCmd += ` -passin pass:"${config.passphrase}"`;
    }

    selfSignCmd += ` -out "${tempPaths.certPath}" -days ${config.days} -sha256 -extensions v3_req -extfile "${configPath}"`;

    await this.execute(selfSignCmd);
    logger.info(`Self-signed certificate created at temp location: ${tempPaths.certPath}`, null, FILENAME);
  }

  /**
   * Update a certificate object with new information
   * @param {Certificate} certificate - Certificate object to update
   * @param {Object} info - Certificate info from getCertificateInfo
   * @param {Object} paths - Paths to certificate files
   * @private
   */
  _updateCertificateObject(certificate, info, paths) {
    // Update certificate properties
    certificate.fingerprint = info.fingerprint;
    certificate.subject = info.subject;
    certificate.issuer = info.issuer;
    certificate.validFrom = info.validFrom;
    certificate.validTo = info.validTo;
    certificate.certType = info.certType;
    certificate.keyType = info.keyType;
    certificate.keySize = info.keySize;
    certificate.sigAlg = info.sigAlg;
    certificate.needsPassphrase = paths.needsPassphrase;

    // Store paths in the certificate
    if (!certificate._paths) {
      certificate._paths = {};
    }
    certificate._paths.key = paths.keyPath;
    certificate._paths.crt = paths.certPath;

    logger.debug(`Updated certificate object with new information: ${certificate.name}`, null, FILENAME);
  }

  /**
   * Convert a certificate to various formats
   * @param {Certificate} certificate - Certificate to convert
   * @param {string} outputFormat - Format to convert to ('p12', 'pem', 'der', 'pfx')
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Result with path to converted certificate
   */
  async convertCertificate(certificate, outputFormat, options = {}) {
    logger.debug(`Converting certificate '${certificate.name}' to ${outputFormat.toUpperCase()} format`, null, FILENAME);

    if (!certificate || !certificate.paths || !certificate.paths.crt) {
      throw new Error('Invalid certificate or missing certificate path');
    }

    const crtPath = certificate.paths.crt;
    const keyPath = certificate.paths.key;

    if (!fs.existsSync(crtPath)) {
      logger.error(`Certificate file not found for conversion: ${crtPath}`, null, FILENAME);
      throw new Error('Certificate file not found');
    }

    // Normalize format to lowercase
    outputFormat = outputFormat.toLowerCase();

    try {
      // Choose appropriate conversion method based on format
      switch (outputFormat) {
        case 'p12':
        case 'pfx':
          // P12/PFX requires the private key
          if (!keyPath || !fs.existsSync(keyPath)) {
            throw new Error('Private key required for P12/PFX conversion but not found');
          }
          return await this.convertToP12(certificate, options);

        case 'pem':
          return await this.convertToPEM(certificate, options);

        case 'der':
          return await this.convertToDER(certificate, options);

        default:
          throw new Error(`Unsupported certificate format: ${outputFormat}`);
      }
    } catch (error) {
      logger.error(`Failed to convert certificate to ${outputFormat.toUpperCase()} format`, error, FILENAME);
      throw error;
    }
  }

  /**
   * Convert certificate to DER format
   * @param {Certificate} certificate - Certificate to convert
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Result object
   */
  async convertToDER(certificate, options = {}) {
    logger.debug(`Converting certificate '${certificate.name}' to DER format`, null, FILENAME);

    const crtPath = certificate.paths?.crt;

    if (!crtPath || !fs.existsSync(crtPath)) {
      logger.error(`Certificate file not found for DER conversion: ${crtPath}`, null, FILENAME);
      throw new Error('Certificate file not found');
    }

    const derPath = options.outputPath || crtPath.replace(/\.(crt|pem|cer)$/, '.der');
    logger.fine(`Target DER path: ${derPath}`, null, FILENAME);

    try {
      // Register the output DER file with renewal service
      this.registerFilesWithRenewalService(derPath);

      // Convert to DER format
      await this.execute(`openssl x509 -in "${crtPath}" -outform DER -out "${derPath}"`);

      // Verify the DER file was created
      if (!fs.existsSync(derPath)) {
        logger.error(`Failed to create DER file at ${derPath}`, null, FILENAME);
        throw new Error(`DER file was not created at ${derPath}`);
      }

      // Update certificate paths
      if (certificate._paths) {
        certificate._paths.der = derPath;
      } else if (certificate.paths) {
        certificate.paths.der = derPath;
      } else if (typeof certificate.addPath === 'function') {
        certificate.addPath('der', derPath);
      }

      logger.info(`Successfully converted certificate '${certificate.name}' to DER format at ${derPath}`, null, FILENAME);
      return {
        success: true,
        derPath,
        outputPath: derPath
      };
    } catch (error) {
      logger.error(`Failed to convert certificate '${certificate.name}' to DER format`, error, FILENAME);
      throw error;
    }
  }

  /**
   * Track available certificate formats for a certificate
   * @param {Certificate} certificate - Certificate to track formats for
   * @returns {Object} Object with available formats and their paths
   */
  async trackCertificateFormats(certificate) {
    if (!certificate || !certificate.paths || !certificate.paths.crt) {
      logger.warn(`Cannot track formats for invalid certificate`, null, FILENAME);
      return { formats: [] };
    }

    const baseDir = path.dirname(certificate.paths.crt);
    const baseName = path.basename(certificate.paths.crt, path.extname(certificate.paths.crt));
    const formats = [];
    const formatPaths = {};

    // Check for known formats with common extensions
    const formatExtensions = [
      { format: 'crt', ext: '.crt' },
      { format: 'pem', ext: '.pem' },
      { format: 'der', ext: '.der' },
      { format: 'p12', ext: '.p12' },
      { format: 'pfx', ext: '.pfx' }
    ];

    for (const { format, ext } of formatExtensions) {
      const filePath = path.join(baseDir, `${baseName}${ext}`);
      if (fs.existsSync(filePath)) {
        formats.push(format);
        formatPaths[format] = filePath;
        logger.fine(`Found ${format.toUpperCase()} format for ${certificate.name} at ${filePath}`, null, FILENAME);
      }
    }

    // Store in certificate object for future reference
    if (!certificate._config) {
      certificate._config = {};
    }

    certificate._config.availableFormats = formats;
    certificate._config.formatPaths = formatPaths;

    logger.debug(`Certificate '${certificate.name}' has ${formats.length} available formats: ${formats.join(', ')}`, null, FILENAME);

    return {
      formats,
      paths: formatPaths
    };
  }

  /**
   * Restore all previously available certificate formats after renewal
   * @param {Certificate} certificate - Renewed certificate
   * @param {Object} previousFormats - Result from trackCertificateFormats before renewal
   * @returns {Promise<Object>} Result with restored formats
   */
  async restoreCertificateFormats(certificate, previousFormats) {
    if (!certificate || !certificate.paths || !certificate.paths.crt) {
      logger.warn(`Cannot restore formats for invalid certificate`, null, FILENAME);
      return { success: false, error: 'Invalid certificate' };
    }

    if (!previousFormats || !previousFormats.formats || !Array.isArray(previousFormats.formats)) {
      logger.warn(`No previous format information available for ${certificate.name}`, null, FILENAME);
      return { success: false, error: 'No previous format information' };
    }

    logger.info(`Restoring ${previousFormats.formats.length} formats for certificate ${certificate.name}`, null, FILENAME);

    const results = {};
    const successful = [];
    const failed = [];

    // Always exclude the crt format since it's the base format
    const formatsToRestore = previousFormats.formats.filter(f => f !== 'crt');

    for (const format of formatsToRestore) {
      try {
        logger.debug(`Restoring ${format.toUpperCase()} format for ${certificate.name}`, null, FILENAME);

        let result;
        if (format === 'pem') {
          result = await this.convertCertificate(certificate, 'pem', {
            outputPath: previousFormats.paths.pem
          });
        } else if (format === 'p12' || format === 'pfx') {
          result = await this.convertCertificate(certificate, format, {
            outputPath: previousFormats.paths[format]
          });
        } else if (format === 'der') {
          result = await this.convertCertificate(certificate, 'der', {
            outputPath: previousFormats.paths.der
          });
        }

        if (result && result.success) {
          results[format] = result;
          successful.push(format);
          logger.info(`Successfully restored ${format.toUpperCase()} format for ${certificate.name}`, null, FILENAME);
        } else {
          failed.push(format);
          logger.warn(`Failed to restore ${format.toUpperCase()} format for ${certificate.name}`, null, FILENAME);
        }
      } catch (error) {
        failed.push(format);
        logger.error(`Error restoring ${format.toUpperCase()} format for ${certificate.name}`, error, FILENAME);
      }
    }

    logger.info(`Restored ${successful.length}/${formatsToRestore.length} formats for ${certificate.name}`, null, FILENAME);

    return {
      success: failed.length === 0,
      restored: successful,
      failed: failed,
      results: results
    };
  }

  /**
   * Handle certificate renewal with format preservation
   * @param {Certificate} certificate - Certificate to renew
   * @param {Object} renewOptions - Renewal options
   * @returns {Promise<Object>} Renewal result
   */
  async renewWithFormatPreservation(certificate, renewOptions = {}) {
    if (!certificate) {
      throw new Error('Invalid certificate');
    }

    logger.info(`Renewing certificate ${certificate.name} with format preservation`, null, FILENAME);

    try {
      // Track existing formats before renewal
      const previousFormats = await this.trackCertificateFormats(certificate);
      logger.debug(`Tracked ${previousFormats.formats.length} formats before renewal: ${previousFormats.formats.join(', ')}`, null, FILENAME);

      // Create directories if they don't exist
      const certDir = path.dirname(certificate.paths.crt);
      if (!fs.existsSync(certDir)) {
        logger.fine(`Creating certificate directory: ${certDir}`, null, FILENAME);
        await fsPromises.mkdir(certDir, { recursive: true });
      }

      // Perform the renewal
      const renewalResult = await this.createOrRenewCertificate({
        certPath: certificate.paths.crt,
        keyPath: certificate.paths.key,
        subject: certificate.subject || `CN=${certificate.name}`,
        sans: certificate._sans || {
          domains: certificate.domains || [],
          ips: certificate.ips || []
        },
        days: renewOptions.days || 365,
        keySize: certificate.keySize || 2048,
        isCA: certificate.isCA || false,
        pathLengthConstraint: certificate.pathLengthConstraint,
        passphrase: renewOptions.passphrase,
        signingCA: renewOptions.signingCA,
        name: certificate.name  // Added name for better temp file naming
      });

      if (!renewalResult.success) {
        logger.error(`Failed to renew certificate ${certificate.name}: ${renewalResult.error}`, null, FILENAME);
        return renewalResult;
      }

      // Copy from temp paths to final paths
      logger.info(`Certificate ${certificate.name} successfully renewed in temp location, copying to final destination`, null, FILENAME);

      try {
        // Register the final paths with renewal service
        this.registerFilesWithRenewalService([
          renewalResult.finalPaths.certPath,
          renewalResult.finalPaths.keyPath
        ]);

        // Copy certificate
        await fsPromises.copyFile(renewalResult.tempPaths.certPath, renewalResult.finalPaths.certPath);
        logger.debug(`Copied certificate from ${renewalResult.tempPaths.certPath} to ${renewalResult.finalPaths.certPath}`, null, FILENAME);

        // Copy key
        await fsPromises.copyFile(renewalResult.tempPaths.keyPath, renewalResult.finalPaths.keyPath);
        logger.debug(`Copied key from ${renewalResult.tempPaths.keyPath} to ${renewalResult.finalPaths.keyPath}`, null, FILENAME);

        // Copy CSR if exists
        if (fs.existsSync(renewalResult.tempPaths.csrPath)) {
          const finalCsrPath = renewalResult.finalPaths.csrPath;
          await fsPromises.copyFile(renewalResult.tempPaths.csrPath, finalCsrPath);
          logger.debug(`Copied CSR from ${renewalResult.tempPaths.csrPath} to ${finalCsrPath}`, null, FILENAME);
        }
      } catch (copyError) {
        logger.error(`Error copying certificate files from temp to final location`, copyError, FILENAME);
        throw new Error(`Failed to copy certificate files: ${copyError.message}`);
      }

      // Clean up temp directory
      try {
        await fsPromises.rm(renewalResult.tempPaths.tempDir, { recursive: true, force: true });
        logger.debug(`Cleaned up temporary directory: ${renewalResult.tempPaths.tempDir}`, null, FILENAME);
      } catch (cleanupError) {
        logger.warn(`Failed to clean up temporary directory: ${cleanupError.message}`, cleanupError, FILENAME);
      }

      logger.info(`Certificate ${certificate.name} successfully renewed and copied to final destination`, null, FILENAME);

      // Restore previous formats
      logger.info(`Now restoring previous formats for ${certificate.name}`, null, FILENAME);
      const formatRestorationResult = await this.restoreCertificateFormats(certificate, previousFormats);

      // Return combined result
      return {
        ...renewalResult,
        formatRestoration: formatRestorationResult
      };
    } catch (error) {
      logger.error(`Error during certificate renewal with format preservation`, error, FILENAME);
      throw error;
    }
  }

  /**
   * Convert certificate to PKCS#12 (P12) format
   * @param {Certificate} certificate - Certificate to convert
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Result object
   */
  async convertToP12(certificate, options = {}) {
    const crtPath = certificate.paths?.crt;
    const keyPath = certificate.paths?.key;

    if (!crtPath || !fs.existsSync(crtPath)) {
      logger.error(`Certificate file not found for conversion: ${crtPath}`, null, FILENAME);
      throw new Error('Certificate file not found');
    }

    if (!keyPath || !fs.existsSync(keyPath)) {
      logger.error(`Private key file not found for conversion: ${keyPath}`, null, FILENAME);
      throw new Error('Private key file not found');
    }

    const passphrase = options.passphrase || '';
    const p12Path = options.outputPath || crtPath.replace(/\.(crt|pem|cer)$/, '.p12');

    logger.info(`Converting certificate ${certificate.name} to P12 format`, null, FILENAME);
    logger.fine(`Certificate path: ${crtPath}, Key path: ${keyPath}, Output: ${p12Path}`, null, FILENAME);

    try {
      // Register the output P12 file with renewal service
      this.registerFilesWithRenewalService(p12Path);

      let cmd = `openssl pkcs12 -export -out "${p12Path}" -inkey "${keyPath}" -in "${crtPath}"`;

      if (passphrase) {
        logger.finest(`Using passphrase for P12 file`, null, FILENAME);
        cmd += ` -passout pass:"${passphrase}"`;
      } else {
        logger.finest(`No passphrase for P12 file`, null, FILENAME);
        cmd += ` -passout pass:`;  // Empty password
      }

      await this.execute(cmd);

      if (fs.existsSync(p12Path)) {
        // Add path to certificate object using new structure
        if (certificate._paths) {
          certificate._paths.p12 = p12Path;
          logger.fine(`Added p12 path to certificate using _paths property`, null, FILENAME);
        } else if (certificate.paths) {
          // For compatibility
          certificate.paths.p12 = p12Path;
          logger.fine(`Added p12 path to certificate using paths property`, null, FILENAME);
        } else if (typeof certificate.addPath === 'function') {
          // Using the Certificate class method
          certificate.addPath('p12', p12Path);
          logger.fine(`Added p12 path to certificate using addPath() method`, null, FILENAME);
        } else {
          logger.warn(`Could not update certificate object with P12 path`, null, FILENAME);
        }
      }

      logger.info(`Successfully converted certificate '${certificate.name}' to P12 format at ${p12Path}`, null, FILENAME);
      return {
        success: true,
        p12Path,
        outputPath: p12Path
      };
    } catch (error) {
      logger.error(`Failed to convert certificate to P12 format`, error, FILENAME);
      throw error;
    }
  }

  /**
   * Convert certificate to PEM format
   * @param {Certificate} certificate - Certificate to convert
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Result object
   */
  async convertToPEM(certificate, options = {}) {
    logger.debug(`Converting certificate '${certificate.name}' to PEM format`, null, FILENAME);

    const crtPath = certificate.paths?.crt;
    logger.finest(`Source certificate path: ${crtPath}`, null, FILENAME);

    if (!crtPath || !fs.existsSync(crtPath)) {
      logger.error(`Certificate file not found for PEM conversion: ${crtPath}`, null, FILENAME);
      throw new Error('Certificate file not found');
    }

    const pemPath = options.outputPath || crtPath.replace(/\.(crt|der|p12|pfx|cer)$/, '.pem');
    logger.fine(`Target PEM path: ${pemPath}`, null, FILENAME);

    try {
      // Register the output PEM file with renewal service
      this.registerFilesWithRenewalService(pemPath);

      // For DER format, convert to PEM
      if (path.extname(crtPath).toLowerCase() === '.der') {
        logger.fine(`Converting DER to PEM format for ${certificate.name}`, null, FILENAME);
        await this.execute(`openssl x509 -inform DER -in "${crtPath}" -outform PEM -out "${pemPath}"`);
      }
      // For P12/PFX format, extract the certificate
      else if (['.p12', '.pfx'].includes(path.extname(crtPath).toLowerCase())) {
        logger.fine(`Converting P12/PFX to PEM format for ${certificate.name}`, null, FILENAME);
        const password = options.password || '';
        const passwordLog = password ? '[password provided]' : '[no password]';
        logger.finest(`Using password: ${passwordLog}`, null, FILENAME);
        await this.execute(`openssl pkcs12 -in "${crtPath}" -out "${pemPath}" -nodes -nokeys -passin pass:"${password}"`);
      }
      // For CRT/CER/PEM just copy the file if needed
      else if (crtPath !== pemPath) {
        logger.fine(`Copying certificate file from ${crtPath} to ${pemPath}`, null, FILENAME);
        await fsPromises.copyFile(crtPath, pemPath);
      } else {
        logger.fine(`No conversion needed, source and destination are identical: ${crtPath}`, null, FILENAME);
      }

      // Verify the PEM file was created
      if (!fs.existsSync(pemPath)) {
        logger.error(`Failed to create PEM file at ${pemPath}`, null, FILENAME);
        throw new Error(`PEM file was not created at ${pemPath}`);
      }

      // Update certificate paths
      if (certificate._paths) {
        certificate._paths.pem = pemPath;
      }

      logger.info(`Successfully converted certificate '${certificate.name}' to PEM format at ${pemPath}`, null, FILENAME);
      return {
        success: true,
        pemPath,
        outputPath: pemPath
      };
    } catch (error) {
      logger.error(`Failed to convert certificate '${certificate.name}' to PEM format`, error, FILENAME);
      throw error;
    }
  }

  /**
   * Verify that a certificate and key pair match
   * @param {string} certPath - Path to certificate file
   * @param {string} keyPath - Path to key file
   * @returns {Promise<boolean>} True if pair is valid
   */
  async verifyCertificateKeyPair(certPath, keyPath) {
    try {
      if (!fs.existsSync(certPath)) {
        logger.error(`Certificate file not found: ${certPath}`, null, FILENAME);
        throw new Error(`Certificate file not found: ${certPath}`);
      }

      if (!fs.existsSync(keyPath)) {
        logger.error(`Key file not found: ${keyPath}`, null, FILENAME);
        throw new Error(`Key file not found: ${keyPath}`);
      }

      logger.debug(`Verifying certificate-key pair: ${path.basename(certPath)} and ${path.basename(keyPath)}`, null, FILENAME);

      // Get modulus from certificate
      const certModulus = await this.execute(`openssl x509 -noout -modulus -in "${certPath}"`);

      // Get modulus from private key
      const keyModulus = await this.execute(`openssl rsa -noout -modulus -in "${keyPath}"`);

      // Compare moduli
      const result = certModulus === keyModulus;
      logger.debug(`Certificate-key pair verification result: ${result}`, null, FILENAME);
      return result;
    } catch (error) {
      logger.error(`Failed to verify certificate-key pair`, error, FILENAME);
      return false;
    }
  }

  /**
   * Check if a private key is encrypted (requires a passphrase)
   * @param {string} keyPath - Path to private key file
   * @returns {Promise<boolean>} True if the key is encrypted
   */
  async isKeyEncrypted(keyPath) {
    if (!fs.existsSync(keyPath)) {
      logger.error(`Key file not found: ${keyPath}`, null, FILENAME);
      throw new Error(`Key file not found: ${keyPath}`);
    }

    try {
      logger.fine(`Checking if key is encrypted: ${keyPath}`, null, FILENAME);

      // First try reading the file content to check for encryption indicators
      const keyContent = fs.readFileSync(keyPath, 'utf8');

      // Check for common encryption identifiers
      if (keyContent.includes('ENCRYPTED') ||
        keyContent.includes('Proc-Type: 4,ENCRYPTED')) {
        logger.fine(`Key file content indicates encryption: ${keyPath}`, null, FILENAME);
        return true;
      }

      // If no encryption indicators found in content, try to use the key without a passphrase
      try {
        // Try to read the private key without a passphrase
        await this.execute(`openssl rsa -noout -modulus -in "${keyPath}"`);

        // If we get here, the key is not encrypted
        logger.fine(`Key is confirmed not encrypted: ${keyPath}`, null, FILENAME);
        return false;
      } catch (error) {
        // Check if the error indicates an encrypted key
        const errorOutput = error.message || '';
        const isEncrypted = errorOutput.includes('bad decrypt') ||
          errorOutput.includes('bad password') ||
          errorOutput.includes('encrypted') ||
          errorOutput.includes('Unable to load Private Key');

        if (isEncrypted) {
          logger.fine(`Key is encrypted (confirmed by OpenSSL error): ${keyPath}`, null, FILENAME);
          return true;
        }

        // If it's not a specific encryption error, re-throw
        logger.warn(`Unexpected error checking if key is encrypted: ${errorOutput}`, null, FILENAME);
        throw error;
      }
    } catch (error) {
      if (error.message?.includes('encrypted') ||
        error.message?.includes('bad decrypt') ||
        error.message?.includes('bad password')) {
        logger.fine(`Key is encrypted: ${keyPath}`, null, FILENAME);
        return true;
      }

      logger.warn(`Error checking if key is encrypted: ${error.message}`, null, FILENAME);
      // Default to assuming the key might be encrypted if we can't determine
      return true;
    }
  }

  /**
   * Creates a safe subject string that won't exceed OpenSSL's ASN.1 length limits
   * @param {string} subject - Original subject string
   * @returns {string} - Safe subject string for OpenSSL
   * @private
   */
  _createSafeSubject(subject) {
    // If no subject provided, use a minimal one
    if (!subject) {
      return 'CN=certificate';
    }

    // Split the subject into components
    const components = [];
    const regex = /(C|ST|L|O|OU|CN)\s*=\s*([^,\/]+)/gi;
    let match;

    while (match = regex.exec(subject)) {
      const key = match[1].toUpperCase();
      let value = match[2].trim();

      // Apply length limits based on RFC 5280 and OpenSSL limitations
      // These limits are conservative to avoid ASN.1 encoding issues
      switch (key) {
        case 'C':  // Country
          value = value.substring(0, 2); // ISO country code is 2 chars
          break;
        case 'ST': // State/Province
        case 'L':  // Locality/City
          value = value.substring(0, 64);
          break;
        case 'O':  // Organization
        case 'OU': // Organizational Unit
          value = value.substring(0, 64);
          break;
        case 'CN': // Common Name
          value = value.substring(0, 64); // Many implementations limit to 64
          break;
        default:
          value = value.substring(0, 64);
          break;
      }

      components.push(`${key} = ${value}`);
    }

    // Join components with newlines for OpenSSL config format
    return components.join('\n');
  }

  /**
   * Create a new CA certificate (wrapper for createOrRenewCertificate)
   * @param {Certificate} certificate - Certificate object for the CA
   * @param {Object} options - CA creation options
   * @returns {Promise<Object>} Result object
   */
  async createCA(certificate, options = {}) {
    logger.info(`Creating CA certificate for ${certificate.name}`, null, FILENAME);

    const keyPath = options.keyPath || certificate.paths?.key;
    const certPath = options.certPath || certificate.paths?.crt;

    // Build subject if not already in certificate
    let subject = certificate.subject;
    if (!subject) {
      subject = `CN=${certificate.name}`;
      if (options.country) subject += `,C=${options.country}`;
      if (options.state) subject += `,ST=${options.state}`;
      if (options.locality) subject += `,L=${options.locality}`;
      if (options.organization) subject += `,O=${options.organization}`;
      if (options.organizationalUnit) subject += `,OU=${options.organizationalUnit}`;
    }

    try {
      // Call the unified method with CA-specific parameters
      const result = await this.createOrRenewCertificate({
        certificateObject: certificate, // Pass the certificate for direct update
        subject: subject,
        certPath: certPath,
        keyPath: keyPath,
        keySize: options.keyBits || certificate.keySize || 4096,
        days: options.days || 3650,
        passphrase: options.passphrase || '',
        isCA: true,
        pathLengthConstraint: options.pathLen,
        name: certificate.name
      });

      if (result.success) {
        return {
          success: true,
          certificate,
          fingerprint: result.fingerprint,
          certPath,
          keyPath,
          isCA: true,
          caType: result.certType
        };
      } else {
        throw new Error(result.error || 'Failed to create CA certificate');
      }
    } catch (error) {
      logger.error(`Failed to create CA certificate for ${certificate.name}`, error, FILENAME);
      throw error;
    }
  }
}

module.exports = OpenSSLWrapper;