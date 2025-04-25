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

class LogsService {
    constructor(logsDir) {
        this.logsDir = logsDir || path.join(process.cwd(), 'logs');
        this.defaultLogFile = path.join(this.logsDir, 'app.log');
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
                            logger.error(`Error getting stats for ${filePath}:`, error);
                            return null;
                        }
                    })
            );

            return logFiles
                .filter(file => file !== null)
                .sort((a, b) => b.modified - a.modified);
        } catch (error) {
            logger.error('Error listing log files:', error);
            return [];
        }
    }

    /**
     * Get log content
     * @param {string} filename - Log filename (or undefined for default log)
     * @param {number} limit - Maximum number of lines to return
     * @param {string} filter - Text to filter logs by (case insensitive)
     * @returns {Promise<Array>} Array of log lines
     */
    async getLogContent(filename, limit = 1000, filter = null) {
        try {
            const logPath = filename
                ? path.join(this.logsDir, path.basename(filename))
                : this.defaultLogFile;
                
            // Check if file exists
            if (!fs.existsSync(logPath)) {
                logger.warn(`Log file ${logPath} not found`);
                return [];
            }
            
            // Read file from the end
            const lines = [];
            const fileStream = fs.createReadStream(logPath);
            const rl = readline.createInterface({
                input: fileStream,
                crlfDelay: Infinity
            });
            
            for await (const line of rl) {
                // Apply filter if specified
                if (filter && !line.toLowerCase().includes(filter.toLowerCase())) {
                    continue;
                }
                
                // Parse JSON log lines
                try {
                    if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
                        const parsedLine = JSON.parse(line);
                        lines.push(parsedLine);
                    } else {
                        lines.push({ message: line, timestamp: null, level: null });
                    }
                } catch (e) {
                    lines.push({ message: line, timestamp: null, level: null });
                }
                
                // Limit number of lines
                if (lines.length >= limit) {
                    break;
                }
            }
            
            // Return in reverse order (newest first)
            return lines.reverse();
        } catch (error) {
            logger.error(`Error reading log file:`, error);
            return [];
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
                logger.warn(`Log file ${logPath} not found`);
                return false;
            }
            
            // Clear the file
            await fs.promises.writeFile(logPath, '', 'utf8');
            logger.info(`Log file ${logPath} cleared`);
            
            return true;
        } catch (error) {
            logger.error(`Error clearing log file:`, error);
            return false;
        }
    }
}

module.exports = LogsService;