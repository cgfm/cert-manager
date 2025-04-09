const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const logger = require('./services/logger');

class RenewalManager {
    constructor(configManager, certsDir) {
        this.configManager = configManager;
        this.certsDir = certsDir;
    }

    async checkCertificatesForRenewal(certificates) {
        const now = new Date();
        
        // First check for any certificates that need renewal
        const certsToRenew = [];
        
        for (const cert of certificates) {
            if (cert.certType === 'rootCA' || cert.certType === 'intermediateCA') {
                // Skip CA certificates for now - they're handled separately
                continue;
            }
            
            // Get cert config with defaults
            const config = this.configManager.getCertConfig(cert.fingerprint);
            
            if (!config.autoRenew || !cert.expiryDate) {
                continue;
            }
            
            // Calculate threshold date for renewal
            const renewalThreshold = new Date();
            renewalThreshold.setDate(renewalThreshold.getDate() + config.renewDaysBeforeExpiry);
            
            if (cert.expiryDate <= renewalThreshold) {
                console.log(`Certificate ${cert.name} needs renewal (expires ${cert.expiryDate})`);
                certsToRenew.push({ cert, config });
            }
        }
        
        // Renew certificates in sequence
        for (const { cert, config } of certsToRenew) {
            try {
                await this.renewCertificate(cert);
                await this.runDeployActions(cert, config.deployActions);
            } catch (error) {
                console.error(`Failed to renew certificate ${cert.name}:`, error);
            }
        }
        
        // Now check for CA certificates that need renewal
        // CA certificates have a higher renewal threshold because they're critical
        for (const cert of certificates) {
            if (cert.certType !== 'rootCA' && cert.certType !== 'intermediateCA') {
                continue; // Only process CA certs in this pass
            }
            
            const config = this.configManager.getCertConfig(cert.fingerprint);
            
            if (!config.autoRenew || !cert.expiryDate) {
                continue;
            }
            
            // For CAs, we want a more conservative approach - renew when they reach 25% of validity left
            const defaults = this.configManager.getGlobalDefaults();
            const caType = cert.certType === 'rootCA' ? 'rootCA' : 'intermediateCA';
            const totalValidityDays = defaults.caValidityPeriod[caType];
            
            // We want to renew CA certificates when they reach 75% of their total validity
            // This is a more aggressive renewal strategy for critical infrastructure
            const renewThresholdDays = Math.floor(totalValidityDays * 0.25);
            
            const expiryTime = cert.expiryDate.getTime();
            const nowTime = now.getTime();
            const daysUntilExpiry = Math.floor((expiryTime - nowTime) / (1000 * 60 * 60 * 24));
            
            if (daysUntilExpiry <= renewThresholdDays) {
                console.log(`CA Certificate ${cert.name} needs renewal (${daysUntilExpiry} days until expiry, threshold: ${renewThresholdDays})`);
                try {
                    await this.renewCACertificate(cert);
                    await this.runDeployActions(cert, config.deployActions);
                } catch (error) {
                    console.error(`Failed to renew CA certificate ${cert.name}:`, error);
                }
            }
        }
    }

