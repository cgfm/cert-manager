/**
 * Modal utilities for consistent modal handling
 * @module modal-utils - Modal utilities for creating and managing modals in the application.
 * @requires ui-utils - UI utilities for common UI interactions
 * @requires filesystem-service - Filesystem service for file operations
 * @requires certificate-service - Certificate service for managing certificates
 * @requires renewal-manager - Renewal manager for handling certificate renewals
 * @requires scheduler-service - Scheduler service for managing scheduled tasks
 * @requires config-manager - Configuration manager for loading and saving settings
 * @requires logger - Logger utility for debugging
 * @requires certificate-utils - Certificate utilities for handling certificate operations
 * @requires filesystem-utils - Filesystem utilities for file operations
 * @version 1.0.0
 * @license MIT
 * @description This module provides utility functions for creating and managing modals in the application. It includes functions for setting up modal behaviors, handling file browsing, and managing certificate actions. The modals are styled to be consistent with the application's design language.
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
        logger.info('Adding modal styles dynamically');
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
        logger.info('Modal styles added');
    } else {
        logger.info('Modal styles already exist');
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
    
    logger.info('Creating modal with options:', options);
    
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
    logger.info(`Modal created and added to document with ID: ${modal.id}`);
    
    // Add close handler
    const closeBtn = modal.querySelector('.close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            try {
                document.body.removeChild(modal);
                logger.info(`Modal ${modal.id} closed`);
                if (typeof settings.onClose === 'function') {
                    settings.onClose();
                }
            } catch (err) {
                logger.error('Error closing modal:', err);
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
                logger.info(`Modal ${modal.id} closed via ESC key`);
                if (typeof settings.onClose === 'function') {
                    settings.onClose();
                }
            } catch (error) {
                logger.error('Error handling ESC key:', error);
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
        logger.info("Opening file browser modal");
    
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
                logger.error("File list element not found");
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
                logger.error('Error loading directory:', error);
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
                    logger.info(`Updated input ${inputSelector} with path: ${currentPath}`);
                } else {
                    logger.error(`Target input not found: ${inputSelector}`);
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
    logger.info("Modal utilities loaded successfully!");
    return true;
}

/**
 * Set up event listeners for certificate action buttons
 * Uses event delegation for better performance and to handle dynamically added elements
 */
function setupCertificateActionListeners() {
    logger.info('Setting up certificate action listeners');
    
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
        logger.warn('No certificate containers found on page');
        // Still set up global action buttons
        setupGlobalActionButtons();
        return;
    }
    
    logger.info(`Found ${certificateContainers.length} potential certificate containers`);
    
    // Set up event delegation on each container
    certificateContainers.forEach(container => {
        // Check if this container has certificate rows or buttons
        const hasCertElements = container.querySelector('.cert-row') || 
                             container.querySelector('[data-fingerprint]') ||
                             container.querySelector('.config-btn') ||
                             container.querySelector('.renew-btn');
        
        if (hasCertElements) {
            logger.info(`Container ${container.id || container.className || 'unknown'} has certificate elements`);
            
            // Remove existing listeners by cloning the node
            const newContainer = container.cloneNode(true);
            container.parentNode.replaceChild(newContainer, container);
            
            // Add event listener with event delegation
            newContainer.addEventListener('click', handleCertificateButtonClick);
            logger.info(`Set up event delegation on container: ${newContainer.id || newContainer.className || 'unknown'}`);
        } else {
            logger.info(`Container ${container.id || container.className || 'unknown'} has no certificate elements yet`);
            
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
                            logger.info('Certificate elements added to the DOM, setting up listeners');
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
            logger.info(`Set up mutation observer on container: ${container.id || container.className || 'unknown'}`);
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
        logger.warn('Button clicked without associated fingerprint:', button);
        return;
    }
    
    logger.info(`Button clicked: ${button.className} for certificate: ${fingerprint}`);
    
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
        logger.info(`Set up create certificate button: ${newButton.id || newButton.className}`);
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
        logger.info(`Set up settings button: ${newButton.id || newButton.className}`);
    });
}

