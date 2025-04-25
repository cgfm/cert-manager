/**
 * Deployment Actions functionality
 */

// Store containers once loaded
let dockerContainers = [];

/**
 * Initialize deployment action form
 * @param {Object} [existingAction] - Existing action for edit mode
 */
function initializeDeployActionForm(existingAction = null) {
  const isEditing = !!existingAction;
  const actionTypeSelect = document.getElementById('deployment-action-type');
  if (actionTypeSelect) {
    actionTypeSelect.addEventListener('change', updateActionOptions);
    
  
    // Set form title based on mode
    document.querySelector('.modal-title').textContent = 
      isEditing ? 'Edit Deployment Action' : 'Add Deployment Action';
    
    // Fill form with existing data if in edit mode
    if (isEditing) {
      document.getElementById('deployment-action-name').value = existingAction.name || '';
      actionTypeSelect.value = existingAction.type || '';
    }
    
    // Handle action type selection change
    
    actionTypeSelect.addEventListener('change', () => {
      const selectedType = actionTypeSelect.value;
      hideAllActionOptions();
      
      if (selectedType) {
        showActionOptions(selectedType);
        
        // Load Docker containers if needed
        if (selectedType === 'docker-restart') {
          loadDockerContainers();
        }
      }
    });
    
    // Handle Docker container selection change
    const containerSelect = document.getElementById('docker-container-select');
    const containerCustom = document.getElementById('docker-container-custom');
    
    containerSelect.addEventListener('change', () => {
      if (containerSelect.value) {
        containerCustom.value = ''; // Clear custom input when selection is made
      }
    });
    
    containerCustom.addEventListener('input', () => {
      if (containerCustom.value) {
        containerSelect.value = ''; // Clear dropdown when custom input is used
      }
    });
    
    // Handle NPM method radio change
    const npmMethodRadios = document.querySelectorAll('input[name="npm-method"]');
    npmMethodRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        const isPathMethod = document.getElementById('npm-method-path').checked;
        document.getElementById('npm-path-group').classList.toggle('hidden', !isPathMethod);
        document.getElementById('npm-docker-group').classList.toggle('hidden', isPathMethod);
      });
    });
    
    // Handle SSH auth method radio change
    const sshAuthRadios = document.querySelectorAll('input[name="ssh-auth"]');
    sshAuthRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        const isPasswordAuth = document.getElementById('ssh-auth-password').checked;
        document.getElementById('ssh-password-group').classList.toggle('hidden', !isPasswordAuth);
        document.getElementById('ssh-key-group').classList.toggle('hidden', isPasswordAuth);
      });
    });
    
    // Fill form with existing data if in edit mode
    if (isEditing) {
      // Set values for appropriate action type
      switch (existingAction.type) {
        case 'docker-restart':
          if (existingAction.containerId) {
            document.getElementById('docker-container-custom').value = existingAction.containerId;
          } else if (existingAction.containerName) {
            // Will be set when containers are loaded
            document.getElementById('docker-container-custom').value = existingAction.containerName;
          }
          break;
        
        case 'copy':
          document.getElementById('copy-source').value = existingAction.source || 'cert';
          document.getElementById('copy-destination').value = existingAction.destination || '';
          if (existingAction.permissions) {
            document.getElementById('copy-permissions').value = existingAction.permissions.toString(8);
          }
          break;
        
        case 'command':
          document.getElementById('command-command').value = existingAction.command || '';
          document.getElementById('command-cwd').value = existingAction.cwd || '';
          document.getElementById('command-verbose').checked = !!existingAction.verbose;
          break;
          
        case 'nginx-proxy-manager':
          if (existingAction.npmPath) {
            document.getElementById('npm-method-path').checked = true;
            document.getElementById('npm-path').value = existingAction.npmPath;
          } else if (existingAction.dockerContainer) {
            document.getElementById('npm-method-docker').checked = true;
            document.getElementById('npm-docker-container').value = existingAction.dockerContainer;
            // Show docker container field, hide path field
            document.getElementById('npm-path-group').classList.add('hidden');
            document.getElementById('npm-docker-group').classList.remove('hidden');
          }
          break;
          
        case 'ssh-copy':
          document.getElementById('ssh-host').value = existingAction.host || '';
          document.getElementById('ssh-port').value = existingAction.port || 22;
          document.getElementById('ssh-username').value = existingAction.username || '';
          document.getElementById('ssh-source').value = existingAction.source || 'cert';
          document.getElementById('ssh-destination').value = existingAction.destination || '';
          
          if (existingAction.password) {
            document.getElementById('ssh-auth-password').checked = true;
            document.getElementById('ssh-password').value = existingAction.password;
          } else if (existingAction.privateKey) {
            document.getElementById('ssh-auth-key').checked = true;
            document.getElementById('ssh-private-key').value = existingAction.privateKey;
            document.getElementById('ssh-passphrase').value = existingAction.passphrase || '';
            // Show key fields, hide password fields
            document.getElementById('ssh-password-group').classList.add('hidden');
            document.getElementById('ssh-key-group').classList.remove('hidden');
          }
          
          if (existingAction.permissions) {
            document.getElementById('ssh-permissions').value = existingAction.permissions.toString(8);
          }
          
          document.getElementById('ssh-command').value = existingAction.command || '';
          document.getElementById('ssh-verbose').checked = !!existingAction.verbose;
          break;
          
        case 'smb-copy':
          document.getElementById('smb-host').value = existingAction.host || '';
          document.getElementById('smb-share').value = existingAction.share || '';
          document.getElementById('smb-username').value = existingAction.username || '';
          document.getElementById('smb-password').value = existingAction.password || '';
          document.getElementById('smb-domain').value = existingAction.domain || '';
          document.getElementById('smb-source').value = existingAction.source || 'cert';
          document.getElementById('smb-destination').value = existingAction.destination || '';
          document.getElementById('smb-verbose').checked = !!existingAction.verbose;
          break;
          
        case 'ftp-copy':
          document.getElementById('ftp-host').value = existingAction.host || '';
          document.getElementById('ftp-port').value = existingAction.port || 21;
          document.getElementById('ftp-username').value = existingAction.username || '';
          document.getElementById('ftp-password').value = existingAction.password || '';
          document.getElementById('ftp-secure').checked = !!existingAction.secure;
          document.getElementById('ftp-source').value = existingAction.source || 'cert';
          document.getElementById('ftp-destination').value = existingAction.destination || '';
          break;
          
        case 'api-call':
          document.getElementById('api-url').value = existingAction.url || '';
          document.getElementById('api-method').value = existingAction.method || 'POST';
          document.getElementById('api-content-type').value = existingAction.contentType || 'application/json';
          document.getElementById('api-body').value = existingAction.body || '';
          document.getElementById('api-auth-username').value = existingAction.username || '';
          document.getElementById('api-auth-password').value = existingAction.password || '';
          document.getElementById('api-headers').value = existingAction.headers ? JSON.stringify(existingAction.headers, null, 2) : '';
          break;
          
        case 'webhook':
          document.getElementById('webhook-url').value = existingAction.url || '';
          document.getElementById('webhook-method').value = existingAction.method || 'POST';
          document.getElementById('webhook-content-type').value = existingAction.contentType || 'application/json';
          document.getElementById('webhook-payload').value = existingAction.payload ? JSON.stringify(existingAction.payload, null, 2) : '';
          break;
          
        case 'email':
          document.getElementById('email-to').value = existingAction.to || '';
          document.getElementById('email-subject').value = existingAction.subject || 'Certificate Update Notification';
          document.getElementById('email-body').value = existingAction.body || '';
          document.getElementById('email-attach-cert').checked = !!existingAction.attachCert;
          break;
      }
      
      // Show the action options for the selected type
      showActionOptions(existingAction.type);
      
      // Load Docker containers if needed
      if (existingAction.type === 'docker-restart') {
        loadDockerContainers();
      }
    }    // Initial setup of action options
    updateActionOptions();
    
    // Setup file browser buttons AFTER action options are visible
    setTimeout(() => {
      setupFileBrowserButtons();
    }, 100);
  }
}

