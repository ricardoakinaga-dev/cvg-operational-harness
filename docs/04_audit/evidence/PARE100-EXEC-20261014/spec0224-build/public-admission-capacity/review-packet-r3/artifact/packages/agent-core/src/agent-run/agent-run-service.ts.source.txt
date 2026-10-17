import { createDomainId } from '@cvg/shared'

export function createAgentRun(sessionId: string) {
  const now = new Date()
  return {
    id: createDomainId('run'),
    sessionId,
    status: 'started' as const,
    createdAt: now,
    updatedAt: now
  }
}
