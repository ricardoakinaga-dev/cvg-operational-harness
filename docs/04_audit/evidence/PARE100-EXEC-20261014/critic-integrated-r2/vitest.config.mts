import rootConfig from '../vitest.config.mts'
import { defineConfig } from 'vitest/config'
export default defineConfig({...rootConfig,test:{...rootConfig.test,environment:'node',include:['critic-qa/lifetime-io.test.ts'],fileParallelism:false,maxWorkers:1}})
