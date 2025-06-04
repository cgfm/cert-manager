# Deployment API

The Deployment API provides comprehensive management of certificate deployment actions, allowing you to automatically deploy certificates to various targets when they are issued or renewed.

## Base URL
All deployment endpoints are prefixed with `/api/deployment-actions`

## Authentication
All deployment endpoints require authentication. Include the session token in your requests.

## Deployment Object Structure

```json
{
  "id": "string",
  "name": "string",
  "description": "string",
  "type": "string", // copy, ssh-copy, docker-compose, docker-container, webhook, nginx-reload, apache-reload, etc.
  "enabled": true,
  "order": 1,
  "certificate_id": "string",
  "config": {
    // Type-specific configuration object
  },
  "last_execution": {
    "timestamp": "2024-01-15T10:30:00Z",
    "status": "success|failed|running",
    "output": "string",
    "error": "string"
  },
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

## Deployment Types

### Supported Deployment Types
- `copy`: Copy files to local directory
- `ssh-copy`: Copy files via SSH to remote server
- `docker-compose`: Restart Docker Compose services
- `docker-container`: Restart Docker containers
- `webhook`: Send HTTP webhook notifications
- `nginx-reload`: Reload Nginx configuration
- `apache-reload`: Reload Apache configuration
- `systemd-restart`: Restart systemd services
- `custom-script`: Execute custom shell scripts
- `ftp-upload`: Upload via FTP/SFTP

## Endpoints

### List Deployment Actions

Get all deployment actions with optional filtering.

**Endpoint:** `GET /api/deployment-actions`

**Query Parameters:**
- `certificate_id` (optional): Filter by certificate ID
- `type` (optional): Filter by deployment type
- `enabled` (optional): Filter by enabled status

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "deploy_001",
      "name": "Nginx Production Deployment",
      "description": "Deploy certificate to production Nginx server",
      "type": "ssh-copy",
      "enabled": true,
      "order": 1,
      "certificate_id": "cert_001",
      "config": {
        "host": "prod-server.example.com",
        "username": "deploy",
        "key_path": "/path/to/ssh/key",
        "cert_path": "/etc/nginx/ssl/cert.pem",
        "key_path_remote": "/etc/nginx/ssl/key.pem",
        "post_command": "systemctl reload nginx"
      },
      "last_execution": {
        "timestamp": "2024-01-15T10:30:00Z",
        "status": "success",
        "output": "Certificate deployed successfully"
      }
    }
  ],
  "total": 1
}
```

### Get Deployment Action

Get details of a specific deployment action.

**Endpoint:** `GET /api/deployment-actions/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "deploy_001",
    "name": "Nginx Production Deployment",
    "description": "Deploy certificate to production Nginx server",
    "type": "ssh-copy",
    "enabled": true,
    "order": 1,
    "certificate_id": "cert_001",
    "config": {
      "host": "prod-server.example.com",
      "username": "deploy",
      "key_path": "/path/to/ssh/key",
      "cert_path": "/etc/nginx/ssl/cert.pem",
      "key_path_remote": "/etc/nginx/ssl/key.pem",
      "post_command": "systemctl reload nginx"
    }
  }
}
```

### Create Deployment Action

Create a new deployment action.

**Endpoint:** `POST /api/deployment-actions`

**Request Body:**
```json
{
  "name": "Docker Container Restart",
  "description": "Restart web container after certificate renewal",
  "type": "docker-container",
  "enabled": true,
  "certificate_id": "cert_001",
  "config": {
    "container_name": "web-server",
    "docker_socket": "/var/run/docker.sock"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Deployment action created successfully",
  "data": {
    "id": "deploy_002",
    "name": "Docker Container Restart",
    "description": "Restart web container after certificate renewal",
    "type": "docker-container",
    "enabled": true,
    "order": 2,
    "certificate_id": "cert_001",
    "config": {
      "container_name": "web-server",
      "docker_socket": "/var/run/docker.sock"
    },
    "created_at": "2024-01-15T11:00:00Z"
  }
}
```

### Update Deployment Action

Update an existing deployment action.

**Endpoint:** `PUT /api/deployment-actions/:id`

