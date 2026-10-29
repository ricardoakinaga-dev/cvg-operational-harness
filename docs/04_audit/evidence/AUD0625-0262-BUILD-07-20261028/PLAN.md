# AUD0625-0262-BUILD-07-20261028 — plano de fatias (SPEC 0262 R5, sha256 5b54fa87…)

Base: ponta da 0257 (branch `claude/aud0625-0257-07`). SPEC copiada byte a byte em `docs/02_spec/0262_case_mutation_session_revocation.md`. Node 22. PG só com uptime < 12 e contêiner próprio.

O que a SPEC pede (reconhecimento, arquivo da SPEC entre parênteses):
- Seis mutações numa unidade de autorização+escrita (§4): `runAuthorizedCaseCommand`, `withTenantMutationTransaction` (generaliza o helper da 0257), principal `FOR SHARE`, assignment `FOR SHARE` até o COMMIT, locks `execution → runtime_approvals`, matriz de convergência de runtime approval (§4.2), outcome explícito do engine com `COMMIT_EXPIRED` (§4.3), journey task autorizado (§4.1). Factories client-owned em RuntimeRepository, JourneyRepository, PostgresApprovalAuthority, PostgresOperationalExecutionStore, CaseAuthority.
- Guard preHandler de principal em todas as rotas de operador, com classificação fechada de rotas (§5; 80 rotas + 37 HEADs).
- Binding do cookie à `principal.revision` (§3) e migration Auth `operator-session/0002_principal_revision.sql` com seis funções SECURITY DEFINER v2 (§6.2), `switchIdentity` com releitura do principal, preflight que fixa nomes/assinaturas/grants.
- Invalidação global por revisão (`invalidateOperatorSessions`) e script root `revoke-operator-sessions.ts` com política `/etc/cvg/operator-action-policy.json`, prova strict JSON e atestação local (§6.1); lançamento real root/T4 fica NOT_RUN.
- Memória: `InMemoryCaseAuthority.runAuthorizedMutation` na mesma fila (§7) e Authstore em memória com famílias/replace/switchIdentity.

## Fatias propostas (cada uma com commit local, testes e revisão)
1. **Núcleo da unidade (PG + memória) para task.create, approval.create e task.status**: `withTenantMutationTransaction`, `runAuthorizedCaseCommand` com principal/assignment `FOR SHARE` retidos até o COMMIT, R01/R02/R03/R04/R05/R11 para esses três comandos; replay da 0257 só depois dos guards.
2. **Runtime approval + journey task + matriz de convergência + outcome do engine** (R06, R13, R15).
3. **Binding de cookie + migration Auth v2 + funções + preflight + switchIdentity** (R07, R08, R10, R12).
4. **Guard preHandler e inventário de rotas** (R09).
5. **Invalidação global + script `revoke-operator-sessions.ts` + política/atestação** (R14).

## Aviso de escopo
A 0262 é várias vezes maior que a 0257 (toca Auth, sessão, preflight, ~80 rotas, 5 repositórios e um programa root). A entrega por fatias acima mantém cada commit revisável. A fatia 1 é a que depende diretamente da 0257 e fecha o achado F07/U04 original.
