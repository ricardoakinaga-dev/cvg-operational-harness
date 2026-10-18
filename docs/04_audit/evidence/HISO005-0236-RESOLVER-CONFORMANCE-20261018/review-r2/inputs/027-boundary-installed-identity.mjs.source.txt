// SPEC0234: physical content identity only. No result approves semantics.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const INSTALLED_IDENTITY_LIMITS = Object.freeze({
  maxCompressedBytes: 2 * 1024 ** 3,
  maxTotalBytes: 4 * 1024 ** 3,
  maxPackageBytes: 512 * 1024 ** 2,
  maxEntries: 200_000,
  maxDepth: 64,
  maxProcesses: 8,
  npmTimeoutMs: 180_000,
  comparisonTimeoutMs: 120_000
})
const NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
const NPM = '/home/ricardo/.nvm/versions/node/v22.23.2/lib/node_modules/npm'
const NODE_SHA =
  '3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327'
const NPM_SHA =
  'a931e1d739da4bc407ffd23e6b242f20c3f7475378a0718bac03c83e7ca801ae'
const HEX = /^[a-f0-9]{64}$/
const own = (v, k) => Object.hasOwn(v, k)
const record = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const lexical = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const inside = (root, target) =>
  target === root || target.startsWith(root + path.sep)
const posix = (file) => file.split(path.sep).join('/')
const relativePath = (s) =>
  typeof s === 'string' &&
  s.length > 0 &&
  !s.includes('\\') &&
  !s.includes('\0') &&
  !path.posix.isAbsolute(s) &&
  s.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
const packageKey = (s) =>
  relativePath(s) &&
  /^(?:node_modules\/(?:@[^/]+\/)?[^@/.][^/]*)(?:\/node_modules\/(?:@[^/]+\/)?[^@/.][^/]*)*$/.test(
    s
  )
const nestedPath = (relative) =>
  /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^@/.][^/]*$/.test(relative)
function nestedBoundary(file, relative, stat) {
  if (!nestedPath(relative)) return false
  if (stat.isSymbolicLink()) return true
  if (!stat.isDirectory()) return false
  try {
    return lstat(path.join(file, 'package.json')).isFile()
  } catch (error) {
    if (error.code === 'ENOENT') return false
    throw error
  }
}

export class InstalledIdentityError extends Error {
  constructor(code, status = 'UNAVAILABLE') {
    super(code)
    this.name = 'InstalledIdentityError'
    this.code = code
    this.status = status
  }
}
const fail = (code, status) => {
  throw new InstalledIdentityError(code, status)
}
const requireValue = (condition, code = 'REFERENCE_SCHEMA_INVALID') => {
  if (!condition) fail(code)
}

// Build strings directly: JSON.stringify would reorder integer-like keys.
export function canonicalJson(value) {
  const active = new Set()
  function encode(v) {
    if (v === null || typeof v === 'string' || typeof v === 'boolean')
      return JSON.stringify(v)
    if (typeof v === 'number' && Number.isFinite(v)) return JSON.stringify(v)
    if (
      !Array.isArray(v) &&
      (!record(v) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(v)))
    )
      fail('CANONICAL_JSON_VALUE_INVALID')
    if (active.has(v)) fail('CANONICAL_JSON_CYCLE')
    active.add(v)
    const result = Array.isArray(v)
      ? '[' + Array.from(v, encode).join(',') + ']'
      : '{' +
        Object.keys(v)
          .sort(lexical)
          .map((k) => JSON.stringify(k) + ':' + encode(v[k]))
          .join(',') +
        '}'
    active.delete(v)
    return result
  }
  return encode(value) + '\n'
}

function signature(stat) {
  return ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs']
    .map((k) => String(stat[k]))
    .join(':')
}
const lstat = (file) => fs.lstatSync(file, { bigint: true })
const inode = (stat) => String(stat.dev) + ':' + String(stat.ino)

function readPhysical(
  file,
  {
    maxBytes = INSTALLED_IDENTITY_LIMITS.maxTotalBytes,
    consume,
    onChunk,
    check = () => {}
  } = {}
) {
  const before = lstat(file)
  if (!before.isFile()) fail('NOT_REGULAR_FILE', 'UNSUPPORTED')
  if (before.size > BigInt(maxBytes)) fail('LIMIT_REGULAR_BYTES', 'UNSUPPORTED')
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  )
  try {
    if (signature(before) !== signature(fs.fstatSync(fd, { bigint: true })))
      fail('FILE_CHANGED_DURING_READ')
    const digest = createHash('sha256')
    const buffer = Buffer.allocUnsafe(64 * 1024)
    let bytes = 0
    for (;;) {
      check()
      const length = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (!length) break
      bytes += length
      if (bytes > maxBytes) fail('LIMIT_REGULAR_BYTES', 'UNSUPPORTED')
      const chunk = buffer.subarray(0, length)
      digest.update(chunk)
      consume?.(chunk)
      onChunk?.({ file, bytes })
    }
    if (
      BigInt(bytes) !== before.size ||
      signature(before) !== signature(fs.fstatSync(fd, { bigint: true })) ||
      signature(before) !== signature(lstat(file))
    )
      fail('FILE_CHANGED_DURING_READ')
    return {
      sha256: digest.digest('hex'),
      size: bytes,
      executableBits: Number(before.mode & 0o111n),
      stat: before
    }
  } finally {
    fs.closeSync(fd)
  }
}

