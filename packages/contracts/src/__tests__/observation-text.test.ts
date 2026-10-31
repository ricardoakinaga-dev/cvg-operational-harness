import { describe, expect, it } from 'vitest'
import { renderedObservationText } from '../observation-text.ts'

const rendering = {
  form: 'preview' as const,
  text: 'RENDERING',
  bytes: 1,
  sha256: 'x',
  stored: true
}

describe('renderedObservationText (SPEC 0293)', () => {
  it('uses the rendering of a tool result', () => {
    expect(
      renderedObservationText({
        type: 'TOOL_RESULT',
        source: 'TOOL',
        summary: 'RESUMO',
        rendering
      })
    ).toBe('RENDERING')
  })
  it('uses the summary of a tool result without a rendering', () => {
    expect(
      renderedObservationText({
        type: 'TOOL_RESULT',
        source: 'TOOL',
        summary: 'RESUMO'
      })
    ).toBe('RESUMO')
  })
  it('ignores a rendering carried by anything but a tool result from a tool', () => {
    for (const [type, source] of [
      ['KNOWLEDGE_RESULT', 'KNOWLEDGE'],
      ['USER_MESSAGE', 'USER'],
      ['TOOL_RESULT', 'USER'],
      ['VERIFICATION', 'TOOL']
    ] as const) {
      expect(
        renderedObservationText({ type, source, summary: 'RESUMO', rendering })
      ).toBe('RESUMO')
    }
  })
})
