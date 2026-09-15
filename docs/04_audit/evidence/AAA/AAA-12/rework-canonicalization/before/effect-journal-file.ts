import { createHash } from 'node:crypto'
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile
} from 'node:fs/promises'
import { join } from 'node:path'
import type { OutboundResult } from './contracts.ts'
import { ChannelError, type ChannelErrorCode } from './errors.ts'
import {
  channelEffectHasActiveLease,
  channelEffectKey,
  cloneEffectRecord,
  createEffectRecord,
  decideReserve,
  delay,
  isTerminalForWaiter,
  type ChannelEffectIdentity,
  type ChannelEffectJournal,
  type ChannelEffectReconciliation,
  type ChannelEffectRecord,
  type ChannelEffectReserveInput,
  type ChannelEffectReserveOutcome,
  type ChannelEffectTransition
} from './effect-journal.ts'

export interface FileChannelEffectJournalOptions {
  /** Directory owned by this journal; one JSON file per operation. */
  directory: string
  clock?: () => number
  pollMs?: number
  lockTimeoutMs?: number
  staleLockMs?: number
}

/**
 * Durable single-host journal. Reservations use atomic file creation, and
 * every transition is a locked read-modify-write with atomic rename, so two
 * processes sharing the same directory cannot both reserve the same
 * operation. It survives process restarts; it does NOT replace PostgreSQL for
 * multi-host deployments.
 */
export class FileChannelEffectJournal implements ChannelEffectJournal {
  readonly #directory: string
  readonly #clock: () => number
  readonly #pollMs: number
  readonly #lockTimeoutMs: number
  readonly #staleLockMs: number
  #temporaryCounter = 0

  constructor(options: FileChannelEffectJournalOptions) {
    if (!options.directory || options.directory.trim() === '') {
      throw new ChannelError(
        'invalid_config',
        'FileChannelEffectJournal requires a directory'
      )
    }
    this.#directory = options.directory
    this.#clock = options.clock ?? (() => Date.now())
    this.#pollMs = options.pollMs ?? 5
    this.#lockTimeoutMs = options.lockTimeoutMs ?? 2_000
    this.#staleLockMs = options.staleLockMs ?? 10_000
  }

  async reserve(
    input: ChannelEffectReserveInput
  ): Promise<ChannelEffectReserveOutcome> {
    await mkdir(this.#directory, { recursive: true })
    const key = channelEffectKey(input.identity)
    const created = createEffectRecord(input, this.#clock())
    if (await this.#tryCreate(key, created)) {
      return { outcome: 'reserved', record: cloneEffectRecord(created) }
    }
    return this.#withLock(key, async () => {
      const existing = await this.#readRecord(key)
      const decision = decideReserve(existing, input, this.#clock())
      if (decision.action === 'create') {
        const record = createEffectRecord(input, this.#clock())
        await this.#writeRecord(key, record)
        return { outcome: 'reserved', record: cloneEffectRecord(record) }
      }
      const record = decision.record as ChannelEffectRecord
      if (decision.action === 'takeover') {
        await this.#writeRecord(key, record)
        return { outcome: 'reserved', record: cloneEffectRecord(record) }
      }
      if (decision.action === 'uncertain') {
        if (existing?.state !== 'UNCERTAIN')
          await this.#writeRecord(key, record)
        return { outcome: 'uncertain', record: cloneEffectRecord(record) }
      }
      if (decision.action === 'conflict') {
        return { outcome: 'conflict', record: cloneEffectRecord(record) }
      }
      if (decision.action === 'replay') {
        return { outcome: 'replay', record: cloneEffectRecord(record) }
      }
      return { outcome: 'in_flight', record: cloneEffectRecord(record) }
    })
  }

  async claimSend(
    identity: ChannelEffectIdentity,
    leaseOwner: string
  ): Promise<ChannelEffectRecord> {
    const key = channelEffectKey(identity)
    return this.#withLock(key, async () => {
      const record = await this.#readRecord(key)
      const now = this.#clock()
      if (
        !record ||
        record.state !== 'PENDING' ||
        record.leaseOwner !== leaseOwner ||
        !channelEffectHasActiveLease(record, now)
      ) {
        throw new ChannelError(
          'lease_lost',
          'Channel operation lease is not owned by the caller',
          true
        )
      }
      const updated: ChannelEffectRecord = {
        ...record,
        state: 'SENDING',
        updatedAtMs: now,
        revision: record.revision + 1
      }
      await this.#writeRecord(key, updated)
      return cloneEffectRecord(updated)
    })
  }

