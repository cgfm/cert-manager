/**
 * Domain Validator
 * Utilities for validating domain names and IP addresses
 */
const DomainValidator = {
  /**
   * Validate a domain name
   * @param {string} domain - Domain name to validate
   * @returns {boolean} True if valid
   */
  isValidDomain: function(domain) {
    if (!domain) return false;
    
    // Check for overall length
    if (domain.length > 253) return false;
    
    // Regular expression for domain validation
    // - Can contain letters, numbers, hyphens
    // - Labels separated by periods
    // - No consecutive periods
    // - No hyphens at start or end of labels
    // - Labels max 63 chars
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
    
    if (!domainRegex.test(domain)) {
      // Special case: localhost is valid
      if (domain === 'localhost') return true;
      
      return false;
    }
    
    // Make sure no labels are longer than 63 chars
    const labels = domain.split('.');
    for (const label of labels) {
      if (label.length > 63) return false;
    }
    
    return true;
  },
  
  /**
   * Validate an IP address (IPv4 or IPv6)
   * @param {string} ip - IP address to validate
   * @returns {boolean} True if valid
   */
  isValidIP: function(ip) {
    return this.isValidIPv4(ip) || this.isValidIPv6(ip);
  },
  
  /**
   * Validate an IPv4 address
   * @param {string} ip - IPv4 address to validate
   * @returns {boolean} True if valid
   */
  isValidIPv4: function(ip) {
    if (!ip) return false;
    
    // Regular expression for IPv4 validation
    const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    return ipv4Regex.test(ip);
  },
  
  /**
   * Validate an IPv6 address
   * @param {string} ip - IPv6 address to validate
   * @returns {boolean} True if valid
   */
  isValidIPv6: function(ip) {
    if (!ip) return false;
    
    // Simplified and fixed regex for IPv6 validation
    const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7}([0-9a-fA-F]{1,4}|:)|([0-9a-fA-F]{1,4}:){6}(:[0-9a-fA-F]{1,4}|((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:)|([0-9a-fA-F]{1,4}:){5}(((:[0-9a-fA-F]{1,4}){1,2})|:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3})|:)|([0-9a-fA-F]{1,4}:){4}(((:[0-9a-fA-F]{1,4}){1,3})|((:[0-9a-fA-F]{1,4})?:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)|([0-9a-fA-F]{1,4}:){3}(((:[0-9a-fA-F]{1,4}){1,4})|((:[0-9a-fA-F]{1,4}){0,2}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)|([0-9a-fA-F]{1,4}:){2}(((:[0-9a-fA-F]{1,4}){1,5})|((:[0-9a-fA-F]{1,4}){0,3}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)|([0-9a-fA-F]{1,4}:){1}(((:[0-9a-fA-F]{1,4}){1,6})|((:[0-9a-fA-F]{1,4}){0,4}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)|(:(((:[0-9a-fA-F]{1,4}){1,7})|((:[0-9a-fA-F]{1,4}){0,5}:((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}))|:)))$/;
    
    return ipv6Regex.test(ip);
  },
    
  /**
   * Validate wildcard domain
   * @param {string} domain - Wildcard domain to validate (e.g., *.example.com)
   * @returns {boolean} True if valid
   */
  isValidWildcardDomain: function(domain) {
    if (!domain) return false;
    
    // Check if it starts with *. and has more after
    if (!domain.startsWith('*.') || domain.length <= 2) return false;
    
    // Validate the part after *. as a regular domain
    const baseDomain = domain.substring(2);
    return this.isValidDomain(baseDomain);
  },
  
  /**
   * Batch validate a list of domains
   * @param {Array|string} domains - Array of domains or newline-separated string
   * @returns {Object} Object with valid and invalid domains
   */
  validateDomains: function(domains) {
    let domainList = domains;
    
    // Convert string to array if needed
    if (typeof domains === 'string') {
      domainList = domains.split(/[\n,]/)
        .map(d => d.trim())
        .filter(d => d.length > 0);
    }
    
    const result = {
      valid: [],
      invalid: []
    };
    
    for (const domain of domainList) {
      if (this.isValidDomain(domain) || 
          this.isValidWildcardDomain(domain) || 
          this.isValidIP(domain)) {
        result.valid.push(domain);
      } else {
        result.invalid.push(domain);
      }
    }
    
    return result;
  },

  /**
   * Validate a value based on its type (domain or IP)
   * @param {string} value - The value to validate
   * @param {string} type - The type of value ('domain' or 'ip')
   * @returns {boolean} True if valid
   */
  validate: function(value, type) {
    if (!value) return false;
    
    if (type === 'ip') {
      return this.isValidIPv4(value) || this.isValidIPv6(value);
    } else {
      return this.isValidDomain(value) || this.isValidWildcardDomain(value);
    }
  }
};

// Export for use in other modules
window.DomainValidator = DomainValidator;