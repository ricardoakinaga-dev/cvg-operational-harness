import { describe, expect, it } from 'vitest'
import { ApprovalError } from '@cvg/approval-engine'
import { OperationalExecutionError } from '@cvg/harness'
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
  /** One persisted envelope column that is empty (SQL must leave the row out). */
  missingField?:
    | 'approver_id'
    | 'decision_actor_type'
    | 'decision_correlation_id'
    | 'decision_command_key'
  /** Envelope complete in SQL terms, but the authority returns it without this key. */
  authorityDropsCommandKey?: boolean
  /** The approval authority answers a status that disagrees with the row. */
  authorityStatus?: string
  /** The approval authority throws (data or infrastructure failure). */
  authorityError?: { message: string; code?: string } | Error
  /** The store rejects the resume with this error (store.resolveApproval). */
  resumeError?: Error
  /**
   * SPEC 0274: which decision timestamps the approval row carries. Only read
   * for FAILED/EXPIRED rows; undefined behaves as 'approved'.
   */
  decided?: 'approved' | 'rejected' | 'both' | 'none'
}

const isTerminal = (row: Fixture) =>
  row.status === 'FAILED' || row.status === 'EXPIRED'
const hasApprovedAt = (row: Fixture) =>
  (row.decided ?? 'approved') === 'approved' || row.decided === 'both'
const hasRejectedAt = (row: Fixture) =>
  row.decided === 'rejected' || row.decided === 'both'
/** The recorded decision, as the PostgreSQL data says it (not the SQL under test). */
const recordedDecision = (row: Fixture) =>
  row.status === 'REJECTED' ||
  (row.status === 'EXPIRED' && hasRejectedAt(row) && !hasApprovedAt(row))
    ? 'rejected'
    : 'approved'
/** FAILED needs approved_at alone; EXPIRED needs exactly one timestamp. */
const isCoherentTerminal = (row: Fixture) =>
  row.status === 'FAILED'
    ? hasApprovedAt(row) && !hasRejectedAt(row)
    : row.status === 'EXPIRED' && hasApprovedAt(row) !== hasRejectedAt(row)
/** Anomalous: FAILED without approved_at or with rejected_at, or both timestamps. */
const isIncoherentTerminal = (row: Fixture) =>
  (row.status === 'FAILED' && !isCoherentTerminal(row)) ||
  (row.status === 'EXPIRED' && hasApprovedAt(row) && hasRejectedAt(row))

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
    correlationId: `req_${row.approvalId}`,
    ...(isTerminal(row) && hasApprovedAt(row)
      ? { approvedAt: '2026-10-28T10:00:00.000Z' }
      : {}),
    ...(isTerminal(row) && hasRejectedAt(row)
      ? { rejectedAt: '2026-10-28T10:00:00.000Z' }
      : {})
  }
}

