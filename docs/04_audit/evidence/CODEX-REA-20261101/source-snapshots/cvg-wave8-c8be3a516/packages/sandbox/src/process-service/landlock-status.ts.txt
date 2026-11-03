import { Buffer } from 'node:buffer'
import { LANDLOCK_MIN_ABI } from '../capabilities.ts'
import { LANDLOCK_RULESET_RIGHTS } from '../process-profile.ts'
import type { ProcessLandlockReport } from './types.ts'

/**
 * Reader for the Landlock helper's private status channel (SPEC 0288 §4). The reviewed helper
 * writes exactly one newline-terminated JSON object and closes the fd before it executes the
 * payload, so the payload never writes here. Anything but one well-formed proof that handles
 * every right the ruleset names is "not applied".
 */
export const LANDLOCK_STATUS_MAX_BYTES = 512
const HELPER_ERROR = /^[a-z_]{1,40}$/

export class LandlockStatusChannel {
  #text = ''
  #bytes = 0
  #oversized = false

  feed(chunk: Uint8Array): void {
    if (this.#oversized) return
    this.#bytes += chunk.length
    if (this.#bytes > LANDLOCK_STATUS_MAX_BYTES) {
      this.#oversized = true
      return
    }
    this.#text += Buffer.from(chunk).toString('utf8')
  }

  /** The helper's one document is complete (or can no longer become a proof). */
  settled(): boolean {
    return this.#oversized || this.#text.includes('\n')
  }

  report(): ProcessLandlockReport {
    if (this.#oversized) return { applied: false, error: 'status_oversized' }
    const text = this.#text.trim()
    if (text.length === 0) return { applied: false, error: 'status_missing' }
    let doc: unknown
    try {
      doc = JSON.parse(text)
    } catch {
      return { applied: false, error: 'status_malformed' }
    }
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc))
      return { applied: false, error: 'status_malformed' }
    const record = doc as Record<string, unknown>
    if (record.applied === false)
      return {
        applied: false,
        error:
          typeof record.error === 'string' && HELPER_ERROR.test(record.error)
            ? record.error
            : 'helper_refused'
      }
    const count = (v: unknown): v is number =>
      typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
    const { applied, abi, handledFs, handledNet, scoped } = record
    if (
      applied !== true ||
      Object.keys(record).length !== 5 ||
      !count(abi) ||
      !count(handledFs) ||
      !count(handledNet) ||
      !count(scoped) ||
      handledFs === 0
    )
      return { applied: false, error: 'status_malformed' }
    // The helper enforces the floor itself; a proof below it is still not Landlock (D-B).
    if (abi < LANDLOCK_MIN_ABI) return { applied: false, error: 'abi_too_low' }
    // A right the ruleset grants but the ruleset does not handle would be unrestricted.
    if ((handledFs & LANDLOCK_RULESET_RIGHTS) !== LANDLOCK_RULESET_RIGHTS)
      return { applied: false, error: 'rights_not_handled' }
    return { applied: true, abi, handledFs, handledNet, scoped }
  }
}
