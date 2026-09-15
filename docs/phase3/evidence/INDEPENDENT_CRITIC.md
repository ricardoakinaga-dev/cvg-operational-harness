# Independent Critic Ledger — Phase 3

Three fresh-context, read-only critic windows were used. The final verdict is
the last entry.

## Round 1 — REJECT (code-inspection critic, no shell)

- Independence: fresh context; read-only; no shell tool available to it.
- Findings:
  - **F1 P0** duplicate effects: loop detection allowed up to the configured
    threshold of identical non-idempotent invocations, and A/B alternation
    could evade signature repeats entirely.
  - **F2 P1** false grounding: the `ACTION_CONFIRMED` guard exempted
    decisions carrying a toolId.
  - **F3 P1** policy fail-open: V2 accepted unsupported policy outcomes where
    V1 failed closed.
  - **F4 P2** evidence integrity: empty PostgreSQL proof artifact, stale
    digest in the report, missing critic ledger, Phase 2 refresh bound to the
    pre-implementation bytes.
  - **F5 P2** crash-window budget accounting could lose an in-flight counter
    increment.
  - **F6 P2** unclamped `maxDecisionRepairs` accepted `NaN`/`Infinity`.
  - **F7 P2** a failed final checkpoint write was silently swallowed.
- Result: `REJECT`; all runtime attacks it could test were not substantiated.

### Repairs applied after round 1

- F1: default repeat threshold 2; non-idempotent side-effecting tools stop
  before a second identical invocation; `detectDecisionCycle` stops A/B/C
  cycles on closure. Tests `P3-LOOP-DETECT-001..005`.
- F2: removed the toolId exemption. Tests `P3-GROUNDING-002/003`.
- F3: policy outcome validation with fail-closed zero-effect stop. Test
  `P3-GOV-003`.
- F4: final-byte Phase 2 revalidation with a captured gate log; report digest
  updated; this ledger added; empty artifact removed.
- F5: counters are incremented and checkpointed before the guarded operation.
- F6: repair budget clamped to 0..5 with finite default 1.
- F7: final checkpoint failure degrades the stop reason to
  `INSUFFICIENT_EVIDENCE`. Test `P3-CHECKPOINT-007`.

## Round 2 — REJECT (execution-capable critic, fresh context)

- Independence: fresh context; read-only; executed the candidate digest and
  the focused, worker, PostgreSQL, API and E2E suites; plus 10 adversarial
  probes.
- Runtime result: **every runtime-safety attack failed** — no unauthorized
  effect, no loop-caused duplicate effect, no cross-tenant leak, no accepted
  checkpoint corruption, no budget bypass, no uncontrolled loop, no terminal
  resurrection, no V1 regression, no product coupling. Repairs F1, F2, F3,
  F5, F6, F7 verified as effective with its own probes.
- Blocking finding (P1): the frozen functional digest did not reproduce
  (`439e1d…`/901 vs declared `54f72a…`/899) because the hashed scope included
  `docs/phase3`, where the identity artifact and evidence files were written
  after the digest. The F4 repair was therefore ineffective as an identity
  binding; the Phase 2 final-bytes addendum cited a pre-finalization digest.
- Notable corroborating observations: no source/test/script file changed
  after the freeze; the runtime bytes were the frozen bytes.
- Result: `REJECT` on evidence integrity, not on runtime behavior.

### Repairs applied after round 2

- `scripts/phase3-candidate-digest.mjs` scope reduced to
  implementation/test/script/root-configuration files; documentation is
  excluded by design (self-reference eliminated).
- New reproducible digest
  `122128b0…`/800, stable across repeated runs and after documentation
  writes.
- `docs/phase3/evidence/PHASE2_REVALIDATION_FINAL.json` rewritten and
  machine-anchored to `docs/phase3/evidence/VERIFY_PHASE2_FINAL.log`
  (captured `verify:phase2` run on the final bytes, exit 0).
