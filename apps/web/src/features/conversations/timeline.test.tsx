// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ConversationsPanel } from './index.tsx'

describe('conversation timeline', () => {
  it('renders selected conversation messages', () => {
    render(
      <ConversationsPanel
        conversations={[
          {
            id: 'conv_1',
            channel: 'whatsapp',
            senderRef: 'fixture-sender',
            status: 'active',
            openSessionId: 'sess_1',
            lastMessageBody: 'Preview'
          }
        ]}
        messages={[{ id: 'msg_1', direction: 'inbound', body: 'Mensagem' }]}
        onSelectConversation={() => undefined}
        selectedConversationId="conv_1"
      />
    )

    expect(screen.getByLabelText('Timeline selecionada')).toBeTruthy()
    expect(screen.getByText('Mensagem')).toBeTruthy()
  })
})
