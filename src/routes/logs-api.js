const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../services/logger');

function initialize() {
    // Get application logs
    router.get('/', async (req, res) => {
        try {
            const logsDir = process.env.LOGS_DIR || '/logs';
            const logFile = path.join(logsDir, 'app.log');
            
            // Check if log file exists
            if (!fs.existsSync(logFile)) {
                return res.json({
                    success: true,
                    logs: [],
                    message: 'No logs available'
                });
            }
            
            // Read the last 200 lines of the log file
            const logs = await readLastLines(logFile, 200);
            
            return res.json({
                success: true,
                logs: logs.map(parseLine)
            });
        } catch (error) {
            logger.error('Error retrieving logs:', error);
            return res.status(500).json({
                success: false,
                error: 'Error retrieving logs: ' + error.message,
                logs: []
            });
        }
    });

    // Post client logs
    router.post('/client', (req, res) => {
        try {
            const { level, message, data } = req.body;
            
            // Validate log level
            const validLevels = ['info', 'warn', 'error', 'debug'];
            const logLevel = validLevels.includes(level) ? level : 'info';
            
            // Log with client prefix
            logger[logLevel](`[CLIENT] ${message}`, data);
            
            return res.json({
                success: true
            });
        } catch (error) {
            logger.error('Error logging client message:', error);
            return res.status(500).json({
                success: false,
                error: 'Error logging message: ' + error.message
            });
        }
    });

    // Helper function to read last N lines of file
    async function readLastLines(filePath, maxLines) {
        try {
            const fileContent = await fs.promises.readFile(filePath, 'utf8');
            const lines = fileContent.split('\n').filter(line => line.trim());
            
            // Return only the last maxLines
            return lines.slice(Math.max(0, lines.length - maxLines));
        } catch (error) {
            logger.error(`Error reading log file ${filePath}:`, error);
            throw error;
        }
    }

    // Helper function to parse log lines
    function parseLine(line) {
        try {
            // Example log format: [2023-04-09T15:42:12.123Z] [INFO] Message
            const timestampMatch = line.match(/\[([^\]]+)\]/);
            const levelMatch = line.match(/\[[^\]]+\]\s+\[([^\]]+)\]/);
            const timestamp = timestampMatch ? timestampMatch[1] : '';
            const level = levelMatch ? levelMatch[1].toLowerCase() : 'info';
            
            // Extract message (everything after the second bracket pair)
            const message = line.replace(/\[[^\]]+\]\s+\[[^\]]+\]\s+/, '');
            
            return {
                timestamp,
                level,
                message
            };
        } catch (error) {
            logger.warn('Error parsing log line:', error);
            return {
                timestamp: '',
                level: 'unknown',
                message: line
            };
        }
    }
    
    return router;
}

module.exports = { router, initialize };