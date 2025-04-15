/**
 * Certificate API Module
 * 
 * This module provides both Express API routes for certificate management
 * and core certificate parsing functionality that can be imported by other modules.
 *
 */

const express = require('express');
const router = express.Router();
const logger = require('../services/logger');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
//const RenewalManager = require(path.join(__dirname, '..', 'services', 'renewal-manager.js'));
//const ConfigManager = require(path.join(__dirname, '..', 'services', 'config-manager.js'));
const RenewalManager = require('../services/renewal-manager.js');
const ConfigManager = require('../services/config-manager.js');

// Get the certificates directory from environment or use default
const CERTS_DIR = process.env.CERTS_DIR || '/certs';
const CONFIG_DIR = process.env.CONFIG_DIR || '/config';
const CERT_INFO_PATH = path.join(CONFIG_DIR, 'cert-info.json');

// Create instances after the constants (before the router definitions)
const configManager = new ConfigManager(CONFIG_DIR);
const renewalManager = new RenewalManager(configManager, CERTS_DIR, {
    getAllCertificates: async () => {
        // This creates a simple certificate service API for RenewalManager to use
        return await getAllCertificates();
    }
});

// Check if OpenSSL is available
let openSslAvailable = false;
try {
    const result = execSync('openssl version', { encoding: 'utf8' });
    logger.info(`OpenSSL available: ${result.trim()}`);
    openSslAvailable = true;
} catch (e) {
    logger.warn('OpenSSL not available. Using fallback parsing methods.');
    openSslAvailable = false;
}

/**
 * Extract dates from certificate using OpenSSL
 * @param {string} certPath - Path to certificate file
 * @returns {Object} - Object with validFrom and validTo fields
 */
function extractDateFromCert(certPath) {
    try {
        const validFrom = execSync(`openssl x509 -in "${certPath}" -noout -startdate | cut -d= -f2`, {encoding: 'utf8'}).trim();
        const validTo = execSync(`openssl x509 -in "${certPath}" -noout -enddate | cut -d= -f2`, {encoding: 'utf8'}).trim();
        
        return { validFrom, validTo };
    } catch (error) {
        logger.error(`Error extracting dates from certificate ${certPath}: ${error.message}`);
        return { validFrom: null, validTo: null };
    }
}

/**
 * Extract full certificate details using OpenSSL
 * @param {string} certPath - Path to certificate file
 * @returns {Object} - Object with certificate details
 */
