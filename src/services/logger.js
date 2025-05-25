// Try to load Winston, but use a fallback if it's not available
let winston;
try {
    winston = require('winston');
} catch (error) {
    console.warn('Winston package not found, using fallback logger');
}

const path = require('path');
const fs = require('fs');

class Logger {
    constructor(config = null) {
        // Default log level
        this.logLevel = process.env.LOG_LEVEL || 'info';

        // Set log directory
        this.logDir = process.env.LOG_DIR || 'logs';
        
        // Ensure log directory exists
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
        
        // File-specific log levels
        this.fileLogLevels = {};

        // Define log levels with numeric values (lower = more important)
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3,
            fine: 4,
            finest: 5
        };

        // Load file-specific log levels from config
        this.loadLogConfig(config);

        if (winston) {
            // Initialize Winston logger with file-specific filtering
            this.initializeWinstonLogger();
        } else {
            this.createFallbackLogger();
        }

        console.log(`Logger initialized with default level: ${this.logLevel}`);
    }

    /**
     * Create Winston logger with file-specific log level filtering
     */
    initializeWinstonLogger() {
        // Creating a format that only colorizes the level
        const colorizedLevelFormat = winston.format((info) => {
            // Store the original level for use in customFormat
            info.rawLevel = info.level;
            
            // Create a colored version of the level for console
            const colorizer = winston.format.colorize();
            info.coloredLevel = colorizer.colorize(info.level, info.level.toUpperCase().padEnd(7));
            
            return info;
        });
        
        // Create Winston custom format that includes filename and instance
        const customFormat = winston.format.printf(({ level, rawLevel, coloredLevel, message, timestamp, filename, instance, ...meta }) => {
            // Use coloredLevel for console, fallback to normal level for file output
            const levelDisplay = coloredLevel || (rawLevel ? rawLevel.toUpperCase().padEnd(7) : level.toUpperCase().padEnd(7));
            
            let formattedMessage = `${timestamp} ${levelDisplay} [${filename || 'app'}`;
            if (instance) {
                formattedMessage += ` (${instance})`;
            }
            formattedMessage += `] ${message}`;

            // Add metadata if present
            const metaKeys = Object.keys(meta);
            if (metaKeys.length > 0) {
                // Check if the primary metadata is a string under 'metaValue'
                if (metaKeys.length === 1 && metaKeys[0] === 'metaValue' && typeof meta.metaValue === 'string') {
                    // If metaValue is a string, append it directly to preserve newlines
                    formattedMessage += `\nMETA:\n${meta.metaValue}`;
                } else {
                    // Otherwise, stringify the whole meta object
                    try {
                        formattedMessage += `\nMETA: ${JSON.stringify(meta, null, 2)}`;
                    } catch (err) {
                        formattedMessage += '\nMETA: [Error serializing metadata]';
                    }
                }
            }

            return formattedMessage;
        });
        

        // Create Winston logger
        this.logger = winston.createLogger({
            levels: this.levels,
            level: 'finest', // Set to highest level since we're doing our own filtering
            format: winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            transports: [
                // Console transport with timestamp, colorization and custom format
                new winston.transports.Console({
                    format: winston.format.combine(
                        colorizedLevelFormat(),
                        customFormat
                    )
                }),
                // File transport with custom format
                new winston.transports.File({
                    filename: path.join(this.logDir || 'logs', 'cert-manager.log'),
                    maxsize: 5242880, // 5MB
                    maxFiles: 5,
                    format: customFormat
                })
            ]
        });

        // Add colors for console output
        winston.addColors({
            error: 'red',
            warn: 'yellow',
            info: 'green',
            debug: 'blue',
            fine: 'cyan',
            finest: 'gray'
        });

        if (process.env.DEBUG_LOGGER_FILTER) {
            // Debug Winston logger configuration
            console.log('Winston logger configuration:');
            console.log(`- Default level: ${this.logger.level}`);
            this.logger.transports.forEach((transport, idx) => {
                console.log(`- Transport ${idx+1}: ${transport.name}, level: ${transport.level}`);
            });

            // Test each level to verify
            const testFilename = 'models/CertificateManager.js';
            ['error', 'warn', 'info', 'debug', 'fine', 'finest'].forEach(level => {
                console.log(`Testing '${level}' for ${testFilename}: ${this.isLevelEnabled(level, testFilename)}`);
                
                // Log a test message
                this.log(level, `TEST MESSAGE - ${level}`, null, testFilename);
            });
        }

        return this.logger;
    }

    /**
     * Create a fallback logger that writes to console and file without Winston
     * This is used when Winston is not available.
     * It mimics the same interface as the Winston logger.
     * @returns {void}
     * @private
     */
    createFallbackLogger() {
        // Create fallback logger when Winston isn't available
        this.logger = {
            log: (level, message, meta = {}) => {
                const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 19);
                const levelUpper = level.toUpperCase();
                const filename = meta.filename || 'app';
                const instance = meta.instance;

                let logLine;
                if (instance) {
                    logLine = `${timestamp} ${levelUpper} [${filename} (${instance})] ${message}`;
                } else {
                    logLine = `${timestamp} ${levelUpper} [${filename}] ${message}`;
                }

                // Log to console
                if (level === 'error') {
                    console.error(logLine);
                } else if (level === 'warn') {
                    console.warn(logLine);
                } else {
                    console.log(logLine);
                }

                // Write to file
                try {
                    const logFile = path.join(this.logDir, 'cert-manager.log');
                    let fileContent = logLine + '\n';

                    // Add metadata if present
                    const { filename, instance, ...restMeta } = meta;
                    if (Object.keys(restMeta).length > 0) {
                        try {
                            fileContent += `META: ${JSON.stringify(restMeta, null, 2)}\n`;
                        } catch (err) {
                            // Ignore serialization errors
                        }
                    }

                    fs.appendFileSync(logFile, fileContent);
                } catch (err) {
                    console.error('Error writing to log file:', err);
                }
            }
        };

        // Add methods for each log level
        Object.keys(this.levels).forEach(level => {
            this.logger[level] = (message, meta = {}) => {
                this.logger.log(level, message, meta);
            };
        });
    }

    /**
     * Load log configuration from settings
     */
    loadLogConfig(config = null) {
        try {
            // If no config is set first try to load from dedicated logging.json (for backward compatibility)
            if (!config) {
                config = {
                    ...this.loadFromLoggingJson(),
                    ...this.loadFromSettings()
                };
            }

            // Apply the configuration if found
            if (config) {
                // Set default level if provided
                if (config.logLevel) {
                    this.logLevel = config.logLevel;
                    console.log(`Set default log level to: ${this.logLevel}`);
                }

                if (config.logDir) {
                    // Ensure log directory exists
                    this.logDir = config.logDir;
                    if (!fs.existsSync(this.logDir)) {
                        fs.mkdirSync(this.logDir, { recursive: true });
                        console.log(`Created log directory: ${this.logDir}`);
                    } else {
                        console.log(`Using existing log directory: ${this.logDir}`);
                    }
                }

                // Set file-specific log levels
                const fileLogLevels = config.fileLogLevels || config.logging?.fileLogLevels;
                if (fileLogLevels && typeof fileLogLevels === 'object') {
                    this.fileLogLevels = {};

                    // Store all variations of the filename for more flexible matching
                    Object.entries(fileLogLevels).forEach(([filename, level]) => {
                        // Original filename
                        this.fileLogLevels[filename] = level;
                        
                        // Filename without extension
                        const nameWithoutExt = filename.replace(/\.[cm]?js$/, '');
                        if (nameWithoutExt !== filename) {
                            this.fileLogLevels[nameWithoutExt] = level;
                        }
                        
                        // Just the basename
                        const baseName = path.basename(filename);
                        if (baseName !== filename) {
                            this.fileLogLevels[baseName] = level;
                        }
                        
                        // Basename without extension
                        const baseNameWithoutExt = path.basename(nameWithoutExt);
                        if (baseNameWithoutExt !== nameWithoutExt) {
                            this.fileLogLevels[baseNameWithoutExt] = level;
                        }
                    });

                    console.log(`Loaded ${Object.keys(fileLogLevels).length} file-specific log levels`);
                    console.log('Expanded to mappings:', Object.keys(this.fileLogLevels).length);
                }
            } else {
                console.log('No log configuration found');
            }
        } catch (error) {
            console.error('Error loading log configuration:', error);
        }
    }

    /**
     * Load from dedicated logging.json file
     * @returns {Object|null} The config object or null if not found
     */
    loadFromLoggingJson() {
        const fs = require('fs');
        const path = require('path');

        // Try to find and load the logging configuration file
        const possiblePaths = [
            process.env.LOG_CONFIG_PATH,
            path.join(process.cwd(), 'config/logging.json'),
            '/config/logging.json', // Docker environment
            path.join(process.cwd(), 'logging.json')
        ];

        let configFile = null;
        for (const filePath of possiblePaths) {
            if (filePath && fs.existsSync(filePath)) {
                configFile = filePath;
                break;
            }
        }

        if (configFile) {
            console.log(`Loading log configuration from: ${configFile}`);
            return JSON.parse(fs.readFileSync(configFile, 'utf8'));
        }

        return null;
    }

    /**
     * Load from settings.json
     * @returns {Object|null} The config object or null if not found
     */
    loadFromSettings() {
        try {
            const fs = require('fs');
            const path = require('path');

            // Try to find settings.json
            const possiblePaths = [
                process.env.CONFIG_PATH,
                path.join(process.cwd(), 'config/settings.json'),
                '/config/settings.json', // Docker environment
                path.join(process.cwd(), 'settings.json')
            ];

            let settingsFile = null;
            for (const filePath of possiblePaths) {
                if (filePath && fs.existsSync(filePath)) {
                    settingsFile = filePath;
                    break;
                }
            }

            if (settingsFile) {
                console.log(`Loading log configuration from settings: ${settingsFile}`);
                const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));

                // Extract logging configuration from settings
                return {
                    logDir: settings.logDir || process.env.LOG_DIR || '/logs',
                    logLevel: settings.logLevel || process.env.LOG_LEVEL || 'info',
                    fileLogLevels: settings.fileLogLevels || {}
                };
            }
        } catch (error) {
            console.error('Error loading settings for logging:', error);
        }

        return null;
    }

    /**
     * Save current log configuration
     */
    saveLogConfig() {
        try {
            // Try to safely load configService
            let configService;
            try {
                configService = require('./config-service');
            } catch (error) {
                console.error('Could not load configService, cannot save log configuration');
                return;
            }

            // Get current settings
            const settings = configService.get();

            // Update log settings in the main settings object
            settings.logLevel = this.logLevel;

            // Update file-specific log levels
            settings.fileLogLevels = { ...this.fileLogLevels };

            // Save settings
            configService.updateSettings(settings);
            console.log(`Saved log configuration to settings.json`);
        } catch (error) {
            console.error('Error saving log configuration:', error);
        }
    }

    /**
     * Log a message with the specified level
     * @param {string} level - Log level
     * @param {string} message - Log message
     * @param {*} metaArg - Additional metadata (renamed from meta to avoid confusion)
     * @param {string} filename - Source filename
     * @param {string} instance - Optional instance identifier (e.g. certificate name)
     */
    log(level, message, metaArg, filename, instance) {
        if (!this.isLevelEnabled(level, filename)) return;
        
        const winstonPayload = {}; // This object will be passed to winston.log

        // Add standard fields that printf will destructure
        if (filename) winstonPayload.filename = filename;
        if (instance) winstonPayload.instance = instance;

        // Handle the metaArg for the '...meta' (rest parameter) in the customFormat printf function
        if (metaArg !== undefined && metaArg !== null) {
            if (typeof metaArg === 'object' && !Array.isArray(metaArg) && Object.getPrototypeOf(metaArg) === Object.prototype) {
                // If metaArg is a plain object, its properties will form the '...meta' in printf
                // (excluding filename and instance which are already handled by printf's destructuring)
                Object.keys(metaArg).forEach(key => {
                    // Check to avoid explicitly overwriting filename/instance if they were also keys in metaArg,
                    // though printf's destructuring order should handle this.
                    if (key !== 'filename' && key !== 'instance') {
                        winstonPayload[key] = metaArg[key];
                    }
                });
            } else {
                // If metaArg is a string, number, boolean, array, or a non-plain object,
                // wrap it in a 'metaValue' property. This ensures it's treated as a single piece of metadata.
                winstonPayload.metaValue = metaArg;
            }
        }

        // Use the Winston logger
        if (this.logger) {
            this.logger.log(level, message, winstonPayload);
        }
    }

    // Log level methods
    error(message, error, filename, instance) {
        let meta = {};

        if (error) {
            if (error instanceof Error) {
                // Extract all useful properties from standard Error objects
                meta = {
                    errorMessage: error.message,
                    stack: error.stack,
                    ...Object.getOwnPropertyNames(error)
                        .filter(prop => prop !== 'message' && prop !== 'stack')
                        .reduce((obj, prop) => {
                            obj[prop] = error[prop];
                            return obj;
                        }, {})
                };

                // Handle Axios errors specially
                if (error.response) {
                    meta.statusCode = error.response.status;
                    meta.statusText = error.response.statusText;
                    if (error.response.data) meta.responseData = error.response.data;
                }
            } else if (typeof error === 'object') {
                // For non-Error objects, just include them directly
                meta = { ...error };
            } else {
                // For primitive error values
                meta.errorValue = error;
            }
        }

        this.log('error', message, meta, filename, instance);
    }

    warn(message, meta, filename, instance) {
        this.log('warn', message, meta, filename, instance);
    }

    info(message, meta, filename, instance) {
        this.log('info', message, meta, filename, instance);
    }

    debug(message, meta, filename, instance) {
        this.log('debug', message, meta, filename, instance);
    }

    fine(message, meta, filename, instance) {
        this.log('fine', message, meta, filename, instance);
    }

    finest(message, meta, filename, instance) {
        this.log('finest', message, meta, filename, instance);
    }

    /**
     * Set the default log level or the log level for a specific file
     * @param {string} level - Log level
     * @param {string} [filename=null] - File to set level for
     */
    setLevel(level, filename = null) {
        if (this.levels[level] !== undefined) {
            if (!filename || typeof filename !== 'string') {
                this.logLevel = level;

                console.log(`Set default log level to ${level}`);
            } else {
                this.fileLogLevels[filename] = level;
                console.log(`Set log level for ${filename} to ${level}`);
            }

            // Save the updated configuration
            this.saveLogConfig();
        }
    }

    /**
     * Get the appropriate log level for a filename or the default level if not found
     * @param {string} [filename=null] - Source filename
     * @returns {string} Log level
     */
    getLevel(filename = null) {
        // Add debug logging
        const debug = false; // Set to true when troubleshooting
        
        // If no filename is provided, return the default log level
        if (!filename || typeof filename !== 'string') {
            if (debug) console.log(`getLevel: No filename, returning default ${this.logLevel}`);
            return this.logLevel;
        }

        // Check if the filename has a specific log level set
        if (this.fileLogLevels[filename]) {
            if (debug) console.log(`getLevel: Found exact match for ${filename}: ${this.fileLogLevels[filename]}`);
            return this.fileLogLevels[filename];
        }

        // Try with just the base filename (no path)
        const baseName = path.basename(filename);
        if (baseName !== filename && this.fileLogLevels[baseName]) {
            if (debug) console.log(`getLevel: Found match for basename ${baseName}: ${this.fileLogLevels[baseName]}`);
            return this.fileLogLevels[baseName];
        }

        // If the filename has a .js extension, check without the extension
        const nameWithoutExt = filename.replace(/\.[cm]?js$/, '');
        if (nameWithoutExt !== filename && this.fileLogLevels[nameWithoutExt]) {
            if (debug) console.log(`getLevel: Found match without extension ${nameWithoutExt}: ${this.fileLogLevels[nameWithoutExt]}`);
            return this.fileLogLevels[nameWithoutExt];
        }
        
        // Also try the basename without extension
        const baseNameWithoutExt = path.basename(nameWithoutExt);
        if (baseNameWithoutExt !== nameWithoutExt && this.fileLogLevels[baseNameWithoutExt]) {
            if (debug) console.log(`getLevel: Found match for basename without extension ${baseNameWithoutExt}: ${this.fileLogLevels[baseNameWithoutExt]}`);
            return this.fileLogLevels[baseNameWithoutExt];
        }

        // If no specific level is set for this file, return the default log level
        if (debug) console.log(`getLevel: No match for ${filename}, returning default ${this.logLevel}`);
        return this.logLevel;
    }

    /**
     * Check if a specific log level is enabled
     * @param {string} level - Log level to check
     * @param {string} [filename=null] - Source filename to check against
     * @returns {boolean} Whether the level is enabled
     */
    isLevelEnabled(level, filename = null) {
        // Get the effective log level for this file
        const effectiveLevel = filename ? this.getLevel(filename) : this.logLevel;

        // Compare the numeric values of the levels
        // Return true if the requested level is equal to or more important than effective level
        return this.levels[level] <= this.levels[effectiveLevel];
    }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;