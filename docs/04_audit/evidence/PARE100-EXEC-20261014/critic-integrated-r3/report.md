# Frozen R3 independent reliability/retest review

**Source reliability: PASS. SDK stdio: PASS. Controls/kernel source: PASS.**
No material unresolved source defect was found in the approved SPEC0211/0212 reliability lane. This is a bounded source verdict, **not full SPEC acceptance, security qualification, production acceptance or 36-card parity/release acceptance**. Overall acceptance remains **PENDING / NOT ACCEPTED**.

## Artifact, authority and independence

- Read-only artifact: `/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-integrated-r3-packet`.
- Exact hash **and file-set** verification before and after: **1,113/1,113**, missing 0, extra 0, differing 0. Sentinel itself unchanged: `e99fb52ccd30cfd22c7787fe6ea9ae619e85780a84078162a4daf84ad3e0e9cb`.
- SPEC0211 SHA-256: `ae109b33a8457869d0939bb3f32557b8f8d5e8d5054fa1e141ab5c896b508a7f`.
- SPEC0212 SHA-256: `559e7da51d49f9e4ba7c1405a95d9ef2d61256e901d3b26c36f20276d551db4b`.
- Review authority: the user's explicit approved-code audit instruction. No inference of approval from the SPECs' older review-state prose.
- Fresh critic, separate from builders, no descendants; conservative independence classification I1. No builder report, prior verdict, history or live implementation used as correctness evidence. Constitution/coordination instructions were consulted as operating rules only; status and coordination narratives do not support any verdict here.
- Executions used the packet copied into **owned scratch** and a reflink-capable copy of `worktree/node_modules`. No live source or live compiled workspace output was copied. All 50 dependency symlinks resolve within scratch, none broken. Original packet files in scratch also matched all 1,113 hashes after QA.
- Node **v22.23.2** from the required PATH; minimal runner environment, owned synthetic HOME and TMPDIR. No install, lockfile change, DB, provider/network request, deployment, shared write or OS security bypass probe. Shipped shell regressions use injected runners or fixed ordinary commands in their own temporary workspaces.
- Earlier model-capacity failure/retry is **infrastructure**, not a source failure or acceptance evidence.

## Frozen criteria and direct source judgments

References below are relative to the frozen packet, not to the current worktree.

### SDK lifecycle and reader — PASS

1. **Stop admission, retain input lifecycle observation.** `packages/sdk/src/stdio.ts:123–188` gives the reader separate admission stopping and final cleanup. An `onFrame === false` removes only `data`, clears the tail and stops the remainder of that chunk; `end`, `close`, `error` remain attached until final cleanup. `:539–548` uses this path for lifetime overflow. It does not merely detach all input observers.
2. **Preserve already accepted work without imposing explicit-close timeout.** `stdio.ts:484–527` drains the accepted queue while state stays OPEN, and finishes after exhaustion only when the active pump settles. Lifetime overflow sets `exhausted`; it does not start the close timer. Shipped slow-work coverage at `packages/sdk/src/__tests__/stdio.test.ts:377` and independent compiled-library execution both verify this. The independent case held work for 50ms with `closeTimeoutMs=10`, then received exactly responses 1 and 2, with IDs 3 and 4 refused.
3. **Input failure discards queued work and observes late completion.** `stdio.ts:467–483` clears the queue; transport failure finishes immediately. The pump checks state after awaiting dispatch (`:493–494`), catches late rejection (`:522–527`) and does not write or dispatch another request. Independent real-stream cases covered end/error/close, each with late resolve and late reject, plus input failure during an active stuck write. No unhandled rejection occurred.
4. **Explicit close remains bounded.** `stdio.ts:467–475,569–574` moves out of OPEN, discards queued work, waits at most the configured timeout for active work and then detaches/cancels local listeners/write state. Both shipped tests and the independent public-package case exercised close after lifetime exhaustion. `closed` proves adapter cleanup, not cancellation or completion of an external effect.
5. **Reader invariants remain coherent.** Byte/LF bounds are checked before assembling a tail; incomplete UTF-8 is not decoded; fatal UTF-8/JSON error terminates the connection; CRLF and coalesced/fragmented frames preserve order. EOF with a tail is a frame fault. No recovery from a malformed tail, batch or notification dispatch was introduced. See `stdio.ts:129–188` and framing/validator tests.
6. **Writer, settlement and correlation remain bounded.** The writer requires callback plus drain when write returns false (`stdio.ts:191–243`). Client transitions to WRITTEN immediately before attempting write (`:310–316`), validates response before deleting pending (`:324–364`), and classifies collective failures by each request's state (`:289–304`). Server serializes/measures a response before writing, with the bounded `response_too_large` alternative (`:501–519`). Fixed local errors and original remote code/data are preserved as specified. Method dispatch uses `Object.hasOwn` in `packages/sdk/src/server.ts:403–421`; validators enforce result/session/tenant/order constraints.

