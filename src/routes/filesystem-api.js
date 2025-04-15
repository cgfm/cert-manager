const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../services/logger');

// Default directories to search
const DEFAULT_DIRS = [
    '/certs',
    '/etc/letsencrypt/live',
    '/etc/ssl/certs',
    '/var/lib/acme',
    process.env.HOME || process.env.USERPROFILE
];

/**
 * GET /api/filesystem - List files and directories at a path
 */
router.get('/', async (req, res) => {
    try {
        let { path: requestPath } = req.query;
        
        // Sanitize and validate the path to prevent directory traversal attacks
        if (!requestPath || typeof requestPath !== 'string') {
            // If no path provided, return default directories
            return res.json({
                success: true,
                message: 'Default directories',
                directories: DEFAULT_DIRS.filter(dir => fs.existsSync(dir)),
                files: [],
                currentPath: '/'
            });
        }
        
        // Normalize the path and resolve any ../ references
        requestPath = path.normalize(requestPath).replace(/\\/g, '/');
        
        // Security check - don't allow navigating outside allowed directories
        // This is a simple example - you might want more sophisticated checks
        if (requestPath.includes('..')) {
            logger.warn(`Suspicious path traversal attempt: ${requestPath}`);
            return res.status(403).json({
                success: false,
                message: 'Invalid path'
            });
        }
        
        // Check if the path exists
        if (!fs.existsSync(requestPath)) {
            logger.info(`Path not found: ${requestPath}`);
            return res.json({
                success: false,
                message: 'Path not found',
                directories: [],
                files: [],
                currentPath: requestPath
            });
        }
        
        // Get directory contents
        const stats = fs.statSync(requestPath);
        
        // If it's a file, return its details
        if (!stats.isDirectory()) {
            return res.json({
                success: true,
                message: 'File details',
                isFile: true,
                fileName: path.basename(requestPath),
                filePath: requestPath,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime
            });
        }
        
        // It's a directory, read its contents
        const contents = fs.readdirSync(requestPath);
        
        // Separate directories and files
        const directories = [];
        const files = [];
        
        for (const item of contents) {
            const itemPath = path.join(requestPath, item);
            try {
                const itemStats = fs.statSync(itemPath);
                if (itemStats.isDirectory()) {
                    directories.push(item);
                } else {
                    files.push(item);
                }
            } catch (error) {
                logger.warn(`Error reading item ${itemPath}: ${error.message}`);
                // Skip items we can't access
            }
        }
        
        // Sort alphabetically
        directories.sort();
        files.sort();
        
        res.json({
            success: true,
            message: 'Directory contents',
            directories,
            files,
            currentPath: requestPath
        });
        
    } catch (error) {
        logger.error(`Error reading filesystem: ${error.message}`);
        res.status(500).json({
            success: false,
            message: `Error reading filesystem: ${error.message}`
        });
    }
});

module.exports = router;