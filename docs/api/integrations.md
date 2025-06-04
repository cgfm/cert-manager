# Certificate Manager - Integration API Documentation

## Overview

The Integration API provides endpoints for managing external service integrations, primarily with Nginx Proxy Manager (NPM). These endpoints handle connection testing, authentication, certificate synchronization, and configuration management.

## Base URL

All integration endpoints are prefixed with `/api/integrations/`

## Authentication

Most integration endpoints require admin authentication. Use the same authentication headers as other protected API endpoints:

```javascript
headers: {
    'Authorization': 'Bearer <your-jwt-token>'
}
```

## Nginx Proxy Manager Integration

### Endpoints Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/npm/check-connection` | POST | Test NPM API connectivity |
| `/npm/request-token` | POST | Authenticate and get access token |
| `/npm/validate-token` | GET | Validate existing token |
| `/npm/reconfigure` | POST | Update NPM credentials |
| `/npm/certificates` | GET | Get available certificates |
| `/npm/certificates/:id` | POST | Update specific certificate |
| `/npm/status` | GET | Get connection status |

### 1. Check NPM Connection

Test connectivity to a Nginx Proxy Manager instance.

**Endpoint:** `POST /api/integrations/npm/check-connection`

**Request Body:**
```json
{
    "apiUrl": "https://npm.example.com:81"
}
```

**Success Response (200):**
```json
{
    "success": true,
    "message": "Connection successful",
    "version": "2.10.4",
    "status": "healthy"
}
```

**Error Responses:**
```json
// 400 - Bad Request
{
    "success": false,
    "message": "API URL is required"
}

// 500 - Connection Failed
{
    "success": false,
    "message": "Connection failed: timeout after 10000ms"
}
```

### 2. Request Authentication Token

Authenticate with NPM and obtain an access token for API operations.

**Endpoint:** `POST /api/integrations/npm/request-token`

**Request Body:**
```json
{
    "apiUrl": "https://npm.example.com:81",
    "email": "admin@example.com",
    "password": "your-password"
}
```

**Success Response (200):**
```json
{
    "success": true,
    "message": "Authentication successful",
    "user": {
        "id": 1,
        "name": "Administrator",
        "email": "admin@example.com",
        "avatar": ""
    }
}
```

**Error Responses:**
```json
// 400 - Missing Credentials
{
    "success": false,
    "message": "Email and password are required"
}

// 401 - Authentication Failed
{
    "success": false,
    "message": "Invalid email or password"
}

// 500 - Service Error
{
    "success": false,
    "message": "NPM integration service not available"
}
```

### 3. Validate Token

Check if the stored authentication token is still valid.

**Endpoint:** `GET /api/integrations/npm/validate-token`

**Success Response (200):**
```json
{
    "success": true,
    "valid": true,
    "user": {
        "id": 1,
        "name": "Administrator",
        "email": "admin@example.com"
    },
    "expiresAt": "2024-01-15T10:30:00Z"
}
```

**Invalid Token Response (200):**
```json
{
    "success": false,
    "valid": false,
    "message": "Token expired or invalid"
}
```

### 4. Reconfigure Credentials

Update NPM credentials and re-authenticate.

**Endpoint:** `POST /api/integrations/npm/reconfigure`

**Request Body:**
```json
{
    "email": "admin@example.com",
    "password": "new-password"
}
```

**Success Response (200):**
```json
{
    "success": true,
    "message": "Credentials updated and authenticated successfully"
}
```

**Error Responses:**
```json
// 400 - Missing Credentials
{
    "success": false,
    "message": "Email and password are required"
}

// 401 - Authentication Failed
{
    "success": false,
    "message": "Authentication failed with new credentials"
}
```

### 5. Get Certificates

Retrieve all SSL certificates from the NPM instance.

**Endpoint:** `GET /api/integrations/npm/certificates`

