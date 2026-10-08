import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { auditProductBoundary } from '../scripts/check-product-boundary.mjs'

const roots = []
const checker = path.resolve('scripts/check-product-boundary.mjs')
function cli(root) {
  const result = spawnSync(process.execPath, [checker, root], {
    encoding: 'utf8',
    timeout: 30000
  })
  expect(result.stderr).toBe('')
  return { status: result.status, audit: JSON.parse(result.stdout) }
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cvg-product-boundary-'))
  roots.push(root)
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), value)
  }
  write(
    'package.json',
    JSON.stringify({
      workspaces: ['packages/*', 'products/*', 'legacy/packages/*']
    })
  )
  write(
    'tsconfig.base.json',
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        baseUrl: '.',
        paths: {
          '@private/product': ['products/shift/src/index.ts'],
          '@neutral/core': ['packages/core/src/index.ts']
        }
      }
    })
  )
  write('packages/core/package.json', JSON.stringify({ name: '@neutral/core' }))
  write('packages/core/src/index.ts', 'export const run = () => 1\n')
  write(
    'products/shift/package.json',
    JSON.stringify({ name: '@private/product' })
  )
  write(
    'products/shift/src/index.ts',
    "import { run } from '@neutral/core'\nexport const use = run\n"
  )
  return { root, write }
}
afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('harness product boundary', () => {
  it.each([
    "const delegate=require; const api=delegate('node:module'); const fetch=api.createRequire(__filename); fetch('../../../products/shift/src/index.ts')",
    "const {createRequire: make}=module.require('module'); const fetch=make(__filename); fetch('../../../products/shift/src/index.ts')",
    "const current=module; current.require('../../../products/shift/src/index.ts')",
    "const property='require'; module[property]('../../../products/shift/src/index.ts')",
    "const lookup=require.resolve; const lookupAgain=lookup; lookupAgain('../../../products/shift/src/index.ts')"
  ])(
    'rejects loader capability chains through the API and CLI: %s',
    (source) => {
      const { root, write } = fixture()
      write('packages/core/src/entry.cjs', source)
      const audit = auditProductBoundary(root)
      expect(audit.passed).toBe(false)
      expect(
        audit.violations.length + audit.diagnostics.length
      ).toBeGreaterThan(0)
      const result = cli(root)
      expect(result.status).toBe(1)
      expect(result.audit).toEqual(audit)
    }
  )
  it.each([
    [
      "import p from '../products/shift/src/index.ts'; export const value=p",
      'CORE_DEPENDS_ON_PRODUCT'
    ],
    ['export const value=process.env.SHIFT_PORT', 'CONSUMER_ENV_IN_CORE']
  ])('visits runtime hidden by neutral declarations: %s', (runtime, reason) => {
    const { root, write } = fixture()
    write(
      'packages/core/src/entry.mjs',
      "export {value} from '../../../tools/transport.mjs'"
    )
    write('tools/transport.d.mts', 'export declare const value: string')
    write('tools/transport.mjs', runtime)
    const audit = auditProductBoundary(root)
    expect(audit.passed).toBe(false)
    expect(
      [...audit.violations, ...audit.diagnostics].some(
        (issue) => issue.reason === reason
      )
    ).toBe(true)
    expect(cli(root).status).toBe(1)
  })
  it.each(['mjs', 'cjs', 'js'])(
    'walks both type and physical runtime closures for .%s',
    (extension) => {
      const { root, write } = fixture()
      const declaration = { mjs: 'd.mts', cjs: 'd.cts', js: 'd.ts' }[extension]
      write(
        'packages/core/src/entry.cjs',
        `require('../../../tools/adapter.${extension}')`
      )
      write(
        `tools/adapter.${declaration}`,
        'export declare const value: string'
      )
      write(`tools/adapter.${extension}`, "require('../scripts/nested.cjs')")
      write('scripts/nested.cjs', "require('../products/shift/src/index.ts')")
      const audit = auditProductBoundary(root)
      expect(
        audit.violations.some((issue) =>
          issue.trail.includes(`tools/adapter.${extension}`)
        )
      ).toBe(true)
      expect(cli(root).status).toBe(1)
    }
  )
  it('retains the type closure when the runtime is neutral', () => {
    const { root, write } = fixture()
    write('packages/core/src/entry.mjs', "import '../../../tools/schema.mjs'")
    write('tools/schema.mjs', 'export const value=1')
    write(
      'tools/schema.d.mts',
      "export * from '../products/shift/src/index.ts'"
    )
    expect(
      auditProductBoundary(root).violations.some((issue) =>
        issue.trail.includes('tools/schema.d.mts')
      )
    ).toBe(true)
    expect(cli(root).status).toBe(1)
  })
  it.each([
    "const dispatch=require; const api=dispatch('module'); const make=api['createRequire']; const fetch=make(__filename); const again=fetch; again('node:fs')",
    "const {createRequire: make}=module.require('node:module'); make(__filename)('node:fs')",
    "const current=module; const next=current; next['require']('node:fs')",
    "const lookup=require.resolve; const next=lookup; next('node:fs')",
    "const dispatch=require; dispatch('./data.cjs')"
  ])('preserves neutral loader aliases: %s', (source) => {
    const { root, write } = fixture()
    write('packages/core/src/entry.cjs', source)
    write('packages/core/src/data.cjs', 'module.exports=1')
    expect(auditProductBoundary(root).passed).toBe(true)
    expect(cli(root).status).toBe(0)
  })
  it('preserves neutral runtime plus declarations and type-only exports', () => {
    const { root, write } = fixture()
    write('packages/core/src/entry.mjs', "import '../../../tools/schema.mjs'")
    write('tools/schema.mjs', 'export const value=1')
    write('tools/schema.d.mts', 'export declare const value:number')
    write(
      'packages/core/src/type-only.ts',
      "export type {Value} from '../../../tools/types.d.ts'; import type {Module} from 'node:module'; export type {Module} from 'node:module'"
    )
    write('tools/types.d.ts', 'export interface Value {id:string}')
    expect(auditProductBoundary(root).passed).toBe(true)
    expect(cli(root).status).toBe(0)
  })
  it.each([
    "const current=module; const property=getProperty(); current[property]('node:fs')",
    'const lookup=require.resolve; forward(lookup)',
    'const lookup=require.resolve; lookup(target)',
    "const lookup=require.resolve; lookup('some-package',{paths:['/other']})",
    "const delegate=require; const api=delegate('node:module'); const property=getProperty(); api[property](__filename)",
    "const delegate=require; const api=delegate('node:module'); const make=api.createRequire; const fetch=make(base); fetch('node:fs')",
    'const current=module; export {current}'
  ])('fails closed on uncertain capability/anchor/resolution: %s', (source) => {
    const { root, write } = fixture()
    write('packages/core/src/entry.cjs', source)
    const audit = auditProductBoundary(root)
    expect(audit.passed).toBe(false)
    expect(audit.status).toBe('INCOMPLETE')
    expect(audit.diagnostics.length).toBeGreaterThan(0)
    expect(cli(root).status).toBe(1)
  })
  it('rejects declaration-only evidence for a missing runtime', () => {
    const { root, write } = fixture()
    write('packages/core/src/entry.mjs', "import '../../../tools/missing.mjs'")
    write('tools/missing.d.mts', 'export declare const value:number')
    const audit = auditProductBoundary(root)
    expect(audit.passed).toBe(false)
    expect(
      audit.diagnostics.some(
        (issue) => issue.reason === 'UNRESOLVED_RUNTIME_MODULE_REFERENCE'
      )
    ).toBe(true)
    expect(cli(root).status).toBe(1)
  })
  it.each(['import', 'require'])(
    'uses Node %s conditions alongside types for package exports',
    (mode) => {
      const { root, write } = fixture()
      write(
        'tools/utility/package.json',
        JSON.stringify({
          name: 'utility',
          type: 'module',
          exports: {
            '.': {
              types: './types.d.ts',
              import: './esm.mjs',
              require: './common.cjs'
            }
          }
        })
      )
      write('tools/utility/types.d.ts', 'export declare const value:number')
      write(
        'tools/utility/esm.mjs',
        mode === 'import'
          ? "import '../../scripts/bridge.mjs'"
          : 'export const value=1'
      )
      write(
        'tools/utility/common.cjs',
        mode === 'require'
          ? "require('../../scripts/bridge.mjs')"
          : 'module.exports=1'
      )
      fs.mkdirSync(path.join(root, 'node_modules'))
      fs.symlinkSync(
        path.join(root, 'tools/utility'),
        path.join(root, 'node_modules/utility'),
        'dir'
      )
      write('scripts/bridge.mjs', "import '../products/shift/src/index.ts'")
      write(
        'packages/core/src/entry.mjs',
        mode === 'import'
          ? "import 'utility'"
          : "import {createRequire} from 'node:module'; const fetch=createRequire(import.meta.url); fetch('utility')"
      )
      const audit = auditProductBoundary(root)
      expect(
        audit.violations.some((issue) =>
          issue.trail.includes(
            `tools/utility/${mode === 'import' ? 'esm.mjs' : 'common.cjs'}`
          )
        )
      ).toBe(true)
      expect(cli(root).status).toBe(1)
      // The unused Node condition stays outside the resolved closure.
      write(
        'packages/core/src/entry.mjs',
        mode === 'import'
          ? "import {createRequire} from 'node:module'; const fetch=createRequire(import.meta.url); fetch('utility')"
          : "import 'utility'"
      )
      expect(auditProductBoundary(root).passed).toBe(true)
      expect(cli(root).status).toBe(0)
    }
  )
  it('does not substitute a package types implementation for unknown runtime conditions', () => {
    const { root, write } = fixture()
    write(
      'tools/utility/package.json',
      JSON.stringify({
        name: 'utility',
        exports: {
          types: './types.ts',
          import: './missing.mjs',
          require: './missing.cjs'
        }
      })
    )
    write('tools/utility/types.ts', 'export const value=1')
    fs.mkdirSync(path.join(root, 'node_modules'))
    fs.symlinkSync(
      path.join(root, 'tools/utility'),
      path.join(root, 'node_modules/utility'),
      'dir'
    )
    write('packages/core/src/entry.mjs', "import 'utility'")
    let audit = auditProductBoundary(root)
    expect(audit.passed).toBe(false)
    expect(
      audit.diagnostics.some(
        (issue) => issue.reason === 'UNRESOLVED_RUNTIME_MODULE_REFERENCE'
      )
    ).toBe(true)
    expect(cli(root).status).toBe(1)
    write(
      'packages/core/src/entry.mjs',
      "import {createRequire} from 'node:module'; const fetch=createRequire(import.meta.url); fetch('utility')"
    )
    audit = auditProductBoundary(root)
    expect(audit.passed).toBe(false)
    expect(
      audit.diagnostics.some(
        (issue) => issue.reason === 'UNRESOLVED_RUNTIME_MODULE_REFERENCE'
      )
    ).toBe(true)
    expect(cli(root).status).toBe(1)
  })
  it('uses type-only Node import and require conditions without visiting runtime', () => {
    const { root, write } = fixture()
    write(
      'tools/utility/package.json',
      JSON.stringify({
        name: 'utility',
        type: 'module',
        exports: {
          import: { types: './neutral.d.mts', default: './runtime.mjs' },
          require: { types: './restricted.d.cts', default: './runtime.cjs' }
        }
      })
    )
    write('tools/utility/neutral.d.mts', 'export interface Value {id:string}')
    write(
      'tools/utility/restricted.d.cts',
      "export * from '../../products/shift/src/index.ts'"
    )
    write(
      'tools/utility/runtime.mjs',
      "import '../../products/shift/src/index.ts'"
    )
    write('tools/utility/runtime.cjs', 'module.exports=1')
    fs.mkdirSync(path.join(root, 'node_modules'))
    fs.symlinkSync(
      path.join(root, 'tools/utility'),
      path.join(root, 'node_modules/utility'),
      'dir'
    )
    write(
      'packages/core/src/type-only.mts',
      "export type {Value} from 'utility'"
    )
    expect(auditProductBoundary(root).passed).toBe(true)
    expect(cli(root).status).toBe(0)
    fs.unlinkSync(path.join(root, 'packages/core/src/type-only.mts'))
    write(
      'packages/core/src/type-only.cts',
      "export type {Value} from 'utility'"
    )
    expect(
      auditProductBoundary(root).violations.some((issue) =>
        issue.trail.includes('tools/utility/restricted.d.cts')
      )
    ).toBe(true)
    expect(cli(root).status).toBe(1)
  })
  it('keeps explicit TypeScript extension substitution for unbuilt neutral sources', () => {
    const { root, write } = fixture()
    write(
      'packages/core/src/entry.mts',
      "import '../../../tools/implementation.mjs'"
    )
    write('tools/implementation.mts', 'export const value=1')
    write(
      'packages/core/src/typed.ts',
      "import {type Module, createRequire} from 'node:module'; const fetch=createRequire(import.meta.url); fetch('node:fs')"
    )
    expect(auditProductBoundary(root).passed).toBe(true)
    expect(cli(root).status).toBe(0)
  })
  it('resolves stylesheet assets and still rejects product assets', () => {
    const { root, write } = fixture()
    write('packages/core/src/styles.css', 'body { color: black }')
    write('packages/core/src/index.ts', "import './styles.css'")
    expect(auditProductBoundary(root).passed).toBe(true)
    write('products/shift/src/styles.css', 'body { color: black }')
    write(
      'packages/core/src/index.ts',
      "import '../../../products/shift/src/styles.css'"
    )
    expect(auditProductBoundary(root).violations.length).toBeGreaterThan(0)
    write('packages/core/src/index.ts', "import './missing.css'")
    expect(
      auditProductBoundary(root).diagnostics.some(
        (issue) => issue.reason === 'UNRESOLVED_MODULE_REFERENCE'
      )
    ).toBe(true)
  })
  it('allows a product to consume neutral public contracts', () => {
    const { root } = fixture()
    expect(auditProductBoundary(root).passed).toBe(true)
  })
  it.each([
    "import { use } from '../../../products/shift/src/index.ts'",
    "import { use } from '@private/product'",
    "export { use } from '@private/product'",
    "const load = () => import('@private/product')",
    "const load = () => require('@private/product')",
    "type Value = import('@private/product').Value"
  ])('rejects forbidden source reference %s', (source) => {
    const { root, write } = fixture()
    write('packages/core/src/index.ts', source)
    expect(auditProductBoundary(root).violations.length).toBeGreaterThan(0)
  })
  it('rejects a transitive relative reference through legacy code', () => {
    const { root, write } = fixture()
    write(
      'packages/core/src/index.ts',
      "export * from '../../../legacy/packages/bridge/src/index.ts'"
    )
    write(
      'legacy/packages/bridge/src/index.ts',
      "export * from '../../../../products/shift/src/index.ts'"
    )
    const result = auditProductBoundary(root)
    expect(result.violations.some((issue) => issue.trail.length >= 3)).toBe(
      true
    )
  })
  it.each(['scripts/bridge.ts', 'scripts/bridge.d.ts', 'tools/bridge.mjs'])(
    'walks local intermediates outside workspace roots: %s',
    (bridge) => {
      const { root, write } = fixture()
      write('packages/core/src/index.ts', `export * from '../../../${bridge}'`)
      write(bridge, "export * from '../products/shift/src/index.ts'")
      const result = auditProductBoundary(root)
      expect(result.passed).toBe(false)
      expect(
        result.violations.some((issue) => issue.trail.includes(bridge))
      ).toBe(true)
    }
  )
  it('walks declaration reference directives', () => {
    const { root, write } = fixture()
    write(
      'packages/core/src/types.d.ts',
      '/// <reference path="../../../products/shift/src/index.ts" />'
    )
    expect(auditProductBoundary(root).passed).toBe(false)
  })
  it('walks declaration type reference directives', () => {
    const { root, write } = fixture()
    write(
      'products/shift/src/types.d.ts',
      'export interface Patient {id:string}'
    )
    write(
      'packages/core/src/types.d.ts',
      '/// <reference types="../../../products/shift/src/types.d.ts" />'
    )
    expect(auditProductBoundary(root).passed).toBe(false)
  })
  it('rejects consumer environment read through a local script bridge', () => {
    const { root, write } = fixture()
    write(
      'packages/core/src/index.ts',
      "export * from '../../../scripts/config.ts'"
    )
    write('scripts/config.ts', 'export const port=process.env.SHIFT_PORT')
    expect(
      auditProductBoundary(root).diagnostics.some(
        (issue) => issue.reason === 'CONSUMER_ENV_IN_CORE'
      )
    ).toBe(true)
  })
  it.each([
    "import { createRequire } from 'node:module'; const load=createRequire(import.meta.url); load('@private/product')",
    "import { createRequire as cr } from 'module'; const load=cr(import.meta.url); load('@private/product')",
    "import * as moduleApi from 'node:module'; const load=moduleApi.createRequire(import.meta.url); load('@private/product')",
    "import moduleApi from 'node:module'; const load=moduleApi['createRequire'](import.meta.url); load('@private/product')",
    "const {createRequire: cr}=require('node:module'); const load=cr(__filename); load('@private/product')",
    "import { createRequire as cr } from 'node:module'; const make=cr; const load=make(import.meta.url); const alias=load; alias('@private/product')",
    "import { createRequire } from 'node:module'; let load; load=createRequire(import.meta.url); load('@private/product')",
    "import { createRequire } from 'node:module'; createRequire(import.meta.url)('@private/product')",
    "import { createRequire } from 'node:module'; const load=createRequire(import.meta.url); load.resolve('@private/product')",
    "module.require('@private/product')"
  ])('rejects supported module loader references: %s', (source) => {
    const { root, write } = fixture()
    write('packages/core/src/index.ts', source)
    const result = auditProductBoundary(root)
    expect(result.passed).toBe(false)
    expect(result.violations.length).toBeGreaterThan(0)
  })
  it.each([
    "import { createRequire } from 'node:module'; const load=createRequire(import.meta.url); const target='@private/product'; load(target)",
    "import { createRequire } from 'node:module'; const load=createRequire(import.meta.url); load.resolve(target)",
    "import { createRequire } from 'node:module'; const load=createRequire(base); load('node:fs')",
    "import { createRequire } from 'node:module'; const load=createRequire(import.meta.url); invoke(load)",
    "import { createRequire } from 'node:module'; const load=createRequire(import.meta.url); export {load}",
    "import { createRequire } from 'node:module'; export const make=createRequire",
    "import { createRequire } from 'node:module'; export const load=createRequire(import.meta.url)",
    "export {createRequire as make} from 'node:module'",
    "export * from 'node:module'",
    "import {register} from 'node:module'; register('@private/product',import.meta.url)",
    "import * as mod from 'node:module'; mod.register('@private/product',import.meta.url)",
    "import {createRequire} from 'node:module'; function factory(){return createRequire(import.meta.url)}; factory()(target)",
    "const {createRequire}=await import('node:module'); const load=createRequire(import.meta.url); load('@private/product')",
    "function factory(){return require('node:module')}; factory().createRequire(base)(target)",
    "const {register}=require('node:module'); register(target,base)",
    "import * as moduleApi from 'node:module'; const key='createRequire'; const load=moduleApi[key](import.meta.url); load('node:fs')"
  ])('fails closed on unknown/escaping loader capabilities: %s', (source) => {
    const { root, write } = fixture()
    write('packages/core/src/index.ts', source)
    const result = auditProductBoundary(root)
    expect(result.passed).toBe(false)
    expect(result.diagnostics.length).toBeGreaterThan(0)
  })
  it('allows a local anchored loader of neutral modules and builtins', () => {
    const { root, write } = fixture()
    write(
      'packages/core/src/index.ts',
      "import {createRequire as cr} from 'node:module'; const load=cr(import.meta.url); load('node:fs'); load('@neutral/core')"
    )
    expect(auditProductBoundary(root).passed).toBe(true)
  })
  it('distinguishes a policy method named require from a module loader', () => {
    const { root, write } = fixture()
    write(
      'packages/core/src/index.ts',
      'interface Policy {require(action: string): void}; const policy: Policy={require(action){}}; policy.require(action)'
    )
    expect(auditProductBoundary(root).passed).toBe(true)
  })
  it('allows declaration-only domain methods without omitting declarations', () => {
    const { root, write } = fixture()
    write(
      'packages/core/src/types.d.ts',
      'export declare class Policy { private require; }'
    )
    expect(auditProductBoundary(root).passed).toBe(true)
  })
  it('rejects an unused development dependency on the consumer', () => {
    const { root, write } = fixture()
    write(
      'packages/core/package.json',
      JSON.stringify({
        name: '@neutral/core',
        devDependencies: { '@private/product': '1.0.0' }
      })
    )
    expect(auditProductBoundary(root).passed).toBe(false)
  })
  it('rejects a manifest dependency even when unused by sources', () => {
    const { root, write } = fixture()
    write(
      'packages/core/package.json',
      JSON.stringify({
        name: '@neutral/core',
        dependencies: { '@private/product': '1.0.0' }
      })
    )
    expect(auditProductBoundary(root).violations.length).toBeGreaterThan(0)
  })
  it('fails closed on an unknowable dynamic reference', () => {
    const { root, write } = fixture()
    write(
      'packages/core/src/index.ts',
      'export const load = (name: string) => import(name)'
    )
    expect(
      auditProductBoundary(root).diagnostics.some(
        (issue) => issue.reason === 'NON_LITERAL_MODULE_REFERENCE'
      )
    ).toBe(true)
  })
  it('rejects consumer environment keys in core', () => {
    const { root, write } = fixture()
    write(
      'packages/core/src/index.ts',
      'export const port = process.env.SHIFT_PORT'
    )
    expect(
      auditProductBoundary(root).diagnostics.some(
        (issue) => issue.reason === 'CONSUMER_ENV_IN_CORE'
      )
    ).toBe(true)
  })
})

