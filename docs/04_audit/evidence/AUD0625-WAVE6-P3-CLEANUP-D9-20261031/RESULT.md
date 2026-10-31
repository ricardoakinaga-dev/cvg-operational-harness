# Limpeza dos 3 P3 da revisão da onda 6 (D9)

Branch `claude/aud0625-wave6-p3-cleanup-d9`, base `claude/aud0625-wave6` @ `70424def9`. Pedido do DF. Origem: `AUD0625-REVIEW-WAVE6-D9-20261031/REPORT.md` (P3-1, P3-2, P3-3).

1. **Provas PG da 0291 no script.** `npm run test:postgres` passa a listar `aud0625-approval-origin-postgres.test.ts` e `aud0625-approval-origin-worker.integration.test.ts` (SKIP-PG-AO-001/002); já rodavam pelo gate unitário com `TEST_DATABASE_URL` no job, agora também pelo gate PG dedicado.
2. **Rótulo do log.** `worker.sweeps_disabled` virou `worker.approval_sweeps_disabled`: só as varreduras de aprovação e de diário esperam a composição do motor de aprovações (AAA-21); a de spill (SPEC 0293) é independente e tem `worker.spill_sweep_enabled`. A tabela de eventos da SPEC 0163 foi atualizada (nome antigo anotado). Nenhum outro código referencia o nome.
3. **Preflight da 0035 no worker.** `assertPostgresKernelPrerequisites` (o preflight do worker do kernel, que usa `runtime_approvals`) chama o novo `assertApprovalOriginGuard` (`apps/worker/src/approval-origin-guard.ts`): as colunas de origem existem e o gatilho `runtime_approvals_origin_immutable` está presente, habilitado, `BEFORE UPDATE FOR EACH ROW`, com função `SECURITY INVOKER`, `search_path = pg_catalog, pg_temp` e corpo igual ao da migração 0035. Falha na partida (`kernel_runtime_prerequisites_missing`), não no primeiro pedido de aprovação.

## Provas

- `postgres-role-preflight.test.ts` (PG real, papel sem bypass): baseline passa; para cada dano — gatilho removido, gatilho desabilitado, gatilho que também dispara em INSERT, função trocada por no-op, função `SECURITY DEFINER`, função sem `search_path` fixado, coluna de origem ausente — o preflight recusa e, reparado, volta a passar. SKIP-PG-019 refeito (19 testes pulados sem banco, novo hash).
- Mutantes (`mutations.json`, `mutation-results.json`): 7/7 mortos (sem sondar colunas, sem checar habilitação, sem checar máscara do gatilho, aceitar `SECURITY DEFINER`, aceitar `search_path` solto, sem comparar o corpo, sem chamar o guarda = comportamento antigo). Uma oitava (não conferir o nome da função) sobrevivia por ser equivalente — o gatilho é achado por nome e o corpo é comparado —, então a checagem redundante foi removida em vez de declarada.
- Gates (Node 22.23.2): typecheck, eslint nos 4 arquivos, prettier, `skip:governance` PASS, `mutation:guard` PASS, links limpos, `apps/worker` inteiro com PG: 39 arquivos, 311 testes.

Produção NO_GO; dados sintéticos.
