import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import {
  collectReferenceCatalog,
  compareCatalogFreeze,
  extractTypeScriptContracts,
  serializeCatalog,
  validateCatalog
} from '../scripts/reference-contract-catalog.mjs'

const evidence = path.resolve(
  'docs/04_audit/evidence/PARE100-EXEC-20261014/reference/role-r12'
)
const temporary = []
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex')
const files = {
  'package.json': JSON.stringify({
    name: '@synthetic/root',
    version: 'fixture-v1'
  }),
  'packages/core/example/package.json': JSON.stringify({
    name: '@synthetic/example',
    version: 'fixture-v1',
    exports: { '.': { types: './lib/index.d.ts', default: './lib/index.js' } }
  }),
  'packages/core/example/src/index.ts': `
export interface Config { timeout?: number; mode: 'safe' | 'local' }
export type Result<T> = { kind: 'done'; value: T } | { kind: 'failed'; reason: string }
declare module 'synthetic-context' { interface Events { 'task/done'(id: string): void; 'task/error': (message: string) => void } }
export class Service {
  private hidden(): void { const bodyMustNeverBeCopied = 'IMPLEMENTATION_MARKER'; }
  constructor(readonly config: Config) { console.log('IMPLEMENTATION_MARKER'); }
  run(input: string): Promise<Result<string>> { throw new Error('IMPLEMENTATION_MARKER'); }
}
export function work(value: string): number;
export function work(value: number): number;
export function work(value: string | number): number { return 'IMPLEMENTATION_MARKER'.length; }
export const Schema = buildSchema({ mode: getModes(), fixed: true });
export const staticModes: readonly string[] = ['safe', 'local'];
export { Config as PublicConfig };
export * from './types.ts';
`,
  'packages/core/example/src/types.ts':
    'export type Public = { value: string }',
  'packages/util/helper/package.json': JSON.stringify({
    name: '@synthetic/util',
    main: 'lib/index.js'
  }),
  'packages/util/helper/src/index.ts':
    'export function help(x: number): number { return x + 1 }',
  'packages/test-support/helper/package.json': JSON.stringify({
    name: '@synthetic/test-support',
    main: 'lib/index.js'
  }),
  'packages/test-support/helper/src/index.ts':
    'export interface TestSupport { synthetic: true }',
  'packages/core/example/tests/hidden.test.ts':
    "throw new Error('TEST_BODY_DO_NOT_READ')",
  'packages/core/example/lib/index.js': "throw new Error('BUILD_DO_NOT_READ')",
  'apps/cli/package.json': JSON.stringify({
    name: '@synthetic/cli',
    main: 'lib/index.js'
  }),
  'apps/cli/src/index.ts': 'export interface CLIConfig { profile: string }',
  'apps/cli/config/profile.cordis.yml': 'plugins:\n  - name: synthetic\n',
  'python/sdk/pyproject.toml': '[project]\nname = "synthetic-sdk"\n',
  'python/sdk/src/sdk.py': `
from typing import Optional
__all__ = ['Client']
class Client:
    timeout: int
    def run(self, text: str, mode: Optional[str] = None) -> str:
        return "PYTHON_BODY_DO_NOT_COPY"
def dynamic(value):
    return "PYTHON_BODY_DO_NOT_COPY"
`,
  'native/system/package.json': JSON.stringify({
    name: '@synthetic/native',
    main: 'index.ts'
  }),
  'native/system/src/index.ts':
    'export interface Native { lock(fd: number): void }',
  'native/system/src/entry.c':
    'void implementation() { /* NATIVE_BODY_DO_NOT_COPY */ }',
  'docs/tool-catalog.md':
    '# Tools\n## `@synthetic/example`\n### `work`\n```json\n{"name":"work","parameters":{"type":"object","required":["value"],"properties":{"value":{"type":"string"}}}}\n```\n',
  'docs/config-catalog.md':
    '# Config\n## `@synthetic/example`\n```ts config-catalog\nexport interface DocumentConfig { timeout?: number }\n```\n',
  'docs/capability-seams.md':
    '# Seams\n```mermaid\nflowchart LR\n  pkg_example["example"]\n  svc_work["ctx.work"]\n  pkg_example --> svc_work\n```\n',
  'docs/subsystems/core.md':
    '# Core\n<!-- BEGIN GENERATED cordis-surface -->\n```ts public-api\nexport interface ServiceEvents { "task/done": (id: string) => void }\n```\n<!-- END GENERATED cordis-surface -->\n',
  '.env': 'DO_NOT_READ_SECRET',
  'auth.json': '{"token":"DO_NOT_READ_SECRET"}',
  'sessions/private.json': '{"user":"DO_NOT_READ_SECRET"}'
}

function syntheticPin(root, names) {
  const run = (args, input) =>
    execFileSync('git', ['-C', root, ...args], {
      input,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Synthetic',
        GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
        GIT_COMMITTER_NAME: 'Synthetic',
        GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
        GIT_AUTHOR_DATE: '2026-10-14T00:00:00Z',
        GIT_COMMITTER_DATE: '2026-10-14T00:00:00Z'
      }
    }).trim()
  run(['init', '-q', '-b', 'main'])
  // Only disposable synthetic object storage: no project/reference git commit.
  run(['add', '--', ...names])
  const tree = run(['write-tree'])
  const commit = run(['commit-tree', tree], 'synthetic static fixture\n')
  run(['update-ref', 'refs/heads/main', commit])
  return commit
}

