/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': '<rootDir>/jest.transformer.cjs',
  },
  fakeTimers: {
    enableGlobally: false,
  },
};
