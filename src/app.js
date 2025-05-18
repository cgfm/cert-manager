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
const NpmIntegrationService = require('./services/npm-integration-service');
const AuthMiddleware = require('./middleware/auth');
const UserManager = require('./services/user-manager');
const cookieParser = require('cookie-parser');
const DeployService = require('./services/deploy-service');

const FILENAME = 'app.js';
global.systemReady = false;

const pkg = require('../package.json');
const ejs = require('ejs');

// Add setup route handler to app.js
const initSetupRouter = require('./api/routes/setup');
const initPublicRouter = require('./api/routes/public');

// Initialize app
const app = express();

// Setup template engine
app.set('views', path.join(__dirname, 'public-template'));
app.set('view engine', 'html');
app.engine('html', ejs.renderFile);

async function startApp() {
  try {
    // Set a maximum timeout for system initialization
    const MAX_INIT_TIME = 120000; // 2 minutes
    setTimeout(() => {
        if (!global.systemReady) {
            logger.warn('Forcing system ready state after timeout', null, FILENAME);
            global.systemReady = true;
        }
    }, MAX_INIT_TIME);

    // Load all configuration from config service
    const config = configService.get();
    logger.setLevel(config.logLevel || 'info', null, FILENAME);

    logger.info('Starting Certificate Manager...', null, FILENAME);

    // Check if config directory is writable
    try {
      const configDir = config.configDir || '/config';
      const testFile = path.join(configDir, '.write-test');

      fs.writeFileSync(testFile, 'test', 'utf8');
      fs.unlinkSync(testFile);
      logger.info(`Config directory ${configDir} is writable`, null, FILENAME);
    } catch (error) {
      logger.error(`Config directory is not writable: ${error.message}`, null, FILENAME);
      logger.error(`This may prevent certificates.json and other configuration files from being saved.`, null, FILENAME);
      logger.error(`Please check your Docker volume mounts and container permissions.`, null, FILENAME);
    }

    const logsDir = process.env.LOGS_DIR || '/logs';
    // Don't try to create the directory if it's a mounted volume
    if (!logsDir.startsWith('/logs') && !fs.existsSync(logsDir)) {
      try {
        fs.mkdirSync(logsDir, { recursive: true });
      } catch (error) {
        logger.warn(`Could not create logs directory ${logsDir}: ${error.message}`, null, FILENAME);
        // Continue execution - the app should still work if logs directory exists
      }
    }

    logger.info(`Using logs directory: ${logsDir}`, null, FILENAME);

    const activityService = new ActivityService(config);
    await activityService.init();

    // Initialize shared Docker service - create once and reuse
    const dockerService = DockerService;

    const openSSL = new OpenSSLWrapper();

    const npmIntegrationService = new NpmIntegrationService({
        configService: configService
    });

    // Initialize services
    const certificateManager = new CertificateManager(
      config.certPath,
      path.join(configService.configDir, 'certificates.json'),
      configService.configDir,
      openSSL,
      activityService
    );

    // Initialize the Deploy Service with the NPM integration service
    const deployService = new DeployService({
      certificateManager,
      dockerService,
      npmIntegrationService
    });

    // Initialize renewal service
    const renewalService = new RenewalService(certificateManager, {
      renewalSchedule: config.renewalSchedule,
      enableWatcher: config.enableFileWatch,
      disableRenewalCron: !config.enableAutoRenewalJob,
      checkOnStart: false
    });

    openSSL.setRenewalService(renewalService);

    // Record system startup
    await activityService.recordSystemActivity('startup', {
      version: pkg.version,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    });

    const logsService = new LogsService(logsDir);
    const fileSystemService = new FileSystemService(dockerService); // Pass dockerService to FileSystemService

    // Initialize user manager and auth middleware
    const userManager = new UserManager(config, activityService);
    await userManager.init();

    // Check if auth is disabled
    const authDisabled = process.env.DISABLE_AUTH === 'true' ||
      config.security?.disableAuth === true;

    // Only check for setup if auth is not disabled
    let setupNeeded = false;
    if (!authDisabled) {
      setupNeeded = await userManager.isSetupNeeded();
    }

    // Initialize auth middleware with correct settings
    const authMiddleware = new AuthMiddleware(config, userManager, activityService, {
      setupMode: setupNeeded
    });

    // Set up middleware
    app.use(express.static(path.join(__dirname, 'public')));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(path.join(__dirname, '..', 'public')));
    app.use(cookieParser());

    app.get('/setup', async (req, res) => {
      // Only allow access to setup if it's needed
      const setupNeeded = await userManager.isSetupNeeded();
      if (!setupNeeded) {
        return res.redirect('/');
      }

      res.render('setup', {
        version: pkg.version,
        noAuth: true
      });
    });

    // Add public API routes
    app.use('/api/public', initPublicRouter({
      configService,
      userManager,
      authMiddleware,
      pkg  // Pass the package info
    }));

    // Add setup API routes
    app.use('/api/setup', initSetupRouter({
      userManager,
      configService,
      activityService,
      authMiddleware
    }));

    app.get('/', (req, res, next) => {
      if (!global.systemReady) {
        // System not ready yet, show loading page
        return res.render('loading', {
          version: pkg.version
        });
      }
      // If system is ready, continue to the normal route handling
      next();
    });

    // Add auth login route before authentication middleware
    app.use('/api/auth', (req, res, next) => {
      // Only allow login and status endpoints without authentication
      if (req.path === '/login' || req.path === '/status') {
        return require('./api/routes/auth')({
          authMiddleware,
          userManager,
          configService,
          activityService
        })(req, res, next);
      }

      // For other auth routes, continue to authentication middleware
      next();
    });

    // Add login route
    app.get('/login', (req, res) => {
      // If in setup mode, redirect to setup
      if (authMiddleware.setupMode) {
        return res.redirect('/setup');
      }

      // If authentication is disabled, redirect to main page
      if (authMiddleware.isAuthDisabled()) {
        return res.redirect('/');
      }

      res.render('login', {
        version: pkg.version,
        noAuth: true
      });
    });

    // Apply authentication middleware with setup awareness
    app.use(authMiddleware.authenticate);

    // For the root route (after auth middleware)
    app.get('/', (req, res) => {
      res.render('index', {
        version: pkg.version,
        user: req.user || null
      });
    });

    // API routes
    app.use('/api', setupApi({
      certificateManager,
      openSSL,
      renewalService,
      configService,
      activityService,
      logsService,
      fileSystemService,
      dockerService,
      userManager,
      authMiddleware,
      npmIntegrationService,
      deployService
    }));

    // Serve frontend for any other route (already protected by auth middleware)
    app.get('*', (req, res) => {
      // Only serve index.html for non-API, non-file paths
      if (!req.path.startsWith('/api') && !req.path.includes('.')) {
        res.render('index', {
          version: pkg.version,
          user: req.user || null
        });
      } else {
        res.status(404).send('Not found');
      }
    });

    // Start HTTP server
    const httpServer = app.listen(config.port || 3000, async () => {
      logger.info(`Certificate Manager HTTP server listening on port ${config.port || 3000}`, null, FILENAME);
      logger.info(`OpenAPI documentation available at http://localhost:${config.port || 3000}/api/docs`, null, FILENAME);

      // Log configuration details
      logger.info(`Certificates directory: ${config.certPath}`, null, FILENAME);
      logger.info(`Auto-renewal: ${config.enableAutoRenewalJob ? 'enabled' : 'disabled'}`, null, FILENAME);
      logger.info(`Renewal schedule: ${config.renewalSchedule}`, null, FILENAME);
      logger.info(`File watcher: ${config.enableFileWatch ? 'enabled' : 'disabled'}`, null, FILENAME);

      // Start renewal service after server is up
      try {
        await renewalService.start();
        logger.info('Certificate renewal service started', null, FILENAME);
      } catch (error) {
        logger.error('Error starting certificate renewal service:', error, FILENAME);
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
          logger.info(`Certificate Manager HTTPS server listening on port ${config.httpsPort || 4443}`, null, FILENAME);
        });
      } catch (error) {
        logger.error('Failed to start HTTPS server:', error, FILENAME);
      }
    }

    // Handle global errors
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', err, FILENAME);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled rejection', reason, FILENAME);
    });

    global.systemReady = true;
    logger.info('System initialization complete, ready to serve requests', null, FILENAME);

  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

startApp();