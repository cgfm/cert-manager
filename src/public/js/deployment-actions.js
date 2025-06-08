/**
 * @fileoverview Deployment Actions Module - Comprehensive certificate deployment management
 * 
 * This module provides a complete interface for creating, editing, and managing certificate
 * deployment actions. It supports multiple deployment types including Docker containers,
 * file system operations, SSH/SFTP transfers, FTP operations, email notifications,
 * webhook calls, and custom shell commands.
 * 
 * Key Features:
 * - Modal-based action creation and editing
 * - Real-time form validation and error handling
 * - Dynamic field rendering based on deployment type
 * - Docker container and NPM certificate integration
 * - File path validation and credential management
 * - Sortable action lists with drag-and-drop support
 * - Comprehensive logging and error reporting
 * 
 * Deployment Types Supported:
 * - copy: File system copy operations
 * - docker: Docker container certificate deployment
 * - ssh: SSH/SFTP secure file transfers
 * - ftp: FTP/FTPS file transfers
 * - email: Email notification with certificate attachments
 * - webhook: HTTP webhook POST requests
 * - shell: Custom shell command execution
 * 
 * Dependencies:
 * - Logger (global logging service)
 * - Modal utilities for UI management
 * - Form validation utilities
 * - Docker and NPM integration services
 * 
 * @module public/deployment-actions
 * @version 1.0.0
 * @author Certificate Manager Team
 */

