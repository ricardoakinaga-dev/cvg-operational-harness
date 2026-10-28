// SPEC0237: resolution and physical premises only. Never load target modules.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { isBuiltin } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const RESOLUTION_PROFILE = 'node22-linux-exact-metadata-v1'
// Negative-only session with the v2 metadata refusals. Its snapshot can never
// satisfy RESOLUTION_PROFILE revalidation, so it is never proof authority.
export const REFUSAL_CENSUS_PROFILE = 'node22-linux-v2-refusal-census-v1'
export const RESOLUTION_LIMITS = Object.freeze({
  maxWorkspaces: 512,
  maxLinks: 512,
  maxLinkBytes: 4096,
  maxPathComponents: 64,
  maxOpenDescriptors: 72
})
const HARD = Object.freeze({
  maxFileBytes: 16 * 1024 ** 2,
  maxTotalBytes: 256 * 1024 ** 2,
  maxFiles: 12000
})
// The engine passes its frozen hard acquisition/interpreter envelope. Only
// acquisition and the five resolution caps are consumed by this helper; the
// interpreter values mirror SEMANTIC_LIMITS (SPEC0242 L1/L2) as ceilings.
const INTERPRETER = Object.freeze({
  maxNodes: 2000000,
  maxUnionValues: 128,
  maxContexts: 256,
  maxCallDepth: 64,
  maxStates: 250000,
  timeoutMs: 300000
})
const hash = (v) => createHash('sha256').update(v).digest('hex')
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const encode = (v) => JSON.stringify(v)
const fail = (reason, file = '') => {
  const error = Error(reason + (file ? ':' + file : ''))
  if (file) error.file = file
  throw error
}
const generation = (s) =>
  Object.fromEntries(
    [
      'dev',
      'ino',
      'mode',
      'nlink',
      'uid',
      'gid',
      'size',
      'mtimeNs',
      'ctimeNs'
    ].map((key) => [key, String(s[key])])
  )
const same = (a, b) => encode(a) === encode(b)
function utf8(bytes, file) {
  // Buffer roundtrip rejects lone surrogates as well as malformed byte strings.
  const text = bytes.toString('utf8')
  if (!Buffer.from(text).equals(bytes) || /[\u0000-\u001f\u007f]/.test(text))
    fail('UNKNOWN_METADATA_ENCODING', file)
  return text
}
function textFile(bytes, file) {
  const text = bytes.toString('utf8')
  if (!Buffer.from(text).equals(bytes)) fail('UNKNOWN_INPUT_ENCODING', file)
  return text
}
function limitsFor(input) {
  const result = { ...HARD, ...RESOLUTION_LIMITS }
  if (input === undefined) return result
  if (!object(input)) fail('UNKNOWN_INVALID_LIMITS')
  for (const [key, value] of Object.entries(input)) {
    const ceiling = result[key] ?? INTERPRETER[key]
    if (
      ceiling === undefined ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > ceiling
    )
      fail('UNKNOWN_INVALID_LIMITS')
    if (Object.hasOwn(result, key)) result[key] = value
  }
  return result
}
const component = (v) =>
  typeof v === 'string' &&
  v.length > 0 &&
  !/[\\/\u0000-\u001f\u007f]/.test(v) &&
  v !== '.' &&
  v !== '..' &&
  Buffer.from(v).toString('utf8') === v
const asciiPart = (v) =>
  /^[A-Za-z0-9_@+.-]+$/.test(v) &&
  v !== '.' &&
  v !== '..' &&
  v.toLowerCase() !== 'node_modules'
// SPEC0240: eligibility of metadata that cannot select a non-# request.
// Values stay opaque; json() binds the entire manifest before this predicate.
export function isInactiveImportsMapEligible(value) {
  return (
    object(value) &&
    Object.keys(value).every(
      (key) => key.startsWith('#') && key.slice(1).split('/').every(asciiPart)
    )
  )
}
const legacyMapKey = (key) =>
  key === '.' ||
  (key.startsWith('./') && key.slice(2).split('/').every(asciiPart))
const exactMapKey = (key) => {
  if (key === '.') return true
  if (!key.startsWith('./')) return false
  const tail = key.slice(2)
  const stars = tail.split('*').length - 1
  if (stars > 1) return false
  return tail
    .split('/')
    .every((part) =>
      part.includes('*') ? /^[A-Za-z0-9_@+.*-]+$/.test(part) : asciiPart(part)
    )
}
const packagePart = (v) =>
  /^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(v) && v !== '.' && v !== '..'
const dirname = (v) =>
  path.posix.dirname(v) === '.' ? '' : path.posix.dirname(v)
const at = (dir, file) => (dir ? dir + '/' + file : file)
const flags =
  fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
const dirFlags = flags | fs.constants.O_DIRECTORY