/**
 * Show global settings modal
 */
function showGlobalSettingsModal() {
    logger.info('Showing global settings modal');
    
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
            
            logger.error('Error loading settings:', error);
            
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
                jsonOutput: false,
                enableAutoRenewalJob: false,
                renewalSchedule: '0 0 * * *'
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
                <button class="tab-btn" data-tab="scheduler">Scheduler</button>
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
                
                <!-- Scheduler tab -->
                <div id="scheduler-tab" class="tab-content">
                    <div class="scheduler-container">
                        <div class="scheduler-header">
                            <div class="status-indicator ${settings.enableAutoRenewalJob !== false ? 'status-active' : 'status-inactive'}"></div>
                            <div class="status-text">${settings.enableAutoRenewalJob !== false ? 'Scheduler Active' : 'Scheduler Inactive'}</div>
                        </div>
                        
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label class="toggle-switch">
                                <input type="checkbox" id="enableAutoRenewalJob" ${settings.enableAutoRenewalJob !== false ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                                <span class="toggle-label-text">Enable scheduled certificate renewal checks</span>
                            </label>
                            <p class="form-help-text" style="margin-top: 10px; margin-left: 60px;">
                                When enabled, the system will automatically check for and renew certificates according to the schedule
                            </p>
                        </div>
                        
                        <div id="scheduleSettingsGroup" class="schedule-setting" style="display: ${settings.enableAutoRenewalJob !== false ? 'block' : 'none'}">
                            <h4><i class="fas fa-calendar-alt"></i> Schedule Configuration</h4>
                            
                            <label for="renewalSchedule">Renewal Schedule (Cron Format):</label>
                            <div class="input-group">
                                <input type="text" id="renewalSchedule" class="form-control" 
                                       value="${settings.renewalSchedule || '0 0 * * *'}" 
                                       placeholder="0 0 * * *">
                                <div class="dropdown">
                                    <button class="dropdown-toggle" type="button">
                                        <i class="fas fa-clock"></i> Presets
                                    </button>
                                    <div class="dropdown-menu">
                                        <a class="dropdown-item" href="#" data-schedule="0 0 * * *">
                                            <i class="fas fa-moon"></i> Daily at midnight
                                        </a>
                                        <a class="dropdown-item" href="#" data-schedule="0 0 */2 * *">
                                            <i class="fas fa-calendar-day"></i> Every 2 days
                                        </a>
                                        <a class="dropdown-item" href="#" data-schedule="0 0 * * 0">
                                            <i class="fas fa-calendar-week"></i> Weekly (Sunday)
                                        </a>
                                        <a class="dropdown-item" href="#" data-schedule="0 0 1 * *">
                                            <i class="fas fa-calendar"></i> Monthly (1st)
                                        </a>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="scheduler-info">
                                <i class="fas fa-info-circle"></i>
                                <div>
                                    <p>Use cron format: <code>minute hour day-of-month month day-of-week</code></p>
                                    <p>Example: <code>0 0 * * *</code> = Daily at midnight UTC</p>
                                </div>
                            </div>
                            
                            <div id="nextExecutionInfo" class="next-execution">
                                <i class="fas fa-clock"></i> Next execution: Loading...
                            </div>
                        </div>
                    </div>
                    
                    <div class="manual-check-container">
                        <h4><i class="fas fa-sync-alt"></i> Manual Certificate Check</h4>
                        <p>Run a renewal check now to identify and renew certificates that are nearing expiration.</p>
                        
                        <button id="runManualCheck" class="primary-btn">
                            <i class="fas fa-play-circle"></i> Run Certificate Renewal Check Now
                        </button>
                        
                        <div id="lastCheckStatus" class="lastrun-indicator">
                            <i class="fas fa-history"></i> Last check: Never
                        </div>
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
    
    // Load scheduler status after modal is created
    loadSchedulerStatus(modal);
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
    
    setupSchedulerEvents(modal);

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
 * Load scheduler status and update the modal
 * @param {HTMLElement} modal - The modal element
 */
function loadSchedulerStatus(modal) {
    // Only proceed if the scheduler tab exists
    const schedulerTab = modal.querySelector('#scheduler-tab');
    if (!schedulerTab) return;
    
    fetch('/api/scheduler/status')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load scheduler status: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Update the UI elements
            const enableCheckbox = modal.querySelector('#enableAutoRenewalJob');
            const scheduleInput = modal.querySelector('#renewalSchedule');
            const scheduleSettingsGroup = modal.querySelector('#scheduleSettingsGroup');
            const lastCheckStatus = modal.querySelector('#lastCheckStatus');
            const statusIndicator = modal.querySelector('.status-indicator');
            const statusText = modal.querySelector('.status-text');
            
            if (enableCheckbox) {
                enableCheckbox.checked = data.enabled;
                
                if (scheduleSettingsGroup) {
                    scheduleSettingsGroup.style.display = data.enabled ? 'block' : 'none';
                }
                
                // Update status indicator
                if (statusIndicator && statusText) {
                    if (data.enabled) {
                        statusIndicator.classList.remove('status-inactive');
                        statusIndicator.classList.add('status-active');
                        statusText.textContent = 'Scheduler Active';
                    } else {
                        statusIndicator.classList.remove('status-active');
                        statusIndicator.classList.add('status-inactive');
                        statusText.textContent = 'Scheduler Inactive';
                    }
                }
            }
            
            if (scheduleInput) {
                scheduleInput.value = data.schedule || '0 0 * * *';
            }
            
            if (lastCheckStatus) {
                if (data.lastRun) {
                    const lastRunDate = new Date(data.lastRun);
                    lastCheckStatus.innerHTML = `<i class="fas fa-history"></i> Last check: ${lastRunDate.toLocaleString()}`;
                } else {
                    lastCheckStatus.innerHTML = `<i class="fas fa-history"></i> Last check: Never`;
                }
            }
            
            // Display next execution info
            const nextExecutionInfo = modal.querySelector('#nextExecutionInfo');
            if (nextExecutionInfo && data.nextExecution) {
                nextExecutionInfo.innerHTML = `<i class="fas fa-clock"></i> Next execution: ${data.nextExecution.message || 'Not scheduled'}`;
                nextExecutionInfo.style.display = data.enabled ? 'block' : 'none';
            }
        })
        .catch(error => {
            logger.error('Error loading scheduler status:', error);
            showNotification(`Error loading scheduler status: ${error.message}`, 'error');
        });
}

