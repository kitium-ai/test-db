import { eslintNodeConfig } from '@kitiumai/lint';

export default [
  ...eslintNodeConfig,
  {
    ignores: ['dist/**', 'node_modules/**', 'prettier.config.*'],
  },
  {
    name: 'test-db-overrides',
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
      complexity: ['warn', 15],
      // Disable conflicting import rules to avoid circular fixes
      'simple-import-sort/imports': 'off',
      'import/order': 'off',
      // Allow callbacks for database operations
      'promise/prefer-await-to-callbacks': 'off',
      // Allow passing functions to array methods
      'unicorn/no-array-callback-reference': 'off',
      // Allow test database abbreviations
      'unicorn/prevent-abbreviations': 'off',
      // Allow deeper nesting in test fixtures
      'max-depth': ['warn', 5],
      // Allow more statements in complex functions
      'max-statements': ['warn', 25],
    },
  },
  {
    name: 'test-db-non-ts-files',
    files: ['**/*.{js,cjs,mjs}'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/explicit-function-return-types': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    name: 'test-db-type-declarations',
    files: ['**/*.d.ts'],
    rules: {
      // Allow naming conventions that match external libraries in type declarations
      '@typescript-eslint/naming-convention': 'off',
      // Allow default exports in type declarations
      'import/no-default-export': 'off',
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
