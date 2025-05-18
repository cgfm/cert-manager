/**
 * Certificate Manager - Settings UI
 * Manages settings panel navigation and form handling
 */

/**
 * Initialize settings UI components
 */
function setupSettingsUI() {
    console.log('Setting up settings UI...'); // Debug

    // Settings panel navigation
    const settingsTabs = document.querySelectorAll('.settings-sidebar a');
    console.log('Found settings tabs:', settingsTabs.length); // Debug

    settingsTabs.forEach(tab => {
        // Remove any previous event listeners to avoid duplicates
        const newTab = tab.cloneNode(true);
        tab.parentNode.replaceChild(newTab, tab);

        newTab.addEventListener('click', function (e) {
            e.preventDefault();
            console.log('Settings tab clicked:', this.getAttribute('data-panel')); // Debug

            // Update active tab
            document.querySelectorAll('.settings-sidebar a').forEach(t => t.classList.remove('active'));
            this.classList.add('active');

            // Get target panel ID from data attribute
            const targetId = this.getAttribute('data-panel');

            // Hide all panels
            document.querySelectorAll('.settings-panel').forEach(panel => {
                panel.classList.remove('active');
            });

            // Find and activate the target panel
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.classList.add('active');
                console.log('Activated panel:', targetId); // Debug
            } else {
                console.error(`Settings panel with ID "${targetId}" not found`);
            }
        });
    });

    // Toggle HTTPS settings visibility
    document.getElementById('enable-https')?.addEventListener('change', function () {
        const httpsFields = document.querySelectorAll('.https-settings');
        httpsFields.forEach(field => {
            field.style.display = this.checked ? 'block' : 'none';
        });
    });

    // Toggle backup retention field visibility
    document.getElementById('keep-backups')?.addEventListener('change', function () {
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
        btn.addEventListener('click', function () {
            const targetInput = this.getAttribute('data-target');
            openFileBrowser(targetInput);
        });
    });

    setupDeploymentSettingsUI();
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
    document.getElementById('include-idle-domains').checked = settings.includeIdleDomainsOnRenewal !== false;

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
        UIUtils.showToast('Saving general settings...', 'info');

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

        UIUtils.showToast('General settings saved successfully', 'success');

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
        UIUtils.showToast('Saving security settings...', 'info');

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

        UIUtils.showToast('Security settings saved successfully', 'success');

        // Show restart warning if HTTPS was enabled or disabled
        if (data.enableHttps !== state.settings.enableHttps) {
            UIUtils.showToast('Server restart required for HTTPS changes to take effect', 'warning', 8000);
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
        enableFileWatch: formData.get('enableFileWatch') === 'on',
        includeIdleDomainsOnRenewal: formData.get('includeIdleDomainsOnRenewal') === 'on'
    };

    // Validation
    if (data.enableAutoRenewalJob && !data.renewalSchedule) {
        UIUtils.showError('Renewal schedule is required when auto-renewal is enabled');
        return;
    }

    try {
        UIUtils.showToast('Saving renewal settings...', 'info');

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

        UIUtils.showToast('Renewal settings saved successfully', 'success');

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
        UIUtils.showToast('Saving backup settings...', 'info');

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

        UIUtils.showToast('Backup settings saved successfully', 'success');

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
        btn.addEventListener('click', function () {
            const index = parseInt(this.getAttribute('data-index'));
            editAcmeServer(servers[index]);
        });
    });

    document.querySelectorAll('.remove-server-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const index = parseInt(this.getAttribute('data-index'));
            removeAcmeServer(index);
        });
    });
}
// Add this code to the end of your settings-ui.js file

/**
 * Load deployment settings from the API
 * @returns {Promise<Object>} Deployment settings
 */
async function loadDeploymentSettings() {
    try {
        const response = await fetch('/api/settings/deployment');
        if (!response.ok) {
            throw new Error(`Failed to load deployment settings: ${response.status}`);
        }

        const settings = await response.json();
        return settings;
    } catch (error) {
        Logger.error('Error loading deployment settings:', error);
        UIUtils.showToast(`Failed to load deployment settings: ${error.message}`, 'error');
        return null;
    }
}

/**
 * Apply deployment settings to the UI
 * @param {Object} settings - Deployment settings object
 */
