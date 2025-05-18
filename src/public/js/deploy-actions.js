/**
 * Deployment Actions functionality
 */

// Store containers once loaded
let dockerContainers = [];

/**
 * Track if the form has unsaved changes
 */
let formHasUnsavedChanges = false;

/**
 * Mark form as having unsaved changes
 */
function markFormChanged() {
  formHasUnsavedChanges = true;
}

/**
 * Clear form changed status
 */
function clearFormChangedStatus() {
  formHasUnsavedChanges = false;
}

/**
 * Initialize deployment action form
 * @param {Object} [existingAction] - Existing action for edit mode
 */
function initializeDeployActionForm(existingAction = null) {
  const isEditing = !!existingAction;

  // Reset the form changed status
  clearFormChangedStatus();

  // Reset the manually edited flag
  window.actionNameManuallyEdited = isEditing;

  const actionTypeSelect = document.getElementById("deployment-action-type");
  if (actionTypeSelect) {
    // Remove previous event listener if any
    const newActionTypeSelect = actionTypeSelect.cloneNode(true);
    actionTypeSelect.parentNode.replaceChild(
      newActionTypeSelect,
      actionTypeSelect
    );

    // Set form title based on mode
    document.querySelector(".modal-title").textContent = isEditing
      ? "Edit Deployment Action"
      : "Add Deployment Action";

    // Fill form with existing data if in edit mode
    if (isEditing) {
      document.getElementById("deployment-action-name").value =
        existingAction.name || "";
      newActionTypeSelect.value = existingAction.type || "";
    }

    // Add input event listeners for tracking changes
    setupFormChangeTracking();

    // Handle Docker container selection change
    const containerSelect = document.getElementById("docker-container-select");
    const containerCustom = document.getElementById("docker-container-custom");

    if (containerSelect && containerCustom) {
      containerSelect.addEventListener("change", () => {
        if (containerSelect.value) {
          containerCustom.value = ""; // Clear custom input when selection is made
        }
      });

      containerCustom.addEventListener("input", () => {
        if (containerCustom.value) {
          containerSelect.value = ""; // Clear dropdown when custom input is used
        }
      });
    }

    // Fill form with existing data if in edit mode
    if (isEditing) {
      // Set values for appropriate action type
      switch (existingAction.type) {
        case "docker-restart":
          if (existingAction.containerId) {
            document.getElementById("docker-container-custom").value =
              existingAction.containerId;
          } else if (existingAction.containerName) {
            // Will be set when containers are loaded
            document.getElementById("docker-container-custom").value =
              existingAction.containerName;
          }
          break;

        case "copy":
          document.getElementById("copy-source").value =
            existingAction.source || "cert";
          document.getElementById("copy-destination").value =
            existingAction.destination || "";
          if (existingAction.permissions) {
            document.getElementById("copy-permissions").value =
              existingAction.permissions.toString(8);
          }
          break;

        case "command":
          document.getElementById("command-command").value =
            existingAction.command || "";
          document.getElementById("command-cwd").value =
            existingAction.cwd || "";
          document.getElementById("command-verbose").checked =
            !!existingAction.verbose;
          break;

        case "nginx-proxy-manager":
          if (existingAction.npmPath) {
            document.getElementById("npm-method-path").checked = true;
            document.getElementById("npm-path").value = existingAction.npmPath;
          } else if (existingAction.dockerContainer) {
            document.getElementById("npm-method-docker").checked = true;
            document.getElementById("npm-docker-container").value =
              existingAction.dockerContainer;
            // Show docker container field, hide path field
            document.getElementById("npm-path-group").classList.add("hidden");
            document
              .getElementById("npm-docker-group")
              .classList.remove("hidden");
          }
          break;

        case "ssh-copy":
          document.getElementById("ssh-host").value = existingAction.host || "";
          document.getElementById("ssh-port").value = existingAction.port || 22;
          document.getElementById("ssh-username").value =
            existingAction.username || "";
          document.getElementById("ssh-source").value =
            existingAction.source || "cert";
          document.getElementById("ssh-destination").value =
            existingAction.destination || "";

          if (existingAction.password) {
            document.getElementById("ssh-auth-password").checked = true;
            document.getElementById("ssh-password").value =
              existingAction.password;
          } else if (existingAction.privateKey) {
            document.getElementById("ssh-auth-key").checked = true;
            document.getElementById("ssh-private-key").value =
              existingAction.privateKey;
            document.getElementById("ssh-passphrase").value =
              existingAction.passphrase || "";
            // Show key fields, hide password fields
            document
              .getElementById("ssh-password-group")
              .classList.add("hidden");
            document.getElementById("ssh-key-group").classList.remove("hidden");
          }

          if (existingAction.permissions) {
            document.getElementById("ssh-permissions").value =
              existingAction.permissions.toString(8);
          }

          document.getElementById("ssh-command").value =
            existingAction.command || "";
          document.getElementById("ssh-verbose").checked =
            !!existingAction.verbose;
          break;

        case "smb-copy":
          document.getElementById("smb-host").value = existingAction.host || "";
          document.getElementById("smb-share").value =
            existingAction.share || "";
          document.getElementById("smb-username").value =
            existingAction.username || "";
          document.getElementById("smb-password").value =
            existingAction.password || "";
          document.getElementById("smb-domain").value =
            existingAction.domain || "";
          document.getElementById("smb-source").value =
            existingAction.source || "cert";
          document.getElementById("smb-destination").value =
            existingAction.destination || "";
          document.getElementById("smb-verbose").checked =
            !!existingAction.verbose;
          break;

        case "ftp-copy":
          document.getElementById("ftp-host").value = existingAction.host || "";
          document.getElementById("ftp-port").value = existingAction.port || 21;
          document.getElementById("ftp-username").value =
            existingAction.username || "";
          document.getElementById("ftp-password").value =
            existingAction.password || "";
          document.getElementById("ftp-secure").checked =
            !!existingAction.secure;
          document.getElementById("ftp-source").value =
            existingAction.source || "cert";
          document.getElementById("ftp-destination").value =
            existingAction.destination || "";
          break;

        case "api-call":
          document.getElementById("api-url").value = existingAction.url || "";
          document.getElementById("api-method").value =
            existingAction.method || "POST";
          document.getElementById("api-content-type").value =
            existingAction.contentType || "application/json";
          document.getElementById("api-body").value = existingAction.body || "";
          document.getElementById("api-auth-username").value =
            existingAction.username || "";
          document.getElementById("api-auth-password").value =
            existingAction.password || "";
          document.getElementById("api-headers").value = existingAction.headers
            ? JSON.stringify(existingAction.headers, null, 2)
            : "";
          break;

        case "webhook":
          document.getElementById("webhook-url").value =
            existingAction.url || "";
          document.getElementById("webhook-method").value =
            existingAction.method || "POST";
          document.getElementById("webhook-content-type").value =
            existingAction.contentType || "application/json";
          document.getElementById("webhook-payload").value =
            existingAction.payload
              ? JSON.stringify(existingAction.payload, null, 2)
              : "";
          break;

        case "email":
          document.getElementById("email-to").value = existingAction.to || "";
          document.getElementById("email-subject").value =
            existingAction.subject || "Certificate Update Notification";
          document.getElementById("email-body").value =
            existingAction.body || "";
          document.getElementById("email-attach-cert").checked =
            !!existingAction.attachCert;
          break;
      }
    }
    updateActionOptions();

    // Setup file browser buttons AFTER action options are visible
    setTimeout(() => {
      setupFileBrowserButtons();

      // Add event listener with automatic name generation
      Logger.debug("Adding event listener to action-type-select");
      document.getElementById("deployment-action-type").addEventListener("change", () => {
        const selectedType = document.getElementById("deployment-action-type").value;
        Logger.debug("Selected action type:", selectedType);

        markFormChanged();
        updateActionOptions();
      });
    }, 100);
  }
}

/**
 * Set up event listeners to track form changes
 */
function setupFormChangeTracking() {
  // Track changes on all input elements in the form
  const form = document.getElementById('deployment-action-form');
  if (!form) return;

  // Find all inputs, selects, and textareas in the form
  const formElements = form.querySelectorAll('input, select, textarea');

  formElements.forEach(element => {
    const eventType = element.type === 'checkbox' || element.type === 'radio' ? 'change' : 'input';

    // Remove existing event listener (if any) by cloning
    const newElement = element.cloneNode(true);
    element.parentNode.replaceChild(newElement, element);

    // Add change tracking event listener
    newElement.addEventListener(eventType, () => {
      markFormChanged();
    });
  });
}

/**
 * Generate a descriptive name for the deployment action based on form values
 * @returns {string} Generated name
 */