/**
 * Load Docker containers from API
 */
async function loadDockerContainers() {
  const containerSelect = document.getElementById('docker-container-select');
  const loadingSpinner = document.getElementById('docker-loading');
  
  if (!containerSelect) return;
  
  try {
    // Show loading spinner
    if (loadingSpinner) loadingSpinner.style.display = 'inline-block';
    
    // Clear existing options
    containerSelect.innerHTML = '<option value="">Loading containers...</option>';
    
    // Fetch containers from API
    const response = await fetch('/api/docker/containers');
    const data = await response.json();
    
    // Store containers
    dockerContainers = data.containers || [];
    
    // Update dropdown
    containerSelect.innerHTML = '';
    
    if (!data.dockerAvailable) {
      // Docker not available
      containerSelect.innerHTML = '<option value="">Docker not available</option>';
      containerSelect.disabled = true;
      return;
    }
    
    if (!dockerContainers.length) {
      // No containers found
      containerSelect.innerHTML = '<option value="">No containers found</option>';
      return;
    }
    
    // Add default option
    containerSelect.innerHTML = '<option value="">Select a container</option>';
    
    // Add container options
    dockerContainers.forEach(container => {
      const option = document.createElement('option');
      option.value = container.id;
      option.textContent = `${container.name} (${container.shortId}) - ${container.status}`;
      containerSelect.appendChild(option);
    });
    
    // If we're editing, set the selected container
    const existingAction = getEditingAction();
    if (existingAction && existingAction.type === 'docker-restart') {
      if (existingAction.containerId) {
        // Try to find and select the container by ID
        containerSelect.value = existingAction.containerId;
      } else if (existingAction.containerName) {
        // Try to find and select the container by name
        const container = dockerContainers.find(c => c.name === existingAction.containerName);
        if (container) {
          containerSelect.value = container.id;
        } else {
          // If container not found, use custom input
          document.getElementById('docker-container-custom').value = existingAction.containerName;
        }
      }
    }
  } catch (error) {
    console.error('Error loading Docker containers:', error);
    containerSelect.innerHTML = '<option value="">Error loading containers</option>';
  } finally {
    // Hide loading spinner
    if (loadingSpinner) loadingSpinner.style.display = 'none';
  }
}

