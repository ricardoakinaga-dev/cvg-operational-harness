# C1K review scope — frozen C1J candidate

## Objective

Obtain two independent assessments that were required but unavailable in C1J: one fresh-context I1 review and one separate fresh-context Final Critic review. Both assess the same candidate fingerprint `e884796fd90192409230b0991524168186a9f65c824156a943102dcfacc98e1b` and the same hash-pinned evidence listed in `source-evidence.json`.

## Review roles

I1 evaluates the candidate, the three C1J product deltas, the recorded verification evidence, inventory findings, and safety boundaries. It must identify material correctness, integrity, security, scope, or evidence gaps and give a reasoned accept/reject recommendation.

The Final Critic independently challenges the C1J evidence and verdict, including each critical quality criterion, command provenance, candidate binding, the treatment of 11 inventory findings, and the missing-review failure rule. It must not receive or inspect the I1 report before submitting its own response.

Both reviewers must be separate fresh contexts (`fork_turns=none`), read-only, and bound to the hashes in `source-evidence.json`. A review is valid only if it states the candidate fingerprint and distinguishes evidence it inspected from conclusions it inferred.

## Allowed work

- Read the paths in `scope-manifest.json` and the exact C1J source evidence.
- Return one written review in the agent response; the lead records it under the C1K evidence directory after both reviews are complete or a role is recorded unavailable.
- Report findings with severity, file and evidence reference, rationale, and requested resolution.

## Out of scope

- Running commands, tests, builds, typechecks, lint, coverage, inventory, candidate freeze, or any C1J plan step.
- Editing or staging any file. Reviewers do not write evidence files; the lead records only returned review text and attempt metadata under C1K.
- Replaying C1J, changing C1J history, revising its frozen quality bar, changing thresholds, or treating a review as approval to accept M07-S1.
- Any production, external service, network, database, real-data, financial, clinical, or patient-record operation.

## Stop and disposition

Each role gets one creation attempt under this gate. If creation is refused, record `UNAVAILABLE` with the service reason; do not retry. If either review is missing, rejects the candidate, or reports unresolved material findings, C1J stays `FAIL / OPEN`, M07-S1 stays open, and downstream work remains blocked. Even if both reports accept the evidence, C1J's historical result is immutable; a separate audit must record any new disposition before M07-S1 can be considered closed.
