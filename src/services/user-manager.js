/**
 * User Manager Service
 * Handles user management, authentication and permission checks
 */
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const logger = require('./logger');

const FILENAME = 'services/user-manager.js';

class UserManager {
  /**
   * Create a new UserManager
   * @param {Object} config - Application configuration
   * @param {Object} activityService - Activity service for recording user activities
   */
  constructor(config, activityService = null) {
    this.config = config;
    this.activityService = activityService;
    this.configDir = config.configDir || path.join(process.cwd(), 'data');
    this.usersFile = path.join(this.configDir, 'users.json');
    this.users = new Map();
    this.loaded = false;
    
    logger.finest('UserManager instance created', { 
      configDir: this.configDir,
      usersFile: this.usersFile 
    }, FILENAME);
  }
  
  /**
   * Initialize the UserManager and load users
   */
  async init() {
    try {
      logger.fine('Initializing UserManager', null, FILENAME);
      await this.loadUsers();
      
      // Only create default admin if setup completed flag exists but no users
      // This handles migration from older versions without setup
      const setupFlagPath = path.join(this.configDir, '.setup-completed');
      let setupCompleted = false;
      
      try {
        await fs.access(setupFlagPath);
        setupCompleted = true;
        logger.fine('Setup flag found, setup is completed', null, FILENAME);
      } catch (err) {
        // Setup flag doesn't exist
        logger.fine('Setup flag not found, will check if setup is needed', null, FILENAME);
      }
      
      if (setupCompleted && this.users.size === 0) {
        logger.info('No users found but setup is marked as completed, creating default admin user', null, FILENAME);
        const defaultPassword = process.env.DEFAULT_ADMIN_PASSWORD || this.generateRandomPassword();
        await this.createUser({
          username: 'admin',
          password: defaultPassword,
          name: 'Administrator',
          role: 'admin',
          disabled: false
        });
        
        logger.info('Created default admin user', { username: 'admin' }, FILENAME);
        logger.info(`Default admin password: ${defaultPassword}`, null, FILENAME);
      }
      
      this.loaded = true;
      logger.info(`UserManager initialized with ${this.users.size} users`, null, FILENAME);
    } catch (error) {
      logger.error('Failed to initialize UserManager', { 
        error: error.message,
        stack: error.stack
      }, FILENAME);
      throw error;
    }
  }
  
  /**
   * Load users from file
   */
  async loadUsers() {
    try {
      logger.fine('Loading users from file', { filePath: this.usersFile }, FILENAME);
      
      // Create users file if it doesn't exist
      try {
        await fs.access(this.usersFile);
        logger.finest('Users file exists', null, FILENAME);
      } catch (err) {
        logger.info('Users file not found, creating new file', null, FILENAME);
        await fs.mkdir(path.dirname(this.usersFile), { recursive: true });
        await fs.writeFile(this.usersFile, JSON.stringify([], null, 2));
        logger.fine('Created empty users file', null, FILENAME);
      }
      
      // Read users file
      logger.finest('Reading users from file', null, FILENAME);
      const usersData = await fs.readFile(this.usersFile, 'utf8');
      const users = JSON.parse(usersData);
      
      this.users.clear();
      users.forEach(user => {
        this.users.set(user.username, user);
        logger.finest('Loaded user', { username: user.username, role: user.role }, FILENAME);
      });
      
      logger.debug(`Loaded ${this.users.size} users from file`, null, FILENAME);
    } catch (error) {
      logger.error('Error loading users from file', { 
        error: error.message,
        stack: error.stack,
        filePath: this.usersFile
      }, FILENAME);
      throw error;
    }
  }
  
