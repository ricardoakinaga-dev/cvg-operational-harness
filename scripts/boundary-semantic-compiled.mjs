// SPEC0236: compiler-only provenance. No application or lifecycle is executed.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
  canonicalJson,
  sha256File,
  fingerprintToolchain,
  collectPackageInventory,
  createInstalledIdentityComparator,
  pinnedToolchainLocation,
  INSTALLED_IDENTITY_LIMITS
} from './boundary-installed-identity.mjs'

// Location only (CVG_PINNED_NODE/CVG_PINNED_NPM or the running Node); the
// toolchain() check below still requires the pinned NODE_SHA and npm identity.
const { node: NODE, npm: NPM } = pinnedToolchainLocation()
const NODE_SHA =
  '3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327'
const AUX = {
  '/usr/bin/git':
    '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668',
  '/usr/bin/tar':
    '3ee2c3c0b4dd9aacebfd2f0fbae44bad36348203acff78a44888dd58c05f811c'
}
// The compiler bundle is part of the explicitly selected parser/compiler TCB.
const TS_SHA =
  '569177652966bd528c319171c7dd22860dbf72bde116cbc4f644f1d02bb12e39'
const SELF = fileURLToPath(import.meta.url)
const REQUIRED = 'packages/contracts/dist/canonical-json.js'
const SOURCE_ROOTS = ['packages/shared/src', 'packages/contracts/src']
const CONFIGS = [
  'package.json',
  'package-lock.json',
  'tsconfig.base.json',
  'packages/shared/package.json',
  'packages/shared/tsconfig.json',
  'packages/contracts/package.json',
  'packages/contracts/tsconfig.json'
]
const error = (code) => Object.assign(new Error(code), { code })
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const safe = (name) =>
  typeof name === 'string' &&
  name !== '' &&
  !path.isAbsolute(name) &&
  !name.includes('\\') &&
  !name.split('/').some((p) => ['', '.', '..'].includes(p))
