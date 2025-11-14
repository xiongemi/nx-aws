import nx from '@nx/eslint-plugin';
import importPlugin from 'eslint-plugin-import';
import jsoncParser from 'jsonc-eslint-parser';

// Flat config using Nx's built-in presets, plus your workspace rules.
export default [
  {
    ignores: ['**/dist', '**/tmp', '**/coverage'],
  },

  // Nx recommended base / TS / JS configs
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],

  // Workspace-wide rules for source files
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    plugins: {
      import: importPlugin,
    },
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
      // Keep key style rules from previous .eslintrc.json
      'class-methods-use-this': 'off',
      'func-style': [
        'error',
        'declaration',
        {
          allowArrowFunctions: true,
        },
      ],
      'lines-between-class-members': [
        'error',
        'always',
        {
          exceptAfterSingleLine: true,
        },
      ],
      'max-statements': ['error', 20],
      'no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1],
        },
      ],
      'no-ternary': 'off',
      'sort-imports': 'off',
      'sort-keys': 'off',
      'sort-vars': 'off',
      'one-var': 'off',
      'function-call-argument-newline': 'off',
      'init-declarations': 'off',
      'import/no-internal-modules': [
        'error',
        {
          allow: ['@nx/workspace/**', '@nx/devkit/**'],
        },
      ],
      'import/no-unresolved': 'off',
    },
  },

  // JSON / JSONC support (nx.json, tsconfig, etc.)
  {
    files: ['**/*.json'],
    languageOptions: {
      parser: jsoncParser,
    },
    rules: {},
  },
];
