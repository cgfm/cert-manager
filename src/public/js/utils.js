/**
 * Utility functions for the certificate manager 
 */

/**
 * Validates if a string is a valid domain name or IP address
 * @param {string} value - The domain or IP to validate
 * @returns {boolean} True if valid, false otherwise
 */
function isValidDomainOrIP(value) {
    if (!value) return false;
    
    // Handle wildcard domains
    if (value.startsWith('*.')) {
        // Remove the wildcard part and validate the rest
        return isValidDomainOrIP(value.substring(2));
    }
    
    // IPv4 validation
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    if (ipv4Regex.test(value)) {
        // Check each octet is in range 0-255
        const octets = value.split('.').map(Number);
        return octets.every(octet => octet >= 0 && octet <= 255);
    }
    
    // IPv6 validation (simplified)
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^::$|^([0-9a-fA-F]{1,4}:){0,6}:[0-9a-fA-F]{1,4}$/;
    if (ipv6Regex.test(value)) {
        return true;
    }
    
    // Domain name validation
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    if (domainRegex.test(value)) {
        return true;
    }
    
    // Allow localhost
    if (value === 'localhost') {
        return true;
    }
    
    return false;
}

/**
 * Display a notification message
 * @param {string} message - The message to display
 * @param {string} type - The type (success, error, warning)
 * @param {number} duration - How long to show the notification in ms
 */
function showNotification(message, type = 'info', duration = 3000) {
    // Remove any existing notifications
    const existingNotification = document.getElementById('notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Create notification element
    const notification = document.createElement('div');
    notification.id = 'notification';
    notification.className = `notification notification-${type}`;
    
    // Add icon based on type
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';
    
    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;
    
    // Add to body
    document.body.appendChild(notification);
    
    // Show notification with animation
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Hide after duration
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300); // Wait for fade-out animation
    }, duration);
}

// Add notification styles to the document head
function addNotificationStyles() {
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            .notification {
                position: fixed;
                top: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 6px;
                background-color: #f8f9fa;
                border-left: 4px solid #6c757d;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                display: flex;
                align-items: center;
                gap: 10px;
                transform: translateX(120%);
                transition: transform 0.3s ease-out;
                z-index: 1100;
                max-width: 90%;
            }
            
            .notification.show {
                transform: translateX(0);
            }
            
            .notification-success {
                background-color: #d4edda;
                border-left-color: #28a745;
            }
            
            .notification-error {
                background-color: #f8d7da;
                border-left-color: #dc3545;
            }
            
            .notification-warning {
                background-color: #fff3cd;
                border-left-color: #ffc107;
            }
            
            .notification i {
                font-size: 1.2em;
            }
            
            .notification-success i {
                color: #28a745;
            }
            
            .notification-error i {
                color: #dc3545;
            }
            
            .notification-warning i {
                color: #ffc107;
            }
            
            .notification-info i {
                color: #17a2b8;
            }
        `;
        document.head.appendChild(style);
    }
}

// Initialize utility functions
document.addEventListener('DOMContentLoaded', function() {
    addNotificationStyles();
});

// Export functions for use in other modules
window.isValidDomainOrIP = isValidDomainOrIP;
window.showNotification = showNotification;