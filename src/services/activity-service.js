/**
 * Activity Service
 * Tracks and records system activities and events
 */
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');

const FILENAME = 'services/activity-service.js';

class ActivityService {
  /**
   * Create a new ActivityService
   * @param {Object} config - Application configuration
   */
  constructor(config) {
    this.config = config;
    this.dataDir = config.dataDir || path.join(process.cwd(), 'data');
    this.activitiesFile = path.join(this.dataDir, 'activities.json');
    this.activities = [];
    this.loaded = false;
    this.maxActivities = config.activity?.maxItems || 1000; // Max number of activities to store
  }
  
  /**
   * Initialize the ActivityService
   */
  async init() {
    try {
      await this.loadActivities();
      this.loaded = true;
      logger.info(`ActivityService initialized with ${this.activities.length} activities`, null, FILENAME);
    } catch (error) {
      logger.error('Failed to initialize ActivityService', { error: error.message }, FILENAME);
      // Create an empty activities file if it doesn't exist
      await this.saveActivities();
    }
  }
  
  /**
   * Load activities from file
   */
  async loadActivities() {
    try {
      // Create activities file if it doesn't exist
      try {
        await fs.access(this.activitiesFile);
      } catch (err) {
        logger.info('Activities file not found, creating new file', null, FILENAME);
        await fs.mkdir(path.dirname(this.activitiesFile), { recursive: true });
        await fs.writeFile(this.activitiesFile, JSON.stringify([], null, 2));
        this.activities = [];
        return;
      }
      
      // Read activities file
      const activitiesData = await fs.readFile(this.activitiesFile, 'utf8');
      this.activities = JSON.parse(activitiesData);
      
      logger.debug(`Loaded ${this.activities.length} activities from file`, null, FILENAME);
    } catch (error) {
      logger.error('Error loading activities from file', { error: error.message }, FILENAME);
      this.activities = [];
      throw error;
    }
  }
  
