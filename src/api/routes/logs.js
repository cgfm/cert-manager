/**
 * Logs API Routes
 * @module logsRoutes
 * @requires express
 */

const express = require('express');

const FILENAME = 'api/routes/logs.js';

/**
 * Logs routes
 * @param {Object} deps - Dependencies
 * @returns {express.Router} Router
 */
function logsRoutes(deps) {
  const router = express.Router();
  const { logsService, logger } = deps;
  
  // Get current logs (default log file)
  router.get('/', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 1000;
      const level = req.query.level || null;
      const file = req.query.file || null;
      const search = req.query.search || null;
      
      // Combine filters
      const filter = {};
      if (level && level !== 'all') filter.level = level;
      if (file && file !== 'all') filter.filename = file;
      if (search) filter.search = search;
      
      // Debug: Check file existence first
      const logFilePath = logsService.path.join(logsService.logsDir, 'cert-manager.log');
      const fileExists = await logsService.fs.promises.access(logFilePath)
        .then(() => true)
        .catch(() => false);
      
      logger.debug(`Looking for log file at path: ${logFilePath}, exists: ${fileExists}`, null, FILENAME);
      
      // Get content from default log file
      const content = await logsService.getLogContent('cert-manager.log', limit, filter);
      
      logger.debug(`Retrieved ${content.length} log entries`, null, FILENAME);
      
      res.json(content);
    } catch (error) {
      logger.error('Error retrieving logs:', error, FILENAME);
      res.status(500).json({
        error: 'Failed to retrieve logs',
        message: error.message
      });
    }
  });
  
  // Get available log files
  router.get('/files', async (req, res) => {
    try {
      const files = await logsService.getLogFiles();
      res.json(files);
    } catch (error) {
      logger.error('Error retrieving log files:', error, FILENAME);
      res.status(500).json({
        error: 'Failed to retrieve log files',
        message: error.message
      });
    }
  });

  // Get content of a specific log file
  router.get('/file/:filename', async (req, res) => {
    try {
      const filename = req.params.filename;
      const limit = parseInt(req.query.limit) || 1000;
      const level = req.query.level || null;
      const file = req.query.file || null;
      const search = req.query.search || null;
      
      // Combine filters
      const filter = {};
      if (level && level !== 'all') filter.level = level;
      if (file && file !== 'all') filter.filename = file;
      if (search) filter.search = search;
      
      const content = await logsService.getLogContent(filename, limit, filter);
      res.json(content);
    } catch (error) {
      logger.error(`Error retrieving log content:`, error, FILENAME);
      res.status(500).json({
        error: 'Failed to retrieve log content',
        message: error.message
      });
    }
  });

  // Clear a log file
  router.delete('/file/:filename', async (req, res) => {
    try {
      const filename = req.params.filename;
      const success = await logsService.clearLog(filename);
      
      if (success) {
        res.json({
          success: true,
          message: `Log file ${filename} cleared`
        });
      } else {
        res.status(404).json({
          success: false,
          error: `Log file ${filename} not found`
        });
      }
    } catch (error) {
      logger.error(`Error clearing log file:`, error, FILENAME);
      res.status(500).json({
        error: 'Failed to clear log file',
        message: error.message
      });
    }
  });

  // Add a new debug route
  router.get('/debug', async (req, res) => {
    try {
      // Check logs directory
      const logsDir = logsService.logsDir;
      let files = [];
      
      try {
        files = await logsService.fs.promises.readdir(logsDir);
      } catch (err) {
        logger.error(`Error reading logs directory: ${logsDir}`, err, FILENAME);
      }
      
      // Try to read first few lines of cert-manager.log
      let sampleLines = [];
      try {
        const logPath = logsService.path.join(logsDir, 'cert-manager.log');
        const fileStats = await logsService.fs.promises.stat(logPath);
        const fileExists = true;
        
        // Read first 1KB of the file
        const buffer = Buffer.alloc(1024);
        const fd = await logsService.fs.promises.open(logPath, 'r');
        const { bytesRead } = await fd.read(buffer, 0, 1024, 0);
        await fd.close();
        
        if (bytesRead > 0) {
          const sample = buffer.toString('utf8', 0, bytesRead);
          sampleLines = sample.split('\n').slice(0, 5).map(line => line.trim());
        }
      } catch (err) {
        logger.error('Error reading sample from cert-manager.log', err, FILENAME);
      }
      
      // Test parsing a known good log line
      const testLine = '2023-04-28 14:35:22 INFO [app.js] Server started on port 3000';
      let parsedTestLine = null;
      try {
        parsedTestLine = logsService.parseLogContent(testLine);
      } catch (err) {
        logger.error('Error parsing test log line', err, FILENAME);
      }
      
      res.json({
        logsDir,
        files,
        sampleLines,
        testParsingResult: parsedTestLine
      });
    } catch (error) {
      logger.error('Error in debug route:', error, FILENAME);
      res.status(500).json({
        error: 'Debug information failed',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = logsRoutes;