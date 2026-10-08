import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'
import * as harness from '@cvg/harness'
import * as contracts from '@cvg/harness-contracts'
import * as orchestrator from '@cvg/harness-orchestrator'
import * as modelGateway from '@cvg/model-gateway'
import * as persistence from '@cvg/persistence'
import {
  createReceptionAgentFixture,
  createReceptionAgentInput
} from '../examples/consumers/reception-agent/index.ts'

// HISO-009 / plan 0374 B2: the supported consumer surface is published in
// PUBLIC_API.md. That document is the single source of truth; this test
// parses its marked tables and fails when a listed export disappears.
const root = process.cwd()
const PUBLIC_API = 'docs/architecture/PUBLIC_API.md'
const EXAMPLE = 'examples/consumers/reception-agent/index.ts'

const PACKAGES = {
  '@cvg/harness-contracts': { dir: 'packages/contracts', module: contracts },
  '@cvg/harness': { dir: 'packages/harness', module: harness },
  '@cvg/harness-orchestrator': {
    dir: 'packages/orchestrator',
    module: orchestrator
  },
  '@cvg/model-gateway': { dir: 'packages/model-gateway', module: modelGateway },
  '@cvg/persistence': { dir: 'packages/persistence', module: persistence }
} as const satisfies Record<
  string,
  { readonly dir: string; readonly module: object }
>

type PackageName = keyof typeof PACKAGES
const PACKAGE_NAMES = Object.keys(PACKAGES) as PackageName[]
const KINDS = new Set(['valor', 'tipo'])
const STABILITIES = new Set([
  'estável',
  'compatibilidade',
  'experimental',
  'sintético',
  'host'
])

/** Minimum the document must keep listing; guards against an emptied table. */
const PINNED: Record<PackageName, readonly string[]> = {
  '@cvg/harness-contracts': [
    'RuntimeInput',
    'RuntimeResult',
    'ExecutionBudget',
    'CapabilityRegistration',
    'ModelGateway',
    'PolicyEngine',
    'ApprovalEngine',
    'ApprovalExecutionPort',
    'AuditSink',
    'TelemetrySink'
  ],
  '@cvg/harness': [
    'createOperationalHarness',
    'OperationalHarnessOptions',
    'createCapabilityRegistry',
    'EffectJournal',
    'InMemoryEffectJournal'
  ],
  '@cvg/harness-orchestrator': ['SinglePassOrchestrator'],
  '@cvg/model-gateway': [
    'ModelGateway',
    'ModelProvider',
    'OpenAICompatibleProvider',
    'DeterministicModelProvider'
  ],
  '@cvg/persistence': ['PostgresOperationalEffectJournal']
}

interface SupportedExport {
  readonly name: string
  readonly kind: string
  readonly stability: string
}

function parseSupportedExports(
  markdown: string
): Map<string, SupportedExport[]> {
  const result = new Map<string, SupportedExport[]>()
  const blocks = markdown.matchAll(
    /<!-- supported-exports:(\S+) -->([\s\S]*?)<!-- \/supported-exports -->/g
  )
  for (const [, packageName = '', body = ''] of blocks) {
    const rows = body
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('|'))
      .slice(2)
    const entries = rows.flatMap((row) => {
      const [names = '', kind = '', , stability = ''] = row
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim())
      return [...names.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((match) => ({
        name: match[1] ?? '',
        kind,
        stability: stability.replaceAll('`', '')
      }))
    })
    result.set(packageName, [...(result.get(packageName) ?? []), ...entries])
  }
  return result
}

function compilerOptions(): ts.CompilerOptions {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(root, 'tsconfig.base.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
        )
      }
    }
  )
  if (!parsed) throw new Error('tsconfig.base.json could not be parsed')
  return { ...parsed.options, noEmit: true, composite: false }
}

function entrypoint(packageName: PackageName): string {
  return join(root, PACKAGES[packageName].dir, 'src/index.ts')
}

const supported = parseSupportedExports(
  readFileSync(join(root, PUBLIC_API), 'utf8')
)
const supportedNames = (packageName: string) =>
  new Set((supported.get(packageName) ?? []).map((entry) => entry.name))

