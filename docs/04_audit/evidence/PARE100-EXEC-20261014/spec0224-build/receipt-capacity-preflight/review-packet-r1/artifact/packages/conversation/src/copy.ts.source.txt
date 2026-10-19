import type { ConversationCopy } from './contracts.ts'

export const DEFAULT_CONVERSATION_COPY: ConversationCopy = {
  locale: 'en-US',
  actionLabels: {
    READ: 'the availability lookup',
    CREATE: 'the requested creation',
    MODIFY: 'the requested update',
    CANCEL: 'the requested cancellation'
  },
  proposalIntro: 'I can prepare {action} using the details you provided.',
  confirmationPrompt:
    'Would you like me to confirm {action} with those details?',
  missingFieldsPrompt: 'I need these details to continue: {fields}.',
  choicePrompt: 'Which option do you choose: {choices}?',
  successPatterns: ['\\b(?:success(?:ful)?|succeeded|completed|done)\\b'],
  successNegationPatterns: [
    '\\b(?:not|never|without)\\b[^.!?]{0,24}\\b(?:success(?:ful)?|succeeded|completed|done)\\b'
  ],
  noApprovedKnowledge:
    'I could not find an approved institutional source to answer safely.',
  waitingApproval:
    'This proposal is waiting for authenticated approval. A reply such as “yes” does not grant approval.',
  handoffAccepted:
    'I sent this request to human support in the controlled environment.',
  handoffReplayed:
    'The human support handoff was already recorded in the controlled environment.',
  handoffFailed:
    'I prepared the human support handoff, but its destination did not confirm receipt. The request remains recorded for controlled handling.',
  handoffRecorded:
    'I recorded the request for human support in the controlled state.',
  stop: 'The request was closed.',
  processing: 'The action is being processed in the controlled environment.',
  success: 'The action completed with effect confirmation.',
  successWithoutEvidence:
    'Processing ended without effect confirmation; the result remains inconclusive.',
  denied: 'Governance denied the action in the controlled environment.',
  uncertain:
    'The effect result is uncertain. I will not claim success or repeat the action automatically.',
  failed: 'The action did not complete.',
  repair: 'I cannot confirm this result because valid evidence is missing.',
  answers: {
    CORRECTION_ACCEPTED:
      'I updated the information and discarded any earlier proposal affected by the correction.',
    DETAILS_RECORDED: 'I recorded the information you provided.',
    QUESTION_ACKNOWLEDGED:
      'I recorded your confirmation of understanding; sensitive approval still requires the authenticated flow.',
    INFORMATION_ACKNOWLEDGED:
      'I understood the question. I will answer using only permitted context and sources.',
    STALE_PROPOSAL:
      'The proposal changed while the conversation was being updated; I did not execute the action. Review the current details to continue.',
    ACTION_IN_FLIGHT:
      'The request is still processing in the controlled environment.',
    REQUEST_UNDERSTOOD:
      'I understood the request and kept the state in the controlled environment.',
    GROUNDING_REPAIR:
      'I cannot confirm this result because valid evidence is missing.',
    DEFAULT:
      'I understood the request and kept the state in the controlled environment.'
  }
}
