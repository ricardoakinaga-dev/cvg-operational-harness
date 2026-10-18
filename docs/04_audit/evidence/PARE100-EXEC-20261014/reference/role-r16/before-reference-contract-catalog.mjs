#!/usr/bin/env node
// Static contract DATA only. No reference modules, generators or plugins are loaded.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

export const CATALOG_VERSION = 1
export const REFERENCE_PIN = '768fb1f3d3dcf9a16659ee354e927d05475f22dd'
export const REFERENCE_VERSION = '0.2.0-rc.1'
const unknown = (reason, extra = {}) => ({
  status: 'UNKNOWN',
  reason,
  ...extra
})
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
const identityVocabulary = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_$./:@~*-]{1,512}$/.test(value)
const opaqueLiteral = (value, reason) =>
  unknown(reason, {
    value_sha256: hash(value),
    byte_length: Buffer.byteLength(value, 'utf8')
  })
function projectIdentity(symbol, shape, opaque = false) {
  if (!opaque && identityVocabulary(symbol)) return { symbol, shape }
  const identity = opaqueLiteral(
    symbol,
    'Unclassified identity text; stable digest replaces literal bytes'
  )
  return {
    symbol: `opaque-symbol:${identity.value_sha256}`,
    shape:
      shape &&
      typeof shape === 'object' &&
      !Array.isArray(shape) &&
      !Object.hasOwn(shape, 'identity_projection')
        ? { ...shape, identity_projection: identity }
        : { contract: shape, identity_projection: identity }
  }
}
const packageIdentifier = (value) =>
  typeof value === 'string' &&
  value.length <= 214 &&
  /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i.test(value)
const ordered = (value) => {
  if (Array.isArray(value)) return value.map(ordered)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, ordered(value[key])])
    )
  }
  return value
}
export const serializeCatalog = (value) =>
  `${JSON.stringify(ordered(value), null, 2)}\n`
const json = (value) => JSON.stringify(ordered(value))
const hasUnknown = (value) =>
  !!value &&
  typeof value === 'object' &&
  (value.status === 'UNKNOWN' || Object.values(value).some(hasUnknown))
const fail = (code, message) => {
  throw new Error(`${code}: ${message}`)
}
const sensitive = (name) =>
  name
    .split('/')
    .some((part) =>
      /^(?:\.env(?:\..*)?|\.dsh|node_modules|\.git|auth(?:\.json|\.ya?ml)?|secrets?(?:\.json|\.ya?ml))$/i.test(
        part
      )
    )

function readJsonData(filename) {
  const resolved = path.resolve(filename)
  if (
    sensitive(resolved) ||
    !resolved.endsWith('.json') ||
    fs.realpathSync(resolved) !== resolved
  )
    fail('UNSAFE_JSON_INPUT', resolved)
  return JSON.parse(fs.readFileSync(resolved, 'utf8'))
}

function relativePath(name) {
  if (
    typeof name !== 'string' ||
    !name ||
    name.includes('\\') ||
    name.includes('\0') ||
    path.posix.isAbsolute(name) ||
    name.split('/').some((part) => !part || part === '.' || part === '..') ||
    sensitive(name)
  ) {
    fail('UNSAFE_PATH', String(name))
  }
  return name
}

// Check every ancestor before opening a file. Even in-root symlinks are refused:
// a literal tracked source path must identify its own source, never an alias.
function safeRead(root, name) {
  relativePath(name)
  let current = root
  for (const part of name.split('/')) {
    current = path.join(current, part)
    let info
    try {
      info = fs.lstatSync(current)
    } catch {
      fail('MISSING_SOURCE', name)
    }
    if (info.isSymbolicLink()) fail('SYMLINK_SOURCE', name)
  }
  if (!fs.statSync(current).isFile()) fail('MISSING_SOURCE', name)
  return fs.readFileSync(current)
}

function git(root, args) {
  return execFileSync(
    'git',
    [
      '--no-replace-objects',
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'core.untrackedCache=false',
      '-c',
      'submodule.recurse=false',
      '-C',
      root,
      ...args
    ],
    {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_OPTIONAL_LOCKS: '0',
        GIT_NO_REPLACE_OBJECTS: '1',
        GIT_NO_LAZY_FETCH: '1',
        GIT_TERMINAL_PROMPT: '0'
      }
    }
  )
}

function inspectReference(root, expectedCommit, expectedVersion) {
  if (
    !root ||
    !path.isAbsolute(root) ||
    !/^[a-f0-9]{40,64}$/.test(expectedCommit ?? '')
  )
    fail('INVALID_REFERENCE', 'absolute root and full commit required')
  const resolved = fs.realpathSync(root)
  if (resolved !== path.resolve(root)) fail('SYMLINK_ROOT', root)
  if (
    fs.realpathSync(git(root, ['rev-parse', '--show-toplevel']).trim()) !==
    resolved
  )
    fail('ROOT_MISMATCH', root)
  // A promisor repository can fetch missing objects during otherwise read-only
  // object queries. Refuse it rather than relying on newer Git env switches.
  let promisor = ''
  try {
    promisor = git(root, [
      'config',
      '--local',
      '--null',
      '--get-regexp',
      '^(extensions\\.partialclone|remote\\..*\\.promisor)$'
    ])
  } catch (error) {
    if (error.status !== 1) throw error
  }
  for (const record of promisor.split('\0').filter(Boolean)) {
    const [key, value = ''] = record.split('\n')
    if (
      (key.toLowerCase() === 'extensions.partialclone' && value) ||
      /^(?:true|yes|on|1)$/i.test(value)
    )
      fail('PARTIAL_REFERENCE', 'Local complete object storage required')
  }
  const commit = git(root, ['rev-parse', 'HEAD']).trim()
  if (commit !== expectedCommit) fail('COMMIT_DRIFT', commit)
  const algorithm = git(root, ['rev-parse', '--show-object-format']).trim()
  if (!['sha1', 'sha256'].includes(algorithm))
    fail('INVALID_REFERENCE', algorithm)
  const tree = new Map(
    git(root, ['ls-tree', '-rz', '--full-tree', expectedCommit])
      .split('\0')
      .filter(Boolean)
      .map((row) => {
        const match = /^(\d+) blob ([a-f0-9]+)\t([\s\S]+)$/.exec(row)
        if (!match) fail('INVALID_TREE', row)
        return [match[3], { mode: match[1], blob: match[2] }]
      })
  )
  // Never ask Git to compare worktree/index content: even status may invoke
  // reference-configured clean/process filters. Authenticate bytes ourselves.
  inspectUntrackedCandidates(resolved, tree)
  const reads = new Map()
  const read = (name) => {
    const item = tree.get(name)
    if (!item) fail('MISSING_PIN_SOURCE', name)
    if (item.mode === '120000') fail('SYMLINK_SOURCE', name)
    const bytes = safeRead(resolved, name)
    const blob = crypto
      .createHash(algorithm)
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex')
    if (blob !== item.blob) fail('SOURCE_DRIFT', name)
    const source = {
      path: name,
      sha256: hash(bytes),
      bytes: bytes.length,
      git_blob: blob
    }
    reads.set(name, source)
    return bytes.toString('utf8')
  }
  const manifest = JSON.parse(read('package.json'))
  if (
    !packageIdentifier(manifest.name) ||
    typeof manifest.version !== 'string' ||
    !/^[A-Za-z0-9.+_-]{1,128}$/.test(manifest.version)
  )
    fail(
      'INVALID_REFERENCE_METADATA',
      'root manifest name/version is not bounded vocabulary'
    )
  if (!expectedVersion || manifest.version !== expectedVersion)
    fail('VERSION_DRIFT', String(manifest.version))
  return {
    root: resolved,
    commit,
    version: manifest.version,
    tree,
    reads,
    read,
    manifest
  }
}

function isCandidate(name) {
  if (
    sensitive(name) ||
    /\.i18n\.ya?ml$/.test(name) ||
    /(?:^|\/)(?:tests?|__tests__|fixtures|snapshots|dist|lib|build|out|prebuilds|examples)(?:\/|$)/.test(
      name
    ) ||
    /\.(?:test|spec)\.[^/]+$/.test(name)
  )
    return false
  if (/^(packages|apps|python|native|vendor)\//.test(name)) {
    return /(?:\/package\.json|\.(?:ts|tsx|mts|cts|js|mjs|cjs|py|c|cc|cpp|h|hpp|rs|ya?ml|toml)|\.schema\.json)$/.test(
      name
    )
  }
  return (
    name === 'package.json' ||
    (/^(?:docs\/(?:tool-catalog|config-catalog|persistence-catalog|dependency-catalog|capability-seams|session-format-status)\.(?:md|json)|docs\/(?:subsystems|cordis-api)\/[^/]+\.md)$/.test(
      name
    ) &&
      !/\.zh\.md$/.test(name))
  )
}

