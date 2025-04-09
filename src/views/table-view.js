/**
 * Renders the main certificate manager page with both flat and hierarchical views
 */
const getStyles = require('../templates/styles');
const layout = require('../templates/layout');
// Fix the import statement below - we need to import the actual function
const { renderCertRow } = require('../templates/cert-row');
const { renderHierarchyRow } = require('../templates/hierarchy-row');
const getClientScript = require('../templates/client-script');

function renderTable({ certificates, hierarchy }) {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    // Generate flat view rows
    const flatRows = certificates.map(cert => renderCertRow(cert, now, thirtyDaysFromNow)).join('');
    
    // Generate hierarchy view rows
    const hierarchyRows = hierarchy.map(item => renderHierarchyRow(item)).join('');

    // Create the content
    const content = `
    <div class="container">
        <header>
            <h1>Local Certificate Manager</h1>
            <div class="search-container">
                <input type="text" id="searchInput" placeholder="Search certificates..." autofocus>
            </div>
            <div class="view-toggle">
                <button id="flatViewBtn" class="active">Flat View</button>
                <button id="hierarchyViewBtn">Hierarchy View</button>
            </div>
            <div class="cert-count">
                Showing <span id="certCount">${certificates.length}</span> certificates
            </div>
            <div class="header-buttons"></div>
        </header>

        <!-- Flat View -->
        <div id="flatView" class="card">
            <table id="cert-table-flat">
                <thead>
                    <tr>
                        <th onclick="sortTable('flat', 0)">Certificate</th>
                        <th onclick="sortTable('flat', 1)">Domains</th>
                        <th onclick="sortTable('flat', 2)" data-sort="1">Expiry Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${flatRows}
                </tbody>
            </table>
        </div>

        <!-- Hierarchy View -->
        <div id="hierarchyView" class="card hierarchy-container">
            <table id="cert-table-hierarchy">
                <thead>
                    <tr>
                        <th>Certificate</th>
                        <th>Domains</th>
                        <th>Expiry Date</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${hierarchyRows}
                </tbody>
            </table>
        </div>
    </div>
    
    <script>
        ${getClientScript()}
    </script>`;

    // Return the complete HTML
    return layout('Certificate Manager', getStyles(), content);
}

module.exports = {
    renderTable
};