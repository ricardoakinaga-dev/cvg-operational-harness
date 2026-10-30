# Nota 0225b — a migration da SPEC 0225 passa de 0030 para 0033 (AUD0625)

R1, 29/10/2026. Task `AUD0625-MIGRATION-RESERVE-07-20261029`. Nota adjacente à
[SPEC 0225](0225_pare100_complete_tool_result_journal.md) (SHA-256
`04b92ba4d13b1ed58157a24258cade87d8d6d31df833ef6c1969059772cc6da5`,
`APPROVED_WITH_ADJUSTMENTS` em 16/10/2026), cujo corpo é hash-bound e **não foi
editado**. Estado: `TECHNICAL_REVIEW_APPROVED`. Revisão técnica independente: APPROVE (Claude DF, 29/10/2026, sobre o commit `a13fbab13`). Não autoriza BUILD.

## Autoridade

O recibo de 16/10 ([spec-gates.json](../04_audit/evidence/USER-DECISIONS-20261016/spec-gates.json))
manda reservar o número da migration "no inventário atual" e registrar claim antes do BUILD, e
diz que a revisão que aplica **somente** os ajustes listados (aqui, número de
migration) segue com **uma revisão técnica independente, sem novo gate humano**.
Esta nota só troca o número; nenhuma outra decisão da 0225 muda.

## O que mudou no inventário

- A SPEC e o recibo fixaram a ordem `0029` (composição 0217), `0030` (esta
  SPEC) e `0031` (SPEC 0221). Depois disso a cadeia principal publicou
  `0029_case_assignment_authorization` (#13), `0030_api_creation_receipts`
  (SPEC 0257) e `0031_channel_effect_retry_not_before` (SPEC 0282), todos em
  `POSTGRES_MIGRATIONS`. Os números 0029–0031 estão ocupados.
- Conferido em 29/10/2026 em todas as refs (`refs/heads`, `refs/remotes`,
  `refs/tags`) e em todas as worktrees registradas: **nenhum arquivo
  `00NN_*.sql` com NN ≥ 32**, nenhuma reserva de 0032+ nos claims
  (`agent_coordination.md`) nem nas SPECs. A cadeia `operator-session/` é
  separada e não conta.
- Existem candidatos **nunca integrados** em commits fora de qualquer ref:
  `0029_controlled_published_kernel.sql` (SPEC 0217, em `a72422bee` e
  `14acc7861`) e `0030_complete_tool_result_journal.sql` (esta SPEC, em
  `7e4ed139f`). Eles carregam os números antigos e colidem com a cadeia
  principal; **não** podem ser integrados como estão.

## Renumeração

| Antes (SPEC / recibo)                  | Agora      |
| -------------------------------------- | ---------- |
| `0030` — journal de resultado completo | **`0033`** |

Arquivo previsto: `0033_complete_tool_result_journal.sql`, mais a entrada em
`POSTGRES_MIGRATIONS`. A ordem relativa original (composição → 0225 → 0221)
fica: `0032` retido para a composição 0217 (ver nota 0221b), **0033 = 0225**,
**0034 = 0221**. `POSTGRES_MIGRATIONS` é uma lista explícita e não há checagem
de contiguidade, então um `0032` vago é permitido se a composição não for
integrada.

## Vale para o BUILD

1. O candidato `7e4ed139f` precisa ser **renomeado e reaplicado** sobre a cadeia
   atual (conferir `RLS`, grants e o preflight da API e do worker, que listam as
   migrations) antes de qualquer teste PG; o checksum muda com o nome.
2. Reconfirmar o inventário e o claim imediatamente antes do BUILD: esta nota
   vale como reserva até o primeiro BUILD, não como licença permanente.
3. Nada mais da 0225 muda (corte exclusivo com parada, teto abaixo de 8 MiB,
   primeiro BUILD sem J14/J15, registro do limite de NUL).