export function createResolutionSession({
  root,
  limits,
  onProduct = () => {},
  onNegativeTarget = () => {},
  refusalCensus = false
} = {}) {
  const caps = limitsFor(limits)
  if (process.platform !== 'linux') fail('UNKNOWN_ACQUISITION_PLATFORM')
  if (
    typeof root !== 'string' ||
    !path.isAbsolute(root) ||
    path.normalize(root) !== root ||
    root === '/' ||
    Buffer.from(root).toString('utf8') !== root ||
    /[\u0000-\u001f\u007f]/.test(root)
  )
    fail('UNKNOWN_ROOT')
  if (typeof onProduct !== 'function') fail('UNKNOWN_PRODUCT_CALLBACK')
  if (typeof onNegativeTarget !== 'function') fail('UNKNOWN_NEGATIVE_CALLBACK')
  if (typeof refusalCensus !== 'boolean') fail('UNKNOWN_CENSUS_MODE')
  const fds = new Set(),
    directories = new Set(),
    premises = new Map(),
    inputs = new Map(),
    cache = new Map()
  const charged = new Set(),
    resolutions = [],
    workspaceNames = new Set(),
    linkNames = new Set()
  const usage = {
    fileBytes: 0,
    totalBytes: 0,
    files: 0,
    regularBytes: 0,
    regularFiles: 0,
    metadataBytes: 0,
    metadataEntries: 0,
    workspaces: 0,
    links: 0,
    linkBytes: 0,
    pathComponents: 0,
    openDescriptors: 0
  }
  let rootfd,
    closed = false
  const check = () => {
    if (closed) fail('UNKNOWN_CLOSED_SESSION')
  }
  function io(fn, file = '') {
    try {
      return fn()
    } catch (error) {
      if (/^UNKNOWN_/.test(error.message)) throw error
      const code = /^[A-Z0-9_]+$/.test(error.code || '') ? error.code : 'IO'
      fail('UNKNOWN_ACQUISITION_' + code, file)
    }
  }
  function open(file, mode, logical) {
    if (fds.size + directories.size >= caps.maxOpenDescriptors)
      fail('UNKNOWN_RESOLUTION_LIMIT:maxOpenDescriptors')
    const fd = io(() => fs.openSync(file, mode), logical)
    fds.add(fd)
    usage.openDescriptors = Math.max(
      usage.openDescriptors,
      fds.size + directories.size
    )
    return fd
  }
  function closeFD(fd) {
    if (fds.delete(fd)) fs.closeSync(fd)
  }
  function close() {
    if (closed) return
    closed = true
    let error
    for (const directory of [...directories]) {
      try {
        directory.closeSync()
      } catch {
        error = true
      }
      directories.delete(directory)
    }
    for (const fd of [...fds]) {
      try {
        closeFD(fd)
      } catch {
        error = true
      }
    }
    if (error) fail('UNKNOWN_ACQUISITION_CLOSE')
  }
  function charge(key, size, regular = false) {
    usage.fileBytes = Math.max(usage.fileBytes, size)
    if (size > caps.maxFileBytes) fail('UNKNOWN_ANALYSIS_LIMIT:maxFileBytes')
    if (charged.has(key)) return
    if (usage.files >= caps.maxFiles) fail('UNKNOWN_ANALYSIS_LIMIT:maxFiles')
    if (usage.totalBytes + size > caps.maxTotalBytes)
      fail('UNKNOWN_ANALYSIS_LIMIT:maxTotalBytes')
    charged.add(key)
    usage.files++
    usage.totalBytes += size
    usage[regular ? 'regularBytes' : 'metadataBytes'] += size
    usage[regular ? 'regularFiles' : 'metadataEntries']++
  }
  function put(kind, file, data, bytes, physicalKey = kind + ':' + file) {
    const key = kind + ':' + file
    const entry = { kind, file, ...data }
    if (premises.has(key) && !same(premises.get(key), entry))
      fail('UNKNOWN_RESOLUTION_MUTATION', file)
    premises.set(key, entry)
    const raw = bytes === undefined ? Buffer.from(encode(data)) : bytes
    inputs.set(key, { kind, file, sha256: hash(raw) })
    charge(physicalKey, raw.length, kind === 'file')
    return entry
  }
  function stat(file, s) {
    const g = generation(s)
    put('stat', file, { stat: g }, undefined, 'stat:' + s.dev + ':' + s.ino)
    return g
  }
  function parts(file, allowRoot = false) {
    check()
    if (allowRoot && file === '') return []
    if (
      typeof file !== 'string' ||
      path.posix.isAbsolute(file) ||
      !file.split('/').every(component)
    )
      fail('UNKNOWN_PATH')
    const p = file.split('/')
    usage.pathComponents = Math.max(usage.pathComponents, p.length)
    if (p.length > caps.maxPathComponents)
      fail('UNKNOWN_RESOLUTION_LIMIT:maxPathComponents')
    return p
  }
  const proc = (fd, leaf = '') =>
    '/proc/self/fd/' + fd + (leaf ? '/' + leaf : '')
  function lstat(fd, leaf, logical) {
    try {
      return fs.lstatSync(proc(fd, leaf), { bigint: true })
    } catch (error) {
      if (error.code === 'ENOENT') return null
      io(() => {
        throw error
      }, logical)
    }
  }
  function assertSame(before, after, file) {
    if (!same(generation(before), generation(after)))
      fail('UNKNOWN_INPUT_MUTATION', file)
  }
  // Every parent is a held, nofollow directory. Check its entry relative to
  // its own held parent again, even if the operation throws or records absence.
  function walk(file, leafAction) {
    const p = parts(file),
      opened = [],
      chain = []
    let fd = rootfd,
      prefix = ''
    try {
      stat(
        '',
        io(() => fs.fstatSync(rootfd, { bigint: true }))
      )
      for (const name of p.slice(0, -1)) {
        const logical = at(prefix, name),
          before = lstat(fd, name, logical)
        if (!before) {
          put('absence', logical, { parent: prefix })
          return leafAction(null, null, file, logical)
        }
        stat(logical, before)
        if (!before.isDirectory())
          fail(
            before.isSymbolicLink()
              ? 'UNKNOWN_ANCESTOR_SYMLINK'
              : 'UNKNOWN_ANCESTOR_FORMAT',
            logical
          )
        const next = open(proc(fd, name), dirFlags, logical)
        opened.push(next)
        assertSame(
          before,
          io(() => fs.fstatSync(next, { bigint: true }), logical),
          logical
        )
        chain.push({ fd, name, next, before, logical })
        prefix = logical
        fd = next
      }
      return leafAction(fd, p.at(-1), file)
    } finally {
      try {
        for (const c of chain) {
          const current = lstat(c.fd, c.name, c.logical)
          if (!current) fail('UNKNOWN_INPUT_MUTATION', c.logical)
          assertSame(c.before, current, c.logical)
          assertSame(
            c.before,
            io(() => fs.fstatSync(c.next, { bigint: true }), c.logical),
            c.logical
          )
        }
        stat(
          '',
          io(() => fs.fstatSync(rootfd, { bigint: true }))
        )
      } finally {
        for (const owned of opened.reverse()) closeFD(owned)
      }
    }
  }
  function inspect(file) {
    return walk(file, (fd, leaf, logical, missing) => {
      if (fd === null) {
        put('absence', logical, { missing })
        return null
      }
      const s = lstat(fd, leaf, logical)
      if (!s) {
        put('absence', logical, { parent: dirname(logical) })
        return null
      }
      stat(logical, s)
      return s
    })
  }
  function probe(file) {
    return inspect(file) !== null
  }
  function read(file, rawReplay = false) {
    return walk(file, (fd, leaf, logical) => {
      if (fd === null) fail('UNKNOWN_ACQUISITION_ENOENT', logical)
      const before = lstat(fd, leaf, logical)
      if (!before) {
        put('absence', logical, { parent: dirname(logical) })
        fail('UNKNOWN_ACQUISITION_ENOENT', logical)
      }
      stat(logical, before)
      if (!before.isFile())
        fail(
          before.isSymbolicLink() ? 'UNKNOWN_SYMLINK' : 'UNKNOWN_FORMAT',
          logical
        )
      const size = Number(before.size)
      if (!Number.isSafeInteger(size) || size > caps.maxFileBytes)
        fail('UNKNOWN_ANALYSIS_LIMIT:maxFileBytes')
      const physicalKey = 'file:' + before.dev + ':' + before.ino
      // Reserve the bounded size before allocation, including on error.
      charge(physicalKey, size, true)
      const owned = open(proc(fd, leaf), flags, logical)
      try {
        assertSame(
          before,
          io(() => fs.fstatSync(owned, { bigint: true }), logical),
          logical
        )
        const bytes = Buffer.alloc(size + 1)
        let length = 0
        while (length < bytes.length) {
          const n = io(
            () =>
              fs.readSync(owned, bytes, length, bytes.length - length, length),
            logical
          )
          if (!n) break
          length += n
        }
        if (length !== size) fail('UNKNOWN_INPUT_MUTATION', logical)
        const after = io(() => fs.fstatSync(owned, { bigint: true }), logical)
        assertSame(before, after, logical)
        const present = lstat(fd, leaf, logical)
        if (!present) fail('UNKNOWN_INPUT_MUTATION', logical)
        assertSame(before, present, logical)
        const raw = bytes.subarray(0, size),
          sha256 = hash(raw)
        put(
          'file',
          logical,
          { sha256, stat: generation(after) },
          raw,
          physicalKey
        )
        const result = {
          bytes: raw,
          text: rawReplay ? undefined : textFile(raw, logical),
          sha256,
          stat: after
        }
        // Cache never authorizes a stale read; reacquisition above is mandatory.
        if (cache.has(logical) && cache.get(logical) !== sha256)
          fail('UNKNOWN_INPUT_MUTATION', logical)
        cache.set(logical, sha256)
        return result
      } finally {
        closeFD(owned)
      }
    })
  }
  function json(file) {
    const { text } = read(file)
    let body
    try {
      body = JSON.parse(text)
    } catch {
      fail('UNKNOWN_INVALID_MANIFEST', file)
    }
    if (!object(body)) fail('UNKNOWN_INVALID_MANIFEST', file)
    return body
  }
  function inventory(file) {
    parts(file, true)
    // A sentinel lets the same parent walker acquire the directory itself.
    return walk(at(file, '__inventory__'), (parent) => {
      if (parent === null) fail('UNKNOWN_WORKSPACE_CONFIG', file)
      const before = io(() => fs.fstatSync(parent, { bigint: true }), file)
      if (fds.size + directories.size >= caps.maxOpenDescriptors)
        fail('UNKNOWN_RESOLUTION_LIMIT:maxOpenDescriptors')
      const directory = io(
        () => fs.opendirSync(proc(parent), { encoding: 'buffer' }),
        file
      )
      directories.add(directory)
      usage.openDescriptors = Math.max(
        usage.openDescriptors,
        fds.size + directories.size
      )
      const raw = []
      let size = 0,
        partial = false
      try {
        while (true) {
          const entry = io(() => directory.readSync(), file)
          if (entry === null) break
          const name = entry.name
          if (!Buffer.isBuffer(name)) fail('UNKNOWN_METADATA_ENCODING', file)
          raw.push(name)
          size += name.length + 1
          // Bound allocation while streaming, before materializing an inventory.
          if (
            raw.length > HARD.maxFiles ||
            size > caps.maxFileBytes ||
            usage.totalBytes + size > caps.maxTotalBytes
          ) {
            partial = true
            break
          }
        }
      } finally {
        try {
          io(() => directory.closeSync(), file)
        } finally {
          directories.delete(directory)
        }
      }
      raw.sort(Buffer.compare)
      assertSame(
        before,
        io(() => fs.fstatSync(parent, { bigint: true }), file),
        file
      )
      put(
        'inventory',
        file,
        {
          rawHex: raw.map((b) => b.toString('hex')),
          partial,
          stat: generation(before)
        },
        Buffer.concat(raw.flatMap((b) => [b, Buffer.from([0])]))
      )
      if (partial) fail('UNKNOWN_ANALYSIS_LIMIT:maxFiles')
      const names = raw.map((b) => utf8(b, file))
      if (!names.every(component)) fail('UNKNOWN_METADATA_ENCODING', file)
      return names
    })
  }
  function link(file, from, census = false) {
    return walk(file, (fd, leaf, logical) => {
      if (fd === null) fail('UNKNOWN_ACQUISITION_ENOENT', logical)
      const before = lstat(fd, leaf, logical)
      if (!before?.isSymbolicLink()) fail('UNKNOWN_LINK_FORMAT', logical)
      stat(logical, before)
      if (Number(before.size) > RESOLUTION_LIMITS.maxLinkBytes)
        fail('UNKNOWN_RESOLUTION_LIMIT:maxLinkBytes')
      const bytes = io(
        () => fs.readlinkSync(proc(fd, leaf), { encoding: 'buffer' }),
        logical
      )
      usage.linkBytes = Math.max(usage.linkBytes, bytes.length)
      if (bytes.length > RESOLUTION_LIMITS.maxLinkBytes)
        fail('UNKNOWN_RESOLUTION_LIMIT:maxLinkBytes')
      const after = lstat(fd, leaf, logical)
      if (!after) fail('UNKNOWN_INPUT_MUTATION', logical)
      assertSame(before, after, logical)
      put(
        'link',
        logical,
        {
          rawHex: bytes.toString('hex'),
          sha256: hash(bytes),
          stat: generation(after)
        },
        bytes
      )
      const raw = utf8(bytes, logical)
      if (from !== undefined) classifyRaw(raw, from, dirname(logical))
      if (!linkNames.has(logical)) {
        if (linkNames.size >= RESOLUTION_LIMITS.maxLinks)
          fail('UNKNOWN_RESOLUTION_LIMIT:maxLinks')
        linkNames.add(logical)
        usage.links = linkNames.size
      }
      if (!census) enforceLinkCaps()
      return raw
    })
  }
  function enforceLinkCaps() {
    if (usage.linkBytes > caps.maxLinkBytes)
      fail('UNKNOWN_RESOLUTION_LIMIT:maxLinkBytes')
    if (usage.links > caps.maxLinks) fail('UNKNOWN_RESOLUTION_LIMIT:maxLinks')
  }
  function product(file, from) {
    if (file === 'products' || file.startsWith('products/'))
      onProduct(file, from)
  }
  function classifyRaw(raw, from, base = '') {
    if (typeof raw !== 'string') return
    // Classification never authorizes acquisition. Even rejected spellings can
    // identify a known product; normalization is used here only for the census.
    let result
    if (path.isAbsolute(raw))
      result = path.relative(root, raw).split(path.sep).join('/')
    else result = path.posix.normalize(at(base, raw))
    product(result, from)
  }
  function censusLinks(file, from) {
    // This negative census never grants an owner or opens a target's content.
    // Walk each component so an intermediate alias to a product is visible
    // without asking the OS to traverse that alias.
    const seen = new Set()
    let pending = file
    for (let hop = 0; hop < RESOLUTION_LIMITS.maxLinks; hop++) {
      product(pending, from)
      if (pending === 'products' || pending.startsWith('products/')) return
      if (seen.has(pending)) return
      seen.add(pending)
      const segments = pending.split('/')
      if (
        segments.length > RESOLUTION_LIMITS.maxPathComponents ||
        !segments.every(component)
      )
        return
      let redirected = false
      for (let i = 0; i < segments.length; i++) {
        const prefix = segments.slice(0, i + 1).join('/')
        const s = inspect(prefix)
        if (!s) return
        if (s.isSymbolicLink()) {
          const raw = link(prefix, from, true)
          let target = path.isAbsolute(raw)
            ? path.relative(root, raw).split(path.sep).join('/')
            : path.posix.normalize(at(dirname(prefix), raw))
          classifyRaw(raw, from, dirname(prefix))
          if (
            target.startsWith('../') ||
            target === '..' ||
            path.isAbsolute(target)
          )
            return
          const tail = segments.slice(i + 1).join('/')
          if (tail) target = path.posix.normalize(at(target, tail))
          pending = target
          redirected = true
          break
        }
        if (i < segments.length - 1 && !s.isDirectory()) return
      }
      if (!redirected) return
    }
  }
  function manifestAt(file) {
    let dir = dirname(file)
    while (true) {
      const candidate = at(dir, 'package.json')
      if (probe(candidate))
        return { manifest: candidate, body: json(candidate) }
      if (path.posix.basename(dir) === 'node_modules')
        fail('UNKNOWN_PACKAGE_SCOPE', dir)
      if (!dir) return null
      dir = dirname(dir)
    }
  }
  function workspaces() {
    const rootBody = json('package.json'),
      patterns = rootBody.workspaces
    const allowed = ['apps/*', 'packages/*', 'legacy/packages/*', 'products/*']
    if (
      !Array.isArray(patterns) ||
      new Set(patterns).size !== patterns.length ||
      patterns.some((p) => !allowed.includes(p))
    )
      fail('UNKNOWN_WORKSPACE_CONFIG')
    const found = new Map()
    for (const pattern of [...patterns].sort(compare)) {
      const parent = pattern.slice(0, -2)
      if (!probe(parent)) continue
      for (const name of inventory(parent)) {
        const key = parent + '/' + name
        // SPEC0258: the entry type comes from the same no-follow lstat that
        // records the stat premise. A true regular file (documentation such
        // as legacy/packages/README.md) is not a workspace: it is ignored
        // before any name validation and never opened. Links, special files
        // and directories keep the rules below.
        const s = inspect(key)
        if (s?.isFile()) continue
        if (!packagePart(name)) fail('UNKNOWN_WORKSPACE_CONFIG', key)
        if (!s?.isDirectory()) fail('UNKNOWN_WORKSPACE_CONFIG', key)
        if (!workspaceNames.has(key)) {
          if (workspaceNames.size >= caps.maxWorkspaces)
            fail('UNKNOWN_RESOLUTION_LIMIT:maxWorkspaces')
          workspaceNames.add(key)
          usage.workspaces = workspaceNames.size
        }
        const manifest = key + '/package.json'
        if (!probe(manifest)) fail('UNKNOWN_WORKSPACE_CONFIG', key)
        const body = json(manifest)
        if (typeof body.name !== 'string' || found.has(body.name))
          fail('UNKNOWN_WORKSPACE_CONFIG', key)
        found.set(body.name, { key, manifest, body })
      }
    }
    return found
  }
  function censusEntry(body, canonical, from, subpath, mode) {
    let entry
    try {
      entry =
        body.exports != null
          ? selectExports(body.exports, subpath, mode, [])
          : subpath !== '.'
            ? subpath
            : body.main || './index.js'
    } catch {
      return
    }
    classifyRaw(entry, from, canonical)
    if (typeof entry === 'string') {
      const selected = path.isAbsolute(entry)
        ? path.relative(root, entry).split(path.sep).join('/')
        : path.posix.normalize(at(canonical, entry))
      if (
        selected !== '..' &&
        !selected.startsWith('../') &&
        !path.isAbsolute(selected)
      )
        censusLinks(selected, from)
    }
    return entry
  }
  function ownerAt(key, name, from, subpath, mode) {
    censusLinks(key, from)
    const present = inspect(key)
    if (!present) return null
    let canonical = key,
      workspace = false
    if (present.isSymbolicLink()) {
      censusLinks(key, from)
      const raw = link(key, from, true)
      classifyRaw(raw, from, dirname(key))
      const direct = key === 'node_modules/' + name
      const up = name.startsWith('@') ? '../../packages/' : '../packages/'
      let tail
      if (raw.startsWith(up)) tail = raw.slice(up.length)
      else if (raw.startsWith(root + '/packages/'))
        tail = raw.slice((root + '/packages/').length)
      if (!direct || !tail || !packagePart(tail))
        fail('UNKNOWN_WORKSPACE_LINK', key)
      canonical = 'packages/' + tail
      // Only a regular canonical package manifest is inspected. Its selected
      // negative target must reach the product census before registry caps.
      const candidateManifest = canonical + '/package.json'
      if (probe(candidateManifest))
        censusEntry(json(candidateManifest), canonical, from, subpath, mode)
      enforceLinkCaps()
      const registry = workspaces(),
        registered = registry.get(name)
      if (!registered || registered.key !== canonical)
        fail('UNKNOWN_WORKSPACE_CONFIG', key)
      workspace = true
    } else if (!present.isDirectory())
      fail('UNKNOWN_PACKAGE_DIRECTORY_WITHOUT_MANIFEST', key)
    const manifest = canonical + '/package.json'
    if (!probe(manifest))
      fail('UNKNOWN_PACKAGE_DIRECTORY_WITHOUT_MANIFEST', key)
    const body = json(manifest)
    if (body.name !== name) {
      // Preserve the pre-existing negative source census for regular installed
      // entries even when the stronger owner identity premise blocks proof.
      // The callback can only add syntax/violations; this path always refuses.
      if (!workspace) {
        try {
          const entry = censusEntry(body, canonical, from, subpath, mode)
          const selected = urlTarget(
            entry,
            { key, manifest, body, workspace },
            from,
            Object.hasOwn(body, 'exports')
          )
          const target = finishTarget(
            selected.file,
            mode,
            from,
            Object.hasOwn(body, 'exports')
          )
          onNegativeTarget(target, from)
        } catch {
          // No alternative positive owner or fallback is selected.
        }
      }
      fail('UNKNOWN_PACKAGE_NAME', key)
    }
    return { key, manifest, body, workspace }
  }
  function selectExports(value, subpath, mode, branch) {
    const active = new Set(
      mode === 'import'
        ? ['node', 'import', 'module-sync', 'node-addons']
        : ['require', 'node', 'node-addons', 'module-sync']
    )
    function select(v, depth = 0) {
      if (depth > 64) fail('UNKNOWN_EXPORTS_DEPTH')
      if (v === null) fail('UNKNOWN_BLOCKED_EXPORT')
      if (typeof v === 'string') return v
      if (!object(v)) fail('UNKNOWN_UNSUPPORTED_EXPORTS')
      const keys = Object.keys(v)
      if (
        keys.some(
          (k) => /^\d+$/.test(k) || k.startsWith('.') || k.includes('*')
        )
      )
        fail('UNKNOWN_UNSUPPORTED_EXPORTS')
      for (const key of keys) {
        if (key !== 'default' && !active.has(key)) continue
        branch.push(key)
        const result = select(v[key], depth + 1)
        if (result !== undefined) return result
        branch.pop()
      }
      return undefined
    }
    if (object(value)) {
      const keys = Object.keys(value),
        mapped = keys.some((k) => k.startsWith('.'))
      if (mapped) {
        // Global map classification precedes the exact hit. Patterns are
        // eligible only as unselected keys; no matching/substitution follows.
        if (!keys.every(refusalCensus ? legacyMapKey : exactMapKey))
          fail('UNKNOWN_UNSUPPORTED_EXPORTS')
        if (!Object.hasOwn(value, subpath)) fail('UNKNOWN_UNRESOLVED_EXPORT')
        branch.push(subpath)
        const result = select(value[subpath])
        if (result === undefined) fail('UNKNOWN_UNRESOLVED_EXPORT')
        return result
      }
    }
    if (subpath !== '.') fail('UNKNOWN_UNRESOLVED_EXPORT')
    const result = select(value)
    if (result === undefined) fail('UNKNOWN_UNRESOLVED_EXPORT')
    return result
  }
  function urlTarget(entry, owner, from, exact) {
    const canonicalKey = dirname(owner.manifest)
    classifyRaw(entry, from, canonicalKey)
    if (typeof entry !== 'string')
      fail('UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION')
    if (path.isAbsolute(entry) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(entry))
      fail('UNKNOWN_ABSOLUTE_PACKAGE_ENTRY')
    const target = entry.startsWith('./') ? entry : exact ? '' : './' + entry
    if (
      !target.startsWith('./') ||
      !target.slice(2).split('/').every(asciiPart)
    )
      fail('UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION')
    const manifestURL = pathToFileURL(
      path.join(root, owner.key, 'package.json')
    )
    const logicalURL = new URL(target, manifestURL)
    if (
      logicalURL.protocol !== 'file:' ||
      logicalURL.host ||
      logicalURL.username ||
      logicalURL.password ||
      logicalURL.port ||
      logicalURL.search ||
      logicalURL.hash
    )
      fail('UNKNOWN_TARGET_URL')
    const logicalPath = fileURLToPath(logicalURL)
    const prefix = path.join(root, owner.key) + path.sep
    if (
      !logicalPath.startsWith(prefix) ||
      pathToFileURL(logicalPath).href !== logicalURL.href
    )
      fail('UNKNOWN_PACKAGE_ESCAPE')
    const tail = logicalPath.slice(prefix.length).split(path.sep).join('/')
    if (!tail.split('/').every(asciiPart)) fail('UNKNOWN_TARGET_URL')
    const file = canonicalKey + '/' + tail
    return { file, logicalURL: logicalURL.href }
  }
  function finishTarget(file, mode, from, exact) {
    // Selected leaf and ancestor aliases participate in the negative census
    // before nofollow/format/limit refusal. This never acquires their content
    // or grants a positive resolution through a symlink.
    censusLinks(file, from)
    enforceLinkCaps()
    product(file, from)
    if (file === 'products' || file.startsWith('products/'))
      fail('UNKNOWN_PRODUCT_TARGET', file)
    parts(file)
    if (mode === 'require' && !path.posix.extname(file)) {
      if (exact) fail('UNKNOWN_EXACT_EXPORTS_TARGET')
      if (
        [
          file + '.cjs',
          file + '.json',
          file + '.node',
          file + '/package.json'
        ].some((candidate) => {
          censusLinks(candidate, from)
          enforceLinkCaps()
          return probe(candidate)
        })
      )
        fail('UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION')
      const candidates = [file, file + '.js', file + '/index.js'].filter(
        (f) => {
          censusLinks(f, from)
          enforceLinkCaps()
          const s = inspect(f)
          return s?.isFile()
        }
      )
      if (candidates.length !== 1) fail('UNKNOWN_AMBIGUOUS_RESOLUTION', file)
      file = candidates[0]
    }
    censusLinks(file, from)
    enforceLinkCaps()
    if (
      !/\.(?:[cm]?js|[cm]?ts)$/.test(file) ||
      /\.d\.[cm]?ts$/.test(file) ||
      (file.includes('node_modules/') && /\.[cm]?ts$/.test(file))
    )
      fail('UNKNOWN_FORMAT', file)
    read(file)
    const scope = manifestAt(file)
    const targetMode =
      /\.c(?:js|ts)$/.test(file) ||
      (!/\.m(?:js|ts)$/.test(file) && scope?.body.type !== 'module')
        ? 'require'
        : 'import'
    if (targetMode !== mode) fail('UNKNOWN_MODULE_INTEROP', file)
    return file
  }
  function resolve({ from, specifier, mode } = {}) {
    // Literal builtin refusal precedes even path validation and scope metadata.
    if (typeof specifier !== 'string') fail('UNKNOWN_RESOLUTION')
    if (isBuiltin(specifier)) fail('UNKNOWN_NATIVE_BUILTIN')
    if (!['import', 'require'].includes(mode)) fail('UNKNOWN_RUNTIME_PROFILE')
    parts(from)
    if (specifier.startsWith('./') || specifier.startsWith('../'))
      classifyRaw(specifier, from, dirname(from))
    read(from)
    let owner = null,
      file,
      logicalURL,
      exact = false
    const branch = []
    const metadataSelection = { imports: null, exports: null }
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      classifyRaw(specifier, from, dirname(from))
      // Normalization here only selects metadata for conservative negative
      // classification. The positive traversal below still validates every
      // raw component and refuses cancelled/missing/alias intermediates.
      censusLinks(path.posix.normalize(at(dirname(from), specifier)), from)
      enforceLinkCaps()
      if (
        !/^[A-Za-z0-9_@+./-]+$/.test(specifier) ||
        specifier.endsWith('/') ||
        specifier
          .split('/')
          .some(
            (p, i, a) => !p || (i === a.length - 1 && (p === '.' || p === '..'))
          )
      )
        fail('UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION')
      // Resolve traversed directory components before normalizing any '..'.
      const stack = dirname(from).split('/').filter(Boolean)
      for (const part of specifier.split('/').slice(0, -1)) {
        if (part === '.') continue
        if (part === '..') {
          if (!stack.length) fail('UNKNOWN_EXTERNAL_PATH')
          stack.pop()
        } else {
          stack.push(part)
          const s = inspect(stack.join('/'))
          if (!s?.isDirectory()) fail('UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION')
        }
      }
      file = [...stack, specifier.split('/').at(-1)].join('/')
      logicalURL = new URL(specifier, pathToFileURL(path.join(root, from))).href
    } else {
      const pieces = specifier.split('/'),
        count = specifier.startsWith('@') ? 2 : 1
      const name = pieces.slice(0, count).join('/')
      if (
        (count === 2 &&
          (!packagePart(pieces[0].slice(1)) ||
            !packagePart(pieces[1] || ''))) ||
        (count === 1 && !packagePart(name)) ||
        !pieces.slice(count).every(asciiPart)
      )
        fail('UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION')
      const scope = manifestAt(from)
      if (scope?.body.name === name && scope.body.exports != null)
        fail('UNKNOWN_PACKAGE_SELF_REFERENCE')
      let dir = dirname(from)
      while (true) {
        if (
          !(mode === 'require' && path.posix.basename(dir) === 'node_modules')
        ) {
          const key = at(dir, 'node_modules/' + name)
          const requestedSubpath =
            pieces.length === count ? '.' : './' + pieces.slice(count).join('/')
          owner = ownerAt(key, name, from, requestedSubpath, mode)
          if (mode === 'require' && owner?.body.exports == null) {
            if (['.js', '.json', '.node'].some((suffix) => probe(key + suffix)))
              fail('UNKNOWN_CJS_FILE_PACKAGE')
          }
          if (owner) break
        }
        if (!dir) break
        dir = dirname(dir)
      }
      if (!owner) fail('UNKNOWN_RESOLUTION')
      const body = owner.body
      const hasImports = Object.hasOwn(body, 'imports')
      const eligibleImports =
        hasImports &&
        !refusalCensus &&
        isInactiveImportsMapEligible(body.imports)
      if (Object.hasOwn(body, 'browser') || (hasImports && !eligibleImports))
        fail('UNKNOWN_AMBIGUOUS_RESOLUTION')
      metadataSelection.imports = {
        present: hasImports,
        eligible: eligibleImports,
        inactive: eligibleImports,
        keys: eligibleImports ? Object.keys(body.imports) : []
      }
      // A selected explicit null is outside the positive legacy subset: it
      // must reach the blocked export branch, never open main/index fallback.
      exact = Object.hasOwn(body, 'exports')
      const subpath =
        pieces.length === count ? '.' : './' + pieces.slice(count).join('/')
      const entry = exact
        ? selectExports(body.exports, subpath, mode, branch)
        : subpath !== '.'
          ? subpath
          : body.main || './index.js'
      if (exact)
        metadataSelection.exports = {
          requestedSubpath: subpath,
          selectedKey: subpath,
          unselectedPatternKeys: object(body.exports)
            ? Object.keys(body.exports).filter((key) => key.includes('*'))
            : []
        }
      const target = urlTarget(entry, owner, from, exact)
      file = target.file
      logicalURL = target.logicalURL
    }
    file = finishTarget(file, mode, from, exact)
    const trace = {
      from,
      specifier,
      mode,
      conditions:
        mode === 'import'
          ? ['node', 'import', 'module-sync', 'node-addons']
          : ['require', 'node', 'node-addons', 'module-sync'],
      branch,
      exact,
      metadataSelection,
      logicalURL,
      canonicalFile: file,
      canonicalURL: pathToFileURL(path.join(root, file)).href,
      owner: owner
        ? {
            key: owner.key,
            manifest: owner.manifest,
            workspace: owner.workspace
          }
        : null
    }
    resolutions.push(trace)
    return { file, owner, trace }
  }
  function anchorNow() {
    return io(() => {
      if (fs.realpathSync(root) !== root) fail('UNKNOWN_ROOT_ALIAS')
      const entries = []
      let dir = root
      while (true) {
        const s = fs.lstatSync(dir, { bigint: true })
        if (!s.isDirectory()) fail('UNKNOWN_ROOT_ALIAS')
        // Ancestors above the anchor bind traversal identity/permissions.
        // Their unrelated child inventory timestamps cannot affect a proof
        // over this root. Full root/descendant generations remain premises.
        entries.push({
          depth: entries.length,
          stat: Object.fromEntries(
            ['dev', 'ino', 'mode', 'uid', 'gid'].map((key) => [
              key,
              String(s[key])
            ])
          )
        })
        if (dir === '/') break
        dir = path.dirname(dir)
      }
      return entries
    })
  }
  let anchor
  try {
    anchor = anchorNow()
    const before = fs.lstatSync(root, { bigint: true })
    rootfd = open(root, dirFlags)
    const after = io(() => fs.fstatSync(rootfd, { bigint: true }))
    assertSame(before, after, '')
    // Check procfs before any target acquisition; no ordinary-path fallback.
    const procStat = io(() => fs.statSync(proc(rootfd), { bigint: true }))
    assertSame(after, procStat, '')
    if (!same(anchor, anchorNow())) fail('UNKNOWN_ROOT_MUTATION')
    stat('', after)
    put('anchor', '', { parents: anchor })
  } catch (error) {
    close()
    if (/^UNKNOWN_/.test(error.message)) throw error
    fail('UNKNOWN_ROOT_ACQUISITION')
  }
  function snapshot() {
    check()
    return JSON.parse(
      encode({
        schemaVersion: 1,
        profile: refusalCensus ? REFUSAL_CENSUS_PROFILE : RESOLUTION_PROFILE,
        root,
        inputs: [...inputs.values()].sort((a, b) =>
          compare(a.kind + ':' + a.file, b.kind + ':' + b.file)
        ),
        premises: [...premises.values()].sort((a, b) =>
          compare(a.kind + ':' + a.file, b.kind + ':' + b.file)
        ),
        resolutions: [...resolutions].sort((a, b) =>
          compare(encode(a), encode(b))
        )
      })
    )
  }
  function revalidate() {
    check()
    const saved = snapshot()
    for (const premise of saved.premises) replay(premise)
    const current = snapshot()
    if (
      !same(saved.premises, current.premises) ||
      !same(saved.inputs, current.inputs)
    )
      fail('UNKNOWN_RESOLUTION_MUTATION')
    return true
  }
  // Private replay primitives never exposed to callers.
  function replay(entry) {
    if (entry.kind === 'anchor') {
      if (!same(entry.parents, anchorNow())) fail('UNKNOWN_ROOT_MUTATION')
    } else if (entry.kind === 'stat') {
      const s =
        entry.file === ''
          ? io(() => fs.fstatSync(rootfd, { bigint: true }))
          : inspect(entry.file)
      if (!s || !same(entry.stat, generation(s)))
        fail('UNKNOWN_INPUT_MUTATION', entry.file)
    } else if (entry.kind === 'absence') {
      if (probe(entry.file)) fail('UNKNOWN_RESOLUTION_MUTATION', entry.file)
    } else if (entry.kind === 'file') read(entry.file, true)
    else if (entry.kind === 'link') link(entry.file, undefined, true)
    else if (entry.kind === 'inventory') inventory(entry.file)
    else fail('UNKNOWN_INVALID_SNAPSHOT')
  }
  // Replay is kept in a WeakMap, not a public method or serialized authority.
  const session = {
    read: (file) => read(file),
    probe,
    resolve,
    snapshot,
    revalidate,
    close,
    get usage() {
      return { ...usage }
    }
  }
  REPLAY.set(session, replay)
  return session
}
const REPLAY = new WeakMap()

