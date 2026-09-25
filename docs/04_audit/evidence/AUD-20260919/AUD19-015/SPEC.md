# SPEC — AUD19-015 — Carga, restore, rollback e recuperação

- programa: `AUD-20260919-REMEDIATION`; onda: `W3`; dependências: W2 +
  `AUD19-014` gates técnicos concluídos.
- escopo: ambiente local descartável, payloads sintéticos, sem produção, sem
  dado real e sem efeito externo.

## Ensaios

1. Carga sintética do outbox em memória: 10.000 eventos, dois workers, zero
   perda e zero duplicidade; registrar throughput e percentis.
2. Snapshot/restore controlado: digest, isolamento por tenant e outbox
   preservados; registrar RTO do ambiente de teste e declarar RPO de produção
   não validado.
3. Backup/restore PostgreSQL descartável: `pg_dump` custom format de
   `cvg_test`, restore em `aud19_restore`, comparação de contagem de tabelas e
   descarte do banco restaurado.
4. Rollback por composição: configuração PostgreSQL incompleta falha
   fail-closed; retorno para `API_PERSISTENCE_MODE=memory` sobe, responde
   `/live`, roda como usuário não-root e é parado conforme o playbook.

## Critérios de aceite

- carga sem perda/duplicidade;
- snapshot/restore íntegro e tenant-isolated;
- backup/restore PostgreSQL bem-sucedido no descartável;
- rollback executável e evidência de processo parado;
- limitações de RPO/RTO produtivo e produção `NO_GO` explícitas.

## Evidência

`docs/04_audit/evidence/AUD-20260919/AUD19-015/`.
