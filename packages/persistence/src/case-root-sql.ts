/**
 * SPEC0176 — core case root insert used inside the PostgreSQL conversation
 * creation transaction. Dependency-free so the inbound producer does not
 * import the case authority module.
 */
import { randomUUID } from 'node:crypto'
import { DomainError } from '@cvg/shared'
import type { TenantId } from '@cvg/platform'
import type { PostgresQueryable } from './postgres.ts'

export async function insertCoreConversationRootInTransaction(
  client: PostgresQueryable,
  tenantId: TenantId,
  conversationId: string,
  createdAt: Date
): Promise<void> {
  await client.query(
    `INSERT INTO case_roots
       (tenant_id, case_id, kind, core_conversation_id, created_at)
     VALUES ($1, $2, 'core_conversation', $3, $4)`,
    [tenantId, randomUUID(), conversationId, createdAt]
  )
}

/** Idempotent core root for an existing conversation (FK-trusted lineage). */
export async function ensureCoreConversationRootInTransaction(
  client: PostgresQueryable,
  tenantId: TenantId,
  conversationId: string,
  now: Date
): Promise<string> {
  await client.query(
    `INSERT INTO case_roots
       (tenant_id, case_id, kind, core_conversation_id, created_at)
     VALUES ($1, $2, 'core_conversation', $3, $4)
     ON CONFLICT (tenant_id, core_conversation_id) DO NOTHING`,
    [tenantId, randomUUID(), conversationId, now]
  )
  const root = await client.query<{ case_id: string }>(
    `SELECT case_id FROM case_roots
      WHERE tenant_id = $1 AND core_conversation_id = $2`,
    [tenantId, conversationId]
  )
  if (root.rows.length !== 1) {
    throw new DomainError('configuration_error', 'Case root is ambiguous')
  }
  return root.rows[0]!.case_id
}

/**
 * Links an audit event to the persisted core session its producer operated
 * on, inside the producer's transaction. The session (and so the case) is
 * resolved from the database, never from the event payload; the 0029
 * lineage trigger re-checks the relationship.
 */
export async function linkAuditEventToCoreSessionInTransaction(
  client: PostgresQueryable,
  tenantId: TenantId,
  auditEventId: string,
  sessionId: string,
  now: Date
): Promise<void> {
  const session = await client.query<{ conversation_id: string }>(
    `SELECT s.conversation_id
       FROM sessions s
       JOIN conversations c
         ON c.id = s.conversation_id AND c.tenant_id = s.tenant_id
      WHERE s.tenant_id = $1 AND s.id = $2`,
    [tenantId, sessionId]
  )
  const conversationId = session.rows[0]?.conversation_id
  if (!conversationId || session.rows.length !== 1) {
    throw new DomainError('invalid_action', 'Audit session lineage is invalid')
  }
  const caseId = await ensureCoreConversationRootInTransaction(
    client,
    tenantId,
    conversationId,
    now
  )
  await client.query(
    `INSERT INTO case_audit_links
       (tenant_id, audit_event_id, case_id, core_session_id, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [tenantId, auditEventId, caseId, sessionId, now]
  )
}

/**
 * Worker-side variant (inbound completion). The worker role and preflight are
 * owned by apps/worker; when the 0029 lineage tables or their privileges are
 * absent for the current role, the event stays unlinked instead of aborting
 * the completion transaction. An unlinked event is visible only to the full
 * tenant audit reader (SPEC0176 §5), so this never widens a case read.
 */
export async function linkAuditEventToCoreSessionWhenAvailable(
  client: PostgresQueryable,
  tenantId: TenantId,
  auditEventId: string,
  sessionId: string,
  now: Date
): Promise<boolean> {
  const capability = await client.query<{ available: boolean | null }>(
    `SELECT COALESCE(
              has_table_privilege(to_regclass('case_audit_links'), 'INSERT')
          AND has_table_privilege(to_regclass('case_roots'), 'INSERT')
          AND has_table_privilege(to_regclass('case_roots'), 'SELECT'),
            false) AS available`
  )
  if (capability.rows[0]?.available !== true) return false
  await linkAuditEventToCoreSessionInTransaction(
    client,
    tenantId,
    auditEventId,
    sessionId,
    now
  )
  return true
}
