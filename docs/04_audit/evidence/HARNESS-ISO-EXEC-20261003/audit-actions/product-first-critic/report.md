# PRODUCT-FIRST-VERTICAL — scoped REJECT

The frozen local synthetic text slice is **REJECTED**. Two source-fidelity escapes permit confirmation of altered patient/clinical fields and open derived tasks. Generic confirmation and permanent correction also diverge from approved SPEC0179. This is not a global harness verdict or a release decision.

## Artifact and independence

The sealed packet, all **90** product/runtime/test/fixture source hashes, acceptance projection and both approved SPEC hashes match. Canonical frozen bundle SHA-256: `e2f42b1467eb839ee8135506b831da7a699c7004b5f06ecd07b51a18f5c2c60c`.

Canonical source pre/post: **MATCH**, 7,391 selected non-generated files including core/config/lock inputs. Scratch source pre/post: **MATCH**, 7,390 files. The portable rebuild's per-copy `.cvg-audit-candidate.json` is explicitly excluded as generated metadata; the single added `critic-adversarial.test.ts` is separately hashed and excluded as Critic evidence. Generated dependency/Vitest/build outputs have separate hashes; 48 dependency symlinks resolve inside the scratch tree. Canonical generated-cache churn from Lead's concurrent tests is outside the source sentinel. Frozen bundle is independently included and unchanged. See [sentinels](sentinels.json), [rebuild receipt](rebuild-receipt.json), [generated outputs](generated-output-hashes.json).

Fresh Critic context, no descendants. Required root AGENTS, operational constitution, runtime state, execution log, backlog and coordination reads exposed incidental historical unrelated scores, earlier C1/global labels and foundation/Lead counts. Some output was truncated. That administrative exposure limits perfect blindness and is disclosed; none of those labels supplied a judgment here. No Builder report/return/source-freeze rationale, linked old verdict/report, `.gauntlet` or git history was read. Raw original test source and frozen foundation test bytes were compared solely to inspect required regression intent. C1 was not reviewed. Writes/tests were confined to owned scratch/evidence paths; no canonical source/test/cache write or test invocation by this Critic.

## Material failures

1. **F01 / P1 — wrong bed accepted from another field.** Source header `Paciente Rex, leito 1, ID 2`; prepared V2 proposes bed `2`, quoting `leito 1, ID 2`. Runtime `verify` trims at the bed marker but then accepts a numeric substring from ID. It stores `issues=[]`; exact confirmation opens a task and makes bed `2` eligible patient memory. Reopening preserves it. A strict field binding must block this. See [adversarial log](adversarial-complete.log) and the field-borrow volume in [probe index](probe-index.json). Mechanism: frozen `source-evidence.ts:383,392`.
2. **F02 / P1 — unit shortening accepted.** Source/quote `Evolução: dose 1 mg/kg`; prepared V2 evolution `dose 1 mg`. Substring validation accepts the shortened unit, produces no issue and allows confirmation/open task; the altered field persists on reopen. The separate tuple oracle compares units exactly, but runtime `validateOrganization` does not use it. Mechanism: `source-evidence.ts:392`. Same raw log/index contain the unit-prefix journal and reopened projection.
3. **F03 / P2 — eligible simple confirmation is missing.** One current same-author draft, provider acceptance of its full preview and no earlier pending note/correction still cannot be confirmed by `ok`. It receives the token-request response, leaving the task draft. SPEC §3 explicitly allows the unambiguous case. `assistant.ts:655` rejects every no-token confirmation, and an existing test encodes that blanket rejection.
4. **F04 / P2 — permanent correction failure loses suspension state.** After a confirmed original, a valid correction with static organizer `schema_invalid` changes the old note to superseded, clears `replacementPending` and cancels its open task, creating a raw replacement draft. SPEC/projection requires failed replacement to remain pending with old commitments suspended. Reopening confirms the divergent state. Mechanism: `assistant.ts:430,437` routes failure to normal replacement preparation; `vertical-state.ts:270` clears the hold.

All failures were observed through real loopback webhooks/provider endpoints and physical journals, using static V2 input fixtures only. Failing expectations are preserved; these tests are not approved product changes.

## Executed checks and evidence limits

