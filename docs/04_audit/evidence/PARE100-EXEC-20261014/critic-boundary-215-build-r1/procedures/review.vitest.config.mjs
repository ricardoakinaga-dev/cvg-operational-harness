import { defineConfig } from 'vitest/config'
export default defineConfig({cacheDir: '../vite-cache',test:{environment:'node',testTimeout:30000,fileParallelism:false,include:['tests/product-boundary.test.js','tests/pare100-sdk-boundary-qualification.test.js','tests/i1-independent.test.js'],reporters:['verbose']}})
