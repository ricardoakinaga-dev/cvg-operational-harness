# S02-REPAIR-F04 (07): checkpoint não canonicalizável reconstrói pelo log

Base `45bb0e6f0`; achado da Codex `e64384dcd` (P2 herdado: `projection-cache.ts` chamava o digest sem conter `CanonicalJsonError`).

## Correção
`judgeSessionCheckpoint` envolve `sessionProjectionStateDigest` em try/catch que recusa **só** `CanonicalJsonError`
('state is not canonical'): o `project` cai em `origin=rebuild, cache=invalid`. Qualquer outro erro propaga (não esconde falha real).
Teto antes do digest: o próprio `canonicalizeJson` é o orçamento (profundidade 64, 20.000 nós, falha rápida), então um estado hostil
custa uma caminhada limitada e nunca um hash completo; não foi preciso pré-checagem adicional nem relaxar o canonicalizador ou o teto SQL.

## Teste
`packages/persistence/src/__tests__/par-s02-repair-invalid-cache.test.ts`: oráculo da Codex (2 recusas puras profundidade/nós,
2 controles `hit`, 4 leituras PG cache/incremental x profundidade/nós) + 1 teste puro novo (erro que não é de canonicalização propaga).
RED contra `45bb0e6f0`: 6 falhas (2 puras, 4 PG), 2 controles verdes. GREEN: 9/9 com PG real; sem PG: 3 passam, 6 saltam (SKIP-PG-S02R-005).

## Mutantes na contenção
| mutante | resultado |
|---|---|
| aceitar o estado no erro de canonicalização | morto (6 falham) |
| remover o catch | morto (6) |
| `instanceof` sempre falso | morto (6) |
| engolir qualquer erro | morto pelo teste novo (inicialmente sobrevivia) |

## Gates
typecheck OK; eslint dos 2 arquivos OK; `skip:governance` e `mutation:guard` PASS (certification/ restaurado);
737 testes em 50 arquivos (`par-s02*`, `harness/src/session`, `harness/src/__tests__`) PASS com PG descartável. Sem push. Produção NO_GO.
