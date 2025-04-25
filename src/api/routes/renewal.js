/**
 * Renewal API Routes
 * This module defines the routes for managing certificate renewals.
 * It provides endpoints to check renewal status, trigger manual checks,
 * restart the file watcher, and reschedule the renewal cron job.
 * @module api/routes/renewal
 * @requires express
 * @requires services/logger
 * @version 0.0.2
 * @license MIT
 * @author Christian Meiners
 * @description This module exports a function that initializes an Express router for handling renewal-related requests.
 * The router provides endpoints to check the renewal service status, trigger manual renewal checks,
 * restart the file watcher, and reschedule the renewal cron job.
 */

const express = require('express');
const logger = require('../../services/logger');

function initRenewalRouter(services) {
    const router = express.Router();
    const { renewalService } = services;

    // Get renewal service status
    router.get('/status', async (req, res) => {
        try {
            const status = renewalService.getStatus();
            res.json(status);
        } catch (error) {
            logger.error('Error getting renewal service status:', error);
            res.status(500).json({
                message: 'Failed to get renewal service status',
                error: error.message,
                statusCode: 500
            });
        }
    });

    // Trigger a manual renewal check
    router.post('/check', async (req, res) => {
        try {
            const options = {
                forceAll: req.body.forceAll === true
            };
            
            const result = await renewalService.checkForRenewals(options);
            res.json(result);
        } catch (error) {
            logger.error('Error triggering renewal check:', error);
            res.status(500).json({
                message: 'Failed to check for renewals',
                error: error.message,
                statusCode: 500
            });
        }
    });

    // Restart the file watcher
    router.post('/watcher/restart', async (req, res) => {
        try {
            await renewalService.startFileWatcher();
            res.json({
                success: true,
                message: 'File watcher restarted successfully'
            });
        } catch (error) {
            logger.error('Error restarting file watcher:', error);
            res.status(500).json({
                message: 'Failed to restart file watcher',
                error: error.message,
                statusCode: 500
            });
        }
    });

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
            logger.error('Error updating renewal schedule:', error);
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