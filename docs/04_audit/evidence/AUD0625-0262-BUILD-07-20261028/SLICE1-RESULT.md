# 0262 BUILD — fatia 1 (unidade autorizada para criação de task/approval)

Base: 0257 (b36fc0c8). Commits: 776a8f56 (fatia), d8d797e5 (teste do principal).

- Memória: unidade roda na fila da autoridade. PG: `FOR SHARE` em principal e atribuições até o COMMIT, antes do lock de criação.
- Testes: PG 7/7 (R01, R04, R02 nas duas ordens, R02 principal, R03, principal desativado); memória 6/6; focado apps/api + persistence 1039 ok; typecheck 0; eslint 0.
- Mutantes: 7/7 mortos (P1 sobrevivia; morto pelo teste "R02 principal" — ver mutations-0262-s1-rerun.json).
- ABERTO: `task.status` com variante client-owned (`transitionTaskStatusWithAudit` abre BEGIN/COMMIT próprio) — fatia 2.
- Estado IMPLEMENTED_LOCAL só nesta evidência; SPEC intacta.