/**
 * Hide all action option sections
 */
function hideAllActionOptions() {
  const optionDivs = document.querySelectorAll('.action-type-options');
  optionDivs.forEach(div => div.classList.add('hidden'));
}

/**
 * Show options for selected action type
 * @param {string} actionType - Selected action type
 */
function showActionOptions(actionType) {
  const optionDiv = document.getElementById(`${actionType}-action-options`);
  if (optionDiv) {
    optionDiv.classList.remove('hidden');
  }
}

/**
 * Get current editing action from form state
 * @returns {Object|null} Action object or null
 */
function getEditingAction() {
  return window.editingAction || null;
}

/**
 * Save deployment action
 */
async function saveDeploymentAction() {
  try {
    const form = document.getElementById('deployment-action-form');
    const actionType = document.getElementById('deployment-action-type').value;
    const actionName = document.getElementById('deployment-action-name').value;
    
    // Basic validation
    if (!actionType) {
      UIUtils.showToast('Please select an action type', 'warning');
      return;
    }
    
    if (!actionName) {
      UIUtils.showToast('Please enter a name for this action', 'warning');
      return;
    }
    
    // Create base action object
    const action = {
      type: actionType,
      name: actionName
    };
    
    // Add specific properties based on action type
    switch (actionType) {
      case 'copy':
        action.source = document.getElementById('copy-source').value;
        action.destination = document.getElementById('copy-destination').value;
        const permissions = document.getElementById('copy-permissions').value;
        
        if (!action.source || !action.destination) {
          UIUtils.showToast('Please specify source and destination', 'warning');
          return;
        }
        
        if (permissions) {
          action.permissions = parseInt(permissions, 8);
        }
        break;
        
      case 'command':
        action.command = document.getElementById('command-command').value;
        action.cwd = document.getElementById('command-cwd').value;
        action.verbose = document.getElementById('command-verbose').checked;
        
        if (!action.command) {
          UIUtils.showToast('Please enter a command', 'warning');
          return;
        }
        break;
        
      case 'docker-restart':
        const containerSelect = document.getElementById('docker-container-select');
        const containerCustom = document.getElementById('docker-container-custom').value.trim();
        
        const containerId = containerSelect.value || containerCustom;
        
        if (!containerId) {
          UIUtils.showToast('Please select a container or enter a container ID/name', 'warning');
          return;
        }
        
        // If a container was selected from dropdown, get both ID and name
        if (containerSelect.value) {
          const container = dockerContainers.find(c => c.id === containerSelect.value);
          if (container) {
            action.containerId = container.id;
            action.containerName = container.name;
          } else {
            action.containerId = containerSelect.value;
          }
        } else {
          // Custom container ID/name was entered
          // Determine if it's an ID or name
          if (containerCustom.match(/^[0-9a-f]{12}$|^[0-9a-f]{64}$/)) {
            action.containerId = containerCustom;
          } else {
            action.containerName = containerCustom;
          }
        }
        break;
        
      case 'nginx-proxy-manager':
        const isPathMethod = document.getElementById('npm-method-path').checked;
        
        if (isPathMethod) {
          action.npmPath = document.getElementById('npm-path').value;
          if (!action.npmPath) {
            UIUtils.showToast('Please specify the Nginx Proxy Manager path', 'warning');
            return;
          }
        } else {
          action.dockerContainer = document.getElementById('npm-docker-container').value;
          if (!action.dockerContainer) {
            UIUtils.showToast('Please specify the Docker container name', 'warning');
            return;
          }
        }
        break;
        
      case 'ssh-copy':
        action.host = document.getElementById('ssh-host').value;
        action.port = parseInt(document.getElementById('ssh-port').value, 10);
        action.username = document.getElementById('ssh-username').value;
        action.source = document.getElementById('ssh-source').value;
        action.destination = document.getElementById('ssh-destination').value;
        
        const isPasswordAuth = document.getElementById('ssh-auth-password').checked;
        if (isPasswordAuth) {
          action.password = document.getElementById('ssh-password').value;
        } else {
          action.privateKey = document.getElementById('ssh-private-key').value;
          const passphrase = document.getElementById('ssh-passphrase').value;
          if (passphrase) {
            action.passphrase = passphrase;
          }
        }
        
        const sshPermissions = document.getElementById('ssh-permissions').value;
        if (sshPermissions) {
          action.permissions = parseInt(sshPermissions, 8);
        }
        
        const sshCommand = document.getElementById('ssh-command').value;
        if (sshCommand) {
          action.command = sshCommand;
        }
        
        action.verbose = document.getElementById('ssh-verbose').checked;
        
        if (!action.host || !action.source || !action.destination) {
          UIUtils.showToast('Please fill in all required SSH fields', 'warning');
          return;
        }
        break;
        
      case 'smb-copy':
        action.host = document.getElementById('smb-host').value;
        action.share = document.getElementById('smb-share').value;
        action.username = document.getElementById('smb-username').value;
        action.password = document.getElementById('smb-password').value;
        action.domain = document.getElementById('smb-domain').value;
        action.source = document.getElementById('smb-source').value;
        action.destination = document.getElementById('smb-destination').value;
        action.verbose = document.getElementById('smb-verbose').checked;
        
        if (!action.host || !action.share || !action.source || !action.destination) {
          UIUtils.showToast('Please fill in all required SMB fields', 'warning');
          return;
        }
        break;
        
      case 'ftp-copy':
        action.host = document.getElementById('ftp-host').value;
        action.port = parseInt(document.getElementById('ftp-port').value, 10);
        action.username = document.getElementById('ftp-username').value;
        action.password = document.getElementById('ftp-password').value;
        action.secure = document.getElementById('ftp-secure').checked;
        action.source = document.getElementById('ftp-source').value;
        action.destination = document.getElementById('ftp-destination').value;
        
        if (!action.host || !action.source || !action.destination) {
          UIUtils.showToast('Please fill in all required FTP fields', 'warning');
          return;
        }
        break;
        
      case 'api-call':
        action.url = document.getElementById('api-url').value;
        action.method = document.getElementById('api-method').value;
        action.contentType = document.getElementById('api-content-type').value;
        action.body = document.getElementById('api-body').value;
        
        // Parse headers if provided
        try {
          const headersText = document.getElementById('api-headers').value.trim();
          if (headersText) {
            action.headers = JSON.parse(headersText);
          }
        } catch (error) {
          UIUtils.showToast('Invalid JSON format for headers', 'error');
          return;
        }
        
        // Add auth if provided
        const username = document.getElementById('api-auth-username').value;
        const password = document.getElementById('api-auth-password').value;
        
        if (username && password) {
          action.username = username;
          action.password = password;
        }
        
        if (!action.url) {
          UIUtils.showToast('Please enter a URL', 'warning');
          return;
        }
        break;
        
      case 'webhook':
        action.url = document.getElementById('webhook-url').value;
        action.method = document.getElementById('webhook-method').value;
        action.contentType = document.getElementById('webhook-content-type').value;
        
        // Parse payload if provided
        try {
          const payloadText = document.getElementById('webhook-payload').value.trim();
          if (payloadText) {
            action.payload = JSON.parse(payloadText);
          }
        } catch (error) {
          UIUtils.showToast('Invalid JSON format for payload', 'error');
          return;
        }
        
        if (!action.url) {
          UIUtils.showToast('Please enter a webhook URL', 'warning');
          return;
        }
        break;
        
      case 'email':
        action.to = document.getElementById('email-to').value;
        action.subject = document.getElementById('email-subject').value;
        action.body = document.getElementById('email-body').value;
        action.attachCert = document.getElementById('email-attach-cert').checked;
        
        if (!action.to) {
          UIUtils.showToast('Please enter recipient email address', 'warning');
          return;
        }
        
        // Validate email address
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(action.to)) {
          UIUtils.showToast('Please enter a valid email address', 'warning');
          return;
        }
        break;
    }
    
    // Get the current certificate fingerprint
    const fingerprint = state.currentCertificate.fingerprint;
    const isEditing = getEditingAction() !== null;
    let url = `/api/certificates/${encodeURIComponent(fingerprint)}/deploy-actions`;
    
    // If editing, add index to URL
    if (isEditing) {
      url += `/${window.editingActionIndex}`;
    }
    
    // Save the action
    const saveBtn = document.getElementById('save-deploy-action-btn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    
    const method = isEditing ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(action)
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    // Parse response
    const result = await response.json();
    
    // Close modal and show success message
    ModalUtils.closeModal('deployment-action-modal');
    
    UIUtils.showToast(
      isEditing ? 'Deployment action updated' : 'Deployment action added', 
      'success'
    );
    
    // Reload deployment actions tab
    loadCertificateDeploymentActions(state.currentCertificate);
    
  } catch (error) {
    console.error('Error saving deployment action:', error);
    UIUtils.showToast(`Error: ${error.message}`, 'error');
  } finally {
    // Reset button
    const saveBtn = document.getElementById('save-deploy-action-btn');
    saveBtn.textContent = 'Save Action';
    saveBtn.disabled = false;
    
    // Clear editing state
    window.editingAction = null;
    window.editingActionIndex = null;
  }
}

