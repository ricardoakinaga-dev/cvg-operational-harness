# SPEC 0163 — I4 Lorentz review and response

- Source of verdict: user's report in this turn; the full Lorentz transcript/artifact was not supplied to this workspace. This record transcribes the reported findings and documentary response without inventing critic quotes or claiming acceptance of the new revision.
- Reviewed SPEC SHA-256: `b6843684d26400b14945b2b067eb536a0b45cd65a446af4dc6f6c27d19856154` (historical revision committed in `549c9025a034a28c121fcdf83f8125c3062d51af`). Prior hashes remain in [recon](recon.md).
- I4 verdict: **REVISE**; user reports the I3 points accepted and one new P1 plus one new P2. A P0 count was not supplied. Revised SPEC state: `I4_REVISE_RESPONDED / FRESH_CRITIQUE_PENDING / HUMAN_T3_PENDING / BUILD_NOT_AUTHORIZED`.

| Finding reported by user | Response in revised SPEC | Verification state |
| --- | --- | --- |
| P1: `createContinuousWorker` and `createPeriodicSweepRunner` send directly to injectable `options.telemetry?: WorkerTelemetry`, bypassing the adapter boundary | §§1, 2.2 and 2.5 make both constructors mandatory admission points: each installs a local validating facade before any worker/sweep emission, treats injected `WorkerTelemetry` as untrusted, and sends only cloned, cataloged arguments to it. §4 requires negative spies passed directly to each constructor and a regression against direct assignment. | Document revised; independent recheck pending |
| P2: `approval.handoff_assumed` and `approval.decided` from `server.ts` are absent from closed `API-L1` | §2.2 adds both exact literals with `status=ok` and no route/IDs. §4 requires benign preservation through safe telemetry, callback and approved buffer/JSON, with a catalog regression. | Document revised; independent recheck pending |

I3 acceptance reported by the user does not transfer to the new hash or authorize BUILD. No code, real data, external export, T3 approval or BUILD occurred. Fresh critique of the revised hash remains required before a human T3 approval decision.