function extractCertDetails(certPath) {
    // Initialize with default values
    const details = {
        subject: 'Unknown Subject',
        issuer: 'Unknown Issuer',
        validFrom: null,
        validTo: null,
        domains: [],
        isCA: false,
        fingerprint: '',
        subjectKeyId: null,
        authorityKeyId: null
    };
    
    try {
        if (!openSslAvailable) {
            // If OpenSSL is not available, use fallback parsing
            return fallbackCertificateParser(certPath);
        }
        
        // 1. Get subject and issuer
        try {
            details.subject = execSync(`openssl x509 -in "${certPath}" -noout -subject -nameopt RFC2253`, {encoding: 'utf8'}).trim().replace('subject=', '');
        } catch (e) {
            logger.error(`Error extracting subject from ${certPath}: ${e.message}`);
        }
        
        try {
            details.issuer = execSync(`openssl x509 -in "${certPath}" -noout -issuer -nameopt RFC2253`, {encoding: 'utf8'}).trim().replace('issuer=', '');
        } catch (e) {
            logger.error(`Error extracting issuer from ${certPath}: ${e.message}`);
        }
        
        // 2. Get validity dates
        try {
            const dateResult = extractDateFromCert(certPath);
            details.validFrom = dateResult.validFrom;
            details.validTo = dateResult.validTo;
        } catch (e) {
            logger.error(`Error extracting dates from ${certPath}: ${e.message}`);
        }
        
        // 3. Get domains from Subject Alternative Name
        try {
            const sanOutput = execSync(`openssl x509 -in "${certPath}" -noout -ext subjectAltName 2>/dev/null || echo "No SAN found"`, {encoding: 'utf8'}).trim();
            if (sanOutput !== "No SAN found") {
                // Extract DNS entries
                const dnsMatches = sanOutput.match(/DNS:[^,\s]+/g);
                if (dnsMatches) {
                    dnsMatches.forEach(match => {
                        details.domains.push(match.replace('DNS:', '').trim());
                    });
                }
                
                // Extract IP entries
                const ipMatches = sanOutput.match(/IP Address:[^,\s]+/g) || sanOutput.match(/IP:[^,\s]+/g);
                if (ipMatches) {
                    ipMatches.forEach(match => {
                        // Handle different IP formats
                        const ip = match.includes(':') ? 
                            match.replace(/IP Address:|IP:/, '').trim() : 
                            match;
                        details.domains.push(ip);
                    });
                }
            }
            
            // If no SAN, try to get CN from subject
            if (details.domains.length === 0) {
                const cnMatch = details.subject.match(/CN=([^,]+)/);
                if (cnMatch) {
                    details.domains.push(cnMatch[1].trim());
                }
            }
        } catch (e) {
            logger.error(`Error extracting domains from ${certPath}: ${e.message}`);
        }
        
        // 4. Check if certificate is a CA
        try {
            const basicConstraints = execSync(`openssl x509 -in "${certPath}" -noout -text | grep "CA:" || echo "CA:FALSE"`, {encoding: 'utf8'}).trim();
            details.isCA = basicConstraints.includes('CA:TRUE');
        } catch (e) {
            logger.error(`Error checking CA status for ${certPath}: ${e.message}`);
        }
        
        // 5. Get fingerprint
        try {
            details.fingerprint = execSync(`openssl x509 -in "${certPath}" -noout -fingerprint -sha256`, {encoding: 'utf8'})
                .trim()
                .replace('SHA256 Fingerprint=', '')
                .replace(/:/g, '');
        } catch (e) {
            logger.error(`Error extracting fingerprint from ${certPath}: ${e.message}`);
            // Generate a unique error fingerprint
            details.fingerprint = `error-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        }
        
        // 6. Get key identifiers
        try {
            const textOutput = execSync(`openssl x509 -in "${certPath}" -noout -text`, {encoding: 'utf8'});
            
            // Extract Subject Key Identifier
            const skidMatch = textOutput.match(/Subject Key Identifier[:\s]+([\da-fA-F:]+)/);
            if (skidMatch) {
                details.subjectKeyId = skidMatch[1].replace(/:/g, '');
            }
            
            // Extract Authority Key Identifier
            const akidMatch = textOutput.match(/Authority Key Identifier[:\s]+keyid:([\da-fA-F:]+)/);
            if (akidMatch) {
                details.authorityKeyId = akidMatch[1].replace(/:/g, '');
            }
        } catch (e) {
            logger.error(`Error extracting key identifiers from ${certPath}: ${e.message}`);
        }
        
        return details;
    } catch (error) {
        logger.error(`Fatal error extracting certificate details from ${certPath}: ${error.message}`);
        return {
            subject: 'Error Processing Certificate',
            issuer: 'Unknown Issuer',
            validFrom: null,
            validTo: null,
            domains: [],
            isCA: false,
            fingerprint: `error-${Date.now()}`,
            subjectKeyId: null,
            authorityKeyId: null,
            error: error.message
        };
    }
}

/**
 * Fallback certificate parser that doesn't use OpenSSL
 * @param {string} certPath - Path to certificate file
 * @returns {Object} - Certificate details
 */
function fallbackCertificateParser(certPath) {
    const details = {
        subject: 'Unknown Subject',
        issuer: 'Unknown Issuer',
        validFrom: null,
        validTo: null,
        domains: [],
        isCA: false,
        fingerprint: '',
        subjectKeyId: null,
        authorityKeyId: null
    };
    
    try {
        // Read the file content
        const certData = fs.readFileSync(certPath, 'utf8');
        
        // Basic parsing of PEM data
        if (certData.includes('-----BEGIN CERTIFICATE-----')) {
            // Generate a hash of the file content for the fingerprint
            const hash = crypto.createHash('sha256');
            hash.update(certData);
            details.fingerprint = hash.digest('hex');
            
            // Set basic info for display
            details.subject = `CN=${path.basename(certPath, path.extname(certPath))}`;
            
            // Extract dates - just use current date plus/minus a year as fallback
            const now = new Date();
            const oneYearAgo = new Date(now);
            oneYearAgo.setFullYear(now.getFullYear() - 1);
            
            const oneYearLater = new Date(now);
            oneYearLater.setFullYear(now.getFullYear() + 1);
            
            details.validFrom = oneYearAgo.toISOString();
            details.validTo = oneYearLater.toISOString();
            
            // Try to extract domain from filename
            const domain = path.basename(certPath, path.extname(certPath));
            if (domain && domain !== 'certificate' && domain !== 'cert') {
                details.domains.push(domain);
            }
        }
        
        return details;
    } catch (error) {
        logger.error(`Error in fallback certificate parser for ${certPath}:`, error);
        return details;
    }
}

/**
 * Process a single certificate file
 * @param {string} certPath - Path to the certificate file
 * @param {string} certsDirectory - Directory containing certificates
 * @returns {Object|null} - Certificate object or null if processing failed
 */
function processCertificate(certPath, certsDirectory) {
    try {
        // Check if file exists
        if (!fs.existsSync(certPath)) {
            logger.error(`Certificate file does not exist: ${certPath}`);
            return null;
        }
        
        // Get file name for display
        const fileName = path.basename(certPath);
        
        // Extract all certificate details using OpenSSL instead of parsing PEM directly
        const details = extractCertDetails(certPath);
        
        // Determine certificate type
        let certType = 'standard';
        if (details.isCA) {
            if (details.subject === details.issuer) {
                certType = 'rootCA';
            } else {
                certType = 'intermediateCA';
            }
        }
        
        // Check if there's a key file with the same name but .key extension
        let keyPath = null;
        const possibleKeyPath = certPath.replace(/\.(crt|pem)$/, '.key');
        if (fs.existsSync(possibleKeyPath)) {
            keyPath = possibleKeyPath;
        }
        
        // Check if there's a certificate info JSON file
        let configData = {};
        try {
            const infoPath = CERT_INFO_PATH;
            if (fs.existsSync(infoPath)) {
                const infoContent = fs.readFileSync(infoPath, 'utf8');
                configData = JSON.parse(infoContent);
            }
        } catch (e) {
            logger.warn(`Error loading cert-info.json for ${fileName}: ${e.message}`);
        }
        
        // Return the unified certificate object
        return {
            name: fileName.replace(/\.(crt|pem)$/, ''),
            path: certPath,
            keyPath: keyPath || configData.keyPath || null,
            domains: details.domains,
            subject: details.subject,
            issuer: details.issuer,
            validFrom: details.validFrom,
            validTo: details.validTo,
            certType,
            fingerprint: details.fingerprint,
            subjectKeyId: details.subjectKeyId,
            authorityKeyId: details.authorityKeyId,
            config: configData,
            // Optional additional properties from configData
            autoRenew: configData.autoRenew || false,
            renewDaysBeforeExpiry: configData.renewDaysBeforeExpiry || 30
        };
    } catch (error) {
        logger.error(`Critical error processing certificate ${certPath}: ${error.message}`);
        // Return a minimal valid certificate object to prevent further errors
        return {
            name: path.basename(certPath).replace(/\.(crt|pem)$/, ''),
            path: certPath,
            domains: [],
            subject: 'Error Processing Certificate',
            issuer: 'Unknown Issuer',
            validFrom: null,
            validTo: null,
            certType: 'unknown',
            fingerprint: `error-${Date.now()}`,
            subjectKeyId: null,
            authorityKeyId: null,
            error: error.message
        };
    }
}

/**
 * Parse certificates from a directory
 * @param {string} certsDirectory - Directory containing certificates
 * @returns {Object} - Object with certificates and hierarchy
 */
function parseCertificates(certsDirectory) {
    try {
        const certificates = [];
        const certMap = new Map(); // Map to store certificates by their subject key identifier
        const caMap = new Map();   // Map to store CAs by their subject key identifier
        const processedCerts = new Set(); // Track processed certificates to avoid duplicates
        
        // Ensure the directory exists
        if (!fs.existsSync(certsDirectory)) {
            logger.warn(`Certificates directory does not exist: ${certsDirectory}`);
            return { certificates: [], hierarchy: [] };
        }
        
        // Read all files in the directory
        fs.readdirSync(certsDirectory).forEach(file => {
            try {
                if (file.endsWith('.crt') || file.endsWith('.pem')) {
                    const certPath = path.join(certsDirectory, file);
                    
                    // Skip if already processed
                    if (processedCerts.has(certPath)) {
                        return;
                    }
                    processedCerts.add(certPath);
                    
                    // Process the certificate
                    const certificate = processCertificate(certPath, certsDirectory);
                    
                    if (certificate) {
                        certificates.push(certificate);
                        
                        // Add to appropriate maps
                        if (certificate.subjectKeyId) {
                            certMap.set(certificate.subjectKeyId, certificate);
                            
                            if (certificate.certType === 'rootCA' || certificate.certType === 'intermediateCA') {
                                caMap.set(certificate.subjectKeyId, certificate);
                            }
                        }
                    }
                }
            } catch (certError) {
                logger.error(`Error processing certificate ${file}: ${certError.message}`);
            }
        });
        
        // Build certificate chains and hierarchy
        const hierarchy = buildCertificateHierarchy(certificates, caMap);
        
        return {
            certificates, // All certificates as a flat array
            hierarchy     // Certificate hierarchy
        };
    } catch (error) {
        logger.error(`Error parsing certificates: ${error.message}`);
        return { certificates: [], hierarchy: [] };
    }
}

/**
 * Build certificate hierarchy based on issuer relationships
 * @param {Array} certificates - Array of certificate objects
 * @param {Map} caMap - Map of CA certificates by subject key ID
 * @returns {Array} - Array representing certificate hierarchy
 */
function buildCertificateHierarchy(certificates, caMap) {
    try {
        const rootCAs = [];
        const intermediate = [];
        const endEntity = [];
        
        // First pass: Categorize certificates
        certificates.forEach(cert => {
            if (cert.certType === 'rootCA') {
                rootCAs.push({ ...cert, children: [] });
            } else if (cert.certType === 'intermediateCA') {
                intermediate.push({ ...cert, children: [] });
            } else {
                endEntity.push({ ...cert, children: [] });
            }
        });
        
        // Second pass: Build intermediate CA chains under root CAs
        intermediate.forEach(intermediateCert => {
            // Find parent CA
            if (intermediateCert.authorityKeyId) {
                const parentCA = [...rootCAs, ...intermediate].find(
                    ca => ca.subjectKeyId === intermediateCert.authorityKeyId
                );
                
                if (parentCA) {
                    parentCA.children.push(intermediateCert);
                } else {
                    rootCAs.push(intermediateCert); // Treat as root if parent not found
                }
            } else {
                rootCAs.push(intermediateCert); // Treat as root if no authority key ID
            }
        });
        
        // Third pass: Attach end entities to their issuing CAs
        endEntity.forEach(cert => {
            if (cert.authorityKeyId) {
                const issuerCA = [...rootCAs, ...intermediate].find(
                    ca => ca.subjectKeyId === cert.authorityKeyId
                );
                
                if (issuerCA) {
                    issuerCA.children.push(cert);
                } else {
                    // If no issuer found, attach to "Unattached" category
                    // Create or find the "Unattached" category
                    let unattached = rootCAs.find(ca => ca.name === "Unattached");
                    if (!unattached) {
                        unattached = {
                            name: "Unattached",
                            certType: "virtual",
                            children: []
                        };
                        rootCAs.push(unattached);
                    }
                    unattached.children.push(cert);
                }
            } else {
                // If no authority key ID, add to "Unattached" category
                let unattached = rootCAs.find(ca => ca.name === "Unattached");
                if (!unattached) {
                    unattached = {
                        name: "Unattached",
                        certType: "virtual",
                        children: []
                    };
                    rootCAs.push(unattached);
                }
                unattached.children.push(cert);
            }
        });
        
        return rootCAs;
    } catch (error) {
        logger.error(`Error building certificate hierarchy: ${error.message}`);
        return [];
    }
}

function fetchCertificates() {
    console.log('Fetching certificates...');
    
    // Show loading indicator
    const certificatesContainer = document.querySelector('#certificates-container') || 
                                 document.querySelector('.certificates-container');
    
    if (certificatesContainer) {
        certificatesContainer.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading certificates...</div>';
    }
    
    // Create an AbortController to handle timeouts
    const controller = new AbortController();
    const signal = controller.signal;
    
    // Set a timeout to abort the fetch after 10 seconds
    const timeout = setTimeout(() => {
        controller.abort();
    }, 10000);
    
    // Fetch certificates from API with timeout protection
    fetch('/api/certificate', { signal })
        .then(response => {
            clearTimeout(timeout);
            
            if (!response.ok) {
                throw new Error(`Server returned status: ${response.status}`);
            }
            
            return response.json();
        })
        .then(data => {
            // Get current view mode
            const viewMode = document.querySelector('input[name="view-mode"]:checked')?.value || 'flat';
            
            // Render based on view mode
            if (viewMode === 'hierarchy') {
                renderCertificatesHierarchy(data);
            } else {
                renderCertificates(data);
            }
            
            initCertificateActionListeners();
            
            // Update certificate count if it exists in UI
            if (Array.isArray(data)) {
                updateCertificateCount(data.length);
            }
        })
        .catch(error => {
            clearTimeout(timeout);
            console.error('Error fetching certificates:', error);
            
            if (certificatesContainer) {
                if (error.name === 'AbortError') {
                    certificatesContainer.innerHTML = `
                        <div class="error">
                            <i class="fas fa-exclamation-triangle"></i>
                            Request timed out. The server might be busy processing certificates.
                            <button onclick="fetchCertificates()" class="retry-btn">
                                <i class="fas fa-sync"></i> Try Again
                            </button>
                        </div>
                    `;
                } else {
                    certificatesContainer.innerHTML = `
                        <div class="error">
                            <i class="fas fa-exclamation-triangle"></i>
                            Error loading certificates: ${error.message}
                            <button onclick="fetchCertificates()" class="retry-btn">
                                <i class="fas fa-sync"></i> Try Again
                            </button>
                        </div>
                    `;
                }
            }
            
            // Try to show a notification if utilities are available
            if (window.uiUtils && typeof window.uiUtils.showNotification === 'function') {
                window.uiUtils.showNotification(
                    `Failed to load certificates: ${error.message}`, 
                    'error'
                );
            }
        });
}

/**
 * Enhanced certificate parser that extracts more information
 * @param {string} certPath - Path to certificate
 * @returns {Object} - Certificate information
 */
function parseCertificateFile(certPath) {
    return processCertificate(certPath, path.dirname(certPath));
}

// GET /api/certificate - Get all certificates
router.get('/', async (req, res) => {
    try {
        logger.info('GET /api/certificate - Retrieving all certificates');
        
        // Read certificates from directory
        const certificates = [];
        
        // Make sure CERTS_DIR exists
        if (!fs.existsSync(CERTS_DIR)) {
            logger.warn(`Certificates directory does not exist: ${CERTS_DIR}`);
            return res.json([]);
        }
        
        // Get certificate files
        const certFiles = fs.readdirSync(CERTS_DIR)
            .filter(file => file.endsWith('.crt') || file.endsWith('.pem'));
        
        logger.info(`Found ${certFiles.length} certificate files`);
        
        // Load cert-info.json for additional metadata
        const infoPath = path.join(CONFIG_DIR, 'cert-info.json');
        let certInfo = {};
        
        try {
            if (fs.existsSync(infoPath)) {
                const fileContent = fs.readFileSync(infoPath, 'utf8');
                certInfo = JSON.parse(fileContent);
                logger.info(`Loaded cert-info.json with ${Object.keys(certInfo).length} entries`);
            } else {
                logger.info(`cert-info.json doesn't exist at ${infoPath}`);
            }
        } catch (e) {
            logger.warn(`Error loading cert-info.json: ${e.message}`);
        }
        
        // Process each certificate file
        for (const file of certFiles) {
            try {
                const certPath = path.join(CERTS_DIR, file);
                const cert = parseCertificateFile(certPath);
                
                // Enhance with data from cert-info.json if available
                if (cert.fingerprint && certInfo[cert.fingerprint]) {
                    const config = certInfo[cert.fingerprint];
                    
                    // Use domains from config if available
                    if (config.domains && Array.isArray(config.domains)) {
                        logger.debug(`Using domains from cert-info.json for ${cert.fingerprint}`);
                        cert.domains = config.domains;
                    }
                    
                    // Add other config properties
                    cert.autoRenew = config.autoRenew;
                    cert.renewDaysBeforeExpiry = config.renewDaysBeforeExpiry;
                    cert.deployActions = config.deployActions;
                    cert.lastUpdated = config.lastUpdated;
                }
                
                certificates.push(cert);
            } catch (error) {
                logger.error(`Error processing certificate ${file}: ${error.message}`);
            }
        }
        
        logger.info(`Returning ${certificates.length} certificates`);
        res.json(certificates);
    } catch (error) {
        logger.error(`Error retrieving certificates: ${error.message}`);
        res.status(500).json({
            error: 'Failed to retrieve certificates',
            message: error.message
        });
    }
});

