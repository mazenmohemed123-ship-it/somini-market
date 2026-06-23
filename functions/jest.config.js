/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  // اختبار التكامل يحتاج Functions+Auth emulators ويُشغَّل بسكربت منفصل
  testPathIgnorePatterns: ['/node_modules/', 'integration.test.js'],
  testTimeout: 20000,
  verbose: true
};
