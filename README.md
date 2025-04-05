# Certificate Viewer

## Overview
The Certificate Viewer is a Node.js application that lists all SSL certificates in the `/certs` directory. It displays the certificate name, the domains and IPs the certificate is valid for, and the expiry date. The application also provides sorting functionality for each column in the displayed table.

## Features
- Lists all certificates in the specified directory.
- Displays certificate name, valid domains and IPs, and expiry date.
- Sorts the displayed data by certificate name, domains, IPs, and expiry date.

## Project Structure
```
cert-viewer
├── src
│   ├── index.js          # Entry point of the application
│   ├── cert-parser.js    # Parses certificate files and extracts data
│   ├── utils
│   │   └── date-formatter.js # Formats date for display
│   └── views
│       └── table-view.js # Renders the certificate data in a table
├── Dockerfile             # Dockerfile for building the application image
├── docker-compose.yml     # Docker Compose configuration
├── package.json           # npm configuration and dependencies
├── .dockerignore          # Files to ignore when building the Docker image
├── .gitignore             # Files to ignore in Git
└── README.md              # Project documentation
```

## Setup Instructions
1. Clone the repository:
   ```
   git clone <repository-url>
   cd cert-viewer
   ```

2. Ensure you have Docker and Docker Compose installed on your machine.

3. Place your SSL certificate files in the `/certs` directory.

4. Build the Docker image:
   ```
   docker-compose build
   ```

5. Run the application:
   ```
   docker-compose up
   ```

## Usage
Once the application is running, navigate to `http://localhost:3000` in your web browser to view the list of certificates. You can sort the table by clicking on the column headers.

## Contributing
Contributions are welcome! Please submit a pull request or open an issue for any suggestions or improvements.

## License
This project is licensed under the MIT License.