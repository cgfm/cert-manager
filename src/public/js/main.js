/**
 * Certificate Manager - Main JavaScript
 * Handles core functionality and initialization
 */

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Global state
const state = {
  certificates: [],
  caCertificates: [],
  activeTab: 'dashboard',
  settings: {},
  deployActions: {}
};

/**
 * Handle unauthorized responses
 */
async function handleUnauthorizedResponse(response) {
  if (response.status === 401) {
    Logger.debug('Session expired, redirecting to login');
    window.location.href = '/login';
    return true;
  }
  return false;
}

/**
 * Initialize the application
 */
function init() {
  checkAuthentication();
  setupTabNavigation();
  setupThemeToggle();

  // Load settings and persist view mode preferences
  loadSettings();
  // Initialize settings UI
  //if (window.setupSettingsUI) {
  //  setupSettingsUI();
  //}

  // Add event listener for certificate filter if present
  const certificateFilter = document.getElementById('certificate-filter');
  if (certificateFilter) {
    certificateFilter.addEventListener('input', () => {
      renderCertificatesList(state.certificates);
    });
  }

  // Load current tab data
  const activeTab = document.querySelector('.tab-content.active');
  if (activeTab) {
    loadTabData(activeTab.id);
  }

  initModals();

  setupCertificateActions();

  // Add logout functionality
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function () {
      fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin'
      })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            Logger.info('User logged out successfully');
            window.location.href = '/login';
          } else {
            Logger.error('Logout failed:', data.message);
          }
        })
        .catch(error => {
          Logger.error('Error during logout:', error);
        });
    });
  }

  // Update user name in header
  fetch('/api/auth/user')
    .then(response => response.json())
    .then(data => {
      if (data.success && data.user) {
        const userNameEl = document.getElementById('user-name');
        if (userNameEl) {
          userNameEl.textContent = data.user.name || data.user.username;
        }
      }
    })
    .catch(error => {
      Logger.error('Error fetching user info:', error);
    });

  Logger.info('Certificate Manager UI initialized');
}

// Ensure DOM is loaded before initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/**
 * Setup tab navigation
 */
function setupTabNavigation() {
  const navLinks = document.querySelectorAll('nav a[data-tab]');

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = link.getAttribute('data-tab');
      changeTab(tabId);
    });
  });

  // Handle URL hash changes
  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.substring(1);
    if (hash) {
      changeTab(hash);
    }
  });

  // Set initial tab from URL hash
  const initialHash = window.location.hash.substring(1);
  if (initialHash) {
    changeTab(initialHash);
  }
}

/**
 * Change the active tab
 * @param {string} tabId - ID of the tab to activate
 */
function changeTab(tabId) {
  // Skip if tab doesn't exist or is the same as current
  if (!document.getElementById(tabId) || state.activeTab === tabId) {
    return;
  }

  // Check if this is a settings subtab (contains a dash)
  if (tabId.includes('-settings')) {
    // If it's a settings subtab, ensure the main settings tab is active first
    if (state.activeTab !== 'settings') {
      changeTab('settings');
    }

    // Then activate the specific settings panel
    document.querySelectorAll('.settings-panel').forEach(panel => {
      panel.classList.remove('active');
    });
    document.getElementById(tabId)?.classList.add('active');

    // Update the settings sidebar navigation
    document.querySelectorAll('.settings-sidebar a').forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('data-panel') === tabId) {
        link.classList.add('active');
      }
    });

    return;
  }

  // Update state
  state.activeTab = tabId;

  // Update active tab in navigation
  document.querySelectorAll('nav a').forEach(link => {
    link.classList.remove('active');
  });

  const activeLink = document.querySelector(`nav a[data-tab="${tabId}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
  }

  // Show active tab content
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.remove('active');
  });
  document.getElementById(tabId).classList.add('active');

  // Update URL hash without triggering another hashchange event
  history.replaceState(null, null, `#${tabId}`);

  // Load data for the tab if needed
  loadTabData(tabId);
}

function loadActivityTab() {
  setupActivityUI();
}

/**
 * Load data for the active tab
 * @param {string} tabId - ID of the active tab
 */
async function loadTabData(tabId) {
  switch (tabId) {
    case 'dashboard':
      loadDashboard();
      break;
    case 'certificates':
      loadCertificates();
      break;
    case 'ca':
      loadCACertificates();
      break;
    case 'settings':
      // Setup settings UI when the settings tab is activated
      if (window.setupSettingsUI) {
        setupSettingsUI();
      }
      break;
    case 'logs':
      loadLogs();
      break;
    case 'activity':
      loadActivityTab();
      break;
  }
}

/**
 * Setup theme toggle functionality
 */
function setupThemeToggle() {
  const themeToggle = document.getElementById('theme-toggle');
  const storedTheme = localStorage.getItem('theme');

  // Apply stored theme or system preference
  if (storedTheme) {
    document.body.dataset.theme = storedTheme;
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.body.dataset.theme = 'dark';
  }

  // Toggle theme on button click
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.body.dataset.theme;
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.body.dataset.theme = newTheme;
    localStorage.setItem('theme', newTheme);

    Logger.debug(`Theme changed to ${newTheme} mode`);
  });
}

/**
 * Load dashboard data
 */
async function loadDashboard() {
  try {
    // Show loading states in each dashboard section
    const sections = [
      'cert-stats',
      'expiring-certs-list',
      'ca-list-summary',
      'recent-activity'
    ];

    sections.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
        container.innerHTML = UIUtils.safeTemplate(`
          <div class="loading">Loading...</div>
        `, {});
      } else {
        console.warn(`Dashboard section #${id} not found in DOM`);
      }
    });

    // Load data for certificates if needed
    if (!state.certificates || state.certificates.length === 0) {
      await loadAllCertificates();
    }

    // Load data for CA certificates if needed
    if (!state.caCertificates || state.caCertificates.length === 0) {
      await loadCACertificates(false); // false to avoid UI updates while loading
    }

    // Load and display recent activity
    await updateDashboardActivity();

    // Render dashboard sections with the loaded data
    renderDashboard();

    Logger.info('Dashboard loaded successfully');
  } catch (error) {
    Logger.error('Error loading dashboard:', error);

    // Display error in each section
    const errorMessage = UIUtils && UIUtils.sanitizeErrorMessage ? 
      UIUtils.sanitizeErrorMessage(error) : 
      (error.message || 'Unknown error');

    const sections = [
      'cert-stats',
      'expiring-certs-list',
      'ca-list-summary',
      'recent-activity'
    ];

    sections.forEach(id => {
      const container = document.getElementById(id);
      if (container) {
        container.innerHTML = `
          <div class="error-message">
            <p>Failed to load data: ${errorMessage}</p>
          </div>
        `;
      }
    });

    // Add a retry button to the main dashboard
    const dashboard = document.getElementById('dashboard');
    if (dashboard) {
      const retryButton = document.createElement('button');
      retryButton.className = 'button primary retry-dashboard-btn';
      retryButton.textContent = 'Retry Loading Dashboard';
      retryButton.addEventListener('click', loadDashboard);

      // Insert after the dashboard header
      const header = dashboard.querySelector('.dashboard-header');
      if (header && header.nextSibling) {
        dashboard.insertBefore(retryButton, header.nextSibling);
      } else {
        dashboard.appendChild(retryButton);
      }
    }

    Logger.error('Error loading dashboard', error);
  }
}

/**
 * Load certificates from API
 * @param {boolean} updateUI - Whether to update the UI
 */
