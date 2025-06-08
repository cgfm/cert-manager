/**
 * Certificates API Tests
 * Tests all certificate management endpoints
 */
const { describe, test, expect, beforeAll, afterAll, beforeEach } = require('@jest/globals');
const { TestAPIClient, createTestApp } = require('../utils/testUtils');

describe('Certificates API', () => {
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

  describe('GET /api/certificates', () => {
    test('should return empty list when no certificates exist', async () => {
      const response = await client.getCertificates()
        .expect(200);

      expect(response.body).toEqual([]);
    });

    test('should return list of certificates', async () => {
      // Add test certificate to mock manager
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _sans: { domains: ['test.example.com'], ips: [] },
        validFrom: new Date().toISOString(),
        validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);

      const response = await client.getCertificates()
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0]).toBeValidCertificate();
    });

    test('should handle initialization state', async () => {
      mockDeps.certificateManager.isInitialized = false;

      const response = await client.getCertificates()
        .expect(200);

      expect(response.body).toEqual({
        certificates: [],
        message: "Certificate manager is still initializing, please wait...",
        initializing: true
      });

      mockDeps.certificateManager.isInitialized = true;
    });
  });

  describe('POST /api/certificates', () => {
    test('should create a new certificate', async () => {
      const certificateData = testUtils.createTestCertificate();

      const response = await client.createCertificate(certificateData)
        .expect(200);

      expect(response.body).toBeValidCertificate();
      expect(mockDeps.certificateManager.createOrRenewCertificate).toHaveBeenCalled();
    });

    test('should validate required fields', async () => {
      const invalidData = { name: '' }; // Missing required fields

      const response = await client.createCertificate(invalidData)
        .expect(400);

      expect(response.body.message).toContain('Certificate name is required');
    });

    test('should validate domain format', async () => {
      const invalidData = testUtils.createTestCertificate({
        domains: ['invalid..domain', ''] // Invalid domain formats
      });

      const response = await client.createCertificate(invalidData)
        .expect(400);

      expect(response.body.message).toContain('domain');
    });

    test('should handle CA signing', async () => {
      const caData = testUtils.createTestCertificate({
        name: 'test-ca',
        certType: 'ca'
      });
      const caFingerprint = 'ca-fingerprint-123';
      
      // Add CA to mock manager
      mockDeps.certificateManager.certificates.set(caFingerprint, {
        ...caData,
        fingerprint: caFingerprint
      });

      const certificateData = testUtils.createTestCertificate({
        signWithCA: true,
        caFingerprint
      });

      const response = await client.createCertificate(certificateData)
        .expect(200);

      expect(response.body).toBeValidCertificate();
    });
  });

  describe('GET /api/certificates/:fingerprint', () => {
    test('should return specific certificate', async () => {
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _sans: { domains: ['test.example.com'], ips: [] }
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);

      const response = await client.getCertificate(testCert.fingerprint)
        .expect(200);

      expect(response.body).toBeValidCertificate();
      expect(response.body.fingerprint).toBe(testCert.fingerprint);
    });

    test('should return 404 for non-existent certificate', async () => {
      const response = await client.getCertificate('non-existent')
        .expect(404);

      expect(response.body.message).toContain('Certificate not found');
    });
  });

  describe('PUT /api/certificates/:fingerprint', () => {
    test('should update certificate configuration', async () => {
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _config: {}
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);

      const updateData = {
        autoRenew: true,
        renewDaysBeforeExpiry: 45
      };

      const response = await client.updateCertificate(testCert.fingerprint, updateData)
        .expect(200);

      expect(mockDeps.certificateManager.updateCertificateConfig)
        .toHaveBeenCalledWith(testCert.fingerprint, updateData);
    });

    test('should return 404 for non-existent certificate', async () => {
      const response = await client.updateCertificate('non-existent', {})
        .expect(404);

      expect(response.body.message).toContain('Certificate not found');
    });
  });

  describe('DELETE /api/certificates/:fingerprint', () => {
    test('should delete certificate', async () => {
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate'
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);

      const response = await client.deleteCertificate(testCert.fingerprint)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('should return 404 for non-existent certificate', async () => {
      const response = await client.deleteCertificate('non-existent')
        .expect(404);

      expect(response.body.message).toContain('Certificate not found');
    });
  });

  describe('POST /api/certificates/:fingerprint/renew', () => {
    test('should renew certificate', async () => {
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _sans: { domains: ['test.example.com'], ips: [] }
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);

      const response = await client.renewCertificate(testCert.fingerprint)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockDeps.certificateManager.createOrRenewCertificate).toHaveBeenCalled();
    });

    test('should handle renewal with passphrase', async () => {
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _needsPassphrase: true
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);

      const response = await client.authenticatedRequest('POST', `/api/certificates/${testCert.fingerprint}/renew`)
        .send({ passphrase: 'test-passphrase' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Certificate File Operations', () => {
    beforeEach(() => {
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _paths: {
          crt: '/test/path/cert.crt',
          key: '/test/path/cert.key',
          pem: '/test/path/cert.pem'
        }
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);
    });

    test('should convert certificate to P12 format', async () => {
      const response = await client.authenticatedRequest('POST', '/api/certificates/test-fingerprint-123/convert')
        .send({ format: 'p12', password: 'test-password' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockDeps.cryptoService.convertToP12).toHaveBeenCalled();
    });

    test('should convert certificate to PEM format', async () => {
      const response = await client.authenticatedRequest('POST', '/api/certificates/test-fingerprint-123/convert')
        .send({ format: 'pem' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockDeps.cryptoService.convertToPEM).toHaveBeenCalled();
    });

    test('should validate conversion format', async () => {
      const response = await client.authenticatedRequest('POST', '/api/certificates/test-fingerprint-123/convert')
        .send({ format: 'invalid-format' })
        .expect(400);

      expect(response.body.message).toContain('Unsupported format');
    });

    test('should require password for P12/PFX formats', async () => {
      const response = await client.authenticatedRequest('POST', '/api/certificates/test-fingerprint-123/convert')
        .send({ format: 'p12' }) // Missing password
        .expect(400);

      expect(response.body.message).toContain('Password is required');
    });
  });

  describe('SAN (Subject Alternative Names) Management', () => {
    beforeEach(() => {
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate',
        _sans: {
          domains: ['existing.example.com'],
          idleDomains: [],
          ips: ['192.168.1.100'],
          idleIps: []
        },
        addDomain: jest.fn().mockReturnValue(true),
        addIp: jest.fn().mockReturnValue(true),
        removeDomain: jest.fn().mockReturnValue(true),
        removeIp: jest.fn().mockReturnValue(true)
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);
    });

    test('should get SAN entries', async () => {
      const response = await client.authenticatedRequest('GET', '/api/certificates/test-fingerprint-123/san')
        .expect(200);

      expect(response.body.domains).toContain('existing.example.com');
      expect(response.body.ips).toContain('192.168.1.100');
    });

    test('should add domain to SAN', async () => {
      const response = await client.authenticatedRequest('POST', '/api/certificates/test-fingerprint-123/san')
        .send({ value: 'new.example.com', type: 'domain' })
        .expect(201);

      expect(response.body.message).toContain('Domain added successfully');
    });

    test('should add IP to SAN', async () => {
      const response = await client.authenticatedRequest('POST', '/api/certificates/test-fingerprint-123/san')
        .send({ value: '192.168.1.200', type: 'ip' })
        .expect(201);

      expect(response.body.message).toContain('IP address added successfully');
    });

    test('should remove domain from SAN', async () => {
      const response = await client.authenticatedRequest('DELETE', '/api/certificates/test-fingerprint-123/san/domain/existing.example.com')
        .expect(200);

      expect(response.body.message).toContain('removed successfully');
    });

    test('should apply idle SAN entries', async () => {
      const response = await client.authenticatedRequest('POST', '/api/certificates/test-fingerprint-123/san/apply')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('Passphrase Management', () => {
    beforeEach(() => {
      const testCert = {
        fingerprint: 'test-fingerprint-123',
        name: 'test-certificate'
      };
      mockDeps.certificateManager.certificates.set(testCert.fingerprint, testCert);
    });

    test('should check if certificate has passphrase', async () => {
      mockDeps.certificateManager.hasPassphrase.mockReturnValue(true);

      const response = await client.authenticatedRequest('GET', '/api/certificates/test-fingerprint-123/passphrase')
        .expect(200);

      expect(response.body.hasPassphrase).toBe(true);
    });

    test('should store certificate passphrase', async () => {
      const response = await client.authenticatedRequest('POST', '/api/certificates/test-fingerprint-123/passphrase')
        .send({ passphrase: 'test-passphrase' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(mockDeps.certificateManager.storePassphrase)
        .toHaveBeenCalledWith('test-fingerprint-123', 'test-passphrase');
    });

    test('should validate passphrase is provided', async () => {
      const response = await client.authenticatedRequest('POST', '/api/certificates/test-fingerprint-123/passphrase')
        .send({}) // Missing passphrase
        .expect(400);

      expect(response.body.message).toContain('Passphrase is required');
    });
  });
});
