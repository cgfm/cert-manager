/**
 * Certificate Manager - Certificate Actions
 * Handles operations on certificates like creation, renewal, and deployment
 */

/**
 * Initialize certificate action handlers
 */
function setupCertificateActions() {
  Logger.debug("Setting up certificate action handlers");

  // Create certificate button
  document
    .getElementById("create-cert-btn")
    ?.addEventListener("click", showCreateCertificateModal);
  document
    .getElementById("create-ca-btn")
    ?.addEventListener("click", showCreateCAModal);

  // Certificate type selection
  document
    .getElementById("cert-type")
    ?.addEventListener("change", handleCertificateTypeChange);

  // Passphrase checkbox toggle
  document
    .getElementById("cert-passphrase")
    ?.addEventListener("change", togglePassphraseFields);

  // Certificate modal form submission
  document
    .getElementById("cert-modal-save")
    ?.addEventListener("click", saveCertificate);
  document
    .getElementById("cert-modal-cancel")
    ?.addEventListener("click", hideCertificateModal);

  // Certificate details actions
  document
    .getElementById("close-cert-details")
    ?.addEventListener("click", hideCertificateDetailsModal);
  document
    .getElementById("delete-cert-btn")
    ?.addEventListener("click", confirmDeleteCertificate);
  document
    .getElementById("renew-cert-btn")
    ?.addEventListener("click", renewSelectedCertificate);

  // Deployment actions
  if (typeof initializeDeploymentActionButton === "function") {
    initializeDeploymentActionButton(
      document.getElementById("add-deployment-action-btn")
    );
  } else {
    Logger.error("initializeDeploymentActionButton function not found");
  }

  // Certificate list filters
  document
    .getElementById("cert-search")
    ?.addEventListener("input", filterCertificates);
  document
    .getElementById("filter-valid")
    ?.addEventListener("change", filterCertificates);
  document
    .getElementById("filter-expiring")
    ?.addEventListener("change", filterCertificates);
  document
    .getElementById("filter-expired")
    ?.addEventListener("change", filterCertificates);

  // Refresh buttons
  document
    .getElementById("refresh-certs")
    ?.addEventListener("click", () => loadCertificates(true));
  document
    .getElementById("refresh-ca")
    ?.addEventListener("click", () => loadCACertificates(true));
  document
    .getElementById("refresh-dashboard")
    ?.addEventListener("click", loadDashboard);

  Logger.info("Certificate action handlers initialized successfully");
}

/**
 * Show the certificate create/edit modal
 * @param {boolean} isCA - Whether to create a CA certificate
 */
function showCreateCertificateModal(isCA = false) {
  Logger.debug(`Opening certificate modal, isCA=${isCA}`);

  const modal = document.getElementById("certificate-modal");
  const title = document.getElementById("cert-modal-title");
  const saveBtn = document.getElementById("cert-modal-save");
  const form = document.getElementById("certificate-form");

  // Reset form
  form.reset();
  document.getElementById("cert-id").value = "";

  // Set modal title and button text
  title.textContent = isCA ? "Create CA Certificate" : "Create Certificate";
  saveBtn.textContent = "Create";

  // Set certificate type if creating a CA
  if (isCA) {
    document.getElementById("cert-type").value = "rootCA";
    handleCertificateTypeChange();
    Logger.debug("Setting up modal for CA certificate creation");
  } else {
    document.getElementById("cert-type").value = "standard";
    handleCertificateTypeChange();
    Logger.debug("Setting up modal for standard certificate creation");
  }

  // Show the modal
  modal.classList.remove("hidden");
  document.getElementById("modal-backdrop").classList.remove("hidden");
  Logger.info(`Certificate ${isCA ? "CA" : "creation"} modal displayed`);
}

/**
 * Show modal to create a CA certificate
 */
function showCreateCAModal() {
  showCreateCertificateModal(true);
}

/**
 * Hide the certificate modal
 */
function hideCertificateModal() {
  document.getElementById("certificate-modal").classList.add("hidden");
  document.getElementById("modal-backdrop").classList.add("hidden");
}

/**
 * Handle certificate type change
 */
function handleCertificateTypeChange() {
  const certType = document.getElementById("cert-type").value;
  Logger.debug(`Certificate type changed to: ${certType}`);

  const standardFields = document.getElementById("standard-cert-fields");
  const caFields = document.getElementById("ca-cert-fields");

  if (certType === "rootCA" || certType === "intermediateCA") {
    standardFields.classList.add("hidden");
    caFields.classList.remove("hidden");
    Logger.debug("Showing CA certificate fields");
  } else {
    standardFields.classList.remove("hidden");
    caFields.classList.add("hidden");
    Logger.debug("Showing standard certificate fields");
  }
}

/**
 * Toggle passphrase input fields
 */
function togglePassphraseFields() {
  const usePassphrase = document.getElementById("cert-passphrase").checked;
  const passphraseFields = document.getElementById("passphrase-fields");

  if (usePassphrase) {
    passphraseFields.classList.remove("hidden");
  } else {
    passphraseFields.classList.add("hidden");
  }
}

/**
 * Toggle SSH authentication method fields
 */
function toggleSshAuthFields() {
  const authMethod = document.getElementById("ssh-auth-method").value;
  const passwordFields = document.getElementById("ssh-password-fields");
  const keyFields = document.getElementById("ssh-key-fields");

  if (authMethod === "password") {
    passwordFields.classList.remove("hidden");
    keyFields.classList.add("hidden");
  } else {
    passwordFields.classList.add("hidden");
    keyFields.classList.remove("hidden");
  }
}

/**
 * Create or update a certificate
 */
async function saveCertificate() {
  Logger.debug("Attempting to save certificate");

  const form = document.getElementById("certificate-form");
  const certId = document.getElementById("cert-id").value;
  const isEdit = certId !== "";

  // Basic validations
  const name = document.getElementById("cert-name").value;
  if (!name) {
    UIUtils.showError("Certificate name is required");
    Logger.warn("Certificate save failed: name is required");
    return;
  }

  const certType = document.getElementById("cert-type").value;
  if (certType === "standard") {
    const commonName = document.getElementById("cert-common-name").value;
    if (!commonName) {
      UIUtils.showError("Common name (domain) is required");
      Logger.warn("Certificate save failed: common name is required");
      return;
    }

    if (!DomainValidator.isValid(commonName)) {
      UIUtils.showError("Invalid domain name format");
      Logger.warn(
        `Certificate save failed: invalid domain format: ${commonName}`
      );
      return;
    }
  }

  // Validate passphrase if enabled
  if (document.getElementById("cert-passphrase").checked) {
    const passphrase = document.getElementById("cert-passphrase-value").value;
    const confirmPassphrase = document.getElementById(
      "cert-passphrase-confirm"
    ).value;

    if (!passphrase) {
      UIUtils.showError("Passphrase is required");
      Logger.warn("Certificate save failed: passphrase required but missing");
      return;
    }

    if (passphrase !== confirmPassphrase) {
      UIUtils.showError("Passphrases do not match");
      Logger.warn("Certificate save failed: passphrase confirmation mismatch");
      return;
    }
  }

  // Collect form data
  const formData = new FormData(form);
  const data = {};

  for (const [key, value] of formData.entries()) {
    data[key] = value;
  }

  // Process alternative names
  if (data.altNames) {
    data.domains = data.altNames
      .split(/[\r\n]+/)
      .map((domain) => domain.trim())
      .filter((domain) => domain && DomainValidator.isValid(domain));

    delete data.altNames;
  }

  // Show loading
  UIUtils.showNotification("Creating certificate...", "info");
  Logger.info(`${isEdit ? "Updating" : "Creating"} certificate: ${name}`);

  try {
    const endpoint = isEdit
      ? `/api/certificates/${certId}`
      : "/api/certificates";
    const method = isEdit ? "PUT" : "POST";

    Logger.debug(`Sending ${method} request to ${endpoint}`);
    const response = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorText = await response.text();
      Logger.error(
        `Failed to ${isEdit ? "update" : "create"} certificate: ${errorText}`
      );
      throw new Error(
        `Failed to ${isEdit ? "update" : "create"} certificate: ${errorText}`
      );
    }

    const result = await response.json();
    Logger.info(
      `Certificate ${isEdit ? "updated" : "created"} successfully: ${name}`
    );

    // Hide modal and reload certificates
    hideCertificateModal();
    await loadCertificates();

    // Show success message
    UIUtils.showNotification(
      `Certificate ${isEdit ? "updated" : "created"} successfully`,
      "success"
    );

    // If creating a certificate, show its details
    if (!isEdit && result.id) {
      Logger.debug(
        `Showing details for newly created certificate: ${result.id}`
      );
      showCertificateDetails(result.id);
    }
  } catch (error) {
    Logger.error(`Error saving certificate: ${error.message}`);
    UIUtils.showError(error.message);
  }
}

