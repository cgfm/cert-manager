/**
 * Logs Viewer Module
 * This module provides a UI for viewing system logs in a modal.
 * It allows filtering logs by level and downloading the full log file.
 * It uses the Fetch API to communicate with the server and update the UI accordingly.
 * @module logs-viewer - Logs Viewer Module
 * @requires logger - Logger utility for logging messages
 * @requires modalUtils - Utility functions for modal handling
 * @requires fetch - Fetch API for network requests
 * @requires document - DOM manipulation
 * @requires console - Console for logging messages
 * @requires window - Global object for accessing browser APIs
 * @license MIT
 * @version 1.0.0
 * @description This module provides a UI for viewing system logs in a modal. It allows filtering logs by level and downloading the full log file. It uses the Fetch API to communicate with the server and update the UI accordingly.
 */

// Initialize logs viewing functionality
function initLogsViewer() {
    // Add logs button to header
    const header = document.querySelector('header');
    if (header) {
        const buttonContainer = header.querySelector('.header-buttons') || document.createElement('div');
        if (!buttonContainer.className.includes('header-buttons')) {
            buttonContainer.className = 'header-buttons';
            header.appendChild(buttonContainer);
        }
        
        // Add logs button if it doesn't exist
        if (!document.getElementById('viewLogsBtn')) {
            const logsBtn = document.createElement('button');
            logsBtn.id = 'viewLogsBtn';
            logsBtn.innerHTML = '<i class="fas fa-list-alt"></i> View Logs';
            logsBtn.addEventListener('click', showLogsModal);
            buttonContainer.appendChild(logsBtn);
        }
    }
}

// Create and show the logs modal
async function showLogsModal() {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal logs-modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close">&times;</span>
            <h2><i class="fas fa-list-alt"></i> System Logs</h2>
            
            <div class="logs-filters">
                <div class="form-group">
                    <label for="logLevel">Log Level:</label>
                    <select id="logLevel">
                        <option value="">All Levels</option>
                        <option value="debug">Debug</option>
                        <option value="info">Info</option>
                        <option value="warn">Warning</option>
                        <option value="error">Error</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label for="logLimit">Entries:</label>
                    <select id="logLimit">
                        <option value="50">50 entries</option>
                        <option value="100" selected>100 entries</option>
                        <option value="200">200 entries</option>
                        <option value="500">500 entries</option>
                    </select>
                </div>
                
                <button id="refreshLogsBtn" class="refresh-btn">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
                
                <button id="downloadLogsBtn" class="download-btn">
                    <i class="fas fa-download"></i> Download Full Log
                </button>
            </div>
            
            <div class="logs-container">
                <div id="logsTable" class="logs-table">
                    <div class="logs-header">
                        <div class="log-time">Time</div>
                        <div class="log-level">Level</div>
                        <div class="log-message">Message</div>
                    </div>
                    <div id="logsContent" class="logs-content">
                        <p><i class="fas fa-spinner fa-spin"></i> Loading logs...</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add log viewing styles
    addLogViewingStyles();
    
    // Setup event handlers
    setupLogsModalEventHandlers(modal);
    
    // Prevent scroll propagation
    preventScrollPropagation();
    
    // Load initial logs
    loadLogs();
}

