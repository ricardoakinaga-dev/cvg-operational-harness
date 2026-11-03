/**
 * SPEC 0225 f0: ONLY the three strict-JSON types that complete-json.ts needs,
 * copied verbatim from packages/contracts/src/complete-tool-context.ts @ 2f0cc11f7
 * (SPEC 0224 BUILD). The rest of that file (checkpoint, decision admission) is
 * K03b and is NOT integrated; human-decisions-17 grants complete-json.ts only.
 */
export type CompleteJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CompleteJsonValue[]
  | { readonly [key: string]: CompleteJsonValue }

export interface CompleteJsonLimits {
  readonly maxBytes?: number
  readonly maxDepth?: number
  readonly maxNodes?: number
}

export type CompleteJsonErrorCode =
  | 'INVALID_JSON'
  | 'RESULT_TOO_LARGE'
  | 'RESULT_COMPLEXITY'
