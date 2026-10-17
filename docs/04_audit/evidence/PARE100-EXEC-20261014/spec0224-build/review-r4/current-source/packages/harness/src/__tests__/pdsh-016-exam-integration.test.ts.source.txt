import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createExamDownloadTool,
  InMemoryChannelEffectJournal
} from '@cvg/channel-gateway'
import { createLocalSandboxGate } from '@cvg/sandbox'
import { createOperationalHarness } from '../createOperationalHarness.ts'
import {
  InMemoryApprovalEngine,
  RecordingAuditSink,
  RecordingTelemetrySink,
  ScriptedPolicyEngine,
  phase3AgentProfile,
  phase3RuntimeInput
} from './fixtures/phase3-fixtures.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

function fixture(approved: boolean, sandbox: boolean) {
  const root = mkdtempSync(join(tmpdir(), 'pdsh016-kernel-'))
  roots.push(root)
  const fetchImpl = vi.fn(async () => new Response('synthetic exam'))
  const journal = new InMemoryChannelEffectJournal()
  const tool = createExamDownloadTool({
    workspaceRoot: root,
    effectJournal: journal,
    urlGuard: { allowedHosts: ['exams.example.com'] },
    requireApproval: true,
    dnsLookup: async () => ['93.184.216.34'],
    fetchImpl
  })
  const approvals = new InMemoryApprovalEngine()
  approvals.approveOnRequest = approved
  const input = phase3RuntimeInput({
    agent: phase3AgentProfile({ tools: [tool.id] }),
    runtimeProfile: 'single_pass',
    requestedTool: {
      toolId: tool.id,
      input: {
        path: 'result.pdf',
        url: 'https://exams.example.com/r',
        intent: 'synthetic download',
        operationKey: 'exam-integration'
      },
      operationKey: 'exam-integration'
    }
  })
  const harness = createOperationalHarness({
    modelGateway: {
      complete: async () => ({
        text: 'synthetic',
        provider: 'synthetic',
        model: 'synthetic',
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0
      })
    },
    policy: new ScriptedPolicyEngine(),
    approvals,
    tools: {
      list: () => [tool],
      resolve: (id) => (id === tool.id ? tool : undefined)
    },
    audit: new RecordingAuditSink(),
    telemetry: new RecordingTelemetrySink(),
    orchestrator: {
      decideNextStep: async () => ({
        action: 'CALL_TOOL',
        toolInvocation: input.requestedTool!
      })
    },
    ...(sandbox
      ? {
          sandbox: createLocalSandboxGate({
            workspaceBase: root,
            capabilities: {
              bubblewrap: true,
              landlock: true,
              mode: 'PROCESS',
              partial: []
            }
          })
        }
      : {})
  })
  return { harness, input, root, journal, fetchImpl, approvals }
}

describe('PDSH-016 exam egress through governed kernel', () => {
  it('pending approval prevents fetch and journal reservation', async () => {
    const f = fixture(false, true)
    expect((await f.harness.execute(f.input)).stopReason).toBe(
      'APPROVAL_REQUIRED'
    )
    expect(f.fetchImpl).not.toHaveBeenCalled()
    expect(
      await f.journal.find({
        tenantId: f.input.tenantId,
        channel: 'exam-file',
        operationKind: 'outbound_message',
        idempotencyKey: 'exam-integration'
      })
    ).toBeUndefined()
    expect(f.approvals.requests).toHaveLength(1)
  })
  it('missing sandbox prevents approved egress', async () => {
    const f = fixture(true, false)
    expect((await f.harness.execute(f.input)).stopReason).toBe('UNSAFE_REQUEST')
    expect(f.fetchImpl).not.toHaveBeenCalled()
  })
  it('approved workspace execution writes and confirms through the same pipeline', async () => {
    const f = fixture(true, true)
    expect((await f.harness.execute(f.input)).stopReason).toBe('COMPLETED')
    expect(f.fetchImpl).toHaveBeenCalledTimes(1)
    expect(readFileSync(join(f.root, 'result.pdf'), 'utf8')).toBe(
      'synthetic exam'
    )
    expect(
      (
        await f.journal.find({
          tenantId: f.input.tenantId,
          channel: 'exam-file',
          operationKind: 'outbound_message',
          idempotencyKey: 'exam-integration'
        })
      )?.state
    ).toBe('CONFIRMED')
  })
})
