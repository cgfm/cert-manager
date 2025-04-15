const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class FilesystemService {
    /**
     * Lists files and directories in the specified path
     * @param {string} dirPath - Path to list
     * @returns {Promise<{success: boolean, path: string, parentPath: string, files: string[], directories: string[], error?: string}>}
     */
    async listDirectory(dirPath) {
        try {
            // Normalize path to prevent directory traversal attacks
            const normalizedPath = path.normalize(dirPath);
            logger.debug(`Listing directory: ${normalizedPath}`);
            
            // Check if path exists and is a directory
            const stats = await fs.promises.stat(normalizedPath);
            if (!stats.isDirectory()) {
                return { 
                    success: false, 
                    error: 'Not a directory', 
                    path: normalizedPath 
                };
            }
            
            // Read directory contents
            const items = await fs.promises.readdir(normalizedPath);
            
            // Separate files and directories
            const files = [];
            const directories = [];
            
            for (const item of items) {
                const itemPath = path.join(normalizedPath, item);
                try {
                    const itemStat = await fs.promises.stat(itemPath);
                    if (itemStat.isDirectory()) {
                        directories.push(item);
                    } else {
                        files.push(item);
                    }
                } catch (err) {
                    logger.warn(`Error reading stats for ${itemPath}: ${err.message}`);
                    // Skip items we can't read stats for
                }
            }
            
            // Sort alphabetically
            files.sort();
            directories.sort();
            
            // Calculate parent path
            const parentPath = path.dirname(normalizedPath);
            
            return {
                success: true,
                path: normalizedPath,
                parentPath,
                files,
                directories
            };
        } catch (error) {
            logger.error(`Error listing directory ${dirPath}:`, error);
            return {
                success: false,
                error: error.message,
                path: dirPath
            };
        }
    }
    
    /**
     * Checks if a file exists
     * @param {string} filePath - Path to check
     * @returns {Promise<{exists: boolean, error?: string}>}
     */
    async fileExists(filePath) {
        try {
            // Normalize path to prevent directory traversal attacks
            const normalizedPath = path.normalize(filePath);
            logger.debug(`Checking if file exists: ${normalizedPath}`);
            
            await fs.promises.access(normalizedPath, fs.constants.F_OK);
            return { exists: true };
        } catch (error) {
            return { exists: false };
        }
    }
}

const filesystemService = new FilesystemService();
module.exports = filesystemService;