- `PHASE2_FINAL_SENTINEL.json` preserved as history with an explicit note;
  new `PHASE3_FINAL_SENTINEL.json` binds the final digest and the supersedes
  chain.

## Round 3 — REJECT (execution-capable critic, fresh context)

- Independence: fresh context; read-only; executed the digest (4x), the
  focused suites, the iterative PostgreSQL integration and `npm test`
  (256 files / 1,782 passed at the time).
- Freeze gate: **PASS** — digest reproduced identically four times; the
  evidence chain was consistent; the historical sentinel was correctly marked
  superseded; the captured `verify:phase2` log was valid.
- Runtime attacks: repeated non-idempotent decision (BLOCKED), A/B alternation
  (BLOCKED), unsupported policy outcome (BLOCKED), budget reset after restart
  (BLOCKED).
- Blocking finding (P1): the `ACTION_CONFIRMED` false-success guard accepted
  **any** previous successful tool observation, so an unrelated successful
  READ followed by a claim of a confirmed reservation reached `COMPLETED`. The
  evidence attestations ("with or without a tool id") were therefore false.
- P3: stale `1,772` counts in four documents (docs only).
- P4: `README.md` was inside the hashed scope despite the
  documentation-excluded rationale.
- Result: `REJECT` on grounding attestation + minor doc/scope items.

### Repairs applied after round 3

- Claimed-effect guard: `ACTION_CONFIRMED` now requires the exact named tool
  to have succeeded, or (unnamed) a side-effecting (`WRITE`/`EXTERNAL`) tool
  to have succeeded; a prior read never satisfies the claim. The runtime
  records the tool `sideEffect` on success observations so the evaluator can
  enforce this structurally. Tests `P3-GROUNDING-004/005/006`.
- `README.md` removed from the hashed scope.
- Test counts updated to `1,782` across the report, catalog, scorecard, state
  and logs.
- Evidence re-frozen at functional digest
  `724960162e87244d8cf290efbe411abaadb1f44eab889434e0c92a6dbd0c04b8` / 799
  files, migration digest `686841b2…` / 20; `verify:phase2` re-captured.

## Round 4 — REJECT (execution-capable critic, fresh context)

- Independence: fresh context; read-only; reproduced every gate
  (`npm test` 1,782/111; PostgreSQL 26/196/0; E2E 6/6; evals 10/10) and the
  digest twice; ran 16 adversarial probes.
- Runtime attacks: the round-3 grounding repair blocked the specified attacks
  (READ then unnamed ACTION_CONFIRMED; READ then claim naming an unrun WRITE);
  the legitimate WRITE confirmation completed; repeated non-idempotent, A/B
  alternation, unsupported policy, injected authority fields, NaN budgets,
  terminal resurrection, cross-tenant reads, wrong approval binding and budget
  reset were all BLOCKED.
- Blocking findings:
  - **F1 (evidence inconsistency)**: stale counts remained in
    `PHASE_3_REPORT.md` (1,779 vs 1,782), `scorecard.md` (1,772) and
    `20_master_execution_log.md` (1,772), contradicting the repair ledger.
  - **F2 (P2 residual grounding)**: a model could name a successful READ as
    the "confirmed action" and carry write-claiming text to COMPLETED.
  - **F3 (P3 availability)**: a rejected resume binding persisted a terminal
    checkpoint, so a subsequent correct binding could not resume.
  - **F4 (documented boundary)**: checkpoint digests are integrity hashes, not
    keyed authenticity; a store writer can re-seal a forged checkpoint
    (trusted-infrastructure boundary, no KMS in scope).
- Result: `REJECT` on evidence inconsistency + F2.

### Repairs applied after round 4

- F2: `hasConfirmedEffect` now requires the named tool to be side-effecting
  (WRITE/EXTERNAL), closing the named-READ path. Tests `P3-GROUNDING-007`.
