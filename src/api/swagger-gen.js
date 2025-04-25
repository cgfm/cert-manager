/**
 * This script generates an OpenAPI specification file in YAML format
 * for the Certificate Manager API using swagger-jsdoc.
 * It scans the specified directories for JSDoc comments
 * and generates the OpenAPI documentation based on those comments.
 * @module api/swagger-gen
 * @requires swagger-jsdoc
 * @requires js-yaml
 * @requires fs
 * @requires path
 * @version 0.0.2
 * @license MIT
 * @author Christian Meiners
 * @description This script is used to generate OpenAPI documentation for the Certificate Manager API.
 * It uses swagger-jsdoc to parse JSDoc comments in the codebase and generate the OpenAPI spec.
 */

const fs = require('fs');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const yaml = require('js-yaml');

/**
 * Generate a basic OpenAPI spec file if it doesn't exist
 */
function generateOpenApiSpec() {
  const apiSpecPath = path.join(__dirname, 'openapi.yaml');
  
  // Check if the file already exists
  if (fs.existsSync(apiSpecPath)) {
    console.log('OpenAPI spec file already exists');
    return;
  }
  
  // Basic OpenAPI spec
  const spec = {
    openapi: '3.0.0',
    info: {
      title: 'Certificate Manager API',
      description: 'API for managing SSL/TLS certificates',
      version: '1.0.0'
    },
    servers: [
      {
        url: '/api',
        description: 'Main API endpoint'
      }
    ],
    tags: [
      {
        name: 'certificates',
        description: 'Certificate operations'
      },
      {
        name: 'ca',
        description: 'CA certificate operations'
      },
      {
        name: 'security',
        description: 'Security operations'
      },
      {
        name: 'renewal',
        description: 'Renewal service operations'
      },
      {
        name: 'settings',
        description: 'Settings operations'
      },
      {
        name: 'filesystem',
        description: 'Filesystem operations'
      }
    ],
    paths: {
      '/certificates': {
        get: {
          summary: 'Get all certificates',
          operationId: 'getAllCertificates',
          tags: ['certificates'],
          responses: {
            '200': {
              description: 'A list of certificates',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: {
                      $ref: '#/components/schemas/Certificate'
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    components: {
      schemas: {
        Certificate: {
          type: 'object',
          properties: {
            id: {
              type: 'string'
            },
            name: {
              type: 'string'
            },
            commonName: {
              type: 'string'
            },
            status: {
              type: 'string',
              enum: ['valid', 'expired', 'revoked']
            }
          }
        }
      }
    }
  };
  
  // Write to file
  fs.writeFileSync(apiSpecPath, yaml.dump(spec));
  console.log(`Generated OpenAPI spec at: ${apiSpecPath}`);
}

// Options for swagger-jsdoc
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Certificate Manager API',
      version: '1.0.0',
      description: 'API for managing SSL/TLS certificates',
    },
    servers: [
      {
        url: '/api',
        description: 'Main API endpoint',
      },
    ],
  },
  // Look for JSDoc comments in these files
  apis: [
    path.join(__dirname, 'routes', '*.js'),
    path.join(__dirname, '../models', '*.js'),
  ],
};

// Generate OpenAPI spec
const openapiSpecification = swaggerJsdoc(options);

// Write as YAML
const yamlStr = yaml.dump(openapiSpecification);
fs.writeFileSync(path.join(__dirname, 'openapi.yaml'), yamlStr, 'utf8');

console.log('OpenAPI specification generated at src/api/openapi.yaml');

// Run the function when script is executed directly
if (require.main === module) {
  generateOpenApiSpec();
}

module.exports = { generateOpenApiSpec };