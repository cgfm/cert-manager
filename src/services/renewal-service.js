/**
 * @module RenewalService
 * @requires node-cron
 * @requires chokidar
 * @requires path
 * @requires fs
 * @requires logger
 * @version 0.1.0
 * @license MIT
 * @author Christian Meiners
 * @description This module provides a service to automatically renew certificates and watch for new certificates.
 */

const cron = require('node-cron');
const chokidar = require('chokidar');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const deployService = require('./deploy-service');

class RenewalService {
    /**
     * Create a new RenewalService
     * @param {CertificateManager} certificateManager - Certificate manager instance
     * @param {Object} options - Configuration options
     */
    constructor(certificateManager, options = {}) {
        this.certificateManager = certificateManager;
        this.options = {
            renewalSchedule: options.renewalSchedule || '0 0 * * *', // Default: daily at midnight
            renewalCheckInterval: options.renewalCheckInterval || 24, // Hours between checks
            enableWatcher: options.enableWatcher !== false, // Default: enabled
            watcherStabilityThreshold: options.watcherStabilityThreshold || 2000, // ms to wait before processing new files
            disableRenewalCron: options.disableRenewalCron || false // Allow disabling cron for testing
        };
        
        // Make sure options have proper types
        this.options.enableWatcher = !!this.options.enableWatcher;
        this.options.disableRenewalCron = !!this.options.disableRenewalCron;
        
        // Track running tasks to avoid overlapping operations
        this.runningTasks = {
            renewal: false,
            discovery: false
        };
        
        // State for renewal operations
        this.lastRenewalCheck = null;
        this.nextScheduledCheck = null;
        this.renewedCertificates = [];
        
        // Track file watcher and cron job
        this.watcher = null;
        this.cronJob = null;
        this.processingFiles = new Set();
    }
    
    /**
     * Start the renewal service
     * @returns {Promise<void>}
     */
    async start() {
        try {
            // Schedule automatic renewal checks
            if (!this.options.disableRenewalCron) {
                this.scheduleCronJob();
            }
            
            // Set up file watcher if enabled
            if (this.options.enableWatcher) {
                await this.startFileWatcher();
            }
            
            // Perform initial certificate scan and renewal check
            await this.certificateManager.loadCertificates(true);
            
            // Run an initial renewal check
            setTimeout(() => this.checkForRenewals(), 5000);
            
            return true;
        } catch (error) {
            logger.error('Failed to start certificate renewal service:', error);
            throw error;
        }
    }
    
    /**
     * Stop the renewal service
     */
    stop() {
        // Stop the cron job if it exists
        if (this.cronJob) {
            this.cronJob.stop();
            this.cronJob = null;
            logger.info('Certificate renewal cron job stopped');
        }
        
        // Stop the file watcher if it exists
        if (this.watcher) {
            this.watcher.close().then(() => {
                logger.info('Certificate file watcher stopped');
                this.watcher = null;
            }).catch(err => {
                logger.error('Error stopping certificate file watcher:', err);
            });
        }
        
        logger.info('Certificate renewal service stopped');
    }
    
    /**
     * Schedule the certificate renewal cron job
     */
    scheduleCronJob() {
        if (this.cronJob) {
            this.cronJob.stop();
        }
        
        try {
            // Create a cron job for certificate renewal
            this.cronJob = cron.schedule(this.options.renewalSchedule, () => {
                logger.info('Running scheduled certificate renewal check');
                this.checkForRenewals()
                    .then(result => {
                        if (result && result.renewedCount > 0) {
                            logger.info(`Renewed ${result.renewedCount} certificates during scheduled check`);
                        } else {
                            logger.info('No certificates renewed during scheduled check');
                        }
                    })
                    .catch(err => {
                        logger.error('Error during scheduled certificate renewal:', err);
                    });
            }, {
                scheduled: true,
                timezone: 'UTC' // Use UTC timezone for consistency
            });
            
            logger.info(`Certificate renewal cron job scheduled with pattern: ${this.options.renewalSchedule}`);
            
            // Calculate next run time
            const nextRunDate = this.getNextCronRunDate(this.options.renewalSchedule);
            this.nextScheduledCheck = nextRunDate;
            
            logger.info(`Next renewal check scheduled for: ${nextRunDate.toISOString()}`);
            
            return true;
        } catch (error) {
            logger.error('Failed to schedule certificate renewal cron job:', error);
            return false;
        }
    }
    