/**
 * Show certificate details modal using UIUtils
 * @param {string} fingerprint - Certificate fingerprint
 */
async function showCertificateDetails(fingerprint) {
  Logger.debug("Showing certificate details for:", fingerprint);

  if (!fingerprint) {
    UIUtils.showToast("Certificate ID is missing", "error");
    return;
  }

  try {
    // Show loading state first
    UIUtils.showModal("cert-details-modal", {
      title: "Certificate Details",
      content: '<div class="loading-spinner"></div>',
      buttons: [
        { text: "Close", id: "close-cert-details-btn", action: "close" },
      ],
    });

    // Clean and encode the fingerprint for API use
    const cleanedFingerprint = encodeAPIFingerprint(fingerprint);

    // Fetch certificate details
    const response = await fetch(`/api/certificates/${cleanedFingerprint}`);

    if (!response.ok) {
      throw new Error(`Failed to load certificate details: ${response.status}`);
    }

    const certificate = await response.json();

    // Store in state for other functions to use
    state.currentCertificate = certificate;

    // Fetch the certificate details template
    const templateResponse = await fetch("/templates/cert-details-modal.html");
    if (!templateResponse.ok) {
      throw new Error(`Failed to load template: ${templateResponse.status}`);
    }

    let templateHtml = await templateResponse.text();

    // Process the template with certificate data
    const processedHtmlHeader = processCertificateTemplate(
      `
  <span class="cert-name">\${certificate.name}</span>
  <span class="cert-status \${statusClass}">\${statusText}</span>`,
      certificate
    );
    const processedHtml = processCertificateTemplate(templateHtml, certificate);

    // Update the modal with certificate details
    UIUtils.updateModal("cert-details-modal", {
      extendedHeader: processedHtmlHeader,
      content: processedHtml,
      data: { certId: fingerprint },
      buttons: [
        { text: "Close", id: "close-cert-details-btn", action: "close" },
        { text: "Download", id: "download-cert-btn", action: "custom" },
        {
          text: "Renew",
          id: "renew-cert-btn",
          action: "custom",
          class: "primary",
        },
        {
          text: "Delete",
          id: "delete-cert-btn",
          action: "custom",
          class: "danger",
        },
      ],
    });

    // Initialize tabs and event handlers - use the container-based version
    const modalContent = document.querySelector(
      "#cert-details-modal .modal-content"
    );
    initializeCertificateDetailsTabs(modalContent);

    // Load additional data for tabs
    loadCertificateTabData(certificate);

    Logger.info(`Displayed details for certificate: ${certificate.name}`);
  } catch (error) {
    Logger.error("Error showing certificate details:", error);

    // Show error in modal
    UIUtils.updateModal("cert-details-modal", {
      title: "Error Loading Certificate",
      content: `
        <div class="error-state">
          <h3>Failed to load certificate details</h3>
          <p>${UIUtils.sanitizeErrorMessage(error)}</p>
          <button id="retry-load-cert-btn" class="button">Retry</button>
        </div>
      `,
      buttons: [
        { text: "Close", id: "close-cert-details-btn", action: "close" },
      ],
    });

    // Add retry button handler
    document
      .getElementById("retry-load-cert-btn")
      ?.addEventListener("click", () => {
        showCertificateDetails(fingerprint);
      });
  }
}

/**
 * Process certificate template with certificate data
 * @param {string} template - HTML template
 * @param {Object} certificate - Certificate data
 * @returns {string} Processed HTML
 */
function processCertificateTemplate(template, certificate) {
  // Calculate status
  let status = "unknown";
  let statusClass = "status-unknown";

  if (certificate.isExpired) {
    status = "expired";
    statusClass = "status-expired";
  } else if (certificate.isExpiringSoon) {
    status = "expiring";
    statusClass = "status-warning";
  } else {
    status = "valid";
    statusClass = "status-valid";
  }

  // Format dates
  const expiryDate = certificate.validTo
    ? DateUtils.formatDate(certificate.validTo)
    : "N/A";
  const issueDate = certificate.validFrom
    ? DateUtils.formatDate(certificate.validFrom)
    : "N/A";

  // Extract main domain
  const domain =
    certificate.domains && certificate.domains.length > 0
      ? certificate.domains[0]
      : certificate.name;

  // Prepare data for template
  const data = {
    certificate: certificate,
    statusClass: statusClass,
    statusText: status,
    domain: domain,
    expiryDate: expiryDate,
    issueDate: issueDate,
    daysUntilExpiry: certificate.daysUntilExpiry || "N/A",
  };

  // Process template with data
  return UIUtils.safeTemplate(template, data);
}

/**
 * Set up certificate edit functionality
 */
function setupCertificateEditFunctionality() {
  // Initialize edit details button
  const editDetailsBtn = document.getElementById("edit-cert-details-btn");
  const cancelEditBtn = document.getElementById("cancel-edit-details-btn");
  const saveDetailsBtn = document.getElementById("save-cert-details-btn");

  if (editDetailsBtn && cancelEditBtn && saveDetailsBtn) {
    editDetailsBtn.addEventListener("click", () => {
      document.getElementById("cert-details-view").classList.add("hidden");
      document.getElementById("cert-details-edit").classList.remove("hidden");
    });

    cancelEditBtn.addEventListener("click", () => {
      document.getElementById("cert-details-edit").classList.add("hidden");
      document.getElementById("cert-details-view").classList.remove("hidden");
    });

    saveDetailsBtn.addEventListener("click", () => saveCertificateDetails());
  }
}

/**
 * Add event handlers for certificate action buttons
 * @param {string} fingerprint - Certificate fingerprint
 */
function addCertificateButtonHandlers(fingerprint) {
  // Download button
  document
    .getElementById("download-cert-btn")
    ?.addEventListener("click", () => {
      if (state.currentCertificate) {
        showCertificateDownloadOptions(state.currentCertificate);
      }
    });

  // Renew button
  document.getElementById("renew-cert-btn")?.addEventListener("click", () => {
    if (state.currentCertificate) {
      UIUtils.closeModal("cert-details-modal");
      renewCertificate(state.currentCertificate.fingerprint);
    }
  });

  // Delete button
  document.getElementById("delete-cert-btn")?.addEventListener("click", () => {
    if (state.currentCertificate) {
      UIUtils.closeModal("cert-details-modal");
      confirmDeleteCertificate();
    }
  });
}

/**
 * Load data for specific tab content
 * @param {string} tabId - Tab ID
 * @param {Object} certificate - Certificate object
 */
function loadTabContentIfNeeded(tabId, certificate) {
  switch (tabId) {
    case "files":
      loadCertificateFiles(certificate);
      break;
    case "domains":
      loadCertificateDomains(certificate);
      break;
    case "deployment":
      loadCertificateDeploymentActions(certificate);
      break;
    case "backups":
      loadCertificateBackups(certificate);
      break;
    case "settings":
      initializeSettingsForm(certificate);
      break;
    // 'details' tab already loaded with template
  }
}

/**
 * Load all certificate tab data
 * @param {Object} certificate - Certificate object
 */
function loadCertificateTabData(certificate) {
  // Set timeout to ensure DOM is ready
  setTimeout(() => {
    loadCertificateFiles(certificate);
    loadCertificateDomains(certificate);
    loadCertificateDeploymentActions(certificate);
    loadCertificateBackups(certificate);
    initializeSettingsForm(certificate);
  }, 100);
}

/**
 * Helper function to properly encode certificate fingerprint for API use
 * This function removes the "sha256 Fingerprint=" prefix if present
 * @param {string} fingerprint - Raw certificate fingerprint
 * @returns {string} - Encoded fingerprint suitable for API URLs
 */
