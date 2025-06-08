/**
 * @fileoverview Certificate Manager - Logs System and Viewer
 * 
 * This module provides comprehensive log viewing and management capabilities for the
 * Certificate Manager application. It combines real-time log monitoring with advanced
 * filtering, search, and export functionality.
 * 
 * Features include:
 * - Real-time log streaming and auto-refresh
 * - Multi-level filtering (level, file, search text)
 * - Log export functionality (JSON/CSV formats)
 * - Log level management and dynamic configuration
 * - Pagination for large log datasets
 * - Color-coded log levels for better readability
 * - Cross-platform log file access
 * 
 * The logs system integrates with the backend logging service to provide
 * administrators with comprehensive system monitoring capabilities.
 * 
 * @module public/js/logs-viewer
 * @requires Logger
 * @requires UIUtils
 * @author Certificate Manager
 * @since 1.0.0
 */

// Logs state
const logsState = {
    logs: [],
    filteredLogs: [],
    page: 1,
    perPage: 100,
    level: 'all',
    file: 'all',
    search: '',
    autoRefresh: false,
    refreshInterval: 10000,
    refreshTimer: null,
    uniqueFiles: new Set()
};

/**
 * Initialize logs system
 */
function initLogsSystem() {
    // Set up event listeners for logs viewer
    document.getElementById('refresh-logs')?.addEventListener('click', loadSystemLogs);
    document.getElementById('clear-logs')?.addEventListener('click', clearLogsView);
    document.getElementById('log-filter-level')?.addEventListener('change', filterLogs);
    document.getElementById('log-filter-file')?.addEventListener('change', filterLogs);
    document.getElementById('log-search')?.addEventListener('input', filterLogs);
    document.getElementById('export-logs')?.addEventListener('click', exportLogs);

    // Auto-refresh controls
    const autoRefreshCheckbox = document.getElementById('auto-refresh-logs');
    const autoRefreshInterval = document.getElementById('auto-refresh-interval');

    if (autoRefreshCheckbox && autoRefreshInterval) {
        autoRefreshCheckbox.addEventListener('change', toggleAutoRefresh);
        autoRefreshInterval.addEventListener('change', updateRefreshInterval);
    }

    // Set up log settings button
    document.getElementById('log-settings-btn')?.addEventListener('click', showLogSettingsModal);

    // Initialize logs when tab changes
    document.querySelector('a[data-tab="logs"]')?.addEventListener('click', () => {
        setTimeout(loadSystemLogs, 100);
    });
}

/**
 * Toggle auto-refresh for logs
 */
function toggleAutoRefresh() {
    const autoRefreshCheckbox = document.getElementById('auto-refresh-logs');
    logsState.autoRefresh = autoRefreshCheckbox.checked;

    // Clear existing timer if any
    if (logsState.refreshTimer) {
        clearInterval(logsState.refreshTimer);
        logsState.refreshTimer = null;
    }

    // Set up new timer if auto-refresh is enabled
    if (logsState.autoRefresh) {
        logsState.refreshTimer = setInterval(loadSystemLogs, logsState.refreshInterval);
    }
}

/**
 * Update the refresh interval
 */
function updateRefreshInterval() {
    const intervalSelect = document.getElementById('auto-refresh-interval');
    logsState.refreshInterval = parseInt(intervalSelect.value);

    // Reset timer if auto-refresh is enabled
    if (logsState.autoRefresh) {
        clearInterval(logsState.refreshTimer);
        logsState.refreshTimer = setInterval(loadSystemLogs, logsState.refreshInterval);
    }
}

/**
 * Load system logs from API
 */
