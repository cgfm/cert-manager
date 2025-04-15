/**
 * Modal utilities for consistent modal handling
 */


// Create a function to set up common modal behaviors
function setupModalBehavior(modal) {
    // Close button should close the modal
    const closeBtn = modal.querySelector('.close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }
    
    // ESC key should close the modal
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            document.body.removeChild(modal);
            document.removeEventListener('keydown', escHandler);
        }
    });
    
    // Set up tab switching if needed
    setupTabSwitching(modal);
    
    // Use event delegation for buttons and form interactions
    modal.addEventListener('click', function(event) {
        const button = event.target.closest('button');
        if (!button) return;
        
        // Handle common buttons by their class or ID
        if (button.classList.contains('cancel-btn') || 
            button.classList.contains('close-btn')) {
            document.body.removeChild(modal);
        }
    });
    
    return modal;
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

/**
 * Sets up tab switching functionality in a modal
 * @param {HTMLElement} modal - The modal element containing tabs
 */
function setupTabSwitching(modal) {
    const tabButtons = modal.querySelectorAll('.tab-btn');
    const tabContents = modal.querySelectorAll('.tab-content');
    
    // Add click event to tab buttons
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.getAttribute('data-tab');
            
            // Deactivate all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Activate selected tab
            button.classList.add('active');
            modal.querySelector(`#${tabName}-tab`).classList.add('active');
        });
    });
}

/**
 * Ensure modal styles are loaded
 */
function ensureModalStyles() {
    if (!document.getElementById('modal-styles-js')) {
        console.log('Adding modal styles dynamically');
        const styleSheet = document.createElement('style');
        styleSheet.id = 'modal-styles-js';
        styleSheet.innerHTML = `
            /* Force modals to be visible */
            .modal {
                display: block !important;
                position: fixed;
                z-index: 9999;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                overflow: auto;
                background-color: rgba(0, 0, 0, 0.5);
            }
            
            .modal-content {
                position: relative;
                background-color: #fff;
                margin: 30px auto;
                padding: 20px;
                border-radius: 8px;
                box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
                width: 90%;
                max-width: 800px;
                /* Force visibility */
                visibility: visible !important;
                opacity: 1 !important;
            }
            
            .close {
                color: #aaa;
                float: right;
                font-size: 28px;
                font-weight: bold;
                cursor: pointer;
                margin-top: -10px;
            }
            
            .close:hover {
                color: #333;
            }
            
            /* Tab Styles */
            .tabs {
                display: flex;
                margin-bottom: 20px;
                border-bottom: 1px solid #ddd;
                flex-wrap: wrap;
            }
            
            .tab-btn {
                padding: 10px 15px;
                background: none;
                border: none;
                cursor: pointer;
                font-weight: 500;
                border-bottom: 3px solid transparent;
                margin-right: 10px;
                margin-bottom: 5px;
            }
            
            .tab-btn.active {
                border-bottom-color: #0078d7;
                color: #0078d7;
            }
            
            .tab-content {
                display: none;
            }
            
            .tab-content.active {
                display: block;
            }
            
            /* Certificate Info */
            .cert-info {
                display: grid;
                grid-template-columns: 1fr;
                gap: 10px;
                margin-bottom: 20px;
            }
            
            .info-row {
                display: grid;
                grid-template-columns: 150px 1fr;
                border-bottom: 1px solid #eee;
                padding-bottom: 8px;
            }
            
            .info-label {
                font-weight: bold;
                color: #555;
            }
            
            /* Form Elements */
            .form-group {
                margin-bottom: 15px;
            }
            
            .form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: 500;
            }
            
            .form-control {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
            }
            
            /* Buttons */
            .primary-btn, .secondary-btn, .danger-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 500;
                margin-right: 10px;
            }
            
            .primary-btn {
                background-color: #0078d7;
                color: white;
            }
            
            .secondary-btn {
                background-color: #f0f0f0;
                color: #333;
            }
            
            .danger-btn {
                background-color: #d9534f;
                color: white;
            }
            
            .button-group {
                margin-top: 20px;
                display: flex;
                justify-content: flex-end;
            }
        `;
        document.head.appendChild(styleSheet);
        console.log('Modal styles added');
    } else {
        console.log('Modal styles already exist');
    }
}

/**
 * Create and open a modal with the given content
 * @param {Object} options - Modal options
 * @returns {HTMLElement} - The modal element
 */
