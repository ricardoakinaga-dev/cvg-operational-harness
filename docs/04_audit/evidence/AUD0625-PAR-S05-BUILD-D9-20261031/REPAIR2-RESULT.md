# Reparo da 0295 após as re-revisões da Codex (F02, F07, F08, F09)

Sobre `d5f1e5e20`, branch `claude/aud0625-par-s05-build-d9`. Relatórios: `AUD0625-REVIEW-0295-S1-CODEX-20261031/{revision-s123,revision-r1,revision-s4}/REVIEW.md`. Os oráculos da Codex entram como regressão; cada teste novo foi visto falhar contra `d5f1e5e20` (SDK: 14 de 15 em RED; PG: 2 em RED; harness: 3 de 5 em RED).

| Achado | Reparo | Prova |
| ------ | ------ | ----- |
| F02 (aborto) | `readOnly` confere o sinal logo após o lease (antes de qualquer instrução) e depois da leitura (antes do COMMIT); `trace` confere o sinal antes de classificar ausência da raiz | PG real: o aborto durante o lease cancela as três portas e nada é enviado ao banco; leitura que termina depois do aborto não é entregue; harness: raiz vazia com aborto rejeita com a razão do sinal, sem o aborto é `not_found` |
| F07 (herança) | a herança é decidida depois da varredura, com os summaries já carregados; corte desconhecido nunca vira 0: é lacuna `source_unavailable` do session e as cópias não contam como candidatas originais | filho de fork com origem: cópias `inherited:true` no filho, originais `false` no pai, sem `multiple_event_candidates`; filho fora da listagem: lacuna |
| F08 (projeção) | o servidor projeta `session.list` e `session.trace` por lista branca em todos os níveis; o cliente recusa qualquer campo fora da lista (resultado, item, raiz, elo, lacuna, subject) | canário sintético da Codex por stdio real (list e trace) não chega ao fio nem ao chamador; 6 respostas com campo proibido recusadas |
| F09 (consistência) | o cliente exige `items + skippedUnadopted ≤ examined` e `budget_exhausted` com subject de dimensão real (`sessions|events|bytes|calls|deadline|links`) | 2 contabilidades impossíveis e 2 gaps sem dimensão recusados; controles positivos aceitos |

Gates: typecheck, eslint, prettier; cobertura 100% por arquivo em `query.ts` e `trace-read-ports.ts` (suítes S1, S3 PG, diretório PG, SDK, harness); mutantes em `mutations-repair2.json` / `mutation-results-repair2.json`: 12/12 mortos (P1 sobreviveu na primeira passada e morreu depois de o teste exigir que nada seja enviado após o aborto do lease). Os nomes `*-repair.json` são do reparo F01–F06 e não foram alterados.

Fora do escopo, por ordem da DF: o pin Python de `contracts.ts` (resolvido na integração da onda 7). O P3 do cache negativo da coluna de origem segue como limite declarado.
