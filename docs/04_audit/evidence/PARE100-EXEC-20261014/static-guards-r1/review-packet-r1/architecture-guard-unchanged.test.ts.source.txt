import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repositoryRoot = resolve(process.cwd())
const neutralPackages = [
  'packages/contracts',
  'packages/orchestrator',
  'packages/harness'
]

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) {
      return sourceFiles(path)
    }
    return /\.(json|ts)$/.test(entry) ? [path] : []
  })
}

describe('neutral harness dependency direction', () => {
  it('keeps contracts, orchestrator, and harness free of product/framework imports', () => {
    const forbidden = [
      '@cvg/shared',
      '@cvg/platform',
      '@cvg/agent-core',
      '@cvg/persistence',
      '@cvg/policy',
      '@cvg/model-gateway',
      '@cvg/tools',
      '@cvg/secretary',
      'fastify',
      'react',
      'postgres',
      'pg',
      'secretary'
    ]

    for (const packagePath of neutralPackages) {
      for (const file of sourceFiles(join(repositoryRoot, packagePath))) {
        const contents = readFileSync(file, 'utf8').toLowerCase()
        for (const token of forbidden) {
          expect(
            contents,
            `${file} contains forbidden token ${token}`
          ).not.toContain(token.toLowerCase())
        }
      }
    }
  })

  it('limits package manifests to the intended neutral dependency direction', () => {
    const contracts = JSON.parse(
      readFileSync(
        join(repositoryRoot, 'packages/contracts/package.json'),
        'utf8'
      )
    ) as { dependencies?: Record<string, string> }
    const orchestrator = JSON.parse(
      readFileSync(
        join(repositoryRoot, 'packages/orchestrator/package.json'),
        'utf8'
      )
    ) as { dependencies?: Record<string, string> }
    const harness = JSON.parse(
      readFileSync(
        join(repositoryRoot, 'packages/harness/package.json'),
        'utf8'
      )
    ) as { dependencies?: Record<string, string> }

    expect(Object.keys(contracts.dependencies ?? {})).toEqual([])
    expect(Object.keys(orchestrator.dependencies ?? {})).toEqual([
      '@cvg/harness-contracts'
    ])
    expect(Object.keys(harness.dependencies ?? {})).toEqual([
      '@cvg/harness-contracts',
      '@cvg/harness-orchestrator'
    ])
  })

  it('exposes one canonical composition root for the public harness', () => {
    const compositionRoot = readFileSync(
      join(repositoryRoot, 'packages/harness/src/createOperationalHarness.ts'),
      'utf8'
    )

    expect(compositionRoot).toContain(
      'export function createOperationalHarness'
    )
    expect(compositionRoot).toContain('new SinglePassGovernedRuntime')
    expect(compositionRoot).not.toContain('runtime?:')
    expect(compositionRoot).not.toContain('options.runtime')
    expect(compositionRoot).not.toContain('fastify')
    expect(compositionRoot).not.toContain('postgres')
  })

  it('publishes only the package root and keeps the executable adapter private', () => {
    const manifest = JSON.parse(
      readFileSync(
        join(repositoryRoot, 'packages/harness/package.json'),
        'utf8'
      )
    ) as { exports?: Record<string, unknown> }

    expect(Object.keys(manifest.exports ?? {})).toEqual(['.'])
    expect(
      readFileSync(
        join(repositoryRoot, 'packages/harness/src/index.ts'),
        'utf8'
      )
    ).not.toContain('createCapabilityToolRegistry')
  })
})