/**
 * Set up scheduler-specific events
 * @param {HTMLElement} modal - The modal element
 */
function setupSchedulerEvents(modal) {
    // Toggle settings visibility based on checkbox
    const enableAutoRenewalJob = modal.querySelector('#enableAutoRenewalJob');
    const scheduleSettingsGroup = modal.querySelector('#scheduleSettingsGroup');
    const statusIndicator = modal.querySelector('.status-indicator');
    const statusText = modal.querySelector('.status-text');
    
    if (enableAutoRenewalJob && scheduleSettingsGroup) {
        enableAutoRenewalJob.addEventListener('change', () => {
            scheduleSettingsGroup.style.display = enableAutoRenewalJob.checked ? 'block' : 'none';
            
            // Update status indicator
            if (statusIndicator && statusText) {
                if (enableAutoRenewalJob.checked) {
                    statusIndicator.classList.remove('status-inactive');
                    statusIndicator.classList.add('status-active');
                    statusText.textContent = 'Scheduler Active';
                } else {
                    statusIndicator.classList.remove('status-active');
                    statusIndicator.classList.add('status-inactive');
                    statusText.textContent = 'Scheduler Inactive';
                }
            }
        });
    }
    
    // Set up dropdown toggle functionality
    const dropdownToggle = modal.querySelector('.dropdown-toggle');
    const dropdownMenu = modal.querySelector('.dropdown-menu');
    
    if (dropdownToggle && dropdownMenu) {
        dropdownToggle.addEventListener('click', (e) => {
            e.preventDefault();
            dropdownMenu.classList.toggle('show');
            
            // Close dropdown when clicking outside
            document.addEventListener('click', function closeDropdown(event) {
                if (!event.target.closest('.dropdown')) {
                    dropdownMenu.classList.remove('show');
                    document.removeEventListener('click', closeDropdown);
                }
            });
        });
    }
    
    // Set up cron schedule presets
    const presetItems = modal.querySelectorAll('.dropdown-item[data-schedule]');
    const scheduleInput = modal.querySelector('#renewalSchedule');
    
    if (presetItems.length && scheduleInput) {
        presetItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                scheduleInput.value = item.getAttribute('data-schedule');
                dropdownMenu.classList.remove('show');
            });
        });
    }
    
    // Set up manual check button
    const runManualCheck = modal.querySelector('#runManualCheck');
    if (runManualCheck) {
        runManualCheck.addEventListener('click', () => {
            // Update button state
            const originalText = runManualCheck.innerHTML;
            runManualCheck.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Running...';
            runManualCheck.disabled = true;
            
            // Call API
            fetch('/api/scheduler/run', {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                // Reset button state
                runManualCheck.innerHTML = originalText;
                runManualCheck.disabled = false;
                
                if (data.success) {
                    showNotification('Certificate renewal check completed successfully', 'success');
                    
                    // Update last check status
                    const lastCheckStatus = modal.querySelector('#lastCheckStatus');
                    if (lastCheckStatus) {
                        lastCheckStatus.innerHTML = `<i class="fas fa-history"></i> Last check: ${new Date().toLocaleString()}`;
                    }
                } else {
                    showNotification(`Error: ${data.error || 'Failed to run check'}`, 'error');
                }
            })
            .catch(error => {
                logger.error('Error running manual check:', error);
                showNotification(`Error running check: ${error.message}`, 'error');
                
                // Reset button state
                runManualCheck.innerHTML = originalText;
                runManualCheck.disabled = false;
            });
        });
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
    
    // Scheduler tab
    updatedSettings.enableAutoRenewalJob = modal.querySelector('#enableAutoRenewalJob')?.checked;
    updatedSettings.renewalSchedule = modal.querySelector('#renewalSchedule')?.value || '0 0 * * *';
    
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
    .then(() => {
        // Save scheduler settings separately
        return fetch('/api/scheduler/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                enableAutoRenewalJob: updatedSettings.enableAutoRenewalJob,
                renewalSchedule: updatedSettings.renewalSchedule
            })
        });
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Failed to save scheduler settings: ${response.status} ${response.statusText}`);
        }
        return response.json();
    })
    .then(() => {
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
        
        logger.error('Error saving settings:', error);
        showNotification(`Error saving settings: ${error.message}`, 'error');
    });
}

/**
 * Show a certificate configuration modal
 * @param {string} fingerprint - Certificate fingerprint
 */
function showCertificateConfigModal(fingerprint) {
    logger.info(`Showing certificate config modal for: ${fingerprint}`);
    
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
    logger.error('showConfigModal function not found');
    alert('Certificate configuration functionality is not available. Please refresh the page.');
}

/**
 * Renew a certificate
 * @param {string} fingerprint - Certificate fingerprint
 */
function renewCertificate(fingerprint) {
    logger.info(`Renewing certificate: ${fingerprint}`);
    
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
        logger.error('Error renewing certificate:', error);
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
 * Load certificates for HTTPS configuration
 * @param {HTMLElement} modal - The modal element containing the certificate dropdown
 */
function loadCertificatesForHttps(modal) {
    logger.info('Loading certificates for HTTPS configuration');
    
    const managedCertSelect = modal.querySelector('#managedCertName');
    if (!managedCertSelect) {
        logger.error('Certificate select element not found');
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
            logger.error('Error loading certificates:', error);
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

// Global tracking of active notifications to prevent duplicates
const activeNotifications = new Map();

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Notification type (success, error, warning, info)
 * @param {number} duration - How long to show the notification in ms
 */
function showNotification(message, type = 'info', duration = 5000) {
    // Check if the exact same notification is already active
    const notificationKey = `${message}-${type}`;
    if (activeNotifications.has(notificationKey)) {
        // Instead of just returning the existing notification, 
        // reset its timeout to ensure it stays visible
        const existingNotification = activeNotifications.get(notificationKey);
        if (existingNotification.autoCloseTimeout) {
            clearTimeout(existingNotification.autoCloseTimeout);
        }
        
        // Set a new timeout if duration > 0
        if (duration > 0) {
            existingNotification.autoCloseTimeout = setTimeout(() => {
                removeNotification(existingNotification, notificationKey);
            }, duration);
        }
        
        return existingNotification;
    }
    
    // Create container if it doesn't exist
    let container = document.querySelector('.notification-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        container.style.position = 'fixed';
        container.style.top = '20px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
    }
    
    // Create notification element with a unique ID
    const notificationId = `notification-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const notification = document.createElement('div');
    notification.id = notificationId;
    notification.className = `notification ${type}`;
    notification.setAttribute('data-notification-key', notificationKey);
    
    // Apply styles
    notification.style.backgroundColor = type === 'success' ? '#d4edda' :
                                        type === 'error' ? '#f8d7da' :
                                        type === 'warning' ? '#fff3cd' : '#d1ecf1';
    notification.style.color = type === 'success' ? '#155724' :
                              type === 'error' ? '#721c24' :
                              type === 'warning' ? '#856404' : '#0c5460';
    notification.style.padding = '15px';
    notification.style.marginBottom = '10px';
    notification.style.borderRadius = '4px';
    notification.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    notification.style.transition = 'transform 0.5s ease-out, opacity 0.5s ease-out';
    notification.style.transform = 'translateX(100%)';
    notification.style.opacity = '0';
    notification.style.cursor = 'default'; // Add cursor style to indicate it's interactive
    
    // Track mouse hover state to prevent closing while hovering
    notification.isHovered = false;
    
    // Add icon based on type
    const icon = type === 'success' ? 'fa-check-circle' :
                type === 'error' ? 'fa-exclamation-circle' :
                type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle';
    
    notification.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
                <i class="fas ${icon}" style="margin-right: 10px;"></i>
                ${message}
            </div>
            <button class="close-notification" style="background: none; border: none; cursor: pointer; font-size: 16px;">
                &times;
            </button>
        </div>
    `;
    
    // Add to container first so we can reference it
    container.appendChild(notification);
    
    // Set up close button
    const closeButton = notification.querySelector('.close-notification');
    if (closeButton) {
        closeButton.addEventListener('click', (e) => {
            logger.info("Close button clicked for notification:", notificationKey);
            e.preventDefault();
            e.stopPropagation();
            
            // Call removeNotification with the correct parameters
            removeNotification(notification, notificationKey);
        });
    }
    
    // Add mouseenter and mouseleave event listeners
    notification.addEventListener('mouseenter', () => {
        logger.info('Mouse entered notification, pausing auto-close');
        notification.isHovered = true;
        
        // Clear the auto-close timeout when hovering
        if (notification.autoCloseTimeout) {
            clearTimeout(notification.autoCloseTimeout);
            notification.autoCloseTimeout = null;
        }
    });
    
    notification.addEventListener('mouseleave', () => {
        logger.info('Mouse left notification, resuming auto-close');
        notification.isHovered = false;
        
        // Resume auto-close timeout when no longer hovering
        if (duration > 0) {
            notification.autoCloseTimeout = setTimeout(() => {
                removeNotification(notification, notificationKey);
            }, duration);
        }
    });
    
    // Function to safely remove a notification
    function removeNotification(notif, key) {
        logger.info("Starting to remove notification:", key);
        
        // Check if notification is currently being hovered
        if (notif.isHovered) {
            logger.info("Notification is being hovered, not removing");
            return;
        }
        
        const id = notif.id;
        if (!id) {
            logger.error("Notification ID not found");
            activeNotifications.delete(key);
            return;
        }
        
        try {
            // Get notification element by ID to ensure we have the current DOM reference
            const notifElement = document.getElementById(id);
            if (!notifElement) {
                logger.info("Notification element not found in DOM, removing from tracking");
                activeNotifications.delete(key);
                return;
            }
            
            // Clear any existing timeout
            if (notif.autoCloseTimeout) {
                clearTimeout(notif.autoCloseTimeout);
                notif.autoCloseTimeout = null;
            }
            
            // Apply the exit animation 
            logger.info("Applying exit animation");
            notifElement.style.transform = 'translateX(100%)';
            notifElement.style.transitionDuration = '500ms';
            notifElement.style.opacity = '0';
            
            // Set a data attribute to mark it as being removed
            notifElement.setAttribute('data-removing', 'true');
            
            // Wait for the animation to complete before removing from the DOM
            setTimeout(() => {
                try {
                    // Get a fresh reference to ensure it still exists
                    const elementToRemove = document.getElementById(id);
                    if (!elementToRemove) {
                        logger.info("Element already removed during animation");
                        activeNotifications.delete(key);
                        return;
                    }
                    
                    // Get the parent now while we know it exists
                    const parent = elementToRemove.parentNode;
                    if (!parent) {
                        logger.info("Parent node not found");
                        activeNotifications.delete(key);
                        return;
                    }
                    
                    // Remove from DOM
                    parent.removeChild(elementToRemove);
                    logger.info("Notification smoothly removed from DOM");
                    
                    // Clean up container if empty
                    const container = document.querySelector('.notification-container');
                    if (container && container.children.length === 0 && container.parentNode) {
                        container.parentNode.removeChild(container);
                        logger.info("Empty notification container removed");
                    }
                    
                    // Remove from tracking
                    activeNotifications.delete(key);
                } catch (err) {
                    logger.error("Error finalizing notification removal:", err);
                    activeNotifications.delete(key);
                }
            }, 300); // Wait for the animation duration (300ms is typical)
        } catch (error) {
            logger.error("Error in removeNotification:", error);
            // Ensure we clean up tracking even on error
            activeNotifications.delete(key);
        }
    }
    
    // Track this notification
    activeNotifications.set(notificationKey, notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
        notification.style.opacity = '1';
    }, 10);
    
    // Auto close after duration
    if (duration > 0) {
        notification.autoCloseTimeout = setTimeout(() => {
            logger.info("Auto-close timeout triggered");
            removeNotification(notification, notificationKey);
        }, duration);
    }
    
    // Return the notification element in case it needs to be referenced
    return notification;
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
        showCustomConfirm: showCustomConfirm,
        createGlobalSettingsModal: createGlobalSettingsModal,
        showGlobalSettingsModal: showGlobalSettingsModal,
        setupGlobalSettingsModalEvents: setupGlobalSettingsModalEvents,
        saveGlobalSettings: saveGlobalSettings,
        loadCertificatesForHttps: loadCertificatesForHttps,
        showNotification: showNotification,
        isLoaded: function() { return true; }
    };
    logger.info("Modal utilities registered in window object");
}

// Auto-initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    logger.info('Modal utilities initializing...');
    
    // Create styles
    ensureModalStyles();
    
    // First attempt to set up global action buttons
    setupGlobalActionButtons();
    
    // Initialize a test function to confirm the module is working
    if (typeof window.modalUtils.checkModalUtilsLoaded === 'function') {
        window.modalUtils.checkModalUtilsLoaded();
    } else {
        logger.error('Modal utility test function not available!');
    }
});