- Node **22.23.2**: fresh `npm ci --offline --ignore-scripts`, unchanged package-lock; exit 0. All execution logs and argv/exit/log-hash receipts are retained.
- Existing scoped product tests: **122/122**, zero skipped: foundation **32 recovery + 8 migration**, originals **30 + 7**, first vertical **41**, source oracles **4**. Test names were not treated as assertions. Foundation test files match the frozen ZIP byte-for-byte. Original37 names are retained; [raw assertion diff](original-assertion-diff.txt) was inspected.
- Independent novel probes: final **8 executed: 4 passed, 4 failed**, exit 1. Prior 6- and 7-probe invocations/logs remain preserved; additions extended real admission and I/O recovery coverage, with no product fix or retry-to-green. Positive controls prove exact activation/reopen, private-input rejection/dedup/conflict, real accepted receipt plus failed fsync followed by no replay POST/help recovery, and five durable actual-client local prefetch rejection attempts.
- Root source typecheck and scoped product lint: exit 0. Public product build prerequisite: exit 0. Rebuilt bundle differs in bytes (`183c0613c1a4044b61e95234778ca4a71e441173cffe844de6fe3d8532f4595c`); no reproducible-byte build claim is made. Both rebuilt smoke and a second smoke using the **byte-exact copied frozen bundle** exited 0: actual clinical webhook preserved raw source, `policy_denied`, zero model HTTP, document-only confirmation, zero tasks and SIGTERM lock release.
- Foundation physical tests execute nine real child SIGKILL controls; vertical tests add three actual V2 confirmation kill points. These demonstrate process-crash atomicity, not power-loss durability. Actual loopback timeout/5xx/accept-disconnect remain uncertain without automatic resend. New receipt-fsync probe crosses the actual HTTP and filesystem boundaries; mock-send helpers were not counted as remote proof.

The original named “validates the model JSON and rejects anything else” now asserts `policy_denied` for a formerly successful model JSON path, while malformed input also fails at policy. Original clinical model/schema/HTTP assertion intent is **NOT_RUN/BLOCKED** under NO_MODEL, even though its retained name passes. Prepared local parser/validator fixtures do not close that original proof. Changes adding human confirmation, persistent retries and V2 source-bound fixtures are consistent with the approved contract, but name/number preservation alone cannot certify full regression intent.

## PV01–PV14

Per-criterion PASS below means only the stated local slice mechanism; it cannot close PISO/HISO or a future gate.