export function sha256File(file) {
  return readPhysical(file).sha256
}
function readJson(file, maxBytes = 16 * 1024 ** 2) {
  const chunks = []
  readPhysical(file, {
    maxBytes,
    consume: (chunk) => chunks.push(Buffer.from(chunk))
  })
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    fail('JSON_INVALID')
  }
}

function physicalDirectory(dir) {
  if (!lstat(dir).isDirectory() || fs.realpathSync(dir) !== path.resolve(dir))
    fail('DIRECTORY_ALIAS', 'UNSUPPORTED')
}
function safeFile(root, relative) {
  const file = path.join(root, relative)
  if (!inside(root, file) || fs.realpathSync(file) !== file)
    fail('PATH_ALIAS', 'UNSUPPORTED')
  return file
}

export function fingerprintResolution(inputRoot) {
  const root = fs.realpathSync(inputRoot)
  physicalDirectory(root)
  const snapshots = new Map()
  const remember = (file) => {
    const before = signature(lstat(file))
    if (snapshots.has(file) && snapshots.get(file) !== before)
      fail('RESOLUTION_INPUT_RACE')
    snapshots.set(file, before)
  }
  const files = new Set(['package.json'])
  remember(path.join(root, 'package.json'))
  const rootManifest = readJson(safeFile(root, 'package.json'))
  requireValue(record(rootManifest), 'RESOLUTION_MANIFEST_INVALID')
  const workspaces =
    rootManifest.workspaces === undefined
      ? []
      : Array.isArray(rootManifest.workspaces)
        ? rootManifest.workspaces
        : rootManifest.workspaces?.packages
  requireValue(Array.isArray(workspaces), 'WORKSPACES_UNSUPPORTED')
  let visited = 0
  function expand(base, segments, depth = 0) {
    remember(base)
    if (
      ++visited > INSTALLED_IDENTITY_LIMITS.maxEntries ||
      depth > INSTALLED_IDENTITY_LIMITS.maxDepth
    )
      fail('RESOLUTION_LIMIT', 'UNSUPPORTED')
    if (!segments.length) {
      const relative = posix(path.relative(root, base))
      if (fs.existsSync(path.join(base, 'package.json')))
        files.add((relative ? relative + '/' : '') + 'package.json')
      return
    }
    const [head, ...tail] = segments
    if (head === '**') expand(base, tail, depth + 1)
    const pattern = new RegExp(
      '^' +
        head
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.') +
        '$'
    )
    for (const name of fs.readdirSync(base).sort(lexical)) {
      if (['node_modules', 'dist', '.git'].includes(name)) continue
      if (!pattern.test(name) && head !== '**') continue
      const full = path.join(base, name)
      const stat = lstat(full)
      if (stat.isSymbolicLink()) fail('WORKSPACE_ALIAS', 'UNSUPPORTED')
      if (stat.isDirectory())
        expand(full, head === '**' ? segments : tail, depth + 1)
    }
  }
  for (const pattern of workspaces) {
    requireValue(
      relativePath(pattern) && !/[!{}[\]]/.test(pattern),
      'WORKSPACES_UNSUPPORTED'
    )
    expand(root, pattern.split('/'))
  }
  const entries = []
  for (const file of [...files].sort(lexical)) {
    remember(path.join(root, file))
    entries.push({ path: file, sha256: sha256File(safeFile(root, file)) })
    const config = path.posix.join(path.posix.dirname(file), '.npmrc')
    remember(path.dirname(path.join(root, config)))
    try {
      if (!lstat(path.join(root, config)).isFile())
        fail('CONFIG_NOT_REGULAR', 'UNSUPPORTED')
      remember(path.join(root, config))
      entries.push({ path: config, sha256: sha256File(safeFile(root, config)) })
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      entries.push({ path: config, absent: true })
    }
  }
  entries.sort((a, b) => lexical(a.path, b.path))
  remember(path.join(root, 'package-lock.json'))
  const lockSha256 = sha256File(safeFile(root, 'package-lock.json'))
  for (const [file, before] of snapshots)
    if (before !== signature(lstat(file))) fail('RESOLUTION_INPUT_RACE')
  return {
    lockSha256,
    configSha256: hash(canonicalJson(entries))
  }
}

