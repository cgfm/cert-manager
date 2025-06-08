/**
 * @fileoverview Nginx Proxy Manager Integration Service - Handles interactions with NPM instances
 * @module services/npm-integration-service
 * @requires axios
 * @requires https
 * @requires child_process
 * @requires ./logger
 * @author Certificate Manager
 */

const axios = require('axios');
const logger = require('./logger');
const https = require('https');
const { execSync } = require('child_process');

const FILENAME = 'services/npm-integration-service.js';

/**
 * Nginx Proxy Manager Integration Service for managing certificates and proxy hosts.
 * Provides methods to interact with NPM API for certificate upload and proxy configuration.
 */
class NpmIntegrationService {
    /**
     * Create a new NPM Integration Service instance
     * @param {Object} [options={}] - Service configuration options
     * @param {Object} options.configService - Configuration service instance for accessing NPM settings
     */
    constructor(options = {}) {
        this.configService = options.configService;
        
        // Initialize axios instance with default config
        this.axios = axios.create({
            timeout: 10000
        });
        
        try {
            if (!this.configService) {
                logger.warn('Config service not available, using default settings', null, FILENAME);
                return;
            }
            
            const deploymentSettings = this.configService.get().deployment || {};
            const npmSettings = deploymentSettings.nginxProxyManager || {};
            
            if (Object.keys(npmSettings).length > 0) {
                if(logger.isLevelEnabled('fine', FILENAME)) {
                    let logNpmSettings = {...npmSettings};
                    if (logNpmSettings.password) logNpmSettings.password = '********'; 
                    logger.debug('NPM settings loaded from config service', logNpmSettings, FILENAME);
                 } else {
                    logger.debug('Loading NPM settings from config service', null, FILENAME);
                 }
                this.settings = {
                    ...this.settings,
                    ...npmSettings
                };
            }
        } catch (error) {
            logger.error(`Error initializing NPM settings from config: ${error.message}`, error, FILENAME);
        }

        logger.info('NPM Integration Service initialized', null, FILENAME);
    }

    /**
     * Get current settings
     * @returns {Object} Current NPM settings
     */
    getSettings() {
        return this.settings;
    }
    
    /**
     * Update settings
     * @param {Object} newSettings - New settings to merge with existing settings
     */
    updateSettings(newSettings) {
        if (!newSettings) return;
        
        this.settings = {
            ...this.settings,
            ...newSettings
        };
        
        logger.debug('NPM Integration Service settings updated', this.settings, FILENAME);
    }

    /**
     * Build NPM API URL from settings
     * @param {Object} npmSettings - NPM settings object
     * @returns {string|null} Full API URL or null if settings invalid
     */
    buildApiUrl(npmSettings) {
        if (!npmSettings || !npmSettings.host) {
            return null;
        }
        
        const protocol = npmSettings.useHttps ? 'https' : 'http';
        const port = npmSettings.port || (npmSettings.useHttps ? 443 : 80);
        
        // Build base URL
        let baseUrl = `${protocol}://${npmSettings.host}`;
        
        // Add port if it's not the default for the protocol
        if ((npmSettings.useHttps && port !== 443) || (!npmSettings.useHttps && port !== 80)) {
            baseUrl += `:${port}`;
        }
        
        // Ensure URL ends with /api/
        let apiUrl = baseUrl;
        if (!apiUrl.endsWith('/')) apiUrl += '/';
        if (!apiUrl.endsWith('api/')) apiUrl += 'api/';
        
        return apiUrl;
    }
    
    /**
     * Create request config with appropriate SSL settings
     * @param {Object} npmSettings - NPM settings
     * @param {Object} additionalConfig - Additional axios config
     * @returns {Object} Axios request config
     */
    createRequestConfig(npmSettings, additionalConfig = {}) {
        const config = { ...additionalConfig };
        
        // Add SSL configuration if needed
        if (npmSettings.useHttps && npmSettings.rejectUnauthorized === false) {
            config.httpsAgent = new https.Agent({
                rejectUnauthorized: false
            });
        }
        
        // Add authentication token if available
        if (npmSettings.accessToken) {
            config.headers = {
                ...config.headers,
                'Authorization': `Bearer ${npmSettings.accessToken}`
            };
        }
        
        return config;
    }
    
