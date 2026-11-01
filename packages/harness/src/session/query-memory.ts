import type {
  SessionDirectory,
  SessionDirectoryRow
} from '@cvg/harness-contracts'

/**
 * The directory of SPEC 0295 over rows held in memory, for tests and local composition:
 * descending key order, `size` rows below `before`, no filter.
 */
export class InMemorySessionDirectory implements SessionDirectory {
  readonly #rows: readonly SessionDirectoryRow[]
  constructor(rows: readonly SessionDirectoryRow[]) {
    this.#rows = [...rows].sort((a, b) => b.key - a.key)
  }
  async window(input: {
    readonly before?: number
    readonly size: number
    readonly signal?: AbortSignal
  }): Promise<readonly SessionDirectoryRow[]> {
    const before = input.before
    return this.#rows
      .filter((row) => before === undefined || row.key < before)
      .slice(0, input.size)
  }
}
