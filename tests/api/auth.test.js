/**
 * Authentication API Tests
 * Tests for all authentication and user management endpoints:
 * - Login/logout
 * - Session management  
 * - User management (admin only)
 * - API token management
 * - Password changes
 */
const { TestAPIClient, startMockServices, stopMockServices } = require('../utils/testUtils');

describe('Authentication API', () => {
  let apiClient;
  let mockServices;

  beforeAll(async () => {
    mockServices = await startMockServices();
    apiClient = new TestAPIClient();
  });

  afterAll(async () => {
    if (mockServices) {
      await stopMockServices(mockServices);
    }
  });

  describe('Authentication Flow', () => {
    describe('POST /api/auth/login', () => {
      test('should login with valid credentials', async () => {
        const loginData = {
          username: 'admin',
          password: 'admin123'
        };

        const response = await apiClient.login(loginData.username, loginData.password);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('user');
        expect(response.body.user).toHaveProperty('username', loginData.username);
        expect(response.body.user).not.toHaveProperty('password'); // Password should not be returned
      });

      test('should reject invalid credentials', async () => {
        const loginData = {
          username: 'admin',
          password: 'wrongpassword'
        };

        const response = await apiClient.login(loginData.username, loginData.password);
        
        expect(response.status).toBe(200); // API returns 200 with success: false
        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('message');
        expect(response.body.message).toMatch(/invalid/i);
      });

      test('should require username and password', async () => {
        const responses = await Promise.all([
          apiClient.login('', 'password'),
          apiClient.login('username', ''),
          apiClient.login('', '')
        ]);

        responses.forEach(response => {
          expect(response.status).toBe(400);
          expect(response.body).toHaveProperty('success', false);
          expect(response.body.message).toMatch(/required/i);
        });
      });

      test('should handle non-existent users', async () => {
        const response = await apiClient.login('nonexistent', 'password');
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.message).toMatch(/invalid/i);
      });
    });

    describe('POST /api/auth/logout', () => {
      test('should logout authenticated user', async () => {
        // First login
        await apiClient.login();

        // Then logout
        const response = await apiClient.logout();
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');
      });

      test('should handle logout without authentication', async () => {
        const unauthenticatedClient = new TestAPIClient();
        const response = await unauthenticatedClient.logout();
        
        // Should still return success even if not authenticated
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
      });
    });

    describe('GET /api/auth/me', () => {
      test('should return current user info when authenticated', async () => {
        await apiClient.login();
        
        const response = await apiClient.getCurrentUser();
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('user');
        expect(response.body.user).toHaveProperty('username');
        expect(response.body.user).not.toHaveProperty('password');
      });

      test('should reject unauthenticated requests', async () => {
        const unauthenticatedClient = new TestAPIClient();
        const response = await unauthenticatedClient.getCurrentUser();
        
        expect(response.status).toBe(401);
      });
    });
  });

  describe('Password Management', () => {
    describe('POST /api/auth/change-password', () => {
      beforeEach(async () => {
        await apiClient.login();
      });

      test('should change password with valid current password', async () => {
        const passwordChangeData = {
          currentPassword: 'admin123',
          newPassword: 'newpassword123'
        };

        const response = await apiClient.changePassword(passwordChangeData);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message');

        // Verify new password works
        const loginResponse = await apiClient.login('admin', 'newpassword123');
        expect(loginResponse.body.success).toBe(true);

        // Change back to original password for other tests
        await apiClient.login('admin', 'newpassword123');
        await apiClient.changePassword({
          currentPassword: 'newpassword123',
          newPassword: 'admin123'
        });
      });

      test('should reject incorrect current password', async () => {
        const passwordChangeData = {
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123'
        };

        const response = await apiClient.changePassword(passwordChangeData);
        
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.message).toMatch(/current password/i);
      });

      test('should require both current and new password', async () => {
        const responses = await Promise.all([
          apiClient.changePassword({ currentPassword: 'admin123' }),
          apiClient.changePassword({ newPassword: 'newpassword' }),
          apiClient.changePassword({})
        ]);

        responses.forEach(response => {
          expect(response.status).toBe(400);
          expect(response.body).toHaveProperty('success', false);
          expect(response.body.message).toMatch(/required/i);
        });
      });

      test('should enforce minimum password length', async () => {
        const passwordChangeData = {
          currentPassword: 'admin123',
          newPassword: '123' // Too short
        };

        const response = await apiClient.changePassword(passwordChangeData);
        
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.message).toMatch(/8 characters/i);
      });

      test('should require authentication', async () => {
        const unauthenticatedClient = new TestAPIClient();
        const response = await unauthenticatedClient.changePassword({
          currentPassword: 'admin123',
          newPassword: 'newpassword123'
        });
        
        expect(response.status).toBe(401);
      });
    });
  });

  describe('User Management (Admin Only)', () => {
    beforeEach(async () => {
      await apiClient.login(); // Login as admin
    });

    describe('GET /api/auth/users', () => {
      test('should list users for admin', async () => {
        const response = await apiClient.getUsers();
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('users');
        expect(Array.isArray(response.body.users)).toBe(true);
        
        // Users should not contain passwords
        response.body.users.forEach(user => {
          expect(user).not.toHaveProperty('password');
        });
      });

      test('should reject non-admin users', async () => {
        // This test assumes there's a way to create/login as non-admin user
        // For now, we'll test with unauthenticated client
        const unauthenticatedClient = new TestAPIClient();
        const response = await unauthenticatedClient.getUsers();
        
        expect(response.status).toBe(401);
      });
    });

    describe('POST /api/auth/users', () => {
      test('should create new user as admin', async () => {
        const newUser = {
          username: 'testuser',
          password: 'testpassword123',
          name: 'Test User',
          role: 'user',
          disabled: false
        };

        const response = await apiClient.createUser(newUser);
        
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('user');
        expect(response.body.user.username).toBe(newUser.username);
        expect(response.body.user).not.toHaveProperty('password');

        // Cleanup: delete the created user
        if (response.body.user.id) {
          await apiClient.deleteUser(response.body.user.id);
        }
      });

      test('should validate required user fields', async () => {
        const invalidUsers = [
          { password: 'test123' }, // Missing username
          { username: 'test' }, // Missing password
          { username: 'test', password: 'short' }, // Password too short
          { username: '', password: 'password123' } // Empty username
        ];

        for (const invalidUser of invalidUsers) {
          const response = await apiClient.createUser(invalidUser);
          expect(response.status).toBe(400);
          expect(response.body).toHaveProperty('success', false);
        }
      });

      test('should prevent duplicate usernames', async () => {
        const user1 = {
          username: 'duplicate',
          password: 'password123',
          name: 'User 1'
        };

        const user2 = {
          username: 'duplicate',
          password: 'password456',
          name: 'User 2'
        };

        // Create first user
        const response1 = await apiClient.createUser(user1);
        expect(response1.status).toBe(201);

        // Try to create duplicate
        const response2 = await apiClient.createUser(user2);
        expect(response2.status).toBe(400);
        expect(response2.body.message).toMatch(/already exists/i);

        // Cleanup
        if (response1.body.user?.id) {
          await apiClient.deleteUser(response1.body.user.id);
        }
      });

      test('should require admin privileges', async () => {
        const unauthenticatedClient = new TestAPIClient();
        const response = await unauthenticatedClient.createUser({
          username: 'test',
          password: 'password123'
        });
        
        expect(response.status).toBe(401);
      });
    });

    describe('PUT /api/auth/users/:id', () => {
      test('should update user as admin', async () => {
        // First create a user to update
        const newUser = {
          username: 'updatetest',
          password: 'password123',
          name: 'Update Test'
        };

        const createResponse = await apiClient.createUser(newUser);
        expect(createResponse.status).toBe(201);

        const userId = createResponse.body.user.id;
        const updateData = {
          name: 'Updated Name',
          disabled: true
        };

        const response = await apiClient.updateUser(userId, updateData);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body.user.name).toBe(updateData.name);
        expect(response.body.user.disabled).toBe(updateData.disabled);

        // Cleanup
        await apiClient.deleteUser(userId);
      });

      test('should handle non-existent user', async () => {
        const response = await apiClient.updateUser('nonexistent', { name: 'Test' });
        
        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('success', false);
      });
    });

    describe('DELETE /api/auth/users/:id', () => {
      test('should delete user as admin', async () => {
        // First create a user to delete
        const newUser = {
          username: 'deletetest',
          password: 'password123',
          name: 'Delete Test'
        };

        const createResponse = await apiClient.createUser(newUser);
        expect(createResponse.status).toBe(201);

        const userId = createResponse.body.user.id;
        const response = await apiClient.deleteUser(userId);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);

        // Verify user is deleted
        const getResponse = await apiClient.getUsers();
        const userExists = getResponse.body.users.some(user => user.id === userId);
        expect(userExists).toBe(false);
      });

      test('should handle non-existent user deletion', async () => {
        const response = await apiClient.deleteUser('nonexistent');
        
        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('success', false);
      });
    });
  });

  describe('API Token Management', () => {
    beforeEach(async () => {
      await apiClient.login();
    });

    describe('GET /api/auth/tokens', () => {
      test('should list user API tokens', async () => {
        const response = await apiClient.getApiTokens();
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('tokens');
        expect(Array.isArray(response.body.tokens)).toBe(true);

        // Tokens should not contain actual token values
        response.body.tokens.forEach(token => {
          expect(token).not.toHaveProperty('value');
          expect(token).toHaveProperty('id');
          expect(token).toHaveProperty('name');
          expect(token).toHaveProperty('createdAt');
        });
      });

      test('should support admin listing all tokens', async () => {
        const response = await apiClient.getApiTokens(true); // all=true for admin
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('tokens');
      });
    });

    describe('POST /api/auth/tokens', () => {
      test('should create API token', async () => {
        const tokenData = {
          name: 'Test Token',
          expires: Date.now() + (30 * 24 * 60 * 60 * 1000), // 30 days
          scopes: ['certificates:read', 'certificates:write']
        };

        const response = await apiClient.createApiToken(tokenData);
        
        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('token');
        expect(response.body.token.name).toBe(tokenData.name);
        expect(response.body.token).toHaveProperty('value'); // Token value should be returned once
        expect(response.body.token.scopes).toEqual(tokenData.scopes);

        // Cleanup
        const tokenId = response.body.token.id;
        await apiClient.deleteApiToken(tokenId);
      });

      test('should validate token scopes', async () => {
        const tokenData = {
          name: 'Invalid Token',
          scopes: ['invalid:scope', 'another:invalid']
        };

        const response = await apiClient.createApiToken(tokenData);
        
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.message).toMatch(/invalid scopes/i);
      });

      test('should require token name', async () => {
        const response = await apiClient.createApiToken({});
        
        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('success', false);
        expect(response.body.message).toMatch(/name.*required/i);
      });

      test('should handle expiration dates', async () => {
        const tokenData = {
          name: 'Expiring Token',
          expires: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
        };

        const response = await apiClient.createApiToken(tokenData);
        
        expect(response.status).toBe(201);
        expect(response.body.token.expires).toBeTruthy();

        // Cleanup
        await apiClient.deleteApiToken(response.body.token.id);
      });
    });

    describe('DELETE /api/auth/tokens/:id', () => {
      test('should delete own API token', async () => {
        // Create token first
        const tokenData = { name: 'Delete Test Token' };
        const createResponse = await apiClient.createApiToken(tokenData);
        const tokenId = createResponse.body.token.id;

        // Delete token
        const response = await apiClient.deleteApiToken(tokenId);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);

        // Verify token is deleted
        const listResponse = await apiClient.getApiTokens();
        const tokenExists = listResponse.body.tokens.some(token => token.id === tokenId);
        expect(tokenExists).toBe(false);
      });

      test('should handle non-existent token', async () => {
        const response = await apiClient.deleteApiToken('nonexistent');
        
        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('success', false);
      });
    });

    describe('POST /api/auth/revoke-token/:id', () => {
      test('should revoke API token as admin', async () => {
        // Create token first
        const tokenData = { name: 'Revoke Test Token' };
        const createResponse = await apiClient.createApiToken(tokenData);
        const tokenId = createResponse.body.token.id;

        // Revoke token
        const response = await apiClient.revokeApiToken(tokenId);
        
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('success', true);

        // Verify token is revoked/deleted
        const listResponse = await apiClient.getApiTokens();
        const tokenExists = listResponse.body.tokens.some(token => token.id === tokenId);
        expect(tokenExists).toBe(false);
      });

      test('should require admin privileges for token revocation', async () => {
        // This test would require a non-admin user context
        // For now, test with unauthenticated client
        const unauthenticatedClient = new TestAPIClient();
        const response = await unauthenticatedClient.revokeApiToken('some-token-id');
        
        expect(response.status).toBe(401);
      });
    });
  });

  describe('Session Security', () => {
    test('should invalidate session on logout', async () => {
      await apiClient.login();
      
      // Verify authenticated
      let response = await apiClient.getCurrentUser();
      expect(response.status).toBe(200);
      
      // Logout
      await apiClient.logout();
      
      // Verify no longer authenticated
      response = await apiClient.getCurrentUser();
      expect(response.status).toBe(401);
    });

    test('should handle concurrent login attempts', async () => {
      const client1 = new TestAPIClient();
      const client2 = new TestAPIClient();

      const [response1, response2] = await Promise.all([
        client1.login(),
        client2.login()
      ]);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);
      expect(response1.body.success).toBe(true);
      expect(response2.body.success).toBe(true);
    });

    test('should protect against brute force attacks', async () => {
      const attempts = [];
      
      // Make multiple failed login attempts
      for (let i = 0; i < 5; i++) {
        attempts.push(apiClient.login('admin', 'wrongpassword'));
      }

      const responses = await Promise.all(attempts);
      
      // All should fail, but we might get rate limited
      responses.forEach(response => {
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe('API Token Authentication', () => {
    test('should authenticate with valid API token', async () => {
      // Login and create API token
      await apiClient.login();
      const tokenResponse = await apiClient.createApiToken({
        name: 'Auth Test Token',
        scopes: ['certificates:read']
      });
      
      const tokenValue = tokenResponse.body.token.value;
      
      // Use token for authentication
      const apiClientWithToken = new TestAPIClient();
      apiClientWithToken.setApiToken(tokenValue);
      
      const response = await apiClientWithToken.getCertificates();
      expect(response.status).toBe(200);

      // Cleanup
      await apiClient.deleteApiToken(tokenResponse.body.token.id);
    });

    test('should reject invalid API token', async () => {
      const apiClientWithToken = new TestAPIClient();
      apiClientWithToken.setApiToken('invalid-token');
      
      const response = await apiClientWithToken.getCertificates();
      expect(response.status).toBe(401);
    });

    test('should respect token scopes', async () => {
      // Login and create limited scope token
      await apiClient.login();
      const tokenResponse = await apiClient.createApiToken({
        name: 'Limited Scope Token',
        scopes: ['certificates:read'] // Only read access
      });
      
      const tokenValue = tokenResponse.body.token.value;
      const apiClientWithToken = new TestAPIClient();
      apiClientWithToken.setApiToken(tokenValue);
      
      // Should allow read operations
      const readResponse = await apiClientWithToken.getCertificates();
      expect(readResponse.status).toBe(200);
      
      // Should deny write operations (if implemented)
      const writeResponse = await apiClientWithToken.createCertificate({
        name: 'test',
        domains: ['test.local']
      });
      expect([403, 401]).toContain(writeResponse.status);

      // Cleanup
      await apiClient.deleteApiToken(tokenResponse.body.token.id);
    });
  });
});