    /**
     * Check if token is expired or invalid based on error response
     * @param {Object} error - Error response from API
     * @returns {boolean} True if error indicates token expiration
     */
    isTokenExpiredError(error) {
        // Check for NPM's specific token expiration error messages
        if (error?.response?.data?.error?.message === 'Token has expired' ||
            error?.response?.data?.error?.code === 401) {
            return true;
        }
        
        // Check for TokenExpiredError in debug info
        if (error?.response?.data?.debug?.previous?.name === 'TokenExpiredError') {
            return true;
        }
        
        // Check for standard 401 unauthorized
        if (error?.response?.status === 401) {
            return true;
        }
        
        return false;
    }

    /**
     * Check if token is likely expired
     * @param {Object} npmSettings - NPM settings
     * @returns {boolean} True if token is expired or missing
     */
    isTokenExpired(npmSettings) {
        if (!npmSettings.accessToken || !npmSettings.tokenExpiry) {
            return true;
        }
        
        try {
            const tokenExpiry = new Date(npmSettings.tokenExpiry);
            const now = new Date();
            
            // Consider token expired if it expires in less than an hour
            const expiryBuffer = 60 * 60 * 1000; // 1 hour in milliseconds
            return tokenExpiry.getTime() - now.getTime() < expiryBuffer;
        } catch (error) {
            logger.error(`Error checking token expiry: ${error.message}`, error, FILENAME);
            return true;
        }
    }
    
    /**
     * Test connection to NPM instance
     * @param {Object} [customSettings=null] - Optional custom settings to use instead of global settings
     * @returns {Promise<Object>} Connection test result
     */
    async testConnection(customSettings = null) {
        try {
            // Get settings - use custom or global
            const npmSettings = customSettings || this.getSettings();
            
            if (!npmSettings) {
                logger.warn('NPM settings not configured', null, FILENAME);
                return {
                    success: false,
                    message: 'NPM settings not configured'
                };
            }
            
            logger.debug(`Testing NPM connection to ${npmSettings.host}:${npmSettings.port}`, null, FILENAME);
            
            // Build API URL
            const apiUrl = this.buildApiUrl(npmSettings);
            
            if (!apiUrl) {
                logger.warn('Invalid NPM settings - could not build API URL', null, FILENAME);
                return {
                    success: false,
                    message: 'Invalid NPM settings - could not build API URL'
                };
            }
            
            // Try different methods to test connection
            
            // First try: Standard API call with axios
            try {
                const config = this.createRequestConfig(npmSettings, { 
                    validateStatus: null 
                });
                
                const response = await this.axios.get(`${apiUrl}tokens`, config);
                
                // NPM returns 401 when unauthorized, which means the API is reachable
                if (response.status === 401) {
                    logger.debug('NPM API is reachable (401 unauthorized)', response, FILENAME);
                    return {
                        success: true,
                        message: 'API is reachable'
                    };
                } else if (response.status === 200) {
                    logger.debug('NPM API is reachable and returning 200', null, FILENAME);
                    return {
                        success: true,
                        message: 'API is reachable and responding'
                    };
                } else if (response.status === 400) {
                    // 400 Bad Request can be valid for some NPM API versions or configurations
                    logger.debug('NPM API is reachable (400 Bad Request)', response.data, FILENAME);
                    return {
                        success: true,
                        message: 'API is reachable'
                    };
                } else {
                    logger.warn(`Unexpected status code from NPM API: ${response.status}`, response, FILENAME);
                    
                    // Extract error message from response if available
                    let errorMessage = `Unexpected response from API: ${response.status}`;
                    if (response.data?.error?.message) {
                        errorMessage += ` - ${response.data.error.message}`;
                    }
                    
                    return {
                        success: false,
                        message: errorMessage,
                        statusCode: response.status
                    };
                }
            } catch (axiosError) {
                logger.debug(`Axios test failed: ${axiosError.message}`, axiosError, FILENAME);
                
                // Check if there's a response with a 400 status (which can be okay for NPM)
                if (axiosError.response && axiosError.response.status === 400) {
                    logger.debug('NPM API is reachable (400 Bad Request via error handler)', axiosError.response.data, FILENAME);
                    return {
                        success: true,
                        message: 'API is reachable'
                    };
                }
                
                // If axios failed, try curl for HTTPS connections
                if (npmSettings.useHttps) {
                    try {
                        logger.debug('Trying curl method for HTTPS connection', null, FILENAME);
                        
                        const curlCommand = `curl -s -k -m 10 -o /dev/null -w "%{http_code}" ${apiUrl}tokens`;
                        logger.debug(`Executing: ${curlCommand}`, null, FILENAME);
                        
                        const result = execSync(curlCommand, { timeout: 10000, windowsHide: true });
                        const statusCode = result.toString().trim();
                        
                        logger.debug(`Curl response status: ${statusCode}`, null, FILENAME);
                        
                        if (statusCode === '401' || statusCode === '200' || statusCode === '400') {
                            return {
                                success: true,
                                message: 'API is reachable (verified with curl)'
                            };
                        } else {
                            return {
                                success: false,
                                message: `Unexpected response from API: ${statusCode}`
                            };
                        }
                    } catch (curlError) {
                        logger.debug(`Curl test failed: ${curlError.message}`, curlError, FILENAME);
                    }
                }
                
                // If all methods failed, return detailed error
                return {
                    success: false,
                    message: `Connection failed: ${axiosError.message}`,
                    error: axiosError.message
                };
            }
        } catch (error) {
            logger.error(`Error testing NPM connection: ${error.message}`, error, FILENAME);
            return {
                success: false,
                message: `Error testing connection: ${error.message}`,
                error: error.message
            };
        }
    }
    
