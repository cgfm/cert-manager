const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { parseCertificates } = require('./cert-parser');
const { renderTable } = require('./views/table-view');
const ConfigManager = require('./config-manager');
const RenewalManager = require('./renewal-manager');
const { isValidDomainOrIP } = require('./utils/domain-validator');
const dockerRoutes = require('./routes/docker-api');
const certificateRoutes = require('./routes/certificate-api');
const logsRoutes = require('./routes/logs-api');
const logger = require('./services/logger');
const settingsRoutes = require('./routes/settings-api');
const settingsApi = require('./routes/settings-api');

// Application settings
const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 4443;
const CERTS_DIR = process.env.CERTS_DIR || '/certs';
const CONFIG_FILE = process.env.CONFIG_FILE || '/config/cert-config.json';

// Create or load configuration
const configManager = new ConfigManager(CONFIG_FILE);
const renewalManager = new RenewalManager(configManager, CERTS_DIR);

// HTTPS configuration
function setupHttpsServer() {
    // Check if HTTPS is enabled through environment variables
    const httpsEnabled = process.env.ENABLE_HTTPS === 'true';
    const httpsConfigured = process.env.HTTPS_CERT_PATH && process.env.HTTPS_KEY_PATH;
    const managerCertName = process.env.MANAGER_CERT_NAME || '';
    
    // Or from the config file
    const globalConfig = configManager.getGlobalDefaults();
    const httpsFromConfig = globalConfig.enableHttps === true;
    
    // If HTTPS is not enabled in either place, just return and we'll run HTTP only
    if (!httpsEnabled && !httpsFromConfig) {
        logger.info('HTTPS is disabled. Running with HTTP only.');
        return null;
    }

    let certPath, keyPath;
    
    // Option 1: Get paths from environment variables
    if (httpsConfigured) {
        certPath = process.env.HTTPS_CERT_PATH;
        keyPath = process.env.HTTPS_KEY_PATH;
        logger.info(`Using HTTPS certificate from environment variables: ${certPath}`);
    }
    // Option 2: Get paths from global config
    else if (globalConfig.httpsCertPath && globalConfig.httpsKeyPath) {
        certPath = globalConfig.httpsCertPath;
        keyPath = globalConfig.httpsKeyPath;
        logger.info(`Using HTTPS certificate from config file: ${certPath}`);
    } 
    // Option 3: Find a certificate by name (from our managed certificates)
    else if (managerCertName) {
        // Find certificate by name in the managed certificates
        logger.info(`Looking for certificate with name: ${managerCertName}`);
        const certData = parseCertificates(CERTS_DIR);
        const cert = certData.certificates.find(c => c.name === managerCertName);
        
        if (cert && cert.path && cert.keyPath) {
            certPath = cert.path;
            keyPath = cert.keyPath;
            logger.info(`Using managed certificate for HTTPS: ${cert.name}`);
        } else {
            logger.warn(`Could not find managed certificate "${managerCertName}" for HTTPS`);
        }
    }

    // Check if certificate and key files exist
    if (!certPath || !keyPath || !fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
        logger.error('HTTPS certificate or key file not found. Running with HTTP only.');
        return null;
    }

    try {
        // Create HTTPS server options
        const httpsOptions = {
            cert: fs.readFileSync(certPath),
            key: fs.readFileSync(keyPath)
        };

        return https.createServer(httpsOptions, app);
    } catch (error) {
        logger.error('Failed to set up HTTPS server:', error);
        return null;
    }
}

// Configure express app
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.json());

// Set up logging middleware for API requests
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`, { 
        ip: req.ip,
        protocol: req.protocol,
        userAgent: req.headers['user-agent']
    });
    next();
});

// Set up routes
app.use('/api/certificates', certificateRoutes.initialize(configManager, renewalManager, CERTS_DIR));
app.use('/api/certificate', certificateRoutes.initialize(configManager, renewalManager, CERTS_DIR));
app.use('/api/docker', dockerRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/settings', settingsRoutes.initialize(configManager));
app.use('/api/settings', settingsApi.initialize(configManager));

// Main route
app.get('/', (req, res) => {
    logger.info(`Reading certificates from ${CERTS_DIR}`);
    const certData = parseCertificates(CERTS_DIR);
    logger.info(`Found ${certData.certificates.length} certificates`);
    const tableHtml = renderTable(certData);
    res.send(tableHtml);
});

// Set up HTTP server
const httpServer = http.createServer(app);

// Try to set up HTTPS server
const httpsServer = setupHttpsServer();

// Start HTTP server
httpServer.listen(PORT, '0.0.0.0', () => {
    logger.info(`Certificate manager HTTP server running on http://0.0.0.0:${PORT}`);
    logger.info(`Looking for certificates in: ${CERTS_DIR}`);
    logger.info(`Using configuration file: ${CONFIG_FILE}`);
});

// Start HTTPS server if configured
if (httpsServer) {
    httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
        logger.info(`Certificate manager HTTPS server running on https://0.0.0.0:${HTTPS_PORT}`);
    });
}