function snapshotData(value) {
  // Reject accessors/functions before JSON serialization can call a supplied
  // getter or toJSON. Worker snapshots are plain JSON data, never code.
  const pending = [{ value, depth: 0 }],
    seen = new Set()
  let nodes = 0
  while (pending.length) {
    const { value: v, depth } = pending.pop()
    if (++nodes > INTERPRETER.maxNodes || depth > 64)
      fail('UNKNOWN_INVALID_SNAPSHOT')
    if (v === null || typeof v === 'boolean' || typeof v === 'string') continue
    if (typeof v === 'number' && Number.isFinite(v)) continue
    if (typeof v !== 'object' || seen.has(v)) fail('UNKNOWN_INVALID_SNAPSHOT')
    seen.add(v)
    const proto = Object.getPrototypeOf(v)
    if (
      proto !== Object.prototype &&
      proto !== Array.prototype &&
      proto !== null
    )
      fail('UNKNOWN_INVALID_SNAPSHOT')
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(v)
    )) {
      if (Array.isArray(v) && key === 'length') continue
      if (!Object.hasOwn(descriptor, 'value') || !descriptor.enumerable)
        fail('UNKNOWN_INVALID_SNAPSHOT')
      pending.push({ value: descriptor.value, depth: depth + 1 })
    }
  }
}

