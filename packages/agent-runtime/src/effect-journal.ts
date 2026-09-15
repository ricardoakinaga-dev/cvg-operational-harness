import { createHash } from 'node:crypto'
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises'
import { join } from 'node:path'

export type EffectState =
  | 'RESERVED'
  | 'EFFECT_STARTED'
  | 'CONFIRMED'
  | 'EFFECT_FAILED'
  | 'UNCERTAIN'
  | 'ABANDONED'

export interface EffectRecord {
  tenantId: string
  operationKey: string
  proposalHash: string
  attemptId: string
  state: EffectState
  executionRef: string | null
  resultDigest: string | null
  errorCode: string | null
  reason: string | null
  expiresAt: string
  reconciledBy: string | null
  reconciliationEvidenceRef: string | null
  createdAt: string
  updatedAt: string
  revision: number
}

export interface EffectReserveInput {
  tenantId: string
  operationKey: string
  proposalHash: string
  attemptId: string
  expiresAt: string
}

export type EffectReserveOutcome =
  | { outcome: 'reserved' }
  | { outcome: 'replay'; record: EffectRecord }
  | { outcome: 'in_progress' }
  | { outcome: 'uncertain'; record: EffectRecord }

export interface EffectAttemptRef {
  tenantId: string
  operationKey: string
  attemptId: string
}

export type EffectTransitionKey = Pick<
  EffectAttemptRef,
  'tenantId' | 'operationKey'
>

export interface EffectConfirmRef extends EffectAttemptRef {
  executionRef: string
  resultDigest: string
}

export interface EffectFailRef extends EffectAttemptRef {
  errorCode: string
}

export interface EffectUncertainRef extends EffectAttemptRef {
  reason: string
}

export interface EffectReconcileRef {
  tenantId: string
  operationKey: string
  actorId: string
  outcome: 'effect_confirmed' | 'no_effect'
  evidenceRef: string
}

export interface EffectJournalPort {
  reserve(input: EffectReserveInput): Promise<EffectReserveOutcome>
  markEffectStarted(ref: EffectAttemptRef): Promise<EffectRecord>
  confirmEffect(ref: EffectConfirmRef): Promise<EffectRecord>
  failEffect(ref: EffectFailRef): Promise<EffectRecord>
  markUncertain(ref: EffectUncertainRef): Promise<EffectRecord>
  get(tenantId: string, operationKey: string): Promise<EffectRecord | undefined>
  releaseExpired(now: Date, ttlMs: number): Promise<number>
  reconcile(ref: EffectReconcileRef): Promise<EffectRecord>
}

export type EffectJournalErrorCode =
  | 'idempotency_key_reuse'
  | 'attempt_mismatch'
  | 'invalid_transition'
  | 'invalid_input'
  | 'not_found'
  | 'journal_unavailable'

export class EffectJournalError extends Error {
  readonly code: EffectJournalErrorCode

  constructor(code: EffectJournalErrorCode, message: string) {
    super(message)
    this.name = 'EffectJournalError'
    this.code = code
  }
}

export const EFFECT_EXPIRED_RESERVATION_REASON = 'reservation_expired'
export const EFFECT_EXPIRED_STARTED_REASON = 'effect_started_lease_expired'

export function effectJournalKey(
  tenantId: string,
  operationKey: string
): string {
  return `${tenantId}\u0000${operationKey}`
}

export function cloneEffectRecord(record: EffectRecord): EffectRecord {
  return structuredClone(record)
}

export function isTerminalEffectState(state: EffectState): boolean {
  return state === 'CONFIRMED' || state === 'EFFECT_FAILED'
}

function assertEffectText(value: string, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new EffectJournalError(
      'invalid_input',
      `Effect journal ${label} is required`
    )
  }
  return value
}

function assertReserveInput(input: EffectReserveInput): void {
  assertEffectText(input.tenantId, 'tenantId')
  assertEffectText(input.operationKey, 'operationKey')
  assertEffectText(input.proposalHash, 'proposalHash')
  assertEffectText(input.attemptId, 'attemptId')
  if (!Number.isFinite(Date.parse(input.expiresAt))) {
    throw new EffectJournalError(
      'invalid_input',
      'Effect journal expiresAt is invalid'
    )
  }
}

