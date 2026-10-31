# PAR-S05 fatia 4 — `session.list` e `session.trace` no SDK (SPEC 0295 §3, D7, D8)

Branch `claude/aud0625-par-s05-build-d9`, sobre o reparo `855e20f4c`.

- `SDK_METHODS` ganha `session.list` e `session.trace` no fim; `SDK_PROTOCOL_VERSION` continua 1 (aditivo, D7).
- `SdkServerOptions.sessionQuery`: a porta ligada pelo host a um tenant já validado (D8); o SDK não a expõe a transporte por conta própria. `sdk.hello` anuncia o par só com a porta; sem ela os dois métodos respondem `capability_not_available`.
- Parâmetros estritos (chaves desconhecidas recusadas), validados antes de tocar a porta com as regras puras do harness: filtro canônico (inclui filtro invertido), `limit` 1..100 (default 50 pela porta), cursor 1..512 decodificado contra filtro e tenant (cursor forjado ou de outro filtro = `invalid_params`), raiz do trace exatamente uma, 1..4096, sem NUL.
- Erro da porta mapeado só pelo `code` (nunca pelo texto): `invalid_params`/`invalid_cursor` → `invalid_params`; `not_found` → `session_not_found` (raiz alheia e ausente idênticas); `unsupported` → `capability_not_available`; `unavailable` e qualquer outra falha → `internal_error` de mensagem fixa.
- Cliente: `listSessions(params?)` e `traceSession(params)`, com validação do resultado (itens ≤ limite, sem repetição, dentro do filtro, cursor ≤ 512, `examined` ≤ 1000, `skippedUnadopted` ≤ `examined`; trace com raiz igual à pedida, ≤ 100 elos de tipos conhecidos, lacunas de razão conhecida, `observed` só de fontes conhecidas com data válida, `truncated` ⇔ lacuna `budget_exhausted`). `sdk.hello` exige o par junto.
- Os `it.fails` RED-1..10 de `aud0625-par-s05-red.test.ts` viraram asserções (nenhuma mudou); o controle do vocabulário passou a fixar os seis métodos. `pdsh-023-sdk.test.ts` passou a esperar os quatro métodos de uma composição sem a porta (antes comparava com `SDK_METHODS` inteiro).

**Desvio declarado da SPEC (§6.4 "cliente v1 antigo ignora métodos novos").** O validador de `sdk.hello` do cliente existente recusa nome de método desconhecido (teste `stdio-validators` "rejects hello unknown method" o fixa), então um cliente v1 anterior a esta fatia recusa o `hello` de uma composição que anuncia `session.list`/`session.trace`. Não afrouxei esse teste: o par só é anunciado com a porta, e uma composição sem a porta continua compatível com clientes antigos. Se a 07 quiser que clientes antigos ignorem nomes novos, é uma mudança do validador do cliente (e do teste fixado), fora desta fatia.

Gates: typecheck, eslint, prettier; 181 testes do SDK passam (57 nos arquivos desta fatia); cobertura das linhas novas completa (as não cobertas de `server.ts`, `validators.ts` e `stdio.ts` são anteriores); mutantes 13/13 mortos (`mutations-slice4.json`). Produção NO_GO; dados sintéticos.
