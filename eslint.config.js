/* eslint-disable @typescript-eslint/naming-convention */
import { eslintNodeConfig } from '@kitiumai/lint';

export default [
  ...eslintNodeConfig,
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
