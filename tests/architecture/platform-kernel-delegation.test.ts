import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('SPEC0214 platform public kernel delegation', () => {
  it('keeps the façade free of direct model/gateway execution and parallel tools', () => {
    const source = readFileSync('packages/platform/src/test-lab.ts', 'utf8')
    expect(source).not.toMatch(/modelProvider\.complete\s*\(/)
    expect(source).not.toMatch(/capabilityGateway\.execute\s*\(/)
    expect(source).not.toContain('executePlannedTools')
    expect(source).toContain('executeControlledKernel')
  })
  it('uses exactly one supported factory and no deep imports', () => {
    const source = readFileSync(
      'packages/platform/src/controlled-kernel-execution.ts',
      'utf8'
    )
    expect(source.match(/createOperationalHarness\s*\(/g)).toHaveLength(1)
    expect(source).toContain("from '@cvg/harness'")
    expect(source).toContain("runtimeProfile: 'iterative'")
    expect(source).not.toMatch(/@cvg\/(?:harness|harness-contracts)\//)
    const index = readFileSync('packages/platform/src/index.ts', 'utf8')
    expect(index).not.toMatch(/controlled-kernel|plugin-execution-core/)
  })
})
