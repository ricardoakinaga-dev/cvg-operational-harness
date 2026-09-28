# I2 — revisão da SPEC 0158 corrigida

- Crítico: Lagrange, leitura somente, 28/09/2026.
- Veredito: `ACCEPT_SPEC_REVIEW_READY`; nenhum P0/P1 remanescente no
  escopo delimitado do preflight. Aprovação humana T3 ainda necessária.
- O crítico reexaminou a SPEC 0158, código de preflight, migrations,
  operação de replay e [probe.log](probe.log). Conferiu SHA-256 de
  [probe.sql](probe.sql) e do log com [proof.json](proof.json). Não rodou
  PostgreSQL nem alterou arquivos.

## Duas precisões incorporadas

1. O probe recria uma **cópia sintética** da tabela/migrations. As formas
   canônicas medidas ali são baseline; o BUILD deve executar migrations
   0002/0025 reais em banco descartável antes de fixar o aceite.
2. O OID do schema alvo precisa ser capturado antes de mudar o
   `search_path` para iniciar por `pg_catalog`; depois desse ajuste,
   `current_schema()` apontaria para `pg_catalog`.

O contrato atualizado está em [SPEC 0158](../../../02_spec/0158_webhook_fencing_constraint_preflight.md).
