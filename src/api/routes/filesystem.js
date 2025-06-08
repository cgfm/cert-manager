/**
 * @fileoverview Filesystem API Routes - Provides file system browsing and management endpoints
 * @module api/routes/filesystem
 * @requires express
 * @requires path
 * @author Certificate Manager
 */

const express = require("express");
const path = require("path");

const FILENAME = 'api/routes/filesystem.js';

/**
 * Initialize filesystem routes with required dependencies.
 * Provides endpoints for file system browsing, directory listing, and file operations.
 * @param {Object} deps - Dependencies object containing required services
 * @param {Object} deps.fileSystemService - File system service for file operations
 * @param {Object} deps.logger - Logger service for request logging
 * @returns {express.Router} Configured Express router with filesystem endpoints
 */
function filesystemRoutes(deps) {
  const router = express.Router();
  const { fileSystemService, logger } = deps;

  // Debug middleware to log all requests to filesystem routes
  router.use((req, res, next) => {
    logger.debug(`Filesystem API request: ${req.method} ${req.path}`, null, FILENAME);
    next();
  });

  // If filesystem service is not provided, return a basic router
  if (!fileSystemService) {
    router.use("/", (req, res) => {
      res.status(503).json({ error: "Filesystem service not available" });
    });
    return router;
  }

  // Get security settings from config
  const securitySettings = {
    allowDirectoryCreation: true,
    restrictedPaths: [
      "/bin",
      "/sbin",
      "/usr/bin",
      "/usr/sbin",
      "/etc/ssl/private",
      "/etc/ssh",
      "/var/lib/ssl/private",
    ],
    allowedRoots: [], // Empty means no restrictions
  };

  // Middleware to check if path is allowed
  const isPathAllowed = (req, res, next) => {
    const requestPath = req.query.path || req.body.path || "";

    // Check against restricted paths
    for (const restrictedPath of securitySettings.restrictedPaths) {
      if (requestPath.startsWith(restrictedPath)) {
        return res.status(403).json({
          success: false,
          error: "Access to this path is restricted",
          statusCode: 403,
        });
      }
    }

    // Check if path is within allowed roots (if specified)
    if (securitySettings.allowedRoots.length > 0) {
      const normalizedPath = fileSystemService.normalizePath(requestPath);
      const isAllowed = securitySettings.allowedRoots.some((root) =>
        normalizedPath.startsWith(root)
      );

      if (!isAllowed) {
        return res.status(403).json({
          success: false,
          error: "Access to this path is not allowed",
          statusCode: 403,
        });
      }
    }

    next();
  };

  /**
   * Get all filesystem locations
   */
  router.get("/locations", async (req, res) => {
    try {
      const locations = fileSystemService.getAllLocations();

      res.json({
        success: true,
        ...locations,
      });
    } catch (error) {
      logger.error("Error getting filesystem locations:", error, FILENAME);
      res.status(500).json({
        success: false,
        message: "Failed to get filesystem locations",
        error: error.message,
      });
    }
  });

  // Get filesystem roots
  router.get("/roots", (req, res) => {
    res.json({
      success: true,
      roots: fileSystemService.getRootLocations(),
    });
  });

  // List directory contents
  router.get("/directory", isPathAllowed, async (req, res) => {
    try {
      const dirPath = req.query.path || "";
      const options = {
        showHidden: req.query.showHidden === "true",
        showSystemFiles: req.query.showSystemFiles === "true",
        sortBy: req.query.sortBy || "name",
        sortDirection: req.query.sortDirection || "asc",
        filter: req.query.filter || null,
      };

      const result = await fileSystemService.listDirectory(dirPath, options);
      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error(`Error listing directory:`, error, FILENAME);

      // Return appropriate error based on the error type
      if (error.code === "ENOENT") {
        res.status(404).json({
          success: false,
          error: "Directory not found",
          statusCode: 404,
        });
      } else if (error.code === "EACCES") {
        res.status(403).json({
          success: false,
          error: "Access denied",
          statusCode: 403,
        });
      } else {
        res.status(500).json({
          success: false,
          error: error.message,
          statusCode: 500,
        });
      }
    }
  });

  // Check if a path exists
  router.get("/check", isPathAllowed, async (req, res) => {
    try {
      const filePath = req.query.path || "";
      const result = await fileSystemService.checkPath(filePath);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error(`Error checking path:`, error, FILENAME);

      if (error.code === "EACCES") {
        res.status(403).json({
          success: false,
          error: "Access denied",
          statusCode: 403,
        });
      } else {
        res.status(500).json({
          success: false,
          error: error.message,
          statusCode: 500,
        });
      }
    }
  });

  // Create a directory
  router.post("/directory", isPathAllowed, async (req, res) => {
    // Check if directory creation is allowed
    if (!securitySettings.allowDirectoryCreation) {
      return res.status(403).json({
        success: false,
        error: "Directory creation is not allowed",
        statusCode: 403,
      });
    }

    try {
      const dirPath = req.body.path;
      const name = req.body.name;

      if (!dirPath) {
        return res.status(400).json({
          success: false,
          error: "Path is required",
          statusCode: 400,
        });
      }

      if (!name) {
        return res.status(400).json({
          success: false,
          error: "Folder name is required",
          statusCode: 400,
        });
      }

      // Combine path and name
      const fullPath = path.join(
        fileSystemService.normalizePath(dirPath),
        name
      );

      const result = await fileSystemService.createDirectory(fullPath);

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error(`Error creating directory:`, error, FILENAME);

      if (error.code === "EACCES") {
        res.status(403).json({
          success: false,
          error: "Access denied",
          statusCode: 403,
        });
      } else {
        res.status(500).json({
          success: false,
          error: error.message,
          statusCode: 500,
        });
      }
    }
  });

  return router;
}

module.exports = filesystemRoutes;
