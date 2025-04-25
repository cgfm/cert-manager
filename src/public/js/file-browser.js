/**
 * Certificate Manager - File Browser
 * Provides file browsing functionality for selecting files and directories
 */

// File browser state
let fileBrowserState = {
  currentPath: "/",
  selectedPath: null,
  isDirectory: true,
  onSelect: null,
  locations: {},
};

/**
 * Set up the file browser UI
 */
function setupFileBrowser() {
  // Set up common locations
  loadLocations();

  // Set up event listeners
  document
    .getElementById("file-browser-up")
    ?.addEventListener("click", navigateUp);
  document
    .getElementById("file-browser-refresh")
    ?.addEventListener("click", refreshFileBrowser);
  document
    .getElementById("file-browser-new-folder")
    ?.addEventListener("click", createNewFolder);
  document
    .getElementById("file-browser-select")
    ?.addEventListener("click", selectCurrentPath);
  document
    .getElementById("file-browser-cancel")
    ?.addEventListener("click", closeFileBrowser);

  // Location buttons
  document.querySelectorAll(".location-btn").forEach((btn) => {
    btn.addEventListener("click", function () {
      const location = this.getAttribute("data-location");
      navigateToLocation(location);
    });
  });

  // Close buttons
  document
    .querySelectorAll("#file-browser-modal .close-modal")
    .forEach((btn) => {
      btn.addEventListener("click", closeFileBrowser);
    });
}

/**
 * Initialize the file browser
 * @param {string} initialPath - Initial path to display
 * @param {Function} onSelectCallback - Callback when a path is selected
 * @param {boolean} directoryMode - Whether to browse directories (true) or files (false)
 */
function initializeFileBrowser(
  initialPath,
  onSelectCallback,
  directoryMode = false
) {
  console.log("Initializing file browser:", { initialPath, directoryMode });

  // Reset state
  fileBrowserState = {
    currentPath: initialPath || "",
    selectedPath: null,
    isDirectory: directoryMode,
    onSelect: onSelectCallback,
    locations: fileBrowserState.locations || {}, // Preserve locations if they exist
  };

  // Show the file browser modal - this will create it if needed
  showFileBrowserModal();

  // Load locations if not already loaded
  if (!fileBrowserState.locations.special) {
    loadLocations().then(() => {
      // After locations are loaded, navigate to initial path or roots
      if (initialPath) {
        navigateToPath(initialPath);
      } else {
        loadRootLocations();
      }
    });
  } else {
    // Locations already loaded, just navigate
    if (initialPath) {
      navigateToPath(initialPath);
    } else {
      loadRootLocations();
    }
  }
}

/**
 * Load special locations from the API
 */
async function loadLocations() {
  try {
    const response = await fetch("/api/filesystem/locations");

    if (!response.ok) {
      throw new Error(`Failed to load locations: ${response.status}`);
    }

    const data = await response.json();
    fileBrowserState.locations = data;

    // Update location buttons
    updateLocationButtons();

    return data;
  } catch (error) {
    console.error("Error loading locations:", error);
    UIUtils.showError("Failed to load file system locations");
    return {};
  }
}

/**
 * Update location buttons based on available locations
 */
