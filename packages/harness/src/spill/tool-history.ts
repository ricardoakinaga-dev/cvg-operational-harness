import type { Observation } from '@cvg/harness-contracts'
import { renderedObservationText } from '@cvg/harness-contracts'

export interface ToolHistory {
  /** The `tool` messages for the observations that are tool results, in order. */
  readonly messages: readonly {
    readonly role: 'tool'
    readonly content: string
  }[]
  /**
   * Port for `createModelCompactionControl({ houseReadOf })`. It answers from the rendering the
   * runtime set on the observation (`houseRead`), never from the message text, which a tool
   * could forge (SPEC 0293 I11). Indexes outside the history answer false.
   */
  houseReadOf(index: number): boolean
}

/**
 * SPEC 0293 I11, host side. A host that turns the observations of a run into `tool` messages
 * of the model request builds the messages and the compaction port from the same list, so the
 * position the port answers about is the position the message has. `firstIndex` is where the
 * first of these messages sits in the request.
 */
export function toolHistoryFromObservations(
  observations: readonly Observation[],
  firstIndex = 0
): ToolHistory {
  const toolResults = observations.filter(
    (observation) =>
      observation.type === 'TOOL_RESULT' && observation.source === 'TOOL'
  )
  const messages = toolResults.map((observation) => ({
    role: 'tool' as const,
    content: renderedObservationText(observation)
  }))
  const marks = toolResults.map(
    (observation) => observation.rendering?.houseRead === true
  )
  return {
    messages,
    houseReadOf: (index) => marks[index - firstIndex] === true
  }
}
