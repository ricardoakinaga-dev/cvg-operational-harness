# SPEC 0163 — I2 Ramanujan review and response

- Source of verdict: user's report in this turn; the full Ramanujan transcript/artifact was not supplied to this workspace. This record summarizes the reported findings and the documentary response, without inventing critic quotes or claiming acceptance.
- Reviewed SPEC SHA-256: `ca3b757d802dd5aeb3e0c84e2ff74116452bd2ead11f3c298c59457498d2311a` (historical revision in commit `d7c79c644143580603d10da9de631654dfb98cbd`). Earlier I1 reviewed `d5fe42e1c2f4b729a47aa28f1aae8f747a7ae8a5c003615e6c2d4b587faa1d99`; both hashes remain historical.
- I2 verdict: **REVISE**, 0 P0, 1 P1, 2 P2. Revised SPEC state: `I2_REVISE_RESPONDED / FRESH_CRITIQUE_PENDING / HUMAN_T3_PENDING / BUILD_NOT_AUTHORIZED`.

| Finding reported by user | Response in revised SPEC | Verification state |
| --- | --- | --- |
| P1: direct public `Observation` DTO sinks cannot verify source/profile provenance for `capability` and `agentProfile` | §§2.1–2.3 and 2.6 make both dimensions non-exportable in `F03-C1`, including exact reference literals and adapter-origin DTOs. Adapter removes them before SDK/fallback; every direct sink strips them again. No public provenance is inferred from a DTO or literal. §4 adds negative tests at each boundary. | Document revised; independent recheck pending |
| P2: worker summary `lag: null` would be rejected and drop the log | `WORKER-F1` and §2.6 define a narrow `lag: null` omission before generic DTO validation, preserving the summary, stopped and idle-backoff events. The catalog also includes observed `worker.idle_backoff`. §4 requires null, numeric and invalid-type cases through buffer/JSON. | Document revised; independent recheck pending |
| P2: child spans currently derive OTel parent context from `otelContext.active()` and can inherit marker baggage | §2.5 requires a fresh empty context with only the approved parent span; §4 requires an active-baggage marker captured at the fake tracer's `startSpan` entry and a regression against the current context construction. | Document revised; independent recheck pending |

No code, real data, external export, T3 approval or BUILD occurred. A fresh independent critique of the revised hash remains required before any human T3 approval decision.
