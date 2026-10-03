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
