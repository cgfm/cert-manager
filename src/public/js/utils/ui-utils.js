/**
 * UI Utilities
 * Common UI helper functions
 */
const UIUtils = {
  // Store the original overflow state
  originalOverflow: null,
  originalPaddingRight: null,
  scrollbarWidth: null,

  // Calculate scrollbar width once
  getScrollbarWidth() {
    if (this.scrollbarWidth === null) {
      // Create a temporary div to measure scrollbar width
      const outer = document.createElement('div');
      outer.style.visibility = 'hidden';
      outer.style.overflow = 'scroll';
      document.body.appendChild(outer);

      const inner = document.createElement('div');
      outer.appendChild(inner);

      // Calculate the difference between outer and inner width
      this.scrollbarWidth = outer.offsetWidth - inner.offsetWidth;

      // Clean up
      document.body.removeChild(outer);
    }

    return this.scrollbarWidth;
  },

  /**
   * Show a modal with content and options
   * @param {string} modalId - ID of the modal to show
   * @param {Object} options - Modal options
   * @param {string} options.title - Modal title
   * @param {string} options.content - Modal HTML content
   * @param {Object[]} options.buttons - Button definitions
   * @param {string} options.buttons[].text - Button text
   * @param {string} options.buttons[].id - Button ID
   * @param {string} options.buttons[].action - Button action (close, custom)
   * @param {string} [options.buttons[].class] - Additional button classes
   * @param {Object} [options.data] - Additional data to store with modal
   * @param {Function} [options.onShow] - Callback to run when modal is shown
   */
  showModal: function (modalId, options = {}) {
    let modal = document.getElementById(modalId);

    if (!modal) {
      // Create new modal element
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal hidden';
      document.body.appendChild(modal);

      // Add click handler to close when clicking outside content
      modal.addEventListener('click', (event) => {
        if (event.target === modal) {
          this.closeModal(modalId);
        }
      });

      Logger.debug(`Created new modal with ID: ${modalId}`);
    }

    // Update the modal content with new options
    this.updateModal(modalId, options);

    // Open the modal
    this.openModal(modalId);

    // Run onShow callback if provided
    if (typeof options.onShow === 'function') {
      // Use setTimeout to ensure modal is fully rendered and visible
      setTimeout(() => {
        options.onShow(modal);
      }, 50);
    }
  },

  /**
   * Open a modal by ID
   * @param {string} modalId - ID of the modal to open
   */
  openModal: function (modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Check if page has scrollbar
    const hasScrollbar = window.innerWidth > document.documentElement.clientWidth;

    if (hasScrollbar) {
      // Get scrollbar width
      const scrollbarWidth = this.getScrollbarWidth();

      // Add padding to body to prevent content shift
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    // Prevent background scrolling
    document.body.style.overflow = 'hidden';

    // Show modal
    modal.classList.remove('hidden');

    // Add 'visible' class if it doesn't already have it
    if (!modal.classList.contains('visible')) {
      modal.classList.add('visible');
    }

    // Add event listeners for close buttons
    this.setupCloseHandlers(modal);

    // Add body class to prevent scrolling
    document.body.classList.add('modal-open');

    // Dispatch event
    modal.dispatchEvent(new CustomEvent('modalopen'));
  },

  /**
   * Update modal content
   * @param {string} modalId - ID of the modal to update
   * @param {Object} options - Modal options (same as showModal)
   */
  updateModal: function (modalId, options = {}) {
    const modal = document.getElementById(modalId);
    if (!modal) {
      Logger.error(`Modal not found: ${modalId}`);
      return;
    }

    // Store any data with the modal element
    if (options.data) {
      Object.entries(options.data).forEach(([key, value]) => {
        modal.dataset[key] = value;
      });
    }

    // Build modal content HTML
    let contentHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>${UIUtils.escapeHTML(options.title || 'Modal')}</h2>
          ${options.extendedHeader || ''}
          <button class="close-modal">&times;</button>
        </div>
        <div class="modal-body">
          ${options.content || ''}
        </div>
    `;

    // Add footer with buttons if defined
    if (options.buttons && options.buttons.length) {
      contentHTML += `<div class="modal-footer">`;

      options.buttons.forEach((button, index) => {
        // Generate a unique ID for each button if not provided
        const btnId = button.id || `modal-btn-${modalId}-${index}`;
        const btnType = button.type || 'default';
        const btnClass = button.class ? ` ${button.class}` : '';
        
        contentHTML += `<button id="${btnId}" class="button ${btnType}${btnClass}" data-button-index="${index}">${UIUtils.escapeHTML(button.text)}</button>`;
      });

      contentHTML += `</div>`;
    }

    contentHTML += `</div>`;

    // Set modal content
    modal.innerHTML = contentHTML;

    // Prevent clicks in the modal content from closing the modal
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) {
      modalContent.addEventListener('click', (event) => {
        event.stopPropagation();
      });
    }

    // Set up button event handlers
    if (options.buttons && options.buttons.length) {
      const footer = modal.querySelector('.modal-footer');
      if (footer) {
        footer.querySelectorAll('button').forEach(buttonElement => {
          const index = parseInt(buttonElement.getAttribute('data-button-index'), 10);
          const buttonConfig = options.buttons[index];
          
          if (!buttonConfig) return;
          
          buttonElement.addEventListener('click', (event) => {
            // Handle close action
            if (buttonConfig.action === 'close') {
              this.closeModal(modalId);
            }
            // Handle function action
            else if (typeof buttonConfig.action === 'function') {
              try {
                buttonConfig.action(event);
              } catch (error) {
                Logger.error('Error in modal button action:', error);
              }
            }
            
            // Dispatch custom event for any button click
            modal.dispatchEvent(new CustomEvent('buttonClick', {
              detail: {
                buttonId: buttonElement.id,
                buttonIndex: index,
                action: buttonConfig.action
              }
            }));
          });
        });
      }
    }

    // Setup close handlers
    this.setupCloseHandlers(modal);
  },

  /**
   * Close a modal by ID
   * @param {string} modalId - ID of the modal to close
   */
  closeModal: function (modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    // Hide modal
    modal.classList.remove('active');
    modal.classList.remove('visible');

    // Add hidden class
    modal.classList.add('hidden');

    // Important: Restore original body state
    if (document.querySelectorAll('.modal:not(.hidden)').length === 0) {
      // Only restore overflow if no other modals are open
      document.body.style.overflow = this.originalOverflow || '';
      document.body.style.paddingRight = this.originalPaddingRight || '';
      document.body.classList.remove('modal-open');
    }

    // Dispatch event
    modal.dispatchEvent(new CustomEvent('modalclose'));

    // Log that overflow has been restored
    console.log('Modal closed, body overflow restored to:', document.body.style.overflow);
  },

  /**
   * Close all open modals
   */
  closeAllModals: function () {
    // Close each modal
    document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
      modal.classList.add('hidden');
      modal.classList.remove('visible');
      modal.dispatchEvent(new CustomEvent('modalclose'));
    });

    // Remove body class
    document.body.classList.remove('modal-open');
  },

  // Add this method to the UIUtils object

  /**
   * Show a loader in a container
   * @param {string|HTMLElement} container - Container element or ID to show the loader in
   * @param {string} [message='Loading...'] - Message to display below the spinner
   * @param {string} [size='medium'] - Size of the spinner (small, medium, large)
   * @returns {HTMLElement} The loader element
   */
  showLoader: function (container, message = 'Loading...', size = 'medium') {
    // Get the container element
    const containerElement = typeof container === 'string'
      ? document.getElementById(container)
      : container;

    if (!containerElement) {
      console.warn(`Container not found: ${container}`);
      return null;
    }

    // Store original content to restore later if needed
    containerElement.dataset.originalContent = containerElement.innerHTML;

    // Create the loader element
    const loaderElement = document.createElement('div');
    loaderElement.className = 'loader-container';
    loaderElement.innerHTML = `
    <div class="loader-spinner ${size}"></div>
    <div class="loader-message">${this.escapeHTML(message)}</div>
  `;

    // Clear and add the loader
    containerElement.innerHTML = '';
    containerElement.appendChild(loaderElement);

    // Add helper method directly to the element for easier hiding
    loaderElement.hide = () => this.hideLoader(container);

    return loaderElement;
  },

  /**
   * Hide the loader and restore original content
   * @param {string|HTMLElement} container - Container element or ID that contains the loader
   * @param {boolean} [restoreContent=false] - Whether to restore the original content
   */
  hideLoader: function (container, restoreContent = false) {
    // Get the container element
    const containerElement = typeof container === 'string'
      ? document.getElementById(container)
      : container;

    if (!containerElement) {
      return;
    }

    // Find and remove the loader
    const loader = containerElement.querySelector('.loader-container');
    if (loader) {
      containerElement.removeChild(loader);
    }

    // Restore original content if requested
    if (restoreContent && containerElement.dataset.originalContent) {
      containerElement.innerHTML = containerElement.dataset.originalContent;
      delete containerElement.dataset.originalContent;
    }
  },

  /**
   * Update the message of a loader
   * @param {string|HTMLElement} container - Container element or ID that contains the loader
   * @param {string} message - New message to display
   */
  updateLoaderMessage: function (container, message) {
    // Get the container element
    const containerElement = typeof container === 'string'
      ? document.getElementById(container)
      : container;

    if (!containerElement) {
      return;
    }

    // Find the message element
    const messageElement = containerElement.querySelector('.loader-message');
    if (messageElement) {
      messageElement.textContent = message;
    }
  },

  /**
 * Show a loading modal with spinner and message
 * @param {string} message - Primary message to display
 * @param {Object} options - Additional options
 * @param {string} [options.additionalText] - Secondary message below the primary message
 * @param {boolean} [options.showSpinner=true] - Whether to show the spinner
 * @param {string} [options.modalId='loading-modal'] - ID for the modal element
 * @param {boolean} [options.closable=false] - Whether the modal can be closed by the user
 * @returns {string} The ID of the created modal
 */
  showLoadingModal: function (message, options = {}) {
    const {
      additionalText = '',
      showSpinner = true,
      modalId = 'loading-modal',
      closable = false
    } = options;

    // Create modal content
    let contentHTML = `
    <div class="loading-modal-content">
      ${showSpinner ? '<div class="loading-spinner large"></div>' : ''}
      <div class="loading-modal-text">
        <h3>${this.escapeHTML(message)}</h3>
        ${additionalText ? `<p>${this.escapeHTML(additionalText)}</p>` : ''}
      </div>
    </div>
  `;

    // Create modal options
    const modalOptions = {
      title: '', // No title needed for loading modal
      content: contentHTML,
      closable: closable,
      buttons: [] // No buttons for loading modal
    };

    // Show the modal
    this.showModal(modalId, modalOptions);

    return modalId;
  },

  /**
   * Set up event handlers for closing a modal
   * @param {HTMLElement} modal - Modal element
   */
  setupCloseHandlers: function (modal) {
    // Close button handlers
    modal.querySelectorAll('.close-modal').forEach(closeBtn => {
      closeBtn.addEventListener('click', () => {
        this.closeModal(modal.id);
      });
    });

    // Escape key closes modal
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape') {
        this.closeModal(modal.id);
        document.removeEventListener('keydown', handleEscapeKey);
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
  },

  /**
   * Create and show an alert dialog
   * @param {string} title - Dialog title
   * @param {string} message - Dialog message
   * @param {Function} onClose - Callback on close
   */
  alert: function (title, message, onClose) {
    // Create modal if it doesn't exist
    if (!document.getElementById('alert-modal')) {
      const modal = document.createElement('div');
      modal.id = 'alert-modal';
      modal.className = 'modal hidden';
      modal.innerHTML = this.safeTemplate(`
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="alert-title"></h2>
            <button class="close-modal">&times;</button>
          </div>
          <div class="modal-body">
            <p id="alert-message"></p>
          </div>
          <div class="modal-footer">
            <button id="alert-ok" class="button primary">OK</button>
          </div>
        </div>
      `, {});

      document.body.appendChild(modal);
    }

    // Set content safely
    document.getElementById('alert-title').textContent = title;
    document.getElementById('alert-message').textContent = message;

    // Set up events
    const modal = document.getElementById('alert-modal');
    const okBtn = document.getElementById('alert-ok');

    const handleClose = () => {
      this.closeModal('alert-modal');
      if (onClose) onClose();
      okBtn.removeEventListener('click', handleClose);
    };

    okBtn.addEventListener('click', handleClose);

    // Open modal
    this.openModal('alert-modal');
  },

  /**
   * Show loading state in a container
   * @param {string} containerId - ID of container element
   * @param {string} message - Optional loading message
   */
  showLoading: function (containerId, message = 'Loading...') {
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
  createLoadingState: function (message = 'Loading...') {
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
  createEmptyState: function (title, message, icon = '📂', stateType = '', actionText = '', actionFn = null) {
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
  createErrorState: function (title, message, retryFn = null) {
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
  showToast: function (message, type = 'info', duration = 3000) {
    // Check if toast container exists, create if it doesn't
    let toastContainer = document.getElementById('toast-container');

    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      document.body.appendChild(toastContainer);
    }

    // Create toast content
    const iconMap = {
      success: 'fas fa-check-circle',
      error: 'fas fa-times-circle',
      warning: 'fas fa-exclamation-triangle',
      info: 'fas fa-info-circle'
    };

    const icon = iconMap[type] || iconMap.info;

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    toast.innerHTML = `
        <i class="${icon}"></i>
        <span>${message}</span>
    `;

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
  showError: function (title, error) {
    const message = error instanceof Error ? error.message : error;
    this.showNotification(title, message, 'error', 10000);

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
  showNotification: function (title, message, type = 'info', duration = 5000) {
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
  removeNotification: function (notification) {
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
  formatBytes: function (bytes, decimals = 2) {
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
  formatFileSize: function (bytes, decimals = 2) {
    return this.formatBytes(bytes, decimals);
  },

  /**
   * Validate form inputs
   * @param {HTMLFormElement} form - The form element
   * @returns {boolean} True if valid
   */
  validateForm: function (form) {
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
  showInputError: function (input, message) {
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
  clearInputError: function (input) {
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
  isValidEmail: function (email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  /**
   * Serialize form data to object
   * @param {HTMLFormElement} form - Form element
   * @returns {Object} Form data object
   */
  serializeForm: function (form) {
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
  sanitizeErrorMessage: function (error) {
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
   * Safely escape HTML to prevent XSS
   * @param {string} unsafe - String to escape
   * @returns {string} Escaped string
   */
  escapeHTML: function (unsafe) {
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
   * Safely escape attribute values
   * @param {any} value - Value to escape
   * @returns {string} Escaped attribute value
   */
  escapeAttr: function (value) {
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
  safeTemplate: function (template, data, options = {}) {
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
      if (asAttr) return this.escapeAttr(value);
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
  confirmDialog: function (title, message, confirmFn, cancelFn = null, confirmText = 'Confirm', cancelText = 'Cancel') {
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
  },

  /**
   * Create a loading spinner with optional message
   * @param {string} [message] - Optional message to display below spinner
   * @param {string} [size] - Size of spinner: 'small', 'medium', 'large'
   * @returns {HTMLElement} The loading spinner element
   */
  createLoadingSpinner: function (message, size = 'medium') {
    // Create container div
    const container = document.createElement('div');
    container.className = 'loading-container';

    // Create spinner element
    const spinner = document.createElement('div');
    spinner.className = `loading-spinner ${size}`;
    container.appendChild(spinner);

    // Add message if provided
    if (message) {
      const textElement = document.createElement('div');
      textElement.className = 'loading-text';
      textElement.textContent = message;
      container.appendChild(textElement);
    }

    return container;
  },

  /**
   * Show a loading spinner in a container element
   * @param {string|HTMLElement} container - Container element or its ID
   * @param {string} [message] - Optional message to display
   * @param {string} [size] - Size of spinner: 'small', 'medium', 'large'
   * @returns {HTMLElement} The created loading spinner element
   */
  showLoadingSpinner: function (container, message, size = 'medium') {
    // Get container element
    const containerElement = typeof container === 'string'
      ? document.getElementById(container)
      : container;

    if (!containerElement) {
      console.warn('Container element not found for loading spinner');
      return null;
    }

    // Clear existing content if needed
    containerElement.innerHTML = '';

    // Create and append the spinner
    const loadingElement = this.createLoadingSpinner(message, size);
    containerElement.appendChild(loadingElement);

    return loadingElement;
  },

  /**
   * Update the message of an existing loading spinner
   * @param {HTMLElement} spinnerContainer - The loading spinner container element
   * @param {string} message - New message to display
   */
  updateLoadingMessage: function (spinnerContainer, message) {
    if (!spinnerContainer) return;

    let textElement = spinnerContainer.querySelector('.loading-text');

    if (!textElement) {
      // Create text element if it doesn't exist
      textElement = document.createElement('div');
      textElement.className = 'loading-text';
      spinnerContainer.appendChild(textElement);
    }

    textElement.textContent = message;
  },

  /**
   * Remove a loading spinner
   * @param {HTMLElement} spinnerContainer - The loading spinner container element
   * @param {HTMLElement|string} [replaceWith] - Optional element or HTML to replace the spinner with
   */
  removeLoadingSpinner: function (spinnerContainer) {
    if (!spinnerContainer) return;

    if (spinnerContainer.parentNode) {
      spinnerContainer.parentNode.removeChild(spinnerContainer);
    }
  },

  /**
   * Initialize all modal functionality
   */
  initializeModals() {
    // Store current body state before modifying
    this.originalOverflow = document.body.style.overflow;
    this.originalPaddingRight = document.body.style.paddingRight;

    // Set up all modal open buttons
    document.querySelectorAll('[data-open-modal]').forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const modalId = button.getAttribute('data-open-modal');
        this.openModal(modalId);
      });
    });

    // Set up all modal close buttons
    document.querySelectorAll('[data-close-modal]').forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        const modalId = button.closest('.modal').id;
        this.closeModal(modalId);
      });
    });

    // Close modal when clicking outside content
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeModal(modal.id);
        }
      });
    });

    // Close modals with Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
          this.closeModal(modal.id);
        });
      }
    });
  }
};

// Initialize modals
document.addEventListener('DOMContentLoaded', () => {
  //UIUtils.initialize();
  UIUtils.initializeModals();
});

// Export for use in other modules
window.UIUtils = UIUtils;