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
    // Special handling for groups
    rows += `
      <tr class="group-row">
          <td class="cert-name" colspan="3">
              ${cert.name}
          </td>
      </tr>`;
    
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
    rowClass = 'ca-row';
    certTypeClass = 'cert-type-root';
    certTypeLabel = '<span class="cert-type cert-type-root">Root CA</span>';
  } else if (cert.certType === 'intermediateCA') {
    statusClass = 'status-intermediate-ca';
    rowClass = 'intermediate-row';
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
        expiryClass = 'expiry-caution';
      }
    }
  }
  
  // Format domains as tags
  const domainTags = (cert.domains && cert.domains.length > 0) 
    ? cert.domains.map(domain => `<span class="domain-tag">${domain}</span>`).join('')
    : 'N/A';
  
  rows += `
    <tr data-cert-id="${cert.subjectKeyId || ''}" class="cert-row ${rowClass}">
        <td class="cert-name ${indent}">
            <span class="status-indicator ${statusClass}"></span>
            ${cert.name}${certTypeLabel}
        </td>
        <td class="cert-domains">${domainTags}</td>
        <td class="cert-expiry ${expiryClass}" data-date="${cert.expiryDate || ''}">${formatDate(cert.expiryDate)}</td>
    </tr>`;
  
  // Render children if any
  if (cert.children && cert.children.length > 0) {
    cert.children.forEach(child => {
      rows += renderHierarchyRow(child, level + 1);
    });
  }
  
  return rows;
}

module.exports = renderHierarchyRow;