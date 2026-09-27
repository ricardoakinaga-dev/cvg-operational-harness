# 0144 — SPEC curta: rebind de hash do teste homolog

- Task: PR-003/PR-010 de [0356](../03_build/0356_production_backlog_2026-09-26.md).
- Trilha: T2 da [constituição](../07_agents/AGENTS.md), reconciliação do
  catálogo de skips sem alterar sua política ou aceitar skips novos.
- Estado: `BUILD_LOCAL_AUTHORIZED` para a regra abaixo. Produção `NO_GO`.

## Recon

O Verify do SHA `81bb91f` passou E2E e browser-proof, mas o gate
`skip:governance` falhou em `SKIP-PG-014` por hash de source antigo.
`npm run certify` local executou 16 comandos com exit 0, mas adjudicou
`NO_GO` pelo mesmo `skip_catalog_source_drift`. Os relatórios unit,
PostgreSQL, chaos e E2E têm **zero testes pulados**. A mudança de source foi
somente a espera pelo evento de saúde antes de SIGTERM, na [SPEC 0141](0141_homolog_worker_shutdown_readiness.md).

| Arquivo                                                                     | SHA-256 catalogado                                                 | SHA-256 atual                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `apps/worker/src/__tests__/operational-harness-homolog.integration.test.ts` | `207335c6a6f3d7e4f016283c31ac8c46d66f4d9bce6edb8d3ac7eb86e53c9617` | `a27d2fdafecdc5510d91ae6dfbec7123f8bfe795a1621528852b21533421140e` |

## Regra e aceite

1. Atualizar apenas `sourceSha256` de `SKIP-PG-014` para o hash atual
   verificado; manter `expectedSkippedTests`, motivo, dono, gate e validade.
2. Rodar `skip:governance` com os relatórios da certificação, o autoteste do
   catálogo e os gates T2 em Node 22; depois reemitir certificado completo
   no candidato commitado e obter Verify/Security remotos no mesmo SHA.
3. Zero skips observados continua requisito; nenhuma exceção nova é criada.

## Execução e provas

- `SKIP-PG-014.sourceSha256` passou de
  `207335c6a6f3d7e4f016283c31ac8c46d66f4d9bce6edb8d3ac7eb86e53c9617`
  para `a27d2fdafecdc5510d91ae6dfbec7123f8bfe795a1621528852b21533421140e`.
  Os demais campos e as outras 34 entradas não mudaram.
- `npm run skip:governance` com os relatórios da emissão anterior passou:
  quatro gates executados, zero skipped, zero failures. O autoteste do
  catálogo passou 9/9.
- A certificação e os workflows do candidato com o novo hash ainda serão
  executados.
