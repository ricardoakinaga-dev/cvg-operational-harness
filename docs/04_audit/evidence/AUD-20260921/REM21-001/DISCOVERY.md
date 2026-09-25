# REM21-001 — Discovery

- program: `AUD21-COMPREHENSIVE-REMEDIATION`
- task: `REM21-001`
- finding scope: `A21-F11`, `A21-F13`, `A21-F20`, `A21-F22`
- authorization: `G21-1` conveyed by the current human execution request;
  local/synthetic/disposable only
- production: `NO_GO`
- observed at: `2026-09-21T13:23:20-03:00`

## Problem and evidence

The current AUD21 control-plane summary still says that `G21-1` has not been
granted and that `REM21-001` is not active. The retained AUD20-008 evidence,
however, records an implemented result `PASS_LOCAL / I1_PENDING` for candidate
`579d2100c172b5157ed42d1cf983988d3401a8c930353b52e50c589578ea55af` and run
`run-579d2100c172-mub8591x`. Earlier AUD20 master entries still describe
AUD20-008 as the next task. This is state drift, not evidence that the task
should be promoted.

The recovery inspection found:

- HEAD `05d1f33322a5b75e65ee3b6f0fa1a737c300d7bb`, branch `main`;
- 207 pre-existing worktree entries: 134 tracked/staged and 73 untracked;
- Node `v22.23.2` is installed at
  `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node`;
- the AUD20-008 evidence hash manifest passes from the repository root with
  exit status `0`;
- the pre-task Gauntlet fingerprint is retained outside the repository at
  `/tmp/cvg-aud21-20260921-pre-rem21-001.json`, digest
  `40d1977b93447094ee72f5038acf766780a21882b455a289cdff0d6d78839796`;
- the existing `.gauntlet` directory belongs to an older active AUD20 run and
  is preserved without overwrite.

## Stakeholders and constraints

The lead executor owns the local control-plane reconciliation. The human
authority owns G21-1/G21-6 decisions. Independent review is a separate
evidence role. No provider, IdP, channel, credential, real data, pilot,
deployment, production or sensitive clinical/financial/record/scheduling
action is in scope.

## Invariants to preserve

1. AUD20-008 evidence and historical entries remain immutable history.
2. `PASS_LOCAL` never becomes external or production approval.
3. `I1_PENDING` remains pending until a real fresh review is recorded.
4. There is one current AUD21 task pointer: `REM21-001`.
5. Candidate, run, Node version, evidence scope and limitations stay bound.

## Unknowns and validation

- A fresh I1 review of AUD20-008 is not yet available; commission it without
  exposing builder rationale and keep the status pending if it cannot be
  obtained.
- No external or production validation is authorized; those remain blocked by
  G21-5 and are not inferred from local evidence.

## Recommendation

Proceed to PRD/SPEC and a documentary BUILD that updates only current pointers,
then run link/state/hash checks. Do not change product code for this task.
