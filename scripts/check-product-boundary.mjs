import {
  createBoundaryManifestReader,
  createInstalledPackageVerifier,
  installedContext,
  locateInstalled,
  manifestDependencyFields
} from './boundary-manifests.mjs'
import {
  invalidTsconfigPathPatterns,
  expandSingleWildcard
} from './tsconfig-path-grammar.mjs'
// SPEC0228: installed metadata is not a content proof, and the legacy
// exception catalog is inactive. Uncertainty remains INCOMPLETE; known product
// edges remain FAIL. This gate does not grant positive isolation acceptance.
import fs from 'node:fs'
import path from 'node:path'
import { isBuiltin, createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { auditDynamicCodeExecution } from './boundary-code-execution.mjs'
import {
  createBoundaryLexical,
  assignedValues,
  valueBranches
} from './boundary-lexical.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const extensions = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs'
])
const excluded = new Set(['node_modules', 'dist', 'coverage', '.git', 'build'])
const inside = (parent, file) => {
  const relative = path.relative(parent, file)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  )
}

function files(directory, result = [], manifests) {
  let stat
  try {
    stat = fs.lstatSync(directory)
  } catch (error) {
    if (error.code === 'ENOENT') return result
    throw error
  }
  if (stat.isSymbolicLink())
    throw new Error(`unverified_source_symlink:${directory}`)
  if (!stat.isDirectory()) throw new Error(`invalid_source_root:${directory}`)
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink())
      throw new Error(
        `unverified_source_symlink:${path.join(directory, entry.name)}`
      )
    if (excluded.has(entry.name)) continue
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) files(file, result, manifests)
    else if (entry.name === 'package.json' && manifests) manifests.add(file)
    else if (extensions.has(path.extname(file))) result.push(file)
  }
  return result
}

