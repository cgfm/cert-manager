/**
 * Certificate Manager - Settings UI
 * Manages settings panel navigation and form handling
 */

/**
 * Initialize settings UI components
 */
function setupSettingsUI() {
    // Settings panel navigation
    const settingsTabs = document.querySelectorAll('.settings-sidebar a');
    settingsTabs.forEach(tab => {
        tab.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Update active tab
            settingsTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Show corresponding panel
            const targetId = this.getAttribute('href').replace('#', '');
            document.querySelectorAll('.settings-panel').forEach(panel => {
                panel.classList.remove('active');
            });
            document.getElementById(targetId)?.classList.add('active');
        });
    });
    
    // Toggle HTTPS settings visibility
    document.getElementById('enable-https')?.addEventListener('change', function() {
        const httpsFields = document.querySelectorAll('.https-settings');
        httpsFields.forEach(field => {
            field.style.display = this.checked ? 'block' : 'none';
        });
    });
    
    // Toggle backup retention field visibility
    document.getElementById('keep-backups')?.addEventListener('change', function() {
        const retentionGroup = document.getElementById('backup-retention-group');
        if (retentionGroup) {
            retentionGroup.style.display = this.checked ? 'none' : 'block';
        }
    });
    
    // Setup form submission handlers
    document.getElementById('general-settings-form')?.addEventListener('submit', saveGeneralSettings);
    document.getElementById('security-settings-form')?.addEventListener('submit', saveSecuritySettings);
    document.getElementById('renewal-settings-form')?.addEventListener('submit', saveRenewalSettings);
    document.getElementById('backup-settings-form')?.addEventListener('submit', saveBackupSettings);
    
    // Setup directory browse buttons
    document.querySelectorAll('.browse-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const targetInput = this.getAttribute('data-target');
            openFileBrowser(targetInput);
        });
    });
}

/**
 * Apply settings loaded from the API to the UI
 * @param {Object} settings - Settings object from API
 */
function applySettingsToUI(settings) {
    // General settings
    document.getElementById('cert-path').value = settings.certPath || '';
    document.getElementById('log-level').value = settings.logLevel || 'info';
    document.getElementById('openssl-path').value = settings.openSSLPath || '';
    
    // Security settings
    document.getElementById('enable-https').checked = settings.enableHttps || false;
    document.getElementById('https-port').value = settings.httpsPort || 4443;
    document.getElementById('https-cert').value = settings.httpsCertPath || '';
    document.getElementById('https-key').value = settings.httpsKeyPath || '';
    
    // Update HTTPS fields visibility
    const httpsFields = document.querySelectorAll('.https-settings');
    httpsFields.forEach(field => {
        field.style.display = settings.enableHttps ? 'block' : 'none';
    });
    
    // Renewal settings
    document.getElementById('enable-auto-renewal').checked = settings.enableAutoRenewalJob || false;
    document.getElementById('renewal-schedule').value = settings.renewalSchedule || '0 0 * * *';
    document.getElementById('renew-days').value = settings.renewDaysBeforeExpiry || 30;
    document.getElementById('enable-file-watch').checked = settings.enableFileWatch || false;
    
    // Backup settings
    document.getElementById('enable-backups').checked = settings.enableCertificateBackups || false;
    document.getElementById('keep-backups').checked = settings.keepBackupsForever || false;
    document.getElementById('backup-retention').value = settings.backupRetention || 30;
    
    // Update backup retention field visibility
    const retentionGroup = document.getElementById('backup-retention-group');
    if (retentionGroup) {
        retentionGroup.style.display = settings.keepBackupsForever ? 'none' : 'block';
    }
}

/**
 * Save general settings
 * @param {Event} e - Form submit event
 */
async function saveGeneralSettings(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const data = {};
    
    for (const [key, value] of formData.entries()) {
        data[key] = value;
    }
    
    try {
        UIUtils.showNotification('Saving general settings...', 'info');
        
        const response = await fetch('/api/settings/general', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to save settings: ${errorText}`);
        }
        
        UIUtils.showNotification('General settings saved successfully', 'success');
        
        // Update global settings
        await loadSettings();
    } catch (error) {
        UIUtils.showError(error.message);
    }
}

/**
 * Save security settings
 * @param {Event} e - Form submit event
 */
async function saveSecuritySettings(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const data = {
        enableHttps: formData.get('enableHttps') === 'on',
        httpsPort: parseInt(formData.get('httpsPort') || '4443'),
        httpsCertPath: formData.get('httpsCertPath') || '',
        httpsKeyPath: formData.get('httpsKeyPath') || ''
    };
    
    // Validation
    if (data.enableHttps) {
        if (!data.httpsCertPath) {
            UIUtils.showError('HTTPS certificate path is required');
            return;
        }
        
        if (!data.httpsKeyPath) {
            UIUtils.showError('HTTPS key path is required');
            return;
        }
    }
    
    try {
        UIUtils.showNotification('Saving security settings...', 'info');
        
        const response = await fetch('/api/settings/security', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to save settings: ${errorText}`);
        }
        
        UIUtils.showNotification('Security settings saved successfully', 'success');
        
        // Show restart warning if HTTPS was enabled or disabled
        if (data.enableHttps !== state.settings.enableHttps) {
            UIUtils.showNotification('Server restart required for HTTPS changes to take effect', 'warning', 8000);
        }
        
        // Update global settings
        await loadSettings();
    } catch (error) {
        UIUtils.showError(error.message);
    }
}

