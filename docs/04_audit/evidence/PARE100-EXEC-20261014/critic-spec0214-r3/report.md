# SPEC0214 R3 — same-reviewer bounded recheck — REVISE_SPEC

**Verdict: REVISE_SPEC, technical proposal readiness only.** This is the same I1 reviewer rechecking the document-only F01 repair against the original bar. It is **not a fresh final review**, implementation acceptance, or a new broad audit. No descendants were used.

F01 remains **P2 / partially resolved**. Section 4.3.1 now specifies a sufficient final synchronous handler-entry veto, but its exact normalization depends on a fact that may not exist when the existing kernel returns. That leaves one of the original F01 requirements—exact projection for a late cancel before handler entry—incomplete. There is no severity escalation or new unrelated requirement.

## Integrity and method

Input: `/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-spec0214-r3-packet` and its adjacent `.sentinel.json` only. All **78 files** matched the sentinel before inspection and after the recheck, with no missing, additional or changed file; sentinel bytes also remained unchanged.

- Sentinel SHA-256: `8f75e81bb0d45160d44b53ed08dd7e336dff8ccdca29ac0dbf11a23724ede018`.
- Candidate SHA-256: `5052d91be485904dc4a72b7909faa7dcde461bf828854caeba1f386be5f9a08a`.
- Full source hashes are included in `verdict.json`.

Only static text inspection and hashing were performed. No live source/worktree, reference repository, network, provider, DB, build, repository tests, code changes or ledger writes were used. Only this result directory's `report.md` and `verdict.json` were written. The original F01 bar comes from this reviewer's preceding turn; previous packets/reports were not reopened.

Citations are packet-relative. `S` is `docs/02_spec/0214_pare100_platform_kernel_delegation.md`. `I/` is `docs/04_audit/evidence/PARE100-EXEC-20261014/spec0214/read-inputs/`.

## What the repair closes

S:142–144 explicitly places a veto at the actual prepared-handler boundary after ledger/journal/approval awaits, uses the same local synchronous monotonic pause object supplied to the factory, rejects unavailable/async/invalid pause reads, and checks the effective context signal, local controller and deadline. It marks handler entry and invokes the captured function with no await/callback/I/O after the last check. This closes the previously unspecified mechanism for preventing handler entry after a pause/cancel during healthy bookkeeping.

That placement fits the captured execution path: the kernel revalidates before `await effects.started`, then invokes the journaled capability (`I/packages/harness/src/kernel/pipeline.ts.source.txt:474–513`); the journal awaits reserve/start before calling the capability (`I/packages/harness/src/effect-journal.ts.source.txt:314–348`); the capability invokes its implementation at `I/packages/harness/src/capability-boundary.ts.source.txt:351–372`. No new factory hook or unsupported kernel import is needed for the proposed private handler-entry check.

S:155 also correctly distinguishes handler0 from already acknowledged bookkeeping, retains consumed approval, and uses existing failed/rejected settlement without erasing start records, releasing grants or replaying. The underlying journal fails non-success results (`I/packages/harness/src/effect-journal.ts.source.txt:365–378`); kernel approval settlement handles failed/cancelled outcomes (`I/packages/harness/src/kernel/controls.ts.source.txt:597–659`). S:157 names the required independent ledger/journal pause/cancel windows, invalid-port cases and positive control. These are proposed oracles, not executed results.

## F01 remainder — P2: kernel can finish before FinalAdmissionFact exists

**Written normalization.** S:144 creates `FinalAdmissionFact` when the prepared executor reaches its final check. S:146–153 then uses this private fact to normalize a wrapper's TOOL_FAILURE into CANCELLED/MAX_DURATION/HUMAN_TAKEOVER/INTERNAL_FAILURE. S:157 promises exact stop/trace/envelope assertions for cancellation while journal-start ACK is held. S:203 otherwise projects the returned kernel result using the existing stop matrix. There is no specified terminal handoff, pre-entry attempt state closure, or projection-time normalization for a still-pending executor that has not reached that final check.

