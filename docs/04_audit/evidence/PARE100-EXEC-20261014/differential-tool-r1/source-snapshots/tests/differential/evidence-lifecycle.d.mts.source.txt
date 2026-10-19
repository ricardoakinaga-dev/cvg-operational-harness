export function createDifferentialEvidence(
  kind: 'reply' | 'failure' | 'tool'
): {
  directory: string
  failed(): void
  finish(): void
}
