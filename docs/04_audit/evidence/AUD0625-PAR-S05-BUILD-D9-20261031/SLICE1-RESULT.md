# PAR-S05 fatia 1 — contratos, listagem e rastreio puros (SPEC 0295 R2 §6)

Autor: Claude D9. Branch `claude/aud0625-par-s05-build-d9` sobre a onda 5 `ca2c996cb` (+ SPEC 0295 R2 por cherry-pick). Receitas do Ricardo: D1–D8 como recomendado no recibo human-decisions-27.

## O que entrou

- `packages/contracts/src/session-query.ts`: `SessionQuery` (`list`, `trace`), `SessionListFilter`, `SessionSummary`, `SessionListPage`, `SessionDirectory` (a janela de candidatos), `TraceRoot`/`TraceLink`/`TraceGap`/`SessionTrace`, as portas `ApprovalReadPort` e `EffectJournalReadPort` e os códigos de erro.
- `packages/harness/src/session/query-cursor.ts`: filtro canônico (`{}` = `undefined`; chaves desconhecidas, tipos, tamanhos, NUL e faixa invertida recusados), `limit` (padrão 50, 1..100), cursor `{f,k,t,v}` em JSON canônico e `base64url` (recusa tudo o que não for exatamente a codificação canônica da posição, do filtro e do tenant desta requisição; posição positiva e inteira segura), `matchesSessionFilter` (`createdAfter` inclusivo, `createdBefore` exclusivo).
- `packages/harness/src/session/query.ts`: `createSessionQuery({tenantId, directory, events?, approvals?, effects?, clock?, monotonicMs?, budgets?})`.
  - `list`: pede ao diretório uma janela de 1000 candidatos abaixo do cursor **antes do filtro**; o cursor de uma página preenchida é o último candidato examinado, o de uma janela cheia sem preencher também; uma janela curta toda percorrida (ou preenchida no último candidato) termina com `nextCursor: null`; `examined` e `skippedUnadopted` são da janela.
  - `trace`: uma raiz (`approvalId` ou `operationKey`); aprovações candidatas (até 10, a 11ª só detecta o excesso), efeito, e eventos do log (sessões de `originSessionId` primeiro, depois a listagem, mais nova primeiro). Elos ordenados (`approval`, `effect`, `event` por sessão e sequência), lacunas tipadas sem duplicata, `observed` por fonte, `truncated`. Orçamentos globais: 20 sessões, 5000 eventos, 4 MiB em bytes UTF-8 (`Buffer.byteLength`), 30 leituras, 5 s, 100 elos; o evento que cruzaria o teto de bytes não é examinado nem vira elo. Matriz de erros: raiz ausente/alheia = `not_found` (mesma mensagem), fonte da raiz falha = `unavailable` (mensagem fixa, nunca o erro bruto), fonte secundária falha = lacuna `source_unavailable`, aborto = rejeição com a razão do sinal e nunca lacuna, fontes não compostas = `unsupported`.
- `packages/harness/src/session/query-memory.ts`: `InMemorySessionDirectory`.

## Provas

- `tests/aud0625-par-s05-slice1.test.ts`: 95 casos. Listagem sem buraco nem repetição em seis limites, o exemplo corrigido da R2 (2001 candidatos com o único match no 1500º: página vazia com cursor, página com o item, página final vazia e nula), janela cheia, desadotados, todas as chaves do filtro, 30 recusas de cursor e filtro (incluindo a posição trocada com os digests mantidos, que é aceita e só muda o início, como decidido no D4), trace feliz por aprovação e por chave, a matriz de erros, ambiguidade/divergência/herança/resultado ambíguo, os seis orçamentos e a contagem em bytes (ASCII na fronteira, multibyte `漢`/`😀` onde `.length` passa e os bytes não, evento maior que o orçamento inteiro), só o tenant da composição chega às portas.
- Cobertura 100% por arquivo em `query.ts`, `query-cursor.ts` e `query-memory.ts`.
- Mutantes: 47 (`mutations-slice1.json`): 46 mortos, 1 equivalente declarado (C10, o teto de 512 caracteres, coberto pela comparação canônica). Oito sobreviveram na primeira passada: três verificações do cursor eram redundantes com a comparação canônica e foram **removidas**; uma troca de mutante era equivalente; e dois casos exigiram testes novos (aborto na última leitura, ordem dos elos entre sessões).
- typecheck, eslint, prettier, links: ver o commit.

## Limites

`inherited` só é conhecido para sessões que a listagem devolveu (o resumo traz o `inheritedEventCount`); uma sessão só apontada por `originSessionId` e nunca listada dentro dos orçamentos fica com `inherited: false`. A origem da 0291 (`originSessionId`) depende da porta de leitura da fatia 3; sem ela as aprovações saem com a lacuna `origin_unbound`. O RED do SDK (`aud0625-par-s05-red.test.ts`) continua `it.fails` até a fatia 4.
