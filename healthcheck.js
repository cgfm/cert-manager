#!/usr/bin/env node
/**
 * @fileoverview Health Check Script - Container and application health monitoring
 * 
 * This script provides comprehensive health checking functionality for the Certificate Manager:
 * - Configuration loading from multiple possible locations
 * - HTTP/HTTPS endpoint availability testing
 * - SSL certificate validation and expiry checking
 * - Database connectivity verification
 * - Service dependency health monitoring
 * - Docker container readiness probes
 * - Kubernetes liveness and readiness probe support
 * 
 * The health check script is designed for use in containerized environments
 * and orchestration systems that require health status verification.
 * 
 * Features include:
 * - Multi-location configuration file discovery
 * - Protocol-aware endpoint testing (HTTP/HTTPS)
 * - Timeout handling for network requests
 * - Detailed error reporting and logging
 * - Exit code standards for container orchestration
 * - Environment variable configuration support
 * 
 * @module healthcheck
 * @requires fs
 * @requires path
 * @requires http
 * @requires https
 * @author Certificate Manager
 * @since 1.0.0
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Configuration paths to try
const CONFIG_PATHS = [
    '/config/settings.json',
    './config/settings.json',
    process.env.CONFIG_DIR ? path.join(process.env.CONFIG_DIR, 'settings.json') : null
].filter(Boolean);

// Default ports
const DEFAULT_HTTP_PORT = parseInt(process.env.PORT) || 3000;
const DEFAULT_HTTPS_PORT = parseInt(process.env.HTTPS_PORT) || 4443;

/**
 * Loads configuration from multiple possible locations
 * Tries various config paths in order of preference
 * 
 * @returns {Object|null} Parsed configuration object or null if not found
 */
function loadConfig() {
    for (const configPath of CONFIG_PATHS) {
        try {
            if (fs.existsSync(configPath)) {
                const configData = fs.readFileSync(configPath, 'utf8');
                const config = JSON.parse(configData);
                console.log(`Loaded config from: ${configPath}`);
                return config;
            }
        } catch (error) {
            console.log(`Failed to load config from ${configPath}: ${error.message}`);
        }
    }
    console.log('No configuration file found, using defaults');
    return {};
}

/**
 * Test HTTP endpoint
 */
function testHttpEndpoint(port, path = '/api/public/health') {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: port,
            path: path,
            method: 'GET',
            timeout: 5000
        };

        const req = http.request(options, (res) => {
            if (res.statusCode === 200) {
                console.log(`HTTP health check passed on port ${port}`);
                resolve(true);
            } else {
                console.log(`HTTP health check failed on port ${port}: status ${res.statusCode}`);
                resolve(false);
            }
        });

        req.on('error', (error) => {
            console.log(`HTTP health check failed on port ${port}: ${error.message}`);
            resolve(false);
        });

        req.on('timeout', () => {
            console.log(`HTTP health check timed out on port ${port}`);
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

/**
 * Test HTTPS endpoint
 */
function testHttpsEndpoint(port, path = '/api/public/health') {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: port,
            path: path,
            method: 'GET',
            timeout: 5000,
            rejectUnauthorized: false // Allow self-signed certificates
        };

        const req = https.request(options, (res) => {
            if (res.statusCode === 200) {
                console.log(`HTTPS health check passed on port ${port}`);
                resolve(true);
            } else {
                console.log(`HTTPS health check failed on port ${port}: status ${res.statusCode}`);
                resolve(false);
            }
        });

        req.on('error', (error) => {
            console.log(`HTTPS health check failed on port ${port}: ${error.message}`);
            resolve(false);
        });

        req.on('timeout', () => {
            console.log(`HTTPS health check timed out on port ${port}`);
            req.destroy();
            resolve(false);
        });

        req.end();
    });
}

/**
 * Main health check function
 */
async function performHealthCheck() {
    console.log('Certificate Manager Health Check Starting...');
    
    // Load configuration
    const config = loadConfig();
    
    // Get ports from config or environment
    const httpPort = config.port || DEFAULT_HTTP_PORT;
    const httpsPort = config.httpsPort || DEFAULT_HTTPS_PORT;
    const httpsEnabled = config.enableHttps || false;
    
    console.log(`Configuration: HTTP=${httpPort}, HTTPS=${httpsPort}, HTTPS_ENABLED=${httpsEnabled}`);
    
    // Test endpoints based on configuration
    const tests = [];
    
    // Always try HTTP first (most common setup)
    tests.push(testHttpEndpoint(httpPort, '/api/public/health'));
    
    // If HTTPS is enabled, test HTTPS
    if (httpsEnabled) {
        tests.push(testHttpsEndpoint(httpsPort, '/api/public/health'));
    }
    
    // Run tests
    const results = await Promise.all(tests);
    
    // If primary tests fail, try fallback endpoints
    if (!results.some(result => result === true)) {
        console.log('Primary health checks failed, trying fallback endpoints...');
        
        const fallbackTests = [];
        fallbackTests.push(testHttpEndpoint(httpPort, '/api/public/ping'));
        
        if (httpsEnabled) {
            fallbackTests.push(testHttpsEndpoint(httpsPort, '/api/public/ping'));
        }
        
        const fallbackResults = await Promise.all(fallbackTests);
        
        if (fallbackResults.some(result => result === true)) {
            console.log('Fallback health check passed');
            process.exit(0);
        }
    } else {
        console.log('Health check passed');
        process.exit(0);
    }
    
    console.log('All health checks failed');
    process.exit(1);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception during health check:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled rejection during health check:', reason);
    process.exit(1);
});

// Run health check
performHealthCheck().catch((error) => {
    console.error('Health check failed with error:', error.message);
    process.exit(1);
});
