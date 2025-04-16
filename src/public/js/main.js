// Import utility functions
//import * as dateUtils from './utils/date-utils.js';
//import * as dockerUtils from './utils/docker-utils.js';
//import * as modalUtils from './utils/modal-utils.js';
//import * as uiUtils from './utils/ui-utils.js';

// With a global logger object that will be initialized once the script is loaded
const logger = window.logger || {
    debug: function(message, data) { console.debug('[DEBUG]', message, data); },
    info: function(message, data) { console.info('[INFO]', message, data); },
    warn: function(message, data) { console.warn('[WARN]', message, data); },
    error: function(message, data) { console.error('[ERROR]', message, data); }
};

// Add utility verification and fallbacks at the beginning
(function ensureUtilities() {
    console.log('Checking utilities...');
    
    // Simple fallback modal function
    function fallbackCreateModal(options) {
        console.warn('Using fallback modal creation');
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="width: ${options.width || '500px'}">
                <span class="close">&times;</span>
                <h2>${options.title || 'Modal'}</h2>
                <div>${options.content || ''}</div>
            </div>
        `;
        document.body.appendChild(modal);
        
        const closeBtn = modal.querySelector('.close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                document.body.removeChild(modal);
                if (typeof options.onClose === 'function') {
                    options.onClose();
                }
            });
        }
        
        return modal;
    }
    
    // Fallback loading overlay
    function fallbackCreateLoadingOverlay(message) {
        console.warn('Using fallback loading overlay');
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <i class="fas fa-spinner fa-spin fa-3x"></i>
                <p>${message || 'Loading...'}</p>
            </div>
        `;
        
        // Add styles if needed
        if (!document.getElementById('loading-overlay-styles')) {
            const style = document.createElement('style');
            style.id = 'loading-overlay-styles';
            style.textContent = `
                .loading-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background-color: rgba(0, 0, 0, 0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 10000;
                }
                
                .loading-content {
                    background-color: white;
                    padding: 30px;
                    border-radius: 8px;
                    text-align: center;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                }
                
                .loading-content i {
                    margin-bottom: 15px;
                    color: #0078d7;
                }
                
                .loading-content p {
                    margin: 0;
                    font-size: 16px;
                    color: #333;
                }
            `;
            document.head.appendChild(style);
        }
        
        return overlay;
    }
    
    // Fallback notification
    function fallbackShowNotification(message, type) {
        console.warn('Using fallback notification');
        alert(message);
    }
    
    // Check and create fallbacks for all utility objects
    if (!window.modalUtils) {
        console.warn('modalUtils not found, creating fallback');
        window.modalUtils = {};
    }
    
    if (typeof window.modalUtils.createModal !== 'function') {
        console.warn('modalUtils.createModal not found, adding fallback');
        window.modalUtils.createModal = fallbackCreateModal;
    }
    
    if (typeof window.modalUtils.createLoadingOverlay !== 'function') {
        console.warn('modalUtils.createLoadingOverlay not found, adding fallback');
        window.modalUtils.createLoadingOverlay = fallbackCreateLoadingOverlay;
    }
    
    if (typeof window.modalUtils.showNotification !== 'function') {
        console.warn('modalUtils.showNotification not found, adding fallback');
        window.modalUtils.showNotification = fallbackShowNotification;
    }
    
    if (!window.uiUtils) {
        console.warn('uiUtils not found, creating fallback');
        window.uiUtils = {};
    }
    
    if (typeof window.modalUtils.showNotification !== 'function') {
        console.warn('modalUtils.showNotification not found, adding fallback');
        window.modalUtils.showNotification = function(message, type) {
            console.log(`[${type || 'info'}] ${message}`);
            alert(message);
        };
    }
    
    if (!window.dockerUtils) {
        console.warn('dockerUtils not found, creating fallback');
        window.dockerUtils = {
            checkDockerStatus: function() {
                console.warn('Using dockerUtils fallback');
                return Promise.resolve({ available: false });
            }
        };
    }
    
    if (!window.dateUtils) {
        console.warn('dateUtils not found, creating fallback');
        window.dateUtils = {};
    }
    
    if (typeof window.dateUtils.formatDate !== 'function') {
        console.warn('dateUtils.formatDate not found, adding fallback');
        window.dateUtils.formatDate = function(date) {
            if (!date) return 'N/A';
            try {
                const d = new Date(date);
                if (isNaN(d.getTime())) return 'Invalid date';
                return d.toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (error) {
                console.error('Error formatting date:', error);
                return String(date);
            }
        };
    }
    
    // Verify utilities are available
    console.log('Utilities available:', {
        modalUtils: {
            available: !!window.modalUtils,
            createModal: typeof window.modalUtils.createModal === 'function',
            createLoadingOverlay: typeof window.modalUtils.createLoadingOverlay === 'function'
        },
        dateUtils: {
            available: !!window.dateUtils,
            formatDate: typeof window.dateUtils?.formatDate === 'function'
        },
        uiUtils: {
            available: !!window.uiUtils,
            showNotification: typeof window.uiUtils?.showNotification === 'function'
        },
        dockerUtils: {
            available: !!window.dockerUtils
        }
    });
})();

// Cache for certificate data
const certificateCache = {
    data: {},
    get: function(fingerprint) {
        return this.data[fingerprint];
    },
    set: function(fingerprint, data) {
        this.data[fingerprint] = data;
    },
    invalidate: function(fingerprint) {
        delete this.data[fingerprint];
    }
};

// Helper function for debugging
function debugLog(message, data) {
    logger.debug(message, data);
}

// Main initialization function
document.addEventListener('DOMContentLoaded', () => {
    debugLog('Certificate manager initializing');

    // Initialize page components
    initializeUI();
    initViewModeToggle();
    initializeDomainValidation();
    attachButtonEventHandlers();
    fetchCertificates();

    // Register utils in window object for backwards compatibility
    window.modalUtils = modalUtils;
    window.dateUtils = dateUtils;
    window.dockerUtils = dockerUtils;
    window.uiUtils = uiUtils;
});

// New function to attach event handlers to all buttons
function attachButtonEventHandlers() {
    debugLog('Attaching event handlers to certificate buttons');
    
    // Log the number of buttons found for debugging
    const configButtons = document.querySelectorAll('.config-btn');
    const renewButtons = document.querySelectorAll('.renew-btn');
    debugLog(`Found ${configButtons.length} configure buttons and ${renewButtons.length} renew buttons`);
    
    // Check if we have any rows without buttons and add buttons to them
    document.querySelectorAll('.cert-row').forEach(row => {
        const fingerprint = row.dataset.fingerprint;
        if (!fingerprint) {
            debugLog('Found a row without fingerprint', row);
            return;
        }
        
        let actionsCell = row.querySelector('.cert-actions');
        
        // If no actions cell exists, create one
        if (!actionsCell) {
            debugLog('Creating actions cell for row', row);
            actionsCell = document.createElement('td');
            actionsCell.className = 'cert-actions';
            row.appendChild(actionsCell);
        }
        
        // Check if actions cell is empty or doesn't have buttons
        if (!actionsCell.querySelector('button')) {
            debugLog('Adding buttons to actions cell', actionsCell);
            actionsCell.innerHTML = `
                <button class="config-btn" data-fingerprint="${fingerprint}">
                    <i class="fas fa-cog"></i> Configure
                </button>
                <button class="renew-btn" data-fingerprint="${fingerprint}">
                    <i class="fas fa-sync-alt"></i> Renew
                </button>
            `;
        }
    });
    
    // Now attach event handlers to all configure buttons
    document.querySelectorAll('.config-btn').forEach(btn => {
        const fingerprint = btn.dataset.fingerprint;
        
        if (fingerprint) {
            // Create a clone of the button to remove any existing event listeners
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // Attach new event listener
            newBtn.addEventListener('click', () => {
                debugLog('Configure button clicked for fingerprint:', fingerprint);
                try {
                    showConfigModal(fingerprint);
                } catch (error) {
                    console.error('Error showing config modal:', error);
                    alert('Error showing configuration: ' + error.message);
                }
            });
        } else {
            debugLog('Found a configure button without fingerprint', btn);
        }
    });
    
    // Attach event handlers to all renew buttons
    document.querySelectorAll('.renew-btn').forEach(btn => {
        const fingerprint = btn.dataset.fingerprint;
        
        if (fingerprint) {
            // Create a clone of the button to remove any existing event listeners
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            // Attach new event listener
            newBtn.addEventListener('click', () => {
                debugLog('Renew button clicked for fingerprint:', fingerprint);
                try {
                    renewCertificate(fingerprint);
                } catch (error) {
                    console.error('Error renewing certificate:', error);
                    alert('Error renewing certificate: ' + error.message);
                }
            });
        } else {
            debugLog('Found a renew button without fingerprint', btn);
        }
    });
    
    // Final verification
    const afterConfigButtons = document.querySelectorAll('.config-btn');
    const afterRenewButtons = document.querySelectorAll('.renew-btn');
    debugLog(`After processing: ${afterConfigButtons.length} configure buttons and ${afterRenewButtons.length} renew buttons`);
}

/**
 * Render certificates into the table
 * @param {Array} certificates - Array of certificate objects
 */
function renderCertificates(certificates) {
    console.log(`Rendering ${certificates.length} certificates`);
    
    const tableBody = document.querySelector('#certificatesTable tbody') || 
                     document.querySelector('.certificates-table tbody');
                     
    if (!tableBody) {
        console.error('Certificate table body not found in the DOM');
        return;
    }
    
    // Handle empty certificates array
    if (!certificates || certificates.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="no-certs-message">
                    <i class="fas fa-info-circle"></i> No certificates found
                </td>
            </tr>
        `;
        return;
    }
    
    // Calculate dates for expiry warning
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);
    
    // Create HTML for each certificate
    const rows = certificates.map(cert => {
        // Add error handling for problematic certificates
        if (cert.error) {
            return `
                <tr data-cert-id="${cert.subjectKeyId || ''}" data-fingerprint="${cert.fingerprint || ''}" class="cert-row error-cert">
                    <td class="cert-name">
                        <span class="status-indicator status-error"></span>
                        ${cert.name || 'Unnamed Certificate'}
                        <span class="cert-type cert-type-error">Error</span>
                    </td>
                    <td class="cert-domains">
                        <span class="error-message">${cert.error || 'Unknown error'}</span>
                    </td>
                    <td class="cert-expiry">
                        N/A
                    </td>
                    <td class="cert-actions">
                        <button class="delete-btn" data-fingerprint="${cert.fingerprint || ''}">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </td>
                </tr>
            `;
        }
        
        // Determine certificate status for styling
        let statusClass = 'status-valid';
        let expiryClass = '';
        let certTypeClass = '';
        let certTypeLabel = '';
        
        // Helper function to safely parse dates
        function tryParseDate(dateValue) {
            if (!dateValue) return null;
            try {
                const date = new Date(dateValue);
                return isNaN(date.getTime()) ? null : date;
            } catch (e) {
                console.warn(`Failed to parse date: ${dateValue}`, e);
                return null;
            }
        }

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
            // Look for date in multiple possible properties
            const validToDate = cert.validTo || cert.expiryDate || cert.notAfter;
            
            if (validToDate) {
                const expiryDate = tryParseDate(validToDate) || 
                                  tryParseDate(cert.validTo) || 
                                  tryParseDate(cert.expiryDate) || 
                                  tryParseDate(cert.notAfter);
                
                if (expiryDate) {
                    if (expiryDate < now) {
                        statusClass = 'status-expired';
                        expiryClass = 'expiry-warning';
                    } else if (expiryDate < thirtyDaysFromNow) {
                        statusClass = 'status-warning';
                        expiryClass = 'expiry-caution';
                    }
                }
            }
        }
        
        // Cache certificate data for later use
        if (typeof certificateCache !== 'undefined' && 
            certificateCache && 
            typeof certificateCache.set === 'function' && 
            cert.fingerprint) {
            certificateCache.set(cert.fingerprint, cert);
        }
        
        // Format domains as tags
        const domainTags = (cert.domains && cert.domains.length > 0) 
            ? cert.domains.map(domain => `<span class="domain-tag">${domain}</span>`).join('')
            : 'N/A';
        
        // Format the expiry date for display - safely
        let formattedDate = 'No expiry date';
        
        // Try to use window.certUtils if available, fall back to direct Date formatting
        if (window.certUtils && typeof window.certUtils.formatCertificateDate === 'function') {
            const validToDate = cert.validTo || cert.expiryDate || cert.notAfter;
            formattedDate = window.certUtils.formatCertificateDate(validToDate);
        } else {
            // Direct formatting
            const expiryDate = tryParseDate(cert.validTo) || 
                              tryParseDate(cert.expiryDate) || 
                              tryParseDate(cert.notAfter);
                              
            if (expiryDate && expiryDate instanceof Date && !isNaN(expiryDate.getTime())) {
                try {
                    formattedDate = expiryDate.toLocaleDateString(undefined, { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                    });
                } catch (e) {
                    console.warn(`Error formatting date: ${expiryDate}`, e);
                    formattedDate = 'Invalid date';
                }
            }
        }
        
        return `
            <tr data-cert-id="${cert.subjectKeyId || ''}" data-fingerprint="${cert.fingerprint || ''}" class="cert-row">
                <td class="cert-name">
                    <span class="status-indicator ${statusClass}"></span>
                    ${cert.name || 'Unnamed Certificate'}${certTypeLabel}
                </td>
                <td class="cert-domains">${domainTags}</td>
                <td class="cert-expiry ${expiryClass}" data-date="${cert.validTo || cert.expiryDate || ''}">
                    ${formattedDate}
                </td>
                <td class="cert-actions">
                    <button class="config-btn" data-fingerprint="${cert.fingerprint || ''}">
                        <i class="fas fa-cog"></i> Configure
                    </button>
                    <button class="renew-btn" data-fingerprint="${cert.fingerprint || ''}">
                        <i class="fas fa-sync-alt"></i> Renew
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    tableBody.innerHTML = rows;
    
    // Attach event handlers to the newly created buttons
    if (typeof attachButtonEventHandlers === 'function') {
        setTimeout(attachButtonEventHandlers, 100);
    }
}

/**
 * Render certificates in hierarchical view
 * @param {Array} certificates - Array of certificate objects
 */
function renderCertificatesHierarchy(certificates) {
    console.log(`Rendering ${certificates.length} certificates in hierarchy view`);
    
    const tableBody = document.querySelector('#certificatesTable tbody') || 
                     document.querySelector('.certificates-table tbody');
                     
    if (!tableBody) {
        console.error('Certificate table body not found in the DOM');
        return;
    }
    
    // Handle empty certificates array
    if (!certificates || certificates.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="4" class="no-certs-message">
                    <i class="fas fa-info-circle"></i> No certificates found
                </td>
            </tr>
        `;
        return;
    }
    
    // Group certificates by issuer
    const rootCAs = [];
    const intermediateCAs = [];
    const endEntityCerts = [];
    const errorCerts = [];
    
    // First pass: categorize certificates
    certificates.forEach(cert => {
        if (cert.error) {
            errorCerts.push(cert);
        } else if (cert.certType === 'rootCA') {
            rootCAs.push(cert);
        } else if (cert.certType === 'intermediateCA') {
            intermediateCAs.push(cert);
        } else {
            endEntityCerts.push(cert);
        }
    });
    
    // Build certificate chain relationships
    const rootsWithChildren = rootCAs.map(root => {
        // Find intermediates issued by this root
        const childIntermediates = intermediateCAs.filter(inter => 
            inter.issuerFingerprint === root.fingerprint || 
            inter.issuer === root.subject
        );
        
        // Find end-entity certs issued directly by this root
        const childEndEntities = endEntityCerts.filter(cert => 
            cert.issuerFingerprint === root.fingerprint || 
            cert.issuer === root.subject
        );
        
        return {
            ...root,
            children: [
                ...childIntermediates.map(inter => {
                    // Find end-entity certs issued by this intermediate
                    const grandchildren = endEntityCerts.filter(cert => 
                        cert.issuerFingerprint === inter.fingerprint || 
                        cert.issuer === inter.subject
                    );
                    
                    return {
                        ...inter,
                        children: grandchildren
                    };
                }),
                ...childEndEntities
            ]
        };
    });
    
    // Find orphaned intermediates (no parent root CA)
    const orphanedIntermediates = intermediateCAs.filter(inter => 
        !rootCAs.some(root => 
            inter.issuerFingerprint === root.fingerprint || 
            inter.issuer === root.subject
        )
    );
    
    // Orphaned intermediates become top-level items
    orphanedIntermediates.forEach(inter => {
        // Find end-entity certs issued by this intermediate
        const childEndEntities = endEntityCerts.filter(cert => 
            cert.issuerFingerprint === inter.fingerprint || 
            cert.issuer === inter.subject
        );
        
        rootsWithChildren.push({
            ...inter,
            children: childEndEntities
        });
    });
    
    // Find orphaned end-entity certs (no known issuer)
    const orphanedEndEntities = endEntityCerts.filter(cert => 
        !rootCAs.some(root => 
            cert.issuerFingerprint === root.fingerprint || 
            cert.issuer === root.subject
        ) && 
        !intermediateCAs.some(inter => 
            cert.issuerFingerprint === inter.fingerprint || 
            cert.issuer === inter.subject
        )
    );
    
    // Render hierarchy
    let rows = '';
    
    // Helper function for calculating expiry status
    const getCertificateStatusClasses = (cert) => {
        if (cert.certType === 'rootCA') {
            return {
                statusClass: 'status-ca',
                expiryClass: '',
                certTypeClass: 'cert-type-root',
                certTypeLabel: '<span class="cert-type cert-type-root">Root CA</span>'
            };
        } else if (cert.certType === 'intermediateCA') {
            return {
                statusClass: 'status-intermediate-ca',
                expiryClass: '',
                certTypeClass: 'cert-type-intermediate',
                certTypeLabel: '<span class="cert-type cert-type-intermediate">Intermediate CA</span>'
            };
        } else {
            // Calculate dates for expiry warning
            const now = new Date();
            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(now.getDate() + 30);
            
            // Check expiry for non-CA certificates
            let statusClass = 'status-valid';
            let expiryClass = '';
            
            const validToDate = cert.validTo || cert.expiryDate || cert.notAfter;
            
            if (validToDate) {
                const expiryDate = new Date(validToDate);
                if (expiryDate < now) {
                    statusClass = 'status-expired';
                    expiryClass = 'expiry-warning';
                } else if (expiryDate < thirtyDaysFromNow) {
                    statusClass = 'status-warning';
                    expiryClass = 'expiry-caution';
                }
            }
            
            return {
                statusClass,
                expiryClass,
                certTypeClass: '',
                certTypeLabel: ''
            };
        }
    };
    
    // Helper function to safely format dates
    const formatDate = (dateString) => {
        if (!dateString) return 'N/A';
        
        try {
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return 'Invalid date';
            
            return date.toLocaleDateString(undefined, { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            });
        } catch (e) {
            console.warn(`Error formatting date: ${dateString}`, e);
            return 'Invalid date';
        }
    };
    
    // Helper function for rendering domains
    const formatDomains = (domains) => {
        if (!domains || domains.length === 0) return 'N/A';
        return domains.map(domain => `<span class="domain-tag">${domain}</span>`).join('');
    };
    
    // First add root CAs and their children
    rootsWithChildren.forEach(root => {
        const { statusClass, expiryClass, certTypeClass, certTypeLabel } = getCertificateStatusClasses(root);
        
        // Cache certificate data for later use
        if (typeof certificateCache !== 'undefined' && 
            certificateCache && 
            typeof certificateCache.set === 'function' && 
            root.fingerprint) {
            certificateCache.set(root.fingerprint, root);
        }
        
        // Add root CA row
        rows += `
            <tr data-cert-id="${root.subjectKeyId || ''}" data-fingerprint="${root.fingerprint || ''}" class="cert-row ${certTypeClass} root-cert">
                <td class="cert-name">
                    <span class="status-indicator ${statusClass}"></span>
                    <span class="hierarchy-toggle" data-fingerprint="${root.fingerprint}">
                        <i class="fas fa-caret-down"></i>
                    </span>
                    ${root.name || 'Unnamed Root CA'}${certTypeLabel}
                </td>
                <td class="cert-domains">${formatDomains(root.domains)}</td>
                <td class="cert-expiry ${expiryClass}" data-date="${root.validTo || root.expiryDate || ''}">
                    ${formatDate(root.validTo || root.expiryDate || root.notAfter)}
                </td>
                <td class="cert-actions">
                    <button class="config-btn" data-fingerprint="${root.fingerprint || ''}">
                        <i class="fas fa-cog"></i> Configure
                    </button>
                    <button class="renew-btn" data-fingerprint="${root.fingerprint || ''}">
                        <i class="fas fa-sync-alt"></i> Renew
                    </button>
                </td>
            </tr>
        `;
        
        // Add intermediate CA children
        const intermediateChildren = root.children.filter(child => child.certType === 'intermediateCA');
        intermediateChildren.forEach(intermediate => {
            const { statusClass, expiryClass, certTypeClass, certTypeLabel } = getCertificateStatusClasses(intermediate);
            
            // Cache certificate data
            if (typeof certificateCache !== 'undefined' && certificateCache) {
                certificateCache.set(intermediate.fingerprint, intermediate);
            }
            
            // Add intermediate CA row
            rows += `
                <tr data-cert-id="${intermediate.subjectKeyId || ''}" data-fingerprint="${intermediate.fingerprint || ''}" 
                    class="cert-row ${certTypeClass} intermediate-cert child-of-${root.fingerprint}">
                    <td class="cert-name">
                        <span class="indent-marker"></span>
                        <span class="status-indicator ${statusClass}"></span>
                        <span class="hierarchy-toggle" data-fingerprint="${intermediate.fingerprint}">
                            <i class="fas fa-caret-down"></i>
                        </span>
                        ${intermediate.name || 'Unnamed Intermediate CA'}${certTypeLabel}
                    </td>
                    <td class="cert-domains">${formatDomains(intermediate.domains)}</td>
                    <td class="cert-expiry ${expiryClass}" data-date="${intermediate.validTo || intermediate.expiryDate || ''}">
                        ${formatDate(intermediate.validTo || intermediate.expiryDate || intermediate.notAfter)}
                    </td>
                    <td class="cert-actions">
                        <button class="config-btn" data-fingerprint="${intermediate.fingerprint || ''}">
                            <i class="fas fa-cog"></i> Configure
                        </button>
                        <button class="renew-btn" data-fingerprint="${intermediate.fingerprint || ''}">
                            <i class="fas fa-sync-alt"></i> Renew
                        </button>
                    </td>
                </tr>
            `;
            
            // Add end-entity certificates issued by this intermediate
            if (intermediate.children && intermediate.children.length > 0) {
                intermediate.children.forEach(endCert => {
                    const { statusClass, expiryClass } = getCertificateStatusClasses(endCert);
                    
                    // Cache certificate data
                    if (typeof certificateCache !== 'undefined' && certificateCache) {
                        certificateCache.set(endCert.fingerprint, endCert);
                    }
                    
                    // Add end-entity certificate row
                    rows += `
                        <tr data-cert-id="${endCert.subjectKeyId || ''}" data-fingerprint="${endCert.fingerprint || ''}" 
                            class="cert-row end-entity-cert child-of-${intermediate.fingerprint}">
                            <td class="cert-name">
                                <span class="indent-marker"></span>
                                <span class="indent-marker"></span>
                                <span class="status-indicator ${statusClass}"></span>
                                ${endCert.name || 'Unnamed Certificate'}
                            </td>
                            <td class="cert-domains">${formatDomains(endCert.domains)}</td>
                            <td class="cert-expiry ${expiryClass}" data-date="${endCert.validTo || endCert.expiryDate || ''}">
                                ${formatDate(endCert.validTo || endCert.expiryDate || endCert.notAfter)}
                            </td>
                            <td class="cert-actions">
                                <button class="config-btn" data-fingerprint="${endCert.fingerprint || ''}">
                                    <i class="fas fa-cog"></i> Configure
                                </button>
                                <button class="renew-btn" data-fingerprint="${endCert.fingerprint || ''}">
                                    <i class="fas fa-sync-alt"></i> Renew
                                </button>
                            </td>
                        </tr>
                    `;
                });
            }
        });
        
        // Add end-entity certificates issued directly by the root
        const endEntityChildren = root.children.filter(child => !child.certType || child.certType === 'standard');
        endEntityChildren.forEach(endCert => {
            const { statusClass, expiryClass } = getCertificateStatusClasses(endCert);
            
            // Cache certificate data
            if (typeof certificateCache !== 'undefined' && certificateCache) {
                certificateCache.set(endCert.fingerprint, endCert);
            }
            
            // Add end-entity certificate row
            rows += `
                <tr data-cert-id="${endCert.subjectKeyId || ''}" data-fingerprint="${endCert.fingerprint || ''}" 
                    class="cert-row end-entity-cert child-of-${root.fingerprint}">
                    <td class="cert-name">
                        <span class="indent-marker"></span>
                        <span class="status-indicator ${statusClass}"></span>
                        ${endCert.name || 'Unnamed Certificate'}
                    </td>
                    <td class="cert-domains">${formatDomains(endCert.domains)}</td>
                    <td class="cert-expiry ${expiryClass}" data-date="${endCert.validTo || endCert.expiryDate || ''}">
                        ${formatDate(endCert.validTo || endCert.expiryDate || endCert.notAfter)}
                    </td>
                    <td class="cert-actions">
                        <button class="config-btn" data-fingerprint="${endCert.fingerprint || ''}">
                            <i class="fas fa-cog"></i> Configure
                        </button>
                        <button class="renew-btn" data-fingerprint="${endCert.fingerprint || ''}">
                            <i class="fas fa-sync-alt"></i> Renew
                        </button>
                    </td>
                </tr>
            `;
        });
    });
    
    // Add orphaned end-entity certificates
    if (orphanedEndEntities.length > 0) {
        // Add separator row
        rows += `
            <tr class="separator-row">
                <td colspan="4" class="separator-label">
                    <i class="fas fa-unlink"></i> Certificates without CA chain
                </td>
            </tr>
        `;
        
        // Add orphaned certificates
        orphanedEndEntities.forEach(cert => {
            const { statusClass, expiryClass } = getCertificateStatusClasses(cert);
            
            // Cache certificate data
            if (typeof certificateCache !== 'undefined' && certificateCache) {
                certificateCache.set(cert.fingerprint, cert);
            }
            
            rows += `
                <tr data-cert-id="${cert.subjectKeyId || ''}" data-fingerprint="${cert.fingerprint || ''}" class="cert-row orphaned-cert">
                    <td class="cert-name">
                        <span class="status-indicator ${statusClass}"></span>
                        ${cert.name || 'Unnamed Certificate'}
                    </td>
                    <td class="cert-domains">${formatDomains(cert.domains)}</td>
                    <td class="cert-expiry ${expiryClass}" data-date="${cert.validTo || cert.expiryDate || ''}">
                        ${formatDate(cert.validTo || cert.expiryDate || cert.notAfter)}
                    </td>
                    <td class="cert-actions">
                        <button class="config-btn" data-fingerprint="${cert.fingerprint || ''}">
                            <i class="fas fa-cog"></i> Configure
                        </button>
                        <button class="renew-btn" data-fingerprint="${cert.fingerprint || ''}">
                            <i class="fas fa-sync-alt"></i> Renew
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    
    // Add error certificates at the end
    if (errorCerts.length > 0) {
        // Add separator row
        rows += `
            <tr class="separator-row">
                <td colspan="4" class="separator-label">
                    <i class="fas fa-exclamation-triangle"></i> Certificates with errors
                </td>
            </tr>
        `;
        
        // Add error certificates
        errorCerts.forEach(cert => {
            rows += `
                <tr data-cert-id="${cert.subjectKeyId || ''}" data-fingerprint="${cert.fingerprint || ''}" class="cert-row error-cert">
                    <td class="cert-name">
                        <span class="status-indicator status-error"></span>
                        ${cert.name || 'Unnamed Certificate'}
                        <span class="cert-type cert-type-error">Error</span>
                    </td>
                    <td class="cert-domains">
                        <span class="error-message">${cert.error || 'Unknown error'}</span>
                    </td>
                    <td class="cert-expiry">
                        N/A
                    </td>
                    <td class="cert-actions">
                        <button class="delete-btn" data-fingerprint="${cert.fingerprint || ''}">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </td>
                </tr>
            `;
        });
    }
    
    // Insert all rows into the table
    tableBody.innerHTML = rows;
    
    // Set up hierarchy toggle functionality
    tableBody.querySelectorAll('.hierarchy-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const fingerprint = toggle.dataset.fingerprint;
            const icon = toggle.querySelector('i');
            const childRows = tableBody.querySelectorAll(`.child-of-${fingerprint}`);
            
            // Toggle children visibility
            childRows.forEach(row => {
                if (row.style.display === 'none') {
                    row.style.display = '';
                    icon.className = 'fas fa-caret-down';
                } else {
                    row.style.display = 'none';
                    icon.className = 'fas fa-caret-right';
                    
                    // Also hide any grandchildren
                    const childFingerprint = row.dataset.fingerprint;
                    if (childFingerprint) {
                        const grandchildRows = tableBody.querySelectorAll(`.child-of-${childFingerprint}`);
                        grandchildRows.forEach(grandchild => {
                            grandchild.style.display = 'none';
                        });
                        
                        // Update the child's toggle icon if it has one
                        const childToggle = row.querySelector('.hierarchy-toggle i');
                        if (childToggle) {
                            childToggle.className = 'fas fa-caret-right';
                        }
                    }
                }
            });
        });
    });
}

