// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import unusedImports from 'eslint-plugin-unused-imports';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** See CONTRIBUTING.md for the standards these rules encode. */

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.cache/**',
      '**/.vercel/**',
      // Agent worktrees (Claude Code) live inside the repo folder.
      '.claude/**',
      // The team demo's app repo (npm run demo), made and wiped by the script.
      '.demo/**',
      '**/*.d.ts',
      // Pixel rows, kept on one line each by hand.
      '**/scout/art.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    plugins: { 'import-x': importX, 'unused-imports': unusedImports },
    settings: {
      'import-x/resolver': {
        typescript: { project: ['packages/*/tsconfig.json', 'apps/*/tsconfig.json'] },
        node: true,
      },
    },
    rules: {
      'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
      'import-x/no-cycle': ['error', { ignoreExternal: true }],
      'import-x/no-self-import': 'error',
      'import-x/no-useless-path-segments': 'error',
      'no-duplicate-imports': ['error', { allowSeparateTypeImports: false }],
      'import-x/no-duplicates': ['error', { 'prefer-inline': true }],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'never',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }],
      'no-fallthrough': 'off', // tsc understands `never`-returning calls such as process.exit; ESLint does not.
      '@typescript-eslint/no-this-alias': 'error',
      '@typescript-eslint/no-unused-expressions': ['error'],
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-vars': [
        'error',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: '18.3' } },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/no-multi-comp': ['error', { ignoreStateless: false }],
      'react/jsx-key': 'error',
      'react/jsx-no-useless-fragment': ['error', { allowExpressions: true }],
      'react/self-closing-comp': 'error',
    },
  },
  {
    files: ['**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Ticket state changes only through transition() (core planning/lifecycle), which checks and records them.
    files: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
    ignores: ['packages/core/src/planning/lifecycle/**', 'packages/core/src/adapters/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...["callee.object.name='adapter'", "callee.object.property.name='adapter'"].map((obj) => ({
          selector: `CallExpression[callee.property.name=/^(assign|close|reopen|setMeta|setMapMeta)$/][${obj}]`,
          message: 'Change ticket state with transition() or an operation (claim, release, resolve), not the adapter.',
        })),
      ],
    },
  },
  {
    // Readable code (CONTRIBUTING.md, "Readable code"): flat control flow, few parameters, no knots.
    files: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
    rules: {
      'no-nested-ternary': 'error',
      'max-depth': ['error', 3],
      'max-nested-callbacks': ['error', 3],
      'max-params': ['error', 4],
      complexity: ['error', 20],
    },
  },
  {
    // Tests and one-off tooling scripts: long fixtures and generators are fine, structure rules are not.
    files: ['**/test/**', 'scripts/**', '**/scripts/**', '**/tools/**'],
    rules: { 'max-lines': 'off' },
  },
  prettier,
);
