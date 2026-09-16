# AAA-13 integration rehearsal — gate matrix

- candidateId: `911f049888a45ab206770c29c07a492b4294905225ce0d722f7a193e694da9d4`
- runId: `run-911f049888a4-mtzd9k5w`
- decision: `CONDITIONAL_GO / AAA_CONTROLLED`
- verifyGateEvidence failures: 0
- candidate drift: none

| Gate           | Kind       | Status | Exit | Required | Log runId | Log candidate | Evidence       | Skip |
| -------------- | ---------- | ------ | ---- | -------- | --------- | ------------- | -------------- | ---- |
| format         | exit_code  | PASS   | 0    | yes      | ok        | ok            | 1 (manifest 1) | 0    |
| typecheck      | exit_code  | PASS   | 0    | yes      | ok        | ok            | 1 (manifest 1) | 0    |
| lint           | exit_code  | PASS   | 0    | yes      | ok        | ok            | 1 (manifest 1) | 0    |
| build          | exit_code  | PASS   | 0    | yes      | ok        | ok            | 1 (manifest 1) | 0    |
| unit           | vitest     | PASS   | 0    | yes      | ok        | ok            | 1 (manifest 1) | 0    |
| coverage       | coverage   | PASS   | 0    | yes      | ok        | ok            | 2 (manifest 2) | 0    |
| security       | security   | PASS   | 0    | yes      | ok        | ok            | 1 (manifest 1) | 0    |
| worker_startup | exit_code  | PASS   | 0    | yes      | ok        | ok            | 1 (manifest 1) | 0    |
| postgres       | vitest     | PASS   | 0    | no       | ok        | ok            | 1 (manifest 1) | 0    |
| e2e            | playwright | PASS   | 0    | yes      | ok        | ok            | 1 (manifest 1) | 0    |
| evals          | evals      | PASS   | 0    | yes      | ok        | ok            | 2 (manifest 2) | 0    |
| chaos          | chaos      | PASS   | 0    | yes      | ok        | ok            | 2 (manifest 2) | 0    |
| load           | load       | PASS   | 0    | yes      | ok        | ok            | 2 (manifest 2) | 0    |
| restore        | restore    | PASS   | 0    | yes      | ok        | ok            | 2 (manifest 2) | 0    |
| sbom           | sbom       | PASS   | 0    | yes      | ok        | ok            | 2 (manifest 2) | 0    |
| licenses       | licenses   | PASS   | 0    | yes      | ok        | ok            | 2 (manifest 2) | 0    |

## Classification

- clean_integration: all gates PASS with bound raw evidence; verifier accepted the same snapshot
