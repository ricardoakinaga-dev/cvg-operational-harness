import type { Channel } from '@cvg/shared'

export interface NormalizedInboundMessage {
  channel: Channel
  externalMessageId: string
  senderRef: string
  body: string
  receivedAt: Date
}

export interface ChannelAdapter {
  normalize(input: unknown): NormalizedInboundMessage
  sendMessage(input: {
    recipientRef: string
    body: string
  }): Promise<{ externalMessageId: string }>
}
