import type { SessionHeaderV1 } from '@cvg/harness-contracts'
import { validateSessionHeader } from '@cvg/harness'
import type { PostgresQueryable } from './postgres.ts'

/**
 * SPEC 0221 §9 items 3-5: adoption of historical streams whose header is NULL. Runs as the
 * migration authority with writers stopped, never in request serving. Historic events are never
 * touched; only the NULL header and cut of a stream whose cursor and ordered digest match the manifest.
 */
export const SESSION_ADOPTION_MAX_BATCH = 100
const STATEMENT_TIMEOUT = '5s'

export interface SessionAdoptionEntry {
  readonly tenantId: string
  readonly sessionId: string
  readonly header: SessionHeaderV1
  readonly inheritedEventCount: number
  /** Cursor the stream must have (last sequence + 1). */
  readonly expectedNextSequence: number
  /** SHA-256 hex of the ordered `sequence:input_digest` lines of the stream body. */
  readonly expectedDigest: string
  /** Where the metadata was taken from; never inferred from the first event or NOW. */
  readonly provenance: string
}
export interface SessionAdoptionBatch {
  readonly index: number
  readonly adopted: number
  readonly alreadyAdopted: number
}
export interface SessionAdoptionReport {
  readonly batches: readonly SessionAdoptionBatch[]
  readonly adopted: number
  readonly alreadyAdopted: number
}
export type SessionAdoptionFailure =
  | 'invalid_manifest'
  | 'conflict'
  | 'writer_active'
  | 'outcome_unknown'
  | 'storage'

/** Stops the run. Batches before `failedBatch` are committed; rerun after fixing the cause. */
export class SessionAdoptionError extends Error {
  constructor(
    readonly failure: SessionAdoptionFailure,
    message: string,
    readonly failedBatch: number,
    readonly completed: SessionAdoptionReport,
    options?: { readonly cause?: unknown }
  ) {
    super(message, options)
    this.name = 'SessionAdoptionError'
  }
}

const quote = (schema: string): string => `"${schema}"`
const SCHEMA_NAME = /^[a-z][a-z0-9_]{0,62}$/
/** The tool runs as the table owner: the schema name is interpolated, so it is validated first. */
function checkedSchema(raw: unknown): string {
  if (typeof raw !== 'string' || !SCHEMA_NAME.test(raw))
    throw new SessionAdoptionError(
      'invalid_manifest',
      'invalid session schema name',
      0,
      { batches: [], adopted: 0, alreadyAdopted: 0 }
    )
  return raw
}
const DIGEST = /^[a-f0-9]{64}$/
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

interface Prepared {
  readonly entry: SessionAdoptionEntry
  readonly headerText: string
}

function prepare(
  manifest: readonly SessionAdoptionEntry[],
  batchSize: number
): Prepared[] {
  const fail = (message: string): never => {
    throw new SessionAdoptionError('invalid_manifest', message, 0, empty)
  }
  const empty: SessionAdoptionReport = {
    batches: [],
    adopted: 0,
    alreadyAdopted: 0
  }
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > SESSION_ADOPTION_MAX_BATCH
  )
    fail(`batch size must be 1..${SESSION_ADOPTION_MAX_BATCH}`)
  const seen = new Set<string>()
  const out: Prepared[] = []
  for (const entry of manifest) {
    const where = `${entry.tenantId}/${entry.sessionId}`
    if (typeof entry.tenantId !== 'string' || entry.tenantId.length === 0)
      fail('manifest entry without tenant')
    if (seen.has(JSON.stringify([entry.tenantId, entry.sessionId])))
      fail(`duplicate manifest entry ${where}`)
    seen.add(JSON.stringify([entry.tenantId, entry.sessionId]))
    if (typeof entry.provenance !== 'string' || entry.provenance.length === 0)
      fail(`manifest entry ${where} has no provenance`)
    if (
      !Number.isSafeInteger(entry.expectedNextSequence) ||
      entry.expectedNextSequence < 1
    )
      fail(`manifest entry ${where} has an invalid cursor`)
    if (!DIGEST.test(entry.expectedDigest))
      fail(`manifest entry ${where} has an invalid digest`)
    let captured
    try {
      captured = validateSessionHeader(entry.header, entry.inheritedEventCount)
    } catch (cause) {
      throw new SessionAdoptionError(
        'invalid_manifest',
        `manifest entry ${where} has an invalid header`,
        0,
        empty,
        { cause }
      )
    }
    if (captured.header.id !== entry.sessionId)
      fail(`manifest entry ${where} header id differs`)
    out.push({ entry, headerText: JSON.stringify(captured.header) })
  }
  return out.sort(
    (a, b) =>
      compare(a.entry.tenantId, b.entry.tenantId) ||
      compare(a.entry.sessionId, b.entry.sessionId)
  )
}

