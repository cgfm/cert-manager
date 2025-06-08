/**
 * @fileoverview OpenAPI Specification Generator - Automated API documentation generation
 * 
 * This script generates comprehensive OpenAPI specification files in YAML format
 * for the Certificate Manager API using swagger-jsdoc. It provides:
 * - Automated JSDoc comment parsing from source files
 * - OpenAPI 3.0 specification generation
 * - YAML format output for documentation systems
 * - Route discovery and endpoint documentation
 * - Schema definition extraction from models
 * - API versioning and metadata management
 * 
 * The generator scans specified directories for JSDoc comments and creates
 * a complete OpenAPI specification that can be used with documentation
 * tools like Swagger UI, Redoc, or other API documentation systems.
 * 
 * Features include:
 * - Automatic route discovery and documentation
 * - Model schema extraction and validation
 * - Security scheme documentation
 * - Response format documentation
 * - Example generation from JSDoc comments
 * 
 * @module api/swagger-gen
 * @requires swagger-jsdoc
 * @requires js-yaml
 * @requires fs
 * @requires path
 * @version 0.0.2
 * @license MIT
 * @author Christian Meiners
 * @since 1.0.0
 */

const fs = require('fs');
const path = require('path');
const swaggerJsdoc = require('swagger-jsdoc');
const yaml = require('js-yaml');

const FILENAME = 'api/swagger-gen.js';

/**
 * Generates a basic OpenAPI specification file if it doesn't already exist
 * Creates the foundational YAML structure for API documentation
 * 
 * @returns {void}
 */
function generateOpenApiSpec() {
  const apiSpecPath = path.join(__dirname, 'openapi.yaml');
  
  // Check if the file already exists
  if (fs.existsSync(apiSpecPath)) {
    logger.info('OpenAPI spec file already exists', null, FILENAME);
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
  logger.info(`Generated OpenAPI spec at: ${apiSpecPath}`, null, FILENAME);
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

logger.info('OpenAPI specification generated at src/api/openapi.yaml', null, FILENAME);

// Run the function when script is executed directly
if (require.main === module) {
  generateOpenApiSpec();
}

module.exports = { generateOpenApiSpec };