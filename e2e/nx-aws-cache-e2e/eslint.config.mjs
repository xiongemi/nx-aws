import rootConfig from '../../eslint.config.mjs';

export default [
  // Start from the workspace-wide config (parser, plugins, etc.)
  ...rootConfig,
  // Then apply e2e-specific overrides
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      'no-empty': 'off',
      'max-statements': 'off',
      'no-magic-numbers': 'off',
    },
  },
];