| ID | Status | Current evidence / limitation |
| --- | --- | --- |
| PV01 | **PASS** | Real WAHA/Evolution loopback admission and new admission probe: synced inbound, replay no work, changed text 409, foreign session/unknown/group/self preserve no input; bytes checked and reopened. |
| PV02 | **PASS** | 32 recovery + 8 migration tests unchanged byte-for-byte from foundation ZIP; nine genuine child SIGKILL controls, short writes/fsync failures, retained originals/hash-chain/revisions; three V2 confirmation SIGKILL controls. These prove process crash, not power loss. |
| PV03 | **PASS** | Real previews include token/source/proposed tasks, raw/V1/extra flags produce zero derivatives, draft task mutation refused, no eligible memory before confirmation; ordered multipart preview and reopened drafts. |
| PV04 | **FAIL** | FAIL F03: one eligible accepted preview + same-author generic ok never confirms. Exact-token/full-part/current-author guard controls pass; uncertain preview and wrong/old token block. The suite asserts blanket rejection of generic ok contrary to SPEC §3. |
| PV05 | **PASS** | One durable confirmation event contains task activation, bindings and receipt intent; distinct/same replay allocate no extra tasks. LF/sync failure and real SIGKILL reopen all-or-none. New exact confirmation control survives reopen. |
| PV06 | **FAIL** | FAIL F04: transient correction safely suspends before organizer; permanent schema_invalid creates replacement_prepared, supersedes old note, clears replacementPending and cancels old open task. Reopen retains the contract violation. |
| PV07 | **FAIL** | FAIL F01/F02: strict nested V2 and patient block/order negatives work, but header-field borrowing and unit-prefix shortening pass validator with issues=[], activate a task and eligible memory after confirmation and survive reopen. |
| PV08 | **FAIL** | FAIL F01/F02: 41 cases/139 comparisons and 21 quote cases pass helper oracles (UTF16/overlaps/missing/repeated). Runtime verify uses substring containment instead of enforcing the helper patient/field/unit tuple; physical caller repro accepts altered unit/field. |
| PV09 | **FAIL** | FAIL F01: source explicitly says bed 1 but confirmed binding bed 2 becomes knownPatients memory; reopened artifact proves it. Literal ID/homonym reversal and before/after confirmation history controls otherwise pass. This is invalid field provenance entering eligible memory, not invented ID 2. |
| PV10 | **PASS** | Persistent inbox stage/attempt/deadline/backoff, abandoned on-disk processing and restart retaining budget/elaboration; five organizer fixture attempts; injected deadlines; no poisoned later job. New real receipt-fsync recovery followed by help webhook progresses. |
| PV11 | **PASS** | Real WAHA/Evolution 2xx, accept/disconnect, 5xx and timeout tests; synced dispatch before fetch; uncertain not resent after reopen. New actual client local prefetch rejection consumes five durable attempts with zero POST. New real accepted HTTP receipt fsync failure reconciles on reopen without another POST; help then works. Qualified remote nonacceptance/idempotency/delivery not proven. |
| PV12 | **PASS** | Real blocked HTTP pause commits within bounded time, prevents next content effect; storage failure readiness 503; abort/stop/reopen preserve durable work; exact frozen process smoke SIGTERM exit 0 with owned lock removed. Text slice only; full progress/transport/SLA/reminder controls not closed. |
| PV13 | **BLOCKED** | BLOCKED for full original assertion intent. Foundation40 unchanged; all original37 names/30+7 executions retained, no skips; Node22 root typecheck, product lint/public build pass; shared/config/lock sources MATCH. Raw original-source diff inspected: model JSON test changes positive parse to policy_denied and generic malformed rejection now also hits policy, so original clinical model parser/HTTP proof is NOT_RUN/BLOCKED under NO_MODEL. Static fixtures are useful authorized local contract evidence, not original model-HTTP proof. |
| PV14 | **PASS** | Exact frozen public bundle copied by hash to scratch and run as process: actual clinical webhook policy_denied; fake model request counter 0, raw preserved/document confirmed, derived tasks 0. Default composition and explicit ModelOrganizer deny before provider; no INTERNAL relabel or model budget work. |

## Separate gaps and handoff

- All 24 HISO/PISO criteria remain unchanged; a slice does not close all PISO001–004
- Audio/Whisper and operational human qualification remain pending
- P07/P09 model-HTTP proof remains pending D2 under clinical NO_MODEL
- P05/P06/P10 full reminder and control, PISO007 infrastructure, PISO008 restore and pilot not first-slice closure
- HISO005 review is closed for this authorization; no further boundary correction or review
- Shared D009/D011 integration requires HISO005 acceptance
- SPEC §5.4 full upgrader/operator decisions, removal of operational hold, rollback/roll-forward and post-upgrade public cycle remain separate gaps; foundation migration tests do not close them.
- Actual audio10/Whisper and human reading/qualification NOT_RUN; sandbox byte/transcript HTTP seams are not those proofs.
- P07/P09 actual clinical model HTTP and original ModelOrganizer model/schema path BLOCKED pending D2; static V2 injection cannot mark them PASS.
- Full reminders/concurrency/control/AP011 delivery latency, transport/progress readiness, infrastructure/network/image/restore/backup alerts, pilot/release/certification remain NOT_RUN here.
- No additional C1 checker/source/review, core/full-root regression, PostgreSQL, root test:e2e, SBOM/licenses/certify, deployment or push performed by this Critic. Lead concurrent root regression is not this report’s evidence.

No shared runtime/execution/backlog/coordination update or commit/push was made; the explicit lane restriction takes precedence. Lead can integrate this scoped REJECT and triage F01–F04. This review performed no correction and approves none of its own test code as product implementation.

[Machine verdict](verdict.json) contains every PV criterion, command argv, exit and log SHA. [Artifact manifest](artifact-manifest.json) hashes the report/verdict/logs/probes and points to retained scratch artifacts. [Probe source](critic-adversarial.test.ts) reproduces failures; all physical probe volumes are retained.
