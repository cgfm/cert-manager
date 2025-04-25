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

// Dynamically load optional dependencies 
let SftpClient, SMB2, ftp, axios, FormData, nodemailer, Mustache;
try {
    SftpClient = require('ssh2-sftp-client');
} catch (e) {
    logger.warn('ssh2-sftp-client module not found. SSH deployment will not be available.');
}

try {
    SMB2 = require('smb2');
} catch (e) {
    logger.warn('smb2 module not found. SMB deployment will not be available.');
}

try {
    ftp = require('basic-ftp');
} catch (e) {
    logger.warn('basic-ftp module not found. FTP deployment will not be available.');
}

try {
    axios = require('axios');
} catch (e) {
    logger.warn('axios module not found. API deployment will not be available.');
}

try {
    FormData = require('form-data');
} catch (e) {
    logger.warn('form-data module not found. API file uploads will not be available.');
}

try {
    nodemailer = require('nodemailer');
} catch (e) {
    logger.warn('nodemailer module not found. Email notifications will not be available.');
}

try {
    Mustache = require('mustache');
} catch (e) {
    logger.warn('mustache module not found. Advanced template rendering will not be available.');
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
        
        if (!deployActions.length) {
            logger.info(`No deployment actions defined for certificate: ${certificate.name}`);
            return { success: true, actionsExecuted: 0 };
        }
        
        logger.info(`Executing ${deployActions.length} deployment actions for certificate: ${certificate.name}`);
        
        const results = {
            success: true,
            actionsExecuted: 0,
            failures: [],
            details: []
        };
        
        // Execute each action in sequence
        for (const action of deployActions) {
            try {
                let actionResult;
                
                switch (action.type) {
                    case 'copy':
                        actionResult = await this.executeCopyAction(certificate, action);
                        break;
                        
                    case 'command':
                        actionResult = await this.executeCommandAction(certificate, action);
                        break;
                        
                    case 'docker-restart':
                        actionResult = await this.executeDockerRestartAction(certificate, action);
                        break;
                        
                    case 'nginx-proxy-manager':
                        actionResult = await this.executeNginxProxyManagerAction(certificate, action);
                        break;
                        
                    case 'ssh-copy':
                        actionResult = await this.executeSshCopyAction(certificate, action);
                        break;
                        
                    case 'smb-copy':
                        actionResult = await this.executeSmbCopyAction(certificate, action);
                        break;

                    case 'ftp-copy':
                        actionResult = await this.executeFtpCopyAction(certificate, action);
                        break;

                    case 'api-call':
                        actionResult = await this.executeApiCallAction(certificate, action);
                        break;
                        
                    case 'webhook':
                        actionResult = await this.executeWebhookAction(certificate, action);
                        break;

                    case 'email':
                        actionResult = await this.executeEmailAction(certificate, action);
                        break;
                        
                    default:
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
        
        return results;
    }
    
    /**
     * Execute a copy action
     * @param {Certificate} certificate - Certificate object
     * @param {Object} action - Copy action configuration
     * @returns {Promise<Object>} Result of the copy operation
     */
    async executeCopyAction(certificate, action) {
        if (!action.source) {
            throw new Error('Copy action requires a source property');
        }
        
        if (!action.destination) {
            throw new Error('Copy action requires a destination property');
        }
        
        try {
            // Determine source file
            const sourcePath = this._getCertificateFile(certificate, action.source);
            
            if (!fs.existsSync(sourcePath)) {
                throw new Error(`Source file does not exist: ${sourcePath}`);
            }
            
            // Ensure destination directory exists
            const destinationDir = path.dirname(action.destination);
            if (!fs.existsSync(destinationDir)) {
                fs.mkdirSync(destinationDir, { recursive: true });
            }
            
            // Copy the file
            logger.info(`Copying ${sourcePath} to ${action.destination}`);
            fs.copyFileSync(sourcePath, action.destination);
            
            // Set file permissions if specified (Unix/Linux only)
            if (action.permissions && process.platform !== 'win32') {
                try {
                    fs.chmodSync(action.destination, action.permissions);
                } catch (error) {
                    logger.warn(`Could not set permissions on ${action.destination}:`, error);
                }
            }
            
            return {
                success: true,
                message: `File copied to ${action.destination}`,
                sourcePath,
                destination: action.destination
            };
        } catch (error) {
            logger.error(`Copy action failed: ${error.message}`);
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
        if (!action.command) {
            throw new Error('Command action requires a command property');
        }
        
        // Replace placeholders in command with actual values
        const command = this._replacePlaceholders(action.command, certificate);
        
        // Set up options for command execution
        const options = { shell: true };
        
        // Set working directory if specified
        if (action.cwd) {
            options.cwd = action.cwd;
        }
        
        // Set environment variables if specified
        if (action.env) {
            options.env = { ...process.env, ...action.env };
        }
        
        // Execute the command
        const { stdout, stderr } = await execAsync(command, options);
        
        // Log command output if verbose
        if (action.verbose) {
            logger.info(`Command output: ${stdout}`);
            if (stderr) {
                logger.warn(`Command stderr: ${stderr}`);
            }
        }
        
        return {
            success: true,
            message: `Command executed successfully`,
            command,
            stdout,
            stderr
        };
    }
    
    /**
     * Execute a Docker container restart action
     * @param {Certificate} certificate - Certificate object
     * @param {Object} action - Docker restart action configuration
     * @returns {Promise<Object>} Result of the Docker restart
     */
    async executeDockerRestartAction(certificate, action) {
        if (!action.containerId && !action.containerName) {
            throw new Error('Docker restart action requires containerId or containerName property');
        }
        
        // Check if Docker is available
        if (!dockerService.isAvailable) {
            throw new Error('Docker is not available');
        }
        
        // Get container ID from name if only name is provided
        let containerId = action.containerId;
        if (!containerId && action.containerName) {
            const containers = await dockerService.getContainers();
            const container = containers.find(c => {
                return c.Names.some(name => name.replace(/^\//, '') === action.containerName);
            });
            
            if (!container) {
                throw new Error(`Docker container not found with name: ${action.containerName}`);
            }
            
            containerId = container.Id;
        }
        
        // Restart the container
        await dockerService.restartContainer(containerId);
        
        return {
            success: true,
            message: `Docker container restarted successfully`,
            containerId,
            containerName: action.containerName
        };
    }
    
    /**
     * Execute a Nginx Proxy Manager certificate update action
     * @param {Certificate} certificate - Certificate object
     * @param {Object} action - Nginx Proxy Manager action configuration
     * @returns {Promise<Object>} Result of the NPM update
     */
    async executeNginxProxyManagerAction(certificate, action) {
        if (!action.npmPath && !action.dockerContainer) {
            throw new Error('Nginx Proxy Manager action requires npmPath or dockerContainer property');
        }
        
        // Check if we have all required certificate files
        if (!certificate.paths.crtPath || !certificate.paths.keyPath) {
            throw new Error('Certificate and key files are required for Nginx Proxy Manager update');
        }
        
        let npmLetsEncryptDir;
        
        // Determine Nginx Proxy Manager path
        if (action.npmPath) {
            // Direct path to Nginx Proxy Manager installation
            npmLetsEncryptDir = path.join(action.npmPath, 'letsencrypt');
        } else {
            // Docker container-based Nginx Proxy Manager
            if (!dockerService.isAvailable) {
                throw new Error('Docker is not available for Nginx Proxy Manager container access');
            }
            
            // Find the container
            const containers = await dockerService.getContainers();
            const container = containers.find(c => {
                return c.Names.some(name => name.replace(/^\//, '') === action.dockerContainer);
            });
            
            if (!container) {
                throw new Error(`Docker container not found with name: ${action.dockerContainer}`);
            }
            
            // Create a temp directory for NPM certificate files
            const tempNpmDir = path.join(os.tmpdir(), 'npm-cert-update', certificate.fingerprint);
            await fs.promises.mkdir(tempNpmDir, { recursive: true });
            
            // Copy certificate files to temp directory
            const certTempPath = path.join(tempNpmDir, 'fullchain.pem');
            const keyTempPath = path.join(tempNpmDir, 'privkey.pem');
            
            await fs.promises.copyFile(certificate.paths.crtPath, certTempPath);
            await fs.promises.copyFile(certificate.paths.keyPath, keyTempPath);
            
            // Copy files to container
            const dockerContainer = dockerService.docker.getContainer(container.Id);
            
            // Determine the NPM letsencrypt directory inside the container
            const npmLetsEncryptDir = '/etc/letsencrypt/live/custom-' + certificate.name.replace(/\./g, '-');
            
            // Ensure directory exists in container
            await execAsync(`docker exec ${container.Id} mkdir -p ${npmLetsEncryptDir}`);
            
            // Copy files to container
            await execAsync(`docker cp ${certTempPath} ${container.Id}:${npmLetsEncryptDir}/fullchain.pem`);
            await execAsync(`docker cp ${keyTempPath} ${container.Id}:${npmLetsEncryptDir}/privkey.pem`);
            
            // Clean up temp directory
            await fs.promises.rm(tempNpmDir, { recursive: true, force: true });
            
            // Restart the container to apply changes
            await dockerService.restartContainer(container.Id);
            
            return {
                success: true,
                message: `Nginx Proxy Manager certificate updated in container ${action.dockerContainer}`,
                containerName: action.dockerContainer
            };
        }
        
        // Local NPM installation
        const certName = `custom-${certificate.name.replace(/\./g, '-')}`;
        const npmCertDir = path.join(npmLetsEncryptDir, 'live', certName);
        
        // Create NPM certificate directory if it doesn't exist
        await fs.promises.mkdir(npmCertDir, { recursive: true });
        
        // Copy certificate files
        await fs.promises.copyFile(certificate.paths.crtPath, path.join(npmCertDir, 'fullchain.pem'));
        await fs.promises.copyFile(certificate.paths.keyPath, path.join(npmCertDir, 'privkey.pem'));
        
        // Create a restart flag file to trigger NPM reload
        const restartFlagFile = path.join(npmLetsEncryptDir, 'reload.nginx');
        await fs.promises.writeFile(restartFlagFile, new Date().toISOString(), 'utf8');
        
        return {
            success: true,
            message: `Nginx Proxy Manager certificate updated at ${npmCertDir}`,
            npmCertDir
        };
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
        if (!ftp) {
            throw new Error('basic-ftp module not installed. Run: npm install basic-ftp');
        }
        
        if (!action.host) {
            throw new Error('FTP copy action requires a host property');
        }
        
        if (!action.source || !action.destination) {
            throw new Error('FTP copy action requires source and destination properties');
        }
        
        // Determine source file
        const sourcePath = this._getCertificateFile(certificate, action.source);
        
        if (!fs.existsSync(sourcePath)) {
            throw new Error(`Source file does not exist: ${sourcePath}`);
        }
        
        const client = new ftp.Client();
        
        // Set up logging if verbose mode is enabled
        if (action.verbose) {
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
            
            logger.info(`Connecting to FTP server ${config.host}:${config.port} as ${config.user}`);
            await client.access(config);
            
            // Create directories if needed
            const destDir = path.dirname(action.destination);
            if (destDir && destDir !== '.') {
                try {
                    // Navigate through each directory level, creating if needed
                    const dirs = destDir.split(/[/\\]/).filter(Boolean);
                    for (let i = 0; i < dirs.length; i++) {
                        const currentPath = dirs.slice(0, i + 1).join('/');
                        
                        try {
                            await client.cd(currentPath);
                        } catch (e) {
                            // If the directory doesn't exist, create it
                            try {
                                await client.cd(dirs.slice(0, i).join('/') || '/');
                                await client.mkdir(dirs[i]);
                            } catch (mkdirError) {
                                logger.warn(`Error creating directory ${dirs[i]}: ${mkdirError.message}`);
                            }
                        }
                    }
                    
                    // Reset to root for the upload
                    await client.cd('/');
                } catch (error) {
                    logger.warn(`Error navigating FTP directories: ${error.message}`);
                }
            }
            
            // Upload the file
            logger.info(`Copying ${sourcePath} to FTP: ${action.host}/${action.destination}`);
            await client.uploadFrom(sourcePath, action.destination);
            
            // Set permissions if specified
            if (action.permissions) {
                try {
                    const chmodCommand = `SITE CHMOD ${action.permissions.toString(8)} ${action.destination}`;
                    await client.send(chmodCommand);
                } catch (error) {
                    logger.warn(`Could not set permissions on ${action.destination}`, error);
                }
            }
            
            client.close();
            
            return {
                success: true,
                message: `File copied to FTP server ${action.host}/${action.destination}`,
                sourcePath,
                destination: `${action.host}/${action.destination}`
            };
        } catch (error) {
            logger.error(`FTP copy action failed: ${error.message}`, error);
            
            // Ensure connection is closed
            try {
                client.close();
            } catch (e) {
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
        if (!axios) {
            throw new Error('axios module not installed. Run: npm install axios');
        }
        
        if (!action.url) {
            throw new Error('API call action requires a url property');
        }
        
        if (!action.method) {
            action.method = 'POST'; // Default method is POST
        }
        
        try {
            // Prepare request options
            const options = {
                method: action.method,
                url: this._replacePlaceholders(action.url, certificate),
                headers: action.headers || {}
            };
            
            // Handle different payloads based on configuration
            if (action.sendFiles) {
                // File upload using FormData
                if (!FormData) {
                    throw new Error('form-data module not installed. Run: npm install form-data');
                }
                
                const form = new FormData();
                
                // Add certificate files to form based on configuration
                for (const [key, filePath] of Object.entries(action.files || {})) {
                    const sourcePath = this._getCertificateFile(certificate, filePath);
                    if (sourcePath && fs.existsSync(sourcePath)) {
                        const fileContent = fs.createReadStream(sourcePath);
                        form.append(key, fileContent, path.basename(sourcePath));
                    } else {
                        logger.warn(`File not found for form field ${key}: ${filePath}`);
                    }
                }
                
                // Add additional form fields if specified
                if (action.data) {
                    for (const [key, value] of Object.entries(action.data)) {
                        form.append(key, this._replacePlaceholders(value, certificate));
                    }
                }
                
                // Add form headers to request
                const formHeaders = form.getHeaders();
                options.headers = { ...options.headers, ...formHeaders };
                options.data = form;
            } else if (action.jsonPayload) {
                // JSON payload
                const payload = typeof action.jsonPayload === 'string' 
                    ? JSON.parse(this._replacePlaceholders(action.jsonPayload, certificate))
                    : action.jsonPayload;
                    
                // Apply replacements to each string value in the payload
                const processedPayload = this._processJsonPayload(payload, certificate);
                
                options.headers['Content-Type'] = 'application/json';
                options.data = processedPayload;
            } else if (action.formData) {
                // Form urlencoded data
                options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
                
                const formData = {};
                for (const [key, value] of Object.entries(action.formData)) {
                    formData[key] = this._replacePlaceholders(value, certificate);
                }
                
                options.data = new URLSearchParams(formData).toString();
            } else if (action.data) {
                // Generic data payload
                options.data = action.data;
            }
            
            // Set authentication if provided
            if (action.auth) {
                if (action.auth.bearer) {
                    options.headers['Authorization'] = `Bearer ${action.auth.bearer}`;
                } else if (action.auth.username && action.auth.password) {
                    options.auth = {
                        username: action.auth.username,
                        password: action.auth.password
                    };
                } else if (action.auth.apiKey && action.auth.apiKeyHeader) {
                    options.headers[action.auth.apiKeyHeader] = action.auth.apiKey;
                }
            }
            
            // Execute the API call
            logger.info(`Making API call to ${options.url} [${options.method}]`);
            
            if (action.verbose) {
                logger.info(`API call details: ${JSON.stringify({
                    url: options.url,
                    method: options.method,
                    headers: options.headers,
                    data: options.data ? 'DATA_PRESENT' : 'NONE'
                }, null, 2)}`);
            }
            
            const response = await axios(options);
            
            // Log response if verbose
            if (action.verbose) {
                logger.info(`API response status: ${response.status}`);
                logger.info(`API response headers: ${JSON.stringify(response.headers, null, 2)}`);
                
                // Try to limit response size for logging
                const responseData = typeof response.data === 'object' 
                    ? JSON.stringify(response.data).substring(0, 1000) 
                    : response.data?.toString().substring(0, 1000);
                    
                logger.info(`API response data (truncated): ${responseData}${responseData?.length >= 1000 ? '...' : ''}`);
            }
            
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
                ...(errorResponse ? { response: errorResponse } : {})
            });
            
            throw new Error(`API call failed: ${error.message}`);
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
        if (typeof payload === 'string') {
            return this._replacePlaceholders(payload, certificate);
        } else if (typeof payload === 'object' && payload !== null) {
            if (Array.isArray(payload)) {
                return payload.map(item => this._processJsonPayload(item, certificate));
            } else {
                const result = {};
                for (const [key, value] of Object.entries(payload)) {
                    result[key] = this._processJsonPayload(value, certificate);
                }
                return result;
            }
        } else {
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
        if (!axios) {
            throw new Error('axios module not installed. Run: npm install axios');
        }
        
        if (!action.url) {
            throw new Error('Webhook action requires a url property');
        }
        
        try {
            // Prepare basic certificate information for the webhook payload
            const certInfo = {
                name: certificate.name,
                fingerprint: certificate.fingerprint,
                subject: certificate.subject,
                issuer: certificate.issuer,
                validFrom: certificate.validFrom,
                validTo: certificate.validTo,
                domains: certificate.domains,
                ips: certificate.ips,
                isExpired: certificate.isExpired(),
                daysUntilExpiry: certificate.daysUntilExpiry(),
                certType: certificate.certType
            };
            
            // Create webhook payload
            const payload = {
                event: action.event || 'certificate.deployed',
                timestamp: new Date().toISOString(),
                certificate: certInfo,
                ...action.includeCustomData ? { customData: action.customData || {} } : {}
            };
            
            // Add file contents if requested
            if (action.includeFiles) {
                const fileContents = {};
                
                for (const fileType of action.includeFiles) {
                    const filePath = this._getCertificateFile(certificate, fileType);
                    if (filePath && fs.existsSync(filePath)) {
                        try {
                            // For safety, only include specific file types as base64
                            const fileContent = fs.readFileSync(filePath, 'utf8');
                            fileContents[fileType] = fileContent;
                        } catch (err) {
                            logger.warn(`Failed to read ${fileType} file for webhook:`, err);
                        }
                    }
                }
                
                if (Object.keys(fileContents).length > 0) {
                    payload.files = fileContents;
                }
            }
            
            // Set up request options
            const options = {
                method: action.method || 'POST',
                url: this._replacePlaceholders(action.url, certificate),
                headers: {
                    'Content-Type': 'application/json',
                    ...action.headers || {}
                },
                data: payload
            };
            
            // Add authentication if specified
            if (action.auth) {
                if (action.auth.bearer) {
                    options.headers['Authorization'] = `Bearer ${action.auth.bearer}`;
                } else if (action.auth.type === 'basic' && action.auth.username && action.auth.password) {
                    options.auth = {
                        username: action.auth.username,
                        password: action.auth.password
                    };
                }
            }
            
            // Send the webhook
            logger.info(`Sending webhook notification to ${options.url}`);
            const response = await axios(options);
            
            return {
                success: true,
                message: `Webhook notification to ${options.url} completed successfully with status ${response.status}`,
                url: options.url,
                status: response.status,
                statusText: response.statusText
            };
        } catch (error) {
            logger.error(`Webhook notification failed: ${error.message}`, { 
                url: action.url, 
                error: error.toString(),
                response: error.response ? {
                    status: error.response.status,
                    data: error.response.data
                } : 'No response'
            });
            
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
        if (!nodemailer) {
            throw new Error('nodemailer module not installed. Run: npm install nodemailer');
        }
        
        if (!action.to) {
            throw new Error('Email action requires at least one recipient (to property)');
        }
        
        if (!action.smtp && !action.transportConfig) {
            throw new Error('Email action requires either smtp or transportConfig property');
        }
        
        try {
            let transport;
            
            // Set up transport based on configuration
            if (action.transportConfig) {
                // Use provided transport configuration
                transport = nodemailer.createTransport(action.transportConfig);
            } else {
                // Create transport from SMTP settings
                transport = nodemailer.createTransport({
                    host: action.smtp.host,
                    port: action.smtp.port || 587,
                    secure: action.smtp.secure || false,
                    auth: {
                        user: action.smtp.user,
                        pass: action.smtp.password
                    },
                    tls: {
                        rejectUnauthorized: action.smtp.rejectUnauthorized !== false
                    }
                });
            }
            
            // Prepare email content
            const subject = action.subject || `Certificate Update: ${certificate.name}`;
            let htmlContent, textContent;
            
            // Create the email content using templates or default content
            if (Mustache && action.template) {
                // Use Mustache template if available
                const templateVars = {
                    certificate: {
                        name: certificate.name,
                        fingerprint: certificate.fingerprint,
                        subject: certificate.subject,
                        issuer: certificate.issuer,
                        validFrom: certificate.validFrom,
                        validTo: certificate.validTo,
                        domains: certificate.domains,
                        ips: certificate.ips,
                        daysUntilExpiry: certificate.daysUntilExpiry(),
                        isExpired: certificate.isExpired(),
                        certType: certificate.certType
                    },
                    date: new Date().toLocaleDateString(),
                    time: new Date().toLocaleTimeString(),
                    timestamp: new Date().toISOString()
                };
                
                if (action.template.html) {
                    htmlContent = Mustache.render(action.template.html, templateVars);
                }
                
                if (action.template.text) {
                    textContent = Mustache.render(action.template.text, templateVars);
                }
            } else {
                // Default content if no template is provided
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
                            <td>${certificate.domains.join(', ')}</td>
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
Domain(s): ${certificate.domains.join(', ')}
Valid From: ${certificate.validFrom}
Valid To: ${certificate.validTo}
Days Until Expiry: ${certificate.daysUntilExpiry()}
Fingerprint: ${certificate.fingerprint}

This is an automated notification from the Certificate Manager.
                `;
            }
            
            // Create email message
            const mailOptions = {
                from: action.from || 'Certificate Manager <cert-manager@localhost>',
                to: Array.isArray(action.to) ? action.to.join(',') : action.to,
                subject: this._replacePlaceholders(subject, certificate),
                html: htmlContent,
                text: textContent,
            };
            
            // Add CC recipients if specified
            if (action.cc) {
                mailOptions.cc = Array.isArray(action.cc) ? action.cc.join(',') : action.cc;
            }
            
            // Add BCC recipients if specified
            if (action.bcc) {
                mailOptions.bcc = Array.isArray(action.bcc) ? action.bcc.join(',') : action.bcc;
            }
            
            // Add attachments if specified
            if (action.attachCertificates) {
                const attachments = [];
                
                for (const fileType of action.attachCertificates) {
                    const filePath = this._getCertificateFile(certificate, fileType);
                    if (filePath && fs.existsSync(filePath)) {
                        attachments.push({
                            filename: path.basename(filePath),
                            content: fs.createReadStream(filePath)
                        });
                    }
                }
                
                if (attachments.length > 0) {
                    mailOptions.attachments = attachments;
                }
            }
            
            // Send the email
            logger.info(`Sending email notification to ${mailOptions.to}`);
            const info = await transport.sendMail(mailOptions);
            
            return {
                success: true,
                message: `Email notification sent to ${mailOptions.to} (${info.messageId})`,
                messageId: info.messageId,
                recipients: mailOptions.to
            };
        } catch (error) {
            logger.error(`Email notification failed: ${error.message}`, error);
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
        if (!text) return text;
        
        return text
            .replace(/\{name\}/g, certificate.name)
            .replace(/\{fingerprint\}/g, certificate.fingerprint)
            .replace(/\{cert_path\}/g, certificate.paths.crtPath || '')
            .replace(/\{key_path\}/g, certificate.paths.keyPath || '')
            .replace(/\{pem_path\}/g, certificate.paths.pemPath || '')
            .replace(/\{p12_path\}/g, certificate.paths.p12Path || '')
            .replace(/\{chain_path\}/g, certificate.paths.chainPath || '')
            .replace(/\{fullchain_path\}/g, certificate.paths.fullchainPath || '')
            .replace(/\{domains\}/g, certificate.domains.join(','))
            .replace(/\{domain\}/g, certificate.domains[0] || certificate.name)
            .replace(/\{valid_from\}/g, certificate.validFrom || '')
            .replace(/\{valid_to\}/g, certificate.validTo || '')
            .replace(/\{days_until_expiry\}/g, certificate.daysUntilExpiry() || '')
            .replace(/\{cert_type\}/g, certificate.certType || '')
            .replace(/\{timestamp\}/g, new Date().toISOString());
    }
    
    /**
     * Get certificate file path based on a source identifier
     * @param {Certificate} certificate - Certificate object
     * @param {string} source - Source identifier (cert, key, chain, etc.)
     * @returns {string} Path to the certificate file
     */
    _getCertificateFile(certificate, source) {
        switch (source) {
            case 'cert':
            case 'crt':
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
                return source; // Assume it's a direct path
        }
    }

    /**
     * Verify a deployment was successful
     * @param {Object} action - The deployment action
     * @param {string} destination - The destination where files were copied
     * @returns {Promise<boolean>} True if deployment was verified
     */
    async verifyDeployment(action, destination) {
        try {
            switch (action.type) {
                case 'nginx-proxy-manager':
                    // For NPM, check if the service is running
                    if (action.dockerContainer) {
                        const containers = await dockerService.getContainers();
                        const container = containers.find(c => 
                            c.Names.some(name => name.replace(/^\//, '') === action.dockerContainer)
                        );
                        return container && container.State === 'running';
                    }
                    return true;
                    
            case 'ssh-copy':
                // Verify SSH copy by checking if the remote file exists
                if (!action.host || !action.destination) {
                    logger.warn('Cannot verify SSH deployment: missing host or destination');
                    return false;
                }
                
                try {
                    const command = `test -e "${action.destination}" && echo "EXISTS" || echo "MISSING"`;
                    const sshCommand = this._buildSshCommand(action, command);
                    
                    const result = execSync(sshCommand, { encoding: 'utf8' }).trim();
                    return result === 'EXISTS';
                } catch (sshError) {
                    logger.warn(`SSH verification failed: ${sshError.message}`);
                    return false;
                }
                
            case 'smb-copy':
                // Verify SMB copy by checking if the remote file exists
                if (!SMB2) {
                    logger.warn('SMB verification skipped: smb2 module not loaded');
                    return false;
                }
                
                if (!action.share || !action.destination) {
                    logger.warn('Cannot verify SMB deployment: missing share or destination');
                    return false;
                }
                
                try {
                    // Initialize SMB client
                    const smbConfig = {
                        share: action.share,
                        domain: action.domain || '',
                        username: action.username || '',
                        password: action.password || '',
                        autoCloseTimeout: 5000
                    };
                    
                    const smb = new SMB2(smbConfig);
                    const smbExists = promisify(smb.exists.bind(smb));
                    
                    // Check if file exists
                    const exists = await smbExists(action.destination);
                    
                    // Close the connection
                    smb.disconnect();
                    
                    return exists;
                } catch (smbError) {
                    logger.warn(`SMB verification failed: ${smbError.message}`);
                    return false;
                }
                
            case 'ftp-copy':
                // Verify FTP copy by checking if the remote file exists
                if (!ftp) {
                    logger.warn('FTP verification skipped: basic-ftp module not loaded');
                    return false;
                }
                
                if (!action.host || !action.destination) {
                    logger.warn('Cannot verify FTP deployment: missing host or destination');
                    return false;
                }
                
                try {
                    const client = new ftp.Client();
                    
                    // Connect to FTP server
                    const config = {
                        host: action.host,
                        port: action.port || 21,
                        user: action.username || 'anonymous',
                        password: action.password || 'anonymous@example.com',
                        secure: action.secure || false
                    };
                    
                    await client.access(config);
                    
                    // Check if the file exists by trying to get its size
                    try {
                        const size = await client.size(action.destination);
                        client.close();
                        return size > 0;
                    } catch (ftpFileError) {
                        client.close();
                        if (ftpFileError.code === 550) {
                            // 550 is the error code for "file not found"
                            return false;
                        }
                        throw ftpFileError;
                    }
                } catch (ftpError) {
                    logger.warn(`FTP verification failed: ${ftpError.message}`);
                    return false;
                }
                    
                case 'copy':
                    // For local copy, check if file exists
                    return fs.existsSync(destination);
                    
                default:
                    return true;
            }
        } catch (error) {
            logger.warn(`Deployment verification failed: ${error.message}`);
            return false;
        }
    }
}

// Create and export a singleton instance
const deployService = new DeployService();
module.exports = deployService;