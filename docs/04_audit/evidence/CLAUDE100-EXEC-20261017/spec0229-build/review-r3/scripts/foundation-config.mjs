export default {
  "root": "/tmp/cvg-claude100-exec-20261017/q01-candidate",
  "cacheDir": "/tmp/qualifier-review-r3/cache/vite",
  "test": {
    "environment": "node",
    "testTimeout": 15000,
    "fileParallelism": false,
    "maxWorkers": 1,
    "pool": "forks",
    "setupFiles": [],
    "include": [
      "tests/claude100/qualification/*.test.js",
      "tests/claude100/qualification/*.test.ts"
    ],
    "coverage": {
      "enabled": false
    },
    "reporters": [
      "default",
      "json"
    ],
    "outputFile": {
      "json": "/tmp/qualifier-review-r3/results/foundation.json"
    }
  }
}