  async renew(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    leaseMs: number
  ): Promise<boolean> {
    const key = channelEffectKey(identity)
    return this.#withLock(key, async () => {
      const record = await this.#readRecord(key)
      const now = this.#clock()
      if (
        !record ||
        record.leaseOwner !== leaseOwner ||
        !channelEffectHasActiveLease(record, now)
      ) {
        return false
      }
      await this.#writeRecord(key, {
        ...record,
        leaseExpiresAtMs: now + leaseMs,
        updatedAtMs: now
      })
      return true
    })
  }

  async complete(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    result: OutboundResult
  ): Promise<ChannelEffectTransition> {
    return this.#settle(
      identity,
      leaseOwner,
      (record, now): ChannelEffectRecord => ({
        ...record,
        state: 'CONFIRMED',
        result,
        errorCode: null,
        leaseOwner: null,
        leaseExpiresAtMs: null,
        updatedAtMs: now,
        revision: record.revision + 1
      })
    )
  }

  async fail(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    errorCode: ChannelErrorCode
  ): Promise<ChannelEffectTransition> {
    return this.#settle(identity, leaseOwner, (record, now) => ({
      ...record,
      state: 'FAILED',
      errorCode,
      leaseOwner: null,
      leaseExpiresAtMs: null,
      updatedAtMs: now,
      revision: record.revision + 1
    }))
  }

  async release(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    errorCode: ChannelErrorCode
  ): Promise<ChannelEffectTransition> {
    return this.#settle(identity, leaseOwner, (record, now) => ({
      ...record,
      state: 'PENDING',
      errorCode,
      leaseOwner: null,
      leaseExpiresAtMs: null,
      updatedAtMs: now,
      revision: record.revision + 1
    }))
  }

  async markUncertain(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    errorCode: ChannelErrorCode
  ): Promise<ChannelEffectTransition> {
    return this.#settle(identity, leaseOwner, (record, now) => ({
      ...record,
      state: 'UNCERTAIN',
      errorCode,
      leaseOwner: null,
      leaseExpiresAtMs: null,
      updatedAtMs: now,
      revision: record.revision + 1
    }))
  }

  async find(
    identity: ChannelEffectIdentity
  ): Promise<ChannelEffectRecord | undefined> {
    return this.#readRecord(channelEffectKey(identity))
  }

  async waitForTerminal(
    identity: ChannelEffectIdentity,
    timeoutMs: number
  ): Promise<ChannelEffectRecord | undefined> {
    const key = channelEffectKey(identity)
    const deadline = this.#clock() + timeoutMs
    for (;;) {
      const record = await this.#readRecord(key)
      if (record && isTerminalForWaiter(record.state)) return record
      const remaining = deadline - this.#clock()
      if (remaining <= 0) return undefined
      await delay(Math.max(1, Math.min(this.#pollMs, remaining)))
    }
  }

  async resolveUncertain(
    identity: ChannelEffectIdentity,
    resolution: ChannelEffectReconciliation
  ): Promise<ChannelEffectRecord> {
    const key = channelEffectKey(identity)
    return this.#withLock(key, async () => {
      const record = await this.#readRecord(key)
      if (!record || record.state !== 'UNCERTAIN') {
        throw new ChannelError(
          'reconciliation_required',
          `Channel operation is ${record?.state ?? 'missing'}, not UNCERTAIN`,
          false
        )
      }
      const now = this.#clock()
      const updated: ChannelEffectRecord =
        resolution.kind === 'confirmed'
          ? {
              ...record,
              state: 'CONFIRMED',
              result: resolution.result,
              errorCode: null,
              updatedAtMs: now,
              revision: record.revision + 1
            }
          : {
              ...record,
              state: 'PENDING',
              errorCode: null,
              leaseOwner: null,
              leaseExpiresAtMs: null,
              updatedAtMs: now,
              revision: record.revision + 1
            }
      await this.#writeRecord(key, updated)
      return cloneEffectRecord(updated)
    })
  }

  async #settle(
    identity: ChannelEffectIdentity,
    leaseOwner: string,
    update: (record: ChannelEffectRecord, nowMs: number) => ChannelEffectRecord
  ): Promise<ChannelEffectTransition> {
    const key = channelEffectKey(identity)
    return this.#withLock(key, async () => {
      const record = await this.#readRecord(key)
      if (!record) return 'lease_lost'
      if (
        record.state === 'CONFIRMED' ||
        record.state === 'FAILED' ||
        record.state === 'UNCERTAIN'
      ) {
        return 'lease_lost'
      }
      if (record.leaseOwner !== leaseOwner) return 'lease_lost'
      await this.#writeRecord(key, update(record, this.#clock()))
      return 'committed'
    })
  }

  async #tryCreate(key: string, record: ChannelEffectRecord): Promise<boolean> {
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
      throw new ChannelError(
        'journal_unavailable',
        'Channel effect journal could not create the operation record'
      )
    }
  }

  async #readRecord(key: string): Promise<ChannelEffectRecord | undefined> {
    try {
      const raw = await readFile(this.#recordPath(key), 'utf8')
      const parsed = JSON.parse(raw) as ChannelEffectRecord
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof parsed.revision !== 'number' ||
        typeof parsed.state !== 'string'
      ) {
        throw new Error('invalid channel effect record')
      }
      return parsed
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw new ChannelError(
        'journal_unavailable',
        'Channel effect journal record is unreadable or corrupt'
      )
    }
  }

  async #writeRecord(key: string, record: ChannelEffectRecord): Promise<void> {
    const target = this.#recordPath(key)
    const temporary = `${target}.${process.pid}.${this.#temporaryCounter++}.tmp`
    try {
      await writeFile(temporary, JSON.stringify(record), 'utf8')
      await rename(temporary, target)
    } catch {
      await unlink(temporary).catch(() => undefined)
      throw new ChannelError(
        'journal_unavailable',
        'Channel effect journal record could not be persisted'
      )
    }
  }

  async #withLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const lockPath = `${this.#recordPath(key)}.lock`
    const deadline = this.#clock() + this.#lockTimeoutMs
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
          throw new ChannelError(
            'journal_unavailable',
            'Channel effect journal lock could not be acquired'
          )
        }
        const info = await stat(lockPath).catch(() => undefined)
        if (info && this.#clock() - info.mtimeMs > this.#staleLockMs) {
          await unlink(lockPath).catch(() => undefined)
          continue
        }
        if (this.#clock() >= deadline) {
          throw new ChannelError(
            'journal_unavailable',
            'Timed out acquiring the channel effect journal lock',
            true
          )
        }
        await delay(this.#pollMs)
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
