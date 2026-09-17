import {
  asProfileId,
  type ConversationCapability,
  type ConversationProfile
} from '@cvg/conversation'
import { EN_US_CONVERSATION_COPY, PT_BR_CONVERSATION_COPY } from './copy.ts'
import {
  DEFAULT_CONVERSATION_RECOGNITION,
  SERVICE_DESK_RECOGNITION
} from './recognition.ts'

export const SYNTHETIC_SERVICE_DESK_PROFILE_ID = 'synthetic-service-desk'
export const SYNTHETIC_KNOWLEDGE_PROFILE_ID = 'synthetic-knowledge-assistant'

const serviceDeskCapabilities: readonly ConversationCapability[] = [
  {
    id: 'synthetic.list-availability',
    version: '1.0.0',
    action: 'READ',
    description: 'Lists synthetic meeting-room availability',
    requiredFields: ['date'],
    sideEffect: 'READ',
    requiresApproval: false
  },
  {
    id: 'synthetic.reserve-room',
    version: '1.0.0',
    action: 'CREATE',
    description: 'Creates a synthetic meeting-room reservation',
    requiredFields: ['date', 'time', 'room'],
    sideEffect: 'WRITE',
    requiresApproval: true,
    resultEntityKey: 'reservationId'
  },
  {
    id: 'synthetic.modify-room',
    version: '1.0.0',
    action: 'MODIFY',
    description: 'Modifies a synthetic meeting-room reservation',
    requiredFields: ['reservationId', 'date', 'time', 'room'],
    sideEffect: 'WRITE',
    requiresApproval: true,
    resultEntityKey: 'reservationId'
  },
  {
    id: 'synthetic.cancel-room',
    version: '1.0.0',
    action: 'CANCEL',
    description: 'Cancels a synthetic meeting-room reservation',
    requiredFields: ['reservationId'],
    sideEffect: 'WRITE',
    requiresApproval: true
  }
]

export function createSyntheticServiceDeskProfile(): ConversationProfile {
  return {
    id: asProfileId(SYNTHETIC_SERVICE_DESK_PROFILE_ID),
    version: '1.0.0',
    name: 'Synthetic Service Desk',
    capabilities: serviceDeskCapabilities,
    knowledge: {
      approvedSourceIds: ['synthetic-service-desk-handbook'],
      maxResults: 3
    },
    copy: PT_BR_CONVERSATION_COPY,
    recognition: SERVICE_DESK_RECOGNITION,
    handoffLabel: 'synthetic-service-desk-human-handoff',
    maxGoalDepth: 3
  }
}

export function createSyntheticKnowledgeAssistantProfile(): ConversationProfile {
  return {
    id: asProfileId(SYNTHETIC_KNOWLEDGE_PROFILE_ID),
    version: '1.0.0',
    name: 'Synthetic Knowledge Assistant',
    capabilities: [],
    knowledge: {
      approvedSourceIds: ['synthetic-knowledge-handbook'],
      maxResults: 3
    },
    copy: EN_US_CONVERSATION_COPY,
    recognition: DEFAULT_CONVERSATION_RECOGNITION,
    handoffLabel: 'synthetic-knowledge-human-handoff',
    maxGoalDepth: 3
  }
}
