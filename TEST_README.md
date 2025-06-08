# Certificate Manager Test Suite

This directory contains comprehensive test scripts for the Certificate Manager application. The test suite includes API tests, unit tests, integration tests, and provides automated setup and cleanup of the test environment.

## Test Scripts Overview

### Main Test Runners

#### Windows (PowerShell)
- **`runTest.ps1`** - Main test runner script
- **`cleanupTest.ps1`** - Emergency cleanup script

#### Linux/macOS (Bash)
- **`runTest.sh`** - Main test runner script  
- **`cleanupTest.sh`** - Emergency cleanup script

## Prerequisites

### Windows PowerShell Setup
Before running the PowerShell test scripts, ensure the execution policy allows local script execution:

```powershell
# Check current execution policy
Get-ExecutionPolicy

# Set execution policy to RemoteSigned (if not already set)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

**Note**: The `RemoteSigned` policy allows local scripts to run while requiring downloaded scripts to be signed. This is the recommended setting for development environments.

## Quick Start

### Running API Tests (Windows)
```powershell
# Basic API test run
.\runTest.ps1

# Run with coverage report
.\runTest.ps1 -Coverage

# Run all tests with coverage
.\runTest.ps1 -TestType all -Coverage

# Run tests in watch mode
.\runTest.ps1 -Watch
```

### Running API Tests (Linux/macOS)
```bash
# Basic API test run
./runTest.sh

# Run with coverage report
./runTest.sh --coverage

# Run all tests with coverage
./runTest.sh --test-type all --coverage

# Run tests in watch mode
./runTest.sh --watch
```

## Detailed Usage

### runTest.ps1 / runTest.sh Options

| Option | PowerShell | Bash | Description |
|--------|------------|------|-------------|
| Test Type | `-TestType <type>` | `-t, --test-type <type>` | Type of tests: `api`, `unit`, `integration`, `all` |
| Coverage | `-Coverage` | `-c, --coverage` | Generate test coverage report |
| Watch Mode | `-Watch` | `-w, --watch` | Run tests in watch mode |
| Verbose | `-Verbose` | `-v, --verbose` | Enable verbose test output |
| Clean Only | `-CleanOnly` | `--clean-only` | Only cleanup environment and exit |
| No Cleanup | `-NoCleanup` | `--no-cleanup` | Don't cleanup after tests (for debugging) |
| Help | `-Help` | `-h, --help` | Show help message |

### Test Types

- **`api`** - API endpoint tests (default)
- **`unit`** - Unit tests for individual components
- **`integration`** - End-to-end integration tests
- **`all`** - Run all test suites

## Test Environment

The test runner automatically sets up a complete test environment including:

### Main Application
- Certificate Manager application container
- Exposed on `http://localhost:3000` and `https://localhost:4443`

### Mock Services
- **Mock NPM (Nginx Proxy Manager)** - `http://localhost:3001`
- **Mock SMTP Server** - SMTP: `localhost:1025`, Web UI: `http://localhost:1080`
- **Mock FTP Server** - `localhost:21`
- **Mock SFTP Server** - `localhost:2222`
- **Mock Docker API** - `localhost:2376`
- **Webhook Test Server** - `http://localhost:3002`

### Test Database
- Persistent test data storage
- Automatically cleaned between test runs

## Examples

### Windows PowerShell Examples

```powershell
# Run API tests only
.\runTest.ps1

# Run all tests with coverage and verbose output
.\runTest.ps1 -TestType all -Coverage -Verbose

# Run tests in watch mode (keeps environment running)
.\runTest.ps1 -Watch

# Clean up test environment only
.\runTest.ps1 -CleanOnly

# Run tests and keep environment for debugging
.\runTest.ps1 -NoCleanup

# Emergency cleanup if tests get stuck
.\cleanupTest.ps1

# Force cleanup everything including volumes
.\cleanupTest.ps1 -Force -All
```

### Linux/macOS Bash Examples

```bash
# Run API tests only
./runTest.sh

# Run all tests with coverage and verbose output
./runTest.sh --test-type all --coverage --verbose

# Run tests in watch mode (keeps environment running)
./runTest.sh --watch

# Clean up test environment only
./runTest.sh --clean-only

# Run tests and keep environment for debugging
./runTest.sh --no-cleanup

# Emergency cleanup if tests get stuck
./cleanupTest.sh

# Force cleanup everything including volumes
./cleanupTest.sh --force --all
```

## Test Structure

