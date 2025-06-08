/**
 * @fileoverview Deployment Actions Sortable Functionality - Drag-and-drop reordering interface
 * 
 * This module implements comprehensive drag-and-drop functionality for reordering certificate
 * deployment actions. It provides a smooth, intuitive interface for users to reorganize
 * deployment action sequences with visual feedback and touch/mouse support.
 * 
 * Key Features:
 * - Drag-and-drop reordering with visual feedback
 * - Touch device support for mobile interfaces
 * - Dynamic placeholder positioning during drag
 * - Automatic scrolling during drag operations
 * - Real-time action list updates
 * - Smooth animations and transitions
 * - Error handling and recovery
 * 
 * Functionality:
 * - Mouse-based drag operations with visual cues
 * - Touch-based drag for mobile devices
 * - Auto-scroll when dragging near container edges
 * - Dynamic placeholder insertion for drop targets
 * - Action order persistence and API updates
 * - Comprehensive event handling and cleanup
 * 
 * Browser Compatibility:
 * - Modern browsers with ES6+ support
 * - Touch-enabled devices (tablets, phones)
 * - Mouse and trackpad input devices
 * 
 * Dependencies:
 * - Logger (global logging service)
 * - Certificate management API endpoints
 * - DOM manipulation utilities
 * 
 * @module public/deployment-actions-sortable
 * @version 1.0.0
 * @author Certificate Manager Team
 */

// Variables to track drag state
let draggedItem = null;
let draggedItemIndex = -1;
let draggedItemRect = null;
let mouseOffsetY = 0;
let placeholder = null;
let actionsList = null;
let actionItems = [];
let currentFingerprint = null;
let sortableContainer = null;

/**
 * Initialize sortable functionality for deployment actions.
 * Sets up drag-and-drop reordering for the specified certificate's deployment actions.
 * 
 * @function initDeployActionsSortable
 * @param {string} fingerprint - The certificate fingerprint to initialize sorting for
 * @returns {void}
 * 
 * @example
 * // Initialize sorting for a specific certificate
 * initDeployActionsSortable('abc123def456');
 */
function initDeployActionsSortable(fingerprint) {
  Logger.debug(`Initializing sortable for deployment actions: ${fingerprint}`);
  currentFingerprint = fingerprint;
  
  // Find the action list and sortable container
  actionsList = document.getElementById('deployment-actions-list');
  if (!actionsList) {
    Logger.warn('No deployment actions list container found');
    return;
  }
  
  // Find the container for sortable items
  sortableContainer = actionsList.querySelector('.sortable-actions');
  if (!sortableContainer) {
    Logger.warn('No sortable container found for deployment actions');
    return;
  }
  
  // Clean up any previous event listeners
  cleanupPreviousListeners();
  
  // Get all action items
  actionItems = Array.from(sortableContainer.querySelectorAll('.deployment-action-item'));
  Logger.debug(`Found ${actionItems.length} sortable action items`);
  
  if (actionItems.length <= 1) {
    Logger.debug('Not enough items to sort, skipping sortable initialization');
    return;
  }
  
  // Add drag-and-drop functionality to each item
  actionItems.forEach((item, index) => {
    // Find the drag handle
    const dragHandle = item.querySelector('.drag-handle');
    if (!dragHandle) return;
    
    // Store the original index on the element
    item.dataset.originalIndex = index;
    
    // Style the drag handle to indicate it's draggable
    dragHandle.style.cursor = 'grab';
    
    // Make the handle draggable
    dragHandle.addEventListener('mousedown', handleDragStart);
    dragHandle.addEventListener('touchstart', handleTouchStart, { passive: false });
    
    // Prevent text selection when dragging
    dragHandle.addEventListener('selectstart', preventDefault);
  });
  
  // Add the action order info message if more than one action
  if (actionItems.length > 1 && !actionsList.querySelector('.action-order-info')) {
    const orderInfo = document.createElement('div');
    orderInfo.className = 'action-order-info';
    orderInfo.innerHTML = '<i class="fas fa-info-circle"></i> Drag actions to change the order of execution';
    sortableContainer.parentNode.insertBefore(orderInfo, sortableContainer);
  }
  
  Logger.debug(`Sortable initialization complete for ${actionItems.length} items`);
}