function inspectUntrackedCandidates(root, tree) {
  let visited = 0
  const distributionRoot =
    'python/sdk-runtime/src/deepseek_harness_runtime/runtime'
  // This untracked generated distribution has separate artifact provenance.
  // A tracked file there is always a pinned source, never excluded by location.
  const untrackedDistribution = ![...tree.keys()].some(
    (name) =>
      name === distributionRoot || name.startsWith(distributionRoot + '/')
  )
  const sourceParents = new Set()
  for (const file of tree.keys())
    if (isCandidate(file)) {
      for (
        let parent = path.posix.dirname(file);
        parent !== '.';
        parent = path.posix.dirname(parent)
      )
        sourceParents.add(parent)
    }
  const skip = (name) =>
    sensitive(name) ||
    (untrackedDistribution && name === distributionRoot) ||
    /(?:^|\/)(?:tests?|__tests__|fixtures|snapshots|dist|lib|build|out|prebuilds|examples)(?:\/|$)/.test(
      name
    )
  function walk(relative, depth) {
    if (depth > 128) fail('INVENTORY_LIMIT', 'directory depth')
    for (const entry of fs.readdirSync(path.join(root, relative), {
      withFileTypes: true
    })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name
      if (skip(name)) continue
      if (++visited > 200000) fail('INVENTORY_LIMIT', 'entry count')
      const info = fs.lstatSync(path.join(root, name))
      if (info.isSymbolicLink()) {
        if (
          isCandidate(name) ||
          sourceParents.has(name) ||
          !path.posix.extname(name)
        )
          fail('SYMLINK_SOURCE', name)
        // Non-contract file links (for example CLAUDE.md) are not followed.
        continue
      }
      if (info.isDirectory()) walk(name, depth + 1)
      else if (isCandidate(name) && !tree.has(name)) fail('SOURCE_DRIFT', name)
    }
  }
  for (const dir of ['packages', 'apps', 'python', 'native', 'vendor']) {
    const full = path.join(root, dir)
    if (!fs.existsSync(full)) continue
    if (fs.lstatSync(full).isSymbolicLink()) fail('SYMLINK_SOURCE', dir)
    walk(dir, 0)
  }
  const docs = path.join(root, 'docs')
  if (fs.existsSync(docs) && fs.lstatSync(docs).isSymbolicLink())
    fail('SYMLINK_SOURCE', 'docs')
  const docNames = fs.existsSync(docs)
    ? fs.readdirSync(docs).map((name) => `docs/${name}`)
    : []
  for (const name of ['package.json', ...docNames]) {
    if (isCandidate(name) && !tree.has(name)) fail('SOURCE_DRIFT', name)
  }
  for (const dir of ['docs/subsystems', 'docs/cordis-api']) {
    if (!fs.existsSync(path.join(root, dir))) continue
    if (fs.lstatSync(path.join(root, dir)).isSymbolicLink())
      fail('SYMLINK_SOURCE', dir)
    walk(dir, 0)
  }
}

