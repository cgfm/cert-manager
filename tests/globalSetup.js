/**
 * Jest Global Setup
 * Sets up test configuration - environment is managed externally by test runner scripts
 */

module.exports = async () => {
  console.log('🚀 Setting up test configuration...');

  try {
    // Set global test configuration
    global.__TEST_CONFIG__ = {
      mockNpm: {
        host: 'localhost',
        port: 3001,
        baseUrl: 'http://localhost:3001'
      },
      mockSmtp: {
        host: 'localhost',
        port: 1025,
        webPort: 1080
      },
      mockFtp: {
        host: 'localhost',
        port: 21,
        username: 'testuser',
        password: 'testpass'
      },
      mockSftp: {
        host: 'localhost',
        port: 2222,
        username: 'testuser',
        password: 'testpass'
      },
      webhookServer: {
        host: 'localhost',
        port: 3002,
        baseUrl: 'http://localhost:3002'
      }    };

    console.log('✅ Test configuration ready');

  } catch (error) {
    console.error('❌ Failed to setup test configuration:', error.message);
    process.exit(1);
  }
};