// GET /api/certificate/:fingerprint - Get certificate by fingerprint
router.get('/:fingerprint', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        
        // Clean up the fingerprint (remove 'sha256 Fingerprint=' prefix if present)
        const cleanFingerprint = fingerprint.replace(/^sha256\s+Fingerprint=\s*/i, '');
        
        // Get all certificates
        const certs = await getAllCertificates();
        
        // Find the matching certificate
        const cert = certs.find(c => {
            const certFingerprint = c.fingerprint.replace(/^sha256\s+Fingerprint=\s*/i, '');
            return certFingerprint === cleanFingerprint;
        });
        
        if (!cert) {
            return res.status(404).json({ error: 'Certificate not found' });
        }
        
        // Return the certificate with any extended properties from cert-info.json
        res.json(cert);
        
    } catch (error) {
        logger.error(`Error retrieving certificate ${req.params.fingerprint}: ${error.message}`);
        res.status(500).json({ error: 'Failed to retrieve certificate', message: error.message });
    }
});

// POST /api/certificate - Upload a new certificate
router.post('/', async (req, res) => {
    try {
        logger.info('POST /api/certificate - Uploading new certificate');
        
        // Check if the certificate data is provided
        if (!req.body.certificate) {
            return res.status(400).json({ error: 'Certificate data is required' });
        }
        
        // Create certificates directory if it doesn't exist
        if (!fs.existsSync(CERTS_DIR)) {
            fs.mkdirSync(CERTS_DIR, { recursive: true });
        }
        
        // Generate a filename (either use provided name or generate one)
        const certificateName = req.body.name || `cert-${Date.now()}`;
        const certPath = path.join(CERTS_DIR, `${certificateName}.crt`);
        
        // Write certificate to file
        fs.writeFileSync(certPath, req.body.certificate);
        logger.info(`Certificate saved to ${certPath}`);
        
        // Write key to file if provided
        let keyPath = null;
        if (req.body.key) {
            keyPath = path.join(CERTS_DIR, `${certificateName}.key`);
            fs.writeFileSync(keyPath, req.body.key);
            logger.info(`Key saved to ${keyPath}`);
        }
        
        // Parse the newly created certificate
        const certificate = parseCertificateFile(certPath);
        
        res.status(201).json(certificate);
    } catch (error) {
        logger.error('Error uploading certificate:', error);
        res.status(500).json({ error: 'Failed to upload certificate', message: error.message });
    }
});