/** Interprets the selector clauses of the one query the worker sends. */
function interpretSelector(
  sql: string,
  params: unknown[],
  rows: Fixture[]
): Array<{ execution_id: string; approval_id: string; decision: string }> {
  const statuses = [
    ...(
      /a\.status IN \(([^)]*)\)/.exec(sql.slice(sql.indexOf('WHERE')))?.[1] ??
      ''
    ).matchAll(/'(\w+)'/g)
  ].map((match) => match[1])
  const countMode = /SELECT count\(/.test(sql)
  const incoherentCount = /AS incoherent/.test(sql)
  const excludesTerminal =
    /AND NOT \(a\.status IN \('FAILED', 'EXPIRED'\) AND NOT \(/.test(sql)
  const failedRule =
    /\(a\.status = 'FAILED' AND a\.approved_at IS NOT NULL AND a\.rejected_at IS NULL\) OR/.test(
      sql
    )
  const expiredRule =
    /\(a\.status = 'EXPIRED' AND \(a\.approved_at IS NULL\) <> \(a\.rejected_at IS NULL\)\)\)\)/.test(
      sql
    )
  const sqlCoherent = (row: Fixture) =>
    (failedRule && row.status === 'FAILED' && isCoherentTerminal(row)) ||
    (expiredRule && row.status === 'EXPIRED' && isCoherentTerminal(row))
  // Only the anti-join's own CASE counts: the SELECT list has a similar one.
  const rejectedFromTimestamps =
    /a\.status = 'EXPIRED' AND a\.rejected_at IS NOT NULL AND a\.approved_at IS NULL/.test(
      /NOT EXISTS \(([\s\S]*?)\n\s*\)/.exec(sql)?.[1] ?? ''
    )
  const decisionExpected = (row: Fixture) =>
    row.status === 'REJECTED' ||
    (rejectedFromTimestamps &&
      row.status === 'EXPIRED' &&
      recordedDecision(row) === 'rejected')
      ? 'rejected'
      : 'approved'
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
    const expected = decisionExpected(row)
    const hasEvent = everyEvent.some(
      (event) =>
        (!checksApproval || event.row === row) &&
        (!checksDecision || event.decision === expected)
    )
    return !hasEvent
  })
  // Which envelope columns the SQL actually requires (one regex per field).
  const required = (
    [
      'approver_id',
      'decision_actor_type',
      'decision_correlation_id',
      'decision_command_key'
    ] as const
  ).filter((field) =>
    new RegExp(`COALESCE\\(a\\.${field}, ''\\) <> ''`).test(sql)
  )
  if (incoherentCount) {
    // The count query's own predicate decides what is counted.
    const countsFailed =
      /\(a\.status = 'FAILED' AND NOT \(a\.approved_at IS NOT NULL AND a\.rejected_at IS NULL\)\)/.test(
        sql
      )
    const countsBoth =
      /\(a\.status = 'EXPIRED' AND a\.approved_at IS NOT NULL AND a\.rejected_at IS NOT NULL\)/.test(
        sql
      )
    const counted = selected.filter(
      (row) =>
        isIncoherentTerminal(row) &&
        ((countsFailed && row.status === 'FAILED') ||
          (countsBoth && row.status === 'EXPIRED'))
    )
    return [{ incoherent: counted.length }] as never
  }
  if (excludesTerminal)
    selected = selected.filter((row) => !isTerminal(row) || sqlCoherent(row))
  const missing = (row: Fixture) =>
    row.envelope === false
      ? ('decision_command_key' as const)
      : row.missingField
  const incompleteForSql = (row: Fixture) => {
    const field = missing(row)
    return field !== undefined && required.includes(field)
  }
  if (countMode) {
    // The count query selects the rows the envelope filter keeps out.
    const incomplete = selected.filter(
      (row) => missing(row) !== undefined && incompleteForSql(row)
    ).length
    return [{ incomplete }] as never
  }
  selected = selected.filter((row) => !incompleteForSql(row))
  const order = /ORDER BY e\.updated_at (ASC|DESC)/.exec(sql)?.[1]
  if (order === 'ASC') selected.sort((a, b) => b.ageMs - a.ageMs)
  if (order === 'DESC') selected.sort((a, b) => a.ageMs - b.ageMs)
  if (/LIMIT \$1/.test(sql)) selected = selected.slice(0, Number(params[0]))
  const mapsRejected =
    /CASE WHEN \(a\.status = 'REJECTED'.* THEN 'REJECTED' ELSE 'APPROVED' END AS decision/.test(
      sql
    )
  const mapsTerminalRejected =
    mapsRejected &&
    /AS decision/.test(sql) &&
    /a\.status = 'EXPIRED' AND a\.rejected_at IS NOT NULL AND a\.approved_at IS NULL\)\) THEN 'REJECTED'/.test(
      sql
    )
  return selected.map((row) => ({
    execution_id: `exec_${row.approvalId}`,
    approval_id: row.approvalId,
    decision:
      mapsRejected &&
      (row.status === 'REJECTED' ||
        (mapsTerminalRejected &&
          row.status === 'EXPIRED' &&
          recordedDecision(row) === 'rejected'))
        ? 'REJECTED'
        : 'APPROVED'
  }))
}

