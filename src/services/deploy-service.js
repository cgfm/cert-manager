/**
 * @module DeployService
 * @requires fs
 * @requires path
 * @requires util
 * @requires child_process
 * @requires logger
 * @requires dockerService
 * @requires ssh2-sftp-client
 * @requires smb2
 * @requires basic-ftp
 * @requires axios
 * @requires form-data
 * @requires nodemailer
 * @requires mustache
 * @version 0.0.2
 * @license MIT
 * @author Christian Meiners
 * @description This module exports a singleton instance of DeployService that provides methods to execute deployment actions for certificates.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { execSync } = require('child_process');
const { promisify } = require('util');
const logger = require('./logger');
const dockerService = require('./docker-service');

const FILENAME = 'services/deploy-service.js';

// Dynamically load optional dependencies 
let SftpClient, SMB2, ftp, axios, FormData, nodemailer, Mustache;
try {
    SftpClient = require('ssh2-sftp-client');
} catch (e) {
    logger.warn('ssh2-sftp-client module not found. SSH deployment will not be available.', null, FILENAME);
}

try {
    SMB2 = require('smb2');
} catch (e) {
    logger.warn('smb2 module not found. SMB deployment will not be available.', null, FILENAME);
}

try {
    ftp = require('basic-ftp');
} catch (e) {
    logger.warn('basic-ftp module not found. FTP deployment will not be available.', null, FILENAME);
}

try {
    axios = require('axios');
} catch (e) {
    logger.warn('axios module not found. API deployment will not be available.', null, FILENAME);
}

try {
    FormData = require('form-data');
} catch (e) {
    logger.warn('form-data module not found. API file uploads will not be available.', null, FILENAME);
}

try {
    nodemailer = require('nodemailer');
} catch (e) {
    logger.warn('nodemailer module not found. Email notifications will not be available.', null, FILENAME);
}

try {
    Mustache = require('mustache');
} catch (e) {
    logger.warn('mustache module not found. Advanced template rendering will not be available.', null, FILENAME);
}

const execAsync = promisify(exec);

/**
 * Service to handle certificate deployment actions
 */
class DeployService {
    /**
     * Execute deployment actions for a certificate
     * @param {Certificate} certificate - Certificate object
     * @param {Array} actions - Deployment actions to execute
     * @returns {Promise<Object>} Result of deployment operations
     */
    async executeDeployActions(certificate, actions = null) {
        // Use certificate's own actions if none provided
        const deployActions = actions || certificate.deployActions || [];

        logger.finest(`executeDeployActions called for certificate: ${certificate.name}`, {
            actionsCount: deployActions.length,
            fingerprint: certificate.fingerprint
        }, FILENAME);

        if (!deployActions.length) {
            logger.info(`No deployment actions defined for certificate: ${certificate.name}`, null, FILENAME);
            return { success: true, actionsExecuted: 0 };
        }

        logger.info(`Executing ${deployActions.length} deployment actions for certificate: ${certificate.name}`, null, FILENAME);
        logger.debug(`Actions to execute: ${JSON.stringify(deployActions.map(a => ({ type: a.type, name: a.name })))}`, null, FILENAME);

        const results = {
            success: true,
            actionsExecuted: 0,
            failures: [],
            details: []
        };

        // Execute each action in sequence
        for (const action of deployActions) {
            try {
                logger.debug(`Executing deployment action: ${action.type} - ${action.name || 'unnamed'}`, null, FILENAME);
                logger.finest(`Action details: ${JSON.stringify(action, (key, value) =>
                    ['password', 'passphrase', 'privateKey'].includes(key) ? '***' : value)}`, null, FILENAME);

                let actionResult;

                switch (action.type) {
                    case 'copy':
                        logger.debug(`Executing copy action for ${certificate.name}`, null, FILENAME);
                        actionResult = await this.executeCopyAction(certificate, action);
                        break;

                    case 'command':
                        logger.debug(`Executing command action for ${certificate.name}: ${action.command && action.command.substring(0, 50)}${action.command && action.command.length > 50 ? '...' : ''}`, null, FILENAME);
                        actionResult = await this.executeCommandAction(certificate, action);
                        break;

                    case 'docker-restart':
                        logger.debug(`Executing Docker restart action for ${certificate.name}`, null, FILENAME);
                        actionResult = await this.executeDockerRestartAction(certificate, action);
                        break;

                    case 'nginx-proxy-manager':
                        logger.debug(`Executing Nginx Proxy Manager action for ${certificate.name}`, null, FILENAME);
                        actionResult = await this.executeNginxProxyManagerAction(certificate, action);
                        break;

                    case 'ssh-copy':
                        logger.debug(`Executing SSH copy action for ${certificate.name}`, null, FILENAME);
                        actionResult = await this.executeSshCopyAction(certificate, action);
                        break;

                    case 'smb-copy':
                        logger.debug(`Executing SMB copy action for ${certificate.name}`, null, FILENAME);
                        actionResult = await this.executeSmbCopyAction(certificate, action);
                        break;

                    case 'ftp-copy':
                        logger.debug(`Executing FTP copy action for ${certificate.name}`, null, FILENAME);
                        actionResult = await this.executeFtpCopyAction(certificate, action);
                        break;

                    case 'api-call':
                        logger.debug(`Executing API call action for ${certificate.name}`, null, FILENAME);
                        actionResult = await this.executeApiCallAction(certificate, action);
                        break;

                    case 'webhook':
                        logger.debug(`Executing webhook action for ${certificate.name}`, null, FILENAME);
                        actionResult = await this.executeWebhookAction(certificate, action);
                        break;

                    case 'email':
                        logger.debug(`Executing email action for ${certificate.name}`, null, FILENAME);
                        actionResult = await this.executeEmailAction(certificate, action);
                        break;

                    default:
                        logger.warn(`Unknown action type: ${action.type}`, null, FILENAME);
                        throw new Error(`Unknown action type: ${action.type}`);
                }

                results.actionsExecuted++;
                results.details.push({
                    type: action.type,
                    success: true,
                    message: actionResult.message || 'Action completed successfully'
                });

                logger.info(`Deployment action ${action.type} completed successfully`, {
                    certName: certificate.name,
                    action
                });
                logger.fine(`Action result: ${JSON.stringify(actionResult)}`, null, FILENAME);
            } catch (error) {
                results.success = false;
                results.failures.push({
                    type: action.type,
                    error: error.message,
                    action
                });

                results.details.push({
                    type: action.type,
                    success: false,
                    message: error.message
                });

                logger.error(`Deployment action ${action.type} failed`, {
                    certName: certificate.name,
                    action,
                    error
                });
            }
        }
        logger.info(`Completed deployment actions for certificate: ${certificate.name}`, null, FILENAME);
        return results;
    }

    /**
     * Execute a copy action
     * @param {Certificate} certificate - Certificate object
     * @param {Object} action - Copy action configuration
     * @returns {Promise<Object>} Result of the copy operation
     */
    async executeCopyAction(certificate, action) {
        logger.finest(`executeCopyAction called for certificate: ${certificate.name}`, {
            fingerprint: certificate.fingerprint,
            action
        }, FILENAME);

        if (!action.source) {
            logger.error('Copy action missing required source property', null, FILENAME);
            throw new Error('Copy action requires a source property');
        }

        if (!action.destination) {
            logger.error('Copy action missing required destination property', null, FILENAME);
            throw new Error('Copy action requires a destination property');
        }

        try {
            // Determine source file
            const sourcePath = this._getCertificateFile(certificate, action.source);
            logger.debug(`Copy action source resolved to: ${sourcePath}`, null, FILENAME);

            if (!fs.existsSync(sourcePath)) {
                logger.error(`Source file does not exist: ${sourcePath}`, null, FILENAME);
                throw new Error(`Source file does not exist: ${sourcePath}`);
            }
            logger.fine(`Source file exists: ${sourcePath}`, null, FILENAME);

            // Get file stats for debugging
            const sourceStats = fs.statSync(sourcePath);
            logger.finest(`Source file stats: size=${sourceStats.size}, modified=${sourceStats.mtime}`, null, FILENAME);

            // Ensure destination directory exists
            const destinationDir = path.dirname(action.destination);
            logger.debug(`Ensuring destination directory exists: ${destinationDir}`, null, FILENAME);

            if (!fs.existsSync(destinationDir)) {
                logger.info(`Creating destination directory: ${destinationDir}`, null, FILENAME);
                fs.mkdirSync(destinationDir, { recursive: true });
            }

            // Check if destination file already exists
            const destinationExists = fs.existsSync(action.destination);
            if (destinationExists) {
                const destStats = fs.statSync(action.destination);
                logger.debug(`Destination file already exists: ${action.destination}, size=${destStats.size}, modified=${destStats.mtime}`, null, FILENAME);
            } else {
                logger.debug(`Destination file does not exist yet: ${action.destination}`, null, FILENAME);
            }

            // Copy the file
            logger.info(`Copying ${sourcePath} to ${action.destination}`, null, FILENAME);
            fs.copyFileSync(sourcePath, action.destination);
            logger.fine(`File copied successfully`, null, FILENAME);

            // Verify the copy was successful
            if (fs.existsSync(action.destination)) {
                const newDestStats = fs.statSync(action.destination);
                logger.debug(`Verified destination file exists: ${action.destination}, size=${newDestStats.size}, modified=${newDestStats.mtime}`, null, FILENAME);

                // Check if file sizes match
                if (newDestStats.size !== sourceStats.size) {
                    logger.warn(`File sizes don't match after copy: source=${sourceStats.size}, destination=${newDestStats.size}`, null, FILENAME);
                } else {
                    logger.finest(`File sizes match after copy: ${sourceStats.size} bytes`, null, FILENAME);
                }
            } else {
                logger.error(`Failed to verify copied file: ${action.destination} does not exist after copy`, null, FILENAME);
            }

            // Set file permissions if specified (Unix/Linux only)
            if (action.permissions && process.platform !== 'win32') {
                try {
                    logger.debug(`Setting permissions on ${action.destination}: ${action.permissions.toString(8)}`, null, FILENAME);
                    fs.chmodSync(action.destination, action.permissions);
                    logger.fine(`Permissions set successfully on ${action.destination}`, null, FILENAME);
                } catch (error) {
                    logger.warn(`Could not set permissions on ${action.destination}: ${error.message}`, error, FILENAME);
                }
            } else if (action.permissions && process.platform === 'win32') {
                logger.debug(`Skipping permission settings on Windows platform`, null, FILENAME);
            }

            logger.info(`Copy action completed successfully: ${sourcePath} → ${action.destination}`, null, FILENAME);
            return {
                success: true,
                message: `File copied to ${action.destination}`,
                sourcePath,
                destination: action.destination
            };
        } catch (error) {
            logger.error(`Copy action failed: ${error.message}`, error, FILENAME);
            throw error;
        }
    }

    /**
     * Helper method to get the actual file path for a certificate component
     * @private
     * @param {Certificate} certificate - Certificate object
     * @param {string} fileType - Type of file to get (cert, key, chain, etc.)
     * @returns {string} Path to the requested file
     */
    _getCertificateFile(certificate, fileType) {
        switch (fileType) {
            case 'cert':
                return certificate.paths.crtPath;
            case 'key':
                return certificate.paths.keyPath;
            case 'chain':
                return certificate.paths.chainPath;
            case 'fullchain':
                return certificate.paths.fullchainPath;
            case 'p12':
                return certificate.paths.p12Path;
            case 'pem':
                return certificate.paths.pemPath;
            default:
                // If it's not a known type, assume it's a direct file path
                return fileType;
        }
    }

