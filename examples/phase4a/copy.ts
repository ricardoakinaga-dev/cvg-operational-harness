import type { ConversationCopy } from '@cvg/conversation'

export const PT_BR_CONVERSATION_COPY: ConversationCopy = {
  locale: 'pt-BR',
  actionLabels: {
    READ: 'a consulta de disponibilidade',
    CREATE: 'a criação da reserva',
    MODIFY: 'a alteração da reserva',
    CANCEL: 'o cancelamento da reserva'
  },
  proposalIntro: 'Posso preparar {action} com os dados informados.',
  confirmationPrompt: 'Confirmar {action} com os dados informados?',
  missingFieldsPrompt: 'Preciso destes dados para continuar: {fields}.',
  choicePrompt: 'Qual opção você escolhe: {choices}?',
  successPatterns: [
    '\\b(?:conclu[ií]d[oa]|realizad[oa]|reservad[oa]|executad[oa]|aprovad[oa])\\b'
  ],
  successNegationPatterns: [
    '\\b(?:não|nao|sem)\\b[^.!?]{0,24}\\b(?:conclu[ií]d[oa]|realizad[oa]|reservad[oa]|executad[oa]|aprovad[oa])\\b'
  ],
  noApprovedKnowledge:
    'Não encontrei uma fonte institucional aprovada para responder com segurança.',
  waitingApproval:
    'A proposta está aguardando uma aprovação autenticada. Uma resposta como “sim” não concede essa aprovação.',
  handoffAccepted:
    'Encaminhei esta solicitação para atendimento humano no ambiente controlado.',
  handoffReplayed:
    'O encaminhamento humano já estava registrado no ambiente controlado.',
  handoffFailed:
    'Preparei o encaminhamento humano, mas o destino não confirmou o recebimento. A solicitação permanece registrada para tratamento controlado.',
  handoffRecorded:
    'Registrei a solicitação de atendimento humano no estado controlado.',
  stop: 'A solicitação foi encerrada.',
  processing: 'A ação está sendo processada no ambiente controlado.',
  success: 'A ação foi concluída com confirmação do efeito.',
  successWithoutEvidence:
    'O processamento terminou sem confirmação do efeito; o resultado permanece inconclusivo.',
  denied: 'A ação foi recusada pela governança do ambiente controlado.',
  uncertain:
    'O resultado do efeito é incerto. Não vou declarar sucesso nem repetir a ação automaticamente.',
  failed: 'A ação não foi concluída.',
  repair:
    'Não posso confirmar esse resultado porque faltam evidências válidas.',
  answers: {
    CORRECTION_ACCEPTED:
      'Atualizei o dado informado e descartei qualquer proposta anterior afetada pela correção.',
    DETAILS_RECORDED: 'Registrei os dados informados.',
    QUESTION_ACKNOWLEDGED:
      'Registrei sua confirmação de entendimento; uma aprovação sensível continua dependendo do fluxo autenticado.',
    INFORMATION_ACKNOWLEDGED:
      'Entendi a pergunta. Vou responder usando apenas o contexto e as fontes permitidas.',
    STALE_PROPOSAL:
      'A proposta mudou enquanto a conversa era atualizada; não executei a ação. Revise os dados atuais para continuar.',
    ACTION_IN_FLIGHT:
      'A solicitação continua em processamento no ambiente controlado.',
    REQUEST_UNDERSTOOD:
      'Entendi a solicitação e mantive o estado no ambiente controlado.',
    GROUNDING_REPAIR:
      'Não posso confirmar esse resultado porque faltam evidências válidas.',
    DEFAULT: 'Entendi a solicitação e mantive o estado no ambiente controlado.'
  }
}

export const EN_US_CONVERSATION_COPY: ConversationCopy = {
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

export const DEFAULT_CONVERSATION_COPY = PT_BR_CONVERSATION_COPY
