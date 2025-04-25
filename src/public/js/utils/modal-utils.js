/**
 * Modal Utilities
 * Helper functions for managing modals
 */
const ModalUtils = {
  /**
   * Open a modal by ID
   * @param {string} modalId - ID of the modal to open
   */
  openModal: function(modalId) {
    const backdrop = document.getElementById('modal-backdrop');
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // Show backdrop and modal
    backdrop.classList.remove('hidden');
    modal.classList.remove('hidden');
    
    // Add 'visible' class if it doesn't already have it
    if (!backdrop.classList.contains('visible')) {
      backdrop.classList.add('visible');
    }
    // Add 'visible' class if it doesn't already have it
    if (!modal.classList.contains('visible')) {
      modal.classList.add('visible');
    }

    // Add event listeners for close buttons
    this.setupCloseHandlers(modal);
    
    // Dispatch event
    modal.dispatchEvent(new CustomEvent('modalopen'));
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
   */
  showModal: function(modalId, options = {}) {
    // First check if modal exists, create it if not
    let modal = document.getElementById(modalId);
    
    if (!modal) {
      // Create new modal element
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal hidden';
      document.body.appendChild(modal);
      Logger.debug(`Created new modal with ID: ${modalId}`);
    }
    
    // Update the modal content with new options
    this.updateModal(modalId, options);
    
    // Open the modal
    this.openModal(modalId);
  },

  
  /**
   * Update modal content
   * @param {string} modalId - ID of the modal to update
   * @param {Object} options - Modal options (same as showModal)
   */
  updateModal: function(modalId, options = {}) {
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
          <h2>${UIUtils.sanitizeHTML(options.title || 'Modal')}</h2>
          <button class="close-modal">&times;</button>
        </div>
        <div class="modal-body">
          ${options.content || ''}
        </div>
    `;
    
    // Add footer with buttons if defined
    if (options.buttons && options.buttons.length) {
      contentHTML += `<div class="modal-footer">`;
      
      options.buttons.forEach(button => {
        const btnClass = button.class ? ` ${button.class}` : '';
        const btnId = button.id || '';
        contentHTML += `<button id="${btnId}" class="button${btnClass}">${UIUtils.sanitizeHTML(button.text)}</button>`;
      });
      
      contentHTML += `</div>`;
    }
    
    contentHTML += `</div>`;
    
    // Set modal content
    modal.innerHTML = contentHTML;
    
    // Set up button event handlers
    if (options.buttons && options.buttons.length) {
      options.buttons.forEach(button => {
        if (!button.id) return;
        
        const buttonElement = document.getElementById(button.id);
        if (!buttonElement) return;
        
        buttonElement.addEventListener('click', () => {
          if (button.action === 'close') {
            this.closeModal(modalId);
          }
          
          // Dispatch custom event for any button click
          modal.dispatchEvent(new CustomEvent('buttonClick', {
            detail: {
              buttonId: button.id,
              action: button.action
            }
          }));
        });
      });
    }
    
    // Setup close handlers
    this.setupCloseHandlers(modal);
  },
  
  /**
   * Close a modal by ID
   * @param {string} modalId - ID of the modal to close
   */
  closeModal: function(modalId) {
    const backdrop = document.getElementById('modal-backdrop');
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    // Hide backdrop and modal
    backdrop.classList.add('hidden');
    modal.classList.add('hidden');
    backdrop.classList.remove('visible');
    modal.classList.remove('visible');
    
    // Dispatch event
    modal.dispatchEvent(new CustomEvent('modalclose'));
  },
  
  /**
   * Close all open modals
   */
  closeAllModals: function() {
    document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
      modal.classList.add('hidden');
      modal.classList.remove('visible');
      modal.dispatchEvent(new CustomEvent('modalclose'));
    });
    
    document.getElementById('modal-backdrop').classList.add('hidden');
  },
  
  /**
   * Set up event handlers for closing a modal
   * @param {HTMLElement} modal - Modal element
   */
  setupCloseHandlers: function(modal) {
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
    
    // Click outside modal closes it
    const backdrop = document.getElementById('modal-backdrop');
    const handleBackdropClick = (event) => {
      if (event.target === backdrop) {
        this.closeModal(modal.id);
        backdrop.removeEventListener('click', handleBackdropClick);
      }
    };
    
    backdrop.addEventListener('click', handleBackdropClick);
  },
  
  /**
   * Create and show a confirm dialog
   * @param {string} title - Dialog title
   * @param {string} message - Dialog message
   * @param {Function} onConfirm - Callback on confirm
   * @param {Function} onCancel - Callback on cancel
   */
  confirm: function(title, message, onConfirm, onCancel) {
    // Create modal if it doesn't exist
    if (!document.getElementById('confirm-modal')) {
      const modal = document.createElement('div');
      modal.id = 'confirm-modal';
      modal.className = 'modal hidden';
      modal.innerHTML = UIUtils.safeTemplate(`
        <div class="modal-content">
          <div class="modal-header">
            <h2 id="confirm-title"></h2>
            <button class="close-modal">&times;</button>
          </div>
          <div class="modal-body">
            <p id="confirm-message"></p>
          </div>
          <div class="modal-footer">
            <button id="confirm-cancel" class="button">Cancel</button>
            <button id="confirm-ok" class="button primary">Confirm</button>
          </div>
        </div>
      `, {});
      
      document.body.appendChild(modal);
    }
    
    // Set content safely
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    
    // Set up events
    const modal = document.getElementById('confirm-modal');
    
    const confirmBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');
    
    const handleConfirm = () => {
      this.closeModal('confirm-modal');
      if (onConfirm) onConfirm();
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
    };
    
    const handleCancel = () => {
      this.closeModal('confirm-modal');
      if (onCancel) onCancel();
      confirmBtn.removeEventListener('click', handleConfirm);
      cancelBtn.removeEventListener('click', handleCancel);
    };
    
    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);
    
    // Open modal
    this.openModal('confirm-modal');
  },
  
  /**
   * Create and show an alert dialog
   * @param {string} title - Dialog title
   * @param {string} message - Dialog message
   * @param {Function} onClose - Callback on close
   */
  alert: function(title, message, onClose) {
    // Create modal if it doesn't exist
    if (!document.getElementById('alert-modal')) {
      const modal = document.createElement('div');
      modal.id = 'alert-modal';
      modal.className = 'modal hidden';
      modal.innerHTML = UIUtils.safeTemplate(`
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
  }
};

// Initialize modals
document.addEventListener('DOMContentLoaded', () => {
  // Initialize modal backdrop if not already in the DOM
  if (!document.getElementById('modal-backdrop')) {
    const backdrop = document.createElement('div');
    backdrop.id = 'modal-backdrop';
    backdrop.className = 'modal-backdrop hidden';
    document.body.appendChild(backdrop);
  }
});

// Export for use in other modules
window.ModalUtils = ModalUtils;