import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { pipeline } from 'node:stream/promises'
import { pathToFileURL } from 'node:url'
import {
  canonicalJson,
  sha256File,
  fingerprintResolution,
  fingerprintToolchain,
  collectPackageInventory,
  INSTALLED_IDENTITY_LIMITS,
  pinnedToolchainLocation,
  REFERENCE_SOURCE_EXCLUSIONS,
  referenceSourceExcluded,
  referenceSourceExclusionConflict
} from './boundary-installed-identity.mjs'
import {
  referenceEnvironment,
  runOwnedProcess,
  unavailable
} from './boundary-reference-process.mjs'

// Default location only (CVG_PINNED_NODE/CVG_PINNED_NPM or the running Node);
// fingerprintToolchain still enforces the pinned Node and npm identity.
const { node: DEFAULT_NODE, npm: DEFAULT_NPM } = pinnedToolchainLocation()
const AUXILIARY_PINS = Object.freeze({
  '/usr/bin/git':
    '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668',
  '/usr/bin/tar':
    '3ee2c3c0b4dd9aacebfd2f0fbae44bad36348203acff78a44888dd58c05f811c',
  '/usr/bin/strace':
    '28f957c227012de0b18d1bd7fff2d396cb693ea60ed8013be68de071e84b5001'
})
const hash = (value) => createHash('sha256').update(value).digest('hex')
const inside = (root, item) => item === root || item.startsWith(root + path.sep)
const exists = (file) => {
  try {
    fs.lstatSync(file)
    return true
  } catch (e) {
    if (e.code === 'ENOENT') return false
    throw e
  }
}
const safe = (name) =>
  name &&
  !name.startsWith('/') &&
  !name.split('/').some((p) => !p || p === '.' || p === '..') &&
  !/[\x00-\x1f\\]/.test(name)
const excluded = (name) =>
  name
    .split('/')
    .some(
      (p) =>
        [
          'node_modules',
          'dist',
          '.git',
          '.ssh',
          '.aws',
          '.gnupg',
          '.agent',
          '.npm',
          'coverage',
          'test-results'
        ].includes(p) ||
        /^(\.env(?:\..*)?|\.netrc|\.npm-token|credentials(?:\..*)?|secrets?(?:\..*)?|.*\.(?:pem|key|p12|pfx))$/i.test(
          p
        )
    )

function regular(file) {
  const stat = fs.lstatSync(file)
  if (!stat.isFile()) throw unavailable('INPUT_NOT_REGULAR')
  return stat
}

function limitsFor(testOnly) {
  const limits = { ...INSTALLED_IDENTITY_LIMITS }
  if (testOnly) {
    if (testOnly.context !== 'synthetic-fixture')
      throw unavailable('TEST_CONTEXT_REQUIRED')
    for (const [key, value] of Object.entries(testOnly.limits ?? {})) {
      if (
        !(key in limits) ||
        !Number.isSafeInteger(value) ||
        value < 1 ||
        value > limits[key]
      )
        throw unavailable('LIMIT_RAISE_FORBIDDEN')
      limits[key] = value
    }
  }
  return limits
}

function validateConfigs(root, files) {
  const accepted = new Set([
    'engine-strict=true',
    'legacy-peer-deps=false',
    'strict-peer-deps=true',
    'install-strategy=hoisted',
    'package-lock=true',
    'registry=https://registry.npmjs.org/'
  ])
  for (const { name } of files) {
    if (path.posix.basename(name) !== '.npmrc') continue
    const file = path.join(root, name)
    if (regular(file).size > 64 * 1024)
      throw unavailable('PROJECT_CONFIG_LIMIT')
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const value = line.trim()
      if (
        value &&
        !value.startsWith('#') &&
        !value.startsWith(';') &&
        !accepted.has(value)
      )
        throw unavailable('PROJECT_CONFIG_UNKNOWN')
    }
  }
}