function ownerIndex(map, ref) {
  if (
    !map ||
    map.reference_commit !== ref.commit ||
    map.reference_version !== ref.version ||
    !Array.isArray(map.package_owners) ||
    !map.family_owners ||
    !Array.isArray(map.additional_surfaces)
  )
    fail('OWNER_MAP', 'invalid pin or shape')
  const packages = new Map()
  const names = new Set()
  for (const item of map.package_owners) {
    relativePath(item.manifest)
    if (
      !/^P100-\d{3}$/.test(item.owner_task) ||
      packages.has(item.manifest) ||
      names.has(item.reference_package)
    )
      fail('OWNER_MAP_DUPLICATE', item.manifest)
    if (!/^P100-\d{3}$/.test(map.family_owners[item.group] ?? ''))
      fail('OWNER_MAP', item.manifest)
    const actual = JSON.parse(ref.read(item.manifest))
    if (!packageIdentifier(actual.name))
      fail('INVALID_REFERENCE_METADATA', item.manifest)
    if (
      actual.name !== item.reference_package ||
      ref.reads.get(item.manifest).sha256 !== item.manifest_sha256
    )
      fail('OWNER_MAP_DRIFT', item.manifest)
    packages.set(item.manifest, item)
    names.add(item.reference_package)
  }
  const expected = [...ref.tree.keys()].filter((name) =>
    /^packages\/[^/]+\/[^/]+\/package\.json$/.test(name)
  )
  if (
    expected.length !== packages.size ||
    expected.some((name) => !packages.has(name))
  )
    fail('OWNER_MAP_MISSING', 'package denominator differs')
  if (
    map.inventory_coverage?.packages !== packages.size ||
    map.inventory_coverage?.families !== Object.keys(map.family_owners).length
  )
    fail('OWNER_MAP', 'inventory counts differ')
  const additional = map.additional_surfaces.map((item) => {
    relativePath(item.reference_path)
    if (
      !/^P100-\d{3}$/.test(item.owner_task) ||
      ![...ref.tree.keys()].some((name) =>
        name.startsWith(`${item.reference_path}/`)
      )
    )
      fail('OWNER_MAP_MISSING', item.reference_path)
    return item
  })
  if (
    new Set(additional.map((item) => item.reference_path)).size !==
    additional.length
  )
    fail('OWNER_MAP_DUPLICATE', 'additional surfaces')
  const additionalPackages = [...ref.tree.keys()]
    .filter(
      (name) =>
        /^(?:apps|native|python|vendor)\/.+\/package\.json$/.test(name) &&
        isCandidate(name)
    )
    .map((name) => {
      const data = JSON.parse(ref.read(name))
      if (data.name !== undefined && !packageIdentifier(data.name))
        fail('INVALID_REFERENCE_METADATA', name)
      return { directory: path.posix.dirname(name), name: data.name }
    })
    .sort(
      (a, b) =>
        b.directory.length - a.directory.length ||
        a.directory.localeCompare(b.directory, 'en')
    )
  const find = (source, packageHint) => {
    const direct =
      [...packages.values()].find((item) =>
        source.startsWith(`${path.posix.dirname(item.manifest)}/`)
      ) ??
      [...packages.values()].find(
        (item) => item.reference_package === packageHint
      )
    if (direct)
      return {
        package: direct.reference_package,
        owner_task: direct.owner_task,
        family: direct.group,
        scope: ['util', 'test-support'].includes(direct.group)
          ? 'INFRASTRUCTURE_CLOSURE'
          : 'CONTRACT'
      }
    const surface = additional
      .filter((item) => source.startsWith(`${item.reference_path}/`))
      .sort((a, b) => b.reference_path.length - a.reference_path.length)[0]
    if (surface)
      return {
        package:
          packageHint ||
          additionalPackages.find((item) =>
            source.startsWith(`${item.directory}/`)
          )?.name ||
          `surface:${surface.reference_path}`,
        owner_task: surface.owner_task,
        family: surface.reference_path,
        scope: 'ADDITIONAL_SURFACE'
      }
    if (/^(?:apps|native|python|vendor)\//.test(source))
      fail('OWNER_MAP_MISSING', source)
    return {
      package: packageHint || ref.manifest.name,
      owner_task: 'P100-003',
      family: 'catalog',
      scope: source.startsWith('packages/')
        ? 'UNRESOLVED_OWNERSHIP'
        : 'CATALOG_DATA',
      ...(source.startsWith('packages/')
        ? {
            resolution: unknown(
              'Package-root implementation requires explicit owner triage; P100-003 is not functional ownership'
            )
          }
        : {})
    }
  }
  return { find, packages, additional }
}

// Per physical source, not a global vocabulary blacklist. Runtime expression
// literals are unresolved payload data; matching declaration literals cannot
// independently establish a declaration-only role for the same bytes.
const sourcePayloadLiterals = new WeakMap()
const stringInitializerReason =
  'String initializer requires semantic review; bytes not copied'
function initializerLiterals(node) {
  const literals = new Map()
  const remember = (text) => {
    const digest = hash(text)
    literals.set(digest, {
      value_sha256: digest,
      byte_length: Buffer.byteLength(text, 'utf8')
    })
  }
  const visit = (child) => {
    if (
      ts.isStringLiteralLike(child) ||
      [
        ts.SyntaxKind.TemplateHead,
        ts.SyntaxKind.TemplateMiddle,
        ts.SyntaxKind.TemplateTail
      ].includes(child.kind)
    )
      remember(child.text)
    if (ts.isObjectLiteralExpression(child))
      for (const property of child.properties)
        if (
          property.name &&
          (ts.isIdentifier(property.name) || ts.isNumericLiteral(property.name))
        )
          remember(property.name.text)
    ts.forEachChild(child, visit)
  }
  visit(node)
  return [...literals.values()].sort((a, b) =>
    a.value_sha256.localeCompare(b.value_sha256, 'en')
  )
}
const payloadName = (node) =>
  node &&
  (ts.isStringLiteralLike(node) ||
    ts.isIdentifier(node) ||
    ts.isNumericLiteral(node))
    ? opaqueLiteral(node.text, 'Unclassified literal name; bytes not copied')
    : unknown('Dynamic payload key; bytes not copied', {
        ...(node ? { literals: initializerLiterals(node) } : {})
      })
const matchesPayload = (node) =>
  sourcePayloadLiterals.get(node.getSourceFile())?.has(hash(node.text))
// Identity projection stays separate from exact, role-established metadata.
const declarationName = (node) =>
  node && ts.isStringLiteral(node)
    ? matchesPayload(node)
      ? payloadName(node)
      : node.text
    : nodeName(node)
const printed = (node) => {
  if (!node)
    return unknown(
      'No declared type; inference requires semantic/runtime review'
    )
  let executable = false
  const literals = []
  const visit = (child) => {
    if (
      ts.isBlock(child) ||
      ts.isArrowFunction(child) ||
      ts.isFunctionExpression(child) ||
      ts.isClassExpression(child) ||
      ts.isCallExpression(child) ||
      ts.isNewExpression(child) ||
      ts.isComputedPropertyName(child)
    )
      executable = true
    if (
      (ts.isStringLiteral(child) ||
        ts.isNoSubstitutionTemplateLiteral(child) ||
        [
          ts.SyntaxKind.TemplateHead,
          ts.SyntaxKind.TemplateMiddle,
          ts.SyntaxKind.TemplateTail
        ].includes(child.kind)) &&
      (sourcePayloadLiterals
        .get(child.getSourceFile())
        ?.has(hash(child.text)) ||
        !/^[A-Za-z0-9_$./:@-]{1,200}$/.test(child.text))
    )
      literals.push({
        value_sha256: hash(child.text),
        byte_length: Buffer.byteLength(child.text, 'utf8')
      })
    ts.forEachChild(child, visit)
  }
  visit(node)
  if (executable)
    return unknown(
      'Executable expression in a declared type/heritage is not copied'
    )
  if (literals.length)
    return unknown(
      'Unclassified literal in a declared type; bytes not copied',
      { literals }
    )
  return ts
    .createPrinter({ removeComments: true })
    .printNode(ts.EmitHint.Unspecified, node, node.getSourceFile())
    .trim()
}
const nodeName = (node) => {
  if (!node) return unknown('Computed or destructured name')
  if (ts.isStringLiteral(node))
    return identityVocabulary(node.text) && !matchesPayload(node)
      ? node.text
      : opaqueLiteral(node.text, 'Unclassified literal name; bytes not copied')
  return ts.isIdentifier(node) || ts.isNumericLiteral(node)
    ? node.text
    : unknown('Computed or destructured name')
}
const modifiers = (node) =>
  (node.modifiers ?? [])
    .map((item) => ts.tokenToString(item.kind))
    .filter(Boolean)

function staticData(node) {
  if (!node) return unknown('Initializer absent')
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    return staticData(node.expression)
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    // Initializer strings can be complete guest programs. Syntax cannot
    // authenticate them as vocabulary; retain the requirement and provenance,
    // never its bytes. Declared type signatures/schema vocabulary are separate.
    return unknown(stringInitializerReason, {
      value_sha256: hash(node.text),
      byte_length: Buffer.byteLength(node.text, 'utf8')
    })
  if (ts.isNumericLiteral(node)) return Number(node.text)
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (node.kind === ts.SyntaxKind.NullKeyword) return null
  if (
    ts.isPrefixUnaryExpression(node) &&
    ts.isNumericLiteral(node.operand) &&
    node.operator === ts.SyntaxKind.MinusToken
  )
    return -Number(node.operand.text)
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(staticData)
  if (ts.isObjectLiteralExpression(node))
    return {
      properties: node.properties.map((item) =>
        ts.isPropertyAssignment(item)
          ? {
              name: payloadName(item.name),
              value: staticData(item.initializer)
            }
          : {
              name: item.name ? payloadName(item.name) : unknown('Spread key'),
              value: unknown('Dynamic shorthand, spread or method')
            }
      )
    }
  if (ts.isIdentifier(node))
    return unknown('Identifier value is not statically evaluated', {
      reference: node.text
    })
  if (ts.isCallExpression(node))
    return unknown('Call value is not executed', {
      call: referenceName(node.expression),
      arguments: node.arguments.map(staticData)
    })
  return unknown('Dynamic expression is not evaluated', {
    syntax_kind: ts.SyntaxKind[node.kind],
    literals: initializerLiterals(node)
  })
}

function referenceName(node) {
  if (ts.isIdentifier(node)) return node.text
  if (ts.isPropertyAccessExpression(node))
    return { receiver: referenceName(node.expression), member: node.name.text }
  if (ts.isCallExpression(node))
    return unknown('Dynamic call reference is not executed', {
      call: referenceName(node.expression),
      arguments: node.arguments.map(staticData)
    })
  return unknown('Dynamic reference')
}

function signature(node) {
  return {
    modifiers: modifiers(node).filter(
      (value) => !['export', 'default', 'async'].includes(value)
    ),
    type_parameters: (node.typeParameters ?? []).map(printed),
    parameters: (node.parameters ?? []).map((parameter) => ({
      name: nodeName(parameter.name),
      type: printed(parameter.type),
      optional: !!parameter.questionToken || !!parameter.initializer,
      rest: !!parameter.dotDotDotToken,
      ...(parameter.initializer
        ? { default: staticData(parameter.initializer) }
        : {})
    })),
    returns: ts.isConstructorDeclaration(node)
      ? 'constructor'
      : printed(node.type)
  }
}

function memberShape(member) {
  const name =
    member.name && ts.isStringLiteral(member.name)
      ? { declared_name: declarationName(member.name) }
      : {}
  if (
    ts.isMethodSignature(member) ||
    ts.isMethodDeclaration(member) ||
    ts.isCallSignatureDeclaration(member) ||
    ts.isConstructSignatureDeclaration(member) ||
    ts.isIndexSignatureDeclaration(member) ||
    ts.isConstructorDeclaration(member) ||
    ts.isGetAccessorDeclaration(member) ||
    ts.isSetAccessorDeclaration(member)
  )
    return { ...name, ...signature(member) }
  return {
    ...name,
    type: printed(member.type),
    optional: !!member.questionToken,
    modifiers: modifiers(member),
    ...(member.initializer ? { value: staticData(member.initializer) } : {})
  }
}

function parseTypeScriptContract(text, scriptKind) {
  const source = ts.createSourceFile(
    'contract.ts',
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  )
  if (source.parseDiagnostics.length)
    fail(
      'AST_PARSE',
      source.parseDiagnostics
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' '))
        .join('; ')
    )
  return source
}
function indexRuntimeLiterals(source, payloadLiterals) {
  const remember = (text) => payloadLiterals.set(hash(text), text)
  const visit = (node) => {
    // Type syntax, static module locators and declaration names are separate
    // roles. Runtime expressions inside bodies, call arguments, computed names
    // and other expression slots remain conservative payload evidence.
    if (
      (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) ||
      ts.isImportDeclaration(node) ||
      ts.isExportDeclaration(node) ||
      ts.isExternalModuleReference(node)
    )
      return
    const declaredName =
      node.parent?.name === node &&
      !ts.isObjectLiteralExpression(node.parent.parent)
    if (
      !declaredName &&
      (ts.isStringLiteralLike(node) ||
        [
          ts.SyntaxKind.TemplateHead,
          ts.SyntaxKind.TemplateMiddle,
          ts.SyntaxKind.TemplateTail
        ].includes(node.kind))
    )
      remember(node.text)
    if (ts.isObjectLiteralExpression(node))
      for (const property of node.properties)
        if (
          property.name &&
          (ts.isIdentifier(property.name) || ts.isNumericLiteral(property.name))
        )
          remember(property.name.text)
    ts.forEachChild(node, visit)
  }
  visit(source)
}

