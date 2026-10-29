/**
 * Reader for bubblewrap's `--json-status-fd` documents (SPEC 0286 I6). The fd is closed inside
 * the sandbox, so only bubblewrap writes here; payload stdout/stderr never feed this parser.
 */
export const STATUS_MAX_BYTES = 4096

export interface StatusSnapshot {
  readonly childPid?: number
  readonly pidNamespace?: number
  readonly exitCode?: number
  /** Malformed, oversized or contradictory status: treated as a containment fault. */
  readonly invalid: boolean
}

export class StatusChannel {
  #buffer = ''
  #bytes = 0
  #childPid: number | undefined
  #pidNamespace: number | undefined
  #exitCode: number | undefined
  #invalid = false

  feed(chunk: Uint8Array): void {
    if (this.#invalid) return
    this.#bytes += chunk.length
    if (this.#bytes > STATUS_MAX_BYTES) {
      this.#invalid = true
      return
    }
    this.#buffer += Buffer.from(chunk).toString('utf8')
    this.#drain()
  }

  /** Frames top-level JSON objects by brace depth; documents may span lines. */
  #drain(): void {
    for (;;) {
      const start = this.#buffer.search(/\S/)
      if (start < 0) {
        this.#buffer = ''
        return
      }
      if (this.#buffer[start] !== '{') {
        this.#invalid = true
        return
      }
      let depth = 0
      let inString = false
      let escaped = false
      let end = -1
      for (let i = start; i < this.#buffer.length; i++) {
        const c = this.#buffer[i]!
        if (inString) {
          if (escaped) escaped = false
          else if (c === '\\') escaped = true
          else if (c === '"') inString = false
        } else if (c === '"') inString = true
        else if (c === '{') depth++
        else if (c === '}' && --depth === 0) {
          end = i
          break
        }
      }
      if (end < 0) {
        this.#buffer = this.#buffer.slice(start)
        return
      }
      this.#accept(this.#buffer.slice(start, end + 1))
      this.#buffer = this.#buffer.slice(end + 1)
    }
  }

  #accept(text: string): void {
    let doc: unknown
    try {
      doc = JSON.parse(text)
    } catch {
      this.#invalid = true
      return
    }
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
      this.#invalid = true
      return
    }
    const record = doc as Record<string, unknown>
    const positive = (v: unknown): number | undefined =>
      typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : undefined
    if ('child-pid' in record) {
      const pid = positive(record['child-pid'])
      const ns = positive(record['pid-namespace'])
      // The first document names the child once; a second one would rebind the observation.
      if (pid === undefined || ns === undefined || this.#childPid !== undefined)
        this.#invalid = true
      else {
        this.#childPid = pid
        this.#pidNamespace = ns
      }
    }
    if ('exit-code' in record) {
      const code = record['exit-code']
      if (
        typeof code !== 'number' ||
        !Number.isInteger(code) ||
        code < 0 ||
        code > 255 ||
        this.#exitCode !== undefined
      )
        this.#invalid = true
      else this.#exitCode = code
    }
  }

  snapshot(): StatusSnapshot {
    return {
      ...(this.#childPid !== undefined ? { childPid: this.#childPid } : {}),
      ...(this.#pidNamespace !== undefined
        ? { pidNamespace: this.#pidNamespace }
        : {}),
      ...(this.#exitCode !== undefined ? { exitCode: this.#exitCode } : {}),
      invalid: this.#invalid
    }
  }
}
