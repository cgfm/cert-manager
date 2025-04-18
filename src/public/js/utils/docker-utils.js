/**
 * Docker Utilities
 * This module provides utility functions for interacting with Docker containers.
 * It includes functions to fetch Docker containers, lazy load them, and manage caching.
 * @module docker-utils - Docker Utilities
 * @requires window - Global object for accessing browser APIs
 * @requires document - DOM manipulation
 * @requires fetch - Fetch API for making HTTP requests
 * @requires console - Console for logging messages
 * @requires logger - Logger utility for debugging
 * @version 1.0.0
 * @license MIT
 * @author Christian Meiners
 * @description This module is designed to work with Docker containers, providing functions to fetch and display them in a user-friendly manner. It also includes caching mechanisms to optimize performance and reduce unnecessary API calls.
 */

// Cache for Docker containers data
const dockerCache = {
    containers: null,
    timestamp: 0,
    ttl: 60000 // Cache validity in ms (60 seconds)
};

// Modify the Docker container fetching to use cache
async function fetchDockerContainers() {
    const now = Date.now();
    
    // Return cached data if it's still valid
    if (dockerCache.containers && (now - dockerCache.timestamp < dockerCache.ttl)) {
        return dockerCache.containers;
    }
    
    try {
        const response = await fetch('/api/docker/containers');
        const result = await response.json();
        
        // Update cache
        if (result.success) {
            dockerCache.containers = result.containers;
            dockerCache.timestamp = now;
        }
        
        return result.containers || [];
    } catch (error) {
        logger.error('Error fetching Docker containers:', error);
        return [];
    }
}

// Add this function to lazy load Docker containers only when needed
function lazyLoadDockerContainers(paramContainer) {
    // Show loading message
    paramContainer.innerHTML = `
        <div class="docker-container-msg">
            <i class="fas fa-spinner fa-spin"></i> Fetching Docker containers...
        </div>
    `;
    
    // Use setTimeout to defer the API call slightly for better UI responsiveness
    setTimeout(async () => {
        try {
            // Use the new Docker API endpoint
            const response = await fetch('/api/docker/containers');
            const result = await response.json();
            
            if (result.success && result.containers && result.containers.length > 0) {
                // Create select element for containers
                const select = document.createElement('select');
                select.id = 'actionParams';
                select.className = 'container-select';
                
                // Add empty option
                const emptyOption = document.createElement('option');
                emptyOption.value = '';
                emptyOption.textContent = '-- Select a container --';
                select.appendChild(emptyOption);
                
                // Add container options
                result.containers.forEach(container => {
                    const option = document.createElement('option');
                    const name = container.Names && container.Names.length > 0 
                        ? container.Names[0].replace(/^\//, '') 
                        : container.Id.substring(0, 12);
                    
                    // Show status alongside name
                    const status = container.State || 'unknown';
                    option.textContent = `${name} (${status})`;
                    
                    select.appendChild(option);
                });
                
                // Replace loading message with select
                paramContainer.innerHTML = '';
                paramContainer.appendChild(select);
                
                // Add status indicator
                const statusDiv = document.createElement('div');
                statusDiv.className = 'docker-container-msg';
                statusDiv.innerHTML = `<i class="fas fa-info-circle"></i> ${result.containers.length} containers found`;
                paramContainer.appendChild(statusDiv);
            } else {
                paramContainer.innerHTML = `
                    <div class="docker-container-msg warning-message">
                        <i class="fas fa-exclamation-triangle"></i> 
                        No Docker containers found or Docker not available.
                    </div>
                    <input type="text" id="actionParams" placeholder="Enter container ID manually">
                `;
            }
        } catch (error) {
            logger.error('Error checking for Docker containers:', error);
            
            paramContainer.innerHTML = `
                <div class="docker-container-msg error-message">
                    <i class="fas fa-exclamation-triangle"></i> 
                    Error: ${error.message || 'Failed to connect to Docker'}
                </div>
                <input type="text" id="actionParams" placeholder="Enter container ID manually">
            `;
        }
    }, 100);
}

// Make utilities available globally
if (typeof window !== 'undefined') {
    window.dockerUtils = {
        fetchDockerContainers,
        lazyLoadDockerContainers
    };
    logger.info('Docker utilities registered in window object');
}