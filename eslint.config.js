import baseConfig from '@kitiumai/config/eslint.config.base.js';
import { createKitiumConfig } from '@kitiumai/lint';

export default createKitiumConfig({
  baseConfig,
  ignorePatterns: ['dist/**', '**/*.d.ts', '**/*.d.cts', 'node_modules/**', 'prettier.config.*'],
  additionalRules: {
    // Disable to avoid schema mismatch across ESLint versions
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
  overrides: [
    // Globally disable restricted import rule for this package
    {
      files: ['**/*'],
      rules: {
        'no-restricted-imports': 'off',
      },
    },
    {
      files: ['**/*.{js,cjs,mjs}'],
      rules: {
        '@typescript-eslint/naming-convention': 'off',
        '@typescript-eslint/explicit-function-return-types': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
    // CommonJS config files
    {
      files: ['jest.config.cjs', 'prettier.config.cjs'],
      languageOptions: {
        sourceType: 'script',
        ecmaVersion: 2021,
        globals: { module: 'readonly', require: 'readonly' },
      },
      rules: {
        'no-undef': 'off',
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
    {
      files: ['**/*.d.ts'],
      rules: {
        '@typescript-eslint/naming-convention': 'off',
        'import/no-default-export': 'off',
      },
    },
    {
      files: ['tests/**/*.{ts,tsx}'],
      rules: {
        'max-lines-per-function': ['warn', 300],
        'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      },
    },
  ],
});