function validateTraces(saved, root) {
  const validPath = (v) =>
    typeof v === 'string' && v.length > 0 && v.split('/').every(component)
  const files = new Set(
    saved.premises.filter((p) => p.kind === 'file').map((p) => p.file)
  )
  const hasFile = (file) => files.has(file)
  for (const trace of saved.resolutions) {
    if (
      !object(trace) ||
      !validPath(trace.from) ||
      !hasFile(trace.from) ||
      !validPath(trace.canonicalFile) ||
      !hasFile(trace.canonicalFile) ||
      typeof trace.specifier !== 'string' ||
      isBuiltin(trace.specifier) ||
      !['import', 'require'].includes(trace.mode) ||
      typeof trace.exact !== 'boolean' ||
      !object(trace.metadataSelection) ||
      !Array.isArray(trace.branch) ||
      trace.branch.some(
        (v) => typeof v !== 'string' || /[\u0000-\u001f\u007f]/.test(v)
      ) ||
      !same(
        trace.conditions,
        trace.mode === 'import'
          ? ['node', 'import', 'module-sync', 'node-addons']
          : ['require', 'node', 'node-addons', 'module-sync']
      ) ||
      trace.canonicalURL !==
        pathToFileURL(path.join(root, trace.canonicalFile)).href
    )
      fail('UNKNOWN_INVALID_SNAPSHOT')
    let logical
    try {
      logical = new URL(trace.logicalURL)
    } catch {
      fail('UNKNOWN_INVALID_SNAPSHOT')
    }
    if (
      logical.protocol !== 'file:' ||
      logical.host ||
      logical.search ||
      logical.hash ||
      !fileURLToPath(logical).startsWith(root + path.sep)
    )
      fail('UNKNOWN_INVALID_SNAPSHOT')
    if (
      trace.owner !== null &&
      (!object(trace.owner) ||
        !validPath(trace.owner.key) ||
        !validPath(trace.owner.manifest) ||
        !hasFile(trace.owner.manifest) ||
        typeof trace.owner.workspace !== 'boolean')
    )
      fail('UNKNOWN_INVALID_SNAPSHOT')
  }
}