function createModal(options = {}) {
    // Ensure styles are loaded
    ensureModalStyles();
    
    console.log('Creating modal with options:', options);
    
    const defaultOptions = {
        title: 'Modal Title',
        content: '',
        width: '800px',
        onClose: null
    };
    
    const settings = { ...defaultOptions, ...options };
    
    // Create modal element
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = settings.id || 'modal-' + Date.now();
    
    // Create modal content
    modal.innerHTML = `
        <div class="modal-content" style="max-width: ${settings.width}">
            <span class="close">&times;</span>
            <h2>${settings.title}</h2>
            <div class="modal-body">
                ${settings.content}
            </div>
        </div>
    `;
    
    // Force the modal to be visible with inline styles
    modal.style.display = 'block';
    modal.style.zIndex = '9999';
    
    // Add to document
    document.body.appendChild(modal);
    console.log(`Modal created and added to document with ID: ${modal.id}`);
    
    // Add close handler
    const closeBtn = modal.querySelector('.close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            try {
                document.body.removeChild(modal);
                console.log(`Modal ${modal.id} closed`);
                if (typeof settings.onClose === 'function') {
                    settings.onClose();
                }
            } catch (err) {
                console.error('Error closing modal:', err);
            }
        });
    }
    
    // Set up tab switching if needed
    setupTabSwitching(modal);
    
    // Add ESC key handler
    document.addEventListener('keydown', function escHandler(e) {
        if (e.key === 'Escape') {
            try {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', escHandler);
                console.log(`Modal ${modal.id} closed via ESC key`);
                if (typeof settings.onClose === 'function') {
                    settings.onClose();
                }
            } catch (error) {
                console.error('Error handling ESC key:', error);
            }
        }
    });
    
    return modal;
}

/**
 * Show file browser in a modal
 * @param {HTMLElement} parentModal - Parent modal element
 * @param {string} inputSelector - Selector for the input field to update
 */
function showFileBrowser(parentModal, inputSelector) {
    return new Promise((resolve) => {
        console.log("Opening file browser modal");
    
        // Create a modal dialog for file browsing
        const modal = createModal({
            title: '<i class="fas fa-folder-open"></i> Select File',
            width: '700px',
            content: `
                <div class="file-browser">
                    <div class="current-path">
                        <i class="fas fa-folder"></i> Path: <span id="currentPath">/</span>
                    </div>
                    <div class="file-list" id="fileList">
                        <p><i class="fas fa-spinner fa-spin"></i> Loading...</p>
                    </div>
                </div>
                
                <div class="button-group">
                    <button id="selectPathBtn" class="primary-btn">
                        <i class="fas fa-check"></i> Select
                    </button>
                    <button id="cancelBrowseBtn" class="secondary-btn">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            `
        });
        
        // Initialize with starting path
        let currentPath = '/';
        
        // Function to load a directory
        async function loadDirectory(path) {
            const fileList = document.getElementById('fileList');
            if (!fileList) {
                console.error("File list element not found");
                return;
            }
            
            fileList.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Loading...</p>';
            
            try {
                const response = await fetch(`/api/filesystem?path=${encodeURIComponent(path)}`);
                
                // Check for non-JSON responses first (like HTML error pages)
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    throw new Error('Server returned non-JSON response. API endpoint may not exist.');
                }
                
                const data = await response.json();
                
                if (!data.success) {
                    fileList.innerHTML = `<div class="error-message">
                        <i class="fas fa-exclamation-triangle"></i> Error: ${data.message || 'Unknown error'}
                    </div>`;
                    return;
                }
                
                // Update current path display
                const pathDisplay = document.getElementById('currentPath');
                if (pathDisplay) {
                    pathDisplay.textContent = path;
                    currentPath = path;
                }
                
                // Build directory contents HTML
                let html = '';
                
                // Add parent directory option if not at root
                if (path !== '/') {
                    const parentPath = path.split('/').slice(0, -1).join('/') || '/';
                    html += `
                        <div class="file-item parent-dir" data-path="${parentPath}">
                            <span class="file-icon"><i class="fas fa-arrow-up"></i></span>
                            <span class="file-name">..</span>
                        </div>
                    `;
                }
                
                // Add directories
                if (data.directories && data.directories.length > 0) {
                    data.directories.forEach(dir => {
                        html += `
                            <div class="file-item directory" data-path="${path === '/' ? `/${dir}` : `${path}/${dir}`}">
                                <span class="file-icon"><i class="fas fa-folder"></i></span>
                                <span class="file-name">${dir}</span>
                            </div>
                        `;
                    });
                }
                
                // Add files
                if (data.files && data.files.length > 0) {
                    data.files.forEach(file => {
                        // Select icon based on file extension
                        let fileIcon = 'fas fa-file';
                        const extension = file.split('.').pop().toLowerCase();
                        
                        if (['crt', 'pem', 'key', 'cert'].includes(extension)) {
                            fileIcon = 'fas fa-key';
                        } else if (['jpg', 'jpeg', 'png', 'gif'].includes(extension)) {
                            fileIcon = 'fas fa-file-image';
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
                }
                
                // If no files or directories, show empty message
                if (!data.directories?.length && !data.files?.length) {
                    html += `<div class="empty-dir-message">
                        <i class="fas fa-folder-open"></i> This directory is empty
                    </div>`;
                }
                
                fileList.innerHTML = html;
                
                // Add event listeners for navigation
                fileList.querySelectorAll('.directory, .parent-dir').forEach(item => {
                    item.addEventListener('click', () => {
                        const dirPath = item.getAttribute('data-path');
                        loadDirectory(dirPath);
                    });
                });
                
                // Add event listeners for file selection
                fileList.querySelectorAll('.file').forEach(item => {
                    item.addEventListener('click', () => {
                        // Highlight selected file
                        fileList.querySelectorAll('.file').forEach(f => f.classList.remove('selected'));
                        item.classList.add('selected');
                        currentPath = item.getAttribute('data-path');
                    });
                });
                
            } catch (error) {
                console.error('Error loading directory:', error);
                fileList.innerHTML = `<div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i> Error loading directory: ${error.message}
                    <div class="help-text">The API endpoint /api/filesystem may not be implemented on the server.</div>
                    <button id="enterPathManually" class="secondary-btn">Enter Path Manually</button>
                </div>`;
                
                // Add handler for manual path entry
                const enterPathBtn = fileList.querySelector('#enterPathManually');
                if (enterPathBtn) {
                    enterPathBtn.addEventListener('click', () => {
                        const userPath = prompt('Enter file path:', currentPath || '/certs');
                        if (userPath) {
                            currentPath = userPath;
                            const pathDisplay = document.getElementById('currentPath');
                            if (pathDisplay) {
                                pathDisplay.textContent = userPath;
                            }
                        }
                    });
                }
            }
        }
        
        // Setup cancel button
        const cancelBtn = modal.querySelector('#cancelBrowseBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                // Always resolve the promise before removing the modal
                resolve(null);
                document.body.removeChild(modal);
            });
        }
        
        // Setup select button
        const selectBtn = modal.querySelector('#selectPathBtn');
        if (selectBtn) {
            selectBtn.addEventListener('click', () => {
                const targetInput = parentModal && inputSelector ? 
                    parentModal.querySelector(inputSelector) : 
                    document.querySelector(inputSelector);
                    
                if (targetInput) {
                    targetInput.value = currentPath;
                    console.log(`Updated input ${inputSelector} with path: ${currentPath}`);
                } else {
                    console.error(`Target input not found: ${inputSelector}`);
                }
                
                // Always resolve the promise before removing the modal
                resolve(currentPath);
                document.body.removeChild(modal);
            });
        }
        
        loadDirectory('/certs');
        return modal;
    });
}

