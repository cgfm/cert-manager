/**
 * Deployment Settings Module
 * Handles global settings for deployment actions like email, NPM, etc.
 */

let deploymentSettings = {
  email: {
    smtp: {}
  },
  nginxProxyManager: {},
  dockerDefaults: {}
};

// Initialize deployment settings
async function initDeploymentSettings() {
  Logger.debug('Initializing deployment settings');
  
  // Load settings from server
  await loadDeploymentSettings();
  
  // Set up event listeners
  setupDeploymentSettingsListeners();
  
  Logger.debug('Deployment settings initialized');
}

// Load deployment settings from the server
async function loadDeploymentSettings() {
  try {
    Logger.debug('Loading deployment settings from server');
    
    const response = await fetch('/api/settings/deployment');
    
    if (!response.ok) {
      throw new Error(`Failed to load deployment settings: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (data && data.deployment) {
      deploymentSettings = data.deployment;
      Logger.debug('Deployment settings loaded from server');
      
      // Populate form fields
      populateDeploymentSettingsForms();
    } else {
      Logger.warn('Received empty or invalid deployment settings from server');
    }
  } catch (error) {
    Logger.error('Error loading deployment settings:', error);
    UIUtils.showToast('Failed to load deployment settings', 'error');
  }
}

// Set up event listeners for the deployment settings modal
function setupDeploymentSettingsListeners() {
  // Tab switching
  const tabButtons = document.querySelectorAll('#deployment-settings-modal .tab-button');
  const tabContents = document.querySelectorAll('#deployment-settings-modal .tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all tabs
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked tab
      button.classList.add('active');
      
      // Show corresponding tab content
      const tabId = button.getAttribute('data-tab');
      document.querySelector(`#deployment-settings-modal .tab-content[data-tab="${tabId}"]`).classList.add('active');
    });
  });
  
  // Close modal buttons
  document.getElementById('close-deployment-settings-modal').addEventListener('click', () => {
    UIUtils.hideModal(document.getElementById('deployment-settings-modal'));
  });
  
  document.querySelector('#deployment-settings-modal .close').addEventListener('click', () => {
    UIUtils.hideModal(document.getElementById('deployment-settings-modal'));
  });
  
  // Form submissions
  document.getElementById('email-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveEmailSettings();
  });
  
  document.getElementById('npm-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveNpmSettings();
  });
  
  document.getElementById('docker-settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveDockerSettings();
  });
  
  // Test buttons
  document.getElementById('test-email-button').addEventListener('click', () => {
    document.getElementById('email-test-container').classList.toggle('hidden');
  });
  
  document.getElementById('send-test-email').addEventListener('click', async () => {
    await testEmailSettings();
  });
  
  document.getElementById('test-npm-button').addEventListener('click', async () => {
    await testNpmSettings();
  });
}

// Populate form fields with existing settings
function populateDeploymentSettingsForms() {
  // Email settings
  if (deploymentSettings.email && deploymentSettings.email.smtp) {
    const smtp = deploymentSettings.email.smtp;
    document.getElementById('smtp-host').value = smtp.host || '';
    document.getElementById('smtp-port').value = smtp.port || 587;
    document.getElementById('smtp-secure').checked = !!smtp.secure;
    document.getElementById('smtp-user').value = smtp.user || '';
    document.getElementById('smtp-password').value = smtp.password || '';
    document.getElementById('smtp-from').value = smtp.from || '';
  }
  
  // NPM settings
  if (deploymentSettings.nginxProxyManager) {
    const npm = deploymentSettings.nginxProxyManager;
    document.getElementById('npm-host').value = npm.host || '';
    document.getElementById('npm-port').value = npm.port || 81;
    document.getElementById('npm-https').checked = !!npm.useHttps;
    document.getElementById('npm-username').value = npm.username || '';
    document.getElementById('npm-password').value = npm.password || '';
  }
  
  // Docker settings
  if (deploymentSettings.dockerDefaults) {
    const docker = deploymentSettings.dockerDefaults;
    document.getElementById('docker-socket').value = docker.socketPath || '/var/run/docker.sock';
    document.getElementById('docker-host').value = docker.host || '';
    document.getElementById('docker-port').value = docker.port || 2375;
    document.getElementById('docker-tls').checked = !!docker.useTLS;
  }
}

// Save email settings
async function saveEmailSettings() {
  try {
    UIUtils.showToast('Saving email settings...', 'info');
    
    const smtp = {
      host: document.getElementById('smtp-host').value,
      port: parseInt(document.getElementById('smtp-port').value, 10),
      secure: document.getElementById('smtp-secure').checked,
      user: document.getElementById('smtp-user').value,
      password: document.getElementById('smtp-password').value,
      from: document.getElementById('smtp-from').value
    };
    
    const response = await fetch('/api/settings/deployment/email', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ smtp })
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || `Server returned ${response.status}`);
    }
    
    // Update local settings
    if (!deploymentSettings.email) deploymentSettings.email = {};
    deploymentSettings.email.smtp = smtp;
    
    UIUtils.showToast('Email settings saved successfully', 'success');
  } catch (error) {
    Logger.error('Error saving email settings:', error);
    UIUtils.showToast(`Failed to save email settings: ${error.message}`, 'error');
  }
}

