/**
 * UI utility functions for Certificate Manager
 */

/**
 * Show a confirmation dialog
 * @param {Object} options - Dialog options
 * @returns {Promise<boolean>} User's choice
 */
function confirm(options = {}) {
    const defaults = {
        title: 'Confirm',
        message: 'Are you sure?',
        confirmText: 'Yes',
        cancelText: 'No',
        type: 'warning' // warning, danger, info
    };
    
    const settings = {...defaults, ...options};
    
    return new Promise((resolve) => {
        // Create confirm dialog HTML
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        
        dialog.innerHTML = `
            <div class="confirm-content">
                <h3><i class="fas fa-exclamation-triangle"></i> ${settings.title}</h3>
                <p>${settings.message}</p>
                <div class="button-group">
                    <button class="secondary-btn" id="cancel-btn">${settings.cancelText}</button>
                    <button class="primary-btn ${settings.type}-btn" id="confirm-btn">${settings.confirmText}</button>
                </div>
            </div>
        `;
        
        // Add to document
        document.body.appendChild(dialog);
        
        // Add event handlers
        const confirmBtn = dialog.querySelector('#confirm-btn');
        const cancelBtn = dialog.querySelector('#cancel-btn');
        
        confirmBtn.addEventListener('click', () => {
            document.body.removeChild(dialog);
            resolve(true);
        });
        
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(dialog);
            resolve(false);
        });
    });
}

/**
 * Show a notification
 * @param {string} message - Message to display
 * @param {string} type - Type of notification (info, success, warning, error)
 * @param {number} duration - How long to show the notification in ms
 */
function notify(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    const icon = getIconForType(type);
    
    notification.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;
    
    // Create notifications container if it doesn't exist
    let container = document.getElementById('notifications-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notifications-container';
        document.body.appendChild(container);
    }
    
    // Add to container
    container.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.classList.add('visible');
    }, 10);
    
    // Remove after duration
    setTimeout(() => {
        notification.classList.remove('visible');
        setTimeout(() => {
            container.removeChild(notification);
        }, 300); // Match the CSS transition time
    }, duration);
}

/**
 * Set up event delegation for a container element
 * @param {HTMLElement|string} container - Container element or selector
 * @param {string} selector - CSS selector for target elements
 * @param {string} eventType - Type of event to listen for
 * @param {Function} callback - Callback function (receives event and matched element)
 * @returns {Function} Cleanup function that removes the event listener
 */
function delegateEvent(container, selector, eventType, callback) {
    // Get container element if string was provided
    const containerElement = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;
    
    if (!containerElement) {
        console.error(`Container not found: ${container}`);
        return () => {};
    }
    
    // The event handler that implements delegation
    const handler = (event) => {
        // Find the target element that matches the selector, starting from event.target
        // and working up through parents until reaching the container
        let targetElement = event.target;
        
        while (targetElement && targetElement !== containerElement) {
            if (targetElement.matches(selector)) {
                // Call the callback with the event and matched element
                callback(event, targetElement);
                return;
            }
            targetElement = targetElement.parentElement;
        }
    };
    
    // Attach the handler to the container
    containerElement.addEventListener(eventType, handler);
    
    // Return a cleanup function
    return () => {
        containerElement.removeEventListener(eventType, handler);
    };
}

/**
 * Add event handlers to dynamically created content using event delegation
 * @param {Object} handlers - Object mapping selectors to event handlers
 * @param {HTMLElement|string} container - Container element or selector (defaults to document.body)
 */
function setupDelegatedEvents(handlers, container = document.body) {
    const containerElement = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;
        
    if (!containerElement) {
        console.error(`Container not found: ${container}`);
        return;
    }
    
    // Store cleanup functions
    const cleanupFunctions = [];
    
    // Process each handler definition
    for (const [selector, handlerConfig] of Object.entries(handlers)) {
        for (const [eventType, callback] of Object.entries(handlerConfig)) {
            const cleanup = delegateEvent(containerElement, selector, eventType, callback);
            cleanupFunctions.push(cleanup);
        }
    }
    
    // Return function that removes all event listeners
    return () => {
        cleanupFunctions.forEach(cleanup => cleanup());
    };
}

// Helper function to get icon for notification type
function getIconForType(type) {
    switch (type) {
        case 'success': return 'fas fa-check-circle';
        case 'warning': return 'fas fa-exclamation-triangle';
        case 'error': return 'fas fa-times-circle';
        default: return 'fas fa-info-circle'; // info
    }
}

/**
 * Set up tab switching in a container
 * @param {HTMLElement} container - Container element with tabs
 * @returns {Function} Function to switch to a specific tab
 */