export function extractTypeScriptContracts(
  text,
  emit,
  context = '',
  scriptKind = ts.ScriptKind.TS,
  payloadLiterals = new Map()
) {
  const source = parseTypeScriptContract(text, scriptKind)
  sourcePayloadLiterals.set(source, payloadLiterals)
  indexRuntimeLiterals(source, payloadLiterals)
  const records = new Map()
  const add = (kind, symbol, shape) => {
    if (
      symbol.includes('"status":"UNKNOWN"') ||
      symbol.includes('[object Object]')
    )
      shape = {
        ...shape,
        name_resolution: unknown(
          'Computed/destructured declaration name requires semantic/runtime review'
        )
      }
    const key = `${kind}:${symbol}`
    const record = records.get(key) ?? { kind, symbol, declarations: [] }
    record.declarations.push(shape)
    records.set(key, record)
  }
  const visitStatements = (statements, prefix, ambient = false) => {
    for (const node of statements) {
      const declaredName = node.name ? nodeName(node.name) : 'default'
      const symbol = `${prefix}${typeof declaredName === 'string' ? declaredName : json(declaredName)}`
      const publicDeclaration =
        ambient ||
        modifiers(node).includes('export') ||
        modifiers(node).includes('default')
      if (ts.isModuleDeclaration(node)) {
        const next = `${symbol}.`
        if (node.body && ts.isModuleBlock(node.body))
          visitStatements(node.body.statements, next, true)
        else if (node.body && ts.isModuleDeclaration(node.body))
          visitStatements([node.body], next, true)
      } else if (ts.isInterfaceDeclaration(node)) {
        add(
          /config/i.test(node.name.text)
            ? 'config-interface'
            : /event/i.test(node.name.text)
              ? 'event-interface'
              : 'interface',
          symbol,
          {
            visibility: publicDeclaration ? 'PUBLIC' : 'DECLARED',
            type_parameters: (node.typeParameters ?? []).map(printed),
            heritage: (node.heritageClauses ?? []).map(printed)
          }
        )
        for (const member of node.members) {
          const name = member.name
            ? nodeName(member.name)
            : ts.isIndexSignatureDeclaration(member)
              ? 'index'
              : ts.SyntaxKind[member.kind]
          add(
            /events?$/i.test(node.name.text)
              ? 'event-vocabulary'
              : /config/i.test(node.name.text)
                ? 'config-field'
                : 'interface-member',
            `${symbol}.${typeof name === 'string' ? name : json(name)}`,
            memberShape(member)
          )
        }
      } else if (ts.isTypeAliasDeclaration(node)) {
        add(
          /config/i.test(node.name.text)
            ? 'config-type'
            : /event/i.test(node.name.text)
              ? 'event-type'
              : 'type',
          symbol,
          {
            visibility: publicDeclaration ? 'PUBLIC' : 'DECLARED',
            type_parameters: (node.typeParameters ?? []).map(printed),
            type: printed(node.type)
          }
        )
      } else if (ts.isClassDeclaration(node)) {
        // Heritage expressions can contain executable expressions; preserve references only.
        add('class', symbol, {
          visibility: publicDeclaration ? 'PUBLIC' : 'DECLARED',
          type_parameters: (node.typeParameters ?? []).map(printed),
          heritage: (node.heritageClauses ?? []).map((clause) => ({
            token: ts.tokenToString(clause.token),
            types: clause.types.map((type) => ({
              reference: referenceName(type.expression),
              type_arguments: (type.typeArguments ?? []).map(printed)
            }))
          }))
        })
        for (const member of node.members) {
          if (
            modifiers(member).some((value) =>
              ['private', 'protected'].includes(value)
            ) ||
            (member.name && ts.isPrivateIdentifier(member.name)) ||
            ts.isClassStaticBlockDeclaration(member)
          )
            continue
          const name = ts.isConstructorDeclaration(member)
            ? 'constructor'
            : member.name
              ? nodeName(member.name)
              : ts.SyntaxKind[member.kind]
          add(
            'class-member',
            `${symbol}.${typeof name === 'string' ? name : json(name)}`,
            memberShape(member)
          )
        }
      } else if (ts.isFunctionDeclaration(node) && publicDeclaration) {
        add('function', symbol, signature(node))
      } else if (ts.isVariableStatement(node) && publicDeclaration) {
        for (const declaration of node.declarationList.declarations) {
          const name = nodeName(declaration.name)
          const variableSymbol = `${prefix}${typeof name === 'string' ? name : json(name)}`
          if (
            declaration.initializer &&
            (ts.isArrowFunction(declaration.initializer) ||
              ts.isFunctionExpression(declaration.initializer))
          )
            add('function', variableSymbol, signature(declaration.initializer))
          else
            add(
              /config|schema/i.test(String(name)) ? 'config-value' : 'value',
              variableSymbol,
              {
                type: printed(declaration.type),
                value: staticData(declaration.initializer)
              }
            )
        }
      } else if (ts.isEnumDeclaration(node)) {
        add('enum', symbol, {
          visibility: publicDeclaration ? 'PUBLIC' : 'DECLARED',
          members: node.members.map((member) => ({
            name: declarationName(member.name),
            value: member.initializer
              ? staticData(member.initializer)
              : unknown('Implicit enum value not evaluated')
          }))
        })
      } else if (ts.isExportDeclaration(node)) {
        const from = node.moduleSpecifier
          ? nodeName(node.moduleSpecifier)
          : null
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const item of node.exportClause.elements)
            add(
              'export',
              `${prefix}${typeof nodeName(item.name) === 'string' ? nodeName(item.name) : json(nodeName(item.name))}`,
              {
                from,
                name: declarationName(item.propertyName ?? item.name),
                ...(ts.isStringLiteral(item.name)
                  ? { declared_name: declarationName(item.name) }
                  : {}),
                type_only: node.isTypeOnly || item.isTypeOnly
              }
            )
        } else
          add('export', `${prefix}*:${json(from)}`, {
            from,
            namespace: node.exportClause
              ? nodeName(node.exportClause.name)
              : null,
            type_only: node.isTypeOnly
          })
      } else if (ts.isExportAssignment(node)) {
        add('export', `${prefix}default`, {
          value: staticData(node.expression),
          export_equals: node.isExportEquals
        })
      }
    }
  }
  visitStatements(source.statements, context)
  for (const record of [...records.values()].sort((a, b) =>
    `${a.kind}:${a.symbol}`.localeCompare(`${b.kind}:${b.symbol}`, 'en')
  )) {
    record.declarations.sort((a, b) => json(a).localeCompare(json(b), 'en'))
    emit(record.kind, record.symbol, { declarations: record.declarations })
  }
}

