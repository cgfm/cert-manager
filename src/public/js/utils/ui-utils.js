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


// Make utilities available globally
if (typeof window !== 'undefined') {
    window.uiUtils = {
        confirm,
        notify,
        delegateEvent,
        setupDelegatedEvents,
        setupTabs
    };
    console.log('UI utilities registered in window object');
}