async function loadCertificates() {
  const certificatesContainer = document.getElementById('certificates-list');

  try {
    // Show loading state
    certificatesContainer.innerHTML = '';
    certificatesContainer.appendChild(UIUtils.createLoadingState('Loading certificates...'));

    // Fetch certificates from API
    const response = await fetch('/api/certificates');

    // Check for unauthorized response first
    if (await handleUnauthorizedResponse(response)) {
      return;
    }

    if (!response.ok) {
      throw new Error(`Failed to load certificates: ${response.status}`);
    }

    // Parse the response JSON once
    const data = await response.json();

    // Check if still initializing
    if (data.initializing) {
      // Show a loading message in the UI
      showLoadingState("Certificate manager is still initializing...");

      // Try again in a few seconds
      setTimeout(loadCertificates, 3000);
      return;
    }

    // Get certificates from response - handle both formats
    // (either data is the array itself or it has a certificates property)
    const certificates = Array.isArray(data) ? data :
      (data.certificates && Array.isArray(data.certificates)) ? data.certificates :
        [];

    // Update state
    state.certificates = certificates;

    // Clear loading state
    certificatesContainer.innerHTML = '';

    // Display empty state if no certificates
    if (!certificates || certificates.length === 0) {
      const emptyState = UIUtils.createEmptyState(
        'No Certificates Found',
        'You haven\'t created any certificates yet. Click the button below to get started.',
        '📜', // Or use a more specific icon
        'certificates',
        'Create Certificate',
        () => showCreateCertificateModal()
      );
      certificatesContainer.appendChild(emptyState);
      return;
    }

    // Create filter container if it doesn't exist
    let filterContainer = document.getElementById('certificate-filter-container');
    if (!filterContainer) {
      filterContainer = document.createElement('div');
      filterContainer.id = 'certificate-filter-container';
      filterContainer.className = 'filter-container';

      // Create filter input
      const filterInput = document.createElement('input');
      filterInput.type = 'text';
      filterInput.id = 'certificate-filter';
      filterInput.className = 'filter-input';
      filterInput.placeholder = 'Filter certificates...';
      filterInput.addEventListener('input', () => {
        renderCertificatesList(state.certificates);
      });

      // Create view mode button (will implement fully in next section)
      const viewModeButton = document.createElement('button');
      viewModeButton.id = 'view-mode-button';
      viewModeButton.className = 'view-mode-button';
      viewModeButton.innerHTML = '<i class="fas fa-th-large"></i>';
      viewModeButton.setAttribute('aria-label', 'Change view mode');
      viewModeButton.setAttribute('title', 'Change view mode');

      filterContainer.appendChild(filterInput);
      filterContainer.appendChild(viewModeButton);
      certificatesContainer.appendChild(filterContainer);
    }

    // Create container for certificate list
    const listElement = document.createElement('div');
    listElement.className = 'certificate-list';
    listElement.id = 'certificate-list-container';

    // Render certificates with current filter
    renderCertificatesList(certificates, listElement);

    certificatesContainer.appendChild(listElement);

    // Initialize view mode selector
    initViewModeSelector();

    // Update filter indicator
    updateViewModeFilterIndicator();
  } catch (error) {
    Logger.error('Error loading certificates:', error);

    // Show error state
    certificatesContainer.innerHTML = '';
    const errorState = UIUtils.createErrorState(
      'Failed to Load Certificates',
      UIUtils.sanitizeErrorMessage(error) || 'An error occurred while loading certificates.',
      () => loadCertificates() // Retry function
    );
    certificatesContainer.appendChild(errorState);
  }
}

/**
 * Load all certificates from API
 * This is a separate function from loadCertificates to avoid UI updates
 */
async function loadAllCertificates() {
  try {
    // Fetch certificates from API
    const response = await fetch('/api/certificates');

    // Check for unauthorized response
    if (await handleUnauthorizedResponse(response)) {
      return [];
    }

    if (!response.ok) {
      throw new Error(`Failed to load certificates: ${response.status}`);
    }

    // Parse once and handle different response formats
    const data = await response.json();

    // Check if still initializing
    if (data && data.initializing) {
      Logger.info('Certificate manager still initializing');
      return [];
    }

    // Get certificates from response - handle both formats
    const certificates = Array.isArray(data) ? data :
      (data && data.certificates && Array.isArray(data.certificates)) ? data.certificates :
        [];

    // Update state
    state.certificates = certificates;
    Logger.info(`Loaded ${certificates.length} certificates`);

    return certificates;
  } catch (error) {
    Logger.error('Error loading certificates data:', error);
    return []; // Return empty array on error
  }
}

/**
 * Render dashboard with all sections
 */
function renderDashboard() {
  renderCertificateStats();
  updateExpiringCerts();
  updateCASummary();
}

/**
 * Render certificate statistics
 */
function renderCertificateStats() {
  const certificates = state.certificates || [];

  // Ensure certificates is an array
  if (!Array.isArray(certificates)) {
    Logger.error('certificates is not an array:', certificates);
    return;
  }

  // Calculate statistics
  const total = certificates.length;
  const valid = certificates.filter(cert => !cert.isExpired && !cert.isExpiringSoon).length;
  const expiring = certificates.filter(cert => cert.isExpiringSoon && !cert.isExpired).length;
  const expired = certificates.filter(cert => cert.isExpired).length;

  const statsContainer = document.getElementById('cert-stats');
  if (!statsContainer) {
    Logger.warn('cert-stats container not found');
    return;
  }

  statsContainer.innerHTML = UIUtils.safeTemplate(`
    <div class="stats-card">
      <div class="stat-item">
        <span class="stat-value">\${total}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="stat-item valid">
        <span class="stat-value">\${valid}</span>
        <span class="stat-label">Valid</span>
      </div>
      <div class="stat-item warning">
        <span class="stat-value">\${expiring}</span>
        <span class="stat-label">Expiring</span>
      </div>
      <div class="stat-item danger">
        <span class="stat-value">\${expired}</span>
        <span class="stat-label">Expired</span>
      </div>
    </div>
  `, {
    // Ensure numbers are always displayed, even if 0
    total: total.toString(),
    valid: valid.toString(),
    expiring: expiring.toString(),
    expired: expired.toString()
  });
}

/**
 * Update expiring certificates on dashboard
 */
function updateExpiringCerts() {
  const container = document.getElementById('expiring-certs-list');
  const certificates = state.certificates || [];

  // Get expiring certificates (expiring soon but not expired yet)
  const expiringCerts = certificates.filter(cert =>
    cert.isExpiringSoon && !cert.isExpired);

  if (expiringCerts.length === 0) {
    container.innerHTML = UIUtils.safeTemplate(`
      <p class="good-message">No certificates expiring soon</p>
    `, {});
    return;
  }

  // Sort by expiry date (ascending)
  expiringCerts.sort((a, b) => {
    if (!a.validTo) return 1;
    if (!b.validTo) return -1;
    return new Date(a.validTo) - new Date(b.validTo);
  });

  // Generate HTML for each expiring certificate
  const certsHtml = expiringCerts.slice(0, 5).map(cert => {
    const daysUntilExpiry = cert.daysUntilExpiry ||
      Math.ceil((new Date(cert.validTo) - new Date()) / (1000 * 60 * 60 * 24));

    const domain = cert.domains && cert.domains.length > 0 ? cert.domains[0] : cert.name;

    return UIUtils.safeTemplate(`
      <div class="expiring-cert-item">
        <div class="expiring-cert-name">\${name}</div>
        <div class="expiring-days warning">Expires in \${days} days</div>
        <button class="button small renew-btn" data-cert-id="\${fingerprint|attr}">Renew</button>
      </div>
    `, {
      name: cert.name,
      domain: domain,
      days: daysUntilExpiry,
      fingerprint: cert.fingerprint
    });
  }).join('');

  container.innerHTML = certsHtml;

  // Add event listeners to renew buttons
  document.querySelectorAll('.renew-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const certId = this.getAttribute('data-cert-id');
      renewCertificate(certId);
    });
  });
}

