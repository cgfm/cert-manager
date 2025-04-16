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

// Shared utility functions for the certificate manager

const certUtils = {
    /**
     * Safely parse a date string from a certificate
     * @param {string} dateStr - Date string to parse
     * @returns {Date|null} Parsed date or null if invalid
     */
    parseCertificateDate(dateStr) {
        if (!dateStr) return null;
        
        try {
            // Try direct parsing first
            let date = new Date(dateStr);
            
            // Check if valid
            if (!isNaN(date.getTime())) {
                return date;
            }
            
            // Try alternative formats
            // Format: "Nov 16 12:00:00 2022 GMT"
            const gmtMatch = /([A-Za-z]{3}\s+\d{1,2}\s+\d{1,2}:\d{2}:\d{2}\s+\d{4}\s+GMT)/.exec(dateStr);
            if (gmtMatch) {
                date = new Date(gmtMatch[1]);
                if (!isNaN(date.getTime())) {
                    return date;
                }
            }
            
            // Format: "2022-11-16T12:00:00.000Z" (ISO format)
            const isoMatch = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z)/.exec(dateStr);
            if (isoMatch) {
                date = new Date(isoMatch[1]);
                if (!isNaN(date.getTime())) {
                    return date;
                }
            }
            
            // Format: "20221116120000Z" (ASN.1 TIME)
            const asnMatch = /(\d{14}Z)/.exec(dateStr);
            if (asnMatch) {
                const matched = asnMatch[1];
                const year = matched.substring(0, 4);
                const month = matched.substring(4, 6);
                const day = matched.substring(6, 8);
                const hour = matched.substring(8, 10);
                const minute = matched.substring(10, 12);
                const second = matched.substring(12, 14);
                
                date = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
                if (!isNaN(date.getTime())) {
                    return date;
                }
            }
            
            // Failed to parse date
            console.warn(`Failed to parse certificate date: ${dateStr}`);
            return null;
        } catch (error) {
            console.error('Error parsing certificate date:', error);
            return null;
        }
    },

    /**
     * Format a date for display, with fallback for invalid dates
     * @param {Date|string} date - Date to format
     * @returns {string} Formatted date string
     */
    formatCertificateDate(date) {
        if (!date) return 'Not specified';
        
        if (typeof date === 'string') {
            date = this.parseCertificateDate(date);
        }
        
        if (!date || isNaN(date.getTime())) {
            return 'No date available';
        }
        
        const options = { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        return date.toLocaleDateString(undefined, options);
    },

    /**
     * Calculate days remaining until a date
     * @param {Date|string} date - Target date
     * @returns {number|null} Days remaining or null if invalid
     */
    getDaysRemaining(date) {
        if (typeof date === 'string') {
            date = this.parseCertificateDate(date);
        }
        
        if (!date || isNaN(date.getTime())) {
            return null;
        }
        
        const now = new Date();
        const diffTime = date - now;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return diffDays;
    }
};

// Make the utils globally available
window.certUtils = certUtils;

// Export functions for use in other modules
window.isValidDomainOrIP = isValidDomainOrIP;