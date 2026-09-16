# Phase 4A CVG gate validation — AAA-4A

This record applies the repository pipeline
`DISCOVERY -> PRD -> SPEC -> BUILD -> AUDIT` to the optional conversational
layer. It is a planning gate record, not a production authorization.

## Current gate matrix

| Stage           | Current result      | Evidence                                                                     | Authority consequence                                                        |
| --------------- | ------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Discovery       | `PLANNING_COMPLETE` | `SCOUT_REPORT.md`, `BROWNFIELD_REUSE_MAP.md`, and the 18-part prompt archive | The problem and brownfield seams are bounded; no code authority is granted.  |
| PRD             | `PLANNING_COMPLETE` | `PRD.md` and the controlled product constraints in the prompt archive        | Requirements are explicit for review; no BUILD authority is granted.         |
| SPEC            | `PLANNING_COMPLETE` | `SPEC.md`, `ARCHITECTURE_PLAN.md`, and `QUALITY_BAR.md`                      | The target contracts are reviewable; no source implementation is authorized. |
| Phase 4 handoff | `BLOCKED`           | `../phase4a/PHASE_4_HANDOFF.md`                                              | Phase 4A implementation authority is withheld.                               |
| BUILD           | `BLOCKED`           | `TASK.md` entry gates and current handoff                                    | No package, migration, executable demo, or external effect may be started.   |
| AUDIT           | `NOT_STARTED`       | No Phase 4A runtime exists                                                   | Audit waits for a gated functional implementation.                           |

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

Until that transition, the only permitted work is bounded planning,
reconciliation, or read-only audit of existing controlled evidence. Real data,
providers, channels, credentials, sensitive actions, and unrestricted
production remain `NO_GO`.
