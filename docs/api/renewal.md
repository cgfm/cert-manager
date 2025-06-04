# Auto-Renewal API

This section documents the Auto-Renewal API endpoints for the Certificate Manager application. The Auto-Renewal API provides functionality to manage automatic certificate renewal processes, monitoring, and scheduling.

## Base URL

All Auto-Renewal endpoints are relative to the base API URL:
```
/api/renewal
```

## Authentication

All Auto-Renewal endpoints require authentication with appropriate privileges.

## Overview

The Auto-Renewal system provides:
- **Automatic Certificate Monitoring**: Continuously monitors certificates for upcoming expiration
- **Intelligent Renewal Logic**: Automatically renews certificates before they expire
- **File System Watching**: Monitors certificate files for changes
- **Scheduled Operations**: Configurable cron-based renewal checks
- **Manual Controls**: Ability to trigger manual renewal checks and system restarts

## Endpoints

### Get Renewal Service Status

Retrieves the current status of the renewal service including active monitoring, scheduled operations, and recent activity.

**Endpoint:** `GET /api/renewal/status`

**Authentication:** Required

**Parameters:** None

**Response:**

- **200 OK**: Returns renewal service status information
- **401 Unauthorized**: Authentication required
- **500 Internal Server Error**: Server error

**Response Format:**
```json
{
  "status": "active",
  "isRunning": true,
  "fileWatcherActive": true,
  "cronJobActive": true,
  "nextScheduledCheck": "2024-01-15T02:00:00Z",
  "lastCheckTime": "2024-01-14T02:00:00Z",
  "lastCheckResult": {
    "certificatesChecked": 25,
    "certificatesRenewed": 2,
    "certificatesFailed": 0,
    "duration": 1234
  },
  "monitoringStats": {
    "totalCertificates": 25,
    "expiringWithin30Days": 5,
    "expiringWithin7Days": 2,
    "expiredCertificates": 0
  },
  "configuration": {
    "checkInterval": 86400,
    "renewBeforeDays": 30,
    "maxRetryAttempts": 3,
    "batchSize": 5
  }
}
```

### Trigger Manual Renewal Check

Initiates a manual check for certificates that need renewal.

**Endpoint:** `POST /api/renewal/check`

**Authentication:** Required

**Request Body:**
```json
{
  "forceAll": false
}
```

**Parameters:**
- `forceAll` (boolean, optional): If true, checks all certificates regardless of expiration date

**Response:**

- **200 OK**: Returns renewal check results
- **401 Unauthorized**: Authentication required
- **500 Internal Server Error**: Server error

**Response Format:**
```json
{
  "success": true,
  "message": "Renewal check completed successfully",
  "results": {
    "certificatesChecked": 25,
    "certificatesRenewed": 3,
    "certificatesFailed": 0,
    "skippedCertificates": 22,
    "duration": 2156,
    "timestamp": "2024-01-14T10:30:00Z"
  },
  "renewedCertificates": [
    {
      "id": "cert-001",
      "commonName": "example.com",
      "previousExpiry": "2024-01-20T00:00:00Z",
      "newExpiry": "2024-04-20T00:00:00Z",
      "renewalMethod": "acme"
    }
  ],
  "failedCertificates": []
}
```

### Restart File Watcher

Restarts the file system watcher that monitors certificate files for changes.

**Endpoint:** `POST /api/renewal/watcher/restart`

**Authentication:** Required

**Parameters:** None

**Response:**

- **200 OK**: File watcher restarted successfully
- **401 Unauthorized**: Authentication required
- **500 Internal Server Error**: Server error

**Response Format:**
```json
{
  "success": true,
  "message": "File watcher restarted successfully",
  "timestamp": "2024-01-14T10:30:00Z"
}
```

### Update Renewal Schedule

Updates the cron schedule for automatic renewal checks.

**Endpoint:** `POST /api/renewal/schedule`

**Authentication:** Required

**Request Body:**
```json
{
  "schedule": "0 2 * * *"
}
```

**Parameters:**
- `schedule` (string, optional): Cron expression for renewal schedule

**Response:**