interface StreamState {
  readonly header_json: string | null
  readonly inherited_event_count: string | null
  readonly next_sequence: string
  readonly writer_lock_id: number
  readonly digest: string
  readonly free: boolean
}

/** Locks and reads one stream inside the batch transaction (tenant-bound for RLS). */
async function lockStream(
  client: PostgresQueryable,
  schema: string,
  tenantId: string,
  sessionId: string,
  forUpdate: boolean
): Promise<StreamState | undefined> {
  await client.query("SELECT set_config('cvg.tenant_id', $1, true)", [tenantId])
  const stream = await client.query<Omit<StreamState, 'digest' | 'free'>>(
    `SELECT header_json, inherited_event_count, next_sequence, writer_lock_id
       FROM ${quote(schema)}.session_streams WHERE tenant_id=$1 AND session_id=$2${forUpdate ? ' FOR UPDATE' : ''}`,
    [tenantId, sessionId]
  )
  const row = stream.rows[0]
  if (!row) return undefined
  const detail = await client.query<{ digest: string; free: boolean }>(
    `SELECT encode(sha256(convert_to(COALESCE((SELECT string_agg(sequence::text || ':' || input_digest, E'\\n' ORDER BY sequence)
              FROM ${quote(schema)}.session_events WHERE tenant_id=$1 AND session_id=$2), ''), 'UTF8')), 'hex') AS digest,
            pg_try_advisory_xact_lock((to_regclass($3)::oid::bigint - 2147483648)::integer, $4::integer) AS free`,
    [
      tenantId,
      sessionId,
      `${quote(schema)}.session_streams`,
      row.writer_lock_id
    ]
  )
  return { ...row, digest: detail.rows[0]!.digest, free: detail.rows[0]!.free }
}

function matches(state: StreamState, p: Prepared): boolean {
  return (
    state.header_json === p.headerText &&
    Number(state.inherited_event_count) === p.entry.inheritedEventCount
  )
}

