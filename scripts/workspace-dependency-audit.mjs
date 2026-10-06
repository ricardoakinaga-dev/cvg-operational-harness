#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const SOURCE_EXTENSIONS = new Set([
  '.cjs',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.mts',
  '.ts',
  '.tsx'
])
const CODE_EXTENSIONS = SOURCE_EXTENSIONS
const ROOT_TEST_EXTENSIONS = new Set([
  ...SOURCE_EXTENSIONS,
  '.json',
  '.snap',
  '.sql',
  '.yaml',
  '.yml'
])
const EXIT = Object.freeze({ OK: 0, VIOLATION: 1, INCOMPLETE: 2, INPUT: 64 })
const R1_APPROVED_DELTA_PATHS = [
  'config/workspace-dependency-policy.json',
  'scripts/workspace-dependency-audit.mjs',
  'tests/workspace-dependency-audit.test.js',
  'packages/conversation/src/__tests__/postgres-store.unit.test.ts'
].sort(compareText)
const C1J_BASELINE_MANIFEST_PATH =
  'docs/04_audit/evidence/AUD-20260924/M07-S1-C1J/candidate-baseline.json'
const C1J_BASELINE_MANIFEST_SHA256 =
  'ea28a36f156bda03fa6da930443feea21a873fd451775d86f43150bc15c8d67d'
const C1L_NPM_VERSION_FILE =
  'docs/04_audit/evidence/AUD-20260924/M07-S1-C1L/npm-version.txt'
const R1_NODE_VERSION = 'v22.23.2'

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort(compareText)
        .map((key) => [key, stableValue(value[key])])
    )
  }
  return value
}

function stableStringify(value, space = 0) {
  return JSON.stringify(stableValue(value), null, space)
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex')
}

function hashFile(absolutePath) {
  return sha256(fs.readFileSync(absolutePath))
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  )
}

function relativePath(root, absolutePath) {
  return toPosix(path.relative(root, absolutePath))
}

function readJson(absolutePath) {
  const text = fs.readFileSync(absolutePath, 'utf8')
  return JSON.parse(text)
}

function lstatMaybe(absolutePath) {
  try {
    return fs.lstatSync(absolutePath)
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
}

function hasSymlinkInPath(root, absolutePath) {
  if (!isWithin(root, absolutePath))
    return { unsafe: true, reason: 'PATH_ESCAPE' }
  const relative = path.relative(root, absolutePath)
  let current = root
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment)
    const stat = lstatMaybe(current)
    if (stat?.isSymbolicLink()) return { unsafe: true, reason: 'SYMLINK_PATH' }
  }
  return { unsafe: false, reason: null }
}

function probeLocalPath(root, absolutePath) {
  if (!isWithin(root, absolutePath)) return { status: 'PATH_ESCAPE' }
  const extension = path.extname(absolutePath)
  const candidates = [absolutePath]
  const extensionMap = new Map([
    ['.js', '.ts'],
    ['.jsx', '.tsx'],
    ['.mjs', '.mts'],
    ['.cjs', '.cts']
  ])
  if (extensionMap.has(extension)) {
    candidates.push(
      `${absolutePath.slice(0, -extension.length)}${extensionMap.get(extension)}`
    )
  }
  if (!extension) {
    for (const candidateExtension of SOURCE_EXTENSIONS)
      candidates.push(`${absolutePath}${candidateExtension}`)
    for (const candidateExtension of SOURCE_EXTENSIONS) {
      candidates.push(path.join(absolutePath, `index${candidateExtension}`))
    }
  }
  for (const candidate of candidates) {
    const symlink = hasSymlinkInPath(root, candidate)
    if (symlink.unsafe) return { status: symlink.reason }
    const stat = lstatMaybe(candidate)
    if (stat?.isFile()) return { status: 'FOUND', path: candidate }
    if (stat?.isSymbolicLink()) return { status: 'SYMLINK_PATH' }
  }
  return { status: 'MISSING' }
}

function assertRegularFileWithinRoot(root, relative) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/u).includes('..')) {
    throw new Error(
      `path must be repository-relative and may not traverse: ${relative}`
    )
  }
  const absolute = path.resolve(root, relative)
  if (!isWithin(root, absolute))
    throw new Error(`path escapes repository: ${relative}`)
  let current = root
  for (const segment of path
    .relative(root, absolute)
    .split(path.sep)
    .slice(0, -1)) {
    current = path.join(current, segment)
    const stat = lstatMaybe(current)
    if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error(`path parent is missing or unsafe: ${relative}`)
    }
  }
  const stat = lstatMaybe(absolute)
  if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`path is missing or is not a regular file: ${relative}`)
  }
  return absolute
}

function validatePolicy(policy, options = {}) {
  const errors = []
  const requireArray = (value, name) => {
    if (!Array.isArray(value)) errors.push(`${name} must be an array`)
  }
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return ['policy must be a JSON object']
  }
  if (policy.schemaVersion !== 1) errors.push('schemaVersion must equal 1')
  if (
    typeof policy.policyVersion !== 'string' ||
    !policy.policyVersion.trim()
  ) {
    errors.push('policyVersion must be a non-empty string')
  }
  requireArray(policy.workspacePatterns, 'workspacePatterns')
  if (
    Array.isArray(policy.workspacePatterns) &&
    policy.workspacePatterns.length === 0
  ) {
    errors.push('workspacePatterns must not be empty')
  }
  const patterns = stableStringify([...(policy.workspacePatterns ?? [])].sort())
  const historicalPatterns = ['apps/*', 'legacy/packages/*', 'packages/*']
  if (
    patterns !== stableStringify(historicalPatterns) &&
    patterns !== stableStringify([...historicalPatterns, 'products/*'])
  ) {
    errors.push(
      'workspacePatterns must match the reviewed apps/*, packages/* and legacy/packages/* inventory, optionally including products/* under SPEC 0178'
    )
  }
  if (!policy.fileDiscovery || typeof policy.fileDiscovery !== 'object') {
    errors.push('fileDiscovery must be an object')
  } else {
    requireArray(
      policy.fileDiscovery.sourceExtensions,
      'fileDiscovery.sourceExtensions'
    )
    requireArray(
      policy.fileDiscovery.excludedDirectories,
      'fileDiscovery.excludedDirectories'
    )
    if (policy.fileDiscovery.doNotFollowSymlinks !== true) {
      errors.push('fileDiscovery.doNotFollowSymlinks must be true')
    }
  }
  requireArray(policy.sourceRoleRules, 'sourceRoleRules')
  if (Array.isArray(policy.sourceRoleRules)) {
    const configuredRoles = new Set()
    for (const [index, rule] of policy.sourceRoleRules.entries()) {
      if (!rule || typeof rule !== 'object') {
        errors.push(`sourceRoleRules[${index}] must be an object`)
        continue
      }
      if (typeof rule.id !== 'string' || !rule.id.trim())
        errors.push(`sourceRoleRules[${index}].id is required`)
      if (!['PRODUCTION', 'TEST', 'BUILD_ONLY'].includes(rule.role)) {
        errors.push(`sourceRoleRules[${index}].role is not supported`)
      }
      if (rule.role) configuredRoles.add(rule.role)
      requireArray(rule.patterns, `sourceRoleRules[${index}].patterns`)
      if (Array.isArray(rule.patterns) && rule.patterns.length === 0) {
        errors.push(`sourceRoleRules[${index}].patterns must not be empty`)
      }
    }
    if (
      stableStringify([...configuredRoles].sort()) !==
      stableStringify(['BUILD_ONLY', 'PRODUCTION', 'TEST'])
    ) {
      errors.push(
        'sourceRoleRules must keep production, test, and build-only roles distinct'
      )
    }
  }
  if (policy.unmatchedSourceRole !== 'UNRESOLVED') {
    errors.push('unmatchedSourceRole must be UNRESOLVED')
  }
  if (
    !policy.ownerDefaults ||
    policy.ownerDefaults.ownerRole !== 'UNKNOWN' ||
    policy.ownerDefaults.publicCompatibilityStatus !== 'UNKNOWN' ||
    policy.ownerDefaults.projectReferenceRequiredness !== 'UNDECIDED'
  ) {
    errors.push(
      'ownerDefaults must keep owner/public status UNKNOWN and references UNDECIDED'
    )
  }
  const expectedCandidates = {
    '@cvg/harness': 'packages/harness',
    '@cvg/harness-orchestrator': 'packages/orchestrator',
    '@cvg/harness-contracts': 'packages/contracts'
  }
  if (
    !policy.publicCompatibilityCandidates ||
    typeof policy.publicCompatibilityCandidates !== 'object'
  ) {
    errors.push('publicCompatibilityCandidates must be an object')
  } else {
    const actualNames = Object.keys(policy.publicCompatibilityCandidates).sort()
    if (
      stableStringify(actualNames) !==
      stableStringify(Object.keys(expectedCandidates).sort())
    ) {
      errors.push(
        'only the three approved Harness packages may be public compatibility candidates'
      )
    }
    for (const [name, ownerPath] of Object.entries(expectedCandidates)) {
      const entry = policy.publicCompatibilityCandidates[name]
      if (
        !entry ||
        entry.ownerPath !== ownerPath ||
        entry.status !== 'PUBLIC_CANDIDATE'
      ) {
        errors.push(
          `public compatibility candidate ${name} does not match the approved decision`
        )
      }
    }
  }
  const expectedBoundary = {
    '@cvg/harness-contracts': [],
    '@cvg/harness-orchestrator': ['@cvg/harness-contracts'],
    '@cvg/harness': ['@cvg/harness-orchestrator', '@cvg/harness-contracts']
  }
  if (
    !policy.neutralBoundary ||
    stableStringify(policy.neutralBoundary.allowedProductionEdges) !==
      stableStringify(expectedBoundary)
  ) {
    errors.push(
      'neutralBoundary.allowedProductionEdges do not match the approved narrow target'
    )
  }
  if (
    policy.neutralBoundary?.status !== 'APPROVED_FOR_M07_S1_POLICY_ONLY' ||
    policy.neutralBoundary?.evaluationProfile !== 'neutral-target'
  ) {
    errors.push(
      'neutralBoundary must be recorded as policy-only for the later neutral-target profile'
    )
  }
  requireArray(policy.projectReferenceProfiles, 'projectReferenceProfiles')
  if (policy.projectReferenceProfiles?.length !== 0) {
    errors.push('M07-S1 has no approved project-reference profiles')
  }
  requireArray(policy.exceptions, 'exceptions')
  if (Array.isArray(policy.exceptions)) {
    if (policy.exceptions.length > 0)
      errors.push('M07-S1 has no active dependency exceptions')
    const requiredExceptionFields = [
      'sourceOwner',
      'targetOwner',
      'role',
      'scope',
      'reason',
      'accountableOwnerRole',
      'approvalReference',
      'candidateFingerprint'
    ]
    for (const [index, exception] of policy.exceptions.entries()) {
      if (!exception || typeof exception !== 'object') {
        errors.push(`exceptions[${index}] must be an object`)
        continue
      }
      for (const field of requiredExceptionFields) {
        if (typeof exception[field] !== 'string' || !exception[field].trim()) {
          errors.push(`exceptions[${index}].${field} is required`)
        }
      }
      if (!['PRODUCTION', 'TEST'].includes(exception.role)) {
        errors.push(`exceptions[${index}].role must be PRODUCTION or TEST`)
      }
      if (!exception.reviewBy && !exception.exitTrigger) {
        errors.push(`exceptions[${index}] needs reviewBy or exitTrigger`)
      }
    }
  }
  if (!policy.candidateBinding || typeof policy.candidateBinding !== 'object') {
    errors.push('candidateBinding must be an object')
  } else {
    requireArray(
      policy.candidateBinding.approvedAdditionalPaths,
      'candidateBinding.approvedAdditionalPaths'
    )
    const approvedPaths = R1_APPROVED_DELTA_PATHS
    if (options.allowSyntheticBinding === true) {
      if (
        (policy.candidateBinding.approvedAdditionalPaths ?? []).length !== 0 ||
        policy.candidateBinding.baselineManifestPath !== null ||
        policy.candidateBinding.baselineManifestSha256 !== null ||
        policy.candidateBinding.npmVersionFilePath !== null
      ) {
        errors.push(
          'synthetic fixture binding must omit repository paths and the real baseline'
        )
      }
    } else {
      if (
        stableStringify(
          [...(policy.candidateBinding.approvedAdditionalPaths ?? [])].sort()
        ) !== stableStringify(approvedPaths)
      ) {
        errors.push(
          'candidateBinding.approvedAdditionalPaths must contain exactly the four M07-S1-R1 files'
        )
      }
      if (
        policy.candidateBinding.baselineManifestPath !==
          C1J_BASELINE_MANIFEST_PATH ||
        policy.candidateBinding.baselineManifestSha256 !==
          C1J_BASELINE_MANIFEST_SHA256
      ) {
        errors.push(
          'candidateBinding does not match the C1J reconciled baseline artifact'
        )
      }
      if (policy.candidateBinding.npmVersionFilePath !== C1L_NPM_VERSION_FILE) {
        errors.push(
          'candidateBinding.npmVersionFilePath does not match the approved C1L toolchain evidence path'
        )
      }
    }
    if (
      !policy.candidateBinding.fingerprintInventoryRules ||
      typeof policy.candidateBinding.fingerprintInventoryRules !== 'object'
    ) {
      errors.push(
        'candidateBinding.fingerprintInventoryRules must be an object'
      )
    } else {
      const expectedInventoryRules = {
        workspaceCodeExtensions: [
          '.cjs',
          '.cts',
          '.js',
          '.jsx',
          '.mjs',
          '.mts',
          '.ts',
          '.tsx'
        ],
        workspaceGeneratedDirectoriesExcluded: [
          '.git',
          '.next',
          'build',
          'coverage',
          'dist',
          'node_modules',
          'out',
          'target'
        ],
        rootTestExtensions: [
          '.cjs',
          '.cts',
          '.js',
          '.json',
          '.jsx',
          '.mjs',
          '.mts',
          '.snap',
          '.sql',
          '.ts',
          '.tsx',
          '.yaml',
          '.yml'
        ],
        pathsIncluded: [
          'apps/*',
          'packages/*',
          'root package/build configs',
          'scripts source',
          'tests source/fixtures',
          'config source/policy inputs',
          'approved SPEC and human-decision evidence'
        ]
      }
      if (
        stableStringify(policy.candidateBinding.fingerprintInventoryRules) !==
        stableStringify(expectedInventoryRules)
      ) {
        errors.push(
          'candidateBinding.fingerprintInventoryRules differ from the reviewed source baseline rules'
        )
      }
    }
  }
  const expectedCategoryRules = {
    PRODUCTION_RUNTIME: ['dependencies'],
    TEST_ONLY: ['devDependencies'],
    BUILD_ONLY: ['devDependencies'],
    PRODUCTION_TYPE_ONLY: ['dependencies', 'devDependencies'],
    PRODUCTION_MIXED: ['dependencies']
  }
  if (
    stableStringify(policy.dependencyCategoryRules) !==
    stableStringify(expectedCategoryRules)
  ) {
    errors.push(
      'dependencyCategoryRules do not match the approved direct-edge rules'
    )
  }
  return errors
}

