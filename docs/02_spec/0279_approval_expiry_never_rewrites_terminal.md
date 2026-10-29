# SPEC0279 — A expiração nunca reescreve aprovação decidida ou em voo

R0, 29/10/2026. Task `AUD0625-F03B-F08E-SPECS-DF-20261029`, follow-up
AUD0625-F08e (dono Claude DF), observação da §6 da
[SPEC0274](0274_approval_decision_recovery_terminal_states.md), achado F08 da
[auditoria 0625](../04_audit/0625_repository_score_audit_2026-10-28.md).
Estado `PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: máquina de estados da aprovação e
evidência de decisão. **Sem BUILD até revisão humana explícita deste
documento.**

## 1. Evidência atual

Base: `claude/aud0625-wave2` @ `e2a4d518`.

- `#assertNotExpired` (`packages/approval-engine/src/engine.ts`) troca o status
  para `EXPIRED` por CAS sobre o **status atual, qualquer que seja**, emite
  `approval.expired` e lança `expired` quando `expiresAt` passou.
- Dois caminhos chamam a guarda antes de conferir o status:
  - `verifyAndConsume`: só recusa antes `EXPIRED` e `EXECUTED` de uso único;
    a guarda roda antes do `status !== APPROVED/EXECUTED`.
  - `submit`: a guarda roda antes do CAS `REQUESTED → PENDING`.
  - `approve` e `reject` passam primeiro por `#replayDecision`, que recusa
    estados decididos. `reserve` confere `APPROVED` antes. Estes três não são
    afetados.
- O adaptador PostgreSQL (`packages/persistence/src/runtime-approval-store.ts`,
  `#mutateRecord`) grava de propósito a troca para `EXPIRED` mesmo quando o
  motor lança, para manter o registro igual ao estado em memória. A troca é
  durável.
- Prova (fase 1, `aud0625-f08e-expiry-terminal.test.ts`), depois de
  `expiresAt`:
  - `verifyAndConsume` troca `REJECTED`, `CANCELLED`, `RESERVED`, `EXECUTING`,
    `FAILED` e `UNCERTAIN` para `EXPIRED` e responde `expired`;
  - `submit` troca `REJECTED`, `CANCELLED` e `FAILED` para `EXPIRED`;
  - uma execução em `EXECUTING` perde o `confirm` depois de uma chamada
    perdida de `verifyAndConsume`, com o erro `Approval is not reserved or
executing`. A evidência do efeito deixa de ser gravável.
- `expireStale` já se limita a `REQUESTED`, `PENDING` e `APPROVED`. Com isso, a
  varredura e a guarda divergem.

## 2. Invariantes

1. Só estados ainda vivos expiram: `REQUESTED`, `PENDING`, `APPROVED` e
   `EXECUTED` reutilizável (`singleUse: false`). O último já expira hoje, e
   isso não muda.
2. `REJECTED`, `CANCELLED`, `FAILED`, `UNCERTAIN`, `EXPIRED`, `RESERVED` e
   `EXECUTING` nunca mudam de status pela guarda de expiração e não emitem
   `approval.expired`.
3. Nesses estados, `verifyAndConsume` e `submit` respondem `invalid_state`
   pelo caminho que já existe, sem gravar nada.
4. A reserva continua governada pelo próprio TTL (`releaseExpired`,
   `#reservationExpired`), não pela expiração da aprovação.

## 3. Mudança proposta

- Conjunto `EXPIRABLE_STATUSES = { REQUESTED, PENDING, APPROVED }`, igual ao
  de `expireStale`, mais `EXECUTED` quando `singleUse === false`.
- `#assertNotExpired(record)` só age quando o status está nesse conjunto. Fora
  dele, retorna sem gravar nem emitir, e o chamador segue para a própria
  conferência de status.
- Nenhuma mudança no adaptador PostgreSQL: ele só persiste o que o motor
  alterou.
- A recuperação da 0274 continua valendo para dados antigos em que `REJECTED`
  já virou `EXPIRED`.

## 4. Critérios de pronto

- [ ] Os 10 `it.fails` da fase 1 viram `it`: 6 estados × `verifyAndConsume`,
      3 estados × `submit` e o `confirm` depois da chamada perdida.
- [ ] Controles: `APPROVED`, `REQUESTED` e `PENDING` vencidos continuam
      expirando; `EXECUTED` reutilizável vencido continua recusado e expira;
      `REJECTED` antes do prazo responde `invalid_state`; `expireStale` não
      toca os estados decididos.
- [ ] Mutações mortas: conjunto sem `APPROVED`; conjunto com `REJECTED`;
      `EXECUTED` sem a condição `singleUse`; retorno antecipado que lança
      `expired` em vez de seguir.
- [ ] Passada PG com contêiner próprio: `REJECTED` vencido via
      `PostgresApprovalAuthority.verifyAndConsume` continua `REJECTED` no
      banco e sem evento.
- [ ] Gates com Node 22: typecheck, lint e vitest focado de approval-engine,
      persistence (runtime-approval-store) e worker.

## 5. Testes

- Fase 1:
  `packages/approval-engine/src/__tests__/aud0625-f08e-expiry-terminal.test.ts`,
  com 10 `it.fails` e 6 controles. Sem a inversão, os `it.fails` falham por
  `expected 'expired' to be 'invalid_state'`; o caso do `confirm` falha por
  `Approval is not reserved or executing`.
- BUILD: a inversão, as mutações e a passada PG.

## 6. Fora de escopo

- Reescrever registros que já viraram `EXPIRED` no banco: a 0274 já recupera o
  evento de decisão deles.
- Mudar a política de expiração de `EXECUTED` reutilizável.

## 7. Decisões pedidas ao Ricardo

- **D1.** Estender a proteção a `RESERVED`, `EXECUTING`, `FAILED`, `UNCERTAIN`
  e `CANCELLED`, além de `REJECTED`, que era o cartão original. Recomendado:
  sim. A troca de `EXECUTING` derruba a gravação da evidência do efeito, e a de
  `UNCERTAIN` apaga a incerteza que impede o novo envio.
