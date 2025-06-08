# Certificate Manager

A comprehensive SSL certificate management solution designed specifically for local certificate generation and deployment to Nginx Proxy Manager (NPM) and other services.

## Overview

Certificate Manager provides OpenSSL-based certificate generation with automated deployment capabilities. Since NPM handles ACME/Let's Encrypt certificates natively, this tool focuses on local certificate management for:

- Internal services and development environments
- Self-signed certificates for local networks
- CA-signed certificates using your own Certificate Authority
- Automated deployment to NPM, Docker containers, and various services

## Features

- **Local Certificate Generation**: OpenSSL-based certificate creation
- **Multiple Deployment Methods**: NPM, Docker, SSH, FTP, SMB, API calls
- **Web-Based Management**: Intuitive dashboard for certificate lifecycle
- **Auto-Renewal System**: Automated certificate renewal before expiration
- **Backup & Versioning**: Comprehensive backup and rollback capabilities

## Table of Contents
- [Installation](docs/installation.md)
- [Configuration](docs/configuration.md)
- [Getting Started](docs/guides/getting-started.md)
- [API Reference](docs/api/)
- [Deployment Actions](docs/guides/deployment-actions.md)
- [Troubleshooting](docs/reference/troubleshooting.md)

## Quick Links
- [API Documentation](docs/api/)
- [Configuration Reference](docs/configuration.md)
- [GitHub Repository](https://github.com/cgfm/cert-manager)