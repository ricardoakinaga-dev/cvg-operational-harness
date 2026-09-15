# AAA-07 — Plano curto, escopo e RED

- Task: `AAA-07` — lifecycle de aprovação com reserva e recuperação. Status: `IMPLEMENTED_PENDING_INDEPENDENT_REVIEW`.
- Insumos lidos: AGENTS/operacional, runtime/log/backlog (via coordenação), `review-coordinator-rework/review.json`, contrato AAA-03 rev2 `9df1a05f…` + adendo aprovado `AAA03-R-ACT-v1` (`d67fc915…`), AAA-05 v3 `cebeddab…`, AAA-04 v2.
- Escopo exclusivo: `packages/approval-engine/src/{contracts,engine,store,index}.ts` + testes do pacote. Evidência em `docs/04_audit/evidence/AAA/AAA-07/`.
- Fora do escopo (não tocado): `runtime.ts`, `packages/persistence/`, migrations, worker, `package.json`/lockfile, contratos congelados, registros compartilhados.
- API legada `verifyAndConsume` preservada para consumidores atuais; migração do runtime fica em AAA-09.

## Plano executado

1. RED: `approval-lifecycle.test.ts` com 19 casos de reserva/execução/confirmação/falha/incerteza/TTL/fencing/imutabilidade → 18 falhas no estado anterior (métodos inexistentes).
2. Implementação em `contracts.ts` (estados, evidência tipada, schema de reserva, campos do record) e `engine.ts` (reserve/markExecuting/confirm/release/fail/markUncertain/reconcile/releaseExpired, CAS, fencing, clones defensivos).
3. GREEN focado + bordas (`approval-lifecycle-edges.test.ts`) para elevar branches do módulo acima do threshold sem baixar barra.
4. Regressões de consumidores (runtime/policy/chaos), typecheck, lint, suíte global e coverage.

## Invariantes centrais

- Reserva nunca significa `EXECUTED`; só `confirm` com evidência `effect_confirmed` e `executionRef` confirma.
- Toda transição é CAS por tenant + approvalId + status esperado; `reservationId` é fencing.
- `release`/`fail` exigem prova explícita `no_effect`; prova ausente/ambígua → `UNCERTAIN`, nunca retry cego.
- `releaseExpired` nunca executa efeito: `no_effect` → `APPROVED`; qualquer outra coisa → `UNCERTAIN`.
- Objetos de entrada/saída clonados; mutação externa não altera payload/hash/status do store.
