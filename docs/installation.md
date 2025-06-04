# Installation Guide

This guide will walk you through installing and setting up the Certificate Manager on your system.

## Table of Contents
- [System Requirements](#system-requirements)
- [Installation Methods](#installation-methods)
- [Docker Installation](#docker-installation)
- [Manual Installation](#manual-installation)
- [Configuration](#configuration)
- [First Run](#first-run)
- [Troubleshooting](#troubleshooting)

## System Requirements

### Minimum Requirements
- **Operating System**: Windows 10/11, Linux (Ubuntu 18.04+, CentOS 7+), macOS 10.15+
- **Node.js**: Version 16.x or higher
- **Memory**: 512MB RAM minimum, 1GB recommended
- **Storage**: 100MB free disk space minimum
- **Network**: Internet access for certificate operations

### Optional Dependencies
- **OpenSSL**: Required for certificate generation (usually pre-installed on Linux/macOS)
- **Docker**: For containerized deployment and Docker-based deployment actions
- **SSH Client**: For SSH-based deployment actions

## Installation Methods

### Method 1: Docker Installation (Recommended)

Docker installation is the easiest way to get started with Certificate Manager.

#### Prerequisites
- Docker installed and running
- Docker Compose (optional, but recommended)

#### Quick Start with Docker

1. **Pull the Docker image**:
   ```bash
   docker pull your-registry/cert-manager:latest
   ```

2. **Create a data directory**:
   ```bash
   mkdir -p ~/cert-manager-data
   ```

3. **Run the container**:
   ```bash
   docker run -d \
     --name cert-manager \
     -p 3000:3000 \
     -v ~/cert-manager-data:/app/data \
     -v /var/run/docker.sock:/var/run/docker.sock \
     your-registry/cert-manager:latest
   ```

#### Docker Compose Setup

1. **Create a `docker-compose.yml` file**:
   ```yaml
   version: '3.8'
   
   services:
     cert-manager:
       image: your-registry/cert-manager:latest
       container_name: cert-manager
       ports:
         - "3000:3000"
       volumes:
         - ./data:/app/data
         - /var/run/docker.sock:/var/run/docker.sock
       environment:
         - NODE_ENV=production
         - LOG_LEVEL=info
       restart: unless-stopped
   ```

2. **Start the service**:
   ```bash
   docker-compose up -d
   ```

### Method 2: Manual Installation

For advanced users who want more control over the installation.

#### Prerequisites
- Node.js 16.x or higher
- npm or yarn package manager
- Git (for cloning the repository)

#### Step 1: Clone the Repository
```bash
git clone https://github.com/yourusername/cert-manager.git
cd cert-manager
```

#### Step 2: Install Dependencies
```bash
npm install
```

#### Step 3: Build the Application
```bash
npm run build
```

#### Step 4: Create Data Directory
```bash
mkdir -p data/certificates
mkdir -p data/logs
mkdir -p data/backups
```

#### Step 5: Set Permissions (Linux/macOS)
```bash
chmod 755 data
chmod 700 data/certificates
chmod 755 data/logs
chmod 755 data/backups
```

## Configuration

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Server Configuration
PORT=3000
NODE_ENV=production

# Security
SECRET_KEY=your-secret-key-here
DISABLE_AUTH=false

# Logging
LOG_LEVEL=info

# Certificates
CERTS_DIR=./data/certificates
OPENSSL_PATH=/usr/bin/openssl

# Auto-Renewal
ENABLE_AUTO_RENEWAL=true
RENEWAL_SCHEDULE=0 0 * * *
RENEW_DAYS_BEFORE_EXPIRY=30

# HTTPS (Optional)
ENABLE_HTTPS=false
HTTPS_PORT=3443
HTTPS_CERT_PATH=
HTTPS_KEY_PATH=
```

### Configuration File

The application will create a `config.json` file on first run. You can pre-create it:

```json
{
  "port": 3000,
  "certsDir": "./data/certificates",
  "logLevel": "info",
  "openSSLPath": "/usr/bin/openssl",
  "enableAutoRenewalJob": true,
  "renewalSchedule": "0 0 * * *",
  "renewDaysBeforeExpiry": 30,
  "enableFileWatch": true,
  "enableHttps": false,
  "httpsPort": 3443,
  "security": {
    "disableAuth": false,
    "authMode": "basic",
    "tokenExpiration": "8h"
  }
}
```

## First Run

### Docker Installation

1. **Access the web interface**:
   Open your browser and navigate to `http://localhost:3000`

2. **Complete initial setup**:
   - Create an admin user account
   - Configure basic settings
   - Set up certificate storage path

### Manual Installation

1. **Start the application**:
   ```bash
   npm start
   ```

2. **Access the web interface**:
   Open your browser and navigate to `http://localhost:3000`

3. **Complete initial setup**:
   Follow the setup wizard to configure your installation

### Initial Admin User

On first run, you'll be prompted to create an admin user:
- **Username**: Choose a secure username
- **Password**: Use a strong password (minimum 8 characters)
- **Full Name**: Your display name
- **Email**: Your email address (optional)

### Basic Configuration

Configure these essential settings:
1. **Certificate Storage**: Set the path where certificates will be stored
2. **OpenSSL Path**: Verify the correct OpenSSL binary path
3. **Log Level**: Set appropriate logging level (info recommended for production)
4. **Auto-Renewal**: Enable if you want automatic certificate renewal

## Post-Installation Steps

### 1. Verify Installation

Check that all components are working:

```bash
# Check if the service is running
curl http://localhost:3000/api/health

# Expected response:
# {"status":"ok","version":"x.x.x","uptime":"..."}
```

### 2. Create Your First Certificate

1. Navigate to the Certificates tab
2. Click "Create Certificate"
3. Fill in the required information:
   - Name: A friendly name for your certificate
   - Domains: The domain(s) this certificate will secure
   - Type: Standard certificate for most use cases

### 3. Set Up Deployment Actions (Optional)

Configure deployment actions to automatically deploy certificates:
1. Go to a certificate's deployment actions
2. Add actions like file copy, Docker restart, or API calls
3. Test the actions to ensure they work correctly

### 4. Configure Auto-Renewal (Recommended)

1. Go to Settings → Auto-Renewal
2. Enable the auto-renewal job
3. Set the renewal schedule (default: daily at midnight)
4. Set days before expiry to renew (default: 30 days)

## Security Considerations

### File Permissions

Ensure proper file permissions:
```bash
# Certificate directory should be readable only by the application
chmod 700 data/certificates

# Configuration files should be protected
chmod 600 config.json .env
```

### Firewall Configuration

If running on a server, configure your firewall:
```bash
# Ubuntu/Debian with UFW
sudo ufw allow 3000/tcp

# CentOS/RHEL with firewalld
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

### HTTPS Setup (Recommended for Production)

1. Generate or obtain SSL certificates for the web interface
2. Enable HTTPS in configuration:
   ```json
   {
     "enableHttps": true,
     "httpsPort": 3443,
     "httpsCertPath": "/path/to/cert.pem",
     "httpsKeyPath": "/path/to/key.pem"
   }
   ```

## Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Check what's using port 3000
sudo netstat -tulpn | grep :3000

# Or use lsof
sudo lsof -i :3000
```

#### Permission Denied Errors
```bash
# Fix ownership of data directory
sudo chown -R $USER:$USER data/

# Fix permissions
chmod -R 755 data/
```

#### OpenSSL Not Found
```bash
# Find OpenSSL location
which openssl

# Update configuration with correct path
```

#### Container Won't Start
```bash
# Check Docker logs
docker logs cert-manager

# Check if port is available
docker port cert-manager
```

### Getting Help

If you encounter issues:

1. **Check the logs**: Look in `data/logs/` for error messages
2. **Verify configuration**: Ensure all paths and settings are correct
3. **Check system requirements**: Verify all dependencies are installed
4. **Consult documentation**: Review the configuration guide
5. **GitHub Issues**: Open an issue with detailed error information

### Log Locations

- **Docker**: Use `docker logs cert-manager`
- **Manual installation**: Check `data/logs/app.log`
- **System logs**: Check system journal for service-related issues

## Next Steps

After successful installation:

1. **Read the [Configuration Guide](configuration.md)** for detailed setup options
2. **Follow the [Getting Started Guide](guides/getting-started.md)** for your first certificate
3. **Review the [API Documentation](api/)** if you plan to integrate with other systems
4. **Set up [Deployment Actions](guides/deployment-actions.md)** for automated certificate deployment

## Updating

### Docker Update
```bash
# Pull latest image
docker pull your-registry/cert-manager:latest

# Restart container
docker-compose down
docker-compose up -d
```

### Manual Update
```bash
# Backup current installation
cp -r data/ data-backup/

# Pull latest code
git pull origin main

# Install dependencies
npm install

# Rebuild application
npm run build

# Restart service
npm start
```

---

**Note**: Always backup your certificate data before performing updates or major configuration changes.