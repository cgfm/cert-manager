/**
 * Certificate Service
 * 
 * This service provides high-level operations for certificate management.
 * It uses the certificate parsing functionality from certificate-api.js
 * for low-level certificate operations.
 */

const fs = require('fs');
const path = require('path');
const certificateApi = require('../routes/certificate-api');
const parseCertificates = certificateApi.parseCertificates;
const processCertificate = certificateApi.processCertificate;
const logger = require('./logger');

class CertificateService {
    constructor(certsDir, configManager) {
        this.certsDir = certsDir;
        this.configManager = configManager;
        logger.info(`CertificateService initialized with certificates directory: ${certsDir}`);
    }

    /**
     * Get all certificates, optionally with their configurations
     * @param {boolean} includeConfig - Whether to include configuration data
     * @returns {Array} - Array of certificate objects
     */
    async getAllCertificates(includeConfig = false) {
        try {
            const certData = await parseCertificates(this.certsDir);
            
            // Process certificates to ensure they have all required properties
            const processedCerts = certData.certificates
                .filter(cert => cert !== null) // Remove null entries
                .map(cert => {
                    // Ensure all required properties exist
                    return {
                        ...cert,
                        name: cert.name || 'Unnamed Certificate',
                        domains: Array.isArray(cert.domains) ? cert.domains : [],
                        subject: cert.subject || 'Unknown Subject',
                        issuer: cert.issuer || 'Unknown Issuer',
                        validFrom: cert.validFrom || null,
                        validTo: cert.validTo || null,
                        certType: cert.certType || 'standard',
                        fingerprint: cert.fingerprint || ''
                    };
                });
            
            if (!includeConfig) {
                return processedCerts;
            }
            
            // Merge with configurations
            return processedCerts.map(cert => {
                const config = this.configManager.getCertConfig(cert.fingerprint) || {};
                return { ...cert, config };
            });
        } catch (error) {
            logger.error('Error getting all certificates:', error);
            return []; // Return empty array instead of throwing
        }
    }

    /**
     * Extract certificate dates using OpenSSL
     * @param {string} certPath - Path to the certificate file
     * @returns {Object} Object with validFrom and validTo dates
     */
    extractCertificateDates(certPath) {
        try {
            const { execSync } = require('child_process');
            const notBeforeCmd = `openssl x509 -in "${certPath}" -noout -startdate | cut -d= -f2`;
            const notAfterCmd = `openssl x509 -in "${certPath}" -noout -enddate | cut -d= -f2`;
            
            const notBefore = execSync(notBeforeCmd, { encoding: 'utf8' }).trim();
            const notAfter = execSync(notAfterCmd, { encoding: 'utf8' }).trim();
            
            return {
                validFrom: notBefore,
                validTo: notAfter
            };
        } catch (error) {
            logger.error(`Failed to extract dates for certificate at ${certPath}:`, error);
            return { validFrom: null, validTo: null };
        }
    }

    /**
     * Get certificate hierarchy
     * @returns {Object} - Object with certificates and hierarchy
     */
    async getCertificateHierarchy() {
        try {
            const certData = await parseCertificates(this.certsDir);
            return certData;
        } catch (error) {
            logger.error('Error getting certificate hierarchy:', error);
            throw error;
        }
    }

    /**
     * Get a certificate by its fingerprint
     * @param {string} fingerprint - Certificate fingerprint
     * @param {boolean} includeConfig - Whether to include configuration data
     * @returns {Object|null} - Certificate object or null if not found
     */
    async getCertificate(fingerprint, includeConfig = false) {
        try {
            if (!fingerprint) {
                logger.error('No fingerprint provided to getCertificate');
                return null;
            }
            
            // Normalize fingerprint by removing prefix if present
            const normalizedFingerprint = fingerprint.replace(/^sha256\s+Fingerprint=\s*/i, '');
            
            const certData = await parseCertificates(this.certsDir);
            
            const cert = certData.certificates.find(c => {
                // Try exact match first
                if (c.fingerprint === fingerprint) return true;
                
                // Then try normalized version
                const normalizedCertFingerprint = c.fingerprint.replace(/^sha256\s+Fingerprint=\s*/i, '');
                return normalizedCertFingerprint === normalizedFingerprint;
            });
            
            if (!cert) {
                logger.warn(`Certificate not found with fingerprint: ${fingerprint}`);
                return null;
            }
            
            // Add configuration data if requested
            if (includeConfig) {
                const config = this.configManager.getCertConfig(cert.fingerprint) || {};
                
                // If there are domains in the config but not in the cert, add them
                if (config.domains && Array.isArray(config.domains)) {
                    const allDomains = Array.from(new Set([
                        ...(cert.domains || []),
                        ...config.domains
                    ]));
                    cert.domains = allDomains;
                }
                
                return { ...cert, config };
            }
            
            return cert;
        } catch (error) {
            logger.error(`Error getting certificate ${fingerprint}:`, error);
            throw error;
        }
    }