function sourceDigest(root, files) {
  const entries = []
  for (const { name, oid, mode, size } of files) {
    const file = path.join(root, name)
    const before = regular(file)
    // No symlink ancestor, including an innocuous-looking workspace directory.
    if (fs.realpathSync(file) !== file) throw unavailable('SOURCE_ALIAS')
    if (
      before.size !== size ||
      (before.mode & 0o111) !== (mode === '100755' ? 0o111 : 0)
    )
      throw unavailable('SOURCE_COMMIT_MISMATCH')
    const digest = createHash('sha1').update('blob ' + size + '\0')
    const fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
    )
    const buf = Buffer.alloc(64 * 1024)
    try {
      let n,
        readBytes = 0
      while ((n = fs.readSync(fd, buf, 0, buf.length, null))) {
        readBytes += n
        if (readBytes > size) throw unavailable('SOURCE_COMMIT_MISMATCH')
        digest.update(buf.subarray(0, n))
      }
    } finally {
      fs.closeSync(fd)
    }
    const after = regular(file)
    if (
      digest.digest('hex') !== oid ||
      ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some(
        (key) => before[key] !== after[key]
      )
    )
      throw unavailable('SOURCE_COMMIT_MISMATCH')
    entries.push({ path: name, oid, mode, size })
  }
  return hash(canonicalJson(entries))
}

// `sampling` is only the in-flight ceiling walk while npm runs: an entry that
// npm removes or replaces between readdir, lstat and readlink is skipped in
// that sample (it still counted as an entry). Every other walk, including the
// final inventory after npm, stays strict and refuses a vanished entry.
function allFiles(root, limits, digest = true, sampling = false) {
  let entries = 0,
    regularBytes = 0,
    maxDepth = 0
  const list = []
  const vanished = (error) =>
    sampling && ['ENOENT', 'ENOTDIR'].includes(error?.code)
  const visit = (dir, depth) => {
    maxDepth = Math.max(maxDepth, depth)
    if (depth > limits.maxDepth) throw unavailable('REFERENCE_DEPTH_LIMIT')
    let names
    try {
      names = fs.readdirSync(dir).sort()
    } catch (error) {
      if (vanished(error)) return
      throw error
    }
    for (const name of names) {
      if (++entries > limits.maxEntries)
        throw unavailable('REFERENCE_ENTRIES_LIMIT')
      const file = path.join(dir, name)
      let stat
      try {
        stat = fs.lstatSync(file)
      } catch (error) {
        if (vanished(error)) continue
        throw error
      }
      if (stat.isDirectory()) {
        list.push({ path: path.relative(root, file), type: 'directory' })
        visit(file, depth + 1)
      } else if (stat.isFile()) {
        regularBytes += stat.size
        if (regularBytes > limits.maxTotalBytes)
          throw unavailable('REFERENCE_BYTES_LIMIT')
        if (digest)
          list.push({
            path: path.relative(root, file).split(path.sep).join('/'),
            type: 'file',
            sha256: sha256File(file),
            size: stat.size,
            executableBits: stat.mode & 0o111
          })
      } else if (stat.isSymbolicLink()) {
        let target
        try {
          target = fs.readlinkSync(file)
        } catch (error) {
          if (vanished(error)) continue
          throw error
        }
        list.push({ path: path.relative(root, file), type: 'link', target })
      } else throw unavailable('REFERENCE_SPECIAL_FILE')
    }
  }
  visit(root, 0)
  return { entries, regularBytes, maxDepth, list }
}

// SPEC0243 §3.2: every regular file of the snapshot, relative and sorted.
// Anything that is not a directory or a regular file is a mismatch.
function snapshotFiles(root, limits) {
  const list = []
  let entries = 0
  const visit = (dir) => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      if (++entries > limits.maxEntries)
        throw unavailable('REFERENCE_ENTRIES_LIMIT')
      const file = path.join(dir, item.name)
      if (item.isDirectory()) visit(file)
      else if (item.isFile())
        list.push(path.relative(root, file).split(path.sep).join('/'))
      else throw unavailable('SNAPSHOT_MISMATCH')
    }
  }
  visit(root)
  return list.sort()
}

