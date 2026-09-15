import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  apiClient,
  type JourneyAppointmentDraftView,
  type JourneyCandidateView,
  type JourneyOwnerDraftView,
  type JourneyPatientDraftView,
  type JourneySlotView,
  type OperatorIdentity
} from '../../api/client.ts'

export interface JourneysPanelProps {
  identity: OperatorIdentity | null
  selectedSessionId?: string | null
}

const emptyKey = () =>
  `journey-ui-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

export function JourneysPanel({
  identity,
  selectedSessionId = null
}: JourneysPanelProps) {
  const identityKey = identity
    ? `${identity.operatorId}:${identity.role}:${identity.tenantId ?? ''}`
    : ''
  const [phone, setPhone] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [ownerMatches, setOwnerMatches] = useState<JourneyCandidateView[]>([])
  const [ownerCandidateId, setOwnerCandidateId] = useState<string | null>(null)
  const [ownerDraft, setOwnerDraft] = useState<JourneyOwnerDraftView | null>(
    null
  )
  const [patientName, setPatientName] = useState('Bolt')
  const [patientMatches, setPatientMatches] = useState<JourneyCandidateView[]>(
    []
  )
  const [patientDraft, setPatientDraft] =
    useState<JourneyPatientDraftView | null>(null)
  const [slots, setSlots] = useState<JourneySlotView[]>([])
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [appointmentDraft, setAppointmentDraft] =
    useState<JourneyAppointmentDraftView | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const generationRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    generationRef.current += 1
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setPhone('')
    setOwnerName('')
    setOwnerMatches([])
    setOwnerCandidateId(null)
    setOwnerDraft(null)
    setPatientName('Bolt')
    setPatientMatches([])
    setPatientDraft(null)
    setSlots([])
    setSelectedSlot(null)
    setAppointmentDraft(null)
    setMessage(null)
    setBusy(null)
    return () => {
      controller.abort()
    }
  }, [identityKey, selectedSessionId])

  const usableIdentity =
    identity && identity.operatorId.trim() && identity.tenantId
      ? identity
      : null
  const canMutate = Boolean(usableIdentity)
  const canCreateTask =
    canMutate &&
    Boolean(selectedSessionId) &&
    (identity?.role === 'Operator' || identity?.role === 'Admin')

  const run = async (
    action: string,
    operation: (signal: AbortSignal, generation: number) => Promise<void>
  ) => {
    const generation = generationRef.current
    const signal = abortRef.current?.signal
    if (!signal) return
    setBusy(action)
    setMessage(null)
    try {
      await operation(signal, generation)
    } catch (error) {
      if (generation !== generationRef.current) return
      if (isAbortError(error)) return
      setMessage(error instanceof Error ? error.message : 'Falha na jornada.')
    } finally {
      if (generation === generationRef.current) setBusy(null)
    }
  }

  const searchOwner = (event: FormEvent) => {
    event.preventDefault()
    if (!usableIdentity) return
    void run('owner-search', async (signal, generation) => {
      const result = await apiClient.searchJourneyOwners(
        usableIdentity,
        phone,
        signal
      )
      if (generation !== generationRef.current) return
      setOwnerMatches(result.matches)
      setOwnerCandidateId(
        result.matches.length === 1 ? result.matches[0]!.id : null
      )
      setMessage(
        result.matches.length > 1
          ? 'Mais de um tutor encontrado. Selecione explicitamente um candidato.'
          : result.matches.length === 1
            ? 'Tutor encontrado; a associação ainda é um rascunho.'
            : 'Nenhum tutor encontrado; crie um rascunho para continuar.'
      )
    })
  }

  const createOwner = () => {
    if (!usableIdentity) return
    void run('owner-create', async (signal, generation) => {
      const draft = await apiClient.createJourneyOwnerDraft({
        identity: usableIdentity,
        phone,
        ...(ownerName.trim() ? { name: ownerName.trim() } : {}),
        idempotencyKey: emptyKey(),
        signal
      })
      if (generation !== generationRef.current) return
      setOwnerDraft(draft)
      setOwnerCandidateId(
        draft.candidateIds.length === 1 ? draft.candidateIds[0]! : null
      )
      setMessage(
        'Rascunho de tutor persistido. Nenhum cadastro definitivo foi criado.'
      )
    })
  }

  const searchPatient = () => {
    if (!usableIdentity || !ownerDraft) return
    void run('patient-search', async (signal, generation) => {
      const result = await apiClient.searchJourneyPatients({
        identity: usableIdentity,
        ownerDraftId: ownerDraft.id,
        ...(ownerCandidateId ? { ownerCandidateId } : {}),
        ...(patientName.trim() ? { name: patientName.trim() } : {}),
        signal
      })
      if (generation !== generationRef.current) return
      setPatientMatches(result.matches)
      setMessage(
        result.matches.length > 1
          ? 'Mais de um pet encontrado. A vinculação exige uma escolha explícita.'
          : 'Busca de pet concluída; revise o candidato antes de vincular.'
      )
    })
  }

  const createPatient = () => {
    if (!usableIdentity || !ownerDraft || !ownerCandidateId) return
    void run('patient-create', async (signal, generation) => {
      const draft = await apiClient.createJourneyPatientDraft({
        identity: usableIdentity,
        ownerDraftId: ownerDraft.id,
        ownerCandidateId,
        name: patientName,
        idempotencyKey: emptyKey(),
        signal
      })
      if (generation !== generationRef.current) return
      setPatientDraft(draft)
      setPatientMatches([])
      setMessage(
        'Rascunho de pet persistido; confirme o candidato para vincular.'
      )
    })
  }

  const linkPatient = () => {
    if (
      !usableIdentity ||
      !patientDraft ||
      patientDraft.candidateIds.length !== 1
    )
      return
    void run('patient-link', async (signal, generation) => {
      const linked = await apiClient.linkJourneyPatient({
        identity: usableIdentity,
        patientDraftId: patientDraft.id,
        candidateId: patientDraft.candidateIds[0]!,
        signal
      })
      if (generation !== generationRef.current) return
      setPatientDraft(linked)
      setMessage(
        'Pet vinculado ao rascunho. A agenda ainda exige aprovação humana.'
      )
    })
  }

  const loadSlots = () => {
    if (!usableIdentity) return
    void run('slots', async (signal, generation) => {
      const result = await apiClient.listJourneySlots(usableIdentity, signal)
      if (generation !== generationRef.current) return
      setSlots(result.slots)
      setSelectedSlot(result.slots[0]?.id ?? null)
      setMessage(
        'Horários sintéticos carregados; nenhum horário real foi consultado.'
      )
    })
  }

  const createAppointment = () => {
    if (
      !usableIdentity ||
      !patientDraft ||
      patientDraft.status !== 'linked' ||
      !selectedSlot
    )
      return
    void run('appointment-create', async (signal, generation) => {
      const draft = await apiClient.createJourneyAppointmentDraft({
        identity: usableIdentity,
        patientDraftId: patientDraft.id,
        slot: selectedSlot,
        idempotencyKey: emptyKey(),
        signal
      })
      if (generation !== generationRef.current) return
      setAppointmentDraft(draft)
      setMessage(
        'Sugestão de horário persistida; confirmação, cancelamento e reagendamento estão bloqueados.'
      )
    })
  }

  const createTask = () => {
    if (!usableIdentity || !selectedSessionId) return
    void run('task-create', async (signal, generation) => {
      await apiClient.createJourneyTask({
        identity: usableIdentity,
        sessionId: selectedSessionId,
        title: 'Revisar jornada sintética',
        description: 'Validar rascunhos e assumir handoff se necessário.',
        idempotencyKey: emptyKey(),
        signal
      })
      if (generation !== generationRef.current) return
      setMessage('Tarefa operacional criada para a sessão selecionada.')
    })
  }

  return (
    <section
      className="panel journeyPanel"
      id="journeys-panel"
      aria-labelledby="journeys-title"
    >
      <header className="panelHeader">
        <div>
          <h2 id="journeys-title">Jornadas controladas</h2>
          <p>
            Fixtures sintéticas; cada etapa mantém rascunho e revisão humana.
          </p>
        </div>
        <span className="status">sem confirmação automática</span>
      </header>
      {!usableIdentity ? (
        <p className="state">Informe operador e tenant para abrir a jornada.</p>
      ) : (
        <div className="journeyBody">
          <form
            className="journeyStep"
            aria-label="Identificar tutor"
            onSubmit={searchOwner}
          >
            <h3>1. Identificar tutor</h3>
            <label>
              Telefone sintético
              <input
                aria-label="Telefone sintético"
                inputMode="tel"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+55 (11) 99999-0001"
              />
            </label>
            <label>
              Nome opcional
              <input
                aria-label="Nome opcional do tutor"
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
              />
            </label>
            <div className="actions">
              <button type="submit" disabled={busy !== null || !phone.trim()}>
                Buscar tutor
              </button>
              <button
                type="button"
                disabled={busy !== null || !phone.trim()}
                onClick={createOwner}
              >
                Salvar rascunho
              </button>
            </div>
            {ownerMatches.length > 0 ? (
              <fieldset>
                <legend>Candidatos encontrados</legend>
                {ownerMatches.map((candidate) => (
                  <label className="choice" key={candidate.id}>
                    <input
                      type="radio"
                      name="owner-candidate"
                      checked={ownerCandidateId === candidate.id}
                      onChange={() => setOwnerCandidateId(candidate.id)}
                    />
                    {candidate.displayName}
                  </label>
                ))}
              </fieldset>
            ) : null}
            {ownerDraft ? (
              <span className="journeyMeta">Draft: {ownerDraft.status}</span>
            ) : null}
          </form>

          <div className="journeyStep">
            <h3>2. Identificar pet</h3>
            {!ownerDraft ? (
              <p className="state stateCompact">
                Salve o rascunho do tutor primeiro.
              </p>
            ) : null}
            {ownerDraft ? (
              <>
                <label>
                  Nome do pet
                  <input
                    aria-label="Nome do pet"
                    value={patientName}
                    onChange={(event) => setPatientName(event.target.value)}
                  />
                </label>
                <div className="actions">
                  <button
                    type="button"
                    disabled={busy !== null || !ownerCandidateId}
                    onClick={searchPatient}
                  >
                    Buscar pet
                  </button>
                  <button
                    type="button"
                    disabled={busy !== null || !ownerCandidateId}
                    onClick={createPatient}
                  >
                    Salvar rascunho do pet
                  </button>
                </div>
                {patientMatches.map((candidate) => (
                  <span className="journeyMeta" key={candidate.id}>
                    {candidate.displayName}
                  </span>
                ))}
                {patientDraft ? (
                  <div className="journeyInline">
                    <span className="journeyMeta">
                      Pet: {patientDraft.status}
                    </span>
                    <button
                      type="button"
                      disabled={
                        busy !== null ||
                        patientDraft.candidateIds.length !== 1 ||
                        patientDraft.status !== 'draft'
                      }
                      onClick={linkPatient}
                    >
                      Vincular candidato
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <div className="journeyStep">
            <h3>3. Sugerir horário</h3>
            <div className="actions">
              <button
                type="button"
                disabled={busy !== null}
                onClick={loadSlots}
              >
                Carregar horários sintéticos
              </button>
              <button
                type="button"
                disabled={
                  busy !== null ||
                  !selectedSlot ||
                  patientDraft?.status !== 'linked'
                }
                onClick={createAppointment}
              >
                Criar sugestão para aprovação
              </button>
            </div>
            {slots.length > 0 ? (
              <fieldset>
                <legend>Horários futuros</legend>
                {slots.map((slot) => (
                  <label className="choice" key={slot.id}>
                    <input
                      type="radio"
                      name="journey-slot"
                      checked={selectedSlot === slot.id}
                      onChange={() => setSelectedSlot(slot.id)}
                    />
                    {new Date(slot.startsAt).toLocaleString('pt-BR')} (
                    {slot.sourceVersion})
                  </label>
                ))}
              </fieldset>
            ) : null}
            {appointmentDraft ? (
              <span className="journeyMeta">
                Agenda: {appointmentDraft.status}; confirmação bloqueada
              </span>
            ) : null}
          </div>

          <div className="journeyStep">
            <h3>4. Handoff e tarefa</h3>
            <p className="state stateCompact">
              Risco, ambiguidade ou ausência de fonte devem seguir para um
              operador.
            </p>
            <button
              type="button"
              disabled={busy !== null || !canCreateTask}
              onClick={createTask}
            >
              Criar tarefa para a sessão
            </button>
            {!selectedSessionId ? (
              <span className="journeyMeta">
                Selecione uma conversa para vincular a tarefa.
              </span>
            ) : null}
          </div>
          {message ? (
            <p className="journeyMessage" role="status" aria-live="polite">
              {message}
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}
