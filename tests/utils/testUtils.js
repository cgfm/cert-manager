/**
 * Test Utilities for API Testing
 * Provides common utilities for testing the Certificate Manager API
 */
const request = require('supertest');
const express = require('express');
const path = require('path');
const { spawn } = require('child_process');

// Mock services configuration
const MOCK_SERVICES_CONFIG = {
  npm: { port: 3001, health: '/health' },
  smtp: { port: 1080, health: '/health' },
  ftp: { port: 21, health: null },
  sftp: { port: 2222, health: null },
  docker: { port: 2376, health: null },
  webhook: { port: 3002, health: '/health' }
};

/**
 * Start mock services for testing
 * @returns {Promise<Object>} Mock services information
 */
async function startMockServices() {
  const mockServices = {
    npm: { url: `http://localhost:${MOCK_SERVICES_CONFIG.npm.port}`, ready: false },
    smtp: { url: `http://localhost:${MOCK_SERVICES_CONFIG.smtp.port}`, ready: false },
    ftp: { host: 'localhost', port: MOCK_SERVICES_CONFIG.ftp.port, ready: false },
    sftp: { host: 'localhost', port: MOCK_SERVICES_CONFIG.sftp.port, ready: false },
    docker: { host: 'localhost', port: MOCK_SERVICES_CONFIG.docker.port, ready: false },
    webhook: { url: `http://localhost:${MOCK_SERVICES_CONFIG.webhook.port}`, ready: false }
  };

  // Check if services are already running via Docker Compose
  try {
    await waitForDockerServices();
    
    // Mark HTTP services as ready if they respond to health checks
    for (const [serviceName, config] of Object.entries(MOCK_SERVICES_CONFIG)) {
      if (config.health) {
        try {
          const response = await request(`http://localhost:${config.port}`)
            .get(config.health)
            .timeout(1000);
          
          if (response.status === 200) {
            mockServices[serviceName].ready = true;
          }
        } catch (error) {
          // Service not ready, will be marked as not ready
          console.warn(`Mock service ${serviceName} not responding on port ${config.port}`);
        }
      } else {
        // For non-HTTP services, assume ready if Docker services are running
        mockServices[serviceName].ready = true;
      }
    }
  } catch (error) {
    console.warn('Docker services may not be fully ready:', error.message);
  }

  return mockServices;
}

/**
 * Stop mock services
 * @param {Object} mockServices - Mock services object from startMockServices
 * @returns {Promise<void>}
 */
async function stopMockServices(mockServices) {
  // In Docker Compose setup, services are managed externally
  // This function is mainly for cleanup and marking services as stopped
  if (mockServices) {
    Object.keys(mockServices).forEach(serviceName => {
      mockServices[serviceName].ready = false;
    });
  }
  
  // Allow some time for cleanup
  await new Promise(resolve => setTimeout(resolve, 100));
}

class TestAPIClient {
  constructor(app) {
    this.app = app;
    this.agent = request.agent(app);
    this.authToken = null;
  }

  /**
   * Authenticate with the API
   */
  async authenticate(username = 'admin', password = 'admin') {
    const response = await this.agent
      .post('/api/auth/login')
      .send({ username, password })
      .expect(200);

    this.authToken = response.body.token;
    return this.authToken;
  }

  /**
   * Make authenticated request
   */
  authenticatedRequest(method, url) {
    const req = this.agent[method.toLowerCase()](url);
    if (this.authToken) {
      req.set('Authorization', `Bearer ${this.authToken}`);
    }
    return req;
  }

  // Certificate API methods
  async getCertificates() {
    return this.authenticatedRequest('GET', '/api/certificates');
  }

  async createCertificate(certificateData) {
    return this.authenticatedRequest('POST', '/api/certificates')
      .send(certificateData);
  }

  async getCertificate(fingerprint) {
    return this.authenticatedRequest('GET', `/api/certificates/${fingerprint}`);
  }

  async updateCertificate(fingerprint, updateData) {
    return this.authenticatedRequest('PUT', `/api/certificates/${fingerprint}`)
      .send(updateData);
  }

  async deleteCertificate(fingerprint) {
    return this.authenticatedRequest('DELETE', `/api/certificates/${fingerprint}`);
  }

  async renewCertificate(fingerprint) {
    return this.authenticatedRequest('POST', `/api/certificates/${fingerprint}/renew`);
  }

