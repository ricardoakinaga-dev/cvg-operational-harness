# Revisão da 0262, fatia 1 — Claude DF, 29/10/2026

Alvo: `claude/aud0625-0257-07` @ `e4fecb18`, que inclui o código `776a8f56`, o teste `d8d797e5` e a evidência. Revisor não autor; a autoria é da sessão 07. Revisão, não aceite. Produção `NO_GO`.

## Veredito

**APPROVE**, sem obrigatórios. 2 P3 e 2 observações.

## O que conferi

- A decisão e a escrita na mesma unidade:
  - **Memória:** `runAuthorizedMutation` roda `authorize` e `write` dentro da mesma fila de `readSnapshot`, `putAssignment` e `applyVerifiedPrincipalState`.
  - **PostgreSQL:** `authorizeOnClient` roda dentro de `runCreationTransaction`, depois do contexto de tenant e antes do advisory lock da operação. Por isso o replay também passa pela autorização. Ele trava `case_principals` e `case_assignments` do ator `FOR SHARE` até o COMMIT, e a política lê no mesmo client (READ COMMITTED, então cada comando enxerga o que já foi confirmado).
- **Ordem dos locks contra a revogação, sem ciclo:**
  - `putAssignment` trava o principal do *ator* `FOR SHARE` e depois a atribuição `FOR UPDATE`. A criação espera nessa linha e não segura nada que a revogação peça.
  - `applyVerifiedPrincipalState` trava o principal `FOR UPDATE` primeiro, na mesma ordem principal → atribuições da criação.
  - O caminho `ACTIVE` pede o principal-alvo `FOR SHARE`, compatível com o `FOR SHARE` da criação.
- **A checagem prévia continua:** `authorizeCaseMutation` roda antes; a unidade repete a mesma política (`assertCaseMutationOnSnapshot` compartilhada). Sem identidade, o que só existe com `requireAuthenticatedMutations` desligado, não há unidade, como antes.
- **Testes, com Node 22 e `--maxWorkers=2`:** `case-mutation-unit-memory`, `case-scope-tasks-approvals`, `api-creation-http` e `api-creation-memory` dão 48/48. Não repeti a passada PG; ela é da 07 (7/7) e as mutações P1–P4 estão em `mutations-0262-s1*.json`.

## P3

- **P3-a, falha fechada da composição.** No PG, `runAuthorizedMutation` não avalia a política: só entrega `authorizeOnClient` ao `write`. Um port de criação que ignore o hook, como a memória combinada com uma autoridade PG, comitaria sem a unidade, e restaria só a checagem prévia. Sugestão:
  - recusar na composição uma autoridade `postgres` com port de criação que não seja `PostgresApiCreation`; ou
  - marcar no `authorizeOnClient` que ele foi chamado e lançar antes do COMMIT se não foi.
- **P3-b, a ordem lock → política.** Nenhum teste fixa que a política roda *depois* dos dois `FOR SHARE`. O mutante "política antes dos locks" abre a janela da revogação entre a leitura e o lock. Vale um teste PG com a barreira `afterAuthorize` ou com um ponto entre a política e o lock.

## Observações

- **O1:** o `task.status` client-owned ainda abre `BEGIN`/`COMMIT` próprio, e o autor já o declarou aberto para a fatia 2.
- **O2:** a unidade só cobre a criação de task e de approval nesta fatia. As outras rotas de mutação de caso continuam com a checagem prévia, conforme o plano de 5 fatias.

## Confirmação dos P3 e revisão da fatia 2a (`6cdf4fa6`, `6f700097`)

**APPROVE**, sem achados novos.

- **P3-a fechado.** As rotas de criação respondem 503 (`configuration_error`) com autoridade `PostgresCaseAuthority` e port de criação que não seja `PostgresApiCreation`. As rotas de status e decisão fazem o mesmo com `PostgresAuthorizedWrites`, antes de qualquer escrita.
- **P3-b fechado.** O teste PG põe uma barreira dentro da política, e o mutante "política antes dos locks" morre (autor; PG 11/11).
- **Fatia 2a.** `PATCH` de status da task e decisão de atendimento passam por `runAuthorizedCaseMutation`. No PG, `PostgresAuthorizedWrites` usa `runTenantMutationTransaction`, o mesmo dono de BEGIN/COMMIT da criação, com as primitivas `*InTransaction`. Os wrappers antigos continuam abrindo a própria transação. Na memória, o fallback roda dentro da fila da autoridade.
- **Testes, com Node 22 e `--maxWorkers=2`:** `case-mutation-unit-memory`, `case-scope-tasks-approvals`, `task-status-atomicity`, `attendance-approval-atomic`, `approval-actions` e `task-lifecycle` dão 32/32. A passada PG é do autor.
- **Falta, na fatia 2b do autor:** runtime approval, journey task, matriz de convergência e R06/R13/R15.