**Success Response (200):**
```json
{
    "success": true,
    "certificates": [
        {
            "id": 1,
            "provider": "letsencrypt",
            "nice_name": "example.com",
            "domain_names": ["example.com", "www.example.com"],
            "expires_on": "2024-04-15T00:00:00Z",
            "created_on": "2024-01-15T10:30:00Z",
            "modified_on": "2024-01-15T10:30:00Z",
            "meta": {
                "letsencrypt_email": "admin@example.com"
            }
        }
    ]
}
```

**Error Responses:**
```json
// 401 - Authentication Required
{
    "success": false,
    "message": "Authentication failed",
    "needsReconfiguration": true,
    "authError": "token_expired"
}

// 401 - Credentials Need Update
{
    "success": false,
    "message": "Credentials need reconfiguration",
    "needsReconfiguration": true
}

// 400 - Connection Error
{
    "success": false,
    "message": "Failed to fetch certificates"
}
```

### 6. Update Certificate

Update a specific certificate in NPM with new certificate data.

**Endpoint:** `POST /api/integrations/npm/certificates/:id`

**URL Parameters:**
- `id` (required): Certificate ID to update

**Request Body:**
```json
{
    "certData": {
        "certificate": "-----BEGIN CERTIFICATE-----\n...",
        "key": "-----BEGIN PRIVATE KEY-----\n...",
        "intermediate": "-----BEGIN CERTIFICATE-----\n..."
    }
}
```

**Success Response (200):**
```json
{
    "success": true,
    "message": "Certificate updated successfully",
    "certificate": {
        "id": 1,
        "nice_name": "example.com",
        "domain_names": ["example.com", "www.example.com"],
        "expires_on": "2024-04-15T00:00:00Z",
        "updated": true
    }
}
```

**Error Responses:**
```json
// 400 - Missing ID
{
    "success": false,
    "message": "Certificate ID is required"
}

// 400 - Missing Certificate Data
{
    "success": false,
    "message": "Certificate and key data are required"
}

// 404 - Certificate Not Found
{
    "success": false,
    "message": "Certificate not found"
}
```

### 7. Get Connection Status

Get comprehensive status information about the NPM integration.

**Endpoint:** `GET /api/integrations/npm/status`

**Success Response (200):**
```json
{
    "success": true,
    "configured": true,
    "hasToken": true,
    "connected": true,
    "tokenValid": true,
    "user": {
        "id": 1,
        "name": "Administrator",
        "email": "admin@example.com"
    }
}
```

**Unconfigured Response (200):**
```json
{
    "success": false,
    "message": "NPM not configured",
    "configured": false
}
```

**Connection Failed Response (200):**
```json
{
    "success": false,
    "configured": true,
    "hasToken": true,
    "connected": false,
    "tokenValid": false,
    "user": null
}
```

## JavaScript Integration Example

Here's a complete JavaScript class for integrating with the NPM API:

```javascript
class NpmIntegrationClient {
    constructor(baseUrl, authToken) {
        this.baseUrl = baseUrl;
        this.authToken = authToken;
    }

    async makeRequest(endpoint, options = {}) {
        const url = `${this.baseUrl}/api/integrations${endpoint}`;
        const config = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.authToken}`
            },
            ...options
        };

        if (config.method !== 'GET' && config.body) {
            config.body = JSON.stringify(config.body);
        }

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || `HTTP ${response.status}`);
            }
            
            return data;
        } catch (error) {
            console.error(`NPM API Error (${endpoint}):`, error);
            throw error;
        }
    }

    // Check NPM connection
    async checkConnection(apiUrl) {
        return this.makeRequest('/npm/check-connection', {
            method: 'POST',
            body: { apiUrl }
        });
    }

    // Request authentication token
    async requestToken(apiUrl, email, password) {
        return this.makeRequest('/npm/request-token', {
            method: 'POST',
            body: { apiUrl, email, password }
        });
    }

    // Validate existing token
    async validateToken() {
        return this.makeRequest('/npm/validate-token');
    }

    // Reconfigure credentials
    async reconfigure(email, password) {
        return this.makeRequest('/npm/reconfigure', {
            method: 'POST',
            body: { email, password }
        });
    }

    // Get certificates
    async getCertificates() {
        return this.makeRequest('/npm/certificates');
    }

    // Update certificate
    async updateCertificate(id, certData) {
        return this.makeRequest(`/npm/certificates/${id}`, {
            method: 'POST',
            body: { certData }
        });
    }

    // Get connection status
    async getStatus() {
        return this.makeRequest('/npm/status');
    }
}

