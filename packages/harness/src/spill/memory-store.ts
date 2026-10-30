import { createHash, randomBytes } from 'node:crypto'
import type {
  SpillDurability,
  SpillPurgeInput,
  SpillPolicy,
  SpillPutInput,
  SpillReadInput,
  SpillReceipt,
  SpillSlice,
  SpillStore
} from '@cvg/harness-contracts'
import {
  SpillExpired,
  SpillNotFound,
  SpillQuotaExceeded,
  SpillTooLarge
} from './errors.ts'
import { resolveSpillPolicy } from './policy.ts'
import { alignUtf8Slice, sha256Hex, utf8Bytes } from './render.ts'

interface Entry {
  readonly tenantId: string
  readonly sessionId: string
  readonly key: string
  readonly content: Buffer
  readonly sha256: string
  readonly createdAt: string
  readonly expiresAt: string
}

export interface InMemorySpillStoreOptions {
  readonly policy?: Partial<SpillPolicy>
  readonly clock?: () => Date
  readonly random?: (size: number) => Buffer
}

const hashLocator = (locator: string): string =>
  createHash('sha256').update(locator).digest('hex')

/**
 * One process only (`durability: 'process'`): a fixture for tests. The locator
 * is never stored, only its hash; a read needs the same tenant and session as
 * the write, and anything else is `SpillNotFound` (I4).
 */
export class InMemorySpillStore implements SpillStore {
  readonly durability: SpillDurability = 'process'
  readonly #policy: SpillPolicy
  readonly #clock: () => Date
  readonly #random: (size: number) => Buffer
  readonly #byLocator = new Map<string, Entry>()
  /** Plain locator by idempotency key: a fixture, in one process. A shared adapter derives it. */
  readonly #byKey = new Map<string, string>()

  constructor(options: InMemorySpillStoreOptions = {}) {
    this.#policy = resolveSpillPolicy(options.policy)
    this.#clock = options.clock ?? (() => new Date())
    this.#random = options.random ?? randomBytes
  }

  async put(input: SpillPutInput): Promise<SpillReceipt> {
    const bytes = utf8Bytes(input.content)
    if (bytes > this.#policy.maxStoredBytes) {
      throw new SpillTooLarge('Spill content exceeds the stored size limit')
    }
    const sha256 = sha256Hex(input.content)
    const key = JSON.stringify([
      input.tenantId,
      input.sessionId,
      input.operationKey,
      sha256
    ])
    let existing = this.#byKey.get(key)
    if (
      existing !== undefined &&
      Date.parse(
        (this.#byLocator.get(hashLocator(existing)) as Entry).expiresAt
      ) <= this.#clock().getTime()
    ) {
      // an expired copy still waiting for the sweep is replaced, never revived
      this.#byLocator.delete(hashLocator(existing))
      this.#byKey.delete(key)
      existing = undefined
    }
    if (existing !== undefined) {
      // I6: the same write returns the same locator and keeps the original expiry
      const entry = this.#byLocator.get(hashLocator(existing)) as Entry
      return {
        locator: existing,
        bytes,
        sha256,
        createdAt: entry.createdAt,
        expiresAt: entry.expiresAt
      }
    }
    const now = this.#clock()
    // SPEC 0293 I5: live objects only; an expired one no longer takes room
    let sessionObjects = 0
    let tenantBytes = 0
    for (const other of this.#byLocator.values()) {
      if (
        other.tenantId !== input.tenantId ||
        Date.parse(other.expiresAt) <= now.getTime()
      ) {
        continue
      }
      tenantBytes += other.content.length
      if (other.sessionId === input.sessionId) sessionObjects += 1
    }
    if (
      sessionObjects >= this.#policy.maxObjectsPerSession ||
      tenantBytes + bytes > this.#policy.maxBytesPerTenant
    ) {
      throw new SpillQuotaExceeded('Spill quota exceeded')
    }
    const locator = `spill_${this.#random(16).toString('base64url')}`
    const entry: Entry = {
      tenantId: input.tenantId,
      sessionId: input.sessionId,
      key,
      content: Buffer.from(input.content, 'utf8'),
      sha256,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.#policy.ttlMs).toISOString()
    }
    this.#byLocator.set(hashLocator(locator), entry)
    this.#byKey.set(key, locator)
    return {
      locator,
      bytes,
      sha256,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt
    }
  }

  async read(input: SpillReadInput): Promise<SpillSlice> {
    const entry = this.#byLocator.get(hashLocator(input.locator))
    if (
      !entry ||
      entry.tenantId !== input.tenantId ||
      entry.sessionId !== input.sessionId
    ) {
      throw new SpillNotFound('Spill object not found')
    }
    if (Date.parse(entry.expiresAt) <= this.#clock().getTime()) {
      throw new SpillExpired('Spill object expired')
    }
    const total = entry.content.length
    const length = Math.min(input.length, this.#policy.readMaxBytes)
    const window = entry.content.subarray(
      input.offset,
      input.offset + length + 4
    )
    const aligned = alignUtf8Slice(window, length)
    const offset = input.offset + aligned.skippedBytes
    return {
      text: aligned.text,
      offset,
      skippedBytes: aligned.skippedBytes,
      bytesRead: aligned.bytesRead,
      totalBytes: total,
      eof: offset + aligned.bytesRead >= total
    }
  }

  async purgeSession(input: SpillPurgeInput): Promise<number> {
    let removed = 0
    for (const [hash, entry] of this.#byLocator) {
      if (
        entry.tenantId === input.tenantId &&
        entry.sessionId === input.sessionId
      ) {
        this.#byLocator.delete(hash)
        this.#byKey.delete(entry.key)
        removed += 1
      }
    }
    return removed
  }
}