function encodeAPIFingerprint(fingerprint) {
  // Ensure fingerprint is a string
  if (fingerprint === null || fingerprint === undefined) {
    console.error(
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

/**
 * Initialize settings form with certificate data
 * @param {Object} certificate - Certificate object
 */
function initializeSettingsForm(certificate) {
  // Get form elements
  const autoRenewCheckbox = document.getElementById("cert-auto-renew");
  const validityInput = document.getElementById("cert-validity");
  const renewBeforeInput = document.getElementById("cert-renew-before");
  const keySizeSelect = document.getElementById("cert-key-size");

  if (
    !autoRenewCheckbox ||
    !validityInput ||
    !renewBeforeInput ||
    !keySizeSelect
  ) {
    console.error("Settings form elements not found");
    return;
  }

  // Set form field values from certificate if available
  if (certificate) {
    autoRenewCheckbox.checked = certificate.autoRenew || false;

    // Only set validity if it's defined in the certificate
    if (certificate.validity) {
      validityInput.value = certificate.validity;
    }

    // Only set renewBefore if it's defined in the certificate
    if (certificate.renewBefore) {
      renewBeforeInput.value = certificate.renewBefore;
    }

    // Only set keySize if it's defined in the certificate
    if (certificate.keySize) {
      keySizeSelect.value = certificate.keySize;
    }
  }

  // Fetch global settings for placeholders
  fetchGlobalSettings()
    .then((globalSettings) => {
      // Set placeholders with global settings
      validityInput.placeholder = `Default: ${
        globalSettings.validity || 365
      } days`;
      renewBeforeInput.placeholder = `Default: ${
        globalSettings.renewBefore || 30
      } days`;

      // Add a note about global settings
      const settingsNote = document.createElement("p");
      settingsNote.className = "settings-note";
      settingsNote.textContent = "Empty fields will use global default values.";

      const formGroups = document.querySelectorAll(".form-group");
      if (formGroups.length > 0) {
        formGroups[formGroups.length - 1].after(settingsNote);
      }
    })
    .catch((error) => {
      console.error("Error fetching global settings:", error);
    });
}

/**
 * Fetch global settings from the server
 * @returns {Promise<Object>} Global settings
 */
async function fetchGlobalSettings() {
  try {
    const response = await fetch("/api/settings/certificates");
    if (!response.ok) {
      throw new Error(`Failed to load global settings: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching global settings:", error);
    // Return default values if request fails
    return {
      validity: 365,
      renewBefore: 30,
      keySize: 2048,
    };
  }
}

/**
 * Prepare data object for the template
 * @param {Object} certificate - Certificate details
 * @returns {Object} - Prepared data object
 */
function prepareTemplateData(certificate) {
  // Calculate status
  let status = "unknown";
  let statusClass = "status-unknown";

  if (certificate.isExpired) {
    status = "expired";
    statusClass = "status-expired";
  } else if (certificate.isExpiringSoon) {
    status = "expiring";
    statusClass = "status-warning";
  } else {
    status = "valid";
    statusClass = "status-valid";
  }

  // Format dates
  const expiryDate = certificate.validTo
    ? DateUtils.formatDate(certificate.validTo)
    : "N/A";
  const issueDate = certificate.validFrom
    ? DateUtils.formatDate(certificate.validFrom)
    : "N/A";

  // Extract main domain
  const domain =
    certificate.domains && certificate.domains.length > 0
      ? certificate.domains[0]
      : certificate.name;

  return {
    certificate,
    statusClass,
    statusText: status,
    domain,
    expiryDate,
    issueDate,
    daysUntilExpiry: certificate.daysUntilExpiry || "N/A",
  };
}

/**
 * Initialize tabs and event handlers for certificate details
 * @param {HTMLElement} container - Container element
 */
function initializeCertificateDetailsTabs(container) {
  Logger.debug("Initializing certificate details tabs");

  // Initialize tab navigation
  const tabButtons = container.querySelectorAll(".cert-tab-btn");
  const tabContents = container.querySelectorAll(".cert-tab-content");

  if (!tabButtons || tabButtons.length === 0) {
    Logger.warn("No tab buttons found in certificate details modal");
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const tabId = button.getAttribute("data-tab");
      Logger.debug(`Switching to certificate tab: ${tabId}`);

      // Deactivate all tabs
      tabButtons.forEach((btn) => btn.classList.remove("active"));
      tabContents.forEach((content) => content.classList.remove("active"));

      // Activate selected tab
      button.classList.add("active");
      const tabContent = container.querySelector(`#${tabId}-tab`);
      if (tabContent) {
        tabContent.classList.add("active");
      } else {
        Logger.warn(`Tab content not found for tab: ${tabId}`);
      }

      // Load tab content if needed
      const certificate = state.currentCertificate;
      if (certificate) {
        loadTabContentIfNeeded(tabId, certificate);
      } else {
        Logger.warn("No current certificate in state when switching tabs");
      }
    });
  });

  Logger.debug("Setting up certificate action buttons");

  // Initialize close button
  container
    .querySelector(".close-modal")
    ?.addEventListener("click", hideCertificateDetailsModal);
  container
    .querySelector("#close-cert-details-btn")
    ?.addEventListener("click", hideCertificateDetailsModal);

  // Initialize edit details button
  const editDetailsBtn = container.querySelector("#edit-cert-details-btn");
  const cancelEditBtn = container.querySelector("#cancel-edit-details-btn");
  const saveDetailsBtn = container.querySelector("#save-cert-details-btn");

  if (editDetailsBtn && cancelEditBtn && saveDetailsBtn) {
    editDetailsBtn.addEventListener("click", () => {
      Logger.debug("Switching to certificate edit mode");
      container.querySelector("#cert-details-view").classList.add("hidden");
      container.querySelector("#cert-details-edit").classList.remove("hidden");
    });

    cancelEditBtn.addEventListener("click", () => {
      Logger.debug("Canceling certificate edit mode");
      container.querySelector("#cert-details-edit").classList.add("hidden");
      container.querySelector("#cert-details-view").classList.remove("hidden");
    });

    saveDetailsBtn.addEventListener("click", () => {
      Logger.debug("Saving edited certificate details");
      saveCertificateDetails(state.currentCertificate);
    });
  } else {
    Logger.warn("Certificate edit buttons not found");
  }

  // Initialize settings tab actions
  const saveSettingsBtn = container.querySelector("#save-cert-settings-btn");
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener("click", () => {
      Logger.debug("Saving certificate settings");
      saveCertificateSettings(state.currentCertificate);
    });
  } else {
    Logger.warn("Save settings button not found");
  }

  // Initialize action buttons in footer
  const renewBtn = container.querySelector("#renew-cert-btn");
  if (renewBtn) {
    renewBtn.addEventListener("click", () => {
      if (state.currentCertificate) {
        Logger.debug(
          `Initiating certificate renewal: ${state.currentCertificate.name}`
        );
        renewCertificate(state.currentCertificate.fingerprint);
      } else {
        Logger.warn("Cannot renew - no current certificate in state");
      }
    });
  }

  const deleteBtn = container.querySelector("#delete-cert-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      if (state.currentCertificate) {
        Logger.debug(
          `Confirming certificate deletion: ${state.currentCertificate.name}`
        );
        UIUtils.confirmDialog(
          "Delete Certificate",
          `Are you sure you want to delete certificate "${state.currentCertificate.name}"? This action cannot be undone.`,
          () => deleteCertificate(state.currentCertificate.fingerprint)
        );
      } else {
        Logger.warn("Cannot delete - no current certificate in state");
      }
    });
  }

  const downloadBtn = container.querySelector("#download-cert-btn");
  if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
      if (state.currentCertificate) {
        Logger.debug(
          `Showing download options for: ${state.currentCertificate.name}`
        );
        showCertificateDownloadOptions(state.currentCertificate);
      } else {
        Logger.warn("Cannot download - no current certificate in state");
      }
    });
  }

  Logger.info("Certificate details tabs and buttons initialized");
}

/**
 * Load tab content if it hasn't been loaded yet
 * @param {string} tabId - Tab ID
 * @param {Object} certificate - Certificate object
 */
function loadTabContentIfNeeded(tabId, certificate) {
  switch (tabId) {
    case "files":
      loadCertificateFiles(certificate);
      break;
    case "domains":
      loadCertificateDomains(certificate);
      break;
    case "deployment":
      loadDeploymentActions(certificate);
      break;
    case "backups":
      loadCertificateBackups(certificate);
      break;
    // Other tabs are loaded with static content from the template
  }
}

