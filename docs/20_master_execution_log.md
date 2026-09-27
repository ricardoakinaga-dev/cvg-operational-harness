# PR-009 fatia 3 — BUILD e regressões locais — 27/09/2026

- [SPEC-PR009-003](02_spec/0145_e2e_junit_json_run_binding.md): comando único de Playwright com JSON/JUnit, `executionId` por tentativa, validação interna do par no ci-bar/certificado/verificador. Casos negativos para JSON `{}` e XML de outra tentativa passaram no self-test.
- Node 22.23.2: testes focados 18/18, `typecheck`, `lint`, `format:check`, `docs:check-links` PASS. Primeira `npm test`: 2.176 PASS/1 FAIL por contrato documental da PR-005; corrigi a leitura da decisão histórica para o arquivo arquivado. Segunda `npm test`: 299 arquivos/2.177 PASS, 20 arquivos/146 testes pulados sem banco. `test:postgres`: 35 arquivos/258 PASS em PostgreSQL 16 descartável próprio, removido após o gate.
- Artefato versionado `certification/negative-validation.json` regravado pelo self-test foi restaurado aos bytes do HEAD. E2E real/recertificação ainda pendentes por claim PR-L04 no diretório compartilhado; nenhum dado real, deploy, push ou efeito externo.

# PR-009 fatia 3 — recon e SPEC — 27/09/2026

- Recon read-only: JSON E2E gerado às 02:51:05Z e JUnit às 03:57:02Z; 12 testes em ambos, sem identificadores internos. `PLAYWRIGHT_JSON_OUTPUT_NAME` seleciona JSON e omite JUnit; o verificador atual aceita fixture `{}` e infere E2E do log.
- [SPEC-PR009-003](02_spec/0145_e2e_junit_json_run_binding.md) fixa `executionId` único, `runId`/`candidateId` internos, par da mesma tentativa, inventário/totais e regressões negativas. BUILD T2 ainda não executado; sem alteração de artefatos E2E neste registro.

# Log de execução vigente — PROD-20260926

## 27/09/2026 — PR-005: rotação íntegra dos ledgers

- Gate: task PR-005 em [0356](03_build/0356_production_backlog_2026-09-26.md), classe T1 documental e claim no [quadro de coordenação](08_runtime/agent_coordination.md).
- Fontes originais na revisão `4aac877e5e0c504940c8ef2856928e43a1a5ed2a`: `99_runtime_state.md` 3.853 linhas, SHA-256 `d8092246cb5f597dc32a469c937268b90afbfa2da7d5701e100d9f1a2544b10f`; `20_master_execution_log.md` 7.762 linhas, SHA-256 `576ac3f766e7d9b930bb47f11583c5bb088e8f8526b9b977c5c4ff08c5d8609e`; `30_backlog_master.md` 2.569 linhas, SHA-256 `fedc1c99cfe9333f80c8aad864df0a310995e1d1d5c5c26c427e276dd332f937`.
- Os corpos completos foram preservados em [arquivo do estado](08_runtime/archive/prod20260926_runtime_state_history.md), [arquivo do log](08_runtime/archive/prod20260926_execution_log_history.md) e [arquivo do backlog](08_runtime/archive/prod20260926_backlog_history.md). Apenas os links relativos do corpo foram rebaseados para a nova pasta; a reversão reproduz os SHA-256 originais.
- Estado de produção: `NO_GO`. A rotação documental não altera autorização de produção, resultado de certificação ou estado de gates. Verificação PR-005: `docs:check-links` PASS, `format:check` PASS e três reconstruções SHA-256 PASS.

## Rodada anterior

- [AUD-0579](04_audit/0579_current_candidate_deep_audit_2026-09-27.md) auditou `5c0b791`, registrou `skip:governance` e `certification:verify` em falha, o defeito da sessão confiável no entrypoint e a SPEC T3 correspondente.
- O [log integral anterior](08_runtime/archive/prod20260926_execution_log_history.md) preserva os comandos, resultados, decisões e evidências de todos os ciclos anteriores; SHA-256 dos bytes de origem `576ac3f766e7d9b930bb47f11583c5bb088e8f8526b9b977c5c4ff08c5d8609e`.
