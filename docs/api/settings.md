# Settings API - Complete Documentation

This document provides comprehensive documentation for all Settings API endpoints in the Certificate Manager application.

## Base URL

All Settings endpoints are relative to the base API URL:
```
/api/settings
```

## Authentication

All Settings endpoints require authentication with appropriate administrative privileges.

## Settings Categories

The Settings API manages configuration across these categories:

1. **General Settings** - Basic application configuration
2. **Certificate Settings** - Default certificate parameters and validation rules
3. **Deployment Settings** - Certificate deployment and distribution configuration
4. **Email/SMTP Settings** - Email notification configuration
5. **NPM Settings** - Nginx Proxy Manager integration settings
6. **Docker Settings** - Docker container management settings
7. **Renewal Settings** - Automatic certificate renewal configuration
8. **Logging Settings** - Application logging configuration

## Complete Endpoints Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/general` | Get general application settings |
| PATCH | `/api/settings/general` | Update general application settings |
| GET | `/api/settings/certificates` | Get certificate default settings |
| PATCH | `/api/settings/certificates` | Update certificate settings |
| GET | `/api/settings/deployment` | Get deployment configuration |
| PUT | `/api/settings/deployment` | Update deployment configuration |
| PUT | `/api/settings/email` | Update email settings |
| POST | `/api/settings/email/test` | Test email configuration |
| PUT | `/api/settings/npm` | Update NPM integration settings |
| POST | `/api/settings/npm/test` | Test NPM connection |
| PUT | `/api/settings/docker` | Update Docker configuration |
| GET | `/api/settings/renewal` | Get renewal configuration |
| PUT | `/api/settings/renewal` | Update renewal settings |
| GET | `/api/settings/logs` | Get logging configuration |
| POST | `/api/settings/logs` | Create log entry |
| DELETE | `/api/settings/logs/:filename` | Delete specific log file |
| PUT | `/api/settings/logs/:filename` | Update log file settings |

## Detailed Endpoint Documentation

### General Settings

#### Get General Settings

**Endpoint:** `GET /api/settings/general`

**Description:** Retrieves current general application settings including UI preferences, security settings, and basic configuration.

