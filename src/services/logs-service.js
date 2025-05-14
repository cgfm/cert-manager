/**
 * @module LogsService
 * @requires fs
 * @requires path
 * @requires readline
 * @description Provides access to application logs
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const logger = require('./logger');

const FILENAME = 'services/logs-service.js';

class LogsService {
    constructor(logsDir = null, deps = {}) {
        // Set up dependencies with fallbacks
        this.logger = deps.logger || logger;
        this.fs = deps.fs || fs;
        this.path = deps.path || path;
        
        // Determine logs directory - allow direct path parameter for simplicity
        this.logsDir = logsDir || 
                       process.env.LOGS_DIR || 
                       this.path.join(process.cwd(), 'logs');
        
        this.logger.debug(`Logs service initialized with logs directory: ${this.logsDir}`, null, FILENAME);
        
        // Ensure logs directory exists asynchronously
        this.ensureLogsDirectory().catch(err => {
            this.logger.error(`Failed to ensure logs directory exists:`, err, FILENAME);
        });
    }

    /**
     * Ensure logs directory exists
     */
    async ensureLogsDirectory() {
        try {
            await this.fs.promises.access(this.logsDir);
            this.logger.debug(`Logs directory exists: ${this.logsDir}`, null, FILENAME);
        } catch (error) {
            this.logger.debug(`Creating logs directory: ${this.logsDir}`, null, FILENAME);
            try {
                await this.fs.promises.mkdir(this.logsDir, { recursive: true });
                this.logger.debug(`Logs directory created: ${this.logsDir}`, null, FILENAME);
            } catch (err) {
                this.logger.error(`Failed to create logs directory: ${this.logsDir}`, err, FILENAME);
            }
        }
    }

    /**
     * Get available log files
     * @returns {Promise<Array>} List of log files
     */
    async getLogFiles() {
        try {
            // Ensure logs directory exists
            if (!fs.existsSync(this.logsDir)) {
                return [];
            }

            const files = await fs.promises.readdir(this.logsDir);
            
            // Filter for log files and get stats
            const logFiles = await Promise.all(
                files
                    .filter(file => file.endsWith('.log'))
                    .map(async (file) => {
                        const filePath = path.join(this.logsDir, file);
                        try {
                            const stats = await fs.promises.stat(filePath);
                            return {
                                name: file,
                                path: filePath,
                                size: stats.size,
                                modified: stats.mtime
                            };
                        } catch (error) {
                            logger.error(`Error getting stats for ${filePath}:`, error, FILENAME);
                            return null;
                        }
                    })
            );

            return logFiles
                .filter(file => file !== null)
                .sort((a, b) => b.modified - a.modified);
        } catch (error) {
            logger.error('Error listing log files:', error, FILENAME);
            return [];
        }
    }

    /**
     * Get content of a log file
     * @param {string} filename - Log filename
     * @param {number} limit - Max number of entries to return
     * @param {Object} filter - Filter options
     * @returns {Promise<Array>} Parsed log entries
     */
    async getLogContent(filename, limit = 1000, filter = null) {
        try {
            const filePath = this.path.join(this.logsDir, filename);
            this.logger.debug(`Reading log file: ${filePath}`, null, FILENAME);
            
            // Check if file exists
            try {
                await this.fs.promises.access(filePath);
                this.logger.debug(`Log file ${filename} exists`, null, FILENAME);
            } catch (err) {
                this.logger.warn(`Log file ${filename} not found at path: ${filePath}`, null, FILENAME);
                // Instead of throwing, return empty array
                return [];
            }
            
            // Get file stats to check size
            const stats = await this.fs.promises.stat(filePath);
            this.logger.fine(`Log file size: ${stats.size} bytes`, null, FILENAME);
            
            // If file is empty, return empty array
            if (stats.size === 0) {
                this.logger.fine(`Log file ${filename} is empty`, null, FILENAME);
                return [];
            }
            
            // Read file content
            const content = await this.fs.promises.readFile(filePath, 'utf8');
            this.logger.fine(`Read ${content.length} bytes from log file`, null, FILENAME);
            
            // Parse log entries
            const entries = this.parseLogContent(content);
            this.logger.fine(`Parsed ${entries.length} log entries`, null, FILENAME);
            
            // Apply filters
            let filteredEntries = entries;
            
            if (filter && Object.keys(filter).length > 0) {
                this.logger.debug(`Applying filters: ${JSON.stringify(filter)}`, null, FILENAME);
                
                filteredEntries = entries.filter(entry => {
                    // Filter by level
                    if (filter.level && entry.level !== filter.level) {
                        return false;
                    }
                    
                    // Filter by filename
                    if (filter.filename && entry.filename !== filter.filename) {
                        return false;
                    }
                    
                    // Filter by search text
                    if (filter.search) {
                        const searchLower = filter.search.toLowerCase();
                        return entry.message.toLowerCase().includes(searchLower) ||
                              (entry.filename && entry.filename.toLowerCase().includes(searchLower));
                    }
                    
                    return true;
                });
                
                this.logger.debug(`After filtering: ${filteredEntries.length} entries`, null, FILENAME);
            }
            
            // Return the most recent logs up to the limit
            return filteredEntries.slice(0, limit);
        } catch (error) {
            this.logger.error(`Error getting log content for ${filename}:`, error, FILENAME);
            throw error;
        }
    }
    
    /**
     * Clear a log file
     * @param {string} filename - Log filename to clear
     * @returns {Promise<boolean>} Success status
     */
    async clearLog(filename) {
        try {
            const logPath = path.join(this.logsDir, path.basename(filename));
            
            // Check if file exists
            if (!fs.existsSync(logPath)) {
                logger.warn(`Log file ${logPath} not found`, null, FILENAME);
                return false;
            }
            
            // Clear the file
            await fs.promises.writeFile(logPath, '', 'utf8');
            logger.info(`Log file ${logPath} cleared`, null, FILENAME);
            
            return true;
        } catch (error) {
            logger.error(`Error clearing log file:`, error, FILENAME);
            return false;
        }
    }

    /**
     * Parse log content into structured entries
     * @param {string} content - Log file content
     * @returns {Array} Array of parsed log entries
     */
    parseLogContent(content) {
        if (!content || typeof content !== 'string') {
            this.logger.warn('Empty or invalid content passed to parseLogContent', null, FILENAME);
            return [];
        }
        
        const lines = content.split('\n').filter(line => line.trim());
        const logs = [];
        let currentEntry = null;
        
        // Enhanced regex that handles instance in parentheses
        // Format: YYYY-MM-DD HH:mm:ss LEVEL [filename (instance)] message
        // or the original format: YYYY-MM-DD HH:mm:ss LEVEL [filename] message
        const logRegex = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+([A-Z]+)\s+\[([^\]()]+)(?:\s+\(([^)]+)\))?\]\s+(.+)$/i;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = logRegex.exec(line);
            
            if (match) {
                // This is a new log entry
                // Group 1: timestamp, 2: level, 3: filename, 4: instance (or undefined), 5: message
                const [, timestamp, level, filename, instance, message] = match;
                
                currentEntry = {
                    timestamp,
                    level: level.toLowerCase(),
                    filename,
                    instance: instance || null, // Add instance to the log structure
                    message
                };
                
                logs.push(currentEntry);
            } else if (currentEntry) {
                // Continuation of previous log entry
                currentEntry.message += '\n' + line;
            } else if (i === 0) {
                // First line doesn't match, possibly invalid log format
                this.logger.warn(`First log line doesn't match expected format: ${line}`, null, FILENAME);
                
                logs.push({
                    timestamp: new Date().toISOString(),
                    level: 'warn',
                    filename: 'logger',
                    instance: null,
                    message: `Unparseable log entry: ${line}`
                });
            }
        }
        
        // Return logs with newest first
        return logs.reverse();
    }
}

module.exports = LogsService;