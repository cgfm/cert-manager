# Configuration Guide

This guide covers all configuration options available in the Certificate Manager.

## Table of Contents
- [Configuration Overview](#configuration-overview)
- [Configuration File](#configuration-file)
- [Environment Variables](#environment-variables)
- [General Settings](#general-settings)
- [Security Settings](#security-settings)
- [Auto-Renewal Settings](#auto-renewal-settings)
- [Deployment Settings](#deployment-settings)
- [Logging Configuration](#logging-configuration)
- [Advanced Configuration](#advanced-configuration)

## Configuration Overview

The Certificate Manager uses multiple configuration sources in order of precedence:

1. **Environment Variables** (highest priority)
2. **Configuration File** (`config.json`)
3. **Default Values** (lowest priority)

Configuration can be managed through:
- The web interface (Settings tab)
- Direct editing of `config.json`
- Environment variables
- Command-line arguments

## Configuration File

The main configuration file is `config.json` located in the application root directory.

### Default Configuration

```json
{
  "port": 3000,
  "certsDir": "./data/certificates",
  "logLevel": "info",
  "openSSLPath": "/usr/bin/openssl",
  "signStandardCertsWithCA": false,
  "autoRenewByDefault": false,
  "enableHttps": false,
  "httpsPort": 3443,
  "httpsCertPath": "",
  "httpsKeyPath": "",
  "enableAutoRenewalJob": true,
  "renewalSchedule": "0 0 * * *",
  "renewDaysBeforeExpiry": 30,
  "enableFileWatch": true,
  "includeIdleDomainsOnRenewal": false,
  "enableCertificateBackups": true,
  "keepBackupsForever": false,
  "backupRetention": 90,
  "caValidityPeriod": {
    "rootCA": 3650,
    "intermediateCA": 1825,
    "standard": 90
  },
  "security": {
    "disableAuth": false,
    "authMode": "basic",
    "tokenExpiration": "8h"
  },
  "deployment": {
    "email": {
      "smtp": {
        "host": "",
        "port": 587,
        "secure": false,
        "user": "",
        "password": "",
        "from": ""
      }
    },
    "nginxProxyManager": {
      "host": "",
      "port": 81,
      "useHttps": false,
      "username": "",
      "password": "",
      "rejectUnauthorized": true
    },
    "dockerDefaults": {
      "socketPath": "/var/run/docker.sock"
    }
  }
}
```

## Environment Variables

Environment variables override configuration file settings.

### Server Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Node.js environment | `development` |
| `CERTS_DIR` | Certificate storage directory | `./data/certificates` |
| `OPENSSL_PATH` | Path to OpenSSL binary | `/usr/bin/openssl` |

### Security Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `DISABLE_AUTH` | Disable authentication (not recommended) | `false` |
| `SECRET_KEY` | Secret key for encryption | Auto-generated |
| `TOKEN_EXPIRATION` | API token expiration time | `8h` |
| `ENABLE_HTTPS` | Enable HTTPS for web interface | `false` |
| `HTTPS_PORT` | HTTPS port | `3443` |
| `HTTPS_CERT_PATH` | Path to HTTPS certificate | - |
| `HTTPS_KEY_PATH` | Path to HTTPS private key | - |

### Auto-Renewal Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_AUTO_RENEWAL` | Enable auto-renewal job | `true` |
| `RENEWAL_SCHEDULE` | Cron schedule for renewals | `0 0 * * *` |
| `RENEW_DAYS_BEFORE_EXPIRY` | Days before expiry to renew | `30` |
| `ENABLE_FILE_WATCH` | Watch for external file changes | `true` |

### Logging Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `LOG_LEVEL` | Default log level | `info` |
| `LOG_DIR` | Log file directory | `./data/logs` |

## General Settings

### Server Configuration

```json
{
  "port": 3000,
  "certsDir": "./data/certificates",
  "openSSLPath": "/usr/bin/openssl",
  "logLevel": "info"
}
```

**Options:**
- **port**: HTTP server port (1-65535)
- **certsDir**: Directory where certificates are stored
- **openSSLPath**: Path to OpenSSL executable
- **logLevel**: Logging level (`error`, `warn`, `info`, `debug`, `fine`, `finest`)

### Certificate Defaults

```json
{
  "signStandardCertsWithCA": false,
  "autoRenewByDefault": false,
  "caValidityPeriod": {
    "rootCA": 3650,
    "intermediateCA": 1825,
    "standard": 90
  }
}
```

**Options:**
- **signStandardCertsWithCA**: Sign new certificates with CA by default
- **autoRenewByDefault**: Enable auto-renewal for new certificates
- **caValidityPeriod**: Default validity periods in days for different certificate types

## Security Settings

### Authentication Configuration

```json
{
  "security": {
    "disableAuth": false,
    "authMode": "basic",
    "tokenExpiration": "8h"
  }
}
```

**Options:**
- **disableAuth**: Disable authentication (⚠️ **Not recommended for production**)
- **authMode**: Authentication method (`basic`)
- **tokenExpiration**: API token expiration (e.g., `8h`, `30d`, `1y`)

### HTTPS Configuration

```json
{
  "enableHttps": true,
  "httpsPort": 3443,
  "httpsCertPath": "/path/to/cert.pem",
  "httpsKeyPath": "/path/to/key.pem"
}
```

**Options:**
- **enableHttps**: Enable HTTPS for the web interface
- **httpsPort**: HTTPS server port
- **httpsCertPath**: Path to SSL certificate file
- **httpsKeyPath**: Path to SSL private key file

### Security Best Practices

1. **Always use HTTPS in production**
2. **Use strong passwords** for user accounts
3. **Regularly rotate API tokens**
4. **Keep the application updated**
5. **Secure file permissions** on certificate directories
6. **Use firewall rules** to restrict access

## Auto-Renewal Settings

### Basic Renewal Configuration

```json
{
  "enableAutoRenewalJob": true,
  "renewalSchedule": "0 0 * * *",
  "renewDaysBeforeExpiry": 30,
  "enableFileWatch": true,
  "includeIdleDomainsOnRenewal": false
}
```

**Options:**
- **enableAutoRenewalJob**: Enable the automatic renewal cron job
- **renewalSchedule**: Cron expression for renewal timing
- **renewDaysBeforeExpiry**: Days before expiry to attempt renewal
- **enableFileWatch**: Monitor external file changes
- **includeIdleDomainsOnRenewal**: Include idle domains/IPs in renewals

### Cron Schedule Examples

| Schedule | Description |
|----------|-------------|
| `0 0 * * *` | Daily at midnight |
| `0 2 * * *` | Daily at 2 AM |
| `0 0 */7 * *` | Every 7 days at midnight |
| `0 0 1 * *` | Monthly on the 1st at midnight |
| `0 */6 * * *` | Every 6 hours |

### Backup Settings

```json
{
  "enableCertificateBackups": true,
  "keepBackupsForever": false,
  "backupRetention": 90
}
```

**Options:**
- **enableCertificateBackups**: Create backups when certificates are renewed
- **keepBackupsForever**: Never delete old backups
- **backupRetention**: Days to keep backups (if not keeping forever)

## Deployment Settings

### Email/SMTP Configuration

```json
{
  "deployment": {
    "email": {
      "smtp": {
        "host": "smtp.gmail.com",
        "port": 587,
        "secure": false,
        "user": "your-email@gmail.com",
        "password": "your-app-password",
        "from": "Certificate Manager <cert-manager@yourdomain.com>"
      }
    }
  }
}
```

**Common SMTP Providers:**

| Provider | Host | Port | Secure |
|----------|------|------|--------|
| Gmail | `smtp.gmail.com` | 587 | false |
| Outlook | `smtp-mail.outlook.com` | 587 | false |
| Yahoo | `smtp.mail.yahoo.com` | 587 | false |
| SendGrid | `smtp.sendgrid.net` | 587 | false |

### Nginx Proxy Manager Integration

```json
{
  "deployment": {
    "nginxProxyManager": {
      "host": "npm.yourdomain.com",
      "port": 81,
      "useHttps": false,
      "username": "admin@example.com",
      "password": "your-password",
      "rejectUnauthorized": true
    }
  }
}
```

**Options:**
- **host**: NPM hostname or IP address
- **port**: NPM management port
- **useHttps**: Use HTTPS for NPM API calls
- **username**: NPM admin username
- **password**: NPM admin password
- **rejectUnauthorized**: Verify SSL certificates

### Docker Integration

```json
{
  "deployment": {
    "dockerDefaults": {
      "socketPath": "/var/run/docker.sock",
      "host": "tcp://docker-host:2376",
      "port": 2376
    }
  }
}
```

**Options:**
- **socketPath**: Docker socket path (Unix systems)
- **host**: Docker daemon host (TCP connection)
- **port**: Docker daemon port

## Logging Configuration

### Log Levels

| Level | Description | Use Case |
|-------|-------------|----------|
| `error` | Error messages only | Production (minimal logging) |
| `warn` | Errors and warnings | Production |
| `info` | General information | Production (recommended) |
| `debug` | Detailed debugging | Development/troubleshooting |
| `fine` | Very detailed debugging | Deep troubleshooting |
| `finest` | Maximum verbosity | Development only |

### File-Specific Log Levels

You can set different log levels for specific files:

```json
{
  "logLevel": "info",
  "fileLogLevels": {
    "api/routes/certificates.js": "debug",
    "services/certificateManager.js": "fine",
    "services/renewalService.js": "debug"
  }
}
```

### Log File Management

Logs are automatically rotated and managed:
- **Location**: `data/logs/`
- **Rotation**: Daily or when files exceed 10MB
- **Retention**: 30 days by default
- **Format**: JSON format for structured logging

## Advanced Configuration

### Certificate Storage Structure

```
data/certificates/
├── fingerprint1/
│   ├── cert.pem
│   ├── key.pem
│   ├── fullchain.pem
│   └── config.json
├── fingerprint2/
│   └── ...
└── backups/
    ├── fingerprint1_2024-01-01.tar.gz
    └── ...
```

### Performance Tuning

```json
{
  "maxConcurrentRenewals": 5,
  "renewalTimeout": 300000,
  "fileWatchDebounce": 5000,
  "certificateCacheSize": 1000
}
```

### Development Configuration

For development environments:

```json
{
  "logLevel": "debug",
  "enableAutoRenewalJob": false,
  "security": {
    "disableAuth": true
  },
  "development": {
    "enableMockMode": true,
    "skipCertificateValidation": true
  }
}
```

## Configuration Validation

The application validates configuration on startup:

- **Required fields**: Port, certificate directory, OpenSSL path
- **Valid ranges**: Port numbers, validity periods
- **File existence**: OpenSSL binary, certificate paths
- **Permissions**: Directory write access

### Common Validation Errors

| Error | Cause | Solution |
|-------|-------|----------|
| Invalid port number | Port outside 1-65535 range | Use valid port number |
| OpenSSL not found | Incorrect OpenSSL path | Update path or install OpenSSL |
| Permission denied | No write access to certificate directory | Fix directory permissions |
| Invalid cron schedule | Malformed cron expression | Use valid cron syntax |

## Configuration Migration

When upgrading, configuration is automatically migrated:

1. **Backup**: Current config is backed up
2. **Merge**: New default values are added
3. **Validate**: Configuration is validated
4. **Apply**: New configuration takes effect

### Manual Migration

If automatic migration fails:

```bash
# Backup current config
cp config.json config.json.backup

# Reset to defaults (will recreate on next start)
rm config.json

# Start application and reconfigure through web interface
npm start
```

## Environment-Specific Configurations

### Production Configuration

```json
{
  "logLevel": "info",
  "enableHttps": true,
  "security": {
    "disableAuth": false,
    "tokenExpiration": "8h"
  },
  "enableAutoRenewalJob": true,
  "enableCertificateBackups": true
}
```

### Development Configuration

```json
{
  "logLevel": "debug",
  "enableHttps": false,
  "security": {
    "disableAuth": true
  },
  "enableAutoRenewalJob": false
}
```

### Testing Configuration

```json
{
  "logLevel": "error",
  "enableAutoRenewalJob": false,
  "enableFileWatch": false,
  "enableCertificateBackups": false
}
```

---

**Note**: Always restart the Certificate Manager service after making configuration changes to ensure they take effect.