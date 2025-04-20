const cron = require('node-cron');
const logger = require('./logger');

class SchedulerService {
    constructor(configManager, renewalManager) {
        this.configManager = configManager;
        this.renewalManager = renewalManager;
        this.scheduledTasks = {};
        
        logger.info('Scheduler service initialized');
    }
    
    /**
     * Initialize the scheduler with settings from config
     */
    initialize() {
        try {
            const settings = this.configManager.getGlobalDefaults();
            
            // Set up auto renewal task if enabled
            if (settings.enableAutoRenewalJob) {
                this.scheduleRenewalJob(settings.renewalSchedule);
                logger.info(`Auto-renewal job initialized with schedule: ${settings.renewalSchedule}`);
            } else {
                logger.info('Auto-renewal job disabled in settings');
            }
        } catch (error) {
            logger.error('Failed to initialize scheduler:', error);
        }
    }
    
    /**
     * Schedule the certificate renewal job
     * @param {string} cronSchedule - Cron schedule expression
     * @returns {boolean} Success status
     */
    scheduleRenewalJob(cronSchedule) {
        try {
            // Validate cron expression
            if (!cron.validate(cronSchedule)) {
                logger.error(`Invalid cron schedule: ${cronSchedule}`);
                return false;
            }
            
            // Clear any existing renewal task
            if (this.scheduledTasks.renewalTask) {
                this.scheduledTasks.renewalTask.stop();
                delete this.scheduledTasks.renewalTask;
                logger.info('Previous renewal task stopped');
            }
            
            // Schedule new task
            this.scheduledTasks.renewalTask = cron.schedule(cronSchedule, async () => {
                try {
                    logger.info('Running scheduled certificate renewal check');
                    await this.renewalManager.checkCertificatesForRenewal();
                    logger.info('Scheduled renewal check completed');
                } catch (error) {
                    logger.error('Error in scheduled renewal check:', error);
                }
            }, {
                scheduled: true,
                timezone: "UTC" // Use UTC for consistency
            });
            
            logger.info(`Certificate renewal job scheduled with cron: ${cronSchedule}`);
            return true;
        } catch (error) {
            logger.error(`Failed to schedule renewal job: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Update the renewal schedule
     * @param {Object} settings - New settings object
     */
    updateSchedule(settings) {
        try {
            if (settings.enableAutoRenewalJob && settings.renewalSchedule) {
                const success = this.scheduleRenewalJob(settings.renewalSchedule);
                if (success) {
                    logger.info(`Renewal schedule updated: ${settings.renewalSchedule}`);
                } else {
                    logger.error(`Failed to update renewal schedule with: ${settings.renewalSchedule}`);
                }
                return success;
            } else {
                // Stop the job if auto renewal is disabled
                if (this.scheduledTasks.renewalTask) {
                    this.scheduledTasks.renewalTask.stop();
                    delete this.scheduledTasks.renewalTask;
                    logger.info('Renewal task stopped and disabled');
                }
                return true;
            }
        } catch (error) {
            logger.error(`Error updating renewal schedule: ${error.message}`);
            return false;
        }
    }
    
    /**
     * Run a manual check for certificates needing renewal
     * @returns {Promise} Result of the check
     */
    async runManualCheck() {
        try {
            logger.info('Running manual certificate renewal check');
            const result = await this.renewalManager.checkCertificatesForRenewal();
            logger.info('Manual renewal check completed');
            return {
                success: true,
                message: 'Certificate renewal check completed',
                result
            };
        } catch (error) {
            logger.error('Error in manual renewal check:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    /**
     * Get the next execution time of the renewal job
     * @returns {Object} Next execution info
     */
    getNextExecutionInfo() {
        try {
            if (!this.scheduledTasks.renewalTask) {
                return {
                    scheduled: false,
                    message: 'No renewal job scheduled'
                };
            }
            
            // For node-cron we can't directly get next execution time
            // We need to calculate it based on the cron expression
            const settings = this.configManager.getGlobalDefaults();
            const cronExpression = settings.renewalSchedule;
            
            // Simple calculation for common expressions
            if (cronExpression === '0 0 * * *') {
                return {
                    scheduled: true,
                    message: 'Scheduled to run daily at midnight UTC'
                };
            } else if (cronExpression === '0 0 * * 0') {
                return {
                    scheduled: true,
                    message: 'Scheduled to run weekly on Sundays at midnight UTC'
                };
            } else if (cronExpression === '0 0 1 * *') {
                return {
                    scheduled: true,
                    message: 'Scheduled to run monthly on the 1st at midnight UTC'
                };
            } else {
                return {
                    scheduled: true,
                    expression: cronExpression,
                    message: `Scheduled with cron expression: ${cronExpression}`
                };
            }
        } catch (error) {
            logger.error('Error getting next execution info:', error);
            return {
                scheduled: false,
                error: error.message
            };
        }
    }
    
    /**
     * Set Socket.IO instance for emitting events
     * @param {Object} socketIo - Socket.IO instance
     */
    setSocketIo(socketIo) {
        this.io = socketIo;
    }
}

module.exports = SchedulerService;