/**
 * Show deployment action form
 * @param {Object} [existingAction] - Existing action for edit mode
 * @param {number} [actionIndex] - Index of existing action for edit mode
 */
function showDeploymentActionForm(existingAction = null, actionIndex = null) {
  // Store action for edit mode
  window.editingAction = existingAction;
  window.editingActionIndex = actionIndex;
  console.log('Show deployment action form:', existingAction, actionIndex);

  // First, make sure the modal container exists
  const modalId = 'deployment-action-modal';
  let modalElement = document.getElementById(modalId);
  
  // Create modal if it doesn't exist
  if (!modalElement) {
    modalElement = document.createElement('div');
    modalElement.id = modalId;
    modalElement.className = 'modal hidden';  // Use 'hidden' class for ModalUtils compatibility
    modalElement.style.zIndex = "1102"; // Higher z-index to appear on top
    modalElement.innerHTML = '<div class="modal-content"></div>';
    document.body.appendChild(modalElement);
    console.log('Created missing modal container:', modalId);
  }
  
  // Store current certificate detail modal state
  const certDetailModal = document.querySelector('#cert-details-modal:not(.hidden)');
  if (certDetailModal) {
    window.previousModalId = 'cert-details-modal';
    // Instead of closing it, just bring our modal to the front
    modalElement.style.zIndex = parseInt(getComputedStyle(certDetailModal).zIndex || "1000") + 5;
    
    // Make sure the backdrop doesn't hide the existing modal
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) {
      backdrop.style.zIndex = parseInt(modalElement.style.zIndex) - 1;
    }
  }
  
  const modalContent = modalElement.querySelector('.modal-content');
  if (!modalContent) {
    console.error('Modal content container not found even after creating modal');
    UIUtils.showToast('Error loading form: Modal content container not found', 'error');
    return;
  }
  
  // Show loading indicator
  modalContent.innerHTML = '<div class="loading-spinner"></div>';
  
  // Load the form template
  fetch('/templates/deploy-action-form.html')
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch form template: ${response.status}`);
      }
      return response.text();
    })
    .then(html => {
      modalContent.innerHTML = html;
      
      // Initialize the form
      initializeDeployActionForm(existingAction);
      
      // Add save button event listener
      const saveBtn = document.getElementById('save-deploy-action-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', saveDeploymentAction);
      }
      
      // Set up close button handlers
      const closeButtons = modalElement.querySelectorAll('[data-dismiss="modal"]');
      closeButtons.forEach(button => {
        button.classList.add('close-modal'); // Add the class that ModalUtils looks for
        button.addEventListener('click', function() {
          ModalUtils.closeModal(modalId);
        });
      });
      
      // Add file browser button handlers for relevant fields
      setupFileBrowserButtons();
      
      // Show the modal using ModalUtils
      ModalUtils.openModal(modalId);
    })
    .catch(error => {
      console.error('Error loading deployment action form:', error);
      UIUtils.showToast(`Error loading form: ${error.message}`, 'error');
      
      // Add fallback content to modal
      modalContent.innerHTML = `
        <div class="modal-header">
          <h3 class="modal-title">Error Loading Form</h3>
          <button type="button" class="close-modal" aria-label="Close">×</button>
        </div>
        <div class="modal-body">
          <p class="error-message">Failed to load the deployment action form. Please try again.</p>
          <p>Error details: ${UIUtils.sanitizeErrorMessage ? UIUtils.sanitizeErrorMessage(error) : error.message}</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="button button-secondary close-modal">Close</button>
          <button type="button" class="button button-primary" onclick="showDeploymentActionForm(window.editingAction, window.editingActionIndex)">Retry</button>
        </div>
      `;
      
      // Set up close button handlers for error message
      modalElement.querySelectorAll('.close-modal').forEach(button => {
        button.addEventListener('click', function() {
          ModalUtils.closeModal(modalId);
        });
      });
      
      // Show the modal even on error
      ModalUtils.openModal(modalId);
    });
}

/**
 * Setup file browser buttons for path inputs
 */
function setupFileBrowserButtons() {
  // Wait a moment for the DOM to be fully loaded
  setTimeout(() => {
    // Define all browse buttons with their targets and types
    const browseButtons = [
      { buttonId: 'browse-copy-destination', targetId: 'copy-destination', type: 'file' },
      { buttonId: 'browse-command-cwd', targetId: 'command-cwd', type: 'directory' },
      { buttonId: 'browse-npm-path', targetId: 'npm-path', type: 'directory' },
      { buttonId: 'browse-ssh-key', targetId: 'ssh-private-key', type: 'file' }
    ];
    
    // Add click event listeners to all browse buttons
    browseButtons.forEach(button => {
      const buttonElement = document.getElementById(button.buttonId);
      
      if (buttonElement) {
        // Remove existing listeners with clone
        const newButton = buttonElement.cloneNode(true);
        if (buttonElement.parentNode) {
          buttonElement.parentNode.replaceChild(newButton, buttonElement);
        }
        
        // Add event listener to open file browser
        newButton.addEventListener('click', () => {
          const targetInput = document.getElementById(button.targetId);
          const currentPath = targetInput ? targetInput.value : '';
          openFileBrowser(button.targetId, button.type, currentPath);
        });
        
        console.log(`Added file browser listener to: ${button.buttonId} for ${button.targetId}`);
      } else {
        console.warn(`Browse button not found: ${button.buttonId}`);
        
        // Create browse buttons if they don't exist - this is the fix for "browse button not found"
        const targetInput = document.getElementById(button.targetId);
        if (targetInput) {
          console.log(`Creating browse button for: ${button.targetId}`);
          addBrowseButton(targetInput, button.targetId, button.type);
        }
      }
    });
    
    console.log('File browser buttons setup completed');
  }, 100);  // Small delay to ensure DOM is loaded
}

/**
 * Add browse button next to an input
 * @param {HTMLElement} input - Input element 
 * @param {string} targetId - Target input ID
 * @param {string} type - 'file' or 'directory'
 */
function addBrowseButton(input, targetId, type) {
  // Create browse button
  const browseBtn = document.createElement('button');
  browseBtn.type = 'button';
  browseBtn.className = 'button browse-btn';
  browseBtn.id = `browse-${targetId}`; // Set proper ID for future reference
  browseBtn.innerHTML = '<span class="icon-folder"></span>';
  browseBtn.title = `Browse for ${type}`;
  
  // Add event listener
  browseBtn.addEventListener('click', () => {
    openFileBrowser(targetId, type, input.value);
  });

  // If input is already in an input group, just add the button
  const parentGroup = input.closest('.input-group');
  if (parentGroup) {
    parentGroup.appendChild(browseBtn);
    console.log(`Added browse button ${browseBtn.id} to existing input group`);
    return;
  }
  
  // Otherwise create input group
  const inputGroup = document.createElement('div');
  inputGroup.className = 'input-group';
  
  // Replace input with input group
  const parent = input.parentNode;
  if (parent) {
    parent.removeChild(input);
    inputGroup.appendChild(input);
    inputGroup.appendChild(browseBtn);
    parent.appendChild(inputGroup);
    console.log(`Created new input group for ${targetId} with browse button ${browseBtn.id}`);
  } else {
    console.warn(`Cannot add browse button to ${targetId}: No parent node found`);
  }
}

/**
 * Open file browser dialog using the existing file browser module
 * @param {string} targetId - Target input ID
 * @param {string} type - 'file' or 'directory'
 * @param {string} currentPath - Current path value
 */
function openFileBrowser(targetId, type, currentPath) {
  console.log(`Opening file browser for ${targetId}, type: ${type}, currentPath: ${currentPath}`);
  
  // Check if the file browser module is available
  if (typeof initializeFileBrowser !== 'function') {
    console.error('File browser module not loaded');
    UIUtils.showToast('File browser module not loaded', 'error');
    return;
  }

  // Use the existing file browser module
  initializeFileBrowser(
    currentPath,
    // Callback function when a path is selected
    (selectedPath) => {
      const input = document.getElementById(targetId);
      if (input) {
        input.value = selectedPath;
      }
    },
    // Use directory mode for directory type
    type === 'directory'
  );
}

/**
 * Delete a deployment action
 * @param {string} fingerprint - Certificate fingerprint
 * @param {number} actionIndex - Action index
 */
async function deleteDeploymentAction(fingerprint, actionIndex) {
  try {
    // Confirm deletion
    if (!confirm('Are you sure you want to delete this deployment action?')) {
      return;
    }
    
    const response = await fetch(`/api/certificates/${encodeURIComponent(fingerprint)}/deploy-actions/${actionIndex}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    // Show success message
    UIUtils.showToast('Deployment action deleted', 'success');
    
    // Reload deployment actions tab
    loadCertificateDeploymentActions(state.currentCertificate);
  } catch (error) {
    console.error('Error deleting deployment action:', error);
    UIUtils.showToast(`Error: ${error.message}`, 'error');
  }
}