const regular = (filename) => {
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || fs.realpathSync(filename) !== filename)
    throw error('COMPILED_PATH_ALIAS')
  return stat
}
const read = (root, name) => {
  if (!safe(name)) throw error('COMPILED_PATH_INVALID')
  const target = path.join(root, name)
  regular(target)
  return fs.readFileSync(target)
}
function walk(root, relative, filter = () => true, rows = []) {
  const directory = path.join(root, relative)
  if (!fs.existsSync(directory)) return rows
  if (
    fs.realpathSync(directory) !== directory ||
    !fs.lstatSync(directory).isDirectory()
  )
    throw error('COMPILED_PATH_ALIAS')
  for (const item of fs
    .readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const name = relative ? `${relative}/${item.name}` : item.name
    if (item.isSymbolicLink()) throw error('COMPILED_PATH_ALIAS')
    if (item.isDirectory()) walk(root, name, filter, rows)
    else if (item.isFile() && filter(name)) {
      const bytes = read(root, name)
      rows.push({ file: name, bytes: bytes.length, sha256: hash(bytes) })
    } else if (!item.isFile()) throw error('COMPILED_FILE_TYPE')
  }
  return rows
}
function sourceInputs(root) {
  const rows = CONFIGS.map((file) => ({
    file,
    bytes: read(root, file).length,
    sha256: hash(read(root, file))
  }))
  for (const directory of SOURCE_ROOTS)
    walk(root, directory, (name) => /\.(?:ts|json)$/.test(name), rows)
  // Config chains are deliberately closed for this first recipe.
  for (const file of [
    'tsconfig.base.json',
    'packages/shared/tsconfig.json',
    'packages/contracts/tsconfig.json'
  ]) {
    const text = read(root, file).toString('utf8')
    const config = JSON.parse(text)
    if (config.compilerOptions?.plugins?.length)
      throw error('COMPILED_CONFIG_UNSUPPORTED')
    if (file === 'tsconfig.base.json' && (config.extends || config.references))
      throw error('COMPILED_CONFIG_UNSUPPORTED')
    if (
      file !== 'tsconfig.base.json' &&
      config.extends !== '../../tsconfig.base.json'
    )
      throw error('COMPILED_CONFIG_UNSUPPORTED')
    const refs = config.references ?? []
    if (file.includes('/contracts/') && refs.length)
      throw error('COMPILED_CONFIG_UNSUPPORTED')
    if (
      file.includes('/shared/') &&
      (refs.length !== 1 || refs[0].path !== '../contracts')
    )
      throw error('COMPILED_CONFIG_UNSUPPORTED')
    const expectedOut = file === 'tsconfig.base.json' ? undefined : 'dist'
    if (
      expectedOut &&
      (config.compilerOptions?.outDir !== expectedOut ||
        config.compilerOptions?.rootDir !== 'src')
    )
      throw error('COMPILED_CONFIG_UNSUPPORTED')
  }
  return rows.sort((a, b) => a.file.localeCompare(b.file))
}
function compilerInventory(root) {
  const rows = walk(root, 'node_modules/typescript')
  const pkg = JSON.parse(read(root, 'node_modules/typescript/package.json'))
  if (
    pkg.version !== '6.0.3' ||
    hash(read(root, 'node_modules/typescript/lib/typescript.js')) !== TS_SHA
  )
    throw error('COMPILED_COMPILER_UNSUPPORTED')
  if (!rows.length) throw error('COMPILED_COMPILER_UNAVAILABLE')
  return { treeSha256: hash(canonicalJson(rows)), files: rows }
}
function dependencies(root, reference) {
  if (
    !reference?.manifestPath ||
    !/^[a-f0-9]{64}$/.test(reference.expectedSha256 ?? '')
  )
    throw error('COMPILED_INSTALLED_REFERENCE_REQUIRED')
  const bytes = fs.readFileSync(reference.manifestPath)
  if (hash(bytes) !== reference.expectedSha256)
    throw error('COMPILED_INSTALLED_REFERENCE_INVALID')
  const receipt = JSON.parse(bytes)
  const compare = createInstalledIdentityComparator(root, reference)
  const rows = receipt.packages.map(({ key }) => ({
    key,
    result: compare.compare(path.join(root, key), key)
  }))
  compare.finalize()
  if (rows.some(({ result }) => result.status !== 'MATCH'))
    throw error('COMPILED_DEPENDENCIES_UNVERIFIED')
  return rows.map(({ key, result }) => ({
    key,
    inventorySha256: result.inventory.evaluated.inventorySha256
  }))
}
function copiedDependencies(root, expected) {
  return expected.map(({ key }) => ({
    key,
    inventorySha256: collectPackageInventory(path.join(root, key))
      .inventorySha256
  }))
}
function environment() {
  return {
    PATH: path.dirname(NODE) + ':/usr/bin:/bin',
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0'
  }
}
function command(argv, cwd, env, log) {
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd,
    env,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
    killSignal: 'SIGKILL'
  })
  const row = {
    argv,
    cwd,
    exitCode: result.status,
    signal: result.signal,
    errorCode: result.error?.code ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  }
  log.push(row)
  if (result.error || result.status !== 0)
    throw error('COMPILED_COMMAND_FAILED')
  return result.stdout
}
function toolchain() {
  const current = fingerprintToolchain({ nodePath: NODE, npmRoot: NPM })
  // Values are checked against the already approved local Node22 toolchain.
  if (
    process.versions.node !== '22.23.2' ||
    sha256File(process.execPath) !== NODE_SHA ||
    current.nodeVersion !== '22.23.2' ||
    current.nodeSha256 !== NODE_SHA
  )
    throw error('COMPILED_NODE_UNSUPPORTED')
  for (const [filename, digest] of Object.entries(AUX))
    if (sha256File(filename) !== digest)
      throw error('COMPILED_AUXILIARY_UNSUPPORTED')
  return { ...current, auxiliaryPins: AUX }
}
function assertSame(left, right, code) {
  if (canonicalJson(left) !== canonicalJson(right)) throw error(code)
}
function publicResolutions(root, env, commands = []) {
  const code =
    "console.log(JSON.stringify(['@cvg/harness-contracts','@cvg/shared'].map(specifier=>({specifier,url:import.meta.resolve(specifier)}))))"
  const rows = JSON.parse(
    command([NODE, '--input-type=module', '--eval', code], root, env, commands)
  )
  return rows.map(({ specifier, url }, index) => {
    const file =
      index === 0
        ? 'packages/contracts/dist/index.js'
        : 'packages/shared/dist/index.js'
    if (fileURLToPath(url) !== path.join(root, file))
      throw error('COMPILED_EXPORT_RESOLUTION')
    return { specifier, file, sha256: hash(read(root, file)) }
  })
}
// Enumerate the actual pinned compiler's input closure without emitting or
// importing application code. A declaration reached outside the two source
// inventories is still an input, even if it produces no JavaScript output.
function compilerInputObserver(load, root, parserSha) {
  const fs = load('node:fs')
  const path = load('node:path')
  const crypto = load('node:crypto')
  const parser = path.join(root, 'node_modules/typescript/lib/typescript.js')
  if (
    crypto
      .createHash('sha256')
      .update(fs.readFileSync(parser))
      .digest('hex') !== parserSha
  )
    throw Error('compiler pin')
  const ts = load(parser)
  const files = new Set()
  for (const project of ['contracts', 'shared']) {
    const config = ts.getParsedCommandLineOfConfigFile(
      path.join(root, 'packages', project, 'tsconfig.json'),
      {},
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic() {
          throw Error('compiler config')
        }
      }
    )
    if (!config || config.errors.length) throw Error('compiler config')
    const program = ts.createProgram({
      rootNames: config.fileNames,
      options: config.options
    })
    for (const source of program.getSourceFiles())
      files.add(path.resolve(source.fileName))
  }
  process.stdout.write(JSON.stringify([...files].sort()))
}
function compilerInputs(root, dependencyKeys, env, commands = []) {
  const code =
    '(' +
    compilerInputObserver.toString() +
    ')(require,process.argv[1],process.argv[2])'
  const paths = JSON.parse(
    command([NODE, '--eval', code, root, TS_SHA], root, env, commands)
  )
  if (!Array.isArray(paths) || paths.length > 12000)
    throw error('COMPILED_INPUT_LIMIT')
  return paths.map((file) => {
    const name = path.relative(root, file).split(path.sep).join('/')
    if (
      !safe(name) ||
      (!SOURCE_ROOTS.some((base) => name.startsWith(base + '/')) &&
        !dependencyKeys.some((base) => name.startsWith(base + '/')))
    )
      throw error('COMPILED_SOURCE_OUTSIDE_RECIPE')
    const bytes = read(root, name)
    return { file: name, sha256: hash(bytes), bytes: bytes.length }
  })
}
export function buildCompiledReference({
  sourceRoot,
  commit,
  outputRoot,
  dependenciesRoot,
  installedReference
}) {
  const source = fs.realpathSync(sourceRoot)
  const target = path.resolve(outputRoot)
  const depRoot = fs.realpathSync(dependenciesRoot ?? source)
  if (!/^[a-f0-9]{40}$/.test(commit ?? ''))
    throw error('COMPILED_COMMIT_REQUIRED')
  if (
    fs.existsSync(target) ||
    fs.realpathSync(path.dirname(target)) !== path.dirname(target) ||
    target.startsWith(source + path.sep) ||
    target.startsWith(depRoot + path.sep)
  )
    throw error('COMPILED_OUTPUT_NOT_FRESH')
  const tools = toolchain(),
    inputs = sourceInputs(source),
    compiler = compilerInventory(depRoot),
    deps = dependencies(depRoot, installedReference)
  const env = environment(),
    commands = []
  fs.mkdirSync(target, { mode: 0o700 })
  const snapshot = path.join(target, 'snapshot')
  fs.mkdirSync(snapshot, { mode: 0o700 })
  try {
    const git = [
      '/usr/bin/git',
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'core.fsmonitor=false'
    ]
    if (
      command([...git, 'rev-parse', 'HEAD'], source, env, commands).trim() !==
      commit
    )
      throw error('COMPILED_SOURCE_COMMIT_MISMATCH')
    // One git process keeps the 8 MiB buffer of command(). A larger listing is
    // paged per subtree, in git order (the union is `ls-tree -r` of the
    // commit); a directory whose immediate children alone exceed the buffer
    // stays refused. A page is addressed by a literal pathspec (never pathspec
    // magic) and must be non-empty, unquoted and under its own prefix. The
    // discarded partial stdout is not kept in the log, and a paged listing
    // keeps only the digest/size of each page in the log so commands.json
    // stays within the reader's 8 MiB bound.
    let pages = 0
    const listingRows = commands.length
    const tree = []
    const under = (names, prefix, direct) => {
      if (!names.length) throw error('COMPILED_SOURCE_TYPE')
      for (const name of names) {
        const rest = !prefix
          ? name
          : name.startsWith(prefix + '/')
            ? name.slice(prefix.length + 1)
            : ''
        if (!rest || name.startsWith('"') || (direct && rest.includes('/')))
          throw error('COMPILED_SOURCE_TYPE')
      }
    }
    const listTree = (prefix) => {
      if (++pages > INSTALLED_IDENTITY_LIMITS.maxEntries)
        throw error('COMPILED_SOURCE_LIMIT')
      const literal = prefix ? ['--literal-pathspecs'] : []
      const spec = prefix ? ['--', prefix] : []
      let page
      try {
        page = command(
          [
            ...git,
            ...literal,
            'ls-tree',
            '-r',
            '--format=%(objectmode) %(path)',
            commit,
            ...spec
          ],
          source,
          env,
          commands
        )
          .trim()
          .split('\n')
      } catch (cause) {
        const row = commands.at(-1)
        if (row?.errorCode !== 'ENOBUFS') throw cause
        row.stdoutDiscardedBytes = Buffer.byteLength(row.stdout)
        row.stdout = ''
      }
      if (page) {
        if (prefix)
          under(
            page.map((line) => line.slice(line.indexOf(' ') + 1)),
            prefix,
            false
          )
        for (const line of page) tree.push(line)
        return
      }
      const children = command(
        [
          ...git,
          ...literal,
          'ls-tree',
          '--format=%(objecttype) %(objectmode) %(path)',
          commit,
          ...(prefix ? ['--', prefix + '/'] : [])
        ],
        source,
        env,
        commands
      )
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const a = line.indexOf(' '),
            b = line.indexOf(' ', a + 1)
          return {
            type: line.slice(0, a),
            mode: line.slice(a + 1, b),
            name: line.slice(b + 1)
          }
        })
      under(
        children.map(({ name }) => name),
        prefix,
        true
      )
      for (const child of children)
        if (child.type === 'tree') listTree(child.name)
        else tree.push(child.mode + ' ' + child.name)
    }
    listTree('')
    if (pages > 1)
      for (const row of commands.slice(listingRows))
        if (row.stdout) {
          row.stdoutBytes = Buffer.byteLength(row.stdout)
          row.stdoutSha256 = hash(row.stdout)
          row.stdout = ''
        }
    if (
      tree.some(
        (line) => !/^100(?:644|755) /.test(line) || !safe(line.slice(7))
      )
    )
      throw error('COMPILED_SOURCE_TYPE')
    const archive = path.join(target, 'source.tar')
    command(
      [...git, 'archive', '--format=tar', '--output=' + archive, commit],
      source,
      env,
      commands
    )
    if (fs.statSync(archive).size > 4 * 1024 * 1024 * 1024)
      throw error('COMPILED_SOURCE_LIMIT')
    command(
      [
        '/usr/bin/tar',
        '-xf',
        archive,
        '-C',
        snapshot,
        '--no-same-owner',
        '--no-same-permissions',
        '--exclude=node_modules',
        '--exclude=*/node_modules',
        '--exclude=dist',
        '--exclude=*/dist',
        '--exclude=*.tsbuildinfo',
        '--exclude=.env*',
        '--exclude=*/.env*'
      ],
      source,
      env,
      commands
    )
    fs.unlinkSync(archive)
    assertSame(sourceInputs(snapshot), inputs, 'COMPILED_DIRTY_SOURCE')
    for (const project of ['packages/contracts', 'packages/shared']) {
      if (
        fs.existsSync(path.join(snapshot, project, 'dist')) ||
        walk(snapshot, project, (name) => name.endsWith('.tsbuildinfo')).length
      )
        throw error('COMPILED_OUTPUT_PREEXISTS')
    }
    fs.cpSync(
      path.join(depRoot, 'node_modules'),
      path.join(snapshot, 'node_modules'),
      { recursive: true, dereference: false, verbatimSymlinks: true }
    )
    // Rewrite only workspace links rooted in this owned source/dependency tree.
    const repair = (dir) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, item.name)
        if (item.isSymbolicLink()) {
          const link = fs.readlinkSync(p)
          if (path.isAbsolute(link) && link.startsWith(depRoot + path.sep)) {
            fs.unlinkSync(p)
            fs.symlinkSync(path.join(snapshot, path.relative(depRoot, link)), p)
          }
          const resolved = path.resolve(path.dirname(p), fs.readlinkSync(p))
          if (
            resolved !== snapshot &&
            !resolved.startsWith(snapshot + path.sep)
          )
            throw error('COMPILED_DEPENDENCY_LINK_EXTERNAL')
        } else if (item.isDirectory()) repair(p)
      }
    }
    repair(path.join(snapshot, 'node_modules'))
    assertSame(
      compilerInventory(snapshot),
      compiler,
      'COMPILED_COMPILER_COPY_MISMATCH'
    )
    assertSame(
      copiedDependencies(snapshot, deps),
      deps,
      'COMPILED_DEPENDENCY_COPY_MISMATCH'
    )
    const compilerSources = compilerInputs(
      snapshot,
      deps.map(({ key }) => key),
      env,
      commands
    )
    const before = { outputsAbsent: true, incrementalStateAbsent: true }
    const argv = [
      NODE,
      'node_modules/typescript/bin/tsc',
      '-b',
      'packages/shared/tsconfig.json',
      '--force'
    ]
    command(argv, snapshot, env, commands)
    const outputs = []
    for (const project of ['packages/contracts', 'packages/shared'])
      walk(snapshot, project + '/dist', () => true, outputs)
    if (!outputs.some((x) => x.file === REQUIRED))
      throw error('COMPILED_REQUIRED_OUTPUT_MISSING')
    const runtimeResolutions = publicResolutions(snapshot, env, commands)
    assertSame(sourceInputs(source), inputs, 'COMPILED_SOURCE_MUTATED')
    assertSame(sourceInputs(snapshot), inputs, 'COMPILED_SOURCE_MUTATED')
    assertSame(
      compilerInputs(
        snapshot,
        deps.map(({ key }) => key),
        env,
        commands
      ),
      compilerSources,
      'COMPILED_SOURCE_MUTATED'
    )
    assertSame(
      compilerInventory(snapshot),
      compiler,
      'COMPILED_COMPILER_MUTATED'
    )
    assertSame(
      dependencies(depRoot, installedReference),
      deps,
      'COMPILED_DEPENDENCIES_MUTATED'
    )
    assertSame(
      copiedDependencies(snapshot, deps),
      deps,
      'COMPILED_DEPENDENCIES_MUTATED'
    )
    assertSame(toolchain(), tools, 'COMPILED_TOOLCHAIN_MUTATED')
    const commandBytes = JSON.stringify(commands, null, 2) + '\n'
    const receipt = {
      schemaVersion: 1,
      kind: 'cvg-compiled-build-reference',
      recipeVersion: 'shared-contracts-fresh-force-v1',
      recipeSha256: sha256File(SELF),
      sourceRoot: source,
      commit,
      root: snapshot,
      evaluatedRoot: source,
      installedReferenceDigest: installedReference.expectedSha256,
      toolchain: tools,
      compiler,
      compilerSources,
      inputs,
      dependencies: deps,
      before,
      argv,
      cwd: snapshot,
      environment: env,
      exitCode: 0,
      commandsSha256: hash(commandBytes),
      runtimeResolutions,
      outputs: outputs.sort((a, b) => a.file.localeCompare(b.file))
    }
    const bytes = canonicalJson(receipt),
      manifestPath = path.join(target, 'reference.json'),
      partial = path.join(target, '.reference.partial')
    fs.writeFileSync(path.join(target, 'commands.json'), commandBytes, {
      flag: 'wx',
      mode: 0o600
    })
    const fd = fs.openSync(partial, 'wx', 0o600)
    try {
      fs.writeFileSync(fd, bytes)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    fs.renameSync(partial, manifestPath)
    return { manifestPath, expectedSha256: hash(bytes), receipt }
  } catch (cause) {
    fs.writeFileSync(
      path.join(target, 'failure.json'),
      JSON.stringify(
        { status: 'UNAVAILABLE', code: causesafe(cause), commands },
        null,
        2
      ) + '\n',
      { flag: 'wx', mode: 0o600 }
    )
    throw cause
  }
}
const causesafe = (cause) =>
  /^[A-Z0-9_]+$/.test(cause?.code ?? '')
    ? cause.code
    : 'COMPILED_BUILD_UNAVAILABLE'
