# AAA-02 — Nota de verificação (builder)

- Task: `AAA-02` — decisões D01–D05. Programa: `AAA-20260912`. Observado em: `2026-09-13T01:53:00Z` (UTC).
- Artefato verificado: `docs/01_prd/aaa_decision_brief.md`, sha256 `fae399a863f8368e0cdae795f7352a1d411a840b940dbceee489ad3384896d4b`.
- Script de verificação: `docs/04_audit/evidence/AAA/AAA-02/builder/doc-checks.py`, sha256 `1aaaca5f8cf14583d69808b4acbb5bdae90272046b821b4df8683ff12579aa7a`.
- Log completo: `docs/04_audit/evidence/AAA/AAA-02/builder/doc-checks.txt`.

## Resultado

| Verificação                                                                                          | Resultado |
| ---------------------------------------------------------------------------------------------------- | --------- |
| Links relativos do brief resolvem (34 links, 0 ausentes)                                             | PASS      |
| Alegações cruzadas contra contratos/plano/backlog/ledger (23)                                        | PASS      |
| `npx prettier --check docs/01_prd/aaa_decision_brief.md`                                             | PASS      |
| Nenhuma alteração fora de `docs/01_prd/aaa_decision_brief.md` e `docs/04_audit/evidence/AAA/AAA-02/` | PASS      |

## Método

- Links: extração de todos os alvos Markdown relativos e verificação de existência no repositório.
- Alegações: leitura direta de `aaa_execution_contract`, `aaa_data_api_contract`, `aaa_quality_contract`, `0324`, `aaa_program_backlog.json` (entradas `AAA-06`/`AAA-21`/`AAA-07`–`AAA-11`/`AAA-32`/`AAA-37`–`AAA-39`), `aaa_execution_ledger.json` (`coordinatorDecisions`) e `0013` (RF-011).
- Formatação: Prettier do repositório, somente no arquivo proprietário de AAA-02.

## Contradições encontradas

- Nenhuma contradição entre o brief, os contratos vigentes, o plano executivo, o backlog canônico e o ledger `coordinatorDecisions` foi observada nos checks executados.
- Inconsistência textual observada nos insumos (não altera o brief, que se refere à v2): `aaa_quality_contract.md` §11 diz "Esta barra `v1` congela…" e "incrementa `v2`", enquanto o cabeçalho do mesmo arquivo declara a versão `v2`. Registrado sem edição por estar fora do `ownedPaths` de `AAA-02`.
- Observação de limite: `aaa_execution_contract` está em `PROPOSED_NOT_FROZEN` e `aaa_quality_contract` em `FROZEN_PENDING_INDEPENDENT_REVIEW`. O brief registra o estado sem tratá-los como aprovados; nenhuma afirmação de congelamento ou BUILD é feita.

## Limitações

1. Verificação documental e de links; nenhum teste de produto, runtime, PostgreSQL ou integração foi executado.
2. O brief é material de decisão: D01–D04 e D05-3/D05-4 permanecem `PENDING`; não há aprovação humana, de negócio, segurança ou operação.
3. O hash do brief invalida esta nota se o arquivo for alterado; qualquer mudança exige nova execução de `doc-checks.py`, novo hash e revalidação.