/**
 * Test a deployment action
 * @param {string} fingerprint - Certificate fingerprint
 * @param {number} actionIndex - Action index
 */
async function testDeploymentAction(fingerprint, actionIndex) {
  try {
    // Show loading notification
    UIUtils.showToast('Testing deployment action...', 'info');
    
    const response = await fetch(`/api/certificates/${encodeURIComponent(fingerprint)}/deploy-actions/${actionIndex}/test`, {
      method: 'POST'
    });
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      UIUtils.showToast('Test completed successfully', 'success');
    } else {
      UIUtils.showToast(`Test failed: ${result.message || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('Error testing deployment action:', error);
    UIUtils.showToast(`Error: ${error.message}`, 'error');
  }
}

/**
 * Load deployment actions for the certificate
 * @param {string|Object} fingerprint - Certificate fingerprint or certificate object
 */
function loadCertificateDeploymentActions(fingerprint) {
  // Handle case where a full certificate object is passed
  if (typeof fingerprint === 'object' && fingerprint !== null) {
    fingerprint = fingerprint.fingerprint;
  }
  
  // Ensure fingerprint is valid
  if (!fingerprint) {
    console.error('Invalid fingerprint provided to loadCertificateDeploymentActions');
    return;
  }
  
  const container = document.getElementById('deployment-actions-list');
  if (!container) {
    console.error('Deployment actions container not found');
    return;
  }
  
  // Show loading indicator
  container.innerHTML = '<div class="loading-spinner small"></div>';
  
  // Fetch deployment actions with proper encoding
  const encodedFingerprint = encodeAPIFingerprint(fingerprint);
  
  fetch(`/api/certificates/${encodedFingerprint}/deploy-actions`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to load deployment actions: ${response.status}`);
      }
      return response.json();
    })
    .then(actions => {
      if (!actions || actions.length === 0) {
        container.innerHTML = '<p class="empty-message">No deployment actions configured.</p>';
        return;
      }
      
      // Create HTML for actions list using safeTemplate
      const actionsHtml = actions.map((action, index) => {
        // Generate description based on action type
        let description = '';
        switch (action.type) {
          case 'copy':
            description = `Copy to ${action.destination}`;
            break;
          case 'ssh-copy':
            description = `SSH copy to ${action.host}:${action.destination}`;
            break;
          case 'command':
            description = `Run command: ${action.command.substring(0, 40)}${action.command.length > 40 ? '...' : ''}`;
            break;
          case 'docker-restart':
            description = `Restart Docker container: ${action.containerName || action.containerId}`;
            break;
          case 'webhook':
            description = `Send webhook to ${action.url}`;
            break;
          case 'smb-copy':
            description = `SMB copy to ${action.host}:${action.destination}`;
            break;
          case 'ftp-copy':
            description = `FTP copy to ${action.host}:${action.destination}`;
            break;
          case 'api-call':
            description = `API call to ${action.url}`;
            break;
          case 'nginx-proxy-manager':
            description = action.npmPath ? 
              `Update Nginx Proxy Manager at ${action.npmPath}` : 
              `Update Nginx Proxy Manager container ${action.dockerContainer}`;
            break;
          case 'email':
            description = `Send email to ${action.to}`;
            break;
          default:
            description = `${action.type} action`;
        }
        
        return UIUtils.safeTemplate(`
          <div class="deployment-action-item">
            <div class="deployment-action-info">
              <div class="deployment-action-name">${action.name || 'Unnamed Action'}</div>
              <span class="deployment-action-type">\${type}</span>
              <span class="deployment-action-desc">\${desc}</span>
            </div>
            <div class="deployment-action-buttons">
              <button class="button small test-action-btn" data-index="\${index|attr}">Test</button>
              <button class="button small edit-action-btn" data-index="\${index|attr}">Edit</button>
              <button class="button small danger remove-action-btn" data-index="\${index|attr}">Remove</button>
            </div>
          </div>
        `, {
          type: action.type,
          desc: description,
          index: index
        });
      }).join('');
      
      container.innerHTML = actionsHtml;
      
      // Add event listeners to buttons
      container.querySelectorAll('.test-action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const index = parseInt(this.getAttribute('data-index'), 10);
          testDeploymentAction(fingerprint, index);
        });
      });
      
      container.querySelectorAll('.edit-action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const index = parseInt(this.getAttribute('data-index'), 10);
          // Get the action data
          const action = actions[index];
          // Open the edit form with this action
          showDeploymentActionForm(action, index);
        });
      });
      
      container.querySelectorAll('.remove-action-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const index = parseInt(this.getAttribute('data-index'), 10);
          deleteDeploymentAction(fingerprint, index);
        });
      });
    })
    .catch(error => {
      console.error('Error loading deployment actions:', error);
      container.innerHTML = UIUtils.safeTemplate(`
        <p class="error-message">Failed to load deployment actions: \${errorMessage}</p>
      `, {
        errorMessage: UIUtils.sanitizeErrorMessage(error)
      });
    });
}

