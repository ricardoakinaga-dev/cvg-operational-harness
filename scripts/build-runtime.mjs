#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const RUNTIME_WORKSPACES = [
  'packages/contracts',
  'packages/orchestrator',
  'packages/harness',
  'packages/shared',
  'packages/rag',
  'packages/platform',
  'packages/approval-engine',
  'packages/channel-gateway',
  'packages/policy-engine',
  'packages/model-gateway',
  'packages/observability',
  'packages/agent-runtime',
  'packages/policy',
  'packages/persistence',
  'packages/agent-core',
  'legacy/packages/secretary-profile',
  'apps/api'
]

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const generatedConfigRoot = path.join(os.tmpdir(), 'cvg-runtime-tsconfigs')
const args = process.argv.slice(2)
const contextArgIndex = args.indexOf('--context-dir')
const contextDir = path.resolve(
  contextArgIndex >= 0
    ? (args[contextArgIndex + 1] ?? '')
    : path.join(os.tmpdir(), 'cvg-runtime')
)

function fail(message) {
  throw new Error(`runtime_build_failed:${message}`)
}

function copyFile(relativePath) {
  const source = path.join(root, relativePath)
  const target = path.join(contextDir, relativePath)
  if (!fs.existsSync(source)) fail(`missing_source:${relativePath}`)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target)
}

function copyDirectory(relativePath) {
  const source = path.join(root, relativePath)
  const target = path.join(contextDir, relativePath)
  if (!fs.existsSync(source)) fail(`missing_source:${relativePath}`)
  fs.cpSync(source, target, { recursive: true })
}

function removeContextSafely() {
  const tempPrefix = path.join(os.tmpdir(), 'cvg-runtime')
  if (
    contextDir !== tempPrefix &&
    !contextDir.startsWith(`${tempPrefix}-`) &&
    !contextDir.startsWith(`${tempPrefix}/`)
  ) {
    fail(`unsafe_context_dir:${contextDir}`)
  }
  fs.rmSync(contextDir, { recursive: true, force: true })
  fs.mkdirSync(contextDir, { recursive: true })
}

function runtimeBaseConfig() {
  return {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      esModuleInterop: true,
      forceConsistentCasingInFileNames: true,
      skipLibCheck: true,
      resolveJsonModule: true,
      declaration: true,
      sourceMap: true,
      composite: true,
      noEmitOnError: true,
      ignoreDeprecations: '6.0',
      allowImportingTsExtensions: true,
      rewriteRelativeImportExtensions: true,
      types: ['node'],
      typeRoots: [path.join(root, 'node_modules', '@types')]
    }
  }
}

function createRuntimeProjectConfigs() {
  fs.rmSync(generatedConfigRoot, { recursive: true, force: true })
  fs.mkdirSync(generatedConfigRoot, { recursive: true })
  fs.writeFileSync(
    path.join(generatedConfigRoot, 'base.json'),
    `${JSON.stringify(runtimeBaseConfig(), null, 2)}\n`
  )

  const workspaceByPackageName = new Map()
  for (const workspace of RUNTIME_WORKSPACES) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, workspace, 'package.json'), 'utf8')
    )
    workspaceByPackageName.set(manifest.name, workspace)
  }

  const projectConfigs = []
  for (const workspace of RUNTIME_WORKSPACES) {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, workspace, 'package.json'), 'utf8')
    )
    const configPath = path.join(
      generatedConfigRoot,
      `${workspace.replaceAll('/', '-')}.json`
    )
    const dependencies = Object.keys(manifest.dependencies ?? {})
      .map((name) => workspaceByPackageName.get(name))
      .filter((workspaceName) => workspaceName !== undefined)
    const config = {
      extends: path.join(generatedConfigRoot, 'base.json'),
      compilerOptions: {
        rootDir: path.join(root, workspace, 'src'),
        outDir: path.join(root, workspace, 'dist'),
        tsBuildInfoFile: path.join(
          root,
          workspace,
          'dist',
          'tsconfig.runtime.tsbuildinfo'
        )
      },
      include: [path.join(root, workspace, 'src/**/*.ts')],
      exclude: [
        path.join(root, workspace, 'src/**/*.test.ts'),
        path.join(root, workspace, 'src/**/__tests__/**')
      ],
      references: dependencies.map((dependency) => ({
        path: path.join(
          generatedConfigRoot,
          `${dependency.replaceAll('/', '-')}.json`
        )
      }))
    }
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
    projectConfigs.push(configPath)
  }
  const solutionPath = path.join(generatedConfigRoot, 'solution.json')
  fs.writeFileSync(
    solutionPath,
    `${JSON.stringify(
      {
        files: [],
        references: projectConfigs.map((configPath) => ({ path: configPath }))
      },
      null,
      2
    )}\n`
  )
  return solutionPath
}

function compile() {
  const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc')
  if (!fs.existsSync(tsc)) fail('typescript_not_installed')
  for (const workspace of RUNTIME_WORKSPACES) {
    fs.rmSync(path.join(root, workspace, 'dist'), {
      recursive: true,
      force: true
    })
  }
  const solutionPath = createRuntimeProjectConfigs()
  const result = spawnSync(
    process.execPath,
    [tsc, '-b', solutionPath, '--force', '--pretty', 'false'],
    { cwd: root, stdio: 'inherit' }
  )
  if (result.status !== 0) fail(`tsc_exit:${result.status ?? 'signal'}`)
}

function assertCompiledOutput(relativePath) {
  const dist = path.join(root, relativePath, 'dist')
  if (!fs.existsSync(dist)) fail(`missing_dist:${relativePath}`)
  const files = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else files.push(absolute)
    }
  }
  visit(dist)
  if (files.length === 0) fail(`empty_dist:${relativePath}`)
  if (files.some((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))) {
    fail(`typescript_in_dist:${relativePath}`)
  }
}

function copyWorkspaceManifests() {
  copyFile('package.json')
  copyFile('package-lock.json')
  for (const group of ['apps', 'packages', 'legacy/packages']) {
    const directory = path.join(root, group)
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const relativePath = path.join(group, entry.name, 'package.json')
      if (fs.existsSync(path.join(root, relativePath))) copyFile(relativePath)
    }
  }
}

function main() {
  compile()
  for (const workspace of RUNTIME_WORKSPACES) assertCompiledOutput(workspace)
  removeContextSafely()
  copyWorkspaceManifests()
  for (const workspace of RUNTIME_WORKSPACES) {
    copyDirectory(path.join(workspace, 'dist'))
  }
  copyDirectory('packages/persistence/migrations')
  copyFile('scripts/runtime-image-smoke.mjs')
  fs.writeFileSync(
    path.join(contextDir, 'runtime-context.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: 'cvg-runtime-context',
        compiledWorkspaces: RUNTIME_WORKSPACES,
        sourceIncluded: false,
        testIncluded: false,
        generatedAt: new Date().toISOString()
      },
      null,
      2
    )}\n`
  )
  process.stdout.write(
    `${JSON.stringify({
      contextDir,
      compiledWorkspaces: RUNTIME_WORKSPACES,
      sourceIncluded: false
    })}\n`
  )
}

try {
  main()
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  )
  process.exitCode = 1
}
