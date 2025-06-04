# Deployment Actions Guide

This comprehensive guide covers all available deployment actions for automatically distributing SSL certificates to your infrastructure after generation or renewal.

## Table of Contents

1. [Overview](#overview)
2. [Deployment Action Types](#deployment-action-types)
3. [SSH Deployment](#ssh-deployment)
4. [Docker Deployment](#docker-deployment)
5. [NPM Integration](#npm-integration)
6. [SMB/CIFS Deployment](#smbcifs-deployment)
7. [FTP/SFTP Deployment](#ftpsftp-deployment)
8. [API Deployment](#api-deployment)
9. [Advanced Configuration](#advanced-configuration)
10. [Monitoring and Troubleshooting](#monitoring-and-troubleshooting)

## Overview

Deployment Actions automate the process of distributing SSL certificates to your infrastructure components after successful generation or renewal. This ensures certificates are immediately available where needed without manual intervention.

### Key Features
- **Multiple Deployment Methods**: SSH, Docker, NPM, SMB, FTP, API calls
- **Batch Deployment**: Deploy to multiple targets simultaneously
- **Verification and Testing**: Automatic deployment verification
- **Rollback Capability**: Automatic rollback on deployment failures
- **Dependency Management**: Handle deployment dependencies and ordering

## Deployment Action Types

### Available Action Types

Certificate Manager supports the following deployment action types:

1. **SSH**: Deploy via SSH to remote servers
2. **Docker**: Update Docker containers and services
3. **NPM**: Integrate with Node Package Manager registries
4. **SMB/CIFS**: Deploy to Windows file shares
5. **FTP/SFTP**: Deploy via file transfer protocols
6. **API**: Deploy via HTTP/REST API calls
7. **Local**: Deploy to local file system
8. **Custom**: Execute custom scripts and commands

### Action Configuration Structure

Basic deployment action structure:

```javascript
// Basic deployment action
{
  "id": "web-server-deployment",
  "name": "Web Server Certificate Deployment",
  "type": "ssh",
  "enabled": true,
  "priority": 1,
  "certificates": ["example.com", "*.example.com"],
  "configuration": {
    // Type-specific configuration
  },
  "verification": {
    "enabled": true,
    "method": "http_check"
  },
  "rollback": {
    "enabled": true,
    "strategy": "restore_backup"
  }
}
```

## SSH Deployment

Deploy certificates to remote servers via SSH:

### Basic SSH Configuration

```javascript
// SSH deployment configuration
{
  "type": "ssh",
  "configuration": {
    "connection": {
      "host": "web-server.example.com",
      "port": 22,
      "username": "deploy-user",
      "authentication": {
        "method": "key", // "password", "key", "agent"
        "privateKeyPath": "/home/user/.ssh/deploy_key",
        "passphrase": "optional-key-passphrase"
      },
      "options": {
        "strictHostKeyChecking": false,
        "connectTimeout": 30000,
        "keepAlive": true
      }
    },
    "deployment": {
      "certificatePath": "/etc/ssl/certs/",
      "privateKeyPath": "/etc/ssl/private/",
      "backupPath": "/etc/ssl/backup/",
      "permissions": {
        "certificate": "644",
        "privateKey": "600",
        "directory": "755"
      },
      "ownership": {
        "user": "www-data",
        "group": "www-data"
      }
    },
    "commands": {
      "preDeployment": [
        "sudo systemctl stop nginx",
        "sudo mkdir -p /etc/ssl/backup"
      ],
      "postDeployment": [
        "sudo nginx -t",
        "sudo systemctl start nginx",
        "sudo systemctl status nginx"
      ],
      "verification": [
        "curl -I https://example.com"
      ]
    }
  }
}
```

### Multi-Server SSH Deployment

Deploy to multiple servers simultaneously:

```javascript
// Multi-server SSH deployment
{
  "type": "ssh_batch",
  "configuration": {
    "servers": [
      {
        "name": "web-01",
        "host": "web-01.example.com",
        "username": "deploy",
        "privateKeyPath": "/keys/web-01.key"
      },
      {
        "name": "web-02", 
        "host": "web-02.example.com",
        "username": "deploy",
        "privateKeyPath": "/keys/web-02.key"
      },
      {
        "name": "load-balancer",
        "host": "lb.example.com",
        "username": "admin",
        "privateKeyPath": "/keys/lb.key"
      }
    ],
    "parallelDeployment": {
      "enabled": true,
      "maxConcurrent": 3,
      "failFast": false
    },
    "deployment": {
      "certificatePath": "/etc/ssl/certs/",
      "privateKeyPath": "/etc/ssl/private/",
      "commands": {
        "postDeployment": [
          "sudo systemctl reload nginx"
        ]
      }
    }
  }
}
```

### SSH Jump Host Configuration

Deploy through jump hosts/bastion servers:

```javascript
// SSH jump host deployment
{
  "type": "ssh",
  "configuration": {
    "jumpHost": {
      "enabled": true,
      "host": "bastion.example.com",
      "port": 22,
      "username": "jump-user",
      "privateKeyPath": "/keys/jump.key"
    },
    "target": {
      "host": "internal-server.local",
      "port": 22,
      "username": "deploy-user",
      "privateKeyPath": "/keys/internal.key"
    },
    "tunneling": {
      "localPort": 2222,
      "keepAlive": true,
      "timeout": 60000
    }
  }
}
```

## Docker Deployment

Deploy certificates to Docker containers and services:

### Docker Container Deployment

```javascript
// Docker container deployment
{
  "type": "docker",
  "configuration": {
    "connection": {
      "type": "socket", // "socket", "tcp", "ssh"
      "socketPath": "/var/run/docker.sock",
      "host": "tcp://docker-host:2376",
      "tls": {
        "enabled": true,
        "certPath": "/docker/certs/cert.pem",
        "keyPath": "/docker/certs/key.pem",
        "caPath": "/docker/certs/ca.pem"
      }
    },
    "containers": [
      {
        "name": "nginx-proxy",
        "volumeMounts": [
          {
            "source": "/host/ssl/certs",
            "target": "/etc/nginx/ssl",
            "type": "bind"
          }
        ],
        "restartPolicy": "on-certificate-update",
        "healthCheck": {
          "enabled": true,
          "endpoint": "http://localhost/health"
        }
      }
    ],
    "services": [
      {
        "name": "web-stack",
        "updateStrategy": "rolling",
        "replicas": 3
      }
    ]
  }
}
```

### Docker Compose Integration

```javascript
// Docker Compose deployment
{
  "type": "docker_compose",
  "configuration": {
    "composePath": "/app/docker-compose.yml",
    "projectName": "web-app",
    "services": ["nginx", "api", "frontend"],
    "deployment": {
      "strategy": "recreate", // "recreate", "rolling"
      "volumeMapping": {
        "certificates": "/ssl/certs:/etc/ssl/certs:ro",
        "privateKeys": "/ssl/keys:/etc/ssl/private:ro"
      }
    },
    "commands": {
      "preDeployment": [
        "docker-compose -f /app/docker-compose.yml pull"
      ],
      "deployment": [
        "docker-compose -f /app/docker-compose.yml up -d"
      ],
      "postDeployment": [
        "docker-compose -f /app/docker-compose.yml ps"
      ]
    }
  }
}
```

### Kubernetes Deployment

```javascript
// Kubernetes deployment
{
  "type": "kubernetes",
  "configuration": {
    "cluster": {
      "kubeconfig": "/home/user/.kube/config",
      "context": "production",
      "namespace": "default"
    },
    "secrets": [
      {
        "name": "tls-secret",
        "type": "kubernetes.io/tls",
        "data": {
          "tls.crt": "certificate_content",
          "tls.key": "private_key_content"
        }
      }
    ],
    "ingress": [
      {
        "name": "web-ingress",
        "tlsSecretName": "tls-secret",
        "hosts": ["example.com", "www.example.com"]
      }
    ],
    "rollout": {
      "deployments": ["web-app", "api-server"],
      "strategy": "RollingUpdate"
    }
  }
}
```

## NPM Integration

Deploy certificates for NPM registry and Node.js applications:

### NPM Registry Integration

```javascript
// NPM registry deployment
{
  "type": "npm",
  "configuration": {
    "registry": {
      "url": "https://npm.example.com",
      "authentication": {
        "token": "npm_token_here",
        "scope": "@company"
      }
    },
    "packages": [
      {
        "name": "@company/ssl-certificates",
        "version": "auto", // Auto-increment version
        "files": {
          "certificate": "certs/certificate.crt",
          "privateKey": "certs/private.key",
          "chain": "certs/chain.crt"
        }
      }
    ],
    "publication": {
      "autoPublish": true,
      "versionStrategy": "patch", // "major", "minor", "patch"
      "tags": ["latest", "production"]
    }
  }
}
```

### Node.js Application Deployment

```javascript
// Node.js application deployment
{
  "type": "nodejs",
  "configuration": {
    "applications": [
      {
        "name": "web-api",
        "path": "/app/web-api",
        "certificatePath": "ssl/certificate.crt",
        "privateKeyPath": "ssl/private.key",
        "restart": {
          "method": "pm2", // "pm2", "forever", "systemd", "docker"
          "command": "pm2 restart web-api"
        }
      }
    ],
    "environment": {
      "SSL_CERT_PATH": "/app/ssl/certificate.crt",
      "SSL_KEY_PATH": "/app/ssl/private.key"
    }
  }
}
```

## SMB/CIFS Deployment

Deploy certificates to Windows file shares:

### SMB Share Configuration

```javascript
// SMB/CIFS deployment
{
  "type": "smb",
  "configuration": {
    "connection": {
      "host": "file-server.example.com",
      "share": "certificates$",
      "username": "deploy-user",
      "password": "secure-password",
      "domain": "EXAMPLE",
      "version": "3.0" // SMB version
    },
    "paths": {
      "certificatePath": "/ssl/certs/",
      "privateKeyPath": "/ssl/private/",
      "backupPath": "/ssl/backup/"
    },
    "permissions": {
      "inherit": true,
      "readOnly": false
    },
    "postDeployment": [
      {
        "type": "powershell",
        "script": "Restart-Service -Name 'IIS'"
      }
    ]
  }
}
```

### Windows IIS Integration

```javascript
// IIS deployment
{
  "type": "iis",
  "configuration": {
    "connection": {
      "server": "iis-server.example.com",
      "authentication": {
        "method": "windows", // "windows", "basic"
        "username": "DOMAIN\\deploy-user",
        "password": "secure-password"
      }
    },
    "sites": [
      {
        "name": "Default Web Site",
        "bindings": [
          {
            "protocol": "https",
            "port": 443,
            "hostName": "example.com",
            "certificateStore": "My",
            "certificateHash": "auto" // Auto-calculated from certificate
          }
        ]
      }
    ],
    "certificateStore": {
      "location": "LocalMachine",
      "store": "My",
      "friendlyName": "example.com SSL Certificate"
    }
  }
}
```

## FTP/SFTP Deployment

Deploy certificates via file transfer protocols:

### SFTP Configuration

```javascript
// SFTP deployment
{
  "type": "sftp",
  "configuration": {
    "connection": {
      "host": "ftp.example.com",
      "port": 22,
      "username": "ftp-user",
      "authentication": {
        "method": "key", // "password", "key"
        "privateKeyPath": "/keys/sftp.key",
        "passphrase": "key-passphrase"
      },
      "options": {
        "algorithms": {
          "cipher": ["aes128-ctr", "aes192-ctr", "aes256-ctr"],
          "compress": ["zlib@openssh.com", "zlib", "none"]
        }
      }
    },
    "paths": {
      "remoteCertPath": "/ssl/certs/",
      "remoteKeyPath": "/ssl/private/",
      "backupPath": "/ssl/backup/"
    },
    "transfer": {
      "mode": "binary",
      "preserveTimestamp": true,
      "createDirectories": true,
      "overwrite": true
    }
  }
}
```

### FTP Configuration

```javascript
// FTP deployment
{
  "type": "ftp",
  "configuration": {
    "connection": {
      "host": "ftp.example.com",
      "port": 21,
      "username": "ftp-user",
      "password": "ftp-password",
      "secure": true, // Use FTPS
      "secureOptions": {
        "rejectUnauthorized": false
      }
    },
    "paths": {
      "remotePath": "/httpdocs/ssl/",
      "localPath": "/certificates/"
    },
    "transfer": {
      "passive": true,
      "binary": true,
      "timeout": 30000
    }
  }
}
```

## API Deployment

Deploy certificates via HTTP/REST API calls:

### REST API Configuration

```javascript
// API deployment
{
  "type": "api",
  "configuration": {
    "endpoint": {
      "baseUrl": "https://api.example.com",
      "certificateEndpoint": "/v1/certificates",
      "authentication": {
        "type": "bearer", // "bearer", "basic", "api_key"
        "token": "your-api-token",
        "header": "Authorization"
      }
    },
    "requests": {
      "upload": {
        "method": "POST",
        "endpoint": "/certificates/upload",
        "contentType": "multipart/form-data",
        "payload": {
          "certificate": "file:certificate.crt",
          "privateKey": "file:private.key",
          "domain": "example.com"
        }
      },
      "activate": {
        "method": "PUT",
        "endpoint": "/certificates/{domain}/activate",
        "contentType": "application/json",
        "payload": {
          "active": true
        }
      }
    },
    "verification": {
      "endpoint": "/certificates/{domain}/status",
      "expectedStatus": "active",
      "timeout": 60000
    }
  }
}
```

### Webhook Integration

```javascript
// Webhook deployment
{
  "type": "webhook",
  "configuration": {
    "webhooks": [
      {
        "name": "certificate-updated",
        "url": "https://webhook.example.com/certificate-updated",
        "method": "POST",
        "headers": {
          "Content-Type": "application/json",
          "Authorization": "Bearer webhook-token"
        },
        "payload": {
          "domain": "{certificate.domain}",
          "certificate": "{certificate.content}",
          "privateKey": "{certificate.privateKey}",
          "expiryDate": "{certificate.expiryDate}",
          "timestamp": "{deployment.timestamp}"
        },
        "retry": {
          "attempts": 3,
          "delay": "5s",
          "backoff": "exponential"
        }
      }
    ]
  }
}
```

## Advanced Configuration

### Conditional Deployment

Deploy based on conditions:

```javascript
// Conditional deployment
{
  "type": "ssh",
  "configuration": {
    "conditions": {
      "certificateAge": {
        "operator": "less_than",
        "value": "30d"
      },
      "domainPattern": {
        "operator": "matches",
        "value": "*.example.com"
      },
      "environment": {
        "operator": "equals",
        "value": "production"
      }
    },
    "conditionalActions": {
      "if_new_certificate": [
        "sudo systemctl reload nginx"
      ],
      "if_renewed_certificate": [
        "sudo systemctl restart nginx",
        "sudo systemctl restart apache2"
      ]
    }
  }
}
```

### Deployment Pipelines

Create complex deployment workflows:

```javascript
// Deployment pipeline
{
  "type": "pipeline",
  "configuration": {
    "stages": [
      {
        "name": "validation",
        "type": "validation",
        "parallel": false,
        "actions": [
          {
            "type": "certificate_validation",
            "configuration": {
              "checkExpiry": true,
              "verifyChain": true,
              "testConnectivity": true
            }
          }
        ]
      },
      {
        "name": "staging_deployment",
        "type": "deployment",
        "parallel": true,
        "actions": [
          {
            "type": "ssh",
            "target": "staging-servers",
            "configuration": {
              "servers": ["staging-01", "staging-02"]
            }
          }
        ]
      },
      {
        "name": "staging_verification",
        "type": "verification",
        "parallel": false,
        "actions": [
          {
            "type": "http_check",
            "configuration": {
              "urls": [
                "https://staging.example.com",
                "https://api-staging.example.com"
              ],
              "timeout": 30000
            }
          }
        ]
      },
      {
        "name": "production_deployment",
        "type": "deployment",
        "parallel": false,
        "dependsOn": ["staging_verification"],
        "actions": [
          {
            "type": "ssh",
            "target": "production-servers",
            "configuration": {
              "servers": ["prod-01", "prod-02", "prod-03"]
            }
          }
        ]
      }
    ],
    "rollback": {
      "enabled": true,
      "strategy": "automatic",
      "conditions": ["deployment_failure", "verification_failure"]
    }
  }
}
```

### Template-Based Configuration

Use templates for consistent deployments:

```javascript
// Template-based deployment
{
  "type": "template",
  "template": "nginx_ssl_deployment",
  "variables": {
    "servers": ["web-01", "web-02", "web-03"],
    "certificatePath": "/etc/ssl/certs/",
    "privateKeyPath": "/etc/ssl/private/",
    "serviceName": "nginx",
    "domain": "example.com"
  },
  "templates": {
    "nginx_ssl_deployment": {
      "type": "ssh",
      "configuration": {
        "servers": "{servers}",
        "deployment": {
          "certificatePath": "{certificatePath}",
          "privateKeyPath": "{privateKeyPath}"
        },
        "commands": {
          "postDeployment": [
            "sudo nginx -t",
            "sudo systemctl reload {serviceName}"
          ]
        }
      }
    }
  }
}
```

## Monitoring and Troubleshooting

### Deployment Monitoring

Monitor deployment success and failures:

```javascript
// Monitoring configuration
{
  "monitoring": {
    "enabled": true,
    "metrics": {
      "deploymentSuccess": true,
      "deploymentFailures": true,
      "deploymentDuration": true,
      "verificationResults": true
    },
    "alerting": {
      "channels": ["email", "slack"],
      "conditions": {
        "deployment_failure": {
          "severity": "high",
          "cooldown": "5m"
        },
        "verification_failure": {
          "severity": "medium",
          "cooldown": "15m"
        }
      }
    },
    "dashboards": {
      "realTime": true,
      "historical": true
    }
  }
}
```

### Troubleshooting Configuration

```javascript
// Troubleshooting settings
{
  "troubleshooting": {
    "logging": {
      "level": "debug",
      "components": ["deployment", "verification", "rollback"],
      "output": "/var/log/cert-manager/deployment.log"
    },
    "debugging": {
      "enabled": true,
      "saveArtifacts": true,
      "artifactPath": "/var/log/cert-manager/debug/",
      "retention": "7d"
    },
    "diagnostics": {
      "preDeployment": [
        "connectivity_test",
        "permission_check",
        "disk_space_check"
      ],
      "postDeployment": [
        "service_status_check",
        "certificate_validation",
        "endpoint_verification"
      ]
    }
  }
}
```

### Common Issues and Solutions

#### SSH Connection Issues
```javascript
// SSH troubleshooting
{
  "ssh_troubleshooting": {
    "connection_timeout": {
      "increase_timeout": 60000,
      "enable_keepalive": true,
      "check_firewall": true
    },
    "authentication_failure": {
      "verify_key_permissions": "600",
      "check_authorized_keys": true,
      "test_ssh_agent": true
    },
    "permission_denied": {
      "check_sudo_access": true,
      "verify_file_permissions": true,
      "check_selinux": true
    }
  }
}
```

#### Docker Deployment Issues
```javascript
// Docker troubleshooting
{
  "docker_troubleshooting": {
    "container_not_found": {
      "list_containers": "docker ps -a",
      "check_compose_file": true
    },
    "volume_mount_issues": {
      "verify_host_path": true,
      "check_permissions": true,
      "validate_mount_syntax": true
    },
    "service_restart_failure": {
      "check_health_endpoint": true,
      "review_container_logs": true,
      "verify_port_bindings": true
    }
  }
}
```

### Performance Optimization

```javascript
// Performance optimization
{
  "performance": {
    "parallelDeployment": {
      "enabled": true,
      "maxConcurrent": 10,
      "batchSize": 5
    },
    "caching": {
      "enabled": true,
      "connectionPooling": true,
      "reuseConnections": true
    },
    "compression": {
      "enabled": true,
      "algorithm": "gzip",
      "level": 6
    },
    "resourceLimits": {
      "memory": "512MB",
      "cpu": "50%",
      "networkBandwidth": "100MB/s"
    }
  }
}
```

---

This completes the comprehensive Deployment Actions Guide. Users can now configure automated certificate deployment to any infrastructure component using the detailed configurations and examples provided.