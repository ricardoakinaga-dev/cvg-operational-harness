// Diagnostics only: gate acceptance still depends on the native exit status
// and the existing output/provenance validation, never on this projection.
const MAX_ERROR_MESSAGE_CHARS = 8192

export function ciProcessDiagnostics(result) {
  return {
    processExitCode: result.status ?? null,
    signal: result.signal ?? null,
    error: result.error
      ? {
          code: result.error.code ?? null,
          message: String(result.error.message ?? result.error).slice(
            0,
            MAX_ERROR_MESSAGE_CHARS
          )
        }
      : null
  }
}
