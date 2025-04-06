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
            // Extract the actual directory and filenames from cert.path
            let outputDir, keyFilename, certFilename;
            if (cert.path) {
                // If cert.path is available, use its directory and extract the filename
                outputDir = path.dirname(cert.path);
                certFilename = path.basename(cert.path);
                
                // Try to guess the key filename based on common patterns
                if (cert.keyPath) {
                    keyFilename = path.basename(cert.keyPath);
                } else if (fs.existsSync(path.join(outputDir, 'private.key'))) {
                    keyFilename = 'private.key';
                } else if (fs.existsSync(path.join(outputDir, certFilename.replace('.crt', '.key')))) {
                    keyFilename = certFilename.replace('.crt', '.key');
                } else {
                    // Default fallback
                    keyFilename = 'private.key';
                }
            } else {
                // Otherwise create a sanitized name
                const sanitizedName = cert.domains[0].replace(/\*/g, 'wildcard').replace(/[^a-zA-Z0-9-_.]/g, '_');
                outputDir = path.join(this.certsDir, sanitizedName);
                certFilename = 'certificate.crt';
                keyFilename = 'private.key';
            }
            
            // Make sure the directory exists
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            // Set up paths for key and certificate
            const keyPath = path.join(outputDir, keyFilename);
            const certPath = path.join(outputDir, certFilename);
            
            // Backup existing certificate and key if they exist
            await this.backupCertificateIfNeeded(keyPath, certPath);
            
            // Check if the certificate is signed by a CA
            let isSignedByCA = false;
            let signingCAPath = null;
            let signingCAKeyPath = null;
            
            if (cert.path && fs.existsSync(cert.path)) {
                try {
                    // Get certificate issuer information
                    const certData = execSync(`openssl x509 -in "${cert.path}" -issuer -noout`).toString();
                    const issuerMatch = certData.match(/issuer=.*?CN\s*=\s*([^,\n]+)/);
                    
                    if (issuerMatch && issuerMatch[1] !== cert.domains[0]) {
                        // Certificate is signed by a different entity (likely a CA)
                        isSignedByCA = true;
                        
                        // Try to find the CA certificate in our certs directory
                        const caName = issuerMatch[1].trim();
                        const caDir = path.join(this.certsDir, caName.replace(/[^a-zA-Z0-9-_.]/g, '_'));
                        
                        if (fs.existsSync(path.join(caDir, 'certificate.crt'))) {
                            signingCAPath = path.join(caDir, 'certificate.crt');
                            signingCAKeyPath = path.join(caDir, 'private.key');
                            console.log(`Found signing CA certificate at ${signingCAPath}`);
                        } else {
                            // Look for any CA that matches the issuer name
                            const caDirs = fs.readdirSync(this.certsDir);
                            for (const dir of caDirs) {
                                const certPath = path.join(this.certsDir, dir, 'certificate.crt');
                                if (fs.existsSync(certPath)) {
                                    try {
                                        const caData = execSync(`openssl x509 -in "${certPath}" -subject -noout`).toString();
                                        const caSubject = caData.match(/subject=.*?CN\s*=\s*([^,\n]+)/);
                                        
                                        if (caSubject && caSubject[1].trim() === caName) {
                                            signingCAPath = certPath;
                                            signingCAKeyPath = path.join(this.certsDir, dir, 'private.key');
                                            console.log(`Found signing CA certificate at ${signingCAPath}`);
                                            break;
                                        }
                                    } catch (e) {
                                        // Skip this certificate if we can't read it
                                        continue;
                                    }
                                }
                            }
                        }
                        
                        if (!signingCAPath) {
                            console.warn(`Warning: Certificate is signed by CA "${caName}" but couldn't find the CA certificate. Will create self-signed certificate instead.`);
                            isSignedByCA = false;
                        } else if (!fs.existsSync(signingCAKeyPath)) {
                            console.warn(`Warning: Found CA certificate at ${signingCAPath} but couldn't find the CA private key. Will create self-signed certificate instead.`);
                            isSignedByCA = false;
                        }
                    }
                } catch (e) {
                    console.warn(`Warning: Failed to check certificate issuer: ${e.message}`);
                    // Assume not signed by a CA if we can't determine
                    isSignedByCA = false;
                }
            }
            
            // Build the SAN extension for domains and IPs
            let sanExtension = '';
            
            // Add domains to SAN
            if (cert.domains && cert.domains.length > 0) {
                sanExtension += cert.domains.map(domain => `DNS:${domain}`).join(',');
            }
            
            // Add IPs to SAN if available
            if (cert.ips && cert.ips.length > 0) {
                if (sanExtension) sanExtension += ',';
                sanExtension += cert.ips.map(ip => `IP:${ip}`).join(',');
            }
            
            let result;
            if (isSignedByCA && signingCAPath && signingCAKeyPath) {
                // For certificates signed by a CA, we need to:
                // 1. Create a CSR
                // 2. Sign the CSR with the CA certificate
                console.log(`Certificate is signed by a CA. Will renew using the same CA.`);
                
                // Create a CSR path
                const csrPath = path.join(outputDir, 'renewal.csr');
                
                // Create a CSR first (with a new private key)
                const csrCommand = `OPENSSL_CONF=/dev/null openssl req -new -sha256 -nodes -newkey rsa:2048` +
                    ` -keyout "${keyPath}" -out "${csrPath}" -subj "/CN=${cert.domains[0]}"`;
                    
                // Execute the CSR command
                console.log(`Creating CSR: ${csrCommand}`);
                await this.executeCommandWithOutput(...csrCommand.split(' '));
                
                // Now sign the CSR with the CA
                const sanFile = path.join(outputDir, 'san.ext');
                fs.writeFileSync(sanFile, `subjectAltName = ${sanExtension}`);
                
                const signCommand = `OPENSSL_CONF=/dev/null openssl x509 -req -in "${csrPath}" -CA "${signingCAPath}"` +
                    ` -CAkey "${signingCAKeyPath}" -CAcreateserial -days ${validityDays} -sha256` +
                    ` -out "${certPath}" -extfile "${sanFile}"`;
                
                console.log(`Signing certificate with CA: ${signCommand}`);
                result = await this.executeCommandWithOutput(...signCommand.split(' '));
                
                // Clean up temporary files
                if (fs.existsSync(csrPath)) fs.unlinkSync(csrPath);
                if (fs.existsSync(sanFile)) fs.unlinkSync(sanFile);
            } else {
                // For self-signed certificates
                console.log(`Creating self-signed certificate`);
                
                // For all certificates (removing isSelfSigned check)
                // Add OPENSSL_CONF=/dev/null to suppress progress indicators
                const sslCommand = `OPENSSL_CONF=/dev/null openssl req -new -x509 -nodes -sha256 -days ${validityDays}` +
                    ` -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}"` +
                    ` -subj "/CN=${cert.domains[0]}"` + 
                    (sanExtension ? ` -addext "subjectAltName=${sanExtension}"` : '');
                
                const parts = sslCommand.split(' ');
                const command = parts[0];
                const args = parts.slice(1);
                
                console.log(`Executing renewal command: ${command} ${args.join(' ')}`);
                
                // Execute the renewal command
                result = await this.executeCommandWithOutput(command, args);
            }
            
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
            // Get cert config
            const config = this.configManager.getCertConfig(cert.fingerprint);
            
            // Create a new certificate with all domains
            console.log(`Recreating certificate with domains: ${domains.join(', ')}`);
            
            // Extract the actual directory from cert.path
            let outputDir;
            if (cert.path) {
                // If cert.path is available, use its directory
                outputDir = path.dirname(cert.path);
            } else {
                // Otherwise create a sanitized name
                const sanitizedName = domains[0].replace(/\*/g, 'wildcard').replace(/[^a-zA-Z0-9-_.]/g, '_');
                outputDir = path.join(this.certsDir, sanitizedName);
            }
            
            // Create directory if it doesn't exist
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            const keyPath = path.join(outputDir, 'private.key');
            const certPath = path.join(outputDir, 'certificate.crt');
            
            // Backup existing certificate and key if they exist
            await this.backupCertificateIfNeeded(keyPath, certPath);
            
            // Determine validity period
            const defaults = this.configManager.getGlobalDefaults();
            const validityDays = config.validityDays || defaults.caValidityPeriod.standard;
            
            // Generate the self-signed certificate with all domains
            const sslCommand = `openssl req -new -x509 -nodes -sha256 -days ${validityDays}` + 
                ` -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}"` +
                ` -subj "/CN=${domains[0]}" -addext "subjectAltName=DNS:${domains.join(',DNS:')}"`;
            
            const parts = sslCommand.split(' ');
            const command = parts[0];
            const args = parts.slice(1);
            
            console.log(`Executing command: ${command} ${args.join(' ')}`);
            
            // Actually execute the command
            const result = await this.executeCommandWithOutput(command, args);
            
            // Run deployment actions if needed
            if (config.deployActions && config.deployActions.length > 0) {
                await this.runDeployActions({
                    ...cert,
                    domains,
                    path: certPath, // Update the path to the new certificate
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
            // Get cert config
            const config = this.configManager.getCertConfig(cert.fingerprint);
            
            // Create a new certificate with remaining domains
            console.log(`Recreating certificate with domains: ${domains.join(', ')}`);
            
            // Extract the actual directory from cert.path
            let outputDir;
            if (cert.path) {
                // If cert.path is available, use its directory
                outputDir = path.dirname(cert.path);
            } else {
                // Otherwise create a sanitized name
                const sanitizedName = domains[0].replace(/\*/g, 'wildcard').replace(/[^a-zA-Z0-9-_.]/g, '_');
                outputDir = path.join(this.certsDir, sanitizedName);
            }
            
            // Create directory if it doesn't exist
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            
            const keyPath = path.join(outputDir, 'private.key');
            const certPath = path.join(outputDir, 'certificate.crt');
            
            // Backup existing certificate and key if they exist
            await this.backupCertificateIfNeeded(keyPath, certPath);
            
            // Determine validity period
            const defaults = this.configManager.getGlobalDefaults();
            const validityDays = config.validityDays || defaults.caValidityPeriod.standard;
            
            // Generate the self-signed certificate with remaining domains
            const sslCommand = `openssl req -new -x509 -nodes -sha256 -days ${validityDays}` +
                ` -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}"` +
                ` -subj "/CN=${domains[0]}" -addext "subjectAltName=DNS:${domains.join(',DNS:')}"`;
            
            const parts = sslCommand.split(' ');
            const command = parts[0];
            const args = parts.slice(1);
            
            console.log(`Executing command: ${command} ${args.join(' ')}`);
            
            // Actually execute the command
            const result = await this.executeCommandWithOutput(command, args);
            
            // Run deployment actions if needed
            if (config.deployActions && config.deployActions.length > 0) {
                await this.runDeployActions({
                    ...cert,
                    domains,
                    path: certPath, // Update the path to the new certificate
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
}

module.exports = RenewalManager;