Shipped SDK tests include the real child/session/kernel path, malformed and oversized framing, lifetime/queue/byte limits, terminal timeout, callback/drain ordering, late completion, uncertain append-after-execution failure, and host authority. This review did not re-create an earlier source version or claim an independently observed RED-before-fix baseline.

### Controls, persisted no-replay evidence and grants — PASS

- **Wiring:** `packages/harness/src/createOperationalHarness.ts:83–113` forwards the injected pause/effects/sandbox instances into both runtimes; `iterative-runtime.ts:425–432` installs those control ports in the kernel. Public paused-model/tool and injected-ledger probes pass.
- **Settlement:** `kernel/pipeline.ts:487–570` catches sync/async `effects.started` failure before the body, calls finished once after the outcome, and converts settlement failure into `threw / unknown_effect: effect_settlement_failed` before post-execute/return. Failure duration and the original outcome supplied to finished are exercised in the matrix at `pare100-public-controls.test.ts:984`. A wrapper changing the outcome after the body does not suppress settlement.
- **Lossless fence:** `iterative-dispatch.ts:632–640` writes the exact settlement cause in the governed FAILED TOOL step. `iterative-runtime.ts:655–704` reads step-store evidence, matches tenant/execution/pending step/type/status/exact error and preserves the checkpoint on uncertainty; a failed step read stops as INSUFFICIENT_EVIDENCE. It does not identify the failure from truncated observation payload or generic TOOL_FAILURE alone.
- **No-replay evidence:** `pare100-public-controls.test.ts:180–361` exercises sync/async settlement failure at payload bounds 1/32/64/71/72/4000, reentry and JSON-round-tripped restart, forged uncertainty presentation for an otherwise settled failure, unavailable step evidence and failed final checkpoint write. These passed with the tool body/ledger not repeated in the uncertain cases. This is in-memory durable-contract testing, not PostgreSQL proof or a guarantee when all durable evidence is lost.
- **Stale results:** `iterative-dispatch.ts:322–324` clears `lastToolObservation` for the new dispatch. The multi-tool tests at `pare100-public-controls.test.ts:367–448` preserve the first success as trajectory evidence while refusing to expose it as the second uncertain attempt's toolResult, including reentry.
- **Sandbox grant:** `kernel/pipeline.ts:361–460` checks mode, flag types, optional finite positive deadline and required/absolute root, then passes a detached frozen grant to the body. `packages/sandbox/src/shell-tool.ts:179–208,254–261,282–310` rejects missing/invalid/subprocess-denied or out-of-root grants, realpaths both grant and configured root, and forwards a canonical root with the original flags and the minimum timeout. No model payload grants authority. A trusted injected runner proves propagation, not native isolation strength.
- The six additional profile-specific kernel assertions are present and executed in the **99-test** public-controls file: unexpected outcome, PROCESS grant without optional workspace root, and post-body wrapper outcome change/settlement failure across both profiles. Both shell suites and existing kernel regressions also passed.

## Actual executable checks

Every row has its exact argv, cwd, environment, raw stdout/stderr, exit and duration in `<label>.log` / `<label>.json`. `checks.json` indexes the runs. Logs are fresh executions, not builder reports.