/**
 * Renew a certificate
 * @param {string} fingerprint - Certificate fingerprint
 */
function renewCertificate(fingerprint) {
    // Create loading overlay
    const loadingOverlay = window.modalUtils.createLoadingOverlay('Renewing certificate...');
    document.body.appendChild(loadingOverlay);
    
    // Call API to renew certificate
    fetch(`/api/certificate/${fingerprint}/renew`, {
        method: 'POST'
    })
    .then(response => response.json())
    .then(data => {
        document.body.removeChild(loadingOverlay);
        
        if (data.success) {
            window.modalUtils.showNotification('Certificate renewal started successfully.', 'success');
            
            // Refresh certificates list after a short delay
            setTimeout(() => {
                if (typeof fetchCertificates === 'function') {
                    fetchCertificates();
                } else {
                    window.location.reload();
                }
            }, 3000);
        } else {
            const errorMsg = data.error || 'Unknown error occurred';
            window.modalUtils.showNotification(`Error: ${errorMsg}`, 'error');
        }
    })
    .catch(error => {
        document.body.removeChild(loadingOverlay);
        console.error('Error renewing certificate:', error);
        window.modalUtils.showNotification(`Error: ${error.message}`, 'error');
    });
}

// Function to show certificate configuration modal
async function showConfigModal(fingerprint) {
    try {
        // Show loading indicator
        console.log('Showing config modal for certificate:', fingerprint);
    
        // Create loading overlay, with fallback if modalUtils not available
        let loadingOverlay;
        if (window.modalUtils && typeof window.modalUtils.createLoadingOverlay === 'function') {
            loadingOverlay = window.modalUtils.createLoadingOverlay('Loading certificate details...');
        } else {
            // Fallback: create loading overlay directly
            loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            loadingOverlay.innerHTML = `
                <div class="loading-content">
                    <i class="fas fa-spinner fa-spin fa-3x"></i>
                    <p>Loading certificate details...</p>
                </div>
            `;
        }
        document.body.appendChild(loadingOverlay);
        
        // Clean fingerprint for API calls
        const cleanFingerprint = encodeURIComponent(fingerprint);
        
        // Fetch certificate data
        let cert;
        
        try {
            const response = await fetch(`/api/certificate/${cleanFingerprint}`);
            if (!response.ok) {
                throw new Error(`Failed to load certificate: ${response.status} ${response.statusText}`);
            }
            cert = await response.json();
        } catch (error) {
            document.body.removeChild(loadingOverlay);
            throw error;
        }
        
        // Remove loading overlay
        document.body.removeChild(loadingOverlay);
        
        // Format dates with window.dateUtils
        const validFromDate = window.dateUtils.formatDate(cert.validFrom);
        const validToDate = window.dateUtils.formatDate(cert.validTo);
        
        // Set original values for change detection
        const originalData = {
            autoRenew: cert.autoRenew || false,
            renewDays: cert.renewDaysBeforeExpiry || 30,
            actionCount: cert.deployActions ? cert.deployActions.length : 0
        };
        
        // Initialize pending changes tracker
        window.pendingChanges = {
            addDomains: [],
            removeDomains: []
        };
        
        // Create certificate info content
        const certInfo = `
            <div class="cert-info">
                <div class="info-row">
                    <span class="info-label">Name:</span>
                    <span class="info-value">${cert.name || 'Unnamed'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Type:</span>
                    <span class="info-value">${cert.certType || 'Standard'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Valid From:</span>
                    <span class="info-value">${validFromDate}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Valid Until:</span>
                    <span class="info-value">${validToDate}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Path:</span>
                    <span class="info-value">${cert.path || 'Unknown'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Key Path:</span>
                    <span class="info-value">
                        ${cert.keyPath || 'Not linked'}
                        ${!cert.keyPath ? `<button id="findKeyBtn" class="small-btn"><i class="fas fa-search"></i> Find Key File</button>` : ''}
                    </span>
                </div>
            </div>
        `;
        
        // Create tabs content
        const modalContent = `
            <div class="tabs">
                <button class="tab-btn active" data-tab="details">Details</button>
                <button class="tab-btn" data-tab="domains">Domains</button>
                <button class="tab-btn" data-tab="deploy">Deployment</button>
                <button class="tab-btn" data-tab="advanced">Advanced</button>
            </div>
            
            <div class="tab-contents">
                <!-- Details tab content here -->
                <div id="details-tab" class="tab-content active">
                    <div class="form-group">
                        <label for="autoRenew">
                            <input type="checkbox" id="autoRenew" ${cert.autoRenew ? 'checked' : ''}>
                            Auto-renew this certificate
                        </label>
                    </div>
                    
                    <div class="form-group">
                        <label for="renewDays">Days before expiry to renew:</label>
                        <input type="number" id="renewDays" value="${cert.renewDaysBeforeExpiry || 30}" min="1" max="90">
                    </div>
                    
                    ${certInfo}
                </div>
                
                <!-- Domains tab content here -->
                <div id="domains-tab" class="tab-content">
                    <h3>Certificate Domains</h3>
                    <div class="domains-list">
                        ${cert.domains && cert.domains.length > 0 ? 
                            cert.domains.map(domain => `
                                <div class="domain-item">
                                    <span class="domain-name">${domain}</span>
                                    <button class="stage-remove-domain-btn" data-domain="${domain}">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            `).join('') 
                            : '<p>No domains configured</p>'
                        }
                    </div>
                    
                    <div class="add-domain-container">
                        <h4>Add New Domain</h4>
                        <div class="form-group">
                            <input type="text" id="newDomain" placeholder="Enter new domain">
                            <button id="stageDomainBtn"><i class="fas fa-plus"></i> Add</button>
                        </div>
                    </div>
                    
                    <div id="pendingChanges" style="display:none">
                        <h4>Pending Domain Changes</h4>
                        <div id="pendingList"></div>
                        <div class="button-group">
                            <button id="applyChanges" class="primary-btn"><i class="fas fa-check"></i> Apply Changes</button>
                            <button id="discardChanges" class="secondary-btn"><i class="fas fa-times"></i> Discard Changes</button>
                        </div>
                        <div class="info-box warning-box">
                            <i class="fas fa-exclamation-triangle"></i>
                            <p><strong>Note:</strong> Changing domains requires certificate renewal.</p>
                        </div>
                    </div>
                </div>
                
                <!-- Deployment tab content here -->
                <div id="deploy-tab" class="tab-content">
                    <h3>Post-Renewal Actions</h3>
                    <p>These actions will be executed after certificate renewal.</p>
                    
                    <div class="actions-container" id="actionsContainer">
                        ${cert.deployActions && cert.deployActions.length > 0 ? 
                            cert.deployActions.map(action => {
                                let icon, displayText;
                                switch (action.type) {
                                    case 'copy': 
                                        icon = '<i class="fas fa-copy"></i>';
                                        displayText = action.destination || 'No destination';
                                        break;
                                    case 'docker-restart':
                                        icon = '<i class="fab fa-docker"></i>';
                                        displayText = action.containerId || action.containerName || 'Unknown container';
                                        break;
                                    case 'command':
                                        icon = '<i class="fas fa-terminal"></i>';
                                        displayText = action.command || 'No command';
                                        break;
                                    default:
                                        icon = '<i class="fas fa-cog"></i>';
                                        displayText = 'Unknown action';
                                }
                                
                                return `
                                    <div class="action-item">
                                        <span>${icon} ${action.type}: ${displayText}</span>
                                        <button type="button" class="remove-action-btn"><i class="fas fa-trash"></i></button>
                                        <input type="hidden" name="actionTypes[]" value="${action.type}">
                                        <input type="hidden" name="actionParams[]" value="${action.destination || action.containerId || action.command || ''}">
                                    </div>
                                `;
                            }).join('') 
                            : '<p>No deployment actions configured</p>'
                        }
                    </div>
                    
                    <div class="add-action-container">
                        <h4>Add New Action</h4>
                        <div class="form-group">
                            <label for="actionType">Action Type:</label>
                            <select id="actionType">
                                <option value="copy">Copy Certificate</option>
                                <option value="docker-restart">Restart Docker Container</option>
                                <option value="command">Run Command</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label id="actionParamLabel" for="actionParams"><i class="fas fa-folder"></i> Destination:</label>
                            <input type="text" id="actionParams" placeholder="/path/to/destination">
                            <button id="browseBtn" class="browse-btn"><i class="fas fa-folder-open"></i></button>
                        </div>
                        
                        <button id="addActionBtn" class="add-btn"><i class="fas fa-plus"></i> Add Action</button>
                    </div>
                </div>
                
                <!-- Advanced tab content here -->
                <div id="advanced-tab" class="tab-content">
                    <h3>Advanced Settings</h3>
                    
                    <div class="cert-details">
                        <h4>Certificate Details</h4>
                        <div class="info-row">
                            <span class="info-label">Fingerprint:</span>
                            <span class="info-value">${fingerprint}</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Serial Number:</span>
                            <span class="info-value">${cert.serialNumber || 'N/A'}</span>
                        </div>
                    </div>
                    
                    <div class="danger-zone">
                        <h4>Danger Zone</h4>
                        <button id="deleteBtn" class="danger-btn"><i class="fas fa-trash"></i> Delete Certificate</button>
                    </div>
                </div>
            </div>
            
            <div class="button-group">
                <button id="saveConfig" class="primary-btn"><i class="fas fa-save"></i> Save Configuration</button>
                <button id="cancelConfig" class="secondary-btn"><i class="fas fa-times"></i> Cancel</button>
            </div>
        `;
        
        // Use window.modalUtils for the modal - SAVE THE RESULT TO A VARIABLE
        const modal = window.modalUtils.createModal({
            title: `Certificate: ${cert.name || 'Unnamed'}`,
            content: modalContent,
            id: 'cert-config-modal',
            width: '850px'
        });
        
        // Store original values as data attributes
        modal.dataset.originalAutoRenew = originalData.autoRenew;
        modal.dataset.originalRenewDays = originalData.renewDays;
        modal.dataset.originalActionCount = originalData.actionCount;
        
        // Setup event handlers using our handler function
        setupModalEventHandlers(modal, cert, cleanFingerprint);
        
    } catch (error) {
        // Remove loading overlay if it exists
        const loadingOverlay = document.querySelector('.loading-overlay');
        if (loadingOverlay) {
            document.body.removeChild(loadingOverlay);
        }
        
        console.error('Error showing config modal:', error);
        alert('Error loading certificate configuration: ' + error.message);
    }
}