// Usage example
const client = new NpmIntegrationClient('http://localhost:3000', 'your-jwt-token');

// Setup NPM integration
async function setupNpmIntegration() {
    try {
        // 1. Test connection
        const connectionResult = await client.checkConnection('https://npm.example.com:81');
        console.log('Connection test:', connectionResult);

        // 2. Authenticate
        const authResult = await client.requestToken(
            'https://npm.example.com:81',
            'admin@example.com',
            'password'
        );
        console.log('Authentication:', authResult);

        // 3. Get status
        const status = await client.getStatus();
        console.log('Status:', status);

        // 4. Fetch certificates
        if (status.success && status.tokenValid) {
            const certificates = await client.getCertificates();
            console.log('Certificates:', certificates);
        }
    } catch (error) {
        console.error('Setup failed:', error);
    }
}
```

## React Component Example

Here's a React component for managing NPM integration:

```jsx
import React, { useState, useEffect } from 'react';

const NpmIntegrationManager = () => {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [credentials, setCredentials] = useState({
        apiUrl: '',
        email: '',
        password: ''
    });
    const [certificates, setCertificates] = useState([]);

    useEffect(() => {
        checkStatus();
    }, []);

    const checkStatus = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/integrations/npm/status', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await response.json();
            setStatus(data);
        } catch (error) {
            console.error('Status check failed:', error);
        } finally {
            setLoading(false);
        }
    };

    const testConnection = async () => {
        if (!credentials.apiUrl) return;

        try {
            setLoading(true);
            const response = await fetch('/api/integrations/npm/check-connection', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ apiUrl: credentials.apiUrl })
            });
            const data = await response.json();
            
            if (data.success) {
                alert('Connection successful!');
            } else {
                alert(`Connection failed: ${data.message}`);
            }
        } catch (error) {
            alert(`Connection error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const authenticate = async () => {
        if (!credentials.email || !credentials.password) {
            alert('Please enter email and password');
            return;
        }

        try {
            setLoading(true);
            const response = await fetch('/api/integrations/npm/request-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(credentials)
            });
            const data = await response.json();
            
            if (data.success) {
                alert('Authentication successful!');
                await checkStatus();
                await loadCertificates();
            } else {
                alert(`Authentication failed: ${data.message}`);
            }
        } catch (error) {
            alert(`Authentication error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const loadCertificates = async () => {
        try {
            const response = await fetch('/api/integrations/npm/certificates', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await response.json();
            
            if (data.success) {
                setCertificates(data.certificates);
            } else if (data.needsReconfiguration) {
                alert('Please reconfigure your NPM credentials');
            }
        } catch (error) {
            console.error('Failed to load certificates:', error);
        }
    };

    const updateCertificate = async (certId, certData) => {
        try {
            setLoading(true);
            const response = await fetch(`/api/integrations/npm/certificates/${certId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ certData })
            });
            const data = await response.json();
            
            if (data.success) {
                alert('Certificate updated successfully!');
                await loadCertificates();
            } else {
                alert(`Update failed: ${data.message}`);
            }
        } catch (error) {
            alert(`Update error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '20px' }}>
            <h2>NPM Integration Manager</h2>
            
            {/* Status Display */}
            {status && (
                <div style={{ 
                    marginBottom: '20px', 
                    padding: '10px', 
                    backgroundColor: status.success ? '#d4edda' : '#f8d7da',
                    borderRadius: '4px'
                }}>
                    <h3>Connection Status</h3>
                    <p>Configured: {status.configured ? 'Yes' : 'No'}</p>
                    <p>Connected: {status.connected ? 'Yes' : 'No'}</p>
                    <p>Token Valid: {status.tokenValid ? 'Yes' : 'No'}</p>
                    {status.user && <p>User: {status.user.name} ({status.user.email})</p>}
                </div>
            )}

            {/* Configuration Form */}
            <div style={{ marginBottom: '20px' }}>
                <h3>NPM Configuration</h3>
                <div style={{ marginBottom: '10px' }}>
                    <input
                        type="text"
                        placeholder="NPM API URL (e.g., https://npm.example.com:81)"
                        value={credentials.apiUrl}
                        onChange={(e) => setCredentials({...credentials, apiUrl: e.target.value})}
                        style={{ width: '300px', marginRight: '10px' }}
                    />
                    <button onClick={testConnection} disabled={loading}>
                        Test Connection
                    </button>
                </div>
                <div style={{ marginBottom: '10px' }}>
                    <input
                        type="email"
                        placeholder="Email"
                        value={credentials.email}
                        onChange={(e) => setCredentials({...credentials, email: e.target.value})}
                        style={{ width: '200px', marginRight: '10px' }}
                    />
                    <input
                        type="password"
                        placeholder="Password"
                        value={credentials.password}
                        onChange={(e) => setCredentials({...credentials, password: e.target.value})}
                        style={{ width: '200px', marginRight: '10px' }}
                    />
                    <button onClick={authenticate} disabled={loading}>
                        Authenticate
                    </button>
                </div>
            </div>

            {/* Certificates List */}
            {certificates.length > 0 && (
                <div>
                    <h3>NPM Certificates</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr>
                                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Name</th>
                                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Domains</th>
                                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Expires</th>
                                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {certificates.map(cert => (
                                <tr key={cert.id}>
                                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                                        {cert.nice_name}
                                    </td>
                                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                                        {cert.domain_names.join(', ')}
                                    </td>
                                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                                        {new Date(cert.expires_on).toLocaleDateString()}
                                    </td>
                                    <td style={{ border: '1px solid #ddd', padding: '8px' }}>
                                        <button 
                                            onClick={() => {/* Handle certificate update */}}
                                            disabled={loading}
                                        >
                                            Update
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {loading && <p>Loading...</p>}
        </div>
    );
};

export default NpmIntegrationManager;
```

## Error Handling

The Integration API uses standard HTTP status codes and consistent error response formats:

### Common Error Codes

- **400 Bad Request**: Missing required parameters or invalid data
- **401 Unauthorized**: Authentication failed or token invalid
- **404 Not Found**: Resource not found (certificate, etc.)
- **500 Internal Server Error**: Server-side errors or service unavailable

### Error Response Format

```json
{
    "success": false,
    "message": "Error description",
    "needsReconfiguration": true, // Present when credentials need updating
    "authError": "token_expired"  // Present for specific auth errors
}
```

## Security Considerations

1. **Credential Storage**: Passwords are never stored permanently; only access tokens are saved
2. **Token Expiration**: Tokens have expiration times and need periodic validation
3. **HTTPS Enforcement**: NPM connections should use HTTPS in production
4. **Access Control**: All endpoints require admin authentication
5. **Error Messages**: Sensitive information is not exposed in error messages

## Best Practices

1. **Connection Testing**: Always test connection before attempting authentication
2. **Token Validation**: Periodically validate tokens before making API calls
3. **Error Handling**: Implement proper error handling for network and authentication failures
4. **Credential Management**: Never log or expose NPM passwords in client-side code
5. **Status Monitoring**: Use the status endpoint to monitor integration health
6. **Certificate Sync**: Implement proper certificate synchronization workflows

## Integration Workflow

1. **Initial Setup**:
   - Configure NPM API URL
   - Test connection
   - Authenticate with credentials
   - Verify token validity

2. **Certificate Management**:
   - Fetch available certificates
   - Monitor certificate expiration
   - Update certificates when renewed
   - Handle authentication errors gracefully

3. **Maintenance**:
   - Monitor connection status
   - Refresh tokens when expired
   - Handle NPM service downtime
   - Log integration activities

This API provides a robust foundation for integrating with Nginx Proxy Manager instances and managing SSL certificates across both systems.