- **200 OK**: Schedule updated successfully
- **400 Bad Request**: Invalid schedule format
- **401 Unauthorized**: Authentication required
- **500 Internal Server Error**: Server error

**Response Format:**
```json
{
  "success": true,
  "message": "Renewal schedule updated successfully",
  "nextScheduledCheck": "2024-01-15T02:00:00Z",
  "schedule": "0 2 * * *"
}
```

## Code Examples

### cURL

```bash
# Get renewal service status
curl -X GET "https://your-cert-manager.com/api/renewal/status" \
  -H "Content-Type: application/json" \
  -b "session=your-session-cookie"

# Trigger manual renewal check
curl -X POST "https://your-cert-manager.com/api/renewal/check" \
  -H "Content-Type: application/json" \
  -b "session=your-session-cookie" \
  -d '{"forceAll": false}'

# Restart file watcher
curl -X POST "https://your-cert-manager.com/api/renewal/watcher/restart" \
  -H "Content-Type: application/json" \
  -b "session=your-session-cookie"

# Update renewal schedule
curl -X POST "https://your-cert-manager.com/api/renewal/schedule" \
  -H "Content-Type: application/json" \
  -b "session=your-session-cookie" \
  -d '{"schedule": "0 3 * * *"}'
```

### JavaScript (Fetch API)

```javascript
class RenewalAPI {
  constructor(baseUrl = '') {
    this.baseUrl = baseUrl;
  }

  async getStatus() {
    const response = await fetch(`${this.baseUrl}/api/renewal/status`, {
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }

  async triggerRenewalCheck(forceAll = false) {
    const response = await fetch(`${this.baseUrl}/api/renewal/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ forceAll })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }

  async restartFileWatcher() {
    const response = await fetch(`${this.baseUrl}/api/renewal/watcher/restart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }

  async updateSchedule(schedule) {
    const response = await fetch(`${this.baseUrl}/api/renewal/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ schedule })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }
}

// Usage
const renewalAPI = new RenewalAPI();

// Get current renewal status
renewalAPI.getStatus()
  .then(status => {
    console.log('Renewal Service Status:', status);
    console.log(`Next check: ${status.nextScheduledCheck}`);
    console.log(`Certificates expiring within 30 days: ${status.monitoringStats.expiringWithin30Days}`);
  })
  .catch(error => {
    console.error('Error getting renewal status:', error);
  });

// Trigger manual renewal check
renewalAPI.triggerRenewalCheck(false)
  .then(result => {
    console.log('Renewal check completed:', result);
    console.log(`Certificates renewed: ${result.results.certificatesRenewed}`);
    
    if (result.renewedCertificates.length > 0) {
      console.log('Renewed certificates:');
      result.renewedCertificates.forEach(cert => {
        console.log(`- ${cert.commonName} (new expiry: ${cert.newExpiry})`);
      });
    }
  })
  .catch(error => {
    console.error('Error triggering renewal check:', error);
  });