/**
 * Save auto-renewal settings
 * @param {Event} e - Form submit event
 */
async function saveRenewalSettings(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const data = {
        enableAutoRenewalJob: formData.get('enableAutoRenewalJob') === 'on',
        renewalSchedule: formData.get('renewalSchedule') || '0 0 * * *',
        renewDaysBeforeExpiry: parseInt(formData.get('renewDaysBeforeExpiry') || '30'),
        enableFileWatch: formData.get('enableFileWatch') === 'on'
    };
    
    // Validation
    if (data.enableAutoRenewalJob && !data.renewalSchedule) {
        UIUtils.showError('Renewal schedule is required when auto-renewal is enabled');
        return;
    }
    
    try {
        UIUtils.showNotification('Saving renewal settings...', 'info');
        
        const response = await fetch('/api/settings/renewal', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to save settings: ${errorText}`);
        }
        
        UIUtils.showNotification('Renewal settings saved successfully', 'success');
        
        // Update global settings
        await loadSettings();
    } catch (error) {
        UIUtils.showError(error.message);
    }
}

/**
 * Save backup settings
 * @param {Event} e - Form submit event
 */
async function saveBackupSettings(e) {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    const data = {
        enableCertificateBackups: formData.get('enableCertificateBackups') === 'on',
        keepBackupsForever: formData.get('keepBackupsForever') === 'on',
        backupRetention: parseInt(formData.get('backupRetention') || '30')
    };
    
    try {
        UIUtils.showNotification('Saving backup settings...', 'info');
        
        const response = await fetch('/api/settings/backup', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to save settings: ${errorText}`);
        }
        
        UIUtils.showNotification('Backup settings saved successfully', 'success');
        
        // Update global settings
        await loadSettings();
    } catch (error) {
        UIUtils.showError(error.message);
    }
}

/**
 * Open the file browser to select a path
 * @param {string} targetInputId - ID of the input to receive the selected path
 */
function openFileBrowser(targetInputId) {
    // Initialize the file browser with current path
    const currentPath = document.getElementById(targetInputId).value || '';
    initializeFileBrowser(currentPath, (selectedPath) => {
        document.getElementById(targetInputId).value = selectedPath;
    });
}

/**
 * Load available storage locations
 */
async function loadStorageLocations() {
  try {
    const response = await fetch('/api/settings/storage-locations');
    if (!response.ok) {
      throw new Error(`Failed to load storage locations: ${response.status}`);
    }
    
    const locations = await response.json();
    const locationSelect = document.getElementById('cert-storage-location');
    
    // Clear previous options
    locationSelect.innerHTML = '';
    
    // Create default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Select location...';
    locationSelect.appendChild(defaultOption);
    
    // Add each location as an option
    locations.forEach(location => {
      const option = document.createElement('option');
      option.value = location.path;
      option.textContent = location.name;
      locationSelect.appendChild(option);
    });
  } catch (error) {
    document.getElementById('storage-locations-container').innerHTML = UIUtils.safeTemplate(`
      <div class="error-message">
        <p>Failed to load storage locations: \${errorMessage}</p>
        <button class="button" onclick="loadStorageLocations()">Retry</button>
      </div>
    `, {
      errorMessage: UIUtils.sanitizeErrorMessage(error)
    });
  }
}

/**
 * Render available ACME servers
 */
function renderAcmeServers(servers) {
  const container = document.getElementById('acme-servers-list');
  
  if (!servers || servers.length === 0) {
    container.innerHTML = UIUtils.safeTemplate(`
      <p class="empty-message">No ACME servers configured</p>
    `, {});
    return;
  }
  
  // Create HTML for each server
  const serversHtml = servers.map((server, index) => {
    return UIUtils.safeTemplate(`
      <div class="acme-server-item" data-index="\${index|attr}">
        <div class="acme-server-info">
          <h4>\${name}</h4>
          <div class="acme-server-url">\${url}</div>
          <div class="acme-server-description">\${description}</div>
        </div>
        <div class="acme-server-actions">
          <button class="button small edit-server-btn" data-index="\${index|attr}">Edit</button>
          <button class="button small danger remove-server-btn" data-index="\${index|attr}">Remove</button>
        </div>
      </div>
    `, {
      index,
      name: server.name,
      url: server.url,
      description: server.description || 'No description'
    });
  }).join('');
  
  container.innerHTML = serversHtml;
  
  // Add event listeners
  document.querySelectorAll('.edit-server-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'));
      editAcmeServer(servers[index]);
    });
  });
  
  document.querySelectorAll('.remove-server-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const index = parseInt(this.getAttribute('data-index'));
      removeAcmeServer(index);
    });
  });
}

// Export functions to global scope
window.setupSettingsUI = setupSettingsUI;
window.applySettingsToUI = applySettingsToUI;