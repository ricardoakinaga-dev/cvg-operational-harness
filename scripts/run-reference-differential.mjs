import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const referenceRoot = process.env.CVG_DIFFERENTIAL_REFERENCE_ROOT
if (!referenceRoot || !path.isAbsolute(referenceRoot)) {
  process.stderr.write(
    'reference proof requires an absolute CVG_DIFFERENTIAL_REFERENCE_ROOT; pinned runtime and inventory guards remain mandatory\n'
  )
  process.exitCode = 1
} else {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--config',
      path.join(root, 'vitest.reference.config.mts'),
      '--no-file-parallelism',
      '--maxWorkers=1',
      ...process.argv.slice(2)
    ],
    { cwd: root, env: process.env, stdio: 'inherit' }
  )
  if (result.error) process.stderr.write('reference proof process failed\n')
  process.exitCode = result.status ?? 1
}
