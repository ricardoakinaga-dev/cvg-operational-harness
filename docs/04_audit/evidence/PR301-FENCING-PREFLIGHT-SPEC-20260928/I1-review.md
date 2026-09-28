# I1 — crítica independente da SPEC 0158

- Crítico: Lagrange, leitura somente, 28/09/2026.
- Veredito: `REJECT_SPEC_REVIEW_READY`; nenhum P0.
- Fontes lidas: SPEC 0158, `tenant-preflight.ts`, migrations 0002/0025,
  `webhook-security.ts`, `server.ts` e probe PostgreSQL 16. Nenhum arquivo
  foi alterado pelo crítico.

## Achados

1. P1: tipos/defaults/nulabilidade de seis colunas, especialmente
   `created_at`, faltavam ao contrato.
2. P1: PK adiável poderia passar, embora `ON CONFLICT (event_key)` não a
   aceite; índice de suporte precisava de vínculo e estado válido.
3. P1: tabela `UNLOGGED` ou com herança preserva `relkind='r'`, mas quebra
   durabilidade ou unicidade global assumidas pela reserva.
4. P1: trigger, regra de reescrita ou FK adicional pode alterar DML mesmo
   com as cinco constraints esperadas. O risco foi inferido do código e
   catálogo, sem reprodução nesse parecer.
5. P2: índice de expiração precisava estar vinculado à tabela e ser
   válido/pronto; formas canônicas de PostgreSQL 16 e `search_path` deveriam
   ser explícitos; o boot com `POSTGRES_RLS_ENFORCEMENT=true` precisava ser
   delimitado.

A SPEC foi revista após este parecer. A I2 avaliará o novo texto antes de
qualquer pedido de revisão humana T3 ou BUILD.