    /**
     * Get authentication token from NPM
     * @param {Object} [customSettings=null] - Optional custom settings to use instead of global settings
     * @returns {Promise<Object>} Authentication result
     */
    async getAuthToken(customSettings = null) {
        try {
            // Get settings - use custom or global
            const npmSettings = customSettings || this.getSettings();
            
            if (!npmSettings) {
                return {
                    success: false,
                    message: 'NPM settings not configured'
                };
            }
            
            if (!npmSettings.username || !npmSettings.password) {
                return {
                    success: false,
                    message: 'NPM credentials not configured'
                };
            }
            
            logger.debug(`Getting NPM auth token for ${npmSettings.username}`, null, FILENAME);
            
            // Build API URL
            const apiUrl = this.buildApiUrl(npmSettings);
            
            if (!apiUrl) {
                return {
                    success: false,
                    message: 'Invalid NPM settings - could not build API URL'
                };
            }
            
            // Try to get token
            try {
                const config = this.createRequestConfig(npmSettings);
                
                // Add more detailed logging about the request
                logger.debug(`Making authentication request to ${apiUrl}tokens`, {
                    host: npmSettings.host,
                    port: npmSettings.port,
                    username: npmSettings.username,
                    useHttps: npmSettings.useHttps,
                    rejectUnauthorized: npmSettings.rejectUnauthorized
                }, FILENAME);
                
                const response = await this.axios.post(`${apiUrl}tokens`, {
                    identity: npmSettings.username,
                    secret: npmSettings.password
                }, config);
                
                if (response.data && response.data.token) {
                    logger.debug('Successfully obtained NPM token', null, FILENAME);
                    
                    // Set token expiry - NPM tokens typically expire in 1 day
                    // So we'll set it to 23 hours to be safe
                    const tokenExpiry = new Date();
                    tokenExpiry.setHours(tokenExpiry.getHours() + 23);
                    
                    // Update settings with new token
                    if (this.configService && !customSettings) {
                        const deploymentSettings = this.configService.getDeploymentSettings() || {};
                        
                        deploymentSettings.nginxProxyManager = {
                            ...(deploymentSettings.nginxProxyManager || {}),
                            accessToken: response.data.token,
                            refreshToken: response.data.refresh_token || '',
                            tokenExpiry: tokenExpiry.toISOString()
                        };
                        
                        await this.configService.updateDeploymentSettings(deploymentSettings);
                        logger.info('NPM token saved to settings', null, FILENAME);
                    }
                    
                    return {
                        success: true,
                        token: response.data.token,
                        refreshToken: response.data.refresh_token,
                        tokenExpiry: tokenExpiry.toISOString(),
                        message: 'Authentication successful'
                    };
                } else {
                    logger.warn('NPM API response missing token', response.data, FILENAME);
                    return {
                        success: false,
                        message: 'API response did not contain token'
                    };
                }
            } catch (error) {
                // Handle specific error cases with more detailed logging
                if (error.response) {
                    logger.debug(`NPM auth error response: ${error.response.status}`, error.response.data, FILENAME);
                    
                    if (error.response.status === 401 || error.response.status === 403) {
                        logger.warn('NPM authentication failed: Invalid credentials', null, FILENAME);
                        
                        // Check if error has detailed message and log it
                        const errorMessage = error.response.data?.error?.message || 
                                           error.response.data?.message || 
                                           'Invalid credentials';
                        
                        // Credentials might have changed on the NPM server
                        return {
                            success: false,
                            message: `Invalid credentials: ${errorMessage}`,
                            needsReconfiguration: true
                        };
                    }
                }
                
                logger.error(`NPM authentication error: ${error.message}`, error, FILENAME);
                return {
                    success: false,
                    message: `Authentication error: ${error.message}`
                };
            }
        } catch (error) {
            logger.error(`Error getting NPM token: ${error.message}`, error, FILENAME);
            return {
                success: false,
                message: `Error getting token: ${error.message}`
            };
        }
    }
    