export function fingerprintToolchain({ nodePath = NODE, npmRoot = NPM } = {}) {
  requireValue(
    typeof nodePath === 'string' &&
      path.isAbsolute(nodePath) &&
      typeof npmRoot === 'string' &&
      path.isAbsolute(npmRoot),
    'TOOLCHAIN_PATH_INVALID'
  )
  physicalDirectory(npmRoot)
  if (fs.realpathSync(nodePath) !== nodePath) fail('TOOLCHAIN_ALIAS')
  const started = performance.now()
  const check = () => {
    if (
      performance.now() - started >=
      INSTALLED_IDENTITY_LIMITS.comparisonTimeoutMs
    )
      fail('TOOLCHAIN_TIMEOUT')
  }
  const nodeFile = readPhysical(nodePath, { check })
  const nodeSha256 = nodeFile.sha256
  if (nodeSha256 !== NODE_SHA) fail('TOOLCHAIN_NODE_PIN_MISMATCH')
  const npmPackage = readJson(path.join(npmRoot, 'package.json'))
  requireValue(
    npmPackage.name === 'npm' && npmPackage.version === '10.9.8',
    'TOOLCHAIN_NPM_VERSION_MISMATCH'
  )
  const entries = []
  const snapshots = []
  const fileSnapshots = [{ file: nodePath, stat: nodeFile.stat }]
  let count = 0,
    totalBytes = 0
  function walk(dir, depth = 0) {
    check()
    if (depth > 64) fail('TOOLCHAIN_LIMIT')
    const before = lstat(dir)
    const names = fs.readdirSync(dir).sort(lexical)
    snapshots.push({ dir, before, names })
    for (const name of names) {
      check()
      if (++count > INSTALLED_IDENTITY_LIMITS.maxEntries)
        fail('TOOLCHAIN_LIMIT')
      const file = path.join(dir, name)
      const stat = lstat(file)
      if (stat.isDirectory()) walk(file, depth + 1)
      else if (stat.isFile()) {
        const result = readPhysical(file, {
          check,
          maxBytes: INSTALLED_IDENTITY_LIMITS.maxTotalBytes - totalBytes
        })
        totalBytes += result.size
        fileSnapshots.push({ file, stat: result.stat })
        entries.push({
          path: posix(path.relative(npmRoot, file)),
          type: 'file',
          sha256: result.sha256,
          executableBits: result.executableBits
        })
      } else fail('TOOLCHAIN_UNSUPPORTED_TYPE')
      if (entries.length > INSTALLED_IDENTITY_LIMITS.maxEntries)
        fail('TOOLCHAIN_LIMIT')
    }
  }
  walk(npmRoot)
  for (const snapshot of fileSnapshots) {
    check()
    if (signature(snapshot.stat) !== signature(lstat(snapshot.file)))
      fail('TOOLCHAIN_CHANGED')
  }
  for (const snapshot of snapshots) {
    if (
      signature(snapshot.before) !== signature(lstat(snapshot.dir)) ||
      canonicalJson(snapshot.names) !==
        canonicalJson(fs.readdirSync(snapshot.dir).sort(lexical))
    )
      fail('TOOLCHAIN_CHANGED')
  }
  // The trusted preparation used pathlib path ordering (component tuples).
  // Reproduce that exact aggregate; string sorting changes cli/ vs cli.js.
  entries.sort((a, b) => {
    const left = a.path.split('/'),
      right = b.path.split('/')
    for (let i = 0; i < Math.min(left.length, right.length); i++) {
      const order = lexical(left[i], right[i])
      if (order) return order
    }
    return left.length - right.length
  })
  const npmTreeSha256 = hash(canonicalJson(entries).slice(0, -1))
  if (npmTreeSha256 !== NPM_SHA) fail('TOOLCHAIN_NPM_PIN_MISMATCH')
  return {
    nodePath,
    nodeVersion: '22.23.2',
    nodeSha256,
    npmRoot,
    npmVersion: npmPackage.version,
    npmTreeSha256
  }
}

function collectionLimits(options) {
  const limits = { ...INSTALLED_IDENTITY_LIMITS }
  if (options.testOnly?.limits) {
    for (const [key, value] of Object.entries(options.testOnly.limits)) {
      requireValue(
        own(limits, key) &&
          Number.isSafeInteger(value) &&
          value >= 0 &&
          value <= limits[key],
        'TEST_LIMIT_INVALID'
      )
      limits[key] = value
    }
  }
  return limits
}