function updateLocationButtons() {
  const container = document.querySelector(".file-browser-locations");
  const locations = fileBrowserState.locations;

  if (!container || !locations || !locations.special) {
    console.warn("No location container or special locations found");
    return;
  }

  // Clear existing buttons
  container.innerHTML = "";

  // Keep track of paths we've already added
  const addedPaths = new Set();

  // Add buttons for root locations if available but skip duplicates
  if (locations.root && locations.root.length > 0) {
    locations.root.forEach((root) => {
      // Normalize the path for comparison
      const normalizedPath = root.path.toLowerCase();

      // Skip if this path is already added from special locations
      if (addedPaths.has(normalizedPath)) {
        console.log(
          `Skipping duplicate root location: ${root.name} (${root.path})`
        );
        return;
      }

      const rootButton = document.createElement("button");
      rootButton.className = "location-btn";
      rootButton.setAttribute("data-path", root.path);
      rootButton.innerHTML = `<i class="fa-solid fa-hdd" title="Root"></i> ${root.name}`;
      rootButton.addEventListener("click", () => navigateToPath(root.path));
      container.appendChild(rootButton);

      // Track this path
      addedPaths.add(normalizedPath);
    });
  }
  
  // Add buttons for special locations if available but skip duplicates
  if (locations.special && locations.special.length > 0) {
    locations.special.forEach((special) => {
      // Normalize the path for comparison
      const normalizedPath = special.path.toLowerCase();

      // Skip if this path is already added from special locations
      if (addedPaths.has(normalizedPath)) {
        console.log(
          `Skipping duplicate special location: ${special.name} (${special.path})`
        );
        return;
      }

      const locationButton = document.createElement("button");
      locationButton.className = "location-btn";
      locationButton.setAttribute("data-path", special.path);
      locationButton.innerHTML = `<i class="fa-solid fa-folder-tree" title="Folder"></i> ${special.name}`;
      locationButton.addEventListener("click", () => navigateToPath(special.path));
      container.appendChild(locationButton);

      // Track this path
      addedPaths.add(normalizedPath);
    });
  }

  // Add docker volumes if available
  if (locations.docker && locations.docker.isDocker && locations.docker.volumes && locations.docker.volumes.length > 0) {
    locations.docker.volumes.forEach((docker) => {
      // Normalize the path for comparison
      const normalizedPath = docker.path.toLowerCase();
      
      // Skip if this path is already added from special locations
      if (addedPaths.has(normalizedPath)) {
        console.log(
          `Skipping duplicate docker location: ${docker.name} (${docker.path})`
        );
        return;
      }
      
      const dockerButton = document.createElement("button");
      dockerButton.className = "location-btn";
      dockerButton.setAttribute("data-path", docker.path);
      
      dockerButton.innerHTML = `<i class="fa-brands fa-docker" title="Docker Mount"></i> ${docker.name}`;
      if (docker.isWritable === false) {
        dockerButton.innerHTML += ` <i class="fa-solid fa-lock" title="Not writable"></i>`;
      }
      
      dockerButton.addEventListener("click", () => navigateToPath(docker.path));
      container.appendChild(dockerButton);
      
      // Track this path
      addedPaths.add(normalizedPath);
    });
  }

  console.log(`Added ${addedPaths.size} unique location buttons`);
}

/**
 * Navigate to a special location
 * @param {string} location - Location key (home, documents, etc.)
 */
function navigateToLocation(location) {
  const locations = fileBrowserState.locations.special || {};
  const path = locations[location];

  if (path) {
    navigateToPath(path);
  } else {
    UIUtils.showError(`Location "${location}" not found`);
  }
}

/**
 * Navigate to a path
 * @param {string} path - Path to navigate to
 */
function navigateToPath(path) {
  console.log("Navigating to path:", path);
  
  // Normalize path to prevent duplication
  path = normalizePath(path);
  
  // Set current path in state
  fileBrowserState.currentPath = path;
  
  // Reset selected path when navigating
  fileBrowserState.selectedPath = null;
  
  // Reset manual editing flags when navigating
  const pathField = document.getElementById("file-browser-current-path");
  if (pathField) {
    pathField.dataset.manuallyEdited = 'false';
  }
  
  const filenameField = document.getElementById("file-browser-filename");
  if (filenameField) {
    filenameField.dataset.manuallyEdited = 'false';
    filenameField.value = '';  // Clear filename field when navigating
  }
  
  // Update UI
  updateUIState(path);
  
  // Load directory contents
  loadDirectory(path);
}

/**
 * Normalize a path to prevent duplications
 * @param {string} path - Path to normalize
 * @returns {string} Normalized path
 */
function normalizePath(path) {
  // Use correct separator based on path format
  const separator = path.includes('\\') ? '\\' : '/';
  
  // Split path and filter empty segments
  const segments = path.split(separator).filter(segment => segment.length > 0);
  
  // Rebuild path
  let normalized = separator;
  if (path.match(/^[A-Z]:/i)) {
    // Windows path
    normalized = segments[0] + separator;
    segments.shift(); // Remove drive letter
  }
  
  // Add remaining segments
  normalized += segments.join(separator);
  
  // Ensure path ends with separator for directories
  // This can be removed if causing problems
  // if (segments.length > 0 && !normalized.endsWith(separator)) {
  //   normalized += separator;
  // }
  
  return normalized;
}

