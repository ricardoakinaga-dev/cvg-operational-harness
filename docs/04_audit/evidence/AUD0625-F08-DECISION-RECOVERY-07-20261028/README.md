# AUD0625-F08-DECISION-RECOVERY-07-20261028

Base origin/main 8429019b, branch `claude/aud0625-f08-07`. SPEC `docs/02_spec/0272_approval_decision_event_recovery.md` (PROPOSED_FOR_HUMAN_T3_REVIEW). Correção não implementada; sem PG.

- Testes de alvo (it.fails, hoje passam por existir o defeito): `packages/agent-core/src/__tests__/aud0625-f08-decision-event-recovery.test.ts` (RESERVED/EXECUTING/EXECUTED) e `apps/worker/src/__tests__/aud0625-f08-stuck-selection.test.ts` (seletor).
- Controles: crash com APPROVED converge, concorrência deixa 1 evento, REJECTED, estado posterior não autoriza decisão contrária, PENDING/envelope incompleto falham fechados.
- `node22-gates.txt`: Node v22.23.2, vitest agent-core + apps/worker, typecheck, lint.
