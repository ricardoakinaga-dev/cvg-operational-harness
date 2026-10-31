import type { Observation } from './execution-v2.ts'

/**
 * SPEC 0293 §3.3: the text a model reads for one observation. A tool result
 * carries the rendering the runtime decided on arrival (whole output or
 * preview, framed); anything else, or a rendering set by another source, is
 * ignored and the summary is used.
 */
export function renderedObservationText(
  observation: Pick<Observation, 'type' | 'source' | 'summary' | 'rendering'>
): string {
  return observation.type === 'TOOL_RESULT' && observation.source === 'TOOL'
    ? (observation.rendering?.text ?? observation.summary)
    : observation.summary
}