function assertWindow(now: Date, ttlMs: number): void {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new EffectJournalError(
      'invalid_input',
      'Effect journal now is invalid'
    )
  }
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 0) {
    throw new EffectJournalError(
      'invalid_input',
      'Effect journal ttlMs is invalid'
    )
  }
}

function rearmEffectRecord(
  existing: EffectRecord,
  input: EffectReserveInput,
  nowIso: string
): EffectRecord {
  return {
    ...cloneEffectRecord(existing),
    attemptId: input.attemptId,
    state: 'RESERVED',
    executionRef: null,
    resultDigest: null,
    errorCode: null,
    reason: null,
    expiresAt: input.expiresAt,
    reconciledBy: null,
    reconciliationEvidenceRef: null,
    updatedAt: nowIso,
    revision: existing.revision + 1
  }
}

function createEffectRecord(
  input: EffectReserveInput,
  nowIso: string
): EffectRecord {
  return {
    tenantId: input.tenantId,
    operationKey: input.operationKey,
    proposalHash: input.proposalHash,
    attemptId: input.attemptId,
    state: 'RESERVED',
    executionRef: null,
    resultDigest: null,
    errorCode: null,
    reason: null,
    expiresAt: input.expiresAt,
    reconciledBy: null,
    reconciliationEvidenceRef: null,
    createdAt: nowIso,
    updatedAt: nowIso,
    revision: 1
  }
}

function transitionEffectRecord(
  record: EffectRecord,
  patch: Partial<EffectRecord>,
  nowIso: string
): EffectRecord {
  return {
    ...cloneEffectRecord(record),
    ...patch,
    updatedAt: nowIso,
    revision: record.revision + 1
  }
}

export type ReserveDecision =
  | { outcome: 'reserved'; record: EffectRecord | null }
  | { outcome: 'replay'; record: EffectRecord }
  | { outcome: 'in_progress' }
  | { outcome: 'uncertain'; record: EffectRecord }

/**
 * The single source of truth for reservation semantics. `EFFECT_FAILED` and
 * `ABANDONED` records have no effect started, so the normative retry path
 * (AAA-03 E-1) may re-arm them for a new attempt with the same operation key.
 * `CONFIRMED` always replays; a different proposal hash always fails closed.
 */
export function decideReserve(
  existing: EffectRecord | undefined,
  input: EffectReserveInput,
  nowIso: string
): ReserveDecision {
  if (!existing) {
    return { outcome: 'reserved', record: createEffectRecord(input, nowIso) }
  }
  if (existing.proposalHash !== input.proposalHash) {
    throw new EffectJournalError(
      'idempotency_key_reuse',
      'operationKey was already reserved with a different proposalHash'
    )
  }
  switch (existing.state) {
    case 'CONFIRMED':
      return { outcome: 'replay', record: existing }
    case 'EFFECT_STARTED':
      return { outcome: 'in_progress' }
    case 'UNCERTAIN':
      return { outcome: 'uncertain', record: existing }
    case 'RESERVED':
      if (existing.attemptId === input.attemptId) {
        return { outcome: 'reserved', record: null }
      }
      return { outcome: 'in_progress' }
    case 'EFFECT_FAILED':
    case 'ABANDONED':
      return {
        outcome: 'reserved',
        record: rearmEffectRecord(existing, input, nowIso)
      }
  }
}

export function decideMarkEffectStarted(
  record: EffectRecord,
  attemptId: string,
  nowIso: string
): EffectRecord | undefined {
  if (record.attemptId !== attemptId) {
    throw new EffectJournalError(
      'attempt_mismatch',
      'Effect journal attemptId does not match the reservation'
    )
  }
  if (record.state === 'EFFECT_STARTED') return undefined
  if (record.state !== 'RESERVED') {
    throw new EffectJournalError(
      'invalid_transition',
      `Cannot start an effect from ${record.state}`
    )
  }
  return transitionEffectRecord(record, { state: 'EFFECT_STARTED' }, nowIso)
}

