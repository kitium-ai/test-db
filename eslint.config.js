/* eslint-disable @typescript-eslint/naming-convention */
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import securityPlugin from 'eslint-plugin-security';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    plugins: {
      prettier: prettierPlugin,
      import: importPlugin,
      security: securityPlugin,
      'simple-import-sort': simpleImportSortPlugin,
    },
    rules: {
      'prettier/prettier': [
        'error',
        {
          semi: true,
          singleQuote: true,
          trailingComma: 'es5',
          printWidth: 100,
          tabWidth: 2,
          useTabs: false,
          arrowParens: 'always',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'default',
          format: ['camelCase'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'variable',
          format: ['camelCase', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
          trailingUnderscore: 'allow',
        },
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        {
          selector: 'enumMember',
          format: ['PascalCase', 'UPPER_CASE'],
        },
      ],
      'no-restricted-imports': [
        'warn',
        {
          paths: [
            {
              name: '../../*',
              message: 'Prefer module aliases over deep relative imports for maintainability.',
            },
            {
              name: '../../../*',
              message: 'Prefer module aliases over deep relative imports for maintainability.',
            },
          ],
        },
      ],
      'no-console': [
        'warn',
        {
          allow: ['warn', 'error', 'log'],
        },
      ],
      'no-debugger': 'error',
      'no-empty': 'error',
      'no-duplicate-imports': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-duplicates': 'off',
      'import/no-unresolved': 'off',
      'import/order': 'off',
      'import/no-cycle': ['warn', { maxDepth: Infinity }],
      'import/no-self-import': 'error',
      'import/consistent-type-specifier-style': 'off',
      'security/detect-buffer-noassert': 'warn',
      'security/detect-child-process': 'warn',
      'security/detect-disable-mustache-escape': 'warn',
      'security/detect-no-csrf-before-method-override': 'warn',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-object-injection': 'off',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-unsafe-regex': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    name: 'test-db-overrides',
    files: ['**/*.{ts,tsx}'],
    rules: {
      complexity: ['warn', 15],
    },
  },
  {
    name: 'test-db-tests',
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      'max-lines-per-function': ['warn', 300],
    },
  },
  {
    name: 'test-db-cjs',
    files: ['**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'no-undef': 'off',
    },
  },
  {
    name: 'test-db-config',
    files: ['jest.config.js'],
    rules: {
      'no-undef': 'off',
    },
  },
  {
    name: 'test-db-types',
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
    },
  },
];
