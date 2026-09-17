export interface GoldenDialogueCase {
  readonly id: string
  readonly expectedIntent: string
  readonly canonical: string
  readonly paraphrase: string
  readonly mutation: string
}

/**
 * Synthetic language corpus. Each scenario has a canonical utterance, a
 * paraphrase and a harmless mutation so coverage cannot depend on one exact
 * sentence. The corpus carries no real person, account, appointment or source.
 */
export const GOLDEN_DIALOGUE_CORPUS: readonly GoldenDialogueCase[] = [
  {
    id: 'G01-clarification',
    expectedIntent: 'CREATE',
    canonical: 'Quero reservar uma sala.',
    paraphrase: 'Preciso marcar uma sala para uma reunião.',
    mutation: '  quero RESERVAR uma sala  '
  },
  {
    id: 'G02-availability',
    expectedIntent: 'AVAILABILITY',
    canonical: 'Mostre os horários disponíveis na sexta.',
    paraphrase: 'Quais slots estão livres na Friday?',
    mutation: 'Mostre as opções disponíveis na sexta-feira.'
  },
  {
    id: 'G03-ordinal',
    expectedIntent: 'CREATE',
    canonical: 'Reserve a opção 2.',
    paraphrase: 'Reserve a segunda alternativa.',
    mutation: '  reserve a SEGUNDA opção. '
  },
  {
    id: 'G04-correction',
    expectedIntent: 'CORRECT',
    canonical: 'Na verdade, a data é sexta-feira.',
    paraphrase: 'Actually, use Friday instead.',
    mutation: 'Na verdade — troque para sexta-feira.'
  },
  {
    id: 'G05-side-question',
    expectedIntent: 'SIDE_QUESTION',
    canonical: 'Qual é o horário de funcionamento?',
    paraphrase: 'Como funcionam os horários do ambiente?',
    mutation: 'E qual e o horario de funcionamento?'
  },
  {
    id: 'G06-create',
    expectedIntent: 'CREATE',
    canonical: 'Reserve sexta às 10:00, sala Atlas.',
    paraphrase: 'Book a room on Friday at 10:00, room Atlas.',
    mutation: 'RESERVE sexta às 10:00, sala Atlas!'
  },
  {
    id: 'G07-knowledge',
    expectedIntent: 'KNOWLEDGE',
    canonical: 'Explique a política de suporte.',
    paraphrase: 'Explique como funciona o manual de suporte.',
    mutation: 'What is the support policy?'
  },
  {
    id: 'G08-modify',
    expectedIntent: 'MODIFY',
    canonical: 'Altere a reserva para 14:00.',
    paraphrase: 'Change the synthetic booking to 14:00.',
    mutation: 'Por favor, REAGENDAR a reserva para 14:00.'
  },
  {
    id: 'G09-cancel',
    expectedIntent: 'CANCEL',
    canonical: 'Cancele a reserva reservation.synthetic.001.',
    paraphrase: 'Remove a reserva sintética.',
    mutation: 'CANCELAR a reserva, por favor.'
  },
  {
    id: 'G10-handoff',
    expectedIntent: 'HANDOFF',
    canonical: 'Quero falar com um atendente humano.',
    paraphrase: 'Pode chamar uma pessoa da equipe?',
    mutation: 'Preciso de um HUMAN operator.'
  },
  {
    id: 'G11-uncertainty',
    expectedIntent: 'CLARIFY',
    canonical: 'Faça algo sintético misterioso.',
    paraphrase: 'Execute uma intenção completamente desconhecida.',
    mutation: '   uma intenção que não conheço   '
  },
  {
    id: 'G12-stop',
    expectedIntent: 'STOP',
    canonical: 'Pare tudo.',
    paraphrase: 'Não quero continuar.',
    mutation: 'STOP.'
  },
  {
    id: 'G13-confirmation',
    expectedIntent: 'COLLECT',
    canonical: 'Sim.',
    paraphrase: 'Go ahead.',
    mutation: '  OK  '
  },
  {
    id: 'G14-relative-time',
    expectedIntent: 'CREATE',
    canonical: 'Reserve uma sala amanhã à tarde.',
    paraphrase: 'I need a room tomorrow afternoon.',
    mutation: 'Reserve uma sala TOMORROW.'
  },
  {
    id: 'G15-profile-boundary',
    expectedIntent: 'KNOWLEDGE',
    canonical: 'O que diz o manual sintético?',
    paraphrase: 'Explain the policy in the approved handbook.',
    mutation: 'Explique a regra do handbook.'
  }
]