  // Deployment Actions API methods
  async getDeploymentActions(fingerprint) {
    return this.authenticatedRequest('GET', `/api/certificates/${fingerprint}/deploy-actions`);
  }

  async createDeploymentAction(fingerprint, actionData) {
    return this.authenticatedRequest('POST', `/api/certificates/${fingerprint}/deploy-actions`)
      .send(actionData);
  }

  async updateDeploymentAction(fingerprint, actionIndex, actionData) {
    return this.authenticatedRequest('PUT', `/api/certificates/${fingerprint}/deploy-actions/${actionIndex}`)
      .send(actionData);
  }

  async deleteDeploymentAction(fingerprint, actionIndex) {
    return this.authenticatedRequest('DELETE', `/api/certificates/${fingerprint}/deploy-actions/${actionIndex}`);
  }

  async executeDeploymentActions(fingerprint) {
    return this.authenticatedRequest('POST', `/api/certificates/${fingerprint}/deploy-actions/execute`);
  }

  // Settings API methods
  async getSettings() {
    return this.authenticatedRequest('GET', '/api/settings');
  }

  async updateSettings(settingsData) {
    return this.authenticatedRequest('PATCH', '/api/settings')
      .send(settingsData);
  }

  async getDeploymentSettings() {
    return this.authenticatedRequest('GET', '/api/settings/deployment');
  }

  async updateDeploymentSettings(deploymentData) {
    return this.authenticatedRequest('PUT', '/api/settings/deployment')
      .send(deploymentData);
  }

  // CA API methods
  async getCAs() {
    return this.authenticatedRequest('GET', '/api/ca');
  }
}

/**
 * Mock Certificate Manager for testing
 */
class MockCertificateManager {
  constructor() {
    this.certificates = new Map();
    this.isInitialized = true;
    this.certsDir = path.join(__dirname, '../fixtures/test-certs');
  }

  getCertificate(fingerprint) {
    return this.certificates.get(fingerprint);
  }

  handleFrontendRefresh() {
    return Array.from(this.certificates.values());
  }

  createOrRenewCertificate(cert, options) {
    return Promise.resolve({ success: true, certificate: cert });
  }

  saveCertificateConfigs() {
    return Promise.resolve(true);
  }

  getCertificateApiResponse(fingerprint) {
    const cert = this.getCertificate(fingerprint);
    return Promise.resolve(cert || null);
  }

  updateCertificateConfig(fingerprint, config) {
    const cert = this.getCertificate(fingerprint);
    if (cert) {
      Object.assign(cert._config || {}, config);
      return Promise.resolve(true);
    }
    return Promise.resolve(false);
  }

  hasPassphrase(fingerprint) {
    return false;
  }

  storePassphrase(fingerprint, passphrase) {
    return true;
  }

  rotateEncryptionKey() {
    return true;
  }
}

/**
 * Create a test app instance
 */