export async function adoptSessionStreams(
  client: PostgresQueryable,
  options: {
    readonly schemaName: string
    readonly batchSize?: number
    /** Called after each batch COMMIT; a throw stops the run with committed batches kept. */
    readonly onBatchCommitted?: (
      batch: SessionAdoptionBatch
    ) => void | Promise<void>
  },
  manifest: readonly SessionAdoptionEntry[]
): Promise<SessionAdoptionReport> {
  const schema = checkedSchema(options.schemaName)
  const prepared = prepare(
    manifest,
    options.batchSize ?? SESSION_ADOPTION_MAX_BATCH
  )
  const size = options.batchSize ?? SESSION_ADOPTION_MAX_BATCH
  const batches: SessionAdoptionBatch[] = []
  let adopted = 0
  let already = 0
  const done = (): SessionAdoptionReport => ({
    batches: [...batches],
    adopted,
    alreadyAdopted: already
  })
  for (
    let start = 0, index = 0;
    start < prepared.length;
    start += size, index++
  ) {
    const slice = prepared.slice(start, start + size)
    let inBatchAdopted = 0
    let inBatchAlready = 0
    const stop = (
      failure: SessionAdoptionFailure,
      message: string,
      cause?: unknown
    ): SessionAdoptionError =>
      new SessionAdoptionError(failure, message, index, done(), { cause })
    try {
      await client.query('BEGIN')
      await client.query(`SET LOCAL lock_timeout = '${STATEMENT_TIMEOUT}'`)
      await client.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`)
      for (const p of slice) {
        const { tenantId, sessionId } = p.entry
        const where = `${tenantId}/${sessionId}`
        const state = await lockStream(
          client,
          schema,
          tenantId,
          sessionId,
          true
        )
        if (!state) throw stop('conflict', `stream ${where} does not exist`)
        if (!state.free)
          throw stop('writer_active', `stream ${where} has a live writer`)
        if (Number(state.next_sequence) !== p.entry.expectedNextSequence)
          throw stop(
            'conflict',
            `stream ${where} cursor differs from the manifest`
          )
        if (state.digest !== p.entry.expectedDigest)
          throw stop(
            'conflict',
            `stream ${where} body digest differs from the manifest`
          )
        if (state.header_json !== null) {
          if (!matches(state, p))
            throw stop(
              'conflict',
              `stream ${where} is adopted with different metadata`
            )
          inBatchAlready++
          continue
        }
        const updated = await client.query(
          `UPDATE ${quote(schema)}.session_streams SET header_json=$3, inherited_event_count=$4
             WHERE tenant_id=$1 AND session_id=$2 AND header_json IS NULL AND next_sequence=$5`,
          [
            tenantId,
            sessionId,
            p.headerText,
            p.entry.inheritedEventCount,
            p.entry.expectedNextSequence
          ]
        )
        if (updated.rowCount !== 1)
          throw stop('conflict', `stream ${where} changed during adoption`)
        inBatchAdopted++
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      if (error instanceof SessionAdoptionError) throw error
      throw stop('storage', 'adoption batch failed and was rolled back', error)
    }
    try {
      await client.query('COMMIT')
    } catch (cause) {
      // The batch may or may not be durable; the rerun is idempotent and decides.
      throw stop('outcome_unknown', 'adoption COMMIT outcome is unknown', cause)
    }
    adopted += inBatchAdopted
    already += inBatchAlready
    const batch = {
      index,
      adopted: inBatchAdopted,
      alreadyAdopted: inBatchAlready
    }
    batches.push(batch)
    await options.onBatchCommitted?.(batch)
  }
  return done()
}

/** Streams that still have no metadata. The API may be enabled only when this is empty. */
export async function countUnadoptedSessionStreams(
  client: PostgresQueryable,
  options: { readonly schemaName: string; readonly tenantId: string }
): Promise<number> {
  const schema = checkedSchema(options.schemaName)
  await client.query('BEGIN')
  try {
    await client.query("SELECT set_config('cvg.tenant_id', $1, true)", [
      options.tenantId
    ])
    const r = await client.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${quote(schema)}.session_streams WHERE tenant_id=$1 AND header_json IS NULL`,
      [options.tenantId]
    )
    return r.rows[0]!.n
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
  }
}

/** Reconciles header, cut, cursor and ordered digest of every manifest entry; returns the mismatches. */
export async function verifySessionAdoption(
  client: PostgresQueryable,
  options: { readonly schemaName: string },
  manifest: readonly SessionAdoptionEntry[]
): Promise<string[]> {
  const schema = checkedSchema(options.schemaName)
  const prepared = prepare(manifest, 1)
  const problems: string[] = []
  await client.query('BEGIN READ ONLY')
  try {
    for (const p of prepared) {
      const { tenantId, sessionId } = p.entry
      const where = `${tenantId}/${sessionId}`
      // A failing read aborts only this entry; it is reported, never turned into "missing".
      await client.query('SAVEPOINT verify_entry')
      try {
        const state = await lockStream(
          client,
          schema,
          tenantId,
          sessionId,
          false
        )
        if (!state) problems.push(`${where}: missing`)
        else if (!matches(state, p)) problems.push(`${where}: metadata differs`)
        else if (Number(state.next_sequence) !== p.entry.expectedNextSequence)
          problems.push(`${where}: cursor differs`)
        else if (state.digest !== p.entry.expectedDigest)
          problems.push(`${where}: digest differs`)
        await client.query('RELEASE SAVEPOINT verify_entry')
      } catch (error) {
        await client.query('ROLLBACK TO SAVEPOINT verify_entry')
        problems.push(
          `${where}: error ${(error as { code?: string }).code ?? 'unknown'}`
        )
      }
    }
  } finally {
    await client.query('ROLLBACK').catch(() => undefined)
  }
  return problems
}