function expandWorkspaceOwners(root, packageJson, policy, gaps) {
  const owners = []
  const seenPaths = new Set()
  const workspaceGlobs = packageJson.workspaces
  const patterns = Array.isArray(workspaceGlobs)
    ? workspaceGlobs
    : workspaceGlobs?.packages
  if (!Array.isArray(patterns)) {
    gaps.push({
      code: 'WORKSPACES_MISSING',
      path: 'package.json',
      status: 'UNRESOLVED'
    })
    return owners
  }
  const approvedPatterns = new Set(policy.workspacePatterns)
  for (const pattern of [...patterns].sort()) {
    if (
      !approvedPatterns.has(pattern) ||
      !pattern.endsWith('/*') ||
      pattern.includes('..')
    ) {
      gaps.push({
        code: 'UNSUPPORTED_WORKSPACE_PATTERN',
        path: 'package.json',
        pattern,
        status: 'UNRESOLVED'
      })
      continue
    }
    const parent = pattern.slice(0, -2)
    const parentPath = path.resolve(root, parent)
    if (!isWithin(root, parentPath)) {
      gaps.push({
        code: 'WORKSPACE_PATTERN_ESCAPE',
        path: 'package.json',
        pattern,
        status: 'UNRESOLVED'
      })
      continue
    }
    const parentStat = lstatMaybe(parentPath)
    if (
      !parentStat ||
      !parentStat.isDirectory() ||
      parentStat.isSymbolicLink()
    ) {
      gaps.push({
        code: 'WORKSPACE_PARENT_UNSAFE',
        path: parent,
        status: 'UNRESOLVED'
      })
      continue
    }
    let entries
    try {
      entries = fs.readdirSync(parentPath, { withFileTypes: true })
    } catch (error) {
      gaps.push({
        code: 'WORKSPACE_PARENT_UNREADABLE',
        path: parent,
        reason: error.message,
        status: 'UNRESOLVED'
      })
      continue
    }
    for (const entry of entries.sort((left, right) =>
      compareText(left.name, right.name)
    )) {
      const relativeOwnerPath = toPosix(path.posix.join(parent, entry.name))
      const absoluteOwnerPath = path.resolve(root, relativeOwnerPath)
      if (entry.isSymbolicLink()) {
        gaps.push({
          code: 'WORKSPACE_OWNER_SYMLINK',
          path: relativeOwnerPath,
          status: 'UNRESOLVED'
        })
        continue
      }
      if (!entry.isDirectory()) continue
      if (seenPaths.has(relativeOwnerPath)) {
        gaps.push({
          code: 'DUPLICATE_WORKSPACE_OWNER_PATH',
          path: relativeOwnerPath,
          status: 'UNRESOLVED'
        })
        continue
      }
      seenPaths.add(relativeOwnerPath)
      const manifestPath = path.join(absoluteOwnerPath, 'package.json')
      let manifest
      try {
        manifest = readJson(
          assertRegularFileWithinRoot(
            root,
            toPosix(path.relative(root, manifestPath))
          )
        )
      } catch (error) {
        gaps.push({
          code: 'OWNER_MANIFEST_UNREADABLE',
          path: toPosix(path.relative(root, manifestPath)),
          reason: error.message,
          status: 'UNRESOLVED'
        })
        owners.push({
          path: relativeOwnerPath,
          name: null,
          manifestPath: toPosix(path.relative(root, manifestPath)),
          manifest: null
        })
        continue
      }
      if (typeof manifest.name !== 'string' || !manifest.name.trim()) {
        gaps.push({
          code: 'OWNER_NAME_MISSING',
          path: toPosix(path.relative(root, manifestPath)),
          status: 'UNRESOLVED'
        })
      }
      owners.push({
        path: relativeOwnerPath,
        name: typeof manifest.name === 'string' ? manifest.name : null,
        manifestPath: toPosix(path.relative(root, manifestPath)),
        manifest
      })
    }
  }
  const nameOwners = new Map()
  for (const owner of owners) {
    if (!owner.name) continue
    const list = nameOwners.get(owner.name) ?? []
    list.push(owner.path)
    nameOwners.set(owner.name, list)
  }
  for (const [name, paths] of nameOwners) {
    if (paths.length > 1) {
      gaps.push({
        code: 'DUPLICATE_WORKSPACE_PACKAGE_NAME',
        name,
        paths: paths.sort(),
        status: 'UNRESOLVED'
      })
    }
  }
  return owners.sort((left, right) => compareText(left.path, right.path))
}

function walkFiles(root, startPath, options = {}) {
  const files = []
  const symlinks = []
  const errors = []
  const excluded = new Map()
  const excludedNames = new Set(options.excludedDirectories ?? [])
  const includeFile = options.includeFile ?? (() => true)
  const absoluteStart = path.resolve(root, startPath)
  if (!isWithin(root, absoluteStart)) {
    errors.push({ code: 'WALK_ROOT_ESCAPE', path: startPath })
    return { files, symlinks, errors, excluded }
  }
  const visit = (directory, relativeDirectory) => {
    let entries
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true })
    } catch (error) {
      errors.push({
        code: 'DIRECTORY_UNREADABLE',
        path: relativeDirectory || startPath,
        reason: error.message
      })
      return
    }
    for (const entry of entries.sort((left, right) =>
      compareText(left.name, right.name)
    )) {
      const relative = relativeDirectory
        ? `${relativeDirectory}/${entry.name}`
        : entry.name
      const absolute = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) {
        symlinks.push({ path: relative, target: safeReadlink(absolute) })
        continue
      }
      if (entry.isDirectory()) {
        if (excludedNames.has(entry.name)) {
          excluded.set(entry.name, (excluded.get(entry.name) ?? 0) + 1)
          continue
        }
        visit(absolute, relative)
      } else if (entry.isFile() && includeFile(relative, absolute)) {
        files.push({ relativePath: relative, absolutePath: absolute })
      }
    }
  }
  const stat = lstatMaybe(absoluteStart)
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
    errors.push({ code: 'WALK_ROOT_MISSING', path: startPath })
  } else {
    visit(absoluteStart, '')
  }
  return { files, symlinks, errors, excluded }
}

function safeReadlink(absolutePath) {
  try {
    return toPosix(fs.readlinkSync(absolutePath))
  } catch {
    return null
  }
}

function globToRegExp(pattern) {
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        index += 1
        if (pattern[index + 1] === '/') {
          index += 1
          source += '(?:.*/)?'
        } else {
          source += '.*'
        }
      } else {
        source += '[^/]*'
      }
    } else if (character === '?') {
      source += '[^/]'
    } else {
      source += '.+?^${}()|[]\\'.includes(character)
        ? `\\${character}`
        : character
    }
  }
  return new RegExp(`${source}$`, 'u')
}

const GLOB_CACHE = new Map()

function matchesGlob(relativePathValue, pattern) {
  let matcher = GLOB_CACHE.get(pattern)
  if (!matcher) {
    matcher = globToRegExp(pattern)
    GLOB_CACHE.set(pattern, matcher)
  }
  return matcher.test(relativePathValue)
}

function matchSourceRole(relativePathValue, policy) {
  let role = policy.unmatchedSourceRole ?? 'UNRESOLVED'
  let ruleId = null
  for (const rule of policy.sourceRoleRules ?? []) {
    if (
      (rule.patterns ?? []).some((pattern) =>
        matchesGlob(relativePathValue, pattern)
      )
    ) {
      role = rule.role
      ruleId = rule.id
    }
  }
  return { role, ruleId }
}

