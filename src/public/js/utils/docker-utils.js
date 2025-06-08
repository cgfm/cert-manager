/**
 * @fileoverview Docker Utilities - Client-side Docker container interaction utilities
 * 
 * This module provides functions for interacting with Docker containers from the client:
 * - Docker service availability detection
 * - Container listing and status checking
 * - Container lifecycle management (start, stop, restart)
 * - Container inspection and monitoring
 * - Error handling for Docker API communication
 * 
 * Features include:
 * - Asynchronous API communication with proper error handling
 * - Container status monitoring with real-time updates
 * - Support for Docker engine availability checking
 * - Cross-platform Docker interaction support
 * - Comprehensive container metadata retrieval
 * 
 * @module public/js/utils/docker-utils
 * @requires fetch - Modern Fetch API for HTTP requests
 * @author Certificate Manager
 * @since 1.0.0
 */

const DockerUtils = {
    /**
     * Check if Docker is available
     * Tests connectivity to the Docker API endpoint
     * 
     * @async
     * @returns {Promise<boolean>} True if Docker is available and responsive
     * @example
     * const isAvailable = await DockerUtils.isDockerAvailable();
     * if (isAvailable) {
     *     console.log('Docker is available');
     * }
     */
    async isDockerAvailable() {
        try {
            const response = await fetch('/api/docker/status');
            
            if (!response.ok) {
                return false;
            }
            
            const result = await response.json();
            return result.available === true;
        } catch (error) {
            console.error('Error checking Docker availability:', error);
            return false;
        }
    },
    
    /**
     * Get list of Docker containers
     * Returns both running and stopped containers with status information
     * 
     * @async
     * @returns {Promise<Array>} Array of container objects with metadata
     * @throws {Error} When Docker API is unreachable or returns an error
     * @example
     * try {
     *     const containers = await DockerUtils.getContainers();
     *     containers.forEach(container => {
     *         console.log(`${container.name}: ${container.status}`);
     *     });
     * } catch (error) {
     *     console.error('Failed to get containers:', error);
     * }
     */
    async getContainers() {
        try {
            const response = await fetch('/api/docker/containers');
            
            if (!response.ok) {
                throw new Error(`Failed to get containers: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error getting Docker containers:', error);
            throw error;
        }
    },
    
    /**
     * Restart a Docker container
     * @param {string} containerId - Container ID or name
     * @returns {Promise<Object>} Result object
     */
    async restartContainer(containerId) {
        try {
            const response = await fetch(`/api/docker/containers/${containerId}/restart`, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`Failed to restart container: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error restarting Docker container:', error);
            throw error;
        }
    },
    
    /**
     * Execute a command in a Docker container
     * @param {string} containerId - Container ID or name
     * @param {string} command - Command to execute
     * @returns {Promise<Object>} Result with stdout and stderr
     */
    async executeCommand(containerId, command) {
        try {
            const response = await fetch(`/api/docker/containers/${containerId}/exec`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ command })
            });
            
            if (!response.ok) {
                throw new Error(`Failed to execute command: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error executing command in Docker container:', error);
            throw error;
        }
    },
    
    /**
     * Copy a file to a Docker container
     * @param {string} containerId - Container ID or name
     * @param {string} sourcePath - Source path on host
     * @param {string} destPath - Destination path in container
     * @returns {Promise<Object>} Result object
     */
    async copyToContainer(containerId, sourcePath, destPath) {
        try {
            const formData = new FormData();
            formData.append('sourcePath', sourcePath);
            formData.append('destPath', destPath);
            
            const response = await fetch(`/api/docker/containers/${containerId}/copy`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`Failed to copy file: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('Error copying file to Docker container:', error);
            throw error;
        }
    },
    
    /**
     * Get Docker container names for dropdowns
     * @returns {Promise<Array<{id: string, name: string}>>} Container options
     */
    async getContainerOptions() {
        try {
            const containers = await this.getContainers();
            
            return containers.map(container => {
                const name = container.Names[0].replace(/^\//, '');
                return {
                    id: container.Id,
                    name
                };
            });
        } catch (error) {
            console.error('Error getting container options:', error);
            return [];
        }
    },
    
    /**
     * Populate a select element with container options
     * @param {HTMLSelectElement} selectElement - The select element to populate
     * @returns {Promise<void>}
     */
    async populateContainerSelect(selectElement) {
        try {
            const options = await this.getContainerOptions();
            
            // Clear existing options
            selectElement.innerHTML = '';
            
            // Add empty option
            const emptyOption = document.createElement('option');
            emptyOption.value = '';
            emptyOption.textContent = '- Select container -';
            selectElement.appendChild(emptyOption);
            
            // Add container options
            options.forEach(option => {
                const optionElement = document.createElement('option');
                optionElement.value = option.name; // Use name as it's more user-friendly
                optionElement.textContent = option.name;
                optionElement.dataset.id = option.id; // Store ID as data attribute
                selectElement.appendChild(optionElement);
            });
        } catch (error) {
            console.error('Error populating container select:', error);
            
            // Add error option
            selectElement.innerHTML = '<option value="">Error loading containers</option>';
        }
    }
};

// Export to global scope
window.DockerUtils = DockerUtils;