  /**
   * Save users to file
   */
  async saveUsers() {
    try {
      logger.fine('Saving users to file', { count: this.users.size }, FILENAME);
      
      const users = Array.from(this.users.values());
      await fs.writeFile(this.usersFile, JSON.stringify(users, null, 2));
      
      logger.debug(`Saved ${users.length} users to file`, null, FILENAME);
    } catch (error) {
      logger.error('Error saving users to file', { 
        error: error.message,
        stack: error.stack,
        filePath: this.usersFile
      }, FILENAME);
      throw error;
    }
  }
  
  /**
   * Get a user by username
   * @param {string} username - Username to look up
   * @returns {Object|null} User object or null if not found
   */
  getUser(username) {
    logger.finest('Getting user', { username }, FILENAME);
    
    if (!username) {
      logger.fine('Username is empty, returning null', null, FILENAME);
      return null;
    }
    
    const user = this.users.get(username);
    if (user) {
      logger.fine('User found', { username, role: user.role }, FILENAME);
    } else {
      logger.fine('User not found', { username }, FILENAME);
    }
    
    return user || null;
  }
  
  /**
   * Get all users
   * @returns {Array} Array of user objects (with passwords removed)
   */
  getAllUsers() {
    logger.fine('Getting all users', { count: this.users.size }, FILENAME);
    
    return Array.from(this.users.values()).map(user => {
      const { password, ...userWithoutPassword } = user;
      logger.finest('Returning user without password', { username: user.username }, FILENAME);
      return userWithoutPassword;
    });
  }
  
