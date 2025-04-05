document.addEventListener('DOMContentLoaded', () => {
    // Add configuration button to each certificate row
    document.querySelectorAll('.cert-row').forEach(row => {
        const fingerprint = row.dataset.fingerprint;
        
        // Skip if there's no fingerprint or already has action buttons
        if (!fingerprint || row.querySelector('.cert-actions')) {
            return;
        }
        
        // Create action cell if it doesn't exist
        let actionsCell = row.querySelector('.cert-actions');
        if (!actionsCell) {
            actionsCell = document.createElement('td');
            actionsCell.className = 'cert-actions';
            row.appendChild(actionsCell);
        }
        
        // Add buttons if not already present
        if (actionsCell.querySelectorAll('button').length === 0) {
            actionsCell.innerHTML = `
                <button class="config-btn" data-fingerprint="${fingerprint}">Configure</button>
                <button class="renew-btn" data-fingerprint="${fingerprint}">Renew</button>
            `;
            
            // Add event listeners
            actionsCell.querySelector('.config-btn').addEventListener('click', () => {
                showConfigModal(fingerprint);
            });
            
            actionsCell.querySelector('.renew-btn').addEventListener('click', () => {
                renewCertificate(fingerprint);
            });
        }
    });
    
    // Add buttons to page header
    const header = document.querySelector('header');
    if (header) {
        // Create button container if it doesn't exist
        let buttonContainer = header.querySelector('.header-buttons');
        if (!buttonContainer) {
            buttonContainer = document.createElement('div');
            buttonContainer.className = 'header-buttons';
            header.appendChild(buttonContainer);
        }
        
        // Add global settings button if it doesn't exist
        if (!document.getElementById('globalSettingsBtn')) {
            const settingsBtn = document.createElement('button');
            settingsBtn.id = 'globalSettingsBtn';
            settingsBtn.textContent = 'Global Settings';
            settingsBtn.addEventListener('click', showGlobalSettingsModal);
            buttonContainer.appendChild(settingsBtn);
        }
        
        // Add create certificate button if it doesn't exist
        if (!document.getElementById('createCertBtn')) {
            const createBtn = document.createElement('button');
            createBtn.id = 'createCertBtn';
            createBtn.textContent = 'Create New Certificate';
            createBtn.addEventListener('click', showCreateCertModal);
            buttonContainer.appendChild(createBtn);
        }
    }
});

