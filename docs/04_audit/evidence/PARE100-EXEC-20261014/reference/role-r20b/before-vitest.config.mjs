export default {
  cacheDir: new URL('./.vite/', import.meta.url).pathname,
  test: { environment: 'node', maxWorkers: 1, fileParallelism: false }
}
