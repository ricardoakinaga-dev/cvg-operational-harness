import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
const require = createRequire(import.meta.url)
const semver = require('semver')
export const manifestDependencyFields = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies'
]
export const packageName = (name) =>
  typeof name === 'string' &&
  /^(?:@[a-z0-9_][a-z0-9._-]*\/)?[a-z0-9_][a-z0-9._-]*$/i.test(name)
const record = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const inside = (root, file) => {
  const rel = path.relative(root, file)
  return (
    rel === '' ||
    (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel))
  )
}
export function createBoundaryManifestReader(root) {
  const cache = new Map()
  // cache contains validated first-party shapes only; closureStates records
  // failed frontiers separately. A shape is never an approval of its
  // implementation. Installed third-party manifests are not read here: the
  // installed package verifier below owns that frontier.
  const closureStates = new Map()
  const closureEdges = new Map()
  let readingDepth = 0
  const censusManifests = new Map()
  const censused = new Set()
  const reject = (filename, field) => {
    throw new Error(`invalid_boundary_manifest:${filename}:${field}`)
  }
  function readShape(
    filename,
    { rootManifest = false, requireName = false } = {}
  ) {
    filename = path.resolve(filename)
    if (!inside(root, filename)) reject(filename, 'outside_repository')
    if (cache.has(filename)) {
      const value = cache.get(filename)
      if (requireName && !packageName(value.name)) reject(filename, 'name')
      if (rootManifest) workspaceShape(filename, value)
      return value
    }
    const stat = fs.lstatSync(filename)
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      fs.realpathSync(filename) !== filename
    )
      reject(filename, 'physical_file_required')
    const bytes = fs.readFileSync(filename)
    const value = JSON.parse(bytes.toString('utf8'))
    if (!record(value)) reject(filename, 'object_required')
    if ((requireName || value.name !== undefined) && !packageName(value.name))
      reject(filename, 'name')
    if (
      value.type !== undefined &&
      !['module', 'commonjs'].includes(value.type)
    )
      reject(filename, 'type')
    if (rootManifest) workspaceShape(filename, value)
    for (const field of manifestDependencyFields) {
      if (value[field] === undefined) continue
      if (!record(value[field])) reject(filename, field)
      for (const [name, version] of Object.entries(value[field])) {
        if (!packageName(name) || typeof version !== 'string')
          reject(filename, field)
        const specifier = version.trim()
        if (specifier.startsWith('npm:')) {
          const alias = specifier.slice(4),
            separator = alias.lastIndexOf('@')
          const target = separator > 0 ? alias.slice(0, separator) : alias
          if (!packageName(target)) reject(filename, 'npm_alias')
          if (separator > 0) {
            const version = alias.slice(separator + 1)
            // Registry specs are semver ranges or npm tags, never a second URL.
            if (
              !version ||
              (!semver.validRange(version) &&
                encodeURIComponent(version) !== version)
            )
              reject(filename, 'npm_alias_version')
          }
        }
      }
    }
    cache.set(filename, value)
    return value
  }
  function settleClosures() {
    // Only settle after the outer read: a visiting cycle is provisional, never
    // evidence of a complete reachable frontier. Propagate failure through the
    // entire local closure, including strongly connected actors.
    let changed = true
    while (changed) {
      changed = false
      for (const [filename, state] of closureStates) {
        if (state.status === 'failed') continue
        const children = [...(closureEdges.get(filename) ?? [])].map((child) =>
          closureStates.get(child)
        )
        const failed = children.find((child) => child?.status === 'failed')
        const status = failed ? 'failed' : 'complete'
        if (state.status !== status) {
          closureStates.set(
            filename,
            failed ? { status, error: failed.error } : { status }
          )
          if (failed) cache.delete(filename)
          changed = true
        }
      }
    }
  }
  function read(filename, options = {}) {
    filename = path.resolve(filename)
    const state = closureStates.get(filename)
    if (state?.status === 'failed') throw state.error
    readingDepth++
    try {
      const value = readShape(filename, options)
      if (state) return value
      closureStates.set(filename, { status: 'visiting' })
      const children = new Set()
      closureEdges.set(filename, children)
      for (const field of manifestDependencyFields)
        for (const [name, version] of Object.entries(value[field] ?? {}))
          if (/^(file|link):/.test(version.trim())) {
            const ref = localEdge(filename, field, name, version)
            children.add(ref.manifest)
            read(ref.manifest, { requireName: true })
            for (const child of census(path.dirname(ref.manifest)))
              children.add(child)
          }
      closureStates.set(filename, { status: 'provisional' })
      return value
    } catch (error) {
      cache.delete(filename)
      closureStates.set(filename, { status: 'failed', error })
      throw error
    } finally {
      if (--readingDepth === 0) settleClosures()
    }
  }
  function workspaceShape(filename, value) {
    if (
      !Array.isArray(value.workspaces) ||
      value.workspaces.some(
        (v) => typeof v !== 'string' || !v || v.trim() !== v
      ) ||
      new Set(value.workspaces).size !== value.workspaces.length
    )
      reject(filename, 'workspaces')
  }
  function lexicalLocalPath(filename, suffix) {
    // Inspect the requested spelling before URL dot normalization or realpath
    // can hide a symlink. Encoded path segments retain this same obligation.
    let spelling = suffix.replace(/\\/g, '/')
    if (spelling.startsWith('//')) spelling = spelling.replace(/^\/\/[^/]*/, '')
    let parts
    try {
      parts = spelling.split('/').map((part) => {
        const decoded = decodeURIComponent(part)
        if (decoded.includes('/') || decoded.includes('\0'))
          reject(filename, 'local_dependency')
        return decoded
      })
    } catch {
      reject(filename, 'local_dependency')
    }
    let cursor
    if (spelling.startsWith('/')) {
      const rootParts = root.split(path.sep)
      if (rootParts.some((part, index) => parts[index] !== part))
        reject(filename, 'local_dependency')
      parts = parts.slice(rootParts.length)
      cursor = root
    } else cursor = path.dirname(filename)
    for (const part of parts) {
      if (!part || part === '.') continue
      cursor = part === '..' ? path.dirname(cursor) : path.join(cursor, part)
      if (!inside(root, cursor)) reject(filename, 'local_dependency')
      try {
        const stat = fs.lstatSync(cursor)
        if (stat.isSymbolicLink() || !stat.isDirectory())
          reject(filename, 'local_dependency')
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        return cursor
      }
    }
  }
  function localDirectory(filename, version) {
    const specifier = version.trim(),
      suffix = specifier.slice(specifier.indexOf(':') + 1)
    if (!suffix || /[?#]/.test(suffix)) reject(filename, 'local_dependency')
    let target
    try {
      const url = new URL(
        'file:' + suffix,
        pathToFileURL(path.dirname(filename) + path.sep)
      )
      if (url.username || url.password || url.search || url.hash)
        reject(filename, 'local_dependency')
      target = fileURLToPath(url)
    } catch {
      reject(filename, 'local_dependency')
    }
    if (!inside(root, target)) reject(filename, 'local_dependency')
    const missing = lexicalLocalPath(filename, suffix)
    if (missing && fs.existsSync(target)) reject(filename, 'local_dependency')
    return target
  }
  function localPackage(filename, version) {
    const target = localDirectory(filename, version)
    if (!fs.existsSync(target)) reject(filename, 'local_dependency')
    const requestedManifest = path.join(target, 'package.json')
    const stat = fs.lstatSync(requestedManifest)
    if (stat.isSymbolicLink() || !stat.isFile())
      reject(requestedManifest, 'physical_file_required')
    const resolved = fs.realpathSync(target)
    if (!inside(root, resolved) || !fs.statSync(resolved).isDirectory())
      reject(filename, 'local_dependency')
    return path.join(resolved, 'package.json')
  }
  function localEdge(filename, field, name, version) {
    if (
      !manifestDependencyFields.includes(field) ||
      readShape(filename)[field]?.[name] !== version
    )
      reject(filename, 'local_dependency_provenance')
    // Only first-party manifests reach this reader, so a missing local target
    // is always a refusal (never a tolerated unresolved installed frontier).
    return { manifest: localPackage(filename, version) }
  }
  function installedPackage(filename, name) {
    // Node supplies the declaring actor's package lookup order. No package
    // entrypoint or user expression is imported or executed for metadata.
    const located = locateInstalled(root, filename, name)
    // A proven absent ordinary registry package is not a physical edge.
    // Any attempted import/loader still has its independent blocking checks.
    if (!located) return undefined
    const { candidate, context } = located
    if (
      located.dangling ||
      !inside(root, context) ||
      !fs.statSync(context).isDirectory()
    )
      reject(candidate, 'physical_installed_directory_required')
    const manifest = path.join(context, 'package.json')
    return {
      context,
      manifest: fs.existsSync(manifest) ? manifest : undefined
    }
  }
  function census(directory, result = new Set()) {
    if (!inside(root, directory)) reject(directory, 'outside_repository')
    if (!fs.existsSync(directory)) return result
    if (fs.realpathSync(directory) !== directory)
      reject(directory, 'physical_directory_required')
    if (censused.has(directory)) {
      for (const file of censusManifests.get(directory) ?? []) result.add(file)
      return result
    }
    censused.add(directory)
    const owned = new Set()
    censusManifests.set(directory, owned)
    try {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        // Dependency installations and VCS are separate actors, not repo metadata.
        if (['node_modules', '.git'].includes(entry.name)) continue
        const file = path.join(directory, entry.name)
        if (entry.isSymbolicLink()) reject(file, 'physical_file_required')
        if (entry.isDirectory()) census(file, owned)
        else if (entry.name === 'package.json') {
          read(file)
          owned.add(file)
        }
      }
      for (const file of owned) result.add(file)
      return result
    } catch (error) {
      censusManifests.delete(directory)
      censused.delete(directory)
      throw error
    }
  }
  return {
    read,
    census,
    localPackage,
    localEdge,
    installedPackage,
    cache,
    closureStates
  }
}

