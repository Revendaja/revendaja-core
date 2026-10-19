/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  setupFiles: ['<rootDir>/test/jest.setup.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  clearMocks: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/server.ts',
    '!src/**/*.types.ts',
    '!src/**/__tests__/**',
  ],
  coverageDirectory: 'coverage',
};