    /**
     * Execute a shell command action
     * @param {Certificate} certificate - Certificate object
     * @param {Object} action - Command action configuration
     * @returns {Promise<Object>} Result of the command execution
     */
    async executeCommandAction(certificate, action) {
        logger.finest(`executeCommandAction called for ${certificate.name}`, null, FILENAME);

        if (!action.command) {
            throw new Error('Command action requires a command property');
        }

        // Replace placeholders in command with actual values
        const rawCommand = action.command;
        const command = this._replacePlaceholders(action.command, certificate);

        logger.debug(`Raw command: ${rawCommand}`, null, FILENAME);
        logger.debug(`Processed command: ${command}`, null, FILENAME);

        // Set up options for command execution
        const options = { shell: true };

        // Set working directory if specified
        if (action.cwd) {
            options.cwd = action.cwd;
            logger.debug(`Using working directory: ${action.cwd}`, null, FILENAME);
        }

        // Set environment variables if specified
        if (action.env) {
            options.env = { ...process.env, ...action.env };
            logger.debug(`Added custom environment variables: ${Object.keys(action.env).join(', ')}`, null, FILENAME);
        }

        // Execute the command
        logger.info(`Executing command: ${command.substring(0, 100)}${command.length > 100 ? '...' : ''}`, null, FILENAME);

        try {
            logger.debug(`Starting command execution with options: ${JSON.stringify({
                cwd: options.cwd || process.cwd(),
                env: options.env ? 'Custom env vars set' : 'Default env vars',
                shell: options.shell
            })}`, null, FILENAME);

            const { stdout, stderr } = await execAsync(command, options);

            // Log command output
            if (action.verbose || logger.getLevel() <= logger.levels.FINEST) {
                logger.finest(`Command stdout: ${stdout}`, null, FILENAME);
                if (stderr) {
                    logger.finest(`Command stderr: ${stderr}`, null, FILENAME);
                }
            } else {
                // Always log at debug level, but truncate if not verbose mode
                logger.debug(`Command stdout (truncated): ${stdout.substring(0, 200)}${stdout.length > 200 ? '...' : ''}`, null, FILENAME);
                if (stderr) {
                    logger.debug(`Command stderr (truncated): ${stderr.substring(0, 200)}${stderr.length > 200 ? '...' : ''}`, null, FILENAME);
                }
            }

            logger.info(`Command executed successfully`, null, FILENAME);

            return {
                success: true,
                message: `Command executed successfully`,
                command,
                stdout,
                stderr
            };
        } catch (error) {
            logger.error(`Command execution failed: ${error.message}`, error, FILENAME);

            if (error.stdout) {
                logger.debug(`Failed command stdout: ${error.stdout}`, null, FILENAME);
            }

            if (error.stderr) {
                logger.debug(`Failed command stderr: ${error.stderr}`, null, FILENAME);
            }

            throw new Error(`Command execution failed: ${error.message}`);
        }
    }