export function decideConfirmEffect(
  record: EffectRecord,
  ref: EffectConfirmRef,
  nowIso: string
): EffectRecord | undefined {
  if (record.attemptId !== ref.attemptId) {
    throw new EffectJournalError(
      'attempt_mismatch',
      'Effect journal attemptId does not match the reservation'
    )
  }
  if (record.state === 'CONFIRMED') {
    if (
      record.executionRef === ref.executionRef &&
      record.resultDigest === ref.resultDigest
    ) {
      return undefined
    }
    throw new EffectJournalError(
      'invalid_transition',
      'CONFIRMED effect records are immutable'
    )
  }
  if (record.state !== 'EFFECT_STARTED') {
    throw new EffectJournalError(
      'invalid_transition',
      `Cannot confirm an effect from ${record.state}`
    )
  }
  return transitionEffectRecord(
    record,
    {
      state: 'CONFIRMED',
      executionRef: ref.executionRef,
      resultDigest: ref.resultDigest,
      errorCode: null,
      reason: null
    },
    nowIso
  )
}

export function decideFailEffect(
  record: EffectRecord,
  ref: EffectFailRef,
  nowIso: string
): EffectRecord | undefined {
  if (record.attemptId !== ref.attemptId) {
    throw new EffectJournalError(
      'attempt_mismatch',
      'Effect journal attemptId does not match the reservation'
    )
  }
  if (record.state === 'EFFECT_FAILED') {
    if (record.errorCode === ref.errorCode) return undefined
    throw new EffectJournalError(
      'invalid_transition',
      'EFFECT_FAILED effect records are immutable'
    )
  }
  if (record.state !== 'RESERVED' && record.state !== 'EFFECT_STARTED') {
    throw new EffectJournalError(
      'invalid_transition',
      `Cannot fail an effect from ${record.state}`
    )
  }
  return transitionEffectRecord(
    record,
    {
      state: 'EFFECT_FAILED',
      errorCode: ref.errorCode,
      reason: null,
      executionRef: null,
      resultDigest: null
    },
    nowIso
  )
}

export function decideMarkUncertain(
  record: EffectRecord,
  ref: EffectUncertainRef,
  nowIso: string
): EffectRecord | undefined {
  if (record.attemptId !== ref.attemptId) {
    throw new EffectJournalError(
      'attempt_mismatch',
      'Effect journal attemptId does not match the reservation'
    )
  }
  if (record.state === 'UNCERTAIN') return undefined
  if (record.state !== 'RESERVED' && record.state !== 'EFFECT_STARTED') {
    throw new EffectJournalError(
      'invalid_transition',
      `Cannot mark an effect uncertain from ${record.state}`
    )
  }
  return transitionEffectRecord(
    record,
    { state: 'UNCERTAIN', reason: ref.reason },
    nowIso
  )
}

export function decideReconcile(
  record: EffectRecord,
  ref: EffectReconcileRef,
  nowIso: string
): EffectRecord {
  assertEffectText(ref.actorId, 'actorId')
  assertEffectText(ref.evidenceRef, 'evidenceRef')
  if (record.state !== 'UNCERTAIN') {
    throw new EffectJournalError(
      'invalid_transition',
      `Reconciliation requires UNCERTAIN, found ${record.state}`
    )
  }
  return transitionEffectRecord(
    record,
    {
      state: ref.outcome === 'effect_confirmed' ? 'CONFIRMED' : 'ABANDONED',
      reason: null,
      reconciledBy: ref.actorId,
      reconciliationEvidenceRef: ref.evidenceRef
    },
    nowIso
  )
}

function isExpiredEffectRecord(
  record: EffectRecord,
  now: Date,
  ttlMs: number
): boolean {
  const expiresAt = Date.parse(record.expiresAt)
  if (Number.isFinite(expiresAt) && expiresAt <= now.getTime()) return true
  const updatedAt = Date.parse(record.updatedAt)
  return Number.isFinite(updatedAt) && updatedAt + ttlMs <= now.getTime()
}

/**
 * The sweep never executes an effect and never touches terminal or uncertain
 * records: an expired RESERVED reservation is safely ABANDONED, while an
 * expired EFFECT_STARTED attempt becomes UNCERTAIN and requires explicit
 * reconciliation.
 */