  /**
   * Create a new user
   * @param {Object} userData - User data
   * @param {Object} actingUser - User performing the action
   * @returns {Object} Created user
   */
  async createUser(userData, actingUser = null) {
    logger.fine('Creating new user', { 
      username: userData.username,
      role: userData.role || 'user',
      actingUser: actingUser?.username
    }, FILENAME);
    
    if (!userData.username || !userData.password) {
      logger.warn('Create user failed: Missing username or password', null, FILENAME);
      throw new Error('Username and password are required');
    }
    
    // Check if user already exists
    if (this.users.has(userData.username)) {
      logger.warn('Create user failed: Username already exists', { username: userData.username }, FILENAME);
      throw new Error('Username already exists');
    }
    
    // Hash password
    logger.finest('Hashing password for new user', { username: userData.username }, FILENAME);
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    
    // Create user object
    const user = {
      username: userData.username,
      password: hashedPassword,
      name: userData.name || userData.username,
      role: userData.role || 'user',
      disabled: userData.disabled === true,
      created: Date.now(),
      lastLogin: null,
      lastLoginIp: null,
      loginCount: 0,
      passwordChanged: Date.now() // Store in milliseconds for JWT comparison
    };
    
    // Add user to map and save to file
    this.users.set(user.username, user);
    await this.saveUsers();
    
    logger.info('Created new user', { username: user.username, role: user.role }, FILENAME);
    
    // Record activity
    if (this.activityService) {
      logger.fine('Recording user creation activity', { username: user.username }, FILENAME);
      await this.activityService.recordUserActivity('create', {
        username: user.username,
        name: user.name,
        role: user.role
      }, actingUser);
    }
    
    // Return user without password
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  
  /**
   * Update an existing user
   * @param {string} username - Username of user to update
   * @param {Object} userData - User data to update
   * @param {Object} actingUser - User performing the action
   * @returns {Object} Updated user
   */
  async updateUser(username, userData, actingUser = null) {
    logger.fine('Updating user', { 
      username,
      fields: Object.keys(userData).join(','),
      actingUser: actingUser?.username
    }, FILENAME);
    
    const user = this.users.get(username);
    if (!user) {
      logger.warn('Update user failed: User not found', { username }, FILENAME);
      throw new Error('User not found');
    }
    
    // Update user fields
    if (userData.name) {
      logger.finest('Updating user name', { username, oldName: user.name, newName: userData.name }, FILENAME);
      user.name = userData.name;
    }
    
    if (userData.role) {
      logger.finest('Updating user role', { username, oldRole: user.role, newRole: userData.role }, FILENAME);
      user.role = userData.role;
    }
    
    if (userData.disabled !== undefined) {
      logger.finest('Updating user disabled status', { 
        username, 
        oldStatus: user.disabled, 
        newStatus: userData.disabled 
      }, FILENAME);
      user.disabled = userData.disabled;
    }
    
    // Update password if provided
    if (userData.password) {
      logger.finest('Updating user password', { username }, FILENAME);
      user.password = await bcrypt.hash(userData.password, 10);
      user.passwordChanged = Date.now();
    }
    
    // Save changes
    await this.saveUsers();
    
    logger.info('Updated user', { 
      username,
      role: user.role,
      disabled: user.disabled,
      passwordChanged: userData.password ? true : false
    }, FILENAME);
    
    // Record activity
    if (this.activityService) {
      logger.fine('Recording user update activity', { username }, FILENAME);
      await this.activityService.recordUserActivity('update', {
        username: user.username,
        name: user.name,
        role: user.role,
        disabled: user.disabled,
        passwordChanged: userData.password ? true : false
      }, actingUser);
    }
    
    // Return user without password
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  
  /**
   * Delete a user
   * @param {string} username - Username of user to delete
   * @param {Object} actingUser - User performing the action
   * @returns {boolean} Success status
   */
  async deleteUser(username, actingUser = null) {
    logger.fine('Deleting user', { 
      username,
      actingUser: actingUser?.username
    }, FILENAME);
    
    if (!this.users.has(username)) {
      logger.warn('Delete user failed: User not found', { username }, FILENAME);
      throw new Error('User not found');
    }
    
    // Prevent deleting the last admin user
    const user = this.users.get(username);
    if (user.role === 'admin') {
      logger.fine('Checking if this is the last admin user', { username }, FILENAME);
      const admins = Array.from(this.users.values()).filter(u => u.role === 'admin');
      if (admins.length === 1) {
        logger.warn('Delete user failed: Cannot delete the last admin user', { username }, FILENAME);
        throw new Error('Cannot delete the last admin user');
      }
    }
    
    // Delete user
    this.users.delete(username);
    await this.saveUsers();
    
    logger.info('Deleted user', { username, role: user.role }, FILENAME);
    
    // Record activity
    if (this.activityService) {
      logger.fine('Recording user deletion activity', { username }, FILENAME);
      await this.activityService.recordUserActivity('delete', {
        username,
        role: user.role
      }, actingUser);
    }
    
    return true;
  }
  
  /**
   * Authenticate a user
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Object|null} User object if authentication successful, null otherwise
   */
  async authenticate(username, password) {
    logger.fine('Authenticating user', { username }, FILENAME);
    
    const user = this.users.get(username);
    if (!user) {
      logger.debug('Authentication failed: user not found', { username }, FILENAME);
      return null;
    }
    
    // Check if user is disabled
    if (user.disabled) {
      logger.debug('Authentication failed: user is disabled', { username }, FILENAME);
      return null;
    }
    
    // Compare password
    try {
      logger.finest('Comparing passwords for user authentication', { username }, FILENAME);
      const passwordMatch = await bcrypt.compare(password, user.password);
      
      if (!passwordMatch) {
        logger.debug('Authentication failed: invalid password', { username }, FILENAME);
        return null;
      }
      
      logger.debug('Authentication successful', { username, role: user.role }, FILENAME);
      return user;
    } catch (error) {
      logger.error('Error comparing passwords during authentication', { 
        error: error.message,
        stack: error.stack,
        username
      }, FILENAME);
      return null;
    }
  }
  
  /**
   * Update user's last login information
   * @param {string} username - Username
   * @param {string} ip - IP address
   */
  async updateLastLogin(username, ip) {
    logger.fine('Updating last login information', { username, ip }, FILENAME);
    
    const user = this.users.get(username);
    if (!user) {
      logger.warn('Cannot update last login: user not found', { username }, FILENAME);
      return;
    }
    
    const previousLogin = user.lastLogin;
    user.lastLogin = Date.now();
    user.lastLoginIp = ip;
    user.loginCount = (user.loginCount || 0) + 1;
    
    await this.saveUsers();
    
    logger.debug('Updated last login information', { 
      username, 
      ip,
      previousLogin: previousLogin ? new Date(previousLogin).toISOString() : 'never',
      loginCount: user.loginCount
    }, FILENAME);
  }
  
  /**
   * Generate a random password
   * @param {number} length - Length of the password
   * @returns {string} Random password
   */
  generateRandomPassword(length = 16) {
    logger.fine('Generating random password', { length }, FILENAME);
    
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+';
    let password = '';
    
    try {
      for (let i = 0; i < length; i++) {
        const randomIndex = crypto.randomInt(0, charset.length);
        password += charset[randomIndex];
      }
      
      // Simple check to ensure password meets complexity requirements
      const hasLower = /[a-z]/.test(password);
      const hasUpper = /[A-Z]/.test(password);
      const hasNumber = /[0-9]/.test(password);
      const hasSpecial = /[^A-Za-z0-9]/.test(password);
      
      logger.finest('Password complexity check', { 
        hasLower, hasUpper, hasNumber, hasSpecial 
      }, FILENAME);
      
      if (hasLower && hasUpper && hasNumber && hasSpecial) {
        logger.fine('Generated strong random password', null, FILENAME);
      } else {
        logger.warn('Generated password does not meet all complexity requirements', null, FILENAME);
      }
      
      return password;
    } catch (error) {
      logger.error('Error generating random password', { 
        error: error.message,
        stack: error.stack
      }, FILENAME);
      
      // Fallback to a simpler method if crypto fails
      const fallbackPassword = Math.random().toString(36).slice(2) + 
                              Math.random().toString(36).toUpperCase().slice(2);
      
      logger.warn('Used fallback password generation method', null, FILENAME);
      return fallbackPassword.slice(0, length);
    }
  }

  /**
   * Check if setup is needed (no users exist)
   * @returns {Promise<boolean>} True if setup is needed
   */
  async isSetupNeeded() {
    logger.fine('Checking if setup is needed', null, FILENAME);
    
    // If no users exist, setup is needed
    if (this.users.size === 0) {
      logger.debug('Setup is needed: no users exist', null, FILENAME);
      return true;
    }
    
    // If setup flag file exists, setup is not needed
    try {
      const setupFlagPath = path.join(this.configDir, '.setup-completed');
      await fs.access(setupFlagPath);
      
      const flagContent = await fs.readFile(setupFlagPath, 'utf8');
      logger.debug('Setup is not needed: setup flag exists', { timestamp: flagContent }, FILENAME);
      return false; // File exists, setup already completed
    } catch (error) {
      // File doesn't exist, check if we still have users
      const setupNeeded = this.users.size === 0;
      logger.debug(`Setup flag missing but ${setupNeeded ? 'no' : 'some'} users exist. Setup ${setupNeeded ? 'is' : 'not'} needed`, 
        { userCount: this.users.size }, FILENAME);
      return setupNeeded;
    }
  }

  /**
   * Mark setup as completed
   */
  async markSetupCompleted() {
    logger.fine('Marking setup as completed', null, FILENAME);
    
    const setupFlagPath = path.join(this.configDir, '.setup-completed');
    const timestamp = new Date().toISOString();
    
    try {
      await fs.writeFile(setupFlagPath, timestamp);
      logger.info('Setup marked as completed', { timestamp }, FILENAME);
    } catch (error) {
      logger.error('Failed to mark setup as completed', { 
        error: error.message,
        stack: error.stack,
        path: setupFlagPath
      }, FILENAME);
      throw error;
    }
  }
  
  /**
   * Check if a user exists
   * @param {string} username - Username to check
   * @returns {boolean} True if user exists
   */
  userExists(username) {
    logger.finest('Checking if user exists', { username }, FILENAME);
    const exists = this.users.has(username);
    logger.fine(`User "${username}" ${exists ? 'exists' : 'does not exist'}`, null, FILENAME);
    return exists;
  }
  
  /**
   * Get count of users by role
   * @returns {Object} Count of users by role
   */
  getUserStatistics() {
    logger.fine('Getting user statistics', null, FILENAME);
    
    const stats = {
      total: this.users.size,
      active: 0,
      disabled: 0,
      admins: 0,
      users: 0,
      neverLoggedIn: 0,
      recentlyActive: 0 // Users active in last 30 days
    };
    
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    this.users.forEach(user => {
      if (user.disabled) {
        stats.disabled++;
      } else {
        stats.active++;
      }
      
      if (user.role === 'admin') {
        stats.admins++;
      } else {
        stats.users++;
      }
      
      if (!user.lastLogin) {
        stats.neverLoggedIn++;
      } else if (user.lastLogin > thirtyDaysAgo) {
        stats.recentlyActive++;
      }
    });
    
    logger.debug('User statistics calculated', { stats }, FILENAME);
    return stats;
  }

  /**
   * Create a new API token
   * @param {Object} tokenData - Token data
   * @param {string} tokenData.name - Token name
   * @param {string} tokenData.username - Username
   * @param {Date} [tokenData.expires] - Expiration date
   * @param {Array<string>} [tokenData.scopes] - Permission scopes
   * @returns {Promise<Object>} Created token
   */
  async createApiToken(tokenData) {
    const { name, username, expires, scopes = [] } = tokenData;

    // Validate user exists
    const user = this.getUser(username);
    if (!user) {
        throw new Error(`User ${username} not found`);
    }

    // Generate token ID and value
    const id = crypto.randomUUID();
    const tokenValue = `${username}.${crypto.randomBytes(32).toString('hex')}`;

    // Create token object
    const token = {
        id,
        name,
        username,
        value: tokenValue,
        createdAt: new Date().toISOString(),
        lastUsed: null,
        expires: expires ? expires.toISOString() : null,
        scopes
    };

    // Get existing tokens or initialize empty array
    const apiTokens = this.config.get('apiTokens') || [];
    
    // Store token (with hashed value)
    const tokenHash = crypto.createHash('sha256').update(tokenValue).digest('hex');
    const storedToken = {
        ...token,
        value: tokenHash
    };
    delete storedToken.tokenValue;

    apiTokens.push(storedToken);
    await this.config.update({ apiTokens });

    logger.debug('API token created', { username, tokenId: id }, FILENAME);
    
    return token; // Return full token including value (only done once upon creation)
  }
  
  /**
   * Get all API tokens for a user
   * @param {string} username - Username
   * @returns {Promise<Array<Object>>} User's API tokens
   */
  async getUserApiTokens(username) {
    const apiTokens = this.config.get('apiTokens') || [];
    return apiTokens.filter(token => token.username === username);
  }
  
  /**
   * Get all API tokens (admin only)
   * @returns {Promise<Array<Object>>} All API tokens
   */
  async getAllApiTokens() {
    return this.config.get('apiTokens') || [];
  }
  
  /**
   * Get API token by ID
   * @param {string} id - Token ID
   * @returns {Promise<Object|null>} Token if found, null otherwise
   */
  async getApiToken(id) {
    const apiTokens = this.config.get('apiTokens') || [];
    return apiTokens.find(token => token.id === id) || null;
  }
  
  /**
   * Delete an API token
   * @param {string} id - Token ID
   * @returns {Promise<boolean>} Whether token was deleted
   */
  async deleteApiToken(id) {
    const apiTokens = this.config.get('apiTokens') || [];
    const initialLength = apiTokens.length;
    
    // Filter out the token to delete
    const updatedTokens = apiTokens.filter(token => token.id !== id);
    
    if (updatedTokens.length === initialLength) {
      // Token wasn't found
      return false;
    }
    
    await this.config.update({ apiTokens: updatedTokens });
    logger.debug('API token deleted', { tokenId: id }, FILENAME);
    
    return true;
  }
  
  /**
   * Update token last used timestamp
   * @param {string} id - Token ID
   * @returns {Promise<void>}
   */
  async updateTokenLastUsed(id) {
    const apiTokens = this.config.get('apiTokens') || [];
    const tokenIndex = apiTokens.findIndex(token => token.id === id);
    
    if (tokenIndex >= 0) {
      apiTokens[tokenIndex].lastUsed = new Date().toISOString();
      await this.config.update({ apiTokens });
    }
  }
  
  /**
   * Validate API token
   * @param {string} tokenValue - Raw token value
   * @returns {Promise<{token: Object, user: Object}|null>} Token and user if valid, null otherwise
   */
  async validateApiToken(tokenValue) {
    try {
      if (!tokenValue) return null;
      
      // Extract username from token
      const parts = tokenValue.split('.');
      if (parts.length !== 2) return null;
      
      const username = parts[0];
      
      // Get user and verify exists
      const user = this.getUser(username);
      if (!user || user.disabled) return null;
      
      // Hash token for comparison
      const tokenHash = crypto.createHash('sha256').update(tokenValue).digest('hex');
      
      // Get tokens
      const apiTokens = this.config.get('apiTokens') || [];
      const token = apiTokens.find(t => 
        t.username === username && t.value === tokenHash
      );
      
      if (!token) return null;
      
      // Check if token has expired
      if (token.expires && new Date(token.expires) < new Date()) {
        logger.debug('API token expired', { username, tokenId: token.id }, FILENAME);
        return null;
      }
      
      // Update last used timestamp
      await this.updateTokenLastUsed(token.id);
      
      return { token, user };
    } catch (error) {
      logger.error('Error validating API token', { error: error.message }, FILENAME);
      return null;
    }
  }

  /**
   * Validate an API token
   * @param {string} tokenValue - Raw API token value
   * @returns {Promise<Object|null>} - User and token object if valid, null if invalid
   */
  async validateApiToken(tokenValue) {
    try {
        // Check if tokenValue is valid
        if (!tokenValue || typeof tokenValue !== 'string' || !tokenValue.includes('.')) {
            return null;
        }

        // Extract username from token (format: username.tokenHash)
        const [username, tokenPart] = tokenValue.split('.');
        if (!username || !tokenPart) {
            return null;
        }

        // Get user
        const user = this.getUser(username);
        if (!user || user.disabled) {
            logger.debug('API token validation failed: user not found or disabled', { username }, FILENAME);
            return null;
        }

        // Get API tokens
        const apiTokens = this.config.get('apiTokens') || [];
        
        // Hash the provided token value for comparison
        const tokenHash = crypto.createHash('sha256').update(tokenValue).digest('hex');
        
        // Find matching token
        const token = apiTokens.find(t => t.username === username && t.value === tokenHash);
        
        if (!token) {
            logger.debug('API token validation failed: no matching token', { username }, FILENAME);
            return null;
        }
        
        // Check if token has expired
        if (token.expires && new Date(token.expires) < new Date()) {
            logger.debug('API token validation failed: token expired', { 
                username, tokenId: token.id 
            }, FILENAME);
            return null;
        }
        
        // Update last used timestamp
        token.lastUsed = new Date().toISOString();
        await this.config.update({ apiTokens });
        
        logger.debug('API token validated successfully', { 
            username, tokenId: token.id, tokenName: token.name 
        }, FILENAME);
        
        return { user, token };
    } catch (error) {
        logger.error('Error validating API token', { error: error.message }, FILENAME);
        return null;
    }
  }
}

module.exports = UserManager;