# SPEC 0291b — desvios aceitos e garantias declaradas da BUILD de origem da aprovação

Nota da BUILD da SPEC 0291 (`0291_approval_origin_binding.md`, sha256 `87a6a44e…`, ligada pelo recibo 25). A SPEC não foi
editada: o recibo vincula o hash. Esta nota a complementa e não a substitui.

Origem: `AUD0625-APPROVAL-ORIGIN-BUILD-07-20261030/SLICE1-RESULT.md` (desvios 1 e 2) e `SLICE3-RESULT.md` ("nenhum novo aqui"),
aceitos pelo DF na aprovação da fatia 1 e confirmados na revisão não autora da D9 (P1 = 0).

## 1. Desvios aceitos

1. **I2-c refinado.** A SPEC diz "o registro tem `executionRef` ⇒ `origin_mismatch`". Aplicado literalmente, quebrou 20
   testes: o motor também grava `executionRef` ao confirmar um efeito (`confirm`), então toda aprovação executada pelo runtime
   de biblioteca passa a ter `executionRef`. Regra implementada: `origin` ausente **e** `executionRef` presente (o pedido de
   biblioteca sempre grava a origem; o adaptador durável grava `executionRef` e nenhuma origem).
   - Consequência aceita, fail-closed: um registro anterior à SPEC, executado pelo runtime (sem origem, com `executionRef`
     da confirmação) e reapresentado depois, dá `origin_mismatch` em vez do replay `already_executed`.
   - Em voo na migração: um registro legado `RESERVED`/`EXECUTING`/`UNCERTAIN` não pode ser recuperado nem repetido pelo
     replay. Ver o runbook, seção C3a (`docs/08_runtime/0805_runbook_ambiente_real.md`); o teste `AP11b` cobre o `UNCERTAIN` legado.
   - Provas: AP11 (cruzamento com registro sem origem e `executionRef`) e um controle com origem e `executionRef`.
2. **Métrica sem tenant.** A SPEC (I3) pede a contagem de `origin_unbound` por tenant. O contrato de telemetria proíbe
   `tenantId` como atributo de métrica (lista fechada contra alta cardinalidade; `MetricAttributeError`). A métrica
   `approval_origin_unbound_total` leva `capability`; a contagem por tenant sai do evento de auditoria `runtime.origin_unbound`,
   que carrega o tenant.

## 2. Garantia declarada da imutabilidade (I1) — pedido da D9, P3-1 e P3-2

A imutabilidade da origem no PostgreSQL é **gatilho + privilégio mínimo**, não só o gatilho:

- O gatilho `cvg_runtime_approvals_origin_immutable` (BEFORE UPDATE) recusa qualquer alteração da origem, inclusive pelo
  `INSERT … ON CONFLICT DO UPDATE`. Ele **não** vê `DELETE` seguido de novo `INSERT`: isso fica fechado porque o preflight do
  worker exige `can_delete = false` em toda tabela crítica, e `runtime_approvals` é uma delas
  (`aud0625-approval-origin-delete-closure.test.ts`).
- O **dono da tabela** pode desligar o gatilho (`DISABLE TRIGGER`) ou alterar a tabela: é inerente ao PostgreSQL e está fora
  do modelo de ameaça do runtime, que não é dono (SPEC 0249, papel mínimo).

## 3. Primitiva latente — pedido da D9, P3-3

`PostgresApprovalAuthority.verifyAndConsume` não confere a origem; o runtime a confere em `#runExecutionTurn` antes de qualquer
reserva. A primitiva não tem chamador de produção e está marcada `@internal`;
`aud0625-approval-origin-guard.test.ts` falha quando um chamador aparecer, para que a checagem I2 entre junto.
