const fs = require('fs');
const path = require('path');
const util = require('util');

class Logger {
    constructor(options = {}) {
        this.logDir = options.logDir || '/logs';
        this.logFile = options.logFile || 'cert-manager.log';
        this.logLevel = options.logLevel || 'info'; // debug, info, warn, error
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
    
    initLogFile() {
        if (!this.logToFile) return;
        
        try {
            // Create log directory if it doesn't exist
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
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