function generateDeployActionName() {
  const actionType = document.getElementById("deployment-action-type")?.value;
  if (!actionType) return "";

  let name = "";

  switch (actionType) {
    case "copy":
      const copySource =
        document.getElementById("copy-source")?.value || "cert";
      const copyDest = document.getElementById("copy-destination")?.value || "";

      const destPath = copyDest.split("/").pop();
      name = `Copy ${copySource} to ${destPath || copyDest}`;
      break;

    case "command":
      const command = document.getElementById("command-command")?.value || "";
      // Extract the first word/command from the command string
      const firstCommand = command.trim().split(" ")[0];
      name = `Run ${firstCommand || "command"}`;
      break;

    case "docker-restart":
      const containerSelect = document.getElementById(
        "docker-container-select"
      );
      const containerCustom = document
        .getElementById("docker-container-custom")
        ?.value?.trim();
      let containerName = "";

      if (containerSelect?.value) {
        const container = dockerContainers.find(
          (c) => c.id === containerSelect.value
        );
        if (container) {
          containerName = container.name;
        } else {
          containerName = containerSelect.value.substring(0, 12); // First 12 chars if ID
        }
      } else if (containerCustom) {
        containerName = containerCustom;
      }

      name = `Restart ${containerName || "Docker container"}`;
      break;

    case "nginx-proxy-manager":
      const isPathMethod = document.getElementById("npm-method-path")?.checked;

      if (isPathMethod) {
        const path = document.getElementById("npm-path")?.value;
        name = `Update NPM${path ? " at " + path.split("/").pop() : ""}`;
      } else {
        const container = document.getElementById(
          "npm-docker-container"
        )?.value;
        name = `Update NPM${container ? " container " + container : ""}`;
      }
      break;

    case "ssh-copy":
      const sshHost = document.getElementById("ssh-host")?.value || "";
      const sshDest = document.getElementById("ssh-destination")?.value || "";
      const sshSource = document.getElementById("ssh-source")?.value || "cert";

      const destFile = sshDest.split("/").pop();
      name = `SSH copy ${sshSource} to ${sshHost}${destFile ? "/" + destFile : ""
        }`;
      break;

    case "smb-copy":
      const smbHost = document.getElementById("smb-host")?.value || "";
      const smbShare = document.getElementById("smb-share")?.value || "";
      const smbDest = document.getElementById("smb-destination")?.value || "";
      const smbSource = document.getElementById("smb-source")?.value || "cert";

      const smbDestFile = smbDest.split("/").pop();
      name = `SMB copy ${smbSource} to ${smbHost}/${smbShare}${smbDestFile ? "/" + smbDestFile : ""
        }`;
      break;

    case "ftp-copy":
      const ftpHost = document.getElementById("ftp-host")?.value || "";
      const ftpDest = document.getElementById("ftp-destination")?.value || "";
      const ftpSource = document.getElementById("ftp-source")?.value || "cert";

      const ftpDestFile = ftpDest.split("/").pop();
      name = `FTP${document.getElementById("ftp-secure")?.checked ? "S" : ""
        } copy ${ftpSource} to ${ftpHost}${ftpDestFile ? "/" + ftpDestFile : ""}`;
      break;

    case "api-call":
      const apiUrl = document.getElementById("api-url")?.value || "";
      const apiMethod = document.getElementById("api-method")?.value || "POST";

      // Extract domain from URL
      let domain = "";
      try {
        if (apiUrl) {
          const url = new URL(apiUrl);
          domain = url.hostname;
        }
      } catch (e) {
        domain = apiUrl.split("/")[0];
      }

      name = `${apiMethod} to ${domain || "API"}`;
      break;

    case "webhook":
      const webhookUrl = document.getElementById("webhook-url")?.value || "";

      // Extract domain from URL
      let webhookDomain = "";
      try {
        if (webhookUrl) {
          const url = new URL(webhookUrl);
          webhookDomain = url.hostname;
        }
      } catch (e) {
        webhookDomain = webhookUrl.split("/")[0];
      }

      name = `Webhook to ${webhookDomain || "service"}`;
      break;

    case "email":
      const emailTo = document.getElementById("email-to")?.value || "";
      name = `Email to ${emailTo || "recipient"}`;
      break;

    default:
      name = `${actionType.charAt(0).toUpperCase() + actionType.slice(1)
        } action`;
  }

  return name;
}

/**
 * Update the action name field based on current form values
 * Only update if the name field hasn't been manually edited by the user
 */
function updateActionName() {
  const nameField = document.getElementById("deployment-action-name");

  // Only update if the name field hasn't been manually edited
  if (!nameField || window.actionNameManuallyEdited) return;

  const generatedName = generateDeployActionName();
  if (generatedName) {
    nameField.value = generatedName;
  }
}

/**
 * Load Docker containers from API
 */
async function loadDockerContainers() {
  const containerSelect = document.getElementById("docker-container-select");
  const loadingSpinner = document.getElementById("docker-loading");

  if (!containerSelect) return;

  try {
    // Show loading spinner
    if (loadingSpinner) loadingSpinner.style.display = "inline-block";

    // Clear existing options
    containerSelect.innerHTML =
      '<option value="">Loading containers...</option>';

    // Fetch containers from API
    const response = await fetch("/api/docker/containers");
    const data = await response.json();

    // Store containers
    dockerContainers = data.containers || [];

    // Update dropdown
    containerSelect.innerHTML = "";

    if (!data.dockerAvailable) {
      // Docker not available
      containerSelect.innerHTML =
        '<option value="">Docker not available</option>';
      containerSelect.disabled = true;
      return;
    }

    if (!dockerContainers.length) {
      // No containers found
      containerSelect.innerHTML =
        '<option value="">No containers found</option>';
      return;
    }

    // Add default option
    containerSelect.innerHTML = '<option value="">Select a container</option>';

    // Add container options
    dockerContainers.forEach((container) => {
      const option = document.createElement("option");
      option.value = container.id;
      option.textContent = `${container.name} (${container.shortId}) - ${container.status}`;
      containerSelect.appendChild(option);
    });

    // If we're editing, set the selected container
    const existingAction = getEditingAction();
    if (existingAction && existingAction.type === "docker-restart") {
      if (existingAction.containerId) {
        // Try to find and select the container by ID
        containerSelect.value = existingAction.containerId;
      } else if (existingAction.containerName) {
        // Try to find and select the container by name
        const container = dockerContainers.find(
          (c) => c.name === existingAction.containerName
        );
        if (container) {
          containerSelect.value = container.id;
        } else {
          // If container not found, use custom input
          document.getElementById("docker-container-custom").value =
            existingAction.containerName;
        }
      }
    }
  } catch (error) {
    Logger.error("Error loading Docker containers:", error);
    containerSelect.innerHTML =
      '<option value="">Error loading containers</option>';
  } finally {
    // Hide loading spinner
    if (loadingSpinner) loadingSpinner.style.display = "none";
  }
}

/**
 * Hide all action option sections
 */
function hideAllActionOptions() {
  const optionDivs = document.querySelectorAll(".action-type-options");
  optionDivs.forEach((div) => div.classList.add("hidden"));
}

/**
 * Show options for selected action type
 * @param {string} actionType - Selected action type
 */
