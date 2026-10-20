// SPEC0236 K0–K7. This is a finite, deliberately incomplete interpreter.
// Evaluated modules are read as bytes only: never require/import/evaluate them.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import {
  createRequire,
  stripTypeScriptTypes,
  Module,
  isBuiltin
} from 'node:module'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import {
  createResolutionSession,
  revalidateResolutionSnapshot,
  RESOLUTION_LIMITS,
  RESOLUTION_PROFILE,
  isInactiveImportsMapEligible
} from './boundary-semantic-resolution.mjs'
// SPEC0241 errata E4(a): the 0234 comparator's canonical JSON is imported, not
// reimplemented. Its module hash is part of the profile (worker and parent).
import { canonicalJson as installedCanonicalJson } from './boundary-installed-identity.mjs'

export const SEMANTIC_KERNEL_VERSION = 'semantic-kernel-v7-cjs-export-value'
export const INSTALLED_FILE_IDENTITY_PREMISE = 'installed-file-identity-v1'

const SELF = fileURLToPath(import.meta.url)
const isWorker = () =>
  process.argv[1] &&
  path.resolve(process.argv[1]) === SELF &&
  process.argv[2] === '--semantic-worker'
// SPEC0240 §3.3: a known product dependency outranks any later cap, deadline,
// kill or refusal. The worker streams each one as soon as it is discovered and
// the parent unites the v2 refusal census with the exact-metadata refinement.
const VIOLATION_STREAM = 'CVG_SEMANTIC_VIOLATION_V1 '
const REFUSAL_CENSUS_ARG = '--refusal-census'
const RESOLVER = path.resolve(
  path.dirname(SELF),
  'boundary-semantic-resolution.mjs'
)
const IDENTITY = path.resolve(
  path.dirname(SELF),
  'boundary-installed-identity.mjs'
)
// Only the LOCATION of the pinned Node22 is configurable: CVG_PINNED_NODE, or
// by default the physical running Node. checkTCB still demands NODE_SHA of the
// caller and of this binary, which must also be absolute and not an alias.
const NODE = process.env.CVG_PINNED_NODE || fs.realpathSync(process.execPath)
const NODE_SHA =
  '3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327'
const PARSER = path.resolve(
  path.dirname(SELF),
  '../node_modules/typescript/lib/typescript.js'
)
const PARSER_SHA =
  '569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39'
