# Certificate Authority (CA) API

This section documents the Certificate Authority API endpoints for the Certificate Manager application. The CA API provides access to Certificate Authority certificates in the system.

## Base URL

All CA endpoints are relative to the base API URL:
```
/api/ca
```

## Authentication

All CA endpoints require authentication. Include the session cookie or authentication token in your requests.

## CA Certificate Object

CA certificates returned by the API have the following structure:

```json
{
  "id": "string",
  "name": "string",
  "commonName": "string",
  "organization": "string",
  "organizationalUnit": "string",
  "country": "string",
  "state": "string",
  "locality": "string",
  "validFrom": "string (ISO 8601)",
  "validTo": "string (ISO 8601)",
  "serialNumber": "string",
  "fingerprint": "string",
  "issuer": "string",
  "subject": "string",
  "keyUsage": ["array of strings"],
  "extendedKeyUsage": ["array of strings"],
  "subjectAltNames": ["array of strings"],
  "isCA": true,
  "pathLength": "number",
  "status": "string",
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

## Endpoints

### Get All CA Certificates

Retrieves all Certificate Authority certificates in the system.

**Endpoint:** `GET /api/ca`

**Authentication:** Required

**Parameters:** None

**Response:**

- **200 OK**: Returns an array of CA certificate objects
- **401 Unauthorized**: Authentication required
- **500 Internal Server Error**: Server error

**Response Format:**
```json
[
  {
    "id": "ca-root-001",
    "name": "Root CA Certificate",
    "commonName": "MyCompany Root CA",
    "organization": "MyCompany Inc",
    "organizationalUnit": "IT Department",
    "country": "US",
    "state": "California",
    "locality": "San Francisco",
    "validFrom": "2023-01-01T00:00:00Z",
    "validTo": "2033-01-01T00:00:00Z",
    "serialNumber": "1a2b3c4d5e6f",
    "fingerprint": "SHA256:aa:bb:cc:dd:ee:ff:00:11:22:33:44:55:66:77:88:99",
    "issuer": "CN=MyCompany Root CA,O=MyCompany Inc,C=US",
    "subject": "CN=MyCompany Root CA,O=MyCompany Inc,C=US",
    "keyUsage": ["keyCertSign", "cRLSign"],
    "extendedKeyUsage": [],
    "subjectAltNames": [],
    "isCA": true,
    "pathLength": 0,
    "status": "active",
    "createdAt": "2023-01-01T00:00:00Z",
    "updatedAt": "2023-01-01T00:00:00Z"
  }
]
```

## Code Examples

### cURL

```bash
# Get all CA certificates
curl -X GET "https://your-cert-manager.com/api/ca" \
  -H "Content-Type: application/json" \
  -b "session=your-session-cookie"
