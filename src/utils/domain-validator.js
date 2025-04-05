/**
 * Utility functions for validating domains and IP addresses
 */

// Domain regex based on RFC 1034/1035 with some simplifications
const domainRegex = /^((?!-)[A-Za-z0-9-]{1,63}(?<!-)\.)+[A-Za-z]{2,}$/;
// IPv4 regex
const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
// IPv6 regex (simplified)
const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;

/**
 * Validates if a string is a valid domain name
 */
function isValidDomain(domain) {
    if (!domain) return false;
    
    // Check for wildcard domain
    if (domain.startsWith('*.')) {
        return domainRegex.test(domain.substring(2));
    }
    
    return domainRegex.test(domain);
}

/**
 * Validates if a string is a valid IPv4 address
 */
function isValidIPv4(ip) {
    if (!ipv4Regex.test(ip)) return false;
    
    // Check octets are in valid range (0-255)
    const octets = ip.split('.').map(Number);
    return octets.every(octet => octet >= 0 && octet <= 255);
}

/**
 * Validates if a string is a valid IPv6 address
 * This is a simplified check, not comprehensive
 */
function isValidIPv6(ip) {
    return ipv6Regex.test(ip);
}

/**
 * Validates if a string is a valid domain name or IP address
 */
function isValidDomainOrIP(value) {
    return isValidDomain(value) || isValidIPv4(value) || isValidIPv6(value);
}

module.exports = {
    isValidDomain,
    isValidIPv4,
    isValidIPv6,
    isValidDomainOrIP
};