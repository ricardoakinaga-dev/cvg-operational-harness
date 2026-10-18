export function capturePortData<T>(value: T): T
export function capturePortRequest(value: unknown): {
  readonly request: unknown
  readonly signal: unknown
}
export function createPortRequestCapture(): typeof capturePortRequest