function harness(rows: Fixture[]) {
  const appended: string[] = []
  const failed: Array<{ approvalId: string; reason: string }> = []
  const incompleteCounts: number[] = []
  const incoherentCounts: number[] = []
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
        if (row.authorityError instanceof Error) throw row.authorityError
        if (row.authorityError) {
          throw Object.assign(new Error(row.authorityError.message), {
            code: row.authorityError.code
          })
        }
        const envelope = envelopeFor(row)
        if (row.authorityDropsCommandKey) {
          const { decisionCommandKey: _dropped, ...incomplete } = envelope
          void _dropped
          return incomplete
        }
        if (row.envelope === false || row.missingField) {
          const { decisionCommandKey: _omitted, ...incomplete } = envelope
          void _omitted
          return incomplete
        }
        return envelope
      }
    },
    store: {
      resolveApproval: async (input: { executionId: string }) => {
        const failing = rows.find(
          (row) => `exec_${row.approvalId}` === input.executionId
        )?.resumeError
        if (failing) throw failing
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
      onIncompleteEnvelope: (count) => incompleteCounts.push(count),
      onIncoherentTerminal: (count) => incoherentCounts.push(count)
    })
  return { tick, appended, failed, resumed, incompleteCounts, incoherentCounts }
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
    'N2: erro de infraestrutura com code %s no meio do laço derruba o tick',
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

  // pg and pg-pool raise these WITHOUT an error.code.
  it.each([
    'Connection terminated unexpectedly',
    'Client has encountered a connection error and is not queryable',
    'timeout exceeded when trying to connect',
    'Connection terminated due to connection timeout'
  ])('N2: erro do pg sem code "%s" derruba o tick', async (message) => {
    const h = harness([
      { approvalId: 'a', status: 'EXECUTED', ageMs: 40 * MIN },
      {
        approvalId: 'b',
        status: 'EXECUTED',
        ageMs: 30 * MIN,
        authorityError: { message }
      },
      { approvalId: 'c', status: 'EXECUTED', ageMs: 20 * MIN }
    ])
    await expect(h.tick({})).rejects.toThrow(message)
    expect(h.failed).toEqual([])
    expect(h.appended).toEqual(['a'])
  })

  it('N2: qualquer erro desconhecido (sem code, sem tipo de dado) também derruba o tick', async () => {
    const h = harness([
      {
        approvalId: 'b',
        status: 'EXECUTED',
        ageMs: 30 * MIN,
        authorityError: { message: 'approval not found' }
      },
      { approvalId: 'c', status: 'EXECUTED', ageMs: 20 * MIN }
    ])
    await expect(h.tick({})).rejects.toThrow('approval not found')
    expect(h.failed).toEqual([])
  })

  it('erros de dado conhecidos do reconciliador são isolados e o tick segue', async () => {
    const h = harness([
      {
        approvalId: 'undecided',
        status: 'EXECUTED',
        ageMs: 50 * MIN,
        authorityStatus: 'PENDING'
      },
      {
        approvalId: 'mismatch',
        status: 'EXECUTED',
        ageMs: 40 * MIN,
        authorityStatus: 'REJECTED'
      },
      {
        approvalId: 'noenvelope',
        status: 'EXECUTED',
        ageMs: 30 * MIN,
        authorityDropsCommandKey: true
      },
      { approvalId: 'good', status: 'EXECUTED', ageMs: 20 * MIN }
    ])
    expect(await h.tick({})).toBe(1)
    expect(h.appended).toEqual(['good'])
    expect(h.failed.map((failure) => failure.approvalId)).toEqual([
      'undecided',
      'mismatch',
      'noenvelope'
    ])
    expect(h.failed[0]?.reason).toContain('decided approval')
    expect(h.failed[1]?.reason).toContain('decision mismatch')
    expect(h.failed[2]?.reason).toContain('envelope')
  })

  it.each([
    'approver_id',
    'decision_actor_type',
    'decision_correlation_id',
    'decision_command_key'
  ] as const)(
    'N1: aprovação sem %s fica fora do lote e é contada (um caso por campo do envelope)',
    async (missingField) => {
      const h = harness([
        {
          approvalId: 'gap',
          status: 'EXECUTED',
          ageMs: 40 * MIN,
          missingField
        },
        { approvalId: 'good', status: 'EXECUTED', ageMs: 20 * MIN }
      ])
      expect(await h.tick({ limit: 1 })).toBe(1)
      expect(h.appended).toEqual(['good'])
      expect(h.failed).toEqual([])
      expect(h.incompleteCounts).toEqual([1])
    }
  )

  it('N1: a contagem de incompletas usa a mesma janela do lote (piso e teto)', async () => {
    const stale = (approvalId: string, ageMs: number): Fixture => ({
      approvalId,
      status: 'EXECUTED',
      ageMs,
      missingField: 'approver_id'
    })
    const h = harness([
      stale('too-new', 5_000),
      stale('in-window', 2 * 60 * MIN),
      stale('too-old', 48 * 60 * MIN)
    ])
    await h.tick({})
    expect(h.incompleteCounts).toEqual([1])
    const backfill = harness([
      stale('too-new', 5_000),
      stale('in-window', 2 * 60 * MIN),
      stale('too-old', 48 * 60 * MIN)
    ])
    await backfill.tick({ window: { minAgeSeconds: 30, maxAgeSeconds: null } })
    expect(backfill.incompleteCounts).toEqual([2])
  })
})

