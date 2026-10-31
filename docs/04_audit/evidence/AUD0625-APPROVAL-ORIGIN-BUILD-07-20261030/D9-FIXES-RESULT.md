# Ajustes pedidos pela revisão da D9 (0291 BUILD, commit 483e08096)

Pacotes afetados (persistence, approval-engine, agent-runtime, shared, worker; PG real; em série): 144 de 147 arquivos e 1589 de 1596 testes passam. As 7 falhas são timeouts de PG/processo sob carga (load 8 a 11): `operational-harness-capability-postgres`, `operational-harness-process-restart` e `platform-postgres-smoke` passam isolados (9/9 e 1/1).

Veredito da D9: aprovada, P1 = 0, P2 = 1, P3 = 3. Tudo abaixo está na branch `claude/aud0625-approval-origin-07`, em um commit próprio.

| Achado | Resposta | Prova |
|---|---|---|
| P2-1 legado em voo | Seção C3a do `docs/08_runtime/0805_runbook_ambiente_real.md`: drenar ou resolver à mão antes da 0035, com a consulta que lista `RESERVED`/`EXECUTING`/`UNCERTAIN` sem origem | `AP11b` (`aud0625-approval-session-binding-red.test.ts`): legado `UNCERTAIN` com `executionRef` e sem origem → `origin_mismatch`, a ferramenta não roda, o status segue `UNCERTAIN` |
| P3-1 DELETE+INSERT | Garantia declarada como gatilho + privilégio mínimo (nota 0291b, §2) | `aud0625-approval-origin-delete-closure.test.ts` (3): `runtime_approvals` é tabela crítica, controle sem DELETE passa, papel com DELETE é recusado pelo preflight. Mutante (`can_delete` ignorado) morto |
| P3-2 dono desliga o gatilho | Registrado na nota 0291b, §2, como inerente ao PostgreSQL e fora do modelo de ameaça | — |
| P3-3 `verifyAndConsume` sem origem | `@internal` em `PostgresApprovalAuthority.verifyAndConsume` | `aud0625-approval-origin-guard.test.ts` (2): falha se um arquivo de produção citar `PostgresApprovalAuthority` e chamar `verifyAndConsume`. Mutante (arquivo ofensor) morto |

A SPEC 0291 não foi editada, porque o recibo 25 liga o hash `87a6a44e…`. A frase pedida sobre o gatilho e os dois desvios aceitos
(I2-c refinado; métrica sem tenant) estão em `docs/02_spec/0291b_approval_origin_binding_accepted_deviations_note.md`.

## Defeito meu encontrado no caminho
`runtime-approval-store.unit.test.ts` falhava na ponta da 0291 (3 de 4 testes: "compare-and-set failed"). A lista de colunas do fixture
(`persistedColumns`) não tinha `origin_conversation_id` e `origin_session_id`, que a fatia 2 acrescentou ao `recordValues`. Corrigido no
fixture; os 4 testes passam. A revisão da D9 e a minha verificação da fatia 2 não rodaram esse arquivo.
