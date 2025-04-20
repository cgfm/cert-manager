/**
 * Main JavaScript file for managing certificates in a web application.
 * This file contains functions to render certificates in a table, handle button events,
 * and manage the certificate cache.
 * @module main - Main module for certificate management
 * @requires utils - Utility functions for date formatting and modal creation
 * @requires logger - Logger for debugging and error handling
 * @requires certificateCache - Cache for storing certificate data
 * @requires modalUtils - Utility functions for creating modals and notifications
 * @requires uiUtils - Utility functions for UI interactions
 * @requires dockerUtils - Utility functions for Docker interactions
 * @requires dateUtils - Utility functions for date formatting
 * @requires certificateUtils - Utility functions for certificate management
 * @requires configManager - Configuration manager for loading and saving settings
 * @requires renewalManager - Renewal manager for handling certificate renewals
 * @requires schedulerService - Scheduler service for managing scheduled tasks
 * @requires certificateService - Service for managing certificates
 * @requires services - Object containing all services used in the application
 * @license MIT
 * @version 1.0.0
 * @description This file is responsible for rendering certificates in a table format,
 */

// Add utility verification and fallbacks at the beginning
(function ensureUtilities() {
    logger.debug('Checking utilities...');

    // Simple fallback modal function
    function fallbackCreateModal(options) {
        logger.warn('Using fallback modal creation');
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
        logger.warn('Using fallback loading overlay');
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
        logger.warn('Using fallback notification');
        alert(message);
    }

    // Check and create fallbacks for all utility objects
    if (!window.modalUtils) {
        logger.warn('modalUtils not found, creating fallback');
        window.modalUtils = {};
    }

    if (typeof window.modalUtils.createModal !== 'function') {
        logger.warn('modalUtils.createModal not found, adding fallback');
        window.modalUtils.createModal = fallbackCreateModal;
    }

    if (typeof window.modalUtils.createLoadingOverlay !== 'function') {
        logger.warn('modalUtils.createLoadingOverlay not found, adding fallback');
        window.modalUtils.createLoadingOverlay = fallbackCreateLoadingOverlay;
    }

    if (typeof window.modalUtils.showNotification !== 'function') {
        logger.warn('modalUtils.showNotification not found, adding fallback');
        window.modalUtils.showNotification = fallbackShowNotification;
    }

    if (!window.uiUtils) {
        logger.warn('uiUtils not found, creating fallback');
        window.uiUtils = {};
    }

    if (typeof window.modalUtils.showNotification !== 'function') {
        logger.warn('modalUtils.showNotification not found, adding fallback');
        window.modalUtils.showNotification = function (message, type) {
            logger.info(`[${type || 'info'}] ${message}`);
            alert(message);
        };
    }

    if (!window.dockerUtils) {
        logger.warn('dockerUtils not found, creating fallback');
        window.dockerUtils = {
            checkDockerStatus: function () {
                logger.warn('Using dockerUtils fallback');
                return Promise.resolve({ available: false });
            }
        };
    }

    if (!window.dateUtils) {
        logger.warn('dateUtils not found, creating fallback');
        window.dateUtils = {};
    }

    if (typeof window.dateUtils.formatDate !== 'function') {
        logger.warn('dateUtils.formatDate not found, adding fallback');
        window.dateUtils.formatDate = function (date) {
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
                logger.error('Error formatting date:', error);
                return String(date);
            }
        };
    }

    // Verify utilities are available
    logger.debug('Utilities available:', {
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
    get: function (fingerprint) {
        return this.data[fingerprint];
    },
    set: function (fingerprint, data) {
        this.data[fingerprint] = data;
    },
    invalidate: function (fingerprint) {
        delete this.data[fingerprint];
    },
    clear: function () {
        logger.info('Clearing certificate cache');
        this.data = {};
    }
};

// New function to attach event handlers to all buttons
function attachButtonEventHandlers() {
    logger.debug('Attaching event handlers to certificate buttons');

    // Log the number of buttons found for debugging
    const configButtons = document.querySelectorAll('.config-btn');
    const renewButtons = document.querySelectorAll('.renew-btn');
    logger.debug(`Found ${configButtons.length} configure buttons and ${renewButtons.length} renew buttons`);

    // Check if we have any rows without buttons and add buttons to them
    document.querySelectorAll('.cert-row').forEach(row => {
        const fingerprint = row.dataset.fingerprint;
        if (!fingerprint) {
            logger.debug('Found a row without fingerprint', row);
            return;
        }

        let actionsCell = row.querySelector('.cert-actions');

        // If no actions cell exists, create one
        if (!actionsCell) {
            logger.debug('Creating actions cell for row', row);
            actionsCell = document.createElement('td');
            actionsCell.className = 'cert-actions';
            row.appendChild(actionsCell);
        }

        // Check if actions cell is empty or doesn't have buttons
        if (!actionsCell.querySelector('button')) {
            logger.debug('Adding buttons to actions cell', actionsCell);
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
                logger.debug('Configure button clicked for fingerprint:', fingerprint);
                try {
                    showConfigModal(fingerprint);
                } catch (error) {
                    logger.error('Error showing config modal:', error);
                    alert('Error showing configuration: ' + error.message);
                }
            });
        } else {
            logger.debug('Found a configure button without fingerprint', btn);
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
                logger.debug('Renew button clicked for fingerprint:', fingerprint);
                try {
                    renewCertificate(fingerprint);
                } catch (error) {
                    logger.error('Error renewing certificate:', error);
                    alert('Error renewing certificate: ' + error.message);
                }
            });
        } else {
            logger.debug('Found a renew button without fingerprint', btn);
        }
    });

    // Final verification
    const afterConfigButtons = document.querySelectorAll('.config-btn');
    const afterRenewButtons = document.querySelectorAll('.renew-btn');
    logger.debug(`After processing: ${afterConfigButtons.length} configure buttons and ${afterRenewButtons.length} renew buttons`);
}

/**
 * Render certificates into the table
 * @param {Array} certificates - Array of certificate objects
 */