function showActionOptions(actionType) {
  const optionDiv = document.getElementById(`${actionType}-action-options`);
  if (optionDiv) {
    optionDiv.classList.remove("hidden");

    // Set up listeners for new action type
    setTimeout(() => {
      setupNameGenerationListeners();
    }, 500);
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
 * @returns {Promise} Promise that resolves when save is complete
 */
async function saveDeploymentAction() {
  const form = document.getElementById("deployment-action-form");
  const actionType = document.getElementById("deployment-action-type").value;
  const actionName = document.getElementById("deployment-action-name").value;

  // Basic validation
  if (!actionType) {
    UIUtils.showToast("Please select an action type", "warning");
    return Promise.reject(new Error("Missing action type"));
  }

  if (!actionName) {
    UIUtils.showToast("Please enter a name for this action", "warning");
    return Promise.reject(new Error("Missing action name"));
  }

  // Create base action object
  const action = {
    type: actionType,
    name: actionName,
  };

  // Add specific properties based on action type
  switch (actionType) {
    case "copy":
      action.source = document.getElementById("copy-source").value;
      action.destination = document.getElementById("copy-destination").value;
      const permissions = document.getElementById("copy-permissions").value;

      if (!action.source || !action.destination) {
        UIUtils.showToast("Please specify source and destination", "warning");
        return;
      }

      if (permissions) {
        action.permissions = parseInt(permissions, 8);
      }
      break;

    case "command":
      action.command = document.getElementById("command-command").value;
      action.cwd = document.getElementById("command-cwd").value;
      action.verbose = document.getElementById("command-verbose").checked;

      if (!action.command) {
        UIUtils.showToast("Please enter a command", "warning");
        return;
      }
      break;

    case "docker-restart":
      const containerSelect = document.getElementById(
        "docker-container-select"
      );
      const containerCustom = document
        .getElementById("docker-container-custom")
        .value.trim();

      const containerId = containerSelect.value || containerCustom;

      if (!containerId) {
        UIUtils.showToast(
          "Please select a container or enter a container ID/name",
          "warning"
        );
        return;
      }

      // If a container was selected from dropdown, get both ID and name
      if (containerSelect.value) {
        const container = dockerContainers.find(
          (c) => c.id === containerSelect.value
        );
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

    case "nginx-proxy-manager":
      const isPathMethod = document.getElementById("npm-method-path")?.checked;
      const isDockerMethod = document.getElementById("npm-method-docker")?.checked;
      const isApiMethod = document.getElementById("npm-method-api")?.checked;

      if (isPathMethod) {
        action.npmPath = document.getElementById("npm-path").value;
        if (!action.npmPath) {
          UIUtils.showToast("Please enter the NPM path", "warning");
          return;
        }
      } else if (isDockerMethod) {
        action.dockerContainer = document.getElementById("npm-docker-container").value;
        if (!action.dockerContainer) {
          UIUtils.showToast("Please enter the Docker container name", "warning");
          return;
        }
      } else if (isApiMethod) {
        // For API method, get configuration from dedicated function
        const apiConfig = getNpmApiActionConfig();
        if (!apiConfig) {
          return; // Error message already shown
        }

        // Merge API configuration into action object
        Object.assign(action, apiConfig);
      }

      // Add common options regardless of method
      const restartServices = document.getElementById("npm-restart-services");
      if (restartServices) {
        action.restartServices = restartServices.checked;
      }

      const verifyUpdate = document.getElementById("npm-verify-update");
      if (verifyUpdate) {
        action.verifyUpdate = verifyUpdate.checked;
      }
      break;

    case "ssh-copy":
      action.host = document.getElementById("ssh-host").value;
      action.port = parseInt(document.getElementById("ssh-port").value, 10);
      action.username = document.getElementById("ssh-username").value;
      action.source = document.getElementById("ssh-source").value;
      action.destination = document.getElementById("ssh-destination").value;

      const isPasswordAuth =
        document.getElementById("ssh-auth-password").checked;
      if (isPasswordAuth) {
        action.password = document.getElementById("ssh-password").value;
      } else {
        action.privateKey = document.getElementById("ssh-private-key").value;
        const passphrase = document.getElementById("ssh-passphrase").value;
        if (passphrase) {
          action.passphrase = passphrase;
        }
      }

      const sshPermissions = document.getElementById("ssh-permissions").value;
      if (sshPermissions) {
        action.permissions = parseInt(sshPermissions, 8);
      }

      const sshCommand = document.getElementById("ssh-command").value;
      if (sshCommand) {
        action.command = sshCommand;
      }

      action.verbose = document.getElementById("ssh-verbose").checked;

      if (!action.host || !action.source || !action.destination) {
        UIUtils.showToast(
          "Please fill in all required SSH fields",
          "warning"
        );
        return;
      }
      break;

    case "smb-copy":
      action.host = document.getElementById("smb-host").value;
      action.share = document.getElementById("smb-share").value;
      action.username = document.getElementById("smb-username").value;
      action.password = document.getElementById("smb-password").value;
      action.domain = document.getElementById("smb-domain").value;
      action.source = document.getElementById("smb-source").value;
      action.destination = document.getElementById("smb-destination").value;
      action.verbose = document.getElementById("smb-verbose").checked;

      if (
        !action.host ||
        !action.share ||
        !action.source ||
        !action.destination
      ) {
        UIUtils.showToast(
          "Please fill in all required SMB fields",
          "warning"
        );
        return;
      }
      break;

    case "ftp-copy":
      action.host = document.getElementById("ftp-host").value;
      action.port = parseInt(document.getElementById("ftp-port").value, 10);
      action.username = document.getElementById("ftp-username").value;
      action.password = document.getElementById("ftp-password").value;
      action.secure = document.getElementById("ftp-secure").checked;
      action.source = document.getElementById("ftp-source").value;
      action.destination = document.getElementById("ftp-destination").value;

      if (!action.host || !action.source || !action.destination) {
        UIUtils.showToast(
          "Please fill in all required FTP fields",
          "warning"
        );
        return;
      }
      break;

    case "api-call":
      action.url = document.getElementById("api-url").value;
      action.method = document.getElementById("api-method").value;
      action.contentType = document.getElementById("api-content-type").value;
      action.body = document.getElementById("api-body").value;

      // Parse headers if provided
      try {
        const headersText = document
          .getElementById("api-headers")
          .value.trim();
        if (headersText) {
          action.headers = JSON.parse(headersText);
        }
      } catch (error) {
        UIUtils.showToast("Invalid JSON format for headers", "error");
        return;
      }

      // Add auth if provided
      const username = document.getElementById("api-auth-username").value;
      const password = document.getElementById("api-auth-password").value;

      if (username && password) {
        action.username = username;
        action.password = password;
      }

      if (!action.url) {
        UIUtils.showToast("Please enter a URL", "warning");
        return;
      }
      break;

    case "webhook":
      action.url = document.getElementById("webhook-url").value;
      action.method = document.getElementById("webhook-method").value;
      action.contentType = document.getElementById(
        "webhook-content-type"
      ).value;

      // Parse payload if provided
      try {
        const payloadText = document
          .getElementById("webhook-payload")
          .value.trim();
        if (payloadText) {
          action.payload = JSON.parse(payloadText);
        }
      } catch (error) {
        UIUtils.showToast("Invalid JSON format for payload", "error");
        return;
      }

      if (!action.url) {
        UIUtils.showToast("Please enter a webhook URL", "warning");
        return;
      }
      break;

    case "email":
      action.to = document.getElementById("email-to").value;
      action.subject = document.getElementById("email-subject").value;
      action.body = document.getElementById("email-body").value;
      action.attachCert =
        document.getElementById("email-attach-cert").checked;

      if (!action.to) {
        UIUtils.showToast("Please enter recipient email address", "warning");
        return;
      }

      // Validate email address
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(action.to)) {
        UIUtils.showToast("Please enter a valid email address", "warning");
        return;
      }
      break;
  }

  // Get the current certificate fingerprint
  const fingerprint = state.currentCertificate.fingerprint;
  const isEditing = window.editingAction !== null;
  const encodedFingerprint = encodeAPIFingerprint(fingerprint);

  // Set URL based on whether we're creating or editing
  let url, method;

  if (isEditing && window.editingActionIndex !== null) {
    url = `/api/certificates/${encodedFingerprint}/deploy-actions/${window.editingActionIndex}`;
    method = "PUT";
  } else {
    url = `/api/certificates/${encodedFingerprint}/deploy-actions`;
    method = "POST";
  }

  // Save the action
  const saveBtn = document.getElementById("save-deploy-action-btn");
  const originalText = saveBtn.textContent;
  saveBtn.textContent = "Saving...";
  saveBtn.disabled = true;

  try {
    Logger.debug(`Sending ${method} request to ${url} with data:`, action);
    const response = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(action),
      // Add credentials if your API requires authentication cookies
      credentials: 'same-origin'
    });

    // Log detailed response information
    Logger.debug(`Received response: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      Logger.error(`Server error response (${response.status}):`, errorText);
      throw new Error(`Server error (${response.status}): ${errorText}`);
    }

    // Parse response
    const result = await response.json();
    Logger.debug("Server response:", result);

    if (!result.success) {
      throw new Error(result.message || "Unknown error");
    }

    // After successful save, clear the changed status
    clearFormChangedStatus();

    // Close modal and show success message
    UIUtils.closeModal("deployment-action-modal");

    UIUtils.showToast(
      isEditing ? "Deployment action updated" : "Deployment action added",
      "success"
    );

    // After successful save, refresh the certificate details view
    if (typeof loadCertificateDeploymentActions === "function") {
      loadCertificateDeploymentActions(state.currentCertificate);
    } else {
      Logger.warn("loadCertificateDeploymentActions function not found");
      // Fallback - reload entire certificate details
      if (typeof showCertificateDetails === "function") {
        showCertificateDetails(fingerprint);
      }
    }

    // Return a resolved promise
    return Promise.resolve();
  } catch (error) {
    Logger.error("Error saving deployment action:", error);
    UIUtils.showToast(`Error: ${error.message}`, "error");
    return Promise.reject(error);
  } finally {
    // Reset button
    const saveBtn = document.getElementById("save-deploy-action-btn");
    saveBtn.textContent = "Save Action";
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
  Logger.info("Show deployment action form:", existingAction, actionIndex);

  // Reset form changed status
  clearFormChangedStatus();

  // First, make sure the modal container exists
  const modalId = "deployment-action-modal";
  let modalElement = document.getElementById(modalId);

  // Create modal if it doesn't exist
  if (!modalElement) {
    modalElement = document.createElement("div");
    modalElement.id = modalId;
    modalElement.className = "modal hidden"; // Use 'hidden' class for UIUtils compatibility
    modalElement.style.zIndex = "1102"; // Higher z-index to appear on top
    modalElement.innerHTML = '<div class="modal-content"></div>';
    document.body.appendChild(modalElement);
    Logger.info("Created missing modal container:", modalId);
  }

  // Store current certificate detail modal state
  const certDetailModal = document.querySelector(
    "#cert-details-modal:not(.hidden)"
  );
  if (certDetailModal) {
    window.previousModalId = "cert-details-modal";
    // Instead of closing it, just bring our modal to the front
    modalElement.style.zIndex =
      parseInt(getComputedStyle(certDetailModal).zIndex || "1000") + 5;

    // Make sure the backdrop doesn't hide the existing modal
    const backdrop = document.getElementById("modal-backdrop");
    if (backdrop) {
      backdrop.style.zIndex = parseInt(modalElement.style.zIndex) - 1;
    }
  }

  const modalContent = modalElement.querySelector(".modal-content");
  if (!modalContent) {
    Logger.error(
      "Modal content container not found even after creating modal"
    );
    UIUtils.showToast(
      "Error loading form: Modal content container not found",
      "error"
    );
    return;
  }

  // Show loading indicator
  modalContent.innerHTML = '<div class="loading-spinner"></div>';

  // Load the form template
  fetch("/templates/deploy-action-form.html")
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch form template: ${response.status}`);
      }
      return response.text();
    })
    .then((html) => {
      modalContent.innerHTML = html;

      // Initialize the form
      initializeDeployActionForm(existingAction);

      // Add save button event listener
      const saveBtn = document.getElementById("save-deploy-action-btn");
      if (saveBtn) {
        saveBtn.addEventListener("click", () => {
          saveDeploymentAction().then(() => {
            clearFormChangedStatus(); // Clear the changed status after successful save
          });
        });
      }

      // Set up close button handlers with unsaved changes check
      const closeButtons = modalElement.querySelectorAll(
        '[data-dismiss="modal"]'
      );
      closeButtons.forEach((button) => {
        button.addEventListener("click", function (e) {
          checkUnsavedChangesBeforeClosing(modalId, e);
        });
      });

      // Show the modal using UIUtils
      UIUtils.openModal(modalId);

      // Add override for the modal's existing close behavior
      const originalCloseModal = UIUtils.closeModal;
      UIUtils.closeModal = function (modalIdToClose) {
        if (modalIdToClose === modalId) {
          if (checkUnsavedChangesBeforeClosing(modalId)) {
            // Only close if confirmed
            originalCloseModal.call(UIUtils, modalIdToClose);
          }
        } else {
          // For other modals, use original behavior
          originalCloseModal.call(UIUtils, modalIdToClose);
        }
      };
    })
    .catch((error) => {
      Logger.error("Error loading deployment action form:", error);
      UIUtils.showToast(`Error loading form: ${error.message}`, "error");

      // Add fallback content to modal
      modalContent.innerHTML = `
        <div class="modal-header">
          <h3 class="modal-title">Error Loading Form</h3>
          <button type="button" class="close-modal" aria-label="Close">×</button>
        </div>
        <div class="modal-body">
          <p class="error-message">Failed to load the deployment action form. Please try again.</p>
          <p>Error details: ${UIUtils.sanitizeErrorMessage
          ? UIUtils.sanitizeErrorMessage(error)
          : error.message
        }</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="button button-secondary close-modal">Close</button>
          <button type="button" class="button button-primary" onclick="showDeploymentActionForm(window.editingAction, window.editingActionIndex)">Retry</button>
        </div>
      `;

      // Set up close button handlers for error message
      modalElement.querySelectorAll(".close-modal").forEach((button) => {
        button.addEventListener("click", function () {
          UIUtils.closeModal(modalId);
        });
      });

      // Show the modal even on error
      UIUtils.openModal(modalId);
    });
}

