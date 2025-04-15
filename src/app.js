const express = require('express');
const path = require('path');
const fs = require('fs');
const ConfigManager = require('./services/config-manager');
const RenewalManager = require('./services/renewal-manager');
const CertificateService = require('./services/certificate-service');
const logger = require('./services/logger');

// Initialize the application
const app = express();
const PORT = process.env.PORT || 3000;

// Configuration paths
const CERTS_DIR = process.env.CERTS_DIR || '/certs';
const CONFIG_DIR = process.env.CONFIG_DIR || '/config';
const LOGS_DIR = process.env.LOGS_DIR || '/logs';

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
    console.log(`Creating config directory: ${CONFIG_DIR}`);
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Ensure log directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Create config manager
const configManager = new ConfigManager();

// Create certificate service
const certificateService = new CertificateService(CERTS_DIR, configManager);

// Create renewal manager
const renewalManager = new RenewalManager(configManager, CERTS_DIR, certificateService);

// Middleware to parse JSON bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Add timeout middleware to prevent hung requests
app.use((req, res, next) => {
    // Set a 30-second timeout for all requests
    req.setTimeout(30000, () => {
        logger.warn(`Request timeout for ${req.method} ${req.url}`);
        if (!res.headersSent) {
            res.status(503).json({
                error: 'Request timed out',
                message: 'The server took too long to respond. Please try again.'
            });
        }
    });
    next();
});

// Setup static file serving
app.use(express.static(path.join(__dirname, 'public')));

// Setup API routes
const dockerApiRouter = require('./routes/docker-api');
const filesystemApiRouter = require('./routes/filesystem-api');
const logsApiRouter = require('./routes/logs-api');

// Initialize and use API routes
app.use('/api/certificate', require('./routes/certificate-api'));
app.use('/api/settings', require('./routes/settings-api').initialize(configManager));
app.use('/api/docker', dockerApiRouter.initialize());
app.use('/api/filesystem', filesystemApiRouter);
app.use('/api/logs', logsApiRouter.initialize());

// Root route - serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled application error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
    // Log error but keep server running
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection at:', promise, 'reason:', reason);
    // Log error but keep server running
});

// Start the server
app.listen(PORT, () => {
  logger.info(`Certificate Manager running on port ${PORT}`);
  
  // Set up automatic renewal checks
  setupRenewalChecks();
});

// Add this to app.js
logger.info('Configuration paths:');
logger.info(`  Config directory: ${CONFIG_DIR}`);
logger.info(`  Settings path: ${configManager.settingsPath}`);
logger.info(`  Certificate config path: ${configManager.configPath}`);
logger.info(`  Certificate info path: ${configManager.certInfoPath}`);
logger.info(`  Certificates directory: ${CERTS_DIR}`);

// Function to set up automatic renewal checks
function setupRenewalChecks() {
  logger.info('Setting up automatic certificate renewal checks');
  
  // Check for renewals on startup
  setTimeout(() => {
    checkForRenewals();
  }, 10000); // Wait 10 seconds before first check to allow system to fully initialize
  
  // Schedule subsequent checks
  setInterval(checkForRenewals, 12 * 60 * 60 * 1000); // Check every 12 hours
}

// Function to check for certificates that need renewal
async function checkForRenewals() {
  try {
    logger.info('Checking for certificates that need renewal');
    const certificates = await certificateService.getAllCertificates();
    await renewalManager.checkCertificatesForRenewal(certificates);
    
    // Clean up old backups
    await certificateService.cleanupOldBackups();
  } catch (error) {
    logger.error('Error during certificate renewal check:', error);
  }
}