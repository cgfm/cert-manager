// Import logger module
import { logger } from './modules/logger.js';

// Main initialization function
document.addEventListener('DOMContentLoaded', () => {
    logger.debug('Certificate configuration module initializing');
    initializeDomainValidation();
    attachButtonEventHandlers();
    setupHeaderButtons();
    addFilePickerStyles();
    addTabStyles();
    
    // Add global event listener for ESC key to close modals
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const openModals = document.querySelectorAll('.modal:not(.confirm-dialog)');
            
            if (openModals.length > 0 && !document.querySelector('.confirm-dialog')) {
                const topModal = openModals[openModals.length - 1];
                handleModalClose(topModal);
            }
        }
    });
});

// Domain validation initialization function
function initializeDomainValidation() {
    if (typeof isValidDomainOrIP !== 'function') {
        // Fall back to a simple implementation if utils.js is not loaded
        window.isValidDomainOrIP = function(domain) {
            const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
            const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
            const wildcardDomainRegex = /^\*\.([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
            
            return domainRegex.test(domain) || 
                   ipRegex.test(domain) || 
                   wildcardDomainRegex.test(domain) ||
                   domain === 'localhost';
        };
    }
}

// Setup header buttons
function setupHeaderButtons() {
    const header = document.querySelector('header');
    if (header) {
        let buttonContainer = header.querySelector('.header-buttons');
        if (!buttonContainer) {
            buttonContainer = document.createElement('div');
            buttonContainer.className = 'header-buttons';
            header.appendChild(buttonContainer);
        }
        
        if (!document.getElementById('createCertBtn')) {
    }

    // Add styles for file browser and pending changes
    addFilePickerStyles();

    // Add global event listener for ESC key to close modals
    document.addEventListener('keydown', function(event) {
        // Check if Escape key was pressed (key code 27)
        if (event.key === 'Escape') {
            // Find any open modals
            const openModals = document.querySelectorAll('.modal:not(.confirm-dialog)');
            
            // If there's an open modal and no confirmation dialog is active
            if (openModals.length > 0 && !document.querySelector('.confirm-dialog')) {
                // Get the top-most modal (last in the DOM)
                const topModal = openModals[openModals.length - 1];
                
                // Use our existing handler for unsaved changes
                handleModalClose(topModal);
            }
        }
    });
});

// New function to attach event handlers to all buttons
function attachButtonEventHandlers() {
    debugLog('Attaching event handlers to certificate buttons');
    
    // Log the number of buttons found for debugging
    const configButtons = document.querySelectorAll('.config-btn');
    const renewButtons = document.querySelectorAll('.renew-btn');
    debugLog(`Found ${configButtons.length} configure buttons and ${renewButtons.length} renew buttons`);
    
    // Check if we have any rows without buttons and add buttons to them
    document.querySelectorAll('.cert-row').forEach(row => {
        const fingerprint = row.dataset.fingerprint;
        if (!fingerprint) {
            debugLog('Found a row without fingerprint', row);
            return;
        }
        
        let actionsCell = row.querySelector('.cert-actions');
        
        // If no actions cell exists, create one
        if (!actionsCell) {
            debugLog('Creating actions cell for row', row);
            actionsCell = document.createElement('td');
            actionsCell.className = 'cert-actions';
            row.appendChild(actionsCell);
        }
        
        // Check if actions cell is empty or doesn't have buttons
        if (!actionsCell.querySelector('button')) {
            debugLog('Adding buttons to actions cell', actionsCell);
            actionsCell.innerHTML = `
                <button class="config-btn" data-fingerprint="${fingerprint}">
                    <i class="fas fa-cog"></i> Configure
                </button>
                <button class="renew-btn" data-fingerprint="${fingerprint}">
                    <i class="fas fa-sync-alt"></i> Renew
                </button>
            `;
        }
    });
    
    // Now attach event handlers to all configure buttons
    document.querySelectorAll('.config-btn').forEach(btn => {
        const fingerprint = btn.dataset.fingerprint;
        
        if (fingerprint) {
            // Create a clone of the button to remove any existing event listeners
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // Attach new event listener
            newBtn.addEventListener('click', () => {
                debugLog('Configure button clicked for fingerprint:', fingerprint);
                try {
                    showConfigModal(fingerprint);
                } catch (error) {
                    console.error('Error showing config modal:', error);
                    alert('Error showing configuration: ' + error.message);
                }
            });
        } else {
            debugLog('Found a configure button without fingerprint', btn);
        }
    });
    
    // Attach event handlers to all renew buttons
    document.querySelectorAll('.renew-btn').forEach(btn => {
        const fingerprint = btn.dataset.fingerprint;
        
        if (fingerprint) {
            // Create a clone of the button to remove any existing event listeners
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // Attach new event listener
            newBtn.addEventListener('click', () => {
                debugLog('Renew button clicked for fingerprint:', fingerprint);
                try {
                    renewCertificate(fingerprint);
                } catch (error) {
                    console.error('Error renewing certificate:', error);
                    alert('Error renewing certificate: ' + error.message);
                }
            });
        } else {
            debugLog('Found a renew button without fingerprint', btn);
        }
    });
    
    // Final verification
    const afterConfigButtons = document.querySelectorAll('.config-btn');
    const afterRenewButtons = document.querySelectorAll('.renew-btn');
    debugLog(`After processing: ${afterConfigButtons.length} configure buttons and ${afterRenewButtons.length} renew buttons`);
}

// Add this function near the other utility functions
function hasUnsavedChanges(modal) {
    // If this isn't a configuration modal, return false
    if (!modal || !modal.querySelector('#autoRenew')) {
        return false;
    }
    
    // Check for pending domain changes
    if (window.pendingChanges && 
        (window.pendingChanges.addDomains?.length > 0 || 
         window.pendingChanges.removeDomains?.length > 0)) {
        return true;
    }
    
    // Get original values from data attributes
    const originalAutoRenew = modal.dataset.originalAutoRenew === 'true';
    const originalRenewDays = parseInt(modal.dataset.originalRenewDays || '30', 10);
    const originalActionCount = parseInt(modal.dataset.originalActionCount || '0', 10);
    
    // Get current values
    const currentAutoRenew = modal.querySelector('#autoRenew')?.checked || false;
    const currentRenewDays = parseInt(modal.querySelector('#renewDays')?.value || '30', 10);
    
    // Debug output to help troubleshoot
    console.debug('Checking for unsaved changes:', { 
        originalAutoRenew, currentAutoRenew,
        originalRenewDays, currentRenewDays,
        originalActionCount
    });
    
    // Check if basic settings changed
    if (originalAutoRenew !== currentAutoRenew) {
        console.debug('Auto-renew setting changed');
        return true;
    }
    
    if (originalRenewDays !== currentRenewDays) {
        console.debug('Renew days setting changed');
        return true;
    }
    
    // Check if deployment actions changed
    const actionItems = modal.querySelectorAll('.action-item');
    if (actionItems.length !== originalActionCount) {
        console.debug('Action count changed', {
            original: originalActionCount,
            current: actionItems.length
        });
        return true;
    }
    
    // Check if individual action configurations changed
    // This would require storing original actions in more detail
    // but for now we just check count
    
    // If we got here, no changes detected
    console.debug('No changes detected');
    return false;
}

// Update the error handling in the showConfigModal function

async function showConfigModal(fingerprint) {
    try {
        debugLog('Showing config modal for fingerprint:', fingerprint);
        
        // Fetch certificate details
        debugLog('Fetching certificate details...', fingerprint);
        const response = await fetch(`/api/certificate/${encodeURIComponent(fingerprint)}`);
        
        if (!response.ok) {
            if (response.status === 404) {
                // Certificate not found - it might have been renewed with new fingerprint
                // Try to fetch all certificates and find one with matching name
                debugLog('Certificate not found. Trying to find it by searching all certificates...');
                
                const allCertsResponse = await fetch('/api/certificates');
                if (!allCertsResponse.ok) {
                    throw new Error('Failed to fetch certificates list');
                }
                
                const allCerts = await allCertsResponse.json();
                
                // Try to match by substring of the fingerprint (in case format changed)
                const fingerprintToSearch = fingerprint.replace('sha256 Fingerprint=', '');
                const matchedCert = allCerts.find(c => 
                    c.fingerprint.includes(fingerprintToSearch) || 
                    fingerprintToSearch.includes(c.fingerprint.replace('sha256 Fingerprint=', ''))
                );
                
                if (matchedCert) {
                    debugLog('Found a potentially matching certificate', matchedCert);
                    return showConfigModal(matchedCert.fingerprint);
                }
                
                // If still not found, throw a more specific error
                throw new Error('Certificate not found. It may have been deleted or had its ID changed after renewal.');
            }
            throw new Error(`Failed to fetch certificate details: ${response.statusText}`);
        }
        
        const cert = await response.json();
        debugLog('Certificate data received:', cert);
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        
        // Create modal content with certificate details
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2><i class="fas fa-cog"></i> Certificate Configuration</h2>
                <h3>${cert.name}</h3>
                
                <!-- Domain Management Section -->
                <div class="domain-management">
                    <h3><i class="fas fa-globe"></i> Domains & IPs</h3>
                    <div class="domains-list">
                        ${cert.domains && cert.domains.length > 0 
                            ? cert.domains.map((domain, idx) => `
                                <div class="domain-item">
                                    <span>${domain}</span>
                                    <button type="button" class="stage-remove-domain-btn" data-domain="${domain}">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>`).join('')
                            : '<div class="no-domains">No domains configured</div>'}
                    </div>
                    <div class="add-domain-form">
                        <input type="text" id="newDomain" placeholder="example.com or 192.168.1.1">
                        <button id="stageDomainBtn">
                            <i class="fas fa-plus"></i> Add Domain/IP
                        </button>
                    </div>
                    
                    <!-- Pending changes section -->
                    <div id="pendingChanges" style="display: none;">
                        <h4><i class="fas fa-exclamation-triangle"></i> Pending Changes</h4>
                        <div id="pendingList"></div>
                        <div class="pending-actions">
                            <button id="applyChanges" class="apply-changes-btn">
                                <i class="fas fa-check"></i> Apply Changes
                            </button>
                            <button id="discardChanges" class="discard-changes-btn">
                                <i class="fas fa-times"></i> Discard Changes
                            </button>
                        </div>
                    </div>
                </div>
                
                <p><i class="fas fa-calendar-alt"></i> Expires: ${new Date(cert.expiryDate).toLocaleDateString()}</p>
                
                <div class="config-form">
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="autoRenew" ${cert.config.autoRenew ? 'checked' : ''}>
                            <i class="fas fa-sync"></i> Auto-renew
                        </label>
                    </div>
                    
                    <div class="form-group">
                        <label><i class="fas fa-clock"></i> Days before expiry to renew:</label>
                        <input type="number" id="renewDays" value="${cert.config.renewDaysBeforeExpiry || 30}" min="1" max="90">
                    </div>
                    
                    <h4><i class="fas fa-tasks"></i> Deployment Actions</h4>
                    <div id="deployActions"></div>
                    
                    <div class="form-group">
                        <label for="actionType"><i class="fas fa-cogs"></i> Action Type:</label>
                        <select id="actionType">
                            <option value="copy">Copy to location</option>
                            <option value="docker-restart">Restart Docker container</option>
                            <option value="command">Execute command</option>
                        </select>
                    </div>
                    
                    <div class="form-group">
                        <label for="actionParams" id="actionParamLabel"><i class="fas fa-folder"></i> Destination:</label>
                        <input type="text" id="actionParams" placeholder="/path/to/destination">
                        <button type="button" id="browseBtn" class="browse-btn">
                            <i class="fas fa-folder-open"></i> Browse
                        </button>
                    </div>
                    
                    <button id="addActionBtn">
                        <i class="fas fa-plus-circle"></i> Add Action
                    </button>
                    
                    <div id="actionsContainer"></div>
                    
                    <div class="button-group">
                        <button id="saveConfig">
                            <i class="fas fa-save"></i> Save Configuration
                        </button>
                        <button id="cancelConfig">
                            <i class="fas fa-times-circle"></i> Cancel
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        debugLog('Modal added to document body');
        
        // Add existing deployment actions
        const actionsContainer = modal.querySelector('#actionsContainer');
        if (cert.config.deployActions && cert.config.deployActions.length > 0) {
            cert.config.deployActions.forEach(action => {
                addActionToForm(actionsContainer, action);
            });
        }
        
        // Initialize pending changes tracking
        window.pendingChanges = {
            addDomains: [],
            removeDomains: []
        };
        
        // Setup event handlers
        setupModalEventHandlers(modal, cert, fingerprint);
        debugLog('Modal event handlers set up');
        
    } catch (error) {
        console.error('Error showing config modal:', error);
        alert('Error loading certificate configuration: ' + error.message);
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
        const response = await fetch('/api/settings/global');
        const settings = await response.json();
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>Global Certificate Settings</h2>
                
                <div class="tabs">
                    <button class="tab-btn active" data-tab="general">General</button>
                    <button class="tab-btn" data-tab="https">HTTPS</button>
                    <button class="tab-btn" data-tab="backup">Backup</button>
                    <button class="tab-btn" data-tab="advanced">Advanced</button>
                </div>
                
                <div class="tab-contents">
                    <!-- General tab -->
                    <div id="general-tab" class="tab-content active">
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
                    </div>
                    
                    <!-- HTTPS tab -->
                    <div id="https-tab" class="tab-content">
                        <h3>HTTPS Settings</h3>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="enableHttps" ${settings.enableHttps ? 'checked' : ''}>
                                Enable HTTPS
                            </label>
                            <p class="form-help">When enabled, the application will be accessible via HTTPS.</p>
                        </div>
                        
                        <div class="form-group">
                            <label>HTTPS Port:</label>
                            <input type="number" id="httpsPort" value="${settings.httpsPort || 4443}" min="1" max="65535">
                            <p class="form-help">The port to use for HTTPS access (default: 4443)</p>
                        </div>
                        
                        <div class="form-group">
                            <label>Certificate Source:</label>
                            <select id="certSource">
                                <option value="managed" ${!settings.httpsCertPath ? 'selected' : ''}>
                                    Use a managed certificate
                                </option>
                                <option value="custom" ${settings.httpsCertPath ? 'selected' : ''}>
                                    Specify custom certificate paths
                                </option>
                            </select>
                        </div>
                        
                        <div id="managedCertSection" class="form-subsection" 
                            style="${!settings.httpsCertPath ? '' : 'display: none;'}">
                            <div class="form-group">
                                <label>Select Certificate:</label>
                                <select id="managedCertName">
                                    <option value="">Loading certificates...</option>
                                </select>
                                <p class="form-help">Choose one of your managed certificates to secure this UI</p>
                            </div>
                        </div>
                        
                        <div id="customCertSection" class="form-subsection"
                            style="${settings.httpsCertPath ? '' : 'display: none;'}">
                            <div class="form-group">
                                <label>Certificate Path:</label>
                                <input type="text" id="httpsCertPath" value="${settings.httpsCertPath || ''}">
                                <button id="browseCertBtn" class="browse-btn"><i class="fas fa-folder-open"></i></button>
                                <p class="form-help">Full path to the certificate file (.crt/.pem)</p>
                            </div>
                            
                            <div class="form-group">
                                <label>Private Key Path:</label>
                                <input type="text" id="httpsKeyPath" value="${settings.httpsKeyPath || ''}">
                                <button id="browseKeyBtn" class="browse-btn"><i class="fas fa-folder-open"></i></button>
                                <p class="form-help">Full path to the private key file (.key)</p>
                            </div>
                        </div>
                        
                        <div class="info-box warning-box">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p><strong>Note:</strong> After changing HTTPS settings, the server will need to be restarted 
                            for changes to take effect.</p>
                        </div>
                    </div>
                    
                    <!-- Backup tab -->
                    <div id="backup-tab" class="tab-content">
                        <h3>Backup Settings</h3>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="enableBackups" ${settings.enableCertificateBackups !== false ? 'checked' : ''}>
                                Create backups when certificates are renewed
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label>Backup Retention (days):</label>
                            <input type="number" id="backupRetention" value="${settings.backupRetention || 30}" min="1">
                        </div>
                    </div>
                    
                    <!-- Advanced tab -->
                    <div id="advanced-tab" class="tab-content">
                        <h3>Advanced Settings</h3>
                        <div class="form-group">
                            <label>OpenSSL Path:</label>
                            <input type="text" id="openSSLPath" value="${settings.openSSLPath || 'openssl'}">
                            <p class="form-help">Full path to the OpenSSL executable (leave empty for system default)</p>
                        </div>
                        
                        <div class="form-group">
                            <label>Log Level:</label>
                            <select id="logLevel">
                                <option value="error" ${settings.logLevel === 'error' ? 'selected' : ''}>Error</option>
                                <option value="warn" ${settings.logLevel === 'warn' ? 'selected' : ''}>Warn</option>
                                <option value="info" ${settings.logLevel === 'info' || !settings.logLevel ? 'selected' : ''}>Info</option>
                                <option value="debug" ${settings.logLevel === 'debug' ? 'selected' : ''}>Debug</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="jsonOutput" ${settings.jsonOutput ? 'checked' : ''}>
                                Enable JSON formatted logs
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="button-group">
                    <button id="saveSettings" class="primary-btn">Save Settings</button>
                    <button id="cancelSettings" class="secondary-btn">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add tab switching functionality
        setupTabSwitching(modal);
        
        // Load certificates for HTTPS dropdown
        loadCertificatesForHttps(modal, settings.managedCertName);
        
        // Add certificate source change handler
        modal.querySelector('#certSource').addEventListener('change', function() {
            const managedSection = modal.querySelector('#managedCertSection');
            const customSection = modal.querySelector('#customCertSection');
            
            if (this.value === 'managed') {
                managedSection.style.display = 'block';
                customSection.style.display = 'none';
            } else {
                managedSection.style.display = 'none';
                customSection.style.display = 'block';
            }
        });
        
        // Add browse buttons handlers
        modal.querySelector('#browseCertBtn').addEventListener('click', function() {
            showFileBrowser(modal, '#httpsCertPath');
        });
        
        modal.querySelector('#browseKeyBtn').addEventListener('click', function() {
            showFileBrowser(modal, '#httpsKeyPath');
        });
        
        // Setup event handlers
        modal.querySelector('.close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Save button
        modal.querySelector('#saveSettings').addEventListener('click', async () => {
            const newSettings = {
                autoRenewByDefault: modal.querySelector('#autoRenewDefault').checked,
                renewDaysBeforeExpiry: parseInt(modal.querySelector('#defaultRenewDays').value, 10),
                enableCertificateBackups: modal.querySelector('#enableBackups').checked,
                backupRetention: parseInt(modal.querySelector('#backupRetention').value, 10),
                caValidityPeriod: {
                    rootCA: parseInt(modal.querySelector('#rootCAValidity').value, 10),
                    intermediateCA: parseInt(modal.querySelector('#intermediateCAValidity').value, 10),
                    standard: parseInt(modal.querySelector('#standardValidity').value, 10)
                },
                // HTTPS settings
                enableHttps: modal.querySelector('#enableHttps').checked,
                httpsPort: parseInt(modal.querySelector('#httpsPort').value, 10),
                openSSLPath: modal.querySelector('#openSSLPath').value.trim(),
                logLevel: modal.querySelector('#logLevel').value,
                jsonOutput: modal.querySelector('#jsonOutput').checked
            };
            
            // Add certificate source specific settings
            const certSource = modal.querySelector('#certSource').value;
            if (certSource === 'managed') {
                newSettings.managedCertName = modal.querySelector('#managedCertName').value;
                newSettings.httpsCertPath = '';
                newSettings.httpsKeyPath = '';
            } else {
                newSettings.httpsCertPath = modal.querySelector('#httpsCertPath').value.trim();
                newSettings.httpsKeyPath = modal.querySelector('#httpsKeyPath').value.trim();
                newSettings.managedCertName = '';
            }
            
            // Validate HTTPS settings
            if (newSettings.enableHttps) {
                if (certSource === 'managed' && !newSettings.managedCertName) {
                    alert('Please select a certificate for HTTPS or disable HTTPS.');
                    return;
                }
                if (certSource === 'custom' && (!newSettings.httpsCertPath || !newSettings.httpsKeyPath)) {
                    alert('Please specify both certificate and key paths for HTTPS or disable HTTPS.');
                    return;
                }
            }
            
            try {
                const response = await fetch('/api/settings/global', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(newSettings)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // Check if HTTPS settings were changed
                    if (settings.enableHttps !== newSettings.enableHttps || 
                        settings.httpsPort !== newSettings.httpsPort ||
                        settings.httpsCertPath !== newSettings.httpsCertPath ||
                        settings.httpsKeyPath !== newSettings.httpsKeyPath ||
                        settings.managedCertName !== newSettings.managedCertName) {
                        alert('Settings saved. HTTPS settings were changed, please restart the server for these changes to take effect.');
                    } else {
                        alert('Settings saved successfully');
                    }
                    document.body.removeChild(modal);
                } else {
                    alert('Failed to save settings: ' + (result.error || 'Unknown error'));
                }
            } catch (error) {
                console.error('Error saving settings:', error);
                alert('Failed to save settings: ' + error.message);
            }
        });
        
        // Cancel button
        modal.querySelector('#cancelSettings').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
    } catch (error) {
        console.error('Error loading settings:', error);
        alert('Failed to load settings: ' + error.message);
    }
}

// Helper function to set up tab switching
function setupTabSwitching(modal) {
    const tabButtons = modal.querySelectorAll('.tab-btn');
    const tabContents = modal.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Deactivate all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Activate the selected tab
            button.classList.add('active');
            const tabId = button.dataset.tab;
            modal.querySelector(`#${tabId}-tab`).classList.add('active');
        });
    });
}

