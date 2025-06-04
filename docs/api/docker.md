# Docker API Documentation

The Docker API provides endpoints for managing Docker containers and checking Docker service availability. These endpoints allow you to list containers, restart containers, and check Docker integration status.

## Base URL

All Docker API endpoints are prefixed with `/api/docker`

## Authentication

All Docker API endpoints require authentication. Include your session token in the request headers.

## Endpoints

### 1. List Docker Containers

Retrieves a list of all available Docker containers.

**Endpoint:** `GET /api/docker/containers`

**Authentication:** Required

**Parameters:** None

**Response:**

```json
{
  "dockerAvailable": true,
  "containers": [
    {
      "id": "1234567890abcdef1234567890abcdef12345678",
      "shortId": "1234567890ab",
      "name": "my-app",
      "image": "nginx:latest",
      "status": "running",
      "created": 1640995200
    },
    {
      "id": "abcdef1234567890abcdef1234567890abcdef12",
      "shortId": "abcdef123456",
      "name": "database",
      "image": "postgres:13",
      "status": "running",
      "created": 1640995100
    }
  ]
}
```

**Response Fields:**

- `dockerAvailable` (boolean): Whether Docker service is available
- `containers` (array): List of Docker containers
  - `id` (string): Full container ID
  - `shortId` (string): Shortened container ID (first 12 characters)
  - `name` (string): Container name (without leading slash)
  - `image` (string): Docker image name and tag
  - `status` (string): Container status (running, stopped, etc.)
  - `created` (number): Container creation timestamp

**Error Responses:**

- `503 Service Unavailable` - Docker service is not available
- `500 Internal Server Error` - Failed to fetch containers
- `401 Unauthorized` - Authentication required

**Example Usage:**

```javascript
// JavaScript/Node.js
const response = await fetch('/api/docker/containers', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'Cookie': 'sessionToken=your-session-token'
  }
});

if (response.ok) {
  const data = await response.json();
  console.log('Docker containers:', data.containers);
} else {
  console.error('Failed to fetch containers:', response.statusText);
}
```

```javascript
// React Hook
import { useState, useEffect } from 'react';

function useDockerContainers() {
  const [containers, setContainers] = useState([]);
  const [dockerAvailable, setDockerAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchContainers = async () => {
      try {
        const response = await fetch('/api/docker/containers');
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        setContainers(data.containers);
        setDockerAvailable(data.dockerAvailable);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchContainers();
  }, []);

  return { containers, dockerAvailable, loading, error };
}
```

### 2. Restart Docker Container

Restarts a specific Docker container by ID.

**Endpoint:** `POST /api/docker/containers/:id/restart`

**Authentication:** Required

**Parameters:**

- `id` (path parameter): Container ID (can be full ID or short ID)

**Request Body:** None

**Response:**

```json
{
  "success": true,
  "message": "Container 1234567890ab restarted successfully"
}
```

**Response Fields:**

- `success` (boolean): Whether the restart was successful
- `message` (string): Success message with container ID

**Error Responses:**

- `503 Service Unavailable` - Docker service is not available
- `500 Internal Server Error` - Failed to restart container
- `404 Not Found` - Container not found
- `401 Unauthorized` - Authentication required

**Example Usage:**

```javascript
// JavaScript/Node.js
async function restartContainer(containerId) {
  try {
    const response = await fetch(`/api/docker/containers/${containerId}/restart`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'sessionToken=your-session-token'
      }
    });

    if (response.ok) {
      const data = await response.json();
      console.log('Container restarted:', data.message);
      return data;
    } else {
      throw new Error(`Failed to restart container: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Error restarting container:', error);
    throw error;
  }
}

// Usage
restartContainer('1234567890ab')
  .then(result => console.log('Success:', result))
  .catch(error => console.error('Error:', error));
```

```javascript
// React Component
import { useState } from 'react';

function ContainerRestartButton({ containerId, containerName }) {
  const [isRestarting, setIsRestarting] = useState(false);
  const [message, setMessage] = useState('');

  const handleRestart = async () => {
    setIsRestarting(true);
    setMessage('');

    try {
      const response = await fetch(`/api/docker/containers/${containerId}/restart`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMessage(`✓ ${data.message}`);
      } else {
        const errorData = await response.json();
        setMessage(`✗ ${errorData.error}`);
      }
    } catch (error) {
      setMessage(`✗ Failed to restart container: ${error.message}`);
    } finally {
      setIsRestarting(false);
    }
  };

  return (
    <div>
      <button 
        onClick={handleRestart} 
        disabled={isRestarting}
        className="btn btn-warning"
      >
        {isRestarting ? 'Restarting...' : `Restart ${containerName}`}
      </button>
      {message && <div className="mt-2">{message}</div>}
    </div>
  );
}
```

## Docker Service Integration

The Docker API integrates with the Docker daemon through the following mechanisms:

### Platform-Specific Socket Paths

- **Windows:** `//./pipe/docker_engine`
- **Linux/macOS:** `/var/run/docker.sock`
- **Fallback:** Environment variables

### Service Availability

The Docker service automatically detects Docker availability during initialization:

- Checks for platform-specific socket paths
- Falls back to environment-based configuration
- Tests connection with Docker daemon
- Sets `dockerAvailable` flag accordingly

### Container Information

The API provides simplified container information including:

- Container identification (full and short IDs)
- Human-readable names (cleaned of Docker prefixes)
- Image information
- Current status
- Creation timestamps

## Error Handling

All Docker API endpoints implement comprehensive error handling:

### Service Unavailable (503)

```json
{
  "error": "Docker service is not available",
  "dockerAvailable": false
}
```

### Internal Server Error (500)

```json
{
  "error": "Failed to fetch Docker containers: connection refused",
  "dockerAvailable": true
}
```

### Authentication Error (401)

```json
{
  "error": "Authentication required"
}
```

## Best Practices

### Error Handling

Always check the `dockerAvailable` flag before attempting Docker operations:

```javascript
async function safeDockerOperation() {
  const response = await fetch('/api/docker/containers');
  const data = await response.json();
  
  if (!data.dockerAvailable) {
    console.warn('Docker is not available');
    return { available: false, containers: [] };
  }
  
  return { available: true, containers: data.containers };
}
```

### Container Identification

Use short IDs for user display but keep full IDs for API operations:

```javascript
function ContainerList({ containers }) {
  return (
    <ul>
      {containers.map(container => (
        <li key={container.id}>
          <span>{container.name} ({container.shortId})</span>
          <button onClick={() => restartContainer(container.id)}>
            Restart
          </button>
        </li>
      ))}
    </ul>
  );
}
```

### Status Monitoring

Implement proper loading and error states for Docker operations:

```javascript
function useDockerStatus() {
  const [status, setStatus] = useState({
    available: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    const checkDockerStatus = async () => {
      try {
        const response = await fetch('/api/docker/containers');
        const data = await response.json();
        
        setStatus({
          available: data.dockerAvailable,
          loading: false,
          error: null
        });
      } catch (error) {
        setStatus({
          available: false,
          loading: false,
          error: error.message
        });
      }
    };

    checkDockerStatus();
  }, []);

  return status;
}
```

## Integration with Deployment Actions

The Docker API is commonly used with deployment actions for container management. See the [Deployment API documentation](./deployment.md) for information on creating Docker-based deployment actions.

Example deployment action configuration:

```json
{
  "name": "Restart Web Server",
  "type": "docker-container",
  "enabled": true,
  "config": {
    "action": "restart",
    "container": "my-web-app"
  }
}
```