function scriptKindFor(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.tsx') return ts.ScriptKind.TSX
  if (extension === '.jsx') return ts.ScriptKind.JSX
  if (['.js', '.jsx', '.mjs', '.cjs'].includes(extension))
    return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function isStringLiteral(node) {
  return Boolean(
    node &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
  )
}

function usageForImportClause(importClause) {
  if (!importClause) return 'RUNTIME'
  if (importClause.isTypeOnly) return 'TYPE_ONLY'
  if (importClause.name) return 'RUNTIME'
  const bindings = importClause.namedBindings
  if (!bindings || ts.isNamespaceImport(bindings)) return 'RUNTIME'
  const elements = bindings.elements ?? []
  if (elements.length === 0) return 'RUNTIME'
  const typeOnlyCount = elements.filter((element) => element.isTypeOnly).length
  if (typeOnlyCount === elements.length) return 'TYPE_ONLY'
  if (typeOnlyCount > 0) return 'MIXED'
  return 'RUNTIME'
}

function usageForExportDeclaration(node) {
  if (node.isTypeOnly) return 'TYPE_ONLY'
  if (node.exportClause && ts.isNamedExports(node.exportClause)) {
    const elements = node.exportClause.elements
    const typeOnlyCount = elements.filter(
      (element) => element.isTypeOnly
    ).length
    if (elements.length > 0 && typeOnlyCount === elements.length)
      return 'TYPE_ONLY'
    if (typeOnlyCount > 0) return 'MIXED'
  }
  return 'RUNTIME'
}

function positionOf(sourceFile, node) {
  const start = node.getStart(sourceFile)
  const position = sourceFile.getLineAndCharacterOfPosition(start)
  return { line: position.line + 1, column: position.character + 1 }
}

function extractModuleReferences(sourceText, filePath) {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath)
  )
  const references = []
  const diagnostics = (sourceFile.parseDiagnostics ?? []).map((diagnostic) => {
    const start = diagnostic.start ?? 0
    const position = sourceFile.getLineAndCharacterOfPosition(start)
    return {
      code: diagnostic.code,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
      line: position.line + 1,
      column: position.character + 1
    }
  })
  const addReference = (node, moduleNode, importKind, importUsage) => {
    const location = positionOf(sourceFile, moduleNode ?? node)
    if (!isStringLiteral(moduleNode)) {
      references.push({
        specifier: null,
        importKind,
        importUsage,
        ...location,
        unresolvedReason: 'NON_LITERAL_MODULE_SPECIFIER'
      })
      return
    }
    references.push({
      specifier: moduleNode.text,
      importKind,
      importUsage,
      ...location,
      unresolvedReason: null
    })
  }
  const visit = (node) => {
    if (ts.isImportDeclaration(node)) {
      addReference(
        node,
        node.moduleSpecifier,
        'STATIC_IMPORT',
        usageForImportClause(node.importClause)
      )
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      addReference(
        node,
        node.moduleSpecifier,
        'RE_EXPORT',
        usageForExportDeclaration(node)
      )
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      addReference(
        node,
        node.moduleReference.expression,
        'IMPORT_EQUALS',
        'RUNTIME'
      )
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument
      const literal = ts.isLiteralTypeNode(argument) ? argument.literal : null
      addReference(node, literal, 'IMPORT_TYPE', 'TYPE_ONLY')
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        addReference(node, node.arguments[0], 'DYNAMIC_IMPORT', 'RUNTIME')
      } else if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'require'
      ) {
        addReference(node, node.arguments[0], 'REQUIRE', 'RUNTIME')
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return { references, diagnostics }
}

function ownerForPath(owners, absolutePath) {
  const candidates = owners
    .filter((owner) => owner.name && isWithin(owner.absolutePath, absolutePath))
    .sort((left, right) => right.absolutePath.length - left.absolutePath.length)
  return candidates[0] ?? null
}

function workspaceBySpecifier(owners, specifier) {
  const candidates = owners.filter(
    (owner) =>
      owner.name &&
      (specifier === owner.name || specifier.startsWith(`${owner.name}/`))
  )
  const longestName = Math.max(
    0,
    ...candidates.map((owner) => owner.name.length)
  )
  const longest = candidates.filter(
    (owner) => owner.name.length === longestName
  )
  return longest.length === 1 ? longest[0] : null
}

function wildcardCount(value) {
  return value.split('*').length - 1
}

/** Substitutes the captured text for the single `*`, taken literally. */
function expandAliasTarget(target, captured) {
  const star = target.indexOf('*')
  if (captured === null || star === -1) return target
  return `${target.slice(0, star)}${captured}${target.slice(star + 1)}`
}

function resolveAliasTargets(root, sourceOwner, specifier, aliases) {
  const results = []
  for (const alias of aliases) {
    if (alias.ownerPath && alias.ownerPath !== sourceOwner.path) continue
    let captured = null
    if (alias.pattern.includes('*')) {
      const [prefix, suffix] = alias.pattern.split('*')
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue
      captured = specifier.slice(
        prefix.length,
        specifier.length - suffix.length
      )
    } else if (specifier !== alias.pattern) {
      continue
    }
    for (const target of alias.targets) {
      const expanded = expandAliasTarget(target, captured)
      const absolute = path.resolve(alias.basePath, expanded)
      results.push({
        absolutePath: absolute,
        configPath: alias.configPath,
        pattern: alias.pattern,
        withinRoot: isWithin(root, absolute)
      })
    }
  }
  return results
}

function resolveWorkspaceTarget(
  root,
  owners,
  aliases,
  sourceOwner,
  sourceAbsolutePath,
  specifier
) {
  const directPackage = workspaceBySpecifier(owners, specifier)
  if (directPackage) {
    return {
      target: directPackage,
      resolution: 'PACKAGE_NAME',
      resolvedPath: null,
      ambiguous: false
    }
  }
  if (specifier.startsWith('.')) {
    const absolutePath = path.resolve(
      path.dirname(sourceAbsolutePath),
      specifier
    )
    if (!isWithin(root, absolutePath)) {
      return {
        target: null,
        resolution: 'PATH_ESCAPE',
        resolvedPath: null,
        ambiguous: false
      }
    }
    const probe = probeLocalPath(root, absolutePath)
    if (probe.status === 'SYMLINK_PATH' || probe.status === 'PATH_ESCAPE') {
      return {
        target: null,
        resolution: probe.status,
        resolvedPath: null,
        ambiguous: false
      }
    }
    const target = ownerForPath(owners, absolutePath)
    if (!target)
      return {
        target: null,
        resolution: 'OUTSIDE_WORKSPACE',
        resolvedPath: absolutePath,
        ambiguous: false
      }
    if (target.path === sourceOwner.path) {
      return {
        target: null,
        resolution: 'SAME_OWNER',
        resolvedPath: absolutePath,
        ambiguous: false
      }
    }
    return {
      target,
      resolution:
        probe.status === 'FOUND' ? 'RELATIVE_PATH' : 'MISSING_RELATIVE_TARGET',
      resolvedPath: absolutePath,
      ambiguous: false
    }
  }
  const aliasTargets = resolveAliasTargets(
    root,
    sourceOwner,
    specifier,
    aliases
  )
  if (aliasTargets.some((alias) => !alias.withinRoot)) {
    return {
      target: null,
      resolution: 'PATH_ALIAS_ESCAPE',
      resolvedPath: null,
      ambiguous: false
    }
  }
  if (
    aliasTargets.some(
      (alias) =>
        probeLocalPath(root, alias.absolutePath).status === 'SYMLINK_PATH'
    )
  ) {
    return {
      target: null,
      resolution: 'SYMLINK_PATH',
      resolvedPath: null,
      ambiguous: false
    }
  }
  const targetOwners = new Map()
  for (const alias of aliasTargets) {
    const owner = ownerForPath(owners, alias.absolutePath)
    if (owner) {
      const current = targetOwners.get(owner.path) ?? { owner, aliases: [] }
      current.aliases.push(alias)
      targetOwners.set(owner.path, current)
    }
  }
  if (targetOwners.size === 1) {
    const match = [...targetOwners.values()][0]
    if (match.owner.path === sourceOwner.path) {
      return {
        target: null,
        resolution: 'SAME_OWNER_ALIAS',
        resolvedPath: match.aliases[0].absolutePath,
        ambiguous: false
      }
    }
    const probe = probeLocalPath(root, match.aliases[0].absolutePath)
    return {
      target: match.owner,
      resolution:
        probe.status === 'FOUND'
          ? 'TYPESCRIPT_PATH_ALIAS'
          : 'MISSING_ALIAS_TARGET',
      resolvedPath: match.aliases[0].absolutePath,
      ambiguous: false
    }
  }
  if (targetOwners.size > 1) {
    return {
      target: null,
      resolution: 'AMBIGUOUS_PATH_ALIAS',
      resolvedPath: null,
      ambiguous: true
    }
  }
  if (specifier.startsWith('@cvg/')) {
    return {
      target: null,
      resolution: 'UNRESOLVED_WORKSPACE_SPECIFIER',
      resolvedPath: null,
      ambiguous: false
    }
  }
  if (aliasTargets.length > 0) {
    return {
      target: null,
      resolution: 'ALIAS_TARGET_OUTSIDE_WORKSPACE',
      resolvedPath: aliasTargets[0].absolutePath,
      ambiguous: false
    }
  }
  return {
    target: null,
    resolution: 'EXTERNAL_OR_UNMAPPED',
    resolvedPath: null,
    ambiguous: false
  }
}

function readTsconfigPaths(root, owners, configFiles, gaps) {
  const aliases = []
  const projectReferenceConfigs = []
  for (const configFile of configFiles) {
    let config
    try {
      config = readJson(configFile.absolutePath)
    } catch (error) {
      gaps.push({
        code: 'TSCONFIG_UNREADABLE',
        path: configFile.path,
        reason: error.message,
        status: 'UNRESOLVED'
      })
      continue
    }
    const owner = ownerForPath(owners, configFile.absolutePath)
    projectReferenceConfigs.push({ configFile, config, owner })
    const options = config.compilerOptions ?? {}
    const basePath = path.resolve(
      path.dirname(configFile.absolutePath),
      options.baseUrl ?? '.'
    )
    if (!isWithin(root, basePath)) {
      gaps.push({
        code: 'TSCONFIG_BASEURL_ESCAPE',
        path: configFile.path,
        status: 'UNRESOLVED'
      })
      continue
    }
    for (const [pattern, targets] of Object.entries(options.paths ?? {})) {
      // Same limits TypeScript enforces (TS5061, TS5062, TS5066): an alias it
      // would reject is never used to resolve an edge.
      if (
        !Array.isArray(targets) ||
        targets.length === 0 ||
        targets.some(
          (target) => typeof target !== 'string' || wildcardCount(target) > 1
        ) ||
        wildcardCount(pattern) > 1
      ) {
        gaps.push({
          code: 'TSCONFIG_PATHS_INVALID',
          path: configFile.path,
          pattern,
          status: 'UNRESOLVED'
        })
        continue
      }
      aliases.push({
        pattern,
        targets,
        basePath,
        configPath: configFile.path,
        ownerPath: owner?.path ?? null
      })
    }
    const extendsValues = Array.isArray(config.extends)
      ? config.extends
      : config.extends
        ? [config.extends]
        : []
    for (const extension of extendsValues) {
      if (typeof extension !== 'string' || !extension.startsWith('.')) {
        gaps.push({
          code: 'TSCONFIG_EXTENDS_EXTERNAL_OR_UNSUPPORTED',
          path: configFile.path,
          status: 'UNRESOLVED'
        })
        continue
      }
      let extended = path.resolve(
        path.dirname(configFile.absolutePath),
        extension
      )
      if (!path.extname(extended)) extended += '.json'
      if (
        !isWithin(root, extended) ||
        !lstatMaybe(extended) ||
        hasSymlinkInPath(root, extended).unsafe
      ) {
        gaps.push({
          code: 'TSCONFIG_EXTENDS_UNRESOLVED',
          path: configFile.path,
          extends: extension,
          status: 'UNRESOLVED'
        })
      }
    }
  }
  return { aliases, projectReferenceConfigs }
}