/**
 * Initialize modal functionality
 */
function initModals() {
  // Set up modal close functionality
  document.querySelectorAll('.modal .close-modal, .modal .close-modal-btn').forEach(closeBtn => {
    closeBtn.addEventListener('click', () => {
      const modal = closeBtn.closest('.modal');
      if (modal) {
        modal.classList.remove('visible');
        modal.classList.add('hidden');
      }
    });
  });

  // Close modal when clicking outside content
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('visible');
        modal.classList.add('hidden');
      }
    });
  });

  // Certificate details functionality moved to cert-actions.js
}

/**
 * Update CA certificates summary
 */
function updateCASummary() {
  const container = document.getElementById('ca-list-summary');
  if (!container) return;

  const caCertificates = state.caCertificates || [];

  if (!caCertificates || caCertificates.length === 0) {
    container.innerHTML = UIUtils.safeTemplate(`
      <p class="empty-message">No CA certificates available</p>
      <button id="create-ca-btn" class="button">Create CA</button>
    `, {});

    // Add event listener to create CA button
    const createBtn = document.getElementById('dashboard-create-ca-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        changeTab('ca');
        setTimeout(() => {
          if (typeof showCreateCAModal === 'function') {
            showCreateCAModal();
          }
        }, 100);
      });
    }

    return;
  }

  // Generate HTML for top 3 CAs
  const caListHtml = caCertificates.slice(0, 3).map(ca => {
    let statusClass = 'status-unknown';
    let statusText = 'Unknown';

    if (ca.isExpired) {
      statusClass = 'status-expired';
      statusText = 'Expired';
    } else if (ca.isExpiringSoon) {
      statusClass = 'status-warning';
      statusText = 'Expiring Soon';
    } else {
      statusClass = 'status-valid';
      statusText = 'Valid';
    }

    return UIUtils.safeTemplate(`
      <div class="ca-summary-item">
        <span class="ca-name">\${name}</span>
        <span class="ca-status \${statusClass|noEscape}">\${statusText}</span>
      </div>
    `, {
      name: ca.name,
      statusClass: statusClass,
      statusText: statusText
    });
  }).join('');

  container.innerHTML = caListHtml + UIUtils.safeTemplate(`
    <a href="#ca" class="view-all-link">View all CA certificates</a>
  `, {});
}

/**
 * Load settings from API and apply to UI
 */
async function loadSettings() {
  try {
    const response = await fetch('/api/settings');

    // Check for unauthorized response
    if (await handleUnauthorizedResponse(response)) {
      return {};  // Return empty object if unauthorized
    }

    if (!response.ok) {
      throw new Error(`Failed to load settings: ${response.status}`);
    }

    const settings = await response.json();
    state.settings = settings;

    // Apply settings to UI (handled by settings-ui.js)
    if (window.applySettingsToUI) {
      applySettingsToUI(settings);
    }

    Logger.info('Settings loaded');
    return settings;
  } catch (error) {
    if (window.UIUtils && typeof UIUtils.showError === 'function') {
      UIUtils.showError('Failed to load settings', error);
    } else {
      Logger.error('Failed to load settings:', error);
    }
    return {};
  }
}

/**
 * Render certificates list with current filter and view mode
 * @param {Array} certificates - Array of certificate objects
 * @param {HTMLElement} container - Container element to append certificates to
 */
function renderCertificatesList(certificates, container = null) {
  // If container not provided, use the existing one
  if (!container) {
    container = document.getElementById('certificate-list-container');
    if (!container) return;

    // Clear existing content
    container.innerHTML = '';
  }

  // Get current view mode from localStorage or default to 'block'
  const viewMode = localStorage.getItem('certificateViewMode') || 'block';

  // Get current sort field and direction from localStorage
  const sortField = localStorage.getItem('certificateSortField') || 'name';
  const sortDirection = localStorage.getItem('certificateSortDirection') || 'asc';

  // Update container class based on view mode
  container.className = `certificate-list view-${viewMode}`;

  // Filter certificates by text
  const filter = document.getElementById('certificate-filter');
  const filterValue = filter ? filter.value.toLowerCase() : '';

  // Get status filters from localStorage
  const statusFilters = JSON.parse(localStorage.getItem('certificateStatusFilter') || '{"valid":true,"expiring":true,"expired":true}');

  const filteredCerts = certificates.filter(cert => {
    // Check status filter first
    const status = getStatusFromCertificate(cert);
    if (status === 'valid' && !statusFilters.valid) return false;
    if (status === 'expiring' && !statusFilters.expiring) return false;
    if (status === 'expired' && !statusFilters.expired) return false;

    // If no text filter, include certificate (if it passed status filter)
    if (!filterValue) return true;

    // Search in certificate name
    const name = (cert.name || '').toLowerCase();
    if (name.includes(filterValue)) return true;

    // Search in domains
    const domains = cert.domains || [];
    for (const domain of domains) {
      if (domain.toLowerCase().includes(filterValue)) return true;
    }

    // Search in group if available
    if (cert.group && cert.group.toLowerCase().includes(filterValue)) return true;

    // Not found in any searchable field
    return false;
  });

  // Sort certificates
  const sortedCerts = sortCertificates(filteredCerts, sortField, sortDirection);

  // Check if we have any certificates after filtering
  if (sortedCerts.length === 0) {
    container.innerHTML = `
            <div class="empty-filter-results">
                <p>No certificates match your filter criteria.</p>
                <button class="button" onclick="document.getElementById('certificate-filter').value=''; renderCertificatesList(state.certificates);">Clear Filter</button>
            </div>
        `;
    return;
  }

  // Render based on view mode
  switch (viewMode) {
    case 'list':
      renderListView(sortedCerts, container, sortField, sortDirection);
      break;
    case 'hierarchy':
      renderHierarchyView(sortedCerts, container);
      break;
    case 'block':
    default:
      renderBlockView(sortedCerts, container);
      break;
  }
}

/**
 * Sort certificates based on field and direction
 * @param {Array} certificates - Certificates to sort
 * @param {string} field - Field to sort by
 * @param {string} direction - Sort direction ('asc' or 'desc')
 * @returns {Array} - Sorted certificates
 */
function sortCertificates(certificates, field, direction) {
  return [...certificates].sort((a, b) => {
    let valueA, valueB;

    // Determine values to compare based on field
    switch (field) {
      case 'expires':
        valueA = new Date(a.validTo || 0).getTime();
        valueB = new Date(b.validTo || 0).getTime();
        break;
      case 'domain':
        valueA = (a.domains && a.domains.length > 0) ? a.domains[0].toLowerCase() : '';
        valueB = (b.domains && b.domains.length > 0) ? b.domains[0].toLowerCase() : '';
        break;
      case 'status':
        // Map status values to numeric values for sorting
        const statusMap = { valid: 1, expiring: 2, expired: 3, unknown: 4 };
        valueA = statusMap[getStatusFromCertificate(a)] || 4;
        valueB = statusMap[getStatusFromCertificate(b)] || 4;
        break;
      case 'group':
        valueA = (a.group || '').toLowerCase();
        valueB = (b.group || '').toLowerCase();
        break;
      case 'name':
      default:
        valueA = (a.name || '').toLowerCase();
        valueB = (b.name || '').toLowerCase();
        break;
    }

    // Compare values based on direction
    if (direction === 'desc') {
      return valueA > valueB ? -1 : valueA < valueB ? 1 : 0;
    } else {
      return valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
    }
  });
}

/**
 * Get status string from certificate object
 * @param {Object} cert - Certificate object
 * @returns {string} - Status string
 */
