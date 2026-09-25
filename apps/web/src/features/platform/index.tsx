import { useEffect, useRef, useState } from 'react'
import {
  apiClient,
  isApiConflict,
  type OperatorIdentity,
  type PlatformAgentView,
  type PlatformKnowledgeSourceStatus,
  type PlatformKnowledgeSourceView,
  type PlatformReleaseCandidateGateKey,
  type PlatformReleaseCandidateStatus,
  type PlatformReleaseCandidateView,
  type PlatformPluginCatalogView,
  type PlatformPluginCatalogStatus,
  type PlatformTestSuiteRunView,
  type PlatformTestSuiteView,
  type PlatformTraceView,
  type PlatformVersionView
} from '../../api/client.ts'
import {
  buildConfig,
  buildPluginCatalogManifest,
  formFromVersion,
  traceText,
  type DraftForm,
  type HandoffPriority,
  initialForm
} from './draft-helpers.ts'
import { TraceViewer } from './TraceViewer.tsx'

interface PlatformPanelProps {
  identity: OperatorIdentity & { tenantId: string }
}

const controlledReleaseGateDefaults: Array<{
  key: PlatformReleaseCandidateGateKey
  evidenceRef: string
}> = [
  {
    key: 'safety_preflight',
    evidenceRef: 'controlled://evidence/safety-preflight-v1'
  },
  {
    key: 'test_lab_regression',
    evidenceRef: 'controlled://evidence/test-lab-regression-v1'
  },
  {
    key: 'snapshot_integrity',
    evidenceRef: 'controlled://evidence/snapshot-integrity-v1'
  },
  {
    key: 'external_boundary',
    evidenceRef: 'controlled://evidence/external-boundary-v1'
  }
]

