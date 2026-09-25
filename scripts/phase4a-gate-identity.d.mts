export interface GateIdentityVerdict {
  ok: boolean
  failures: string[]
  handoffDigests: string[]
  gateDigests: string[]
  shared: string[]
  anchor: string
}

export function extractCandidateDigests(text: string): string[]

export function checkGateIdentity(args: {
  handoff: string
  gateValidation: string
  anchor: string
}): GateIdentityVerdict