// Helper function to load certificates for HTTPS dropdown
async function loadCertificatesForHttps(modal, selectedCertName) {
    try {
        const response = await fetch('/api/certificates');
        const certificates = await response.json();
        
        const select = modal.querySelector('#managedCertName');
        select.innerHTML = '<option value="">Select a certificate...</option>';
        
        certificates.forEach(cert => {
            // Only add certificates that have both path and keyPath
            if (cert.path && cert.keyPath) {
                const option = document.createElement('option');
                option.value = cert.name;
                option.textContent = cert.name;
                option.selected = cert.name === selectedCertName;
                select.appendChild(option);
            }
        });
        
        if (certificates.length === 0 || !certificates.some(c => c.path && c.keyPath)) {
            select.innerHTML += '<option value="" disabled>No suitable certificates found</option>';
        }
    } catch (error) {
        console.error('Error loading certificates:', error);
        modal.querySelector('#managedCertName').innerHTML = 
            '<option value="">Error loading certificates</option>';
    }
}

// Helper function to browse for certificate and key files
function showFileBrowser(modal, inputSelector) {
    // Use existing showFileBrowser function but adapt for this use case
    const parentModal = modal;
    const inputId = inputSelector.substring(1); // Remove the # from the selector
    
    // Create a modal dialog for file browsing
    const fileModal = document.createElement('div');
    fileModal.className = 'modal file-browser-modal';
    fileModal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2><i class="fas fa-folder-open"></i> Select File</h2>
            
            <div class="file-browser">
                <div class="current-path">
                    <i class="fas fa-folder"></i> Path: <span id="currentPath">/</span>
                </div>
                <div class="file-list" id="fileList">
                    <p><i class="fas fa-spinner fa-spin"></i> Loading...</p>
                </div>
            </div>
            
            <div class="button-group">
                <button id="selectPathBtn">
                    <i class="fas fa-check"></i> Select File
                </button>
                <button id="cancelBrowseBtn">
                    <i class="fas fa-times"></i> Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(fileModal);
    
    let currentPath = '/certs';
    loadDirectory(currentPath);
    
    // Setup close button
    fileModal.querySelector('.close').addEventListener('click', () => {
        document.body.removeChild(fileModal);
    });
    
    // Setup cancel button
    fileModal.querySelector('#cancelBrowseBtn').addEventListener('click', () => {
        document.body.removeChild(fileModal);
    });
    
    // Setup select button
    fileModal.querySelector('#selectPathBtn').addEventListener('click', () => {
        parentModal.querySelector(inputSelector).value = currentPath;
        document.body.removeChild(fileModal);
    });
    
    // Function to load a directory (reusing your existing implementation)
    async function loadDirectory(path) {
        const fileList = fileModal.querySelector('#fileList');
        fileList.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Loading...</p>';
        
        try {
            const response = await fetch(`/api/filesystem?path=${encodeURIComponent(path)}`);
            const data = await response.json();
            
            if (!data.success) {
                fileList.innerHTML = `<div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i> Error: ${data.message}
                </div>`;
                return;
            }
            
            // Update current path
            fileModal.querySelector('#currentPath').textContent = path;
            currentPath = path;
            
            // Build the directory contents
            let html = '';
            
            // Add parent directory option if not at root
            if (path !== '/') {
                html += `
                    <div class="file-item parent-dir" data-path="${path}">
                        <span class="file-icon"><i class="fas fa-arrow-up"></i></span>
                        <span class="file-name">..</span>
                    </div>
                `;
            }
            
            // Add directories
            data.directories.forEach(dir => {
                html += `
                    <div class="file-item directory" data-path="${path === '/' ? `/${dir}` : `${path}/${dir}`}">
                        <span class="file-icon"><i class="fas fa-folder"></i></span>
                        <span class="file-name">${dir}</span>
                    </div>
                `;
            });
            
            // Add files
            data.files.forEach(file => {
                // Select icon based on file extension
                let fileIcon = 'fas fa-file';
                const extension = file.split('.').pop().toLowerCase();
                
                if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(extension)) {
                    fileIcon = 'fas fa-file-image';
                } else if (['pdf'].includes(extension)) {
                    fileIcon = 'fas fa-file-pdf';
                } else if (['doc', 'docx'].includes(extension)) {
                    fileIcon = 'fas fa-file-word';
                } else if (['xls', 'xlsx'].includes(extension)) {
                    fileIcon = 'fas fa-file-excel';
                } else if (['ppt', 'pptx'].includes(extension)) {
                    fileIcon = 'fas fa-file-powerpoint';
                } else if (['zip', 'tar', 'gz', '7z', 'rar'].includes(extension)) {
                    fileIcon = 'fas fa-file-archive';
                } else if (['js', 'py', 'java', 'c', 'cpp', 'php', 'rb'].includes(extension)) {
                    fileIcon = 'fas fa-file-code';
                } else if (['txt', 'log', 'md'].includes(extension)) {
                    fileIcon = 'fas fa-file-alt';
                } else if (['crt', 'pem', 'key', 'cert'].includes(extension)) {
                    fileIcon = 'fas fa-certificate';
                }
                
                html += `
                    <div class="file-item file" data-path="${path === '/' ? `/${file}` : `${path}/${file}`}">
                        <span class="file-icon"><i class="${fileIcon}"></i></span>
                        <span class="file-name">${file}</span>
                    </div>
                `;
            });
            
            fileList.innerHTML = html;
            
            // Add click events for navigation and selection
            fileModal.querySelectorAll('.directory, .parent-dir').forEach(item => {
                item.addEventListener('click', event => {
                    const clickedPath = event.currentTarget.dataset.path;
                    
                    if (event.currentTarget.classList.contains('parent-dir')) {
                        // Go up a directory
                        const parts = clickedPath.split('/');
                        parts.pop(); // Remove last part
                        const parentPath = parts.join('/') || '/';
                        loadDirectory(parentPath);
                    } else {
                        // Enter the directory
                        loadDirectory(clickedPath);
                    }
                });
            });
            
            // Add click events for file selection
            fileModal.querySelectorAll('.file').forEach(item => {
                item.addEventListener('click', event => {
                    const filePath = event.currentTarget.dataset.path;
                    parentModal.querySelector(inputSelector).value = filePath;
                    document.body.removeChild(fileModal);
                });
            });
            
        } catch (error) {
            console.error('Error loading directory:', error);
            fileList.innerHTML = `<div class="error-message">
                <i class="fas fa-exclamation-triangle"></i> Error loading directory: ${error.message}
            </div>`;
        }
    }
}

