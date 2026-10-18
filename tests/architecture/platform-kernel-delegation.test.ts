import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import ts from 'typescript'

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
    const parsed = ts.createSourceFile(
      'index.ts',
      index,
      ts.ScriptTarget.Latest,
      true
    )
    const exports = parsed.statements.filter(ts.isExportDeclaration)
    expect(
      exports
        .filter((e) => !e.isTypeOnly)
        .some(
          (e) =>
            e.moduleSpecifier &&
            /controlled-kernel-(?:execution|adapters)|plugin-execution-core/.test(
              (e.moduleSpecifier as ts.StringLiteral).text
            )
        )
    ).toBe(false)
    const continuation = exports.filter(
      (e) =>
        e.moduleSpecifier &&
        (e.moduleSpecifier as ts.StringLiteral).text ===
          './controlled-kernel-continuation.ts'
    )
    expect(continuation).toHaveLength(2)
    const names = (typeOnly: boolean) =>
      continuation
        .filter((e) => e.isTypeOnly === typeOnly)
        .flatMap((e) => {
          expect(e.exportClause && ts.isNamedExports(e.exportClause)).toBe(true)
          return (e.exportClause as ts.NamedExports).elements.map(
            (n) => n.name.text
          )
        })
        .sort()
    expect(names(false)).toEqual(
      [
        'CONTROLLED_PUBLISHED_ADAPTER',
        'CONTROLLED_SETTLEMENT_PHASES',
        'controlledCanonicalJson',
        'controlledDigest',
        'prepareControlledPublishedAdmission',
        'validateControlledSnapshot'
      ].sort()
    )
    expect(names(true)).toEqual(
      [
        'ControlledKernelFence',
        'ControlledKernelIdentity',
        'ControlledPhaseRef',
        'ControlledEvidenceAck',
        'ControlledApprovalReceipt',
        'ControlledBoundApprovalConsumption',
        'ControlledBoundApprovalVerification',
        'ControlledResumeSeal',
        'ControlledDispatchPermit',
        'ControlledCanonicalCommand',
        'ControlledSerializedAttempt',
        'ControlledPublishedSnapshot',
        'ControlledPublishedState',
        'ControlledPublishedPrepared',
        'ControlledKernelContinuation',
        'ControlledKernelHostContext',
        'ControlledPublishedAdmissionInput',
        'ControlledPublishedAdmission'
      ].sort()
    )
  })
})