export function PlatformPanel({ identity }: PlatformPanelProps) {
  const [agents, setAgents] = useState<PlatformAgentView[]>([])
  const [form, setForm] = useState<DraftForm>(initialForm)
  const [selectedAgent, setSelectedAgent] = useState<PlatformAgentView | null>(
    null
  )
  const [versions, setVersions] = useState<PlatformVersionView[]>([])
  const [version, setVersion] = useState<PlatformVersionView | null>(null)
  const [testMessage, setTestMessage] = useState('')
  const [trace, setTrace] = useState<PlatformTraceView | null>(null)
  const [traceHistory, setTraceHistory] = useState<PlatformTraceView[]>([])
  const [testSuites, setTestSuites] = useState<PlatformTestSuiteView[]>([])
  const [selectedSuite, setSelectedSuite] =
    useState<PlatformTestSuiteView | null>(null)
  const [suiteRun, setSuiteRun] = useState<PlatformTestSuiteRunView | null>(
    null
  )
  const [pluginCatalog, setPluginCatalog] = useState<
    PlatformPluginCatalogView[]
  >([])
  const [pluginCatalogLoaded, setPluginCatalogLoaded] = useState(false)
  const [knowledgeSources, setKnowledgeSources] = useState<
    PlatformKnowledgeSourceView[]
  >([])
  const [knowledgeSourcesLoaded, setKnowledgeSourcesLoaded] = useState(false)
  const [knowledgeCatalogSource, setKnowledgeCatalogSource] = useState(
    'controlled://institutional-hours'
  )
  const [knowledgeCatalogVersion, setKnowledgeCatalogVersion] = useState('v1')
  const [knowledgeLabel, setKnowledgeLabel] = useState('Horários fictícios')
  const [knowledgeDescription, setKnowledgeDescription] = useState(
    'Metadata controlada sem conteúdo documental.'
  )
  const [releaseCandidates, setReleaseCandidates] = useState<
    PlatformReleaseCandidateView[]
  >([])
  const [releaseCandidatesLoaded, setReleaseCandidatesLoaded] = useState(false)
  const [releaseValidatorId, setReleaseValidatorId] = useState(
    'approver.controlled'
  )
  const [releaseGateRefs, setReleaseGateRefs] = useState<
    Record<PlatformReleaseCandidateGateKey, string>
  >(
    Object.fromEntries(
      controlledReleaseGateDefaults.map((gate) => [gate.key, gate.evidenceRef])
    ) as Record<PlatformReleaseCandidateGateKey, string>
  )
  const [releaseGateStatuses, setReleaseGateStatuses] = useState<
    Record<PlatformReleaseCandidateGateKey, 'PASS' | 'FAIL'>
  >({
    safety_preflight: 'PASS',
    test_lab_regression: 'PASS',
    snapshot_integrity: 'PASS',
    external_boundary: 'PASS'
  })
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const agentScopeRef = useRef(0)
  const identityKey = `${identity.operatorId}\u0000${identity.role}\u0000${identity.tenantId}`
  const previousIdentityKeyRef = useRef(identityKey)
  const identityChanged = previousIdentityKeyRef.current !== identityKey
  if (identityChanged) {
    previousIdentityKeyRef.current = identityKey
    agentScopeRef.current += 1
  }
  const runIfCurrent = <T,>(
    scope: number,
    effect: () => T,
    active = true
  ): T | undefined => {
    if (active && agentScopeRef.current === scope) return effect()
    return undefined
  }

  const clearAgentScopedState = () => {
    agentScopeRef.current += 1
    setVersions([])
    setVersion(null)
    setTrace(null)
    setTestMessage('')
    setTestSuites([])
    setSelectedSuite(null)
    setSuiteRun(null)
    setReleaseCandidates([])
    setReleaseCandidatesLoaded(false)
    setStatusMessage(null)
    setError(null)
    setIsSaving(false)
  }

  const clearTenantScopedState = () => {
    clearAgentScopedState()
    setAgents([])
    setTraceHistory([])
    setPluginCatalog([])
    setPluginCatalogLoaded(false)
    setKnowledgeSources([])
    setKnowledgeSourcesLoaded(false)
  }

  const startNewAgent = () => {
    clearAgentScopedState()
    setSelectedAgent(null)
    setForm(initialForm)
  }

  const selectAgent = (agent: PlatformAgentView) => {
    if (selectedAgent?.id === agent.id) return
    clearAgentScopedState()
    setSelectedAgent(agent)
    setForm(initialForm)
  }

  useEffect(() => {
    let active = true
    if (identityChanged) {
      clearTenantScopedState()
      setSelectedAgent(null)
      setForm(initialForm)
    }
    const scope = agentScopeRef.current
    setIsLoading(true)
    apiClient
      .listPlatformAgents(identity)
      .then((items) => {
        runIfCurrent(
          scope,
          () => {
            setAgents(items)
            setSelectedAgent(items[0] ?? null)
          },
          active
        )
      })
      .catch(() => {
        runIfCurrent(
          scope,
          () => setError('Não foi possível carregar os agentes.'),
          active
        )
      })
      .finally(() => {
        runIfCurrent(scope, () => setIsLoading(false), active)
      })
    return () => {
      active = false
    }
  }, [identity.operatorId, identity.role, identity.tenantId])

  useEffect(() => {
    let active = true
    const scope = agentScopeRef.current
    Promise.all([
      apiClient.listPlatformTestRuns(identity, 10),
      apiClient.listPlatformExecutionTraces(identity, 10)
    ])
      .then(([testRuns, executionTraces]) => {
        runIfCurrent(
          scope,
          () => setTraceHistory([...executionTraces, ...testRuns]),
          active
        )
      })
      .catch(() => {
        runIfCurrent(scope, () => setTraceHistory([]), active)
      })
    return () => {
      active = false
    }
  }, [identity.operatorId, identity.role, identity.tenantId])

  useEffect(() => {
    if (identityChanged) return
    if (!selectedAgent) {
      setVersions([])
      setVersion(null)
      return
    }
    let active = true
    const scope = agentScopeRef.current
    setVersion(null)
    apiClient
      .listPlatformVersions(identity, selectedAgent.id)
      .then((items) => {
        runIfCurrent(
          scope,
          () => {
            setVersions(items)
            const latest = items[0] ?? null
            setVersion(latest)
            if (latest) setForm(formFromVersion(selectedAgent, latest.config))
          },
          active
        )
      })
      .catch(() => {
        runIfCurrent(
          scope,
          () => setError('Não foi possível carregar as versões.'),
          active
        )
      })
    return () => {
      active = false
    }
  }, [identity.operatorId, identity.role, identity.tenantId, selectedAgent?.id])

  const updateForm = (key: keyof DraftForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const createDraft = async () => {
    const scope = agentScopeRef.current
    setIsSaving(true)
    setError(null)
    setStatusMessage(null)
    try {
      if (selectedAgent) {
        if (!version) {
          setError('Aguarde o carregamento da versão antes de editar o agente.')
          return
        }
        const config = buildConfig(form, version.config)
        if ('error' in config) {
          setError(config.error)
          return
        }
        const createdVersion = await apiClient.clonePlatformVersion({
          identity,
          agentId: selectedAgent.id,
          versionId: version.id,
          config: config.value
        })
        await runIfCurrent(scope, async () => {
          const refreshed = await apiClient.listPlatformVersions(
            identity,
            selectedAgent.id
          )
          runIfCurrent(scope, () => {
            setVersions(refreshed)
            setVersion(createdVersion)
            setForm(formFromVersion(selectedAgent, createdVersion.config))
            setStatusMessage(`Nova versão v${createdVersion.version} criada.`)
          })
        })
        return
      }
      const config = buildConfig(form)
      if ('error' in config) {
        setError(config.error)
        return
      }
      const agent = await apiClient.createPlatformAgent({
        identity,
        slug: form.slug,
        name: form.name,
        description: form.description
      })
      await runIfCurrent(scope, async () => {
        const createdVersion = await apiClient.createPlatformVersion({
          identity,
          agentId: agent.id,
          config: config.value
        })
        runIfCurrent(scope, () => {
          setAgents((current) => [...current, agent])
          setSelectedAgent(agent)
          setVersions([createdVersion])
          setVersion(createdVersion)
          setForm(formFromVersion(agent, createdVersion.config))
          setStatusMessage(`Rascunho v${createdVersion.version ?? 1} criado.`)
        })
      })
    } catch {
      runIfCurrent(scope, () => setError('Não foi possível criar o rascunho.'))
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const transition = async (target: 'TESTING' | 'APPROVED') => {
    if (!selectedAgent || !version) return
    const scope = agentScopeRef.current
    setIsSaving(true)
    setError(null)
    try {
      const updated = await apiClient.transitionPlatformVersion({
        identity,
        agentId: selectedAgent.id,
        versionId: version.id,
        target,
        expectedStatus: version.status
      })
      runIfCurrent(scope, () => {
        setVersion(updated)
        setVersions((current) =>
          current.map((candidate) =>
            candidate.id === updated.id ? updated : candidate
          )
        )
        setStatusMessage(`Versão movida para ${updated.status}.`)
      })
    } catch (error) {
      runIfCurrent(scope, () =>
        setError(
          isApiConflict(error)
            ? 'A versão mudou em outro operador. Recarregue o agente antes de tentar novamente.'
            : 'Transição de versão recusada pela policy.'
        )
      )
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const publish = async () => {
    if (!selectedAgent || !version) return
    const scope = agentScopeRef.current
    setIsSaving(true)
    setError(null)
    try {
      const releaseCandidate = releaseCandidates.find(
        (candidate) =>
          candidate.agentId === selectedAgent.id &&
          candidate.versionId === version.id &&
          candidate.status === 'VALIDATED'
      )
      if (!releaseCandidate) {
        setError(
          'Valide um release candidate para esta versão antes de publicar.'
        )
        return
      }
      const preflight = await apiClient.runPlatformSafetyPreflight({
        identity,
        agentId: selectedAgent.id,
        versionId: version.id
      })
      await runIfCurrent(scope, async () => {
        if (!preflight.passed) {
          setError(
            `Preflight crítico recusou a publicação (${preflight.failures.length} case(s) falho(s)).`
          )
          return
        }
        await runIfCurrent(scope, async () => {
          const published = await apiClient.publishPlatformVersion({
            identity,
            agentId: selectedAgent.id,
            versionId: version.id,
            releaseCandidateId: releaseCandidate.id,
            expectedStatus: version.status
          })
          runIfCurrent(scope, () => {
            setVersion(published)
            setVersions((current) =>
              current.map((candidate) =>
                candidate.id === published.id ? published : candidate
              )
            )
            setStatusMessage('Versão publicada como snapshot imutável.')
          })
        })
      })
    } catch (error) {
      runIfCurrent(scope, () =>
        setError(
          isApiConflict(error)
            ? 'A versão mudou em outro operador. Recarregue o agente antes de publicar.'
            : error instanceof Error && /safety preflight/i.test(error.message)
              ? 'Preflight crítico recusou a publicação; nenhuma mutação foi aplicada.'
              : 'Somente uma versão aprovada pode ser publicada.'
        )
      )
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const rollbackTarget = version
    ? versions.find(
        (candidate) =>
          candidate.id !== version.id &&
          candidate.status !== 'DRAFT' &&
          candidate.status !== 'TESTING'
      )
    : null

  const rollback = async () => {
    if (!selectedAgent || !rollbackTarget) return
    const scope = agentScopeRef.current
    setIsSaving(true)
    setError(null)
    try {
      const releaseCandidate = releaseCandidates.find(
        (candidate) =>
          candidate.agentId === selectedAgent.id &&
          candidate.versionId === rollbackTarget.id &&
          candidate.status === 'VALIDATED'
      )
      if (!releaseCandidate) {
        setError(
          'Valide um release candidate para a versão fonte antes do rollback.'
        )
        return
      }
      const rolledBack = await apiClient.rollbackPlatformVersion({
        identity,
        agentId: selectedAgent.id,
        versionId: rollbackTarget.id,
        releaseCandidateId: releaseCandidate.id,
        expectedStatus: rollbackTarget.status
      })
      await runIfCurrent(scope, async () => {
        const refreshed = await apiClient.listPlatformVersions(
          identity,
          selectedAgent.id
        )
        runIfCurrent(scope, () => {
          setVersions(refreshed)
          setVersion(rolledBack)
          setStatusMessage(
            `Rollback criou e publicou a versão v${rolledBack.version}.`
          )
        })
      })
    } catch (error) {
      runIfCurrent(scope, () =>
        setError(
          isApiConflict(error)
            ? 'O alvo do rollback mudou em outro operador. Recarregue o agente.'
            : 'O rollback foi recusado pela policy de versões.'
        )
      )
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const runTest = async () => {
    if (!selectedAgent || !version || !testMessage.trim()) return
    const scope = agentScopeRef.current
    setIsSaving(true)
    setError(null)
    try {
      const result = await apiClient.runPlatformTestLab({
        identity,
        agentId: selectedAgent.id,
        versionId: version.id,
        message: testMessage,
        ...(form.knowledgeSource
          ? {
              approvedKnowledge: {
                version: form.knowledgeVersion.trim() || 'controlled-v1',
                answer: 'Resposta institucional fictícia.',
                source: form.knowledgeSource
              }
            }
          : {})
      })
      runIfCurrent(scope, () => {
        setTrace(result)
        setTraceHistory((current) => [
          result,
          ...current.filter((item) => item.traceId !== result.traceId)
        ])
        setStatusMessage('Dry-run concluído sem chamada externa.')
      })
    } catch {
      runIfCurrent(scope, () => setError('O Test Lab recusou esta entrada.'))
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const loadTestSuites = async () => {
    if (!selectedAgent) return
    const scope = agentScopeRef.current
    const agentId = selectedAgent.id
    setError(null)
    try {
      const suites = await apiClient.listPlatformTestSuites(identity, agentId)
      runIfCurrent(scope, () => {
        setTestSuites(suites)
        setSelectedSuite(suites[0] ?? null)
        setSuiteRun(null)
      })
    } catch {
      runIfCurrent(scope, () =>
        setError('Não foi possível carregar as suites do Test Lab.')
      )
    }
  }

  const createTestSuite = async () => {
    if (!selectedAgent || !version) return
    const scope = agentScopeRef.current
    setIsSaving(true)
    setError(null)
    try {
      const suite = await apiClient.createPlatformTestSuite({
        identity,
        slug: `${selectedAgent.slug}-smoke-suite`,
        name: `${selectedAgent.name} Smoke Suite`,
        description: 'Suite fictícia controlada.',
        agentId: selectedAgent.id,
        versionId: version.id,
        cases: [
          {
            id: 'safe-greeting',
            message: 'Olá',
            history: [],
            expectedResponseMode: 'clarify',
            expectedHandoff: false
          }
        ]
      })
      runIfCurrent(scope, () => {
        setTestSuites((current) => [suite, ...current])
        setSelectedSuite(suite)
        setStatusMessage('Suite controlada criada como snapshot imutável.')
      })
    } catch {
      runIfCurrent(scope, () =>
        setError('Não foi possível criar a suite controlada.')
      )
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const evaluateSelectedSuite = async () => {
    if (!selectedSuite || !version) return
    const scope = agentScopeRef.current
    setIsSaving(true)
    setError(null)
    try {
      const run = await apiClient.evaluatePlatformTestSuite({
        identity,
        suiteId: selectedSuite.id,
        versionId: version.id
      })
      runIfCurrent(scope, () => {
        setSuiteRun(run)
        setStatusMessage('Suite avaliada em dry-run sem chamada externa.')
      })
    } catch {
      runIfCurrent(scope, () =>
        setError('A avaliação da suite foi recusada pelo Test Lab.')
      )
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const compareSelectedSuite = async () => {
    if (!selectedSuite || !version) return
    const scope = agentScopeRef.current
    setIsSaving(true)
    setError(null)
    try {
      const run = await apiClient.comparePlatformTestSuite({
        identity,
        suiteId: selectedSuite.id,
        versionAId: selectedSuite.versionId,
        versionBId: version.id
      })
      runIfCurrent(scope, () => {
        setSuiteRun(run)
        setStatusMessage('Comparação A/B concluída somente no Test Lab.')
      })
    } catch {
      runIfCurrent(scope, () =>
        setError('A comparação A/B foi recusada por escopo de versão.')
      )
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const loadPluginCatalog = async () => {
    const scope = agentScopeRef.current
    setIsSaving(true)
    setError(null)
    try {
      const entries = await apiClient.listPlatformPluginCatalog(identity)
      runIfCurrent(scope, () => {
        setPluginCatalog(entries)
        setPluginCatalogLoaded(true)
      })
    } catch {
      runIfCurrent(scope, () =>
        setError('Não foi possível carregar o catálogo de plugins.')
      )
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const createPluginCatalogEntry = async () => {
    const manifest = buildPluginCatalogManifest(form)
    if ('error' in manifest) {
      setError(manifest.error)
      return
    }
    setIsSaving(true)
    const scope = agentScopeRef.current
    setError(null)
    try {
      const entry = await apiClient.createPlatformPluginCatalog({
        identity,
        manifest: manifest.value
      })
      runIfCurrent(scope, () => {
        setPluginCatalog((current) => [entry, ...current])
        setPluginCatalogLoaded(true)
        setStatusMessage('Metadata do plugin criada como DRAFT.')
      })
    } catch {
      runIfCurrent(scope, () =>
        setError('Não foi possível criar a metadata do plugin.')
      )
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const transitionPluginCatalogEntry = async (
    entry: PlatformPluginCatalogView,
    target: PlatformPluginCatalogStatus
  ) => {
    const scope = agentScopeRef.current
    setIsSaving(true)
    setError(null)
    try {
      const updated = await apiClient.transitionPlatformPluginCatalog({
        identity,
        pluginId: entry.id,
        target,
        expectedStatus: entry.status
      })
      runIfCurrent(scope, () => {
        setPluginCatalog((current) =>
          current.map((candidate) =>
            candidate.id === updated.id ? updated : candidate
          )
        )
        setStatusMessage(
          target === 'APPROVED'
            ? 'Metadata do plugin aprovada; execução continua bloqueada.'
            : 'Metadata do plugin arquivada; execução continua bloqueada.'
        )
      })
    } catch (error) {
      runIfCurrent(scope, () =>
        setError(
          isApiConflict(error)
            ? 'O metadata do plugin mudou em outro operador. Recarregue o catálogo antes de tentar novamente.'
            : 'A transição da metadata do plugin foi recusada.'
        )
      )
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const loadKnowledgeSources = async () => {
    const scope = agentScopeRef.current
    setError(null)
    try {
      const sources = await apiClient.listPlatformKnowledgeSources(identity)
      runIfCurrent(scope, () => {
        setKnowledgeSources(sources)
        setKnowledgeSourcesLoaded(true)
      })
    } catch {
      runIfCurrent(scope, () =>
        setError('Não foi possível carregar o catálogo de fontes de knowledge.')
      )
    }
  }

  const createKnowledgeSource = async () => {
    const source =
      knowledgeCatalogSource.trim() || 'controlled://institutional-hours'
    const version = knowledgeCatalogVersion.trim() || 'v1'
    const scope = agentScopeRef.current
    setIsSaving(true)
    setError(null)
    try {
      const created = await apiClient.createPlatformKnowledgeSource({
        identity,
        source,
        version,
        label: knowledgeLabel.trim() || 'Fonte controlada',
        description: knowledgeDescription.trim()
      })
      runIfCurrent(scope, () => {
        setKnowledgeSources((current) => [created, ...current])
        setKnowledgeSourcesLoaded(true)
        setStatusMessage(
          'Metadata da fonte criada como DRAFT; sem conteúdo/RAG.'
        )
      })
    } catch {
      runIfCurrent(scope, () =>
        setError('Não foi possível criar a metadata da fonte de knowledge.')
      )
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const transitionKnowledgeSource = async (
    source: PlatformKnowledgeSourceView,
    target: PlatformKnowledgeSourceStatus
  ) => {
    const scope = agentScopeRef.current
    setIsSaving(true)
    setError(null)
    try {
      const updated = await apiClient.transitionPlatformKnowledgeSource({
        identity,
        sourceId: source.id,
        target,
        expectedStatus: source.status
      })
      runIfCurrent(scope, () => {
        setKnowledgeSources((current) =>
          current.map((candidate) =>
            candidate.id === updated.id ? updated : candidate
          )
        )
        setStatusMessage(
          target === 'APPROVED'
            ? 'Fonte de knowledge aprovada; catálogo metadata-only.'
            : 'Fonte de knowledge arquivada; catálogo metadata-only.'
        )
      })
    } catch (error) {
      runIfCurrent(scope, () =>
        setError(
          isApiConflict(error)
            ? 'A fonte de knowledge mudou em outro operador. Recarregue o catálogo antes de tentar novamente.'
            : 'A transição da fonte de knowledge foi recusada.'
        )
      )
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const loadReleaseCandidates = async () => {
    if (!selectedAgent) return
    const scope = agentScopeRef.current
    const agentId = selectedAgent.id
    setError(null)
    try {
      const candidates = await apiClient.listPlatformReleaseCandidates(
        identity,
        agentId
      )
      runIfCurrent(scope, () => {
        setReleaseCandidates(candidates)
        setReleaseCandidatesLoaded(true)
      })
    } catch {
      runIfCurrent(scope, () =>
        setError('Não foi possível carregar o ledger de release candidates.')
      )
    }
  }

  const createReleaseCandidate = async () => {
    if (!selectedAgent || !version) return
    const scope = agentScopeRef.current
    setIsSaving(true)
    setError(null)
    try {
      const candidate = await apiClient.createPlatformReleaseCandidate({
        identity,
        agentId: selectedAgent.id,
        versionId: version.id,
        gateResults: controlledReleaseGateDefaults.map((gate) => ({
          key: gate.key,
          status: releaseGateStatuses[gate.key],
          evidenceRef: releaseGateRefs[gate.key].trim()
        }))
      })
      runIfCurrent(scope, () => {
        setReleaseCandidates((current) => [candidate, ...current])
        setReleaseCandidatesLoaded(true)
        setStatusMessage(
          'Evidência do release candidate registrada; nenhuma ativação foi feita.'
        )
      })
    } catch {
      runIfCurrent(scope, () =>
        setError('Não foi possível registrar a evidência controlada.')
      )
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const transitionReleaseCandidate = async (
    candidate: PlatformReleaseCandidateView,
    target: PlatformReleaseCandidateStatus
  ) => {
    const scope = agentScopeRef.current
    const validatorId = releaseValidatorId.trim()
    if (
      target === 'VALIDATED' &&
      (!validatorId || validatorId === identity.operatorId)
    ) {
      setError('A validação exige uma identidade diferente da criadora.')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const updated = await apiClient.transitionPlatformReleaseCandidate({
        identity:
          target === 'VALIDATED'
            ? { ...identity, operatorId: validatorId }
            : identity,
        candidateId: candidate.id,
        target,
        expectedStatus: candidate.status
      })
      runIfCurrent(scope, () => {
        setReleaseCandidates((current) =>
          current.map((item) => (item.id === updated.id ? updated : item))
        )
        setStatusMessage(
          target === 'VALIDATED'
            ? 'Atestação controlada validada; isto não é publish nem deploy.'
            : target === 'REJECTED'
              ? 'Atestação controlada rejeitada; nenhuma versão foi alterada.'
              : 'Atestação controlada arquivada; nenhuma versão foi alterada.'
        )
      })
    } catch (error) {
      runIfCurrent(scope, () =>
        setError(
          isApiConflict(error)
            ? 'O release candidate mudou em outro operador. Recarregue o ledger.'
            : 'A transição do release candidate foi recusada.'
        )
      )
    } finally {
      runIfCurrent(scope, () => setIsSaving(false))
    }
  }

  const visibleTraceHistory = selectedAgent
    ? traceHistory.filter((item) => item.agentId === selectedAgent.id)
    : []
  const safeTraceSpans = trace && Array.isArray(trace.spans) ? trace.spans : []

  return (
    <section
      className="panel platformPanel"
      id="platform-panel"
      aria-label="Control Center"
    >
      <div className="panelHeader">
        <div>
          <h2>Control Center</h2>
          <p>Agentes, versões e Test Lab — tenant controlado.</p>
        </div>
        <span className="status">{identity.tenantId}</span>
      </div>
      <nav className="platformNav" aria-label="Atalhos do Control Center">
        <a href="#platform-editor">Editor</a>
        <a href="#platform-test-lab">Test Lab</a>
        <a href="#platform-catalogs">Catálogos</a>
        <a href="#platform-release">Release ledger</a>
        <a href="#platform-traces">Traces</a>
      </nav>
      <div className="platformBody">
        <div className="platformAgents">
          <h3>Agentes</h3>
          {isLoading ? <p>Carregando...</p> : null}
          {!isLoading && agents.length === 0 ? (
            <p>Nenhum agente configurado.</p>
          ) : null}
          {agents.map((agent) => (
            <button
              className="row rowButton"
              aria-pressed={selectedAgent?.id === agent.id}
              disabled={isSaving}
              key={agent.id}
              type="button"
              onClick={() => selectAgent(agent)}
            >
              <strong>{agent.name}</strong>
              <span>{agent.slug}</span>
            </button>
          ))}
        </div>
        <div className="platformEditor" id="platform-editor">
          <h3>Novo agente / configuração</h3>
          <div className="platformFields">
            <label>
              Slug do agente
              <input
                value={form.slug}
                readOnly={Boolean(selectedAgent)}
                onChange={(event) => updateForm('slug', event.target.value)}
              />
            </label>
            <label>
              Nome do agente
              <input
                value={form.name}
                readOnly={Boolean(selectedAgent)}
                onChange={(event) => updateForm('name', event.target.value)}
              />
            </label>
            <label>
              Descrição
              <input
                value={form.description}
                readOnly={Boolean(selectedAgent)}
                onChange={(event) =>
                  updateForm('description', event.target.value)
                }
              />
            </label>
            <label>
              Nome da persona
              <input
                value={form.personaName}
                onChange={(event) =>
                  updateForm('personaName', event.target.value)
                }
              />
            </label>
            <label>
              Papel da persona
              <input
                value={form.personaRole}
                onChange={(event) =>
                  updateForm('personaRole', event.target.value)
                }
              />
            </label>
            <label>
              Tom da persona
              <input
                value={form.tone}
                onChange={(event) => updateForm('tone', event.target.value)}
              />
            </label>
            <label>
              Saudação
              <input
                value={form.greeting}
                onChange={(event) => updateForm('greeting', event.target.value)}
              />
            </label>
            <label>
              Prompt blocks JSON
              <textarea
                aria-label="Prompt blocks JSON"
                rows={10}
                value={form.promptBlocksText}
                onChange={(event) =>
                  updateForm('promptBlocksText', event.target.value)
                }
              />
            </label>
            <label>
              Response templates JSON
              <textarea
                aria-label="Response templates JSON"
                rows={8}
                value={form.responseTemplatesText}
                onChange={(event) =>
                  updateForm('responseTemplatesText', event.target.value)
                }
              />
            </label>
            <p>
              Blocos <code>system</code>/<code>safety</code> e respostas kernel
              são somente leitura. Alterações válidas criam uma nova versão; o
              checksum do perfil aparece no trace do Test Lab.
            </p>
            <label>
              Provider lógico
              <input
                value={form.provider}
                onChange={(event) => updateForm('provider', event.target.value)}
              />
            </label>
            <label>
              Modelo lógico
              <input
                value={form.model}
                onChange={(event) => updateForm('model', event.target.value)}
              />
            </label>
            <label>
              Threshold de clarificação
              <input
                inputMode="decimal"
                value={form.clarifyThreshold}
                onChange={(event) =>
                  updateForm('clarifyThreshold', event.target.value)
                }
              />
            </label>
            <label>
              Threshold de handoff
              <input
                inputMode="decimal"
                value={form.handoffThreshold}
                onChange={(event) =>
                  updateForm('handoffThreshold', event.target.value)
                }
              />
            </label>
            <label>
              Máximo de clarificações
              <input
                inputMode="numeric"
                type="number"
                min="0"
                max="5"
                step="1"
                value={form.maxClarifications}
                onChange={(event) =>
                  updateForm('maxClarifications', event.target.value)
                }
              />
            </label>
            <label>
              Destinos de handoff
              <input
                value={form.handoffDestinations}
                onChange={(event) =>
                  updateForm('handoffDestinations', event.target.value)
                }
                placeholder="controlled-reception, controlled-supervisor"
              />
            </label>
            <label>
              Prioridade de handoff
              <select
                value={form.handoffPriority}
                onChange={(event) =>
                  updateForm(
                    'handoffPriority',
                    event.target.value as HandoffPriority
                  )
                }
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
              </select>
            </label>
            <label>
              Fonte de knowledge controlada
              <input
                value={form.knowledgeSource}
                onChange={(event) =>
                  updateForm('knowledgeSource', event.target.value)
                }
                placeholder="controlled://source"
              />
            </label>
            <label>
              Versão da knowledge aprovada
              <input
                value={form.knowledgeVersion}
                onChange={(event) =>
                  updateForm('knowledgeVersion', event.target.value)
                }
                placeholder="controlled-v1"
              />
            </label>
            <label>
              Plugin lógico
              <input
                value={form.pluginName}
                onChange={(event) =>
                  updateForm('pluginName', event.target.value)
                }
                placeholder="fake.echo"
              />
            </label>
            <label>
              Versão pinned do plugin (opcional)
              <input
                value={form.pluginVersion}
                onChange={(event) =>
                  updateForm('pluginVersion', event.target.value)
                }
                placeholder="1.0.0"
              />
            </label>
            <label>
              Tools do plugin
              <input
                value={form.pluginTools}
                onChange={(event) =>
                  updateForm('pluginTools', event.target.value)
                }
                placeholder="echo,find_slots"
              />
            </label>
            <label>
              <input
                type="checkbox"
                aria-label="Plugin lógico habilitado"
                checked={form.pluginEnabled}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    pluginEnabled: event.target.checked
                  }))
                }
              />
              Plugin lógico habilitado
            </label>
            <label>
              <input
                type="checkbox"
                aria-label="Scheduling controlado"
                checked={form.schedulingEnabled}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    schedulingEnabled: event.target.checked
                  }))
                }
              />
              Scheduling controlado
            </label>
          </div>
          <div className="actions">
            <button
              type="button"
              disabled={isSaving || (Boolean(selectedAgent) && !version)}
              onClick={() => void createDraft()}
            >
              {selectedAgent
                ? version
                  ? 'Salvar nova versão'
                  : 'Carregando versão...'
                : 'Criar rascunho'}
            </button>
            {selectedAgent ? (
              <button type="button" disabled={isSaving} onClick={startNewAgent}>
                Novo agente
              </button>
            ) : null}
            {version?.status === 'DRAFT' ? (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void transition('TESTING')}
              >
                Enviar para teste
              </button>
            ) : null}
            {version?.status === 'TESTING' ? (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void transition('APPROVED')}
              >
                Aprovar versão
              </button>
            ) : null}
            {version?.status === 'APPROVED' ? (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void publish()}
              >
                Publicar versão
              </button>
            ) : null}
            {version?.status === 'PUBLISHED' && rollbackTarget ? (
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void rollback()}
              >
                Rollback para v{rollbackTarget.version}
              </button>
            ) : null}
          </div>
          {version ? (
            <p>
              Versão {version.version} — {version.status}
            </p>
          ) : null}
          <label>
            Mensagem fictícia para Test Lab
            <input
              value={testMessage}
              onChange={(event) => setTestMessage(event.target.value)}
              placeholder="Qual o horário de funcionamento?"
            />
          </label>
          <button
            type="button"
            disabled={isSaving || !version}
            onClick={() => void runTest()}
          >
            Executar dry-run
          </button>
          <section
            className="platformSuiteCatalog"
            id="platform-test-lab"
            aria-label="Catálogo de suites do Test Lab"
          >
            <div className="panelHeader">
              <div>
                <h3>Suites / regressão controlada</h3>
                <p>
                  Snapshots tenant-aware; avaliações A/B nunca publicam nem
                  despacham.
                </p>
              </div>
              <span className="status">{testSuites.length}</span>
            </div>
            <div className="actions">
              <button
                type="button"
                disabled={isSaving || !selectedAgent}
                onClick={() => void loadTestSuites()}
              >
                Carregar suites
              </button>
              <button
                type="button"
                disabled={isSaving || !selectedAgent || !version}
                onClick={() => void createTestSuite()}
              >
                Criar suite do agente
              </button>
              {selectedSuite ? (
                <>
                  <button
                    type="button"
                    disabled={isSaving || !version}
                    onClick={() => void evaluateSelectedSuite()}
                  >
                    Avaliar suite
                  </button>
                  <button
                    type="button"
                    disabled={isSaving || !version}
                    onClick={() => void compareSelectedSuite()}
                  >
                    Comparar A/B
                  </button>
                </>
              ) : null}
            </div>
            {testSuites.map((suite) => (
              <button
                className="row rowButton"
                key={suite.id}
                type="button"
                onClick={() => {
                  setSelectedSuite(suite)
                  setSuiteRun(null)
                }}
              >
                <strong>
                  {suite.name} v{suite.version}
                </strong>
                <span>
                  {suite.cases.length} caso(s) · {suite.versionId}
                </span>
              </button>
            ))}
            {suiteRun ? (
              <div
                className="platformTrace"
                aria-label="Resultado da suite do Test Lab"
              >
                <strong>{suiteRun.passed ? 'PASS' : 'FAIL'}</strong>
                {suiteRun.variants.map((variant) => (
                  <span key={variant.label}>
                    Variante {variant.label}:{' '}
                    {variant.passed ? 'passou' : 'falhou'} · {variant.versionId}
                  </span>
                ))}
              </div>
            ) : null}
          </section>
          <section
            className="platformPluginCatalog"
            id="platform-catalogs"
            aria-label="Catálogo declarativo de plugins"
          >
            <div className="panelHeader">
              <div>
                <h3>Plugins / catálogo declarativo</h3>
                <p>
                  Manifests tenant-aware para revisão; este catálogo não instala
                  código nem libera execução.
                </p>
              </div>
              <span className="status">{pluginCatalog.length}</span>
            </div>
            <div className="actions">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void loadPluginCatalog()}
              >
                Carregar catálogo de plugins
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void createPluginCatalogEntry()}
              >
                Criar metadata do plugin
              </button>
            </div>
            <p>APPROVED: metadata revisada; execução continua bloqueada.</p>
            {pluginCatalogLoaded && pluginCatalog.length === 0 ? (
              <p>Nenhum plugin catalogado.</p>
            ) : null}
            {pluginCatalog.map((entry) => (
              <div className="row" key={entry.id}>
                <strong>
                  {entry.manifest.name}@{entry.manifest.version}
                </strong>
                <span>Status: {entry.status}</span>
                <span>Criado por: {entry.createdBy}</span>
                <span>
                  Aprovado por: {entry.approvedBy ?? 'ainda não aprovado'}
                </span>
                <div className="actions">
                  {entry.status === 'DRAFT' ? (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        void transitionPluginCatalogEntry(entry, 'APPROVED')
                      }
                    >
                      Aprovar metadata do plugin
                    </button>
                  ) : null}
                  {entry.status !== 'ARCHIVED' ? (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        void transitionPluginCatalogEntry(entry, 'ARCHIVED')
                      }
                    >
                      Arquivar metadata do plugin
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </section>
          <section
            className="platformKnowledgeCatalog"
            aria-label="Catálogo de fontes de knowledge"
          >
            <div className="panelHeader">
              <div>
                <h3>Knowledge / catálogo de fontes controladas</h3>
                <p>
                  Identidade, versão e lifecycle metadata-only; nenhum conteúdo,
                  ingestão, embedding ou resposta RAG é produzido aqui.
                </p>
              </div>
              <span className="status">{knowledgeSources.length}</span>
            </div>
            <div className="platformFields">
              <label>
                Fonte controlada para catálogo
                <input
                  value={knowledgeCatalogSource}
                  placeholder="controlled://institutional-hours"
                  onChange={(event) =>
                    setKnowledgeCatalogSource(event.target.value)
                  }
                />
              </label>
              <label>
                Versão metadata-only
                <input
                  value={knowledgeCatalogVersion}
                  placeholder="v1"
                  onChange={(event) =>
                    setKnowledgeCatalogVersion(event.target.value)
                  }
                />
              </label>
              <label>
                Label da fonte
                <input
                  value={knowledgeLabel}
                  onChange={(event) => setKnowledgeLabel(event.target.value)}
                />
              </label>
              <label>
                Descrição metadata-only
                <input
                  value={knowledgeDescription}
                  onChange={(event) =>
                    setKnowledgeDescription(event.target.value)
                  }
                />
              </label>
            </div>
            <div className="actions">
              <button type="button" onClick={() => void loadKnowledgeSources()}>
                Carregar catálogo de fontes de knowledge
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void createKnowledgeSource()}
              >
                Criar metadata da fonte
              </button>
            </div>
            <p>APPROVED: identidade revisada; RAG continua indisponível.</p>
            {knowledgeSourcesLoaded && knowledgeSources.length === 0 ? (
              <p>Nenhuma fonte de knowledge catalogada.</p>
            ) : null}
            {knowledgeSources.map((source) => (
              <div className="row" key={source.id}>
                <strong>{source.label}</strong>
                <span>
                  {source.source}@{source.version}
                </span>
                <span>Status: {source.status}</span>
                <span>
                  Aprovado por: {source.approvedBy ?? 'ainda não aprovado'}
                </span>
                <div className="actions">
                  {source.status === 'DRAFT' ? (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        void transitionKnowledgeSource(source, 'APPROVED')
                      }
                    >
                      Aprovar fonte de knowledge
                    </button>
                  ) : null}
                  {source.status !== 'ARCHIVED' ? (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        void transitionKnowledgeSource(source, 'ARCHIVED')
                      }
                    >
                      Arquivar fonte de knowledge
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </section>
          <section
            className="platformReleaseCandidates"
            id="platform-release"
            aria-label="Ledger de release candidates"
          >
            <div className="panelHeader">
              <div>
                <h3>Release candidate / ledger de evidências controladas</h3>
                <p>
                  Atestação tenant-aware e imutável; VALIDATED não publica
                  sozinha: publish/rollback exigem seu vínculo exato e não
                  liberam deploy ou efeitos externos.
                </p>
              </div>
              <span className="status">{releaseCandidates.length}</span>
            </div>
            <div className="platformFields">
              {controlledReleaseGateDefaults.map((gate) => (
                <label key={gate.key}>
                  {gate.key} — referência controlada
                  <input
                    value={releaseGateRefs[gate.key]}
                    onChange={(event) =>
                      setReleaseGateRefs((current) => ({
                        ...current,
                        [gate.key]: event.target.value
                      }))
                    }
                  />
                  <select
                    aria-label={`${gate.key} status`}
                    value={releaseGateStatuses[gate.key]}
                    onChange={(event) =>
                      setReleaseGateStatuses((current) => ({
                        ...current,
                        [gate.key]: event.target.value as 'PASS' | 'FAIL'
                      }))
                    }
                  >
                    <option value="PASS">PASS</option>
                    <option value="FAIL">FAIL</option>
                  </select>
                </label>
              ))}
              <label>
                Identidade do validador controlado
                <input
                  aria-label="Identidade do validador controlado"
                  value={releaseValidatorId}
                  onChange={(event) =>
                    setReleaseValidatorId(event.target.value)
                  }
                />
              </label>
            </div>
            <div className="actions">
              <button
                type="button"
                disabled={isSaving || !selectedAgent}
                onClick={() => void loadReleaseCandidates()}
              >
                Carregar ledger de release candidates
              </button>
              <button
                type="button"
                disabled={isSaving || !selectedAgent || !version}
                onClick={() => void createReleaseCandidate()}
              >
                Registrar evidência do release candidate
              </button>
            </div>
            {releaseCandidatesLoaded && releaseCandidates.length === 0 ? (
              <p>Nenhuma atestação controlada registrada.</p>
            ) : null}
            {releaseCandidates.map((candidate) => (
              <div className="row" key={candidate.id}>
                <strong>{candidate.id}</strong>
                <span>Versão: {candidate.versionId}</span>
                <span>Status: {candidate.status}</span>
                <span>Criado por: {candidate.createdBy}</span>
                <span>Validado por: {candidate.validatedBy ?? 'pendente'}</span>
                <span>Digest: {candidate.evidenceDigest}</span>
                <div className="actions">
                  {candidate.status === 'DRAFT' ? (
                    <>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          void transitionReleaseCandidate(
                            candidate,
                            'VALIDATED'
                          )
                        }
                      >
                        Validar atestação controlada
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          void transitionReleaseCandidate(candidate, 'REJECTED')
                        }
                      >
                        Rejeitar atestação controlada
                      </button>
                    </>
                  ) : null}
                  {candidate.status !== 'ARCHIVED' ? (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        void transitionReleaseCandidate(candidate, 'ARCHIVED')
                      }
                    >
                      Arquivar atestação controlada
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </section>
          {trace ? (
            <div className="platformTrace" aria-label="Resultado do Test Lab">
              <strong>{traceText(trace.response.mode)}</strong>
              <span>intent: {traceText(trace.intent.name)}</span>
              <span>
                risk: {traceText(trace.risk?.level)}
                {trace.risk?.reason ? ` (${traceText(trace.risk.reason)})` : ''}
              </span>
              <span>policy: {traceText(trace.policy[0]?.decision)}</span>
              <span>policy reason: {traceText(trace.policy[0]?.reason)}</span>
              <span>knowledge: {traceText(trace.knowledge.status)}</span>
              <span>configVersion: {traceText(trace.configVersion)}</span>
              <span>
                prompt:{' '}
                {traceText(trace.prompt?.version ?? trace.configVersion)}
              </span>
              <span>
                prompt status: {traceText(trace.prompt?.status, 'legacy')}
              </span>
              <span>
                prompt checksum: {traceText(trace.prompt?.checksum, 'legacy')}
              </span>
              <span>status: {traceText(trace.status, 'completed')}</span>
              <span>
                latency: {trace.latencyMs ?? 0}ms · tokens:{' '}
                {trace.tokenUsage?.total ?? 'unknown'}
              </span>
              <span>
                handoff:{' '}
                {traceText(
                  trace.handoff.requested
                    ? (trace.handoff.reason ?? 'unknown')
                    : 'no'
                )}
              </span>
              {trace.outputPolicy ? (
                <span>
                  output policy: {traceText(trace.outputPolicy.decision)} ·{' '}
                  {traceText(trace.outputPolicy.reason)} · redacted:{' '}
                  {String(trace.outputPolicy.redacted)}
                </span>
              ) : null}
              {trace.handoff.destination ? (
                <span>
                  handoff destination: {traceText(trace.handoff.destination)}
                </span>
              ) : null}
              {trace.handoff.priority ? (
                <span>
                  handoff priority: {traceText(trace.handoff.priority)}
                </span>
              ) : null}
              <span>response: {traceText(trace.response.text)}</span>
              <span>
                provider: {traceText(trace.provider.provider)}/
                {traceText(trace.provider.model)}
              </span>
              <span>externalCall: {String(trace.provider.externalCall)}</span>
              <span>
                spans:{' '}
                {safeTraceSpans.length > 0
                  ? safeTraceSpans
                      .map((span) => traceText(span.name))
                      .join(' → ')
                  : 'legacy trace'}
              </span>
            </div>
          ) : null}
          <TraceViewer items={visibleTraceHistory} onSelect={setTrace} />
          {statusMessage ? (
            <p role="status" aria-live="polite">
              {statusMessage}
            </p>
          ) : null}
          {error ? (
            <p className="stateError" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