// Simple check function to verify the utilities are loaded
function checkModalUtilsLoaded() {
    console.log("Modal utilities loaded successfully!");
    return true;
}

/**
 * Set up event listeners for certificate action buttons
 * Uses event delegation for better performance and to handle dynamically added elements
 */
function setupCertificateActionListeners() {
    console.log('Setting up certificate action listeners');
    
    // Find all certificate tables or containers with more flexible selectors
    const certificateContainers = [
        document.getElementById('certificateTable'),
        document.getElementById('certificates-table'),
        document.querySelector('.certificate-list'),
        document.querySelector('.certificates-container'),
        document.querySelector('#certificates'),
        document.querySelector('#certificate-list'),
        document.querySelector('table.certificates'),
        document.querySelector('table.table-certificates'),
        document.querySelector('.certificate-grid'),
        // Also try to find the main content area that might contain certificates
        document.querySelector('main'),
        document.querySelector('#content'),
        document.querySelector('.content'),
        // Most generic fallback
        document.body
    ].filter(el => el !== null);
    
    if (certificateContainers.length === 0) {
        console.warn('No certificate containers found on page');
        // Still set up global action buttons
        setupGlobalActionButtons();
        return;
    }
    
    console.log(`Found ${certificateContainers.length} potential certificate containers`);
    
    // Set up event delegation on each container
    certificateContainers.forEach(container => {
        // Check if this container has certificate rows or buttons
        const hasCertElements = container.querySelector('.cert-row') || 
                             container.querySelector('[data-fingerprint]') ||
                             container.querySelector('.config-btn') ||
                             container.querySelector('.renew-btn');
        
        if (hasCertElements) {
            console.log(`Container ${container.id || container.className || 'unknown'} has certificate elements`);
            
            // Remove existing listeners by cloning the node
            const newContainer = container.cloneNode(true);
            container.parentNode.replaceChild(newContainer, container);
            
            // Add event listener with event delegation
            newContainer.addEventListener('click', handleCertificateButtonClick);
            console.log(`Set up event delegation on container: ${newContainer.id || newContainer.className || 'unknown'}`);
        } else {
            console.log(`Container ${container.id || container.className || 'unknown'} has no certificate elements yet`);
            
            // For containers without certificates yet, use a MutationObserver to detect when certificates are added
            const observer = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    // Check if any nodes were added
                    if (mutation.addedNodes.length > 0) {
                        // Check if any of the added nodes are certificate elements
                        const hasCertElements = Array.from(mutation.addedNodes).some(node => {
                            if (node.nodeType === Node.ELEMENT_NODE) {
                                return node.classList.contains('cert-row') || 
                                       node.hasAttribute('data-fingerprint') ||
                                       node.querySelector('.cert-row') || 
                                       node.querySelector('[data-fingerprint]') ||
                                       node.querySelector('.config-btn') ||
                                       node.querySelector('.renew-btn');
                            }
                            return false;
                        });
                        
                        if (hasCertElements) {
                            console.log('Certificate elements added to the DOM, setting up listeners');
                            // Disconnect the observer to prevent multiple handlers
                            observer.disconnect();
                            // Set up listeners again
                            setupCertificateActionListeners();
                        }
                    }
                });
            });
            
            // Start observing the container for DOM changes
            observer.observe(container, { childList: true, subtree: true });
            console.log(`Set up mutation observer on container: ${container.id || container.className || 'unknown'}`);
        }
    });
    
    // Set up global action buttons
    setupGlobalActionButtons();
}


