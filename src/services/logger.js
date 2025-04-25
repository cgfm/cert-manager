/**
 * Logger Service for cert-manager
 * This service provides logging functionality with options for console and file logging,
 * log rotation, and in-memory log history.
 * It supports different log levels and allows filtering of logs based on level and time range.
 * @module logger - Logger Service
 * @requires fs - File system module for file operations
 * @requires path - Path module for handling file paths
 * @requires util - Utility module for formatting log messages
 * @version 0.0.2
 * @license MIT
 * @author Christian Meiners
 * @description This logger service is designed to be used in a Node.js environment, specifically for a cert-manager application.
 */

const fs = require('fs');
const path = require('path');
const util = require('util');
const os = require('os');

class Logger {
    constructor(options = {}) {
        this.logDir = options.logDir || '/logs';
        this.logFile = options.logFile || 'cert-manager.log';
        this.logLevel = options.logLevel || 'debug'; // debug, info, warn, error
        this.maxSize = options.maxSize || 5 * 1024 * 1024; // 5MB default
        this.keepLogs = options.keepLogs || 5;
        this.logToConsole = options.logToConsole !== false;
        this.logToFile = options.logToFile !== false;
        
        // Log levels mapped to numeric values for comparison
        this.logLevels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
        
        // Initialize log directory and file
        this.initLogFile();
        
        // Store log history in memory for UI access
        this.logHistory = [];
        this.maxHistoryEntries = 1000; // Limit in-memory entries
    }

    setLevel(level) {
        if (this.logLevels.hasOwnProperty(level)) {
            this.logLevel = level;
            this.info(`Log level set to ${level}`);
        }
    }

    getLevel() {
        return this.logLevel;
    }
    
    initLogFile() {
        if (!this.logToFile) return;
        
        try {
            // Create log directory if it doesn't exist
            if (!fs.existsSync(this.logDir)) {
                try {
                    fs.mkdirSync(this.logDir, { recursive: true });
                } catch (dirError) {
                    console.error(`Error creating log directory: ${dirError.message}`);
                    // Try to use a fallback directory if main log dir fails
                    this.logDir = os.tmpdir();
                    console.log(`Using fallback log directory: ${this.logDir}`);
                }
            }
            
            // Test if the directory is writable
            try {
                const testFile = path.join(this.logDir, '.write-test');
                fs.writeFileSync(testFile, 'test');
                fs.unlinkSync(testFile);
            } catch (writeError) {
                console.error(`Log directory is not writable: ${writeError.message}`);
                // Fall back to temp directory
                this.logDir = os.tmpdir();
                console.log(`Using fallback log directory: ${this.logDir}`);
            }
            
            const logPath = path.join(this.logDir, this.logFile);
            
            // Check if log file needs rotation
            if (fs.existsSync(logPath)) {
                const stats = fs.statSync(logPath);
                if (stats.size > this.maxSize) {
                    this.rotateLogFiles();
                }
            }
        } catch (error) {
            console.error(`Error initializing log file: ${error.message}`);
        }
    }
    
    rotateLogFiles() {
        try {
            // Rotate log files - remove oldest, shift others up, create new
            for (let i = this.keepLogs - 1; i > 0; i--) {
                const oldLogPath = path.join(this.logDir, `${this.logFile}.${i}`);
                const newLogPath = path.join(this.logDir, `${this.logFile}.${i + 1}`);
                
                if (fs.existsSync(oldLogPath)) {
                    fs.renameSync(oldLogPath, newLogPath);
                }
            }
            
            // Move current log to .1
            const currentLogPath = path.join(this.logDir, this.logFile);
            const newLogPath = path.join(this.logDir, `${this.logFile}.1`);
            
            if (fs.existsSync(currentLogPath)) {
                fs.renameSync(currentLogPath, newLogPath);
            }
        } catch (error) {
            console.error(`Error rotating log files: ${error.message}`);
        }
    }
    
    formatMessage(level, message, details = null) {
        const timestamp = new Date().toISOString();
        const detailsStr = details !== null ? ' ' + util.inspect(details, { depth: 4 }) : '';
        
        return `[${timestamp}] [${level.toUpperCase()}] ${message}${detailsStr}`;
    }
    
    writeLog(level, message, details = null) {
        // Check if we should log this level
        if (this.logLevels[level] < this.logLevels[this.logLevel]) {
            return;
        }
        
        const formattedMessage = this.formatMessage(level, message, details);
        
        // Store log entry in memory
        this.logHistory.push({
            timestamp: new Date(),
            level,
            message,
            details,
            formatted: formattedMessage
        });
        
        // Keep history size limited
        if (this.logHistory.length > this.maxHistoryEntries) {
            this.logHistory.shift();
        }
        
        // Log to console
        if (this.logToConsole) {
            const consoleMethod = level === 'error' ? 'error' : 
                                  level === 'warn' ? 'warn' : 
                                  level === 'debug' ? 'debug' : 'log';
                                  
            console[consoleMethod](formattedMessage);
        }
        
        // Log to file
        if (this.logToFile) {
            try {
                fs.appendFileSync(
                    path.join(this.logDir, this.logFile), 
                    formattedMessage + '\n'
                );
            } catch (error) {
                console.error(`Error writing to log file: ${error.message}`);
            }
        }
    }
    
    debug(message, details = null) {
        this.writeLog('debug', message, details);
    }
    
    info(message, details = null) {
        this.writeLog('info', message, details);
    }
    
    warn(message, details = null) {
        this.writeLog('warn', message, details);
    }
    
    error(message, details = null) {
        this.writeLog('error', message, details);
    }
    
    /**
     * Check if a specific log level is enabled
     * @param {string} level - Log level to check
     * @returns {boolean} Whether the level is enabled
     */
    isLevelEnabled(level) {
        // Check if the provided level is valid
        if (!this.logLevels.hasOwnProperty(level)) {
            return false;
        }
        
        // Compare the numeric values of the levels
        return this.logLevels[level] >= this.logLevels[this.logLevel];
    }
    
    getLogHistory(options = {}) {
        const { level, limit = 100, startTime, endTime } = options;
        
        let filteredLogs = this.logHistory;
        
        // Filter by level if provided
        if (level) {
            filteredLogs = filteredLogs.filter(log => log.level === level);
        }
        
        // Filter by time range if provided
        if (startTime) {
            filteredLogs = filteredLogs.filter(log => log.timestamp >= startTime);
        }
        
        if (endTime) {
            filteredLogs = filteredLogs.filter(log => log.timestamp <= endTime);
        }
        
        // Return the most recent logs up to the limit
        return filteredLogs.slice(-limit);
    }
    
    clearHistory() {
        this.logHistory = [];
    }
}

// Create a singleton instance with default options
// Allow environment variables to override defaults
const logger = new Logger({
    logDir: process.env.LOG_DIR || '/logs',
    logFile: process.env.LOG_FILE || 'cert-manager.log',
    logLevel: process.env.LOG_LEVEL || 'info',
    logToConsole: process.env.LOG_TO_CONSOLE !== 'false',
    logToFile: process.env.LOG_TO_FILE !== 'false'
});

module.exports = logger;