# REM21-001 — PRD

## Outcome

Make the current AUD21 control plane describe the latest confirmed local truth
without promoting historical certification or inventing independent review.

## Actors

- lead executor: reconciles current pointers and evidence;
- human authority: granted the bounded G21-1 execution scope by sending prompt
  `0338` and retains authority over external/freeze decisions;
- auditor/reviewer: consumes one unambiguous task state and candidate-bound
  evidence.

## Scope

In scope: current runtime state, master execution log, master backlog, build
indexes `0300`–`0302`, AUD21 backlog/plan/roadmap pointers, and a task-local
evidence packet for `REM21-001`.

Out of scope: rewriting AUD20 history, changing application behavior,
re-certifying the candidate, external integration, production, credentials,
real data, or any sensitive action.

## Required behavior

1. Current summaries state `G21-1 = AUTHORIZED_LOCAL` and
   `REM21-001 = IN_PROGRESS`.
2. Current summaries identify `REM21-001` as the only active AUD21 task.
3. The AUD20-008 candidate/run and `PASS_LOCAL / I1_PENDING` status are
   reproduced consistently with the retained evidence.
4. Historical AUD20 entries remain clearly historical and are not edited to
   create a new outcome.
5. If the candidate, run, hash, or scope does not match, the task fails closed.
6. Missing I1 review remains an explicit limitation and cannot produce a plain
   final approval.

## Acceptance criteria

- `REM21-001-AC-01`: all current master pointers agree on G21-1, active task,
  candidate/run and production `NO_GO`.
- `REM21-001-AC-02`: `sha256sum --check` for AUD20-008 exits `0` from repo
  root.
- `REM21-001-AC-03`: no historical AUD20 evidence file is modified.
- `REM21-001-AC-04`: a fresh I1 decision is either recorded or explicitly
  remains `I1_PENDING`; no inference is accepted.
- `REM21-001-AC-05`: link/state/diff checks cover the changed documentary
  surface and the final evidence packet is self-describing.

## Quality and safety

The proof is documentary and deterministic. It must preserve the dirty
worktree, use synthetic/local evidence only, and keep production `NO_GO`.
`PASS_LOCAL` is a local verification result, not a release or deployment
decision.