// Add CSS for tabs
function addTabStyles() {
    if (!document.getElementById('settings-tab-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'settings-tab-styles';
        styleSheet.innerHTML = `
            .tabs {
                display: flex;
                border-bottom: 1px solid #ddd;
                margin-bottom: 20px;
            }
            
            .tab-btn {
                padding: 10px 15px;
                border: none;
                background: none;
                cursor: pointer;
                border-bottom: 3px solid transparent;
                margin-right: 10px;
                font-weight: 500;
            }
            
            .tab-btn:hover {
                background-color: #f5f5f5;
            }
            
            .tab-btn.active {
                border-bottom-color: #3a86ff;
                color: #3a86ff;
            }
            
            .tab-content {
                display: none;
                animation: fadeIn 0.3s;
            }
            
            .tab-content.active {
                display: block;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            .form-subsection {
                margin-left: 20px;
                padding-left: 10px;
                border-left: 3px solid #f0f0f0;
            }
            
            .form-help {
                font-size: 0.9em;
                color: #6c757d;
                margin-top: 2px;
            }
            
            .info-box {
                padding: 10px;
                border-radius: 4px;
                margin: 15px 0;
            }
            
            .warning-box {
                background-color: #fff3cd;
                border: 1px solid #ffeeba;
            }
            
            .warning-box i {
                color: #856404;
                margin-right: 5px;
            }
        `;
        document.head.appendChild(styleSheet);
    }
}

// Make sure to call this when the page loads
document.addEventListener('DOMContentLoaded', function() {
    addTabStyles();
    // Rest of your existing code...
});

async function showGlobalSettingsModal() {
    try {
        // Fetch current global settings
        const response = await fetch('/api/settings/global');
        const settings = await response.json();
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>Global Certificate Settings</h2>
                
                <div class="tabs">
                    <button class="tab-btn active" data-tab="general">General</button>
                    <button class="tab-btn" data-tab="https">HTTPS</button>
                    <button class="tab-btn" data-tab="backup">Backup</button>
                    <button class="tab-btn" data-tab="advanced">Advanced</button>
                </div>
                
                <div class="tab-contents">
                    <!-- General tab -->
                    <div id="general-tab" class="tab-content active">
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
                    </div>
                    
                    <!-- HTTPS tab -->
                    <div id="https-tab" class="tab-content">
                        <h3>HTTPS Settings</h3>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="enableHttps" ${settings.enableHttps ? 'checked' : ''}>
                                Enable HTTPS
                            </label>
                            <p class="form-help">When enabled, the application will be accessible via HTTPS.</p>
                        </div>
                        
                        <div class="form-group">
                            <label>HTTPS Port:</label>
                            <input type="number" id="httpsPort" value="${settings.httpsPort || 4443}" min="1" max="65535">
                            <p class="form-help">The port to use for HTTPS access (default: 4443)</p>
                        </div>
                        
                        <div class="form-group">
                            <label>Certificate Source:</label>
                            <select id="certSource">
                                <option value="managed" ${!settings.httpsCertPath ? 'selected' : ''}>
                                    Use a managed certificate
                                </option>
                                <option value="custom" ${settings.httpsCertPath ? 'selected' : ''}>
                                    Specify custom certificate paths
                                </option>
                            </select>
                        </div>
                        
                        <div id="managedCertSection" class="form-subsection" 
                            style="${!settings.httpsCertPath ? '' : 'display: none;'}">
                            <div class="form-group">
                                <label>Select Certificate:</label>
                                <select id="managedCertName">
                                    <option value="">Loading certificates...</option>
                                </select>
                                <p class="form-help">Choose one of your managed certificates to secure this UI</p>
                            </div>
                        </div>
                        
                        <div id="customCertSection" class="form-subsection"
                            style="${settings.httpsCertPath ? '' : 'display: none;'}">
                            <div class="form-group">
                                <label>Certificate Path:</label>
                                <input type="text" id="httpsCertPath" value="${settings.httpsCertPath || ''}">
                                <button id="browseCertBtn" class="browse-btn"><i class="fas fa-folder-open"></i></button>
                                <p class="form-help">Full path to the certificate file (.crt/.pem)</p>
                            </div>
                            
                            <div class="form-group">
                                <label>Private Key Path:</label>
                                <input type="text" id="httpsKeyPath" value="${settings.httpsKeyPath || ''}">
                                <button id="browseKeyBtn" class="browse-btn"><i class="fas fa-folder-open"></i></button>
                                <p class="form-help">Full path to the private key file (.key)</p>
                            </div>
                        </div>
                        
                        <div class="info-box warning-box">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p><strong>Note:</strong> After changing HTTPS settings, the server will need to be restarted 
                            for changes to take effect.</p>
                        </div>
                    </div>
                    
                    <!-- Backup tab -->
                    <div id="backup-tab" class="tab-content">
                        <h3>Backup Settings</h3>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="enableBackups" ${settings.enableCertificateBackups !== false ? 'checked' : ''}>
                                Create backups when certificates are renewed
                            </label>
                        </div>
                        
                        <div class="form-group">
                            <label>Backup Retention (days):</label>
                            <input type="number" id="backupRetention" value="${settings.backupRetention || 30}" min="1">
                        </div>
                    </div>
                    
                    <!-- Advanced tab -->
                    <div id="advanced-tab" class="tab-content">
                        <h3>Advanced Settings</h3>
                        <div class="form-group">
                            <label>OpenSSL Path:</label>
                            <input type="text" id="openSSLPath" value="${settings.openSSLPath || 'openssl'}">
                            <p class="form-help">Full path to the OpenSSL executable (leave empty for system default)</p>
                        </div>
                        
                        <div class="form-group">
                            <label>Log Level:</label>
                            <select id="logLevel">
                                <option value="error" ${settings.logLevel === 'error' ? 'selected' : ''}>Error</option>
                                <option value="warn" ${settings.logLevel === 'warn' ? 'selected' : ''}>Warn</option>
                                <option value="info" ${settings.logLevel === 'info' || !settings.logLevel ? 'selected' : ''}>Info</option>
                                <option value="debug" ${settings.logLevel === 'debug' ? 'selected' : ''}>Debug</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="jsonOutput" ${settings.jsonOutput ? 'checked' : ''}>
                                Enable JSON formatted logs
                            </label>
                        </div>
                    </div>
                </div>
                
                <div class="button-group">
                    <button id="saveSettings" class="primary-btn">Save Settings</button>
                    <button id="cancelSettings" class="secondary-btn">Cancel</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add tab switching functionality
        setupTabSwitching(modal);
        
        // Load certificates for HTTPS dropdown
        loadCertificatesForHttps(modal, settings.managedCertName);
        
        // Add certificate source change handler
        modal.querySelector('#certSource').addEventListener('change', function() {
            const managedSection = modal.querySelector('#managedCertSection');
            const customSection = modal.querySelector('#customCertSection');
            
            if (this.value === 'managed') {
                managedSection.style.display = 'block';
                customSection.style.display = 'none';
            } else {
                managedSection.style.display = 'none';
                customSection.style.display = 'block';
            }
        });
        
        // Add browse buttons handlers
        modal.querySelector('#browseCertBtn').addEventListener('click', function() {
            showFileBrowser(modal, '#httpsCertPath');
        });
        
        modal.querySelector('#browseKeyBtn').addEventListener('click', function() {
            showFileBrowser(modal, '#httpsKeyPath');
        });
        
        // Setup event handlers
        modal.querySelector('.close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Save button
        modal.querySelector('#saveSettings').addEventListener('click', async () => {
            const newSettings = {
                autoRenewByDefault: modal.querySelector('#autoRenewDefault').checked,
                renewDaysBeforeExpiry: parseInt(modal.querySelector('#defaultRenewDays').value, 10),
                enableCertificateBackups: modal.querySelector('#enableBackups').checked,
                backupRetention: parseInt(modal.querySelector('#backupRetention').value, 10),
                caValidityPeriod: {
                    rootCA: parseInt(modal.querySelector('#rootCAValidity').value, 10),
                    intermediateCA: parseInt(modal.querySelector('#intermediateCAValidity').value, 10),
                    standard: parseInt(modal.querySelector('#standardValidity').value, 10)
                },
                // HTTPS settings
                enableHttps: modal.querySelector('#enableHttps').checked,
                httpsPort: parseInt(modal.querySelector('#httpsPort').value, 10),
                openSSLPath: modal.querySelector('#openSSLPath').value.trim(),
                logLevel: modal.querySelector('#logLevel').value,
                jsonOutput: modal.querySelector('#jsonOutput').checked
            };
            
            // Add certificate source specific settings
            const certSource = modal.querySelector('#certSource').value;
            if (certSource === 'managed') {
                newSettings.managedCertName = modal.querySelector('#managedCertName').value;
                newSettings.httpsCertPath = '';
                newSettings.httpsKeyPath = '';
            } else {
                newSettings.httpsCertPath = modal.querySelector('#httpsCertPath').value.trim();
                newSettings.httpsKeyPath = modal.querySelector('#httpsKeyPath').value.trim();
                newSettings.managedCertName = '';
            }
            
            // Validate HTTPS settings
            if (newSettings.enableHttps) {
                if (certSource === 'managed' && !newSettings.managedCertName) {
                    alert('Please select a certificate for HTTPS or disable HTTPS.');
                    return;
                }
                if (certSource === 'custom' && (!newSettings.httpsCertPath || !newSettings.httpsKeyPath)) {
                    alert('Please specify both certificate and key paths for HTTPS or disable HTTPS.');
                    return;
                }
            }
            
            try {
                const response = await fetch('/api/settings/global', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(newSettings)
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // Check if HTTPS settings were changed
                    if (settings.enableHttps !== newSettings.enableHttps || 
                        settings.httpsPort !== newSettings.httpsPort ||
                        settings.httpsCertPath !== newSettings.httpsCertPath ||
                        settings.httpsKeyPath !== newSettings.httpsKeyPath ||
                        settings.managedCertName !== newSettings.managedCertName) {
                        alert('Settings saved. HTTPS settings were changed, please restart the server for these changes to take effect.');
                    } else {
                        alert('Settings saved successfully');
                    }
                    document.body.removeChild(modal);
                } else {
                    alert('Failed to save settings: ' + (result.error || 'Unknown error'));
                }
            } catch (error) {
                console.error('Error saving settings:', error);
                alert('Failed to save settings: ' + error.message);
            }
        });
        
        // Cancel button
        modal.querySelector('#cancelSettings').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
    } catch (error) {
        console.error('Error loading settings:', error);
        alert('Failed to load settings: ' + error.message);
    }
}

// Update the addActionToForm function

function addActionToForm(container, action = null) {
    // Create a new action item div
    const actionItem = document.createElement('div');
    actionItem.className = 'action-item';
    
    // Set the action type and parameters
    const type = action ? action.type : document.getElementById('actionType').value;
    
    let params;
    
    if (action) {
        // Use existing action parameters
        params = action.destination || action.containerId || action.command || '';
    } else {
        // Get parameters from form
        const actionParamsElement = document.getElementById('actionParams');
        
        if (type === 'docker-restart' && actionParamsElement.tagName === 'SELECT') {
            // For select elements, get the selected option text for display and value for data
            const selectedOption = actionParamsElement.options[actionParamsElement.selectedIndex];
            params = {
                value: actionParamsElement.value,
                display: selectedOption.textContent
            };
        } else {
            params = actionParamsElement.value;
        }
    }
    
    // Choose appropriate icon based on action type
    let icon, displayText;
    switch (type) {
        case 'copy':
            icon = '<i class="fas fa-copy"></i>';
            displayText = params;
            break;
        case 'docker-restart':
            icon = '<i class="fab fa-docker"></i>';
            displayText = params.display || params;
            break;
        case 'command':
            icon = '<i class="fas fa-terminal"></i>';
            displayText = params;
            break;
        default:
            icon = '<i class="fas fa-cog"></i>';
            displayText = params;
    }
    
    // Create the display and input elements
    actionItem.innerHTML = `
        <span>${icon} ${type}: ${displayText || 'No parameters'}</span>
        <button type="button" class="remove-action-btn"><i class="fas fa-trash"></i></button>
        <input type="hidden" name="actionTypes[]" value="${type}">
        <input type="hidden" name="actionParams[]" value="${params.value || params}">
    `;
    
    // Add event listener to the remove button
    actionItem.querySelector('.remove-action-btn').addEventListener('click', function() {
        actionItem.remove();
    });
    
    // Add to the container
    container.appendChild(actionItem);
    
    // Clear the inputs for the next action if not adding an existing one
    if (!action) {
        // Reset select to first option or clear input
        const actionParamsElement = document.getElementById('actionParams');
        if (actionParamsElement.tagName === 'SELECT') {
            actionParamsElement.selectedIndex = 0;
        } else {
            actionParamsElement.value = '';
        }
    }
}

// Add event listener to the Add Action button
function setupModalEventHandlers(modal, cert, fingerprint) {
    debugLog('Setting up modal event handlers', { fingerprint });
    
    // Setup action type change handler
    const actionTypeSelect = modal.querySelector('#actionType');
    if (actionTypeSelect) {
        actionTypeSelect.addEventListener('change', async function() {
            const actionParamLabel = modal.querySelector('#actionParamLabel');
            const actionParams = modal.querySelector('#actionParams');
            const browseBtn = modal.querySelector('#browseBtn');
            
            // Remove any existing parameter input
            const oldParamInput = modal.querySelector('#actionParamsContainer');
            if (oldParamInput) {
                oldParamInput.parentNode.replaceChild(actionParams, oldParamInput);
            }
            
            if (this.value === 'copy') {
                actionParamLabel.innerHTML = '<i class="fas fa-folder"></i> Destination:';
                actionParams.type = 'text';
                actionParams.placeholder = "/path/to/destination";
                browseBtn.style.display = 'inline-block';
                actionParams.style.display = 'inline-block';
                
                // Remove any docker container message
                const existingMsg = modal.querySelector('.docker-container-msg');
                if (existingMsg) {
                    existingMsg.remove();
                }
            } else if (this.value === 'docker-restart') {
                actionParamLabel.innerHTML = '<i class="fab fa-docker"></i> Container:';
                browseBtn.style.display = 'none';
                
                // Create container for the select/input
                const paramContainer = document.createElement('div');
                paramContainer.id = 'actionParamsContainer';
                paramContainer.style.display = 'flex';
                paramContainer.style.flexDirection = 'column';
                paramContainer.style.width = '100%';
                
                // Replace the input with our container
                actionParams.parentNode.replaceChild(paramContainer, actionParams);
                
                // Show loading message
                paramContainer.innerHTML = `
                    <div class="docker-container-msg">
                        <i class="fas fa-spinner fa-spin"></i> Fetching Docker containers...
                    </div>
                `;
                
                try {
                    // Fetch available containers
                    const response = await fetch('/api/docker/containers');
                    const result = await response.json();
                    
                    if (result.success && result.containers && result.containers.length > 0) {
                        // Create select element for containers
                        const select = document.createElement('select');
                        select.id = 'actionParams';
                        select.className = 'container-select';
                        
                        // Add empty option
                        const emptyOption = document.createElement('option');
                        emptyOption.value = '';
                        emptyOption.textContent = '-- Select a container --';
                        select.appendChild(emptyOption);
                        
                        // Add container options
                        result.containers.forEach(container => {
                            const option = document.createElement('option');
                            const name = container.Names[0].replace(/^\//, ''); // Remove leading slash
                            option.value = container.Id;
                            option.textContent = `${name} (${container.Image})`;
                            option.dataset.status = container.State;
                            select.appendChild(option);
                        });
                        
                        // Replace loading message with select
                        paramContainer.innerHTML = '';
                        paramContainer.appendChild(select);
                        
                        // Add status indicator that updates when selection changes
                        const statusDiv = document.createElement('div');
                        statusDiv.className = 'docker-container-msg';
                        statusDiv.innerHTML = `<i class="fas fa-info-circle"></i> ${result.containers.length} containers found`;
                        paramContainer.appendChild(statusDiv);
                        
                        // Add event listener to update status when selection changes
                        select.addEventListener('change', function() {
                            const selectedOption = this.options[this.selectedIndex];
                            if (selectedOption.value) {
                                const status = selectedOption.dataset.status;
                                const statusClass = status === 'running' ? 'text-success' : 'text-danger';
                                statusDiv.innerHTML = `
                                    <i class="fas fa-circle ${statusClass}"></i> 
                                    Status: <span class="${statusClass}">${status}</span>
                                `;
                            } else {
                                statusDiv.innerHTML = `<i class="fas fa-info-circle"></i> ${result.containers.length} containers found`;
                            }
                        });
                        
                    } else {
                        // No containers or Docker not available
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.id = 'actionParams';
                        input.placeholder = result.error === 'docker_not_available' ? 
                            "Docker not detected - enter container ID manually" : 
                            "No containers found - enter container ID manually";
                        
                        paramContainer.innerHTML = '';
                        paramContainer.appendChild(input);
                        
                        // Add message
                        const msgDiv = document.createElement('div');
                        msgDiv.className = 'docker-container-msg';
                        msgDiv.innerHTML = `
                            <i class="fas fa-exclamation-triangle"></i> 
                            ${result.error === 'docker_not_available' ? 
                                'Docker socket not accessible.' : 
                                'No containers found.'}
                        `;
                        paramContainer.appendChild(msgDiv);
                    }
                } catch (error) {
                    console.error('Error checking for Docker containers:', error);
                    
                    // Create fallback input
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.id = 'actionParams';
                    input.placeholder = "Error checking Docker - enter container ID manually";
                    
                    paramContainer.innerHTML = '';
                    paramContainer.appendChild(input);
                    
                    // Add error message
                    const errorDiv = document.createElement('div');
                    errorDiv.className = 'docker-container-msg error-message';
                    errorDiv.innerHTML = `
                        <i class="fas fa-exclamation-triangle"></i> 
                        Error: ${error.message || 'Failed to connect to Docker'}
                    `;
                    paramContainer.appendChild(errorDiv);
                }
            } else if (this.value === 'command') {
                actionParamLabel.innerHTML = '<i class="fas fa-terminal"></i> Command:';
                actionParams.type = 'text';
                actionParams.placeholder = "systemctl restart nginx";
                browseBtn.style.display = 'none';
                actionParams.style.display = 'inline-block';
                
                // Remove any docker container message
                const existingMsg = modal.querySelector('.docker-container-msg');
                if (existingMsg) {
                    existingMsg.remove();
                }
            }
        });
    }
    
    // Add Action button click handler
    const addActionBtn = modal.querySelector('#addActionBtn');
    if (addActionBtn) {
        addActionBtn.addEventListener('click', function() {
            const actionsContainer = modal.querySelector('#actionsContainer');
            addActionToForm(actionsContainer);
        });
    }
    
    // Setup browse button
    const browseBtn = modal.querySelector('#browseBtn');
    if (browseBtn) {
        browseBtn.addEventListener('click', function() {
            showFileBrowser(modal);
        });
    }
    
    // Add domain button
    const stageDomainBtn = modal.querySelector('#stageDomainBtn');
    if (stageDomainBtn) {
        stageDomainBtn.addEventListener('click', function() {
            const newDomain = modal.querySelector('#newDomain').value.trim();
            if (!newDomain) return;
            
            // Add to pending changes
            window.pendingChanges.addDomains.push(newDomain);
            modal.querySelector('#newDomain').value = '';
            
            updatePendingChangesUI();
        });
    }
    
    // Remove domain buttons
    modal.querySelectorAll('.stage-remove-domain-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const domain = this.dataset.domain;
            window.pendingChanges.removeDomains.push(domain);
            this.closest('.domain-item').classList.add('pending-removal-item');
            this.classList.add('pending-removal');
            this.disabled = true;
            
            updatePendingChangesUI();
        });
    });
    
    // Apply changes button
    const applyChangesBtn = modal.querySelector('#applyChanges');
    if (applyChangesBtn) {
        applyChangesBtn.addEventListener('click', async function() {
            debugLog('Applying domain changes', window.pendingChanges);
            
            // Check if we have any changes
            if (!window.pendingChanges.addDomains.length && !window.pendingChanges.removeDomains.length) {
                alert('No changes to apply.');
                return;
            }
            
            // Get deployment actions from the form for the confirmation dialog
            const deployActions = [];
            const actionItems = modal.querySelectorAll('.action-item');
            actionItems.forEach(item => {
                const typeInput = item.querySelector('input[name="actionTypes[]"]');
                const paramInput = item.querySelector('input[name="actionParams[]"]');
                if (typeInput && paramInput) {
                    deployActions.push({
                        type: typeInput.value,
                        param: paramInput.value
                    });
                }
            });
            
            // Show confirmation dialog about certificate renewal and deployments
            const confirmDialog = document.createElement('div');
            confirmDialog.className = 'confirm-dialog';
            confirmDialog.innerHTML = `
                <div class="confirm-content">
                    <h3><i class="fas fa-exclamation-triangle"></i> Certificate Renewal Required</h3>
                    <p>Adding or removing domains requires the certificate to be renewed with the new configuration.</p>
                    <p>The following changes will be applied:</p>
                    <ul>
                        ${window.pendingChanges.addDomains.length ? 
                          `<li><strong>Add domains:</strong> ${window.pendingChanges.addDomains.join(', ')}</li>` : ''}
                        ${window.pendingChanges.removeDomains.length ? 
                          `<li><strong>Remove domains:</strong> ${window.pendingChanges.removeDomains.join(', ')}</li>` : ''}
                    </ul>
                    ${deployActions.length > 0 ? `
                    <p><strong>After renewal, the following deployment actions will run:</strong></p>
                    <ul>
                        ${deployActions.map(action => `
                            <li><strong>${action.type}:</strong> ${action.param}</li>
                        `).join('')}
                    </ul>
                    ` : ''}
                    <p>Do you want to proceed with these changes and renew the certificate?</p>
                    <div class="button-group">
                        <button id="proceedBtn" class="primary-btn">
                            <i class="fas fa-check"></i> Proceed with Renewal
                        </button>
                        <button id="cancelBtn" class="secondary-btn">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(confirmDialog);
            
            // Wait for user decision
            const userDecision = await new Promise(resolve => {
                confirmDialog.querySelector('#proceedBtn').addEventListener('click', () => {
                    document.body.removeChild(confirmDialog);
                    resolve(true);
                });
                
                confirmDialog.querySelector('#cancelBtn').addEventListener('click', () => {
                    document.body.removeChild(confirmDialog);
                    resolve(false);
                });
            });
            
            if (!userDecision) {
                return; // User canceled the operation
            }
            
            // Disable the button while processing
            this.disabled = true;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            
            try {
                // Make the API call to update domains and renew certificate
                const encodedFingerprint = encodeURIComponent(fingerprint);
                debugLog('Using encoded fingerprint for API calls:', encodedFingerprint);
                
                const response = await fetch(`/api/certificate/${encodedFingerprint}/update-domains`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        addDomains: window.pendingChanges.addDomains,
                        removeDomains: window.pendingChanges.removeDomains,
                        renew: true // Always renew to embed domains in the certificate
                    })
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`Error response from server (${response.status}):`, errorText);
                    throw new Error(`Server returned ${response.status}: ${errorText}`);
                }
                
                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.error || 'Unknown error');
                }
                
                debugLog('Certificate updated successfully with new domains', result);
                
                // Reset pending changes
                window.pendingChanges = { addDomains: [], removeDomains: [] };
                
                // Show success message
                let message = 'Certificate has been updated and renewed with the new domain configuration.';
                if (deployActions.length > 0) {
                    message += ' Deployment actions have been executed.';
                }
                alert(message);
                
                // Close current modal
                document.body.removeChild(modal);
                
                // Use the new fingerprint if provided, otherwise use the original
                const newFingerprint = result.newFingerprint || fingerprint;
                
                // If the fingerprint has changed, update UI elements
                if (result.newFingerprint && result.newFingerprint !== fingerprint) {
                    debugLog('Certificate fingerprint changed', {
                        oldFingerprint: fingerprint,
                        newFingerprint: result.newFingerprint
                    });
                    
                    // Update elements in the table with the new fingerprint
                    document.querySelectorAll(`[data-fingerprint="${fingerprint}"]`).forEach(el => {
                        el.dataset.fingerprint = result.newFingerprint;
                    });
                }
                
                // Wait a moment for server-side processing to complete
                setTimeout(() => {
                    showConfigModal(newFingerprint);
                }, 1000);
                
            } catch (error) {
                console.error('Error applying changes:', error);
                alert('Failed to apply changes: ' + error.message);
                
                // Re-enable the button
                this.disabled = false;
                this.innerHTML = '<i class="fas fa-check"></i> Apply Changes';
            }
        });
    }
    
    // Discard changes button
    const discardChangesBtn = modal.querySelector('#discardChanges');
    if (discardChangesBtn) {
        discardChangesBtn.addEventListener('click', function() {
            // Reset pending changes
            window.pendingChanges = { addDomains: [], removeDomains: [] };
            
            // Reset UI
            modal.querySelectorAll('.pending-removal-item').forEach(item => {
                item.classList.remove('pending-removal-item');
            });
            
            modal.querySelectorAll('.pending-removal').forEach(btn => {
                btn.classList.remove('pending-removal');
                btn.disabled = false;
            });
            
            updatePendingChangesUI();
        });
    }
    
    // Setup save configuration button
    modal.querySelector('#saveConfig').addEventListener('click', async function() {
        try {
            const autoRenew = modal.querySelector('#autoRenew').checked;
            const renewDays = parseInt(modal.querySelector('#renewDays').value, 10);
            
            // Collect deployment actions
            const deployActions = [];
            modal.querySelectorAll('.action-item').forEach(item => {
                const type = item.querySelector('input[name="actionTypes[]"]').value;
                const param = item.querySelector('input[name="actionParams[]"]').value;
                
                let action;
                if (type === 'copy') {
                    action = { type, destination: param };
                } else if (type === 'docker-restart') {
                    action = { type, containerId: param };
                } else if (type === 'command') {
                    action = { type, command: param };
                }
                
                if (action) deployActions.push(action);
            });
            
            const config = {
                autoRenew,
                renewDaysBeforeExpiry: renewDays,
                deployActions
            };
            
            debugLog('Saving certificate configuration', config);
            
            const response = await fetch(`/api/certificate/${fingerprint}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(config)
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert('Configuration saved successfully');
                document.body.removeChild(modal);
            } else {
                alert('Failed to save configuration: ' + result.error);
            }
        } catch (error) {
            console.error('Error saving configuration:', error);
            alert('Failed to save configuration: ' + error.message);
        }
    });
    
    // Setup close and cancel buttons
    modal.querySelector('.close').addEventListener('click', () => {
        handleModalClose(modal);
    });
    
    modal.querySelector('#cancelConfig').addEventListener('click', () => {
        handleModalClose(modal);
    });
}