**Captured kernel behavior.** `raceInvoked` starts the journaled operation and independently races its Promise against cancellation/deadline (`I/packages/harness/src/kernel/pipeline.ts.source.txt:157–180`). On cancellation it can return while that operation is still awaiting journal-start ACK; the tool controller is aborted (`:515–521`). The kernel can then settle the ledger and approval, close logs/checkpoints and return without awaiting journal/handler completion (`:558–571`; `I/packages/harness/src/kernel/controls.ts.source.txt:636–645`). In an approved invocation, the iterative dispatcher explicitly converts the cancelled outcome to **TOOL_FAILURE**, rather than CANCELLED (`I/packages/harness/src/iterative-dispatch.ts.source.txt:551–552,592–597`). Finalization returns that result after checkpoint/audit (`I/packages/harness/src/iterative-runtime.ts.source.txt:1569–1641`).

**Concrete static interleaving permitted by R3.**

1. Use the valid single attested synthetic tool with required approval successfully consumed. Kernel, ledger-start and journal reservation succeed.
2. Hold `journal.markStarted` ACK pending. The private prepared executor has not yet been called, so no `FinalAdmissionFact` has been created.
3. Abort the effective/local signal while sufficient deadline remains. Keep the journal ACK pending, but let independent ledger-finish, approval settlement, log, checkpoint and final audit operations acknowledge successfully.
4. The kernel race ends, and the approved iterative invocation returns TOOL_FAILURE while the journaled operation remains pending. The evidence latch need not fail: the held I/O has neither rejected nor exceeded its deadline.
5. The façade can now project the result. R3 has no admission fact yet and specifies no wait/terminal closure that makes one available. Applying S:203 and its matrix yields `controlled_runtime_tool_failure`; the new table promises `controlled_runtime_cancelled` for this pre-handler cancellation.
6. Release the journal-start ACK successfully **after projection but before its deadline**. The new entry veto prevents the handler and creates the cancel fact, but too late to supply the promised already-returned normalization. A16 (S:346) also prohibits changing the closed result later.

The late handler-entry veto is therefore useful and technically specified; the gap is availability of its evidence at result projection. Both possible results remain safe failures and approval HTTP400, so this is P2, not a claim of an observed effect or a successful public execution. The material mismatch is exact stop/handoff normalization and a missing terminal protocol under the original F01 bar.

**Required document repair.** Specify how per-attempt admission state is initialized and irrevocably closed when the kernel returns before the prepared executor reaches admission. The projector must have a trustworthy, timely basis for the promised normalized cause and handler-entry status, and late continuations must not admit the handler or rewrite the closed trace. A design can synchronously close a pending admission using owned cancellation/deadline evidence, or define another bounded coordination protocol; it must not silently wait indefinitely for journal ACK, invent an observed veto, infer body0 from a generic failed result, or change the captured kernel's stop retrospectively. Preserve mandatory-evidence precedence, consumed grants and actual journal/ledger state.

Extend the already proposed A11 journal cancellation oracle to hold journal-start ACK **through kernel return and façade projection**, with all independent settlement evidence healthy, then release ACK before the original deadline. Assert the chosen exact normalized code at first return, handler0 both before and after late ACK, immutable trace and no release/replay. This is an ordering refinement of the original requested late-veto projection check; it is not a request to run tests in this review.

## Introduced-contradiction check and T3 boundary

No other material contradiction was identified in the bounded repair. The local synchronous PauseSwitch restriction is explicitly confined to the synthetic composition (S:142); it does not require changing the public PauseSwitch ABI. The new veto is monotonic, preserves canonical-command parsing/provenance (S:122–138), and keeps the original evidence latch and raw kernel diagnostic distinct from normalized public status (S:146,175–203). Settlement faults still dominate via the mandatory-evidence rule. The remaining problem above is the ordering prerequisite for using the new fact, rather than a disagreement with the proposed stop mapping itself.

U1–U4 remain user-pending (S:371–374): synthetic/attested/single-tool scope, fail-fast and whole-turn public success semantics, finite budgets/error normalization, and explicit final 0214 T3 review. These choices do not resolve the missing technical terminal protocol. Approvals of 0211/0212 do not authorize 0214 BUILD. Some surrounding R2 narrative labels remain in the R3 document; they are editorial and not additional technical blockers in this recheck.

This report makes no implementation, full parity, runtime quality or release claim. Packet untouched: all **78/78** frozen files and the adjacent sentinel match before/after. Only the two authorized new result files were written.
