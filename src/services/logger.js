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
    constructor(config=null) {
        // Default log level
        this.logLevel = process.env.LOG_LEVEL || 'info';

        // File-specific log levels
        this.fileLogLevels = {};

        // Define log levels with numeric values (lower = more important)
        // Move LOG_LEVELS inside the class as this.levels
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
            // Create Winston logger if available
            this.logger = winston.createLogger({
                levels: this.levels,
                format: winston.format.combine(
                    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                    winston.format.printf(info => {
                        return `${info.timestamp} ${info.level.toUpperCase()} [${info.filename || 'app'}] ${info.message}`;
                    })
                ),
                transports: [
                    new winston.transports.Console({
                        level: this.logLevel
                    }),
                    new winston.transports.File({
                        filename: 'logs/cert-manager.log',
                        level: this.logLevel,
                        maxsize: 5242880, // 5MB
                        maxFiles: 5,
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
        } else {
            // Create fallback logger
            this.logger = {
                log: (info) => {
                    const timestamp = new Date().toISOString();
                    const level = info.level.toUpperCase();
                    const filename = info.filename || 'app';
                    console.log(`${timestamp} ${level} [${filename}] ${info.message}`);

                    // Try to write to file as well
                    this.writeToLogFile(timestamp, level, filename, info.message);
                }
            };
        }

        console.log(`Logger initialized with default level: ${this.logLevel}`);
    }

    /**
     * Write to log file
     * @param {string} timestamp - Log timestamp
     * @param {string} level - Log level
     * @param {string} filename - Source filename
     * @param {string} message - Log message
     * @param {*} meta - Additional metadata (optional)
     * @param {string} instance - Optional instance identifier
     */
    writeToLogFile(timestamp, level, filename, message, meta, instance) {
        try {
            const logDir = process.env.LOG_DIR || '/logs';
            const logFile = path.join(logDir, 'cert-manager.log');

            // Create log directory if it doesn't exist
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }

            // Format message with optional instance
            let logLine;
            if (instance) {
                logLine = `${timestamp} ${level} [${filename} (${instance})] ${message}\n`;
            } else {
                logLine = `${timestamp} ${level} [${filename}] ${message}\n`;
            }
            
            // Add meta data if present
            if (meta) {
                try {
                    const metaStr = typeof meta === 'string' 
                        ? meta 
                        : JSON.stringify(meta, null, 2);
                    logLine += `META: ${metaStr}\n`;
                } catch (err) {
                    // Ignore meta formatting errors
                }
            }
            
            // Append to log file
            fs.appendFileSync(logFile, logLine);
        } catch (error) {
            console.error('Failed to write to log file:', error);
        }
    }

    /**
     * Load log configuration from settings
     */
    loadLogConfig(config=null) {
        try {
            // If no config is set first try to load from dedicated logging.json (for backward compatibility)
            if (!config) {
              config = this.loadFromLoggingJson();
            }
            // If no config was found, try to get from settings.json
            if (!config) {
                config = this.loadFromSettings();
            }
            
            // Apply the configuration if found
            if (config) {
                // Set default level if provided
                if (config.logLevel) {
                    this.logLevel = config.logLevel;
                    console.log(`Set default log level to: ${this.logLevel}`);
                }

                // Set file-specific log levels
                const fileLogLevels = config.fileLogLevels || config.logging?.fileLogLevels;
                if (fileLogLevels && typeof fileLogLevels === 'object') {
                    this.fileLogLevels = {};

                    // Store both the exact filename and without extension
                    Object.entries(fileLogLevels).forEach(([filename, level]) => {
                        // Store the original filename mapping
                        this.fileLogLevels[filename] = level;

                        // Also store the filename without extension
                        const nameWithoutExt = filename.replace(/\.js$/, '');
                        if (nameWithoutExt !== filename) {
                            this.fileLogLevels[nameWithoutExt] = level;
                        }

                        // For files with paths, also store just the filename
                        if (filename.includes('/') || filename.includes('\\')) {
                            const bareFilename = path.basename(filename);
                            this.fileLogLevels[bareFilename] = level;
                        }
                    });

                    console.log(`Loaded ${Object.keys(fileLogLevels).length} file-specific log levels`);
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
                    logLevel: settings.logLevel || 'info',
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
     * @param {*} meta - Additional metadata
     * @param {string} filename - Source filename
     * @param {string} instance - Optional instance identifier (e.g. certificate name)
     */
    log(level, message, meta, filename, instance) {
        // Get the effective log level for this file
        const effectiveLevel = filename ? this.getLevel(filename) : this.logLevel;
        const effectiveLevelValue = this.levels[effectiveLevel] || this.levels.info;
        
        // Only log if the message level is less than or equal to the effective level
        const messageLevelValue = this.levels[level] || this.levels.info;
        if (messageLevelValue > effectiveLevelValue) {
            return;
        }
        
        // Create log entry
        const timestamp = new Date().toISOString().replace('T', ' ').substr(0, 19);
        const levelUpper = level.toUpperCase();
        
        // Format: YYYY-MM-DD HH:mm:ss LEVEL [filename instance] message
        let logMessage;
        if (instance) {
            logMessage = `${timestamp} ${levelUpper} [${filename || 'unknown'} (${instance})] ${message}`;
        } else {
            logMessage = `${timestamp} ${levelUpper} [${filename || 'unknown'}] ${message}`;
        }
        
        // Log to console
        if (level === 'error') {
            console.error(logMessage);
        } else if (level === 'warn') {
            console.warn(logMessage);
        } else {
            console.log(logMessage);
        }
        
        // Add meta data if available
        if (meta) {
            console.log(meta);
        }
        
        // Write to log file
        this.writeToLogFile(timestamp, levelUpper, filename, message, meta, instance);
    }

    // Log level methods
    error(message, meta, filename, instance) {
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
    setLevel(level, filename=null) {
        if (this.levels[level] !== undefined) {
            if (!filename || typeof filename !== 'string') {
                this.logLevel = level;
    
                // Update transports if we're using Winston
                if (winston && this.logger.transports) {
                    this.logger.transports.forEach(transport => {
                        transport.level = level;
                    });
                }
    
                console.log(`Set default log level to ${level}`);
            }else{
                this.fileLogLevels[filename] = level;
                console.log(`Set log level for ${filename} to ${level}`);
            }
        }
    }
    
    /**
     * Get the appropriate log level for a filename or the default level if not found
     * @param {string} [filename=null] - Source filename
     * @returns {string} Log level
     */
    getLevel(filename=null) {
        if (!filename || typeof filename !== 'string') {
            return this.logLevel;
        }

        if (this.fileLogLevels[filename]) {
            return this.fileLogLevels[filename];
        }

        return this.logLevel;
    }

/**
 * Check if a specific log level is enabled
 * @param {string} level - Log level to check
 * @param {string} [filename=null] - Source filename to check against
 * @returns {boolean} Whether the level is enabled
 */
isLevelEnabled(level, filename=null) {
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