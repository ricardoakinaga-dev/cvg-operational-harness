import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

// Compile workspace dependency closures against actual package exports, with
// no TypeScript source aliases. Each invocation owns its temporary configs.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = process.argv[2]
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'package.json'), 'utf8')
)
const workspaces = new Map()
for (const pattern of manifest.workspaces) {
  if (!pattern.endsWith('/*'))
    throw new Error(`unsupported_workspace:${pattern}`)
  const parent = pattern.slice(0, -2)
  if (!fs.existsSync(path.join(root, parent))) continue
  for (const dir of fs.readdirSync(path.join(root, parent), {
    withFileTypes: true
  })) {
    if (!dir.isDirectory()) continue
    const workspace = `${parent}/${dir.name}`
    const file = path.join(root, workspace, 'package.json')
    if (!fs.existsSync(file)) continue
    const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
    workspaces.set(pkg.name, { workspace, pkg })
  }
}
const selected = [...workspaces.values()].find(
  (item) => item.workspace === target
)
if (!selected) throw new Error(`unknown_workspace:${target}`)
const ordered = []
const visiting = new Set()
const seen = new Set()
function visit(item) {
  if (visiting.has(item.pkg.name))
    throw new Error(`workspace_cycle:${item.pkg.name}`)
  if (seen.has(item.pkg.name)) return
  visiting.add(item.pkg.name)
  for (const name of Object.keys(item.pkg.dependencies ?? {})) {
    const dependency = workspaces.get(name)
    if (dependency) visit(dependency)
  }
  visiting.delete(item.pkg.name)
  seen.add(item.pkg.name)
  ordered.push(item)
}
visit(selected)
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'cvg-public-build-'))
try {
  const configs = new Map(
    ordered.map((item) => [
      item.pkg.name,
      path.join(temporary, `${item.pkg.name.replaceAll('/', '-')}.json`)
    ])
  )
  for (const { workspace, pkg } of ordered) {
    const configuration = {
      extends: path.join(root, 'tsconfig.base.json'),
      compilerOptions: {
        paths: {},
        rootDir: path.join(root, workspace, 'src'),
        outDir: path.join(root, workspace, 'dist'),
        tsBuildInfoFile: path.join(
          root,
          workspace,
          'dist',
          'tsconfig.public.tsbuildinfo'
        ),
        typeRoots: [path.join(root, 'node_modules', '@types')],
        noEmitOnError: true
      },
      include: [path.join(root, workspace, 'src/**/*.ts')],
      exclude: [
        path.join(root, workspace, 'src/**/*.test.ts'),
        path.join(root, workspace, 'src/**/__tests__/**'),
        path.join(root, workspace, 'src/sandbox/**')
      ],
      references: Object.keys(pkg.dependencies ?? {})
        .filter((name) => configs.has(name))
        .map((name) => ({ path: configs.get(name) }))
    }
    fs.writeFileSync(
      configs.get(pkg.name),
      `${JSON.stringify(configuration, null, 2)}\n`
    )
  }
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      '-b',
      configs.get(selected.pkg.name),
      '--force',
      '--pretty',
      'false'
    ],
    { cwd: root, stdio: 'inherit' }
  )
  if (result.error) throw result.error
  if (result.status !== 0)
    throw new Error(`public_build_failed:${result.status ?? result.signal}`)
  console.log(
    JSON.stringify({
      target,
      publicExports: true,
      sourceAliases: false,
      workspaces: ordered.map((item) => item.workspace)
    })
  )
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