    /**
     * Calculate the next run date for a cron pattern
     * @param {string} pattern - Cron pattern
     * @returns {Date} Next run date
     */
    getNextCronRunDate(pattern) {
        // This is a simple implementation - for more complex patterns use a cron parser library
        const now = new Date();
        const parts = pattern.split(' ');
        
        // Basic daily pattern - runs at the specified hour
        if (parts.length === 5 && parts[0] === '0' && parts[1] !== '*' && parts[2] === '*') {
            const hour = parseInt(parts[1], 10);
            const next = new Date(now);
            next.setUTCHours(hour, 0, 0, 0);
            
            // If the time has already passed today, move to tomorrow
            if (next <= now) {
                next.setUTCDate(next.getUTCDate() + 1);
            }
            
            return next;
        }
        
        // Default: assume it's daily at midnight UTC
        const next = new Date(now);
        next.setUTCHours(0, 0, 0, 0);
        
        // If midnight has already passed today, set to tomorrow
        if (next <= now) {
            next.setUTCDate(next.getUTCDate() + 1);
        }
        
        return next;
    }
    
    /**
     * Start the file watcher to detect new certificates
     */
    async startFileWatcher() {
        if (this.watcher) {
            await this.watcher.close();
            this.watcher = null;
        }
        
        try {
            // Get the certificates directory
            const certsDir = this.certificateManager.certsDir;
            
            // Make sure the directory exists
            if (!fs.existsSync(certsDir)) {
                fs.mkdirSync(certsDir, { recursive: true });
            }
            
            // Initialize file watcher with chokidar
            this.watcher = chokidar.watch([
                path.join(certsDir, '**/*.crt'),
                path.join(certsDir, '**/*.pem'),
                path.join(certsDir, '**/*.cer'),
                path.join(certsDir, '**/*.cert')
            ], {
                persistent: true,
                ignoreInitial: true,
                awaitWriteFinish: {
                    stabilityThreshold: this.options.watcherStabilityThreshold,
                    pollInterval: 100
                },
                ignored: [
                    '**/node_modules/**',
                    '**/\.*',        // Hidden files
                    '**/backups/**', // Backups directory
                    '**/archive/**'  // Archive directory
                ]
            });
            
            // Set up event handlers
            this.watcher.on('add', (filePath) => this.handleNewCertificateFile(filePath));
            this.watcher.on('change', (filePath) => this.handleChangedCertificateFile(filePath));
            this.watcher.on('error', (error) => {
                logger.error('Certificate file watcher error:', error);
            });
            
            logger.info(`Certificate file watcher started for directory: ${certsDir}`);
            return true;
        } catch (error) {
            logger.error('Failed to start certificate file watcher:', error);
            return false;
        }
    }
    
    /**
     * Handle a newly added certificate file
     * @param {string} filePath - Path to the certificate file
     */
    async handleNewCertificateFile(filePath) {
        // Skip files that are already being processed
        if (this.processingFiles.has(filePath)) {
            return;
        }
        
        try {
            this.processingFiles.add(filePath);
            logger.info(`New certificate file detected: ${filePath}`);
            
            // Wait a bit to ensure the file is fully written and any companion files are added
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Check if the file still exists (it might have been removed during the delay)
            if (!fs.existsSync(filePath)) {
                this.processingFiles.delete(filePath);
                return;
            }
            
            // Load all certificates to discover the new one
            await this.certificateManager.loadCertificates(true);
            
            // Find the most recently added certificate
            // This is a simple heuristic - assumes the newest certificate is the one just added
            const allCerts = this.certificateManager.getAllCertificates();
            const recentCerts = allCerts
                .filter(cert => cert.paths.crtPath === filePath)
                .sort((a, b) => b.modificationTime - a.modificationTime);
            
            if (recentCerts.length > 0) {
                const newCert = recentCerts[0];
                logger.info(`New certificate discovered: ${newCert.name} (${newCert.fingerprint})`);
                
                // Save to configuration
                await this.certificateManager.saveCertificateConfigs();
            } else {
                logger.warn(`Could not find a corresponding certificate for file: ${filePath}`);
            }
        } catch (error) {
            logger.error(`Error processing new certificate file ${filePath}:`, error);
        } finally {
            this.processingFiles.delete(filePath);
        }
    }
    
