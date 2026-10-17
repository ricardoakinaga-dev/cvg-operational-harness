import type { ActionProposal, ConversationCopy } from './contracts.ts'

/**
 * Stable user-facing labels keep internal capability verbs out of dialogue.
 * The label is presentation only; proposal identity and execution bindings
 * continue to use the typed action value.
 */
export function describeAction(
  action: ActionProposal['action'],
  copy: ConversationCopy
): string {
  return copy.actionLabels[action]
}

export function renderCopy(
  template: string,
  valuesOrAction: string | Readonly<Record<string, string>>
): string {
  const values =
    typeof valuesOrAction === 'string'
      ? { action: valuesOrAction }
      : valuesOrAction
  return template.replace(
    /\{([a-zA-Z][a-zA-Z0-9_]*)\}/g,
    (_match, key: string) => values[key] ?? ''
  )
}