export function auditProductBoundary(
  directory = process.cwd(),
  {
    graph: includeGraph = false,
    exceptions: requestedExceptions = false,
    installedReference,
    semantic = false,
    compiledBuildReference
  } = {}
) {
  if (typeof semantic !== 'boolean') throw new Error('invalid_semantic_option')
  if (
    compiledBuildReference !== undefined &&
    (!semantic ||
      !compiledBuildReference ||
      typeof compiledBuildReference !== 'object' ||
      Array.isArray(compiledBuildReference) ||
      typeof compiledBuildReference.manifestPath !== 'string' ||
      !compiledBuildReference.manifestPath ||
      !/^[a-f0-9]{64}$/.test(compiledBuildReference.expectedSha256 ?? ''))
  )
    throw new Error('invalid_compiled_build_reference_option')
  // Load the new mechanism only on opt-in. Existing copied-checker/default
  // callers retain their original dependency and output contract.
  const semanticEngine = semantic
    ? require('./boundary-semantic-engine.mjs')
    : undefined
  const root = fs.realpathSync(directory)
  const metadata = createBoundaryManifestReader(root)
  const boundaryManifest = (filename, rootManifest = false) =>
    metadata.read(filename, { rootManifest, requireName: !rootManifest })
  const productRoot = path.join(root, 'products')
  const sourceRoots = ['packages', 'apps', 'legacy', 'products']
  const discoveryRoot = (directory) => {
    if (!inside(root, directory))
      throw new Error(`discovery_outside_repository:${directory}`)
    if (fs.existsSync(directory) && fs.realpathSync(directory) !== directory)
      throw new Error(`unverified_discovery_identity:${directory}`)
    return directory
  }
  const physicalManifestPaths = new Set()
  const sourceFiles = sourceRoots.flatMap((name) =>
    files(discoveryRoot(path.join(root, name)), [], physicalManifestPaths)
  )
  const discoveredSources = new Set(sourceFiles)
  const coreFiles = sourceFiles.filter(
    (file) =>
      inside(path.join(root, 'packages'), file) ||
      inside(path.join(root, 'apps'), file)
  )
  const graph = new Map()
  const diagnostics = []
  if (requestedExceptions === true)
    diagnostics.push({
      file: 'package.json',
      reason: 'UNAPPROVED_EXCEPTION_REQUEST'
    })
  // Keep provenance internal: only diagnostics on the actual core closure
  // qualify this gate. Unrelated consumers retain their own quality gates.
  const diagnosticSources = new WeakMap()
  const diagnosticOrigins = new WeakMap()
  const originOrdinals = new Map()
  const originFiles = new Map()
  const captureOrigin = (file, diagnostic, origin) => {
    const absolute = path.isAbsolute(file) ? file : path.resolve(root, file)
    const relative = path.relative(root, absolute)
    let fileSha256 = null
    let physicalAvailable = false
    try {
      if (origin?.physicalFileKnown === false || !inside(root, absolute))
        throw new Error('origin_physical_source_unavailable')
      const before = fs.lstatSync(absolute, { bigint: true })
      if (
        !before.isFile() ||
        fs.realpathSync(absolute) !== absolute ||
        before.size > BigInt(semanticEngine.SEMANTIC_LIMITS.maxFileBytes)
      )
        throw new Error('origin_physical_source_invalid')
      const same = (a, b) =>
        ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every(
          (key) => a[key] === b[key]
        )
      if (!originFiles.has(absolute)) {
        const fd = fs.openSync(
          absolute,
          fs.constants.O_RDONLY |
            fs.constants.O_NOFOLLOW |
            fs.constants.O_NONBLOCK
        )
        let bytes, after
        try {
          const opened = fs.fstatSync(fd, { bigint: true })
          if (!opened.isFile() || !same(opened, before))
            throw new Error('origin_open_identity_changed')
          // One extra byte detects growth without an unbounded read/allocation.
          const buffer = Buffer.alloc(Number(opened.size) + 1)
          let count = 0
          while (count < buffer.length) {
            const read = fs.readSync(
              fd,
              buffer,
              count,
              buffer.length - count,
              null
            )
            if (read === 0) break
            count += read
          }
          after = fs.fstatSync(fd, { bigint: true })
          if (count !== Number(opened.size) || !same(opened, after))
            throw new Error('origin_read_changed')
          bytes = buffer.subarray(0, count)
        } finally {
          fs.closeSync(fd)
        }
        if (
          fs.realpathSync(absolute) !== absolute ||
          !same(after, fs.lstatSync(absolute, { bigint: true }))
        )
          throw new Error('origin_path_changed')
        originFiles.set(absolute, {
          sha256: createHash('sha256').update(bytes).digest('hex'),
          text: bytes.toString('utf8'),
          validUtf8: Buffer.from(bytes.toString('utf8')).equals(bytes),
          stat: after
        })
      }
      const snapshot = originFiles.get(absolute)
      if (!same(snapshot.stat, before))
        throw new Error('origin_cache_input_changed')
      physicalAvailable = true
      if (
        (origin?.context === 'semantic-frontier' && !origin?.node) ||
        (snapshot.validUtf8 &&
          (!origin?.source || snapshot.text === origin.source.text))
      )
        fileSha256 = snapshot.sha256
    } catch {
      /* Unavailable origin cannot retire an occurrence. */
    }
    let kind = 'NonAstDiagnostic',
      start = null,
      end = null,
      expression = null,
      synthetic
    if (origin?.node && origin.source && fileSha256) {
      try {
        start = origin.node.getStart(origin.source)
        end = origin.node.end
        kind = ts.SyntaxKind[origin.node.kind]
        expression = origin.node.getText(origin.source)
        if (!Number.isSafeInteger(start) || start < 0 || end < start)
          throw new Error('invalid_origin_span')
        if (ts.isBindingElement(origin.node)) {
          const property =
            origin.node.propertyName?.text ?? origin.node.name.text
          if (typeof property === 'string')
            synthetic = {
              originalKind: kind,
              originalStart: start,
              originalEnd: end,
              property
            }
        }
      } catch {
        kind = 'UnavailableAstOrigin'
        start = null
        end = null
        expression = null
      }
    }
    const tuple = {
      file: physicalAvailable ? relative : null,
      fileSha256: physicalAvailable ? fileSha256 : null,
      ...(!physicalAvailable && origin?.context !== 'semantic-frontier'
        ? { requestedFile: relative }
        : {}),
      kind,
      start,
      end,
      reason: diagnostic.reason,
      context:
        origin?.context ??
        (origin ? 'loader-diagnostic' : 'physical-diagnostic'),
      diagnosticExpression: diagnostic.expression ?? null,
      expression,
      ...(origin?.semanticPointer
        ? { semanticPointer: origin.semanticPointer }
        : {}),
      ...(synthetic ? { synthetic } : {})
    }
    const key = semanticEngine.semanticCanonicalJson(tuple)
    const ordinal = originOrdinals.get(key) ?? 0
    originOrdinals.set(key, ordinal + 1)
    const data = { ...tuple, ordinal }
    data.id = semanticEngine.semanticOriginId(data)
    diagnosticOrigins.set(diagnostic, data)
    return data
  }
  const reportDiagnostic = (file, diagnostic, origin) => {
    diagnosticSources.set(diagnostic, file)
    if (semantic) captureOrigin(file, diagnostic, origin)
    diagnostics.push(diagnostic)
  }
  if (coreFiles.length === 0)
    diagnostics.push({
      file: 'package.json',
      reason: 'EMPTY_CORE_SOURCE_INVENTORY'
    })
  const consumerEnvReferences = new Map()
  const workspaces = new Map()
  const manifest = boundaryManifest(path.join(root, 'package.json'), true, root)
  // Active repository actors: documentary evidence is a separate owner. Its
  // package contexts are inspected if a local reference enters that closure.
  for (const actor of [
    ...sourceRoots,
    'tools',
    'scripts',
    'examples',
    'config'
  ])
    metadata.census(discoveryRoot(path.join(root, actor)))
  const physicalManifests = new Map(
    [...physicalManifestPaths].map((filename) => [
      filename,
      boundaryManifest(filename)
    ])
  )
  const configFile = path.join(root, 'tsconfig.base.json')
  let compilerOptions = {
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    module: ts.ModuleKind.NodeNext,
    allowJs: true
  }
  if (fs.existsSync(configFile)) {
    const parsed = ts.readConfigFile(configFile, ts.sys.readFile)
    if (parsed.error)
      throw new Error(
        `invalid_boundary_config:${ts.flattenDiagnosticMessageText(parsed.error.messageText, '\n')}`
      )
    if (
      invalidTsconfigPathPatterns(parsed.config.compilerOptions?.paths).length
    )
      throw new Error('invalid_boundary_config:TSCONFIG_PATHS_INVALID')
    const configuration = ts.parseJsonConfigFileContent(
      parsed.config,
      ts.sys,
      root
    )
    // TS18003 means a source-less fixture; option parse errors still fail closed.
    const errors = configuration.errors.filter((error) => error.code !== 18003)
    if (errors.length)
      throw new Error(
        `invalid_boundary_config:${errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join(';')}`
      )
    if (invalidTsconfigPathPatterns(configuration.options.paths).length)
      throw new Error('invalid_boundary_config:TSCONFIG_PATHS_INVALID')
    compilerOptions = configuration.options
  }
  for (const pattern of manifest.workspaces) {
    const prefix = pattern.slice(0, -2)
    // Preserve the existing containment diagnostic before grammar refinement.
    if (pattern.endsWith('/*') && !inside(root, path.resolve(root, prefix)))
      throw new Error(
        `discovery_outside_repository:${path.resolve(root, prefix)}`
      )
    if (
      !pattern.endsWith('/*') ||
      !prefix ||
      path.isAbsolute(prefix) ||
      /[?*\[\]{}!\\]/.test(prefix) ||
      prefix.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw new Error(`unsupported_workspace_pattern:${pattern}`)
    const parent = discoveryRoot(path.resolve(root, pattern.slice(0, -2)))
    try {
      if (fs.lstatSync(parent).isSymbolicLink())
        throw new Error(`unverified_workspace_parent:${parent}`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    if (!fs.existsSync(parent)) continue
    metadata.census(parent)
    for (const entry of fs.readdirSync(parent, { withFileTypes: true })) {
      if (entry.isSymbolicLink())
        throw new Error(`unverified_workspace_symlink:${entry.name}`)
      if (!entry.isDirectory()) continue
      const workspace = path.join(parent, entry.name)
      const pkgFile = path.join(workspace, 'package.json')
      if (!fs.existsSync(pkgFile)) continue
      const pkg =
        physicalManifests.get(pkgFile) ?? boundaryManifest(pkgFile, false, root)
      if (workspaces.has(pkg.name))
        throw new Error(`duplicate_workspace:${pkg.name}`)
      workspaces.set(pkg.name, { workspace, pkg })
    }
  }
  // Every supported declared workspace has an implementation frontier,
  // including parents outside the four standard source roots.
  for (const { workspace } of workspaces.values())
    for (const file of files(workspace))
      if (!discoveredSources.has(file)) {
        discoveredSources.add(file)
        sourceFiles.push(file)
      }
  const discoveredManifestPaths = new Set(
    [...workspaces.values()].map(({ workspace }) =>
      path.join(workspace, 'package.json')
    )
  )
  for (const filename of physicalManifestPaths)
    if (!discoveredManifestPaths.has(filename))
      throw new Error(
        `unverified_workspace_manifest_coverage:${path.relative(root, filename)}`
      )
  const edge = (from, to) => {
    if (!graph.has(from)) graph.set(from, new Set())
    graph.get(from).add(to)
  }
  const owner = (file) =>
    [...workspaces.values()].find((item) => inside(item.workspace, file))
  const workspaceNode = (item) => path.join(item.workspace, 'package.json')
  // Product identifiers for the installed-package tripwire: every product
  // workspace name and every products/<dir> path spelling.
  const productReferences = new Set(
    [...workspaces.values()]
      .filter((item) => inside(productRoot, item.workspace))
      .map((item) => item.pkg.name)
  )
  if (fs.existsSync(productRoot))
    for (const entry of fs.readdirSync(productRoot))
      productReferences.add(`products/${entry}`)
  const installedPackages = createInstalledPackageVerifier(root, {
    productReferences: [...productReferences],
    installedReference
  })
  // Installed third-party packages are terminal nodes keyed by their canonical
  // directory. They are verified and expanded by settleInstalled() without
  // ever entering the parsed source inventory. Metadata alone is not proof, so
  // these nodes remain unverified under SPEC0228.
  const installedNodes = new Map()
  const installedQueue = []
  const installedDrift = new Map()
  const installedVerdicts = new Map()
  const installedNode = (from, located) => {
    let node = installedNodes.get(located.context)
    if (!node) {
      const manifest = path.join(located.context, 'package.json')
      node = fs.existsSync(manifest) ? manifest : located.context
      installedNodes.set(located.context, node)
      installedQueue.push({ node, ...located })
    }
    edge(from, node)
  }
  // Canonical classification of a successor reached from an installed node:
  // product -> violation witness; workspace -> first-party closure continues;
  // installed -> verified terminal; anything else stays fail-closed.
  const installedSuccessor = (node, target, specifier) => {
    if (!inside(root, target)) {
      reportDiagnostic(node, {
        file: path.relative(root, node),
        specifier,
        reason: 'MODULE_OUTSIDE_REPOSITORY'
      })
      return
    }
    const vendor = installedContext(root, target)
    if (vendor) {
      installedNode(node, vendor)
      return
    }
    const manifest = path.join(target, 'package.json')
    edge(node, fs.existsSync(manifest) ? manifest : target)
    if (inside(productRoot, target)) return
    const workspace = owner(target)
    if (workspace) {
      edge(node, workspaceNode(workspace))
      return
    }
    reportDiagnostic(node, {
      file: path.relative(root, node),
      specifier,
      reason: 'UNVERIFIED_INSTALLED_DEPENDENCY'
    })
    const context = fs.statSync(target).isDirectory()
      ? target
      : path.dirname(target)
    governActor(context)
  }
  const nestedInstalledSuccessor = (node, context, nested) => {
    const candidate = path.join(context, nested)
    let target
    try {
      target = fs.realpathSync(candidate)
    } catch (error) {
      if (!['ENOENT', 'ELOOP'].includes(error.code)) throw error
      reportDiagnostic(node, {
        file: path.relative(root, candidate),
        specifier: nested,
        reason: 'UNVERIFIED_INSTALLED_PACKAGE',
        detail:
          error.code === 'ELOOP'
            ? 'CYCLIC_INSTALLED_LINK'
            : 'DANGLING_INSTALLED_LINK'
      })
      return
    }
    installedSuccessor(node, target, nested)
  }
  const settleInstalled = () => {
    while (installedQueue.length) {
      const { node, context, key, valid } = installedQueue.shift()
      // A product-owned installation is itself the violation witness.
      if (inside(productRoot, context)) continue
      if (!valid) {
        reportDiagnostic(node, {
          file: path.relative(root, context),
          reason: 'UNVERIFIED_INSTALLED_PACKAGE',
          detail: 'INVALID_INSTALLED_PATH'
        })
        continue
      }
      const verdict = installedPackages.verify(context, key)
      installedVerdicts.set(node, verdict)
      if (!verdict.verified)
        reportDiagnostic(node, {
          file: path.relative(root, node),
          reason: 'UNVERIFIED_INSTALLED_PACKAGE',
          detail: verdict.reason
        })
      if (verdict.drift) installedDrift.set(node, verdict.drift)
      // Nested physical installations are independent successor packages,
      // including undeclared entries. They retain the existing product checks.
      for (const nested of verdict.contentIdentity?.nestedPackages ?? [])
        nestedInstalledSuccessor(node, context, nested)
      for (const { name } of verdict.dependencies ?? []) {
        let located
        try {
          located = locateInstalled(
            root,
            path.join(context, 'package.json'),
            name
          )
        } catch (error) {
          if (!installedReference || error.code !== 'ELOOP') throw error
          reportDiagnostic(node, {
            file: path.relative(root, node),
            specifier: name,
            reason: 'UNVERIFIED_INSTALLED_PACKAGE',
            detail: 'CYCLIC_INSTALLED_LINK'
          })
          continue
        }
        // Absent optional/peer/unmet dependencies have no physical edge.
        if (!located) continue
        if (located.dangling)
          reportDiagnostic(node, {
            file: path.relative(root, located.candidate),
            specifier: name,
            reason: 'UNVERIFIED_INSTALLED_PACKAGE',
            detail: 'DANGLING_INSTALLED_LINK'
          })
        else installedSuccessor(node, located.context, name)
      }
      const {
        references,
        links,
        limitation,
        nestedPackages = []
      } = installedPackages.scan(context)
      for (const nested of nestedPackages)
        nestedInstalledSuccessor(node, context, nested)
      if (limitation) {
        if (verdict.contentIdentity) {
          verdict.contentIdentity.status = 'UNSUPPORTED'
          verdict.contentIdentity.reasons.push(limitation)
        }
        reportDiagnostic(node, {
          file: path.relative(root, node),
          reason: 'UNVERIFIED_INSTALLED_PACKAGE',
          detail: limitation
        })
      }
      for (const { file, reference } of references)
        reportDiagnostic(node, {
          file: path.relative(root, file),
          reference,
          reason: 'INSTALLED_PACKAGE_REFERENCES_PRODUCT'
        })
      for (const link of links) {
        let target
        try {
          target = fs.realpathSync(link)
        } catch (error) {
          // A dangling link cannot be loaded; nothing physical is reachable.
          if (
            error.code === 'ENOENT' ||
            (installedReference && error.code === 'ELOOP')
          )
            continue
          throw error
        }
        installedSuccessor(node, target, path.relative(root, link))
      }
    }
  }
  const governedActors = new Set()
  const linkedManifests = new Set()
  // Shape validation and graph reachability are separate obligations. Every
  // governed actor manifest must retain its dependencies, even after census
  // was memoized by an earlier workspace or local metadata reference.
  const manifestEdges = (pkgFile) => {
    if (linkedManifests.has(pkgFile)) return
    linkedManifests.add(pkgFile)
    const pkg = metadata.read(pkgFile)
    for (const field of manifestDependencyFields)
      for (const [name, version] of Object.entries(pkg[field] ?? {})) {
        const specifier = version.trim()
        if (/^(file|link):/.test(specifier)) {
          const ref = metadata.localEdge(pkgFile, field, name, version)
          if (ref.unresolved) {
            reportDiagnostic(pkgFile, ref.unresolved)
          } else {
            const targetPkg = ref.manifest
            edge(pkgFile, targetPkg)
            const context = path.dirname(targetPkg)
            const dependency = [...workspaces.values()].find(
              (item) => item.workspace === context
            )
            if (dependency) edge(pkgFile, workspaceNode(dependency))
            else
              reportDiagnostic(pkgFile, {
                file: path.relative(root, pkgFile),
                specifier: name,
                reason: 'UNVERIFIED_LOCAL_DEPENDENCY'
              })
            governActor(context)
          }
        } else {
          let targetName = name
          if (specifier.startsWith('npm:')) {
            const alias = specifier.slice(4),
              separator = alias.lastIndexOf('@')
            targetName = separator > 0 ? alias.slice(0, separator) : alias
          }
          const dependency = workspaces.get(targetName)
          if (dependency) edge(pkgFile, workspaceNode(dependency))
          else if (specifier.startsWith('workspace:'))
            reportDiagnostic(pkgFile, {
              file: path.relative(root, pkgFile),
              specifier: name,
              reason: 'UNVERIFIED_WORKSPACE_DEPENDENCY'
            })
        }
        // A declared workspace edge supplements, never replaces, the physical
        // successor. Node resolves the declared installation key in the
        // declaring manifest's lookup order, including npm/workspace aliases.
        const installed = metadata.installedPackage(pkgFile, name)
        if (!installed) continue
        const vendor = installedContext(root, installed.context)
        if (vendor) {
          // Canonically installed third-party package: verified terminal node.
          installedNode(pkgFile, vendor)
        } else {
          // Canonical first-party destination (workspace link, product link or
          // local directory): its metadata stays governed and fail-closed.
          edge(pkgFile, installed.manifest ?? installed.context)
          const workspace = [...workspaces.values()].find(
            (item) => item.workspace === installed.context
          )
          if (workspace) edge(pkgFile, workspaceNode(workspace))
          else
            reportDiagnostic(pkgFile, {
              file: path.relative(root, pkgFile),
              specifier: name,
              reason: 'UNVERIFIED_INSTALLED_DEPENDENCY'
            })
          // A physical directory owns recursive metadata even if the root
          // package.json is absent; unknown implementation still blocks.
          governActor(installed.context)
        }
        // The runtime entry is resolved as well: an entry that escapes the
        // installed directory is classified by its own canonical path.
        for (const mode of ['require', 'import'])
          runtimeReferences.push({
            file: pkgFile,
            location: path.relative(root, pkgFile),
            specifier: name,
            mode,
            manifestEdge: { field, version }
          })
      }
  }
  const governActor = (context) => {
    if (governedActors.has(context)) return
    governedActors.add(context)
    const pkgFile = path.join(context, 'package.json')
    const hasManifest = fs.existsSync(pkgFile)
    if (hasManifest || context === root) metadata.read(pkgFile)
    if (context !== root) metadata.census(context)
    const actorNode = hasManifest ? pkgFile : context
    const manifests =
      context === root
        ? [pkgFile]
        : [...metadata.cache.keys()].filter(
            (file) =>
              inside(context, file) &&
              !path
                .relative(context, file)
                .split(path.sep)
                .some((part) => ['node_modules', '.git'].includes(part))
          )
    for (const filename of manifests) {
      if (filename !== actorNode) edge(actorNode, filename)
      manifestEdges(filename)
    }
  }
  const runtimeReferences = []
  const declaration = (file) => /\.d\.[cm]?ts$/.test(file)
  const sourceProjection = (ref) => {
    if (
      !ref.typeTarget ||
      declaration(ref.typeTarget) ||
      !/\.[cm]?tsx?$/.test(ref.typeTarget)
    )
      return false
    const matches = (candidate) => {
      const ext = path.extname(candidate)
      const substitutions =
        {
          '.js': ['.ts', '.tsx'],
          '.mjs': ['.mts'],
          '.cjs': ['.cts']
        }[ext] ?? []
      const candidates = [
        candidate,
        ...substitutions.map(
          (suffix) => candidate.slice(0, -ext.length) + suffix
        )
      ]
      if (!ext && ref.mode === 'require')
        candidates.push(
          `${candidate}.ts`,
          `${candidate}.tsx`,
          path.join(candidate, 'index.ts'),
          path.join(candidate, 'index.tsx')
        )
      return candidates.some(
        (value) => path.resolve(value) === path.resolve(ref.typeTarget)
      )
    }
    if (ref.specifier.startsWith('.'))
      return matches(path.resolve(path.dirname(ref.file), ref.specifier))
    // Explicit TS path mappings are the repository's source build projection.
    // A package's "types" condition alone never establishes a runtime target.
    for (const [pattern, replacements] of Object.entries(
      compilerOptions.paths ?? {}
    )) {
      const [prefix, suffix] = pattern.split('*')
      const matched =
        suffix === undefined
          ? ref.specifier === prefix
          : ref.specifier.startsWith(prefix) && ref.specifier.endsWith(suffix)
      if (!matched) continue
      const wildcard =
        suffix === undefined
          ? ''
          : ref.specifier.slice(
              prefix.length,
              ref.specifier.length - suffix.length
            )
      for (const replacement of replacements)
        if (
          matches(
            path.resolve(
              compilerOptions.baseUrl ?? root,
              expandSingleWildcard(replacement, wildcard)
            )
          )
        )
          return true
    }
    return false
  }
  const localTarget = (file, location, specifier, resolvedFile) => {
    const target = fs.realpathSync(path.resolve(resolvedFile))
    if (!inside(root, target)) {
      reportDiagnostic(file, {
        file: location,
        specifier,
        reason: 'MODULE_OUTSIDE_REPOSITORY'
      })
      return
    }
    // Every resolved physical destination is part of the closure. Inside an
    // installed package it is a verified terminal node (never parsed); a
    // canonical path inside products/ is a violation witness either way.
    const vendor = installedContext(root, target)
    if (vendor) {
      installedNode(file, vendor)
      return
    }
    // A declaration is never evidence about different JS.
    edge(file, target)
    if (extensions.has(path.extname(target))) {
      if (!discoveredSources.has(target)) {
        discoveredSources.add(target)
        sourceFiles.push(target)
      }
    } else if (!['.json', '.css'].includes(path.extname(target))) {
      reportDiagnostic(file, {
        file: location,
        specifier,
        reason: 'UNVERIFIED_MODULE_FORMAT'
      })
    }
    const targetOwner = owner(target)
    if (targetOwner) edge(file, workspaceNode(targetOwner))
    // A source reference makes its nearest physical package context an actor.
    // Documentary trees remain opaque unless an implementation edge enters.
    let context = path.dirname(target)
    while (inside(root, context)) {
      const pkgFile = path.join(context, 'package.json')
      if (fs.existsSync(pkgFile)) {
        // Root ancestry alone does not govern documentary archives. A reached
        // nonRoot physical actor owns all of its recursively censused metadata.
        edge(file, pkgFile)
        governActor(context)
        break
      }
      if (context === root) break
      context = path.dirname(context)
    }
  }
  // Ask Node for physical runtime targets without importing/executing them.
  // Batch the frontier so a repository scan does not spawn once per import.
  const resolveRuntime = () => {
    const pending = runtimeReferences.splice(0)
    const conditions = []
    for (let index = 0; index < process.execArgv.length; index += 1) {
      const arg = process.execArgv[index]
      if (/^(--conditions=|-C=)/.test(arg)) conditions.push(arg)
      else if (
        ['--conditions', '-C'].includes(arg) &&
        process.execArgv[index + 1]
      )
        conditions.push(arg, process.execArgv[++index])
    }
    const child = spawnSync(
      process.execPath,
      [
        ...conditions,
        '--experimental-import-meta-resolve',
        '--input-type=module',
        '--eval',
        `import fs from 'node:fs';
         import {createRequire} from 'node:module';
         import {fileURLToPath,pathToFileURL} from 'node:url';
         const refs=JSON.parse(fs.readFileSync(0,'utf8'));
         console.log(JSON.stringify(refs.map(({file,specifier,mode})=>{
           try {
             const target=mode==='require' ? createRequire(file).resolve(specifier)
               : fileURLToPath(import.meta.resolve(specifier,pathToFileURL(file).href));
             return fs.statSync(target).isFile() ? target : null;
           } catch { return null; }
         })));`
      ],
      {
        input: JSON.stringify(pending),
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 16 * 1024 * 1024
      }
    )
    let targets
    try {
      if (child.status === 0) targets = JSON.parse(child.stdout)
    } catch {
      // Malformed/incomplete resolver output is an unknown frontier, never PASS.
    }
    for (const [index, ref] of pending.entries()) {
      const target = targets?.[index]
      if (ref.manifestEdge) {
        const complete =
          Array.isArray(targets) &&
          targets.length === pending.length &&
          targets.every((value) => value === null || typeof value === 'string')
        if (!complete)
          reportDiagnostic(ref.file, {
            file: ref.location,
            specifier: ref.specifier,
            dependencyField: ref.manifestEdge.field,
            mode: ref.mode,
            reason: 'UNVERIFIED_INSTALLED_RUNTIME_RESOLUTION'
          })
        // The entry's canonical path decides: installed package (verified
        // terminal), product (violation), outside (diagnostic) or first-party
        // (parsed, nearest package governed). A null entry (types-only or
        // condition-less package) adds no physical runtime edge.
        else if (typeof target === 'string')
          localTarget(ref.file, ref.location, ref.specifier, target)
        continue
      }
      if (typeof target === 'string')
        localTarget(ref.file, ref.location, ref.specifier, target)
      // Unbuilt TS projects intentionally use extension substitution and paths.
      // Only an implementation source is evidence for that build projection;
      // declarations cannot stand in for a missing or different runtime.
      else if (
        Array.isArray(targets) &&
        targets.length === pending.length &&
        sourceProjection(ref)
      )
        localTarget(ref.file, ref.location, ref.specifier, ref.typeTarget)
      else
        reportDiagnostic(ref.file, {
          file: ref.location,
          specifier: ref.specifier,
          reason: ref.typeTarget
            ? 'UNRESOLVED_RUNTIME_MODULE_REFERENCE'
            : 'UNRESOLVED_MODULE_REFERENCE'
        })
    }
  }
  for (const item of workspaces.values()) {
    for (const file of sourceFiles.filter((file) =>
      inside(item.workspace, file)
    ))
      edge(workspaceNode(item), file)
    governActor(item.workspace)
  }
  function reference(
    file,
    node,
    specifier,
    typeDirective = false,
    mode = 'types'
  ) {
    const location = `${path.relative(root, file)}:${ts.getLineAndCharacterOfPosition(node.getSourceFile(), node.getStart()).line + 1}`
    if (!specifier) {
      reportDiagnostic(file, {
        file: location,
        reason: 'NON_LITERAL_MODULE_REFERENCE'
      })
      return
    }
    if (isBuiltin(specifier)) return
    const dependency = [...workspaces.entries()].find(
      ([name]) => specifier === name || specifier.startsWith(`${name}/`)
    )?.[1]
    if (dependency) edge(file, workspaceNode(dependency))
    // A bare package specifier also names a physical package directory. If
    // Node's lookup from this file finds it canonically inside products/, the
    // reference is a product edge even when no entry file resolves.
    const bare = /^(?:@[^/]+\/)?[^./@][^/]*/.exec(specifier)?.[0]
    if (bare && !specifier.startsWith('#')) {
      const located = locateInstalled(root, file, bare)
      if (located?.context && inside(productRoot, located.context)) {
        const manifest = path.join(located.context, 'package.json')
        edge(file, fs.existsSync(manifest) ? manifest : located.context)
      }
    }
    const resolved = typeDirective
      ? ts.resolveTypeReferenceDirective(
          specifier,
          file,
          compilerOptions,
          ts.sys
        ).resolvedTypeReferenceDirective
      : ts.resolveModuleName(
          specifier,
          file,
          compilerOptions,
          ts.sys,
          undefined,
          undefined,
          mode === 'import'
            ? ts.ModuleKind.ESNext
            : mode === 'require'
              ? ts.ModuleKind.CommonJS
              : ts.getImpliedNodeFormatForFile(
                  file,
                  undefined,
                  ts.sys,
                  compilerOptions
                )
        ).resolvedModule
    let resolvedFile = resolved?.resolvedFileName
    // TypeScript deliberately does not resolve stylesheet side-effect imports.
    // Resolve an existing asset rather than exempting an unresolved specifier.
    if (!resolvedFile && specifier.endsWith('.css')) {
      try {
        resolvedFile = createRequire(file).resolve(specifier)
      } catch {
        resolvedFile = undefined
      }
    }
    if (mode !== 'types')
      runtimeReferences.push({
        file,
        location,
        specifier,
        mode,
        typeTarget: resolvedFile
      })
    if (!resolvedFile && mode === 'types') {
      reportDiagnostic(file, {
        file: location,
        specifier,
        reason: 'UNRESOLVED_MODULE_REFERENCE'
      })
      return
    }
    if (resolvedFile) localTarget(file, location, specifier, resolvedFile)
  }
  const literal = (node) => {
    while (
      node &&
      (ts.isParenthesizedExpression(node) ||
        ts.isAsExpression(node) ||
        ts.isSatisfiesExpression(node) ||
        ts.isNonNullExpression(node) ||
        ts.isTypeAssertionExpression(node))
    )
      node = node.expression
    return node && (ts.isStringLiteralLike(node) ? node.text : undefined)
  }
  let sourceIndex = 0
  while (
    sourceIndex < sourceFiles.length ||
    runtimeReferences.length ||
    installedQueue.length
  ) {
    if (sourceIndex === sourceFiles.length) {
      if (installedQueue.length) settleInstalled()
      else resolveRuntime()
      continue
    }
    const file = sourceFiles[sourceIndex++]
    const source = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    )
    const nativeJs = ['.js', '.mjs', '.cjs'].includes(path.extname(file))
      ? spawnSync(process.execPath, ['--check', file], {
          encoding: 'utf8',
          timeout: 10000,
          maxBuffer: 1024 * 1024
        })
      : undefined
    if (source.parseDiagnostics.length || (nativeJs && nativeJs.status !== 0))
      reportDiagnostic(file, {
        file: path.relative(root, file),
        reason: 'SOURCE_PARSE_ERROR'
      })
    const commonJs =
      ts.getImpliedNodeFormatForFile(
        file,
        undefined,
        ts.sys,
        compilerOptions
      ) === ts.ModuleKind.CommonJS
    const lexical = createBoundaryLexical(ts, source, commonJs, (diagnostic) =>
      reportDiagnostic(file, {
        ...diagnostic,
        file: path.relative(root, file)
      })
    )
    const { identity, writeIdentity, global, erased, isDeclarationName } =
      lexical
    const typeOnly = (node) => {
      if (
        erased(node) ||
        (declaration(file) &&
          (ts.isImportDeclaration(node) ||
            ts.isExportDeclaration(node) ||
            ts.isImportEqualsDeclaration(node)))
      )
        return true
      const bindings = ts.isImportDeclaration(node)
        ? node.importClause?.namedBindings
        : node.exportClause
      return (
        !node.importClause?.name &&
        bindings?.elements?.length > 0 &&
        bindings.elements.every((item) => item.isTypeOnly)
      )
    }
    const factories = new Set()
    const moduleNamespaces = new Set()
    const loaders = new Set([global('require')])
    const moduleHosts = new Set([global('module')])
    const resolvers = new Set()
    const processNamespaces = new Set([global('process')])
    const builtinGetters = new Set()
    const importResolvers = new Set()
    const globalNamespaces = new Set([global('global'), global('globalThis')])
    const metaNamespaces = new Set()
    const nodes = []
    const collect = (node) => {
      nodes.push(node)
      ts.forEachChild(node, collect)
    }
    collect(source)
    const runtimeNodes = nodes.filter((node) => !erased(node))
    // Assignment and iteration patterns write their leaves, not the pattern
    // container. Treat every way of changing a loader anchor conservatively.
    const targets = (node) => {
      if (!node) return []
      if (
        ts.isParenthesizedExpression(node) ||
        ts.isAsExpression(node) ||
        ts.isSatisfiesExpression(node) ||
        ts.isNonNullExpression(node) ||
        ts.isTypeAssertionExpression(node)
      )
        return targets(node.expression)
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      )
        return targets(node.left)
      if (ts.isArrayLiteralExpression(node) || ts.isArrayBindingPattern(node))
        return node.elements.flatMap(targets)
      if (ts.isObjectLiteralExpression(node))
        return node.properties.flatMap((item) =>
          ts.isPropertyAssignment(item)
            ? targets(item.initializer)
            : ts.isShorthandPropertyAssignment(item)
              ? targets(item.name)
              : ts.isSpreadAssignment(item)
                ? targets(item.expression)
                : []
        )
      if (ts.isObjectBindingPattern(node)) return node.elements.flatMap(targets)
      if (ts.isBindingElement(node)) return targets(node.name)
      if (ts.isSpreadElement(node)) return targets(node.expression)
      if (ts.isVariableDeclarationList(node))
        return node.declarations.flatMap((item) => targets(item.name))
      return [node]
    }
    const assignment = (node) =>
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
    const writes = (node) => {
      if (assignment(node)) return targets(node.left)
      if (ts.isForOfStatement(node) || ts.isForInStatement(node))
        return targets(node.initializer)
      if (
        (ts.isPrefixUnaryExpression(node) ||
          ts.isPostfixUnaryExpression(node)) &&
        [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
          node.operator
        )
      )
        return targets(node.operand)
      if (ts.isDeleteExpression(node)) return targets(node.expression)
      return []
    }
    // Only writes to the actual filename global invalidate its origin. A
    // shadowed origin is refused at the use, without poisoning other scopes.
    const filenameRebound = runtimeNodes.some(
      (node) =>
        (ts.isVariableDeclaration(node) &&
          node.initializer &&
          ts.isIdentifier(node.name) &&
          identity(node.name) === global('__filename')) ||
        writes(node).some(
          (name) =>
            ts.isIdentifier(name) && identity(name) === global('__filename')
        )
    )
    let metaUrlRebound = false
    const unwrap = (node) => {
      while (
        node &&
        (ts.isParenthesizedExpression(node) ||
          ts.isAsExpression(node) ||
          ts.isSatisfiesExpression(node) ||
          ts.isNonNullExpression(node))
      )
        node = node.expression
      return node
    }
    const property = (node) =>
      ts.isPropertyAccessExpression(node)
        ? node.name.text
        : ts.isElementAccessExpression(node)
          ? literal(node.argumentExpression)
          : undefined
    const bindingProperty = (item) => {
      const name = item.propertyName ?? item.name
      return ts.isIdentifier(name)
        ? name.text
        : literal(ts.isComputedPropertyName(name) ? name.expression : name)
    }
    const isGlobal = (node) => {
      node = unwrap(node)
      return (
        node && ts.isIdentifier(node) && globalNamespaces.has(identity(node))
      )
    }
    const isMeta = (node) => {
      node = unwrap(node)
      return (
        node &&
        ((ts.isIdentifier(node) && metaNamespaces.has(identity(node))) ||
          (ts.isMetaProperty(node) &&
            node.keywordToken === ts.SyntaxKind.ImportKeyword))
      )
    }
    const isProcess = (node) => {
      node = unwrap(node)
      return (
        node &&
        ((ts.isIdentifier(node) && processNamespaces.has(identity(node))) ||
          (property(node) === 'default' && isProcess(node.expression)) ||
          (property(node) === 'process' && isGlobal(node.expression)) ||
          (ts.isCallExpression(node) &&
            (isLoader(node.expression) || isBuiltinGetter(node.expression)) &&
            ['process', 'node:process'].includes(literal(node.arguments[0]))))
      )
    }
    const isBuiltinGetter = (node) => {
      node = unwrap(node)
      return (
        node &&
        ((ts.isIdentifier(node) && builtinGetters.has(identity(node))) ||
          (property(node) === 'getBuiltinModule' && isProcess(node.expression)))
      )
    }
    const isModuleNamespace = (node) => {
      node = unwrap(node)
      return (
        node &&
        ((ts.isIdentifier(node) && moduleNamespaces.has(identity(node))) ||
          (property(node) === 'default' &&
            isModuleNamespace(node.expression)) ||
          (ts.isCallExpression(node) &&
            (isLoader(node.expression) || isBuiltinGetter(node.expression)) &&
            ['module', 'node:module'].includes(literal(node.arguments[0]))))
      )
    }
    const isFactory = (node) => {
      node = unwrap(node)
      return (
        node &&
        ((ts.isIdentifier(node) && factories.has(identity(node))) ||
          (property(node) === 'createRequire' &&
            isModuleNamespace(node.expression)))
      )
    }
    const isLoader = (node) => {
      node = unwrap(node)
      return (
        node &&
        ((ts.isIdentifier(node) && loaders.has(identity(node))) ||
          (property(node) === 'require' &&
            (isHost(node.expression) ||
              isGlobal(node.expression) ||
              isModuleNamespace(node.expression))) ||
          (ts.isCallExpression(node) && isFactory(node.expression)))
      )
    }
    const isHost = (node) => {
      node = unwrap(node)
      return (
        node &&
        ((ts.isIdentifier(node) && moduleHosts.has(identity(node))) ||
          (property(node) === 'mainModule' && isProcess(node.expression)))
      )
    }
    const isResolver = (node) => {
      node = unwrap(node)
      return (
        node &&
        ((ts.isIdentifier(node) && resolvers.has(identity(node))) ||
          (property(node) === 'resolve' && isLoader(node.expression)))
      )
    }
    const isImportResolver = (node) => {
      node = unwrap(node)
      return (
        node &&
        ((ts.isIdentifier(node) && importResolvers.has(identity(node))) ||
          (property(node) === 'resolve' && isMeta(node.expression)))
      )
    }
    for (const node of runtimeNodes) {
      if (typeOnly(node)) continue
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        ['process', 'node:process'].includes(
          literal(node.moduleReference.expression)
        )
      )
        processNamespaces.add(identity(node.name))
      if (
        ts.isImportDeclaration(node) &&
        ['process', 'node:process'].includes(literal(node.moduleSpecifier))
      ) {
        const clause = node.importClause
        if (clause?.name) processNamespaces.add(identity(clause.name))
        const bindings = clause?.namedBindings
        if (bindings && ts.isNamespaceImport(bindings))
          processNamespaces.add(identity(bindings.name))
        if (bindings && ts.isNamedImports(bindings))
          for (const item of bindings.elements) {
            if (item.isTypeOnly) continue
            const name = item.propertyName?.text ?? item.name.text
            if (name === 'default') processNamespaces.add(identity(item.name))
            if (name === 'getBuiltinModule')
              builtinGetters.add(identity(item.name))
            if (name === 'mainModule') moduleHosts.add(identity(item.name))
          }
      }
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference) &&
        ['module', 'node:module'].includes(
          literal(node.moduleReference.expression)
        )
      )
        moduleNamespaces.add(identity(node.name))
      if (
        !ts.isImportDeclaration(node) ||
        !['module', 'node:module'].includes(literal(node.moduleSpecifier))
      )
        continue
      const clause = node.importClause
      if (clause?.name) moduleNamespaces.add(identity(clause.name))
      const bindings = clause?.namedBindings
      if (bindings && ts.isNamespaceImport(bindings))
        moduleNamespaces.add(identity(bindings.name))
      if (bindings && ts.isNamedImports(bindings))
        for (const item of bindings.elements) {
          if (
            !item.isTypeOnly &&
            (item.propertyName?.text ?? item.name.text) === 'default'
          )
            moduleNamespaces.add(identity(item.name))
          if (
            !item.isTypeOnly &&
            (item.propertyName?.text ?? item.name.text) === 'createRequire'
          )
            factories.add(identity(item.name))
        }
    }
    // Visit bindings with their full source path, including nested namespaces.
    // Keep the original BindingElement for diagnostics: synthesized accesses
    // have no source position and must never be used as diagnostic locations.
    const walkBinding = (pattern, expression, visit) => {
      if (!ts.isObjectBindingPattern(pattern)) return
      for (const item of pattern.elements) {
        const name = bindingProperty(item)
        const selected =
          !item.dotDotDotToken && name !== undefined
            ? ts.factory.createElementAccessExpression(
                expression,
                ts.factory.createStringLiteral(name)
              )
            : undefined
        visit(item, expression, selected)
        if (selected && ts.isObjectBindingPattern(item.name))
          walkBinding(item.name, selected, visit)
      }
    }
    const capabilities = [
      [factories, isFactory],
      [moduleNamespaces, isModuleNamespace],
      [loaders, isLoader],
      [moduleHosts, isHost],
      [resolvers, isResolver],
      [processNamespaces, isProcess],
      [builtinGetters, isBuiltinGetter],
      [importResolvers, isImportResolver],
      [globalNamespaces, isGlobal],
      [metaNamespaces, isMeta]
    ]
    const hasCapability = (expression) =>
      expression && capabilities.some(([, matches]) => matches(expression))
    // Resolve local aliases to a fixed point; escaping loaders are rejected below.
    let changed = true
    while (changed) {
      changed = false
      const bind = (name, expression) => {
        for (const [set, matches] of capabilities) {
          if (valueBranches(ts, expression).some(matches) && !set.has(name)) {
            set.add(name)
            changed = true
          }
        }
      }
      for (const [body, parameter] of lexical.initialTransfers)
        bind(identity(body), parameter)
      for (const node of runtimeNodes) {
        if (
          (ts.isVariableDeclaration(node) || ts.isParameter(node)) &&
          node.initializer
        )
          assignedValues(
            ts,
            node.name,
            node.initializer,
            literal,
            (name, value) => bind(writeIdentity(name), value)
          )
        if (assignment(node))
          assignedValues(ts, node.left, node.right, literal, (name, value) =>
            bind(identity(name), value)
          )
      }
    }
    metaUrlRebound = runtimeNodes.some((node) =>
      writes(node).some(
        (target) =>
          (ts.isPropertyAccessExpression(target) ||
            ts.isElementAccessExpression(target)) &&
          property(target) === 'url' &&
          isMeta(target.expression)
      )
    )
    // `expression` digests the complete flagged expression, so a reviewed
    // exception binds the whole construct (a multi-line call includes its
    // arguments), not merely the line where it starts.
    const loaderDiagnostic = (node, reason) =>
      reportDiagnostic(
        file,
        {
          file: `${path.relative(root, file)}:${ts.getLineAndCharacterOfPosition(source, node.getStart()).line + 1}`,
          reason,
          expression: expressionDigest(node.getText(source))
        },
        { node, source }
      )
    const { scalarMetadata } = auditDynamicCodeExecution({
      ts,
      source,
      lexical,
      runtimeNodes,
      typeOnly,
      literal,
      isLoader,
      isBuiltinGetter,
      isGlobal,
      isDeclarationName,
      loaderDiagnostic
    })
    const neutralModuleProperties = ['builtinModules', 'isBuiltin']
    const safeModuleProperties = [
      'default',
      'createRequire',
      ...neutralModuleProperties
    ]
    // These Node globals are not module-acquisition capabilities. Unknown
    // globals, eval and Function remain outside the verified grammar.
    const safeGlobalProperties = new Set([
      'process',
      'require',
      'console',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'crypto',
      'fetch',
      'Headers',
      'Request',
      'Response',
      'AbortController',
      'AbortSignal',
      'URL',
      'URLSearchParams',
      'TextEncoder',
      'TextDecoder',
      'performance',
      'structuredClone',
      'Buffer',
      'atob',
      'btoa'
    ])
    const unsafeBindingProperty = (base, name) =>
      (isModuleNamespace(base) &&
        ![...safeModuleProperties, 'require'].includes(name)) ||
      (isHost(base) &&
        !['require', 'exports', 'id', 'filename', 'loaded', 'paths'].includes(
          name
        )) ||
      (isLoader(base) && name !== 'resolve') ||
      ((isFactory(base) ||
        isBuiltinGetter(base) ||
        isResolver(base) ||
        isImportResolver(base)) &&
        !['name', 'length'].includes(name)) ||
      (isMeta(base) &&
        !['url', 'filename', 'dirname', 'resolve', 'main'].includes(name)) ||
      (isGlobal(base) && !safeGlobalProperties.has(name)) ||
      (isProcess(base) &&
        ['dlopen', 'binding', '_linkedBinding'].includes(name))
    for (const node of runtimeNodes) {
      if (!ts.isVariableDeclaration(node) || !node.initializer) continue
      if (
        ts.isArrayBindingPattern(node.name) &&
        hasCapability(node.initializer)
      )
        loaderDiagnostic(node, 'UNVERIFIED_MODULE_LOADER_BINDING')
      walkBinding(node.name, node.initializer, (item, base, selected) => {
        if (!hasCapability(base)) return
        if (
          !selected ||
          item.initializer ||
          ts.isArrayBindingPattern(item.name) ||
          unsafeBindingProperty(base, bindingProperty(item))
        )
          loaderDiagnostic(item, 'UNVERIFIED_MODULE_LOADER_BINDING')
        if (selected && isHost(selected))
          loaderDiagnostic(item, 'UNVERIFIED_MAIN_MODULE_BASE')
      })
    }
    for (const node of runtimeNodes) {
      if (
        (isHost(node) && !ts.isIdentifier(node)) ||
        (ts.isVariableDeclaration(node) &&
          ts.isObjectBindingPattern(node.name) &&
          isProcess(node.initializer) &&
          node.name.elements.some(
            (item) => bindingProperty(item) === 'mainModule'
          )) ||
        (ts.isImportSpecifier(node) &&
          !node.isTypeOnly &&
          !typeOnly(node.parent.parent.parent) &&
          (node.propertyName?.text ?? node.name.text) === 'mainModule' &&
          ['process', 'node:process'].includes(
            literal(node.parent?.parent?.parent?.moduleSpecifier)
          ))
      )
        // mainModule.require is anchored to the process entry, which need not
        // be the inspected file. Until that entry is known, refuse a green gate.
        loaderDiagnostic(node, 'UNVERIFIED_MAIN_MODULE_BASE')
      if (ts.isCallExpression(node) && isBuiltinGetter(node.expression)) {
        if (
          node.arguments.length !== 1 ||
          !isBuiltin(literal(node.arguments[0]))
        )
          loaderDiagnostic(node, 'UNVERIFIED_BUILTIN_MODULE_TARGET')
      }
      if (
        (ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node)) &&
        (isProcess(node.expression) ||
          isGlobal(node.expression) ||
          isMeta(node.expression)) &&
        property(node) === undefined
      )
        loaderDiagnostic(node, 'UNVERIFIED_PROCESS_CAPABILITY_PROPERTY')
      if (
        !ts.isImportDeclaration(node) ||
        typeOnly(node) ||
        !['module', 'node:module'].includes(literal(node.moduleSpecifier))
      )
        continue
      const bindings = node.importClause?.namedBindings
      if (bindings && ts.isNamedImports(bindings))
        for (const item of bindings.elements)
          if (
            !item.isTypeOnly &&
            !safeModuleProperties.includes(
              item.propertyName?.text ?? item.name.text
            )
          )
            loaderDiagnostic(item, 'UNVERIFIED_MODULE_LOADER_PRIMITIVE')
    }
    for (const node of runtimeNodes) {
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        ['module', 'node:module', 'process', 'node:process'].includes(
          literal(node.arguments[0])
        )
      )
        loaderDiagnostic(node, 'UNVERIFIED_DYNAMIC_MODULE_NAMESPACE')
      if (
        ts.isCallExpression(node) &&
        (isModuleNamespace(node) || isProcess(node))
      ) {
        const parent = node.parent
        if (
          parent &&
          ts.isVariableDeclaration(parent) &&
          parent.initializer === node &&
          !parent.parent?.parent?.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.ExportKeyword
          )
        ) {
          if (ts.isObjectBindingPattern(parent.name) && isModuleNamespace(node))
            for (const item of parent.name.elements)
              if (!safeModuleProperties.includes(bindingProperty(item)))
                loaderDiagnostic(item, 'UNVERIFIED_MODULE_LOADER_PRIMITIVE')
        } else if (
          parent &&
          (ts.isPropertyAccessExpression(parent) ||
            ts.isElementAccessExpression(parent)) &&
          parent.expression === node &&
          (isProcess(node)
            ? property(parent) !== undefined
            : safeModuleProperties.includes(property(parent)))
        ) {
          // A known property is inspected by the loader/factory visitor.
        } else loaderDiagnostic(node, 'UNVERIFIED_MODULE_LOADER_ESCAPE')
      }
      if (
        ts.isExportDeclaration(node) &&
        !typeOnly(node) &&
        ['module', 'node:module'].includes(literal(node.moduleSpecifier)) &&
        (!node.exportClause ||
          !ts.isNamedExports(node.exportClause) ||
          node.exportClause.elements.some(
            (item) =>
              !item.isTypeOnly &&
              !neutralModuleProperties.includes(
                item.propertyName?.text ?? item.name.text
              )
          ))
      )
        loaderDiagnostic(node, 'UNVERIFIED_MODULE_LOADER_EXPORT')
      if (
        ts.isExportDeclaration(node) &&
        !typeOnly(node) &&
        ['process', 'node:process'].includes(literal(node.moduleSpecifier)) &&
        (!node.exportClause ||
          !ts.isNamedExports(node.exportClause) ||
          node.exportClause.elements.some(
            (item) =>
              !item.isTypeOnly &&
              ['getBuiltinModule', 'mainModule', 'default'].includes(
                item.propertyName?.text ?? item.name.text
              )
          ))
      )
        loaderDiagnostic(node, 'UNVERIFIED_PROCESS_CAPABILITY_EXPORT')
      if (ts.isCallExpression(node) && isFactory(node.expression)) {
        const base = unwrap(node.arguments[0])
        if (
          !(
            base &&
            ((base.getText(source) === 'import.meta.url' && !metaUrlRebound) ||
              (ts.isIdentifier(base) &&
                identity(base) === global('__filename') &&
                !filenameRebound))
          )
        )
          loaderDiagnostic(node, 'UNVERIFIED_MODULE_LOADER_BASE')
        let value = node
        while (
          value.parent &&
          (ts.isParenthesizedExpression(value.parent) ||
            ts.isAsExpression(value.parent) ||
            ts.isSatisfiesExpression(value.parent) ||
            ts.isNonNullExpression(value.parent))
        )
          value = value.parent
        const parent = value.parent
        const localBinding =
          parent &&
          ts.isVariableDeclaration(parent) &&
          parent.initializer === value &&
          ts.isIdentifier(parent.name) &&
          !parent.parent?.parent?.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.ExportKeyword
          )
        const localAssignment =
          parent &&
          ts.isBinaryExpression(parent) &&
          parent.right === value &&
          parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(parent.left)
        const immediateCall =
          parent && ts.isCallExpression(parent) && parent.expression === value
        const resolveCall =
          parent &&
          (ts.isPropertyAccessExpression(parent) ||
            ts.isElementAccessExpression(parent)) &&
          parent.expression === value &&
          property(parent) === 'resolve'
        if (!localBinding && !localAssignment && !immediateCall && !resolveCall)
          loaderDiagnostic(node, 'UNVERIFIED_MODULE_LOADER_ESCAPE')
      }
      if (
        !(
          ts.isIdentifier(node) ||
          ts.isPropertyAccessExpression(node) ||
          ts.isElementAccessExpression(node) ||
          ts.isMetaProperty(node)
        )
      )
        continue
      if (
        !isFactory(node) &&
        !isLoader(node) &&
        !isModuleNamespace(node) &&
        !isHost(node) &&
        !isResolver(node) &&
        !isBuiltinGetter(node) &&
        !isImportResolver(node) &&
        !isProcess(node) &&
        !isGlobal(node) &&
        !isMeta(node)
      )
        continue
      if (isDeclarationName(node)) continue
      const parent = node.parent
      // A property's spelling is not a variable reference. The whole expression
      // is classified independently, including namespace/computed factory access.
      if (
        parent &&
        (ts.isPropertyAccessExpression(parent) || ts.isMetaProperty(parent)) &&
        parent.name === node
      )
        continue
      if (
        parent &&
        (ts.isPropertyAccessExpression(parent) ||
          ts.isElementAccessExpression(parent)) &&
        parent.expression === node &&
        (isModuleNamespace(node) ||
          isHost(node) ||
          isProcess(node) ||
          isGlobal(node) ||
          isMeta(node) ||
          property(parent) === 'resolve')
      ) {
        if (
          (isModuleNamespace(node) ||
            isHost(node) ||
            isGlobal(node) ||
            isMeta(node)) &&
          property(parent) === undefined
        )
          loaderDiagnostic(parent, 'UNVERIFIED_MODULE_LOADER_PROPERTY')
        else if (
          (isMeta(node) &&
            !['url', 'filename', 'dirname', 'resolve', 'main'].includes(
              property(parent)
            )) ||
          (isGlobal(node) &&
            !safeGlobalProperties.has(property(parent)) &&
            !scalarMetadata(parent.parent))
        )
          loaderDiagnostic(parent, 'UNVERIFIED_MODULE_LOADER_PROPERTY')
        else if (
          isProcess(node) &&
          ['dlopen', 'binding', '_linkedBinding'].includes(property(parent))
        )
          loaderDiagnostic(parent, 'UNVERIFIED_PROCESS_LOADER_PRIMITIVE')
        else if (
          isModuleNamespace(node) &&
          ![...safeModuleProperties, 'require'].includes(property(parent))
        )
          loaderDiagnostic(parent, 'UNVERIFIED_MODULE_LOADER_PRIMITIVE')
        else if (
          isHost(node) &&
          !['require', 'exports', 'id', 'filename', 'loaded', 'paths'].includes(
            property(parent)
          )
        )
          loaderDiagnostic(parent, 'UNVERIFIED_MODULE_LOADER_PRIMITIVE')
        continue
      }
      if (
        parent &&
        ts.isVariableDeclaration(parent) &&
        parent.initializer === node &&
        ts.isObjectBindingPattern(parent.name) &&
        (isModuleNamespace(node) ||
          isHost(node) ||
          isProcess(node) ||
          isLoader(node) ||
          isGlobal(node) ||
          isMeta(node))
      ) {
        for (const item of parent.name.elements) {
          const name = bindingProperty(item)
          if (
            item.dotDotDotToken ||
            bindingProperty(item) === undefined ||
            (isModuleNamespace(node) &&
              ![...safeModuleProperties, 'require'].includes(name)) ||
            (isHost(node) &&
              ![
                'require',
                'exports',
                'id',
                'filename',
                'loaded',
                'paths'
              ].includes(name)) ||
            (isLoader(node) && name !== 'resolve') ||
            (isMeta(node) &&
              !['url', 'filename', 'dirname', 'resolve', 'main'].includes(
                name
              )) ||
            (isGlobal(node) && !['process', 'require'].includes(name)) ||
            (isProcess(node) &&
              ['dlopen', 'binding', '_linkedBinding'].includes(name))
          )
            loaderDiagnostic(item, 'UNVERIFIED_MODULE_LOADER_PROPERTY')
        }
        continue
      }
      if (parent && ts.isCallExpression(parent) && parent.expression === node)
        continue
      if (
        parent &&
        ts.isVariableDeclaration(parent) &&
        parent.initializer === node &&
        ts.isIdentifier(parent.name)
      ) {
        const statement = parent.parent?.parent
        if (
          !statement?.modifiers?.some(
            (m) => m.kind === ts.SyntaxKind.ExportKeyword
          )
        )
          continue
      }
      if (
        parent &&
        ts.isBinaryExpression(parent) &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(parent.left)
      )
        continue
      loaderDiagnostic(node, 'UNVERIFIED_MODULE_LOADER_ESCAPE')
    }
    for (const directive of source.referencedFiles)
      reference(
        file,
        source,
        directive.fileName.startsWith('.')
          ? directive.fileName
          : `./${directive.fileName}`
      )
    for (const directive of source.typeReferenceDirectives)
      reference(file, source, directive.fileName, true)
    const importMode =
      ts.getImpliedNodeFormatForFile(
        file,
        undefined,
        ts.sys,
        compilerOptions
      ) === ts.ModuleKind.CommonJS
        ? 'require'
        : 'import'
    const visit = (node) => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier
      )
        reference(
          file,
          node,
          literal(node.moduleSpecifier),
          false,
          typeOnly(node) ? 'types' : importMode
        )
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        reference(
          file,
          node,
          literal(node.moduleReference.expression),
          false,
          typeOnly(node) ? 'types' : 'require'
        )
      if (ts.isImportTypeNode(node))
        reference(
          file,
          node,
          ts.isLiteralTypeNode(node.argument)
            ? literal(node.argument.literal)
            : undefined
        )
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          isLoader(node.expression) ||
          isResolver(node.expression) ||
          isImportResolver(node.expression))
      ) {
        if (
          (isResolver(node.expression) || isImportResolver(node.expression)) &&
          node.arguments.length !== 1
        )
          loaderDiagnostic(node, 'UNVERIFIED_MODULE_RESOLVER_OPTIONS')
        reference(
          file,
          node,
          literal(node.arguments[0]),
          false,
          node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            isImportResolver(node.expression)
            ? 'import'
            : 'require'
        )
      }
      if (
        (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) &&
        node.text.startsWith('SHIFT_')
      ) {
        if (!consumerEnvReferences.has(file))
          consumerEnvReferences.set(file, [])
        consumerEnvReferences.get(file).push({
          file: path.relative(root, file),
          reason: 'CONSUMER_ENV_IN_CORE'
        })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  const violations = []
  const starts = [
    ...coreFiles,
    ...[...workspaces.values()]
      .filter(
        (item) =>
          inside(path.join(root, 'packages'), item.workspace) ||
          inside(path.join(root, 'apps'), item.workspace)
      )
      .map(workspaceNode)
  ]
  // Multi-source traversal reports a witness path for every reachable product.
  const seen = new Set(starts)
  const queue = starts.map((file) => ({ file, trail: [file] }))
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]
    for (const target of graph.get(current.file) ?? []) {
      if (inside(productRoot, target)) {
        violations.push({
          reason: 'CORE_DEPENDS_ON_PRODUCT',
          trail: [...current.trail, target].map((file) =>
            path.relative(root, file)
          )
        })
      } else if (!seen.has(target)) {
        seen.add(target)
        queue.push({ file: target, trail: [...current.trail, target] })
      }
    }
  }
  for (let index = diagnostics.length - 1; index >= 0; index--) {
    const origin = diagnosticSources.get(diagnostics[index])
    if (origin && !seen.has(origin)) diagnostics.splice(index, 1)
  }
  for (const [file, references] of consumerEnvReferences)
    if (seen.has(file)) diagnostics.push(...references)
  // SPEC0228 keeps the legacy catalog as historical inventory only. Pins and
  // expression matches do not prove receiver identity, so no diagnostic may be
  // removed by this catalog, including when a legacy caller requests it.
  const exceptions = []
  const pinState = new Map()
  const pinsHold = (pins) =>
    Object.entries(pins).every(([file, digest]) => {
      if (!pinState.has(file)) {
        const target = path.join(root, file)
        pinState.set(
          file,
          fs.existsSync(target) &&
            fs.lstatSync(target).isFile() &&
            fs.realpathSync(target) === target
            ? createHash('sha256').update(fs.readFileSync(target)).digest('hex')
            : null
        )
      }
      return pinState.get(file) === digest
    })
  const unusedExceptions = [...exceptionSites]
    .filter(([key]) => fs.existsSync(path.join(root, JSON.parse(key)[1])))
    .map(([key, { id, max, pins }]) => {
      const [reason, file, line, expression] = JSON.parse(key)
      return {
        exception: id,
        reason,
        file,
        line,
        expression,
        unused: max,
        pinsHold: pinsHold(pins)
      }
    })
  // Known product identity in reached code is a failure, not an unknown.
  const failing = new Set([
    'CONSUMER_ENV_IN_CORE',
    'INSTALLED_PACKAGE_REFERENCES_PRODUCT'
  ])
  const status =
    violations.length > 0 ||
    diagnostics.some(({ reason }) => failing.has(reason))
      ? 'FAIL'
      : diagnostics.length > 0
        ? 'INCOMPLETE'
        : 'PASS'
  const coreInstalled = [...installedNodes.values()].filter((node) =>
    seen.has(node)
  )
  // Revalidate the actual bytes and recipe inputs after all scanning. The
  // comparator invalidates the same verdict objects stored in this report.
  const identityFinalization = installedPackages.finalize()
  const result = {
    sourceFiles: sourceFiles.length,
    coreFiles: coreFiles.length,
    workspaceCount: workspaces.size,
    installedPackageCount: coreInstalled.length,
    edgeCount: [...graph.values()].reduce((sum, set) => sum + set.size, 0),
    violations,
    diagnostics,
    exceptionsApplied: false,
    exceptions,
    unusedExceptions,
    // Informational: lock-verified installed packages whose on-disk version
    // differs from the committed lockfile (a stale install). Not a boundary
    // path; `npm ci` realigns the tree.
    installedLockDrift: coreInstalled
      .filter((node) => installedDrift.has(node))
      .map((node) => installedDrift.get(node)),
    status,
    passed: status === 'PASS'
  }
  if (installedReference && !includeGraph)
    result.installedContentIdentity = coreInstalled.map((node) => ({
      node: path.relative(root, node),
      verified: false,
      contentIdentity: installedVerdicts.get(node)?.contentIdentity ?? {
        status: 'UNAVAILABLE',
        reasons: ['INVALID_INSTALLED_PATH']
      }
    }))
  if (includeGraph) {
    // Resolved core closure: every node reachable from the core starts, its
    // outgoing edges (including those that end in a product witness) and the
    // verification verdict of each installed terminal node.
    const relative = (file) => path.relative(root, file)
    result.graph = {
      starts: starts.map(relative),
      nodes: [...seen].map(relative).sort(),
      edges: [...seen]
        .flatMap((from) =>
          [...(graph.get(from) ?? [])].map((to) => [
            relative(from),
            relative(to)
          ])
        )
        .sort(),
      installed: coreInstalled
        .map((node) => {
          const verdict = installedVerdicts.get(node)
          return {
            node: relative(node),
            verified: verdict?.verified ?? false,
            source: verdict?.source ?? null,
            reason: verdict?.reason ?? null,
            ...(verdict?.contentIdentity
              ? { contentIdentity: verdict.contentIdentity }
              : {})
          }
        })
        .sort((a, b) => a.node.localeCompare(b.node))
    }
  }
  if (semantic) {
    const baseline = [...diagnostics]
    const origins = baseline.map((diagnostic) => {
      if (diagnosticOrigins.has(diagnostic))
        return diagnosticOrigins.get(diagnostic)
      const filename =
        diagnosticSources.get(diagnostic) ??
        diagnostic.file.replace(/:\d+$/, '')
      return captureOrigin(filename, diagnostic)
    })
    const astOrigins = origins.filter(
      (origin) =>
        Number.isSafeInteger(origin.start) &&
        Number.isSafeInteger(origin.end) &&
        origin.fileSha256
    )
    const compiledModule = require('./boundary-semantic-compiled.mjs')
    const compiled = compiledBuildReference
      ? compiledModule.loadCompiledBuildReference(
          root,
          compiledBuildReference,
          { installedReference }
        )
      : {
          status: 'UNAVAILABLE',
          reason: 'COMPILED_REFERENCE_REQUIRED',
          files: []
        }
    // SPEC0241 D2: a MATCH package also carries its 0234 reference inventory
    // and digest, which the comparator already bound to the validated receipt.
    // The engine recomputes the digest; nothing else becomes authority.
    const semanticInstalled = () =>
      coreInstalled.map((node) => {
        const identity = installedVerdicts.get(node)?.contentIdentity
        const reference =
          identity?.status === 'MATCH' ? identity.inventory?.reference : null
        return {
          key: path.relative(root, path.dirname(node)),
          manifest: path.relative(root, node),
          identityStatus: identity?.status ?? 'UNAVAILABLE',
          referenceDigest: identity?.referenceDigest ?? null,
          inventorySha256: reference?.inventorySha256 ?? null,
          inventory: reference
            ? {
                entries: reference.entries,
                nestedPackages: reference.nestedPackages,
                usage: reference.usage
              }
            : null
        }
      })
    const installed = semanticInstalled()
    const unsupportedProfile =
      Boolean(process.env.NODE_OPTIONS) ||
      process.execArgv.some((arg) =>
        /^(?:--(?:conditions|require|import|loader|experimental-loader)(?:=|$)|-r$|-C(?:=|$))/.test(
          arg
        )
      )
    let output = unsupportedProfile
      ? {
          schemaVersion: 1,
          kernelVersion: semanticEngine.SEMANTIC_KERNEL_VERSION,
          status: 'UNKNOWN',
          proofs: [],
          installed: [],
          inputs: [],
          violations: [],
          unknowns: [
            { file: 'package.json', reason: 'UNKNOWN_RUNTIME_PROFILE' }
          ],
          validation: { valid: false },
          phases: null,
          bodyCoverage: null,
          installedFileIdentity: null
        }
      : semanticEngine.runSemanticBoundary({
          root,
          starts: [...seen]
            .filter(
              (file) =>
                extensions.has(path.extname(file)) &&
                !file.split(path.sep).includes('node_modules')
            )
            .map((file) => path.relative(root, file))
            .sort(),
          origins: astOrigins,
          installed,
          compiled
        })
    const finalIdentity = installedPackages.finalize()
    let valid =
      output.validation?.valid === true &&
      identityFinalization?.status === 'COMPLETE' &&
      finalIdentity?.status === 'COMPLETE'
    // The before/after comparison covers the inventory fields too (§3.4).
    if (
      semanticEngine.semanticCanonicalJson(installed) !==
      semanticEngine.semanticCanonicalJson(semanticInstalled())
    )
      valid = false
    try {
      if (!semanticEngine.revalidateSemanticInputs(root, output, astOrigins))
        valid = false
      if (compiledBuildReference) {
        const after = compiledModule.loadCompiledBuildReference(
          root,
          compiledBuildReference,
          { installedReference }
        )
        if (
          semanticEngine.semanticCanonicalJson(after) !==
          semanticEngine.semanticCanonicalJson(compiled)
        )
          valid = false
      }
    } catch {
      valid = false
    }
    if (
      !installedReference ||
      identityFinalization?.status !== 'COMPLETE' ||
      finalIdentity?.status !== 'COMPLETE'
    ) {
      valid = false
      output.unknowns.push({
        file: 'package.json',
        reason: 'UNKNOWN_INSTALLED_REFERENCE'
      })
    }
    if (compiledBuildReference && compiled.status !== 'PROVEN')
      output.unknowns.push({
        file: 'packages/contracts/dist/canonical-json.js',
        reason: 'UNKNOWN_COMPILED_PROVENANCE',
        detail: compiled.reason
      })
    if (!valid && output.validation?.valid) {
      output = {
        ...output,
        status: 'UNKNOWN',
        proofs: [],
        installed: [],
        unknowns: [
          ...output.unknowns,
          { file: 'package.json', reason: 'UNKNOWN_INPUT_REVALIDATION' }
        ],
        validation: { valid: false }
      }
    }
    const proofById = new Map(
      (valid ? output.proofs : []).map((proof) => [proof.id, proof])
    )
    const proofByOrigin = new Map()
    for (const proof of proofById.values()) {
      if (!proof.originId || proof.status !== 'PROVEN') continue
      const origin = origins.find((item) => item.id === proof.originId)
      if (
        !origin ||
        proofByOrigin.has(origin.id) ||
        proof.file !== origin.file ||
        proof.fileSha256 !== origin.fileSha256 ||
        proof.kind !== origin.kind ||
        proof.start !== origin.start ||
        proof.end !== origin.end ||
        proof.ordinal !== origin.ordinal
      ) {
        valid = false
        break
      }
      proofByOrigin.set(origin.id, proof)
    }
    if (!valid) {
      proofByOrigin.clear()
      proofById.clear()
      output = {
        ...output,
        status: output.violations?.length ? 'VIOLATION' : 'UNKNOWN',
        proofs: [],
        installed: (output.installed ?? []).map((item) => ({
          ...item,
          status: 'UNKNOWN',
          proofIds: []
        })),
        validation: { valid: false },
        unknowns: output.unknowns?.length
          ? output.unknowns
          : [{ file: 'package.json', reason: 'UNKNOWN_HOST_VALIDATION' }]
      }
    }
    const closedInstalled = new Map(
      (valid ? output.installed : [])
        .filter(
          (item) =>
            item.status === 'PROVEN' &&
            item.proofIds?.length &&
            item.proofIds.every((id) => proofById.get(id)?.status === 'PROVEN')
        )
        .map((item) => [item.key, item])
    )
    const resolvedDiagnostics = []
    const unresolvedOrigins = []
    diagnostics.splice(0, diagnostics.length)
    for (let index = 0; index < baseline.length; index++) {
      const diagnostic = baseline[index],
        origin = origins[index]
      let proof = proofByOrigin.get(origin.id)
      if (diagnostic.reason === 'UNVERIFIED_INSTALLED_PACKAGE') {
        const node = path.resolve(root, diagnostic.file),
          key = path.relative(root, path.dirname(node)),
          verdict = installedVerdicts.get(node),
          closed = closedInstalled.get(key)
        if (
          closed &&
          verdict?.reason === 'UNVERIFIED_INSTALLED_CONTENT' &&
          verdict.contentIdentity?.status === 'MATCH'
        ) {
          verdict.verified = true
          verdict.source = semanticEngine.SEMANTIC_KERNEL_VERSION
          verdict.reason = 'VERIFIED_INSTALLED_SEMANTIC_BOUNDARY'
          proof = { id: closed.proofIds[0], proofIds: closed.proofIds }
        }
      }
      if (proof)
        resolvedDiagnostics.push({
          diagnostic: { ...diagnostic },
          originId: origin.id,
          proofId: proof.id,
          ...(proof.proofIds ? { proofIds: proof.proofIds } : {})
        })
      else {
        diagnostics.push(diagnostic)
        unresolvedOrigins.push(origin.id)
      }
    }
    const priorNewCount = diagnostics.length
    const frontierOrigins = []
    const emitFrontier = (unknown, pointer) => {
      const file = unknown.file || 'package.json'
      let physicalFileKnown = false
      try {
        const target = path.resolve(root, file)
        physicalFileKnown =
          Boolean(unknown.file) &&
          inside(root, target) &&
          fs.realpathSync(target) === target &&
          fs.lstatSync(target).isFile()
      } catch {
        /* Missing/aliased physical provenance remains null, never invented. */
      }
      const diagnostic = {
        file,
        reason: 'UNVERIFIED_SEMANTIC_FRONTIER',
        detail: unknown.reason,
        semanticDetail: unknown.detail ?? null,
        ...(unknown.originId ? { causalOriginId: unknown.originId } : {})
      }
      reportDiagnostic(file, diagnostic, {
        context: 'semantic-frontier',
        physicalFileKnown,
        semanticPointer: {
          path: pointer,
          reportedFile: unknown.file || null,
          reason: unknown.reason,
          detail: unknown.detail ?? null,
          causalOriginId: unknown.originId ?? null
        }
      })
      const origin = diagnosticOrigins.get(diagnostic)
      diagnostic.originId = origin.id
      frontierOrigins.push(origin)
    }
    for (const [index, unknown] of (output.unknowns ?? []).entries())
      emitFrontier(unknown, '#/semanticBoundary/unknowns/' + index)
    if (
      output.status !== 'PROVEN' &&
      !output.unknowns?.length &&
      !output.violations?.length
    )
      emitFrontier(
        { file: '', reason: 'UNKNOWN_INCOMPLETE_RESULT' },
        '#/semanticBoundary/status'
      )
    for (const violation of output.violations ?? [])
      violations.push({
        ...violation,
        reason: 'CORE_DEPENDS_ON_PRODUCT',
        source: semanticEngine.SEMANTIC_KERNEL_VERSION
      })
    if (
      resolvedDiagnostics.length + unresolvedOrigins.length !==
        baseline.length ||
      new Set(origins.map((item) => item.id)).size !== baseline.length
    )
      throw new Error('semantic_occurrence_partition_invalid')
    const newOriginIds = frontierOrigins.map((origin) => origin.id)
    const baselineIds = new Set(origins.map((origin) => origin.id))
    if (
      new Set(newOriginIds).size !== diagnostics.length - priorNewCount ||
      newOriginIds.some((id) => baselineIds.has(id))
    )
      throw new Error('semantic_frontier_origin_partition_invalid')
    const { telemetry, ...semanticBody } = output
    result.resolvedDiagnostics = resolvedDiagnostics
    result.semanticBoundary = {
      ...semanticBody,
      compiledProvenance: compiled,
      origins,
      frontierOrigins,
      occurrences: {
        baseline: baseline.length,
        resolved: resolvedDiagnostics.length,
        unresolved: unresolvedOrigins.length,
        new: diagnostics.length - priorNewCount,
        newOriginIds,
        unresolvedOrigins
      }
    }
    if (telemetry) result.semanticTelemetry = telemetry
    for (const row of result.graph?.installed ?? []) {
      const verdict = installedVerdicts.get(path.resolve(root, row.node))
      row.verified = verdict?.verified ?? false
      row.source = verdict?.source ?? null
      row.reason = verdict?.reason ?? null
    }
    for (const row of result.installedContentIdentity ?? [])
      row.verified =
        installedVerdicts.get(path.resolve(root, row.node))?.verified ?? false
    result.status =
      violations.length || diagnostics.some(({ reason }) => failing.has(reason))
        ? 'FAIL'
        : diagnostics.length
          ? 'INCOMPLETE'
          : 'PASS'
    result.passed = result.status === 'PASS'
  }
  return result
}

