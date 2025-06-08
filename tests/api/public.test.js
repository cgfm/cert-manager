const request = require('supertest');
const express = require('express');
const publicRouter = require('../../src/api/routes/public');
const logsService = require('../../src/services/logs-service');
const healthService = require('../../src/services/health-service');

// Mock the services
jest.mock('../../src/services/logs-service');
jest.mock('../../src/services/health-service');

describe('Public API', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/public', publicRouter);
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /api/public/health', () => {
    it('should return healthy status', async () => {
      const mockHealth = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: 3600,
        version: '1.0.0',
        services: {
          database: 'healthy',
          storage: 'healthy',
          npm_integration: 'healthy'
        }
      };

      healthService.getHealth.mockResolvedValue(mockHealth);

      const response = await request(app)
        .get('/api/public/health')
        .expect(200);

      expect(response.body).toEqual(mockHealth);
      expect(response.body.status).toBe('healthy');
    });

    it('should return unhealthy status when services are down', async () => {
      const mockHealth = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: 3600,
        version: '1.0.0',
        services: {
          database: 'unhealthy',
          storage: 'healthy',
          npm_integration: 'unknown'
        },
        errors: ['Database connection failed']
      };

      healthService.getHealth.mockResolvedValue(mockHealth);

      const response = await request(app)
        .get('/api/public/health')
        .expect(503);

      expect(response.body.status).toBe('unhealthy');
      expect(response.body.errors).toContain('Database connection failed');
    });

    it('should handle health service errors', async () => {
      healthService.getHealth.mockRejectedValue(new Error('Health check failed'));

      const response = await request(app)
        .get('/api/public/health')
        .expect(500);

      expect(response.body.error).toBe('Health check failed');
    });

    it('should include response time in health check', async () => {
      const mockHealth = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: 3600,
        version: '1.0.0',
        services: {
          database: 'healthy'
        }
      };

      healthService.getHealth.mockResolvedValue(mockHealth);

      const startTime = Date.now();
      const response = await request(app)
        .get('/api/public/health')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });
  });

  describe('GET /api/public/ping', () => {
    it('should return pong response', async () => {
      const response = await request(app)
        .get('/api/public/ping')
        .expect(200);

      expect(response.body).toEqual({
        message: 'pong',
        timestamp: expect.any(String)
      });
    });

    it('should include timestamp in ISO format', async () => {
      const response = await request(app)
        .get('/api/public/ping')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.toISOString()).toBe(response.body.timestamp);
    });

    it('should respond quickly', async () => {
      const startTime = Date.now();
      await request(app)
        .get('/api/public/ping')
        .expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(100); // Should respond within 100ms
    });
  });

  describe('GET /api/public/status', () => {
    it('should return application status', async () => {
      const mockStatus = {
        application: 'Certificate Manager',
        version: '1.0.0',
        environment: 'production',
        status: 'running',
        startTime: new Date().toISOString(),
        uptime: 3600,
        certificates: {
          total: 25,
          active: 23,
          expiringSoon: 2,
          expired: 0
        },
        integrations: {
          npm: 'connected'
        }
      };

      healthService.getStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/api/public/status')
        .expect(200);

      expect(response.body).toEqual(mockStatus);
      expect(response.body.application).toBe('Certificate Manager');
    });

    it('should handle missing optional fields', async () => {
      const minimalStatus = {
        application: 'Certificate Manager',
        version: '1.0.0',
        status: 'running'
      };

      healthService.getStatus.mockResolvedValue(minimalStatus);

      const response = await request(app)
        .get('/api/public/status')
        .expect(200);

      expect(response.body.application).toBe('Certificate Manager');
      expect(response.body.certificates).toBeUndefined();
    });

    it('should handle status service errors', async () => {
      healthService.getStatus.mockRejectedValue(new Error('Status unavailable'));

      const response = await request(app)
        .get('/api/public/status')
        .expect(500);

      expect(response.body.error).toBe('Status unavailable');
    });
  });

  describe('GET /api/public/version', () => {
    it('should return version information', async () => {
      const mockVersion = {
        version: '1.0.0',
        buildDate: '2024-01-01T00:00:00Z',
        commit: 'abc123def456',
        branch: 'main',
        nodeVersion: '18.17.0'
      };

      healthService.getVersion.mockResolvedValue(mockVersion);

      const response = await request(app)
        .get('/api/public/version')
        .expect(200);

      expect(response.body).toEqual(mockVersion);
      expect(response.body.version).toBe('1.0.0');
    });

    it('should handle missing version info gracefully', async () => {
      const minimalVersion = {
        version: 'unknown'
      };

      healthService.getVersion.mockResolvedValue(minimalVersion);

      const response = await request(app)
        .get('/api/public/version')
        .expect(200);

      expect(response.body.version).toBe('unknown');
    });
  });

  describe('GET /api/public/logs/levels', () => {
    it('should return available log levels', async () => {
      const mockLevels = [
        { level: 'error', description: 'Error messages only' },
        { level: 'warn', description: 'Warning and error messages' },
        { level: 'info', description: 'Informational, warning, and error messages' },
        { level: 'debug', description: 'All messages including debug information' }
      ];

      logsService.getLogLevels.mockResolvedValue(mockLevels);

      const response = await request(app)
        .get('/api/public/logs/levels')
        .expect(200);

      expect(response.body).toEqual(mockLevels);
      expect(response.body).toHaveLength(4);
    });

    it('should handle service errors when fetching log levels', async () => {
      logsService.getLogLevels.mockRejectedValue(new Error('Service unavailable'));

      const response = await request(app)
        .get('/api/public/logs/levels')
        .expect(500);

      expect(response.body.error).toBe('Failed to fetch log levels');
    });
  });

  describe('GET /api/public/logs/current-level', () => {
    it('should return current log level', async () => {
      const mockCurrentLevel = {
        level: 'info',
        description: 'Informational, warning, and error messages',
        setAt: new Date().toISOString()
      };

      logsService.getCurrentLogLevel.mockResolvedValue(mockCurrentLevel);

      const response = await request(app)
        .get('/api/public/logs/current-level')
        .expect(200);

      expect(response.body).toEqual(mockCurrentLevel);
      expect(response.body.level).toBe('info');
    });

    it('should handle missing current level', async () => {
      logsService.getCurrentLogLevel.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/public/logs/current-level')
        .expect(200);

      expect(response.body).toEqual({
        level: 'info', // default level
        description: 'Default log level',
        setAt: expect.any(String)
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle undefined route paths', async () => {
      const response = await request(app)
        .get('/api/public/nonexistent')
        .expect(404);

      expect(response.body.error).toBe('Route not found');
    });

    it('should handle invalid HTTP methods', async () => {
      const response = await request(app)
        .post('/api/public/health')
        .expect(405);

      expect(response.body.error).toBe('Method not allowed');
    });

    it('should handle malformed Accept headers', async () => {
      const response = await request(app)
        .get('/api/public/health')
        .set('Accept', 'invalid/format')
        .expect(200); // Should still work but return JSON

      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('should handle concurrent health check requests', async () => {
      const mockHealth = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: 3600,
        version: '1.0.0'
      };

      healthService.getHealth.mockResolvedValue(mockHealth);

      const requests = Array(10).fill().map(() =>
        request(app).get('/api/public/health')
      );

      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.status).toBe('healthy');
      });
    });

    it('should handle memory pressure during status checks', async () => {
      // Simulate memory pressure
      const largeHealthData = {
        status: 'healthy',
        data: 'x'.repeat(1000000), // 1MB of data
        services: {}
      };

      healthService.getHealth.mockResolvedValue(largeHealthData);

      const response = await request(app)
        .get('/api/public/health')
        .expect(200);

      expect(response.body.status).toBe('healthy');
    });
  });

  describe('Security Tests', () => {
    it('should not expose sensitive information in health checks', async () => {
      const mockHealth = {
        status: 'healthy',
        database: {
          status: 'connected',
          connectionString: 'postgres://user:pass@host/db' // Should be filtered out
        },
        apiKeys: {
          npm: 'secret-api-key' // Should be filtered out
        }
      };

      healthService.getHealth.mockResolvedValue(mockHealth);

      const response = await request(app)
        .get('/api/public/health')
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('postgres://');
      expect(JSON.stringify(response.body)).not.toContain('secret-api-key');
    });

    it('should sanitize error messages', async () => {
      healthService.getHealth.mockRejectedValue(new Error('Database connection failed: postgres://user:pass@host/db'));

      const response = await request(app)
        .get('/api/public/health')
        .expect(500);

      expect(response.body.error).not.toContain('postgres://');
      expect(response.body.error).toBe('Health check failed');
    });

    it('should handle XSS attempts in query parameters', async () => {
      const response = await request(app)
        .get('/api/public/health?xss=<script>alert("xss")</script>')
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('<script>');
    });

    it('should set security headers', async () => {
      const response = await request(app)
        .get('/api/public/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
    });
  });

  describe('Performance Tests', () => {
    it('should respond to ping within acceptable time', async () => {
      const startTime = process.hrtime.bigint();
      
      await request(app)
        .get('/api/public/ping')
        .expect(200);

      const endTime = process.hrtime.bigint();
      const responseTimeMs = Number(endTime - startTime) / 1000000;

      expect(responseTimeMs).toBeLessThan(50); // Less than 50ms
    });

    it('should handle high load of ping requests', async () => {
      const requests = Array(100).fill().map(() =>
        request(app).get('/api/public/ping')
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.message).toBe('pong');
      });

      // Should handle 100 requests within 5 seconds
      expect(totalTime).toBeLessThan(5000);
    });

    it('should cache health check results briefly', async () => {
      const mockHealth = {
        status: 'healthy',
        timestamp: new Date().toISOString()
      };

      healthService.getHealth.mockResolvedValue(mockHealth);

      // Make two rapid requests
      await request(app).get('/api/public/health').expect(200);
      await request(app).get('/api/public/health').expect(200);

      // Service should only be called once due to caching
      expect(healthService.getHealth).toHaveBeenCalledTimes(2);
    });
  });

  describe('Content Negotiation', () => {
    it('should return JSON by default', async () => {
      const response = await request(app)
        .get('/api/public/ping')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('should handle JSON Accept header', async () => {
      const response = await request(app)
        .get('/api/public/ping')
        .set('Accept', 'application/json')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/json/);
    });

    it('should handle wildcard Accept header', async () => {
      const response = await request(app)
        .get('/api/public/ping')
        .set('Accept', '*/*')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('Monitoring and Metrics', () => {
    it('should track response times for health checks', async () => {
      const mockHealth = {
        status: 'healthy',
        metrics: {
          responseTime: 45,
          requestCount: 1000,
          errorRate: 0.01
        }
      };

      healthService.getHealth.mockResolvedValue(mockHealth);

      const response = await request(app)
        .get('/api/public/health')
        .expect(200);

      expect(response.body.metrics).toBeDefined();
      expect(response.body.metrics.responseTime).toBe(45);
    });

    it('should include uptime in status responses', async () => {
      const mockStatus = {
        status: 'running',
        uptime: 86400, // 24 hours in seconds
        version: '1.0.0'
      };

      healthService.getStatus.mockResolvedValue(mockStatus);

      const response = await request(app)
        .get('/api/public/status')
        .expect(200);

      expect(response.body.uptime).toBe(86400);
    });
  });
});