function applyDeploymentSettingsToUI(settings) {
    // Debug the settings structure
    console.log('Deployment settings received:', settings);

    // Safely check if settings object exists and has deployment property
    if (!settings) {
        console.warn('No settings provided to applyDeploymentSettingsToUI');
        return;
    }

    // Handle possibly missing deployment section
    const deployment = settings?.deployment || {};

    // Email SMTP settings - safely handle with optional chaining and defaults
    const smtp = deployment.email?.smtp || {};

    // Use optional chaining and null checks for all field assignments
    safeSetValue('smtp-host', smtp.host || '');
    safeSetValue('smtp-port', smtp.port || '587');
    safeSetValue('smtp-secure', !!smtp.secure, 'checkbox');
    safeSetValue('smtp-user', smtp.user || '');
    safeSetValue('smtp-password', smtp.password || '');
    safeSetValue('smtp-from', smtp.from || '');

    // Nginx Proxy Manager settings
    const npmSettings = deployment.nginxProxyManager || {};

    safeSetValue('npm-host', npmSettings.host || '');
    safeSetValue('npm-port', npmSettings.port || '81');
    safeSetValue('npm-https', !!npmSettings.useHttps, 'checkbox');
    safeSetValue('npm-username', npmSettings.username || '');
    safeSetValue('npm-password', npmSettings.password || '');
    if (document.getElementById('npm-reject-unauthorized')) {
        document.getElementById('npm-reject-unauthorized').checked = npmSettings.rejectUnauthorized !== false;
    }

    // Docker defaults
    const docker = deployment.dockerDefaults || {};
    safeSetValue('docker-socket', docker.socketPath || '/var/run/docker.sock');
    safeSetValue('docker-host', docker.host || '');
    safeSetValue('docker-port', docker.port || '2375');
    safeSetValue('docker-tls', !!docker.useTLS, 'checkbox');
}

// Helper function to safely add event listeners only once
function addSafeEventListener(elementId, eventType, handler) {
    const element = document.getElementById(elementId);
    if (!element) return;

    // Store a unique identifier for this handler on the element
    const handlerId = `${elementId}_${eventType}_handler`;

    // If we already attached this handler, remove it first
    if (element[handlerId]) {
        element.removeEventListener(eventType, element[handlerId]);
    }

    // Store the handler reference and add it
    element[handlerId] = handler;
    element.addEventListener(eventType, handler);

    Logger.debug(`Event handler ${eventType} attached to ${elementId}`, null);
}

/**
 * Setup deployment settings UI
 */
