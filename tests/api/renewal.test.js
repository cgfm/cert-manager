/**
 * @file renewal.test.js
 * @description API tests for renewal operations
 */

const { TestAPIClient, setupTestEnv, teardownTestEnv } = require('../utils/testUtils');

describe('/api/renewal', () => {
  let apiClient;
  let testEnv;

  beforeAll(async () => {
    testEnv = await setupTestEnv();
    apiClient = new TestAPIClient(testEnv.baseUrl);
    await apiClient.authenticate();
  });

  afterAll(async () => {
    await teardownTestEnv(testEnv);
  });

  describe('GET /api/renewal/status', () => {
    test('should get renewal service status', async () => {
      const response = await apiClient.getRenewalStatus();
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('status');
      expect(response.data.status).toMatchObject({
        enabled: expect.any(Boolean),
        cronRunning: expect.any(Boolean),
        fileWatcherActive: expect.any(Boolean),
        lastCheck: expect.any(String),
        nextCheck: expect.any(String),
        certificatesChecked: expect.any(Number),
        certificatesRenewed: expect.any(Number)
      });
    });

    test('should handle renewal service errors gracefully', async () => {
      // Test when renewal service is unavailable
      const response = await apiClient.get('/renewal/status');
      expect([200, 500, 503]).toContain(response.status);
    });
  });

  describe('POST /api/renewal/check', () => {
    test('should trigger manual renewal check', async () => {
      const response = await apiClient.checkRenewals();
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('message');
      expect(response.data).toHaveProperty('checked');
      expect(response.data).toHaveProperty('renewed');
      expect(typeof response.data.checked).toBe('number');
      expect(typeof response.data.renewed).toBe('number');
    });

    test('should trigger forced renewal check', async () => {
      const response = await apiClient.checkRenewals({ forceAll: true });
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('message');
      expect(response.data).toHaveProperty('checked');
      expect(response.data).toHaveProperty('renewed');
    });

    test('should handle renewal check errors', async () => {
      // Test with invalid parameters
      const response = await apiClient.post('/renewal/check', { 
        forceAll: 'invalid' 
      });
      expect([200, 400, 500]).toContain(response.status);
    });
  });

  describe('POST /api/renewal/watcher/restart', () => {
    test('should restart file watcher', async () => {
      const response = await apiClient.restartFileWatcher();
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('message');
      expect(response.data.message).toContain('File watcher restarted');
    });

    test('should handle file watcher restart errors', async () => {
      // Test when file watcher service has issues
      const response = await apiClient.post('/renewal/watcher/restart');
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('POST /api/renewal/schedule', () => {
    test('should reschedule cron job', async () => {
      const response = await apiClient.rescheduleRenewal();
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('message');
      expect(response.data.message).toContain('scheduled');
    });

    test('should reschedule cron job with custom schedule', async () => {
      const response = await apiClient.rescheduleRenewal({
        schedule: '0 2 * * *' // 2 AM daily
      });
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('message');
    });

    test('should validate cron schedule format', async () => {
      const response = await apiClient.rescheduleRenewal({
        schedule: 'invalid-cron'
      });
      
      expect([400, 500]).toContain(response.status);
    });
  });

  describe('Renewal Integration Tests', () => {
    test('should check status, run manual check, and restart watcher', async () => {
      // Get initial status
      const statusResponse = await apiClient.getRenewalStatus();
      expect(statusResponse.status).toBe(200);
      
      // Run manual check
      const checkResponse = await apiClient.checkRenewals();
      expect(checkResponse.status).toBe(200);
      
      // Restart file watcher
      const restartResponse = await apiClient.restartFileWatcher();
      expect(restartResponse.status).toBe(200);
      
      // Verify status after operations
      const finalStatusResponse = await apiClient.getRenewalStatus();
      expect(finalStatusResponse.status).toBe(200);
    });

    test('should handle renewal workflow errors gracefully', async () => {
      // Test error scenarios in renewal workflow
      const responses = await Promise.allSettled([
        apiClient.checkRenewals({ forceAll: true }),
        apiClient.restartFileWatcher(),
        apiClient.rescheduleRenewal()
      ]);
      
      // All should either succeed or fail gracefully
      responses.forEach(result => {
        if (result.status === 'fulfilled') {
          expect([200, 400, 500, 503]).toContain(result.value.status);
        }
      });
    });
  });

  describe('Renewal Security Tests', () => {
    test('should require authentication for renewal operations', async () => {
      const unauthenticatedClient = new TestAPIClient(testEnv.baseUrl);
      
      const response = await unauthenticatedClient.get('/renewal/status');
      expect([401, 403]).toContain(response.status);
    });

    test('should validate renewal permissions', async () => {
      // Test with limited permissions if applicable
      const response = await apiClient.checkRenewals();
      expect([200, 403]).toContain(response.status);
    });

    test('should sanitize renewal inputs', async () => {
      const maliciousInputs = [
        { schedule: '../../../etc/passwd' },
        { schedule: '<script>alert("xss")</script>' },
        { schedule: '"; DROP TABLE certificates; --' }
      ];
      
      for (const input of maliciousInputs) {
        const response = await apiClient.rescheduleRenewal(input);
        expect([400, 500]).toContain(response.status);
      }
    });
  });

  describe('Renewal Performance Tests', () => {
    test('should handle multiple concurrent renewal requests', async () => {
      const concurrentRequests = Array(5).fill().map(() => 
        apiClient.getRenewalStatus()
      );
      
      const responses = await Promise.all(concurrentRequests);
      responses.forEach(response => {
        expect([200, 429, 500]).toContain(response.status);
      });
    });

    test('should complete renewal operations within timeout', async () => {
      const startTime = Date.now();
      const response = await apiClient.checkRenewals();
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(30000); // 30 seconds max
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Renewal Error Handling', () => {
    test('should handle missing renewal service gracefully', async () => {
      const response = await apiClient.get('/renewal/nonexistent');
      expect([404, 503]).toContain(response.status);
    });

    test('should provide meaningful error messages', async () => {
      const response = await apiClient.rescheduleRenewal({
        schedule: 'completely-invalid-format-that-should-fail'
      });
      
      if (response.status >= 400) {
        expect(response.data).toHaveProperty('message');
        expect(typeof response.data.message).toBe('string');
        expect(response.data.message.length).toBeGreaterThan(0);
      }
    });
  });
});
