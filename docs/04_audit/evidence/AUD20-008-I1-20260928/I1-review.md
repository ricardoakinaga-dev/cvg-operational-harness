# AUD20-008 — I1 novo no candidato congelado — 28/09/2026

- Revisor independente Hypatia, somente leitura, sem contexto da
  implementação. O texto registra o parecer retornado pelo revisor; ele
  não editou este arquivo nem executou testes.
- Alvo: [packet](packet.json) do SHA de fonte
  `7ef74e7f4fd2b1141e416b85c7337f119e1333ab`, candidato
  `47440863ddc96bcfc915e5d601ca7fd6badb9642fae25b844857e49d7f685348`,
  run `run-pr003-composite-r2-20260928` e bundle PR003 arquivado.
- Veredito: **`APPROVE` para o critério de lease fencing de AUD20-008
  neste candidato isolado**, sem P0/P1. Não é aprovação do run histórico
  `579d2100`, do SHA raiz atual ou de produção.

## Evidência observada pelo revisor

- `packet.sha256` confere; bundle e seus 38 artefatos conferem. Os 1.503
  registros do manifesto do candidato coincidem com o worktree limpo.
- Em memória, `commit` e `release` exigem chave, geração e token da reserva
  ativa. Em PostgreSQL, essas mutações condicionam a alteração aos mesmos
  campos. A retomada testada rejeita holder antigo, permite confirmação pelo
  sucessor e preserva negação de replay.
- JSONs e logs congelados mostram `webhook-security.test.ts` 16/16,
  `postgres-persistence-mode.test.ts` 45/45,
  `postgres-migration-smoke.test.ts` 10/10 e a suíte PostgreSQL 261/261,
  zero skips. O revisor inspecionou essas evidências; não reexecutou testes.

## Achado residual e disposição

**P2 — preflight de constraints por nome.** `tenant-preflight.ts` exige os
nomes das constraints de fencing, mas não valida suas definições. Uma
constraint permissiva reimplantada com o mesmo nome passaria nesse teste
de catálogo. A migration e as transições do candidato revisado foram
conferidas, portanto o achado não invalida o I1 do comportamento examinado.
Corrigir sob gate de segurança próprio antes de confiar no preflight como
prova semântica do catálogo.

O sentinel final deve comparar os bytes após esta revisão com o packet.
`A21-F20` no registro de certificação existente ainda é `OPEN_INTERNAL`;
o parecer e o sentinel não reescrevem um run passado. Reemitir a
adjudicação/registro e a certificação do SHA final sob seus gates antes de
qualquer fechamento de release. Produção `NO_GO`.