// Add CSS for logs viewing
function addLogViewingStyles() {
    if (!document.getElementById('logs-viewer-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'logs-viewer-styles';
        styleSheet.innerHTML = `
            .logs-modal .modal-content {
                max-width: 900px;
                width: 90%;
                max-height: 90vh;
                display: flex;
                flex-direction: column;
                overflow: hidden; /* Prevent content from overflowing */
            }
            
            .logs-filters {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                gap: 10px;
                margin-bottom: 15px;
                padding-bottom: 10px;
                border-bottom: 1px solid var(--border-color, #ddd);
            }
            
            .logs-filters .form-group {
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .logs-filters select {
                padding: 5px;
                border-radius: 4px;
                border: 1px solid var(--border-color, #ddd);
            }
            
            .refresh-btn, .download-btn {
                padding: 5px 10px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                background-color: var(--primary-color, #3a86ff);
                color: white;
                margin-left: auto;
            }
            
            .download-btn {
                background-color: var(--success-color, #28a745);
            }
            
            .logs-container {
                flex: 1;
                overflow: hidden;
                position: relative;
                display: flex;
                flex-direction: column;
            }
            
            .logs-table {
                display: flex;
                flex-direction: column;
                height: 100%;
                border: 1px solid var(--border-color, #ddd);
                border-radius: 4px;
                overflow: hidden; /* Prevent content from overflowing */
            }
            
            .logs-header {
                display: flex;
                padding: 10px;
                font-weight: bold;
                background-color: var(--hover-color, #f5f5f5);
                border-bottom: 1px solid var(--border-color, #ddd);
                flex-shrink: 0; /* Prevent header from shrinking */
            }
            
            .logs-content {
                flex: 1;
                overflow-y: auto; /* Enable vertical scrolling */
                overflow-x: hidden; /* Hide horizontal overflow */
                padding: 0;
                font-family: monospace;
                font-size: 12px;
                min-height: 400px;
                max-height: calc(90vh - 200px); /* Limit the height */
                overscroll-behavior: contain; /* Important: prevent scroll chaining */
            }
            
            .log-entry {
                display: flex;
                padding: 5px 10px;
                border-bottom: 1px solid var(--border-color, #eee);
            }
            
            .log-entry:nth-child(odd) {
                background-color: var(--hover-color, #f8f9fa);
            }
            
            .log-entry:hover {
                background-color: var(--hover-color, #f0f0f0);
            }
            
            .log-time {
                width: 200px;
                flex-shrink: 0;
            }
            
            .log-level {
                width: 80px;
                flex-shrink: 0;
            }
            
            .log-message {
                flex: 1;
                word-break: break-word;
                white-space: pre-wrap;
            }
            
            .log-debug { color: #6c757d; }
            .log-info { color: #17a2b8; }
            .log-warn { color: #ffc107; }
            .log-error { color: #dc3545; }
            
            /* Expanded view for log details */
            .log-details {
                background-color: #f8f9fa;
                border: 1px solid #eee;
                padding: 10px;
                margin: 5px 0 5px 20px;
                border-radius: 4px;
                white-space: pre-wrap;
                font-family: monospace;
                font-size: 11px;
            }
        `;
        document.head.appendChild(styleSheet);
    }
}

// Setup event handlers for the logs modal
function setupLogsModalEventHandlers(modal) {
    // Close button
    modal.querySelector('.close').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    // Refresh button
    modal.querySelector('#refreshLogsBtn').addEventListener('click', () => {
        loadLogs();
    });
    
    // Download button
    modal.querySelector('#downloadLogsBtn').addEventListener('click', () => {
        window.open('/api/logs/file', '_blank');
    });
    
    // Filter changes
    modal.querySelector('#logLevel').addEventListener('change', loadLogs);
    modal.querySelector('#logLimit').addEventListener('change', loadLogs);
}

// Load logs from the server
async function loadLogs() {
    const logsContent = document.getElementById('logsContent');
    logsContent.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Loading logs...</p>';
    
    try {
        // Get filter values
        const level = document.getElementById('logLevel').value;
        const limit = document.getElementById('logLimit').value;
        
        // Build query parameters
        const params = new URLSearchParams();
        if (level) params.append('level', level);
        if (limit) params.append('limit', limit);
        
        // Fetch logs
        const response = await fetch(`/api/logs?${params.toString()}`);
        const data = await response.json();
        
        if (!data.success) {
            throw new Error(data.error || 'Error loading logs');
        }
        
        if (!data.logs || data.logs.length === 0) {
            logsContent.innerHTML = '<p class="no-logs">No logs found matching the criteria</p>';
            return;
        }
        
        // Render logs
        let logsHtml = '';
        data.logs.forEach(log => {
            const timestamp = new Date(log.timestamp).toLocaleString();
            logsHtml += `
                <div class="log-entry" data-level="${log.level}">
                    <div class="log-time">${timestamp}</div>
                    <div class="log-level log-${log.level}">${log.level.toUpperCase()}</div>
                    <div class="log-message">${escapeHtml(log.message)}
                        ${log.details ? 
                            `<div class="log-details">${escapeHtml(JSON.stringify(log.details, null, 2))}</div>` : 
                            ''}
                    </div>
                </div>
            `;
        });
        
        logsContent.innerHTML = logsHtml;
        
        // Scroll to bottom to show latest logs
        logsContent.scrollTop = logsContent.scrollHeight;
        
        // Apply scroll prevention again after content is updated
        preventScrollPropagation();
        
    } catch (error) {
        logger.error('Error loading logs:', error);
        logsContent.innerHTML = `
            <p class="error-message">
                <i class="fas fa-exclamation-triangle"></i> 
                Error loading logs: ${error.message}
            </p>
        `;
    }
}

// Helper function to escape HTML
function escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Prevent scroll propagation from the logs content to the modal and page
function preventScrollPropagation() {
    const logsContent = document.querySelector('.logs-content');
    if (logsContent) {
        logsContent.addEventListener('wheel', function(event) {
            // If the content is at the top and scrolling up, or at the bottom and scrolling down,
            // prevent default to avoid scrolling the parent
            const scrollTop = this.scrollTop;
            const scrollHeight = this.scrollHeight;
            const clientHeight = this.clientHeight;
            
            // If scrolling up and already at the top
            if (scrollTop <= 0 && event.deltaY < 0) {
                event.preventDefault();
            }
            
            // If scrolling down and already at the bottom
            if (scrollTop + clientHeight >= scrollHeight && event.deltaY > 0) {
                event.preventDefault();
            }
        }, { passive: false });
    }
}

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', initLogsViewer);