/**
 * Navigate up one level
 */
function navigateUp() {
  const currentPath = fileBrowserState.currentPath;
  const parentPath = getParentPath(currentPath);

  if (parentPath !== currentPath) {
    navigateToPath(parentPath);
  }
}

/**
 * Get parent directory path
 * @param {string} path - Current path
 * @returns {string} Parent path
 */
function getParentPath(path) {
  // Handle Windows paths
  if (path.match(/^[A-Z]:\\$/i)) {
    return path; // Already at root drive
  }

  // Handle Unix paths
  if (path === "/") {
    return "/";
  }

  // Remove trailing slash if present
  path = path.endsWith("/") || path.endsWith("\\") ? path.slice(0, -1) : path;

  // Find the last directory separator
  const lastSlashIndex = Math.max(
    path.lastIndexOf("/"),
    path.lastIndexOf("\\")
  );

  if (lastSlashIndex <= 0) {
    // Handle Unix root directory
    return "/";
  } else if (path.charAt(lastSlashIndex - 1) === ":") {
    // Handle Windows drive root
    return path.substring(0, lastSlashIndex + 1);
  } else {
    // Regular directory
    return path.substring(0, lastSlashIndex);
  }
}

/**
 * Refresh the current directory
 */
function refreshFileBrowser() {
  navigateToPath(fileBrowserState.currentPath);
}

/**
 * Render the file list
 * @param {Array} items - List of files and directories
 */
function renderFileList(items) {
  const container = document.getElementById("file-browser-list");

  if (!items || items.length === 0) {
    container.innerHTML = UIUtils.safeTemplate(
      `<p class="empty-message">Directory is empty</p>`, {}
    );
    return;
  }

  // Sort items: directories first, then files
  items.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  // Create table header
  let tableHtml = `
    <table class="file-browser-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Type</th>
          <th>Size</th>
          <th>Modified</th>
        </tr>
      </thead>
      <tbody>
  `;
  
  // Add table rows
  for (const item of items) {
    const icon = item.isDirectory ? 
      '<i class="fa-solid fa-folder" title="Folder"></i>' : 
      '<i class="fa-solid fa-file" title="File"></i>';
    
    const type = item.isDirectory ? "Directory" : "File";
    
    const size = item.isDirectory ? 
      "&mdash;" : 
      (typeof UIUtils.formatFileSize === 'function' ? 
        UIUtils.formatFileSize(item.size) : 
        formatFileSize(item.size));
    
    const modified = item.modified ? 
      new Date(item.modified).toLocaleString() : 
      "&mdash;";
    
    tableHtml += `
      <tr class="file-item ${item.isDirectory ? 'directory' : 'file'}" 
          data-path="${escapeHtml(item.path)}" 
          data-is-dir="${item.isDirectory}">
        <td>${icon} ${escapeHtml(item.name)}</td>
        <td>${type}</td>
        <td>${size}</td>
        <td>${modified}</td>
      </tr>
    `;
  }
  
  tableHtml += `
      </tbody>
    </table>
  `;

  container.innerHTML = tableHtml;

  // Add event listeners
  document.querySelectorAll(".file-item").forEach((item) => {
    // Single click handler
    item.addEventListener("click", function() {
      const path = this.getAttribute("data-path");
      const isDir = this.getAttribute("data-is-dir") === "true";

      if (isDir && fileBrowserState.isDirectory) {
        // In directory mode, allow selection of directories
        selectPath(path);
      } else if (isDir) {
        // Navigate to the directory
        navigateToPath(path);
      } else if (!fileBrowserState.isDirectory) {
        // In file mode, select files
        selectPath(path);
      }
    });

    // Double click handler
    item.addEventListener("dblclick", function() {
      handleItemDoubleClick(this);
    });
  });
}

/**
 * Helper function to escape HTML special characters
 * @param {string} unsafe - Unsafe string
 * @returns {string} Safe HTML string
 */
function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Format file size to human-readable string
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + " " + units[i];
}

/**
 * Create a new folder in the current directory
 */
