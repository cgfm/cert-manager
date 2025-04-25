/**
 * Certificate Manager - Docker Utilities
 * Provides methods for interacting with Docker containers
 */

const DockerUtils = {
    /**
     * Check if Docker is available
     * @returns {Promise<boolean>} True if Docker is available
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
     * @returns {Promise<Array>} List of Docker containers
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