    /**
     * Ensure we have a valid token for API requests
     * @param {Object} [npmSettings=null] - Optional settings to use
     * @returns {Promise<Object>} Result with token status
     */
    async ensureValidToken(npmSettings = null) {
        try {
            const settings = npmSettings || this.getSettings();
            
            if (!settings) {
                return {
                    success: false,
                    message: 'NPM settings not configured'
                };
            }
            
            // Check if token exists and is not expired
            if (settings.accessToken && !this.isTokenExpired(settings)) {
                return {
                    success: true,
                    message: 'Valid token available',
                    token: settings.accessToken
                };
            }
            
            // No valid token, try to get a new one
            logger.debug('No valid NPM token, requesting new one', null, FILENAME);
            const authResult = await this.getAuthToken(settings);
            
            return authResult;
        } catch (error) {
            logger.error(`Error ensuring valid token: ${error.message}`, error, FILENAME);
            return {
                success: false,
                message: `Error ensuring valid token: ${error.message}`,
                error: error.message
            };
        }
    }
    
    /**
     * Validate an existing token
     * @param {Object} [customSettings=null] - Optional custom settings
     * @returns {Promise<Object>} Validation result
     */
    async validateToken(customSettings = null) {
        try {
            const npmSettings = customSettings || this.getSettings();
            
            if (!npmSettings) {
                return {
                    success: false,
                    message: 'NPM settings not configured'
                };
            }
            
            if (!npmSettings.accessToken) {
                return {
                    success: false,
                    message: 'No token available to validate'
                };
            }
            
            // Build API URL
            const apiUrl = this.buildApiUrl(npmSettings);
            
            if (!apiUrl) {
                return {
                    success: false,
                    message: 'Invalid NPM settings - could not build API URL'
                };
            }
            
            logger.debug('Validating NPM token', null, FILENAME);
            
            // Try validating token with axios
            try {
                const config = this.createRequestConfig(npmSettings);
                
                const response = await this.axios.get(`${apiUrl}users/me`, config);
                
                if (response.data && response.data.id) {
                    logger.debug('NPM token is valid', null, FILENAME);
                    return {
                        success: true,
                        valid: true,
                        user: {
                            id: response.data.id,
                            name: response.data.name,
                            email: response.data.email
                        },
                        message: 'Token is valid'
                    };
                } else {
                    logger.warn('NPM API response invalid user data', response.data, FILENAME);
                    return {
                        success: true,
                        valid: false,
                        message: 'Invalid user data in response'
                    };
                }
            } catch (axiosError) {
                logger.debug(`Axios token validation failed: ${axiosError.message}`, axiosError, FILENAME);
                
                // Try curl for HTTPS connections if axios failed
                if (npmSettings.useHttps) {
                    try {
                        logger.debug('Trying curl for token validation', null, FILENAME);
                        
                        const curlCommand = `curl -s -k ${apiUrl}users/me -H "Authorization: Bearer ${npmSettings.accessToken}"`;
                        logger.debug('Executing curl validation command', null, FILENAME);
                        
                        const result = execSync(curlCommand, { timeout: 10000, windowsHide: true });
                        const responseText = result.toString();
                        
                        try {
                            const userData = JSON.parse(responseText);
                            
                            if (userData && userData.id) {
                                logger.debug('NPM token is valid (via curl)', null, FILENAME);
                                return {
                                    success: true,
                                    valid: true,
                                    user: {
                                        id: userData.id,
                                        name: userData.name,
                                        email: userData.email
                                    },
                                    message: 'Token is valid (verified with curl)'
                                };
                            } else {
                                logger.warn('NPM API response invalid user data (curl)', userData, FILENAME);
                                return {
                                    success: true,
                                    valid: false,
                                    message: 'Invalid user data in response'
                                };
                            }
                        } catch (jsonError) {
                            logger.debug(`Failed to parse user data: ${jsonError.message}`, jsonError, FILENAME);
                            return {
                                success: true,
                                valid: false,
                                message: 'Failed to parse API response'
                            };
                        }
                    } catch (curlError) {
                        logger.debug(`Curl validation failed: ${curlError.message}`, curlError, FILENAME);
                    }
                }
                
                // If validation failed with a 401, token is invalid
                if (axiosError.response && axiosError.response.status === 401) {
                    return {
                        success: true,
                        valid: false,
                        message: 'Token is invalid'
                    };
                }
                
                return {
                    success: false,
                    message: `Error validating token: ${axiosError.message}`,
                    error: axiosError.message
                };
            }
        } catch (error) {
            logger.error(`Error validating token: ${error.message}`, error, FILENAME);
            return {
                success: false,
                message: `Error validating token: ${error.message}`,
                error: error.message
            };
        }
    }
    