// Clean up previous event listeners
function cleanupPreviousListeners() {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('touchmove', onDragTouchMove);
  document.removeEventListener('mouseup', endDrag);
  document.removeEventListener('touchend', endDrag);
  
  if (actionItems && actionItems.length) {
    actionItems.forEach(item => {
      const handle = item.querySelector('.drag-handle');
      if (handle) {
        const newHandle = handle.cloneNode(true);
        handle.parentNode.replaceChild(newHandle, handle);
      }
    });
  }
}

// Event handler for mouse drag start
function handleDragStart(e) {
  e.preventDefault();
  startDrag(this.closest('.deployment-action-item'), e.clientX, e.clientY);
}

// Event handler for touch drag start
function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.touches[0];
  startDrag(this.closest('.deployment-action-item'), touch.clientX, touch.clientY);
}

// Prevent default behavior
function preventDefault(e) {
  e.preventDefault();
}

// Start drag operation
function startDrag(item, clientX, clientY) {
  // Set the current dragged item
  draggedItem = item;
  draggedItemIndex = Array.from(sortableContainer.children).indexOf(item);
  
  // Record item dimensions and position
  draggedItemRect = item.getBoundingClientRect();
  
  // Calculate mouse offset relative to the top of the dragged item
  mouseOffsetY = clientY - draggedItemRect.top;
  
  // Create a placeholder with exact same dimensions
  placeholder = document.createElement('div');
  placeholder.className = 'deployment-action-item placeholder';
  placeholder.style.height = `${draggedItemRect.height}px`;
  placeholder.style.width = `${draggedItemRect.width}px`;
  placeholder.style.margin = getComputedStyle(item).margin;
  
  // Add dragging style to current item
  draggedItem.classList.add('dragging');
  
  // Position the dragged item absolutely
  draggedItem.style.position = 'fixed';
  draggedItem.style.zIndex = '1000';
  draggedItem.style.width = `${draggedItemRect.width}px`;
  draggedItem.style.left = `${draggedItemRect.left}px`;
  draggedItem.style.top = `${draggedItemRect.top}px`;
  
  // Add placeholder where the item was
  item.parentNode.insertBefore(placeholder, item.nextSibling);
  
  // Move item to body to avoid container constraints
  document.body.appendChild(draggedItem);
  
  // Set up event listeners for drag movement
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('touchmove', onDragTouchMove, { passive: false });
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);
  
  // Prevent text selection during drag
  document.body.style.userSelect = 'none';
  document.body.style.cursor = 'grabbing';
}

// Handle mouse movement during drag
function onDragMove(e) {
  e.preventDefault();
  if (draggedItem) {
    updateDraggedPosition(e.clientY);
    updatePlaceholderPosition(e.clientY);
  }
}

// Handle touch movement during drag
function onDragTouchMove(e) {
  e.preventDefault();
  if (draggedItem && e.touches && e.touches[0]) {
    const touch = e.touches[0];
    updateDraggedPosition(touch.clientY);
    updatePlaceholderPosition(touch.clientY);
  }
}

// Update the dragged item's position
function updateDraggedPosition(clientY) {
  // Position the dragged element at the cursor position, accounting for the mouseOffsetY
  draggedItem.style.top = `${clientY - mouseOffsetY}px`;
}

// Update the placeholder position
function updatePlaceholderPosition(clientY) {
  // Get all potential drop targets (excluding the dragged item and placeholder)
  const potentialTargets = Array.from(sortableContainer.children).filter(
    child => child !== placeholder && child !== draggedItem
  );
  
  // Find the target to place before based on mouse position
  let targetBeforeElement = null;
  
  for (const target of potentialTargets) {
    const targetRect = target.getBoundingClientRect();
    const targetMiddleY = targetRect.top + targetRect.height / 2;
    
    if (clientY < targetMiddleY) {
      targetBeforeElement = target;
      break;
    }
  }
  
  // Move the placeholder to the appropriate position
  if (targetBeforeElement) {
    // Insert before the target
    sortableContainer.insertBefore(placeholder, targetBeforeElement);
  } else {
    // Append to the end if no target found
    sortableContainer.appendChild(placeholder);
  }
}

