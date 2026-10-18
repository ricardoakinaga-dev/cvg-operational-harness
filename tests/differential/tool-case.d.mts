export interface ToolCase {
  readonly version: 1
  readonly id: string
  readonly message: string
  readonly text: string
}
export const TOOL_NAME: 'pare100_echo'
export function validateToolCase(value: unknown): ToolCase
