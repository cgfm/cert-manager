/**
 * Date utility functions for Certificate Manager
 * This module provides functions to parse, format, and manipulate dates related to certificates.
 * @module date-utils - Date utility functions
 * @requires window - Global object for accessing browser APIs
 * @requires document - DOM manipulation
 * @requires console - Console for logging messages
 * @requires logger - Logger utility for debugging
 * @requires fetch - Fetch API for making HTTP requests
 * @version 1.0.0
 * @license MIT
 * @author Christian Meiners
 * @description This module is designed to work with dates, providing functions to parse, format, and calculate differences between dates. It also includes functions to handle certificate expiration and display relevant information in a user-friendly manner.
 */

/**
 * Parse a date string safely
 * @param {string} dateStr - Date string to parse
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseDate(dateStr) {
    if (!dateStr) return null;
    
    try {
        const date = new Date(dateStr);
        return isNaN(date.getTime()) ? null : date;
    } catch (e) {
        logger.warn(`Failed to parse date: ${dateStr}`, e);
        return null;
    }
}

/**
 * Format a date into a human-readable string
 * @param {string|Date} date - The date to format
 * @returns {string} - Formatted date string
 */
function formatDate(date) {
    if (!date) return 'N/A';
    try {
        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) return 'Invalid date';
        return parsedDate.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        logger.error('Error formatting date:', error);
        return String(date);
    }
}

/**
 * Calculate days until a date
 * @param {Date|string} targetDate - Target date
 * @returns {number} Days until the date (negative if in past)
 */
function daysUntil(targetDate) {
    if (!targetDate) return null;
    
    if (typeof targetDate === 'string') {
        targetDate = parseDate(targetDate);
    }
    
    if (!targetDate || isNaN(targetDate.getTime())) {
        return null;
    }
    
    const now = new Date();
    const diffTime = targetDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}

/**
 * Get a CSS class based on how close a date is to expiry
 * @param {Date|string} expiryDate - The expiry date
 * @returns {string} CSS class name for styling
 */
function getExpiryClass(expiryDate) {
    const days = daysUntil(expiryDate);
    
    if (days === null) return 'unknown';
    if (days <= 0) return 'expired';
    if (days <= 7) return 'expiring-soon';
    if (days <= 30) return 'expiring';
    
    return 'valid';
}

/**
 * Get a human-readable description of time until expiry
 * @param {Date|string} expiryDate - The expiry date
 * @returns {string} Description of time until expiry
 */
function getExpiryText(expiryDate) {
    const days = daysUntil(expiryDate);
    
    if (days === null) return 'Unknown';
    if (days < 0) return `Expired ${Math.abs(days)} days ago`;
    if (days === 0) return 'Expires today';
    if (days === 1) return 'Expires tomorrow';
    if (days < 30) return `Expires in ${days} days`;
    
    const months = Math.floor(days / 30);
    return `Expires in ${months} month${months !== 1 ? 's' : ''}`;
}


/**
 * Format a date for display, with fallback for invalid dates
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date string
 */
function formatCertificateDate(date) {
    if (!date) return 'Not specified';
    
    if (typeof date === 'string') {
        date = parseCertificateDate(date);
    }
    
    if (!date || isNaN(date.getTime())) {
        return 'Invalid date';
    }
    
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    
    return date.toLocaleDateString(undefined, options);
}

/**
 * Safely parse a date string from a certificate
 * @param {string} dateStr - Date string to parse
 * @returns {Date|null} Parsed date or null if invalid
 */
function parseCertificateDate(dateStr) {
    if (!dateStr) return null;
    if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
    
    try {
        // Try direct parsing first
        let date = new Date(dateStr);
        
        // Check if valid
        if (!isNaN(date.getTime())) {
            return date;
        }
        
        // Use window.dateUtils if available, otherwise use basic parsing
        if (window.dateUtils && typeof window.dateUtils.parseDate === 'function') {
            return window.dateUtils.parseDate(dateStr);
        }
        
        // Various date formats to try
        const formats = [
            // Try direct Date parsing
            (d) => new Date(d),
            // Try ISO string
            (d) => new Date(d),
            // Try Unix timestamp (seconds)
            (d) => new Date(parseInt(d) * 1000),
            // Try Unix timestamp (milliseconds)
            (d) => new Date(parseInt(d))
        ];
        
        // Try each format
        for (const format of formats) {
            try {
                const date = format(dateStr);
                if (!isNaN(date.getTime())) {
                    // Valid date found
                    return date;
                }
            } catch (e) {
                // Continue to next format
            }
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
        logger.warn(`Failed to parse certificate date: ${dateStr}`);
        return null;
    } catch (error) {
        logger.error('Error parsing certificate date:', error);
        return null;
    }
}


/**
 * Calculate days remaining until a date
 * @param {Date|string} date - Target date
 * @returns {number|null} Days remaining or null if invalid
 */
function getDaysRemaining(date) {
    if (typeof date === 'string') {
        date = parseCertificateDate(date);
    }
    
    if (!date || isNaN(date.getTime())) {
        return null;
    }
    
    const now = new Date();
    const diffTime = date - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays;
}
// Make utilities available globally
if (typeof window !== 'undefined') {
    window.dateUtils = {
        parseDate,
        formatDate,
        daysUntil,
        getExpiryClass,
        getExpiryText,
        formatCertificateDate,
        parseCertificateDate,
        getDaysRemaining
    };
    logger.info('Date utilities registered in window object');
}

// Expose to window object
window.dateUtils = window.dateUtils || {};
window.dateUtils.formatDate = formatDate;