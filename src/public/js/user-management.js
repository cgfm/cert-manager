/**
 * User Management Module
 * Handles user and API token management functionality
 */

// State for user management
const userManagement = {
  users: [],
  tokens: [],
  currentUser: null,
  isAdmin: false
};

/**
 * Initialize user management functionality
 */
async function initUserManagement() {
  Logger.debug('Initializing user management module');
  
  // Set up the change password form
  setupChangePasswordForm();
  
  // Get current user info
  try {
    const response = await fetch('/api/auth/user');
    const data = await response.json();
    
    if (data.success && data.user) {
      userManagement.currentUser = data.user;
      userManagement.isAdmin = data.user.role === 'admin';
      
      // Show/hide admin-only elements based on user role
      document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = userManagement.isAdmin ? 'block' : 'none';
      });
      
      document.querySelectorAll('.user-only').forEach(el => {
        el.style.display = userManagement.isAdmin ? 'none' : 'block';
      });
      
      // If admin, set up admin functionality
      if (userManagement.isAdmin) {
        setupUsersTable();
        setupUserFormHandlers();
      }
    }
  } catch (error) {
    Logger.error('Error fetching current user:', error);
  }
  
  // Set up token management for all users
  setupTokensTab();
}

/**
 * Set up change password form
 */
function setupChangePasswordForm() {
  const form = document.getElementById('change-password-form');
  
  if (!form) return;
  
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      UIUtils.showToast('Please fill in all password fields', 'error');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      UIUtils.showToast('New passwords do not match', 'error');
      return;
    }
    
    if (newPassword.length < 8) {
      UIUtils.showToast('New password must be at least 8 characters long', 'error');
      return;
    }
    
    // Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Changing Password...';
    
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        UIUtils.showToast('Password changed successfully. Please login again.', 'success');
        
        // Clear form
        form.reset();
        
        // Redirect to login after 2 seconds
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      } else {
        UIUtils.showToast(data.message || 'Failed to change password', 'error');
      }
    } catch (error) {
      Logger.error('Error changing password:', error);
      UIUtils.showToast('An error occurred while changing password', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

/**
 * Set up users table for admin users
 */
async function setupUsersTable() {
  const usersContainer = document.getElementById('users-table').querySelector('tbody');
  const loadingEl = document.getElementById('users-loading');
  const emptyEl = document.getElementById('users-empty');
  const errorEl = document.getElementById('users-error');
  
  // Create user button
  const createUserBtn = document.getElementById('create-user-btn');
  if (createUserBtn) {
    createUserBtn.addEventListener('click', () => {
      showUserModal();
    });
  }
  
  // Retry button
  const retryBtn = document.getElementById('retry-load-users');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      loadUsers();
    });
  }
  
  async function loadUsers() {
    usersContainer.innerHTML = '';
    loadingEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    errorEl.classList.add('hidden');
    
    try {
      const response = await fetch('/api/auth/users');
      const data = await response.json();
      
      if (data.success && Array.isArray(data.users)) {
        userManagement.users = data.users;
        
        loadingEl.classList.add('hidden');
        
        if (data.users.length === 0) {
          emptyEl.classList.remove('hidden');
          return;
        }
        
        // Render users
        data.users.forEach(user => {
          const row = document.createElement('tr');
          
          const lastLogin = user.lastLogin ? new Date(user.lastLogin) : null;
          const formattedLastLogin = lastLogin ? lastLogin.toLocaleString() : 'Never';
          
          row.innerHTML = `
            <td>${UIUtils.escapeHTML(user.username)}</td>
            <td>${UIUtils.escapeHTML(user.name || '')}</td>
            <td>${UIUtils.escapeHTML(user.role || 'user')}</td>
            <td>${formattedLastLogin}</td>
            <td>
              <span class="status-badge ${user.disabled ? 'status-inactive' : 'status-active'}">
                ${user.disabled ? 'Disabled' : 'Active'}
              </span>
            </td>
            <td class="actions-column">
              <button class="button small edit-user" data-username="${user.username}">
                <i class="fas fa-edit"></i> Edit
              </button>
              ${user.username !== userManagement.currentUser.username ? `
                <button class="button small danger-outline delete-user" data-username="${user.username}">
                  <i class="fas fa-trash"></i> Delete
                </button>
              ` : ''}
            </td>
          `;
          
          usersContainer.appendChild(row);
        });
        
        // Add event listeners to action buttons
        document.querySelectorAll('.edit-user').forEach(btn => {
          btn.addEventListener('click', () => {
            const username = btn.getAttribute('data-username');
            const user = userManagement.users.find(u => u.username === username);
            if (user) {
              showUserModal(user);
            }
          });
        });
        
        document.querySelectorAll('.delete-user').forEach(btn => {
          btn.addEventListener('click', () => {
            const username = btn.getAttribute('data-username');
            confirmDeleteUser(username);
          });
        });
      } else {
        throw new Error(data.message || 'Failed to load users');
      }
    } catch (error) {
      Logger.error('Error loading users:', error);
      loadingEl.classList.add('hidden');
      errorEl.classList.remove('hidden');
    }
  }
  
  // Initial load
  loadUsers();
}

