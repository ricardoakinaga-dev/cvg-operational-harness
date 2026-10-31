# Fecho do F07 da 0295 (re-revisão da Codex sobre 6c723eea3)

Sobre `6c723eea3`, branch `claude/aud0625-par-s05-build-d9`. Parecer: `AUD0625-REVIEW-0295-S1-CODEX-20261031/revision-repair2/REVIEW.md`. Disposição de planejamento da DF: um elo cuja herança não pode ser decidida **não é publicado**; a lacuna `source_unavailable{session}` responde por ele; `inherited` continua `boolean`, sem estado triplo e sem contador novo (o trace não tem contador de omitidos). Mais nada do reparo anterior mudou, e o P3 consultivo (aborto depois do COMMIT real) não foi tocado.

- `query.ts`: os elos de uma sessão sem corte conhecido (a pista de origem aponta para um filho de fork cujo summary não chegou: fora da listagem ou listagem indisponível) não entram em `links`; a lacuna fica, e a sessão continua fora de `multiple_event_candidates`. Com o corte conhecido nada muda.
- Teste: o oráculo da Codex como regressão (`aud0625-par-s05-unknown-cut.test.ts`: o controle de corte conhecido passa; o caso de corte desconhecido falha contra `6c723eea3` e passa agora); o teste antigo da falha de listagem passou a afirmar zero elos de evento mais a lacuna da sessão, em vez de três elos.
- Mutantes (`mutations-repair3.json`): publicar de novo, contar o desconhecido como candidato original e não registrar a lacuna: 3/3 mortos.

Gates: typecheck, eslint, prettier, links, `skip:governance`; harness/SDK/PG de trace verdes (109 + 210 testes).

Saída já declarada pela DF se a conferência final ainda achar algo: o trace deixa de seguir a pista de origem para dentro de filho de fork sem summary e devolve só a lacuna. Não haverá outra rodada.