export function collectPackageInventory(packageRoot, options = {}) {
  const limits = collectionLimits(options)
  const hooks = options.testOnly?.hooks ?? {}
  const root = path.resolve(packageRoot)
  const entries = [],
    nestedPackages = [],
    snapshots = [],
    inodes = new Set()
  const usage = { entries: 0, regularBytes: 0, maxDepth: 0 }
  const started = performance.now()
  const deadline = Math.min(
    started + limits.comparisonTimeoutMs,
    options._deadline ?? Infinity
  )
  const inventory = { entries, nestedPackages, usage }
  const check = () => {
    if (performance.now() >= deadline) fail('COMPARISON_TIMEOUT')
  }
  function visit(file, relative, depth) {
    check()
    if (depth > limits.maxDepth) fail('LIMIT_DEPTH', 'UNSUPPORTED')
    usage.maxDepth = Math.max(usage.maxDepth, depth)
    const stat = lstat(file)
    hooks.afterLstat?.({ file, relative, stat })
    if (relative && ++usage.entries > limits.maxEntries)
      fail('LIMIT_ENTRIES', 'UNSUPPORTED')
    const snapshot = { file, stat }
    snapshots.push(snapshot)
    const nested = relative && nestedBoundary(file, relative, stat)
    if (nested) nestedPackages.push(relative)
    if (stat.isFile()) {
      const remaining =
        Math.min(limits.maxPackageBytes, limits.maxTotalBytes) -
        usage.regularBytes
      const result = readPhysical(file, {
        maxBytes: remaining,
        onChunk: hooks.afterChunk,
        check
      })
      usage.regularBytes += result.size
      inodes.add(inode(stat))
      entries.push({
        path: relative,
        type: 'file',
        size: result.size,
        sha256: result.sha256,
        executableBits: result.executableBits
      })
    } else if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(file)
      let resolution
      try {
        resolution = fs.realpathSync(file)
      } catch {
        entries.push({ path: relative, type: 'link', target, resolution: null })
        fail('LINK_UNRESOLVED', 'UNSUPPORTED')
      }
      snapshot.target = target
      snapshot.resolution = resolution
      entries.push({ path: relative, type: 'link', target, resolution })
      if (!inside(root, resolution)) fail('LINK_EXTERNAL', 'UNSUPPORTED')
    } else if (stat.isDirectory()) {
      if (relative) entries.push({ path: relative, type: 'directory' })
      // A nested installation is an explicit successor, never an exclusion.
      if (nested) return
      const names = fs.readdirSync(file).sort(lexical)
      snapshot.names = names
      for (const name of names)
        visit(
          path.join(file, name),
          relative ? relative + '/' + name : name,
          depth + 1
        )
    } else fail('SPECIAL_FILE', 'UNSUPPORTED')
  }
  try {
    physicalDirectory(root)
    visit(root, '', 0)
    hooks.beforeRevalidate?.({ root })
    for (const snapshot of snapshots) {
      check()
      if (signature(snapshot.stat) !== signature(lstat(snapshot.file)))
        fail('INVENTORY_CHANGED')
      if (
        snapshot.names &&
        canonicalJson(snapshot.names) !==
          canonicalJson(fs.readdirSync(snapshot.file).sort(lexical))
      )
        fail('DIRECTORY_CHANGED')
      if (
        snapshot.target !== undefined &&
        (fs.readlinkSync(snapshot.file) !== snapshot.target ||
          fs.realpathSync(snapshot.file) !== snapshot.resolution)
      )
        fail('LINK_CHANGED')
    }
    entries.sort((a, b) => lexical(a.path, b.path))
    nestedPackages.sort(lexical)
    inventory.inventorySha256 = hash(canonicalJson(inventory))
    Object.defineProperties(inventory, {
      _inodes: { value: inodes },
      _snapshots: {
        value: snapshots.map((s) => ({
          path: posix(path.relative(root, s.file)),
          signature: signature(s.stat)
        }))
      }
    })
    return inventory
  } catch (cause) {
    const error =
      cause instanceof InstalledIdentityError
        ? cause
        : new InstalledIdentityError('INVENTORY_IO_ERROR')
    // An unsupported early entry cannot hide later physical successors.
    // This pass never follows links or reads payloads; refusal remains final.
    let count = 0,
      complete = true
    function discover(dir, relative, depth) {
      if (
        performance.now() >= deadline ||
        depth > limits.maxDepth ||
        count >= limits.maxEntries
      ) {
        complete = false
        return
      }
      let names, before
      try {
        before = lstat(dir)
        names = fs.readdirSync(dir).sort(lexical)
      } catch {
        complete = false
        return
      }
      for (const name of names) {
        if (++count > limits.maxEntries || performance.now() >= deadline) {
          complete = false
          break
        }
        const file = path.join(dir, name),
          child = relative ? relative + '/' + name : name
        try {
          const stat = lstat(file)
          if (nestedBoundary(file, child, stat)) {
            if (!nestedPackages.includes(child)) nestedPackages.push(child)
          } else if (stat.isDirectory()) discover(file, child, depth + 1)
          else if (stat.isSymbolicLink() && name === 'node_modules')
            complete = false
        } catch {
          complete = false
        }
      }
      try {
        if (
          signature(before) !== signature(lstat(dir)) ||
          canonicalJson(names) !==
            canonicalJson(fs.readdirSync(dir).sort(lexical))
        )
          complete = false
      } catch {
        complete = false
      }
    }
    try {
      physicalDirectory(root)
      discover(root, '', 0)
    } catch {
      complete = false
    }
    nestedPackages.sort(lexical)
    inventory.partial = true
    inventory.frontierComplete = complete
    error.frontierComplete = complete
    error.inventory = inventory
    throw error
  }
}

