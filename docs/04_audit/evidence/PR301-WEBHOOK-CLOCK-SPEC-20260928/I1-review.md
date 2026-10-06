# SPEC 0162 — parecer independente I1

## Escopo e resultado

- Revisão: I1 fresh-context, somente leitura, contra as SPECs 0160, 0161 e 0162.
- Commit de leitura: `b11426d99cb3a96061216030e8aeb8b6792b4be6`.
- Digest criticado de 0162: `5573d06e34cd57ff4302f0372549fa8970848551a0369d1d18343f9d0ee59970`.
- Veredito: `REVISE`; sem P0; 4 P1 e 1 P2. Nenhum teste ou implementação foi executado pelo crítico.

## Achados

| ID | Severidade | Achado | Requisito de fechamento |
| --- | --- | --- | --- |
| I1-1 | P1 | A reserva/receipt podia ler uma versão anterior de `highest_seen_at` enquanto outra API já commitou um high-water maior. | Ler a linha sob lock compartilhado no começo da decisão, manter o lock até commit, verificar no mesmo fluxo e testar a corrida com duas conexões/barreiras. |
| I1-2 | P1 | Grants de `SET` para `session_replication_role`, inclusive via role membership, podem suprimir triggers comuns. | Preflight por privilégio efetivo/inherited/PUBLIC, teste de `SET ... = replica` recusado e trigger ainda ativo. |
| I1-3 | P1 | Marcador materialmente futuro podia manter o serving fechado sem recuperação delimitada. | Runbook break-glass com autorização auditável, controles de chave/replay e teste de recuperação sintética; nunca conceder reset ao runtime. |
| I1-4 | P1 | “Fechar ingress durante rollout misto” não impedia um handler antigo de receber tráfego quando o gate fosse reaberto. | Sequência de rollout vinculada ao inventário/digest de cada instância e teste de bloqueio/rollback com binário antigo. |
| I1-5 | P2 | Escrita em singleton para cada pedido pode criar contenção que estoura a janela A2. | Teste de lock wait limitado, fail-closed sem efeitos, recuperação após liberar lock e benchmark no perfil de pico aprovado. |

O crítico concluiu que locks concorrentes serializam updates da linha e que `SECURITY INVOKER` pode validar `OLD`/`NEW` com built-ins, desde que o privilégio de suprimir triggers seja removido. Ele também pediu negativos para update stale/no-op, backdated/future, grants herdados, migration parcial/idempotente, recovery futuro e contenção.

## Resposta no draft

A revisão adiciona `SELECT ... FOR SHARE` em transação `READ COMMITTED` mantido até decisão/commit; checagem de `has_parameter_privilege` e negativa de `SET session_replication_role`; trigger que rejeita no-op stale/backdate; um runbook break-glass condicionado a duas aprovações, rotação de chave sem overlap e retenção dos tombstones; gate externo de rollout por digest; e testes com duas conexões e lock contention. Essas mudanças ainda **não** têm crítica de confirmação e não autorizam BUILD ou produção.

## Base técnica PostgreSQL 16

- [GRANT](https://www.postgresql.org/docs/16/sql-grant.html) inclui privilégios `SET` em parâmetros e soma permissões de memberships e `PUBLIC`.
- [Parâmetro `session_replication_role`](https://www.postgresql.org/docs/16/runtime-config-client.html) descreve que o valor `replica` suprime triggers comuns e limita alteração a superuser ou role com privilégio `SET`.
- [Access privilege inquiry](https://www.postgresql.org/docs/16/functions-info.html) define `has_parameter_privilege` para testar `SET` efetivo.
- [Read Committed](https://www.postgresql.org/docs/16/transaction-iso.html) especifica snapshots por comando e que `SELECT FOR SHARE` após espera retorna a versão atualizada e bloqueada da linha.