// Module state
const DeploymentActions = {
  // Current state
  state: {
    editingAction: null,
    editingActionIndex: null,
    formChanged: false,
    dockerContainers: [],
    npmCertificates: []
  },
  
  // DOM element cache
  elements: {},
  
  // Constants
  constants: {
    modalId: "deployment-action-modal",
    formId: "deployment-action-form",
    formTemplate: "/templates/deployment-action-form.html"
  },
    /**
   * Initialize the deployment actions module.
   * Sets up event handlers and prepares the module for use.
   * This should be called once when the page loads.
   * 
   * @method init
   * @memberof DeploymentActions
   */
  init() {
    Logger.debug("Initializing deployment actions module");
    this.attachEventHandlers();
  },
  
  /**
   * Attach event handlers to global DOM elements.
   * Finds and binds click handlers to action buttons and form elements.
   * 
   * @method attachEventHandlers
   * @memberof DeploymentActions
   * @private
   */
  attachEventHandlers() {
    // Find and initialize the add action button if available
    const addButton = document.getElementById("add-deployment-action-btn");
    if (addButton) {
      Logger.debug("Found add deployment action button, attaching handler");
      addButton.addEventListener("click", () => this.showActionForm());
    }
  },
  
  /**
   * Show the deployment action form modal for creating or editing actions.
   * Handles both add and edit modes based on the provided parameters.
   * 
   * @method showActionForm
   * @memberof DeploymentActions
   * @param {Object} [existingAction=null] - Existing action object for edit mode
   * @param {string} existingAction.type - The deployment action type (copy, docker, ssh, etc.)
   * @param {string} existingAction.name - Display name for the action
   * @param {Object} existingAction.config - Configuration object specific to the action type
   * @param {number} [actionIndex=null] - Zero-based index of existing action for edit mode
   * @async
   */
  showActionForm(existingAction = null, actionIndex = null) {
    // Store action for edit mode
    this.state.editingAction = existingAction;
    this.state.editingActionIndex = actionIndex;
    
    // Reset form changed state
    this.state.formChanged = false;
    
    const isEditMode = !!existingAction;
    Logger.info(`Opening ${isEditMode ? 'edit' : 'add'} deployment action form`, 
      isEditMode ? { actionType: existingAction.type, actionName: existingAction.name } : null);
    
    // Show loading state in modal first
    UIUtils.showModal(this.constants.modalId, {
      title: isEditMode ? "Edit Deployment Action" : "Add Deployment Action",
      content: '<div class="loading-spinner medium"></div><p class="text-center mt-3">Loading form...</p>',
      size: "large",
      buttons: []
    });
    
    // Load the form template
    this.loadFormTemplate()
      .then(html => {
        // Update modal with form content and buttons
        UIUtils.updateModal(this.constants.modalId, {
          title: isEditMode ? "Edit Deployment Action" : "Add Deployment Action",
          content: html,
          buttons: [
            {
              text: "Cancel",
              type: "secondary",
              action: () => this.handleCancelAction()
            },
            {
              text: "Save Action",
              type: "primary",
              id: "save-deploy-action-btn",
              action: () => this.saveAction()
            }
          ]
        });
        
        // Initialize the form fields
        this.initializeForm();
      })
      .catch(error => {
        // Handle form loading errors
        Logger.error("Failed to load deployment action form:", error);
        
        UIUtils.updateModal(this.constants.modalId, {
          title: "Error",
          content: `
            <div class="error-message">
              <i class="fas fa-exclamation-triangle"></i>
              <p>Failed to load the deployment action form.</p>
              <p class="error-details">${error.message}</p>
            </div>
          `,
          buttons: [
            {
              text: "Close",
              type: "secondary",
              action: "close"
            },
            {
              text: "Try Again",
              type: "primary",
              action: () => this.showActionForm(existingAction, actionIndex)
            }
          ]
        });
      });
  },
  
  /**
   * Load the form template from the server
   * @returns {Promise<string>} Promise that resolves with the HTML template
   */
  loadFormTemplate() {
    return new Promise((resolve, reject) => {
      fetch(this.constants.formTemplate)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Failed to load form template (${response.status})`);
          }
          return response.text();
        })
        .then(html => resolve(html))
        .catch(error => reject(error));
    });
  },
  
  /**
   * Initialize the form with data and event handlers
   */
  initializeForm() {
    // Cache important form elements
    this.cacheFormElements();
    
    // Set up form field change tracking
    this.setupFormChangeTracking();
    
    // Get current editing state
    const { editingAction } = this.state;
    const isEditMode = !!editingAction;
    
    // If editing an action, set the action type dropdown first
    if (isEditMode && editingAction.type) {
      this.elements.actionType.value = editingAction.type;
      Logger.debug(`Set initial action type to: ${editingAction.type}`);
    }
    
    // If editing, populate name field
    if (isEditMode) {
      this.elements.actionName.value = editingAction.name || "";
      Logger.debug(`Set action name to: ${this.elements.actionName.value}`);
      
      // Set flag to indicate the name was manually specified
      window.actionNameManuallyEdited = true;
    } else {
      // For new actions, reset the flag
      window.actionNameManuallyEdited = false;
    }
    
    // Show the appropriate action type options based on selected type
    this.updateActionTypeOptions();
    
    // Set up action type change handler
    this.elements.actionType.addEventListener("change", () => {
      this.handleActionTypeChange();
    });
    
    // Set up action name autogeneration
    this.setupNameGenerationListeners();
    
    // Set up file browser buttons
    this.setupFileBrowserButtons();
    
    // Populate form fields for existing action
    if (isEditMode) {
      this.populateActionFields(editingAction);
    }
  },
  
  /**
   * Cache form elements for easy access
   */
  cacheFormElements() {
    // Base form elements
    this.elements.form = document.getElementById(this.constants.formId);
    this.elements.actionName = document.getElementById("deployment-action-name");
    this.elements.actionType = document.getElementById("deployment-action-type");
    
    // Log missing elements
    if (!this.elements.form) Logger.error("Form element not found");
    if (!this.elements.actionName) Logger.error("Action name field not found");
    if (!this.elements.actionType) Logger.error("Action type field not found");
  },
  
  /**
   * Set up form field change tracking
   */
  setupFormChangeTracking() {
    if (!this.elements.form) return;
    
    // Find all form fields
    const fields = this.elements.form.querySelectorAll("input, select, textarea");
    
    fields.forEach(field => {
      // Use the appropriate event for the field type
      const eventType = (field.type === "checkbox" || field.type === "radio") ? "change" : "input";
      
      field.addEventListener(eventType, () => {
        this.state.formChanged = true;
        Logger.debug(`Form changed: ${field.id || field.name}`);
      });
    });
  },
  
  /**
   * Handle cancellation of the action form
   */
  handleCancelAction() {
    // Check for unsaved changes
    if (this.state.formChanged) {
      const confirmed = confirm("You have unsaved changes. Are you sure you want to close?");
      if (!confirmed) return;
    }
    
    // Close the modal
    UIUtils.closeModal(this.constants.modalId);
    
    // Reset state
    this.state.editingAction = null;
    this.state.editingActionIndex = null;
    this.state.formChanged = false;
  },
  
  /**
   * Update UI when action type changes
   */
  handleActionTypeChange() {
    const newType = this.elements.actionType.value;
    Logger.debug(`Action type changed to: ${newType}`);
    
    // Mark form as changed
    this.state.formChanged = true;
    
    // Update visible options
    this.updateActionTypeOptions();
    
    // Update name if it hasn't been manually edited
    if (!window.actionNameManuallyEdited) {
      this.updateActionName();
    }
  },
  
  /**
   * Show/hide action type specific options
   */
  updateActionTypeOptions() {
    const selectedType = this.elements.actionType.value;
    Logger.debug(`Updating UI for action type: ${selectedType}`);
    
    // Hide all option sections first
    const optionSections = document.querySelectorAll(".action-type-options");
    optionSections.forEach(section => {
      section.classList.add("hidden");
    });
    
    // Show the selected section if it exists
    const selectedSection = document.getElementById(`${selectedType}-action-options`);
    if (selectedSection) {
      selectedSection.classList.remove("hidden");
      Logger.debug(`Showing options for ${selectedType}`);
      
      // Initialize type-specific UI elements and functionality
      this.initializeActionTypeHandlers(selectedType);
    } else {
      Logger.warn(`Options section not found for type: ${selectedType}`);
    }
  },
  
  /**
   * Initialize handlers specific to the selected action type
   * @param {string} actionType - The selected action type
   */
  initializeActionTypeHandlers(actionType) {
    Logger.debug(`Initializing handlers for ${actionType}`);
    
    switch (actionType) {
      case "docker-restart":
        this.loadDockerContainers();
        break;
        
      case "nginx-proxy-manager":
        this.setupNpmMethodToggle();
        break;
        
      case "ssh-copy":
        this.setupSshAuthToggle();
        break;
        
      case "smb-copy":
        this.setupSmbFields();
        break;
        
      case "ftp-copy":
        this.setupFtpFields();
        break;
        
      case "api-call":
        this.setupApiFields();
        break;
        
      case "webhook":
        this.setupWebhookFields();
        break;
        
      case "email":
        this.setupEmailFields();
        break;
    }
  },
    /**
   * Set up name generation listeners to update action name automatically
   */
  setupNameGenerationListeners() {
    // Skip if no action name field
    if (!this.elements.actionName) return;
    
    // Handle action name changes
    this.elements.actionName.addEventListener("input", () => {
      window.actionNameManuallyEdited = true;
      Logger.debug("Action name manually edited");
    });
    
    // Get fields that affect the name
    const actionTypeFields = this.getActionTypeNameFields();
    if (!actionTypeFields.length) return;
    
    // Add listeners to all fields that affect the name
    actionTypeFields.forEach(field => {
      if (!field) return;
      
      const eventType = (field.type === "checkbox" || field.type === "radio") ? "change" : "input";
      field.addEventListener(eventType, () => {
        if (!window.actionNameManuallyEdited) {
          this.updateActionName();
        }
      });
    });
  },
  
  /**
   * Get fields that affect the action name based on the selected type
   * @returns {Array} Array of HTML elements
   */
  getActionTypeNameFields() {
    const selectedType = this.elements.actionType.value;
    const fields = [];
    
    switch (selectedType) {
      case "docker-restart":
        fields.push(
          document.getElementById("docker-container-select"),
          document.getElementById("docker-container-custom")
        );
        break;
        
      case "copy":
        fields.push(
          document.getElementById("copy-source"),
          document.getElementById("copy-destination")
        );
        break;
        
      case "command":
        fields.push(document.getElementById("command-command"));
        break;
        
      case "nginx-proxy-manager":
        fields.push(
          document.getElementById("npm-method-path"),
          document.getElementById("npm-method-docker"),
          document.getElementById("npm-method-api"),
          document.getElementById("npm-path"),
          document.getElementById("npm-docker-container"),
          document.getElementById("npm-api-url")
        );
        break;
        
      case "ssh-copy":
        fields.push(
          document.getElementById("ssh-host"),
          document.getElementById("ssh-destination")
        );
        break;
        
      case "smb-copy":
        fields.push(
          document.getElementById("smb-host"),
          document.getElementById("smb-share"),
          document.getElementById("smb-destination")
        );
        break;
        
      case "ftp-copy":
        fields.push(
          document.getElementById("ftp-host"),
          document.getElementById("ftp-destination")
        );
        break;
        
      case "api-call":
        fields.push(
          document.getElementById("api-url"),
          document.getElementById("api-method")
        );
        break;
        
      case "webhook":
        fields.push(document.getElementById("webhook-url"));
        break;
        
      case "email":
        fields.push(document.getElementById("email-to"));
        break;
    }
    
    return fields.filter(field => !!field);
  },
  
  /**
   * Update action name based on the current action type and fields
   */
  updateActionName() {
    // Skip if name has been manually edited
    if (window.actionNameManuallyEdited) return;
    
    // Get the action type
    const selectedType = this.elements.actionType.value;
    if (!selectedType) return;
    
    let newName = "";
    
    switch (selectedType) {
      case "docker-restart":
        const containerSelect = document.getElementById("docker-container-select");
        const containerCustom = document.getElementById("docker-container-custom");
        
        const containerName = containerSelect && containerSelect.value 
          ? containerSelect.options[containerSelect.selectedIndex].text 
          : (containerCustom ? containerCustom.value : "");
          
        if (containerName) {
          newName = `Restart Docker container ${containerName}`;
        } else {
          newName = "Restart Docker container";
        }
        break;
        
      case "copy":
        const destination = document.getElementById("copy-destination")?.value || "";
        if (destination) {
          newName = `Copy certificate to ${destination}`;
        } else {
          newName = "Copy certificate files";
        }
        break;
        
      case "command":
        const command = document.getElementById("command-command")?.value || "";
        if (command) {
          // Use just the first part of the command
          const firstPart = command.split(" ")[0];
          newName = `Run command: ${firstPart}`;
        } else {
          newName = "Run command";
        }
        break;
        
      case "nginx-proxy-manager":
        const pathRadio = document.getElementById("npm-method-path");
        const dockerRadio = document.getElementById("npm-method-docker");
        const apiRadio = document.getElementById("npm-method-api");
        
        if (pathRadio?.checked) {
          newName = "Update NPM certificate (path)";
        } else if (dockerRadio?.checked) {
          newName = "Update NPM certificate (docker)";
        } else if (apiRadio?.checked) {
          newName = "Update NPM certificate (API)";
        } else {
          newName = "Update Nginx Proxy Manager";
        }
        break;
        
      case "ssh-copy":
        const sshHost = document.getElementById("ssh-host")?.value || "";
        const sshDest = document.getElementById("ssh-destination")?.value || "";
        
        if (sshHost) {
          newName = `Copy to ${sshHost} via SSH`;
          if (sshDest) {
            newName += ` (${sshDest})`;
          }
        } else {
          newName = "Copy via SSH";
        }
        break;
        
      case "smb-copy":
        const smbHost = document.getElementById("smb-host")?.value || "";
        const smbShare = document.getElementById("smb-share")?.value || "";
        
        if (smbHost && smbShare) {
          newName = `Copy to ${smbHost}/${smbShare} via SMB`;
        } else if (smbHost) {
          newName = `Copy to ${smbHost} via SMB`;
        } else {
          newName = "Copy via SMB";
        }
        break;
        
      case "ftp-copy":
        const ftpHost = document.getElementById("ftp-host")?.value || "";
        
        if (ftpHost) {
          newName = `Copy to ${ftpHost} via FTP`;
        } else {
          newName = "Copy via FTP";
        }
        break;
        
      case "api-call":
        const apiUrl = document.getElementById("api-url")?.value || "";
        const apiMethod = document.getElementById("api-method")?.value || "POST";
        
        if (apiUrl) {
          try {
            const url = new URL(apiUrl);
            newName = `${apiMethod} to ${url.hostname}`;
          } catch (e) {
            newName = `${apiMethod} API call`;
          }
        } else {
          newName = "API call";
        }
        break;
        
      case "webhook":
        const webhookUrl = document.getElementById("webhook-url")?.value || "";
        
        if (webhookUrl) {
          try {
            const url = new URL(webhookUrl);
            newName = `Webhook to ${url.hostname}`;
          } catch (e) {
            newName = "Webhook call";
          }
        } else {
          newName = "Webhook call";
        }
        break;
        
      case "email":
        const emailTo = document.getElementById("email-to")?.value || "";
        
        if (emailTo) {
          newName = `Email to ${emailTo}`;
        } else {
          newName = "Send email notification";
        }
        break;
        
      default:
        newName = `${selectedType} action`;
    }
    
    // Update the name field
    if (this.elements.actionName && newName) {
      this.elements.actionName.value = newName;
      Logger.debug(`Updated action name to: ${newName}`);
    }
  },
  
  /**
   * Set up file browser buttons for path fields
   */
  setupFileBrowserButtons() {
    // Find all file browser inputs
    const fileInputs = document.querySelectorAll('[data-file-browser]');
    
    fileInputs.forEach(input => {
      const browserId = `browse-${input.id}`;
      const browserType = input.getAttribute('data-file-browser') || 'file';
      
      // Create browse button if it doesn't exist
      if (!document.getElementById(browserId)) {
        this.addBrowseButton(input, input.id, browserType);
        Logger.debug(`Added file browser button for ${input.id}`);
      }
    });
  },
  
  /**
   * Add a browse button to a file input
   * @param {HTMLElement} input - The input element
   * @param {string} targetId - The input ID
   * @param {string} type - The browser type ('file' or 'directory')
   */
  addBrowseButton(input, targetId, type) {
    const parent = input.parentNode;
    if (!parent) {
      Logger.warn(`Cannot add browse button to ${targetId}: No parent node found`);
      return;
    }
    
    // Create input group
    const inputGroup = document.createElement('div');
    inputGroup.className = 'input-group';
    
    // Create browse button
    const browseBtn = document.createElement('button');
    browseBtn.type = 'button';
    browseBtn.className = 'btn btn-outline-secondary file-browser-btn';
    browseBtn.id = `browse-${targetId}`;
    browseBtn.innerHTML = '<i class="fas fa-folder-open"></i>';
    browseBtn.title = type === 'directory' ? 'Browse for directory' : 'Browse for file';
    
    // Add click handler
    browseBtn.addEventListener('click', () => {
      this.openFileBrowser(targetId, type, input.value);
    });
    
    // Restructure DOM
    parent.removeChild(input);
    inputGroup.appendChild(input);
    inputGroup.appendChild(browseBtn);
    parent.appendChild(inputGroup);
    
    Logger.debug(`Created new input group for ${targetId} with browse button ${browseBtn.id}`);
  },
  
  /**
   * Open file browser dialog
   * @param {string} targetId - Target input ID
   * @param {string} type - Browser type ('file' or 'directory')
   * @param {string} currentPath - Current path value
   */
  openFileBrowser(targetId, type, currentPath) {
    Logger.info(`Opening file browser for ${targetId}, type: ${type}, currentPath: ${currentPath}`);
    
    // Check if the file browser module is available
    if (typeof initializeFileBrowser !== 'function') {
      Logger.error("File browser module not loaded");
      UIUtils.showToast("File browser module not loaded", "error");
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
          // Trigger an input event to update dependent fields
          input.dispatchEvent(new Event('input'));
        }
      },
      // Use directory mode for directory type
      type === 'directory'
    );
  },
  
  /**
   * Populate form fields for an existing action
   * @param {Object} action - The action to populate
   */
  populateActionFields(action) {
    if (!action) return;
    
    Logger.debug(`Populating fields for action type: ${action.type}`);
    
    // Call the appropriate method to populate fields based on action type
    switch (action.type) {
      case "docker-restart":
        this.populateDockerRestartFields(action);
        break;
        
      case "copy":
        this.populateCopyFields(action);
        break;
        
      case "command":
        this.populateCommandFields(action);
        break;
        
      case "nginx-proxy-manager":
        this.populateNpmFields(action);
        break;
        
      case "ssh-copy":
        this.populateSshFields(action);
        break;
        
      case "smb-copy":
        this.populateSmbFields(action);
        break;
        
      case "ftp-copy":
        this.populateFtpFields(action);
        break;
        
      case "api-call":
        this.populateApiFields(action);
        break;
        
      case "webhook":
        this.populateWebhookFields(action);
        break;
        
      case "email":
        this.populateEmailFields(action);
        break;
        
      default:
        Logger.warn(`No population method for action type: ${action.type}`);
    }
  },
  
  /**
   * Populate Docker restart fields
   * @param {Object} action - The action to populate
   */
  populateDockerRestartFields(action) {
    // Container ID or name might be stored in different fields
    const containerField = document.getElementById("docker-container-custom");
    if (containerField) {
      if (action.containerId) {
        containerField.value = action.containerId;
      } else if (action.containerName) {
        containerField.value = action.containerName;
      }
    }
    
    // Load Docker containers which will populate the dropdown
    this.loadDockerContainers();
  },
  
  /**
   * Populate copy action fields
   * @param {Object} action - The action to populate
   */
  populateCopyFields(action) {
    const sourceField = document.getElementById("copy-source");
    const destField = document.getElementById("copy-destination");
    const permissionsField = document.getElementById("copy-permissions");
    
    if (sourceField) {
      sourceField.value = action.source || "cert";
    }
    
    if (destField) {
      destField.value = action.destination || "";
    }
    
    if (permissionsField && action.permissions) {
      // Convert from decimal to octal representation
      permissionsField.value = action.permissions.toString(8);
    }
  },
  
  /**
   * Populate command action fields
   * @param {Object} action - The action to populate
   */
  populateCommandFields(action) {
    const commandField = document.getElementById("command-command");
    const cwdField = document.getElementById("command-cwd");
    const verboseField = document.getElementById("command-verbose");
    
    if (commandField) {
      commandField.value = action.command || "";
    }
    
    if (cwdField) {
      cwdField.value = action.cwd || "";
    }
    
    if (verboseField) {
      verboseField.checked = !!action.verbose;
    }
  },
    /**
   * Populate Nginx Proxy Manager fields
   * @param {Object} action - The action to populate
   */
  populateNpmFields(action) {
    // Set method radio buttons
    const pathRadio = document.getElementById("npm-method-path");
    const dockerRadio = document.getElementById("npm-method-docker");
    const apiRadio = document.getElementById("npm-method-api");
    
    // Path method fields
    if (action.npmPath) {
      if (pathRadio) pathRadio.checked = true;
      const pathField = document.getElementById("npm-path");
      if (pathField) pathField.value = action.npmPath;
    } 
    // Docker method fields
    else if (action.dockerContainer) {
      if (dockerRadio) dockerRadio.checked = true;
      const containerField = document.getElementById("npm-docker-container");
      if (containerField) containerField.value = action.dockerContainer;
    } 
    // API method fields
    else if (action.method === 'api' || action.npmUrl) {
      if (apiRadio) apiRadio.checked = true;
      const apiUrlField = document.getElementById("npm-api-url");
      if (apiUrlField && action.npmUrl) apiUrlField.value = action.npmUrl;
    }
    
    // Set common options
    const restartOption = document.getElementById("npm-restart-services");
    if (restartOption) restartOption.checked = !!action.restartServices;
    
    const verifyOption = document.getElementById("npm-verify-update");
    if (verifyOption) verifyOption.checked = !!action.verifyUpdate;
    
    // Setup NPM method toggle which will handle loading certificates
    this.setupNpmMethodToggle();
  },
  
  /**
   * Populate SSH copy fields
   * @param {Object} action - The action to populate
   */
  populateSshFields(action) {
    const hostField = document.getElementById("ssh-host");
    const portField = document.getElementById("ssh-port");
    const usernameField = document.getElementById("ssh-username");
    const sourceField = document.getElementById("ssh-source");
    const destinationField = document.getElementById("ssh-destination");
    const permissionsField = document.getElementById("ssh-permissions");
    const commandField = document.getElementById("ssh-command");
    const verboseField = document.getElementById("ssh-verbose");
    
    // Basic fields
    if (hostField) hostField.value = action.host || "";
    if (portField) portField.value = action.port || 22;
    if (usernameField) usernameField.value = action.username || "";
    if (sourceField) sourceField.value = action.source || "cert";
    if (destinationField) destinationField.value = action.destination || "";
    if (commandField) commandField.value = action.command || "";
    if (verboseField) verboseField.checked = !!action.verbose;
    
    // Set permissions if defined
    if (permissionsField && action.permissions) {
      permissionsField.value = action.permissions.toString(8);
    }
    
    // Set authentication method
    const passwordAuthBtn = document.getElementById("ssh-auth-password");
    const keyAuthBtn = document.getElementById("ssh-auth-key");
    const passwordField = document.getElementById("ssh-password");
    const keyField = document.getElementById("ssh-private-key");
    const passphraseField = document.getElementById("ssh-passphrase");
    
    // Show/hide appropriate auth fields
    if (action.password) {
      if (passwordAuthBtn) passwordAuthBtn.checked = true;
      if (passwordField) passwordField.value = action.password;
      
      // Show password fields, hide key fields
      document.getElementById("ssh-password-group")?.classList.remove("hidden");
      document.getElementById("ssh-key-group")?.classList.add("hidden");
    } 
    else if (action.privateKey) {
      if (keyAuthBtn) keyAuthBtn.checked = true;
      if (keyField) keyField.value = action.privateKey;
      if (passphraseField) passphraseField.value = action.passphrase || "";
      
      // Show key fields, hide password fields
      document.getElementById("ssh-password-group")?.classList.add("hidden");
      document.getElementById("ssh-key-group")?.classList.remove("hidden");
    }
    
    // Setup SSH auth toggle
    this.setupSshAuthToggle();
  },
  
  /**
   * Populate SMB copy fields
   * @param {Object} action - The action to populate
   */
  populateSmbFields(action) {
    const hostField = document.getElementById("smb-host");
    const shareField = document.getElementById("smb-share");
    const usernameField = document.getElementById("smb-username");
    const passwordField = document.getElementById("smb-password");
    const domainField = document.getElementById("smb-domain");
    const sourceField = document.getElementById("smb-source");
    const destinationField = document.getElementById("smb-destination");
    const verboseField = document.getElementById("smb-verbose");
    
    if (hostField) hostField.value = action.host || "";
    if (shareField) shareField.value = action.share || "";
    if (usernameField) usernameField.value = action.username || "";
    if (passwordField) passwordField.value = action.password || "";
    if (domainField) domainField.value = action.domain || "";
    if (sourceField) sourceField.value = action.source || "cert";
    if (destinationField) destinationField.value = action.destination || "";
    if (verboseField) verboseField.checked = !!action.verbose;
  },
  
  /**
   * Populate FTP copy fields
   * @param {Object} action - The action to populate
   */
  populateFtpFields(action) {
    const hostField = document.getElementById("ftp-host");
    const portField = document.getElementById("ftp-port");
    const usernameField = document.getElementById("ftp-username");
    const passwordField = document.getElementById("ftp-password");
    const secureField = document.getElementById("ftp-secure");
    const sourceField = document.getElementById("ftp-source");
    const destinationField = document.getElementById("ftp-destination");
    
    if (hostField) hostField.value = action.host || "";
    if (portField) portField.value = action.port || 21;
    if (usernameField) usernameField.value = action.username || "";
    if (passwordField) passwordField.value = action.password || "";
    if (secureField) secureField.checked = !!action.secure;
    if (sourceField) sourceField.value = action.source || "cert";
    if (destinationField) destinationField.value = action.destination || "";
  },
  
  /**
   * Populate API call fields
   * @param {Object} action - The action to populate
   */
  populateApiFields(action) {
    const urlField = document.getElementById("api-url");
    const methodField = document.getElementById("api-method");
    const contentTypeField = document.getElementById("api-content-type");
    const bodyField = document.getElementById("api-body");
    const usernameField = document.getElementById("api-auth-username");
    const passwordField = document.getElementById("api-auth-password");
    const headersField = document.getElementById("api-headers");
    
    if (urlField) urlField.value = action.url || "";
    if (methodField) methodField.value = action.method || "POST";
    if (contentTypeField) contentTypeField.value = action.contentType || "application/json";
    if (bodyField) bodyField.value = action.body || "";
    if (usernameField) usernameField.value = action.username || "";
    if (passwordField) passwordField.value = action.password || "";
    
    // Format headers for display
    if (headersField && action.headers) {
      try {
        const formattedHeaders = typeof action.headers === 'object' 
          ? JSON.stringify(action.headers, null, 2)
          : action.headers;
        headersField.value = formattedHeaders;
      } catch (error) {
        Logger.warn("Error formatting API headers:", error);
        headersField.value = JSON.stringify(action.headers);
      }
    }
    
    // Show/hide body field based on method
    this.setupApiFields();
  },
  
  /**
   * Populate webhook fields
   * @param {Object} action - The action to populate
   */
  populateWebhookFields(action) {
    const urlField = document.getElementById("webhook-url");
    const methodField = document.getElementById("webhook-method");
    const contentTypeField = document.getElementById("webhook-content-type");
    const payloadField = document.getElementById("webhook-payload");
    
    if (urlField) urlField.value = action.url || "";
    if (methodField) methodField.value = action.method || "POST";
    if (contentTypeField) contentTypeField.value = action.contentType || "application/json";
    
    // Format payload for display
    if (payloadField && action.payload) {
      try {
        const formattedPayload = typeof action.payload === 'object'
          ? JSON.stringify(action.payload, null, 2)
          : action.payload;
        payloadField.value = formattedPayload;
      } catch (error) {
        Logger.warn("Error formatting webhook payload:", error);
        payloadField.value = JSON.stringify(action.payload);
      }
    }
    
    // Show/hide payload field based on method
    this.setupWebhookFields();
  },
  
  /**
   * Populate email fields
   * @param {Object} action - The action to populate
   */
  populateEmailFields(action) {
    const toField = document.getElementById("email-to");
    const subjectField = document.getElementById("email-subject");
    const bodyField = document.getElementById("email-body");
    const attachCertField = document.getElementById("email-attach-cert");
    
    if (toField) toField.value = action.to || "";
    if (subjectField) subjectField.value = action.subject || "Certificate Update Notification";
    if (bodyField) bodyField.value = action.body || "";
    if (attachCertField) attachCertField.checked = !!action.attachCert;
  },
  
  /**
   * Load Docker containers for container selection
   */
  async loadDockerContainers() {
    const containerSelect = document.getElementById("docker-container-select");
    const loadingIndicator = document.getElementById("docker-containers-loading");
    
    if (!containerSelect) {
      Logger.warn("Docker container select element not found");
      return;
    }
    
    try {
      // Show loading indicator
      if (loadingIndicator) loadingIndicator.classList.remove("hidden");
      
      // Disable select while loading
      containerSelect.disabled = true;
      containerSelect.innerHTML = '<option value="">Loading...</option>';
      
      // Fetch containers from API
      const response = await fetch('/api/docker/containers');
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Store containers
      this.state.dockerContainers = data.containers || [];
      
      // Update dropdown
      containerSelect.innerHTML = "";
      
      if (!data.dockerAvailable) {
        // Docker not available
        containerSelect.innerHTML = '<option value="">Docker not available</option>';
        containerSelect.disabled = true;
        return;
      }
      
      if (!this.state.dockerContainers.length) {
        // No containers found
        containerSelect.innerHTML = '<option value="">No containers found</option>';
        return;
      }
      
      // Add default option
      containerSelect.innerHTML = '<option value="">Select a container</option>';
      
      // Add container options
      this.state.dockerContainers.forEach((container) => {
        const option = document.createElement("option");
        
        // Container might have multiple names, use the first one without "/"
        let name;
        
        // Safely access the Names property
        if (container.names && Array.isArray(container.names) && container.names.length > 0) {
          name = container.names[0].replace(/^\//, "");
        } else if (container.name) {
          // Some Docker APIs might return a single Name property
          name = container.name.replace(/^\//, "");
        } else if (container.id) {
          // Fallback to ID if no name is available
          name = `Container ${container.Id.substring(0, 12)}`;
        } else {
          // Skip containers without any identifiable information
          Logger.warn("Container without ID or name found, skipping", container);
          return;
        }
        
        option.value = container.Id;
        option.textContent = name;
        containerSelect.appendChild(option);
        
        // If editing and this container matches, select it
        if (this.state.editingAction && 
           (this.state.editingAction.containerId === container.Id ||
            this.state.editingAction.containerName === name)) {
          option.selected = true;
          
          // Also clear the custom field since we have a matching container
          const customField = document.getElementById("docker-container-custom");
          if (customField) customField.value = "";
        }
      });
      
      // Enable select
      containerSelect.disabled = false;
      
      Logger.debug(`Loaded ${this.state.dockerContainers.length} Docker containers`);
      
      // Set up event listeners for the container selection
      this.setupDockerContainerSelect();
      
    } catch (error) {
      Logger.error("Error loading Docker containers:", error);
      
      // Show error in the select
      containerSelect.innerHTML = '<option value="">Error loading containers</option>';
      
      // Show toast with error
      UIUtils.showToast(`Error loading Docker containers: ${error.message}`, "error");
    } finally {
      // Hide loading indicator
      if (loadingIndicator) loadingIndicator.classList.add("hidden");
      
      // Enable select
      containerSelect.disabled = false;
    }
  },
  
  /**
   * Set up Docker container select behavior
   */
  setupDockerContainerSelect() {
    const containerSelect = document.getElementById("docker-container-select");
    const containerCustom = document.getElementById("docker-container-custom");
    
    if (!containerSelect || !containerCustom) {
      Logger.warn("Docker container selection elements not found");
      return;
    }
    
    // Handle dropdown selection changes
    containerSelect.addEventListener("change", () => {
      if (containerSelect.value) {
        // Clear custom input when selection is made
        containerCustom.value = "";
        
        // Mark the form as changed
        this.state.formChanged = true;
        
        // Update action name if not manually edited
        if (!window.actionNameManuallyEdited) {
          this.updateActionName();
        }
      }
    });
    
    // Handle custom input changes
    containerCustom.addEventListener("input", () => {
      if (containerCustom.value) {
        // Clear dropdown when custom input is used
        containerSelect.value = "";
        
        // Mark the form as changed
        this.state.formChanged = true;
        
        // Update action name if not manually edited
        if (!window.actionNameManuallyEdited) {
          this.updateActionName();
        }
      }
    });
  },
  
  /**
   * Setup toggle behavior for Nginx Proxy Manager method selection
   */
  setupNpmMethodToggle() {
    const pathMethodRadio = document.getElementById("npm-method-path");
    const dockerMethodRadio = document.getElementById("npm-method-docker");
    const apiMethodRadio = document.getElementById("npm-method-api");
    
    if (!pathMethodRadio || !dockerMethodRadio || !apiMethodRadio) {
      Logger.warn("NPM method radio buttons not found");
      return;
    }
    
    const pathGroup = document.getElementById("npm-path-group");
    const dockerGroup = document.getElementById("npm-docker-group");
    const apiGroup = document.getElementById("npm-api-group");
    const certificateSelection = document.getElementById("npm-certificate-selection");
    const npmOptions = document.getElementById("npm-options");
    
    if (!pathGroup || !dockerGroup || !apiGroup) {
      Logger.warn("NPM method groups not found");
      return;
    }
    
    // Check if we're editing an NPM action
    const isEditing = !!this.state.editingAction && this.state.editingAction.type === "nginx-proxy-manager";
    const editingAction = this.state.editingAction;
    
    // Save reference to 'this' for use in event handlers
    const self = this;
    
    // Function to update UI based on selected method
    const updateNpmMethodUI = () => {
      // Hide all groups first
      pathGroup.classList.add("hidden");
      dockerGroup.classList.add("hidden");
      apiGroup.classList.add("hidden");
      if (certificateSelection) certificateSelection.classList.add("hidden");
      if (npmOptions) npmOptions.classList.add("hidden");
      
      // Show the appropriate group
      if (pathMethodRadio.checked) {
        pathGroup.classList.remove("hidden");
        if (npmOptions) npmOptions.classList.remove("hidden");
      } else if (dockerMethodRadio.checked) {
        dockerGroup.classList.remove("hidden");
        if (npmOptions) npmOptions.classList.remove("hidden");
      } else if (apiMethodRadio.checked) {
        apiGroup.classList.remove("hidden");
        
        // If editing with API method, show certificate selection immediately
        if (isEditing && (editingAction.method === 'api' || editingAction.npmUrl)) {
          if (certificateSelection) certificateSelection.classList.remove("hidden");
          if (npmOptions) npmOptions.classList.remove("hidden");
          
          // Load certificates and select the correct one after loading
          self.loadNpmCertificates(editingAction.certificateId);
        } else {
          // Check connection status first for non-edit mode
          self.loadDeploymentSettings().then(settings => {
            const npmSettings = settings?.nginxProxyManager;
            
            if (npmSettings && npmSettings.accessToken) {
              if (certificateSelection) certificateSelection.classList.remove("hidden");
              if (npmOptions) npmOptions.classList.remove("hidden");
              
              // Load available certificates
              self.loadNpmCertificates();
            } else {
              // Need to check connection
              self.testNpmApiConnection();
            }
          });
        }
      }
      
      // Update action name if not manually edited
      if (!window.actionNameManuallyEdited) {
        self.updateActionName();
      }
      
      // Mark form as changed
      self.state.formChanged = true;
    };
    
    // Set initial state based on editing action or defaults
    if (isEditing) {
      if (editingAction.npmPath) {
        pathMethodRadio.checked = true;
        const pathField = document.getElementById("npm-path");
        if (pathField) pathField.value = editingAction.npmPath;
      } else if (editingAction.dockerContainer) {
        dockerMethodRadio.checked = true;
        const containerField = document.getElementById("npm-docker-container");
        if (containerField) containerField.value = editingAction.dockerContainer;
      } else if (editingAction.method === 'api' || editingAction.npmUrl) {
        apiMethodRadio.checked = true;
        const apiUrlField = document.getElementById("npm-api-url");
        if (apiUrlField && editingAction.npmUrl) apiUrlField.value = editingAction.npmUrl;
      }
      
      // Set common options
      const restartOption = document.getElementById("npm-restart-services");
      if (restartOption) restartOption.checked = !!editingAction.restartServices;
      
      const verifyOption = document.getElementById("npm-verify-update");
      if (verifyOption) verifyOption.checked = !!editingAction.verifyUpdate;
    } else {
      // Default to path method if not editing
      pathMethodRadio.checked = true;
    }
    
    // Update UI for initial state
    updateNpmMethodUI();
    
    // Add change listeners for radio buttons
    pathMethodRadio.addEventListener("change", function() {
      if (this.checked) {
        updateNpmMethodUI();
      }
    });
    
    dockerMethodRadio.addEventListener("change", function() {
      if (this.checked) {
        updateNpmMethodUI();
      }
    });
    
    apiMethodRadio.addEventListener("change", function() {
      if (this.checked) {
        updateNpmMethodUI();
      }
    });
    
    // Set up test connection button
    const testConnectionButton = document.getElementById("npm-test-connection");
    if (testConnectionButton) {
      testConnectionButton.addEventListener("click", this.testNpmApiConnection.bind(this));
    }
    
    // Set up request token button
    const requestTokenButton = document.getElementById("npm-request-token");
    if (requestTokenButton) {
      requestTokenButton.addEventListener("click", this.showNpmTokenRequestDialog.bind(this));
    }
    
    // Initialize fields from settings for API method
    if (apiMethodRadio.checked) {
      this.initNpmFieldsFromSettings();
    }
  },
  
  /**
   * Load deployment settings from server
   * @returns {Promise<Object>} Deployment settings
   */
  async loadDeploymentSettings() {
    if (this.state.deploymentSettings) {
      // Return cached settings if available
      return this.state.deploymentSettings;
    }
    
    try {
      Logger.debug("Loading deployment settings from server");
      const response = await fetch('/api/settings/deployment');
      
      if (!response.ok) {
        throw new Error(`Failed to load deployment settings: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data && data.success) {
        // Store settings in state for reuse
        this.state.deploymentSettings = data.deployment || {};
        Logger.debug("Deployment settings loaded successfully:", this.state.deploymentSettings);
        return this.state.deploymentSettings;
      } else {
        throw new Error(data.message || 'Failed to load deployment settings');
      }
    } catch (error) {
      Logger.error("Error loading deployment settings:", error);
      // Return an empty object to avoid null references
      return {};
    }
  },
  
  /**
   * Initialize NPM fields from global settings
   */
  async initNpmFieldsFromSettings() {
    try {
      // Fetch deployment settings if not already loaded
      const deploymentSettings = await this.loadDeploymentSettings();
      
      // Use the nginxProxyManager settings if available
      const npmSettings = deploymentSettings?.nginxProxyManager;
      
      if (npmSettings) {
        Logger.debug("Initializing NPM fields from settings:", npmSettings);
        
        // URL field
        const apiUrlField = document.getElementById("npm-api-url");
        if (apiUrlField) {
          // Build URL from host, port and protocol
          const protocol = npmSettings.useHttps ? 'https' : 'http';
          const port = npmSettings.port ? `:${npmSettings.port}` : '';
          
          if (npmSettings.host) {
            apiUrlField.value = `${protocol}://${npmSettings.host}${port}`;
          }
        }
        
        // Select API method if settings exist and have host
        if (npmSettings.host) {
          const apiMethodRadio = document.getElementById("npm-method-api");
          if (apiMethodRadio) {
            apiMethodRadio.checked = true;
            // Trigger change event to update UI
            apiMethodRadio.dispatchEvent(new Event('change'));
          }
        }
      } else {
        Logger.debug("No NPM settings found in deployment settings");
      }
    } catch (error) {
      Logger.error("Error initializing NPM fields from settings:", error);
    }
  },
  
  /**
   * Test connection to Nginx Proxy Manager API
   */
  async testNpmApiConnection() {
    const apiUrlField = document.getElementById("npm-api-url");
    const statusElement = document.getElementById("npm-api-status");
    const requestTokenButton = document.getElementById("npm-request-token");
    const certificateSelection = document.getElementById("npm-certificate-selection");
    const npmOptions = document.getElementById("npm-options");
    
    if (!apiUrlField || !statusElement) {
      Logger.error("Required NPM UI elements not found");
      return;
    }
    
    const apiUrl = apiUrlField.value.trim();
    if (!apiUrl) {
      UIUtils.showToast("Please enter the NPM API URL", "warning");
      return;
    }
    
    // Update status
    statusElement.innerHTML = '<span class="status-indicator checking"></span><span class="status-text">Testing connection...</span>';
    
    try {
      // Check if the URL is reachable
      const response = await fetch('/api/integrations/npm/check-connection', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ apiUrl })
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        statusElement.innerHTML = '<span class="status-indicator connected"></span><span class="status-text">API reachable</span>';
        
        // Next, check if we have a valid token using validate-token endpoint
        const validateTokenResponse = await fetch('/api/integrations/npm/validate-token');
        
        if (!validateTokenResponse.ok) {
          Logger.warn("Token validation request failed:", validateTokenResponse.status);
          statusElement.innerHTML = '<span class="status-indicator warning"></span><span class="status-text">Authentication required</span>';
          if (requestTokenButton) requestTokenButton.classList.remove("hidden");
          if (certificateSelection) certificateSelection.classList.add("hidden");
          return;
        }
        
        const validationResult = await validateTokenResponse.json();
        
        if (validationResult.success && validationResult.valid) {
          // We have a valid token
          statusElement.innerHTML = '<span class="status-indicator connected"></span><span class="status-text">Connected as ' + (validationResult.user?.email || 'user') + '</span>';
          if (requestTokenButton) requestTokenButton.classList.add("hidden");
          if (certificateSelection) certificateSelection.classList.remove("hidden");
          if (npmOptions) npmOptions.classList.remove("hidden");
          
          // Load certificates
          this.loadNpmCertificates();
        } else {
          // Token not valid or missing
          statusElement.innerHTML = '<span class="status-indicator warning"></span><span class="status-text">Authentication required</span>';
          if (requestTokenButton) requestTokenButton.classList.remove("hidden");
          if (certificateSelection) certificateSelection.classList.add("hidden");
        }
      } else {
        statusElement.innerHTML = '<span class="status-indicator error"></span><span class="status-text">API not reachable</span>';
        if (requestTokenButton) requestTokenButton.classList.add("hidden");
        if (certificateSelection) certificateSelection.classList.add("hidden");
      }
    } catch (error) {
      Logger.error("NPM connection test error:", error);
      statusElement.innerHTML = '<span class="status-indicator error"></span><span class="status-text">Connection failed</span>';
      if (requestTokenButton) requestTokenButton.classList.add("hidden");
      if (certificateSelection) certificateSelection.classList.add("hidden");
    }
  },
  
  /**
   * Show dialog to request a new NPM token
   */
  showNpmTokenRequestDialog() {
    const apiUrlField = document.getElementById("npm-api-url");
    const apiUrl = apiUrlField ? apiUrlField.value.trim() : '';
    
    if (!apiUrl) {
      UIUtils.showToast("Please enter the NPM API URL", "warning");
      return;
    }
    
    // Create the modal content
    UIUtils.showModal("npm-token-request-modal", {
      title: "Nginx Proxy Manager Authentication",
      content: `
        <div class="npm-token-request-form">
          <p>Please enter your NPM login credentials to obtain an API token.</p>
          <div class="form-group">
            <label for="npm-update-email">Email</label>
            <input type="email" id="npm-update-email" class="form-control" placeholder="admin@example.com">
          </div>
          <div class="form-group">
            <label for="npm-update-password">Password</label>
            <input type="password" id="npm-update-password" class="form-control" placeholder="Password">
          </div>
          <p class="info-text"><i class="fas fa-info-circle"></i> Your password is only used to obtain an API token and is not stored.</p>
        </div>
      `,
      buttons: [
        {
          text: "Cancel",
          type: "secondary",
          action: "close"
        },
        {
          text: "Get Token",
          type: "primary",
          action: async () => {
            const emailField = document.getElementById("npm-update-email");
            const passwordField = document.getElementById("npm-update-password");
            
            if (!emailField || !passwordField) return;
            
            const email = emailField.value.trim();
            const password = passwordField.value;
            
            if (!email || !password) {
              UIUtils.showToast("Please enter both email and password", "warning");
              return;
            }
            
            // Show loading state
            const getTokenButton = document.querySelector(".modal-footer button.primary");
            if (getTokenButton) {
              getTokenButton.disabled = true;
              getTokenButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Requesting...';
            }
            
            try {
              const response = await fetch('/api/integrations/npm/request-token', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ apiUrl, email, password })
              });
              
              if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
              }
              
              const result = await response.json();
              
              if (result.success) {
                // Token obtained and stored on the server
                UIUtils.showToast("NPM authentication successful", "success");
                UIUtils.closeModal("npm-token-request-modal");
                
                // Update UI to reflect authentication
                const statusElement = document.getElementById("npm-api-status");
                const requestTokenButton = document.getElementById("npm-request-token");
                const certificateSelection = document.getElementById("npm-certificate-selection");
                const npmOptions = document.getElementById("npm-options");
                
                if (statusElement) {
                  statusElement.innerHTML = '<span class="status-indicator connected"></span><span class="status-text">Authentication successful</span>';
                }
                
                if (requestTokenButton) {
                  requestTokenButton.classList.add("hidden");
                }
                
                if (certificateSelection) {
                  certificateSelection.classList.remove("hidden");
                }
                
                if (npmOptions) {
                  npmOptions.classList.remove("hidden");
                }
                
                // Load certificates
                this.loadNpmCertificates();
              } else {
                UIUtils.showToast(result.message || "Authentication failed", "error");
                
                // Reset button state
                if (getTokenButton) {
                  getTokenButton.disabled = false;
                  getTokenButton.textContent = "Get Token";
                }
              }
            } catch (error) {
              Logger.error("Error requesting NPM token:", error);
              UIUtils.showToast(`Error requesting token: ${error.message}`, "error");
              
              // Reset button state
              if (getTokenButton) {
                getTokenButton.disabled = false;
                getTokenButton.textContent = "Get Token";
              }
            }
          }
        }
      ],
      size: "medium"
    });
  },

  /**
   * Load certificates from Nginx Proxy Manager API
   * @param {string} [selectedCertId] - Certificate ID to select after loading
   */
  async loadNpmCertificates(selectedCertId) {
    const certificateSelect = document.getElementById("npm-certificate-id");
    const certificatePreview = document.getElementById("npm-certificate-preview");
    const statusElement = document.getElementById("npm-api-status");
    const requestTokenButton = document.getElementById("npm-request-token");
    
    if (!certificateSelect) {
      Logger.error("Certificate select element not found");
      return;
    }
    
    if (certificatePreview) {
      certificatePreview.classList.add("hidden");
    }
    
    // Show loading state
    certificateSelect.innerHTML = '<option value="">Loading certificates...</option>';
    certificateSelect.disabled = true;
    
    try {
      // Fetch certificates from NPM via our backend
      const response = await fetch('/api/integrations/npm/certificates');
      
      // Handle authentication errors specifically
      if (response.status === 401) {
        const errorData = await response.json();
        
        // Show authentication error UI
        certificateSelect.innerHTML = '<option value="">Authentication required</option>';
        
        if (statusElement) {
          statusElement.innerHTML = '<span class="status-indicator warning"></span><span class="status-text">Authentication required</span>';
        }
        
        if (requestTokenButton) {
          requestTokenButton.classList.remove("hidden");
        }
        
        // Show appropriate toast message
        if (errorData.needsReconfiguration) {
          UIUtils.showToast("Your NPM credentials are invalid or have expired. Please re-authenticate.", "warning");
          
          // Automatically show auth dialog
          setTimeout(() => {
            this.showNpmTokenRequestDialog();
          }, 500);
        }
        
        return;
      }
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success && Array.isArray(result.certificates)) {
        // Store certificates in state
        this.state.npmCertificates = result.certificates;
        
        // Sort certificates by domain
        const certificates = result.certificates.sort((a, b) => {
          const domainA = a.nice_name || a.domain_names?.[0] || '';
          const domainB = b.nice_name || b.domain_names?.[0] || '';
          return domainA.localeCompare(domainB);
        });
        
        if (certificates.length === 0) {
          certificateSelect.innerHTML = '<option value="">No certificates found</option>';
          Logger.warn("No certificates found in NPM instance");
        } else {
          certificateSelect.innerHTML = '<option value="">Select a certificate to update</option>';
          Logger.info(`Loaded ${certificates.length} certificates from NPM`);
          
          let foundSelectedCert = false;
          
          certificates.forEach(cert => {
            const option = document.createElement('option');
            option.value = cert.id;
            
            // Format domain name for display
            const domain = cert.nice_name || cert.domain_names?.[0] || 'Unknown Domain';
            
            // Format expiry date
            let expiryDate = 'N/A';
            if (cert.expires_on) {
              try {
                expiryDate = new Date(cert.expires_on).toLocaleDateString();
              } catch (e) {
                Logger.warn(`Invalid date format for certificate expiry: ${cert.expires_on}`);
              }
            }
            
            option.textContent = `${domain} (Exp: ${expiryDate})`;
            
            // Store additional data as attributes for preview
            option.setAttribute('data-domain', domain);
            option.setAttribute('data-expiry', expiryDate);
            
            // Check if this is the certificate to select
            if (selectedCertId && cert.id == selectedCertId) {
              option.selected = true;
              foundSelectedCert = true;
              Logger.debug(`Selected certificate ID ${cert.id} (${domain})`);
            }
            
            certificateSelect.appendChild(option);
          });
          
          // Add change listener
          certificateSelect.addEventListener('change', this.updateCertificatePreview.bind(this));
          
          // Trigger preview update if a certificate was selected
          if (foundSelectedCert) {
            this.updateCertificatePreview();
          }
          
          // Update status indicator if present
          if (statusElement) {
            statusElement.innerHTML = '<span class="status-indicator connected"></span><span class="status-text">Connected successfully</span>';
          }
          
          if (requestTokenButton) {
            requestTokenButton.classList.add("hidden");
          }
        }
      } else {
        certificateSelect.innerHTML = '<option value="">Failed to load certificates</option>';
        Logger.error("Error loading NPM certificates:", result.message);
        
        if (statusElement) {
          statusElement.innerHTML = '<span class="status-indicator error"></span><span class="status-text">Failed to load certificates</span>';
        }
      }
    } catch (error) {
      Logger.error("Error loading NPM certificates:", error);
      certificateSelect.innerHTML = '<option value="">Error loading certificates</option>';
      
      if (statusElement) {
        statusElement.innerHTML = '<span class="status-indicator error"></span><span class="status-text">Connection error</span>';
      }
      
      UIUtils.showToast(`Error loading NPM certificates: ${error.message}`, "error");
    } finally {
      certificateSelect.disabled = false;
    }
  },
  
  /**
   * Update certificate preview when a certificate is selected
   */
  updateCertificatePreview() {
    const certificateSelect = document.getElementById("npm-certificate-id");
    const previewArea = document.getElementById("npm-certificate-preview");
    
    if (!certificateSelect || !previewArea) {
      return;
    }
    
    const selectedOption = certificateSelect.options[certificateSelect.selectedIndex];
    
    if (!selectedOption || !selectedOption.value) {
      previewArea.classList.add("hidden");
      return;
    }
    
    // Get certificate data
    const domain = selectedOption.getAttribute('data-domain') || 'Unknown Domain';
    const expiry = selectedOption.getAttribute('data-expiry') || 'N/A';
    
    // Update preview
    previewArea.innerHTML = `
      <div class="certificate-info">
        <div class="cert-item">
          <span class="label">Domain:</span> 
          <span class="value">${domain}</span>
        </div>
        <div class="cert-item">
          <span class="label">Expires:</span> 
          <span class="value">${expiry}</span>
        </div>
      </div>
    `;
    previewArea.classList.remove("hidden");
    
    // Mark form as changed
    this.state.formChanged = true;
  },
  
  /**
   * Setup toggle behavior for SSH authentication method
   */
  setupSshAuthToggle() {
    const passwordAuthRadio = document.getElementById("ssh-auth-password");
    const keyAuthRadio = document.getElementById("ssh-auth-key");
    
    if (!passwordAuthRadio || !keyAuthRadio) {
      Logger.warn("SSH auth radio buttons not found");
      return;
    }
    
    const passwordGroup = document.getElementById("ssh-password-group");
    const keyGroup = document.getElementById("ssh-key-group");
    
    if (!passwordGroup || !keyGroup) {
      Logger.warn("SSH auth groups not found");
      return;
    }
    
    // Function to update UI based on selected auth method
    const updateAuthMethodUI = () => {
      if (passwordAuthRadio.checked) {
        passwordGroup.classList.remove("hidden");
        keyGroup.classList.add("hidden");
      } else if (keyAuthRadio.checked) {
        passwordGroup.classList.add("hidden");
        keyGroup.classList.remove("hidden");
      }
    };
    
    // Set initial state based on editing action or defaults
    const isEditing = !!this.state.editingAction && this.state.editingAction.type === "ssh-copy";
    
    if (isEditing) {
      const action = this.state.editingAction;
      if (action.privateKey) {
        keyAuthRadio.checked = true;
      } else {
        passwordAuthRadio.checked = true;
      }
    } else {
      // Default to password auth for new actions
      passwordAuthRadio.checked = true;
    }
    
    // Update UI for initial state
    updateAuthMethodUI();
    
    // Add change listeners
    passwordAuthRadio.addEventListener("change", function() {
      if (this.checked) {
        updateAuthMethodUI();
        this.state.formChanged = true;
      }
    }.bind(this));
    
    keyAuthRadio.addEventListener("change", function() {
      if (this.checked) {
        updateAuthMethodUI();
        this.state.formChanged = true;
      }
    }.bind(this));
  },
  
  /**
   * Setup SMB fields behavior
   */
  setupSmbFields() {
    // Not much special behavior for SMB fields currently
    Logger.debug("Setting up SMB fields");
  },
  
  /**
   * Setup FTP fields behavior
   */
  setupFtpFields() {
    const secureField = document.getElementById("ftp-secure");
    const portField = document.getElementById("ftp-port");
    
    if (secureField && portField) {
      // Update port based on secure option
      secureField.addEventListener("change", function() {
        // Only update if port is the default value
        if (portField.value === "21" && this.checked) {
          portField.value = "990";  // Default FTPS port
        } else if (portField.value === "990" && !this.checked) {
          portField.value = "21";   // Default FTP port
        }
        this.state.formChanged = true;
      }.bind(this));
    }
  },
  
  /**
   * Setup API fields behavior
   */
  setupApiFields() {
    const methodField = document.getElementById("api-method");
    const bodyGroup = document.getElementById("api-body-group");
    
    if (methodField && bodyGroup) {
      // Show body field only for methods that support a request body
      const updateBodyVisibility = () => {
        const hasBody = ["POST", "PUT", "PATCH"].includes(methodField.value);
        bodyGroup.classList.toggle("hidden", !hasBody);
      };
      
      // Set initial state
      updateBodyVisibility();
      
      // Update on method change
      methodField.addEventListener("change", function() {
        updateBodyVisibility();
        this.state.formChanged = true;
      }.bind(this));
    }
  },
  
  /**
   * Setup webhook fields behavior
   */
  setupWebhookFields() {
    const methodField = document.getElementById("webhook-method");
    const payloadGroup = document.getElementById("webhook-payload-group");
    
    if (methodField && payloadGroup) {
      // Show payload field only for methods that support a request body
      const updatePayloadVisibility = () => {
        const hasPayload = ["POST", "PUT", "PATCH"].includes(methodField.value);
        payloadGroup.classList.toggle("hidden", !hasPayload);
      };
      
      // Set initial state
      updatePayloadVisibility();
      
      // Update on method change
      methodField.addEventListener("change", function() {
        updatePayloadVisibility();
        this.state.formChanged = true;
      }.bind(this));
    }
  },
  
  /**
   * Setup email fields behavior
   */
  setupEmailFields() {
    const insertVariableBtn = document.getElementById("email-insert-variable");
    const bodyField = document.getElementById("email-body");
    
    if (insertVariableBtn && bodyField) {
      // Set up variable insertion functionality
      insertVariableBtn.addEventListener("click", () => {
        UIUtils.showModal("email-variables-modal", {
          title: "Insert Template Variable",
          content: `
            <div class="email-variables-list">
              <p>Select a variable to insert into the email template:</p>
              <div class="list-group">
                <button class="list-group-item" data-variable="{{domain}}">Domain Name</button>
                <button class="list-group-item" data-variable="{{expires}}">Expiration Date</button>
                <button class="list-group-item" data-variable="{{issuer}}">Certificate Issuer</button>
                <button class="list-group-item" data-variable="{{subject}}">Certificate Subject</button>
                <button class="list-group-item" data-variable="{{serial}}">Certificate Serial</button>
                <button class="list-group-item" data-variable="{{server}}">Server Name</button>
                <button class="list-group-item" data-variable="{{date}}">Current Date</button>
                <button class="list-group-item" data-variable="{{time}}">Current Time</button>
              </div>
              <p class="mt-3 small">These variables will be replaced with the actual certificate data when the email is sent.</p>
            </div>
          `,
          buttons: [
            {
              text: "Cancel",
              type: "secondary",
              action: "close"
            }
          ],
          size: "medium",
          onShow: () => {
            // Add click handlers to variables
            const variableButtons = document.querySelectorAll(".email-variables-list .list-group-item");
            
            variableButtons.forEach(button => {
              button.addEventListener("click", () => {
                const variable = button.getAttribute("data-variable");
                
                if (variable && bodyField) {
                  // Insert at cursor position or append to end
                  if (typeof bodyField.selectionStart === "number") {
                    const startPos = bodyField.selectionStart;
                    const endPos = bodyField.selectionEnd;
                    const before = bodyField.value.substring(0, startPos);
                    const after = bodyField.value.substring(endPos);
                    
                    bodyField.value = before + variable + after;
                    
                    // Set cursor position after the inserted variable
                    bodyField.selectionStart = startPos + variable.length;
                    bodyField.selectionEnd = startPos + variable.length;
                  } else {
                    // For browsers that don't support selection
                    bodyField.value += variable;
                  }
                  
                  // Focus the text area
                  bodyField.focus();
                  
                  // Mark form as changed
                  this.state.formChanged = true;
                }
                
                // Close the modal
                UIUtils.closeModal("email-variables-modal");
              });
            });
          }
        });
      });
    }
  },
  
  /**
   * Save the current action
   */
  async saveAction() {
    // Validate the form first
    if (!this.validateForm()) {
      return;
    }
    
    // Collect data from the form
    const actionData = this.collectFormData();
    
    Logger.debug("Saving action:", actionData);
    
    // If we're editing, update the existing action
    if (this.state.editingAction !== null && this.state.editingActionIndex !== null) {
      await this.updateExistingAction(actionData);
    } else {
      // Otherwise add a new action
      await this.addNewAction(actionData);
    }
    
    // Reset state
    this.state.formChanged = false;
    
    // Close the modal
    UIUtils.closeModal(this.constants.modalId);
  },
  
  /**
   * Validate the form before saving
   * @returns {boolean} Whether the form is valid
   */
  validateForm() {
    const actionType = this.elements.actionType.value;
    const actionName = this.elements.actionName.value.trim();
    
    if (!actionType) {
      UIUtils.showToast("Please select an action type", "warning");
      return false;
    }
    
    if (!actionName) {
      UIUtils.showToast("Please enter an action name", "warning");
      return false;
    }
    
    // Validate specific fields based on action type
    switch (actionType) {
      case "docker-restart":
        return this.validateDockerRestartAction();
      
      case "copy":
        return this.validateCopyAction();
      
      case "command":
        return this.validateCommandAction();
      
      case "nginx-proxy-manager":
        return this.validateNpmAction();
      
      case "ssh-copy":
        return this.validateSshAction();
      
      case "smb-copy":
        return this.validateSmbAction();
      
      case "ftp-copy":
        return this.validateFtpAction();
      
      case "api-call":
        return this.validateApiAction();
      
      case "webhook":
        return this.validateWebhookAction();
      
      case "email":
        return this.validateEmailAction();
      
      default:
        // If no specific validation, assume it's valid
        return true;
    }
  },
  
  /**
   * Validate Docker restart action fields
   * @returns {boolean} Whether the fields are valid
   */
  validateDockerRestartAction() {
    const containerSelect = document.getElementById("docker-container-select");
    const containerCustom = document.getElementById("docker-container-custom");
    
    if ((!containerSelect || !containerSelect.value) && 
        (!containerCustom || !containerCustom.value.trim())) {
      UIUtils.showToast("Please select or enter a Docker container", "warning");
      return false;
    }
    
    return true;
  },
  
  /**
   * Validate copy action fields
   * @returns {boolean} Whether the fields are valid
   */
  validateCopyAction() {
    const destField = document.getElementById("copy-destination");
    
    if (!destField || !destField.value.trim()) {
      UIUtils.showToast("Please enter a destination path", "warning");
      return false;
    }
    
    return true;
  },
  
  /**
   * Validate command action fields
   * @returns {boolean} Whether the fields are valid
   */
  validateCommandAction() {
    const commandField = document.getElementById("command-command");
    
    if (!commandField || !commandField.value.trim()) {
      UIUtils.showToast("Please enter a command", "warning");
      return false;
    }
    
    return true;
  },
  
  /**
   * Validate NPM action fields
   * @returns {boolean} Whether the fields are valid
   */
  validateNpmAction() {
    const pathRadio = document.getElementById("npm-method-path");
    const dockerRadio = document.getElementById("npm-method-docker");
    const apiRadio = document.getElementById("npm-method-api");
    
    if (pathRadio?.checked) {
      const pathField = document.getElementById("npm-path");
      if (!pathField || !pathField.value.trim()) {
        UIUtils.showToast("Please enter the NPM path", "warning");
        return false;
      }
    } else if (dockerRadio?.checked) {
      const containerField = document.getElementById("npm-docker-container");
      if (!containerField || !containerField.value.trim()) {
        UIUtils.showToast("Please enter the NPM Docker container", "warning");
        return false;
      }
    } else if (apiRadio?.checked) {
      const apiUrlField = document.getElementById("npm-api-url");
      if (!apiUrlField || !apiUrlField.value.trim()) {
        UIUtils.showToast("Please enter the NPM API URL", "warning");
        return false;
      }
      
      const certIdField = document.getElementById("npm-certificate-id");
      if (!certIdField || !certIdField.value.trim()) {
        UIUtils.showToast("Please select a certificate to update", "warning");
        return false;
      }
    }
    
    return true;
  },
    /**
   * Validate SSH action fields
   * @returns {boolean} Whether the fields are valid
   */
  validateSshAction() {
    const hostField = document.getElementById("ssh-host");
    const portField = document.getElementById("ssh-port");
    const usernameField = document.getElementById("ssh-username");
    const destinationField = document.getElementById("ssh-destination");
    
    if (!hostField || !hostField.value.trim()) {
      UIUtils.showToast("Please enter an SSH host", "warning");
      return false;
    }
    
    if (!portField || !portField.value.trim()) {
      UIUtils.showToast("Please enter an SSH port", "warning");
      return false;
    }
    
    if (!usernameField || !usernameField.value.trim()) {
      UIUtils.showToast("Please enter an SSH username", "warning");
      return false;
    }
    
    if (!destinationField || !destinationField.value.trim()) {
      UIUtils.showToast("Please enter a destination path", "warning");
      return false;
    }
    
    // Check authentication method
    const passwordAuthBtn = document.getElementById("ssh-auth-password");
    const keyAuthBtn = document.getElementById("ssh-auth-key");
    
    if (passwordAuthBtn?.checked) {
      const passwordField = document.getElementById("ssh-password");
      if (!passwordField || !passwordField.value) {
        UIUtils.showToast("Please enter an SSH password", "warning");
        return false;
      }
    } else if (keyAuthBtn?.checked) {
      const keyField = document.getElementById("ssh-private-key");
      if (!keyField || !keyField.value.trim()) {
        UIUtils.showToast("Please enter a private key path", "warning");
        return false;
      }
    }
    
    return true;
  },
  
  /**
   * Validate SMB action fields
   * @returns {boolean} Whether the fields are valid
   */
  validateSmbAction() {
    const hostField = document.getElementById("smb-host");
    const shareField = document.getElementById("smb-share");
    const destinationField = document.getElementById("smb-destination");
    
    if (!hostField || !hostField.value.trim()) {
      UIUtils.showToast("Please enter an SMB host", "warning");
      return false;
    }
    
    if (!shareField || !shareField.value.trim()) {
      UIUtils.showToast("Please enter an SMB share", "warning");
      return false;
    }
    
    if (!destinationField || !destinationField.value.trim()) {
      UIUtils.showToast("Please enter a destination path", "warning");
      return false;
    }
    
    return true;
  },
  
  /**
   * Validate FTP action fields
   * @returns {boolean} Whether the fields are valid
   */
  validateFtpAction() {
    const hostField = document.getElementById("ftp-host");
    const portField = document.getElementById("ftp-port");
    const usernameField = document.getElementById("ftp-username");
    const destinationField = document.getElementById("ftp-destination");
    
    if (!hostField || !hostField.value.trim()) {
      UIUtils.showToast("Please enter an FTP host", "warning");
      return false;
    }
    
    if (!portField || !portField.value.trim()) {
      UIUtils.showToast("Please enter an FTP port", "warning");
      return false;
    }
    
    if (!usernameField || !usernameField.value.trim()) {
      UIUtils.showToast("Please enter an FTP username", "warning");
      return false;
    }
    
    if (!destinationField || !destinationField.value.trim()) {
      UIUtils.showToast("Please enter a destination path", "warning");
      return false;
    }
    
    return true;
  },
  
  /**
   * Validate API action fields
   * @returns {boolean} Whether the fields are valid
   */
  validateApiAction() {
    const urlField = document.getElementById("api-url");
    const methodField = document.getElementById("api-method");
    
    if (!urlField || !urlField.value.trim()) {
      UIUtils.showToast("Please enter an API URL", "warning");
      return false;
    }
    
    if (!methodField || !methodField.value.trim()) {
      UIUtils.showToast("Please select an API method", "warning");
      return false;
    }
    
    // Check if body is required based on method
    if (["POST", "PUT", "PATCH"].includes(methodField.value)) {
      const bodyField = document.getElementById("api-body");
      if (!bodyField || !bodyField.value.trim()) {
        UIUtils.showToast("Please enter a request body", "warning");
        return false;
      }
    }
    
    return true;
  },
  
  /**
   * Validate webhook action fields
   * @returns {boolean} Whether the fields are valid
   */
  validateWebhookAction() {
    const urlField = document.getElementById("webhook-url");
    const methodField = document.getElementById("webhook-method");
    
    if (!urlField || !urlField.value.trim()) {
      UIUtils.showToast("Please enter a webhook URL", "warning");
      return false;
    }
    
    if (!methodField || !methodField.value.trim()) {
      UIUtils.showToast("Please select a webhook method", "warning");
      return false;
    }
    
    // Check if payload is required based on method
    if (["POST", "PUT", "PATCH"].includes(methodField.value)) {
      const payloadField = document.getElementById("webhook-payload");
      if (!payloadField || !payloadField.value.trim()) {
        UIUtils.showToast("Please enter a payload", "warning");
        return false;
      }
    }
    
    return true;
  },
  
  /**
   * Validate email action fields
   * @returns {boolean} Whether the fields are valid
   */
  validateEmailAction() {
    const toField = document.getElementById("email-to");
    const subjectField = document.getElementById("email-subject");
    
    if (!toField || !toField.value.trim()) {
      UIUtils.showToast("Please enter recipient email address(es)", "warning");
      return false;
    }
    
    if (!subjectField || !subjectField.value.trim()) {
      UIUtils.showToast("Please enter an email subject", "warning");
      return false;
    }
    
    return true;
  },
  
  /**
   * Collect form data based on the action type
   * @returns {Object} The collected action data
   */
  collectFormData() {
    const actionType = this.elements.actionType.value;
    const actionName = this.elements.actionName.value.trim();
    
    // Base action data
    const actionData = {
      type: actionType,
      name: actionName
    };
    
    // Collect type-specific data
    switch (actionType) {
      case "docker-restart":
        return this.collectDockerRestartData(actionData);
      
      case "copy":
        return this.collectCopyData(actionData);
      
      case "command":
        return this.collectCommandData(actionData);
      
      case "nginx-proxy-manager":
        return this.collectNpmData(actionData);
      
      case "ssh-copy":
        return this.collectSshData(actionData);
      
      case "smb-copy":
        return this.collectSmbData(actionData);
      
      case "ftp-copy":
        return this.collectFtpData(actionData);
      
      case "api-call":
        return this.collectApiData(actionData);
      
      case "webhook":
        return this.collectWebhookData(actionData);
      
      case "email":
        return this.collectEmailData(actionData);
      
      default:
        return actionData;
    }
  },
  
  /**
   * Collect Docker restart action data
   * @param {Object} actionData - Base action data
   * @returns {Object} Complete action data
   */
  collectDockerRestartData(actionData) {
    const containerSelect = document.getElementById("docker-container-select");
    const containerCustom = document.getElementById("docker-container-custom");
    
    if (containerSelect && containerSelect.value) {
      // Get the ID from the select
      actionData.containerId = containerSelect.value;
      
      // Also get the name for display purposes
      const selectedOption = containerSelect.options[containerSelect.selectedIndex];
      if (selectedOption) {
        actionData.containerName = selectedOption.textContent;
      }
    } else if (containerCustom && containerCustom.value.trim()) {
      // If custom container name is specified
      actionData.containerName = containerCustom.value.trim();
    }
    
    return actionData;
  },
  
  /**
   * Collect copy action data
   * @param {Object} actionData - Base action data
   * @returns {Object} Complete action data
   */
  collectCopyData(actionData) {
    const sourceField = document.getElementById("copy-source");
    const destField = document.getElementById("copy-destination");
    const permissionsField = document.getElementById("copy-permissions");
    
    if (sourceField) {
      actionData.source = sourceField.value.trim() || "cert";
    }
    
    if (destField) {
      actionData.destination = destField.value.trim();
    }
    
    if (permissionsField && permissionsField.value.trim()) {
      // Convert from octal string to decimal number
      actionData.permissions = parseInt(permissionsField.value.trim(), 8);
    }
    
    return actionData;
  },
  
  /**
   * Collect command action data
   * @param {Object} actionData - Base action data
   * @returns {Object} Complete action data
   */
  collectCommandData(actionData) {
    const commandField = document.getElementById("command-command");
    const cwdField = document.getElementById("command-cwd");
    const verboseField = document.getElementById("command-verbose");
    
    if (commandField) {
      actionData.command = commandField.value.trim();
    }
    
    if (cwdField) {
      actionData.cwd = cwdField.value.trim();
    }
    
    if (verboseField) {
      actionData.verbose = verboseField.checked;
    }
    
    return actionData;
  },
  
  /**
   * Collect NPM action data
   * @param {Object} actionData - Base action data
   * @returns {Object} Complete action data
   */
  collectNpmData(actionData) {
    const pathRadio = document.getElementById("npm-method-path");
    const dockerRadio = document.getElementById("npm-method-docker");
    const apiRadio = document.getElementById("npm-method-api");
    
    if (pathRadio?.checked) {
      actionData.method = 'path';
      
      const pathField = document.getElementById("npm-path");
      if (pathField) {
        actionData.npmPath = pathField.value.trim();
      }
    } else if (dockerRadio?.checked) {
      actionData.method = 'docker';
      
      const containerField = document.getElementById("npm-docker-container");
      if (containerField) {
        actionData.dockerContainer = containerField.value.trim();
      }
    } else if (apiRadio?.checked) {
      actionData.method = 'api';
      
      const apiUrlField = document.getElementById("npm-api-url");
      if (apiUrlField) {
        actionData.npmUrl = apiUrlField.value.trim();
      }
      
      const certIdField = document.getElementById("npm-certificate-id");
      if (certIdField) {
        actionData.certificateId = certIdField.value.trim();
      }
    }
    
    // Common options
    const restartOption = document.getElementById("npm-restart-services");
    if (restartOption) {
      actionData.restartServices = restartOption.checked;
    }
    
    const verifyOption = document.getElementById("npm-verify-update");
    if (verifyOption) {
      actionData.verifyUpdate = verifyOption.checked;
    }
    
    return actionData;
  },
  
  /**
   * Collect SSH action data
   * @param {Object} actionData - Base action data
   * @returns {Object} Complete action data
   */
  collectSshData(actionData) {
    const hostField = document.getElementById("ssh-host");
    const portField = document.getElementById("ssh-port");
    const usernameField = document.getElementById("ssh-username");
    const sourceField = document.getElementById("ssh-source");
    const destinationField = document.getElementById("ssh-destination");
    const permissionsField = document.getElementById("ssh-permissions");
    const commandField = document.getElementById("ssh-command");
    const verboseField = document.getElementById("ssh-verbose");
    
    if (hostField) actionData.host = hostField.value.trim();
    if (portField) actionData.port = parseInt(portField.value.trim()) || 22;
    if (usernameField) actionData.username = usernameField.value.trim();
    if (sourceField) actionData.source = sourceField.value.trim() || "cert";
    if (destinationField) actionData.destination = destinationField.value.trim();
    if (commandField) actionData.command = commandField.value.trim();
    if (verboseField) actionData.verbose = verboseField.checked;
    
    if (permissionsField && permissionsField.value.trim()) {
      actionData.permissions = parseInt(permissionsField.value.trim(), 8);
    }
    
    // Authentication method
    const passwordAuthBtn = document.getElementById("ssh-auth-password");
    const keyAuthBtn = document.getElementById("ssh-auth-key");
    
    if (passwordAuthBtn?.checked) {
      const passwordField = document.getElementById("ssh-password");
      if (passwordField) {
        actionData.password = passwordField.value;
      }
    } else if (keyAuthBtn?.checked) {
      const keyField = document.getElementById("ssh-private-key");
      const passphraseField = document.getElementById("ssh-passphrase");
      
      if (keyField) {
        actionData.privateKey = keyField.value.trim();
      }
      
      if (passphraseField && passphraseField.value) {
        actionData.passphrase = passphraseField.value;
      }
    }
    
    return actionData;
  },
  
  /**
   * Collect SMB action data
   * @param {Object} actionData - Base action data
   * @returns {Object} Complete action data
   */
  collectSmbData(actionData) {
    const hostField = document.getElementById("smb-host");
    const shareField = document.getElementById("smb-share");
    const usernameField = document.getElementById("smb-username");
    const passwordField = document.getElementById("smb-password");
    const domainField = document.getElementById("smb-domain");
    const sourceField = document.getElementById("smb-source");
    const destinationField = document.getElementById("smb-destination");
    const verboseField = document.getElementById("smb-verbose");
    
    if (hostField) actionData.host = hostField.value.trim();
    if (shareField) actionData.share = shareField.value.trim();
    if (usernameField) actionData.username = usernameField.value.trim();
    if (passwordField) actionData.password = passwordField.value;
    if (domainField) actionData.domain = domainField.value.trim();
    if (sourceField) actionData.source = sourceField.value.trim() || "cert";
    if (destinationField) actionData.destination = destinationField.value.trim();
    if (verboseField) actionData.verbose = verboseField.checked;
  },
  
  /**
   * Collect FTP action data
   * @param {Object} actionData - Base action data
   * @returns {Object} Complete action data
   */
  collectFtpData(actionData) {
    const hostField = document.getElementById("ftp-host");
    const portField = document.getElementById("ftp-port");
    const usernameField = document.getElementById("ftp-username");
    const passwordField = document.getElementById("ftp-password");
    const secureField = document.getElementById("ftp-secure");
    const sourceField = document.getElementById("ftp-source");
    const destinationField = document.getElementById("ftp-destination");
    
    if (hostField) actionData.host = hostField.value.trim();
    if (portField) actionData.port = parseInt(portField.value.trim()) || 21;
    if (usernameField) actionData.username = usernameField.value.trim();
    if (passwordField) actionData.password = passwordField.value;
    if (secureField) actionData.secure = secureField.checked;
    if (sourceField) actionData.source = sourceField.value.trim() || "cert";
    if (destinationField) actionData.destination = destinationField.value.trim();
    
    return actionData;
  },
  
  /**
   * Collect API action data
   * @param {Object} actionData - Base action data
   * @returns {Object} Complete action data
   */
  collectApiData(actionData) {
    const urlField = document.getElementById("api-url");
    const methodField = document.getElementById("api-method");
    const contentTypeField = document.getElementById("api-content-type");
    const bodyField = document.getElementById("api-body");
    const usernameField = document.getElementById("api-auth-username");
    const passwordField = document.getElementById("api-auth-password");
    const headersField = document.getElementById("api-headers");
    
    if (urlField) actionData.url = urlField.value.trim();
    if (methodField) actionData.method = methodField.value.trim();
    if (contentTypeField) actionData.contentType = contentTypeField.value.trim();
    if (bodyField) actionData.body = bodyField.value.trim();
    if (usernameField) actionData.username = usernameField.value.trim();
    if (passwordField) actionData.password = passwordField.value;
    
    // Parse headers as JSON if present
    if (headersField && headersField.value.trim()) {
      try {
        actionData.headers = JSON.parse(headersField.value.trim());
      } catch (e) {
        Logger.warn("Failed to parse headers as JSON, storing as string", e);
        actionData.headers = headersField.value.trim();
      }
    }
    
    return actionData;
  },
  
  /**
   * Collect webhook action data
   * @param {Object} actionData - Base action data
   * @returns {Object} Complete action data
   */
  collectWebhookData(actionData) {
    const urlField = document.getElementById("webhook-url");
    const methodField = document.getElementById("webhook-method");
    const contentTypeField = document.getElementById("webhook-content-type");
    const payloadField = document.getElementById("webhook-payload");
    
    if (urlField) actionData.url = urlField.value.trim();
    if (methodField) actionData.method = methodField.value.trim();
    if (contentTypeField) actionData.contentType = contentTypeField.value.trim();
    
    // Parse payload as JSON if present
    if (payloadField && payloadField.value.trim()) {
      try {
        actionData.payload = JSON.parse(payloadField.value.trim());
      } catch (e) {
        Logger.warn("Failed to parse payload as JSON, storing as string", e);
        actionData.payload = payloadField.value.trim();
      }
    }
    
    return actionData;
  },
  
  /**
   * Collect email action data
   * @param {Object} actionData - Base action data
   * @returns {Object} Complete action data
   */
  collectEmailData(actionData) {
    const toField = document.getElementById("email-to");
    const subjectField = document.getElementById("email-subject");
    const bodyField = document.getElementById("email-body");
    const attachCertField = document.getElementById("email-attach-cert");
    
    if (toField) actionData.to = toField.value.trim();
    if (subjectField) actionData.subject = subjectField.value.trim();
    if (bodyField) actionData.body = bodyField.value.trim();
    if (attachCertField) actionData.attachCert = attachCertField.checked;
    
    return actionData;
  },
    /**
   * Add a new action to the list
   * @param {Object} actionData - The action data to add
   */
  async addNewAction(actionData) {
    try {
      Logger.info("Adding new deployment action:", actionData);
      
      // Get the current certificate fingerprint
      const certificateId = this.getCurrentCertificateId();
      if (!certificateId) {
        throw new Error("No certificate selected");
      }
      
      // Show save in progress toast
      UIUtils.showToast("Adding deployment action...", "info", null, "saving-action");
      
      // Call API to add action
      const response = await fetch(`/api/certificates/${certificateId}/deploy-actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(actionData)
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Show success message
        UIUtils.showToast("Deployment action added successfully", "success");
        
        // Refresh the action list if possible
        if (typeof refreshDeploymentActionsList === 'function') {
          refreshDeploymentActionsList(certificateId);
        } else {
          // Otherwise reload the whole page
          window.location.reload();
        }
      } else {
        throw new Error(result.message || "Failed to add deployment action");
      }
    } catch (error) {
      Logger.error("Error adding deployment action:", error);
      UIUtils.showToast(`Error adding action: ${error.message}`, "error");
    }
  },
  
  /**
   * Update an existing action
   * @param {Object} actionData - The updated action data
   */
  async updateExistingAction(actionData) {
    try {
      Logger.info("Updating deployment action:", actionData);
      
      // Get the current certificate fingerprint
      const certificateId = this.getCurrentCertificateId();
      if (!certificateId) {
        throw new Error("No certificate selected");
      }
      
      // Show save in progress toast
      UIUtils.showToast("Updating deployment action...", "info", null, "saving-action");
      
      // Call API to update action
      const response = await fetch(`/api/certificates/${certificateId}/deploy-actions/${this.state.editingActionIndex}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(actionData)
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        // Show success message
        UIUtils.showToast("Deployment action updated successfully", "success");
        
        // Refresh the action list if possible
        if (typeof refreshDeploymentActionsList === 'function') {
          refreshDeploymentActionsList(certificateId);
        } else {
          // Otherwise reload the whole page
          window.location.reload();
        }
      } else {
        throw new Error(result.message || "Failed to update deployment action");
      }
    } catch (error) {
      Logger.error("Error updating deployment action:", error);
      UIUtils.showToast(`Error updating action: ${error.message}`, "error");
    }
  },

  /**
   * Open the edit form for an existing action
   * @param {number} actionIndex - The index of the action to edit
   */
  editAction(actionIndex) {
    Logger.debug(`Opening edit form for action at index ${actionIndex}`);
    
    // Fetch the action data first
    this.fetchActionData(actionIndex)
      .then(actionData => {
        // Open the edit form with the action data
        this.showActionForm(actionData, actionIndex);
      })
      .catch(error => {
        Logger.error(`Error fetching action data for editing:`, error);
        UIUtils.showToast(`Error loading action data: ${error.message}`, "error");
      });
  },
  
  /**
   * Delete a deployment action
   * @param {string} actionId - The ID of the action to delete
   */
  deleteAction(actionId) {
    Logger.debug(`Deleting action with ID ${actionId}`);
    
    // Ask for confirmation
    UIUtils.showConfirmDialog({
      title: "Delete Deployment Action",
      message: "Are you sure you want to delete this deployment action? This cannot be undone.",
      confirmButtonText: "Delete",
      confirmButtonType: "danger",
      cancelButtonText: "Cancel",
      onConfirm: async () => {
        try {
          // Get the current certificate fingerprint
          const certificateId = this.getCurrentCertificateId();
          if (!certificateId) {
            throw new Error("No certificate selected");
          }
          
          // Show delete in progress toast
          UIUtils.showToast("Deleting deployment action...", "info", null, "deleting-action");
          
          // Call API to delete the action
          const response = await fetch(`/api/certificates/${certificateId}/deploy-actions/${actionId}`, {
            method: 'DELETE'
          });
          
          if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
          }
          
          const result = await response.json();
          
          if (result.success) {
            // Show success message
            UIUtils.showToast("Deployment action deleted successfully", "success");
            
            // Refresh the action list if possible
            if (typeof refreshDeploymentActionsList === 'function') {
              refreshDeploymentActionsList(certificateId);
            } else {
              // Otherwise reload the whole page
              window.location.reload();
            }
          } else {
            throw new Error(result.message || "Failed to delete deployment action");
          }
        } catch (error) {
          Logger.error("Error deleting deployment action:", error);
          UIUtils.showToast(`Error deleting action: ${error.message}`, "error");
        }
      }
    });
  },
  
  /**
   * Fetch action data for a specific ID
   * @param {string} actionId - The ID of the action to fetch
   * @returns {Promise<Object>} The action data
   */
  async fetchActionData(actionId) {
    try {
      // Get the current certificate fingerprint
      const certificateId = this.getCurrentCertificateId();
      if (!certificateId) {
        throw new Error("No certificate selected");
      }
      
      // The correct endpoint might use GET instead of a specific ID endpoint
      // Try using the list endpoint and filtering client-side
      const response = await fetch(`/api/certificates/${certificateId}/deploy-actions`);
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result && Array.isArray(result)) {
        // Find the specific action by ID
        const action = result.find(a => a.id === actionId);
        
        if (action) {
          Logger.debug("Found action data:", action);
          return action;
        } else {
          throw new Error(`Action with ID ${actionId} not found`);
        }
      } else {
        // If the result has a different structure, try to handle it
        if (result.success && Array.isArray(result.actions)) {
          const action = result.actions.find(a => a.id === actionId);
          if (action) {
            Logger.debug("Found action data in result.actions:", action);
            return action;
          }
        }
        
        throw new Error("Invalid response format from server");
      }
    } catch (error) {
      Logger.error("Error fetching action data:", error);
      throw error;
    }
  },

  /**
   * Get the current certificate ID
   * @returns {string|null} The current certificate ID
   */
  getCurrentCertificateId() {
    // Try to get from state first
    if (window.state && window.state.currentCertificate) {
      return window.state.currentCertificate.fingerprint || window.state.currentCertificate.id;
    }
    
    // Try to get from URL
    const urlParams = new URLSearchParams(window.location.search);
    const certId = urlParams.get('cert');
    if (certId) {
      return certId;
    }
    
    // Try to get from data attribute on a container
    const container = document.querySelector('[data-certificate-id]');
    if (container) {
      return container.getAttribute('data-certificate-id');
    }
    
    // If we're in a test dialog, try to find the certificate ID from hidden field
    const testCertSelect = document.getElementById('test-certificate-select');
    if (testCertSelect && testCertSelect.value) {
      return testCertSelect.value;
    }
    
    Logger.warn("Could not determine current certificate ID");
    return null;
  },
  
  /**
   * Run a test for a deployment action
   * @param {string} actionId - The ID of the action to test
   * @param {string} certificateId - The ID of the certificate to use
   * @param {boolean} liveMode - Whether to run in live mode
   */
  async testAction(actionId, certificateId, liveMode) {
    try {
      Logger.info(`Testing action with ID ${actionId} with certificate ${certificateId} (live: ${liveMode})`);
      
      // Show testing modal
      UIUtils.showModal("action-test-progress-modal", {
        title: `${liveMode ? 'Running' : 'Simulating'} Deployment Action`,
        content: `
          <div class="action-test-progress">
            <div class="progress-indicator">
              <div class="loading-spinner medium"></div>
            </div>
            <p class="status-message text-center mt-3">
              ${liveMode ? 'Running' : 'Simulating'} deployment action...
            </p>
            <div class="log-container mt-3 hidden">
              <h5>Test Log</h5>
              <pre id="action-test-log" class="test-log"></pre>
            </div>
          </div>
        `,
        buttons: [
          {
            text: "Close",
            type: "secondary",
            action: "close"
          }
        ],
        size: "large",
        closeOnClickOutside: false
      });
      
      // Call API to run test
      const response = await fetch(`/api/certificates/${certificateId}/deploy-actions/${actionId}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          liveMode
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Update the test progress modal
      const progressDiv = document.querySelector(".action-test-progress");
      const logContainer = document.querySelector(".log-container");
      const logPre = document.getElementById("action-test-log");
      
      if (progressDiv && logContainer && logPre) {
        // Remove spinner, show result icon
        const progressIndicator = progressDiv.querySelector(".progress-indicator");
        if (progressIndicator) {
          progressIndicator.innerHTML = result.success
            ? '<i class="fas fa-check-circle success-icon"></i>'
            : '<i class="fas fa-times-circle error-icon"></i>';
        }
        
        // Update status message
        const statusMessage = progressDiv.querySelector(".status-message");
        if (statusMessage) {
          statusMessage.textContent = result.success
            ? `${liveMode ? 'Deployment action completed successfully' : 'Simulation completed successfully'}`
            : `${liveMode ? 'Deployment action failed' : 'Simulation failed'}`;
        }
        
        // Show log
        logContainer.classList.remove("hidden");
        logPre.textContent = result.log || result.message || (result.success ? "Completed successfully" : "Failed");
      }
      
      // Also show toast notification
      if (result.success) {
        UIUtils.showToast(`${liveMode ? 'Deployment action completed successfully' : 'Simulation completed successfully'}`, "success");
      } else {
        UIUtils.showToast(result.message || `${liveMode ? 'Deployment action failed' : 'Simulation failed'}`, "error");
      }
    } catch (error) {
      Logger.error("Error testing deployment action:", error);
      
      // Update the test progress modal if it's open
      const progressDiv = document.querySelector(".action-test-progress");
      const logContainer = document.querySelector(".log-container");
      const logPre = document.getElementById("action-test-log");
      
      if (progressDiv && logContainer && logPre) {
        // Show error icon
        const progressIndicator = progressDiv.querySelector(".progress-indicator");
        if (progressIndicator) {
          progressIndicator.innerHTML = '<i class="fas fa-times-circle error-icon"></i>';
        }
        
        // Update status message
        const statusMessage = progressDiv.querySelector(".status-message");
        if (statusMessage) {
          statusMessage.textContent = "Test failed";
        }
        
        // Show log with error
        logContainer.classList.remove("hidden");
        logPre.textContent = `Error: ${error.message}`;
      }
      
      // Show toast
      UIUtils.showToast(`Error testing action: ${error.message}`, "error");
    }
  }
};

// Initialize the module when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  DeploymentActions.init();
  
  // If using edit/delete buttons with data attributes
  document.addEventListener('click', (event) => {
    const target = event.target;
    
    // Check for action buttons
    if (target.matches('[data-action]')) {
      const action = target.getAttribute('data-action');
      const actionIndex = parseInt(target.getAttribute('data-index'));
      
      if (!isNaN(actionIndex)) {
        switch (action) {
          case 'edit':
            DeploymentActions.editAction(actionIndex);
            break;
            
          case 'delete':
            DeploymentActions.deleteAction(actionIndex);
            break;
            
          case 'test':
            DeploymentActions.testAction(actionIndex);
            break;
        }
      }
    }
  });
});

// Expose methods for external use
window.DeploymentActions = {
  showActionForm: DeploymentActions.showActionForm.bind(DeploymentActions),
  editAction: DeploymentActions.editAction.bind(DeploymentActions),
  deleteAction: DeploymentActions.deleteAction.bind(DeploymentActions),
  testAction: DeploymentActions.testAction.bind(DeploymentActions)
};