function measured(value) {
  return (
    record(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((n) => Number.isFinite(n) && n >= 0)
  )
}
function validateInventory(pkg) {
  requireValue(
    Array.isArray(pkg.entries) &&
      Array.isArray(pkg.nestedPackages) &&
      measured(pkg.usage) &&
      HEX.test(pkg.inventorySha256)
  )
  requireValue(pkg.entries.length <= INSTALLED_IDENTITY_LIMITS.maxEntries)
  requireValue(
    Number.isSafeInteger(pkg.usage.maxDepth) &&
      pkg.usage.maxDepth >= 0 &&
      pkg.usage.maxDepth <= INSTALLED_IDENTITY_LIMITS.maxDepth
  )
  let previous = '',
    regularBytes = 0
  for (const entry of pkg.entries) {
    requireValue(
      record(entry) &&
        relativePath(entry.path) &&
        lexical(previous, entry.path) < 0
    )
    requireValue(
      entry.path.split('/').length <= INSTALLED_IDENTITY_LIMITS.maxDepth
    )
    previous = entry.path
    if (entry.type === 'file') {
      requireValue(
        Number.isSafeInteger(entry.size) &&
          entry.size >= 0 &&
          HEX.test(entry.sha256) &&
          Number.isInteger(entry.executableBits) &&
          (entry.executableBits & ~0o111) === 0
      )
      regularBytes += entry.size
    } else if (entry.type === 'link')
      requireValue(
        typeof entry.target === 'string' &&
          typeof entry.resolution === 'string' &&
          path.isAbsolute(entry.resolution)
      )
    else requireValue(entry.type === 'directory')
    const allowed =
      entry.type === 'file'
        ? ['path', 'type', 'size', 'sha256', 'executableBits']
        : entry.type === 'link'
          ? ['path', 'type', 'target', 'resolution']
          : ['path', 'type']
    requireValue(Object.keys(entry).every((key) => allowed.includes(key)))
  }
  requireValue(
    regularBytes <= INSTALLED_IDENTITY_LIMITS.maxPackageBytes &&
      regularBytes === pkg.usage.regularBytes &&
      pkg.usage.entries === pkg.entries.length
  )
  requireValue(
    pkg.nestedPackages.every(
      (p, i, list) =>
        relativePath(p) &&
        /(?:^|\/)node_modules\/(?:@[^/]+\/)?[^@/.][^/]*$/.test(p) &&
        (!i || lexical(list[i - 1], p) < 0)
    )
  )
  requireValue(
    pkg.inventorySha256 ===
      hash(
        canonicalJson({
          entries: pkg.entries,
          nestedPackages: pkg.nestedPackages,
          usage: pkg.usage
        })
      ),
    'REFERENCE_INVENTORY_DIGEST_INVALID'
  )
}

function readReceipt(manifestPath, expectedSha256) {
  const chunks = []
  readPhysical(manifestPath, {
    maxBytes: 256 * 1024 ** 2,
    consume: (chunk) => chunks.push(Buffer.from(chunk))
  })
  const bytes = Buffer.concat(chunks)
  if (hash(bytes) !== expectedSha256) fail('REFERENCE_DIGEST_MISMATCH')
  let receipt
  try {
    receipt = JSON.parse(bytes.toString('utf8'))
  } catch {
    fail('REFERENCE_JSON_INVALID')
  }
  if (!Buffer.from(canonicalJson(receipt)).equals(bytes))
    fail('REFERENCE_NOT_CANONICAL')
  const r = receipt
  requireValue(
    record(r) &&
      r.schemaVersion === 1 &&
      r.kind === 'cvg-installed-content-reference'
  )
  for (const key of [
    'commit',
    'root',
    'lockSha256',
    'configSha256',
    'toolchain',
    'toolchainSha256',
    'recipe',
    'selection',
    'limits',
    'usage',
    'packages'
  ])
    requireValue(own(r, key))
  requireValue(
    typeof r.commit === 'string' && /^[a-f0-9]{40,64}$/.test(r.commit)
  )
  requireValue(
    typeof r.root === 'string' &&
      path.isAbsolute(r.root) &&
      HEX.test(r.lockSha256) &&
      HEX.test(r.configSha256) &&
      HEX.test(r.toolchainSha256) &&
      record(r.toolchain)
  )
  const recipe = r.recipe
  requireValue(
    record(recipe) &&
      recipe.exitCode === 0 &&
      recipe.offline === true &&
      recipe.ignoreScripts === true &&
      recipe.completed === true &&
      Array.isArray(recipe.argv) &&
      recipe.argv.every((a) => typeof a === 'string')
  )
  const required = [
    'ci',
    '--offline',
    '--ignore-scripts',
    '--audit=false',
    '--fund=false',
    '--include=dev',
    '--include=optional'
  ]
  requireValue(
    required.every((arg) => recipe.argv.includes(arg)) &&
      !recipe.argv.some((arg) =>
        /^(--force|--online|--offline=false|--ignore-scripts=false)(=|$)/.test(
          arg
        )
      ),
    'REFERENCE_RECIPE_INVALID'
  )
  const cacheArg = recipe.argv.findIndex((arg) => arg === '--cache')
  requireValue(
    cacheArg >= 0 &&
      typeof recipe.argv[cacheArg + 1] === 'string' &&
      path.isAbsolute(recipe.argv[cacheArg + 1]),
    'REFERENCE_CACHE_INVALID'
  )
  // Recipe fields cannot override its offline/no-lifecycle claims later in argv.
  // An optional leading npm CLI path is recorded by the runner.
  const command = recipe.argv.indexOf('ci')
  requireValue(
    command === 0 ||
      (command === 1 &&
        recipe.argv[0] ===
          path.join(r.toolchain.npmRoot ?? '', 'bin/npm-cli.js')),
    'REFERENCE_RECIPE_INVALID'
  )
  const flags = new Set([
    ...required.filter((arg) => arg !== 'ci'),
    '--update-notifier=false'
  ])
  const seenFlags = new Set()
  for (let i = command + 1; i < recipe.argv.length; i++) {
    const arg = recipe.argv[i]
    requireValue(!seenFlags.has(arg), 'REFERENCE_RECIPE_INVALID')
    seenFlags.add(arg)
    if (arg === '--cache') {
      i++
      continue
    }
    requireValue(flags.has(arg), 'REFERENCE_RECIPE_INVALID')
  }
  requireValue(
    record(r.selection) &&
      r.selection.platform === process.platform &&
      r.selection.arch === process.arch &&
      r.selection.dev === true &&
      r.selection.optional === true
  )
  requireValue(
    canonicalJson(r.limits) === canonicalJson(INSTALLED_IDENTITY_LIMITS),
    'REFERENCE_LIMITS_INVALID'
  )
  requireValue(measured(r.usage) && Array.isArray(r.packages))
  for (const [key, cap] of Object.entries({
    compressedBytes: INSTALLED_IDENTITY_LIMITS.maxCompressedBytes,
    regularBytes: INSTALLED_IDENTITY_LIMITS.maxTotalBytes,
    entries: INSTALLED_IDENTITY_LIMITS.maxEntries,
    maxDepth: INSTALLED_IDENTITY_LIMITS.maxDepth,
    maxProcesses: INSTALLED_IDENTITY_LIMITS.maxProcesses,
    npmElapsedMs: INSTALLED_IDENTITY_LIMITS.npmTimeoutMs
  }))
    if (own(r.usage, key))
      requireValue(r.usage[key] <= cap, 'REFERENCE_USAGE_LIMIT')
  requireValue(
    r.toolchainSha256 === hash(canonicalJson(r.toolchain)),
    'REFERENCE_TOOLCHAIN_DIGEST_INVALID'
  )
  let previous = '',
    entries = 0,
    bytesTotal = 0
  for (const pkg of r.packages) {
    requireValue(
      record(pkg) &&
        packageKey(pkg.key) &&
        lexical(previous, pkg.key) < 0 &&
        typeof pkg.name === 'string' &&
        pkg.name.length > 0 &&
        typeof pkg.version === 'string' &&
        pkg.version.length > 0
    )
    previous = pkg.key
    validateInventory(pkg)
    entries += pkg.entries.length
    bytesTotal += pkg.usage.regularBytes
  }
  requireValue(
    entries <= INSTALLED_IDENTITY_LIMITS.maxEntries &&
      bytesTotal <= INSTALLED_IDENTITY_LIMITS.maxTotalBytes,
    'REFERENCE_TOTAL_LIMIT'
  )
  return r
}

function sameInventory(a, b) {
  return (
    a.inventorySha256 === b.inventorySha256 &&
    canonicalJson(a._snapshots) === canonicalJson(b._snapshots)
  )
}
function normalizedEntries(inventory, packageRoot) {
  return inventory.entries.map((entry) =>
    entry.type === 'link'
      ? {
          ...entry,
          resolution: posix(path.relative(packageRoot, entry.resolution))
        }
      : entry
  )
}
function differences(reference, evaluated, referenceRoot, evaluatedRoot) {
  const a = new Map(
    normalizedEntries(reference, referenceRoot).map((e) => [e.path, e])
  )
  const b = new Map(
    normalizedEntries(evaluated, evaluatedRoot).map((e) => [e.path, e])
  )
  const diffs = []
  for (const file of [...new Set([...a.keys(), ...b.keys()])].sort(lexical)) {
    if (!a.has(file)) diffs.push({ path: file, reason: 'EXTRA' })
    else if (!b.has(file)) diffs.push({ path: file, reason: 'MISSING' })
    else if (canonicalJson(a.get(file)) !== canonicalJson(b.get(file)))
      diffs.push({ path: file, reason: 'CONTENT_TYPE_OR_MODE' })
  }
  if (
    canonicalJson(reference.nestedPackages) !==
    canonicalJson(evaluated.nestedPackages)
  )
    diffs.push({ path: 'node_modules', reason: 'NESTED_PACKAGES' })
  return diffs
}

export function createInstalledIdentityComparator(evaluatedRoot, options) {
  if (
    !record(options) ||
    typeof options.manifestPath !== 'string' ||
    options.manifestPath.length === 0 ||
    typeof options.expectedSha256 !== 'string' ||
    !HEX.test(options.expectedSha256)
  )
    throw new TypeError('INVALID_INSTALLED_REFERENCE_OPTIONS')
  const expectedSha256 = options.expectedSha256
  const manifestPath = path.resolve(options.manifestPath)
  if (!lstat(manifestPath).isFile())
    throw new TypeError('INSTALLED_REFERENCE_NOT_REGULAR')
  const root = fs.realpathSync(evaluatedRoot)
  const receipt = readReceipt(manifestPath, expectedSha256)
  const referenceRoot = receipt.root
  physicalDirectory(referenceRoot)
  if (inside(root, referenceRoot) || inside(referenceRoot, root))
    fail('REFERENCE_ROOT_SELF_ALIAS')
  const started = performance.now()
  const used = [],
    outputs = []
  const evaluatedInodes = new Set(),
    referenceInodes = new Set(),
    unique = new Map()
  let invalid = null
  function checkTime() {
    if (
      performance.now() - started >=
      INSTALLED_IDENTITY_LIMITS.comparisonTimeoutMs
    )
      fail('COMPARISON_TIMEOUT')
  }
  function collect(source) {
    checkTime()
    let entries = 0,
      bytes = 0
    for (const [file, saved] of unique) {
      if (file !== source) {
        entries += saved.entries
        bytes += saved.regularBytes
      }
    }
    const collectOptions = {
      _deadline: started + INSTALLED_IDENTITY_LIMITS.comparisonTimeoutMs,
      testOnly: {
        limits: {
          maxEntries: Math.max(
            0,
            INSTALLED_IDENTITY_LIMITS.maxEntries - entries
          ),
          maxTotalBytes: Math.max(
            0,
            INSTALLED_IDENTITY_LIMITS.maxTotalBytes - bytes
          )
        }
      }
    }
    try {
      const inventory = collectPackageInventory(source, collectOptions)
      unique.set(source, inventory.usage)
      return inventory
    } catch (error) {
      // Failed collection still consumed part of this physical inventory.
      // A later package cannot regain that budget by starting a fresh call.
      if (error.inventory) unique.set(source, error.inventory.usage)
      throw error
    }
  }
  function validateInputs() {
    checkTime()
    if (
      fs.realpathSync(evaluatedRoot) !== root ||
      fs.realpathSync(referenceRoot) !== referenceRoot
    )
      fail('ROOT_CHANGED')
    physicalDirectory(root)
    physicalDirectory(referenceRoot)
    readReceipt(manifestPath, expectedSha256)
    for (const source of [root, referenceRoot]) {
      const fingerprint = fingerprintResolution(source)
      if (
        fingerprint.lockSha256 !== receipt.lockSha256 ||
        fingerprint.configSha256 !== receipt.configSha256
      )
        fail('RESOLUTION_CHANGED')
    }
  }
  validateInputs()
  const toolchain = fingerprintToolchain({
    nodePath: receipt.toolchain.nodePath,
    npmRoot: receipt.toolchain.npmRoot
  })
  if (canonicalJson(toolchain) !== canonicalJson(receipt.toolchain))
    fail('TOOLCHAIN_CHANGED')
  const lock = readJson(path.join(root, 'package-lock.json'))
  requireValue(record(lock.packages), 'LOCK_PACKAGES_INVALID')
  const packages = new Map(receipt.packages.map((pkg) => [pkg.key, pkg]))
  function invalidate(code) {
    invalid = code
    for (const result of outputs) {
      result.status = 'UNAVAILABLE'
      if (!result.reasons.includes(code)) result.reasons.push(code)
    }
  }
  function compare(context, key) {
    const result = {
      status: 'UNAVAILABLE',
      referenceDigest: expectedSha256,
      inventory: { reference: null, evaluated: null },
      diffs: [],
      reasons: [],
      nestedPackages: []
    }
    outputs.push(result)
    if (invalid) {
      result.reasons.push(invalid)
      return result
    }
    try {
      checkTime()
      if (!packageKey(key) || path.resolve(context) !== path.join(root, key))
        fail('PACKAGE_CONTEXT_INVALID')
      const locked = own(lock.packages, key) ? lock.packages[key] : undefined
      const expected = packages.get(key)
      // Missing reference must not erase the actual package inventory.
      const evaluated = collect(context)
      result.inventory.evaluated = evaluated
      result.nestedPackages = [...evaluated.nestedPackages]
      if (!expected) {
        result.reasons.push('REFERENCE_PACKAGE_UNAVAILABLE')
        return result
      }
      const referencePackage = path.join(referenceRoot, key)
      const reference = collect(referencePackage)
      result.inventory.reference = reference
      for (const [inventory, target, opposite] of [
        [evaluated, evaluatedInodes, referenceInodes],
        [reference, referenceInodes, evaluatedInodes]
      ]) {
        for (const id of inventory._inodes) {
          if (opposite.has(id)) fail('REFERENCE_HARDLINK_SELF_ALIAS')
          target.add(id)
        }
      }
      used.push({ context, referencePackage, reference, evaluated })
      if (reference.inventorySha256 !== expected.inventorySha256)
        fail('REFERENCE_PACKAGE_CHANGED')
      result.diffs = differences(
        reference,
        evaluated,
        referencePackage,
        context
      )
      let actualManifest
      try {
        actualManifest = readJson(path.join(context, 'package.json'))
      } catch (error) {
        if (
          !['ENOENT', 'NOT_REGULAR_FILE', 'JSON_INVALID'].includes(error.code)
        )
          throw error
        result.reasons.push('INSTALLED_MANIFEST_INVALID')
      }
      const referenceManifest = readJson(
        path.join(referencePackage, 'package.json')
      )
      const keyName = key.slice(key.lastIndexOf('node_modules/') + 13)
      requireValue(
        record(locked) &&
          locked.link !== true &&
          typeof locked.version === 'string' &&
          typeof locked.resolved === 'string' &&
          locked.resolved.startsWith('https://') &&
          typeof locked.integrity === 'string' &&
          /^sha512-[A-Za-z0-9+/]{86}==$/.test(locked.integrity) &&
          Buffer.from(locked.integrity.slice(7), 'base64').toString(
            'base64'
          ) === locked.integrity.slice(7),
        'LOCK_PACKAGE_UNAVAILABLE'
      )
      if (
        expected.name !== (locked.name ?? keyName) ||
        expected.version !== locked.version ||
        referenceManifest.name !== expected.name ||
        referenceManifest.version !== expected.version
      )
        fail('REFERENCE_PACKAGE_IDENTITY_INVALID')
      if (
        !record(actualManifest) ||
        actualManifest.name !== expected.name ||
        actualManifest.version !== expected.version
      )
        result.diffs.push({ path: 'package.json', reason: 'PACKAGE_IDENTITY' })
      result.status = result.diffs.length ? 'MISMATCH' : 'MATCH'
    } catch (error) {
      result.status = error.status ?? 'UNAVAILABLE'
      const code =
        error instanceof InstalledIdentityError
          ? error.code
          : 'COMPARISON_IO_ERROR'
      result.reasons.push(code)
      if (error.inventory) {
        result.inventory.partial = error.inventory
        result.nestedPackages = [
          ...new Set([
            ...result.nestedPackages,
            ...error.inventory.nestedPackages
          ])
        ]
        if (error.frontierComplete === false)
          result.reasons.push('NESTED_FRONTIER_INCOMPLETE')
      }
      if (
        code === 'REFERENCE_HARDLINK_SELF_ALIAS' ||
        code === 'REFERENCE_PACKAGE_CHANGED'
      )
        invalidate(code)
    }
    return result
  }
  function finalize() {
    try {
      validateInputs()
      for (const snapshot of used) {
        checkTime()
        if (
          !sameInventory(snapshot.evaluated, collect(snapshot.context)) ||
          !sameInventory(snapshot.reference, collect(snapshot.referencePackage))
        )
          fail('PACKAGE_CHANGED_AFTER_COMPARISON')
      }
      checkTime()
      validateInputs()
      if (
        canonicalJson(
          fingerprintToolchain({
            nodePath: toolchain.nodePath,
            npmRoot: toolchain.npmRoot
          })
        ) !== canonicalJson(toolchain)
      )
        fail('TOOLCHAIN_CHANGED')
      checkTime()
    } catch (error) {
      invalidate(
        error instanceof InstalledIdentityError
          ? error.code
          : 'FINAL_REVALIDATION_IO_ERROR'
      )
    }
    return {
      status: invalid ? 'UNAVAILABLE' : 'COMPLETE',
      reasons: invalid ? [invalid] : [],
      usage: { packages: used.length, elapsedMs: performance.now() - started }
    }
  }
  return { compare, finalize }
}
