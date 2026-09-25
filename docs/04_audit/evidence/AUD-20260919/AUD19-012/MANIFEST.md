# Manifesto de verificação — AUD19-012

- task: `AUD19-012`; onda: `W0`; status: `VERIFIED`; fecha W0/gate `G1`.
- runtime: Node `v22.23.2`; autorização: prompt humano de 2026-09-19 (gate
  `G0`); escopo documental + script de links; sem commit/push, sem produção.

## Entregas

| Item                                                                                                                                        | Resultado                      |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `README.md` — seção `Estado atual — 2026-09-20` + postura reconciliada                                                                      | aplicado, histórico preservado |
| `0300/0301/0302` — `WAITING_HUMAN_APPROVAL` → `IN_PROGRESS`                                                                                 | aplicado                       |
| `scripts/check-doc-links.mjs` + npm `docs:check-links`                                                                                      | novo gate, PASS no escopo      |
| 13 links `](../` → `](` nos registros mestres (alvos conferidos em `docs/`)                                                                 | `DOC_LINKS_OK` no escopo       |
| `0109_dados_e_persistencia.md` — reais proibidos inclusive anonimizados                                                                     | aplicado                       |
| Notas aditivas `AUD19-012` em `0490`/`0491` (originais intactos)                                                                            | aplicado                       |
| `docs/phase4a/evidence/critics/INDEX.md` — 3 APPROVE vinculados ao RESULT (hashes conferidos), `PENDING` reconciliado, ausências declaradas | aplicado                       |
| `AUTHORITY_MAP.md` — autoridades e supersessões                                                                                             | aplicado                       |

## Comandos

| Comando                                | Resultado                                                            |
| -------------------------------------- | -------------------------------------------------------------------- |
| `npm run docs:check-links`             | PASS — `DOC_LINKS_OK`, zero quebrados no escopo (`links-scope.json`) |
| `npm run format:check`                 | PASS                                                                 |
| `git diff --check`                     | PASS                                                                 |
| sha256 dos 3 críticos vs `RESULT.json` | 3/3 MATCH                                                            |

## Residuais declarados

- 11 referências absolutas de máquina em `critic-security.md` (não portáteis,
  preservadas como histórico no relatório congelado).
- 43 links quebrados fora do escopo, todos em `docs/04_audit/` históricos
  (ver `links-repowide.json`): permanecem mapeados para rodadas futuras, sem
  mascaramento.
- `certification:verify` global segue `CANDIDATE_DRIFT` (re-freeze `AUD19-016`).

## Arquivos desta evidência

`SPEC.md`, `MANIFEST.md` (este), `AUTHORITY_MAP.md`, `links-scope.json`,
`links-scope.stderr`, `docs-check-links.txt`.