function getDeclaredCategories(manifest, targetName) {
  const categories = []
  for (const category of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies'
  ]) {
    if (Object.hasOwn(manifest?.[category] ?? {}, targetName))
      categories.push(category)
  }
  return categories.sort()
}

function classifyManifestDeclaration(
  sourceRole,
  importUsage,
  categories,
  policy
) {
  if (categories.length > 1)
    return { status: 'VIOLATION', reason: 'CONFLICTING_MANIFEST_CATEGORIES' }
  const relation =
    sourceRole === 'PRODUCTION' && importUsage === 'TYPE_ONLY'
      ? 'PRODUCTION_TYPE_ONLY'
      : sourceRole === 'PRODUCTION' && importUsage === 'MIXED'
        ? 'PRODUCTION_MIXED'
        : sourceRole === 'PRODUCTION'
          ? 'PRODUCTION_RUNTIME'
          : sourceRole === 'TEST'
            ? 'TEST_ONLY'
            : sourceRole === 'BUILD_ONLY'
              ? 'BUILD_ONLY'
              : null
  if (!relation)
    return { status: 'UNRESOLVED', reason: 'SOURCE_ROLE_UNRESOLVED' }
  if (relation === 'PRODUCTION_TYPE_ONLY') {
    if (categories.includes('dependencies'))
      return { status: 'DECLARED_RUNTIME_SAFE', reason: null }
    if (categories.includes('devDependencies'))
      return {
        status: 'UNRESOLVED',
        reason: 'PUBLIC_DECLARATION_ESCAPE_NOT_PROVEN'
      }
    return {
      status: 'UNRESOLVED',
      reason: 'TYPE_ONLY_EDGE_DECLARATION_NOT_PROVEN'
    }
  }
  const expectedCategories = policy.dependencyCategoryRules?.[relation] ?? []
  if (categories.some((category) => expectedCategories.includes(category))) {
    return { status: 'DECLARED', reason: null }
  }
  if (categories.length === 0)
    return { status: 'VIOLATION', reason: 'MISSING_DIRECT_DEPENDENCY' }
  return { status: 'VIOLATION', reason: 'DEPENDENCY_CATEGORY_MISMATCH' }
}

function moduleReferenceClassification(sourceRole, importUsage) {
  if (sourceRole === 'UNRESOLVED') return 'UNRESOLVED'
  if (sourceRole === 'TEST') return 'TEST_ONLY'
  if (sourceRole === 'BUILD_ONLY') return 'BUILD_ONLY'
  if (sourceRole === 'PRODUCTION' && importUsage === 'TYPE_ONLY')
    return 'PRODUCTION_TYPE_ONLY'
  if (sourceRole === 'PRODUCTION' && importUsage === 'MIXED')
    return 'PRODUCTION_MIXED'
  if (sourceRole === 'PRODUCTION') return 'PRODUCTION_RUNTIME'
  return 'UNRESOLVED'
}

function sourceFilesForOwners(root, owners, policy, gaps) {
  const byOwner = new Map()
  const fileInventory = []
  const excludedDirectories = policy.fileDiscovery.excludedDirectories
  const extensionSet = new Set(policy.fileDiscovery.sourceExtensions)
  for (const owner of owners) {
    owner.absolutePath = path.resolve(root, owner.path)
    const walked = walkFiles(root, owner.path, {
      excludedDirectories,
      includeFile: (relative) =>
        extensionSet.has(path.extname(relative).toLowerCase())
    })
    for (const error of walked.errors) {
      gaps.push({ ...error, owner: owner.name, status: 'UNRESOLVED' })
    }
    for (const symlink of walked.symlinks) {
      gaps.push({
        code: 'OWNER_SYMLINK_NOT_FOLLOWED',
        owner: owner.name,
        path: `${owner.path}/${symlink.path}`,
        target: symlink.target,
        status: 'UNRESOLVED'
      })
    }
    const files = walked.files
      .map((file) => {
        const role = matchSourceRole(file.relativePath, policy)
        const inventoryItem = {
          path: `${owner.path}/${toPosix(file.relativePath)}`,
          owner: owner.name,
          ownerPath: owner.path,
          role: role.role,
          roleRule: role.ruleId,
          extension: path.extname(file.relativePath).toLowerCase(),
          sizeBytes: fs.statSync(file.absolutePath).size
        }
        fileInventory.push(inventoryItem)
        return { ...file, ...inventoryItem }
      })
      .sort((left, right) => compareText(left.path, right.path))
    byOwner.set(owner.path, files)
    owner.excludedDirectoryCounts = Object.fromEntries(
      [...walked.excluded.entries()].sort(([a], [b]) => compareText(a, b))
    )
  }
  return {
    byOwner,
    fileInventory: fileInventory.sort((left, right) =>
      compareText(left.path, right.path)
    )
  }
}

function locationOf(filePath, reference) {
  return { path: filePath, line: reference.line, column: reference.column }
}

function collectImportEdges(
  root,
  owners,
  sourceFileInventory,
  aliases,
  policy,
  gaps
) {
  const grouped = new Map()
  let externalReferenceCount = 0
  let unresolvedReferenceCount = 0
  let parserDiagnosticCount = 0
  for (const owner of owners) {
    const sourceFiles = sourceFileInventory.byOwner.get(owner.path) ?? []
    for (const source of sourceFiles) {
      let sourceText
      try {
        sourceText = fs.readFileSync(source.absolutePath, 'utf8')
      } catch (error) {
        gaps.push({
          code: 'SOURCE_UNREADABLE',
          owner: owner.name,
          path: source.path,
          reason: error.message,
          status: 'UNRESOLVED'
        })
        continue
      }
      const parsed = extractModuleReferences(sourceText, source.absolutePath)
      if (parsed.diagnostics.length > 0) {
        parserDiagnosticCount += parsed.diagnostics.length
        for (const diagnostic of parsed.diagnostics) {
          gaps.push({
            code: 'SOURCE_PARSE_ERROR',
            owner: owner.name,
            path: source.path,
            ...diagnostic,
            status: 'UNRESOLVED'
          })
        }
      }
      for (const reference of parsed.references) {
        const sourceRole = source.role
        const classification = moduleReferenceClassification(
          sourceRole,
          reference.importUsage
        )
        if (reference.unresolvedReason) {
          unresolvedReferenceCount += 1
          addGroupedEdge(grouped, {
            owner,
            source,
            target: null,
            reference,
            sourceRole,
            classification,
            manifest: {
              categories: [],
              status: 'UNRESOLVED',
              reason: reference.unresolvedReason
            },
            resolution: reference.unresolvedReason
          })
          continue
        }
        const resolved = resolveWorkspaceTarget(
          root,
          owners,
          aliases,
          owner,
          source.absolutePath,
          reference.specifier
        )
        if (!resolved.target) {
          if (
            resolved.resolution === 'EXTERNAL_OR_UNMAPPED' ||
            resolved.resolution === 'OUTSIDE_WORKSPACE' ||
            resolved.resolution === 'SAME_OWNER' ||
            resolved.resolution === 'SAME_OWNER_ALIAS'
          ) {
            externalReferenceCount += resolved.resolution.startsWith(
              'SAME_OWNER'
            )
              ? 0
              : 1
            continue
          }
          unresolvedReferenceCount += 1
          addGroupedEdge(grouped, {
            owner,
            source,
            target: null,
            reference,
            sourceRole,
            classification: 'UNRESOLVED',
            manifest: {
              categories: [],
              status: 'UNRESOLVED',
              reason: resolved.resolution
            },
            resolution: resolved.resolution
          })
          continue
        }
        if (
          resolved.resolution === 'MISSING_RELATIVE_TARGET' ||
          resolved.resolution === 'MISSING_ALIAS_TARGET'
        ) {
          unresolvedReferenceCount += 1
          addGroupedEdge(grouped, {
            owner,
            source,
            target: resolved.target,
            reference,
            sourceRole,
            classification: 'UNRESOLVED',
            manifest: {
              categories: [],
              status: 'UNRESOLVED',
              reason: resolved.resolution
            },
            resolution: resolved.resolution
          })
          continue
        }
        const categories = getDeclaredCategories(
          owner.manifest,
          resolved.target.name
        )
        const manifest = classifyManifestDeclaration(
          sourceRole,
          reference.importUsage,
          categories,
          policy
        )
        if (manifest.status === 'UNRESOLVED') unresolvedReferenceCount += 1
        addGroupedEdge(grouped, {
          owner,
          source,
          target: resolved.target,
          reference,
          sourceRole,
          classification,
          manifest: { ...manifest, categories },
          resolution: resolved.resolution
        })
      }
    }
  }
  const edges = [...grouped.values()]
    .map((edge) => ({
      owner: { name: edge.owner.name, path: edge.owner.path },
      target: edge.target
        ? { name: edge.target.name, path: edge.target.path }
        : null,
      sourceRole: edge.sourceRole,
      classification: edge.classification,
      importKind: edge.importKind,
      importUsage: edge.importUsage,
      manifest: edge.manifest,
      resolutionMethods: [...edge.resolutionMethods].sort(),
      moduleSpecifiers: [...edge.moduleSpecifiers].sort(),
      locations: edge.locations.sort(
        (left, right) =>
          compareText(left.path, right.path) ||
          left.line - right.line ||
          left.column - right.column
      )
    }))
    .sort(
      (left, right) =>
        compareText(left.owner.path, right.owner.path) ||
        compareText(left.target?.path ?? '', right.target?.path ?? '') ||
        compareText(left.classification, right.classification) ||
        compareText(left.importKind, right.importKind) ||
        compareText(left.importUsage, right.importUsage)
    )
  return {
    edges,
    externalReferenceCount,
    unresolvedReferenceCount,
    parserDiagnosticCount
  }
}

function addGroupedEdge(grouped, item) {
  const key = stableStringify({
    ownerPath: item.owner.path,
    targetPath: item.target?.path ?? null,
    sourceRole: item.sourceRole,
    classification: item.classification,
    importKind: item.reference.importKind,
    importUsage: item.reference.importUsage,
    manifest: item.manifest
  })
  const current = grouped.get(key) ?? {
    owner: item.owner,
    target: item.target,
    sourceRole: item.sourceRole,
    classification: item.classification,
    importKind: item.reference.importKind,
    importUsage: item.reference.importUsage,
    manifest: item.manifest,
    resolutionMethods: new Set(),
    moduleSpecifiers: new Set(),
    locations: []
  }
  current.resolutionMethods.add(item.resolution)
  if (item.reference.specifier !== null)
    current.moduleSpecifiers.add(item.reference.specifier)
  current.locations.push(locationOf(item.source.path, item.reference))
  grouped.set(key, current)
}

function reconcileTestEdgesWithProductionDependencies(edges) {
  const productionDeclaredPairs = new Set(
    edges
      .filter(
        (edge) =>
          edge.sourceRole === 'PRODUCTION' &&
          edge.manifest.categories.length === 1 &&
          edge.manifest.categories[0] === 'dependencies' &&
          ((['PRODUCTION_RUNTIME', 'PRODUCTION_MIXED'].includes(
            edge.classification
          ) &&
            edge.manifest.status === 'DECLARED') ||
            (edge.classification === 'PRODUCTION_TYPE_ONLY' &&
              edge.manifest.status === 'DECLARED_RUNTIME_SAFE'))
      )
      .map((edge) => `${edge.owner.path}\u0000${edge.target?.path ?? ''}`)
  )

  return edges.map((edge) => {
    const pair = `${edge.owner.path}\u0000${edge.target?.path ?? ''}`
    if (
      edge.sourceRole !== 'TEST' ||
      edge.manifest.status !== 'VIOLATION' ||
      edge.manifest.reason !== 'DEPENDENCY_CATEGORY_MISMATCH' ||
      edge.manifest.categories.length !== 1 ||
      edge.manifest.categories[0] !== 'dependencies' ||
      !productionDeclaredPairs.has(pair)
    ) {
      return edge
    }
    return {
      ...edge,
      manifest: {
        ...edge.manifest,
        status: 'DECLARED',
        reason: null,
        declarationBasis: 'SHARED_PRODUCTION_DEPENDENCY'
      }
    }
  })
}

