# SPEC0214 R4 — same-reviewer bounded F01 recheck

**ACCEPT_SPEC — technical proposal readiness only.** F01 is resolved at the design level for the specified synthetic composition. No remaining material defect or introduced contradiction was identified within this bounded repair review.

This is a **same-reviewer recheck, not a fresh final review**. It evaluates the concrete R4 HOW against the original F01 bar and the R3 remainder. It does not accept implementation, authorize BUILD, approve user choices, establish runtime quality/full parity, or grant release. U1–U4 remain user-pending. Previous R2 and R3 REVISE_SPEC reports/verdicts remain historical findings for their respective candidates; they were neither opened nor modified in this turn.

## Frozen inputs and integrity

- Packet: `/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-spec0214-r4-packet`.
- Adjacent sentinel: `critic-spec0214-r4-packet.sentinel.json`.
- Sentinel SHA-256: `b0e668e5c5f916e82047809512232eaa47a4e871e825455d97c512e884f28854`.
- Candidate SHA-256: `ac3af1ccb60dff4398de5c660175ac8c4fbbf0e286e5aaae378d93dd16c40e62`.
- All **78/78 files** matched every sentinel path/hash before inspection and after review; no missing, extra or changed file. Sentinel hash remained identical. Full source hashes are in `verdict.json`.

Evidence came only from this sealed packet and its adjacent sentinel. Processing was limited to static text reads and hashing. No live worktree/source, external/reference repository, network/provider/DB, build, repository test execution, code/ledger change or descendant was used. Only this new result directory's `report.md` and `verdict.json` were written.

Citations below are packet-relative: `S` is `docs/02_spec/0214_pare100_platform_kernel_delegation.md`; `I/` is `docs/04_audit/evidence/PARE100-EXEC-20261014/spec0214/read-inputs/`.

## F01 — historical P2, resolved in this proposal

| Original requirement | Concrete R4 design and assessment |
| --- | --- |
| Final veto after ledger/journal awaits, before actual handler | S:142–144 retains the synchronous local pause/effective-signal/controller/deadline check and indivisible marking plus invocation of the captured handler, with no intervening await/callback/I/O. This addresses the captured kernel check-before-ledger sequence and journal waits (`I/packages/harness/src/kernel/pipeline.ts.source.txt:483–513`; `I/packages/harness/src/effect-journal.ts.source.txt:314–348`). |
| Admission evidence exists even if executor never resumes before kernel return | S:157 initializes per-command AdmissionState before dispatch, with PENDING, handlerStarted=false, closed=false and owned signal/deadline references. The only permitted handler-entry transition is synchronous PENDING→ENTERED. The façade therefore possesses an authoritative state without waiting for an executor-generated fact. |
| Close pending admission before result projection | S:159 requires synchronous PENDING→CLOSED_WITHOUT_ENTRY immediately on kernel return/rejection, before any façade finalization/projection await. handler0 follows from the unique transition having been prevented; it is not inferred from a failed result. ENTERED states preserve actual entry and settlement uncertainty. This closes the precise R3 timing gap. |
| Exact normalization without inventing a cause | S:146–153 and159 define evidence-fault/cancel/deadline/pause-error/pause precedence from owned observations, keep the raw kernel stop separately and use TERMINAL_BEFORE_ENTRY if none of those observations exists. That fallback retains the actual kernel stop; an external rejection without a result becomes INTERNAL_FAILURE. In particular, generic TOOL_FAILURE is not proof of cancellation. The captured iterative dispatcher really maps approved cancellation/deadline to TOOL_FAILURE (`I/packages/harness/src/iterative-dispatch.ts.source.txt:584–597`), so this distinction is necessary and now explicit. |
| Late ACK cannot admit handler or rewrite public result | S:161 makes terminal closure irreversible and requires a late executor to check closed first and return REJECTED/terminal_admission_closed. No recreation, authorization repeat, ENTERED transition or trace/cause rewrite is allowed. Late activity is reconciliation diagnostics only. The façade does not wait indefinitely for journal ACK. |
| Preserve authority, evidence and actual bookkeeping | S:155,159–161 preserves consumed approval and acknowledged ledger/journal starts, keeps entered-handler uncertainty distinct, and does not fabricate an effect or ACK, erase records, release grants or replay. Mandatory observed evidence faults retain priority (S:183–197,211). This remains compatible with fail-closed trace projection and the existing envelope mapping (S:213–264). |
| Oracle covers return before admission fact | S:163 now holds journal-start ACK through kernel return and façade projection, aborts the owned controller before return, requires the first returned trace to carry controlled_runtime_cancelled/failed/H and approval400, then releases a successful ACK before the original deadline. It asserts handler0 both times, immutable snapshot/trace, unchanged consumed grant and no replay. Its negative control preserves the kernel reason when there is no owned cancel/deadline/pause evidence. S:165 retains independent ledger/journal pause/cancel windows and the positive control. All are proposed, NOT_RUN. |

The static interleaving that blocked R3 is now covered: `raceInvoked` may return on cancellation while the journaled Promise is pending (`I/packages/harness/src/kernel/pipeline.ts.source.txt:157–180,515–521`); R4 no longer waits for the later executor to create the evidence needed for projection. It closes the already-owned pending state synchronously, normalizes from its own abort evidence, and prevents the later journal continuation from entering the original handler. This is a specified mechanism, not merely an added expected assertion.

No material contradiction was identified between that repair and the adjacent canonical-command, evidence-latch, settlement and public projection contracts inspected. The final veto remains internal to the synthetic composition and adds only denial, not authority. The retained historical R2/R3 narrative labels elsewhere in the candidate do not alter the explicit R4 technical closure or pending gate; this recheck is not relabeled as fresh review.

## Authority and limits

S:4 and379–382 still leave U1–U4 pending: the synthetic attested single-tool restriction, sequential/whole-turn success semantics, finite budgets/error normalization, and explicit user review of 0214. The user's 0211/0212 approvals do not approve 0214 BUILD.

This ACCEPT_SPEC applies to technical proposal readiness of the frozen R4 candidate in this same-reviewer bounded recheck. It does not retroactively change the R2/R3 verdicts. No runtime behavior or test result has been established. Implementation acceptance, durable recovery, full parity, production and release remain outside this verdict.

Packet untouched: confirmed by before/after full sentinel comparison, **78/78 matching** and sentinel bytes unchanged. Prior result directories and all ledgers were untouched.
