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
// HISO-005 status (PLAN0374 B1, 2026-10-07): the gate completes on the real
// repository in minutes and its known negative cases (direct, intermediary,
// alias, workspace/installed dependency, dynamic loaders and the reproduced
// T2 counterexamples) are covered by tests/product-boundary.test.js. HISO-005
// is NOT accepted: acceptance still depends on an independent re-audit.
//
// Scope: first-party sources (packages, apps, legacy, products and any local
// file a reference reaches) are parsed completely and fail closed. Installed
// third-party packages are terminal nodes verified by canonical path, lock
// metadata, declared successors and a product-identifier tripwire; their
// implementation is not parsed (see createInstalledPackageVerifier).
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
  { graph: includeGraph = false, exceptions: applyExceptions = true } = {}
) {
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
  // Keep provenance internal: only diagnostics on the actual core closure
  // qualify this gate. Unrelated consumers retain their own quality gates.
  const diagnosticSources = new WeakMap()
  const reportDiagnostic = (file, diagnostic) => {
    diagnosticSources.set(diagnostic, file)
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
    productReferences: [...productReferences]
  })
  // Installed third-party packages are terminal nodes keyed by their canonical
  // directory. They are verified and expanded by settleInstalled() without
  // ever entering the parsed source inventory.
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
      else if (verdict.drift) installedDrift.set(node, verdict.drift)
      for (const { name } of verdict.dependencies ?? []) {
        const located = locateInstalled(
          root,
          path.join(context, 'package.json'),
          name
        )
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
      const { references, links } = installedPackages.scan(context)
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
          if (error.code === 'ENOENT') continue
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
      reportDiagnostic(file, {
        file: `${path.relative(root, file)}:${ts.getLineAndCharacterOfPosition(source, node.getStart()).line + 1}`,
        reason,
        expression: expressionDigest(node.getText(source))
      })
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
  // Restricted exceptions apply to core-closure diagnostics only, after the
  // provenance filter, and never to any reason outside exceptableReasons.
  const exceptions = []
  const exceptionUse = new Map()
  const sourceLines = new Map()
  const pinState = new Map()
  // A group's pins name files its justification depends on (for example the
  // callee that receives an escaped capability); any byte change lapses it.
  const pinsHold = (pins) =>
    Object.entries(pins).every(([file, digest]) => {
      if (!pinState.has(file)) {
        const target = path.join(root, file)
        pinState.set(
          file,
          fs.existsSync(target)
            ? createHash('sha256').update(fs.readFileSync(target)).digest('hex')
            : null
        )
      }
      return pinState.get(file) === digest
    })
  const exceptionKey = (diagnostic) => {
    if (!exceptableReasons.has(diagnostic.reason)) return undefined
    const match = /^(.+):(\d+)$/.exec(diagnostic.file ?? '')
    if (!match || typeof diagnostic.expression !== 'string') return undefined
    const [, file, line] = match
    if (!sourceLines.has(file))
      sourceLines.set(
        file,
        fs.readFileSync(path.join(root, file), 'utf8').split('\n')
      )
    const text = normalizeLine(sourceLines.get(file)[Number(line) - 1] ?? '')
    return JSON.stringify([
      diagnostic.reason,
      file,
      text,
      diagnostic.expression
    ])
  }
  for (let index = 0; index < diagnostics.length; ) {
    const key = applyExceptions && exceptionKey(diagnostics[index])
    const site = key && exceptionSites.get(key)
    const used = (key && exceptionUse.get(key)) || 0
    if (site && used < site.max && pinsHold(site.pins)) {
      exceptionUse.set(key, used + 1)
      exceptions.push({
        ...diagnostics.splice(index, 1)[0],
        exception: site.id
      })
    } else index += 1
  }
  // Informational: listed capacity not consumed by a file present in this
  // tree (a fixed or edited site, or a lapsed pin). Absent files, such as
  // compiled mirrors in a clean checkout, are not listed.
  const unusedExceptions = applyExceptions
    ? [...exceptionSites]
        .filter(
          ([key, { max }]) =>
            (exceptionUse.get(key) ?? 0) < max &&
            fs.existsSync(path.join(root, JSON.parse(key)[1]))
        )
        .map(([key, { id, max, pins }]) => {
          const [reason, file, line, expression] = JSON.parse(key)
          return {
            exception: id,
            reason,
            file,
            line,
            expression,
            unused: max - (exceptionUse.get(key) ?? 0),
            pinsHold: pinsHold(pins)
          }
        })
    : []
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
  const result = {
    sourceFiles: sourceFiles.length,
    coreFiles: coreFiles.length,
    workspaceCount: workspaces.size,
    installedPackageCount: coreInstalled.length,
    edgeCount: [...graph.values()].reduce((sum, set) => sum + set.size, 0),
    violations,
    diagnostics,
    exceptionsApplied: applyExceptions,
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
            reason: verdict?.reason ?? null
          }
        })
        .sort((a, b) => a.node.localeCompare(b.node))
    }
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
      'packages/shared/dist/canonical.js': {
        'const prototype = Object.getPrototypeOf(value);': {
          '5b2efa8c4f1c77a4': 1
        },
        'return prototype === Object.prototype || prototype === null;': {
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
      },
      'packages/shared/src/canonical.ts': {
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
const firstPartyFile = (file) =>
  /^(?:packages|apps|legacy)\//.test(file) &&
  !file
    .split('/')
    .some((part) => ['node_modules', '..', '.', ''].includes(part))
const exceptionSites = new Map()
for (const { id, reason, pins = {}, sites } of capabilityExceptions) {
  if (!exceptableReasons.has(reason))
    throw new Error(`invalid_boundary_exception:${id}:${reason}`)
  for (const [file, digest] of Object.entries(pins))
    if (!firstPartyFile(file) || !/^[0-9a-f]{64}$/.test(digest))
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
    // --strict disables the restricted exception table (raw analysis).
    const args = process.argv.slice(2)
    const flags = args.filter((arg) => arg.startsWith('--'))
    const graphFile = flags
      .find((arg) => arg.startsWith('--graph='))
      ?.slice('--graph='.length)
    const strict = flags.includes('--strict')
    const unknown = flags.filter(
      (arg) => !arg.startsWith('--graph=') && arg !== '--strict'
    )
    const positional = args.filter((arg) => !arg.startsWith('--'))
    if (unknown.length || positional.length > 1 || graphFile === '')
      throw new Error(`invalid_boundary_arguments:${args.join(' ')}`)
    const result = auditProductBoundary(positional[0] ?? process.cwd(), {
      graph: graphFile !== undefined,
      exceptions: !strict
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