/**
 * Save edited certificate details
 * @param {Object} certificate - Certificate object
 */
async function saveCertificateDetails(certificate) {
  try {
    const nameField = document.getElementById("edit-cert-name");
    const descriptionField = document.getElementById("edit-cert-description");
    const groupField = document.getElementById("edit-cert-group");

    if (!nameField || !descriptionField) {
      UIUtils.showToast("Could not find form fields", "error");
      return;
    }

    const updatedCertificate = {
      name: nameField.value.trim(),
      description: descriptionField.value.trim(),
      group: groupField.value,
    };

    if (!updatedCertificate.name) {
      UIUtils.showInputError(nameField, "Certificate name is required");
      return;
    }

    // Show loading state
    const saveBtn = document.getElementById("save-cert-details-btn");
    const originalText = saveBtn.textContent;
    saveBtn.textContent = "Saving...";
    saveBtn.disabled = true;

    // Save certificate details
    const response = await fetch(
      `/api/certificates/${encodeAPIFingerprint(certificate.fingerprint)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedCertificate),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update certificate: ${response.status}`);
    }

    // Update the current certificate in state
    const updatedData = await response.json();
    state.currentCertificate = {
      ...certificate,
      ...updatedData,
    };

    // Update the certificate in the certificates list
    updateCertificateInState(state.currentCertificate);

    // Switch back to view mode
    document.getElementById("cert-details-edit").classList.add("hidden");
    document.getElementById("cert-details-view").classList.remove("hidden");

    // Update the view with new data
    document.getElementById("cert-name-display").textContent = updatedData.name;
    document.querySelector(".cert-name").textContent = updatedData.name;

    UIUtils.showToast("Certificate details updated", "success");

    // Refresh the certificates list if it's visible
    if (document.getElementById("certificates-list")) {
      renderCertificatesListDetailed(state.certificates);
    }
  } catch (error) {
    console.error("Error saving certificate details:", error);
    UIUtils.showToast(`Failed to save changes: ${error.message}`, "error");
  } finally {
    // Restore button state
    const saveBtn = document.getElementById("save-cert-details-btn");
    if (saveBtn) {
      saveBtn.textContent = "Save Changes";
      saveBtn.disabled = false;
    }
  }
}

/**
 * Save certificate settings
 * @param {Object} certificate - Certificate object
 */
async function saveCertificateSettings(certificate) {
  Logger.debug(`Saving settings for certificate: ${certificate.name}`);

  try {
    const autoRenew = document.getElementById("cert-auto-renew").checked;
    const validity = parseInt(document.getElementById("cert-validity").value);
    const renewBefore = parseInt(
      document.getElementById("cert-renew-before").value
    );
    const keySize = document.getElementById("cert-key-size").value;

    // Get notification settings
    const notifications = {
      expiry: document.getElementById("notify-expiry")?.checked || false,
      renewal: document.getElementById("notify-renewal")?.checked || false,
      error: document.getElementById("notify-error")?.checked || false,
    };

    Logger.debug(
      `Settings values: autoRenew=${autoRenew}, validity=${validity}, renewBefore=${renewBefore}, keySize=${keySize}`
    );
    Logger.debug(`Notification settings: ${JSON.stringify(notifications)}`);

    // Validate inputs
    if (isNaN(validity) || validity < 1 || validity > 825) {
      UIUtils.showInputError(
        document.getElementById("cert-validity"),
        "Validity must be between 1 and 825 days"
      );
      Logger.warn(`Invalid validity value: ${validity}`);
      return;
    }

    if (isNaN(renewBefore) || renewBefore < 1 || renewBefore > 60) {
      UIUtils.showInputError(
        document.getElementById("cert-renew-before"),
        "Renew before must be between 1 and 60 days"
      );
      Logger.warn(`Invalid renewBefore value: ${renewBefore}`);
      return;
    }

    const settings = {
      autoRenew,
      validity,
      renewBefore,
      keySize,
      notifications,
    };

    // Show loading state
    const saveBtn = document.getElementById("save-cert-settings-btn");
    const originalText = saveBtn.textContent;
    saveBtn.textContent = "Saving...";
    saveBtn.disabled = true;

    // Save settings
    Logger.debug(
      `Sending settings update for certificate: ${certificate.fingerprint}`
    );
    const response = await fetch(
      `/api/certificates/${encodeAPIFingerprint(
        certificate.fingerprint
      )}/settings`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to update settings: ${response.status}`);
    }

    // Update certificate in state
    const updatedSettings = await response.json();
    state.currentCertificate = {
      ...certificate,
      ...updatedSettings,
    };

    // Update certificate in certificates list
    updateCertificateInState(state.currentCertificate);

    Logger.info(`Certificate settings saved successfully: ${certificate.name}`);
    UIUtils.showToast("Certificate settings saved", "success");
  } catch (error) {
    Logger.error(`Error saving certificate settings: ${error.message}`, error);
    UIUtils.showToast(`Failed to save settings: ${error.message}`, "error");
  } finally {
    // Restore button state
    const saveBtn = document.getElementById("save-cert-settings-btn");
    if (saveBtn) {
      saveBtn.textContent = "Save Settings";
      saveBtn.disabled = false;
    }
  }
}

/**
 * Update a certificate in the global state
 * @param {Object} updatedCert - Updated certificate data
 */
function updateCertificateInState(updatedCert) {
  if (!updatedCert || !updatedCert.fingerprint) return;

  // Update in certificates array
  const index = state.certificates.findIndex(
    (cert) => cert.fingerprint === updatedCert.fingerprint
  );
  if (index !== -1) {
    state.certificates[index] = {
      ...state.certificates[index],
      ...updatedCert,
    };
  }
}

/**
 * Load data for each tab in the certificate details
 * @param {Object} certificate - Certificate details
 */
function loadCertificateTabData(certificate) {
  // Load certificate files
  loadCertificateFiles(certificate);

  // Load domains
  loadCertificateDomains(certificate);

  // Load deployment actions
  loadDeploymentActions(certificate.fingerprint);

  // Load backups
  loadCertificateBackups(certificate.fingerprint);

  // Initialize settings form
  initializeSettingsForm(certificate);
}

/**
 * Download all certificate files as a zip archive
 * @param {Object} certificate - Certificate object
 */
async function downloadAllCertificateFiles(certificate) {
  Logger.debug(
    `Starting download of all certificate files for: ${certificate.name}`
  );

  try {
    // Show loading state
    const downloadBtn = document.getElementById("download-all-files-btn");
    if (downloadBtn) {
      const originalText = downloadBtn.textContent;
      downloadBtn.textContent = "Preparing...";
      downloadBtn.disabled = true;

      setTimeout(() => {
        if (downloadBtn) {
          downloadBtn.textContent = originalText;
          downloadBtn.disabled = false;
        }
      }, 5000); // Reset after 5 seconds if download doesn't start
    }

    // Request the zip file from the server
    Logger.debug(
      `Requesting ZIP archive for certificate: ${certificate.fingerprint}`
    );
    const response = await fetch(
      `/api/certificates/${encodeAPIFingerprint(
        certificate.fingerprint
      )}/download-all`
    );

    if (!response.ok) {
      throw new Error(`Failed to download files: ${response.status}`);
    }

    // Get the blob data
    const blob = await response.blob();

    // Create a safe filename
    const safeName = certificate.name.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const filename = `${safeName}_certificate_files.zip`;

    Logger.debug(
      `Creating download for ZIP file: ${filename} (${blob.size} bytes)`
    );

    // Create download link and trigger download
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // Clean up
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    // Reset button
    if (downloadBtn) {
      downloadBtn.textContent = "Download All Files";
      downloadBtn.disabled = false;
    }

    Logger.info(
      `Certificate files downloaded successfully for: ${certificate.name}`
    );
  } catch (error) {
    Logger.error(
      `Error downloading certificate files: ${error.message}`,
      error
    );
    UIUtils.showToast(`Failed to download files: ${error.message}`, "error");

    // Reset button
    const downloadBtn = document.getElementById("download-all-files-btn");
    if (downloadBtn) {
      downloadBtn.textContent = "Download All Files";
      downloadBtn.disabled = false;
    }
  }
}

/**
 * Format file size in a human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Get appropriate icon class for a file type
 * @param {string} fileType - Type of certificate file
 * @returns {string} CSS class for the icon
 */
function getFileIconClass(fileType) {
  switch (fileType) {
    case "cert":
      return "cert-icon";
    case "key":
      return "key-icon";
    case "p12":
    case "pfx":
      return "pkcs-icon";
    case "pem":
      return "pem-icon";
    case "csr":
      return "csr-icon";
    case "chain":
    case "fullchain":
      return "chain-icon";
    default:
      return "file-icon";
  }
}

/**
 * Get display name for a file type
 * @param {string} fileType - Type of certificate file
 * @returns {string} Human-readable file name
 */
function getDisplayName(fileType) {
  switch (fileType) {
    case "cert":
      return "Certificate (PEM/CRT)";
    case "key":
      return "Private Key";
    case "p12":
      return "PKCS#12 Bundle (.p12)";
    case "pfx":
      return "PFX Certificate (.pfx)";
    case "pem":
      return "PEM Certificate";
    case "csr":
      return "Certificate Signing Request";
    case "chain":
      return "Certificate Chain";
    case "fullchain":
      return "Full Certificate Chain";
    case "p7b":
      return "PKCS#7 Certificate (.p7b)";
    case "der":
      return "DER Certificate";
    default:
      return fileType.toUpperCase();
  }
}

/**
 * Load certificate domains into the domains tab
 * @param {Object} certificate - Certificate object
 */
function loadCertificateDomains(certificate) {
  Logger.debug(`Loading domain list for certificate: ${certificate.name}`);

  const container = document.getElementById("domains-table-body");
  if (!container) {
    Logger.error("Domains table body container not found");
    return;
  }

  const domains = certificate.domains || [];

  if (domains.length === 0) {
    Logger.warn(`No domains configured for certificate: ${certificate.name}`);
    container.innerHTML = `<tr><td colspan="3" class="empty-cell">No domains configured.</td></tr>`;
    return;
  }

  Logger.debug(
    `Found ${domains.length} domains for certificate: ${certificate.name}`
  );

  let html = "";
  domains.forEach((domain, index) => {
    // Determine if domain is an IP address
    const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(domain);
    const domainType = isIP ? "IP Address" : "DNS";

    html += `
          <tr>
            <td>${UIUtils.escapeHTML(domain)}</td>
            <td>${domainType}</td>
            <td>
              <button class="button small danger remove-domain-btn" data-index="${index}">
                Remove
              </button>
            </td>
          </tr>
        `;
  });

  container.innerHTML = html;

  // Add event listeners for remove buttons
  container.querySelectorAll(".remove-domain-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const index = parseInt(this.getAttribute("data-index"), 10);
      const domain = domains[index];
      Logger.debug(`Removing domain at index ${index}: ${domain}`);
      removeCertificateDomain(certificate.fingerprint, index);
    });
  });

  Logger.info(`Domains loaded for certificate: ${certificate.name}`);
}

/**
 * Add a new domain to the certificate
 * @param {boolean} renewAfterAdd - Whether to renew the certificate after adding the domain
 */
async function addCertificateDomain(renewAfterAdd) {
  const fingerprint = document
    .getElementById("cert-details-modal")
    .getAttribute("data-cert-id");
  const domainValue = document.getElementById("domain-value").value.trim();

  if (!domainValue) {
    UIUtils.showToast("Please enter a domain or IP address", "warning");
    return;
  }

  try {
    // Automatically determine if it's an IP or domain
    const isIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(domainValue);
    const domainType = isIP ? "ip" : "dns";

    // Validate based on detected type
    if (!isIP && !DomainValidator.isValid(domainValue)) {
      UIUtils.showToast("Invalid domain name format", "error");
      return;
    } else if (isIP && !IPValidator.isValid(domainValue)) {
      UIUtils.showToast("Invalid IP address format", "error");
      return;
    }

    // Show loading
    UIUtils.showToast("Adding domain...", "info");

    // Send API request to add domain
    const response = await fetch(`/api/certificates/${fingerprint}/domains`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        domain: domainValue,
        type: domainType,
        renew: renewAfterAdd,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to add domain: ${errorText}`);
    }

    // Clear input
    document.getElementById("domain-value").value = "";

    // If renewing, show a different message
    if (renewAfterAdd) {
      UIUtils.showToast(
        "Domain added and certificate renewal started",
        "success"
      );
    } else {
      UIUtils.showToast("Domain added successfully", "success");

      // Reload domains list
      const certificate = await fetchCertificateDetails(fingerprint);
      loadCertificateDomains(certificate);
    }
  } catch (error) {
    UIUtils.showError(`Failed to add domain: ${error.message}`);
  }
}

