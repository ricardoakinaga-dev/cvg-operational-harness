# Nota 0221b — a migration da SPEC 0221 passa de 0031 para 0034 (AUD0625)

R1, 29/10/2026. Task `AUD0625-MIGRATION-RESERVE-07-20261029`. Nota adjacente à
[SPEC 0221](0221_pare100_public_session_persistence.md) (SHA-256
`1f9490ccee25f246e57a7c9c096c41c2572818c60e2c7bae5a4d315ad8e170e4`,
`APPROVED_WITH_ADJUSTMENTS` em 16/10/2026) e à recomposição aprovada
`f64a1b89` ([proposta](../04_audit/evidence/CLAUDE100-EXEC-20261017/foundation0221-recomposition/adjusted-spec-proposal.md),
§5 "Migration0031 e adoção"). Os corpos são hash-bound e **não foram editados**.
Estado: `TECHNICAL_REVIEW_APPROVED`. Não autoriza BUILD; a recomposição
mantém `BUILD_ENTRY_READY=false`.

## Autoridade

Mesmo fundamento da [nota 0225b](0225b_tool_result_journal_migration_renumber_note.md):
o recibo de 16/10 ([spec-gates.json](../04_audit/evidence/USER-DECISIONS-20261016/spec-gates.json))
permite aplicar só o ajuste de número de migration com uma revisão técnica
independente, sem novo gate humano.

## O que mudou no inventário

- A ordem aprovada era `0029` (composição 0217), `0030` (SPEC 0225), `0031`
  (esta SPEC). A cadeia principal ocupou 0029, 0030 e 0031 com migrations
  próprias (`case_assignment_authorization`, `api_creation_receipts`,
  `channel_effect_retry_not_before`). A premissa da recomposição ("0029 existe
  apenas no worktree PARE100; 0030/0031 ausentes") deixou de valer em duas
  partes: **0030 e 0031 estão ocupados** e **0029 também** (por outra migration).
- Em todas as refs e worktrees não há `00NN_*.sql` com NN ≥ 32, nem reserva de
  0032+ em claims ou SPECs (conferido em 29/10/2026). `0028_session_events` é a
  migration de esquema dedicado que esta SPEC expande; ela continua fora da
  execução padrão.
- A composição 0217 existe só como candidato fora de ref:
  `0029_controlled_published_kernel.sql` (`a72422bee`, `14acc7861`).

## Renumeração

| Antes (SPEC / recomposição)                                                                       | Agora      |
| ------------------------------------------------------------------------------------------------- | ---------- |
| `0031` — expansão de `session_streams` (`writer_lock_id`, `header_json`, `inherited_event_count`) | **`0034`** |

Ordem relativa preservada: `0032` retido para a composição 0217 (se o dono do
PARE100 a integrar; vago caso contrário, pois não há checagem de contiguidade),
`0033` = SPEC 0225 e **`0034` = esta SPEC**. O PAR-K03 (0225) continua
precedendo o PAR-S01.

## Vale para o BUILD

1. A condição da recomposição "0029 ainda não integrada no PAR-G01" muda de
   forma: o candidato de composição precisa de renumeração própria (decisão do
   seu dono) antes de poder ser pré-requisito; registrar na entrada do BUILD se a
   0221 depende dele ou não.
2. Declarar `maxOpenWriters` e a proibição de PgBouncer em transaction mode,
   como já exigido, e reconfirmar inventário e claim imediatamente antes do
   BUILD.
3. Nada mais da 0221 muda (primeira fatia: dono exclusivo e
   create/open/read/append/flush/close; recuperação por ticket depois).
