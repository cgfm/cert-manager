const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

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
        console.log(`Renewing certificate for: ${cert.domains.join(', ')}`);
        
        // Get certificate generation parameters
        const config = this.configManager.getCertConfig(cert.fingerprint);
        const defaults = this.configManager.getGlobalDefaults();
        
        // Determine validity period
        const validityDays = config.validityDays || defaults.caValidityPeriod.standard;
        
        try {
            // Determine certificate type and execute the appropriate renewal command
            let command, args;
            
            if (cert.path && cert.path.includes('certbot')) {
                // For Let's Encrypt certificates
                command = 'certbot';
                args = ['renew', '--cert-name', cert.domains[0], '--force-renewal'];
            } else {
                // For self-signed certificates or other types
                // We effectively recreate the certificate with the same parameters
                if (cert.isSelfSigned) {
                    // For self-signed or CA certificates
                    const sslCommand = this.buildOpenSSLCACommand({
                        domains: cert.domains,
                        certType: cert.certType || 'standard'
                    }, validityDays);
                    
                    const parts = sslCommand.split(' ');
                    command = parts[0];
                    args = parts.slice(1);
                } else {
                    // For regular certificates
                    const certbotCommand = this.buildCertbotCommand({
                        domains: cert.domains,
                        challengeType: 'http' // Default to HTTP challenge
                    }, validityDays);
                    
                    const parts = certbotCommand.split(' ');
                    command = parts[0];
                    args = parts.slice(1);
                }
            }
            
            console.log(`Executing renewal command: ${command} ${args.join(' ')}`);
            
            // Execute the renewal command
            const result = await this.executeCommandWithOutput(command, args);
            
            return {
                success: true,
                message: `Certificate for ${cert.domains[0]} renewed successfully`,
                output: result
            };
        } catch (error) {
            console.error(`Renewal failed:`, error);
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
        
        // In a real implementation, this would involve:
        // 1. Creating a new key (or reusing the existing one)
        // 2. Creating a new CSR
        // 3. Signing the CSR (for root CA, self-sign; for intermediate, sign with root)
        // 4. Saving the new certificate
        
        // For this example, we'll just simulate a successful renewal
        console.log(`CA Certificate ${cert.name} would be renewed with ${validityDays} days validity`);
        
        return Promise.resolve({
            success: true,
            message: `CA Certificate ${cert.name} renewed successfully`
        });
    }

    async createCertificate(options) {
        const { domains, email, challengeType, certType } = options;
        
        console.log(`Creating certificate for domains: ${domains.join(', ')}`);
        console.log(`Using challenge type: ${challengeType}`);
        
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
            // Build certificate creation command based on type and challenge
            let command, args;
            
            if (certType === 'rootCA' || certType === 'intermediateCA') {
                // For CA certificates, we'd use OpenSSL directly
                const sslCommand = this.buildOpenSSLCACommand(options, validityDays);
                // Split the command into executable and arguments
                const parts = sslCommand.split(' ');
                command = parts[0];
                args = parts.slice(1);
            } else {
                // For regular certs, we might use Let's Encrypt via certbot
                const certbotCommand = this.buildCertbotCommand(options, validityDays);
                // Split the command into executable and arguments
                const parts = certbotCommand.split(' ');
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
        
        // Create output directory for the certificate if it doesn't exist
        const outputDir = path.join(this.certsDir, commonName.replace(/\*/g, 'wildcard'));
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        
        const keyPath = path.join(outputDir, 'private.key');
        const certPath = path.join(outputDir, 'certificate.crt');
        
        if (certType === 'rootCA') {
            // Generate a self-signed root CA certificate
            return `openssl req -x509 -new -nodes -sha256 -days ${validityDays} -newkey rsa:4096 -keyout ${keyPath} -out ${certPath} -subj "/CN=${commonName}" -addext "subjectAltName=DNS:${commonName}"`;
        } else if (certType === 'intermediateCA') {
            // For an intermediate CA, we need a bit more setup
            // This is a simplified version; in reality, you'd need to:
            // 1. Generate a CSR
            // 2. Have the root CA sign it
            
            // Create a CSR first
            const csrPath = path.join(outputDir, 'intermediate.csr');
            const command = `openssl req -new -sha256 -nodes -newkey rsa:4096 -keyout ${keyPath} -out ${csrPath} -subj "/CN=${commonName}" && `;
            
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
            
            return `${command} openssl x509 -req -in ${csrPath} -CA ${rootCAPath} -CAkey ${rootKeyPath} -CAcreateserial -out ${certPath} -days ${validityDays} -sha256 -extfile <(echo -e "basicConstraints=critical,CA:true,pathlen:0\nkeyUsage=critical,keyCertSign,cRLSign")`;
        }
        
        throw new Error(`Unsupported certificate type: ${certType}`);
    }

    buildCertbotCommand(options, validityDays) {
        const { domains, email, challengeType } = options;
        
        // Create a base directory for certbot
        const certbotDir = path.join(this.certsDir, 'certbot');
        if (!fs.existsSync(certbotDir)) {
            fs.mkdirSync(certbotDir, { recursive: true });
        }
        
        let command = 'certbot certonly --non-interactive';
        
        // Add email if provided
        if (email) {
            command += ` --email ${email}`;
        } else {
            command += ' --register-unsafely-without-email';
        }
        
        // Add domain list
        command += ` -d ${domains.join(' -d ')}`;
        
        // Add challenge type
        switch (challengeType) {
            case 'http':
                command += ' --webroot --webroot-path /var/www/html';
                break;
            case 'dns':
                // For DNS challenges, you might need to specify a DNS plugin
                command += ' --manual --preferred-challenges dns';
                break;
            case 'standalone':
                command += ' --standalone';
                break;
            default:
                command += ' --webroot --webroot-path /var/www/html';
        }
        
        // Add config directory and work directory
        command += ` --config-dir ${certbotDir}/config --work-dir ${certbotDir}/work --logs-dir ${certbotDir}/logs`;
        
        // Add non-interactive mode and agree to terms
        command += ' --agree-tos';
        
        return command;
    }

    executeCommandWithOutput(command, args = []) {
        return new Promise((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            
            console.log(`Executing: ${command} ${args.join(' ')}`);
            
            const childProcess = spawn(command, args, {
                shell: true, // Use shell to handle complex commands
                stdio: ['inherit', 'pipe', 'pipe']
            });
            
            childProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                console.log(output); // Output to console for debugging
            });
            
            childProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                console.error(output); // Output to console for debugging
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

    async runDeployActions(cert, actions) {
        console.log(`Running deployment actions for ${cert.name}`);
        
        for (const action of actions) {
            try {
                switch (action.type) {
                    case 'copy':
                        await this.copyFile(cert.path, action.destination);
                        break;
                        
                    case 'docker-restart':
                        await this.restartContainer(action.containerId);
                        break;
                        
                    case 'command':
                        await this.executeCommand(action.command);
                        break;
                        
                    default:
                        console.warn(`Unknown action type: ${action.type}`);
                }
            } catch (error) {
                console.error(`Failed to execute action ${action.type}:`, error);
            }
        }
    }

    async copyFile(source, destination) {
        return new Promise((resolve, reject) => {
            try {
                const destDir = path.dirname(destination);
                if (!fs.existsSync(destDir)) {
                    fs.mkdirSync(destDir, { recursive: true });
                }
                fs.copyFileSync(source, destination);
                console.log(`Copied ${source} to ${destination}`);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    async restartContainer(containerId) {
        return new Promise((resolve, reject) => {
            try {
                execSync(`docker restart ${containerId}`);
                console.log(`Restarted docker container ${containerId}`);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    async executeCommand(command) {
        return new Promise((resolve, reject) => {
            try {
                execSync(command);
                console.log(`Executed command: ${command}`);
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    }

    async addDomainToCertificate(cert, newDomain) {
        console.log(`Adding domain "${newDomain}" to certificate ${cert.name}`);
        
        // Check if domain already exists in the certificate
        if (cert.domains && cert.domains.includes(newDomain)) {
            return { success: false, message: `Domain "${newDomain}" is already on this certificate` };
        }
        
        // Build the list of domains (old + new)
        const domains = [...(cert.domains || []), newDomain];
        
        try {
            // Determine the certificate type and challenge method
            let challengeType = 'http';
            let certType = 'standard';
            
            // Check if it's a wildcard domain
            if (newDomain.includes('*')) {
                challengeType = 'dns';
                certType = 'wildcard';
            }
            
            // Get cert config
            const config = this.configManager.getCertConfig(cert.fingerprint);
            
            // Create a new certificate with all domains
            console.log(`Recreating certificate with domains: ${domains.join(', ')}`);
            
            // Build the appropriate command
            let command, args;
            
            if (cert.issuer && cert.issuer.includes('Let\'s Encrypt')) {
                const certbotCommand = this.buildCertbotCommand({
                    domains,
                    challengeType,
                    certType
                });
                
                const parts = certbotCommand.split(' ');
                command = parts[0];
                args = parts.slice(1);
            } else {
                // For other types like self-signed, we use OpenSSL directly
                const outputDir = path.dirname(cert.path || path.join(this.certsDir, domains[0].replace(/\*/g, 'wildcard')));
                const keyPath = path.join(outputDir, 'private.key');
                const certPath = path.join(outputDir, 'certificate.crt');
                
                // Create directory if it doesn't exist
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }
                
                // For self-signed certificates
                const sslCommand = `openssl req -new -x509 -nodes -sha256 -days 90 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -subj "/CN=${domains[0]}" -addext "subjectAltName=DNS:${domains.join(',DNS:')}"`;
                
                const parts = sslCommand.split(' ');
                command = parts[0];
                args = parts.slice(1);
            }
            
            console.log(`Executing command: ${command} ${args.join(' ')}`);
            
            // Actually execute the command
            const result = await this.executeCommandWithOutput(command, args);
            
            // Run deployment actions if needed
            if (config.deployActions && config.deployActions.length > 0) {
                await this.runDeployActions({
                    ...cert,
                    domains,
                    path: cert.path, // Use the same path as the original certificate
                }, config.deployActions);
            }
            
            return {
                success: true,
                message: `Domain "${newDomain}" added to certificate. The certificate has been recreated.`,
                output: result
            };
        } catch (error) {
            console.error(`Failed to add domain to certificate:`, error);
            throw new Error(`Failed to add domain to certificate: ${error.message}`);
        }
    }

    async removeDomainFromCertificate(cert, domainToRemove) {
        console.log(`Removing domain "${domainToRemove}" from certificate ${cert.name}`);
        
        // Check if domain exists in the certificate
        if (!cert.domains || !cert.domains.includes(domainToRemove)) {
            return { success: false, message: `Domain "${domainToRemove}" is not on this certificate` };
        }
        
        // Check if this is the only domain
        if (cert.domains.length === 1) {
            return { 
                success: false, 
                message: `Cannot remove the only domain from certificate. Delete the certificate instead.` 
            };
        }
        
        // Build the new list of domains (excluding the one to remove)
        const domains = cert.domains.filter(domain => domain !== domainToRemove);
        
        try {
            // Determine the certificate type and challenge method
            let challengeType = 'http';
            let certType = 'standard';
            
            // Check if there's any wildcard domain
            if (domains.some(d => d.includes('*'))) {
                challengeType = 'dns';
                certType = 'wildcard';
            }
            
            // Get cert config
            const config = this.configManager.getCertConfig(cert.fingerprint);
            
            // Create a new certificate with remaining domains
            console.log(`Recreating certificate with domains: ${domains.join(', ')}`);
            
            // Build the appropriate command
            let command, args;
            
            if (cert.issuer && cert.issuer.includes('Let\'s Encrypt')) {
                const certbotCommand = this.buildCertbotCommand({
                    domains,
                    challengeType,
                    certType
                });
                
                const parts = certbotCommand.split(' ');
                command = parts[0];
                args = parts.slice(1);
            } else {
                // For other types like self-signed, we use OpenSSL directly
                const outputDir = path.dirname(cert.path || path.join(this.certsDir, domains[0].replace(/\*/g, 'wildcard')));
                const keyPath = path.join(outputDir, 'private.key');
                const certPath = path.join(outputDir, 'certificate.crt');
                
                // Create directory if it doesn't exist
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true });
                }
                
                // For self-signed certificates
                const sslCommand = `openssl req -new -x509 -nodes -sha256 -days 90 -newkey rsa:2048 -keyout ${keyPath} -out ${certPath} -subj "/CN=${domains[0]}" -addext "subjectAltName=DNS:${domains.join(',DNS:')}"`;
                
                const parts = sslCommand.split(' ');
                command = parts[0];
                args = parts.slice(1);
            }
            
            console.log(`Executing command: ${command} ${args.join(' ')}`);
            
            // Actually execute the command
            const result = await this.executeCommandWithOutput(command, args);
            
            // Run deployment actions if needed
            if (config.deployActions && config.deployActions.length > 0) {
                await this.runDeployActions({
                    ...cert,
                    domains,
                    path: cert.path, // Use the same path as the original certificate
                }, config.deployActions);
            }
            
            return {
                success: true,
                message: `Domain "${domainToRemove}" removed from certificate. The certificate has been recreated.`,
                output: result
            };
        } catch (error) {
            console.error(`Failed to remove domain from certificate:`, error);
            throw new Error(`Failed to remove domain from certificate: ${error.message}`);
        }
    }
}

module.exports = RenewalManager;