  /**
   * Save activities to file
   */
  async saveActivities() {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.activitiesFile), { recursive: true });
      
      // Save activities
      await fs.writeFile(this.activitiesFile, JSON.stringify(this.activities, null, 2));
      logger.debug(`Saved ${this.activities.length} activities to file`, null, FILENAME);
    } catch (error) {
      logger.error('Error saving activities to file', { error: error.message }, FILENAME);
      throw error;
    }
  }
  
  /**
   * Record a new activity
   * @param {string} type - Activity type
   * @param {string} message - Activity message
   * @param {Object} data - Additional data
   * @param {Object} user - User who performed the activity
   */
  async recordActivity(type, message, data = {}, user = null) {
    // Create activity object
    const activity = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      type,
      message,
      data,
      user: user ? {
        username: user.username,
        name: user.name
      } : null
    };
    
    // Add to activities array
    this.activities.unshift(activity); // Add to the beginning (newest first)
    
    // Trim to max length
    if (this.activities.length > this.maxActivities) {
      this.activities = this.activities.slice(0, this.maxActivities);
    }
    
    // Save to file (async, don't await to avoid blocking)
    this.saveActivities().catch(error => {
      logger.error('Failed to save activities', { error: error.message }, FILENAME);
    });
    
    return activity;
  }
  
  /**
   * Get recent activities
   * @param {number} limit - Maximum number of activities to return
   * @param {string} type - Filter by activity type
   * @param {string} search - Search term for filtering activities
   * @returns {Array} Activities
   */
  getActivities(limit = 50, type = null, search = null) {
    // Make sure this.activities is initialized as an array
    if (!this.activities || !Array.isArray(this.activities)) {
      logger.warn('Activities array is invalid, initializing as empty array', { 
        isArray: Array.isArray(this.activities),
        type: typeof this.activities
      }, FILENAME);
      this.activities = [];
    }
    
    let filtered = this.activities;
    
    // Filter by type if specified
    if (type) {
      filtered = filtered.filter(activity => activity.type === type);
    }
    
    // Filter by search term if specified
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(activity => {
        return (
          activity.message.toLowerCase().includes(searchLower) ||
          (activity.user?.username || '').toLowerCase().includes(searchLower) ||
          (activity.user?.name || '').toLowerCase().includes(searchLower) ||
          JSON.stringify(activity.data || {}).toLowerCase().includes(searchLower)
        );
      });
    }
    
    // Return limited results (make sure we're slicing an array)
    return Array.isArray(filtered) ? filtered.slice(0, limit) : [];
  }
  
  /**
   * Clear all activities
   * @returns {Promise<void>}
   */
  async clearAllActivities() {
    this.activities = [];
    await this.saveActivities();
    logger.info('All activities cleared', null, FILENAME);
  }
  
  /**
   * Generate a unique ID for an activity
   * @returns {string} Unique ID
   */
  generateId() {
    return `act_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  }
  
  /**
   * Record a certificate-related activity
   * @param {string} action - The action performed (created, renewed, etc.)
   * @param {Object} certificate - The certificate object
   * @param {Object} user - The user who performed the action
   * @returns {Object} The recorded activity
   */
  async recordCertificateActivity(action, certificate, user = null) {
    const certName = certificate.commonName || certificate.name || 'Unknown Certificate';
    let message = '';
    
    switch (action) {
      case 'create':
        message = `Certificate created: ${certName}`;
        break;
      case 'renew':
        message = `Certificate renewed: ${certName}`;
        break;
      case 'revoke':
        message = `Certificate revoked: ${certName}`;
        break;
      case 'delete':
        message = `Certificate deleted: ${certName}`;
        break;
      case 'import':
        message = `Certificate imported: ${certName}`;
        break;
      case 'export':
        message = `Certificate exported: ${certName}`;
        break;
      case 'deploy':
        message = `Certificate deployed: ${certName}`;
        break;
      default:
        message = `Certificate ${action}: ${certName}`;
    }
    
    return this.recordActivity('certificate', message, {
      action,
      certificateId: certificate.id,
      certificateName: certName,
      commonName: certificate.commonName,
      issuer: certificate.issuer,
      validFrom: certificate.validFrom,
      validTo: certificate.validTo
    }, user);
  }
  
  /**
   * Record a user-related activity
   * @param {string} action - The action performed (login, logout, etc.)
   * @param {Object} targetUser - The user the action was performed on
   * @param {Object} user - The user who performed the action (for admin actions)
   * @returns {Object} The recorded activity
   */
  async recordUserActivity(action, targetUser, user = null) {
    let message = '';
    
    switch (action) {
      case 'login':
        message = `User logged in: ${targetUser.username}`;
        return this.recordActivity('user', message, {
          action,
          username: targetUser.username,
          ip: targetUser.lastLoginIp
        }, targetUser);
        
      case 'logout':
        message = `User logged out: ${targetUser.username}`;
        return this.recordActivity('user', message, {
          action,
          username: targetUser.username
        }, targetUser);
        
      case 'create':
        message = `User created: ${targetUser.username}`;
        return this.recordActivity('user', message, {
          action,
          username: targetUser.username,
          role: targetUser.role
        }, user);
        
      case 'update':
        message = `User updated: ${targetUser.username}`;
        return this.recordActivity('user', message, {
          action,
          username: targetUser.username,
          role: targetUser.role
        }, user);
        
      case 'delete':
        message = `User deleted: ${targetUser.username}`;
        return this.recordActivity('user', message, {
          action,
          username: targetUser.username
        }, user);
        
      case 'password-change':
        message = `Password changed for: ${targetUser.username}`;
        return this.recordActivity('user', message, {
          action,
          username: targetUser.username
        }, targetUser);
        
      default:
        message = `User ${action}: ${targetUser.username}`;
        return this.recordActivity('user', message, {
          action,
          username: targetUser.username
        }, user);
    }
  }
  
  /**
   * Record a system-related activity
   * @param {string} action - The action performed
   * @param {Object} data - Additional data
   * @param {Object} user - The user who performed the action
   * @returns {Object} The recorded activity
   */
  async recordSystemActivity(action, data = {}, user = null) {
    let message = '';
    
    switch (action) {
      case 'startup':
        message = 'System started';
        break;
      case 'shutdown':
        message = 'System shutdown';
        break;
      case 'config-update':
        message = 'Configuration updated';
        break;
      case 'backup-create':
        message = 'Backup created';
        break;
      case 'backup-restore':
        message = 'Backup restored';
        break;
      case 'setup-complete':
        message = 'First-time setup completed';
        break;
      default:
        message = `System ${action}`;
    }
    
    return this.recordActivity('system', message, {
      action,
      ...data
    }, user);
  }
}

module.exports = ActivityService;