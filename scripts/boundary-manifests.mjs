import fs from 'node:fs'
import { createHash } from 'node:crypto'
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
  // cache contains validated shapes only; closureStates records unresolved or
  // failed frontiers separately. Neither a shape nor an incomplete closure is
  // an approval of its implementation.
  const closureStates = new Map()
  const closureEdges = new Map()
  const directIncomplete = new Set()
  let readingDepth = 0
  const censusManifests = new Map()
  const shapeHashes = new Map()
  const installedActors = new Map()
  const unresolved = new Map()
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
    shapeHashes.set(filename, createHash('sha256').update(bytes).digest('hex'))
    return value
  }
  function settleClosures() {
    // Only settle after the outer read: a visiting cycle is provisional, never
    // evidence of a complete reachable frontier. Propagate failure/incomplete
    // through the entire local closure, including strongly connected actors.
    let changed = true
    while (changed) {
      changed = false
      for (const [filename, state] of closureStates) {
        if (state.status === 'failed') continue
        const children = [...(closureEdges.get(filename) ?? [])].map((child) =>
          closureStates.get(child)
        )
        const failed = children.find((child) => child?.status === 'failed')
        const status = failed
          ? 'failed'
          : directIncomplete.has(filename) ||
              children.some((child) => child?.status === 'incomplete')
            ? 'incomplete'
            : 'complete'
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
            if (ref.unresolved) {
              directIncomplete.add(filename)
              continue
            }
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
  function installedActor(filename) {
    // Registration comes from the actual declaring manifest and Node lookup,
    // never merely from a vendor-looking path or a requested reader option.
    return [...installedActors.values()]
      .filter(({ context }) => {
        const rel = path.relative(context, filename)
        return (
          inside(context, filename) &&
          !rel.split(path.sep).includes('node_modules')
        )
      })
      .sort((a, b) => b.context.length - a.context.length)[0]
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
    const actor = installedActor(filename)
    if (!actor) return { manifest: localPackage(filename, version) }
    const target = localDirectory(filename, version)
    // Prove absence without swallowing permissions, malformed shape, dangling
    // links or containment errors. Existing symlink ancestors are recused even
    // if a missing descendant would otherwise make existsSync return false.
    let cursor = root
    let missing = false
    for (const part of path
      .relative(root, target)
      .split(path.sep)
      .filter(Boolean)) {
      cursor = path.join(cursor, part)
      try {
        const stat = fs.lstatSync(cursor)
        if (stat.isSymbolicLink() || !stat.isDirectory())
          reject(filename, 'local_dependency')
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        missing = true
        break
      }
    }
    const manifest = path.join(target, 'package.json')
    if (!missing) {
      try {
        fs.lstatSync(manifest)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        missing = true
      }
    }
    if (!missing) return { manifest: localPackage(filename, version) }
    // A JSON-less installed context is still a physical actor. Its actual
    // nested declaring manifest supplies the shape/hash witness; never describe
    // a nonexistent root manifest as validated metadata.
    const actorManifest = shapeHashes.has(actor.manifest)
      ? actor.manifest
      : filename
    const row = {
      file: path.relative(root, filename),
      manifestSha256: shapeHashes.get(filename),
      specifier: name,
      dependencyField: field,
      dependencySpecifier: version,
      target: path.relative(root, manifest),
      reason: 'UNRESOLVED_INSTALLED_LOCAL_DEPENDENCY',
      resolution:
        cursor === target && fs.existsSync(target)
          ? 'MISSING_LOCAL_MANIFEST'
          : 'MISSING_LOCAL_DIRECTORY',
      installedActor: {
        manifest: path.relative(root, actorManifest),
        manifestSha256: shapeHashes.get(actorManifest),
        ...(actorManifest !== actor.manifest
          ? {
              rootManifestAbsent: true,
              absentManifest: path.relative(root, actor.manifest)
            }
          : {}),
        context: path.relative(root, actor.context),
        declaredBy: path.relative(root, actor.declaredBy),
        dependencyField: actor.field,
        specifier: actor.name,
        dependencySpecifier: actor.version
      }
    }
    const key = JSON.stringify([filename, field, name])
    unresolved.set(key, row)
    return { manifest, unresolved: row }
  }
  function registerInstalled(filename, name, { field, version }, context) {
    const manifest = path.join(context, 'package.json')
    // Only a real registry declaration with a physical installed destination
    // establishes this scope. Workspace/local symlink aliases retain the
    // repository's strict local-missing contract.
    const declared = readShape(filename)
    const specifier = typeof version === 'string' ? version.trim() : ''
    const registrySpecifier =
      specifier.startsWith('npm:') ||
      Boolean(semver.validRange(specifier)) ||
      /^[a-z][a-z0-9._-]*$/i.test(specifier)
    if (
      manifestDependencyFields.includes(field) &&
      declared[field]?.[name] === version &&
      registrySpecifier &&
      path.relative(root, context).split(path.sep).includes('node_modules') &&
      !installedActors.has(context)
    )
      installedActors.set(context, {
        context,
        manifest,
        declaredBy: filename,
        field,
        name,
        version
      })
  }
  function physicalPackage(target) {
    if (!inside(root, target)) reject(target, 'outside_repository')
    const parts = path.relative(root, target).split(path.sep)
    for (let index = parts.length - 2; index >= 0; index--) {
      if (parts[index] !== 'node_modules') continue
      const scoped = parts[index + 1]?.startsWith('@')
      const end = index + (scoped ? 3 : 2)
      const name = parts.slice(index + 1, end).join('/')
      if (end >= parts.length || !packageName(name))
        reject(target, 'physical_installed_directory_required')
      const context = path.join(root, ...parts.slice(0, end))
      if (
        fs.realpathSync(context) !== context ||
        !fs.lstatSync(context).isDirectory()
      )
        reject(context, 'physical_installed_directory_required')
      return context
    }
  }
  function runtimePackage(filename, name, options, target) {
    const context = physicalPackage(target)
    if (!context) return undefined
    for (const parent of createRequire(filename).resolve.paths(name) ?? []) {
      if (!inside(root, parent)) continue
      const candidate = path.join(parent, name)
      try {
        fs.lstatSync(candidate)
      } catch (error) {
        if (error.code === 'ENOENT') continue
        throw error
      }
      const selected = fs.realpathSync(candidate)
      if (!inside(root, selected) || !fs.statSync(selected).isDirectory())
        reject(candidate, 'physical_installed_directory_required')
      if (selected === context && inside(selected, target)) {
        registerInstalled(filename, name, options, context)
        break
      }
    }
    return context
  }
  function installedPackage(filename, name, { field, version } = {}) {
    // Node supplies the declaring actor's package lookup order. No package
    // entrypoint or user expression is imported or executed for metadata.
    for (const parent of createRequire(filename).resolve.paths(name) ?? []) {
      if (!inside(root, parent)) continue
      const candidate = path.join(parent, name)
      try {
        fs.lstatSync(candidate)
      } catch (error) {
        if (error.code === 'ENOENT') continue
        throw error
      }
      const context = fs.realpathSync(candidate)
      if (!inside(root, context) || !fs.statSync(context).isDirectory())
        reject(candidate, 'physical_installed_directory_required')
      const manifest = path.join(context, 'package.json')
      registerInstalled(filename, name, { field, version }, context)
      return {
        context,
        manifest: fs.existsSync(manifest) ? manifest : undefined
      }
    }
    // A proven absent ordinary registry package is not a physical edge.
    // Any attempted import/loader still has its independent blocking checks.
    return undefined
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
    physicalPackage,
    runtimePackage,
    cache,
    closureStates,
    unresolved
  }
}
