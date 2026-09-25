# SPEC — AUD19-008 — Worker durável de homologação

- programa: `AUD-20260919-REMEDIATION`; onda: `W2`; gates: `G1` ✅ + `G3` ✅
  (depende de `AUD19-003`–`007` ✅).
- aprovação técnica e operacional: prompt humano de 2026-09-19 (autoriza
  homologação controlada local/sintética/descartável; produção segue `NO_GO`
  e é recusada pelo próprio worker).
- tipo: SPEC → BUILD → AUDIT (composição operacional, sem provider/efeito real).

## Desenho (modos e composição)

Novo modo `CVG_WORKER_RUNTIME=operational-harness-homolog`
(`apps/worker/src/homolog-worker.ts`, despacho em `main.ts`):

- Arming explícito: `CVG_HOMOLOG_SYNTHETIC_ONLY=true` obrigatório;
  `NODE_ENV=production` recusa; `DATABASE_URL` obrigatório (PG mandatório;
  memory recusado — homologação sem durabilidade não prova nada).
- Composição: `createOperationalHarnessWorker(env)` (PG store/authority/
  journal, surface de tools sintética vazia — nenhum tool resolve, nenhum
  efeito real possível) + loop contínuo até SIGTERM/SIGINT com drain
  (`createShutdownController`, padrão existente) + bounds
  (`CVG_WORKER_MAX_EVENTS`, idle/poll, sweep interval).
- Ticks: `runSweepTick` existente (journal/approvals) + convergência de
  aprovações travadas (`reconcileStuckApprovalDecisions`: WAITING_APPROVAL
  com aprovação decidida → `resolveApproval` + `appendAudit` idempotentes,
  via `reconcileApprovalDecision` de `@cvg/agent-core`; PG-only).
- Lease/fencing: herdados do execution store (claim/lease/fence existentes,
  provados em R3); smoke multiprocesso prova reclaim pós-SIGKILL.
- DLQ/terminal: envenenamento (tool irresolúvel + `maxAttempts=1`) →
  `FAILED_TERMINAL` sem efeito duplicado; outbox DLQ herdada.
- Rollback por config: seleção é 100% env; reverter = trocar
  `CVG_WORKER_RUNTIME` (documentado; sem migração, sem estado novo).

## Critérios de aceite (congelados)

1. Smoke multiprocesso (`tsx main.ts` × 2, PG descartável): A faz claim e
   recebe SIGKILL; B reclama e completa `SUCCEEDED` uma vez; journal sem
   efeito duplicado; ≥1 sweep tick observado; SIGTERM drena com exit 0.
2. Sem `DATABASE_URL`, sem arming ou com `production` → recusa fail-closed.
3. Nenhum provider/efeito real necessário nem tocado (surface vazia).
4. `typecheck`, `lint`, `format:check`, `git diff --check` PASS.

## Arquivos (congelados)

- novos: `apps/worker/src/homolog-worker.ts`,
  `apps/worker/src/__tests__/operational-harness-homolog.integration.test.ts`;
- editados: `apps/worker/src/main.ts` (despacho),
  `package.json` (`test:postgres` += smoke).

## Evidência

- `docs/04_audit/evidence/AUD-20260919/AUD19-008/`