// Node's package lookup from a declaring file, restricted to lookup folders
// inside the repository. Returns the first existing candidate and its
// canonical destination; a dangling link is reported, never skipped.
export function locateInstalled(root, fromFile, name) {
  for (const parent of createRequire(fromFile).resolve.paths(name) ?? []) {
    if (!inside(root, parent)) continue
    const candidate = path.join(parent, name)
    try {
      fs.lstatSync(candidate)
    } catch (error) {
      if (error.code === 'ENOENT') continue
      throw error
    }
    try {
      return { candidate, context: fs.realpathSync(candidate) }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      return { candidate, dangling: true }
    }
  }
  return undefined
}

// The installed package directory (<...>/node_modules/<name>) that physically
// contains target, or undefined for a first-party path. The innermost
// node_modules segment wins, matching Node's nested installation layout.
export function installedContext(root, target) {
  const parts = path.relative(root, target).split(path.sep)
  const index = parts.lastIndexOf('node_modules')
  if (index < 0) return undefined
  const end = index + (parts[index + 1]?.startsWith('@') ? 3 : 2)
  const name = parts.slice(index + 1, end).join('/')
  return {
    context: path.join(root, ...parts.slice(0, end)),
    key: parts.slice(0, end).join('/'),
    valid: end <= parts.length && packageName(name)
  }
}

