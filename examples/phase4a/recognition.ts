import type { ConversationRecognition } from '@cvg/conversation'

const ENGLISH_DAY_NORMALIZATION = {
  monday: 'monday',
  tuesday: 'tuesday',
  wednesday: 'wednesday',
  thursday: 'thursday',
  friday: 'friday',
  saturday: 'saturday',
  sunday: 'sunday',
  tomorrow: 'tomorrow',
  today: 'today'
} as const

const ENGLISH_TIME_NORMALIZATION = {
  afternoon: 'afternoon',
  later: 'later',
  evening: 'evening'
} as const

/**
 * Safe fallback recognition for profiles that do not need domain vocabulary.
 * Product nouns and locale-specific phrases belong in the profile descriptor.
 */
export const DEFAULT_CONVERSATION_RECOGNITION: ConversationRecognition = {
  confirmationPatterns: [
    '^(?:yes|ok|okay|confirm|confirmed|go ahead)[.!?\\s]*$'
  ],
  stopPatterns: ['\\b(?:stop|exit|close|cancel everything)\\b'],
  handoffPatterns: ['\\b(?:human|agent|operator|supervisor)\\b'],
  correctionPatterns: [
    '\\b(?:actually|correction|correct|change|replace|update)\\b'
  ],
  sideQuestionPrefixPatterns: [
    '^(?:and\\s+)?(?:what|which|how|where)\\b.*\\?\\s*$'
  ],
  sideQuestionContextPatterns: ['\\b(?:hours|address|location|works)\\b'],
  availabilityPatterns: ['\\b(?:available|availability|slots|openings)\\b'],
  cancelPatterns: ['\\b(?:cancel|remove|delete)\\b'],
  modifyPatterns: ['\\b(?:modify|change|update|reschedule)\\b'],
  createPatterns: ['\\b(?:create|make|open|submit)\\b'],
  knowledgePatterns: [
    '\\b(?:why|how does|what is|explain|manual|policy|rule)\\b'
  ],
  questionPatterns: ['\\?', '^(?:what|which|who|when|where|tell me)\\b'],
  ordinalPattern: '\\b(?:option|choice)?\\s*(1|2|3|4|5)(?:st|nd|rd|th)?\\b',
  ordinalWords: {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5
  },
  pronounPatterns: ['\\b(?:this|that|it|these|those)\\b'],
  entityPatterns: [
    {
      key: 'date',
      pattern:
        '\\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today)\\b',
      confidence: 0.98,
      normalization: 'DAY'
    },
    {
      key: 'date',
      pattern: '\\b20\\d{2}-\\d{2}-\\d{2}\\b',
      confidence: 0.99
    },
    {
      key: 'time',
      pattern: '\\b(?:at|on|in)\\s+(\\d{1,2}(?::\\d{2})?)\\b',
      valueGroup: 1,
      confidence: 0.96
    },
    {
      key: 'time',
      pattern: '\\b(\\d{1,2}:\\d{2})\\b',
      valueGroup: 1,
      confidence: 0.96
    },
    {
      key: 'time',
      pattern: '\\b(?:afternoon|later|evening)\\b',
      confidence: 0.72,
      normalization: 'TIME_PERIOD'
    },
    {
      key: 'name',
      pattern: '\\bmy name is\\s+([\\p{L}][\\p{L} -]{1,80})',
      valueGroup: 1,
      confidence: 0.94
    }
  ],
  correctionEntityKeys: ['date', 'time'],
  normalizations: {
    DAY: ENGLISH_DAY_NORMALIZATION,
    TIME_PERIOD: ENGLISH_TIME_NORMALIZATION
  }
}