function fixture(overrides = {}) {
  fs.mkdirSync(evidence, { recursive: true })
  const root = fs.mkdtempSync(path.join(evidence, '.fixture-'))
  temporary.push(root)
  const dataFiles = { ...files, ...overrides }
  for (const [name, text] of Object.entries(dataFiles)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true })
    fs.writeFileSync(path.join(root, name), text)
  }
  const commit = syntheticPin(root, Object.keys(dataFiles))
  const package_owners = [
    'core/example',
    'util/helper',
    'test-support/helper'
  ].map((name) => {
    const manifest = `packages/${name}/package.json`
    const bytes = fs.readFileSync(path.join(root, manifest))
    const group = name.split('/')[0]
    return {
      reference_package: JSON.parse(bytes).name,
      manifest,
      manifest_sha256: sha(bytes),
      group,
      owner_task: {
        core: 'P100-012',
        util: 'P100-052',
        'test-support': 'P100-004'
      }[group]
    }
  })
  const ownerMap = {
    reference_commit: commit,
    reference_version: 'fixture-v1',
    inventory_coverage: { packages: 3, families: 3 },
    family_owners: {
      core: 'P100-012',
      util: 'P100-052',
      'test-support': 'P100-004'
    },
    package_owners,
    additional_surfaces: [
      { reference_path: 'apps/cli', owner_task: 'P100-040' },
      { reference_path: 'python/sdk', owner_task: 'P100-025' },
      { reference_path: 'native/system', owner_task: 'P100-024' }
    ]
  }
  const options = {
    root,
    expectedCommit: commit,
    expectedVersion: 'fixture-v1',
    ownerMap
  }
  return {
    ...options,
    options,
    collect: () => collectReferenceCatalog(options)
  }
}