async function showConfigModal(fingerprint) {
    try {
        const response = await fetch(`/api/certificate/${fingerprint}`);
        const cert = await response.json();
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>Certificate Configuration</h2>
                <h3>${cert.name}</h3>
                

                <!-- Domain Management Section -->
                <div class="domain-management">
                    <h3>Domains & IPs</h3>
                    <div class="domains-list">
                        ${(cert.domains || []).map(domain => `
                            <div class="domain-item">
                                <span class="domain-name">${domain}</span>
                                <button class="remove-domain-btn" data-domain="${domain}">Remove</button>
                            </div>
                        `).join('')}
                    </div>
                    <div class="add-domain-form">
                        <input type="text" id="newDomain" placeholder="example.com or 192.168.1.1">
                        <button id="addDomainBtn">Add Domain/IP</button>
                    </div>
                </div>
                
                <p>Expires: ${new Date(cert.expiryDate).toLocaleDateString()}</p>
                
                <div class="config-form">
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="autoRenew" ${cert.config.autoRenew ? 'checked' : ''}>
                            Auto-renew
                        </label>
                    </div>
                    
                    <div class="form-group">
                        <label>Days before expiry to renew:</label>
                        <input type="number" id="renewDays" value="${cert.config.renewDaysBeforeExpiry || 30}" min="1" max="90">
                    </div>
                    
                    <h4>Deployment Actions</h4>
                    <div id="deployActions"></div>
                    
                    <button id="addAction">Add Action</button>
                    
                    <div class="button-group">
                        <button id="saveConfig">Save Configuration</button>
                        <button id="cancelConfig">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Setup event handlers
        modal.querySelector('.close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Setup domain removal buttons
        modal.querySelectorAll('.remove-domain-btn').forEach(btn => {
            btn.addEventListener('click', async event => {
                const domain = event.target.dataset.domain;
                if (!confirm(`Are you sure you want to remove domain "${domain}" from this certificate?`)) {
                    return;
                }
                
                try {
                    const response = await fetch(`/api/certificate/${fingerprint}/domains/remove`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ domain })
                    });
                    
                    const result = await response.json();
                    
                    if (result.success) {
                        alert(result.message);
                        document.body.removeChild(modal);
                        // Reload the page to show updated certificate
                        window.location.reload();
                    } else {
                        alert(`Failed to remove domain: ${result.error || 'Unknown error'}`);
                    }
                } catch (error) {
                    alert(`Failed to remove domain: ${error.message}`);
                }
            });
        });
        
        // Add client-side domain validation
        function isValidDomainOrIP(value) {
            // Domain regex based on RFC 1034/1035 with some simplifications
            const domainRegex = /^((?!-)[A-Za-z0-9-]{1,63}(?<!-)\.)+[A-Za-z]{2,}$/;
            // IPv4 regex with octet validation
            const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
            // IPv6 regex (simplified)
            const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
            
            // Check for wildcard domain
            if (value.startsWith('*.')) {
                return domainRegex.test(value.substring(2));
            }
            
            // Check if it's a domain
            if (domainRegex.test(value)) return true;
            
            // Check if it's an IPv4
            if (ipv4Regex.test(value)) {
                const octets = value.split('.').map(Number);
                return octets.every(octet => octet >= 0 && octet <= 255);
            }
            
            // Check if it's an IPv6
            return ipv6Regex.test(value);
        }

        // Setup add domain button
        modal.querySelector('#addDomainBtn').addEventListener('click', async () => {
            const domain = modal.querySelector('#newDomain').value.trim();
            
            if (!domain) {
                alert('Please enter a domain or IP address');
                return;
            }
            
            // Validate domain format
            if (!isValidDomainOrIP(domain)) {
                alert('Invalid domain or IP address format');
                return;
            }
            
            try {
                const response = await fetch(`/api/certificate/${fingerprint}/domains/add`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ domain })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    alert(result.message);
                    document.body.removeChild(modal);
                    // Reload the page to show updated certificate
                    window.location.reload();
                } else {
                    alert(`Failed to add domain: ${result.error || 'Unknown error'}`);
                }
            } catch (error) {
                alert(`Failed to add domain: ${error.message}`);
            }
        });
        
        // Add existing deployment actions - keep the rest of your existing code
        const deployActionsContainer = modal.querySelector('#deployActions');
        (cert.config.deployActions || []).forEach((action, index) => {
            addActionToForm(deployActionsContainer, action, index);
        });
        
        // The rest of your event handlers (add action, save, cancel) remain the same...
        
        // Add action button
        modal.querySelector('#addAction').addEventListener('click', () => {
            const index = deployActionsContainer.children.length;
            addActionToForm(deployActionsContainer, { type: 'copy', destination: '' }, index);
        });
        
        // Save button
        modal.querySelector('#saveConfig').addEventListener('click', async () => {
            // Your existing save logic
        });
        
        // Cancel button
        modal.querySelector('#cancelConfig').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
    } catch (error) {
        alert('Failed to load certificate details: ' + error.message);
    }
}

