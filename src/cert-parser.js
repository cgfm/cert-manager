const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const crypto = require('crypto');

function parseCertificates(certsDirectory) {
    const certificates = [];
    const certMap = new Map(); // Map to store certificates by their subject key identifier
    const caMap = new Map();   // Map to store CAs by their subject key identifier
    const processedCerts = new Set(); // Track processed certificates to avoid duplicates
    const assignedCerts = new Set(); // Track certificates that have been assigned to a parent

    try {
        if (!fs.existsSync(certsDirectory)) {
            console.error(`Directory not found: ${certsDirectory}`);
            return { certificates: [], hierarchy: [] };
        }
        
        // First pass: collect all certificates and their details
        fs.readdirSync(certsDirectory).forEach(file => {
            try {
                if (path.extname(file) === '.crt' || path.extname(file) === '.pem') {
                    const certPath = path.join(certsDirectory, file);
                    const certData = execSync(`openssl x509 -in "${certPath}" -text -noout`).toString();

                    // Calculate certificate fingerprint to use as a unique identifier
                    const fingerprint = execSync(
                        `openssl x509 -in "${certPath}" -fingerprint -sha256 -noout`
                    ).toString().replace('SHA256 Fingerprint=', '').replace(/:/g, '').trim();
                    
                    // Skip if we've already processed this certificate
                    if (processedCerts.has(fingerprint)) {
                        return;
                    }
                    
                    // Mark this certificate as processed
                    processedCerts.add(fingerprint);

                    // Extract domains
                    const domainMatches = certData.match(/(?:DNS|IP Address):([^,\n]+)/g) || [];
                    const domains = domainMatches.map(d => d.replace(/(?:DNS|IP Address):/, '').trim());

                    // Extract subject CN
                    const cnMatch = certData.match(/Subject:.*?CN\s*=\s*([^,\n]+)/);
                    const commonName = cnMatch ? cnMatch[1].trim() : '';
                    
                    if (!domains.includes(commonName) && commonName) {
                        domains.unshift(commonName);
                    }

                    // Extract expiry date
                    const expiryMatch = certData.match(/Not After\s*:\s*(.+?)(?:\n|$)/);
                    const expiryDate = expiryMatch ? new Date(expiryMatch[1].trim()) : null;
                    
                    // Extract subject
                    const subjectMatch = certData.match(/Subject:(.+?)(?:\n|$)/);
                    const subject = subjectMatch ? subjectMatch[1].trim() : '';
                    
                    // Extract issuer
                    const issuerMatch = certData.match(/Issuer:(.+?)(?:\n|$)/);
                    const issuer = issuerMatch ? issuerMatch[1].trim() : '';
                    
                    // Check if self-signed (subject equals issuer)
                    const isSelfSigned = subject === issuer;
                    
                    // Check if cert is CA
                    const isCA = certData.includes('CA:TRUE');
                    
                    // Extract Subject Key Identifier (SKI)
                    const skiMatch = certData.match(/X509v3 Subject Key Identifier:\s*\n\s*([0-9A-F:]+)/i);
                    const subjectKeyId = skiMatch ? skiMatch[1].replace(/:/g, '') : null;
                    
                    // Replace the existing AKI extraction code with this more robust version:
                    const akiMatch = certData.match(/X509v3 Authority Key Identifier:(?:[\s\S]*?keyid:([0-9a-fA-F:]+))/);
                    const authorityKeyId = akiMatch ? akiMatch[1].replace(/:/g, '').trim() : null;
                    
                    // Determine certificate type
                    let certType = 'leaf';
                    if (isCA) {
                        certType = isSelfSigned ? 'rootCA' : 'intermediateCA';
                    }
                    
                    const certificate = {
                        name: file,
                        domains,
                        expiryDate,
                        subject,
                        issuer,
                        isSelfSigned,
                        isCA,
                        certType,
                        subjectKeyId: subjectKeyId || fingerprint,
                        authorityKeyId,
                        children: [],
                        path: certPath,
                        fingerprint // Add fingerprint as a property for debugging
                    };
                    
                    certificates.push(certificate);
                    
                    // Store certificate by its subject key ID for relationship building
                    if (subjectKeyId) {
                        certMap.set(subjectKeyId, certificate);
                    }
                    
                    // Store CA certificates in the CA map
                    if (isCA) {
                        caMap.set(subjectKeyId || fingerprint, certificate);
                    }
                }
            } catch (certError) {
                console.error(`Error processing certificate ${file}:`, certError.message);
            }
        });
        
        // Second pass: build certificate hierarchy
        for (const cert of certificates) {
            // Skip root CAs since they don't have parents
            if (cert.isSelfSigned) {
                continue;
            }
            
            // Find this certificate's issuer (parent CA)
            let isAssigned = false;
            
            if (cert.authorityKeyId && caMap.has(cert.authorityKeyId)) {
                const issuerCert = caMap.get(cert.authorityKeyId);
                // Add this certificate as a child of its issuer
                issuerCert.children.push(cert);
                assignedCerts.add(cert.fingerprint || cert.subjectKeyId); // Mark as assigned
                isAssigned = true;
            } 
            
            // If not assigned by AKI, try matching by issuer name
            if (!isAssigned) {
                const possibleIssuers = certificates.filter(c => 
                    c.isCA && cert.issuer === c.subject
                );
                
                if (possibleIssuers.length > 0) {
                    // Use the first matching issuer
                    possibleIssuers[0].children.push(cert);
                    assignedCerts.add(cert.fingerprint || cert.subjectKeyId); // Mark as assigned
                    isAssigned = true;
                }
            }
        }
        
        // Build the final hierarchy (starting with root CAs)
        const hierarchy = certificates.filter(cert => cert.certType === 'rootCA');
        
        // Add ONLY orphaned intermediate CAs and leaf certificates to the hierarchy
        const orphanedCerts = certificates.filter(cert => 
            cert.certType !== 'rootCA' && 
            !assignedCerts.has(cert.fingerprint || cert.subjectKeyId)
        );
        
        // Group orphaned certificates
        if (orphanedCerts.length > 0) {
            const selfSignedGroup = {
                name: 'Self-signed and Orphaned Certificates',
                isGroup: true,
                children: orphanedCerts
            };
            hierarchy.push(selfSignedGroup);
        }
        
        return { 
            certificates, // Flat list of all certificates
            hierarchy     // Hierarchical structure
        };
    } catch (dirError) {
        console.error(`Error reading certificates directory:`, dirError.message);
        return { certificates: [], hierarchy: [] };
    }
}

module.exports = {
    parseCertificates
};