async function loadSystemLogs() {
    try {
        // Don't show loading if we already have logs and this is an auto-refresh
        if (logsState.logs.length === 0) {
            UIUtils.showLoading('logs-output');
        }

        // Build query string with filters if they're set
        let queryParams = new URLSearchParams();
        if (logsState.level !== 'all') {
            queryParams.append('level', logsState.level);
        }
        if (logsState.file !== 'all') {
            queryParams.append('file', logsState.file);
        }
        if (logsState.search) {
            queryParams.append('search', logsState.search);
        }

        // Set limit for log entries
        queryParams.append('limit', '1000');

        // Build the URL with query parameters
        const url = `/api/logs${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
        Logger.debug(`Loading logs from: ${url}`);
        
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Failed to load logs: ${response.status}`);
        }

        let logs = await response.json();

        // Validate and repair logs data
        logs = logs.map(log => ({
            timestamp: log.timestamp || new Date().toISOString(),
            level: (log.level || 'info').toLowerCase(),
            filename: log.filename || 'unknown',
            instance: log.instance || null,
            message: log.message || 'No message',
            meta: log.meta
        }));

        logsState.logs = logs;

        // Extract unique filenames for the file filter
        logsState.uniqueFiles = new Set();
        logs.forEach(log => {
            if (log.filename) {
                logsState.uniqueFiles.add(log.filename);
            }
        });

        // Update the file filter dropdown
        updateFileFilter();

        // Apply filters
        filterLogs();

        // Update log count
        document.getElementById('logs-count').textContent = `${logs.length} logs`;

        // If UI is showing log settings, update active file list
        updateLogSettingsFileList();
    } catch (error) {
        UIUtils.showError('Failed to load logs', error);
        document.getElementById('logs-output').innerHTML = UIUtils.safeTemplate(`
            <div class="error-message">
                <p>Failed to load logs: \${errorMessage}</p>
                <button class="button" onclick="loadSystemLogs()">Retry</button>
            </div>
        `, { errorMessage: UIUtils.sanitizeErrorMessage(error) });
    }
}

/**
 * Update the file filter dropdown with unique filenames
 */
function updateFileFilter() {
    const fileFilter = document.getElementById('log-filter-file');
    if (!fileFilter) return;

    // Save current selection
    const currentValue = fileFilter.value;

    // Clear existing options except the first one (All Files)
    while (fileFilter.options.length > 1) {
        fileFilter.remove(1);
    }

    // Add options for each unique filename
    Array.from(logsState.uniqueFiles).sort().forEach(filename => {
        const option = document.createElement('option');
        option.value = filename;
        option.textContent = filename;
        fileFilter.appendChild(option);
    });

    // Restore previous selection if it still exists
    if (Array.from(fileFilter.options).some(option => option.value === currentValue)) {
        fileFilter.value = currentValue;
    }
}

/**
 * Filter logs based on level, file, and search text
 */