export function decideExpiredTransition(
  record: EffectRecord,
  now: Date,
  ttlMs: number,
  nowIso: string
): EffectRecord | undefined {
  if (record.state !== 'RESERVED' && record.state !== 'EFFECT_STARTED') {
    return undefined
  }
  if (!isExpiredEffectRecord(record, now, ttlMs)) return undefined
  return transitionEffectRecord(
    record,
    record.state === 'RESERVED'
      ? { state: 'ABANDONED', reason: EFFECT_EXPIRED_RESERVATION_REASON }
      : { state: 'UNCERTAIN', reason: EFFECT_EXPIRED_STARTED_REASON },
    nowIso
  )
}

export interface InMemoryEffectJournalOptions {
  clock?: () => Date
}

/**
 * Reference runtime journal for a single process. It is atomic within one
 * Node event loop but NOT durable across restarts; use it only in tests,
 * evals and explicitly ephemeral flows. The durable boundaries are
 * `FileEffectJournal` (single host) and the PostgreSQL adapter.
 */
export class InMemoryEffectJournal implements EffectJournalPort {
  readonly #entries = new Map<string, EffectRecord>()
  readonly #clock: () => Date

  constructor(options: InMemoryEffectJournalOptions = {}) {
    this.#clock = options.clock ?? (() => new Date())
  }

  async reserve(input: EffectReserveInput): Promise<EffectReserveOutcome> {
    assertReserveInput(input)
    const key = effectJournalKey(input.tenantId, input.operationKey)
    const nowIso = this.#clock().toISOString()
    const decision = decideReserve(this.#entries.get(key), input, nowIso)
    if (decision.outcome === 'reserved') {
      if (decision.record) this.#entries.set(key, decision.record)
      return { outcome: 'reserved' }
    }
    if (decision.outcome === 'replay') {
      return { outcome: 'replay', record: cloneEffectRecord(decision.record) }
    }
    if (decision.outcome === 'uncertain') {
      return {
        outcome: 'uncertain',
        record: cloneEffectRecord(decision.record)
      }
    }
    return { outcome: 'in_progress' }
  }

  async markEffectStarted(ref: EffectAttemptRef): Promise<EffectRecord> {
    return this.#transition(ref, (record, nowIso) =>
      decideMarkEffectStarted(record, ref.attemptId, nowIso)
    )
  }

  async confirmEffect(ref: EffectConfirmRef): Promise<EffectRecord> {
    return this.#transition(ref, (record, nowIso) =>
      decideConfirmEffect(record, ref, nowIso)
    )
  }

  async failEffect(ref: EffectFailRef): Promise<EffectRecord> {
    return this.#transition(ref, (record, nowIso) =>
      decideFailEffect(record, ref, nowIso)
    )
  }

  async markUncertain(ref: EffectUncertainRef): Promise<EffectRecord> {
    return this.#transition(ref, (record, nowIso) =>
      decideMarkUncertain(record, ref, nowIso)
    )
  }

  async get(
    tenantId: string,
    operationKey: string
  ): Promise<EffectRecord | undefined> {
    const record = this.#entries.get(effectJournalKey(tenantId, operationKey))
    return record ? cloneEffectRecord(record) : undefined
  }

  async releaseExpired(now: Date, ttlMs: number): Promise<number> {
    assertWindow(now, ttlMs)
    const nowIso = now.toISOString()
    let released = 0
    for (const [key, record] of this.#entries) {
      const updated = decideExpiredTransition(record, now, ttlMs, nowIso)
      if (updated) {
        this.#entries.set(key, updated)
        released += 1
      }
    }
    return released
  }

  async reconcile(ref: EffectReconcileRef): Promise<EffectRecord> {
    return this.#transition(ref, (record, nowIso) =>
      decideReconcile(record, ref, nowIso)
    )
  }

  #transition(
    ref: EffectTransitionKey,
    update: (record: EffectRecord, nowIso: string) => EffectRecord | undefined
  ): EffectRecord {
    const key = effectJournalKey(ref.tenantId, ref.operationKey)
    const record = this.#entries.get(key)
    if (!record) {
      throw new EffectJournalError(
        'not_found',
        'Effect journal record does not exist'
      )
    }
    const updated = update(record, this.#clock().toISOString())
    if (updated) this.#entries.set(key, updated)
    return cloneEffectRecord(updated ?? record)
  }
}

