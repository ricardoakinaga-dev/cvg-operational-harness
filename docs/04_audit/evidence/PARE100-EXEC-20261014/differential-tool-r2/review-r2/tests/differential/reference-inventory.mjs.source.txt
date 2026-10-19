import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const root = '/home/ricardo/deepseek-harness-session-fixes'
const pin = '768fb1f3d3dcf9a16659ee354e927d05475f22dd'
const packages = [
  'cordis',
  'dsh-agent-loop-testkit',
  'dsh-llm',
  'dsh-session',
  'dsh-agent',
  'dsh-agent-loop',
  'dsh-session-projection',
  'dsh-system-prompt',
  'dsh-tools'
]

// Independent metadata resolution only: this function imports/executes no
// reference module and never follows a path supplied by an observation.
export function readReferenceInventory() {
  if (
    fs.realpathSync(root) !== root ||
    JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
      .version !== '0.2.0-rc.1'
  )
    throw new Error('invalid reference inventory')
  const head = execFileSync(
    'git',
    [
      '--no-replace-objects',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.hooksPath=/dev/null',
      '-C',
      root,
      'rev-parse',
      'HEAD'
    ],
    {
      env: {
        PATH: '/usr/bin:/bin',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_NO_REPLACE_OBJECTS: '1'
      },
      encoding: 'utf8',
      timeout: 1000,
      maxBuffer: 4096
    }
  ).trim()
  if (head !== pin) throw new Error('invalid reference inventory')
  const require = createRequire(
    path.join(root, 'packages/test-support/agent-loop-testkit/package.json')
  )
  return packages.map((name) => {
    const nameWithScope = `@deepseek-ai/${name}`
    const file = fs.realpathSync(require.resolve(nameWithScope))
    if (!file.startsWith(root + path.sep) || !fs.lstatSync(file).isFile())
      throw new Error('invalid reference inventory')
    return {
      package: nameWithScope,
      file,
      sha256: crypto
        .createHash('sha256')
        .update(fs.readFileSync(file))
        .digest('hex')
    }
  })
}