// HISO-005 / PLAN0374 B1. Known negative cases: each builds a disposable
// repository under os.tmpdir() (removed by afterEach) and asserts that the
// gate fails and names the offending product path. Nothing is written inside
// the repository tree, so no probe fixture can reach a production artifact.
function link(root, from, to) {
  fs.mkdirSync(path.dirname(path.join(root, from)), { recursive: true })
  fs.symlinkSync(path.join(root, to), path.join(root, from), 'dir')
}
function expectProductViolation(root, ...steps) {
  const audit = auditProductBoundary(root)
  const trails = audit.violations.map((issue) => issue.trail)
  expect(audit.status).toBe('FAIL')
  expect(audit.passed).toBe(false)
  expect(
    trails.some((trail) => steps.every((step) => trail.includes(step))),
    JSON.stringify(trails)
  ).toBe(true)
  const result = cli(root)
  expect(result.status).toBe(1)
  expect(result.audit).toEqual(audit)
  return audit
}
function expectRefused(root, status, reason) {
  const audit = auditProductBoundary(root)
  expect(audit.passed).toBe(false)
  expect(audit.status).toBe(status)
  if (reason)
    expect(
      audit.diagnostics.map((issue) => issue.reason),
      JSON.stringify(audit.diagnostics)
    ).toContain(reason)
  expect(cli(root).status).toBe(1)
  return audit
}
// npm lock metadata for synthetic registry packages (no network involved).
function lockfile(entries) {
  return JSON.stringify({
    lockfileVersion: 3,
    packages: Object.fromEntries(
      Object.entries(entries).map(([key, entry]) => [
        key,
        {
          resolved: `https://registry.npmjs.org/${key.slice(13)}/-/synthetic.tgz`,
          integrity: 'sha512-c3ludGhldGlj',
          ...entry
        }
      ])
    )
  })
}
function installed(write, name, manifest, files = {}) {
  write(
    `node_modules/${name}/package.json`,
    JSON.stringify({ name, version: '1.0.0', main: 'index.js', ...manifest })
  )
  for (const [file, value] of Object.entries({
    'index.js': 'module.exports = 1\n',
    ...files
  }))
    write(`node_modules/${name}/${file}`, value)
}

