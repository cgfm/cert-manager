/**
 * @fileoverview Logs Service - Provides access to application logs and log file management
 * @module services/logs-service
 * @requires fs
 * @requires path
 * @requires readline
 * @requires ./logger
 * @author Certificate Manager
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const logger = require('./logger');

const FILENAME = 'services/logs-service.js';

/**
 * Logs Service for accessing and managing application log files.
 * Provides methods to read, filter, and retrieve log entries from various log files.
 */
class LogsService {
    /**
     * Create a new LogsService instance
     * @param {string} [logsDir=null] - Directory path where log files are stored
     * @param {Object} [deps={}] - Dependencies for testing and flexibility
     * @param {Object} [deps.logger] - Logger instance (defaults to logger module)
     * @param {Object} [deps.fs] - File system module (defaults to fs)
     * @param {Object} [deps.path] - Path module (defaults to path)
     */
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
    }    /**
     * Ensure that the logs directory exists, creating it if necessary.
     * @async
     * @private
     * @returns {Promise<void>} Promise that resolves when directory is confirmed to exist
     * @throws {Error} Logs error but doesn't throw - allows service to continue functioning
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

        const lines = content.split('\n'); // Don't filter empty lines initially
        const logs = [];
        let currentEntry = null;
        let metaLinesBuffer = [];
        let parsingMetaForCurrentEntry = false;

        const logRegex = /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+([A-Z]+)\s+\[([^\]()]+)(?:\s+\(([^)]+)\))?\]\s+(.+)$/i;
        const metaStartRegex = /^META:\s*(.*)$/; // Starts with META:, captures rest of line

        const processMetaBuffer = () => {
            if (currentEntry && parsingMetaForCurrentEntry && metaLinesBuffer.length > 0) {
                const metaString = metaLinesBuffer.join('\n').trim();
                if (metaString) {
                    try {
                        currentEntry.meta = JSON.parse(metaString);
                    } catch (e) {
                        // If parsing as JSON fails, store the raw string wrapped in an object
                        // to conform to OpenAPI 'meta: type: object'.
                        currentEntry.meta = { data: metaString };
                        this.logger.fine(`META block for log (instance: ${currentEntry.instance || 'N/A'}) was not JSON, stored as {data: metaString}`, null, FILENAME);
                    }
                }
            }
            metaLinesBuffer = [];
            parsingMetaForCurrentEntry = false;
        };

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();

            // Skip genuinely empty lines if not in a meta block
            if (!trimmedLine && !parsingMetaForCurrentEntry) {
                continue;
            }

            const logMatch = logRegex.exec(trimmedLine);
            // Try meta match only if not a log line. Use raw line for META: check to preserve leading spaces in JSON.
            const metaMatch = !logMatch ? metaStartRegex.exec(line) : null; 

            if (logMatch) { // This line is a new log entry
                processMetaBuffer(); // Process any accumulated meta for the *previous* entry

                const [, timestamp, level, filename, instance, message] = logMatch;
                currentEntry = {
                    timestamp,
                    level: level.toLowerCase(),
                    filename: filename.trim(),
                    instance: instance ? instance.trim() : null,
                    message: message.trim(), // Initial part of the message
                    meta: null // Initialize meta, will be populated by processMetaBuffer
                };
                logs.push(currentEntry);
            } else if (currentEntry) { // This line is a continuation or meta for the currentEntry
                if (metaMatch) { // This line starts a META block for currentEntry
                    // If we were already parsing meta, it implies a new META block starts
                    // before the old one was "terminated" by a new log line. Process the old one.
                    if (parsingMetaForCurrentEntry) {
                        processMetaBuffer();
                    }
                    parsingMetaForCurrentEntry = true;
                    const metaContentOnFirstLine = metaMatch[1]; // Content after "META:"
                    // If "META:" was on a line by itself, metaContentOnFirstLine will be empty.
                    // If "META: {..." then metaContentOnFirstLine will be "{...".
                    if (metaContentOnFirstLine.trim()) {
                        metaLinesBuffer.push(metaContentOnFirstLine);
                    }
                } else if (parsingMetaForCurrentEntry) {
                    // This line is part of an ongoing META block
                    metaLinesBuffer.push(line); // Add the raw line to preserve formatting for JSON
                } else {
                    // This line is a continuation of the currentEntry's message
                    // Append the raw line to preserve any intentional formatting
                    currentEntry.message += '\n' + line;
                }
            } else if (trimmedLine) {
                // This line is not a log entry and there's no currentEntry (e.g. file starts with META or garbage)
                this.logger.warn(`Orphan log line (no current log context): "${trimmedLine}"`, null, FILENAME);
            }
        }

        processMetaBuffer(); // Process meta for the very last log entry in the file

        return logs.reverse(); // Newest first
    }
}

module.exports = LogsService;