// Add function to show file browser
function showFileBrowser(parentModal) {
    // Create a modal dialog for file browsing
    const modal = document.createElement('div');
    modal.className = 'modal file-browser-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2><i class="fas fa-folder-open"></i> Select Destination</h2>
            
            <div class="file-browser">
                <div class="current-path">
                    <i class="fas fa-folder"></i> Path: <span id="currentPath">/</span>
                </div>
                <div class="file-list" id="fileList">
                    <p><i class="fas fa-spinner fa-spin"></i> Loading...</p>
                </div>
            </div>
            
            <div class="button-group">
                <button id="selectPathBtn">
                    <i class="fas fa-check"></i> Select Current Path
                </button>
                <button id="cancelBrowseBtn">
                    <i class="fas fa-times"></i> Cancel
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    let currentPath = '/';
    loadDirectory(currentPath);
    
    // Setup close button
    modal.querySelector('.close').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Setup cancel button
    modal.querySelector('#cancelBrowseBtn').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Setup select button
    modal.querySelector('#selectPathBtn').addEventListener('click', () => {
        parentModal.querySelector('#actionParams').value = currentPath;
        document.body.removeChild(modal);
    });
    
    // Function to load a directory
    async function loadDirectory(path) {
        const fileList = document.getElementById('fileList');
        fileList.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Loading...</p>';
        
        try {
            const response = await fetch(`/api/filesystem?path=${encodeURIComponent(path)}`);
            const data = await response.json();
            
            if (!data.success) {
                fileList.innerHTML = `<div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i> Error: ${data.message}
                </div>`;
                return;
            }
            
            // Update current path
            document.getElementById('currentPath').textContent = path;
            currentPath = path;
            
            // Build the directory contents
            let html = '';
            
            // Add parent directory option if not at root
            if (path !== '/') {
                html += `
                    <div class="file-item parent-dir" data-path="${path}">
                        <span class="file-icon"><i class="fas fa-arrow-up"></i></span>
                        <span class="file-name">..</span>
                    </div>
                `;
            }
            
            // Add directories
            data.directories.forEach(dir => {
                html += `
                    <div class="file-item directory" data-path="${path === '/' ? `/${dir}` : `${path}/${dir}`}">
                        <span class="file-icon"><i class="fas fa-folder"></i></span>
                        <span class="file-name">${dir}</span>
                    </div>
                `;
            });
            
            // Add files
            data.files.forEach(file => {
                // Select icon based on file extension
                let fileIcon = 'fas fa-file';
                const extension = file.split('.').pop().toLowerCase();
                
                if (['jpg', 'jpeg', 'png', 'gif', 'svg'].includes(extension)) {
                    fileIcon = 'fas fa-file-image';
                } else if (['pdf'].includes(extension)) {
                    fileIcon = 'fas fa-file-pdf';
                } else if (['doc', 'docx'].includes(extension)) {
                    fileIcon = 'fas fa-file-word';
                } else if (['xls', 'xlsx'].includes(extension)) {
                    fileIcon = 'fas fa-file-excel';
                } else if (['ppt', 'pptx'].includes(extension)) {
                    fileIcon = 'fas fa-file-powerpoint';
                } else if (['zip', 'tar', 'gz', '7z', 'rar'].includes(extension)) {
                    fileIcon = 'fas fa-file-archive';
                } else if (['js', 'py', 'java', 'c', 'cpp', 'php', 'rb'].includes(extension)) {
                    fileIcon = 'fas fa-file-code';
                } else if (['txt', 'log', 'md'].includes(extension)) {
                    fileIcon = 'fas fa-file-alt';
                }
                
                html += `
                    <div class="file-item file" data-path="${path === '/' ? `/${file}` : `${path}/${file}`}">
                        <span class="file-icon"><i class="${fileIcon}"></i></span>
                        <span class="file-name">${file}</span>
                    </div>
                `;
            });
            
            fileList.innerHTML = html;
            
            // Add click events for navigation and selection...
            fileList.querySelectorAll('.directory, .parent-dir').forEach(item => {
                item.addEventListener('click', event => {
                    const clickedPath = event.currentTarget.dataset.path;
                    
                    if (event.currentTarget.classList.contains('parent-dir')) {
                        // Go up a directory
                        const parts = clickedPath.split('/');
                        parts.pop(); // Remove last part
                        const parentPath = parts.join('/') || '/';
                        loadDirectory(parentPath);
                    } else {
                        // Enter the directory
                        loadDirectory(clickedPath);
                    }
                });
            });
            
            // Add click events for file selection
            fileList.querySelectorAll('.file').forEach(item => {
                item.addEventListener('click', event => {
                    const filePath = event.currentTarget.dataset.path;
                    parentModal.querySelector('#actionParams').value = filePath;
                    document.body.removeChild(modal);
                });
            });
            
        } catch (error) {
            console.error('Error loading directory:', error);
            fileList.innerHTML = `<div class="error-message">
                <i class="fas fa-exclamation-triangle"></i> Error loading directory: ${error.message}
            </div>`;
        }
    }
}

