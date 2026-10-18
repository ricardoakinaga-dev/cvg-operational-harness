import { redactSensitiveText } from '@cvg/shared'

const MAX_STARTUP_MESSAGE_CHARS = 500

/**
 * Boundary helper for the worker entrypoint catch blocks. The entrypoint logs
 * outside `CompositeTelemetry`, so it has to run the centralized redaction
 * itself before a raw message reaches stdout/stderr. It never touches the
 * event name, the error code or the process exit status.
 */
export function redactStartupErrorMessage(
  source: unknown,
  fallback: string
): string {
  const raw =
    source instanceof Error
      ? source.message
      : typeof source === 'string'
        ? source
        : fallback
  const redacted = redactSensitiveText(raw)
  if (redacted.length <= MAX_STARTUP_MESSAGE_CHARS) return redacted
  return `${redacted.slice(0, MAX_STARTUP_MESSAGE_CHARS)}[truncated]`
}
