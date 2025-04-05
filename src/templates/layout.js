/**
 * Base layout template for the certificate viewer
 */
function layout(title, styles, content) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap">
    <style>
        ${styles}
    </style>
</head>
<body>
    ${content}
    <script src="/js/cert-config.js"></script>
</body>
</html>
  `;
}

module.exports = layout;