    /**
     * Handle a changed certificate file
     * @param {string} filePath - Path to the certificate file
     */
    async handleChangedCertificateFile(filePath) {
        try {
            logger.info(`Certificate file changed: ${filePath}`);
            
            // Reload certificates to detect changes
            await this.certificateManager.loadCertificates(true);
            
            // Find the certificate that matches this file
            const allCerts = this.certificateManager.getAllCertificates();
            const matchingCert = allCerts.find(cert => cert.paths.crtPath === filePath);
            
            if (matchingCert) {
                logger.info(`Certificate updated: ${matchingCert.name} (${matchingCert.fingerprint})`);
                
                // If the certificate has deployment actions, execute them
                if (matchingCert.deployActions && matchingCert.deployActions.length > 0) {
                    logger.info(`Executing deployment actions for updated certificate: ${matchingCert.name}`);
                    await matchingCert.executeDeployActions(deployService);
                }
                
                // Save to configuration
                await this.certificateManager.saveCertificateConfigs();
            } else {
                logger.warn(`Could not find a corresponding certificate for changed file: ${filePath}`);
            }
        } catch (error) {
            logger.error(`Error processing changed certificate file ${filePath}:`, error);
        }
    }
    
    /**
     * Check for certificates that need renewal
     * @param {Object} options - Check options
     * @returns {Promise<Object>} Result of the check
     */
    async checkForRenewals(options = {}) {
        // Skip if a renewal task is already running
        if (this.runningTasks.renewal) {
            logger.info('Renewal check skipped: another renewal task is already running');
            return { 
                success: false, 
                skipped: true, 
                reason: 'Another renewal task is already running'
            };
        }
        
        try {
            this.runningTasks.renewal = true;
            
            // Update the last check time
            this.lastRenewalCheck = new Date();
            
            // Load all certificates with a force refresh
            await this.certificateManager.loadCertificates(true);
            
            // Get all certificates
            const allCerts = this.certificateManager.getAllCertificates();
            
            logger.info(`Checking ${allCerts.length} certificates for renewal`);
            
            // Track results
            const result = {
                success: true,
                checkTime: this.lastRenewalCheck,
                total: allCerts.length,
                checked: 0,
                renewalNeeded: 0,
                renewedCount: 0,
                renewalErrors: 0,
                renewed: [],
                failed: []
            };
            
            // Check each certificate
            for (const cert of allCerts) {
                result.checked++;
                
                try {
                    // Skip non-auto-renew certificates unless forced
                    if (!cert.autoRenew && !options.forceAll) {
                        continue;
                    }
                    
                    // Calculate how many days until expiry
                    const daysUntilExpiry = cert.daysUntilExpiry();
                    
                    // Determine if renewal is needed
                    const renewNeeded = daysUntilExpiry >= 0 && daysUntilExpiry <= cert.renewDaysBeforeExpiry;
                    
                    if (renewNeeded || options.forceAll) {
                        result.renewalNeeded++;
                        
                        logger.info(`Certificate ${cert.name} (${cert.fingerprint}) needs renewal (${daysUntilExpiry} days until expiry)`);
                        
                        // Attempt to renew the certificate
                        const renewResult = await this.renewCertificate(cert);
                        
                        if (renewResult.success) {
                            result.renewedCount++;
                            result.renewed.push({
                                fingerprint: cert.fingerprint,
                                name: cert.name,
                                daysUntilExpiry,
                                deploySuccess: renewResult.deploySuccess
                            });
                        } else {
                            result.renewalErrors++;
                            result.failed.push({
                                fingerprint: cert.fingerprint,
                                name: cert.name,
                                error: renewResult.error
                            });
                        }
                    }
                } catch (certError) {
                    logger.error(`Error processing certificate ${cert.name} during renewal check:`, certError);
                    result.renewalErrors++;
                    result.failed.push({
                        fingerprint: cert.fingerprint || 'unknown',
                        name: cert.name || 'unknown',
                        error: certError.message
                    });
                }
            }
            
            // Track renewals for reporting
            this.renewedCertificates = result.renewed;
            
            logger.info(`Renewal check completed: ${result.renewedCount} certificates renewed, ${result.renewalErrors} errors`);
            
            return result;
        } catch (error) {
            logger.error('Error during certificate renewal check:', error);
            
            return {
                success: false,
                error: error.message,
                checkTime: this.lastRenewalCheck
            };
        } finally {
            this.runningTasks.renewal = false;
        }
    }
    
