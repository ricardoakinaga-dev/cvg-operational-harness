import { DomainError } from '@cvg/shared'

export const HUMAN_TAKEOVER_STATES = [
  'BOT_ACTIVE',
  'HANDOFF_REQUESTED',
  'HUMAN_ACTIVE',
  'RESOLVED'
] as const

export type HumanTakeoverState = (typeof HUMAN_TAKEOVER_STATES)[number]

export const HUMAN_TAKEOVER_EVENTS = [
  'request_handoff',
  'accept_handoff',
  'resolve_handoff',
  'release_to_bot'
] as const

export type HumanTakeoverEvent = (typeof HUMAN_TAKEOVER_EVENTS)[number]

export function transitionHumanTakeover(
  state: HumanTakeoverState,
  event: HumanTakeoverEvent
): HumanTakeoverState {
  const next: Partial<
    Record<
      HumanTakeoverState,
      Partial<Record<HumanTakeoverEvent, HumanTakeoverState>>
    >
  > = {
    BOT_ACTIVE: { request_handoff: 'HANDOFF_REQUESTED' },
    HANDOFF_REQUESTED: { accept_handoff: 'HUMAN_ACTIVE' },
    HUMAN_ACTIVE: { resolve_handoff: 'RESOLVED' },
    RESOLVED: { release_to_bot: 'BOT_ACTIVE' }
  }
  const target = next[state]?.[event]
  if (!target) {
    throw new DomainError(
      'invalid_action',
      `Takeover cannot transition from ${state} with ${event}`
    )
  }
  return target
}

export function canBotRespond(state: HumanTakeoverState): boolean {
  return state === 'BOT_ACTIVE'
}
