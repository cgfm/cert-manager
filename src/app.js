const express = require('express');
const path = require('path');
const fs = require('fs');
const setupApi = require('./api');
const CertificateManager = require('./models/CertificateManager');
const OpenSSLWrapper = require('./services/openssl-wrapper');
const RenewalService = require('./services/renewal-service');
const logger = require('./services/logger');
const configService = require('./services/config-service');
const ActivityService = require('./services/activity-service');
const LogsService = require('./services/logs-service');
const FileSystemService = require('./services/filesystem-service');
const DockerService = require('./services/docker-service');

// Initialize app
const app = express();

// Load all configuration from config service
const config = configService.get();
logger.setLevel(config.logLevel || 'info');

logger.info('Starting Certificate Manager...');

// Check if config directory is writable
try {
  const configDir = config.configDir || '/config';
  const testFile = path.join(configDir, '.write-test');
  
  fs.writeFileSync(testFile, 'test', 'utf8');
  fs.unlinkSync(testFile);
  logger.info(`Config directory ${configDir} is writable`);
} catch (error) {
  logger.error(`Config directory is not writable: ${error.message}`);
  logger.error(`This may prevent certificates.json and other configuration files from being saved.`);
  logger.error(`Please check your Docker volume mounts and container permissions.`);
}

const logsDir = process.env.LOGS_DIR || '/logs';
// Don't try to create the directory if it's a mounted volume
if (!logsDir.startsWith('/logs') && !fs.existsSync(logsDir)) {
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (error) {
    logger.warn(`Could not create logs directory ${logsDir}: ${error.message}`);
    // Continue execution - the app should still work if logs directory exists
  }
}

logger.info(`Using logs directory: ${logsDir}`);

// Initialize shared Docker service - create once and reuse
const dockerService = DockerService;

// Initialize services
const certificateManager = new CertificateManager(
  config.certPath,
  path.join(configService.configDir, 'certificates.json'),
  configService.configDir
);

const openSSL = new OpenSSLWrapper();

// Initialize renewal service
const renewalService = new RenewalService(certificateManager, {
  renewalSchedule: config.renewalSchedule,
  enableWatcher: config.enableFileWatch,
  disableRenewalCron: !config.enableAutoRenewalJob
});

const activityService = new ActivityService(config.configDir);
const logsService = new LogsService(logsDir);
const fileSystemService = new FileSystemService(dockerService); // Pass dockerService to FileSystemService

// Set up middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api', setupApi({
  certificateManager,
  openSSL,
  renewalService,
  configService,
  activityService,
  logsService,
  fileSystemService,
  dockerService
}));

// Serve frontend for any other route
app.get('*', (req, res) => {
  // Only serve index.html for non-API, non-file paths
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).send('Not found');
  }
});

// Start HTTP server
const httpServer = app.listen(config.port || 3000, async () => {
  logger.info(`Certificate Manager HTTP server listening on port ${config.port || 3000}`);
  logger.info(`OpenAPI documentation available at http://localhost:${config.port || 3000}/api/docs`);
  
  // Log configuration details
  logger.info(`Certificates directory: ${config.certPath}`);
  logger.info(`Auto-renewal: ${config.enableAutoRenewalJob ? 'enabled' : 'disabled'}`);
  logger.info(`Renewal schedule: ${config.renewalSchedule}`);
  logger.info(`File watcher: ${config.enableFileWatch ? 'enabled' : 'disabled'}`);
  
  // Start renewal service after server is up
  try {
    await renewalService.start();
    logger.info('Certificate renewal service started');
  } catch (error) {
    logger.error('Error starting certificate renewal service:', error);
  }
});

// Start HTTPS server if enabled
if (config.enableHttps && config.httpsCertPath && config.httpsKeyPath) {
  try {
    const https = require('https');
    const httpsOptions = {
      cert: fs.readFileSync(config.httpsCertPath),
      key: fs.readFileSync(config.httpsKeyPath)
    };
    
    const httpsServer = https.createServer(httpsOptions, app);
    httpsServer.listen(config.httpsPort || 4443, () => {
      logger.info(`Certificate Manager HTTPS server listening on port ${config.httpsPort || 4443}`);
    });
  } catch (error) {
    logger.error('Failed to start HTTPS server:', error);
  }
}

// Handle global errors
process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', err);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', reason);
});