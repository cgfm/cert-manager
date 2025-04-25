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
 * Initialize the application
 */
function init() {
  setupTabNavigation();
  setupThemeToggle();

  loadSettings();
  
  // Load current tab data
  const activeTab = document.querySelector('.tab-content.active');
  if (activeTab) {
    loadTabData(activeTab.id);
  }

  initModals();

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
  // Skip if tab doesn't exist
  if (!document.getElementById(tabId)) {
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
      // Settings are already loaded at initialization
      break;
    case 'logs':
      loadLogs();
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
    
    // Load recent activity
    await loadRecentActivity();
    
    // Render dashboard sections with the loaded data
    renderDashboard();
    
    Logger.info('Dashboard loaded successfully');
  } catch (error) {
    console.error('Error loading dashboard:', error);
    
    // Display error in each section
    const errorMessage = UIUtils.sanitizeErrorMessage(error);
    
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
          <div class="error-message">
            <p>Failed to load data: \${errorMessage}</p>
          </div>
        `, {
          errorMessage
        });
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
 * Load all certificates from API
 * This is a separate function from loadCertificates to avoid UI updates
 */
async function loadAllCertificates() {
  try {
    // Fetch certificates from API
    const response = await fetch('/api/certificates');
    
    if (!response.ok) {
      throw new Error(`Failed to load certificates: ${response.status}`);
    }
    
    const certificates = await response.json();
    
    // Update state
    state.certificates = certificates;
    Logger.info(`Loaded ${certificates.length} certificates`);
    
    return certificates;
  } catch (error) {
    Logger.error('Error loading certificates data', error);
    throw error; // Re-throw to be handled by the caller
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
  
  // Calculate statistics
  const total = certificates.length;
  const valid = certificates.filter(cert => !cert.isExpired && !cert.isExpiringSoon).length;
  const expiring = certificates.filter(cert => cert.isExpiringSoon && !cert.isExpired).length;
  const expired = certificates.filter(cert => cert.isExpired).length;
  
  const statsContainer = document.getElementById('cert-stats');
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
        <div class="expiring-cert-domain">\${domain}</div>
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
    btn.addEventListener('click', function() {
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
    UIUtils.showError('Failed to load settings', error);
    return {};
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
      
      if (!response.ok) {
        throw new Error(`Failed to load certificates: ${response.status}`);
      }
      
      const certificates = await response.json();
      
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
      
      // Create container for certificate list
      const listElement = document.createElement('div');
      listElement.className = 'certificate-list';
      
      // Render certificates
      renderDashboardCertificatesList(certificates, listElement);
      
      certificatesContainer.appendChild(listElement);
    } catch (error) {
      console.error('Error loading certificates:', error);
      
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
 * Render certificates list
 * @param {Array} certificates - Array of certificate objects
 * @param {HTMLElement} container - Container element to append certificates to
 */
function renderDashboardCertificatesList(certificates, container) {
    // Filter certificates if needed
    const filter = document.getElementById('certificate-filter');
    const filterValue = filter ? filter.value.toLowerCase() : '';
    
    const filteredCerts = certificates.filter(cert => {
      // No filter or name/domain contains filter
      if (!filterValue) return true;
      
      const name = (cert.name || '').toLowerCase();
      const domain = (cert.domains && cert.domains.length > 0) ? cert.domains[0].toLowerCase() : '';
      
      return name.includes(filterValue) || domain.includes(filterValue);
    });
    
    // Generate HTML for each certificate
    filteredCerts.forEach(cert => {
      // Calculate status
      let status = 'unknown';
      if (cert.isExpired) {
        status = 'expired';
      } else if (cert.isExpiringSoon) {
        status = 'expiring';
      } else if (cert.validTo) {
        status = 'valid';
      }
      
      const statusClass = status === 'valid' ? 'status-valid' : 
                        status === 'expiring' ? 'status-warning' : 
                        status === 'expired' ? 'status-expired' : 'status-unknown';
      
      const expiryDate = cert.validTo ? DateUtils.formatDate(cert.validTo) : 'N/A';
      const domain = cert.domains && cert.domains.length > 0 ? cert.domains[0] : 'N/A';
      
      // Create certificate item element
      const certItem = document.createElement('div');
      certItem.className = 'certificate-item';
      certItem.setAttribute('data-cert-id', UIUtils.safeAttr(cert.fingerprint));

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
      
      info.appendChild(domainElem);
      info.appendChild(expiryElem);
      
      const actions = document.createElement('div');
      actions.className = 'cert-actions';
      
      const viewBtn = document.createElement('button');
      viewBtn.className = 'button view-cert-btn';
      viewBtn.textContent = 'View';
      viewBtn.setAttribute('data-cert-id', UIUtils.safeAttr(cert.fingerprint));

      actions.appendChild(viewBtn);
      
      details.appendChild(info);
      details.appendChild(actions);
      
      // Assemble certificate item
      certItem.appendChild(header);
      certItem.appendChild(details);
      
      // Add to container
      container.appendChild(certItem);
      
      // Add event listener
      viewBtn.addEventListener('click', () => {
        showCertificateDetails(cert.fingerprint);
      });
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
      `,{});
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
      showCertificateDetails(caId); // Using the same detail view for CAs
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
 * Load recent activity data
 */
async function loadRecentActivity() {
  const container = document.getElementById('recent-activity');
  if (!container) return;
  
  try {
    const response = await fetch('/api/activity');
    if (!response.ok) {
      throw new Error(`Failed to load activity: ${response.status}`);
    }
    
    const activities = await response.json() || [];
    
    if (!activities || activities.length === 0) {
      container.innerHTML = UIUtils.safeTemplate(`<p class="empty-message">No recent activity</p>`, {});
      return;
    }
    
    // Generate HTML
    const html = activities.slice(0, 5).map(activity => {
      const date = DateUtils.formatDateTime(activity.timestamp);
      let actionClass = '';
      
      switch (activity.type) {
        case 'create':
          actionClass = 'activity-create';
          break;
        case 'renew':
          actionClass = 'activity-renew';
          break;
        case 'delete':
          actionClass = 'activity-delete';
          break;
      }
      
      return `
        <div class="activity-item">
          <span class="activity-time">${date}</span>
          <span class="activity-action ${actionClass}">${activity.action}</span>
          <span class="activity-target">${UIUtils.escapeHTML(activity.target)}</span>
        </div>
      `;
    }).join('');
    
    container.innerHTML = UIUtils.safeTemplate(html, {});
  } catch (error) {
    container.innerHTML = UIUtils.safeTemplate(`
      <div class="error-message">
        <p>Failed to load activity: ${UIUtils.sanitizeErrorMessage(error)}</p>
      </div>
    `, {});
    Logger.error('Failed to load activity', error);
  }
}

/**
 * Update expiring certificates on dashboard
 */
function updateExpiringCerts() {
  const container = document.getElementById('expiring-certs-list');
  if (!container) return;
  
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
    
    const domain = cert.domains && cert.domains.length > 0 ? cert.domains[0] : cert.name;
    
    return UIUtils.safeTemplate(`
      <div class="expiring-cert-item">
        <div class="expiring-cert-name">\${name}</div>
        <div class="expiring-cert-domain">\${domain}</div>
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
    btn.addEventListener('click', (e) => {
      const certId = e.target.getAttribute('data-cert-id');
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

// Expose functions to global scope that need to be accessible from other scripts
window.loadDashboard = loadDashboard;
window.loadCertificates = loadCertificates;
window.loadCACertificates = loadCACertificates;
window.loadSettings = loadSettings;
window.state = state;