export interface FileEffectJournalOptions {
  /** Directory owned by this journal; one JSON file per operation key. */
  directory: string
  clock?: () => Date
  pollMs?: number
  lockTimeoutMs?: number
  staleLockMs?: number
}

/**
 * Durable single-host runtime journal. Reservations use atomic file creation
 * and every transition is a locked read-modify-write with atomic rename, so
 * two processes sharing the same directory cannot reserve the same operation
 * key twice. It survives process restarts; it does NOT replace PostgreSQL for
 * multi-host deployments.
 */
export class FileEffectJournal implements EffectJournalPort {
  readonly #directory: string
  readonly #clock: () => Date
  readonly #pollMs: number
  readonly #lockTimeoutMs: number
  readonly #staleLockMs: number
  #temporaryCounter = 0

  constructor(options: FileEffectJournalOptions) {
    if (!options.directory || options.directory.trim() === '') {
      throw new EffectJournalError(
        'invalid_input',
        'FileEffectJournal requires a directory'
      )
    }
    this.#directory = options.directory
    this.#clock = options.clock ?? (() => new Date())
    this.#pollMs = options.pollMs ?? 5
    this.#lockTimeoutMs = options.lockTimeoutMs ?? 2_000
    this.#staleLockMs = options.staleLockMs ?? 10_000
  }

