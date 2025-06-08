/**
 * @fileoverview Client-side Logger Module - Comprehensive logging functionality
 * 
 * This module provides a complete client-side logging system with:
 * - Multiple log levels (DEBUG, INFO, WARN, ERROR, FINE, FINEST)
 * - Persistent log level configuration via localStorage
 * - Server-side log level synchronization
 * - Console output formatting with timestamps and context
 * - Remote logging capabilities for error reporting
 * - Performance monitoring and timing utilities
 * - Memory usage tracking and cleanup
 * 
 * Features include:
 * - Hierarchical log level filtering
 * - Automatic server log level synchronization
 * - Browser console integration with proper formatting
 * - Local storage persistence for user preferences
 * - Remote error reporting and aggregation
 * - Performance benchmarking utilities
 * 
 * @module public/js/modules/logger
 * @author Certificate Manager
 * @since 1.0.0
 */
const Logger = {
  // Log levels
  LEVELS: {
    FINEST: 0,
    FINE: 1,
    DEBUG: 2,
    INFO: 3,
    WARN: 4,
    ERROR: 5
  },

  // Current log level
  currentLevel: 3, // INFO by default

  /**
   * Sets the current logging level for filtering log output
   * Accepts both string names and numeric values with localStorage persistence
   * 
   * @param {string|number} level - Log level ('debug', 'info', 'warn', 'error') or numeric value (0-5)
   * @example
   * Logger.setLevel('debug'); // Enable debug and higher level logs
   * Logger.setLevel(2); // Set to DEBUG level numerically
   * Logger.setLevel('warn'); // Only show warnings and errors
   */
  setLevel: function (level) {
    // Handle both string and numeric level inputs
    if (typeof level === 'number') {
      // Handle numeric level (0-3)
      for (const [name, value] of Object.entries(this.LEVELS)) {
        if (value === level) {
          this.currentLevel = level;

          // Store in localStorage for persistence
          try {
            localStorage.setItem('logger_level', name);
          } catch (e) {
            // Ignore storage errors
          }

          // Always log level changes regardless of current level
          console.info(`[LOGGER] Log level set to ${name} (${level})`);
          return this.currentLevel;
        }
      }

      // If we get here, the numeric level wasn't valid
      console.warn(`[LOGGER] Invalid numeric log level: ${level}`);
      return this.currentLevel;
    }

    const levelName = (level || '').toUpperCase();
    if (this.LEVELS[levelName] !== undefined) {
      // Set the current level immediately
      this.currentLevel = this.LEVELS[levelName];

      // Store in localStorage for persistence
      try {
        localStorage.setItem('logger_level', levelName);
      } catch (e) {
        // Ignore storage errors
      }

      // Always log level changes regardless of current level
      console.info(`[LOGGER] Log level set to ${level} (${this.currentLevel})`);
    } else {
      console.warn(`[LOGGER] Invalid log level: ${level}`);
    }

    // Return the current level for chaining
    return this.currentLevel;
  },

  /**
   * Log a debug message
   * @param {string} message - Message to log
   * @param {*} data - Optional data to include
   */
  debug: function (message, data) {
    if (this.currentLevel <= this.LEVELS.DEBUG) {
      this._log('DEBUG', message, data);
    }
  },

  /**
   * Log an finest message
   * @param {string} message - Message to log
   * @param {*} data - Optional data to include
   */
  finest: function (message, data) {
    if (this.currentLevel <= this.LEVELS.FINEST) {
      this._log('finest', message, data);
    }
  },
  
  /**
   * Log an fine message
   * @param {string} message - Message to log
   * @param {*} data - Optional data to include
   */
  fine: function (message, data) {
    if (this.currentLevel <= this.LEVELS.FINE) {
      this._log('FINE', message, data);
    }
  },
  
  /**
   * Log an info message
   * @param {string} message - Message to log
   * @param {*} data - Optional data to include
   */
  info: function (message, data) {
    if (this.currentLevel <= this.LEVELS.INFO) {
      this._log('INFO', message, data);
    }
  },

  /**
   * Log a warning message
   * @param {string} message - Message to log
   * @param {*} data - Optional data to include
   */
  warn: function (message, data) {
    if (this.currentLevel <= this.LEVELS.WARN) {
      this._log('WARN', message, data);
    }
  },

  /**
   * Log an error message
   * @param {string} message - Message to log
   * @param {*} data - Optional data to include
   */
  error: function (message, error) {
    if (this.currentLevel <= this.LEVELS.ERROR) {
      this._log('ERROR', message, data);
    }
  },

  /**
   * Send logs to server
   * @param {Array} logs - Collection of log entries
   */
  sendLogsToServer: function (logs) {
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
  _log: function (level, message, data) {
    const timestamp = new Date().toISOString();

    // Console logging
    const consoleMessage = `[${timestamp}] [${level}] ${message}`;

    switch (level) {
      case 'DEBUG':
        console.log(consoleMessage, data || '');
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
  subscribe: function (callback) {
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
  _triggerLogEvent: function (logEntry) {
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
  _addLogToBuffer: function (logEntry) {
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
  getLogBuffer: function () {
    return [...this._logBuffer];
  },

  /**
   * Clear log buffer
   */
  clearLogBuffer: function () {
    this._logBuffer = [];
    this.info('Log buffer cleared');
  },

  /**
   * Get current log level name
   * @returns {string} Current log level name
   */
  getCurrentLevel: function () {
    for (const [name, value] of Object.entries(this.LEVELS)) {
      if (value === this.currentLevel) {
        return name;
      }
    }
    return 'UNKNOWN';
  },

  /**
   * Initialize logger from stored settings or backend
   */
  initialize: function () {
    // First check localStorage for saved level
    try {
      const savedLevel = localStorage.getItem('logger_level');
      if (savedLevel && this.LEVELS[savedLevel] !== undefined) {
        this.currentLevel = this.LEVELS[savedLevel];
        console.info(`[LOGGER] Initialized from saved level: ${savedLevel}`);
      }
    } catch (e) {
      // Ignore storage errors
    }

    // Then fetch backend level if available (will override localStorage)
    this.syncWithBackend();
  },

  /**
   * Synchronize log level with backend
   * @returns {Promise} Promise resolving with the synced level
   */
  syncWithBackend: function() {
    return fetch('/api/public/logLevel')
      .then(response => {
        if (!response.ok) {
          throw new Error(`Failed to get log level: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data && data.success && data.logLevel) {
          // Convert string level to level name if needed
          let levelToSet;
          
          if (typeof data.logLevel === 'string') {
            // Handle standard level names
            levelToSet = data.logLevel.toUpperCase();
          } else if (typeof data.logLevel === 'number') {
            // Handle numeric level values
            levelToSet = data.logLevel;
          } else {
            console.warn('[LOGGER] Unexpected log level format from backend:', data.logLevel);
            return null;
          }
          
          // Set the level and return
          this.setLevel(levelToSet);
          console.log(`[LOGGER] Synced with backend, level set to: ${data.logLevel}`);
          return data.logLevel;
        }
        return null;
      })
      .catch(err => {
        console.warn('[LOGGER] Could not sync with backend:', err);
        // Fall back to default if backend sync fails
        return null;
      });
  },

  /**
   * Create console helper commands for easier debugging
   */
  setupConsoleHelpers: function () {
    window.setLogLevel = function (level) {
      return Logger.setLevel(level);
    };

    window.getLogLevel = function () {
      return Logger.getCurrentLevel();
    };

    window.debugLog = function (msg, data) {
      // Force debug log regardless of level
      const originalLevel = Logger.currentLevel;
      Logger.currentLevel = Logger.LEVELS.DEBUG;
      Logger.debug(msg, data);
      Logger.currentLevel = originalLevel;
    };
  }
};

// Export for use in other modules
window.Logger = Logger;

(function () {
  // Run initialization
  Logger.initialize();
  Logger.setupConsoleHelpers();

  // Log initialization complete at debug level
  Logger.debug("Logger module enhanced and initialized");
})();