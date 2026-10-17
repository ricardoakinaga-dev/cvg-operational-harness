import type { MessageRecord, SessionRecord } from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'

type Awaitable<T> = T | Promise<T>

export interface ConversationTimelineRepository {
  timeline(
    tenantId: TenantId,
    conversationId: string
  ): Awaitable<{ messages: MessageRecord[]; sessions: SessionRecord[] }>
}

export async function getConversationTimeline(
  repository: ConversationTimelineRepository,
  tenantId: TenantId,
  conversationId: string
) {
  return repository.timeline(tenantId, conversationId)
}