// Add CSS for file browser to the document
function addFilePickerStyles() {
    if (!document.getElementById('file-picker-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'file-picker-styles';
        styleSheet.innerHTML = `
            /* File browser specific styles */
            .file-browser-modal .modal-content {
                max-width: 600px;
                max-height: 80vh;
            }
            
            .file-browser {
                border: 1px solid var(--border-color, #ddd);
                border-radius: 4px;
                margin: 10px 0;
                max-height: 400px;
                overflow-y: auto;
            }
            
            .current-path {
                background-color: var(--hover-color, #f5f5f5);
                padding: 10px;
                border-bottom: 1px solid var(--border-color, #ddd);
                font-family: monospace;
            }
            
            .file-list {
                padding: 10px;
            }
            
            .file-item {
                padding: 5px 10px;
                margin-bottom: 5px;
                cursor: pointer;
                border-radius: 4px;
                display: flex;
                align-items: center;
            }
            
            .file-item:hover {
                background-color: var(--hover-color, #f0f0f0);
            }
            
            .file-icon {
                margin-right: 10px;
            }
            
            .error-message {
                color: var(--danger-color, #dc3545);
                padding: 10px;
            }
            
            /* Pending changes styling */
            .stage-remove-domain-btn.pending-removal {
                background-color: var(--danger-color, #dc3545);
                color: white;
            }
            
            .pending-removal-item {
                background-color: #ffecec;
            }
            
            #pendingChanges {
                background-color: #fff3cd;
                border: 1px solid #ffeeba;
                padding: 10px;
                margin: 10px 0;
                border-radius: 4px;
            }
            
            .pending-additions, .pending-removals {
                margin-bottom: 10px;
            }
            
            .undo-btn {
                background-color: var(--text-muted, #6c757d);
                color: white;
                border: none;
                padding: 2px 5px;
                border-radius: 3px;
                font-size: 12px;
                cursor: pointer;
                margin-left: 5px;
            }
            
            .pending-actions {
                margin-top: 10px;
                text-align: right;
            }
            
            .apply-changes-btn {
                background-color: var(--success-color, #28a745);
                color: white;
                border: none;
                padding: 5px 10px;
                border-radius: 4px;
                cursor: pointer;
                margin-right: 5px;
            }
            
            .discard-changes-btn {
                background-color: var(--danger-color, #dc3545);
                color: white;
                border: none;
                padding: 5px 10px;
                border-radius: 4px;
                cursor: pointer;
            }
            
            /* Action items styling */
            .action-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px;
                margin-bottom: 5px;
                background-color: var(--hover-color, #f0f0f0);
                border-radius: 4px;
            }
            
            .action-item span {
                flex-grow: 1;
            }
            
            .remove-action-btn {
                background-color: var(--danger-color, #dc3545);
                color: white;
                border: none;
                padding: 4px 8px;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
            }
            
            /* Browse button */
            .browse-btn {
                background-color: var(--primary-color, #3a86ff);
                color: white;
                border: none;
                padding: 8px 12px;
                border-radius: 4px;
                cursor: pointer;
            }
            
            /* For domain validation */
            .domain-validation-error {
                color: var(--danger-color, #dc3545);
                font-size: 12px;
                margin-top: 5px;
            }
            
            /* Confirmation dialog styles */
            .confirm-dialog {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background-color: white;
                border: 1px solid var(--border-color, #ddd);
                border-radius: 4px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                z-index: 1000;
                width: 400px;
                max-width: 90%;
                padding: 20px;
            }
            
            .confirm-content h3 {
                margin-top: 0;
                color: var(--danger-color, #dc3545);
            }
            
            .confirm-content p {
                margin: 10px 0;
            }
            
            .confirm-content .button-group {
                display: flex;
                justify-content: space-between;
                margin-top: 20px;
            }
            
            .confirm-content .button-group button {
                flex: 1;
                margin: 0 5px;
                padding: 10px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            
            .confirm-content .button-group .primary-btn {
                background-color: var(--success-color, #28a745);
                color: white;
            }
            
            .confirm-content .button-group .danger-btn {
                background-color: var(--danger-color, #dc3545);
                color: white;
            }
            
            .confirm-content .button-group .secondary-btn {
                background-color: var(--text-muted, #6c757d);
                color: white;
            }
            
            /* Docker container message */
            .docker-container-msg {
                margin-top: 5px;
                font-size: 0.9em;
                color: var(--text-muted, #6c757d);
                padding: 5px;
                background-color: #f8f9fa;
                border-radius: 4px;
            }
            
            /* Datalist styling improvements */
            input[list]:focus {
                outline: none;
                border-color: var(--primary-color, #3a86ff);
                box-shadow: 0 0 0 2px rgba(58, 134, 255, 0.25);
            }
            
            /* Docker container selection styles */
            #actionParamsContainer {
                margin-bottom: 10px;
            }
            
            .container-select {
                width: 100%;
                padding: 8px;
                border: 1px solid var(--border-color, #ddd);
                border-radius: 4px;
                background-color: white;
                margin-bottom: 5px;
            }
            
            .container-select:focus {
                outline: none;
                border-color: var(--primary-color, #3a86ff);
                box-shadow: 0 0 0 2px rgba(58, 134, 255, 0.25);
            }
            
            .text-success {
                color: var(--success-color, #28a745);
            }
            
            .text-danger {
                color: var(--danger-color, #dc3545);
            }
        `;
        document.head.appendChild(styleSheet);
    }
}

// Add function to handle modal close with unsaved changes confirmation
function handleModalClose(modal) {
    if (hasUnsavedChanges(modal)) {
        // Create confirmation dialog
        const confirmDialog = document.createElement('div');
        confirmDialog.className = 'confirm-dialog';
        confirmDialog.innerHTML = `
            <div class="confirm-content">
                <h3><i class="fas fa-exclamation-triangle"></i> Unsaved Changes</h3>
                <p>You have unsaved changes. What would you like to do?</p>
                <div class="button-group">
                    <button id="saveChangesBtn" class="primary-btn">
                        <i class="fas fa-save"></i> Save Changes
                    </button>
                    <button id="discardChangesBtn" class="danger-btn">
                        <i class="fas fa-trash"></i> Discard Changes
                    </button>
                    <button id="continueEditingBtn" class="secondary-btn">
                        <i class="fas fa-edit"></i> Continue Editing
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(confirmDialog);
        
        // Add event listeners for the dialog buttons
        confirmDialog.querySelector('#saveChangesBtn').addEventListener('click', () => {
            document.body.removeChild(confirmDialog);
            // Trigger save button click event
            modal.querySelector('#saveConfig').click();
        });
        
        confirmDialog.querySelector('#discardChangesBtn').addEventListener('click', () => {
            document.body.removeChild(confirmDialog);
            document.body.removeChild(modal);
        });
        
        confirmDialog.querySelector('#continueEditingBtn').addEventListener('click', () => {
            document.body.removeChild(confirmDialog);
        });
    } else {
        // No changes, just close
        document.body.removeChild(modal);
    }
}

// Update the updatePendingChangesUI function to use Font Awesome icons and improve error handling

function updatePendingChangesUI() {
    const modal = document.querySelector('.modal');
    if (!modal) return;
    
    const pendingList = modal.querySelector('#pendingList');
    const pendingChangesSection = modal.querySelector('#pendingChanges');
    
    // Initialize pendingChanges if it doesn't exist
    if (!window.pendingChanges) {
        window.pendingChanges = {
            addDomains: [],
            removeDomains: []
        };
    }
    
    // Show or hide pending changes section
    if (window.pendingChanges.addDomains.length > 0 || window.pendingChanges.removeDomains.length > 0) {
        pendingChangesSection.style.display = 'block';
    } else {
        pendingChangesSection.style.display = 'none';
        return;
    }
    
    // Update the list of pending changes
    let html = '';
    
    if (window.pendingChanges.addDomains.length > 0) {
        html += '<div class="pending-additions"><strong><i class="fas fa-plus-circle"></i> Domains to add:</strong><ul>';
        window.pendingChanges.addDomains.forEach(domain => {
            html += `<li>${domain} <button class="undo-btn" data-action="add" data-domain="${domain}">
                <i class="fas fa-undo"></i> Undo
            </button></li>`;
        });
        html += '</ul></div>';
    }
    
    if (window.pendingChanges.removeDomains.length > 0) {
        html += '<div class="pending-removals"><strong><i class="fas fa-minus-circle"></i> Domains to remove:</strong><ul>';
        window.pendingChanges.removeDomains.forEach(domain => {
            html += `<li>${domain} <button class="undo-btn" data-action="remove" data-domain="${domain}">
                <i class="fas fa-undo"></i> Undo
            </button></li>`;
        });
        html += '</ul></div>';
    }
    
    pendingList.innerHTML = html;
    
    // Add undo button event listeners
    pendingList.querySelectorAll('.undo-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const action = this.dataset.action;
            const domain = this.dataset.domain;
            
            if (action === 'add') {
                // Remove from pending additions
                window.pendingChanges.addDomains = window.pendingChanges.addDomains.filter(d => d !== domain);
            } else if (action === 'remove') {
                // Remove from pending removals
                window.pendingChanges.removeDomains = window.pendingChanges.removeDomains.filter(d => d !== domain);
                
                // Reset UI for this domain
                const domainItems = document.querySelectorAll('.domain-item');
                domainItems.forEach(item => {
                    const btn = item.querySelector(`[data-domain="${domain}"]`);
                    if (btn) {
                        item.classList.remove('pending-removal-item');
                        btn.classList.remove('pending-removal');
                        btn.disabled = false;
                    }
                });
            }
            
            updatePendingChangesUI();
        });
    });
}