// Function to renew a certificate
async function renewCertificate(fingerprint) {
    if (!confirm('Are you sure you want to renew this certificate?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/certificate/${fingerprint}/renew`, { 
            method: 'POST' 
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('Certificate renewal initiated successfully. The page will now reload.');
            location.reload();
        } else {
            alert('Failed to renew certificate: ' + (result.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Failed to renew certificate: ' + error.message);
    }
}

// Function to show certificate creation modal
function showCreateCertModal() {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2>Create New Certificate</h2>

            <div class="config-form">
                <div class="form-group">
                    <label for="domains">Domains (comma separated)</label>
                    <input type="text" id="domains" placeholder="example.com, www.example.com">
                </div>
                
                <div class="form-group">
                    <label for="email">Email (optional)</label>
                    <input type="email" id="email" placeholder="admin@example.com">
                </div>
                
                <div class="form-group">
                    <label for="certType">Certificate Type</label>
                    <select id="certType">
                        <option value="standard">Standard</option>
                        <option value="wildcard">Wildcard</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="challengeType">Challenge Type</label>
                    <select id="challengeType">
                        <option value="http">HTTP Challenge</option>
                        <option value="dns">DNS Challenge</option>
                        <option value="standalone">Standalone</option>
                    </select>
                    <p class="help-text" id="challengeHelp">HTTP challenge requires web server access to /.well-known/acme-challenge/</p>
                </div>
                
                <div class="button-group">
                    <button id="createCert">Create Certificate</button>
                    <button id="cancelCreate">Cancel</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Setup event handlers
    modal.querySelector('.close').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Update help text based on challenge type
    modal.querySelector('#challengeType').addEventListener('change', (e) => {
        const helpText = modal.querySelector('#challengeHelp');
        switch (e.target.value) {
            case 'http':
                helpText.textContent = 'HTTP challenge requires web server access to /.well-known/acme-challenge/';
                break;
            case 'dns':
                helpText.textContent = 'DNS challenge requires ability to create TXT records in your domain\'s DNS settings';
                break;
            case 'standalone':
                helpText.textContent = 'Standalone mode will start its own temporary web server on port 80';
                break;
        }
    });
    
    // Set wildcard cert to automatically select DNS challenge
    modal.querySelector('#certType').addEventListener('change', (e) => {
        if (e.target.value === 'wildcard') {
            modal.querySelector('#challengeType').value = 'dns';
            modal.querySelector('#challengeHelp').textContent = 
                'Wildcard certificates require DNS challenge. You\'ll need to create TXT records.';
        }
    });
    
    // Create button
    modal.querySelector('#createCert').addEventListener('click', async () => {
        const domains = modal.querySelector('#domains').value.split(',')
            .map(d => d.trim())
            .filter(d => d.length > 0);
            
        if (domains.length === 0) {
            alert('Please enter at least one domain');
            return;
        }
        
        const email = modal.querySelector('#email').value.trim();
        const certType = modal.querySelector('#certType').value;
        const challengeType = modal.querySelector('#challengeType').value;
        
        // Validate wildcard domains use DNS challenge
        if (certType === 'wildcard' && challengeType !== 'dns') {
            alert('Wildcard certificates require DNS challenge');
            return;
        }
        
        // Check if domains include wildcard but cert type is not wildcard
        const hasWildcard = domains.some(d => d.includes('*'));
        if (hasWildcard && certType !== 'wildcard') {
            alert('You have wildcard domain(s) but selected standard certificate type');
            return;
        }
        
        try {
            // Show loading message
            modal.querySelector('#createCert').textContent = 'Creating...';
            modal.querySelector('#createCert').disabled = true;
            
            const response = await fetch('/api/certificates/create', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    domains,
                    email: email || undefined,
                    challengeType,
                    certType
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                document.body.removeChild(modal);
                alert('Certificate creation process started. The page will reload in a moment.');
                setTimeout(() => location.reload(), 3000);
            } else {
                alert('Failed to create certificate: ' + result.error);
                modal.querySelector('#createCert').textContent = 'Create Certificate';
                modal.querySelector('#createCert').disabled = false;
            }
        } catch (error) {
            alert('Failed to create certificate: ' + error.message);
            modal.querySelector('#createCert').textContent = 'Create Certificate';
            modal.querySelector('#createCert').disabled = false;
        }
    });
    
    // Cancel button
    modal.querySelector('#cancelCreate').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}

async function showGlobalSettingsModal() {
    try {
        // Fetch current global settings
        const response = await fetch('/api/settings');
        const settings = await response.json();
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>Global Certificate Settings</h2>
                
                <div class="config-form">
                    <h3>Default Behavior</h3>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="autoRenewDefault" ${settings.autoRenewByDefault ? 'checked' : ''}>
                            Auto-renew certificates by default
                        </label>
                    </div>
                    
                    <div class="form-group">
                        <label>Default days before expiry to renew:</label>
                        <input type="number" id="defaultRenewDays" value="${settings.renewDaysBeforeExpiry}" min="1" max="90">
                    </div>
                    
                    <h3>Certificate Validity Periods (days)</h3>
                    <div class="form-group">
                        <label>Root CA certificates:</label>
                        <input type="number" id="rootCAValidity" value="${settings.caValidityPeriod.rootCA}" min="365" max="3650">
                    </div>
                    
                    <div class="form-group">
                        <label>Intermediate CA certificates:</label>
                        <input type="number" id="intermediateCAValidity" value="${settings.caValidityPeriod.intermediateCA}" min="365" max="1825">
                    </div>
                    
                    <div class="form-group">
                        <label>Standard certificates:</label>
                        <input type="number" id="standardValidity" value="${settings.caValidityPeriod.standard}" min="30" max="825">
                    </div>
                    
                    <div class="button-group">
                        <button id="saveSettings">Save Settings</button>
                        <button id="cancelSettings">Cancel</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Setup event handlers
        modal.querySelector('.close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Save button
        modal.querySelector('#saveSettings').addEventListener('click', async () => {
            const newSettings = {
                autoRenewByDefault: modal.querySelector('#autoRenewDefault').checked,
                renewDaysBeforeExpiry: parseInt(modal.querySelector('#defaultRenewDays').value, 10),
                caValidityPeriod: {
                    rootCA: parseInt(modal.querySelector('#rootCAValidity').value, 10),
                    intermediateCA: parseInt(modal.querySelector('#intermediateCAValidity').value, 10),
                    standard: parseInt(modal.querySelector('#standardValidity').value, 10)
                }
            };
            
            try {
                const response = await fetch('/api/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(newSettings)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    document.body.removeChild(modal);
                    alert('Global settings saved successfully');
                } else {
                    alert('Failed to save settings: ' + result.error);
                }
            } catch (error) {
                alert('Failed to save settings: ' + error.message);
            }
        });
        
        // Cancel button
        modal.querySelector('#cancelSettings').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    } catch (error) {
        alert('Failed to load settings: ' + error.message);
    }
}