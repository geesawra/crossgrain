import js from '@eslint/js';
import ts from 'typescript-eslint';
import lit from 'eslint-plugin-lit';
import prettier from 'eslint-config-prettier';

export default ts.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...ts.configs.recommended,
  lit.configs['flat/recommended'],
  {
    files: ['**/*.ts', '**/*.mjs'],
    languageOptions: {
      globals: Object.fromEntries(
        [
          'window',
          'document',
          'customElements',
          'HTMLElement',
          'ResizeObserver',
          'MutationObserver',
          'IntersectionObserver',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'Event',
          'CustomEvent',
          'KeyboardEvent',
          'MouseEvent',
          'AbortController',
          'AbortSignal',
          'DOMException',
          'URL',
          'URLSearchParams',
          'Request',
          'Response',
          'fetch',
          'performance',
          'setTimeout',
          'clearTimeout',
          'setImmediate',
          'process',
          'console',
          'Buffer',
        ].map((name) => [name, 'readonly']),
      ),
    },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  prettier,
);
