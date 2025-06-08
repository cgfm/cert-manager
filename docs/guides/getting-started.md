# Getting Started with Certificate Manager

Welcome to the Certificate Manager! This guide will help you get up and running with automated SSL certificate management, from initial setup to your first certificate deployment.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Initial Setup](#initial-setup)
4. [First Certificate Creation](#first-certificate-creation)
5. [Basic Configuration](#basic-configuration)
6. [Next Steps](#next-steps)

## Overview

Certificate Manager is a comprehensive solution for automating SSL certificate generation, renewal, and deployment. It provides:

- **Automated Certificate Generation**: Create SSL certificates using OpenSSL
- **Flexible Deployment Options**: Deploy certificates via SSH, Docker, NPM, SMB, FTP, and API calls
- **Auto-Renewal System**: Automatically renew certificates before expiration
- **Web-Based Management**: Intuitive dashboard for managing all certificates
- **Multiple Integrations**: Support for various platforms and services

## Prerequisites

Before getting started, ensure you have:

### System Requirements
- Node.js (version 14 or higher)
- NPM or Yarn package manager
- OpenSSL installed on your system
- Administrative privileges for certificate operations

### Network Access
- Access to target servers for deployment
- Firewall rules allowing necessary ports for deployment (if applicable)

### Domain Control
- Domain ownership for creating valid certificates
- Access to web servers for certificate deployment
- Administrative access to target deployment systems

## Initial Setup

### 1. Installation

Follow the [installation guide](../installation.md) to install Certificate Manager on your system.

### 2. First Launch

1. Start the Certificate Manager service:
   ```bash
   npm start
   ```

2. Access the web interface at `http://localhost:3000`

3. Complete the initial setup wizard

### 3. Initial Configuration

Configure basic settings through the web interface:

#### General Settings
- **Application Name**: Set a custom name for your Certificate Manager instance
- **Admin Email**: Primary contact email for notifications
- **Default Certificate Path**: Where certificates will be stored
- **Backup Settings**: Configure automatic backups

#### Security Settings
- **API Authentication**: Enable API key authentication
- **HTTPS Mode**: Configure secure connections
- **Access Control**: Set up user permissions

## First Certificate Creation

Let's create your first SSL certificate to familiarize yourself with the process.

### Step 1: Access Certificate Management

1. Navigate to the **Certificates** section in the dashboard
2. Click **Create New Certificate**

### Step 2: Certificate Configuration

Fill in the basic certificate information:

```javascript
// Example certificate configuration
{
  "commonName": "example.com",
  "subjectAltNames": ["www.example.com", "api.example.com"],
  "organization": "Your Organization",
  "organizationalUnit": "IT Department",
  "locality": "Your City",
  "state": "Your State",
  "country": "US",
  "keySize": 2048,
  "validityDays": 365
}
```

### Step 3: Certificate Generation

The Certificate Manager will create your certificate using OpenSSL:

#### Self-Signed Certificates
- Generated locally using OpenSSL
- No external validation required
- Suitable for internal/development use

#### CA-Signed Certificates
- Signed by your own Certificate Authority
- Maintains trust chain
- Best for internal infrastructure

### Step 4: Generate Certificate

1. Review your configuration
2. Click **Generate Certificate**
3. Monitor the generation progress
4. Download or deploy the certificate

## Basic Configuration

### Certificate Storage

Configure where certificates are stored:

```javascript
// Storage configuration
{
  "certificatePath": "/etc/ssl/certs/",
  "privateKeyPath": "/etc/ssl/private/",
  "backupPath": "/var/backups/ssl/",
  "permissions": {
    "certificate": "644",
    "privateKey": "600"
  }
}
```

### Notification Settings

Set up notifications for certificate events:

```javascript
// Notification configuration
{
  "email": {
    "enabled": true,
    "recipients": ["admin@example.com"],
    "events": ["renewal", "expiry", "failure"]
  },
  "webhook": {
    "enabled": false,
    "url": "https://your-webhook.com/certificate-events"
  }
}
```

### Auto-Renewal Configuration

Enable automatic certificate renewal:

```javascript
// Auto-renewal settings
{
  "enabled": true,
  "checkInterval": "daily",
  "renewalThreshold": 30, // days before expiry
  "retryAttempts": 3,
  "retryInterval": "1h"
}
```

## Next Steps

Now that you have Certificate Manager set up and your first certificate created, here are your next steps:

### 1. Set Up Auto-Renewal
- Read the [Auto-Renewal Guide](./auto-renewal.md)
- Configure renewal policies
- Test renewal processes

### 2. Configure Deployment Actions
- Explore the [Deployment Actions Guide](./deployment-actions.md)
- Set up automated deployment
- Configure target systems

### 3. Advanced SSL Setup
- Review the [SSL Setup Guide](./ssl-setup.md)
- Implement advanced configurations
- Optimize security settings

### 4. Integration Setup
- Configure external integrations
- Set up monitoring and alerting
- Implement backup strategies

## Common First-Time Issues

### Certificate Generation Fails
**Problem**: Certificate generation process fails
**Solutions**:
- Check OpenSSL installation
- Verify domain ownership
- Review firewall settings
- Check DNS configuration

### Domain Validation Issues
**Problem**: Domain validation doesn't complete
**Solutions**:
- Ensure DNS records are correct
- Check web server accessibility
- Verify domain ownership
- Review validation method choice

### Permission Errors
**Problem**: File permission errors during certificate operations
**Solutions**:
- Run with appropriate privileges
- Check certificate directory permissions
- Verify user account access
- Review system security policies

### Network Connectivity
**Problem**: Cannot connect to validation servers
**Solutions**:
- Check internet connectivity
- Review firewall rules
- Verify proxy settings
- Test direct connections

## Getting Help

If you encounter issues:

1. **Check the Logs**: Review application logs for error details
2. **Documentation**: Consult the comprehensive guides
3. **API Reference**: Use the [API documentation](../api/) for integration
4. **Community**: Engage with the community for support
5. **Issues**: Report bugs through the issue tracker

## Quick Reference

### Essential Commands
```bash
# Start Certificate Manager
npm start

# Run in development mode
npm run dev

# Check certificate status
curl http://localhost:3000/api/certificates

# Generate new certificate
curl -X POST http://localhost:3000/api/certificates \
  -H "Content-Type: application/json" \
  -d '{"commonName": "example.com"}'
```

### Key Configuration Files
- `config/default.json` - Main configuration
- `config/certificates.json` - Certificate settings
- `config/deployments.json` - Deployment configurations
- `logs/application.log` - Application logs

### Important Directories
- `/certificates/` - Generated certificates
- `/private/` - Private keys
- `/backups/` - Certificate backups
- `/logs/` - Application logs

---

**Next**: Continue with the [SSL Setup Guide](./ssl-setup.md) to learn advanced certificate configuration options.