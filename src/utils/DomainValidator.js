/**
 * @fileoverview Domain Validator - Server-side utility for validating domain names and IP addresses
 * @module utils/DomainValidator
 * @author Certificate Manager
 */

const FILENAME = 'utils/DomainValidator.js';

/**
 * Domain Validator utility class for validating domain names, wildcard domains, and IP addresses.
 * Provides static methods for server-side domain validation used in certificate operations.
 */
class DomainValidator {
    /**
     * Validate a standard domain name according to RFC specifications.
     * @static
     * @param {string} domain - Domain name to validate
     * @returns {boolean} True if the domain is valid, false otherwise
     * @example
     * DomainValidator.isValidDomain('example.com'); // returns true
     * DomainValidator.isValidDomain('localhost'); // returns true
     * DomainValidator.isValidDomain('invalid..domain'); // returns false
     */
    static isValidDomain(domain) {
        if (!domain || typeof domain !== 'string') {
            return false;
        }

        // Special case for localhost
        if (domain.toLowerCase() === 'localhost') {
            return true;
        }

        // Basic domain validation: letters, numbers, dots, hyphens
        // Must not start or end with a hyphen or dot
        // Each segment must be 1-63 characters
        // Top-level domain must be at least 2 characters
        const regex = /^([a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?$/i;
        return regex.test(domain);
    }    /**
     * Validate a wildcard domain name (e.g. *.example.com).
     * Ensures wildcard is only in the leftmost position and follows proper format.
     * @static
     * @param {string} domain - Wildcard domain to validate
     * @returns {boolean} True if the wildcard domain is valid, false otherwise
     * @example
     * DomainValidator.isValidWildcardDomain('*.example.com'); // returns true
     * DomainValidator.isValidWildcardDomain('sub.*.example.com'); // returns false
     */
    static isValidWildcardDomain(domain) {
        if (!domain || typeof domain !== 'string') {
            return false;
        }

        // Wildcard domain validation: starts with *. followed by a valid domain
        // Wildcard must be in leftmost position only
        const regex = /^\*\.([a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?$/i;
        return regex.test(domain);
    }    /**
     * Validate an IPv4 address according to standard format.
     * @static
     * @param {string} ip - IP address to validate
     * @returns {boolean} True if the IPv4 address is valid, false otherwise
     * @example
     * DomainValidator.isValidIPv4('192.168.1.1'); // returns true
     * DomainValidator.isValidIPv4('300.1.1.1'); // returns false
     */
    static isValidIPv4(ip) {
        if (!ip || typeof ip !== 'string') {
            return false;
        }

        // IPv4 validation: 4 octets of 0-255 separated by dots
        const regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        return regex.test(ip);
    }

    /**
     * Validate an IPv6 address
     * @param {string} ip - IPv6 address to validate
     * @returns {boolean} True if valid
     */
    static isValidIPv6(ip) {
        if (!ip || typeof ip !== 'string') {
            return false;
        }

        // Basic IPv6 validation
        // This is a simplified pattern - full IPv6 validation is quite complex
        try {
            // Use built-in URL constructor to validate (Node.js environment)
            const testURL = new URL(`http://[${ip}]`);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Validate a value as either domain or IP based on automatic detection
     * @param {string} value - Value to validate
     * @returns {object} Object with isValid and type properties
     */
    static validate(value) {
        if (!value || typeof value !== 'string') {
            return { isValid: false, type: null };
        }

        // Special case for localhost
        if (value.toLowerCase() === 'localhost') {
            return { isValid: true, type: 'domain' };
        }

        // Check if it's an IPv4 or IPv6 address
        if (this.isValidIPv4(value)) {
            return { isValid: true, type: 'ip' };
        }
        
        if (this.isValidIPv6(value)) {
            return { isValid: true, type: 'ip' };
        }
        
        // Check if it's a valid domain
        if (this.isValidDomain(value)) {
            return { isValid: true, type: 'domain' };
        }
        
        // Check if it's a valid wildcard domain
        if (this.isValidWildcardDomain(value)) {
            return { isValid: true, type: 'domain' };
        }
        
        // Not a valid domain or IP
        return { isValid: false, type: null };
    }
}

module.exports = DomainValidator;