/**
 * Handle certificate button clicks through event delegation
 * @param {Event} event - The click event
 */
function handleCertificateButtonClick(event) {
    // Get the clicked element
    const target = event.target;
    
    // Find the button (could be the target or a parent of the target like an icon)
    const button = target.closest('button') || target.closest('.action-btn') || target.closest('.cert-action');
    if (!button) return;
        
    // Check if this is a certificate action button that needs a fingerprint
    const isCertAction = button.classList.contains('config-btn') || 
                        button.classList.contains('configure-btn') ||
                        button.classList.contains('edit-btn') ||
                        button.classList.contains('settings-btn') ||
                        button.classList.contains('renew-btn') ||
                        button.classList.contains('refresh-btn') ||
                        button.classList.contains('update-btn') ||
                        button.classList.contains('view-btn') ||
                        button.classList.contains('details-btn') ||
                        button.classList.contains('info-btn') ||
                        button.classList.contains('delete-btn') ||
                        button.classList.contains('remove-btn') ||
                        button.classList.contains('deploy-btn') ||
                        button.classList.contains('deployment-btn');
    
    // If not a certificate action button, just let the event propagate
    if (!isCertAction) return;
    
    // Stop event propagation to prevent multiple handlers
    event.stopPropagation();
    
    // Get fingerprint either from the button or from its parent row
    let fingerprint = button.dataset.fingerprint;
    if (!fingerprint) {
        const row = button.closest('tr[data-fingerprint]') || 
                  button.closest('.cert-row[data-fingerprint]') ||
                  button.closest('[data-fingerprint]');
        if (row) {
            fingerprint = row.dataset.fingerprint;
        }
    }
    
    // Verify we have a fingerprint
    if (!fingerprint) {
        console.warn('Button clicked without associated fingerprint:', button);
        return;
    }
    
    console.log(`Button clicked: ${button.className} for certificate: ${fingerprint}`);
    
    // Determine action based on the button's class
    if (button.classList.contains('config-btn') || 
        button.classList.contains('configure-btn') ||
        button.classList.contains('edit-btn') ||
        button.classList.contains('settings-btn')) {
        event.preventDefault();
        showCertificateConfigModal(fingerprint);
    }
    else if (button.classList.contains('settings-btn')) {
        event.preventDefault();
        showGlobalSettingsModal(fingerprint);
    }
    else if (button.classList.contains('renew-btn') || 
             button.classList.contains('refresh-btn') ||
             button.classList.contains('update-btn')) {
        event.preventDefault();
        renewCertificate(fingerprint);
    }
    else if (button.classList.contains('view-btn') || 
             button.classList.contains('details-btn') ||
             button.classList.contains('info-btn')) {
        event.preventDefault();
        showCertificateDetailsModal(fingerprint);
    }
    else if (button.classList.contains('delete-btn') ||
             button.classList.contains('remove-btn')) {
        event.preventDefault();
        confirmDeleteCertificate(fingerprint);
    }
    else if (button.classList.contains('deploy-btn') || 
             button.classList.contains('deployment-btn')) {
        event.preventDefault();
        showDeploymentOptionsModal(fingerprint);
    }
}

/**
 * Set up global action buttons like "Add Certificate" and "Settings"
 */
function setupGlobalActionButtons() {
    // Add Certificate buttons
    const addCertButtons = [
        document.getElementById('add-certificate'),
        document.getElementById('add-cert-btn'),
        document.getElementById('create-certificate'),
        document.getElementById('create-cert-btn'),
        ...Array.from(document.querySelectorAll('.add-certificate-btn')),
        ...Array.from(document.querySelectorAll('.add-cert-btn')),
        ...Array.from(document.querySelectorAll('.create-certificate-btn')),
        ...Array.from(document.querySelectorAll('.create-cert-btn'))
    ].filter(btn => btn !== null);
    
    addCertButtons.forEach(button => {
        // Clone to remove existing listeners
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        newButton.addEventListener('click', (event) => {
            event.preventDefault();
            showCreateCertificateModal();
        });
        console.log(`Set up create certificate button: ${newButton.id || newButton.className}`);
    });
    
    // Settings buttons
    const settingsButtons = [
        document.getElementById('settings'),
        document.getElementById('settings-btn'),
        document.getElementById('global-settings'),
        document.getElementById('global-settings-btn'),
        ...Array.from(document.querySelectorAll('.settings-btn')),
        ...Array.from(document.querySelectorAll('.global-settings-btn'))
    ].filter(btn => btn !== null);
    
    settingsButtons.forEach(button => {
        // Clone to remove existing listeners
        const newButton = button.cloneNode(true);
        button.parentNode.replaceChild(newButton, button);
        
        newButton.addEventListener('click', (event) => {
            event.preventDefault();
            showGlobalSettingsModal();
        });
        console.log(`Set up settings button: ${newButton.id || newButton.className}`);
    });
}

