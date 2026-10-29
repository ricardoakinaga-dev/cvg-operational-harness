import type { DatabaseState } from './schema.ts'

export function createInMemoryState(): DatabaseState {
  return {
    conversations: [],
    messages: [],
    sessions: [],
    agentRuns: [],
    toolCalls: [],
    approvals: [],
    tasks: [],
    auditEvents: [],
    auditEvidenceCheckpoints: [],
    idempotency: [],
    outbox: [],
    outboxAttempts: [],
    outboxEffects: [],
    ownerDrafts: [],
    patientDrafts: [],
    appointmentDrafts: [],
    apiCreationReceipts: []
  }
}

export class InMemoryDatabase {
  #state: DatabaseState

  constructor(state: DatabaseState = createInMemoryState()) {
    this.#state = state
  }

  /** Live state; repositories resolve it on every access (SPEC 0257 §5). */
  get state(): DatabaseState {
    return this.#state
  }

  /**
   * SPEC 0257 §5 — publishes a detached state with ONE pointer assignment.
   * `expected` is the live state captured before the synchronous critical
   * section; the publication aborts (nothing is lost, nothing is published)
   * when another writer replaced the pointer or any collection that the
   * operation read, so a concurrent mutation is never overwritten.
   */
  publish(
    expected: DatabaseState,
    expectedCollections: Readonly<Partial<DatabaseState>>,
    next: DatabaseState
  ): boolean {
    if (this.#state !== expected) return false
    for (const [name, collection] of Object.entries(expectedCollections)) {
      if (expected[name as keyof DatabaseState] !== collection) return false
    }
    this.#state = next
    return true
  }
}
