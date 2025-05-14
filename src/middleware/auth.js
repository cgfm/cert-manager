/**
 * Authentication Middleware
 * Handles user authentication and session management
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const logger = require('../services/logger');

const FILENAME = 'middleware/auth.js';

class AuthMiddleware {
    /**
     * Create a new AuthMiddleware
     * @param {Object} config - Application configuration
     * @param {Object} userManager - User manager service
     * @param {Object} activityService - Activity service
     * @param {Object} options - Additional options
     * @param {boolean} options.setupMode - Whether the app is in setup mode
     */
    constructor(config, userManager, activityService = null, options = {}) {
        this.config = config;
        this.userManager = userManager;
        this.activityService = activityService;
        
        // Get JWT secret from config
        this.jwtSecret = config.security?.jwtSecret || 'your-default-jwt-secret';
        
        // Check if auth is globally disabled
        const isAuthDisabled = process.env.DISABLE_AUTH === 'true' || 
            this.config.security?.disableAuth === true;
        
        // If auth is disabled, also disable setup mode
        this.setupMode = isAuthDisabled ? false : (options.setupMode === true);
        
        // Auth is disabled if either global setting or setup mode is true
        this.authDisabled = isAuthDisabled;
        
        // Log the initial configuration
        logger.info('AuthMiddleware initialized', { 
            authDisabled: this.authDisabled,
            setupMode: this.setupMode,
            authDisabledByEnv: process.env.DISABLE_AUTH === 'true',
            authDisabledByConfig: this.config.security?.disableAuth === true
        }, FILENAME);
    }

    /**
     * Set setup mode status
     * @param {boolean} isSetupMode - Whether the app is in setup mode
     */
    setSetupMode(isSetupMode) {
        // Don't enable setup mode if auth is disabled
        if (process.env.DISABLE_AUTH === 'true' || this.config.security?.disableAuth === true) {
            const previousMode = this.setupMode;
            this.setupMode = false;
            
            if (previousMode !== this.setupMode) {
                logger.info('Attempted to set setup mode but auth is disabled. Setup mode remains disabled.', null, FILENAME);
            }
            return false;
        }
        
        // Otherwise set the requested mode
        const previousMode = this.setupMode;
        this.setupMode = isSetupMode === true;
        
        if (previousMode !== this.setupMode) {
            logger.info(`Setup mode changed: ${previousMode} → ${this.setupMode}`, null, FILENAME);
        }
        
        return this.setupMode;
    }

    /**
     * Get current setup mode status
     * @returns {boolean} Whether setup mode is active
     */
    getSetupMode() {
        return this.setupMode;
    }

    /**
     * Get whether authentication is disabled
     * @returns {boolean} Whether authentication is disabled
     */
    isAuthDisabled() {
        return this.authDisabled;
    }

    /**
     * Authenticate requests
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     * @param {Function} next - Express next function
     */
    authenticate = (req, res, next) => {
        // Skip authentication for these paths
        if (req.path.startsWith('/api/public/') || 
            req.path.startsWith('/api/setup/') ||
            req.path === '/api/auth/login' ||     // Allow login endpoint without auth
            req.path === '/api/auth/status' ||    // Allow status checks without auth
            req.path === '/login' ||
            req.path === '/setup' ||
            req.path.startsWith('/css/') ||
            req.path.startsWith('/js/') ||
            req.path.startsWith('/img/') ||
            req.path.startsWith('/fontawesome/') ||
            req.path.startsWith('/fonts/')) {
            logger.debug(`Skipping authentication for ${req.path}`, null, FILENAME);
            return next();
        }
        
        // Skip authentication if disabled
        if (this.authDisabled) {
            logger.debug('Authentication disabled, skipping authentication check', null, FILENAME);
            return next();
        }
        
        // In setup mode, redirect to setup page for most requests
        if (this.setupMode) {
            // Allow these paths without authentication in setup mode
            const allowedPaths = [
                '/setup',
                '/api/setup',
                '/api/filesystem', // Allow filesystem API for directory browsing in setup
                '/css/',
                '/fontawesome/',
                '/js/',
                '/img/',
                '/fonts/'
            ];
            
            // Check if the path starts with any of the allowed paths
            const isAllowedPath = allowedPaths.some(path => 
                req.path === path || req.path.startsWith(path + '/')
            );
            
            if (isAllowedPath) {
                return next();
            }
            
            // For API requests in setup mode, return a specific status code
            if (req.path.startsWith('/api/')) {
                logger.debug(`API request blocked in setup mode: ${req.path}`, null, FILENAME);
                return res.status(503).json({
                    success: false,
                    message: 'Setup required',
                    setupNeeded: true,
                    statusCode: 503
                });
            }
            
            // For all other requests, redirect to setup
            logger.debug(`Redirecting to setup: ${req.path}`, null, FILENAME);
            return res.redirect('/setup');
        }
        
        // Continue with normal authentication logic
        
        // Get token from header or cookie
        let token = null;
        let tokenSource = null;

        // Check Authorization header first
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.substring(7);
            tokenSource = 'header';
            logger.debug('Found token in Authorization header', null, FILENAME);
        }

        // If no token found in header, check cookies
        if (!token && req.cookies && req.cookies.authToken) {
            token = req.cookies.authToken;
            tokenSource = 'cookie';
            logger.debug('Found token in cookie', null, FILENAME);
        }

        // If no token found, redirect to login
        if (!token) {
            logger.debug(`No auth token found for ${req.path}, redirecting to login`, null, FILENAME);

            // For API requests, return 401
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required',
                    statusCode: 401
                });
            }

            // For HTML/non-API requests, redirect to login
            return res.redirect('/login');
        }

        // Choose authentication method based on token source and format
        if (tokenSource === 'header' && token.includes('.') && !token.includes('.ey')) {
            // Likely an API token (format: username.hash)
            return this.authenticateWithApiToken(token, req, res, next);
        } else {
            // Likely a JWT token
            return this.authenticateWithJwt(token, req, res, next);
        }
    };

    /**
     * Authenticate with JWT token (for browser sessions)
     * @param {string} token - JWT token
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     * @param {Function} next - Express next function
     */
    authenticateWithJwt = (token, req, res, next) => {
        try {
            const decoded = jwt.verify(token, this.jwtSecret);
            
            // Check if user exists and is not disabled
            const user = this.userManager.getUser(decoded.username);
            if (!user || user.disabled) {
                logger.warn('Token contains invalid or disabled user', { username: decoded.username }, FILENAME);
                return this.handleAuthFailure(req, res);
            }

            // Check if token was issued before password was last changed
            if (user.passwordChanged && decoded.iat < Math.floor(user.passwordChanged / 1000)) {
                logger.warn('Token was issued before password change, rejecting', { username: decoded.username }, FILENAME);
                return this.handleAuthFailure(req, res);
            }

            // Attach user to request
            req.user = user;
            req.authType = 'session';
            logger.debug(`User authenticated with JWT: ${user.username}`, null, FILENAME);
            
            return next();
        } catch (err) {
            logger.warn('Invalid JWT token', { error: err.message }, FILENAME);
            return this.handleAuthFailure(req, res);
        }
    };

    /**
     * Authenticate with API token
     * @param {string} token - API token
     * @param {Object} req - Express request
     * @param {Object} res - Express response
     * @param {Function} next - Express next function
     */
    authenticateWithApiToken = async (token, req, res, next) => {
        try {
            // Validate API token
            const result = await this.userManager.validateApiToken(token);
            if (!result) {
                logger.warn('Invalid API token', { path: req.path }, FILENAME);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid or expired API token',
                    statusCode: 401
                });
            }

            const { user, token: apiToken } = result;

            // Check if token has permission for the requested operation
            if (!this.checkTokenPermission(apiToken, req.method, req.path)) {
                logger.warn('API token lacks required permissions', {
                    path: req.path, 
                    method: req.method,
                    scopes: apiToken.scopes || []
                }, FILENAME);

                return res.status(403).json({
                    success: false,
                    message: 'Insufficient permissions for this operation',
                    statusCode: 403
                });
            }

            // Attach user and token information to request
            req.user = user;
            req.authType = 'api';
            req.apiToken = {
                id: apiToken.id,
                name: apiToken.name,
                scopes: apiToken.scopes || []
            };

            // Record API token usage
            if (this.activityService) {
                await this.activityService.recordActivity('api_access', {
                    tokenId: apiToken.id,
                    tokenName: apiToken.name,
                    path: req.path,
                    method: req.method
                }, user);
            }

            logger.debug(`API authenticated: ${user.username} using token "${apiToken.name}"`, {
                path: req.path,
                scopes: apiToken.scopes || []
            }, FILENAME);

            return next();
        } catch (error) {
            logger.error('API token authentication error', {
                error: error.message,
                path: req.path
            }, FILENAME);

            return res.status(500).json({
                success: false,
                message: 'Authentication error',
                error: error.message
            });
        }
    };

    /**
     * Check if the API token has sufficient permissions for the requested operation
     * @param {Object} token - API token object
     * @param {string} method - HTTP method (GET, POST, etc.)
     * @param {string} path - Request path
     * @returns {boolean} - Whether the token has permission
     */
    checkTokenPermission = (token, method, path) => {
        // If no scopes defined, deny access
        if (!token.scopes || !Array.isArray(token.scopes) || token.scopes.length === 0) {
            return false;
        }

        // If token has wildcard permission, allow all access
        if (token.scopes.includes('*')) {
            return true;
        }

        // Determine resource category and access type from path and method
        const category = this.getResourceCategory(path);
        const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
        const accessType = isWrite ? 'write' : 'read';

        // Check if token has the specific permission
        const requiredScope = `${category}:${accessType}`;
        const categoryWildcard = `${category}:*`;

        return token.scopes.includes(requiredScope) || token.scopes.includes(categoryWildcard);
    };

    /**
     * Determine resource category from request path
     * @param {string} path - Request path
     * @returns {string} - Resource category
     */
    getResourceCategory = (path) => {
        const normalizedPath = path.toLowerCase();

        if (normalizedPath.includes('/api/certificates')) {
            return 'certificates';
        } else if (normalizedPath.includes('/api/ca')) {
            return 'ca';
        } else if (normalizedPath.includes('/api/domains')) {
            return 'domains';
        } else if (normalizedPath.includes('/api/renewal')) {
            return 'renewal';
        } else if (normalizedPath.includes('/api/system')) {
            return 'system';
        } else if (normalizedPath.includes('/api/users') || normalizedPath.includes('/api/auth/users')) {
            return 'users';
        } else if (normalizedPath.includes('/api/settings')) {
            return 'settings';
        }

        // Default to 'system' for unknown paths
        return 'system';
    };

    /**
     * Handle authentication failure
     */
    handleAuthFailure = (req, res) => {
        // Clear invalid token
        res.clearCookie('authToken');

        // For API requests, return 401
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired authentication token',
                statusCode: 401
            });
        }

        // For web requests, redirect to login page
        return res.redirect('/login');
    };

    /**
     * Generate a JWT token for a user
     * @param {Object} user - User object
     * @returns {string} JWT token
     */
    generateToken = (user) => {
        return jwt.sign(
            {
                username: user.username,
                role: user.role
            },
            this.jwtSecret,
            { expiresIn: this.tokenExpiration }
        );
    };

    /**
     * Login handler
     */
    login = async (req, res) => {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Username and password required'
                });
            }

            // Authenticate user
            const user = await this.userManager.authenticate(username, password);
            if (!user) {
                logger.warn('Failed login attempt', { username, ip: req.ip }, FILENAME);
                return res.status(401).json({
                    success: false,
                    message: 'Invalid username or password'
                });
            }

            if (user.disabled) {
                logger.warn('Login attempt for disabled account', { username, ip: req.ip }, FILENAME);
                return res.status(401).json({
                    success: false,
                    message: 'Account is disabled'
                });
            }

            // Generate token
            const token = this.generateToken(user);

            // Set cookie
            res.cookie('authToken', token, {
                httpOnly: true,
                secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
                maxAge: 8 * 60 * 60 * 1000 // 8 hours
            });

            // Update last login time
            this.userManager.updateLastLogin(username, req.ip);

            // Record login activity
            if (this.activityService) {
                await this.activityService.recordUserActivity('login', {
                    ...user,
                    lastLoginIp: req.ip
                });
            }

            logger.info('User logged in successfully', { username, ip: req.ip }, FILENAME);

            return res.json({
                success: true,
                message: 'Login successful',
                user: {
                    username: user.username,
                    name: user.name,
                    role: user.role
                }
            });
        } catch (error) {
            logger.error('Login error', { error: error.message }, FILENAME);
            return res.status(500).json({
                success: false,
                message: 'Authentication error'
            });
        }
    };

    /**
     * Logout handler
     */
    logout = (req, res) => {
        // Record logout activity
        if (this.activityService && req.user) {
            this.activityService.recordUserActivity('logout', req.user);
        }

        res.clearCookie('authToken');

        logger.info('User logged out', { user: req.user?.username, ip: req.ip }, FILENAME);

        return res.json({
            success: true,
            message: 'Logout successful'
        });
    };

    /**
     * Get the JWT secret
     * @returns {string} JWT secret
     */
    getJwtSecret() {
        return this.jwtSecret;
    }
}

module.exports = AuthMiddleware;