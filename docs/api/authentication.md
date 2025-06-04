# Authentication API

The Authentication API manages user sessions, login/logout operations, and user profile management. The Certificate Manager uses session-based authentication with secure HTTP-only cookies.

## Table of Contents

- [Overview](#overview)
- [Authentication Flow](#authentication-flow)
- [Endpoints](#endpoints)
- [Request/Response Examples](#requestresponse-examples)
- [Error Handling](#error-handling)
- [Security Considerations](#security-considerations)

## Overview

The authentication system provides:
- Session-based authentication using HTTP-only cookies
- Secure password handling with bcrypt hashing
- User profile management
- Session validation and management
- Password change functionality
- Automatic session cleanup

## Authentication Flow

### 1. Initial Login
```
Client → POST /api/auth/login → Server
Server → Set secure session cookie → Client
Client → Subsequent requests include cookie automatically
```

### 2. Session Validation
```
Client → Request with session cookie → Server
Server → Validates session → Response
```

### 3. Logout
```
Client → POST /api/auth/logout → Server
Server → Clear session cookie → Client
```

## Endpoints

### Login

Authenticate a user and create a session.

**Endpoint:** `POST /api/auth/login`

**Authentication:** None required

**Request Body:**
```json
{
  "username": "string (required)",
  "password": "string (required)"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "createdAt": "string (ISO date)",
    "lastLogin": "string (ISO date)"
  }
}
```

**Response (401):**
```json
{
  "success": false,
  "message": "Invalid credentials",
  "error": "INVALID_CREDENTIALS"
}
```

---

### Logout

End the current user session.

**Endpoint:** `POST /api/auth/logout`

**Authentication:** Required

**Request Body:** Empty

**Response (200):**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### Get Current User Profile

Retrieve the current authenticated user's profile information.

**Endpoint:** `GET /api/auth/profile`

**Authentication:** Required

**Response (200):**
```json
{
  "success": true,
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "createdAt": "string (ISO date)",
    "lastLogin": "string (ISO date)",
    "settings": {
      "theme": "light|dark",
      "notifications": "boolean",
      "autoLogout": "number (minutes)"
    }
  }
}
```

---

### Update User Profile

Update the current user's profile information.

**Endpoint:** `PUT /api/auth/profile`

**Authentication:** Required

**Request Body:**
```json
{
  "email": "string (optional)",
  "settings": {
    "theme": "light|dark (optional)",
    "notifications": "boolean (optional)",
    "autoLogout": "number (optional, minutes)"
  }
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Profile updated successfully",
  "user": {
    "id": "string",
    "username": "string",
    "email": "string",
    "createdAt": "string (ISO date)",
    "lastLogin": "string (ISO date)",
    "settings": {
      "theme": "light|dark",
      "notifications": "boolean",
      "autoLogout": "number"
    }
  }
}
```

---

### Change Password

Change the current user's password.

**Endpoint:** `POST /api/auth/change-password`

**Authentication:** Required

**Request Body:**
```json
{
  "currentPassword": "string (required)",
  "newPassword": "string (required)",
  "confirmPassword": "string (required)"
}
```

**Response (200):**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

**Response (400):**
```json
{
  "success": false,
  "message": "Current password is incorrect",
  "error": "INVALID_CURRENT_PASSWORD"
}
```

---

### Validate Session

Check if the current session is valid (useful for frontend applications).

**Endpoint:** `GET /api/auth/validate`

**Authentication:** Required

**Response (200):**
```json
{
  "success": true,
  "valid": true,
  "user": {
    "id": "string",
    "username": "string"
  }
}
```

**Response (401):**
```json
{
  "success": false,
  "valid": false,
  "message": "Session invalid or expired"
}
```

## Request/Response Examples

### Complete Login Flow

```bash
# 1. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{
    "username": "admin",
    "password": "mypassword"
  }' | jq

# Response:
# {
#   "success": true,
#   "message": "Login successful",
#   "user": {
#     "id": "user123",
#     "username": "admin",
#     "email": "admin@example.com",
#     "createdAt": "2024-01-01T00:00:00.000Z",
#     "lastLogin": "2024-01-15T10:30:00.000Z"
#   }
# }

# 2. Use authenticated endpoint
curl -X GET http://localhost:3000/api/auth/profile \
  -b cookies.txt | jq

# 3. Logout
curl -X POST http://localhost:3000/api/auth/logout \
  -b cookies.txt | jq
```

### Change Password

```bash
curl -X POST http://localhost:3000/api/auth/change-password \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "currentPassword": "oldpassword",
    "newPassword": "newpassword123",
    "confirmPassword": "newpassword123"
  }' | jq
```

### Update Profile

```bash
curl -X PUT http://localhost:3000/api/auth/profile \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "email": "newemail@example.com",
    "settings": {
      "theme": "dark",
      "notifications": true,
      "autoLogout": 60
    }
  }' | jq
```

### JavaScript Example

```javascript
// Login function
async function login(username, password) {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include', // Important: include cookies
      body: JSON.stringify({ username, password })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('Login successful:', result.user);
      return result.user;
    } else {
      throw new Error(result.message);
    }
  } catch (error) {
    console.error('Login failed:', error.message);
    throw error;
  }
}

// Check authentication status
async function checkAuth() {
  try {
    const response = await fetch('/api/auth/validate', {
      credentials: 'include'
    });

    const result = await response.json();
    return result.valid;
  } catch (error) {
    console.error('Auth check failed:', error);
    return false;
  }
}

// Logout function
async function logout() {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });

    const result = await response.json();
    if (result.success) {
      console.log('Logged out successfully');
    }
  } catch (error) {
    console.error('Logout failed:', error);
  }
}
```

## Error Handling

### Common Error Codes

| Error Code | Description | HTTP Status |
|------------|-------------|-------------|
| `INVALID_CREDENTIALS` | Username or password is incorrect | 401 |
| `INVALID_CURRENT_PASSWORD` | Current password is wrong when changing password | 400 |
| `PASSWORD_MISMATCH` | New password and confirmation don't match | 400 |
| `WEAK_PASSWORD` | Password doesn't meet security requirements | 400 |
| `SESSION_EXPIRED` | User session has expired | 401 |
| `USER_NOT_FOUND` | User account doesn't exist | 404 |
| `VALIDATION_ERROR` | Request data validation failed | 422 |

### Password Requirements

Passwords must meet the following criteria:
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter  
- At least one number
- At least one special character
- Cannot contain username

### Rate Limiting

Authentication endpoints have specific rate limits:
- **Login attempts**: 10 attempts per 15 minutes per IP address
- **Password changes**: 5 attempts per hour per user
- **Profile updates**: 20 requests per hour per user

## Security Considerations

### Session Security
- Sessions use HTTP-only cookies (cannot be accessed via JavaScript)
- Secure flag is set in production (HTTPS only)
- SameSite attribute prevents CSRF attacks
- Automatic session expiration after inactivity
- Session regeneration on login

### Password Security
- Passwords are hashed using bcrypt with salt rounds
- Plaintext passwords are never stored
- Password strength requirements enforced
- Brute force protection with rate limiting

### Best Practices

1. **Always use HTTPS in production**
2. **Implement proper error handling** - Don't expose sensitive information in error messages
3. **Use credentials: 'include'** in fetch requests to include cookies
4. **Handle authentication failures gracefully** - Redirect to login when session expires
5. **Implement client-side session validation** - Check authentication status on page load
6. **Secure cookie storage** - Let the browser handle session cookies automatically

### CSRF Protection

The API includes CSRF protection:
- SameSite cookie attribute
- Origin header validation
- Custom headers required for state-changing operations

### Example Security Headers

The API sets these security headers:
```
Set-Cookie: sessionId=...; HttpOnly; Secure; SameSite=Strict
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
```

## Integration Examples

### React Hook Example

```javascript
import { useState, useEffect, createContext, useContext } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthStatus();
  }, []);

  async function checkAuthStatus() {
    try {
      const response = await fetch('/api/auth/validate', {
        credentials: 'include'
      });
      const result = await response.json();
      
      if (result.valid) {
        setUser(result.user);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  }

  async function login(username, password) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password })
    });

    const result = await response.json();
    if (result.success) {
      setUser(result.user);
      return result.user;
    } else {
      throw new Error(result.message);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
```

This authentication system provides a secure foundation for all Certificate Manager operations. Once authenticated, users can access all protected endpoints using the same session cookie.