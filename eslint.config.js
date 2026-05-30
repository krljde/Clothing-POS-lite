import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['js/app.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: globals.browser
    },
    rules: {
      'no-alert': 'off'
    }
  },
  {
    files: ['js/sync.js', 'js/admin.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser
    },
    rules: {
      'no-alert': 'off'
    }
  }
];
