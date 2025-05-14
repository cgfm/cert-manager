# THIS IS NOT FUNCTIONAL JET!

There will be the first functional release very soon.


## ToDos
### Authentication 
⬜ Frontend 
⬜ Middleware
⬜ Implementation 

### Styling ToDos
⬜ Tabs in modal -> responsive order left or top
⬜ order and view style in cert list
⬜ stacking backdrops 

### Certificate
✅ edit file meta
☑️ reading/writing SANs (renewal test)

### Deployment
✅ frontend
✅ api connect 
⬜ test deployment
❓ may be more deployments

### Action log / Logging
✅ Logger
✅ Actionlog Service 
✅ api connect 
⬜ frontend 
⬜ testing



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

- Store and manage X.509 certificates
- Support for certificate chains
- Easy integration with ESP32's networking libraries
- Certificate validation and expiration checking
