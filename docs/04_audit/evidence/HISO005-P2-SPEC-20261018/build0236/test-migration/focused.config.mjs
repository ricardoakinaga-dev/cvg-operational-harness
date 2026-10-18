import config from '/home/ricardo/cvg-candidates/hiso005-integrated-20261018/vitest.config.mts'
export default {...config, cacheDir: '/tmp/cvg-hiso005-integration-20261018/test-migration/vite-cache', test: {...config.test, maxWorkers: 1, fileParallelism: false}}