    /**
     * Get certificates from NPM
     * @param {Object} [customSettings=null] - Optional custom settings
     * @returns {Promise<Object>} Certificates fetch result
     */
    async getCertificates(customSettings = null) {
        try {
            const npmSettings = customSettings || this.getSettings();
            
            if (!npmSettings) {
                return {
                    success: false,
                    message: 'NPM settings not configured'
                };
            }
            
            // Check if token is already expired before making the API call
            if (this.isTokenExpired(npmSettings)) {
                logger.debug('NPM token appears expired, attempting to refresh', null, FILENAME);
                const tokenResult = await this.getAuthToken(npmSettings);
                
                if (!tokenResult.success) {
                    // Check if credentials need to be updated in the UI
                    if (tokenResult.needsReconfiguration) {
                        return {
                            success: false,
                            message: tokenResult.message,
                            needsReconfiguration: true
                        };
                    }
                    
                    return {
                        success: false,
                        message: `Failed to refresh expired token: ${tokenResult.message}`
                    };
                }
                
                // Update settings with new token for this request
                npmSettings.accessToken = tokenResult.token;
            }
            
            // Build API URL
            const apiUrl = this.buildApiUrl(npmSettings);
            
            if (!apiUrl) {
                return {
                    success: false,
                    message: 'Invalid NPM settings - could not build API URL'
                };
            }
            
            logger.debug('Fetching NPM certificates', null, FILENAME);
            
            // Try getting certificates with axios
            try {
                const config = this.createRequestConfig(npmSettings);
                
                // Add more detailed logging about the request
                logger.debug(`Making certificate request to ${apiUrl}nginx/certificates`, {
                    useHttps: npmSettings.useHttps,
                    rejectUnauthorized: npmSettings.rejectUnauthorized
                }, FILENAME);
                
                // NPM API has "nginx/certificates" endpoint for certificates
                const response = await this.axios.get(`${apiUrl}nginx/certificates`, config);
                logger.debug('NPM API response received', response.data, FILENAME);

                if (Array.isArray(response.data)) {
                    logger.debug(`Successfully fetched ${response.data.length} NPM certificates`, null, FILENAME);
                    return {
                        success: true,
                        certificates: response.data,
                        message: `Retrieved ${response.data.length} certificates`
                    };
                } else {
                    logger.warn('NPM API response not an array', response.data, FILENAME);
                    return {
                        success: false,
                        message: 'Invalid API response format'
                    };
                }
            } catch (axiosError) {
                logger.debug(`Axios certificates fetch failed: ${axiosError.message}`, axiosError, FILENAME);
                
                // Check for token expiration errors
                if (this.isTokenExpiredError(axiosError)) {
                    logger.debug('Token expired error detected, refreshing token', null, FILENAME);
                    
                    // Force refresh token
                    const newTokenResult = await this.getAuthToken(npmSettings);
                    
                    if (!newTokenResult.success) {
                        // Check if credentials need to be updated in the UI
                        if (newTokenResult.needsReconfiguration) {
                            return {
                                success: false,
                                message: "Your NPM credentials appear to be invalid or have changed. Please update them in the settings.",
                                needsReconfiguration: true
                            };
                        }
                        
                        logger.error('Failed to refresh token', newTokenResult, FILENAME);
                        return {
                            success: false,
                            message: `Failed to refresh token: ${newTokenResult.message}`
                        };
                    }
                    
                    // If we got a new token, try fetching certificates again with the new token
                    logger.debug('Successfully refreshed token, retrying certificate fetch', null, FILENAME);
                    
                    try {
                        // Update settings with the new token for this request
                        const settingsWithNewToken = { 
                            ...npmSettings, 
                            accessToken: newTokenResult.token 
                        };
                        const configWithNewToken = this.createRequestConfig(settingsWithNewToken);
                        
                        const retryResponse = await this.axios.get(`${apiUrl}nginx/certificates`, configWithNewToken);
                        logger.debug('NPM API response received after token refresh', retryResponse.data, FILENAME);

                        if (Array.isArray(retryResponse.data)) {
                            logger.debug(`Successfully fetched ${retryResponse.data.length} NPM certificates after token refresh`, null, FILENAME);
                            return {
                                success: true,
                                certificates: retryResponse.data,
                                message: `Retrieved ${retryResponse.data.length} certificates after token refresh`
                            };
                        } else {
                            logger.warn('NPM API response not an array after token refresh', retryResponse.data, FILENAME);
                            return {
                                success: false,
                                message: 'Invalid API response format after token refresh'
                            };
                        }
                    } catch (retryError) {
                        logger.error(`Certificate fetch failed after token refresh: ${retryError.message}`, retryError, FILENAME);
                        return {
                            success: false,
                            message: `Failed to fetch certificates after token refresh: ${retryError.message}`
                        };
                    }
                }
                
                // Try curl fallback for HTTPS connections
                if (npmSettings.useHttps) {
                    try {
                        logger.debug('Trying curl for certificate fetch', null, FILENAME);
                        
                        const curlCommand = `curl -s -k ${apiUrl}nginx/certificates -H "Authorization: Bearer ${npmSettings.accessToken}"`;
                        logger.debug('Executing curl certificates command', null, FILENAME);
                        
                        const result = execSync(curlCommand, { timeout: 10000, windowsHide: true });
                        const responseText = result.toString();
                        
                        try {
                            const certificates = JSON.parse(responseText);
                            
                            // Check if response contains error about expired token
                            if (certificates?.error?.message === 'Token has expired') {
                                logger.debug('Token expired error detected in curl response', null, FILENAME);
                                
                                // Force refresh token and retry
                                const curlTokenResult = await this.getAuthToken(npmSettings);
                                
                                if (curlTokenResult.success) {
                                    // Try again with new token
                                    logger.debug('Successfully refreshed token, retrying curl certificate fetch', null, FILENAME);
                                    
                                    const newTokenCurlCommand = `curl -s -k ${apiUrl}nginx/certificates -H "Authorization: Bearer ${curlTokenResult.token}"`;
                                    const newTokenResult = execSync(newTokenCurlCommand, { timeout: 10000, windowsHide: true });
                                    const newTokenResponseText = newTokenResult.toString();
                                    
                                    try {
                                        const newCertificates = JSON.parse(newTokenResponseText);
                                        
                                        if (Array.isArray(newCertificates)) {
                                            logger.debug(`Successfully fetched ${newCertificates.length} NPM certificates via curl after token refresh`, null, FILENAME);
                                            return {
                                                success: true,
                                                certificates: newCertificates,
                                                message: `Retrieved ${newCertificates.length} certificates via curl after token refresh`
                                            };
                                        }
                                    } catch (newJsonError) {
                                        logger.debug(`Failed to parse certificates after token refresh: ${newJsonError.message}`, newJsonError, FILENAME);
                                    }
                                }
                            } else if (Array.isArray(certificates)) {
                                logger.debug(`Successfully fetched ${certificates.length} NPM certificates (via curl)`, null, FILENAME);
                                return {
                                    success: true,
                                    certificates: certificates,
                                    message: `Retrieved ${certificates.length} certificates (via curl)`
                                };
                            } else {
                                logger.warn('NPM API response not an array (curl)', certificates, FILENAME);
                                return {
                                    success: false,
                                    message: 'Invalid API response format'
                                };
                            }
                        } catch (jsonError) {
                            logger.debug(`Failed to parse certificates: ${jsonError.message}`, jsonError, FILENAME);
                            return {
                                success: false,
                                message: 'Failed to parse API response'
                            };
                        }
                    } catch (curlError) {
                        logger.debug(`Curl certificates fetch failed: ${curlError.message}`, curlError, FILENAME);
                    }
                }
                
                return {
                    success: false,
                    message: `Failed to fetch certificates: ${axiosError.message}`
                };
            }
        } catch (error) {
            logger.error(`Error fetching NPM certificates: ${error.message}`, error, FILENAME);
            return {
                success: false,
                message: `Error fetching certificates: ${error.message}`
            };
        }
    }
    
