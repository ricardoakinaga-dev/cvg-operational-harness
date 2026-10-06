# F03 — reconciliação do estado I9 na SPEC 0163

Data: 29/09/2026. Escopo exclusivamente documental; sem alteração do contrato técnico.

## Evidência

- A SPEC antes da correção tinha SHA-256 `ec8d3950b96532f4af8a17a8aa98911791e385921ca78a80ac8b358661684f5f`.
- A crítica independente [I9](I9-review.md), SHA-256 `650a9b186f9f38ffb851ac6edc999930a3be91c6fb73adf4709223cc8287f3a2`, registra o mesmo hash antes/depois e `ACCEPT_SPEC_REVIEW_READY`, 0 P0/P1/P2.
- O cabeçalho, o passo 1 de Rollout e o parágrafo final da SPEC ainda diziam que a crítica independente estava pendente e que I7 era a crítica mais recente. Esses estados contradiziam I9.

## Correção e efeito

Foram corrigidos somente esses três blocos de metadados processuais. O diff em relação ao blob `90d7f13` mostra três linhas alteradas; requisitos, cenários, testes planejados, rollout técnico e escopo não mudaram. O hash do novo candidato é `b528f27f776cdf9796571ed4210c7bafda2fb38367e3bd1ff7244e4473aac77d`.

I9 permanece válido para o hash anterior e **não** é transferido ao novo hash. A candidatura corrigida requer crítica independente I10 no hash exato e, se aceita, decisão humana T3 também vinculada a esse hash. BUILD não está autorizado. Sem código, testes, SQL, banco, runtime, dados reais, exportação externa, push, deploy ou produção.
