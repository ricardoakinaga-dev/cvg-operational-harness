const beforeAll = f=>f(); const afterEach = ()=>{};
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync as actualSpawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import {
  canonicalJson,
  fingerprintResolution,
  fingerprintToolchain,
  collectPackageInventory,
  INSTALLED_IDENTITY_LIMITS
} from '/home/ricardo/cvg-candidates/hiso005-resolver-fix-20261018/scripts/boundary-installed-identity.mjs'

let serial = 0;
const RAW=process.env.REVIEW_RAW;
function spawnSync(node,args,options={}) {
 const id=String(++serial).padStart(3,'0');
 const start=new Date().toISOString();
 options={...options,env:{...options.env,TMPDIR:process.env.TMPDIR,XDG_CACHE_HOME:process.env.XDG_CACHE_HOME}};
 const command={node,args,cwd:options.cwd||process.cwd(),env:options.env,input:options.input||null,start};
 fs.writeFileSync(path.join(RAW,id+'.command.json'),JSON.stringify({...command,exit:null,status:'STARTED'},null,2)+'\n');
 const r=actualSpawnSync(node,args,options);
 fs.writeFileSync(path.join(RAW,id+'.stdout.txt'),r.stdout||'');
 fs.writeFileSync(path.join(RAW,id+'.stderr.txt'),r.stderr||'');
 fs.writeFileSync(path.join(RAW,id+'.command.json'),JSON.stringify({node,args,cwd:options.cwd||process.cwd(),env:options.env,input:options.input||null,start,end:new Date().toISOString(),exit:r.status,signal:r.signal,error:r.error?.message},null,2)+'\n');
 return {...r,rawId:id};
}
const NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
const CHECKER = path.resolve('scripts/check-product-boundary.mjs')
const hash = (value) => createHash('sha256').update(value).digest('hex')
const roots = []
let toolchain
beforeAll(() => {
  toolchain = fingerprintToolchain()
})
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})
const write = (root, file, bytes) => {
  const target = path.join(root, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, bytes)
  return target
}
function fixture({
  core = 'export const result = 1\n',
  vendor,
  payload,
  prepare = () => {},
  extraInstalledKeys = [],
  packageName = 'vendor'
} = {}) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'cvg-b6236-host-'))
  roots.push(parent)
  const evaluated = path.join(parent, 'evaluated'),
    reference = path.join(parent, 'synthetic-independent-reference')
  const key = 'node_modules/'+packageName
  const lock = {
    lockfileVersion: 3,
    packages: {
      '': { name: 'synthetic', version: '1.0.0' },
      ...(vendor
        ? {
            [key]: {
              version: '1.0.0',
              resolved: 'https://registry.npmjs.org/vendor/-/vendor-1.0.0.tgz',
              integrity: 'sha512-' + Buffer.alloc(64, 1).toString('base64')
            }
          }
        : {})
    }
  }
  for (const root of [evaluated, reference]) {
    write(
      root,
      'package.json',
      JSON.stringify({
        name: 'synthetic',
        version: '1.0.0',
        private: true,
        type: 'module',
        workspaces: ['packages/*', 'products/*']
      })
    )
    write(root, 'package-lock.json', JSON.stringify(lock))
    write(
      root,
      'tsconfig.base.json',
      JSON.stringify({
        compilerOptions: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          allowJs: true,
          target: 'ES2022'
        }
      })
    )
    write(
      root,
      'packages/core/package.json',
      JSON.stringify({
        name: '@synthetic/core',
        version: '1.0.0',
        type: 'module',
        main: 'src/index.js',
        ...(vendor ? { dependencies: { [packageName]: '1.0.0' } } : {})
      })
    )
    write(root, 'packages/core/src/index.js', core)
    write(
      root,
      'products/shift/package.json',
      JSON.stringify({
        name: '@private/product',
        version: '1.0.0',
        type: 'module',
        main: 'src/index.js'
      })
    )
    write(root, 'products/shift/src/index.js', 'export const productOnly=1\n')
    if (vendor) {
      write(
        root,
        key + '/package.json',
        JSON.stringify({
          name: packageName,
          version: '1.0.0',
          type: 'module',
          main: 'index.js'
        })
      )
      write(root, key + '/index.js', vendor)
    }
    if (payload) write(root, key + '/payload.node', payload)
    prepare(root)
  }
  const packages = vendor
    ? [
        {
          key,
          name: packageName,
          version: '1.0.0',
          ...collectPackageInventory(path.join(reference, key))
        },
        ...extraInstalledKeys.map((extraKey) => ({
          key: extraKey,
          name: JSON.parse(
            fs.readFileSync(path.join(reference, extraKey, 'package.json'))
          ).name,
          version: '1.0.0',
          ...collectPackageInventory(path.join(reference, extraKey))
        }))
      ].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    : []
  // Private synthetic operator receipt; not an offline recipe/SRI attestation.
  const receipt = {
    schemaVersion: 1,
    kind: 'cvg-installed-content-reference',
    commit: 'f'.repeat(40),
    root: reference,
    ...fingerprintResolution(reference),
    toolchain,
    toolchainSha256: hash(canonicalJson(toolchain)),
    recipe: {
      argv: [
        'ci',
        '--offline',
        '--ignore-scripts',
        '--audit=false',
        '--fund=false',
        '--include=dev',
        '--include=optional',
        '--cache',
        path.join(parent, 'cache')
      ],
      exitCode: 0,
      offline: true,
      ignoreScripts: true,
      completed: true
    },
    selection: {
      platform: process.platform,
      arch: process.arch,
      dev: true,
      optional: true
    },
    limits: { ...INSTALLED_IDENTITY_LIMITS },
    usage: {
      entries: packages.reduce((n, p) => n + p.usage.entries, 0),
      regularBytes: packages.reduce((n, p) => n + p.usage.regularBytes, 0),
      maxDepth: packages.length
        ? Math.max(...packages.map((p) => p.usage.maxDepth))
        : 0
    },
    packages
  }
  const bytes = canonicalJson(receipt),
    manifestPath = write(parent, 'installed-reference.json', bytes),
    expectedSha256 = hash(bytes)
  const flags = [
    `--installed-reference=${manifestPath}`,
    `--installed-reference-sha256=${expectedSha256}`
  ]
  const run = (args = ['--semantic'], env = {}) => {
    const graphFile = path.join(parent, 'graph.json')
    const result = spawnSync(
      NODE,
      [CHECKER, evaluated, `--graph=${graphFile}`, ...flags, ...args],
      {
        encoding: 'utf8',
        timeout: 30000,
        env: {
          PATH: path.dirname(NODE) + ':/usr/bin:/bin',
          LANG: 'C',
          LC_ALL: 'C',
          TZ: 'UTC',
          ...env
        }
      }
    )
    if (result.error) throw result.error
    return {
      code: result.status,
      stderr: result.stderr,
      stdout: result.stdout,
      report: result.stdout ? JSON.parse(result.stdout) : null,
      graph: fs.existsSync(graphFile)
        ? JSON.parse(fs.readFileSync(graphFile))
        : null
    }
  }
  return {
    parent,
    evaluated,
    reference,
    flags,
    run,
    manifestPath,
    expectedSha256,
    packageKey:key
  }
}
function nativeResolution(specifier, importer, mode = 'import') {
  const program =
    mode === 'import'
      ? 'process.stdout.write(import.meta.resolve(process.argv[1]))'
      : 'process.stdout.write(require.resolve(process.argv[1]))'
  return spawnSync(
    NODE,
    [
      ...(mode === 'import' ? ['--input-type=module'] : []),
      '--eval',
      program,
      specifier
    ],
    {
      cwd: path.dirname(importer),
      env: {
        PATH: path.dirname(NODE) + ':/usr/bin:/bin',
        LANG: 'C',
        LC_ALL: 'C',
        TZ: 'UTC'
      },
      encoding: 'utf8',
      timeout: 10000
    }
  )
}
function updateJson(root, file, update) {
  const target = path.join(root, file)
  const body = JSON.parse(fs.readFileSync(target))
  update(body)
  fs.writeFileSync(target, JSON.stringify(body))
}
function hostileBody(root, up = '../../', direct = false) {
  const marker = path.join(path.dirname(root), 'target-was-executed')
  return (
    `import fs from 'node:fs';fs.writeFileSync(${JSON.stringify(marker)},'ran');` +
    (direct
      ? `import '${up}products/shift/src/index.js';`
      : `import('${up}pro'+'ducts/shift/src/index.js');`) +
    'export const value=2\n'
  )
}
function expectNoUnsupportedProof(f, result) {
  expect(result.report, `${result.code}: ${result.stderr}`).not.toBeNull()
  expect(result.report.status, result.stdout).toBe('INCOMPLETE')
  expect(result.report.semanticBoundary.status, result.stdout).toBe('UNKNOWN')
  expect(result.report.semanticBoundary.proofs).toEqual([])
  expect(
    result.graph.installed.every((x) => x.contentIdentity.status === 'MATCH')
  ).toBe(true)
  expect(result.graph.installed.every((x) => !x.verified)).toBe(true)
  expect(fs.existsSync(path.join(f.parent, 'target-was-executed'))).toBe(false)
}

export { fixture, write, updateJson, nativeResolution, spawnSync, NODE, CHECKER, hash };
