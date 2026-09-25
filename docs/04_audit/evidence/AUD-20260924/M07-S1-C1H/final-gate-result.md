# M07-S1-R1-C1H — candidate freeze stopped; M07-S1 remains open

**Date:** 2026-09-24  
**Decision:** `APPROVED`, bound to approval request SHA-256 `d2e03fb29f0e95efdb418fa47e984ee2bcac4e77fbd244bb9f2b162caead046f`  
**Result:** `FAIL / OPEN`; no C1H candidate was created  
**Production:** `NO_GO`

## Execution

The frozen C1H plan used Node `v22.23.2`, TypeScript `6.0.3`, npm `10.9.8` with offline npm, and removed all listed PostgreSQL variables. C1F was verified finished with its writer lock free and was moved intact to `.gauntlet-archive/m07-s1-c1f-20260924-finished-fail/`; the fresh C1H state was initialized. The rollback snapshots, checksums, patch check, patch application, and four snapshot-delta checks completed with their expected exit codes. The conversation fixture remained byte-identical.

The `candidate-freeze` command began at `2026-09-24T08:15:09.106Z`, ended at `2026-09-24T08:15:09.371Z`, ran for `264.961 ms`, and exited `64` (unexpected). Its stderr says:

```text
workspace-dependency-audit: R1 candidate rejected: baseline input drift: docs/02_spec/0190_spec_validation.md, docs/07_agents/AGENTS.md; candidate reports stale or changed baseline inputs
```

The R1 baseline expected `docs/02_spec/0190_spec_validation.md` SHA-256 `a5d40ea217f6886837628faef256d8075b58f4039bdf56dbff0974d1e0feda15`; current bytes are `1cb32b47f9bfb66417fc71bd423a12427d87adde5838497c40c4b64cce45990c`. It expected `docs/07_agents/AGENTS.md` SHA-256 `f62502666c51bebf8b43d551c67e2651e650c9e4889f09b9c7cd45fdc7e97607`; current bytes are `a9bfaf7b11036395db222b28d36f227c2feaa4ce8458203b6239b4a527ab96cb`.

The frozen stop rule was followed. No candidate manifest or inventory report was written. Candidate verification, inventory, focused/full tests, typecheck, lint, coverage, post-check, sanitization scan, historical-evidence hash check, I1 and Final Critic did not run. The command ledger records the first failure and the final verifier; it reports no integrity problems for the 21 records present before that verifier. See [command records](command-records.json), [quality-bar results](quality-bar-results.json), [candidate-freeze stderr](candidate-freeze.stderr.log), [source baseline](source-baseline.json), and [rollback checksums](rollback-baseline.sha256).

## Verdict and next gate

`C1H-03` failed because the pinned R1 candidate baseline is stale for two repository inputs; `C1H-05` failed because the stop rule prevented the rest of the command matrix. Required inventory, verification, tests, coverage, post-check and independent reviews remain `NOT_RUN` or `BLOCKED`. The frozen quality bar is unchanged. M07-S1 remains `FAIL / OPEN`; M07-S2/S3/S4 and M05 remain blocked; G21-5/G21-6 remain closed; production remains `NO_GO`.

The next step is a separate documentary correction packet that preserves the R1 baseline and C1H attempt, binds a refreshed candidate baseline to current bytes, and includes its own hash-bound decision. C1H must not be retried under this packet.
