import { describe, expect, it } from 'vitest'
import { TenantIdSchema } from '@cvg/platform'
import {
  parseReconcileWindow,
  reconcileStuckApprovalDecisions
} from '../homolog-worker.ts'

// AUD0625 F08 / SPEC 0272 (BUILD + D9 review fixes). The selector runs against
// a fake pool that INTERPRETS the SQL it receives (status list, age window,
// anti-join conditions, ORDER BY, LIMIT) over in-memory rows, so a change to
// any of those clauses changes the rows the worker recovers. No PostgreSQL;
// the PostgreSQL campaign lives in approval-decision-atomicity-postgres.test.ts.

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000f08'
)
const MIN = 60_000

interface Fixture {
  approvalId: string
  status: string
  ageMs: number
  events?: string[]
  envelope?: boolean
  /** The approval authority answers a status that disagrees with the row. */
  authorityStatus?: string
  /** The approval authority throws (data or infrastructure failure). */
  authorityError?: { message: string; code?: string }
}

function envelopeFor(row: Fixture) {
  return {
    approvalId: row.approvalId,
    status: row.authorityStatus ?? row.status,
    approverId: 'approver.synthetic',
    decisionActorType: 'Approver' as const,
    decisionCorrelationId: `corr_${row.approvalId}`,
    decisionCommandKey: `cmd_${row.approvalId}`,
    policyVersion: 'policy-f08',
    payloadHash: 'c'.repeat(64),
    correlationId: `req_${row.approvalId}`
  }
}