/**
 * Show global settings modal
 */
function showGlobalSettingsModal() {
    console.log('Showing global settings modal');
    
    // Create a loading overlay while we fetch settings
    const loadingOverlay = createLoadingOverlay('Loading settings...');
    document.body.appendChild(loadingOverlay);
    
    // Fetch global settings
    fetch('/api/settings/global')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load settings: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .then(settings => {
            // Remove loading overlay
            document.body.removeChild(loadingOverlay);
            
            // Create modal with settings - IMPORTANT: Keep the settings variable within this scope
            createGlobalSettingsModal(settings);
        })
        .catch(error => {
            // Remove loading overlay if it exists
            if (document.body.contains(loadingOverlay)) {
                document.body.removeChild(loadingOverlay);
            }
            
            console.error('Error loading settings:', error);
            
            // Show error notification
            showNotification(`Error loading settings: ${error.message}. Using defaults.`, 'error');
            
            // Create modal with default settings
            const defaultSettings = {
                autoRenewByDefault: false,
                renewDaysBeforeExpiry: 30,
                caValidityPeriod: {
                    rootCA: 3650,
                    intermediateCA: 1825,
                    standard: 90
                },
                enableCertificateBackups: true,
                enableHttps: false,
                httpsCertPath: '',
                httpsKeyPath: '',
                httpsPort: 4443,
                backupRetention: 30,
                logLevel: 'info',
                jsonOutput: false
            };
            
            // Create the modal with default settings
            createGlobalSettingsModal(defaultSettings);
        });
}

/**
 * Create global settings modal with the provided settings
 * @param {Object} settings - Global settings object
 */
function createGlobalSettingsModal(settings) {
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
                        <input type="number" id="defaultRenewDays" value="${settings.renewDaysBeforeExpiry || 30}" min="1" max="90">
                    </div>
                    
                    <h3>Certificate Validity Periods (days)</h3>
                    <div class="form-group">
                        <label>Root CA certificates:</label>
                        <input type="number" id="rootCAValidity" value="${settings.caValidityPeriod?.rootCA || 3650}" min="365" max="3650">
                    </div>
                    
                    <div class="form-group">
                        <label>Intermediate CA certificates:</label>
                        <input type="number" id="intermediateCAValidity" value="${settings.caValidityPeriod?.intermediateCA || 1825}" min="365" max="1825">
                    </div>
                    
                    <div class="form-group">
                        <label>Standard certificates:</label>
                        <input type="number" id="standardValidity" value="${settings.caValidityPeriod?.standard || 90}" min="30" max="825">
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
                            <option value="info" ${(settings.logLevel === 'info' || !settings.logLevel) ? 'selected' : ''}>Info</option>
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
    
    // Set up event handlers
    setupGlobalSettingsModalEvents(modal, settings);
}

/**
 * Set up event handlers for the global settings modal
 * @param {HTMLElement} modal - The modal element
 * @param {Object} settings - The settings object
 */
function setupGlobalSettingsModalEvents(modal, settings) {
    // Set up tabs
    setupTabSwitching(modal);
    
    // Set up certificate source switching
    const certSourceSelect = modal.querySelector('#certSource');
    if (certSourceSelect) {
        certSourceSelect.addEventListener('change', () => {
            const managedSection = modal.querySelector('#managedCertSection');
            const customSection = modal.querySelector('#customCertSection');
            
            if (certSourceSelect.value === 'managed') {
                managedSection.style.display = '';
                customSection.style.display = 'none';
                
                // Load certificates if needed
                loadCertificatesForHttps(modal);
            } else {
                managedSection.style.display = 'none';
                customSection.style.display = '';
            }
        });
    }
    
    // Set up file browser buttons
    const browseCertBtn = modal.querySelector('#browseCertBtn');
    if (browseCertBtn) {
        browseCertBtn.addEventListener('click', () => {
            showFileBrowser(modal, '#httpsCertPath');
        });
    }
    
    const browseKeyBtn = modal.querySelector('#browseKeyBtn');
    if (browseKeyBtn) {
        browseKeyBtn.addEventListener('click', () => {
            showFileBrowser(modal, '#httpsKeyPath');
        });
    }
    
    // Handle close button
    const closeBtn = modal.querySelector('.close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }
    
    // Handle save button
    const saveBtn = modal.querySelector('#saveSettings');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            saveGlobalSettings(modal, settings);
        });
    }
    
    // Handle cancel button
    const cancelBtn = modal.querySelector('#cancelSettings');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }
    
    // Load certificates for HTTPS if needed
    if (modal.querySelector('#managedCertName') && 
        (!settings.httpsCertPath || certSourceSelect.value === 'managed')) {
        loadCertificatesForHttps(modal);
    }
}

