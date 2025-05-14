/**
 * OpenSSL Wrapper Module using direct command execution
 * @module OpenSSLWrapper
 * @version 0.2.0
 * @license MIT
 * @author Christian Meiners
 * @description This module provides a reliable wrapper around OpenSSL for certificate management operations.
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
    // Check if OpenSSL is installed
    try {
      execSync('openssl version', { encoding: 'utf8' });
    } catch (error) {
      throw new Error('OpenSSL is not installed or not available in PATH');
    }
  }

  /**
   * Execute an OpenSSL command
   * @param {string} cmd - Command to execute
   * @returns {Promise<string>} Command output
   */
  async execute(cmd) {
    try {
      logger.fine(`Executing OpenSSL command: ${cmd}`, null, FILENAME);
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
      await fsPromises.unlink(filePath);
    } catch (error) {
      logger.warn(`Failed to delete temporary file ${filePath}`, error, FILENAME);
    }
  }

  /**
   * Extract certificate information
   * @param {string} certPath - Path to certificate file
   * @returns {Promise<Object>} Certificate information
   */
  async getCertificateInfo(certPath) {
    if (!fs.existsSync(certPath)) {
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
        // Debug selfSigned check before actually calling it
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

      // Extract domains from SAN - This is where we've had issues
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
      const subjectKeyIdMatch = certText.match(/Subject Key Identifier:(?:[^]*?keyid:)?([0-9a-fA-F:]+)/);
      logger.finest(`Subject key identifier match: ${JSON.stringify(subjectKeyIdMatch)}`, null, FILENAME);
      const keyId = subjectKeyIdMatch ? subjectKeyIdMatch[1].replace(/:/g, '') : '';
      logger.fine(`Extracted subject key ID: ${keyId}`, null, FILENAME);

      // Extract certificate authority key identifier if available
      const keyIdMatch = certText.match(/Authority Key Identifier:(?:[^]*?keyid:)([0-9a-fA-F:]+)/);
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

      // Create result object
      const result = {
        fingerprint,
        name,
        subject,
        issuer,
        issuerCN,
        validFrom,
        validTo,
        certType,
        domains,
        ips,
        isCA,
        pathLenConstraint,
        serialNumber,
        keyId,           // Added for finding certificates in chains
        authorityKeyId,
        keyType,
        keySize,
        sigAlg,
        selfSigned
      };

      logger.debug(`Certificate info extraction complete for: ${certPath}`, null, FILENAME, certPath);
      logger.debug(`Name: ${result.name}`, null, FILENAME, certPath);
      logger.debug(`Subject: ${result.subject}`, null, FILENAME, certPath);
      logger.debug(`Issuer: ${result.issuer}`, null, FILENAME, certPath);
      logger.debug(`Fingerprint: ${result.fingerprint}`, null, FILENAME, certPath);
      logger.debug(`Domains count: ${domains.length}`, null, FILENAME, certPath);
      logger.debug(`Certificate type: ${certType}`, null, FILENAME, certPath);

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
   * Find the root CA for a certificate
   * @param {Object} certificate - Certificate object
   * @param {Array} allCerts - Array of all certificates
   * @returns {Promise<Object|null>} Root CA certificate or null if not found
   */
  async findRootCA(certificate, allCerts) {
    if (!certificate) {
      logger.debug(`findRootCA: Invalid certificate parameter`, null, FILENAME);
      return null;
    }

    logger.debug(`Finding root CA for: ${certificate.name} (${certificate.fingerprint})`, null, FILENAME);

    // If this is already a root CA, return it
    if (certificate.certType === 'rootCA' && certificate.selfSigned) {
      logger.fine(`Certificate is already a root CA - returning itself`, null, FILENAME);
      return certificate;
    }

    // Get the certificate chain
    const chain = await this.buildCertificateChain(certificate, allCerts);

    if (chain.length === 0) {
      logger.fine(`No certificate chain found`, null, FILENAME);
      return null;
    }

    // The last certificate in the chain should be the root
    const rootCA = chain[chain.length - 1];

    // Verify it's actually a root CA
    if (rootCA && rootCA.certType === 'rootCA' && rootCA.selfSigned) {
      logger.debug(`Found root CA: ${rootCA.name} (${rootCA.fingerprint})`, null, FILENAME);
      return rootCA;
    }

    logger.fine(`Last certificate in chain is not a valid root CA`, null, FILENAME);
    return null;
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
      let cmd = `openssl genrsa -out "${keyPath}" `;

      // Add encryption if requested
      if (encrypt && passphrase) {
        cmd += `-aes256 -passout pass:"${passphrase}" `;
      }

      cmd += bits;

      // Execute the command
      await this.execute(cmd);

      // Set proper permissions on the key file (Unix-like systems only)
      if (os.platform() !== 'win32') {
        await fsPromises.chmod(keyPath, 0o600);
      }

      return {
        success: true,
        keyPath,
        encrypted: encrypt
      };
    } catch (error) {
      logger.error(`Failed to generate private key`, error, FILENAME);
      throw error;
    }
  }

  /**
   * Create a self-signed certificate
   * @param {Certificate} certificate - Certificate object
   * @param {Object} options - Certificate options
   * @returns {Promise<Object>} Result with updated certificate
   */
  async createSelfSigned(certificate, options = {}) {
    const days = options.days || 365;
    const keyPath = options.keyPath || certificate.paths.keyPath;
    const certPath = options.certPath || certificate.paths.crtPath;
    const keyBits = options.keyBits || 2048;

    try {
      // Create directories if they don't exist
      const certDir = path.dirname(certPath);
      if (!fs.existsSync(certDir)) {
        await fsPromises.mkdir(certDir, { recursive: true });
      }

      // Generate a new private key if one doesn't exist
      if (!keyPath || !fs.existsSync(keyPath)) {
        await this.generatePrivateKey(keyPath, {
          bits: keyBits
        });
      }

      // Create config file with SAN
      let configContent = `
[req]
default_bits = ${keyBits}
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = req_ext

[dn]
CN = ${certificate.name}

[req_ext]
subjectAltName = @alt_names

[alt_names]
`;

      // Add domains
      if (certificate.domains && certificate.domains.length > 0) {
        certificate.domains.forEach((domain, index) => {
          configContent += `DNS.${index + 1} = ${domain}\n`;
        });
      }

      // Add IPs
      if (certificate.ips && certificate.ips.length > 0) {
        certificate.ips.forEach((ip, index) => {
          configContent += `IP.${index + 1} = ${ip}\n`;
        });
      }

      // Write config to temp file
      const configPath = await this._createTempFile(configContent, '.cnf');

      // Create CSR file path
      const csrPath = path.join(certDir, `${path.basename(certPath, path.extname(certPath))}.csr`);

      // Create CSR
      await this.execute(`openssl req -new -key "${keyPath}" -out "${csrPath}" -config "${configPath}"`);

      // Generate self-signed certificate
      await this.execute(`openssl x509 -req -in "${csrPath}" -signkey "${keyPath}" -out "${certPath}" -days ${days} -sha256 -extensions req_ext -extfile "${configPath}"`);

      // Clean up temporary files
      await this._deleteTempFile(configPath);

      // Parse the certificate to extract information
      const certInfo = await this.getCertificateInfo(certPath);

      // Update certificate object with new values
      certificate.fingerprint = certInfo.fingerprint;
      certificate.subject = certInfo.subject;
      certificate.issuer = certInfo.issuer;
      certificate.validFrom = certInfo.validFrom;
      certificate.validTo = certInfo.validTo;

      // Update paths
      if (!certificate.paths) {
        certificate.paths = {};
      }
      certificate.paths.crtPath = certPath;
      certificate.paths.keyPath = keyPath;
      certificate.paths.csrPath = csrPath;

      return {
        success: true,
        certificate,
        fingerprint: certInfo.fingerprint,
        certPath,
        keyPath
      };
    } catch (error) {
      logger.error(`Failed to create self-signed certificate for ${certificate.name}`, error, FILENAME);
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
    const crtPath = certificate.paths?.crtPath;
    const keyPath = certificate.paths?.keyPath;

    if (!crtPath || !fs.existsSync(crtPath)) {
      throw new Error('Certificate file not found');
    }

    if (!keyPath || !fs.existsSync(keyPath)) {
      throw new Error('Private key file not found');
    }

    const passphrase = options.passphrase || '';
    const p12Path = options.outputPath || crtPath.replace(/\.(crt|pem|cer)$/, '.p12');

    try {
      let cmd = `openssl pkcs12 -export -out "${p12Path}" -inkey "${keyPath}" -in "${crtPath}"`;

      if (passphrase) {
        cmd += ` -passout pass:"${passphrase}"`;
      } else {
        cmd += ` -passout pass:`;  // Empty password
      }

      await this.execute(cmd);

      if (fs.existsSync(p12Path)) {
        const pathAdded = certificate.addPath('p12', p12Path);
        if (pathAdded) {
          logger.debug(`Added p12 path to certificate ${certificate.name}: ${p12Path}`, null, FILENAME, certificate.name);
        } else {
          logger.warn(`Failed to add p12 path to certificate ${certificate.name} despite file existing`, null, FILENAME, certificate.name);
        }
      }

      logger.info(`Successfully converted certificate '${certificate.name}' to p12 format at ${p12Path}`, null, FILENAME, certificate.name);
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
    logger.debug(`Converting certificate '${certificate.name}' to PEM format`, null, FILENAME, certificate.name);

    const crtPath = certificate.paths?.crtPath;
    logger.finest(`Source certificate path: ${crtPath}`, null, FILENAME, certificate.name);

    if (!crtPath || !fs.existsSync(crtPath)) {
      logger.error(`Certificate file not found: ${crtPath}`, null, FILENAME, certificate.name);
      throw new Error('Certificate file not found');
    }

    const pemPath = options.outputPath || crtPath.replace(/\.(crt|der|p12|pfx|cer)$/, '.pem');
    logger.fine(`Target PEM path: ${pemPath}`, null, FILENAME, certificate.name);

    try {
      // For DER format, convert to PEM
      if (path.extname(crtPath).toLowerCase() === '.der') {
        logger.fine(`Converting DER to PEM format for ${certificate.name}`, null, FILENAME, certificate.name);
        await this.execute(`openssl x509 -inform DER -in "${crtPath}" -outform PEM -out "${pemPath}"`);
      }
      // For P12/PFX format, extract the certificate
      else if (['.p12', '.pfx'].includes(path.extname(crtPath).toLowerCase())) {
        logger.fine(`Converting P12/PFX to PEM format for ${certificate.name}`, null, FILENAME, certificate.name);
        const password = options.password || '';
        const passwordLog = password ? '[password provided]' : '[no password]';
        logger.finest(`Using password: ${passwordLog}`, null, FILENAME, certificate.name);
        await this.execute(`openssl pkcs12 -in "${crtPath}" -out "${pemPath}" -nodes -nokeys -passin pass:"${password}"`);
      }
      // For CRT/CER/PEM just copy the file if needed
      else if (crtPath !== pemPath) {
        logger.fine(`Copying certificate file from ${crtPath} to ${pemPath}`, null, FILENAME, certificate.name);
        await fsPromises.copyFile(crtPath, pemPath);
      } else {
        logger.fine(`No conversion needed, source and destination are identical: ${crtPath}`, null, FILENAME, certificate.name);
      }

      // Verify the PEM file was created
      if (!fs.existsSync(pemPath)) {
        logger.error(`Failed to create PEM file at ${pemPath}`, null, FILENAME, certificate.name);
        throw new Error(`PEM file was not created at ${pemPath}`);
      }

      logger.finest(`Verifying PEM file content`, null, FILENAME, certificate.name);
      try {
        // Peek at the file to ensure it contains PEM content
        const pemContent = fs.readFileSync(pemPath, 'utf8').substring(0, 100);
        logger.finest(`PEM file starts with: ${pemContent.substring(0, 40)}...`, null, FILENAME, certificate.name);

        if (!pemContent.includes('-----BEGIN')) {
          logger.warn(`PEM file doesn't contain expected PEM header`, null, FILENAME, certificate.name);
        }
      } catch (readError) {
        logger.warn(`Could not verify PEM file content: ${readError.message}`, null, FILENAME, certificate.name);
      }

      // After successful conversion, add the path using the Certificate's method
      if (fs.existsSync(pemPath)) {
        const pathAdded = certificate.addPath('pem', pemPath);
        if (pathAdded) {
          logger.debug(`Added PEM path to certificate ${certificate.name}: ${pemPath}`, null, FILENAME, certificate.name);
        } else {
          logger.warn(`Failed to add PEM path to certificate ${certificate.name} despite file existing`, null, FILENAME, certificate.name);
        }
      }

      logger.info(`Successfully converted certificate '${certificate.name}' to PEM format at ${pemPath}`, null, FILENAME, certificate.name);
      return {
        success: true,
        pemPath,
        outputPath: pemPath
      };
    } catch (error) {
      logger.error(`Failed to convert certificate '${certificate.name}' to PEM format`, error, FILENAME, certificate.name);
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
        throw new Error(`Certificate file not found: ${certPath}`);
      }

      if (!fs.existsSync(keyPath)) {
        throw new Error(`Key file not found: ${keyPath}`);
      }

      // Get modulus from certificate
      const certModulus = await this.execute(`openssl x509 -noout -modulus -in "${certPath}"`);

      // Get modulus from private key
      const keyModulus = await this.execute(`openssl rsa -noout -modulus -in "${keyPath}"`);

      // Compare moduli
      return certModulus === keyModulus;
    } catch (error) {
      logger.error(`Failed to verify certificate-key pair`, error, FILENAME);
      return false;
    }
  }

  /**
   * Convert certificate to different format
   * @param {Object} certificate - Certificate object
   * @param {string} format - Target format
   * @param {Object} options - Options like password
   * @returns {Promise<Object>} Result object
   */
  async convertCertificate(certificate, format, options = {}) {
    // Find required paths
    const crtPath = certificate.paths?.crtPath;
    const keyPath = certificate.paths?.keyPath;

    if (!crtPath || !fs.existsSync(crtPath)) {
      throw new Error('Certificate file not found');
    }

    if (['p12', 'pfx'].includes(format) && (!keyPath || !fs.existsSync(keyPath))) {
      throw new Error('Private key file is required for PKCS#12/PFX conversion');
    }

    try {
      const certDir = path.dirname(crtPath);
      const baseName = path.basename(crtPath, path.extname(crtPath));
      const outputPath = options.outputPath || path.join(certDir, `${baseName}.${format}`);

      let result;

      // Execute conversion based on format
      switch (format.toLowerCase()) {
        case 'p12':
        case 'pfx':
          // Execute p12/pfx conversion
          result = await this.convertToP12(certificate, {
            passphrase: options.password || '',
            outputPath
          });
          break;

        case 'pem':
          // Convert to PEM format
          result = await this.convertToPEM(certificate, {
            password: options.password,
            outputPath
          });
          break;

        case 'der':
          // Convert to DER format
          await this.execute(`openssl x509 -in "${crtPath}" -outform DER -out "${outputPath}"`);

          // Add path to certificate
          if (!certificate.paths) {
            certificate.paths = {};
          }
          certificate.paths.derPath = outputPath;

          result = { outputPath };
          break;

        case 'p7b':
          // Convert to P7B format
          await this.execute(`openssl crl2pkcs7 -nocrl -certfile "${crtPath}" -out "${outputPath}"`);

          // Add path to certificate
          if (!certificate.paths) {
            certificate.paths = {};
          }
          certificate.paths.p7bPath = outputPath;

          result = { outputPath };
          break;

        case 'crt':
        case 'cer':
          // Just copy with the new extension
          await fsPromises.copyFile(crtPath, outputPath);
          result = { outputPath };
          break;

        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      // Verify the output file exists
      if (!fs.existsSync(result.outputPath || outputPath)) {
        throw new Error('Conversion failed - output file not created');
      }

      return {
        success: true,
        outputPath: result.outputPath || outputPath
      };
    } catch (error) {
      logger.error(`Failed to convert certificate to ${format} format:`, error, FILENAME);
      throw error;
    }
  }

  /**
 * Check if a private key is encrypted (requires a passphrase)
 * @param {string} keyPath - Path to private key file
 * @returns {Promise<boolean>} True if the key is encrypted
 */
  async isKeyEncrypted(keyPath) {
    if (!fs.existsSync(keyPath)) {
      throw new Error(`Key file not found: ${keyPath}`);
    }

    try {
      logger.fine(`Checking if key is encrypted: ${keyPath}`, null, FILENAME);

      // Try to read the private key without a passphrase
      // If this fails with "bad decrypt" error, it's encrypted
      await this.execute(`openssl rsa -noout -modulus -in "${keyPath}"`);

      // If we get here, the key is not encrypted
      return false;
    } catch (error) {
      // Check if the error indicates an encrypted key
      const errorOutput = error.stderr || error.message || '';
      const isEncrypted = errorOutput.includes('bad decrypt') || errorOutput.includes('bad password') ||
        errorOutput.includes('encrypted') || errorOutput.includes('password');

      if (isEncrypted) {
        logger.fine(`Key is encrypted: ${keyPath}`, null, FILENAME);
        return true;
      }

      // Re-throw for other errors
      logger.warn(`Error checking if key is encrypted: ${errorOutput}`, null, FILENAME);
      throw error;
    }
  }

  /**
   * Renew an existing certificate
   * @param {Certificate} certificate - Certificate object to renew
   * @param {Object} options - Renewal options
   * @returns {Promise<Object>} Result with updated certificate
   */
  async renewCertificate(certificate, options = {}) {
    const days = options.days || 365;
    const keyPath = certificate.paths.keyPath;
    const certPath = certificate.paths.crtPath;
    const passphrase = options.passphrase || ''; // Certificate passphrase
    const signingCAPassphrase = options.signingCAPassphrase || ''; // Signing CA passphrase

    try {
      if (!certificate.name) {
        throw new Error('Certificate must have a name to renew');
      }

      logger.debug(`Renewing certificate: ${certificate.name}`, null, FILENAME);

      // Verify key exists
      if (!keyPath || !require('fs').existsSync(keyPath)) {
        throw new Error(`Private key not found at: ${keyPath}`);
      }

      // Store previous certificate info and create archive
      const previousFingerprint = certificate.fingerprint;
      let previousVersionInfo = null;

      // Archive the old certificate if it exists
      if (fs.existsSync(certPath)) {
        // Get certificate info before changing it
        let originalCertInfo;
        try {
          originalCertInfo = await this.getCertificateInfo(certPath);
        } catch (infoError) {
          logger.warn(`Failed to extract info from original certificate: ${infoError.message}`, null, FILENAME);
          // Continue even if we can't get the original info
        }

        // Create archive directory if it doesn't exist
        const certDir = path.dirname(certPath);
        const archiveDir = path.join(certDir, 'archive', certificate.name);

        // Create archive directory with proper permissions
        try {
          await fs.promises.mkdir(archiveDir, { recursive: true, mode: 0o755 });
        } catch (mkdirError) {
          logger.warn(`Error creating archive directory: ${mkdirError.message}`, null, FILENAME);
          // Continue even if we can't create the directory
        }

        // Format date for filename - use validFrom from the certificate being replaced
        let dateString = 'unknown-date';
        if (originalCertInfo && originalCertInfo.validFrom) {
          try {
            // Format as YYYY-MM-DD
            const date = new Date(originalCertInfo.validFrom);
            dateString = date.toISOString().split('T')[0];
          } catch (dateError) {
            logger.warn(`Error formatting date for archive: ${dateError.message}`, null, FILENAME);
          }
        }

        // Archive all related files
        const filesToArchive = [];

        // Find all related certificate files
        Object.entries(certificate.paths).forEach(([key, filePath]) => {
          if (filePath && fs.existsSync(filePath)) {
            // Get the file extension
            const ext = path.extname(filePath);
            const baseName = path.basename(filePath, ext);

            // Create archive path with date in filename
            const archivePath = path.join(archiveDir, `${baseName}.${dateString}${ext}`);

            // Add to files list for archiving
            filesToArchive.push({
              source: filePath,
              target: archivePath,
              type: key.replace(/Path$/, '')
            });
          }
        });

        // Archive each file and track success
        const archivedFiles = [];
        for (const file of filesToArchive) {
          try {
            await fs.promises.copyFile(file.source, file.target);
            archivedFiles.push({
              type: file.type,
              path: file.target,
              relativePath: path.relative(certDir, file.target)
            });
            logger.fine(`Archived ${file.type} file to ${file.target}`, null, FILENAME);
          } catch (copyError) {
            logger.warn(`Failed to archive ${file.type} file: ${copyError.message}`, null, FILENAME);
          }
        }

        // Create previous version info
        previousVersionInfo = {
          fingerprint: originalCertInfo?.fingerprint,
          subject: originalCertInfo?.subject,
          issuer: originalCertInfo?.issuer,
          validFrom: originalCertInfo?.validFrom,
          validTo: originalCertInfo?.validTo,
          domains: originalCertInfo?.domains,
          ips: originalCertInfo?.ips,
          keyType: originalCertInfo?.keyType,
          keySize: originalCertInfo?.keySize,
          sigAlg: originalCertInfo?.sigAlg,
          archivedAt: new Date().toISOString(),
          version: certificate._previousVersions ? Object.keys(certificate._previousVersions).length + 1 : 1,
          archivedFiles: archivedFiles
        };
      }

      // Create a CSR for renewal
      const csrPath = certificate.paths.csrPath || certPath.replace(/\.(crt|pem)$/i, '.csr');

      // Create config file with SAN
      let configContent = `
[req]
default_bits = 2048
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = req_ext

[dn]
CN = ${certificate.name}

[req_ext]
subjectAltName = @alt_names

[alt_names]
`;

      // Add domains
      if (certificate.domains && certificate.domains.length > 0) {
        certificate.domains.forEach((domain, index) => {
          configContent += `DNS.${index + 1} = ${domain}\n`;
        });
      }

      // Add IPs
      if (certificate.ips && certificate.ips.length > 0) {
        certificate.ips.forEach((ip, index) => {
          configContent += `IP.${index + 1} = ${ip}\n`;
        });
      }

      // Add any idle domains that are pending renewal
      if (certificate.idleDomains && certificate.idleDomains.length > 0) {
        const startIndex = (certificate.domains?.length || 0) + 1;
        certificate.idleDomains.forEach((domain, index) => {
          configContent += `DNS.${startIndex + index} = ${domain}\n`;
        });
      }

      // Add any idle IPs that are pending renewal
      if (certificate.idleIps && certificate.idleIps.length > 0) {
        const startIndex = (certificate.ips?.length || 0) + 1;
        certificate.idleIps.forEach((ip, index) => {
          configContent += `IP.${startIndex + index} = ${ip}\n`;
        });
      }

      // Write config to temp file
      const configPath = await this._createTempFile(configContent, '.cnf');

      // Create CSR
      await this.execute(`openssl req -new -key "${keyPath}" -out "${csrPath}" -config "${configPath}"`);

      // Create a temp file for the certificate output first to prevent corrupting the existing certificate
      const tempCertPath = certPath + '.tmp';

      // Determine if we need to self-sign or use a CA
      let signingCommand;

      if (options.signingCA) {
        const signingCA = options.signingCA;
        logger.debug(`Renewing with signing CA: ${signingCA.name}`, null, FILENAME);

        if (!signingCA.paths?.crtPath || !signingCA.paths?.keyPath) {
          throw new Error('Signing CA must have valid certificate and key paths');
        }

        // Sign with CA using potential passphrase for CA key
        signingCommand = `openssl x509 -req -in "${csrPath}" -CA "${signingCA.paths.crtPath}" -CAkey "${signingCA.paths.keyPath}"`;

        // Add passphrase for CA key if provided
        if (signingCAPassphrase) {
          signingCommand += ` -passin pass:"${signingCAPassphrase}"`;
        }

        signingCommand += ` -CAcreateserial -out "${tempCertPath}" -days ${days} -sha256 -extensions req_ext -extfile "${configPath}"`;
      } else {
        // Self-signed with potential passphrase for certificate key
        logger.debug(`Renewing with self-signing`, null, FILENAME);
        signingCommand = `openssl x509 -req -in "${csrPath}" -signkey "${keyPath}"`;

        // Add passphrase for certificate key if provided
        if (passphrase) {
          signingCommand += ` -passin pass:"${passphrase}"`;
        }

        signingCommand += ` -out "${tempCertPath}" -days ${days} -sha256 -extensions req_ext -extfile "${configPath}"`;
      }

      // Sign the certificate to temp file
      try {
        // Debug the command to ensure it's properly formatted
        logger.debug(`Executing signing command: ${signingCommand.replace(/pass:"[^"]*"/g, 'pass:"***"')}`, null, FILENAME);

        // Execute the signing command
        await this.execute(signingCommand);

        // Wait a moment to ensure file system has completed writing
        await new Promise(resolve => setTimeout(resolve, 100));

        // Verify the temp file was created
        if (!fs.existsSync(tempCertPath)) {
          throw new Error(`Certificate file was not created at ${tempCertPath}`);
        }

        // Check file size to ensure it's not empty
        const tempFileStats = await fs.promises.stat(tempCertPath);
        if (tempFileStats.size === 0) {
          throw new Error(`Certificate file was created but is empty: ${tempCertPath}`);
        }

        // Read a bit of the file content to ensure it's a valid certificate
        const tempFileContent = await fs.promises.readFile(tempCertPath, { encoding: 'utf8', flag: 'r' });
        if (!tempFileContent.includes('-----BEGIN CERTIFICATE-----')) {
          throw new Error(`Generated file is not a valid certificate: ${tempCertPath}`);
        }

        // Verify the new certificate is valid before replacing the old one
        try {
          await this.execute(`openssl x509 -in "${tempCertPath}" -noout -subject`);
        } catch (verifyError) {
          throw new Error(`Generated certificate is invalid: ${verifyError.message}`);
        }

        // Make a backup of the original certificate if it exists
        if (fs.existsSync(certPath)) {
          const backupPath = certPath + '.bak';
          await fs.promises.copyFile(certPath, backupPath);
          logger.debug(`Backed up original certificate to ${backupPath}`, null, FILENAME);
        }

        // Copy the temp certificate to the final location safely
        try {
          // First write the content to ensure it's read correctly
          const certContent = await fs.promises.readFile(tempCertPath, { encoding: 'utf8', flag: 'r' });
          await fs.promises.writeFile(certPath, certContent, { encoding: 'utf8', flag: 'w' });

          // Ensure proper permissions
          if (os.platform() !== 'win32') {
            await fs.promises.chmod(certPath, 0o644);
          }

          // Wait a moment to ensure file system has completed writing
          await new Promise(resolve => setTimeout(resolve, 100));

          // Verify the file exists
          if (!fs.existsSync(certPath)) {
            throw new Error(`Certificate file doesn't exist after copy: ${certPath}`);
          }

          // Verify the file content was properly written
          const finalContent = await fs.promises.readFile(certPath, { encoding: 'utf8', flag: 'r' });
          if (!finalContent.includes('-----BEGIN CERTIFICATE-----')) {
            throw new Error(`Final certificate file does not contain valid certificate data`);
          }

          // Verify the final certificate with OpenSSL
          try {
            await this.execute(`openssl x509 -in "${certPath}" -noout -subject`);
          } catch (finalVerifyError) {
            throw new Error(`Final certificate verification failed: ${finalVerifyError.message}`);
          }

          // Delete the temp file if everything succeeded
          try {
            await fs.promises.unlink(tempCertPath);
          } catch (unlinkError) {
            logger.warn(`Failed to delete temp certificate file: ${unlinkError.message}`, null, FILENAME);
          }
        } catch (copyError) {
          logger.error(`Failed to create final certificate at ${certPath}`, copyError, FILENAME);

          // Try to restore from backup if copy failed
          if (fs.existsSync(certPath + '.bak')) {
            try {
              await fs.promises.copyFile(certPath + '.bak', certPath);
              logger.info(`Restored certificate from backup after failed renewal`, null, FILENAME);
            } catch (restoreError) {
              logger.error(`Failed to restore certificate from backup`, restoreError, FILENAME);
            }
          }

          throw new Error(`Failed to create final certificate: ${copyError.message}`);
        }
      } catch (error) {
        logger.error(`Error during certificate signing/verification: ${error.message}`, error, FILENAME);

        // Clean up temp file if it exists
        if (fs.existsSync(tempCertPath)) {
          try {
            await fs.promises.unlink(tempCertPath);
          } catch (cleanupError) {
            logger.warn(`Failed to cleanup temp certificate: ${cleanupError.message}`, null, FILENAME);
          }
        }

        throw error;
      }

      // Clean up temporary config file
      await this._deleteTempFile(configPath);

      // Parse the new certificate to extract information
      const certInfo = await this.getCertificateInfo(certPath);

      // Apply all pending domains/IPs to the active list
      certificate.applyIdleSubjects();

      // Update certificate object with new values
      certificate.fingerprint = certInfo.fingerprint;
      certificate.subject = certInfo.subject;
      certificate.issuer = certInfo.issuer;
      certificate.validFrom = certInfo.validFrom;
      certificate.validTo = certInfo.validTo;
      certificate.keyType = certInfo.keyType;
      certificate.keySize = certInfo.keySize;
      certificate.sigAlg = certInfo.sigAlg;

      // Add the previous version to history if it had a fingerprint
      if (previousVersionInfo && previousFingerprint) {
        certificate.addPreviousVersion(previousFingerprint, previousVersionInfo);
        logger.info(`Added previous version ${previousVersionInfo.version} to certificate history`, null, FILENAME);
      }

      return {
        success: true,
        certificate,
        fingerprint: certInfo.fingerprint,
        certPath,
        keyPath,
        previousVersion: previousVersionInfo
      };
    } catch (error) {
      logger.error(`Failed to renew certificate for ${certificate.name}`, error, FILENAME);
      throw error;
    }
  }

  /**
   * Verify a certificate file is valid and can be read
   * @param {string} certPath - Path to certificate file
   * @returns {Promise<boolean>} True if certificate is valid
   */
  async isValidCertificateFile(certPath) {
    if (!fs.existsSync(certPath)) {
      logger.warn(`Certificate file does not exist: ${certPath}`, null, FILENAME);
      return false;
    }

    try {
      // Check file size
      const stats = await fs.promises.stat(certPath);
      if (stats.size === 0) {
        logger.warn(`Certificate file is empty: ${certPath}`, null, FILENAME);
        return false;
      }

      // Read the first part of the file to check if it's a PEM certificate
      try {
        const content = await fs.promises.readFile(certPath, { encoding: 'utf8', flag: 'r', length: 100 });
        if (!content.includes('-----BEGIN CERTIFICATE-----')) {
          logger.warn(`File does not appear to be a PEM certificate: ${certPath}`, null, FILENAME);
          // Don't return false here, still try the OpenSSL check in case it's a different format
        }
      } catch (readError) {
        logger.warn(`Could not read certificate content: ${readError.message}`, null, FILENAME);
        // Continue to try OpenSSL check
      }

      // Try to read certificate info
      try {
        await this.execute(`openssl x509 -in "${certPath}" -noout -subject`);
        return true;
      } catch (opensslError) {
        logger.warn(`OpenSSL validation failed for certificate: ${certPath}`, opensslError, FILENAME);

        // Try with different format in case it's DER
        try {
          await this.execute(`openssl x509 -inform DER -in "${certPath}" -noout -subject`);
          logger.info(`Certificate is valid in DER format: ${certPath}`, null, FILENAME);
          return true;
        } catch (derError) {
          logger.warn(`Certificate validation failed in DER format too`, derError, FILENAME);
          return false;
        }
      }
    } catch (error) {
      logger.warn(`Certificate file validation error: ${certPath}`, error, FILENAME);
      return false;
    }
  }

  /**
 * Attempt to repair a corrupt certificate file
 * @param {string} certPath - Path to certificate file
 * @returns {Promise<boolean>} True if repair was successful
 */
  async repairCertificateFile(certPath) {
    if (!fs.existsSync(certPath)) {
      logger.error(`Cannot repair non-existent certificate file: ${certPath}`, null, FILENAME);
      return false;
    }

    logger.info(`Attempting to repair certificate file: ${certPath}`, null, FILENAME);

    try {
      // Check if we have a backup file
      const backupPath = certPath + '.bak';
      if (fs.existsSync(backupPath)) {
        logger.info(`Found backup file, attempting to restore from: ${backupPath}`, null, FILENAME);

        // Verify if the backup is valid
        if (await this.isValidCertificateFile(backupPath)) {
          // Copy the backup over the corrupted file
          await fs.promises.copyFile(backupPath, certPath);
          logger.info(`Successfully restored certificate from backup: ${certPath}`, null, FILENAME);

          // Verify the restored file
          if (await this.isValidCertificateFile(certPath)) {
            return true;
          } else {
            logger.error(`Restored certificate is still invalid: ${certPath}`, null, FILENAME);
            return false;
          }
        } else {
          logger.warn(`Backup certificate is also invalid: ${backupPath}`, null, FILENAME);
        }
      }

      // Check if there's an archive version we can restore from
      const certDir = path.dirname(certPath);
      const certName = path.basename(certPath, path.extname(certPath));
      const archiveDir = path.join(certDir, 'archive', certName);

      if (fs.existsSync(archiveDir)) {
        logger.info(`Found archive directory, looking for valid archived certificates`, null, FILENAME);

        // List all files in the archive directory
        const archiveFiles = await fs.promises.readdir(archiveDir);
        const certArchives = archiveFiles.filter(file =>
          file.endsWith('.crt') || file.endsWith('.pem')
        ).sort().reverse(); // Newest first (assuming sensible file naming)

        // Try each archived certificate
        for (const archiveFile of certArchives) {
          const archivePath = path.join(archiveDir, archiveFile);
          logger.info(`Checking archived certificate: ${archivePath}`, null, FILENAME);

          if (await this.isValidCertificateFile(archivePath)) {
            logger.info(`Found valid archived certificate, restoring: ${archivePath}`, null, FILENAME);

            // Copy the archive over the corrupted file
            await fs.promises.copyFile(archivePath, certPath);

            // Verify the restored file
            if (await this.isValidCertificateFile(certPath)) {
              logger.info(`Successfully restored certificate from archive: ${certPath}`, null, FILENAME);
              return true;
            } else {
              logger.error(`Restored certificate from archive is still invalid: ${certPath}`, null, FILENAME);
            }
          }
        }

        logger.warn(`No valid certificates found in archive`, null, FILENAME);
      }

      // If we get here, we couldn't repair the file
      logger.error(`Failed to repair certificate file: ${certPath}`, null, FILENAME);
      return false;
    } catch (error) {
      logger.error(`Error attempting to repair certificate file: ${certPath}`, error, FILENAME);
      return false;
    }
  }
}

module.exports = OpenSSLWrapper;