/** Interprets the selector clauses of the one query the worker sends. */
function interpretSelector(
  sql: string,
  params: unknown[],
  rows: Fixture[]
): Array<{ execution_id: string; approval_id: string; decision: string }> {
  const statuses = [
    ...(/a\.status IN \(([^)]*)\)/.exec(sql)?.[1] ?? '').matchAll(/'(\w+)'/g)
  ].map((match) => match[1])
  const countMode = /SELECT count\(/.test(sql)
  const [minParam, maxParam] = countMode
    ? [params[0], params[1]]
    : [params[1], params[2]]
  let selected = rows.filter((row) => statuses.includes(row.status))
  if (/e\.updated_at < now\(\) - make_interval\(secs => \$\d/.test(sql)) {
    selected = selected.filter((row) => row.ageMs > Number(minParam) * 1000)
  }
  if (/\$\d::double precision IS NULL/.test(sql)) {
    const ceiling = maxParam
    selected = selected.filter(
      (row) => ceiling === null || row.ageMs < Number(ceiling) * 1000
    )
  }
  const anti = /NOT EXISTS \(([\s\S]*?)\n\s*\)/.exec(sql)?.[1] ?? ''
  const checksApproval = /audit\.payload->>'approvalId' = a\.approval_id/.test(
    anti
  )
  const checksDecision = /audit\.payload->>'decision'/.test(anti)
  const everyEvent = rows.flatMap((row) =>
    (row.events ?? []).map((decision) => ({ row, decision }))
  )
  selected = selected.filter((row) => {
    const expected = row.status === 'REJECTED' ? 'rejected' : 'approved'
    const hasEvent = everyEvent.some(
      (event) =>
        (!checksApproval || event.row === row) &&
        (!checksDecision || event.decision === expected)
    )
    return !hasEvent
  })
  const filtersEnvelope = /COALESCE\(a\.decision_command_key/.test(sql)
  if (countMode) {
    const incomplete = selected.filter((row) => row.envelope === false).length
    return [{ incomplete }] as never
  }
  if (filtersEnvelope) {
    selected = selected.filter((row) => row.envelope !== false)
  }
  const order = /ORDER BY e\.updated_at (ASC|DESC)/.exec(sql)?.[1]
  if (order === 'ASC') selected.sort((a, b) => b.ageMs - a.ageMs)
  if (order === 'DESC') selected.sort((a, b) => a.ageMs - b.ageMs)
  if (/LIMIT \$1/.test(sql)) selected = selected.slice(0, Number(params[0]))
  const mapsRejected =
    /CASE WHEN a\.status = 'REJECTED' THEN 'REJECTED' ELSE 'APPROVED' END AS decision/.test(
      sql
    )
  return selected.map((row) => ({
    execution_id: `exec_${row.approvalId}`,
    approval_id: row.approvalId,
    decision:
      mapsRejected && row.status === 'REJECTED' ? 'REJECTED' : 'APPROVED'
  }))
}

function harness(rows: Fixture[]) {
  const appended: string[] = []
  const failed: Array<{ approvalId: string; reason: string }> = []
  const incompleteCounts: number[] = []
  const resumed: string[] = []
  const client = {
    query: async (text: string, params: unknown[] = []) => {
      if (text.includes('SHOW search_path')) {
        return { rows: [{ search_path: '"$user", public' }] }
      }
      if (text.includes('operational_executions')) {
        return { rows: interpretSelector(text, params, rows) }
      }
      return { rows: [] }
    },
    release: () => undefined
  }
  const pool = { connect: async () => client } as never
  const byId = new Map(rows.map((row) => [row.approvalId, row]))
  const runtime = {
    approvalAuthority: {
      get: async (_tenant: string, approvalId: string) => {
        const row = byId.get(approvalId)!
        if (row.authorityError) {
          throw Object.assign(new Error(row.authorityError.message), {
            code: row.authorityError.code
          })
        }
        const envelope = envelopeFor(row)
        if (row.envelope === false) {
          const { decisionCommandKey: _omitted, ...incomplete } = envelope
          void _omitted
          return incomplete
        }
        return envelope
      }
    },
    store: {
      resolveApproval: async (input: { executionId: string }) => {
        resumed.push(input.executionId)
        return { id: input.executionId, state: 'QUEUED' }
      }
    }
  } as never
  const tick = (
    options: Parameters<typeof reconcileStuckApprovalDecisions>[3]
  ) =>
    reconcileStuckApprovalDecisions(pool, tenantId, runtime, {
      ...options,
      appendAudit: (event) => {
        appended.push(
          String((event.payload as { approvalId: string }).approvalId)
        )
      },
      onRowFailed: (failure) => failed.push(failure),
      onIncompleteEnvelope: (count) => incompleteCounts.push(count)
    })
  return { tick, appended, failed, resumed, incompleteCounts }
}

const rows = (): Fixture[] => [
  // has only a "rejected" event: the approved decision is still missing
  {
    approvalId: 'x1',
    status: 'APPROVED',
    ageMs: 10 * MIN,
    events: ['rejected']
  },
  { approvalId: 'x2', status: 'EXECUTED', ageMs: 20 * MIN },
  { approvalId: 'x3', status: 'EXECUTED', ageMs: 5_000 },
  { approvalId: 'x4', status: 'EXECUTED', ageMs: 48 * 60 * MIN },
  { approvalId: 'x5', status: 'PENDING', ageMs: 20 * MIN },
  {
    approvalId: 'x6',
    status: 'REJECTED',
    ageMs: 15 * MIN,
    events: ['rejected']
  },
  { approvalId: 'x9', status: 'RESERVED', ageMs: 30 * MIN },
  // decision already recorded for another approval: must not hide the others
  {
    approvalId: 'x7',
    status: 'APPROVED',
    ageMs: 12 * MIN,
    events: ['approved']
  },
  // rejected without its event: recovered as a rejection, not an approval
  { approvalId: 'x8', status: 'REJECTED', ageMs: 25 * MIN }
]

describe('F08: seletor do worker para decisões sem evento (pool que interpreta o SQL)', () => {
  it('recupera as mais antigas primeiro, respeita LIMIT e ignora o que não deve', async () => {
    const h = harness(rows())
    expect(await h.tick({ limit: 2 })).toBe(2)
    expect(h.appended).toEqual(['x9', 'x8'])
  })

  it('sem LIMIT estreito devolve todos os elegíveis em ordem crescente de idade', async () => {
    const h = harness(rows())
    expect(await h.tick({})).toBe(4)
    expect(h.appended).toEqual(['x9', 'x8', 'x2', 'x1'])
  })

  it('só a decisão faltante conta: evento "rejected" não cobre "approved"', async () => {
    const h = harness(rows())
    await h.tick({})
    expect(h.appended).toContain('x1')
    expect(h.appended).not.toContain('x6')
    expect(h.appended).not.toContain('x7')
  })

  it('piso de espera: aprovação recente (API talvez só lenta) fica de fora; sem piso entra', async () => {
    const withFloor = harness(rows())
    await withFloor.tick({})
    expect(withFloor.appended).not.toContain('x3')
    const noFloor = harness(rows())
    await noFloor.tick({
      window: { minAgeSeconds: 0, maxAgeSeconds: 24 * 3600 }
    })
    expect(noFloor.appended).toContain('x3')
  })

  it('teto padrão de 24 h exclui o histórico antigo; sem teto (backfill) inclui', async () => {
    const capped = harness(rows())
    await capped.tick({})
    expect(capped.appended).not.toContain('x4')
    const backfill = harness(rows())
    await backfill.tick({ window: { minAgeSeconds: 30, maxAgeSeconds: null } })
    expect(backfill.appended).toContain('x4')
  })

  it('estados avançados não retomam a execução; APPROVED sem avanço retoma', async () => {
    const h = harness(rows())
    await h.tick({})
    // x1 (APPROVED) and x8 (REJECTED) are resumed; x2/x9 are advanced (never again)
    expect(h.resumed).toEqual(['exec_x8', 'exec_x1'])
  })

  it('um erro de dado (decision mismatch) não derruba o tick nem bloqueia as seguintes', async () => {
    const h = harness([
      {
        approvalId: 'bad',
        status: 'EXECUTED',
        ageMs: 40 * MIN,
        authorityStatus: 'REJECTED'
      },
      { approvalId: 'good', status: 'EXECUTED', ageMs: 20 * MIN }
    ])
    expect(await h.tick({})).toBe(1)
    expect(h.appended).toEqual(['good'])
    expect(h.failed).toHaveLength(1)
    expect(h.failed[0]).toMatchObject({ approvalId: 'bad' })
    expect(h.failed[0]?.reason).toContain('decision mismatch')
  })

  it('N1: 26 aprovações antigas sem envelope não ocupam as vagas; as 2 recuperáveis são recuperadas e a contagem sai no log', async () => {
    const stale: Fixture[] = Array.from({ length: 26 }, (_, index) => ({
      approvalId: `old${index}`,
      status: 'EXECUTED',
      ageMs: (600 + index) * MIN,
      envelope: false
    }))
    const h = harness([
      ...stale,
      { approvalId: 'ok1', status: 'EXECUTED', ageMs: 20 * MIN },
      { approvalId: 'ok2', status: 'RESERVED', ageMs: 15 * MIN }
    ])
    const window = { minAgeSeconds: 30, maxAgeSeconds: null }
    expect(await h.tick({ window })).toBe(2)
    expect(h.appended).toEqual(['ok1', 'ok2'])
    expect(h.failed).toEqual([])
    expect(h.incompleteCounts).toEqual([26])
  })

  it('N1: sem linhas incompletas não há registro de contagem', async () => {
    const h = harness(rows())
    await h.tick({})
    expect(h.incompleteCounts).toEqual([])
  })

  it.each([
    '57P01',
    '57P02',
    '57P03',
    '08006',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EPIPE'
  ])(
    'N2: erro de infraestrutura %s no meio do laço derruba o tick',
    async (code) => {
      const h = harness([
        { approvalId: 'a', status: 'EXECUTED', ageMs: 40 * MIN },
        {
          approvalId: 'b',
          status: 'EXECUTED',
          ageMs: 30 * MIN,
          authorityError: { message: 'connection lost', code }
        },
        { approvalId: 'c', status: 'EXECUTED', ageMs: 20 * MIN }
      ])
      await expect(h.tick({})).rejects.toMatchObject({ code })
      expect(h.failed).toEqual([])
      expect(h.appended).toEqual(['a'])
    }
  )

  it('N2: erro sem código de infraestrutura continua isolado por linha', async () => {
    const h = harness([
      {
        approvalId: 'b',
        status: 'EXECUTED',
        ageMs: 30 * MIN,
        authorityError: { message: 'approval not found' }
      },
      { approvalId: 'c', status: 'EXECUTED', ageMs: 20 * MIN }
    ])
    expect(await h.tick({})).toBe(1)
    expect(h.failed).toEqual([
      { approvalId: 'b', reason: 'approval not found' }
    ])
  })
})

describe('F08: janela configurável do worker', () => {
  it('padrão: piso 30 s e teto 24 h', () => {
    expect(parseReconcileWindow({})).toEqual({
      minAgeSeconds: 30,
      maxAgeSeconds: 24 * 3600
    })
  })
  it('horas configuráveis; 0 = sem teto (backfill)', () => {
    expect(
      parseReconcileWindow({ CVG_HOMOLOG_RECONCILE_MAX_AGE_HOURS: '72' })
    ).toMatchObject({ maxAgeSeconds: 72 * 3600 })
    expect(
      parseReconcileWindow({ CVG_HOMOLOG_RECONCILE_MAX_AGE_HOURS: '0' })
    ).toMatchObject({ maxAgeSeconds: null })
  })
  it('valor inválido é recusado', () => {
    for (const bad of ['-1', '1.5', 'abc']) {
      expect(() =>
        parseReconcileWindow({ CVG_HOMOLOG_RECONCILE_MAX_AGE_HOURS: bad })
      ).toThrow()
    }
  })
})
