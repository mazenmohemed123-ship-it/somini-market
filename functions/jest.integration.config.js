/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/integration.test.js'],
  testTimeout: 40000,
  verbose: true
};