afterEach(() => {
  for (const root of temporary.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

describe('P100-003 static contract catalog', () => {
  it('R12 A preserves program-shaped genuine event and tool declaration names', () => {
    const name = 'throw/ROLE_R12/'
    const f = fixture({
      'packages/core/example/src/types.ts': `export interface Events { ${JSON.stringify(name)}(id: string): void }`,
      'docs/tool-catalog.md':
        '# Tools\n## `@synthetic/example`\nSource: [types](../packages/core/example/src/types.ts)\n```json\n' +
        JSON.stringify({ name, parameters: { type: 'object' } }) +
        '\n```\n'
    })
    const catalog = f.collect()
    const event = catalog.entries.find(
      (entry) =>
        entry.kind === 'event-vocabulary' && entry.symbol === `Events.${name}`
    )
    const tool = catalog.entries.find(
      (entry) =>
        entry.kind === 'document-json' &&
        entry.source === 'docs/tool-catalog.md'
    )
    expect(event).toBeDefined()
    expect(event.shape.declarations[0].parameters[0].type).toBe('string')
    expect(tool.shape.name).toBe(name)
    for (const entry of [event, tool]) {
      expect(entry.owner_task).toBeTruthy()
      expect(entry.source_sha256).toBe(
        sha(fs.readFileSync(path.join(f.root, entry.source)))
      )
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
  })

  it('R12 B preserves a genuine literal selector without borrowing payload roles across sources', () => {
    const selector = 'throw/ROLE_R12/'
    const f = fixture({
      'packages/core/example/src/types.ts': `export type Selector = ${JSON.stringify(selector)}; export interface Envelope { type: ${JSON.stringify(selector)} }`,
      'packages/core/example/src/payload.ts': `export const opaqueValue = ${JSON.stringify(selector)};`
    })
    const catalog = f.collect()
    const type = catalog.entries.find((entry) => entry.symbol === 'Selector')
    const member = catalog.entries.find(
      (entry) => entry.symbol === 'Envelope.type'
    )
    for (const entry of [type, member]) {
      expect(entry.shape.declarations[0].type).toContain(selector)
      expect(entry.extraction_status).toBe('STATIC')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
    const payload = catalog.entries.find(
      (entry) => entry.symbol === 'opaqueValue'
    )
    expect(payload.shape.declarations[0].value).toMatchObject({
      status: 'UNKNOWN',
      value_sha256: sha(selector)
    })
  })

  it('R12 C keeps actual program source opaque in initializer and same-source mirrored literal types', () => {
    const program = 'throw/ROLE_R12/'
    const source = 'packages/core/example/src/types.ts'
    const f = fixture({
      [source]: [
        `export type SourceMirror = ${JSON.stringify(program)};`,
        `export const WorkerSource: ${JSON.stringify(program)} = ${JSON.stringify(program)};`,
        'new Worker(WorkerSource, { eval: true });'
      ].join('\n')
    })
    // Parse source only: the synthetic Worker constructor/guest is never run.
    const catalog = f.collect()
    const entries = catalog.entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(3) // source-surface + both declarations
    const literal = {
      value_sha256: sha(program),
      byte_length: Buffer.byteLength(program)
    }
    const worker = entries.find((entry) => entry.symbol === 'WorkerSource')
    expect(worker.shape.declarations[0].value).toMatchObject({
      status: 'UNKNOWN',
      ...literal
    })
    for (const symbol of ['WorkerSource', 'SourceMirror']) {
      const entry = entries.find((item) => item.symbol === symbol)
      expect(entry.shape.declarations[0].type).toMatchObject({
        status: 'UNKNOWN',
        literals: [literal]
      })
      expect(entry.extraction_status).toBe('UNKNOWN')
      expect(entry.owner_task).toBe('P100-012')
      expect(entry.source_sha256).toBe(
        sha(fs.readFileSync(path.join(f.root, source)))
      )
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
    expect(JSON.stringify(entries)).not.toContain(program)
  })

  it('R12 D persists payload context while preserving genuine tool/schema names and selectors', () => {
    const name = 'throw/ROLE_R12/'
    const payload = { name, nested: [{ type: 'string', required: [name] }] }
    const schema = {
      name,
      type: 'object',
      required: ['worker'],
      properties: {
        worker: {
          name,
          type: 'string',
          default: payload,
          const: payload,
          examples: [payload],
          unclassified: payload
        }
      }
    }
    const f = fixture({
      'packages/core/example/src/worker.schema.json': JSON.stringify(schema),
      'docs/tool-catalog.md':
        '# Tools\n## `@synthetic/example`\nSource: [types](../packages/core/example/src/types.ts)\n```json\n' +
        JSON.stringify({ name, parameters: schema }) +
        '\n```\n'
    })
    const catalog = f.collect()
    const entries = catalog.entries.filter((entry) =>
      ['json-schema-data', 'document-json'].includes(entry.kind)
    )
    expect(entries).toHaveLength(2)
    for (const entry of entries) {
      const projected =
        entry.kind === 'document-json' ? entry.shape.parameters : entry.shape
      expect(entry.shape.name).toBe(name)
      expect(projected).toMatchObject({
        name,
        type: 'object',
        required: ['worker']
      })
      const worker = projected.properties.worker
      expect(worker).toMatchObject({ name, type: 'string' })
      for (const value of [
        worker.default,
        worker.const,
        worker.examples[0],
        worker.unclassified
      ]) {
        expect(JSON.stringify(value)).not.toContain(name)
        expect(value.name).toMatchObject({
          status: 'UNKNOWN',
          value_sha256: sha(name),
          byte_length: Buffer.byteLength(name)
        })
        expect(value.nested[0].type).toMatchObject({
          status: 'UNKNOWN',
          value_sha256: sha('string'),
          byte_length: 6
        })
        expect(value.nested[0].required[0]).toMatchObject({
          status: 'UNKNOWN',
          value_sha256: sha(name)
        })
      }
      expect(entry.extraction_status).toBe('UNKNOWN')
      expect(entry.owner_task).toBe('P100-012')
      expect(entry.source_sha256).toBe(
        sha(fs.readFileSync(path.join(f.root, entry.source)))
      )
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
  })

  it('R12 provenance preserves an exact authenticated program-shaped safe filename', () => {
    const source = 'apps/cli/src/function guest(){return 7;}.ts'
    const body = 'SAFE_FILENAME_BODY_R12'
    const f = fixture({
      [source]: `export function safe(): number { /* ${body} */ return 7; }`
    })
    const catalog = f.collect()
    const entries = catalog.entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(2)
    expect(entries.find((entry) => entry.symbol === 'safe').owner_task).toBe(
      'P100-040'
    )
    expect(catalog.sources.find((item) => item.path === source).sha256).toBe(
      sha(fs.readFileSync(path.join(f.root, source)))
    )
    expect(
      entries.every(
        (entry) =>
          entry.source_sha256 ===
          sha(fs.readFileSync(path.join(f.root, source)))
      )
    ).toBe(true)
    expect(serializeCatalog(catalog)).toContain(source)
    expect(serializeCatalog(catalog)).not.toContain(body)
    expect(validateCatalog(catalog, { root: f.root }).status).toBe(
      'VALID_STATIC_CATALOG'
    )
  })

  it('collects actual manifest/API/type/config/event/tool schema and additional contracts without bodies', () => {
    const f = fixture(),
      catalog = f.collect(),
      text = serializeCatalog(catalog)
    expect(catalog.summary).toMatchObject({
      mapped_manifests: 3,
      mapped_families: 3,
      additional_surfaces: 3
    })
    expect(
      catalog.entries.every(
        (entry) => entry.parity_status === 'NOT_VERIFIED' && entry.owner_task
      )
    ).toBe(true)
    expect(
      catalog.entries.find(
        (entry) =>
          entry.kind === 'class-member' && entry.symbol === 'Service.run'
      ).shape.declarations[0]
    ).toMatchObject({
      parameters: [{ name: 'input', type: 'string' }],
      returns: 'Promise<Result<string>>'
    })
    expect(
      catalog.entries.find(
        (entry) => entry.kind === 'function' && entry.symbol === 'work'
      ).shape.declarations
    ).toHaveLength(3)
    expect(
      catalog.entries.some(
        (entry) =>
          entry.kind === 'event-vocabulary' &&
          entry.symbol.endsWith('Events.task/done')
      )
    ).toBe(true)
    expect(
      catalog.entries.find((entry) => entry.kind === 'document-json').shape
        .parameters
    ).toMatchObject({
      type: 'object',
      required: ['value'],
      properties: { value: { type: 'string' } }
    })
    expect(
      catalog.entries.some(
        (entry) => entry.kind === 'document-config-interface'
      )
    ).toBe(true)
    expect(
      catalog.entries.some(
        (entry) =>
          entry.kind === 'python-method' && entry.symbol === 'Client.run'
      )
    ).toBe(true)
    expect(
      catalog.entries.some(
        (entry) =>
          entry.kind === 'native-surface' &&
          entry.extraction_status === 'UNKNOWN'
      )
    ).toBe(true)
    expect(
      catalog.entries
        .filter((entry) => entry.family === 'test-support')
        .every((entry) => entry.scope === 'INFRASTRUCTURE_CLOSURE')
    ).toBe(true)
    for (const marker of [
      'IMPLEMENTATION_MARKER',
      'PYTHON_BODY_DO_NOT_COPY',
      'NATIVE_BODY_DO_NOT_COPY',
      'DO_NOT_READ_SECRET',
      'TEST_BODY_DO_NOT_READ',
      'BUILD_DO_NOT_READ',
      'Service.hidden'
    ])
      expect(text).not.toContain(marker)
    expect(
      catalog.sources.some((source) =>
        /(?:\.env|auth|sessions|\/tests\/|\/lib\/)/.test(source.path)
      )
    ).toBe(false)
    expect(validateCatalog(catalog, { root: f.root }).status).toBe(
      'VALID_STATIC_CATALOG'
    )
    expect(
      compareCatalogFreeze(catalog, f.collect(), { root: f.root }).status
    ).toBe('UNCHANGED_STATIC_FREEZE')
  })

  it('keeps dynamic/absent data UNKNOWN instead of treating it as an accepted empty value', () => {
    const catalog = fixture().collect()
    const schema = catalog.entries.find(
      (entry) => entry.kind === 'config-value' && entry.symbol === 'Schema'
    )
    expect(schema.extraction_status).toBe('UNKNOWN')
    expect(schema.shape.declarations[0].value).toMatchObject({
      status: 'UNKNOWN',
      call: 'buildSchema'
    })
    expect(
      catalog.entries.find(
        (entry) =>
          entry.kind === 'python-function' && entry.symbol === 'dynamic'
      ).extraction_status
    ).toBe('UNKNOWN')
    expect(
      catalog.entries
        .filter((entry) => entry.kind === 'configuration-data')
        .every((entry) => entry.shape.status === 'UNKNOWN')
    ).toBe(true)
  })

  it('is byte deterministic and IDs survive declaration order/line changes', () => {
    const f = fixture(),
      before = f.collect()
    expect(serializeCatalog(before)).toBe(serializeCatalog(f.collect()))
    f.ownerMap.package_owners.reverse()
    expect(serializeCatalog(before)).toEqual(serializeCatalog(f.collect()))
    expect(before.entries.map((entry) => entry.id)).toEqual(
      f.collect().entries.map((entry) => entry.id)
    )
    const rows = []
    const rowsReordered = []
    extractTypeScriptContracts(
      'export interface B { b: number }\nexport interface A { a: string }',
      (...args) => rows.push(args)
    )
    extractTypeScriptContracts(
      '\n\nexport interface A { a: string }\nexport interface B { b: number }',
      (...args) => rowsReordered.push(args)
    )
    expect(rows).toEqual(rowsReordered)
    const g = fixture({
      'packages/core/example/src/index.ts': `\n\n${files['packages/core/example/src/index.ts']}`
    })
    expect(before.entries.map((entry) => entry.id)).toEqual(
      g.collect().entries.map((entry) => entry.id)
    )
  })

  it('rejects changed/deleted/untracked contract sources and changed manifest owner hashes', () => {
    const f = fixture(),
      target = path.join(f.root, 'packages/core/example/src/index.ts')
    fs.appendFileSync(target, '\nexport type Added = string')
    expect(f.collect).toThrow(/SOURCE_DRIFT/)
    fs.writeFileSync(target, files['packages/core/example/src/index.ts'])
    fs.unlinkSync(target)
    expect(f.collect).toThrow(/SOURCE_DRIFT|MISSING_SOURCE/)
    fs.writeFileSync(target, files['packages/core/example/src/index.ts'])
    fs.writeFileSync(
      path.join(f.root, 'packages/core/example/src/new.ts'),
      'export type New = number'
    )
    expect(f.collect).toThrow(/SOURCE_DRIFT/)
    fs.unlinkSync(path.join(f.root, 'packages/core/example/src/new.ts'))
    f.ownerMap.package_owners[0].manifest_sha256 = '0'.repeat(64)
    expect(f.collect).toThrow(/OWNER_MAP_DRIFT/)
  })

  it('rejects wrong root/commit/version and missing/duplicate package ownership', () => {
    const f = fixture()
    expect(() =>
      collectReferenceCatalog({ ...f.options, expectedCommit: '0'.repeat(40) })
    ).toThrow(/COMMIT_DRIFT/)
    expect(() =>
      collectReferenceCatalog({ ...f.options, expectedVersion: 'wrong' })
    ).toThrow(/VERSION_DRIFT/)
    expect(() =>
      collectReferenceCatalog({
        ...f.options,
        root: path.join(f.root, 'packages')
      })
    ).toThrow(/ROOT_MISMATCH/)
    const missing = structuredClone(f.ownerMap)
    missing.package_owners.pop()
    expect(() =>
      collectReferenceCatalog({ ...f.options, ownerMap: missing })
    ).toThrow(/OWNER_MAP_MISSING/)
    f.ownerMap.package_owners.push(f.ownerMap.package_owners[0])
    expect(f.collect).toThrow(/OWNER_MAP_DUPLICATE/)
  })

  it('rejects symlinks and escaping source/owner paths without following them', () => {
    const f = fixture(),
      target = path.join(f.root, 'packages/core/example/src/index.ts')
    fs.unlinkSync(target)
    fs.symlinkSync('/nonexistent/outside-contract.ts', target)
    expect(f.collect).toThrow(/SOURCE_DRIFT|SYMLINK_SOURCE/)
    const good = fixture(),
      catalog = good.collect()
    catalog.sources[0].path = '../outside.json'
    expect(() => validateCatalog(catalog, { root: good.root })).toThrow(
      /UNSAFE_PATH/
    )
    good.ownerMap.package_owners[0].manifest = '/outside/package.json'
    expect(good.collect).toThrow(/UNSAFE_PATH/)
  })

  it('rejects a pinned external symlink and a root symlink before opening contract files', () => {
    const f = fixture(),
      target = path.join(f.root, 'packages/core/example/src/types.ts')
    fs.unlinkSync(target)
    fs.symlinkSync('/nonexistent/external-reference-type.ts', target)
    const pin = syntheticPin(f.root, Object.keys(files))
    f.options.expectedCommit = pin
    f.ownerMap.reference_commit = pin
    expect(f.collect).toThrow(/SYMLINK_SOURCE/)
    const good = fixture(),
      link = `${good.root}-link`
    temporary.push(link)
    fs.symlinkSync(good.root, link, 'dir')
    expect(() =>
      collectReferenceCatalog({ ...good.options, root: link })
    ).toThrow(/SYMLINK_ROOT/)
  })

  it('freeze rejects duplicate IDs, missing sources, removed requirements and content drift', () => {
    const f = fixture(),
      original = f.collect()
    const resign = (value) => {
      const data = { ...value }
      delete data.catalog_sha256
      value.catalog_sha256 = sha(
        JSON.stringify(JSON.parse(serializeCatalog(data)), null, 0)
      )
      return value
    }
    const duplicate = structuredClone(original)
    duplicate.entries.push(duplicate.entries[0])
    expect(() => compareCatalogFreeze(original, duplicate)).toThrow(
      /DUPLICATE_ID/
    )
    const missing = structuredClone(original)
    missing.sources = []
    expect(() => compareCatalogFreeze(original, missing)).toThrow(
      /INVALID_CATALOG/
    )
    const removed = structuredClone(original)
    removed.entries.pop()
    removed.summary.entries -= 1
    resign(removed)
    expect(() => compareCatalogFreeze(original, removed)).toThrow(
      /REQUIREMENT_REMOVED/
    )
    const drift = structuredClone(original)
    drift.sources[0].sha256 = '0'.repeat(64)
    expect(() =>
      compareCatalogFreeze(original, drift, { root: f.root })
    ).toThrow(/SOURCE_DRIFT/)
    fs.unlinkSync(path.join(f.root, original.sources[0].path))
    expect(() =>
      compareCatalogFreeze(original, original, { root: f.root })
    ).toThrow(/MISSING_SOURCE/)
  })

  it('rejects malformed AST, malformed documented JSON and missing documented source', () => {
    expect(() =>
      fixture({
        'packages/core/example/src/types.ts': 'export interface {'
      }).collect()
    ).toThrow(/AST_PARSE/)
    expect(() =>
      fixture({
        'docs/tool-catalog.md': '# Tools\n```json\nnot-json\n```\n'
      }).collect()
    ).toThrow(/CATALOG_JSON/)
    expect(() =>
      fixture({
        'docs/config-catalog.md':
          '[source](../packages/core/example/src/missing.ts)\n'
      }).collect()
    ).toThrow(/MISSING_DOCUMENT_SOURCE/)
  })

  it('Python never copies executable annotation/class-base expressions', () => {
    const f = fixture({
      'python/sdk/src/sdk.py':
        'class Dynamic(factory(lambda: "PYTHON_INLINE_BODY")):\n    def run(self, x: (lambda: "PYTHON_INLINE_BODY")):\n        return "PYTHON_INLINE_BODY"\n'
    })
    const catalog = f.collect()
    expect(serializeCatalog(catalog)).not.toContain('PYTHON_INLINE_BODY')
    expect(
      catalog.entries.find((entry) => entry.kind === 'python-class')
        .extraction_status
    ).toBe('UNKNOWN')
  })

  it('preserves explicit package owner overrides and parses generated Cordis fragments/variants by semantic anchors', () => {
    const f = fixture({
      'docs/subsystems/core.md': `# Core\n## Cordis API\n### ctx.example\n\`\`\`ts cordis-catalog\nrun(id: string): Promise<void>\nrun(id: number): Promise<void>\n\`\`\`\nSource: [source](../../packages/core/example/src/index.ts)\n\n### Options\n\`\`\`ts cordis-catalog\ninterface EventOptions { once?: boolean }\n\`\`\`\n\n### Flattened\n\`\`\`ts cordis-catalog\nrun(value: { readonly first: string readonly second: number }): void\n\`\`\`\n`,
      'docs/persistence-catalog.md':
        '# Persistence\n<a id="variant-one"></a>\n## Resolved\n| Field | Type |\n| --- | --- |\n| value | string |\n<a id="variant-two"></a>\n## Resolved\n| Field | Type |\n| --- | --- |\n| value | string |\n'
    })
    f.ownerMap.package_owners[0].owner_task = 'P100-038'
    const catalog = f.collect()
    expect(
      catalog.entries
        .filter((entry) => entry.source.startsWith('packages/core/example/'))
        .every((entry) => entry.owner_task === 'P100-038')
    ).toBe(true)
    const method = catalog.entries.find(
      (entry) =>
        entry.kind === 'document-class-member' &&
        entry.symbol ===
          `opaque-symbol:${sha('Core/Cordis API/ctx.example/CordisSurface.run')}`
    )
    expect(method.owner_task).toBe('P100-038')
    expect(method.shape.declarations).toHaveLength(2)
    expect(method.shape.identity_projection).toMatchObject({
      status: 'UNKNOWN',
      value_sha256: sha('Core/Cordis API/ctx.example/CordisSurface.run')
    })
    expect(
      catalog.entries.some(
        (entry) =>
          entry.kind === 'document-ast-unknown' &&
          entry.extraction_status === 'UNKNOWN'
      )
    ).toBe(true)
    expect(
      catalog.entries.filter(
        (entry) =>
          entry.kind === 'document-table-row' &&
          entry.source === 'docs/persistence-catalog.md'
      )
    ).toHaveLength(2)
  })

  it('does not copy executable expressions embedded in TypeScript heritage/types', () => {
    const rows = []
    extractTypeScriptContracts(
      'export interface Dynamic extends factory(() => { return "TYPE_INLINE_BODY" }) {}\nexport type Shape = { [factory(() => "TYPE_INLINE_BODY")]: string }',
      (...row) => rows.push(row)
    )
    expect(JSON.stringify(rows)).not.toContain('TYPE_INLINE_BODY')
    expect(JSON.stringify(rows)).toContain('UNKNOWN')
    const computed = []
    extractTypeScriptContracts(
      'export class Dynamic extends getBase() { [getName()](): void {} }',
      (...row) => computed.push(row)
    )
    expect(
      computed.find((row) => row[0] === 'class-member')[2].declarations[0]
        .name_resolution.status
    ).toBe('UNKNOWN')
    expect(
      computed.find((row) => row[0] === 'class')[2].declarations[0].heritage[0]
        .types[0].reference.status
    ).toBe('UNKNOWN')
  })

  it('freeze rejects live HEAD drift even when the catalog file itself is unchanged', () => {
    const f = fixture(),
      catalog = f.collect()
    execFileSync('git', ['-C', f.root, 'update-ref', '-d', 'refs/heads/main'])
    expect(() =>
      compareCatalogFreeze(catalog, catalog, { root: f.root })
    ).toThrow()
    const other = fixture()
    expect(() => validateCatalog(catalog, { root: other.root })).toThrow(
      /ROOT_MISMATCH/
    )
  })

  it('CLI writes reproducible JSON, validates freeze, exits nonzero on bad flags and refuses reference output', () => {
    const f = fixture(),
      mapPath = path.join(evidence, `.owner-${path.basename(f.root)}.json`),
      output = path.join(evidence, `.output-${path.basename(f.root)}.json`)
    temporary.push(mapPath, output)
    fs.writeFileSync(mapPath, JSON.stringify(f.ownerMap))
    const args = [
      'scripts/reference-contract-catalog.mjs',
      '--root',
      f.root,
      '--commit',
      f.expectedCommit,
      '--version',
      f.expectedVersion,
      '--owner-map',
      mapPath,
      '--output',
      output
    ]
    const invoke = (extra = []) =>
      spawnSync(process.execPath, [...args, ...extra], {
        encoding: 'utf8',
        cwd: process.cwd()
      })
    const result = invoke()
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({
      parity_status: 'NOT_VERIFIED',
      mapped_manifests: 3
    })
    expect(invoke(['--freeze', output]).status).toBe(0)
    expect(invoke(['--unexpected', 'value']).status).toBe(1)
    const unsafeArgs = args
      .slice(0, -1)
      .concat(path.join(f.root, 'catalog.json'))
    expect(
      spawnSync(process.execPath, unsafeArgs, { encoding: 'utf8' }).stderr
    ).toContain('OUTPUT_IN_REFERENCE')
    expect(fs.existsSync(path.join(f.root, 'catalog.json'))).toBe(false)
  })

  it('retains executable string requirements as hashes without copying literal or template bodies', () => {
    const source =
      'function run(value) { return value + 1; /* STRING_BODY_MARKER */ }'
    const f = fixture({
      'packages/core/example/src/types.ts': [
        `export const WORKER_SOURCE = ${JSON.stringify(source)};`,
        'export const GUEST_SOURCE = `function guest() { return "TEMPLATE_BODY_MARKER" }`;',
        `export const Options = build({ nested: [{ code: ${JSON.stringify(source)} }] });`
      ].join('\n')
    })
    const catalog = f.collect()
    const text = serializeCatalog(catalog)
    expect(text).not.toContain('STRING_BODY_MARKER')
    expect(text).not.toContain('TEMPLATE_BODY_MARKER')
    const worker = catalog.entries.find(
      (entry) => entry.kind === 'value' && entry.symbol === 'WORKER_SOURCE'
    )
    expect(worker.extraction_status).toBe('UNKNOWN')
    expect(worker.shape.declarations[0].value).toMatchObject({
      status: 'UNKNOWN',
      value_sha256: sha(source),
      byte_length: Buffer.byteLength(source)
    })
    expect(worker.parity_status).toBe('NOT_VERIFIED')
    expect(worker.source_sha256).toBe(
      sha(fs.readFileSync(path.join(f.root, worker.source)))
    )
    const template = catalog.entries.find(
      (entry) => entry.symbol === 'GUEST_SOURCE'
    )
    expect(template.shape.declarations[0].value).toMatchObject({
      status: 'UNKNOWN',
      value_sha256: sha('function guest() { return "TEMPLATE_BODY_MARKER" }'),
      byte_length: Buffer.byteLength(
        'function guest() { return "TEMPLATE_BODY_MARKER" }'
      )
    })
    const options = catalog.entries.find((entry) => entry.symbol === 'Options')
    expect(options.owner_task).toBe('P100-012')
    expect(JSON.stringify(options.shape)).toContain(sha(source))
    expect(options.extraction_status).toBe('UNKNOWN')
  })

  it('retains schema and documented JSON code literals as UNKNOWN hashes, never bodies', () => {
    const body = 'function guest() { return "JSON_GUEST_BODY_MARKER"; }'
    const schema = {
      type: 'object',
      required: ['worker'],
      additionalProperties: false,
      properties: {
        worker: { type: 'string', default: body, const: body, examples: [body] }
      }
    }
    const f = fixture({
      'packages/core/example/src/worker.schema.json': JSON.stringify(schema),
      'docs/tool-catalog.md':
        '# Tools\n## Work\n```json\n' + JSON.stringify(schema) + '\n```\n'
    })
    const catalog = f.collect()
    expect(serializeCatalog(catalog)).not.toContain('JSON_GUEST_BODY_MARKER')
    const entries = catalog.entries.filter((entry) =>
      ['json-schema-data', 'document-json'].includes(entry.kind)
    )
    expect(entries).toHaveLength(2)
    for (const entry of entries) {
      expect(entry.extraction_status).toBe('UNKNOWN')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
      expect(entry.owner_task).toMatch(/^P100-\d{3}$/)
      expect(entry.source_sha256).toBe(
        sha(fs.readFileSync(path.join(f.root, entry.source)))
      )
      expect(entry.shape).toMatchObject({
        type: 'object',
        required: ['worker'],
        additionalProperties: false
      })
      for (const value of [
        entry.shape.properties.worker.default,
        entry.shape.properties.worker.const,
        entry.shape.properties.worker.examples[0]
      ]) {
        expect(value).toMatchObject({
          status: 'UNKNOWN',
          value_sha256: sha(body),
          byte_length: Buffer.byteLength(body)
        })
      }
    }
  })

  it('live validator authenticates recomputed source metadata against pinned blobs', () => {
    const f = fixture(),
      catalog = f.collect()
    const sourcePath = 'packages/core/example/src/types.ts'
    fs.appendFileSync(
      path.join(f.root, sourcePath),
      '\nexport type Changed = string'
    )
    const bytes = fs.readFileSync(path.join(f.root, sourcePath))
    const source = catalog.sources.find((item) => item.path === sourcePath)
    source.sha256 = sha(bytes)
    source.bytes = bytes.length
    source.git_blob = crypto
      .createHash('sha1')
      .update(`blob ${bytes.length}\0`)
      .update(bytes)
      .digest('hex')
    for (const entry of catalog.entries.filter(
      (entry) => entry.source === sourcePath
    ))
      entry.source_sha256 = source.sha256
    const content = { ...catalog }
    delete content.catalog_sha256
    catalog.catalog_sha256 = sha(
      JSON.stringify(JSON.parse(serializeCatalog(content)))
    )
    expect(validateCatalog(catalog).status).toBe('VALID_STATIC_CATALOG')
    expect(() => validateCatalog(catalog, { root: f.root })).toThrow(
      /SOURCE_DRIFT/
    )
  })

  it('opaque literal protection also covers document cells, graph labels and annotation literals', () => {
    const body = 'function guest() { return "OTHER_LITERAL_BODY_MARKER"; }'
    const f = fixture({
      'packages/core/example/src/types.ts': `export type GuestSource = ${JSON.stringify(body)};`,
      'python/sdk/src/sdk.py': `__all__ = [${JSON.stringify(body)}]\ndef run(value: ${JSON.stringify(body)}):\n    pass\n`,
      'docs/persistence-catalog.md':
        '# Types\n| Field | Type |\n| --- | --- |\n| worker | ' + body + ' |\n',
      'docs/capability-seams.md':
        '# Seams\n```mermaid\nflowchart LR\n  worker["' +
        body.replaceAll('"', "'") +
        '"]\n```\n'
    })
    const catalog = f.collect()
    expect(serializeCatalog(catalog)).not.toContain('OTHER_LITERAL_BODY_MARKER')
    for (const kind of [
      'type',
      'python-function',
      'python-exports',
      'document-table-row',
      'capability-graph'
    ]) {
      expect(
        catalog.entries.some(
          (entry) =>
            entry.kind === kind && entry.extraction_status === 'UNKNOWN'
        )
      ).toBe(true)
    }
  })

  it('does not copy guest bodies through identities, literal names or bytes annotations', () => {
    const body = 'function guest(){return 1;/* IDENTITY_BODY_MARKER */}'
    const f = fixture({
      'packages/core/example/package.json': JSON.stringify({
        name: '@synthetic/example',
        version: 'fixture-v1',
        main: body
      }),
      'docs/persistence-catalog.md':
        '# Types\n## ' +
        body +
        '\n| Field | Type |\n| --- | --- |\n| ' +
        body +
        ' | string |\n',
      'packages/core/example/src/types.ts': [
        `export const Options: Record<string, boolean> = { ${JSON.stringify(body)}: true };`,
        `export interface LiteralNames { ${JSON.stringify(body)}(): void; }`,
        `export { Options as ${JSON.stringify(body)} };`
      ].join('\n'),
      'python/sdk/src/sdk.py': `def run(value: b${JSON.stringify(body)}) -> int:\n    pass\n`
    })
    const catalog = f.collect()
    expect(serializeCatalog(catalog)).not.toContain('IDENTITY_BODY_MARKER')
    for (const kind of [
      'manifest',
      'document-table-row',
      'interface-member',
      'export',
      'python-function'
    ]) {
      const entries = catalog.entries.filter((entry) => entry.kind === kind)
      expect(
        entries.some((entry) => entry.extraction_status === 'UNKNOWN')
      ).toBe(true)
      expect(
        entries.every(
          (entry) =>
            entry.owner_task &&
            entry.source_sha256 &&
            entry.parity_status === 'NOT_VERIFIED'
        )
      ).toBe(true)
    }
    const options = catalog.entries.find((entry) => entry.symbol === 'Options')
    expect(
      options.shape.declarations[0].value.properties[0].name
    ).toMatchObject({ status: 'UNKNOWN', value_sha256: sha(body) })
    expect(validateCatalog(catalog, { root: f.root }).status).toBe(
      'VALID_STATIC_CATALOG'
    )
  })

  it('distinct opaque module names retain separate declaration requirements', () => {
    const f = fixture({
      'packages/core/example/src/types.ts': `declare module 'opaque module one' { const asset: string; export default asset; }\ndeclare module 'opaque module two' { const asset: string; export default asset; }`
    })
    const entries = f
      .collect()
      .entries.filter((entry) => entry.source.endsWith('/types.ts'))
    expect(entries.filter((entry) => entry.kind === 'value')).toHaveLength(2)
    expect(entries.filter((entry) => entry.kind === 'export')).toHaveLength(2)
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length)
    expect(
      entries
        .filter((entry) => ['value', 'export'].includes(entry.kind))
        .every((entry) => entry.extraction_status === 'UNKNOWN')
    ).toBe(true)
  })

  it('rejects implementation text in root/package provenance identifiers', () => {
    const body = 'function guest(){ return 1; /* MANIFEST_NAME_BODY */ }'
    const root = fixture({
      'package.json': JSON.stringify({ name: body, version: 'fixture-v1' })
    })
    expect(root.collect).toThrow(/INVALID_REFERENCE_METADATA/)
    const member = fixture({
      'packages/core/example/package.json': JSON.stringify({
        name: body,
        version: 'fixture-v1'
      })
    })
    expect(member.collect).toThrow(/INVALID_REFERENCE_METADATA/)
  })

  it.each([
    'apps/cli/package.json',
    'native/system/package.json',
    'python/sdk/package.json',
    'vendor/guest/package.json'
  ])('rejects additional package body name in %s', (name) => {
    const body = 'function guest(){ return 1; /* ADDITIONAL_FENCE_BODY */ }'
    const f = fixture({ [name]: JSON.stringify({ name: body }) })
    expect(f.collect).toThrow(/INVALID_REFERENCE_METADATA/)
  })
  it('hashes unrecognized fence info without copying implementation bytes', () => {
    const body = 'function guest(){ return 1; /* ADDITIONAL_FENCE_BODY */ }'
    const f = fixture({
      'docs/tool-catalog.md': '# Tools\n```' + body + '\nignored body\n```\n'
    })
    const catalog = f.collect()
    expect(serializeCatalog(catalog)).not.toContain('ADDITIONAL_FENCE_BODY')
    const entry = catalog.entries.find(
      (item) => item.kind === 'document-unparsed'
    )
    expect(entry.shape.language).toMatchObject({
      status: 'UNKNOWN',
      value_sha256: sha(body)
    })
  })
  it('requires an explicit owner for additional implementation surfaces', () => {
    const missing = fixture()
    missing.ownerMap.additional_surfaces =
      missing.ownerMap.additional_surfaces.filter(
        (item) => item.reference_path !== 'apps/cli'
      )
    expect(missing.collect).toThrow(/OWNER_MAP_MISSING/)
  })

  it('never executes a reference configured fsmonitor or hook during static Git reads', () => {
    const f = fixture({
      'contract-monitor.sh':
        '#!/bin/sh\nprintf REFERENCE_COMMAND_EXECUTED > fsmonitor-marker\n'
    })
    const script = path.join(f.root, 'contract-monitor.sh')
    fs.chmodSync(script, 0o755)
    execFileSync('git', [
      '-C',
      f.root,
      'config',
      'core.fsmonitor',
      './contract-monitor.sh'
    ])
    execFileSync('git', ['-C', f.root, 'config', 'core.hooksPath', '.'])
    expect(f.collect().parity_status).toBe('NOT_VERIFIED')
    expect(fs.existsSync(path.join(f.root, 'fsmonitor-marker'))).toBe(false)
  })

  it('rejects partial/promisor references before object reads can fetch', () => {
    const f = fixture()
    execFileSync('git', [
      '-C',
      f.root,
      'config',
      'remote.synthetic.promisor',
      'true'
    ])
    expect(f.collect).toThrow(/PARTIAL_REFERENCE/)
  })

  it('does not follow excluded documentation file links while inventorying source paths', () => {
    const f = fixture()
    fs.symlinkSync(
      '/nonexistent/private-document',
      path.join(f.root, 'packages/CLAUDE.md')
    )
    expect(
      f.collect().sources.some((source) => source.path.endsWith('CLAUDE.md'))
    ).toBe(false)
  })

  for (const conversion of ['clean', 'process'])
    it(`does not invoke configured ${conversion} conversion for excluded changed worktree files`, () => {
      const f = fixture({
        '.gitattributes': 'watched.txt filter=synthetic\n',
        'watched.txt': 'before\n',
        'conversion-command.sh':
          '#!/bin/sh\nprintf CONVERSION_EXECUTED > conversion-marker\nexit 1\n'
      })
      fs.chmodSync(path.join(f.root, 'conversion-command.sh'), 0o755)
      execFileSync('git', [
        '-C',
        f.root,
        'config',
        `filter.synthetic.${conversion}`,
        './conversion-command.sh'
      ])
      fs.writeFileSync(
        path.join(f.root, 'watched.txt'),
        'changed content forces byte revalidation\n'
      )
      expect(f.collect().parity_status).toBe('NOT_VERIFIED')
      expect(fs.existsSync(path.join(f.root, 'conversion-marker'))).toBe(false)
    })

  it('authenticates the real commit tree despite replacement refs and unchanged HEAD', () => {
    const f = fixture()
    const original = f.expectedCommit
    fs.writeFileSync(
      path.join(f.root, 'packages/core/example/src/types.ts'),
      'export interface Replaced { injected: true }'
    )
    const replacement = syntheticPin(f.root, Object.keys(files))
    execFileSync('git', [
      '-C',
      f.root,
      'update-ref',
      'refs/heads/main',
      original
    ])
    execFileSync('git', ['-C', f.root, 'replace', original, replacement])
    expect(
      execFileSync('git', ['-C', f.root, 'rev-parse', 'HEAD'], {
        encoding: 'utf8'
      }).trim()
    ).toBe(original)
    expect(f.collect).toThrow(/SOURCE_DRIFT/)
  })

  it('rejects external output hardlinks without changing any reference inode', () => {
    const f = fixture()
    const mapPath = path.join(
      evidence,
      `.owner-hardlink-${path.basename(f.root)}.json`
    )
    const output = path.join(
      evidence,
      `.output-hardlink-${path.basename(f.root)}.json`
    )
    temporary.push(mapPath, output)
    fs.writeFileSync(mapPath, JSON.stringify(f.ownerMap))
    const manifest = path.join(f.root, 'packages/core/example/package.json')
    const before = fs.readFileSync(manifest)
    fs.linkSync(manifest, output)
    const result = spawnSync(
      process.execPath,
      [
        'scripts/reference-contract-catalog.mjs',
        '--root',
        f.root,
        '--commit',
        f.expectedCommit,
        '--version',
        f.expectedVersion,
        '--owner-map',
        mapPath,
        '--output',
        output
      ],
      { encoding: 'utf8' }
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('OUTPUT_HARDLINK')
    expect(fs.readFileSync(manifest)).toEqual(before)
    expect(fs.readFileSync(output)).toEqual(before)
  })
})
