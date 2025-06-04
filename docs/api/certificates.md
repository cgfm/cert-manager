# Certificates API

The Certificates API provides comprehensive management of SSL/TLS certificates throughout their entire lifecycle. This includes creation, renewal, conversion, deployment, backup, and deletion operations.

## Table of Contents

- [Overview](#overview)
- [Certificate Object Structure](#certificate-object-structure)
- [Endpoints](#endpoints)
  - [List All Certificates](#list-all-certificates)
  - [Get Certificate Details](#get-certificate-details)
  - [Create Certificate](#create-certificate)
  - [Update Certificate](#update-certificate)
  - [Update Certificate Metadata](#update-certificate-metadata)
  - [Delete Certificate](#delete-certificate)
  - [Renew Certificate](#renew-certificate)
  - [Convert Certificate Format](#convert-certificate-format)
  - [Deploy Certificate](#deploy-certificate)
  - [Download Operations](#download-operations)
  - [File Management](#file-management)
  - [Subject Alternative Names (SAN)](#subject-alternative-names-san)
  - [Backup Operations](#backup-operations)
  - [Certificate History](#certificate-history)
  - [Passphrase Management](#passphrase-management)
  - [Certificate Groups](#certificate-groups)
  - [Verification Operations](#verification-operations)
- [Error Handling](#error-handling)
- [Examples](#examples)

## Overview

The Certificates API enables complete certificate lifecycle management:

- **Creation**: Generate new SSL/TLS certificates with custom domains and settings
- **Management**: Update certificate metadata, configurations, and Subject Alternative Names
- **Conversion**: Convert certificates between different formats (PEM, DER, PKCS#12, etc.)
- **Deployment**: Deploy certificates to various services and platforms
- **Backup & Recovery**: Create and restore certificate backups
- **History Tracking**: Maintain version history and change tracking
- **Security**: Manage passphrases and verify certificate integrity

## Certificate Object Structure

A certificate object contains the following properties:

```json
{
  "fingerprint": "string",
  "name": "string",
  "description": "string",
  "group": "string",
  "tags": ["string"],
  "metadata": {},
  "commonName": "string",
  "subject": "string",
  "issuer": "string",
  "serialNumber": "string",
  "validFrom": "string (ISO date)",
  "validTo": "string (ISO date)",
  "daysUntilExpiry": "number",
  "isExpired": "boolean",
  "isExpiringSoon": "boolean",
  "algorithm": "string",
  "keySize": "number",
  "signatureAlgorithm": "string",
  "version": "number",
  "sans": {
    "domains": ["string"],
    "idleDomains": ["string"],
    "ips": ["string"],
    "idleIps": ["string"]
  },
  "config": {
    "autoRenew": "boolean",
    "renewDaysBeforeExpiry": "number",
    "signWithCA": "boolean",
    "caFingerprint": "string",
    "deployActions": []
  },
  "paths": {
    "crt": "string",
    "key": "string",
    "pem": "string",
    "p12": "string",
    "csr": "string",
    "chain": "string",
    "fullchain": "string"
  },
  "hasPassphrase": "boolean",
  "isCA": "boolean",
  "createdAt": "string (ISO date)",
  "updatedAt": "string (ISO date)"
}
```

## Endpoints

### List All Certificates

Get a list of all certificates in the system.

**Endpoint:** `GET /api/certificates`

**Authentication:** Required

**Query Parameters:**
- `force` (boolean, optional): Force refresh from disk, bypassing cache

**Response (200):**
```json
{
  "certificates": [
    {
      "fingerprint": "abc123...",
      "name": "example.com",
      "commonName": "example.com",
      "validTo": "2025-12-31T23:59:59.000Z",
      "daysUntilExpiry": 365,
      "isExpired": false,
      "isExpiringSoon": false
    }
  ],
  "total": 1,
  "initializing": false
}
```

---

### Get Certificate Details

Retrieve detailed information about a specific certificate.

**Endpoint:** `GET /api/certificates/{fingerprint}`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Response (200):**
```json
{
  "fingerprint": "abc123...",
  "name": "example.com",
  "description": "Production SSL certificate",
  "group": "production",
  "commonName": "example.com",
  "subject": "CN=example.com,O=My Company,C=US",
  "issuer": "CN=My CA,O=My Company,C=US",
  "validFrom": "2024-01-01T00:00:00.000Z",
  "validTo": "2025-12-31T23:59:59.000Z",
  "daysUntilExpiry": 365,
  "sans": {
    "domains": ["example.com", "www.example.com"],
    "idleDomains": [],
    "ips": ["192.168.1.100"],
    "idleIps": []
  },
  "config": {
    "autoRenew": true,
    "renewDaysBeforeExpiry": 30
  },
  "paths": {
    "crt": "/path/to/cert.crt",
    "key": "/path/to/cert.key",
    "pem": "/path/to/cert.pem"
  }
}
```

---

### Create Certificate

Create a new SSL/TLS certificate.

**Endpoint:** `POST /api/certificates`

**Authentication:** Required

**Request Body:**
```json
{
  "name": "string (required)",
  "domains": ["string (required)"],
  "ips": ["string (optional)"],
  "certType": "standard|ca (optional, default: standard)",
  "signWithCA": "boolean (optional, default: false)",
  "caFingerprint": "string (optional)",
  "autoRenew": "boolean (optional, default: false)",
  "renewDaysBeforeExpiry": "number (optional, default: 30)",
  "passphrase": "string (optional)",
  "storePassphrase": "boolean (optional, default: false)"
}
```

**Response (201):**
```json
{
  "fingerprint": "abc123...",
  "name": "example.com",
  "message": "Certificate created successfully",
  "certificate": {
    "fingerprint": "abc123...",
    "name": "example.com",
    "commonName": "example.com",
    "validTo": "2025-12-31T23:59:59.000Z"
  }
}
```

---

### Update Certificate

Update certificate configuration settings.

**Endpoint:** `PUT /api/certificates/{fingerprint}`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Request Body:**
```json
{
  "autoRenew": "boolean (optional)",
  "renewDaysBeforeExpiry": "number (optional)",
  "signWithCA": "boolean (optional)",
  "caFingerprint": "string (optional)",
  "deployActions": "array (optional)"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Certificate updated successfully",
  "certificate": {
    "fingerprint": "abc123...",
    "config": {
      "autoRenew": true,
      "renewDaysBeforeExpiry": 30
    }
  }
}
```

---

### Update Certificate Metadata

Update certificate metadata (name, description, group, tags).

**Endpoint:** `PATCH /api/certificates/{fingerprint}`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Request Body:**
```json
{
  "name": "string (optional)",
  "description": "string (optional)",
  "group": "string (optional)",
  "tags": ["string"] (optional),
  "metadata": {} (optional)
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Certificate metadata updated successfully",
  "certificate": {
    "fingerprint": "abc123...",
    "name": "Updated Name",
    "description": "Updated description",
    "group": "production"
  }
}
```

---

### Delete Certificate

Delete a certificate and all associated files.

**Endpoint:** `DELETE /api/certificates/{fingerprint}`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Response (200):**
```json
{
  "success": true,
  "message": "Certificate deleted successfully"
}
```

---

### Renew Certificate

Renew an existing certificate.

**Endpoint:** `POST /api/certificates/{fingerprint}/renew`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Request Body:**
```json
{
  "force": "boolean (optional, default: false)"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Certificate renewed successfully",
  "certificate": {
    "fingerprint": "abc123...",
    "validTo": "2026-12-31T23:59:59.000Z",
    "daysUntilExpiry": 730
  }
}
```

---

### Convert Certificate Format

Convert a certificate to a different format.

**Endpoint:** `POST /api/certificates/{fingerprint}/convert`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Request Body:**
```json
{
  "format": "pem|der|p12|pfx|p7b|crt|cer (required)",
  "password": "string (required for p12/pfx formats)"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Certificate converted to P12 format successfully",
  "format": "p12",
  "filePath": "/path/to/certificate.p12"
}
```

---

### Deploy Certificate

Deploy a certificate using configured deployment actions.

**Endpoint:** `POST /api/certificates/{fingerprint}/deploy`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Response (200):**
```json
{
  "success": true,
  "results": [
    {
      "action": "docker-compose",
      "success": true,
      "message": "Deployed to Docker container successfully"
    }
  ]
}
```

---

## Download Operations

### Download Certificate Archive

Download all certificate files as a ZIP archive.

**Endpoint:** `GET /api/certificates/{fingerprint}/download`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Response (200):** ZIP file download with `Content-Disposition: attachment`

---

### Download Specific File

Download a specific certificate file.

**Endpoint:** `GET /api/certificates/{fingerprint}/download/{fileType}`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint
- `fileType` (string): File type (crt, key, pem, p12, pfx, csr, chain, fullchain, der, p7b, cer, ext)

**Response (200):** File download with appropriate MIME type

---

## File Management

### Get Available Files

Get a list of all available files for a certificate.

**Endpoint:** `GET /api/certificates/{fingerprint}/files`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Response (200):**
```json
[
  {
    "type": "crt",
    "path": "/path/to/cert.crt",
    "size": 1024
  },
  {
    "type": "key",
    "path": "/path/to/cert.key",
    "size": 2048
  }
]
```

---

## Subject Alternative Names (SAN)

### Get SAN Entries

Get all Subject Alternative Names for a certificate.

**Endpoint:** `GET /api/certificates/{fingerprint}/san`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Response (200):**
```json
{
  "domains": ["example.com", "www.example.com"],
  "idleDomains": ["staging.example.com"],
  "ips": ["192.168.1.100"],
  "idleIps": ["192.168.1.101"],
  "needsRenewal": true
}
```

---

### Add SAN Entry

Add a new domain or IP address to a certificate.

**Endpoint:** `POST /api/certificates/{fingerprint}/san`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Request Body:**
```json
{
  "value": "string (required)",
  "type": "domain|ip|auto (optional, default: auto)",
  "idle": "boolean (optional, default: true)"
}
```

**Response (201):**
```json
{
  "message": "Domain added successfully (idle until renewal)",
  "domains": ["example.com", "www.example.com"],
  "idleDomains": ["staging.example.com"],
  "ips": ["192.168.1.100"],
  "idleIps": [],
  "needsRenewal": true
}
```

---

### Remove SAN Entry

Remove a domain or IP address from a certificate.

**Endpoint:** `DELETE /api/certificates/{fingerprint}/san/{type}/{value}`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint
- `type` (string): Entry type (domain or ip)
- `value` (string): Domain name or IP address

**Query Parameters:**
- `idle` (boolean, optional): Remove from idle list instead of active list

**Response (200):**
```json
{
  "message": "Domain removed successfully",
  "domains": ["example.com"],
  "idleDomains": [],
  "ips": ["192.168.1.100"],
  "idleIps": [],
  "needsRenewal": false
}
```

---

### Apply Idle SAN Entries

Apply idle domains/IPs and renew the certificate.

**Endpoint:** `POST /api/certificates/{fingerprint}/san/apply`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Response (200):**
```json
{
  "message": "Idle domains and IPs applied and certificate renewed successfully",
  "success": true,
  "certificate": {
    "fingerprint": "abc123...",
    "validTo": "2026-12-31T23:59:59.000Z"
  }
}
```

---

## Backup Operations

### List Backups

Get all backups for a certificate.

**Endpoint:** `GET /api/certificates/{fingerprint}/backups`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Response (200):**
```json
[
  {
    "id": "backup123",
    "date": "2024-01-15T10:30:00.000Z",
    "size": 4096,
    "filename": "cert-backup-20240115.zip",
    "type": "manual"
  }
]
```

---

### Create Backup

Create a manual backup of a certificate.

**Endpoint:** `POST /api/certificates/{fingerprint}/backups`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Response (201):**
```json
{
  "message": "Backup created successfully",
  "backup": {
    "id": "backup123",
    "date": "2024-01-15T10:30:00.000Z",
    "size": 4096,
    "filename": "cert-backup-20240115.zip"
  }
}
```

---

### Download Backup

Download a specific backup file.

**Endpoint:** `GET /api/certificates/{fingerprint}/backups/{backupId}/download`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint
- `backupId` (string): Backup identifier

**Response (200):** ZIP file download

---

### Restore Backup

Restore a certificate from a backup.

**Endpoint:** `POST /api/certificates/{fingerprint}/backups/{backupId}/restore`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint
- `backupId` (string): Backup identifier

**Response (200):**
```json
{
  "message": "Backup restored successfully"
}
```

---

### Delete Backup

Delete a backup file.

**Endpoint:** `DELETE /api/certificates/{fingerprint}/backups/{backupId}`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint
- `backupId` (string): Backup identifier

**Response (200):**
```json
{
  "message": "Backup deleted successfully"
}
```

---

## Certificate History

### Get Version History

Get the version history of a certificate.

**Endpoint:** `GET /api/certificates/{fingerprint}/history`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Response (200):**
```json
{
  "version1": {
    "id": "version1",
    "date": "2024-01-01T00:00:00.000Z",
    "description": "Initial certificate creation",
    "type": "creation"
  },
  "version2": {
    "id": "version2",
    "date": "2024-06-01T00:00:00.000Z",
    "description": "Certificate renewal",
    "type": "renewal"
  }
}
```

---

### Download Historical Version

Download all files from a previous certificate version.

**Endpoint:** `GET /api/certificates/{fingerprint}/history/{previousFingerprint}/download`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Current certificate fingerprint
- `previousFingerprint` (string): Previous version fingerprint

**Response (200):** ZIP file download

---

### Download Historical File

Download a specific file from a previous certificate version.

**Endpoint:** `GET /api/certificates/{fingerprint}/history/{previousFingerprint}/files/{fileType}`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Current certificate fingerprint
- `previousFingerprint` (string): Previous version fingerprint
- `fileType` (string): File type

**Response (200):** File download

---

## Passphrase Management

### Check Passphrase

Check if a certificate has a stored passphrase.

**Endpoint:** `GET /api/certificates/{fingerprint}/passphrase`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Response (200):**
```json
{
  "hasPassphrase": true
}
```

---

### Store Passphrase

Store a passphrase for a certificate.

**Endpoint:** `POST /api/certificates/{fingerprint}/passphrase`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Request Body:**
```json
{
  "passphrase": "string (required)"
}
```

**Response (201):**
```json
{
  "success": true
}
```

---

### Delete Passphrase

Remove a stored passphrase for a certificate.

**Endpoint:** `DELETE /api/certificates/{fingerprint}/passphrase`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Response (200):**
```json
{
  "success": true
}
```

---

### Check Renewal Passphrases

Check if all required passphrases are available for renewal.

**Endpoint:** `GET /api/certificates/{fingerprint}/check-renewal-passphrases`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Response (200):**
```json
{
  "canRenew": true,
  "missingPassphrases": [],
  "availablePassphrases": ["cert", "ca"]
}
```

---

## Certificate Groups

### Get All Groups

Get a list of all certificate groups.

**Endpoint:** `GET /api/certificates/groups`

**Authentication:** Required

**Response (200):**
```json
{
  "groups": ["production", "staging", "development"]
}
```

---

## Verification Operations

### Verify Key Match

Verify that the certificate and private key match.

**Endpoint:** `GET /api/certificates/{fingerprint}/verify-key-match`

**Authentication:** Required

**Path Parameters:**
- `fingerprint` (string): Certificate fingerprint

**Response (200):**
```json
{
  "matches": true
}
```

---

## Error Handling

### Common Error Codes

| HTTP Status | Error Code | Description |
|-------------|------------|-------------|
| 400 | `VALIDATION_ERROR` | Request validation failed |
| 400 | `INVALID_FORMAT` | Unsupported certificate format |
| 400 | `MISSING_PASSPHRASE` | Passphrase required for operation |
| 404 | `CERT_NOT_FOUND` | Certificate not found |
| 404 | `FILE_NOT_FOUND` | Certificate file not found |
| 404 | `BACKUP_NOT_FOUND` | Backup not found |
| 409 | `CERT_EXISTS` | Certificate already exists |
| 422 | `RENEWAL_FAILED` | Certificate renewal failed |
| 500 | `GENERATION_ERROR` | Certificate generation failed |
| 500 | `CONVERSION_ERROR` | Format conversion failed |
| 503 | `SERVICE_INITIALIZING` | Certificate manager still initializing |

### Error Response Format

```json
{
  "success": false,
  "message": "Certificate not found",
  "error": "CERT_NOT_FOUND",
  "statusCode": 404,
  "details": {
    "fingerprint": "abc123..."
  }
}
```

## Examples

### Complete Certificate Lifecycle

```bash
# 1. Login first
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"username": "admin", "password": "password"}'

# 2. Create a new certificate
curl -X POST http://localhost:3000/api/certificates \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "example.com",
    "domains": ["example.com", "www.example.com"],
    "ips": ["192.168.1.100"],
    "autoRenew": true,
    "renewDaysBeforeExpiry": 30
  }' | jq

# 3. Get certificate details
FINGERPRINT="abc123..."
curl -X GET http://localhost:3000/api/certificates/$FINGERPRINT \
  -b cookies.txt | jq

# 4. Add a new domain (idle until renewal)
curl -X POST http://localhost:3000/api/certificates/$FINGERPRINT/san \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "value": "api.example.com",
    "type": "domain",
    "idle": true
  }' | jq

# 5. Apply idle domains and renew
curl -X POST http://localhost:3000/api/certificates/$FINGERPRINT/san/apply \
  -b cookies.txt | jq

# 6. Convert to P12 format
curl -X POST http://localhost:3000/api/certificates/$FINGERPRINT/convert \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "format": "p12",
    "password": "securepassword"
  }' | jq

# 7. Create a backup
curl -X POST http://localhost:3000/api/certificates/$FINGERPRINT/backups \
  -b cookies.txt | jq

# 8. Download certificate files
curl -X GET http://localhost:3000/api/certificates/$FINGERPRINT/download \
  -b cookies.txt \
  -o certificate-files.zip

# 9. Deploy certificate
curl -X POST http://localhost:3000/api/certificates/$FINGERPRINT/deploy \
  -b cookies.txt | jq
```

### JavaScript Example

```javascript
class CertificateManager {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async createCertificate(certData) {
    const response = await fetch(`${this.baseUrl}/api/certificates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(certData)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async getCertificate(fingerprint) {
    const response = await fetch(`${this.baseUrl}/api/certificates/${fingerprint}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async addSanEntry(fingerprint, value, type = 'auto', idle = true) {
    const response = await fetch(`${this.baseUrl}/api/certificates/${fingerprint}/san`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ value, type, idle })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async renewCertificate(fingerprint, force = false) {
    const response = await fetch(`${this.baseUrl}/api/certificates/${fingerprint}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ force })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async convertCertificate(fingerprint, format, password) {
    const response = await fetch(`${this.baseUrl}/api/certificates/${fingerprint}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ format, password })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async downloadCertificate(fingerprint) {
    const response = await fetch(`${this.baseUrl}/api/certificates/${fingerprint}/download`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.blob();
  }
}

// Usage example
const cm = new CertificateManager('http://localhost:3000');

// Create a certificate
const newCert = await cm.createCertificate({
  name: 'example.com',
  domains: ['example.com', 'www.example.com'],
  autoRenew: true,
  renewDaysBeforeExpiry: 30
});

console.log('Created certificate:', newCert.fingerprint);

// Add a new domain
await cm.addSanEntry(newCert.fingerprint, 'api.example.com', 'domain', true);

// Convert to P12 format
const conversion = await cm.convertCertificate(newCert.fingerprint, 'p12', 'password123');
console.log('Converted to P12:', conversion.filePath);

// Download certificate files
const zipBlob = await cm.downloadCertificate(newCert.fingerprint);
const url = URL.createObjectURL(zipBlob);
const a = document.createElement('a');
a.href = url;
a.download = 'certificate-files.zip';
a.click();
```

### Python Example

```python
import requests
import json

class CertificateManager:
    def __init__(self, base_url):
        self.base_url = base_url
        self.session = requests.Session()
    
    def login(self, username, password):
        """Login and establish session"""
        response = self.session.post(f'{self.base_url}/api/auth/login', json={
            'username': username,
            'password': password
        })
        response.raise_for_status()
        return response.json()
    
    def create_certificate(self, cert_data):
        """Create a new certificate"""
        response = self.session.post(f'{self.base_url}/api/certificates', json=cert_data)
        response.raise_for_status()
        return response.json()
    
    def get_certificate(self, fingerprint):
        """Get certificate details"""
        response = self.session.get(f'{self.base_url}/api/certificates/{fingerprint}')
        response.raise_for_status()
        return response.json()
    
    def add_san_entry(self, fingerprint, value, entry_type='auto', idle=True):
        """Add a SAN entry to certificate"""
        response = self.session.post(f'{self.base_url}/api/certificates/{fingerprint}/san', json={
            'value': value,
            'type': entry_type,
            'idle': idle
        })
        response.raise_for_status()
        return response.json()
    
    def renew_certificate(self, fingerprint, force=False):
        """Renew a certificate"""
        response = self.session.post(f'{self.base_url}/api/certificates/{fingerprint}/renew', json={
            'force': force
        })
        response.raise_for_status()
        return response.json()
    
    def download_certificate(self, fingerprint, output_path):
        """Download certificate ZIP file"""
        response = self.session.get(f'{self.base_url}/api/certificates/{fingerprint}/download')
        response.raise_for_status()
        
        with open(output_path, 'wb') as f:
            f.write(response.content)
        
        return output_path

# Usage example
cm = CertificateManager('http://localhost:3000')

# Login
cm.login('admin', 'password')

# Create certificate
new_cert = cm.create_certificate({
    'name': 'example.com',
    'domains': ['example.com', 'www.example.com'],
    'autoRenew': True,
    'renewDaysBeforeExpiry': 30
})

print(f"Created certificate: {new_cert['fingerprint']}")

# Add SAN entry
cm.add_san_entry(new_cert['fingerprint'], 'api.example.com')

# Download certificate
cm.download_certificate(new_cert['fingerprint'], 'certificate-files.zip')
print("Certificate files downloaded")
```

This Certificates API provides comprehensive management capabilities for SSL/TLS certificates, enabling full automation of certificate lifecycle operations from creation to deployment and renewal.