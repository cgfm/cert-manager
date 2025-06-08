/**
 * Jest Global Teardown
 * Cleans up test configuration - environment cleanup is managed externally by test runner scripts
 */

module.exports = async () => {
  console.log('🧹 Tearing down test configuration...');

  try {
    // Clean up any global test state if needed
    console.log('✅ Test configuration cleaned up successfully');
  } catch (error) {
    console.error('❌ Failed to teardown test configuration:', error.message);
  }
};
