/**
 * @module ActivityService
 * @requires fs
 * @requires path
 * @requires logger
 * @description Manages certificate and system activity events
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class ActivityService {
    constructor(configDir) {
        this.configDir = configDir || path.join(process.cwd(), 'config');
        this.activityFile = path.join(this.configDir, 'activity.json');
        this.activities = [];
        this.maxActivities = 100; // Maximum number of activities to store
        
        // Initialize activities storage
        this.loadActivities();
    }
    
    /**
     * Load activities from storage
     */
    loadActivities() {
        try {
            if (fs.existsSync(this.activityFile)) {
                const data = fs.readFileSync(this.activityFile, 'utf8');
                this.activities = JSON.parse(data);
                logger.debug(`Loaded ${this.activities.length} activities from storage`);
            } else {
                logger.debug('No activity file found, creating new activity log');
                this.activities = [];
                this.saveActivities();
            }
        } catch (error) {
            logger.error('Error loading activities:', error);
            this.activities = [];
        }
    }
    
    /**
     * Save activities to storage
     */
    saveActivities() {
        try {
            // Ensure config directory exists
            if (!fs.existsSync(this.configDir)) {
                fs.mkdirSync(this.configDir, { recursive: true });
            }
            
            fs.writeFileSync(
                this.activityFile,
                JSON.stringify(this.activities, null, 2)
            );
        } catch (error) {
            logger.error('Error saving activities:', error);
        }
    }
    
    /**
     * Add a new activity
     * @param {string} action - Activity description
     * @param {string} type - Activity type (create, renew, delete, etc.)
     * @param {string} target - Target of the activity (certificate name, etc.)
     * @param {Object} metadata - Additional metadata
     */
    addActivity(action, type, target, metadata = {}) {
        const activity = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            action,
            type,
            target,
            metadata
        };
        
        // Add to the beginning of the array
        this.activities.unshift(activity);
        
        // Trim if exceeded max activities
        if (this.activities.length > this.maxActivities) {
            this.activities = this.activities.slice(0, this.maxActivities);
        }
        
        // Save to disk
        this.saveActivities();
        
        return activity;
    }
    
    /**
     * Get recent activities
     * @param {number} limit - Maximum number of activities to return
     * @returns {Array} Recent activities
     */
    getRecentActivities(limit = 20) {
        return this.activities.slice(0, limit);
    }
    
    /**
     * Get activities filtered by type
     * @param {string} type - Activity type to filter by
     * @param {number} limit - Maximum number of activities to return
     * @returns {Array} Filtered activities
     */
    getActivitiesByType(type, limit = 20) {
        return this.activities
            .filter(activity => activity.type === type)
            .slice(0, limit);
    }
    
    /**
     * Clear all activities
     */
    clearActivities() {
        this.activities = [];
        this.saveActivities();
    }
}

module.exports = ActivityService;