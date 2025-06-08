# SSL Setup Guide

This comprehensive guide covers advanced SSL certificate setup, configuration options, and security best practices for Certificate Manager.

## Table of Contents

1. [Overview](#overview)
2. [Certificate Types](#certificate-types)
3. [Advanced Certificate Configuration](#advanced-certificate-configuration)
4. [Security Considerations](#security-considerations)
5. [Certificate Validation Methods](#certificate-validation-methods)
6. [Custom Certificate Authorities](#custom-certificate-authorities)
7. [Certificate Chains](#certificate-chains)
8. [Troubleshooting](#troubleshooting)

## Overview

Certificate Manager supports various SSL certificate configurations, from simple single-domain certificates to complex multi-domain certificates with custom validation methods.

### Key Features
- **Multiple Certificate Types**: DV, OV, EV certificates
- **Flexible Validation**: HTTP, DNS, manual validation
- **Custom Key Sizes**: RSA 2048-4096 bits, ECDSA support
- **Certificate Chains**: Full chain management
- **Custom CAs**: Support for private certificate authorities

## Certificate Types

### Domain Validated (DV) Certificates
Basic certificates that validate domain ownership only.

```javascript
// DV Certificate Configuration
{
  "type": "domain-validated",
  "commonName": "example.com",
  "subjectAltNames": ["www.example.com"],
  "validation": {
    "method": "http",
    "challengeType": "http-01"
  },
  "keyType": "rsa",
  "keySize": 2048,
  "validityDays": 90
}
```

### Organization Validated (OV) Certificates
Enhanced certificates that validate both domain and organization.

```javascript
// OV Certificate Configuration
{
  "type": "organization-validated",
  "commonName": "secure.example.com",
  "organization": "Example Corporation",
  "organizationalUnit": "IT Security",
  "locality": "San Francisco",
  "state": "California",
  "country": "US",
  "validation": {
    "method": "dns",
    "organizationValidation": true
  },
  "keyType": "rsa",
  "keySize": 3072,
  "validityDays": 365
}
```

### Extended Validation (EV) Certificates
Highest level certificates with comprehensive validation.

```javascript
// EV Certificate Configuration
{
  "type": "extended-validation",
  "commonName": "banking.example.com",
  "organization": "Example Bank Ltd",
  "serialNumber": "12345678",
  "jurisdictionCountry": "US",
  "businessCategory": "Private Organization",
  "validation": {
    "method": "manual",
    "extendedValidation": true,
    "legalEntityIdentifier": "LEI-CODE-123456"
  },
  "keyType": "ecdsa",
  "curve": "prime256v1",
  "validityDays": 365
}
```

## Advanced Certificate Configuration

### Multi-Domain Certificates (SAN)

Configure certificates for multiple domains:

```javascript
// Multi-domain certificate
{
  "commonName": "primary.example.com",
  "subjectAltNames": [
    "www.example.com",
    "api.example.com",
    "cdn.example.com",
    "mail.example.com"
  ],
  "maxDomains": 100,
  "validation": {
    "method": "dns",
    "bulkValidation": true
  }
}
```

### Wildcard Certificates

Generate certificates for all subdomains:

```javascript
// Wildcard certificate configuration
{
  "commonName": "*.example.com",
  "wildcardDomains": ["*.api.example.com", "*.cdn.example.com"],
  "validation": {
    "method": "dns", // Required for wildcards
    "challengeType": "dns-01"
  },
  "keyType": "rsa",
  "keySize": 2048
}
```

### Custom Key Configurations

#### RSA Keys
```javascript
// RSA key configuration
{
  "keyType": "rsa",
  "keySize": 4096, // 2048, 3072, 4096
  "keyFormat": "PEM",
  "encryption": {
    "enabled": false, // Set to true for encrypted private keys
    "passphrase": "secure-passphrase"
  }
}
```

#### ECDSA Keys
```javascript
// ECDSA key configuration
{
  "keyType": "ecdsa",
  "curve": "prime256v1", // prime256v1, secp384r1, secp521r1
  "keyFormat": "PEM",
  "performance": "high", // Faster than RSA
  "compatibility": "modern" // May not work with older systems
}
```

## Security Considerations

### Certificate Security Best Practices

#### Strong Key Generation
```javascript
// Secure key generation settings
{
  "keyGeneration": {
    "entropy": "high",
    "randomSource": "/dev/urandom",
    "secureRandom": true,
    "keyStrength": 4096
  },
  "security": {
    "hsts": true,
    "ocspStapling": true,
    "certificateTransparency": true
  }
}
```

#### Private Key Protection
```javascript
// Private key security
{
  "privateKey": {
    "encryption": {
      "enabled": true,
      "algorithm": "aes256",
      "passphrase": "strong-passphrase"
    },
    "storage": {
      "path": "/secure/keys/",
      "permissions": "600",
      "owner": "ssl-user",
      "backup": {
        "enabled": true,
        "encrypted": true,
        "location": "/secure/backups/"
      }
    }
  }
}
```

### Certificate Transparency

Enable Certificate Transparency logging:

```javascript
// CT configuration
{
  "certificateTransparency": {
    "enabled": true,
    "logs": [
      "https://ct.googleapis.com/logs/argon2023/",
      "https://ct.cloudflare.com/logs/nimbus2023/"
    ],
    "monitoring": {
      "enabled": true,
      "alertOnNewCerts": true,
      "webhookUrl": "https://monitoring.example.com/ct-alerts"
    }
  }
}
```

## Certificate Validation Methods

### HTTP Validation (HTTP-01)

Standard web-based validation:

```javascript
// HTTP validation configuration
{  "generation": {
    "method": "openssl",
    "keySize": 2048,
    "algorithm": "RSA",
    "validityDays": 365,
    "selfSigned": false,
    "signWithCA": true
  }
}
```

### DNS Validation (DNS-01)

DNS-based validation for wildcards and complex setups:

```javascript
// DNS validation configuration
{
  "validation": {
    "method": "dns",
    "challengeType": "dns-01",
    "dnsProvider": "cloudflare",
    "credentials": {
      "apiKey": "your-api-key",
      "email": "admin@example.com"
    },
    "propagationTimeout": 120,
    "pollingInterval": 10
  }
}
```

#### Supported DNS Providers

Configure popular DNS providers:

```javascript
// Cloudflare DNS
{
  "dnsProvider": "cloudflare",
  "credentials": {
    "apiToken": "your-api-token",
    "zoneId": "zone-id"
  }
}

// Route53 DNS
{
  "dnsProvider": "route53",
  "credentials": {
    "accessKeyId": "your-access-key",
    "secretAccessKey": "your-secret-key",
    "region": "us-east-1"
  }
}

// Google Cloud DNS
{
  "dnsProvider": "gcloud",
  "credentials": {
    "serviceAccountKey": "/path/to/service-account.json",
    "projectId": "your-project-id"
  }
}
```

### TLS-ALPN Validation (TLS-ALPN-01)

Advanced validation using TLS:

```javascript
// TLS-ALPN validation
{
  "validation": {
    "method": "tls-alpn",
    "challengeType": "tls-alpn-01",
    "port": 443,
    "bindAddress": "0.0.0.0",
    "timeout": 30
  }
}
```

## Custom Certificate Authorities

### Internal CA Setup

For private networks and development:

```javascript
// Internal CA configuration
{
  "certificateAuthority": {
    "type": "internal",
    "caName": "Example Internal CA",
    "caCertPath": "/ca/root-ca.crt",
    "caKeyPath": "/ca/root-ca.key",
    "intermediateCA": {
      "enabled": true,
      "certPath": "/ca/intermediate-ca.crt",
      "keyPath": "/ca/intermediate-ca.key"
    }
  }
}
```

### Self-Signed Certificates

For development and testing:

```javascript
// Self-signed certificate
{
  "certificateType": "self-signed",
  "selfSigned": {
    "issuer": {
      "commonName": "Development CA",
      "organization": "Development Team",
      "country": "US"
    },
    "validity": {
      "notBefore": "2024-01-01",
      "notAfter": "2025-01-01"
    },
    "extensions": {
      "basicConstraints": "CA:FALSE",
      "keyUsage": "keyEncipherment,dataEncipherment",
      "extKeyUsage": "serverAuth,clientAuth"
    }
  }
}
```

## Certificate Chains

### Full Chain Configuration

Properly configure certificate chains:

```javascript
// Certificate chain setup
{
  "certificateChain": {
    "includeRoot": false, // Don't include root CA
    "includeIntermediate": true,
    "chainOrder": [
      "leaf-certificate",
      "intermediate-ca",
      "root-ca"
    ],
    "validation": {
      "verifyChain": true,
      "checkRevocation": true,
      "ocspValidation": true
    }
  }
}
```

### Chain Verification

Validate certificate chains:

```javascript
// Chain verification settings
{
  "chainVerification": {
    "enabled": true,
    "strictMode": true,
    "allowSelfSigned": false,
    "checkExpiration": true,
    "verifyHostname": true,
    "trustedRoots": [
      "/etc/ssl/certs/ca-certificates.crt"
    ]
  }
}
```

## Advanced OpenSSL Configuration

### Custom OpenSSL Settings

Configure OpenSSL wrapper behavior:

```javascript
// OpenSSL configuration
{
  "openssl": {
    "binaryPath": "/usr/bin/openssl",
    "configFile": "/etc/ssl/openssl.cnf",
    "randomFile": "/dev/urandom",
    "cipherSuites": [
      "ECDHE-RSA-AES256-GCM-SHA384",
      "ECDHE-RSA-AES128-GCM-SHA256",
      "ECDHE-ECDSA-AES256-GCM-SHA384"
    ],
    "protocols": ["TLSv1.2", "TLSv1.3"],
    "options": {
      "no_sslv2": true,
      "no_sslv3": true,
      "no_tlsv1": true,
      "no_tlsv1_1": true
    }
  }
}
```

### Certificate Extensions

Configure X.509 extensions:

```javascript
// X.509 extensions
{
  "extensions": {
    "subjectAltName": {
      "dns": ["example.com", "www.example.com"],
      "ip": ["192.168.1.100"],
      "email": ["admin@example.com"]
    },
    "keyUsage": {
      "critical": true,
      "values": ["keyEncipherment", "dataEncipherment"]
    },
    "extendedKeyUsage": {
      "serverAuth": true,
      "clientAuth": false,
      "codeSigning": false
    },
    "basicConstraints": {
      "critical": true,
      "ca": false,
      "pathlen": null
    }
  }
}
```

## Troubleshooting

### Common SSL Issues

#### Certificate Chain Problems
```bash
# Verify certificate chain
openssl verify -CAfile ca-bundle.crt certificate.crt

# Check certificate details
openssl x509 -in certificate.crt -text -noout

# Test SSL connection
openssl s_client -connect example.com:443 -servername example.com
```

#### Key Mismatch Issues
```bash
# Compare certificate and key modulus
openssl x509 -noout -modulus -in certificate.crt | openssl md5
openssl rsa -noout -modulus -in private-key.key | openssl md5
```

#### Validation Failures
```javascript
// Debug validation issues
{
  "debug": {
    "validation": true,
    "verbose": true,
    "logLevel": "debug",
    "saveResponses": true,
    "outputPath": "/var/log/cert-debug/"
  }
}
```

### Performance Optimization

#### Certificate Generation Performance
```javascript
// Performance tuning
{
  "performance": {
    "parallelGeneration": true,
    "maxConcurrentJobs": 4,
    "keyGenerationThreads": 2,
    "cacheEnabled": true,
    "cacheSize": "100MB"
  }
}
```

#### Memory Optimization
```javascript
// Memory settings
{
  "memory": {
    "maxHeapSize": "1GB",
    "gcSettings": "optimized",
    "bufferSize": "64KB",
    "streamProcessing": true
  }
}
```

## Security Scanning

### Certificate Security Analysis

Configure security scanning:

```javascript
// Security scanning
{
  "securityScan": {
    "enabled": true,
    "scanInterval": "weekly",
    "checks": {
      "weakKeys": true,
      "expiredCerts": true,
      "revocationStatus": true,
      "vulnerabilities": true
    },
    "reporting": {
      "format": "json",
      "webhook": "https://security.example.com/cert-scan",
      "email": ["security@example.com"]
    }
  }
}
```

## Integration Examples

### Nginx Configuration
```nginx
server {
    listen 443 ssl http2;
    server_name example.com;
    
    ssl_certificate /path/to/certificate.crt;
    ssl_certificate_key /path/to/private.key;
    ssl_trusted_certificate /path/to/ca-bundle.crt;
    
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    
    ssl_stapling on;
    ssl_stapling_verify on;
}
```

### Apache Configuration
```apache
<VirtualHost *:443>
    ServerName example.com
    
    SSLEngine on
    SSLCertificateFile /path/to/certificate.crt
    SSLCertificateKeyFile /path/to/private.key
    SSLCertificateChainFile /path/to/ca-bundle.crt
    
    SSLProtocol -all +TLSv1.2 +TLSv1.3
    SSLCipherSuite ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256
    SSLHonorCipherOrder off
    
    SSLUseStapling on
    SSLStaplingCache shmcb:/tmp/stapling_cache(128000)
</VirtualHost>
```

---

**Next**: Learn about [Auto-Renewal](./auto-renewal.md) to automate certificate lifecycle management.