const PYTHON_AST = String.raw`
import ast, json, sys, hashlib, re
def opaque(value):
  data=value if isinstance(value,bytes) else value.encode('utf-8')
  return {"status":"UNKNOWN","reason":"Unclassified Python literal; bytes not copied","value_sha256":hashlib.sha256(data).hexdigest(),"byte_length":len(data)}
def typ(n):
  if n is None: return {"status":"UNKNOWN","reason":"No declared Python annotation"}
  allowed=(ast.Name,ast.Attribute,ast.Subscript,ast.Constant,ast.Tuple,ast.List,ast.BinOp,ast.BitOr,ast.Load)
  if not all(isinstance(x,allowed) for x in ast.walk(n)): return {"status":"UNKNOWN","reason":"Dynamic Python annotation/base expression"}
  for x in ast.walk(n):
    if isinstance(x,ast.Constant) and isinstance(x.value,bytes): return opaque(x.value)
    if isinstance(x,ast.Constant) and isinstance(x.value,str) and not re.fullmatch(r'[A-Za-z0-9_$./:@-]{1,200}',x.value): return opaque(x.value)
  return ast.unparse(n)
def sig(n):
  args=n.args
  positional=args.posonlyargs+args.args
  defaults=[None]*(len(positional)-len(args.defaults))+args.defaults
  ps=[{"name":a.arg,"type":typ(a.annotation),"optional":d is not None,"positional_only":i<len(args.posonlyargs)} for i,(a,d) in enumerate(zip(positional,defaults))]
  ps += [{"name":a.arg,"type":typ(a.annotation),"optional":d is not None,"keyword_only":True} for a,d in zip(args.kwonlyargs,args.kw_defaults)]
  for a,kind in [(args.vararg,"vararg"),(args.kwarg,"kwarg")]:
    if a: ps.append({"name":a.arg,"type":typ(a.annotation),kind:True})
  return {"parameters":ps,"returns":typ(n.returns),"async":isinstance(n,ast.AsyncFunctionDef)}
out=[]
for item in json.load(sys.stdin):
  rows=[]
  tree=ast.parse(item["text"])
  for n in tree.body:
    if isinstance(n,(ast.FunctionDef,ast.AsyncFunctionDef)) and not n.name.startswith("_"): rows.append(["python-function",n.name,sig(n)])
    elif isinstance(n,ast.ClassDef):
      rows.append(["python-class",n.name,{"bases":[typ(b) for b in n.bases]}])
      for m in n.body:
        if isinstance(m,(ast.FunctionDef,ast.AsyncFunctionDef)) and (not m.name.startswith("_") or m.name=="__init__"): rows.append(["python-method",n.name+"."+m.name,sig(m)])
        elif isinstance(m,ast.AnnAssign) and isinstance(m.target,ast.Name): rows.append(["python-field",n.name+"."+m.target.id,{"type":typ(m.annotation)}])
    elif isinstance(n,ast.ImportFrom): rows.extend([["python-export",a.asname or a.name,{"from":n.module,"level":n.level,"name":a.name}] for a in n.names])
    elif isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=="__all__" for t in n.targets):
      try:
        value=ast.literal_eval(n.value)
        if not (isinstance(value,(list,tuple)) and all(isinstance(x,str) and re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,199}',x) for x in value)): value=opaque(json.dumps(value,sort_keys=True))
      except (ValueError,TypeError): value={"status":"UNKNOWN","reason":"Dynamic __all__"}
      rows.append(["python-exports","__all__",{"names":value}])
  out.append({"path":item["path"],"rows":rows})
json.dump(out,sys.stdout,sort_keys=True)
`

// A schema default/example/const can itself be an entire guest program.
// Only bounded structural schema vocabulary is copied as text. Other strings
// retain provenance/hash/length as UNKNOWN, including nested arrays/objects.
const jsonVocabularyFields = new Set(['name', 'type', 'required', '$ref'])
const jsonSchemaMaps = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas'
])
const jsonSchemaFields = new Set([
  'parameters',
  'inputSchema',
  'outputSchema',
  'items',
  'prefixItems',
  'additionalProperties',
  'additionalItems',
  'unevaluatedProperties',
  'unevaluatedItems',
  'contains',
  'propertyNames',
  'not',
  'if',
  'then',
  'else',
  'allOf',
  'anyOf',
  'oneOf',
  'contentSchema'
])
// Finite recognized schema/tool data members. Their values remain payload
// unless the vocabulary/schema roles above establish a more specific role.
const jsonSchemaDataFields = new Set([
  '$schema',
  '$id',
  '$anchor',
  '$dynamicAnchor',
  '$dynamicRef',
  '$vocabulary',
  '$comment',
  'title',
  'description',
  'deprecated',
  'readOnly',
  'writeOnly',
  'default',
  'const',
  'examples',
  'enum',
  'format',
  'pattern',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minContains',
  'maxContains',
  'minProperties',
  'maxProperties',
  'dependentRequired',
  'contentEncoding',
  'contentMediaType'
])
const jsonManifestFields = new Set([
  'name',
  'version',
  'type',
  'main',
  'module',
  'types',
  'exports',
  'bin',
  'files',
  'engines',
  'peerDependencies',
  'entrypoints'
])
const jsonKnownMember = (role, key) =>
  role === 'schema-map' ||
  (role === 'manifest'
    ? jsonManifestFields.has(key)
    : role === 'declaration' &&
      (jsonVocabularyFields.has(key) ||
        jsonSchemaMaps.has(key) ||
        jsonSchemaFields.has(key) ||
        jsonSchemaDataFields.has(key)))
const jsonChildRole = (role, key) =>
  role === 'manifest'
    ? key === 'name'
      ? 'vocabulary'
      : 'payload'
    : role === 'schema-map'
      ? 'declaration'
      : role !== 'declaration'
        ? 'payload'
        : jsonVocabularyFields.has(key)
          ? 'vocabulary'
          : jsonSchemaMaps.has(key)
            ? 'schema-map'
            : jsonSchemaFields.has(key)
              ? 'declaration'
              : 'payload'
