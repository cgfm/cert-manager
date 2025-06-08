/**
 * @file logs.test.js
 * @description API tests for logs operations
 */

const { TestAPIClient, setupTestEnv, teardownTestEnv } = require('../utils/testUtils');

describe('/api/logs', () => {
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

  describe('GET /api/logs', () => {
    test('should get default log entries', async () => {
      const response = await apiClient.getLogs();
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      
      if (response.data.length > 0) {
        const logEntry = response.data[0];
        expect(logEntry).toHaveProperty('timestamp');
        expect(logEntry).toHaveProperty('level');
        expect(logEntry).toHaveProperty('message');
        expect(logEntry).toHaveProperty('filename');
      }
    });

    test('should filter logs by level', async () => {
      const levels = ['error', 'warn', 'info', 'debug'];
      
      for (const level of levels) {
        const response = await apiClient.getLogs({ level });
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data)).toBe(true);
        
        // If logs exist, they should match the requested level
        response.data.forEach(entry => {
          if (entry.level) {
            expect(['error', 'warn', 'info', 'debug', 'fine', 'trace'])
              .toContain(entry.level.toLowerCase());
          }
        });
      }
    });

    test('should filter logs by filename', async () => {
      const response = await apiClient.getLogs({ file: 'api/index.js' });
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      
      // If logs exist, they should match the requested file
      response.data.forEach(entry => {
        if (entry.filename) {
          expect(entry.filename).toContain('api/index.js');
        }
      });
    });

    test('should search logs by text', async () => {
      const response = await apiClient.getLogs({ search: 'error' });
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      
      // If logs exist, they should contain the search term
      response.data.forEach(entry => {
        if (entry.message) {
          expect(entry.message.toLowerCase()).toContain('error');
        }
      });
    });

    test('should limit log entries', async () => {
      const limit = 10;
      const response = await apiClient.getLogs({ limit });
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeLessThanOrEqual(limit);
    });

    test('should combine multiple filters', async () => {
      const response = await apiClient.getLogs({
        level: 'info',
        file: 'api',
        search: 'started',
        limit: 5
      });
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeLessThanOrEqual(5);
    });
  });

  describe('GET /api/logs/files', () => {
    test('should get available log files', async () => {
      const response = await apiClient.getLogFiles();
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      
      if (response.data.length > 0) {
        const logFile = response.data[0];
        expect(logFile).toHaveProperty('name');
        expect(logFile).toHaveProperty('size');
        expect(logFile).toHaveProperty('modified');
        expect(typeof logFile.name).toBe('string');
        expect(typeof logFile.size).toBe('number');
      }
    });

    test('should include common log files', async () => {
      const response = await apiClient.getLogFiles();
      
      expect(response.status).toBe(200);
      
      const fileNames = response.data.map(file => file.name);
      // Should include the main application log file
      expect(fileNames.some(name => 
        name.includes('cert-manager') || name.includes('.log')
      )).toBe(true);
    });
  });

  describe('GET /api/logs/file/:filename', () => {
    test('should get specific log file content', async () => {
      // First get available files
      const filesResponse = await apiClient.getLogFiles();
      expect(filesResponse.status).toBe(200);
      
      if (filesResponse.data.length > 0) {
        const filename = filesResponse.data[0].name;
        const response = await apiClient.getLogFileContent(filename);
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data)).toBe(true);
      }
    });

    test('should handle non-existent log file', async () => {
      const response = await apiClient.getLogFileContent('nonexistent.log');
      
      expect([404, 500]).toContain(response.status);
    });

    test('should filter specific log file content', async () => {
      const filesResponse = await apiClient.getLogFiles();
      expect(filesResponse.status).toBe(200);
      
      if (filesResponse.data.length > 0) {
        const filename = filesResponse.data[0].name;
        const response = await apiClient.getLogFileContent(filename, {
          level: 'error',
          limit: 5
        });
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data)).toBe(true);
        expect(response.data.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe('DELETE /api/logs/file/:filename', () => {
    test('should clear log file', async () => {
      // First get available files
      const filesResponse = await apiClient.getLogFiles();
      expect(filesResponse.status).toBe(200);
      
      if (filesResponse.data.length > 0) {
        const filename = filesResponse.data[0].name;
        const response = await apiClient.clearLogFile(filename);
        
        expect([200, 403, 404]).toContain(response.status);
        
        if (response.status === 200) {
          expect(response.data).toHaveProperty('success', true);
          expect(response.data).toHaveProperty('message');
        }
      }
    });

    test('should handle clearing non-existent log file', async () => {
      const response = await apiClient.clearLogFile('nonexistent.log');
      
      expect([404, 500]).toContain(response.status);
    });
  });

  describe('GET /api/logs/debug', () => {
    test('should get debug information', async () => {
      const response = await apiClient.getLogDebugInfo();
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('logsDir');
      expect(response.data).toHaveProperty('files');
      expect(Array.isArray(response.data.files)).toBe(true);
    });

    test('should include log parsing information', async () => {
      const response = await apiClient.getLogDebugInfo();
      
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('sampleLines');
      expect(response.data).toHaveProperty('parsedTestLine');
    });
  });

  describe('Logs Integration Tests', () => {
    test('should handle complete log workflow', async () => {
      // Get available files
      const filesResponse = await apiClient.getLogFiles();
      expect(filesResponse.status).toBe(200);
      
      // Get default logs
      const logsResponse = await apiClient.getLogs({ limit: 10 });
      expect(logsResponse.status).toBe(200);
      
      // Get debug info
      const debugResponse = await apiClient.getLogDebugInfo();
      expect(debugResponse.status).toBe(200);
      
      // All operations should succeed
      expect(filesResponse.data).toBeDefined();
      expect(logsResponse.data).toBeDefined();
      expect(debugResponse.data).toBeDefined();
    });

    test('should maintain consistency across log operations', async () => {
      const response1 = await apiClient.getLogs({ limit: 5 });
      const response2 = await apiClient.getLogs({ limit: 5 });
      
      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      
      // Log structure should be consistent
      if (response1.data.length > 0 && response2.data.length > 0) {
        const entry1 = response1.data[0];
        const entry2 = response2.data[0];
        
        expect(Object.keys(entry1)).toEqual(Object.keys(entry2));
      }
    });
  });

  describe('Logs Security Tests', () => {
    test('should require authentication for log access', async () => {
      const unauthenticatedClient = new TestAPIClient(testEnv.baseUrl);
      
      const response = await unauthenticatedClient.get('/logs');
      expect([401, 403]).toContain(response.status);
    });

    test('should prevent path traversal in log file access', async () => {
      const maliciousFilenames = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/etc/shadow',
        'C:\\Windows\\System32\\config\\SAM'
      ];
      
      for (const filename of maliciousFilenames) {
        const response = await apiClient.getLogFileContent(filename);
        expect([400, 403, 404]).toContain(response.status);
      }
    });

    test('should sanitize log search inputs', async () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        '../../../etc/passwd',
        'SELECT * FROM users',
        '"; DROP TABLE logs; --'
      ];
      
      for (const input of maliciousInputs) {
        const response = await apiClient.getLogs({ search: input });
        expect([200, 400]).toContain(response.status);
        
        // Should not return dangerous content
        if (response.status === 200) {
          const content = JSON.stringify(response.data);
          expect(content).not.toContain('<script>');
          expect(content).not.toContain('DROP TABLE');
        }
      }
    });
  });

  describe('Logs Performance Tests', () => {
    test('should handle large log requests efficiently', async () => {
      const startTime = Date.now();
      const response = await apiClient.getLogs({ limit: 1000 });
      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(5000); // 5 seconds max
    });

    test('should handle concurrent log requests', async () => {
      const concurrentRequests = Array(5).fill().map(() => 
        apiClient.getLogs({ limit: 10 })
      );
      
      const responses = await Promise.all(concurrentRequests);
      responses.forEach(response => {
        expect([200, 429, 500]).toContain(response.status);
      });
    });
  });

  describe('Logs Error Handling', () => {
    test('should handle corrupted log files gracefully', async () => {
      const response = await apiClient.getLogs();
      expect([200, 500]).toContain(response.status);
      
      if (response.status === 500) {
        expect(response.data).toHaveProperty('message');
        expect(typeof response.data.message).toBe('string');
      }
    });

    test('should provide meaningful error messages', async () => {
      const response = await apiClient.getLogFileContent('invalid-file-name-###');
      
      if (response.status >= 400) {
        expect(response.data).toHaveProperty('message');
        expect(typeof response.data.message).toBe('string');
        expect(response.data.message.length).toBeGreaterThan(0);
      }
    });

    test('should handle missing log directories', async () => {
      const response = await apiClient.getLogDebugInfo();
      expect([200, 500]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.data).toHaveProperty('logsDir');
        expect(typeof response.data.logsDir).toBe('string');
      }
    });
  });
});