export function loadCompiledBuildReference(
  root,
  reference,
  { installedReference } = {}
) {
  try {
    if (
      !reference?.manifestPath ||
      !/^[a-f0-9]{64}$/.test(reference.expectedSha256 ?? '')
    )
      throw error('COMPILED_REFERENCE_REQUIRED')
    const evaluated = fs.realpathSync(root),
      file = path.resolve(reference.manifestPath)
    regular(file)
    const raw = fs.readFileSync(file)
    if (raw.length > 8 * 1024 * 1024 || hash(raw) !== reference.expectedSha256)
      throw error('COMPILED_REFERENCE_DIGEST')
    const r = JSON.parse(raw)
    if (
      canonicalJson(r) !== raw.toString('utf8') ||
      r.schemaVersion !== 1 ||
      r.kind !== 'cvg-compiled-build-reference' ||
      r.recipeVersion !== 'shared-contracts-fresh-force-v1' ||
      r.exitCode !== 0 ||
      r.recipeSha256 !== sha256File(SELF)
    )
      throw error('COMPILED_REFERENCE_INVALID')
    if (
      r.evaluatedRoot !== evaluated ||
      r.sourceRoot !== evaluated ||
      fs.realpathSync(r.root) !== r.root ||
      r.cwd !== r.root ||
      r.root.startsWith(evaluated + path.sep)
    )
      throw error('COMPILED_VARIANT_MISMATCH')
    if (r.installedReferenceDigest !== installedReference?.expectedSha256)
      throw error('COMPILED_INSTALLED_REFERENCE_INVALID')
    assertSame(
      r.before,
      { outputsAbsent: true, incrementalStateAbsent: true },
      'COMPILED_INITIAL_STATE_INVALID'
    )
    assertSame(
      r.argv,
      [
        NODE,
        'node_modules/typescript/bin/tsc',
        '-b',
        'packages/shared/tsconfig.json',
        '--force'
      ],
      'COMPILED_RECIPE_INVALID'
    )
    assertSame(r.environment, environment(), 'COMPILED_ENVIRONMENT_INVALID')
    const commandFile = path.join(path.dirname(file), 'commands.json')
    regular(commandFile)
    const commandBytes = fs.readFileSync(commandFile)
    if (
      commandBytes.length > 8 * 1024 * 1024 ||
      hash(commandBytes) !== r.commandsSha256
    )
      throw error('COMPILED_BUILD_EVENT_INVALID')
    const commands = JSON.parse(commandBytes)
    if (
      !Array.isArray(commands) ||
      !commands.some(
        (row) =>
          row.exitCode === 0 &&
          row.cwd === r.root &&
          canonicalJson(row.argv) === canonicalJson(r.argv)
      )
    )
      throw error('COMPILED_BUILD_EVENT_INVALID')
    assertSame(toolchain(), r.toolchain, 'COMPILED_TOOLCHAIN_MUTATED')
    assertSame(
      compilerInventory(evaluated),
      r.compiler,
      'COMPILED_COMPILER_MUTATED'
    )
    assertSame(
      compilerInventory(r.root),
      r.compiler,
      'COMPILED_COMPILER_MUTATED'
    )
    assertSame(sourceInputs(evaluated), r.inputs, 'COMPILED_SOURCE_MUTATED')
    assertSame(sourceInputs(r.root), r.inputs, 'COMPILED_SOURCE_MUTATED')
    const dependencyKeys = r.dependencies.map(({ key }) => key)
    assertSame(
      compilerInputs(evaluated, dependencyKeys, environment()),
      r.compilerSources,
      'COMPILED_SOURCE_MUTATED'
    )
    assertSame(
      compilerInputs(r.root, dependencyKeys, environment()),
      r.compilerSources,
      'COMPILED_SOURCE_MUTATED'
    )
    assertSame(
      dependencies(evaluated, installedReference),
      r.dependencies,
      'COMPILED_DEPENDENCIES_MUTATED'
    )
    assertSame(
      copiedDependencies(r.root, r.dependencies),
      r.dependencies,
      'COMPILED_DEPENDENCIES_MUTATED'
    )
    assertSame(
      publicResolutions(r.root, environment()),
      r.runtimeResolutions,
      'COMPILED_EXPORT_RESOLUTION'
    )
    assertSame(
      publicResolutions(evaluated, environment()),
      r.runtimeResolutions,
      'COMPILED_EXPORT_RESOLUTION'
    )
    const currentOutputs = []
    for (const project of ['packages/contracts', 'packages/shared'])
      walk(r.root, project + '/dist', () => true, currentOutputs)
    assertSame(
      currentOutputs.sort((a, b) => a.file.localeCompare(b.file)),
      r.outputs,
      'COMPILED_OUTPUT_MUTATED'
    )
    if (!Array.isArray(r.outputs) || r.outputs.length > 12000)
      throw error('COMPILED_OUTPUTS_INVALID')
    const files = []
    const seen = new Set()
    for (const row of r.outputs) {
      if (
        !safe(row.file) ||
        !/^packages\/(?:contracts|shared)\/dist\//.test(row.file) ||
        seen.has(row.file) ||
        !/^[a-f0-9]{64}$/.test(row.sha256)
      )
        throw error('COMPILED_OUTPUTS_INVALID')
      seen.add(row.file)
      const built = read(r.root, row.file)
      if (built.length !== row.bytes || hash(built) !== row.sha256)
        throw error('COMPILED_OUTPUT_MUTATED')
      if (fs.existsSync(path.join(evaluated, row.file))) {
        const actual = read(evaluated, row.file)
        if (actual.length === row.bytes && hash(actual) === row.sha256)
          files.push({ file: row.file, sha256: row.sha256 })
        else if (row.file === REQUIRED) throw error('COMPILED_OUTPUT_MISMATCH')
      }
    }
    if (!files.some((x) => x.file === REQUIRED))
      throw error('COMPILED_REQUIRED_OUTPUT_MISSING')
    return {
      status: 'PROVEN',
      recipeVersion: r.recipeVersion,
      referenceDigest: reference.expectedSha256,
      files,
      inputs: r.inputs,
      compilerTreeSha256: r.compiler.treeSha256
    }
  } catch (cause) {
    return { status: 'UNAVAILABLE', reason: causesafe(cause), files: [] }
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
    'dependencies-root': 'dependenciesRoot',
    'installed-reference': 'manifestPath',
    'installed-reference-sha256': 'expectedSha256'
  }
  try {
    const opts = {}
    const installedReference = {}
    for (const arg of process.argv.slice(2)) {
      const match = /^--([a-z0-9-]+)=(.+)$/.exec(arg)
      if (!match || !names[match[1]])
        throw error('COMPILED_CLI_OPTIONS_INVALID')
      const key = names[match[1]],
        target = ['manifestPath', 'expectedSha256'].includes(key)
          ? installedReference
          : opts
      if (Object.hasOwn(target, key))
        throw error('COMPILED_CLI_OPTIONS_INVALID')
      target[key] = match[2]
    }
    const { manifestPath, expectedSha256 } = buildCompiledReference({
      ...opts,
      installedReference
    })
    console.log(JSON.stringify({ manifestPath, expectedSha256 }))
  } catch (cause) {
    console.error(
      JSON.stringify({ status: 'UNAVAILABLE', code: causesafe(cause) })
    )
    process.exitCode = 2
  }
}
