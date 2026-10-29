import { useCallback, useEffect, useRef, useState } from 'react'
import { AuditPanel } from './features/audit/index.tsx'
import { ApprovalsPanel } from './features/approvals/index.tsx'
import { ConversationsPanel } from './features/conversations/index.tsx'
import {
  beginLogicalOperation,
  resolveLogicalOperation
} from './api/logical-operation.ts'
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
  type ListPage,
  type ListPageInfo,
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
import { consoleLoginProfile } from './api/console-profile.ts'
import {
  parseAuthorizationUrl,
  readLoginFragment,
  type LoginLanding
} from './api/origin.ts'

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
// SPEC0259 §4.8 (all profiles): a 403 is "no permission", distinct from the
// unavailable text that network, 429 and 5xx keep (J10).
const forbiddenPanelMessage = 'Sem permissão para esta área.'
const failed = <T,>(data: T, error?: unknown): PanelState<T> => ({
  data,
  error:
    error instanceof ApiRequestError && error.status === 403
      ? forbiddenPanelMessage
      : 'Erro ao carregar dados operacionais.',
  isLoading: false
})

/** Loads one page; an emptied page past the first falls back to the first. */
async function fetchQueuePage<T>(
  load: (offset: number) => Promise<ListPage<T>>,
  offset: number
): Promise<ListPage<T>> {
  const page = await load(offset)
  return page.items.length === 0 && offset > 0 ? load(0) : page
}

/** Store, rate limit, server or network trouble: retry, never re-authenticate. */
function isSessionUnavailable(error: unknown): boolean {
  return (
    error instanceof ApiRequestError &&
    (error.status === 0 || error.status === 429 || error.status >= 500)
  )
}

/**
 * SPEC0251 §4.4 — a 404 on a decision or a task transition: the item is no
 * longer available to this operator (case not assigned, revoked or gone).
 */
function isUnavailableItem(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404
}

const unavailableItemMessage = 'Este item não está mais disponível para você.'

/** SPEC0259 §4.8 — texts of the OIDC profile (the current profile keeps its own). */
const oidcText = {
  signIn: 'Entre com sua conta para continuar.',
  expired: 'A sessão expirou. Entre novamente.',
  sessionUnavailable: 'Sessão indisponível no momento. Tente novamente.',
  apiRefusedConfiguration: 'A configuração do console não é aceita pela API.',
  invalidConfiguration: 'Configuração do console inválida.',
  opening: 'Abrindo o login…',
  loginUnavailable: 'Login indisponível no momento. Tente novamente.',
  signedOut: 'Sessão encerrada.'
} as const

const landingText: Record<LoginLanding, string> = {
  negado: 'Não foi possível entrar com esta conta.',
  indisponivel: oidcText.loginUnavailable
}

function defaultNavigate(url: string): void {
  window.location.assign(url)
}

function canReviewAuditEvidence(role: OperatorRole): boolean {
  return role === 'Supervisor' || role === 'Admin'
}

const auditEvidenceLimit = 10
/** SPEC0250 §3.6 — bounded queues: pending approvals and active tasks. */
const queuePageSize = 25
const approvalQueueStatuses = ['pending'] as const
const activeTaskStatuses = ['open', 'in_progress'] as const
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
  /** SPEC0259 §4.8 (PB13): top-level navigation to the IdP. */
  navigate?: (url: string) => void
}

/** Most extra conversation pages "Abrir caso" walks before giving up. */
const maxCaseSearchPages = 20

