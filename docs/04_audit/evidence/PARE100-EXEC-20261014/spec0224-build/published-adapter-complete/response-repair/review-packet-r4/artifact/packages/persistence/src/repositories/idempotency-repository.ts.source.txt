import type { InMemoryDatabase } from '../db.ts'

export class IdempotencyRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  find(key: string): string | null {
    return (
      this.db.state.idempotency.find((record) => record.key === key)
        ?.resourceId ?? null
    )
  }

  save(key: string, resourceId: string): void {
    if (this.find(key)) return
    this.db.state.idempotency = [
      ...this.db.state.idempotency,
      { key, resourceId, createdAt: new Date() }
    ]
  }
}