// DELETE /api/certificate/:fingerprint - Delete a certificate
router.delete('/:fingerprint', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        logger.info(`DELETE /api/certificate/${fingerprint} - Deleting certificate`);
        
        // Check if certificates directory exists
        if (!fs.existsSync(CERTS_DIR)) {
            return res.status(404).json({ error: 'Certificates directory not found' });
        }
        
        // Find the certificate with the given fingerprint
        const certFiles = fs.readdirSync(CERTS_DIR)
            .filter(file => file.endsWith('.crt') || file.endsWith('.pem'));
        
        let certificateFound = false;
        let deletedFiles = [];
        
        for (const file of certFiles) {
            const certPath = path.join(CERTS_DIR, file);
            const cert = parseCertificateFile(certPath);
            
            if (cert.fingerprint === fingerprint) {
                // Delete certificate file
                fs.unlinkSync(certPath);
                deletedFiles.push(certPath);
                
                // Delete associated key file if it exists
                if (cert.keyPath && fs.existsSync(cert.keyPath)) {
                    fs.unlinkSync(cert.keyPath);
                    deletedFiles.push(cert.keyPath);
                }
                
                certificateFound = true;
                break;
            }
        }
        
        if (!certificateFound) {
            return res.status(404).json({ error: 'Certificate not found' });
        }
        
        res.json({ 
            success: true, 
            message: 'Certificate deleted successfully', 
            deletedFiles 
        });
    } catch (error) {
        logger.error(`Error deleting certificate ${req.params.fingerprint}:`, error);
        res.status(500).json({ error: 'Failed to delete certificate', message: error.message });
    }
});

