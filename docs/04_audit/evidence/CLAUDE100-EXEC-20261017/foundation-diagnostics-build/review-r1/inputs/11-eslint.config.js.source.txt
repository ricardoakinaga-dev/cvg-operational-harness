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
    files: ['**/*.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off'
    }
  }
)
