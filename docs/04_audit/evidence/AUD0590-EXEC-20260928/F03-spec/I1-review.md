# SPEC 0163 — I1 Fermat review and response

- Source of verdict: user's report in this turn; the full Fermat transcript/artifact was not supplied to this workspace. This record transcribes the reported findings and the response, without inventing critic quotes or claiming acceptance.
- Reviewed prior SPEC SHA-256: `d5fe42e1c2f4b729a47aa28f1aae8f747a7ae8a5c003615e6c2d4b587faa1d99` (historical revision committed in `806a8901d9e1ab8f5c334f8416b8e16fb327eece`).
- I1 verdict: **REVISE**, 0 P0, 4 P1, 1 P2. Revised SPEC state: `I1_REVISE_RESPONDED / FRESH_CRITIQUE_PENDING / HUMAN_T3_PENDING / BUILD_NOT_AUTHORIZED`.

| Finding reported by user | Response in current SPEC | Verification state |
| --- | --- | --- |
| P1-1: catalog matrix needed before T3; inspect `Capability:string`, provider/model, worker composite names | §2.1–2.2 fixes `F03-C1`, with exact producer→names→values/codes/fields→destinations, reference capability/profile literals, model pair, API/worker events and worker JSON route. Unknown product values and names are omitted. | Document revised; independent recheck pending |
| P1-2: separate internal context from exportable attributes; correlation provenance and root/child fallback | §2.3 separates `InternalTurnContext` from attributes, states current structural context cannot prove provenance, withholds caller correlation ID from sinks, and defines root/child internal propagation and inert fallback. | Document revised; independent recheck pending |
| P1-3: inert `ActiveSpan` and SDK/fallback failure behavior | §2.4–2.5 defines inert return contract, unique IDs, methods, catch behavior and business continuity, with fault injection in §4. | Document revised; independent recheck pending |
| P1-4: validate every public `Observation` DTO field and direct sinks | §2.6 validates span/metric/log fields before any sink, including `InMemoryObservationExporter`, composite, generic JSON and worker JSON; §4 injects marker into each field. | Document revised; independent recheck pending |
| P2: exporter mutates shared DTO in fan-out | §2.7 requires independent copies for buffer and each exporter; §4 tests mutation with and without throw. | Document revised; independent recheck pending |

No code, real data, external export, T3 approval, or BUILD occurred. The prior hash is retained solely to identify what I1 reviewed; approval cannot transfer to the revised hash. Next action: fresh independent critique of the current SPEC SHA-256, then human T3 review only if that critique is addressed.