// GET /api/certificate/debug/file/:filename - Debug certificate file
router.get('/debug/file/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const sanitizedFilename = path.basename(filename); // Prevent directory traversal
        const certPath = path.join(CERTS_DIR, sanitizedFilename);
        
        if (!fs.existsSync(certPath)) {
            return res.status(404).json({ error: 'Certificate file not found' });
        }
        
        const debugInfo = {};
        
        // Read raw content
        debugInfo.rawContent = fs.readFileSync(certPath, 'utf8');
        
        // If OpenSSL is available, get detailed info
        if (openSslAvailable) {
            try {
                // Get text format of certificate
                debugInfo.opensslText = execSync(`openssl x509 -in "${certPath}" -noout -text`, 
                    { encoding: 'utf8' });
                
                // Get SAN extension
                try {
                    debugInfo.sanExtension = execSync(
                        `openssl x509 -in "${certPath}" -noout -ext subjectAltName`, 
                        { encoding: 'utf8' });
                } catch (e) {
                    debugInfo.sanExtension = 'No SAN extension found';
                }
                
                // Get basic constraints
                try {
                    debugInfo.basicConstraints = execSync(
                        `openssl x509 -in "${certPath}" -noout -ext basicConstraints`, 
                        { encoding: 'utf8' });
                } catch (e) {
                    debugInfo.basicConstraints = 'No basic constraints extension found';
                }
            } catch (e) {
                debugInfo.opensslError = e.message;
            }
        } else {
            debugInfo.opensslStatus = 'OpenSSL not available';
        }
        
        // Parse certificate and add to debug info
        debugInfo.parsedCertificate = parseCertificateFile(certPath);
        
        res.json(debugInfo);
    } catch (error) {
        logger.error(`Error debugging certificate file: ${error.message}`);
        res.status(500).json({ error: 'Failed to debug certificate', message: error.message });
    }
});