/**
 * Remove a domain from certificate
 * @param {string} fingerprint - Certificate fingerprint
 * @param {number} index - Domain index to remove
 */
async function removeCertificateDomain(fingerprint, index) {
  try {
    // Show confirmation dialog
    UIUtils.confirm(
      "Remove Domain",
      "Are you sure you want to remove this domain? This will require renewing the certificate to take effect.",
      async () => {
        try {
          // Send API request to remove domain
          const response = await fetch(
            `/api/certificates/${fingerprint}/domains/${index}`,
            {
              method: "DELETE",
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to remove domain: ${errorText}`);
          }

          // Show success message
          UIUtils.showToast("Domain removed successfully", "success");

          // Reload domains list
          const certificate = await fetchCertificateDetails(fingerprint);
          loadCertificateDomains(certificate);
        } catch (error) {
          UIUtils.showError(`Failed to remove domain: ${error.message}`);
        }
      }
    );
  } catch (error) {
    UIUtils.showError(`Error: ${error.message}`);
  }
}

/**
 * Load deployment actions for the certificate
 * @param {string|Object} fingerprint - Certificate fingerprint or certificate object
 */
function loadDeploymentActions(fingerprint) {
  // Handle case where a full certificate object is passed
  if (typeof fingerprint === "object" && fingerprint !== null) {
    fingerprint = fingerprint.fingerprint;
  }

  // Ensure fingerprint is valid
  if (!fingerprint) {
    console.error("Invalid fingerprint provided to loadDeploymentActions");
    return;
  }

  // Redirect to the function in deploy-actions.js
  if (typeof loadCertificateDeploymentActions === "function") {
    // Call the function from deploy-actions.js
    loadCertificateDeploymentActions(fingerprint);
  } else {
    console.error("loadCertificateDeploymentActions function not found");
  }
}

/**
 * Save certificate settings
 */
async function saveCertificateSettings() {
  const fingerprint = document
    .getElementById("cert-details-modal")
    .getAttribute("data-cert-id");

  if (!fingerprint) {
    UIUtils.showToast("Certificate ID is missing", "error");
    return;
  }

  try {
    // Collect settings data
    const settings = {
      autoRenew: document.getElementById("cert-auto-renew").checked,
      validity: parseInt(document.getElementById("cert-validity").value, 10),
      renewBefore: parseInt(
        document.getElementById("cert-renew-before").value,
        10
      ),
      keySize: parseInt(document.getElementById("cert-key-size").value, 10),
    };

    // Validate settings
    if (
      isNaN(settings.validity) ||
      settings.validity < 1 ||
      settings.validity > 825
    ) {
      UIUtils.showToast("Validity must be between 1 and 825 days", "warning");
      return;
    }

    if (
      isNaN(settings.renewBefore) ||
      settings.renewBefore < 1 ||
      settings.renewBefore > 60
    ) {
      UIUtils.showToast(
        "Renew before must be between 1 and 60 days",
        "warning"
      );
      return;
    }

    // Send API request
    UIUtils.showToast("Saving certificate settings...", "info");

    const response = await fetch(`/api/certificates/${fingerprint}/settings`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to save settings: ${errorText}`);
    }

    UIUtils.showToast("Certificate settings saved successfully", "success");

    // Reload certificate details to reflect changes
    await loadCertificateDetails(fingerprint);
  } catch (error) {
    UIUtils.showError(`Failed to save settings: ${error.message}`);
  }
}

/**
 * Load certificate details from server
 * @param {string} fingerprint - Certificate fingerprint
 * @returns {Promise<Object>} - Certificate details
 */
async function loadCertificateDetails(fingerprint) {
  try {
    const response = await fetch(
      `/api/certificates/${encodeAPIFingerprint(fingerprint)}`
    );

    if (!response.ok) {
      throw new Error(`Failed to load certificate details: ${response.status}`);
    }

    const certificate = await response.json();

    // Update state
    state.currentCertificate = certificate;

    // Update UI with certificate details
    renderCertificateDetailsFromTemplate(
      certificate,
      document.querySelector("#cert-details-modal .modal-content")
    );

    return certificate;
  } catch (error) {
    console.error("Error loading certificate details:", error);
    UIUtils.showError(`Failed to load certificate details: ${error.message}`);
    throw error;
  }
}

/**
 * Load certificate backups
 * @param {string} fingerprint - Certificate fingerprint
 */
function loadCertificateBackups(fingerprint) {
  // Handle case where a full certificate object is passed
  if (typeof fingerprint === "object" && fingerprint !== null) {
    fingerprint = fingerprint.fingerprint;
  }

  // Ensure fingerprint is valid
  if (!fingerprint) {
    console.error("Invalid fingerprint provided to loadCertificateBackups");
    return;
  }

  const container = document.getElementById("cert-backups-list");
  if (!container) return;

  // Show loading indicator
  container.innerHTML = '<div class="loading-spinner small"></div>';

  // Fetch backups with proper encoding
  const encodedFingerprint = encodeAPIFingerprint(fingerprint);

  fetch(`/api/certificates/${encodedFingerprint}/backups`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load backups: ${response.status}`);
      }
      return response.json();
    })
    .then((backups) => {
      if (!backups || backups.length === 0) {
        container.innerHTML =
          '<p class="empty-message">No backups available.</p>';
        return;
      }

      // Create HTML for backups list using safeTemplate
      const backupsHtml = backups
        .map((backup) => {
          const date = new Date(backup.date);
          const formattedDate = DateUtils.formatDateTime(date);

          return UIUtils.safeTemplate(
            `
          <div class="backup-item">
            <div class="backup-info">
              <div class="backup-date">\${date|noEscape}</div>
              <div class="backup-size">\${size|noEscape}</div>
            </div>
            <div class="backup-actions">
              <button class="button small restore-backup-btn" data-id="\${id|attr}">Restore</button>
              <button class="button small download-backup-btn" data-id="\${id|attr}">Download</button>
              <button class="button small danger delete-backup-btn" data-id="\${id|attr}">Delete</button>
            </div>
          </div>
        `,
            {
              date: formattedDate,
              size: UIUtils.formatFileSize(backup.size),
              id: backup.id,
            }
          );
        })
        .join("");

      container.innerHTML = backupsHtml;

      // Add event listeners
      container.querySelectorAll(".restore-backup-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
          const backupId = this.getAttribute("data-id");
          restoreCertificateBackup(fingerprint, backupId);
        });
      });

      container.querySelectorAll(".download-backup-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
          const backupId = this.getAttribute("data-id");
          downloadCertificateBackup(fingerprint, backupId);
        });
      });

      container.querySelectorAll(".delete-backup-btn").forEach((btn) => {
        btn.addEventListener("click", function () {
          const backupId = this.getAttribute("data-id");
          deleteCertificateBackup(fingerprint, backupId);
        });
      });
    })
    .catch((error) => {
      console.error("Error loading backups:", error);
      container.innerHTML = UIUtils.safeTemplate(
        `
        <p class="error-message">Failed to load backups: \${errorMessage}</p>
      `,
        {
          errorMessage: UIUtils.sanitizeErrorMessage(error),
        }
      );
    });
}

/**
 * Create a certificate backup
 */
async function createCertificateBackup() {
  const fingerprint = document
    .getElementById("cert-details-modal")
    .getAttribute("data-cert-id");

  if (!fingerprint) {
    UIUtils.showToast("Certificate ID is missing", "error");
    return;
  }

  try {
    UIUtils.showToast("Creating backup...", "info");

    const response = await fetch(`/api/certificates/${fingerprint}/backups`, {
      method: "POST",
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create backup: ${errorText}`);
    }

    // Reload backups list
    loadCertificateBackups(fingerprint);

    UIUtils.showToast("Backup created successfully", "success");
  } catch (error) {
    UIUtils.showError(`Failed to create backup: ${error.message}`);
  }
}

/**
 * Helper function to fetch certificate details
 * @param {string} fingerprint - Certificate fingerprint
 * @returns {Promise<Object>} - Certificate details object
 */
async function fetchCertificateDetails(fingerprint) {
  const response = await fetch(`/api/certificates/${fingerprint}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch certificate details: ${response.status}`);
  }

  return await response.json();
}

