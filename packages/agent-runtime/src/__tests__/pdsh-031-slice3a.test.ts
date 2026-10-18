import { createHash } from 'node:crypto'
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  utimes,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileEffectJournal, effectJournalKey } from '../effect-journal.ts'
import { createExecutionProposal } from '../proposal.ts'
import { requestApprovalTurn } from '../runtime-approval-request.ts'

const createdDirectories: string[] = []

async function journalDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'pdsh031-slice3a-'))
  createdDirectories.push(directory)
  return directory
}

function recordPathFor(
  directory: string,
  tenantId: string,
  operationKey: string
) {
  const key = effectJournalKey(tenantId, operationKey)
  const digest = createHash('sha256').update(key).digest('hex')
  return join(directory, `${digest}.json`)
}

afterEach(async () => {
  await Promise.all(
    createdDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

function proposalInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: 'tenant_pdsh031',
    operatorId: 'operator_pdsh031',
    agentId: 'agent_pdsh031',
    agentVersion: 'v1',
    agentProfile: 'synthetic-profile',
    capability: 'record.cancel',
    action: 'record.cancel',
    resource: { type: 'record' },
    dataClassification: 'INTERNAL',
    policyVersion: 'policy-v1',
    promptVersion: '1.0.0',
    payload: { synthetic: true },
    ...overrides
  } as never
}

describe('PDSH-031 slice 3a — proposal and approval-request boundaries', () => {
  it('reports a non-Error canonicalization failure as unknown', () => {
    const hostile = {
      get boom(): never {
        throw 'raw payload failure'
      }
    }
    expect(() =>
      createExecutionProposal(proposalInput({ payload: hostile }))
    ).toThrow(/unknown error/)
  })

  it('denies the turn when proposal creation throws a raw value', async () => {
    const finish = vi.fn(() => 'DENIED_RESULT')
    const appendAudit = vi.fn()
    const result = await requestApprovalTurn(
      {
        ...(proposalInput() as Record<string, unknown>),
        prompt: {
          get version(): never {
            throw 'raw prompt failure'
          }
        }
      } as never,
      { policyVersion: 'policy-v1', reason: 'policy allows' } as never,
      { text: 'draft' } as never,
      { synthetic: true },
      'corr_pdsh031',
      {
        clock: () => new Date('2026-10-12T00:00:00.000Z'),
        appendAudit,
        finish,
        approvals: { request: vi.fn() },
        telemetry: { recordMetric: vi.fn() }
      } as never
    )
    expect(result).toBe('DENIED_RESULT')
    expect(finish).toHaveBeenCalledWith(
      'denied',
      'proposal_invalid',
      expect.anything(),
      expect.anything()
    )
    expect(appendAudit).toHaveBeenCalledWith('runtime.denied', {
      code: 'proposal_invalid',
      phase: 'proposal'
    })
  })

  it('requests approval for a proposal without a resource id', async () => {
    const approvals = {
      request: vi.fn(async (input: Record<string, unknown>) => {
        expect(input).toBeDefined()
        return { status: 'APPROVED', approvalId: 'approval_pdsh031' }
      })
    }
    const finish = vi.fn(() => 'APPROVAL_RESULT')
    const telemetry = { recordMetric: vi.fn() }
    const validInput = {
      tenantId: 'tenant_pdsh031',
      operatorId: 'operator_pdsh031',
      agentId: 'agent_pdsh031',
      agentVersion: 'v1',
      agentProfile: 'synthetic-profile',
      capability: 'record.cancel',
      action: 'record.cancel',
      resource: { type: 'record' },
      dataClassification: 'INTERNAL',
      prompt: { version: '1.0.0' }
    }
    const result = await requestApprovalTurn(
      validInput as never,
      { policyVersion: 'policy-v1', reason: 'policy allows' } as never,
      { text: 'draft' } as never,
      { synthetic: true },
      'corr_pdsh031',
      {
        clock: () => new Date('2026-10-12T00:00:00.000Z'),
        appendAudit: vi.fn(),
        finish,
        approvals,
        telemetry
      } as never
    )
    expect(result).toBe('APPROVAL_RESULT')
    expect(approvals.request).toHaveBeenCalledTimes(1)
    expect(approvals.request.mock.calls[0]?.[0]).toMatchObject({
      resource: { type: 'record' }
    })
    expect(approvals.request.mock.calls[0]?.[0]).not.toHaveProperty(
      'resource.id'
    )
    expect(finish).toHaveBeenCalledWith(
      'approval_required',
      'policy allows',
      expect.anything(),
      expect.objectContaining({ approvalId: 'approval_pdsh031' })
    )

    await requestApprovalTurn(
      {
        ...validInput,
        resource: { type: 'record', id: 'record-1' }
      } as never,
      { policyVersion: 'policy-v1', reason: 'policy allows' } as never,
      { text: 'draft' } as never,
      { synthetic: true },
      'corr_pdsh031',
      {
        clock: () => new Date('2026-10-12T00:00:00.000Z'),
        appendAudit: vi.fn(),
        finish,
        approvals,
        telemetry
      } as never
    )
    expect(approvals.request).toHaveBeenCalledTimes(2)
    expect(approvals.request.mock.calls[1]?.[0]).toMatchObject({
      resource: { type: 'record', id: 'record-1' }
    })

    await requestApprovalTurn(
      { ...validInput, prompt: {} } as never,
      { policyVersion: 'policy-v1', reason: 'policy allows' } as never,
      { text: 'draft' } as never,
      { synthetic: true },
      'corr_pdsh031',
      {
        clock: () => new Date('2026-10-12T00:00:00.000Z'),
        appendAudit: vi.fn(),
        finish,
        approvals,
        telemetry
      } as never
    )
    expect(approvals.request).toHaveBeenCalledTimes(3)
    expect(approvals.request.mock.calls[2]?.[0]).not.toHaveProperty(
      'promptVersion'
    )
  })
})

describe('PDSH-031 slice 3a — file journal lock edges', () => {
  it('returns undefined for an unknown journal record', async () => {
    const directory = await journalDirectory()
    const journal = new FileEffectJournal({ directory })
    expect(await journal.get('tenant_pdsh031', 'op_missing')).toBeUndefined()
  })

  it('times out on a broken lock symlink', async () => {
    const directory = await journalDirectory()
    const journal = new FileEffectJournal({
      directory,
      lockTimeoutMs: 25,
      pollMs: 2
    })
    const reservation = {
      tenantId: 'tenant_pdsh031',
      operationKey: 'op_symlink',
      proposalHash: 'hash_pdsh031',
      attemptId: 'attempt_pdsh031',
      expiresAt: '2026-10-13T00:00:00.000Z'
    }
    await journal.reserve(reservation as never)
    await symlink(
      join(directory, 'missing-target'),
      `${recordPathFor(directory, 'tenant_pdsh031', 'op_symlink')}.lock`
    )
    await expect(journal.reserve(reservation as never)).rejects.toThrow(
      /Timed out acquiring/
    )
  })

  it('times out on a stale lock directory', async () => {
    const directory = await journalDirectory()
    const journal = new FileEffectJournal({
      directory,
      lockTimeoutMs: 25,
      pollMs: 2,
      staleLockMs: 1
    })
    const reservation = {
      tenantId: 'tenant_pdsh031',
      operationKey: 'op_dir',
      proposalHash: 'hash_pdsh031',
      attemptId: 'attempt_pdsh031',
      expiresAt: '2026-10-13T00:00:00.000Z'
    }
    await journal.reserve(reservation as never)
    const lockPath = `${recordPathFor(directory, 'tenant_pdsh031', 'op_dir')}.lock`
    await mkdir(lockPath)
    await utimes(lockPath, new Date(0), new Date(0))
    await expect(journal.reserve(reservation as never)).rejects.toThrow(
      /Timed out acquiring/
    )
  })

  it('polls and times out while a fresh lock is held', async () => {
    const directory = await journalDirectory()
    const journal = new FileEffectJournal({
      directory,
      lockTimeoutMs: 30,
      pollMs: 2,
      staleLockMs: 60_000
    })
    const reservation = {
      tenantId: 'tenant_pdsh031',
      operationKey: 'op_held',
      proposalHash: 'hash_pdsh031',
      attemptId: 'attempt_pdsh031',
      expiresAt: '2026-10-13T00:00:00.000Z'
    }
    await journal.reserve(reservation as never)
    await writeFile(
      `${recordPathFor(directory, 'tenant_pdsh031', 'op_held')}.lock`,
      'held',
      'utf8'
    )
    await expect(journal.reserve(reservation as never)).rejects.toThrow(
      /Timed out acquiring/
    )
  })
})
