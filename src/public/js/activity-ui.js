/**
 * Certificate Manager - Activity UI
 * Handles the activity log view and interactions
 */

/**
 * Initialize the activity log UI
 */
function setupActivityUI() {
  // DOM elements
  const activityContainer = document.getElementById('activity-log-container');
  const activityFilters = document.getElementById('activity-filters');
  const activitySearch = document.getElementById('activity-search');
  const activityTypeFilter = document.getElementById('activity-type-filter');
  const activityClearBtn = document.getElementById('clear-activities-btn');
  
  // Load initial activities
  loadActivities();
  
  // Set up event listeners
  if (activitySearch) {
    activitySearch.addEventListener('input', debounce(function() {
      loadActivities();
    }, 500));
  }
  
  if (activityTypeFilter) {
    activityTypeFilter.addEventListener('change', function() {
      loadActivities();
    });
  }
  
  if (activityClearBtn) {
    activityClearBtn.addEventListener('click', function() {
      if (confirm('Are you sure you want to clear all activity logs? This action cannot be undone.')) {
        clearActivities();
      }
    });
  }
  
  /**
   * Load activities from API
   */
  function loadActivities() {
    if (!activityContainer) return;
    
    // Show loading state
    activityContainer.innerHTML = '<div class="loading-spinner"></div>';
    
    // Get filter values
    const limit = 100;
    const type = activityTypeFilter ? activityTypeFilter.value : null;
    const search = activitySearch ? activitySearch.value : null;
    
    // Build query string
    let queryParams = `limit=${limit}`;
    if (type && type !== 'all') queryParams += `&type=${type}`;
    if (search) queryParams += `&search=${encodeURIComponent(search)}`;
    
    // Fetch activities
    fetch(`/api/activity?${queryParams}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        if (data.success) {
          renderActivities(data.activities);
        } else {
          throw new Error(data.message || 'Unknown error');
        }
      })
      .catch(error => {
        activityContainer.innerHTML = `
          <div class="error-message">
            <i class="fas fa-exclamation-triangle"></i>
            Failed to load activities: ${error.message}
          </div>
          <button class="button secondary" onclick="loadActivities()">
            <i class="fas fa-sync"></i> Retry
          </button>
        `;
      });
  }
  
  /**
   * Render activities in the container
   * @param {Array} activities - List of activities
   */
  function renderActivities(activities) {
    if (!activityContainer) return;
    
    if (activities.length === 0) {
      activityContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-history"></i>
          <p>No activities to display.</p>
        </div>
      `;
      return;
    }
    
    // Group activities by day
    const groupedActivities = groupActivitiesByDay(activities);
    
    // Generate HTML
    let html = '';
    
    for (const [day, dayActivities] of Object.entries(groupedActivities)) {
      html += `
        <div class="activity-day">
          <div class="day-header">${formatDay(day)}</div>
          <div class="activity-list">
      `;
      
      for (const activity of dayActivities) {
        html += renderActivityItem(activity);
      }
      
      html += `
          </div>
        </div>
      `;
    }
    
    activityContainer.innerHTML = html;
    
    // Add event listeners to expandable details
    document.querySelectorAll('.activity-details-toggle').forEach(toggle => {
      toggle.addEventListener('click', function() {
        const details = this.closest('.activity-item').querySelector('.activity-details');
        details.classList.toggle('expanded');
        this.querySelector('i').classList.toggle('fa-chevron-down');
        this.querySelector('i').classList.toggle('fa-chevron-up');
      });
    });
  }
  
  /**
   * Render a single activity item
   * @param {Object} activity - Activity object
   * @returns {string} HTML string
   */
  function renderActivityItem(activity) {
    const { id, type, message, timestamp, user, data } = activity;
    
    const typeIcon = getActivityTypeIcon(type);
    const typeClass = `activity-type-${type}`;
    const time = formatTime(timestamp);
    
    let actorHtml = '';
    if (user) {
      actorHtml = `<span class="activity-actor">${user.name || user.username}</span>`;
    }
    
    // Check if there's additional data to show
    const hasDetails = data && Object.keys(data).length > 0;
    
    return `
      <div class="activity-item ${typeClass}" data-id="${id}">
        <div class="activity-icon">
          <i class="${typeIcon}"></i>
        </div>
        <div class="activity-content">
          <div class="activity-header">
            <span class="activity-message">${message}</span>
            ${actorHtml}
          </div>
          <div class="activity-meta">
            <span class="activity-time">${time}</span>
            ${hasDetails ? `
              <button class="activity-details-toggle" title="Show Details">
                <i class="fas fa-chevron-down"></i>
              </button>
            ` : ''}
          </div>
          ${hasDetails ? `
            <div class="activity-details">
              <pre>${JSON.stringify(data, null, 2)}</pre>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }
  
  /**
   * Get an icon for an activity type
   * @param {string} type - Activity type
   * @returns {string} Font Awesome icon class
   */
  function getActivityTypeIcon(type) {
    switch (type) {
      case 'certificate':
        return 'fas fa-certificate';
      case 'user':
        return 'fas fa-user';
      case 'system':
        return 'fas fa-server';
      default:
        return 'fas fa-history';
    }
  }
  
  /**
   * Group activities by day
   * @param {Array} activities - List of activities
   * @returns {Object} Activities grouped by day
   */
  function groupActivitiesByDay(activities) {
    return activities.reduce((groups, activity) => {
      const date = new Date(activity.timestamp);
      const day = date.toISOString().split('T')[0]; // YYYY-MM-DD
      
      if (!groups[day]) {
        groups[day] = [];
      }
      
      groups[day].push(activity);
      return groups;
    }, {});
  }
  
  /**
   * Format a day string for display
   * @param {string} dayStr - ISO date string (YYYY-MM-DD)
   * @returns {string} Formatted day string
   */
  function formatDay(dayStr) {
    const date = new Date(dayStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString(undefined, { 
        weekday: 'long',
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    }
  }
  
  /**
   * Format a timestamp for display
   * @param {string} timestamp - ISO timestamp
   * @returns {string} Formatted time
   */
  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(undefined, { 
      hour: '2-digit', 
      minute: '2-digit'
    });
  }
  
  /**
   * Clear all activities
   */
  function clearActivities() {
    fetch('/api/activity', {
      method: 'DELETE'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      if (data.success) {
        showToast('Activities cleared successfully', 'success');
        loadActivities();
      } else {
        throw new Error(data.message || 'Unknown error');
      }
    })
    .catch(error => {
      showToast(`Failed to clear activities: ${error.message}`, 'error');
    });
  }
  
  /**
   * Debounce function to limit how often a function is called
   * @param {Function} func - Function to debounce
   * @param {number} wait - Milliseconds to wait
   * @returns {Function} Debounced function
   */
  function debounce(func, wait) {
    let timeout;
    return function() {
      const context = this;
      const args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        func.apply(context, args);
      }, wait);
    };
  }
}

// Export function to global scope
window.setupActivityUI = setupActivityUI;