// Update renewal schedule to run at 3 AM daily
renewalAPI.updateSchedule('0 3 * * *')
  .then(result => {
    console.log('Schedule updated:', result);
    console.log(`Next scheduled check: ${result.nextScheduledCheck}`);
  })
  .catch(error => {
    console.error('Error updating schedule:', error);
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

class RenewalManager {
  async getRenewalStatus() {
    try {
      const response = await api.get('/renewal/status');
      return response.data;
    } catch (error) {
      console.error('Error fetching renewal status:', error.response?.data || error.message);
      throw error;
    }
  }

  async performRenewalCheck(forceAll = false) {
    try {
      const response = await api.post('/renewal/check', { forceAll });
      return response.data;
    } catch (error) {
      console.error('Error performing renewal check:', error.response?.data || error.message);
      throw error;
    }
  }

  async restartWatcher() {
    try {
      const response = await api.post('/renewal/watcher/restart');
      return response.data;
    } catch (error) {
      console.error('Error restarting file watcher:', error.response?.data || error.message);
      throw error;
    }
  }

  async updateRenewalSchedule(cronExpression) {
    try {
      const response = await api.post('/renewal/schedule', {
        schedule: cronExpression
      });
      return response.data;
    } catch (error) {
      console.error('Error updating renewal schedule:', error.response?.data || error.message);
      throw error;
    }
  }

  async monitorRenewalHealth() {
    try {
      const status = await this.getRenewalStatus();
      
      const healthIssues = [];
      
      // Check if renewal service is running
      if (!status.isRunning) {
        healthIssues.push('Renewal service is not running');
      }
      
      // Check if file watcher is active
      if (!status.fileWatcherActive) {
        healthIssues.push('File watcher is not active');
      }
      
      // Check for expired certificates
      if (status.monitoringStats.expiredCertificates > 0) {
        healthIssues.push(`${status.monitoringStats.expiredCertificates} certificates have expired`);
      }
      
      // Check for certificates expiring soon
      if (status.monitoringStats.expiringWithin7Days > 0) {
        healthIssues.push(`${status.monitoringStats.expiringWithin7Days} certificates expire within 7 days`);
      }
      
      return {
        healthy: healthIssues.length === 0,
        issues: healthIssues,
        status: status
      };
    } catch (error) {
      return {
        healthy: false,
        issues: ['Failed to retrieve renewal status'],
        error: error.message
      };
    }
  }
}

// Usage
const renewalManager = new RenewalManager();

// Monitor renewal system health
renewalManager.monitorRenewalHealth()
  .then(health => {
    if (health.healthy) {
      console.log('✅ Renewal system is healthy');
    } else {
      console.log('⚠️ Renewal system issues detected:');
      health.issues.forEach(issue => console.log(`  - ${issue}`));
    }
  });

// Perform automatic maintenance
async function performMaintenance() {
  console.log('Starting renewal system maintenance...');
  
  try {
    // Restart file watcher
    await renewalManager.restartWatcher();
    console.log('✅ File watcher restarted');
    
    // Trigger renewal check
    const renewalResult = await renewalManager.performRenewalCheck();
    console.log(`✅ Renewal check completed: ${renewalResult.results.certificatesRenewed} certificates renewed`);
    
    // Check system health
    const health = await renewalManager.monitorRenewalHealth();
    if (health.healthy) {
      console.log('✅ Maintenance completed successfully');
    } else {
      console.log('⚠️ Maintenance completed with issues:', health.issues);
    }
  } catch (error) {
    console.error('❌ Maintenance failed:', error.message);
  }
}
```

### Python (requests)

```python
import requests
from datetime import datetime, timedelta
import json

class RenewalAPI:
    def __init__(self, base_url, session_cookie=None):
        self.base_url = base_url
        self.session = requests.Session()
        if session_cookie:
            self.session.cookies.set('session', session_cookie)
    
    def get_status(self):
        """Get renewal service status"""
        try:
            response = self.session.get(f"{self.base_url}/api/renewal/status")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error getting renewal status: {e}")
            raise
    
    def trigger_renewal_check(self, force_all=False):
        """Trigger manual renewal check"""
        try:
            response = self.session.post(
                f"{self.base_url}/api/renewal/check",
                json={'forceAll': force_all}
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error triggering renewal check: {e}")
            raise
    
    def restart_file_watcher(self):
        """Restart the file watcher"""
        try:
            response = self.session.post(f"{self.base_url}/api/renewal/watcher/restart")
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error restarting file watcher: {e}")
            raise
    
    def update_schedule(self, cron_expression):
        """Update renewal schedule"""
        try:
            response = self.session.post(
                f"{self.base_url}/api/renewal/schedule",
                json={'schedule': cron_expression}
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error updating schedule: {e}")
            raise
    
    def generate_renewal_report(self):
        """Generate comprehensive renewal status report"""
        try:
            status = self.get_status()
            
            report = {
                'timestamp': datetime.now().isoformat(),
                'service_status': 'healthy' if status['isRunning'] else 'unhealthy',
                'monitoring': {
                    'total_certificates': status['monitoringStats']['totalCertificates'],
                    'expiring_30_days': status['monitoringStats']['expiringWithin30Days'],
                    'expiring_7_days': status['monitoringStats']['expiringWithin7Days'],
                    'expired': status['monitoringStats']['expiredCertificates']
                },
                'next_check': status['nextScheduledCheck'],
                'last_check': status.get('lastCheckTime'),
                'recommendations': []
            }
            
            # Generate recommendations
            if status['monitoringStats']['expiredCertificates'] > 0:
                report['recommendations'].append('Immediate action required: expired certificates detected')
            
            if status['monitoringStats']['expiringWithin7Days'] > 0:
                report['recommendations'].append('Urgent: certificates expiring within 7 days')
            
            if not status['fileWatcherActive']:
                report['recommendations'].append('File watcher is inactive - restart recommended')
            
            if not status['cronJobActive']:
                report['recommendations'].append('Scheduled renewals are disabled')
            
            return report
            
        except Exception as e:
            return {
                'timestamp': datetime.now().isoformat(),
                'service_status': 'error',
                'error': str(e)
            }

# Usage
api = RenewalAPI('https://your-cert-manager.com')

try:
    # Get current status
    status = api.get_status()
    print(f"Renewal service is {'running' if status['isRunning'] else 'stopped'}")
    print(f"Next scheduled check: {status['nextScheduledCheck']}")
    
    # Generate and display report
    report = api.generate_renewal_report()
    print("\n=== Renewal Status Report ===")
    print(f"Service Status: {report['service_status']}")
    print(f"Total Certificates: {report['monitoring']['total_certificates']}")
    print(f"Expiring within 30 days: {report['monitoring']['expiring_30_days']}")
    print(f"Expiring within 7 days: {report['monitoring']['expiring_7_days']}")
    print(f"Expired: {report['monitoring']['expired']}")
    
    if report['recommendations']:
        print("\nRecommendations:")
        for rec in report['recommendations']:
            print(f"  - {rec}")
    
    # Trigger renewal check if certificates are expiring soon
    if report['monitoring']['expiring_7_days'] > 0:
        print("\nTriggering renewal check for expiring certificates...")
        result = api.trigger_renewal_check()
        print(f"Renewal check completed: {result['results']['certificatesRenewed']} certificates renewed")

except Exception as e:
    print(f"Error: {e}")
```

### React Hook for Renewal Monitoring

```jsx
import { useState, useEffect, useCallback } from 'react';

export function useRenewalMonitoring(refreshInterval = 30000) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch('/api/renewal/status', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch renewal status: ${response.statusText}`);
      }

      const data = await response.json();
      setStatus(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerRenewalCheck = useCallback(async (forceAll = false) => {
    try {
      const response = await fetch('/api/renewal/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ forceAll })
      });

      if (!response.ok) {
        throw new Error(`Failed to trigger renewal check: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Refresh status after renewal check
      await fetchStatus();
      
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchStatus]);

  const restartFileWatcher = useCallback(async () => {
    try {
      const response = await fetch('/api/renewal/watcher/restart', {
        method: 'POST',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to restart file watcher: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Refresh status after restart
      await fetchStatus();
      
      return result;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchStatus]);

  useEffect(() => {
    fetchStatus();
    
    // Set up periodic refresh if interval is provided
    if (refreshInterval > 0) {
      const interval = setInterval(fetchStatus, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchStatus, refreshInterval]);

  return {
    status,
    loading,
    error,
    refresh: fetchStatus,
    triggerRenewalCheck,
    restartFileWatcher
  };
}

// Example component using the hook
export function RenewalStatusDashboard() {
  const {
    status,
    loading,
    error,
    refresh,
    triggerRenewalCheck,
    restartFileWatcher
  } = useRenewalMonitoring(60000); // Refresh every minute

  const [isChecking, setIsChecking] = useState(false);

  const handleManualCheck = async () => {
    setIsChecking(true);
    try {
      const result = await triggerRenewalCheck();
      alert(`Renewal check completed: ${result.results.certificatesRenewed} certificates renewed`);
    } catch (error) {
      alert(`Renewal check failed: ${error.message}`);
    } finally {
      setIsChecking(false);
    }
  };

  const handleRestartWatcher = async () => {
    try {
      await restartFileWatcher();
      alert('File watcher restarted successfully');
    } catch (error) {
      alert(`Failed to restart file watcher: ${error.message}`);
    }
  };

  if (loading) return <div>Loading renewal status...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!status) return <div>No status data available</div>;

  return (
    <div className="renewal-dashboard">
      <div className="dashboard-header">
        <h2>Auto-Renewal Status</h2>
        <button onClick={refresh}>Refresh</button>
      </div>

      <div className="status-cards">
        <div className={`status-card ${status.isRunning ? 'healthy' : 'unhealthy'}`}>
          <h3>Service Status</h3>
          <p>{status.isRunning ? 'Running' : 'Stopped'}</p>
        </div>

        <div className="status-card">
          <h3>Next Check</h3>
          <p>{new Date(status.nextScheduledCheck).toLocaleString()}</p>
        </div>

        <div className="status-card">
          <h3>Certificates</h3>
          <p>Total: {status.monitoringStats.totalCertificates}</p>
          <p>Expiring (30d): {status.monitoringStats.expiringWithin30Days}</p>
          <p>Expiring (7d): {status.monitoringStats.expiringWithin7Days}</p>
        </div>
      </div>

      <div className="actions">
        <button 
          onClick={handleManualCheck}
          disabled={isChecking}
        >
          {isChecking ? 'Checking...' : 'Manual Check'}
        </button>
        
        <button onClick={handleRestartWatcher}>
          Restart File Watcher
        </button>
      </div>

      {status.lastCheckResult && (
        <div className="last-check-result">
          <h3>Last Check Result</h3>
          <p>Certificates Checked: {status.lastCheckResult.certificatesChecked}</p>
          <p>Certificates Renewed: {status.lastCheckResult.certificatesRenewed}</p>
          <p>Failed: {status.lastCheckResult.certificatesFailed}</p>
          <p>Duration: {status.lastCheckResult.duration}ms</p>
        </div>
      )}
    </div>
  );
}
```

## Error Handling

Auto-Renewal API errors follow standard HTTP status codes:

```json
{
  "message": "Failed to check for renewals",
  "error": "Certificate validation failed",
  "statusCode": 500
}
```

Common error responses:
- **400 Bad Request**: Invalid request parameters or schedule format
- **401 Unauthorized**: Authentication required
- **500 Internal Server Error**: Renewal service error

## Monitoring and Alerts

### Health Check Implementation

```javascript
async function checkRenewalHealth() {
  try {
    const status = await fetch('/api/renewal/status').then(r => r.json());
    
    const issues = [];
    
    if (!status.isRunning) issues.push('Service not running');
    if (!status.fileWatcherActive) issues.push('File watcher inactive');
    if (status.monitoringStats.expiredCertificates > 0) issues.push('Expired certificates');
    if (status.monitoringStats.expiringWithin7Days > 0) issues.push('Certificates expiring soon');
    
    return {
      healthy: issues.length === 0,
      issues,
      status
    };
  } catch (error) {
    return {
      healthy: false,
      issues: ['Failed to check status'],
      error: error.message
    };
  }
}
```

## Security Considerations

1. **Administrative Access**: Renewal management requires appropriate privileges
2. **Rate Limiting**: Manual renewal checks are rate-limited to prevent abuse
3. **System Resources**: Renewal operations consume system resources
4. **File System Access**: File watcher requires appropriate file system permissions
5. **Process Management**: Renewal service manages background processes

## Best Practices

1. **Monitor Regularly**: Check renewal status frequently to catch issues early
2. **Test Renewals**: Perform manual checks to validate renewal processes
3. **Schedule Appropriately**: Set renewal schedules during low-traffic periods
4. **Monitor Resources**: Ensure adequate system resources for renewal operations
5. **Backup Configurations**: Maintain backups of renewal configurations

## Related APIs

- [Certificates API](./certificates.md) - For managing individual certificates
- [Settings API](./settings.md) - For configuring renewal settings
- [Logs API](./logs.md) - For viewing renewal operation logs

---

**Note**: The Auto-Renewal system runs continuously in the background. Monitor its status regularly to ensure certificates are renewed automatically before expiration.
