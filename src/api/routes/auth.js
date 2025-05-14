/**
 * Authentication API Routes
 */
const express = require('express');
const router = express.Router();
const logger = require('../../services/logger');
const jwt = require('jsonwebtoken'); // Add this import

const FILENAME = 'api/routes/auth.js';

/**
 * Initialize authentication router
 * @param {Object} deps - Dependencies
 * @param {AuthMiddleware} deps.authMiddleware - Authentication middleware
 * @param {UserManager} deps.userManager - User manager service
 * @param {ActivityService} deps.activityService - Activity service
 * @returns {express.Router} Express router
 */
function initAuthRouter(deps) {
    const { authMiddleware, userManager, activityService } = deps;

    // Login endpoint
    router.post('/login', async (req, res) => {
        try {
            const { username, password } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Username and password are required'
                });
            }

            // Authenticate user
            const user = await userManager.authenticate(username, password);

            if (!user) {
                logger.debug('Authentication failed: Invalid credentials', { username }, FILENAME);
                return res.json({
                    success: false,
                    message: 'Invalid username or password'
                });
            }

            // Generate JWT token with user information
            const jwtSecret = authMiddleware.getJwtSecret();
            const token = jwt.sign(
                {
                    username: user.username,
                    role: user.role,
                    name: user.name
                },
                jwtSecret,
                { expiresIn: '24h' }
            );

            // Set the token in a cookie (for browser clients)
            res.cookie('authToken', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 24 * 60 * 60 * 1000 // 24 hours
            });

            // Record login activity
            if (activityService) {
                await activityService.recordActivity('login', {
                    username: user.username,
                    ip: req.ip
                }, user);
            }

            // Return success with user info
            const { password: _, ...userWithoutPassword } = user;

            res.json({
                success: true,
                message: 'Authentication successful',
                token,
                user: userWithoutPassword
            });
        } catch (error) {
            logger.error('Login error', { error: error.message }, FILENAME);
            res.status(500).json({
                success: false,
                message: 'An error occurred during login',
                error: error.message
            });
        }
    });

    // Logout endpoint
    router.post('/logout', (req, res) => {
        // Record logout activity
        if (activityService && req.user) {
            activityService.recordActivity('logout', {
                username: req.user.username,
                ip: req.ip
            }, req.user);
        }

        // Clear the auth cookie
        res.clearCookie('authToken');

        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    });

    // Get current user
    router.get('/user', (req, res) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Not authenticated'
            });
        }

        const { password, ...userWithoutPassword } = req.user;
        res.json({
            success: true,
            user: userWithoutPassword
        });
    });

    // Change password route
    router.post('/change-password', async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const { currentPassword, newPassword } = req.body;

            if (!currentPassword || !newPassword) {
                return res.status(400).json({
                    success: false,
                    message: 'Current and new password are required'
                });
            }

            if (newPassword.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: 'New password must be at least 8 characters long'
                });
            }

            await userManager.changePassword(req.user.username, currentPassword, newPassword);

            // Force re-login by clearing token
            res.clearCookie('authToken');

            return res.json({
                success: true,
                message: 'Password changed successfully. Please log in again.'
            });
        } catch (error) {
            logger.error('Error changing password', { error: error.message }, FILENAME);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    });

    // For admin: Get all users
    router.get('/users', (req, res) => {
        try {
            if (!req.user || req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Admin privileges required'
                });
            }

            const users = userManager.getAllUsers();

            return res.json({
                success: true,
                users
            });
        } catch (error) {
            logger.error('Error getting users', { error: error.message }, FILENAME);
            return res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    });

    // For admin: Create user
    router.post('/users', async (req, res) => {
        try {
            if (!req.user || req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Admin privileges required'
                });
            }

            const { username, password, name, role, disabled } = req.body;

            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Username and password are required'
                });
            }

            if (password.length < 8) {
                return res.status(400).json({
                    success: false,
                    message: 'Password must be at least 8 characters long'
                });
            }

            const user = await userManager.createUser({
                username,
                password,
                name,
                role: role || 'user',
                disabled: disabled === true
            });

            return res.status(201).json({
                success: true,
                message: 'User created successfully',
                user
            });
        } catch (error) {
            logger.error('Error creating user', { error: error.message }, FILENAME);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    });

    // For admin: Update user
    router.put('/users/:username', async (req, res) => {
        try {
            if (!req.user || req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Admin privileges required'
                });
            }

            const { username } = req.params;
            const { name, role, password, disabled } = req.body;

            const user = await userManager.updateUser(username, {
                name,
                role,
                password,
                disabled
            });

            return res.json({
                success: true,
                message: 'User updated successfully',
                user
            });
        } catch (error) {
            logger.error('Error updating user', { error: error.message }, FILENAME);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    });

    // For admin: Delete user
    router.delete('/users/:username', async (req, res) => {
        try {
            if (!req.user || req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Admin privileges required'
                });
            }

            const { username } = req.params;

            // Prevent deleting yourself
            if (username === req.user.username) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot delete your own user account'
                });
            }

            await userManager.deleteUser(username);

            return res.json({
                success: true,
                message: 'User deleted successfully'
            });
        } catch (error) {
            logger.error('Error deleting user', { error: error.message }, FILENAME);
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    });

    // Get user API tokens
    router.get('/tokens', async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            // Regular users can only see their own tokens
            // Admins can see all tokens if ?all=true is provided
            const showAll = req.query.all === 'true' && req.user.role === 'admin';
            
            let tokens = [];
            if (showAll) {
                tokens = await userManager.getAllApiTokens();
            } else {
                tokens = await userManager.getUserApiTokens(req.user.username);
            }

            // Never return the actual token value, only metadata
            const sanitizedTokens = tokens.map(token => ({
                id: token.id,
                name: token.name,
                username: token.username,
                createdAt: token.createdAt,
                lastUsed: token.lastUsed,
                expires: token.expires,
                permissions: token.permissions,
                scopes: token.scopes || []
            }));

            return res.json({
                success: true,
                tokens: sanitizedTokens
            });
        } catch (error) {
            logger.error('Error getting API tokens', { error: error.message }, FILENAME);
            return res.status(500).json({
                success: false,
                message: 'Error retrieving API tokens',
                error: error.message
            });
        }
    });

    // Create API token
    router.post('/tokens', async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const { name, expires, scopes, username } = req.body;

            if (!name) {
                return res.status(400).json({
                    success: false,
                    message: 'Token name is required'
                });
            }

            // Admin can create tokens for other users
            const tokenUsername = (req.user.role === 'admin' && username) ? username : req.user.username;

            // Validate scopes (if provided)
            const validScopes = [
                'certificates:read', 'certificates:write',
                'ca:read', 'ca:write',
                'domains:read', 'domains:write',
                'renewal:read', 'renewal:write',
                'system:read', 'system:write'
            ];

            const tokenScopes = scopes || ['certificates:read', 'certificates:write', 'renewal:read'];
            
            const invalidScopes = tokenScopes.filter(scope => !validScopes.includes(scope));
            if (invalidScopes.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid scopes: ${invalidScopes.join(', ')}`,
                    validScopes
                });
            }

            // Create expiration date if specified
            let expiresAt = null;
            if (expires && typeof expires === 'number') {
                expiresAt = new Date(Date.now() + expires * 86400000); // days to milliseconds
            }

            const token = await userManager.createApiToken({
                name,
                username: tokenUsername,
                expires: expiresAt,
                scopes: tokenScopes
            });

            // Record activity
            if (activityService) {
                await activityService.recordActivity('token_created', {
                    tokenId: token.id,
                    name: token.name,
                    username: token.username,
                    createdBy: req.user.username
                }, req.user);
            }

            return res.status(201).json({
                success: true,
                message: 'API token created successfully',
                token: {
                    id: token.id,
                    name: token.name,
                    username: token.username,
                    createdAt: token.createdAt,
                    expires: token.expires,
                    scopes: token.scopes,
                    value: token.value // Only returned once upon creation
                }
            });
        } catch (error) {
            logger.error('Error creating API token', { error: error.message }, FILENAME);
            return res.status(500).json({
                success: false,
                message: 'Error creating API token',
                error: error.message
            });
        }
    });

    // Delete API token
    router.delete('/tokens/:id', async (req, res) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const { id } = req.params;
            
            // Check if token exists and user has permission to delete it
            const token = await userManager.getApiToken(id);
            
            if (!token) {
                return res.status(404).json({
                    success: false,
                    message: 'Token not found'
                });
            }
            
            // Only token owner or admin can delete tokens
            if (token.username !== req.user.username && req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Permission denied'
                });
            }

            await userManager.deleteApiToken(id);
            
            // Record activity
            if (activityService) {
                await activityService.recordActivity('token_deleted', {
                    tokenId: id,
                    name: token.name,
                    username: token.username
                }, req.user);
            }

            return res.json({
                success: true,
                message: 'API token deleted successfully'
            });
        } catch (error) {
            logger.error('Error deleting API token', { error: error.message }, FILENAME);
            return res.status(500).json({
                success: false,
                message: 'Error deleting API token',
                error: error.message
            });
        }
    });

    // For admin: Revoke user token
    router.post('/revoke-token/:id', async (req, res) => {
        try {
            if (!req.user || req.user.role !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Admin privileges required'
                });
            }

            const { id } = req.params;
            
            // Check if token exists
            const token = await userManager.getApiToken(id);
            
            if (!token) {
                return res.status(404).json({
                    success: false,
                    message: 'Token not found'
                });
            }

            await userManager.deleteApiToken(id);
            
            // Record activity
            if (activityService) {
                await activityService.recordActivity('token_revoked', {
                    tokenId: id,
                    name: token.name,
                    username: token.username,
                    revokedBy: req.user.username
                }, req.user);
            }

            return res.json({
                success: true,
                message: `Token '${token.name}' for user ${token.username} successfully revoked`
            });
        } catch (error) {
            logger.error('Error revoking token', { error: error.message }, FILENAME);
            return res.status(500).json({
                success: false,
                message: 'Error revoking token',
                error: error.message
            });
        }
    });

    return router;
}

module.exports = initAuthRouter;