function collectProjectReferences(root, owners, projectReferenceConfigs) {
  const references = []
  for (const entry of projectReferenceConfigs) {
    const rawReferences = Array.isArray(entry.config.references)
      ? entry.config.references
      : []
    for (const reference of rawReferences) {
      if (!reference || typeof reference.path !== 'string') {
        references.push({
          sourceOwner: entry.owner
            ? { name: entry.owner.name, path: entry.owner.path }
            : null,
          configPath: entry.configFile.path,
          target: null,
          status: 'UNRESOLVED',
          requiredness: 'UNDECIDED',
          reason: 'INVALID_PROJECT_REFERENCE'
        })
        continue
      }
      const absoluteTargetPath = path.resolve(
        path.dirname(entry.configFile.absolutePath),
        reference.path
      )
      const targetOwner = ownerForPath(owners, absoluteTargetPath)
      references.push({
        sourceOwner: entry.owner
          ? { name: entry.owner.name, path: entry.owner.path }
          : null,
        configPath: entry.configFile.path,
        target: targetOwner
          ? { name: targetOwner.name, path: targetOwner.path }
          : null,
        targetPath: isWithin(root, absoluteTargetPath)
          ? relativePath(root, absoluteTargetPath)
          : null,
        status: targetOwner ? 'OBSERVED' : 'UNRESOLVED',
        requiredness: 'UNDECIDED',
        reason: targetOwner
          ? null
          : 'REFERENCE_TARGET_NOT_MAPPED_TO_WORKSPACE_OWNER'
      })
    }
  }
  return references.sort(
    (left, right) =>
      compareText(
        left.sourceOwner?.path ?? '',
        right.sourceOwner?.path ?? ''
      ) ||
      compareText(left.configPath, right.configPath) ||
      compareText(
        left.target?.path ?? left.targetPath ?? '',
        right.target?.path ?? right.targetPath ?? ''
      )
  )
}

function parseBuildScripts(root, rootManifest, owners) {
  const scripts = []
  const manifests = [
    { owner: null, manifest: rootManifest, path: 'package.json' },
    ...owners
      .filter((owner) => owner.manifest)
      .map((owner) => ({
        owner,
        manifest: owner.manifest,
        path: owner.manifestPath
      }))
  ]
  for (const entry of manifests) {
    for (const [scriptName, command] of Object.entries(
      entry.manifest.scripts ?? {}
    )) {
      if (!/build|compile/iu.test(scriptName)) continue
      if (typeof command !== 'string') {
        scripts.push({
          manifestPath: entry.path,
          owner: entry.owner
            ? { name: entry.owner.name, path: entry.owner.path }
            : null,
          scriptName,
          status: 'UNRESOLVED',
          commandShape: 'NON_STRING_SCRIPT',
          targets: []
        })
        continue
      }
      const directBuild = command
        .trim()
        .match(/^tsc(?:\.cmd)?\s+-b(?:\s+(.+))?$/u)
      if (directBuild) {
        const targetTokens = (directBuild[1] ?? '')
          .trim()
          .split(/\s+/u)
          .filter(Boolean)
        const targets = targetTokens
          .filter((token) => !token.startsWith('-'))
          .map((token) => {
            const absolute = path.resolve(root, token)
            const owner = ownerForPath(owners, absolute)
            return {
              path: isWithin(root, absolute)
                ? relativePath(root, absolute)
                : null,
              owner: owner ? { name: owner.name, path: owner.path } : null,
              status: owner ? 'OBSERVED' : 'UNRESOLVED'
            }
          })
        scripts.push({
          manifestPath: entry.path,
          owner: entry.owner
            ? { name: entry.owner.name, path: entry.owner.path }
            : null,
          scriptName,
          status:
            targets.length > 0 &&
            targets.every((target) => target.status === 'OBSERVED')
              ? 'OBSERVED'
              : 'UNRESOLVED',
          commandShape: 'DIRECT_TSC_BUILD',
          targets
        })
        continue
      }
      scripts.push({
        manifestPath: entry.path,
        owner: entry.owner
          ? { name: entry.owner.name, path: entry.owner.path }
          : null,
        scriptName,
        status: 'UNRESOLVED',
        commandShape: 'UNRECOGNIZED_BUILD_COMMAND',
        targets: []
      })
    }
  }
  return scripts.sort(
    (left, right) =>
      compareText(left.manifestPath, right.manifestPath) ||
      compareText(left.scriptName, right.scriptName)
  )
}

function summarizeOwners(owners, sourceFileInventory, policy) {
  return owners.map((owner) => {
    const sources = sourceFileInventory.byOwner.get(owner.path) ?? []
    const counts = { PRODUCTION: 0, TEST: 0, BUILD_ONLY: 0, UNRESOLVED: 0 }
    for (const source of sources)
      counts[source.role] = (counts[source.role] ?? 0) + 1
    const publicDecision = policy.publicCompatibilityCandidates[owner.name] ?? {
      status: policy.ownerDefaults.publicCompatibilityStatus
    }
    return {
      name: owner.name,
      path: owner.path,
      manifestPath: owner.manifestPath,
      ownerRole: policy.ownerDefaults.ownerRole,
      publicCompatibilityStatus: publicDecision.status,
      publicCompatibilityEvidence:
        publicDecision.status === 'PUBLIC_CANDIDATE'
          ? 'CANDIDATE_ONLY; consumer compatibility was not evaluated in M07-S1'
          : 'UNKNOWN',
      projectReferenceRequiredness:
        policy.ownerDefaults.projectReferenceRequiredness,
      sourceFileCount: sources.length,
      sourceRoleCounts: counts,
      excludedDirectoryCounts: owner.excludedDirectoryCounts ?? {},
      excludedDirectoryRules: [
        ...policy.fileDiscovery.excludedDirectories
      ].sort(compareText),
      exportsObserved: owner.manifest?.exports ?? null,
      scriptsObserved: Object.keys(owner.manifest?.scripts ?? {}).sort()
    }
  })
}

function currentCandidateInputs(root, baseline, policy) {
  const paths = new Map()
  for (const entry of baseline?.candidate_input_manifest ?? []) {
    paths.set(entry.path, entry.kind)
  }
  const add = (relative, kind) => {
    if (!paths.has(relative)) paths.set(relative, kind)
  }
  const excluded = policy.fileDiscovery.excludedDirectories
  for (const workspaceRoot of ['apps', 'packages']) {
    const walked = walkFiles(root, workspaceRoot, {
      excludedDirectories: excluded,
      includeFile: (relative) =>
        CODE_EXTENSIONS.has(path.extname(relative).toLowerCase()) ||
        path.basename(relative) === 'package.json' ||
        /^tsconfig.*\.json$/u.test(path.basename(relative))
    })
    for (const file of walked.files) {
      const relative = relativePath(root, file.absolutePath)
      const kind =
        path.basename(relative) === 'package.json'
          ? 'workspace-manifest+workspace-source-or-config'
          : 'workspace-source-or-config'
      add(relative, kind)
    }
    for (const symlink of walked.symlinks) {
      add(`${workspaceRoot}/${symlink.path}`, 'unresolved-symlink-input')
    }
  }
  for (const sourceRoot of ['scripts', 'tests', 'config']) {
    if (!lstatMaybe(path.resolve(root, sourceRoot))) continue
    const extSet =
      sourceRoot === 'tests' ? ROOT_TEST_EXTENSIONS : CODE_EXTENSIONS
    const walked = walkFiles(root, sourceRoot, {
      excludedDirectories: excluded,
      includeFile: (relative) =>
        extSet.has(path.extname(relative).toLowerCase()) ||
        (sourceRoot === 'config' &&
          path.extname(relative).toLowerCase() === '.json')
    })
    for (const file of walked.files) {
      const relative = relativePath(root, file.absolutePath)
      const kind =
        sourceRoot === 'scripts'
          ? 'root-script-source'
          : sourceRoot === 'tests'
            ? 'root-test-input'
            : relative === 'config/workspace-dependency-policy.json'
              ? 'root-policy-input'
              : 'root-tool-configuration'
      add(relative, kind)
    }
    for (const symlink of walked.symlinks) {
      add(`${sourceRoot}/${symlink.path}`, 'unresolved-symlink-input')
    }
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    if (
      entry.name === '.nvmrc' ||
      entry.name === '.npmrc' ||
      entry.name === 'package.json' ||
      entry.name === 'package-lock.json'
    ) {
      add(
        entry.name,
        entry.name === 'package.json'
          ? 'root-package-manifest'
          : 'root-package-manager-input'
      )
    }
    if (
      /^(?:tsconfig.*\.json|eslint\.config\.[^/]+|vite\.config\.[^/]+|vitest\.config\.[^/]+)$/u.test(
        entry.name
      )
    ) {
      add(entry.name, 'root-tool-configuration')
    }
  }
  if (lstatMaybe(path.resolve(root, 'AGENTS.md')))
    add('AGENTS.md', 'governance-input')
  for (const approvedPath of policy.candidateBinding.approvedAdditionalPaths) {
    if (approvedPath.startsWith('config/'))
      add(approvedPath, 'root-policy-input')
    else if (approvedPath.startsWith('scripts/'))
      add(approvedPath, 'root-script-source')
    else if (approvedPath.startsWith('tests/'))
      add(approvedPath, 'root-test-input')
  }
  return [...paths.entries()]
    .map(([relative, kind]) => ({ path: relative, kind }))
    .sort((left, right) => compareText(left.path, right.path))
}

function fingerprintInputTuple(root, entry) {
  const absolutePath = path.resolve(root, entry.path)
  const unsafeParent = hasSymlinkInPath(root, path.dirname(absolutePath))
  if (unsafeParent.unsafe) {
    return {
      tuple: {
        path: entry.path,
        kind: entry.kind,
        file_type: 'symlink-parent',
        size_bytes: null,
        sha256: null
      },
      exists: true
    }
  }
  const stat = lstatMaybe(absolutePath)
  if (!stat) {
    return {
      tuple: {
        path: entry.path,
        kind: entry.kind,
        file_type: 'missing',
        size_bytes: null,
        sha256: null
      },
      exists: false
    }
  }
  if (stat.isSymbolicLink()) {
    return {
      tuple: {
        path: entry.path,
        kind: entry.kind,
        file_type: 'symlink',
        size_bytes: null,
        sha256: null,
        symlink_target: safeReadlink(absolutePath)
      },
      exists: true
    }
  }
  if (!stat.isFile()) {
    return {
      tuple: {
        path: entry.path,
        kind: entry.kind,
        file_type: stat.isDirectory() ? 'directory' : 'other',
        size_bytes: null,
        sha256: null
      },
      exists: true
    }
  }
  return {
    tuple: {
      path: entry.path,
      kind: entry.kind,
      file_type: 'file',
      size_bytes: stat.size,
      sha256: hashFile(absolutePath)
    },
    exists: true
  }
}

