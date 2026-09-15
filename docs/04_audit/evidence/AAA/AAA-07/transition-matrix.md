# AAA-07 — Matriz transição → teste

Referência: contrato AAA-03 rev2 §4. Evidência de execução em `green-lifecycle.log`, `green-focused-with-edges.log` e `coverage-approval-engine.log`.

| Transição (contrato §4)          | Guarda implementada                                                   | Teste                                                                                            |
| -------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `REQUESTED → PENDING`            | solicitante autenticado; não expirada                                 | `approval-engine.test.ts` (legado, preservado)                                                   |
| `PENDING → APPROVED`             | aprovador ≠ solicitante; não expirada                                 | `approval-engine.test.ts`                                                                        |
| `PENDING → REJECTED`             | aprovador; não expirada                                               | `approval-engine.test.ts`                                                                        |
| `APPROVED → RESERVED`            | binding tenant/ação/recurso/payload/proposalHash/agente/policy; TTL   | lifecycle: reserve, winner único, owner, proposalHash; edges: capability divergente, sem binding |
| `RESERVED → EXECUTING`           | fencing `reservationId`; TTL da reserva válido                        | lifecycle: happy path, fencing do perdedor; edges: token expirado → `reservation_expired`        |
| `RESERVED/EXECUTING → EXECUTED`  | `confirm` com `effect_confirmed` + `executionRef`; replay idempotente | lifecycle: confirm, replay, concorrência com sweep                                               |
| `RESERVED/EXECUTING → APPROVED`  | `release` com prova `no_effect`; limpa reserva                        | lifecycle: old token, sweep `no_effect`; edges: prova inválida                                   |
| `RESERVED/EXECUTING → UNCERTAIN` | `markUncertain` com motivo; sweep ambíguo/ausente/erro                | lifecycle: markUncertain, sweep unknown/throw; edges: sweep `effect_possibly_started`            |
| `RESERVED/EXECUTING → FAILED`    | `fail` com prova `no_effect`; terminal                                | lifecycle: fail terminal; edges: prova ambígua → `invalid_proof`                                 |
| `APPROVED → EXPIRED`             | TTL vencido antes da reserva                                          | lifecycle: expira antes da reserva; legado `expireStale`                                         |
| `UNCERTAIN → EXECUTED`           | reconciliação com `effect_confirmed`; ator identificado               | lifecycle: reconcile confirmado                                                                  |
| `UNCERTAIN → FAILED`             | reconciliação com `no_effect`                                         | lifecycle: reconcile ausência                                                                    |
| transições inválidas             | `invalid_state` / `uncertain` / `invalid_proof`                       | edges: estados não-APPROVED, provas erradas, reconciliar fora de UNCERTAIN                       |

## Códigos de erro exercitados

`not_found`, `action_mismatch`, `payload_mismatch`, `proposal_mismatch`, `expired`, `invalid_state`, `already_reserved`, `reservation_expired`, `reservation_mismatch`, `uncertain`, `invalid_proof`, `invalid_request`, `already_executed`.

## Escopo de garantia

- Memória: as provas usam `InMemoryApprovalStore` e relógio injetável; **não** comprovam persistência PostgreSQL (AAA-16) nem multi-host.
- `runtime.ts` antigo continua usando `verifyAndConsume`; o F02 do runtime só fecha quando AAA-09 migrar para reserve/confirm (handoff em `handoff-agent-09.md`).

## Rework AAA07-C6 — fencing entre gerações de reserva

- `reservationGeneration` incrementa a cada nova reserva; `ApprovalReservation.generation` expõe o valor ao chamador.
- Toda mutação de reserva/recuperação (`markExecuting`, `confirm`, `release`, `fail`, `markUncertain`, `reconcile`, sweep) usa CAS com **identidade + geração no ponto da mutação** (`#casReservation`), não apenas checagem anterior de status.
- `usedReservationIds` rejeita a reutilização explícita de token já gasto (`reservation_reused`); token antigo não autoriza a geração nova em nenhuma mutação. Replay legítimo da mesma reserva ativa (mesmo token, mesma geração) continua.
- O sweep captura a reserva A; se `evidenceFor` liberar A e criar B, o CAS falha e o sweep não muta B, não incrementa contadores e não emite evento de liberação/incerteza.
- Testes: `approval-lifecycle-fencing.test.ts` (6 casos), probe de aceite em `rework-fencing-c6/fencing-acceptance.mjs`; RED em `rework-fencing-c6/red-fencing.log`.
