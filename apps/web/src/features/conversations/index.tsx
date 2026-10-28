import type { PageControlsInfo } from '../page-controls.tsx'

export interface ConversationsPanelProps {
  conversations: Array<{
    id: string
    channel: string
    senderRef: string
    status: string
    openSessionId: string | null
    lastMessageBody: string | null
  }>
  selectedConversationId: string | null
  messages: Array<{ id: string; direction: string; body: string }>
  error?: string | null
  isLoading?: boolean
  isTimelineLoading?: boolean
  /** SPEC 0269 — the list is paged; more conversations may still be unloaded. */
  pageInfo?: PageControlsInfo | null
  isLoadingMore?: boolean
  onLoadMore?: () => void
  onSelectConversation: (
    conversation: ConversationsPanelProps['conversations'][number]
  ) => void
}

export function ConversationsPanel({
  conversations,
  selectedConversationId,
  messages,
  error = null,
  isLoading = false,
  isTimelineLoading = false,
  pageInfo = null,
  isLoadingMore = false,
  onLoadMore,
  onSelectConversation
}: ConversationsPanelProps) {
  return (
    <section className="panel" aria-labelledby="conversations-title">
      <header className="panelHeader">
        <h2 id="conversations-title">Conversas</h2>
        <span className="counter">{conversations.length}</span>
      </header>
      <div className="list">
        {isLoading ? (
          <p className="state" role="status">
            Carregando...
          </p>
        ) : null}
        {!isLoading && error ? (
          <p className="state stateError" role="alert">
            {error}
          </p>
        ) : null}
        {!isLoading && !error && conversations.length === 0 ? (
          <p className="state">Nenhuma conversa carregada.</p>
        ) : null}
        {!isLoading && !error
          ? conversations.map((conversation) => (
              <button
                className={
                  conversation.id === selectedConversationId
                    ? 'row rowButton rowSelected'
                    : 'row rowButton'
                }
                key={conversation.id}
                type="button"
                aria-pressed={conversation.id === selectedConversationId}
                onClick={() => onSelectConversation(conversation)}
              >
                <strong>{conversation.senderRef}</strong>
                <span>
                  {conversation.channel} / {conversation.status}
                </span>
                <span>{conversation.lastMessageBody ?? 'Sem mensagens'}</span>
              </button>
            ))
          : null}
        {!isLoading && !error && pageInfo?.hasNextPage ? (
          <nav className="actions" aria-label="Paginação de conversas">
            <span>
              {conversations.length} de {pageInfo.total}
            </span>
            <button
              type="button"
              aria-label="Carregar mais conversas"
              disabled={isLoadingMore}
              onClick={() => onLoadMore?.()}
            >
              Carregar mais
            </button>
          </nav>
        ) : null}
        {!isLoading && !error && conversations.length > 0 ? (
          <div className="timeline" aria-label="Timeline selecionada">
            {isTimelineLoading ? (
              <p className="state" role="status">
                Carregando...
              </p>
            ) : null}
            {!isTimelineLoading && messages.length === 0 ? (
              <p className="state">Nenhuma mensagem na conversa.</p>
            ) : null}
            {!isTimelineLoading
              ? messages.map((message) => (
                  <article className="row rowCompact" key={message.id}>
                    <strong>{message.direction}</strong>
                    <span>{message.body}</span>
                  </article>
                ))
              : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
