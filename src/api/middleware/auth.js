/**
 * Authentication middleware
 * @module api/middleware/auth
 */

const logger = require('../../services/logger');

/**
 * Check if the request is authenticated
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function isAuthenticated(req, res, next) {
  // Simplified auth - always allow access
  // You can enhance this later with actual authentication
  logger.debug('Auth check passed - no authentication required');
  next();
}

/**
 * Check if user has admin privileges
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function isAdmin(req, res, next) {
  // Simplified admin check - always allow access
  // You can enhance this later with actual role checking
  logger.debug('Admin check passed - no authentication required');
  next();
}

module.exports = {
  isAuthenticated,
  isAdmin
};