function jsonPayloadLiterals(
  value,
  field,
  role = 'declaration',
  literals = new Map()
) {
  const pending = [{ value, field, role }]
  while (pending.length) {
    const current = pending.pop()
    const item = current.value
    const payload =
      current.role === 'payload' ||
      (current.role === 'vocabulary' &&
        item &&
        typeof item === 'object' &&
        !Array.isArray(item))
    if (typeof item === 'string') {
      if (payload) literals.set(hash(item), item)
    } else if (Array.isArray(item)) {
      for (const child of item)
        pending.push({ value: child, field: current.field, role: current.role })
    } else if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        if (payload || !jsonKnownMember(current.role, key))
          literals.set(hash(key), key)
        pending.push({
          value: child,
          field: key,
          role: payload ? 'payload' : jsonChildRole(current.role, key)
        })
      }
    }
  }
  return literals
}
// Finite roles: declaration, schema-map, vocabulary, payload, manifest. Payload is
// absorbing: default/const/examples and unclassified descendants never regain
// declaration privileges merely by using a structural-looking property name.
function projectJsonContract(
  value,
  field,
  depth = 0,
  role = 'declaration',
  payloadLiterals = jsonPayloadLiterals(value, field, role)
) {
  const opaque = (reason, data) =>
    unknown(reason, {
      value_sha256: hash(data),
      byte_length: Buffer.byteLength(data, 'utf8')
    })
  if (depth > 64)
    return opaque('JSON contract exceeds projection depth', json(value))
  if (typeof value === 'string') {
    if (
      role !== 'payload' &&
      ((field === 'type' &&
        [
          'null',
          'boolean',
          'object',
          'array',
          'number',
          'string',
          'integer'
        ].includes(value)) ||
        (role === 'vocabulary' &&
          ['required', 'name'].includes(field) &&
          !payloadLiterals.has(hash(value))) ||
        (field === '$ref' && /^[#./][A-Za-z0-9_$./~:@-]{0,511}$/.test(value)))
    )
      return value
    return opaque(
      'Unclassified JSON string requires semantic review; bytes not copied',
      value
    )
  }
  if (Array.isArray(value))
    return value.map((item) =>
      projectJsonContract(item, field, depth + 1, role, payloadLiterals)
    )
  if (value && typeof value === 'object') {
    if (role === 'payload' || role === 'vocabulary')
      return opaque(
        'Unclassified JSON payload object; bytes not copied',
        json(value)
      )
    if (
      role === 'schema-map' &&
      Object.keys(value).some((key) => payloadLiterals.has(hash(key)))
    )
      return opaque(
        'Unresolved declaration/payload property name; object bytes not copied',
        json(value)
      )
    const members = Object.entries(value)
    const unclassified = members.filter(([key]) => !jsonKnownMember(role, key))
    const projected = Object.fromEntries(
      members
        .filter(([key]) => jsonKnownMember(role, key))
        .map(([key, item]) => [
          key,
          projectJsonContract(
            item,
            key,
            depth + 1,
            jsonChildRole(role, key),
            payloadLiterals
          )
        ])
    )
    if (unclassified.length)
      projected.unclassified_members = opaque(
        'Unclassified JSON members including their names; bytes not copied',
        json(Object.fromEntries(unclassified))
      )
    return projected
  }
  return value
}

const isTypeScriptContractFence = (fence) =>
  /^(?:ts|typescript)(?: |$)/.test(fence) &&
  /(?:config-catalog|type-equiv|public-api|cordis)/.test(fence)
function documentTypeScript(fence, content) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    true,
    ts.LanguageVariant.Standard,
    content
  )
  const first = scanner.scan()
  const declaration = [
    ts.SyntaxKind.ExportKeyword,
    ts.SyntaxKind.DeclareKeyword,
    ts.SyntaxKind.InterfaceKeyword,
    ts.SyntaxKind.TypeKeyword,
    ts.SyntaxKind.ClassKeyword,
    ts.SyntaxKind.FunctionKeyword,
    ts.SyntaxKind.EnumKeyword,
    ts.SyntaxKind.ImportKeyword,
    ts.SyntaxKind.ModuleKeyword,
    ts.SyntaxKind.NamespaceKeyword
  ].includes(first)
  const wrapped =
    fence.includes('cordis-catalog') && !declaration
      ? `export declare class CordisSurface {\n${content}\n}`
      : content
  return wrapped
}

const tableCells = (line) =>
  line
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((part) => part.trim())
const tableSeparator = (columns) =>
  columns.every((part) => /^:?-+:?$/.test(part.replace(/\s/g, '')))

function extractDocument(text, source, emit, owners) {
  const lines = text.split('\n')
  // One local role scope for this physical source. Complete the prepass before
  // emitting any fragment, so forward/backward matches are order independent.
  const payloadLiterals = new Map()
  let indexingFence,
    indexingBody = []
  for (const line of lines) {
    if (indexingFence !== undefined) {
      if (/^```\s*$/.test(line)) {
        const content = indexingBody.join('\n')
        try {
          if (indexingFence === 'json')
            jsonPayloadLiterals(
              JSON.parse(content),
              undefined,
              'declaration',
              payloadLiterals
            )
          else if (isTypeScriptContractFence(indexingFence))
            indexRuntimeLiterals(
              parseTypeScriptContract(
                documentTypeScript(indexingFence, content),
                ts.ScriptKind.TS
              ),
              payloadLiterals
            )
        } catch (error) {
          if (
            !(error instanceof SyntaxError) &&
            !error.message.startsWith('AST_PARSE:')
          )
            throw error
          // The established projection pass reports malformed data with its
          // original source/heading; the prepass never grants it acceptance.
        }
        indexingFence = undefined
        indexingBody = []
      } else indexingBody.push(line)
    } else {
      const open = /^```(.*)$/.exec(line)
      if (open) {
        indexingFence = open[1].trim()
        if (
          indexingFence !== 'json' &&
          indexingFence !== 'mermaid' &&
          !isTypeScriptContractFence(indexingFence)
        )
          payloadLiterals.set(hash(indexingFence), indexingFence)
      } else if (/^\|/.test(line)) {
        const columns = tableCells(line)
        if (!tableSeparator(columns))
          for (const cell of columns) payloadLiterals.set(hash(cell), cell)
      }
    }
  }
  const add = (kind, symbol, shape, ownership) => {
    const opaqueRole =
      kind === 'document-table-row' || kind === 'document-unparsed'
    const collision = [...payloadLiterals.values()].some(
      (value) => value.length > 0 && symbol.includes(value)
    )
    const projected = projectIdentity(symbol, shape, opaqueRole || collision)
    emit(kind, projected.symbol, projected.shape, ownership)
  }
  // Generated Cordis/config sections place their source link after or before
  // a fence. Resolve ownership for the entire heading independent of order.
  const linkedSources = new Map()
  let scanHeadings = [],
    scanAnchor
  for (const line of lines) {
    const anchor = /^<a id="([^"]+)"><\/a>/.exec(line)
    if (anchor) scanAnchor = anchor[1]
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      scanHeadings = scanHeadings.slice(0, heading[1].length - 1)
      scanHeadings[heading[1].length - 1] =
        heading[2].replace(/`/g, '').trim() +
        (scanAnchor ? `#${scanAnchor}` : '')
      scanAnchor = undefined
    }
    if (/source/i.test(line)) {
      const link =
        /\]\((?:\.\.\/)+((?:packages|vendor|apps|python|native)\/[^)#\s]+)(?:#[^)]*)?\)/.exec(
          line
        )
      if (link)
        linkedSources.set(
          scanHeadings.filter(Boolean).join('/'),
          link[1].replace(/:\d+(?:-\d+)?$/, '')
        )
    }
  }
  let headings = [],
    packageHint,
    fence,
    body = [],
    tableHeader,
    nextAnchor
  const tables = new Map(),
    unparsed = new Map()
  const context = () => headings.filter(Boolean).join('/') || 'document'
  const owner = () =>
    owners.find(linkedSources.get(context()) ?? source, packageHint)
  for (const line of lines) {
    if (fence !== undefined) {
      if (/^```\s*$/.test(line)) {
        const content = body.join('\n')
        if (fence === 'json') {
          let data
          try {
            data = JSON.parse(content)
          } catch {
            fail('CATALOG_JSON', `${source}:${context()}`)
          }
          add(
            'document-json',
            context(),
            projectJsonContract(
              data,
              undefined,
              0,
              'declaration',
              payloadLiterals
            ),
            owner()
          )
        } else if (isTypeScriptContractFence(fence)) {
          const wrapped = documentTypeScript(fence, content)
          try {
            extractTypeScriptContracts(
              wrapped,
              (kind, symbol, shape) =>
                add(`document-${kind}`, symbol, shape, owner()),
              `${context()}/`,
              ts.ScriptKind.TS,
              payloadLiterals
            )
          } catch (error) {
            if (!error.message.startsWith('AST_PARSE:')) throw error
            add(
              'document-ast-unknown',
              context(),
              unknown(
                'Generated declaration fragment is not parseable standalone TypeScript; source AST is separately catalogued',
                { diagnostics: projectJsonContract(error.message) }
              ),
              owner()
            )
          }
        } else if (fence === 'mermaid') {
          const nodes = [
            ...content.matchAll(/^\s*([\w]+)\["([^"\n]+)"\]/gm)
          ].map((match) => ({
            id: match[1],
            label: projectJsonContract(match[2], 'name')
          }))
          const edges = content
            .split('\n')
            .filter((row) => /^\s*[\w]+\s+(?:-->|-.->|---)/.test(row))
            .map((row) =>
              /^\s*[\w]+\s+(?:-->|-.->|---)\s+[\w]+\s*$/.test(row)
                ? row.trim()
                : projectJsonContract(row.trim())
            )
          add(
            'capability-graph',
            context(),
            {
              nodes,
              edges,
              semantics: unknown(
                'Graph data requires semantic capability/journey review'
              )
            },
            owner()
          )
        } else {
          const key = `${context()}/${fence || 'untyped'}`
          const previous = unparsed.get(key)
          unparsed.set(key, {
            blocks: (previous?.blocks ?? 0) + 1,
            language: fence,
            ownership: owner()
          })
        }
        fence = undefined
        body = []
      } else body.push(line)
      continue
    }
    const open = /^```(.*)$/.exec(line)
    if (open) {
      fence = open[1].trim()
      body = []
      continue
    }
    const anchor = /^<a id="([^"]+)"><\/a>/.exec(line)
    if (anchor) nextAnchor = anchor[1]
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    if (heading) {
      headings = headings.slice(0, heading[1].length - 1)
      headings[heading[1].length - 1] =
        heading[2].replace(/`/g, '').trim() +
        (nextAnchor ? `#${nextAnchor}` : '')
      nextAnchor = undefined
      if (heading[1].length === 2)
        packageHint = /@deepseek-ai\/[\w-]+/.exec(heading[2])?.[0]
      tableHeader = undefined
    }
    if (/^\|/.test(line)) {
      const columns = tableCells(line)
      if (tableSeparator(columns)) continue
      if (!tableHeader) {
        tableHeader = columns
        continue
      }
      const hint =
        /@deepseek-ai\/[\w-]+/.exec(columns.join(' '))?.[0] || packageHint
      const key = `${context()}/${columns[0]}`
      const table = tables.get(key) ?? {
        columns: tableHeader,
        rows: [],
        ownership: owners.find(linkedSources.get(context()) ?? source, hint)
      }
      if (table.rows.some((row) => json(row) === json(columns)))
        fail('DUPLICATE_TABLE_ROW', `${source}:${key}`)
      table.rows.push(columns)
      tables.set(key, table)
    }
  }
  if (fence !== undefined) fail('CATALOG_FENCE', source)
  for (const [key, table] of tables)
    add(
      'document-table-row',
      key,
      {
        columns: table.columns.map((value) => projectJsonContract(value)),
        rows: table.rows
          .sort((a, b) => json(a).localeCompare(json(b), 'en'))
          .map((row) => row.map((value) => projectJsonContract(value)))
      },
      table.ownership
    )
  for (const [key, data] of unparsed)
    add(
      'document-unparsed',
      key,
      unknown('Fence not treated as a static contract', {
        language: projectJsonContract(data.language),
        blocks: data.blocks
      }),
      data.ownership
    )
}

export function collectReferenceCatalog({
  root,
  expectedCommit = REFERENCE_PIN,
  expectedVersion = REFERENCE_VERSION,
  ownerMap
}) {
  const ref = inspectReference(root, expectedCommit, expectedVersion)
  const map = typeof ownerMap === 'string' ? readJsonData(ownerMap) : ownerMap
  const owners = ownerIndex(map, ref)
  const entries = [],
    ids = new Set(),
    python = []
  const emitFor =
    (source) =>
    (kind, symbol, shape, ownership = owners.find(source)) => {
      if (ownership.resolution)
        shape = { contract: shape, ownership_resolution: ownership.resolution }
      const projected = projectIdentity(symbol, shape)
      symbol = projected.symbol
      shape = projected.shape
      const identity = { kind, package: ownership.package, source, symbol }
      const id = `contract:${hash(json(identity))}`
      if (ids.has(id)) fail('DUPLICATE_ID', `${source}:${kind}:${symbol}`)
      ids.add(id)
      entries.push({
        id,
        kind,
        package: ownership.package,
        source,
        source_sha256: ref.reads.get(source).sha256,
        symbol,
        owner_task: ownership.owner_task,
        family: ownership.family,
        scope: ownership.scope,
        shape,
        extraction_status: hasUnknown(shape) ? 'UNKNOWN' : 'STATIC',
        parity_status: 'NOT_VERIFIED',
        contract_sha256: hash(json(shape))
      })
    }
  const candidates = [...ref.tree.keys()].filter(isCandidate).sort()
  for (const source of candidates) {
    const text = ref.read(source),
      emit = emitFor(source)
    if (source.endsWith('/package.json') || source === 'package.json') {
      const data = JSON.parse(text)
      const shape = Object.fromEntries(
        [
          'name',
          'version',
          'type',
          'main',
          'module',
          'types',
          'exports',
          'bin',
          'files',
          'engines',
          'peerDependencies'
        ]
          .filter((key) => key in data)
          .map((key) => [key, data[key]])
      )
      if (!('exports' in data) && !('main' in data))
        shape.entrypoints = unknown(
          'Manifest declares neither exports nor main'
        )
      emit(
        'manifest',
        'package',
        projectJsonContract(shape, undefined, 0, 'manifest')
      )
    } else if (/\.[cm]?[jt]sx?$/.test(source)) {
      try {
        extractTypeScriptContracts(
          text,
          emit,
          '',
          /\.tsx$/.test(source)
            ? ts.ScriptKind.TSX
            : /\.jsx$/.test(source)
              ? ts.ScriptKind.JSX
              : ts.ScriptKind.TS
        )
      } catch (error) {
        fail('SOURCE_AST', `${source}: ${error.message}`)
      }
      // Every source has a denominator entry, even when no public declaration is detectable.
      emit('source-surface', 'surface', {
        language: 'typescript/javascript',
        analysis: unknown(
          'Static syntax inventory; inferred types, export-star resolution and runtime registration require review'
        )
      })
    } else if (source.endsWith('.md')) {
      for (const link of text.matchAll(
        /\]\((?:\.\.\/)+(packages\/[^)#\s]+)(?:#[^)]*)?\)/g
      )) {
        const target = link[1].replace(/:\d+(?:-\d+)?$/, '')
        if (
          !ref.tree.has(target) &&
          ![...ref.tree.keys()].some((name) => name.startsWith(`${target}/`))
        )
          fail('MISSING_DOCUMENT_SOURCE', `${source} -> ${target}`)
      }
      extractDocument(text, source, emit, owners)
      emit('document-surface', 'surface', {
        format: 'contract-data',
        freshness: unknown(
          'Generated docs consumed as committed DATA; generators were not executed'
        )
      })
    } else if (source.endsWith('.json')) {
      emit('json-schema-data', 'data', projectJsonContract(JSON.parse(text)))
    } else if (source.endsWith('.py')) {
      python.push({ path: source, text })
      emit(
        'python-surface',
        'surface',
        unknown(
          'Python AST declarations only; annotations/defaults/dynamic exports are not executed'
        )
      )
    } else if (/\.(c|cc|cpp|h|hpp|rs)$/.test(source)) {
      // Native implementations are never copied. Declarations not represented by a TS wrapper remain explicit unknowns.
      emit(
        'native-surface',
        'surface',
        unknown(
          'Native ABI/body not evaluated; TS bindings and manifest are separately catalogued',
          { language: path.extname(source).slice(1) }
        )
      )
    } else {
      emit(
        'configuration-data',
        'data',
        unknown(
          'YAML/TOML configuration requires a dedicated schema-aware parser; no interpolation or config execution',
          {
            keys: [...text.matchAll(/^([\w.-]+)\s*[:=]/gm)]
              .map((match) => match[1])
              .sort()
          }
        )
      )
    }
  }
  if (python.length) {
    const results = JSON.parse(
      execFileSync('python3', ['-I', '-c', PYTHON_AST], {
        input: JSON.stringify(python),
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        env: { PATH: process.env.PATH }
      })
    )
    for (const result of results)
      for (const [kind, symbol, shape] of result.rows)
        emitFor(result.path)(kind, symbol, shape)
  }
  // Detect a source changed during collection before returning the candidate.
  for (const source of ref.reads.keys()) ref.read(source)
  inspectUntrackedCandidates(ref.root, ref.tree)
  if (git(root, ['rev-parse', 'HEAD']).trim() !== ref.commit)
    fail('COMMIT_DRIFT', 'changed during collection')
  entries.sort((a, b) => a.id.localeCompare(b.id, 'en'))
  const counts = (key) =>
    Object.fromEntries(
      [...new Set(entries.map((item) => item[key]))]
        .sort()
        .map((value) => [
          value,
          entries.filter((item) => item[key] === value).length
        ])
    )
  const catalog = {
    schema_version: CATALOG_VERSION,
    reference: { root: ref.root, commit: ref.commit, version: ref.version },
    owner_map_sha256: hash(
      json({
        ...map,
        package_owners: [...map.package_owners].sort((a, b) =>
          a.manifest.localeCompare(b.manifest, 'en')
        ),
        additional_surfaces: [...map.additional_surfaces].sort((a, b) =>
          a.reference_path.localeCompare(b.reference_path, 'en')
        )
      })
    ),
    parity_status: 'NOT_VERIFIED',
    sources: [...ref.reads.values()].sort((a, b) =>
      a.path.localeCompare(b.path, 'en')
    ),
    entries,
    summary: {
      entries: entries.length,
      sources: ref.reads.size,
      mapped_manifests: owners.packages.size,
      mapped_families: Object.keys(map.family_owners).length,
      additional_surfaces: owners.additional.length,
      by_kind: counts('kind'),
      by_owner: counts('owner_task'),
      by_extraction_status: counts('extraction_status')
    },
    limitations: [
      'Contract inventory is not functional equivalence, an acceptance denominator reduction or task approval.',
      'Only committed allowlisted contract sources are read; test bodies, examples, builds, binaries, credentials and user sessions are excluded.',
      'Utility and test-support package source contracts remain infrastructure closure, never parity PASS.',
      'No type checker, dependency resolution, runtime-inferred API, plugin boot or generated-doc freshness execution.',
      'YAML/TOML and native ABI bodies remain UNKNOWN; Python declarations use isolated stdlib ast, never reference imports.',
      'Semantic journey completeness and original owner mappings require Lead review; documented default tool schemas do not imply all dynamic variants.',
      'Untracked python/sdk-runtime/src/deepseek_harness_runtime/runtime distribution is not source-authenticated; tracked files are included. Artifact closure remains UNKNOWN under P100-052.'
    ],
    artifact_closures: [
      {
        path: 'python/sdk-runtime/src/deepseek_harness_runtime/runtime',
        owner_task: 'P100-052',
        status: 'UNKNOWN',
        reason:
          'Generated distribution build/provenance not executed or authenticated by source inventory'
      }
    ]
  }
  catalog.catalog_sha256 = hash(json(catalog))
  validateCatalog(catalog)
  return catalog
}

export function validateCatalog(catalog, { root } = {}) {
  if (
    catalog?.schema_version !== CATALOG_VERSION ||
    catalog.parity_status !== 'NOT_VERIFIED' ||
    !Array.isArray(catalog.entries) ||
    !Array.isArray(catalog.sources) ||
    !catalog.entries.length ||
    !catalog.sources.length
  )
    fail('INVALID_CATALOG', 'shape/status')
  if (
    !catalog.reference ||
    !path.isAbsolute(catalog.reference.root ?? '') ||
    !/^[a-f0-9]{40,64}$/.test(catalog.reference.commit ?? '') ||
    !catalog.reference.version ||
    !/^[a-f0-9]{64}$/.test(catalog.owner_map_sha256 ?? '')
  )
    fail('INVALID_CATALOG', 'reference/owner identity')
  if (root && fs.realpathSync(root) !== catalog.reference.root)
    fail('ROOT_MISMATCH', root)
  const ref = root
    ? inspectReference(
        root,
        catalog.reference.commit,
        catalog.reference.version
      )
    : undefined
  const candidates = ref
    ? new Set([...ref.tree.keys()].filter(isCandidate))
    : undefined
  const sources = new Map()
  for (const source of catalog.sources) {
    relativePath(source.path)
    if (sources.has(source.path) || !/^[a-f0-9]{64}$/.test(source.sha256))
      fail('DUPLICATE_OR_INVALID_SOURCE', source.path)
    sources.set(source.path, source)
    if (ref) {
      if (!candidates.has(source.path)) fail('UNMODELED_SOURCE', source.path)
      ref.read(source.path)
      const authenticated = ref.reads.get(source.path)
      if (
        source.sha256 !== authenticated.sha256 ||
        source.git_blob !== authenticated.git_blob ||
        source.bytes !== authenticated.bytes
      )
        fail('SOURCE_DRIFT', source.path)
    }
  }
  if (candidates)
    for (const name of candidates)
      if (!sources.has(name)) fail('MISSING_PIN_SOURCE', name)
  const ids = new Set()
  for (const entry of catalog.entries) {
    if (ids.has(entry.id)) fail('DUPLICATE_ID', entry.id)
    ids.add(entry.id)
    const identity = {
      kind: entry.kind,
      package: entry.package,
      source: entry.source,
      symbol: entry.symbol
    }
    if (
      entry.id !== `contract:${hash(json(identity))}` ||
      !/^P100-\d{3}$/.test(entry.owner_task) ||
      entry.parity_status !== 'NOT_VERIFIED'
    )
      fail('INVALID_ENTRY', entry.id)
    if (
      !sources.has(entry.source) ||
      sources.get(entry.source).sha256 !== entry.source_sha256
    )
      fail('MISSING_SOURCE', entry.source)
    if (
      hash(json(entry.shape)) !== entry.contract_sha256 ||
      entry.extraction_status !==
        (hasUnknown(entry.shape) ? 'UNKNOWN' : 'STATIC')
    )
      fail('INVALID_CONTRACT', entry.id)
  }
  const { catalog_sha256: digest, ...content } = catalog
  if (digest !== hash(json(content))) fail('CATALOG_DRIFT', 'digest')
  if (
    catalog.summary?.entries !== ids.size ||
    catalog.summary?.sources !== sources.size
  )
    fail('INVALID_CATALOG', 'summary denominator')
  return {
    status: 'VALID_STATIC_CATALOG',
    parity_status: 'NOT_VERIFIED',
    entries: ids.size,
    sources: sources.size
  }
}

export function compareCatalogFreeze(frozen, current, options = {}) {
  validateCatalog(frozen)
  validateCatalog(current, options)
  if (
    json(frozen.reference) !== json(current.reference) ||
    frozen.owner_map_sha256 !== current.owner_map_sha256
  )
    fail('REFERENCE_DRIFT', 'root/pin/version/owner map')
  const currentEntries = new Map(
    current.entries.map((entry) => [entry.id, entry])
  )
  for (const entry of frozen.entries) {
    const actual = currentEntries.get(entry.id)
    if (!actual) fail('REQUIREMENT_REMOVED', entry.id)
    if (json(entry) !== json(actual)) fail('CONTRACT_DRIFT', entry.id)
  }
  if (frozen.catalog_sha256 !== current.catalog_sha256)
    fail('FREEZE_DRIFT', 'sources/additions/metadata changed')
  return {
    status: 'UNCHANGED_STATIC_FREEZE',
    parity_status: 'NOT_VERIFIED',
    catalog_sha256: current.catalog_sha256
  }
}

function checkOutputPath(output, root) {
  let ancestor = path.dirname(output)
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor)
  const realOutput = path.join(
    fs.realpathSync(ancestor),
    path.relative(ancestor, output)
  )
  const realRoot = fs.realpathSync(root)
  if (
    realOutput === realRoot ||
    realOutput.startsWith(`${realRoot}${path.sep}`)
  )
    fail('OUTPUT_IN_REFERENCE', output)
  if (realOutput !== output) fail('OUTPUT_ALIAS', output)
  // lstat includes dangling links, unlike existsSync.
  let info
  try {
    info = fs.lstatSync(output)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (info && (info.isSymbolicLink() || !info.isFile()))
    fail('OUTPUT_ALIAS', output)
  if (info?.nlink > 1) fail('OUTPUT_HARDLINK', output)
}

function writeCatalogAtomically(output, root, contents) {
  checkOutputPath(output, root)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  checkOutputPath(output, root)
  const dir = fs.mkdtempSync(path.join(path.dirname(output), '.catalog-write-'))
  const temporaryOutput = path.join(dir, 'catalog.json')
  try {
    // Exclusive new inode; never truncate an existing output/input inode.
    const fd = fs.openSync(
      temporaryOutput,
      fs.constants.O_WRONLY |
        fs.constants.O_CREAT |
        fs.constants.O_EXCL |
        fs.constants.O_NOFOLLOW,
      0o600
    )
    try {
      fs.writeFileSync(fd, contents, 'utf8')
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    checkOutputPath(output, root)
    fs.renameSync(temporaryOutput, output)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

export function runCli(args) {
  const options = new Map()
  const allowed = [
    '--root',
    '--commit',
    '--version',
    '--owner-map',
    '--output',
    '--freeze'
  ]
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(
      'Usage: node scripts/reference-contract-catalog.mjs --root ABSOLUTE --owner-map MAP.json --output CATALOG.json [--commit SHA --version VERSION --freeze CATALOG.json]\nRead-only static collection. Every functional contract stays NOT_VERIFIED.\n'
    )
    return
  }
  for (let index = 0; index < args.length; index += 2) {
    if (
      !allowed.includes(args[index]) ||
      options.has(args[index]) ||
      !args[index + 1] ||
      args[index + 1].startsWith('--')
    )
      fail('CLI_ARGUMENT', args[index])
    options.set(args[index], args[index + 1])
  }
  for (const required of ['--root', '--owner-map', '--output'])
    if (!options.has(required)) fail('CLI_ARGUMENT', `${required} required`)
  const root = options.get('--root'),
    output = path.resolve(options.get('--output'))
  if (sensitive(output) || !output.endsWith('.json'))
    fail('UNSAFE_JSON_OUTPUT', output)
  checkOutputPath(output, root)
  if (output === fs.realpathSync(options.get('--owner-map')))
    fail('OUTPUT_IN_INPUT', output)
  const catalog = collectReferenceCatalog({
    root,
    expectedCommit: options.get('--commit') ?? REFERENCE_PIN,
    expectedVersion: options.get('--version') ?? REFERENCE_VERSION,
    ownerMap: options.get('--owner-map')
  })
  if (options.has('--freeze'))
    compareCatalogFreeze(readJsonData(options.get('--freeze')), catalog, {
      root
    })
  writeCatalogAtomically(output, root, serializeCatalog(catalog))
  process.stdout.write(
    `${JSON.stringify({ output, file_sha256: hash(fs.readFileSync(output)), catalog_sha256: catalog.catalog_sha256, ...catalog.summary, parity_status: catalog.parity_status })}\n`
  )
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    runCli(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