/**
 * Convert certificate to different format
 */
async function convertCertificateFormat() {
  const fingerprint = document
    .getElementById("cert-details-modal")
    .getAttribute("data-cert-id");
  const format = document.getElementById("convert-format").value;
  const password = document.getElementById("convert-password")?.value;

  if (!fingerprint || !format) {
    UIUtils.showToast("Please select a target format", "warning");
    return;
  }

  // Check if password is required for this format
  const needsPassword = ["p12", "pfx"].includes(format);
  if (needsPassword && !password) {
    UIUtils.showToast("Password is required for this format", "warning");
    return;
  }

  try {
    UIUtils.showToast("Converting certificate...", "info");

    const requestBody = { format };
    if (needsPassword && password) {
      requestBody.password = password;
    }

    const response = await fetch(`/api/certificates/${fingerprint}/convert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to convert certificate: ${errorText}`);
    }

    const result = await response.json();

    if (result.success) {
      // Reload files list
      const certificate = await fetchCertificateDetails(fingerprint);
      loadCertificateFiles(certificate);

      // Clear convert form
      document.getElementById("convert-format").value = "";
      if (document.getElementById("convert-password")) {
        document.getElementById("convert-password").value = "";
      }
      document.getElementById("convert-password-group").classList.add("hidden");
      document.getElementById("convert-cert-btn").disabled = true;

      UIUtils.showToast(
        `Certificate converted to ${format.toUpperCase()} format`,
        "success"
      );
    } else {
      UIUtils.showToast(`Failed to convert: ${result.message}`, "error");
    }
  } catch (error) {
    UIUtils.showError(`Failed to convert certificate: ${error.message}`);
  }
}

/**
 * Download certificate file
 * @param {string} fingerprint - Certificate fingerprint
 * @param {string} fileType - File type (cert, key, ca)
 */
async function downloadCertificateFile(fingerprint, fileType) {
  try {
    const response = await fetch(
      `/api/certificates/${fingerprint}/download/${fileType}`
    );

    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    // Get filename from content-disposition header or use a default
    let filename = `certificate-${fileType}.pem`;
    const contentDisposition = response.headers.get("content-disposition");
    if (contentDisposition) {
      const match = contentDisposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }

    // Convert response to blob and download
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    // Clean up
    URL.revokeObjectURL(url);
    document.body.removeChild(a);

    UIUtils.showToast(`Downloaded ${fileType} file successfully`, "success");
  } catch (error) {
    UIUtils.showError(`Failed to download ${fileType} file: ${error.message}`);
    Logger.error(`Error downloading certificate ${fileType}`, error);
  }
}

/**
 * Load certificate files
 * @param {Object} certificate - Certificate object
 */