```
tests/
├── api/                    # API endpoint tests
│   ├── auth.test.js       # Authentication tests
│   ├── certificates.test.js # Certificate management tests
│   ├── integrations.test.js # NPM integration tests
│   ├── public.test.js     # Public API tests
│   ├── setup.test.js      # Setup process tests
│   └── ...
├── unit/                  # Unit tests
├── integration/           # Integration tests
├── fixtures/              # Test data and mock responses
├── utils/                 # Test utilities
└── __mocks__/            # Mock implementations
```

## Test Coverage

The test suite provides comprehensive coverage including:

### API Tests
- ✅ **Authentication & Authorization** - Login, logout, session management
- ✅ **Certificate Management** - Create, view, update, delete certificates
- ✅ **Certificate Authority** - CA operations and management
- ✅ **Deployment Actions** - Certificate deployment to various targets
- ✅ **NPM Integration** - Nginx Proxy Manager integration
- ✅ **Public API** - Health checks, status, version info
- ✅ **Setup Process** - Initial application setup
- ✅ **Settings Management** - Application configuration
- ✅ **Activity Tracking** - System activity logs
- ✅ **File System Operations** - File browsing and management
- ✅ **Security Features** - Security validation and testing

### Test Types Included
- **Functionality Tests** - Basic feature testing
- **Error Handling** - Error scenarios and edge cases
- **Security Tests** - XSS prevention, input validation, authentication
- **Performance Tests** - Response times and load testing
- **Integration Tests** - Service interaction testing

## Troubleshooting

### Common Issues

#### 1. Tests Fail to Start
```powershell
# Check if Docker is running
docker ps

# Clean up any stuck containers
.\cleanupTest.ps1 -Force
```

#### 2. Port Conflicts
If you get port conflicts, make sure these ports are available:
- `3000`, `4443` - Main application
- `3001` - Mock NPM
- `1025`, `1080` - Mock SMTP
- `21`, `30000-30009` - Mock FTP
- `2222` - Mock SFTP
- `2376` - Mock Docker
- `3002` - Webhook server

#### 3. Cleanup Issues
```powershell
# Emergency cleanup
.\cleanupTest.ps1 -Force -All

# Check for remaining containers
docker ps -a --filter "name=cert-manager"

# Manual cleanup if needed
docker stop $(docker ps -aq --filter "name=cert-manager")
docker rm $(docker ps -aq --filter "name=cert-manager")
```

#### 4. Test Environment Stuck
```powershell
# Force stop all test containers
.\cleanupTest.ps1 -Force

# Restart fresh environment
.\runTest.ps1
```

### Log Analysis

#### Test Logs
Test results are displayed in the terminal with colored output:
- ✅ Green - Successful tests
- ❌ Red - Failed tests  
- ⚠️ Yellow - Warnings
- ℹ️ Blue - Information

#### Coverage Reports
When using `-Coverage` flag:
- Reports are generated in `./coverage/` directory
- Open `coverage/lcov-report/index.html` in browser for detailed view

#### Application Logs
```powershell
# View application logs
docker logs cert-manager-cert-manager-1

# View test service logs
docker logs cert-manager-mock-npm-1
docker logs cert-manager-mock-smtp-1
```

## Development

### Adding New Tests

1. **API Tests**: Add to `tests/api/` directory
2. **Unit Tests**: Add to `tests/unit/` directory  
3. **Integration Tests**: Add to `tests/integration/` directory

### Test Utilities

Use the `TestAPIClient` class from `tests/utils/testUtils.js`:

```javascript
const { TestAPIClient } = require('../utils/testUtils');

describe('My API Tests', () => {
  let apiClient;

  beforeAll(async () => {
    apiClient = new TestAPIClient();
    await apiClient.authenticate();
  });

  test('should test my endpoint', async () => {
    const response = await apiClient.get('/api/my-endpoint');
    expect(response.status).toBe(200);
  });
});
```

### Mock Services

Mock services are automatically started and configured. Access them in tests:

```javascript
// Mock NPM available at http://localhost:3001
// Mock SMTP available at http://localhost:1080  
// Webhook server available at http://localhost:3002
```

## CI/CD Integration

For automated testing in CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run API Tests
  run: |
    chmod +x runTest.sh
    ./runTest.sh --test-type api --coverage
    
- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    file: ./coverage/lcov.info
```

## Security Considerations

- Tests run in isolated Docker containers
- Mock services use non-standard ports
- Test data is automatically cleaned up
- No production data is used in tests
- All test credentials are hardcoded test values only

---

For more information, see the individual test files in the `tests/` directory or run the help command:

```powershell
.\runTest.ps1 -Help
```
