# AAA-05 — Adendo v3: SQL handoff alinhado a D05-1/D05-2 (substitui A5 anterior)

- Programa: `AAA-20260912`. Task: `AAA-05`. Autor: agent-2. Data: 2026-09-12.
- **Substituição inequívoca**: este documento substitui a seção A5 de `docs/04_audit/evidence/AAA/AAA-05/addendum-agent2-bindings-namespaces-sql.md` (hash `cb82eb…`), que propunha uma migration única `0012` e adapter runtime pelo Agente 1. Aquele A5 permanece **histórico**; nenhuma outra fonte de decisão deve ser usada para migrations/ownership.
- Base: `coordinatorDecisions` do ledger `docs/03_build/tracking/aaa_execution_ledger.json` (D05-1/D05-2, 2026-09-12T21:06:44Z) e parecer `docs/04_audit/evidence/AAA/AAA-05/review-coordinator-v2/REVIEW.md` (C2-F03).
- Natureza: planejamento/handoff documental. **Nenhuma migration, código, export ou registro compartilhado foi criado ou editado.**

## Decisões aplicadas (transcrição operacional)

| ID    | Decisão do coordenador                                                                                                                                                                     | Efeito neste handoff                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| D05-1 | `0012_channel_effect_journal` (canal) e `0013_runtime_effect_journal` (runtime) reservadas; somente o Agente 2 escreve migrations                                                          | duas reservas separadas; nenhuma migration única; reserva ≠ autorização de BUILD      |
| D05-2 | Canal: adapter + `0012` = Agente 2. Runtime: adapter + `0013` especificado pelo Agente 1 (AAA-10) e implementado pelo Agente 2 sob handoff. `outbox.ts`/`postgres.ts` exclusivos de AAA-10 | paths e responsabilidades fixados; handoff obrigatório antes de escrever persistência |

## Alocação de migrations e paths

| Item                        | Path exato                                                                   | Conteúdo / responsabilidade                                                                                                                                                                                                                                        | Autoridade de decisão                                                                     |
| --------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Migration do canal          | `packages/persistence/migrations/0012_channel_effect_journal.sql`            | tabela `channel_effect_journal` (PK `(tenant_id, channel, operation_kind, idempotency_key)`), `payload_hash`, `hash_version`, estados `PENDING/SENDING/CONFIRMED/FAILED/UNCERTAIN/EXPIRED`, lease, `result jsonb`, `error_code`, `revision`, timestamps, RLS FORCE | Agente 2 (D05-1/D05-2)                                                                    |
| Adapter SQL do canal        | `packages/persistence/src/channel-effect-journal-postgres.ts`                | implementa `ChannelEffectJournal`; débito de código de AAA-12 (extensão)                                                                                                                                                                                           | Agente 2                                                                                  |
| Migration runtime           | `packages/persistence/migrations/0013_runtime_effect_journal.sql`            | tabela `effect_journal` (PK `(tenant_id, operation_key)`), `proposal_hash`, estados `RESERVED/EFFECT_STARTED/CONFIRMED/EFFECT_FAILED/UNCERTAIN/ABANDONED`, `attempt_id`, `execution_ref`, `result_digest`, TTL/lease, RLS FORCE                                    | especificada pelo Agente 1 (AAA-10); **escrita** pelo Agente 2 na sequência de migrations |
| Adapter SQL runtime         | `packages/persistence/src/effect-journal-postgres.ts`                        | implementa `EffectJournalPort` (AAA-03 §7)                                                                                                                                                                                                                         | Agente 1 especifica; Agente 2 implementa sob handoff                                      |
| `outbox.ts` / `postgres.ts` | `packages/persistence/src/outbox.ts`, `packages/persistence/src/postgres.ts` | mecanismo de entrega/leases existente; não substituído pelo journal                                                                                                                                                                                                | exclusivos de AAA-10 (Agente 1), com handoff do Agente 2                                  |
| Exports de persistência     | `packages/persistence/src/index.ts`                                          | só após handoff explícito e janela única                                                                                                                                                                                                                           | Agente 1                                                                                  |

## Precondições de implementação (não satisfeitas automaticamente)

1. Parecer independente favorável ao contrato AAA-05 v3 e ao SPEC runtime aplicável.
2. Task/escopo de BUILD registrados para cada adapter (canal = extensão AAA-12; runtime = AAA-10) e `G_SPEC` por task.
3. Handoff registrado entre Agentes 1 e 2 para `0013`/adapter runtime e para `outbox.ts`/`postgres.ts`.
4. Janela exclusiva para migrations e exports (sem escrita concorrente).
5. **AAA-17 não é autorização** para este trabalho; nenhuma task futura herda autorização automática.

## Compatibilidade de hash (C2-F01) aplicada ao SQL do canal

- `0012` deve incluir `hash_version text NOT NULL DEFAULT 'legacy-local-v1'` (aditiva).
- Hashes antigos não são reescritos; journal não é apagado; reenvio não pode contornar conflito.
- Registro legado re-apresentado com versão de hash diferente resolve por versão + reconciliação explícita (`hash_algorithm_mismatch` fail-closed), nunca por `idempotency_key_reuse` derivado de algoritmos distintos.
- O spec runtime (`0013`) decide a política própria de `proposalHash`; o vínculo entre fronteiras continua sendo `idempotencyKey := operationKey`.

## Limites

- Documento de planejamento; não implementa, não migra e não fecha gate.
- Nenhuma conexão a banco operacional; fixture descartável da porta 55432 segue separada.
- Divergências futuras devem atualizar **este** documento ou produzir versão explícita; evitar terceira fonte de decisão.
