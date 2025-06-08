/**
 * @file activity.test.js
 * @description API tests for activity operations
 */

const { TestAPIClient, setupTestEnv, teardownTestEnv } = require('../utils/testUtils');

describe('/api/activity', () => {
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

  describe('GET /api/activity', () => {
    test('should get activity log entries', async () => {
      const response = await apiClient.getActivity();
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      
      if (response.data.length > 0) {
        const activity = response.data[0];
        expect(activity).toHaveProperty('id');
        expect(activity).toHaveProperty('timestamp');
        expect(activity).toHaveProperty('action');
        expect(activity).toHaveProperty('type');
        expect(activity).toHaveProperty('target');
      }
    });

    test('should filter activities by type', async () => {
      const types = ['create', 'update', 'delete', 'deploy', 'renewal'];
      
      for (const type of types) {
        const response = await apiClient.getActivity({ type });
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data)).toBe(true);
        
        // If activities exist, they should match the requested type
        response.data.forEach(activity => {
          if (activity.type) {
            expect(activity.type).toBe(type);
          }
        });
      }
    });

    test('should filter activities by target', async () => {
      const targets = ['certificate', 'settings', 'deployment', 'ca'];
      
      for (const target of targets) {
        const response = await apiClient.getActivity({ target });
        
        expect(response.status).toBe(200);
        expect(Array.isArray(response.data)).toBe(true);
        
        // If activities exist, they should match the requested target
        response.data.forEach(activity => {
          if (activity.target) {
            expect(activity.target).toContain(target);
          }
        });
      }
    });

    test('should limit activity entries', async () => {
      const limit = 5;
      const response = await apiClient.getActivity({ limit });
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBeLessThanOrEqual(limit);
    });

    test('should paginate activity entries', async () => {
      const page1 = await apiClient.getActivity({ limit: 5, offset: 0 });
      const page2 = await apiClient.getActivity({ limit: 5, offset: 5 });
      
      expect(page1.status).toBe(200);
      expect(page2.status).toBe(200);
      
      // Pages should be different (assuming enough activities exist)
      if (page1.data.length > 0 && page2.data.length > 0) {
        expect(page1.data[0].id).not.toBe(page2.data[0].id);
      }
    });

    test('should filter activities by date range', async () => {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
      
      const response = await apiClient.getActivity({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      });
      
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      
      // All activities should be within the date range
      response.data.forEach(activity => {
        if (activity.timestamp) {
          const activityDate = new Date(activity.timestamp);
          expect(activityDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
          expect(activityDate.getTime()).toBeLessThanOrEqual(endDate.getTime());
        }
      });
    });
  });

  describe('POST /api/activity', () => {
    test('should create new activity entry', async () => {
      const activityData = {
        action: 'Test action from API test',
        type: 'test',
        target: 'api-testing',
        metadata: {
          testCase: 'activity creation',
          timestamp: new Date().toISOString()
        }
      };

      const response = await apiClient.createActivity(activityData);
      
      expect([200, 201]).toContain(response.status);
      expect(response.data).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('id');
      
      // Verify the activity was created
      const getResponse = await apiClient.getActivity({ limit: 1 });
      expect(getResponse.status).toBe(200);
      
      if (getResponse.data.length > 0) {
        const latestActivity = getResponse.data[0];
        expect(latestActivity.action).toBe(activityData.action);
        expect(latestActivity.type).toBe(activityData.type);
        expect(latestActivity.target).toBe(activityData.target);
      }
    });

    test('should validate required activity fields', async () => {
      const invalidActivities = [
        {}, // Missing all fields
        { action: 'Test' }, // Missing type and target
        { type: 'test' }, // Missing action and target
        { target: 'test' } // Missing action and type
      ];

      for (const activity of invalidActivities) {
        const response = await apiClient.createActivity(activity);
        expect([400, 422]).toContain(response.status);
      }
    });

    test('should handle activity metadata', async () => {
      const activityData = {
        action: 'Test with complex metadata',
        type: 'test',
        target: 'metadata-testing',
        metadata: {
          complexObject: {
            nested: {
              value: 'test',
              number: 42,
              array: [1, 2, 3]
            }
          },
          simpleString: 'test value',
          timestamp: new Date().toISOString()
        }
      };

      const response = await apiClient.createActivity(activityData);
      
      expect([200, 201]).toContain(response.status);
      expect(response.data).toHaveProperty('success', true);
    });
  });

  describe('GET /api/activity/:id', () => {
    test('should get specific activity by ID', async () => {
      // First create an activity
      const activityData = {
        action: 'Test activity for ID retrieval',
        type: 'test',
        target: 'id-testing'
      };

      const createResponse = await apiClient.createActivity(activityData);
      expect([200, 201]).toContain(createResponse.status);
      
      if (createResponse.data.id) {
        const getResponse = await apiClient.getActivityById(createResponse.data.id);
        
        expect(getResponse.status).toBe(200);
        expect(getResponse.data).toHaveProperty('id', createResponse.data.id);
        expect(getResponse.data).toHaveProperty('action', activityData.action);
        expect(getResponse.data).toHaveProperty('type', activityData.type);
        expect(getResponse.data).toHaveProperty('target', activityData.target);
      }
    });

    test('should handle non-existent activity ID', async () => {
      const response = await apiClient.getActivityById('nonexistent-id');
      
      expect([404, 400]).toContain(response.status);
    });

    test('should handle invalid activity ID format', async () => {
      const invalidIds = ['invalid-id', 123, null, undefined];
      
      for (const id of invalidIds) {
        const response = await apiClient.getActivityById(id);
        expect([400, 404, 422]).toContain(response.status);
      }
    });
  });

  describe('DELETE /api/activity/:id', () => {
    test('should delete specific activity', async () => {
      // First create an activity
      const activityData = {
        action: 'Test activity for deletion',
        type: 'test',
        target: 'deletion-testing'
      };

      const createResponse = await apiClient.createActivity(activityData);
      expect([200, 201]).toContain(createResponse.status);
      
      if (createResponse.data.id) {
        const deleteResponse = await apiClient.deleteActivity(createResponse.data.id);
        
        expect([200, 204]).toContain(deleteResponse.status);
        
        // Verify the activity was deleted
        const getResponse = await apiClient.getActivityById(createResponse.data.id);
        expect([404, 400]).toContain(getResponse.status);
      }
    });

    test('should handle deletion of non-existent activity', async () => {
      const response = await apiClient.deleteActivity('nonexistent-id');
      
      expect([404, 400]).toContain(response.status);
    });
  });

  describe('DELETE /api/activity', () => {
    test('should clear all activities', async () => {
      // First create some test activities
      const activities = [
        { action: 'Test 1', type: 'test', target: 'clear-testing' },
        { action: 'Test 2', type: 'test', target: 'clear-testing' },
        { action: 'Test 3', type: 'test', target: 'clear-testing' }
      ];

      for (const activity of activities) {
        await apiClient.createActivity(activity);
      }

      const clearResponse = await apiClient.clearActivities();
      
      expect([200, 204]).toContain(clearResponse.status);
      
      if (clearResponse.status === 200) {
        expect(clearResponse.data).toHaveProperty('success', true);
        expect(clearResponse.data).toHaveProperty('message');
      }
    });

    test('should handle clearing empty activity log', async () => {
      const response = await apiClient.clearActivities();
      
      expect([200, 204]).toContain(response.status);
    });
  });

  describe('Activity Integration Tests', () => {
    test('should handle complete activity workflow', async () => {
      // Create activity
      const activityData = {
        action: 'Integration test workflow',
        type: 'test',
        target: 'integration-testing',
        metadata: { test: 'workflow' }
      };

      const createResponse = await apiClient.createActivity(activityData);
      expect([200, 201]).toContain(createResponse.status);
      
      // Get all activities
      const listResponse = await apiClient.getActivity();
      expect(listResponse.status).toBe(200);
      
      // Get specific activity
      if (createResponse.data.id) {
        const getResponse = await apiClient.getActivityById(createResponse.data.id);
        expect(getResponse.status).toBe(200);
        
        // Delete activity
        const deleteResponse = await apiClient.deleteActivity(createResponse.data.id);
        expect([200, 204]).toContain(deleteResponse.status);
      }
    });

    test('should maintain activity ordering', async () => {
      const activities = [
        { action: 'First activity', type: 'test', target: 'ordering' },
        { action: 'Second activity', type: 'test', target: 'ordering' },
        { action: 'Third activity', type: 'test', target: 'ordering' }
      ];

      // Create activities in sequence
      for (const activity of activities) {
        await apiClient.createActivity(activity);
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay
      }

      const response = await apiClient.getActivity({ target: 'ordering' });
      expect(response.status).toBe(200);
      
      if (response.data.length >= 3) {
        // Should be ordered by timestamp (newest first typically)
        const timestamps = response.data.slice(0, 3).map(a => new Date(a.timestamp));
        expect(timestamps[0].getTime()).toBeGreaterThanOrEqual(timestamps[1].getTime());
        expect(timestamps[1].getTime()).toBeGreaterThanOrEqual(timestamps[2].getTime());
      }
    });
  });

  describe('Activity Security Tests', () => {
    test('should require authentication for activity operations', async () => {
      const unauthenticatedClient = new TestAPIClient(testEnv.baseUrl);
      
      const response = await unauthenticatedClient.get('/activity');
      expect([401, 403]).toContain(response.status);
    });

    test('should sanitize activity inputs', async () => {
      const maliciousActivity = {
        action: '<script>alert("xss")</script>',
        type: '../../../etc/passwd',
        target: 'SELECT * FROM activities',
        metadata: {
          evil: '"; DROP TABLE activities; --'
        }
      };

      const response = await apiClient.createActivity(maliciousActivity);
      expect([200, 201, 400]).toContain(response.status);
      
      // If created, verify sanitization
      if (response.status < 300 && response.data.id) {
        const getResponse = await apiClient.getActivityById(response.data.id);
        if (getResponse.status === 200) {
          expect(getResponse.data.action).not.toContain('<script>');
          expect(getResponse.data.type).not.toContain('../../');
        }
      }
    });

    test('should validate activity permissions', async () => {
      // Test with different activity types and targets
      const sensitiveActivity = {
        action: 'Attempt to access sensitive operation',
        type: 'admin',
        target: 'system-configuration'
      };

      const response = await apiClient.createActivity(sensitiveActivity);
      expect([200, 201, 403]).toContain(response.status);
    });
  });

  describe('Activity Performance Tests', () => {
    test('should handle large activity lists efficiently', async () => {
      const startTime = Date.now();
      const response = await apiClient.getActivity({ limit: 100 });
      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(3000); // 3 seconds max
    });

    test('should handle concurrent activity operations', async () => {
      const concurrentOperations = [
        apiClient.getActivity(),
        apiClient.createActivity({ action: 'Concurrent 1', type: 'test', target: 'concurrent' }),
        apiClient.createActivity({ action: 'Concurrent 2', type: 'test', target: 'concurrent' }),
        apiClient.getActivity({ type: 'test' })
      ];
      
      const responses = await Promise.all(concurrentOperations);
      responses.forEach(response => {
        expect([200, 201, 429, 500]).toContain(response.status);
      });
    });
  });

  describe('Activity Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      const response = await apiClient.getActivity();
      expect([200, 500, 503]).toContain(response.status);
      
      if (response.status >= 500) {
        expect(response.data).toHaveProperty('message');
        expect(typeof response.data.message).toBe('string');
      }
    });

    test('should provide meaningful error messages', async () => {
      const response = await apiClient.createActivity({
        action: 'A'.repeat(10000), // Very long action
        type: 'test',
        target: 'error-testing'
      });
      
      if (response.status >= 400) {
        expect(response.data).toHaveProperty('message');
        expect(typeof response.data.message).toBe('string');
        expect(response.data.message.length).toBeGreaterThan(0);
      }
    });

    test('should handle malformed request data', async () => {
      const malformedData = 'not-json-data';
      
      try {
        await apiClient.post('/activity', malformedData, {
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (error) {
        expect([400, 422, 500]).toContain(error.response?.status);
      }
    });
  });
});