describe('HISO-005 B1 known negative cases', () => {
  const product = 'products/shift/src/index.ts'

  it.each([
    ['packages/core/src/entry.ts', '../../../products/shift/src/index.ts'],
    ['apps/host/src/main.ts', '../../../products/shift/src/index.ts']
  ])('fails on a direct relative import from harness source %s', (from, to) => {
    const { root, write } = fixture()
    write(from, `import { use } from '${to}'\nexport const value = use\n`)
    expectProductViolation(root, from, product)
  })

  it('fails on a package-name import resolved through the workspace link', () => {
    const { root, write } = fixture()
    // No tsconfig alias: the name resolves only through node_modules.
    write(
      'tsconfig.base.json',
      JSON.stringify({
        compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext' }
      })
    )
    write(
      'products/shift/package.json',
      JSON.stringify({ name: '@private/product', main: 'src/index.ts' })
    )
    link(root, 'node_modules/@private/product', 'products/shift')
    write(
      'packages/core/src/entry.mjs',
      "export { use } from '@private/product'\n"
    )
    expectProductViolation(
      root,
      'packages/core/src/entry.mjs',
      'products/shift/package.json'
    )
    expectProductViolation(root, 'packages/core/src/entry.mjs', product)
  })

  it('fails through an intermediary harness module (A -> B -> product)', () => {
    const { root, write } = fixture()
    write(
      'packages/util/package.json',
      JSON.stringify({ name: '@neutral/util' })
    )
    write(
      'packages/util/src/bridge.ts',
      `export { use } from '../../../${product}'\n`
    )
    write(
      'packages/core/src/a.ts',
      "export { use } from '../../util/src/bridge.ts'\n"
    )
    const audit = expectProductViolation(
      root,
      'packages/util/src/bridge.ts',
      product
    )
    // A itself depends on the product through B.
    expect(audit.coreFiles).toBeGreaterThanOrEqual(3)
  })

  it('fails through a non-workspace intermediary outside the core roots', () => {
    const { root, write } = fixture()
    write('tools/bridge/b.mjs', `export * from '../../${product}'\n`)
    write(
      'packages/core/src/a.mjs',
      "export * from '../../../tools/bridge/b.mjs'\n"
    )
    expectProductViolation(
      root,
      'packages/core/src/a.mjs',
      'tools/bridge/b.mjs',
      product
    )
  })

  it.each([
    [{ '@harness/hidden': [product] }, '@harness/hidden'],
    [
      { '@harness/hidden/*': ['products/shift/src/*'] },
      '@harness/hidden/index.ts'
    ]
  ])(
    'fails through a tsconfig path alias mapped into the product: %j',
    (paths, specifier) => {
      const { root, write } = fixture()
      write(
        'tsconfig.base.json',
        JSON.stringify({
          compilerOptions: {
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            allowImportingTsExtensions: true,
            baseUrl: '.',
            paths
          }
        })
      )
      write(
        'packages/core/src/entry.ts',
        `import { use } from '${specifier}'\nexport const value = use\n`
      )
      expectProductViolation(root, 'packages/core/src/entry.ts', product)
    }
  )

  it.each([
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies'
  ])('fails on a harness manifest declaring the product in %s', (field) => {
    const { root, write } = fixture()
    write(
      'packages/core/package.json',
      JSON.stringify({
        name: '@neutral/core',
        [field]: { '@private/product': '1.0.0' }
      })
    )
    expectProductViolation(
      root,
      'packages/core/package.json',
      'products/shift/package.json'
    )
  })

  it('fails on an installed dependency whose canonical path is inside products/', () => {
    const { root, write } = fixture()
    write(
      'packages/core/package.json',
      JSON.stringify({
        name: '@neutral/core',
        dependencies: { helper: '1.0.0' }
      })
    )
    link(root, 'node_modules/helper', 'products/shift')
    expectProductViolation(
      root,
      'packages/core/package.json',
      'products/shift/package.json'
    )
  })

  it('fails on an undeclared bare import whose node_modules link lands in products/', () => {
    const { root, write } = fixture()
    link(root, 'node_modules/helper', 'products/shift')
    // The product has no entry: the package directory itself is the witness.
    write('packages/core/src/entry.mjs', "import 'helper'\n")
    expectProductViolation(
      root,
      'packages/core/src/entry.mjs',
      'products/shift/package.json'
    )
  })

  it('fails on a product-owned installation reached from the core', () => {
    const { root, write } = fixture()
    write(
      'products/shift/node_modules/vendor/package.json',
      JSON.stringify({ name: 'vendor', version: '1.0.0', main: 'index.js' })
    )
    write('products/shift/node_modules/vendor/index.js', 'module.exports = 1\n')
    link(root, 'node_modules/vendor', 'products/shift/node_modules/vendor')
    write(
      'packages/core/package.json',
      JSON.stringify({
        name: '@neutral/core',
        dependencies: { vendor: '1.0.0' }
      })
    )
    expectProductViolation(
      root,
      'packages/core/package.json',
      'products/shift/node_modules/vendor/package.json'
    )
  })

  it.each([
    [
      'packages/core/src/entry.mjs',
      `export const load = () => import('../../../${product}')`
    ],
    [
      'packages/core/src/entry.mjs',
      `import { createRequire } from 'node:module'\nconst load = createRequire(import.meta.url)\nexport const use = () => load('../../../${product}')`
    ],
    [
      'packages/core/src/entry.cjs',
      `module.exports = () => require('../../../${product}')`
    ],
    [
      'packages/core/src/entry.ts',
      "export const load = () => import('@private/product')"
    ]
  ])(
    'fails on an identifiable dynamic import/require in %s: %s',
    (file, source) => {
      const { root, write } = fixture()
      write(file, `${source}\n`)
      expectProductViolation(root, file, product)
    }
  )
})