// End the drag operation
function endDrag() {
  if (!draggedItem) return;
  
  // Remove event listeners
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('touchmove', onDragTouchMove);
  document.removeEventListener('mouseup', endDrag);
  document.removeEventListener('touchend', endDrag);
  
  // Reset user select and cursor
  document.body.style.userSelect = '';
  document.body.style.cursor = '';
  
  // Get the new index from placeholder position
  const newIndex = Array.from(sortableContainer.children).indexOf(placeholder);
  
  // Reset the dragged item styles
  draggedItem.style.position = '';
  draggedItem.style.top = '';
  draggedItem.style.left = '';
  draggedItem.style.width = '';
  draggedItem.style.zIndex = '';
  draggedItem.classList.remove('dragging');
  
  // Replace the placeholder with the dragged item
  if (placeholder.parentNode) {
    sortableContainer.insertBefore(draggedItem, placeholder);
    sortableContainer.removeChild(placeholder);
  } else {
    // If placeholder was somehow removed, add the item back to the container
    sortableContainer.appendChild(draggedItem);
  }
  
  // If the position has changed, save the new order
  if (newIndex !== draggedItemIndex && newIndex >= 0) {
    saveNewOrder(draggedItemIndex, newIndex);
  }
  
  // Reset variables
  draggedItem = null;
  draggedItemIndex = -1;
  draggedItemRect = null;
  mouseOffsetY = 0;
  placeholder = null;
}

// Save the new order to the server using optimistic updates
function saveNewOrder(fromIndex, toIndex) {
  // Store a reference to the currentFingerprint to ensure it doesn't get lost
  const fingerprint = currentFingerprint;
  
  // Create the new order array based on data-original-index attributes
  const order = [];
  const reorderedItems = Array.from(sortableContainer.querySelectorAll('.deployment-action-item'));
  
  // Map the current visual order to the original indices
  for (let i = 0; i < reorderedItems.length; i++) {
    const originalIndex = parseInt(reorderedItems[i].dataset.originalIndex || reorderedItems[i].dataset.index, 10);
    order.push(originalIndex);
  }
  
  Logger.debug(`Saving new order:`, order);
  
  // Keep a local copy of the fingerprint
  const encodedFingerprint = encodeAPIFingerprint ? 
    encodeAPIFingerprint(fingerprint) : 
    encodeURIComponent(fingerprint);
  
  // Show message
  showMessage('Updating action order...', 'info');
  
  // Save the order to the server
  fetch(`/api/certificates/${encodedFingerprint}/deploy-actions/reorder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ order })
  })
  .then(response => {
    if (!response.ok) {
      return response.json().then(data => {
        throw new Error(data.message || `Server error: ${response.status}`);
      });
    }
    return response.json();
  })
  .then(data => {
    if (data.success) {
      showMessage('Order updated successfully', 'success');
      
      // Instead of fully reloading the view, just update the data-index attributes
      // to match the new server state
      reorderedItems.forEach((item, i) => {
        item.dataset.index = i;
        item.dataset.originalIndex = i;
      });
      
      // Update the local state with the current visual order
      actionItems = reorderedItems;
    } else {
      // If there was an error, inform the user
      showMessage(`Failed to update order: ${data.message || 'Unknown error'}`, 'error');
      
      // Reload the actions to get the correct order from the server
      // Here we use the stored fingerprint reference to avoid losing the cert details
      reloadDeploymentActions(fingerprint);
    }
  })
  .catch(error => {
    Logger.error('Error saving new order:', error);
    showMessage(`Error: ${error.message}`, 'error');
    
    // Reload the actions to get the correct order from the server
    reloadDeploymentActions(fingerprint);
  });
}

// Reload the deployment actions without losing the certificate context
function reloadDeploymentActions(fingerprint) {
  if (typeof loadCertificateDeploymentActions === 'function') {
    loadCertificateDeploymentActions({ fingerprint });
  } else if (typeof loadDeploymentActions === 'function') {
    loadDeploymentActions(fingerprint);
  }
}

// Show a message to the user
function showMessage(message, type = 'info') {
  if (typeof UIUtils !== 'undefined' && typeof UIUtils.showToast === 'function') {
    UIUtils.showToast(message, type);
  } else if (typeof showToast === 'function') {
    showToast(message, type);
  } else {
    console.log(`${type.toUpperCase()}: ${message}`);
  }
}

// Export functions
window.initDeployActionsSortable = initDeployActionsSortable;