    /**
     * Execute a Docker container restart action
     * @param {Certificate} certificate - Certificate object
     * @param {Object} action - Docker restart action configuration
     * @returns {Promise<Object>} Result of the Docker restart
     */
    async executeDockerRestartAction(certificate, action) {
        logger.finest(`executeDockerRestartAction called for certificate: ${certificate.name}`, {
            fingerprint: certificate.fingerprint,
            action
        }, FILENAME);

        // Prioritize container name over ID since names are stable across recreations
        if (!action.containerName && !action.containerId) {
            logger.error('Docker restart action missing required containerName or containerId property', null, FILENAME);
            throw new Error('Docker restart action requires containerName or containerId property');
        }

        // Check if Docker is available
        logger.debug('Checking if Docker is available', null, FILENAME);
        if (!dockerService.isAvailable) {
            logger.error('Docker is not available for container restart', null, FILENAME);
            throw new Error('Docker is not available');
        }
        logger.debug('Docker is available', null, FILENAME);

        try {
            // Get list of available containers to find by name or ID
            logger.debug('Fetching available Docker containers', null, FILENAME);
            const containers = await dockerService.getContainers();
            logger.finest(`Found ${containers.length} Docker containers`, null, FILENAME);

            // For debugging, log all containers found
            containers.forEach(c => {
                const containerNames = c.Names?.map(n => n.replace(/^\//, ''))?.join(', ') || 'unnamed';
                logger.finest(`Docker container: ID=${c.Id.substring(0, 12)}, Names=${containerNames}, State=${c.State}`, null, FILENAME);
            });

            // First try to find by name (preferred method)
            let container = null;
            let containerIdentifier = '';

            if (action.containerName) {
                logger.debug(`Looking for container by name: ${action.containerName}`, null, FILENAME);

                // Find container by name - normalize the container name
                // Docker API returns names with leading slash, so we need to handle both formats
                const normalizedName = action.containerName.replace(/^\//, '');

                container = containers.find(c => {
                    return c.Names?.some(name => name.replace(/^\//, '') === normalizedName);
                });

                if (container) {
                    containerIdentifier = action.containerName;
                    logger.debug(`Found container by name: ${containerIdentifier} (ID: ${container.Id.substring(0, 12)})`, null, FILENAME);
                } else {
                    logger.warn(`Container with name "${action.containerName}" not found`, null, FILENAME);

                    // Log available container names to help the user
                    const availableContainers = containers
                        .map(c => c.Names?.map(n => n.replace(/^\//, ''))?.join(', '))
                        .filter(Boolean)
                        .join(', ');

                    logger.debug(`Available container names: ${availableContainers || 'none'}`, null, FILENAME);
                }
            }

            // If not found by name, try ID as fallback
            if (!container && action.containerId) {
                logger.debug(`Looking for container by ID: ${action.containerId}`, null, FILENAME);

                // We might have a full ID or short ID
                container = containers.find(c => {
                    return c.Id === action.containerId || c.Id.startsWith(action.containerId);
                });

                if (container) {
                    containerIdentifier = action.containerId;
                    logger.debug(`Found container by ID: ${containerIdentifier.substring(0, 12)}`, null, FILENAME);

                    // Get the name for this container for logging
                    const containerName = container.Names && container.Names.length > 0
                        ? container.Names[0].replace(/^\//, '')
                        : 'unnamed';

                    logger.info(`Container ID ${containerIdentifier.substring(0, 12)} resolves to name: ${containerName}`, null, FILENAME);

                    // Store the actual container name for future use
                    // This helps future deployments work even if the ID changes
                    action.containerName = containerName;
                } else {
                    logger.error(`Container with ID "${action.containerId}" not found`, null, FILENAME);

                    // Log available container IDs to help the user
                    const availableIds = containers.map(c => `${c.Id.substring(0, 12)} (${c.Names?.map(n => n.replace(/^\//, ''))?.join(', ') || 'unnamed'})`).join(', ');
                    logger.debug(`Available containers: ${availableIds || 'none'}`, null, FILENAME);

                    throw new Error(`Container with ID "${action.containerId.substring(0, 12)}" not found. Available containers: ${availableIds.substring(0, 200)}${availableIds.length > 200 ? '...' : ''}`);
                }
            }

            if (!container) {
                const errorMsg = action.containerName
                    ? `Container with name "${action.containerName}" not found`
                    : 'No container found matching the provided criteria';

                logger.error(errorMsg, null, FILENAME);

                // List available containers to help
                const availableContainers = containers
                    .map(c => `${c.Names?.map(n => n.replace(/^\//, ''))?.join(', ') || 'unnamed'} (${c.Id.substring(0, 12)})`)
                    .join(', ');

                throw new Error(`${errorMsg}. Available containers: ${availableContainers.substring(0, 200)}${availableContainers.length > 200 ? '...' : ''}`);
            }

            // Get container state before restart
            const containerId = container.Id;
            const containerName = container.Names?.[0]?.replace(/^\//, '') || 'unnamed';

            logger.debug(`Checking container state before restart: ${containerName} (${containerId.substring(0, 12)})`, null, FILENAME);

            try {
                const containerInfo = await dockerService.docker.getContainer(containerId).inspect();
                logger.debug(`Container state before restart: ${containerInfo.State.Status}`, null, FILENAME);

                // Restart the container
                logger.info(`Restarting Docker container: ${containerName} (${containerId.substring(0, 12)})`, null, FILENAME);
                await dockerService.restartContainer(containerId);
                logger.fine(`Docker restart command sent successfully to container: ${containerName}`, null, FILENAME);

                // Verify container state after restart
                logger.debug(`Waiting 2 seconds for container restart to complete`, null, FILENAME);
                await new Promise(resolve => setTimeout(resolve, 2000));

                const containerInfoAfter = await dockerService.docker.getContainer(containerId).inspect();
                logger.debug(`Container state after restart: ${containerInfoAfter.State.Status}`, null, FILENAME);

                if (containerInfoAfter.State.Status !== 'running') {
                    logger.warn(`Container ${containerName} may not be running properly after restart: ${containerInfoAfter.State.Status}`, null, FILENAME);
                } else {
                    logger.fine(`Container ${containerName} is running after restart`, null, FILENAME);
                }

                logger.info(`Docker container restart completed successfully: ${containerName}`, null, FILENAME);

                return {
                    success: true,
                    message: `Docker container "${containerName}" restarted successfully`,
                    containerId: containerId.substring(0, 12),
                    containerName: containerName
                };
            } catch (containerError) {
                logger.error(`Error restarting container ${containerName}: ${containerError.message}`, containerError, FILENAME);
                throw containerError;
            }
        } catch (error) {
            logger.error(`Docker restart action failed: ${error.message}`, error, FILENAME);
            throw error;
        }
    }

    /**
     * Execute a Nginx Proxy Manager certificate update action
     * @param {Certificate} certificate - Certificate object
     * @param {Object} action - Nginx Proxy Manager action configuration
     * @returns {Promise<Object>} Result of the NPM update
     */
    async executeNginxProxyManagerAction(certificate, action) {
        logger.finest(`executeNginxProxyManagerAction called for certificate: ${certificate.name}`, {
            fingerprint: certificate.fingerprint,
            action
        }, FILENAME);

        if (!action.npmPath && !action.dockerContainer && !action.useAPI) {
            // Try to load global settings if not provided in action
            logger.debug('No Nginx Proxy Manager path specified, checking global settings', null, FILENAME);

            try {
                // Load global settings
                const fs = require('fs');
                const path = require('path');
                const configDir = process.env.CONFIG_DIR || path.join(process.cwd(), 'config');
                const settingsPath = path.join(configDir, 'deployment-settings.json');

                if (fs.existsSync(settingsPath)) {
                    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

                    if (settings?.deployment?.nginxProxyManager?.host) {
                        logger.debug('Using global Nginx Proxy Manager API settings', null, FILENAME);

                        // Make a copy of the action to not modify the original
                        action = { ...action };

                        // Use API mode with global settings
                        action.useAPI = true;
                        action.npmHost = settings.deployment.nginxProxyManager.host;
                        action.npmPort = settings.deployment.nginxProxyManager.port || 81;
                        action.npmUseHttps = settings.deployment.nginxProxyManager.useHttps;
                        action.npmUsername = settings.deployment.nginxProxyManager.username;
                        action.npmPassword = settings.deployment.nginxProxyManager.password;
                        action.npmAccessToken = settings.deployment.nginxProxyManager.accessToken;
                        action.npmRefreshToken = settings.deployment.nginxProxyManager.refreshToken;
                        action.npmTokenExpiry = settings.deployment.nginxProxyManager.tokenExpiry;

                        logger.fine(`Using global NPM settings: ${action.npmHost}:${action.npmPort}`, null, FILENAME);
                    }
                }
            } catch (settingsError) {
                logger.warn(`Failed to load global NPM settings: ${settingsError.message}`, null, FILENAME);
            }
        }

        if (!action.npmPath && !action.dockerContainer && !action.useAPI) {
            logger.error('Nginx Proxy Manager action missing required npmPath, dockerContainer, or API settings', null, FILENAME);
            throw new Error('Nginx Proxy Manager action requires npmPath, dockerContainer property, or API settings');
        }

        // Handle API mode for Nginx Proxy Manager
        if (action.useAPI) {
            return await this._executeNginxProxyManagerAPIAction(certificate, action);
        }

        // Check if we have all required certificate files
        logger.debug('Checking if certificate files exist', null, FILENAME);
        if (!certificate.paths.crtPath || !certificate.paths.keyPath) {
            logger.error('Certificate and key files are required for Nginx Proxy Manager update', null, FILENAME);
            throw new Error('Certificate and key files are required for Nginx Proxy Manager update');
        }

        logger.debug(`Certificate file: ${certificate.paths.crtPath}, exists: ${fs.existsSync(certificate.paths.crtPath)}`, null, FILENAME);
        logger.debug(`Key file: ${certificate.paths.keyPath}, exists: ${fs.existsSync(certificate.paths.keyPath)}`, null, FILENAME);

        let npmLetsEncryptDir;

        try {
            // Determine Nginx Proxy Manager path
            if (action.npmPath) {
                // Direct path to Nginx Proxy Manager installation
                npmLetsEncryptDir = path.join(action.npmPath, 'letsencrypt');
                logger.debug(`Using local NPM path: ${npmLetsEncryptDir}`, null, FILENAME);

                if (!fs.existsSync(action.npmPath)) {
                    logger.error(`NPM path doesn't exist: ${action.npmPath}`, null, FILENAME);
                    throw new Error(`NPM path doesn't exist: ${action.npmPath}`);
                }

                if (!fs.existsSync(npmLetsEncryptDir)) {
                    logger.warn(`NPM letsencrypt directory doesn't exist, creating: ${npmLetsEncryptDir}`, null, FILENAME);
                    fs.mkdirSync(npmLetsEncryptDir, { recursive: true });
                }
            } else {
                // Docker container-based Nginx Proxy Manager
                logger.debug('Using Docker container for NPM deployment', null, FILENAME);

                logger.debug('Checking if Docker is available', null, FILENAME);
                if (!dockerService.isAvailable) {
                    logger.error('Docker is not available for Nginx Proxy Manager container access', null, FILENAME);
                    throw new Error('Docker is not available for Nginx Proxy Manager container access');
                }
                logger.debug('Docker is available', null, FILENAME);

                // Find the container
                logger.debug(`Looking for NPM container: ${action.dockerContainer}`, null, FILENAME);
                const containers = await dockerService.getContainers();
                logger.finest(`Found ${containers.length} Docker containers`, null, FILENAME);

                // For debugging, log found containers
                containers.forEach(c => {
                    logger.finest(`Docker container: ID=${c.Id.substring(0, 12)}, Names=${c.Names.join(', ')}, State=${c.State}`, null, FILENAME);
                });

                const container = containers.find(c => {
                    return c.Names.some(name => name.replace(/^\//, '') === action.dockerContainer);
                });

                if (!container) {
                    logger.error(`Docker container not found with name: ${action.dockerContainer}`, null, FILENAME);
                    throw new Error(`Docker container not found with name: ${action.dockerContainer}`);
                }
                logger.debug(`Found NPM container: ${container.Id.substring(0, 12)}`, null, FILENAME);

                // Create a temp directory for NPM certificate files
                const tempNpmDir = path.join(os.tmpdir(), 'npm-cert-update', certificate.fingerprint);
                logger.debug(`Creating temp directory for NPM certificate files: ${tempNpmDir}`, null, FILENAME);
                await fs.promises.mkdir(tempNpmDir, { recursive: true });
                logger.fine(`Temp directory created: ${tempNpmDir}`, null, FILENAME);

                // Copy certificate files to temp directory
                const certTempPath = path.join(tempNpmDir, 'fullchain.pem');
                const keyTempPath = path.join(tempNpmDir, 'privkey.pem');

                logger.debug(`Copying certificate to temp file: ${certTempPath}`, null, FILENAME);
                await fs.promises.copyFile(certificate.paths.crtPath, certTempPath);

                logger.debug(`Copying key to temp file: ${keyTempPath}`, null, FILENAME);
                await fs.promises.copyFile(certificate.paths.keyPath, keyTempPath);

                logger.fine(`Certificate files copied to temp directory`, null, FILENAME);

                // Copy files to container
                const dockerContainer = dockerService.docker.getContainer(container.Id);

                // Determine the NPM letsencrypt directory inside the container
                const npmContainerDir = '/etc/letsencrypt/live/custom-' + certificate.name.replace(/\./g, '-');
                logger.debug(`Target directory in NPM container: ${npmContainerDir}`, null, FILENAME);

                // Ensure directory exists in container
                logger.debug(`Creating directory in container: ${npmContainerDir}`, null, FILENAME);
                const mkdirCommand = `docker exec ${container.Id} mkdir -p ${npmContainerDir}`;
                logger.finest(`Executing command: ${mkdirCommand}`, null, FILENAME);

                const mkdirResult = await execAsync(mkdirCommand);
                logger.finest(`mkdir result: ${JSON.stringify(mkdirResult)}`, null, FILENAME);

                // Copy files to container
                logger.debug(`Copying certificate to container: ${npmContainerDir}/fullchain.pem`, null, FILENAME);
                const certCopyCommand = `docker cp ${certTempPath} ${container.Id}:${npmContainerDir}/fullchain.pem`;
                logger.finest(`Executing command: ${certCopyCommand}`, null, FILENAME);

                const certCopyResult = await execAsync(certCopyCommand);
                logger.finest(`Certificate copy result: ${JSON.stringify(certCopyResult)}`, null, FILENAME);

                logger.debug(`Copying key to container: ${npmContainerDir}/privkey.pem`, null, FILENAME);
                const keyCopyCommand = `docker cp ${keyTempPath} ${container.Id}:${npmContainerDir}/privkey.pem`;
                logger.finest(`Executing command: ${keyCopyCommand}`, null, FILENAME);

                const keyCopyResult = await execAsync(keyCopyCommand);
                logger.finest(`Key copy result: ${JSON.stringify(keyCopyResult)}`, null, FILENAME);

                // Verify files were copied correctly
                logger.debug(`Verifying files were copied to container`, null, FILENAME);
                const verifyCommand = `docker exec ${container.Id} ls -la ${npmContainerDir}/`;
                logger.finest(`Executing command: ${verifyCommand}`, null, FILENAME);

                try {
                    const verifyResult = await execAsync(verifyCommand);
                    logger.debug(`Files in container directory: ${verifyResult.stdout}`, null, FILENAME);
                } catch (verifyError) {
                    logger.warn(`Could not verify files in container: ${verifyError.message}`, null, FILENAME);
                }

                // Clean up temp directory
                logger.debug(`Cleaning up temp directory: ${tempNpmDir}`, null, FILENAME);
                await fs.promises.rm(tempNpmDir, { recursive: true, force: true });
                logger.fine(`Temp directory removed`, null, FILENAME);

                // Restart the container to apply changes
                logger.info(`Restarting NPM container to apply changes: ${action.dockerContainer}`, null, FILENAME);
                await dockerService.restartContainer(container.Id);
                logger.fine(`NPM container restart initiated`, null, FILENAME);

                // Wait a moment to allow the container to restart
                logger.debug(`Waiting 3 seconds for container restart...`, null, FILENAME);
                await new Promise(resolve => setTimeout(resolve, 3000));

                // Check container status after restart
                try {
                    const containerInfo = await dockerService.docker.getContainer(container.Id).inspect();
                    logger.debug(`Container status after restart: ${containerInfo.State.Status}`, null, FILENAME);

                    if (containerInfo.State.Status !== 'running') {
                        logger.warn(`Container may not have restarted properly: ${containerInfo.State.Status}`, null, FILENAME);
                    } else {
                        logger.fine(`Container is running after restart`, null, FILENAME);
                    }
                } catch (inspectError) {
                    logger.warn(`Could not inspect container after restart: ${inspectError.message}`, null, FILENAME);
                }

                logger.info(`Nginx Proxy Manager certificate update completed in container ${action.dockerContainer}`, null, FILENAME);
                return {
                    success: true,
                    message: `Nginx Proxy Manager certificate updated in container ${action.dockerContainer}`,
                    containerName: action.dockerContainer
                };
            }

            // Local NPM installation
            const certName = `custom-${certificate.name.replace(/\./g, '-')}`;
            const npmCertDir = path.join(npmLetsEncryptDir, 'live', certName);
            logger.debug(`Using NPM certificate directory: ${npmCertDir}`, null, FILENAME);

            // Create NPM certificate directory if it doesn't exist
            logger.debug(`Creating NPM certificate directory: ${npmCertDir}`, null, FILENAME);
            await fs.promises.mkdir(npmCertDir, { recursive: true });
            logger.fine(`NPM certificate directory created or already exists`, null, FILENAME);

            // Copy certificate files
            logger.debug(`Copying certificate to NPM: ${npmCertDir}/fullchain.pem`, null, FILENAME);
            await fs.promises.copyFile(certificate.paths.crtPath, path.join(npmCertDir, 'fullchain.pem'));

            logger.debug(`Copying key to NPM: ${npmCertDir}/privkey.pem`, null, FILENAME);
            await fs.promises.copyFile(certificate.paths.keyPath, path.join(npmCertDir, 'privkey.pem'));

            logger.fine(`Certificate files copied to NPM directory`, null, FILENAME);

            // Create a restart flag file to trigger NPM reload
            const restartFlagFile = path.join(npmLetsEncryptDir, 'reload.nginx');
            logger.debug(`Creating NPM reload flag file: ${restartFlagFile}`, null, FILENAME);
            await fs.promises.writeFile(restartFlagFile, new Date().toISOString(), 'utf8');
            logger.fine(`NPM reload flag file created`, null, FILENAME);

            logger.info(`Nginx Proxy Manager certificate updated at ${npmCertDir}`, null, FILENAME);
            return {
                success: true,
                message: `Nginx Proxy Manager certificate updated at ${npmCertDir}`,
                npmCertDir
            };
        } catch (error) {
            logger.error(`Nginx Proxy Manager action failed: ${error.message}`, error, FILENAME);
            throw error;
        }
    }

    /**
     * Execute a Nginx Proxy Manager update via API
     * @private
     * @param {Certificate} certificate - Certificate object
     * @param {Object} action - Nginx Proxy Manager API action configuration
     * @returns {Promise<Object>} Result of the NPM update
     */
    async _executeNginxProxyManagerAPIAction(certificate, action) {
        logger.finest(`_executeNginxProxyManagerAPIAction called for certificate: ${certificate.name}`, null, FILENAME);

        if (!axios) {
            logger.error('Nginx Proxy Manager API action failed: axios module not installed', null, FILENAME);
            throw new Error('axios module not installed. Run: npm install axios');
        }

        try {
            // Check if certificate files exist
            logger.debug('Checking if certificate files exist', null, FILENAME);
            if (!certificate.paths.crtPath || !certificate.paths.keyPath) {
                logger.error('Certificate and key files are required for Nginx Proxy Manager update', null, FILENAME);
                throw new Error('Certificate and key files are required for Nginx Proxy Manager update');
            }

            // Try to load global settings if not provided in action
            if (!action.npmHost || !action.npmPort) {
                logger.debug('No NPM settings provided in action, checking global settings', null, FILENAME);

                try {
                    // Load global settings from configService
                    const configService = require('./config-service');
                    const config = configService.get();

                    if (config?.deployment?.nginxProxyManager?.host) {
                        logger.debug('Using global NPM settings from config service', null, FILENAME);

                        // Make a copy of the action to not modify the original
                        action = { ...action };

                        // Use API mode with global settings
                        action.useAPI = true;
                        action.npmHost = config.deployment.nginxProxyManager.host;
                        action.npmPort = config.deployment.nginxProxyManager.port || 81;
                        action.npmUseHttps = config.deployment.nginxProxyManager.useHttps;
                        action.npmUsername = config.deployment.nginxProxyManager.username;
                        action.npmPassword = config.deployment.nginxProxyManager.password;
                        action.npmAccessToken = config.deployment.nginxProxyManager.accessToken;
                        action.npmRefreshToken = config.deployment.nginxProxyManager.refreshToken;
                        action.npmTokenExpiry = config.deployment.nginxProxyManager.tokenExpiry;

                        logger.fine(`Using global NPM settings: ${action.npmHost}:${action.npmPort}`, null, FILENAME);
                    } else {
                        logger.warn('No NPM settings found in config service', null, FILENAME);
                    }
                } catch (settingsError) {
                    logger.warn(`Failed to load global NPM settings from config: ${settingsError.message}`, null, FILENAME);
                }
            }

            logger.debug(`Certificate file: ${certificate.paths.crtPath}, exists: ${fs.existsSync(certificate.paths.crtPath)}`, null, FILENAME);
            logger.debug(`Key file: ${certificate.paths.keyPath}, exists: ${fs.existsSync(certificate.paths.keyPath)}`, null, FILENAME);

            // Set up API connection
            const protocol = action.npmUseHttps ? 'https' : 'http';
            const baseUrl = `${protocol}://${action.npmHost}:${action.npmPort || 81}`;
            logger.debug(`Using NPM API URL: ${baseUrl}`, null, FILENAME);

            let accessToken = action.npmAccessToken;

            // If no token or token expired, attempt login
            if (!accessToken || !action.npmTokenExpiry || new Date(action.npmTokenExpiry) <= new Date()) {
                logger.debug('No access token or expired, logging in to NPM', null, FILENAME);

                if (!action.npmUsername || !action.npmPassword) {
                    logger.error('Nginx Proxy Manager username and password are required for login', null, FILENAME);
                    throw new Error('Nginx Proxy Manager username and password are required for login');
                }

                // Login to get tokens
                const loginRes = await axios.post(`${baseUrl}/api/tokens`, {
                    identity: action.npmUsername,
                    secret: action.npmPassword
                });

                if (!loginRes.data || !loginRes.data.token) {
                    logger.error('Failed to authenticate with Nginx Proxy Manager', null, FILENAME);
                    throw new Error('Failed to authenticate with Nginx Proxy Manager');
                }

                accessToken = loginRes.data.token;

                // Update the global settings with new tokens
                try {
                    const fs = require('fs');
                    const path = require('path');
                    const configDir = process.env.CONFIG_DIR || path.join(process.cwd(), 'config');
                    const settingsPath = path.join(configDir, 'deployment-settings.json');

                    if (fs.existsSync(settingsPath)) {
                        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

                        if (settings?.deployment?.nginxProxyManager) {
                            settings.deployment.nginxProxyManager.accessToken = loginRes.data.token;
                            settings.deployment.nginxProxyManager.refreshToken = loginRes.data.refresh_token;
                            settings.deployment.nginxProxyManager.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h expiry

                            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
                            logger.debug('Updated NPM tokens in global settings', null, FILENAME);
                        }
                    }
                } catch (settingsError) {
                    logger.warn(`Failed to update global NPM settings: ${settingsError.message}`, null, FILENAME);
                }
            }

            // Create headers for API requests
            const headers = {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            };

            // Step 1: Check if certificate with name already exists
            logger.debug(`Checking if certificate '${certificate.name}' already exists in NPM`, null, FILENAME);
            const certsResponse = await axios.get(`${baseUrl}/api/certificates`, { headers });

            // Find existing certificate by name
            const existingCert = certsResponse.data.find(cert => cert.nice_name === certificate.name);
            let certId = null;

            // Read certificate files
            const certContent = fs.readFileSync(certificate.paths.crtPath, 'utf8');
            const keyContent = fs.readFileSync(certificate.paths.keyPath, 'utf8');

            // Get chain content if available
            let chainContent = '';
            if (certificate.paths.chainPath && fs.existsSync(certificate.paths.chainPath)) {
                chainContent = fs.readFileSync(certificate.paths.chainPath, 'utf8');
                logger.debug(`Chain file loaded: ${certificate.paths.chainPath}`, null, FILENAME);
            } else if (certificate.paths.fullchainPath && fs.existsSync(certificate.paths.fullchainPath)) {
                // Extract chain from fullchain by removing the certificate part
                const fullchain = fs.readFileSync(certificate.paths.fullchainPath, 'utf8');
                chainContent = fullchain.replace(certContent, '').trim();
                logger.debug(`Chain extracted from fullchain: ${certificate.paths.fullchainPath}`, null, FILENAME);
            }

            const certData = {
                nice_name: certificate.name,
                certificate: certContent,
                private_key: keyContent,
                ...(chainContent && { intermediate_certificate: chainContent })
            };

            // Update or create certificate in NPM
            if (existingCert) {
                certId = existingCert.id;
                logger.info(`Updating existing certificate in NPM. ID: ${certId}`, null, FILENAME);

                await axios.put(`${baseUrl}/api/certificates/${certId}`, certData, { headers });
                logger.debug(`Certificate updated in NPM. ID: ${certId}`, null, FILENAME);
            } else {
                logger.info(`Creating new certificate in NPM: ${certificate.name}`, null, FILENAME);

                const createResponse = await axios.post(`${baseUrl}/api/certificates`, certData, { headers });
                certId = createResponse.data.id;

                logger.debug(`Certificate created in NPM. ID: ${certId}`, null, FILENAME);
            }

            // If specified, apply certificate to hosts
            if (action.applyToHosts && Array.isArray(action.applyToHosts) && action.applyToHosts.length > 0) {
                logger.info(`Applying certificate to ${action.applyToHosts.length} hosts in NPM`, null, FILENAME);

                const hostsResponse = await axios.get(`${baseUrl}/api/nginx/proxy-hosts`, { headers });

                for (const hostIdentifier of action.applyToHosts) {
                    // Find host by domain name or ID
                    const host = hostsResponse.data.find(h =>
                        h.domain_names.includes(hostIdentifier) || h.id == hostIdentifier);

                    if (host) {
                        logger.debug(`Found host: ${host.domain_names.join(', ')} (ID: ${host.id})`, null, FILENAME);

                        // Update host to use this certificate
                        const updatedHost = {
                            ...host,
                            certificate_id: certId,
                            ssl_forced: true,
                            ssl_enabled: true
                        };

                        await axios.put(`${baseUrl}/api/nginx/proxy-hosts/${host.id}`, updatedHost, { headers });
                        logger.debug(`Updated host ${host.id} to use certificate ${certId}`, null, FILENAME);
                    } else {
                        logger.warn(`Could not find host in NPM: ${hostIdentifier}`, null, FILENAME);
                    }
                }
            }

            logger.info(`Nginx Proxy Manager API certificate update completed successfully`, null, FILENAME);
            return {
                success: true,
                message: `Certificate ${existingCert ? 'updated' : 'created'} in Nginx Proxy Manager via API`,
                certId,
                apiUrl: baseUrl
            };
        } catch (error) {
            logger.error(`Nginx Proxy Manager API action failed: ${error.message}`, error, FILENAME);
            throw error;
        }
    }

    /**
     * Execute an SSH copy action
     * @param {Certificate} certificate - Certificate object
     * @param {Object} action - SSH copy action configuration
     * @returns {Promise<Object>} Result of the SSH copy
     */
    async executeSshCopyAction(certificate, action) {
        if (!SftpClient) {
            throw new Error('ssh2-sftp-client module not installed. Run: npm install ssh2-sftp-client');
        }

        if (!action.host) {
            throw new Error('SSH copy action requires a host property');
        }

        if (!action.source || !action.destination) {
            throw new Error('SSH copy action requires source and destination properties');
        }

        const sftp = new SftpClient();

        try {
            // Determine source file
            const sourcePath = this._getCertificateFile(certificate, action.source);

            if (!fs.existsSync(sourcePath)) {
                throw new Error(`Source file does not exist: ${sourcePath}`);
            }

            // Connect to the SSH server
            const config = {
                host: action.host,
                port: action.port || 22,
                username: action.username || undefined,
                password: action.password || undefined,
            };

            // Use private key if provided
            if (action.privateKey) {
                if (fs.existsSync(action.privateKey)) {
                    config.privateKey = fs.readFileSync(action.privateKey);
                } else {
                    throw new Error(`SSH private key file not found: ${action.privateKey}`);
                }
            }

            // Add passphrase if provided
            if (action.passphrase) {
                config.passphrase = action.passphrase;
            }

            // Connect to server
            logger.info(`Connecting to SSH server ${action.host}:${config.port} as ${config.username}`);
            await sftp.connect(config);

            // Create remote directory if needed
            const remoteDir = path.dirname(action.destination);
            try {
                // Check if directory exists
                const dirExists = await sftp.exists(remoteDir);
                if (!dirExists) {
                    // Create directories recursively
                    const dirs = remoteDir.split('/').filter(Boolean);
                    let currentPath = '';

                    for (const dir of dirs) {
                        currentPath += '/' + dir;
                        const exists = await sftp.exists(currentPath);
                        if (!exists) {
                            await sftp.mkdir(currentPath);
                        }
                    }
                }
            } catch (error) {
                logger.warn(`Error checking/creating remote directory: ${error.message}`);
            }

            // Upload the file
            logger.info(`Copying ${sourcePath} to ${action.host}:${action.destination}`);
            await sftp.put(sourcePath, action.destination);

            // Set permissions if specified
            if (action.permissions) {
                try {
                    await sftp.chmod(action.destination, action.permissions);
                } catch (error) {
                    logger.warn(`Could not set permissions on ${action.destination}`, error);
                }
            }

            // Execute command after upload if needed
            if (action.command) {
                logger.info(`Executing command on ${action.host}: ${action.command}`);

                // We need to use SSH directly for commands (not SFTP)
                // Close the SFTP connection first
                await sftp.end();

                // Use the ssh command line tool since we don't have node-ssh
                const sshCommand = this._buildSshCommand(action, action.command);
                const { stdout, stderr } = await execAsync(sshCommand);

                if (stderr && action.verbose) {
                    logger.warn(`SSH command stderr: ${stderr}`);
                }

                if (action.verbose) {
                    logger.info(`SSH command output: ${stdout}`);
                }

                return {
                    success: true,
                    message: `File copied and command executed on ${action.host}`,
                    sourcePath,
                    destination: action.destination,
                    stdout,
                    stderr
                };
            }

            await sftp.end();

            return {
                success: true,
                message: `File copied to ${action.host}:${action.destination}`,
                sourcePath,
                destination: action.destination
            };
        } catch (error) {
            logger.error(`SSH copy action failed: ${error.message}`, error);

            // Ensure connection is closed
            try {
                if (sftp && sftp.connected) {
                    await sftp.end();
                }
            } catch (e) {
                // Ignore cleanup errors
            }

            throw error;
        }
    }

    /**
     * Build an SSH command with proper authentication
     * @private
     * @param {Object} action - SSH action configuration
     * @param {string} command - Command to execute
     * @returns {string} Full SSH command
     */
    _buildSshCommand(action, command) {
        let sshCommand = `ssh`;

        // Add port if specified
        if (action.port && action.port !== 22) {
            sshCommand += ` -p ${action.port}`;
        }

        // Add private key if specified
        if (action.privateKey) {
            sshCommand += ` -i "${action.privateKey}"`;
        }

        // Add connection options
        sshCommand += ` -o StrictHostKeyChecking=no`;

        // Add username and host
        const userHost = `${action.username ? action.username + '@' : ''}${action.host}`;

        // Compose the final command
        sshCommand += ` ${userHost} "${command.replace(/"/g, '\\"')}"`;

        return sshCommand;
    }

    /**
     * Execute an SMB copy action
     * @param {Certificate} certificate - Certificate object
     * @param {Object} action - SMB copy action configuration
     * @returns {Promise<Object>} Result of the SMB copy
     */
    async executeSmbCopyAction(certificate, action) {
        if (!SMB2) {
            throw new Error('smb2 module not installed. Run: npm install smb2');
        }

        if (!action.share) {
            throw new Error('SMB copy action requires a share property (e.g. \\\\server\\share)');
        }

        if (!action.source || !action.destination) {
            throw new Error('SMB copy action requires source and destination properties');
        }

        // Determine source file
        const sourcePath = this._getCertificateFile(certificate, action.source);

        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Source file does not exist: ${sourcePath}`);
        }

        // Create an SMB client
        const smbConfig = {
            share: action.share,
            domain: action.domain || '',
            username: action.username || '',
            password: action.password || '',
            autoCloseTimeout: 5000
        };

        const smb = new SMB2(smbConfig);
        const smbWriteFile = promisify(smb.writeFile.bind(smb));
        const smbExists = promisify(smb.exists.bind(smb));
        const smbMkdir = promisify(smb.mkdir.bind(smb));

        try {
            logger.info(`Connecting to SMB share ${action.share}`);

            // Create directory structure if needed
            const destDir = path.dirname(action.destination);
            if (destDir && destDir !== '.') {
                try {
                    const exists = await smbExists(destDir);
                    if (!exists) {
                        // Need to create directories recursively
                        const pathParts = destDir.split(/[/\\]/).filter(Boolean);
                        let currentPath = '';

                        for (const part of pathParts) {
                            currentPath += (currentPath ? '\\' : '') + part;
                            try {
                                const pathExists = await smbExists(currentPath);
                                if (!pathExists) {
                                    await smbMkdir(currentPath);
                                }
                            } catch (e) {
                                // Directory might have been created by another process
                                logger.warn(`Error checking/creating SMB directory ${currentPath}: ${e.message}`);
                            }
                        }
                    }
                } catch (error) {
                    logger.warn(`Error checking/creating SMB directories: ${error.message}`);
                }
            }

            // Read the source file
            const fileContent = await fs.promises.readFile(sourcePath);

            // Write to SMB share
            logger.info(`Copying ${sourcePath} to SMB: ${action.share}\\${action.destination}`);
            await smbWriteFile(action.destination, fileContent);

            // Close the connection
            smb.disconnect();

            return {
                success: true,
                message: `File copied to SMB share ${action.share}\\${action.destination}`,
                sourcePath,
                destination: `${action.share}\\${action.destination}`
            };
        } catch (error) {
            logger.error(`SMB copy action failed: ${error.message}`, error);

            // Ensure connection is closed
            try {
                smb.disconnect();
            } catch (e) {
                // Ignore cleanup errors
            }

            throw error;
        }
    }

    /**
     * Execute an FTP copy action
     * @param {Certificate} certificate - Certificate object
     * @param {Object} action - FTP copy action configuration
     * @returns {Promise<Object>} Result of the FTP copy
     */
    async executeFtpCopyAction(certificate, action) {
        logger.finest(`executeFtpCopyAction called for certificate: ${certificate.name}`, {
            fingerprint: certificate.fingerprint,
            action: { ...action, password: '***' }
        }, FILENAME);

        if (!ftp) {
            logger.error('FTP copy action failed: basic-ftp module not installed', null, FILENAME);
            throw new Error('basic-ftp module not installed. Run: npm install basic-ftp');
        }

        if (!action.host) {
            logger.error('FTP copy action missing required host property', null, FILENAME);
            throw new Error('FTP copy action requires a host property');
        }

        if (!action.source || !action.destination) {
            logger.error('FTP copy action missing required source or destination properties', null, FILENAME);
            throw new Error('FTP copy action requires source and destination properties');
        }

        // Determine source file
        const sourcePath = this._getCertificateFile(certificate, action.source);
        logger.debug(`FTP copy source resolved to: ${sourcePath}`, null, FILENAME);

        if (!fs.existsSync(sourcePath)) {
            logger.error(`FTP copy source file does not exist: ${sourcePath}`, null, FILENAME);
            throw new Error(`Source file does not exist: ${sourcePath}`);
        }
        logger.fine(`FTP copy source file exists: ${sourcePath}`, null, FILENAME);

        // Get file stats for debugging
        const sourceStats = fs.statSync(sourcePath);
        logger.finest(`Source file stats: size=${sourceStats.size}, modified=${sourceStats.mtime}`, null, FILENAME);

        const client = new ftp.Client();

        // Set up logging if verbose mode is enabled
        if (action.verbose) {
            logger.debug(`Setting up verbose FTP client logging`, null, FILENAME);
            client.ftp.verbose = true;
        }

        try {
            // Connect to the FTP server
            const config = {
                host: action.host,
                port: action.port || 21,
                user: action.username || 'anonymous',
                password: action.password || 'anonymous@example.com',
                secure: action.secure || false
            };

            logger.info(`Connecting to FTP server ${config.host}:${config.port} as ${config.user}`, null, FILENAME);
            logger.debug(`FTP connection details: ${JSON.stringify({
                host: config.host,
                port: config.port,
                user: config.user,
                secure: config.secure
            })}`, null, FILENAME);

            await client.access(config);
            logger.fine(`FTP connection established to ${config.host}`, null, FILENAME);

            // Create directories if needed
            const destDir = path.dirname(action.destination);
            if (destDir && destDir !== '.') {
                logger.debug(`Ensuring FTP destination directories exist: ${destDir}`, null, FILENAME);

                try {
                    // Navigate through each directory level, creating if needed
                    const dirs = destDir.split(/[/\\]/).filter(Boolean);

                    logger.debug(`Directory structure to create: ${JSON.stringify(dirs)}`, null, FILENAME);

                    for (let i = 0; i < dirs.length; i++) {
                        const currentPath = dirs.slice(0, i + 1).join('/');
                        logger.finest(`Checking if directory exists: ${currentPath}`, null, FILENAME);

                        try {
                            await client.cd(currentPath);
                            logger.finest(`Directory exists: ${currentPath}`, null, FILENAME);
                        } catch (e) {
                            // If the directory doesn't exist, create it
                            try {
                                const parentDir = dirs.slice(0, i).join('/') || '/';
                                logger.debug(`Directory doesn't exist, navigating to parent: ${parentDir}`, null, FILENAME);
                                await client.cd(parentDir);

                                logger.debug(`Creating directory: ${dirs[i]}`, null, FILENAME);
                                await client.mkdir(dirs[i]);
                                logger.fine(`Created FTP directory: ${dirs[i]}`, null, FILENAME);
                            } catch (mkdirError) {
                                logger.warn(`Error creating FTP directory ${dirs[i]}: ${mkdirError.message}`, mkdirError, FILENAME);
                            }
                        }
                    }

                    // Reset to root for the upload
                    logger.debug(`Resetting to FTP root directory for upload`, null, FILENAME);
                    await client.cd('/');
                } catch (error) {
                    logger.warn(`Error navigating FTP directories: ${error.message}`, error, FILENAME);
                }
            }

            // Upload the file
            logger.info(`Copying ${sourcePath} to FTP: ${action.host}/${action.destination}`, null, FILENAME);
            await client.uploadFrom(sourcePath, action.destination);
            logger.fine(`File uploaded successfully to ${action.destination}`, null, FILENAME);

            // Verify the upload
            try {
                logger.debug(`Verifying uploaded file: ${action.destination}`, null, FILENAME);
                const fileInfo = await client.size(action.destination);

                if (fileInfo > 0) {
                    logger.debug(`Verified file exists on FTP server, size: ${fileInfo} bytes`, null, FILENAME);

                    // Check if file sizes match
                    if (fileInfo !== sourceStats.size) {
                        logger.warn(`File sizes don't match: local=${sourceStats.size}, remote=${fileInfo}`, null, FILENAME);
                    } else {
                        logger.fine(`File sizes match: ${fileInfo} bytes`, null, FILENAME);
                    }
                } else {
                    logger.warn(`File verification failed - file may not exist or has size 0`, null, FILENAME);
                }
            } catch (verifyError) {
                logger.warn(`Could not verify FTP file upload: ${verifyError.message}`, verifyError, FILENAME);
            }

            // Set permissions if specified
            if (action.permissions) {
                try {
                    const chmodCommand = `SITE CHMOD ${action.permissions.toString(8)} ${action.destination}`;
                    logger.debug(`Setting FTP file permissions: ${chmodCommand}`, null, FILENAME);
                    await client.send(chmodCommand);
                    logger.fine(`Permissions set successfully on ${action.destination}`, null, FILENAME);
                } catch (error) {
                    logger.warn(`Could not set permissions on ${action.destination}: ${error.message}`, error, FILENAME);
                }
            }

            logger.debug(`Closing FTP connection`, null, FILENAME);
            client.close();
            logger.fine(`FTP connection closed`, null, FILENAME);

            logger.info(`FTP copy operation completed successfully: ${sourcePath} → ${action.host}/${action.destination}`, null, FILENAME);
            return {
                success: true,
                message: `File copied to FTP server ${action.host}/${action.destination}`,
                sourcePath,
                destination: `${action.host}/${action.destination}`
            };
        } catch (error) {
            logger.error(`FTP copy action failed: ${error.message}`, error, FILENAME);

            // Ensure connection is closed
            try {
                logger.debug(`Closing FTP connection after error`, null, FILENAME);
                client.close();
                logger.fine(`FTP connection closed after error`, null, FILENAME);
            } catch (e) {
                logger.debug(`Error while closing FTP connection: ${e.message}`, null, FILENAME);
                // Ignore cleanup errors
            }

            throw error;
        }
    }

    /**
     * Execute an API call action
     * @param {Certificate} certificate - Certificate object
     * @param {Object} action - API call configuration
     * @returns {Promise<Object>} Result of the API call
     */
    async executeApiCallAction(certificate, action) {
        logger.finest(`executeApiCallAction called for certificate: ${certificate.name}`, {
            fingerprint: certificate.fingerprint,
            action: {
                ...action,
                auth: action.auth ? {
                    type: action.auth.bearer ? 'bearer' : (action.auth.apiKey ? 'apiKey' : (action.auth.username ? 'basic' : 'none'))
                } : undefined
            }
        }, FILENAME);

        if (!axios) {
            logger.error('API call action failed: axios module not installed', null, FILENAME);
            throw new Error('axios module not installed. Run: npm install axios');
        }

        if (!action.url) {
            logger.error('API call action missing required url property', null, FILENAME);
            throw new Error('API call action requires a url property');
        }

        if (!action.method) {
            logger.debug('No method specified for API call, defaulting to POST', null, FILENAME);
            action.method = 'POST'; // Default method is POST
        }

        try {
            // Prepare request options
            const url = this._replacePlaceholders(action.url, certificate);
            logger.debug(`API call URL after placeholder replacement: ${url}`, null, FILENAME);

            const options = {
                method: action.method,
                url: url,
                headers: action.headers || {}
            };

            logger.debug(`API call method: ${options.method}`, null, FILENAME);
            logger.finest(`API call headers: ${JSON.stringify(options.headers)}`, null, FILENAME);

            // Handle different payloads based on configuration
            if (action.sendFiles) {
                logger.debug(`Preparing to send files in API call`, null, FILENAME);

                // File upload using FormData
                if (!FormData) {
                    logger.error('API call with file upload failed: form-data module not installed', null, FILENAME);
                    throw new Error('form-data module not installed. Run: npm install form-data');
                }

                const form = new FormData();

                // Add certificate files to form based on configuration
                for (const [key, filePath] of Object.entries(action.files || {})) {
                    const sourcePath = this._getCertificateFile(certificate, filePath);
                    logger.debug(`Processing file for form field ${key}: ${sourcePath}`, null, FILENAME);

                    if (sourcePath && fs.existsSync(sourcePath)) {
                        const fileContent = fs.createReadStream(sourcePath);
                        const fileName = path.basename(sourcePath);
                        logger.debug(`Adding file to form: ${key} = ${fileName}`, null, FILENAME);

                        form.append(key, fileContent, fileName);
                        logger.fine(`Added file to form: ${key} = ${fileName}`, null, FILENAME);
                    } else {
                        logger.warn(`File not found for form field ${key}: ${sourcePath}`, null, FILENAME);
                    }
                }

                // Add additional form fields if specified
                if (action.data) {
                    logger.debug(`Adding form fields from action.data`, null, FILENAME);

                    for (const [key, value] of Object.entries(action.data)) {
                        const processedValue = this._replacePlaceholders(value, certificate);
                        logger.finest(`Adding form field: ${key} = ${processedValue}`, null, FILENAME);

                        form.append(key, processedValue);
                    }
                }

                // Add form headers to request
                const formHeaders = form.getHeaders();
                logger.debug(`Adding form headers: ${JSON.stringify(formHeaders)}`, null, FILENAME);

                options.headers = { ...options.headers, ...formHeaders };
                options.data = form;
                logger.debug(`Form data prepared for API call`, null, FILENAME);
            } else if (action.jsonPayload) {
                // JSON payload
                logger.debug(`Preparing JSON payload for API call`, null, FILENAME);

                let payload;

                if (typeof action.jsonPayload === 'string') {
                    logger.debug(`Processing JSON payload from string`, null, FILENAME);
                    const processedJson = this._replacePlaceholders(action.jsonPayload, certificate);
                    logger.finest(`JSON string after placeholder replacement: ${processedJson}`, null, FILENAME);

                    try {
                        payload = JSON.parse(processedJson);
                        logger.debug(`JSON payload successfully parsed`, null, FILENAME);
                    } catch (e) {
                        logger.error(`Failed to parse JSON payload: ${e.message}`, e, FILENAME);
                        throw new Error(`Invalid JSON payload: ${e.message}`);
                    }
                } else {
                    payload = action.jsonPayload;
                    logger.debug(`Using object directly as JSON payload`, null, FILENAME);
                }

                // Apply replacements to each string value in the payload
                logger.debug(`Processing JSON payload object for placeholders`, null, FILENAME);
                const processedPayload = this._processJsonPayload(payload, certificate);
                logger.finest(`Processed JSON payload: ${JSON.stringify(processedPayload)}`, null, FILENAME);

                options.headers['Content-Type'] = 'application/json';
                options.data = processedPayload;
                logger.debug(`JSON payload prepared for API call`, null, FILENAME);
            } else if (action.formData) {
                // Form urlencoded data
                logger.debug(`Preparing form-urlencoded data for API call`, null, FILENAME);
                options.headers['Content-Type'] = 'application/x-www-form-urlencoded';

                const formData = {};
                for (const [key, value] of Object.entries(action.formData)) {
                    const processedValue = this._replacePlaceholders(value, certificate);
                    logger.finest(`Form field: ${key} = ${processedValue}`, null, FILENAME);
                    formData[key] = processedValue;
                }

                const formString = new URLSearchParams(formData).toString();
                logger.debug(`Form data string: ${formString}`, null, FILENAME);

                options.data = formString;
                logger.debug(`Form-urlencoded data prepared for API call`, null, FILENAME);
            } else if (action.data) {
                // Generic data payload
                logger.debug(`Using generic data payload for API call`, null, FILENAME);
                options.data = action.data;
            }

            // Set authentication if provided
            if (action.auth) {
                logger.debug(`Setting up authentication for API call`, null, FILENAME);

                if (action.auth.bearer) {
                    logger.debug(`Using Bearer token authentication`, null, FILENAME);
                    options.headers['Authorization'] = `Bearer ${action.auth.bearer}`;
                } else if (action.auth.username && action.auth.password) {
                    logger.debug(`Using Basic authentication with username and password`, null, FILENAME);
                    options.auth = {
                        username: action.auth.username,
                        password: action.auth.password
                    };
                } else if (action.auth.apiKey && action.auth.apiKeyHeader) {
                    logger.debug(`Using API key authentication with header: ${action.auth.apiKeyHeader}`, null, FILENAME);
                    options.headers[action.auth.apiKeyHeader] = action.auth.apiKey;
                }
            }

            // Execute the API call
            logger.info(`Making API call to ${options.url} [${options.method}]`, null, FILENAME);

            if (action.verbose) {
                logger.info(`API call details: ${JSON.stringify({
                    url: options.url,
                    method: options.method,
                    headers: Object.keys(options.headers).reduce((acc, key) => {
                        // Mask sensitive headers
                        const sensitiveHeaders = ['authorization', 'api-key', 'x-api-key'];
                        acc[key] = sensitiveHeaders.includes(key.toLowerCase()) ? '***' : options.headers[key];
                        return acc;
                    }, {}),
                    data: options.data ? 'DATA_PRESENT' : 'NONE'
                }, null, 2)}`, null, FILENAME);
            }

            logger.debug(`Sending API request`, null, FILENAME);
            const response = await axios(options);
            logger.debug(`API call completed with status ${response.status}`, null, FILENAME);

            // Log response if verbose
            if (action.verbose) {
                logger.info(`API response status: ${response.status}`, null, FILENAME);
                logger.info(`API response headers: ${JSON.stringify(response.headers, null, 2)}`, null, FILENAME);

                // Try to limit response size for logging
                const responseData = typeof response.data === 'object'
                    ? JSON.stringify(response.data).substring(0, 1000)
                    : response.data?.toString().substring(0, 1000);

                logger.info(`API response data (truncated): ${responseData}${responseData?.length >= 1000 ? '...' : ''}`, null, FILENAME);
            } else {
                // Log basic response info at debug level
                logger.debug(`API response status: ${response.status} ${response.statusText}`, null, FILENAME);

                // Truncate response data for debug logging
                const responseData = typeof response.data === 'object'
                    ? JSON.stringify(response.data).substring(0, 200)
                    : response.data?.toString().substring(0, 200);

                logger.debug(`API response data (truncated): ${responseData}${responseData?.length >= 200 ? '...' : ''}`, null, FILENAME);
            }

            logger.info(`API call to ${options.url} completed successfully`, null, FILENAME);
            return {
                success: true,
                message: `API call to ${options.url} completed successfully with status ${response.status}`,
                url: options.url,
                status: response.status,
                statusText: response.statusText
            };
        } catch (error) {
            // Format error for better debugging
            const errorResponse = error.response ? {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            } : null;

            logger.error(`API call failed: ${error.message}`, {
                url: action.url,
                method: action.method,
                error: error.stack,
                ...(errorResponse ? { response: errorResponse } : {})
            }, FILENAME);

            // Create a detailed error message
            const errorMsg = errorResponse
                ? `API call failed with status ${errorResponse.status}: ${error.message}`
                : `API call failed: ${error.message}`;

            throw new Error(errorMsg);
        }
    }

    /**
     * Process JSON payload and replace placeholders
     * @private
     * @param {Object|Array|string|number} payload - JSON payload to process
     * @param {Certificate} certificate - Certificate object
     * @returns {Object|Array|string|number} Processed payload
     */
    _processJsonPayload(payload, certificate) {
        logger.finest(`_processJsonPayload called with type: ${typeof payload}`, null, FILENAME);

        if (typeof payload === 'string') {
            logger.finest(`Processing string payload: ${payload.substring(0, 50)}${payload.length > 50 ? '...' : ''}`, null, FILENAME);
            const processed = this._replacePlaceholders(payload, certificate);
            logger.finest(`String processed: ${processed.substring(0, 50)}${processed.length > 50 ? '...' : ''}`, null, FILENAME);
            return processed;
        } else if (typeof payload === 'object' && payload !== null) {
            if (Array.isArray(payload)) {
                logger.finest(`Processing array payload with ${payload.length} items`, null, FILENAME);

                const processedArray = payload.map((item, index) => {
                    logger.finest(`Processing array item at index ${index}`, null, FILENAME);
                    return this._processJsonPayload(item, certificate);
                });

                logger.finest(`Array processed with ${processedArray.length} items`, null, FILENAME);
                return processedArray;
            } else {
                logger.finest(`Processing object payload with keys: ${Object.keys(payload).join(', ')}`, null, FILENAME);

                const result = {};
                for (const [key, value] of Object.entries(payload)) {
                    logger.finest(`Processing object key: ${key}`, null, FILENAME);
                    result[key] = this._processJsonPayload(value, certificate);
                }

                logger.finest(`Object processed with keys: ${Object.keys(result).join(', ')}`, null, FILENAME);
                return result;
            }
        } else {
            logger.finest(`Returning primitive value as-is: ${payload}`, null, FILENAME);
            return payload; // Return as is for numbers, booleans, etc.
        }
    }

    /**
     * Execute a webhook notification action
     * @param {Certificate} certificate - Certificate object
     * @param {Object} action - Webhook configuration
     * @returns {Promise<Object>} Result of the webhook notification
     */
    async executeWebhookAction(certificate, action) {
        logger.finest(`executeWebhookAction called for certificate: ${certificate.name}`, {
            fingerprint: certificate.fingerprint,
            action: {
                ...action,
                auth: action.auth ? { type: action.auth.bearer ? 'bearer' : (action.auth.username ? 'basic' : 'none') } : undefined
            }
        }, FILENAME);

        if (!axios) {
            logger.error('Webhook action failed: axios module not installed', null, FILENAME);
            throw new Error('axios module not installed. Run: npm install axios');
        }

        if (!action.url) {
            logger.error('Webhook action missing required url property', null, FILENAME);
            throw new Error('Webhook action requires a url property');
        }

        try {
            // Prepare basic certificate information for the webhook payload
            logger.debug(`Preparing certificate information for webhook payload`, null, FILENAME);
            const certInfo = {
                name: certificate.name,
                fingerprint: certificate.fingerprint,
                subject: certificate.subject,
                issuer: certificate.issuer,
                validFrom: certificate.validFrom,
                validTo: certificate.validTo,
                domains: certificate.sans?.domains || [],
                ips: certificate.sans?.ips || [],
                isExpired: certificate.isExpired(),
                daysUntilExpiry: certificate.daysUntilExpiry(),
                certType: certificate.certType
            };
            logger.finest(`Certificate info prepared: ${JSON.stringify(certInfo)}`, null, FILENAME);

            // Create webhook payload
            const event = action.event || 'certificate.deployed';
            logger.debug(`Creating webhook payload with event: ${event}`, null, FILENAME);

            const payload = {
                event: event,
                timestamp: new Date().toISOString(),
                certificate: certInfo
            };

            // Add custom data if requested
            if (action.includeCustomData) {
                logger.debug(`Including custom data in webhook payload`, null, FILENAME);
                payload.customData = action.customData || {};
                logger.finest(`Custom data: ${JSON.stringify(payload.customData)}`, null, FILENAME);
            }

            // Add file contents if requested
            if (action.includeFiles && Array.isArray(action.includeFiles)) {
                logger.debug(`Including file contents in webhook payload: ${action.includeFiles.join(', ')}`, null, FILENAME);
                const fileContents = {};

                for (const fileType of action.includeFiles) {
                    const filePath = this._getCertificateFile(certificate, fileType);
                    logger.debug(`Getting file content for ${fileType}: ${filePath}`, null, FILENAME);

                    if (filePath && fs.existsSync(filePath)) {
                        try {
                            logger.debug(`Reading file content: ${filePath}`, null, FILENAME);
                            const fileContent = fs.readFileSync(filePath, 'utf8');
                            fileContents[fileType] = fileContent;
                            logger.fine(`Added file content for ${fileType} (${fileContent.length} bytes)`, null, FILENAME);
                        } catch (err) {
                            logger.warn(`Failed to read ${fileType} file for webhook: ${err.message}`, err, FILENAME);
                        }
                    } else {
                        logger.warn(`File not found for ${fileType}: ${filePath}`, null, FILENAME);
                    }
                }

                if (Object.keys(fileContents).length > 0) {
                    logger.debug(`Adding ${Object.keys(fileContents).length} file contents to webhook payload`, null, FILENAME);
                    payload.files = fileContents;
                } else {
                    logger.debug(`No files were successfully read for the webhook`, null, FILENAME);
                }
            }

            // Set up request options
            const url = this._replacePlaceholders(action.url, certificate);
            logger.debug(`Webhook URL after placeholder replacement: ${url}`, null, FILENAME);

            const options = {
                method: action.method || 'POST',
                url: url,
                headers: {
                    'Content-Type': 'application/json',
                    ...(action.headers || {})
                },
                data: payload
            };

            logger.debug(`Webhook request method: ${options.method}`, null, FILENAME);
            logger.finest(`Webhook request headers: ${JSON.stringify(options.headers)}`, null, FILENAME);
            logger.finest(`Webhook payload size: ${JSON.stringify(payload).length} bytes`, null, FILENAME);

            // Add authentication if specified
            if (action.auth) {
                logger.debug(`Setting up authentication for webhook request`, null, FILENAME);

                if (action.auth.bearer) {
                    logger.debug(`Using Bearer token authentication`, null, FILENAME);
                    options.headers['Authorization'] = `Bearer ${action.auth.bearer}`;
                } else if (action.auth.type === 'basic' && action.auth.username && action.auth.password) {
                    logger.debug(`Using Basic authentication with username: ${action.auth.username}`, null, FILENAME);
                    options.auth = {
                        username: action.auth.username,
                        password: action.auth.password
                    };
                }
            }

            // Send the webhook
            logger.info(`Sending webhook notification to ${options.url}`, null, FILENAME);

            if (action.verbose) {
                logger.info(`Webhook details: ${JSON.stringify({
                    url: options.url,
                    method: options.method,
                    event: payload.event,
                    certificateName: payload.certificate.name,
                    payloadSize: JSON.stringify(payload).length
                })}`, null, FILENAME);
            }

            logger.debug(`Sending webhook request`, null, FILENAME);
            const response = await axios(options);
            logger.debug(`Webhook request completed with status: ${response.status} ${response.statusText}`, null, FILENAME);

            // Log response details
            if (action.verbose) {
                logger.info(`Webhook response status: ${response.status}`, null, FILENAME);

                // Try to limit response data for logging
                const responseData = typeof response.data === 'object'
                    ? JSON.stringify(response.data).substring(0, 500)
                    : response.data?.toString().substring(0, 500);

                logger.info(`Webhook response data (truncated): ${responseData}${responseData?.length >= 500 ? '...' : ''}`, null, FILENAME);
            }

            logger.info(`Webhook notification to ${options.url} completed successfully`, null, FILENAME);
            return {
                success: true,
                message: `Webhook notification to ${options.url} completed successfully with status ${response.status}`,
                url: options.url,
                status: response.status,
                statusText: response.statusText
            };
        } catch (error) {
            const errorResponse = error.response ? {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data
            } : null;

            logger.error(`Webhook notification failed: ${error.message}`, {
                url: action.url,
                error: error.stack,
                response: errorResponse ? {
                    status: errorResponse.status,
                    data: JSON.stringify(errorResponse.data).substring(0, 500)
                } : 'No response'
            }, FILENAME);

            throw new Error(`Webhook notification failed: ${error.message}`);
        }
    }

    /**
     * Execute an email notification action
     * @param {Certificate} certificate - Certificate object
     * @param {Object} action - Email notification configuration
     * @returns {Promise<Object>} Result of the email notification
     */
    async executeEmailAction(certificate, action) {
        logger.finest(`executeEmailAction called for certificate: ${certificate.name}`, {
            fingerprint: certificate.fingerprint,
            action: {
                to: action.to,
                cc: action.cc,
                bcc: action.bcc,
                from: action.from,
                subject: action.subject,
                hasTemplate: !!action.template,
                attachCertificates: action.attachCertificates,
                smtp: action.smtp ? {
                    host: action.smtp.host,
                    port: action.smtp.port,
                    secure: action.smtp.secure
                } : undefined
            }
        }, FILENAME);

        if (!nodemailer) {
            logger.error('Email notification failed: nodemailer module not installed', null, FILENAME);
            throw new Error('nodemailer module not installed. Run: npm install nodemailer');
        }

        try {
            // Try to load global settings if not provided in action
            if (!action.smtp || !action.smtp.host) {
                logger.debug('No SMTP settings provided in action, checking global settings', null, FILENAME);

                try {
                    // Load global settings from configService
                    const configService = require('./config-service');
                    const config = configService.get();

                    if (config?.deployment?.email?.smtp?.host) {
                        logger.debug('Using global SMTP settings from config service', null, FILENAME);

                        // Make a copy of the action to not modify the original
                        action = { ...action };

                        // Use global SMTP settings
                        action.smtp = config.deployment.email.smtp;

                        // Use global from address if not specified
                        if (!action.from && config.deployment.email.smtp.from) {
                            action.from = config.deployment.email.smtp.from;
                        }

                        logger.fine(`Using global SMTP settings: ${action.smtp.host}:${action.smtp.port}`, null, FILENAME);
                    } else {
                        logger.warn('No SMTP settings found in config service', null, FILENAME);
                    }
                } catch (settingsError) {
                    logger.warn(`Failed to load global SMTP settings from config: ${settingsError.message}`, null, FILENAME);
                }
            }

            // Ensure we have SMTP settings
            if (!action.smtp || !action.smtp.host) {
                logger.error('Email notification failed: No SMTP settings provided', null, FILENAME);
                throw new Error('SMTP settings are required for email notifications');
            }

            if (!action.to) {
                logger.error('Email notification failed: No recipient (to) specified', null, FILENAME);
                throw new Error('Email notification requires at least one recipient (to property)');
            }
            let transport;

            // Set up transport based on configuration
            if (action.transportConfig) {
                // Use provided transport configuration
                logger.debug(`Using custom transport configuration for email`, null, FILENAME);
                logger.finest(`Transport config: ${JSON.stringify(action.transportConfig)}`, null, FILENAME);

                transport = nodemailer.createTransport(action.transportConfig);
                logger.fine(`Created email transport with custom config`, null, FILENAME);
            } else {
                // Create transport from SMTP settings
                logger.debug(`Creating SMTP transport with host: ${action.smtp.host}:${action.smtp.port || 587}`, null, FILENAME);

                const smtpConfig = {
                    host: action.smtp.host,
                    port: action.smtp.port || 587,
                    secure: action.smtp.secure || false,
                    auth: {
                        user: action.smtp.user,
                        pass: action.smtp.password
                    },
                    tls: {
                        // Force specific TLS version and disable older, vulnerable protocols
                        minVersion: 'TLSv1.2',
                        rejectUnauthorized: action.smtp.rejectUnauthorized !== false
                    }
                };

                // Add debug logging
                logger.debug(`SMTP config with TLS settings: ${JSON.stringify({
                    host: smtpConfig.host,
                    port: smtpConfig.port,
                    secure: smtpConfig.secure,
                    auth: { user: smtpConfig.auth.user, pass: '***' },
                    tls: smtpConfig.tls
                })}`, null, FILENAME);

                transport = nodemailer.createTransport(smtpConfig);
                logger.fine(`Created SMTP transport for ${action.smtp.host}`, null, FILENAME);

                // If connection verification fails with SSL error, try different TLS settings
                try {
                    logger.debug(`Verifying email transport connection`, null, FILENAME);
                    await transport.verify();
                    logger.debug(`Email transport connection verified successfully`, null, FILENAME);
                } catch (verifyError) {
                    logger.warn(`Email transport verification failed: ${verifyError.message}. Trying with different TLS settings.`, verifyError, FILENAME);
                    
                    if (verifyError.message.includes('SSL routines') || verifyError.code === 'ESOCKET') {
                        // Try with different TLS settings
                        logger.debug(`Retrying with adjusted TLS settings for ${action.smtp.host}`, null, FILENAME);
                        
                        // Create a new transport with more permissive TLS settings
                        const adjustedConfig = {
                            ...smtpConfig,
                            tls: {
                                rejectUnauthorized: false,
                                minVersion: 'TLSv1'
                            }
                        };
                        
                        // Some servers might need secure:true for port 465
                        if (adjustedConfig.port == 465) {
                            adjustedConfig.secure = true;
                        }
                        
                        logger.debug(`Adjusted SMTP config: ${JSON.stringify({
                            host: adjustedConfig.host,
                            port: adjustedConfig.port,
                            secure: adjustedConfig.secure,
                            tls: adjustedConfig.tls
                        })}`, null, FILENAME);
                        
                        transport = nodemailer.createTransport(adjustedConfig);
                        
                        try {
                            await transport.verify();
                            logger.debug(`Email transport connection verified successfully with adjusted settings`, null, FILENAME);
                        } catch (secondVerifyError) {
                            logger.warn(`Email transport verification still failed with adjusted settings: ${secondVerifyError.message}. Continuing anyway.`, secondVerifyError, FILENAME);
                        }
                    } else {
                        logger.warn(`Non-SSL related transport error: ${verifyError.message}. Continuing anyway.`, null, FILENAME);
                    }
                }
            }

            // Prepare email content
            const subject = action.subject || `Certificate Update: ${certificate.name}`;
            const processedSubject = this._replacePlaceholders(subject, certificate);
            logger.debug(`Email subject: ${processedSubject}`, null, FILENAME);

            let htmlContent, textContent;

            // Create the email content using templates or default content
            if (Mustache && action.template) {
                // Use Mustache template if available
                logger.debug(`Using Mustache template for email content`, null, FILENAME);

                const templateVars = {
                    certificate: {
                        name: certificate.name,
                        fingerprint: certificate.fingerprint,
                        subject: certificate.subject,
                        issuer: certificate.issuer,
                        validFrom: certificate.validFrom,
                        validTo: certificate.validTo,
                        domains: certificate.sans?.domains || [],
                        ips: certificate.sans?.ips || [],
                        daysUntilExpiry: certificate.daysUntilExpiry(),
                        isExpired: certificate.isExpired(),
                        certType: certificate.certType
                    },
                    date: new Date().toLocaleDateString(),
                    time: new Date().toLocaleTimeString(),
                    timestamp: new Date().toISOString()
                };

                logger.finest(`Template variables: ${JSON.stringify(templateVars)}`, null, FILENAME);

                if (action.template.html) {
                    logger.debug(`Rendering HTML template`, null, FILENAME);
                    htmlContent = Mustache.render(action.template.html, templateVars);
                    logger.finest(`HTML content size: ${htmlContent.length} bytes`, null, FILENAME);
                }

                if (action.template.text) {
                    logger.debug(`Rendering text template`, null, FILENAME);
                    textContent = Mustache.render(action.template.text, templateVars);
                    logger.finest(`Text content size: ${textContent.length} bytes`, null, FILENAME);
                }

                logger.debug(`Email templates rendered successfully`, null, FILENAME);
            } else {
                // Default content if no template is provided
                logger.debug(`Using default email templates`, null, FILENAME);

                htmlContent = `
                <h2>Certificate Update Notification</h2>
                <p>The following certificate has been deployed:</p>
                <table border="1" cellpadding="5" cellspacing="0" style="border-collapse: collapse;">
                    <tr>
                        <th align="left">Certificate Name</th>
                        <td>${certificate.name}</td>
                    </tr>
                    <tr>
                        <th align="left">Domain(s)</th>
                        <td>${certificate.sans?.domains?.join(', ') || 'None'}</td>
                    </tr>
                    <tr>
                        <th align="left">Valid From</th>
                        <td>${certificate.validFrom}</td>
                    </tr>
                    <tr>
                        <th align="left">Valid To</th>
                        <td>${certificate.validTo}</td>
                    </tr>
                    <tr>
                        <th align="left">Days Until Expiry</th>
                        <td>${certificate.daysUntilExpiry()}</td>
                    </tr>
                    <tr>
                        <th align="left">Fingerprint</th>
                        <td><code>${certificate.fingerprint}</code></td>
                    </tr>
                </table>
                <p>This is an automated notification from the Certificate Manager.</p>
            `;

                textContent = `
Certificate Update Notification

The following certificate has been deployed:

Certificate Name: ${certificate.name}
Domain(s): ${certificate.sans?.domains?.join(', ') || 'None'}
Valid From: ${certificate.validFrom}
Valid To: ${certificate.validTo}
Days Until Expiry: ${certificate.daysUntilExpiry()}
Fingerprint: ${certificate.fingerprint}

This is an automated notification from the Certificate Manager.
            `;

                logger.debug(`Default email content generated`, null, FILENAME);
            }

            // Create email message
            const from = action.from || 'Certificate Manager <cert-manager@localhost>';

            const to = Array.isArray(action.to) ? action.to.join(',') : action.to;
            logger.debug(`Email recipients: ${to}`, null, FILENAME);

            const mailOptions = {
                from: from,
                to: to,
                subject: processedSubject,
                html: htmlContent,
                text: textContent,
            };

            logger.debug(`Email message created with subject: ${mailOptions.subject}`, null, FILENAME);

            // Add CC recipients if specified
            if (action.cc) {
                const cc = Array.isArray(action.cc) ? action.cc.join(',') : action.cc;
                logger.debug(`Adding CC recipients: ${cc}`, null, FILENAME);
                mailOptions.cc = cc;
            }

            // Add BCC recipients if specified
            if (action.bcc) {
                const bcc = Array.isArray(action.bcc) ? action.bcc.join(',') : action.bcc;
                logger.debug(`Adding BCC recipients: ${bcc}`, null, FILENAME);
                mailOptions.bcc = bcc;
            }

            // Add attachments if specified
            if (action.attachCertificates && Array.isArray(action.attachCertificates)) {
                logger.debug(`Preparing certificate attachments: ${action.attachCertificates.join(', ')}`, null, FILENAME);
                const attachments = [];

                for (const fileType of action.attachCertificates) {
                    const filePath = this._getCertificateFile(certificate, fileType);
                    logger.debug(`Processing attachment for ${fileType}: ${filePath}`, null, FILENAME);

                    if (filePath && fs.existsSync(filePath)) {
                        const filename = path.basename(filePath);
                        logger.debug(`Adding attachment: ${filename}`, null, FILENAME);

                        attachments.push({
                            filename: filename,
                            content: fs.createReadStream(filePath)
                        });

                        logger.fine(`Added ${filename} as attachment`, null, FILENAME);
                    } else {
                        logger.warn(`Cannot attach file ${fileType}: file not found at ${filePath}`, null, FILENAME);
                    }
                }

                if (attachments.length > 0) {
                    logger.debug(`Adding ${attachments.length} attachments to email`, null, FILENAME);
                    mailOptions.attachments = attachments;
                } else {
                    logger.debug(`No attachments were added to the email`, null, FILENAME);
                }
            }

            // Send the email
            logger.info(`Sending email notification to ${mailOptions.to}`, null, FILENAME);
            logger.debug(`Sending email via transport`, null, FILENAME);

            const info = await transport.sendMail(mailOptions);
            logger.debug(`Email sent successfully with message ID: ${info.messageId}`, null, FILENAME);

            // Log additional info if available
            if (info.response) {
                logger.debug(`SMTP response: ${info.response}`, null, FILENAME);
            }

            if (info.accepted && info.accepted.length) {
                logger.debug(`Accepted recipients: ${info.accepted.join(', ')}`, null, FILENAME);
            }

            if (info.rejected && info.rejected.length) {
                logger.warn(`Rejected recipients: ${info.rejected.join(', ')}`, null, FILENAME);
            }

            logger.info(`Email notification sent successfully to ${mailOptions.to}`, null, FILENAME);
            return {
                success: true,
                message: `Email notification sent to ${mailOptions.to} (${info.messageId})`,
                messageId: info.messageId,
                recipients: mailOptions.to
            };
        } catch (error) {
            logger.error(`Email notification failed: ${error.message}`, error, FILENAME);
            throw new Error(`Email notification failed: ${error.message}`);
        }
    }

    /**
     * Replace placeholders in a string with certificate values
     * @param {string} text - Text with placeholders
     * @param {Certificate} certificate - Certificate object
     * @returns {string} Text with placeholders replaced
     */
    _replacePlaceholders(text, certificate) {
        if (!text) {
            logger.finest(`_replacePlaceholders called with empty text`, null, FILENAME);
            return text;
        }

        logger.finest(`_replacePlaceholders called with text: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`, null, FILENAME);
        logger.debug(`Replacing placeholders for certificate: ${certificate.name}`, null, FILENAME);

        // Create a map of replacements for debugging
        const replacements = {
            '{name}': certificate.name,
            '{fingerprint}': certificate.fingerprint,
            '{cert_path}': certificate.paths?.crtPath || '',
            '{key_path}': certificate.paths?.keyPath || '',
            '{pem_path}': certificate.paths?.pemPath || '',
            '{p12_path}': certificate.paths?.p12Path || '',
            '{chain_path}': certificate.paths?.chainPath || '',
            '{fullchain_path}': certificate.paths?.fullchainPath || '',
            '{domains}': certificate.sans?.domains?.join(',') || '',
            '{domain}': certificate.sans?.domains?.[0] || certificate.name,
            '{valid_from}': certificate.validFrom || '',
            '{valid_to}': certificate.validTo || '',
            '{days_until_expiry}': typeof certificate.daysUntilExpiry === 'function' ? certificate.daysUntilExpiry() : '',
            '{cert_type}': certificate.certType || '',
            '{timestamp}': new Date().toISOString()
        };

        // Log all replacements for debugging
        logger.finest(`Available placeholder values: ${JSON.stringify(replacements)}`, null, FILENAME);

        // Perform the replacements
        let result = text;
        let replacementCount = 0;
        Object.entries(replacements).forEach(([placeholder, value]) => {
            try {
                // Count replacements to detect if any occurred
                const before = result;
                const regex = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
                result = result.replace(regex, value);

                if (before !== result) {
                    const count = (before.match(regex) || []).length;
                    replacementCount += count;
                    logger.finest(`Replaced ${count} occurrence(s) of ${placeholder} with "${value}"`, null, FILENAME);
                }
            } catch (error) {
                logger.warn(`Error replacing placeholder ${placeholder}: ${error.message}`, error, FILENAME);
            }
        });

        if (result !== text) {
            logger.debug(`Made ${replacementCount} placeholder replacements`, null, FILENAME);
            logger.finest(`Original text: ${text.substring(0, 100)}${text.length > 100 ? '...' : ''}`, null, FILENAME);
            logger.finest(`After replacements: ${result.substring(0, 100)}${result.length > 100 ? '...' : ''}`, null, FILENAME);
        } else {
            logger.debug(`No placeholders found in text`, null, FILENAME);
        }

        return result;
    }

    /**
     * Get certificate file path based on a source identifier
     * @param {Certificate} certificate - Certificate object
     * @param {string} source - Source identifier (cert, key, chain, etc.)
     * @returns {string} Path to the certificate file
     */
    _getCertificateFile(certificate, source) {
        logger.finest(`_getCertificateFile called for certificate: ${certificate.name}, source: ${source}`, null, FILENAME);

        if (!source) {
            logger.error(`Empty source provided to _getCertificateFile for certificate: ${certificate.name}`, null, FILENAME);
            return null;
        }

        if (!certificate) {
            logger.error(`No certificate provided to _getCertificateFile for source: ${source}`, null, FILENAME);
            return null;
        }

        if (!certificate.paths) {
            logger.error(`Certificate has no paths defined: ${certificate.name}`, null, FILENAME);
            return source; // Return source as fallback
        }

        let result;

        switch (source) {
            case 'cert':
            case 'crt':
                result = certificate.paths.crtPath;
                logger.debug(`Resolved 'cert/crt' to: ${result}`, null, FILENAME);
                break;
            case 'key':
                result = certificate.paths.keyPath;
                logger.debug(`Resolved 'key' to: ${result}`, null, FILENAME);
                break;
            case 'chain':
                result = certificate.paths.chainPath;
                logger.debug(`Resolved 'chain' to: ${result}`, null, FILENAME);
                break;
            case 'fullchain':
                result = certificate.paths.fullchainPath;
                logger.debug(`Resolved 'fullchain' to: ${result}`, null, FILENAME);
                break;
            case 'p12':
                result = certificate.paths.p12Path;
                logger.debug(`Resolved 'p12' to: ${result}`, null, FILENAME);
                break;
            case 'pem':
                result = certificate.paths.pemPath;
                logger.debug(`Resolved 'pem' to: ${result}`, null, FILENAME);
                break;
            default:
                result = source;
                logger.debug(`Unknown source type '${source}', assuming direct path`, null, FILENAME);
                break;
        }

        // Check if the path exists
        if (result) {
            try {
                const exists = fs.existsSync(result);
                if (exists) {
                    const stats = fs.statSync(result);
                    logger.fine(`Certificate file exists: ${result} (size: ${stats.size} bytes, modified: ${stats.mtime})`, null, FILENAME);
                } else {
                    logger.warn(`Certificate file does not exist: ${result}`, null, FILENAME);
                }
            } catch (error) {
                logger.warn(`Error checking certificate file: ${error.message}`, error, FILENAME);
            }
        } else {
            logger.warn(`No path found for source '${source}' in certificate ${certificate.name}`, null, FILENAME);
        }

        logger.finest(`Returning path: ${result}`, null, FILENAME);
        return result;
    }



    getDeploymentSettings() {
        try {
            const configService = require('./config-service');
            return configService.get().deployment || {};
        } catch (error) {
            logger.error('Failed to get deployment settings from config service:', error, FILENAME);
            return {};
        }
    }

    // When accessing specific settings
    getEmailSettings() {
        const deploySettings = this.getDeploymentSettings();
        return deploySettings.email?.smtp || {};
    }

    getNginxProxyManagerSettings() {
        const deploySettings = this.getDeploymentSettings();
        return deploySettings.nginxProxyManager || {};
    }
}

// Create and export a singleton instance
const deployService = new DeployService();
module.exports = deployService;