**Request Body:**
```json
{
  "name": "Updated Nginx Deployment",
  "description": "Updated deployment configuration",
  "enabled": false,
  "config": {
    "host": "new-server.example.com",
    "username": "deploy",
    "key_path": "/path/to/new/ssh/key",
    "cert_path": "/etc/nginx/ssl/cert.pem",
    "key_path_remote": "/etc/nginx/ssl/key.pem",
    "post_command": "systemctl reload nginx"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Deployment action updated successfully",
  "data": {
    "id": "deploy_001",
    "name": "Updated Nginx Deployment",
    "description": "Updated deployment configuration",
    "enabled": false,
    "updated_at": "2024-01-15T11:30:00Z"
  }
}
```

### Delete Deployment Action

Delete a deployment action.

**Endpoint:** `DELETE /api/deployment-actions/:id`

**Response:**
```json
{
  "success": true,
  "message": "Deployment action deleted successfully"
}
```

### Test Deployment Action

Test a deployment action without affecting the actual certificate.

**Endpoint:** `POST /api/deployment-actions/:id/test`

**Response:**
```json
{
  "success": true,
  "message": "Deployment test completed",
  "data": {
    "status": "success",
    "output": "Connection successful. All paths accessible.",
    "duration": "2.5s",
    "tested_at": "2024-01-15T12:00:00Z"
  }
}
```

### Execute Deployment Action

Manually execute a deployment action.

**Endpoint:** `POST /api/deployment-actions/:id/execute`

**Response:**
```json
{
  "success": true,
  "message": "Deployment action executed successfully",
  "data": {
    "execution_id": "exec_001",
    "status": "running",
    "started_at": "2024-01-15T12:15:00Z"
  }
}
```

### Get Execution Status

Get the status of a deployment execution.

**Endpoint:** `GET /api/deployment-actions/:id/executions/:execution_id`

**Response:**
```json
{
  "success": true,
  "data": {
    "execution_id": "exec_001",
    "status": "success",
    "output": "Certificate deployed successfully\nNginx reloaded",
    "error": null,
    "started_at": "2024-01-15T12:15:00Z",
    "completed_at": "2024-01-15T12:15:30Z",
    "duration": "30s"
  }
}
```

### Reorder Deployment Actions

Update the execution order of deployment actions.

**Endpoint:** `PUT /api/deployment-actions/reorder`

**Request Body:**
```json
{
  "order": [
    {
      "id": "deploy_001",
      "order": 1
    },
    {
      "id": "deploy_002",
      "order": 2
    },
    {
      "id": "deploy_003",
      "order": 3
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Deployment actions reordered successfully"
}
```

### Toggle Deployment Action

Enable or disable a deployment action.

**Endpoint:** `POST /api/deployment-actions/:id/toggle`

**Response:**
```json
{
  "success": true,
  "message": "Deployment action toggled successfully",
  "data": {
    "id": "deploy_001",
    "enabled": false
  }
}
```

### Get Execution History

Get execution history for a deployment action.

**Endpoint:** `GET /api/deployment-actions/:id/history`

