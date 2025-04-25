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
      logger.debug(`Executing OpenSSL command: ${cmd}`);
      const { stdout, stderr } = await execAsync(cmd);
      
      if (stderr && !stderr.includes('Loading') && !stderr.includes('writing')) {
        logger.warn(`OpenSSL warning`, stderr);
      }
      
      return stdout.trim();
    } catch (error) {
      logger.error('OpenSSL execution error', error);
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
      logger.warn(`Failed to delete temporary file ${filePath}`, error);
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
    
    try {
      // Use direct command execution instead of opensslAsync.x509
      
      // Get fingerprint
      const fingerprintRaw = await this.execute(`openssl x509 -in "${certPath}" -fingerprint -sha256 -noout`);
      
      // Clean fingerprint: Remove "SHA256 Fingerprint=" prefix and colons
      const fingerprint = fingerprintRaw
        .trim()
        .toUpperCase()
        .replace(/SHA256 FINGERPRINT=|sha256 Fingerprint=/i, '')
        .replace(/:/g, '');
      
      // Get certificate text representation
      const certText = await this.execute(`openssl x509 -in "${certPath}" -text -noout`);
      
      // Extract subject
      const subjectMatch = certText.match(/Subject:(.+?)(?=\n|$)/);
      const subject = subjectMatch ? subjectMatch[1].trim() : '';
      
      // Extract issuer
      const issuerMatch = certText.match(/Issuer:(.+?)(?=\n|$)/);
      const issuer = issuerMatch ? issuerMatch[1].trim() : '';
      
      // Extract CN
      const cnMatch = subject.match(/CN\s*=\s*([^,/]+)/i);
      const name = cnMatch ? cnMatch[1].trim() : path.basename(certPath, path.extname(certPath));
      
      // Extract validity dates
      const validFromMatch = certText.match(/Not Before\s*:\s*(.+?)(?: GMT| UTC)?(?=\n)/i);
      const validToMatch = certText.match(/Not After\s*:\s*(.+?)(?: GMT| UTC)?(?=\n)/i);
      
      const validFrom = validFromMatch ? validFromMatch[1].trim() : '';
      const validTo = validToMatch ? validToMatch[1].trim() : '';
      
      // Check if certificate is a CA
      const isCA = certText.includes('CA:TRUE');
      
      // Determine certificate type
      let certType = 'standard';
      if (isCA) {
        const selfSigned = subject === issuer;
        const pathLenConstraint = certText.includes('pathlen:');
        
        if (selfSigned && !pathLenConstraint) {
          certType = 'rootCA';
        } else {
          certType = 'intermediateCA';
        }
      }
      
      // Extract domains from SAN or CN
      const domains = [];
      
      // Check for Subject Alternative Names (SAN)
      const sanMatch = certText.match(/X509v3 Subject Alternative Name:([^]*?)(?=\n\s*[A-Za-z]|\n\n|$)/);
      if (sanMatch && sanMatch[1]) {
        const sanText = sanMatch[1].trim();
        
        // Extract DNS entries
        const dnsMatches = Array.from(sanText.matchAll(/DNS:([^,\n]+)/g));
        for (const match of dnsMatches) {
          domains.push(match[1].trim());
        }
      }
      
      // If no SAN domains and we have a CN that looks like a domain, add it
      if (domains.length === 0 && 
          cnMatch && 
          cnMatch[1].includes('.')) {
        domains.push(cnMatch[1].trim());
      }
      
      // Extract IP addresses from SAN
      const ips = [];
      if (sanMatch && sanMatch[1]) {
        const sanText = sanMatch[1].trim();
        
        // Look for IP Address entries
        const ipMatches = Array.from(sanText.matchAll(/IP(?:\s*Address)?:([^,\n]+)/g));
        for (const match of ipMatches) {
          ips.push(match[1].trim());
        }
      }
      
      return {
        fingerprint,
        name,
        subject,
        issuer,
        validFrom,
        validTo,
        certType,
        domains,
        ips,
        isCA
      };
    } catch (error) {
      logger.error(`Failed to extract certificate information for ${certPath}`, error);
      throw error;
    }
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
      logger.error(`Failed to generate private key`, error);
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
      logger.error(`Failed to create self-signed certificate for ${certificate.name}`, error);
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
      
      // Add to certificate paths
      if (!certificate.paths) {
        certificate.paths = {};
      }
      certificate.paths.p12Path = p12Path;
      
      return {
        success: true,
        p12Path,
        outputPath: p12Path
      };
    } catch (error) {
      logger.error(`Failed to convert certificate to P12 format`, error);
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
    const crtPath = certificate.paths?.crtPath;
    
    if (!crtPath || !fs.existsSync(crtPath)) {
      throw new Error('Certificate file not found');
    }
    
    const pemPath = options.outputPath || crtPath.replace(/\.(crt|der|p12|pfx|cer)$/, '.pem');
    
    try {
      // For DER format, convert to PEM
      if (path.extname(crtPath).toLowerCase() === '.der') {
        await this.execute(`openssl x509 -inform DER -in "${crtPath}" -outform PEM -out "${pemPath}"`);
      } 
      // For P12/PFX format, extract the certificate
      else if (['.p12', '.pfx'].includes(path.extname(crtPath).toLowerCase())) {
        const password = options.password || '';
        await this.execute(`openssl pkcs12 -in "${crtPath}" -out "${pemPath}" -nodes -nokeys -passin pass:"${password}"`);
      }
      // For CRT/CER/PEM just copy the file if needed
      else if (crtPath !== pemPath) {
        await fsPromises.copyFile(crtPath, pemPath);
      }
      
      // Add to certificate paths
      if (!certificate.paths) {
        certificate.paths = {};
      }
      certificate.paths.pemPath = pemPath;
      
      return {
        success: true,
        pemPath,
        outputPath: pemPath
      };
    } catch (error) {
      logger.error(`Failed to convert certificate to PEM format`, error);
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
      logger.error(`Failed to verify certificate-key pair`, error);
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
      logger.error(`Failed to convert certificate to ${format} format:`, error);
      throw error;
    }
  }
}

module.exports = OpenSSLWrapper;