/**
 * Save global settings
 * @param {HTMLElement} modal - The modal element
 * @param {Object} origSettings - The original settings object
 */
function saveGlobalSettings(modal, origSettings) {
    // Gather all settings
    const updatedSettings = { ...origSettings };
    
    // General tab
    updatedSettings.autoRenewByDefault = modal.querySelector('#autoRenewDefault').checked;
    updatedSettings.renewDaysBeforeExpiry = parseInt(modal.querySelector('#defaultRenewDays').value);
    
    // CA validity periods
    if (!updatedSettings.caValidityPeriod) {
        updatedSettings.caValidityPeriod = {};
    }
    updatedSettings.caValidityPeriod.rootCA = parseInt(modal.querySelector('#rootCAValidity').value);
    updatedSettings.caValidityPeriod.intermediateCA = parseInt(modal.querySelector('#intermediateCAValidity').value);
    updatedSettings.caValidityPeriod.standard = parseInt(modal.querySelector('#standardValidity').value);
    
    // HTTPS tab
    updatedSettings.enableHttps = modal.querySelector('#enableHttps').checked;
    updatedSettings.httpsPort = parseInt(modal.querySelector('#httpsPort').value);
    
    // Certificate source
    const certSource = modal.querySelector('#certSource').value;
    if (certSource === 'managed') {
        const managedCertSelect = modal.querySelector('#managedCertName');
        const selectedCert = managedCertSelect.options[managedCertSelect.selectedIndex];
        if (selectedCert && selectedCert.value) {
            updatedSettings.httpsCertPath = selectedCert.getAttribute('data-cert-path');
            updatedSettings.httpsKeyPath = selectedCert.getAttribute('data-key-path');
        } else {
            updatedSettings.httpsCertPath = '';
            updatedSettings.httpsKeyPath = '';
        }
    } else {
        updatedSettings.httpsCertPath = modal.querySelector('#httpsCertPath').value;
        updatedSettings.httpsKeyPath = modal.querySelector('#httpsKeyPath').value;
    }
    
    // Backup tab
    updatedSettings.enableCertificateBackups = modal.querySelector('#enableBackups').checked;
    updatedSettings.backupRetention = parseInt(modal.querySelector('#backupRetention').value);
    
    // Advanced tab
    updatedSettings.openSSLPath = modal.querySelector('#openSSLPath').value;
    
    const logLevelSelect = modal.querySelector('#logLevel');
    updatedSettings.logLevel = logLevelSelect.options[logLevelSelect.selectedIndex].value;
    
    updatedSettings.jsonOutput = modal.querySelector('#jsonOutput').checked;
    
    // Show loading overlay
    const loadingOverlay = createLoadingOverlay('Saving settings...');
    document.body.appendChild(loadingOverlay);
    
    // Save settings
    fetch('/api/settings/global', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatedSettings)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to save settings: ${response.status} ${response.statusText}`);
        }
        return response.json();
    })
    .then(result => {
        // Remove loading overlay
        document.body.removeChild(loadingOverlay);
        
        // Remove modal
        document.body.removeChild(modal);
        
        // Show success notification
        showNotification('Settings saved successfully', 'success');
        
        // Reload page if HTTPS settings changed to reflect changes
        if (origSettings.enableHttps !== updatedSettings.enableHttps ||
            origSettings.httpsPort !== updatedSettings.httpsPort ||
            origSettings.httpsCertPath !== updatedSettings.httpsCertPath ||
            origSettings.httpsKeyPath !== updatedSettings.httpsKeyPath) {
            
            showNotification('HTTPS settings changed. The server will need to be restarted.', 'warning');
        }
    })
    .catch(error => {
        // Remove loading overlay
        document.body.removeChild(loadingOverlay);
        
        console.error('Error saving settings:', error);
        showNotification(`Error saving settings: ${error.message}`, 'error');
    });
}

/**
 * Show a certificate configuration modal
 * @param {string} fingerprint - Certificate fingerprint
 */
function showCertificateConfigModal(fingerprint) {
    console.log(`Showing certificate config modal for: ${fingerprint}`);
    
    // Use the global function if available
    if (typeof window.showConfigModal === 'function') {
        window.showConfigModal(fingerprint);
        return;
    }
    
    // Or try the certConfig object if it exists
    if (window.certConfig && typeof window.certConfig.showConfigModal === 'function') {
        window.certConfig.showConfigModal(fingerprint);
        return;
    }
    
    // If we don't have access to the proper function, show an error
    console.error('showConfigModal function not found');
    alert('Certificate configuration functionality is not available. Please refresh the page.');
}

/**
 * Renew a certificate
 * @param {string} fingerprint - Certificate fingerprint
 */
function renewCertificate(fingerprint) {
    console.log(`Renewing certificate: ${fingerprint}`);
    
    // Show loading indicator
    const loadingOverlay = createLoadingOverlay('Renewing certificate...');
    document.body.appendChild(loadingOverlay);
    
    // Call the API
    fetch(`/api/certificate/${fingerprint}/renew`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        document.body.removeChild(loadingOverlay);
        
        if (data.success) {
            showNotification('Certificate renewal started successfully', 'success');
            
            // Refresh certificates list
            setTimeout(() => {
                if (typeof window.fetchCertificates === 'function') {
                    window.fetchCertificates();
                } else if (window.location && typeof window.location.reload === 'function') {
                    window.location.reload();
                }
            }, 3000);
        } else {
            showNotification(`Error: ${data.error || 'Unknown error occurred'}`, 'error');
        }
    })
    .catch(error => {
        document.body.removeChild(loadingOverlay);
        console.error('Error renewing certificate:', error);
        showNotification(`Error: ${error.message}`, 'error');
    });
}

/**
 * Create a loading overlay element
 * @param {string} message - Message to display
 * @returns {HTMLElement} - The loading overlay element
 */
function createLoadingOverlay(message = 'Loading...') {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
        <div class="loading-content">
            <i class="fas fa-spinner fa-spin fa-3x"></i>
            <p>${message}</p>
        </div>
    `;
    return overlay;
}