export function App({
  identityMode,
  sessionBootstrap,
  navigate = defaultNavigate
}: AppProps = {}) {
  const resolvedIdentityMode = identityMode ?? getDefaultWebIdentityMode()
  const trustedMode = resolvedIdentityMode === 'trusted'
  const simulationMode = controlledTestProfile && !trustedMode
  if (!trustedMode && !simulationMode) {
    throw new Error(
      'Simulation web identity mode requires an explicit controlled test profile'
    )
  }
  const loginProfile = consoleLoginProfile
  const oidcMode = loginProfile.kind === 'oidc'
  if (oidcMode && !trustedMode) {
    throw new Error('The OIDC console requires the trusted identity mode')
  }
  // SPEC0259 J1: from a divergent origin the console makes no call at all.
  const [originMismatch] = useState(
    () =>
      loginProfile.kind === 'oidc' &&
      window.location.origin !== loginProfile.consoleOrigin
  )
  const effectiveSessionBootstrap =
    sessionBootstrap ?? defaultTrustedSessionBootstrap

  const [conversations, setConversations] = useState<
    PanelState<ConversationView[]>
  >(loading([]))
  // SPEC 0257 §7: synchronous guard, so a double click cannot dispatch twice.
  const auditExportInFlight = useRef(false)
  const [conversationPageInfo, setConversationPageInfo] =
    useState<ListPageInfo | null>(null)
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] =
    useState(false)
  const [messages, setMessages] = useState<PanelState<TimelineItem[]>>(
    loading([])
  )
  const [approvals, setApprovals] = useState<PanelState<ApprovalView[]>>(
    loading([])
  )
  const [tasks, setTasks] = useState<PanelState<TaskView[]>>(loading([]))
  const [approvalPageInfo, setApprovalPageInfo] = useState<ListPageInfo | null>(
    null
  )
  const [taskPageInfo, setTaskPageInfo] = useState<ListPageInfo | null>(null)
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
  const [taskMessage, setTaskMessage] = useState<string | null>(null)
  const [taskActionId, setTaskActionId] = useState<string | null>(null)
  const [operatorIdentity, setOperatorIdentity] = useState<OperatorIdentity>({
    operatorId: '',
    role: 'Operator'
  })
  const [tenantId, setTenantId] = useState('')
  const [trustedSession, setTrustedSession] =
    useState<TrustedWebSession | null>(null)
  const [sessionStatus, setSessionStatus] = useState<WebSessionStatus>(
    originMismatch
      ? 'configuration_error'
      : trustedMode
        ? 'loading'
        : 'authenticated'
  )
  const [sessionError, setSessionError] = useState<string | null>(
    originMismatch ? oidcText.invalidConfiguration : null
  )
  const [loginOpening, setLoginOpening] = useState(false)
  // Bumped when the focus must return to the action without a state change
  // (a failed start keeps the same state; SPEC0259 §4.8 accessibility).
  const [focusRequest, setFocusRequest] = useState(0)
  // SPEC0259 §4.8: the landing fragment is read once, before the session.
  const landingRef = useRef<LoginLanding | null | undefined>(undefined)
  const sessionNoticeRef = useRef<HTMLParagraphElement | null>(null)
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
        // A landing message is shown at most once (SPEC0259 §4.8).
        if (landingRef.current) landingRef.current = null
        setTrustedSession(session)
        setSessionStatus('authenticated')
      } catch (error) {
        if (trustedBootstrapAttemptRef.current !== attempt) return
        setTrustedSession(null)
        if (oidcMode) {
          // SPEC0259 §4.8 / J8: unavailable never turns into a login request.
          if (isSessionUnavailable(error)) {
            setSessionStatus('unavailable')
            setSessionError(oidcText.sessionUnavailable)
          } else if (error instanceof ApiRequestError && error.status === 401) {
            setSessionStatus('authentication_required')
            const landing = landingRef.current
            if (landing) landingRef.current = null
            setSessionError(landing ? landingText[landing] : oidcText.signIn)
          } else {
            setSessionStatus('configuration_error')
            setSessionError(oidcText.apiRefusedConfiguration)
          }
          return
        }
        // SPEC0250 §3.5 (AUD0621 F12): a 401 here is "no session yet", not
        // an expiry; an unavailable store or network keeps the cookie and
        // offers a retry instead of asking for authentication.
        if (isSessionUnavailable(error)) {
          setSessionStatus('unavailable')
          setSessionError('Sessão operacional indisponível. Tente novamente.')
          return
        }
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
    [effectiveSessionBootstrap, oidcMode]
  )

  useEffect(() => {
    configureApiClientOptions({
      auth: simulationMode ? simulationAuthHeaders : trustedSessionAuthHeaders,
      onUnauthorized: trustedMode
        ? () => {
            trustedBootstrapAttemptRef.current += 1
            setTrustedSession(null)
            if (oidcMode) {
              setSessionStatus('expired')
              setSessionError(oidcText.expired)
              return
            }
            setSessionStatus('authentication_required')
            setSessionError('A sessão operacional expirou. Reautentique-se.')
          }
        : () => undefined
    })
  }, [simulationMode, trustedMode, oidcMode])

  useEffect(() => {
    if (originMismatch) return
    if (oidcMode && landingRef.current === undefined) {
      const landing = readLoginFragment(window.location.hash)
      landingRef.current = landing
      if (landing) {
        window.history.replaceState(
          window.history.state,
          '',
          `${window.location.pathname}${window.location.search}`
        )
      }
    }
    if (simulationMode) {
      trustedBootstrapAttemptRef.current += 1
      setTrustedSession(null)
      setSessionStatus('authenticated')
      setSessionError(null)
      return
    }
    void loadTrustedSession('loading')
  }, [
    loadTrustedSession,
    simulationMode,
    trustedMode,
    originMismatch,
    oidcMode
  ])

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
        setSessionError(
          oidcMode
            ? oidcText.expired
            : 'A sessão operacional expirou. Reautentique-se.'
        )
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
  }, [trustedMode, trustedSession, oidcMode])

  useEffect(() => {
    if (!trustedMode) return
    if (
      sessionStatus === 'authentication_required' ||
      sessionStatus === 'expired' ||
      sessionStatus === 'unavailable'
    ) {
      sessionActionRef.current?.focus()
    } else if (sessionStatus === 'configuration_error') {
      // No action to offer: the focus goes to the notice (SPEC0259 §4.8).
      sessionNoticeRef.current?.focus()
    }
  }, [sessionStatus, trustedMode, focusRequest])

  const endTrustedSession = async () => {
    trustedBootstrapAttemptRef.current += 1
    try {
      await effectiveSessionBootstrap.logout()
      if (oidcMode) setSessionError(oidcText.signedOut)
    } catch {
      setSessionError('Não foi possível encerrar a sessão no servidor.')
    } finally {
      setTrustedSession(null)
      setSessionStatus('authentication_required')
    }
  }

  /**
   * SPEC0259 §4.8 — "Entrar": one start request, then a top-level navigation
   * to an `https:` authorization URL without credentials (PB13).
   */
  const startOidcLogin = async () => {
    if (loginOpening) return
    setLoginOpening(true)
    setSessionError(oidcText.opening)
    let authorizationUrl: string | null
    try {
      const started = await apiClient.startOidcLogin()
      authorizationUrl = parseAuthorizationUrl(started.authorizationUrl)
    } catch (error) {
      setLoginOpening(false)
      if (
        error instanceof ApiRequestError &&
        (error.status === 400 || error.status === 403)
      ) {
        setSessionStatus('configuration_error')
        setSessionError(oidcText.apiRefusedConfiguration)
        return
      }
      setSessionError(oidcText.loginUnavailable)
      setFocusRequest((request) => request + 1)
      return
    }
    if (!authorizationUrl) {
      setLoginOpening(false)
      setSessionStatus('configuration_error')
      setSessionError(oidcText.invalidConfiguration)
      return
    }
    navigate(authorizationUrl)
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
      setApprovalPageInfo(null)
      setTaskPageInfo(null)
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
      setTaskMessage(null)
      setTaskActionId(null)
      setIsManagingAuditEvidenceCheckpoint(false)
      setIsRequestingAuditEvidenceExport(false)
      return
    }

    let active = true
    setConversations(loading([]))
    setConversationPageInfo(null)
    setIsLoadingMoreConversations(false)
    setMessages(loading([]))
    setApprovals(loading([]))
    setTasks(loading([]))
    setApprovalPageInfo(null)
    setTaskPageInfo(null)
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
    setTaskMessage(null)
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
        setConversationPageInfo(page.pageInfo)
        setSelectedConversationId(firstConversation?.id ?? null)
        setSelectedSessionId(firstConversation?.openSessionId ?? null)
        if (!firstConversation) {
          setMessages(loaded([]))
          setAuditEvents(loaded([]))
          setAuditEvidence(loaded(null))
        }
      })
      .catch((error: unknown) => {
        if (!active || !isCurrentIdentity(scope)) return
        setConversations(failed([], error))
        setMessages(failed([], error))
        setAuditEvents(failed([], error))
      })

    apiClient
      .listApprovalPage(identity, {
        statuses: approvalQueueStatuses,
        limit: queuePageSize,
        offset: 0
      })
      .then((page) => {
        if (!active || !isCurrentIdentity(scope)) return
        setApprovals(loaded(page.items))
        setApprovalPageInfo(page.pageInfo)
      })
      .catch((error: unknown) => {
        if (active && isCurrentIdentity(scope)) setApprovals(failed([], error))
      })

    apiClient
      .listTaskPage(identity, {
        statuses: activeTaskStatuses,
        limit: queuePageSize,
        offset: 0
      })
      .then((page) => {
        if (!active || !isCurrentIdentity(scope)) return
        setTasks(loaded(page.items))
        setTaskPageInfo(page.pageInfo)
      })
      .catch((error: unknown) => {
        if (active && isCurrentIdentity(scope)) setTasks(failed([], error))
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
      .catch((error: unknown) => {
        if (active && isCurrentViewScope(scope)) setMessages(failed([], error))
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
      .catch((error: unknown) => {
        if (active && isCurrentViewScope(scope))
          setAuditEvents(failed([], error))
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
      .catch((error: unknown) => {
        if (active && isCurrentViewScope(scope))
          setAuditEvidence(failed(null, error))
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
      .catch((error: unknown) => {
        if (active && isCurrentViewScope(scope))
          setAuditEvidenceCheckpoint(failed(null, error))
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

  const loadApprovalQueuePage = (identity: OperatorIdentity, offset: number) =>
    fetchQueuePage(
      (pageOffset) =>
        apiClient.listApprovalPage(identity, {
          statuses: approvalQueueStatuses,
          limit: queuePageSize,
          offset: pageOffset
        }),
      offset
    )

  const refreshApprovals = async (
    scope = viewScopeToken,
    offset = approvalPageInfo?.offset ?? 0
  ) => {
    const identity = currentOperatorIdentity()
    if (!identity || !isCurrentViewScope(scope)) return
    const page = await loadApprovalQueuePage(identity, offset)
    if (!isCurrentViewScope(scope)) return
    setApprovals(loaded(page.items))
    setApprovalPageInfo(page.pageInfo)
  }

  // The queue depends on the identity, not on the selected conversation, so
  // page navigation is guarded by the identity scope: selecting a case while
  // a page loads cannot strand the panel in its loading state.
  const goToApprovalPage = (offset: number) => {
    const identity = currentOperatorIdentity()
    if (!identity) return
    const scope = identityKey
    const previous = approvals.data
    setApprovals(loading(previous))
    loadApprovalQueuePage(identity, Math.max(0, offset))
      .then((page) => {
        if (!isCurrentIdentity(scope)) return
        setApprovals(loaded(page.items))
        setApprovalPageInfo(page.pageInfo)
      })
      .catch((error: unknown) => {
        if (isCurrentIdentity(scope)) setApprovals(failed(previous, error))
      })
  }

  /**
   * SPEC 0269 — appends the next conversation page. Returns the grown list and
   * the page info, `'stale'` when the view changed meanwhile (the page is
   * discarded) or `'failed'` when the request failed.
   */
  const fetchMoreConversations = async (
    loadedItems: ConversationView[],
    pageInfo: ListPageInfo
  ): Promise<
    { items: ConversationView[]; pageInfo: ListPageInfo } | 'stale' | 'failed'
  > => {
    const identity = currentOperatorIdentity()
    const scope = viewScopeToken
    if (!identity) return 'stale'
    try {
      const page = await apiClient.listConversations(identity, {
        limit: pageInfo.limit,
        offset: pageInfo.offset + pageInfo.limit
      })
      if (!isCurrentViewScope(scope)) return 'stale'
      const known = new Set(loadedItems.map((item) => item.id))
      const items = [
        ...loadedItems,
        ...page.items.filter((item) => !known.has(item.id))
      ]
      setConversations(loaded(items))
      setConversationPageInfo(page.pageInfo)
      return { items, pageInfo: page.pageInfo }
    } catch {
      return isCurrentViewScope(scope) ? 'failed' : 'stale'
    }
  }

  const loadMoreConversations = async () => {
    if (!conversationPageInfo?.hasNextPage || isLoadingMoreConversations) return
    const scope = viewScopeToken
    setIsLoadingMoreConversations(true)
    try {
      await fetchMoreConversations(conversations.data, conversationPageInfo)
    } finally {
      if (isCurrentViewScope(scope)) setIsLoadingMoreConversations(false)
    }
  }

  const openApprovalCase = async (sessionId: string) => {
    let items = conversations.data
    let pageInfo = conversationPageInfo
    let conversation = items.find((item) => item.openSessionId === sessionId)
    // The case may sit past the loaded pages: keep paging until it appears,
    // up to a ceiling so a missing case cannot walk a huge list.
    let pagesFetched = 0
    while (
      !conversation &&
      pageInfo?.hasNextPage &&
      pagesFetched < maxCaseSearchPages
    ) {
      const next = await fetchMoreConversations(items, pageInfo)
      // A changed view owns the screen now: say nothing about the old one.
      if (next === 'stale') return
      if (next === 'failed') {
        setApprovalMessage('Não foi possível carregar mais conversas.')
        return
      }
      pagesFetched += 1
      items = next.items
      pageInfo = next.pageInfo
      conversation = items.find((item) => item.openSessionId === sessionId)
    }
    if (conversation) {
      selectConversation(conversation)
    } else {
      setApprovalMessage(
        pageInfo?.hasNextPage
          ? 'Caso não encontrado nas conversas carregadas.'
          : 'Caso não encontrado entre as conversas.'
      )
    }
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

    // SPEC 0257 §7: one logical operation per tenant/operator/session/action.
    // Block a second click while a request is in flight.
    if (auditExportInFlight.current) return
    const operationScope = {
      tenantId: identity.tenantId,
      operatorId: identity.operatorId,
      sessionId: selectedSessionId,
      action: 'audit_evidence_export_review'
    }
    let operation
    try {
      operation = beginLogicalOperation(operationScope)
    } catch {
      setAuditEvidenceExportMessage(
        'Nao foi possivel guardar a operacao neste navegador; habilite o armazenamento da sessao e tente de novo.'
      )
      return
    }
    auditExportInFlight.current = true
    setIsRequestingAuditEvidenceExport(true)
    setAuditEvidenceExportMessage(null)
    try {
      const created = await apiClient.requestAuditEvidenceExportApproval({
        identity,
        sessionId: selectedSessionId,
        idempotencyKey: operation.key
      })
      try {
        resolveLogicalOperation(operationScope, created.id)
      } catch {
        // The request was accepted; a registry failure only affects a next one.
      }
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
      auditExportInFlight.current = false
      if (isCurrentViewScope(scope)) setIsRequestingAuditEvidenceExport(false)
    }
  }

  const loadActiveTaskPage = (identity: OperatorIdentity, offset: number) =>
    fetchQueuePage(
      (pageOffset) =>
        apiClient.listTaskPage(identity, {
          statuses: activeTaskStatuses,
          limit: queuePageSize,
          offset: pageOffset
        }),
      offset
    )

  const refreshTasks = async (
    scope = viewScopeToken,
    offset = taskPageInfo?.offset ?? 0
  ) => {
    const identity = currentOperatorIdentity()
    if (!identity || !isCurrentViewScope(scope)) return
    const page = await loadActiveTaskPage(identity, offset)
    if (!isCurrentViewScope(scope)) return
    setTasks(loaded(page.items))
    setTaskPageInfo(page.pageInfo)
  }

  // Same identity-scoped guard as the approval queue navigation.
  const goToTaskPage = (offset: number) => {
    const identity = currentOperatorIdentity()
    if (!identity) return
    const scope = identityKey
    const previous = tasks.data
    setTasks(loading(previous))
    loadActiveTaskPage(identity, Math.max(0, offset))
      .then((page) => {
        if (!isCurrentIdentity(scope)) return
        setTasks(loaded(page.items))
        setTaskPageInfo(page.pageInfo)
      })
      .catch((error: unknown) => {
        if (isCurrentIdentity(scope)) setTasks(failed(previous, error))
      })
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
      // SPEC0251 §4.4: 404 means the item is no longer available to this
      // operator (case not assigned or revoked); same reload as the 409.
      const unavailable = isUnavailableItem(error)
      if (isApiConflict(error) || unavailable) {
        try {
          await refreshApprovals(scope)
          await refreshAudit(scope)
          if (isCurrentViewScope(scope))
            setApprovalMessage(
              unavailable
                ? unavailableItemMessage
                : 'Esta aprovacao ja foi decidida. A fila foi atualizada.'
            )
        } catch {
          if (isCurrentViewScope(scope)) setApprovals(failed(approvals.data))
        }
      } else {
        setApprovals(failed(approvals.data, error))
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
    setTaskMessage(null)
    setTaskActionId(taskId)
    try {
      await apiClient.updateTaskStatus({ taskId, status, identity })
      if (!isCurrentViewScope(scope)) return
      await refreshTasks(scope)
      await refreshAudit(scope)
    } catch (error) {
      if (!isCurrentViewScope(scope)) return
      // SPEC0250 §3.6: a transition rejected because the task already moved
      // (conflict or invalid transition) reloads the current page.
      // SPEC0251 §4.4: a 404 (task no longer available to this operator)
      // reloads it too and says so in the task panel.
      const unavailable = isUnavailableItem(error)
      if (
        isApiConflict(error) ||
        unavailable ||
        (error instanceof ApiRequestError && error.code === 'invalid_action')
      ) {
        try {
          await refreshTasks(scope)
          if (unavailable && isCurrentViewScope(scope))
            setTaskMessage(unavailableItemMessage)
          return
        } catch {
          // fall through to the failed state below
        }
      }
      if (isCurrentViewScope(scope)) setTasks(failed(tasks.data, error))
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
    reauthenticating: 'Reautenticando…',
    unavailable: 'Sessão indisponível',
    configuration_error: 'Configuração inválida'
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
              ) : oidcMode ? (
                sessionStatus === 'unavailable' ? (
                  <button
                    type="button"
                    className="sessionButton"
                    ref={sessionActionRef}
                    onClick={() => void loadTrustedSession('reauthenticating')}
                  >
                    Tentar novamente
                  </button>
                ) : sessionStatus === 'authentication_required' ||
                  sessionStatus === 'expired' ? (
                  <button
                    type="button"
                    className="sessionButton"
                    ref={sessionActionRef}
                    disabled={loginOpening}
                    onClick={() => void startOidcLogin()}
                  >
                    Entrar
                  </button>
                ) : null
              ) : (
                <button
                  type="button"
                  className="sessionButton"
                  ref={sessionActionRef}
                  onClick={() => void loadTrustedSession('reauthenticating')}
                >
                  {sessionStatus === 'unavailable'
                    ? 'Tentar novamente'
                    : 'Reautenticar'}
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
          <p
            className="sessionNotice"
            role="status"
            ref={sessionNoticeRef}
            tabIndex={-1}
          >
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
          pageInfo={conversationPageInfo}
          isLoadingMore={isLoadingMoreConversations}
          onLoadMore={() => void loadMoreConversations()}
          onSelectConversation={selectConversation}
        />
        <ApprovalsPanel
          message={approvalMessage}
          approvals={approvals.data}
          pageInfo={approvalPageInfo}
          onPreviousPage={() =>
            goToApprovalPage(
              (approvalPageInfo?.offset ?? 0) -
                (approvalPageInfo?.limit ?? queuePageSize)
            )
          }
          onNextPage={() =>
            goToApprovalPage(
              (approvalPageInfo?.offset ?? 0) +
                (approvalPageInfo?.limit ?? queuePageSize)
            )
          }
          openableSessionIds={conversations.data.flatMap((conversation) =>
            conversation.openSessionId ? [conversation.openSessionId] : []
          )}
          searchUnloadedCases={conversationPageInfo?.hasNextPage ?? false}
          onOpenCase={(sessionId) => void openApprovalCase(sessionId)}
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
          message={taskMessage}
          tasks={tasks.data}
          pageInfo={taskPageInfo}
          onPreviousPage={() =>
            goToTaskPage(
              (taskPageInfo?.offset ?? 0) -
                (taskPageInfo?.limit ?? queuePageSize)
            )
          }
          onNextPage={() =>
            goToTaskPage(
              (taskPageInfo?.offset ?? 0) +
                (taskPageInfo?.limit ?? queuePageSize)
            )
          }
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