/**
 * Check for unsaved changes before closing the modal
 * @param {string} modalId - The ID of the modal to close
 * @param {Event} [event] - Optional event object to prevent default
 * @returns {boolean} True if it's safe to close the modal
 */
function checkUnsavedChangesBeforeClosing(modalId, event) {
  if (formHasUnsavedChanges) {
    // Show confirmation dialog
    const confirmed = confirm('You have unsaved changes. Are you sure you want to close this form?');

    if (!confirmed) {
      // Prevent default if event was provided
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      return false;
    }

    // User confirmed, reset the changed status
    clearFormChangedStatus();
  }

  // It's safe to close
  return true;
}

/**
 * Setup file browser buttons for path inputs
 */
function setupFileBrowserButtons() {
  // Wait a moment for the DOM to be fully loaded
  setTimeout(() => {
    // Define all browse buttons with their targets and types
    const browseButtons = [
      {
        buttonId: "browse-copy-destination",
        targetId: "copy-destination",
        type: "file",
      },
      {
        buttonId: "browse-command-cwd",
        targetId: "command-cwd",
        type: "directory",
      },
      { buttonId: "browse-npm-path", targetId: "npm-path", type: "directory" },
      { buttonId: "browse-ssh-key", targetId: "ssh-private-key", type: "file" },
    ];

    // Add click event listeners to all browse buttons
    browseButtons.forEach((button) => {
      const buttonElement = document.getElementById(button.buttonId);

      if (buttonElement) {
        // Remove existing listeners with clone
        const newButton = buttonElement.cloneNode(true);
        if (buttonElement.parentNode) {
          buttonElement.parentNode.replaceChild(newButton, buttonElement);
        }

        // Add event listener to open file browser
        newButton.addEventListener("click", () => {
          const targetInput = document.getElementById(button.targetId);
          const currentPath = targetInput ? targetInput.value : "";
          openFileBrowser(button.targetId, button.type, currentPath);
        });

        Logger.debug(
          `Added file browser listener to: ${button.buttonId} for ${button.targetId}`
        );
      } else {
        Logger.warn(`Browse button not found: ${button.buttonId}`);

        // Create browse buttons if they don't exist - this is the fix for "browse button not found"
        const targetInput = document.getElementById(button.targetId);
        if (targetInput) {
          Logger.info(`Creating browse button for: ${button.targetId}`);
          addBrowseButton(targetInput, button.targetId, button.type);
        }
      }
    });

    Logger.debug("File browser buttons setup completed");
  }, 100); // Small delay to ensure DOM is loaded
}

/**
 * Add browse button next to an input
 * @param {HTMLElement} input - Input element
 * @param {string} targetId - Target input ID
 * @param {string} type - 'file' or 'directory'
 */
function addBrowseButton(input, targetId, type) {
  // Create browse button
  const browseBtn = document.createElement("button");
  browseBtn.type = "button";
  browseBtn.className = "button browse-btn";
  browseBtn.id = `browse-${targetId}`; // Set proper ID for future reference
  browseBtn.innerHTML = '<span class="icon-folder"></span>';
  browseBtn.title = `Browse for ${type}`;

  // Add event listener
  browseBtn.addEventListener("click", () => {
    openFileBrowser(targetId, type, input.value);
  });

  // If input is already in an input group, just add the button
  const parentGroup = input.closest(".input-group");
  if (parentGroup) {
    parentGroup.appendChild(browseBtn);
    Logger.info(`Added browse button ${browseBtn.id} to existing input group`);
    return;
  }

  // Otherwise create input group
  const inputGroup = document.createElement("div");
  inputGroup.className = "input-group";

  // Replace input with input group
  const parent = input.parentNode;
  if (parent) {
    parent.removeChild(input);
    inputGroup.appendChild(input);
    inputGroup.appendChild(browseBtn);
    parent.appendChild(inputGroup);
    Logger.info(
      `Created new input group for ${targetId} with browse button ${browseBtn.id}`
    );
  } else {
    Logger.warn(
      `Cannot add browse button to ${targetId}: No parent node found`
    );
  }
}

/**
 * Open file browser dialog using the existing file browser module
 * @param {string} targetId - Target input ID
 * @param {string} type - 'file' or 'directory'
 * @param {string} currentPath - Current path value
 */
function openFileBrowser(targetId, type, currentPath) {
  Logger.info(
    `Opening file browser for ${targetId}, type: ${type}, currentPath: ${currentPath}`
  );

  // Check if the file browser module is available
  if (typeof initializeFileBrowser !== "function") {
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
      }
    },
    // Use directory mode for directory type
    type === "directory"
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
    if (!confirm("Are you sure you want to delete this deployment action?")) {
      return;
    }

    const response = await fetch(
      `/api/certificates/${encodeURIComponent(
        fingerprint
      )}/deploy-actions/${actionIndex}`,
      {
        method: "DELETE",
      }
    );

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    // Show success message
    UIUtils.showToast("Deployment action deleted", "success");

    // Reload deployment actions tab
    loadCertificateDeploymentActions(state.currentCertificate);
  } catch (error) {
    Logger.error("Error deleting deployment action:", error);
    UIUtils.showToast(`Error: ${error.message}`, "error");
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
    UIUtils.showToast("Testing deployment action...", "info");

    const response = await fetch(
      `/api/certificates/${encodeURIComponent(
        fingerprint
      )}/deploy-actions/${actionIndex}/test`,
      {
        method: "POST",
      }
    );

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();

    if (result.success) {
      UIUtils.showToast("Test completed successfully", "success");
    } else {
      UIUtils.showToast(
        `Test failed: ${result.message || "Unknown error"}`,
        "error"
      );
    }
  } catch (error) {
    Logger.error("Error testing deployment action:", error);
    UIUtils.showToast(`Error: ${error.message}`, "error");
  }
}

