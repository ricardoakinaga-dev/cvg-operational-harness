export interface ReplyProjection {
  readonly text: string
  readonly modelCalls: number
  readonly toolCalls: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly effects: readonly unknown[]
}
export function compareReplyProjections(
  reference: unknown,
  cvg: unknown
): {
  status: 'MATCH_REPLY_PROJECTION'
  fields: string[]
  fullParity: 'NOT_VERIFIED'
}
