/**
 * SPEC 0257 §7 / AC06 — the export-approval request keeps ONE Idempotency-Key
 * across timeout, 500, reload and double click; a known resolution is followed
 * by a new key only on an explicit new click; a storage failure blocks the
 * dispatch instead of falling back to a volatile key.
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App.tsx'
import {
  beginLogicalOperation,
  LogicalOperationStorageError,
  resolveLogicalOperation
} from '../api/logical-operation.ts'

const ok = (data: unknown): Promise<Response> =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        success: true,
        data,
        error: null,
        meta: { correlationId: 'corr_00000000-0000-4000-8000-000000000001' }
      })
  } as Response)

const failure = (status: number): Promise<Response> =>
  Promise.resolve({
    ok: false,
    status,
    json: () =>
      Promise.resolve({
        success: false,
        data: null,
        error: { code: 'internal_error', message: 'Unexpected internal error' },
        meta: { correlationId: 'corr_00000000-0000-4000-8000-000000000001' }
      })
  } as Response)

const evidence = {
  summary: {
    totalEvents: 1,
    byType: { integration_event: 1 },
    byActorType: { System: 1 },
    byCorrelationId: { corr_00000000_0000_4000_8000_000000000001: 1 },
    bySessionId: { sess_api_1: 1 }
  },
  page: {
    items: [
      {
        id: 'evidence_api_1',
        type: 'integration_event',
        actorType: 'System',
        correlationId: 'corr_00000000-0000-4000-8000-000000000001',
        createdAt: '2026-04-29T12:00:00-03:00'
      }
    ],
    pageInfo: { limit: 10, offset: 0, total: 1, hasNextPage: false }
  },
  export: {
    format: 'json',
    controlled: true,
    externalDispatch: false,
    requestedBy: 'supervisor.audit'
  }
}

/** POST /v1/approvals answers come from `answers` in order. */
function mockApi(answers: Array<() => Promise<Response>>) {
  const keys: string[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input)
    if (url === '/v1/approvals' && init?.method === 'POST') {
      const headers = init.headers as Record<string, string>
      keys.push(headers['idempotency-key'] ?? '')
      const answer = answers[keys.length - 1] ?? answers[answers.length - 1]!
      return answer()
    }
    if (url === '/v1/conversations?limit=25&offset=0') {
      return ok({
        items: [
          {
            id: 'conv_api_1',
            channel: 'whatsapp',
            senderRef: 'fixture-sender',
            status: 'active',
            correlationId: 'corr_00000000-0000-4000-8000-000000000001',
            openSessionId: 'sess_api_1',
            lastMessageBody: 'Evidencia',
            lastMessageAt: '2026-04-29T12:00:00-03:00',
            updatedAt: '2026-04-29T12:00:00-03:00'
          }
        ],
        pageInfo: { limit: 25, offset: 0, total: 1, hasNextPage: false }
      })
    }
    if (url === '/v1/conversations/conv_api_1/timeline')
      return ok({ messages: [] })
    if (url === '/v1/tasks?status=open,in_progress&limit=25&offset=0')
      return ok([])
    if (url === '/v1/audit/sessions/sess_api_1') return ok({ events: [] })
    if (url.startsWith('/v1/approvals?')) return ok([])
    if (url.startsWith('/v1/observability/audit-evidence')) return ok(evidence)
    return Promise.reject(new Error(`Unexpected URL ${url}`))
  })
  return keys
}

async function openConsole() {
  render(<App />)
  fireEvent.change(screen.getByLabelText('ID do operador'), {
    target: { value: 'supervisor.audit' }
  })
  fireEvent.change(screen.getByLabelText('Papel operacional'), {
    target: { value: 'Supervisor' }
  })
  return screen.findByRole('button', { name: 'Solicitar export controlado' })
}

const click = (button: HTMLElement) => fireEvent.click(button)