function getStatusFromCertificate(cert) {
  if (cert.isExpired) return 'expired';
  if (cert.isExpiringSoon) return 'expiring';
  return 'valid';
}
/**
 * Render certificates in block view
 * @param {Array} certificates - Array of certificate objects
 * @param {HTMLElement} container - Container element
 */
function renderBlockView(certificates, container) {
  certificates.forEach(cert => {
    Logger.debug('Rendering certificate:', cert);
    // Calculate status
    let status = 'valid';
    let statusClass = 'status-valid';

    if (cert.isExpired) {
      status = 'expired';
      statusClass = 'status-expired';
    } else if (cert.isExpiringSoon) {
      status = 'expiring';
      statusClass = 'status-warning';
    }

    const expiryDate = cert.validTo ? DateUtils.formatDate(cert.validTo) : 'N/A';

    // Use sans domain from the updated structure
    let domain = 'N/A';
    if (cert.sans && Array.isArray(cert.sans.domains) && cert.sans.domains.length > 0) {
      domain = cert.sans.domains[0];
    }

    // Create certificate item element
    const certItem = document.createElement('div');
    certItem.className = 'certificate-item';
    certItem.setAttribute('data-cert-id', UIUtils.escapeAttr(cert.fingerprint));

    // Create header
    const header = document.createElement('div');
    header.className = 'cert-header';

    const name = document.createElement('h3');
    name.className = 'cert-name';
    name.textContent = cert.name;

    const statusBadge = document.createElement('span');
    statusBadge.className = `cert-status ${statusClass}`;
    statusBadge.textContent = status;

    header.appendChild(name);
    header.appendChild(statusBadge);

    // Create details section
    const details = document.createElement('div');
    details.className = 'cert-details';

    const info = document.createElement('div');
    info.className = 'cert-info';

    const domainElem = document.createElement('p');
    domainElem.className = 'cert-domain';
    domainElem.textContent = domain;

    const expiryElem = document.createElement('p');
    expiryElem.className = 'cert-expiry';
    expiryElem.textContent = `Expires: ${expiryDate}`;

    if (cert.group) {
      const groupElem = document.createElement('p');
      groupElem.className = 'cert-group';
      groupElem.textContent = `Group: ${cert.group}`;
      info.appendChild(groupElem);
    }

    info.appendChild(domainElem);
    info.appendChild(expiryElem);

    const actions = document.createElement('div');
    actions.className = 'cert-actions';

    const viewBtn = document.createElement('button');
    viewBtn.className = 'button view-cert-btn';
    viewBtn.textContent = 'View';
    viewBtn.setAttribute('data-cert-id', UIUtils.escapeAttr(cert.fingerprint));

    actions.appendChild(viewBtn);

    details.appendChild(info);
    details.appendChild(actions);

    const footer = document.createElement('div');
    footer.className = 'cert-footer';

    // 1. Number of renews (calculated from previousVersions)
    const renewsCount = Array.isArray(cert.previousVersions) ? cert.previousVersions.length : 0;
    const renewsElem = document.createElement('div');
    renewsElem.className = 'cert-footer-item cert-renewals';
    renewsElem.title = 'Renewal History';
    renewsElem.innerHTML = `<i class="fas fa-history"></i> <span class="footer-count">${renewsCount}</span>`;
    renewsElem.addEventListener('click', () => {
      // Open certificate details modal with renew history tab active
      showCertificateDetails(cert.fingerprint, 'renew-history-tab');
    });
    footer.appendChild(renewsElem);

    // 2. Number of deploy Actions
    const deployCount = Array.isArray(cert.config.deployActions) ? cert.config.deployActions.length : 0;
    const deployElem = document.createElement('div');
    deployElem.className = 'cert-footer-item cert-deploy-actions';
    deployElem.title = 'Deployment Actions';
    deployElem.innerHTML = `<i class="fas fa-rocket"></i> <span class="footer-count">${deployCount}</span>`;
    deployElem.addEventListener('click', () => {
      // Open certificate details modal with deployment actions tab active
      showCertificateDetails(cert.fingerprint, 'deploy-actions-tab');
    });
    footer.appendChild(deployElem);

    // 3. Has passphrase 
    const hasPassphrase = cert.needsPassphrase || false;
    const passphraseElem = document.createElement('div');
    passphraseElem.className = 'cert-footer-item cert-passphrase';
    passphraseElem.title = hasPassphrase ? 'Protected with passphrase' : 'No passphrase protection';
    const passphraseIcon = document.createElement('i');
    passphraseIcon.className = hasPassphrase ? 'fas fa-lock security-icon secure' : 'fas fa-unlock security-icon insecure';
    passphraseElem.appendChild(passphraseIcon);
    passphraseElem.addEventListener('click', () => {
      // Open certificate details modal with management tab active (which contains passphrase settings)
      showCertificateDetails(cert.fingerprint, 'management-tab');
    });
    footer.appendChild(passphraseElem);

    // 4. Certificate type indicator
    const certTypeElem = document.createElement('div');
    certTypeElem.className = 'cert-footer-item cert-type';

    let certTypeIcon, certTypeTooltip;
    switch (cert.certType) {
      case 'rootCA':
        certTypeIcon = 'fas fa-certificate';
        certTypeTooltip = 'Root CA Certificate';
        break;
      case 'intermediateCA':
        certTypeIcon = 'fas fa-sitemap';
        certTypeTooltip = 'Intermediate CA Certificate';
        break;
      default:
        certTypeIcon = 'fas fa-id-card';
        certTypeTooltip = 'Standard Certificate';
    }

    certTypeElem.title = certTypeTooltip;
    const typeIcon = document.createElement('i');
    typeIcon.className = certTypeIcon;
    certTypeElem.appendChild(typeIcon);
    certTypeElem.addEventListener('click', () => {
      // Open certificate details modal with details tab active
      showCertificateDetails(cert.fingerprint, 'details-tab');
    });
    footer.appendChild(certTypeElem);

    // 5. Auto-renew indicator
    if (cert.config && cert.config.hasOwnProperty('autoRenew')) {
      const autoRenewElem = document.createElement('div');
      autoRenewElem.className = 'cert-footer-item cert-auto-renew';
      autoRenewElem.title = cert.config.autoRenew ? 'Auto-renewal enabled' : 'Auto-renewal disabled';

      const renewIcon = document.createElement('i');
      renewIcon.className = cert.config.autoRenew ? 'fas fa-sync-alt feature-icon enabled' : 'fas fa-sync-alt feature-icon disabled';
      autoRenewElem.appendChild(renewIcon);
      autoRenewElem.addEventListener('click', () => {
        // Open certificate details modal with renew settings tab active
        showCertificateDetails(cert.fingerprint, 'renew-settings-tab');
      });
      footer.appendChild(autoRenewElem);
    }

    // 6. Key strength indicator
    if (cert.keyLength) {
      const keyStrengthElem = document.createElement('div');
      keyStrengthElem.className = 'cert-footer-item cert-key-strength';

      let strengthClass = 'strength-unknown';
      let strengthTooltip = 'Unknown key strength';

      if (cert.keyLength >= 4096) {
        strengthClass = 'strength-high';
        strengthTooltip = `Strong key (${cert.keyLength} bits)`;
      } else if (cert.keyLength >= 2048) {
        strengthClass = 'strength-medium';
        strengthTooltip = `Medium key strength (${cert.keyLength} bits)`;
      } else if (cert.keyLength > 0) {
        strengthClass = 'strength-low';
        strengthTooltip = `Weak key (${cert.keyLength} bits)`;
      }

      keyStrengthElem.title = strengthTooltip;
      const strengthIcon = document.createElement('i');
      strengthIcon.className = `fas fa-shield-alt ${strengthClass}`;
      keyStrengthElem.appendChild(strengthIcon);
      keyStrengthElem.addEventListener('click', () => {
        // Open certificate details modal with details tab active
        showCertificateDetails(cert.fingerprint, 'details-tab');
      });
      footer.appendChild(keyStrengthElem);
    }

    // 7. Days until expiry counter (if not expired)
    if (!cert.isExpired) {
      const daysUntilExpiry = cert.daysUntilExpiry || Math.ceil((new Date(cert.validTo) - new Date()) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry !== undefined) {
        const expiryElem = document.createElement('div');
        expiryElem.className = 'cert-footer-item cert-days-expiry';
        expiryElem.title = `${daysUntilExpiry} days until expiry`;

        let expiryIconClass = 'fas fa-hourglass-half';
        let expiryCountClass = '';

        if (daysUntilExpiry <= 7) {
          expiryCountClass = 'expiry-critical';
        } else if (daysUntilExpiry <= 30) {
          expiryCountClass = 'expiry-warning';
        }

        expiryElem.innerHTML = `<i class="${expiryIconClass}"></i> <span class="footer-count ${expiryCountClass}">${daysUntilExpiry}</span>`;
        footer.appendChild(expiryElem);
      }
    }

    // Assemble certificate item
    certItem.appendChild(header);
    certItem.appendChild(details);
    certItem.appendChild(footer);

    // Add to container
    container.appendChild(certItem);

    // Add event listener
    viewBtn.addEventListener('click', () => {
      showCertificateDetails(cert.fingerprint);
    });
  });
}

