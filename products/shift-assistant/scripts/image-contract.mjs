#!/usr/bin/env node
// Assistente de Plantão — built-image contract (SPEC 0179 section 9,
// AUD-0621 F25). Inspects a real image, never the Dockerfile text:
//   node products/shift-assistant/scripts/image-contract.mjs <image>
// Checks the configured user, exec-form commands, the flattened filesystem
// (no shell, package manager or shell utility, no setuid/setgid file, no
// node_modules), the program owned by root and /data owned by 10001, and
// that executing a shell in the image fails. Prints a JSON report.
// Exit 0 PASS, 1 FAIL, 2 tool or image unavailable.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const image = process.argv[2]
if (!image) {
  process.stderr.write('usage: image-contract.mjs <image>\n')
  process.exit(2)
}

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    encoding: options.encoding ?? 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    input: options.input
  })
  if (result.error) {
    process.stderr.write(`docker unavailable: ${result.error.code}\n`)
    process.exit(2)
  }
  return result
}

const checks = []
function check(name, pass, detail = undefined) {
  checks.push({ name, pass: Boolean(pass), ...(detail ? { detail } : {}) })
}

const inspected = docker(['image', 'inspect', image])
if (inspected.status !== 0) {
  process.stderr.write('image not found\n')
  process.exit(2)
}
const [info] = JSON.parse(inspected.stdout)
const config = info.Config ?? {}
check('user is cvg', config.User === 'cvg', config.User)
check(
  'cmd is exec form node shift-assistant.mjs',
  JSON.stringify(config.Cmd) === '["node","shift-assistant.mjs"]',
  JSON.stringify(config.Cmd)
)
check(
  'no entrypoint',
  !config.Entrypoint || config.Entrypoint.length === 0,
  JSON.stringify(config.Entrypoint)
)
const health = config.Healthcheck?.Test ?? []
check(
  'healthcheck is exec form on /health/ready',
  health[0] === 'CMD' && health.join(' ').includes('/health/ready'),
  health[0]
)

const created = docker(['create', image])
if (created.status !== 0) {
  process.stderr.write('cannot create container\n')
  process.exit(2)
}
const container = created.stdout.trim()
let listing = ''
let programSha256 = 'unavailable'
try {
  // `docker cp ... -` streams a tar: 512-byte header, then the file bytes.
  const copied = docker(['cp', `${container}:/app/shift-assistant.mjs`, '-'], {
    encoding: 'buffer'
  })
  if (copied.status === 0 && copied.stdout.length > 512) {
    const size = parseInt(
      copied.stdout
        .subarray(124, 136)
        .toString('latin1')
        .replace(/\0.*$/, '')
        .trim(),
      8
    )
    programSha256 = createHash('sha256')
      .update(copied.stdout.subarray(512, 512 + size))
      .digest('hex')
  }
  const exported = docker(['export', container], { encoding: 'buffer' })
  const tar = spawnSync('tar', ['-tvf', '-'], {
    input: exported.stdout,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024
  })
  if (tar.error || tar.status !== 0) {
    process.stderr.write('tar unavailable\n')
    process.exit(2)
  }
  listing = tar.stdout
} finally {
  docker(['rm', container])
}

const entries = listing
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    const parts = line.trim().split(/\s+/)
    const mode = parts[0]
    const owner = parts[1]
    const path = parts
      .slice(5)
      .join(' ')
      .split(' -> ')[0]
      .replace(/^\.?\//, '')
    return { mode, owner, path }
  })
const names = new Set(entries.map((entry) => entry.path.replace(/\/$/, '')))

const FORBIDDEN =
  /(^|\/)(sh|bash|dash|ash|zsh|ksh|busybox|toybox|npm|npx|corepack|yarn|pnpm|apt|apt-get|dpkg|rpm|apk|curl|wget|nc|su|sudo|env)$/
const forbidden = entries
  .filter((entry) => /(^|\/)s?bin\//.test(entry.path))
  .filter((entry) => FORBIDDEN.test(entry.path.replace(/\/$/, '')))
  .map((entry) => entry.path)
check(
  'no shell, package manager or shell utility',
  forbidden.length === 0,
  forbidden.join(',')
)
const setid = entries
  .filter((entry) => /^[-l]..[sS]|^[-l].....[sS]/.test(entry.mode))
  .map((entry) => entry.path)
check('no setuid or setgid file', setid.length === 0, setid.join(','))
const modules = entries
  .filter((entry) => /(^|\/)node_modules(\/|$)/.test(entry.path))
  .map((entry) => entry.path)
check('no node_modules', modules.length === 0, String(modules.length))
check('node binary present', names.has('usr/local/bin/node'))
const program = entries.find(
  (entry) => entry.path === 'app/shift-assistant.mjs'
)
check(
  'program owned by root',
  program && /^root\/root$|^0\/0$/.test(program.owner),
  program?.owner
)
const data = entries.find((entry) => entry.path.replace(/\/$/, '') === 'data')
check(
  'data directory owned by 10001 with mode 0700',
  data &&
    /10001\/10001|cvg\/cvg/.test(data.owner) &&
    data.mode === 'drwx------',
  data ? `${data.owner} ${data.mode}` : 'missing'
)
const passwd = docker([
  'run',
  '--rm',
  '--entrypoint',
  '/bin/sh',
  image,
  '-c',
  'true'
])
check('executing /bin/sh fails', passwd.status !== 0, `exit ${passwd.status}`)
const bash = docker(['run', '--rm', '--entrypoint', 'bash', image])
check('executing bash fails', bash.status !== 0, `exit ${bash.status}`)

const report = {
  schemaVersion: 1,
  kind: 'shift-assistant-image-contract',
  image,
  imageId: info.Id,
  programSha256,
  repoDigests: info.RepoDigests ?? [],
  files: entries.length,
  checks,
  verdict: checks.every((entry) => entry.pass) ? 'PASS' : 'FAIL'
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.exit(report.verdict === 'PASS' ? 0 : 1)
