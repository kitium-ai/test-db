import {
  baseConfig,
  jestConfig,
  nodeConfig,
  securityConfig,
  typeScriptConfig,
} from '@kitiumai/lint/eslint';

const nodeRules = nodeConfig.find((config) => config.name === 'kitium/node') ?? nodeConfig.at(-1);
const typeScriptRules =
  typeScriptConfig.find((config) => config.name === 'kitium/typescript') ?? typeScriptConfig.at(-1);

export default [
  ...baseConfig,
  nodeRules,
  typeScriptRules,
  {
    name: 'test-db/typescript-project',
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
      },
    },
  },
  {
    name: 'test-db/config-files',
    files: ['**/*.cjs', 'eslint.config.js'],
    rules: {
      '@typescript-eslint/naming-convention': 'off',
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    name: 'test-db/declaration-files',
    files: ['**/*.d.ts'],
    rules: {
      'import/no-default-export': 'off',
    },
  },
  securityConfig,
  jestConfig,
  {
    name: 'test-db/lint-overrides',
    rules: {
      // Fix upstream schema incompatibility with ESLint v9+.
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['../../*', '../../../*'],
              message: 'Prefer module aliases over deep relative imports for maintainability.',
            },
          ],
        },
      ],
      // Avoid circular fixes between import ordering rules.
      'import/order': 'off',

      // Too many false positives for typical helper patterns.
      'security/detect-object-injection': 'off',
    },
  },
];
