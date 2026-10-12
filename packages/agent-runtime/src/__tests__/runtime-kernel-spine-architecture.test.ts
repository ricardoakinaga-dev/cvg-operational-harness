import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..')

const read = (name: string): string => readFileSync(join(srcDir, name), 'utf8')

/**
 * PDSH-001 / KPLG-004 Parte B: `kernel/pipeline.ts` is the single governance
 * spine. These guards fail if a second copy of budget, deadline, cancel-race
 * or model/tool pipeline logic reappears anywhere in the runtime package.
 */
describe('architecture: single governance spine (PDSH-001)', () => {
  const bridge = read('runtime-kernel-bridge.ts')
  const runtime = read('runtime.ts')
  const context = read('runtime-execution-context.ts')
  const contracts = read('contracts.ts')
  const recovery = read('runtime-effect-recovery.ts')
  const approvalRequest = read('runtime-approval-request.ts')

  it('the bridge is the only module that imports the kernel pipeline', () => {
    const pipelineImporters: string[] = []
    for (const file of [
      'runtime.ts',
      'runtime-execution-context.ts',
      'contracts.ts',
      'runtime-effect-recovery.ts',
      'runtime-approval-request.ts',
      'runtime-effect-identity.ts',
      'composition.ts'
    ]) {
      const source = read(file)
      if (
        /from '@cvg\/harness'/.test(source) &&
        /runToolCall|runModelCall|runGate|createTurnState/.test(source)
      ) {
        pipelineImporters.push(file)
      }
    }
    expect(pipelineImporters).toEqual([])
    expect(bridge).toContain("from '@cvg/harness'")
    expect(bridge).toContain('runToolCall')
    expect(bridge).toContain('runModelCall')
    expect(bridge).toContain('runGate')
    expect(bridge).toContain('createTurnState')
  })

  it('runtime.ts has no local budget / deadline / cancel-race spine', () => {
    expect(runtime).not.toMatch(/clock\(\)\.getTime\(\)\s*>=\s*deadline/)
    expect(runtime).not.toMatch(/cancelSignal\?\.aborted\s*===\s*true/)
    expect(runtime).not.toMatch(/modelCalls\s*\+=\s*1/)
    expect(runtime).not.toMatch(/toolCalls\s*\+=\s*1/)
    expect(runtime).not.toMatch(/steps\s*\+=\s*1/)
    expect(runtime).not.toMatch(/costUsd\s*\+=/)
    expect(runtime).not.toMatch(/maxModelCalls/)
    expect(runtime).not.toMatch(/maxToolCalls/)
    expect(runtime).not.toMatch(/maxSteps/)
    expect(runtime).not.toMatch(/loop_cost_exceeded/)
    expect(runtime).not.toMatch(/counters\.costUsd\s*[<>]/)
    expect(runtime).not.toMatch(/limits\.maxCostUsd\s*[<>]/)
    expect(runtime).toContain('bridge.beginStage')
    expect(runtime).toContain('bridge.assertStage')
    expect(runtime).toContain('bridge.stopReason')
    expect(runtime).toContain('bridge.runModelStage')
    expect(runtime).toContain('bridge.runToolStage')
  })

  it('runtime.ts never calls the model gateway or tool pipeline directly', () => {
    expect(runtime).not.toMatch(/modelGateway\.generate\(/)
    expect(runtime).not.toMatch(/from '@cvg\/harness'[\s\S]*runToolCall/)
  })

  it('the bridge is the only place that mutates the shared counters', () => {
    expect(bridge).toContain('this.counters.steps += 1')
    expect(bridge).toContain('this.counters.modelCalls += 1')
    expect(bridge).toContain('this.counters.toolCalls += 1')
    expect(bridge).toContain('this.counters.costUsd += costUsd')
    expect(runtime).not.toMatch(
      /counters\.(steps|modelCalls|toolCalls|costUsd)\s*(\+|-)=/
    )
    expect(context).not.toMatch(/counters/)
  })

  it('execution context and contracts stay free of kernel pipeline types', () => {
    expect(context).not.toContain('TurnState')
    expect(context).not.toContain('KernelHost')
    expect(context).not.toContain('Services')
    expect(context).not.toContain('BudgetService')
    expect(context).not.toContain('KernelGate')
    expect(contracts).not.toContain("from '@cvg/harness'")
    expect(recovery).not.toContain("from '@cvg/harness'")
    expect(approvalRequest).not.toContain("from '@cvg/harness'")
  })
})