/**
 * Show a notification message
 * @param {string} message - Message to display
 * @param {string} type - Type of notification (success, error, warning, info)
 */
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // Set icon based on type
    let icon;
    switch (type) {
        case 'success': icon = '<i class="fas fa-check-circle"></i>'; break;
        case 'error': icon = '<i class="fas fa-exclamation-circle"></i>'; break;
        case 'warning': icon = '<i class="fas fa-exclamation-triangle"></i>'; break;
        default: icon = '<i class="fas fa-info-circle"></i>';
    }
    
    notification.innerHTML = `
        ${icon}
        <span class="notification-message">${message}</span>
        <button class="notification-close"><i class="fas fa-times"></i></button>
    `;
    
    // Add styles if needed
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 15px 20px;
                border-radius: 4px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                display: flex;
                align-items: center;
                min-width: 300px;
                max-width: 450px;
                z-index: 10000;
                animation: notify-in 0.3s ease-out;
            }
            
            @keyframes notify-in {
                0% { transform: translateY(-50px); opacity: 0; }
                100% { transform: translateY(0); opacity: 1; }
            }
            
            .notification i {
                margin-right: 10px;
                font-size: 1.2em;
            }
            
            .notification-message {
                flex-grow: 1;
            }
            
            .notification-close {
                background: none;
                border: none;
                cursor: pointer;
                opacity: 0.7;
                transition: opacity 0.2s;
            }
            
            .notification-close:hover {
                opacity: 1;
            }
            
            .notification.success {
                background-color: #d4edda;
                color: #155724;
                border-left: 4px solid #28a745;
            }
            
            .notification.error {
                background-color: #f8d7da;
                color: #721c24;
                border-left: 4px solid #dc3545;
            }
            
            .notification.warning {
                background-color: #fff3cd;
                color: #856404;
                border-left: 4px solid #ffc107;
            }
            
            .notification.info {
                background-color: #d1ecf1;
                color: #0c5460;
                border-left: 4px solid #17a2b8;
            }
        `;
        document.head.appendChild(style);
    }
    
    // Add to document
    document.body.appendChild(notification);
    
    // Add close button handler
    notification.querySelector('.notification-close').addEventListener('click', () => {
        document.body.removeChild(notification);
    });
    
    // Auto-remove after 5 seconds for non-error notifications
    if (type !== 'error') {
        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, 5000);
    }
}

/**
 * Load certificates for HTTPS configuration
 * @param {HTMLElement} modal - The modal element containing the certificate dropdown
 */
function loadCertificatesForHttps(modal) {
    console.log('Loading certificates for HTTPS configuration');
    
    const managedCertSelect = modal.querySelector('#managedCertName');
    if (!managedCertSelect) {
        console.error('Certificate select element not found');
        return;
    }
    
    // Set loading state
    managedCertSelect.innerHTML = '<option value="">Loading certificates...</option>';
    managedCertSelect.disabled = true;
    
    // Fetch certificates
    fetch('/api/certificate')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load certificates: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .then(certificates => {
            // Enable select
            managedCertSelect.disabled = false;
            
            if (!Array.isArray(certificates) || certificates.length === 0) {
                managedCertSelect.innerHTML = '<option value="">No certificates available</option>';
                return;
            }
            
            // Filter certificates to only include those with valid paths
            const validCerts = certificates.filter(cert => cert.path && cert.keyPath);
            
            if (validCerts.length === 0) {
                managedCertSelect.innerHTML = '<option value="">No valid certificates with key files found</option>';
                return;
            }
            
            // Sort by name
            validCerts.sort((a, b) => {
                const nameA = a.name || a.commonName || 'Unnamed';
                const nameB = b.name || b.commonName || 'Unnamed';
                return nameA.localeCompare(nameB);
            });
            
            // Build options
            let options = '<option value="">Select a certificate</option>';
            
            validCerts.forEach(cert => {
                const name = cert.name || cert.commonName || 'Unnamed';
                const fingerprint = cert.fingerprint;
                const certPath = cert.path;
                const keyPath = cert.keyPath;
                
                options += `
                    <option 
                        value="${fingerprint}" 
                        data-cert-path="${certPath}" 
                        data-key-path="${keyPath}"
                    >
                        ${name} (${fingerprint.substring(0, 8)}...)
                    </option>
                `;
            });
            
            managedCertSelect.innerHTML = options;
            
            // Check if we need to select a certificate based on current settings
            const currentSettings = modal.dataset.settings ? JSON.parse(modal.dataset.settings) : null;
            if (currentSettings && currentSettings.httpsCertPath) {
                // Try to find a matching certificate
                const matchingOption = Array.from(managedCertSelect.options).find(option => 
                    option.getAttribute('data-cert-path') === currentSettings.httpsCertPath &&
                    option.getAttribute('data-key-path') === currentSettings.httpsKeyPath
                );
                
                if (matchingOption) {
                    matchingOption.selected = true;
                }
            }
        })
        .catch(error => {
            console.error('Error loading certificates:', error);
            managedCertSelect.innerHTML = '<option value="">Error loading certificates</option>';
            managedCertSelect.disabled = false;
        });
}

/**
 * Show a custom confirmation dialog
 * @param {string} message - Message to display
 * @param {Function} onConfirm - Function to call when confirmed
 * @param {Function} onCancel - Function to call when canceled (optional)
 */
function showCustomConfirm(message, onConfirm, onCancel) {
    const modal = createModal({
        title: '<i class="fas fa-question-circle"></i> Confirm',
        content: `
            <div class="confirm-message">${message}</div>
            <div class="button-group">
                <button id="confirmBtn" class="primary-btn">
                    <i class="fas fa-check"></i> Yes
                </button>
                <button id="cancelBtn" class="secondary-btn">
                    <i class="fas fa-times"></i> No
                </button>
            </div>
        `,
        width: '400px'
    });
    
    // Create a promise to properly handle resolution
    return new Promise((resolve) => {
        document.getElementById('confirmBtn').addEventListener('click', () => {
            // Important: Resolve the promise before removing the modal
            resolve(true);
            
            // Call the onConfirm callback if provided
            if (typeof onConfirm === 'function') {
                onConfirm();
            }
            
            // Remove the modal
            document.body.removeChild(modal);
        });
        
        document.getElementById('cancelBtn').addEventListener('click', () => {
            // Important: Resolve the promise before removing the modal
            resolve(false);
            
            // Call the onCancel callback if provided
            if (typeof onCancel === 'function') {
                onCancel();
            }
            
            // Remove the modal
            document.body.removeChild(modal);
        });
        
        // Also handle the X button or clicking outside if you have that
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                // Important: Resolve the promise before removing the modal
                resolve(false);
                
                // Call the onCancel callback if provided
                if (typeof onCancel === 'function') {
                    onCancel();
                }
                
                // Remove the modal
                document.body.removeChild(modal);
            });
        }
    });
}

// Make the utilities available globally
if (typeof window !== 'undefined') {
    window.modalUtils = {
        createModal: createModal,
        setupTabSwitching: setupTabSwitching,
        showFileBrowser: showFileBrowser,
        ensureModalStyles: ensureModalStyles,
        checkModalUtilsLoaded: checkModalUtilsLoaded,
        setupCertificateActionListeners: setupCertificateActionListeners,
        handleCertificateButtonClick: handleCertificateButtonClick,
        setupGlobalActionButtons: setupGlobalActionButtons,
        showCertificateConfigModal: showCertificateConfigModal,
        renewCertificate: renewCertificate,
        createLoadingOverlay: createLoadingOverlay,
        showNotification: showNotification,
        showCustomConfirm: showCustomConfirm,
        createGlobalSettingsModal: createGlobalSettingsModal,
        showGlobalSettingsModal: showGlobalSettingsModal,
        setupGlobalSettingsModalEvents: setupGlobalSettingsModalEvents,
        saveGlobalSettings: saveGlobalSettings,
        loadCertificatesForHttps: loadCertificatesForHttps,
        isLoaded: function() { return true; }
    };
    console.log("Modal utilities registered in window object");
}

// Auto-initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('Modal utilities initializing...');
    
    // Create styles
    ensureModalStyles();
    
    // First attempt to set up global action buttons
    setupGlobalActionButtons();
    
    // Initialize a test function to confirm the module is working
    if (typeof window.modalUtils.checkModalUtilsLoaded === 'function') {
        window.modalUtils.checkModalUtilsLoaded();
    } else {
        console.error('Modal utility test function not available!');
    }
});