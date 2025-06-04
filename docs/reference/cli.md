# CLI Reference

The Certificate Manager provides a simple command-line interface for running and configuring the application.

## Table of Contents

- [Basic Usage](#basic-usage)
- [npm Scripts](#npm-scripts)
- [Environment Variables](#environment-variables)
- [Configuration Options](#configuration-options)
- [Docker Commands](#docker-commands)
- [Development Commands](#development-commands)
- [Examples](#examples)

---

## Basic Usage

### Starting the Application

```bash
# Start the Certificate Manager
node src/app.js

# Or using npm
npm start
```

### Development Mode

```bash
# Start with auto-reload (requires nodemon)
npm run dev
```

---

## npm Scripts

The Certificate Manager includes several npm scripts for common tasks:

### Production Scripts

```bash
# Start the application
npm start

# Equivalent to: node src/app.js
```

### Development Scripts

```bash
# Start in development mode with auto-reload
npm run dev

# Requires nodemon to be installed
# Equivalent to: nodemon src/app.js
```

### Documentation Scripts

```bash
# Generate Swagger API documentation
npm run swagger-gen

# Generates OpenAPI specification and updates documentation
```

### Testing Scripts

```bash
# Run tests (currently placeholder)
npm test

# Note: Test suite is not yet implemented
```

---

## Environment Variables

Configure the Certificate Manager using these environment variables:

### Authentication & Security

| Variable | Default | Description |
|----------|---------|-------------|
| `DISABLE_AUTH` | `false` | Disable authentication entirely |
| `DEFAULT_ADMIN_PASSWORD` | `""` | Set default admin password (setup required if empty) |

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `HTTPS_PORT` | `4443` | HTTPS server port (if enabled) |
| `TZ` | `UTC` | Server timezone |

### Paths & Storage

| Variable | Default | Description |
|----------|---------|-------------|
| `CERT_PATH` | `/certs` | Directory for certificate storage |
| `CERT_MANAGER_CERT_PATH` | `/certs` | Alternative certificate path variable |
| `CONFIG_DIR` | `/config` | Configuration files directory |
| `LOGS_DIR` | `/logs` | Log files directory |

### SSL/TLS Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_HTTPS` | `false` | Enable HTTPS server |
| `HTTPS_CERT_PATH` | `""` | Path to HTTPS certificate |
| `HTTPS_KEY_PATH` | `""` | Path to HTTPS private key |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Logging level (error, warn, info, debug, fine, finest) |

### Crypto Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `CRYPTO_BACKEND` | `node-forge` | Crypto engine (node-forge, openssl, node-forge-fallback) |

### Auto-Renewal

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_AUTO_RENEWAL` | `true` | Enable automatic certificate renewal |
| `RENEWAL_SCHEDULE` | `0 2 * * *` | Cron schedule for renewal checks |
| `ENABLE_FILE_WATCH` | `true` | Enable file system watching |

---

## Configuration Options

### Crypto Backend Options

The application supports multiple cryptographic backends:

```bash
# Use Node-Forge (default, pure JavaScript)
CRYPTO_BACKEND=node-forge

# Use OpenSSL (requires openssl binary)
CRYPTO_BACKEND=openssl

# Use hybrid mode (Node-Forge with OpenSSL fallback)
CRYPTO_BACKEND=node-forge-fallback
```

### Log Levels

Configure logging verbosity:

```bash
# Error messages only
LOG_LEVEL=error

# Warnings and errors
LOG_LEVEL=warn

# General information (default)
LOG_LEVEL=info

# Debug information
LOG_LEVEL=debug

# Fine-grained debug info
LOG_LEVEL=fine

# Most verbose logging
LOG_LEVEL=finest
```

---

## Docker Commands

### Running with Docker

```bash
# Basic Docker run
docker run -d \
  --name cert-manager \
  -p 3000:3000 \
  -v /path/to/certs:/certs \
  -v /path/to/config:/config \
  -v /path/to/logs:/logs \
  cert-manager:latest

# With custom environment
docker run -d \
  --name cert-manager \
  -p 3000:3000 \
  -e DISABLE_AUTH=false \
  -e LOG_LEVEL=debug \
  -e TZ=America/New_York \
  -v /path/to/certs:/certs \
  -v /path/to/config:/config \
  -v /path/to/logs:/logs \
  cert-manager:latest
```

### Docker Compose

```yaml
version: '3.8'
services:
  cert-manager:
    build: .
    container_name: cert-manager
    ports:
      - "3000:3000"
    environment:
      - DISABLE_AUTH=false
      - LOG_LEVEL=info
      - TZ=UTC
    volumes:
      - ./certs:/certs
      - ./config:/config
      - ./logs:/logs
    restart: unless-stopped
```

---

## Development Commands

### Running in Development

```bash
# Install dependencies
npm install

# Start in development mode
npm run dev

# Generate API documentation
npm run swagger-gen
```

### Environment Setup

```bash
# Create necessary directories
mkdir -p certs config logs

# Set permissions (Linux/Mac)
chmod 755 certs config logs

# Copy example configuration
cp src/config/example.json config/settings.json
```

---

## Examples

### Basic Startup

```bash
# Start with default settings
npm start

# Start with custom port
PORT=8080 npm start

# Start with debug logging
LOG_LEVEL=debug npm start
```

### Production Deployment

```bash
# Start with production settings
NODE_ENV=production \
DISABLE_AUTH=false \
LOG_LEVEL=warn \
CERT_PATH=/opt/certificates \
CONFIG_DIR=/opt/config \
npm start
```

### Development with Custom Backend

```bash
# Use OpenSSL backend in development
CRYPTO_BACKEND=openssl \
LOG_LEVEL=debug \
npm run dev
```

### Secure HTTPS Deployment

```bash
# Enable HTTPS with custom certificates
ENABLE_HTTPS=true \
HTTPS_CERT_PATH=/etc/ssl/certs/server.crt \
HTTPS_KEY_PATH=/etc/ssl/private/server.key \
HTTPS_PORT=8443 \
npm start
```

### Docker Development

```bash
# Build development image
docker build -t cert-manager:dev .

# Run with development settings
docker run -it --rm \
  -p 3000:3000 \
  -e LOG_LEVEL=debug \
  -e CRYPTO_BACKEND=openssl \
  -v $(pwd)/certs:/certs \
  -v $(pwd)/config:/config \
  -v $(pwd)/logs:/logs \
  cert-manager:dev
```

---

## Quick Reference

### Common Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start the application |
| `npm run dev` | Start in development mode |
| `npm run swagger-gen` | Generate API documentation |

### Important Paths

| Path | Purpose |
|------|---------|
| `/certs` | Certificate storage |
| `/config` | Configuration files |
| `/logs` | Application logs |
| `/app/src` | Application source code |

### Default Ports

| Port | Service |
|------|---------|
| `3000` | HTTP server |
| `4443` | HTTPS server (if enabled) |

### Key Files

| File | Description |
|------|-------------|
| `src/app.js` | Main application entry point |
| `package.json` | Project configuration and dependencies |
| `Dockerfile` | Docker container configuration |
| `config/settings.json` | Application settings |

---

## See Also

- [Getting Started Guide](../guides/getting-started.md)
- [Troubleshooting Guide](troubleshooting.md)
- [API Documentation](../api/README.md)
- [Configuration Guide](../guides/ssl-setup.md)