describe('HISO-009 supported consumer surface', () => {
  let exportedNames: Map<PackageName, Set<string>>

  beforeAll(() => {
    // Type exports only exist at compile time: read them from the checker.
    const program = ts.createProgram({
      rootNames: PACKAGE_NAMES.map(entrypoint),
      options: compilerOptions()
    })
    const checker = program.getTypeChecker()
    exportedNames = new Map(
      PACKAGE_NAMES.map((packageName) => {
        const source = program.getSourceFile(entrypoint(packageName))
        const symbol = source && checker.getSymbolAtLocation(source)
        if (!symbol) throw new Error(`no module symbol for ${packageName}`)
        return [
          packageName,
          new Set(
            checker.getExportsOfModule(symbol).map((item) => item.getName())
          )
        ]
      })
    )
  }, 60_000)

  it('publishes a classified, non-empty list for every consumer package', () => {
    expect([...supported.keys()].sort()).toEqual([...PACKAGE_NAMES].sort())
    for (const packageName of PACKAGE_NAMES) {
      const entries = supported.get(packageName) ?? []
      const names = entries.map((entry) => entry.name)
      expect(entries.length, packageName).toBeGreaterThan(0)
      expect(new Set(names).size, `${packageName} duplicates`).toBe(
        names.length
      )
      for (const entry of entries) {
        expect(KINDS, `${packageName}.${entry.name} kind`).toContain(entry.kind)
        expect(STABILITIES, `${packageName}.${entry.name} stability`).toContain(
          entry.stability
        )
      }
      for (const pinned of PINNED[packageName]) {
        expect(names, `${packageName} must keep ${pinned}`).toContain(pinned)
      }
    }
  })

  it('exposes only the package root of every listed package', () => {
    for (const packageName of PACKAGE_NAMES) {
      const manifest = JSON.parse(
        readFileSync(
          join(root, PACKAGES[packageName].dir, 'package.json'),
          'utf8'
        )
      ) as {
        name: string
        exports?: Record<string, { types?: string; import?: string }>
      }
      expect(manifest.name).toBe(packageName)
      expect(Object.keys(manifest.exports ?? {})).toEqual(['.'])
      expect(manifest.exports?.['.']).toMatchObject({
        types: './dist/index.d.ts',
        import: './dist/index.js'
      })
      expect(existsSync(entrypoint(packageName))).toBe(true)
    }
  })

  it('rejects deep imports into every listed package', () => {
    const probe = `for (const name of ${JSON.stringify(PACKAGE_NAMES)}) {
      try { await import(name + '/src/index.ts'); console.log(name + ' IMPORTED') }
      catch (error) { console.log(name + ' ' + (error?.code ?? 'UNKNOWN')) }
    }`
    const output = execFileSync(
      process.execPath,
      ['--input-type=module', '-e', probe],
      { cwd: root, encoding: 'utf8' }
    )

    expect(output.trim().split('\n')).toEqual(
      PACKAGE_NAMES.map((name) => `${name} ERR_PACKAGE_PATH_NOT_EXPORTED`)
    )
  })

  it('keeps every listed runtime value on the package entrypoint', () => {
    for (const packageName of PACKAGE_NAMES) {
      const module = PACKAGES[packageName].module as Record<string, unknown>
      for (const entry of supported.get(packageName) ?? []) {
        if (entry.kind === 'valor') {
          expect(
            module[entry.name],
            `${packageName}.${entry.name} is listed as a supported value`
          ).toBeDefined()
        } else {
          expect(
            module[entry.name],
            `${packageName}.${entry.name} is listed as type-only`
          ).toBeUndefined()
        }
      }
    }
  })

  it('keeps every listed type and value in the entrypoint declarations', () => {
    for (const packageName of PACKAGE_NAMES) {
      const exported = exportedNames.get(packageName)
      for (const entry of supported.get(packageName) ?? []) {
        expect(
          exported?.has(entry.name),
          `${packageName} must export ${entry.name}`
        ).toBe(true)
      }
    }
  })

  it('lets the neutral example import only supported names from package roots', () => {
    const examplePath = join(root, EXAMPLE)
    const source = ts.createSourceFile(
      examplePath,
      readFileSync(examplePath, 'utf8'),
      ts.ScriptTarget.ES2022,
      true
    )
    const options = compilerOptions()
    const imports: { specifier: string; names: string[] }[] = []
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause
        expect(clause?.name, 'default imports are not supported').toBe(
          undefined
        )
        expect(
          clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings),
          'namespace imports bypass the supported list'
        ).not.toBe(true)
        const bindings = clause?.namedBindings
        imports.push({
          specifier: (node.moduleSpecifier as ts.StringLiteral).text,
          names:
            bindings && ts.isNamedImports(bindings)
              ? bindings.elements.map(
                  (element) => (element.propertyName ?? element.name).text
                )
              : []
        })
      }
      if (
        ts.isExportDeclaration(node) ||
        ts.isImportEqualsDeclaration(node) ||
        ts.isImportTypeNode(node) ||
        (ts.isCallExpression(node) &&
          (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
            (ts.isIdentifier(node.expression) &&
              node.expression.text === 'require')))
      ) {
        throw new Error(
          `unsupported module reference in ${EXAMPLE}: ${node.getText()}`
        )
      }
      ts.forEachChild(node, visit)
    }
    visit(source)

    expect(imports.length).toBeGreaterThan(0)
    for (const { specifier, names } of imports) {
      expect(PACKAGE_NAMES, `${specifier} is not a supported entry`).toContain(
        specifier
      )
      const allowed = supportedNames(specifier)
      for (const name of names) {
        expect(allowed.has(name), `${specifier}.${name} is not supported`).toBe(
          true
        )
      }
      // The workspace alias must land on the package entrypoint source, never
      // on a private module of the package or another workspace.
      const resolved = ts.resolveModuleName(
        specifier,
        examplePath,
        options,
        ts.sys
      ).resolvedModule?.resolvedFileName
      expect(resolved && relative(root, resolved)).toBe(
        relative(root, entrypoint(specifier as PackageName))
      )
    }
  })

  it('runs the neutral consumer through the supported entrypoints', async () => {
    const fixture = createReceptionAgentFixture()

    const result = await fixture.harness.run(
      createReceptionAgentInput(
        'Qual é o horário de funcionamento?',
        'surface-smoke'
      )
    )

    expect(result.stopReason).toBe('COMPLETED')
    expect(result.toolCalls).toBe(1)
    expect(fixture.auditEvents).toHaveLength(1)
    expect(fixture.telemetryEvents).toHaveLength(1)
    expect(resolve(root, EXAMPLE)).not.toContain('/products/')
  })
})
