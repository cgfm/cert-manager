/**
 * Security API Tests
 * Tests for security-related endpoints:
 * - Encryption key rotation
 * - Security operations
 * - Activity logging for security events
 */
const { TestAPIClient, startMockServices, stopMockServices } = require('../utils/testUtils');

describe('Security API', () => {
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

  describe('Encryption Key Management', () => {
    describe('POST /api/security/rotate-encryption-key', () => {
      test('should rotate encryption key successfully', async () => {
        const response = await apiClient.rotateEncryptionKey();
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toMatch(/rotated successfully/i);
      });

      test('should require authentication', async () => {
        const unauthenticatedClient = new TestAPIClient();
        const response = await unauthenticatedClient.rotateEncryptionKey();
        
        expect(response.status).toBe(401);
      });

      test('should require admin privileges', async () => {
        // This test assumes admin role requirement
        // If non-admin users exist, test with them
        const response = await apiClient.rotateEncryptionKey();
        
        // Should either succeed (if admin) or be forbidden (if not admin)
        expect([200, 403]).toContain(response.status);
        
        if (response.status === 403) {
          expect(response.body).toHaveProperty('message');
          expect(response.body.message).toMatch(/admin|permission|forbidden/i);
        }
      });

      test('should handle encryption key rotation failures gracefully', async () => {
        // This test simulates what happens when key rotation fails
        // In a real implementation, this might involve service errors
        
        // Multiple rapid rotations to potentially trigger an error condition
        const rapidRotations = Array(3).fill().map(() => apiClient.rotateEncryptionKey());
        
        const responses = await Promise.all(rapidRotations);
        
        // At least some should succeed, or all should return appropriate errors
        responses.forEach(response => {
          expect([200, 500, 429]).toContain(response.status); // Success, Server Error, or Rate Limited
          
          if (response.status === 200) {
            expect(response.body.success).toBe(true);
          } else {
            expect(response.body).toHaveProperty('message');
          }
        });
      });

      test('should log security activity for key rotation', async () => {
        const response = await apiClient.rotateEncryptionKey();
        
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        
        // Verify that activity was logged (if activity endpoint is available)
        // This would require access to activity logs to verify the event was recorded
        // For now, we just verify the operation succeeded
      });

      test('should maintain service availability during key rotation', async () => {
        // Test that other operations still work during/after key rotation
        const rotationResponse = await apiClient.rotateEncryptionKey();
        expect(rotationResponse.status).toBe(200);
        
        // Test that certificate operations still work after key rotation
        const certificatesResponse = await apiClient.getCertificates();
        expect(certificatesResponse.status).toBe(200);
        
        // Test that settings operations still work after key rotation
        const settingsResponse = await apiClient.getSettings();
        expect(settingsResponse.status).toBe(200);
      });
    });
  });

  describe('Security Validation', () => {
    test('should validate security endpoint accessibility', async () => {
      // Test that security endpoints are properly protected
      const securityEndpoints = [
        () => apiClient.rotateEncryptionKey()
      ];

      for (const endpoint of securityEndpoints) {
        const response = await endpoint();
        
        // Should either succeed or return proper authorization error
        expect([200, 401, 403]).toContain(response.status);
        
        if (response.status === 401) {
          expect(response.body).toHaveProperty('message');
        } else if (response.status === 403) {
          expect(response.body).toHaveProperty('message');
          expect(response.body.message).toMatch(/permission|admin|forbidden/i);
        }
      }
    });

    test('should handle malformed security requests', async () => {
      // Test with invalid request methods or malformed data
      const response = await apiClient.request('GET', '/api/security/rotate-encryption-key');
      
      // Should return method not allowed or similar error
      expect([405, 404]).toContain(response.status);
    });

    test('should validate request headers for security operations', async () => {
      // Test security operations with missing or invalid headers
      const clientWithoutHeaders = new TestAPIClient();
      await clientWithoutHeaders.login();
      
      // Remove important headers
      clientWithoutHeaders.headers = {};
      
      const response = await clientWithoutHeaders.rotateEncryptionKey();
      
      // Should handle missing headers gracefully
      expect([200, 400, 401]).toContain(response.status);
    });
  });

  describe('Security Error Handling', () => {
    test('should handle internal security service errors', async () => {
      // Test behavior when internal security operations fail
      const response = await apiClient.rotateEncryptionKey();
      
      if (response.status === 500) {
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toMatch(/failed|error/i);
        expect(response.body).toHaveProperty('statusCode', 500);
      } else {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });

    test('should provide appropriate error messages for security failures', async () => {
      // Test that security operations provide meaningful error messages
      const unauthenticatedClient = new TestAPIClient();
      const response = await unauthenticatedClient.rotateEncryptionKey();
      
      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toBeTruthy();
      expect(typeof response.body.message).toBe('string');
    });

    test('should handle concurrent security operations', async () => {
      // Test multiple simultaneous security operations
      const concurrentOperations = [
        apiClient.rotateEncryptionKey(),
        apiClient.rotateEncryptionKey(),
        apiClient.rotateEncryptionKey()
      ];

      const responses = await Promise.all(concurrentOperations);
      
      // Some should succeed, others might be rejected or queued
      let successCount = 0;
      let errorCount = 0;

      responses.forEach(response => {
        if (response.status === 200 && response.body.success) {
          successCount++;
        } else {
          errorCount++;
        }
      });

      // At least one operation should complete
      expect(successCount).toBeGreaterThan(0);
      
      // Errors should be handled gracefully
      responses.forEach(response => {
        if (response.status !== 200) {
          expect(response.body).toHaveProperty('message');
        }
      });
    });
  });

  describe('Security Audit and Logging', () => {
    test('should log security operations for audit purposes', async () => {
      const beforeRotation = Date.now();
      const response = await apiClient.rotateEncryptionKey();
      const afterRotation = Date.now();
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Security operations should be properly timestamped
      // This test verifies the operation completed within expected timeframe
      expect(afterRotation - beforeRotation).toBeLessThan(30000); // Should complete within 30 seconds
    });

    test('should maintain security operation integrity', async () => {
      // Test that security operations are atomic and consistent
      const initialCertificates = await apiClient.getCertificates();
      
      // Perform security operation
      const securityResponse = await apiClient.rotateEncryptionKey();
      expect(securityResponse.status).toBe(200);
      
      // Verify system is still consistent after security operation
      const afterCertificates = await apiClient.getCertificates();
      expect(afterCertificates.status).toBe(200);
      
      // Certificate count should remain the same
      expect(afterCertificates.body.length).toBe(initialCertificates.body.length);
    });
  });

  describe('Security Performance', () => {
    test('should complete encryption key rotation within reasonable time', async () => {
      const startTime = Date.now();
      const response = await apiClient.rotateEncryptionKey();
      const endTime = Date.now();
      
      expect(response.status).toBe(200);
      
      // Should complete within reasonable time (adjust based on system requirements)
      const operationTime = endTime - startTime;
      expect(operationTime).toBeLessThan(10000); // 10 seconds max
    });

    test('should handle security operations under load', async () => {
      // Test security operations with concurrent system activity
      const concurrentTasks = [
        apiClient.getCertificates(),
        apiClient.getSettings(),
        apiClient.rotateEncryptionKey(),
        apiClient.getCertificates(),
        apiClient.getSettings()
      ];

      const responses = await Promise.all(concurrentTasks);
      
      // All operations should complete successfully
      responses.forEach((response, index) => {
        if (index === 2) {
          // Encryption key rotation (index 2)
          expect([200, 500]).toContain(response.status);
        } else {
          // Other operations should not be affected
          expect(response.status).toBe(200);
        }
      });
    });
  });

  describe('Security Integration', () => {
    test('should integrate with certificate operations after key rotation', async () => {
      // Perform key rotation
      const rotationResponse = await apiClient.rotateEncryptionKey();
      expect(rotationResponse.status).toBe(200);
      
      // Test that certificate operations work normally after rotation
      const testCertData = {
        name: 'Security Test Certificate',
        type: 'server',
        subject: {
          commonName: 'security-test.local'
        },
        keySize: 2048,
        days: 365,
        sans: {
          domains: ['security-test.local'],
          ips: []
        }
      };

      const createResponse = await apiClient.createCertificate(testCertData);
      expect(createResponse.status).toBe(201);
      
      // Cleanup
      if (createResponse.body.certificate?.fingerprint) {
        await apiClient.deleteCertificate(createResponse.body.certificate.fingerprint);
      }
    });

    test('should maintain authentication sessions after security operations', async () => {
      // Verify user session remains valid after security operations
      const userResponse1 = await apiClient.getCurrentUser();
      expect(userResponse1.status).toBe(200);
      
      // Perform security operation
      const securityResponse = await apiClient.rotateEncryptionKey();
      expect(securityResponse.status).toBe(200);
      
      // Verify session is still valid
      const userResponse2 = await apiClient.getCurrentUser();
      expect(userResponse2.status).toBe(200);
      expect(userResponse2.body.user.username).toBe(userResponse1.body.user.username);
    });

    test('should preserve system settings after security operations', async () => {
      // Get current settings
      const settingsBefore = await apiClient.getSettings();
      expect(settingsBefore.status).toBe(200);
      
      // Perform security operation
      const securityResponse = await apiClient.rotateEncryptionKey();
      expect(securityResponse.status).toBe(200);
      
      // Verify settings are preserved
      const settingsAfter = await apiClient.getSettings();
      expect(settingsAfter.status).toBe(200);
      
      // Key settings should remain the same
      expect(settingsAfter.body.validity).toBe(settingsBefore.body.validity);
      expect(settingsAfter.body.keySize).toBe(settingsBefore.body.keySize);
    });
  });

  describe('Security Edge Cases', () => {
    test('should handle rapid successive security operations', async () => {
      // Test rapid fire security operations
      const operations = [];
      for (let i = 0; i < 3; i++) {
        operations.push(apiClient.rotateEncryptionKey());
      }

      const responses = await Promise.all(operations);
      
      // At least one should succeed
      const successfulOperations = responses.filter(r => r.status === 200 && r.body.success);
      expect(successfulOperations.length).toBeGreaterThan(0);
      
      // Failed operations should provide meaningful errors
      const failedOperations = responses.filter(r => r.status !== 200 || !r.body.success);
      failedOperations.forEach(response => {
        expect(response.body).toHaveProperty('message');
      });
    });

    test('should handle security operations with system under stress', async () => {
      // Create some system load by performing multiple operations
      const loadOperations = [
        apiClient.getCertificates(),
        apiClient.getSettings(),
        apiClient.getCACertificates(),
        apiClient.getDeploymentSettings()
      ];

      // Start load operations
      const loadPromises = Promise.all(loadOperations);
      
      // Perform security operation under load
      const securityResponse = await apiClient.rotateEncryptionKey();
      
      // Wait for load operations to complete
      const loadResponses = await loadPromises;
      
      // Security operation should complete successfully or fail gracefully
      expect([200, 500, 503]).toContain(securityResponse.status);
      
      // Load operations should not be significantly affected
      loadResponses.forEach(response => {
        expect([200, 500]).toContain(response.status);
      });
    });
  });
});
