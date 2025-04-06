# Certificate Manager

A comprehensive web-based tool for managing SSL certificates:

- View certificate details and expiry dates
- Create self-signed certificates and Certificate Authorities
- Renew certificates (self-signed or CA-signed)
- Manage certificate configuration and deployment actions
- Automatic certificate renewal with configurable settings
- Certificate backup functionality

## Installation

```shell
# Clone the repository
git clone https://github.com/yourusername/cert-manager.git
cd cert-manager

# Run with Docker Compose
docker-compose up -d
```
Visit http://localhost:3000 to access the certificate management interface.

## Features
- Certificate viewing with detailed information
- Certificate creation (self-signed, CA-signed)
- Certificate renewal management
- Automatic renewal based on configurable thresholds
- Certificate backup functionality
- Deployment action configuration