# SPEC 0163 — I3 Boyle review and response

- Source of verdict: user's report in this turn; the full Boyle transcript/artifact was not supplied to this workspace. This record transcribes the reported findings and documentary response without inventing critic quotes or claiming acceptance of the new revision.
- Reviewed SPEC SHA-256: `4ac0aaae824bfe53b5e9290df02cf81e4600b6228b4ec427169cd76080844835` (historical revision committed in `773df0eec2711f2094f81a3a93d3ff64696d21ac`). Prior I1/I2 hashes remain recorded in [recon](recon.md).
- I3 verdict: **REVISE**, 0 P0, 1 P1, 1 P2. The user reports I2 findings accepted by I3; that does not grant T3 approval or validate this new hash. Revised SPEC state: `I3_REVISE_RESPONDED / FRESH_CRITIQUE_PENDING / HUMAN_T3_PENDING / BUILD_NOT_AUTHORIZED`.

| Finding reported by user | Response in revised SPEC | Verification state |
| --- | --- | --- |
| P1: `apps/api/src/server.ts` passes raw `RuntimeLogEntry` to `options.runtimeLogger` after telemetry | §§1, 2.2, 2.5–2.6 define this callback as a parallel sink `R`. `emitRuntimeLog` must build a closed `SafeRuntimeLogEntry` before both the injected telemetry and callback; only cataloged event/status/code survive, with separate copies and no legacy raw overload. §4 injects a marker into every raw field and captures both callback inputs. | Document revised; independent recheck pending |
| P2: `createTelemetryWorkerSink` accepts injectable `Telemetry`, making a “protected” requirement forgeable/ambiguous | §2.5 requires `F03-C1` sanitization at the worker adapter ingress before either injected method, with independent copies, fail-closed errors and no trusted type marker. §4 tests a raw spy `Telemetry`, mutation and throw. | Document revised; independent recheck pending |

No code, real data, external export, T3 approval or BUILD occurred. Fresh critique of the revised hash remains required before a human T3 approval decision.
