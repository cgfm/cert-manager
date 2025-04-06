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
const CONFIG_FILE = process.env.CONFIG_FILE || '/config/cert-config.json';


// Create an initial config file
const defaultConfig = {
    globalDefaults: {
        autoRenewByDefault: false,
        renewDaysBeforeExpiry: 30,
        caValidityPeriod: {
            rootCA: 3650,
            intermediateCA: 1825,
            standard: 90
        },
        enableCertificateBackups: true
    },
    certificates: {}
};

const configDir = path.dirname(CONFIG_FILE);
if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
}

if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    console.log('Created initial config file at ' + CONFIG_FILE);
}

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

// Add the file system browsing API endpoint
app.get('/api/filesystem', (req, res) => {
    const requestedPath = req.query.path || '/';
    
    try {
        // Security check - restrict to known directories
        const allowedPaths = ['/certs', '/config', '/tmp'];
        const isRootOrAllowed = requestedPath === '/' || 
            allowedPaths.some(path => requestedPath === path || requestedPath.startsWith(`${path}/`));
        
        if (!isRootOrAllowed) {
            return res.status(403).json({
                success: false,
                message: 'Access restricted to /certs, /config, and /tmp directories'
            });
        }
        
        // Check if path exists
        if (!fs.existsSync(requestedPath)) {
            return res.json({
                success: false,
                message: 'Path does not exist'
            });
        }
        
        // Check if it's a directory
        if (!fs.statSync(requestedPath).isDirectory()) {
            return res.json({
                success: false,
                message: 'Path is not a directory'
            });
        }
        
        // Read directory contents
        const items = fs.readdirSync(requestedPath);
        
        // Sort into directories and files
        const directories = [];
        const files = [];
        
        for (const item of items) {
            const fullPath = path.join(requestedPath, item);
            
            try {
                const stats = fs.statSync(fullPath);
                if (stats.isDirectory()) {
                    directories.push(item);
                } else {
                    files.push(item);
                }
            } catch (error) {
                console.error(`Error accessing ${fullPath}:`, error);
                // Skip files/directories that can't be accessed
            }
        }
        
        // Sort alphabetically
        directories.sort();
        files.sort();
        
        return res.json({
            success: true,
            path: requestedPath,
            directories,
            files
        });
    } catch (error) {
        console.error('Error browsing filesystem:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error while browsing filesystem'
        });
    }
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