/**
 * Render certificates in list view
 * @param {Array} certificates - Array of certificate objects
 * @param {HTMLElement} container - Container element
 * @param {string} sortField - Current sort field
 * @param {string} sortDirection - Current sort direction
 */
function renderListView(certificates, container, sortField, sortDirection) {
  const table = document.createElement('table');
  table.className = 'certificates-table';

  // Create table header
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');

  // Define columns
  const columns = [
    { id: 'name', label: 'Certificate Name' },
    { id: 'domain', label: 'Domain' },
    { id: 'status', label: 'Status' },
    { id: 'expires', label: 'Expires' },
    { id: 'group', label: 'Group' },
    { id: 'actions', label: 'Actions' }
  ];

  // Create header cells
  columns.forEach(column => {
    const th = document.createElement('th');

    // Skip sort for actions column
    if (column.id !== 'actions') {
      const sortBtn = document.createElement('button');
      sortBtn.className = 'sort-header';
      sortBtn.textContent = column.label;

      // Add sort indicator if this is the current sort field
      if (sortField === column.id) {
        const indicator = document.createElement('span');
        indicator.className = `sort-indicator ${sortDirection}`;
        indicator.innerHTML = sortDirection === 'asc' ? ' ↑' : ' ↓';
        sortBtn.appendChild(indicator);
      }

      // Add click handler for sorting
      sortBtn.addEventListener('click', () => {
        // Toggle direction if already sorting by this field
        const newDirection = sortField === column.id && sortDirection === 'asc' ? 'desc' : 'asc';

        // Save sort preferences
        localStorage.setItem('certificateSortField', column.id);
        localStorage.setItem('certificateSortDirection', newDirection);

        // Re-render with new sort
        renderCertificatesList(state.certificates);
      });

      th.appendChild(sortBtn);
    } else {
      th.textContent = column.label;
    }

    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create table body
  const tbody = document.createElement('tbody');

  certificates.forEach(cert => {
    const tr = document.createElement('tr');

    // Name cell
    const nameCell = document.createElement('td');
    nameCell.textContent = cert.name;
    tr.appendChild(nameCell);

    // Domain cell - Use sans structure to get domains
    const domainCell = document.createElement('td');
    domainCell.textContent = cert.sans?.domains && cert.sans.domains.length > 0 ?
      cert.sans.domains[0] : 'N/A';
    tr.appendChild(domainCell);

    // Status cell - THIS IS THE PART THAT NEEDS FIXING
    const statusCell = document.createElement('td');

    // Use isExpired and isExpiringSoon properties directly from the certificate
    let status = 'unknown';
    let statusClass = 'status-unknown';

    if (cert.isExpired) {
      status = 'expired';
      statusClass = 'status-expired';
    } else if (cert.isExpiringSoon) {
      status = 'expiring';
      statusClass = 'status-warning';
    } else {
      status = 'valid';
      statusClass = 'status-valid';
    }

    const statusBadge = document.createElement('span');
    statusBadge.className = `cert-status ${statusClass}`;
    statusBadge.textContent = status;
    statusCell.appendChild(statusBadge);
    tr.appendChild(statusCell);

    // Expiry cell
    const expiryCell = document.createElement('td');
    expiryCell.textContent = cert.validTo ? DateUtils.formatDate(cert.validTo) : 'N/A';
    tr.appendChild(expiryCell);

    // Group cell
    const groupCell = document.createElement('td');
    groupCell.textContent = cert.group || 'N/A';
    tr.appendChild(groupCell);

    // Actions cell
    const actionsCell = document.createElement('td');
    const viewBtn = document.createElement('button');
    viewBtn.className = 'button small view-cert-btn';
    viewBtn.textContent = 'View';
    viewBtn.setAttribute('data-cert-id', cert.fingerprint);
    viewBtn.addEventListener('click', () => showCertificateDetails(cert.fingerprint));
    actionsCell.appendChild(viewBtn);
    tr.appendChild(actionsCell);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

/**
 * Render certificates in hierarchy view
 * @param {Array} certificates - Array of certificate objects
 * @param {HTMLElement} container - Container element
 */
function renderHierarchyView(certificates, container) {
  // Group certificates by root CA and then by group
  const hierarchyGroups = {};

  // First, identify all CA certificates
  const caCertificates = certificates.filter(cert => cert.certType === 'rootCA' || cert.certType === 'intermediateCA');

  // Create a map of CA fingerprints to names for easy lookup
  const caMap = {};
  caCertificates.forEach(ca => {
    caMap[ca.fingerprint] = ca.name || 'Unnamed CA';
  });

  // Group certificates by their signing CA
  certificates.forEach(cert => {
    // Determine the root CA
    let rootCA = 'Unknown CA';

    if (cert.certType === 'rootCA') {
      // This is a root CA itself
      rootCA = cert.name || 'Root CA';
    } else if (cert.signWithCA && cert.caFingerprint && caMap[cert.caFingerprint]) {
      // This is signed by a CA we know
      rootCA = caMap[cert.caFingerprint];
    } else if (cert.issuer) {
      // Try to extract CA name from issuer
      const cnMatch = cert.issuer.match(/CN\s*=\s*([^,/]+)/i);
      if (cnMatch) {
        rootCA = cnMatch[1].trim();
      }
    }

    // Determine group (use certificate group or "Ungrouped")
    const group = cert.group || 'Ungrouped';

    // Create root CA group if it doesn't exist
    if (!hierarchyGroups[rootCA]) {
      hierarchyGroups[rootCA] = {};
    }

    // Create group within root CA if it doesn't exist
    if (!hierarchyGroups[rootCA][group]) {
      hierarchyGroups[rootCA][group] = [];
    }

    // Add certificate to group
    hierarchyGroups[rootCA][group].push(cert);
  });

  // Render hierarchy
  Object.keys(hierarchyGroups).sort().forEach(rootCA => {
    // Create root CA section
    const caSection = document.createElement('div');
    caSection.className = 'hierarchy-ca-section';

    // Create CA header
    const caHeader = document.createElement('div');
    caHeader.className = 'hierarchy-ca-header';
    caHeader.innerHTML = `<h3>${UIUtils.escapeHTML(rootCA)}</h3>`;
    caSection.appendChild(caHeader);

    // Create groups for this CA
    const groups = hierarchyGroups[rootCA];
    Object.keys(groups).sort().forEach(groupName => {
      const certs = groups[groupName];

      // Create group section
      const groupSection = document.createElement('div');
      groupSection.className = 'hierarchy-group-section';

      // Create group header
      const groupHeader = document.createElement('div');
      groupHeader.className = 'hierarchy-group-header';
      groupHeader.textContent = groupName;
      groupSection.appendChild(groupHeader);

      // Create certificates list for this group
      const certsList = document.createElement('div');
      certsList.className = 'hierarchy-certs-list';

      // Add each certificate in this group
      certs.forEach(cert => {
        // Calculate status
        const status = getStatusFromCertificate(cert);
        const statusClass = status === 'valid' ? 'status-valid' :
          status === 'expiring' ? 'status-warning' :
            status === 'expired' ? 'status-expired' : 'status-unknown';

        // Create certificate item
        const certItem = document.createElement('div');
        certItem.className = 'hierarchy-cert-item';
        certItem.setAttribute('data-cert-id', UIUtils.escapeAttr(cert.fingerprint));

        // Create item content
        certItem.innerHTML = `
                  <span class="cert-name">${UIUtils.escapeHTML(cert.name)}</span>
                  <span class="cert-status ${statusClass}">${status}</span>
                  <button class="button small view-cert-btn" data-cert-id="${UIUtils.escapeAttr(cert.fingerprint)}">View</button>
              `;

        // Add to list
        certsList.appendChild(certItem);

        // Add event listener to view button
        certItem.querySelector('.view-cert-btn').addEventListener('click', () => {
          showCertificateDetails(cert.fingerprint);
        });
      });

      // Add certificates list to group
      groupSection.appendChild(certsList);

      // Add group to CA section
      caSection.appendChild(groupSection);
    });

    container.appendChild(caSection);
  });
}

/**
 * Load CA certificates from API
 * @param {boolean} updateUI - Whether to update the UI
 */
async function loadCACertificates(updateUI = true) {
  if (updateUI) {
    UIUtils.showLoading('ca-certificates');
  }

  try {
    const response = await fetch('/api/ca');

    // Check for unauthorized response
    if (await handleUnauthorizedResponse(response)) {
      return;
    }

    if (!response.ok) {
      throw new Error(`Failed to load CA certificates: ${response.status}`);
    }

    const caCertificates = await response.json();
    state.caCertificates = caCertificates;

    if (updateUI) {
      renderCACertificatesList(caCertificates);
    }

    Logger.info(`Loaded ${caCertificates.length} CA certificates`);
    return caCertificates;
  } catch (error) {
    UIUtils.showError('Failed to load CA certificates', error);
    if (updateUI) {
      document.getElementById('ca-certificates').innerHTML = UIUtils.safeTemplate(`
        <div class="error-message">
          <p>Failed to load CA certificates: ${UIUtils.sanitizeErrorMessage(error)}</p>
          <button class="button" onclick="loadCACertificates()">Retry</button>
        </div>
      `, {});
    }
    return [];
  }
}

/**
 * Render CA certificates list
 * @param {Array} caCertificates - List of CA certificates
 */
function renderCACertificatesList(caCertificates) {
  const container = document.getElementById('ca-certificates');

  if (!caCertificates || caCertificates.length === 0) {
    container.innerHTML = UIUtils.safeTemplate(`
      <div class="empty-state">
        <p>No CA certificates found</p>
        <button id="create-first-ca-btn" class="button primary">Create Your First CA</button>
      </div>
    `, {});

    const createBtn = document.getElementById('create-first-ca-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => showCreateCAModal());
    }

    return;
  }

  // Generate HTML
  const html = caCertificates.map(ca => {
    // Calculate status based on CA certificate properties
    let status = 'unknown';
    if (ca.isExpired) {
      status = 'expired';
    } else if (ca.isExpiringSoon) {
      status = 'expiring';
    } else {
      status = 'valid';
    }

    const statusClass = status === 'valid' ? 'status-valid' :
      status === 'expiring' ? 'status-warning' : 'status-expired';

    const expiryDate = ca.validTo ? DateUtils.formatDate(ca.validTo) : 'N/A';

    // Extract CN from subject or use name
    const subject = ca.subject || ca.name;

    return `
      <div class="ca-item" data-ca-id="${ca.fingerprint}">
        <div class="ca-header">
          <h3 class="ca-name">${UIUtils.escapeHTML(ca.name)}</h3>
          <span class="ca-status ${statusClass}">${status}</span>
        </div>
        <div class="ca-details">
          <div class="ca-info">
            <p class="ca-subject">${UIUtils.escapeHTML(subject)}</p>
            <p class="ca-expiry">Expires: ${expiryDate}</p>
          </div>
          <div class="ca-actions">
            <button class="button view-ca-btn" data-ca-id="${ca.fingerprint}">View</button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = UIUtils.safeTemplate(html, {});

  // Add event listeners to view buttons
  document.querySelectorAll('.view-ca-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const caId = e.target.getAttribute('data-ca-id');
      showCertificateDetails(caId, null, true); // Using the same detail view for CAs
    });
  });
}

/**
 * Update certificate statistics on dashboard
 */
function updateCertificateStats() {
  const certificates = state.certificates;

  // Calculate stats
  const total = certificates.length;
  const valid = certificates.filter(cert => cert.status === 'valid').length;
  const expiring = certificates.filter(cert => cert.status === 'expiring').length;
  const expired = certificates.filter(cert => cert.status === 'expired').length;

  // Update the UI
  document.getElementById('total-certs').textContent = total;
  document.getElementById('valid-certs').textContent = valid;
  document.getElementById('expiring-certs').textContent = expiring;
  document.getElementById('expired-certs').textContent = expired;
}

/**
 * Update CA certificates summary on dashboard
 */
function updateCASummary() {
  const container = document.getElementById('ca-list-summary');
  const caCertificates = state.caCertificates || [];

  if (!caCertificates || caCertificates.length === 0) {
    container.innerHTML = UIUtils.safeTemplate(`
      <p class="empty-message">No CA certificates available</p>
      <button id="dashboard-create-ca-btn" class="button">Create CA</button>
    `, {});

    // Add event listener to create CA button
    const createBtn = document.getElementById('dashboard-create-ca-btn');
    if (createBtn) {
      createBtn.addEventListener('click', () => {
        changeTab('ca');
        setTimeout(() => {
          if (typeof showCreateCAModal === 'function') {
            showCreateCAModal();
          }
        }, 100);
      });
    }

    return;
  }

  // Generate HTML for CA summary (show up to 3)
  const html = caCertificates.slice(0, 3).map(ca => {
    // Determine status class based on CA properties
    let statusClass = 'status-unknown';
    let statusText = 'Unknown';

    if (ca.isExpired) {
      statusClass = 'status-expired';
      statusText = 'Expired';
    } else if (ca.isExpiringSoon) {
      statusClass = 'status-warning';
      statusText = 'Expiring Soon';
    } else {
      statusClass = 'status-valid';
      statusText = 'Valid';
    }

    return UIUtils.safeTemplate(`
      <div class="ca-summary-item">
        <span class="ca-name">\${name}</span>
        <span class="ca-status \${statusClass}">\${statusText}</span>
      </div>
    `, {
      name: ca.name,
      statusClass: statusClass,
      statusText: statusText
    });
  }).join('');

  // Add "View all" link
  container.innerHTML = html + UIUtils.safeTemplate(`
    <a href="#ca" class="view-all-link">View all CA certificates</a>
  `, {});
}


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
 * Load recent activities for the dashboard
 * @param {number} limit - Maximum number of activities to show
 * @returns {Promise<Array>} - Array of recent activities
 */
async function loadRecentActivity(limit = 5) {
  try {
    const response = await fetch(`/api/activity?limit=${limit}`);

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();

    // Check if the response has the expected structure and activities is an array
    if (!data.success || !data.activities || !Array.isArray(data.activities)) {
      logger.warn('Activity response is not in the expected format', {
        hasSuccess: !!data.success,
        hasActivities: !!data.activities,
        isArray: Array.isArray(data.activities),
        data: typeof data === 'object' ? JSON.stringify(data) : data
      });

      // Return an empty array if the response is not valid
      return [];
    }

    // Now we're sure data.activities is an array
    return data.activities.slice(0, limit);
  } catch (error) {
    logger.error('Failed to load activity', error);
    throw error;
  }
}

/**
 * Render recent activities in the dashboard
 */
function renderRecentActivity(activities) {
  const activityContainer = document.getElementById('recent-activity');
  if (!activityContainer) return;

  if (!activities || !Array.isArray(activities) || activities.length === 0) {
    activityContainer.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-history"></i>
        <p>No recent activity</p>
      </div>
    `;
    return;
  }

  let html = '';
  activities.forEach(activity => {
    const date = new Date(activity.timestamp);
    const formattedDate = date.toLocaleString();

    // Determine icon based on activity type
    let icon = 'fa-history';
    if (activity.type === 'certificate') icon = 'fa-certificate';
    else if (activity.type === 'user') icon = 'fa-user';
    else if (activity.type === 'system') icon = 'fa-server';

    html += `
      <div class="activity-item">
        <div class="activity-icon">
          <i class="fas ${icon}"></i>
        </div>
        <div class="activity-content">
          <div class="activity-message">${activity.message}</div>
          <div class="activity-time">${formattedDate}</div>
        </div>
      </div>
    `;
  });

  activityContainer.innerHTML = html;
}

/**
 * Load and render recent activity in the dashboard
 */
async function updateDashboardActivity() {
  try {
    const activities = await loadRecentActivity(5);
    renderRecentActivity(activities);
  } catch (error) {
    logger.error('Failed to load activity', error);
    const activityContainer = document.getElementById('recent-activity');
    if (activityContainer) {
      activityContainer.innerHTML = `
        <div class="error-message">
          <i class="fas fa-exclamation-triangle"></i>
          <p>Failed to load recent activity</p>
        </div>
      `;
    }
  }
}

/**
 * Update expiring certificates on dashboard
 */
function updateExpiringCerts() {
  const container = document.getElementById('expiring-certs-list');
  const certificates = state.certificates || [];

  // Get expiring certificates (expiring soon but not expired yet)
  const expiringCerts = certificates.filter(cert =>
    cert.isExpiringSoon && !cert.isExpired);

  if (expiringCerts.length === 0) {
    container.innerHTML = UIUtils.safeTemplate(`
      <p class="good-message">No certificates expiring soon</p>
    `, {});
    return;
  }

  // Sort by expiry date (ascending)
  expiringCerts.sort((a, b) => {
    if (!a.validTo) return 1;
    if (!b.validTo) return -1;
    return new Date(a.validTo) - new Date(b.validTo);
  });

  // Generate HTML for each expiring certificate
  const html = expiringCerts.slice(0, 5).map(cert => {
    const daysUntilExpiry = cert.daysUntilExpiry ||
      Math.ceil((new Date(cert.validTo) - new Date()) / (1000 * 60 * 60 * 24));

    // Safely extract the domain
    let domain = cert.name;
    if (cert.sans && Array.isArray(cert.sans.domains) && cert.sans.domains.length > 0) {
      domain = cert.sans.domains[0];
    }

    return UIUtils.safeTemplate(`
      <div class="expiring-cert-item">
        <div class="expiring-cert-name">\${name}</div>
        <div class="expiring-days warning">Expires in \${days} days</div>
        <button class="button small renew-btn" data-cert-id="\${fingerprint|attr}">Renew</button>
      </div>
    `, {
      name: cert.name,
      domain: domain,
      days: daysUntilExpiry,
      fingerprint: cert.fingerprint
    });
  }).join('');

  container.innerHTML = html;

  // Add event listeners to renew buttons
  document.querySelectorAll('#expiring-certs-list .renew-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const certId = this.getAttribute('data-cert-id');
      if (typeof renewCertificate === 'function') {
        renewCertificate(certId);
      }
    });
  });
}

/**
 * Load system logs
 */
async function loadLogs() {
  // Handled by logs-viewer.js
  if (window.loadSystemLogs) {
    loadSystemLogs();
  }
}


/**
 * Display error message in a container
 * @param {string} containerId - ID of container element
 * @param {string} message - Error message to display
 * @param {Error|string} error - The error object or string
 * @param {Function} retryFunction - Optional function to call when retry is clicked
 */
function displayError(containerId, message, error, retryFunction = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const errorMessage = UIUtils.sanitizeErrorMessage(error);
  let html = UIUtils.safeTemplate(`
    <div class="error-message">
      <p>\${message}: \${errorMessage}</p>
      \${retryButton}
    </div>
  `, {
    message: message,
    errorMessage: errorMessage,
    retryButton: retryFunction ? '<button class="button retry-btn">Retry</button>' : ''
  });

  container.innerHTML = html;

  // Add event listener to retry button if provided
  if (retryFunction) {
    const retryBtn = container.querySelector('.retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', retryFunction);
    }
  }
}

/**
 * Initialize the view mode selector
 */
function initViewModeSelector() {
  const viewModeButton = document.getElementById('view-mode-button');
  if (!viewModeButton) return;

  // Update button icon based on current view mode
  updateViewModeButtonIcon(viewModeButton, localStorage.getItem('certificateViewMode') || 'block');

  // Create dropdown menu for view mode selection
  viewModeButton.addEventListener('click', function (e) {
    e.stopPropagation();

    // Check if dropdown already exists
    let dropdown = document.getElementById('view-mode-dropdown');

    // If dropdown exists, remove it (toggle behavior)
    if (dropdown) {
      document.body.removeChild(dropdown);
      return;
    }

    // Create dropdown
    dropdown = document.createElement('div');
    dropdown.id = 'view-mode-dropdown';
    dropdown.className = 'view-mode-dropdown';

    // Position dropdown below button
    const buttonRect = viewModeButton.getBoundingClientRect();
    dropdown.style.position = 'absolute';
    dropdown.style.top = `${buttonRect.bottom + window.scrollY}px`;
    dropdown.style.right = `${window.innerWidth - buttonRect.right}px`;
    dropdown.style.zIndex = 1000;

    // Add view mode options header
    const viewModeHeader = document.createElement('div');
    viewModeHeader.className = 'view-mode-dropdown-header';
    viewModeHeader.textContent = 'View Mode';
    dropdown.appendChild(viewModeHeader);

    // Add view mode options
    const viewModes = [
      { id: 'block', label: 'Block View', icon: 'fa-th-large' },
      { id: 'list', label: 'List View', icon: 'fa-list' },
      { id: 'hierarchy', label: 'Hierarchy View', icon: 'fa-sitemap' }
    ];

    // Get current view mode from localStorage
    const currentViewMode = localStorage.getItem('certificateViewMode') || 'block';

    viewModes.forEach(mode => {
      const option = document.createElement('div');
      option.className = `view-mode-option ${mode.id === currentViewMode ? 'active' : ''}`;
      option.innerHTML = `<i class="fas ${mode.icon}"></i> ${mode.label}`;
      option.addEventListener('click', function () {
        // Save selected view mode
        localStorage.setItem('certificateViewMode', mode.id);

        // Update button icon
        updateViewModeButtonIcon(viewModeButton, mode.id);

        // Re-render certificates with new view mode
        renderCertificatesList(state.certificates);

        // Close dropdown
        document.body.removeChild(dropdown);
      });

      dropdown.appendChild(option);
    });

    // Add status filter section header
    const statusHeader = document.createElement('div');
    statusHeader.className = 'view-mode-dropdown-header';
    statusHeader.textContent = 'Status Filter';
    dropdown.appendChild(statusHeader);

    // Get saved status filters from localStorage or default to all selected
    const savedFilters = JSON.parse(localStorage.getItem('certificateStatusFilter') || '{"valid":true,"expiring":true,"expired":true}');

    // Add status filter options
    const statusOptions = [
      { id: 'valid', label: 'Valid', class: 'status-valid' },
      { id: 'expiring', label: 'Expiring Soon', class: 'status-warning' },
      { id: 'expired', label: 'Expired', class: 'status-expired' }
    ];

    statusOptions.forEach(option => {
      const filterOption = document.createElement('div');
      filterOption.className = 'status-filter-option';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `status-filter-${option.id}`;
      checkbox.className = 'status-checkbox';
      checkbox.checked = savedFilters[option.id] !== false; // Default to true if not set

      const label = document.createElement('label');
      label.htmlFor = `status-filter-${option.id}`;
      label.className = `status-filter-label ${option.class}`;
      label.textContent = option.label;

      filterOption.appendChild(checkbox);
      filterOption.appendChild(label);

      // Add change event
      checkbox.addEventListener('change', function () {
        // Update saved filters
        const currentFilters = JSON.parse(localStorage.getItem('certificateStatusFilter') || '{"valid":true,"expiring":true,"expired":true}');
        currentFilters[option.id] = checkbox.checked;
        localStorage.setItem('certificateStatusFilter', JSON.stringify(currentFilters));

        // Update filter indicator and re-render
        updateViewModeFilterIndicator();
        renderCertificatesList(state.certificates);
      });

      dropdown.appendChild(filterOption);
    });

    // Add sorting options section
    const sortHeader = document.createElement('div');
    sortHeader.className = 'view-mode-dropdown-header';
    sortHeader.textContent = 'Sort By';
    dropdown.appendChild(sortHeader);

    // Get current sort settings
    const currentSortField = localStorage.getItem('certificateSortField') || 'name';
    const currentSortDirection = localStorage.getItem('certificateSortDirection') || 'asc';

    // Add sort options
    const sortOptions = [
      { id: 'name', label: 'Certificate Name' },
      { id: 'domain', label: 'Domain' },
      { id: 'expires', label: 'Expiration Date' },
      { id: 'status', label: 'Status' },
      { id: 'group', label: 'Group' }
    ];

    sortOptions.forEach(option => {
      const sortOption = document.createElement('div');
      sortOption.className = `sort-option ${option.id === currentSortField ? 'active' : ''}`;

      // Create direction indicator if this is the current sort field
      let dirIndicator = '';
      if (option.id === currentSortField) {
        dirIndicator = currentSortDirection === 'asc' ? ' ↑' : ' ↓';
      }

      sortOption.innerHTML = `${option.label}${dirIndicator}`;

      sortOption.addEventListener('click', function () {
        // Toggle direction if already selected
        const newDirection = option.id === currentSortField && currentSortDirection === 'asc' ? 'desc' : 'asc';

        // Save sort settings
        localStorage.setItem('certificateSortField', option.id);
        localStorage.setItem('certificateSortDirection', newDirection);

        // Re-render certificates with new sort
        renderCertificatesList(state.certificates);

        // Close dropdown
        document.body.removeChild(dropdown);
      });

      dropdown.appendChild(sortOption);
    });

    // Add dropdown to document
    document.body.appendChild(dropdown);

    // Close dropdown when clicking outside
    document.addEventListener('click', function closeDropdown(e) {
      if (e.target !== viewModeButton && !dropdown.contains(e.target)) {
        if (dropdown.parentNode) {
          document.body.removeChild(dropdown);
        }
        document.removeEventListener('click', closeDropdown);
      }
    });
  });
}

/**
 * Update the view mode button icon based on the current view mode
 * @param {HTMLElement} button - The view mode button element
 * @param {string} viewMode - The current view mode
 */
function updateViewModeButtonIcon(button, viewMode) {
  let iconClass = 'fa-th-large'; // Default for block view

  switch (viewMode) {
    case 'list':
      iconClass = 'fa-list';
      break;
    case 'hierarchy':
      iconClass = 'fa-sitemap';
      break;
  }

  button.innerHTML = `<i class="fas ${iconClass}"></i>`;
}

/**
 * Update the view mode button to show if filters are active
 */
function updateViewModeFilterIndicator() {
  const viewModeButton = document.getElementById('view-mode-button');
  if (!viewModeButton) return;

  // Get status filters from localStorage
  const statusFilters = JSON.parse(localStorage.getItem('certificateStatusFilter') || '{"valid":true,"expiring":true,"expired":true}');

  // Check if any filter is off (not all filters are on)
  const allFiltersOn = statusFilters.valid && statusFilters.expiring && statusFilters.expired;

  // Update button class to show indicator
  if (allFiltersOn) {
    viewModeButton.classList.remove('filtered');
  } else {
    viewModeButton.classList.add('filtered');
  }
}

/**
 * Update filtering and re-render certificates
 */
function updateCertificateFiltering() {
  // Update filter indicator on button
  updateViewModeFilterIndicator();

  // Re-render with current filters
  renderCertificatesList(state.certificates);
}

/**
 * Check authentication status on page load
 */
function checkAuthentication() {
  fetch('/api/setup/status')
    .then(response => response.json())
    .then(data => {
      if (!data.authDisabled && data.setupNeeded) {
        // If setup is needed, redirect to setup page
        window.location.href = '/setup';
        return;
      }

      if (data.authDisabled) {
        // Authentication is disabled, no need to check user
        Logger.info('Authentication is disabled');
        return { authDisabled: true };
      }

      // Otherwise check for logged in user
      return fetch('/api/auth/user')
        .then(response => {
          if (!response.ok && response.status === 401) {
            throw new Error('Not authenticated');
          }
          return response.json();
        });
    })
    .then(userData => {
      if (userData && userData.authDisabled) {
        // Auth is disabled, nothing to do
        return;
      }

      // User is authenticated, update UI with user info
      if (userData && userData.success && userData.user) {
        updateUserInterface(userData.user);
      }
    })
    .catch(error => {
      Logger.error('Authentication check failed:', error);
      // Only redirect if we're not in setup mode and not in disabled auth mode
      fetch('/api/setup/status')
        .then(response => response.json())
        .then(setupData => {
          if (setupData && !setupData.setupNeeded && !setupData.authDisabled) {
            window.location.href = '/login';
          }
        })
        .catch(setupError => {
          Logger.error('Failed to check setup status:', setupError);
          // In case of error, redirect to login as a safe default
          window.location.href = '/login';
        });
    });
}

// Update UI based on user info
function updateUserInterface(user) {
  const userNameElement = document.getElementById('user-name');
  if (userNameElement && user) {
    userNameElement.textContent = user.name || user.username;
  }

  // You can also update UI based on user role
  if (user.role === 'admin') {
    document.body.classList.add('admin-user');
    // Show admin-specific elements
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
  }
}

// Expose functions to global scope that need to be accessible from other scripts
window.loadDashboard = loadDashboard;
window.loadCertificates = loadCertificates;
window.loadCACertificates = loadCACertificates;
window.loadSettings = loadSettings;
window.renderBlockView = renderBlockView;
window.renderListView = renderListView;
window.renderHierarchyView = renderHierarchyView;
window.state = state;