// GET /api/certificate/debug/:fingerprint - Debug certificate by fingerprint
router.get('/debug/fingerprint/:fingerprint', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        logger.info(`GET /api/certificate/debug/fingerprint/${fingerprint} - Fingerprint debug info`);
        
        // Create a clean fingerprint
        let cleanFingerprint = fingerprint;
        while (cleanFingerprint.includes('sha256 Fingerprint=')) {
            cleanFingerprint = cleanFingerprint.replace('sha256 Fingerprint=', '');
        }
        
        // Find matches
        let matches = [];

        // Ensure CERTS_DIR exists before reading from it
        if (!fs.existsSync(CERTS_DIR)) {
            logger.warn(`Certificates directory does not exist: ${CERTS_DIR}`);
            return res.json({
                error: "Certificates directory doesn't exist",
                request: {
                    original: fingerprint,
                    cleaned: cleanFingerprint
                },
                certs_directory: CERTS_DIR,
                config_directory: CONFIG_DIR,
                certificate_count: 0
            });
        }
        
        const certFiles = fs.readdirSync(CERTS_DIR)
            .filter(file => file.endsWith('.crt') || file.endsWith('.pem'));
            
        logger.info(`Searching for fingerprint ${cleanFingerprint} among ${certFiles.length} certificate files`);
        
        for (const file of certFiles) {
            try {
                const certPath = path.join(CERTS_DIR, file);
                logger.debug(`Examining certificate file: ${file}`);
                const cert = parseCertificateFile(certPath);
                
                let certFingerprint = cert.fingerprint;
                while (certFingerprint.includes('sha256 Fingerprint=')) {
                    certFingerprint = certFingerprint.replace('sha256 Fingerprint=', '');
                }
                logger.debug(`Comparing fingerprints: "${certFingerprint}" vs "${cleanFingerprint}"`);
                
                const isMatch = certFingerprint === cleanFingerprint;
                if (isMatch) {
                    logger.info(`MATCH FOUND: ${file}`);
                }
                
                matches.push({
                    file,
                    fingerprint: cert.fingerprint,
                    cleanFingerprint: certFingerprint,
                    isMatch
                });
            } catch (e) {
                logger.warn(`Error parsing certificate ${file}: ${e.message}`);
            }
        }
        
        // Return detailed debugging info
        res.json({
            request: {
                original: fingerprint,
                cleaned: cleanFingerprint
            },
            matches,
            certs_directory: CERTS_DIR,
            config_directory: CONFIG_DIR,
            certificate_count: certFiles.length
        });
    } catch (error) {
        logger.error(`Error in fingerprint debug: ${error.message}`);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/certificate/:fingerprint/update - Update certificate properties
router.post('/:fingerprint/update', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        const { domains, action } = req.body;
        
        logger.info(`POST /api/certificate/${fingerprint}/update - Updating certificate`);
        logger.info(`Action: ${action}, Domains:`, domains);
        
        // Clean up the fingerprint
        let cleanFingerprint = fingerprint;
        while (cleanFingerprint.includes('sha256 Fingerprint=')) {
            cleanFingerprint = cleanFingerprint.replace('sha256 Fingerprint=', '');
        }
        
        // Find the certificate in the directory
        const certificates = await getAllCertificates();
        
        // Find the certificate by fingerprint
        const cert = certificates.find(c => {
            let certFingerprint = c.fingerprint;
            while (certFingerprint.includes('sha256 Fingerprint=')) {
                certFingerprint = certFingerprint.replace('sha256 Fingerprint=', '');
            }
            return certFingerprint === cleanFingerprint;
        });
        
        if (!cert) {
            logger.warn(`Certificate not found with fingerprint: ${cleanFingerprint}`);
            return res.status(404).json({
                success: false,
                error: 'Certificate not found'
            });
        }
        
        // If we're updating domains
        if (action === 'updateDomains' && Array.isArray(domains)) {
            logger.info(`Updating domains for certificate ${cert.name}`, { 
                oldDomains: cert.domains, 
                newDomains: domains 
            });
            
            // Get the certificate config for any deployment actions
            const certConfig = configManager.getCertConfig(cert.fingerprint) || {};
            const deployActions = certConfig.deployActions || [];
            
            // Use renewalManager to handle the domain update AND certificate renewal
            const result = await renewalManager.updateDomainsEndpoint(cert, domains, true, deployActions);
            
            if (result.success) {
                return res.json({
                    success: true,
                    message: result.message || 'Certificate updated successfully',
                    newFingerprint: result.newFingerprint
                });
            } else {
                return res.status(500).json({
                    success: false,
                    error: result.message || 'Failed to update certificate domains'
                });
            }
        } else {
            // Handle other types of updates if needed
            return res.status(400).json({
                success: false,
                error: `Unknown action type or invalid domains: ${action}`
            });
        }
        
    } catch (error) {
        logger.error(`Error updating certificate: ${error.message}`);
        res.status(500).json({
            success: false,
            error: `Failed to update certificate: ${error.message}`
        });
    }
});