/**
 * Show user create/edit modal
 * @param {Object} [user] - User to edit (if editing)
 */
function showUserModal(user = null) {
  const modal = document.getElementById('user-modal');
  const form = document.getElementById('user-form');
  const title = document.getElementById('user-modal-title');
  const saveBtn = document.getElementById('user-modal-save');
  const editMode = document.getElementById('edit-mode');
  const usernameField = document.getElementById('user-username');
  const passwordFields = document.getElementById('password-fields');
  
  // Reset form
  form.reset();
  
  // Set up modal for create or edit
  if (user) {
    title.textContent = 'Edit User';
    saveBtn.textContent = 'Save Changes';
    editMode.value = 'true';
    
    // Fill form with user data
    usernameField.value = user.username;
    usernameField.readOnly = true; // Can't change username
    
    document.getElementById('user-name').value = user.name || '';
    document.getElementById('user-role').value = user.role || 'user';
    document.getElementById('user-disabled').checked = user.disabled || false;
    
    // Password is optional when editing
    passwordFields.style.display = 'block';
    document.getElementById('user-password').required = false;
    document.getElementById('user-password-confirm').required = false;
    
    // Add a note about password
    const passwordNote = document.createElement('p');
    passwordNote.className = 'form-help';
    passwordNote.textContent = 'Leave blank to keep current password';
    passwordFields.appendChild(passwordNote);
  } else {
    title.textContent = 'Create User';
    saveBtn.textContent = 'Create User';
    editMode.value = 'false';
    
    // Reset username field
    usernameField.value = '';
    usernameField.readOnly = false;
    
    // Password is required when creating
    passwordFields.style.display = 'block';
    document.getElementById('user-password').required = true;
    document.getElementById('user-password-confirm').required = true;
    
    // Remove any existing note
    const existingNote = passwordFields.querySelector('.form-help');
    if (existingNote) {
      existingNote.remove();
    }
  }
  
  // Show modal
  UIUtils.openModal('user-modal');
}

/**
 * Set up the user form handlers
 */
