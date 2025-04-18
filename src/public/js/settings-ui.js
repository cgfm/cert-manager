/**
 * Scheduler Settings UI Script
 * This script handles the loading, saving, and UI interactions for the scheduler settings.
 * It uses the Fetch API to communicate with the server and update the UI accordingly.
 * @module scheduler-settings-ui
 * @requires logger - Logger utility for debugging
 * @requires modalUtils - Utility for showing notifications and modals
 * @requires fetch - Fetch API for making HTTP requests
 * @requires document - DOM manipulation
 * @requires window - Global object for accessing browser APIs
 * @license MIT
 * @version 1.0.0
 * @author Christian Meiners
 * @description This script is part of the Certify The Web application and is responsible for managing the scheduler settings UI.	
 */

/**
 * Load scheduler settings from the server
 */
function loadSchedulerSettings() {
    fetch('/api/scheduler/status')
        .then(response => response.json())
        .then(data => {
            // Update UI elements
            const enableCheckbox = document.getElementById('enableAutoRenewalJob');
            const scheduleInput = document.getElementById('renewalSchedule');
            const lastCheckStatus = document.getElementById('lastCheckStatus');
            const scheduleSettingsGroup = document.getElementById('scheduleSettingsGroup');
            
            if (enableCheckbox) {
                enableCheckbox.checked = data.enabled;
                
                // Show/hide schedule settings based on enabled state
                if (scheduleSettingsGroup) {
                    scheduleSettingsGroup.style.display = data.enabled ? 'block' : 'none';
                }
            }
            
            if (scheduleInput) {
                scheduleInput.value = data.schedule || '0 0 * * *';
            }
            
            if (lastCheckStatus) {
                if (data.lastRun) {
                    const lastRunDate = new Date(data.lastRun);
                    lastCheckStatus.textContent = `Last check: ${lastRunDate.toLocaleString()}`;
                } else {
                    lastCheckStatus.textContent = 'Last check: Never';
                }
            }
            
            // Display next execution info if available
            if (data.nextExecution && data.nextExecution.message) {
                const nextExecInfo = document.getElementById('nextExecutionInfo');
                if (nextExecInfo) {
                    nextExecInfo.textContent = data.nextExecution.message;
                    nextExecInfo.style.display = data.enabled ? 'block' : 'none';
                }
            }
        })
        .catch(error => {
            logger.error('Error loading scheduler settings:', error);
            window.modalUtils.showNotification('Error loading scheduler settings', 'error');
        });
}

/**
 * Save scheduler settings to the server
 */
function saveSchedulerSettings() {
    const enableAutoRenewalJob = document.getElementById('enableAutoRenewalJob').checked;
    const renewalSchedule = document.getElementById('renewalSchedule').value.trim();
    
    // Validate cron expression using regex
    const cronRegex = /^(\*|([0-9]|1[0-9]|2[0-9]|3[0-9]|4[0-9]|5[0-9])) (\*|([0-9]|1[0-9]|2[0-3])) (\*|([1-9]|1[0-9]|2[0-9]|3[0-1])) (\*|([1-9]|1[0-2])) (\*|([0-6]))$/;
    
    if (enableAutoRenewalJob && !cronRegex.test(renewalSchedule)) {
        window.modalUtils.showNotification('Invalid cron schedule format', 'error');
        return false;
    }
    
    // Send to server
    fetch('/api/scheduler/settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            enableAutoRenewalJob,
            renewalSchedule
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            window.modalUtils.showNotification('Scheduler settings saved', 'success');
            loadSchedulerSettings(); // Reload to get latest status
            return true;
        } else {
            window.modalUtils.showNotification(`Error: ${data.message}`, 'error');
            return false;
        }
    })
    .catch(error => {
        logger.error('Error saving scheduler settings:', error);
        window.modalUtils.showNotification('Error saving scheduler settings', 'error');
        return false;
    });
}

/**
 * Initialize scheduler settings UI elements
 */
function initSchedulerSettings() {
    // Load initial settings
    loadSchedulerSettings();
    
    // Toggle schedule settings visibility based on enabled state
    const enableCheckbox = document.getElementById('enableAutoRenewalJob');
    const scheduleSettingsGroup = document.getElementById('scheduleSettingsGroup');
    
    if (enableCheckbox && scheduleSettingsGroup) {
        enableCheckbox.addEventListener('change', () => {
            scheduleSettingsGroup.style.display = enableCheckbox.checked ? 'block' : 'none';
        });
    }
    
    // Setup preset schedule dropdown
    const presetItems = document.querySelectorAll('[data-schedule]');
    const scheduleInput = document.getElementById('renewalSchedule');
    
    if (presetItems && scheduleInput) {
        presetItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const schedule = item.getAttribute('data-schedule');
                scheduleInput.value = schedule;
            });
        });
    }
    
    // Setup manual check button
    const manualCheckBtn = document.getElementById('runManualCheck');
    
    if (manualCheckBtn) {
        manualCheckBtn.addEventListener('click', () => {
            // Show loading state
            const originalText = manualCheckBtn.innerHTML;
            manualCheckBtn.innerHTML = '<i class="fas fa-spin fa-spinner"></i> Running...';
            manualCheckBtn.disabled = true;
            
            // Call API
            fetch('/api/scheduler/run', {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                // Reset button state
                manualCheckBtn.innerHTML = originalText;
                manualCheckBtn.disabled = false;
                
                if (data.success) {
                    window.modalUtils.showNotification('Manual renewal check completed', 'success');
                    loadSchedulerSettings(); // Reload to update last check time
                } else {
                    window.modalUtils.showNotification(`Error: ${data.error}`, 'error');
                }
            })
            .catch(error => {
                logger.error('Error running manual check:', error);
                window.modalUtils.showNotification('Error running manual check', 'error');
                
                // Reset button state
                manualCheckBtn.innerHTML = originalText;
                manualCheckBtn.disabled = false;
            });
        });
    }
}

// Add to document ready handler or initial setup
document.addEventListener('DOMContentLoaded', () => {
    // ... other initializations
    initSchedulerSettings();
});