function createTestApp() {
  const app = express();
  
  // Add basic middleware
  app.use(express.json());
  
  // Create proper Jest mocks for all services
  const mockDeps = {
    certificateManager: new MockCertificateManager(),
    
    // Crypto service mock
    cryptoService: {
      convertToP12: jest.fn().mockResolvedValue({ success: true }),
      convertToPEM: jest.fn().mockResolvedValue({ success: true })
    },
    
    // Activity service mock
    activityService: {
      addActivity: jest.fn().mockResolvedValue(true),
      recordActivity: jest.fn().mockResolvedValue(true),
      recordUserActivity: jest.fn().mockResolvedValue(true)
    },
    
    // Config service mock
    configService: {
      get: jest.fn().mockReturnValue({}),
      updateSettings: jest.fn().mockReturnValue(true),
      update: jest.fn().mockResolvedValue(true)
    },
    
    // Auth middleware mock
    authMiddleware: {
      authenticate: jest.fn((req, res, next) => {
        // Mock authenticated user for testing
        req.user = {
          username: 'testuser',
          role: 'user',
          name: 'Test User'
        };
        next();
      }),
      getJwtSecret: jest.fn().mockReturnValue('test-jwt-secret'),
      setSetupMode: jest.fn(),
      getSetupMode: jest.fn().mockReturnValue(false),
      isAuthDisabled: jest.fn().mockReturnValue(false)
    },
    
    // User manager mock with proper API
    userManager: {
      // Authentication methods
      authenticate: jest.fn().mockResolvedValue({
        username: 'testuser',
        role: 'user',
        name: 'Test User',
        disabled: false
      }),
      
      // User management methods
      getUser: jest.fn().mockReturnValue({
        username: 'testuser',
        role: 'user',
        name: 'Test User',
        disabled: false
      }),
      getAllUsers: jest.fn().mockReturnValue([{
        username: 'testuser',
        role: 'user',
        name: 'Test User',
        disabled: false
      }]),
      createUser: jest.fn().mockResolvedValue({
        username: 'newuser',
        role: 'user',
        name: 'New User',
        disabled: false
      }),
      updateUser: jest.fn().mockResolvedValue({
        username: 'testuser',
        role: 'user',
        name: 'Updated User',
        disabled: false
      }),
      deleteUser: jest.fn().mockResolvedValue(true),
      userExists: jest.fn().mockReturnValue(true),
      
      // Password management
      changePassword: jest.fn().mockResolvedValue(true),
      updateLastLogin: jest.fn().mockResolvedValue(true),
      
      // API token methods
      createApiToken: jest.fn().mockResolvedValue({
        id: 'token-id',
        name: 'test-token',
        username: 'testuser',
        value: 'token-value',
        createdAt: new Date().toISOString(),
        expires: null,
        scopes: ['certificates:read']
      }),
      getApiToken: jest.fn().mockResolvedValue({
        id: 'token-id',
        name: 'test-token',
        username: 'testuser',
        createdAt: new Date().toISOString(),
        expires: null,
        scopes: ['certificates:read']
      }),
      getUserApiTokens: jest.fn().mockResolvedValue([]),
      getAllApiTokens: jest.fn().mockResolvedValue([]),
      deleteApiToken: jest.fn().mockResolvedValue(true),
      validateApiToken: jest.fn().mockResolvedValue({
        user: {
          username: 'testuser',
          role: 'user',
          name: 'Test User',
          disabled: false
        },
        token: {
          id: 'token-id',
          name: 'test-token',
          scopes: ['certificates:read']
        }
      }),
      
      // Setup methods
      isSetupNeeded: jest.fn().mockResolvedValue(false),
      markSetupCompleted: jest.fn().mockResolvedValue(true),
      getUserStatistics: jest.fn().mockReturnValue({
        admin: 1,
        user: 1,
        total: 2
      })
    },
    
    // Deploy service mock
    deployService: {
      executeAction: jest.fn().mockResolvedValue({ success: true }),
      getAvailableServices: jest.fn().mockReturnValue([]),
      validateConfiguration: jest.fn().mockReturnValue({ valid: true })
    }
  };

  // Setup API routes
  const setupApi = require('../../src/api');
  app.use('/api', setupApi(mockDeps));

  return { app, mockDeps };
}

/**
 * Wait for Docker containers to be ready
 */
async function waitForDockerServices() {
  const axios = require('axios');
  const services = [
    { name: 'mock-npm', url: 'http://localhost:3001' },
    { name: 'webhook-server', url: 'http://localhost:3002/health' }
  ];

  for (const service of services) {
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      try {
        await axios.get(service.url, { timeout: 1000 });
        console.log(`✅ ${service.name} is ready`);
        break;
      } catch (error) {
        attempts++;
        if (attempts === maxAttempts) {
          throw new Error(`Service ${service.name} not ready after ${maxAttempts} attempts`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}

/**
 * Setup test environment
 */
async function setupTestEnv() {
  const { app, mockDeps } = createTestApp();
  
  // Wait for Docker services to be ready
  try {
    await waitForDockerServices();
  } catch (error) {
    console.warn('Docker services not available, continuing with local test setup');
  }

  // Start the Express server for testing
  const server = app.listen(0); // Use port 0 to get any available port
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}`;

  return {
    app,
    server,
    baseUrl,
    mockDeps
  };
}

/**
 * Teardown test environment
 */
async function teardownTestEnv(testEnv) {
  if (testEnv && testEnv.server) {
    await new Promise((resolve) => {
      testEnv.server.close(resolve);
    });
  }
}

module.exports = {
  TestAPIClient,
  MockCertificateManager,
  createTestApp,
  waitForDockerServices,
  setupTestEnv,
  teardownTestEnv,
  startMockServices,
  stopMockServices
};
