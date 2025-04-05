/**
 * CSS styles for the certificate viewer
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
    
    header {
        margin-bottom: 2rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    
    h1 {
        font-weight: 600;
        color: var(--text-color);
        font-size: 1.8rem;
    }
    
    .search-container {
        display: flex;
        gap: 1rem;
        margin-bottom: 1rem;
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
    
    .view-toggle {
        display: flex;
        margin-bottom: 1rem;
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
        content: '↓';
    }
    
    th[data-sort="-1"]::after {
        content: '↑';
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
    
    .hierarchy-indent {
        padding-left: 2rem;
        position: relative;
    }
    
    .hierarchy-indent::before {
        content: '';
        position: absolute;
        left: 0.75rem;
        top: 0;
        height: 100%;
        width: 1px;
        background-color: var(--border-color);
    }
    
    .hierarchy-indent::after {
        content: '';
        position: absolute;
        left: 0.75rem;
        top: 50%;
        height: 1px;
        width: 0.75rem;
        background-color: var(--border-color);
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
  `;
}

module.exports = getStyles;