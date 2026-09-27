# 0138 — SPEC curta: reconciliar catálogo de skips após PR-L05

- Task: PR-003, nova fatia de reemissão do certificado em [0356](../03_build/0356_production_backlog_2026-09-26.md).
- Origem: `npm run certify` no candidato `99a4f8de…` executou os 16 comandos com exit 0, mas a adjudicação final rejeitou dois `skip_catalog_source_drift` e retornou `NO_GO`.
- Trilha: T2 da [constituição](../07_agents/AGENTS.md). O usuário autorizou implementar o planejamento; esta fatia é local, reversível e não altera produto, contrato público ou política de skips.
- Estado: `BUILD_LOCAL_AUTHORIZED` para a reconciliação estrita dos dois hashes abaixo.

## Recon

O arquivo `scripts/skip-catalog.json` vincula cada contrato de skip ao SHA-256 do teste que pode ser pulado sem PostgreSQL. `apps/worker/src/__tests__/kernel-composition-postgres.integration.test.ts` mudou nos commits `692f032`/`9098cd2` da PR-L05 para usar o perfil neutro. `apps/worker/src/__tests__/postgres-outbox-bridge.integration.test.ts` mudou no commit `761307b` para o preset controlado neutro. Nenhuma das duas alterações mudou a condição `TEST_DATABASE_URL` nem o número de casos que podem ser pulados. O catálogo deixou os hashes anteriores.

## Regras e aceite

1. Alterar somente `sourceSha256` de `SKIP-PG-012` e `SKIP-PG-018` para os hashes medidos dos arquivos atuais. Preservar ID, motivo, owner, gate, quantidade esperada, expiração e a checagem `skip_catalog_source_drift`.
2. Executar `skip:governance`, os gates T2 já executados na rodada e reemitir `npm run certify` com Node 22 e PostgreSQL descartável. `certification:verify` deve retornar exit 0 no candidato final, sem tratar falhas remotas como PASS.
3. Registrar candidato, runId, contagens, hashes históricos E2E e qualquer falha. Produção segue `NO_GO` até os gates externos e decisões humanas.

## Execução e provas

- `SKIP-PG-012`: hash antigo `41af4229…`, hash atual `00d56e56f46e1b80cbe99687059d49e538d5e39dbdff06707057467992d53374`.
- `SKIP-PG-018`: hash antigo `a6d353c2…`, hash atual `172a1d88da78c8f3bf763a5ef7fca3444dc2d8e4ac4d17621ebbde7f80e2c10f`.
- Apenas os dois `sourceSha256` foram alterados. `npm run skip:governance` e o autoteste retornaram PASS; os relatórios da primeira certificação mostram 2.306 testes unitários, 258 PostgreSQL e 12 E2E sem skip, com todos os comandos exit 0. O `NO_GO` inicial veio exclusivamente de `skip_catalog_source_drift` nesses dois arquivos.
- Nova certificação do candidato atualizado: pendente. Seu resultado será registrado nos ledgers, que não integram o digest do candidato.