function loadCertificateFiles(certificate) {
  Logger.debug(`Loading certificate files for: ${certificate.name}`);
  
  const container = document.getElementById("cert-files-list");
  if (!container) {
    Logger.error("Certificate files container not found");
    return;
  }
  
  // Get certificate fingerprint for API call
  const fingerprint = certificate.fingerprint;
  if (!fingerprint) {
    Logger.error("Certificate fingerprint is missing");
    container.innerHTML = '<p class="error-message">Certificate ID is missing</p>';
    return;
  }
  
  // Show loading state
  container.innerHTML = '<div class="loading-spinner small"></div>';
  
  // Fetch files from the API endpoint directly
  const encodedFingerprint = encodeAPIFingerprint(fingerprint);
  fetch(`/api/certificates/${encodedFingerprint}/files`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch certificate files: ${response.status}`);
      }
      return response.json();
    })
    .then(files => {
      Logger.debug(`Received ${files.length} certificate files`);
      
      if (files.length === 0) {
        container.innerHTML = '<p class="empty-message">No certificate files available.</p>';
        return;
      }
      
      // Map file types to display names
      const fileTypeDisplayNames = {
        'crt': 'Certificate',
        'key': 'Private Key',
        'pem': 'PEM Certificate',
        'p12': 'PKCS#12 Bundle',
        'pfx': 'PFX Certificate',
        'csr': 'Certificate Signing Request',
        'ext': 'Extensions',
        'der': 'DER Certificate',
        'p7b': 'PKCS#7 Certificate',
        'chain': 'Certificate Chain',
        'fullchain': 'Full Certificate Chain',
        'cer': 'X.509 Certificate'
      };
      
      // Create table rows
      const rows = files.map(file => {
        const displayName = fileTypeDisplayNames[file.type] || `${file.type.toUpperCase()} File`;
        
        return UIUtils.safeTemplate(`
          <tr>
            <td>${displayName}</td>
            <td><code>${file.path}</code></td>
            <td>${UIUtils.formatFileSize(file.size)}</td>
            <td>
              <button class="button small download-file-btn" data-type="${file.type}" data-fingerprint="${fingerprint}">
                Download
              </button>
            </td>
          </tr>
        `, {});
      }).join('');
      
      // Render the table with download all button
      container.innerHTML = UIUtils.safeTemplate(`
        <table class="cert-files-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Path</th>
              <th>Size</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div class="file-actions">
          <button id="download-all-files-btn" class="button">Download All Files</button>
        </div>
      `, {});
      
      // Add event listeners to the download buttons
      document.querySelectorAll('.download-file-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const fileType = this.getAttribute('data-type');
          const certFingerprint = this.getAttribute('data-fingerprint');
          Logger.debug(`Downloading certificate file: ${fileType}`);
          downloadCertificateFile(certFingerprint, fileType);
        });
      });
      
      // Add event listener to download all button
      document.getElementById('download-all-files-btn')?.addEventListener('click', () => {
        Logger.debug(`Downloading all certificate files for: ${certificate.name}`);
        downloadAllCertificateFiles(certificate);
      });
      
      Logger.info(`Certificate files loaded for: ${certificate.name}`);
    })
    .catch(error => {
      Logger.error(`Error loading certificate files: ${error.message}`, error);
      container.innerHTML = `<p class="error-message">Error loading files: ${UIUtils.sanitizeErrorMessage(error)}</p>`;
    });
}

/**
 * Update certificate action buttons based on certificate state
 * @param {Object} certificate - Certificate object
 */
function updateCertificateActionButtons(certificate) {
  const renewBtn = document.getElementById("renew-cert-btn");

  // Update renew button
  if (certificate.status === "expired" || certificate.status === "expiring") {
    renewBtn.disabled = false;
    renewBtn.classList.add("accent");
  } else {
    renewBtn.disabled = false;
    renewBtn.classList.remove("accent");
  }
}

/**
 * Hide the certificate details modal
 */
function hideCertificateDetailsModal() {
  const modal = document.getElementById("cert-details-modal");
  if (modal) {
    modal.classList.remove("visible");
    modal.classList.add("hidden");
    document.getElementById("modal-backdrop").classList.add("hidden");
    state.currentCertificate = null;
  }
}

/**
 * Filter certificates based on search and status filters
 */
function filterCertificates() {
  const searchFilter = document
    .getElementById("cert-search")
    .value.toLowerCase();
  const showValid = document.getElementById("filter-valid").checked;
  const showExpiring = document.getElementById("filter-expiring").checked;
  const showExpired = document.getElementById("filter-expired").checked;

  renderCertificatesListDetailed(state.certificates);
}

/**
 * Confirm certificate deletion
 */
function confirmDeleteCertificate() {
  if (!state.currentCertificate) {
    UIUtils.showError("No certificate selected");
    return;
  }

  if (
    confirm(
      `Are you sure you want to delete certificate "${state.currentCertificate.name}"?`
    )
  ) {
    deleteCertificate(state.currentCertificate.fingerprint);
  }
}

/**
 * Delete a certificate
 * @param {string} certId - Certificate fingerprint
 */
async function deleteCertificate(certId) {
  Logger.debug(`Attempting to delete certificate: ${certId}`);

  try {
    const response = await fetch(`/api/certificates/${certId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const errorText = await response.text();
      Logger.error(`Failed to delete certificate: ${errorText}`);
      throw new Error(`Failed to delete certificate: ${errorText}`);
    }

    Logger.info(`Certificate deleted successfully: ${certId}`);

    // Hide the modal
    hideCertificateDetailsModal();

    // Reload certificates
    await loadCertificates();

    UIUtils.showNotification("Certificate deleted successfully", "success");
  } catch (error) {
    Logger.error(`Error deleting certificate: ${error.message}`, error);
    UIUtils.showError(error.message);
  }
}

/**
 * Renew the currently selected certificate
 */
function renewSelectedCertificate() {
  if (!state.currentCertificate) {
    UIUtils.showError("No certificate selected");
    return;
  }

  renewCertificate(state.currentCertificate.fingerprint);
}

/**
 * Renew a certificate
 * @param {string} certId - Certificate fingerprint
 */
async function renewCertificate(certId) {
  Logger.debug(`Starting certificate renewal for: ${certId}`);

  try {
    if (!certId) {
      Logger.error("Certificate ID is required for renewal");
      throw new Error("Certificate ID is required");
    }

    UIUtils.showNotification("Renewing certificate...", "info");

    // Properly encode the fingerprint
    const encodedId = encodeAPIFingerprint(certId);

    Logger.debug(`Sending renewal request for certificate: ${encodedId}`);
    const response = await fetch(`/api/certificates/${encodedId}/renew`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      // Try to get a structured error message
      let errorMessage;
      try {
        const errorData = await response.json();
        errorMessage = errorData.message || `HTTP error: ${response.status}`;
      } catch (parseError) {
        errorMessage =
          (await response.text()) || `HTTP error: ${response.status}`;
      }
      Logger.error(`Certificate renewal failed: ${errorMessage}`);
      throw new Error(`Failed to renew certificate: ${errorMessage}`);
    }

    const result = await response.json();
    Logger.info(`Certificate renewal process started for: ${certId}`);

    // Reload certificates
    await loadCertificates();

    // If details modal is open, reload it
    if (
      state.currentCertificate &&
      state.currentCertificate.fingerprint === certId
    ) {
      await loadCertificateDetails(certId);
    }

    UIUtils.showNotification(
      "Certificate renewal process started. Check logs for progress.",
      "success"
    );
  } catch (error) {
    Logger.error(`Error renewing certificate: ${error.message}`, error);
    UIUtils.showError(`Failed to renew certificate: ${error.message}`);
  }
}

/**
 * Download all certificate files as a ZIP archive
 * @param {string} fingerprint - Certificate fingerprint
 */
function downloadCertificateZip(fingerprint) {
  try {
    // Display loading toast
    UIUtils.showToast("Preparing download...", "info");

    // Create a download link
    const a = document.createElement("a");
    a.href = `/api/certificates/${fingerprint}/download`;
    a.download = ""; // Let the server set the filename

    // Append, click, and remove
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Show success after a short delay
    setTimeout(() => {
      UIUtils.showToast("Certificate files downloaded successfully", "success");
    }, 1000);
  } catch (error) {
    UIUtils.showError(`Failed to download certificate files: ${error.message}`);
    console.error("Error downloading certificate ZIP:", error);
  }
}

/**
 * Download certificate file
 * @param {string} fingerprint - Certificate fingerprint
 * @param {string} fileType - File type (cert, key, chain, fullchain, etc.)
 */
async function downloadCertificateFile(fingerprint, fileType) {
  try {
    // Display loading toast
    UIUtils.showToast(`Downloading ${fileType} file...`, "info");

    // Create a download link with properly encoded fingerprint
    const a = document.createElement("a");
    a.href = `/api/certificates/${encodeAPIFingerprint(
      fingerprint
    )}/download/${fileType}`;
    a.download = ""; // Let the server set the filename

    // Append, click, and remove
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Show success after a short delay
    setTimeout(() => {
      UIUtils.showToast(`Downloaded ${fileType} file successfully`, "success");
    }, 1000);
  } catch (error) {
    UIUtils.showError(`Failed to download ${fileType} file: ${error.message}`);
    console.error(`Error downloading certificate ${fileType}:`, error);
  }
}

/**
 * Render detailed certificates list in the certificates tab
 * @param {Array} certificates - List of certificates to display
 */