```

### JavaScript (Fetch API)

```javascript
// Get all CA certificates
async function getCACertificates() {
  try {
    const response = await fetch('/api/ca', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'  // Include session cookie
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const caCertificates = await response.json();
    return caCertificates;
  } catch (error) {
    console.error('Error fetching CA certificates:', error);
    throw error;
  }
}

// Usage
getCACertificates()
  .then(caCerts => {
    console.log('CA Certificates:', caCerts);
    caCerts.forEach(cert => {
      console.log(`CA: ${cert.commonName} (Valid until: ${cert.validTo})`);
    });
  })
  .catch(error => {
    console.error('Failed to get CA certificates:', error);
  });
```

### JavaScript (Axios)

```javascript
const axios = require('axios');

// Configure axios instance
const api = axios.create({
  baseURL: 'https://your-cert-manager.com/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Get all CA certificates
async function getCACertificates() {
  try {
    const response = await api.get('/ca');
    return response.data;
  } catch (error) {
    console.error('Error fetching CA certificates:', error.response?.data || error.message);
    throw error;
  }
}

// Usage
getCACertificates()
  .then(caCerts => {
    console.log(`Found ${caCerts.length} CA certificate(s)`);
    caCerts.forEach(cert => {
      console.log(`- ${cert.commonName} (${cert.organization})`);
    });
  });
```

### Python (requests)

```python
import requests
from datetime import datetime

class CACertificateAPI:
    def __init__(self, base_url, session_cookie=None):
        self.base_url = base_url
        self.session = requests.Session()
        if session_cookie:
            self.session.cookies.set('session', session_cookie)
    
    def get_ca_certificates(self):
        """Get all CA certificates"""
        try:
            response = self.session.get(f"{self.base_url}/api/ca")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching CA certificates: {e}")
            raise

# Usage
api = CACertificateAPI('https://your-cert-manager.com')

try:
    ca_certificates = api.get_ca_certificates()
    print(f"Found {len(ca_certificates)} CA certificate(s):")
    
    for cert in ca_certificates:
        valid_to = datetime.fromisoformat(cert['validTo'].replace('Z', '+00:00'))
        days_until_expiry = (valid_to - datetime.now().replace(tzinfo=valid_to.tzinfo)).days
        
        print(f"- {cert['commonName']}")
        print(f"  Organization: {cert['organization']}")
        print(f"  Valid until: {cert['validTo']} ({days_until_expiry} days remaining)")
        print(f"  Serial: {cert['serialNumber']}")
        print()

except Exception as e:
    print(f"Failed to retrieve CA certificates: {e}")
```

### React Hook

```jsx
import { useState, useEffect } from 'react';

// Custom hook for CA certificates
export function useCACertificates() {
  const [caCertificates, setCACertificates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCACertificates = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/ca', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch CA certificates: ${response.statusText}`);
      }

      const data = await response.json();
      setCACertificates(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCACertificates();
  }, []);

  return {
    caCertificates,
    loading,
    error,
    refetch: fetchCACertificates
  };
}

// Example component using the hook
export function CACertificatesList() {
  const { caCertificates, loading, error, refetch } = useCACertificates();

  if (loading) return <div>Loading CA certificates...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="ca-certificates">
      <div className="header">
        <h2>Certificate Authority Certificates</h2>
        <button onClick={refetch}>Refresh</button>
      </div>
      
      {caCertificates.length === 0 ? (
        <p>No CA certificates found.</p>
      ) : (
        <div className="ca-list">
          {caCertificates.map(cert => (
            <div key={cert.id} className="ca-certificate-card">
              <h3>{cert.commonName}</h3>
              <p><strong>Organization:</strong> {cert.organization}</p>
              <p><strong>Valid From:</strong> {new Date(cert.validFrom).toLocaleDateString()}</p>
              <p><strong>Valid To:</strong> {new Date(cert.validTo).toLocaleDateString()}</p>
              <p><strong>Serial Number:</strong> {cert.serialNumber}</p>
              <p><strong>Status:</strong> <span className={`status ${cert.status}`}>{cert.status}</span></p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

## Error Handling

The CA API uses standard HTTP status codes and returns error information in JSON format:

```json
{
  "message": "Error description",
  "statusCode": 500
}
```

Common error responses:

- **401 Unauthorized**: Authentication required or session expired
- **500 Internal Server Error**: Server-side error occurred

## Use Cases

### Monitoring CA Certificate Expiry

```javascript
async function checkCACertificateExpiry() {
  const caCerts = await getCACertificates();
  const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  const expiringCerts = caCerts.filter(cert => {
    const validTo = new Date(cert.validTo);
    return validTo <= thirtyDaysFromNow;
  });
  
  if (expiringCerts.length > 0) {
    console.warn('CA certificates expiring within 30 days:');
    expiringCerts.forEach(cert => {
      console.warn(`- ${cert.commonName} expires on ${cert.validTo}`);
    });
  }
  
  return expiringCerts;
}
```

### Displaying CA Certificate Chain

```javascript
async function displayCACertificateChain() {
  const caCerts = await getCACertificates();
  
  // Sort by path length (root CAs first)
  const sortedCerts = caCerts.sort((a, b) => a.pathLength - b.pathLength);
  
  console.log('Certificate Authority Chain:');
  sortedCerts.forEach((cert, index) => {
    const indent = '  '.repeat(cert.pathLength || 0);
    console.log(`${indent}${index + 1}. ${cert.commonName}`);
    console.log(`${indent}   Organization: ${cert.organization}`);
    console.log(`${indent}   Valid: ${cert.validFrom} to ${cert.validTo}`);
  });
}
```

## Security Considerations

1. **Authentication Required**: All CA endpoints require valid authentication
2. **Read-Only Access**: The CA API provides read-only access to CA certificates
3. **Sensitive Information**: CA certificate information may contain sensitive organizational data
4. **Rate Limiting**: Standard rate limiting applies to prevent abuse

## Related APIs

- [Certificates API](./certificates.md) - For managing regular certificates
- [Authentication API](./authentication.md) - For user authentication
- [Settings API](./settings.md) - For configuring CA-related settings

---

**Note**: The CA API currently provides read-only access to Certificate Authority certificates. For CA certificate management operations, use the main Certificates API with appropriate CA-specific parameters.
