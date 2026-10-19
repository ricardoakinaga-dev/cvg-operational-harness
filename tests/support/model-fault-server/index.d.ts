export type Scenario =
  | 'ok-json'
  | 'rate-limit'
  | 'timeout'
  | 'disconnect'
  | 'invalid-json'
  | 'chunked-json'
  | 'synthetic-sse'
export interface FaultPlan {
  readonly version: 1
  readonly suiteId: string
  readonly caseId: string
  readonly scenario: Scenario
  readonly maxRequests: number
  readonly chunkDelayMs: number
}
export interface SyntheticRecording {
  readonly version: 1
  readonly suiteId: string
  readonly caseId: string
  readonly synthetic: true
  readonly planSha256: string
  readonly requestSha256: string
  readonly status: 200 | 429
  readonly headers: Readonly<{
    'content-type': 'application/json' | 'text/event-stream'
  }>
  readonly chunks: readonly Readonly<{
    ordinal: number
    delayMs: number
    base64: string
  }>[]
  readonly termination: 'complete' | 'disconnect' | 'timeout'
  readonly digest: string
}
export interface SyntheticRequest {
  readonly model: 'cvg-synthetic-model-v1'
  readonly messages: readonly [
    { readonly role: 'user'; readonly content: string }
  ]
  readonly temperature: 0
  readonly max_tokens: 32
  readonly stream: false
}
export interface ModelFaultServer {
  readonly url: string
  requestHistory(): readonly Readonly<{
    ordinal: number
    requestSha256: string
    status: number
    termination: 'complete' | 'disconnect' | 'timeout'
  }>[]
  recording(): SyntheticRecording
  state(): Readonly<{
    mode: 'replay' | 'record' | 'refresh'
    listening: boolean
    closed: boolean
    sockets: number
    timers: number
    active: number
    requests: number
    rejected: boolean
    failure: string | null
  }>
  close(): Promise<void>
}
export const SCENARIOS: readonly Scenario[]
export const CREDENTIAL_NAMES: readonly string[]
export const LIMITS: Readonly<{
  requests: 32
  requestBytes: 65536
  responseBytes: 262144
  chunks: 32
  stringBytes: 4096
  chunkDelayMs: 100
  lifetimeMs: 5000
}>
export function expectedSyntheticRequest(plan: FaultPlan): SyntheticRequest
export function assertSyntheticEnvironment(snapshot: unknown): void
export function preservePrimaryError(
  primary: unknown,
  cleanup: unknown
): unknown
export function createModelFaultServer(
  plan: FaultPlan,
  options?: {
    mode?: 'replay' | 'record' | 'refresh'
    recording?: SyntheticRecording | null
  }
): Promise<ModelFaultServer>
export function persistSyntheticRecording(
  recording: SyntheticRecording,
  options: {
    evidenceRoot: string
    path: string
    mode: 'record' | 'refresh'
    previousDigest: string | null
  }
): Promise<Readonly<{ path: string; digest: string }>>
