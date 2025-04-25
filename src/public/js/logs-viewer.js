/**
 * Certificate Manager - Logs Viewer
 * Handles viewing, filtering, and searching system logs
 */

// Logs state
const logsState = {
    logs: [],
    filteredLogs: [],
    page: 1,
    perPage: 100,
    level: 'all',
    search: '',
    autoScroll: true
};

/**
 * Initialize logs viewer
 */
function setupLogsViewer() {
    // Set up event listeners
    document.getElementById('refresh-logs')?.addEventListener('click', loadSystemLogs);
    document.getElementById('clear-logs')?.addEventListener('click', clearLogsView);
    document.getElementById('log-filter-level')?.addEventListener('change', filterLogs);
    document.getElementById('log-search')?.addEventListener('input', filterLogs);
    
    // Initialize logs in tab change
    document.querySelector('a[data-tab="logs"]')?.addEventListener('click', () => {
        setTimeout(loadSystemLogs, 100);
    });
}

/**
 * Load system logs from API
 */
async function loadSystemLogs() {
    UIUtils.showLoading('logs-output');
    
    try {
        const response = await fetch('/api/logs');
        
        if (!response.ok) {
            throw new Error(`Failed to load logs: ${response.status}`);
        }
        
        const logs = await response.json();
        logsState.logs = logs;
        
        // Apply filters
        filterLogs();
        
        Logger.info(`Loaded ${logs.length} log entries`);
    } catch (error) {
        UIUtils.showError('Failed to load logs', error);
        document.getElementById('logs-output').innerHTML = UIUtils.safeTemplate(`
            <div class="error-message">
                <p>Failed to load logs: \${errorMessage}</p>
                <button class="button" onclick="loadSystemLogs()">Retry</button>
            </div>
        `, {errorMessage: UIUtils.sanitizeErrorMessage(error)});
    }
}

/**
 * Filter logs based on level and search text
 */
function filterLogs() {
  const levelFilter = document.getElementById('log-filter-level').value;
  const searchText = document.getElementById('log-search').value.toLowerCase();
  
  logsState.level = levelFilter;
  logsState.search = searchText;
  
  // Apply filters
  logsState.filteredLogs = logsState.logs.filter(log => {
    // Filter by level
    if (levelFilter !== 'all' && log.level !== levelFilter) {
      return false;
    }
    
    // Filter by search text
    if (searchText && !log.message.toLowerCase().includes(searchText)) {
      return false;
    }
    
    return true;
  });
  
  // Reset pagination
  logsState.page = 1;
  
  // Render filtered logs
  renderLogs();
}

/**
 * Render logs in the viewer
 */
function renderLogs() {
  const container = document.getElementById('logs-output');
  const { filteredLogs, page, perPage } = logsState;
  
  // Calculate pagination
  const startIndex = (page - 1) * perPage;
  const endIndex = startIndex + perPage;
  const pageOfLogs = filteredLogs.slice(startIndex, endIndex);
  
  if (filteredLogs.length === 0) {
    container.innerHTML = UIUtils.safeTemplate(`
      <p class="empty-message">No logs found matching your criteria</p>
    `, {});
    return;
  }
  
  // Generate log entries HTML
  const logEntriesHtml = pageOfLogs.map(log => {
    const timestamp = new Date(log.timestamp).toLocaleString();
    let levelClass = '';
    
    switch (log.level) {
      case 'error': levelClass = 'log-error'; break;
      case 'warn': levelClass = 'log-warning'; break;
      case 'info': levelClass = 'log-info'; break;
      case 'debug': levelClass = 'log-debug'; break;
    }
    
    // Format meta data if present
    let metaHtml = '';
    if (log.meta && Object.keys(log.meta).length > 0) {
      metaHtml = formatMeta(log.meta);
    }
    
    return UIUtils.safeTemplate(`
      <div class="log-entry \${levelClass|noEscape}">
        <div class="log-header">
          <span class="log-timestamp">\${timestamp|noEscape}</span>
          <span class="log-level \${levelClass|noEscape}">\${level}</span>
        </div>
        <div class="log-message">\${message}</div>
        \${metaHtml|noEscape}
      </div>
    `, {
      levelClass,
      timestamp,
      level: log.level,
      message: log.message,
      metaHtml
    });
  }).join('');
  
  // Add pagination if needed
  const totalPages = Math.ceil(filteredLogs.length / perPage);
  const paginationHtml = totalPages > 1 ? UIUtils.safeTemplate(`
    <div class="pagination">
      <span>Showing \${start} to \${end} of \${total} logs</span>
      <div class="pagination-controls">
        <button id="prev-page" class="button small" \${prevDisabled|noEscape}>Previous</button>
        <span>Page \${currentPage} of \${totalPages}</span>
        <button id="next-page" class="button small" \${nextDisabled|noEscape}>Next</button>
      </div>
    </div>
  `, {
    start: startIndex + 1,
    end: Math.min(endIndex, filteredLogs.length),
    total: filteredLogs.length,
    currentPage: page,
    totalPages,
    prevDisabled: page <= 1 ? 'disabled' : '',
    nextDisabled: page >= totalPages ? 'disabled' : ''
  }) : '';
  
  container.innerHTML = logEntriesHtml + paginationHtml;
  
  // Add event listeners to pagination buttons
  document.getElementById('prev-page')?.addEventListener('click', () => {
    if (logsState.page > 1) {
      logsState.page--;
      renderLogs();
    }
  });
  
  document.getElementById('next-page')?.addEventListener('click', () => {
    if (logsState.page < totalPages) {
      logsState.page++;
      renderLogs();
    }
  });
}

/**
 * Format meta data for display
 * @param {Object} meta - Meta data object
 * @returns {string} Formatted HTML
 */
function formatMeta(meta) {
  if (!meta) return '';
  
  try {
    if (typeof meta === 'string') {
      return UIUtils.safeTemplate(`
        <div class="log-meta">
          <div class="meta-item">\${metaText}</div>
        </div>
      `, { metaText: meta });
    }
    
    const metaItems = Object.entries(meta).map(([key, value]) => {
      const valueStr = typeof value === 'object' 
        ? JSON.stringify(value, null, 2) 
        : String(value);
        
      return UIUtils.safeTemplate(`
        <div class="meta-item">
          <span class="meta-key">\${key}:</span>
          <span class="meta-value">\${value}</span>
        </div>
      `, {
        key,
        value: valueStr
      });
    }).join('');
    
    return UIUtils.safeTemplate(`
      <div class="log-meta">\${items|noEscape}</div>
    `, { items: metaItems });
    
  } catch (e) {
    return UIUtils.safeTemplate(`
      <div class="log-meta">
        <div class="meta-item error">Error formatting metadata: \${error}</div>
      </div>
    `, { error: UIUtils.sanitizeErrorMessage(e) });
  }
}

/**
 * Clear logs view
 */
function clearLogsView() {
    document.getElementById('logs-output').innerHTML = '';
    document.getElementById('log-search').value = '';
    document.getElementById('log-filter-level').value = 'all';
    logsState.search = '';
    logsState.level = 'all';
    logsState.page = 1;
}

// Export functions to global scope
window.loadSystemLogs = loadSystemLogs;
window.setupLogsViewer = setupLogsViewer;