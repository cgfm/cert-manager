const express = require('express');
const router = express.Router();
const { parseCertificates } = require('../cert-parser');
const { isValidDomainOrIP } = require('../utils/domain-validator');
const logger = require('../services/logger');

// Initialize with required services
let configManager, renewalManager, certsDir;

function initialize(config, renewal, certsDirectory) {
    configManager = config;
    renewalManager = renewal;
    certsDir = certsDirectory;
    return router;
}

// List all certificates
router.get('/', (req, res) => {
    const certData = parseCertificates(certsDir);
    const configs = configManager.getAllConfigs();
    
    // Merge certificate data with configs
    const certsWithConfig = certData.certificates.map(cert => {
        const config = configManager.getCertConfig(cert.fingerprint);
        return { ...cert, config };
    });
    
    res.json(certsWithConfig);
});

// Get a specific certificate by fingerprint
router.get('/:fingerprint', (req, res) => {
    try {
        let { fingerprint } = req.params;
        
        // Decode the fingerprint
        fingerprint = decodeURIComponent(fingerprint);
        
        const certData = parseCertificates(certsDir);
        
        // Find the certificate, handling special fingerprint formats
        const cert = certData.certificates.find(c => {
            if (c.fingerprint === fingerprint) return true;
            
            // Remove prefix if present
            const normalizedFingerprint = fingerprint.replace(/^sha256\s+Fingerprint=\s*/i, '');
            const normalizedCertFingerprint = c.fingerprint.replace(/^sha256\s+Fingerprint=\s*/i, '');
            
            return normalizedCertFingerprint === normalizedFingerprint;
        });
        
        if (!cert) {
            logger.error(`Certificate not found with fingerprint: ${fingerprint}`);
            return res.status(404).json({ error: 'Certificate not found' });
        }
        
        // Get the config for this certificate
        const config = configManager.getCertConfig(cert.fingerprint) || {};
        
        // Add the config domains to the certificate if they exist
        if (config.domains && Array.isArray(config.domains)) {
            // Create a merged list without duplicates
            const allDomains = Array.from(new Set([
                ...(cert.domains || []),
                ...config.domains
            ]));
            
            // Update the cert object with all domains
            cert.domains = allDomains;
        }
        
        // Return the merged certificate + config
        res.json({ 
            ...cert, 
            config,
            _debug: {
                timestamp: new Date().toISOString(),
                configDomains: config.domains || [],
                certDomains: cert.domains || []
            }
        });
    } catch (error) {
        logger.error('Error fetching certificate:', error);
        return res.status(500).json({ error: 'Server error while fetching certificate' });
    }
});

// Update certificate configuration
router.post('/:fingerprint/config', (req, res) => {
    const { fingerprint } = req.params;
    const config = req.body;
    
    configManager.setCertConfig(fingerprint, config);
    res.json({ success: true, message: 'Configuration saved' });
});

