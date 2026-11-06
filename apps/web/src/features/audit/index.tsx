import type { AuditEvidenceCheckpointView } from '../../api/client.ts'

export interface AuditPanelProps {
  events: Array<{ id: string; type: string; actorType: string }>
  error?: string | null
  isLoading?: boolean
  evidence?: {
    summary: {
      totalEvents: number
      byType: Record<string, number>
      byActorType: Record<string, number>
    }
    page: {
      items: Array<{
        id: string
        type: string
        actorId?: string
        actorType: string
        correlationId?: string
      }>
      pageInfo: {
        limit: number
        offset: number
        total: number
        hasNextPage: boolean
      }
    }
    export: {
      format: string
      controlled: boolean
      externalDispatch: boolean
      requestedBy: string
    }
    governance?: {
      retention: {
        policyId: string
        approvedForRealData: boolean
        humanSignoffRequired: boolean
      }
      payload: {
        mode: 'minimized'
        rawPayloadReturned: boolean
        redactedFields: string[]
      }
    }
  } | null
  evidenceError?: string | null
  evidenceIsLoading?: boolean
  canReviewEvidence?: boolean
  canRequestEvidenceExport?: boolean
  evidenceExportMessage?: string | null
  isRequestingEvidenceExport?: boolean
  onNextEvidencePage?: () => void
  onPreviousEvidencePage?: () => void
  onRequestEvidenceExport?: () => void
  checkpoint?: AuditEvidenceCheckpointView | null
  canManageEvidenceCheckpoint?: boolean
  checkpointMessage?: string | null
  isManagingEvidenceCheckpoint?: boolean
  onSealEvidenceCheckpoint?: () => void
  onArchiveEvidenceCheckpoint?: () => void
}

function formatEvidencePageRange(
  evidence: NonNullable<AuditPanelProps['evidence']>
) {
  const pageInfo = evidence.page.pageInfo
  if (pageInfo.total === 0) return 'Evidencias 0-0 de 0'
  const start = pageInfo.offset + 1
  const end = Math.min(pageInfo.offset + pageInfo.limit, pageInfo.total)
  return `Evidencias ${start}-${end} de ${pageInfo.total}`
}

