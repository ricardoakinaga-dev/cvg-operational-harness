import type { AgentConfig, PromptBlock } from './contracts.ts'

export interface ComposedPrompt {
  blockIds: string[]
  text: string
}

export function composePrompt(config: AgentConfig): ComposedPrompt {
  const blocks = config.promptBlocks
    .filter((block) => block.enabled)
    .slice()
    .sort(comparePromptBlocks)

  return {
    blockIds: blocks.map((block) => block.id),
    text: blocks.map((block) => block.content).join('\n\n')
  }
}

function comparePromptBlocks(left: PromptBlock, right: PromptBlock): number {
  if (left.priority !== right.priority) return left.priority - right.priority
  return left.id.localeCompare(right.id)
}
