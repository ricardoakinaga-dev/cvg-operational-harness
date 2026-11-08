// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConversationsPanel } from './index.tsx'

describe('ConversationsPanel', () => {
  it('lists conversations and emits selection events', () => {
    const onSelectConversation = vi.fn()
    render(
      <ConversationsPanel
        conversations={[
          {
            id: 'conv_1',
            channel: 'whatsapp',
            senderRef: 'fixture-sender',
            status: 'active',
            openSessionId: 'sess_1',
            lastMessageBody: 'Mensagem'
          }
        ]}
        messages={[]}
        onSelectConversation={onSelectConversation}
        selectedConversationId={null}
      />
    )

    fireEvent.click(screen.getByText('fixture-sender'))

    expect(screen.getByText('whatsapp / active')).toBeTruthy()
    expect(onSelectConversation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'conv_1' })
    )
  })
})