function setupDeploymentSettingsUI() {
    Logger.debug('Initializing deployment settings UI', null);
    // Tab switching
    const tabButtons = document.querySelectorAll('.settings-tab-button');

    tabButtons.forEach(button => {
        // Clear any existing click handlers
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);

        newButton.addEventListener('click', function () {
            const tabId = this.getAttribute('data-tab');

            // Deactivate all tabs
            document.querySelectorAll('.settings-tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.settings-tab-content').forEach(content => content.classList.remove('active'));

            // Activate clicked tab
            this.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        });
    });

    // Email settings form
    addSafeEventListener('email-settings-form', 'submit', async function (e) {
        e.preventDefault();
        Logger.debug('Email settings form submitted');

        const formData = new FormData(this);
        const smtp = {
            host: formData.get('host'),
            port: parseInt(formData.get('port')),
            secure: formData.get('secure') === 'on',
            user: formData.get('user'),
            password: formData.get('password'),
            from: formData.get('from')
        };

        try {
            UIUtils.showToast('Saving SMTP settings...', 'info');

            const response = await fetch('/api/settings/deployment/email', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ smtp })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || `Error: ${response.status}`);
            }

            UIUtils.showToast('SMTP settings saved successfully', 'success');
        } catch (error) {
            UIUtils.showToast(`Failed to save SMTP settings: ${error.message}`, 'error');
        }
    });

    // Test email button
    addSafeEventListener('test-email-btn', 'click', function (e) {
        e.preventDefault();
        Logger.debug('Test email button clicked');
        document.getElementById('test-email-form').classList.remove('hidden');
    });

    // Cancel test email button
    addSafeEventListener('cancel-test-email-btn', 'click', function (e) {
        e.preventDefault();
        document.getElementById('test-email-form').classList.add('hidden');
    });

    // Send test email button
    addSafeEventListener('send-test-email-btn', 'click', async function (e) {
        e.preventDefault();
        Logger.debug('Send test email button clicked');
        const recipient = document.getElementById('test-email-recipient').value;

        if (!recipient) {
            UIUtils.showToast('Please enter a recipient email address', 'error');
            return;
        }

        try {
            UIUtils.showToast('Sending test email...', 'info');

            // Get form values
            const formData = new FormData(document.getElementById('email-settings-form'));
            const smtp = {
                host: formData.get('host'),
                port: parseInt(formData.get('port')),
                secure: formData.get('secure') === 'on',
                user: formData.get('user'),
                password: formData.get('password'),
                from: formData.get('from')
            };

            const response = await fetch('/api/settings/deployment/email/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ smtp, recipient })
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || `Error: ${response.status}`);
            }

            UIUtils.showToast(`Test email sent to ${recipient}`, 'success');
            document.getElementById('test-email-form').classList.add('hidden');
        } catch (error) {
            UIUtils.showToast(`Failed to send test email: ${error.message}`, 'error');
        }
    });

    // Nginx Proxy Manager settings form
    addSafeEventListener('nginx-settings-form', 'submit', async function (e) {
        e.preventDefault();
        Logger.debug('NPM settings form submitted');

        const formData = new FormData(this);
        const npmSettings = {
            host: formData.get('host'),
            port: parseInt(formData.get('port')),
            useHttps: formData.get('useHttps') === 'on',
            rejectUnauthorized: formData.get('rejectUnauthorized') === 'on',
            username: formData.get('username'),
            password: formData.get('password')
        };

        // Add the option for rejecting unauthorized certificates if it exists
        if (document.getElementById('npm-reject-unauthorized')) {
            npmSettings.rejectUnauthorized = formData.get('rejectUnauthorized') === 'on';
        }

        try {
            UIUtils.showToast('Saving Nginx Proxy Manager settings...', 'info');

            const response = await fetch('/api/settings/deployment/nginx-proxy-manager', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(npmSettings)
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || `Error: ${response.status}`);
            }

            UIUtils.showToast('Nginx Proxy Manager settings saved successfully', 'success');
        } catch (error) {
            UIUtils.showToast(`Failed to save Nginx Proxy Manager settings: ${error.message}`, 'error');
        }
    });

    // Test NPM connection button
    addSafeEventListener('test-npm-btn', 'click', async function (e) {
        e.preventDefault();
        Logger.debug('Test NPM button clicked');
        try {
            UIUtils.showToast('Testing Nginx Proxy Manager connection...', 'info');

            // Get form values
            const formData = new FormData(document.getElementById('nginx-settings-form'));
            const npmSettings = {
                host: formData.get('host'),
                port: parseInt(formData.get('port')),
                useHttps: formData.get('useHttps') === 'on',
                username: formData.get('username'),
                password: formData.get('password')
            };

            // Add the option for rejecting unauthorized certificates if it exists
            if (document.getElementById('npm-reject-unauthorized')) {
                npmSettings.rejectUnauthorized = formData.get('rejectUnauthorized') === 'on';
            }

            const response = await fetch('/api/settings/deployment/nginx-proxy-manager/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(npmSettings)
            });

            const data = await response.json();

            if (!response.ok || !data.success) {
                throw new Error(data.message || `Error: ${response.status}`);
            }

            UIUtils.showToast(`Connection successful! Found ${data.certificates} certificates.`, 'success');
        } catch (error) {
            UIUtils.showToast(`Connection failed: ${error.message}`, 'error');
        }
    });

    // Docker settings form
    addSafeEventListener('docker-settings-form', 'submit', async function (e) {
        e.preventDefault();
        saveDeploySettingsCategory('dockerDefaults', this);
    });

    // Load initial deployment settings
    loadDeploymentSettings().then(settings => {
        if (settings) {
            applyDeploymentSettingsToUI(settings);
        }
    });
}

/**
 * Save a deployment settings category
 * @param {string} category - Category name
 * @param {HTMLFormElement} form - Form element
 */
async function saveDeploySettingsCategory(category, form) {
    try {
        const formData = new FormData(form);
        const settings = {};

        // Convert form data to an object
        for (const [key, value] of formData.entries()) {
            if (key.endsWith('port')) {
                settings[key] = parseInt(value);
            } else if (value === 'on') {
                settings[key] = true;
            } else if (value === 'off') {
                settings[key] = false;
            } else {
                settings[key] = value;
            }
        }

        UIUtils.showToast(`Saving ${category} settings...`, 'info');

        // Get current settings first
        const currentSettings = await loadDeploymentSettings();

        if (!currentSettings.deployment) {
            currentSettings.deployment = {};
        }

        // Update just this category
        currentSettings.deployment[category] = settings;

        // Save all settings
        const response = await fetch('/api/settings/deployment', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(currentSettings)
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.message || `Error: ${response.status}`);
        }

        UIUtils.showToast(`${category} settings saved successfully`, 'success');
    } catch (error) {
        UIUtils.showToast(`Failed to save ${category} settings: ${error.message}`, 'error');
    }
}

/**
 * Safely set a value on a DOM element
 * @param {string} id - DOM element ID
 * @param {string} value - Value to set
 * @param {string} type - Type of element (input, checkbox)
 */
function safeSetValue(id, value, type = 'input') {
    const element = document.getElementById(id);
    if (!element) return;

    if (type === 'checkbox') {
        element.checked = !!value;
    } else {
        element.value = value || '';
    }
}

// Export functions to global scope
window.setupSettingsUI = setupSettingsUI;
window.applySettingsToUI = applySettingsToUI;