/**
 * Load deployment actions for a certificate
 * @param {string} fingerprint - Certificate fingerprint
 */
function loadCertificateDeploymentActions(fingerprint) {
  // Handle case where a full certificate object is passed
  if (typeof fingerprint === "object" && fingerprint !== null) {
    fingerprint = fingerprint.fingerprint;
  }

  // Ensure fingerprint is valid
  if (!fingerprint) {
    Logger.error(
      "Invalid fingerprint provided to loadCertificateDeploymentActions"
    );
    return;
  }

  const container = document.getElementById("deployment-actions-list");
  if (!container) {
    Logger.error("Deployment actions container not found");
    return;
  }

  // Show loading indicator
  container.innerHTML = '<div class="loading-spinner small"></div>';

  // Fetch deployment actions with proper encoding
  const encodedFingerprint = encodeAPIFingerprint(fingerprint);

  fetch(`/api/certificates/${encodedFingerprint}/deploy-actions`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to load deployment actions: ${response.status}`
        );
      }
      return response.json();
    })
    .then((actions) => {
      if (!actions || actions.length === 0) {
        container.innerHTML =
          '<p class="empty-message">No deployment actions configured.</p>';
        return;
      }

      // Create a sortable container for the actions
      let html = '<div class="sortable-actions">';

      // Create HTML for actions list using safeTemplate
      const actionsHtml = actions
        .map((action, index) => {
          // Generate description based on action type
          let description = "";
          switch (action.type) {
            case "copy":
              description = `Copy to ${action.destination}`;
              break;
            case "ssh-copy":
              description = `SSH copy to ${action.host}:${action.destination}`;
              break;
            case "command":
              description = `Run command: ${action.command.substring(0, 40)}${action.command.length > 40 ? "..." : ""
                }`;
              break;
            case "docker-restart":
              description = `Restart Docker container: ${action.containerName || action.containerId
                }`;
              break;
            case "webhook":
              description = `Send webhook to ${action.url}`;
              break;
            case "smb-copy":
              description = `SMB copy to ${action.host}:${action.destination}`;
              break;
            case "ftp-copy":
              description = `FTP copy to ${action.host}:${action.destination}`;
              break;
            case "api-call":
              description = `API call to ${action.url}`;
              break;
            case "nginx-proxy-manager":
              description = action.npmPath
                ? `Update Nginx Proxy Manager at ${action.npmPath}`
                : `Update Nginx Proxy Manager container ${action.dockerContainer}`;
              break;
            case "email":
              description = `Send email to ${action.to}`;
              break;
            default:
              description = `${action.type} action`;
          }

          return UIUtils.safeTemplate(
            `
            <div class="deployment-action-item" data-index="\${index|attr}" data-type="\${type|attr}">
              <div class="drag-handle">
                <i class="fas fa-grip-vertical"></i>
              </div>
              <div class="deployment-action-info">
                <div class="deployment-action-name">\${name}</div>
                <span class="deployment-action-type">\${type}</span>
                <span class="deployment-action-desc">\${desc}</span>
              </div>
              <div class="deployment-action-buttons">
                <button class="button small test-action-btn" data-index="\${index|attr}">Test</button>
                <button class="button small edit-action-btn" data-index="\${index|attr}">Edit</button>
                <button class="button small danger remove-action-btn" data-index="\${index|attr}">Remove</button>
              </div>
            </div>
          `,
            {
              name: action.name || "Unnamed Action",
              type: action.type,
              desc: description,
              index: index,
            }
          );
        })
        .join("");

      // Close the sortable container
      html += actionsHtml + '</div>';

      // Add order info if more than one action exists
      if (actions.length > 1) {
        // Add helpful message about drag and drop functionality
        html += '<div class="action-order-info"><i class="fas fa-info-circle"></i> Drag actions to change execution order</div>';
      }

      container.innerHTML = html;

      // Add event listeners to buttons
      container.querySelectorAll(".test-action-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
          const index = parseInt(this.getAttribute("data-index"), 10);
          testDeploymentAction(fingerprint, index);
        });
      });

      container.querySelectorAll(".edit-action-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
          const index = parseInt(this.getAttribute("data-index"), 10);
          // Get the action data
          const action = actions[index];
          // Open the edit form with this action
          showDeploymentActionForm(action, index);
        });
      });

      container.querySelectorAll(".remove-action-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
          const index = parseInt(this.getAttribute("data-index"), 10);
          deleteDeploymentAction(fingerprint, index);
        });
      });

      // Initialize sortable functionality if more than one action exists
      if (actions.length > 1 && typeof initDeployActionsSortable === 'function') {
        setTimeout(() => initDeployActionsSortable(fingerprint), 100);
      }
    })
    .catch((error) => {
      Logger.error("Error loading deployment actions:", error);
      container.innerHTML = UIUtils.safeTemplate(
        `
        <p class="error-message">Failed to load deployment actions: \${errorMessage}</p>
      `,
        {
          errorMessage: UIUtils.sanitizeErrorMessage(error),
        }
      );
    });
}

// Ensure encodeAPIFingerprint is available in this file
// If it's not defined in window scope, add it here
if (typeof encodeAPIFingerprint !== "function") {
  /**
   * Helper function to properly encode certificate fingerprint for API use
   * @param {string} fingerprint - Raw certificate fingerprint
   * @returns {string} - Encoded fingerprint suitable for API URLs
   */
  function encodeAPIFingerprint(fingerprint) {
    // Ensure fingerprint is a string
    if (fingerprint === null || fingerprint === undefined) {
      Logger.error(
        "Invalid fingerprint provided to encodeAPIFingerprint:",
        fingerprint
      );
      return "";
    }

    // Convert to string if it's not already
    fingerprint = String(fingerprint);

    // If fingerprint contains "=", it has the prefix "sha256 Fingerprint="
    if (fingerprint.includes("=")) {
      // Extract just the hexadecimal fingerprint value after the equals sign
      const parts = fingerprint.split("=");
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
  newButton.addEventListener("click", () => {
    // Get current certificate fingerprint from state
    showDeploymentActionForm();
  });

  return newButton;
}

/**
 * Update action options based on selected action type with enhanced logging
 */
function updateActionOptions() {
  const actionType = document.getElementById("deployment-action-type")?.value;

  Logger.debug(`Updating action options for type: ${actionType}`);

  // Hide all action options first
  hideAllActionOptions();
  Logger.debug("All action options hidden");

  // Show the selected action type options
  if (actionType) {
    const optionsDiv = document.getElementById(`${actionType}-action-options`);
    if (optionsDiv) {
      Logger.debug(`Found options div for ${actionType}, showing it now`);
      optionsDiv.classList.remove("hidden");

      // Update the action name based on the type
      updateActionName();

      // Setup additional handlers for specific action types
      setupActionTypeHandlers(actionType);

      // Set up name generation listeners
      setupNameGenerationListeners();

      Logger.debug(`Action options for ${actionType} are now visible: ${!optionsDiv.classList.contains('hidden')}`);
    } else {
      Logger.warn(`Could not find options div for action type: ${actionType}`);
      Logger.debug("Available options divs:",
        Array.from(document.querySelectorAll('.action-type-options'))
          .map(div => div.id)
      );
    }
  } else {
    Logger.debug("No action type selected, nothing to show");
  }
}

/**
 * Setup specific handlers for each action type
 * @param {string} actionType - The selected action type
 */
function setupActionTypeHandlers(actionType) {
  Logger.debug(`Setting up handlers for action type: ${actionType}`);

  // Setup additional handlers for specific action types
  switch (actionType) {
    case "docker-restart":
      Logger.debug("Loading Docker containers");
      loadDockerContainers();
      break;

    case "nginx-proxy-manager":
      if (typeof setupNpmMethodToggle === 'function') {
        Logger.debug("Setting up NPM toggle");
        setupNpmMethodToggle();
      } else {
        Logger.warn("NPM setup function not found");
      }
      break;

    case "ssh-copy":
      if (typeof setupSshAuthToggle === 'function') {
        Logger.debug("Setting up SSH auth toggle");
        setupSshAuthToggle();
      } else {
        Logger.warn("SSH setup function not found");
      }
      break;

    // Add other action types as needed

    default:
      Logger.debug(`No special handlers for action type: ${actionType}`);
  }
}

/**
 * Set up event listeners for name generation
 */
function setupNameGenerationListeners() {
  // Add event listener to the name field to detect manual edits
  const nameField = document.getElementById("deployment-action-name");
  if (nameField) {
    nameField.addEventListener("input", () => {
      window.actionNameManuallyEdited = true;
      markFormChanged();
    });
  }

  // Add change and input listeners to relevant fields based on action type
  const actionType = document.getElementById("deployment-action-type")?.value;
  if (!actionType) return;

  const fieldsToWatch = getFieldsToWatchForType(actionType);

  fieldsToWatch.forEach((fieldId) => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener("change", () => {
        setTimeout(updateActionName, 50);
        markFormChanged();
      });

      if (
        field.tagName === "INPUT" &&
        field.type !== "radio" &&
        field.type !== "checkbox"
      ) {
        field.addEventListener("blur", () => {
          setTimeout(updateActionName, 50);
          markFormChanged();
        });
      }
    }
  });
}

/**
 * Get field IDs to watch for name generation based on action type
 * @param {string} actionType - Action type
 * @returns {string[]} Array of field IDs to watch
 */
function getFieldsToWatchForType(actionType) {
  switch (actionType) {
    case "copy":
      return ["copy-source", "copy-destination"];

    case "command":
      return ["command-command"];

    case "docker-restart":
      return ["docker-container-select", "docker-container-custom"];

    case "nginx-proxy-manager":
      return [
        "npm-method-path",
        "npm-method-docker",
        "npm-path",
        "npm-docker-container",
      ];

    case "ssh-copy":
      return ["ssh-host", "ssh-destination", "ssh-source"];

    case "smb-copy":
      return ["smb-host", "smb-share", "smb-destination", "smb-source"];

    case "ftp-copy":
      return ["ftp-host", "ftp-destination", "ftp-source", "ftp-secure"];

    case "api-call":
      return ["api-url", "api-method"];

    case "webhook":
      return ["webhook-url"];

    case "email":
      return ["email-to"];

    default:
      return [];
  }
}

/**
 * Setup toggle behavior for Nginx Proxy Manager method selection
 */
function setupNpmMethodToggle() {
  const pathMethodRadio = document.getElementById("npm-method-path");
  const dockerMethodRadio = document.getElementById("npm-method-docker");
  const apiMethodRadio = document.getElementById("npm-method-api");
  const pathGroup = document.getElementById("npm-path-group");
  const dockerGroup = document.getElementById("npm-docker-group");
  const apiGroup = document.getElementById("npm-api-group");
  const certificateSelection = document.getElementById("npm-certificate-selection");
  const npmOptions = document.getElementById("npm-options");
  const connectionStatus = document.getElementById("npm-connection-status");

  if (!pathMethodRadio || !dockerMethodRadio || !apiMethodRadio ||
    !pathGroup || !dockerGroup || !apiGroup) {
    Logger.warn("NPM toggle elements not found");
    return;
  }

  // Function to update UI based on selected method
  function updateNpmMethodUI() {
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
      // Hide the initial loading message when not using API method
      if (connectionStatus) {
        connectionStatus.style.display = "none";
      }
    } else if (dockerMethodRadio.checked) {
      dockerGroup.classList.remove("hidden");
      if (npmOptions) npmOptions.classList.remove("hidden");
      // Hide the initial loading message when not using API method
      if (connectionStatus) {
        connectionStatus.style.display = "none";
      }
    } else if (apiMethodRadio.checked) {
      apiGroup.classList.remove("hidden");

      // Load settings and check connection status
      loadDeploymentSettings().then(settings => {
        const npmSettings = settings?.nginxProxyManager;

        // Check if we have what we need to load NPM certificates
        if (npmSettings && npmSettings.accessToken) {
          if (certificateSelection) certificateSelection.classList.remove("hidden");
          if (npmOptions) npmOptions.classList.remove("hidden");

          // Load available certificates from NPM
          loadNpmCertificates();
        } else {
          // Check connection to see if we can authenticate
          setTimeout(testNpmApiConnection, 100);
        }
      });
    }

    updateActionName();
  }

  // Set initial state
  updateNpmMethodUI();

  // Add change listeners for radio buttons
  pathMethodRadio.addEventListener("change", function () {
    if (this.checked) {
      updateNpmMethodUI();
      markFormChanged();
    }
  });

  dockerMethodRadio.addEventListener("change", function () {
    if (this.checked) {
      updateNpmMethodUI();
      markFormChanged();
    }
  });

  apiMethodRadio.addEventListener("change", function () {
    if (this.checked) {
      updateNpmMethodUI();
      markFormChanged();
    }
  });

  // Set up test connection button
  const testConnectionButton = document.getElementById("npm-test-connection");
  if (testConnectionButton) {
    testConnectionButton.addEventListener("click", function () {
      testNpmApiConnection();
    });
  }

  // Set up request token button
  const requestTokenButton = document.getElementById("npm-request-token");
  if (requestTokenButton) {
    requestTokenButton.addEventListener("click", function () {
      showNpmTokenRequestDialog();
    });
  }

  // Initialize fields from settings
  initNpmFieldsFromSettings();
}

/**
 * Load deployment settings from server
 * @returns {Promise<Object>} Deployment settings
 */
async function loadDeploymentSettings() {
  if (window.deploymentSettings) {
    // Return cached settings if available
    return window.deploymentSettings;
  }

  try {
    Logger.debug("Loading deployment settings from server");
    const response = await fetch('/api/settings/deployment');

    if (!response.ok) {
      throw new Error(`Failed to load deployment settings: ${response.status}`);
    }

    const data = await response.json();

    if (data && data.success) {
      // Store settings in window object for reuse
      window.deploymentSettings = data.deployment || {};
      Logger.debug("Deployment settings loaded successfully:", window.deploymentSettings);
      return window.deploymentSettings;
    } else {
      throw new Error(data.message || 'Failed to load deployment settings');
    }
  } catch (error) {
    Logger.error("Error loading deployment settings:", error);
    // Return an empty object to avoid null references
    return {};
  }
}

/**
 * Initialize NPM fields from global settings
 */
async function initNpmFieldsFromSettings() {
  try {
    // Fetch deployment settings if not already loaded
    const deploymentSettings = await loadDeploymentSettings();

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
}

/**
 * Test connection to Nginx Proxy Manager API
 */
async function testNpmApiConnection() {
  const apiUrlField = document.getElementById("npm-api-url");
  const statusElement = document.getElementById("npm-api-status");
  const requestTokenButton = document.getElementById("npm-request-token");
  const certificateSelection = document.getElementById("npm-certificate-selection");
  const npmOptions = document.getElementById("npm-options");
  const connectionStatus = document.getElementById("npm-connection-status");
  
  if (!apiUrlField || !statusElement) {
    Logger.error("Required NPM UI elements not found");
    return;
  }
  
  // Hide the initial loading message if it exists
  if (connectionStatus) {
    connectionStatus.style.display = "none";
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
        loadNpmCertificates();
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
}

/**
 * Show dialog to request a new NPM token
 */
function showNpmTokenRequestDialog() {
  const apiUrlField = document.getElementById("npm-api-url");
  const apiUrl = apiUrlField ? apiUrlField.value.trim() : '';
  
  if (!apiUrl) {
    UIUtils.showToast("Please enter the NPM API URL", "warning");
    return;
  }
  
  // Create the modal content
  UIUtils.showModal({
    title: "Nginx Proxy Manager Authentication",
    content: `
      <div class="npm-token-request-form">
        <p>Please enter your NPM login credentials to obtain an API token.</p>
        <div class="form-group">
          <label for="npm-email">Email</label>
          <input type="email" id="npm-email" class="form-control" placeholder="admin@example.com">
        </div>
        <div class="form-group">
          <label for="npm-password">Password</label>
          <input type="password" id="npm-password" class="form-control" placeholder="Password">
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
          const emailField = document.getElementById("npm-email");
          const passwordField = document.getElementById("npm-password");
          
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
              UIUtils.closeModal();
              
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
              loadNpmCertificates();
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
}

/**
 * Load certificates from Nginx Proxy Manager API
 */
async function loadNpmCertificates() {
  let certificateSelect = document.getElementById("npm-certificate-id");
  const certificatePreview = document.getElementById("npm-certificate-preview");
  
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
    
    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success && Array.isArray(result.certificates)) {
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
          
          certificateSelect.appendChild(option);
        });
        
        // Remove existing listeners first if any
        const newSelect = certificateSelect.cloneNode(true);
        if (certificateSelect.parentNode) {
          certificateSelect.parentNode.replaceChild(newSelect, certificateSelect);
        }
        
        // Add listener for certificate selection
        newSelect.addEventListener('change', updateCertificatePreview);
        
        // Update UI reference - use the new select element
        certificateSelect = newSelect;
      }
    } else {
      certificateSelect.innerHTML = '<option value="">Failed to load certificates</option>';
      Logger.error("Error loading NPM certificates:", result.message);
    }
  } catch (error) {
    Logger.error("Error loading NPM certificates:", error);
    certificateSelect.innerHTML = '<option value="">Error loading certificates</option>';
  } finally {
    certificateSelect.disabled = false;
  }
}