function setupUserFormHandlers() {
  const form = document.getElementById('user-form');
  const saveBtn = document.getElementById('user-modal-save');
  const cancelBtn = document.getElementById('user-modal-cancel');
  
  // Cancel button
  cancelBtn.addEventListener('click', () => {
    UIUtils.closeModal('user-modal');
  });
  
  // Save button
  saveBtn.addEventListener('click', async () => {
    // Get form values
    const editMode = document.getElementById('edit-mode').value === 'true';
    const username = document.getElementById('user-username').value;
    const name = document.getElementById('user-name').value;
    const role = document.getElementById('user-role').value;
    const disabled = document.getElementById('user-disabled').checked;
    const password = document.getElementById('user-password').value;
    const passwordConfirm = document.getElementById('user-password-confirm').value;
    
    // Validation
    if (!username) {
      UIUtils.showToast('Username is required', 'error');
      return;
    }
    
    if (!editMode && !password) {
      UIUtils.showToast('Password is required', 'error');
      return;
    }
    
    if (password && password !== passwordConfirm) {
      UIUtils.showToast('Passwords do not match', 'error');
      return;
    }
    
    if (password && password.length < 8) {
      UIUtils.showToast('Password must be at least 8 characters long', 'error');
      return;
    }
    
    // Create request body
    const userData = { username, name, role, disabled };
    if (password) {
      userData.password = password;
    }
    
    // Show loading state
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    
    try {
      let response;
      
      if (editMode) {
        // Update user
        response = await fetch(`/api/auth/users/${username}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(userData)
        });
      } else {
        // Create user
        response = await fetch('/api/auth/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(userData)
        });
      }
      
      const data = await response.json();
      
      if (data.success) {
        UIUtils.showToast(
          editMode ? 'User updated successfully' : 'User created successfully', 
          'success'
        );
        
        // Close modal and reload users
        UIUtils.closeModal('user-modal');
        setupUsersTable(); // Reload users table
      } else {
        UIUtils.showToast(data.message || 'Failed to save user', 'error');
      }
    } catch (error) {
      Logger.error('Error saving user:', error);
      UIUtils.showToast('An error occurred while saving user', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });
}

/**
 * Confirm user deletion
 * @param {string} username - Username to delete
 */
function confirmDeleteUser(username) {
  UIUtils.confirm(
    'Delete User', 
    `Are you sure you want to delete user "${username}"? This action cannot be undone.`,
    async () => {
      try {
        const response = await fetch(`/api/auth/users/${username}`, {
          method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
          UIUtils.showToast('User deleted successfully', 'success');
          setupUsersTable(); // Reload users table
        } else {
          UIUtils.showToast(data.message || 'Failed to delete user', 'error');
        }
      } catch (error) {
        Logger.error('Error deleting user:', error);
        UIUtils.showToast('An error occurred while deleting user', 'error');
      }
    }
  );
}

/**
 * Set up the API tokens tab
 */
async function setupTokensTab() {
  const tokensContainer = document.getElementById('tokens-table').querySelector('tbody');
  const loadingEl = document.getElementById('tokens-loading');
  const emptyEl = document.getElementById('tokens-empty');
  const errorEl = document.getElementById('tokens-error');
  
  // Create token button
  const createTokenBtn = document.getElementById('create-token-btn');
  if (createTokenBtn) {
    createTokenBtn.addEventListener('click', () => {
      showTokenModal();
    });
  }
  
  // Show all tokens checkbox (admin only)
  const showAllTokens = document.getElementById('show-all-tokens');
  if (showAllTokens && userManagement.isAdmin) {
    showAllTokens.addEventListener('change', () => {
      loadTokens(showAllTokens.checked);
    });
  }
  
  // Retry button
  const retryBtn = document.getElementById('retry-load-tokens');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      loadTokens(showAllTokens?.checked || false);
    });
  }
  
  async function loadTokens(showAll = false) {
    tokensContainer.innerHTML = '';
    loadingEl.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    errorEl.classList.add('hidden');
    
    try {
      const url = showAll ? '/api/auth/tokens?all=true' : '/api/auth/tokens';
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.success && Array.isArray(data.tokens)) {
        userManagement.tokens = data.tokens;
        
        loadingEl.classList.add('hidden');
        
        if (data.tokens.length === 0) {
          emptyEl.classList.remove('hidden');
          return;
        }
        
        // Render tokens
        data.tokens.forEach(token => {
          const row = document.createElement('tr');
          
          // Format dates
          const created = new Date(token.createdAt).toLocaleString();
          const lastUsed = token.lastUsed ? new Date(token.lastUsed).toLocaleString() : 'Never';
          const expires = token.expires ? new Date(token.expires).toLocaleString() : 'Never';
          
          // Format scopes
          const scopes = token.scopes || [];
          const scopesHTML = scopes.map(scope => {
            const [resource, action] = scope.split(':');
            return `<span class="scope-badge ${action === 'write' ? 'scope-write' : 'scope-read'}">${resource}:${action}</span>`;
          }).join(' ');
          
          row.innerHTML = `
            <td>${UIUtils.escapeHTML(token.name)}</td>
            <td>${UIUtils.escapeHTML(token.username)}</td>
            <td>${created}</td>
            <td>${lastUsed}</td>
            <td>${expires}</td>
            <td class="scopes-column">${scopesHTML}</td>
            <td class="actions-column">
              <button class="button small danger-outline delete-token" data-id="${token.id}" title="Delete Token">
                <i class="fas fa-trash"></i> Delete
              </button>
            </td>
          `;
          
          tokensContainer.appendChild(row);
        });
        
        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-token').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const token = userManagement.tokens.find(t => t.id === id);
            if (token) {
              confirmDeleteToken(token);
            }
          });
        });
      } else {
        throw new Error(data.message || 'Failed to load API tokens');
      }
    } catch (error) {
      Logger.error('Error loading API tokens:', error);
      loadingEl.classList.add('hidden');
      errorEl.classList.remove('hidden');
    }
  }
  
  // Initial load
  loadTokens(false);
  
  // Set up token modal handlers
  setupTokenModal();
}

/**
 * Show token creation modal
 */
function showTokenModal() {
  const modal = document.getElementById('token-modal');
  const form = document.getElementById('token-form');
  
  // Reset form
  form.reset();
  
  // If admin, populate username dropdown
  if (userManagement.isAdmin) {
    const usernameSelect = document.getElementById('token-username');
    if (usernameSelect) {
      // Clear existing options
      usernameSelect.innerHTML = '';
      
      // Add current user as default
      const currentUserOption = document.createElement('option');
      currentUserOption.value = userManagement.currentUser.username;
      currentUserOption.textContent = `${userManagement.currentUser.username} (you)`;
      usernameSelect.appendChild(currentUserOption);
      
      // Add other users
      userManagement.users
        .filter(user => user.username !== userManagement.currentUser.username && !user.disabled)
        .forEach(user => {
          const option = document.createElement('option');
          option.value = user.username;
          option.textContent = user.username;
          usernameSelect.appendChild(option);
        });
    }
  }
  
  // Default scopes: certificates:read and renewal:read
  document.getElementById('scope-certificates-read').checked = true;
  document.getElementById('scope-renewal-read').checked = true;
  
  // Show modal
  UIUtils.openModal('token-modal');
}

/**
 * Set up token modal handlers
 */
function setupTokenModal() {
  const saveBtn = document.getElementById('token-modal-save');
  const cancelBtn = document.getElementById('token-modal-cancel');
  
  // Cancel button
  cancelBtn.addEventListener('click', () => {
    UIUtils.closeModal('token-modal');
  });
  
  // Save button
  saveBtn.addEventListener('click', async () => {
    const name = document.getElementById('token-name').value;
    const expirySelect = document.getElementById('token-expiry');
    const expires = parseInt(expirySelect.value, 10);
    
    // For admin users, get selected username
    let username = userManagement.currentUser.username;
    if (userManagement.isAdmin) {
      const usernameSelect = document.getElementById('token-username');
      username = usernameSelect.value;
    }
    
    // Get selected scopes
    const scopeCheckboxes = document.querySelectorAll('input[name="scopes"]:checked');
    const scopes = Array.from(scopeCheckboxes).map(cb => cb.value);
    
    // Validation
    if (!name) {
      UIUtils.showToast('Token name is required', 'error');
      return;
    }
    
    if (scopes.length === 0) {
      UIUtils.showToast('Please select at least one permission', 'error');
      return;
    }
    
    // Show loading state
    const originalText = saveBtn.textContent;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Creating Token...';
    
    try {
      const response = await fetch('/api/auth/tokens', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          username,
          expires: expires > 0 ? expires : null,
          scopes
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.token) {
        // Show token created success modal
        showTokenCreatedModal(data.token);
        
        // Close create token modal
        UIUtils.closeModal('token-modal');
        
        // Reload tokens in background
        setTimeout(() => {
          setupTokensTab();
        }, 1000);
      } else {
        UIUtils.showToast(data.message || 'Failed to create API token', 'error');
      }
    } catch (error) {
      Logger.error('Error creating API token:', error);
      UIUtils.showToast('An error occurred while creating API token', 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = originalText;
    }
  });
  
  // Set up token created modal
  setupTokenCreatedModal();
}

/**
 * Show token created success modal
 * @param {Object} token - Created token object
 */
function showTokenCreatedModal(token) {
  const modal = document.getElementById('token-created-modal');
  
  // Set token value
  const tokenValueInput = document.getElementById('created-token-value');
  tokenValueInput.value = token.value;
  
  // Set token metadata
  document.getElementById('created-token-name').textContent = token.name;
  document.getElementById('created-token-expires').textContent = token.expires 
    ? new Date(token.expires).toLocaleString() 
    : 'Never';
  
  // Format scopes
  const scopesContainer = document.getElementById('created-token-scopes');
  scopesContainer.innerHTML = '';
  
  const scopes = token.scopes || [];
  scopes.forEach(scope => {
    const [resource, action] = scope.split(':');
    const scopeBadge = document.createElement('span');
    scopeBadge.className = `scope-badge ${action === 'write' ? 'scope-write' : 'scope-read'}`;
    scopeBadge.textContent = scope;
    scopesContainer.appendChild(scopeBadge);
    scopesContainer.appendChild(document.createTextNode(' '));
  });
  
  // Show modal
  UIUtils.openModal('token-created-modal');
}

/**
 * Set up token created modal handlers
 */
function setupTokenCreatedModal() {
  const doneBtn = document.getElementById('token-created-done');
  const copyBtn = document.getElementById('copy-token-btn');
  
  // Done button
  doneBtn.addEventListener('click', () => {
    UIUtils.closeModal('token-created-modal');
  });
  
  // Copy button
  copyBtn.addEventListener('click', () => {
    const tokenValueInput = document.getElementById('created-token-value');
    tokenValueInput.select();
    document.execCommand('copy');
    
    UIUtils.showToast('Token copied to clipboard', 'success');
  });
}

/**
 * Confirm token deletion
 * @param {Object} token - Token to delete
 */
function confirmDeleteToken(token) {
  UIUtils.confirm(
    'Delete API Token', 
    `Are you sure you want to delete the API token "${token.name}"? This action cannot be undone.`,
    async () => {
      try {
        const response = await fetch(`/api/auth/tokens/${token.id}`, {
          method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
          UIUtils.showToast('API token deleted successfully', 'success');
          setupTokensTab(); // Reload tokens
        } else {
          UIUtils.showToast(data.message || 'Failed to delete API token', 'error');
        }
      } catch (error) {
        Logger.error('Error deleting API token:', error);
        UIUtils.showToast('An error occurred while deleting API token', 'error');
      }
    }
  );
}

// Initialize when document is ready
document.addEventListener('DOMContentLoaded', function() {
  // Initialize user management when viewing settings section
  document.querySelectorAll('a[data-tab="settings"]').forEach(tab => {
    tab.addEventListener('click', () => {
      // Only initialize once
      if (!userManagement.initialized) {
        initUserManagement();
        userManagement.initialized = true;
      }
    });
  });
  
  // Also initialize if already on the settings tab
  if (document.querySelector('#settings.tab-content.active')) {
    initUserManagement();
    userManagement.initialized = true;
  }
});

// Export module for use in other scripts
window.UserManagement = {
  init: initUserManagement,
  loadUsers: setupUsersTable,
  loadTokens: setupTokensTab
};