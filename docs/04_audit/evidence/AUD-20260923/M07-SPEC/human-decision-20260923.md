# Human SPEC decision — M07 — 2026-09-23

- Human response: “eu aprovo a Spec e as propostas”.
- Recorded at: `2026-09-23T20:46:09Z` (recording time; the reply itself carried no timestamp).
- Decision: approve SPEC-M07-001 and all four recommendations for preparation of the separate M07-S1 local BUILD gate and its candidate baseline.
- Scope inherited from the SPEC gate request: documentary gate preparation only. This does not authorize implementation, tests, builds, typecheck, lint, service/database execution, external integrations, real data, sensitive actions, or production.
- Approved recommendations:
  1. The M07-S1 public compatibility candidate is limited to `@cvg/harness`, `@cvg/harness-orchestrator`, and `@cvg/harness-contracts`; every other workspace package remains `UNKNOWN` until separately classified.
  2. Project references are required only for owners explicitly named in an approved TypeScript build-graph profile. This decision approves the rule, not any owner profile; no blanket reference changes are authorized.
  3. Source roles use explicit rules and keep production, test, build-only, type-only, and unresolved separate. Unknown roles fail closed.
  4. No exception is active by default. Each future exception must record its exact edge, owner role, reason, approval reference, candidate scope, and review/exit trigger.
- Review limits remain: lead I0 D1–D9 `PASS_LEAD_ONLY`; independent I1 `UNAVAILABLE`; Gauntlet `CONDITIONAL_PASS`; integrated verification `NOT_RUN`.
- Next gate: separate human approval or correction of the concrete M07-S1 local BUILD request. M05 remains the successor after M07; its approved route and legacy pair are unchanged.
- Safety: G21-5/G21-6 remain closed; production `NO_GO`; no real data or sensitive action.

Evidence: [SPEC](../../../../02_spec/0128_m07_package_dependency_governance.md), [SPEC gate request](spec-gate-request.md), and [P1-S1 human decision ledger](../P1-S1/human-decisions-20260923.md).