// Exact layouts of the counterexamples reproduced by the T2 critiques
// (docs/04_audit/evidence/HARNESS-ISO-EXEC-20261003/t2-critic-r1 and -r2).
function t2Fixture(files) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cvg-product-boundary-t2-')
  )
  roots.push(root)
  for (const [file, value] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    fs.writeFileSync(path.join(root, file), value)
  }
  return root
}
const t2r1Base = {
  'package.json': JSON.stringify({ workspaces: ['packages/*', 'products/*'] }),
  'packages/core/package.json': JSON.stringify({
    name: '@neutral/core',
    type: 'module'
  }),
  'products/shift/package.json': JSON.stringify({
    name: '@private/product',
    type: 'module'
  }),
  'packages/core/src/index.mjs': 'export const use = "CORE_ONLY"\n',
  'products/shift/src/index.mjs': 'export const use = "PRODUCT_LOADED"\n'
}
const t2r2Target = '../../../products/shift/src/index.cjs'
const t2r2Base = {
  'package.json': JSON.stringify({
    private: true,
    workspaces: ['packages/*', 'products/*']
  }),
  'tsconfig.base.json': JSON.stringify({
    compilerOptions: {
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      allowJs: true,
      baseUrl: '.',
      paths: {
        '@private/product': ['products/shift/src/index.cjs'],
        '@neutral/core': ['packages/core/src/neutral.cjs']
      }
    }
  }),
  'packages/core/package.json': JSON.stringify({
    name: '@neutral/core',
    version: '1.0.0'
  }),
  'packages/core/src/neutral.cjs': 'module.exports = {marker:"neutral"};',
  'products/shift/package.json': JSON.stringify({
    name: '@private/product',
    version: '1.0.0'
  }),
  'products/shift/src/index.cjs': 'module.exports = {marker:"PRODUCT_LOADED"};'
}

