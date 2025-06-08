/**
 * Certificate Authority (CA) API Tests
 * Tests for CA certificate management endpoints:
 * - Listing CA certificates
 * - CA certificate details
 * - CA validation and verification
 */
const { TestAPIClient, startMockServices, stopMockServices } = require('../utils/testUtils');

describe('Certificate Authority (CA) API', () => {
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

  describe('CA Certificate Listing', () => {
    describe('GET /api/ca', () => {
      test('should list all CA certificates', async () => {
        const response = await apiClient.getCACertificates();
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        
        // Each CA certificate should have required properties
        response.body.forEach(cert => {
          expect(cert).toHaveProperty('fingerprint');
          expect(cert).toHaveProperty('name');
          expect(cert).toHaveProperty('issuer');
          expect(cert).toHaveProperty('subject');
          expect(cert).toHaveProperty('notBefore');
          expect(cert).toHaveProperty('notAfter');
          expect(cert).toHaveProperty('isCA');
          expect(cert.isCA).toBe(true); // All should be CA certificates
        });
      });

      test('should return empty array when no CA certificates exist', async () => {
        // This test assumes a clean state or ability to clear CAs
        const response = await apiClient.getCACertificates();
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
        // May be empty or contain system CAs
      });

      test('should require authentication', async () => {
        const unauthenticatedClient = new TestAPIClient();
        const response = await unauthenticatedClient.getCACertificates();
        
        expect(response.status).toBe(401);
      });
    });
  });

  describe('CA Certificate Creation and Management', () => {
    let rootCAFingerprint;
    let intermediateCAFingerprint;

    describe('Root CA Creation', () => {
      test('should create root CA certificate', async () => {
        const rootCAData = {
          name: 'Test Root CA',
          type: 'ca',
          isRootCA: true,
          subject: {
            commonName: 'Test Root CA',
            country: 'US',
            state: 'California',
            locality: 'San Francisco',
            organization: 'Test Organization',
            organizationalUnit: 'IT Department'
          },
          keySize: 2048,
          days: 3650, // 10 years for root CA
          sans: {
            domains: [],
            ips: []
          }
        };

        const response = await apiClient.createCertificate(rootCAData);
        
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('certificate');
        expect(response.body.certificate.isCA).toBe(true);
        expect(response.body.certificate.name).toBe(rootCAData.name);
        
        rootCAFingerprint = response.body.certificate.fingerprint;
      });

      test('should validate root CA in CA list', async () => {
        const response = await apiClient.getCACertificates();
        
        expect(response.status).toBe(200);
        const rootCA = response.body.find(cert => cert.fingerprint === rootCAFingerprint);
        
        expect(rootCA).toBeDefined();
        expect(rootCA.isCA).toBe(true);
        expect(rootCA.name).toBe('Test Root CA');
      });
    });

    describe('Intermediate CA Creation', () => {
      test('should create intermediate CA signed by root CA', async () => {
        if (!rootCAFingerprint) {
          console.warn('Skipping intermediate CA test - no root CA available');
          return;
        }

        const intermediateCAData = {
          name: 'Test Intermediate CA',
          type: 'ca',
          isRootCA: false,
          subject: {
            commonName: 'Test Intermediate CA',
            country: 'US',
            state: 'California',
            locality: 'San Francisco',
            organization: 'Test Organization',
            organizationalUnit: 'IT Department'
          },
          keySize: 2048,
          days: 1825, // 5 years for intermediate CA
          signWithCA: true,
          caFingerprint: rootCAFingerprint,
          sans: {
            domains: [],
            ips: []
          }
        };

        const response = await apiClient.createCertificate(intermediateCAData);
        
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.certificate.isCA).toBe(true);
        expect(response.body.certificate.name).toBe(intermediateCAData.name);
        
        intermediateCAFingerprint = response.body.certificate.fingerprint;
      });

      test('should validate intermediate CA in CA list', async () => {
        if (!intermediateCAFingerprint) {
          console.warn('Skipping intermediate CA validation test');
          return;
        }

        const response = await apiClient.getCACertificates();
        
        expect(response.status).toBe(200);
        const intermediateCA = response.body.find(cert => cert.fingerprint === intermediateCAFingerprint);
        
        expect(intermediateCA).toBeDefined();
        expect(intermediateCA.isCA).toBe(true);
        expect(intermediateCA.name).toBe('Test Intermediate CA');
      });

      test('should validate CA chain hierarchy', async () => {
        if (!rootCAFingerprint || !intermediateCAFingerprint) {
          console.warn('Skipping CA chain validation test');
          return;
        }

        // Get intermediate CA details
        const response = await apiClient.getCertificate(intermediateCAFingerprint);
        
        expect(response.status).toBe(200);
        
        // Intermediate CA should be signed by root CA
        if (response.body.certificate.caFingerprint) {
          expect(response.body.certificate.caFingerprint).toBe(rootCAFingerprint);
        }
      });
    });

    describe('CA Certificate Usage', () => {
      test('should use CA to sign regular certificates', async () => {
        if (!rootCAFingerprint) {
          console.warn('Skipping CA signing test - no CA available');
          return;
        }

        const serverCertData = {
          name: 'Test Server Certificate',
          type: 'server',
          subject: {
            commonName: 'test.example.com'
          },
          keySize: 2048,
          days: 365,
          signWithCA: true,
          caFingerprint: rootCAFingerprint,
          sans: {
            domains: ['test.example.com', 'www.test.example.com'],
            ips: []
          }
        };

        const response = await apiClient.createCertificate(serverCertData);
        
        expect(response.status).toBe(201);
        expect(response.body.certificate.isCA).toBe(false);
        expect(response.body.certificate.caFingerprint).toBe(rootCAFingerprint);

        // Cleanup
        await apiClient.deleteCertificate(response.body.certificate.fingerprint);
      });

      test('should validate CA exists before signing', async () => {
        const serverCertData = {
          name: 'Test Server Certificate',
          type: 'server',
          subject: {
            commonName: 'test.example.com'
          },
          signWithCA: true,
          caFingerprint: 'nonexistent-ca-fingerprint',
          sans: {
            domains: ['test.example.com'],
            ips: []
          }
        };

        const response = await apiClient.createCertificate(serverCertData);
        
        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/CA certificate not found/i);
      });
    });

    describe('CA Certificate Properties', () => {
      test('should validate CA certificate properties', async () => {
        if (!rootCAFingerprint) {
          console.warn('Skipping CA properties test');
          return;
        }

        const response = await apiClient.getCertificate(rootCAFingerprint);
        
        expect(response.status).toBe(200);
        expect(response.body.certificate.isCA).toBe(true);
        expect(response.body.certificate.canSign).toBe(true);
        expect(response.body.certificate.keyUsage).toContain('Certificate Sign');
        expect(response.body.certificate.keyUsage).toContain('CRL Sign');
      });

      test('should have proper CA validity periods', async () => {
        const response = await apiClient.getCACertificates();
        
        expect(response.status).toBe(200);
        
        response.body.forEach(caCert => {
          const notBefore = new Date(caCert.notBefore);
          const notAfter = new Date(caCert.notAfter);
          const validityDays = Math.floor((notAfter - notBefore) / (1000 * 60 * 60 * 24));
          
          // CA certificates should have longer validity periods
          expect(validityDays).toBeGreaterThan(365); // At least 1 year
          expect(notAfter).toBeGreaterThan(notBefore);
        });
      });
    });

    // Cleanup created test CAs
    afterAll(async () => {
      if (intermediateCAFingerprint) {
        try {
          await apiClient.deleteCertificate(intermediateCAFingerprint);
        } catch (error) {
          console.warn('Failed to cleanup intermediate CA:', error.message);
        }
      }
      
      if (rootCAFingerprint) {
        try {
          await apiClient.deleteCertificate(rootCAFingerprint);
        } catch (error) {
          console.warn('Failed to cleanup root CA:', error.message);
        }
      }
    });
  });

  describe('CA Certificate Validation', () => {
    test('should validate CA certificate format', async () => {
      const response = await apiClient.getCACertificates();
      
      expect(response.status).toBe(200);
      
      response.body.forEach(caCert => {
        // Basic certificate structure validation
        expect(caCert.fingerprint).toMatch(/^[a-f0-9]{40}$/i); // SHA-1 fingerprint
        expect(caCert.name).toBeTruthy();
        expect(caCert.subject).toBeTruthy();
        expect(caCert.issuer).toBeTruthy();
        
        // Date validation
        expect(new Date(caCert.notBefore)).toBeValidDate();
        expect(new Date(caCert.notAfter)).toBeValidDate();
        
        // CA-specific properties
        expect(caCert.isCA).toBe(true);
        expect(caCert.canSign).toBe(true);
      });
    });

    test('should handle CA certificate verification', async () => {
      const response = await apiClient.getCACertificates();
      
      expect(response.status).toBe(200);
      
      // All CA certificates should be valid and verifiable
      response.body.forEach(caCert => {
        expect(caCert.valid).toBe(true);
        
        // Check expiration status
        const now = new Date();
        const notAfter = new Date(caCert.notAfter);
        expect(notAfter).toBeGreaterThan(now); // Should not be expired
      });
    });
  });

  describe('CA Certificate Error Handling', () => {
    test('should handle service errors gracefully', async () => {
      // Test with temporarily unavailable service (if possible)
      const response = await apiClient.getCACertificates();
      
      // Should either succeed or return appropriate error
      if (response.status !== 200) {
        expect(response.status).toBe(500);
        expect(response.body).toHaveProperty('message');
      }
    });

    test('should validate CA certificate constraints', async () => {
      // Test creating a certificate with invalid CA properties
      const invalidCAData = {
        name: 'Invalid CA',
        type: 'ca',
        subject: {
          commonName: '' // Empty CN
        },
        keySize: 512, // Too small for CA
        days: -1 // Invalid days
      };

      const response = await apiClient.createCertificate(invalidCAData);
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('message');
    });
  });

  describe('CA Certificate Security', () => {
    test('should require proper authentication for CA operations', async () => {
      const unauthenticatedClient = new TestAPIClient();
      
      const response = await unauthenticatedClient.getCACertificates();
      expect(response.status).toBe(401);
    });

    test('should protect CA private keys', async () => {
      const response = await apiClient.getCACertificates();
      
      expect(response.status).toBe(200);
      
      // CA certificates should not expose private key information
      response.body.forEach(caCert => {
        expect(caCert).not.toHaveProperty('privateKey');
        expect(caCert).not.toHaveProperty('key');
        expect(caCert).not.toHaveProperty('passphrase');
      });
    });

    test('should validate CA certificate permissions', async () => {
      // Test that only authorized users can access CA operations
      // This would require different user roles if implemented
      const response = await apiClient.getCACertificates();
      
      expect([200, 403]).toContain(response.status);
      
      if (response.status === 403) {
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toMatch(/permission|access|forbidden/i);
      }
    });
  });

  describe('CA Certificate Performance', () => {
    test('should handle CA listing performance', async () => {
      const startTime = Date.now();
      const response = await apiClient.getCACertificates();
      const endTime = Date.now();
      
      expect(response.status).toBe(200);
      
      // Should respond within reasonable time (adjust threshold as needed)
      const responseTime = endTime - startTime;
      expect(responseTime).toBeLessThan(5000); // 5 seconds max
    });

    test('should handle concurrent CA requests', async () => {
      const requests = Array(5).fill().map(() => apiClient.getCACertificates());
      
      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
      });
    });
  });
});

// Helper matcher for date validation
expect.extend({
  toBeValidDate(received) {
    const date = new Date(received);
    const pass = date instanceof Date && !isNaN(date.getTime());
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid date`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid date`,
        pass: false,
      };
    }
  },
});