/**
 * Update certificate preview when a certificate is selected
 */
function updateCertificatePreview() {
  const certificateSelect = document.getElementById("npm-certificate-id");
  const certPreview = document.getElementById("npm-certificate-preview");
  const certDomain = document.getElementById("npm-cert-domain");
  const certExpiry = document.getElementById("npm-cert-expiry");

  if (!certificateSelect || !certPreview || !certDomain || !certExpiry) return;

  const selectedOption = certificateSelect.options[certificateSelect.selectedIndex];

  if (selectedOption && selectedOption.value) {
    // Get certificate details from data attributes
    certDomain.textContent = selectedOption.getAttribute('data-domain') || 'Unknown';
    certExpiry.textContent = selectedOption.getAttribute('data-expiry') || 'Unknown';

    // Show preview
    certPreview.classList.remove("hidden");
  } else {
    // Hide preview if no certificate is selected
    certPreview.classList.add("hidden");
  }
}

/**
 * Get the NPM action configuration from the form
 * Called when saving the deployment action for API method
 */
function getNpmApiActionConfig() {
  const actionConfig = {
    type: 'nginx-proxy-manager',
    method: 'api'
  };

  const apiUrlField = document.getElementById("npm-api-url");
  const certificateSelect = document.getElementById("npm-certificate-id");

  if (!apiUrlField || !apiUrlField.value.trim()) {
    UIUtils.showToast("Please enter the NPM API URL", "warning");
    return null;
  }

  // Add API URL
  actionConfig.npmUrl = apiUrlField.value.trim();

  // Check if a certificate is selected for update
  if (certificateSelect && certificateSelect.value) {
    actionConfig.certificateId = certificateSelect.value;
  } else {
    UIUtils.showToast("Please select a certificate to update", "warning");
    return null;
  }

  // Add restart option if checked
  const restartOption = document.getElementById("npm-restart-services");
  if (restartOption && restartOption.checked) {
    actionConfig.restartServices = true;
  }

  // Add verify option if checked
  const verifyOption = document.getElementById("npm-verify-update");
  if (verifyOption && verifyOption.checked) {
    actionConfig.verifyUpdate = true;
  }

  return actionConfig;
}

