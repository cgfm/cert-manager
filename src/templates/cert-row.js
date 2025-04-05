/**
 * Renders a certificate row for the table
 */
const { formatDate } = require('../utils/date-formatter');

function renderCertRow(cert, now, thirtyDaysFromNow) {
  // Determine certificate status for styling
  let statusClass = 'status-valid';
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
        expiryClass = 'expiry-caution';
      }
    }
  }
  
  // Format domains as tags
  const domainTags = (cert.domains && cert.domains.length > 0) 
    ? cert.domains.map(domain => `<span class="domain-tag">${domain}</span>`).join('')
    : 'N/A';
  
  return `
    <tr data-cert-id="${cert.subjectKeyId || ''}" class="cert-row">
        <td class="cert-name">
            <span class="status-indicator ${statusClass}"></span>
            ${cert.name}${certTypeLabel}
        </td>
        <td class="cert-domains">${domainTags}</td>
        <td class="cert-expiry ${expiryClass}" data-date="${cert.expiryDate || ''}">${formatDate(cert.expiryDate)}</td>
    </tr>
  `;
}

module.exports = renderCertRow;