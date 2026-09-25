# REM21-001 — SPEC

## Source-of-truth precedence

For this reconciliation, current reality is established in this order:

1. the current human authorization in prompt `0338`;
2. verified AUD20-008 task evidence and its candidate/run binding;
3. the new AUD21 task-local evidence packet;
4. current master pointers updated in one documentary transaction;
5. older AUD20 entries retained as immutable history.

No source is allowed to override a mismatched candidate, run, hash, scope or
freshness claim by prose alone.

## State model

```text
WAITING_HUMAN_APPROVAL_FOR_G21-1
  -> IN_PROGRESS / REM21-001
  -> VERIFY / REM21-001
  -> READY_FOR_NEXT_STEP / REM21-002
```

The terminal transition to the next task is allowed only after current
documentary checks and evidence are recorded. `I1_PENDING` is a limitation of
AUD20-008, not a reason to fabricate a review result.

## Controlled mutation surface

- task evidence: `docs/04_audit/evidence/AUD-20260921/REM21-001/`;
- current runtime pointer: `docs/99_runtime_state.md`;
- append-only chronology: `docs/20_master_execution_log.md`;
- current backlog summary: `docs/30_backlog_master.md` and
  `docs/03_build/0337_comprehensive_remediation_backlog.md`;
- build indexes: `docs/03_build/0300_build_engineer_master.md`,
  `0301_roadmap.md`, `0302_backlog_master.md`;
- current AUD21 plan/roadmap pointers: `0335` and `0336`.

Historical AUD20 task evidence, old execution-log entries and old runtime
sections are not rewritten.

## Verification contract

The task must run from the repository root with Node 22 selected for any npm
command. The minimum deterministic checks are:

- `sha256sum --check docs/04_audit/evidence/AUD-20260920/AUD20-008/sha256sums.txt`;
- `npm run docs:check-links` or an equivalent scoped checker;
- `git diff --check`;
- a source/diff review proving no code, external resource or historical
  evidence was changed unintentionally;
- an independent read-only review when available, with a mutation sentinel.

If I1 is unavailable, the evidence result is `PASS_LOCAL / I1_PENDING` and the
next action names the missing review. Any candidate or scope mismatch is
`FAIL`/`STALE`, never a conditional promotion.