// Reviewed first-party capability exceptions. HISO-005 allows exceptions only
// with a restricted target and a justification. A site accepts at most `max`
// diagnostics that match all of: the reason, the file, the whitespace-
// normalized text of the line where the flagged expression starts, and the
// digest of the complete flagged expression; and only while every file pinned
// by its group is byte-identical. Any other file, reason, line, expression,
// one occurrence more or a changed pin stays a blocking diagnostic. Only the
// per-file capability analyses can be excepted: product edges, SHIFT_* reads,
// unresolved modules and installed-package findings never can.
//
// Residual risk accepted per site: the binding covers the flagged expression,
// not every identity it uses (for example a rebinding of `vi` elsewhere in the
// same file). The accepted set is printed with each result and `--strict`
// disables the table. The list was authored by the B1 change (PLAN0374) after
// inspecting every site; it is subject to the independent re-audit and is not
// an acceptance of HISO-005.
const capabilityExceptions = [
  {
    id: 'pare100-attested-parser-identity',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'SPEC0214 reviewed private provenance check reads only own safeParse data descriptors and compares function identity against captured validators; does not invoke getters/evaluate strings/import modules. Exact source plus mirror/composition pins; arbitrary host JS remains trusted.',
    pins: {
      'packages/platform/src/plugin-execution-core.ts':
        'a8ba50db2512c1a7f48f485143318c61a2583c9d956cfa529fce35e1a3caca03',
      'packages/platform/dist/plugin-execution-core.js':
        'b224ddd5033dd084cf9360e476a3fe7098faa10f7e19b53a615ab11304b7886d',
      'packages/platform/src/controlled-plugins.ts':
        '88689ff935108d6a0ba253dc35093f544bfb58768c3d60637eec1172ead70879',
      'packages/platform/src/plugin-gateway.ts':
        '8e764f8fb7bc4ff341896df1088ed795021ad10b675af1e87a459b395acc9280',
      'packages/platform/src/tool-invocation-boundary.ts':
        'c2c683ce2b3083afc6443c38b35aff131de6ee59e76a34f81ad2bdd04ab6992e',
      'packages/platform/src/controlled-kernel-adapters.ts':
        'd532a2d68a1b1001b0fed86837cac6f47382a3d8b732e7e7e79ca19c6ce75845',
      'packages/platform/src/controlled-kernel-execution.ts':
        'e42590c241e4da6d85b07fe353da153b4ac2e17d462219cbd6095a5b9448153b',
      'packages/platform/src/index.ts':
        '1268e8167372327a9b1bb856ec7b853e58d418cb5ce990eb38fed9be2d254029'
    },
    sites: {
      'packages/platform/src/plugin-execution-core.ts': {
        "Object.getOwnPropertyDescriptor(a.input, 'safeParse')?.value ===": {
          f0cac39d5544623a: 1
        },
        "Object.getOwnPropertyDescriptor(a.output, 'safeParse')?.value ===": {
          '33f70806644ca7b2': 1
        }
      },
      'packages/platform/dist/plugin-execution-core.js': {
        "Object.getOwnPropertyDescriptor(a.input, 'safeParse')?.value ===": {
          f0cac39d5544623a: 1
        },
        "Object.getOwnPropertyDescriptor(a.output, 'safeParse')?.value ===": {
          '33f70806644ca7b2': 1
        }
      }
    }
  },
  {
    id: 'pare100-sandbox-probe-compiled',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'Exact compiled mirror of existing pinned PDSH-011 probe. Fixed bwrap argv, no shell; exception attests only reviewed probe, not arbitrary guest/platform capability.',
    pins: {
      'packages/sandbox/src/capabilities.ts':
        '6d65214b7c2c641603aec5aa336b3a050efd5c2ba9917d142407f3c019c3d6f5',
      'packages/sandbox/dist/capabilities.js':
        '5b5b62f5630c1f35fecca17ff01aac386806d17aac27d94525a39221544dd32c'
    },
    sites: {
      'packages/sandbox/dist/capabilities.js': {
        "execFileSync('bwrap', ['--ro-bind', '/', '/', '--unshare-net', '/bin/true'], { stdio: 'ignore', timeout: 5000 });":
          {
            '0d29dd41e010b63d': 1
          }
      }
    }
  },
  {
    id: 'pare100-contained-runner-compiled',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'Exact compiled mirror of existing pinned PDSH-011 contained runner. spawn argv, child stream/exit/timeout/stdin lifecycle under existing grants; bwrapPath is trusted host composition. No assertion of universal OS containment or authorization for real effects.',
    pins: {
      'packages/sandbox/src/run.ts':
        'a5fa08026af97e2c809445f5949799f3e70b1f833da542142cb28d14f078e933',
      'packages/sandbox/dist/run.js':
        'df6716b96dbeef7ae3a75d2def34e389cf8c3ba127a098ed2dffb96fd35070a9'
    },
    sites: {
      'packages/sandbox/dist/run.js': {
        "const child = spawn(request.bwrapPath ?? 'bwrap', bwrapArgs, {": {
          fdc5cd232a6b322b: 1
        },
        "child.kill('SIGKILL');": {
          '5c689333c261579d': 1
        },
        "child.stdout.on('data', (chunk) => drain('stdout', chunk));": {
          '2d81e05f58c53e18': 1
        },
        "child.stderr.on('data', (chunk) => drain('stderr', chunk));": {
          '6d6d1e16402de7ff': 1
        },
        "child.on('error', () => {": {
          '89ea22717a6b2867': 1
        },
        "child.on('close', (code) => {": {
          d59b602a312f5180: 1
        },
        'child.stdin.end(request.stdin);': {
          e1751db744e7920e: 1
        },
        'child.stdin.end();': {
          dc7602b66365a6bb: 1
        }
      }
    }
  },
  {
    id: 'pare100-sdk-owned-test-child',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'SPEC0215 explicit user-reviewed fixed synthetic SDK child ownership/lifecycle; trusted Node/tsx/local dependencies, enumerated environment/private HOME; exact complete expressions, occurrence limits and whole composition pins. No arbitrary-program containment claim.',
    pins: {
      'packages/sdk/src/__tests__/stdio.test.ts':
        '8d4ca5a2de91368ed8ea727a471c40250561d56254fea675f1bf506a9da10c2b',
      'examples/consumers/sdk-stdio/index.mts':
        '4c7e638a01409b2ae3a597b0ae2c890049877dbb40aa206fd1f7059e820f3bef',
      'examples/consumers/sdk-stdio/child.mts':
        '5f0754505c3499e52c367b1c773b0402f2accdf3fa958caf3d8dc91ef405512e',
      'packages/sdk/src/stdio.ts':
        '51ce4cbdb864ebe8004324bb7df75beab64d3b5a67920c2d2d4bac96e317a741',
      'packages/sdk/src/validators.ts':
        'd038763873888ffbc3119b0cb7b9d3260b0c4674419b58c94beec6c6a7e48391',
      'packages/sdk/src/client.ts':
        'f3009b670111a072415c1fe744da298ef89dd061c79070ceadde2c5f5473e7fe',
      'packages/sdk/src/server.ts':
        'a660bf8e2cb0141925cdca1b2f478b04b0b6743f9646b963fbb76efb442d7f9d',
      'packages/sdk/src/index.ts':
        '608a9e5fd1b64c35b89be6b7059d302cf6f8b28c07cfc30b8d67d641762121f2',
      'packages/sdk/src/protocol.ts':
        '5a485a669fa917a6514d00fa2fa62a8f86f1b70a7d7a0a9ab025a5ae594595dd',
      'packages/sdk/src/composition.ts':
        '0e4b26d3739ff4eb3c8f26def437795fda0ea5249d7068c52a47603cebffd94a',
      'packages/harness/src/session/events.ts':
        '771fa0692d9712ca0f168f71e15d43b8ba351b0aea003a98014159b3c1710bd2',
      'packages/harness/src/session/memory.ts':
        'cc98336ffc0b8131ccc5e33a36c8861b102e226acea45d29033001339e3647c7',
      'packages/harness/src/session/index.ts':
        'd9544a05b32b5dcb9d1e79a5eda73e50695095a269658fa6bfafb651187d746e',
      'packages/harness/src/index.ts':
        'fff371d91afe0ac7b86b19f82a6deeda9dc07ebbc12eabb0744e460255bb208f'
    },
    sites: {
      'packages/sdk/src/__tests__/stdio.test.ts': {
        'const child = spawn(': {
          '42dbd0dd57d39c28': 1
        },
        'for (const s of [child.stdin, child.stdout, child.stderr])': {
          '0bbca7c676d37570': 1,
          '420dff553f97e6ee': 1,
          '43db0b7bb09f8093': 1
        },
        "child.on('error', () => {})": {
          c1b0eb4f5632c391: 1
        },
        'resources.push(() => shutdownSdkChild(child))': {
          ddc9e669194254ce: 1
        },
        "child.stderr.off('data', ready)": {
          e065d31a1edd8fd0: 1
        },
        "child.off('error', failed)": {
          2116742447296456: 1
        },
        "child.off('close', closed)": {
          '28b860ab50761659': 1
        },
        "child.stderr.once('data', ready)": {
          d40763bde174f1e8: 1
        },
        "child.once('error', failed)": {
          a9a522cc682b5d75: 1
        },
        "child.once('close', closed)": {
          '2045ddd34528e3ca': 1
        },
        "const kill = vi.spyOn(child, 'kill')": {
          ddc9e669194254ce: 1
        },
        'await shutdownSdkChild(child)': {
          ddc9e669194254ce: 1
        },
        "expect(child.signalCode).toBe('SIGKILL')": {
          '4bff52bde459ec30': 1
        },
        'child.stdin.closed,': {
          e2aac9736fa1b739: 1
        },
        'child.stdout.closed,': {
          '318fc17f11ad7419': 1
        },
        'child.stderr.closed': {
          d41b6dfdd11deebb: 1
        },
        "expect(child.listenerCount('close')).toBe(0)": {
          '9eda5f6c4655ab9b': 1
        }
      }
    }
  },
  {
    id: 'pare100-sdk-owned-example-child',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'SPEC0215 explicit user-reviewed fixed synthetic SDK child ownership/lifecycle; trusted Node/tsx/local dependencies, enumerated environment/private HOME; exact complete expressions, occurrence limits and whole composition pins. No arbitrary-program containment claim.',
    pins: {
      'packages/sdk/src/__tests__/stdio.test.ts':
        '8d4ca5a2de91368ed8ea727a471c40250561d56254fea675f1bf506a9da10c2b',
      'examples/consumers/sdk-stdio/index.mts':
        '4c7e638a01409b2ae3a597b0ae2c890049877dbb40aa206fd1f7059e820f3bef',
      'examples/consumers/sdk-stdio/child.mts':
        '5f0754505c3499e52c367b1c773b0402f2accdf3fa958caf3d8dc91ef405512e',
      'packages/sdk/src/stdio.ts':
        '51ce4cbdb864ebe8004324bb7df75beab64d3b5a67920c2d2d4bac96e317a741',
      'packages/sdk/src/validators.ts':
        'd038763873888ffbc3119b0cb7b9d3260b0c4674419b58c94beec6c6a7e48391',
      'packages/sdk/src/client.ts':
        'f3009b670111a072415c1fe744da298ef89dd061c79070ceadde2c5f5473e7fe',
      'packages/sdk/src/server.ts':
        'a660bf8e2cb0141925cdca1b2f478b04b0b6743f9646b963fbb76efb442d7f9d',
      'packages/sdk/src/index.ts':
        '608a9e5fd1b64c35b89be6b7059d302cf6f8b28c07cfc30b8d67d641762121f2',
      'packages/sdk/src/protocol.ts':
        '5a485a669fa917a6514d00fa2fa62a8f86f1b70a7d7a0a9ab025a5ae594595dd',
      'packages/sdk/src/composition.ts':
        '0e4b26d3739ff4eb3c8f26def437795fda0ea5249d7068c52a47603cebffd94a',
      'packages/harness/src/session/events.ts':
        '771fa0692d9712ca0f168f71e15d43b8ba351b0aea003a98014159b3c1710bd2',
      'packages/harness/src/session/memory.ts':
        'cc98336ffc0b8131ccc5e33a36c8861b102e226acea45d29033001339e3647c7',
      'packages/harness/src/session/index.ts':
        'd9544a05b32b5dcb9d1e79a5eda73e50695095a269658fa6bfafb651187d746e',
      'packages/harness/src/index.ts':
        'fff371d91afe0ac7b86b19f82a6deeda9dc07ebbc12eabb0744e460255bb208f'
    },
    sites: {
      'examples/consumers/sdk-stdio/index.mts': {
        'child = spawn(': {
          ddc9e669194254ce: 1,
          e6b8e4633d721034: 1
        },
        "child.on('error', () => {})": {
          c1b0eb4f5632c391: 1
        },
        'for (const stream of [child.stdin, child.stdout, child.stderr])': {
          '0bbca7c676d37570': 1,
          '420dff553f97e6ee': 1,
          '43db0b7bb09f8093': 1
        },
        "child.stderr.on('data', (chunk: Buffer) => {": {
          '10a6f27b760ebc96': 1
        },
        'input: child.stdout,': {
          '420dff553f97e6ee': 1
        },
        'output: child.stdin,': {
          '0bbca7c676d37570': 1
        },
        'if (child) await shutdownSdkChild(child)': {
          ddc9e669194254ce: 2
        },
        'if (!child || child.exitCode !== null || child.signalCode !== null)': {
          ddc9e669194254ce: 1,
          f33249cbc3b0f0ac: 1,
          '4bff52bde459ec30': 1
        }
      }
    }
  },
  {
    id: 'pare100-session-json-compiled-reflection',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'SPEC0215 explicit user-reviewed session JSON reflection mirror; only descriptor/prototype validation, exact source/compiled closure pins.',
    pins: {
      'packages/contracts/src/canonical-json.ts':
        '133301a83cbf3996122cec66dc02b88642f851c89c88419a9a197acd11853b77',
      'packages/contracts/dist/canonical-json.js':
        'e9c2a06def1b72a9b4eb9fb98a03eaf8cf93d742ba68dea6a9c54b5ee26bcc79',
      'packages/harness/src/session/events.ts':
        '771fa0692d9712ca0f168f71e15d43b8ba351b0aea003a98014159b3c1710bd2',
      'packages/harness/dist/session/events.js':
        '2960f0fb9dd3d1cbe989c612b4ccefad886e849c5e75180f0122a26ea6ec8efa'
    },
    sites: {
      'packages/harness/dist/session/events.js': {
        'const descriptors = Object.getOwnPropertyDescriptors(v);': {
          '511cf3cd840c8327': 1
        },
        "if (Object.keys(descriptors).some((key) => key !== 'length' && !/^(0|[1-9]\\d*)$/.test(key)))":
          {
            '12b2fdc0a0ffd6ce': 1
          },
        'const descriptor = descriptors[String(i)];': {
          '12b2fdc0a0ffd6ce': 1
        },
        "if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)":
          {
            '194b520dc30384b3': 2,
            '7e8c064eaa08ddfa': 1
          },
        'visit(descriptor.value, depth + 1);': {
          '7d29e4d19453aa96': 1
        },
        'if (Object.getPrototypeOf(v) !== Object.prototype &&': {
          '99cac9d0d093a87e': 1
        },
        'Object.getPrototypeOf(v) !== null)': {
          '99cac9d0d093a87e': 1
        },
        'for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(v))) {':
          {
            '511cf3cd840c8327': 1
          }
      }
    }
  },

  {
    id: 'pdsh-neutral-canonical-compiled-reflection',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'SPEC0215 explicit user-reviewed compiled mirror; exact source and compiled byte pins, same three reflection occurrences.',
    pins: {
      'packages/contracts/src/canonical-json.ts':
        '133301a83cbf3996122cec66dc02b88642f851c89c88419a9a197acd11853b77',
      'packages/contracts/dist/canonical-json.js':
        'e9c2a06def1b72a9b4eb9fb98a03eaf8cf93d742ba68dea6a9c54b5ee26bcc79',
      'packages/harness/src/session/events.ts':
        '771fa0692d9712ca0f168f71e15d43b8ba351b0aea003a98014159b3c1710bd2',
      'packages/harness/dist/session/events.js':
        '2960f0fb9dd3d1cbe989c612b4ccefad886e849c5e75180f0122a26ea6ec8efa'
    },
    sites: {
      'packages/contracts/dist/canonical-json.js': {
        'const prototype = Object.getPrototypeOf(value);': {
          '5b2efa8c4f1c77a4': 1
        },
        'return prototype === Object.prototype || prototype === null;': {
          b34563e2ebeb7717: 2
        }
      }
    }
  },
  {
    id: 'pdsh-neutral-canonical-reflection',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'Pure canonical JSON serializer moved without semantic changes from shared to neutral contracts. Reflection only distinguishes ordinary/null object prototypes; no code or module is acquired. The new owner source is fully byte-pinned. Reviewed coverage-only v8 hint added by PDSH-031; source bytes re-pinned.',
    pins: {
      'packages/contracts/src/canonical-json.ts':
        '133301a83cbf3996122cec66dc02b88642f851c89c88419a9a197acd11853b77'
    },
    sites: {
      'packages/contracts/src/canonical-json.ts': {
        'const prototype = Object.getPrototypeOf(value)': {
          '5b2efa8c4f1c77a4': 1
        },
        'return prototype === Object.prototype || prototype === null': {
          b34563e2ebeb7717: 2
        }
      }
    }
  },
  {
    id: 'pdsh-session-json-reflection',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'Reviewed session JSON validator reads own property descriptors without evaluating accessors, rejects functions/host objects/cycles and checks only ordinary/null prototypes. Descriptor values are recursively validated as data, never called as code. Full validator file is byte-pinned; product edges remain forbidden. Reviewed v8 coverage hints and one dead-clause simplification added by PDSH-031; file bytes re-pinned.',
    pins: {
      'packages/harness/src/session/events.ts':
        '771fa0692d9712ca0f168f71e15d43b8ba351b0aea003a98014159b3c1710bd2'
    },
    sites: {
      'packages/harness/src/session/events.ts': {
        'const descriptors = Object.getOwnPropertyDescriptors(v)': {
          '511cf3cd840c8327': 1
        },
        'Object.keys(descriptors).some(': { '12b2fdc0a0ffd6ce': 1 },
        'const descriptor = descriptors[String(i)]': { '12b2fdc0a0ffd6ce': 1 },
        "if (!descriptor || !('value' in descriptor) || !descriptor.enumerable)":
          { '194b520dc30384b3': 2, '7e8c064eaa08ddfa': 1 },
        'visit(descriptor.value, depth + 1)': { '7d29e4d19453aa96': 1 },
        'Object.getPrototypeOf(v) !== Object.prototype &&': {
          '99cac9d0d093a87e': 1
        },
        'Object.getPrototypeOf(v) !== null': { '99cac9d0d093a87e': 1 },
        'Object.getOwnPropertyDescriptors(v)': { '511cf3cd840c8327': 1 }
      }
    }
  },
  {
    id: 'pdsh-sandbox-host-probe',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'Reviewed PDSH-011 host probe executes literal bwrap argv and /bin/true with network unshared, only to detect containment; no module/code-string acquisition. Entire probe source is pinned.',
    pins: {
      'packages/sandbox/src/capabilities.ts':
        '6d65214b7c2c641603aec5aa336b3a050efd5c2ba9917d142407f3c019c3d6f5'
    },
    sites: {
      'packages/sandbox/src/capabilities.ts': {
        'execFileSync(': { '6ee64919b5e7503c': 1 }
      }
    }
  },
  {
    id: 'pdsh-contained-process',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'PDSH-011 deliberately exposes a process capability, gated by allowSubprocess and confined cwd. Reviewed code constructs bubblewrap namespace argv (no shell wrapper); other sites manage child streams, stdin, timeout and exit. bwrapPath is a trusted composition seam. This exception does not attest arbitrary child code or host filesystem isolation; product edges remain forbidden. Entire runner is pinned.',
    pins: {
      'packages/sandbox/src/run.ts':
        'a5fa08026af97e2c809445f5949799f3e70b1f833da542142cb28d14f078e933'
    },
    sites: {
      'packages/sandbox/src/run.ts': {
        "const child = spawn(request.bwrapPath ?? 'bwrap', bwrapArgs, {": {
          fdc5cd232a6b322b: 1
        },
        "child.kill('SIGKILL')": { '5c689333c261579d': 1 },
        "child.stdout.on('data', (chunk: Buffer) => drain('stdout', chunk))": {
          c48d06f5a4f383e0: 1
        },
        "child.stderr.on('data', (chunk: Buffer) => drain('stderr', chunk))": {
          a24febbe3ca5b688: 1
        },
        "child.on('error', () => {": { '49c05c6142480228': 1 },
        "child.on('close', (code: number | null) => {": {
          '520278083d1a776a': 1
        },
        'child.stdin.end(request.stdin)': { e1751db744e7920e: 1 },
        'child.stdin.end()': { dc7602b66365a6bb: 1 }
      }
    }
  },
  {
    id: 'pdsh-tool-catalog-generator-test',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'PDSH-014 test invokes only Node with the reviewed first-party catalog generator, or a byte-exact temporary copy, for deterministic generation and a negative drift check. Test and generator are both pinned; changed code in either invalidates all sites.',
    pins: {
      'packages/harness/src/__tests__/pdsh-014-tool-catalog.test.ts':
        'ede4c0e0ad78c4d48a4628d878220d357bdf9df3bf386ecd257d2048a528fd98',
      'scripts/gen-tool-catalog.mjs':
        '0550a2c7484c494a3551992853ffa7eb8ec38fa88c065b9ce2e8a9db7f8ab612'
    },
    sites: {
      'packages/harness/src/__tests__/pdsh-014-tool-catalog.test.ts': {
        "const stdout = execFileSync('node', [SCRIPT, '--check'], {": {
          aaa4e5ed89d5f88d: 1
        },
        "return { status: 0, stdout, stderr: '' }": { '63d42d26156fcc76': 1 },
        "execFileSync('node', [SCRIPT], { cwd: ROOT, encoding: 'utf8' })": {
          '8a9c2cb694959bc5': 1
        },
        'execFileSync(': { '7fd20b681069d001': 1 }
      }
    }
  },
  {
    id: 'vitest-fetch-spy',
    reason: 'UNVERIFIED_MODULE_LOADER_ESCAPE',
    justification:
      "Vitest replaces the fetch global inside a test: globalThis goes to vi.spyOn with the literal method 'fetch'. No module or code string is acquired.",
    sites: {
      'apps/web/src/__tests__/app.test.tsx': {
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {": {
          '211d07ad9adf840f': 6
        },
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {": {
          '211d07ad9adf840f': 6
        },
        "vi.spyOn(globalThis, 'fetch').mockRejectedValue(": {
          '211d07ad9adf840f': 1
        }
      },
      'apps/web/src/__tests__/attendance-approval-conflict.test.tsx': {
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {": {
          '211d07ad9adf840f': 2
        }
      },
      'apps/web/src/__tests__/audit-checkpoint-app.test.tsx': {
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {": {
          '211d07ad9adf840f': 1
        }
      },
      'apps/web/src/__tests__/journeys-identity-race.test.tsx': {
        ".spyOn(globalThis, 'fetch')": {
          '211d07ad9adf840f': 1
        },
        "vi.spyOn(globalThis, 'fetch').mockImplementation(() =>": {
          '211d07ad9adf840f': 1
        },
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {": {
          '211d07ad9adf840f': 3
        }
      },
      'apps/web/src/__tests__/platform-panel.test.tsx': {
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {": {
          '211d07ad9adf840f': 1
        },
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {": {
          '211d07ad9adf840f': 5
        }
      },
      'apps/web/src/__tests__/trusted-session-app.test.tsx': {
        "return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {":
          {
            '211d07ad9adf840f': 1
          }
      },
      'apps/web/src/api/audit-evidence-checkpoint-client.test.ts': {
        ".spyOn(globalThis, 'fetch')": {
          '211d07ad9adf840f': 1
        },
        "const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(": {
          '211d07ad9adf840f': 1
        }
      },
      'apps/web/src/api/client.test.ts': {
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {": {
          '211d07ad9adf840f': 1
        }
      },
      'apps/web/src/api/release-candidate-client.test.ts': {
        ".spyOn(globalThis, 'fetch')": {
          '211d07ad9adf840f': 1
        },
        "vi.spyOn(globalThis, 'fetch').mockImplementation(() =>": {
          '211d07ad9adf840f': 1
        },
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {": {
          '211d07ad9adf840f': 1
        }
      },
      'apps/web/src/api/resilient-client.test.ts': {
        "vi.spyOn(globalThis, 'fetch').mockImplementation(() => {": {
          '211d07ad9adf840f': 3
        },
        "vi.spyOn(globalThis, 'fetch').mockImplementation(() =>": {
          '211d07ad9adf840f': 2
        },
        "vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {":
          {
            '211d07ad9adf840f': 2
          },
        "vi.spyOn(globalThis, 'fetch').mockImplementation(": {
          '211d07ad9adf840f': 2
        }
      },
      'apps/web/src/features/journeys/journeys.test.tsx': {
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {": {
          '211d07ad9adf840f': 1
        }
      },
      'apps/web/src/features/platform/handoff-policy-control-center.test.tsx': {
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {": {
          '211d07ad9adf840f': 1
        },
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {": {
          '211d07ad9adf840f': 1
        }
      },
      'apps/web/src/features/platform/knowledge-source-catalog.test.tsx': {
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {": {
          '211d07ad9adf840f': 1
        }
      },
      'apps/web/src/features/platform/multi-agent-creation.test.tsx': {
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {": {
          '211d07ad9adf840f': 6
        }
      },
      'apps/web/src/features/platform/platform.test.tsx': {
        ".spyOn(globalThis, 'fetch')": {
          '211d07ad9adf840f': 1
        },
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {": {
          '211d07ad9adf840f': 2
        }
      },
      'apps/web/src/features/platform/prompt-profile-control-center.test.tsx': {
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {": {
          '211d07ad9adf840f': 1
        }
      },
      'apps/web/src/features/platform/release-candidate-ledger.test.tsx': {
        "vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {": {
          '211d07ad9adf840f': 1
        }
      }
    }
  },
  {
    id: 'entrypoint-subprocess',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'The test runs the core entrypoint itself (tsx apps/worker/src/main.ts or tsx apps/api/src/main.ts) as a child process and reads its streams; the bound expressions include the literal arguments, and that entrypoint is already inside the analysed core closure.',
    sites: {
      'apps/api/src/__tests__/identity-composition-wiring.test.ts': {
        "child.once('close', (code) => resolve({ code, output }))": {
          '7e3a11f8d590dd59': 1
        },
        "child.once('error', reject)": {
          cf3ce6f5fc7dd1b9: 1
        },
        "child.stderr.on('data', (chunk) => {": {
          '76f89432d910db42': 1
        },
        "child.stdout.on('data', (chunk) => {": {
          f09a5636ee06b7a1: 1
        },
        'const child = spawn(': {
          '43f55bc626fd9ce0': 1
        }
      },
      'apps/worker/src/__tests__/continuous-worker-entrypoint.integration.test.ts':
        {
          "child.stderr?.on('data', (chunk) => {": {
            '656f518bc4d28237': 1
          },
          "child.stdout?.on('data', (chunk) => {": {
            a9708ba7d5a90314: 1
          },
          'const child = spawn(': {
            acf1da9554e36371: 1
          },
          'return { child, output: () => output }': {
            ddc9e669194254ce: 1
          }
        },
      'apps/worker/src/__tests__/continuous-worker.test.ts': {
        "child.once('close', (code) => {": {
          '89edd9e32294233c': 1
        },
        "child.once('error', () => {": {
          f8b03579a30d46a1: 1
        },
        "child.stderr.on('data', (chunk) => {": {
          '76f89432d910db42': 1
        },
        "child.stdout.on('data', (chunk) => {": {
          f09a5636ee06b7a1: 1
        },
        'const child = spawn(': {
          acf1da9554e36371: 1
        },
        "const timeout = setTimeout(() => child.kill('SIGKILL'), 30_000)": {
          '5c689333c261579d': 1
        }
      },
      'apps/worker/src/__tests__/homolog-worker-lifecycle.test.ts': {
        "child.once('close', (code) => resolve({ code }))": {
          ed0a2e756723aeeb: 2
        },
        "child.once('error', reject)": {
          cf3ce6f5fc7dd1b9: 2
        },
        "child.stderr?.on('data', (chunk) => {": {
          '656f518bc4d28237': 2
        },
        "child.stdout?.on('data', (chunk) => {": {
          a9708ba7d5a90314: 2
        },
        'const child = spawn(': {
          '1d58aa57004384b9': 1,
          a5a2c25e853e6901: 1
        }
      },
      'apps/worker/src/__tests__/operational-harness-homolog.integration.test.ts':
        {
          "child.once('close', (code, signal) => resolve({ code, signal }))": {
            '1dfa5e15bfdbfca9': 1
          },
          "child.once('error', reject)": {
            cf3ce6f5fc7dd1b9: 1
          },
          "child.stderr?.on('data', (chunk) => {": {
            '656f518bc4d28237': 1
          },
          "child.stdout?.on('data', (chunk) => {": {
            a9708ba7d5a90314: 1
          },
          'const child = spawn(': {
            acf1da9554e36371: 1
          },
          'return { child, output: () => output, exit }': {
            ddc9e669194254ce: 1
          }
        },
      'apps/worker/src/__tests__/operational-harness-process-restart.integration.test.ts':
        {
          "child.once('close', (code, signal) => resolve({ code, signal }))": {
            '1dfa5e15bfdbfca9': 1
          },
          "child.once('error', reject)": {
            cf3ce6f5fc7dd1b9: 1
          },
          "child.stderr?.on('data', (chunk) => {": {
            '656f518bc4d28237': 1
          },
          "child.stdout?.on('data', (chunk) => {": {
            a9708ba7d5a90314: 1
          },
          'const child = spawn(': {
            acf1da9554e36371: 1
          },
          'return { child, output: () => output, exit }': {
            ddc9e669194254ce: 1
          }
        },
      'apps/worker/src/__tests__/startup-error-redaction.test.ts': {
        "child.once('close', (code) => resolve({ code }))": {
          ed0a2e756723aeeb: 1
        },
        "child.once('error', reject)": {
          cf3ce6f5fc7dd1b9: 1
        },
        "child.stderr?.on('data', (chunk) => {": {
          '656f518bc4d28237': 1
        },
        "child.stdout?.on('data', (chunk) => {": {
          a9708ba7d5a90314: 1
        },
        'const child = spawn(': {
          c5e23c80b5d58815: 1
        }
      }
    }
  },
  {
    id: 'shutdown-signal-source',
    reason: 'UNVERIFIED_MODULE_LOADER_ESCAPE',
    justification:
      'process is handed to createShutdownController().install, which only calls source.once(signal, handler); the pin binds that implementation. homolog-worker.js is the gitignored compiled mirror of homolog-worker.ts.',
    pins: {
      'packages/shared/src/lifecycle.ts':
        'b78db7a8d1335b4e22fd26c01d831c6addfa138d216c2e86bf8433ccf284c7b4'
    },
    sites: {
      'apps/api/src/main.ts': {
        'shutdown.install(process)': {
          '19ed40bf62c399b8': 1
        }
      },
      'apps/worker/src/homolog-worker.js': {
        'shutdown.install(process);': {
          '19ed40bf62c399b8': 1
        }
      },
      'apps/worker/src/homolog-worker.ts': {
        'shutdown.install(process)': {
          '19ed40bf62c399b8': 1
        }
      },
      'apps/worker/src/main.ts': {
        'shutdown.install(process)': {
          '19ed40bf62c399b8': 4
        }
      }
    }
  },
  {
    id: 'entrypoint-process-double',
    reason: 'UNVERIFIED_MODULE_LOADER_ESCAPE',
    justification:
      'Test doubles for process.once/process.exit around the API entrypoint: process is only spied, bound or returned to the code under test.',
    sites: {
      'apps/api/src/__tests__/production-bootstrap-main-own.test.ts': {
        'const once = process.once.bind(process)': {
          '19ed40bf62c399b8': 1
        },
        "exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)":
          {
            '19ed40bf62c399b8': 1
          },
        'return process': {
          '19ed40bf62c399b8': 1
        },
        "vi.spyOn(process, 'once').mockImplementation((event, listener) => {": {
          '19ed40bf62c399b8': 1
        }
      }
    }
  },
  {
    id: 'plain-object-reflection',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'Canonical serialization and plain-object checks: Object.getPrototypeOf / Object.getOwnPropertyDescriptor read the prototype or data descriptor of the value being checked; results are compared or serialized, never evaluated. src/*.js and dist/*.js entries are gitignored compiled mirrors of the listed TypeScript.',
    sites: {
      'apps/api/src/webhook-security.ts': {
        'const prototype = Object.getPrototypeOf(value)': {
          '5b2efa8c4f1c77a4': 1
        },
        'if (prototype !== Object.prototype && prototype !== null) {': {
          b34563e2ebeb7717: 2
        }
      },
      'packages/harness/dist/capability-boundary.js': {
        'const property = Object.getOwnPropertyDescriptor(value, key);': {
          e803fbe0ab1500bc: 1
        },
        'const prototype = Object.getPrototypeOf(value);': {
          '5b2efa8c4f1c77a4': 1
        },
        "if (!property || !('value' in property)) {": {
          fc9184134ae56728: 2
        },
        'parts.push(`${JSON.stringify(key)}:${stableSerialize(property.value, state, depth + 1)}`);':
          {
            '1608b61b9ac5ebe6': 1
          },
        'return prototype === Object.prototype || prototype === null;': {
          b34563e2ebeb7717: 2
        }
      },
      'packages/harness/src/capability-boundary.ts': {
        '`${JSON.stringify(key)}:${stableSerialize(property.value, state, depth + 1)}`':
          {
            '1608b61b9ac5ebe6': 1
          },
        'const property = Object.getOwnPropertyDescriptor(value, key)': {
          e803fbe0ab1500bc: 1
        },
        'const prototype = Object.getPrototypeOf(value)': {
          '5b2efa8c4f1c77a4': 1
        },
        "if (!property || !('value' in property)) {": {
          fc9184134ae56728: 2
        },
        'return prototype === Object.prototype || prototype === null': {
          b34563e2ebeb7717: 2
        }
      },
      'packages/platform/dist/tool-invocation-boundary.js': {
        'const prototype = Object.getPrototypeOf(value);': {
          '5b2efa8c4f1c77a4': 1
        },
        'return prototype === Object.prototype || prototype === null;': {
          b34563e2ebeb7717: 2
        }
      },
      'packages/platform/src/tool-invocation-boundary.js': {
        'const prototype = Object.getPrototypeOf(value);': {
          '5b2efa8c4f1c77a4': 1
        },
        'return prototype === Object.prototype || prototype === null;': {
          b34563e2ebeb7717: 2
        }
      },
      'packages/platform/src/tool-invocation-boundary.ts': {
        'const prototype = Object.getPrototypeOf(value)': {
          '5b2efa8c4f1c77a4': 1
        },
        'return prototype === Object.prototype || prototype === null': {
          b34563e2ebeb7717: 2
        }
      },
      'packages/shared/src/canonical.js': {
        'const prototype = Object.getPrototypeOf(value);': {
          '5b2efa8c4f1c77a4': 1
        },
        'return prototype === Object.prototype || prototype === null;': {
          b34563e2ebeb7717: 2
        }
      }
    }
  },
  {
    id: 'test-proxy-get-trap',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'Proxy get traps in tests forward property reads to the wrapped store with Reflect.get (functions are re-bound to the target). No code string is evaluated.',
    sites: {
      'apps/api/src/__tests__/approval-decision-atomicity-postgres.test.ts': {
        'return Reflect.get(target, property, receiver)': {
          b168168728e8d590: 1
        }
      },
      'apps/api/src/__tests__/approval-decision-atomicity.test.ts': {
        'Reflect.get(target, property, receiver) as never,': {
          b168168728e8d590: 1
        },
        'return Reflect.get(target, property, receiver)': {
          b168168728e8d590: 2
        }
      },
      'packages/platform/src/__tests__/controlled-preset-hardening.test.ts': {
        'const value = Reflect.get(target, property, receiver)': {
          b168168728e8d590: 1
        },
        "return typeof value === 'function' ? value.bind(target) : value": {
          cd42404d52ad55cc: 2,
          fa2622dfddcead0d: 1
        }
      }
    }
  },
  {
    id: 'function-type-matcher',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      'The Function constructor is passed to expect.any as a type matcher (instanceof check); it is never called.',
    sites: {
      'apps/web/src/__tests__/app.test.tsx': {
        'expect(resolveDecision).toEqual(expect.any(Function))': {
          c803710302d5769d: 1
        },
        'expect(resolveTenantB).toEqual(expect.any(Function))': {
          c803710302d5769d: 1
        }
      },
      'packages/persistence/src/__tests__/outbox-edge.test.ts': {
        'expect(event.payload).toEqual({ callback: expect.any(Function) })': {
          c803710302d5769d: 1
        }
      }
    }
  },
  {
    id: 'web-bootstrap-token',
    reason: 'UNVERIFIED_MODULE_LOADER_ESCAPE',
    justification:
      'Reads, calls and clears the operator bootstrap token that the hosting page injects on window, under literal property names. No module or code string is acquired.',
    sites: {
      'apps/web/src/auth/session.ts': {
        'const runtime = globalThis as typeof globalThis & RuntimeBootstrapWindow':
          {
            '211d07ad9adf840f': 1
          }
      }
    }
  },
  {
    id: 'web-bootstrap-token',
    reason: 'UNVERIFIED_MODULE_LOADER_PROPERTY',
    justification:
      'Reads, calls and clears the operator bootstrap token that the hosting page injects on window, under literal property names. No module or code string is acquired.',
    sites: {
      'apps/web/src/auth/session.ts': {
        'const token = runtime.__CVG_OPERATOR_BOOTSTRAP_TOKEN__ ?? null': {
          '5ac65af8360cc35c': 1
        },
        'if (runtime.__CVG_OPERATOR_BOOTSTRAP_TOKEN_PROVIDER__) {': {
          '759692d8b2b2f1fa': 1
        },
        'if (token) delete runtime.__CVG_OPERATOR_BOOTSTRAP_TOKEN__': {
          '5ac65af8360cc35c': 1
        },
        'return runtime.__CVG_OPERATOR_BOOTSTRAP_TOKEN_PROVIDER__()': {
          '759692d8b2b2f1fa': 1
        }
      }
    }
  },
  {
    id: 'typescript-reexport-helper',
    reason: 'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
    justification:
      "TypeScript's CommonJS re-export helper (__createBinding) in packages/persistence/src/index.js, a gitignored compiled mirror; it copies property descriptors of already required modules.",
    sites: {
      'packages/persistence/src/index.js': {
        'Object.defineProperty(o, k2, desc);': {
          '97864e878fe129a3': 1
        },
        'desc = { enumerable: true, get: function() { return m[k]; } };': {
          '97864e878fe129a3': 1
        },
        'if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {':
          {
            '6a021c39917993fc': 1,
            '97864e878fe129a3': 2,
            ed60354aae43e365: 1
          },
        'var desc = Object.getOwnPropertyDescriptor(m, k);': {
          b26857a240b32b4a: 1
        }
      }
    }
  }
]
const exceptableReasons = new Set([
  'UNVERIFIED_DYNAMIC_CODE_EXECUTION',
  'UNVERIFIED_MODULE_LOADER_ESCAPE',
  'UNVERIFIED_MODULE_LOADER_PROPERTY'
])
const normalizeLine = (text) => text.trim().replace(/\s+/g, ' ')
const expressionDigest = (text) =>
  createHash('sha256').update(normalizeLine(text)).digest('hex').slice(0, 16)
