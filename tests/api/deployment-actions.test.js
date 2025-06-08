/**
 * Deployment Actions API Tests
 * Tests all deployment action management endpoints
 */
const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const { TestAPIClient, createTestApp } = require('../utils/testUtils');

describe('Deployment Actions API', () => {
  let app, mockDeps, client;

  beforeAll(async () => {
    const testApp = createTestApp();
    app = testApp.app;
    mockDeps = testApp.mockDeps;
    client = new TestAPIClient(app);
  });

  beforeEach(() => {
    // Clear mock data
    mockDeps.certificateManager.certificates.clear();
    jest.clearAllMocks();
  });

  describe('GET /api/certificates/:fingerprint/deploy-actions', () => {
    test('should return empty list for certificate with no deployment actions', async () => {
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _config: { deployActions: [] }
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);

      const response = await client.getDeploymentActions(testCert.fingerprint)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    test('should return deployment actions for certificate', async () => {
      const deployAction = testUtils.createTestDeploymentAction('npm');
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _config: { deployActions: [deployAction] }
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);

      const response = await client.getDeploymentActions(testCert.fingerprint)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].type).toBe('npm');
      expect(response.body[0].enabled).toBe(true);
    });

    test('should return 404 for non-existent certificate', async () => {
      const response = await client.getDeploymentActions('non-existent')
        .expect(404);

      expect(response.body.error).toContain('Certificate not found');
    });
  });

  describe('POST /api/certificates/:fingerprint/deploy-actions', () => {
    beforeEach(() => {
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _config: { deployActions: [] }
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);
    });

    test('should create new NPM deployment action', async () => {
      const deployAction = testUtils.createTestDeploymentAction('npm', {
        config: {
          host: 'localhost',
          port: 3001,
          username: 'admin',
          password: 'changeme'
        }
      });

      const response = await client.createDeploymentAction('test-fingerprint-123', deployAction)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.action.type).toBe('npm');
      expect(response.body.action.id).toBeDefined();
    });

    test('should create new FTP deployment action', async () => {
      const deployAction = testUtils.createTestDeploymentAction('ftp', {
        config: {
          host: 'localhost',
          port: 21,
          username: 'testuser',
          password: 'testpass',
          remotePath: '/certificates'
        }
      });

      const response = await client.createDeploymentAction('test-fingerprint-123', deployAction)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.action.type).toBe('ftp');
    });

    test('should create new SFTP deployment action', async () => {
      const deployAction = testUtils.createTestDeploymentAction('sftp', {
        config: {
          host: 'localhost',
          port: 2222,
          username: 'testuser',
          password: 'testpass',
          remotePath: '/upload'
        }
      });

      const response = await client.createDeploymentAction('test-fingerprint-123', deployAction)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.action.type).toBe('sftp');
    });

    test('should create new webhook deployment action', async () => {
      const deployAction = testUtils.createTestDeploymentAction('webhook', {
        config: {
          url: 'http://localhost:3002/webhook',
          method: 'POST',
          headers: { 'Authorization': 'Bearer test-token' }
        }
      });

      const response = await client.createDeploymentAction('test-fingerprint-123', deployAction)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.action.type).toBe('webhook');
    });

    test('should validate required action type', async () => {
      const invalidAction = { name: 'Test Action' }; // Missing type

      const response = await client.createDeploymentAction('test-fingerprint-123', invalidAction)
        .expect(400);

      expect(response.body.error).toContain('Action type is required');
    });

    test('should return 404 for non-existent certificate', async () => {
      const deployAction = testUtils.createTestDeploymentAction('npm');

      const response = await client.createDeploymentAction('non-existent', deployAction)
        .expect(404);

      expect(response.body.error).toContain('Certificate not found');
    });
  });

  describe('PUT /api/certificates/:fingerprint/deploy-actions/:actionIndex', () => {
    beforeEach(() => {
      const existingAction = testUtils.createTestDeploymentAction('npm', { id: 'action-1' });
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _config: { deployActions: [existingAction] }
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);
    });

    test('should update existing deployment action', async () => {
      const updatedAction = testUtils.createTestDeploymentAction('npm', {
        name: 'Updated NPM Action',
        config: {
          host: 'updated-host',
          port: 3001,
          username: 'admin',
          password: 'newpassword'
        }
      });

      const response = await client.updateDeploymentAction('test-fingerprint-123', 'action-1', updatedAction)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should return 404 for non-existent action', async () => {
      const updatedAction = testUtils.createTestDeploymentAction('npm');

      const response = await client.updateDeploymentAction('test-fingerprint-123', 'non-existent', updatedAction)
        .expect(404);

      expect(response.body.message).toContain('not found');
    });
  });

  describe('DELETE /api/certificates/:fingerprint/deploy-actions/:actionIndex', () => {
    beforeEach(() => {
      const existingAction = testUtils.createTestDeploymentAction('npm', { id: 'action-1' });
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _config: { deployActions: [existingAction] }
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);
    });

    test('should delete deployment action', async () => {
      const response = await client.deleteDeploymentAction('test-fingerprint-123', 'action-1')
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should return 404 for non-existent action', async () => {
      const response = await client.deleteDeploymentAction('test-fingerprint-123', 'non-existent')
        .expect(404);

      expect(response.body.message).toContain('not found');
    });
  });

  describe('POST /api/certificates/:fingerprint/deploy-actions/execute', () => {
    beforeEach(() => {
      const deployActions = [
        testUtils.createTestDeploymentAction('npm', { id: 'action-1' }),
        testUtils.createTestDeploymentAction('webhook', { id: 'action-2' })
      ];
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _config: { deployActions }
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);
    });

    test('should execute all deployment actions', async () => {
      mockDeps.deployService.executeAction.mockResolvedValue({ success: true });

      const response = await client.executeDeploymentActions('test-fingerprint-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockDeps.deployService.executeAction).toHaveBeenCalledTimes(2);
    });

    test('should handle execution failures gracefully', async () => {
      mockDeps.deployService.executeAction
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({ success: false, error: 'Connection failed' });

      const response = await client.executeDeploymentActions('test-fingerprint-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.results).toHaveLength(2);
      expect(response.body.results[0].success).toBe(true);
      expect(response.body.results[1].success).toBe(false);
    });

    test('should return message when no actions exist', async () => {
      const testCert = {
        fingerprint: 'test-fingerprint-456',
        name: 'test-certificate-no-actions',
        _config: { deployActions: [] }
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);

      const response = await client.executeDeploymentActions(testCert.fingerprint)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('No deployment actions');
    });
  });

  describe('POST /api/certificates/:fingerprint/deploy-actions/reorder', () => {
    beforeEach(() => {
      const deployActions = [
        testUtils.createTestDeploymentAction('npm', { id: 'action-1', name: 'First Action' }),
        testUtils.createTestDeploymentAction('ftp', { id: 'action-2', name: 'Second Action' }),
        testUtils.createTestDeploymentAction('webhook', { id: 'action-3', name: 'Third Action' })
      ];
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _config: { deployActions }
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);
    });

    test('should reorder deployment actions', async () => {
      const newOrder = [2, 0, 1]; // Move third action to first, etc.

      const response = await client.authenticatedRequest('POST', '/api/certificates/test-fingerprint-123/deploy-actions/reorder')
        .send({ order: newOrder })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should validate order array', async () => {
      const response = await client.authenticatedRequest('POST', '/api/certificates/test-fingerprint-123/deploy-actions/reorder')
        .send({ order: 'invalid' }) // Not an array
        .expect(400);

      expect(response.body.message).toContain('Order must be an array');
    });

    test('should validate order indices', async () => {
      const invalidOrder = [0, 1, 5]; // Index 5 doesn't exist

      const response = await client.authenticatedRequest('POST', '/api/certificates/test-fingerprint-123/deploy-actions/reorder')
        .send({ order: invalidOrder })
        .expect(400);

      expect(response.body.message).toContain('Invalid indices');
    });
  });

  describe('PUT /api/certificates/:fingerprint/deploy-actions/:actionIndex/toggle', () => {
    beforeEach(() => {
      const deployAction = testUtils.createTestDeploymentAction('npm', { 
        id: 'action-1',
        enabled: true 
      });
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _config: { deployActions: [deployAction] }
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);
    });

    test('should toggle deployment action enabled state', async () => {
      const response = await client.authenticatedRequest('PUT', '/api/certificates/test-fingerprint-123/deploy-actions/action-1/toggle')
        .send({ enabled: false })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should validate enabled parameter', async () => {
      const response = await client.authenticatedRequest('PUT', '/api/certificates/test-fingerprint-123/deploy-actions/action-1/toggle')
        .send({ enabled: 'invalid' }) // Not a boolean
        .expect(400);

      expect(response.body.message).toContain('Enabled status must be a boolean');
    });
  });
});