/** Synthetic Service Desk language and domain terms stay at the profile edge. */
export const SERVICE_DESK_RECOGNITION: ConversationRecognition = {
  confirmationPatterns: [
    '^(?:sim|yes|ok|okay|confirmo|confirmar|pode|isso|exato|certo|prosseguir|go ahead)[.!?\\s]*$'
  ],
  stopPatterns: [
    '\\b(?:pare|parar|cancelar tudo|stop|sair|encerrar|não quero|nao quero)\\b'
  ],
  handoffPatterns: [
    '\\b(?:humano|atendente|pessoa|equipe|human|agent|operator|supervisor)\\b'
  ],
  correctionPatterns: [
    '\\b(?:na verdade|actually|corrig|correction|mude|troque|alter)\\b'
  ],
  sideQuestionPrefixPatterns: [
    '^(?:e\\s+)?(?:qual|quais|como|onde|what|how|where)\\b.*\\?\\s*$'
  ],
  sideQuestionContextPatterns: [
    '\\b(?:horári(?:o|os)|horario?s?|funcionamento|hours|works|endereço|endereco|address)\\b'
  ],
  availabilityPatterns: [
    '\\b(?:disponib(?:ilidade|ilidades)|horários disponíveis|horarios disponiveis|slots|opções|opcoes|available|availability|agenda aberta)\\b'
  ],
  cancelPatterns: ['\\b(?:cancele|cancelar|cancela|cancel|remove|remover)\\b'],
  modifyPatterns: [
    '\\b(?:alterar|altere|mudar|mude|modificar|modify|change|reschedule|reagendar)\\b'
  ],
  createPatterns: [
    '\\b(?:reservar|reserve|agendar|agende|criar|create|book|booking|marcar|marque)\\b',
    '\\b(?:preciso|need)\\s+(?:de\\s+)?(?:(?:uma?|a|an)\\s+)?(?:sala|room|meeting room)\\b'
  ],
  knowledgePatterns: [
    '\\b(?:por que|porque|como funciona|what is|why|how does|explique|explains?|manual|regra|policy|política|politica)\\b'
  ],
  questionPatterns: [
    '\\?',
    '^(?:qual|quais|quem|quando|onde|what|which|who|when|where|tell me)\\b'
  ],
  ordinalPattern:
    '\\b(?:op(?:ç|c)[aã]o|option|choice)?\\s*(1|2|3|4|5)(?:º|ª|st|nd|rd|th|a|o)?\\b',
  ordinalWords: {
    primeira: 1,
    primeiro: 1,
    first: 1,
    segunda: 2,
    segundo: 2,
    second: 2,
    terceira: 3,
    terceiro: 3,
    third: 3,
    quarta: 4,
    quarto: 4,
    fourth: 4,
    quinta: 5,
    quinto: 5,
    fifth: 5
  },
  pronounPatterns: [
    '\\b(?:esse|essa|isso|este|esta|aquele|aquela|this|that|it|these|those)\\b'
  ],
  entityPatterns: [
    {
      key: 'date',
      pattern:
        '\\b(?:segunda(?:-feira)?|terça(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sábado|sabado|domingo|monday|tuesday|wednesday|thursday|friday|saturday|sunday|amanhã|amanha|tomorrow|hoje|today)\\b',
      confidence: 0.98,
      normalization: 'DAY'
    },
    {
      key: 'date',
      pattern: '\\b20\\d{2}-\\d{2}-\\d{2}\\b',
      confidence: 0.99
    },
    {
      key: 'time',
      pattern: '\\b(?:às|as|at|em)\\s+(\\d{1,2}(?::\\d{2})?)\\b',
      valueGroup: 1,
      confidence: 0.96
    },
    {
      key: 'time',
      pattern: '\\b(\\d{1,2}:\\d{2})\\b',
      valueGroup: 1,
      confidence: 0.96
    },
    {
      key: 'time',
      pattern: '\\b(?:afternoon|tarde|later|mais tarde|evening|noite)\\b',
      confidence: 0.72,
      normalization: 'TIME_PERIOD'
    },
    {
      key: 'name',
      pattern:
        '\\b(?:meu nome é|meu nome e|my name is)\\s+([\\p{L}][\\p{L} -]{1,80})',
      valueGroup: 1,
      confidence: 0.94
    },
    {
      key: 'room',
      pattern:
        '\\b(?:sala|room)\\s+(?!(?:at|às|as|on|em|no|na|for|tomorrow|amanhã|amanha|hoje|today)\\b)(?:de\\s+)?([\\p{L}0-9][\\p{L}0-9 -]{0,40}?)(?=\\s+(?:at|às|as|on|em|no|na|for|tomorrow|amanhã|amanha|hoje|today)\\b|[,.!?]|$)',
      valueGroup: 1,
      confidence: 0.9
    },
    {
      key: 'reservationId',
      pattern:
        '\\b(?:reservation|reserva)(?:\\s+id)?\\s*[:#]?\\s*([\\p{L}0-9._-]*\\d[\\p{L}0-9._-]*)\\b',
      valueGroup: 1,
      confidence: 0.9
    }
  ],
  correctionEntityKeys: ['date', 'time', 'room'],
  normalizations: {
    DAY: {
      ...ENGLISH_DAY_NORMALIZATION,
      'segunda-feira': 'monday',
      segunda: 'monday',
      'terça-feira': 'tuesday',
      'terca-feira': 'tuesday',
      terça: 'tuesday',
      terca: 'tuesday',
      'quarta-feira': 'wednesday',
      quarta: 'wednesday',
      'quinta-feira': 'thursday',
      quinta: 'thursday',
      'sexta-feira': 'friday',
      sexta: 'friday',
      sábado: 'saturday',
      sabado: 'saturday',
      amanhã: 'tomorrow',
      amanha: 'tomorrow',
      hoje: 'today'
    },
    TIME_PERIOD: {
      ...ENGLISH_TIME_NORMALIZATION,
      tarde: 'afternoon',
      'mais tarde': 'later',
      noite: 'evening'
    }
  }
}
