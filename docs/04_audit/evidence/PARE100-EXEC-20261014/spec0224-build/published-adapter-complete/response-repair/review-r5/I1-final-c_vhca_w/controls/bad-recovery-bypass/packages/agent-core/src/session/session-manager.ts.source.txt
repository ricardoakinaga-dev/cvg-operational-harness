import type { SessionRecord } from '@cvg/persistence'

export function isSessionOpen(session: SessionRecord): boolean {
  return session.status !== 'closed'
}