const hash = (x) => createHash('sha256').update(x).digest('hex')
const hex = (x) => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x)
const record = (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
const sort = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
export function semanticCanonicalJson(x) {
  if (Array.isArray(x))
    return '[' + x.map(semanticCanonicalJson).join(',') + ']'
  if (record(x))
    return (
      '{' +
      Object.keys(x)
        .sort()
        .filter((k) => x[k] !== undefined)
        .map((k) => JSON.stringify(k) + ':' + semanticCanonicalJson(x[k]))
        .join(',') +
      '}'
    )
  return JSON.stringify(x)
}
// Exported for the emitter: full canonical tuple; id itself is never an input.
export function semanticOriginId(origin) {
  const tuple = { ...origin }
  delete tuple.id
  return hash(semanticCanonicalJson(tuple))
}
// SPEC0242 L1/L2 (approved values): the integral body of the real tree needs
// 145 contexts and 125,460 states; one global deadline for census, analysis
// and recomputation. Constants only: an input can reduce them, never raise.
export const SEMANTIC_LIMITS = Object.freeze({
  maxFileBytes: 16 * 1024 ** 2,
  maxTotalBytes: 256 * 1024 ** 2,
  maxFiles: 12000,
  maxNodes: 2000000,
  maxUnionValues: 128,
  maxContexts: 256,
  maxCallDepth: 64,
  maxStates: 250000,
  timeoutMs: 300000
})
function limitsFor(input) {
  const limits = { ...SEMANTIC_LIMITS }
  if (input.limits !== undefined) {
    if (!record(input.limits)) throw Error('UNKNOWN_INVALID_LIMITS')
    for (const [key, value] of Object.entries(input.limits)) {
      if (
        !Object.hasOwn(limits, key) ||
        !Number.isSafeInteger(value) ||
        value < 0 ||
        value > limits[key]
      )
        throw Error('UNKNOWN_INVALID_LIMITS')
      limits[key] = value
    }
  }
  return limits
}
function empty(limits, reason, detail = '') {
  return {
    schemaVersion: 1,
    kernelVersion: SEMANTIC_KERNEL_VERSION,
    status: 'UNKNOWN',
    proofs: [],
    installed: [],
    unknowns: [{ file: '', reason, originId: null, detail }],
    violations: [],
    inputs: [],
    limits,
    usage: {
      fileBytes: 0,
      totalBytes: 0,
      files: 0,
      nodes: 0,
      unionValues: 0,
      contexts: 0,
      callDepth: 0,
      states: 0
    },
    validation: { valid: false },
    // SPEC0241 §3.2: a parent envelope loses the frontier; phases are null and
    // the envelope reason stays in its single tuple.
    phases: null,
    bodyCoverage: null,
    installedFileIdentity: null
  }
}
// SPEC0241 §3.1: closed per-edge list. Only an exception whose reason prefix
// (text before ':') is listed is contained at a body edge; everything else
// stays global in the outer catch. A reason found in code and not listed is
// global by default.
export const CONTAINED_EDGE_REASONS = Object.freeze([
  'UNKNOWN_RESOLUTION',
  'UNKNOWN_NATIVE_BUILTIN',
  'UNKNOWN_EXTERNAL_PATH',
  'UNKNOWN_FORMAT',
  'UNKNOWN_MODULE_INTEROP',
  'UNKNOWN_AMBIGUOUS_RESOLUTION',
  'UNKNOWN_UNSUPPORTED_EXPORTS',
  'UNKNOWN_UNRESOLVED_EXPORT',
  'UNKNOWN_BLOCKED_EXPORT',
  'UNKNOWN_EXPORTS_DEPTH',
  'UNKNOWN_EXACT_EXPORTS_TARGET',
  'UNKNOWN_TARGET_URL',
  'UNKNOWN_UNSUPPORTED_RUNTIME_RESOLUTION',
  'UNKNOWN_PACKAGE_SELF_REFERENCE',
  'UNKNOWN_PACKAGE_SCOPE',
  'UNKNOWN_PACKAGE_NAME',
  'UNKNOWN_PACKAGE_ESCAPE',
  'UNKNOWN_PACKAGE_DIRECTORY_WITHOUT_MANIFEST',
  'UNKNOWN_CJS_FILE_PACKAGE',
  'UNKNOWN_ABSOLUTE_PACKAGE_ENTRY',
  'UNKNOWN_WORKSPACE_CONFIG',
  'UNKNOWN_WORKSPACE_LINK',
  'UNKNOWN_SYMLINK',
  'UNKNOWN_ANCESTOR_SYMLINK',
  'UNKNOWN_ANCESTOR_FORMAT',
  'UNKNOWN_LINK_FORMAT',
  'UNKNOWN_METADATA_ENCODING',
  'UNKNOWN_INPUT_ENCODING',
  'UNKNOWN_INVALID_MANIFEST',
  'UNKNOWN_PATH',
  'UNKNOWN_PRODUCT_TARGET',
  'UNKNOWN_ACQUISITION_ENOENT',
  'UNKNOWN_ACQUISITION_ENOTDIR',
  'UNKNOWN_ACQUISITION_ELOOP',
  'UNKNOWN_ACQUISITION_EACCES',
  'UNKNOWN_ACQUISITION_EISDIR'
])
const CONTAINED_SET = new Set(CONTAINED_EDGE_REASONS)
export function containedEdgeReason(message) {
  const reason = (typeof message === 'string' ? message : '').split(':')[0]
  return CONTAINED_SET.has(reason) ? reason : null
}
// Deterministic body cut (§3.2): only these four counters, only in the body.
const BODY_CUT =
  /^UNKNOWN_ANALYSIS_LIMIT:(maxStates|maxContexts|maxCallDepth|maxUnionValues)$/
const PHASES = ['acquisition', 'body', 'postBody', 'grammar', 'revalidation']
// SPEC0241 §3.4: one physical derivation of the installed package key, the
// last node_modules plus the scope and name (or the name) components.
export function installedPackageKey(file) {
  if (typeof file !== 'string') return null
  const parts = file.split('/'),
    index = parts.lastIndexOf('node_modules')
  if (index < 0) return null
  const end = index + (parts[index + 1]?.startsWith('@') ? 3 : 2)
  return {
    key: parts.slice(0, end).join('/'),
    relative: parts.slice(end).join('/')
  }
}
const INVENTORY_TYPES = new Set(['file', 'link', 'directory'])
function inventoryIndex(rec) {
  const { entries, nestedPackages, usage } = rec.inventory
  if (
    !Array.isArray(entries) ||
    !Array.isArray(nestedPackages) ||
    !record(usage)
  )
    return 'INVENTORY_INVALID'
  let digest
  try {
    digest = hash(installedCanonicalJson({ entries, nestedPackages, usage }))
  } catch {
    return 'INVENTORY_INVALID'
  }
  if (digest !== rec.inventorySha256) return 'INVENTORY_DIGEST'
  const index = new Map()
  let previous = ''
  for (const entry of entries) {
    if (
      !record(entry) ||
      typeof entry.path !== 'string' ||
      !entry.path ||
      !(previous < entry.path) ||
      !INVENTORY_TYPES.has(entry.type) ||
      (entry.type === 'file' && !hex(entry.sha256))
    )
      return 'INVENTORY_INVALID'
    previous = entry.path
    index.set(entry.path, entry)
  }
  return index
}
// SPEC0241 §3.4 premises for one installed file, all required, no fallback:
// MATCH package with a hex reference digest, the 0234 reference inventory and
// its digest recomputed with the comparator's canonical JSON, and a regular
// entry at the package-relative path whose SHA-256 equals the acquired bytes.
// A failure returns its closed category; the caller records
// UNKNOWN_INSTALLED_FILE_IDENTITY for the file.
export function installedFilePremise({
  file,
  sha256,
  installed,
  ownerKey,
  cache
} = {}) {
  const fail = (category) => ({ ok: false, category })
  const derived = installedPackageKey(file)
  if (!derived || !derived.relative) return fail('PACKAGE_KEY')
  if (ownerKey !== undefined && ownerKey !== null && ownerKey !== derived.key)
    return fail('OWNER_KEY')
  const manifest = derived.key + '/package.json'
  const rec = Array.isArray(installed)
    ? installed.find(
        (x) => record(x) && x.key === derived.key && x.manifest === manifest
      )
    : undefined
  if (!rec || rec.identityStatus !== 'MATCH' || !hex(rec.referenceDigest))
    return fail('PACKAGE_IDENTITY')
  if (!hex(rec.inventorySha256) || !record(rec.inventory))
    return fail('INVENTORY_UNAVAILABLE')
  let index = cache?.get(rec)
  if (index === undefined) {
    index = inventoryIndex(rec)
    cache?.set(rec, index)
  }
  if (typeof index === 'string') return fail(index)
  const entry = index.get(derived.relative)
  if (!entry) return fail('ENTRY_MISSING')
  if (entry.type !== 'file') return fail('ENTRY_TYPE')
  if (!hex(sha256) || entry.sha256 !== sha256) return fail('ENTRY_SHA256')
  return {
    ok: true,
    record: {
      file,
      key: derived.key,
      inventorySha256: rec.inventorySha256,
      sha256
    }
  }
}
function checkTCB() {
  const executable = fs.realpathSync(process.execPath)
  if (
    process.versions.node !== '22.23.2' ||
    hash(fs.readFileSync(executable)) !== NODE_SHA
  )
    throw Error('UNKNOWN_TOOLCHAIN_RUNTIME')
  if (process.env.NODE_OPTIONS || process.env.NODE_PATH)
    throw Error('UNKNOWN_RUNTIME_PROFILE')
  // Closed launch profile, not a blacklist of already-known dangerous flags.
  // Inline caller source is permitted; only the fixed internal VM flag is
  // allowed in the worker. No inherited loader or resolution profile applies.
  for (let index = 0; index < process.execArgv.length; index++) {
    const arg = process.execArgv[index]
    if (arg === '-e' || arg === '--eval') {
      if (typeof process.execArgv[++index] !== 'string')
        throw Error('UNKNOWN_RUNTIME_PROFILE')
    } else if (/^--eval=/.test(arg)) continue
    else if (/^--input-type=(?:module|commonjs)$/.test(arg)) continue
    else if (
      arg === '--experimental-vm-modules' &&
      isWorker() &&
      process.execArgv.length === 1
    )
      continue
    else if (
      arg === '--input-type' &&
      ['module', 'commonjs'].includes(process.execArgv[index + 1])
    )
      index++
    else throw Error('UNKNOWN_RUNTIME_PROFILE')
  }
  if (
    !path.isAbsolute(NODE) ||
    fs.realpathSync(NODE) !== NODE ||
    (executable !== NODE && hash(fs.readFileSync(NODE)) !== NODE_SHA) ||
    hash(fs.readFileSync(PARSER)) !== PARSER_SHA
  )
    throw Error('UNKNOWN_TOOLCHAIN')
  return {
    kernelVersion: SEMANTIC_KERNEL_VERSION,
    nodeSha256: NODE_SHA,
    parserSha256: PARSER_SHA,
    grammarValidator: 'pinned-node-native-vm-parse-only',
    engineSha256: hash(fs.readFileSync(SELF)),
    resolutionProfile: RESOLUTION_PROFILE,
    resolverSha256: hash(fs.readFileSync(RESOLVER)),
    installedIdentitySha256: hash(fs.readFileSync(IDENTITY)),
    installedFileIdentityPremise: INSTALLED_FILE_IDENTITY_PREMISE,
    requireModule: process.features.require_module === true
  }
}
function relative(file) {
  return (
    typeof file === 'string' &&
    file.length > 0 &&
    !file.includes('\\') &&
    !path.isAbsolute(file) &&
    path.posix.normalize(file) === file &&
    file !== '..' &&
    !file.startsWith('../')
  )
}
const U = Object.freeze({ t: 'unknown' })
const primitive = (v) => ({ t: 'primitive', v })
const VOID = primitive(undefined)
// SPEC0247 C1: the initial `module.exports` of a CJS module is its own
// `exports` object, opaque, with identity per file. It decides no `if`, `?:`,
// `!` or comparison and enters no `+` or template; property read, call,
// reflection, computed key and specifier over it are refused at the point of
// use by the existing rules (none of them accepts this value kind).
const cjsExportsObject = (file) =>
  Object.freeze({ t: 'cjs-exports-object', id: 'cjs-exports:' + file })
const valueKey = (v) =>
  v.t === 'primitive'
    ? 'p:' + typeof v.v + ':' + String(v.v)
    : v.t === 'union'
      ? 'union:' + v.values.map(valueKey).sort().join('|')
      : v.id || v.t

export function analyzeSemanticBoundary(input, { refusalCensus = false } = {}) {
  // Refusal census: the v2 metadata refusals, negative evidence only.
  const census = refusalCensus === true
  let limits
  try {
    limits = limitsFor(input)
  } catch (error) {
    const early = empty(SEMANTIC_LIMITS, error.message)
    early.phases = Object.fromEntries(
      PHASES.map((p) => [p, 'SKIPPED:' + error.message.split(':')[0]])
    )
    early.bodyCoverage = {
      modules: { total: 0, started: 0, completed: 0 },
      containedEdges: 0
    }
    early.installedFileIdentity = {
      premise: INSTALLED_FILE_IDENTITY_PREMISE,
      files: []
    }
    return early
  }
  const out = empty(limits, '')
  out.unknowns = []
  // SPEC0241 §3.2: deterministic phases and body coverage on every exit path.
  const phases = Object.fromEntries(PHASES.map((p) => [p, null]))
  const coverage = {
    modules: { total: 0, started: 0, completed: 0 },
    containedEdges: 0
  }
  const fileIdentity = new Map(),
    premiseCache = new Map()
  let inBody = false
  // §3.1: canonical-key set deduplication; semantics and final order unchanged.
  const unknownKeys = new Set()
  const CONTAINED = Object.freeze({ t: 'contained-edge' })
  const unknown = (file, reason, detail = '', originId = null) => {
    // Preserve the established frontier reason and the actual acquired raw
    // source for malformed UTF-8; metadata/path encoding remains distinct.
    if (reason === 'UNKNOWN_INPUT_ENCODING') reason = 'UNKNOWN_ENCODING'
    const item = {
      file: relative(file) ? file : '',
      reason,
      originId,
      detail: root ? String(detail).replaceAll(root + '/', '') : String(detail)
    }
    const key = semanticCanonicalJson(item)
    if (!unknownKeys.has(key)) {
      unknownKeys.add(key)
      out.unknowns.push(item)
    }
    return U
  }
  const started = performance.now()
  let ts, root, profile, resolution
  const snapshots = new Map(),
    probes = new Map(),
    modules = new Map(),
    astFiles = new Map(),
    states = new Set(),
    contexts = new Map(),
    stack = [],
    contextStack = []
  const reachedPackages = new Map(),
    resolutionEdges = new Map(),
    rules = new Set(['K0', 'K7'])
  // SPEC0244 (E1/E2, never in the refusal census): the resolved binding of
  // every export name (module#local after indirect exports and stars, as the
  // ECMAScript ResolveExport; a re-exported namespace is a binding of the
  // re-exporting module), namespaces left incomplete, ambiguous names, names
  // provided by stars and modules with a non-qualified star.
  const AMBIGUOUS = Symbol('AMBIGUOUS_STAR')
  const exportIdentity = new Map(),
    importIdentity = new Map(),
    incompleteNamespaces = new Set(),
    starOrigins = new Map(),
    ambiguousStarNames = new Map(),
    starNames = new Map(),
    poisonedStars = new Set(),
    explicitExports = new Map()
  const bump = (key, value, cap) => {
    out.usage[key] = Math.max(out.usage[key], value)
    if (value > limits[cap]) throw Error('UNKNOWN_ANALYSIS_LIMIT:' + cap)
    if (performance.now() - started >= limits.timeoutMs)
      throw Error('UNKNOWN_ANALYSIS_LIMIT:timeoutMs')
  }
  function syncAcquisitionUsage() {
    if (!resolution) return
    const usage = resolution.usage
    out.usage.fileBytes = usage.fileBytes
    out.usage.totalBytes = usage.totalBytes
    out.usage.files = usage.files
  }
  function physical(file) {
    if (!relative(file)) throw Error('UNKNOWN_PATH:' + file)
    const acquired = resolution.read(file)
    snapshots.set(file, {
      sha256: acquired.sha256,
      real: path.join(root, file),
      stat: acquired.stat
    })
    syncAcquisitionUsage()
    return acquired.text
  }
  function json(file) {
    const body = JSON.parse(physical(file))
    if (!record(body)) throw Error('UNKNOWN_INVALID_MANIFEST:' + file)
    return body
  }
  function probe(file) {
    if (!relative(file)) throw Error('UNKNOWN_PATH:' + file)
    const exists = resolution.probe(file)
    if (probes.has(file) && probes.get(file) !== exists)
      throw Error('UNKNOWN_RESOLUTION_MUTATION:' + file)
    probes.set(file, exists)
    syncAcquisitionUsage()
    return exists
  }
  function manifestAt(file) {
    let dir = path.posix.dirname(file)
    while (true) {
      const manifest = dir === '.' ? 'package.json' : dir + '/package.json'
      if (probe(manifest)) return { file: manifest, body: json(manifest) }
      if (dir === '.') return null
      dir = path.posix.dirname(dir)
    }
  }
  function product(file, from) {
    if (file === 'products' || file.startsWith('products/')) {
      const item = { file: from, reason: 'PRODUCT_DEPENDENCY', target: file }
      if (
        !out.violations.some(
          (x) => semanticCanonicalJson(x) === semanticCanonicalJson(item)
        )
      ) {
        out.violations.push(item)
        // Best effort: the violation is already in the output; a failed
        // stream write must not change the analysis path.
        if (isWorker())
          try {
            fs.writeSync(2, VIOLATION_STREAM + JSON.stringify(item) + '\n')
          } catch {
            // The stdout result still carries it if the worker completes.
          }
      }
      return true
    }
    return false
  }
  function edge(from, target) {
    if (!resolutionEdges.has(from)) resolutionEdges.set(from, new Set())
    resolutionEdges.get(from).add(target)
  }
  function resolve(from, specifier, mode) {
    if (typeof specifier !== 'string') throw Error('UNKNOWN_RESOLUTION')
    // Common preflight, repeated by the resolver before any metadata lookup.
    if (isBuiltin(specifier)) throw Error('UNKNOWN_NATIVE_BUILTIN')
    const selected = resolution.resolve({ from, specifier, mode })
    syncAcquisitionUsage()
    const file = selected.file
    product(file, from)
    if (!relative(file)) throw Error('UNKNOWN_EXTERNAL_PATH')
    if (
      !['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'].includes(
        path.posix.extname(file)
      ) ||
      /\.d\.[cm]?ts$/.test(file) ||
      (mode === 'import' &&
        /\.[cm]?ts$/.test(file) &&
        file.split('/').includes('node_modules'))
    )
      throw Error('UNKNOWN_FORMAT:' + file)
    if (selected.owner && !selected.owner.workspace) {
      const { key, manifest } = selected.owner
      if (!reachedPackages.has(key))
        reachedPackages.set(key, {
          key,
          manifest,
          identity: input.installed.find(
            (x) => x.key === key && x.manifest === manifest
          ),
          entries: new Set()
        })
      // SPEC0241 §3.4: an edge owner and the physical key must coincide.
      const derived = installedPackageKey(file)
      if (!census && inBody && derived && derived.key !== key)
        unknown(file, 'UNKNOWN_INSTALLED_FILE_IDENTITY', 'OWNER_KEY')
    }
    const owner = manifestAt(file)
    const targetMode =
      /\.c(?:js|ts)$/.test(file) ||
      (!/\.m(?:js|ts)$/.test(file) && owner?.body.type !== 'module')
        ? 'require'
        : 'import'
    if (mode !== targetMode) throw Error('UNKNOWN_MODULE_INTEROP:' + file)
    edge(from, file)
    return file
  }
  // Lexical declaration lookup for acquisition census only. No execution or
  // exported-type inference: finite strings only, and shadowed loaders refused.
  function lexical(node, name) {
    for (let scope = node.parent; scope; scope = scope.parent) {
      const candidates = []
      if (ts.isSourceFile(scope) || ts.isBlock(scope))
        candidates.push(...scope.statements)
      if (ts.isFunctionLike(scope)) {
        for (const p of scope.parameters || [])
          if (p.name.getText() === name) return { kind: 'unknown' }
        if (scope.name?.text === name) return { kind: 'unknown' }
      }
      for (const s of candidates) {
        if (ts.isVariableStatement(s))
          for (const d of s.declarationList.declarations) {
            if (ts.isIdentifier(d.name) && d.name.text === name)
              return s.declarationList.flags & ts.NodeFlags.Const
                ? { kind: 'const', node: d.initializer }
                : { kind: 'unknown' }
            if (!ts.isIdentifier(d.name) && d.name.getText().includes(name))
              return { kind: 'unknown' }
          }
        if (
          (ts.isFunctionDeclaration(s) || ts.isClassDeclaration(s)) &&
          s.name?.text === name
        )
          return { kind: 'unknown' }
        if (ts.isImportDeclaration(s) && s.importClause) {
          if (
            s.importClause.name?.text === name ||
            s.importClause.namedBindings?.name?.text === name ||
            s.importClause.namedBindings?.elements?.some(
              (e) => e.name.text === name
            )
          )
            return { kind: 'unknown' }
        }
      }
    }
    return null
  }
  function finite(node, seen = new Set()) {
    if (!node || seen.has(node)) return null
    seen = new Set([...seen, node])
    if (ts.isStringLiteralLike(node)) return [node.text]
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isSatisfiesExpression(node)
    )
      return finite(node.expression, seen)
    if (ts.isIdentifier(node)) {
      const binding = lexical(node, node.text)
      return binding?.kind === 'const' ? finite(binding.node, seen) : null
    }
    if (ts.isConditionalExpression(node)) {
      const a = finite(node.whenTrue, seen),
        b = finite(node.whenFalse, seen)
      return a && b ? [...new Set([...a, ...b])].slice(0, 129) : null
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const a = finite(node.left, seen),
        b = finite(node.right, seen)
      if (!a || !b || a.length * b.length > 128) return null
      return [...new Set(a.flatMap((x) => b.map((y) => x + y)))]
    }
    if (ts.isTemplateExpression(node)) {
      let values = [node.head.text]
      for (const span of node.templateSpans) {
        const part = finite(span.expression, seen)
        if (!part || values.length * part.length > 128) return null
        values = values.flatMap((x) =>
          part.map((y) => x + y + span.literal.text)
        )
      }
      return values
    }
    return null
  }
  function acquire(file, visiting = new Set()) {
    product(file, file)
    if (astFiles.has(file) || visiting.has(file)) return
    // Hard acquisition ceilings are separate from reduced analysis counters:
    // the census finds known product violations before a test reduction fires.
    if (astFiles.size >= SEMANTIC_LIMITS.maxFiles)
      throw Error('UNKNOWN_ANALYSIS_LIMIT:maxFiles')
    const source = physical(file)
    if (
      Buffer.from(source).toString('utf8') !== source ||
      source.includes('\ufffd')
    )
      unknown(file, 'UNKNOWN_ENCODING')
    const sf = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      // SPEC0245 T1: closed table of ScriptKind by extension (TypeScript's own
      // default for the runtime extensions; any other name parses as JS). JSX
      // forms reach the expression fallback and are refused (T2); .tsx/.jsx and
      // unknown extensions keep UNKNOWN_FORMAT as non-runtime formats.
      /\.tsx$/.test(file)
        ? ts.ScriptKind.TSX
        : /\.jsx$/.test(file)
          ? ts.ScriptKind.JSX
          : /\.[cm]?ts$/.test(file)
            ? ts.ScriptKind.TS
            : ts.ScriptKind.JS
    )
    astFiles.set(file, sf)
    if (sf.parseDiagnostics.length) unknown(file, 'UNKNOWN_PARSE')
    const owner = manifestAt(file)
    const cjs =
      /\.c(?:js|ts)$/.test(file) ||
      (!/\.m(?:js|ts)$/.test(file) && owner?.body.type !== 'module')
    let visited = 0
    const visit = (n) => {
      if (++visited > SEMANTIC_LIMITS.maxNodes)
        throw Error('UNKNOWN_ANALYSIS_LIMIT:maxNodes')
      let specs = null,
        mode = 'import'
      if (
        (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
        n.moduleSpecifier &&
        !(n.importClause?.isTypeOnly || n.isTypeOnly)
      )
        specs = [n.moduleSpecifier.text]
      if (ts.isCallExpression(n)) {
        if (n.expression.kind === ts.SyntaxKind.ImportKeyword)
          specs = finite(n.arguments[0])
        if (
          cjs &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === 'require' &&
          !lexical(n.expression, 'require')
        ) {
          mode = 'require'
          specs = finite(n.arguments[0])
        }
        if (
          cjs &&
          ts.isPropertyAccessExpression(n.expression) &&
          ts.isIdentifier(n.expression.expression) &&
          n.expression.expression.text === 'require' &&
          n.expression.name.text === 'resolve' &&
          !lexical(n.expression, 'require')
        ) {
          mode = 'require'
          specs = finite(n.arguments[0])
        }
      }
      for (const spec of specs || []) {
        try {
          const target = resolve(file, spec, mode)
          acquire(target, new Set([...visiting, file]))
        } catch (error) {
          unknown(
            relative(error.file) ? error.file : file,
            error.message.split(':')[0],
            error.message
          )
        }
      }
      ts.forEachChild(n, visit)
    }
    visit(sf)
  }
  function contained(value) {
    return value === CONTAINED ? U : value
  }
  function union(values) {
    const flat = values.flatMap((v) => (v.t === 'union' ? v.values : [v]))
    if (flat.some((v) => v === U)) return U
    const distinct = [...new Map(flat.map((v) => [valueKey(v), v])).values()]
    bump('unionValues', distinct.length, 'maxUnionValues')
    return distinct.length === 1
      ? distinct[0]
      : { t: 'union', values: distinct }
  }
  function env(parent = null, receiver = U) {
    return { parent, receiver, bindings: new Map(), id: '' }
  }
  function find(e, name) {
    for (; e; e = e.parent)
      if (e.bindings.has(name)) return e.bindings.get(name)
    return null
  }
  function state(n, e, file) {
    const visible = [],
      names = new Set()
    for (let cursor = e; cursor; cursor = cursor.parent)
      for (const [k, v] of cursor.bindings)
        if (!names.has(k)) {
          names.add(k)
          visible.push([k, valueKey(v)])
        }
    const id =
      file +
      ':' +
      n.pos +
      ':' +
      n.end +
      ':' +
      valueKey(e.receiver) +
      ':' +
      semanticCanonicalJson(visible.sort((a, b) => sort(a[0], b[0])))
    states.add(id)
    bump('states', states.size, 'maxStates')
  }
  function object(n, props = new Map(), file = '') {
    rules.add('K2')
    return {
      t: 'object',
      id: file + ':' + n.pos + ':' + n.end + ':' + hash(contextStack.join('/')),
      props,
      array: false
    }
  }
  function get(v, key, file) {
    if (
      v === U ||
      key.t !== 'primitive' ||
      !['string', 'number'].includes(typeof key.v)
    )
      return unknown(file, 'UNKNOWN_PROPERTY')
    if (v.t === 'union') return union(v.values.map((x) => get(x, key, file)))
    if (
      v.t === 'intrinsic' &&
      [
        'getPrototypeOf',
        'getOwnPropertyDescriptor',
        'getOwnPropertyDescriptors'
      ].includes(key.v)
    )
      return { t: 'intrinsicMethod', id: 'Object.' + key.v, name: key.v }
    if (v.t !== 'object' && v.t !== 'namespace')
      return unknown(file, 'UNKNOWN_PROPERTY')
    // A missing own property is not undefined for ordinary property access:
    // it may resolve through a prototype (constructor, __proto__, etc.).
    return v.props.has(String(key.v))
      ? v.props.get(String(key.v))
      : unknown(file, 'UNKNOWN_INHERITED_PROPERTY', String(key.v))
  }
  function functionValue(n, e, file) {
    // SPEC0241 §3.3: K3 and the moment of refusal are unchanged; the detail
    // names every closed category of the function (census keeps v3).
    const categories = []
    if (!n.body) categories.push('NO_BODY')
    if (n.asteriskToken) categories.push('GENERATOR')
    if (n.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword))
      categories.push('ASYNC')
    if (n.parameters.some((p) => !ts.isIdentifier(p.name)))
      categories.push('PARAMETER_PATTERN')
    if (n.parameters.some((p) => p.dotDotDotToken))
      categories.push('PARAMETER_REST')
    if (n.parameters.some((p) => p.initializer))
      categories.push('PARAMETER_INITIALIZER')
    if (categories.length) {
      if (census) return unknown(file, 'UNKNOWN_FUNCTION')
      for (const category of categories)
        unknown(file, 'UNKNOWN_FUNCTION', category)
      return U
    }
    const codeId = file + ':' + n.pos + ':' + n.end
    return {
      t: 'function',
      id: codeId + ':' + hash(contextStack.join('/')),
      codeId,
      node: n,
      capture: e,
      file
    }
  }
  function call(fn, args, receiver, file) {
    rules.add('K3')
    if (fn.t === 'intrinsicMethod') {
      rules.add('K4')
      const target = args[0]
      if (target?.t !== 'object' || args.some((x) => x === U))
        return unknown(file, 'UNKNOWN_REFLECTION')
      if (fn.name === 'getPrototypeOf')
        return {
          t: 'prototype',
          id: target.array ? 'Array.prototype' : 'Object.prototype'
        }
      function descriptor(v, key) {
        const arrayLength = target.array && key === 'length'
        return {
          t: 'object',
          id: target.id + ':descriptor:' + key,
          props: new Map([
            ['value', v],
            ['writable', primitive(true)],
            ['enumerable', primitive(!arrayLength)],
            ['configurable', primitive(!arrayLength)]
          ])
        }
      }
      if (fn.name === 'getOwnPropertyDescriptor') {
        if (
          args.length !== 2 ||
          args[1].t !== 'primitive' ||
          typeof args[1].v !== 'string'
        )
          return unknown(file, 'UNKNOWN_REFLECTION')
        return target.props.has(args[1].v)
          ? descriptor(target.props.get(args[1].v), args[1].v)
          : VOID
      }
      if (args.length !== 1) return unknown(file, 'UNKNOWN_REFLECTION')
      return {
        t: 'object',
        id: target.id + ':descriptors',
        props: new Map([...target.props].map(([k, v]) => [k, descriptor(v, k)]))
      }
    }
    if (fn.t !== 'function') return unknown(file, 'UNKNOWN_CALL')
    if (stack.includes(fn.codeId)) return unknown(file, 'UNKNOWN_CYCLE')
    const signature =
      fn.id +
      ':' +
      valueKey(receiver) +
      ':' +
      args.map(valueKey).join(',') +
      ':' +
      [...fn.capture.bindings].map(([k, v]) => k + '=' + valueKey(v)).join(',')
    if (!contexts.has(fn.id)) contexts.set(fn.id, new Set())
    contexts.get(fn.id).add(signature)
    bump('contexts', contexts.get(fn.id).size, 'maxContexts')
    bump('callDepth', stack.length + 1, 'maxCallDepth')
    const local = env(
      fn.capture,
      ts.isArrowFunction(fn.node) ? fn.capture.receiver : receiver
    )
    fn.node.parameters.forEach((p, i) =>
      local.bindings.set(p.name.text, args[i] || VOID)
    )
    stack.push(fn.codeId)
    contextStack.push(signature)
    let result
    try {
      result = ts.isBlock(fn.node.body)
        ? block(fn.node.body.statements, local, fn.file).value
        : expression(fn.node.body, local, fn.file)
    } finally {
      stack.pop()
      contextStack.pop()
    }
    return result
  }
  // SPEC0241 §3.1: every body edge (static import, export-from, each finite
  // dynamic import and loader alternative) resolves and loads its target in
  // containment. A listed reason records the tuple in the acquisition form and
  // yields U; no alternative target, mode, fallback or retry. Census keeps v3.
  function edgeLoad(from, specifier, mode) {
    if (census) return load(resolve(from, specifier, mode))
    try {
      return load(resolve(from, specifier, mode))
    } catch (error) {
      const message = typeof error?.message === 'string' ? error.message : ''
      const reason = containedEdgeReason(message)
      if (!reason) throw error
      coverage.containedEdges++
      unknown(relative(error.file) ? error.file : from, reason, message)
      return CONTAINED
    }
  }
  function expression(n, e, file) {
    if (!n) return VOID
    state(n, e, file)
    rules.add('K1')
    if (ts.isStringLiteralLike(n)) {
      bump('unionValues', 1, 'maxUnionValues')
      return primitive(n.text)
    }
    if (ts.isNumericLiteral(n)) {
      bump('unionValues', 1, 'maxUnionValues')
      return primitive(Number(n.text))
    }
    if (
      [
        ts.SyntaxKind.TrueKeyword,
        ts.SyntaxKind.FalseKeyword,
        ts.SyntaxKind.NullKeyword
      ].includes(n.kind)
    ) {
      bump('unionValues', 1, 'maxUnionValues')
      return primitive(
        n.kind === ts.SyntaxKind.NullKeyword
          ? null
          : n.kind === ts.SyntaxKind.TrueKeyword
      )
    }
    if (ts.isIdentifier(n)) {
      const binding = find(e, n.text)
      if (binding)
        return binding === U
          ? unknown(file, 'UNKNOWN_BINDING_VALUE', n.text)
          : binding
      if (n.text === 'undefined') {
        bump('unionValues', 1, 'maxUnionValues')
        return VOID
      }
      if (n.text === 'Object') return { t: 'intrinsic', id: 'Object' }
      if (n.text === 'require' && modules.get(file)?.mode === 'require')
        return { t: 'loader', id: 'require' }
      return unknown(file, 'UNKNOWN_BINDING', n.text)
    }
    if (n.kind === ts.SyntaxKind.ThisKeyword)
      return e.receiver === U ? unknown(file, 'UNKNOWN_THIS') : e.receiver
    if (
      ts.isParenthesizedExpression(n) ||
      ts.isAsExpression(n) ||
      ts.isTypeAssertionExpression(n) ||
      ts.isNonNullExpression(n) ||
      ts.isSatisfiesExpression(n)
    )
      return expression(n.expression, e, file)
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n))
      return functionValue(n, e, file)
    if (ts.isObjectLiteralExpression(n)) {
      const result = object(n, new Map(), file)
      for (const p of n.properties) {
        if (
          ts.isSpreadAssignment(p) ||
          ts.isGetAccessor(p) ||
          ts.isSetAccessor(p)
        ) {
          unknown(file, 'UNKNOWN_OBJECT')
          continue
        }
        let key
        if (p.name && ts.isComputedPropertyName(p.name)) {
          const v = expression(p.name.expression, e, file)
          if (v.t === 'primitive') key = String(v.v)
        } else key = p.name?.text
        if (key === undefined || key === '__proto__' || result.props.has(key)) {
          unknown(file, 'UNKNOWN_OBJECT')
          continue
        }
        if (ts.isPropertyAssignment(p))
          result.props.set(key, expression(p.initializer, e, file))
        else if (ts.isShorthandPropertyAssignment(p))
          result.props.set(key, expression(p.name, e, file))
        else if (ts.isMethodDeclaration(p))
          result.props.set(key, functionValue(p, e, file))
        else unknown(file, 'UNKNOWN_OBJECT')
      }
      return result
    }
    if (ts.isArrayLiteralExpression(n)) {
      if (
        n.elements.some(
          (x) => ts.isSpreadElement(x) || ts.isOmittedExpression(x)
        )
      )
        return unknown(file, 'UNKNOWN_ARRAY')
      return {
        ...object(
          n,
          new Map([
            ...n.elements.map((x, i) => [String(i), expression(x, e, file)]),
            ['length', primitive(n.elements.length)]
          ]),
          file
        ),
        array: true
      }
    }
    if (ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n)) {
      if (n.questionDotToken) return unknown(file, 'UNKNOWN_OPTIONAL_CHAIN')
      return get(
        expression(n.expression, e, file),
        ts.isPropertyAccessExpression(n)
          ? primitive(n.name.text)
          : expression(n.argumentExpression, e, file),
        file
      )
    }
    if (ts.isCallExpression(n)) {
      if (
        n.questionDotToken ||
        n.typeArguments?.length ||
        n.arguments.some(ts.isSpreadElement)
      )
        return unknown(file, 'UNKNOWN_CALL')
      if (n.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specs = expression(n.arguments[0], e, file),
          values = specs.t === 'union' ? specs.values : [specs]
        for (const v of values)
          if (v.t === 'primitive' && typeof v.v === 'string')
            edgeLoad(file, v.v, 'import')
          else unknown(file, 'UNKNOWN_RESOLUTION')
        // Promise/await is outside K3/K6; do not substitute a namespace value.
        return unknown(file, 'UNKNOWN_DYNAMIC_IMPORT_PROMISE')
      }
      let receiver = U,
        fn
      if (
        ts.isPropertyAccessExpression(n.expression) ||
        ts.isElementAccessExpression(n.expression)
      ) {
        receiver = expression(n.expression.expression, e, file)
        fn = get(
          receiver,
          ts.isPropertyAccessExpression(n.expression)
            ? primitive(n.expression.name.text)
            : expression(n.expression.argumentExpression, e, file),
          file
        )
      } else fn = expression(n.expression, e, file)
      const args = n.arguments.map((x) => expression(x, e, file))
      if (fn.t === 'loader') {
        if (args.length !== 1) return unknown(file, 'UNKNOWN_RESOLUTION')
        const values = args[0].t === 'union' ? args[0].values : [args[0]]
        return union(
          values.map((v) =>
            v.t === 'primitive' && typeof v.v === 'string'
              ? contained(edgeLoad(file, v.v, 'require'))
              : unknown(file, 'UNKNOWN_RESOLUTION')
          )
        )
      }
      return call(fn, args, receiver, file)
    }
    if (ts.isBinaryExpression(n)) {
      if (n.operatorToken.kind === ts.SyntaxKind.EqualsToken)
        return unknown(file, 'UNKNOWN_MUTATION')
      const left = expression(n.left, e, file),
        right = expression(n.right, e, file)
      const a = left.t === 'union' ? left.values : [left],
        b = right.t === 'union' ? right.values : [right]
      const values = []
      for (const x of a)
        for (const y of b) {
          if (x.t !== 'primitive' || y.t !== 'primitive')
            return unknown(file, 'UNKNOWN_OPERATOR')
          switch (n.operatorToken.kind) {
            case ts.SyntaxKind.PlusToken:
              values.push(primitive(x.v + y.v))
              break
            case ts.SyntaxKind.EqualsEqualsEqualsToken:
              values.push(primitive(x.v === y.v))
              break
            case ts.SyntaxKind.ExclamationEqualsEqualsToken:
              values.push(primitive(x.v !== y.v))
              break
            default:
              return unknown(file, 'UNKNOWN_OPERATOR')
          }
          if (values.length > limits.maxUnionValues)
            throw Error('UNKNOWN_ANALYSIS_LIMIT:maxUnionValues')
        }
      return union(values)
    }
    if (ts.isTemplateExpression(n)) {
      let values = [primitive(n.head.text)]
      for (const span of n.templateSpans) {
        const v = expression(span.expression, e, file),
          parts = v.t === 'union' ? v.values : [v]
        if (parts.some((x) => x.t !== 'primitive'))
          return unknown(file, 'UNKNOWN_TEMPLATE')
        values = values.flatMap((x) =>
          parts.map((y) => primitive(x.v + String(y.v) + span.literal.text))
        )
        const u = union(values)
        values = u.t === 'union' ? u.values : [u]
      }
      return union(values)
    }
    if (ts.isConditionalExpression(n)) {
      const condition = expression(n.condition, e, file)
      if (condition.t === 'primitive')
        return expression(condition.v ? n.whenTrue : n.whenFalse, e, file)
      return union([
        expression(n.whenTrue, e, file),
        expression(n.whenFalse, e, file)
      ])
    }
    if (
      ts.isPrefixUnaryExpression(n) &&
      n.operator === ts.SyntaxKind.ExclamationToken
    ) {
      const v = expression(n.operand, e, file)
      return v.t === 'primitive'
        ? primitive(!v.v)
        : unknown(file, 'UNKNOWN_OPERATOR')
    }
    return unknown(file, 'UNKNOWN_UNSUPPORTED_SYNTAX', ts.SyntaxKind[n.kind])
  }
  function bind(name, value, e, file) {
    if (ts.isIdentifier(name)) {
      e.bindings.set(name.text, value)
      return
    }
    if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
      name.elements.forEach((element, i) => {
        if (
          !ts.isBindingElement(element) ||
          element.dotDotDotToken ||
          element.initializer
        ) {
          unknown(file, 'UNKNOWN_BINDING_PATTERN')
          return
        }
        if (
          element.propertyName &&
          ts.isComputedPropertyName(element.propertyName)
        ) {
          // Even an unsupported binding key evaluates its expression first.
          // Preserve known effects/product edges; never substitute the local name.
          expression(element.propertyName.expression, e, file)
          unknown(file, 'UNKNOWN_COMPUTED_BINDING')
          return
        }
        const key = ts.isArrayBindingPattern(name)
          ? String(i)
          : element.propertyName?.text || element.name.text
        if (key === undefined) {
          unknown(file, 'UNKNOWN_BINDING_PATTERN')
          return
        }
        bind(element.name, get(value, primitive(key), file), e, file)
      })
      return
    }
    unknown(file, 'UNKNOWN_BINDING_PATTERN')
  }
  function exported(n) {
    return !!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  }
  function ambient(n) {
    return !!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword)
  }
  function isDefaultExport(n) {
    return !!n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)
  }
  function identityOf(file, name) {
    return exportIdentity.get(file)?.get(name) ?? file + '#' + name
  }
  function setIdentity(file, name, identity) {
    if (census) return
    if (!exportIdentity.has(file)) exportIdentity.set(file, new Map())
    exportIdentity.get(file).set(name, identity)
  }
  function incomplete(file) {
    if (!census) incompleteNamespaces.add(file)
  }
  // SPEC0244 §3.1 rule 3: the names of every explicit runtime export of the
  // module, wherever it stands; type-only and ambient exports never mask.
  function explicitRuntimeExports(file) {
    if (explicitExports.has(file)) return explicitExports.get(file)
    const names = new Set()
    const collect = (name) => {
      if (ts.isIdentifier(name)) names.add(name.text)
      else if (
        ts.isObjectBindingPattern(name) ||
        ts.isArrayBindingPattern(name)
      )
        for (const element of name.elements)
          if (ts.isBindingElement(element)) collect(element.name)
    }
    for (const n of astFiles.get(file)?.statements || []) {
      if (ts.isExportAssignment(n)) {
        if (!n.isExportEquals) names.add('default')
      } else if (ts.isExportDeclaration(n)) {
        if (n.isTypeOnly || !n.exportClause) continue
        if (ts.isNamedExports(n.exportClause)) {
          for (const x of n.exportClause.elements)
            if (!x.isTypeOnly) names.add(x.name.text)
        } else names.add(n.exportClause.name.text)
      } else if (!exported(n) || ambient(n)) continue
      else if (ts.isVariableStatement(n))
        for (const d of n.declarationList.declarations) collect(d.name)
      else if (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n)) {
        if (isDefaultExport(n)) names.add('default')
        else if (n.name) names.add(n.name.text)
      } else if (
        (ts.isEnumDeclaration(n) || ts.isModuleDeclaration(n)) &&
        ts.isIdentifier(n.name)
      )
        names.add(n.name.text)
      else if (ts.isImportEqualsDeclaration(n) && !n.isTypeOnly)
        names.add(n.name.text)
    }
    explicitExports.set(file, names)
    return names
  }
  // SPEC0244 §3.1 rule 5: a non-qualified star keeps its refusal, every name
  // provided by a star of the module becomes U and its namespace incomplete.
  function poison(file) {
    poisonedStars.add(file)
    incompleteNamespaces.add(file)
    for (const k of starNames.get(file)) {
      modules.get(file).exports.set(k, U)
      setIdentity(file, k, 'opaque:' + file + '#' + k)
    }
  }
  // SPEC0244 E1: `export * from` and `export * as ns from` with ECMAScript
  // semantics when the source is an analysed ESM module with a complete
  // namespace (not contained, not a cycle, not U). Returns false when the
  // source does not qualify; the caller keeps UNKNOWN_REEXPORT.
  function star(n, namespace, file) {
    const exports = modules.get(file).exports
    const explicit = explicitRuntimeExports(file)
    if (!starNames.has(file)) {
      starNames.set(file, new Set())
      starOrigins.set(file, new Map())
      ambiguousStarNames.set(file, new Set())
    }
    const names = starNames.get(file),
      origins = starOrigins.get(file),
      ambiguous = ambiguousStarNames.get(file)
    const qualified =
      namespace &&
      namespace !== CONTAINED &&
      namespace.t === 'namespace' &&
      !incompleteNamespaces.has(namespace.id)
    if (n.exportClause) {
      const name = n.exportClause.name.text
      if (qualified) {
        // A re-exported namespace is a binding of this module, as in the
        // pinned Node 22 (two such stars conflict); conservative versus the
        // ECMAScript text (SPEC0244 BUILD R1-01). It creates no local binding,
        // so its identity never equals a local one (BUILD R2-01).
        exports.set(name, namespace)
        setIdentity(file, name, file + '#*namespace*' + name)
        return true
      }
      exports.set(name, U)
      setIdentity(file, name, 'opaque:' + file + '#' + name)
      poison(file)
      return false
    }
    if (!qualified || poisonedStars.has(file)) {
      // Names an analysable source would provide exist as U, never absent.
      if (namespace && namespace !== CONTAINED && namespace.t === 'namespace')
        for (const k of namespace.props.keys())
          if (k !== 'default' && !explicit.has(k)) names.add(k)
      poison(file)
      return qualified
    }
    for (const [k, v] of namespace.props) {
      if (k === 'default' || explicit.has(k)) continue
      names.add(k)
      if (ambiguous.has(k)) continue
      const identity = identityOf(namespace.id, k)
      if (
        identity === AMBIGUOUS ||
        (origins.has(k) && origins.get(k) !== identity)
      ) {
        // Different resolved bindings (or a name already ambiguous in the
        // source): U with the root here; sticky for every later star.
        ambiguous.add(k)
        exports.set(k, U)
        setIdentity(file, k, AMBIGUOUS)
        unknown(file, 'UNKNOWN_REEXPORT', 'AMBIGUOUS_STAR:' + k)
        continue
      }
      origins.set(k, identity)
      exports.set(k, v)
      setIdentity(file, k, identity)
    }
    return true
  }
  function checkExport(v, file, seen = new Set()) {
    if (seen.has(v)) return
    seen.add(v)
    if (v === U) {
      unknown(file, 'UNKNOWN_EXPORT')
      return
    }
    // SPEC0247 C1: without a non-delimited handle nothing in the module reaches
    // its initial exports object, so it emits no tuple here (§2, point 3).
    if (v.t === 'cjs-exports-object') return
    // Public mutable values escape to consumers the kernel does not model.
    // A later public call may observe an externally changed descriptor or
    // prototype. v1 has no external-alias/strong-update rule to recover it.
    // Refuse the entire closure rather than validate a captured object using
    // the allocation's pre-export snapshot (independent of export order).
    if (v.t === 'object' || v.t === 'prototype') {
      unknown(file, 'UNKNOWN_EXPORTED_MUTABLE_STATE')
      return
    }
    if (v.t === 'union') {
      for (const item of v.values) checkExport(item, file, seen)
      return
    }
    if (v.t === 'function') {
      checkExport(
        call(
          v,
          v.node.parameters.map(() => U),
          U,
          file
        ),
        file,
        seen
      )
      return
    }
    if (v.t === 'namespace')
      for (const child of v.props.values()) {
        // A public method can be extracted or called with an external receiver.
        if (child.t === 'function')
          checkExport(
            call(
              child,
              child.node.parameters.map(() => U),
              U,
              file
            ),
            file,
            seen
          )
        else checkExport(child, file, seen)
      }
    else if (v.t !== 'primitive') unknown(file, 'UNKNOWN_ESCAPED_CAPABILITY')
  }
  function block(statements, e, file) {
    rules.add('K6')
    // Predeclare the whole block: lexical shadowing and TDZ never become globals.
    for (const n of statements) {
      if (ts.isVariableStatement(n))
        for (const d of n.declarationList.declarations) {
          function predeclare(name) {
            if (ts.isIdentifier(name)) e.bindings.set(name.text, U)
            else if (
              ts.isObjectBindingPattern(name) ||
              ts.isArrayBindingPattern(name)
            )
              for (const element of name.elements)
                if (ts.isBindingElement(element)) predeclare(element.name)
          }
          predeclare(d.name)
        }
      if (ts.isFunctionDeclaration(n) && n.name)
        e.bindings.set(n.name.text, functionValue(n, e, file))
      // SPEC0244 E2: a class name exists (TDZ) with value U from block entry.
      if (!census && ts.isClassDeclaration(n) && n.name)
        e.bindings.set(n.name.text, U)
      if (
        ts.isImportDeclaration(n) &&
        n.importClause &&
        !n.importClause.isTypeOnly
      ) {
        if (n.importClause.name) e.bindings.set(n.importClause.name.text, U)
        if (n.importClause.namedBindings) {
          if (ts.isNamespaceImport(n.importClause.namedBindings))
            e.bindings.set(n.importClause.namedBindings.name.text, U)
          else
            n.importClause.namedBindings.elements.forEach((x) => {
              if (!x.isTypeOnly) e.bindings.set(x.name.text, U)
            })
        }
      }
    }
    for (const n of statements) {
      state(n, e, file)
      if (
        ts.isEmptyStatement(n) ||
        ts.isInterfaceDeclaration(n) ||
        ts.isTypeAliasDeclaration(n)
      )
        continue
      if (ts.isImportDeclaration(n)) {
        // Only the explicit `import type` clause is erased. Inline type
        // specifiers can preserve an empty import and its runtime effects.
        if (n.importClause?.isTypeOnly) continue
        if (n.attributes || n.assertClause)
          unknown(file, 'UNKNOWN_IMPORT_ATTRIBUTES')
        const namespace = edgeLoad(file, n.moduleSpecifier.text, 'import')
        if (namespace === CONTAINED) {
          // §3.1: the contained edge's bindings are U, no property lookup.
          if (n.importClause?.name) e.bindings.set(n.importClause.name.text, U)
          const clause = n.importClause?.namedBindings
          if (clause && ts.isNamespaceImport(clause))
            e.bindings.set(clause.name.text, U)
          else
            for (const x of clause?.elements || [])
              if (!x.isTypeOnly) e.bindings.set(x.name.text, U)
          continue
        }
        if (n.importClause?.name)
          e.bindings.set(
            n.importClause.name.text,
            get(namespace, primitive('default'), file)
          )
        const bindings = n.importClause?.namedBindings
        if (!census && namespace?.t === 'namespace') {
          // SPEC0244: resolved bindings of the imports, for `export { x }`.
          if (!importIdentity.has(file)) importIdentity.set(file, new Map())
          const local = importIdentity.get(file)
          if (n.importClause?.name)
            local.set(
              n.importClause.name.text,
              identityOf(namespace.id, 'default')
            )
          // `import * as ns` then `export { ns }` is a local export entry.
          if (bindings && ts.isNamespaceImport(bindings))
            local.set(bindings.name.text, file + '#' + bindings.name.text)
          else
            for (const x of bindings?.elements || [])
              if (!x.isTypeOnly)
                local.set(
                  x.name.text,
                  identityOf(namespace.id, x.propertyName?.text || x.name.text)
                )
        }
        if (bindings && ts.isNamespaceImport(bindings))
          e.bindings.set(bindings.name.text, namespace)
        else
          for (const x of bindings?.elements || [])
            if (!x.isTypeOnly)
              e.bindings.set(
                x.name.text,
                get(
                  namespace,
                  primitive(x.propertyName?.text || x.name.text),
                  file
                )
              )
        continue
      }
      if (ts.isVariableStatement(n)) {
        if (!(n.declarationList.flags & ts.NodeFlags.Const))
          unknown(file, 'UNKNOWN_MUTABLE_BINDING')
        if (n.modifiers?.some((m) => m.kind === ts.SyntaxKind.DeclareKeyword))
          unknown(file, 'UNKNOWN_RUNTIME_DECLARATION')
        for (const d of n.declarationList.declarations) {
          if (!d.initializer) unknown(file, 'UNKNOWN_MISSING_INITIALIZER')
          const v = expression(d.initializer, e, file)
          bind(d.name, v, e, file)
          if (exported(n)) {
            if (!ts.isIdentifier(d.name)) {
              incomplete(file)
              unknown(file, 'UNKNOWN_EXPORT')
            } else {
              modules.get(file).exports.set(d.name.text, v)
              setIdentity(file, d.name.text, file + '#' + d.name.text)
            }
          }
        }
        continue
      }
      if (ts.isFunctionDeclaration(n)) {
        if (exported(n)) {
          const isDefault = n.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.DefaultKeyword
          )
          const value = n.name
            ? find(e, n.name.text)
            : functionValue(n, e, file)
          if (isDefault) modules.get(file).exports.set('default', value)
          else if (n.name) modules.get(file).exports.set(n.name.text, value)
          else {
            incomplete(file)
            unknown(file, 'UNKNOWN_EXPORT')
          }
          if (isDefault || n.name)
            setIdentity(
              file,
              isDefault ? 'default' : n.name.text,
              file + '#' + (n.name?.text ?? '*default*')
            )
        } else if (!n.name)
          unknown(
            file,
            'UNKNOWN_FUNCTION',
            census ? '' : 'ANONYMOUS_DECLARATION'
          )
        continue
      }
      if (ts.isReturnStatement(n))
        return { returned: true, value: expression(n.expression, e, file) }
      if (ts.isExpressionStatement(n)) {
        const x = n.expression
        if (
          modules.get(file).mode === 'require' &&
          ts.isBinaryExpression(x) &&
          x.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isPropertyAccessExpression(x.left) &&
          ts.isIdentifier(x.left.expression) &&
          x.left.expression.text === 'module' &&
          x.left.name.text === 'exports' &&
          !find(e, 'module')
        ) {
          modules.get(file).cjs = expression(x.right, e, file)
        } else expression(x, e, file)
        continue
      }
      if (ts.isBlock(n)) {
        const r = block(n.statements, env(e, e.receiver), file)
        if (r.returned) return r
        continue
      }
      if (ts.isIfStatement(n)) {
        const c = expression(n.expression, e, file)
        function branch(b) {
          return !b
            ? { returned: false, value: VOID }
            : block(
                ts.isBlock(b) ? b.statements : [b],
                env(e, e.receiver),
                file
              )
        }
        if (c.t === 'primitive') {
          const r = branch(c.v ? n.thenStatement : n.elseStatement)
          if (r.returned) return r
        } else {
          // SPEC0247 C2: in a CJS module the tracked value after an undecided
          // `if` is the union of the values at the end of each branch; an
          // absent branch contributes the value from before the `if`.
          const module = modules.get(file),
            join = module.mode === 'require',
            before = module.cjs
          const a = branch(n.thenStatement)
          const afterThen = module.cjs
          if (join) module.cjs = before
          const b = branch(n.elseStatement)
          if (join) module.cjs = union([afterThen, module.cjs])
          if (a.returned && b.returned)
            return { returned: true, value: union([a.value, b.value]) }
          // Partially returning branches need control-flow continuations absent v1.
          if (a.returned || b.returned) unknown(file, 'UNKNOWN_PARTIAL_RETURN')
        }
        continue
      }
      if (ts.isExportAssignment(n)) {
        modules
          .get(file)
          .exports.set('default', expression(n.expression, e, file))
        // `export =` is not an ESM export form: the namespace is incomplete.
        if (n.isExportEquals) incomplete(file)
        setIdentity(file, 'default', file + '#*default*')
        continue
      }
      if (ts.isExportDeclaration(n)) {
        if (n.isTypeOnly) continue
        if (n.attributes || n.assertClause)
          unknown(file, 'UNKNOWN_IMPORT_ATTRIBUTES')
        const namespace = n.moduleSpecifier
          ? edgeLoad(file, n.moduleSpecifier.text, 'import')
          : null
        if (!n.exportClause || !ts.isNamedExports(n.exportClause)) {
          if (census || !star(n, namespace, file))
            unknown(file, 'UNKNOWN_REEXPORT')
          continue
        }
        for (const item of n.exportClause.elements)
          if (!item.isTypeOnly) {
            const local = item.propertyName?.text || item.name.text
            modules
              .get(file)
              .exports.set(
                item.name.text,
                namespace === CONTAINED
                  ? U
                  : namespace
                    ? get(namespace, primitive(local), file)
                    : find(e, local) || U
              )
            setIdentity(
              file,
              item.name.text,
              namespace
                ? namespace.t === 'namespace'
                  ? identityOf(namespace.id, local)
                  : 'opaque:' + file + '#' + item.name.text
                : (importIdentity.get(file)?.get(local) ?? file + '#' + local)
            )
          }
        continue
      }
      if (!census && ts.isClassDeclaration(n)) {
        // SPEC0244 E2: the refusal and its root stay; the class body is never
        // analysed. The name (predeclared U) is exported with U.
        unknown(file, 'UNKNOWN_UNSUPPORTED_SYNTAX', ts.SyntaxKind[n.kind])
        if (ambient(n)) unknown(file, 'UNKNOWN_RUNTIME_DECLARATION')
        if (exported(n)) {
          const name = isDefaultExport(n) ? 'default' : n.name?.text
          if (name) {
            modules.get(file).exports.set(name, U)
            setIdentity(file, name, file + '#' + (n.name?.text ?? '*default*'))
          }
        }
        continue
      }
      // An exported form the kernel does not register leaves the namespace
      // incomplete (SPEC0244 §3.1).
      if (exported(n)) incomplete(file)
      unknown(file, 'UNKNOWN_UNSUPPORTED_SYNTAX', ts.SyntaxKind[n.kind])
    }
    return { returned: false, value: VOID }
  }
  // SPEC0247 C0 (§3.1): closed categories of the non-delimited handles of the
  // CommonJS wrapper, by syntax only. Shadowing is ignored: a local named
  // `module`, `exports`, `require` or `eval` counts, which only adds U. A
  // recognized write `module.exports = e` is delimited when its ancestors up
  // to the file are only blocks and `if`.
  function cjsHandleCategories(sf) {
    const found = new Set()
    // `this` and `arguments` belong to a non-arrow function only inside its
    // body or parameters; a computed name or a decorator keeps the outer one.
    const ownFunctionScope = (node) => {
      for (
        let child = node, a = node.parent;
        a && !ts.isSourceFile(a);
        child = a, a = a.parent
      )
        if (
          ts.isFunctionLike(a) &&
          !ts.isArrowFunction(a) &&
          (child === a.body || (a.parameters || []).includes(child))
        )
          return true
      return false
    }
    // The closed list of positions where the identifier does not count.
    const notCounted = (node) => {
      const p = node.parent
      return (
        (ts.isPropertyAccessExpression(p) && p.name === node) ||
        ((ts.isPropertyAssignment(p) ||
          ts.isMethodDeclaration(p) ||
          ts.isPropertyDeclaration(p) ||
          ts.isGetAccessorDeclaration(p) ||
          ts.isSetAccessorDeclaration(p) ||
          ts.isPropertySignature(p) ||
          ts.isMethodSignature(p) ||
          ts.isEnumMember(p)) &&
          p.name === node) ||
        ((ts.isBindingElement(p) ||
          ts.isImportSpecifier(p) ||
          ts.isExportSpecifier(p)) &&
          p.propertyName === node)
      )
    }
    const recognized = (n) =>
      ts.isExpressionStatement(n) &&
      ts.isBinaryExpression(n.expression) &&
      n.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(n.expression.left) &&
      ts.isIdentifier(n.expression.left.expression) &&
      n.expression.left.expression.text === 'module' &&
      n.expression.left.name.text === 'exports'
    const delimited = (n) => {
      for (let a = n.parent; !ts.isSourceFile(a); a = a.parent)
        if (!ts.isBlock(a) && !ts.isIfStatement(a)) return false
      return true
    }
    const visit = (node) => {
      if (recognized(node)) {
        if (!delimited(node))
          found.add(
            ts.findAncestor(node.parent, ts.isFunctionLike)
              ? 'FUNCTION_BODY_WRITE'
              : 'REFUSED_CONTEXT_WRITE'
          )
        // The `module` of a recognized write is the handle being classified.
        visit(node.expression.right)
        return
      }
      if (node.kind === ts.SyntaxKind.ThisKeyword && !ownFunctionScope(node))
        found.add('TOP_LEVEL_THIS')
      if (
        ts.isReturnStatement(node) &&
        !ts.findAncestor(node.parent, ts.isFunctionLike)
      )
        found.add('TOP_LEVEL_RETURN')
      if (ts.isIdentifier(node) && !notCounted(node)) {
        const p = node.parent
        if (node.text === 'module') found.add('MODULE_REFERENCE')
        else if (node.text === 'exports') found.add('EXPORTS_REFERENCE')
        else if (node.text === 'eval') found.add('EVAL_REFERENCE')
        else if (node.text === 'arguments' && !ownFunctionScope(node))
          found.add('TOP_LEVEL_ARGUMENTS')
        else if (
          node.text === 'require' &&
          !(ts.isCallExpression(p) && p.expression === node) &&
          !(
            ts.isPropertyAccessExpression(p) &&
            p.expression === node &&
            p.name.text === 'resolve' &&
            ts.isCallExpression(p.parent) &&
            p.parent.expression === p
          )
        )
          found.add('LOADER_REFERENCE')
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
    return [...found].sort()
  }
  function load(file) {
    rules.add('K5')
    if (modules.has(file)) {
      const module = modules.get(file)
      if (module.loading) return unknown(file, 'UNKNOWN_CYCLE')
      // SPEC0247 C0: U for every importer, from the cache as well.
      return module.mode === 'require'
        ? module.cjsUnknown
          ? U
          : module.cjs
        : { t: 'namespace', id: file, props: module.exports }
    }
    const sf = astFiles.get(file)
    if (!sf) return unknown(file, 'UNKNOWN_MODULE')
    // Installed identity is physical, including relative imports into an
    // installed tree. Bare package spelling is not the identity boundary.
    const installedPath = installedPackageKey(file)
    if (installedPath) {
      const key = installedPath.key,
        manifestFile = key + '/package.json'
      if (!probe(manifestFile)) unknown(file, 'UNKNOWN_INSTALLED_MANIFEST')
      else json(manifestFile)
      if (!reachedPackages.has(key))
        reachedPackages.set(key, {
          key,
          manifest: manifestFile,
          identity: input.installed.find(
            (x) => x.key === key && x.manifest === manifestFile
          ),
          entries: new Set()
        })
      reachedPackages.get(key).entries.add(file)
      // SPEC0241 D2: per-file 0234 identity for every installed file loaded in
      // the body, with or without dist; failure is recorded, the body is
      // still analysed (E5). Census keeps v3.
      if (!census) {
        const premise = installedFilePremise({
          file,
          sha256: snapshots.get(file)?.sha256,
          installed: input.installed,
          cache: premiseCache
        })
        if (premise.ok) fileIdentity.set(file, premise.record)
        else unknown(file, 'UNKNOWN_INSTALLED_FILE_IDENTITY', premise.category)
      }
    }
    const manifest = manifestAt(file)
    if (
      (manifest?.body.imports &&
        (census || !isInactiveImportsMapEligible(manifest.body.imports))) ||
      manifest?.body.browser
    )
      unknown(file, 'UNKNOWN_AMBIGUOUS_RESOLUTION')
    const mode =
      /\.c(?:js|ts)$/.test(file) ||
      (!/\.m(?:js|ts)$/.test(file) && manifest?.body.type !== 'module')
        ? 'require'
        : 'import'
    // ESM syntax in CJS is never interpreted as ESM by a fallback.
    if (
      mode === 'require' &&
      sf.statements.some(
        (n) =>
          (ts.isImportDeclaration(n) && !n.importClause?.isTypeOnly) ||
          exported(n) ||
          ts.isExportDeclaration(n) ||
          ts.isExportAssignment(n)
      )
    )
      unknown(file, 'UNKNOWN_MODULE_FORMAT')
    // A compiled receipt is never authority for an installed file (D2); first
    // party dist keeps recipe v1. Census keeps the v3 rule.
    if (file.split('/').includes('dist') && (census || !installedPath)) {
      const provenance = input.compiled?.files?.find((x) => x.file === file)
      if (
        input.compiled?.status !== 'PROVEN' ||
        provenance?.sha256 !== snapshots.get(file).sha256
      )
        unknown(file, 'UNKNOWN_COMPILED_PROVENANCE')
    }
    // SPEC0247 C1: a CJS module starts with its opaque exports object. C0: one
    // UNKNOWN_CJS_EXPORTS root per closed category, before the body, in the
    // normal pass and in the census; any category leaves U for the importers.
    const module = {
      exports: new Map(),
      cjs: mode === 'require' ? cjsExportsObject(file) : VOID,
      cjsUnknown: false,
      loading: true,
      mode
    }
    if (mode === 'require')
      for (const category of cjsHandleCategories(sf)) {
        module.cjsUnknown = true
        unknown(file, 'UNKNOWN_CJS_EXPORTS', category)
      }
    modules.set(file, module)
    coverage.modules.started++
    if (block(sf.statements, env(), file).returned)
      unknown(file, 'UNKNOWN_TOP_LEVEL_RETURN')
    module.loading = false
    coverage.modules.completed++
    const result =
      mode === 'require'
        ? module.cjs
        : { t: 'namespace', id: file, props: module.exports }
    // SPEC0247 C3: checkExport runs on the tracked value, also when C0 leaves
    // the value U for the importers.
    checkExport(result, file)
    return module.cjsUnknown ? U : result
  }
  try {
    if (
      !record(input) ||
      !path.isAbsolute(input.root) ||
      !Array.isArray(input.starts) ||
      !input.starts.length ||
      !Array.isArray(input.origins) ||
      !Array.isArray(input.installed)
    )
      throw Error('UNKNOWN_INVALID_INPUT')
    root = fs.realpathSync(input.root)
    if (root !== input.root) throw Error('UNKNOWN_ROOT_ALIAS')
    if (process.versions.node !== '22.23.2')
      throw Error('UNKNOWN_TOOLCHAIN_RUNTIME')
    profile = checkTCB()
    if (!process.features.require_module) throw Error('UNKNOWN_RUNTIME_PROFILE')
    const resolutionLimits = { ...RESOLUTION_LIMITS }
    if (input.resolutionLimits !== undefined) {
      if (!record(input.resolutionLimits)) throw Error('UNKNOWN_INVALID_LIMITS')
      for (const [key, value] of Object.entries(input.resolutionLimits)) {
        if (
          !Object.hasOwn(resolutionLimits, key) ||
          !Number.isSafeInteger(value) ||
          value < 0 ||
          value > resolutionLimits[key]
        )
          throw Error('UNKNOWN_INVALID_LIMITS')
        resolutionLimits[key] = value
      }
    }
    resolution = createResolutionSession({
      root,
      limits: { ...SEMANTIC_LIMITS, ...resolutionLimits },
      refusalCensus: census,
      onProduct: (file, from) => product(file, from),
      onNegativeTarget: (file) => {
        try {
          acquire(file)
        } catch (error) {
          unknown(
            relative(error.file) ? error.file : file,
            error.message.split(':')[0],
            error.message
          )
        }
      }
    })
    ts = createRequire(import.meta.url)(PARSER)
    if (ts.version !== '6.0.3') throw Error('UNKNOWN_TOOLCHAIN')
    // Root package/config participate in the acquisition assumptions.
    for (const file of [
      'package.json',
      'package-lock.json',
      'tsconfig.json',
      'tsconfig.base.json'
    ])
      if (probe(file)) {
        const body = json(file)
        if (
          file.startsWith('tsconfig') &&
          (body.compilerOptions?.paths ||
            body.compilerOptions?.plugins ||
            body.extends ||
            body.references)
        )
          unknown(file, 'UNKNOWN_RESOLUTION_CONFIG')
      }
    for (const start of [...new Set(input.starts)].sort()) {
      if (!relative(start)) {
        unknown('', 'UNKNOWN_PATH', String(start))
        continue
      }
      try {
        acquire(start)
      } catch (error) {
        unknown(
          relative(error.file) ? error.file : start,
          error.message.split(':')[0],
          error.message
        )
      }
    }
    // Census has preserved known violations before internal reduced caps apply.
    bump(
      'fileBytes',
      Math.max(
        0,
        ...[...astFiles].map(([f]) => Number(snapshots.get(f).stat.size))
      ),
      'maxFileBytes'
    )
    bump('files', out.usage.files, 'maxFiles')
    bump('totalBytes', out.usage.totalBytes, 'maxTotalBytes')
    for (const [file, sf] of astFiles) {
      function visit(n) {
        bump('nodes', out.usage.nodes + 1, 'maxNodes')
        ts.forEachChild(n, visit)
      }
      visit(sf)
      if (
        !['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'].includes(
          path.posix.extname(file)
        ) ||
        /\.d\.[cm]?ts$/.test(file)
      )
        unknown(file, 'UNKNOWN_FORMAT')
    }
    phases.acquisition = 'COMPLETED'
    coverage.modules.total = astFiles.size
    const order = [...astFiles.keys()].sort()
    inBody = true
    try {
      if (census) for (const file of order) load(file)
      else
        try {
          for (const file of order) load(file)
        } catch (error) {
          const message =
            typeof error?.message === 'string' ? error.message : ''
          const cut = BODY_CUT.exec(message),
            residual = containedEdgeReason(message)
          if (cut) {
            // §3.2: only the body ends; post-body and revalidation still run.
            unknown('', 'UNKNOWN_ANALYSIS_LIMIT', message)
            phases.body = 'CUT:' + cut[1]
          } else if (residual) {
            // E6: the top-level load is not a containment point; a listed
            // reason there ends the body as a declared residual stop.
            unknown(relative(error.file) ? error.file : '', residual, message)
            phases.body = 'SKIPPED:' + residual
          } else throw error
        }
    } finally {
      inBody = false
    }
    if (phases.body === null) phases.body = 'COMPLETED'
    for (const item of reachedPackages.values())
      if (
        item.identity?.identityStatus !== 'MATCH' ||
        !hex(item.identity?.referenceDigest)
      )
        unknown(item.manifest, 'UNKNOWN_INSTALLED_IDENTITY')
    // Supplied installed records that have no proven runtime predecessor remain
    // UNKNOWN. A manifest name alone never manufactures a runtime entrypoint.
    for (const item of input.installed)
      if (!reachedPackages.has(item.key))
        unknown(item.manifest, 'UNKNOWN_UNREACHED_INSTALLED_ENTRY')
    const originIds = new Set()
    for (const origin of input.origins) {
      const sf = astFiles.get(origin.file)
      let matched = false
      if (
        sf &&
        origin.id === semanticOriginId(origin) &&
        !originIds.has(origin.id) &&
        hex(origin.fileSha256) &&
        snapshots.get(origin.file)?.sha256 === origin.fileSha256 &&
        Number.isSafeInteger(origin.ordinal) &&
        origin.ordinal >= 0
      ) {
        function visit(n) {
          if (
            n.getStart(sf) === origin.start &&
            n.end === origin.end &&
            (ts.SyntaxKind[n.kind] === origin.kind || n.kind === origin.kind) &&
            (origin.expression === undefined ||
              origin.expression === n.getText(sf))
          ) {
            if (!origin.synthetic) matched = true
            else if (
              ts.isBindingElement(n) &&
              origin.synthetic.originalStart === n.getStart(sf) &&
              origin.synthetic.originalEnd === n.end &&
              (origin.synthetic.originalKind === ts.SyntaxKind[n.kind] ||
                origin.synthetic.originalKind === n.kind) &&
              origin.synthetic.property ===
                (n.propertyName?.text || n.name.text)
            )
              matched = true
          }
          ts.forEachChild(n, visit)
        }
        visit(sf)
      }
      originIds.add(origin.id)
      if (!matched)
        unknown(
          origin.file || '',
          'UNKNOWN_INVALID_ORIGIN',
          '',
          origin.id || null
        )
    }
    phases.postBody = 'COMPLETED'
    // TS's permissive AST is not the Node grammar. Native V8 compilation and
    // Node's strip-only TS parser run INSIDE this supervised worker. Never
    // link, evaluate or run a module/script, and never spawn a parser child.
    // The parent's independent native deadline can kill synchronous parsing.
    if (!out.unknowns.length && !out.violations.length) {
      for (const file of [...astFiles.keys()].sort(sort)) {
        bump('states', out.usage.states, 'maxStates')
        try {
          let source = astFiles.get(file).text
          if (/\.[cm]?ts$/.test(file))
            source = stripTypeScriptTypes(source, { mode: 'strip' })
          if (modules.get(file)?.mode === 'import') {
            if (typeof vm.SourceTextModule !== 'function')
              throw Error('VM grammar unavailable')
            void new vm.SourceTextModule(source, {
              identifier: path.join(root, file)
            })
          } else if (modules.get(file)?.mode === 'require') {
            source = source.replace(/^\uFEFF/, '').replace(/^#![^\r\n]*/, '')
            void new vm.Script(Module.wrap(source), {
              filename: path.join(root, file)
            })
          } else throw Error('unknown grammar profile')
        } catch {
          unknown(file, 'UNKNOWN_RUNTIME_SYNTAX')
        }
      }
      phases.grammar = 'COMPLETED'
    } else phases.grammar = 'SKIPPED:UNKNOWN_OR_VIOLATION_PRESENT'
    // Revalidate every physical assumption, even on an UNKNOWN result.
    bump('fileBytes', out.usage.fileBytes, 'maxFileBytes')
    bump('files', out.usage.files, 'maxFiles')
    bump('totalBytes', out.usage.totalBytes, 'maxTotalBytes')
    resolution.revalidate()
    syncAcquisitionUsage()
    if (semanticCanonicalJson(checkTCB()) !== semanticCanonicalJson(profile))
      throw Error('UNKNOWN_TOOLCHAIN_MUTATION')
  } catch (error) {
    unknown(
      relative(error.file) ? error.file : '',
      error.message.split(':')[0] || 'UNKNOWN_ANALYSIS_ERROR',
      error.message
    )
    // §3.2: a global error declares every unfinished phase with its reason.
    for (const phase of PHASES)
      if (phases[phase] === null)
        phases[phase] =
          'SKIPPED:' + (error.message.split(':')[0] || 'UNKNOWN_ANALYSIS_ERROR')
  }
  // Every acquisition and absence premise is retained even on UNKNOWN. No FD
  // remains live beyond this invocation, including failed parse/cap paths.
  try {
    if (resolution) {
      resolution.revalidate()
      out.runtimeResolution = resolution.snapshot()
      out.usage.resolution = { ...resolution.usage }
      syncAcquisitionUsage()
    }
    if (phases.revalidation === null) phases.revalidation = 'COMPLETED'
  } catch (error) {
    unknown(
      relative(error.file) ? error.file : '',
      error.message.split(':')[0],
      error.message
    )
    out.runtimeResolution = null
    phases.revalidation =
      'SKIPPED:' + (error.message.split(':')[0] || 'UNKNOWN_ANALYSIS_ERROR')
  } finally {
    resolution?.close()
  }
  // File hashes retain the existing emitter/CLI contract. Non-file metadata
  // inputs (stat/link/inventory/absence/anchor) remain bound by the complete
  // runtimeResolution snapshot and its digest in every derivation.
  out.inputs = (
    out.runtimeResolution
      ? out.runtimeResolution.inputs
          .filter((x) => x.kind === 'file')
          .map(({ file, sha256 }) => ({ file, sha256 }))
      : [...snapshots].map(([file, x]) => ({ file, sha256: x.sha256 }))
  ).sort((a, b) => sort(a.file, b.file))
  const runtimeResolutionDigest = out.runtimeResolution
    ? hash(semanticCanonicalJson(out.runtimeResolution))
    : null
  out.unknowns.sort((a, b) =>
    sort(semanticCanonicalJson(a), semanticCanonicalJson(b))
  )
  out.violations.sort((a, b) =>
    sort(semanticCanonicalJson(a), semanticCanonicalJson(b))
  )
  if (census) unknown('', 'UNKNOWN_NEGATIVE_CENSUS_ONLY')
  out.phases = phases
  out.bodyCoverage = coverage
  out.installedFileIdentity = {
    premise: INSTALLED_FILE_IDENTITY_PREMISE,
    files: [...fileIdentity.values()].sort((a, b) => sort(a.file, b.file))
  }
  out.status = out.violations.length
    ? 'VIOLATION'
    : out.unknowns.length
      ? 'UNKNOWN'
      : 'PROVEN'
  const moduleIds = new Map()
  if (out.status === 'PROVEN') {
    const emit = (file) => {
      if (moduleIds.has(file)) return moduleIds.get(file)
      const dependencies = [...(resolutionEdges.get(file) || [])]
        .sort()
        .map(emit)
      const sf = astFiles.get(file)
      const proof = {
        originId: null,
        status: 'PROVEN',
        rule: 'K5',
        dependencies,
        file,
        fileSha256: snapshots.get(file).sha256,
        kind: 'SourceFile',
        start: sf.getStart(sf),
        end: sf.end,
        ordinal: 0,
        derivation: {
          profile,
          runtimeResolutionDigest,
          rules: [...rules].sort(),
          premises: out.inputs,
          resolution: [...probes]
            .sort((a, b) => sort(a[0], b[0]))
            .map(([file, exists]) => ({ file, exists })),
          closure: [...(resolutionEdges.get(file) || [])].sort(),
          installedFileIdentity: fileIdentity.get(file) ?? null
        }
      }
      const id = hash(semanticCanonicalJson(proof))
      out.proofs.push({ id, ...proof })
      moduleIds.set(file, id)
      return id
    }
    try {
      for (const file of [...astFiles.keys()].sort()) emit(file)
      for (const origin of input.origins) {
        const proof = {
          originId: origin.id,
          status: 'PROVEN',
          rule: 'K7',
          dependencies: [moduleIds.get(origin.file)],
          file: origin.file,
          fileSha256: origin.fileSha256,
          kind: origin.kind,
          start: origin.start,
          end: origin.end,
          ordinal: origin.ordinal,
          derivation: {
            origin,
            profile,
            runtimeResolutionDigest,
            rules: [...rules].sort(),
            premises: out.inputs
          }
        }
        out.proofs.push({ id: hash(semanticCanonicalJson(proof)), ...proof })
      }
    } catch (error) {
      out.status = 'UNKNOWN'
      out.proofs = []
      unknown('', 'UNKNOWN_CYCLE', error.message)
    }
  }
  out.installed = (input?.installed || [])
    .map((x) => {
      const reached = reachedPackages.get(x.key)
      const proofIds =
        out.status === 'PROVEN' && reached
          ? [...reached.entries]
              .sort()
              .map((f) => moduleIds.get(f))
              .filter(Boolean)
          : []
      return {
        key: x.key,
        status: proofIds.length ? 'PROVEN' : 'UNKNOWN',
        proofIds,
        reason: proofIds.length
          ? 'MATCH_AND_CLOSED_RUNTIME_ENTRIES'
          : 'UNKNOWN_INSTALLED_CLOSURE'
      }
    })
    .sort((a, b) => sort(a.key, b.key))
  out.proofs.sort((a, b) => sort(a.id, b.id))
  return out
}

function comparable(output) {
  const body = { ...output }
  delete body.telemetry
  delete body.validation
  return body
}
export function validateSemanticBoundary(input, output) {
  try {
    if (!record(output)) return { valid: false, reason: 'INVALID_OUTPUT' }
    const expected = isWorker()
      ? analyzeSemanticBoundary(input)
      : runSemanticBoundary(input)
    return semanticCanonicalJson(comparable(expected)) ===
      semanticCanonicalJson(comparable(output))
      ? { valid: true }
      : { valid: false, reason: 'RECOMPUTATION_MISMATCH' }
  } catch {
    return { valid: false, reason: 'VALIDATION_ERROR' }
  }
}

// Parent and CLI revalidation use a new anchored reader; never dereference
// attacker-controlled paths with a separate absolute realpath/readFile pair.
export function revalidateSemanticInputs(root, output, origins = []) {
  let session
  try {
    if (
      !record(output) ||
      output.kernelVersion !== SEMANTIC_KERNEL_VERSION ||
      !Array.isArray(output.inputs)
    )
      return false
    if (output.proofs?.length && !output.runtimeResolution) return false
    if (output.runtimeResolution) {
      revalidateResolutionSnapshot({
        root,
        snapshot: output.runtimeResolution,
        limits: { ...SEMANTIC_LIMITS, ...RESOLUTION_LIMITS }
      })
      const regular = output.runtimeResolution.inputs
        .filter((x) => x.kind === 'file')
        .map(({ file, sha256 }) => ({ file, sha256 }))
        .sort((a, b) => sort(a.file, b.file))
      if (
        semanticCanonicalJson(regular) !== semanticCanonicalJson(output.inputs)
      )
        return false
      const hashes = new Map(regular.map((x) => [x.file, x.sha256]))
      // The replay checks raw bytes even for an UNKNOWN malformed UTF-8
      // source. Its hash is evidence, never permission to parse/accept it.
      origins = origins.filter((x) => {
        if (!hashes.has(x.file)) return true
        if (hashes.get(x.file) !== x.fileSha256)
          throw Error('UNKNOWN_INPUT_MUTATION')
        return false
      })
      if (!origins.length) return true
    }
    if (!output.inputs.length && !origins.length) return true
    session = createResolutionSession({
      root,
      limits: { ...SEMANTIC_LIMITS, ...RESOLUTION_LIMITS }
    })
    for (const item of [
      ...(output.runtimeResolution ? [] : output.inputs),
      ...origins.map((x) => ({ file: x.file, sha256: x.fileSha256 }))
    ]) {
      if (
        !relative(item.file) ||
        !hex(item.sha256) ||
        session.read(item.file).sha256 !== item.sha256
      )
        return false
    }
    session.revalidate()
    return true
  } catch {
    return false
  } finally {
    session?.close()
  }
}

// SPEC0241 §5: the parent revalidates every per-file identity record the
// worker used against the input inventory and the acquired file hashes.
export function revalidateInstalledFileIdentity(input, output) {
  try {
    const trace = output?.installedFileIdentity
    if (
      !record(trace) ||
      trace.premise !== INSTALLED_FILE_IDENTITY_PREMISE ||
      !Array.isArray(trace.files)
    )
      return false
    const hashes = new Map((output.inputs || []).map((x) => [x.file, x.sha256]))
    const cache = new Map()
    for (const item of trace.files) {
      if (!record(item) || hashes.get(item.file) !== item.sha256) return false
      const premise = installedFilePremise({
        file: item.file,
        sha256: item.sha256,
        installed: input?.installed,
        cache
      })
      if (
        !premise.ok ||
        semanticCanonicalJson(premise.record) !== semanticCanonicalJson(item)
      )
        return false
    }
    return true
  } catch {
    return false
  }
}

function knownViolation(x) {
  return (
    record(x) &&
    Object.keys(x).sort().join(',') === 'file,reason,target' &&
    typeof x.file === 'string' &&
    x.reason === 'PRODUCT_DEPENDENCY' &&
    typeof x.target === 'string' &&
    (x.target === 'products' || x.target.startsWith('products/'))
  )
}

// Sync caller; the child owns parse, analysis AND independent recomputation.
// spawnSync's native timeout kills even a synchronous parser stuck in the child.
// Two bounded children share ONE deadline (limits.timeoutMs is not raised):
// first the negative-only census with the v2 metadata refusals, so the
// exact-metadata refinement can never consume its budget or time; then the
// refinement. Violations known from either child (stdout or the stderr
// stream of a killed child) survive every later cap, error or refusal.
export function runSemanticBoundary(input) {
  const started = performance.now()
  const known = new Map()
  const remember = (items) => {
    if (!Array.isArray(items)) return
    for (const item of items)
      if (knownViolation(item)) known.set(semanticCanonicalJson(item), item)
  }
  const streamed = (stderr) => {
    for (const line of String(stderr || '').split('\n')) {
      if (!line.startsWith(VIOLATION_STREAM)) continue
      try {
        remember([JSON.parse(line.slice(VIOLATION_STREAM.length))])
      } catch {
        // A truncated line from a killed child carries no claim.
      }
    }
  }
  let limits, output, censusMs
  const spawn = (extra) =>
    spawnSync(
      NODE,
      ['--experimental-vm-modules', SELF, '--semantic-worker', ...extra],
      {
        input: JSON.stringify(input),
        encoding: 'utf8',
        timeout: Math.max(
          1,
          Math.floor(limits.timeoutMs - (performance.now() - started))
        ),
        killSignal: 'SIGKILL',
        maxBuffer: 64 * 1024 ** 2,
        env: {
          PATH: path.dirname(NODE) + ':/usr/bin:/bin',
          LANG: 'C',
          LC_ALL: 'C',
          TZ: 'UTC'
        },
        cwd: path.dirname(SELF),
        windowsHide: true
      }
    )
  try {
    limits = limitsFor(input)
    const profile = checkTCB()
    const census = spawn([REFUSAL_CENSUS_ARG])
    streamed(census.stderr)
    if (!census.error && census.status === 0)
      try {
        remember(JSON.parse(census.stdout).violations)
      } catch {
        // Negative evidence only; an unreadable census grants nothing.
      }
    censusMs = performance.now() - started
    const worker = spawn([])
    streamed(worker.stderr)
    if (
      worker.error?.code === 'ETIMEDOUT' ||
      performance.now() - started > limits.timeoutMs
    )
      output = empty(limits, 'UNKNOWN_ANALYSIS_LIMIT', 'timeoutMs')
    else if (worker.error?.code === 'ENOBUFS')
      output = empty(limits, 'UNKNOWN_ANALYSIS_LIMIT', 'outputBytes')
    else if (worker.error || worker.status !== 0)
      output = empty(
        limits,
        'UNKNOWN_WORKER_ERROR',
        worker.error?.code || String(worker.signal || worker.status)
      )
    else {
      output = JSON.parse(worker.stdout)
      remember(output.violations)
      // Worker validation is recomputation, not acceptance of an input flag.
      // The parent separately revalidates each file, TCB and proof identifiers.
      if (
        !output.validation?.valid ||
        semanticCanonicalJson(checkTCB()) !== semanticCanonicalJson(profile)
      )
        throw Error('UNKNOWN_INVALID_WORKER_RESULT')
      const ids = new Set()
      for (const proof of output.proofs) {
        const { id, ...body } = proof
        if (
          id !== hash(semanticCanonicalJson(body)) ||
          ids.has(id) ||
          semanticCanonicalJson(proof.derivation?.profile) !==
            semanticCanonicalJson(profile) ||
          proof.derivation?.runtimeResolutionDigest !==
            hash(semanticCanonicalJson(output.runtimeResolution))
        )
          throw Error('UNKNOWN_INVALID_PROOF')
        ids.add(id)
      }
      if (!revalidateInstalledFileIdentity(input, output))
        throw Error('UNKNOWN_INVALID_WORKER_RESULT')
      if (!revalidateSemanticInputs(input.root, output))
        throw Error('UNKNOWN_INPUT_MUTATION')
      if (performance.now() - started > limits.timeoutMs)
        output = empty(limits, 'UNKNOWN_ANALYSIS_LIMIT', 'timeoutMs')
    }
  } catch (error) {
    output = empty(
      limits || SEMANTIC_LIMITS,
      error.message || 'UNKNOWN_WORKER_ERROR'
    )
  }
  for (const item of output.violations || [])
    known.delete(semanticCanonicalJson(item))
  if (known.size) {
    // UNKNOWN never replaces a known violation; it also blocks every proof.
    output.violations = [...output.violations, ...known.values()].sort((a, b) =>
      sort(semanticCanonicalJson(a), semanticCanonicalJson(b))
    )
    output.status = 'VIOLATION'
    output.proofs = []
    output.installed = (output.installed || []).map((x) => ({
      ...x,
      status: 'UNKNOWN',
      proofIds: [],
      reason: 'UNKNOWN_INSTALLED_CLOSURE'
    }))
  }
  return {
    ...output,
    telemetry: {
      elapsedMs: performance.now() - started,
      negativeCensusElapsedMs: censusMs ?? null
    }
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === SELF &&
  process.argv[2] === '--semantic-worker'
) {
  try {
    const extra = process.argv.slice(3)
    const census = extra.length === 1 && extra[0] === REFUSAL_CENSUS_ARG
    if (extra.length && !census) throw Error('UNKNOWN_WORKER_ARGUMENTS')
    const input = JSON.parse(fs.readFileSync(0, 'utf8'))
    const output = analyzeSemanticBoundary(input, { refusalCensus: census })
    output.validation = census
      ? { valid: false }
      : validateSemanticBoundary(input, output)
    if (census) output.proofs = []
    else if (!output.validation.valid) {
      output.status = output.violations.length ? 'VIOLATION' : 'UNKNOWN'
      output.proofs = []
      output.installed.forEach((x) => {
        x.status = 'UNKNOWN'
        x.proofIds = []
      })
      output.unknowns.push({
        file: '',
        reason: 'UNKNOWN_REVALIDATION',
        originId: null,
        detail: ''
      })
    }
    process.stdout.write(JSON.stringify(output))
  } catch {
    process.exitCode = 2
  }
}
