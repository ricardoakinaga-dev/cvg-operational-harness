# Fresh-context reviewer brief — Final Critic / C1K

You are a separate Final Critic for gate M07-S1-R1-C1K. You have no access to prior conversation context and must not receive or inspect the I1 report. Perform a read-only, adversarial review of the exact C1J candidate fingerprint `e884796fd90192409230b0991524168186a9f65c824156a943102dcfacc98e1b` and the source artifacts whose SHA-256 values are recorded in `source-evidence.json`.

Challenge the C1J final verdict and all critical quality-bar evidence: approved scope, candidate identity, command ledger and expected exits, test/typecheck/lint/coverage claims, post-check and historical integrity, inventory findings and their disposition, safety limits, and the explicit rule that unavailable I1/Final Critic reviews leave S1 `FAIL / OPEN`. Distinguish verified evidence from claims or inference. Do not run commands or modify files.

Return a self-contained report with: candidate fingerprint; sources inspected; `ACCEPT`, `REJECT`, or `UNAVAILABLE`; material findings by severity with precise evidence references; any assumptions or limits; and a clear statement that you ran no commands and changed no files. Acceptance requires no material unresolved finding. This review must be independent of I1.
