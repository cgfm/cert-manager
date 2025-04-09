/**
 * Client-side JavaScript for the certificate manager
 */
function getClientScript() {
  return `
    // Sorting functionality
    let sortDirection = 1; // 1 for ascending, -1 for descending
    
    function sortTable(viewType, columnIndex) {
        const tableId = viewType === 'flat' ? 'cert-table-flat' : 'cert-table-hierarchy';
        const table = document.getElementById(tableId);
        
        if (!table) return;
        
        const rows = Array.from(table.querySelectorAll('tbody tr.cert-row'));
        const header = table.querySelector('th:nth-child(' + (columnIndex + 1) + ')');
        
        // Toggle sort direction
        if (header.getAttribute('data-sort') === '1') {
            sortDirection = -1;
            header.setAttribute('data-sort', '-1');
        } else {
            sortDirection = 1;
            header.setAttribute('data-sort', '1');
        }
        
        // Reset other headers
        table.querySelectorAll('th').forEach(th => {
            if (th !== header) {
                th.removeAttribute('data-sort');
            }
        });
        
        if (viewType === 'flat') {
            // Sort flat view
            rows.sort((a, b) => {
                let aValue, bValue;
                
                if (columnIndex === 2) {
                    // Sort by date
                    aValue = new Date(a.cells[columnIndex].getAttribute('data-date') || 0);
                    bValue = new Date(b.cells[columnIndex].getAttribute('data-date') || 0);
                } else if (columnIndex === 0) {
                    // Sort by certificate name (ignoring status indicator and cert type)
                    aValue = a.cells[columnIndex].innerText.replace(/Root CA|Intermediate CA/g, '').trim();
                    bValue = b.cells[columnIndex].innerText.replace(/Root CA|Intermediate CA/g, '').trim();
                } else {
                    // Sort by text
                    aValue = a.cells[columnIndex].innerText.trim();
                    bValue = b.cells[columnIndex].innerText.trim();
                }
                
                // Handle potential undefined/null values
                if (!aValue) return 1 * sortDirection;
                if (!bValue) return -1 * sortDirection;
                
                if (aValue < bValue) return -1 * sortDirection;
                if (aValue > bValue) return 1 * sortDirection;
                return 0;
            });
            
            // Re-add rows in the new order
            const tbody = table.querySelector('tbody');
            rows.forEach(row => tbody.appendChild(row));
        } else {
            // Hierarchical view doesn't support full sorting to preserve hierarchy
            alert('Sorting in hierarchical view is not supported. Please switch to flat view for full sorting capabilities.');
        }
    }
    
    // Search functionality
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', filterTables);
    
    function filterTables() {
        const filter = searchInput.value.toLowerCase();
        const tables = [
            document.getElementById('cert-table-flat'),
            document.getElementById('cert-table-hierarchy')
        ];
        
        let visibleCount = 0;
        
        tables.forEach(table => {
            if (!table) return;
            
            const rows = table.querySelectorAll('tbody tr');
            
            rows.forEach(row => {
                let shouldShow = false;
                
                // Don't filter group rows in hierarchy view
                if (row.classList.contains('group-row')) {
                    row.style.display = '';
                    return;
                }
                
                const cells = row.querySelectorAll('td');
                for (let i = 0; i < cells.length; i++) {
                    const cellText = cells[i].textContent.toLowerCase();
                    if (cellText.includes(filter)) {
                        shouldShow = true;
                        break;
                    }
                }
                
                // Only count visible rows in the active view
                if (shouldShow && 
                    ((table.id === 'cert-table-flat' && !table.closest('.card').classList.contains('hierarchy-container')) ||
                     (table.id === 'cert-table-hierarchy' && !table.closest('.card').classList.contains('flat-container')))) {
                    visibleCount++;
                }
                
                row.style.display = shouldShow ? '' : 'none';
            });
        });
        
        document.getElementById('certCount').textContent = visibleCount;
    }
    
    // View toggle functionality
    const flatViewBtn = document.getElementById('flatViewBtn');
    const hierarchyViewBtn = document.getElementById('hierarchyViewBtn');
    const flatView = document.getElementById('flatView');
    const hierarchyView = document.getElementById('hierarchyView');
    
    flatViewBtn.addEventListener('click', () => {
        flatView.classList.remove('flat-container');
        flatView.style.display = 'block';
        hierarchyView.style.display = 'none';
        flatViewBtn.classList.add('active');
        hierarchyViewBtn.classList.remove('active');
        filterTables(); // Recount certificates
    });
    
    hierarchyViewBtn.addEventListener('click', () => {
        flatView.style.display = 'none';
        hierarchyView.style.display = 'block';
        flatViewBtn.classList.remove('active');
        hierarchyViewBtn.classList.add('active');
        filterTables(); // Recount certificates
    });
    
    // Initially sort by expiry date in flat view
    document.addEventListener('DOMContentLoaded', () => {
        const expiryHeader = document.querySelector('#cert-table-flat th:nth-child(3)');
        if (expiryHeader) {
            expiryHeader.click();
        }
    });
    
    function browseFilesystem(inputId, fileExtensions) {
        // Show a file selection modal
        showFileSelectionModal((selectedPath) => {
            if (selectedPath) {
                document.getElementById(inputId).value = selectedPath;
            }
        });
    }

    function showFileSelectionModal(callback) {
        // Create a modal for file selection
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = \`
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2><i class="fas fa-folder-open"></i> File Browser</h2>
                
                <div class="path-navigation">
                    <input type="text" id="currentPath" value="/certs" />
                    <button id="navigateBtn"><i class="fas fa-arrow-right"></i> Go</button>
                </div>
                
                <div class="file-browser">
                    <div id="fileListing">
                        <p><i class="fas fa-spinner fa-spin"></i> Loading...</p>
                    </div>
                </div>
                
                <div class="button-group">
                    <button id="selectFileBtn" class="primary-btn">
                        <i class="fas fa-check"></i> Select
                    </button>
                    <button id="cancelFileSelect" class="secondary-btn">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            </div>
        \`;
        
        document.body.appendChild(modal);
        
        // Set up event handlers
        modal.querySelector('.close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        modal.querySelector('#cancelFileSelect').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        const currentPathInput = modal.querySelector('#currentPath');
        const navigateBtn = modal.querySelector('#navigateBtn');
        const fileListing = modal.querySelector('#fileListing');
        const selectFileBtn = modal.querySelector('#selectFileBtn');
        
        let selectedFile = '';
        
        // Navigation button
        navigateBtn.addEventListener('click', () => {
            browsePath(currentPathInput.value);
        });
        
        // Select button
        selectFileBtn.addEventListener('click', () => {
            if (selectedFile) {
                callback(selectedFile);
                document.body.removeChild(modal);
            } else {
                alert('Please select a file first.');
            }
        });
        
        // Function to browse to a path
        function browsePath(path) {
            fetch(\`/api/filesystem/browse?path=\${encodeURIComponent(path)}\`)
                .then(response => response.json())
                .then(result => {
                    if (result.success) {
                        // Update current path
                        currentPathInput.value = result.path;
                        
                        // Clear selection
                        selectedFile = '';
                        
                        // Render files and folders
                        let html = '<ul class="file-list">';
                        
                        // Parent directory link
                        if (result.path !== '/') {
                            html += \`<li class="directory parent-dir" data-path="\${result.parentPath}">
                                <i class="fas fa-level-up-alt"></i> ..
                            </li>\`;
                        }
                        
                        // Render directories first
                        result.items
                            .filter(item => item.type === 'directory')
                            .forEach(dir => {
                                html += \`<li class="directory" data-path="\${dir.path}">
                                    <i class="fas fa-folder"></i> \${dir.name}
                                </li>\`;
                            });
                        
                        // Then render files
                        result.items
                            .filter(item => item.type === 'file')
                            .forEach(file => {
                                html += \`<li class="file" data-path="\${file.path}">
                                    <i class="fas fa-file"></i> \${file.name}
                                </li>\`;
                            });
                        
                        html += '</ul>';
                        fileListing.innerHTML = html;
                        
                        // Add event handlers for the file list
                        document.querySelectorAll('.file-list li.directory').forEach(item => {
                            item.addEventListener('click', () => {
                                browsePath(item.dataset.path);
                            });
                        });
                        
                        document.querySelectorAll('.file-list li.file').forEach(item => {
                            item.addEventListener('click', () => {
                                // Mark selected
                                document.querySelectorAll('.file-list li.selected').forEach(el => {
                                    el.classList.remove('selected');
                                });
                                item.classList.add('selected');
                                selectedFile = item.dataset.path;
                            });
                        });
                    } else {
                        fileListing.innerHTML = \`<p class="error"><i class="fas fa-exclamation-triangle"></i> \${result.message}</p>\`;
                    }
                })
                .catch(error => {
                    console.error('Error browsing filesystem:', error);
                    fileListing.innerHTML = '<p class="error"><i class="fas fa-exclamation-triangle"></i> Error accessing filesystem</p>';
                });
        }
        
        // Initial directory listing
        browsePath('/certs');
    }
    
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
                modal.querySelector('#' + tabId + '-tab').classList.add('active');
            });
        });
    }
    
    function loadCertificatesForHttps() {
        // Fetch all certificates for the dropdown
        fetch('/api/certificates')
            .then(response => response.json())
            .then(certificates => {
                const select = document.getElementById('managedCertName');
                
                select.innerHTML = \`<option value="">Select a certificate...</option>\`;
                
                certificates.forEach(cert => {
                    // Only add certificates that have both path and keyPath
                    if (cert.path && cert.keyPath) {
                        const option = document.createElement('option');
                        option.value = cert.name;
                        option.textContent = cert.name;
                        select.appendChild(option);
                    }
                });
                
                // Restore selected value if it exists
                const currentValue = select.getAttribute('data-selected');
                if (currentValue) {
                    select.value = currentValue;
                }
            })
            .catch(error => {
                console.error('Error loading certificates:', error);
                document.getElementById('managedCertName').innerHTML = 
                    \`<option value="">Error loading certificates</option>\`;
            });
    }
    
    function setupGlobalSettingsEvents(modal, settings) {
        // Close button
        modal.querySelector('.close').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Cancel button
        modal.querySelector('#cancelGlobalSettings').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Certificate source toggle
        modal.querySelector('#certSource').addEventListener('change', function() {
            const managedSection = document.getElementById('managedCertSection');
            const customSection = document.getElementById('customCertSection');
            
            if (this.value === 'managed') {
                managedSection.style.display = 'block';
                customSection.style.display = 'none';
            } else {
                managedSection.style.display = 'none';
                customSection.style.display = 'block';
            }
        });
        
        // Browse buttons for file selection
        modal.querySelector('#browseCertBtn').addEventListener('click', () => {
            browseFilesystem('httpsCertPath', '.crt,.pem');
        });
        
        modal.querySelector('#browseKeyBtn').addEventListener('click', () => {
            browseFilesystem('httpsKeyPath', '.key');
        });
        
        // Save settings
        modal.querySelector('#saveGlobalSettings').addEventListener('click', () => {
            // General tab settings
            const autoRenewByDefault = document.getElementById('autoRenewByDefault').checked;
            const renewDaysBeforeExpiry = parseInt(document.getElementById('defaultRenewalDays').value);
            const validityStandard = parseInt(document.getElementById('validityStandard').value);
            const validityRootCA = parseInt(document.getElementById('validityRootCA').value);
            const validityIntermediateCA = parseInt(document.getElementById('validityIntermediateCA').value);
            
            // HTTPS tab settings
            const enableHttps = document.getElementById('enableHttps').checked;
            const httpsPort = parseInt(document.getElementById('httpsPort').value);
            const certSource = document.getElementById('certSource').value;
            let httpsCertPath = '';
            let httpsKeyPath = '';
            let managedCertName = '';
            
            if (certSource === 'managed') {
                managedCertName = document.getElementById('managedCertName').value;
            } else {
                httpsCertPath = document.getElementById('httpsCertPath').value;
                httpsKeyPath = document.getElementById('httpsKeyPath').value;
            }
            
            // Backup tab settings
            const enableCertificateBackups = document.getElementById('enableCertificateBackups').checked;
            const backupRetention = parseInt(document.getElementById('backupRetention').value);
            
            // Advanced tab settings
            const openSSLPath = document.getElementById('openSSLPath').value;
            const logLevel = document.getElementById('logLevel').value;
            const jsonOutput = document.getElementById('jsonOutput').checked;
            
            // Validate required fields
            if (enableHttps) {
                if (certSource === 'managed' && !managedCertName) {
                    alert('Please select a certificate for HTTPS or disable HTTPS.');
                    return;
                }
                if (certSource === 'custom' && (!httpsCertPath || !httpsKeyPath)) {
                    alert('Please specify both certificate and key paths for HTTPS or disable HTTPS.');
                    return;
                }
            }
            
            // Update settings object
            const updatedSettings = {
                ...settings,
                autoRenewByDefault,
                renewDaysBeforeExpiry,
                caValidityPeriod: {
                    standard: validityStandard,
                    rootCA: validityRootCA,
                    intermediateCA: validityIntermediateCA
                },
                enableHttps,
                httpsPort,
                httpsCertPath: certSource === 'custom' ? httpsCertPath : '',
                httpsKeyPath: certSource === 'custom' ? httpsKeyPath : '',
                managedCertName: certSource === 'managed' ? managedCertName : '',
                enableCertificateBackups,
                backupRetention,
                openSSLPath,
                logLevel,
                jsonOutput
            };
            
            // Save settings to server
            fetch('/api/settings/global', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updatedSettings)
            })
            .then(response => response.json())
            .then(result => {
                if (result.success) {
                    alert('Settings saved successfully.');
                    
                    // If HTTPS settings were changed, show restart notice
                    if (settings.enableHttps !== enableHttps || 
                        settings.httpsPort !== httpsPort ||
                        settings.httpsCertPath !== httpsCertPath ||
                        settings.httpsKeyPath !== httpsKeyPath ||
                        settings.managedCertName !== managedCertName) {
                        alert('HTTPS settings were changed. Please restart the server for these changes to take effect.');
                    }
                    
                    document.body.removeChild(modal);
                } else {
                    alert(\`Failed to save settings: \${result.error}\`);
                }
            })
            .catch(error => {
                console.error('Error saving global settings:', error);
                alert('Failed to save settings. Please try again.');
            });
        });
    }
    
    // Global Settings Modal function
    function showGlobalSettingsModal() {
        // Fetch global settings - use the correct endpoint
        fetch('/api/settings/global')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to fetch settings (status ${response.status})');
                }
                return response.json();
            })
            .then(settings => {
                const modal = document.createElement('div');
                modal.className = 'modal';
                modal.innerHTML = \`
                    <div class="modal-content">
                        <span class="close">&times;</span>
                        <h2><i class="fas fa-cog"></i> Global Settings</h2>
                        
                        <div class="tabs">
                            <button class="tab-btn active" data-tab="general">General</button>
                            <button class="tab-btn" data-tab="https">HTTPS</button>
                            <button class="tab-btn" data-tab="backup">Backup</button>
                            <button class="tab-btn" data-tab="advanced">Advanced</button>
                        </div>
                        
                        <div class="tab-contents">
                            <div id="general-tab" class="tab-content active">
                                <h3>General Settings</h3>
                                <div class="form-group">
                                    <label for="autoRenewByDefault">
                                        <input type="checkbox" id="autoRenewByDefault" 
                                            \${settings.autoRenewByDefault ? 'checked' : ''}>
                                        Auto Renew Certificates by Default
                                    </label>
                                </div>
                                <div class="form-group">
                                    <label for="defaultRenewalDays">Renew Certificates X Days Before Expiry:</label>
                                    <input type="number" id="defaultRenewalDays" value="\${settings.renewDaysBeforeExpiry || 30}" min="1">
                                </div>
                                <div class="form-group">
                                    <label for="validityStandard">Default Validity Period (Standard):</label>
                                    <input type="number" id="validityStandard" value="\${settings.caValidityPeriod.standard || 365}" min="1">
                                </div>
                                <div class="form-group">
                                    <label for="validityRootCA">Default Validity Period (Root CA):</label>
                                    <input type="number" id="validityRootCA" value="\${settings.caValidityPeriod.rootCA || 3650}" min="1">
                                </div>
                                <div class="form-group">
                                    <label for="validityIntermediateCA">Default Validity Period (Intermediate CA):</label>
                                    <input type="number" id="validityIntermediateCA" value="\${settings.caValidityPeriod.intermediateCA || 1825}" min="1">
                                </div>
                            </div>
                            
                            <div id="https-tab" class="tab-content">
                                <h3>HTTPS Settings</h3>
                                <div class="form-group">
                                    <label for="enableHttps">
                                        <input type="checkbox" id="enableHttps" 
                                            \${settings.enableHttps ? 'checked' : ''}>
                                        Enable HTTPS
                                    </label>
                                    <p class="form-help">When enabled, the application will be accessible via HTTPS.</p>
                                </div>
                                <div class="form-group">
                                    <label for="httpsPort">HTTPS Port:</label>
                                    <input type="number" id="httpsPort" value="\${settings.httpsPort || 4443}" min="1" max="65535">
                                    <p class="form-help">The port to use for HTTPS access (default: 4443)</p>
                                </div>
                                <div class="form-group">
                                    <label for="certSource">Certificate Source:</label>
                                    <select id="certSource">
                                        <option value="managed" \${!settings.httpsCertPath ? 'selected' : ''}>
                                            Use a managed certificate
                                        </option>
                                        <option value="custom" \${settings.httpsCertPath ? 'selected' : ''}>
                                            Specify custom certificate paths
                                        </option>
                                    </select>
                                </div>
                                <div id="managedCertSection" class="form-subsection" 
                                    style="\${!settings.httpsCertPath ? '' : 'display: none;'}">
                                    <div class="form-group">
                                        <label for="managedCertName">Select Certificate:</label>
                                        <select id="managedCertName" data-selected="\${settings.managedCertName || ''}">
                                            <option value="">Loading certificates...</option>
                                        </select>
                                        <p class="form-help">Choose one of your managed certificates to secure this UI</p>
                                    </div>
                                </div>
                                <div id="customCertSection" class="form-subsection"
                                    style="\${settings.httpsCertPath ? '' : 'display: none;'}">
                                    <div class="form-group">
                                        <label for="httpsCertPath">Certificate Path:</label>
                                        <input type="text" id="httpsCertPath" value="\${settings.httpsCertPath || ''}">
                                        <button id="browseCertBtn" class="browse-btn"><i class="fas fa-folder-open"></i></button>
                                        <p class="form-help">Full path to the certificate file (.crt/.pem)</p>
                                    </div>
                                    <div class="form-group">
                                        <label for="httpsKeyPath">Private Key Path:</label>
                                        <input type="text" id="httpsKeyPath" value="\${settings.httpsKeyPath || ''}">
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
                            
                            <div id="backup-tab" class="tab-content">
                                <h3>Backup Settings</h3>
                                <div class="form-group">
                                    <label for="enableCertificateBackups">
                                        <input type="checkbox" id="enableCertificateBackups" 
                                            \${settings.enableCertificateBackups ? 'checked' : ''}>
                                        Enable Certificate Backups
                                    </label>
                                    <p class="form-help">When enabled, certificates will be backed up before renewal or deletion.</p>
                                </div>
                                <div class="form-group">
                                    <label for="backupRetention">Backup Retention (days):</label>
                                    <input type="number" id="backupRetention" value="\${settings.backupRetention || 30}" min="1">
                                    <p class="form-help">The number of days to retain backups (default: 30)</p>
                                </div>
                            </div>
                            
                            <div id="advanced-tab" class="tab-content">
                                <h3>Advanced Settings</h3>
                                <div class="form-group">
                                    <label for="openSSLPath">OpenSSL Path:</label>
                                    <input type="text" id="openSSLPath" value="\${settings.openSSLPath || ''}">
                                    <p class="form-help">Full path to the OpenSSL executable (if not in system PATH)</p>
                                </div>
                                <div class="form-group">
                                    <label for="logLevel">Log Level:</label>
                                    <select id="logLevel">
                                        <option value="error" \${settings.logLevel === 'error' ? 'selected' : ''}>Error</option>
                                        <option value="warn" \${settings.logLevel === 'warn' ? 'selected' : ''}>Warn</option>
                                        <option value="info" \${settings.logLevel === 'info' ? 'selected' : ''}>Info</option>
                                        <option value="debug" \${settings.logLevel === 'debug' ? 'selected' : ''}>Debug</option>
                                    </select>
                                    <p class="form-help">The level of logging detail (default: Info)</p>
                                </div>
                                <div class="form-group">
                                    <label for="jsonOutput">
                                        <input type="checkbox" id="jsonOutput" 
                                            \${settings.jsonOutput ? 'checked' : ''}>
                                        Enable JSON Output
                                    </label>
                                    <p class="form-help">When enabled, logs will be output in JSON format.</p>
                                </div>
                            </div>
                        </div>
                        
                        <div class="button-group">
                            <button id="saveGlobalSettings" class="primary-btn">
                                <i class="fas fa-save"></i> Save Settings
                            </button>
                            <button id="cancelGlobalSettings" class="secondary-btn">
                                <i class="fas fa-times"></i> Cancel
                            </button>
                        </div>
                    </div>
                \`;
                
                document.body.appendChild(modal);
                
                // Load certificates for the dropdown
                loadCertificatesForHttps();
                
                // Add event handlers
                setupGlobalSettingsEvents(modal, settings);
                setupTabSwitching(modal);
            })
            .catch(error => {
                console.error('Error loading global settings:', error);
                alert('Failed to load global settings. Please try again.');
            });
    }
    
    // Create settings button in header
    document.addEventListener('DOMContentLoaded', function() {
        const header = document.querySelector('header');
        if (header) {
            // Create admin menu if it doesn't exist
            let adminMenu = header.querySelector('.admin-menu');
            if (!adminMenu) {
                adminMenu = document.createElement('div');
                adminMenu.className = 'admin-menu';
                adminMenu.style.marginLeft = 'auto';
                adminMenu.style.display = 'flex';
                header.appendChild(adminMenu);
            }
            
            // Add settings button (replaces both previous buttons)
            const settingsBtn = document.createElement('button');
            settingsBtn.className = 'admin-button';
            settingsBtn.innerHTML = '<i class="fas fa-cog"></i> Settings';
            settingsBtn.addEventListener('click', showGlobalSettingsModal);
            adminMenu.appendChild(settingsBtn);
        }
    });
  `;
}

module.exports = getClientScript;