// Save Nginx Proxy Manager settings
async function saveNpmSettings() {
  try {
    UIUtils.showToast('Saving Nginx Proxy Manager settings...', 'info');
    
    const npmSettings = {
      host: document.getElementById('npm-host').value,
      port: parseInt(document.getElementById('npm-port').value, 10),
      useHttps: document.getElementById('npm-https').checked,
      username: document.getElementById('npm-username').value,
      password: document.getElementById('npm-password').value,
      // Keep existing tokens if they exist
      accessToken: deploymentSettings.nginxProxyManager?.accessToken || '',
      refreshToken: deploymentSettings.nginxProxyManager?.refreshToken || '',
      tokenExpiry: deploymentSettings.nginxProxyManager?.tokenExpiry || null
    };
    
    const response = await fetch('/api/settings/deployment/nginx-proxy-manager', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(npmSettings)
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || `Server returned ${response.status}`);
    }
    
    // Update local settings
    deploymentSettings.nginxProxyManager = npmSettings;
    
    UIUtils.showToast('Nginx Proxy Manager settings saved successfully', 'success');
  } catch (error) {
    Logger.error('Error saving NPM settings:', error);
    UIUtils.showToast(`Failed to save NPM settings: ${error.message}`, 'error');
  }
}

// Save Docker settings
async function saveDockerSettings() {
  try {
    UIUtils.showToast('Saving Docker default settings...', 'info');
    
    // Prepare data from form
    const dockerSettings = {
      socketPath: document.getElementById('docker-socket').value,
      host: document.getElementById('docker-host').value,
      port: parseInt(document.getElementById('docker-port').value, 10),
      useTLS: document.getElementById('docker-tls').checked
    };
    
    const response = await fetch('/api/settings/deployment/docker', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dockerSettings)
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.message || `Server returned ${response.status}`);
    }
    
    // Update local settings
    deploymentSettings.dockerDefaults = dockerSettings;
    
    UIUtils.showToast('Docker default settings saved successfully', 'success');
  } catch (error) {
    Logger.error('Error saving Docker settings:', error);
    UIUtils.showToast(`Failed to save Docker settings: ${error.message}`, 'error');
  }
}

// Test email settings
async function testEmailSettings() {
  try {
    const recipient = document.getElementById('test-email-recipient').value.trim();
    
    if (!recipient) {
      UIUtils.showToast('Please enter a recipient email address', 'error');
      return;
    }
    
    UIUtils.showToast('Sending test email...', 'info');
    
    // Use the current form values, not saved settings
    const smtp = {
      host: document.getElementById('smtp-host').value,
      port: parseInt(document.getElementById('smtp-port').value, 10),
      secure: document.getElementById('smtp-secure').checked,
      user: document.getElementById('smtp-user').value,
      password: document.getElementById('smtp-password').value,
      from: document.getElementById('smtp-from').value
    };
    
    const response = await fetch('/api/settings/deployment/email/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ smtp, recipient })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `Server returned ${response.status}`);
    }
    
    UIUtils.showToast(`Test email sent to ${recipient}`, 'success');
  } catch (error) {
    Logger.error('Error testing email settings:', error);
    UIUtils.showToast(`Failed to send test email: ${error.message}`, 'error');
  }
}

// Test NPM settings
async function testNpmSettings() {
  try {
    UIUtils.showToast('Testing Nginx Proxy Manager connection...', 'info');
    
    // Use the current form values, not saved settings
    const npmSettings = {
      host: document.getElementById('npm-host').value,
      port: parseInt(document.getElementById('npm-port').value, 10),
      useHttps: document.getElementById('npm-https').checked,
      username: document.getElementById('npm-username').value,
      password: document.getElementById('npm-password').value,
      // Keep existing tokens if they exist
      accessToken: deploymentSettings.nginxProxyManager?.accessToken || '',
      refreshToken: deploymentSettings.nginxProxyManager?.refreshToken || '',
      tokenExpiry: deploymentSettings.nginxProxyManager?.tokenExpiry || null
    };
    
    const response = await fetch('/api/settings/deployment/nginx-proxy-manager/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(npmSettings)
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `Server returned ${response.status}`);
    }
    
    UIUtils.showToast(`Successfully connected to NPM. Found ${data.certificates} certificates.`, 'success');
  } catch (error) {
    Logger.error('Error testing NPM settings:', error);
    UIUtils.showToast(`Failed to connect to NPM: ${error.message}`, 'error');
  }
}

// Show deployment settings modal
function showDeploymentSettingsModal() {
  // First load the latest settings
  loadDeploymentSettings().then(() => {
    // Then show the modal
    UIUtils.showModal(document.getElementById('deployment-settings-modal'));
  });
}

// Export functions
window.showDeploymentSettingsModal = showDeploymentSettingsModal;
window.initDeploymentSettings = initDeploymentSettings;