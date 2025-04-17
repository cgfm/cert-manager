/**
 * Comprehensive date utility functions
 */

/**
 * Parse a date string safely
 * @param {string} dateStr - Date string to parse
 * @returns {Date|null} - Parsed date or null if invalid
 */
function parseDate(dateStr) {
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
        
        // OpenSSL specific format
        const opensslMatch = /([A-Za-z]+\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})/.exec(dateStr);
        if (opensslMatch) {
            date = new Date(opensslMatch[1]);
            if (!isNaN(date.getTime())) {
                return date;
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error parsing date:', error);
        return null;
    }
}

/**
 * Format date for display
 * @param {Date|string} date - Date to format
 * @param {string} format - Simple format string
 * @returns {string} - Formatted date string or fallback text
 */
function formatDate(date, format = 'medium') {
    if (!date) return 'N/A';
    
    let dateObj;
    if (typeof date === 'string') {
        dateObj = parseDate(date);
    } else {
        dateObj = date;
    }
    
    if (!dateObj || isNaN(dateObj.getTime())) {
        return 'Invalid Date';
    }
    
    try {
        switch (format) {
            case 'short':
                return dateObj.toLocaleDateString();
                
            case 'medium': // Default
                return dateObj.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
                
            case 'long':
                return dateObj.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
                
            default:
                return dateObj.toLocaleDateString();
        }
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'Date Error';
    }
}

/**
 * Calculate days remaining until a date
 * @param {Date|string} date - Target date
 * @returns {number|null} Days remaining or null if invalid
 */
function getDaysRemaining(date) {
    // Your existing implementation
}

/**
 * Build certificate hierarchy
 * @param {Array} certificates - List of certificates
 * @param {Object} caMap - Map of certificate authorities
 * @returns {Array} - Hierarchical structure of certificates
 */
function buildCertificateHierarchy(certificates, caMap) {
    try {
        // Filter out invalid certificates first
        const validCertificates = certificates.filter(cert => 
            cert && cert.name && (cert.certType || cert.subject)
        );
        
        const rootCAs = [];
        const intermediate = [];
        const endEntity = [];
        
        // First pass: Categorize certificates
        validCertificates.forEach(cert => {
            // Ensure certType has a valid value
            const certType = cert.certType || 'standard';
            
            if (certType === 'rootCA') {
                rootCAs.push({ ...cert, children: [] });
            } else if (certType === 'intermediateCA') {
                intermediate.push({ ...cert, children: [] });
            } else {
                endEntity.push({ ...cert, children: [] });
            }
        });
        
    } catch (error) {
        logger.error(`Error building certificate hierarchy: ${error.message}`);
        return [];
    }
}

// Export as both module.exports (for Node) and window.dateUtils (for browser)
if (typeof window !== 'undefined') {
    window.dateUtils = {
        parseDate,
        formatDate,
        getDaysRemaining,
        buildCertificateHierarchy
    };
}

module.exports = {
    parseDate,
    formatDate,
    getDaysRemaining,
    buildCertificateHierarchy
};