describe('F08d: erros tipados de domínio por linha (tipo e code, nunca a mensagem)', () => {
  const executionError = (
    code: ConstructorParameters<typeof OperationalExecutionError>[0]
  ) => new OperationalExecutionError(code, 'qualquer texto')

  it.each([
    [
      'OperationalExecutionError invalid_action (resolveApproval)',
      { resumeError: executionError('invalid_action') }
    ],
    [
      'OperationalExecutionError conflict (resolveApproval)',
      { resumeError: executionError('conflict') }
    ],
    [
      'ApprovalError not_found (approvalAuthority.get)',
      { authorityError: new ApprovalError('not_found', 'qualquer texto') }
    ]
  ])('isola %s e reconcilia a linha seguinte', async (_name, failure) => {
    const h = harness([
      { approvalId: 'bad', status: 'APPROVED', ageMs: 40 * MIN, ...failure },
      { approvalId: 'good', status: 'APPROVED', ageMs: 20 * MIN }
    ])
    expect(await h.tick({})).toBe(1)
    expect(h.appended).toEqual(['good'])
    expect(h.failed).toHaveLength(1)
    expect(h.failed[0]?.approvalId).toBe('bad')
  })

  it('a mesma linha fica na frente a cada tick e mesmo assim não bloqueia as seguintes', async () => {
    const h = harness([
      {
        approvalId: 'bad',
        status: 'APPROVED',
        ageMs: 40 * MIN,
        resumeError: executionError('invalid_action')
      },
      { approvalId: 'good', status: 'APPROVED', ageMs: 20 * MIN }
    ])
    expect(await h.tick({})).toBe(1)
    expect(await h.tick({})).toBe(1)
    expect(h.failed.map((failure) => failure.approvalId)).toEqual([
      'bad',
      'bad'
    ])
  })

  it('a decisão é por code: outros codes do mesmo tipo de erro derrubam o tick', async () => {
    for (const code of [
      'lease_lost',
      'validation_failed',
      'not_found'
    ] as const) {
      const h = harness([
        {
          approvalId: 'bad',
          status: 'APPROVED',
          ageMs: 40 * MIN,
          resumeError: executionError(code)
        },
        { approvalId: 'good', status: 'APPROVED', ageMs: 20 * MIN }
      ])
      await expect(h.tick({})).rejects.toMatchObject({ code })
      expect(h.failed).toEqual([])
    }
  })

  it('ApprovalError com outro code derruba o tick', async () => {
    const h = harness([
      {
        approvalId: 'bad',
        status: 'APPROVED',
        ageMs: 40 * MIN,
        authorityError: new ApprovalError('invalid_state', 'qualquer texto')
      }
    ])
    await expect(h.tick({})).rejects.toMatchObject({ code: 'invalid_state' })
  })

  it('um Error comum com a mesma mensagem e code de domínio não é confundido com o tipo', async () => {
    const plain = Object.assign(new Error('qualquer texto'), {
      code: 'invalid_action'
    })
    const h = harness([
      {
        approvalId: 'bad',
        status: 'APPROVED',
        ageMs: 40 * MIN,
        resumeError: plain
      }
    ])
    await expect(h.tick({})).rejects.toBe(plain)
  })
})

const byAge = (all: Fixture[]) => (a: string, b: string) =>
  all.find((r) => r.approvalId === b)!.ageMs -
  all.find((r) => r.approvalId === a)!.ageMs

