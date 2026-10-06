# Continuidade de ledgers — PR301-WEBHOOK-WINDOW-FIX-001

Os ledgers mestres e o backlog 0356 já estavam modificados por outros agentes no início desta task. Pela regra de coordenação, não foram editados nesta rodada. Integrar estes fatos quando os arquivos forem liberados:

- `docs/99_runtime_state.md`: último passo = correção da expiração de replay conforme a janela HMAC, com reprodução negativa antes do patch; verificação local Node 22/PostgreSQL 16 PASS. Próximo passo = tratar gates independentes de release sem reivindicar F01 como fechado. Produção continua `NO_GO`.
- `docs/20_master_execution_log.md`: incluir task `PR301-WEBHOOK-WINDOW-FIX-001`, baseline `eff8e0d`, Node 22, foco 18/18, PostgreSQL 260/260, suíte geral 2.403 PASS/1 skipped, typecheck/lint/Prettier PASS e container/porta removidos.
- `docs/30_backlog_master.md` e `docs/03_build/0356_production_backlog_2026-09-26.md`: marcar apenas a janela de aceitação HMAC como corrigida localmente. Manter F01 parcialmente mitigado até prova de rollback/restart, divergência de relógio e integração do high-water; manter 0162/migration 0028 pendente de T3 humano.

Evidência detalhada: [report.md](report.md) e [proof.json](proof.json).