**Response:**
```json
{
  "success": true,
  "data": {
    "applicationName": "Certificate Manager",
    "version": "1.0.0",
    "timezone": "UTC",
    "dateFormat": "YYYY-MM-DD",
    "timeFormat": "24h",
    "language": "en",
    "theme": "light",
    "autoSave": true,
    "sessionTimeout": 3600,
    "maxFileSize": "10MB",
    "allowedFileTypes": [".pem", ".crt", ".key", ".p12", ".pfx"],
    "securitySettings": {
      "enforceHttps": true,
      "csrfProtection": true,
      "sessionSecure": true,
      "passwordMinLength": 8,
      "passwordRequireSpecialChars": true
    }
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Authentication required
- `500 Internal Server Error`: Server error retrieving settings

#### Update General Settings

**Endpoint:** `PATCH /api/settings/general`

**Description:** Updates general application settings. Only provided fields will be updated.

**Request Body:**
```json
{
  "applicationName": "My Certificate Manager",
  "timezone": "America/New_York",
  "theme": "dark",
  "sessionTimeout": 7200,
  "securitySettings": {
    "passwordMinLength": 12,
    "passwordRequireSpecialChars": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "General settings updated successfully",
  "data": {
    "applicationName": "My Certificate Manager",
    "timezone": "America/New_York",
    "theme": "dark",
    "sessionTimeout": 7200
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid settings data
- `401 Unauthorized`: Authentication required
- `403 Forbidden`: Insufficient privileges
- `500 Internal Server Error`: Server error updating settings

### Certificate Settings

#### Get Certificate Settings

**Endpoint:** `GET /api/settings/certificates`

**Description:** Retrieves default certificate settings used for certificate creation and validation.

**Response:**
```json
{
  "success": true,
  "data": {
    "defaultKeySize": 2048,
    "defaultValidityDays": 365,
    "defaultCountry": "US",
    "defaultState": "California",
    "defaultCity": "San Francisco",
    "defaultOrganization": "MyCompany Inc",
    "defaultOrganizationalUnit": "IT Department",
    "allowedKeyTypes": ["RSA", "ECDSA"],
    "allowedKeySizes": [2048, 3072, 4096],
    "minValidityDays": 1,
    "maxValidityDays": 3650,
    "autoRenewBeforeDays": 30,
    "validateCertificateChain": true,
    "requirePassphrase": false,
    "defaultPassphraseLength": 16
  }
}
```

#### Update Certificate Settings

**Endpoint:** `PATCH /api/settings/certificates`

**Description:** Updates certificate default settings.

**Request Body:**
```json
{
  "defaultKeySize": 4096,
  "defaultValidityDays": 730,
  "autoRenewBeforeDays": 45,
  "defaultOrganization": "New Company Name"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Certificate settings updated successfully",
  "data": {
    "defaultKeySize": 4096,
    "defaultValidityDays": 730,
    "autoRenewBeforeDays": 45,
    "defaultOrganization": "New Company Name"
  }
}
```

### Deployment Settings

#### Get Deployment Settings

**Endpoint:** `GET /api/settings/deployment`

**Description:** Retrieves deployment configuration including target systems and deployment methods.

**Response:**
```json
{
  "success": true,
  "data": {
    "deploymentMethods": {
      "ftp": {
        "enabled": true,
        "timeout": 30000,
        "retries": 3
      },
      "ssh": {
        "enabled": true,
        "timeout": 30000,
        "keyAuth": true
      },
      "docker": {
        "enabled": true,
        "socket": "/var/run/docker.sock"
      },
      "npm": {
        "enabled": false,
        "apiUrl": "",
        "token": ""
      }
    },
    "defaultSettings": {
      "backupBeforeDeployment": true,
      "verifyAfterDeployment": true,
      "rollbackOnFailure": true,
      "notifyOnSuccess": true,
      "notifyOnFailure": true
    }
  }
}
```

#### Update Deployment Settings

**Endpoint:** `PUT /api/settings/deployment`

**Description:** Updates deployment configuration settings.

**Request Body:**
```json
{
  "deploymentMethods": {
    "ftp": {
      "enabled": false
    },
    "docker": {
      "enabled": true,
      "socket": "/var/run/docker.sock"
    }
  },
  "defaultSettings": {
    "backupBeforeDeployment": true,
    "verifyAfterDeployment": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Deployment settings updated successfully"
}
```

### Email/SMTP Settings

#### Update Email Settings

**Endpoint:** `PUT /api/settings/email`

**Description:** Updates email/SMTP configuration for notifications.

**Request Body:**
```json
{
  "enabled": true,
  "smtpHost": "smtp.gmail.com",
  "smtpPort": 587,
  "smtpSecure": true,
  "smtpUser": "notifications@example.com",
  "smtpPassword": "app-password",
  "fromEmail": "certificates@example.com",
  "fromName": "Certificate Manager",
  "notifications": {
    "certificateExpiry": true,
    "deploymentSuccess": true,
    "deploymentFailure": true,
    "renewalSuccess": true,
    "renewalFailure": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email settings updated successfully"
}
```

#### Test Email Configuration

**Endpoint:** `POST /api/settings/email/test`

**Description:** Tests the current email configuration by sending a test email.

**Request Body:**
```json
{
  "testEmail": "admin@example.com",
  "subject": "Certificate Manager Test Email",
  "message": "This is a test email from Certificate Manager."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Test email sent successfully",
  "details": {
    "recipient": "admin@example.com",
    "messageId": "abc123@smtp.gmail.com",
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid email configuration
- `500 Internal Server Error`: Failed to send test email

### NPM Settings

#### Update NPM Settings

**Endpoint:** `PUT /api/settings/npm`

**Description:** Updates Nginx Proxy Manager integration settings.

**Request Body:**
```json
{
  "enabled": true,
  "apiUrl": "http://npm.local:81/api",
  "username": "admin@example.com",
  "password": "secure-password",
  "autoSync": true,
  "syncInterval": 3600,
  "createHostsAutomatically": true,
  "defaultLocation": "/",
  "sslSettings": {
    "forceSSL": true,
    "httpVersion": "auto",
    "hsts": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "NPM settings updated successfully"
}
```

#### Test NPM Connection

**Endpoint:** `POST /api/settings/npm/test`

**Description:** Tests the connection to Nginx Proxy Manager API.

**Response:**
```json
{
  "success": true,
  "message": "NPM connection successful",
  "details": {
    "version": "2.10.4",
    "hostsCount": 15,
    "certificatesCount": 8,
    "responseTime": 245
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid NPM configuration
- `503 Service Unavailable`: Cannot connect to NPM API

### Docker Settings

#### Update Docker Settings

**Endpoint:** `PUT /api/settings/docker`

**Description:** Updates Docker integration settings for container management.

**Request Body:**
```json
{
  "enabled": true,
  "socketPath": "/var/run/docker.sock",
  "timeout": 30000,
  "autoRestart": true,
  "networks": ["bridge", "host"],
  "registryAuth": {
    "enabled": false,
    "username": "",
    "password": ""
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Docker settings updated successfully"
}
```

### Renewal Settings

#### Get Renewal Settings

**Endpoint:** `GET /api/settings/renewal`

**Description:** Retrieves automatic certificate renewal configuration.

**Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "checkInterval": 86400,
    "renewBeforeDays": 30,
    "maxRetries": 3,
    "retryDelay": 3600,
    "notifications": {
      "onSuccess": true,
      "onFailure": true,
      "onExpiry": true
    },
    "schedule": {
      "hour": 2,
      "minute": 0,
      "timezone": "UTC"
    }
  }
}
```

#### Update Renewal Settings

**Endpoint:** `PUT /api/settings/renewal`

**Description:** Updates automatic certificate renewal settings.

**Request Body:**
```json
{
  "enabled": true,
  "renewBeforeDays": 45,
  "checkInterval": 43200,
  "schedule": {
    "hour": 3,
    "minute": 30
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Renewal settings updated successfully"
}
```

### Logging Settings

#### Get Logging Configuration

**Endpoint:** `GET /api/settings/logs`

**Description:** Retrieves current logging configuration and available log files.

**Response:**
```json
{
  "success": true,
  "data": {
    "logLevel": "info",
    "maxFileSize": "10MB",
    "maxFiles": 10,
    "logRotation": true,
    "logToFile": true,
    "logToConsole": true,
    "availableLogFiles": [
      {
        "filename": "application.log",
        "size": "2.4MB",
        "lastModified": "2024-01-15T10:30:00Z"
      },
      {
        "filename": "error.log",
        "size": "156KB",
        "lastModified": "2024-01-15T09:15:00Z"
      }
    ]
  }
}
```

#### Create Log Entry

**Endpoint:** `POST /api/settings/logs`

**Description:** Creates a new log entry manually.

**Request Body:**
```json
{
  "level": "info",
  "message": "Manual log entry",
  "category": "user-action",
  "metadata": {
    "userId": "admin",
    "action": "settings-update"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Log entry created successfully",
  "logId": "log_abc123"
}
```

#### Delete Log File

**Endpoint:** `DELETE /api/settings/logs/:filename`

**Description:** Deletes a specific log file.

**Parameters:**
- `filename`: Name of the log file to delete

**Response:**
```json
{
  "success": true,
  "message": "Log file deleted successfully",
  "filename": "old-application.log"
}
```

#### Update Log File Settings

**Endpoint:** `PUT /api/settings/logs/:filename`

**Description:** Updates settings for a specific log file (e.g., retention, compression).

**Parameters:**
- `filename`: Name of the log file to configure

**Request Body:**
```json
{
  "retention": "30d",
  "compression": true,
  "archived": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Log file settings updated successfully"
}
```

## Code Examples

### JavaScript/Node.js Integration

#### Complete Settings Management Class
```javascript
class SettingsAPI {
  constructor(baseUrl = '', authToken = null) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}/api/settings${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

  // General Settings
  async getGeneralSettings() {
    return this.request('/general');
  }

  async updateGeneralSettings(settings) {
    return this.request('/general', {
      method: 'PATCH',
      body: JSON.stringify(settings)
    });
  }

  // Certificate Settings
  async getCertificateSettings() {
    return this.request('/certificates');
  }

  async updateCertificateSettings(settings) {
    return this.request('/certificates', {
      method: 'PATCH',
      body: JSON.stringify(settings)
    });
  }

  // Email Settings
  async updateEmailSettings(settings) {
    return this.request('/email', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  async testEmailSettings(testEmail) {
    return this.request('/email/test', {
      method: 'POST',
      body: JSON.stringify({
        testEmail,
        subject: 'Certificate Manager Test Email',
        message: 'Testing email configuration'
      })
    });
  }

  // NPM Settings
  async updateNPMSettings(settings) {
    return this.request('/npm', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  async testNPMConnection() {
    return this.request('/npm/test', {
      method: 'POST'
    });
  }

  // Docker Settings
  async updateDockerSettings(settings) {
    return this.request('/docker', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  // Renewal Settings
  async getRenewalSettings() {
    return this.request('/renewal');
  }

  async updateRenewalSettings(settings) {
    return this.request('/renewal', {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
  }

  // Logging Settings
  async getLoggingSettings() {
    return this.request('/logs');
  }

  async createLogEntry(entry) {
    return this.request('/logs', {
      method: 'POST',
      body: JSON.stringify(entry)
    });
  }

  async deleteLogFile(filename) {
    return this.request(`/logs/${filename}`, {
      method: 'DELETE'
    });
  }
}

// Usage Examples
const settingsAPI = new SettingsAPI('https://cert-manager.local', 'your-auth-token');

// Update application theme
settingsAPI.updateGeneralSettings({ theme: 'dark' })
  .then(result => console.log('Theme updated:', result))
  .catch(error => console.error('Failed to update theme:', error));

// Test email configuration
settingsAPI.testEmailSettings('admin@example.com')
  .then(result => {
    if (result.success) {
      console.log('Email test successful:', result.details);
    }
  })
  .catch(error => console.error('Email test failed:', error));

// Configure automatic renewal
settingsAPI.updateRenewalSettings({
  enabled: true,
  renewBeforeDays: 30,
  checkInterval: 86400,
  notifications: {
    onSuccess: true,
    onFailure: true
  }
})
.then(result => console.log('Renewal settings updated'))
.catch(error => console.error('Failed to update renewal settings:', error));
```

### React Settings Management Component

```jsx
import React, { useState, useEffect } from 'react';

export function SettingsManager() {
  const [activeTab, setActiveTab] = useState('general');
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const settingsTabs = [
    { key: 'general', label: 'General', icon: '⚙️' },
    { key: 'certificates', label: 'Certificates', icon: '🔒' },
    { key: 'deployment', label: 'Deployment', icon: '🚀' },
    { key: 'email', label: 'Email', icon: '📧' },
    { key: 'npm', label: 'NPM', icon: '🔗' },
    { key: 'docker', label: 'Docker', icon: '🐳' },
    { key: 'renewal', label: 'Renewal', icon: '🔄' },
    { key: 'logs', label: 'Logging', icon: '📋' }
  ];

  useEffect(() => {
    loadSettings(activeTab);
  }, [activeTab]);

  const loadSettings = async (category) => {
    if (!['general', 'certificates', 'renewal', 'logs'].includes(category)) {
      return; // These endpoints don't have GET methods
    }

    try {
      setLoading(true);
      const response = await fetch(`/api/settings/${category}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        setSettings(result.data || result);
      }
    } catch (error) {
      console.error(`Failed to load ${category} settings:`, error);
      setMessage(`Failed to load ${category} settings`);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async (updatedSettings) => {
    try {
      setSaving(true);
      const method = ['deployment', 'email', 'npm', 'docker', 'renewal'].includes(activeTab) ? 'PUT' : 'PATCH';
      
      const response = await fetch(`/api/settings/${activeTab}`, {
        method,
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(updatedSettings)
      });

      if (response.ok) {
        const result = await response.json();
        setSettings(updatedSettings);
        setMessage(result.message || 'Settings saved successfully');
        setTimeout(() => setMessage(''), 3000);
      } else {
        throw new Error('Failed to save settings');
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      setMessage('Failed to save settings');
      setTimeout(() => setMessage(''), 3000);
    } finally {
      setSaving(false);
    }
  };

  const testConfiguration = async (type) => {
    try {
      const response = await fetch(`/api/settings/${type}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(type === 'email' ? { testEmail: 'admin@example.com' } : {})
      });

      const result = await response.json();
      if (result.success) {
        setMessage(`${type.toUpperCase()} test successful`);
      } else {
        setMessage(`${type.toUpperCase()} test failed: ${result.message}`);
      }
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      console.error(`${type} test failed:`, error);
      setMessage(`${type.toUpperCase()} test failed`);
      setTimeout(() => setMessage(''), 3000);
    }
  };

  return (
    <div className="settings-manager">
      <div className="settings-header">
        <h1>Settings Management</h1>
        {message && (
          <div className={`message ${message.includes('failed') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}
      </div>

      <div className="settings-layout">
        <nav className="settings-sidebar">
          {settingsTabs.map(tab => (
            <button
              key={tab.key}
              className={`settings-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <span className="tab-icon">{tab.icon}</span>
              <span className="tab-label">{tab.label}</span>
            </button>
          ))}
        </nav>

        <main className="settings-content">
          {loading ? (
            <div className="loading">Loading {activeTab} settings...</div>
          ) : (
            <>
              {activeTab === 'general' && (
                <GeneralSettingsPanel
                  settings={settings}
                  onSave={saveSettings}
                  saving={saving}
                />
              )}
              
              {activeTab === 'certificates' && (
                <CertificateSettingsPanel
                  settings={settings}
                  onSave={saveSettings}
                  saving={saving}
                />
              )}
              
              {activeTab === 'email' && (
                <EmailSettingsPanel
                  settings={settings}
                  onSave={saveSettings}
                  onTest={() => testConfiguration('email')}
                  saving={saving}
                />
              )}
              
              {activeTab === 'npm' && (
                <NPMSettingsPanel
                  settings={settings}
                  onSave={saveSettings}
                  onTest={() => testConfiguration('npm')}
                  saving={saving}
                />
              )}
              
              {activeTab === 'renewal' && (
                <RenewalSettingsPanel
                  settings={settings}
                  onSave={saveSettings}
                  saving={saving}
                />
              )}
              
              {/* Add other setting panels as needed */}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

// Individual Settings Panels
function GeneralSettingsPanel({ settings, onSave, saving }) {
  const [formData, setFormData] = useState(settings);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const updateField = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const updateNestedField = (parent, field, value) => {
    setFormData(prev => ({
      ...prev,
      [parent]: {
        ...prev[parent],
        [field]: value
      }
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="settings-panel">
      <h2>General Settings</h2>
      
      <div className="form-section">
        <h3>Application Configuration</h3>
        
        <div className="form-group">
          <label>Application Name</label>
          <input
            type="text"
            value={formData.applicationName || ''}
            onChange={(e) => updateField('applicationName', e.target.value)}
            placeholder="Certificate Manager"
          />
        </div>

        <div className="form-group">
          <label>Theme</label>
          <select
            value={formData.theme || 'light'}
            onChange={(e) => updateField('theme', e.target.value)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Auto</option>
          </select>
        </div>

        <div className="form-group">
          <label>Session Timeout (seconds)</label>
          <input
            type="number"
            value={formData.sessionTimeout || 3600}
            onChange={(e) => updateField('sessionTimeout', parseInt(e.target.value))}
            min="300"
            max="86400"
          />
        </div>
      </div>

      <div className="form-section">
        <h3>Security Settings</h3>
        
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={formData.securitySettings?.enforceHttps || false}
              onChange={(e) => updateNestedField('securitySettings', 'enforceHttps', e.target.checked)}
            />
            Enforce HTTPS
          </label>
        </div>

        <div className="form-group">
          <label>Minimum Password Length</label>
          <input
            type="number"
            value={formData.securitySettings?.passwordMinLength || 8}
            onChange={(e) => updateNestedField('securitySettings', 'passwordMinLength', parseInt(e.target.value))}
            min="6"
            max="32"
          />
        </div>
      </div>

      <div className="form-actions">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save General Settings'}
        </button>
      </div>
    </form>
  );
}

function EmailSettingsPanel({ settings, onSave, onTest, saving }) {
  const [formData, setFormData] = useState(settings);

  useEffect(() => {
    setFormData(settings);
  }, [settings]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  const updateField = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const updateNotificationField = (field, value) => {
    setFormData(prev => ({
      ...prev,
      notifications: {
        ...prev.notifications,
        [field]: value
      }
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="settings-panel">
      <h2>Email Settings</h2>
      
      <div className="form-section">
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={formData.enabled || false}
              onChange={(e) => updateField('enabled', e.target.checked)}
            />
            Enable Email Notifications
          </label>
        </div>
      </div>

      {formData.enabled && (
        <>
          <div className="form-section">
            <h3>SMTP Configuration</h3>
            
            <div className="form-group">
              <label>SMTP Host</label>
              <input
                type="text"
                value={formData.smtpHost || ''}
                onChange={(e) => updateField('smtpHost', e.target.value)}
                placeholder="smtp.gmail.com"
                required
              />
            </div>

            <div className="form-group">
              <label>SMTP Port</label>
              <input
                type="number"
                value={formData.smtpPort || 587}
                onChange={(e) => updateField('smtpPort', parseInt(e.target.value))}
                min="1"
                max="65535"
              />
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.smtpSecure || false}
                  onChange={(e) => updateField('smtpSecure', e.target.checked)}
                />
                Use TLS/SSL
              </label>
            </div>

            <div className="form-group">
              <label>Username</label>
              <input
                type="email"
                value={formData.smtpUser || ''}
                onChange={(e) => updateField('smtpUser', e.target.value)}
                placeholder="your-email@gmail.com"
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={formData.smtpPassword || ''}
                onChange={(e) => updateField('smtpPassword', e.target.value)}
                placeholder="Your app password"
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Email Content</h3>
            
            <div className="form-group">
              <label>From Email</label>
              <input
                type="email"
                value={formData.fromEmail || ''}
                onChange={(e) => updateField('fromEmail', e.target.value)}
                placeholder="certificates@yourdomain.com"
              />
            </div>

            <div className="form-group">
              <label>From Name</label>
              <input
                type="text"
                value={formData.fromName || ''}
                onChange={(e) => updateField('fromName', e.target.value)}
                placeholder="Certificate Manager"
              />
            </div>
          </div>

          <div className="form-section">
            <h3>Notification Types</h3>
            
            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.notifications?.certificateExpiry || false}
                  onChange={(e) => updateNotificationField('certificateExpiry', e.target.checked)}
                />
                Certificate Expiry Warnings
              </label>
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.notifications?.renewalSuccess || false}
                  onChange={(e) => updateNotificationField('renewalSuccess', e.target.checked)}
                />
                Renewal Success
              </label>
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.notifications?.renewalFailure || false}
                  onChange={(e) => updateNotificationField('renewalFailure', e.target.checked)}
                />
                Renewal Failures
              </label>
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={formData.notifications?.deploymentFailure || false}
                  onChange={(e) => updateNotificationField('deploymentFailure', e.target.checked)}
                />
                Deployment Failures
              </label>
            </div>
          </div>
        </>
      )}

      <div className="form-actions">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Saving...' : 'Save Email Settings'}
        </button>
        {formData.enabled && (
          <button type="button" onClick={onTest} className="btn-secondary">
            Test Email Configuration
          </button>
        )}
      </div>
    </form>
  );
}
```

## Error Handling

Settings API errors follow standard HTTP status codes with detailed error information:

```json
{
  "success": false,
  "error": "Validation Error",
  "message": "SMTP host is required when email notifications are enabled",
  "statusCode": 400,
  "details": {
    "field": "smtpHost",
    "value": null,
    "constraint": "required_when_enabled"
  }
}
```

### Common Error Codes:
- **400 Bad Request**: Invalid settings data or validation errors
- **401 Unauthorized**: Authentication required
- **403 Forbidden**: Insufficient privileges for settings modification
- **404 Not Found**: Settings category or resource not found
- **422 Unprocessable Entity**: Valid JSON but invalid settings values
- **500 Internal Server Error**: Server error during settings operation

### Error Handling Best Practices:

```javascript
async function handleSettingsOperation(operation) {
  try {
    const result = await operation();
    return { success: true, data: result };
  } catch (error) {
    console.error('Settings operation failed:', error);
    
    if (error.response) {
      const errorData = await error.response.json();
      return {
        success: false,
        error: errorData.error,
        message: errorData.message,
        statusCode: error.response.status
      };
    }
    
    return {
      success: false,
      error: 'Network Error',
      message: 'Failed to communicate with server',
      statusCode: 0
    };
  }
}
```

## Security Considerations

1. **Administrative Access**: All settings modifications require administrative privileges
2. **Sensitive Data Masking**: Passwords and API keys are masked in GET responses
3. **Input Validation**: All settings are validated before saving to prevent injection attacks
4. **Audit Logging**: All settings changes are logged with user identification
5. **Rate Limiting**: Settings API endpoints are rate-limited to prevent abuse
6. **CSRF Protection**: Cross-site request forgery protection is enabled
7. **Backup Security**: Settings backups may contain sensitive information and should be secured

## Best Practices

1. **Backup Before Changes**: Always export settings before making major modifications
2. **Test Configurations**: Use test endpoints to validate settings before saving
3. **Incremental Updates**: Update settings in small batches rather than all at once
4. **Monitor Changes**: Review settings audit logs regularly for unauthorized changes
5. **Environment Separation**: Use different settings for development and production environments
6. **Version Control**: Keep track of settings changes and maintain rollback procedures
7. **Documentation**: Document custom configurations and their purposes
8. **Regular Reviews**: Periodically review and update settings as requirements change

---

**Note**: The Settings API provides comprehensive configuration management for the Certificate Manager. Always test configuration changes in a non-production environment first and maintain proper backups of your settings.
