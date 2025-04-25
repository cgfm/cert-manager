/**
 * UI Utilities
 * Common UI helper functions
 */
const UIUtils = {
  /**
   * Show loading state in a container
   * @param {string} containerId - ID of container element
   * @param {string} message - Optional loading message
   */
  showLoading: function(containerId, message = 'Loading...') {
    const container = document.getElementById(containerId);
    if (container) {
      container.innerHTML = `<div class="loading">${message}</div>`;
    }
  },
  
  /**
   * Create a loading state element
   * @param {string} message - Loading message to display
   * @returns {HTMLElement} Loading state element
   */
  createLoadingState: function(message = 'Loading...') {
    const loadingState = document.createElement('div');
    loadingState.className = 'loading-state';
    
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    
    const loadingText = document.createElement('p');
    loadingText.className = 'loading-text';
    loadingText.textContent = message;
    
    loadingState.appendChild(spinner);
    loadingState.appendChild(loadingText);
    
    return loadingState;
  },
  
  /**
   * Create an empty state element
   * @param {string} title - Empty state title
   * @param {string} message - Empty state message
   * @param {string} icon - Icon to display (emoji or icon class)
   * @param {string} stateType - Type of empty state (for styling)
   * @param {string} actionText - Text for action button (optional)
   * @param {Function} actionFn - Function to call when action button is clicked (optional)
   * @returns {HTMLElement} Empty state element
   */
  createEmptyState: function(title, message, icon = '📂', stateType = '', actionText = '', actionFn = null) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    
    if (stateType) {
      emptyState.classList.add(stateType);
    }
    
    const iconElement = document.createElement('div');
    iconElement.className = 'empty-state-icon';
    
    // Check if icon is an emoji (starts with a non-letter) or icon class
    if (icon.match(/^[^a-zA-Z]/)) {
      iconElement.textContent = icon;
    } else {
      iconElement.innerHTML = `<i class="${icon}"></i>`;
    }
    
    const titleElement = document.createElement('h3');
    titleElement.className = 'empty-state-title';
    titleElement.textContent = title;
    
    const messageElement = document.createElement('p');
    messageElement.className = 'empty-state-message';
    messageElement.textContent = message;
    
    emptyState.appendChild(iconElement);
    emptyState.appendChild(titleElement);
    emptyState.appendChild(messageElement);
    
    // Add action button if provided
    if (actionText && actionFn) {
      const actionButton = document.createElement('button');
      actionButton.className = 'button primary empty-state-action';
      actionButton.textContent = actionText;
      actionButton.addEventListener('click', actionFn);
      
      emptyState.appendChild(actionButton);
    }
    
    return emptyState;
  },
  
  /**
   * Create an error state element
   * @param {string} title - Error title
   * @param {string} message - Error message
   * @param {Function} retryFn - Function to call when retry button is clicked (optional)
   * @returns {HTMLElement} Error state element
   */
  createErrorState: function(title, message, retryFn = null) {
    const errorState = document.createElement('div');
    errorState.className = 'error-state';
    
    const iconElement = document.createElement('div');
    iconElement.className = 'error-state-icon';
    iconElement.innerHTML = '⚠️'; // Warning emoji
    
    const titleElement = document.createElement('h3');
    titleElement.className = 'error-state-title';
    titleElement.textContent = title;
    
    const messageElement = document.createElement('p');
    messageElement.className = 'error-state-message';
    messageElement.textContent = message;
    
    errorState.appendChild(iconElement);
    errorState.appendChild(titleElement);
    errorState.appendChild(messageElement);
    
    // Add retry button if function provided
    if (retryFn) {
      const retryButton = document.createElement('button');
      retryButton.className = 'button primary error-state-retry';
      retryButton.textContent = 'Retry';
      retryButton.addEventListener('click', retryFn);
      
      errorState.appendChild(retryButton);
    }
    
    return errorState;
  },
  
  /**
   * Show a toast notification
   * @param {string} message - Notification message
   * @param {string} type - Notification type (success, error, info, warning)
   * @param {number} duration - Duration in ms
   */
  showToast: function(message, type = 'info', duration = 3000) {
    // Check if toast container exists, create if it doesn't
    let toastContainer = document.getElementById('toast-container');
    
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }
    
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    // Add to container
    toastContainer.appendChild(toast);
    
    // Show with animation
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);
    
    // Remove after duration
    setTimeout(() => {
      toast.classList.remove('show');
      toast.addEventListener('transitionend', () => {
        toast.remove();
      });
    }, duration);
  },
  
  /**
   * Show error message in a notification
   * @param {string} title - Error title
   * @param {Error|string} error - Error object or message
   */
  showError: function(title, error) {
    const message = error instanceof Error ? error.message : error;
    this.showNotification(title, message, 'error');
    
    // Log to console for debugging
    console.error(title, error);
  },
  
  /**
   * Show notification
   * @param {string} title - Notification title
   * @param {string} message - Notification message
   * @param {string} type - Notification type: 'success', 'error', 'warning', 'info'
   * @param {number} duration - Duration in milliseconds before auto-hiding
   */
  showNotification: function(title, message, type = 'info', duration = 5000) {
    const container = document.getElementById('notifications-container');
    if (!container) return;
    
    const id = 'notification-' + Date.now();
    
    // Use safeTemplate to prevent XSS
    const notificationHTML = this.safeTemplate(`
      <div id="\${id|attr}" class="notification \${type|attr}">
        <div class="notification-content">
          <h3 class="notification-title">\${title}</h3>
          <p class="notification-message">\${message}</p>
        </div>
        <button class="notification-close">&times;</button>
      </div>
    `, { id, type, title, message });
    
    container.insertAdjacentHTML('afterbegin', notificationHTML);
    
    const notification = document.getElementById(id);
    
    // Add event listener to close button
    const closeBtn = notification.querySelector('.notification-close');
    closeBtn.addEventListener('click', () => {
      this.removeNotification(notification);
    });
    
    // Auto-hide after duration
    if (duration > 0) {
      setTimeout(() => {
        if (notification.parentNode) {
          this.removeNotification(notification);
        }
      }, duration);
    }
    
    return notification;
  },
  
  /**
   * Remove a notification with animation
   * @param {HTMLElement} notification - The notification element
   */
  removeNotification: function(notification) {
    notification.classList.add('removing');
    
    notification.addEventListener('animationend', () => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    });
  },
  
  /**
   * Format bytes to human-readable string
   * @param {number} bytes - Size in bytes
   * @param {number} decimals - Decimal places
   * @returns {string} Formatted size string
   */
  formatBytes: function(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + ' ' + sizes[i];
  },
  
  /**
   * Format a file size in bytes to a human-readable string (alias of formatBytes)
   * @param {number} bytes - File size in bytes
   * @param {number} decimals - Number of decimal places
   * @returns {string} Formatted file size
   */
  formatFileSize: function(bytes, decimals = 2) {
    return this.formatBytes(bytes, decimals);
  },
  
  /**
   * Safely escape HTML to prevent XSS
   * @param {string} unsafe - String to escape
   * @returns {string} Escaped string
   */
  escapeHTML: function(unsafe) {
    if (!unsafe) return '';
    
    return unsafe
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },
  
  /**
   * Validate form inputs
   * @param {HTMLFormElement} form - The form element
   * @returns {boolean} True if valid
   */
  validateForm: function(form) {
    const inputs = form.querySelectorAll('input, select, textarea');
    let isValid = true;
    
    inputs.forEach(input => {
      if (input.hasAttribute('required') && !input.value.trim()) {
        this.showInputError(input, 'This field is required');
        isValid = false;
      } else if (input.type === 'email' && input.value && !this.isValidEmail(input.value)) {
        this.showInputError(input, 'Please enter a valid email address');
        isValid = false;
      } else {
        this.clearInputError(input);
      }
    });
    
    return isValid;
  },
  
  /**
   * Show error for input
   * @param {HTMLElement} input - Input element
   * @param {string} message - Error message
   */
  showInputError: function(input, message) {
    this.clearInputError(input);
    
    input.classList.add('error');
    const errorElement = document.createElement('div');
    errorElement.className = 'input-error';
    errorElement.textContent = message;
    
    // Insert after input or its parent for grouped elements
    const parent = input.closest('.form-group');
    if (parent) {
      parent.appendChild(errorElement);
    } else {
      input.insertAdjacentElement('afterend', errorElement);
    }
  },
  
  /**
   * Clear error for input
   * @param {HTMLElement} input - Input element
   */
  clearInputError: function(input) {
    input.classList.remove('error');
    
    // Find and remove error element
    const parent = input.closest('.form-group');
    if (parent) {
      const errorElement = parent.querySelector('.input-error');
      if (errorElement) {
        parent.removeChild(errorElement);
      }
    }
  },
  
  /**
   * Validate email format
   * @param {string} email - Email address
   * @returns {boolean} True if valid
   */
  isValidEmail: function(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },
  
  /**
   * Serialize form data to object
   * @param {HTMLFormElement} form - Form element
   * @returns {Object} Form data object
   */
  serializeForm: function(form) {
    const formData = new FormData(form);
    const data = {};
    
    for (const [key, value] of formData.entries()) {
      // Handle checkbox values
      if (form.elements[key].type === 'checkbox') {
        data[key] = value === 'on';
      } else {
        data[key] = value;
      }
    }
    
    return data;
  },

  /**
   * Sanitize error messages to remove sensitive information
   * @param {Error|string} error - Error object or message
   * @returns {string} Sanitized error message
   */
  sanitizeErrorMessage: function(error) {
    if (!error) return 'An unknown error occurred';
    
    // If it's an Error object, get the message
    const errorMessage = error.message || error.toString();
    
    // Sanitize the error message to remove potential sensitive information
    let sanitized = errorMessage.replace(/at\s+.*?\(.*?\)/g, ''); // Remove stack trace info
    sanitized = sanitized.replace(/([A-Za-z]:\\|\/var\/|\/etc\/|\/home\/).+?(?=\s|$)/g, '[path]'); // Remove file paths
    sanitized = sanitized.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[ip-address]'); // Remove IP addresses
    sanitized = sanitized.replace(/password=["']?.*?["']?(?=\s|&|$)/gi, 'password=[redacted]'); // Remove passwords
    
    return this.escapeHTML(sanitized);
  },

  /**
   * Safely escape attribute values
   * @param {any} value - Value to escape
   * @returns {string} Escaped attribute value
   */
  safeAttr: function(value) {
    if (value === null || value === undefined) return '';
    
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
  },

  /**
   * Safely render HTML template with automatic escaping of data properties
   * @param {string} template - HTML template with ${prop} placeholders
   * @param {Object} data - Data object with properties to insert
   * @param {Object} options - Options for rendering
   * @returns {string} - Safe HTML string
   */
  safeTemplate: function(template, data, options = {}) {
    const { 
      escapeAll = true, // Whether to escape all values by default
      attrProps = [] // Props that should be escaped as attributes
    } = options;
    
    if (!data) data = {};
    
    return template.replace(/\${([^}]+)}/g, (match, prop) => {
      // Extract property name and any modifiers
      const [rawProp, ...modifiers] = prop.trim().split('|');
      const noEscape = modifiers.includes('noEscape');
      const asAttr = modifiers.includes('attr') || attrProps.includes(rawProp);
      
      // Get the value from nested properties (e.g. 'user.name')
      const getValue = (obj, path) => {
        if (!obj) return '';
        return path.split('.').reduce((o, p) => o && o[p] !== undefined ? o[p] : '', obj);
      };
      
      const value = getValue(data, rawProp);
      
      // Escape based on context and modifiers
      if (value == null) return '';
      if (noEscape) return value;
      if (asAttr) return this.safeAttr(value);
      if (escapeAll) return this.escapeHTML(value);
      return value;
    });
  },
  
  /**
   * Create a confirmation dialog
   * @param {string} title - Dialog title
   * @param {string} message - Dialog message
   * @param {Function} confirmFn - Function to call when confirmed
   * @param {Function} cancelFn - Function to call when canceled (optional)
   * @param {string} confirmText - Text for confirm button
   * @param {string} cancelText - Text for cancel button
   */
  confirmDialog: function(title, message, confirmFn, cancelFn = null, confirmText = 'Confirm', cancelText = 'Cancel') {
    // Create modal elements
    const modal = document.createElement('div');
    modal.className = 'modal confirm-dialog';
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    
    const modalHeader = document.createElement('div');
    modalHeader.className = 'modal-header';
    
    const headerTitle = document.createElement('h3');
    headerTitle.textContent = title;
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'close-modal';
    closeBtn.innerHTML = '&times;';
    
    modalHeader.appendChild(headerTitle);
    modalHeader.appendChild(closeBtn);
    
    const modalBody = document.createElement('div');
    modalBody.className = 'modal-body';
    modalBody.textContent = message;
    
    const modalFooter = document.createElement('div');
    modalFooter.className = 'modal-footer';
    
    const cancelButton = document.createElement('button');
    cancelButton.className = 'button';
    cancelButton.textContent = cancelText;
    
    const confirmButton = document.createElement('button');
    confirmButton.className = 'button primary';
    confirmButton.textContent = confirmText;
    
    modalFooter.appendChild(cancelButton);
    modalFooter.appendChild(confirmButton);
    
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    modalContent.appendChild(modalFooter);
    
    modal.appendChild(modalContent);
    
    // Add to document
    document.body.appendChild(modal);
    
    // Make modal visible
    setTimeout(() => {
      modal.classList.add('visible');
    }, 10);
    
    // Event handlers
    const closeModal = () => {
      modal.classList.remove('visible');
      modal.addEventListener('transitionend', () => {
        modal.remove();
      });
    };
    
    closeBtn.addEventListener('click', () => {
      closeModal();
      if (cancelFn) cancelFn();
    });
    
    cancelButton.addEventListener('click', () => {
      closeModal();
      if (cancelFn) cancelFn();
    });
    
    confirmButton.addEventListener('click', () => {
      closeModal();
      confirmFn();
    });
  }
};

// Export for use in other modules
window.UIUtils = UIUtils;