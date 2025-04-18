/**
 * Client-side logger service
 * Provides centralized logging with support for different levels and remote logging to a server.
 * @module logger
 * @requires window
 * @requires document
 * @requires fetch
 * @requires console
 * @version 1.0.0
 * @license MIT
 * @author Christian Meiners
 * @description This module is designed to provide a consistent logging interface across the application. It allows for different log levels (debug, info, warn, error) and can send logs to a server for storage and analysis. The logger can be configured to only log messages above a certain level, reducing noise in the logs.
 */

class Logger {
    constructor(minLevel = 'info') {
        this.levels = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
        this.setLevel(minLevel);
    }

    setLevel(level) {
        this.minLevel = this.levels[level] || this.levels.info;
    }

    debug(message, data) {
        if (this.minLevel <= this.levels.debug) {
            this._log('debug', message, data);
        }
    }

    info(message, data) {
        if (this.minLevel <= this.levels.info) {
            this._log('info', message, data);
        }
    }

    warn(message, data) {
        if (this.minLevel <= this.levels.warn) {
            this._log('warn', message, data);
        }
    }

    error(message, data) {
        if (this.minLevel <= this.levels.error) {
            this._log('error', message, data);
        }
    }

    _log(level, message, data) {
        // Check if data is undefined
        const hasData = typeof data !== 'undefined';
        
        // Log to console - only include data if defined
        const logMethod = level === 'debug' ? 'log' : level;
        
        if (hasData) {
            console[logMethod](`[${level.toUpperCase()}] ${message}`, data);
        } else {
            console[logMethod](`[${level.toUpperCase()}] ${message}`);
        }
        
        // Send important logs to server (info and higher)
        if (this.levels[level] >= this.levels.info) {
            // Only include data property in JSON if data exists
            const logData = {
                level,
                message,
                ...(hasData && { data })
            };
            
            fetch('/api/logs/client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(logData)
            }).catch(e => console.error('Failed to send log to server', e));
        }
    }
}

// Export a singleton instance if not already defined
if (!window.logger) {
    let logger = new Logger(window.logLevel || 'info');
    
    // Make it globally available
    window.logger = logger;
    console.log('Logger initialized with level:', window.logLevel || 'info');
}