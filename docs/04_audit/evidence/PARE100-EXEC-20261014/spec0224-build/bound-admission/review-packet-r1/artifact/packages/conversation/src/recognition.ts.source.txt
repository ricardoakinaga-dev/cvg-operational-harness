import type { ConversationRecognition } from './contracts.ts'

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