/**
 * Show the create certificate modal
 */
function showCreateCertModal() {
    console.log('Opening create certificate modal');
    
    if (!window.modalUtils || !window.modalUtils.createModal) {
        console.error('Modal utilities not available');
        alert('Modal utilities not available. Please reload the page.');
        return;
    }
    
    // Create modal content
    const modalContent = `
        <div class="tabs">
            <button class="tab-btn active" data-tab="create">Create New</button>
            <button class="tab-btn" data-tab="upload">Upload Existing</button>
        </div>
        
        <div class="tab-contents">
            <!-- Create new certificate tab -->
            <div id="create-tab" class="tab-content active">
                <div class="form-group">
                    <label for="domainName">Primary Domain:</label>
                    <input type="text" id="domainName" placeholder="example.com" class="form-control" required>
                    <div class="validation-message" id="domain-validation"></div>
                </div>
                
                <div class="form-group">
                    <label for="additionalDomains">Additional Domains (SAN):</label>
                    <textarea id="additionalDomains" placeholder="www.example.com&#10;mail.example.com" class="form-control"></textarea>
                    <div class="help-text">One domain per line. You can also add IP addresses.</div>
                </div>
                
                <div class="form-group">
                    <label for="email">Email Address:</label>
                    <input type="email" id="email" placeholder="admin@example.com" class="form-control">
                    <div class="help-text">Used for certificate expiry notifications from Let's Encrypt.</div>
                </div>
                
                <div class="form-group">
                    <label>
                        <input type="checkbox" id="autoRenew" checked>
                        Auto-renew this certificate
                    </label>
                </div>
                
                <div class="form-group">
                    <label for="keyType">Key Type:</label>
                    <select id="keyType" class="form-control">
                        <option value="rsa">RSA (Widely Compatible)</option>
                        <option value="ecdsa">ECDSA (Smaller, Modern)</option>
                    </select>
                </div>
                
                <div class="form-group key-size-group">
                    <label for="keySize">Key Size:</label>
                    <select id="keySize" class="form-control">
                        <option value="2048">2048-bit (Standard)</option>
                        <option value="3072">3072-bit (Stronger)</option>
                        <option value="4096">4096-bit (Strongest)</option>
                    </select>
                </div>
                
                <div class="form-group curve-group" style="display: none;">
                    <label for="curve">Curve:</label>
                    <select id="curve" class="form-control">
                        <option value="secp256r1">secp256r1 (P-256)</option>
                        <option value="secp384r1">secp384r1 (P-384)</option>
                    </select>
                </div>
            </div>
            
            <!-- Upload tab content -->
            <div id="upload-tab" class="tab-content">
                <div class="form-group">
                    <label for="certFile">Certificate File:</label>
                    <div class="input-with-button">
                        <input type="text" id="certFile" placeholder="/path/to/certificate.crt" class="form-control" required>
                        <button id="browseCertBtn" class="browse-btn"><i class="fas fa-folder-open"></i></button>
                    </div>
                </div>
                
                <div class="form-group">
                    <label for="keyFile">Key File:</label>
                    <div class="input-with-button">
                        <input type="text" id="keyFile" placeholder="/path/to/private.key" class="form-control">
                        <button id="browseKeyBtn" class="browse-btn"><i class="fas fa-folder-open"></i></button>
                    </div>
                    <div class="help-text">Optional, but recommended for renewal.</div>
                </div>
                
                <div class="form-group">
                    <label for="chainFile">Chain File:</label>
                    <div class="input-with-button">
                        <input type="text" id="chainFile" placeholder="/path/to/chain.crt" class="form-control">
                        <button id="browseChainBtn" class="browse-btn"><i class="fas fa-folder-open"></i></button>
                    </div>
                    <div class="help-text">Optional intermediate certificates.</div>
                </div>
            </div>
        </div>
        
        <div class="button-group">
            <button id="createCertBtn" class="primary-btn"><i class="fas fa-plus-circle"></i> Create Certificate</button>
            <button id="cancelCreateBtn" class="secondary-btn"><i class="fas fa-times"></i> Cancel</button>
        </div>
    `;
    
    // Create modal
    const modal = window.modalUtils.createModal({
        title: 'Create Certificate',
        content: modalContent,
        id: 'create-cert-modal',
        width: '650px'
    });
    
    // Set up tabs
    const tabButtons = modal.querySelectorAll('.tab-btn');
    const tabContents = modal.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to current button and content
            button.classList.add('active');
            modal.querySelector(`#${tabName}-tab`).classList.add('active');
            
            // Update create button text based on tab
            const createBtn = modal.querySelector('#createCertBtn');
            if (createBtn) {
                createBtn.innerHTML = tabName === 'create' ? 
                    '<i class="fas fa-plus-circle"></i> Create Certificate' : 
                    '<i class="fas fa-upload"></i> Upload Certificate';
            }
        });
    });
    
    // Set up key type change handler
    const keyTypeSelect = modal.querySelector('#keyType');
    if (keyTypeSelect) {
        keyTypeSelect.addEventListener('change', () => {
            const keySizeGroup = modal.querySelector('.key-size-group');
            const curveGroup = modal.querySelector('.curve-group');
            
            if (keyTypeSelect.value === 'rsa') {
                keySizeGroup.style.display = 'block';
                curveGroup.style.display = 'none';
            } else {
                keySizeGroup.style.display = 'none';
                curveGroup.style.display = 'block';
            }
        });
    }
    
    // Set up browse buttons
    const browseButtons = [
        { btnId: '#browseCertBtn', inputId: '#certFile' },
        { btnId: '#browseKeyBtn', inputId: '#keyFile' },
        { btnId: '#browseChainBtn', inputId: '#chainFile' }
    ];
    
    browseButtons.forEach(({ btnId, inputId }) => {
        const btn = modal.querySelector(btnId);
        if (btn) {
            btn.addEventListener('click', () => {
                if (window.modalUtils && typeof window.modalUtils.showFileBrowser === 'function') {
                    window.modalUtils.showFileBrowser(modal, inputId);
                } else {
                    alert('File browser not available');
                }
            });
        }
    });
    
    // Set up form validation
    const domainInput = modal.querySelector('#domainName');
    const domainValidation = modal.querySelector('#domain-validation');
    
    if (domainInput && domainValidation) {
        domainInput.addEventListener('input', () => {
            const domain = domainInput.value.trim();
            
            if (domain === '') {
                domainValidation.textContent = '';
                domainValidation.classList.remove('error', 'valid');
                return;
            }
            
            // Validate domain using isValidDomainOrIP function
            if (typeof window.isValidDomainOrIP === 'function') {
                if (window.isValidDomainOrIP(domain)) {
                    domainValidation.textContent = 'Valid domain';
                    domainValidation.classList.remove('error');
                    domainValidation.classList.add('valid');
                } else {
                    domainValidation.textContent = 'Invalid domain format';
                    domainValidation.classList.remove('valid');
                    domainValidation.classList.add('error');
                }
            } else {
                console.warn('isValidDomainOrIP function not found');
                domainValidation.textContent = '';
            }
        });
    }
    
    // Fetch default email from settings
    fetch('/api/settings')
        .then(response => response.json())
        .then(settings => {
            const emailInput = modal.querySelector('#email');
            if (emailInput && settings.defaultEmail) {
                emailInput.value = settings.defaultEmail;
            }
        })
        .catch(error => {
            console.warn('Error loading default email:', error);
        });
    
    // Set up create button
    const createBtn = modal.querySelector('#createCertBtn');
    if (createBtn) {
        createBtn.addEventListener('click', () => {
            const activeTab = modal.querySelector('.tab-btn.active').dataset.tab;
            
            if (activeTab === 'create') {
                createNewCertificate(modal);
            } else {
                uploadCertificate(modal);
            }
        });
    }
    
    // Set up cancel button
    const cancelBtn = modal.querySelector('#cancelCreateBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }
}

