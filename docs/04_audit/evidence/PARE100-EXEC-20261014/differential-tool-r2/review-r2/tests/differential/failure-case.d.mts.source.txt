export interface FailureCase {
  version: 1
  id: string
  message: string
  failure: { message: string; cause?: string }
}
export interface FailureSnapshot {
  name: string
  message: string
  cause: FailureSnapshot | null
}
export function validateFailureCase(value: unknown): FailureCase
export function makeFailure(fixture: FailureCase): Error
export function snapshotFailure(error: unknown): FailureSnapshot