// POST /api/certificate/:fingerprint/config - Update certificate configuration
router.post('/:fingerprint/config', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        const configData = req.body;
        
        logger.info(`POST /api/certificate/${fingerprint}/config - Updating certificate config`);
        
        // Clean up the fingerprint
        let cleanFingerprint = fingerprint;
        while (cleanFingerprint.includes('sha256 Fingerprint=')) {
            cleanFingerprint = cleanFingerprint.replace('sha256 Fingerprint=', '');
        }
        
        logger.info(`Using fingerprint: ${cleanFingerprint}`);
        
        // Find the certificate by fingerprint
        const certificates = await getAllCertificates();
        const cert = certificates.find(c => {
            let certFingerprint = c.fingerprint;
            while (certFingerprint.includes('sha256 Fingerprint=')) {
                certFingerprint = certFingerprint.replace('sha256 Fingerprint=', '');
            }
            return certFingerprint === cleanFingerprint;
        });
        
        if (!cert) {
            logger.warn(`Certificate not found with fingerprint: ${cleanFingerprint}`);
            return res.status(404).json({
                success: false,
                error: 'Certificate not found'
            });
        }
        
        // Determine if we need to renew based on config changes
        const oldConfig = configManager.getCertConfig(cert.fingerprint) || {};
        const needsRenewal = configData.autoRenew === true && oldConfig.autoRenew === false;
        
        // Save configuration changes via ConfigManager
        configManager.setCertConfig(cert.fingerprint, {
            ...oldConfig,
            ...configData,
            lastUpdated: new Date().toISOString()
        });
        
        logger.info(`Updated config for certificate ${cert.name || cert.fingerprint}`);
        
        // If autoRenew was just enabled, check if certificate needs renewal now
        if (needsRenewal) {
            logger.info(`Auto-renewal was enabled for certificate ${cert.name}, checking if renewal needed`);
            
            try {
                // Check if certificate is near expiration
                const now = new Date();
                const expiryDate = new Date(cert.validTo || cert.expiryDate);
                const daysUntilExpiry = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));
                
                if (daysUntilExpiry <= configData.renewDaysBeforeExpiry) {
                    logger.info(`Certificate ${cert.name} needs renewal (${daysUntilExpiry} days until expiry)`);
                    
                    // Start async renewal process without waiting for it
                    renewalManager.renewCertificate(cert).then(renewalResult => {
                        logger.info(`Certificate ${cert.name} renewed successfully`, renewalResult);
                        
                        // Run deployment actions if configured
                        if (configData.deployActions && configData.deployActions.length > 0) {
                            renewalManager.runDeployActions(cert, configData.deployActions).then(deployResult => {
                                logger.info(`Deployment actions completed for ${cert.name}`, deployResult);
                            }).catch(deployError => {
                                logger.error(`Error running deployment actions for ${cert.name}:`, deployError);
                            });
                        }
                    }).catch(renewalError => {
                        logger.error(`Error renewing certificate ${cert.name}:`, renewalError);
                    });
                    
                    // Tell the client that renewal is in progress
                    return res.json({
                        success: true,
                        message: 'Certificate configuration updated successfully and renewal started',
                        renewalInProgress: true
                    });
                }
            } catch (renewalCheckError) {
                logger.error(`Error checking if certificate needs renewal:`, renewalCheckError);
                // Continue with response below, as config was still successfully updated
            }
        }
        
        // Return success response
        res.json({
            success: true,
            message: 'Certificate configuration updated successfully'
        });
        
    } catch (error) {
        logger.error(`Error updating certificate config: ${error.message}`);
        res.status(500).json({
            success: false,
            error: `Failed to update certificate config: ${error.message}`
        });
    }
});

// POST /api/certificate/:fingerprint/renew - Renew a certificate
router.post('/:fingerprint/renew', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        
        logger.info(`POST /api/certificate/${fingerprint}/renew - Renewing certificate`);
        
        // Clean up the fingerprint
        let cleanFingerprint = fingerprint;
        while (cleanFingerprint.includes('sha256 Fingerprint=')) {
            cleanFingerprint = cleanFingerprint.replace('sha256 Fingerprint=', '');
        }
        
        // Find the certificate in the directory
        const certificates = await getAllCertificates();
        const cert = certificates.find(c => {
            let certFingerprint = c.fingerprint;
            while (certFingerprint.includes('sha256 Fingerprint=')) {
                certFingerprint = certFingerprint.replace('sha256 Fingerprint=', '');
            }
            return certFingerprint === cleanFingerprint;
        });
        
        if (!cert) {
            logger.warn(`Certificate not found with fingerprint: ${cleanFingerprint}`);
            return res.status(404).json({
                success: false,
                error: 'Certificate not found'
            });
        }
        
        // Get cert config to retrieve deployment actions
        const certConfig = configManager.getCertConfig(cert.fingerprint) || {};
        
        // Use renewalManager to handle the actual renewal process
        logger.info(`Starting renewal for certificate ${cert.name}`);
        
        // Start the renewal process
        // This should be done as a background operation in production
        const renewalResult = await renewalManager.renewCertificate(cert);
        
        // If renewal succeeded, run deployment actions
        if (renewalResult.success && certConfig.deployActions) {
            try {
                logger.info(`Running deployment actions for ${cert.name}`);
                const deployResult = await renewalManager.runDeployActions(cert, certConfig.deployActions);
                
                logger.info(`Deployment actions completed for ${cert.name}`, deployResult);
                
                // Return full success
                return res.json({
                    success: true,
                    message: 'Certificate renewed and deployment actions completed successfully',
                    certPath: renewalResult.certPath,
                    keyPath: renewalResult.keyPath,
                    deploymentResults: deployResult.results
                });
                
            } catch (deployError) {
                logger.error(`Error running deployment actions for ${cert.name}:`, deployError);
                
                // Return partial success
                return res.json({
                    success: true,
                    message: 'Certificate renewed but deployment actions failed',
                    certPath: renewalResult.certPath,
                    keyPath: renewalResult.keyPath,
                    deployError: deployError.message
                });
            }
        }
        
        // Return success response
        return res.json({
            success: true,
            message: 'Certificate renewed successfully',
            certPath: renewalResult.certPath,
            keyPath: renewalResult.keyPath
        });
        
    } catch (error) {
        logger.error(`Error renewing certificate: ${error.message}`);
        res.status(500).json({
            success: false,
            error: `Failed to renew certificate: ${error.message}`
        });
    }
});

