const express = require('express');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const ConfigManager = require('./services/config-manager');
const RenewalManager = require('./services/renewal-manager');
const CertificateService = require('./services/certificate-service');
const SchedulerService = require('./services/scheduler'); // Add this
const logger = require('./services/logger');

// Initialize the application
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Configuration paths
const CERTS_DIR = process.env.CERTS_DIR || '/certs';
const CONFIG_DIR = process.env.CONFIG_DIR || '/config';
const LOGS_DIR = process.env.LOGS_DIR || '/logs';

// Ensure config directory exists
if (!fs.existsSync(CONFIG_DIR)) {
    logger.info(`Creating config directory: ${CONFIG_DIR}`);
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

// Ensure log directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Initialize services
const configManager = new ConfigManager(CONFIG_DIR);
const certificateService = new CertificateService(CERTS_DIR, configManager);

// Trigger an initial cache refresh to build cache
certificateService.refreshCertificateCache()
    .then(() => {
        logger.info('Initial certificate cache refresh complete');
    })
    .catch(error => {
        logger.error('Error during initial certificate cache refresh:', error);
    });

// Create renewal manager
const renewalManager = new RenewalManager(configManager, CERTS_DIR, certificateService);
const schedulerService = new SchedulerService(configManager, renewalManager);

// Start the scheduler
schedulerService.initialize();

// Set up the socket.io instance and pass it to the scheduler service
schedulerService.setIo(io);

// Make services available to routes
const services = {
    configManager,
    certificateService,
    renewalManager,
    schedulerService,
    io
};

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
const certificateApi = require('./routes/certificate-api.cjs');
const schedulerApiRouter = require('./routes/scheduler-api.cjs')(services);
app.use('/api/scheduler', schedulerApiRouter);

app.use('/api/certificate', certificateApi.initialize({
  certificateService,
  configManager,
  renewalManager
}));
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
    logger.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception:', err);
    // Log error but keep server running
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection at:', promise, 'reason:', reason);
    // Log error but keep server running
});

// Set up Socket.io event handlers
io.on('connection', (socket) => {
    logger.info('New client connected');
    
    // Update WebSocket status in UI for all clients
    io.emit('server-status', { status: 'online', clients: io.engine.clientsCount });
    
    socket.on('disconnect', () => {
        logger.info('Client disconnected:', socket.id);
        // Update client count for remaining clients
        io.emit('server-status', { status: 'online', clients: io.engine.clientsCount });
    });
});

// Make io accessible to routes and services that need it
app.set('io', io);
renewalManager.setSocketIo(io);

// Start the server
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

/*// Start the server
app.listen(PORT, () => {
  logger.info(`Certificate Manager running on port ${PORT}`);
  
  // Set up automatic renewal checks
  setupRenewalChecks();
});*/

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

// Export the app for testing
module.exports = { app, server, io };