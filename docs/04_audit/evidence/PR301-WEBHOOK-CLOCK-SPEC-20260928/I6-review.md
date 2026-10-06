# SPEC 0162 — crítica independente I6

- Resultado: `REVISE` — P0: 0, P1: 4, P2: 2.
- Revisão fresh-context, somente leitura. SHA-256 conferido no início e no fim: `215f5146eec6ecac8b07c9561f34487e1a33da5e030965c83af6b9ab4d6bc4a3`.
- Nenhum código, schema, migration ou teste foi alterado/executado pelo revisor. O parecer não autoriza BUILD.

## Achados

1. **P1 — Trigger impede a recuperação break-glass.** A regra recusa toda redução de `highest_seen_at`, mas recovery exige reduzir um valor futuro. O contrato não fornece uma exceção estreita que seja impossível ao runtime forjar.
2. **P1 — Standby não tem identidade inequívoca.** `application_name` pode se repetir; a SPEC podia selecionar uma conexão errada sem prova da identidade do standby que confirmou ou pode ser promovido.
3. **P1 — Ledger pode responder challenge fresco com head antigo.** Nonce atual não prova que a sequência/head informado é o mais recente; falta testemunha externa monotônica da última sequência acknowledged.
4. **P1 — Restart normal falha no gate de replay.** PostgreSQL retorna NULL de `pg_last_wal_replay_lsn()` quando inicia normalmente sem recovery; a SPEC aplicava o requisito de replay a restart primário comum.
5. **P2 — Posição WAL não está ligada de forma operacional ao COMMIT exato.** O contrato exige observer receipt com WAL position/digest, mas não define captura e comparação da posição para provar inclusão do COMMIT.
6. **P2 — Ordem PREPARED/identity-attest é ambígua.** Uma passagem sugere attest com digest PREPARED antes do receipt; outra exige que o sink produza o receipt primeiro.

## Fontes consultadas

- [PostgreSQL 16 — funções administrativas](https://www.postgresql.org/docs/16/functions-admin.html).
- [PostgreSQL 16 — configuração de replicação](https://www.postgresql.org/docs/16/runtime-config-replication.html).
- [PostgreSQL 16 — monitoramento de replicação e SSL](https://www.postgresql.org/docs/16/monitoring-stats.html).

## Disposição

Responder cada achado com regra verificável, critérios negativos positivos, checks documentais e crítica fresh-context I7 do hash final. Sem implementação antes de aprovação humana T3 separada.