/**
 * Setup toggle behavior for SSH authentication method
 */
function setupSshAuthToggle() {
  const passwordMethodRadio = document.getElementById("ssh-auth-password");
  const keyMethodRadio = document.getElementById("ssh-auth-key");
  const passwordGroup = document.getElementById("ssh-password-group");
  const keyGroup = document.getElementById("ssh-key-group");

  if (!passwordMethodRadio || !keyMethodRadio || !passwordGroup || !keyGroup) {
    Logger.warn("SSH auth toggle elements not found");
    return;
  }

  // Set initial state
  if (passwordMethodRadio.checked) {
    passwordGroup.classList.remove("hidden");
    keyGroup.classList.add("hidden");
  } else if (keyMethodRadio.checked) {
    passwordGroup.classList.add("hidden");
    keyGroup.classList.remove("hidden");
  }

  // Add change listeners
  passwordMethodRadio.addEventListener("change", function () {
    if (this.checked) {
      passwordGroup.classList.remove("hidden");
      keyGroup.classList.add("hidden");
      markFormChanged();
    }
  });

  keyMethodRadio.addEventListener("change", function () {
    if (this.checked) {
      passwordGroup.classList.add("hidden");
      keyGroup.classList.remove("hidden");
      markFormChanged();
    }
  });
}

/**
 * Setup SMB fields specific behaviors
 */
function setupSmbFields() {
  // Enable domain field only when username is provided
  const usernameField = document.getElementById("smb-username");
  const domainField = document.getElementById("smb-domain");

  if (usernameField && domainField) {
    // Initial state
    domainField.disabled = !usernameField.value;

    // Add listener
    usernameField.addEventListener("input", function () {
      domainField.disabled = !this.value;
    });
  }
}

/**
 * Setup FTP fields specific behaviors
 */
function setupFtpFields() {
  // Adjust port based on secure checkbox
  const secureCheckbox = document.getElementById("ftp-secure");
  const portField = document.getElementById("ftp-port");

  if (secureCheckbox && portField) {
    // Add listener to change default port based on secure option
    secureCheckbox.addEventListener("change", function () {
      // Only change port if it's at the default values
      if (portField.value === "21" && this.checked) {
        portField.value = "990"; // Default FTPS port
      } else if (portField.value === "990" && !this.checked) {
        portField.value = "21"; // Default FTP port
      }

      updateActionName();
    });
  }
}

/**
 * Setup API call fields specific behaviors
 */
function setupApiFields() {
  // Change content type fields based on method
  const methodSelect = document.getElementById("api-method");
  const contentTypeField = document.getElementById("api-content-type");
  const bodyField = document.getElementById("api-body");
  const bodyGroup = document.getElementById("api-body-group");

  if (methodSelect && contentTypeField && bodyGroup) {
    // Initial state
    const isBodyApplicable = ["POST", "PUT", "PATCH"].includes(methodSelect.value);
    bodyGroup.classList.toggle("hidden", !isBodyApplicable);

    // Add listener
    methodSelect.addEventListener("change", function () {
      const isBodyApplicable = ["POST", "PUT", "PATCH"].includes(this.value);
      bodyGroup.classList.toggle("hidden", !isBodyApplicable);
      updateActionName();
    });
  }
}

/**
 * Setup webhook fields specific behaviors
 */
function setupWebhookFields() {
  // Similar to API fields
  const methodSelect = document.getElementById("webhook-method");
  const contentTypeField = document.getElementById("webhook-content-type");
  const payloadField = document.getElementById("webhook-payload");
  const payloadGroup = document.getElementById("webhook-payload-group");

  if (methodSelect && contentTypeField && payloadGroup) {
    // Initial state
    const isPayloadApplicable = ["POST", "PUT", "PATCH"].includes(methodSelect.value);
    payloadGroup.classList.toggle("hidden", !isPayloadApplicable);

    // Add listener
    methodSelect.addEventListener("change", function () {
      const isPayloadApplicable = ["POST", "PUT", "PATCH"].includes(this.value);
      payloadGroup.classList.toggle("hidden", !isPayloadApplicable);
      updateActionName();
    });
  }
}

/**
 * Setup email fields specific behaviors
 */
function setupEmailFields() {
  // Add template insertion buttons for email subject and body
  const emailSubject = document.getElementById("email-subject");
  const emailBody = document.getElementById("email-body");

  // Insert template variables on special key combinations
  if (emailSubject) {
    emailSubject.addEventListener("keydown", function (e) {
      // Ctrl+Space to show template variables
      if (e.ctrlKey && e.code === "Space") {
        showTemplateVariablesMenu(this);
        e.preventDefault();
      }
    });
  }

  if (emailBody) {
    emailBody.addEventListener("keydown", function (e) {
      // Ctrl+Space to show template variables
      if (e.ctrlKey && e.code === "Space") {
        showTemplateVariablesMenu(this);
        e.preventDefault();
      }
    });
  }
}

/**
 * Show template variables menu for insertion
 * @param {HTMLElement} element - Target element to insert variable
 */
function showTemplateVariablesMenu(element) {
  const variables = [
    { name: "Certificate Name", code: "{cert_name}" },
    { name: "Certificate Domains", code: "{cert_domains}" },
    { name: "Expiry Date", code: "{cert_expiry}" },
    { name: "Fingerprint", code: "{cert_fingerprint}" },
    { name: "Common Name", code: "{cert_common_name}" },
    { name: "Organization", code: "{cert_organization}" },
    { name: "Current Date", code: "{current_date}" },
    { name: "Server Name", code: "{server_name}" }
  ];

  // Create popup menu
  const menu = document.createElement("div");
  menu.className = "template-variables-menu";
  menu.style.position = "absolute";
  menu.style.zIndex = "1000";
  menu.style.backgroundColor = "#fff";
  menu.style.border = "1px solid #ddd";
  menu.style.borderRadius = "4px";
  menu.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
  menu.style.padding = "5px 0";
  menu.style.maxHeight = "200px";
  menu.style.overflowY = "auto";

  // Position near the element
  const rect = element.getBoundingClientRect();
  menu.style.left = `${rect.left}px`;
  menu.style.top = `${rect.bottom + 5}px`;

  // Add variables to menu
  variables.forEach(variable => {
    const item = document.createElement("div");
    item.className = "template-variable-item";
    item.style.padding = "8px 15px";
    item.style.cursor = "pointer";
    item.style.userSelect = "none";
    item.textContent = `${variable.name} (${variable.code})`;

    // Hover effect
    item.addEventListener("mouseover", () => {
      item.style.backgroundColor = "#f0f0f0";
    });

    item.addEventListener("mouseout", () => {
      item.style.backgroundColor = "";
    });

    // Click to insert
    item.addEventListener("click", () => {
      // Insert variable at cursor position or replace selection
      insertTextAtCursor(element, variable.code);
      document.body.removeChild(menu);
      markFormChanged();
    });

    menu.appendChild(item);
  });

  // Close when clicking outside
  function handleClickOutside(e) {
    if (!menu.contains(e.target) && e.target !== element) {
      document.body.removeChild(menu);
      document.removeEventListener("click", handleClickOutside);
    }
  }

  // Add to document
  document.body.appendChild(menu);

  // Listen for clicks outside
  setTimeout(() => {
    document.addEventListener("click", handleClickOutside);
  }, 10);
}

