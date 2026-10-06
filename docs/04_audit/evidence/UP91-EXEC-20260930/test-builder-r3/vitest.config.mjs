import base from '/tmp/cvg-up91-exec-20260930/repo/vitest.config.mts'
export default {
  ...base,
  cacheDir: '/tmp/cvg-up91-exec-20260930/test-builder-r3/vite-cache',
  test: { ...base.test, cache: false }
}