    /**
     * Update a certificate in NPM
     * @param {string} certId - NPM certificate ID
     * @param {Object} certData - Certificate data with key, cert, chain
     * @param {Object} [customSettings=null] - Optional custom settings
     * @returns {Promise<Object>} Update result
     */
    async updateCertificate(certId, certData, customSettings = null) {
        try {
            if (!certId) {
                return {
                    success: false,
                    message: 'Certificate ID is required'
                };
            }
            
            if (!certData || !certData.certificate || !certData.key) {
                return {
                    success: false,
                    message: 'Certificate and key data are required'
                };
            }
            
            // First ensure we have a valid token
            const tokenResult = await this.ensureValidToken(customSettings);
            
            if (!tokenResult.success) {
                return {
                    success: false,
                    message: `Failed to get valid token: ${tokenResult.message}`
                };
            }
            
            const npmSettings = customSettings || this.getSettings();
            
            // Build API URL
            const apiUrl = this.buildApiUrl(npmSettings);
            
            if (!apiUrl) {
                return {
                    success: false,
                    message: 'Invalid NPM settings - could not build API URL'
                };
            }
            
            logger.debug(`Updating NPM certificate ID: ${certId}`, null, FILENAME);
            
            // Prepare certificate data for update
            const updateData = {
                certificate: certData.certificate,
                key: certData.key
            };
            
            // Add chain if provided
            if (certData.chain) {
                updateData.chain = certData.chain;
            }
            
            // Try updating certificate with axios
            try {
                const config = this.createRequestConfig(npmSettings);
                
                // NPM API has "nginx/certificates/{id}" endpoint for certificate updates
                const response = await this.axios.put(`${apiUrl}nginx/certificates/${certId}`, updateData, config);
                
                if (response.data && response.data.id === parseInt(certId)) {
                    logger.debug(`Successfully updated NPM certificate ID: ${certId}`, null, FILENAME);
                    return {
                        success: true,
                        certificate: response.data,
                        message: 'Certificate updated successfully'
                    };
                } else {
                    logger.warn('NPM API response invalid after update', response.data, FILENAME);
                    return {
                        success: false,
                        message: 'Invalid API response after update'
                    };
                }
            } catch (axiosError) {
                logger.debug(`Axios certificate update failed: ${axiosError.message}`, axiosError, FILENAME);
                
                // Try curl for HTTPS connections if axios failed
                if (npmSettings.useHttps) {
                    try {
                        logger.debug('Trying curl for certificate update', null, FILENAME);
                        
                        // Prepare data for curl
                        const jsonData = JSON.stringify(updateData).replace(/"/g, '\\"');
                        
                        const curlCommand = `curl -s -k -X PUT ${apiUrl}nginx/certificates/${certId} -H "Content-Type: application/json" -H "Authorization: Bearer ${npmSettings.accessToken}" -d "${jsonData}"`;
                        logger.debug('Executing curl update command', null, FILENAME);
                        
                        const result = execSync(curlCommand, { timeout: 20000, windowsHide: true });
                        const responseText = result.toString();
                        
                        try {
                            const updatedCert = JSON.parse(responseText);
                            
                            if (updatedCert && updatedCert.id === parseInt(certId)) {
                                logger.debug(`Successfully updated NPM certificate ID: ${certId} (via curl)`, null, FILENAME);
                                return {
                                    success: true,
                                    certificate: updatedCert,
                                    message: 'Certificate updated successfully (via curl)'
                                };
                            } else {
                                logger.warn('NPM API response invalid after update (curl)', updatedCert, FILENAME);
                                return {
                                    success: false,
                                    message: 'Invalid API response after update'
                                };
                            }
                        } catch (jsonError) {
                            logger.debug(`Failed to parse update response: ${jsonError.message}`, jsonError, FILENAME);
                            return {
                                success: false,
                                message: 'Failed to parse API response after update'
                            };
                        }
                    } catch (curlError) {
                        logger.debug(`Curl certificate update failed: ${curlError.message}`, curlError, FILENAME);
                    }
                }
                
                // If specific authentication error, try to refresh token and retry
                if (axiosError.response && axiosError.response.status === 401) {
                    logger.debug('Token expired, attempting to refresh for update', null, FILENAME);
                    
                    // Try to get a new token
                    const newTokenResult = await this.getAuthToken(npmSettings);
                    
                    if (newTokenResult.success) {
                        // If we got a new token, try updating certificate again with the new token
                        logger.debug('Successfully refreshed token, retrying certificate update', null, FILENAME);
                        
                        try {
                            // Update settings with the new token for this request
                            const settingsWithNewToken = { ...npmSettings, accessToken: newTokenResult.token };
                            const configWithNewToken = this.createRequestConfig(settingsWithNewToken);
                            
                            const retryResponse = await this.axios.put(`${apiUrl}nginx/certificates/${certId}`, updateData, configWithNewToken);
                            
                            if (retryResponse.data && retryResponse.data.id === parseInt(certId)) {
                                logger.debug(`Successfully updated NPM certificate ID: ${certId} after token refresh`, null, FILENAME);
                                return {
                                    success: true,
                                    certificate: retryResponse.data,
                                    message: 'Certificate updated successfully after token refresh'
                                };
                            } else {
                                logger.warn('NPM API response invalid after update with new token', retryResponse.data, FILENAME);
                                return {
                                    success: false,
                                    message: 'Invalid API response after update with new token'
                                };
                            }
                        } catch (retryError) {
                            logger.error(`Certificate update failed after token refresh: ${retryError.message}`, retryError, FILENAME);
                            return {
                                success: false,
                                message: `Failed to update certificate after token refresh: ${retryError.message}`,
                                error: retryError.message
                            };
                        }
                    } else {
                        logger.error('Failed to refresh token for update', null, FILENAME);
                        return {
                            success: false,
                            message: `Failed to refresh token for update: ${newTokenResult.message}`
                        };
                    }
                }
                
                return {
                    success: false,
                    message: `Failed to update certificate: ${axiosError.message}`,
                    error: axiosError.message
                };
            }
        } catch (error) {
            logger.error(`Error updating NPM certificate: ${error.message}`, error, FILENAME);
            return {
                success: false,
                message: `Error updating certificate: ${error.message}`,
                error: error.message
            };
        }
    }
}

module.exports = NpmIntegrationService;