describe('HISO-005 B1 T2 counterexample regressions', () => {
  it('R1 transitive-scripts: core -> scripts/bridge.mjs -> product fails', () => {
    const root = t2Fixture({
      ...t2r1Base,
      'packages/core/src/index.mjs':
        "export * from '../../../scripts/bridge.mjs'\n",
      'scripts/bridge.mjs': "export * from '../products/shift/src/index.mjs'\n"
    })
    expectProductViolation(
      root,
      'packages/core/src/index.mjs',
      'scripts/bridge.mjs',
      'products/shift/src/index.mjs'
    )
  })
  it('R1 createRequire-literal: an anchored createRequire of the product fails', () => {
    const root = t2Fixture({
      ...t2r1Base,
      'packages/core/src/index.mjs':
        "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); export const use = load('../../../products/shift/src/loaded.cjs').use\n",
      'products/shift/src/loaded.cjs': 'exports.use = "PRODUCT_LOADED"\n'
    })
    expectProductViolation(
      root,
      'packages/core/src/index.mjs',
      'products/shift/src/loaded.cjs'
    )
  })
  it('R1 createRequire-unknown: a non-literal createRequire target is refused', () => {
    const root = t2Fixture({
      ...t2r1Base,
      'packages/core/src/index.mjs':
        "import { createRequire } from 'node:module'; const load = createRequire(import.meta.url); const target = '../../../products/shift/src/loaded.cjs'; export const use = load(target).use\n",
      'products/shift/src/loaded.cjs': 'exports.use = "PRODUCT_LOADED"\n'
    })
    expectRefused(root, 'INCOMPLETE', 'NON_LITERAL_MODULE_REFERENCE')
  })
  it('R1 type-declaration-bridge: a type-only declaration bridge fails', () => {
    const root = t2Fixture({
      ...t2r1Base,
      'packages/core/src/index.ts':
        "export type { Value } from '../../../scripts/bridge.d.ts'\n",
      'scripts/bridge.d.ts':
        "export type { Value } from '../products/shift/src/value.ts'\n",
      'products/shift/src/value.ts': 'export type Value = string\n'
    })
    expectProductViolation(
      root,
      'scripts/bridge.d.ts',
      'products/shift/src/value.ts'
    )
  })
  it('R2 P1-R2-01: a neutral declaration does not hide the runtime bridge', () => {
    const root = t2Fixture({
      ...t2r2Base,
      'packages/core/src/index.mjs':
        "import {marker} from '../../../scripts/bridge.mjs';console.log(marker)",
      'scripts/bridge.mjs':
        "import p from '../products/shift/src/index.cjs';export const marker=p.marker;",
      'scripts/bridge.d.mts': 'export declare const marker:string;'
    })
    expectProductViolation(
      root,
      'scripts/bridge.mjs',
      'products/shift/src/index.cjs'
    )
  })
  it('R2 P1-R2-01 (env): a shadowed bridge reading SHIFT_* fails', () => {
    const root = t2Fixture({
      ...t2r2Base,
      'packages/core/src/index.mjs':
        "import {marker} from '../../../scripts/bridge.mjs';console.log(marker)",
      'scripts/bridge.mjs':
        "export const marker=process.env.SHIFT_PORT ?? 'SHIFT_ENV_READ';",
      'scripts/bridge.d.mts': 'export declare const marker:string;'
    })
    const audit = expectRefused(root, 'FAIL', 'CONSUMER_ENV_IN_CORE')
    expect(audit.diagnostics.map((issue) => issue.file)).toContain(
      'scripts/bridge.mjs'
    )
  })
  it.each([
    [
      'negative-alias-namespace',
      `const r=require;const mod=r('node:module');const load=mod.createRequire(__filename);console.log(load('${t2r2Target}').marker)`
    ],
    [
      'negative-module-require-factory',
      `const {createRequire}=module.require('node:module');const load=createRequire(__filename);console.log(load('${t2r2Target}').marker)`
    ],
    [
      'negative-commonjs-module-alias',
      `const host=module;console.log(host.require('${t2r2Target}').marker)`
    ],
    [
      'negative-resolve-alias',
      `const resolve=require.resolve;console.log(resolve('${t2r2Target}'))`
    ]
  ])(
    'R2 P1-R2-02 %s: loader aliases reach the product witness',
    (_name, source) => {
      const root = t2Fixture({
        ...t2r2Base,
        'packages/core/src/index.cjs': source
      })
      expectProductViolation(
        root,
        'packages/core/src/index.cjs',
        'products/shift/src/index.cjs'
      )
    }
  )
  it('R2 P1-R2-02 negative-commonjs-computed: a computed loader key is refused', () => {
    // module[key] with a const key is not followed statically; the gate
    // refuses the capability instead of guessing the target.
    const root = t2Fixture({
      ...t2r2Base,
      'packages/core/src/index.cjs': `const key='require';console.log(module[key]('${t2r2Target}').marker)`
    })
    expectRefused(root, 'INCOMPLETE', 'UNVERIFIED_MODULE_LOADER_PROPERTY')
  })
})