beforeEach(() => {
  window.sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('logical operation registry (SPEC 0257 §7)', () => {
  const scope = {
    tenantId: 'tenant_a',
    operatorId: 'op',
    sessionId: 'sess',
    action: 'audit_evidence_export_review'
  }

  it('creates the key before the first fetch, reuses it while pending, and renews it only after a resolution', () => {
    const first = beginLogicalOperation(scope)
    expect(first.key).toMatch(/^op-[0-9a-f-]{36}$/)
    expect(beginLogicalOperation(scope).key).toBe(first.key)
    resolveLogicalOperation(scope, 'approval_1')
    const next = beginLogicalOperation(scope)
    expect(next.key).not.toBe(first.key)
    expect(next.status).toBe('pending')
  })

  it('does not share a record across tenant, operator or session', () => {
    const a = beginLogicalOperation(scope)
    expect(
      beginLogicalOperation({ ...scope, tenantId: 'tenant_b' }).key
    ).not.toBe(a.key)
    expect(
      beginLogicalOperation({ ...scope, operatorId: 'other' }).key
    ).not.toBe(a.key)
    expect(
      beginLogicalOperation({ ...scope, sessionId: 'other' }).key
    ).not.toBe(a.key)
  })

  it('stores only idempotency metadata', () => {
    beginLogicalOperation(scope)
    const raw = JSON.stringify({ ...window.sessionStorage })
    expect(raw).not.toMatch(/summary|token|cookie|clinic/i)
  })

  it('a failing storage throws instead of returning a volatile key', () => {
    const broken = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      }
    }
    expect(() => beginLogicalOperation(scope, broken)).toThrow(
      LogicalOperationStorageError
    )
    const silent = { getItem: () => null, setItem: () => undefined }
    expect(() => beginLogicalOperation(scope, silent)).toThrow(
      LogicalOperationStorageError
    )
  })
})

describe('export approval request keeps one logical operation (AC06)', () => {
  it('a 500 then a retry send the SAME key; success resolves it; the next explicit click uses a NEW key', async () => {
    const keys = mockApi([
      () => failure(500),
      () => ok({ id: 'approval_export_1', status: 'pending' }),
      () => ok({ id: 'approval_export_2', status: 'pending' })
    ])
    const button = await openConsole()
    click(button)
    expect(
      await screen.findByText(
        'Erro ao solicitar aprovacao de export controlado.'
      )
    ).toBeTruthy()
    click(screen.getByRole('button', { name: 'Solicitar export controlado' }))
    expect(
      await screen.findByText(
        'Solicitacao de export registrada para aprovacao humana.'
      )
    ).toBeTruthy()
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
    // A new request after a known resolution is a new logical operation.
    click(screen.getByRole('button', { name: 'Solicitar export controlado' }))
    await waitFor(() => expect(keys).toHaveLength(3))
    expect(keys[2]).not.toBe(keys[0])
  })

  it('a reload keeps the key of an uncertain request (stored before the first fetch)', async () => {
    const keys = mockApi([
      () => failure(500),
      () => ok({ id: 'approval_export_1' })
    ])
    const button = await openConsole()
    click(button)
    await screen.findByText('Erro ao solicitar aprovacao de export controlado.')
    cleanup()
    // "Reload": a new mount reads the same sessionStorage.
    const reloaded = await openConsole()
    click(reloaded)
    await waitFor(() => expect(keys).toHaveLength(2))
    expect(keys[1]).toBe(keys[0])
  })

  it('a double click dispatches ONE request', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const keys = mockApi([
      () => gate.then(() => ok({ id: 'approval_export_1', status: 'pending' }))
    ])
    const button = await openConsole()
    click(button)
    click(button)
    click(button)
    release()
    await screen.findByText(
      'Solicitacao de export registrada para aprovacao humana.'
    )
    expect(keys).toHaveLength(1)
  })

  it('a storage failure blocks the dispatch with a recovery message and sends nothing', async () => {
    const keys = mockApi([() => ok({ id: 'approval_export_1' })])
    const button = await openConsole()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    click(button)
    expect(
      await screen.findByText(/Nao foi possivel guardar a operacao/)
    ).toBeTruthy()
    expect(keys).toHaveLength(0)
  })
})