    async renewCertificate(cert) {
        logger.info(`Renewing certificate for: ${cert.domains ? cert.domains.join(', ') : cert.name}`);
        
        // Get certificate generation parameters
        const config = this.configManager.getCertConfig(cert.fingerprint);
        const defaults = this.configManager.getGlobalDefaults();
        
        // Determine validity period
        const validityDays = config.validityDays || defaults.caValidityPeriod.standard;
        
        try {
            // Extract the actual directory and filenames from cert.path
            let outputDir, keyFilename, certFilename;
            if (cert.path) {
                // If cert.path is available, use its directory and extract the filename
                outputDir = path.dirname(cert.path);
                certFilename = path.basename(cert.path);
                
                // Try to guess the key filename based on common patterns
                if (cert.keyPath) {
                    keyFilename = path.basename(cert.keyPath);
                    logger.debug(`Using existing key filename: ${keyFilename}`);
                } else if (fs.existsSync(path.join(outputDir, 'private.key'))) {
                    keyFilename = 'private.key';
                    logger.debug(`Found default private.key in directory`);
                } else if (fs.existsSync(path.join(outputDir, certFilename.replace('.crt', '.key')))) {
                    keyFilename = certFilename.replace('.crt', '.key');
                    logger.debug(`Found matching key file: ${keyFilename}`);
                } else {
                    // Default fallback - use cert name as base for key name
                    keyFilename = certFilename.replace(/\.(crt|pem|cert)$/, '.key');
                    logger.debug(`Using derived key filename: ${keyFilename}`);
                }
            } else {
                // Otherwise create a sanitized name
                const sanitizedName = cert.domains && cert.domains[0] 
                    ? cert.domains[0].replace(/\*/g, 'wildcard').replace(/[^a-zA-Z0-9-_.]/g, '_') 
                    : cert.name.replace(/[^a-zA-Z0-9-_.]/g, '_');
                outputDir = path.join(this.certsDir, sanitizedName);
                certFilename = 'certificate.crt';
                keyFilename = 'private.key';
                logger.debug(`Using default filenames in directory: ${outputDir}`);
            }
            
            // Make sure the directory exists
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
                logger.debug(`Created output directory: ${outputDir}`);
            }
            
            // Set up paths for key and certificate
            const keyPath = path.join(outputDir, keyFilename);
            const certPath = path.join(outputDir, certFilename);
            
            logger.info(`Certificate will be renewed at: ${certPath}`);
            logger.info(`Private key will be saved at: ${keyPath}`);
            
            // Rest of the renewal code...
            
            // After renewal completes successfully, update the cert object with correct paths
            cert.path = certPath;
            cert.keyPath = keyPath;
            
            // Make sure the key file actually exists after renewal
            if (!fs.existsSync(keyPath)) {
                logger.error(`Key file not found after renewal at expected path: ${keyPath}`);
            } else {
                logger.info(`Key file confirmed at path: ${keyPath}`);
            }
            
            return {
                success: true,
                message: `Certificate for ${cert.domains ? cert.domains[0] : cert.name} renewed successfully`,
                certPath: certPath,
                keyPath: keyPath
            };
        } catch (error) {
            logger.error(`Renewal failed:`, error);
            throw new Error(`Failed to renew certificate: ${error.message}`);
        }
    }

    async renewCACertificate(cert) {
        console.log(`Renewing CA certificate: ${cert.name}`);
        
        // Get CA parameters
        const config = this.configManager.getCertConfig(cert.fingerprint);
        const defaults = this.configManager.getGlobalDefaults();
        
        const caType = cert.certType === 'rootCA' ? 'rootCA' : 'intermediateCA';
        const validityDays = config.validityDays || defaults.caValidityPeriod[caType];
        
        try {
            // Extract the actual directory from cert.path
            let outputDir;
            if (cert.path) {
                // If cert.path is available, use its directory
                outputDir = path.dirname(cert.path);
            } else {
                // Otherwise create a sanitized name
                const sanitizedName = cert.name.replace(/\*/g, 'wildcard').replace(/[^a-zA-Z0-9-_.]/g, '_');
                outputDir = path.join(this.certsDir, sanitizedName);
            }
            
            // Make sure the directory exists
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            // Set up paths for key and certificate
            const keyPath = path.join(outputDir, 'private.key');
            const certPath = path.join(outputDir, 'certificate.crt');
            
            // Backup existing certificate and key if they exist
            await this.backupCertificateIfNeeded(keyPath, certPath);
            
            // Create the OpenSSL command based on CA type
            let sslCommand;
            if (caType === 'rootCA') {
                // Generate a self-signed root CA certificate
                sslCommand = `openssl req -x509 -new -nodes -sha256 -days ${validityDays} -newkey rsa:4096` +
                    ` -keyout "${keyPath}" -out "${certPath}" -subj "/CN=${cert.name}"` +
                    ` -addext "subjectAltName=DNS:${cert.name}"`;
                    
                // Add CA extensions
                sslCommand += ` -addext "basicConstraints=critical,CA:true"` +
                    ` -addext "keyUsage=critical,keyCertSign,cRLSign"`;
            } else {
                // For an intermediate CA
                const csrPath = path.join(outputDir, 'intermediate.csr');
                
                // Create a CSR first
                sslCommand = `openssl req -new -sha256 -nodes -newkey rsa:4096` +
                    ` -keyout "${keyPath}" -out "${csrPath}" -subj "/CN=${cert.name}" &&` +
                    ` openssl x509 -req -in "${csrPath}" -CA "${this.certsDir}/rootCA/certificate.crt"` +
                    ` -CAkey "${this.certsDir}/rootCA/private.key" -CAcreateserial` +
                    ` -out "${certPath}" -days ${validityDays} -sha256` +
                    ` -extfile <(echo -e "basicConstraints=critical,CA:true,pathlen:0\\nkeyUsage=critical,keyCertSign,cRLSign\\nsubjectAltName=DNS:${cert.name}")`;
            }
            
            const parts = sslCommand.split(' ');
            const command = parts[0];
            const args = parts.slice(1);
            
            console.log(`Executing CA renewal command: ${command} ${args.join(' ')}`);
            
            const result = await this.executeCommandWithOutput(command, args);
            
            return {
                success: true,
                message: `CA Certificate ${cert.name} renewed successfully`,
                output: result
            };
        } catch (error) {
            console.error(`CA renewal failed:`, error);
            throw new Error(`Failed to renew CA certificate: ${error.message}`);
        }
    }

    async createCertificate(options) {
        const { domains, certType } = options;
        
        console.log(`Creating certificate for domains: ${domains.join(', ')}`);
        
        // Get global defaults for certificate validity
        const defaults = this.configManager.getGlobalDefaults();
        
        // Determine validity period based on cert type
        let validityDays;
        switch (certType) {
            case 'rootCA':
                validityDays = defaults.caValidityPeriod.rootCA;
                break;
            case 'intermediateCA':
                validityDays = defaults.caValidityPeriod.intermediateCA;
                break;
            default:
                validityDays = defaults.caValidityPeriod.standard;
        }
        
        try {
            // Determine output directory and file paths based on certificate type
            const commonName = domains[0];
            const sanitizedName = commonName.replace(/\*/g, 'wildcard').replace(/[^a-zA-Z0-9-_.]/g, '_');
            const outputDir = path.join(this.certsDir, sanitizedName);
            
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            const keyPath = path.join(outputDir, 'private.key');
            const certPath = path.join(outputDir, 'certificate.crt');
            
            // Backup existing certificate and key if they exist
            await this.backupCertificateIfNeeded(keyPath, certPath);
            
            // Build certificate creation command based on type
            let command, args;
            
            if (certType === 'rootCA' || certType === 'intermediateCA') {
                // For CA certificates, we use OpenSSL directly
                const sslCommand = this.buildOpenSSLCACommand(options, validityDays);
                // Split the command into executable and arguments
                const parts = sslCommand.split(' ');
                command = parts[0];
                args = parts.slice(1);
            } else {
                // For regular certs, we use OpenSSL directly
                const sslCommand = this.buildOpenSSLCommand(options, validityDays);
                // Split the command into executable and arguments
                const parts = sslCommand.split(' ');
                command = parts[0];
                args = parts.slice(1);
            }
            
            console.log(`Executing command: ${command} ${args.join(' ')}`);
            
            // Execute the command
            const result = await this.executeCommandWithOutput(command, args);
            
            return {
                command: `${command} ${args.join(' ')}`,
                status: 'Certificate created successfully',
                output: result,
                validityDays
            };
        } catch (error) {
            console.error('Certificate creation failed:', error);
            throw new Error(`Failed to create certificate: ${error.message}`);
        }
    }

    buildOpenSSLCACommand(options, validityDays) {
        const { domains, certType } = options;
        const commonName = domains[0];
        
        // Create a sanitized directory name from the common name
        const sanitizedName = commonName.replace(/\*/g, 'wildcard').replace(/[^a-zA-Z0-9-_.]/g, '_');
        
        // Create output directory for the certificate if it doesn't exist
        const outputDir = path.join(this.certsDir, sanitizedName);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Ensure these are files, not directories
        const keyPath = path.join(outputDir, 'private.key');
        const certPath = path.join(outputDir, 'certificate.crt');
        
        if (certType === 'rootCA') {
            // Generate a self-signed root CA certificate
            return `openssl req -x509 -new -nodes -sha256 -days ${validityDays} -newkey rsa:4096 -keyout "${keyPath}" -out "${certPath}" -subj "/CN=${commonName}" -addext "subjectAltName=DNS:${commonName}"`;
        } else if (certType === 'intermediateCA') {
            // For an intermediate CA, we need a bit more setup
            // This is a simplified version; in reality, you'd need to:
            // 1. Generate a CSR
            // 2. Have the root CA sign it
            
            // Create a CSR first
            const csrPath = path.join(outputDir, 'intermediate.csr');
            const command = `openssl req -new -sha256 -nodes -newkey rsa:4096 -keyout "${keyPath}" -out "${csrPath}" -subj "/CN=${commonName}" && `;
            
            // Then sign it with a root CA (this is where you'd need to specify the root CA details)
            // Assuming the first root CA found in the certs directory
            const rootCerts = fs.readdirSync(this.certsDir).filter(dir => {
                const caPath = path.join(this.certsDir, dir, 'certificate.crt');
                if (fs.existsSync(caPath)) {
                    try {
                        const certData = execSync(`openssl x509 -in "${caPath}" -text -noout`).toString();
                        return certData.includes('CA:TRUE') && !certData.match(/Issuer:.*?CN\s*=\s*([^,\n]+)/)[1].includes(dir);
                    } catch (e) {
                        return false;
                    }
                }
                return false;
            });
            
            if (rootCerts.length === 0) {
                throw new Error('No root CA found to sign the intermediate certificate');
            }
            
            const rootCAPath = path.join(this.certsDir, rootCerts[0], 'certificate.crt');
            const rootKeyPath = path.join(this.certsDir, rootCerts[0], 'private.key');
            
            return `${command} openssl x509 -req -in "${csrPath}" -CA "${rootCAPath}" -CAkey "${rootKeyPath}" -CAcreateserial -out "${certPath}" -days ${validityDays} -sha256 -extfile <(echo -e "basicConstraints=critical,CA:true,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign")`;
        }
        
        throw new Error(`Unsupported certificate type: ${certType}`);
    }

    buildOpenSSLCommand(options, validityDays) {
        const { domains } = options;
        const commonName = domains[0];
        
        // Create a sanitized directory name from the common name
        const sanitizedName = commonName.replace(/\*/g, 'wildcard').replace(/[^a-zA-Z0-9-_.]/g, '_');
        
        // Create output directory for the certificate if it doesn't exist
        const outputDir = path.join(this.certsDir, sanitizedName);
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        // Ensure these are files, not directories
        const keyPath = path.join(outputDir, 'private.key');
        const certPath = path.join(outputDir, 'certificate.crt');
        
        // Generate standard self-signed certificate with SAN
        return `openssl req -new -x509 -nodes -sha256 -days ${validityDays} -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -subj "/CN=${commonName}" -addext "subjectAltName=DNS:${domains.join(',DNS:')}"`;
    }

    executeCommandWithOutput(command, args = []) {
        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            
            logger.debug(`Executing: ${command} ${args.join(' ')}`);
            
            const childProcess = spawn(command, args, {
                shell: true, // Use shell to handle complex commands
                stdio: ['inherit', 'pipe', 'pipe']
            });
            
            childProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                logger.debug(`Command stdout: ${output.trim()}`); // Output to logger for debugging
            });
            
            childProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                logger.warn(`Command stderr: ${output.trim()}`); // Output to logger for debugging
            });
            
            childProcess.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        stdout,
                        stderr,
                        code
                    });
                } else {
                    reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
                }
            });
            
            childProcess.on('error', (error) => {
                reject(new Error(`Failed to execute command: ${error.message}`));
            });
        });
    }

    async runDeployActions(cert, deployActions) {
        if (!deployActions || !Array.isArray(deployActions) || deployActions.length === 0) {
            logger.info('No deployment actions to run');
            return { success: true, message: 'No deployment actions configured' };
        }
        
        logger.info(`Running ${deployActions.length} deployment actions for ${cert.name}`, { deployActions });
        
        const results = [];
        
        // Process each deployment action
        for (const action of deployActions) {
            try {
                logger.info(`Processing action of type: ${action.type}`, action);
                
                switch (action.type) {
                    case 'copy':
                        // Code handling destination path checks...

                        // Copy the certificate file
                        if (cert.path && fs.existsSync(cert.path)) {
                            logger.info(`Copying certificate from ${cert.path} to ${finalDestPath}`);
                            fs.copyFileSync(cert.path, finalDestPath);
                        } else {
                            logger.error('Certificate path not found or invalid', { certPath: cert.path });
                            results.push({ 
                                type: 'copy', 
                                success: false, 
                                error: 'Certificate path not found' 
                            });
                            continue;
                        }
                        
                        // Enhanced key file detection and copying
                        let keyPathToUse = cert.keyPath;
                        let keyFileFound = false;
                        
                        // Try various common locations if cert.keyPath is missing or invalid
                        if (!keyPathToUse || !fs.existsSync(keyPathToUse)) {
                            logger.warn(`Primary key path not valid: ${keyPathToUse}, trying alternatives`);
                            
                            // Try 1: Look for private.key in the same directory
                            const certDir = path.dirname(cert.path);
                            const privateKeyPath = path.join(certDir, 'private.key');
                            if (fs.existsSync(privateKeyPath)) {
                                logger.info(`Found key file at: ${privateKeyPath}`);
                                keyPathToUse = privateKeyPath;
                                keyFileFound = true;
                            }
                            
                            // Try 2: Look for matching .key file
                            if (!keyFileFound) {
                                const matchingKeyPath = cert.path.replace(/\.(crt|pem|cert)$/, '.key');
                                if (fs.existsSync(matchingKeyPath)) {
                                    logger.info(`Found matching key file at: ${matchingKeyPath}`);
                                    keyPathToUse = matchingKeyPath;
                                    keyFileFound = true;
                                }
                            }
                            
                            // Try 3: Look for any .key file in the directory
                            if (!keyFileFound) {
                                try {
                                    const certDir = path.dirname(cert.path);
                                    const files = fs.readdirSync(certDir);
                                    const keyFiles = files.filter(f => f.endsWith('.key'));
                                    
                                    if (keyFiles.length > 0) {
                                        keyPathToUse = path.join(certDir, keyFiles[0]);
                                        logger.info(`Found key file in directory: ${keyPathToUse}`);
                                        keyFileFound = true;
                                    }
                                } catch (e) {
                                    logger.error('Error while searching for key files:', e);
                                }
                            }
                        } else {
                            keyFileFound = true;
                        }
                        
                        // Copy the key file if found
                        if (keyFileFound && keyPathToUse) {
                            const keyFileName = path.basename(keyPathToUse);
                            let keyDestination;
                            
                            if (isDirectory) {
                                // If original destination was directory, put key file there too
                                keyDestination = path.join(action.destination, keyFileName);
                            } else {
                                // Otherwise, derive key filename from cert filename
                                keyDestination = finalDestPath.replace(/\.(crt|pem|cert)$/, '.key');
                            }
                            
                            try {
                                logger.info(`Copying key from ${keyPathToUse} to ${keyDestination}`);
                                fs.copyFileSync(keyPathToUse, keyDestination);
                            } catch (keyError) {
                                logger.error(`Failed to copy key file:`, keyError);
                                results.push({
                                    type: 'copy-key',
                                    success: false,
                                    error: keyError.message
                                });
                            }
                        } else {
                            logger.error('Key path not found after exhaustive search. Certificate was copied, but key was not.', { 
                                certPath: cert.path,
                                attemptedKeyPath: cert.keyPath
                            });
                        }
                        break;
                        
                    case 'docker-restart':
                        if (!action.containerId) {
                            logger.error('Docker restart action missing container ID', action);
                            results.push({ 
                                type: 'docker-restart', 
                                success: false, 
                                error: 'Missing container ID' 
                            });
                            continue;
                        }
                        
                        logger.info(`Restarting Docker container: ${action.containerId}`);
                        await this.restartContainer(action.containerId);
                        logger.info('Docker restart action completed');
                        results.push({ type: 'docker-restart', success: true });
                        break;
                        
                    case 'command':
                        if (!action.command) {
                            logger.error('Command action missing command string', action);
                            results.push({ 
                                type: 'command', 
                                success: false, 
                                error: 'Missing command' 
                            });
                            continue;
                        }
                        
                        logger.info(`Executing command: ${action.command}`);
                        const output = await this.executeCommand(action.command);
                        logger.info('Command action completed', { output });
                        results.push({ type: 'command', success: true, output });
                        break;
                        
                    default:
                        logger.error(`Unknown action type: ${action.type}`, action);
                        results.push({ 
                            type: action.type, 
                            success: false, 
                            error: 'Unknown action type' 
                        });
                }
            } catch (error) {
                logger.error(`Error executing deployment action (${action.type}):`, error);
                results.push({ 
                    type: action.type || 'unknown', 
                    success: false, 
                    error: error.message 
                });
                // Continue with next action rather than aborting
            }
        }
        
        const allSuccess = results.every(r => r.success);
        logger.info(`All deployment actions completed. Success: ${allSuccess}`, { results });
        
        return { 
            success: allSuccess, 
            results 
        };
    }

    async restartContainer(containerId) {
        try {
            // Use local Docker socket to restart the container
            const Docker = require('dockerode');
            const docker = new Docker({ socketPath: '/var/run/docker.sock' });
            
            logger.info(`Getting Docker container ${containerId}`);
            const container = docker.getContainer(containerId);
            
            logger.info(`Sending restart command to container ${containerId}`);
            await container.restart();
            logger.info(`Container ${containerId} restarted successfully`);
            return true;
        } catch (error) {
            logger.error(`Error restarting Docker container ${containerId}:`, error);
            throw error;
        }
    }

    async executeCommand(command) {
        try {
            const { exec } = require('child_process');
            
            return new Promise((resolve, reject) => {
                logger.info(`Executing command: ${command}`);
                
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        logger.error(`Command execution error: ${error.message}`, { stderr });
                        reject(error);
                        return;
                    }
                    
                    if (stderr) {
                        logger.warn(`Command produced stderr output:`, { stderr });
                    }
                    
                    logger.info(`Command executed successfully`, { stdout });
                    resolve(stdout);
                });
            });
        } catch (error) {
            logger.error(`Error executing command '${command}':`, error);
            throw error;
        }
    }

    async addDomainToCertificate(cert, domain) {
        try {
            console.log(`Adding domain ${domain} to certificate ${cert.name}`);
            
            // Check if domain already exists
            if (cert.domains && cert.domains.includes(domain)) {
                return { success: false, message: 'Domain already exists on this certificate' };
            }
            
            // Get current config or create new one
            const config = this.configManager.getCertConfig(cert.fingerprint) || {};
            
            // Get current domains or initialize empty array
            const domains = Array.isArray(config.domains) ? [...config.domains] : [];
            
            // Add the new domain if it doesn't already exist
            if (!domains.includes(domain)) {
                domains.push(domain);
            }
            
            // Update the config with new domains
            const updatedConfig = {
                ...config,
                domains: domains
            };
            
            // Save updated config
            this.configManager.setCertConfig(cert.fingerprint, updatedConfig);
            
            console.log(`Domain ${domain} added to certificate ${cert.name}. Config updated:`, updatedConfig);
            
            // In a production system, we might regenerate the certificate here
            // or mark it for regeneration on next renewal
            
            return { 
                success: true, 
                message: `Domain ${domain} added successfully`,
                domains: domains
            };
        } catch (error) {
            console.error(`Error adding domain ${domain} to certificate:`, error);
            throw new Error(`Failed to add domain: ${error.message}`);
        }
    }

    async removeDomainFromCertificate(cert, domainToRemove) {
        try {
            console.log(`Removing domain ${domainToRemove} from certificate ${cert.name}`);
            
            // Get current config
            const config = this.configManager.getCertConfig(cert.fingerprint) || {};
            
            // Check if domains exist in config
            if (!config.domains || !Array.isArray(config.domains)) {
                return { 
                    success: false, 
                    message: `No domains found in certificate configuration` 
                };
            }
            
            // Check if domain exists
            if (!config.domains.includes(domainToRemove)) {
                return { 
                    success: false, 
                    message: `Domain "${domainToRemove}" does not exist on this certificate` 
                };
            }
            
            // Remove domain from array
            const updatedDomains = config.domains.filter(domain => domain !== domainToRemove);
            
            // Update config
            const updatedConfig = {
                ...config,
                domains: updatedDomains
            };
            
            // Save updated config
            this.configManager.setCertConfig(cert.fingerprint, updatedConfig);
            
            console.log(`Domain "${domainToRemove}" removed from certificate config.`, updatedConfig);
            
            // In a production system, we might regenerate the certificate here
            // or mark it for regeneration on next renewal
            
            return { 
                success: true, 
                message: `Domain "${domainToRemove}" removed successfully`,
                domains: updatedDomains
            };
        } catch (error) {
            console.error(`Failed to remove domain from certificate:`, error);
            throw new Error(`Failed to remove domain: ${error.message}`);
        }
    }

    // Add this helper method to handle backups
    async backupCertificateIfNeeded(keyPath, certPath) {
        // Check global backup settings
        const defaults = this.configManager.getGlobalDefaults();
        
        // Check if backups are enabled
        if (!defaults.enableCertificateBackups) {
            console.log('Certificate backups are disabled in global settings. Skipping backup.');
            return;
        }
        
        // Create backup filenames with date stamp
        const timestamp = new Date().toISOString().replace(/[:\.]/g, '-').replace('T', '_').slice(0, 19);
        
        // Check if files exist before attempting to back them up
        if (fs.existsSync(certPath)) {
            const backupCertPath = `${certPath}.${timestamp}.bak`;
            fs.copyFileSync(certPath, backupCertPath);
            console.log(`Backed up certificate to ${backupCertPath}`);
        }
        
        if (fs.existsSync(keyPath)) {
            const backupKeyPath = `${keyPath}.${timestamp}.bak`;
            fs.copyFileSync(keyPath, backupKeyPath);
            console.log(`Backed up private key to ${backupKeyPath}`);
        }
        
        // We don't rename the original files - they will be overwritten by the renewal process
        // This ensures the certificate keeps the same filename after renewal
    }

    async updateDomainsEndpoint(cert, updatedDomains, renew, deployActions) {
        if (renew) {
            logger.info(`Renewing certificate with updated domains`, { certName: cert.name });
            
            // Update the cert object for renewal with correct paths
            const certToRenew = {
                ...cert,
                domains: updatedDomains
            };
            
            // Save original fingerprint and paths for reference
            const originalFingerprint = cert.fingerprint;
            const originalCertPath = cert.path;
            const originalKeyPath = cert.keyPath;
            
            // Perform the renewal with the new domain list
            const renewalResult = await this.renewCertificate(certToRenew);
            
            // Log the paths returned by the renewal process
            logger.info('Certificate renewal completed', {
                certPath: renewalResult.certPath,
                keyPath: renewalResult.keyPath
            });
            
            // After renewal, get the updated certificate data to find the new fingerprint
            const updatedCertData = await parseCertificates(this.certsDir);
            
            // Look for the updated certificate using multiple methods
            let updatedCert = null;
            
            // Method 1: Try to find by path - most reliable if path hasn't changed
            if (renewalResult.certPath) {
                updatedCert = updatedCertData.certificates.find(c => 
                    c.path === renewalResult.certPath
                );
                
                if (updatedCert) {
                    logger.info('Found renewed certificate by path match');
                }
            }
            
            // Method 2: If not found by path, try by name and different fingerprint
            if (!updatedCert) {
                updatedCert = updatedCertData.certificates.find(c => 
                    c.name === cert.name && c.fingerprint !== originalFingerprint
                );
                
                if (updatedCert) {
                    logger.info('Found renewed certificate by name and different fingerprint');
                }
            }
            
            // If we found the renewed certificate, ensure it has the correct key path
            if (updatedCert) {
                // If the updated cert doesn't have a key path but we know where it should be, update it
                if ((!updatedCert.keyPath || !fs.existsSync(updatedCert.keyPath)) && 
                    renewalResult.keyPath && fs.existsSync(renewalResult.keyPath)) {
                    
                    updatedCert.keyPath = renewalResult.keyPath;
                    logger.info(`Updated certificate key path to: ${updatedCert.keyPath}`);
                }
                
                logger.info(`Certificate renewed with new fingerprint: ${updatedCert.fingerprint}`);
                
                // Transfer configuration to the new fingerprint
                this.configManager.setCertConfig(updatedCert.fingerprint, updatedConfig);
                logger.info('Transferred config to new certificate fingerprint');
                
                result.newFingerprint = updatedCert.fingerprint;
                
                // Run deployment actions with the updated certificate that has correct paths
                if (deployActions && deployActions.length > 0) {
                    logger.info(`Running ${deployActions.length} deployment actions for renewed certificate`, {
                        certificatePath: updatedCert.path,
                        keyPath: updatedCert.keyPath,
                        deployActions: deployActions
                    });
                    
                    try {
                        const deployResult = await this.runDeployActions(updatedCert, deployActions);
                        logger.info('Deployment actions completed', { deployResult });
                    } catch (deployError) {
                        logger.error('Error running deployment actions', deployError);
                    }
                }
            }
        }
    }
}

module.exports = RenewalManager;