/**
 * Create a new certificate from form data
 * @param {HTMLElement} modal - The modal element
 */
function createNewCertificate(modal) {
    // Get form values
    const primaryDomain = modal.querySelector('#domainName').value.trim();
    const additionalDomainsText = modal.querySelector('#additionalDomains').value.trim();
    const email = modal.querySelector('#email').value.trim();
    const autoRenew = modal.querySelector('#autoRenew').checked;
    const keyType = modal.querySelector('#keyType').value;
    
    // Get key size or curve based on key type
    let keySize, curve;
    if (keyType === 'rsa') {
        keySize = modal.querySelector('#keySize').value;
    } else {
        curve = modal.querySelector('#curve').value;
    }
    
    // Validate primary domain
    if (!primaryDomain) {
        alert('Please enter a primary domain');
        return;
    }
    
    if (typeof window.isValidDomainOrIP === 'function' && !window.isValidDomainOrIP(primaryDomain)) {
        alert('Please enter a valid domain name or IP address');
        return;
    }
    
    // Parse additional domains
    const additionalDomains = additionalDomainsText
        .split('\n')
        .map(domain => domain.trim())
        .filter(domain => domain !== '');
    
    // Validate additional domains
    if (typeof window.isValidDomainOrIP === 'function') {
        const invalidDomains = additionalDomains.filter(domain => !window.isValidDomainOrIP(domain));
        if (invalidDomains.length > 0) {
            alert(`The following additional domains are invalid:\n${invalidDomains.join('\n')}`);
            return;
        }
    }
    
    // Create full domain list
    const domains = [primaryDomain, ...additionalDomains];
    
    // Show loading overlay
    const loadingOverlay = window.modalUtils.createLoadingOverlay('Creating certificate...');
    document.body.appendChild(loadingOverlay);
    
    // Create certificate request data
    const requestData = {
        domains,
        email,
        autoRenew,
        keyType
    };
    
    // Add key size or curve
    if (keyType === 'rsa') {
        requestData.keySize = parseInt(keySize, 10);
    } else {
        requestData.curve = curve;
    }
    
    // Send request to create certificate
    fetch('/api/certificate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    })
    .then(response => response.json())
    .then(data => {
        document.body.removeChild(loadingOverlay);
        
        if (data.success) {
            // Close the modal
            document.body.removeChild(modal);
            
            // Show success message
            window.modalUtils.showNotification('Certificate creation process started', 'success');
            
            // Refresh certificates list after a short delay
            setTimeout(() => {
                if (typeof fetchCertificates === 'function') {
                    fetchCertificates();
                } else {
                    window.location.reload();
                }
            }, 3000);
        } else {
            const errorMsg = data.error || 'Unknown error occurred';
            window.modalUtils.showNotification(`Error: ${errorMsg}`, 'error');
        }
    })
    .catch(error => {
        document.body.removeChild(loadingOverlay);
        console.error('Error creating certificate:', error);
        window.modalUtils.showNotification(`Error: ${error.message}`, 'error');
    });
}

/**
 * Upload an existing certificate
 * @param {HTMLElement} modal - The modal element
 */
function uploadCertificate(modal) {
    // Get form values
    const certFile = modal.querySelector('#certFile').value.trim();
    const keyFile = modal.querySelector('#keyFile').value.trim();
    const chainFile = modal.querySelector('#chainFile').value.trim();
    
    // Validate certificate file
    if (!certFile) {
        alert('Please enter the certificate file path');
        return;
    }
    
    // Show loading overlay
    const loadingOverlay = window.modalUtils.createLoadingOverlay('Uploading certificate...');
    document.body.appendChild(loadingOverlay);
    
    // Create upload request data
    const requestData = {
        certFile,
        keyFile,
        chainFile
    };
    
    // Send request to upload certificate
    fetch('/api/certificate/upload', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    })
    .then(response => response.json())
    .then(data => {
        document.body.removeChild(loadingOverlay);
        
        if (data.success) {
            // Close the modal
            document.body.removeChild(modal);
            
            // Show success message
            window.modalUtils.showNotification('Certificate uploaded successfully', 'success');
            
            // Refresh certificates list
            if (typeof fetchCertificates === 'function') {
                fetchCertificates();
            } else {
                window.location.reload();
            }
        } else {
            const errorMsg = data.error || 'Unknown error occurred';
            window.modalUtils.showNotification(`Error: ${errorMsg}`, 'error');
        }
    })
    .catch(error => {
        document.body.removeChild(loadingOverlay);
        console.error('Error uploading certificate:', error);
        window.modalUtils.showNotification(`Error: ${error.message}`, 'error');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    debugLog('Certificate manager initializing');
    
    // Initialize page components first
    initializeUI();
    initializeDomainValidation();
    attachButtonEventHandlers();
    setupHeaderButtons();
    checkDockerStatus();
    
    // Add view controls BEFORE fetching certificates
    addViewModeControls();
    initViewModeToggle();

    // Add global event listeners
    addGlobalEventListeners();
    
    // Register global functions for backward compatibility
    registerGlobalFunctions();
    
    // Finally, fetch certificates ONCE after everything is set up
    setTimeout(() => {
        fetchCertificates();
    }, 100);
});

function initializeUI() {
    // Any unique UI initialization from main.js
    setupNavigation();
    
    // Create header buttons if they don't exist
    setupCreateCertificateButton();
    setupSettingsButton();
}

function addViewModeControls() {
    const container = document.querySelector('.certificates-header') || 
                     document.querySelector('.actions-bar');
    
    if (!container) return;
    
    // Check if view controls already exist
    if (!container.querySelector('.view-controls')) {
        const viewControls = document.createElement('div');
        viewControls.className = 'view-controls';
        viewControls.innerHTML = `
            <span>View Mode:</span>
            <div class="toggle-switch">
                <input type="radio" id="flat-view" name="view-mode" value="flat" checked>
                <label for="flat-view">Flat</label>
                <input type="radio" id="hierarchy-view" name="view-mode" value="hierarchy">
                <label for="hierarchy-view">Hierarchy</label>
            </div>
        `;
        
        container.appendChild(viewControls);
    }
}

function setupNavigation() {
    // Setup any page navigation functionality from main.js
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').substring(1);
            
            // Hide all sections
            document.querySelectorAll('.content-section').forEach(section => {
                section.style.display = 'none';
            });
            
            // Show target section
            const targetSection = document.getElementById(targetId);
            if (targetSection) {
                targetSection.style.display = 'block';
            }
            
            // Update active link
            navLinks.forEach(navLink => {
                navLink.classList.remove('active');
            });
            this.classList.add('active');
        });
    });
}