// Ensure encodeAPIFingerprint is available in this file
// If it's not defined in window scope, add it here
if (typeof encodeAPIFingerprint !== 'function') {
  /**
   * Helper function to properly encode certificate fingerprint for API use
   * @param {string} fingerprint - Raw certificate fingerprint
   * @returns {string} - Encoded fingerprint suitable for API URLs
   */
  function encodeAPIFingerprint(fingerprint) {
    // Ensure fingerprint is a string
    if (fingerprint === null || fingerprint === undefined) {
      console.error('Invalid fingerprint provided to encodeAPIFingerprint:', fingerprint);
      return '';
    }
    
    // Convert to string if it's not already
    fingerprint = String(fingerprint);
    
    // If fingerprint contains "=", it has the prefix "sha256 Fingerprint="
    if (fingerprint.includes('=')) {
      // Extract just the hexadecimal fingerprint value after the equals sign
      const parts = fingerprint.split('=');
      if (parts.length > 1) {
        return encodeURIComponent(parts[1].trim());
      }
    }
    
    // Otherwise, just encode as-is
    return encodeURIComponent(fingerprint);
  }
}

/**
 * Initialize deployment action button
 * @param {HTMLElement} button - The button element to attach listener to
 */
function initializeDeploymentActionButton(button) {
  if (!button) return;
  
  // Remove existing listeners by cloning
  const newButton = button.cloneNode(true);
  button.parentNode.replaceChild(newButton, button);
  
  // Add event listener to the new button
  newButton.addEventListener('click', () => {
    // Get current certificate fingerprint from state
    showDeploymentActionForm();
  });
  
  return newButton;
}

/**
 * Update action options based on selected action type
 */
function updateActionOptions() {
  const actionType = document.getElementById('deployment-action-type')?.value;
  
  // Hide all action options first
  document.querySelectorAll('.action-type-options').forEach(div => {
    div.classList.add('hidden');
  });
  
  // Show the selected action type options
  if (actionType) {
    const optionsDiv = document.getElementById(`${actionType}-action-options`);
    if (optionsDiv) {
      optionsDiv.classList.remove('hidden');
      
      // Setup additional handlers for specific action types
      switch (actionType) {
        case 'docker-restart':
          loadDockerContainers();
          break;
        case 'nginx-proxy-manager':
          setupNpmMethodToggle();
          break;
        case 'ssh-copy':
          setupSshAuthToggle();
          break;
        // Add other action-specific initializations as needed
      }
      
      // Always setup file browser buttons when action options are shown
      setTimeout(() => {
        setupFileBrowserButtons();
      }, 50);
    }
  }
}

// Export functions for global scope
window.initializeDeploymentActionButton = initializeDeploymentActionButton;
window.showDeploymentActionForm = showDeploymentActionForm;
window.loadCertificateDeploymentActions = loadCertificateDeploymentActions;