const integrity =
  /^(?:sha1|sha256|sha384|sha512)-[A-Za-z0-9+/]+={0,2}(?:\s+(?:sha1|sha256|sha384|sha512)-[A-Za-z0-9+/]+={0,2})*$/
// Runtime successors of an installed package. devDependencies of an installed
// package are never installed for it, so they are not part of its closure.
const installedDependencyFields = [
  'dependencies',
  'optionalDependencies',
  'peerDependencies'
]

function readLockfile(filename) {
  let stat
  try {
    stat = fs.lstatSync(filename)
  } catch (error) {
    if (error.code === 'ENOENT') return undefined
    throw error
  }
  if (!stat.isFile())
    throw new Error(
      `invalid_boundary_lockfile:${filename}:physical_file_required`
    )
  let value
  try {
    value = JSON.parse(fs.readFileSync(filename, 'utf8'))
  } catch {
    throw new Error(`invalid_boundary_lockfile:${filename}:json`)
  }
  if (
    !record(value) ||
    ![2, 3].includes(value.lockfileVersion) ||
    !record(value.packages)
  )
    throw new Error(`invalid_boundary_lockfile:${filename}:packages`)
  return value.packages
}

// Installed third-party code is not parsed file by file. An installed package
// is accepted as a terminal graph node only when the committed lockfile
// (package-lock.json, a reviewed and versioned file) records that exact
// installation path as a registry artifact (https tarball plus integrity)
// whose package name matches the installed manifest. npm's untracked
// installed-tree record (node_modules/.package-lock.json) is deliberately not
// a trust root, and a link entry is never a registry artifact.
//
// The version field is not a content-integrity proof (npm does not keep the
// tarball to re-hash), so an installed version that differs from the committed
// lockfile is returned as drift for the report instead of being mistaken for
// verification. Tampered contents are covered only by the product tripwire.
export function createInstalledPackageVerifier(
  root,
  { productReferences = [] } = {}
) {
  const committed = readLockfile(path.join(root, 'package-lock.json'))
  const needles = productReferences.map((text) => ({
    text,
    bytes: Buffer.from(text)
  }))
  const verdicts = new Map()
  const lookup = (packages, key) =>
    packages && Object.hasOwn(packages, key) ? packages[key] : undefined
  function evaluate(context, key) {
    const manifestFile = path.join(context, 'package.json')
    let manifest
    try {
      if (!fs.lstatSync(manifestFile).isFile())
        return { verified: false, reason: 'INSTALLED_MANIFEST_NOT_PHYSICAL' }
      manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
    } catch (error) {
      if (error.code === 'ENOENT')
        return { verified: false, reason: 'INSTALLED_MANIFEST_MISSING' }
      if (error instanceof SyntaxError)
        return { verified: false, reason: 'INSTALLED_MANIFEST_INVALID' }
      throw error
    }
    if (!record(manifest))
      return { verified: false, reason: 'INSTALLED_MANIFEST_INVALID' }
    // Declared successors are extracted before any verdict: an unverified or
    // malformed package keeps them, so a known product reached through it
    // still fails instead of merely staying incomplete.
    const dependencies = []
    let wellFormed = packageName(manifest.name)
    wellFormed &&= typeof manifest.version === 'string'
    for (const field of installedDependencyFields) {
      if (manifest[field] === undefined) continue
      if (!record(manifest[field])) {
        wellFormed = false
        continue
      }
      for (const name of Object.keys(manifest[field]))
        if (packageName(name)) dependencies.push({ field, name })
        else wellFormed = false
    }
    if (!wellFormed)
      return {
        verified: false,
        reason: 'INSTALLED_MANIFEST_INVALID',
        dependencies
      }
    const keyName = key.slice(key.lastIndexOf('node_modules/') + 13)
    const accepts = (entry) =>
      record(entry) &&
      entry.link !== true &&
      typeof entry.resolved === 'string' &&
      entry.resolved.startsWith('https://') &&
      typeof entry.integrity === 'string' &&
      integrity.test(entry.integrity) &&
      (entry.name ?? keyName) === manifest.name
    const entry = lookup(committed, key)
    if (accepts(entry))
      return {
        verified: true,
        source: 'package-lock.json',
        dependencies,
        ...(entry.version === manifest.version
          ? {}
          : {
              drift: {
                package: key,
                installedVersion: manifest.version,
                lockfileVersion:
                  typeof entry.version === 'string' ? entry.version : null
              }
            })
      }
    return {
      verified: false,
      reason:
        entry === undefined ? 'NOT_IN_LOCKFILE' : 'LOCKFILE_IDENTITY_MISMATCH',
      dependencies
    }
  }
  function verify(context, key) {
    if (!verdicts.has(context)) verdicts.set(context, evaluate(context, key))
    return verdicts.get(context)
  }
  // Tripwire, not proof: bytes of an installed package that name the product
  // (workspace name or products/<dir> path) mark a forged or tampered vendor
  // bridge. Symlinks are returned for canonical classification by the caller.
  // Nested node_modules are separate packages with their own verification.
  function scan(context) {
    const references = []
    const links = []
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name)
        if (entry.isSymbolicLink()) links.push(file)
        else if (entry.isDirectory()) {
          if (entry.name !== 'node_modules') walk(file)
        } else if (entry.isFile() && needles.length) {
          const bytes = fs.readFileSync(file)
          for (const needle of needles)
            if (bytes.includes(needle.bytes))
              references.push({ file, reference: needle.text })
        }
      }
    }
    if (fs.lstatSync(context).isDirectory()) walk(context)
    return { references, links }
  }
  return { verify, scan }
}
