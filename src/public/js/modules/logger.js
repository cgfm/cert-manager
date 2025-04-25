/**
 * Logger Module
 * Client-side logging functionality
 */
const Logger = {
  // Log levels
  LEVELS: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
  },
  
  // Current log level
  currentLevel: 1, // INFO by default
  
  /**
   * Set the logging level
   * @param {string} level - Log level name: 'debug', 'info', 'warn', 'error'
   */
  setLevel: function(level) {
    const levelName = level.toUpperCase();
    if (this.LEVELS[levelName] !== undefined) {
      this.currentLevel = this.LEVELS[levelName];
      this.info(`Log level set to ${level}`);
    } else {
      this.warn(`Invalid log level: ${level}`);
    }
  },
  
  /**
   * Log a debug message
   * @param {string} message - Message to log
   * @param {*} data - Optional data to include
   */
  debug: function(message, data) {
    if (this.currentLevel <= this.LEVELS.DEBUG) {
      this._log('DEBUG', message, data);
    }
  },
  
  /**
   * Log an info message
   * @param {string} message - Message to log
   * @param {*} data - Optional data to include
   */
  info: function(message, data) {
    if (this.currentLevel <= this.LEVELS.INFO) {
      this._log('INFO', message, data);
    }
  },
  
  /**
   * Log a warning message
   * @param {string} message - Message to log
   * @param {*} data - Optional data to include
   */
  warn: function(message, data) {
    if (this.currentLevel <= this.LEVELS.WARN) {
      this._log('WARN', message, data);
    }
  },
  
  /**
   * Log an error message
   * @param {string} message - Message to log
   * @param {*} data - Optional data to include
   */
  error: function(message, data) {
    if (this.currentLevel <= this.LEVELS.ERROR) {
      this._log('ERROR', message, data);
    }
  },
  
  /**
   * Send logs to server
   * @param {Array} logs - Collection of log entries
   */
  sendLogsToServer: function(logs) {
    return fetch('/api/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ logs })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to send logs: ${response.status}`);
      }
      return response.json();
    });
  },
  
  /**
   * Internal logging method
   * @param {string} level - Log level
   * @param {string} message - Message to log
   * @param {*} data - Optional data to include
   * @private
   */
  _log: function(level, message, data) {
    const timestamp = new Date().toISOString();
    
    // Console logging
    const consoleMessage = `[${timestamp}] [${level}] ${message}`;
    
    switch (level) {
      case 'DEBUG':
        console.debug(consoleMessage, data || '');
        break;
      case 'INFO':
        console.info(consoleMessage, data || '');
        break;
      case 'WARN':
        console.warn(consoleMessage, data || '');
        break;
      case 'ERROR':
        console.error(consoleMessage, data || '');
        break;
    }
    
    // Add to in-memory log
    const logEntry = {
      timestamp,
      level,
      message,
      data: data ? JSON.stringify(data) : null
    };
    
    this._addLogToBuffer(logEntry);
    
    // Trigger log event for subscribers
    this._triggerLogEvent(logEntry);
  },
  
  // Event listeners for log events
  _eventListeners: [],
  
  /**
   * Add log event listener
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe: function(callback) {
    this._eventListeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      this._eventListeners = this._eventListeners.filter(cb => cb !== callback);
    };
  },
  
  /**
   * Trigger log event for subscribers
   * @param {Object} logEntry - Log entry to send
   * @private
   */
  _triggerLogEvent: function(logEntry) {
    this._eventListeners.forEach(callback => {
      try {
        callback(logEntry);
      } catch (err) {
        console.error('Error in log event handler:', err);
      }
    });
  },
  
  // In-memory log buffer
  _logBuffer: [],
  _maxBufferSize: 1000,
  
  /**
   * Add log entry to buffer
   * @param {Object} logEntry - Log entry to add
   * @private
   */
  _addLogToBuffer: function(logEntry) {
    this._logBuffer.push(logEntry);
    
    // Trim buffer if it gets too large
    if (this._logBuffer.length > this._maxBufferSize) {
      this._logBuffer = this._logBuffer.slice(-this._maxBufferSize);
    }
  },
  
  /**
   * Get log buffer contents
   * @returns {Array} Array of log entries
   */
  getLogBuffer: function() {
    return [...this._logBuffer];
  },
  
  /**
   * Clear log buffer
   */
  clearLogBuffer: function() {
    this._logBuffer = [];
    this.info('Log buffer cleared');
  }
};

// Export for use in other modules
window.Logger = Logger;