describe('HISO-005 B1 installed frontier', () => {
  const vendorLock = (entry = {}) =>
    lockfile({ 'node_modules/vendor': { version: '1.0.0', ...entry } })

  it('treats a lock-verified installed package as a terminal node (not parsed)', () => {
    const { root, write } = fixture()
    write('package-lock.json', vendorLock())
    // Would be an UNVERIFIED_DYNAMIC_CODE_EXECUTION if third-party code were
    // parsed. Registry artifacts recorded in the lockfile are trusted not to
    // build product paths; the tripwire below covers literal references.
    installed(
      write,
      'vendor',
      {},
      {
        'index.js': 'module.exports = (code) => eval(code)\n'
      }
    )
    write('packages/core/src/entry.cjs', "module.exports = require('vendor')\n")
    const audit = auditProductBoundary(root)
    expect(audit.status).toBe('PASS')
    expect(audit.installedPackageCount).toBe(1)
    expect(audit.installedLockDrift).toEqual([])
    expect(cli(root).status).toBe(0)
  })

  it('refuses an installed package absent from the lockfile', () => {
    const { root, write } = fixture()
    installed(write, 'vendor', {})
    write('packages/core/src/entry.cjs', "module.exports = require('vendor')\n")
    const audit = expectRefused(
      root,
      'INCOMPLETE',
      'UNVERIFIED_INSTALLED_PACKAGE'
    )
    expect(audit.diagnostics).toContainEqual({
      file: 'node_modules/vendor/package.json',
      reason: 'UNVERIFIED_INSTALLED_PACKAGE',
      detail: 'NOT_IN_LOCKFILE'
    })
  })

  it.each([
    ['link entry', { link: true }],
    ['different package name', { name: 'other' }],
    [
      'non-registry resolution',
      { resolved: 'git+ssh://example.invalid/vendor.git' }
    ],
    ['missing integrity', { integrity: undefined }]
  ])('refuses lock metadata that does not identify it: %s', (_label, entry) => {
    const { root, write } = fixture()
    write('package-lock.json', vendorLock(entry))
    installed(write, 'vendor', {})
    write('packages/core/src/entry.cjs', "module.exports = require('vendor')\n")
    const audit = expectRefused(
      root,
      'INCOMPLETE',
      'UNVERIFIED_INSTALLED_PACKAGE'
    )
    expect(audit.diagnostics[0].detail).toBe('LOCKFILE_IDENTITY_MISMATCH')
  })

  it("does not accept npm's untracked installed-tree record as a trust root", () => {
    const { root, write } = fixture()
    write('node_modules/.package-lock.json', vendorLock())
    installed(write, 'vendor', {})
    write('packages/core/src/entry.cjs', "module.exports = require('vendor')\n")
    const audit = expectRefused(
      root,
      'INCOMPLETE',
      'UNVERIFIED_INSTALLED_PACKAGE'
    )
    expect(audit.diagnostics[0].detail).toBe('NOT_IN_LOCKFILE')
  })

  it('reports installed version drift without treating it as a boundary path', () => {
    const { root, write } = fixture()
    write('package-lock.json', vendorLock({ version: '2.0.0' }))
    installed(write, 'vendor', {})
    write('packages/core/src/entry.cjs', "module.exports = require('vendor')\n")
    const audit = auditProductBoundary(root)
    expect(audit.status).toBe('PASS')
    expect(audit.installedLockDrift).toEqual([
      {
        package: 'node_modules/vendor',
        installedVersion: '1.0.0',
        lockfileVersion: '2.0.0'
      }
    ])
  })

  it('fails when a verified installed package declares a successor inside products/', () => {
    const { root, write } = fixture()
    write('package-lock.json', vendorLock())
    installed(write, 'vendor', { dependencies: { carrier: '^1.0.0' } })
    link(root, 'node_modules/carrier', 'products/shift')
    write('packages/core/src/entry.cjs', "module.exports = require('vendor')\n")
    expectProductViolation(
      root,
      'packages/core/src/entry.cjs',
      'node_modules/vendor/package.json',
      'products/shift/package.json'
    )
  })

  it('keeps declared successors of an unverified, malformed installed manifest', () => {
    const { root, write } = fixture()
    write(
      'node_modules/vendor/package.json',
      JSON.stringify({
        name: 'vendor',
        main: 'index.js',
        dependencies: { '@private/product': '1.0.0' }
      })
    )
    write('node_modules/vendor/index.js', 'module.exports = 1\n')
    link(root, 'node_modules/@private/product', 'products/shift')
    write('packages/core/src/entry.cjs', "module.exports = require('vendor')\n")
    const audit = expectProductViolation(
      root,
      'node_modules/vendor/package.json',
      'products/shift/package.json'
    )
    expect(audit.diagnostics.map((issue) => issue.detail)).toContain(
      'INSTALLED_MANIFEST_INVALID'
    )
  })

  it('fails on a literal product reference inside a lock-verified package (tripwire)', () => {
    const { root, write } = fixture()
    write('package-lock.json', vendorLock())
    installed(
      write,
      'vendor',
      {},
      {
        'index.js':
          "module.exports = require('../../products/shift/src/index.ts')\n"
      }
    )
    write('packages/core/src/entry.cjs', "module.exports = require('vendor')\n")
    const audit = expectRefused(
      root,
      'FAIL',
      'INSTALLED_PACKAGE_REFERENCES_PRODUCT'
    )
    expect(audit.diagnostics).toContainEqual({
      file: 'node_modules/vendor/index.js',
      reference: 'products/shift',
      reason: 'INSTALLED_PACKAGE_REFERENCES_PRODUCT'
    })
  })

  it('fails on a symlink inside an installed package that lands in products/', () => {
    const { root, write } = fixture()
    write('package-lock.json', vendorLock())
    installed(write, 'vendor', {})
    link(root, 'node_modules/vendor/lib', 'products/shift/src')
    write('packages/core/src/entry.cjs', "module.exports = require('vendor')\n")
    expectProductViolation(
      root,
      'node_modules/vendor/package.json',
      'products/shift/src'
    )
  })

  it('refuses the NEXT-D1 physical process bridge (installed, unverified)', () => {
    const { root, write } = fixture()
    // Critic probe physical-process-named-default-product, same bridge source.
    write(
      'node_modules/outer/package.json',
      JSON.stringify({ name: 'outer', type: 'module', main: 'index.mjs' })
    )
    write('node_modules/outer/index.mjs', "export {default} from 'bridge';\n")
    write(
      'node_modules/bridge/package.json',
      JSON.stringify({ name: 'bridge', type: 'module', main: 'index.mjs' })
    )
    write(
      'node_modules/bridge/index.mjs',
      "import {default as host} from 'node:process';\nexport default host.getBuiltinModule('module').createRequire(import.meta.url)(\"../../products/shift/src/marker.cjs\");\n"
    )
    write('products/shift/src/marker.cjs', 'module.exports = "PRODUCT"\n')
    write('packages/core/src/entry.mjs', "export { default } from 'outer'\n")
    expectRefused(root, 'INCOMPLETE', 'UNVERIFIED_INSTALLED_PACKAGE')
    // Once the bridge is a declared successor, its bytes are scanned too.
    write(
      'node_modules/outer/package.json',
      JSON.stringify({
        name: 'outer',
        type: 'module',
        main: 'index.mjs',
        dependencies: { bridge: '1.0.0' }
      })
    )
    expectRefused(root, 'FAIL', 'INSTALLED_PACKAGE_REFERENCES_PRODUCT')
  })
})

