import { useCallback, useEffect, useRef, useState } from 'react'
import { AuditPanel } from './features/audit/index.tsx'
import { ApprovalsPanel } from './features/approvals/index.tsx'
import { ConversationsPanel } from './features/conversations/index.tsx'
import { TasksPanel } from './features/tasks/index.tsx'
import { JourneysPanel } from './features/journeys/index.tsx'
import { PlatformPanel } from './features/platform/index.tsx'
import {
  ApiRequestError,
  apiClient,
  configureApiClientOptions,
  isApiConflict,
  simulationAuthHeaders,
  trustedSessionAuthHeaders,
  type ApprovalDecision,
  type ApprovalView,
  type AuditEvidenceCheckpointView,
  type AuditEvidenceReviewView,
  type AuditEventView,
  type ConversationView,
  type OperatorIdentity,
  type OperatorRole,
  type TaskStatus,
  type TaskView,
  type TimelineItem
} from './api/client.ts'
import {
  createTrustedSessionBootstrap,
  getDefaultWebIdentityMode,
  type SessionBootstrap,
  type TrustedWebSession,
  type WebIdentityMode,
  type WebSessionStatus
} from './auth/session.ts'

interface PanelState<T> {
  data: T
  error: string | null
  isLoading: boolean
}

const loading = <T,>(data: T): PanelState<T> => ({
  data,
  error: null,
  isLoading: true
})
const loaded = <T,>(data: T): PanelState<T> => ({
  data,
  error: null,
  isLoading: false
})
const failed = <T,>(data: T): PanelState<T> => ({
  data,
  error: 'Erro ao carregar dados operacionais.',
  isLoading: false
})

function canReviewAuditEvidence(role: OperatorRole): boolean {
  return role === 'Supervisor' || role === 'Admin'
}

const auditEvidenceLimit = 10
const maxBrowserTimeoutMs = 2_147_483_647
const defaultTrustedSessionBootstrap = createTrustedSessionBootstrap()
const controlledTestProfile =
  __CVG_WEB_MODE__ === 'test' || __CVG_WEB_CONTROLLED_TEST__

function formatSessionExpiry(expiresAt: string): string {
  const timestamp = Date.parse(expiresAt)
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : 'Expiração inválida'
}

export interface AppProps {
  identityMode?: WebIdentityMode
  sessionBootstrap?: SessionBootstrap
}