function renderCertificates(certificates) {
    logger.info(`Rendering ${certificates.length} certificates in flat view.`);

    const tableBody = document.querySelector('#certificatesTable tbody') ||
        document.querySelector('.certificates-table tbody');

    if (!tableBody) {
        logger.error('Certificate table body not found in the DOM');
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
                logger.warn(`Failed to parse date: ${dateValue}`, e);
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
                    logger.warn(`Error formatting date: ${expiryDate}`, e);
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
    logger.info(`Rendering ${certificates.length} certificates in hierarchy view`);

    const tableBody = document.querySelector('#certificatesTable tbody') ||
        document.querySelector('.certificates-table tbody');

    if (!tableBody) {
        logger.error('Certificate table body not found in the DOM');
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
            logger.warn(`Error formatting date: ${dateString}`, e);
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
    fetch(`/api/certificate/${encodeURIComponent(fingerprint)}/renew`, {
        method: 'POST'
    })
        .then(response => {
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Certificate not found. It may have been deleted or moved.');
                }
                throw new Error(`Server returned status ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Clear certificate caches
                window.cachedCertificates = null;
                if (window.certificateCache) {
                    window.certificateCache.clear();
                } else {
                    // Create a clear method if it doesn't exist
                    if (window.certificateCache) {
                        window.certificateCache.data = {};
                    }
                }

                logger.info('Certificate cache cleared after renewal');

                // Wait a moment for the server to process the renewal before fetching
                setTimeout(() => {
                    // Remove the loading overlay
                    document.body.removeChild(loadingOverlay);

                    // Force fetch with refresh to ensure we get the latest data
                    fetchCertificates(true).catch(fetchError => {
                        logger.error('Error fetching certificates after renewal:', fetchError);
                    });
                }, 1000);
            } else {
                document.body.removeChild(loadingOverlay);
                const errorMsg = data.error || 'Unknown error occurred';
                window.modalUtils.showNotification(`Error: ${errorMsg}`, 'error');
            }
        })
        .catch(error => {
            document.body.removeChild(loadingOverlay);
            logger.error('Error renewing certificate:', error);
            window.modalUtils.showNotification(`Error: ${error.message}`, 'error');
        });
}

// Function to show certificate configuration modal
async function showConfigModal(fingerprint) {
    try {
        // Show loading indicator
        logger.info('Showing config modal for certificate:', fingerprint);

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

        // Add this to the "Advanced" tab content (before the danger zone)
        const passPhraseSection = cert.certType === 'rootCA' || cert.certType === 'intermediateCA' ? `
        <div class="passphrase-management">
        <h4>Certificate Passphrase Management</h4>
        <p>Manage the passphrase for this CA certificate.</p>
        <div id="passphrase-status" class="form-group">
            <span class="loading"><i class="fas fa-circle-notch fa-spin"></i> Checking passphrase status...</span>
        </div>
        <div class="button-group">
            <button id="setPassphraseBtn" class="secondary-btn">
            <i class="fas fa-key"></i> Set Passphrase
            </button>
            <button id="removePassphraseBtn" class="danger-btn" style="display:none">
            <i class="fas fa-trash-alt"></i> Remove Stored Passphrase
            </button>
        </div>
        </div>
        ` : '';

        // Create tabs content
        const modalContent = `
            <div class="tabs">
                <button class="tab-btn active" data-tab="details">Details</button>
                <button class="tab-btn" data-tab="domains">Domains</button>
                <button class="tab-btn" data-tab="deploy">Deployment</button>
                <button class="tab-btn" data-tab="backups">Backups</button>
                <button class="tab-btn" data-tab="advanced">Advanced</button>
            </div>
            
            <div class="tab-contents">
                <!-- Details tab content here -->
                <div id="details-tab" class="tab-content active">
                    <div class="form-group">
                        <label class="toggle-switch">
                            <input type="checkbox" id="autoRenew" ${cert.autoRenew ? 'checked' : ''}>
                            <span class="toggle-slider"></span>
                            <span class="toggle-label-text">Auto-renew this certificate</span>
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
                        
                <!-- Backups tab content -->
                <div id="backups-tab" class="tab-content">
                    <h3>Certificate Backups</h3>
                    <div class="backup-list-container" id="backup-list-container">
                        <p class="loading-backups"><i class="fas fa-spinner fa-spin"></i> Loading backups...</p>
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

                    ${passPhraseSection}

                    <div class="signing-options">
                        <h4>Signing Configuration</h4>
                        <div class="form-group">
                            <label class="toggle-switch">
                                <input type="checkbox" id="signWithCA" ${cert.signWithCA ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                                <span class="toggle-label-text">Sign with CA certificate</span>
                            </label>
                            <p class="form-help-text">When enabled, this certificate will be signed by a CA certificate instead of being self-signed.</p>
                        </div>
                        
                        <div id="caSelectionContainer" class="form-group" ${cert.signWithCA ? '' : 'style="display: none"'}>
                            <label for="caFingerprint">Signing CA Certificate:</label>
                            <select id="caFingerprint" class="ca-selector">
                                <option value="">Loading CA certificates...</option>
                            </select>
                            <p class="form-help-text">Select which CA certificate should sign this certificate when it's renewed.</p>
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

        logger.error('Error showing config modal:', error);
        alert('Error loading certificate configuration: ' + error.message);
    }
}

/**
 * Fetch and render certificate backups
 * @param {string} fingerprint - Certificate fingerprint
 * @param {HTMLElement} container - Container element to render backups
 */
function fetchAndRenderBackups(fingerprint, container) {
    // Make sure container exists
    if (!container) return;
    
    // Clean the fingerprint for URL safety
    const cleanFingerprint = fingerprint.replace(/:/g, '');
    
    // Show loading indicator
    container.innerHTML = '<p class="loading-backups"><i class="fas fa-spinner fa-spin"></i> Loading backups...</p>';
    
    // Fetch backups from API
    fetch(`/api/certificate/${cleanFingerprint}/backups`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to fetch backups: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Check if there are any backups
            if (!data.backups || data.backups.length === 0) {
                container.innerHTML = '<p class="no-backups">No backups found for this certificate.</p>';
                return;
            }
            
            // Render the backups
            const backupsHTML = `
                <table class="backups-table">
                    <thead>
                        <tr>
                            <th>Version</th>
                            <th>Valid From</th>
                            <th>Valid To</th>
                            <th>Renewed On</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.backups.map((backup, index) => `
                            <tr>
                                <td>Version ${data.backups.length - index}</td>
                                <td>${window.dateUtils.formatDate(backup.validFrom)}</td>
                                <td>${window.dateUtils.formatDate(backup.validTo)}</td>
                                <td>${window.dateUtils.formatDate(backup.renewedAt)}</td>
                                <td>
                                    <button class="view-backup-btn small-btn" 
                                            data-fingerprint="${backup.fingerprint}" 
                                            data-cert-path="${backup.backupCertPath}" 
                                            data-key-path="${backup.backupKeyPath}">
                                        <i class="fas fa-eye"></i> View
                                    </button>
                                    <button class="restore-backup-btn small-btn" 
                                            data-fingerprint="${backup.fingerprint}" 
                                            data-cert-path="${backup.backupCertPath}" 
                                            data-key-path="${backup.backupKeyPath}">
                                        <i class="fas fa-undo"></i> Restore
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
            
            container.innerHTML = backupsHTML;
            
            // Set up action buttons
            container.querySelectorAll('.view-backup-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const certPath = this.dataset.certPath;
                    showBackupCertificateDetails(certPath);
                });
            });
            
            container.querySelectorAll('.restore-backup-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const certPath = this.dataset.certPath;
                    const keyPath = this.dataset.keyPath;
                    const backupFingerprint = this.dataset.fingerprint;
                    
                    restoreCertificateBackup(fingerprint, backupFingerprint, certPath, keyPath);
                });
            });
        })
        .catch(error => {
            logger.error('Error fetching certificate backups:', error);
            container.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-circle"></i>
                    <p>Error loading backups: ${error.message}</p>
                </div>
            `;
        });
}

/**
 * Show backup certificate details
 * @param {string} certPath - Path to the certificate file
 */
function showBackupCertificateDetails(certPath) {
    // Show loading overlay
    const loadingOverlay = window.modalUtils.createLoadingOverlay('Loading certificate details...');
    document.body.appendChild(loadingOverlay);
    
    // Fetch certificate details
    fetch('/api/certificate/details', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ certPath })
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to get certificate details: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            document.body.removeChild(loadingOverlay);
            
            // Format dates
            const validFrom = window.dateUtils.formatDate(data.validFrom);
            const validTo = window.dateUtils.formatDate(data.validTo);
            
            // Create modal content
            const modalContent = `
                <div class="cert-details">
                    <h3>Certificate Details</h3>
                    
                    <div class="info-row">
                        <span class="info-label">Subject:</span>
                        <span class="info-value">${data.subject || 'N/A'}</span>
                    </div>
                    
                    <div class="info-row">
                        <span class="info-label">Issuer:</span>
                        <span class="info-value">${data.issuer || 'N/A'}</span>
                    </div>
                    
                    <div class="info-row">
                        <span class="info-label">Valid From:</span>
                        <span class="info-value">${validFrom}</span>
                    </div>
                    
                    <div class="info-row">
                        <span class="info-label">Valid Until:</span>
                        <span class="info-value">${validTo}</span>
                    </div>
                    
                    <div class="info-row">
                        <span class="info-label">Fingerprint:</span>
                        <span class="info-value">${data.fingerprint || 'N/A'}</span>
                    </div>
                    
                    <div class="info-row">
                        <span class="info-label">Serial Number:</span>
                        <span class="info-value">${data.serialNumber || 'N/A'}</span>
                    </div>
                    
                    <div class="info-row">
                        <span class="info-label">Certificate Path:</span>
                        <span class="info-value">${certPath}</span>
                    </div>
                    
                    ${data.domains && data.domains.length > 0 ? `
                    <div class="domains-section">
                        <h4>Domains</h4>
                        <ul class="domain-list">
                            ${data.domains.map(domain => `<li>${domain}</li>`).join('')}
                        </ul>
                    </div>
                    ` : ''}
                </div>
            `;
            
            // Create modal
            window.modalUtils.createModal({
                title: 'Backup Certificate Details',
                content: modalContent,
                width: '600px'
            });
        })
        .catch(error => {
            document.body.removeChild(loadingOverlay);
            logger.error('Error getting certificate details:', error);
            window.modalUtils.showNotification(`Error: ${error.message}`, 'error');
        });
}

/**
 * Restore a certificate from backup
 * @param {string} currentFingerprint - Current certificate fingerprint
 * @param {string} backupFingerprint - Backup certificate fingerprint
 * @param {string} certPath - Path to backup certificate file
 * @param {string} keyPath - Path to backup key file
 */
function restoreCertificateBackup(currentFingerprint, backupFingerprint, certPath, keyPath) {
    // Clean fingerprints for URL safety
    const cleanFingerprint = currentFingerprint.replace(/:/g, '');
    
    // Show confirmation dialog
    window.modalUtils.showCustomConfirm(
        'Are you sure you want to restore this backup? This will replace the current certificate.',
        () => {
            // Show loading overlay
            const loadingOverlay = window.modalUtils.createLoadingOverlay('Restoring backup...');
            document.body.appendChild(loadingOverlay);
            
            // Call API to restore backup
            fetch(`/api/certificate/${cleanFingerprint}/restore`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    backupFingerprint,
                    backupCertPath: certPath, 
                    backupKeyPath: keyPath
                })
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`Failed to restore backup: ${response.status}`);
                    }
                    return response.json();
                })
                .then(data => {
                    document.body.removeChild(loadingOverlay);
                    
                    if (data.success) {
                        // Close any open modals
                        document.querySelectorAll('.modal').forEach(modal => {
                            document.body.removeChild(modal);
                        });
                        
                        window.modalUtils.showNotification('Certificate restored successfully', 'success');
                        
                        // Refresh certificates list
                        fetchCertificates(true);
                    } else {
                        const errorMsg = data.error || 'Unknown error occurred';
                        window.modalUtils.showNotification(`Error: ${errorMsg}`, 'error');
                    }
                })
                .catch(error => {
                    document.body.removeChild(loadingOverlay);
                    logger.error('Error restoring certificate backup:', error);
                    window.modalUtils.showNotification(`Error: ${error.message}`, 'error');
                });
        }
    );
}

/**
 * Show the create certificate modal
 */
function showCreateCertModal() {
    logger.info('Opening create certificate modal');

    if (!window.modalUtils || !window.modalUtils.createModal) {
        logger.error('Modal utilities not available');
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
                    <label class="toggle-switch">
                        <input type="checkbox" id="autoRenew">
                        <span class="toggle-slider"></span>
                        <span class="toggle-label-text">Auto-renew this certificate</span>
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
                logger.warn('isValidDomainOrIP function not found');
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
            logger.warn('Error loading default email:', error);
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
            logger.error('Error creating certificate:', error);
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
            logger.error('Error uploading certificate:', error);
            window.modalUtils.showNotification(`Error: ${error.message}`, 'error');
        });
}

/**
 * Initialize the search functionality
 */
function initializeSearch() {
    const searchInput = document.getElementById('certSearch');
    if (!searchInput) {
        logger.error('Search input element not found');
        return;
    }

    searchInput.addEventListener('input', function () {
        const searchTerm = this.value.toLowerCase().trim();
        filterCertificates(searchTerm);
    });

    logger.info('Search functionality initialized');
}

/**
 * Filter certificates based on search term
 * @param {string} searchTerm - The search term to filter by
 */
function filterCertificates(searchTerm) {
    // Get the current view mode
    const viewMode = getViewMode();

    // If no search term, just render all certificates with the current view mode
    if (!searchTerm) {
        renderCertificatesWithMode(window.cachedCertificates, viewMode);
        return;
    }

    // Filter certificates based on search term
    const filteredCerts = window.cachedCertificates.filter(cert => {
        // Search in name
        if (cert.name && cert.name.toLowerCase().includes(searchTerm)) {
            return true;
        }

        // Search in domains
        if (cert.domains && Array.isArray(cert.domains)) {
            for (const domain of cert.domains) {
                if (domain.toLowerCase().includes(searchTerm)) {
                    return true;
                }
            }
        }

        // Search in subject
        if (cert.subject && cert.subject.toLowerCase().includes(searchTerm)) {
            return true;
        }

        // Search in issuer
        if (cert.issuer && cert.issuer.toLowerCase().includes(searchTerm)) {
            return true;
        }

        return false;
    });

    // Render the filtered certificates with the current view mode
    renderCertificatesWithMode(filteredCerts, viewMode);
}

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
        link.addEventListener('click', function (e) {
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
        settingsBtn.title = 'Settings';
        settingsBtn.innerHTML = '<i class="fas fa-cog"></i>';
        settingsBtn.addEventListener('click', showSettingsModal);
        buttonContainer.appendChild(settingsBtn);
    }

    // Check if settings button exists
    if (!buttonContainer.querySelector('#refresh-btn')) {
        const refreshBtn = document.createElement('button');
        refreshBtn.id = 'refresh-btn';
        refreshBtn.className = 'action-btn refresh-btn';
        refreshBtn.title = 'Refresh Certificates';
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        refreshBtn.addEventListener('click', () => {
            logger.info('Refresh button clicked');
            fetchCertificates(true);
        });
        buttonContainer.appendChild(refreshBtn);
    }
}

// Domain validation initialization function
function initializeDomainValidation() {
    if (typeof isValidDomainOrIP !== 'function') {
        // Fall back to a simple implementation if utils.js is not loaded
        window.isValidDomainOrIP = function (domain) {
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
    document.addEventListener('keydown', function (event) {
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
            logger.error('Error checking Docker status:', error);
            dockerStatus.innerHTML = '<i class="fas fa-circle" style="color: #dc3545;"></i> Docker: <span class="status-text">Error</span>';
        });
}

/**
 * Initialize view mode toggle and set up listeners
 */
function initViewModeToggle() {
    logger.info('Initializing view mode toggle');

    // Get view mode controls or create them if they don't exist
    let viewControls = document.querySelector('.view-controls');

    if (!viewControls) {
        logger.info('Creating view controls');
        viewControls = document.createElement('div');
        viewControls.className = 'view-controls header-view-controls';
        viewControls.innerHTML = `
            <span>View:</span>
            <div class="view-toggle-container">
                <input type="checkbox" id="view-mode-toggle" class="view-toggle-input">
                <label for="view-mode-toggle" class="view-toggle-label">
                    <span class="view-option view-option-flat">Flat</span>
                    <span class="view-toggle-slider"></span>
                    <span class="view-option view-option-hierarchy">Hierarchy</span>
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
    document.addEventListener('change', function (event) {
        if (event.target.id === 'view-mode-toggle') {
            const viewMode = event.target.checked ? 'hierarchy' : 'flat';
            logger.info(`Switching to ${viewMode} view`);

            // Store the user preference
            localStorage.setItem('certViewMode', viewMode);

            // Switch the view
            if (window.cachedCertificates) {
                renderCertificatesWithMode(window.cachedCertificates, viewMode);
            } else {
                logger.info('Fetching fresh certificates for new view mode');
                fetchCertificates(true);
            }
        }
    });

    // Load saved preference if available
    try {
        const savedViewMode = localStorage.getItem('certViewMode') || 'flat';
        logger.info(`Loaded saved view mode: ${savedViewMode}`);
        const viewToggle = document.getElementById('view-mode-toggle');

        if (viewToggle) {
            viewToggle.checked = savedViewMode === 'hierarchy';

            // Apply the initial view mode
            if (window.cachedCertificates) {
                renderCertificatesWithMode(window.cachedCertificates, savedViewMode);
            }
        }
    } catch (e) {
        logger.warn('Could not load saved view mode:', e);
    }
}

/**
 * Render certificates based on the selected view mode
 * @param {Array} certificates - The certificates data
 * @param {string} mode - The view mode ('flat' or 'hierarchy')
 */
function renderCertificatesWithMode(certificates, mode) {
    logger.info(`Rendering ${certificates.length} certificates with mode: ${mode}`);

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

/**
 * Get the current view mode (flat or hierarchy)
 * @returns {string} - The view mode ('flat' or 'hierarchy')
 */
function getViewMode() {
    try {
        // First try to get from toggle switch if it exists
        const viewToggle = document.getElementById('view-mode-toggle');
        if (viewToggle) {
            // FIXED: When checked, it should be 'hierarchy'
            return viewToggle.checked ? 'hierarchy' : 'flat';
        }

        // Alternatively, check radio buttons if they exist
        const flatRadio = document.getElementById('flat-view');
        if (flatRadio && flatRadio.checked) {
            return 'flat';
        }

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
        logger.warn('Error determining view mode:', e);
        return 'flat'; // Default to flat view on error
    }
}

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
 * Show loading indicator in the certificates table
 */
function showLoadingIndicator() {
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
}

/**
 * Hide loading indicator and show "no certificates" message if needed
 */
function hideLoadingIndicator() {
    const certificatesTable = document.querySelector('#certificatesTable tbody') ||
        document.querySelector('.certificates-table tbody');

    if (certificatesTable && !window.cachedCertificates?.length) {
        certificatesTable.innerHTML = `
            <tr>
                <td colspan="4" class="no-certs-message">
                    <i class="fas fa-info-circle"></i> No certificates found
                </td>
            </tr>
        `;
    }
}

/**
 * Show a notification message
 * @param {string} message - Message to display
 * @param {string} type - Notification type (success, error, warning, info)
 * @param {number} duration - How long to show the notification in ms
 */
function showNotification(message, type = 'info', duration = 5000) {
    // Use modalUtils if available, otherwise show a basic alert
    if (window.modalUtils && typeof window.modalUtils.showNotification === 'function') {
        return window.modalUtils.showNotification(message, type, duration);
    } else {
        logger.info(`[${type}] ${message}`);
        if (type === 'error') {
            alert(message);
        }
    }
}

function initCertificateActionListeners() {
    // Now that certificates are loaded, set up the action listeners
    // Ensure modalUtils is loaded and has the required function
    if (window.modalUtils) {
        // Give a small delay to ensure DOM is updated
        setTimeout(() => {
            if (typeof window.modalUtils.setupCertificateActionListeners === 'function') {
                logger.info('Setting up certificate action listeners after certificates loaded');
                window.modalUtils.setupCertificateActionListeners();
            } else {
                logger.warn('modalUtils.setupCertificateActionListeners not available, attempting fallback');
                // Fallback: add event listeners directly
                document.querySelectorAll('.config-btn, .settings-btn, .renew-btn, .view-btn, .delete-btn, .deploy-btn').forEach(btn => {
                    btn.addEventListener('click', function (event) {
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
        logger.error('modalUtils not loaded! Certificate buttons may not work.');
    }
}

/**
 * Show settings modal
 */
function showSettingsModal() {
    logger.info("Opening settings modal");

    if (!window.modalUtils || !window.modalUtils.createModal) {
        logger.error("Modal utilities not available");
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
            logger.info("Settings loaded:", settings);

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
            logger.error("Error loading settings:", error);

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
 * Show a modal to set a CA certificate passphrase
 * @param {string} fingerprint - Certificate fingerprint
 * @param {string} certificateName - Certificate name for display
 * @param {Function} callback - Callback to run after passphrase is set
 */
function showPassphraseModal(fingerprint, certificateName, callback) {
    // Create modal
    const modal = window.modalUtils.createModal({
      title: `Set Passphrase for ${certificateName}`,
      content: `
        <div class="passphrase-form">
          <p>Enter the passphrase for this CA certificate.</p>
          
          <div class="form-group">
            <label for="passphrase">Passphrase:</label>
            <input type="password" id="passphrase" class="form-control" placeholder="Enter passphrase">
          </div>
          
          <div class="form-group">
            <label for="confirm-passphrase">Confirm Passphrase:</label>
            <input type="password" id="confirm-passphrase" class="form-control" placeholder="Confirm passphrase">
          </div>
          
          <div class="form-group">
            <label>
              <input type="checkbox" id="persist-passphrase" checked>
              Store passphrase persistently (encrypted)
            </label>
            <p class="help-text">If not checked, the passphrase will only be stored in memory until the server restarts.</p>
          </div>
        </div>
        
        <div class="button-group">
          <button id="savePassphraseBtn" class="primary-btn">Save Passphrase</button>
          <button id="cancelPassphraseBtn" class="secondary-btn">Cancel</button>
        </div>
      `,
      width: '500px'
    });
    
    // Set up save button
    const saveBtn = modal.querySelector('#savePassphraseBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const passphrase = modal.querySelector('#passphrase').value;
            const confirmPassphrase = modal.querySelector('#confirm-passphrase').value;
            const persistPassphrase = modal.querySelector('#persist-passphrase').checked;
            
            // Validate passphrases match
            if (passphrase !== confirmPassphrase) {
                window.modalUtils.showNotification('Passphrases do not match', 'error');
                return;
            }
            
            // Validate passphrase not empty
            if (!passphrase) {
                window.modalUtils.showNotification('Please enter a passphrase', 'error');
                return;
            }
            
            // Save passphrase - show loading overlay
            const loadingOverlay = window.modalUtils.createLoadingOverlay('Saving passphrase...');
            document.body.appendChild(loadingOverlay);
            
            fetch(`/api/certificate/${fingerprint}/passphrase`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    passphrase,
                    persistStorage: persistPassphrase
                })
            })
            .then(response => response.json())
            .then(data => {
                document.body.removeChild(loadingOverlay);
                
                if (data.success) {
                // Close modal
                document.body.removeChild(modal);
                
                // Show success notification
                window.modalUtils.showNotification('Passphrase saved successfully', 'success');
                
                // Run callback if provided
                if (typeof callback === 'function') {
                    callback(true);
                }
                } else {
                    window.modalUtils.showNotification(`Error: ${data.error || 'Unknown error'}`, 'error');
                }
            })
            .catch(error => {
                document.body.removeChild(loadingOverlay);
                logger.error('Error saving passphrase:', error);
                window.modalUtils.showNotification(`Error: ${error.message}`, 'error');
            });
        });
    }
    
    // Set up cancel button
    const cancelBtn = modal.querySelector('#cancelPassphraseBtn');
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    }
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

    logger.info(`Updated certificate count: ${count}`);
}

function addGlobalEventListeners() {
    // Global event listeners from main.js
    document.addEventListener('keydown', function (event) {
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
        btn.addEventListener('click', function () {
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
                    logger.error('Error finding key:', error);
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

    // Set up backups tab event
    const backupsTabButton = modal.querySelector('.tab-btn[data-tab="backups"]');
    if (backupsTabButton) {
        backupsTabButton.addEventListener('click', () => {
            // Get the container element
            const backupListContainer = modal.querySelector('#backup-list-container');
            
            // Only fetch backups if we haven't done so yet
            if (backupListContainer && 
                (!backupListContainer.dataset.loaded || backupListContainer.dataset.loaded !== 'true')) {
                // Fetch and render backups
                fetchAndRenderBackups(fingerprint, backupListContainer);
                
                // Mark as loaded
                backupListContainer.dataset.loaded = 'true';
            }
        });
    }

    // Set up passphrase management if this is a CA certificate
    if (cert.certType === 'rootCA' || cert.certType === 'intermediateCA') {
        const passPhraseStatus = modal.querySelector('#passphrase-status');
        const setPassphraseBtn = modal.querySelector('#setPassphraseBtn');
        const removePassphraseBtn = modal.querySelector('#removePassphraseBtn');
    
        // Clean the fingerprint for URL safety - this was missing
        const cleanFingerprint = fingerprint.replace(/:/g, '');
    
        // Check if certificate has a stored passphrase
        fetch(`/api/certificate/${cleanFingerprint}/passphrase/check`)
        .then(response => response.json())
        .then(data => {
            if (data.success) {
            if (data.hasPassphrase) {
                passPhraseStatus.innerHTML = '<span class="status-positive"><i class="fas fa-check-circle"></i> Passphrase is stored for this certificate</span>';
                removePassphraseBtn.style.display = 'inline-block';
            } else {
                passPhraseStatus.innerHTML = '<span class="status-neutral"><i class="fas fa-info-circle"></i> No passphrase stored for this certificate</span>';
            }
            } else {
            passPhraseStatus.innerHTML = '<span class="status-negative"><i class="fas fa-exclamation-circle"></i> Error checking passphrase status</span>';
            }
        })
        .catch(error => {
            logger.error('Error checking passphrase status:', error);
            passPhraseStatus.innerHTML = '<span class="status-negative"><i class="fas fa-exclamation-circle"></i> Error checking passphrase status</span>';
        });
    
        // Set up set passphrase button
        if (setPassphraseBtn) {
        setPassphraseBtn.addEventListener('click', () => {
            showPassphraseModal(cleanFingerprint, cert.name || 'CA Certificate', (updatedStatus) => {
            // Update status after setting passphrase
            if (updatedStatus) {
                passPhraseStatus.innerHTML = '<span class="status-positive"><i class="fas fa-check-circle"></i> Passphrase is stored for this certificate</span>';
                removePassphraseBtn.style.display = 'inline-block';
            }
            });
        });
        }
    
        // Set up remove passphrase button
        if (removePassphraseBtn) {
        removePassphraseBtn.addEventListener('click', () => {
            // Confirm before removing
            window.modalUtils.showCustomConfirm(
            'Are you sure you want to remove the stored passphrase for this certificate?',
            () => {
                // Call API to remove passphrase
                fetch(`/api/certificate/${cleanFingerprint}/passphrase`, {
                method: 'DELETE'
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                    passPhraseStatus.innerHTML = '<span class="status-neutral"><i class="fas fa-info-circle"></i> Passphrase removed</span>';
                    removePassphraseBtn.style.display = 'none';
                    } else {
                    window.modalUtils.showNotification(`Error: ${data.error || 'Unknown error'}`, 'error');
                    }
                })
                .catch(error => {
                    logger.error('Error removing passphrase:', error);
                    window.modalUtils.showNotification(`Error: ${error.message}`, 'error');
                });
            }
            );
        });
        }
    }

    // Handle CA signing options
    const signWithCACheckbox = modal.querySelector('#signWithCA');
    const caSelectionSection = modal.querySelector('#caSelectionSection');
    const caFingerprintSelect = modal.querySelector('#caFingerprint');

    if (signWithCACheckbox && caSelectionSection) {
        // Toggle CA selection visibility
        signWithCACheckbox.addEventListener('change', function() {
            caSelectionSection.style.display = this.checked ? 'block' : 'none';
        });
        
        // Populate CA certificates dropdown
        fetch('/api/certificate?type=ca')
            .then(response => response.json())
            .then(data => {
                if (data.success && data.certificates && data.certificates.length > 0) {
                    let options = '<option value="">Select a Certificate Authority</option>';
                    
                    // Sort CAs to put intermediates first (recommended)
                    const sortedCAs = [...data.certificates].sort((a, b) => {
                        // Intermediate CAs first, then root CAs
                        if (a.certType === 'intermediateCA' && b.certType !== 'intermediateCA') return -1;
                        if (b.certType === 'intermediateCA' && a.certType !== 'intermediateCA') return 1;
                        // Alphabetical otherwise
                        return a.name.localeCompare(b.name);
                    });
                    
                    sortedCAs.forEach(ca => {
                        const isSelected = config && config.caFingerprint === ca.fingerprint ? 'selected' : '';
                        options += `<option value="${ca.fingerprint}" ${isSelected}>${ca.name} (${ca.certType})</option>`;
                    });
                    
                    caFingerprintSelect.innerHTML = options;
                } else {
                    caFingerprintSelect.innerHTML = '<option value="">No CA certificates available</option>';
                }
            })
            .catch(error => {
                logger.error('Error fetching CA certificates:', error);
                caFingerprintSelect.innerHTML = '<option value="">Error loading CAs</option>';
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
            logger.info('Domain change canceled by user');
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
    
    // Get values from form elements
    const autoRenew = modal.querySelector('#autoRenew').checked;
    const renewDaysBeforeExpiry = parseInt(modal.querySelector('#renewDays').value, 10);

    // Get CA signing options
    const signWithCA = modal.querySelector('#signWithCA')?.checked || false;
    const caFingerprint = signWithCA ? modal.querySelector('#caFingerprint')?.value || null : null;
    
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
        deployActions,
        signWithCA: signWithCA,
        caFingerprint: caFingerprint
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
            logger.error('Error saving certificate config:', error);
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
    logger.info('Original fingerprint:', fingerprint);

    try {
        // Decode if it looks encoded
        if (cleanFingerprint.includes('%')) {
            cleanFingerprint = decodeURIComponent(cleanFingerprint);
            logger.info('Decoded fingerprint:', cleanFingerprint);
        }
    } catch (e) {
        logger.warn('Error decoding fingerprint:', e);
    }

    // Remove the "sha256 Fingerprint=" prefix if present
    if (cleanFingerprint.startsWith('sha256 Fingerprint=')) {
        cleanFingerprint = cleanFingerprint.substring('sha256 Fingerprint='.length);
        logger.info('Removed prefix, now:', cleanFingerprint);
    }

    // Remove any whitespace
    cleanFingerprint = cleanFingerprint.trim();

    logger.info('Final cleaned fingerprint:', cleanFingerprint);

    // Try GET request to debug endpoint to confirm fingerprint is valid
    logger.info(`Testing fingerprint at: /api/certificate/debug/${cleanFingerprint}`);

    // First check if the fingerprint is recognized
    return fetch(`/api/certificate/debug/fingerprint/${cleanFingerprint}`)
        .then(response => response.json())
        .then(debugInfo => {
            logger.info('Debug info:', debugInfo);

            // Check if there's a match
            const hasMatch = debugInfo.matches &&
                debugInfo.matches.some(m => m.isMatch);

            if (!hasMatch) {
                logger.error('No matching certificate found!');
                logger.info('Available certificates:', debugInfo.matches);

                // If we have matches, suggest the closest one
                if (debugInfo.matches && debugInfo.matches.length > 0) {
                    logger.info('Certificates available in system:',
                        debugInfo.matches.map(m => `${m.file} (${m.cleanFingerprint})`).join('\n'));
                }

                throw new Error('Certificate not found. No matching fingerprint in the system.');
            }

            // If we get here, the fingerprint is valid, continue with the update
            logger.info(`Certificate found, proceeding with config update for ${cleanFingerprint}`);

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

    logger.info('New domains list:', newDomains);

    // Clean fingerprint for API call
    let cleanFingerprint = fingerprint;
    try {
        if (cleanFingerprint.includes('%')) {
            cleanFingerprint = decodeURIComponent(cleanFingerprint);
        }
    } catch (e) {
        logger.warn('Error decoding fingerprint:', e);
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
                    logger.info(`Certificate renewed with new fingerprint: ${data.newFingerprint}`);
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
            logger.error('Error updating certificate domains:', error);
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
                logger.warn('Error decoding fingerprint:', e);
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
                    logger.error('Error deleting certificate:', error);
                    window.modalUtils.showNotification(`Error: ${error.message}`, 'error');
                });
        }
    );
}

// Global variables for fetch control
let currentFetchController = null;
let currentFetchTimeout = null;

/**
 * Fetch certificates from API
 * @param {boolean} forceRefresh - Whether to force a server-side refresh
 * @returns {Promise} - Promise that resolves when certificates are loaded
 */
function fetchCertificates(forceRefresh = false) {
    return new Promise((resolve, reject) => {
        // Always force refresh after a renewal
        if (window.justRenewed) {
            forceRefresh = true;
            window.justRenewed = false;
        }

        // Show loading indicator
        showLoadingIndicator();

        // Cancel any pending fetches
        if (currentFetchController) {
            logger.info('Aborting previous fetch request');
            currentFetchController.abort();
            currentFetchController = null;
        }

        if (currentFetchTimeout) {
            clearTimeout(currentFetchTimeout);
            currentFetchTimeout = null;
        }

        // Create a new AbortController for this fetch
        currentFetchController = new AbortController();
        const signal = currentFetchController.signal;

        // Set a timeout to abort the fetch after 10 seconds
        currentFetchTimeout = setTimeout(() => {
            logger.info('Fetch timeout exceeded (10s)');
            if (currentFetchController) {
                currentFetchController.abort('timeout');
                currentFetchController = null;
            }
        }, 10000);

        const url = forceRefresh ?
            '/api/certificate?refresh=true' :
            '/api/certificate';

        logger.info(`Fetching certificates from ${url}`);

        // Fetch certificates from API with timeout protection
        fetch(url, { signal })
            .then(response => {
                // Clear the timeout as soon as we get a response
                if (currentFetchTimeout) {
                    clearTimeout(currentFetchTimeout);
                    currentFetchTimeout = null;
                }

                if (!response.ok) {
                    throw new Error(`Server returned status: ${response.status}`);
                }

                return response.json();
            })
            .then(data => {
                // Reset the controller since this fetch is complete
                currentFetchController = null;

                // Store certificates in global cache
                window.cachedCertificates = data;

                // Also update the certificate cache for individual lookup
                if (window.certificateCache) {
                    // Clear first to remove old certificates 
                    window.certificateCache.clear();

                    // Add each certificate to the cache
                    data.forEach(cert => {
                        if (cert.fingerprint) {
                            window.certificateCache.set(cert.fingerprint, cert);
                        }
                    });
                }

                // Get current view mode and apply any current search term
                const viewMode = getViewMode();
                const searchTerm = document.getElementById('certSearch')?.value.toLowerCase().trim();

                // Apply search filter if there is an active search
                if (searchTerm) {
                    filterCertificates(searchTerm);
                } else {
                    // Apply current sort if available
                    if (window.currentSort) {
                        sortAndRenderCertificates();
                    } else {
                        // Otherwise just render with the current view mode
                        renderCertificatesWithMode(data, viewMode);
                    }
                }

                // Initialize or re-initialize search and sorting if they're not initialized yet
                if (!window.searchInitialized) {
                    initializeSearch();
                    window.searchInitialized = true;
                }

                if (!window.sortingInitialized) {
                    initializeSorting();
                    window.sortingInitialized = true;
                }

                // Hide loading indicator
                hideLoadingIndicator();

                // Resolve the promise with the data
                resolve(data);
            })
            .catch(error => {
                // Clear timeout if it's still active
                if (currentFetchTimeout) {
                    clearTimeout(currentFetchTimeout);
                    currentFetchTimeout = null;
                }

                // If this was an abort that we triggered ourselves, handle quietly
                if (error.name === 'AbortError' && error.message !== 'timeout') {
                    logger.info('Fetch aborted - likely due to a new request');
                    reject(error);
                    return;
                }

                logger.error('Error fetching certificates:', error);

                // Show error message to user
                window.modalUtils.showNotification(`Error loading certificates: ${error.message}`, 'error');

                // Hide loading indicator
                hideLoadingIndicator();

                // Reject the promise with the error
                reject(error);
            });
    });
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
    logger.info(`[${stage}] Fingerprint details:`, {
        original: fingerprint,
        length: fingerprint.length,
        hasPrefix: fingerprint.includes('sha256 Fingerprint='),
        isEncoded: fingerprint.includes('%'),
        firstChars: fingerprint.substring(0, 10)
    });
}

/**
 * Initialize the sorting functionality
 */
function initializeSorting() {
    const sortHeaders = document.querySelectorAll('.sort-header');
    if (!sortHeaders.length) {
        logger.error('Sort headers not found');
        return;
    }

    // Current sort state
    window.currentSort = {
        column: 'name',
        direction: 'asc'
    };

    sortHeaders.forEach(header => {
        header.addEventListener('click', function () {
            const column = this.getAttribute('data-sort');

            // Toggle direction if clicking the same column
            if (window.currentSort.column === column) {
                window.currentSort.direction = window.currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                window.currentSort.column = column;
                window.currentSort.direction = 'asc';
            }

            // Update UI to show sort direction
            updateSortUI(window.currentSort.column, window.currentSort.direction);

            // Sort and render certificates
            sortAndRenderCertificates();
        });
    });

    logger.info('Sorting functionality initialized');
}

/**
 * Update UI to show current sort column and direction
 * @param {string} column - Column being sorted
 * @param {string} direction - Sort direction ('asc' or 'desc')
 */
function updateSortUI(column, direction) {
    const sortHeaders = document.querySelectorAll('.sort-header');

    sortHeaders.forEach(header => {
        const headerColumn = header.getAttribute('data-sort');
        const icon = header.querySelector('i');

        // Reset all icons first
        icon.className = 'fas fa-sort';

        // Update icon for current sort column
        if (headerColumn === column) {
            icon.className = direction === 'asc' ? 'fas fa-sort-up' : 'fas fa-sort-down';
        }
    });
}

/**
 * Check for certificate expirations and show warnings
 */
function checkCertificateExpirations() {
    logger.info('Checking certificate expirations...');

    // Skip if no certificates are loaded yet
    if (!window.cachedCertificates || window.cachedCertificates.length === 0) {
        logger.info('No certificates cached, skipping expiration check');
        return;
    }

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    let expiredCount = 0;
    let expiringCount = 0;
    const expiredCerts = [];
    const expiringCerts = [];

    // Check each certificate
    window.cachedCertificates.forEach(cert => {
        // Skip CA certificates - they usually have longer validity periods
        if (cert.certType === 'rootCA' || cert.certType === 'intermediateCA') {
            return;
        }

        // Parse the expiry date
        const expiryDate = new Date(cert.validTo || cert.expiryDate || cert.notAfter);

        // Skip if we couldn't parse the date
        if (isNaN(expiryDate.getTime())) {
            return;
        }

        // Check if expired
        if (expiryDate < now) {
            expiredCount++;
            expiredCerts.push(cert);
        }
        // Check if expiring soon
        else if (expiryDate < thirtyDaysFromNow) {
            expiringCount++;
            expiringCerts.push(cert);
        }
    });

    // Show warnings if any certificates are expired or expiring
    if (expiredCount > 0) {
        const message = expiredCount === 1
            ? `1 certificate has expired`
            : `${expiredCount} certificates have expired`;

        window.modalUtils.showNotification(message, 'error', 0);
    }

    if (expiringCount > 0) {
        const message = expiringCount === 1
            ? `1 certificate will expire in the next 30 days`
            : `${expiringCount} certificates will expire in the next 30 days`;

        // Show after a small delay if there was also an expired notification
        setTimeout(() => {
            window.modalUtils.showNotification(message, 'warning', 0);
        }, expiredCount > 0 ? 500 : 0);
    }

    // Return the results in case they're needed
    return {
        expired: expiredCerts,
        expiring: expiringCerts
    };
}

/**
 * Sort and render certificates based on current sort settings
 */
function sortAndRenderCertificates() {
    if (!window.cachedCertificates || !window.cachedCertificates.length) {
        return;
    }

    const { column, direction } = window.currentSort;

    // Clone the array to avoid modifying the original
    const sortedCerts = [...window.cachedCertificates];

    // Sort based on column
    sortedCerts.sort((a, b) => {
        let valueA, valueB;

        if (column === 'name') {
            valueA = a.name || '';
            valueB = b.name || '';
        } else if (column === 'expiry') {
            // Parse dates for comparison
            valueA = a.validTo ? new Date(a.validTo) : new Date(0);
            valueB = b.validTo ? new Date(b.validTo) : new Date(0);
        } else {
            // Default fallback to name
            valueA = a.name || '';
            valueB = b.name || '';
        }

        // Compare the values
        if (typeof valueA === 'string' && typeof valueB === 'string') {
            return direction === 'asc' ?
                valueA.localeCompare(valueB) :
                valueB.localeCompare(valueA);
        } else {
            // For dates or numbers
            return direction === 'asc' ?
                (valueA > valueB ? 1 : -1) :
                (valueA < valueB ? 1 : -1);
        }
    });

    // Render the sorted certificates with the current view mode
    renderCertificatesWithMode(sortedCerts, getViewMode());
}

// Add or update your Socket.io initialization function

function initializeWebSocket() {
    try {
        const socket = io();

        socket.on('connect', () => {
            logger.info('WebSocket connected');
            const wsStatus = document.querySelector('#ws-status');
            if (wsStatus) {
                wsStatus.innerHTML = '<i class="fas fa-plug" style="color: #28a745;"></i> WebSocket: <span class="status-text">Connected</span>';
                wsStatus.classList.add('connected');
            }
        });

        socket.on('disconnect', () => {
            logger.info('WebSocket disconnected');
            const wsStatus = document.querySelector('#ws-status');
            if (wsStatus) {
                wsStatus.innerHTML = '<i class="fas fa-plug" style="color: #dc3545;"></i> WebSocket: <span class="status-text">Disconnected</span>';
                wsStatus.classList.remove('connected');
            }
        });

        socket.on('certificate-renewed', (data) => {
            logger.info('Certificate renewed event received:', data);

            // Show a notification
            window.modalUtils.showNotification(
                `Certificate for ${data.domains ? data.domains[0] : data.name} renewed successfully`,
                'success'
            );

            // Clear certificate caches
            window.cachedCertificates = null;
            if (window.certificateCache) {
                window.certificateCache.clear();
            }

            // Cancel any existing fetch operations before making a new one
            if (currentFetchController) {
                logger.info('Canceling any existing fetch operations');
                // Don't abort here as it causes the error - just clear the references
                currentFetchController = null;
            }

            if (currentFetchTimeout) {
                clearTimeout(currentFetchTimeout);
                currentFetchTimeout = null;
            }

            // Add a small delay before fetching to ensure the server has finished updating
            setTimeout(() => {
                // Use a static fetch without AbortController to avoid the race condition
                logger.info('Fetching certificates after renewal notification');

                const url = '/api/certificate?refresh=true';

                // Simple fetch without abort controller for this specific case
                fetch(url)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(`Server returned status: ${response.status}`);
                        }
                        return response.json();
                    })
                    .then(data => {
                        logger.info(`Successfully fetched ${data.length} certificates after renewal`);

                        // Store certificates in global cache
                        window.cachedCertificates = data;

                        // Also update the certificate cache for individual lookup
                        if (window.certificateCache) {
                            // Add each certificate to the cache
                            data.forEach(cert => {
                                if (cert.fingerprint) {
                                    window.certificateCache.set(cert.fingerprint, cert);
                                }
                            });
                        }

                        // Render certificates with current view mode
                        const viewMode = getViewMode();
                        renderCertificatesWithMode(data, viewMode);
                    })
                    .catch(error => {
                        logger.error('Error fetching certificates after renewal notification:', error);
                        window.modalUtils.showNotification(
                            `Error refreshing certificates: ${error.message}. Please refresh manually.`,
                            'warning'
                        );
                    });
            }, 1000);
        });

        // Listen for server status updates
        socket.on('server-status', (data) => {
            logger.info('Server status update:', data);
            const wsStatus = document.querySelector('#ws-status');
            if (wsStatus && data.status === 'online') {
                wsStatus.innerHTML = `<i class="fas fa-plug" style="color: #28a745;"></i> WebSocket: <span class="status-text">Connected (${data.clients} client${data.clients !== 1 ? 's' : ''})</span>`;
            }
        });

        return socket;
    } catch (err) {
        logger.error('Error initializing WebSocket:', err);
        return null;
    }
}

/**
 * Update the scheduler status indicator in the footer
 * Fetches the current status from the server
 */
function updateSchedulerStatus() {
    const schedulerStatus = document.querySelector('#scheduler-status');
    if (!schedulerStatus) return;
    
    const statusIcon = schedulerStatus.querySelector('i');
    const statusText = schedulerStatus.querySelector('.status-text');
    
    if (!statusIcon || !statusText) return;
    
    // Show checking state
    statusIcon.className = 'fas fa-circle-notch fa-spin';
    statusIcon.style.color = '#0078d7'; // Blue while checking
    statusText.textContent = 'Scheduler: Checking...';
    
    // Add a timeout to ensure we don't get stuck in checking state
    const checkingTimeout = setTimeout(() => {
        if (statusIcon.classList.contains('fa-spin')) {
            statusIcon.className = 'fas fa-stopwatch';
            statusIcon.style.color = '#999'; // Gray for unknown status
            statusText.textContent = 'Scheduler: Unknown';
        }
    }, 5000); // 5 second timeout
    
    fetch('/api/scheduler/status')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to get scheduler status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Clear timeout since we got a response
            clearTimeout(checkingTimeout);
            
            // Update status based on response
            statusIcon.classList.remove('fa-spin');
            
            if (data.enabled) {
                statusIcon.className = 'fas fa-stopwatch';
                statusIcon.style.color = '#28a745'; // Green for active
                
                let statusMessage = 'Scheduler: Active';
                
                // Show next execution time if available
                if (data.nextExecution && data.nextExecution.message) {
                    const nextTime = data.nextExecution.message.split('Next execution: ')[1] || '';
                    if (nextTime) {
                        statusMessage += ` (${nextTime})`;
                    }
                }
                statusText.textContent = statusMessage;
            } else {
                statusIcon.className = 'fas fa-stopwatch';
                statusIcon.style.color = '#dc3545'; // Red for inactive
                statusText.textContent = 'Scheduler: Inactive';
            }
            
            // Store last known status
            window.lastSchedulerStatus = {
                enabled: data.enabled,
                nextExecution: data.nextExecution,
                lastRun: data.lastRun
            };
        })
        .catch(error => {
            // Clear timeout since we got a response (albeit an error)
            clearTimeout(checkingTimeout);
            
            logger.error('Error fetching scheduler status:', error);
            statusIcon.className = 'fas fa-exclamation-circle';
            statusIcon.style.color = '#dc3545'; // Red for error
            statusText.textContent = 'Scheduler: Error';
            
            // Try to use last known status if available
            if (window.lastSchedulerStatus) {
                setTimeout(() => {
                    if (window.lastSchedulerStatus.enabled) {
                        statusIcon.className = 'fas fa-stopwatch';
                        statusIcon.style.color = '#28a745'; // Green for active
                        statusText.textContent = 'Scheduler: Active (cached)';
                    } else {
                        statusIcon.className = 'fas fa-stopwatch';
                        statusIcon.style.color = '#dc3545'; // Red for inactive
                        statusText.textContent = 'Scheduler: Inactive (cached)';
                    }
                }, 3000); // Show error for 3 seconds before reverting to cached status
            }
        });
}

/**
 * Initialize Socket.IO connection for real-time updates
 */
function initSocketIO() {
    // Check if Socket.IO client is available
    if (typeof io === 'undefined') {
        logger.warn('Socket.IO client not available');
        return;
    }
    
    try {
        // Connect to the server
        const socket = io();
        
        // Connection events
        socket.on('connect', () => {
            logger.info('Socket.IO connected');
            window.socketConnected = true;
            
            // Update scheduler status when connected
            updateSchedulerStatus();
        });
        
        socket.on('disconnect', () => {
            logger.info('Socket.IO disconnected');
            window.socketConnected = false;
            
            // Show disconnected state in status
            const statusDot = document.querySelector('#scheduler-status .status-dot');
            const statusText = document.querySelector('#scheduler-status .status-text');
            
            if (statusDot && statusText) {
                statusDot.className = 'status-dot inactive';
                statusText.textContent = 'Scheduler: Disconnected';
            }
        });
        
        socket.on('connect_error', (err) => {
            logger.error('Socket.IO connection error:', err);
        });
        
        // Listen for scheduler status changed events
        socket.on('scheduler-status-changed', (data) => {
            logger.info('Scheduler status changed:', data);
            // Instead of just calling updateSchedulerStatus(), update UI directly
            // to avoid unnecessary API call
            const statusDot = document.querySelector('#scheduler-status .status-dot');
            const statusText = document.querySelector('#scheduler-status .status-text');
            
            if (statusDot && statusText) {
                if (data.enabled) {
                    statusDot.className = 'status-dot active';
                    statusText.textContent = 'Scheduler: Active';
                } else {
                    statusDot.className = 'status-dot inactive';
                    statusText.textContent = 'Scheduler: Inactive';
                }
                
                // Update cached status
                if (!window.lastSchedulerStatus) {
                    window.lastSchedulerStatus = {};
                }
                window.lastSchedulerStatus.enabled = data.enabled;
            }
        });
        
        // Listen for certificate events
        socket.on('certificate-renewed', (data) => {
            logger.info('Certificate renewed:', data);
            // Show notification
            showNotification(`Certificate renewed: ${data.name || 'Unnamed certificate'}`, 'success');
            // Refresh certificates list
            fetchCertificates(true);
        });
        
        // Listen for CA passphrase requests
        socket.on('ca-passphrase-required', (data) => {
            logger.info('CA passphrase required:', data);
            
            // Show the passphrase modal
            window.modalUtils.showCAPassphraseModal(data);
        });
        
        // Store socket reference globally
        window.socket = socket;
    } catch (error) {
        logger.error('Error initializing Socket.IO:', error);
    }
}

/**
 * Initialize application
 */
function initApp() {
    logger.debug('Certificate manager initializing');

    // Initialize WebSocket if available
    if (typeof io !== 'undefined') {
        window.socket = initializeWebSocket();
    } else {
        logger.info('Socket.io not loaded - real-time updates disabled');
    }

    // Set up Socket.IO first
    initSocketIO();

    // Initialize page components first
    initializeUI();
    initializeDomainValidation();
    attachButtonEventHandlers();
    setupHeaderButtons();
    checkDockerStatus();

    // Initialize certificate expiry checker
    checkCertificateExpirations();

    // Add view controls BEFORE fetching certificates
    addViewModeControls();
    initViewModeToggle();

    // Add global event listeners
    addGlobalEventListeners();

    // Register global functions for backward compatibility
    registerGlobalFunctions();

    // Initialize sorting functionality
    initializeSorting();
    
    // Add scheduler status check
    updateSchedulerStatus();
  
    // Update scheduler status every 5 minutes
    setInterval(updateSchedulerStatus, 5 * 60 * 1000);
    
    // Add event listener for socket.io scheduler events if applicable
    if (socket) {
        socket.on('scheduler-status-changed', function(data) {
        updateSchedulerStatus();
        });
    }

    // Initialize button handlers
    document.getElementById('refresh-btn').addEventListener('click', () => {
        fetchCertificates(true);
    });

    // Finally, fetch certificates ONCE after everything is set up
    setTimeout(() => {
        fetchCertificates();
    }, 100);
}

document.addEventListener('DOMContentLoaded', initApp);

// Add at the end of your initialization code
window.addEventListener('unhandledrejection', event => {
    logger.warn('Unhandled promise rejection:', event.reason);
    // Prevent the error from showing in console
    event.preventDefault();
});