const fs = require('fs');
const path = require('path');
const express = require('express');
const { parseCertificates } = require('./cert-parser');
const { renderTable } = require('./views/table-view');

const app = express();
const PORT = process.env.PORT || 3000;
const CERTS_DIR = process.env.CERTS_DIR || '/certs';

// Add static files serving
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    console.log(`Reading certificates from ${CERTS_DIR}`);
    const certData = parseCertificates(CERTS_DIR);
    console.log(`Found ${certData.certificates.length} certificates`);
    const tableHtml = renderTable(certData);
    res.send(tableHtml);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Certificate viewer server is running on http://0.0.0.0:${PORT}`);
    console.log(`Looking for certificates in: ${CERTS_DIR}`);
});