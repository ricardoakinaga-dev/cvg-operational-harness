/**
 * SPEC 0257 §7 — registry of logical operations. A creation request that
 * must be retried (timeout, network error, 5xx, reload, double click) keeps ONE
 * `Idempotency-Key`: the key is created BEFORE the first fetch and written to
 * `sessionStorage`, so a reload does not turn an uncertain request into a new
 * approval. Only idempotency metadata is stored: no token, cookie, summary or
 * clinical body.
 */
const STORAGE_PREFIX = 'cvg.logical-operation.v1:'

export class LogicalOperationStorageError extends Error {
  constructor() {
    super('Operation registry is unavailable')
    this.name = 'LogicalOperationStorageError'
  }
}

export interface LogicalOperationScope {
  tenantId?: string | undefined
  operatorId: string
  sessionId: string
  action: string
}

export interface LogicalOperation {
  key: string
  status: 'pending' | 'resolved'
  resourceId?: string
}

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function storageKey(scope: LogicalOperationScope): string {
  return (
    STORAGE_PREFIX +
    JSON.stringify([
      scope.tenantId ?? '',
      scope.operatorId,
      scope.sessionId,
      scope.action
    ])
  )
}

function defaultStorage(): StorageLike {
  try {
    const storage = globalThis.sessionStorage
    if (!storage) throw new LogicalOperationStorageError()
    return storage
  } catch {
    throw new LogicalOperationStorageError()
  }
}

function newKey(): string {
  // 36 characters of [0-9a-f-]: inside the 8-200 `[A-Za-z0-9._:-]` rule.
  return `op-${globalThis.crypto.randomUUID()}`
}

function read(storage: StorageLike, scope: LogicalOperationScope) {
  try {
    const raw = storage.getItem(storageKey(scope))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<LogicalOperation>
    if (
      typeof parsed.key === 'string' &&
      (parsed.status === 'pending' || parsed.status === 'resolved')
    ) {
      return parsed as LogicalOperation
    }
    return null
  } catch (error) {
    if (error instanceof LogicalOperationStorageError) throw error
    throw new LogicalOperationStorageError()
  }
}

function write(
  storage: StorageLike,
  scope: LogicalOperationScope,
  operation: LogicalOperation
): void {
  try {
    storage.setItem(storageKey(scope), JSON.stringify(operation))
    // Read back: a quota or blocked-storage failure must stop the dispatch.
    const back = storage.getItem(storageKey(scope))
    if (!back || (JSON.parse(back) as LogicalOperation).key !== operation.key) {
      throw new LogicalOperationStorageError()
    }
  } catch {
    throw new LogicalOperationStorageError()
  }
}

/**
 * The operation to send now. An unresolved one keeps its key (a retry); after
 * a known resolution an explicit new request gets a new key. Storage failure
 * throws, so the caller never dispatches with a volatile key.
 */
export function beginLogicalOperation(
  scope: LogicalOperationScope,
  storage: StorageLike = defaultStorage()
): LogicalOperation {
  const existing = read(storage, scope)
  if (existing && existing.status === 'pending') return existing
  const created: LogicalOperation = { key: newKey(), status: 'pending' }
  write(storage, scope, created)
  return created
}

/** A known resolution (the server answered 2xx): keep key and id, mark resolved. */
export function resolveLogicalOperation(
  scope: LogicalOperationScope,
  resourceId: string,
  storage: StorageLike = defaultStorage()
): void {
  const existing = read(storage, scope)
  if (!existing) return
  write(storage, scope, { key: existing.key, status: 'resolved', resourceId })
}