- F3: a rejected resume binding no longer writes a terminal checkpoint
  (`preserveCheckpoint`), so the durable pause stays resumable. Test
  `P3-PAUSE-004`.
- F1: counts corrected to 1,784 passed / 111 skipped across the report,
  catalog, scorecard, state, log and backlog.
- Evidence re-frozen at functional digest
  `462709aec2bf0b9a4473bfae7cc216270d0ff249a905710445874971d387cb49` / 799
  files; `verify:phase2` re-captured; F4 documented in `SECURITY_REVIEW.md`.

## Round 5 — REJECT (execution-capable critic, fresh context)

- Independence: fresh context; read-only; reproduced the digest twice, all
  four required gates exactly, and ran 16 further probes.
- Repairs verified: F2 named-READ claim blocked (including WRITE-then-READ
  and never-run-tool variants), F3 rejected binding preserved the pause and a
  later correct binding completed with one effect, F1 counts consistent, F4
  documented without an authenticity claim.
- Blocking finding (F5): a wrong-kind `approval` resume against a
  question-paused checkpoint was accepted as a "safe no-op" (no
  pendingApprovalId), the pending-question gate was skipped because a resume
  was present, and the loop executed a side-effecting tool while the question
  stayed unresolved.
- Minor: catalog/scorecard did not cite the digest and omitted the newest
  repair tests; `PHASE_3_RESULT.json` was still provisional.
- Result: `REJECT`.

### Repairs applied after round 5

- Wrong-kind resume: an `approval` resume while a question is pending now
  fails closed with `STATE_CONFLICT` and preserves the pause; a `user_input`
  resume while an approval is pending does the same; a pending question
  re-pauses for any non-`user_input` resume. Test `P3-PAUSE-005` (plus the
  existing `P3-PAUSE-004`).
- Catalog updated with the digest binding and tests `P3-GROUNDING-007`,
  `P3-PAUSE-004/005`; security review references updated.
- Evidence re-frozen at functional digest
  `ba6a6274fa9f06b47b7d48357bfceb33e299760f29b45f8ad874b22c05088853` / 799
  files; gate log re-captured; counts updated to 1,785.

## Round 6 — APPROVE (execution-capable critic, fresh context)

- Independence: fresh context; read-only; reproduced the digest twice and all
  four gate counts exactly (256 files / 1,785 passed / 111 skipped;
  PostgreSQL 26/196/0; E2E 6/6; evals 10/10); ran 12 further probes.
- F5 repair confirmed: a wrong-kind resume (approval against a question
  pause, user input against an approval pause) fails closed with zero effects
  and preserves the durable pause; the consumed-approval no-op retry neither
  re-executes nor unlocks anything; the correct binding resumes with exactly
  one effect.
- Classic attacks re-confirmed blocked: repeated non-idempotent decision
  (1 effect), A/B alternation, unsupported policy outcome (zero effect),
  false `ACTION_CONFIRMED` naming a READ.
- Residual findings (Low/Info, no rejection trigger): scorecard lacked the
  digest citation (fixed); `PHASE_3_RESULT.json` was provisional (finalized);
  contract-legal PENDING approval without an id yields an unresumable pause
  (fail-closed, not exercised); stale `dist` maps (environment note, `dist`
  is outside the digest); sentinel timestamps predate bound bytes (content
  hashes verified).
- **Verdict: APPROVE.**

## Final verdict

`APPROVE` — Runtime V2 is certified at C5 for the controlled synthetic
hybrid loop. No unauthorized effect, no loop-caused duplicate effect, no
cross-tenant leak, no accepted checkpoint corruption, no budget bypass, no
uncontrolled loop, no approval/policy bypass, no terminal resurrection and no
Runtime V1 regression was found across six independent critic windows.
Production remains `NO_GO`; the conditional status and residual uncertainties
are recorded in `PHASE_3_RESULT.json` and `PHASE_3_REPORT.md`.
