# AAA-21 environment manifest

Captured during the final R2 verification on 2026-09-14 in
`America/Sao_Paulo`.

| Item                        | Observed value                                              | Meaning                                                            |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| Repository                  | `/home/ricardo/Área de trabalho/cvg-operational-harness`    | candidate under audit                                              |
| Base/HEAD                   | `512bc11e80fbf7c7b8baf6263aacc811ff829309`                  | HEAD; working tree was already dirty                               |
| Node                        | `v24.20.0`                                                  | local runtime; repository target remains Node 22                   |
| npm                         | `11.19.0`                                                   | local package manager                                              |
| OS                          | Ubuntu 24.04, kernel `7.0.0-31-generic`                     | local execution environment                                        |
| PostgreSQL proof            | disposable `postgres:15-alpine`, loopback `127.0.0.1:55439` | live D3 plus R3 D4/D5 controlled proof; stopped after verification |
| PostgreSQL role proof       | isolated schema, synthetic least-privilege role             | neutral operational preflight and worker path passed               |
| Loopback/E2E                | available in final run                                      | Playwright `6/6` passed                                            |
| Real data/providers/effects | absent/not authorized                                       | synthetic-only scope                                               |

## Gate interpretation

Typecheck, lint, build, evals, focused tests, full regression, E2E, and the
complete PostgreSQL catalog are current local evidence. The R3 child-process
test upgrades the controlled durability claim to D5 for the empty-tool
boundary; it does not replace external provider certification or production
approval.

The repository-wide Prettier command still reports 430 brownfield files with
formatting drift. The exact R2 source/test/document set is formatted and no
mass reformat was authorized.
