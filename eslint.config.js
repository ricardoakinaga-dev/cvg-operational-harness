const tseslint = require('typescript-eslint')

module.exports = tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '**/dist/**',
      'coverage/**',
      'test-results/**',
      'docs/**',
      'packages/*/src/**/*.js',
      '**/*.d.ts',
      '**/*.js.map'
    ]
  },
  ...tseslint.configs.recommended,
  {
    files: [
      'apps/**/*.{ts,tsx}',
      'packages/**/*.{ts,tsx}',
      'legacy/**/*.{ts,tsx}',
      'tests/**/*.ts'
    ],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.typecheck.json',
        tsconfigRootDir: __dirname
      }
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error'
    }
  },
  {
    files: ['**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
)
