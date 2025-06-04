# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the Certificate Manager application.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Startup Problems](#startup-problems)
- [SSL Certificate Issues](#ssl-certificate-issues)
- [Authentication Problems](#authentication-problems)
- [Docker Issues](#docker-issues)
- [Database Problems](#database-problems)
- [API Issues](#api-issues)
- [Web Interface Problems](#web-interface-problems)
- [File System Issues](#file-system-issues)
- [OpenSSL Issues](#openssl-issues)
- [Deployment Action Failures](#deployment-action-failures)
- [Performance Issues](#performance-issues)
- [Debug Logging](#debug-logging)

## Installation Issues

### Node.js Version Compatibility

**Problem**: Application fails to start with Node.js version errors.

**Solution**:
```bash
# Check Node.js version
node --version

# Install compatible Node.js version (14.x or higher)
# Using nvm (recommended)
nvm install 16
nvm use 16

# Or update Node.js directly
# Download from https://nodejs.org/
```

### Missing Dependencies

**Problem**: `Error: Cannot find module` messages during startup.

**Solution**:
```bash
# Clear npm cache and reinstall
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# For development dependencies
npm install --include=dev
```

### Permission Errors During Installation

**Problem**: Permission denied errors when installing packages.

**Solution**:
```bash
# Fix npm permissions (Linux/macOS)
sudo chown -R $(whoami) ~/.npm
sudo chown -R $(whoami) /usr/local/lib/node_modules

# Or use npx for one-time runs
npx cert-manager

# Windows: Run as Administrator
```

## Startup Problems

### Port Already in Use

**Problem**: `Error: listen EADDRINUSE :::3000`

**Solution**:
```bash
# Find process using port 3000
lsof -i :3000  # Linux/macOS
netstat -ano | findstr :3000  # Windows

# Kill the process
kill -9 <PID>  # Linux/macOS
taskkill /PID <PID> /F  # Windows

# Or use different port
PORT=3001 npm start
```

### Environment Variables Not Loaded

**Problem**: Application starts but features don't work properly.

**Solution**:
1. Check `.env` file exists in project root
2. Verify environment variables are set:
```bash
# Check current environment
printenv | grep CERT_  # Linux/macOS
set | findstr CERT_    # Windows

# Create .env file if missing
cp .env.example .env
```

### SSL Context Creation Failed

**Problem**: `Error: unable to create SSL context`

**Solution**:
```bash
# Check SSL files exist and have correct permissions
ls -la certs/
chmod 600 certs/private.key
chmod 644 certs/certificate.crt

# Verify certificate format
openssl x509 -in certs/certificate.crt -text -noout
```

## SSL Certificate Issues

### Certificate Parsing Errors

**Problem**: `Error: unable to parse certificate`

**Solutions**:

1. **Check certificate format**:
```bash
# Verify certificate structure
openssl x509 -in certificate.crt -text -noout

# Convert from DER to PEM if needed
openssl x509 -inform der -in certificate.der -out certificate.pem
```

2. **Check for invisible characters**:
```bash
# Remove invisible characters
dos2unix certificate.crt
cat -A certificate.crt  # Show all characters
```

3. **Validate certificate chain**:
```bash
# Check certificate chain
openssl verify -CAfile ca-bundle.crt certificate.crt
```

### Private Key Mismatch

**Problem**: `Error: private key does not match certificate`

**Solution**:
```bash
# Compare certificate and key modulus
openssl x509 -noout -modulus -in certificate.crt | openssl md5
openssl rsa -noout -modulus -in private.key | openssl md5

# They should match exactly
```

### Certificate Expiration

**Problem**: Certificate validation fails or warnings about expiration.

**Solution**:
```bash
# Check certificate expiration
openssl x509 -in certificate.crt -noout -dates

# Set up auto-renewal monitoring
# Add to crontab for daily checks
0 6 * * * /usr/local/bin/cert-manager check-expiry
```

### Self-Signed Certificate Issues

**Problem**: Browser warnings or API rejections for self-signed certificates.

**Solutions**:

1. **For development**:
```bash
# Add to trusted certificates (macOS)
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain certificate.crt

# Add to trusted certificates (Linux)
sudo cp certificate.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

2. **For API clients**:
```javascript
// Disable SSL verification (development only)
process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
```

## Authentication Problems

### Token Validation Failures

**Problem**: `Error: invalid token` or authentication errors.

**Solutions**:

1. **Check JWT secret**:
```bash
# Verify JWT_SECRET is set
echo $JWT_SECRET

# Generate new secret if needed
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

2. **Clear browser cache**:
   - Clear cookies and local storage
   - Try incognito/private browsing mode

3. **Check token expiration**:
```javascript
// Decode JWT to check expiration
const jwt = require('jsonwebtoken');
const decoded = jwt.decode(token);
console.log('Expires:', new Date(decoded.exp * 1000));
```

### Password Hash Issues

**Problem**: Cannot login with correct credentials.

**Solution**:
```bash
# Reset password hash
node -e "
const bcrypt = require('bcryptjs');
const hash = bcrypt.hashSync('newpassword', 12);
console.log('New hash:', hash);
"

# Update in your user store/database
```

## Docker Issues

### Container Won't Start

**Problem**: Docker container exits immediately or fails to start.

**Solutions**:

1. **Check Docker logs**:
```bash
docker logs cert-manager
docker logs --follow cert-manager
```

2. **Verify image build**:
```bash
# Rebuild image
docker build -t cert-manager .

# Check build logs
docker build --no-cache -t cert-manager .
```

3. **Check resource limits**:
```bash
# Increase memory if needed
docker run -m 1g cert-manager

# Check Docker system resources
docker system df
docker system prune  # Clean up if needed
```

### Volume Mount Issues

**Problem**: Configuration files or certificates not accessible.

**Solution**:
```bash
# Check volume mounts
docker inspect cert-manager

# Fix permissions
sudo chown -R 1000:1000 /host/cert/path
chmod 755 /host/cert/path

# Test with bind mount
docker run -v /host/certs:/app/certs cert-manager
```

### Network Connectivity

**Problem**: Cannot access application from host or between containers.

**Solutions**:

1. **Check port mapping**:
```bash
# Verify port is exposed
docker ps
docker port cert-manager

# Map port explicitly
docker run -p 3000:3000 cert-manager
```

2. **Check Docker network**:
```bash
# List networks
docker network ls

# Inspect network
docker network inspect bridge
```

## Database Problems

### Connection Failures

**Problem**: Database connection errors or timeouts.

**Solutions**:

1. **Check database service**:
```bash
# For MongoDB
mongosh --eval "db.adminCommand('ismaster')"

# For PostgreSQL
pg_isready -h localhost -p 5432

# For SQLite
sqlite3 database.db ".tables"
```

2. **Verify connection string**:
```bash
# Check DATABASE_URL format
echo $DATABASE_URL

# Test connection
node -e "
const url = process.env.DATABASE_URL;
console.log('Connecting to:', url.replace(/\/\/.*:.*@/, '//***:***@'));
"
```

### Migration Issues

**Problem**: Database schema out of sync or migration failures.

**Solution**:
```bash
# Check migration status
npm run db:migrate:status

# Run pending migrations
npm run db:migrate

# Reset database if needed (development only)
npm run db:reset
```

## API Issues

### 404 Not Found Errors

**Problem**: API endpoints return 404 errors.

**Solutions**:

1. **Check route registration**:
```bash
# Enable debug logging
DEBUG=cert-manager:routes npm start

# Check available routes
curl -X OPTIONS http://localhost:3000/api/
```

2. **Verify API version**:
```bash
# Check API version in URL
curl http://localhost:3000/api/v1/certificates

# Check swagger documentation
curl http://localhost:3000/api-docs
```

### CORS Errors

**Problem**: Cross-origin request blocked in browser.

**Solution**:
```javascript
// Add to app.js or check CORS configuration
app.use(cors({
  origin: ['http://localhost:3000', 'https://yourdomain.com'],
  credentials: true
}));
```

### Rate Limiting

**Problem**: Too many requests error (429).

**Solution**:
```bash
# Check rate limit headers
curl -I http://localhost:3000/api/certificates

# Increase rate limits in configuration
RATE_LIMIT_MAX=1000
RATE_LIMIT_WINDOW=900000  # 15 minutes
```

## Web Interface Problems

### Assets Not Loading

**Problem**: CSS, JavaScript, or images not loading.

**Solutions**:

1. **Check static file serving**:
```bash
# Verify static directory
ls -la public/
ls -la static/

# Check static route configuration
curl http://localhost:3000/css/style.css
```

2. **Clear browser cache**:
   - Hard refresh (Ctrl+F5 or Cmd+Shift+R)
   - Disable cache in developer tools
   - Clear browser cache completely

### JavaScript Errors

**Problem**: Frontend functionality not working.

**Solutions**:

1. **Check browser console**:
   - Open developer tools (F12)
   - Look for JavaScript errors in console
   - Check network tab for failed requests

2. **Verify script loading**:
```html
<!-- Check script tags in HTML -->
<script src="/js/app.js"></script>
```

## File System Issues

### Permission Denied

**Problem**: Cannot read/write certificate files.

**Solutions**:

1. **Fix file permissions**:
```bash
# Set correct permissions for certificates
sudo chown -R $USER:$USER certs/
chmod 700 certs/
chmod 600 certs/*.key
chmod 644 certs/*.crt
```

2. **Check directory permissions**:
```bash
# Ensure parent directories are accessible
chmod 755 /path/to/cert/directory
```

### File Not Found

**Problem**: Certificate or configuration files not found.

**Solutions**:

1. **Check file paths**:
```bash
# Verify file exists
ls -la /path/to/certificate.crt

# Check current working directory
pwd
ls -la certs/
```

2. **Use absolute paths**:
```bash
# In configuration, use absolute paths
CERT_PATH=/absolute/path/to/certificate.crt
KEY_PATH=/absolute/path/to/private.key
```

## OpenSSL Issues

### OpenSSL Not Found

**Problem**: `openssl: command not found`

**Solutions**:

1. **Install OpenSSL**:
```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install openssl

# CentOS/RHEL
sudo yum install openssl

# macOS
brew install openssl

# Windows
# Download from: https://slproweb.com/products/Win32OpenSSL.html
```

2. **Check PATH**:
```bash
# Verify openssl in PATH
which openssl
openssl version

# Add to PATH if needed
export PATH="/usr/local/ssl/bin:$PATH"
```

### Cipher Suite Issues

**Problem**: SSL handshake failures or cipher negotiation errors.

**Solutions**:

1. **Check supported ciphers**:
```bash
# List available ciphers
openssl ciphers -v

# Test specific cipher
openssl s_client -cipher ECDHE-RSA-AES256-GCM-SHA384 -connect localhost:443
```

2. **Update cipher configuration**:
```javascript
// In SSL configuration
const options = {
  ciphers: 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384',
  honorCipherOrder: true
};
```

## Deployment Action Failures

### GitHub Actions Issues

**Problem**: Deployment workflows failing.

**Solutions**:

1. **Check workflow file**:
```yaml
# Verify .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [ main ]
```

2. **Check secrets**:
   - Verify required secrets are set in repository settings
   - Check secret names match workflow file
   - Ensure secrets have correct permissions

3. **Debug workflow**:
```yaml
# Add debug step
- name: Debug
  run: |
    echo "Node version: $(node --version)"
    echo "Working directory: $(pwd)"
    ls -la
```

### Docker Registry Issues

**Problem**: Cannot push/pull Docker images.

**Solutions**:

1. **Check authentication**:
```bash
# Login to registry
docker login registry.example.com

# Check existing login
cat ~/.docker/config.json
```

2. **Verify image tags**:
```bash
# Check image naming
docker images
docker tag local-image registry.example.com/cert-manager:latest
```

## Performance Issues

### High Memory Usage

**Problem**: Application consumes excessive memory.

**Solutions**:

1. **Monitor memory usage**:
```bash
# Check process memory
ps aux | grep node
top -p $(pgrep node)

# Node.js memory usage
node --max-old-space-size=4096 src/app.js
```

2. **Profile memory leaks**:
```javascript
// Add memory monitoring
setInterval(() => {
  const used = process.memoryUsage();
  console.log('Memory usage:', {
    rss: Math.round(used.rss / 1024 / 1024) + 'MB',
    heapTotal: Math.round(used.heapTotal / 1024 / 1024) + 'MB',
    heapUsed: Math.round(used.heapUsed / 1024 / 1024) + 'MB'
  });
}, 30000);
```

### Slow Certificate Operations

**Problem**: Certificate generation or validation is slow.

**Solutions**:

1. **Optimize OpenSSL operations**:
```bash
# Use hardware acceleration if available
openssl speed rsa2048

# Check entropy availability
cat /proc/sys/kernel/random/entropy_avail
```

2. **Cache certificate validations**:
```javascript
// Implement caching for expensive operations
const cache = new Map();
function validateCertificate(cert) {
  const key = crypto.createHash('sha256').update(cert).digest('hex');
  if (cache.has(key)) return cache.get(key);
  
  const result = performValidation(cert);
  cache.set(key, result);
  return result;
}
```

## Debug Logging

### Enable Debug Mode

**Problem**: Need detailed logging for troubleshooting.

**Solutions**:

1. **Environment variables**:
```bash
# Enable debug logging
DEBUG=cert-manager:* npm start
DEBUG=cert-manager:ssl,cert-manager:auth npm start

# Set log level
LOG_LEVEL=debug npm start
```

2. **Application logging**:
```javascript
// Add to app.js
const debug = require('debug')('cert-manager:main');
debug('Application starting...');

// Log configuration
console.log('Configuration:', {
  port: process.env.PORT,
  env: process.env.NODE_ENV,
  // Don't log sensitive data
});
```

### Log Analysis

**Problem**: Need to analyze application logs for issues.

**Solutions**:

1. **Structured logging**:
```bash
# Search logs for errors
grep -i error application.log
grep -E "(error|warn|fatal)" application.log

# Filter by timestamp
awk '/2024-01-15.*ERROR/ { print }' application.log
```

2. **Log rotation**:
```bash
# Set up log rotation
cat > /etc/logrotate.d/cert-manager << EOF
/var/log/cert-manager/*.log {
    daily
    rotate 30
    compress delaycompress
    missingok
    notifempty
    create 0644 www-data www-data
}
EOF
```

## Getting Help

### Gathering Debug Information

When reporting issues, include:

1. **System information**:
```bash
# Gather system info
uname -a
node --version
npm --version
docker --version
openssl version
```

2. **Application logs**:
```bash
# Get recent logs
tail -n 100 /var/log/cert-manager/application.log

# Enable debug mode
DEBUG=cert-manager:* npm start > debug.log 2>&1
```

3. **Configuration**:
```bash
# Export configuration (remove sensitive data)
env | grep -E "(CERT_|NODE_|PORT|LOG_)" | sort
```

### Support Resources

- **Documentation**: Check the [Getting Started Guide](../guides/getting-started.md)
- **API Reference**: See [API Documentation](../api/)
- **GitHub Issues**: Report bugs and feature requests
- **Community Forums**: Stack Overflow with `cert-manager` tag

### Common Commands Summary

```bash
# Quick health check
curl -f http://localhost:3000/health || echo "Service down"

# Check certificate expiry
openssl x509 -in certificate.crt -noout -dates

# View application logs
tail -f /var/log/cert-manager/application.log

# Restart service
npm run restart
# or
docker restart cert-manager

# Full system check
npm run health-check
```

Remember to always check the application logs first when troubleshooting issues. Most problems will have error messages that point to the root cause.