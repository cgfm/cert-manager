const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const { parseCertificates } = require('./cert-parser');
const { renderTable } = require('./views/table-view');
const ConfigManager = require('./config-manager');
const RenewalManager = require('./renewal-manager');
const { isValidDomainOrIP } = require('./utils/domain-validator');

const app = express();
const PORT = process.env.PORT || 3000;
const CERTS_DIR = process.env.CERTS_DIR || '/certs';
const CONFIG_FILE = process.env.CONFIG_FILE || path.join(process.env.HOME || '/app', '.cert-viewer', 'config.json');

// Initialize managers
const configManager = new ConfigManager(CONFIG_FILE);
const renewalManager = new RenewalManager(configManager, CERTS_DIR);

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// Main route
app.get('/', (req, res) => {
    console.log(`Reading certificates from ${CERTS_DIR}`);
    const certData = parseCertificates(CERTS_DIR);
    console.log(`Found ${certData.certificates.length} certificates`);
    const tableHtml = renderTable(certData);
    res.send(tableHtml);
});

// API routes for certificate configuration
app.get('/api/certificates', (req, res) => {
    const certData = parseCertificates(CERTS_DIR);
    const configs = configManager.getAllConfigs();
    
    // Merge certificate data with configs
    const certsWithConfig = certData.certificates.map(cert => {
        const config = configManager.getCertConfig(cert.fingerprint);
        return { ...cert, config };
    });
    
    res.json(certsWithConfig);
});

app.get('/api/certificate/:fingerprint', (req, res) => {
    const { fingerprint } = req.params;
    const certData = parseCertificates(CERTS_DIR);
    const cert = certData.certificates.find(c => c.fingerprint === fingerprint);
    
    if (!cert) {
        return res.status(404).json({ error: 'Certificate not found' });
    }
    
    const config = configManager.getCertConfig(fingerprint);
    res.json({ ...cert, config });
});

app.post('/api/certificate/:fingerprint/config', (req, res) => {
    const { fingerprint } = req.params;
    const config = req.body;
    
    configManager.setCertConfig(fingerprint, config);
    res.json({ success: true, message: 'Configuration saved' });
});

// Manually trigger certificate renewal
app.post('/api/certificate/:fingerprint/renew', async (req, res) => {
    const { fingerprint } = req.params;
    const certData = parseCertificates(CERTS_DIR);
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
app.post('/api/certificates/create', async (req, res) => {
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
        console.error('Certificate creation error:', error);
        res.status(500).json({ 
            error: 'Failed to create certificate', 
            details: error.message 
        });
    }
});

// Domain management endpoints
app.post('/api/certificate/:fingerprint/domains/add', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        const { domain } = req.body;
        
        if (!domain) {
            return res.status(400).json({ error: 'Domain is required' });
        }
        
        // Validate domain/IP format
        if (!isValidDomainOrIP(domain)) {
            return res.status(400).json({ error: 'Invalid domain or IP format' });
        }
        
        const certData = parseCertificates(CERTS_DIR);
        const cert = certData.certificates.find(c => c.fingerprint === fingerprint);
        
        if (!cert) {
            return res.status(404).json({ error: 'Certificate not found' });
        }
        
        // Add domain to certificate
        const result = await renewalManager.addDomainToCertificate(cert, domain);
        res.json({ success: true, message: result.message });
    } catch (error) {
        console.error('Error adding domain:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/certificate/:fingerprint/domains/remove', async (req, res) => {
    try {
        const { fingerprint } = req.params;
        const { domain } = req.body;
        
        if (!domain) {
            return res.status(400).json({ error: 'Domain is required' });
        }
        
        const certData = parseCertificates(CERTS_DIR);
        const cert = certData.certificates.find(c => c.fingerprint === fingerprint);
        
        if (!cert) {
            return res.status(404).json({ error: 'Certificate not found' });
        }
        
        // Remove domain from certificate
        const result = await renewalManager.removeDomainFromCertificate(cert, domain);
        res.json({ success: true, message: result.message });
    } catch (error) {
        console.error('Error removing domain:', error);
        res.status(500).json({ error: error.message });
    }
});

// Global settings API
app.get('/api/settings', (req, res) => {
    const settings = configManager.getGlobalDefaults();
    res.json(settings);
});

app.post('/api/settings', (req, res) => {
    const settings = req.body;
    configManager.setGlobalDefaults(settings);
    res.json({ success: true });
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Certificate viewer server is running on http://0.0.0.0:${PORT}`);
    console.log(`Looking for certificates in: ${CERTS_DIR}`);
    console.log(`Using configuration file: ${CONFIG_FILE}`);
    
    // Set up scheduled checks for certificate renewals
    setInterval(() => {
        const certData = parseCertificates(CERTS_DIR);
        renewalManager.checkCertificatesForRenewal(certData.certificates);
    }, 24 * 60 * 60 * 1000); // Check once a day
    
    // Initial check
    setTimeout(() => {
        const certData = parseCertificates(CERTS_DIR);
        renewalManager.checkCertificatesForRenewal(certData.certificates);
    }, 10000); // Check 10 seconds after startup
});