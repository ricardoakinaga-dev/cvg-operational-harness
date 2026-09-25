# M07-S1-R1-C1I — candidate freeze failed; M07-S1 remains open

**Date:** 2026-09-24  
**Decision:** `APPROVED`, bound to approval request SHA-256 `86bc71b2bf7dac7f500a3dbb8a942e5d4cbeb9d6638ac43bf9dd65d923b1af57`  
**Recorded response:** “aprovo este gate”; scope `M07-S1-R1-C1I only`  
**Result:** `FAIL / OPEN`; no candidate was created  
**Production:** `NO_GO`

## Execution

The frozen plan ran locally with Node `v22.23.2`, TypeScript `6.0.3`, and npm `10.9.8`. npm was offline and the listed PostgreSQL variables were removed from each captured command. The refreshed baseline preflight passed: 973 inputs, exactly two changed tuples (`docs/02_spec/0190_spec_validation.md` and `docs/07_agents/AGENTS.md`), and fingerprint `6744024cd8bcdf45be4149c30438f0582ea1f44b884471570bde88f8eaa577c9`. All 11 source-baseline hashes matched.

The C1H Gauntlet directory was moved only to `.gauntlet-archive/m07-s1-c1h-20260924-finished-fail/`; all seven bound files matched after the move. The new C1I Gauntlet was initialized as `m07-s1-c1i-20260924-1`. Four rollback snapshots were captured. The approved patch SHA-256 `186854bfbccba9238cc501f11bc19e5fac9e8227d1fe13afed69726951733f5f` applied, the three approved product-path deltas matched their snapshots, and the conversation fixture remained byte-identical.

`candidate-freeze` started at `2026-09-24T09:00:12.772Z`, ended at `2026-09-24T09:00:13.032Z`, ran for `259.344 ms`, and exited `64` (unexpected). Its stderr was:

```text
workspace-dependency-audit: C1H_NPM_VERSION_FILE is not defined
```

The C1I patch renamed the scanner constant to `C1I_NPM_VERSION_FILE` but left a reference to `C1H_NPM_VERSION_FILE` in `validateExecutionCandidate`. No candidate manifest or inventory report was written. The frozen stop rule halted all dependent commands.

The command ledger contains 24 attempted plan steps and the final integrity verifier. The verifier reported zero problems across the 24 preceding records; `command-records.json` contains 25 records and state `INTEGRITY_PASS`. The remaining 12 plan steps did not run: candidate verification, inventory and semantic check, focused/full tests, typecheck, lint, coverage, post-check, sanitization, and historical-evidence integrity. I1 and Final Critic did not start because there is no candidate to review.

See [command records](command-records.json), [candidate-freeze stderr](candidate-freeze.stderr.log), [quality-bar results](quality-bar-results.json), [evidence index](evidence-index.json), and [the hash-bound decision](decision-record.json).

## Verdict and next gate

`C1I-02` and `C1I-03` failed on the scanner reference error and missing candidate; `C1I-05` failed because the frozen command matrix stopped at that failure. Inventory, tests, typecheck, lint, coverage, post-check, historical-evidence verification, I1, and Final Critic remain unrun or blocked. The full adjudication is in [quality-bar results](quality-bar-results.json). The Gauntlet is recorded `FINISHED / STOP / FAIL`; M07-S1 remains `FAIL / OPEN`.

M07-S2/S3/S4 and M05 remain blocked; G21-5/G21-6 remain closed; production remains `NO_GO`. No real data, service, database, external network, sensitive action, or production change was used.

The next step is a new documentary C1J correction packet that fixes the residual C1H constant reference and binds fresh C1J evidence paths. That packet needs its own hash-bound human decision before any further code or checks.
