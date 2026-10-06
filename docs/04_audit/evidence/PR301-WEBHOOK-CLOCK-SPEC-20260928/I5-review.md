# SPEC 0162 — crítica independente I5

- Resultado: `REVISE`.
- Revisão fresh-context, somente leitura; nenhum arquivo foi alterado pelo revisor.
- Hash SHA-256 revisado no início e confirmado no fim: `7843ec50d2c4aba010e79fbef7cfd0f7cfb27341c92d92483d205dec85536772`.
- A decisão não autoriza BUILD; a SPEC continua sem revisão/aprovação humana T3.

## Achados

1. **P1 — Continuidade de failover não verificável.** A SPEC exige que cada COMMIT acknowledged sobreviva a failover/restore, mas não fixa um conjunto de candidatos de promoção, quorum síncrono invariável ou evidência WAL com condição de aprovação. `pg_is_in_recovery() = false` não demonstra que o novo primário contém os COMMITs reconhecidos; o registro externo não inclui LSN nem linhagem autenticada de timeline. Referências: linhas 20, 42 e 70 do hash revisado.
2. **P1 — Bootstrap confia em ledgers sem autenticação/completude/frescor normativos.** Append-only por si só não prova inventário completo, estado atual de “ingress nunca abriu”, ausência de eventos omitidos nem resistência a replay de snapshot antigo. A fixture poderia afirmar essas propriedades sem testá-las. Referências: linhas 20, 58 e 65.
3. **P2 — Ordem e semântica do export de recovery são inconsistentes.** A função exige receipt do sink antes de alterar o marcador na mesma transação, enquanto o teste exige que readiness permaneça fechada após crash entre COMMIT e export. Não está definido se receipt atesta intent ou recovery committed nem como retry resolve essa janela. Referências: linhas 24, 52 e 68.
4. **P2 — Formato de assinatura e atualidade de identidade/revogação são abstratos.** “Canônico” e “manifesto assinado” não fixam encoding, algoritmo, validação de replay, sequência/frescor ou como o verificador obtém estado atual de revogação. Referências: linhas 24, 50 e 71.
5. **P2 — Falha do observer exige um reconciliador explicitamente fora do escopo.** A SPEC requer reconciliar uma reserva já durável após falha de append e seu teste espera que a reconciliação avance, mas a SPEC também exclui o reconciliador pending da SPEC 0160, que permanece gate separado. Falta definir handoff, limites de retry e tratamento de assinatura já expirada, sem inferir que o reconciliador existe. Referências: linhas 30, 33, 65 e 78 de 0162; linha 26 de 0160.

## Fontes consultadas pelo revisor

- [PostgreSQL 16 — configuração de replicação](https://www.postgresql.org/docs/16/runtime-config-replication.html).
- [PostgreSQL 16 — replicação síncrona e limites de failover](https://www.postgresql.org/docs/16/warm-standby.html).
- [PostgreSQL 16 — funções de recuperação](https://www.postgresql.org/docs/16/functions-admin.html).

## Disposição

Responder cada achado em texto normativo e verificável; então executar checks documentais e pedir crítica fresh-context I6. Sem código ou migration 0028 antes de aprovação humana separada.
