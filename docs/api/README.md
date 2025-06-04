# Certificate Manager API Documentation

The Certificate Manager provides a comprehensive REST API for managing SSL/TLS certificates, Certificate Authorities (CAs), and related security operations. This API enables full automation of certificate lifecycle management through programmatic access.

## Table of Contents

- [API Overview](#api-overview)
- [Authentication](#authentication)
- [Base URL](#base-url)
- [Response Format](#response-format)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)
- [API Categories](#api-categories)
- [Interactive Documentation](#interactive-documentation)
- [Quick Start](#quick-start)
- [SDK and Libraries](#sdk-and-libraries)

## API Overview

The Certificate Manager API is a RESTful API that provides the following capabilities:

- **Certificate Management**: Create, read, update, and delete SSL/TLS certificates
- **Certificate Authority Operations**: Manage root and intermediate CAs
- **Auto-renewal**: Configure and monitor automatic certificate renewal
- **Deployment Automation**: Deploy certificates to various services and platforms
- **Security Management**: Handle passphrases, keys, and security policies
- **System Integration**: Docker, NPM, and other platform integrations
- **Activity Monitoring**: Track system activities and certificate events
- **Log Management**: Access system logs and audit trails
- **User Management**: Authentication and authorization
- **System Configuration**: Manage application settings and preferences

## Authentication

Most API endpoints require authentication using session-based authentication. The API uses secure HTTP-only cookies for session management.

### Login Process

1. **Initial Setup**: If this is a first-time installation, use the setup endpoints first
2. **Login**: Authenticate using the `/api/auth/login` endpoint
3. **Session**: Subsequent requests automatically include session cookies
4. **Logout**: End session using `/api/auth/logout` endpoint

### Public Endpoints

Some endpoints don't require authentication:
- `/api/public/*` - Public information endpoints
- `/api/setup/*` - Initial setup endpoints (only available during first-time setup)
- `/api/health` - Health check endpoint

## Base URL

All API endpoints are relative to the base URL:

```
http://your-domain:port/api
```

For example:
- Development: `http://localhost:3000/api`
- Production: `https://your-cert-manager.com/api`

## Response Format

All API responses follow a consistent JSON format:

### Success Response
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response data here
  }
}
```

### Error Response
```json
{
  "success": false,
  "message": "Error description",
  "error": "ERROR_CODE",
  "details": {
    // Additional error details
  }
}
```

## Error Handling

The API uses standard HTTP status codes:

- **200 OK**: Request successful
- **201 Created**: Resource created successfully
- **400 Bad Request**: Invalid request data
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Access denied
- **404 Not Found**: Resource not found
- **422 Unprocessable Entity**: Validation errors
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Server error
- **503 Service Unavailable**: Service temporarily unavailable

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Default**: 1000 requests per hour per IP
- **Authentication**: 10 login attempts per 15 minutes per IP
- **Certificate Operations**: 100 operations per hour per authenticated user

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in current window
- `X-RateLimit-Reset`: Time when the rate limit resets

## API Categories

The API is organized into the following categories:

### 🔐 [Authentication](./authentication.md)
User authentication, session management, and security operations.
- Login/logout
- User profile management
- Password changes
- Session validation

### 📜 [Certificates](./certificates.md)
Complete certificate lifecycle management including creation, renewal, and deployment.
- Certificate CRUD operations
- Certificate signing requests (CSRs)
- Certificate validation and verification
- Certificate export and import

### 🏛️ [Certificate Authority](./ca.md)
Management of root and intermediate Certificate Authorities.
- CA creation and configuration
- CA certificate management
- Certificate signing operations
- CA hierarchy management

### 🔄 [Auto-Renewal](./renewal.md)
Automated certificate renewal and monitoring services.
- Renewal configuration
- Renewal scheduling
- Renewal status monitoring
- Renewal notifications

### 🚀 [Deployment](./deployment.md)
Certificate deployment to various services and platforms.
- Deployment configurations
- Service integrations
- Deployment automation
- Deployment status tracking

### ⚙️ [Settings](./settings.md)
Application configuration and system settings.
- Global settings management
- Security policies
- Integration configurations
- System preferences

### 📁 [Filesystem](./filesystem.md)
File and directory operations for certificate storage.
- File browsing and management
- Directory operations
- File upload/download
- Storage configuration

### 🐳 [Docker Integration](./docker.md)
Docker container management and certificate deployment to containers.
- Container discovery
- Certificate deployment to containers
- Docker service integration
- Container monitoring

### 📦 [NPM Integrations](./integrations.md)
Integration with external services and package managers.
- NPM package management
- Service discovery
- Third-party integrations
- Plugin management

### 📊 [Activity Monitoring](./activity.md)
System activity tracking and audit logging.
- Activity logs
- System events
- User actions
- Security events

### 📋 [Logs](./logs.md)
System log access and management.
- Log retrieval
- Log filtering
- Log export
- Log rotation

### 🛠️ [Setup](./setup.md)
Initial system setup and configuration (first-time setup only).
- Initial admin user creation
- System initialization
- Database setup
- Configuration wizard

### 🌐 [Public](./public.md)
Public endpoints that don't require authentication.
- System information
- Health checks
- Public certificates
- Status endpoints

## Interactive Documentation

The Certificate Manager includes built-in interactive API documentation powered by Swagger UI:

### Accessing Documentation
Visit `/api/docs` in your Certificate Manager installation to access:
- Interactive API explorer
- Request/response examples
- Schema definitions
- Authentication testing

### OpenAPI Specification
The complete OpenAPI 3.1 specification is available at:
- JSON format: `/api/openapi.json`
- YAML format: Available in the source code at `src/api/openapi.yaml`

## Quick Start

Here's a quick example of how to use the API:

### 1. Initial Setup (First Time Only)
```bash
# Check if setup is required
curl -X GET http://localhost:3000/api/public/setup-required

# If setup is required, create initial admin user
curl -X POST http://localhost:3000/api/setup/init \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "secure-password",
    "email": "admin@example.com"
  }'
```

### 2. Authentication
```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "username": "admin",
    "password": "secure-password"
  }'
```

### 3. Create a Certificate
```bash
# Create a new certificate
curl -X POST http://localhost:3000/api/certificates \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "commonName": "example.com",
    "subjectAltNames": ["www.example.com"],
    "keySize": 2048,
    "validityDays": 365
  }'
```

### 4. List Certificates
```bash
# Get all certificates
curl -X GET http://localhost:3000/api/certificates \
  -b cookies.txt
```

### 5. Set Up Auto-Renewal
```bash
# Configure auto-renewal for a certificate
curl -X POST http://localhost:3000/api/renewal/configure \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "certificateId": "cert-id-here",
    "renewalThreshold": 30,
    "autoRenew": true
  }'
```

## SDK and Libraries

### JavaScript/Node.js
```javascript
// Example using fetch API
const response = await fetch('/api/certificates', {
  method: 'GET',
  credentials: 'include', // Include cookies
  headers: {
    'Content-Type': 'application/json'
  }
});

const certificates = await response.json();
```

### Python
```python
import requests

# Create session for cookie handling
session = requests.Session()

# Login
login_response = session.post('http://localhost:3000/api/auth/login', json={
    'username': 'admin',
    'password': 'password'
})

# Use API
certificates = session.get('http://localhost:3000/api/certificates').json()
```

### curl Scripts
For shell automation, see the individual endpoint documentation for complete curl examples.

## Next Steps

1. **First-time Setup**: If this is a new installation, start with the [Setup Guide](./setup.md)
2. **Authentication**: Learn about [Authentication](./authentication.md) and session management
3. **Certificates**: Explore [Certificate Management](./certificates.md) for core functionality
4. **Automation**: Set up [Auto-Renewal](./renewal.md) and [Deployment](./deployment.md) for hands-off operation
5. **Integration**: Connect with your infrastructure using [Docker](./docker.md) and [Integrations](./integrations.md)

## Support

- **Interactive Docs**: `/api/docs` - Built-in Swagger UI documentation
- **Health Check**: `/api/health` - System status endpoint
- **Logs**: Use the [Logs API](./logs.md) for troubleshooting
- **Activity**: Monitor system activity with the [Activity API](./activity.md)

For detailed information about each API category, click on the links above or explore the interactive documentation at `/api/docs`.