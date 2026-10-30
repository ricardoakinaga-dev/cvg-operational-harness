import type { SpillPolicy, SpillStore } from '@cvg/harness-contracts'

/** Host-provided spill composition (SPEC 0293 §3.1-§3.2, I14). */
export interface SpillComposition {
  /** Absent, or not durable across processes: results are shown as `armazenado=não`. */
  readonly store?: SpillStore
  readonly policy?: Partial<SpillPolicy>
  /** True only in a test composition that accepts a store living in one process. */
  readonly allowProcessLocal?: boolean
  /** Classification stored with the object; a tool does not declare one yet. */
  readonly classificationOf?: (toolId: string) => string
}

/** Conservative default while `ToolDescriptor` has no classification (SPEC 0293 D7). */
export const DEFAULT_SPILL_CLASSIFICATION = 'CONFIDENTIAL'