function setupCreateCertificateButton() {
    const header = document.querySelector('header');
    if (!header) return;
    
    let buttonContainer = header.querySelector('.header-buttons');
    if (!buttonContainer) {
        buttonContainer = document.createElement('div');
        buttonContainer.className = 'header-buttons';
        header.appendChild(buttonContainer);
    }
    
    // Check if create certificate button exists
    if (!buttonContainer.querySelector('#create-cert-btn')) {
        const createBtn = document.createElement('button');
        createBtn.id = 'create-cert-btn';
        createBtn.className = 'action-btn';
        createBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Create Certificate';
        createBtn.addEventListener('click', showCreateCertModal);
        buttonContainer.appendChild(createBtn);
    }
}

/**
 * Setup the settings button in the header
 */
function setupSettingsButton() {
    const header = document.querySelector('header');
    if (!header) return;
    
    let buttonContainer = header.querySelector('.header-buttons');
    if (!buttonContainer) {
        buttonContainer = document.createElement('div');
        buttonContainer.className = 'header-buttons';
        header.appendChild(buttonContainer);
    }
    
    // Check if settings button exists
    if (!buttonContainer.querySelector('#settings-btn')) {
        const settingsBtn = document.createElement('button');
        settingsBtn.id = 'settings-btn';
        settingsBtn.className = 'action-btn settings-btn';
        settingsBtn.innerHTML = '<i class="fas fa-cog"></i> Settings';
        settingsBtn.addEventListener('click', showSettingsModal);
        buttonContainer.appendChild(settingsBtn);
    }
}