function readNpmVersionFile(root, filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('npm version file path is required for an R1 candidate')
  }
  const absolutePath = assertRegularFileWithinRoot(root, filePath)
  const contents = fs.readFileSync(absolutePath, 'utf8')
  const version = contents.trim()
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:[-+][0-9A-Za-z.-]+)?$/u.test(version)) {
    throw new Error(
      'npm version file must contain exactly one semantic version'
    )
  }
  return {
    path: relativePath(root, absolutePath),
    version,
    sha256: hashFile(absolutePath)
  }
}

function createCandidateManifest(root, policy, options = {}) {
  const rootPackage = readJson(
    assertRegularFileWithinRoot(root, 'package.json')
  )
  let baseline = options.baselineManifest ?? null
  if (baseline === undefined) baseline = null
  let baselinePath = null
  let baselineHash = null
  if (
    options.useConfiguredBaseline !== false &&
    baseline === null &&
    policy.candidateBinding.baselineManifestPath
  ) {
    baselinePath = policy.candidateBinding.baselineManifestPath
    const absoluteBaseline = assertRegularFileWithinRoot(root, baselinePath)
    baselineHash = hashFile(absoluteBaseline)
    if (baselineHash !== policy.candidateBinding.baselineManifestSha256) {
      throw new Error(
        `candidate baseline artifact hash mismatch: ${baselinePath}`
      )
    }
    baseline = readJson(absoluteBaseline)
  } else if (baseline) {
    baselinePath =
      options.baselinePath ??
      policy.candidateBinding.baselineManifestPath ??
      null
    baselineHash =
      baselinePath && lstatMaybe(path.resolve(root, baselinePath))
        ? hashFile(path.resolve(root, baselinePath))
        : null
  }
  const npmVersionFilePath = Object.hasOwn(options, 'npmVersionFilePath')
    ? options.npmVersionFilePath
    : (policy.candidateBinding.npmVersionFilePath ?? null)
  const npmVersionFile = npmVersionFilePath
    ? readNpmVersionFile(root, npmVersionFilePath)
    : null
  const inputFiles = currentCandidateInputs(root, baseline, policy)
  const tuples = inputFiles.map((entry) => fingerprintInputTuple(root, entry))
  const inputManifest = tuples
    .map((result) => result.tuple)
    .sort((left, right) => compareText(left.path, right.path))
  const baselineEntries = new Map(
    (baseline?.candidate_input_manifest ?? []).map((entry) => [
      entry.path,
      entry
    ])
  )
  const candidateEntries = new Map(
    inputManifest.map((entry) => [entry.path, entry])
  )
  const drift = []
  for (const [relative, prior] of baselineEntries) {
    const current = candidateEntries.get(relative)
    if (!current || current.file_type === 'missing') {
      drift.push({ path: relative, status: 'REMOVED_BASELINE_INPUT' })
      continue
    }
    if (
      current.file_type !== prior.file_type ||
      current.size_bytes !== prior.size_bytes ||
      current.sha256 !== prior.sha256 ||
      (prior.symlink_target && current.symlink_target !== prior.symlink_target)
    ) {
      drift.push({ path: relative, status: 'MODIFIED_BASELINE_INPUT' })
    }
  }
  const baselinePaths = new Set(baselineEntries.keys())
  const approvedAdditionalPaths = new Set(
    policy.candidateBinding.approvedAdditionalPaths
  )
  if (baseline) {
    for (const current of inputManifest) {
      if (baselinePaths.has(current.path) || current.file_type === 'missing')
        continue
      if (!approvedAdditionalPaths.has(current.path)) {
        drift.push({ path: current.path, status: 'UNAPPROVED_ADDITION' })
      }
    }
  }
  const owners = expandWorkspaceOwners(root, rootPackage, policy, [])
  const fingerprintOwners = owners
    .map((owner) => ({
      path: owner.path,
      name: owner.name,
      manifest: owner.manifestPath
    }))
    .sort((left, right) => compareText(left.path, right.path))
  const expectedOwners = baseline?.fingerprint_basis?.owners
  if (
    expectedOwners &&
    stableStringify(fingerprintOwners) !== stableStringify(expectedOwners)
  ) {
    drift.push({
      path: 'apps/*,packages/*',
      status: 'WORKSPACE_OWNER_SET_CHANGED'
    })
  }
  const plannedPaths =
    baseline?.fingerprint_basis?.planned_m07_s1_paths ??
    policy.candidateBinding.approvedAdditionalPaths.map((relative) => ({
      path: relative,
      baseline_state: 'ABSENT_PLANNED'
    }))
  const inventoryRules = baseline?.fingerprint_basis?.inventory_rules ?? {
    workspace_code_extensions: [
      ...policy.candidateBinding.fingerprintInventoryRules
        .workspaceCodeExtensions
    ].sort(),
    workspace_generated_directories_excluded: [
      ...policy.candidateBinding.fingerprintInventoryRules
        .workspaceGeneratedDirectoriesExcluded
    ].sort(),
    root_test_extensions: [
      ...policy.candidateBinding.fingerprintInventoryRules.rootTestExtensions
    ].sort(),
    paths_included: [
      ...policy.candidateBinding.fingerprintInventoryRules.pathsIncluded
    ].sort()
  }
  const inputTuples = inputManifest.map((entry) => ({
    path: entry.path,
    kind: entry.kind,
    file_type: entry.file_type,
    size_bytes: entry.size_bytes,
    sha256: entry.sha256,
    ...(entry.symlink_target ? { symlink_target: entry.symlink_target } : {})
  }))
  const toolchain = {
    node: process.version,
    typescript: ts.version,
    npm: npmVersionFile?.version ?? baseline?.environment_observed?.npm ?? null
  }
  const fingerprintBasis = {
    schema_version: 1,
    repository_head: baseline?.git_head ?? null,
    workspace_patterns: [...rootPackage.workspaces].sort(),
    owners: fingerprintOwners,
    planned_m07_s1_paths: plannedPaths,
    approved_r1_delta_paths: [
      ...policy.candidateBinding.approvedAdditionalPaths
    ].sort(compareText),
    inventory_rules: inventoryRules,
    toolchain,
    npm_version_file: npmVersionFile
      ? { path: npmVersionFile.path, sha256: npmVersionFile.sha256 }
      : null,
    inputs: inputTuples
  }
  const fingerprint = sha256(
    Buffer.from(stableStringify(fingerprintBasis), 'utf8')
  )
  return {
    schema_version: 1,
    artifact_role: 'POST_IMPLEMENTATION_EXECUTION_CANDIDATE',
    repository_root: root,
    git_head_baseline: baseline?.git_head ?? null,
    candidate_fingerprint_algorithm:
      'sha256(stableStringify(fingerprint_basis)); canonical key ordering and ordered path tuples',
    candidate_fingerprint_sha256: fingerprint,
    baseline: baseline
      ? {
          path: baselinePath,
          artifact_sha256: baselineHash,
          candidate_fingerprint_sha256: baseline.candidate_fingerprint_sha256,
          input_count: baseline.candidate_input_manifest.length,
          status:
            drift.length === 0
              ? 'MATCHES_EXCEPT_APPROVED_M07_ADDITIONS'
              : 'STALE'
        }
      : { status: 'SYNTHETIC_NO_BASELINE' },
    toolchain,
    npm_version_file: npmVersionFile,
    workspace_summary: {
      patterns: [...rootPackage.workspaces].sort(),
      owner_count: fingerprintOwners.length,
      owners: fingerprintOwners,
      hashed_input_count: inputManifest.length
    },
    approved_additions: [...approvedAdditionalPaths].sort().map((relative) => ({
      path: relative,
      present: inputManifest.some(
        (entry) => entry.path === relative && entry.file_type === 'file'
      ),
      sha256:
        inputManifest.find((entry) => entry.path === relative)?.sha256 ?? null
    })),
    baseline_delta: drift.sort(
      (left, right) =>
        compareText(left.path, right.path) ||
        compareText(left.status, right.status)
    ),
    stale: drift.length > 0,
    candidate_input_manifest: inputManifest,
    fingerprint_basis: fingerprintBasis
  }
}

function validateExecutionCandidate(
  candidate,
  root,
  policy,
  npmVersionFilePath
) {
  const errors = []
  const expectedPaths = [
    ...policy.candidateBinding.approvedAdditionalPaths
  ].sort(compareText)
  if (process.version !== R1_NODE_VERSION)
    errors.push(`Node must be ${R1_NODE_VERSION}`)
  if (
    npmVersionFilePath !== C1L_NPM_VERSION_FILE ||
    policy.candidateBinding.npmVersionFilePath !== C1L_NPM_VERSION_FILE
  ) {
    errors.push('npm version evidence path differs from the approved C1L path')
  }
  const npmVersionFile = readNpmVersionFile(root, npmVersionFilePath)
  if (
    candidate.npm_version_file?.path !== npmVersionFile.path ||
    candidate.npm_version_file?.version !== npmVersionFile.version ||
    candidate.npm_version_file?.sha256 !== npmVersionFile.sha256
  ) {
    errors.push('npm version evidence differs from the candidate manifest')
  }
  if (
    candidate.toolchain?.node !== process.version ||
    candidate.toolchain?.typescript !== ts.version ||
    candidate.toolchain?.npm !== npmVersionFile.version
  ) {
    errors.push('candidate toolchain differs from the current local toolchain')
  }
  if (
    !candidate.fingerprint_basis ||
    typeof candidate.fingerprint_basis !== 'object' ||
    Array.isArray(candidate.fingerprint_basis)
  ) {
    errors.push('candidate fingerprint_basis is missing or invalid')
  } else {
    const recomputed = sha256(
      Buffer.from(stableStringify(candidate.fingerprint_basis), 'utf8')
    )
    if (candidate.candidate_fingerprint_sha256 !== recomputed) {
      errors.push(
        'candidate fingerprint does not match its serialized fingerprint_basis'
      )
    }
    if (
      stableStringify(candidate.fingerprint_basis.approved_r1_delta_paths) !==
      stableStringify(expectedPaths)
    ) {
      errors.push(
        'fingerprint_basis approved_r1_delta_paths differs from the four approved paths'
      )
    }
    if (
      candidate.fingerprint_basis.toolchain?.node !==
        candidate.toolchain?.node ||
      candidate.fingerprint_basis.toolchain?.typescript !==
        candidate.toolchain?.typescript ||
      candidate.fingerprint_basis.toolchain?.npm !== candidate.toolchain?.npm
    ) {
      errors.push(
        'fingerprint_basis toolchain differs from the candidate toolchain'
      )
    }
    if (
      stableStringify(candidate.fingerprint_basis.npm_version_file) !==
      stableStringify({
        path: npmVersionFile.path,
        sha256: npmVersionFile.sha256
      })
    ) {
      errors.push('fingerprint_basis does not bind the npm version file hash')
    }
  }

  const baselinePath = policy.candidateBinding.baselineManifestPath
  const baseline = readJson(assertRegularFileWithinRoot(root, baselinePath))
  const baselineEntries = new Map(
    baseline.candidate_input_manifest.map((entry) => [entry.path, entry])
  )
  const currentEntries = new Map(
    (candidate.candidate_input_manifest ?? []).map((entry) => [
      entry.path,
      entry
    ])
  )
  const baselineMismatches = baseline.candidate_input_manifest
    .filter((entry) => {
      const current = currentEntries.get(entry.path)
      return (
        !current ||
        current.file_type !== entry.file_type ||
        current.size_bytes !== entry.size_bytes ||
        current.sha256 !== entry.sha256 ||
        current.symlink_target !== entry.symlink_target
      )
    })
    .map((entry) => entry.path)
  const additions = [...currentEntries.values()]
    .filter(
      (entry) =>
        !baselineEntries.has(entry.path) && entry.file_type !== 'missing'
    )
    .map((entry) => entry.path)
    .sort(compareText)
  if (
    baseline.candidate_input_manifest.length !== 973 ||
    candidate.baseline?.input_count !== 973
  ) {
    errors.push('candidate baseline must contain exactly 973 inputs')
  }
  if (baselineMismatches.length > 0)
    errors.push(`baseline input drift: ${baselineMismatches.join(', ')}`)
  if (candidate.candidate_input_manifest?.length !== 977)
    errors.push('candidate must contain exactly 977 inputs')
  if (stableStringify(additions) !== stableStringify(expectedPaths)) {
    errors.push(
      `candidate additions differ from the four approved paths: ${additions.join(', ')}`
    )
  }
  if (
    candidate.baseline?.status !== 'MATCHES_EXCEPT_APPROVED_M07_ADDITIONS' ||
    candidate.stale !== false ||
    candidate.baseline_delta?.length !== 0
  ) {
    errors.push('candidate reports stale or changed baseline inputs')
  }
  if (candidate.workspace_summary?.owner_count !== 25)
    errors.push('candidate must contain exactly 25 workspace owners')
  const approvedAdditions = [...(candidate.approved_additions ?? [])].sort(
    (left, right) => compareText(left.path, right.path)
  )
  if (
    stableStringify(approvedAdditions.map((entry) => entry.path)) !==
      stableStringify(expectedPaths) ||
    approvedAdditions.some(
      (entry) => entry.present !== true || typeof entry.sha256 !== 'string'
    )
  ) {
    errors.push(
      'candidate approved_additions must contain the four present, hashed R1 paths'
    )
  }
  const expectedBasisInputs = (candidate.candidate_input_manifest ?? []).map(
    (entry) => ({
      path: entry.path,
      kind: entry.kind,
      file_type: entry.file_type,
      size_bytes: entry.size_bytes,
      sha256: entry.sha256,
      ...(entry.symlink_target ? { symlink_target: entry.symlink_target } : {})
    })
  )
  if (
    stableStringify(candidate.fingerprint_basis?.inputs) !==
    stableStringify(expectedBasisInputs)
  ) {
    errors.push('fingerprint_basis inputs differ from candidate_input_manifest')
  }
  if (errors.length > 0)
    throw new Error(`R1 candidate rejected: ${errors.join('; ')}`)
  return candidate
}