function cacheFile(cacheSource, integrity) {
  if (
    typeof integrity !== 'string' ||
    !/^sha512-[A-Za-z0-9+/]{86}==$/.test(integrity)
  )
    throw unavailable('CACHE_SRI_REQUIRED')
  const digest = Buffer.from(integrity.slice(7), 'base64')
  if (digest.length !== 64 || digest.toString('base64') !== integrity.slice(7))
    throw unavailable('CACHE_SRI_INVALID')
  const hex = digest.toString('hex')
  return path.join(
    cacheSource,
    '_cacache/content-v2/sha512',
    hex.slice(0, 2),
    hex.slice(2, 4),
    hex.slice(4)
  )
}

export function inspectReferenceTrace(trace, nodePath) {
  if (regular(trace).size > 8 * 1024 * 1024)
    throw unavailable('PROCESS_TRACE_LIMIT')
  const observed = fs.readFileSync(trace, 'utf8')
  if (/\b(?:socket\(AF_INET6?|connect\([^\n]*AF_INET6?)/.test(observed))
    throw unavailable('NETWORK_ATTEMPT_OBSERVED')
  const executions = observed
    .split('\n')
    .filter((line) => /\bexecve\(/.test(line))
  if (
    executions.length !== 1 ||
    !executions[0].includes(JSON.stringify(nodePath))
  )
    throw unavailable('CHILD_EXECUTION_OBSERVED')
  if (/\b(?:setsid|setpgid)\(/.test(observed))
    throw unavailable('PROCESS_GROUP_ESCAPE_OBSERVED')
  return {
    traceSha256: sha256File(trace),
    networkAttempts: 0,
    executions: executions.length
  }
}

async function seedCache(cacheSource, cache, lock, limits, npmRoot, usage) {
  // This library is inside the already validated npm TCB, never a new dependency.
  const require = createRequire(path.join(npmRoot, 'package.json'))
  const cacache = require('cacache')
  const seen = new Set()
  let compressedBytes = 0
  const payloads = []
  const missing = []
  for (const [key, value] of Object.entries(lock.packages)) {
    if (!key.includes('node_modules/') || value.link) continue
    if (
      !safe(key) ||
      !/^https:\/\/registry\.npmjs\.org\//.test(value.resolved ?? '')
    )
      throw unavailable('LOCK_NONREGISTRY_PACKAGE')
    const file = cacheFile(cacheSource, value.integrity)
    let before
    try {
      before = regular(file)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      if (value.optional !== true)
        throw unavailable('CACHE_PAYLOAD_REQUIRED_MISSING')
      // npm decides platform/optional selection with the frozen recipe. An
      // unavailable payload is never fabricated from the evaluated tree;
      // a package not installed remains explicit in the receipt inventory.
      missing.push({
        key,
        integrity: value.integrity,
        optional: true,
        reason: 'CACHE_PAYLOAD_UNAVAILABLE'
      })
      continue
    }
    if (seen.has(value.integrity)) continue
    seen.add(value.integrity)
    if (fs.realpathSync(file) !== file) throw unavailable('CACHE_ALIAS')
    compressedBytes += before.size
    if (compressedBytes > limits.maxCompressedBytes)
      throw unavailable('CACHE_BYTES_LIMIT')
    const hash512 = createHash('sha512')
    const fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW
    )
    const stream = fs.createReadStream(file, { fd, autoClose: true })
    // Only verified payloads gain an index: never inherit the source cache index.
    let readBytes = 0
    for await (const chunk of stream) {
      readBytes += chunk.length
      usage.compressedBytes += chunk.length
      if (readBytes > before.size) throw unavailable('CACHE_MUTATED')
      hash512.update(chunk)
    }
    if ('sha512-' + hash512.digest('base64') !== value.integrity)
      throw unavailable('CACHE_SRI_MISMATCH')
    const after = regular(file)
    if (
      ['dev', 'ino', 'size', 'ctimeMs', 'mtimeMs'].some(
        (k) => before[k] !== after[k]
      )
    )
      throw unavailable('CACHE_MUTATED')
    await pipeline(
      fs.createReadStream(file),
      cacache.put.stream(
        path.join(cache, '_cacache'),
        'cvg-sri:' + value.integrity,
        { integrity: value.integrity }
      )
    )
    payloads.push({ integrity: value.integrity, size: before.size })
  }
  return { compressedBytes, payloads, missing }
}

/** Internal offline recipe. testOnly can REDUCE caps and mutate actual fixtures;
 * it cannot supply a toolchain, npm command, result or production cap override. */
export async function buildInstalledReference(options) {
  const allowed = new Set([
    'sourceRoot',
    'commit',
    'outputRoot',
    'cacheSource',
    'nodePath',
    'npmRoot',
    'testOnly'
  ])
  if (!options || Object.keys(options).some((key) => !allowed.has(key)))
    throw unavailable('RUNNER_OPTIONS_INVALID')
  const { commit, testOnly } = options
  const limits = limitsFor(testOnly)
  if (!/^[a-f0-9]{40}$/.test(commit ?? '')) throw unavailable('COMMIT_REQUIRED')
  const sourceRoot = fs.realpathSync(options.sourceRoot)
  const cacheSource = fs.realpathSync(options.cacheSource)
  const outputRoot = path.resolve(options.outputRoot)
  if (exists(outputRoot)) throw unavailable('OUTPUT_ALREADY_EXISTS')
  const parent = fs.realpathSync(path.dirname(outputRoot))
  if (
    parent !== path.dirname(outputRoot) ||
    inside(sourceRoot, outputRoot) ||
    inside(cacheSource, outputRoot)
  )
    throw unavailable('OUTPUT_NOT_INDEPENDENT')
  const nodePath = options.nodePath ?? DEFAULT_NODE,
    npmRoot = options.npmRoot ?? DEFAULT_NPM
  const toolchain = fingerprintToolchain({ nodePath, npmRoot })
  if (
    process.versions.node !== toolchain.nodeVersion ||
    sha256File(process.execPath) !== toolchain.nodeSha256
  )
    throw unavailable('RUNNER_NODE_RUNTIME_MISMATCH')
  for (const [tool, pin] of Object.entries(AUXILIARY_PINS)) {
    regular(tool)
    if (sha256File(tool) !== pin) throw unavailable('AUXILIARY_PIN_MISMATCH')
  }
  fs.mkdirSync(outputRoot, { mode: 0o700 })
  const snapshot = path.join(outputRoot, 'snapshot'),
    cache = path.join(outputRoot, 'cache')
  const configRoot = path.join(outputRoot, 'config'),
    logs = path.join(outputRoot, 'logs')
  for (const dir of [
    snapshot,
    cache,
    configRoot,
    logs,
    path.join(configRoot, 'tmp')
  ])
    fs.mkdirSync(dir, { mode: 0o700 })
  for (const name of ['user.npmrc', 'global.npmrc'])
    fs.writeFileSync(path.join(configRoot, name), '', {
      flag: 'wx',
      mode: 0o600
    })
  const env = referenceEnvironment(nodePath, configRoot)
  const usage = {
    compressedBytes: 0,
    regularBytes: 0,
    entries: 0,
    maxDepth: 0,
    maxProcesses: 0,
    npmElapsedMs: 0
  }
  let sequence = 0
  const run = async (tool, args, extra = {}) => {
    if (!(tool in AUXILIARY_PINS) || sha256File(tool) !== AUXILIARY_PINS[tool])
      throw unavailable('AUXILIARY_PIN_MISMATCH')
    return runOwnedProcess(tool, args, {
      cwd: sourceRoot,
      env,
      timeoutMs: INSTALLED_IDENTITY_LIMITS.npmTimeoutMs,
      maxProcesses: limits.maxProcesses,
      stderrPath: path.join(logs, String(++sequence) + '.stderr.log'),
      ...extra
    })
  }
  const git = async (...args) =>
    (
      await run('/usr/bin/git', [
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'core.fsmonitor=false',
        ...args
      ])
    ).stdout
  try {
    if (
      (await git('rev-parse', '--verify', 'HEAD')).toString().trim() !== commit
    )
      throw unavailable('SOURCE_COMMIT_ASSERTION')
    // One owned process keeps the 8 MiB output cap of runOwnedProcess. A larger
    // listing is paged per subtree, in git order, so the union is exactly
    // `ls-tree -r` of the commit; a directory whose immediate children alone
    // exceed the cap stays refused. A page is addressed by a literal pathspec
    // (never pathspec magic) and must round-trip UTF-8, be non-empty and lie
    // under its own prefix. The SOURCE_LIMIT ceilings apply below.
    let pages = 0
    const pageLines = (buffer, prefix, direct) => {
      const text = buffer.toString('utf8')
      if (!Buffer.from(text, 'utf8').equals(buffer))
        throw unavailable('SOURCE_PATH_INVALID')
      const lines = text.split('\0').filter(Boolean)
      if (!lines.length) throw unavailable('SOURCE_TREE_PAGE_INVALID')
      for (const line of lines) {
        const name = line.slice(line.indexOf('\t') + 1)
        const rest = !prefix
          ? name
          : name.startsWith(prefix + '/')
            ? name.slice(prefix.length + 1)
            : ''
        if (!rest || (direct && rest.includes('/')))
          throw unavailable('SOURCE_TREE_PAGE_INVALID')
      }
      return lines
    }
    const listTree = async (prefix, out) => {
      if (++pages > limits.maxEntries) throw unavailable('SOURCE_LIMIT')
      try {
        const listing = prefix
          ? await git(
              '--literal-pathspecs',
              'ls-tree',
              '-r',
              '-l',
              '-z',
              commit,
              '--',
              prefix
            )
          : await git('ls-tree', '-r', '-l', '-z', commit)
        if (prefix) pageLines(listing, prefix, false)
        out.push(listing)
        return
      } catch (error) {
        if (error.code !== 'PROCESS_OUTPUT_LIMIT') throw error
      }
      const children = prefix
        ? await git(
            '--literal-pathspecs',
            'ls-tree',
            '-l',
            '-z',
            commit,
            '--',
            prefix + '/'
          )
        : await git('ls-tree', '-l', '-z', commit)
      for (const line of pageLines(children, prefix, true)) {
        const match = /^\d{6} (\w+) [a-f0-9]{40}\s+\S+\t(.+)$/.exec(line)
        if (!match) throw unavailable('SOURCE_TYPE_UNSUPPORTED')
        if (match[1] === 'tree') await listTree(match[2], out)
        else out.push(Buffer.from(line + '\0', 'utf8'))
      }
    }
    const listed = []
    await listTree('', listed)
    const rawTree = Buffer.concat(listed)
    // The whole listing round-trips UTF-8, paged or not (SPEC0243 RS03): a
    // name under an excluded prefix is still checked, never silently skipped.
    if (!Buffer.from(rawTree.toString('utf8'), 'utf8').equals(rawTree))
      throw unavailable('SOURCE_PATH_INVALID')
    const tracked = rawTree
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const match = /^(\d{6}) blob ([a-f0-9]{40})\s+(\d+)\t(.+)$/.exec(line)
        if (!match) throw unavailable('SOURCE_TYPE_UNSUPPORTED')
        const [, mode, oid, size, name] = match
        if (!safe(name)) throw unavailable('SOURCE_PATH_INVALID')
        return { mode, oid, size: Number(size), name }
      })
    // The mode check covers the complete listing, the excluded prefix and the
    // historical denylist included (SPEC0243 §3.2, RS03).
    if (tracked.some(({ mode }) => !['100644', '100755'].includes(mode)))
      throw unavailable('SOURCE_LINK_UNSUPPORTED')
    const listedFiles = tracked.filter(({ name }) => !excluded(name))
    // SPEC0243 §3.3: the static guard runs on the complete listing, before
    // validateConfigs, fingerprintResolution and the archive.
    if (
      referenceSourceExclusionConflict(
        sourceRoot,
        tracked.map(({ name }) => name)
      )
    )
      throw unavailable('SOURCE_EXCLUSION_CONFLICT')
    // Only the snapshot, its limits, its digest and the archive lose the
    // excluded prefix; the checks above covered it.
    const files = listedFiles.filter(
      ({ name }) => !referenceSourceExcluded(name)
    )
    const included = files.map(({ name }) => name).sort()
    const snapshotMatches = () => {
      const actual = snapshotFiles(snapshot, limits)
      if (
        actual.length !== included.length ||
        actual.some((name, i) => name !== included[i])
      )
        throw unavailable('SNAPSHOT_MISMATCH')
    }
    if (
      files.length > limits.maxEntries ||
      files.reduce((sum, f) => sum + f.size, 0) > limits.maxTotalBytes ||
      files.some((f) => f.name.split('/').length > limits.maxDepth)
    )
      throw unavailable('SOURCE_LIMIT')
    if (
      !files.some(({ name }) => name === 'package-lock.json') ||
      !files.some(({ name }) => name === 'package.json')
    )
      throw unavailable('SOURCE_MANIFEST_REQUIRED')
    validateConfigs(sourceRoot, files)
    const sourceSha256 = sourceDigest(sourceRoot, files)
    const resolution = fingerprintResolution(sourceRoot)
    // Explicit regular paths only. No glob expansion, checkout hooks, previous
    // installation, credential paths, or untracked working-tree data enter tar.
    for (let offset = 0; offset < files.length; offset += 100) {
      const archive = path.join(outputRoot, 'source-' + offset + '.tar')
      await run(
        '/usr/bin/git',
        [
          '--literal-pathspecs',
          'archive',
          '--format=tar',
          commit,
          '--',
          ...files.slice(offset, offset + 100).map((f) => f.name)
        ],
        {
          stdoutPath: archive,
          maxOutputBytes: limits.maxTotalBytes + 1024 * 1024
        }
      )
      await run('/usr/bin/tar', [
        '--extract',
        '--file=' + archive,
        '--directory=' + snapshot,
        '--no-same-owner',
        '--no-same-permissions'
      ])
      fs.unlinkSync(archive)
    }
    snapshotMatches()
    if (
      sourceDigest(snapshot, files) !== sourceSha256 ||
      canonicalJson(fingerprintResolution(snapshot)) !==
        canonicalJson(resolution)
    )
      throw unavailable('SNAPSHOT_MISMATCH')
    validateConfigs(snapshot, files)
    const lock = JSON.parse(
      fs.readFileSync(path.join(snapshot, 'package-lock.json'), 'utf8')
    )
    if (
      lock.lockfileVersion !== 3 ||
      !lock.packages ||
      typeof lock.packages !== 'object'
    )
      throw unavailable('LOCK_SCHEMA_UNSUPPORTED')
    const seeded = await seedCache(
      cacheSource,
      cache,
      lock,
      limits,
      npmRoot,
      usage
    )
    usage.compressedBytes = seeded.compressedBytes
    const argv = [
      path.join(npmRoot, 'bin/npm-cli.js'),
      'ci',
      '--offline',
      '--ignore-scripts',
      '--audit=false',
      '--fund=false',
      '--include=dev',
      '--include=optional',
      '--cache',
      cache
    ]
    await testOnly?.hooks?.beforeNpm?.({
      sourceRoot,
      snapshot,
      cache,
      configRoot
    })
    if (
      (await git('rev-parse', '--verify', 'HEAD')).toString().trim() !== commit
    )
      throw unavailable('SOURCE_COMMIT_ASSERTION')
    const revalidate = () => {
      for (const [tool, pin] of Object.entries(AUXILIARY_PINS))
        if (sha256File(tool) !== pin)
          throw unavailable('AUXILIARY_PIN_MISMATCH')
      if (
        sourceDigest(sourceRoot, files) !== sourceSha256 ||
        sourceDigest(snapshot, files) !== sourceSha256 ||
        canonicalJson(fingerprintResolution(sourceRoot)) !==
          canonicalJson(resolution) ||
        canonicalJson(fingerprintResolution(snapshot)) !==
          canonicalJson(resolution)
      )
        throw unavailable('INPUT_MUTATED')
      if (
        canonicalJson(fingerprintToolchain({ nodePath, npmRoot })) !==
        canonicalJson(toolchain)
      )
        throw unavailable('TOOLCHAIN_MUTATED')
      for (const name of ['user.npmrc', 'global.npmrc'])
        if (regular(path.join(configRoot, name)).size !== 0)
          throw unavailable('EMPTY_CONFIG_MUTATED')
      validateConfigs(snapshot, files)
    }
    revalidate()
    snapshotMatches()
    const trace = path.join(logs, 'npm.trace')
    const result = await run(
      '/usr/bin/strace',
      [
        '-f',
        '-qq',
        '-s',
        '256',
        '-e',
        'trace=process,network,setsid,setpgid',
        '-o',
        trace,
        nodePath,
        ...argv
      ],
      {
        cwd: snapshot,
        stdoutPath: path.join(logs, 'npm.stdout.log'),
        stderrPath: path.join(logs, 'npm.stderr.log'),
        timeoutMs: limits.npmTimeoutMs,
        resourceCheck: () => {
          if (exists(trace) && regular(trace).size > 8 * 1024 * 1024)
            throw unavailable('PROCESS_TRACE_LIMIT')
          allFiles(snapshot, limits, false, true)
        }
      }
    )
    usage.npmElapsedMs = result.elapsedMs
    usage.maxProcesses = result.maxProcesses
    const observation = inspectReferenceTrace(trace, nodePath)
    await testOnly?.hooks?.afterNpm?.({
      sourceRoot,
      snapshot,
      cache,
      configRoot
    })
    revalidate()
    const physical = allFiles(snapshot, limits)
    Object.assign(usage, {
      entries: physical.entries,
      regularBytes: physical.regularBytes,
      maxDepth: physical.maxDepth
    })
    const packages = [],
      unavailablePackages = []
    const inventoryStarted = Date.now()
    for (const entry of physical.list) {
      if (
        entry.type !== 'directory' ||
        !/(?:^|\/)node_modules\/(?:@[^/]+\/)?[^/@][^/]*$/.test(entry.path) ||
        path.posix.basename(entry.path) === '.bin'
      )
        continue
      if (!Object.hasOwn(lock.packages, entry.path))
        throw unavailable('UNLOCKED_PHYSICAL_PACKAGE')
    }
    for (const [key, item] of Object.entries(lock.packages).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    )) {
      if (Date.now() - inventoryStarted > limits.comparisonTimeoutMs)
        throw unavailable('INVENTORY_TIMEOUT')
      if (!key.includes('node_modules/') || item.link) continue
      const packageRoot = path.join(snapshot, key)
      if (!exists(packageRoot)) {
        unavailablePackages.push({
          key,
          reason: 'NOT_INSTALLED_BY_OFFLINE_RECIPE',
          optional: item.optional === true,
          peer: item.peer === true
        })
        continue
      }
      if (
        !fs.lstatSync(packageRoot).isDirectory() ||
        fs.realpathSync(packageRoot) !== packageRoot
      )
        throw unavailable('PACKAGE_ROOT_ALIAS')
      const manifestPath = path.join(packageRoot, 'package.json')
      regular(manifestPath)
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      const expectedName = item.name ?? key.split('node_modules/').at(-1)
      if (manifest.name !== expectedName || manifest.version !== item.version)
        throw unavailable('INSTALLED_PACKAGE_IDENTITY')
      const inventory = collectPackageInventory(packageRoot, {
        testOnly: { limits }
      })
      packages.push({
        key,
        name: manifest.name,
        version: manifest.version,
        entries: inventory.entries,
        nestedPackages: inventory.nestedPackages,
        usage: inventory.usage,
        inventorySha256: inventory.inventorySha256
      })
    }
    // Detect regular-byte mutations after inventory, before publishing any receipt.
    revalidate()
    if (
      canonicalJson(allFiles(snapshot, limits).list) !==
      canonicalJson(physical.list)
    )
      throw unavailable('REFERENCE_MUTATED')
    if (Date.now() - inventoryStarted > limits.comparisonTimeoutMs)
      throw unavailable('INVENTORY_TIMEOUT')
    if (
      (await git('rev-parse', '--verify', 'HEAD')).toString().trim() !== commit
    )
      throw unavailable('SOURCE_COMMIT_ASSERTION')
    if (
      canonicalJson(inspectReferenceTrace(trace, nodePath)) !==
      canonicalJson(observation)
    )
      throw unavailable('OBSERVATION_MUTATED')
    const recipe = {
      argv,
      exitCode: 0,
      offline: true,
      ignoreScripts: true,
      completed: true,
      environment: env,
      sourceSha256,
      sourceExclusions: [...REFERENCE_SOURCE_EXCLUSIONS],
      auxiliaryPins: AUXILIARY_PINS,
      cachePayloads: seeded.payloads,
      cacheUnavailable: seeded.missing,
      observation: { ...observation, ...result, stdout: undefined }
    }
    delete recipe.observation.stdout
    const receipt = {
      schemaVersion: 1,
      kind: 'cvg-installed-content-reference',
      commit,
      root: fs.realpathSync(snapshot),
      ...resolution,
      toolchain,
      toolchainSha256: hash(canonicalJson(toolchain)),
      recipe,
      selection: {
        platform: process.platform,
        arch: process.arch,
        dev: true,
        optional: true
      },
      limits,
      usage,
      packages,
      unavailable: unavailablePackages
    }
    const manifestPath = path.join(outputRoot, 'reference.json')
    const bytes = canonicalJson(receipt)
    const staged = path.join(outputRoot, '.reference.partial')
    const fd = fs.openSync(staged, 'wx', 0o600)
    try {
      fs.writeFileSync(fd, bytes)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    fs.renameSync(staged, manifestPath)
    return { manifestPath, expectedSha256: hash(bytes), receipt }
  } catch (error) {
    const failure = {
      status: 'UNAVAILABLE',
      code: /^[A-Z0-9_]+$/.test(error.code ?? '')
        ? error.code
        : 'REFERENCE_BUILD_FAILED',
      usage,
      ...(error.observation ? { observation: error.observation } : {})
    }
    fs.writeFileSync(
      path.join(outputRoot, 'failure.json'),
      canonicalJson(failure),
      { flag: 'wx', mode: 0o600 }
    )
    throw Object.assign(unavailable(failure.code), { outputRoot })
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  const names = {
    'source-root': 'sourceRoot',
    commit: 'commit',
    'output-root': 'outputRoot',
    'cache-source': 'cacheSource',
    'node-path': 'nodePath',
    'npm-root': 'npmRoot'
  }
  const options = {}
  try {
    for (const arg of process.argv.slice(2)) {
      const match = /^--([a-z-]+)=(.+)$/.exec(arg)
      if (!match || !names[match[1]] || names[match[1]] in options)
        throw unavailable('CLI_OPTIONS_INVALID')
      options[names[match[1]]] = match[2]
    }
    for (const key of ['sourceRoot', 'commit', 'outputRoot', 'cacheSource'])
      if (!options[key]) throw unavailable('CLI_OPTIONS_REQUIRED')
    const { manifestPath, expectedSha256 } =
      await buildInstalledReference(options)
    process.stdout.write(
      JSON.stringify({ manifestPath, expectedSha256 }) + '\n'
    )
  } catch (error) {
    process.stderr.write(
      JSON.stringify({
        status: 'UNAVAILABLE',
        code: error.code ?? 'REFERENCE_BUILD_FAILED'
      }) + '\n'
    )
    process.exitCode = 2
  }
}
