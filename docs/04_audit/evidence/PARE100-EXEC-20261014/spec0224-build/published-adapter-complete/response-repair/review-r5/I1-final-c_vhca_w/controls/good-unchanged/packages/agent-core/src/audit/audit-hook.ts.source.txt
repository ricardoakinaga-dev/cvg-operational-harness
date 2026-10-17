import type { AuditRepository } from '@cvg/persistence'
import type { AuditEventRecord } from '@cvg/persistence'

export function appendAuditEvent(
  repository: AuditRepository,
  input: Omit<AuditEventRecord, 'id' | 'createdAt'>
) {
  return repository.append(input)
}