export function AuditPanel({
  events,
  error = null,
  isLoading = false,
  evidence = null,
  evidenceError = null,
  evidenceIsLoading = false,
  canReviewEvidence = false,
  canRequestEvidenceExport = false,
  evidenceExportMessage = null,
  isRequestingEvidenceExport = false,
  onNextEvidencePage,
  onPreviousEvidencePage,
  onRequestEvidenceExport,
  checkpoint = null,
  canManageEvidenceCheckpoint = false,
  checkpointMessage = null,
  isManagingEvidenceCheckpoint = false,
  onSealEvidenceCheckpoint,
  onArchiveEvidenceCheckpoint
}: AuditPanelProps) {
  const typeSummary = evidence
    ? Object.entries(evidence.summary.byType)
        .map(([type, total]) => `${type}: ${total}`)
        .join(' / ')
    : ''
  const pageInfo = evidence?.page.pageInfo
  const hasPreviousEvidencePage = pageInfo ? pageInfo.offset > 0 : false
  const hasNextEvidencePage = pageInfo ? pageInfo.hasNextPage : false
  const checkpointEventIds = evidence
    ? evidence.page.items.map((event) => event.id)
    : events.map((event) => event.id)

  return (
    <section className="panel auditPanel" aria-labelledby="audit-title">
      <header className="panelHeader">
        <h2 id="audit-title">Auditoria</h2>
        <span className="counter">{events.length}</span>
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
        {!isLoading && !error && events.length === 0 ? (
          <p className="state">Nenhum evento de auditoria.</p>
        ) : null}
        {!isLoading && !error
          ? events.map((event) => (
              <article className="row" key={event.id}>
                <strong>{event.type}</strong>
                <span>{event.actorType}</span>
              </article>
            ))
          : null}
      </div>
      <section
        className="evidenceReview"
        aria-labelledby="audit-evidence-title"
      >
        <header className="subHeader">
          <h3 id="audit-evidence-title">Evidencias de auditoria</h3>
          <span className="status">
            {canReviewEvidence ? 'audit:view_full' : 'locked'}
          </span>
        </header>
        {!canReviewEvidence ? (
          <p className="state">
            Revisao de evidencia restrita a Supervisor/Admin.
          </p>
        ) : null}
        {canReviewEvidence && evidenceIsLoading ? (
          <p className="state" role="status">
            Carregando evidencias...
          </p>
        ) : null}
        {canReviewEvidence && !evidenceIsLoading && evidenceError ? (
          <p className="state stateError" role="alert">
            {evidenceError}
          </p>
        ) : null}
        {canReviewEvidence &&
        !evidenceIsLoading &&
        !evidenceError &&
        !evidence ? (
          <p className="state">Selecione uma sessao para revisar evidencias.</p>
        ) : null}
        {canReviewEvidence &&
        !evidenceIsLoading &&
        !evidenceError &&
        evidence ? (
          <div className="evidenceBody">
            <div className="evidenceStats" aria-label="Resumo de evidencias">
              <span>{evidence.summary.totalEvents} eventos controlados</span>
              <span>
                Export {evidence.export.format.toUpperCase()} controlado
              </span>
              <span>
                {evidence.export.externalDispatch
                  ? 'Despacho externo habilitado'
                  : 'Sem despacho externo'}
              </span>
            </div>
            {typeSummary ? (
              <p className="state stateCompact">{typeSummary}</p>
            ) : null}
            {evidence.governance ? (
              <p className="state stateCompact">
                {evidence.governance.retention.policyId} /{' '}
                {evidence.governance.retention.approvedForRealData
                  ? 'Dados reais aprovados'
                  : 'Dados reais bloqueados'}{' '}
                / payload {evidence.governance.payload.mode}
              </p>
            ) : null}
            <div className="evidenceControls">
              <span className="state stateCompact">
                {formatEvidencePageRange(evidence)}
              </span>
              <div className="actions">
                <button
                  aria-label="Pagina anterior de evidencias"
                  disabled={evidenceIsLoading || !hasPreviousEvidencePage}
                  onClick={onPreviousEvidencePage}
                  type="button"
                >
                  Anterior
                </button>
                <button
                  aria-label="Proxima pagina de evidencias"
                  disabled={evidenceIsLoading || !hasNextEvidencePage}
                  onClick={onNextEvidencePage}
                  type="button"
                >
                  Proxima
                </button>
                {canRequestEvidenceExport ? (
                  <button
                    aria-label="Solicitar export controlado"
                    disabled={isRequestingEvidenceExport}
                    onClick={onRequestEvidenceExport}
                    type="button"
                  >
                    Solicitar export
                  </button>
                ) : null}
              </div>
            </div>
            {evidenceExportMessage ? (
              <p className="state stateCompact">{evidenceExportMessage}</p>
            ) : null}
            <div className="list">
              {evidence.page.items.length === 0 ? (
                <p className="state">Nenhuma evidencia encontrada.</p>
              ) : null}
              {evidence.page.items.map((event) => (
                <article className="row rowCompact" key={event.id}>
                  <strong>{event.type}</strong>
                  <span>{event.actorId ?? event.actorType}</span>
                  {event.correlationId ? (
                    <span>{event.correlationId}</span>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>
      <section
        className="evidenceCheckpoint"
        aria-labelledby="audit-evidence-checkpoint-title"
      >
        <header className="subHeader">
          <h3 id="audit-evidence-checkpoint-title">Checkpoint de evidencia</h3>
          <span className="status">
            {canManageEvidenceCheckpoint ? 'metadata-only' : 'locked'}
          </span>
        </header>
        {!canReviewEvidence ? (
          <p className="state">
            Checkpoint restrito a Supervisor/Admin e sem payload bruto.
          </p>
        ) : null}
        {canReviewEvidence && checkpoint ? (
          <div className="evidenceBody">
            <div className="evidenceStats" aria-label="Estado do checkpoint">
              <span>
                {checkpoint.eventCount} eventos / {checkpoint.status}
              </span>
              <span>Digest {checkpoint.evidenceDigest}</span>
            </div>
            {checkpoint.status === 'SEALED' ? (
              <button
                aria-label="Arquivar checkpoint"
                disabled={
                  !canManageEvidenceCheckpoint || isManagingEvidenceCheckpoint
                }
                onClick={onArchiveEvidenceCheckpoint}
                type="button"
              >
                Arquivar checkpoint
              </button>
            ) : null}
          </div>
        ) : null}
        {canReviewEvidence && !checkpoint ? (
          <div className="evidenceBody">
            <p className="state stateCompact">
              Apenas IDs da pagina carregada serao selados; payload nao e
              persistido.
            </p>
            <button
              aria-label="Selar checkpoint"
              disabled={
                !canManageEvidenceCheckpoint ||
                checkpointEventIds.length === 0 ||
                isManagingEvidenceCheckpoint
              }
              onClick={onSealEvidenceCheckpoint}
              type="button"
            >
              Selar checkpoint
            </button>
          </div>
        ) : null}
        {checkpointMessage ? (
          <p className="state stateCompact" role="status">
            {checkpointMessage}
          </p>
        ) : null}
      </section>
    </section>
  )
}
