# REM21-009 — Offline BUILD/AUDIT evidence

## Run identity

- date/time: `2026-09-22T21:29:50-03:00`
- task: `REM21-009`
- finding: `A21-F06`
- run: `run-rem21-009-offline-20260922`
- candidate: `NOT_APPLICABLE_OFFLINE_DOCUMENTS`
- runtime: local Node `24.20.0`, npm project dependencies, Ajv `6.15.0`
- scope: `G21-1 / local-synthetic / local-disposable`
- external execution: `false`
- real data: `false`
- network/credentials/services: not used

## Commands and results

| Check | Result | Exit |
| --- | --- | ---: |
| Parse schema, fixture and authority matrix with Node assertions | `PASS` — 5 domains, 7 authority slots, 12 cases | 0 |
| Validate `baseContract` with Ajv 6.15.0 | `PASS` — strict Draft 7 schema, 0 errors | 0 |
| Execute negative-case policy matrix | `PASS` — 12/12 expected outcomes | 0 |
| Materialized endpoint/secret and unbounded retry mutations | `PASS` — schema rejected all 3 | 0 |
| `npm run docs:check-links` | `DOC_LINKS_OK`; `EVIDENCE_HYGIENE_OK`; broken 0; non-allowlisted absolute 0; parsed JSON 391 | 0 |
| `npm run format:check` | `PASS` | 0 |
| `git diff --check` on task and ledgers | `PASS` | 0 |
| secret/credential pattern scan in task evidence | `PASS` — no match | 0 |

The schema uses only `pending://...` references for future endpoints, issuers,
secrets, evidence, policies and releases. No operational URL, credential,
token, identity, contact or real destination was materialized.

## Offline case outcomes

| Case group | Outcome |
| --- | --- |
| unresolved authority / missing owner / rollback unproven | `BLOCKED` |
| materialized endpoint or secret | `REJECTED` |
| egress mismatch / retry unbounded | `ABORT` |
| tenant or audience mismatch | `DENY` |
| replay or idempotency mismatch | `DENY_NO_DISPATCH` |
| missing, revoked or stale institutional source | `HANDOFF` |
| clinical, financial or appointment-sensitive output | `HANDOFF_ABORT` |
| fake deterministic local adapter | `ACCEPTED_FOR_OFFLINE_ONLY` |

## Final hashes

SHA-256 was calculated after the final write of the seven decision artifacts.
The decision packet records the first six hashes; its own hash is listed here
to avoid a self-referential mutation.

| Artifact | SHA-256 |
| --- | --- |
| `external-qualification-contract.schema.json` | `873542824b9eaa3f1163031a614dd5ac001548f42d40974e86e30f766769e005` |
| `external-qualification-fixtures.json` | `3ec9f1b7b68a1488c7037002c378aadda9892ed8b739d8ac14148606e6fb044b` |
| `authority-matrix.json` | `3cf01003bf53fc84ea677bf09b7dbd8147d1cb181bb01222cc0de8a8f97e1b19` |
| `THREAT-MODEL-ADDENDUM.md` | `3f417a5391cd4fa8e09a2dfc6f4e848ab62f0223d84de0ded4395844ea49fe35` |
| `QUALIFICATION-RUNBOOK.md` | `a2dbdba998f614ea5d3b1e6c326dfefee1d3a1f8071d14deccf7cb85b7f0404b` |
| `ROLLBACK-ABORT-RUNBOOK.md` | `c98b4635107e4ffeb8c0fa5a126255ca15c5f2b927a99440438d49fc5af2451f` |
| `DECISION-PACKET.md` | `f2c48a6b6be161d6880e1e929bb16e835df41dadd2a6ab36d75692437e4096a1` |

## Decision

`OFFLINE_PREPARATION_COMPLETE` is supported for the documented synthetic
slice. `EXTERNAL_EXECUTION_BLOCKED_BY_G21-5` remains in force. The result does
not qualify an IdP, provider, channel, institutional source, egress policy,
privacy decision, production rollback, RPO/RTO or any sensitive action. No
production GO is inferred; the next state is `WAITING_HUMAN_APPROVAL` only
after explicit authority decides whether to open G21-5.