/**
 * Insert text at cursor position in input element
 * @param {HTMLElement} element - Input element
 * @param {string} text - Text to insert
 */
function insertTextAtCursor(element, text) {
  if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
    const start = element.selectionStart || 0;
    const end = element.selectionEnd || start;
    const beforeText = element.value.substring(0, start);
    const afterText = element.value.substring(end, element.value.length);

    element.value = beforeText + text + afterText;

    // Move cursor position after inserted text
    element.selectionStart = element.selectionEnd = start + text.length;
    element.focus();
  }
}

/**
 * Setup copy fields specific behaviors
 */
function setupCopyFields() {
  // Set up source selection behavior
  const sourceSelect = document.getElementById("copy-source");

  if (sourceSelect) {
    sourceSelect.addEventListener("change", function () {
      updateActionName();
    });
  }
}

/**
 * Setup command fields specific behaviors
 */
function setupCommandFields() {
  // Add command history/suggestion feature if needed
  const commandField = document.getElementById("command-command");

  if (commandField) {
    // Example: Add syntax highlighting or command suggestions
    commandField.addEventListener("input", function () {
      // Update action name on input for immediate feedback
      updateActionName();
    });
  }
}

// Export functions for global scope
window.initializeDeploymentActionButton = initializeDeploymentActionButton;
window.showDeploymentActionForm = showDeploymentActionForm;
window.loadCertificateDeploymentActions = loadCertificateDeploymentActions;

/**
 * Function to load deployment actions for a certificate
 * @param {string} fingerprint - Certificate fingerprint
 */
function loadDeploymentActions(fingerprint) {
  const actionsContainer = document.getElementById('deployment-actions-list');

  if (!actionsContainer) return;

  // Show loading state
  actionsContainer.innerHTML = `
    <div class="loading-container">
      <div class="loading-spinner small"></div>
      <div class="loading-text">Loading deployment actions...</div>
    </div>
  `;

  // Fetch deployment actions
  fetch(`/api/certificates/${fingerprint}/deploy-actions`)
    .then(response => response.json())
    .then(actions => {
      // Check if we have actions
      if (actions && Array.isArray(actions) && actions.length > 0) {
        // Create sortable container
        let html = '<div class="sortable-actions">';

        // Generate HTML for each action
        actions.forEach((action, index) => {
          html += createActionItemHtml(action, index);
        });

        html += '</div>';

        // Add execute button below the actions
        html += `
          <div class="execute-actions-container">
            <button id="execute-all-actions-btn" class="button primary">
              <i class="fas fa-play-circle"></i> Execute All Actions
            </button>
          </div>
        `;

        // Update container
        actionsContainer.innerHTML = html;

        // Setup event listeners
        setupActionEventListeners(fingerprint);

        // Make actions sortable 
        if (typeof initDeployActionsSortable === 'function') {
          initDeployActionsSortable(fingerprint);
        }

      } else {
        // Show empty state
        actionsContainer.innerHTML = `
          <div class="empty-actions-message">
            <i class="fas fa-rocket fa-3x"></i>
            <p>No deployment actions configured yet.</p>
            <p>Click "Add Action" to configure how this certificate should be deployed.</p>
          </div>
        `;
      }
    })
    .catch(error => {
      console.error('Error loading deployment actions:', error);
      actionsContainer.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to load deployment actions.</p>
          <button class="button small" onclick="loadDeploymentActions('${fingerprint}')">Try Again</button>
        </div>
      `;
    });
}

// Create HTML for an action item
function createActionItemHtml(action, index) {
  const enabledClass = action.enabled === false ? 'disabled' : '';
  const actionName = action.name || `${action.type} action`;
  const actionDescription = getActionDescription(action);

  return `
    <div class="deployment-action-item ${enabledClass}" data-index="${index}">
      <div class="drag-handle">
        <i class="fas fa-grip-lines"></i>
      </div>
      <div class="deployment-action-info">
        <span class="deployment-action-name">${UIUtils.escapeHTML(actionName)}</span>
        <span class="deployment-action-type">${action.type}</span>
        <span class="deployment-action-desc">${UIUtils.escapeHTML(actionDescription)}</span>
      </div>
      <div class="deployment-action-toggle">
        <label class="toggle-switch">
          <input type="checkbox" class="action-toggle" data-index="${index}" 
                 ${action.enabled === false ? '' : 'checked'}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="deployment-action-buttons">
        <button class="button small test-action" data-index="${index}">
          <i class="fas fa-vial"></i> Test
        </button>
        <button class="button small edit-action" data-index="${index}">
          <i class="fas fa-pencil"></i> Edit
        </button>
        <button class="button small danger delete-action" data-index="${index}">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `;
}

// Get a description for the action based on its type and settings
function getActionDescription(action) {
  switch (action.type) {
    case 'copy':
      return `Copy ${action.source} to ${action.destination}`;
    case 'command':
      return `Execute: ${action.command.substring(0, 50)}${action.command.length > 50 ? '...' : ''}`;
    case 'docker-restart':
      return `Restart container: ${action.container}`;
    case 'nginx-proxy-manager':
      return `Update NPM cert at ${action.url}`;
    case 'ssh-copy':
      return `Copy ${action.source} to ${action.host}:${action.destination}`;
    case 'ftp-copy':
      return `FTP upload ${action.source} to ${action.host}`;
    case 'api-call':
      return `API ${action.method.toUpperCase()} to ${action.url}`;
    case 'webhook':
      return `Send ${action.type} webhook to ${action.url}`;
    case 'email':
      return `Email notification to ${action.to}`;
    default:
      return `${action.type} action`;
  }
}

// Setup event listeners for action buttons
function setupActionEventListeners(fingerprint) {

  // Execute all actions button
  const executeAllBtn = document.getElementById('execute-all-actions-btn');
  if (executeAllBtn) {
    executeAllBtn.addEventListener('click', () => {
      executeAllActions(fingerprint);
    });
  }

  // Action toggle switches
  document.querySelectorAll('.action-toggle').forEach(toggle => {
    toggle.addEventListener('change', function () {
      const index = this.dataset.index;
      toggleAction(fingerprint, index, this.checked);
    });
  });

  // Test action buttons
  document.querySelectorAll('.test-action').forEach(button => {
    button.addEventListener('click', function () {
      const index = this.dataset.index;
      testAction(fingerprint, index);
    });
  });

  // Edit action buttons
  document.querySelectorAll('.edit-action').forEach(button => {
    button.addEventListener('click', function () {
      const index = this.dataset.index;
      editAction(fingerprint, index);
    });
  });

  // Delete action buttons
  document.querySelectorAll('.delete-action').forEach(button => {
    button.addEventListener('click', function () {
      const index = this.dataset.index;
      deleteAction(fingerprint, index);
    });
  });
}

// Toggle an action's enabled state
function toggleAction(fingerprint, index, enabled) {
  fetch(`/api/certificates/${fingerprint}/deploy-actions/${index}/toggle`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ enabled })
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showToast(`Action ${enabled ? 'enabled' : 'disabled'} successfully`, 'success');
      } else {
        showToast(`Failed to ${enabled ? 'enable' : 'disable'} action: ${data.message}`, 'error');
        loadDeploymentActions(fingerprint); // Reload to reset toggle state
      }
    })
    .catch(error => {
      console.error('Error toggling action:', error);
      showToast('Error updating action status', 'error');
      loadDeploymentActions(fingerprint); // Reload to reset toggle state
    });
}

// Test action execution
function testAction(fingerprint, index) {
  showToast('Testing action...', 'info');

  fetch(`/api/certificates/${fingerprint}/deploy-actions/${index}/test`, {
    method: 'POST'
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showToast('Test execution completed successfully', 'success');

        // Show detailed results in a modal
        showActionResultDialog('Test Results', data.result);
      } else {
        showToast(`Test execution failed: ${data.message}`, 'error');
      }
    })
    .catch(error => {
      console.error('Error testing action:', error);
      showToast('Error during test execution', 'error');
    });
}

// Execute all actions
function executeAllActions(fingerprint) {
  // Ask for confirmation
  if (!confirm('Execute all deployment actions for this certificate?')) {
    return;
  }

  showToast('Executing all actions...', 'info');

  fetch(`/api/certificates/${fingerprint}/deploy-actions/execute`, {
    method: 'POST'
  })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        showToast(`Successfully executed ${data.actionsSucceeded} of ${data.actionsExecuted} actions`, 'success');

        // Show detailed results in a modal
        showActionResultsDialog('Execution Results', data.results);
      } else {
        showToast(`Execution failed: ${data.message}`, 'error');
      }
    })
    .catch(error => {
      console.error('Error executing actions:', error);
      showToast('Error during action execution', 'error');
    });
}

// Expose functions to global scope
window.loadDeploymentActions = loadDeploymentActions;