// SPEC0215: one literal example site; no examples directory/glob exemption.
const sdkExampleSite = 'examples/consumers/sdk-stdio/index.mts'
const firstPartyFile = (file) =>
  (/^(?:packages|apps|legacy)\//.test(file) || file === sdkExampleSite) &&
  !file
    .split('/')
    .some((part) => ['node_modules', '..', '.', ''].includes(part))
// Scripts may be additional byte pins, never exception sites. Keeping these
// predicates separate prevents an expanded exemption surface for runtime code.
const pinnableFirstPartyFile = (file) =>
  firstPartyFile(file) ||
  file === 'examples/consumers/sdk-stdio/child.mts' ||
  (/^scripts\//.test(file) &&
    !file
      .split('/')
      .some((part) => ['node_modules', '..', '.', ''].includes(part)))
const exceptionSites = new Map()
for (const { id, reason, pins = {}, sites } of capabilityExceptions) {
  if (!exceptableReasons.has(reason))
    throw new Error(`invalid_boundary_exception:${id}:${reason}`)
  for (const [file, digest] of Object.entries(pins))
    if (!pinnableFirstPartyFile(file) || !/^[0-9a-f]{64}$/.test(digest))
      throw new Error(`invalid_boundary_exception:${id}:${file}`)
  for (const [file, lines] of Object.entries(sites))
    for (const [line, expressions] of Object.entries(lines))
      for (const [expression, max] of Object.entries(expressions)) {
        if (
          !firstPartyFile(file) ||
          normalizeLine(line) !== line ||
          !/^[0-9a-f]{16}$/.test(expression) ||
          !Number.isInteger(max) ||
          max < 1
        )
          throw new Error(`invalid_boundary_exception:${id}:${file}`)
        exceptionSites.set(JSON.stringify([reason, file, line, expression]), {
          id,
          max,
          pins
        })
      }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    // Usage: check-product-boundary.mjs [root] [--graph=<file>] [--strict]
    // --graph writes the resolved core closure (evidence) to <file>.
    // --strict is retained as an alias; normal analysis also applies no exceptions.
    const args = process.argv.slice(2)
    const flags = args.filter((arg) => arg.startsWith('--'))
    const graphFile = flags
      .find((arg) => arg.startsWith('--graph='))
      ?.slice('--graph='.length)
    const referenceFlags = flags.filter((arg) =>
      arg.startsWith('--installed-reference=')
    )
    const digestFlags = flags.filter((arg) =>
      arg.startsWith('--installed-reference-sha256=')
    )
    const referencePath = referenceFlags[0]?.slice(
      '--installed-reference='.length
    )
    const referenceSha = digestFlags[0]?.slice(
      '--installed-reference-sha256='.length
    )
    const semanticFlags = flags.filter((arg) => arg === '--semantic')
    const compiledFlags = flags.filter((arg) =>
      arg.startsWith('--compiled-build-reference=')
    )
    const compiledDigestFlags = flags.filter((arg) =>
      arg.startsWith('--compiled-build-reference-sha256=')
    )
    const compiledPath = compiledFlags[0]?.slice(
      '--compiled-build-reference='.length
    )
    const compiledSha = compiledDigestFlags[0]?.slice(
      '--compiled-build-reference-sha256='.length
    )
    const unknown = flags.filter(
      (arg) =>
        !arg.startsWith('--graph=') &&
        arg !== '--strict' &&
        arg !== '--semantic' &&
        !arg.startsWith('--compiled-build-reference=') &&
        !arg.startsWith('--compiled-build-reference-sha256=') &&
        !arg.startsWith('--installed-reference=') &&
        !arg.startsWith('--installed-reference-sha256=')
    )
    const positional = args.filter((arg) => !arg.startsWith('--'))
    if (unknown.length || positional.length > 1 || graphFile === '')
      throw new Error(`invalid_boundary_arguments:${args.join(' ')}`)
    if (
      semanticFlags.length > 1 ||
      (semanticFlags.length && (!referenceFlags.length || !digestFlags.length))
    )
      throw new Error('invalid_semantic_arguments')
    if (compiledFlags.length || compiledDigestFlags.length) {
      if (
        !semanticFlags.length ||
        compiledFlags.length !== 1 ||
        compiledDigestFlags.length !== 1 ||
        !compiledPath ||
        !/^[a-f0-9]{64}$/.test(compiledSha ?? '')
      )
        throw new Error('invalid_compiled_build_reference_arguments')
    }
    if (referenceFlags.length || digestFlags.length) {
      if (
        referenceFlags.length !== 1 ||
        digestFlags.length !== 1 ||
        !referencePath ||
        !/^[a-f0-9]{64}$/.test(referenceSha ?? '')
      )
        throw new Error('invalid_installed_reference_arguments')
    }
    const result = auditProductBoundary(positional[0] ?? process.cwd(), {
      graph: graphFile !== undefined,
      exceptions: false,
      ...(semanticFlags.length ? { semantic: true } : {}),
      ...(compiledPath
        ? {
            compiledBuildReference: {
              manifestPath: compiledPath,
              expectedSha256: compiledSha
            }
          }
        : {}),
      ...(referencePath
        ? {
            installedReference: {
              manifestPath: referencePath,
              expectedSha256: referenceSha
            }
          }
        : {})
    })
    if (graphFile !== undefined) {
      fs.writeFileSync(graphFile, `${JSON.stringify(result.graph, null, 2)}\n`)
      delete result.graph
    }
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.passed ? 0 : 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 2
  }
}
