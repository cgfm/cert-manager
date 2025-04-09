const express = require('express');
const router = express.Router();
const logger = require('../services/logger');
const fs = require('fs');
const path = require('path');

// GET /api/logs - Get recent logs from in-memory history
router.get('/', (req, res) => {
    try {
        const options = {
            level: req.query.level,
            limit: req.query.limit ? parseInt(req.query.limit) : 100,
            startTime: req.query.start ? new Date(req.query.start) : null,
            endTime: req.query.end ? new Date(req.query.end) : null
        };
        
        const logs = logger.getLogHistory(options);
        
        res.json({
            success: true,
            logs
        });
    } catch (error) {
        logger.error('Error retrieving logs', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/logs/file - Download the current log file
router.get('/file', (req, res) => {
    try {
        const logDir = process.env.LOG_DIR || '/logs';
        const logFile = process.env.LOG_FILE || 'cert-manager.log';
        const logPath = path.join(logDir, logFile);
        
        if (!fs.existsSync(logPath)) {
            return res.status(404).json({
                success: false,
                error: 'Log file not found'
            });
        }
        
        res.download(logPath, logFile);
    } catch (error) {
        logger.error('Error downloading log file', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// POST /api/logs/client - Receive logs from client-side
router.post('/client', (req, res) => {
    try {
        const { level, message, data } = req.body;
        
        // Validate the level
        if (!['debug', 'info', 'warn', 'error'].includes(level)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid log level'
            });
        }
        
        // Log the message with the appropriate level
        logger[level](`[CLIENT] ${message}`, data);
        
        res.json({
            success: true
        });
    } catch (error) {
        logger.error('Error processing client log', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;