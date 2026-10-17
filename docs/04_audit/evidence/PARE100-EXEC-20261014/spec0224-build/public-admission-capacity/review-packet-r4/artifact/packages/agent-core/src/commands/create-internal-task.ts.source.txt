import { CreateInternalTaskSchema } from '@cvg/shared'
import type { TaskRecord } from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'

type Awaitable<T> = T | Promise<T>

export interface InternalTaskRepository {
  create(
    input: {
      sessionId: string
      title: string
      description: string
      priority: 'low' | 'medium' | 'high' | 'urgent'
      source: string
      idempotencyKey: string
    },
    tenantId?: TenantId
  ): Awaitable<TaskRecord>
}

export async function createInternalTask(
  deps: { tasks: InternalTaskRepository },
  rawInput: unknown,
  tenantId?: TenantId
) {
  const input = CreateInternalTaskSchema.parse(rawInput)
  return deps.tasks.create(input, tenantId)
}
