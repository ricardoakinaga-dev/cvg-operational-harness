<!-- Crítico independente do código do BUILD0249, rodada 2 final (mesmo crítico da rodada 1 do código; diferente do crítico da SPEC; somente leitura). Texto preservado. -->
# Crítica do BUILD0249, rodada 2 (final)

**Veredito: APPROVE. Não há itens obrigatórios (nenhum C2-xx).**

## (a) O reparo está correto e não traz defeito

- P3-1: a asserção consulta `ordered.pendingLedgers()`; o `trail` não usado saiu; a asserção deixou de ser vazia.
- P3-3: a AC07 compara `lease_until` antes e depois da recusa a outro dono e da recusa ao token velho, com capturas no ponto certo (depois da renovação válida e depois do takeover).
- P3-6: `redactOutboxError` deixa passar o código fixo `outbox_error:lease_expired_exhausted`, como já fazia com o erro de takeover; constante sem dado sensível; quem mande exatamente essa string em `fail` só grava a mesma constante.
- P3-8: logs com saída 0 para typecheck, lint e prettier (22 arquivos); suítes afetadas 503/503; `test:postgres` 314/314; M8 reescrito morreu na AC01.
- As justificativas para não aplicar P3-2, P3-4, P3-5, P3-7 e P3-9 se sustentam.

## (b) A lista do worker derivada do inventário é sólida

- Mesmo conjunto e mesmas regras da API (`apps/api/src/tenant-preflight.ts`): RLS e FORCE, uma política `${table}_tenant_isolation` PERMISSIVE para `{public}`/`ALL`, tenant-only vs quarentena por `TENANT_ONLY_TABLES`, mesma `normalizePolicyExpression`, mesma regra de grants e de dono.
- A concessão já existe: `migrate-job.mjs` concede SELECT/INSERT/UPDATE em todo o inventário; nenhuma migração dá DELETE em tabela do inventário.
- Sem premissa nova: no `compose.production.yaml`, worker e API usam o mesmo `DATABASE_URL` do role de runtime e o worker só sobe depois do `migrate`; tudo o que o worker passa a exigir a API do mesmo deploy já exige. Sem migração.
- A checagem fica mais forte: as 15 tabelas da lista anterior estão no inventário (superconjunto).
- Nenhum chamador quebra: `continuous-worker-entrypoint` concede `WORKER_CRITICAL_TABLES` depois de todas as migrações; o preflight do harness operacional e os testes de homolog/restart usam `OPERATIONAL_HARNESS_CRITICAL_TABLES`; `rem21-010` não chama o preflight do worker; ninguém dependia do tipo `as const`; duplicata no inventário já derrubaria a API.

## (c) Nenhum obrigatório novo

## P3 (opcionais)

1. O adendo vai além do texto aprovado da §3.1 (que só acrescentava duas tabelas); não enfraquece nada, mas o lead deve incorporá-lo à SPEC na promoção e citá-lo no PR (trilha T3). Não conta como premissa nova: é a mesma exigência que a API já faz no mesmo deploy.
2. O mock de limpeza de contexto tira o tipo de política do mesmo inventário que a implementação; a correção do mapeamento passa a depender só dos testes contra PG real.
3. `continuous-worker-entrypoint.integration` e `operational-harness-homolog.integration` não estão em `test:postgres` e os logs não mostram os nomes; convém confirmar que rodaram.
4. Quando as `case_*` entrarem no inventário, um worker mais novo que o banco recusa a partida (fail-closed); o `depends_on` do compose cobre; vale uma linha no runbook para implantações fora do compose.

## Tratamento do implementador

- P3-3: confirmado por execução verbosa própria — `build/entrypoint-homolog-preflight-pg.log`: `continuous-worker-entrypoint.integration`, `operational-harness-homolog.integration` e `postgres-role-preflight`, 3 arquivos, 21 testes PASS, zero skip, PG próprio com `TEST_DATABASE_URL`.
- P3-1 e P3-4: levados ao `ledger-delta.md` para o lead (incorporar o adendo à §3.1 na promoção; linha de runbook).
- P3-2: registrado como limite.
