/**
 * @fileoverview Renewal API Routes - Certificate renewal management endpoints
 * 
 * This module provides endpoints for managing automated certificate renewals:
 * - Status monitoring of renewal service
 * - Manual renewal checks and triggers
 * - File watcher management for certificate changes
 * - Cron job scheduling for automated renewals
 * 
 * Supports both automatic scheduled renewals and manual intervention
 * when certificates need immediate attention.
 * 
 * @module api/routes/renewal
 * @requires express
 * @requires services/logger
 * @author Certificate Manager
 * @since 1.0.0
 */

const express = require('express');
const logger = require('../../services/logger');

const FILENAME = 'api/routes/renewal.js';

/**
 * Initializes the renewal routes with certificate renewal management endpoints
 * 
 * @param {Object} services - Required services for renewal operations
 * @param {Object} services.renewalService - Service for managing certificate renewals
 * @returns {express.Router} Configured Express router with renewal endpoints
 */
function initRenewalRouter(services) {
    const router = express.Router();
    const { renewalService } = services;

    /**
     * GET /api/renewal/status
     * Retrieves the current status of the renewal service
     * 
     * @async
     * @param {express.Request} req - Express request object
     * @param {express.Response} res - Express response object
     * @returns {Promise<void>} JSON response with renewal service status
     */
    // Get renewal service status
    router.get('/status', async (req, res) => {
        try {
            const status = renewalService.getStatus();
            res.json(status);
        } catch (error) {
            logger.error('Error getting renewal service status:', error, FILENAME);
            res.status(500).json({
                message: 'Failed to get renewal service status',
                error: error.message,
                statusCode: 500
            });
        }
    });

    /**
     * POST /api/renewal/check
     * Triggers a manual renewal check for certificates
     * 
     * Request Body:
     * - forceAll: boolean - Force check all certificates regardless of expiry
     * 
     * @async
     * @param {express.Request} req - Express request object with renewal options
     * @param {express.Response} res - Express response object
     * @returns {Promise<void>} JSON response with renewal check results
     */
    // Trigger a manual renewal check
    router.post('/check', async (req, res) => {
        try {
            const options = {
                forceAll: req.body.forceAll === true
            };
            
            const result = await renewalService.checkForRenewals(options);
            res.json(result);
        } catch (error) {
            logger.error('Error triggering renewal check:', error, FILENAME);
            res.status(500).json({
                message: 'Failed to check for renewals',
                error: error.message,
                statusCode: 500
            });
        }
    });

    /**
     * POST /api/renewal/watcher/restart
     * Restarts the file watcher for certificate changes
     * 
     * @async
     * @param {express.Request} req - Express request object
     * @param {express.Response} res - Express response object
     * @returns {Promise<void>} JSON response confirming watcher restart
     */
    // Restart the file watcher
    router.post('/watcher/restart', async (req, res) => {
        try {
            await renewalService.startFileWatcher();
            res.json({
                success: true,
                message: 'File watcher restarted successfully'
            });
        } catch (error) {
            logger.error('Error restarting file watcher:', error, FILENAME);
            res.status(500).json({
                message: 'Failed to restart file watcher',
                error: error.message,
                statusCode: 500
            });
        }
    });

    /**
     * POST /api/renewal/schedule
     * Updates the cron schedule for automatic renewals
     * 
     * Request Body:
     * - schedule: string - Cron expression for renewal schedule (optional)
     * 
     * @async
     * @param {express.Request} req - Express request object with schedule options
     * @param {express.Response} res - Express response object
     * @returns {Promise<void>} JSON response with updated schedule information
     */
    // Reschedule the cron job
    router.post('/schedule', async (req, res) => {
        try {
            // Update schedule if provided
            if (req.body.schedule) {
                renewalService.options.renewalSchedule = req.body.schedule;
            }
            
            const result = renewalService.scheduleCronJob();
            
            if (result) {
                res.json({
                    success: true,
                    message: 'Renewal schedule updated successfully',
                    nextScheduledCheck: renewalService.nextScheduledCheck
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Failed to update renewal schedule',
                    statusCode: 400
                });
            }
        } catch (error) {
            logger.error('Error updating renewal schedule:', error, FILENAME);
            res.status(500).json({
                message: 'Failed to update renewal schedule',
                error: error.message,
                statusCode: 500
            });
        }
    });

    return router;
};

module.exports = initRenewalRouter;