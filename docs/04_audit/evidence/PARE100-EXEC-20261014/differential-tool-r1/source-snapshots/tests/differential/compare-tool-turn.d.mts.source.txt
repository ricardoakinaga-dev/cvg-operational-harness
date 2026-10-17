export function measureToolTurn(
  reference: unknown,
  cvg: unknown,
  input: unknown
): {
  status: 'MEASURED_BOUNDED_NATIVE_TOOL_TURN'
  fullParity: 'NOT_VERIFIED'
  sdkJourney: 'NOT_COVERED_SINGLE_PASS_GAP_RETAINED'
  commonProjection: unknown
  nativeDifferences: unknown
  normalizedPaths: readonly string[]
  witnessStatus: string
}
