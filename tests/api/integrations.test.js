const request = require('supertest');
const express = require('express');
const integrationsRouter = require('../../src/api/routes/integrations');
const npmIntegrationService = require('../../src/services/npm-integration-service');

// Mock the npm integration service
jest.mock('../../src/services/npm-integration-service');

describe('Integrations API', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/integrations', integrationsRouter);
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /api/integrations/npm/status', () => {
    it('should return NPM integration status when connected', async () => {
      const mockStatus = {
        connected: true,
        host: 'npm.example.com',
        version: '2.10.4',
        lastChecked: new Date().toISOString()
      };

      npmIntegrationService.getStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/api/integrations/npm/status')
        .expect(200);

      expect(response.body).toEqual(mockStatus);
      expect(npmIntegrationService.getStatus).toHaveBeenCalledTimes(1);
    });

    it('should return disconnected status when not connected', async () => {
      const mockStatus = {
        connected: false,
        error: 'Connection failed'
      };

      npmIntegrationService.getStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/api/integrations/npm/status')
        .expect(200);

      expect(response.body.connected).toBe(false);
      expect(response.body.error).toBe('Connection failed');
    });

    it('should handle service errors gracefully', async () => {
      npmIntegrationService.getStatus.mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .get('/api/integrations/npm/status')
        .expect(500);

      expect(response.body.error).toBe('Failed to get NPM status');
    });
  });

  describe('POST /api/integrations/npm/connect', () => {
    it('should connect to NPM with valid credentials', async () => {
      const connectionData = {
        host: 'npm.example.com',
        email: 'test@example.com',
        password: 'password123'
      };

      const mockResult = {
        success: true,
        message: 'Connected successfully',
        token: 'jwt-token-here'
      };

      npmIntegrationService.connect.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/integrations/npm/connect')
        .send(connectionData)
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(npmIntegrationService.connect).toHaveBeenCalledWith(connectionData);
    });

    it('should reject connection with invalid credentials', async () => {
      const connectionData = {
        host: 'npm.example.com',
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      npmIntegrationService.connect.mockRejectedValue(new Error('Invalid credentials'));

      const response = await request(app)
        .post('/api/integrations/npm/connect')
        .send(connectionData)
        .expect(401);

      expect(response.body.error).toBe('Authentication failed');
    });

    it('should validate required fields', async () => {
      const incompleteData = {
        host: 'npm.example.com'
        // missing email and password
      };

      const response = await request(app)
        .post('/api/integrations/npm/connect')
        .send(incompleteData)
        .expect(400);

      expect(response.body.error).toContain('required');
    });

    it('should validate host format', async () => {
      const invalidData = {
        host: 'invalid-host-format',
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/integrations/npm/connect')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toContain('Invalid host format');
    });

    it('should validate email format', async () => {
      const invalidData = {
        host: 'npm.example.com',
        email: 'invalid-email',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/integrations/npm/connect')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toContain('Invalid email format');
    });
  });

  describe('POST /api/integrations/npm/disconnect', () => {
    it('should disconnect from NPM successfully', async () => {
      npmIntegrationService.disconnect.mockResolvedValue({
        success: true,
        message: 'Disconnected successfully'
      });

      const response = await request(app)
        .post('/api/integrations/npm/disconnect')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(npmIntegrationService.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should handle disconnect errors', async () => {
      npmIntegrationService.disconnect.mockRejectedValue(new Error('Disconnect failed'));

      const response = await request(app)
        .post('/api/integrations/npm/disconnect')
        .expect(500);

      expect(response.body.error).toBe('Failed to disconnect from NPM');
    });
  });

  describe('GET /api/integrations/npm/certificates', () => {
    it('should return list of certificates from NPM', async () => {
      const mockCertificates = [
        {
          id: 1,
          name: 'example.com',
          domain: 'example.com',
          expires_on: '2025-12-31T23:59:59Z',
          status: 'active'
        },
        {
          id: 2,
          name: 'test.com',
          domain: 'test.com',
          expires_on: '2025-11-30T23:59:59Z',
          status: 'active'
        }
      ];

      npmIntegrationService.getCertificates.mockResolvedValue(mockCertificates);

      const response = await request(app)
        .get('/api/integrations/npm/certificates')
        .expect(200);

      expect(response.body).toEqual(mockCertificates);
      expect(response.body).toHaveLength(2);
    });

    it('should return empty array when no certificates exist', async () => {
      npmIntegrationService.getCertificates.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/integrations/npm/certificates')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should handle service errors when fetching certificates', async () => {
      npmIntegrationService.getCertificates.mockRejectedValue(new Error('NPM service unavailable'));

      const response = await request(app)
        .get('/api/integrations/npm/certificates')
        .expect(500);

      expect(response.body.error).toBe('Failed to fetch certificates from NPM');
    });

    it('should handle authentication errors', async () => {
      npmIntegrationService.getCertificates.mockRejectedValue(new Error('Unauthorized'));

      const response = await request(app)
        .get('/api/integrations/npm/certificates')
        .expect(401);

      expect(response.body.error).toBe('NPM authentication required');
    });
  });

  describe('POST /api/integrations/npm/certificates/sync', () => {
    it('should sync certificates successfully', async () => {
      const mockResult = {
        success: true,
        synced: 5,
        updated: 2,
        added: 3,
        message: 'Certificates synced successfully'
      };

      npmIntegrationService.syncCertificates.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/integrations/npm/certificates/sync')
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(npmIntegrationService.syncCertificates).toHaveBeenCalledTimes(1);
    });

    it('should handle sync errors', async () => {
      npmIntegrationService.syncCertificates.mockRejectedValue(new Error('Sync failed'));

      const response = await request(app)
        .post('/api/integrations/npm/certificates/sync')
        .expect(500);

      expect(response.body.error).toBe('Failed to sync certificates');
    });

    it('should handle partial sync failures', async () => {
      const mockResult = {
        success: false,
        synced: 2,
        failed: 1,
        errors: ['Failed to sync certificate for domain.com'],
        message: 'Partial sync completed with errors'
      };

      npmIntegrationService.syncCertificates.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/integrations/npm/certificates/sync')
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.errors).toHaveLength(1);
    });
  });

  describe('GET /api/integrations/npm/test-connection', () => {
    it('should test connection successfully', async () => {
      const mockResult = {
        success: true,
        message: 'Connection successful',
        responseTime: 150,
        version: '2.10.4'
      };

      npmIntegrationService.testConnection.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/integrations/npm/test-connection')
        .expect(200);

      expect(response.body).toEqual(mockResult);
    });

    it('should handle connection failures', async () => {
      const mockResult = {
        success: false,
        message: 'Connection failed',
        error: 'Timeout after 5000ms'
      };

      npmIntegrationService.testConnection.mockResolvedValue(mockResult);

      const response = await request(app)
        .get('/api/integrations/npm/test-connection')
        .expect(200);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('POST /api/integrations/npm/certificates/:id/deploy', () => {
    it('should deploy certificate to NPM successfully', async () => {
      const certificateId = '123';
      const mockResult = {
        success: true,
        message: 'Certificate deployed successfully',
        npmCertificateId: 456
      };

      npmIntegrationService.deployCertificate.mockResolvedValue(mockResult);

      const response = await request(app)
        .post(`/api/integrations/npm/certificates/${certificateId}/deploy`)
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(npmIntegrationService.deployCertificate).toHaveBeenCalledWith(certificateId);
    });

    it('should handle deployment failures', async () => {
      const certificateId = '123';
      npmIntegrationService.deployCertificate.mockRejectedValue(new Error('Deployment failed'));

      const response = await request(app)
        .post(`/api/integrations/npm/certificates/${certificateId}/deploy`)
        .expect(500);

      expect(response.body.error).toBe('Failed to deploy certificate');
    });

    it('should validate certificate ID parameter', async () => {
      const response = await request(app)
        .post('/api/integrations/npm/certificates//deploy')
        .expect(400);

      expect(response.body.error).toContain('Certificate ID is required');
    });
  });

  describe('DELETE /api/integrations/npm/certificates/:id', () => {
    it('should delete certificate from NPM successfully', async () => {
      const certificateId = '123';
      const mockResult = {
        success: true,
        message: 'Certificate deleted successfully'
      };

      npmIntegrationService.deleteCertificate.mockResolvedValue(mockResult);

      const response = await request(app)
        .delete(`/api/integrations/npm/certificates/${certificateId}`)
        .expect(200);

      expect(response.body).toEqual(mockResult);
      expect(npmIntegrationService.deleteCertificate).toHaveBeenCalledWith(certificateId);
    });

    it('should handle certificate not found', async () => {
      const certificateId = '999';
      npmIntegrationService.deleteCertificate.mockRejectedValue(new Error('Certificate not found'));

      const response = await request(app)
        .delete(`/api/integrations/npm/certificates/${certificateId}`)
        .expect(404);

      expect(response.body.error).toBe('Certificate not found');
    });

    it('should handle deletion errors', async () => {
      const certificateId = '123';
      npmIntegrationService.deleteCertificate.mockRejectedValue(new Error('Deletion failed'));

      const response = await request(app)
        .delete(`/api/integrations/npm/certificates/${certificateId}`)
        .expect(500);

      expect(response.body.error).toBe('Failed to delete certificate');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .post('/api/integrations/npm/connect')
        .send('invalid-json')
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.body.error).toContain('Invalid JSON');
    });

    it('should handle missing Content-Type header', async () => {
      const response = await request(app)
        .post('/api/integrations/npm/connect')
        .send({ host: 'test.com' })
        .expect(400);
    });

    it('should handle very large request bodies', async () => {
      const largeData = {
        host: 'npm.example.com',
        email: 'test@example.com',
        password: 'a'.repeat(10000) // Very long password
      };

      const response = await request(app)
        .post('/api/integrations/npm/connect')
        .send(largeData)
        .expect(400);

      expect(response.body.error).toContain('Request too large');
    });

    it('should handle network timeout errors', async () => {
      npmIntegrationService.connect.mockRejectedValue(new Error('ETIMEDOUT'));

      const response = await request(app)
        .post('/api/integrations/npm/connect')
        .send({
          host: 'npm.example.com',
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(500);

      expect(response.body.error).toBe('Network timeout');
    });

    it('should handle SSL/TLS certificate errors', async () => {
      npmIntegrationService.connect.mockRejectedValue(new Error('CERT_UNTRUSTED'));

      const response = await request(app)
        .post('/api/integrations/npm/connect')
        .send({
          host: 'npm.example.com',
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(500);

      expect(response.body.error).toBe('SSL certificate verification failed');
    });
  });

  describe('Security Tests', () => {
    it('should sanitize host input to prevent injection', async () => {
      const maliciousData = {
        host: 'npm.example.com"; DROP TABLE certificates; --',
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/integrations/npm/connect')
        .send(maliciousData)
        .expect(400);

      expect(response.body.error).toContain('Invalid host format');
    });

    it('should prevent XSS in error messages', async () => {
      const xssData = {
        host: '<script>alert("xss")</script>',
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/integrations/npm/connect')
        .send(xssData)
        .expect(400);

      expect(response.body.error).not.toContain('<script>');
    });

    it('should rate limit connection attempts', async () => {
      const connectionData = {
        host: 'npm.example.com',
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      npmIntegrationService.connect.mockRejectedValue(new Error('Invalid credentials'));

      // Make multiple rapid requests
      const requests = Array(10).fill().map(() =>
        request(app)
          .post('/api/integrations/npm/connect')
          .send(connectionData)
      );

      const responses = await Promise.all(requests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    it('should not expose sensitive information in error messages', async () => {
      npmIntegrationService.connect.mockRejectedValue(new Error('Database connection string: postgres://user:pass@host'));

      const response = await request(app)
        .post('/api/integrations/npm/connect')
        .send({
          host: 'npm.example.com',
          email: 'test@example.com',
          password: 'password123'
        })
        .expect(500);

      expect(response.body.error).not.toContain('postgres://');
      expect(response.body.error).not.toContain('pass@host');
    });
  });

  describe('Performance Tests', () => {
    it('should handle concurrent certificate sync requests', async () => {
      const mockResult = {
        success: true,
        synced: 5,
        message: 'Certificates synced successfully'
      };

      npmIntegrationService.syncCertificates.mockResolvedValue(mockResult);

      const requests = Array(5).fill().map(() =>
        request(app).post('/api/integrations/npm/certificates/sync')
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      expect(npmIntegrationService.syncCertificates).toHaveBeenCalledTimes(5);
    });

    it('should timeout long-running operations', async () => {
      npmIntegrationService.syncCertificates.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 30000)) // 30 second delay
      );

      const response = await request(app)
        .post('/api/integrations/npm/certificates/sync')
        .timeout(5000)
        .expect(500);

      expect(response.body.error).toBe('Operation timeout');
    });
  });
});
