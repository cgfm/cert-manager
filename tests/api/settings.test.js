/**
 * Settings API Tests
 * Tests for all settings management endpoints including:
 * - General settings
 * - Certificate settings  
 * - Deployment settings (email, NPM, Docker)
 * - Renewal settings
 * - Logging settings
 */
const { TestAPIClient, startMockServices, stopMockServices } = require('../utils/testUtils');

describe('Settings API', () => {
  let apiClient;
  let mockServices;

  beforeAll(async () => {
    mockServices = await startMockServices();
    apiClient = new TestAPIClient();
    await apiClient.login();
  });

  afterAll(async () => {
    if (mockServices) {
      await stopMockServices(mockServices);
    }
  });

  describe('General Settings', () => {
    describe('GET /api/settings', () => {
      test('should get all settings', async () => {
        const response = await apiClient.getSettings();
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('validity');
        expect(response.body).toHaveProperty('renewBefore');
        expect(response.body).toHaveProperty('keySize');
      });

      test('should handle settings retrieval errors', async () => {
        // Test error handling by making request with invalid session
        const unauthenticatedClient = new TestAPIClient();
        const response = await unauthenticatedClient.getSettings();
        
        expect(response.status).toBe(401);
      });
    });

    describe('PATCH /api/settings', () => {
      test('should update general settings', async () => {
        const settingsUpdate = {
          validity: 730,
          renewBefore: 45,
          keySize: 4096
        };

        const response = await apiClient.updateSettings(settingsUpdate);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      });

      test('should validate setting values', async () => {
        const invalidSettings = {
          validity: -1, // Invalid negative value
          renewBefore: 'invalid', // Invalid type
          keySize: 1024 // Potentially weak key size
        };

        const response = await apiClient.updateSettings(invalidSettings);
        
        expect(response.status).toBe(400);
      });
    });
  });

  describe('Certificate Settings', () => {
    describe('GET /api/settings/certificates', () => {
      test('should get certificate-specific settings', async () => {
        const response = await apiClient.getCertificateSettings();
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('validity');
        expect(response.body).toHaveProperty('renewBefore');
        expect(response.body).toHaveProperty('keySize');
        expect(response.body).toHaveProperty('preferredChallenge');
        expect(response.body).toHaveProperty('autoRenew');
      });
    });

    describe('PATCH /api/settings/certificates', () => {
      test('should update certificate settings', async () => {
        const certificateSettings = {
          validity: 365,
          renewBefore: 30,
          keySize: 2048,
          preferredChallenge: 'http-01',
          autoRenew: true
        };

        const response = await apiClient.updateCertificateSettings(certificateSettings);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.settings).toMatchObject(certificateSettings);
      });

      test('should validate certificate setting types', async () => {
        const invalidSettings = {
          validity: 'invalid',
          renewBefore: -10,
          keySize: 512, // Too small
          preferredChallenge: 'invalid-challenge'
        };

        const response = await apiClient.updateCertificateSettings(invalidSettings);
        
        expect(response.status).toBe(400);
      });
    });
  });

  describe('Deployment Settings', () => {
    describe('GET /api/settings/deployment', () => {
      test('should get deployment settings with masked passwords', async () => {
        const response = await apiClient.getDeploymentSettings();
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('deployment');
        expect(response.body.deployment).toHaveProperty('email');
        expect(response.body.deployment).toHaveProperty('nginxProxyManager');
        expect(response.body.deployment).toHaveProperty('dockerDefaults');
        
        // Passwords should be masked
        if (response.body.deployment.email?.smtp?.password) {
          expect(response.body.deployment.email.smtp.password).toBe('••••••••');
        }
        if (response.body.deployment.nginxProxyManager?.password) {
          expect(response.body.deployment.nginxProxyManager.password).toBe('••••••••');
        }
      });
    });

    describe('PUT /api/settings/deployment', () => {
      test('should update all deployment settings', async () => {
        const deploymentSettings = {
          deployment: {
            email: {
              smtp: {
                host: 'smtp.gmail.com',
                port: 587,
                secure: false,
                user: 'test@example.com',
                password: 'test-password',
                from: 'Test <test@example.com>'
              }
            },
            nginxProxyManager: {
              host: 'npm.local',
              port: 81,
              useHttps: false,
              username: 'admin',
              password: 'npm-password'
            },
            dockerDefaults: {
              socketPath: '/var/run/docker.sock',
              host: '',
              port: 2375,
              useTLS: false
            }
          }
        };

        const response = await apiClient.updateDeploymentSettings(deploymentSettings);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.deployment.email.smtp.password).toBe('••••••••'); // Should be masked
      });
    });

    describe('Email Settings', () => {
      describe('PUT /api/settings/deployment/email', () => {
        test('should update email settings', async () => {
          const emailSettings = {
            smtp: {
              host: 'smtp.gmail.com',
              port: 587,
              secure: false,
              user: 'test@example.com',
              password: 'test-password',
              from: 'Test <test@example.com>'
            }
          };

          const response = await apiClient.updateEmailSettings(emailSettings);
          
          expect(response.status).toBe(200);
          expect(response.body).toHaveProperty('success', true);
          expect(response.body.email.smtp.password).toBe('••••••••');
        });

        test('should validate required email fields', async () => {
          const invalidEmailSettings = {
            smtp: {
              // Missing required host
              port: 587,
              user: 'test@example.com'
            }
          };

          const response = await apiClient.updateEmailSettings(invalidEmailSettings);
          
          expect(response.status).toBe(400);
        });
      });

      describe('POST /api/settings/deployment/email/test', () => {
        test('should test email settings with mock SMTP server', async () => {
          const testEmailData = {
            smtp: {
              host: 'localhost',
              port: 1025, // Mock SMTP server port
              secure: false,
              user: 'test@example.com',
              password: 'test-password'
            },
            recipient: 'recipient@example.com'
          };

          const response = await apiClient.testEmailSettings(testEmailData);
          
          expect(response.status).toBe(200);
          expect(response.body).toHaveProperty('success', true);
          expect(response.body).toHaveProperty('messageId');
        });

        test('should handle SMTP connection failures', async () => {
          const testEmailData = {
            smtp: {
              host: 'invalid-smtp-server',
              port: 587,
              secure: false,
              user: 'test@example.com',
              password: 'invalid-password'
            },
            recipient: 'recipient@example.com'
          };

          const response = await apiClient.testEmailSettings(testEmailData);
          
          expect(response.status).toBe(500);
          expect(response.body).toHaveProperty('success', false);
        });
      });
    });

    describe('NPM (Nginx Proxy Manager) Settings', () => {
      describe('PUT /api/settings/deployment/nginx-proxy-manager', () => {
        test('should update NPM settings', async () => {
          const npmSettings = {
            host: 'localhost',
            port: 3001, // Mock NPM server port
            useHttps: false,
            username: 'admin@example.com',
            password: 'changeme'
          };

          const response = await apiClient.updateNPMSettings(npmSettings);
          
          expect(response.status).toBe(200);
          expect(response.body).toHaveProperty('success', true);
          expect(response.body.nginxProxyManager.password).toBe('••••••••');
        });

        test('should validate NPM settings', async () => {
          const invalidNPMSettings = {
            // Missing required host
            port: 81,
            username: 'admin'
          };

          const response = await apiClient.updateNPMSettings(invalidNPMSettings);
          
          expect(response.status).toBe(400);
        });
      });

      describe('POST /api/settings/deployment/nginx-proxy-manager/test', () => {
        test('should test NPM connection with mock server', async () => {
          const npmSettings = {
            host: 'localhost',
            port: 3001, // Mock NPM server port
            useHttps: false,
            username: 'admin@example.com',
            password: 'changeme'
          };

          const response = await apiClient.testNPMConnection(npmSettings);
          
          expect(response.status).toBe(200);
          expect(response.body).toHaveProperty('success', true);
          expect(response.body).toHaveProperty('certificates');
        });

        test('should handle NPM connection failures', async () => {
          const npmSettings = {
            host: 'invalid-npm-host',
            port: 81,
            useHttps: false,
            username: 'admin',
            password: 'invalid'
          };

          const response = await apiClient.testNPMConnection(npmSettings);
          
          expect(response.status).toBe(500);
          expect(response.body).toHaveProperty('success', false);
        });
      });
    });

    describe('Docker Settings', () => {
      test('should update Docker settings', async () => {
        const dockerSettings = {
          socketPath: '/var/run/docker.sock',
          host: 'docker.local',
          port: 2376,
          useTLS: true
        };

        const response = await apiClient.updateDockerSettings(dockerSettings);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.dockerDefaults).toMatchObject(dockerSettings);
      });
    });
  });

  describe('Renewal Settings', () => {
    describe('GET /api/settings/renewal', () => {
      test('should get renewal settings', async () => {
        const response = await apiClient.getRenewalSettings();
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('enableAutoRenewalJob');
        expect(response.body).toHaveProperty('renewalSchedule');
        expect(response.body).toHaveProperty('renewDaysBeforeExpiry');
        expect(response.body).toHaveProperty('enableFileWatch');
        expect(response.body).toHaveProperty('includeIdleDomainsOnRenewal');
        expect(response.body).toHaveProperty('caValidityPeriod');
      });
    });

    describe('PUT /api/settings/renewal', () => {
      test('should update renewal settings', async () => {
        const renewalSettings = {
          enableAutoRenewalJob: true,
          renewalSchedule: '0 2 * * *', // Daily at 2 AM
          renewDaysBeforeExpiry: 30,
          enableFileWatch: true,
          includeIdleDomainsOnRenewal: false,
          caValidityPeriod: {
            rootCA: 3650,
            intermediateCA: 1825,
            standard: 365
          }
        };

        const response = await apiClient.updateRenewalSettings(renewalSettings);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.renewalSettings).toMatchObject(renewalSettings);
      });

      test('should validate cron schedule format', async () => {
        const invalidRenewalSettings = {
          renewalSchedule: 'invalid-cron' // Invalid cron format
        };

        const response = await apiClient.updateRenewalSettings(invalidRenewalSettings);
        
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toContain('Invalid cron schedule format');
      });

      test('should validate validity periods', async () => {
        const invalidRenewalSettings = {
          renewDaysBeforeExpiry: -1, // Invalid negative value
          caValidityPeriod: {
            rootCA: 'invalid', // Invalid type
            intermediateCA: -100, // Invalid negative
            standard: 0 // Invalid zero
          }
        };

        const response = await apiClient.updateRenewalSettings(invalidRenewalSettings);
        
        expect(response.status).toBe(400);
      });
    });
  });

  describe('Logging Settings', () => {
    test('should update logging configuration', async () => {
      const loggingSettings = {
        level: 'debug',
        enableFileLogging: true,
        maxLogFiles: 10,
        maxLogSize: '10m'
      };

      const response = await apiClient.updateLoggingSettings(loggingSettings);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);
    });

    test('should validate logging levels', async () => {
      const invalidLoggingSettings = {
        level: 'invalid-level'
      };

      const response = await apiClient.updateLoggingSettings(invalidLoggingSettings);
      
      expect(response.status).toBe(400);
    });
  });

  describe('Settings Security', () => {
    test('should require authentication for all settings endpoints', async () => {
      const unauthenticatedClient = new TestAPIClient();
      
      const responses = await Promise.all([
        unauthenticatedClient.getSettings(),
        unauthenticatedClient.updateSettings({}),
        unauthenticatedClient.getDeploymentSettings(),
        unauthenticatedClient.updateDeploymentSettings({})
      ]);

      responses.forEach(response => {
        expect(response.status).toBe(401);
      });
    });

    test('should mask sensitive information in responses', async () => {
      // First set some settings with passwords
      await apiClient.updateEmailSettings({
        smtp: {
          host: 'smtp.gmail.com',
          port: 587,
          user: 'test@example.com',
          password: 'secret-password'
        }
      });

      // Then get settings and verify passwords are masked
      const response = await apiClient.getDeploymentSettings();
      
      expect(response.status).toBe(200);
      if (response.body.deployment?.email?.smtp?.password) {
        expect(response.body.deployment.email.smtp.password).toBe('••••••••');
      }
    });
  });

  describe('Settings Persistence', () => {
    test('should persist settings between requests', async () => {
      const testSettings = {
        validity: 730,
        renewBefore: 45
      };

      // Update settings
      await apiClient.updateSettings(testSettings);

      // Get settings and verify they persisted
      const response = await apiClient.getSettings();
      
      expect(response.status).toBe(200);
      expect(response.body.validity).toBe(testSettings.validity);
      expect(response.body.renewBefore).toBe(testSettings.renewBefore);
    });
  });
});
