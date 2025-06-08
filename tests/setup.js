/**
 * Jest Setup File
 * Configures the test environment and provides utilities for all tests
 */

// Extend Jest matchers
expect.extend({
  toBeValidCertificate(received) {
    const pass = received && 
                 typeof received.fingerprint === 'string' &&
                 typeof received.name === 'string' &&
                 Array.isArray(received._sans?.domains || []);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid certificate`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid certificate with fingerprint, name, and domains`,
        pass: false
      };
    }
  },

  toBeValidApiResponse(received) {
    const pass = received && 
                 typeof received === 'object' &&
                 received.hasOwnProperty('success') !== undefined;
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid API response`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid API response with success property`,
        pass: false
      };
    }
  }
});

// Global test utilities
global.testUtils = {
  // Create a test certificate payload
  createTestCertificate: (overrides = {}) => ({
    name: 'test-certificate',
    domains: ['test.example.com'],
    ips: [],
    certType: 'standard',
    autoRenew: false,
    renewDaysBeforeExpiry: 30,
    ...overrides
  }),

  // Create test deployment action
  createTestDeploymentAction: (type = 'npm', overrides = {}) => ({
    type,
    enabled: true,
    name: `Test ${type} deployment`,
    config: {
      host: 'localhost',
      port: type === 'npm' ? 3001 : 21,
      ...(type === 'npm' && { username: 'admin', password: 'changeme' }),
      ...(type === 'ftp' && { username: 'testuser', password: 'testpass' }),
      ...overrides.config
    },
    ...overrides
  }),

  // Wait for condition with timeout
  waitFor: async (condition, timeout = 5000, interval = 100) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  },

  // Generate random string for unique test data
  randomString: (length = 8) => {
    return Math.random().toString(36).substring(2, length + 2);
  }
};

// Mock console methods in tests to reduce noise
const originalConsole = { ...console };
global.mockConsole = () => {
  console.log = jest.fn();
  console.warn = jest.fn();
  console.error = jest.fn();
  console.info = jest.fn();
};

global.restoreConsole = () => {
  Object.assign(console, originalConsole);
};

// Increase test timeout for integration tests
jest.setTimeout(30000);
