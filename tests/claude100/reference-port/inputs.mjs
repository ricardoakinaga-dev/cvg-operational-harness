import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { constants } from 'node:fs'
import { mkdir, lstat, open, realpath, unlink, readdir } from 'node:fs/promises'
import {
  PINS,
  STDIN_TEXT,
  SETTINGS_TEXT,
  MCP_TEXT,
  nativeInvocation
} from './protocol.mjs'
import { pinFile, canonicalBytes, sha256 } from './evidence.mjs'
import { parseManifest, probeError } from './schema.mjs'

export const SPEC_SHA256 =
  'aaa12b3ee55021e357fc9a17518316135eb4ca423b87215af754cd18dbb41f04'
import { SOURCE_PATHS } from './bootstrap.mjs'
export { SOURCE_PATHS } from './bootstrap.mjs'
const sourceRoot = fileURLToPath(new URL('../../../', import.meta.url))
const ref = (a) => ({ path: a.path, sha256: a.sha256, bytes: a.bytes })

export async function pinToolchains(pins, observed) {
  for (const [key, filename, expected, maximum] of [
    ['claudeSha256', PINS.claudePath, PINS.claudeSha256, 512 * 1024 * 1024],
    ['nodeSha256', PINS.nodePath, PINS.nodeSha256, 256 * 1024 * 1024],
    ['dockerSha256', PINS.dockerPath, PINS.dockerSha256, 128 * 1024 * 1024]
  ]) {
    try {
      const pin = await pinFile(filename, expected, maximum)
      pins.push(pin)
      observed[key] = pin.sha256
    } catch (cause) {
      if (cause.observedDigest) observed[key] = cause.observedDigest
      if (cause.code === 'IDENTITY_MISMATCH') throw cause
      throw probeError('TOOLCHAIN_UNAVAILABLE', cause)
    }
  }
}

export async function prepareInputs(evidence, manifestName, pins) {
  const input = await evidence.read(manifestName, 65536)
  const manifest = parseManifest(input.bytes)
  const manifestArtifact = await evidence.add(
    'manifest',
    'inputs/manifest.json',
    input.bytes
  )
  const entries = []
  let sourceBytes = 0
  async function snapshot(relative, bytes) {
    sourceBytes += bytes.length
    if (sourceBytes > 1024 * 1024 || entries.length >= 256)
      throw probeError('INPUT_INVALID')
    const a = await evidence.add(
      'bundle-source',
      `inputs/bundle/${relative}`,
      bytes
    )
    entries.push({ path: relative, sha256: a.sha256, bytes: a.bytes })
    pins.push(
      await pinFile(path.join(evidence.root, a.path), a.sha256, 1024 * 1024)
    )
  }
  for (const relative of SOURCE_PATHS) {
    let original
    try {
      original = await pinFile(
        path.join(sourceRoot, relative),
        relative.endsWith('0235_claude_native_port_probe.md')
          ? SPEC_SHA256
          : null,
        1024 * 1024,
        true
      )
    } catch (cause) {
      throw probeError(
        cause.code === 'IDENTITY_MISMATCH'
          ? 'IDENTITY_MISMATCH'
          : 'INPUT_INVALID',
        cause
      )
    }
    pins.push(original)
    await snapshot(relative, original.bytes)
  }
  const template = nativeInvocation(1)
  for (const [name, bytes] of [
    ['fixtures/stdin.txt', Buffer.from(STDIN_TEXT)],
    ['fixtures/settings.json', Buffer.from(SETTINGS_TEXT)],
    ['fixtures/mcp.json', Buffer.from(MCP_TEXT)],
    [
      'fixtures/invocation-template.json',
      canonicalBytes({
        file: template.file,
        versionArgs: template.versionArgs,
        args: template.args,
        cwd: template.cwd,
        env: { ...template.env, ANTHROPIC_BASE_URL: 'http://127.0.0.1:{PORT}' },
        versionStdinBase64: '',
        portStdinBase64: template.stdin.toString('base64')
      })
    ]
  ])
    await snapshot(name, bytes)
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  const bundleInventory = await evidence.addJson(
    'bundle-inventory',
    'inputs/bundle-inventory.json',
    { version: 1, entries }
  )
  const stdin = await evidence.add(
    'stdin',
    'inputs/stdin.txt',
    Buffer.from(STDIN_TEXT)
  )
  const settings = await evidence.add(
    'settings',
    'inputs/workspace/settings.json',
    Buffer.from(SETTINGS_TEXT)
  )
  const mcp = await evidence.add(
    'mcp',
    'inputs/workspace/mcp.json',
    Buffer.from(MCP_TEXT)
  )
  const consumedInputs = await evidence.addJson(
    'consumed-inputs',
    'inputs/consumed-inputs.json',
    {
      version: 1,
      manifest: ref(manifestArtifact),
      stdin: ref(stdin),
      settings: ref(settings),
      mcp: ref(mcp),
      bundleInventory: ref(bundleInventory)
    }
  )
  const emptyVolume = await evidence.emptyDirectory('inputs/empty-volume')
  for (const artifact of evidence.artifacts) {
    const filename = path.join(evidence.root, artifact.path)
    if (!pins.some((pin) => pin.filename === filename))
      pins.push(await pinFile(filename, artifact.sha256, 1024 * 1024))
  }
  pins.push(
    await pinFile(
      path.resolve(evidence.root, manifestName),
      input.sha256,
      65536
    )
  )
  const emptyHandle = await open(
    emptyVolume,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  )
  let emptyStat
  try {
    emptyStat = await emptyHandle.stat({ bigint: true })
  } catch (primary) {
    try {
      await emptyHandle.close()
    } catch (cleanup) {
      throw probeError('IO', new AggregateError([primary, cleanup]))
    }
    throw primary
  }
  let emptyClosed = false
  const verifyEmpty = async () => {
    if (emptyClosed) throw probeError('DRIFT_RUNTIME')
    const stat = await lstat(emptyVolume, { bigint: true })
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.dev !== emptyStat.dev ||
      stat.ino !== emptyStat.ino ||
      stat.mode !== emptyStat.mode ||
      stat.mtimeNs !== emptyStat.mtimeNs ||
      stat.ctimeNs !== emptyStat.ctimeNs ||
      (await realpath(`/proc/self/fd/${emptyHandle.fd}`)) !== emptyVolume ||
      (await readdir(`/proc/self/fd/${emptyHandle.fd}`)).length
    )
      throw probeError('DRIFT_RUNTIME')
    return { path: emptyVolume, entries: [] }
  }
  pins.push({
    filename: emptyVolume,
    verify: verifyEmpty,
    async close() {
      if (!emptyClosed) {
        emptyClosed = true
        await emptyHandle.close()
      }
    }
  })
  await verifyEmpty()
  return {
    manifest,
    driverSha256: bundleInventory.sha256,
    consumedInputsSha256: consumedInputs.sha256,
    bundle: path.join(evidence.outputPath, 'inputs/bundle'),
    workspace: path.join(evidence.outputPath, 'inputs/workspace'),
    emptyVolume,
    sourceBytes,
    entries,
    async verifyManifest() {
      try {
        if ((await evidence.read(manifestName, 65536)).sha256 !== input.sha256)
          throw probeError('DRIFT_RUNTIME')
      } catch (cause) {
        throw probeError('DRIFT_RUNTIME', cause)
      }
    }
  }
}