async function createNewFolder() {
  const folderName = prompt("Enter folder name:");

  if (!folderName) return;

  try {
    const response = await fetch("/api/filesystem/directory", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: fileBrowserState.currentPath,
        name: folderName,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to create folder: ${errorText}`);
    }

    // Refresh the current directory
    refreshFileBrowser();
    UIUtils.showNotification(`Created folder: ${folderName}`, "success");
  } catch (error) {
    UIUtils.showError(error.message);
  }
}

/**
 * Select the current path and close the file browser
 */
function selectCurrentPath() {
  // Get the current path from the input field, not the stored state
  const pathField = document.getElementById("file-browser-current-path");
  const currentInputPath = pathField ? pathField.value : fileBrowserState.currentPath;
  
  // Start with either the manually entered path or the selected path
  let finalPath = currentInputPath;
  
  // If we're in file mode and there's a filename field, handle it properly
  if (!fileBrowserState.isDirectory) {
    const filenameField = document.getElementById("file-browser-filename");
    if (filenameField && filenameField.value) {
      const filename = filenameField.value;
      const separator = finalPath.includes('\\') ? '\\' : '/';
      
      // Ensure path doesn't end with a separator
      finalPath = finalPath.endsWith(separator) ? finalPath.slice(0, -1) : finalPath;

      // Check if the path already contains the filename at the end
      const pathParts = finalPath.split(separator);
      const lastPart = pathParts[pathParts.length - 1];
      
      // If the user has manually changed the path in the input field,
      // we should respect that change and not append the selected filename
      if (currentInputPath !== fileBrowserState.currentPath) {
        // User has manually edited the path - don't append filename
        // unless they specifically want to (by typing it)
        console.log("Path manually changed, using as-is:", finalPath);
      } else if (lastPart !== filename) {
        // Normal case - append filename to directory path
        finalPath = `${finalPath}${separator}${filename}`;
        console.log("Using path with appended filename:", finalPath);
      }
    }
  }

  console.log("Final selected path:", finalPath);
  
  // Close the file browser
  closeFileBrowser();
  
  // Call the callback with the selected path
  const callback = fileBrowserState.onSelect;
  if (callback && typeof callback === "function") {
    console.log("Calling selection callback with path:", finalPath);
    callback(finalPath);
  } else {
    console.warn("No callback provided for file selection");
  }
}

/**
 * Select a path in the file browser
 * @param {string} path - Path to select
 */
function selectPath(path) {
  console.log("Selecting path:", path);
  
  // Store selected path
  fileBrowserState.selectedPath = path;
  
  // Update UI selection state
  document.querySelectorAll('.file-item').forEach(item => {
    item.classList.remove('selected');
    if (item.getAttribute('data-path') === path) {
      item.classList.add('selected');
      
      // If in file mode, update the filename field
      if (!fileBrowserState.isDirectory) {
        const filenameField = document.getElementById("file-browser-filename");
        if (filenameField) {
          // Extract filename from path
          const separator = path.includes('\\') ? '\\' : '/';
          const pathParts = path.split(separator);
          const filename = pathParts[pathParts.length - 1];
          
          // Update filename field but only update if it's a file, not a directory
          const isDir = item.getAttribute('data-is-dir') === 'true';
          if (!isDir) {
            filenameField.value = filename;
          }
        }
      }
    }
  });
  
  // Enable the select button
  const selectButton = document.getElementById('file-browser-select');
  if (selectButton) {
    selectButton.disabled = false;
  }
}

/**
 * Set up the file browser UI
 * @param {boolean} directoryMode - Whether to browse directories (true) or files (false)
 */
function setupFileBrowserUI(directoryMode) {
  // Update mode-specific UI elements
  const modalTitle = document.getElementById("file-browser-title");
  if (modalTitle) {
    modalTitle.textContent = directoryMode ? "Select Directory" : "Select File";
  }

  // Set up the select button text (without changing its event handler)
  const selectButton = document.getElementById("file-browser-select");
  if (selectButton) {
    selectButton.textContent = directoryMode
      ? "Select This Directory"
      : "Select File";
    selectButton.disabled = true;
  }
  
  // Show/hide filename input based on mode
  const filenameInput = document.querySelector(".file-name-input");
  if (filenameInput) {
    filenameInput.style.display = directoryMode ? "none" : "flex";
  }

  // If in directory mode, add a "Use Current Directory" button if it doesn't exist
  if (directoryMode) {
    const footerActions = document.querySelector(".file-browser-actions");
    if (footerActions) {
      // Check if the button already exists
      let useCurrentBtn = document.getElementById("use-current-directory");
      if (!useCurrentBtn) {
        useCurrentBtn = document.createElement("button");
        useCurrentBtn.id = "use-current-directory";
        useCurrentBtn.className = "button button-primary";
        useCurrentBtn.textContent = "Use Current Directory";
        
        // Use direct onclick
        useCurrentBtn.onclick = function() {
          // Use the current directory path
          fileBrowserState.selectedPath = fileBrowserState.currentPath;
          selectCurrentPath();
        };

        // Add to the footer actions
        footerActions.insertBefore(useCurrentBtn, footerActions.firstChild);
      }
    }
  } else {
    // Remove the "Use Current Directory" button in file mode
    const useCurrentBtn = document.getElementById("use-current-directory");
    if (useCurrentBtn) {
      useCurrentBtn.remove();
    }
  }
}

/**
 * Double-click handler for file items
 * @param {HTMLElement} item - The clicked item
 */
function handleItemDoubleClick(item) {
  const path = item.getAttribute("data-path");
  const isDir = item.getAttribute("data-is-dir") === "true";

  if (isDir) {
    navigateToPath(path);
  } else if (!fileBrowserState.isDirectory) {
    // For files in file mode, select and confirm on double click
    selectPath(path);
    selectCurrentPath();
  }
}

/**
 * Close the file browser
 */
function closeFileBrowser() {
  console.log("Closing file browser");
  UIUtils.closeModal("file-browser-modal");

  // Reset state
  fileBrowserState.selectedPath = null;
}

/**
 * Show the file browser modal
 */
function showFileBrowserModal() {
  // First, ensure the modal exists
  let modal = document.getElementById("file-browser-modal");
  if (!modal) {
    console.log("Creating file browser modal");
    modal = createFileBrowserModal();
    
    // When creating a new modal, we must wait for it to be in the DOM
    setTimeout(() => {
      attachEventHandlers();
    }, 100);
  } else {
    // Modal already exists, just attach handlers immediately
    attachEventHandlers();
  }

  // Show the modal
  UIUtils.openModal("file-browser-modal");
}

/**
 * Attach all event handlers to file browser elements
 */
function attachEventHandlers() {
  console.log("Attaching event handlers to file browser elements");
  
  // Direct event bindings - Get fresh references to elements
  const upButton = document.getElementById("file-browser-up");
  if (upButton) {
    console.log("Found up button, attaching event");
    upButton.onclick = navigateUp; // Use onclick for better handling
  } else {
    console.warn("Up button not found");
  }
  
  // Similarly for other buttons - use onclick instead of addEventListener
  const refreshButton = document.getElementById("file-browser-refresh");
  if (refreshButton) {
    console.log("Found refresh button, attaching event");
    refreshButton.onclick = refreshFileBrowser;
  }
  
  const newFolderButton = document.getElementById("file-browser-new-folder");
  if (newFolderButton) {
    console.log("Found new folder button, attaching event");
    newFolderButton.onclick = createNewFolder;
  }
  
  const selectButton = document.getElementById("file-browser-select");
  if (selectButton) {
    console.log("Found select button, attaching event");
    selectButton.onclick = selectCurrentPath;
  }
  
  const cancelButton = document.getElementById("file-browser-cancel");
  if (cancelButton) {
    console.log("Found cancel button, attaching event");
    cancelButton.onclick = closeFileBrowser;
  }

  // Path input for keyboard navigation
  const pathInput = document.getElementById("file-browser-current-path");
  if (pathInput) {
    pathInput.removeAttribute("readonly");
    pathInput.onkeyup = function(e) {
      if (e.key === "Enter") {
        navigateToPath(this.value);
      }
    };
  }
  
  // Delegate events for location buttons
  const locationContainer = document.querySelector(".file-browser-locations");
  if (locationContainer) {
    // Use onclick for better compatibility
    locationContainer.onclick = function(e) {
      const button = e.target.closest(".location-btn");
      if (button) {
        const location = button.getAttribute("data-location");
        const path = button.getAttribute("data-path");
        
        if (location) {
          navigateToLocation(location);
        } else if (path) {
          navigateToPath(path);
        }
      }
    };
  }
  
  // Close buttons using direct onclick
  const closeButtons = document.querySelectorAll("#file-browser-modal .close-modal");
  closeButtons.forEach(btn => {
    btn.onclick = function(e) {
      e.preventDefault(); 
      closeFileBrowser();
    };
  });

  // Make sure the directory/file mode is properly set
  setupFileBrowserUI(fileBrowserState.isDirectory);
  
  console.log("All file browser event handlers attached");
}

/**
 * Create the file browser modal if it doesn't exist
 */
function createFileBrowserModal() {
  console.log("Creating file browser modal");
  const modal = document.createElement("div");
  modal.id = "file-browser-modal";
  modal.className = "modal hidden";
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="file-browser-title" class="modal-title">File Browser</h3>
        <span class="close-modal" aria-label="Close">&times;</span>
      </div>
      <div class="modal-body">
        <div class="file-browser-container">
          <div class="file-browser-toolbar">
            <button id="file-browser-up" class="button" title="Go up one level">
              <i class="fa-solid fa-arrow-up"></i> Up
            </button>
            <button id="file-browser-refresh" class="button" title="Refresh">
              <i class="fa-solid fa-arrows-rotate"></i> Refresh
            </button>
            <button id="file-browser-new-folder" class="button" title="New folder">
              <i class="fa-solid fa-folder-plus"></i> New Folder
            </button>
          </div>
          <div class="file-browser-path">
            <span>Path:</span>
            <input id="file-browser-current-path" type="text" placeholder="Path" />
          </div>
          <div class="file-browser-locations">
            <!-- Location buttons will be added here -->
          </div>
          <div id="file-browser-list" class="file-browser-list">
            <div class="loading">Loading...</div>
          </div>
          <div class="file-browser-footer">
            <div class="file-name-input">
              <label for="file-browser-filename">Filename:</label>
              <input type="text" id="file-browser-filename">
            </div>
            <div class="file-browser-actions">
              <button id="file-browser-select" class="button button-primary" disabled>Select</button>
              <button id="file-browser-cancel" class="button button-secondary close-modal">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
}

/**
 * Set up event handlers for close and cancel buttons
 */
function setupCloseButtons() {
  // Handle the standard close button (×)
  const closeButtons = document.querySelectorAll(
    "#file-browser-modal .close-modal"
  );
  closeButtons.forEach((button) => {
    // Remove existing listeners
    const newButton = button.cloneNode(true);
    if (button.parentNode) {
      button.parentNode.replaceChild(newButton, button);
    }

    // Add new event listener
    newButton.addEventListener("click", function (e) {
      e.preventDefault();
      console.log("Close button clicked");
      closeFileBrowser();
    });
  });

  // Handle the Cancel button
  const cancelButton = document.getElementById("file-browser-cancel");
  if (cancelButton) {
    // Remove existing listeners
    const newCancelButton = cancelButton.cloneNode(true);
    if (cancelButton.parentNode) {
      cancelButton.parentNode.replaceChild(newCancelButton, cancelButton);
    }

    // Add new event listener
    newCancelButton.addEventListener("click", function (e) {
      e.preventDefault();
      console.log("Cancel button clicked");
      closeFileBrowser();
    });
  }

  // Also listen for escape key
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      // Check if file browser is open
      const modal = document.getElementById("file-browser-modal");
      if (modal && !modal.classList.contains("hidden")) {
        closeFileBrowser();
      }
    }
  });
}

/**
 * Setup file browser buttons and their event handlers
 * Called after the file browser modal is fully rendered
 */
function setupFileBrowserButtons() {
  console.log("Setting up file browser buttons");

  // Navigation and action buttons with direct event binding
  document.getElementById("file-browser-up")?.addEventListener("click", navigateUp);
  document.getElementById("file-browser-refresh")?.addEventListener("click", refreshFileBrowser);
  document.getElementById("file-browser-new-folder")?.addEventListener("click", createNewFolder);
  document.getElementById("file-browser-select")?.addEventListener("click", selectCurrentPath);
  document.getElementById("file-browser-cancel")?.addEventListener("click", closeFileBrowser);

  // Make the file input field accessible from anywhere via keyboard
  const pathInput = document.getElementById("file-browser-current-path");
  if (pathInput) {
    // Make the path field editable (remove readonly if present)
    pathInput.removeAttribute("readonly");
    
    pathInput.addEventListener("keyup", function(e) {
      if (e.key === "Enter") {
        navigateToPath(this.value);
      }
    });
  }

  // Event delegation for location buttons that may be added dynamically
  const locationsContainer = document.querySelector(".file-browser-locations");
  if (locationsContainer) {
    locationsContainer.addEventListener("click", function(e) {
      // Find closest button if clicked on child element
      const button = e.target.closest(".location-btn");
      if (button) {
        const location = button.getAttribute("data-location");
        const path = button.getAttribute("data-path");
        
        if (location) {
          console.log("Navigating to location:", location);
          navigateToLocation(location);
        } else if (path) {
          console.log("Navigating to path:", path);
          navigateToPath(path);
        }
      }
    });
  }
  
  // Make sure close buttons work with event delegation
  const modal = document.getElementById("file-browser-modal");
  if (modal) {
    modal.addEventListener("click", function(e) {
      if (e.target.matches(".close-modal") || e.target.closest(".close-modal")) {
        e.preventDefault();
        closeFileBrowser();
      }
    });
  }
  
  console.log("File browser buttons setup completed");
}

/**
 * Load root locations
 */
async function loadRootLocations() {
  try {
    const response = await fetch("/api/filesystem/roots");

    if (!response.ok) {
      throw new Error(`Failed to load roots: ${response.status}`);
    }

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message || "Failed to load filesystem roots");
    }

    // Store roots in state
    fileBrowserState.locations = {
      ...fileBrowserState.locations,
      special: data.specialLocations || {},
      root: data.roots || [],
    };

    // Update location buttons
    updateLocationButtons();

    // Navigate to home directory if available
    if (data.specialLocations && data.specialLocations.home) {
      navigateToPath(data.specialLocations.home);
    } else if (data.roots && data.roots.length > 0) {
      navigateToPath(data.roots[0].path);
    }
  } catch (error) {
    console.error("Error loading root locations:", error);
    document.getElementById(
      "file-browser-list"
    ).innerHTML = `<div class="error-message">Failed to load filesystem: ${error.message}</div>`;
  }
}

/**
 * Debug function to check button setup
 */
function debugFileBrowser() {
  console.group("File Browser Button Debug");
  
  // Check all the critical buttons
  const buttons = [
    { id: "file-browser-up", name: "Up" },
    { id: "file-browser-refresh", name: "Refresh" },
    { id: "file-browser-new-folder", name: "New Folder" },
    { id: "file-browser-select", name: "Select" },
    { id: "file-browser-cancel", name: "Cancel" }
  ];
  
  buttons.forEach(btn => {
    const element = document.getElementById(btn.id);
    console.log(`${btn.name} button (${btn.id}): ${element ? "Found" : "NOT FOUND"}`);
    
    if (element) {
      console.log(`- Has click handler: ${element.onclick ? "Yes" : "No"}`);
      console.log(`- Has event listeners: ${element.getAttribute("onclick") ? "Yes" : "No"}`);
      console.log(`- Is disabled: ${element.disabled ? "Yes" : "No"}`);
    }
  });
  
  // Check modal state
  const modal = document.getElementById("file-browser-modal");
  console.log(`Modal: ${modal ? "Found" : "NOT FOUND"}`);
  if (modal) {
    console.log(`- Is visible: ${!modal.classList.contains("hidden")}`);
  }
  
  console.groupEnd();
  
  // If you want to force reattach events
  attachEventHandlers();
}

/**
 * Update the UI state based on the current path
 * @param {string} currentPath - Current path
 */
function updateUIState(currentPath) {
  // Update path input field
  const pathField = document.getElementById("file-browser-current-path");
  if (pathField) {
    // Only update if the field doesn't have focus (user isn't editing)
    if (document.activeElement !== pathField) {
      pathField.value = currentPath;
    }
  }
  
  // Track when the path field is manually changed
  if (pathField && !pathField.hasInputListener) {
    pathField.addEventListener('input', function() {
      // Mark that the path has been manually edited
      pathField.dataset.manuallyEdited = 'true';
    });
    pathField.hasInputListener = true;
  }
  
  // Enable up button if not at root
  const upButton = document.getElementById("file-browser-up");
  if (upButton) {
    const isRoot = currentPath === "/" || currentPath.match(/^[A-Z]:\\$/);
    upButton.disabled = isRoot;
  }
  
  // If in directory mode, always enable select button
  const selectButton = document.getElementById("file-browser-select");
  if (selectButton && fileBrowserState.isDirectory) {
    selectButton.disabled = false;
  }
  
  // In file mode, handle filename field updates
  if (!fileBrowserState.isDirectory) {
    const filenameField = document.getElementById("file-browser-filename");
    const selectButton = document.getElementById("file-browser-select");
    
    // Reset the select button if no filename is provided
    if (filenameField && selectButton) {
      // Enable select button if we have a filename or selected path
      const hasFilename = filenameField.value && filenameField.value.trim() !== '';
      const hasSelectedPath = fileBrowserState.selectedPath && 
                              !document.querySelector(`.file-item[data-path="${fileBrowserState.selectedPath}"][data-is-dir="true"]`);
      
      selectButton.disabled = !(hasFilename || hasSelectedPath);
    }
    
    // Only update filename when a file is explicitly selected
    if (filenameField && fileBrowserState.selectedPath) {
      const selectedItem = document.querySelector(`.file-item[data-path="${fileBrowserState.selectedPath}"]`);
      if (selectedItem && selectedItem.getAttribute("data-is-dir") !== "true") {
        const separator = fileBrowserState.selectedPath.includes('\\') ? '\\' : '/';
        const pathParts = fileBrowserState.selectedPath.split(separator);
        const filename = pathParts[pathParts.length - 1]; 
        
        // Only update if not manually edited
        if (!filenameField.dataset.manuallyEdited || filenameField.value === '') {
          filenameField.value = filename;
          filenameField.dataset.manuallyEdited = 'false';
        }
      }
    }
    
    // Track when the filename field is manually changed
    if (filenameField && !filenameField.hasInputListener) {
      filenameField.addEventListener('input', function() {
        // Mark that the filename has been manually edited
        filenameField.dataset.manuallyEdited = 'true';
        
        // Enable select button if we have any filename
        if (selectButton && filenameField.value && filenameField.value.trim() !== '') {
          selectButton.disabled = false;
        }
      });
      filenameField.hasInputListener = true;
    }
  }
}

/**
 * Load directory contents
 * @param {string} path - Path to load
 */
async function loadDirectory(path) {
  console.log("Loading directory:", path);
  
  // Show loading indicator
  const container = document.getElementById("file-browser-list");
  if (container) {
    container.innerHTML = `<div class="loading">Loading directory contents...</div>`;
  }
  
  try {
    // Fetch directory contents from API
    const response = await fetch(`/api/filesystem/directory?path=${encodeURIComponent(path)}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to load directory: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message || "Failed to load directory");
    }
    
    // Render file list
    renderFileList(data.items);
    
  } catch (error) {
    console.error("Error loading directory:", error);
    
    // Show error in file browser
    if (container) {
      container.innerHTML = `
        <div class="error-message">
          <i class="fa-solid fa-triangle-exclamation"></i> 
          Error loading directory: ${error.message}
        </div>
        <button class="button retry-btn" onclick="refreshFileBrowser()">
          <i class="fa-solid fa-arrows-rotate"></i> Retry
        </button>
      `;
    }
  }
}

// Export debug function to global scope
window.debugFileBrowser = debugFileBrowser;
window.attachEventHandlers = attachEventHandlers;
window.setupFileBrowser = setupFileBrowser;
window.initializeFileBrowser = initializeFileBrowser;
window.refreshFileBrowser = refreshFileBrowser;
window.selectPath = selectPath;
window.selectCurrentPath = selectCurrentPath;
window.loadRootLocations = loadRootLocations;
window.setupFileBrowserButtons = setupFileBrowserButtons;
