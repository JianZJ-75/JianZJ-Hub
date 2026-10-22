import babelParser from '@babel/eslint-parser'
import { builtinModules } from 'node:module'
import globals from 'globals'

const code = ['*.{js,mjs,cjs,ts,tsx}', '{src,scripts,tests}/**/*.{js,mjs,cjs,ts,tsx}']
const typescript = ['*.{ts,tsx}', '{src,scripts,tests}/**/*.{ts,tsx}']

export default [
  {
    ignores: [
      '**/node_modules/**',
      '.git/**',
      '.idea/**',
      '.vscode/**',
      '.m0-scratch/**',
      '.m1-scratch/**',
      'out/**',
      'dist/**',
      'release/**',
      'prototypes/**',
      'docs/**',
    ],
  },
  {
    files: code,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    // Start with correctness, not a whole-repository style migration.
    rules: {
      'constructor-super': 'error',
      'for-direction': 'error',
      'getter-return': 'error',
      'no-async-promise-executor': 'error',
      'no-class-assign': 'error',
      'no-compare-neg-zero': 'error',
      'no-cond-assign': ['error', 'except-parens'],
      'no-const-assign': 'error',
      'no-constant-binary-expression': 'error',
      'no-debugger': 'error',
      'no-dupe-args': 'error',
      'no-dupe-else-if': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty-pattern': 'error',
      'no-ex-assign': 'error',
      'no-invalid-regexp': 'error',
      'no-loss-of-precision': 'error',
      'no-new-native-nonconstructor': 'error',
      'no-obj-calls': 'error',
      'no-self-assign': 'error',
      'no-setter-return': 'error',
      'no-sparse-arrays': 'error',
      'no-undef': 'error',
      'no-unexpected-multiline': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-negation': 'error',
      'no-unsafe-optional-chaining': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
  {
    files: typescript,
    languageOptions: {
      // typescript-eslint currently excludes TS 7 from its supported peers.
      // Babel parses syntax only; the existing tsc command owns type checking.
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          babelrc: false,
          configFile: false,
          parserOpts: { plugins: ['typescript'] },
        },
      },
    },
    // Core no-undef cannot distinguish TypeScript ambient/type declarations.
    rules: { 'no-undef': 'off' },
  },
  {
    files: ['**/*.tsx'],
    languageOptions: {
      parserOptions: { babelOptions: { parserOpts: { plugins: ['typescript', 'jsx'] } } },
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
  {
    files: ['src/renderer/**/*.{js,mjs,ts,tsx}'],
    languageOptions: {
      globals: {
        ...Object.fromEntries(Object.keys(globals.node).map((name) => [name, 'off'])),
        ...globals.browser,
      },
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            ...new Set(builtinModules.flatMap((name) => [name, `node:${name}`])),
            'electron',
            'node-pty',
            'better-sqlite3',
            'koffi',
          ],
          patterns: ['node:*'],
        },
      ],
    },
  },
]