/** The marker is an owned synthetic file outside every container bind. */
export async function createHostMarker(nonce) {
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw probeError('INPUT_INVALID')
  const parent = '/tmp/cvg-claude100-exec-20261017/ref-port-markers'
  await mkdir(parent, { mode: 0o700 }).catch((cause) => {
    if (cause.code !== 'EEXIST') throw cause
  })
  const stat = await lstat(parent)
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid() ||
    stat.mode & 0o077
  )
    throw probeError('INPUT_INVALID')
  const dir = await open(
    parent,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
  )
  let file,
    initial,
    removed = false,
    closed = false
  const filename = path.join(parent, nonce)
  const anchored = `/proc/self/fd/${dir.fd}/${nonce}`
  async function close() {
    if (closed) return
    closed = true
    const causes = []
    if (file) {
      try {
        const owner = initial ?? (await file.stat({ bigint: true }))
        const current = await lstat(anchored, { bigint: true })
        if (
          !current.isFile() ||
          current.dev !== owner.dev ||
          current.ino !== owner.ino
        )
          throw probeError('CLEANUP')
        await unlink(anchored)
        removed = true
      } catch (cause) {
        causes.push(cause)
      }
      try {
        await file.close()
      } catch (cause) {
        causes.push(cause)
      }
    }
    try {
      await dir.close()
    } catch (cause) {
      causes.push(cause)
    }
    if (causes.length) throw probeError('CLEANUP', new AggregateError(causes))
  }
  try {
    if ((await realpath(`/proc/self/fd/${dir.fd}`)) !== parent)
      throw probeError('INPUT_INVALID')
    file = await open(
      anchored,
      constants.O_RDWR |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600
    )
    initial = await file.stat({ bigint: true })
    await file.writeFile('CVG_UNMOUNTED_SYNTHETIC_MARKER')
    await file.sync()
    return {
      path: filename,
      sha256: sha256('CVG_UNMOUNTED_SYNTHETIC_MARKER'),
      close,
      get removed() {
        return removed
      }
    }
  } catch (primary) {
    try {
      await close()
    } catch (cleanup) {
      throw probeError('IO', new AggregateError([primary, cleanup]))
    }
    throw primary
  }
}