function renderCertificatesListDetailed(certificates) {
  const container = document.getElementById("certificates-list");

  if (!certificates || certificates.length === 0) {
    container.innerHTML = UIUtils.safeTemplate(
      `
      <div class="empty-state">
        <p>No certificates found</p>
        <button id="create-cert-btn" class="button primary">Create Your First Certificate</button>
      </div>
    `,
      {}
    );

    // Add event listener
    document
      .getElementById("create-cert-btn")
      ?.addEventListener("click", showCreateCertificateModal);
    return;
  }

  // Generate list items HTML
  const listItems = certificates
    .map((cert) => {
      // Calculate status classes
      let statusClass = "status-unknown";
      let statusText = "Unknown";

      if (cert.isExpired) {
        statusClass = "status-expired";
        statusText = "Expired";
      } else if (cert.isExpiringSoon) {
        statusClass = "status-warning";
        statusText = "Expiring Soon";
      } else {
        statusClass = "status-valid";
        statusText = "Valid";
      }

      // Format expiry date
      const expiryDate = cert.validTo
        ? DateUtils.formatDate(cert.validTo)
        : "Unknown";

      // Get primary domain
      const domain =
        cert.domains && cert.domains.length > 0 ? cert.domains[0] : cert.name;

      return UIUtils.safeTemplate(
        `
      <div class="cert-item" data-cert-id="\${fingerprint|attr}">
        <div class="cert-header">
          <h3 class="cert-name">\${name}</h3>
          <span class="cert-status \${statusClass|noEscape}">\${statusText}</span>
        </div>
        <div class="cert-details">
          <p class="cert-domain">\${domain}</p>
          <p class="cert-expiry">Expires: \${expiryDate|noEscape}</p>
          <div class="cert-actions">
            <button class="button view-cert-btn" data-cert-id="\${fingerprint|attr}">View</button>
            <button class="button primary renew-cert-btn" data-cert-id="\${fingerprint|attr}">Renew</button>
          </div>
        </div>
      </div>
    `,
        {
          name: cert.name,
          statusClass: statusClass,
          statusText: statusText,
          domain: domain,
          expiryDate: expiryDate,
          fingerprint: cert.fingerprint,
        }
      );
    })
    .join("");

  container.innerHTML = listItems;

  // Add event listeners
  document.querySelectorAll(".view-cert-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const certId = this.getAttribute("data-cert-id");
      showCertificateDetails(certId);
    });
  });

  document.querySelectorAll(".renew-cert-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const certId = this.getAttribute("data-cert-id");
      renewCertificate(certId);
    });
  });
}

/**
 * Show certificate download options
 * @param {Object} certificate - Certificate object
 */
function showCertificateDownloadOptions(certificate) {
  Logger.debug(`Showing download options for certificate: ${certificate.name}`);
  
  // Create modal element
  const modal = document.createElement("div");
  modal.className = "download-options-modal";
  
  // Show loading state initially
  modal.innerHTML = `
    <div class="download-options-content">
      <h3>Download Certificate Files</h3>
      <div class="loading-spinner small"></div>
    </div>
  `;
  
  // Add to document
  document.body.appendChild(modal);
  
  // Get certificate fingerprint
  const fingerprint = certificate.fingerprint;
  if (!fingerprint) {
    modal.innerHTML = `
      <div class="download-options-content">
        <h3>Error</h3>
        <p>Certificate ID is missing</p>
        <div class="download-options-actions">
          <button class="button" id="close-download-options">Close</button>
        </div>
      </div>
    `;
    document.getElementById("close-download-options").addEventListener("click", () => {
      document.body.removeChild(modal);
    });
    return;
  }
  
  // Fetch files from the API endpoint
  const encodedFingerprint = encodeAPIFingerprint(fingerprint);
  fetch(`/api/certificates/${encodedFingerprint}/files`)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch certificate files: ${response.status}`);
      }
      return response.json();
    })
    .then(files => {
      Logger.debug(`Received ${files.length} certificate files for download options`);
      
      // Map file types to display names
      const fileTypeDisplayNames = {
        'crt': 'Certificate (.crt)',
        'key': 'Private Key (.key)',
        'pem': 'PEM Certificate (.pem)',
        'p12': 'PKCS#12 Bundle (.p12)',
        'pfx': 'PFX Certificate (.pfx)',
        'csr': 'Certificate Signing Request (.csr)',
        'ext': 'Extensions File (.ext)',
        'der': 'DER Certificate (.der)',
        'p7b': 'PKCS#7 Certificate (.p7b)',
        'chain': 'Certificate Chain (.pem)',
        'fullchain': 'Full Certificate Chain (.pem)',
        'cer': 'X.509 Certificate (.cer)'
      };
      
      // Build download options HTML
      let optionsHtml = "";
      files.forEach(file => {
        const displayName = fileTypeDisplayNames[file.type] || `${file.type.toUpperCase()} File`;
        const fileSize = UIUtils.formatFileSize(file.size);
        
        optionsHtml += UIUtils.safeTemplate(`
          <div class="download-option">
            <div class="download-option-info">
              <span class="download-option-name">${displayName}</span>
              <span class="download-option-size">${fileSize}</span>
            </div>
            <button class="button small download-option-btn" data-type="${file.type}">Download</button>
          </div>
        `, {});
      });
      
      // Always add "All Files" option
      optionsHtml += `
        <div class="download-option highlight">
          <div class="download-option-info">
            <span class="download-option-name">All Files (ZIP)</span>
          </div>
          <button class="button small primary download-option-btn" data-type="all">Download</button>
        </div>
      `;
      
      // Update modal content
      modal.innerHTML = UIUtils.safeTemplate(`
        <div class="download-options-content">
          <h3>Download Certificate Files</h3>
          <div class="download-options-list">
            ${optionsHtml}
          </div>
          <div class="download-options-actions">
            <button class="button" id="close-download-options">Close</button>
          </div>
        </div>
      `, {});
      
      // Add event listeners
      modal.querySelectorAll(".download-option-btn").forEach(btn => {
        btn.addEventListener("click", function() {
          const type = this.getAttribute("data-type");
          
          if (type === "all") {
            downloadAllCertificateFiles(certificate);
          } else {
            downloadCertificateFile(fingerprint, type);
          }
          
          // Close modal after download starts
          document.body.removeChild(modal);
        });
      });
      
      // Close button
      document.getElementById("close-download-options").addEventListener("click", () => {
        document.body.removeChild(modal);
      });
      
      // Close when clicking outside
      modal.addEventListener("click", event => {
        if (event.target === modal) {
          document.body.removeChild(modal);
        }
      });
    })
    .catch(error => {
      Logger.error(`Error loading download options: ${error.message}`, error);
      
      // Show error in modal
      modal.innerHTML = UIUtils.safeTemplate(`
        <div class="download-options-content">
          <h3>Error</h3>
          <p>Failed to load certificate files: ${UIUtils.sanitizeErrorMessage(error)}</p>
          <div class="download-options-actions">
            <button class="button" id="close-download-options">Close</button>
          </div>
        </div>
      `, {});
      
      document.getElementById("close-download-options").addEventListener("click", () => {
        document.body.removeChild(modal);
      });
    });
  
  // Add CSS for the modal (same as before)
  const style = document.createElement("style");
  style.textContent = `
    .download-options-modal {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1100;
    }
    
    .download-options-content {
      background: white;
      border-radius: 8px;
      padding: 20px;
      width: 80%;
      max-width: 500px;
    }
    
    .download-option {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid #eee;
    }
    
    .download-option-info {
      display: flex;
      flex-direction: column;
    }
    
    .download-option-size {
      font-size: 0.85em;
      color: #666;
    }
    
    .download-option.highlight {
      background-color: #f5f5f5;
      padding: 12px 10px;
      border-radius: 6px;
      margin-top: 15px;
    }
    
    .download-options-actions {
      margin-top: 20px;
      text-align: right;
    }
  `;
  document.head.appendChild(style);
}

// Export functions for global scope
window.confirmDeleteCertificate = confirmDeleteCertificate;
window.deleteCertificate = deleteCertificate;
window.filterCertificates = filterCertificates;
window.renderCertificatesListDetailed = renderCertificatesListDetailed;
window.renewCertificate = renewCertificate;
window.showCreateCertificateModal = showCreateCertificateModal;
window.showCreateCAModal = showCreateCAModal;
window.showCertificateDetails = showCertificateDetails;
window.setupCertificateActions = setupCertificateActions;