    /**
     * Renew a specific certificate
     * @param {Certificate} certificate - The certificate to renew
     * @returns {Promise<Object>} Result of the renewal operation
     */
    async renewCertificate(certificate) {
        try {
            logger.info(`Attempting to renew certificate: ${certificate.name} (${certificate.fingerprint})`);
            
            // Determine if a signing CA is needed
            let signingCA = null;
            if (certificate.signWithCA && certificate.caFingerprint) {
                signingCA = this.certificateManager.getCertificate(certificate.caFingerprint);
                
                if (!signingCA) {
                    throw new Error(`Signing CA with fingerprint ${certificate.caFingerprint} not found`);
                }
            }
            
            // Get stored passphrase if available
            let certPassphrase = null;
            if (certificate.hasStoredPassphrase(this.certificateManager.passphraseManager)) {
                certPassphrase = certificate.getPassphrase(this.certificateManager.passphraseManager);
            }
            
            // Renew the certificate with deploy actions
            const result = await this.certificateManager.renewAndDeployCertificate(
                certificate.fingerprint,
                {
                    signingCA,
                    passphrase: certPassphrase
                }
            );
            
            // Save certificate configurations
            await this.certificateManager.saveCertificateConfigs();
            
            // Determine if deploy actions were successful
            const deploySuccess = result.deployResult ? result.deployResult.success : true;
            
            logger.info(`Certificate ${certificate.name} renewed successfully`);
            
            // Notify CertificateManager about the change
            certificateManager.notifyCertificateChanged(fingerprint, 'update');
            
            return {
                success: true,
                certificate,
                deploySuccess
            };
        } catch (error) {
            logger.error(`Failed to renew certificate ${certificate.name}:`, error);
            
            return {
                success: false,
                certificate,
                error: error.message
            };
        }
    }
    
    /**
     * Get the status of the renewal service
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            active: !!this.cronJob || !!this.watcher,
            cronActive: !!this.cronJob,
            watcherActive: !!this.watcher,
            lastCheckTime: this.lastRenewalCheck,
            nextScheduledCheck: this.nextScheduledCheck,
            renewalSchedule: this.options.renewalSchedule,
            renewalCheckInterval: this.options.renewalCheckInterval,
            enableWatcher: this.options.enableWatcher,
            recentRenewals: this.renewedCertificates.slice(-10), // Last 10 renewals
            runningTasks: { ...this.runningTasks }
        };
    }
    
    /**
     * Update service configuration
     * @param {Object} options - Updated options
     */
    updateConfig(options) {
        // Update only provided options
        if (options.renewalSchedule !== undefined) {
            this.options.renewalSchedule = options.renewalSchedule;
        }
        
        if (options.renewalCheckInterval !== undefined) {
            this.options.renewalCheckInterval = options.renewalCheckInterval;
        }
        
        if (options.enableWatcher !== undefined) {
            this.options.enableWatcher = !!options.enableWatcher;
        }
        
        if (options.watcherStabilityThreshold !== undefined) {
            this.options.watcherStabilityThreshold = options.watcherStabilityThreshold;
        }
        
        if (options.disableRenewalCron !== undefined) {
            this.options.disableRenewalCron = !!options.disableRenewalCron;
        }
        
        // Apply changes
        if (options.renewalSchedule !== undefined || options.disableRenewalCron !== undefined) {
            // Reschedule cron job
            if (!this.options.disableRenewalCron) {
                this.scheduleCronJob();
            } else if (this.cronJob) {
                this.cronJob.stop();
                this.cronJob = null;
            }
        }
        
        if (options.enableWatcher !== undefined || options.watcherStabilityThreshold !== undefined) {
            // Restart file watcher
            if (this.options.enableWatcher) {
                this.startFileWatcher();
            } else if (this.watcher) {
                this.watcher.close().then(() => {
                    this.watcher = null;
                }).catch(err => {
                    logger.error('Error closing file watcher:', err);
                });
            }
        }
    }
}

module.exports = RenewalService;