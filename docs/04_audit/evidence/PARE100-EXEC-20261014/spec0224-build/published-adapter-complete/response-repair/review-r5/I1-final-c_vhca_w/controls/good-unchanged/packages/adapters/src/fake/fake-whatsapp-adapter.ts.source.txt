import type {
  ChannelAdapter,
  NormalizedInboundMessage
} from '../channel-adapter.ts'

export class FakeWhatsAppAdapter implements ChannelAdapter {
  normalize(input: unknown): NormalizedInboundMessage {
    const value = input as {
      id: string
      from: string
      text: string
      timestamp?: string
    }
    return {
      channel: 'whatsapp',
      externalMessageId: value.id,
      senderRef: value.from,
      body: value.text,
      receivedAt: value.timestamp ? new Date(value.timestamp) : new Date()
    }
  }

  async sendMessage(input: {
    recipientRef: string
    body: string
  }): Promise<{ externalMessageId: string }> {
    void input
    return { externalMessageId: `fake_${Date.now()}` }
  }
}
