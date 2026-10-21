/**
 * SPEC0176 — synthetic in-memory case state shared by the conversation
 * producer and `InMemoryCaseAuthority`. Kept in its own module so the
 * conversation repository can register a root in its creation unit without
 * importing the authority (no module cycle).
 */
import { randomUUID } from 'node:crypto'
import type { TenantId } from '@cvg/platform'
import type { InMemoryDatabase } from './db.ts'

export type MemoryCaseKind =
  | 'core_conversation'
  | 'harness_conversation'
  | 'independent_execution'

export interface MemoryCasePrincipal {
  readonly tenantId: TenantId
  readonly operatorId: string
  readonly role: 'Operator' | 'Approver' | 'Supervisor' | 'Admin'
  readonly active: boolean
  readonly revision: number
  readonly identitySource: 'verified_adapter' | 'synthetic_fixture'
  readonly authorityVersion: string
  readonly updatedAt: string
}

export interface MemoryRoot {
  readonly tenantId: TenantId
  readonly caseId: string
  readonly kind: MemoryCaseKind
  readonly resourceId: string
  readonly createdAt: Date
}

export interface MemoryAssignment {
  readonly tenantId: TenantId
  readonly caseId: string
  readonly operatorId: string
  readonly status: 'ACTIVE' | 'REVOKED'
  readonly revision: number
  readonly changedBy: string
  readonly changedAt: Date
}

export interface MemoryExecutionLink {
  readonly tenantId: TenantId
  readonly executionId: string
  readonly caseId: string
  readonly coreSessionId: string | null
}

export interface MemoryAuditLink {
  readonly tenantId: TenantId
  readonly auditEventId: string
  readonly caseId: string
  readonly coreSessionId: string
}

export interface MemoryCaseState {
  principals: Map<string, MemoryCasePrincipal>
  roots: MemoryRoot[]
  assignments: Map<string, MemoryAssignment>
  executionLinks: Map<string, MemoryExecutionLink>
  auditLinks: Map<string, MemoryAuditLink>
}

const memoryStates = new WeakMap<InMemoryDatabase, MemoryCaseState>()

export function memoryCaseState(db: InMemoryDatabase): MemoryCaseState {
  let state = memoryStates.get(db)
  if (!state) {
    state = {
      principals: new Map(),
      roots: [],
      assignments: new Map(),
      executionLinks: new Map(),
      auditLinks: new Map()
    }
    memoryStates.set(db, state)
  }
  return state
}

export function memoryCaseKey(...parts: string[]): string {
  return parts.join('\u0000')
}

export function createCaseId(): string {
  return randomUUID()
}

/**
 * Registers the core conversation root in the same synchronous unit that
 * creates the conversation. Idempotent per (tenant, conversation).
 */
export function registerMemoryCoreConversationRoot(
  db: InMemoryDatabase,
  tenantId: TenantId,
  conversationId: string,
  createdAt: Date
): string {
  const state = memoryCaseState(db)
  const existing = state.roots.find(
    (root) =>
      root.tenantId === tenantId &&
      root.kind === 'core_conversation' &&
      root.resourceId === conversationId
  )
  if (existing) return existing.caseId
  const root: MemoryRoot = {
    tenantId,
    caseId: createCaseId(),
    kind: 'core_conversation',
    resourceId: conversationId,
    createdAt
  }
  state.roots = [...state.roots, root]
  return root.caseId
}

/** Rollback helper for the composite in-memory inbound unit. */
export function snapshotMemoryCaseRoots(db: InMemoryDatabase): () => void {
  const state = memoryCaseState(db)
  const roots = state.roots
  return () => {
    state.roots = roots
  }
}