describe('HISO-005 B1 restricted capability exceptions', () => {
  const entry = 'apps/api/src/main.ts'
  const listed =
    "const shutdown = { install(source: NodeJS.EventEmitter) { source.once('SIGTERM', () => {}) } }\nshutdown.install(process)\n"
  // shutdown-signal-source pins the real install() implementation that
  // receives `process`; the fixture carries a byte-identical copy.
  const lifecycle = 'packages/shared/src/lifecycle.ts'
  const pinMessage = `${lifecycle} changed: re-review the shutdown-signal-source pin in scripts/check-product-boundary.mjs`
  const withPin = (write) => write(lifecycle, fs.readFileSync(lifecycle))

  it('accepts a listed site only with its file, reason, line, expression and pin', () => {
    const { root, write } = fixture()
    withPin(write)
    write(entry, listed)
    const audit = auditProductBoundary(root)
    expect(audit.status, pinMessage).toBe('PASS')
    expect(audit.exceptions).toEqual([
      {
        file: `${entry}:2`,
        reason: 'UNVERIFIED_MODULE_LOADER_ESCAPE',
        expression: '19ed40bf62c399b8',
        exception: 'shutdown-signal-source'
      }
    ])
    expect(cli(root)).toEqual({ status: 0, audit })
    // Raw analysis: the same site is a blocking diagnostic without the table.
    const strict = auditProductBoundary(root, { exceptions: false })
    expect(strict.status).toBe('INCOMPLETE')
    expect(strict.exceptions).toEqual([])
    expect(
      spawnSync(process.execPath, [checker, root, '--strict'], {
        encoding: 'utf8',
        timeout: 30000
      }).status
    ).toBe(1)
  })

  it.each([
    [
      'an edited line',
      entry,
      listed.replace('install(process)', 'install(process) // edited')
    ],
    ['an unlisted file', 'apps/other/src/main.ts', listed],
    [
      'one occurrence more than listed',
      entry,
      `${listed}shutdown.install(process)\n`
    ]
  ])('keeps the diagnostic for %s', (_label, file, source) => {
    const { root, write } = fixture()
    withPin(write)
    write(file, source)
    const audit = expectRefused(
      root,
      'INCOMPLETE',
      'UNVERIFIED_MODULE_LOADER_ESCAPE'
    )
    expect(audit.exceptions.length).toBeLessThanOrEqual(1)
  })

  it('lapses when a pinned file changes', () => {
    const { root, write } = fixture()
    write(lifecycle, `${fs.readFileSync(lifecycle, 'utf8')}// edited\n`)
    write(entry, listed)
    const audit = expectRefused(
      root,
      'INCOMPLETE',
      'UNVERIFIED_MODULE_LOADER_ESCAPE'
    )
    expect(audit.exceptions).toEqual([])
    expect(audit.unusedExceptions).toContainEqual(
      expect.objectContaining({
        exception: 'shutdown-signal-source',
        file: entry,
        pinsHold: false
      })
    )
  })

  it('binds the complete flagged expression, not only the line where it starts', () => {
    const file =
      'apps/worker/src/__tests__/continuous-worker-entrypoint.integration.test.ts'
    const source = (target) =>
      [
        "import { spawn } from 'node:child_process'",
        "import path from 'node:path'",
        'const env = {}',
        'const child = spawn(',
        "  path.resolve('node_modules/.bin/tsx'),",
        `  ['${target}'],`,
        "  { cwd: process.cwd(), env, stdio: ['ignore', 'pipe', 'pipe'] }",
        ')',
        ''
      ].join('\n')
    const listedSpawn = fixture()
    listedSpawn.write(file, source('apps/worker/src/main.ts'))
    const audit = auditProductBoundary(listedSpawn.root)
    expect(audit.status).toBe('PASS')
    expect(audit.exceptions.map((item) => item.exception)).toEqual([
      'entrypoint-subprocess'
    ])
    // Same first line, different arguments: the exception no longer applies.
    const changed = fixture()
    changed.write(file, source('products/shift/src/index.ts'))
    expectRefused(
      changed.root,
      'INCOMPLETE',
      'UNVERIFIED_DYNAMIC_CODE_EXECUTION'
    )
  })

  it('never excepts a product edge in a listed file', () => {
    const { root, write } = fixture()
    write(
      entry,
      `${listed}export { use } from '../../../products/shift/src/index.ts'\n`
    )
    expectProductViolation(root, entry, 'products/shift/src/index.ts')
  })

  it('writes the resolved core graph and rejects unknown CLI flags', () => {
    const { root, write } = fixture()
    write('packages/core/src/entry.ts', "export * from '../../../tools/x.ts'\n")
    write('tools/x.ts', 'export const x = 1\n')
    const graphFile = path.join(root, 'graph.json')
    const run = spawnSync(
      process.execPath,
      [checker, root, `--graph=${graphFile}`],
      {
        encoding: 'utf8',
        timeout: 30000
      }
    )
    expect(run.status).toBe(0)
    expect(JSON.parse(run.stdout).graph).toBeUndefined()
    const graph = JSON.parse(fs.readFileSync(graphFile, 'utf8'))
    expect(graph.nodes).toContain('tools/x.ts')
    expect(graph.edges).toContainEqual([
      'packages/core/src/entry.ts',
      'tools/x.ts'
    ])
    const bad = spawnSync(process.execPath, [checker, root, '--bogus'], {
      encoding: 'utf8',
      timeout: 30000
    })
    expect(bad.status).toBe(2)
    expect(bad.stderr).toContain('invalid_boundary_arguments')
  })
})