**Query Parameters:**
- `limit` (optional): Number of records to return (default: 50)
- `offset` (optional): Number of records to skip (default: 0)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "execution_id": "exec_001",
      "status": "success",
      "output": "Certificate deployed successfully",
      "started_at": "2024-01-15T12:15:00Z",
      "completed_at": "2024-01-15T12:15:30Z",
      "duration": "30s"
    },
    {
      "execution_id": "exec_002",
      "status": "failed",
      "error": "SSH connection failed",
      "started_at": "2024-01-14T12:15:00Z",
      "completed_at": "2024-01-14T12:15:05Z",
      "duration": "5s"
    }
  ],
  "total": 2
}
```

## Configuration Examples

### SSH Copy Deployment
```json
{
  "type": "ssh-copy",
  "config": {
    "host": "server.example.com",
    "port": 22,
    "username": "deploy",
    "key_path": "/path/to/ssh/key",
    "cert_path": "/etc/ssl/certs/cert.pem",
    "key_path_remote": "/etc/ssl/private/key.pem",
    "chain_path": "/etc/ssl/certs/chain.pem",
    "post_command": "systemctl reload nginx",
    "chmod_cert": "644",
    "chmod_key": "600"
  }
}
```

### Docker Container Deployment
```json
{
  "type": "docker-container",
  "config": {
    "container_name": "web-server",
    "docker_socket": "/var/run/docker.sock",
    "restart_policy": "restart",
    "timeout": 30
  }
}
```

### Webhook Deployment
```json
{
  "type": "webhook",
  "config": {
    "url": "https://api.example.com/webhook/cert-updated",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer token123",
      "Content-Type": "application/json"
    },
    "payload": {
      "certificate_id": "{{certificate_id}}",
      "domain": "{{domain}}",
      "renewed_at": "{{timestamp}}"
    }
  }
}
```

### Custom Script Deployment
```json
{
  "type": "custom-script",
  "config": {
    "script_path": "/scripts/deploy-cert.sh",
    "arguments": ["{{cert_path}}", "{{key_path}}", "{{domain}}"],
    "working_directory": "/scripts",
    "timeout": 60,
    "environment": {
      "CERT_DOMAIN": "{{domain}}",
      "CERT_PATH": "{{cert_path}}"
    }
  }
}
```

## Code Examples

### JavaScript/Node.js

```javascript
// List all deployment actions
async function getDeploymentActions() {
  const response = await fetch('/api/deployment-actions', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  return data.data;
}

// Create SSH deployment action
async function createSSHDeployment(certificateId) {
  const deploymentAction = {
    name: 'Production Server Deployment',
    description: 'Deploy certificate to production web server',
    type: 'ssh-copy',
    enabled: true,
    certificate_id: certificateId,
    config: {
      host: 'prod-server.example.com',
      username: 'deploy',
      key_path: '/home/deploy/.ssh/id_rsa',
      cert_path: '/etc/nginx/ssl/cert.pem',
      key_path_remote: '/etc/nginx/ssl/key.pem',
      post_command: 'systemctl reload nginx'
    }
  };
  
  const response = await fetch('/api/deployment-actions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(deploymentAction)
  });
  
  return await response.json();
}

