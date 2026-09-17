# Phase 4A CVG gate validation — AAA-4A

This record applies the repository pipeline
`DISCOVERY -> PRD -> SPEC -> BUILD -> AUDIT` to the optional conversational
layer. It is a planning gate record, not a production authorization.

## Superseding entry gate — 2026-09-17T03:22:00Z

`PHASE4A_ENTRY_GATE=VERIFIED`

The current controlled entry decision supersedes the historical matrix below.
The Phase 4 handoff is verified by the current candidate chain and fresh
read-only critic record:

- candidate: `6185c586e382d9f7f4e4fb4b3f66855b73889f6c89bd7e3553f3696c0c2f5dc8`;
- handoff: `docs/phase4a/PHASE_4_HANDOFF.md`;
- critic: `docs/phase4/evidence/FINAL_CRITIC_APPROVAL.md`;
- sentinel: `docs/phase4/evidence/CRITIC_ONLY_SENTINEL.json`;
- integrity verification: `allChecks=true`, including candidate binding,
  report digest, chain digests, sentinel match, phase10 coherence and the
  protected-source mutation check.

The user's current controlled-build request is the authorization recorded for
this Phase 4A task. Discovery, PRD and SPEC are bound to the exact 16-part
prompt copy at `docs/phase4a/PROMPT_COPY_2026-09-17.md` and the frozen machine
quality bar at `docs/phase4a/QUALITY_BAR.json`. A fresh Gauntlet run is active
under `.gauntlet`; the previous finished run remains archived.

The first `certification:verify` invocation after registering this task
reported `CANDIDATE_DRIFT` because the current Phase 4A gate records, exact
prompt copy and task artifacts are new candidate material. This is an expected
candidate transition and must be reconciled before the final Phase 4A
certification; it is not evidence of a Phase 4 implementation failure.

The build is controlled and synthetic only. Real data, providers, channels,
credentials, clinical or financial actions, appointment actions, unrestricted
production and deployment remain `NO_GO`.

## Current Phase 4A audit snapshot — 2026-09-17

The controlled implementation is bound to candidate
`aaa4a-df2c0b1a1b7e0e9a` / digest
`df2c0b1a1b7e0e9a40badf7bd04a444a0ecf1f30390865412b2845adce492e77`.
Focused evidence is 73/73 tests across 12 files with disposable PostgreSQL
executed and 16 structural assertions. Three fresh read-only critics approved
this exact candidate with every axis at or above the frozen 90-point floor;
the current stage is `AUDIT_COMPLETE_CONTROLLED`; the final sentinel was
captured with a matching candidate source snapshot.

## Current gate matrix

| Stage           | Current result      | Evidence                                                                          | Authority consequence                                                         |
| --------------- | ------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Discovery       | `PLANNING_COMPLETE` | `SCOUT_REPORT.md`, `BROWNFIELD_REUSE_MAP.md`, and the current 16-part prompt copy | The problem and brownfield seams are bounded for controlled implementation.   |
| PRD             | `PLANNING_COMPLETE` | `PRD.md` and the controlled product constraints in the prompt archive             | Requirements are explicit for review; no BUILD authority is granted.          |
| SPEC            | `PLANNING_COMPLETE` | `SPEC.md`, `ARCHITECTURE_PLAN.md`, and `QUALITY_BAR.md`                           | The target contracts are reviewable; no source implementation is authorized.  |
| Phase 4 handoff | `VERIFIED`          | Current superseding handoff, critic approval, chain and sentinel                  | Phase 4A controlled implementation may proceed within the frozen boundary.    |
| BUILD           | `READY_FOR_BUILD`   | This entry gate, `TASK.md`, active Gauntlet and ExecPlan                          | Synthetic controlled source work may proceed; external effects remain barred. |
| AUDIT           | `PASS`              | Candidate-bound implementation, focused suite, PostgreSQL, critics, evidence and matching final sentinel | Controlled Phase 4A PASS is closed; production remains barred. |

## Existing CVG validation records

The repository-level validation files establish controlled documentation and
conditional build precedent for earlier REM work:

- `../00_discovery/0090_discovery_validation.md`
- `../01_prd/0090_prd_validation.md`
- `../02_spec/0190_spec_validation.md`

Those records do not silently validate this new Phase 4A task. The Phase 4A
documents above remain planning artifacts until a current human review and a
`PHASE_4_HANDOFF=VERIFIED` record are present.

## Required transition to BUILD

BUILD may begin only after all of the following are true and recorded in the
current candidate:

1. Phase 4 has a current independent read-only critic approval and a matching
   mutation-clean sentinel.
2. `PHASE_4_HANDOFF=VERIFIED` supersedes the blocked handoff.
3. The Phase 4A PRD and SPEC receive the required human review/authorization.
4. A fresh AAA-4A Gauntlet run is created; archived `.gauntlet*` runs remain
   untouched.
5. The BUILD master, roadmap, backlog and atomic Phase 4A task are bound to
   the approved candidate.

The transition is now recorded for the controlled build. All implementation
must follow the active ExecPlan, remain inside the frozen Phase 4 boundary,
and produce candidate-bound evidence before any certification claim. Real
data, providers, channels, credentials, sensitive actions, and unrestricted
production remain `NO_GO`.
