# Manifesto de verificacao — AUD19-014

- task: `AUD19-014`; onda: `W3`; status: `TECHNICAL_GATES_PASS_PENDING_FREEZE`.
- runtime: Node `v22.23.2`; npm `10.9.8`; Docker `29.1.3`.
- escopo: mesmo candidato local/sintetico; sem producao, credenciais ou
  efeitos externos.

## Provas

| Gate                                       | Resultado                                                                                               |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `npm ci`                                   | PASS; lockfile aceito; 0 vulnerabilidades reportadas                                                    |
| format/typecheck/lint/build/readiness/diff | PASS                                                                                                    |
| `npm test`                                 | 280 arquivos PASS; 1.939 testes PASS; 20 arquivos/138 testes condicionais fora do catalogo sem PG       |
| `test:coverage`                            | PASS; statements 87,46%; branches 81,86%; functions 89,55%; lines 87,99%                                |
| `test:postgres`                            | 35 arquivos PASS; 224 testes PASS; zero skips                                                           |
| `test:e2e`                                 | 12/12 PASS em Chromium                                                                                  |
| `test:evals`                               | 2 arquivos; 10/10 PASS                                                                                  |
| `test:chaos` com PG                        | 3 arquivos; 20/20 PASS                                                                                  |
| `test:worker:startup`                      | PASS: startup fail-closed + controlled smoke                                                            |
| `verify:phase2` / `verify:phase3`          | PASS, incluindo PostgreSQL                                                                              |
| `test:phase4a` / `verify:phase4a`          | 13 arquivos; 78/78 PASS; structural PASS                                                                |
| `verify:phase4a:identity`                  | PASS; anchor e shared candidate conferidos                                                              |
| `audit:security`                           | PASS; 0 high vulnerabilities                                                                            |
| `licenses:check`                           | PASS; 378 componentes; 0 denied/unclassified                                                            |
| `sbom`                                     | PASS; CycloneDX SHA-256 `4a27418c32ef2c51601a3d1de33d0437f1ddf3745a499badddff577c6d143dc5`              |
| Docker runtime                             | build PASS; smoke `/live` PASS; `USER=cvg`                                                              |
| `certification:verify` pre-freeze          | FAIL honesto: certificate histórico `6185...` vs candidato atual `4937...`; 13 mismatches de drift/hash |

## Decisao

Os gates técnicos de `AUD19-014` passaram. A verificação de certificação não
é marcada como PASS enquanto o candidato ainda não foi congelado; a falha
`CANDIDATE_DRIFT` é esperada nesta etapa e será resolvida somente no
`AUD19-016`, após `AUD19-015`, com novo manifesto e sentinel.

## Limitações

- Chromium é o browser declarado; Firefox/WebKit não foram alegados.
- O build reporta apenas o warning não-fatal de externalização browser de
  `node:dns/promises`; o gate terminou com exit 0.
- Produção permanece `NO_GO`.

## Arquivos desta evidencia

`SPEC.md`, `MANIFEST.md`, logs `*-final.txt`/`*.txt`, `docker-build-runtime.txt`,
`docker-smoke-final.txt` e `certification-verify.txt`.