// Domain validation initialization function
function initializeDomainValidation() {
    if (typeof isValidDomainOrIP !== 'function') {
        // Fall back to a simple implementation if utils.js is not loaded
        window.isValidDomainOrIP = function(domain) {
            const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
            const ipRegex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
            const wildcardDomainRegex = /^\*\.([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
            
            return domainRegex.test(domain) || 
                   ipRegex.test(domain) || 
                   wildcardDomainRegex.test(domain) ||
                   domain === 'localhost';
        };
    }
}

// Setup header buttons
function setupHeaderButtons() {
    const header = document.querySelector('header');
    if (header) {
        let buttonContainer = header.querySelector('.header-buttons');
        if (!buttonContainer) {
            buttonContainer = document.createElement('div');
            buttonContainer.className = 'header-buttons';
            header.appendChild(buttonContainer);
        }
    }


    // Add global event listener for ESC key to close modals
    document.addEventListener('keydown', function(event) {
        // Check if Escape key was pressed (key code 27)
        if (event.key === 'Escape') {
            // Find any open modals
            const openModals = document.querySelectorAll('.modal:not(.confirm-dialog)');
            
            // If there's an open modal and no confirmation dialog is active
            if (openModals.length > 0 && !document.querySelector('.confirm-dialog')) {
                // Get the top-most modal (last in the DOM)
                const topModal = openModals[openModals.length - 1];
                
                // Use our existing handler for unsaved changes
                handleModalClose(topModal);
            }
        }
    });
}

/**
 * Check Docker service availability
 */
function checkDockerStatus() {
    const dockerStatus = document.getElementById('docker-status');
    if (!dockerStatus) return;
    
    dockerStatus.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Docker: <span class="status-text">Checking...</span>';
    
    fetch('/api/docker/status')
        .then(response => response.json())
        .then(data => {
            if (data.available) {
                dockerStatus.innerHTML = '<i class="fas fa-circle" style="color: #28a745;"></i> Docker: <span class="status-text">Connected</span>';
            } else {
                dockerStatus.innerHTML = '<i class="fas fa-circle" style="color: #dc3545;"></i> Docker: <span class="status-text">Unavailable</span>';
            }
        })
        .catch(error => {
            console.error('Error checking Docker status:', error);
            dockerStatus.innerHTML = '<i class="fas fa-circle" style="color: #dc3545;"></i> Docker: <span class="status-text">Error</span>';
        });
}

/**
 * Initialize view mode toggle and set up listeners
 */
function initViewModeToggle() {
    console.log('Initializing view mode toggle');
    
    // Get view mode controls or create them if they don't exist
    let viewControls = document.querySelector('.view-controls');
    
    if (!viewControls) {
        console.log('Creating view controls');
        viewControls = document.createElement('div');
        viewControls.className = 'view-controls';
        viewControls.innerHTML = `
            <span>View:</span>
            <div class="toggle-container">
                <input type="checkbox" id="view-mode-toggle" class="toggle-checkbox">
                <label for="view-mode-toggle" class="toggle-label">
                <span class="toggle-inner" data-flat="Flat" data-hierarchy="Hierarchy"></span>
                <span class="toggle-switch"></span>
                </label>
            </div>
        `;
        
        // Insert in the header between app title and header buttons
        const appTitle = document.querySelector('.app-title');
        const headerButtons = document.querySelector('.header-buttons');
        
        if (appTitle && headerButtons && appTitle.parentNode) {
            appTitle.parentNode.insertBefore(viewControls, headerButtons);
        }
    }
    
    // Set up toggle listener using event delegation
    document.addEventListener('change', function(event) {
        if (event.target.id === 'view-mode-toggle') {
            const isHierarchyView = !event.target.checked;
            const viewMode = isHierarchyView ? 'hierarchy' : 'flat';
            
            console.log(`View mode changed to: ${viewMode}`);
            
            // Save preference to localStorage
            try {
                localStorage.setItem('certViewMode', viewMode);
            } catch (e) {
                console.warn('Could not save view mode preference:', e);
            }
            
            // Apply the view mode
            if (window.cachedCertificates && Array.isArray(window.cachedCertificates)) {
                console.log('Using cached certificates for rendering');
                renderCertificatesWithMode(window.cachedCertificates, viewMode);
            } else {
                console.log('Fetching fresh certificates for new view mode');
                fetchCertificates(true);
            }
        }
    });
    
    // Load saved preference if available
    try {
        const savedMode = localStorage.getItem('certViewMode');
        if (savedMode) {
        const toggleCheckbox = document.getElementById('view-mode-toggle');
        if (toggleCheckbox) {
            toggleCheckbox.checked = savedMode !== 'hierarchy';
            
            // Trigger the change event to apply the saved mode
            const changeEvent = new Event('change');
            toggleCheckbox.dispatchEvent(changeEvent);
        }
        }
    } catch (e) {
        console.warn('Could not load saved view mode:', e);
    }
}

/**
 * Render certificates based on the selected view mode
 * @param {Array} certificates - The certificates data
 * @param {string} mode - The view mode ('flat' or 'hierarchy')
 */
function renderCertificatesWithMode(certificates, mode) {
    console.log(`Rendering ${certificates.length} certificates with mode: ${mode}`);
    
    if (mode === 'hierarchy') {
        renderCertificatesHierarchy(certificates);
    } else {
        renderCertificates(certificates);
    }
    
    // Ensure action listeners are set up
    if (typeof window.modalUtils !== 'undefined' && 
        typeof window.modalUtils.setupCertificateActionListeners === 'function') {
        window.modalUtils.setupCertificateActionListeners();
    } else if (typeof setupCertificateActionListeners === 'function') {
        setupCertificateActionListeners();
    }
}

let currentFetchController = null;
let currentFetchTimeout = null;
let initialFetchCompleted = false;
let fetchInProgress = false;

// In your fetchCertificates function, make sure it properly processes the metadata structure
function processCertificateData(certificates) {
    // Process the certificates data to ensure it has the right structure
    return certificates.map(cert => {
        // If the certificate has a metadata property, it means we're getting the old format
        // from a non-updated endpoint
        if (cert.metadata) {
            return {
                ...cert.metadata,
                domains: cert.domains || [],
                autoRenew: cert.autoRenew,
                renewDaysBeforeExpiry: cert.renewDaysBeforeExpiry,
                deployActions: cert.deployActions || []
            };
        }
        // Otherwise, we already have the flattened structure
        return cert;
    });
}

/**
 * Get the current view mode (flat or hierarchy)
 * @returns {string} - The view mode ('flat' or 'hierarchy')
 */
function getViewMode() {
    try {
        // First try to get from toggle switch if it exists
        const viewToggle = document.getElementById('view-mode-toggle');
        if (viewToggle) {
            return viewToggle.checked ? 'flat' : 'hierarchy';
        }
        
        // Alternatively, check radio buttons if they exist
        const hierarchyRadio = document.getElementById('hierarchy-view');
        if (hierarchyRadio && hierarchyRadio.checked) {
            return 'hierarchy';
        }
        
        // Fall back to localStorage if available
        const savedMode = localStorage.getItem('certViewMode');
        if (savedMode) {
            return savedMode;
        }
        
        // Default to flat view
        return 'flat';
    } catch (e) {
        console.warn('Error determining view mode:', e);
        return 'flat'; // Default to flat view on error
    }
}

/**
 * Modified fetchCertificates function that uses the current view mode
 */
function fetchCertificates(forceRefresh = false) {
    // Prevent multiple simultaneous fetch operations during initialization
    if (fetchInProgress && !forceRefresh) {
        console.log('Fetch already in progress, skipping duplicate call');
        return;
    }
    
    console.log('Fetching certificates...');
    fetchInProgress = true;

    // Cancel any existing fetch operations
    if (currentFetchController) {
        console.log('Canceling previous fetch operation');
        currentFetchController.abort();
    }
    
    if (currentFetchTimeout) {
        console.log('Clearing previous fetch timeout');
        clearTimeout(currentFetchTimeout);
    }
    
    // If we have cached certificates and don't need a refresh, just render them
    if (!forceRefresh && window.cachedCertificates && window.cachedCertificates.length > 0) {
        console.log('Using cached certificates');
        const viewMode = document.querySelector('input[name="view-mode"]:checked')?.value || 'flat';
        renderCertificatesWithMode(window.cachedCertificates, viewMode);
        fetchInProgress = false;
        return;
    }
    
    // Show loading indicator
    const certificatesTable = document.querySelector('#certificatesTable tbody') || 
                             document.querySelector('.certificates-table tbody');
    
    if (certificatesTable) {
        certificatesTable.innerHTML = `
        <tr>
            <td colspan="4" class="loading-cell">
                <div class="loading-indicator">
                    <i class="fas fa-spinner fa-spin"></i> Loading certificates...
                </div>
            </td>
        </tr>
        `;
    }
    
    // Create a new AbortController for this request
    currentFetchController = new AbortController();
    const signal = currentFetchController.signal;
    
    // Set a timeout to abort the fetch after 10 seconds
    currentFetchTimeout = setTimeout(() => {
        console.log('Fetch timeout exceeded (10s)');
        if (currentFetchController) {
            currentFetchController.abort();
        }
    }, 10000);
    
    const url = forceRefresh ? 
        '/api/certificate?refresh=true' : 
        '/api/certificate';

    // Fetch certificates from API with timeout protection
    fetch(url, { signal })
        .then(response => {
            // Clear the timeout as soon as we get a response
            clearTimeout(currentFetchTimeout);
            currentFetchTimeout = null;
            
            if (!response.ok) {
                throw new Error(`Server returned status: ${response.status}`);
            }
            
            return response.json();
        })
        .then(data => {
            // Clear controller reference since fetch completed successfully
            currentFetchController = null;
            
            // Cache the certificates for potential reuse
            window.cachedCertificates = data;
            initialFetchCompleted = true;
            fetchInProgress = false;

            // Process data to ensure consistent structure
            const processedData = processCertificateData(data);
            
            // Cache certificates for use in other functions
            window.cachedCertificates = processedData;
            
            // Get current view mode
            const viewMode = getViewMode();
            console.log(`Current view mode: ${viewMode}`);
            
            // Render with the appropriate mode
            renderCertificatesWithMode(processedData, viewMode);
            
            // Update certificate count if needed
            if (Array.isArray(processedData) && typeof updateCertificateCount === 'function') {
                updateCertificateCount(processedData.length);
            }
        })
        .catch(error => {
            // Clear timeout if it wasn't already cleared
            if (currentFetchTimeout) {
                clearTimeout(currentFetchTimeout);
                currentFetchTimeout = null;
            }
            
            fetchInProgress = false;
            
            // Only log actual errors, not aborts from switching views
            if (error.name !== 'AbortError' || currentFetchController !== null) {
                console.error('Error fetching certificates:', error);
                
                if (certificatesTable) {
                    certificatesTable.innerHTML = `
                        <tr>
                            <td colspan="4" class="error-cell">
                                <div class="error-message">
                                    <i class="fas fa-exclamation-triangle"></i>
                                    Error loading certificates: ${error.message}
                                    <button onclick="fetchCertificates(true)" class="retry-btn">
                                        <i class="fas fa-sync"></i> Try Again
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `;
                }
                
                // Show notification if possible
                if (typeof window.uiUtils !== 'undefined' && 
                    typeof window.modalUtils.showNotification === 'function') {
                    window.modalUtils.showNotification(
                        `Failed to load certificates: ${error.message}`, 
                        'error'
                    );
                }
            } else {
                console.log('Fetch aborted due to view change or navigation');
            }
            
            // Clear controller reference
            currentFetchController = null;
        });
}

function initCertificateActionListeners(){
    // Now that certificates are loaded, set up the action listeners
    // Ensure modalUtils is loaded and has the required function
    if (window.modalUtils) {
        // Give a small delay to ensure DOM is updated
        setTimeout(() => {
            if (typeof window.modalUtils.setupCertificateActionListeners === 'function') {
                console.log('Setting up certificate action listeners after certificates loaded');
                window.modalUtils.setupCertificateActionListeners();
            } else {
                console.warn('modalUtils.setupCertificateActionListeners not available, attempting fallback');
                // Fallback: add event listeners directly
                document.querySelectorAll('.config-btn, .settings-btn, .renew-btn, .view-btn, .delete-btn, .deploy-btn').forEach(btn => {
                    btn.addEventListener('click', function(event) {
                        event.preventDefault();
                        const fingerprint = this.dataset.fingerprint || 
                                            this.closest('[data-fingerprint]').dataset.fingerprint;
                                            
                        if (this.classList.contains('config-btn')) {
                            showConfigModal(fingerprint);
                        } else if (this.classList.contains('renew-btn')) {
                            renewCertificate(fingerprint);
                        }
                        // Add other button types as needed
                    });
                });
            }
        }, 300);
    } else {
        console.error('modalUtils not loaded! Certificate buttons may not work.');
    }
}

/**
 * Show settings modal
 */
function showSettingsModal() {
    console.log("Opening settings modal");
    
    if (!window.modalUtils || !window.modalUtils.createModal) {
        console.error("Modal utilities not available");
        alert("Modal utilities not available. Please reload the page.");
        return;
    }
    
    // Fetch current settings
    fetch('/api/settings')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error fetching settings: ${response.status}`);
            }
            return response.json();
        })
        .then(settings => {
            console.log("Settings loaded:", settings);
            
            // Create settings form content
            const modalContent = `
                <div class="settings-form">
                    <div class="form-group">
                        <label for="certsPath">Certificates Directory:</label>
                        <div class="input-with-button">
                            <input type="text" id="certsPath" value="${settings.certsPath || '/certs'}" class="form-control">
                            <button id="browseCertsBtn" class="browse-btn"><i class="fas fa-folder-open"></i></button>
                        </div>
                    </div>
                    
                    <div class="form-group">
                        <label for="defaultEmail">Default Email for ACME:</label>
                        <input type="email" id="defaultEmail" value="${settings.defaultEmail || ''}" placeholder="admin@example.com" class="form-control">
                    </div>
                    
                    <div class="form-group">
                        <label for="renewalDays">Default Days Before Expiry to Renew:</label>
                        <input type="number" id="renewalDays" value="${settings.renewalDays || 30}" min="1" max="90" class="form-control">
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="autoRenewAll" ${settings.autoRenewAll ? 'checked' : ''}>
                            Automatically Renew All Certificates
                        </label>
                    </div>
                    
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="notifyExpiry" ${settings.notifyExpiry ? 'checked' : ''}>
                            Enable Expiry Notifications
                        </label>
                    </div>
                </div>
                
                <div class="button-group">
                    <button id="saveSettings" class="primary-btn"><i class="fas fa-save"></i> Save Settings</button>
                    <button id="cancelSettings" class="secondary-btn"><i class="fas fa-times"></i> Cancel</button>
                </div>
            `;
            
            // Create the modal
            const modal = window.modalUtils.createModal({
                title: 'Settings',
                content: modalContent,
                id: 'settings-modal',
                width: '600px'
            });
            
            // Setup directory browser button
            const browseCertsBtn = modal.querySelector('#browseCertsBtn');
            if (browseCertsBtn) {
                browseCertsBtn.addEventListener('click', () => {
                    // Show file browser
                    if (window.modalUtils && window.modalUtils.showFileBrowser) {
                        window.modalUtils.showFileBrowser(modal, '#certsPath');
                    } else {
                        alert('File browser not available');
                    }
                });
            }
            
            // Setup save button
            const saveBtn = modal.querySelector('#saveSettings');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    // Get values
                    const certsPath = modal.querySelector('#certsPath').value;
                    const defaultEmail = modal.querySelector('#defaultEmail').value;
                    const renewalDays = parseInt(modal.querySelector('#renewalDays').value, 10);
                    const autoRenewAll = modal.querySelector('#autoRenewAll').checked;
                    const notifyExpiry = modal.querySelector('#notifyExpiry').checked;
                    
                    // Save changes
                    fetch('/api/settings', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            certsPath,
                            defaultEmail,
                            renewalDays,
                            autoRenewAll,
                            notifyExpiry
                        })
                    })
                    .then(response => response.json())
                    .then(result => {
                        if (result.success) {
                            document.body.removeChild(modal);
                            // Show success message
                            alert('Settings saved successfully');
                        } else {
                            alert('Error saving settings: ' + (result.error || 'Unknown error'));
                        }
                    })
                    .catch(error => {
                        alert('Error saving settings: ' + error.message);
                    });
                });
            }
            
            // Setup cancel button
            const cancelBtn = modal.querySelector('#cancelSettings');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    document.body.removeChild(modal);
                });
            }
        })
        .catch(error => {
            console.error("Error loading settings:", error);
            
            // Show simplified settings modal with error handling
            const modal = window.modalUtils.createModal({
                title: 'Settings',
                content: `
                    <div class="error-message">
                        <p>Error loading settings: ${error.message}</p>
                        <p>Using default settings instead.</p>
                    </div>
                    
                    <div class="settings-form">
                        <div class="form-group">
                            <label for="certsPath">Certificates Directory:</label>
                            <div class="input-with-button">
                                <input type="text" id="certsPath" value="/certs" class="form-control">
                                <button id="browseCertsBtn" class="browse-btn"><i class="fas fa-folder-open"></i></button>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label for="defaultEmail">Default Email for ACME:</label>
                            <input type="email" id="defaultEmail" value="" placeholder="admin@example.com" class="form-control">
                        </div>
                        
                        <div class="form-group">
                            <label for="renewalDays">Default Days Before Expiry to Renew:</label>
                            <input type="number" id="renewalDays" value="30" min="1" max="90" class="form-control">
                        </div>
                    </div>
                    
                    <div class="button-group">
                        <button id="saveSettings" class="primary-btn"><i class="fas fa-save"></i> Save Settings</button>
                        <button id="cancelSettings" class="secondary-btn"><i class="fas fa-times"></i> Cancel</button>
                    </div>
                `,
                id: 'settings-modal',
                width: '600px'
            });
            
            // Setup save button
            const saveBtn = modal.querySelector('#saveSettings');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    // Get values (with error handling)
                    const certsPath = modal.querySelector('#certsPath')?.value || '/certs';
                    const defaultEmail = modal.querySelector('#defaultEmail')?.value || '';
                    const renewalDays = parseInt(modal.querySelector('#renewalDays')?.value || '30', 10);
                    
                    // Save changes
                    fetch('/api/settings', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            certsPath,
                            defaultEmail,
                            renewalDays
                        })
                    })
                    .then(response => response.json())
                    .then(result => {
                        if (result.success) {
                            document.body.removeChild(modal);
                            // Show success message
                            alert('Settings saved successfully');
                        } else {
                            alert('Error saving settings: ' + (result.error || 'Unknown error'));
                        }
                    })
                    .catch(error => {
                        alert('Error saving settings: ' + error.message);
                    });
                });
            }
            
            // Setup cancel button
            const cancelBtn = modal.querySelector('#cancelSettings');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    document.body.removeChild(modal);
                });
            }
        });
}

/**
 * Update the certificate count in the UI
 * @param {number} count - Number of certificates
 */
function updateCertificateCount(count) {
    const counterElement = document.getElementById('cert-count');
    if (!counterElement) return;
    
    counterElement.textContent = count;
    
    // Update visibility of empty state message if needed
    const emptyState = document.querySelector('.empty-state');
    if (emptyState) {
        emptyState.style.display = count > 0 ? 'none' : 'flex';
    }
    
    // Update any count-dependent UI elements
    const statElement = document.getElementById('cert-stat');
    if (statElement) {
        if (count === 0) {
            statElement.innerHTML = '<i class="fas fa-info-circle"></i> No certificates found';
        } else if (count === 1) {
            statElement.innerHTML = '<i class="fas fa-certificate"></i> 1 certificate';
        } else {
            statElement.innerHTML = `<i class="fas fa-certificate"></i> ${count} certificates`;
        }
    }
    
    console.log(`Updated certificate count: ${count}`);
}

function addGlobalEventListeners() {
    // Global event listeners from main.js
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape') {
            const openModals = document.querySelectorAll('.modal:not(.confirm-dialog)');
            
            if (openModals.length > 0 && !document.querySelector('.confirm-dialog')) {
                const topModal = openModals[openModals.length - 1];
                handleModalClose(topModal);
            }
        }
    });
}

function registerGlobalFunctions() {
    // Register functions in window for backward compatibility
    window.certConfig = {
        showConfigModal,
        showCreateCertModal,
        showSettingsModal,
        renewCertificate,
        checkDockerStatus,
        fetchCertificates
    };
    
    // Expose any other functions that might be called from HTML
    window.showConfigModal = showConfigModal;
    window.renewCertificate = renewCertificate;
    window.showCreateCertModal = showCreateCertModal;
    window.showSettingsModal = showSettingsModal;
    window.fetchCertificates = fetchCertificates;
}

/**
 * Set up event handlers for certificate config modal
 * @param {HTMLElement} modal - The modal element
 * @param {Object} cert - Certificate data
 * @param {string} fingerprint - Certificate fingerprint
 */
function setupModalEventHandlers(modal, cert, fingerprint) {
    // Set up tab navigation
    const tabButtons = modal.querySelectorAll('.tab-btn');
    const tabContents = modal.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;
            
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to current button and content
            button.classList.add('active');
            modal.querySelector(`#${tabName}-tab`).classList.add('active');
        });
    });
    
    // Set up domain management
    const newDomainInput = modal.querySelector('#newDomain');
    const stageDomainBtn = modal.querySelector('#stageDomainBtn');
    
    if (newDomainInput && stageDomainBtn) {
        // Add new domain to pending changes
        stageDomainBtn.addEventListener('click', () => {
            const newDomain = newDomainInput.value.trim();
            
            if (!newDomain) {
                return;
            }
            
            // Validate domain if we have the function
            if (typeof window.isValidDomainOrIP === 'function' && !window.isValidDomainOrIP(newDomain)) {
                window.modalUtils.showNotification('Invalid domain format', 'error');
                return;
            }
            
            // Check if domain already exists in the certificate
            if (cert.domains && cert.domains.includes(newDomain)) {
                window.modalUtils.showNotification('Domain already exists in this certificate', 'warning');
                return;
            }
            
            // Check if domain is already in the add list
            if (window.pendingChanges.addDomains.includes(newDomain)) {
                window.modalUtils.showNotification('Domain already in the pending add list', 'warning');
                return;
            }
            
            // Add to pending changes
            window.pendingChanges.addDomains.push(newDomain);
            
            // Update UI
            updatePendingChangesUI(modal);
            
            // Clear input
            newDomainInput.value = '';
        });
    }
    
    // Set up domain removal staging
    const stageRemoveBtns = modal.querySelectorAll('.stage-remove-domain-btn');
    
    stageRemoveBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const domain = btn.dataset.domain;
            
            // Add to remove list if not already there
            if (!window.pendingChanges.removeDomains.includes(domain)) {
                window.pendingChanges.removeDomains.push(domain);
            }
            
            // Update UI
            updatePendingChangesUI(modal);
        });
    });
    
    // Apply domain changes
    const applyChangesBtn = modal.querySelector('#applyChanges');
    
    if (applyChangesBtn) {
        applyChangesBtn.addEventListener('click', () => {
            applyDomainChanges(cert, fingerprint, modal);
        });
    }
    
    // Discard domain changes
    const discardChangesBtn = modal.querySelector('#discardChanges');
    
    if (discardChangesBtn) {
        discardChangesBtn.addEventListener('click', () => {
            // Reset pending changes
            window.pendingChanges.addDomains = [];
            window.pendingChanges.removeDomains = [];
            
            // Update UI
            updatePendingChangesUI(modal);
        });
    }
    
    // Set up action type change handler
    const actionTypeSelect = modal.querySelector('#actionType');
    const actionParamLabel = modal.querySelector('#actionParamLabel');
    const actionParams = modal.querySelector('#actionParams');
    const browseBtn = modal.querySelector('#browseBtn');
    
    if (actionTypeSelect && actionParamLabel && actionParams) {
        actionTypeSelect.addEventListener('change', () => {
            const actionType = actionTypeSelect.value;
            
            switch (actionType) {
                case 'copy':
                    actionParamLabel.innerHTML = '<i class="fas fa-folder"></i> Destination:';
                    actionParams.placeholder = '/path/to/destination';
                    if (browseBtn) browseBtn.style.display = 'block';
                    break;
                case 'docker-restart':
                    actionParamLabel.innerHTML = '<i class="fab fa-docker"></i> Container ID/Name:';
                    actionParams.placeholder = 'container_name or container_id';
                    if (browseBtn) browseBtn.style.display = 'none';
                    break;
                case 'command':
                    actionParamLabel.innerHTML = '<i class="fas fa-terminal"></i> Command:';
                    actionParams.placeholder = 'systemctl restart nginx';
                    if (browseBtn) browseBtn.style.display = 'none';
                    break;
            }
        });
    }
    
    // Set up browse button for copy destination
    if (browseBtn) {
        browseBtn.addEventListener('click', () => {
            if (window.modalUtils && typeof window.modalUtils.showFileBrowser === 'function') {
                window.modalUtils.showFileBrowser(modal, '#actionParams');
            } else {
                alert('File browser not available');
            }
        });
    }
    
    // Add action button
    const addActionBtn = modal.querySelector('#addActionBtn');
    const actionsContainer = modal.querySelector('#actionsContainer');
    
    if (addActionBtn && actionsContainer) {
        addActionBtn.addEventListener('click', () => {
            const actionType = actionTypeSelect.value;
            const params = actionParams.value.trim();
            
            if (!params) {
                window.modalUtils.showNotification('Please enter parameters for the action', 'error');
                return;
            }
            
            // Create action item HTML
            let icon, displayText;
            switch (actionType) {
                case 'copy': 
                    icon = '<i class="fas fa-copy"></i>';
                    displayText = params;
                    break;
                case 'docker-restart':
                    icon = '<i class="fab fa-docker"></i>';
                    displayText = params;
                    break;
                case 'command':
                    icon = '<i class="fas fa-terminal"></i>';
                    displayText = params;
                    break;
                default:
                    icon = '<i class="fas fa-cog"></i>';
                    displayText = 'Unknown action';
            }
            
            const actionItem = document.createElement('div');
            actionItem.className = 'action-item';
            actionItem.innerHTML = `
                <span>${icon} ${actionType}: ${displayText}</span>
                <button type="button" class="remove-action-btn"><i class="fas fa-trash"></i></button>
                <input type="hidden" name="actionTypes[]" value="${actionType}">
                <input type="hidden" name="actionParams[]" value="${params}">
            `;
            
            // Remove "no actions" message if it exists
            const noActions = actionsContainer.querySelector('p');
            if (noActions && noActions.textContent === 'No deployment actions configured') {
                actionsContainer.removeChild(noActions);
            }
            
            // Add to container
            actionsContainer.appendChild(actionItem);
            
            // Clear input
            actionParams.value = '';
            
            // Add event listener to remove button
            const removeBtn = actionItem.querySelector('.remove-action-btn');
            if (removeBtn) {
                removeBtn.addEventListener('click', () => {
                    actionsContainer.removeChild(actionItem);
                    
                    // If no actions left, show message
                    if (actionsContainer.querySelectorAll('.action-item').length === 0) {
                        actionsContainer.innerHTML = '<p>No deployment actions configured</p>';
                    }
                });
            }
        });
    }
    
    // Set up existing remove action buttons
    const removeActionBtns = modal.querySelectorAll('.remove-action-btn');
    
    removeActionBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            const actionItem = this.closest('.action-item');
            if (actionItem && actionsContainer) {
                actionsContainer.removeChild(actionItem);
                
                // If no actions left, show message
                if (actionsContainer.querySelectorAll('.action-item').length === 0) {
                    actionsContainer.innerHTML = '<p>No deployment actions configured</p>';
                }
            }
        });
    });
    
    // Set up find key button
    const findKeyBtn = modal.querySelector('#findKeyBtn');
    
    if (findKeyBtn) {
        findKeyBtn.addEventListener('click', () => {
            // Show loading overlay
            const loadingOverlay = window.modalUtils.createLoadingOverlay('Searching for key...');
            document.body.appendChild(loadingOverlay);
            
            // Call API to find matching key
            fetch(`/api/certificate/${fingerprint}/find-key`, {
                method: 'POST'
            })
            .then(response => response.json())
            .then(data => {
                document.body.removeChild(loadingOverlay);
                
                if (data.success && data.keyPath) {
                    window.modalUtils.showNotification(`Key found at ${data.keyPath}`, 'success');
                    
                    // Update UI
                    const keyPathElement = findKeyBtn.closest('.info-row').querySelector('.info-value');
                    if (keyPathElement) {
                        keyPathElement.innerHTML = data.keyPath;
                        findKeyBtn.style.display = 'none';
                    }
                } else {
                    const errorMsg = data.error || 'No matching key found';
                    window.modalUtils.showNotification(`Error: ${errorMsg}`, 'error');
                }
            })
            .catch(error => {
                document.body.removeChild(loadingOverlay);
                console.error('Error finding key:', error);
                window.modalUtils.showNotification(`Error: ${error.message}`, 'error');
            });
        });
    }
    
    // Set up delete button
    const deleteBtn = modal.querySelector('#deleteBtn');
    
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            deleteCertificate(fingerprint, modal);
        });
    }
    
    // Set up save button
    const saveConfigBtn = modal.querySelector('#saveConfig');
    
    if (saveConfigBtn) {
        saveConfigBtn.addEventListener('click', () => {
            saveCertificateConfiguration(cert, fingerprint, modal);
        });
    }
    
    // Set up cancel button
    const cancelConfigBtn = modal.querySelector('#cancelConfig');

    if (cancelConfigBtn) {
        cancelConfigBtn.addEventListener('click', () => {
            // Check for unsaved changes
            if (checkForUnsavedChanges(modal, cert)) {
                // Use custom confirm dialog
                window.modalUtils.showCustomConfirm(
                    'You have unsaved changes. Are you sure you want to close?',
                    // onConfirm callback
                    () => {
                        document.body.removeChild(modal);
                    }
                );
            } else {
                document.body.removeChild(modal);
            }
        });
    }
}