// Helper function to get all certificates
async function getAllCertificates() {
    try {
        // Read certificates from directory
        const certificates = [];
        const certFiles = fs.readdirSync(CERTS_DIR)
            .filter(file => file.endsWith('.crt') || file.endsWith('.pem'));
        
        // Load cert-info.json for additional metadata
        const infoPath = CERT_INFO_PATH;
        let certInfo = {};
        
        try {
            if (fs.existsSync(infoPath)) {
                const infoContent = fs.readFileSync(infoPath, 'utf8');
                certInfo = JSON.parse(infoContent);
                logger.info(`Loaded cert-info.json with ${Object.keys(certInfo).length} entries`);
                
                // Debug info
                const fingerprints = Object.keys(certInfo);
                if (fingerprints.length > 0) {
                    logger.info(`First fingerprint in cert-info.json: ${fingerprints[0]}`);
                    if (certInfo[fingerprints[0]].domains) {
                        logger.info(`Domains for first fingerprint: ${JSON.stringify(certInfo[fingerprints[0]].domains)}`);
                    }
                }
            }
        } catch (e) {
            logger.warn(`Error loading cert-info.json: ${e.message}`);
        }
        
        // Process each certificate file
        for (const file of certFiles) {
            const certPath = path.join(CERTS_DIR, file);
            try {
                const cert = parseCertificateFile(certPath);
                
                // Enhance with data from cert-info.json if available
                if (cert.fingerprint && certInfo[cert.fingerprint]) {
                    logger.debug(`Found config for certificate ${cert.fingerprint}`);
                    
                    // If domains are specified in config, use those
                    if (certInfo[cert.fingerprint].domains) {
                        logger.debug(`Using domains from cert-info.json for ${cert.fingerprint}: ${JSON.stringify(certInfo[cert.fingerprint].domains)}`);
                        cert.domains = certInfo[cert.fingerprint].domains;
                    }
                    
                    // Add other configuration properties
                    cert.autoRenew = certInfo[cert.fingerprint].autoRenew;
                    cert.renewDaysBeforeExpiry = certInfo[cert.fingerprint].renewDaysBeforeExpiry;
                    cert.deployActions = certInfo[cert.fingerprint].deployActions;
                } else {
                    logger.debug(`No config found for certificate ${cert.fingerprint}`);
                }
                
                certificates.push(cert);
            } catch (error) {
                logger.error(`Error parsing certificate ${file}: ${error.message}`);
                // Continue with other certificates
            }
        }
        
        return certificates;
    } catch (error) {
        logger.error(`Error retrieving certificates: ${error.message}`);
        return [];
    }
}

// Debug endpoint to view cert-info.json
router.get('/debug/cert-info', async (req, res) => {
    try {
        const infoPath = CERT_INFO_PATH;
        let certInfo = {};
        let fileStats = {};
        let certsInDir = [];
        
        // Get certificate files in directory
        if (fs.existsSync(CERTS_DIR)) {
            certsInDir = fs.readdirSync(CERTS_DIR)
                .filter(file => file.endsWith('.crt') || file.endsWith('.pem'))
                .map(file => ({
                    name: file,
                    path: path.join(CERTS_DIR, file),
                    size: fs.statSync(path.join(CERTS_DIR, file)).size
                }));
        }
        
        // Check cert-info.json
        if (fs.existsSync(infoPath)) {
            const content = fs.readFileSync(infoPath, 'utf8');
            certInfo = JSON.parse(content);
            
            fileStats = {
                size: fs.statSync(infoPath).size,
                modified: fs.statSync(infoPath).mtime,
                created: fs.statSync(infoPath).birthtime
            };
            
            logger.info(`Loaded cert-info.json for debug: ${Object.keys(certInfo).length} certificates`);
        } else {
            logger.info('cert-info.json does not exist');
        }
        
        // Get one certificate for comparison
        let sampleCert = null;
        if (certsInDir.length > 0) {
            try {
                sampleCert = parseCertificateFile(certsInDir[0].path);
            } catch (e) {
                logger.error(`Error parsing sample cert: ${e.message}`);
            }
        }
        
        res.json({
            certInfoExists: fs.existsSync(infoPath),
            certsDirectory: CERTS_DIR,
            certInfoFileStats: fileStats,
            certificateCount: certsInDir.length,
            certificateFiles: certsInDir,
            certificatesInInfoFile: Object.keys(certInfo).length,
            sampleCertificate: sampleCert,
            sampleCertConfigExists: sampleCert ? !!certInfo[sampleCert.fingerprint] : false,
            certificates: certInfo
        });
    } catch (error) {
        logger.error(`Error in debug cert-info: ${error.message}`);
        res.status(500).json({
            error: 'Failed to get cert-info debug data',
            message: error.message
        });
    }
});

// GET /api/certificate/health - Check if certificate API is working
router.get('/health', async (req, res) => {
    try {
        logger.info('GET /api/certificate/health - Checking certificate API health');
        
        // Check if certs directory exists
        const certsDirExists = fs.existsSync(CERTS_DIR);
        
        // Check if cert-info.json exists and is valid JSON
        let certInfoExists = false;
        let certInfoValid = false;
        let certInfoCount = 0;
        
        const infoPath = CERT_INFO_PATH;
        if (fs.existsSync(infoPath)) {
            certInfoExists = true;
            try {
                const info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
                certInfoValid = true;
                certInfoCount = Object.keys(info).length;
            } catch (e) {
                // Invalid JSON
            }
        }
        
        // Count certificate files
        let certCount = 0;
        if (certsDirExists) {
            try {
                certCount = fs.readdirSync(CERTS_DIR)
                    .filter(file => file.endsWith('.crt') || file.endsWith('.pem'))
                    .length;
            } catch (e) {
                // Error reading directory
            }
        }
        
        res.json({
            status: 'ok',
            certsDirExists,
            certsDirectory: CERTS_DIR,
            certCount,
            certInfoExists,
            certInfoValid,
            certInfoCount,
            timestamp: new Date().toISOString(),
            configPaths: {
                configDir: CONFIG_DIR,
                certInfoPath: CERT_INFO_PATH,
                settingsPath: settingsPath,
                certConfigPath: configManager.configPath
            }
        });
    } catch (error) {
        logger.error(`Error in certificate health check: ${error.message}`);
        
        res.status(500).json({
            status: 'error',
            error: error.message
        });
    }
});

// Export the router as the default export for Express
module.exports = router;

// Then add the utility functions as properties on the router object
router.parseCertificates = parseCertificates;
router.fetchCertificates = fetchCertificates;
router.extractDateFromCert = extractDateFromCert;
router.processCertificate = processCertificate;
router.extractCertDetails = extractCertDetails;
router.fallbackCertificateParser = fallbackCertificateParser;
router.buildCertificateHierarchy = buildCertificateHierarchy;