export function App({ identityMode, sessionBootstrap }: AppProps = {}) {
  const resolvedIdentityMode = identityMode ?? getDefaultWebIdentityMode()
  const trustedMode = resolvedIdentityMode === 'trusted'
  const simulationMode = controlledTestProfile && !trustedMode
  if (!trustedMode && !simulationMode) {
    throw new Error(
      'Simulation web identity mode requires an explicit controlled test profile'
    )
  }
  const effectiveSessionBootstrap =
    sessionBootstrap ?? defaultTrustedSessionBootstrap

  const [conversations, setConversations] = useState<
    PanelState<ConversationView[]>
  >(loading([]))
  const [messages, setMessages] = useState<PanelState<TimelineItem[]>>(
    loading([])
  )
  const [approvals, setApprovals] = useState<PanelState<ApprovalView[]>>(
    loading([])
  )
  const [tasks, setTasks] = useState<PanelState<TaskView[]>>(loading([]))
  const [auditEvents, setAuditEvents] = useState<PanelState<AuditEventView[]>>(
    loading([])
  )
  const [auditEvidence, setAuditEvidence] = useState<
    PanelState<AuditEvidenceReviewView | null>
  >(loaded(null))
  const [auditEvidenceOffset, setAuditEvidenceOffset] = useState(0)
  const [auditEvidenceExportMessage, setAuditEvidenceExportMessage] = useState<
    string | null
  >(null)
  const [auditEvidenceCheckpoint, setAuditEvidenceCheckpoint] = useState<
    PanelState<AuditEvidenceCheckpointView | null>
  >(loaded(null))
  const [auditEvidenceCheckpointMessage, setAuditEvidenceCheckpointMessage] =
    useState<string | null>(null)
  const [
    isManagingAuditEvidenceCheckpoint,
    setIsManagingAuditEvidenceCheckpoint
  ] = useState(false)
  const [isRequestingAuditEvidenceExport, setIsRequestingAuditEvidenceExport] =
    useState(false)
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  )
  const [approvalMessage, setApprovalMessage] = useState<string | null>(null)
  const [approvalActionId, setApprovalActionId] = useState<string | null>(null)
  const [taskActionId, setTaskActionId] = useState<string | null>(null)
  const [operatorIdentity, setOperatorIdentity] = useState<OperatorIdentity>({
    operatorId: '',
    role: 'Operator'
  })
  const [tenantId, setTenantId] = useState('')
  const [trustedSession, setTrustedSession] =
    useState<TrustedWebSession | null>(null)
  const [sessionStatus, setSessionStatus] = useState<WebSessionStatus>(
    trustedMode ? 'loading' : 'authenticated'
  )
  const [sessionError, setSessionError] = useState<string | null>(null)
  const trustedBootstrapAttemptRef = useRef(0)
  const trustedBootstrapInFlightRef = useRef<{
    attempt: number
    promise: Promise<TrustedWebSession>
  } | null>(null)
  const sessionActionRef = useRef<HTMLButtonElement | null>(null)

  const loadTrustedSession = useCallback(
    async (nextStatus: 'loading' | 'reauthenticating') => {
      const currentAttempt = trustedBootstrapAttemptRef.current
      const inFlight = trustedBootstrapInFlightRef.current
      const attempt =
        inFlight?.attempt === currentAttempt
          ? currentAttempt
          : currentAttempt + 1
      if (attempt !== currentAttempt) {
        trustedBootstrapAttemptRef.current = attempt
      }
      setSessionStatus(nextStatus)
      setSessionError(null)
      const promise =
        inFlight?.attempt === attempt
          ? inFlight.promise
          : Promise.resolve().then(() => effectiveSessionBootstrap.load())
      if (!inFlight || inFlight.attempt !== attempt) {
        trustedBootstrapInFlightRef.current = { attempt, promise }
      }
      try {
        const session = await promise
        if (trustedBootstrapAttemptRef.current !== attempt) return
        setTrustedSession(session)
        setSessionStatus('authenticated')
      } catch (error) {
        if (trustedBootstrapAttemptRef.current !== attempt) return
        setTrustedSession(null)
        setSessionStatus('authentication_required')
        setSessionError(
          error instanceof ApiRequestError && error.status === 401
            ? 'Uma sessão confiável é necessária para continuar.'
            : 'Não foi possível autenticar a sessão operacional.'
        )
      } finally {
        if (trustedBootstrapInFlightRef.current?.attempt === attempt) {
          trustedBootstrapInFlightRef.current = null
        }
      }
    },
    [effectiveSessionBootstrap]
  )

  useEffect(() => {
    configureApiClientOptions({
      auth: simulationMode ? simulationAuthHeaders : trustedSessionAuthHeaders,
      onUnauthorized: trustedMode
        ? () => {
            trustedBootstrapAttemptRef.current += 1
            setTrustedSession(null)
            setSessionStatus('authentication_required')
            setSessionError('A sessão operacional expirou. Reautentique-se.')
          }
        : () => undefined
    })
  }, [simulationMode, trustedMode])

  useEffect(() => {
    if (simulationMode) {
      trustedBootstrapAttemptRef.current += 1
      setTrustedSession(null)
      setSessionStatus('authenticated')
      setSessionError(null)
      return
    }
    void loadTrustedSession('loading')
  }, [loadTrustedSession, simulationMode, trustedMode])

  useEffect(() => {
    if (!trustedMode || !trustedSession) return
    const expiresAt = Date.parse(trustedSession.expiresAt)
    if (!Number.isFinite(expiresAt)) {
      setTrustedSession(null)
      setSessionStatus('expired')
      setSessionError('A sessão operacional tem uma expiração inválida.')
      return
    }
    let active = true
    let timeout: number | undefined
    const scheduleExpiryCheck = () => {
      if (!active) return
      const remainingMs = expiresAt - Date.now()
      if (remainingMs <= 0) {
        trustedBootstrapAttemptRef.current += 1
        setTrustedSession(null)
        setSessionStatus('expired')
        setSessionError('A sessão operacional expirou. Reautentique-se.')
        return
      }
      timeout = window.setTimeout(
        scheduleExpiryCheck,
        Math.min(remainingMs, maxBrowserTimeoutMs)
      )
    }
    scheduleExpiryCheck()
    return () => {
      active = false
      if (timeout !== undefined) window.clearTimeout(timeout)
    }
  }, [trustedMode, trustedSession])

  useEffect(() => {
    if (!trustedMode) return
    if (
      sessionStatus === 'authentication_required' ||
      sessionStatus === 'expired'
    ) {
      sessionActionRef.current?.focus()
    }
  }, [sessionStatus, trustedMode])

  const endTrustedSession = async () => {
    trustedBootstrapAttemptRef.current += 1
    try {
      await effectiveSessionBootstrap.logout()
    } catch {
      setSessionError('Não foi possível encerrar a sessão no servidor.')
    } finally {
      setTrustedSession(null)
      setSessionStatus('authentication_required')
    }
  }

  const normalizedOperatorId = operatorIdentity.operatorId.trim()
  const normalizedTenantId = tenantId.trim()
  const trustedSessionExpiry = trustedSession
    ? Date.parse(trustedSession.expiresAt)
    : Number.NaN
  const trustedSessionHasValidExpiry = Number.isFinite(trustedSessionExpiry)
  const currentIdentity = simulationMode
    ? normalizedOperatorId.length > 0
      ? {
          operatorId: normalizedOperatorId,
          role: operatorIdentity.role,
          ...(normalizedTenantId ? { tenantId: normalizedTenantId } : {})
        }
      : null
    : trustedSession && trustedSessionHasValidExpiry
      ? trustedSession.identity
      : null
  const identityKey = JSON.stringify([
    currentIdentity?.operatorId ?? '',
    currentIdentity?.role ?? '',
    currentIdentity?.tenantId ?? ''
  ])
  const identityScopeRef = useRef(identityKey)
  const identityChanged = identityScopeRef.current !== identityKey
  if (identityChanged) identityScopeRef.current = identityKey

  const viewScopeKey = JSON.stringify([
    identityKey,
    selectedConversationId,
    selectedSessionId
  ])
  const viewScopeRef = useRef({ key: viewScopeKey, generation: 0 })
  const viewScopeChanged = viewScopeRef.current.key !== viewScopeKey
  if (viewScopeChanged) {
    viewScopeRef.current = {
      key: viewScopeKey,
      generation: viewScopeRef.current.generation + 1
    }
  }
  const viewScopeToken = `${viewScopeRef.current.generation}:${viewScopeKey}`

  const isCurrentIdentity = (scope: string): boolean =>
    identityScopeRef.current === scope
  const isCurrentViewScope = (scope: string): boolean =>
    `${viewScopeRef.current.generation}:${viewScopeRef.current.key}` === scope

  const currentOperatorIdentity = (): OperatorIdentity | null => {
    return currentIdentity
  }

  useEffect(() => {
    const identity = currentOperatorIdentity()
    if (!identity) {
      setConversations(loaded([]))
      setMessages(loaded([]))
      setApprovals(loaded([]))
      setTasks(loaded([]))
      setAuditEvents(loaded([]))
      setAuditEvidence(loaded(null))
      setAuditEvidenceOffset(0)
      setAuditEvidenceExportMessage(null)
      setAuditEvidenceCheckpoint(loaded(null))
      setAuditEvidenceCheckpointMessage(null)
      setSelectedConversationId(null)
      setSelectedSessionId(null)
      setApprovalActionId(null)
      setApprovalMessage(null)
      setTaskActionId(null)
      setIsManagingAuditEvidenceCheckpoint(false)
      setIsRequestingAuditEvidenceExport(false)
      return
    }

    let active = true
    setConversations(loading([]))
    setMessages(loading([]))
    setApprovals(loading([]))
    setTasks(loading([]))
    setAuditEvents(loading([]))
    setAuditEvidence(loaded(null))
    setAuditEvidenceOffset(0)
    setAuditEvidenceExportMessage(null)
    setAuditEvidenceCheckpoint(loaded(null))
    setAuditEvidenceCheckpointMessage(null)
    setSelectedConversationId(null)
    setSelectedSessionId(null)
    setApprovalActionId(null)
    setApprovalMessage(null)
    setTaskActionId(null)
    setIsManagingAuditEvidenceCheckpoint(false)
    setIsRequestingAuditEvidenceExport(false)
    const scope = identityKey

    apiClient
      .listConversations(identity, { limit: 25, offset: 0 })
      .then((page) => {
        if (!active || !isCurrentIdentity(scope)) return
        const firstConversation = page.items[0] ?? null
        setConversations(loaded(page.items))
        setSelectedConversationId(firstConversation?.id ?? null)
        setSelectedSessionId(firstConversation?.openSessionId ?? null)
        if (!firstConversation) {
          setMessages(loaded([]))
          setAuditEvents(loaded([]))
          setAuditEvidence(loaded(null))
        }
      })
      .catch(() => {
        if (!active || !isCurrentIdentity(scope)) return
        setConversations(failed([]))
        setMessages(failed([]))
        setAuditEvents(failed([]))
      })

    apiClient
      .listApprovals(identity)
      .then((data) => {
        if (active && isCurrentIdentity(scope)) setApprovals(loaded(data))
      })
      .catch(() => {
        if (active && isCurrentIdentity(scope)) setApprovals(failed([]))
      })

    apiClient
      .listTasks(identity)
      .then((data) => {
        if (active && isCurrentIdentity(scope)) setTasks(loaded(data))
      })
      .catch(() => {
        if (active && isCurrentIdentity(scope)) setTasks(failed([]))
      })

    return () => {
      active = false
    }
  }, [identityKey])

  useEffect(() => {
    const identity = currentOperatorIdentity()
    if (!identity || identityChanged) return
    if (!selectedConversationId) return
    let active = true
    const scope = viewScopeToken
    setMessages(loading([]))

    apiClient
      .getTimeline(selectedConversationId, identity)
      .then((timeline) => {
        if (active && isCurrentViewScope(scope))
          setMessages(loaded(timeline.messages))
      })
      .catch(() => {
        if (active && isCurrentViewScope(scope)) setMessages(failed([]))
      })

    return () => {
      active = false
    }
  }, [selectedConversationId, identityKey, identityChanged, viewScopeToken])

  useEffect(() => {
    const identity = currentOperatorIdentity()
    if (!identity || identityChanged) return
    if (!selectedConversationId) return
    if (!selectedSessionId) {
      setAuditEvents(loaded([]))
      return
    }

    let active = true
    const scope = viewScopeToken
    setAuditEvents(loading([]))

    apiClient
      .getAudit(selectedSessionId, identity)
      .then((audit) => {
        if (active && isCurrentViewScope(scope))
          setAuditEvents(loaded(audit.events))
      })
      .catch(() => {
        if (active && isCurrentViewScope(scope)) setAuditEvents(failed([]))
      })

    return () => {
      active = false
    }
  }, [
    selectedConversationId,
    selectedSessionId,
    identityKey,
    identityChanged,
    viewScopeToken
  ])

  useEffect(() => {
    const identity = currentOperatorIdentity()
    if (!identity || identityChanged) return
    if (!selectedSessionId) {
      setAuditEvidence(loaded(null))
      setAuditEvidenceOffset(0)
      setAuditEvidenceExportMessage(null)
      setAuditEvidenceCheckpoint(loaded(null))
      setAuditEvidenceCheckpointMessage(null)
      return
    }
    if (!canReviewAuditEvidence(identity.role)) {
      setAuditEvidence(loaded(null))
      setAuditEvidenceOffset(0)
      setAuditEvidenceExportMessage(null)
      setAuditEvidenceCheckpoint(loaded(null))
      setAuditEvidenceCheckpointMessage(null)
      return
    }

    let active = true
    const scope = viewScopeToken
    setAuditEvidence(loading(null))

    apiClient
      .getAuditEvidence({
        identity,
        sessionId: selectedSessionId,
        limit: auditEvidenceLimit,
        offset: auditEvidenceOffset
      })
      .then((evidence) => {
        if (active && isCurrentViewScope(scope))
          setAuditEvidence(loaded(evidence))
      })
      .catch(() => {
        if (active && isCurrentViewScope(scope)) setAuditEvidence(failed(null))
      })

    return () => {
      active = false
    }
  }, [
    selectedSessionId,
    identityKey,
    identityChanged,
    auditEvidenceOffset,
    viewScopeToken
  ])

  useEffect(() => {
    const identity = currentOperatorIdentity()
    if (
      !identity ||
      identityChanged ||
      !selectedSessionId ||
      !canReviewAuditEvidence(identity.role)
    ) {
      setAuditEvidenceCheckpoint(loaded(null))
      return
    }
    let active = true
    const scope = viewScopeToken
    setAuditEvidenceCheckpoint(loading(null))
    apiClient
      .listAuditEvidenceCheckpoints(identity)
      .then(({ checkpoints }) => {
        if (!active || !isCurrentViewScope(scope)) return
        const current =
          checkpoints.find(
            (checkpoint) =>
              checkpoint.filters.sessionId === selectedSessionId &&
              checkpoint.status !== 'ARCHIVED'
          ) ??
          checkpoints.find(
            (checkpoint) => checkpoint.filters.sessionId === selectedSessionId
          ) ??
          null
        setAuditEvidenceCheckpoint(loaded(current))
      })
      .catch(() => {
        if (active && isCurrentViewScope(scope))
          setAuditEvidenceCheckpoint(failed(null))
      })
    return () => {
      active = false
    }
  }, [selectedSessionId, identityKey, identityChanged, viewScopeToken])

  const selectConversation = (
    conversation: Pick<ConversationView, 'id' | 'openSessionId'>
  ) => {
    setSelectedConversationId(conversation.id)
    setSelectedSessionId(conversation.openSessionId)
    setAuditEvidenceOffset(0)
    setAuditEvidenceExportMessage(null)
    setAuditEvidenceCheckpoint(loaded(null))
    setAuditEvidenceCheckpointMessage(null)
  }

  const refreshApprovals = async (scope = viewScopeToken) => {
    const identity = currentOperatorIdentity()
    if (!identity || !isCurrentViewScope(scope)) return
    const data = await apiClient.listApprovals(identity)
    if (!isCurrentViewScope(scope)) return
    setApprovals(loaded(data))
  }

  const refreshAudit = async (scope = viewScopeToken) => {
    const identity = currentOperatorIdentity()
    if (!identity || !isCurrentViewScope(scope) || !selectedSessionId) return
    const audit = await apiClient.getAudit(selectedSessionId, identity)
    if (!isCurrentViewScope(scope)) return
    setAuditEvents(loaded(audit.events))
  }

  const refreshAuditEvidence = async (scope = viewScopeToken) => {
    const identity = currentOperatorIdentity()
    if (
      !identity ||
      !isCurrentViewScope(scope) ||
      !selectedSessionId ||
      !canReviewAuditEvidence(identity.role)
    )
      return
    const evidence = await apiClient.getAuditEvidence({
      identity,
      sessionId: selectedSessionId,
      limit: auditEvidenceLimit,
      offset: auditEvidenceOffset
    })
    if (!isCurrentViewScope(scope)) return
    setAuditEvidence(loaded(evidence))
    const { checkpoints } =
      await apiClient.listAuditEvidenceCheckpoints(identity)
    if (!isCurrentViewScope(scope)) return
    setAuditEvidenceCheckpoint(
      loaded(
        checkpoints.find(
          (checkpoint) => checkpoint.filters.sessionId === selectedSessionId
        ) ?? null
      )
    )
  }

  const sealAuditEvidenceCheckpoint = async () => {
    const scope = viewScopeToken
    const identity = currentOperatorIdentity()
    const page = auditEvidence.data?.page.items
    if (
      !identity ||
      !isCurrentViewScope(scope) ||
      !selectedSessionId ||
      !page?.length
    )
      return
    if (!canReviewAuditEvidence(identity.role)) return
    setIsManagingAuditEvidenceCheckpoint(true)
    setAuditEvidenceCheckpointMessage(null)
    try {
      const result = await apiClient.createAuditEvidenceCheckpoint({
        identity,
        eventIds: page.map((event) => event.id),
        filters: { sessionId: selectedSessionId }
      })
      if (!isCurrentViewScope(scope)) return
      setAuditEvidenceCheckpoint(loaded(result.checkpoint))
      setAuditEvidenceCheckpointMessage(
        'Checkpoint selado com IDs e digest; nenhum payload foi persistido.'
      )
    } catch (error) {
      if (!isCurrentViewScope(scope)) return
      setAuditEvidenceCheckpointMessage(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel selar o checkpoint.'
      )
    } finally {
      if (isCurrentViewScope(scope)) setIsManagingAuditEvidenceCheckpoint(false)
    }
  }

  const archiveAuditEvidenceCheckpoint = async () => {
    const scope = viewScopeToken
    const identity = currentOperatorIdentity()
    const checkpoint = auditEvidenceCheckpoint.data
    if (
      !identity ||
      !isCurrentViewScope(scope) ||
      !checkpoint ||
      checkpoint.status !== 'SEALED'
    )
      return
    if (!canReviewAuditEvidence(identity.role)) return
    setIsManagingAuditEvidenceCheckpoint(true)
    setAuditEvidenceCheckpointMessage(null)
    try {
      const result = await apiClient.transitionAuditEvidenceCheckpoint({
        identity,
        checkpointId: checkpoint.id,
        expectedStatus: 'SEALED'
      })
      if (!isCurrentViewScope(scope)) return
      setAuditEvidenceCheckpoint(loaded(result.checkpoint))
      setAuditEvidenceCheckpointMessage('Checkpoint arquivado com CAS.')
    } catch (error) {
      if (!isCurrentViewScope(scope)) return
      setAuditEvidenceCheckpointMessage(
        error instanceof Error
          ? error.message
          : 'Nao foi possivel arquivar o checkpoint.'
      )
    } finally {
      if (isCurrentViewScope(scope)) setIsManagingAuditEvidenceCheckpoint(false)
    }
  }

  const goToPreviousAuditEvidencePage = () => {
    const pageInfo = auditEvidence.data?.page.pageInfo
    if (!pageInfo || pageInfo.offset === 0) return
    setAuditEvidenceExportMessage(null)
    setAuditEvidenceOffset(Math.max(0, pageInfo.offset - pageInfo.limit))
  }

  const goToNextAuditEvidencePage = () => {
    const pageInfo = auditEvidence.data?.page.pageInfo
    if (!pageInfo?.hasNextPage) return
    setAuditEvidenceExportMessage(null)
    setAuditEvidenceOffset(pageInfo.offset + pageInfo.limit)
  }

  const requestAuditEvidenceExportApproval = async () => {
    const scope = viewScopeToken
    const identity = currentOperatorIdentity()
    if (!identity || !isCurrentViewScope(scope)) return
    if (!selectedSessionId) return
    if (!canReviewAuditEvidence(identity.role)) return

    setIsRequestingAuditEvidenceExport(true)
    setAuditEvidenceExportMessage(null)
    try {
      await apiClient.requestAuditEvidenceExportApproval({
        identity,
        sessionId: selectedSessionId
      })
      await refreshApprovals(scope)
      if (!isCurrentViewScope(scope)) return
      setAuditEvidenceExportMessage(
        'Solicitacao de export registrada para aprovacao humana.'
      )
    } catch {
      if (!isCurrentViewScope(scope)) return
      setAuditEvidenceExportMessage(
        'Erro ao solicitar aprovacao de export controlado.'
      )
    } finally {
      if (isCurrentViewScope(scope)) setIsRequestingAuditEvidenceExport(false)
    }
  }

  const refreshTasks = async (scope = viewScopeToken) => {
    const identity = currentOperatorIdentity()
    if (!identity || !isCurrentViewScope(scope)) return
    const data = await apiClient.listTasks(identity)
    if (!isCurrentViewScope(scope)) return
    setTasks(loaded(data))
  }

  const decideApproval = async (
    approvalRequestId: string,
    decision: ApprovalDecision,
    note: string
  ) => {
    const scope = viewScopeToken
    const identity = currentOperatorIdentity()
    if (!identity || !isCurrentViewScope(scope)) {
      if (!isCurrentViewScope(scope)) return
      setApprovals(failed(approvals.data))
      return
    }
    setApprovalMessage(null)
    setApprovalActionId(approvalRequestId)
    try {
      await apiClient.decideApproval({
        approvalRequestId,
        decision,
        identity,
        note
      })
      if (!isCurrentViewScope(scope)) return
      await refreshApprovals(scope)
      await refreshAudit(scope)
      await refreshAuditEvidence(scope)
    } catch (error) {
      if (!isCurrentViewScope(scope)) return
      if (isApiConflict(error)) {
        try {
          await refreshApprovals(scope)
          await refreshAudit(scope)
          if (isCurrentViewScope(scope))
            setApprovalMessage(
              'Esta aprovacao ja foi decidida. A fila foi atualizada.'
            )
        } catch {
          if (isCurrentViewScope(scope)) setApprovals(failed(approvals.data))
        }
      } else {
        setApprovals(failed(approvals.data))
      }
    } finally {
      if (isCurrentViewScope(scope)) setApprovalActionId(null)
    }
  }

  const updateTaskStatus = async (taskId: string, status: TaskStatus) => {
    const scope = viewScopeToken
    const identity = currentOperatorIdentity()
    if (!identity || !isCurrentViewScope(scope)) {
      if (!isCurrentViewScope(scope)) return
      setTasks(failed(tasks.data))
      return
    }
    setTaskActionId(taskId)
    try {
      await apiClient.updateTaskStatus({ taskId, status, identity })
      if (!isCurrentViewScope(scope)) return
      await refreshTasks(scope)
      await refreshAudit(scope)
    } catch {
      if (!isCurrentViewScope(scope)) return
      setTasks(failed(tasks.data))
    } finally {
      if (isCurrentViewScope(scope)) setTaskActionId(null)
    }
  }

  const identityReady = currentIdentity !== null
  const canDecideApproval =
    identityReady &&
    (currentIdentity?.role === 'Approver' ||
      currentIdentity?.role === 'Supervisor')
  const canAssumeHandoff =
    identityReady && currentIdentity?.role === 'Supervisor'
  const canUpdateTasks = identityReady && currentIdentity?.role === 'Operator'
  const canReviewEvidence =
    identityReady && canReviewAuditEvidence(currentIdentity?.role ?? 'Operator')
  const platformTenantId = currentIdentity?.tenantId
  const platformIdentity =
    currentIdentity?.role === 'Admin' &&
    platformTenantId !== undefined &&
    /^tenant_[0-9a-f-]{36}$/.test(platformTenantId)
      ? { ...currentIdentity, tenantId: platformTenantId }
      : null

  const sessionStatusLabel: Record<WebSessionStatus, string> = {
    loading: 'Autenticando…',
    authenticated: simulationMode ? 'Simulação controlada' : 'Sessão confiável',
    authentication_required: 'Autenticação necessária',
    expired: 'Sessão expirada',
    reauthenticating: 'Reautenticando…'
  }

  return (
    <main className="shell">
      <a className="skipLink" href="#console-operacional">
        Pular para o console operacional
      </a>
      <header className="topbar" aria-labelledby="console-title">
        <div className="topbarIntro">
          <p className="eyebrow">OPERAÇÃO CONTROLADA · CVG</p>
          <h1 id="console-title">CVG Agent Secretary</h1>
          <p>
            Operacao assistida com aprovacoes, auditoria e acoes sensiveis
            bloqueadas.
          </p>
        </div>
        <form className="identityControls" aria-label="Identidade operacional">
          {!simulationMode ? (
            <>
              <span className="status">
                {sessionStatusLabel[sessionStatus]}
              </span>
              {trustedSession ? (
                <span
                  className="scopeSummary"
                  title={
                    trustedSession.identity.tenantId ?? 'Tenant não definido'
                  }
                >
                  <span>Operador</span>
                  <code>{trustedSession.identity.operatorId}</code>
                  <span>Papel</span>
                  <code>{trustedSession.identity.role}</code>
                  <span>Escopo</span>
                  <code>
                    {trustedSession.identity.tenantId ?? 'Não definido'}
                  </code>
                  <span>Expira</span>
                  <time dateTime={trustedSession.expiresAt}>
                    {formatSessionExpiry(trustedSession.expiresAt)}
                  </time>
                </span>
              ) : null}
              {trustedSession ? (
                <button
                  type="button"
                  className="sessionButton"
                  ref={sessionActionRef}
                  onClick={() => void endTrustedSession()}
                >
                  Encerrar sessão
                </button>
              ) : (
                <button
                  type="button"
                  className="sessionButton"
                  ref={sessionActionRef}
                  onClick={() => void loadTrustedSession('reauthenticating')}
                >
                  Reautenticar
                </button>
              )}
            </>
          ) : (
            <>
              <label>
                ID do operador
                <input
                  aria-label="ID do operador"
                  value={operatorIdentity.operatorId}
                  onChange={(event) =>
                    setOperatorIdentity({
                      ...operatorIdentity,
                      operatorId: event.target.value
                    })
                  }
                  placeholder="operator.shift-a"
                />
              </label>
              <label>
                Papel operacional
                <select
                  aria-label="Papel operacional"
                  value={operatorIdentity.role}
                  onChange={(event) =>
                    setOperatorIdentity({
                      ...operatorIdentity,
                      role: event.target.value as OperatorRole
                    })
                  }
                >
                  <option value="Operator">Operator</option>
                  <option value="Approver">Approver</option>
                  <option value="Supervisor">Supervisor</option>
                  <option value="Admin">Admin</option>
                </select>
              </label>
              <label>
                Tenant ID
                <input
                  aria-label="Tenant ID"
                  value={tenantId}
                  onChange={(event) => setTenantId(event.target.value)}
                  placeholder="tenant_<uuid>"
                />
              </label>
              <span className="status">{operatorIdentity.role}</span>
              <span
                className="scopeSummary"
                title={tenantId.trim() || 'Tenant não definido'}
              >
                <span>Escopo</span>
                <code>{tenantId.trim() || 'Não definido'}</code>
              </span>
              <button
                type="button"
                className="sessionButton"
                onClick={() => {
                  setOperatorIdentity({ operatorId: '', role: 'Operator' })
                  setTenantId('')
                }}
              >
                Encerrar sessão
              </button>
            </>
          )}
        </form>
        {trustedMode && sessionStatus !== 'authenticated' ? (
          <p className="sessionNotice" role="status">
            {sessionError ?? sessionStatusLabel[sessionStatus]}
          </p>
        ) : null}
      </header>
      <nav className="sectionNav" aria-label="Seções do console">
        <a href="#console-operacional">Operação</a>
        <a href="#journeys-panel">Jornadas</a>
        {platformIdentity ? <a href="#platform-panel">Admin console</a> : null}
      </nav>
      <section
        className="grid"
        id="console-operacional"
        aria-label="Console operacional"
        tabIndex={-1}
      >
        <ConversationsPanel
          conversations={conversations.data}
          selectedConversationId={selectedConversationId}
          messages={messages.data}
          error={conversations.error ?? messages.error}
          isLoading={conversations.isLoading}
          isTimelineLoading={!conversations.isLoading && messages.isLoading}
          onSelectConversation={selectConversation}
        />
        <ApprovalsPanel
          message={approvalMessage}
          approvals={approvals.data}
          actionId={approvalActionId}
          error={approvals.error}
          isLoading={approvals.isLoading}
          canApproveReject={canDecideApproval}
          canAssumeHandoff={canAssumeHandoff}
          onApprove={(approvalId) =>
            void decideApproval(
              approvalId,
              'approved',
              'controlled_console_action'
            )
          }
          onReject={(approvalId) =>
            void decideApproval(
              approvalId,
              'rejected',
              'controlled_console_action'
            )
          }
          onAssumeHandoff={(approvalId) =>
            void decideApproval(
              approvalId,
              'assumed',
              'controlled_handoff_only'
            )
          }
        />
        <TasksPanel
          tasks={tasks.data}
          actionId={taskActionId}
          error={tasks.error}
          isLoading={tasks.isLoading}
          canUpdateTasks={canUpdateTasks}
          onStart={(taskId) => void updateTaskStatus(taskId, 'in_progress')}
          onComplete={(taskId) => void updateTaskStatus(taskId, 'done')}
          onCancel={(taskId) => void updateTaskStatus(taskId, 'canceled')}
        />
        <AuditPanel
          events={auditEvents.data}
          error={auditEvents.error}
          isLoading={auditEvents.isLoading}
          evidence={auditEvidence.data}
          evidenceError={auditEvidence.error}
          evidenceIsLoading={auditEvidence.isLoading}
          canReviewEvidence={canReviewEvidence}
          evidenceExportMessage={auditEvidenceExportMessage}
          isRequestingEvidenceExport={isRequestingAuditEvidenceExport}
          checkpoint={auditEvidenceCheckpoint.data}
          canManageEvidenceCheckpoint={
            canReviewEvidence &&
            !auditEvidenceCheckpoint.isLoading &&
            !auditEvidenceCheckpoint.error
          }
          checkpointMessage={auditEvidenceCheckpointMessage}
          isManagingEvidenceCheckpoint={isManagingAuditEvidenceCheckpoint}
          onSealEvidenceCheckpoint={() => void sealAuditEvidenceCheckpoint()}
          onArchiveEvidenceCheckpoint={() =>
            void archiveAuditEvidenceCheckpoint()
          }
          onNextEvidencePage={goToNextAuditEvidencePage}
          onPreviousEvidencePage={goToPreviousAuditEvidencePage}
          onRequestEvidenceExport={() =>
            void requestAuditEvidenceExportApproval()
          }
        />
      </section>
      <JourneysPanel
        identity={currentOperatorIdentity()}
        selectedSessionId={selectedSessionId}
      />
      {platformIdentity ? <PlatformPanel identity={platformIdentity} /> : null}
    </main>
  )
}
