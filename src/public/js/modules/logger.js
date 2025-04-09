/**
 * Client-side logger service
 * Provides centralized logging with support for different levels
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
        // Log to console
        const logMethod = level === 'debug' ? 'log' : level;
        console[logMethod](`[${level.toUpperCase()}] ${message}`, data);
        
        // Send important logs to server (info and higher)
        if (this.levels[level] >= this.levels.info) {
            fetch('/api/logs/client', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ level, message, data })
            }).catch(e => console.error('Failed to send log to server', e));
        }
    }
}

// Export a singleton instance
const logger = new Logger(window.logLevel || 'info');
export default logger;