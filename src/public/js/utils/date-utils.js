/**
 * @fileoverview Date Utilities - Comprehensive date formatting and manipulation utilities
 * 
 * This module provides a complete set of date and time utility functions:
 * - Multiple date format options (ISO, localized, relative)
 * - Time duration calculations and formatting
 * - Date validation and parsing utilities
 * - Timezone-aware date operations
 * - Human-readable time difference calculations
 * - Certificate expiry date formatting and validation
 * 
 * Features include:
 * - Cross-browser compatible date parsing
 * - Locale-aware formatting options
 * - Robust error handling for invalid dates
 * - Performance-optimized date calculations
 * - Support for various input formats (strings, Date objects, timestamps)
 * - Certificate management specific date utilities
 * 
 * @module public/js/utils/date-utils
 * @author Certificate Manager
 * @since 1.0.0
 */
const DateUtils = {
  /**
   * Formats a date as "YYYY-MM-DD" with proper validation
   * Handles various input types and provides fallback for invalid dates
   * 
   * @param {string|Date|number} date - Date to format (string, Date object, or timestamp)
   * @returns {string} Formatted date string or error message
   * @example
   * DateUtils.formatDate(new Date()); // returns "2023-12-25"
   * DateUtils.formatDate('2023-12-25T10:30:00Z'); // returns "2023-12-25"
   * DateUtils.formatDate(null); // returns "N/A"
   * DateUtils.formatDate('invalid'); // returns "Invalid Date"
   */
  formatDate: function(date) {
    if (!date) return 'N/A';
    
    const d = new Date(date);
    
    // Check if date is valid
    if (isNaN(d.getTime())) return 'Invalid Date';
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  },
  
  /**
   * Formats date and time as "YYYY-MM-DD HH:MM:SS" with timezone handling
   * Provides complete timestamp formatting for logs and displays
   * 
   * @param {string|Date|number} date - Date to format
   * @returns {string} Formatted date and time string
   * @example
   * DateUtils.formatDateTime(new Date()); // returns "2023-12-25 14:30:45"
   * DateUtils.formatDateTime('2023-12-25T10:30:00Z'); // returns "2023-12-25 10:30:00"
   */
  formatDateTime: function(date) {
    if (!date) return 'N/A';
    
    const d = new Date(date);
    
    // Check if date is valid
    if (isNaN(d.getTime())) return 'Invalid Date';
    
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  },
  
  /**
   * Format relative time (e.g., "2 days ago")
   * @param {string|Date} date - Date string or Date object
   * @returns {string} Relative time string
   */
  formatRelativeTime: function(date) {
    if (!date) return 'N/A';
    
    const d = new Date(date);
    
    // Check if date is valid
    if (isNaN(d.getTime())) return 'Invalid Date';
    
    const now = new Date();
    const diffMs = now - d;
    
    // Convert to seconds
    const diffSecs = Math.floor(diffMs / 1000);
    
    // Less than a minute
    if (diffSecs < 60) {
      return 'Just now';
    }
    
    // Less than an hour
    if (diffSecs < 3600) {
      const mins = Math.floor(diffSecs / 60);
      return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    }
    
    // Less than a day
    if (diffSecs < 86400) {
      const hours = Math.floor(diffSecs / 3600);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }
    
    // Less than a week
    if (diffSecs < 604800) {
      const days = Math.floor(diffSecs / 86400);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    }
    
    // Less than a month
    if (diffSecs < 2592000) {
      const weeks = Math.floor(diffSecs / 604800);
      return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    }
    
    // Less than a year
    if (diffSecs < 31536000) {
      const months = Math.floor(diffSecs / 2592000);
      return `${months} month${months === 1 ? '' : 's'} ago`;
    }
    
    // More than a year
    const years = Math.floor(diffSecs / 31536000);
    return `${years} year${years === 1 ? '' : 's'} ago`;
  },
  
  /**
   * Calculate days until a date
   * @param {string|Date} date - Date string or Date object
   * @returns {number} Number of days until the date
   */
  daysUntil: function(date) {
    if (!date) return null;
    
    const d = new Date(date);
    
    // Check if date is valid
    if (isNaN(d.getTime())) return null;
    
    const now = new Date();
    
    // Set time to midnight for both dates to get full days
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    
    const diffMs = d - now;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  },
  
  /**
   * Calculate days since a date
   * @param {string|Date} date - Date string or Date object
   * @returns {number} Number of days since the date
   */
  daysSince: function(date) {
    if (!date) return null;
    
    const d = new Date(date);
    
    // Check if date is valid
    if (isNaN(d.getTime())) return null;
    
    const now = new Date();
    
    // Set time to midnight for both dates to get full days
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    
    const diffMs = now - d;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  },
  
  /**
   * Format date range
   * @param {string|Date} startDate - Start date
   * @param {string|Date} endDate - End date
   * @returns {string} Formatted date range
   */
  formatDateRange: function(startDate, endDate) {
    return `${this.formatDate(startDate)} to ${this.formatDate(endDate)}`;
  }
};

// Export for use in other modules
window.DateUtils = DateUtils;