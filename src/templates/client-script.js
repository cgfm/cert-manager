/**
 * Client-side JavaScript for the certificate viewer
 */
function getClientScript() {
  return `
    // Sorting functionality
    let sortDirection = 1; // 1 for ascending, -1 for descending
    
    function sortTable(viewType, columnIndex) {
        const tableId = viewType === 'flat' ? 'cert-table-flat' : 'cert-table-hierarchy';
        const table = document.getElementById(tableId);
        
        if (!table) return;
        
        const rows = Array.from(table.querySelectorAll('tbody tr.cert-row'));
        const header = table.querySelector('th:nth-child(' + (columnIndex + 1) + ')');
        
        // Toggle sort direction
        if (header.getAttribute('data-sort') === '1') {
            sortDirection = -1;
            header.setAttribute('data-sort', '-1');
        } else {
            sortDirection = 1;
            header.setAttribute('data-sort', '1');
        }
        
        // Reset other headers
        table.querySelectorAll('th').forEach(th => {
            if (th !== header) {
                th.removeAttribute('data-sort');
            }
        });
        
        if (viewType === 'flat') {
            // Sort flat view
            rows.sort((a, b) => {
                let aValue, bValue;
                
                if (columnIndex === 2) {
                    // Sort by date
                    aValue = new Date(a.cells[columnIndex].getAttribute('data-date') || 0);
                    bValue = new Date(b.cells[columnIndex].getAttribute('data-date') || 0);
                } else if (columnIndex === 0) {
                    // Sort by certificate name (ignoring status indicator and cert type)
                    aValue = a.cells[columnIndex].innerText.replace(/Root CA|Intermediate CA/g, '').trim();
                    bValue = b.cells[columnIndex].innerText.replace(/Root CA|Intermediate CA/g, '').trim();
                } else {
                    // Sort by text
                    aValue = a.cells[columnIndex].innerText.trim();
                    bValue = b.cells[columnIndex].innerText.trim();
                }
                
                // Handle potential undefined/null values
                if (!aValue) return 1 * sortDirection;
                if (!bValue) return -1 * sortDirection;
                
                if (aValue < bValue) return -1 * sortDirection;
                if (aValue > bValue) return 1 * sortDirection;
                return 0;
            });
            
            // Re-add rows in the new order
            const tbody = table.querySelector('tbody');
            rows.forEach(row => tbody.appendChild(row));
        } else {
            // Hierarchical view doesn't support full sorting to preserve hierarchy
            alert('Sorting in hierarchical view is not supported. Please switch to flat view for full sorting capabilities.');
        }
    }
    
    // Search functionality
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', filterTables);
    
    function filterTables() {
        const filter = searchInput.value.toLowerCase();
        const tables = [
            document.getElementById('cert-table-flat'),
            document.getElementById('cert-table-hierarchy')
        ];
        
        let visibleCount = 0;
        
        tables.forEach(table => {
            if (!table) return;
            
            const rows = table.querySelectorAll('tbody tr');
            
            rows.forEach(row => {
                let shouldShow = false;
                
                // Don't filter group rows in hierarchy view
                if (row.classList.contains('group-row')) {
                    row.style.display = '';
                    return;
                }
                
                const cells = row.querySelectorAll('td');
                for (let i = 0; i < cells.length; i++) {
                    const cellText = cells[i].textContent.toLowerCase();
                    if (cellText.includes(filter)) {
                        shouldShow = true;
                        break;
                    }
                }
                
                // Only count visible rows in the active view
                if (shouldShow && 
                    ((table.id === 'cert-table-flat' && !table.closest('.card').classList.contains('hierarchy-container')) ||
                     (table.id === 'cert-table-hierarchy' && !table.closest('.card').classList.contains('flat-container')))) {
                    visibleCount++;
                }
                
                row.style.display = shouldShow ? '' : 'none';
            });
        });
        
        document.getElementById('certCount').textContent = visibleCount;
    }
    
    // View toggle functionality
    const flatViewBtn = document.getElementById('flatViewBtn');
    const hierarchyViewBtn = document.getElementById('hierarchyViewBtn');
    const flatView = document.getElementById('flatView');
    const hierarchyView = document.getElementById('hierarchyView');
    
    flatViewBtn.addEventListener('click', () => {
        flatView.classList.remove('flat-container');
        flatView.style.display = 'block';
        hierarchyView.style.display = 'none';
        flatViewBtn.classList.add('active');
        hierarchyViewBtn.classList.remove('active');
        filterTables(); // Recount certificates
    });
    
    hierarchyViewBtn.addEventListener('click', () => {
        flatView.style.display = 'none';
        hierarchyView.style.display = 'block';
        flatViewBtn.classList.remove('active');
        hierarchyViewBtn.classList.add('active');
        filterTables(); // Recount certificates
    });
    
    // Initially sort by expiry date in flat view
    document.addEventListener('DOMContentLoaded', () => {
        const expiryHeader = document.querySelector('#cert-table-flat th:nth-child(3)');
        if (expiryHeader) {
            expiryHeader.click();
        }
    });
  `;
}

module.exports = getClientScript;