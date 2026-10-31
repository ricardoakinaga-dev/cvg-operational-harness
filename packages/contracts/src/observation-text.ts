import type { Observation } from './execution-v2.ts'
import type { ObservationRendering } from './spill.ts'

type Renderable = Pick<Observation, 'type' | 'source' | 'summary' | 'rendering'>

/**
 * SPEC 0293 §3.3: the rendering the runtime set on a tool result from a tool, if any.
 * A rendering carried by any other observation is ignored.
 */
export function trustedRendering(
  observation: Renderable
): ObservationRendering | undefined {
  return observation.type === 'TOOL_RESULT' && observation.source === 'TOOL'
    ? observation.rendering
    : undefined
}

/**
 * The text a model reads for one observation: the framed rendering of a tool result
 * when there is one, otherwise the summary.
 */
export function renderedObservationText(observation: Renderable): string {
  return trustedRendering(observation)?.text ?? observation.summary
}