function filterLogs() {
    const levelFilter = document.getElementById('log-filter-level').value;
    const fileFilter = document.getElementById('log-filter-file').value;
    const searchText = document.getElementById('log-search').value.toLowerCase();

    logsState.level = levelFilter;
    logsState.file = fileFilter;
    logsState.search = searchText;

    // Apply filters
    logsState.filteredLogs = logsState.logs.filter(log => {
        // Filter by level (safely)
        if (levelFilter !== 'all' && log.level && log.level !== levelFilter) {
            return false;
        }

        // Filter by file (safely)
        if (fileFilter !== 'all' && (!log.filename || log.filename !== fileFilter)) {
            return false;
        }

        // Filter by search text (safely)
        if (searchText &&
            !((log.message && log.message.toLowerCase().includes(searchText)) ||
            (log.filename && log.filename.toLowerCase().includes(searchText)) ||
            (log.instance && log.instance.toLowerCase().includes(searchText)))) {
            return false;
        }

        return true;
    });

    // Reset pagination
    logsState.page = 1;

    // Update filtered count
    document.getElementById('logs-filtered-count').textContent =
        `(${logsState.filteredLogs.length} filtered)`;

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
        // Handle missing properties safely
        const timestamp = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Unknown date';
        const level = log.level ? log.level.toUpperCase() : 'UNKNOWN';
        let levelClass = '';

        // Set the level class based on the level (if it exists)
        if (log.level) {
            switch (log.level.toLowerCase()) {
                case 'error': levelClass = 'log-error'; break;
                case 'warn': levelClass = 'log-warning'; break;
                case 'info': levelClass = 'log-info'; break;
                case 'debug': levelClass = 'log-debug'; break;
                case 'fine': levelClass = 'log-fine'; break;
                case 'finest': levelClass = 'log-finest'; break;
                default: levelClass = 'log-debug'; // Default class for unknown levels
            }
        } else {
            levelClass = 'log-debug'; // Default class if no level
        }

        // Format meta data if present
        let metaHtml = '';
        if (log.meta && Object.keys(log.meta).length > 0) {
            metaHtml = formatMeta(log.meta);
        }

        // Include filename in the log entry if available
        let filenameHtml = '';
        if (log.filename) {
            Logger.debug(`Filename: ${log.filename}, Instance: ${log.instance}`);
            if (log.instance) {
                filenameHtml = UIUtils.safeTemplate(`
                    <span class="log-filename">\${filename} <span class="log-instance">\${instance}</span></span>
                `, { 
                    filename: log.filename,
                    instance: log.instance 
                });
            } else {
                filenameHtml = UIUtils.safeTemplate(`
                    <span class="log-filename">\${filename}</span>
                `, { filename: log.filename });
            }
        }

        // Ensure log.message exists to avoid further errors
        const messageText = log.message || 'No message';

        // Format message with possible JSON detection
        const formattedMessage = formatLogMessage(messageText);

        return UIUtils.safeTemplate(`
            <div class="log-entry \${levelClass|noEscape}">
                <div class="log-header">
                    <span class="log-timestamp">\${timestamp|noEscape}</span>
                    <span class="log-level \${levelClass|noEscape}">\${level}</span>
                    \${filenameHtml|noEscape}
                </div>
                <div class="log-message">\${formattedMessage|noEscape}</div>
                \${metaHtml|noEscape}
            </div>
        `, {
            levelClass,
            timestamp,
            level,
            formattedMessage, // Use formatted message instead of raw message
            filenameHtml,
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

    document.getElementById('logs-output').innerHTML = logEntriesHtml;

    // Update pagination information
    updatePagination();
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
 * Format message text with collapsible JSON detection
 * @param {string} message - The log message
 * @returns {string} Formatted message HTML
 */
function formatLogMessage(message) {
    if (!message) return 'No message';

    // Check if the message contains JSON-like structure
    // Look for patterns like {" or [{" or " = {" that might indicate JSON
    const jsonRegex = /({[\s\n]*".*}|{[\s\n]*'.*}|\[{[\s\n]*".*}\]|\[{[\s\n]*'.*}\])/;
    const match = message.match(jsonRegex);

    if (match) {
        try {
            // Extract the potential JSON part
            const jsonPart = match[0];

            // Try to parse it as JSON
            const parsed = JSON.parse(jsonPart);

            // Generate a unique ID for this JSON block
            const jsonId = 'json-' + Math.random().toString(36).substr(2, 9);

            // In formatLogMessage function, update this line:
            const formattedJson = `<div class="json-in-log" id="${jsonId}" onclick="toggleJsonCollapse('${jsonId}', event)">
                    <div class="json-caret"><i class="fas fa-caret-right"></i></div>
                    <pre class="json-content">${UIUtils.escapeHTML(JSON.stringify(parsed, null, 2))}</pre>
                </div>`;

            // Replace the JSON part in the original message
            return message.replace(jsonPart, formattedJson);
        } catch (e) {
            // If it's not valid JSON, just return the original message
            return UIUtils.escapeHTML(message);
        }
    }

    // If no JSON detected or parsing failed, return escaped message
    return UIUtils.escapeHTML(message);
}

/**
 * Toggle JSON collapse state
 * @param {string} id - The ID of the JSON element
 * @param {Event} event - The click event
 */
function toggleJsonCollapse(id, event) {
    // Prevent default behavior and stop propagation
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const jsonElement = document.getElementById(id);
    if (!jsonElement) return;
    
    const jsonContent = jsonElement.querySelector('.json-content');
    if (!jsonContent) return;
    
    // Get the current state
    const isExpanded = jsonElement.classList.contains('expanded');
    
    // Toggle expanded class
    jsonElement.classList.toggle('expanded');
    
    // Also toggle the caret icon
    const caret = jsonElement.querySelector('.json-caret i');
    if (caret) {
        caret.classList.toggle('fa-caret-right', isExpanded);
        caret.classList.toggle('fa-caret-down', !isExpanded);
    }
}

/**
 * Clear logs view
 */
function clearLogsView() {
    document.getElementById('log-search').value = '';
    document.getElementById('log-filter-level').value = 'all';
    document.getElementById('log-filter-file').value = 'all';

    logsState.search = '';
    logsState.level = 'all';
    logsState.file = 'all';
    logsState.page = 1;

    filterLogs();
}

/**
 * Export logs to file
 */
function exportLogs() {
    try {
        const logs = logsState.filteredLogs.length > 0 ? logsState.filteredLogs : logsState.logs;

        if (logs.length === 0) {
            UIUtils.showToast('No logs to export', 'warning');
            return;
        }

        // Format logs for export
        const exportData = logs.map(log => {
            const timestamp = new Date(log.timestamp).toISOString();
            const level = log.level.toUpperCase();
            const filename = log.filename || 'unknown';

            // Include meta if available
            let metaStr = '';
            if (log.meta && Object.keys(log.meta).length > 0) {
                try {
                    metaStr = ' ' + JSON.stringify(log.meta);
                } catch (e) {
                    metaStr = ' [Meta data could not be serialized]';
                }
            }

            return `${timestamp} ${level} [${filename}] ${log.message}${metaStr}`;
        }).join('\n');

        // Create blob and download link
        const blob = new Blob([exportData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);

        const downloadLink = document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = `cert-manager-logs-${new Date().toISOString().slice(0, 10)}.txt`;

        // Trigger download
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        // Clean up
        setTimeout(() => URL.revokeObjectURL(url), 100);

        UIUtils.showToast('Logs exported successfully');
    } catch (error) {
        UIUtils.showToast('Failed to export logs', 'error');
        console.error('Export logs error:', error);
    }
}

// ============= LOG SETTINGS MANAGER =============

/**
 * Show the log settings modal
 */
/**
 * Show the log settings modal
 */
async function showLogSettingsModal() {
    try {
        // Use /api/settings/logging endpoint
        const response = await fetch('/api/settings/logging');

        if (!response.ok) {
            throw new Error(`Failed to load log settings: ${response.status}`);
        }

        const logSettings = await response.json();

        // Create modal content as HTML string
        const modalContent = createLogSettingsContent(logSettings);

        // Show the modal using UIUtils.showModal
        UIUtils.showModal('log-settings-modal', {
            title: 'Log Settings',
            content: modalContent
        });

        // Now that the modal is in the DOM, set up event listeners
        // Add event listeners to form
        const form = document.getElementById('log-settings-form');
        if (form) {
            form.addEventListener('submit', saveLogSettings);
        }

        // Add file button
        const addFileButton = document.getElementById('add-file-button');
        if (addFileButton) {
            addFileButton.addEventListener('click', addFileLogLevel);
        }

        // Auto-suggest button
        const autoSuggestButton = document.getElementById('auto-suggest-button');
        if (autoSuggestButton) {
            autoSuggestButton.addEventListener('click', autoSuggestFiles);
        }

        // Set up event listeners for remove buttons
        setupLogSettingsEventListeners();

        // Add datalist for file suggestions
        updateLogSettingsFileList();

    } catch (error) {
        UIUtils.showToast('Failed to load log settings', 'error');
        console.error('Error loading log settings:', error);
    }
}

/**
 * Create the content for the log settings modal
 * @param {Object} logSettings - Current log settings
 * @returns {string} Modal content HTML
 */
function createLogSettingsContent(logSettings) {
    // Set default values if needed
    const settings = {
        defaultLevel: 'info',
        fileLogLevels: {}
    };

    if (logSettings) {
        // Handle both possible API response formats
        if (logSettings.logLevel) settings.defaultLevel = logSettings.logLevel;
        else if (logSettings.defaultLevel) settings.defaultLevel = logSettings.defaultLevel;
        
        if (logSettings.fileLogLevels) settings.fileLogLevels = logSettings.fileLogLevels;
    }

    const logLevels = ['error', 'warn', 'info', 'debug', 'fine', 'finest'];

    // Build HTML content directly using template strings
    let html = `
        <div class="log-settings-content">
            <form id="log-settings-form">
                <div class="form-group">
                    <label for="default-log-level">Default Log Level:</label>
                    <select id="default-log-level" name="defaultLevel">
    `;

    // Add options for log levels
    logLevels.forEach(level => {
        const selected = level === settings.defaultLevel ? 'selected' : '';
        const levelCapitalized = level.charAt(0).toUpperCase() + level.slice(1);
        html += `<option value="${level}" ${selected}>${levelCapitalized}</option>`;
    });

    html += `
                    </select>
                    <p class="form-description">
                        <strong>Log Level Hierarchy:</strong><br>
                        <span class="log-level-item log-error">ERROR</span> → 
                        <span class="log-level-item log-warning">WARN</span> → 
                        <span class="log-level-item log-info">INFO</span> → 
                        <span class="log-level-item log-debug">DEBUG</span> → 
                        <span class="log-level-item log-fine">FINE</span> → 
                        <span class="log-level-item log-finest">FINEST</span><br>
                        <small>Setting a level will include that level and all levels to its left.</small>
                    </p>
                </div>
                
                <div class="form-group">
                    <div class="form-group-header">
                        <h3>File-Specific Log Levels</h3>
                        <div class="button-group">
                            <button id="auto-suggest-button" type="button" class="button button-secondary">
                                <i class="fas fa-magic"></i> Auto-Suggest
                            </button>
                            <button id="add-file-button" type="button" class="button button-secondary">
                                <i class="fas fa-plus"></i> Add File
                            </button>
                        </div>
                    </div>
                    
                    <div id="file-log-levels-container">
    `;

    // Add existing file log levels
    if (settings.fileLogLevels) {
        Object.entries(settings.fileLogLevels).forEach(([filename, level]) => {
            html += createFileLogLevelRowHTML(filename, level, logLevels);
        });
    }

    html += `
                    </div>
                </div>
                
                <div class="form-actions">
                    <button type="submit" class="button button-primary">Save Settings</button>
                </div>
            </form>
        </div>
    `;

    return html;
}

/**
 * Create HTML for a file log level row
 * @param {string} filename - Filename
 * @param {string} level - Current level
 * @param {Array} logLevels - Available log levels
 * @returns {string} Row HTML
 */
function createFileLogLevelRowHTML(filename, level, logLevels) {
    let html = `
        <div class="file-log-level-row">
            <input type="text" name="filename[]" value="${UIUtils.escapeAttr(filename || '')}" required list="known-files">
            <select name="level[]">
    `;

    logLevels.forEach(logLevel => {
        const selected = logLevel === level ? 'selected' : '';
        const levelCapitalized = logLevel.charAt(0).toUpperCase() + logLevel.slice(1);
        html += `<option value="${logLevel}" ${selected}>${levelCapitalized}</option>`;
    });

    html += `
            </select>
            <button type="button" class="button button-danger remove-file-button">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `;

    return html;
}

/**
 * Add a new file log level row
 */
function addFileLogLevel() {
    const container = document.getElementById('file-log-levels-container');
    const logLevels = ['error', 'warn', 'info', 'debug', 'fine', 'finest'];

    // Create new row HTML and append it
    const rowHtml = createFileLogLevelRowHTML('', 'info', logLevels);
    container.insertAdjacentHTML('beforeend', rowHtml);

    // Add event listener to the newly added remove button
    const newRow = container.lastElementChild;
    const removeButton = newRow.querySelector('.remove-file-button');
    if (removeButton) {
        removeButton.addEventListener('click', function () {
            this.closest('.file-log-level-row').remove();
        });
    }
}

/**
 * Auto-suggest files based on current logs
 */
function autoSuggestFiles() {
    // Only proceed if we have logs with filenames
    if (logsState.uniqueFiles.size === 0) {
        UIUtils.showToast('No files found in logs to suggest', 'warning');
        return;
    }

    const container = document.getElementById('file-log-levels-container');
    const logLevels = ['error', 'warn', 'info', 'debug', 'fine', 'finest'];

    // Get existing filenames to avoid duplicates
    const existingFilenames = new Set();
    const filenameInputs = container.querySelectorAll('input[name="filename[]"]');
    filenameInputs.forEach(input => {
        if (input.value.trim()) {
            existingFilenames.add(input.value.trim());
        }
    });

    // Track files by their normalized names (just the filename without path or extension)
    // but store only the full paths
    const normalizedFiles = new Map();
    const baseNameToFullPath = new Map();
    
    // First pass: collect all full paths and their base names
    Array.from(logsState.uniqueFiles).forEach(fullPath => {
        const baseName = getBaseName(fullPath);
        baseNameToFullPath.set(baseName, fullPath);
    });
    
    // Only use full paths from baseNameToFullPath
    const uniqueFullPaths = Array.from(baseNameToFullPath.values()).filter(path => {
        // Skip if already in the existing list
        return !existingFilenames.has(path);
    });

    // Add rows for full paths
    let added = 0;

    // Sort files alphabetically
    uniqueFullPaths.sort();
    
    uniqueFullPaths.forEach(filename => {
        // Add with reasonable default level based on file type
        let defaultLevel = 'info';

        if (filename.includes('wrapper') || filename.includes('utils')) {
            defaultLevel = 'debug';  // More detailed for utility files
        }

        if (filename.includes('openssl-wrapper')) {
            defaultLevel = 'fine';  // Special case for OpenSSL wrapper
        }

        // Use the HTML version instead of the DOM version
        const rowHtml = createFileLogLevelRowHTML(filename, defaultLevel, logLevels);
        container.insertAdjacentHTML('beforeend', rowHtml);

        // Get the newly added row and set up its remove button
        const newRow = container.lastElementChild;
        const removeButton = newRow.querySelector('.remove-file-button');
        if (removeButton) {
            removeButton.addEventListener('click', function () {
                this.closest('.file-log-level-row').remove();
            });
        }

        added++;
    });

    if (added > 0) {
        UIUtils.showToast(`Added ${added} files from logs`);
    } else {
        UIUtils.showToast('All files from logs were already added', 'info');
    }
}

/**
 * Get the base name from a file path
 * @param {string} filename - The filename or path
 * @returns {string} The base name without directory or extension
 */
function getBaseName(filename) {
    // Extract just the filename if it contains a path
    const parts = filename.split('/').pop().split('\\').pop();
    
    // Remove extension
    return parts.replace(/\.[^/.]+$/, "");
}

/**
 * Update the list of available files in the log settings modal
 */
function updateLogSettingsFileList() {
    // Check if log settings modal is open
    const modal = document.getElementById('log-settings-modal');
    if (!modal) return;

    // Create or find the datalist for file suggestions
    let datalist = document.getElementById('known-files');
    if (!datalist) {
        datalist = document.createElement('datalist');
        datalist.id = 'known-files';
        modal.appendChild(datalist);
    } else {
        // Clear existing options
        datalist.innerHTML = '';
    }

    // Track files by their normalized names (just the filename without path or extension)
    // but only add the full paths to the datalist
    const baseNameToFullPath = new Map();
    
    // Collect all full paths and their base names
    Array.from(logsState.uniqueFiles).forEach(fullPath => {
        const baseName = getBaseName(fullPath);
        baseNameToFullPath.set(baseName, fullPath);
    });
    
    // Only use the full paths from baseNameToFullPath
    const uniqueFullPaths = Array.from(baseNameToFullPath.values()).sort();

    // Add options for each unique full path
    uniqueFullPaths.forEach(filename => {
        const option = document.createElement('option');
        option.value = filename;
        datalist.appendChild(option);
    });
}

/**
 * Save log settings
 * @param {Event} event - Form submit event
 */
async function saveLogSettings(event) {
    event.preventDefault();

    const saveButton = event.submitter;
    saveButton.disabled = true;
    saveButton.textContent = 'Saving...';

    try {
        // Get form data
        const form = event.target;
        const defaultLevel = form.querySelector('#default-log-level').value;

        // Get file log levels
        const fileLogLevels = {};
        const filenames = Array.from(form.querySelectorAll('input[name="filename[]"]'));
        const levels = Array.from(form.querySelectorAll('select[name="level[]"]'));

        filenames.forEach((filenameInput, index) => {
            const filename = filenameInput.value.trim();
            if (filename) {
                fileLogLevels[filename] = levels[index].value;
            }
        });

        // Create the settings object with property names that match the API
        const logSettings = {
            logLevel: defaultLevel,
            fileLogLevels
        };

        // Use PUT method as implemented in the API
        const response = await fetch('/api/settings/logging', {
            method: 'PUT',  // Changed from POST to PUT
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(logSettings)
        });

        if (!response.ok) {
            throw new Error(`Failed to save log settings: ${response.status}`);
        }

        // Update the UI to reflect the new settings
        UIUtils.showToast('Log settings saved successfully');

        // Close modal
        UIUtils.closeModal('log-settings-modal');

        // Reload logs to see the effect
        loadSystemLogs();
    } catch (error) {
        UIUtils.showToast('Error saving log settings', 'error');
        console.error('Error saving log settings:', error);
    } finally {
        saveButton.disabled = false;
        saveButton.textContent = 'Save Settings';
    }
}

/**
 * Debug function to check the consistency of log entries
 * Helps identify any logs with missing required properties
 */
function debugCheckLogs() {
    if (!logsState.logs || !logsState.logs.length) {
        console.log('No logs to check');
        return;
    }

    const problemLogs = logsState.logs.filter(log =>
        !log.level || !log.timestamp || !log.message
    );

    if (problemLogs.length > 0) {
        console.warn(`Found ${problemLogs.length} logs with missing properties:`, problemLogs);
    } else {
        console.log(`All ${logsState.logs.length} logs have required properties`);
    }
}

/**
 * Add event listeners for remove buttons in log settings
 */
function setupLogSettingsEventListeners() {
    // This runs after the modal is created and in the DOM
    // Add event listeners to all remove buttons
    document.querySelectorAll('.remove-file-button').forEach(button => {
        button.addEventListener('click', function () {
            this.closest('.file-log-level-row').remove();
        });
    });
}

/**
 * Update pagination controls and information
 */
function updatePagination() {
    const { filteredLogs, page, perPage } = logsState;
    const totalLogs = filteredLogs.length;
    const totalPages = Math.ceil(totalLogs / perPage);

    // If there are no pagination controls needed, return early
    if (totalPages <= 1) {
        return;
    }

    // Calculate current page start and end indices
    const startIndex = (page - 1) * perPage;
    const endIndex = Math.min(startIndex + perPage, totalLogs);

    // Create pagination HTML
    const paginationHtml = UIUtils.safeTemplate(`
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
        end: endIndex,
        total: totalLogs,
        currentPage: page,
        totalPages,
        prevDisabled: page <= 1 ? 'disabled' : '',
        nextDisabled: page >= totalPages ? 'disabled' : ''
    });

    // Find or create pagination container
    let paginationContainer = document.querySelector('.logs-output .pagination');
    if (!paginationContainer) {
        // Append to logs-output
        document.getElementById('logs-output').insertAdjacentHTML('beforeend', paginationHtml);
        paginationContainer = document.querySelector('.logs-output .pagination');
    } else {
        // Update existing pagination
        paginationContainer.outerHTML = paginationHtml;
    }

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

// Init on DOM load
window.addEventListener('DOMContentLoaded', () => {
    initLogsSystem();
});

// Export functions to global scope
window.loadSystemLogs = loadSystemLogs;
window.showLogSettingsModal = showLogSettingsModal;
window.filterLogs = filterLogs;
window.clearLogsView = clearLogsView;
window.exportLogs = exportLogs;
window.updatePagination = updatePagination;