describe('F08b / SPEC 0274: aprovações FAILED e EXPIRED (decisão pelos timestamps)', () => {
  const terminals = (): Fixture[] => [
    {
      approvalId: 'f1',
      status: 'FAILED',
      ageMs: 10 * MIN,
      decided: 'approved'
    },
    {
      approvalId: 'f2',
      status: 'EXPIRED',
      ageMs: 15 * MIN,
      decided: 'rejected'
    },
    // EXPIRED that expired undecided: normal, out of the batch, silent
    { approvalId: 'f3', status: 'EXPIRED', ageMs: 20 * MIN, decided: 'none' },
    // incoherent: both timestamps / FAILED without approval / FAILED rejected
    { approvalId: 'f4', status: 'EXPIRED', ageMs: 25 * MIN, decided: 'both' },
    {
      approvalId: 'f9',
      status: 'FAILED',
      ageMs: 40 * MIN,
      decided: 'rejected'
    },
    { approvalId: 'f10', status: 'FAILED', ageMs: 45 * MIN, decided: 'none' },
    // the event already exists
    {
      approvalId: 'f5',
      status: 'FAILED',
      ageMs: 30 * MIN,
      decided: 'approved',
      events: ['approved']
    },
    {
      approvalId: 'f6',
      status: 'EXPIRED',
      ageMs: 35 * MIN,
      decided: 'rejected',
      events: ['rejected']
    },
    // an "approved" event does not cover a rejected decision
    {
      approvalId: 'f7',
      status: 'EXPIRED',
      ageMs: 5 * MIN,
      decided: 'rejected',
      events: ['approved']
    },
    {
      approvalId: 'f8',
      status: 'EXPIRED',
      ageMs: 12 * MIN,
      decided: 'approved'
    }
  ]

  it('recupera FAILED e EXPIRED decididos, do mais antigo ao mais novo, sem retomar a execução', async () => {
    const h = harness(terminals())
    expect(await h.tick({})).toBe(4)
    expect(h.appended).toEqual(
      ['f2', 'f8', 'f1', 'f7'].sort(byAge(terminals()))
    )
    expect(h.resumed).toEqual([])
    expect(h.failed).toEqual([])
  })

  it('exclui as terminais sem decisão coerente do lote e conta só as incoerentes, sem ocupar vagas', async () => {
    const h = harness(terminals())
    expect(await h.tick({ limit: 2 })).toBe(2)
    expect(h.appended).toEqual(['f2', 'f8'])
    expect(h.failed).toEqual([])
    // f4 (both), f9 (FAILED rejected) and f10 (FAILED without approval); not f3
    expect(h.incoherentCounts).toEqual([3])
  })

  it('EXPIRED que venceu sem decisão sai do lote em silêncio', async () => {
    const h = harness([
      { approvalId: 'q1', status: 'EXPIRED', ageMs: 10 * MIN, decided: 'none' }
    ])
    expect(await h.tick({})).toBe(0)
    expect(h.appended).toEqual([])
    expect(h.failed).toEqual([])
    expect(h.incoherentCounts).toEqual([])
  })

  it.each([
    ['FAILED com rejected_at', 'FAILED', 'rejected'],
    ['FAILED sem timestamp', 'FAILED', 'none'],
    ['FAILED com os dois', 'FAILED', 'both'],
    ['EXPIRED com os dois', 'EXPIRED', 'both']
  ] as const)(
    '%s é excluída do lote e contada como incoerente',
    async (_name, status, decided) => {
      const h = harness([
        { approvalId: 'i1', status, ageMs: 10 * MIN, decided },
        {
          approvalId: 'i2',
          status: 'FAILED',
          ageMs: 5 * MIN,
          decided: 'approved'
        }
      ])
      expect(await h.tick({ limit: 1 })).toBe(1)
      expect(h.appended).toEqual(['i2'])
      expect(h.failed).toEqual([])
      expect(h.incoherentCounts).toEqual([1])
    }
  )

  it('o evento existente cobre só a própria decisão (approved não cobre rejected)', async () => {
    const h = harness(terminals())
    await h.tick({})
    expect(h.appended).not.toContain('f5')
    expect(h.appended).not.toContain('f6')
    expect(h.appended).toContain('f7')
  })

  it('linha incoerente com envelope incompleto conta só como incoerente', async () => {
    const h = harness([
      {
        approvalId: 'g1',
        status: 'FAILED',
        ageMs: 10 * MIN,
        decided: 'none',
        envelope: false
      }
    ])
    await h.tick({})
    expect(h.incoherentCounts).toEqual([1])
    expect(h.incompleteCounts).toEqual([])
  })

  it('sem linhas incoerentes não há registro de contagem', async () => {
    const h = harness([terminals()[0]!])
    await h.tick({})
    expect(h.incoherentCounts).toEqual([])
  })

  it('a contagem usa a mesma janela do lote (piso e teto)', async () => {
    const h = harness([
      { approvalId: 'w1', status: 'FAILED', ageMs: 5_000, decided: 'none' },
      { approvalId: 'w2', status: 'FAILED', ageMs: 10 * MIN, decided: 'none' },
      {
        approvalId: 'w3',
        status: 'FAILED',
        ageMs: 48 * 60 * MIN,
        decided: 'none'
      }
    ])
    await h.tick({})
    expect(h.incoherentCounts).toEqual([1])
  })

  it('o status terminal não muda a seleção dos outros estados', async () => {
    const h = harness([...rows(), ...terminals()])
    await h.tick({})
    expect(h.appended).toEqual(
      expect.arrayContaining(['x9', 'x8', 'x2', 'x1', 'f1', 'f2', 'f8', 'f7'])
    )
    expect(h.appended).toHaveLength(8)
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
