import { z } from 'zod'

export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional()
})

export type PaginationQuery = z.infer<typeof PaginationQuerySchema>

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}
