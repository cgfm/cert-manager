/**
 * CSS styles for the certificate manager
 */
function getStyles() {
  return `
    :root {
        --primary-color: #3a86ff;
        --secondary-color: #8338ec;
        --background-color: #f8f9fa;
        --card-color: #ffffff;
        --text-color: #212529;
        --text-muted: #6c757d;
        --border-color: #e9ecef;
        --hover-color: #f1f3f5;
        --danger-color: #dc3545;
        --warning-color: #ffc107;
        --success-color: #28a745;
        --ca-color: #9d4edd;
        --intermediate-ca-color: #7b2cbf;
    }
    
    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }
    
    body {
        font-family: 'Inter', system-ui, -apple-system, sans-serif;
        background-color: var(--background-color);
        color: var(--text-color);
        line-height: 1.5;
        padding: 2rem;
    }
    
    .container {
        max-width: 1200px;
        margin: 0 auto;
    }
    
    /* Header Layout */
    header {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 15px;
        margin-bottom: 20px;
        padding-bottom: 15px;
        border-bottom: 1px solid #eee;
    }
    
    header h1 {
        margin-right: auto;
        margin-bottom: 0;
    }
    
    .header-buttons {
        display: flex;
        gap: 10px;
    }
    
    h1 {
        font-weight: 600;
        color: var(--text-color);
        font-size: 1.8rem;
    }
    
    input[type="text"] {
        flex: 1;
        padding: 0.75rem 1rem;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        font-size: 0.9rem;
        outline: none;
        transition: border-color 0.2s;
    }
    
    input[type="text"]:focus {
        border-color: var(--primary-color);
        box-shadow: 0 0 0 3px rgba(58, 134, 255, 0.1);
    }
    
    .view-toggle button {
        padding: 0.5rem 1rem;
        background: none;
        border: 1px solid var(--border-color);
        cursor: pointer;
        font-size: 0.9rem;
        transition: all 0.2s;
    }
    
    .view-toggle button:first-child {
        border-radius: 8px 0 0 8px;
    }
    
    .view-toggle button:last-child {
        border-radius: 0 8px 8px 0;
    }
    
    .view-toggle button.active {
        background-color: var(--primary-color);
        color: white;
        border-color: var(--primary-color);
    }
    
    .card {
        background-color: var(--card-color);
        border-radius: 12px;
        box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
        overflow: hidden;
        margin-bottom: 2rem;
    }
    
    table {
        width: 100%;
        border-collapse: collapse;
    }
    
    th, td {
        padding: 1rem;
        text-align: left;
        border-bottom: 1px solid var(--border-color);
    }
    
    th {
        font-weight: 600;
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
        color: var(--text-muted);
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        transition: background-color 0.2s;
    }
    
    th:hover {
        background-color: var(--hover-color);
    }
    
    th::after {
        content: '';
        display: inline-block;
        width: 0;
        margin-left: 0.5rem;
    }
    
    th[data-sort="1"]::after {
        content: '\\f063';
        font-family: 'Font Awesome 6 Free';
        font-weight: 900;
        font-size: 0.8rem;
    }
    
    th[data-sort="-1"]::after {
        content: '\\f062';
        font-family: 'Font Awesome 6 Free';
        font-weight: 900;
        font-size: 0.8rem;
    }
    
    tbody tr {
        transition: background-color 0.2s;
    }
    
    tbody tr:hover {
        background-color: var(--hover-color);
    }
    
    td {
        vertical-align: top;
        font-size: 0.95rem;
    }
    
    .hierarchy-view .ca-row {
        background-color: rgba(157, 78, 221, 0.05);
    }
    
    .hierarchy-view .intermediate-row {
        background-color: rgba(123, 44, 191, 0.03);
    }
    
    .hierarchy-view .group-row {
        background-color: rgba(0, 0, 0, 0.03);
        font-weight: 600;
    }
    
    .cert-name {
        font-weight: 500;
        width: 30%;
    }
    
    .cert-domains {
        width: 45%;
    }
    
    .cert-expiry {
        width: 25%;
        white-space: nowrap;
    }
    
    .expiry-warning {
        color: var(--danger-color);
        font-weight: 500;
    }
    
    .expiry-caution {
        color: var(--warning-color);
        font-weight: 500;
    }
    
    .domain-tag {
        display: inline-block;
        background: #f1f3f5;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        margin: 0.15rem;
        font-size: 0.85rem;
    }
    
    .no-results {
        text-align: center;
        padding: 3rem;
        color: var(--text-muted);
    }
    
    .status-indicator {
        display: inline-block;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        margin-right: 0.5rem;
    }
    
    .status-valid {
        background-color: var(--success-color);
    }
    
    .status-warning {
        background-color: var(--warning-color);
    }
    
    .status-expired {
        background-color: var(--danger-color);
    }
    
    .status-ca {
        background-color: var(--ca-color);
    }
    
    .status-intermediate-ca {
        background-color: var(--intermediate-ca-color);
    }
    
    .cert-count {
        color: var(--text-muted);
        font-size: 0.9rem;
        margin-bottom: 1rem;
    }
    
    .cert-type {
        font-size: 0.75rem;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        background-color: #e9ecef;
        color: var(--text-muted);
        margin-left: 0.5rem;
        text-transform: uppercase;
        vertical-align: middle;
    }
    
    .cert-type-root {
        background-color: rgba(157, 78, 221, 0.2);
        color: #7b2cbf;
    }
    
    .cert-type-intermediate {
        background-color: rgba(123, 44, 191, 0.2);
        color: #6023b6;
    }
    
    /* Hierarchical view indentation - improved version */
    .hierarchy-level-1 {
        padding-left: 2rem;
        position: relative;
    }

    .hierarchy-level-1::before {
        content: '';
        position: absolute;
        left: 0.75rem;
        top: 50%;
        height: 1px;
        width: 1rem;
        background-color: var(--border-color);
    }

    .hierarchy-level-1::after {
        content: '';
        position: absolute;
        left: 0.75rem;
        top: 0;
        height: 50%;
        width: 1px;
        background-color: var(--border-color);
    }

    .hierarchy-level-2 {
        padding-left: 4rem;
        position: relative;
    }

    .hierarchy-level-2::before {
        content: '';
        position: absolute;
        left: 2.75rem;
        top: 50%;
        height: 1px;
        width: 1rem;
        background-color: var(--border-color);
    }

    .hierarchy-level-2::after {
        content: '';
        position: absolute;
        left: 2.75rem;
        top: 0;
        height: 50%;
        width: 1px;
        background-color: var(--border-color);
    }

    .hierarchy-level-3 {
        padding-left: 6rem;
        position: relative;
    }

    .hierarchy-level-3::before {
        content: '';
        position: absolute;
        left: 4.75rem;
        top: 50%;
        height: 1px;
        width: 1rem;
        background-color: var(--border-color);
    }

    .hierarchy-level-3::after {
        content: '';
        position: absolute;
        left: 4.75rem;
        top: 0;
        height: 50%;
        width: 1px;
        background-color: var(--border-color);
    }

    .hierarchy-indent {
        /* This class is no longer used */
    }
    
    .hierarchy-container {
        display: none;
    }
    
    .flat-container {
        display: block;
    }
    
    .view-toggle button:focus {
        outline: none;
        box-shadow: 0 0 0 3px rgba(58, 134, 255, 0.2);
    }
    
    @media (max-width: 768px) {
        body {
            padding: 1rem;
        }
        
        .cert-domains {
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        th, td {
            padding: 0.75rem;
        }
        
        .hierarchy-indent {
            padding-left: 1rem;
        }
    }
    
    /* Certificate Action Buttons */
    .cert-actions {
        padding: 5px;
        text-align: center;
        white-space: nowrap;
    }
    
    .cert-actions button {
        margin: 2px;
        padding: 5px 10px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
    }
    
    .config-btn {
        background-color: #4a6da7;
        color: white;
    }
    
    .config-btn i, .renew-btn i {
        margin-right: 5px;
    }
    
    .renew-btn {
        background-color: #2ecc71;
        color: white;
    }
    
    /* Modal Styles */
    .modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
    }
    
    .modal-content {
        background-color: #fff;
        padding: 20px;
        border-radius: 8px;
        width: 550px;
        max-width: 90%;
        max-height: 90vh;
        overflow-y: auto;
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
    }
    
    .close {
        color: #aaa;
        float: right;
        font-size: 28px;
        font-weight: bold;
        cursor: pointer;
        transition: color 0.2s;
    }
    
    .close:hover {
        color: #333;
    }
    
    /* Form Styles */
    .config-form {
        margin-top: 20px;
    }
    
    .form-group {
        margin-bottom: 15px;
    }
    
    .form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
    }
    
    .form-group input[type="number"] {
        width: 70px;
        padding: 8px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
    }
    
    .button-group {
        margin-top: 20px;
        text-align: right;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
    
    .button-group button {
        padding: 8px 15px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
    }
    
    #saveConfig {
        background-color: var(--success-color);
        color: white;
    }
    
    #cancelConfig {
        background-color: var(--danger-color);
        color: white;
    }
    
    /* Deployment Actions Styles */
    .action-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        padding: 10px 15px;
        background-color: #f9f9f9;
        border-radius: 6px;
        border-left: 3px solid var(--primary-color);
    }
    
    .action-params {
        flex-grow: 1;
        margin: 0 10px;
    }
    
    .action-params input {
        width: 100%;
        padding: 8px;
    }
    
    .remove-action-btn {
        background-color: var(--danger-color);
        color: white;
        border: none;
        border-radius: 4px;
        padding: 5px 10px;
        cursor: pointer;
        font-size: 12px;
    }
    
    #addActionBtn {
        margin-top: 10px;
        background-color: var(--primary-color);
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 12px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-weight: 500;
        margin-bottom: 15px;
    }
    
    /* Create Certificate Button */
    #createCertBtn {
        background-color: #27ae60;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 15px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    
    #createCertBtn:hover {
        background-color: #2ecc71;
    }
    
    /* Global Settings Button */
    #globalSettingsBtn {
        background-color: var(--primary-color);
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 15px;
        cursor: pointer;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    
    #globalSettingsBtn:hover {
        background-color: #2980b9;
    }
    
    /* Form Help Text */
    .help-text {
        font-size: 12px;
        color: var(--text-muted);
        margin-top: 4px;
    }
    
    /* Form Controls */
    .form-group input[type="text"],
    .form-group input[type="email"],
    .form-group select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        box-sizing: border-box;
        font-family: inherit;
        font-size: 14px;
    }
    
    .form-group select {
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 10px center;
        padding-right: 30px;
    }
    
    /* Loading state for buttons */
    button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    
    /* Domain Management Styles */
    .domain-management {
        margin: 20px 0;
        padding: 15px;
        background-color: #f8f9fa;
        border-radius: 8px;
        border: 1px solid var(--border-color);
    }
    
    .domain-management h3 {
        margin-top: 0;
        margin-bottom: 15px;
        font-size: 1.1rem;
        display: flex;
        align-items: center;
        gap: 7px;
    }
    
    .domains-list {
        max-height: 200px;
        overflow-y: auto;
        margin-bottom: 15px;
        border: 1px solid var(--border-color);
        border-radius: 6px;
    }
    
    .domain-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        border-bottom: 1px solid var(--border-color);
    }
    
    .domain-item:last-child {
        border-bottom: none;
    }
    
    .domain-name {
        font-family: monospace;
        background-color: #f1f1f1;
        padding: 4px 8px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    
    .domain-name i {
        color: var(--text-muted);
    }
    
    .stage-remove-domain-btn {
        background-color: var(--danger-color);
        color: white;
        border: none;
        border-radius: 4px;
        padding: 5px 10px;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
    }
    
    .add-domain-form {
        display: flex;
        margin-top: 15px;
    }
    
    .add-domain-form input {
        flex-grow: 1;
        padding: 8px 12px;
        border: 1px solid var(--border-color);
        border-radius: 4px 0 0 4px;
        font-family: inherit;
    }
    
    #stageDomainBtn {
        background-color: var(--primary-color);
        color: white;
        border: none;
        border-radius: 0 4px 4px 0;
        padding: 8px 15px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 5px;
        white-space: nowrap;
    }
    
    /* File browser styles */
    .file-browser-modal .modal-content {
        max-width: 600px;
    }
    
    .file-browser {
        border: 1px solid var(--border-color);
        border-radius: 4px;
        margin: 15px 0;
    }
    
    .current-path {
        background-color: var(--hover-color);
        padding: 10px 15px;
        border-bottom: 1px solid var(--border-color);
        font-family: monospace;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    .file-list {
        padding: 10px;
        max-height: 350px;
        overflow-y: auto;
    }
    
    .file-item {
        padding: 8px 10px;
        margin-bottom: 5px;
        cursor: pointer;
        border-radius: 4px;
        display: flex;
        align-items: center;
        gap: 10px;
        transition: background-color 0.2s;
    }
    
    .file-item:hover {
        background-color: var(--hover-color);
    }
    
    .file-icon {
        color: var(--text-muted);
        width: 20px;
        text-align: center;
    }
    
    .directory .file-icon {
        color: var(--primary-color);
    }
    
    .error-message {
        color: var(--danger-color);
        padding: 10px;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    
    /* Browse button */
    .browse-btn {
        background-color: var(--primary-color);
        color: white;
        border: none;
        border-radius: 4px;
        padding: 8px 12px;
        cursor: pointer;
        margin-left: 8px;
        display: flex;
        align-items: center;
        gap: 5px;
    }
    
    /* Pending changes styling */
    .stage-remove-domain-btn.pending-removal {
        background-color: var(--text-muted);
    }
    
    .pending-removal-item {
        background-color: #ffecec;
    }
    
    #pendingChanges {
        background-color: #fff3cd;
        border: 1px solid #ffeeba;
        padding: 15px;
        margin: 15px 0;
        border-radius: 6px;
    }
    
    #pendingChanges h4 {
        margin-top: 0;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        gap: 7px;
        color: #856404;
    }
    
    .pending-additions, .pending-removals {
        margin-bottom: 15px;
    }
    
    .pending-additions strong, .pending-removals strong {
        display: flex;
        align-items: center;
        gap: 7px;
        margin-bottom: 5px;
    }
    
    #pendingList ul {
        list-style-type: none;
        padding-left: 10px;
        margin: 8px 0;
    }
    
    #pendingList li {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 8px;
        background-color: rgba(255, 255, 255, 0.7);
        border-radius: 4px;
        margin-bottom: 5px;
    }
    
    .undo-btn {
        background-color: var(--text-muted);
        color: white;
        border: none;
        padding: 2px 8px;
        border-radius: 3px;
        font-size: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 3px;
    }
    
    .pending-actions {
        margin-top: 15px;
        text-align: right;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
    }
    
    .apply-changes-btn {
        background-color: var(--success-color);
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    
    .discard-changes-btn {
        background-color: var(--danger-color);
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    
    /* Icons for table actions */
    .fa-icon-margin {
        margin-right: 5px;
    }
    
    /* Custom icon colors */
    .text-danger {
        color: var(--danger-color);
    }
    
    .text-warning {
        color: var(--warning-color);
    }
    
    .text-success {
        color: var(--success-color);
    }
    
    .text-primary {
        color: var(--primary-color);
    }
    
    /* Better modal headers */
    .modal-content h2, .modal-content h3 {
        margin-bottom: 15px;
    }
    
    /* Action buttons common styles */
    button i {
        font-size: 0.9em;
    }

    /* HTTPS Configuration Styles */
    .admin-menu {
        margin-left: auto;
        display: flex;
        align-items: center;
    }

    .admin-button {
        padding: 8px 12px;
        border: none;
        background-color: var(--primary-color, #3a86ff);
        color: white;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: 10px;
    }

    .admin-button:hover {
        background-color: var(--primary-hover-color, #2667da);
    }

    .form-section {
        border: 1px solid #eee;
        border-radius: 4px;
        padding: 15px;
        margin-bottom: 20px;
    }

    .form-section h3 {
        margin-top: 0;
        margin-bottom: 15px;
        font-size: 18px;
        color: var(--text-color, #444);
    }

    .form-subsection {
        margin-top: 15px;
        padding-left: 15px;
        border-left: 3px solid #eee;
    }

    .form-group {
        margin-bottom: 15px;
    }

    .form-group label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
    }

    .form-help {
        font-size: 12px;
        color: #666;
        margin-top: 4px;
    }

    .browse-btn {
        padding: 5px 10px;
        margin-left: 5px;
        border: 1px solid #ccc;
        background-color: #f8f8f8;
        border-radius: 4px;
        cursor: pointer;
    }

    .browse-btn:hover {
        background-color: #eee;
    }

    .warning-box {
        background-color: #fff3cd;
        border-left: 4px solid #ffc107;
        padding: 12px;
        margin-top: 20px;
        display: flex;
        align-items: flex-start;
        gap: 10px;
    }

    .warning-box i {
        color: #ffc107;
        margin-top: 3px;
    }

    /* File browser */
    .path-navigation {
        display: flex;
        margin-bottom: 15px;
        gap: 10px;
    }

    .path-navigation input {
        flex-grow: 1;
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
    }

    .file-browser {
        border: 1px solid #ddd;
        border-radius: 4px;
        height: 300px;
        overflow-y: auto;
        margin-bottom: 15px;
    }

    .file-list {
        list-style-type: none;
        padding: 0;
        margin: 0;
    }

    .file-list li {
        padding: 8px 12px;
        border-bottom: 1px solid #eee;
        cursor: pointer;
    }

    .file-list li:hover {
        background-color: #f5f5f5;
    }

    .file-list li.selected {
        background-color: #e3f2fd;
    }

    .file-list li i {
        margin-right: 8px;
    }

    .file-list li.directory i {
        color: #ffc107;
    }

    .file-list li.file i {
        color: #546e7a;
    }

    /* Tab navigation for settings modal */
    .tabs {
        display: flex;
        border-bottom: 1px solid var(--border-color);
        margin-bottom: 20px;
        overflow-x: auto;
    }

    .tab-btn {
        padding: 10px 16px;
        background: transparent;
        border: none;
        border-bottom: 3px solid transparent;
        color: var(--text-muted);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
    }

    .tab-btn:hover {
        background-color: var(--hover-color);
        color: var(--text-color);
    }

    .tab-btn.active {
        color: var(--primary-color);
        border-bottom-color: var(--primary-color);
        background-color: transparent;
    }

    .tab-content {
        display: none;
    }

    .tab-content.active {
        display: block;
        animation: fadeIn 0.3s;
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    .info-box {
        border-radius: 4px;
        padding: 10px 15px;
        margin: 15px 0;
    }
    
    .info-box p {
        margin: 0;
    }
  `;
}

module.exports = getStyles;