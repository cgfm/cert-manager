const request = require('supertest');
const express = require('express');
const setupRouter = require('../../src/api/routes/setup');
const setupService = require('../../src/services/setup-service');
const configService = require('../../src/services/config-service');

// Mock the services
jest.mock('../../src/services/setup-service');
jest.mock('../../src/services/config-service');

describe('Setup API', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/setup', setupRouter);
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /api/setup/status', () => {
    it('should return setup status when not completed', async () => {
      const mockStatus = {
        isSetupComplete: false,
        steps: {
          database: false,
          admin_user: false,
          initial_config: false,
          certificates_dir: false
        },
        currentStep: 'database',
        totalSteps: 4,
        completedSteps: 0
      };

      setupService.getSetupStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/api/setup/status')
        .expect(200);

      expect(response.body).toEqual(mockStatus);
      expect(response.body.isSetupComplete).toBe(false);
    });

    it('should return setup status when completed', async () => {
      const mockStatus = {
        isSetupComplete: true,
        steps: {
          database: true,
          admin_user: true,
          initial_config: true,
          certificates_dir: true
        },
        currentStep: null,
        totalSteps: 4,
        completedSteps: 4,
        completedAt: new Date().toISOString()
      };

      setupService.getSetupStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/api/setup/status')
        .expect(200);

      expect(response.body.isSetupComplete).toBe(true);
      expect(response.body.completedSteps).toBe(4);
    });

    it('should handle service errors', async () => {
      setupService.getSetupStatus.mockRejectedValue(new Error('Setup service unavailable'));

      const response = await request(app)
        .get('/api/setup/status')
        .expect(500);

      expect(response.body.error).toBe('Failed to get setup status');
    });
  });

  describe('POST /api/setup/initialize', () => {
    it('should initialize setup successfully', async () => {
      const initData = {
        adminUser: {
          username: 'admin',
          email: 'admin@example.com',
          password: 'SecurePassword123!'
        },
        database: {
          type: 'sqlite',
          path: '/data/certmanager.db'
        },
        certificatesDir: '/data/certificates',
        settings: {
          hostname: 'cert-manager.example.com',
          port: 3000,
          enableHttps: true
        }
      };

      const mockResult = {
        success: true,
        message: 'Setup initialized successfully',
        setupId: 'setup-123',
        nextStep: 'database'
      };

      setupService.initializeSetup.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/setup/initialize')
        .send(initData)
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(setupService.initializeSetup).toHaveBeenCalledWith(initData);
    });

    it('should validate required admin user fields', async () => {
      const incompleteData = {
        adminUser: {
          username: 'admin'
          // missing email and password
        }
      };

      const response = await request(app)
        .post('/api/setup/initialize')
        .send(incompleteData)
        .expect(400);

      expect(response.body.error).toContain('Admin user email is required');
    });

    it('should validate password strength', async () => {
      const weakPasswordData = {
        adminUser: {
          username: 'admin',
          email: 'admin@example.com',
          password: '123'
        }
      };

      const response = await request(app)
        .post('/api/setup/initialize')
        .send(weakPasswordData)
        .expect(400);

      expect(response.body.error).toContain('Password must be at least 8 characters');
    });

    it('should validate email format', async () => {
      const invalidEmailData = {
        adminUser: {
          username: 'admin',
          email: 'invalid-email',
          password: 'SecurePassword123!'
        }
      };

      const response = await request(app)
        .post('/api/setup/initialize')
        .send(invalidEmailData)
        .expect(400);

      expect(response.body.error).toContain('Invalid email format');
    });

    it('should validate database configuration', async () => {
      const invalidDbData = {
        adminUser: {
          username: 'admin',
          email: 'admin@example.com',
          password: 'SecurePassword123!'
        },
        database: {
          type: 'unsupported'
        }
      };

      const response = await request(app)
        .post('/api/setup/initialize')
        .send(invalidDbData)
        .expect(400);

      expect(response.body.error).toContain('Unsupported database type');
    });

    it('should handle setup initialization errors', async () => {
      const validData = {
        adminUser: {
          username: 'admin',
          email: 'admin@example.com',
          password: 'SecurePassword123!'
        }
      };

      setupService.initializeSetup.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/setup/initialize')
        .send(validData)
        .expect(500);

      expect(response.body.error).toBe('Setup initialization failed');
    });
  });

  describe('POST /api/setup/step/:stepName', () => {
    it('should complete database setup step', async () => {
      const dbConfig = {
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        database: 'certmanager',
        username: 'certmgr',
        password: 'dbpassword'
      };

      const mockResult = {
        success: true,
        message: 'Database configured successfully',
        nextStep: 'admin_user'
      };

      setupService.completeStep.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/setup/step/database')
        .send(dbConfig)
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(setupService.completeStep).toHaveBeenCalledWith('database', dbConfig);
    });

    it('should complete admin user setup step', async () => {
      const adminConfig = {
        username: 'admin',
        email: 'admin@example.com',
        password: 'SecurePassword123!',
        firstName: 'Admin',
        lastName: 'User'
      };

      const mockResult = {
        success: true,
        message: 'Admin user created successfully',
        nextStep: 'initial_config'
      };

      setupService.completeStep.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/setup/step/admin_user')
        .send(adminConfig)
        .expect(200);

      expect(response.body).toEqual(mockResult);
    });

    it('should complete initial configuration step', async () => {
      const initialConfig = {
        hostname: 'cert-manager.example.com',
        port: 3000,
        enableHttps: true,
        certificateProvider: 'letsencrypt',
        defaultAcmeServer: 'https://acme-v02.api.letsencrypt.org/directory'
      };

      const mockResult = {
        success: true,
        message: 'Initial configuration saved',
        nextStep: 'certificates_dir'
      };

      setupService.completeStep.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/setup/step/initial_config')
        .send(initialConfig)
        .expect(200);

      expect(response.body).toEqual(mockResult);
    });

    it('should complete certificates directory setup', async () => {
      const certDirConfig = {
        certificatesDir: '/data/certificates',
        createDirectory: true,
        permissions: '755'
      };

      const mockResult = {
        success: true,
        message: 'Certificates directory configured',
        nextStep: null,
        setupComplete: true
      };

      setupService.completeStep.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/setup/step/certificates_dir')
        .send(certDirConfig)
        .expect(200);

      expect(response.body.setupComplete).toBe(true);
    });

    it('should handle invalid step names', async () => {
      const response = await request(app)
        .post('/api/setup/step/invalid_step')
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Invalid setup step');
    });

    it('should handle step completion errors', async () => {
      setupService.completeStep.mockRejectedValue(new Error('Step completion failed'));

      const response = await request(app)
        .post('/api/setup/step/database')
        .send({ type: 'sqlite' })
        .expect(500);

      expect(response.body.error).toBe('Failed to complete setup step');
    });
  });

  describe('GET /api/setup/requirements', () => {
    it('should return system requirements check', async () => {
      const mockRequirements = {
        system: {
          nodeVersion: {
            current: '18.17.0',
            required: '>=16.0.0',
            satisfied: true
          },
          diskSpace: {
            available: '10GB',
            required: '1GB',
            satisfied: true
          },
          memory: {
            available: '4GB',
            required: '512MB',
            satisfied: true
          }
        },
        dependencies: {
          sqlite: {
            available: true,
            version: '3.39.0'
          },
          openssl: {
            available: true,
            version: '1.1.1'
          }
        },
        permissions: {
          writeAccess: true,
          executePermissions: true
        },
        allRequirementsMet: true
      };

      setupService.checkRequirements.mockResolvedValue(mockRequirements);

      const response = await request(app)
        .get('/api/setup/requirements')
        .expect(200);

      expect(response.body).toEqual(mockRequirements);
      expect(response.body.allRequirementsMet).toBe(true);
    });

    it('should return failed requirements', async () => {
      const mockRequirements = {
        system: {
          nodeVersion: {
            current: '14.0.0',
            required: '>=16.0.0',
            satisfied: false
          },
          diskSpace: {
            available: '500MB',
            required: '1GB',
            satisfied: false
          }
        },
        allRequirementsMet: false,
        errors: [
          'Node.js version 16 or higher is required',
          'Insufficient disk space'
        ]
      };

      setupService.checkRequirements.mockResolvedValue(mockRequirements);

      const response = await request(app)
        .get('/api/setup/requirements')
        .expect(200);

      expect(response.body.allRequirementsMet).toBe(false);
      expect(response.body.errors).toHaveLength(2);
    });
  });

  describe('POST /api/setup/test-database', () => {
    it('should test database connection successfully', async () => {
      const dbConfig = {
        type: 'postgres',
        host: 'localhost',
        port: 5432,
        database: 'certmanager',
        username: 'user',
        password: 'pass'
      };

      const mockResult = {
        success: true,
        message: 'Database connection successful',
        responseTime: 45,
        version: 'PostgreSQL 14.5'
      };

      setupService.testDatabaseConnection.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/setup/test-database')
        .send(dbConfig)
        .expect(200);

      expect(response.body).toEqual(mockResult);
    });

    it('should handle database connection failures', async () => {
      const dbConfig = {
        type: 'postgres',
        host: 'invalid-host',
        port: 5432,
        database: 'certmanager',
        username: 'user',
        password: 'pass'
      };

      const mockResult = {
        success: false,
        message: 'Connection failed',
        error: 'ENOTFOUND invalid-host'
      };

      setupService.testDatabaseConnection.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/setup/test-database')
        .send(dbConfig)
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should validate database configuration', async () => {
      const invalidConfig = {
        type: 'postgres'
        // missing required fields
      };

      const response = await request(app)
        .post('/api/setup/test-database')
        .send(invalidConfig)
        .expect(400);

      expect(response.body.error).toContain('Database host is required');
    });
  });

  describe('GET /api/setup/config-template', () => {
    it('should return configuration template', async () => {
      const mockTemplate = {
        database: {
          type: {
            type: 'string',
            required: true,
            options: ['sqlite', 'postgres', 'mysql'],
            default: 'sqlite'
          },
          host: {
            type: 'string',
            required: false,
            description: 'Database host (not needed for SQLite)'
          },
          port: {
            type: 'number',
            required: false,
            default: 5432
          }
        },
        server: {
          port: {
            type: 'number',
            required: true,
            default: 3000,
            min: 1024,
            max: 65535
          },
          hostname: {
            type: 'string',
            required: true,
            description: 'Server hostname or IP address'
          }
        }
      };

      configService.getConfigTemplate.mockResolvedValue(mockTemplate);

      const response = await request(app)
        .get('/api/setup/config-template')
        .expect(200);

      expect(response.body).toEqual(mockTemplate);
    });

    it('should handle template generation errors', async () => {
      configService.getConfigTemplate.mockRejectedValue(new Error('Template generation failed'));

      const response = await request(app)
        .get('/api/setup/config-template')
        .expect(500);

      expect(response.body.error).toBe('Failed to get configuration template');
    });
  });

  describe('POST /api/setup/validate-config', () => {
    it('should validate configuration successfully', async () => {
      const config = {
        database: {
          type: 'sqlite',
          path: '/data/certmanager.db'
        },
        server: {
          port: 3000,
          hostname: 'localhost'
        }
      };

      const mockResult = {
        valid: true,
        errors: [],
        warnings: []
      };

      configService.validateConfig.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/setup/validate-config')
        .send(config)
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.errors).toHaveLength(0);
    });

    it('should return validation errors', async () => {
      const invalidConfig = {
        database: {
          type: 'postgres'
          // missing host
        },
        server: {
          port: 80 // privileged port
        }
      };

      const mockResult = {
        valid: false,
        errors: [
          'Database host is required for PostgreSQL',
          'Port 80 requires root privileges'
        ],
        warnings: []
      };

      configService.validateConfig.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/setup/validate-config')
        .send(invalidConfig)
        .expect(400);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors).toHaveLength(2);
    });
  });

  describe('POST /api/setup/finalize', () => {
    it('should finalize setup successfully', async () => {
      const mockResult = {
        success: true,
        message: 'Setup completed successfully',
        redirectUrl: '/dashboard'
      };

      setupService.finalizeSetup.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/setup/finalize')
        .expect(200);

      expect(response.body).toEqual(mockResult);
    });

    it('should handle setup not ready for finalization', async () => {
      setupService.finalizeSetup.mockRejectedValue(new Error('Setup not complete'));

      const response = await request(app)
        .post('/api/setup/finalize')
        .expect(400);

      expect(response.body.error).toBe('Cannot finalize incomplete setup');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed JSON in setup requests', async () => {
      const response = await request(app)
        .post('/api/setup/initialize')
        .send('invalid-json')
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.body.error).toContain('Invalid JSON');
    });

    it('should handle extremely large configuration payloads', async () => {
      const largeConfig = {
        adminUser: {
          username: 'admin',
          email: 'admin@example.com',
          password: 'SecurePassword123!',
          notes: 'x'.repeat(1000000) // 1MB of data
        }
      };

      const response = await request(app)
        .post('/api/setup/initialize')
        .send(largeConfig)
        .expect(400);

      expect(response.body.error).toContain('Request too large');
    });

    it('should handle concurrent setup initialization attempts', async () => {
      const setupData = {
        adminUser: {
          username: 'admin',
          email: 'admin@example.com',
          password: 'SecurePassword123!'
        }
      };

      setupService.initializeSetup
        .mockResolvedValueOnce({ success: true, setupId: 'setup-1' })
        .mockRejectedValue(new Error('Setup already in progress'));

      const requests = [
        request(app).post('/api/setup/initialize').send(setupData),
        request(app).post('/api/setup/initialize').send(setupData)
      ];

      const responses = await Promise.allSettled(requests);

      expect(responses[0].status).toBe('fulfilled');
      expect(responses[1].status).toBe('fulfilled');
      expect(responses[1].value.status).toBe(409); // Conflict
    });
  });

  describe('Security Tests', () => {
    it('should sanitize sensitive data in error messages', async () => {
      const setupData = {
        adminUser: {
          username: 'admin',
          email: 'admin@example.com',
          password: 'SecurePassword123!'
        },
        database: {
          password: 'secret-db-password'
        }
      };

      setupService.initializeSetup.mockRejectedValue(
        new Error('Database connection failed with password: secret-db-password')
      );

      const response = await request(app)
        .post('/api/setup/initialize')
        .send(setupData)
        .expect(500);

      expect(response.body.error).not.toContain('secret-db-password');
      expect(response.body.error).toBe('Setup initialization failed');
    });

    it('should validate password strength requirements', async () => {
      const weakPasswords = [
        '123',
        'password',
        'admin123',
        '12345678'
      ];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/setup/initialize')
          .send({
            adminUser: {
              username: 'admin',
              email: 'admin@example.com',
              password
            }
          })
          .expect(400);

        expect(response.body.error).toContain('Password');
      }
    });

    it('should prevent SQL injection in database configuration', async () => {
      const maliciousConfig = {
        type: 'postgres',
        host: "localhost'; DROP TABLE users; --",
        database: 'certmanager',
        username: 'user',
        password: 'pass'
      };

      const response = await request(app)
        .post('/api/setup/test-database')
        .send(maliciousConfig)
        .expect(400);

      expect(response.body.error).toContain('Invalid database host');
    });

    it('should limit failed setup attempts', async () => {
      const invalidData = { invalid: 'data' };

      // Make multiple failed attempts
      for (let i = 0; i < 6; i++) {
        await request(app)
          .post('/api/setup/initialize')
          .send(invalidData);
      }

      const response = await request(app)
        .post('/api/setup/initialize')
        .send(invalidData)
        .expect(429);

      expect(response.body.error).toContain('Too many attempts');
    });
  });

  describe('Performance Tests', () => {
    it('should complete requirements check quickly', async () => {
      const mockRequirements = {
        allRequirementsMet: true,
        system: { nodeVersion: { satisfied: true } }
      };

      setupService.checkRequirements.mockResolvedValue(mockRequirements);

      const startTime = Date.now();
      await request(app)
        .get('/api/setup/requirements')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Less than 1 second
    });

    it('should handle database connection tests with timeout', async () => {
      setupService.testDatabaseConnection.mockImplementation(() =>
        new Promise(resolve => setTimeout(resolve, 6000)) // 6 second delay
      );

      const response = await request(app)
        .post('/api/setup/test-database')
        .send({
          type: 'postgres',
          host: 'slow-host',
          database: 'test'
        })
        .timeout(5000)
        .expect(500);

      expect(response.body.error).toBe('Database connection test timeout');
    });
  });
});
