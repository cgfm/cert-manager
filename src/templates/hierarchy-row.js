/**
 * Renders a certificate row in hierarchical view
 */
const { formatDate } = require('../utils/date-formatter');

function renderHierarchyRow(cert, level = 0) {
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  
  let rows = '';
  const indent = level > 0 ? 'hierarchy-indent' : '';
  
  if (cert.isGroup) {
    // Group header
    rows += `
      <tr class="group-header">
        <td class="cert-name" colspan="4">${cert.name}</td>
      </tr>
    `;
    
    // Render children
    if (cert.children && cert.children.length > 0) {
      cert.children.forEach(child => {
        rows += renderHierarchyRow(child, level + 1);
      });
    }
    
    return rows;
  }
  
  // Determine certificate status
  let statusClass = 'status-valid';
  let rowClass = '';
  let expiryClass = '';
  let certTypeClass = '';
  let certTypeLabel = '';
  
  // Set CA type indicators
  if (cert.certType === 'rootCA') {
    statusClass = 'status-ca';
    certTypeClass = 'cert-type-root';
    certTypeLabel = '<span class="cert-type cert-type-root">Root CA</span>';
  } else if (cert.certType === 'intermediateCA') {
    statusClass = 'status-intermediate-ca';
    certTypeClass = 'cert-type-intermediate';
    certTypeLabel = '<span class="cert-type cert-type-intermediate">Intermediate CA</span>';
  } else {
    // Check expiry for non-CA certificates
    if (cert.expiryDate) {
      if (cert.expiryDate < now) {
        statusClass = 'status-expired';
        expiryClass = 'expiry-warning';
      } else if (cert.expiryDate < thirtyDaysFromNow) {
        statusClass = 'status-warning';
        expiryClass = 'expiry-warning';
      }
    }
  }
  
  // Format domains as tags
  const domainTags = (cert.domains && cert.domains.length > 0) 
    ? cert.domains.map(domain => `<span class="domain-tag">${domain}</span>`).join('')
    : 'N/A';
  
  // Add fingerprint as data attribute for action buttons
  rows += `
    <tr class="cert-row ${rowClass} ${indent}" data-cert-id="${cert.subjectKeyId || ''}" data-fingerprint="${cert.fingerprint || ''}">
      <td class="cert-name">
        <span class="status-indicator ${statusClass}"></span>
        ${cert.name}${certTypeLabel}
      </td>
      <td class="cert-domains">${domainTags}</td>
      <td class="cert-expiry ${expiryClass}" data-date="${cert.expiryDate || ''}">${formatDate(cert.expiryDate)}</td>
      <td class="cert-actions">
        <button class="config-btn" data-fingerprint="${cert.fingerprint || ''}">Configure</button>
        <button class="renew-btn" data-fingerprint="${cert.fingerprint || ''}">Renew</button>
      </td>
    </tr>
  `;
  
  // Render children if this is a CA
  if (cert.children && cert.children.length > 0) {
    cert.children.forEach(child => {
      rows += renderHierarchyRow(child, level + 1);
    });
  }
  
  return rows;
}

// Export the function correctly
module.exports = {
  renderHierarchyRow
};