function createExecutionCandidate(root, policy, npmVersionFilePath) {
  const policyErrors = validatePolicy(policy)
  if (policyErrors.length > 0)
    throw new Error(`invalid policy: ${policyErrors.join('; ')}`)
  const candidate = createCandidateManifest(root, policy, {
    npmVersionFilePath
  })
  return validateExecutionCandidate(candidate, root, policy, npmVersionFilePath)
}

function verifyExecutionCandidate(
  root,
  policy,
  manifestPath,
  npmVersionFilePath
) {
  const manifestAbsolute = assertRegularFileWithinRoot(root, manifestPath)
  const persisted = readJson(manifestAbsolute)
  validateExecutionCandidate(persisted, root, policy, npmVersionFilePath)
  const current = createExecutionCandidate(root, policy, npmVersionFilePath)
  if (stableStringify(persisted) !== stableStringify(current)) {
    throw new Error(
      'persisted candidate differs from the current inputs or toolchain'
    )
  }
  return persisted
}

function policyDecisionForOwner(policy, owner) {
  return (
    policy.publicCompatibilityCandidates[owner.name] ?? {
      status: policy.ownerDefaults.publicCompatibilityStatus
    }
  )
}

function createReport(root, policy, options = {}) {
  const policyErrors = validatePolicy(policy, {
    allowSyntheticBinding: options.syntheticFixture === true
  })
  if (policyErrors.length > 0)
    throw new Error(`invalid policy: ${policyErrors.join('; ')}`)
  if (
    policy.candidateBinding.npmVersionFilePath &&
    process.version !== R1_NODE_VERSION
  ) {
    throw new Error(`M07-S1-R1 inventory requires Node ${R1_NODE_VERSION}`)
  }
  const policyPath =
    options.policyPath ?? 'config/workspace-dependency-policy.json'
  const policyAbsolute = path.resolve(root, policyPath)
  const policyHash = lstatMaybe(policyAbsolute)?.isFile()
    ? hashFile(policyAbsolute)
    : sha256(Buffer.from(stableStringify(policy)))
  const toolPath = options.toolPath ?? fileURLToPath(import.meta.url)
  const toolHash = lstatMaybe(toolPath)?.isFile() ? hashFile(toolPath) : null
  const rootManifest = readJson(
    assertRegularFileWithinRoot(root, 'package.json')
  )
  const baselineManifest =
    options.baselineManifest === undefined
      ? undefined
      : options.baselineManifest
  const candidateManifest = createCandidateManifest(root, policy, {
    baselineManifest,
    baselinePath: options.baselinePath,
    useConfiguredBaseline: options.useConfiguredBaseline !== false
  })
  const gaps = []
  const owners = expandWorkspaceOwners(root, rootManifest, policy, gaps)
  for (const owner of owners) {
    if (!owner.name) continue
    owner.absolutePath = path.resolve(root, owner.path)
  }
  const sourceFileInventory = sourceFilesForOwners(root, owners, policy, gaps)
  const configWalk = walkFiles(root, '.', {
    excludedDirectories: policy.fileDiscovery.excludedDirectories,
    includeFile: (relative) =>
      /^tsconfig.*\.json$/u.test(path.basename(relative))
  })
  for (const error of configWalk.errors) {
    if (error.code !== 'WALK_ROOT_MISSING')
      gaps.push({ ...error, status: 'UNRESOLVED' })
  }
  for (const symlink of configWalk.symlinks) {
    gaps.push({
      code: 'TSCONFIG_SYMLINK_NOT_FOLLOWED',
      path: symlink.path,
      target: symlink.target,
      status: 'UNRESOLVED'
    })
  }
  const tsconfigFiles = configWalk.files
    .map((file) => ({
      path: relativePath(root, file.absolutePath),
      absolutePath: file.absolutePath
    }))
    .sort((left, right) => compareText(left.path, right.path))
  const configInfo = readTsconfigPaths(root, owners, tsconfigFiles, gaps)
  const collectedImports = collectImportEdges(
    root,
    owners,
    sourceFileInventory,
    configInfo.aliases,
    policy,
    gaps
  )
  const imports = {
    ...collectedImports,
    edges: reconcileTestEdgesWithProductionDependencies(collectedImports.edges)
  }
  const projectReferences = collectProjectReferences(
    root,
    owners,
    configInfo.projectReferenceConfigs
  )
  const buildScripts = parseBuildScripts(root, rootManifest, owners)
  const violations = imports.edges.flatMap((edge) =>
    edge.manifest.status === 'VIOLATION'
      ? [
          {
            status: 'VIOLATION',
            code: edge.manifest.reason,
            owner: edge.owner,
            target: edge.target,
            sourceRole: edge.sourceRole,
            classification: edge.classification,
            locations: edge.locations
          }
        ]
      : []
  )
  for (const edge of imports.edges.filter(
    (item) =>
      item.classification === 'UNRESOLVED' ||
      item.manifest.status === 'UNRESOLVED'
  )) {
    violations.push({
      status: 'UNRESOLVED',
      code: edge.manifest.reason,
      owner: edge.owner,
      target: edge.target,
      sourceRole: edge.sourceRole,
      classification: edge.classification,
      locations: edge.locations
    })
  }
  const roleCounts = { PRODUCTION: 0, TEST: 0, BUILD_ONLY: 0, UNRESOLVED: 0 }
  for (const file of sourceFileInventory.fileInventory)
    roleCounts[file.role] = (roleCounts[file.role] ?? 0) + 1
  const coverageComplete =
    gaps.length === 0 &&
    !candidateManifest.stale &&
    candidateManifest.approved_additions.every((item) => item.present)
  const profile = options.profile ?? 'inventory'
  const publicDecisions = owners.map((owner) => ({
    packageName: owner.name,
    ownerPath: owner.path,
    status: policyDecisionForOwner(policy, owner).status,
    evaluation:
      policyDecisionForOwner(policy, owner).status === 'PUBLIC_CANDIDATE'
        ? 'NOT_EVALUATED_IN_M07_S1'
        : 'UNKNOWN'
  }))
  const findings = [
    ...violations,
    ...gaps.map((gap) => ({ status: 'UNRESOLVED', ...gap }))
  ]
  const normalizedView = {
    schemaVersion: 1,
    profile,
    policyVersion: policy.policyVersion,
    candidateFingerprint: candidateManifest.candidate_fingerprint_sha256,
    owners: summarizeOwners(owners, sourceFileInventory, policy),
    sourceFiles: sourceFileInventory.fileInventory,
    edges: imports.edges,
    projectReferences,
    buildScripts,
    publicDecisions,
    findings,
    coverage: { complete: coverageComplete, gaps },
    metrics: {
      ownerCount: owners.length,
      sourceFileCount: sourceFileInventory.fileInventory.length,
      scannedFileCount:
        sourceFileInventory.fileInventory.length -
        gaps.filter((gap) => gap.code === 'SOURCE_UNREADABLE').length,
      sourceRoleCounts: roleCounts,
      unresolvedSourceRoleCount: roleCounts.UNRESOLVED,
      edgeCount: imports.edges.length,
      externalReferenceCount: imports.externalReferenceCount,
      unresolvedReferenceCount: imports.unresolvedReferenceCount,
      unresolvedEdgeCount: imports.edges.filter(
        (edge) =>
          edge.classification === 'UNRESOLVED' ||
          edge.manifest.status === 'UNRESOLVED'
      ).length,
      parserDiagnosticCount: imports.parserDiagnosticCount,
      violationCount: violations.filter(
        (finding) => finding.status === 'VIOLATION'
      ).length,
      unresolvedFindingCount: findings.filter(
        (finding) => finding.status === 'UNRESOLVED'
      ).length,
      projectReferenceCount: projectReferences.length,
      undecidedProjectReferenceOwnerCount: owners.length,
      unknownOwnerRoleCount: owners.length,
      unknownPublicCompatibilityCount: publicDecisions.filter(
        (decision) => decision.status === 'UNKNOWN'
      ).length,
      publicCandidateNotEvaluatedCount: publicDecisions.filter(
        (decision) => decision.evaluation === 'NOT_EVALUATED_IN_M07_S1'
      ).length,
      buildScriptCount: buildScripts.length,
      exceptionCount: policy.exceptions.length,
      conformanceNumerator: null,
      conformanceDenominator: null
    },
    neutralBoundary: {
      status: policy.neutralBoundary.status,
      selectedProfile: profile,
      enforcement: 'NOT_EVALUATED_IN_M07_S1',
      allowedProductionEdges: policy.neutralBoundary.allowedProductionEdges,
      observedEdges: imports.edges.filter(
        (edge) =>
          Object.hasOwn(
            policy.neutralBoundary.allowedProductionEdges,
            edge.owner.name
          ) ||
          (edge.target &&
            Object.hasOwn(
              policy.neutralBoundary.allowedProductionEdges,
              edge.target.name
            ))
      ),
      exceptionCount: policy.exceptions.length
    },
    executedChecks: [{ name: 'workspace inventory', status: 'EXECUTED' }],
    unexecutedChecks: [
      { name: 'neutral-target enforcement', status: 'NOT_RUN' },
      { name: 'public package consumer compatibility', status: 'NOT_RUN' },
      { name: 'isolated workspace builds', status: 'NOT_RUN' },
      { name: 'full M07 acceptance', status: 'NOT_RUN' }
    ],
    limitations: [
      'No workspace package is imported or executed.',
      'Project-reference requiredness is UNDECIDED because no owner profile is approved.',
      'Public compatibility candidates are not consumer-tested in M07-S1.',
      'Unresolved relationships remain visible and are excluded from conformance counts.'
    ]
  }
  const normalizedDigest = sha256(
    Buffer.from(stableStringify(normalizedView), 'utf8')
  )
  const hasViolation = findings.some(
    (finding) => finding.status === 'VIOLATION'
  )
  const hasBlockingGap = !coverageComplete
  const exitCode = hasViolation
    ? EXIT.VIOLATION
    : hasBlockingGap
      ? EXIT.INCOMPLETE
      : EXIT.OK
  const report = {
    schemaVersion: 1,
    tool: {
      name: 'workspace-dependency-audit',
      version: 'M07-S1-1',
      sourcePath: relativePath(root, toolPath),
      sourceSha256: toolHash,
      nodeVersion: process.version,
      typescriptVersion: ts.version,
      npmVersion: candidateManifest.toolchain.npm
    },
    metadata: {
      workspaceRoot: '.',
      policyPath: toPosix(path.relative(root, policyAbsolute)),
      policySha256: policyHash,
      profile,
      format: options.format ?? 'json',
      generatedAtUtc: new Date().toISOString(),
      command: options.command ?? process.argv,
      outputPath: options.outputPath ? toPosix(options.outputPath) : null
    },
    policy,
    candidate: {
      fingerprint: candidateManifest.candidate_fingerprint_sha256,
      baselineStatus: candidateManifest.baseline.status,
      baselineFingerprint:
        candidateManifest.baseline.candidate_fingerprint_sha256 ?? null,
      stale: candidateManifest.stale,
      sourceCount: candidateManifest.candidate_input_manifest.length,
      approvedAdditionalPaths: candidateManifest.approved_additions,
      delta: candidateManifest.baseline_delta
    },
    report: normalizedView,
    normalizedReportSha256: normalizedDigest,
    result: {
      status:
        exitCode === EXIT.OK
          ? 'PASS'
          : exitCode === EXIT.VIOLATION
            ? 'VIOLATION'
            : 'UNRESOLVED',
      exitCode,
      inventoryComplete: coverageComplete,
      violations: findings.filter((finding) => finding.status === 'VIOLATION')
        .length,
      unresolved: findings.filter((finding) => finding.status === 'UNRESOLVED')
        .length
    }
  }
  return report
}