/**
 * Update the pending changes UI in the domains tab
 * @param {HTMLElement} modal - The modal element
 */
function updatePendingChangesUI(modal) {
    const pendingChangesContainer = modal.querySelector('#pendingChanges');
    const pendingList = modal.querySelector('#pendingList');
    
    if (!pendingChangesContainer || !pendingList) return;
    
    const hasChanges = (
        window.pendingChanges.addDomains.length > 0 || 
        window.pendingChanges.removeDomains.length > 0
    );
    
    // Update visibility
    pendingChangesContainer.style.display = hasChanges ? 'block' : 'none';
    
    if (hasChanges) {
        let pendingHTML = '';
        
        // Add domains to be added
        if (window.pendingChanges.addDomains.length > 0) {
            pendingHTML += '<div class="pending-adds">';
            pendingHTML += '<h5>Adding:</h5>';
            pendingHTML += '<ul>';
            
            window.pendingChanges.addDomains.forEach(domain => {
                pendingHTML += `<li>
                    <span class="domain-name">${domain}</span>
                    <button class="undo-add-btn" data-domain="${domain}">
                        <i class="fas fa-undo"></i>
                    </button>
                </li>`;
            });
            
            pendingHTML += '</ul>';
            pendingHTML += '</div>';
        }
        
        // Add domains to be removed
        if (window.pendingChanges.removeDomains.length > 0) {
            pendingHTML += '<div class="pending-removes">';
            pendingHTML += '<h5>Removing:</h5>';
            pendingHTML += '<ul>';
            
            window.pendingChanges.removeDomains.forEach(domain => {
                pendingHTML += `<li>
                    <span class="domain-name">${domain}</span>
                    <button class="undo-remove-btn" data-domain="${domain}">
                        <i class="fas fa-undo"></i>
                    </button>
                </li>`;
            });
            
            pendingHTML += '</ul>';
            pendingHTML += '</div>';
        }
        
        pendingList.innerHTML = pendingHTML;
        
        // Add event listeners to undo buttons
        modal.querySelectorAll('.undo-add-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const domain = btn.dataset.domain;
                window.pendingChanges.addDomains = window.pendingChanges.addDomains.filter(d => d !== domain);
                updatePendingChangesUI(modal);
            });
        });
        
        modal.querySelectorAll('.undo-remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const domain = btn.dataset.domain;
                window.pendingChanges.removeDomains = window.pendingChanges.removeDomains.filter(d => d !== domain);
                updatePendingChangesUI(modal);
            });
        });
    }
}

/**
 * Check if there are unsaved changes in the modal
 * @param {HTMLElement} modal - The modal element
 * @param {Object} cert - Original certificate data
 * @returns {boolean} True if there are unsaved changes
 */
function checkForUnsavedChanges(modal, cert) {
    // Check for pending domain changes
    if (window.pendingChanges && (
        window.pendingChanges.addDomains.length > 0 || 
        window.pendingChanges.removeDomains.length > 0
    )) {
        return true;
    }
    
    // Check auto-renew setting
    const autoRenewCheckbox = modal.querySelector('#autoRenew');
    if (autoRenewCheckbox && autoRenewCheckbox.checked !== (cert.autoRenew || false)) {
        return true;
    }
    
    // Check renew days
    const renewDaysInput = modal.querySelector('#renewDays');
    if (renewDaysInput && parseInt(renewDaysInput.value, 10) !== (cert.renewDaysBeforeExpiry || 30)) {
        return true;
    }
    
    // Check deployment actions
    const actionItems = modal.querySelectorAll('.action-item');
    const originalActionCount = parseInt(modal.dataset.originalActionCount, 10) || 0;
    
    if (actionItems.length !== originalActionCount) {
        return true;
    }
    
    return false;
}