// Manually trigger certificate renewal
router.post('/:fingerprint/renew', async (req, res) => {
    const { fingerprint } = req.params;
    const certData = parseCertificates(certsDir);
    const cert = certData.certificates.find(c => c.fingerprint === fingerprint);
    
    if (!cert) {
        return res.status(404).json({ error: 'Certificate not found' });
    }
    
    try {
        await renewalManager.renewCertificate(cert);
        const config = configManager.getCertConfig(fingerprint);
        await renewalManager.runDeployActions(cert, config.deployActions);
        res.json({ success: true, message: 'Certificate renewed successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Certificate creation endpoint
router.post('/create', async (req, res) => {
    try {
        const { domains, email, challengeType, certType } = req.body;
        
        if (!domains || domains.length === 0) {
            return res.status(400).json({ error: 'At least one domain is required' });
        }
        
        // Create a new certificate
        const result = await renewalManager.createCertificate({
            domains,
            email,
            challengeType: challengeType || 'http', // 'http', 'dns', or 'standalone'
            certType: certType || 'standard'         // 'standard', 'wildcard', etc.
        });
        
        res.json({ 
            success: true, 
            message: 'Certificate creation process started', 
            details: result 
        });
    } catch (error) {
        logger.error('Certificate creation error:', error);
        res.status(500).json({ 
            error: 'Failed to create certificate', 
            details: error.message 
        });
    }
});

// Domain management
router.post('/:fingerprint/domains', async (req, res) => {
    try {
        let { fingerprint } = req.params;
        const { domain } = req.body;
            
        logger.info(`API: Adding domain ${domain} to certificate with fingerprint: ${fingerprint}`);
        
        fingerprint = decodeURIComponent(fingerprint);
        
        if (!domain) {
            return res.status(400).json({ 
                success: false,
                error: 'Domain is required' 
            });
        }
        
        if (!isValidDomainOrIP(domain)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid domain or IP format' 
            });
        }
        
        const certData = await parseCertificates(certsDir);
        
        const cert = certData.certificates.find(c => {
            if (c.fingerprint === fingerprint) return true;
            
            const normalizedFingerprint = fingerprint.replace(/^sha256\s+Fingerprint=\s*/i, '');
            const normalizedCertFingerprint = c.fingerprint.replace(/^sha256\s+Fingerprint=\s*/i, '');
            
            return normalizedCertFingerprint === normalizedFingerprint;
        });
        
        if (!cert) {
            logger.error(`Certificate not found with fingerprint: ${fingerprint}`);
            return res.status(404).json({ 
                success: false,
                error: 'Certificate not found' 
            });
        }
        
        logger.info(`Found certificate: ${cert.name}`);
        
        const result = await renewalManager.addDomainToCertificate(cert, domain);
        
        return res.json({ 
            success: true, 
            message: result.message || 'Domain added successfully' 
        });
    } catch (error) {
        logger.error('Error adding domain:', error);
        return res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

router.delete('/:fingerprint/domains/:domain', async (req, res) => {
    try {
        let { fingerprint, domain } = req.params;
        
        logger.info(`API: Removing domain ${domain} from certificate with fingerprint: ${fingerprint}`);
        
        fingerprint = decodeURIComponent(fingerprint);
        domain = decodeURIComponent(domain);
        
        if (!domain) {
            return res.status(400).json({ 
                success: false,
                error: 'Domain is required' 
            });
        }
        
        const certData = await parseCertificates(certsDir);
        
        const cert = certData.certificates.find(c => {
            if (c.fingerprint === fingerprint) return true;
            
            const normalizedFingerprint = fingerprint.replace(/^sha256\s+Fingerprint=\s*/i, '');
            const normalizedCertFingerprint = c.fingerprint.replace(/^sha256\s+Fingerprint=\s*/i, '');
            
            return normalizedCertFingerprint === normalizedFingerprint;
        });
        
        if (!cert) {
            logger.error(`Certificate not found with fingerprint: ${fingerprint}`);
            return res.status(404).json({ 
                success: false,
                error: 'Certificate not found' 
            });
        }
        
        logger.info(`Found certificate: ${cert.name}`);
        
        const result = await renewalManager.removeDomainFromCertificate(cert, domain);
        
        return res.json({ 
            success: true, 
            message: result.message || 'Domain removed successfully' 
        });
    } catch (error) {
        logger.error('Error removing domain:', error);
        return res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

// Combined domain update and certificate renewal endpoint
router.post('/:fingerprint/update-domains', async (req, res) => {
    try {
        let { fingerprint } = req.params;
        const { addDomains, removeDomains, renew } = req.body;
        
        fingerprint = decodeURIComponent(fingerprint);
        
        logger.info(`Updating domains for certificate with fingerprint: ${fingerprint}`, {
            addDomains,
            removeDomains,
            renew
        });
        
        const certData = await parseCertificates(certsDir);
        
        const cert = certData.certificates.find(c => {
            if (c.fingerprint === fingerprint) return true;
            
            const normalizedFingerprint = fingerprint.replace(/^sha256\s+Fingerprint=\s*/i, '');
            const normalizedCertFingerprint = c.fingerprint.replace(/^sha256\s+Fingerprint=\s*/i, '');
            
            return normalizedCertFingerprint === normalizedFingerprint;
        });
        
        if (!cert) {
            logger.error(`Certificate not found with fingerprint: ${fingerprint}`);
            return res.status(404).json({ 
                success: false,
                error: 'Certificate not found' 
            });
        }
        
        // First update the domain list
        const currentDomains = cert.domains || [];
        
        // Add new domains (avoiding duplicates)
        let updatedDomains = [...currentDomains];
        for (const domain of addDomains) {
            if (!updatedDomains.includes(domain)) {
                updatedDomains.push(domain);
            }
        }
        
        // Remove domains
        updatedDomains = updatedDomains.filter(domain => !removeDomains.includes(domain));
        
        // Get current config
        const config = configManager.getCertConfig(cert.fingerprint) || {};
        
        // Store the deployment actions for later use
        const deployActions = config.deployActions || [];
        
        // Update the certificate configuration with new domains
        const updatedConfig = {
            ...config,
            domains: updatedDomains
        };
        
        // Save updated config
        configManager.setCertConfig(cert.fingerprint, updatedConfig);
        
        logger.info(`Updated domain list: ${updatedDomains.join(', ')}`);
        logger.info(`Deployment actions configured: ${deployActions.length}`, { deployActions });
        
        // Results to return to client
        let result = {
            success: true,
            message: 'Domain configuration updated',
            domains: updatedDomains,
            renewed: false,
            newFingerprint: null
        };
        
        if (renew) {
            logger.info(`Renewing certificate with updated domains`, { certName: cert.name });
            
            // Update the cert object for renewal
            const certToRenew = {
                ...cert,
                domains: updatedDomains
            };
            
            // Save original fingerprint to transfer config later if needed
            const originalFingerprint = cert.fingerprint;
            
            // Perform the renewal with the new domain list
            await renewalManager.renewCertificate(certToRenew);
            
            logger.info('Certificate renewed, checking for new fingerprint');
            
            // After renewal, get the updated certificate data to find the new fingerprint
            const updatedCertData = await parseCertificates(certsDir);
            
            // Look for the updated certificate - first try by name
            let updatedCert = updatedCertData.certificates.find(c => 
                c.name === cert.name && c.fingerprint !== originalFingerprint
            );
            
            // If not found by name + different fingerprint, try by path
            if (!updatedCert && cert.path) {
                updatedCert = updatedCertData.certificates.find(c => 
                    c.path === cert.path && c.keyPath === cert.keyPath
                );
            }
            
            // If still not found, use the original cert info as a fallback
            if (!updatedCert) {
                logger.warn('Could not identify renewed certificate, using original certificate info');
                updatedCert = cert;
            } else {
                logger.info(`Certificate renewed with new fingerprint: ${updatedCert.fingerprint}`);
                
                // Transfer configuration to the new fingerprint
                configManager.setCertConfig(updatedCert.fingerprint, updatedConfig);
                logger.info('Transferred config to new certificate fingerprint');
                
                result.newFingerprint = updatedCert.fingerprint;
            }
            
            // Explicitly run deployment actions
            if (deployActions && deployActions.length > 0) {
                logger.info(`Running ${deployActions.length} deployment actions for renewed certificate`, { deployActions });
                
                try {
                    // Run deployment actions for the updated certificate
                    const deployResult = await renewalManager.runDeployActions(updatedCert, deployActions);
                    logger.info('Deployment actions completed', { deployResult });
                } catch (deployError) {
                    logger.error('Error running deployment actions', deployError);
                }
            } else {
                logger.info('No deployment actions configured for this certificate');
            }
            
            result.renewed = true;
            result.message = 'Certificate renewed with updated domains';
        }
        
        return res.json(result);
    } catch (error) {
        logger.error('Error updating certificate domains:', error);
        return res.status(500).json({ 
            success: false,
            error: error.message 
        });
    }
});

module.exports = { router, initialize };