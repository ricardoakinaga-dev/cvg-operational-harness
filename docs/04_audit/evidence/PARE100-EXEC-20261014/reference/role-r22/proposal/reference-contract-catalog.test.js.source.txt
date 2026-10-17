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
  'docs/04_audit/evidence/PARE100-EXEC-20261014/reference/role-r21'
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
  // R22 regression block begin: witnesses are inert Python source data only.
  it.each([
    ['function', ''],
    ['function', ': list[str]'],
    ['class', ''],
    ['class', ': list[str]']
  ])(
    'R22 %s-local __all__%s is runtime data and cannot privilege a mirrored annotation',
    (scope, annotation) => {
      const source = 'python/sdk/src/sdk.py'
      const payload = 'debugger'
      const assignment = `    __all__${annotation} = ['debugger']\n    exec(__all__[0])\n`
      const text =
        scope === 'function'
          ? `def run(value: "debugger") -> None:\n${assignment}`
          : `class Local:\n${assignment}def run(value: "debugger") -> None:\n    pass\n`
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(
        scope === 'function' ? 2 : annotation ? 4 : 3
      )
      expect(entries.some((entry) => entry.kind === 'python-exports')).toBe(
        false
      )
      const run = entries.find((entry) => entry.symbol === 'run')
      expect(run.kind).toBe('python-function')
      expect(run.shape.parameters[0].type).toMatchObject({
        status: 'UNKNOWN',
        value_sha256: sha(payload),
        byte_length: 8
      })
      expect(run.shape.parameters[0].type.reason).toBeTruthy()
      expect(run.shape.returns).toBe('None')
      expect(run.extraction_status).toBe('UNKNOWN')
      expect(serializeCatalog(entries)).not.toContain(payload)
      for (const entry of entries) {
        expect(entry.source_sha256).toBe(sha(text))
        expect(entry.owner_task).toBe('P100-025')
        expect(entry.parity_status).toBe('NOT_VERIFIED')
        expect(entry.id).toBe(
          `contract:${sha(JSON.stringify({ kind: entry.kind, package: entry.package, source, symbol: entry.symbol }))}`
        )
      }
    }
  )

  it.each(['', ': list[str]'])(
    'R22 module-level __all__%s preserves a genuine export and pure mirrored annotation',
    (annotation) => {
      const source = 'python/sdk/src/sdk.py'
      const text = `__all__${annotation} = ['debugger']\ndef run(value: "debugger") -> None:\n    pass\n`
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(3)
      const exports = entries.find((entry) => entry.kind === 'python-exports')
      expect(exports.shape.names).toEqual(['debugger'])
      expect(exports.extraction_status).toBe('STATIC')
      const run = entries.find((entry) => entry.symbol === 'run')
      expect(run.shape.parameters[0].type).toBe("'debugger'")
      expect(run.shape.returns).toBe('None')
      expect(run.extraction_status).toBe('STATIC')
      for (const entry of entries) {
        expect(entry.source_sha256).toBe(sha(text))
        expect(entry.owner_task).toBe('P100-025')
        expect(entry.parity_status).toBe('NOT_VERIFIED')
        expect(entry.id).toBe(
          `contract:${sha(JSON.stringify({ kind: entry.kind, package: entry.package, source, symbol: entry.symbol }))}`
        )
      }
    }
  )
  // R22 regression block end.

  it.each(['build_type', 'eval'])(
    'R21 dynamic __all__ annotation %s contributes runtime literals without indexing export names',
    (callee) => {
      const source = 'python/sdk/src/sdk.py'
      const payload = '40 + 2'
      const text = `__all__: ${callee}('40 + 2') = ['Client']\ndef mirror(value: '40 + 2'): pass\n`
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(3)
      const exports = entries.find((entry) => entry.kind === 'python-exports')
      expect(exports.shape.names).toEqual(['Client'])
      expect(exports.extraction_status).toBe('STATIC')
      const mirror = entries.find((entry) => entry.symbol === 'mirror')
      expect(mirror.shape.parameters[0].type).toMatchObject({
        status: 'UNKNOWN',
        value_sha256: sha(payload),
        byte_length: Buffer.byteLength(payload)
      })
      expect(mirror.shape.parameters[0].type.reason).toBeTruthy()
      expect(serializeCatalog(entries)).not.toContain(payload)
      for (const entry of entries) {
        expect(entry.source_sha256).toBe(sha(text))
        expect(entry.owner_task).toBe('P100-025')
        expect(entry.parity_status).toBe('NOT_VERIFIED')
        expect(entry.id).toBe(
          `contract:${sha(JSON.stringify({ kind: entry.kind, package: entry.package, source, symbol: entry.symbol }))}`
        )
      }
    }
  )

  it('R21 pure __all__ annotation and export values do not self-contaminate forward references', () => {
    const source = 'python/sdk/src/sdk.py'
    const text =
      "__all__: list['Client'] = ['Client']\ndef mirror(value: 'Client') -> 'Client': pass\n"
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(3)
    const exports = entries.find((entry) => entry.kind === 'python-exports')
    expect(exports.shape.names).toEqual(['Client'])
    expect(exports.extraction_status).toBe('STATIC')
    const mirror = entries.find((entry) => entry.symbol === 'mirror')
    expect(mirror.shape.parameters[0].type).toBe("'Client'")
    expect(mirror.shape.returns).toBe("'Client'")
    expect(mirror.extraction_status).toBe('STATIC')
    for (const entry of entries) {
      expect(entry.source_sha256).toBe(sha(text))
      expect(entry.owner_task).toBe('P100-025')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
  })

  it.each([
    ['ts', false],
    ['ts', true],
    ['js', false]
  ])(
    'R21 plain %s runtime fence shares physical-source literals (runtime first=%s)',
    (language, runtimeFirst) => {
      const source = 'docs/tool-catalog.md'
      const payload = 'throw/STATIC_FENCE_R20/'
      const mirror =
        '## Mirror\n```ts public-api\nexport type Mirror = "throw/STATIC_FENCE_R20/";\n```\n'
      const runtime = `## Runtime\n\`\`\`${language}\nnew Worker("throw/STATIC_FENCE_R20/", { eval: true });\n\`\`\`\n`
      const text =
        '# Manual\n' + (runtimeFirst ? runtime + mirror : mirror + runtime)
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(3)
      const type = entries.find((entry) => entry.kind === 'document-type')
      expect(type.shape.declarations[0].type).toMatchObject({
        status: 'UNKNOWN',
        literals: [
          {
            value_sha256: sha(payload),
            byte_length: Buffer.byteLength(payload)
          }
        ]
      })
      const unparsed = entries.find(
        (entry) => entry.kind === 'document-unparsed'
      )
      expect(unparsed.extraction_status).toBe('UNKNOWN')
      expect(unparsed.shape.language).toMatchObject({
        status: 'UNKNOWN',
        value_sha256: sha(language),
        byte_length: Buffer.byteLength(language)
      })
      expect(serializeCatalog(entries)).not.toContain('STATIC_FENCE_R20')
      for (const entry of entries) {
        expect(entry.source_sha256).toBe(sha(text))
        expect(entry.owner_task).toBe('P100-003')
        expect(entry.parity_status).toBe('NOT_VERIFIED')
        expect(entry.id).toBe(
          `contract:${sha(JSON.stringify({ kind: entry.kind, package: entry.package, source, symbol: entry.symbol }))}`
        )
      }
    }
  )

  it('R21 plain TS declaration-only literals remain metadata while that fence stays UNKNOWN', () => {
    const source = 'docs/tool-catalog.md'
    const payload = 'throw/STATIC_FENCE_R20/'
    const text =
      '# Manual\n## Mirror\n```ts public-api\nexport type Mirror = "throw/STATIC_FENCE_R20/";\n```\n## Other\n```ts\nexport type Other = "throw/STATIC_FENCE_R20/";\n```\n'
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(3)
    const type = entries.find((entry) => entry.kind === 'document-type')
    expect(JSON.parse(type.shape.declarations[0].type)).toBe(payload)
    expect(type.extraction_status).toBe('STATIC')
    expect(
      entries.find((entry) => entry.kind === 'document-unparsed')
        .extraction_status
    ).toBe('UNKNOWN')
    expect(
      entries.filter((entry) => entry.kind === 'document-type')
    ).toHaveLength(1)
  })

  it('R21 Python exports cannot copy an already-indexed runtime literal protected in an annotation', () => {
    const source = 'python/sdk/src/sdk.py'
    const text =
      'import subprocess\n__all__ = ["debugger"]\ndef exported(value: "debugger") -> None:\n    pass\nsubprocess.run(["node", "-e", "debugger"])\n'
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(3)
    const literal = {
      status: 'UNKNOWN',
      value_sha256: sha('debugger'),
      byte_length: Buffer.byteLength('debugger')
    }
    const exports = entries.find((entry) => entry.kind === 'python-exports')
    expect(exports.symbol).toBe('__all__')
    expect(exports.shape.names).toEqual([expect.objectContaining(literal)])
    expect(exports.shape.names[0].reason).toBeTruthy()
    expect(
      entries.find((entry) => entry.kind === 'python-function').shape
        .parameters[0].type
    ).toMatchObject(literal)
    expect(serializeCatalog(entries)).not.toContain('debugger')
    for (const entry of entries) {
      expect(entry.source_sha256).toBe(sha(text))
      expect(entry.owner_task).toBe('P100-025')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
      expect(entry.id).toBe(
        `contract:${sha(JSON.stringify({ kind: entry.kind, package: entry.package, source, symbol: entry.symbol }))}`
      )
    }
  })

  it.each(['', ': list[str]'])(
    'R21 Python __all__%s retains clean exports beside colliding exports and mirrored annotations',
    (annotation) => {
      const source = 'python/sdk/src/sdk.py'
      const text = `__all__${annotation} = ["debugger", "Client"]\nclass Client:\n    pass\ndef exported(value: "debugger") -> "debugger":\n    pass\nconsume("debugger")\n`
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(4)
      const literal = {
        status: 'UNKNOWN',
        value_sha256: sha('debugger'),
        byte_length: 8
      }
      const exports = entries.find((entry) => entry.kind === 'python-exports')
      expect(exports.shape.names).toEqual([
        expect.objectContaining(literal),
        'Client'
      ])
      expect(exports.extraction_status).toBe('UNKNOWN')
      const fn = entries.find((entry) => entry.kind === 'python-function')
      expect(fn.shape.parameters[0].type).toMatchObject(literal)
      expect(fn.shape.returns).toMatchObject(literal)
      expect(serializeCatalog(entries)).not.toContain('debugger')
      for (const entry of entries) {
        expect(entry.source_sha256).toBe(sha(text))
        expect(entry.owner_task).toBe('P100-025')
        expect(entry.parity_status).toBe('NOT_VERIFIED')
      }
    }
  )

  it('R21 annotated literal __all__ adds its named requirement and retains surrounding IDs', () => {
    const source = 'python/sdk/src/sdk.py'
    const text =
      '__all__: list[str] = ["Client"]\nclass Client:\n    def send(self, value: int) -> None:\n        pass\n'
    const unannotated = text.replace('__all__: list[str]', '__all__')
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    const control = fixture({ [source]: unannotated })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(4)
    expect(control).toHaveLength(4)
    expect(entries.map((entry) => entry.id).sort()).toEqual(
      control.map((entry) => entry.id).sort()
    )
    const exports = entries.find((entry) => entry.kind === 'python-exports')
    expect(exports.symbol).toBe('__all__')
    expect(exports.shape.names).toEqual(['Client'])
    expect(exports.extraction_status).toBe('STATIC')
    expect(entries.map((entry) => entry.kind).sort()).toEqual([
      'python-class',
      'python-exports',
      'python-method',
      'python-surface'
    ])
    for (const entry of entries) {
      expect(entry.source_sha256).toBe(sha(text))
      expect(entry.owner_task).toBe('P100-025')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
      expect(entry.id).toBe(
        `contract:${sha(JSON.stringify({ kind: entry.kind, package: entry.package, source, symbol: entry.symbol }))}`
      )
    }
  })

  it.each(['', ': list[str]'])(
    'R21 genuine __all__%s and forward references remain exact with runtime text only in another source',
    (annotation) => {
      const source = 'python/sdk/src/sdk.py'
      const text = `__all__${annotation} = ["Client"]\nclass Client:\n    def send(self, value: "Client") -> "Client":\n        pass\n`
      const entries = fixture({
        [source]: text,
        'python/sdk/src/other.py': 'consume("Client")\n'
      })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(4)
      const exports = entries.find((entry) => entry.kind === 'python-exports')
      expect(exports.shape.names).toEqual(['Client'])
      expect(exports.extraction_status).toBe('STATIC')
      const method = entries.find((entry) => entry.kind === 'python-method')
      expect(
        method.shape.parameters.find((parameter) => parameter.name === 'value')
          .type
      ).toBe("'Client'")
      expect(method.shape.returns).toBe("'Client'")
      for (const entry of entries) {
        expect(entry.source_sha256).toBe(sha(text))
        expect(entry.owner_task).toBe('P100-025')
        expect(entry.parity_status).toBe('NOT_VERIFIED')
      }
    }
  )

  it.each([true, false])(
    'R20b simple-edge operator uses source-local collision policy (runtime=%s)',
    (collision) => {
      const source = 'docs/tool-catalog.md'
      const runtime = collision
        ? 'new Worker("-->", { eval: true });'
        : 'export type Operator = "-->";'
      const text =
        '# Contracts\n## Runtime\n```ts public-api\n' +
        runtime +
        '\n```\n## Graph\n```mermaid\nflowchart LR\n  left["node"]\n  right["target"]\n  left --> right\n```\n'
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(collision ? 2 : 3)
      const graph = entries.find((entry) => entry.kind === 'capability-graph')
      expect(graph.shape.nodes.map((node) => node.id)).toEqual([
        'left',
        'right'
      ])
      expect(graph.shape.edges).toHaveLength(1)
      if (collision) {
        expect(graph.shape.edges[0]).toMatchObject({
          from: graph.shape.nodes[0].id,
          operator: {
            status: 'UNKNOWN',
            value_sha256: sha('-->'),
            byte_length: Buffer.byteLength('-->')
          },
          to: graph.shape.nodes[1].id
        })
        expect(graph.shape.edges[0].operator.reason).toBeTruthy()
        expect(serializeCatalog(entries)).not.toContain('-->')
      } else {
        expect(graph.shape.edges[0]).toBe('left --> right')
        const declaration = entries.find(
          (entry) => entry.kind === 'document-type'
        )
        expect(JSON.parse(declaration.shape.declarations[0].type)).toBe('-->')
        expect(declaration.extraction_status).toBe('STATIC')
      }
      for (const entry of entries) {
        expect(entry.source_sha256).toBe(sha(text))
        expect(entry.owner_task).toBe('P100-003')
        expect(entry.parity_status).toBe('NOT_VERIFIED')
        expect(entry.id).toBe(
          `contract:${sha(JSON.stringify({ kind: entry.kind, package: entry.package, source, symbol: entry.symbol }))}`
        )
      }
    }
  )

  it('R20b whole simple-edge collision stays opaque while preserving endpoint connectivity', () => {
    const source = 'docs/tool-catalog.md'
    const edgeText = 'left --> right'
    const text =
      '# Contracts\n## Runtime\n```ts public-api\nnew Worker("left --> right", { eval: true });\n```\n## Graph\n```mermaid\nflowchart LR\n  left["node"]\n  right["target"]\n  left --> right\n```\n'
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(2)
    const graph = entries.find((entry) => entry.kind === 'capability-graph')
    expect(graph.shape.nodes.map((node) => node.id)).toEqual(['left', 'right'])
    expect(graph.shape.edges).toHaveLength(1)
    expect(graph.shape.edges[0]).toMatchObject({
      from: graph.shape.nodes[0].id,
      operator: '-->',
      to: graph.shape.nodes[1].id,
      status: 'UNKNOWN',
      value_sha256: sha(edgeText),
      byte_length: Buffer.byteLength(edgeText)
    })
    expect(graph.shape.edges[0].reason).toBeTruthy()
    expect(serializeCatalog(entries)).not.toContain(edgeText)
    for (const entry of entries) {
      expect(entry.source_sha256).toBe(sha(text))
      expect(entry.owner_task).toBe('P100-003')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
      expect(entry.id).toBe(
        `contract:${sha(JSON.stringify({ kind: entry.kind, package: entry.package, source, symbol: entry.symbol }))}`
      )
    }
  })

  it.each([false, true])(
    'R20 root JSON opaque string shares payload evidence with a type in either order (reversed=%s)',
    (reversed) => {
      const source = 'docs/tool-catalog.md'
      const payload = 'function guest(){return 19;/* ROOT_PAYLOAD_R19 */}'
      const jsonFence = `## Payload\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`\n`
      const tsFence = `## Mirror\n\`\`\`ts public-api\nexport type Mirror = ${JSON.stringify(payload)};\n\`\`\`\n`
      const text =
        '# Contracts\n' + (reversed ? tsFence + jsonFence : jsonFence + tsFence)
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(3)
      const literal = {
        value_sha256: sha(payload),
        byte_length: Buffer.byteLength(payload)
      }
      expect(
        entries.find((entry) => entry.kind === 'document-json').shape
      ).toMatchObject({ status: 'UNKNOWN', ...literal })
      expect(
        entries.find((entry) => entry.kind === 'document-type').shape
          .declarations[0].type
      ).toMatchObject({ status: 'UNKNOWN', literals: [literal] })
      expect(serializeCatalog(entries)).not.toContain('ROOT_PAYLOAD_R19')
      for (const entry of entries) {
        expect(entry.source_sha256).toBe(sha(text))
        expect(entry.owner_task).toBe('P100-003')
        expect(entry.parity_status).toBe('NOT_VERIFIED')
        expect(entry.id).toBe(
          `contract:${sha(JSON.stringify({ kind: entry.kind, package: entry.package, source, symbol: entry.symbol }))}`
        )
      }
    }
  )

  it('R20 declaration-only document literal type preserves exact body without JSON payload evidence', () => {
    const source = 'docs/tool-catalog.md'
    const payload = 'function guest(){return 19;/* ROOT_PAYLOAD_R19 */}'
    const text = `# Contracts\n## Mirror\n\`\`\`ts public-api\nexport type Mirror = ${JSON.stringify(payload)};\n\`\`\`\n`
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(2)
    const entry = entries.find((entry) => entry.kind === 'document-type')
    expect(JSON.parse(entry.shape.declarations[0].type)).toBe(payload)
    expect(entry.extraction_status).toBe('STATIC')
  })

  it('R20 unclassified JSON type string joins the same literal index as its opaque projection', () => {
    const source = 'docs/tool-catalog.md'
    const payload = 'unclassified schema string?!'
    const text = `# Contracts\n## Mirror\n\`\`\`ts public-api\nexport type Mirror = ${JSON.stringify(payload)};\n\`\`\`\n## Schema\n\`\`\`json\n${JSON.stringify({ type: payload })}\n\`\`\`\n`
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(3)
    const literal = {
      value_sha256: sha(payload),
      byte_length: Buffer.byteLength(payload)
    }
    expect(
      entries.find((entry) => entry.kind === 'document-json').shape.type
    ).toMatchObject({ status: 'UNKNOWN', ...literal })
    expect(
      entries.find((entry) => entry.kind === 'document-type').shape
        .declarations[0].type
    ).toMatchObject({ status: 'UNKNOWN', literals: [literal] })
    expect(serializeCatalog(entries)).not.toContain(payload)
  })

  it.each([false, true])(
    'R20 built-in JSON type obeys shared runtime collision evidence in either order (reversed=%s)',
    (reversed) => {
      const source = 'docs/tool-catalog.md'
      const tsFence =
        '## Runtime\n```ts public-api\nexport type Mirror = "null";\nnew Worker("null", { eval: true });\n```\n'
      const jsonFence = '## Schema\n```json\n{"type":"null"}\n```\n'
      const text =
        '# Contracts\n' + (reversed ? jsonFence + tsFence : tsFence + jsonFence)
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(3)
      const literal = { value_sha256: sha('null'), byte_length: 4 }
      expect(
        entries.find((entry) => entry.kind === 'document-json').shape.type
      ).toMatchObject({ status: 'UNKNOWN', ...literal })
      expect(
        entries.find((entry) => entry.kind === 'document-type').shape
          .declarations[0].type
      ).toMatchObject({ status: 'UNKNOWN', literals: [literal] })
      for (const entry of entries) {
        expect(entry.source_sha256).toBe(sha(text))
        expect(entry.owner_task).toBe('P100-003')
        expect(entry.parity_status).toBe('NOT_VERIFIED')
      }
    }
  )

  it('R20 declaration-only JSON types and reference remain exact without payload collision', () => {
    const source = 'docs/tool-catalog.md'
    const schema = {
      type: [
        'null',
        'boolean',
        'object',
        'array',
        'number',
        'string',
        'integer'
      ],
      $ref: '/C_ROUTE/',
      name: 'schema with space?!'
    }
    const entries = fixture({
      [source]: `# Schema\n\`\`\`json\n${JSON.stringify(schema)}\n\`\`\`\n`
    })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(2)
    const entry = entries.find((entry) => entry.kind === 'document-json')
    expect(entry.shape).toEqual(schema)
    expect(entry.extraction_status).toBe('STATIC')
  })

  it.each([false, true])(
    'R20 graph IDs and edge endpoints share opaque runtime collision identity in either fence order (reversed=%s)',
    (reversed) => {
      const source = 'docs/tool-catalog.md'
      const tsFence =
        '## Runtime\n```ts public-api\nexport type Mirror = "debugger";\nnew Worker("debugger", { eval: true });\n```\n'
      const graphFence =
        '## Graph\n```mermaid\nflowchart LR\n  debugger["node"]\n  sink["target"]\n  debugger --> sink\n' +
        (reversed ? '  sink -.-> debugger\n' : '') +
        '```\n'
      const text =
        '# Contracts\n' +
        (reversed ? graphFence + tsFence : tsFence + graphFence)
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(3)
      const graph = entries.find((entry) => entry.kind === 'capability-graph')
      const literal = { value_sha256: sha('debugger'), byte_length: 8 }
      expect(graph.shape.nodes[0].id).toMatchObject({
        status: 'UNKNOWN',
        ...literal
      })
      expect(graph.shape.nodes[1].id).toBe('sink')
      expect(graph.shape.edges[0]).toEqual({
        from: graph.shape.nodes[0].id,
        operator: '-->',
        to: 'sink'
      })
      if (reversed)
        expect(graph.shape.edges[1]).toEqual({
          from: 'sink',
          operator: '-.->',
          to: graph.shape.nodes[0].id
        })
      expect(graph.shape.edges).toHaveLength(reversed ? 2 : 1)
      expect(
        entries.find((entry) => entry.kind === 'document-type').shape
          .declarations[0].type
      ).toMatchObject({ status: 'UNKNOWN', literals: [literal] })
      expect(serializeCatalog(entries)).not.toContain('debugger')
      for (const entry of entries) {
        expect(entry.source_sha256).toBe(sha(text))
        expect(entry.owner_task).toBe('P100-003')
        expect(entry.parity_status).toBe('NOT_VERIFIED')
        expect(entry.id).toBe(
          `contract:${sha(JSON.stringify({ kind: entry.kind, package: entry.package, source, symbol: entry.symbol }))}`
        )
      }
    }
  )

  it('R20 ordinary graph identifiers and simple edge strings stay unchanged without runtime collision', () => {
    const source = 'docs/tool-catalog.md'
    const text =
      '# Graph\n```mermaid\nflowchart LR\n  debugger["node"]\n  sink["target"]\n  debugger --> sink\n  sink -.-> debugger\n```\n'
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(2)
    const graph = entries.find((entry) => entry.kind === 'capability-graph')
    expect(graph.shape.nodes.map((node) => node.id)).toEqual([
      'debugger',
      'sink'
    ])
    expect(graph.shape.edges).toEqual([
      'debugger --> sink',
      'sink -.-> debugger'
    ])
    expect(graph.shape.nodes[0].label).toMatchObject({
      status: 'UNKNOWN',
      value_sha256: sha('node'),
      byte_length: 4
    })
    expect(graph.shape.semantics.status).toBe('UNKNOWN')
  })

  it.each(['module with space?!', 'function guest(){return 20;}'])(
    'R20 named export selector %s retains exact declaration metadata without identity change',
    (selector) => {
      const source = 'packages/core/example/src/types.ts'
      const text = `export { Config } from ${JSON.stringify(selector)};\n`
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(2)
      const entry = entries.find((entry) => entry.kind === 'export')
      expect(entry.shape.declarations[0].module_selector).toBe(selector)
      expect(entry.shape.declarations[0].from).toMatchObject({
        status: 'UNKNOWN',
        value_sha256: sha(selector),
        byte_length: Buffer.byteLength(selector)
      })
      expect(entry.symbol).toBe('Config')
      expect(entry.id).toBe(
        `contract:${sha(JSON.stringify({ kind: 'export', package: entry.package, source, symbol: 'Config' }))}`
      )
      expect(entry.source_sha256).toBe(sha(text))
      expect(entry.owner_task).toBe('P100-012')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
  )

  it('R20 star and namespace exports preserve selector metadata with legacy opaque identities', () => {
    const source = 'packages/core/example/src/types.ts'
    const selectors = ['module with space?!', 'module namespace?!']
    const text = `export * from ${JSON.stringify(selectors[0])};\nexport * as Group from ${JSON.stringify(selectors[1])};\n`
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(3)
    for (const selector of selectors) {
      const from = {
        byte_length: Buffer.byteLength(selector),
        reason: 'Unclassified literal name; bytes not copied',
        status: 'UNKNOWN',
        value_sha256: sha(selector)
      }
      const expectedSymbol = `opaque-symbol:${sha('*:' + JSON.stringify(from))}`
      const entry = entries.find((entry) => entry.symbol === expectedSymbol)
      expect(entry).toBeDefined()
      expect(entry.shape.declarations[0].module_selector).toBe(selector)
      expect(entry.shape.declarations[0].from).toEqual(from)
      expect(entry.id).toBe(
        `contract:${sha(JSON.stringify({ kind: 'export', package: entry.package, source, symbol: expectedSymbol }))}`
      )
    }
    expect(
      entries.find(
        (entry) => entry.shape.declarations?.[0].namespace === 'Group'
      )
    ).toBeDefined()
  })

  it('R20 export selector metadata stays UNKNOWN on same-source runtime collision', () => {
    const source = 'packages/core/example/src/types.ts'
    const selector = 'module with space?!'
    const text = `export { Config } from ${JSON.stringify(selector)};\nexport * from ${JSON.stringify(selector)};\nconsume(${JSON.stringify(selector)});\n`
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(3)
    for (const entry of entries.filter((entry) => entry.kind === 'export')) {
      expect(entry.shape.declarations[0].module_selector).toMatchObject({
        status: 'UNKNOWN',
        value_sha256: sha(selector),
        byte_length: Buffer.byteLength(selector)
      })
      expect(entry.source_sha256).toBe(sha(text))
      expect(entry.owner_task).toBe('P100-012')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
    expect(serializeCatalog(entries)).not.toContain(selector)
  })

  it.each([
    ['eval', 'parameter'],
    ['ordinary_annotation', 'parameter'],
    ['ordinary_annotation', 'return']
  ])(
    'R19 dynamic Python %s in %s annotation indexes runtime literals without execution',
    (callee, slot) => {
      const source = 'python/sdk/src/sdk.py'
      const payload = '40 + 2'
      const expression = `${callee}("${payload}")`
      const text = `def run(value: ${slot === 'parameter' ? expression : '"' + payload + '"'}) -> ${slot === 'return' ? expression : '"' + payload + '"'}:\n    pass\n`
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(2)
      const entry = entries.find((entry) => entry.symbol === 'run')
      const dynamic =
        slot === 'parameter'
          ? entry.shape.parameters[0].type
          : entry.shape.returns
      const mirror =
        slot === 'return' ? entry.shape.parameters[0].type : entry.shape.returns
      const literal = {
        value_sha256: sha(payload),
        byte_length: Buffer.byteLength(payload)
      }
      expect(dynamic).toMatchObject({ status: 'UNKNOWN', literals: [literal] })
      expect(mirror).toMatchObject({ status: 'UNKNOWN', ...literal })
      expect(serializeCatalog(entries)).not.toContain(payload)
      for (const item of entries) {
        expect(item.source_sha256).toBe(sha(text))
        expect(item.owner_task).toBe('P100-025')
        expect(item.parity_status).toBe('NOT_VERIFIED')
        expect(item.id).toBe(
          `contract:${sha(JSON.stringify({ kind: item.kind, package: item.package, source, symbol: item.symbol }))}`
        )
      }
    }
  )

  it('R19 pure Python annotation containers retain declaration-only literals', () => {
    const source = 'python/sdk/src/sdk.py'
    const text = 'def run(value: list["40 + 2"]) -> "40 + 2":\n    pass\n'
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(2)
    const entry = entries.find((item) => item.symbol === 'run')
    expect(entry.shape.parameters[0].type).toBe("list['40 + 2']")
    expect(entry.shape.returns).toBe("'40 + 2'")
    expect(entry.extraction_status).toBe('STATIC')
  })

  it('R19 Markdown shared runtime evidence makes a mirrored JSON $ref opaque', () => {
    const source = 'docs/tool-catalog.md'
    const payload = '/C_ROUTE/'
    const text =
      '# Contracts\n## Runtime\n```ts public-api\nexport type Mirror = "/C_ROUTE/";\nnew Worker("/C_ROUTE/", { eval: true });\n```\n## Locator\n```json\n{"$ref":"/C_ROUTE/"}\n```\n'
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(3)
    expect(entries.map((entry) => entry.kind).sort()).toEqual([
      'document-json',
      'document-surface',
      'document-type'
    ])
    const literal = {
      value_sha256: sha(payload),
      byte_length: Buffer.byteLength(payload)
    }
    expect(
      entries.find((entry) => entry.kind === 'document-json').shape.$ref
    ).toMatchObject({ status: 'UNKNOWN', ...literal })
    expect(
      entries.find((entry) => entry.kind === 'document-type').shape
        .declarations[0].type
    ).toMatchObject({ status: 'UNKNOWN', literals: [literal] })
    expect(serializeCatalog(entries)).not.toContain(payload)
    for (const entry of entries) {
      expect(entry.source_sha256).toBe(sha(text))
      expect(entry.owner_task).toBe('P100-003')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
      expect(entry.id).toBe(
        `contract:${sha(JSON.stringify({ kind: entry.kind, package: entry.package, source, symbol: entry.symbol }))}`
      )
    }
  })

  it('R19 genuine JSON $ref without same-source runtime collision remains exact', () => {
    const source = 'docs/tool-catalog.md'
    const text =
      '# Contracts\n## Runtime\n```ts public-api\nexport type Mirror = "/C_ROUTE/";\n```\n## Locator\n```json\n{"$ref":"/C_ROUTE/"}\n```\n'
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(3)
    const entry = entries.find((item) => item.kind === 'document-json')
    expect(entry.shape.$ref).toBe('/C_ROUTE/')
    expect(entry.extraction_status).toBe('STATIC')
    expect(
      JSON.parse(
        entries.find((item) => item.kind === 'document-type').shape
          .declarations[0].type
      )
    ).toBe('/C_ROUTE/')
  })

  it.each(['opaque module one', 'opaque module?! ✓'])(
    'R19 ambient module selector %s remains exact metadata with existing opaque identity',
    (selector) => {
      const source = 'packages/core/example/src/types.ts'
      const text = `declare module ${JSON.stringify(selector)} { export const asset: number; }\n`
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(2)
      const entry = entries.find((item) => item.kind === 'value')
      expect(entry.shape.declarations[0].module_context).toEqual([
        { name: selector }
      ])
      const opaqueName = JSON.stringify({
        byte_length: Buffer.byteLength(selector),
        reason: 'Unclassified literal name; bytes not copied',
        status: 'UNKNOWN',
        value_sha256: sha(selector)
      })
      expect(entry.symbol).toBe(`opaque-symbol:${sha(opaqueName + '.asset')}`)
      expect(entry.id).toBe(
        `contract:${sha(JSON.stringify({ kind: 'value', package: entry.package, source, symbol: entry.symbol }))}`
      )
      expect(entry.source_sha256).toBe(sha(text))
      expect(entry.owner_task).toBe('P100-012')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
  )

  it('R19 module context follows nested scopes without leaking into siblings or top level', () => {
    const source = 'packages/core/example/src/types.ts'
    const text =
      'declare module "opaque module one" { namespace Inner { export type Nested = number; } export type Parent = string; }\ndeclare module "sibling?!" { export type Sibling = boolean; }\nexport type Outside = null;\n'
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(5)
    const types = entries.filter((entry) => entry.kind === 'type')
    expect(types).toHaveLength(4)
    const shapeOf = (type) =>
      types.find((entry) => entry.shape.declarations[0].type === type).shape
        .declarations[0]
    expect(shapeOf('number').module_context).toEqual([
      { name: 'opaque module one' },
      { name: 'Inner' }
    ])
    expect(shapeOf('string').module_context).toEqual([
      { name: 'opaque module one' }
    ])
    expect(shapeOf('boolean').module_context).toEqual([{ name: 'sibling?!' }])
    expect(shapeOf('null')).not.toHaveProperty('module_context')
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(5)
  })

  it('R19 module selector runtime collision is UNKNOWN in context without changing opaque identity', () => {
    const source = 'packages/core/example/src/types.ts'
    const selector = 'opaque module one'
    const text = `declare module "${selector}" { export const asset: number; }\nconsume("${selector}");\n`
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(2)
    const entry = entries.find((item) => item.kind === 'value')
    expect(entry.shape.declarations[0].module_context).toEqual([
      {
        name: expect.objectContaining({
          status: 'UNKNOWN',
          value_sha256: sha(selector),
          byte_length: Buffer.byteLength(selector)
        })
      }
    ])
    expect(serializeCatalog(entries)).not.toContain(selector)
    const opaqueName = JSON.stringify({
      byte_length: Buffer.byteLength(selector),
      reason: 'Unclassified literal name; bytes not copied',
      status: 'UNKNOWN',
      value_sha256: sha(selector)
    })
    expect(entry.symbol).toBe(`opaque-symbol:${sha(opaqueName + '.asset')}`)
    expect(entry.id).toBe(
      `contract:${sha(JSON.stringify({ kind: 'value', package: entry.package, source, symbol: entry.symbol }))}`
    )
    expect(entry.source_sha256).toBe(sha(text))
    expect(entry.owner_task).toBe('P100-012')
    expect(entry.parity_status).toBe('NOT_VERIFIED')
  })

  it.each([
    'throw 0',
    'event: ready?! [v2]',
    'ação ✓ 你好',
    'function guest() { return "OTHER_LITERAL_BODY_MARKER"; }'
  ])(
    'R18 TypeScript declaration-only selector preserves exact value %s',
    (selector) => {
      const source = 'packages/core/example/src/types.ts'
      const text = `export type Selector = ${JSON.stringify(selector)};\n`
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(2)
      const entry = entries.find((entry) => entry.symbol === 'Selector')
      const type = entry.shape.declarations[0].type
      expect(typeof type).toBe('string')
      expect(JSON.parse(type)).toBe(selector)
      expect(entry.extraction_status).toBe('STATIC')
      expect(entry.source_sha256).toBe(sha(text))
      expect(entry.owner_task).toBe('P100-012')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
  )

  it.each([
    'throw 0',
    'event: ready?! [v2]',
    'ação ✓ 你好',
    'function guest() { return "OTHER_LITERAL_BODY_MARKER"; }'
  ])(
    'R18 TypeScript same-source runtime collision remains opaque for %s',
    (selector) => {
      const source = 'packages/core/example/src/types.ts'
      const text = `export type Selector = ${JSON.stringify(selector)};\nconsume(${JSON.stringify(selector)});\n`
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(2)
      const entry = entries.find((entry) => entry.symbol === 'Selector')
      expect(entry.shape.declarations[0].type).toMatchObject({
        status: 'UNKNOWN',
        literals: [
          {
            value_sha256: sha(selector),
            byte_length: Buffer.byteLength(selector)
          }
        ]
      })
      expect(JSON.stringify(entries)).not.toContain(selector)
      expect(entry.extraction_status).toBe('UNKNOWN')
      expect(entry.source_sha256).toBe(sha(text))
      expect(entry.owner_task).toBe('P100-012')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
  )

  it.each([
    'throw 0',
    'event: ready?! [v2]',
    'ação ✓ 你好',
    'function guest() { return "OTHER_LITERAL_BODY_MARKER"; }'
  ])(
    'R18 Python declaration-only selector preserves exact value %s',
    (selector) => {
      const source = 'python/sdk/src/sdk.py'
      const text = `def run(value: ${JSON.stringify(selector)}) -> ${JSON.stringify(selector)}:\n    pass\n`
      const entries = fixture({
        [source]: text,
        'python/sdk/src/other.py': `consume(${JSON.stringify(selector)})\n`
      })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(2)
      const entry = entries.find((entry) => entry.symbol === 'run')
      expect(entry.shape.parameters[0].type).toBe("'" + selector + "'")
      expect(entry.shape.returns).toBe("'" + selector + "'")
      expect(entry.extraction_status).toBe('STATIC')
      expect(entry.source_sha256).toBe(sha(text))
      expect(entry.owner_task).toBe('P100-025')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
  )

  it.each([
    'throw 0',
    'event: ready?! [v2]',
    'ação ✓ 你好',
    'function guest() { return "OTHER_LITERAL_BODY_MARKER"; }'
  ])(
    'R18 Python same-source runtime collision remains opaque for %s',
    (selector) => {
      const source = 'python/sdk/src/sdk.py'
      const text = `def run(value: ${JSON.stringify(selector)}) -> ${JSON.stringify(selector)}:\n    pass\nconsume(${JSON.stringify(selector)})\n`
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(2)
      const entry = entries.find((entry) => entry.symbol === 'run')
      for (const type of [entry.shape.parameters[0].type, entry.shape.returns])
        expect(type).toMatchObject({
          status: 'UNKNOWN',
          value_sha256: sha(selector),
          byte_length: Buffer.byteLength(selector)
        })
      expect(JSON.stringify(entries)).not.toContain(selector)
      expect(entry.extraction_status).toBe('UNKNOWN')
      expect(entry.source_sha256).toBe(sha(text))
      expect(entry.owner_task).toBe('P100-025')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
  )

  it.each([String.raw`\ud800`, String.raw`\udfff`, String.raw`a\ud800z`])(
    'R17 Python escaped surrogate %s preserves unknown provenance without a collector crash',
    (escaped) => {
      const source = 'python/sdk/src/sdk.py'
      const text = `runtime = '${escaped}'\ndef run(value: '${escaped}') -> None:\n    pass\n`
      const entries = fixture({ [source]: text })
        .collect()
        .entries.filter((e) => e.source === source)
      expect(entries).toHaveLength(2)
      const run = entries.find((e) => e.kind === 'python-function')
      const codepoints =
        escaped === String.raw`\ud800`
          ? [0xed, 0xa0, 0x80]
          : escaped === String.raw`\udfff`
            ? [0xed, 0xbf, 0xbf]
            : [0x61, 0xed, 0xa0, 0x80, 0x7a]
      const bytes = Buffer.from(codepoints)
      expect(run.shape.parameters[0].type).toMatchObject({
        status: 'UNKNOWN',
        value_sha256: sha(bytes),
        byte_length: bytes.length,
        encoding: 'utf-8-surrogatepass'
      })
      expect(run.shape.returns).toBe('None')
      for (const e of entries) {
        expect(e.source_sha256).toBe(sha(text))
        expect(e.owner_task).toBe('P100-025')
        expect(e.parity_status).toBe('NOT_VERIFIED')
      }
    }
  )

  it.each([
    [
      'assigned source',
      "source = 'throw/PY_ROLE/'\ndef run(value: 'throw/PY_ROLE/') -> None:\n    pass\nsubprocess.run(['node', '-e', source])\n"
    ],
    [
      'direct call literal',
      "def run(value: 'throw/PY_ROLE/') -> None:\n    pass\nsubprocess.run(['node', '-e', 'throw/PY_ROLE/'])\n"
    ]
  ])(
    'R16 Python hypothesis: %s colliding with a string annotation stays opaque',
    (_kind, body) => {
      const program = 'throw/PY_ROLE/'
      const source = 'python/sdk/src/sdk.py'
      const text = 'import subprocess\n' + body
      // The fixture is parsed by stdlib AST, never imported/executed. In
      // particular subprocess.run and the guest literal remain inert source.
      const f = fixture({ [source]: text })
      const catalog = f.collect()
      const entries = catalog.entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(2)
      const run = entries.find(
        (entry) => entry.kind === 'python-function' && entry.symbol === 'run'
      )
      expect(run.shape.parameters[0].type).toMatchObject({
        status: 'UNKNOWN',
        value_sha256: sha(program),
        byte_length: Buffer.byteLength(program)
      })
      expect(run.shape.parameters[0].type.reason).toBeTruthy()
      expect(JSON.stringify(entries)).not.toContain(program)
      expect(run.shape.returns).toBe('None')
      for (const entry of entries) {
        expect(entry.owner_task).toBe('P100-025')
        expect(entry.source_sha256).toBe(sha(text))
        expect(entry.parity_status).toBe('NOT_VERIFIED')
      }
    }
  )

  it('R16 Python collisions use runtime AST positions rather than sink or program names', () => {
    const program = 'throw/PY_GENERIC/'
    const source = 'python/sdk/src/sdk.py'
    const text = `def run(value: list[${JSON.stringify(program)}]) -> ${JSON.stringify(program)}:\n    consume(${JSON.stringify(program)})\nclass Service:\n    value: ${JSON.stringify(program)}\n    def send(self, item: ${JSON.stringify(program)}):\n        return ${JSON.stringify(program)}\n`
    const entries = fixture({ [source]: text })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(5) // source + function + class + field + method
    const run = entries.find((entry) => entry.symbol === 'run')
    const send = entries.find((entry) => entry.symbol === 'Service.send')
    const field = entries.find((entry) => entry.symbol === 'Service.value')
    for (const value of [
      run.shape.parameters[0].type,
      run.shape.returns,
      send.shape.parameters[1].type,
      field.shape.type
    ])
      expect(value).toMatchObject({
        status: 'UNKNOWN',
        value_sha256: sha(program),
        byte_length: Buffer.byteLength(program)
      })
    expect(JSON.stringify(entries)).not.toContain(program)
  })

  it('R16 Python preserves annotation-only forward references, declarations and export IDs across physical files', () => {
    const source = 'python/sdk/src/sdk.py'
    const text = `from external import Remote as PublicRemote\n__all__ = ['Client', 'run', 'PublicRemote']\nclass Client:\n    "Client"\n    value: "Client"\n    def send(self, value: list["Client"]) -> "Client":\n        pass\ndef run(value: "Client") -> "Remote":\n    pass\n`
    const catalog = fixture({
      [source]: text,
      'python/sdk/src/runtime.py': 'consume("Client")\n'
    }).collect()
    const entries = catalog.entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(7) // source + export + exports + class + field + method + function
    const run = entries.find((entry) => entry.symbol === 'run')
    const send = entries.find((entry) => entry.symbol === 'Client.send')
    expect(run.shape.parameters[0].type).toContain('Client')
    expect(run.shape.returns).toContain('Remote')
    expect(send.shape.parameters[1].type).toContain('Client')
    expect(send.shape.returns).toContain('Client')
    expect(
      entries.find((entry) => entry.symbol === 'Client.value').shape.type
    ).toContain('Client')
    expect(
      entries.find((entry) => entry.symbol === '__all__').shape.names
    ).toEqual(['Client', 'run', 'PublicRemote'])
    expect(entries.find((entry) => entry.kind === 'python-export').symbol).toBe(
      'PublicRemote'
    )
    expect(entries.find((entry) => entry.kind === 'python-class').symbol).toBe(
      'Client'
    )
    expect(
      entries.every(
        (entry) =>
          entry.owner_task === 'P100-025' &&
          entry.source_sha256 === sha(text) &&
          entry.parity_status === 'NOT_VERIFIED'
      )
    ).toBe(true)
    const other = catalog.entries.filter(
      (entry) => entry.source === 'python/sdk/src/runtime.py'
    )
    expect(other).toHaveLength(1)
  })

  it('R15 exact I1-R14-01 opaquely projects an unclassified JSON member and same-source mirror', () => {
    const program = 'throw/ROOT_I1/'
    const member = JSON.stringify({ [program]: true })
    const source = 'docs/tool-catalog.md'
    const markdown =
      '# Roles\n## Payload\n```json\n{"type":"object","throw/ROOT_I1/":true}\n```\n## Mirror\n```ts public-api\nexport type SourceMirror = \'throw/ROOT_I1/\';\n```\n'
    const f = fixture({ [source]: markdown })
    const entries = f
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(3)
    const data = entries.find((entry) => entry.kind === 'document-json')
    expect(data.shape.type).toBe('object')
    expect(data.shape.unclassified_members).toMatchObject({
      status: 'UNKNOWN',
      value_sha256: sha(member),
      byte_length: Buffer.byteLength(member)
    })
    const mirror = entries.find((entry) => entry.kind === 'document-type')
    expect(mirror.shape.declarations[0].type).toMatchObject({
      status: 'UNKNOWN',
      literals: [
        { value_sha256: sha(program), byte_length: Buffer.byteLength(program) }
      ]
    })
    expect(JSON.stringify(entries)).not.toContain(program)
    for (const entry of entries) {
      expect(entry.owner_task).toBe('P100-003')
      expect(entry.source_sha256).toBe(sha(markdown))
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
  })

  it('R15 exact I1-R14-02 keeps a payload table cell opaque in its identity as well as shape', () => {
    const program = 'throw/TABLE_I1/'
    const source = 'docs/tool-catalog.md'
    const markdown =
      "# Tools\n## Payloads\n```ts public-api\nexport const WorkerSource = 'throw/TABLE_I1/';\nnew Worker(WorkerSource, { eval: true });\n```\n| Example | Meaning |\n| --- | --- |\n| throw/TABLE_I1/ | guest source |\n"
    const f = fixture({ [source]: markdown })
    const entries = f
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(3)
    const row = entries.find((entry) => entry.kind === 'document-table-row')
    expect(row.symbol).toBe(`opaque-symbol:${sha('Tools/Payloads/' + program)}`)
    expect(row.shape.identity_projection).toMatchObject({
      status: 'UNKNOWN',
      value_sha256: sha('Tools/Payloads/' + program),
      byte_length: Buffer.byteLength('Tools/Payloads/' + program)
    })
    expect(row.shape.rows[0][0]).toMatchObject({
      status: 'UNKNOWN',
      value_sha256: sha(program),
      byte_length: Buffer.byteLength(program)
    })
    expect(JSON.stringify(entries)).not.toContain(program)
    for (const entry of entries) {
      expect(entry.owner_task).toBe('P100-003')
      expect(entry.source_sha256).toBe(sha(markdown))
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
  })

  it('R15 table identities are opaque by role, preserve distinct contexts, and survive row reordering', () => {
    const source = 'docs/persistence-catalog.md'
    const header = '| Example | Meaning |\n| --- | --- |\n'
    const a = '| alpha | first |\n',
      b = '| beta | second |\n'
    const one = fixture({
      [source]: '# Tables\n## One\n' + header + a + b + '## Two\n' + header + a
    }).collect()
    const two = fixture({
      [source]: '# Tables\n## One\n' + header + b + a + '## Two\n' + header + a
    }).collect()
    const select = (catalog) =>
      catalog.entries.filter(
        (entry) =>
          entry.source === source && entry.kind === 'document-table-row'
      )
    const entries = select(one)
    expect(entries).toHaveLength(3)
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(3)
    expect(
      entries.every(
        (entry) =>
          entry.symbol.startsWith('opaque-symbol:') &&
          entry.shape.identity_projection.status === 'UNKNOWN'
      )
    ).toBe(true)
    expect(entries.map((entry) => entry.id)).toEqual(
      select(two).map((entry) => entry.id)
    )
    expect(
      entries.every(
        (entry) =>
          entry.owner_task === 'P100-003' &&
          entry.source_sha256 &&
          entry.parity_status === 'NOT_VERIFIED'
      )
    ).toBe(true)
  })

  it('R15 document identity routes mask shared payload text even inside heading/context parts', () => {
    const program = 'throw/HEADING_R15/'
    const source = 'docs/tool-catalog.md'
    const markdown =
      '# Tools\n## prefix/' +
      program +
      '/suffix\n```ts public-api\nexport const WorkerSource = ' +
      JSON.stringify(program) +
      ';\nnew Worker(WorkerSource, { eval: true });\nexport type Selector = \'declared\';\n```\n```json\n{"name":"declared tool"}\n```\n```mermaid\nflowchart LR\n  node["label"]\n```\n| Example | Meaning |\n| --- | --- |\n| ordinary | value |\n```unclassified-info\nignored body\n```\n'
    const entries = fixture({ [source]: markdown })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(7)
    expect(JSON.stringify(entries)).not.toContain(program)
    expect(
      entries
        .filter((entry) => entry.kind !== 'document-surface')
        .every((entry) => entry.symbol.startsWith('opaque-symbol:'))
    ).toBe(true)
    expect(
      entries.find((entry) => entry.kind === 'document-type').shape
        .declarations[0].type
    ).toContain('declared')
    expect(
      entries.find((entry) => entry.kind === 'document-json').shape.name
    ).toBe('declared tool')
    expect(
      entries.every(
        (entry) =>
          entry.owner_task === 'P100-003' &&
          entry.source_sha256 === sha(markdown) &&
          entry.parity_status === 'NOT_VERIFIED'
      )
    ).toBe(true)
  })

  it('R15 unclassified table data enters the physical-source index before earlier declarations', () => {
    const program = 'row/RAW_R15/'
    const source = 'docs/tool-catalog.md'
    const markdown =
      '# Docs\n```ts public-api\nexport type Selector = ' +
      JSON.stringify(program) +
      ';\n```\n| Example | Meaning |\n| --- | --- |\n| ' +
      program +
      ' | data |\n'
    const entries = fixture({ [source]: markdown })
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(3)
    expect(
      entries.find((entry) => entry.kind === 'document-type').shape
        .declarations[0].type
    ).toMatchObject({
      status: 'UNKNOWN',
      literals: [
        { value_sha256: sha(program), byte_length: Buffer.byteLength(program) }
      ]
    })
    expect(JSON.stringify(entries)).not.toContain(program)
  })

  it('R15 preserves established schema/tool names and selectors beside opaque unclassified members', () => {
    const source = 'packages/core/example/src/worker.schema.json'
    const unknown = { 'mystery slot': { 'throw/KEY_R15/': true } }
    const schema = {
      name: 'throw 0',
      type: 'object',
      required: ['field with space'],
      properties: { 'field with space': { type: 'string' } },
      ...unknown
    }
    const entry = fixture({ [source]: JSON.stringify(schema) })
      .collect()
      .entries.find((entry) => entry.source === source)
    expect(entry.shape).toMatchObject({
      name: 'throw 0',
      type: 'object',
      required: ['field with space'],
      properties: { 'field with space': { type: 'string' } }
    })
    const text = JSON.stringify(JSON.parse(serializeCatalog(unknown)))
    expect(entry.shape.unclassified_members).toMatchObject({
      status: 'UNKNOWN',
      value_sha256: sha(text),
      byte_length: Buffer.byteLength(text)
    })
    expect(JSON.stringify(entry)).not.toContain('mystery slot')
    expect(JSON.stringify(entry)).not.toContain('throw/KEY_R15/')
    expect(entry.owner_task).toBe('P100-012')
    expect(entry.parity_status).toBe('NOT_VERIFIED')
  })

  it.each([false, true])(
    'R14 exact I1-R13-01 shares physical Markdown payload evidence (reverse=%s)',
    (reverse) => {
      const program = 'throw/FENCE_I1/'
      const source = 'docs/tool-catalog.md'
      const fragments = [
        "## Mirror\n```ts public-api\nexport type SourceMirror = 'throw/FENCE_I1/';\n```\n",
        "## Program\n```ts public-api\nexport const WorkerSource = 'throw/FENCE_I1/';\nnew Worker(WorkerSource, { eval: true });\n```\n"
      ]
      const markdown =
        '# Tools\n' + (reverse ? [...fragments].reverse() : fragments).join('')
      const f = fixture({ [source]: markdown })
      const catalog = f.collect()
      const entries = catalog.entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(3)
      const mirror = entries.find((entry) => entry.kind === 'document-type')
      const literal = {
        value_sha256: sha(program),
        byte_length: Buffer.byteLength(program)
      }
      expect(mirror.shape.declarations[0].type).toMatchObject({
        status: 'UNKNOWN',
        literals: [literal]
      })
      const payload = entries.find((entry) => entry.kind === 'document-value')
      expect(payload.shape.declarations[0].value).toMatchObject({
        status: 'UNKNOWN',
        ...literal
      })
      expect(JSON.stringify(entries)).not.toContain(program)
      for (const entry of entries) {
        expect(entry.owner_task).toBe('P100-003')
        expect(entry.source_sha256).toBe(sha(markdown))
        expect(entry.parity_status).toBe('NOT_VERIFIED')
      }
    }
  )

  it('R14 exact I1-R13-02 masks a type mirrored from a direct runtime argument', () => {
    const program = 'throw/INLINE_I1/'
    const source = 'packages/core/example/src/types.ts'
    const text =
      "export type SourceMirror = 'throw/INLINE_I1/';\nnew Worker('throw/INLINE_I1/', { eval: true });\n"
    const f = fixture({ [source]: text })
    const entries = f
      .collect()
      .entries.filter((entry) => entry.source === source)
    expect(entries).toHaveLength(2)
    const mirror = entries.find((entry) => entry.symbol === 'SourceMirror')
    expect(mirror.shape.declarations[0].type).toMatchObject({
      status: 'UNKNOWN',
      literals: [
        { value_sha256: sha(program), byte_length: Buffer.byteLength(program) }
      ]
    })
    expect(JSON.stringify(entries)).not.toContain(program)
    expect(mirror.owner_task).toBe('P100-012')
    expect(mirror.source_sha256).toBe(sha(text))
    expect(mirror.parity_status).toBe('NOT_VERIFIED')
  })

  it.each([
    ['call', (literal) => `consume(${literal});`],
    ['unary', (literal) => `void ${literal};`],
    ['tagged template', () => 'tag`throw/GENERIC_R14/`;']
  ])(
    'R14 runtime literal roles are generic for standalone %s expressions',
    (_kind, expression) => {
      const program = 'throw/GENERIC_R14/'
      const rows = []
      extractTypeScriptContracts(
        `export type Mirror = ${JSON.stringify(program)}; ${expression(JSON.stringify(program))}`,
        (kind, symbol, shape) => rows.push({ kind, symbol, shape })
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].shape.declarations[0].type).toMatchObject({
        status: 'UNKNOWN',
        literals: [
          {
            value_sha256: sha(program),
            byte_length: Buffer.byteLength(program)
          }
        ]
      })
      expect(JSON.stringify(rows)).not.toContain(program)
    }
  )

  it('R14 preserves declaration-only selectors, event names and module locators', () => {
    const selector = 'throw/DECL_R14/'
    const rows = []
    extractTypeScriptContracts(
      `import type { Config } from ${JSON.stringify(selector)}; export { Config } from ${JSON.stringify(selector)}; export type Selector = ${JSON.stringify(selector)}; export interface Events { ${JSON.stringify(selector)}(): void; 'throw 0'(): void }`,
      (kind, symbol, shape) => rows.push({ kind, symbol, shape })
    )
    expect(
      rows.find((row) => row.symbol === 'Selector').shape.declarations[0].type
    ).toContain(selector)
    expect(
      rows.find((row) => row.symbol === `Events.${selector}`).shape
        .declarations[0].declared_name
    ).toBe(selector)
    expect(
      rows.find(
        (row) =>
          row.kind === 'event-vocabulary' &&
          row.shape.declarations[0].declared_name === 'throw 0'
      )
    ).toBeDefined()
    expect(
      rows.find((row) => row.kind === 'export').shape.declarations[0].from
    ).toBe(selector)
  })

  it('R14 keeps document scopes separate while sharing TS and JSON within a physical source', () => {
    const program = 'throw/MIXED_R14/'
    const mirror =
      '# Mirror\n```ts public-api\nexport type Mirror = ' +
      JSON.stringify(program) +
      ';\n```\n'
    const payload =
      '# Payload\n```json\n' + JSON.stringify({ default: program }) + '\n```\n'
    const f = fixture({
      'docs/tool-catalog.md': mirror + payload,
      'docs/config-catalog.md': mirror
    })
    const catalog = f.collect()
    const shared = catalog.entries.find(
      (entry) =>
        entry.source === 'docs/tool-catalog.md' &&
        entry.kind === 'document-type'
    )
    const separate = catalog.entries.find(
      (entry) =>
        entry.source === 'docs/config-catalog.md' &&
        entry.kind === 'document-type'
    )
    expect(shared.shape.declarations[0].type).toMatchObject({
      status: 'UNKNOWN',
      literals: [
        { value_sha256: sha(program), byte_length: Buffer.byteLength(program) }
      ]
    })
    expect(separate.shape.declarations[0].type).toContain(program)
    expect(
      [shared, separate].every(
        (entry) =>
          entry.owner_task === 'P100-003' &&
          entry.source_sha256 &&
          entry.parity_status === 'NOT_VERIFIED'
      )
    ).toBe(true)
  })

  it.each(['default', 'const', 'examples', 'unclassified'])(
    'R13 S01 opaquely retains complete JSON payload object keys under %s',
    (field) => {
      const program = 'throw/KEY_R13/'
      const payload = { [program]: true }
      const schema = {
        type: 'object',
        [field]: field === 'examples' ? [payload] : payload
      }
      const source = 'packages/core/example/src/worker.schema.json'
      const f = fixture({
        [source]: JSON.stringify(schema),
        'docs/tool-catalog.md':
          '# Tools\n```json\n' + JSON.stringify(schema) + '\n```\n'
      })
      const catalog = f.collect()
      const entries = catalog.entries.filter((entry) =>
        ['json-schema-data', 'document-json'].includes(entry.kind)
      )
      expect(entries).toHaveLength(2)
      for (const entry of entries) {
        const projected =
          field === 'examples'
            ? entry.shape[field][0]
            : field === 'unclassified'
              ? entry.shape.unclassified_members
              : entry.shape[field]
        const text = JSON.stringify(
          field === 'unclassified' ? { [field]: payload } : payload
        )
        expect(projected).toMatchObject({
          status: 'UNKNOWN',
          value_sha256: sha(text),
          byte_length: Buffer.byteLength(text)
        })
        expect(projected.reason).toBeTruthy()
        expect(entry.shape.type).toBe('object')
        expect(JSON.stringify(entry)).not.toContain(program)
        expect(entry.owner_task).toMatch(/^P100-\d{3}$/)
        expect(entry.source_sha256).toBe(
          sha(fs.readFileSync(path.join(f.root, entry.source)))
        )
        expect(entry.parity_status).toBe('NOT_VERIFIED')
      }
    }
  )

  it('R13 S01 treats TypeScript object initializer names as opaque payload keys', () => {
    const program = 'throw/KEY_R13/'
    const source = 'packages/core/example/src/types.ts'
    const f = fixture({
      [source]: `export const Payload = { ${JSON.stringify(program)}: true, ordinary: { name: false } }; new Worker(Object.keys(Payload)[0], { eval: true });`
    })
    const catalog = f.collect()
    const entry = catalog.entries.find((item) => item.symbol === 'Payload')
    expect(entry.shape.declarations[0].value.properties[0].name).toMatchObject({
      status: 'UNKNOWN',
      value_sha256: sha(program),
      byte_length: Buffer.byteLength(program)
    })
    expect(entry.shape.declarations[0].value.properties[1].name).toMatchObject({
      status: 'UNKNOWN',
      value_sha256: sha('ordinary')
    })
    expect(
      entry.shape.declarations[0].value.properties[1].value.properties[0].name
    ).toMatchObject({ status: 'UNKNOWN', value_sha256: sha('name') })
    expect(JSON.stringify(entry)).not.toContain(program)
    expect(entry.owner_task).toBe('P100-012')
    expect(entry.source_sha256).toBe(
      sha(fs.readFileSync(path.join(f.root, source)))
    )
  })

  it.each([
    ['binary', (text) => `${text} + ''`],
    ['conditional', (text) => `flag ? ${text} : ''`],
    ['new', (text) => `new String(${text})`],
    ['tagged-template', () => 'String.raw`throw/WRAPPED_R13/`']
  ])(
    'R13 S02 indexes literal descendants of opaque %s initializers without evaluation',
    (_kind, initializer) => {
      const program = 'throw/WRAPPED_R13/'
      const source = 'packages/core/example/src/types.ts'
      const f = fixture({
        [source]: `export type SourceMirror = ${JSON.stringify(program)}; export const WorkerSource = ${initializer(JSON.stringify(program))}; new Worker(WorkerSource, { eval: true });`
      })
      const catalog = f.collect()
      const entries = catalog.entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(3)
      const literal = {
        value_sha256: sha(program),
        byte_length: Buffer.byteLength(program)
      }
      expect(
        entries.find((entry) => entry.symbol === 'WorkerSource').shape
          .declarations[0].value
      ).toMatchObject({
        status: 'UNKNOWN',
        literals: expect.arrayContaining([literal])
      })
      const mirror = entries.find((entry) => entry.symbol === 'SourceMirror')
      expect(mirror.shape.declarations[0].type).toMatchObject({
        status: 'UNKNOWN',
        literals: [literal]
      })
      expect(JSON.stringify(entries)).not.toContain(program)
      for (const entry of entries) {
        expect(entry.owner_task).toBe('P100-012')
        expect(entry.source_sha256).toBe(
          sha(fs.readFileSync(path.join(f.root, source)))
        )
        expect(entry.parity_status).toBe('NOT_VERIFIED')
      }
    }
  )

  it('R13 S03 preserves exact declaration-only names with spaces and their existing opaque identities', () => {
    const name = 'throw 0'
    const source = 'packages/core/example/src/types.ts'
    const f = fixture({
      [source]: `export interface Events { ${JSON.stringify(name)}(id: string): void } export class Tool { ${JSON.stringify(name)}(): void {} }`,
      'packages/core/example/src/other.ts': `export const Guest = ${JSON.stringify(name)};`,
      'docs/tool-catalog.md':
        '# Tools\n```json\n' +
        JSON.stringify({
          name,
          parameters: {
            type: 'object',
            required: [name],
            properties: { [name]: { type: 'string' } }
          }
        }) +
        '\n```\n'
    })
    const catalog = f.collect()
    const opaque = {
      byte_length: Buffer.byteLength(name),
      reason: 'Unclassified literal name; bytes not copied',
      status: 'UNKNOWN',
      value_sha256: sha(name)
    }
    for (const [kind, owner] of [
      ['event-vocabulary', 'Events'],
      ['class-member', 'Tool']
    ]) {
      const symbol = `opaque-symbol:${sha(`${owner}.${JSON.stringify(opaque)}`)}`
      const entry = catalog.entries.find(
        (item) => item.kind === kind && item.symbol === symbol
      )
      expect(entry).toBeDefined()
      expect(entry.shape.declarations[0].declared_name).toBe(name)
      expect(entry.owner_task).toBe('P100-012')
      expect(entry.source_sha256).toBe(
        sha(fs.readFileSync(path.join(f.root, source)))
      )
      expect(entry.parity_status).toBe('NOT_VERIFIED')
    }
    const tool = catalog.entries.find((entry) => entry.kind === 'document-json')
    expect(tool.shape.name).toBe(name)
    expect(tool.shape.parameters.required).toEqual([name])
    expect(tool.shape.parameters.properties[name].type).toBe('string')
  })

  it.each(['value', 'key'])(
    'R13 S03 keeps same-source TS declaration/payload %s collisions UNKNOWN',
    (slot) => {
      const program = 'throw/DUAL_R13/'
      const source = 'packages/core/example/src/types.ts'
      const payload =
        slot === 'key'
          ? `{ ${JSON.stringify(program)}: true }`
          : JSON.stringify(program)
      const f = fixture({
        [source]: `export interface Events { ${JSON.stringify(program)}(): void } export const Payload = ${payload};`
      })
      const catalog = f.collect()
      const entries = catalog.entries.filter((entry) => entry.source === source)
      expect(entries).toHaveLength(4)
      const event = entries.find((entry) => entry.kind === 'event-vocabulary')
      expect(event.shape.declarations[0].declared_name).toMatchObject({
        status: 'UNKNOWN',
        value_sha256: sha(program),
        byte_length: Buffer.byteLength(program)
      })
      expect(event.extraction_status).toBe('UNKNOWN')
      expect(JSON.stringify(entries)).not.toContain(program)
    }
  )

  it.each(['value', 'key'])(
    'R13 S03 keeps JSON declaration/payload %s collisions UNKNOWN across same-source fences',
    (slot) => {
      const program = 'throw/DUAL_JSON_R13/'
      const payload = slot === 'key' ? { [program]: true } : program
      const f = fixture({
        'docs/tool-catalog.md':
          '# Tools\n## Declaration\n```json\n' +
          JSON.stringify({ name: program, parameters: { type: 'object' } }) +
          '\n```\n## Instance\n```json\n' +
          JSON.stringify({ type: 'object', default: payload }) +
          '\n```\n'
      })
      const catalog = f.collect()
      const entries = catalog.entries.filter(
        (entry) => entry.kind === 'document-json'
      )
      expect(entries).toHaveLength(2)
      const declaration = entries.find((entry) => entry.shape.name)
      expect(declaration.shape.name).toMatchObject({
        status: 'UNKNOWN',
        value_sha256: sha(program),
        byte_length: Buffer.byteLength(program)
      })
      expect(JSON.stringify(entries)).not.toContain(program)
      expect(
        entries.every(
          (entry) =>
            entry.parity_status === 'NOT_VERIFIED' &&
            entry.owner_task &&
            entry.source_sha256
        )
      ).toBe(true)
    }
  )

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
    const name = 'declared R12 tool'
    const payloadName = 'throw/ROLE_R12/'
    const payload = {
      name: payloadName,
      nested: [{ type: 'string', required: [payloadName] }]
    }
    const payloadText = JSON.stringify(JSON.parse(serializeCatalog(payload)))
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
      expect(worker).toMatchObject({
        name,
        type: {
          status: 'UNKNOWN',
          value_sha256: sha('string'),
          byte_length: Buffer.byteLength('string')
        }
      })
      expect(worker.type.reason).toBeTruthy()
      for (const value of [worker.default, worker.const, worker.examples[0]]) {
        expect(JSON.stringify(value)).not.toContain(payloadName)
        expect(value).toMatchObject({
          status: 'UNKNOWN',
          value_sha256: sha(payloadText),
          byte_length: Buffer.byteLength(payloadText)
        })
        expect(value.reason).toBeTruthy()
      }
      const memberText = JSON.stringify(
        JSON.parse(serializeCatalog({ unclassified: payload }))
      )
      expect(worker.unclassified_members).toMatchObject({
        status: 'UNKNOWN',
        value_sha256: sha(memberText),
        byte_length: Buffer.byteLength(memberText)
      })
      expect(worker.unclassified_members.reason).toBeTruthy()
      expect(JSON.stringify(worker.unclassified_members)).not.toContain(
        payloadName
      )
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
      'packages/core/example/src/types.ts': `export type GuestSource = ${JSON.stringify(body)};\nexport const ProgramSource = ${JSON.stringify(body)};`,
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
    const tsSource = 'packages/core/example/src/types.ts'
    const tsEntries = catalog.entries.filter(
      (entry) => entry.source === tsSource
    )
    expect(tsEntries).toHaveLength(3)
    const literal = {
      value_sha256: sha(body),
      byte_length: Buffer.byteLength(body)
    }
    const alias = tsEntries.find((entry) => entry.symbol === 'GuestSource')
    const initializer = tsEntries.find(
      (entry) => entry.symbol === 'ProgramSource'
    )
    expect(alias.shape.declarations[0].type).toMatchObject({
      status: 'UNKNOWN',
      literals: [literal]
    })
    expect(initializer.shape.declarations[0].value).toMatchObject({
      status: 'UNKNOWN',
      ...literal
    })
    for (const entry of tsEntries) {
      expect(entry.source_sha256).toBe(
        sha(fs.readFileSync(path.join(f.root, tsSource)))
      )
      expect(entry.owner_task).toBe('P100-012')
      expect(entry.parity_status).toBe('NOT_VERIFIED')
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
