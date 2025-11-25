/* eslint-disable @typescript-eslint/naming-convention */
import { nodeConfig } from '@kitiumai/lint/eslint';

export default [
  ...nodeConfig,
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    name: 'test-db-overrides',
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      complexity: ['warn', 15],
    },
  },
  {
    name: 'test-db-tests',
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'max-lines-per-function': ['warn', 300],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
