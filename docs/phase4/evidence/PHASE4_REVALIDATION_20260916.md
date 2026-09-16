# Phase 4 current revalidation — AAA-41

- Candidate, HEAD, and certification run: use the current authoritative
  records in `certification/candidate-manifest.json` and
  `certification/phase10-result.json`; identifiers are not duplicated here so
  this candidate-scoped evidence cannot become self-referential.
- Scope: controlled synthetic local only.
- Production: `NO_GO`.

## Gate matrix

| Gate           | Result                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| format         | PASS                                                                      |
| typecheck      | PASS                                                                      |
| lint           | PASS                                                                      |
| build          | PASS                                                                      |
| unit           | PASS — 258 files, 1,811 passed, 115 skipped                               |
| coverage       | PASS — 90.86% statements, 85.27% branches, 91.61% functions, 91.47% lines |
| security       | PASS                                                                      |
| worker startup | PASS                                                                      |
| PostgreSQL     | PASS — 27 files, 200 passed, 0 skipped                                    |
| E2E            | PASS — 6 files                                                            |
| evals          | PASS                                                                      |
| chaos          | PASS                                                                      |
| load           | PASS — 10,000 processed, zero loss/duplicates                             |
| restore        | PASS                                                                      |
| SBOM/licenses  | PASS                                                                      |

The previously observed PostgreSQL failure was a test-timing race around a
5 ms lease, not a production state-machine change. The test now injects a
controlled clock; the focused case passed 12/12 and the full PostgreSQL gate
passed 27/27 files and 200/200 tests.

## Critic and sentinel

The fresh read-only critic used in this controlled sequence was not allowed to
mutate the repository. It returned no report inside the bounded window and was
closed without treating the absence as approval. The before/after
repository+Gauntlet fingerprints for that window are identical:

`449826be0243d9ac49507eb8d3996930a9e2c848434a95a97e085b8edf93180a`.

This is evidence of mutation cleanliness only and is not a current-candidate
independent approval. It caps the Phase 4 controlled verdict at
`CONDITIONAL_PASS`; the Phase 4A handoff remains `BLOCKED`.

## Limitations

No real data, provider, channel, MCP network, credentials, sensitive action,
clinical/financial/record operation, deployment, or production authorization
was used. The disposable PostgreSQL proof is controlled only.
