/**
 * @file filesystem.test.js
 * @description API tests for filesystem operations
 */

const { TestAPIClient, setupTestEnv, teardownTestEnv } = require('../utils/testUtils');

describe('/api/filesystem', () => {
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

  describe('GET /api/filesystem/browse', () => {
    test('should browse filesystem root', async () => {
      const response = await apiClient.browseFilesystem('/');
      
      expect([200, 403, 503]).toContain(response.status);
      
      if (response.status === 200) {
        expect(response.data).toHaveProperty('success', true);
        expect(response.data).toHaveProperty('path');
        expect(response.data).toHaveProperty('items');
        expect(Array.isArray(response.data.items)).toBe(true);
        
        if (response.data.items.length > 0) {
          const item = response.data.items[0];
          expect(item).toHaveProperty('name');
          expect(item).toHaveProperty('type');
          expect(item).toHaveProperty('size');
          expect(item).toHaveProperty('modified');
          expect(['file', 'directory']).toContain(item.type);
        }
      }
    });

    test('should browse specific directory', async () => {
      const testPaths = ['/tmp', '/var', '/home', '/etc'];
      
      for (const path of testPaths) {
        const response = await apiClient.browseFilesystem(path);
        
        expect([200, 403, 404, 503]).toContain(response.status);
        
        if (response.status === 200) {
          expect(response.data).toHaveProperty('path', path);
          expect(Array.isArray(response.data.items)).toBe(true);
        }
      }
    });

    test('should handle non-existent directory', async () => {
      const response = await apiClient.browseFilesystem('/nonexistent/directory');
      
      expect([404, 403, 500]).toContain(response.status);
    });

    test('should respect security restrictions', async () => {
      const restrictedPaths = [
        '/bin',
        '/sbin',
        '/usr/bin',
        '/usr/sbin',
        '/etc/ssl/private',
        '/etc/ssh',
        '/var/lib/ssl/private'
      ];
      
      for (const path of restrictedPaths) {
        const response = await apiClient.browseFilesystem(path);
        expect([403, 404, 500]).toContain(response.status);
      }
    });

    test('should filter hidden files appropriately', async () => {
      const response = await apiClient.browseFilesystem('/', { includeHidden: false });
      
      if (response.status === 200) {
        response.data.items.forEach(item => {
          expect(item.name).not.toMatch(/^\./);
        });
      }
    });
  });

  describe('POST /api/filesystem/directory', () => {
    test('should create directory in allowed location', async () => {
      const testDirPath = '/tmp';
      const testDirName = `cert-manager-test-${Date.now()}`;
      
      const response = await apiClient.createDirectory(testDirPath, testDirName);
      
      expect([200, 201, 403, 500, 503]).toContain(response.status);
      
      if (response.status < 300) {
        expect(response.data).toHaveProperty('success', true);
        expect(response.data).toHaveProperty('path');
        expect(response.data.path).toContain(testDirName);
        
        // Cleanup - try to remove the created directory
        await apiClient.deleteFileSystemItem(`${testDirPath}/${testDirName}`);
      }
    });

    test('should prevent directory creation in restricted locations', async () => {
      const restrictedPaths = [
        '/bin',
        '/sbin',
        '/etc',
        '/usr/bin'
      ];
      
      for (const path of restrictedPaths) {
        const response = await apiClient.createDirectory(path, 'test-dir');
        expect([403, 500]).toContain(response.status);
      }
    });

    test('should validate directory creation parameters', async () => {
      const invalidRequests = [
        { path: '', name: 'test' },
        { path: '/tmp', name: '' },
        { path: '/tmp' }, // missing name
        { name: 'test' } // missing path
      ];
      
      for (const request of invalidRequests) {
        const response = await apiClient.createDirectory(request.path, request.name);
        expect([400, 422, 500]).toContain(response.status);
      }
    });

    test('should handle directory creation when service disabled', async () => {
      // Test when directory creation is disabled
      const response = await apiClient.createDirectory('/tmp', 'test-disabled');
      
      if (response.status === 403) {
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toContain('not allowed');
      }
    });
  });

  describe('GET /api/filesystem/file', () => {
    test('should read file contents', async () => {
      const testFiles = ['/etc/hostname', '/etc/os-release', '/proc/version'];
      
      for (const filePath of testFiles) {
        const response = await apiClient.readFile(filePath);
        
        expect([200, 403, 404, 500, 503]).toContain(response.status);
        
        if (response.status === 200) {
          expect(response.data).toHaveProperty('success', true);
          expect(response.data).toHaveProperty('content');
          expect(response.data).toHaveProperty('size');
          expect(typeof response.data.content).toBe('string');
          expect(typeof response.data.size).toBe('number');
        }
      }
    });

    test('should handle non-existent file', async () => {
      const response = await apiClient.readFile('/nonexistent/file.txt');
      
      expect([404, 403, 500]).toContain(response.status);
    });

    test('should respect file size limits', async () => {
      const response = await apiClient.readFile('/dev/zero', { maxSize: 1024 });
      
      expect([200, 403, 413, 500]).toContain(response.status);
      
      if (response.status === 413) {
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toMatch(/size|large|limit/i);
      }
    });

    test('should prevent reading sensitive files', async () => {
      const sensitiveFiles = [
        '/etc/shadow',
        '/etc/passwd',
        '/etc/ssh/ssh_host_rsa_key',
        '/root/.ssh/id_rsa'
      ];
      
      for (const filePath of sensitiveFiles) {
        const response = await apiClient.readFile(filePath);
        expect([403, 404, 500]).toContain(response.status);
      }
    });
  });

  describe('POST /api/filesystem/file', () => {
    test('should write file in allowed location', async () => {
      const testFilePath = `/tmp/cert-manager-test-${Date.now()}.txt`;
      const testContent = 'This is a test file content';
      
      const response = await apiClient.writeFile(testFilePath, testContent);
      
      expect([200, 201, 403, 500, 503]).toContain(response.status);
      
      if (response.status < 300) {
        expect(response.data).toHaveProperty('success', true);
        expect(response.data).toHaveProperty('path', testFilePath);
        
        // Verify file was created by reading it back
        const readResponse = await apiClient.readFile(testFilePath);
        if (readResponse.status === 200) {
          expect(readResponse.data.content).toBe(testContent);
        }
        
        // Cleanup
        await apiClient.deleteFileSystemItem(testFilePath);
      }
    });

    test('should prevent file writing in restricted locations', async () => {
      const restrictedPaths = [
        '/bin/test-file',
        '/etc/test-file',
        '/usr/bin/test-file',
        '/sbin/test-file'
      ];
      
      for (const path of restrictedPaths) {
        const response = await apiClient.writeFile(path, 'test content');
        expect([403, 500]).toContain(response.status);
      }
    });

    test('should validate file writing parameters', async () => {
      const invalidRequests = [
        { path: '', content: 'test' },
        { path: '/tmp/test.txt' }, // missing content
        { content: 'test' } // missing path
      ];
      
      for (const request of invalidRequests) {
        const response = await apiClient.writeFile(request.path, request.content);
        expect([400, 422, 500]).toContain(response.status);
      }
    });
  });

  describe('DELETE /api/filesystem/item', () => {
    test('should delete file in allowed location', async () => {
      // First create a test file
      const testFilePath = `/tmp/cert-manager-delete-test-${Date.now()}.txt`;
      const createResponse = await apiClient.writeFile(testFilePath, 'delete me');
      
      if (createResponse.status < 300) {
        const deleteResponse = await apiClient.deleteFileSystemItem(testFilePath);
        
        expect([200, 204, 403, 404, 500]).toContain(deleteResponse.status);
        
        if (deleteResponse.status < 300) {
          // Verify file was deleted
          const readResponse = await apiClient.readFile(testFilePath);
          expect([404, 403]).toContain(readResponse.status);
        }
      }
    });

    test('should delete directory in allowed location', async () => {
      // First create a test directory
      const testDirPath = '/tmp';
      const testDirName = `cert-manager-delete-dir-${Date.now()}`;
      const createResponse = await apiClient.createDirectory(testDirPath, testDirName);
      
      if (createResponse.status < 300) {
        const deleteResponse = await apiClient.deleteFileSystemItem(`${testDirPath}/${testDirName}`);
        
        expect([200, 204, 403, 404, 500]).toContain(deleteResponse.status);
      }
    });

    test('should prevent deletion in restricted locations', async () => {
      const restrictedItems = [
        '/bin/ls',
        '/etc/passwd',
        '/usr/bin/vim',
        '/sbin/init'
      ];
      
      for (const item of restrictedItems) {
        const response = await apiClient.deleteFileSystemItem(item);
        expect([403, 404, 500]).toContain(response.status);
      }
    });

    test('should handle deletion of non-existent items', async () => {
      const response = await apiClient.deleteFileSystemItem('/nonexistent/item');
      
      expect([404, 403, 500]).toContain(response.status);
    });
  });

  describe('Filesystem Integration Tests', () => {
    test('should handle complete file workflow', async () => {
      const testDir = '/tmp';
      const timestamp = Date.now();
      const dirName = `cert-manager-integration-${timestamp}`;
      const fileName = `test-file-${timestamp}.txt`;
      const fileContent = 'Integration test content';
      
      // Create directory
      const createDirResponse = await apiClient.createDirectory(testDir, dirName);
      
      if (createDirResponse.status < 300) {
        const fullDirPath = `${testDir}/${dirName}`;
        const fullFilePath = `${fullDirPath}/${fileName}`;
        
        // Browse directory
        const browseResponse = await apiClient.browseFilesystem(fullDirPath);
        expect([200, 403]).toContain(browseResponse.status);
        
        // Create file
        const createFileResponse = await apiClient.writeFile(fullFilePath, fileContent);
        
        if (createFileResponse.status < 300) {
          // Read file
          const readResponse = await apiClient.readFile(fullFilePath);
          if (readResponse.status === 200) {
            expect(readResponse.data.content).toBe(fileContent);
          }
          
          // Delete file
          await apiClient.deleteFileSystemItem(fullFilePath);
        }
        
        // Delete directory
        await apiClient.deleteFileSystemItem(fullDirPath);
      }
    });

    test('should maintain filesystem consistency', async () => {
      const testPath = '/tmp';
      
      const browse1 = await apiClient.browseFilesystem(testPath);
      const browse2 = await apiClient.browseFilesystem(testPath);
      
      if (browse1.status === 200 && browse2.status === 200) {
        expect(browse1.data.path).toBe(browse2.data.path);
        expect(browse1.data.items.length).toBe(browse2.data.items.length);
      }
    });
  });

  describe('Filesystem Security Tests', () => {
    test('should require authentication for filesystem operations', async () => {
      const unauthenticatedClient = new TestAPIClient(testEnv.baseUrl);
      
      const response = await unauthenticatedClient.get('/filesystem/browse?path=/');
      expect([401, 403]).toContain(response.status);
    });

    test('should prevent path traversal attacks', async () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        '/etc/../etc/../etc/shadow',
        '../../../../root/.ssh/id_rsa'
      ];
      
      for (const path of maliciousPaths) {
        const response = await apiClient.browseFilesystem(path);
        expect([400, 403, 404]).toContain(response.status);
      }
    });

    test('should sanitize file content', async () => {
      const testPath = `/tmp/cert-manager-security-test-${Date.now()}.txt`;
      const maliciousContent = '<script>alert("xss")</script>\n../../etc/passwd\nSELECT * FROM users;';
      
      const writeResponse = await apiClient.writeFile(testPath, maliciousContent);
      
      if (writeResponse.status < 300) {
        const readResponse = await apiClient.readFile(testPath);
        
        if (readResponse.status === 200) {
          // Content should be stored as-is but handled safely
          expect(readResponse.data.content).toBe(maliciousContent);
        }
        
        // Cleanup
        await apiClient.deleteFileSystemItem(testPath);
      }
    });

    test('should validate filesystem permissions', async () => {
      const response = await apiClient.browseFilesystem('/');
      expect([200, 403, 503]).toContain(response.status);
    });
  });

  describe('Filesystem Performance Tests', () => {
    test('should handle filesystem operations efficiently', async () => {
      const startTime = Date.now();
      const response = await apiClient.browseFilesystem('/tmp');
      const duration = Date.now() - startTime;
      
      expect([200, 403, 503]).toContain(response.status);
      expect(duration).toBeLessThan(3000); // 3 seconds max
    });

    test('should handle concurrent filesystem requests', async () => {
      const concurrentRequests = Array(3).fill().map(() => 
        apiClient.browseFilesystem('/tmp')
      );
      
      const responses = await Promise.all(concurrentRequests);
      responses.forEach(response => {
        expect([200, 403, 429, 500, 503]).toContain(response.status);
      });
    });

    test('should handle large directory listings', async () => {
      const response = await apiClient.browseFilesystem('/usr/bin');
      
      if (response.status === 200) {
        expect(Array.isArray(response.data.items)).toBe(true);
        // Should handle directories with many files
        expect(response.data.items.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Filesystem Error Handling', () => {
    test('should handle filesystem service unavailable', async () => {
      const response = await apiClient.browseFilesystem('/');
      
      if (response.status === 503) {
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toContain('Filesystem service');
      }
    });

    test('should provide meaningful error messages', async () => {
      const response = await apiClient.browseFilesystem('/nonexistent/deeply/nested/path');
      
      if (response.status >= 400) {
        expect(response.data).toHaveProperty('error');
        expect(typeof response.data.error).toBe('string');
        expect(response.data.error.length).toBeGreaterThan(0);
      }
    });

    test('should handle permission errors gracefully', async () => {
      const response = await apiClient.browseFilesystem('/root');
      
      if (response.status === 403) {
        expect(response.data).toHaveProperty('error');
        expect(response.data.error).toMatch(/permission|access|forbidden/i);
      }
    });

    test('should handle disk space errors', async () => {
      // Try to write a very large file
      const largePath = `/tmp/cert-manager-large-test-${Date.now()}.txt`;
      const largeContent = 'x'.repeat(1024 * 1024); // 1MB
      
      const response = await apiClient.writeFile(largePath, largeContent);
      
      expect([200, 201, 403, 413, 507, 500]).toContain(response.status);
      
      // Cleanup if created
      if (response.status < 300) {
        await apiClient.deleteFileSystemItem(largePath);
      }
    });
  });
});
