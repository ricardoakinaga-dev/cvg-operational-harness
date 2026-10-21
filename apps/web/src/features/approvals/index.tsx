import { useId } from 'react'
import { redactSensitiveText } from '@cvg/shared'
import { PageControls, type PageControlsInfo } from '../page-controls.tsx'

export interface ApprovalsPanelProps {
  approvals: Array<{
    id: string
    proposedAction: string
    riskLevel: string
    status: string
    /** Case (session) of the request; always sent by the API DTO. */
    sessionId?: string
    summary?: string
    createdAt?: string
  }>
  message?: string | null
  error?: string | null
  isLoading?: boolean
  actionId?: string | null
  canApproveReject?: boolean
  canAssumeHandoff?: boolean
  onApprove?: (approvalId: string) => void
  onReject?: (approvalId: string) => void
  onAssumeHandoff?: (approvalId: string) => void
  /** Cases whose conversation is loaded and can be opened from the row. */
  openableSessionIds?: readonly string[]
  onOpenCase?: (sessionId: string) => void
  pageInfo?: PageControlsInfo | null
  onPreviousPage?: () => void
  onNextPage?: () => void
}

function formatRequestedAt(createdAt: string | undefined): string | null {
  if (!createdAt) return null
  const timestamp = Date.parse(createdAt)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

export function ApprovalsPanel({
  approvals,
  message = null,
  error = null,
  isLoading = false,
  actionId = null,
  canApproveReject = false,
  canAssumeHandoff = false,
  onApprove,
  onReject,
  onAssumeHandoff,
  openableSessionIds = [],
  onOpenCase,
  pageInfo = null,
  onPreviousPage,
  onNextPage
}: ApprovalsPanelProps) {
  const idPrefix = useId()
  const pendingCount = approvals.filter(
    (approval) => approval.status === 'pending'
  ).length
  return (
    <section className="panel" aria-labelledby="approvals-title">
      <header className="panelHeader">
        <h2 id="approvals-title">Aprovacoes</h2>
        <span className="counter">{pageInfo?.total ?? pendingCount}</span>
      </header>
      <div className="list">
        {message ? <p role="status">{message}</p> : null}
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
        {!isLoading && !error && approvals.length === 0 ? (
          <p className="state">Nenhuma aprovacao pendente.</p>
        ) : null}
        {!isLoading && !error
          ? approvals.map((approval, index) => {
              const isPending = approval.status === 'pending'
              const isActing = actionId === approval.id
              const rowId = `${idPrefix}-approval-${index}`
              const actionLabelId = `${rowId}-action`
              const summaryId = `${rowId}-summary`
              const caseId = `${rowId}-case`
              const summary =
                typeof approval.summary === 'string' && approval.summary
                  ? redactSensitiveText(approval.summary)
                  : null
              const sessionId =
                typeof approval.sessionId === 'string' && approval.sessionId
                  ? approval.sessionId
                  : null
              const requestedAt = formatRequestedAt(approval.createdAt)
              const context = `${summaryId} ${caseId}`
              // SPEC0250 §3.6 (AUD0621 F22): each request shows and announces
              // its own summary and case before any decision.
              return (
                <article
                  className="row"
                  key={approval.id}
                  aria-labelledby={`${actionLabelId} ${caseId} ${summaryId}`}
                >
                  <strong id={actionLabelId}>{approval.proposedAction}</strong>
                  <span id={summaryId}>
                    {summary ? `Resumo: ${summary}` : 'Resumo não informado'}
                  </span>
                  <span id={caseId}>
                    {sessionId ? `Caso: ${sessionId}` : 'Caso não informado'}
                  </span>
                  {requestedAt ? (
                    <time dateTime={requestedAt}>{requestedAt}</time>
                  ) : null}
                  <span>
                    {approval.riskLevel} / {approval.status}
                  </span>
                  {sessionId &&
                  onOpenCase &&
                  openableSessionIds.includes(sessionId) ? (
                    <button
                      type="button"
                      aria-label={`Abrir caso ${sessionId}`}
                      onClick={() => onOpenCase(sessionId)}
                    >
                      Abrir caso
                    </button>
                  ) : null}
                  {isPending ? (
                    <div
                      className="actions"
                      aria-label={`Acoes ${approval.proposedAction}`}
                    >
                      <button
                        type="button"
                        aria-label={`Aprovar ${approval.proposedAction}`}
                        aria-describedby={context}
                        disabled={isActing || !canApproveReject}
                        onClick={() => onApprove?.(approval.id)}
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        aria-label={`Rejeitar ${approval.proposedAction}`}
                        aria-describedby={context}
                        disabled={isActing || !canApproveReject}
                        onClick={() => onReject?.(approval.id)}
                      >
                        Rejeitar
                      </button>
                      <button
                        type="button"
                        aria-label={`Assumir handoff ${approval.proposedAction}`}
                        aria-describedby={context}
                        disabled={isActing || !canAssumeHandoff}
                        onClick={() => onAssumeHandoff?.(approval.id)}
                      >
                        Assumir handoff
                      </button>
                    </div>
                  ) : null}
                </article>
              )
            })
          : null}
        {!error ? (
          <PageControls
            label="aprovações"
            pageInfo={pageInfo}
            itemCount={approvals.length}
            disabled={isLoading}
            {...(onPreviousPage ? { onPrevious: onPreviousPage } : {})}
            {...(onNextPage ? { onNext: onNextPage } : {})}
          />
        ) : null}
      </div>
    </section>
  )
}