export function revalidateResolutionSnapshot({ root, snapshot, limits } = {}) {
  // Strict JSON data only, bounded before recursive validation. No supplied
  // path can name an absolute/procfs/parent path or authorize a link traversal.
  let raw
  snapshotData(snapshot)
  try {
    raw = encode(snapshot)
  } catch {
    fail('UNKNOWN_INVALID_SNAPSHOT')
  }
  if (typeof raw !== 'string' || raw.length > HARD.maxTotalBytes)
    fail('UNKNOWN_INVALID_SNAPSHOT')
  let saved
  try {
    saved = JSON.parse(raw)
  } catch {
    fail('UNKNOWN_INVALID_SNAPSHOT')
  }
  if (
    !object(saved) ||
    saved.schemaVersion !== 1 ||
    saved.profile !== RESOLUTION_PROFILE ||
    saved.root !== root ||
    !Array.isArray(saved.inputs) ||
    !Array.isArray(saved.premises) ||
    !Array.isArray(saved.resolutions) ||
    saved.inputs.length > HARD.maxFiles * 8 ||
    saved.premises.length > HARD.maxFiles * 8
  )
    fail('UNKNOWN_INVALID_SNAPSHOT')
  const keys = new Set()
  for (const entry of saved.premises) {
    if (
      !object(entry) ||
      !['anchor', 'stat', 'absence', 'file', 'link', 'inventory'].includes(
        entry.kind
      ) ||
      typeof entry.file !== 'string' ||
      (entry.file !== '' && !entry.file.split('/').every(component)) ||
      (entry.file === '' &&
        !['anchor', 'stat', 'inventory'].includes(entry.kind))
    )
      fail('UNKNOWN_INVALID_SNAPSHOT')
    const key = entry.kind + ':' + entry.file
    if (keys.has(key)) fail('UNKNOWN_INVALID_SNAPSHOT')
    keys.add(key)
  }
  validateTraces(saved, root)
  const session = createResolutionSession({ root, limits })
  try {
    for (const premise of saved.premises) REPLAY.get(session)(premise)
    // Re-derive the selected branch and inactive-metadata premises. A
    // valid-looking edited trace is never authority for a selection.
    for (const trace of saved.resolutions)
      session.resolve({
        from: trace.from,
        specifier: trace.specifier,
        mode: trace.mode
      })
    const current = session.snapshot()
    if (
      !same(current.premises, saved.premises) ||
      !same(current.inputs, saved.inputs) ||
      !same(current.resolutions, saved.resolutions)
    )
      fail('UNKNOWN_RESOLUTION_MUTATION')
    return true
  } finally {
    session.close()
  }
}