// Test deployment action
async function testDeployment(deploymentId) {
  const response = await fetch(`/api/deployment-actions/${deploymentId}/test`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  return await response.json();
}

// Execute deployment and monitor status
async function executeDeployment(deploymentId) {
  const response = await fetch(`/api/deployment-actions/${deploymentId}/execute`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const result = await response.json();
  
  if (result.success) {
    // Poll for execution status
    return await pollExecutionStatus(deploymentId, result.data.execution_id);
  }
  
  throw new Error(result.message);
}

async function pollExecutionStatus(deploymentId, executionId) {
  while (true) {
    const response = await fetch(`/api/deployment-actions/${deploymentId}/executions/${executionId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (result.data.status !== 'running') {
      return result.data;
    }
    
    // Wait 2 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}
```

### Python

```python
import requests
import time

class DeploymentManager:
    def __init__(self, base_url, token):
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
    
    def get_deployment_actions(self, certificate_id=None):
        """Get all deployment actions"""
        params = {}
        if certificate_id:
            params['certificate_id'] = certificate_id
            
        response = requests.get(
            f'{self.base_url}/api/deployment-actions',
            headers=self.headers,
            params=params
        )
        response.raise_for_status()
        return response.json()['data']
    
    def create_docker_deployment(self, certificate_id, container_name):
        """Create Docker container deployment action"""
        deployment_action = {
            'name': f'Docker {container_name} Deployment',
            'description': f'Restart {container_name} container after certificate renewal',
            'type': 'docker-container',
            'enabled': True,
            'certificate_id': certificate_id,
            'config': {
                'container_name': container_name,
                'docker_socket': '/var/run/docker.sock',
                'restart_policy': 'restart',
                'timeout': 30
            }
        }
        
        response = requests.post(
            f'{self.base_url}/api/deployment-actions',
            headers=self.headers,
            json=deployment_action
        )
        response.raise_for_status()
        return response.json()['data']
    
    def test_deployment(self, deployment_id):
        """Test deployment action"""
        response = requests.post(
            f'{self.base_url}/api/deployment-actions/{deployment_id}/test',
            headers=self.headers
        )
        response.raise_for_status()
        return response.json()['data']
    
    def execute_deployment(self, deployment_id):
        """Execute deployment and wait for completion"""
        response = requests.post(
            f'{self.base_url}/api/deployment-actions/{deployment_id}/execute',
            headers=self.headers
        )
        response.raise_for_status()
        
        result = response.json()
        execution_id = result['data']['execution_id']
        
        # Poll for completion
        while True:
            status_response = requests.get(
                f'{self.base_url}/api/deployment-actions/{deployment_id}/executions/{execution_id}',
                headers=self.headers
            )
            status_response.raise_for_status()
            
            status_data = status_response.json()['data']
            
            if status_data['status'] != 'running':
                return status_data
            
            time.sleep(2)
    
    def get_execution_history(self, deployment_id, limit=10):
        """Get execution history for deployment action"""
        params = {'limit': limit}
        
        response = requests.get(
            f'{self.base_url}/api/deployment-actions/{deployment_id}/history',
            headers=self.headers,
            params=params
        )
        response.raise_for_status()
        return response.json()['data']

# Usage example
deployment_manager = DeploymentManager('https://cert-manager.example.com', 'your-token')

# Create Docker deployment
deployment = deployment_manager.create_docker_deployment('cert_001', 'web-server')
print(f"Created deployment: {deployment['id']}")

# Test the deployment
test_result = deployment_manager.test_deployment(deployment['id'])
print(f"Test result: {test_result['status']}")

# Execute the deployment if test passed
if test_result['status'] == 'success':
    execution_result = deployment_manager.execute_deployment(deployment['id'])
    print(f"Execution completed: {execution_result['status']}")
```

### React Component

```jsx
import React, { useState, useEffect } from 'react';

const DeploymentManager = ({ certificateId }) => {
  const [deployments, setDeployments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedDeployment, setSelectedDeployment] = useState(null);
  const [executionStatus, setExecutionStatus] = useState({});

  useEffect(() => {
    loadDeployments();
  }, [certificateId]);

  const loadDeployments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/deployment-actions?certificate_id=${certificateId}`);
      const data = await response.json();
      setDeployments(data.data);
    } catch (error) {
      console.error('Failed to load deployments:', error);
    } finally {
      setLoading(false);
    }
  };

  const testDeployment = async (deploymentId) => {
    try {
      setExecutionStatus(prev => ({ ...prev, [deploymentId]: 'testing' }));
      
      const response = await fetch(`/api/deployment-actions/${deploymentId}/test`, {
        method: 'POST'
      });
      const result = await response.json();
      
      setExecutionStatus(prev => ({ ...prev, [deploymentId]: result.data.status }));
      
      // Clear status after 3 seconds
      setTimeout(() => {
        setExecutionStatus(prev => ({ ...prev, [deploymentId]: null }));
      }, 3000);
    } catch (error) {
      setExecutionStatus(prev => ({ ...prev, [deploymentId]: 'error' }));
    }
  };

  const executeDeployment = async (deploymentId) => {
    try {
      setExecutionStatus(prev => ({ ...prev, [deploymentId]: 'executing' }));
      
      const response = await fetch(`/api/deployment-actions/${deploymentId}/execute`, {
        method: 'POST'
      });
      const result = await response.json();
      
      // Poll for completion
      pollExecutionStatus(deploymentId, result.data.execution_id);
    } catch (error) {
      setExecutionStatus(prev => ({ ...prev, [deploymentId]: 'error' }));
    }
  };

  const pollExecutionStatus = async (deploymentId, executionId) => {
    while (true) {
      try {
        const response = await fetch(`/api/deployment-actions/${deploymentId}/executions/${executionId}`);
        const result = await response.json();
        
        if (result.data.status !== 'running') {
          setExecutionStatus(prev => ({ ...prev, [deploymentId]: result.data.status }));
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        setExecutionStatus(prev => ({ ...prev, [deploymentId]: 'error' }));
        break;
      }
    }
  };

  const toggleDeployment = async (deploymentId) => {
    try {
      await fetch(`/api/deployment-actions/${deploymentId}/toggle`, {
        method: 'POST'
      });
      loadDeployments(); // Reload to get updated status
    } catch (error) {
      console.error('Failed to toggle deployment:', error);
    }
  };

  if (loading) {
    return <div className="text-center">Loading deployments...</div>;
  }

  return (
    <div className="deployment-manager">
      <h3>Deployment Actions</h3>
      
      {deployments.length === 0 ? (
        <p>No deployment actions configured for this certificate.</p>
      ) : (
        <div className="deployment-list">
          {deployments.map(deployment => (
            <div key={deployment.id} className="deployment-item border rounded p-3 mb-3">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <h5>{deployment.name}</h5>
                  <p className="text-muted">{deployment.description}</p>
                  <small>
                    Type: {deployment.type} | 
                    Order: {deployment.order} | 
                    Status: {deployment.enabled ? 'Enabled' : 'Disabled'}
                  </small>
                </div>
                
                <div className="deployment-controls">
                  <button
                    className="btn btn-sm btn-outline-primary me-2"
                    onClick={() => testDeployment(deployment.id)}
                    disabled={executionStatus[deployment.id] === 'testing'}
                  >
                    {executionStatus[deployment.id] === 'testing' ? 'Testing...' : 'Test'}
                  </button>
                  
                  <button
                    className="btn btn-sm btn-primary me-2"
                    onClick={() => executeDeployment(deployment.id)}
                    disabled={!deployment.enabled || executionStatus[deployment.id] === 'executing'}
                  >
                    {executionStatus[deployment.id] === 'executing' ? 'Executing...' : 'Execute'}
                  </button>
                  
                  <button
                    className={`btn btn-sm ${deployment.enabled ? 'btn-warning' : 'btn-success'}`}
                    onClick={() => toggleDeployment(deployment.id)}
                  >
                    {deployment.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
              
              {executionStatus[deployment.id] && (
                <div className="mt-2">
                  <span className={`badge ${
                    executionStatus[deployment.id] === 'success' ? 'bg-success' :
                    executionStatus[deployment.id] === 'failed' ? 'bg-danger' :
                    executionStatus[deployment.id] === 'error' ? 'bg-danger' :
                    'bg-warning'
                  }`}>
                    {executionStatus[deployment.id]}
                  </span>
                </div>
              )}
              
              {deployment.last_execution && (
                <div className="mt-2">
                  <small className="text-muted">
                    Last execution: {new Date(deployment.last_execution.timestamp).toLocaleString()} - 
                    <span className={`ms-1 ${
                      deployment.last_execution.status === 'success' ? 'text-success' : 'text-danger'
                    }`}>
                      {deployment.last_execution.status}
                    </span>
                  </small>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DeploymentManager;
```

## Error Handling

Common error responses:

### Deployment Not Found
```json
{
  "success": false,
  "error": "Deployment action not found",
  "code": "DEPLOYMENT_NOT_FOUND"
}
```

### Invalid Configuration
```json
{
  "success": false,
  "error": "Invalid deployment configuration",
  "code": "INVALID_CONFIG",
  "details": {
    "field": "host",
    "message": "Host is required for SSH deployments"
  }
}
```

### Execution Failed
```json
{
  "success": false,
  "error": "Deployment execution failed",
  "code": "EXECUTION_FAILED",
  "details": {
    "output": "SSH connection timeout",
    "error": "Connection to host timed out after 30 seconds"
  }
}
```

## Security Considerations

1. **SSH Keys**: Store SSH private keys securely and use key-based authentication
2. **Webhooks**: Use HTTPS and authenticate webhook endpoints
3. **Docker**: Secure access to Docker socket and use least-privilege containers
4. **Scripts**: Validate custom scripts and run with minimal permissions
5. **Credentials**: Never log sensitive credentials in deployment outputs
6. **Network**: Restrict network access for deployment targets
7. **Validation**: Always test deployments before enabling automatic execution

## Best Practices

1. **Testing**: Always test deployment actions before enabling them
2. **Ordering**: Configure deployment order for dependencies (e.g., copy files before restarting services)
3. **Monitoring**: Monitor execution history and set up alerts for failures
4. **Rollback**: Have rollback procedures for failed deployments
5. **Documentation**: Document deployment configurations and requirements
6. **Validation**: Validate deployment success with health checks
7. **Logging**: Enable detailed logging for troubleshooting