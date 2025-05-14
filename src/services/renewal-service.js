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

const FILENAME = 'services/renewal-service.js';

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
            disableRenewalCron: options.disableRenewalCron || false, // Allow disabling cron for testing
            checkOnStart: options.checkOnStart || false  // New option: whether to run check on startup
        };

        // Make sure options have proper types
        this.options.enableWatcher = !!this.options.enableWatcher;
        this.options.disableRenewalCron = !!this.options.disableRenewalCron;
        this.options.checkOnStart = !!this.options.checkOnStart;

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

        // Add new properties for ignored files
        this.ignoredFiles = new Map(); // Map to store ignored files with their expiration timestamps
        this.defaultIgnoreDuration = options.defaultIgnoreDuration || 150000; // Default ignore duration in milliseconds (2.5 minutes)

        // Set up a cleaner for expired ignored files
        this.ignoreCleanerInterval = setInterval(() => {
            this.cleanupExpiredIgnoredFiles();
        }, 30000); // Clean up every 30 seconds
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

            // Only run an initial renewal check if explicitly requested
            if (this.options.checkOnStart) {
                logger.info('Running initial certificate renewal check', null, FILENAME);
                this.checkForRenewals().catch(err => {
                    logger.error('Error during initial renewal check:', err, FILENAME);
                });
            } else {
                logger.info('Skipping initial certificate renewal check', null, FILENAME);
            }

            return true;
        } catch (error) {
            logger.error('Failed to start certificate renewal service:', error, FILENAME);
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
            logger.info('Certificate renewal cron job stopped', null, FILENAME);
        }

        // Stop the file watcher if it exists
        if (this.watcher) {
            this.watcher.close().then(() => {
                logger.info('Certificate file watcher stopped', null, FILENAME);
                this.watcher = null;
            }).catch(err => {
                logger.error('Error stopping certificate file watcher:', err, FILENAME);
            });
        }
            
        // Clean up the ignore cleaner interval
        if (this.ignoreCleanerInterval) {
            clearInterval(this.ignoreCleanerInterval);
            this.ignoreCleanerInterval = null;
        }

        logger.info('Certificate renewal service stopped', null, FILENAME);
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
                logger.info('Running scheduled certificate renewal check', null, FILENAME);
                this.checkForRenewals()
                    .then(result => {
                        if (result && result.renewedCount > 0) {
                            logger.info(`Renewed ${result.renewedCount} certificates during scheduled check`, null, FILENAME);
                        } else {
                            logger.info('No certificates renewed during scheduled check', null, FILENAME);
                        }
                    })
                    .catch(err => {
                        logger.error('Error during scheduled certificate renewal:', err, FILENAME);
                    });
            }, {
                scheduled: true,
                timezone: 'UTC' // Use UTC timezone for consistency
            });

            logger.info(`Certificate renewal cron job scheduled with pattern: ${this.options.renewalSchedule}`, null, FILENAME);

            // Calculate next run time
            const nextRunDate = this.getNextCronRunDate(this.options.renewalSchedule);
            this.nextScheduledCheck = nextRunDate;

            logger.info(`Next renewal check scheduled for: ${nextRunDate.toISOString()}`, null, FILENAME);

            return true;
        } catch (error) {
            logger.error('Failed to schedule certificate renewal cron job:', error, FILENAME);
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
                path.join(certsDir, '**/*.cert'),
                // Additional certificate-related files
                path.join(certsDir, '**/*.p12'),     // PKCS#12 format
                path.join(certsDir, '**/*.pfx'),     // Another name for PKCS#12
                path.join(certsDir, '**/*.key'),     // Private key files
                path.join(certsDir, '**/*.csr'),     // Certificate signing requests
                path.join(certsDir, '**/*.chain'),   // Certificate chain files
                path.join(certsDir, '**/*.fullchain'), // Full chain files (e.g., Let's Encrypt)
                path.join(certsDir, '**/*.ext')
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
            this.watcher.on('unlink', (filePath) => {
                logger.info(`Certificate file deleted: ${filePath}`, null, FILENAME);
            });
            this.watcher.on('error', (error) => {
                logger.error('Certificate file watcher error:', error, FILENAME);
            });

            logger.info(`Certificate file watcher started for directory: ${certsDir}`, null, FILENAME);
            return true;
        } catch (error) {
            logger.error('Failed to start certificate file watcher:', error, FILENAME);
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

        if (this.isFileIgnored(filePath)) {
            logger.debug(`Ignoring new file event for ignored file: ${filePath}`, null, FILENAME);
            return;
        }

        try {
            this.processingFiles.add(filePath);

            // Determine file type for better logging
            const fileExt = path.extname(filePath).toLowerCase();
            const fileType = this.getFileTypeDescription(fileExt);

            logger.info(`New ${fileType} file detected: ${filePath}`, null, FILENAME);

            // Wait a bit to ensure the file is fully written and any companion files are added
            // Use a shorter wait time for non-primary certificate files
            const isKeyCertificate = ['.crt', '.pem', '.cer', '.cert'].includes(fileExt);
            const stabilityDelay = isKeyCertificate ? 2000 : 1000;

            await new Promise(resolve => setTimeout(resolve, stabilityDelay));

            // Check if the file still exists (it might have been removed during the delay)
            if (!fs.existsSync(filePath)) {
                logger.debug(`File no longer exists, skipping: ${filePath}`, null, FILENAME);
                this.processingFiles.delete(filePath);
                return;
            }

            // For non-primary files, we may want to just check if they belong to an existing cert
            if (!isKeyCertificate) {
                // Try to find related certificate first before full reload
                const baseFilename = path.basename(filePath, fileExt);
                const dirPath = path.dirname(filePath);

                // Look for matching certificate by name pattern before full reload
                const allCerts = this.certificateManager.getAllCertificates();
                const matchingCert = allCerts.find(cert => {
                    const certName = cert.name || '';
                    return certName === baseFilename ||
                        cert.paths.crtPath && path.dirname(cert.paths.crtPath) === dirPath;
                });

                if (matchingCert) {
                    logger.info(`Related file for existing certificate: ${matchingCert.name}`, null, FILENAME);
                    await this.certificateManager.updateCertificatePaths(matchingCert.fingerprint);
                    return;
                }
            }

            // Only if necessary, perform a full reload for new primary certificate files
            await this.certificateManager.loadCertificates(false, filePath);

            // Find the most recently added certificate
            const allCerts = this.certificateManager.getAllCertificates();
            const recentCerts = allCerts
                .filter(cert => {
                    // Match either by direct path or by file basename
                    const directMatch = cert.paths.crtPath === filePath;
                    const baseFilename = path.basename(filePath, path.extname(filePath));
                    const nameMatch = cert.name === baseFilename;

                    return directMatch || nameMatch;
                })
                .sort((a, b) => {
                    // Sort by modification time if available, otherwise by validation dates
                    if (a.modificationTime && b.modificationTime) {
                        return b.modificationTime - a.modificationTime;
                    }
                    return new Date(b.validFrom) - new Date(a.validFrom);
                });

            if (recentCerts.length > 0) {
                const newCert = recentCerts[0];
                logger.info(`Certificate discovered: ${newCert.name} (${newCert.fingerprint})`, null, FILENAME);

                // Save to configuration
                await this.certificateManager.saveCertificateConfigs();
            } else if (isKeyCertificate) {
                // Only warn for primary certificate files
                logger.warn(`Could not find a corresponding certificate for file: ${filePath}`, null, FILENAME);
            }
        } catch (error) {
            logger.error(`Error processing certificate file ${filePath}:`, error, FILENAME);
        } finally {
            this.processingFiles.delete(filePath);
        }
    }

    /**
     * Get a human-readable description of a file type based on extension
     * @param {string} extension - File extension including the dot
     * @returns {string} File type description
     */
    getFileTypeDescription(extension) {
        const extMap = {
            '.crt': 'certificate',
            '.pem': 'PEM certificate',
            '.cer': 'certificate',
            '.cert': 'certificate',
            '.p12': 'PKCS#12 bundle',
            '.pfx': 'PKCS#12 bundle',
            '.key': 'private key',
            '.csr': 'certificate signing request',
            '.chain': 'certificate chain',
            '.fullchain': 'full certificate chain'
        };

        return extMap[extension.toLowerCase()] || 'certificate-related';
    }

    /**
     * Handle a changed certificate file
     * @param {string} filePath - Path to the certificate file
     */
    async handleChangedCertificateFile(filePath) {
        // Skip files that are in the ignore list
        if (this.isFileIgnored(filePath)) {
            logger.debug(`Ignoring change event for ignored file: ${filePath}`, null, FILENAME);
            return;
        }
        
        try {
            logger.info(`Certificate file changed: ${filePath}`, null, FILENAME);

            // Reload certificates to detect changes
            await this.certificateManager.loadCertificates(true);

            // Find the certificate that matches this file
            const allCerts = this.certificateManager.getAllCertificates();
            const matchingCert = allCerts.find(cert => cert.paths.crtPath === filePath);

            if (matchingCert) {
                logger.info(`Certificate updated: ${matchingCert.name} (${matchingCert.fingerprint})`, null, FILENAME);

                // If the certificate has deployment actions, execute them
                if (matchingCert.deployActions && matchingCert.deployActions.length > 0) {
                    logger.info(`Executing deployment actions for updated certificate: ${matchingCert.name}`, null, FILENAME);
                    await matchingCert.executeDeployActions(deployService);
                }

                // Save to configuration
                await this.certificateManager.saveCertificateConfigs();
            } else {
                logger.warn(`Could not find a corresponding certificate for changed file: ${filePath}`, null, FILENAME);
            }
        } catch (error) {
            logger.error(`Error processing changed certificate file ${filePath}:`, error, FILENAME);
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
            logger.info('Renewal check skipped: another renewal task is already running', null, FILENAME);
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

            logger.info(`Checking ${allCerts.length} certificates for renewal`, null, FILENAME);

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

                        logger.info(`Certificate ${cert.name} (${cert.fingerprint}) needs renewal (${daysUntilExpiry} days until expiry)`, null, FILENAME);

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
                    logger.error(`Error processing certificate ${cert.name} during renewal check:`, certError, FILENAME);
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

            logger.info(`Renewal check completed: ${result.renewedCount} certificates renewed, ${result.renewalErrors} errors`, null, FILENAME);

            return result;
        } catch (error) {
            logger.error('Error during certificate renewal check:', error, FILENAME);

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
            logger.info(`Attempting to renew certificate: ${certificate.name} (${certificate.fingerprint})`, null, FILENAME);

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

            logger.info(`Certificate ${certificate.name} renewed successfully`, null, FILENAME);

            // Notify CertificateManager about the change
            certificateManager.notifyCertificateChanged(fingerprint, 'update');

            return {
                success: true,
                certificate,
                deploySuccess
            };
        } catch (error) {
            logger.error(`Failed to renew certificate ${certificate.name}:`, error, FILENAME);

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
                    logger.error('Error closing file watcher:', err, FILENAME);
                });
            }
        }
    }

    /**
     * Add a file path to the ignore list for a specific duration
     * @param {string} filePath - Path to the file to ignore
     * @param {number} [duration=null] - How long to ignore the file in ms (null = use default)
     * @returns {void}
     */
    ignoreFilePath(filePath, duration = null) {
        const normalizedPath = path.normalize(filePath);
        const expireTime = Date.now() + (duration || this.defaultIgnoreDuration);
        
        this.ignoredFiles.set(normalizedPath, expireTime);
        logger.debug(`Added file to ignore list: ${normalizedPath} (will expire in ${(duration || this.defaultIgnoreDuration) / 1000}s)`, null, FILENAME);
    }

    /**
     * Add multiple file paths to the ignore list
     * @param {string[]} filePaths - Array of file paths to ignore
     * @param {number} [duration=null] - How long to ignore the files in ms (null = use default)
     * @returns {void}
     */
    ignoreFilePaths(filePaths, duration = null) {
        if (!Array.isArray(filePaths)) {
            return;
        }
        
        filePaths.forEach(filePath => {
            this.ignoreFilePath(filePath, duration);
        });
        
        logger.debug(`Added ${filePaths.length} files to ignore list`, null, FILENAME);
    }

    /**
     * Check if a file path is currently being ignored
     * @param {string} filePath - Path to check
     * @returns {boolean} - True if the file should be ignored
     */
    isFileIgnored(filePath) {
        const normalizedPath = path.normalize(filePath);
        
        if (!this.ignoredFiles.has(normalizedPath)) {
            return false;
        }
        
        const expireTime = this.ignoredFiles.get(normalizedPath);
        
        // If expired, remove from ignore list and return false
        if (Date.now() > expireTime) {
            this.ignoredFiles.delete(normalizedPath);
            return false;
        }
        
        return true;
    }

    /**
     * Remove a file path from the ignore list
     * @param {string} filePath - Path to remove from ignore list
     * @returns {boolean} - True if the file was removed from the ignore list
     */
    removeFileFromIgnoreList(filePath) {
        const normalizedPath = path.normalize(filePath);
        return this.ignoredFiles.delete(normalizedPath);
    }

    /**
     * Clean up expired entries from the ignored files list
     * @private
     */
    cleanupExpiredIgnoredFiles() {
        const now = Date.now();
        let expiredCount = 0;
        
        for (const [filePath, expireTime] of this.ignoredFiles.entries()) {
            if (now > expireTime) {
                this.ignoredFiles.delete(filePath);
                expiredCount++;
            }
        }
        
        if (expiredCount > 0) {
            logger.debug(`Removed ${expiredCount} expired entries from ignored files list`, null, FILENAME);
        }
    }
}

module.exports = RenewalService;