export interface GoldenTrajectory {
  readonly id: string
  readonly turns: readonly string[]
  readonly expectedIntents: readonly string[]
  readonly requiredInvariant: string
  readonly proofRef: string
}

/**
 * Multi-turn synthetic trajectories complement the three language variants in
 * golden-corpus.ts. They describe the state or authority invariant that must
 * survive the turn sequence; execution-heavy cases have dedicated service and
 * PostgreSQL tests referenced by proofRef.
 */
export const GOLDEN_TRAJECTORIES: readonly GoldenTrajectory[] = [
  {
    id: 'G01-clarification',
    turns: ['Quero reservar uma sala.', 'sexta-feira'],
    expectedIntents: ['CREATE', 'COLLECT'],
    requiredInvariant: 'ask for missing action fields without executing',
    proofRef: 'tests/phase4a/security-boundary.test.ts:does-not-carry-state'
  },
  {
    id: 'G02-availability',
    turns: ['Mostre os horários disponíveis na sexta.', 'Reserve a opção 1.'],
    expectedIntents: ['AVAILABILITY', 'CREATE'],
    requiredInvariant: 'read results become bounded selectable references',
    proofRef: 'tests/phase4a/conversation-adversarial.test.ts:ordinal'
  },
  {
    id: 'G03-ordinal',
    turns: ['Mostre os slots de sexta.', 'Reserve a segunda alternativa.'],
    expectedIntents: ['AVAILABILITY', 'CREATE'],
    requiredInvariant: 'ordinal resolution requires one eligible candidate',
    proofRef: 'tests/phase4a/conversation-adversarial.test.ts:ordinal'
  },
  {
    id: 'G04-correction',
    turns: [
      'Reserve segunda às 10:00 sala Azul.',
      'Na verdade, a data é sexta-feira.'
    ],
    expectedIntents: ['CREATE', 'CORRECT'],
    requiredInvariant: 'correction invalidates affected proposal and approval',
    proofRef: 'tests/phase4a/conversation-adversarial.test.ts:correction'
  },
  {
    id: 'G05-side-question',
    turns: [
      'Quero reservar uma sala.',
      'Qual é o horário de funcionamento?',
      'sexta às 10:00 sala Azul.'
    ],
    expectedIntents: ['CREATE', 'SIDE_QUESTION', 'COLLECT'],
    requiredInvariant: 'side question preserves the primary goal',
    proofRef: 'tests/phase4a/conversation-adversarial.test.ts:side-question'
  },
  {
    id: 'G06-create',
    turns: ['Reserve sexta às 10:00 sala Atlas.', 'sim', 'approval callback'],
    expectedIntents: ['CREATE', 'COLLECT', 'CLARIFY'],
    requiredInvariant: 'natural assent waits for authenticated approval',
    proofRef: 'tests/phase4a/service-desk-journey.test.ts'
  },
  {
    id: 'G07-knowledge',
    turns: [
      'Explique a política de suporte.',
      'Qual é a regra de escalonamento?'
    ],
    expectedIntents: ['KNOWLEDGE', 'KNOWLEDGE'],
    requiredInvariant:
      'only approved versioned evidence supports a factual answer',
    proofRef: 'tests/phase4a/security-boundary.test.ts:knowledge'
  },
  {
    id: 'G08-modify',
    turns: [
      'Altere a reserva para 14:00.',
      'A reserva é reservation.synthetic.001.'
    ],
    expectedIntents: ['MODIFY', 'COLLECT'],
    requiredInvariant:
      'modify requires an explicit bounded reservation identity',
    proofRef: 'tests/phase4a/service-desk-journey.test.ts'
  },
  {
    id: 'G09-cancel',
    turns: ['Cancele a reserva synthetic-001.', 'sim'],
    expectedIntents: ['CANCEL', 'COLLECT'],
    requiredInvariant: 'cancel remains governed and approval-bound',
    proofRef: 'tests/phase4a/service-desk-journey.test.ts'
  },
  {
    id: 'G10-handoff',
    turns: ['Quero falar com um atendente humano.', 'chame a equipe'],
    expectedIntents: ['HANDOFF', 'HANDOFF'],
    requiredInvariant: 'handoff is bounded, durable and idempotent',
    proofRef: 'packages/conversation/src/__tests__/conversation.test.ts:handoff'
  },
  {
    id: 'G11-uncertainty',
    turns: ['Faça algo sintético misterioso.', 'não sei explicar'],
    expectedIntents: ['CLARIFY', 'CLARIFY'],
    requiredInvariant:
      'unknown intent yields safe clarification with zero effect',
    proofRef:
      'packages/conversation/src/__tests__/service.integration.test.ts:malformed'
  },
  {
    id: 'G12-stop',
    turns: ['Reserve sexta às 10:00 sala Verde.', 'Pare tudo.'],
    expectedIntents: ['CREATE', 'STOP'],
    requiredInvariant: 'stop cancels the active goal and prevents execution',
    proofRef: 'packages/conversation/src/__tests__/service.integration.test.ts'
  },
  {
    id: 'G13-confirmation',
    turns: ['Mostre os horários disponíveis na sexta.', 'sim'],
    expectedIntents: ['AVAILABILITY', 'COLLECT'],
    requiredInvariant: 'confirmation is interpreted as data until plan binding',
    proofRef:
      'packages/conversation/src/__tests__/service.integration.test.ts:approval'
  },
  {
    id: 'G14-relative-time',
    turns: ['Reserve uma sala amanhã à tarde.', 'qual é o horário?'],
    expectedIntents: ['CREATE', 'SIDE_QUESTION'],
    requiredInvariant: 'relative references stay bounded and can be clarified',
    proofRef: 'tests/phase4a/golden-corpus.test.ts'
  },
  {
    id: 'G15-profile-boundary',
    turns: ['O que diz o manual sintético?', 'Explique a regra do handbook.'],
    expectedIntents: ['KNOWLEDGE', 'KNOWLEDGE'],
    requiredInvariant: 'a second profile uses the same public conversation API',
    proofRef: 'tests/phase4a/service-desk-journey.test.ts'
  }
]
