/**
 * Template utilities for loading and rendering HTML templates
 */
const TemplateUtils = {
  // Cache for loaded templates
  templateCache: {},
  
  /**
   * Load a template from a file
   * @param {string} templatePath - Path to the template file
   * @returns {Promise<string>} - Promise resolving to template content
   */
  loadTemplate: async function(templatePath) {
    // Check cache first
    if (this.templateCache[templatePath]) {
      return this.templateCache[templatePath];
    }
    
    try {
      const response = await fetch(templatePath);
      
      if (!response.ok) {
        throw new Error(`Failed to load template: ${response.status}`);
      }
      
      const template = await response.text();
      
      // Cache the template
      this.templateCache[templatePath] = template;
      
      return template;
    } catch (error) {
      console.error('Error loading template:', error);
      throw error;
    }
  },
  
  /**
   * Render a template with data
   * @param {string} template - Template string with {{placeholders}}
   * @param {Object} data - Data object with values to insert
   * @returns {string} - Rendered HTML string
   */
  renderTemplate: function(template, data) {
    if (!template) return '';
    if (!data) data = {};
    
    // Replace {{variable}} with data values
    const rendered = template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      // Handle nested properties (e.g. {{user.name}})
      const getValue = (obj, path) => {
        if (!obj) return '';
        
        // Handle conditional blocks
        if (path.trim().startsWith('if ')) {
          return ''; // Placeholder for now
        }
        
        return path.split('.').reduce((o, p) => {
          return (o && o[p] !== undefined) ? o[p] : '';
        }, obj);
      };
      
      const value = getValue(data, key.trim());
      return UIUtils.escapeHTML(value);
    });
    
    // Handle #if blocks
    const processedTemplate = this.processConditionalBlocks(rendered, data);
    
    return processedTemplate;
  },
  
  /**
   * Process conditional blocks in the template
   * @param {string} template - Template with conditional blocks
   * @param {Object} data - Data for evaluating conditions
   * @returns {string} - Processed template
   */
  processConditionalBlocks: function(template, data) {
    // Process {{#if condition}}...{{else}}...{{/if}} blocks
    let processed = template;
    
    // Extract and process if blocks
    const ifRegex = /\{\{#if ([^}]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;
    
    processed = processed.replace(ifRegex, (match, condition, ifContent, elseContent = '') => {
      // Evaluate the condition
      const value = this.evaluateCondition(condition, data);
      
      // Return the appropriate content
      return value ? ifContent : elseContent;
    });
    
    return processed;
  },
  
  /**
   * Evaluate a condition from the template
   * @param {string} condition - Condition to evaluate
   * @param {Object} data - Data object
   * @returns {boolean} - Result of evaluation
   */
  evaluateCondition: function(condition, data) {
    // Handle common conditions
    if (condition.includes('.length')) {
      // Array length check
      const path = condition.split('.').slice(0, -1).join('.');
      const array = path.split('.').reduce((o, p) => o && o[p], data);
      return Array.isArray(array) && array.length > 0;
    } else {
      // Simple existence check
      const value = condition.split('.').reduce((o, p) => o && o[p], data);
      return !!value;
    }
  },
  
  /**
   * Load and render a template with data
   * @param {string} templatePath - Path to the template file
   * @param {Object} data - Data object with values
   * @returns {Promise<string>} - Promise resolving to rendered HTML
   */
  loadAndRenderTemplate: async function(templatePath, data) {
    try {
      const template = await this.loadTemplate(templatePath);
      return this.renderTemplate(template, data);
    } catch (error) {
      console.error('Error rendering template:', error);
      throw error;
    }
  }
};

// Export for use in other modules
window.TemplateUtils = TemplateUtils;