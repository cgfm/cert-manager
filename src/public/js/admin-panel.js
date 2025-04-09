// Add this function to display and manage HTTPS settings

function showHttpsConfigModal() {
    // First fetch global settings
    fetch('/api/settings/global')
        .then(response => response.json())
        .then(settings => {
            const modal = document.createElement('div');
            modal.className = 'modal';
            modal.innerHTML = `
                <div class="modal-content">
                    <span class="close">&times;</span>
                    <h2><i class="fas fa-shield-alt"></i> HTTPS Configuration</h2>
                    
                    <div class="form-section">
                        <div class="form-group">
                            <label for="enableHttps">
                                <input type="checkbox" id="enableHttps" 
                                    ${settings.enableHttps ? 'checked' : ''}>
                                Enable HTTPS
                            </label>
                            <p class="form-help">When enabled, the application will be accessible via HTTPS.</p>
                        </div>
                        
                        <div class="form-group">
                            <label for="httpsPort">HTTPS Port:</label>
                            <input type="number" id="httpsPort" value="${settings.httpsPort || 4443}" min="1" max="65535">
                            <p class="form-help">The port to use for HTTPS access (default: 4443)</p>
                        </div>
                    </div>
                    
                    <div class="form-section">
                        <h3>Certificate Selection</h3>
                        
                        <div class="form-group">
                            <label for="certSource">Certificate Source:</label>
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
                                <label for="managedCertName">Select Certificate:</label>
                                <select id="managedCertName">
                                    <option value="">Loading certificates...</option>
                                </select>
                                <p class="form-help">Choose one of your managed certificates to secure this UI</p>
                            </div>
                        </div>
                        
                        <div id="customCertSection" class="form-subsection"
                            style="${settings.httpsCertPath ? '' : 'display: none;'}">
                            <div class="form-group">
                                <label for="httpsCertPath">Certificate Path:</label>
                                <input type="text" id="httpsCertPath" value="${settings.httpsCertPath || ''}">
                                <button id="browseCertBtn" class="browse-btn"><i class="fas fa-folder-open"></i></button>
                                <p class="form-help">Full path to the certificate file (.crt/.pem)</p>
                            </div>
                            
                            <div class="form-group">
                                <label for="httpsKeyPath">Private Key Path:</label>
                                <input type="text" id="httpsKeyPath" value="${settings.httpsKeyPath || ''}">
                                <button id="browseKeyBtn" class="browse-btn"><i class="fas fa-folder-open"></i></button>
                                <p class="form-help">Full path to the private key file (.key)</p>
                            </div>
                        </div>
                    </div>
                    
                    <div class="button-group">
                        <button id="saveHttpsConfig" class="primary-btn">
                            <i class="fas fa-save"></i> Save Configuration
                        </button>
                        <button id="cancelHttpsConfig" class="secondary-btn">
                            <i class="fas fa-times"></i> Cancel
                        </button>
                    </div>
                    
                    <div class="info-box warning-box">
                        <i class="fas fa-exclamation-triangle"></i>
                        <p><strong>Note:</strong> After changing HTTPS settings, the server will need to be restarted 
                        for changes to take effect.</p>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Load certificates for the dropdown
            loadCertificatesForHttps();
            
            // Add event handlers
            setupHttpsConfigEvents(modal, settings);
        })
        .catch(error => {
            console.error('Error loading HTTPS settings:', error);
            alert('Failed to load HTTPS configuration. Please try again.');
        });
}

function loadCertificatesForHttps() {
    // Fetch all certificates for the dropdown
    fetch('/api/certificates')
        .then(response => response.json())
        .then(certificates => {
            const select = document.getElementById('managedCertName');
            
            select.innerHTML = `<option value="">Select a certificate...</option>`;
            
            certificates.forEach(cert => {
                // Only add certificates that have both path and keyPath
                if (cert.path && cert.keyPath) {
                    const option = document.createElement('option');
                    option.value = cert.name;
                    option.textContent = cert.name;
                    select.appendChild(option);
                }
            });
        })
        .catch(error => {
            console.error('Error loading certificates:', error);
            document.getElementById('managedCertName').innerHTML = 
                `<option value="">Error loading certificates</option>`;
        });
}

function setupHttpsConfigEvents(modal, settings) {
    // Close button
    modal.querySelector('.close').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Cancel button
    modal.querySelector('#cancelHttpsConfig').addEventListener('click', () => {
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
    
    // Save configuration
    modal.querySelector('#saveHttpsConfig').addEventListener('click', () => {
        const enableHttps = document.getElementById('enableHttps').checked;
        const httpsPort = parseInt(document.getElementById('httpsPort').value);
        const certSource = document.getElementById('certSource').value;
        
        let httpsCertPath = '';
        let httpsKeyPath = '';
        let managedCertName = '';
        
        if (certSource === 'managed') {
            managedCertName = document.getElementById('managedCertName').value;
            
            if (enableHttps && !managedCertName) {
                alert('Please select a certificate for HTTPS.');
                return;
            }
        } else {
            httpsCertPath = document.getElementById('httpsCertPath').value;
            httpsKeyPath = document.getElementById('httpsKeyPath').value;
            
            if (enableHttps && (!httpsCertPath || !httpsKeyPath)) {
                alert('Please specify both certificate and key paths for HTTPS.');
                return;
            }
        }
        
        // Update global settings
        const updatedSettings = {
            ...settings,
            enableHttps,
            httpsPort,
            httpsCertPath: certSource === 'custom' ? httpsCertPath : '',
            httpsKeyPath: certSource === 'custom' ? httpsKeyPath : '',
            managedCertName: certSource === 'managed' ? managedCertName : ''
        };
        
        // Save settings
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
                alert('HTTPS configuration saved. Please restart the server for changes to take effect.');
                document.body.removeChild(modal);
            } else {
                alert(`Failed to save configuration: ${result.error}`);
            }
        })
        .catch(error => {
            console.error('Error saving HTTPS configuration:', error);
            alert('Failed to save configuration. Please try again.');
        });
    });
}

function browseFilesystem(inputId, fileExtensions) {
    // Create a filesystem browser modal
    // This is a placeholder - you would implement the actual filesystem browser
    // that calls your existing API for browsing the filesystem
    fetch('/api/filesystem/browse')
        .then(response => response.json())
        .then(files => {
            // Show a file browser and when a file is selected,
            // set the input value
            const selectedFile = ''; // Result from file browser
            document.getElementById(inputId).value = selectedFile;
        })
        .catch(error => {
            console.error('Error browsing filesystem:', error);
            alert('Failed to browse filesystem. Please enter the path manually.');
        });
}