function setupTabs(container) {
    if (!container) {
        console.error('No container provided for setupTabs');
        return null;
    }
    
    const tabButtons = container.querySelectorAll('.tab-btn');
    const tabContents = container.querySelectorAll('.tab-content');
    
    if (!tabButtons.length || !tabContents.length) {
        console.warn('No tabs found in container');
        return null;
    }
    
    console.log(`Setting up ${tabButtons.length} tabs in container`);
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            tabButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.style.borderBottom = '3px solid transparent';
                btn.style.color = '#333';
            });
            
            // Add active class to clicked button
            button.classList.add('active');
            button.style.borderBottom = '3px solid #0078d7';
            button.style.color = '#0078d7';
            
            // Hide all tab contents
            tabContents.forEach(content => {
                content.style.display = 'none';
            });
            
            // Show the selected tab content
            const tabName = button.getAttribute('data-tab');
            const selectedTab = container.querySelector(`#${tabName}-tab`);
            if (selectedTab) {
                selectedTab.style.display = 'block';
                
                // Trigger a custom event that other components can listen for
                const tabChangeEvent = new CustomEvent('tabchange', {
                    detail: { tabName }
                });
                container.dispatchEvent(tabChangeEvent);
            }
        });
    });
    
    // Return a function that can be used to switch to a specific tab
    return function switchToTab(tabName) {
        const tabBtn = container.querySelector(`.tab-btn[data-tab="${tabName}"]`);
        if (tabBtn) {
            tabBtn.click();
            return true;
        }
        return false;
    };
}

/**
 * Show a toast notification
 * @param {string} message - Message to display
 * @param {string} type - Notification type (success, error, warning, info)
 * @param {number} duration - How long to show the notification in ms
 */
function showNotification(message, type = 'info', duration = 5000) {
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
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
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
    notification.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
    notification.style.transform = 'translateX(100%)';
    notification.style.opacity = '0';
    
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
    
    // Add to container
    container.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
        notification.style.opacity = '1';
    }, 10);
    
    // Set up close button
    notification.querySelector('.close-notification').addEventListener('click', () => {
        closeNotification(notification);
    });
    
    // Auto close after duration
    setTimeout(() => {
        closeNotification(notification);
    }, duration);
    
    function closeNotification(element) {
        // Animate out
        element.style.transform = 'translateX(100%)';
        element.style.opacity = '0';
        
        // Remove after animation
        setTimeout(() => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
                
                // Remove container if empty
                if (container.children.length === 0) {
                    document.body.removeChild(container);
                }
            }
        }, 300);
    }
}

/**
 * Create a confirmation dialog
 * @param {string} message - Message to display
 * @param {Object} options - Dialog options
 * @returns {Promise} Resolves with true if confirmed, false otherwise
 */
function showConfirm(message, options = {}) {
    return new Promise((resolve) => {
        const defaults = {
            title: 'Confirm',
            confirmText: 'OK',
            cancelText: 'Cancel',
            type: 'question'
        };
        
        const settings = {...defaults, ...options};
        
        // Create modal element
        const modal = document.createElement('div');
        modal.className = 'confirm-modal';
        modal.style.position = 'fixed';
        modal.style.zIndex = '9999';
        modal.style.left = '0';
        modal.style.top = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.overflow = 'auto';
        modal.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        
        // Get icon based on type
        const icon = settings.type === 'warning' ? 'fa-exclamation-triangle' :
                    settings.type === 'error' ? 'fa-exclamation-circle' :
                    settings.type === 'info' ? 'fa-info-circle' : 'fa-question-circle';
        
        const iconColor = settings.type === 'warning' ? '#856404' :
                         settings.type === 'error' ? '#721c24' :
                         settings.type === 'info' ? '#0c5460' : '#0078d7';
        
        // Create modal content
        modal.innerHTML = `
            <div style="background-color: #fff; border-radius: 8px; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2); width: 90%; max-width: 400px; padding: 20px;">
                <div style="display: flex; align-items: center; margin-bottom: 15px;">
                    <i class="fas ${icon}" style="font-size: 24px; margin-right: 15px; color: ${iconColor};"></i>
                    <h3 style="margin: 0;">${settings.title}</h3>
                </div>
                
                <div style="margin-bottom: 20px;">
                    ${message}
                </div>
                
                <div style="display: flex; justify-content: flex-end; gap: 10px;">
                    <button id="cancel-btn" style="padding: 8px 16px; background-color: #f0f0f0; color: #333; border: none; border-radius: 4px; cursor: pointer;">
                        ${settings.cancelText}
                    </button>
                    <button id="confirm-btn" style="padding: 8px 16px; background-color: #0078d7; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        ${settings.confirmText}
                    </button>
                </div>
            </div>
        `;
        
        // Add to document
        document.body.appendChild(modal);
        
        // Set up button handlers
        modal.querySelector('#cancel-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(false);
        });
        
        modal.querySelector('#confirm-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
            resolve(true);
        });
        
        // Allow closing by clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
                resolve(false);
            }
        });
        
        // Allow closing with ESC key
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                document.body.removeChild(modal);
                document.removeEventListener('keydown', escHandler);
                resolve(false);
            }
        });
    });
}

// Make utilities available globally
if (typeof window !== 'undefined') {
    window.uiUtils = {
        confirm,
        notify,
        delegateEvent,
        setupDelegatedEvents,
        setupTabs,
        showNotification,
        showConfirm
    };
    console.log('UI utilities registered in window object');
}