  async reserve(input: EffectReserveInput): Promise<EffectReserveOutcome> {
    assertReserveInput(input)
    await mkdir(this.#directory, { recursive: true })
    const key = effectJournalKey(input.tenantId, input.operationKey)
    const nowIso = this.#clock().toISOString()

    if (await this.#tryCreate(key, createEffectRecord(input, nowIso))) {
      return { outcome: 'reserved' }
    }

    return this.#withLock(key, async () => {
      const existing = await this.#readRecord(key)
      const decision = decideReserve(
        existing,
        input,
        this.#clock().toISOString()
      )
      if (decision.outcome === 'reserved') {
        if (decision.record) await this.#writeRecord(key, decision.record)
        return { outcome: 'reserved' }
      }
      if (decision.outcome === 'replay') {
        return { outcome: 'replay', record: cloneEffectRecord(decision.record) }
      }
      if (decision.outcome === 'uncertain') {
        return {
          outcome: 'uncertain',
          record: cloneEffectRecord(decision.record)
        }
      }
      return { outcome: 'in_progress' }
    })
  }

  async markEffectStarted(ref: EffectAttemptRef): Promise<EffectRecord> {
    return this.#transition(ref, (record, nowIso) =>
      decideMarkEffectStarted(record, ref.attemptId, nowIso)
    )
  }

  async confirmEffect(ref: EffectConfirmRef): Promise<EffectRecord> {
    return this.#transition(ref, (record, nowIso) =>
      decideConfirmEffect(record, ref, nowIso)
    )
  }

  async failEffect(ref: EffectFailRef): Promise<EffectRecord> {
    return this.#transition(ref, (record, nowIso) =>
      decideFailEffect(record, ref, nowIso)
    )
  }

  async markUncertain(ref: EffectUncertainRef): Promise<EffectRecord> {
    return this.#transition(ref, (record, nowIso) =>
      decideMarkUncertain(record, ref, nowIso)
    )
  }

  async get(
    tenantId: string,
    operationKey: string
  ): Promise<EffectRecord | undefined> {
    const record = await this.#readRecord(
      effectJournalKey(tenantId, operationKey)
    )
    return record ? cloneEffectRecord(record) : undefined
  }

  async releaseExpired(now: Date, ttlMs: number): Promise<number> {
    assertWindow(now, ttlMs)
    const nowIso = now.toISOString()
    let files: string[]
    try {
      files = await readdir(this.#directory)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0
      throw new EffectJournalError(
        'journal_unavailable',
        'Effect journal directory is unreadable'
      )
    }
    let released = 0
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      const path = join(this.#directory, file)
      const updated = await this.#withLockPath(path, async () => {
        const record = await this.#readRecordAt(path)
        if (!record) return false
        const transitioned = decideExpiredTransition(record, now, ttlMs, nowIso)
        if (!transitioned) return false
        await this.#writeRecordAt(path, transitioned)
        return true
      })
      if (updated) released += 1
    }
    return released
  }

  async reconcile(ref: EffectReconcileRef): Promise<EffectRecord> {
    return this.#transition(ref, (record, nowIso) =>
      decideReconcile(record, ref, nowIso)
    )
  }

  async #transition(
    ref: EffectTransitionKey,
    update: (record: EffectRecord, nowIso: string) => EffectRecord | undefined
  ): Promise<EffectRecord> {
    const key = effectJournalKey(ref.tenantId, ref.operationKey)
    return this.#withLock(key, async () => {
      const record = await this.#readRecord(key)
      if (!record) {
        throw new EffectJournalError(
          'not_found',
          'Effect journal record does not exist'
        )
      }
      const updated = update(record, this.#clock().toISOString())
      if (updated) await this.#writeRecord(key, updated)
      return cloneEffectRecord(updated ?? record)
    })
  }

  async #tryCreate(key: string, record: EffectRecord): Promise<boolean> {
    try {
      const handle = await open(this.#recordPath(key), 'wx')
      try {
        await handle.writeFile(JSON.stringify(record), 'utf8')
      } finally {
        await handle.close()
      }
      return true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
      throw new EffectJournalError(
        'journal_unavailable',
        'Effect journal record could not be created'
      )
    }
  }

  async #readRecord(key: string): Promise<EffectRecord | undefined> {
    return this.#readRecordAt(this.#recordPath(key))
  }

  async #readRecordAt(path: string): Promise<EffectRecord | undefined> {
    try {
      const raw = await readFile(path, 'utf8')
      const parsed = JSON.parse(raw) as EffectRecord
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof parsed.tenantId !== 'string' ||
        typeof parsed.operationKey !== 'string' ||
        typeof parsed.proposalHash !== 'string' ||
        typeof parsed.attemptId !== 'string' ||
        typeof parsed.state !== 'string' ||
        typeof parsed.revision !== 'number' ||
        typeof parsed.expiresAt !== 'string'
      ) {
        throw new EffectJournalError(
          'journal_unavailable',
          'Effect journal record is corrupt'
        )
      }
      return parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      if (error instanceof EffectJournalError) throw error
      throw new EffectJournalError(
        'journal_unavailable',
        'Effect journal record is unreadable or corrupt'
      )
    }
  }

  async #writeRecord(key: string, record: EffectRecord): Promise<void> {
    return this.#writeRecordAt(this.#recordPath(key), record)
  }

  async #writeRecordAt(path: string, record: EffectRecord): Promise<void> {
    const temporary = `${path}.${process.pid}.${this.#temporaryCounter++}.tmp`
    try {
      await writeFile(temporary, JSON.stringify(record), 'utf8')
      await rename(temporary, path)
    } catch {
      await unlink(temporary).catch(() => undefined)
      throw new EffectJournalError(
        'journal_unavailable',
        'Effect journal record could not be persisted'
      )
    }
  }

  async #withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    return this.#withLockPath(this.#recordPath(key), operation)
  }

  async #withLockPath<T>(
    path: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const lockPath = `${path}.lock`
    const deadline = this.#clock().getTime() + this.#lockTimeoutMs
    for (;;) {
      try {
        const handle = await open(lockPath, 'wx')
        try {
          await handle.writeFile(String(process.pid), 'utf8')
        } finally {
          await handle.close()
        }
        break
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw new EffectJournalError(
            'journal_unavailable',
            'Effect journal lock could not be acquired'
          )
        }
        const info = await stat(lockPath).catch(() => undefined)
        if (
          info &&
          this.#clock().getTime() - info.mtimeMs > this.#staleLockMs
        ) {
          await unlink(lockPath).catch(() => undefined)
          continue
        }
        if (this.#clock().getTime() >= deadline) {
          throw new EffectJournalError(
            'journal_unavailable',
            'Timed out acquiring the effect journal lock'
          )
        }
        await new Promise((resolve) => setTimeout(resolve, this.#pollMs))
      }
    }
    try {
      return await operation()
    } finally {
      await unlink(lockPath).catch(() => undefined)
    }
  }

  #recordPath(key: string): string {
    const digest = createHash('sha256').update(key).digest('hex')
    return join(this.#directory, `${digest}.json`)
  }
}