    /**
     * Update a certificate's key path
     * @param {string} fingerprint - Certificate fingerprint
     * @param {string} keyPath - New key path
     * @returns {Object} - Result object with success status
     */
    async updateKeyPath(fingerprint, keyPath) {
        try {
            if (!fingerprint || !keyPath) {
                return { 
                    success: false, 
                    error: 'Both fingerprint and keyPath are required' 
                };
            }
            
            // Check if key file exists
            if (!fs.existsSync(keyPath)) {
                return { 
                    success: false, 
                    error: 'Key file not found at specified path' 
                };
            }
            
            // Get the certificate
            const cert = await this.getCertificate(fingerprint);
            if (!cert) {
                return { 
                    success: false, 
                    error: 'Certificate not found' 
                };
            }
            
            // Update key path directly in the certificate JSON info file
            const certDir = path.dirname(cert.path);
            const infoPath = path.join(certDir, 'cert-info.json');
            
            let certInfo = {};
            
            if (fs.existsSync(infoPath)) {
                try {
                    // Load existing cert info
                    const infoContent = fs.readFileSync(infoPath, 'utf8');
                    certInfo = JSON.parse(infoContent);
                } catch (err) {
                    logger.warn(`Error reading cert-info.json for ${cert.name}:`, err);
                }
            }
            
            // Update the key path
            certInfo.keyPath = keyPath;
            
            // Save updated cert info
            fs.writeFileSync(infoPath, JSON.stringify(certInfo, null, 2));
            
            logger.info(`Updated key path for certificate ${cert.name} to ${keyPath}`);
            
            return { success: true };
        } catch (error) {
            logger.error(`Error updating key path for certificate ${fingerprint}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Backup a certificate and its key
     * @param {Object} cert - Certificate object
     * @returns {boolean} Success status
     */
    async backupCertificate(cert) {
        try {
            if (!cert.path) {
                logger.warn('Cannot backup certificate, path is missing');
                return false;
            }
            
            const timestamp = new Date().toISOString().replace(/[:\.]/g, '-').replace('T', '_').slice(0, 19);
            const backupDir = path.join(this.certsDir, 'backups', timestamp);
            
            // Create backup directory
            fs.mkdirSync(backupDir, { recursive: true });
            
            // Backup certificate
            const certBackupPath = path.join(backupDir, path.basename(cert.path));
            fs.copyFileSync(cert.path, certBackupPath);
            logger.info(`Backed up certificate to ${certBackupPath}`);
            
            // Backup key if present
            if (cert.keyPath && fs.existsSync(cert.keyPath)) {
                const keyBackupPath = path.join(backupDir, path.basename(cert.keyPath));
                fs.copyFileSync(cert.keyPath, keyBackupPath);
                logger.info(`Backed up key to ${keyBackupPath}`);
            }
            
            // Save metadata about the backup
            const metadataPath = path.join(backupDir, 'backup-info.json');
            const metadata = {
                original: {
                    name: cert.name,
                    fingerprint: cert.fingerprint,
                    path: cert.path,
                    keyPath: cert.keyPath
                },
                timestamp: new Date().toISOString(),
                reason: 'manual-deletion'
            };
            
            fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
            
            return true;
        } catch (error) {
            logger.error('Error backing up certificate:', error);
            return false;
        }
    }
    
    /**
     * Clean up old certificate backups
     */
    async cleanupOldBackups() {
        try {
            const defaults = this.configManager.getGlobalDefaults();
            const retentionDays = defaults.backupRetention || 30;
            
            const backupDir = path.join(this.certsDir, 'backups');
            
            // Check if backup directory exists
            if (!fs.existsSync(backupDir)) {
                return;
            }
            
            const now = new Date();
            const backups = fs.readdirSync(backupDir);
            
            for (const backup of backups) {
                try {
                    const backupPath = path.join(backupDir, backup);
                    const stat = fs.statSync(backupPath);
                    
                    if (!stat.isDirectory()) continue;
                    
                    // Check if backup is older than retention period
                    const backupDate = new Date(stat.mtime);
                    const ageInDays = (now - backupDate) / (1000 * 60 * 60 * 24);
                    
                    if (ageInDays > retentionDays) {
                        // Delete directory recursively
                        fs.rmSync(backupPath, { recursive: true, force: true });
                        logger.info(`Deleted old backup: ${backupPath} (${Math.floor(ageInDays)} days old)`);
                    }
                } catch (err) {
                    logger.warn(`Error processing backup ${backup}:`, err);
                }
            }
            
            logger.info('Backup cleanup completed');
        } catch (error) {
            logger.error('Error cleaning up old backups:', error);
        }
    }

    /**
     * Validate a certificate file
     * @param {string} certPath - Path to certificate file
     * @returns {boolean} - Whether the certificate is valid
     */
    async validateCertificate(certPath) {
        try {
            const { execSync } = require('child_process');
            // Try to get basic certificate info, will fail if not a valid certificate
            execSync(`openssl x509 -in "${certPath}" -noout -text`, { stdio: 'pipe' });
            return true;
        } catch (error) {
            logger.warn(`Invalid certificate file at ${certPath}: ${error.message}`);
            return false;
        }
    }

    /**
     * Check for certificates that need renewal
     * @returns {Array} - Certificates that need renewal
     */
    async checkForRenewals() {
        try {
            logger.info('Checking for certificates that need renewal');
            const certData = await parseCertificates(this.certsDir);
            const now = new Date();
            
            // Calculate the date threshold for renewal warning (30 days before expiry)
            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(now.getDate() + 30);
            
            // Filter certificates that need renewal
            const needRenewal = certData.certificates.filter(cert => {
                try {
                    // Skip CA certificates
                    if (cert.certType === 'rootCA' || cert.certType === 'intermediateCA') {
                        return false;
                    }
                    
                    // Parse the validTo date
                    if (!cert.validTo) {
                        logger.warn(`Certificate ${cert.name} is missing expiry date`);
                        return false;
                    }
                    
                    const expiryDate = new Date(cert.validTo);
                    
                    // Check if date is invalid
                    if (isNaN(expiryDate.getTime())) {
                        logger.warn(`Certificate ${cert.name} has invalid expiry date: ${cert.validTo}`);
                        return false;
                    }
                    
                    // Check if certificate expires within 30 days
                    return expiryDate <= thirtyDaysFromNow;
                } catch (error) {
                    logger.error(`Error processing certificate ${cert.name}: ${error.message}`);
                    return false;
                }
            });
            
            return needRenewal;
        } catch (error) {
            logger.error('Error checking for renewals:', error);
            throw error;
        }
    }

    /**
     * Delete a certificate by its fingerprint
     * @param {string} fingerprint - Certificate fingerprint
     * @returns {Object} Result with success status
     */
    async deleteCertificate(fingerprint) {
        try {
            if (!fingerprint) {
                return { success: false, error: 'Certificate fingerprint is required' };
            }
            
            // Get the certificate
            const cert = await this.getCertificate(fingerprint);
            if (!cert) {
                return { success: false, error: 'Certificate not found' };
            }
            
            // Backup the certificate first
            await this.backupCertificate(cert);
            
            // Delete the certificate file
            if (cert.path && fs.existsSync(cert.path)) {
                fs.unlinkSync(cert.path);
                logger.info(`Deleted certificate file: ${cert.path}`);
            }
            
            // Delete the key file if it exists
            if (cert.keyPath && fs.existsSync(cert.keyPath)) {
                fs.unlinkSync(cert.keyPath);
                logger.info(`Deleted key file: ${cert.keyPath}`);
            }
            
            // Delete any associated metadata files
            const certDir = path.dirname(cert.path);
            const infoPath = path.join(certDir, 'cert-info.json');
            if (fs.existsSync(infoPath)) {
                fs.unlinkSync(infoPath);
                logger.info(`Deleted certificate info file: ${infoPath}`);
            }
            
            logger.info(`Successfully deleted certificate: ${cert.name} (${fingerprint})`);
            return { success: true };
        } catch (error) {
            logger.error(`Error deleting certificate ${fingerprint}:`, error);
            return { success: false, error: error.message };
        }
    }
}

module.exports = CertificateService;