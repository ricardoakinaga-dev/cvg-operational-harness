/** Validate that the two Playwright reports belong to the current run. */
export function validateE2ERunBinding(report, junitXml, runId) {
  const failures = []
  if (typeof runId !== 'string' || runId.length === 0) {
    failures.push('e2e_run_id_missing')
  }
  if (report?.config?.metadata?.runId !== runId || !runId) {
    failures.push('e2e_json_run_id_mismatch')
  }
  const root = /<testsuites\b[^>]*>/.exec(String(junitXml ?? ''))?.[0]
  if (!root) {
    failures.push('e2e_junit_root_missing')
  } else {
    const id = /\bid=(["'])(.*?)\1/.exec(root)?.[2]
    if (id !== runId || !runId) failures.push('e2e_junit_run_id_mismatch')
  }
  return failures
}
