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
   * @param {string} [certName] - Certificate name for logging context
   */
  registerFilesWithRenewalService(filePaths, duration, certName = null) {
    if (!this.renewalService) {
      logger.debug('No renewal service registered, skipping file registration', null, FILENAME);
      return;
    }

    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
    const instance = certName || 'cert-files';

    if (paths.length === 0 || paths.some(p => !p)) {
      return;
    }

    // Filter null/undefined paths and log the registration
    const validPaths = paths.filter(p => p);
    const pathsStr = validPaths.map(p => path.basename(p)).join(', ');

    logger.debug(`Registering ${validPaths.length} file(s) with renewal service: ${pathsStr}`, null, FILENAME, instance);
    logger.fine(`Files to ignore in full: ${validPaths.join(', ')}`, null, FILENAME, instance);

    try {
      this.renewalService.ignoreFilePaths(validPaths, duration || this.defaultIgnoreDuration);
      logger.debug(`Added ${validPaths.length} files to ignore list`, null, FILENAME, instance);
    } catch (error) {
      logger.warn(`Failed to register files with renewal service: ${pathsStr}: ${error.message}`, error, FILENAME, instance);
    }
  }

  /**
   * Execute an OpenSSL command
   * @param {string} cmd - Command to execute
   * @param {string} [certName] - Certificate name for context in logs
   * @returns {Promise<string>} Command output
   */
  async execute(cmd, certName = null) {
    const instance = certName || 'openssl-cmd';
    try {
      // Mask sensitive information for logging
      const logCmd = cmd.replace(/pass:"[^"]*"/g, 'pass:"***"');
      logger.fine(`Executing OpenSSL command: ${logCmd}`, null, FILENAME, instance);

      // Execute the command with better error capturing
      const execOptions = {
        maxBuffer: 2 * 1024 * 1024, // Increase buffer size to 2MB
        shell: true
      };

      const { stdout, stderr } = await execAsync(cmd, execOptions);

      // Always log stderr content for debugging
      if (stderr && stderr.trim()) {
        if (stderr.includes('Loading') || stderr.includes('writing')) {
          // These are common informational messages, not errors
          logger.fine(`OpenSSL stderr (info): ${stderr.trim()}`, null, FILENAME, instance);
        } else {
          // Log as warning as it might indicate a problem
          logger.warn(`OpenSSL stderr: ${stderr.trim()}`, stderr, FILENAME, instance);
        }
      }

      // Log the command completion
      if(logger.isLevelEnabled('finest', FILENAME)) {
        logger.finest('OpenSSL command completed successfully', stdout, FILENAME, instance);
      } else if(logger.isLevelEnabled('fine', FILENAME)) {
        const stdoutPreview = stdout && stdout.length > 100 ?
          stdout.substring(0, 97) + '...' : stdout;
        logger.fine(`OpenSSL command completed successfully: ${stdoutPreview || '(no output)'}`, null, FILENAME, instance);
      }
      return stdout.trim();
    } catch (error) {
      // Enhance error logging to provide more context
      const errorMessage = error.stderr || error.message || 'Unknown error';
      logger.error(`OpenSSL execution error for command: ${cmd.replace(/pass:"[^"]*"/g, 'pass:"***"')}`, error, FILENAME, instance);
      logger.error(`Error details: ${errorMessage}`, null, FILENAME, instance);

      // Check for common errors and provide better messages
      if (errorMessage.includes('No such file or directory')) {
        throw new Error(`OpenSSL cannot find specified file: ${errorMessage}`);
      } else if (errorMessage.includes('Permission denied')) {
        throw new Error(`Permission denied accessing OpenSSL files: ${errorMessage}`);
      } else if (errorMessage.includes('unable to load CA certificate')) {
        throw new Error(`Unable to load CA certificate: ${errorMessage}`);
      }

      throw new Error(`OpenSSL execution failed: ${errorMessage}`);
    }
  }

  /**
   * Create a temporary file with content
   * @param {string} content - Content for the file
   * @param {string} [ext='.tmp'] - File extension
   * @param {string} [certName] - Certificate name for context
   * @returns {Promise<string>} Path to the temporary file
   */
  async _createTempFile(content, ext = '.tmp', certName = null) {
    const instance = certName || 'temp-file';
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, `cert-${crypto.randomBytes(8).toString('hex')}${ext}`);

    logger.finest(`Creating temporary file with extension ${ext} at ${tempFilePath}`, null, FILENAME, instance);
    await fsPromises.writeFile(tempFilePath, content);
    return tempFilePath;
  }

  /**
   * Delete a temporary file
   * @param {string} filePath - Path to the file
   * @param {string} [certName] - Certificate name for context
   */
  async _deleteTempFile(filePath, certName = null) {
    const instance = certName || 'temp-file';
    if (!filePath) return;

    try {
      logger.finest(`Deleting temporary file: ${filePath}`, null, FILENAME, instance);
      await fsPromises.unlink(filePath);
    } catch (error) {
      logger.warn(`Failed to delete temporary file ${path.basename(filePath)}: ${error.message}`, error, FILENAME, instance);
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

    logger.fine(`Creating temporary directory for certificate operations: ${tempDirPath}`, null, FILENAME, safeName);
    await fsPromises.mkdir(tempDirPath, { recursive: true });

    return tempDirPath;
  }

  /**
   * Create temporary file paths for certificate operations
   * @param {string} certificateName - Certificate name
   * @param {Object} [options] - Options for path creation
   * @param {string} [options.crtExt='.crt'] - Certificate file extension
   * @param {string} [options.keyExt='.key'] - Key file extension
   * @param {string} [options.csrExt='.csr'] - CSR file extension
   * @returns {Promise<Object>} Object with temp file paths
   */
  async createTempCertPaths(certificateName, options = {}) {
    const safeName = certificateName?.replace(/[^a-zA-Z0-9-]/g, '_') || 'certificate';
    const instance = safeName;

    // Create a temporary directory
    const tempDir = await this._createTempCertDir(safeName);

    // Set default extensions
    const crtExt = options.crtExt || '.crt';
    const keyExt = options.keyExt || '.key';
    const csrExt = options.csrExt || '.csr';

    // Create file paths
    const certPath = path.join(tempDir, safeName + crtExt);
    const keyPath = path.join(tempDir, safeName + keyExt);
    const csrPath = path.join(tempDir, safeName + csrExt);

    logger.fine(`Created temporary certificate paths:`, null, FILENAME, instance);
    logger.fine(`  Cert: ${certPath}`, null, FILENAME, instance);
    logger.fine(`  Key: ${keyPath}`, null, FILENAME, instance);
    logger.fine(`  CSR: ${csrPath}`, null, FILENAME, instance);

    return {
      certPath,
      keyPath,
      csrPath,
      tempDir
    };
  }

  /**
   * Generate an OpenSSL config file for certificate creation
   * @param {Object} config - Certificate configuration
   * @param {string} [certName] - Certificate name for logging
   * @returns {Promise<string>} Path to config file
   */
  async _generateOpenSSLConfig(config, certName = null) {
    const instance = certName || config.name || 'cert-config';
    logger.fine(`Generating OpenSSL config for certificate${certName ? ` ${certName}` : ''}`, null, FILENAME, instance);

    // Process the subject for openSSL
    let subject = config.subject || '';

    // Log the original subject
    logger.fine(`Original subject: ${subject}`, null, FILENAME, instance);

    // Convert subject from format "C=US, O=Acme, CN=example.com" to format acceptable by openssl config
    // This ensures proper handling of special characters and spaces
    if (subject) {
      subject = subject
        .split(',')
        .map(part => part.trim())
        .join('\n');

      logger.fine(`Safe subject for OpenSSL: ${subject}`, null, FILENAME, instance);
    }

    // Build the config content
    let configContent = `
[ req ]
distinguished_name = req_dn
req_extensions = v3_req
prompt = no

[ req_dn ]
${subject}

[ v3_req ]
basicConstraints = ${config.isCA ? 'critical, CA:TRUE' : 'CA:FALSE'}
${config.isCA && config.pathLengthConstraint !== undefined ? `pathlen:${config.pathLengthConstraint}` : ''}
keyUsage = ${config.isCA ? 'critical, keyCertSign, cRLSign, digitalSignature' : 'digitalSignature, keyEncipherment'}
${config.isCA ? '' : 'extendedKeyUsage = serverAuth, clientAuth'}
`;

    // Add subjectAltName extensions if specified
    const sans = config._sans || config.sans;
    if (sans) {
      const domains = sans.domains || [];
      const ips = sans.ips || [];

      // Add alt names if there are any
      if (domains.length > 0 || ips.length > 0) {
        configContent += '\nsubjectAltName = @alt_names\n\n[ alt_names ]\n';

        // Add DNS entries
        domains.forEach((domain, i) => {
          const safeValue = domain.replace(/["\r\n]/g, '');
          configContent += `DNS.${i + 1} = ${safeValue}\n`;
        });
        logger.fine(`Adding ${domains.length} domains to certificate config`, null, FILENAME, instance);

        // Add IP entries
        ips.forEach((ip, i) => {
          const safeValue = ip.replace(/["\r\n]/g, '');
          configContent += `IP.${i + 1} = ${safeValue}\n`;
        });
        logger.fine(`Adding ${ips.length} IPs to certificate config`, null, FILENAME, instance);
      }
    }

    // Write config to temp file and return the path
    const configPath = await this._createTempFile(configContent, '.cnf', instance);
    logger.fine(`Created certificate configuration at: ${configPath}`, null, FILENAME, instance);

    return configPath;
  }

  /**
   * Generate a private key
   * @param {string} keyPath - Where to save the key
   * @param {Object} options - Key generation options
   * @param {number} [options.bits=2048] - Key size in bits
   * @param {boolean} [options.encrypt=false] - Whether to encrypt the key
   * @param {string} [options.passphrase=''] - Passphrase for key encryption
   * @param {string} [options.certName] - Certificate name for logging
   * @returns {Promise<string>} Path to the generated key
   */
  async generatePrivateKey(keyPath, options = {}) {
    const instance = options.certName || 'private-key';
    logger.debug(`Generating ${options.bits || 2048}-bit private key${options.encrypt ? ' (encrypted)' : ''}`, null, FILENAME, instance);

    try {
      let cmd = `openssl genpkey -algorithm RSA -out "${keyPath}" -pkeyopt rsa_keygen_bits:${options.bits || 2048}`;

      // Add encryption if requested
      if (options.encrypt) {
        logger.fine('Adding encryption to private key', null, FILENAME, instance);
        cmd += ` -aes256 -pass pass:"${options.passphrase || ''}"`;
      }

      await this.execute(cmd, instance);
      logger.info(`Generated private key: ${path.basename(keyPath)}`, null, FILENAME, instance);

      return keyPath;
    } catch (error) {
      logger.error(`Failed to generate private key: ${error.message}`, error, FILENAME, instance);
      throw new Error(`Failed to generate private key: ${error.message}`);
    }
  }

  /**
   * Create a certificate signing request (CSR)
   * @param {Object} tempPaths - Temporary file paths
   * @param {Object} config - Certificate configuration
   * @param {string} configPath - Path to OpenSSL config file
   * @param {string} [certName] - Certificate name for logging context
   * @returns {Promise<string>} Path to CSR file
   * @private
   */
  async _createCSR(tempPaths, config, configPath, certName = null) {
    const instance = certName || config.name || 'csr';
    logger.debug(`Creating Certificate Signing Request (CSR)`, null, FILENAME, instance);

    // Build command to create CSR
    let cmd = `openssl req -new -key "${tempPaths.keyPath}" -out "${tempPaths.csrPath}" -config "${configPath}"`;

    // Add passphrase if the key is encrypted
    if (config.passphrase !== undefined && config.passphrase !== null) {
      cmd += ` -passin pass:"${config.passphrase}"`;
    }

    await this.execute(cmd, instance);
    logger.fine(`CSR created at: ${tempPaths.csrPath}`, null, FILENAME, instance);

    return tempPaths.csrPath;
  }

  /**
   * Create a self-signed certificate
   * @param {Object} tempPaths - Temporary file paths
   * @param {Object} config - Certificate configuration
   * @param {string} configPath - Path to OpenSSL config file
   * @private
   */
  async _createSelfSignedCert(tempPaths, config, configPath) {
    const instance = config.name || 'self-signed';
    logger.debug(`Creating self-signed certificate`, null, FILENAME, instance);

    // Build self-signed certificate command
    let cmd = `openssl req -x509 -new -nodes -key "${tempPaths.keyPath}" -sha256 -days ${config.days} -out "${tempPaths.certPath}" -config "${configPath}"`;

    // Add passphrase if the key is encrypted
    if (config.passphrase !== undefined && config.passphrase !== null) {
      cmd += ` -passin pass:"${config.passphrase}"`;
    }

    await this.execute(cmd, instance);
    logger.info(`Self-signed certificate created at: ${tempPaths.certPath}`, null, FILENAME, instance);
  }

/**
 * Helper method to sign a certificate with a CA
 * @param {Object} tempPaths - Paths to temp files
 * @param {Object} config - Certificate configuration
 * @param {string} configPath - Path to OpenSSL config file
 * @param {string} [instance] - Certificate name for logging context
 * @private
 */
async _signWithCA(tempPaths, config, configPath, instance = null) {
  const certName = instance || config.name || 'ca-signed';
  logger.fine(`Signing certificate with CA`, config, FILENAME, certName);

  // First verify that we have valid signingCA information
  if (!config.signingCA) {
    const errorMsg = `Missing signingCA configuration for certificate ${certName}`;
    logger.error(errorMsg, null, FILENAME, certName);
    throw new Error(errorMsg);
  }

  // Handle both certPath and crtPath in signingCA
  const caCertPath = config.signingCA.crtPath || config.signingCA.certPath;
  const caKeyPath = config.signingCA.keyPath;

  // Check that both paths are valid
  if (!caCertPath) {
    const errorMsg = `Missing CA certificate path for signing ${certName}`;
    logger.error(errorMsg, null, FILENAME, certName);
    throw new Error(errorMsg);
  }

  if (!caKeyPath) {
    const errorMsg = `Missing CA key path for signing ${certName}`;
    logger.error(errorMsg, null, FILENAME, certName);
    throw new Error(errorMsg);
  }

  logger.debug(`Signing certificate with CA: ${caCertPath}`, null, FILENAME, certName);

  // Ensure paths are correct and absolute
  const absoluteCaCertPath = path.isAbsolute(caCertPath) 
    ? caCertPath
    : path.resolve(caCertPath);
    
  const absoluteCaKeyPath = path.isAbsolute(caKeyPath)
    ? caKeyPath
    : path.resolve(caKeyPath);

  // Validate paths exist
  if (!fs.existsSync(absoluteCaCertPath)) {
    const errorMsg = `CA certificate file not found: ${absoluteCaCertPath}`;
    logger.error(errorMsg, null, FILENAME, certName);
    throw new Error(errorMsg);
  }

  if (!fs.existsSync(absoluteCaKeyPath)) {
    const errorMsg = `CA key file not found: ${absoluteCaKeyPath}`;
    logger.error(errorMsg, null, FILENAME, certName);
    throw new Error(errorMsg);
  }

  // Create a serial file for the CA if it doesn't exist
  const caDir = path.dirname(absoluteCaCertPath);
  const serialPath = path.join(caDir, `${path.basename(absoluteCaCertPath, path.extname(absoluteCaCertPath))}.srl`);
  
  if (!fs.existsSync(serialPath)) {
    logger.fine(`Creating serial file for CA at ${serialPath}`, null, FILENAME, certName);
    const serialNumber = crypto.randomBytes(16).toString('hex');
    await fsPromises.writeFile(serialPath, serialNumber);
    this.registerFilesWithRenewalService(serialPath, null, certName);
  }

  // Sign the certificate with CA using absolute paths
  let signingCmd = `openssl x509 -req -in "${tempPaths.csrPath}" -CA "${absoluteCaCertPath}" -CAkey "${absoluteCaKeyPath}"`;

  // Add CA passphrase if provided
  if (config.signingCA.passphrase) {
    // Log the command without revealing the actual passphrase
    logger.fine(`Adding CA passphrase to signing command`, null, FILENAME, certName);
    signingCmd += ` -passin pass:"${config.signingCA.passphrase}"`;
  }

  signingCmd += ` -out "${tempPaths.certPath}" -days ${config.days} -sha256 -extensions v3_req -extfile "${configPath}"`;

  // Log the command with paths for debugging (with passphrase masked)
  const sanitizedCmd = signingCmd.replace(/-passin pass:"[^"]*"/, '-passin pass:"***"');
  logger.finest(`Signing command: ${sanitizedCmd}`, null, FILENAME, certName);

  await this.execute(signingCmd, certName);
  logger.info(`Certificate signed by CA and saved to temp location: ${tempPaths.certPath}`, null, FILENAME, certName);
}



  /**
   * Extract certificate information
   * @param {string} certPath - Path to certificate file
   * @param {string} [certName] - Certificate name for logging
   * @returns {Promise<Object>} Certificate information aligned with ForgeCryptoService
   */
  async getCertificateInfo(certPath, certName = null) {
    const instance = certName || path.basename(certPath, path.extname(certPath));
    logger.debug(`Getting certificate info from: ${certPath} using OpenSSL`, null, FILENAME, instance);

    try {
      if (!fs.existsSync(certPath)) {
        logger.error(`Certificate file not found: ${certPath}`, null, FILENAME, instance);
        throw new Error(`Certificate file not found: ${certPath}`);
      }

      // Get text representation of certificate
      logger.finest(`Executing openssl x509 to read certificate: ${certPath}`, null, FILENAME, instance);
      // Use -nameopt RFC2253 for a more standard DN output, though _formatDN in forge is different
      // We will use the default OpenSSL output and rely on its typical structure.
      const certText = await this.execute(`openssl x509 -in "${certPath}" -text -noout`, instance);

      // --- Subject and Issuer ---
      const subjectMatch = certText.match(/Subject:\s*([^\n]+)/);
      const subjectString = subjectMatch ? subjectMatch[1].trim() : null;
      logger.fine(`Certificate subject: ${subjectString}`, null, FILENAME, instance);

      const issuerMatch = certText.match(/Issuer:\s*([^\n]+)/);
      const issuerString = issuerMatch ? issuerMatch[1].trim() : null;
      logger.fine(`Certificate issuer: ${issuerString}`, null, FILENAME, instance);

      // --- Common Name (from Subject) ---
      const cnMatch = subjectString && subjectString.match(/CN\s*=\s*([^,]+)/i);
      const commonName = cnMatch ? cnMatch[1].trim() : null;
      logger.fine(`Certificate CN: ${commonName}`, null, FILENAME, instance);

      // --- Issuer Common Name ---
      const issuerCNMatch = issuerString && issuerString.match(/CN\s*=\s*([^,]+)/i);
      const issuerCN = issuerCNMatch ? issuerCNMatch[1].trim() : null;
      logger.fine(`Certificate Issuer CN: ${issuerCN}`, null, FILENAME, instance);
      
      // --- Self-Signed ---
      // _isSelfSigned already normalizes and compares subject and issuer strings
      const isSelfSigned = this._isSelfSigned(subjectString, issuerString);
      logger.fine(`Self-signed certificate: ${isSelfSigned}`, null, FILENAME, instance);

      // --- Validity Period ---
      const validityMatch = certText.match(/Not Before:\s*([^\n]+)\s*Not After\s*:\s*([^\n]+)/);
      let validFrom = null;
      let validTo = null;
      if (validityMatch) {
        validFrom = new Date(validityMatch[1].trim());
        validTo = new Date(validityMatch[2].trim());
        logger.fine(`Certificate validity: ${validFrom.toISOString()} to ${validTo.toISOString()}`, null, FILENAME, instance);
      }

      // --- Serial Number ---
      const serialMatch = certText.match(/Serial Number:\s*(?:.*\n\s*)?([0-9a-fA-F:]+)/i);
      // OpenSSL might output "00:01:02..." or just "102...". Ensure it's a clean hex string.
      let serialNumber = null;
      if (serialMatch && serialMatch[1]) {
        serialNumber = serialMatch[1].replace(/^00:/, '').replace(/:/g, '').toUpperCase();
      }
      logger.fine(`Certificate serial number: ${serialNumber}`, null, FILENAME, instance);

      // --- Key Identifier (Subject Key Identifier) ---
      const subjectKeyIdentifierMatch = certText.match(/X509v3 Subject Key Identifier:\s*\n\s*([0-9A-F:]+)/i);
      const subjectKeyIdentifier = subjectKeyIdentifierMatch ? subjectKeyIdentifierMatch[1].replace(/:/g, '').toUpperCase() : null;
      logger.fine(`Certificate SKI: ${subjectKeyIdentifier}`, null, FILENAME, instance);

      // --- Authority Key Identifier (keyid part) ---
      const authKeyIdMatch = certText.match(/X509v3 Authority Key Identifier:\s*\n\s*([0-9A-F:]+)/i);
      const authorityKeyIdentifier = authKeyIdMatch ? authKeyIdMatch[1].replace(/:/g, '').toUpperCase().trim() : null;
      logger.fine(`Certificate AKI (keyid): ${authorityKeyIdentifier}`, null, FILENAME, instance);

      // --- Signature Algorithm ---
      const signatureAlgorithmMatch = certText.match(/Signature Algorithm:\s*([^\n]+)/);
      const signatureAlgorithm = signatureAlgorithmMatch ? signatureAlgorithmMatch[1].trim() : null;
      logger.fine(`Certificate signature algorithm: ${signatureAlgorithm}`, null, FILENAME, instance);

      // --- Public Key Type and Size ---
      const keyTypeMatch = certText.match(/Public Key Algorithm:\s*([^\n]+)/);
      let keyType = null; // RSA, EC, DSA
      let keySize = null;

      if (keyTypeMatch) {
        const pkAlgorithm = keyTypeMatch[1].trim().toLowerCase();
        if (pkAlgorithm.includes('rsa')) keyType = 'RSA';
        else if (pkAlgorithm.includes('ec') || pkAlgorithm.includes('elliptic curve')) keyType = 'EC';
        else if (pkAlgorithm.includes('dsa')) keyType = 'DSA';
      }
      
      const rsaKeySizeMatch = certText.match(/Public-Key:\s*\((\d+)\s*bit\)/);
      if (rsaKeySizeMatch) {
        keySize = parseInt(rsaKeySizeMatch[1], 10);
      } else {
        // For EC, try to infer from curve name if present
        const ecCurveMatch = certText.match(/(?:ASN1 OID:|NIST CURVE:)\s*([^\s\n]+)/i);
        if (ecCurveMatch && ecCurveMatch[1]) {
            const curve = ecCurveMatch[1].toLowerCase();
            if (curve.includes('p-256') || curve.includes('secp256r1') || curve.includes('prime256v1')) keySize = 256;
            else if (curve.includes('p-384') || curve.includes('secp384r1')) keySize = 384;
            else if (curve.includes('p-521') || curve.includes('secp521r1')) keySize = 521;
        }
      }
      logger.fine(`Certificate key type: ${keyType}, size: ${keySize}`, null, FILENAME, instance);

      // --- Subject Alternative Names (SANs) ---
      const sans = { domains: [], ips: [] };
      // Regex to capture the whole SAN block more reliably
      const sanBlockMatch = certText.match(/X509v3 Subject Alternative Name:\s*\n\s*([^\n]+(?:\n\s+[^\n]+)*)/i);
      if (sanBlockMatch) {
        const sanText = sanBlockMatch[1].replace(/\n\s*/g, ' '); // Normalize multi-line SANs
        logger.finest(`Extracting SANs from SAN block: "${sanText}"`, null, FILENAME, instance);
        
        const dnsMatches = sanText.matchAll(/DNS:([^,]+)/g);
        for (const match of dnsMatches) {
          sans.domains.push(match[1].trim().toLowerCase());
        }
        
        const ipMatches = sanText.matchAll(/IP Address:([^,]+)/g);
        for (const match of ipMatches) {
          sans.ips.push(match[1].trim());
        }
      }
      // Add CN to domains if not already present (case-insensitive check)
      if (commonName && !sans.domains.some(d => d === commonName.toLowerCase())) {
        sans.domains.unshift(commonName.toLowerCase());
      }
      sans.domains = [...new Set(sans.domains)].sort(); // Unique, sorted
      sans.ips.sort(); // Sorted
      logger.fine(`Certificate SANs: ${sans.domains.length} domains, ${sans.ips.length} IPs`, null, FILENAME, instance);
      logger.finest(`Domains: ${sans.domains.join(', ')}, IPs: ${sans.ips.join(', ')}`, null, FILENAME, instance);
      
      // --- CA Information ---
      const caMatch = certText.match(/X509v3 Basic Constraints:(?:critical)?\s*\n\s*CA:(TRUE|FALSE)/i);
      const isCA = caMatch ? caMatch[1].toUpperCase() === 'TRUE' : false;
      logger.fine(`Certificate is CA: ${isCA}`, null, FILENAME, instance);

      let pathLenConstraint; // undefined if not present
      if (isCA) {
        const pathLengthMatch = certText.match(/pathlen:(\d+)/i);
        if (pathLengthMatch) {
          pathLenConstraint = parseInt(pathLengthMatch[1], 10);
          logger.fine(`CA path length constraint: ${pathLenConstraint}`, null, FILENAME, instance);
        }
      }
      const isRootCA = isCA && isSelfSigned; // A root CA is a self-signed CA

      // --- Fingerprint (SHA-256) ---
      const fingerprintSha256 = await this._getCertificateFingerprint(certPath, instance); // Already uppercase, no colons
      
      // --- Original Encoding (Best Effort) ---
      // OpenSSL's `x509 -in ... -text` handles both PEM and DER.
      // We can't be certain of the original without trying to parse specifically.
      // For now, we'll leave it null or assume PEM if it parsed.
      // A more robust check would involve trying to read as PEM, then as DER.
      let originalEncoding = null;
      try {
        const rawContent = await fsPromises.readFile(certPath, 'utf8');
        if (rawContent.includes('-----BEGIN CERTIFICATE-----')) {
            originalEncoding = 'PEM';
        } else {
            // Could be DER or corrupted PEM. If OpenSSL parsed it, it's valid.
            // We could try a DER parse here with OpenSSL if needed, but for now, this is a basic check.
            const stats = await fsPromises.stat(certPath);
            if (stats.size > 0) { // Basic check if it's not empty
                 // Assume DER if not clearly PEM and OpenSSL parsed it. This is a heuristic.
                originalEncoding = 'DER'; // Could be wrong if it's PEM without headers/footers that OpenSSL still read.
            }
        }
      } catch (e) { /* ignore, originalEncoding remains null */ }
      logger.fine(`Guessed original encoding: ${originalEncoding}`, null, FILENAME, instance);


      const result = {
        fingerprint: fingerprintSha256,
        commonName: commonName,
        subject: subjectString,
        issuer: issuerString,
        issuerCN: issuerCN,
        validFrom: validFrom,
        validTo: validTo,
        serialNumber: serialNumber,
        keyType: keyType,
        keySize: keySize,
        originalEncoding: originalEncoding,
        signatureAlgorithm: signatureAlgorithm,
        subjectKeyIdentifier: subjectKeyIdentifier,
        authorityKeyIdentifier: authorityKeyIdentifier,
        isCA: isCA,
        pathLenConstraint: pathLenConstraint,
        isSelfSigned: isSelfSigned,
        isRootCA: isRootCA,
        sans: sans
      };
      logger.fine(`Got certificate info from ${certPath} using OpenSSL`, result, FILENAME, instance);
      return result;
    } catch (error) {
      logger.error(`Failed to get certificate info from ${certPath} using OpenSSL: ${error.message}`, error, FILENAME, instance);
      throw new Error(`Failed to get certificate info with OpenSSL: ${error.message}`);
    }
  }

  /**
   * Get certificate fingerprint
   * @param {string} certPath - Path to certificate
   * @param {string} [certName] - Certificate name for logging
   * @returns {Promise<string>} Certificate fingerprint (SHA-256)
   * @private
   */
  async _getCertificateFingerprint(certPath, certName = null) {
    const instance = certName || path.basename(certPath, path.extname(certPath));
    try {
      logger.finest(`Getting SHA-256 fingerprint for certificate: ${certPath}`, null, FILENAME, instance);
      const output = await this.execute(`openssl x509 -in "${certPath}" -fingerprint -sha256 -noout`, instance);

      const fingerprintMatch = output.match(/Fingerprint=([0-9A-F:]+)/i);
      if (fingerprintMatch) {
        // Strip colons from fingerprint
        return fingerprintMatch[1].replace(/:/g, '');
      } else {
        logger.warn(`Unexpected fingerprint format: ${output}`, null, FILENAME, instance);
        return null;
      }
    } catch (error) {
      logger.error(`Error getting certificate fingerprint: ${error.message}`, error, FILENAME, instance);
      return null;
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
    // Handle null or undefined inputs gracefully
    if (subject === null || subject === undefined || issuer === null || issuer === undefined) {
        logger.fine(`isSelfSigned check - Subject or Issuer is null/undefined. self-signed: false`, null, FILENAME);
        return false;
    }
    logger.fine(`isSelfSigned check - Comparing:`, null, FILENAME);
    logger.finest(`Subject: "${subject}"`, null, FILENAME);
    logger.finest(`Issuer:  "${issuer}"`, null, FILENAME);

    if (subject === issuer) {
      logger.fine(`Direct string comparison matched - self-signed: true`, null, FILENAME);
      return true;
    }

    const normalizeString = (str) => {
      logger.finest(`Normalizing string: "${str}"`, null, FILENAME);
      const components = [];
      // Regex to capture TYPE=Value pairs, attempting to handle quoted values that might contain commas.
      // This is still a simplification and might not cover all edge cases of RFC 2253/4514 DNs.
      const regex = /([a-zA-Z0-9.]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,]+))(?:,|$)/g;
      let match;

      while ((match = regex.exec(str)) !== null) {
        // match[2] is the quoted value, match[3] is the unquoted value
        const value = match[2] ? match[2].replace(/\\"/g, '"').replace(/\\,/g, ',') : match[3].trim();
        components.push({ key: match[1].toUpperCase(), value: value });
        logger.finest(`  Found component: ${match[1].toUpperCase()}=${value}`, null, FILENAME);
      }

      logger.finest(`  Extracted ${components.length} components`, null, FILENAME);
      components.sort((a, b) => a.key.localeCompare(b.key));
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
   * Verify if a certificate is valid
   * @param {string} certPath - Path to certificate
   * @param {string} [caPath] - Path to CA certificate (optional)
   * @param {string} [certName] - Certificate name for logging
   * @returns {Promise<Object>} Verification result
   */
  async verifyCertificate(certPath, caPath = null, certName = null) {
    const instance = certName || path.basename(certPath, path.extname(certPath));
    logger.debug(`Verifying certificate: ${certPath}${caPath ? ` against CA: ${caPath}` : ''}`, null, FILENAME, instance);

    try {
      if (!fs.existsSync(certPath)) {
        logger.error(`Certificate file not found: ${certPath}`, null, FILENAME, instance);
        return {
          valid: false,
          error: `Certificate file not found: ${certPath}`
        };
      }

      let cmd;
      if (caPath && fs.existsSync(caPath)) {
        // Verify against CA
        logger.fine(`Verifying certificate against CA: ${caPath}`, null, FILENAME, instance);
        cmd = `openssl verify -CAfile "${caPath}" "${certPath}"`;
      } else {
        // Self-verify (for self-signed certs)
        logger.fine(`Self-verifying certificate (no CA provided)`, null, FILENAME, instance);
        cmd = `openssl verify -CAfile "${certPath}" "${certPath}"`;
      }

      const result = await this.execute(cmd, instance);
      const isValid = result.includes('OK');

      if (isValid) {
        logger.info(`Certificate verification successful: ${certPath}`, null, FILENAME, instance);
        return { valid: true };
      } else {
        logger.warn(`Certificate verification failed: ${result}`, null, FILENAME, instance);
        return {
          valid: false,
          error: result
        };
      }
    } catch (error) {
      logger.error(`Error verifying certificate: ${error.message}`, error, FILENAME, instance);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Check if a private key is encrypted
   * @param {string} keyPath - Path to the key file
   * @param {string} [certName] - Certificate name for logging
   * @returns {Promise<boolean>} True if key is encrypted
   */
  async isKeyEncrypted(keyPath, certName = null) {
    const instance = certName || path.basename(keyPath, path.extname(keyPath));
    logger.debug(`Checking if key is encrypted: ${keyPath}`, null, FILENAME, instance);

    try {
      if (!fs.existsSync(keyPath)) {
        logger.error(`Key file not found: ${keyPath}`, null, FILENAME, instance);
        throw new Error(`Key file not found: ${keyPath}`);
      }

      const keyData = await fsPromises.readFile(keyPath, 'utf8');

      // Check for indicators of encryption in PEM file
      const isProcEncrypted = keyData.includes('ENCRYPTED');
      const isAES = keyData.includes('AES-');
      const isDES = keyData.includes('DES-');

      const isEncrypted = isProcEncrypted || isAES || isDES;
      logger.fine(`Key ${keyPath} is${isEncrypted ? '' : ' not'} encrypted`, null, FILENAME, instance);

      return isEncrypted;
    } catch (error) {
      logger.error(`Error checking if key is encrypted: ${error.message}`, error, FILENAME, instance);
      throw error;
    }
  }

  /**
   * Validate a key-certificate pair
   * @param {string} certPath - Path to certificate
   * @param {string} keyPath - Path to private key
   * @param {string} [passphrase] - Passphrase for encrypted key
   * @param {string} [certName] - Certificate name for logging
   * @returns {Promise<boolean>} True if key matches certificate
   */
  async validateKeyPair(certPath, keyPath, passphrase = null, certName = null) {
    const instance = certName || path.basename(certPath, path.extname(certPath));
    logger.debug(`Validating key-certificate pair: ${certPath} and ${keyPath}`, null, FILENAME, instance);

    try {
      if (!fs.existsSync(certPath)) {
        logger.error(`Certificate file not found: ${certPath}`, null, FILENAME, instance);
        throw new Error(`Certificate file not found: ${certPath}`);
      }

      if (!fs.existsSync(keyPath)) {
        logger.error(`Key file not found: ${keyPath}`, null, FILENAME, instance);
        throw new Error(`Key file not found: ${keyPath}`);
      }

      // Extract modulus from certificate
      let certModulusCmd = `openssl x509 -noout -modulus -in "${certPath}"`;
      logger.finest(`Extracting modulus from certificate: ${certPath}`, null, FILENAME, instance);
      const certModulus = await this.execute(certModulusCmd, instance);

      // Extract modulus from key
      let keyModulusCmd = `openssl rsa -noout -modulus -in "${keyPath}"`;

      // Add passphrase if provided
      if (passphrase !== null && passphrase !== undefined) {
        logger.fine(`Using provided passphrase for key validation`, null, FILENAME, instance);
        keyModulusCmd += ` -passin pass:"${passphrase}"`;
      }

      logger.finest(`Extracting modulus from key: ${keyPath}`, null, FILENAME, instance);
      const keyModulus = await this.execute(keyModulusCmd, instance);

      // Compare the moduli
      const isValid = certModulus === keyModulus;
      logger.fine(`Key-certificate validation result: ${isValid ? 'VALID' : 'INVALID'}`, null, FILENAME, instance);

      if (!isValid) {
        logger.warn(`Key does not match certificate: ${keyPath} ↔ ${certPath}`, null, FILENAME, instance);
      } else {
        logger.info(`Key and certificate verified as a matching pair`, null, FILENAME, instance);
      }

      return isValid;
    } catch (error) {
      logger.error(`Error validating key-certificate pair: ${error.message}`, error, FILENAME, instance);

      // Special handling for passphrase errors
      const errorLower = error.message.toLowerCase();
      if (errorLower.includes('bad decrypt') || errorLower.includes('wrong password')) {
        logger.warn(`Incorrect passphrase for key: ${keyPath}`, null, FILENAME, instance);
        throw new Error(`Incorrect passphrase for key: ${path.basename(keyPath)}`);
      }

      throw error;
    }
  }

  /**
   * Get certificate expiration date
   * @param {string} certPath - Path to certificate
   * @param {string} [certName] - Certificate name for logging
   * @returns {Promise<Date>} Expiration date
   */
  async getCertificateExpiration(certPath, certName = null) {
    const instance = certName || path.basename(certPath, path.extname(certPath));
    logger.debug(`Getting expiration date for certificate: ${certPath}`, null, FILENAME, instance);

    try {
      if (!fs.existsSync(certPath)) {
        logger.error(`Certificate file not found: ${certPath}`, null, FILENAME, instance);
        throw new Error(`Certificate file not found: ${certPath}`);
      }

      const output = await this.execute(`openssl x509 -in "${certPath}" -enddate -noout`, instance);
      const dateMatch = output.match(/notAfter=(.+)$/);

      if (dateMatch && dateMatch[1]) {
        // Parse the OpenSSL date format
        const expirationDate = new Date(dateMatch[1]);
        logger.fine(`Certificate expiration date: ${expirationDate.toISOString()}`, null, FILENAME, instance);
        return expirationDate;
      } else {
        logger.warn(`Could not parse expiration date from: ${output}`, null, FILENAME, instance);
        throw new Error(`Could not parse certificate expiration date from: ${output}`);
      }
    } catch (error) {
      logger.error(`Error getting certificate expiration: ${error.message}`, error, FILENAME, instance);
      throw error;
    }
  }

  /**
   * Calculate days until certificate expires
   * @param {string} certPath - Path to certificate
   * @param {string} [certName] - Certificate name for logging
   * @returns {Promise<number>} Days until expiration
   */
  async getDaysUntilExpiration(certPath, certName = null) {
    const instance = certName || path.basename(certPath, path.extname(certPath));
    logger.debug(`Calculating days until expiration for: ${certPath}`, null, FILENAME, instance);

    try {
      const expirationDate = await this.getCertificateExpiration(certPath, instance);
      const now = new Date();

      // Calculate difference in days
      const diffTime = expirationDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      logger.fine(`Certificate expires in ${diffDays} days`, null, FILENAME, instance);
      return diffDays;
    } catch (error) {
      logger.error(`Error calculating days until expiration: ${error.message}`, error, FILENAME, instance);
      throw error;
    }
  }

  /**
   * Check if a path is a valid certificate
   * @param {string} certPath - Path to check
   * @returns {Promise<boolean>} True if valid certificate
   */
  async isValidCertificatePath(certPath) {
    try {
      if (!fs.existsSync(certPath)) {
        return false;
      }

      // Try to read it as a certificate
      await this.execute(`openssl x509 -in "${certPath}" -noout`, 'path-validation');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if a path is a valid private key
   * @param {string} keyPath - Path to check
   * @returns {Promise<boolean>} True if valid key
   */
  async isValidKeyPath(keyPath) {
    try {
      if (!fs.existsSync(keyPath)) {
        return false;
      }

      // Try to read it as a key (ignoring any passphrase requirements)
      await this.execute(`openssl rsa -in "${keyPath}" -check -noout -passin pass:dummy 2>/dev/null || openssl rsa -in "${keyPath}" -check -noout 2>/dev/null`, 'path-validation');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Restore all previously available certificate formats after renewal
   * @param {Certificate} certificate - Renewed certificate
   * @param {Object} previousFormats - Result from trackCertificateFormats before renewal
   * @returns {Promise<Object>} Result with restored formats
   */
  async restoreCertificateFormats(certificate, previousFormats) {
    if (!certificate || !certificate.paths || !certificate.paths.crtPath) {
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
   * Track available certificate formats for a certificate
   * @param {Certificate} certificate - Certificate to track formats for
   * @returns {Object} Object with available formats and their paths
   */
  async trackCertificateFormats(certificate) {
    if (!certificate || !certificate.paths || !certificate.paths.crtPath) {
      logger.warn(`Cannot track formats for invalid certificate`, null, FILENAME);
      return { formats: [] };
    }

    const baseDir = path.dirname(certificate.paths.crtPath);
    const baseName = path.basename(certificate.paths.crtPath, path.extname(certificate.paths.crtPath));
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

      // Log all available subjectKeyIdentifiers for debugging
      const availableKeyIds = allCerts
        .filter(c => c.isCA && c.subjectKeyIdentifier)
        .map(c => ({ name: c.name, subjectKeyIdentifier: c.subjectKeyIdentifier, fingerprint: c.fingerprint }));

      logger.finest(`Available CA subjectKeyIdentifiers: ${JSON.stringify(availableKeyIds)}`, null, FILENAME);

      const parentByKeyId = allCerts.find(c =>
        c.fingerprint !== cert.fingerprint && // Not the same cert
        c.isCA && // Must be a CA
        c.subjectKeyIdentifier === cert.authorityKeyId // Match by Authority Key ID
      );

      if (parentByKeyId) {
        logger.debug(`Found parent by subjectKeyIdentifier: ${parentByKeyId.name} (${parentByKeyId.fingerprint})`, null, FILENAME);
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
   * Convert a certificate to various formats
   * @param {Certificate} certificate - Certificate to convert
   * @param {string} outputFormat - Format to convert to ('p12', 'pem', 'der', 'pfx')
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Result with path to converted certificate
   */
  async convertCertificate(certificate, outputFormat, options = {}) {
    logger.debug(`Converting certificate '${certificate.name}' to ${outputFormat.toUpperCase()} format`, null, FILENAME);

    if (!certificate || !certificate.paths || !certificate.paths.crtPath) {
      throw new Error('Invalid certificate or missing certificate path');
    }

    const crtPath = certificate.paths.crtPath;
    const keyPath = certificate.paths.keyPath;

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

    const crtPath = certificate.paths?.crtPath;

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
   * Convert certificate to PKCS#12 (P12) format
   * @param {Certificate} certificate - Certificate to convert
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Result object
   */
  async convertToP12(certificate, options = {}) {
    const crtPath = certificate.paths?.crtPath;
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

    const crtPath = certificate.paths?.crtPath;
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
   * Create a new certificate
   * @param {Object} config - Certificate configuration
   * @returns {Promise<Object>} Result with certificate details and temp paths
   */
  async createCertificate(config) {
    const instance = config.name || (config.subject?.match(/CN\s*=\s*([^,\/]+)/i)?.[1]?.trim()) || 'certificate';

    if (config.isCA) {
      logger.debug(`Creating CA certificate: ${config.subject || config.name}`, null, FILENAME, instance);
      // CA defaults
      config.keySize = config.keySize || 4096;
      config.days = config.days || 3650;
    } else {
      logger.debug(`Creating certificate: ${config.subject || config.name}`, null, FILENAME, instance);
      // Regular cert defaults
      config.keySize = config.keySize || 2048;
      config.days = config.days || 365;
    }

    logger.fine(`Certificate config: certPath=${config.certPath}, keyPath=${config.keyPath}, days=${config.days}, keySize=${config.keySize}`, null, FILENAME, instance);

    try {
      // Extract certificate name from config or subject
      const certName = config.name || (config.subject?.match(/CN\s*=\s*([^,\/]+)/i)?.[1]?.trim()) || 'certificate';

      // Create temporary paths for certificate files
      const tempPaths = await this.createTempCertPaths(certName, {
        crtExt: path.extname(config.certPath) || '.crt',
        keyExt: path.extname(config.keyPath) || '.key'
      });

      logger.debug(`Using temporary paths for initial certificate creation`, null, FILENAME, instance);

      // Register temp files with renewal service
      this.registerFilesWithRenewalService([
        tempPaths.certPath,
        tempPaths.keyPath,
        tempPaths.csrPath
      ], null, instance);

      // Generate a new private key if one doesn't exist
      if (!config.keyPath || !fs.existsSync(config.keyPath)) {
        logger.info(`Key file doesn't exist, generating new private key`, null, FILENAME, instance);
        await this.generatePrivateKey(tempPaths.keyPath, {
          bits: config.keySize,
          encrypt: !!config.passphrase,
          passphrase: config.passphrase || '',
          certName: instance
        });
      } else {
        logger.fine(`Using existing key file: ${config.keyPath}`, null, FILENAME, instance);
        // Copy the existing key to temp location
        await fsPromises.copyFile(config.keyPath, tempPaths.keyPath);
        logger.fine(`Copied existing key to temp location: ${tempPaths.keyPath}`, null, FILENAME, instance);
      }

      // Generate OpenSSL config file
      const configPath = await this._generateOpenSSLConfig(config, instance);
      this.registerFilesWithRenewalService(configPath, null, instance);

      // Create the certificate (self-signed or signed by CA)
      if (config.signingCA) {
        // Generate a CSR and sign with CA
        logger.debug(`Creating Certificate Signing Request (CSR)`, null, FILENAME, instance);
        await this._createCSR(tempPaths, config, configPath, instance);
        await this._signWithCA(tempPaths, config, configPath, instance);
      } else {
        // Create self-signed certificate
        await this._createSelfSignedCert(tempPaths, config, configPath, instance);
      }

      // Copy final files to destination
      logger.debug(`Copying final certificate files to destinations`, null, FILENAME, instance);
      await fsPromises.mkdir(path.dirname(config.certPath), { recursive: true });
      await fsPromises.copyFile(tempPaths.certPath, config.certPath);

      logger.debug(`Certificate saved to: ${config.certPath}`, null, FILENAME, instance);

      if (!config.keyPath || !fs.existsSync(config.keyPath)) {
        await fsPromises.mkdir(path.dirname(config.keyPath), { recursive: true });
        await fsPromises.copyFile(tempPaths.keyPath, config.keyPath);
        logger.debug(`Key saved to: ${config.keyPath}`, null, FILENAME, instance);
      }

      // Clean up temp files
      logger.finest(`Cleaning up temporary files`, null, FILENAME, instance);
      await this._deleteTempFile(configPath, instance);
      // Attempt to delete temp dir recursively
      try {
        await fsPromises.rm(tempPaths.tempDir, { recursive: true, force: true });
        logger.finest(`Removed temporary directory: ${tempPaths.tempDir}`, null, FILENAME, instance);
      } catch (error) {
        logger.warn(`Failed to remove temp directory ${tempPaths.tempDir}: ${error.message}`, null, FILENAME, instance);
      }

      // Get certificate information
      const certInfo = await this.getCertificateInfo(config.certPath, instance);

      logger.info(`Certificate created successfully: ${path.basename(config.certPath)}`, null, FILENAME, instance);

      return {
        success: true,
        certPath: config.certPath,
        keyPath: config.keyPath,
        fingerprint: certInfo.fingerprint,
        subject: certInfo.subject,
        issuer: certInfo.issuer,
        validFrom: certInfo.validFrom,
        validTo: certInfo.validTo,
        isCA: certInfo.isCA,
        certInfo
      };
    } catch (error) {
      logger.error(`Failed to create certificate with subject ${config.subject || 'unknown'}`, error, FILENAME, instance);
      throw error;
    }
  }

  /**
   * Create a CA certificate
   * @param {Object} config - CA certificate configuration
   * @returns {Promise<Object>} Result information
   */
  async createCA(config) {
    const instance = config.name || 'CA';
    logger.debug(`Creating CA certificate: ${config.subject || config.name}`, null, FILENAME, instance);

    return await this.createCertificate({
      ...config,
      isCA: true,
      days: config.days || 3650,  // Default CA validity: 10 years
      keySize: config.keySize || 4096  // Default CA key size: 4096 bits
    });
  }

  /**
   * Renew a certificate, preserving its existing formats
   * @param {Certificate} certificate - Certificate object to renew
   * @param {Object} options - Renewal options
   * @returns {Promise<Object>} Result of renewal operation
   */
  async renewCertificate(certificate, options = {}) {
    if (!certificate) {
      throw new Error('Invalid certificate');
    }

    const instance = certificate.name || 'certificate';
    logger.info(`Renewing certificate: ${instance}`, null, FILENAME, instance);

    try {
      // Validate certificate paths - Check for both legacy and current path structure
      const crtPath = certificate.paths?.crtPath || certificate.paths?.crt;
      const keyPath = certificate.paths?.keyPath || certificate.paths?.key;
      
      if (!certificate.paths || !crtPath || !keyPath) {
        logger.error(`Invalid certificate paths for ${instance}`, null, FILENAME, instance);
        throw new Error(`Certificate ${instance} has invalid paths configuration. Ensure both certificate and key paths are defined.`);
      }

      // Track existing formats before renewal
      const previousFormats = await this.trackCertificateFormats(certificate);
      logger.debug(`Tracked ${previousFormats.formats?.length || 0} formats before renewal: ${previousFormats.formats?.join(', ') || 'none'}`, null, FILENAME, instance);

      // Create directories if they don't exist
      const certDir = path.dirname(crtPath);
      if (!fs.existsSync(certDir)) {
        logger.fine(`Creating certificate directory: ${certDir}`, null, FILENAME, instance);
        await fsPromises.mkdir(certDir, { recursive: true });
      }

      // Properly prepare the signingCA configuration if provided
      let signingCA = null;
      if (options.signingCA) {
        // Ensure we have valid paths in the signingCA object
        signingCA = {
          ...options.signingCA,
          // Ensure we have both path variations for compatibility
          certPath: options.signingCA.crtPath || options.signingCA.certPath,
          crtPath: options.signingCA.crtPath || options.signingCA.certPath,
          passphrase: options.signingCA.passphrase
        };

        // Log detailed debug info about the signingCA
        logger.debug(`Using signing CA with cert path: ${signingCA.certPath}, key path: ${signingCA.keyPath}`, null, FILENAME, instance);
      } else {
        logger.debug(`No signing CA provided, will create self-signed certificate`, null, FILENAME, instance);
      }

      // Prepare config for certificate creation
      const certConfig = {
        certPath: crtPath,
        keyPath: keyPath,
        subject: certificate.subject || `CN=${certificate.name}`,
        sans: certificate._sans || {
          domains: certificate.domains || [],
          ips: certificate.ips || []
        },
        days: options.days || 365,
        keySize: certificate.keySize || 2048,
        isCA: certificate.isCA || false,
        pathLengthConstraint: certificate.pathLengthConstraint,
        passphrase: options.passphrase,
        signingCA: signingCA,
        name: certificate.name,  // For better temp file naming
        includeIdle: options.includeIdle // Include idle domains/IPs if requested
      };

      // Create the new certificate
      const result = await this.createCertificate(certConfig);

      if (!result || !result.success) {
        const errorMsg = result?.error || 'Unknown error during certificate creation';
        logger.error(`Failed to renew certificate: ${errorMsg}`, null, FILENAME, instance);
        return { success: false, error: errorMsg };
      }

      logger.info(`Certificate ${certificate.name} successfully renewed`, null, FILENAME, instance);

      // Restore previous formats if requested
      if (options.preserveFormats !== false && previousFormats.formats && previousFormats.formats.length > 0) {
        logger.info(`Restoring ${previousFormats.formats.length} previous formats`, null, FILENAME, instance);
        const formatResult = await this.restoreCertificateFormats(certificate, previousFormats);

        return {
          ...result,
          formatRestoration: formatResult
        };
      }

      return result;
    } catch (error) {
      logger.error(`Error renewing certificate: ${error.message}`, error, FILENAME, instance);
      throw error;
    }
  }
}

module.exports = OpenSSLWrapper;