| Label | Actual scope/result | Exit |
| --- | --- | --- |
| `sdk` | All 3 shipped SDK files, **123 passed**, 0 skipped | 0 |
| `core-controls-shell` | Complete selected harness/agent-runtime/orchestrator/contracts source suites; two sandbox shell suites; public surface and SDK-session consumers: **66 files / 905 passed**, 0 skipped. Includes public controls 99, public surface 7, shell handle 12, shell tool 18 | 0 |
| `replay` | Shipped snapshot replay command, **42 passed** | 0 |
| `public-controls-probe` | Original public pause/effects probes, **2 passed**; fresh actual outputs saved alongside this report | 0 |
| `independent-lifecycle` | **9 independent ordinary-library cases**, compiled `@cvg/sdk` import, no source aliases; 0 unhandled rejections | 0 |
| `typecheck` | Shipped source tsconfig, `tsc --noEmit` | 0 |
| `lint` | Shipped ESLint configuration over scratch | 0 |
| `public-sdk-build` | Shipped public builder; contracts/orchestrator/harness/sdk closure, `paths:{}` | 0 |
| `public-example-compile` | Both frozen example files compiled with package exports and no source aliases | 0 |
| `public-example-execute` | Frozen compiled parent/child example, synthetic HOME, hello/open/send/events; six expected events, COMPLETED, no tool effect, confirmed owned-child shutdown | 0 |
| `tool-catalog` | Frozen TOOL_CATALOG present and current: 7 tools / 1 skill | 0 |
| `boundary` | **INCOMPLETE**; see below | **1** |
| `node-version` | v22.23.2 | 0 |

Totals: **1,072 shipped tests passed**, plus **9 independent lifecycle cases**. These totals are not the entire repository/36-card program.

## Boundary gate and remaining acceptance limits

The unchanged shipped boundary checker was run **after compiling the SDK public dependency closure** in scratch. Actual output: **INCOMPLETE**, exit **1**, zero violations, **36 diagnostics = 23 child/stream source sites + 13 compiled reflections**, two unused exception records (pins do not hold), no installed-lock drift. `boundary.log` preserves the full result; `boundary-summary.json` lists diagnostics and unused pins. Zero violations is not a gate pass.

No checker, exception, pin or waiver was edited. Per the user, dedicated **SPEC0215 is NOT_APPROVED** and outside this lane. Its qualification gate remains required. In particular, SDK-W07 and CTL-W04 are only **partially evidenced**, not satisfied in full by this review: source tests/types/lint/public compile are green, while boundary is INCOMPLETE and the other required acceptance gates remain with the Lead.

**Not run:** PostgreSQL/DB tests, browser E2E, coverage/per-file gate, the rest of the full repository unit suite, certify, SBOM/licenses, network/provider integrations, OS security bypass probes and SPEC0215 qualification. No production/release decision is granted. Full 36-card parity and release remain unproved.

**Post-freeze delta is UNREVIEWED.** The user's notification about current `index.mts` using minimal child env/private HOME/explicit cwd/no NODE_OPTIONS, protected setup/nested finally, and a new RED-then-GREEN environment test describes bytes absent from this R3 packet. The frozen example still inherits its caller environment/cwd and has setup before its try and sequential cleanup. The executed example was supplied a synthetic minimal environment by this critic's runner; that does not test or approve the later source change, nor prove the frozen example safe under arbitrary inherited environment. No current whole-tree acceptance is claimed.

Next acceptance work belongs to the Lead: separately freeze/review the post-freeze delta, obtain and satisfy the concrete SPEC0215 gate, and complete required live gates/hygiene. This critic has not changed those gates or the candidate.

## Final disposition

**PASS for the frozen approved SDK/controls source reliability issues reviewed here. Overall SPEC/production acceptance: PENDING / NOT ACCEPTED.** The artifact and sentinel remain unchanged. Claims, raw results, independent synthetic code, source hashes and JSON verdict are confined to this owned result directory and scratch.