function renderMarkdown(report) {
  const metrics = report.report.metrics
  const lines = [
    '# Workspace dependency inventory',
    '',
    `- Result: **${report.result.status}** (exit ${report.result.exitCode})`,
    `- Candidate: \`${report.candidate.fingerprint}\``,
    `- Normalized report: \`${report.normalizedReportSha256}\``,
    `- Owners: ${metrics.ownerCount}`,
    `- Source files: ${metrics.sourceFileCount}`,
    `- Edges: ${metrics.edgeCount}`,
    `- Violations: ${metrics.violationCount}`,
    `- Unresolved findings: ${metrics.unresolvedFindingCount}`,
    '',
    '| Owner | Role | Files | Public compatibility |',
    '| --- | --- | ---: | --- |'
  ]
  for (const owner of report.report.owners) {
    lines.push(
      `| ${owner.name ?? 'UNKNOWN'} | ${owner.ownerRole} | ${owner.sourceFileCount} | ${owner.publicCompatibilityStatus} |`
    )
  }
  lines.push('', '## Findings', '')
  if (report.report.findings.length === 0) {
    lines.push(
      'No coverage gaps or proven manifest violations were found. Unresolved edge classifications remain listed in the JSON report.'
    )
  } else {
    lines.push(
      '| Status | Code | Owner | Target |',
      '| --- | --- | --- | --- |'
    )
    for (const finding of report.report.findings) {
      lines.push(
        `| ${finding.status} | ${finding.code ?? finding.reason ?? 'UNRESOLVED'} | ${finding.owner?.name ?? finding.owner ?? ''} | ${finding.target?.name ?? ''} |`
      )
    }
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

function parseCliArgs(argv) {
  const parsed = {
    policy: 'config/workspace-dependency-policy.json',
    profile: 'inventory',
    format: 'json',
    output: null,
    candidateOnly: false,
    verifyCandidate: null,
    npmVersionFile: null
  }
  const allowed = new Set([
    '--policy',
    '--profile',
    '--format',
    '--output',
    '--npm-version-file',
    '--verify-candidate'
  ])
  const seen = new Set()
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]
    if (key === '--candidate-only') {
      if (seen.has(key)) throw new Error(`duplicate option: ${key}`)
      seen.add(key)
      parsed.candidateOnly = true
      continue
    }
    if (!allowed.has(key)) throw new Error(`unknown option: ${key}`)
    if (seen.has(key)) throw new Error(`duplicate option: ${key}`)
    seen.add(key)
    const value = argv[index + 1]
    if (!value || value.startsWith('--'))
      throw new Error(`missing value for ${key}`)
    const names = {
      '--policy': 'policy',
      '--profile': 'profile',
      '--format': 'format',
      '--output': 'output',
      '--npm-version-file': 'npmVersionFile',
      '--verify-candidate': 'verifyCandidate'
    }
    const name = names[key]
    parsed[name] = value
    index += 1
  }
  if (parsed.candidateOnly && parsed.verifyCandidate) {
    throw new Error(
      '--candidate-only and --verify-candidate cannot be combined'
    )
  }
  if (parsed.verifyCandidate) {
    if (!parsed.npmVersionFile)
      throw new Error('--verify-candidate requires --npm-version-file')
    if (
      ['--policy', '--profile', '--format', '--output'].some((key) =>
        seen.has(key)
      )
    ) {
      throw new Error(
        '--verify-candidate accepts only the manifest and npm version file options'
      )
    }
    return parsed
  }
  if (parsed.candidateOnly) {
    if (!parsed.npmVersionFile || !parsed.output) {
      throw new Error(
        '--candidate-only requires --npm-version-file and --output'
      )
    }
    if (parsed.format !== 'json' || parsed.profile !== 'inventory') {
      throw new Error('--candidate-only writes only a JSON candidate manifest')
    }
  } else if (parsed.npmVersionFile) {
    throw new Error(
      '--npm-version-file is reserved for candidate creation and verification'
    )
  }
  if (
    !['inventory', 'neutral-target', 'full-acceptance'].includes(parsed.profile)
  ) {
    throw new Error(`invalid profile: ${parsed.profile}`)
  }
  if (!['json', 'markdown'].includes(parsed.format))
    throw new Error(`invalid format: ${parsed.format}`)
  if (parsed.profile !== 'inventory') {
    throw new Error(
      `${parsed.profile} is not authorized by M07-S1 implementation`
    )
  }
  return parsed
}

function validateOutputPath(root, outputPath) {
  if (!outputPath) return null
  if (
    path.isAbsolute(outputPath) ||
    outputPath.split(/[\\/]/u).includes('..')
  ) {
    throw new Error('output must be repository-relative and may not traverse')
  }
  const absolute = path.resolve(root, outputPath)
  if (!isWithin(root, absolute)) throw new Error('output escapes repository')
  const relative = toPosix(path.relative(root, absolute))
  const segments = relative.split('/')
  if (
    segments.length < 6 ||
    segments[0] !== 'docs' ||
    segments[1] !== '04_audit' ||
    segments[2] !== 'evidence' ||
    ![
      'M07-BUILD-S1',
      'M07-S1-R1',
      'M07-S1-R1-C1E',
      'M07-S1-C1F',
      'M07-S1-C1H',
      'M07-S1-C1I',
      'M07-S1-C1J',
      'M07-S1-C1L'
    ].includes(segments.at(-2)) ||
    !['.json', '.md'].includes(path.extname(absolute).toLowerCase())
  ) {
    throw new Error(
      'output must be a JSON or Markdown file in a repository M07 evidence directory'
    )
  }
  let current = root
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment)
    const stat = lstatMaybe(current)
    if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('output directory is missing or contains a symlink')
    }
  }
  const existing = lstatMaybe(absolute)
  if (existing && (!existing.isFile() || existing.isSymbolicLink())) {
    throw new Error('output target exists and is not a regular file')
  }
  return { absolute, relative }
}

function writeOutputAtomically(absolutePath, contents) {
  const directory = path.dirname(absolutePath)
  const temporary = path.join(
    directory,
    `.m07-audit-${process.pid}-${crypto.randomBytes(6).toString('hex')}.tmp`
  )
  let descriptor
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600)
    fs.writeFileSync(descriptor, contents, 'utf8')
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = undefined
    fs.renameSync(temporary, absolutePath)
  } catch (error) {
    if (descriptor !== undefined) fs.closeSync(descriptor)
    try {
      fs.unlinkSync(temporary)
    } catch {}
    throw error
  }
}

function loadPolicy(root, policyPath) {
  const absolute = assertRegularFileWithinRoot(root, policyPath)
  return readJson(absolute)
}

async function main(argv = process.argv.slice(2), root = process.cwd()) {
  let args
  try {
    args = parseCliArgs(argv)
    const policy = loadPolicy(root, args.policy)
    const policyErrors = validatePolicy(policy)
    if (policyErrors.length > 0)
      throw new Error(`invalid policy: ${policyErrors.join('; ')}`)
    if (
      !policy.candidateBinding.approvedAdditionalPaths.includes(args.policy)
    ) {
      throw new Error(
        'policy path is outside the approved M07-S1 candidate inputs'
      )
    }
    if (args.verifyCandidate) {
      const candidate = verifyExecutionCandidate(
        root,
        policy,
        args.verifyCandidate,
        args.npmVersionFile
      )
      process.stdout.write(
        `M07 candidate verified; fingerprint ${candidate.candidate_fingerprint_sha256}\n`
      )
      return EXIT.OK
    }
    if (args.candidateOnly) {
      const output = validateOutputPath(root, args.output)
      if (lstatMaybe(output.absolute))
        throw new Error('candidate output already exists')
      const candidate = createExecutionCandidate(
        root,
        policy,
        args.npmVersionFile
      )
      writeOutputAtomically(
        output.absolute,
        `${stableStringify(candidate, 2)}\n`
      )
      process.stdout.write(
        `M07 candidate ${candidate.candidate_fingerprint_sha256}; manifest ${output.relative}\n`
      )
      return EXIT.OK
    }
    const output = validateOutputPath(root, args.output)
    const report = createReport(root, policy, {
      policyPath: args.policy,
      profile: args.profile,
      format: args.format,
      outputPath: output?.relative ?? null,
      command: ['node', 'scripts/workspace-dependency-audit.mjs', ...argv],
      toolPath: fileURLToPath(import.meta.url)
    })
    const content =
      args.format === 'json'
        ? `${stableStringify(report, 2)}\n`
        : renderMarkdown(report)
    if (output) {
      writeOutputAtomically(output.absolute, content)
      process.stdout.write(
        `M07 inventory ${report.result.status}; candidate ${report.candidate.fingerprint}; report ${output.relative}\n`
      )
    } else {
      process.stdout.write(content)
    }
    return report.result.exitCode
  } catch (error) {
    process.stderr.write(`workspace-dependency-audit: ${error.message}\n`)
    return EXIT.INPUT
  }
}

export {
  EXIT,
  classifyManifestDeclaration,
  createCandidateManifest,
  createExecutionCandidate,
  createReport,
  extractModuleReferences,
  globToRegExp,
  main,
  matchSourceRole,
  parseCliArgs,
  resolveWorkspaceTarget,
  stableStringify,
  validateOutputPath,
  validatePolicy,
  verifyExecutionCandidate
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.exitCode = await main()
}
