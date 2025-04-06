document.addEventListener('DOMContentLoaded', () => {
    // Check if we need to add isValidDomainOrIP function
    if (typeof isValidDomainOrIP !== 'function') {
        // Fall back to a simple implementation if utils.js is not loaded
        window.isValidDomainOrIP = function(domain) {
            // Simple regex for domain or IP validation
            const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
            const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
            const wildcardDomainRegex = /^\*\.([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
            
            return domainRegex.test(domain) || 
                   ipRegex.test(domain) || 
                   wildcardDomainRegex.test(domain) ||
                   domain === 'localhost';
        };
    }
    
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
                <button class="config-btn" data-fingerprint="${fingerprint}">
                    <i class="fas fa-cog"></i> Configure
                </button>
                <button class="renew-btn" data-fingerprint="${fingerprint}">
                    <i class="fas fa-sync-alt"></i> Renew
                </button>
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
            settingsBtn.innerHTML = '<i class="fas fa-cogs"></i> Global Settings';
            settingsBtn.addEventListener('click', showGlobalSettingsModal);
            buttonContainer.appendChild(settingsBtn);
        }
        
        // Add create certificate button if it doesn't exist
        if (!document.getElementById('createCertBtn')) {
            const createBtn = document.createElement('button');
            createBtn.id = 'createCertBtn';
            createBtn.innerHTML = '<i class="fas fa-plus-square"></i> Create New Certificate';
            createBtn.addEventListener('click', showCreateCertModal);
            buttonContainer.appendChild(createBtn);
        }
    }

    // Add styles for file browser and pending changes
    addFilePickerStyles();
});

// Update the modal HTML template with Font Awesome icons
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
                <h2><i class="fas fa-cog"></i> Certificate Configuration</h2>
                <h3>${cert.name}</h3>
                
                <!-- Domain Management Section -->
                <div class="domain-management">
                    <h3><i class="fas fa-globe"></i> Domains & IPs</h3>
                    <div class="domains-list">
                        ${(cert.domains || []).map(domain => `
                            <div class="domain-item">
                                <span class="domain-name">
                                    <i class="${domain.includes('*') ? 'fas fa-star' : domain.match(/^\d/) ? 'fas fa-network-wired' : 'fas fa-link'}"></i>
                                    ${domain}
                                </span>
                                <button class="stage-remove-domain-btn" data-domain="${domain}">
                                    <i class="fas fa-trash-alt"></i> Remove
                                </button>
                            </div>
                        `).join('')}
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

        // Rest of the modal setup code...
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
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="enableBackups" ${settings.enableCertificateBackups !== false ? 'checked' : ''}>
                            Create backups when certificates are renewed
                        </label>
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
                enableCertificateBackups: modal.querySelector('#enableBackups').checked,
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

// Update the addActionToForm function to use Font Awesome icons
function addActionToForm(container, action = null) {
    // Create a new action item div
    const actionItem = document.createElement('div');
    actionItem.className = 'action-item';
    
    // Set the action type and parameters
    const type = action ? action.type : document.getElementById('actionType').value;
    const params = action ? action.destination || action.containerId || action.command || '' : document.getElementById('actionParams').value;
    
    // Choose appropriate icon based on action type
    let icon;
    switch (type) {
        case 'copy':
            icon = '<i class="fas fa-copy"></i>';
            break;
        case 'docker-restart':
            icon = '<i class="fab fa-docker"></i>';
            break;
        case 'command':
            icon = '<i class="fas fa-terminal"></i>';
            break;
        default:
            icon = '<i class="fas fa-cog"></i>';
    }
    
    // Create the display and input elements
    actionItem.innerHTML = `
        <span>${icon} ${type}: ${params || 'No parameters'}</span>
        <button type="button" class="remove-action-btn"><i class="fas fa-trash"></i></button>
        <input type="hidden" name="actionTypes[]" value="${type}">
        <input type="hidden" name="actionParams[]" value="${params}">
    `;
    
    // Add event listener to the remove button
    actionItem.querySelector('.remove-action-btn').addEventListener('click', function() {
        actionItem.remove();
    });
    
    // Add to the container
    container.appendChild(actionItem);
    
    // Clear the inputs for the next action if not adding an existing one
    if (!action) {
        document.getElementById('actionParams').value = '';
    }
}

// Add event listener to the Add Action button
function setupModalEventHandlers(modal, cert, fingerprint) {
    // Setup action type change handler
    const actionTypeSelect = modal.querySelector('#actionType');
    if (actionTypeSelect) {
        actionTypeSelect.addEventListener('change', function() {
            const actionParamLabel = modal.querySelector('#actionParamLabel');
            const browseBtn = modal.querySelector('#browseBtn');
            
            if (this.value === 'copy') {
                actionParamLabel.textContent = 'Destination:';
                browseBtn.style.display = 'inline-block';
            } else if (this.value === 'docker-restart') {
                actionParamLabel.textContent = 'Container ID:';
                browseBtn.style.display = 'none';
            } else if (this.value === 'command') {
                actionParamLabel.textContent = 'Command:';
                browseBtn.style.display = 'none';
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
            alert('Failed to save configuration: ' + error.message);
        }
    });
    
    // Setup close and cancel buttons
    modal.querySelector('.close').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    modal.querySelector('#cancelConfig').addEventListener('click', () => {
        document.body.removeChild(modal);
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
        `;
        document.head.appendChild(styleSheet);
    }
}

// Update the updatePendingChangesUI function to use Font Awesome icons
function updatePendingChangesUI() {
    const pendingList = modal.querySelector('#pendingList');
    const pendingChangesSection = modal.querySelector('#pendingChanges');
    
    // Show or hide pending changes section
    if (pendingChanges.addDomains.length > 0 || pendingChanges.removeDomains.length > 0) {
        pendingChangesSection.style.display = 'block';
    } else {
        pendingChangesSection.style.display = 'none';
        return;
    }
    
    // Update the list of pending changes
    let html = '';
    
    if (pendingChanges.addDomains.length > 0) {
        html += '<div class="pending-additions"><strong><i class="fas fa-plus-circle"></i> Domains to add:</strong><ul>';
        pendingChanges.addDomains.forEach(domain => {
            html += `<li>${domain} <button class="undo-btn" data-action="add" data-domain="${domain}">
                <i class="fas fa-undo"></i> Undo
            </button></li>`;
        });
        html += '</ul></div>';
    }
    
    if (pendingChanges.removeDomains.length > 0) {
        html += '<div class="pending-removals"><strong><i class="fas fa-minus-circle"></i> Domains to remove:</strong><ul>';
        pendingChanges.removeDomains.forEach(domain => {
            html += `<li>${domain} <button class="undo-btn" data-action="remove" data-domain="${domain}">
                <i class="fas fa-undo"></i> Undo
            </button></li>`;
        });
        html += '</ul></div>';
    }
    
    pendingList.innerHTML = html;
    
    // Add undo button event listeners...
}