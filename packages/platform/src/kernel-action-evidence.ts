/**
 * SPEC 0317 G2 rule 3: proof that the kernel concluded a permitted action. Only
 * objects issued here count, so a look-alike from a model, a source, a template
 * or a request body proves nothing. Deliberately kept out of the package index:
 * issuing evidence is a kernel act. It enables no appointment, medical record
 * or payment action, and the output boundary rejects those claims regardless.
 */
export interface KernelActionBinding {
  readonly operation: string
  readonly recipient: string
  readonly version: string
}

export interface KernelActionEvidence extends KernelActionBinding {
  readonly result: 'succeeded' | 'failed'
}

const issued = new WeakSet<object>()

export function issueKernelActionEvidence(
  fields: KernelActionEvidence
): KernelActionEvidence {
  const evidence = Object.freeze({ ...fields })
  issued.add(evidence)
  return evidence
}

export function matchesKernelActionEvidence(
  evidence: unknown,
  expected: KernelActionBinding
): boolean {
  if (typeof evidence !== 'object' || evidence === null) return false
  if (!issued.has(evidence)) return false
  const proof = evidence as KernelActionEvidence
  return (
    proof.result === 'succeeded' &&
    proof.operation === expected.operation &&
    proof.recipient === expected.recipient &&
    proof.version === expected.version
  )
}