/**
 * Apply domain changes to certificate
 * @param {Object} cert - Certificate data
 * @param {string} fingerprint - Certificate fingerprint
 * @param {HTMLElement} modal - The modal element
 */
function applyDomainChanges(cert, fingerprint, modal) {
    // Use the custom confirm dialog instead of the browser default
    const confirmMessage = 'Changing domains requires certificate renewal. Do you want to proceed?';
    
    // Use the showCustomConfirm function from modalUtils
    window.modalUtils.showCustomConfirm(
        confirmMessage,
        // onConfirm callback
        () => {
            proceedWithDomainChanges(cert, fingerprint, modal);
        },
        // onCancel callback - do nothing
        () => {
            console.log('Domain change canceled by user');
        }
    );
}

/**
 * Save certificate configuration
 * @param {Object} cert - Certificate data
 * @param {string} fingerprint - Certificate fingerprint
 * @param {HTMLElement} modal - The modal element
 */
function saveCertificateConfiguration(cert, fingerprint, modal) {
    // Show loading overlay
    const loadingOverlay = window.modalUtils.createLoadingOverlay('Saving configuration...');
    document.body.appendChild(loadingOverlay);
    
    // Get updated values
    const autoRenew = modal.querySelector('#autoRenew').checked;
    const renewDaysBeforeExpiry = parseInt(modal.querySelector('#renewDays').value, 10);
    
    // Collect deployment actions
    const deployActions = [];
    modal.querySelectorAll('.action-item').forEach(item => {
        const typeInput = item.querySelector('[name="actionTypes[]"]');
        const paramInput = item.querySelector('[name="actionParams[]"]');
        
        if (typeInput && paramInput) {
            const type = typeInput.value;
            const param = paramInput.value;
            
            let action = { type };
            
            // Set the appropriate property based on action type
            if (type === 'copy') {
                action.destination = param;
            } else if (type === 'docker-restart') {
                // Check if it looks like an ID or a name
                if (/^[0-9a-f]{12}$/.test(param)) {
                    action.containerId = param;
                } else {
                    action.containerName = param;
                }
            } else if (type === 'command') {
                action.command = param;
            }
            
            deployActions.push(action);
        }
    });
    
    // Create updated config
    const config = {
        autoRenew,
        renewDaysBeforeExpiry,
        deployActions
    };
    
    // Send request to update configuration
    saveCertificateConfig(fingerprint, config)
        .then(data => {
            document.body.removeChild(loadingOverlay);
            
            if (data.success) {
                document.body.removeChild(modal);
                window.modalUtils.showNotification('Certificate configuration saved successfully', 'success');
                
                // Refresh certificates list
                setTimeout(() => {
                    if (typeof fetchCertificates === 'function') {
                        fetchCertificates();
                    } else {
                        window.location.reload();
                    }
                }, 1000);
            } else {
                const errorMsg = data.error || 'Unknown error occurred';
                window.modalUtils.showNotification(`Error: ${errorMsg}`, 'error');
            }
        })
        .catch(error => {
            document.body.removeChild(loadingOverlay);
            console.error('Error saving certificate config:', error);
            window.modalUtils.showNotification(`Error: ${error.message}`, 'error');
        });
}

/**
 * Save certificate configuration to the server
 * @param {string} fingerprint - Certificate fingerprint
 * @param {Object} config - Configuration to save
 * @returns {Promise<Object>} - Promise resolving to the response data
 */
function saveCertificateConfig(fingerprint, config) {
    // IMPORTANT: Fix the fingerprint encoding issue
    // First decode any existing encoding to get clean value
    let cleanFingerprint = fingerprint;
    
    // Debug the original fingerprint
    console.log('Original fingerprint:', fingerprint);
    
    try {
        // Decode if it looks encoded
        if (cleanFingerprint.includes('%')) {
            cleanFingerprint = decodeURIComponent(cleanFingerprint);
            console.log('Decoded fingerprint:', cleanFingerprint);
        }
    } catch (e) {
        console.warn('Error decoding fingerprint:', e);
    }
    
    // Remove the "sha256 Fingerprint=" prefix if present
    if (cleanFingerprint.startsWith('sha256 Fingerprint=')) {
        cleanFingerprint = cleanFingerprint.substring('sha256 Fingerprint='.length);
        console.log('Removed prefix, now:', cleanFingerprint);
    }
    
    // Remove any whitespace
    cleanFingerprint = cleanFingerprint.trim();
    
    console.log('Final cleaned fingerprint:', cleanFingerprint);
    
    // Try GET request to debug endpoint to confirm fingerprint is valid
    console.log(`Testing fingerprint at: /api/certificate/debug/${cleanFingerprint}`);
    
    // First check if the fingerprint is recognized
    return fetch(`/api/certificate/debug/fingerprint/${cleanFingerprint}`)
        .then(response => response.json())
        .then(debugInfo => {
            console.log('Debug info:', debugInfo);
            
            // Check if there's a match
            const hasMatch = debugInfo.matches && 
                             debugInfo.matches.some(m => m.isMatch);
            
            if (!hasMatch) {
                console.error('No matching certificate found!');
                console.log('Available certificates:', debugInfo.matches);
                
                // If we have matches, suggest the closest one
                if (debugInfo.matches && debugInfo.matches.length > 0) {
                    console.log('Certificates available in system:', 
                        debugInfo.matches.map(m => `${m.file} (${m.cleanFingerprint})`).join('\n'));
                }
                
                throw new Error('Certificate not found. No matching fingerprint in the system.');
            }
            
            // If we get here, the fingerprint is valid, continue with the update
            console.log(`Certificate found, proceeding with config update for ${cleanFingerprint}`);
            
            return fetch(`/api/certificate/${cleanFingerprint}/config`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(config)
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                return response.json();
            });
        });
}

/**
 * Process domain changes after confirmation
 * @param {Object} cert - Certificate data
 * @param {string} fingerprint - Certificate fingerprint
 * @param {HTMLElement} modal - The modal element
 */
function proceedWithDomainChanges(cert, fingerprint, modal) {
    // Show loading overlay
    const loadingOverlay = window.modalUtils.createLoadingOverlay('Updating certificate domains...');
    document.body.appendChild(loadingOverlay);
    
    // Calculate the new domains list
    const currentDomains = Array.isArray(cert.domains) ? [...cert.domains] : [];
    
    // Remove domains that are in the remove list
    const newDomains = currentDomains.filter(d => !window.pendingChanges.removeDomains.includes(d));
    
    // Add new domains
    window.pendingChanges.addDomains.forEach(domain => {
        if (!newDomains.includes(domain)) {
            newDomains.push(domain);
        }
    });
    
    console.log('New domains list:', newDomains);
    
    // Clean fingerprint for API call
    let cleanFingerprint = fingerprint;
    try {
        if (cleanFingerprint.includes('%')) {
            cleanFingerprint = decodeURIComponent(cleanFingerprint);
        }
    } catch (e) {
        console.warn('Error decoding fingerprint:', e);
    }
    
    if (cleanFingerprint.startsWith('sha256 Fingerprint=')) {
        cleanFingerprint = cleanFingerprint.substring('sha256 Fingerprint='.length);
    }
    
    cleanFingerprint = cleanFingerprint.trim();
    
    fetch(`/api/certificate/${cleanFingerprint}/update`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            domains: newDomains,
            action: 'updateDomains'
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        document.body.removeChild(loadingOverlay);
        
        if (data.success) {
            // Check if certificate has a new fingerprint after renewal
            if (data.newFingerprint && data.newFingerprint !== fingerprint) {
                console.log(`Certificate renewed with new fingerprint: ${data.newFingerprint}`);
                window.modalUtils.showNotification(
                    'Certificate renewed with new fingerprint', 
                    'info'
                );
            }
            
            // Close the modal
            document.body.removeChild(modal);
            
            // Show success message with added domains
            const addedDomainsMsg = window.pendingChanges.addDomains.length > 0 ? 
                ` Added: ${window.pendingChanges.addDomains.join(', ')}` : '';
            window.modalUtils.showNotification(`Certificate domains updated.${addedDomainsMsg}`, 'success');
            
            // Refresh certificates list after a short delay
            setTimeout(() => {
                if (typeof fetchCertificates === 'function') {
                    fetchCertificates();
                } else {
                    window.location.reload();
                }
            }, 3000);
        } else {
            const errorMsg = data.error || 'Unknown error occurred';
            window.modalUtils.showNotification(`Error: ${errorMsg}`, 'error');
        }
    })
    .catch(error => {
        document.body.removeChild(loadingOverlay);
        console.error('Error updating certificate domains:', error);
        window.modalUtils.showNotification(`Error: ${error.message}`, 'error');
    });
}

/**
 * Delete a certificate
 * @param {string} fingerprint - Certificate fingerprint
 * @param {HTMLElement} modal - The modal element
 */
function deleteCertificate(fingerprint, modal) {
    // Use custom confirm dialog
    window.modalUtils.showCustomConfirm(
        'Are you sure you want to delete this certificate? This action cannot be undone.',
        // onConfirm callback
        () => {
            // Show loading overlay
            const loadingOverlay = window.modalUtils.createLoadingOverlay('Deleting certificate...');
            document.body.appendChild(loadingOverlay);
            
            // IMPORTANT: Fix the fingerprint encoding issue - same as other functions
            let cleanFingerprint = fingerprint;
            try {
                if (cleanFingerprint.includes('%')) {
                    cleanFingerprint = decodeURIComponent(cleanFingerprint);
                }
            } catch (e) {
                console.warn('Error decoding fingerprint:', e);
            }
            
            if (cleanFingerprint.startsWith('sha256 Fingerprint=')) {
                cleanFingerprint = cleanFingerprint.substring('sha256 Fingerprint='.length);
            }
            
            // API call to delete the certificate
            fetch(`/api/certificate/${cleanFingerprint}`, {
                method: 'DELETE'
            })
            .then(response => response.json())
            .then(data => {
                document.body.removeChild(loadingOverlay);
                
                if (data.success) {
                    // Close the modal
                    document.body.removeChild(modal);
                    
                    // Show success message
                    window.modalUtils.showNotification('Certificate deleted successfully', 'success');
                    
                    // Refresh certificates list
                    if (typeof fetchCertificates === 'function') {
                        fetchCertificates();
                    } else {
                        window.location.reload();
                    }
                } else {
                    const errorMsg = data.error || 'Unknown error occurred';
                    window.modalUtils.showNotification(`Error: ${errorMsg}`, 'error');
                }
            })
            .catch(error => {
                document.body.removeChild(loadingOverlay);
                console.error('Error deleting certificate:', error);
                window.modalUtils.showNotification(`Error: ${error.message}`, 'error');
            });
        }
    );
}

/**
 * Handle closing a modal with unsaved changes check
 * @param {HTMLElement} modal - The modal to close
 */
function handleModalClose(modal) {
    if (!modal) return;
    
    // Check for unsaved changes
    const hasUnsavedDomainChanges = 
        window.pendingChanges && 
        (window.pendingChanges.addDomains?.length > 0 || 
         window.pendingChanges.removeDomains?.length > 0);
    
    // Get certificate data if available
    const certFingerprintData = modal.querySelector('[data-fingerprint]')?.dataset?.fingerprint;
    const cert = certFingerprintData ? certificateCache.get(certFingerprintData) : null;
    
    if (hasUnsavedDomainChanges || 
        (cert && checkForUnsavedChanges(modal, cert))) {
        
        // Use custom confirm dialog
        window.modalUtils.showCustomConfirm(
            'You have unsaved changes. Are you sure you want to close?',
            // onConfirm callback
            () => {
                document.body.removeChild(modal);
            }
        );
    } else {
        // No unsaved changes, close directly
        document.body.removeChild(modal);
    }
}

/**
 * Debug helper for certificate fingerprints
 * @param {string} fingerprint - Original fingerprint
 * @param {string} stage - Stage in the process
 */
function debugFingerprint(fingerprint, stage) {
    console.log(`[${stage}] Fingerprint details:`, {
        original: fingerprint,
        length: fingerprint.length,
        hasPrefix: fingerprint.includes('sha256 Fingerprint='),
        isEncoded: fingerprint.includes('%'),
        firstChars: fingerprint.substring(0, 10)
    });
}

// Add at the end of your initialization code
window.addEventListener('unhandledrejection', event => {
    console.warn('Unhandled promise rejection:', event.reason);
    // Prevent the error from showing in console
    event.preventDefault();
});