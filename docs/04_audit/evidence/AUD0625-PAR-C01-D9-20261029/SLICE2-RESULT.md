# PAR-C01 BUILD — fatia 2 (SPEC 0290): compactação por modelo com pins do anfitrião

Task `AUD0625-PAR-C01-D9-20261029`, branch `claude/aud0625-par-c01-d9`, sobre `75f8a9ffc` (fatia 1, aprovada). Recibo:
`receipts/human-decisions-22.json`. Local, sintético, sem push. Produção `NO_GO`.

## O que entrou

- `ModelCallPurpose` ganha `COMPACTION` (`packages/contracts/src/contracts.ts`).
- `packages/harness/src/model-compaction.ts` (novo, exportado pelo `index.ts`): `createModelCompactionControl`, `PinnedItem`/`PinnedItemsPort`
  (`approval`, `question`, `effect`, `fact`; ref e texto validados, ≤ 64 itens, texto ≤ 2000), `effectPin` (chave e estado, nunca o resultado),
  `renderPinned`, constantes.
- O controle só age acima do teto. Lê os pins da porta, compacta o prefixo antigo por uma chamada de `purpose: 'COMPACTION'` ao mesmo
  `ModelGateway` (entrada = só o prefixo, como dado; nem a instrução governada nem os pins vão ao resumidor), e envia
  `[system governado] + [pins como dado] + [resumo user com moldura] + [recentes]`.
- 1 pedido + 1 retentativa; falha, resumo vazio ou maior que 4000 caracteres contam como tentativa; custo acumulado ≤ min(10% do turno,
  `maxCostUsd` configurado); cada pedido consome o orçamento do turno (`beginModelRequest`/`recordModelResult`); resumo que deixa a vista acima
  do teto, prefixo vazio, pins inválidos ou porta que falha = `INSUFFICIENT_EVIDENCE` antes do modelo, sem evento.
- Cancelamento (depois dos pins, durante o pedido, pedido que falha) = `next()` sem evento; o pipeline encerra o turno sem request.
- `createSessionCompactionRecorder`: para `model-compaction-v1` o `eventId` é derivado de `(strategy, throughSequence, sourceDigest)`; um append
  que falha (conflito S01 ou identidade repetida) reusa o evento já existente com o mesmo trio, lendo o log paginado; sem correspondente, repropaga.
  Estratégia v1 inalterada (UUID, sem reuso).
- Resultado de auditoria ganha `pinnedDigest`, `model`, `usage` (opcionais).

## Respostas à observação do DF (só o anfitrião produz `system`)

Os únicos pontos que criam `system` no código são três composições do próprio runtime (`kernel-runtime.ts`, `iterative-dispatch.ts`,
`hybrid-orchestrator.ts`), todas de campos de configuração do agente; texto do usuário entra como `user`. Teste:
`never turns kernel-built or user text into a system message`. O resumidor e os pins nunca produzem `system`.

## Desvios declarados da SPEC (a decidir; nenhum bloqueia)

1. **Payload do evento**: continua com os 4 campos. `session-event-schemas.v1.json` é fechado e fingerprintado, com espelho em
   `packages/sdk/python`; acrescentar `pinnedDigest`/`model`/`usage` muda fingerprint, SDK Python e testes de evolução de formato. `pinnedDigest`,
   `model` e `usage` ficam no resultado entregue ao `onCompacted` (auditoria do anfitrião). Proposta: fatia própria se o Ricardo quiser o payload.
2. **Log do pedido de compactação**: o pedido é contabilizado no orçamento mas não vira `model/request` no log do kernel, porque o enum `purpose`
   do esquema de eventos também é fechado (`ORCHESTRATION|RESPONSE|EVALUATION|REPAIR`). Mesma decisão do item 1.
3. **Saída ≤ 2048 tokens**: `ModelRequest` não tem `maxTokens`; o limite é de 4000 caracteres no resumo (tentativa inválida acima disso).
4. **Prefixo maior que a janela**: recusa (opção `maxCompactionInputTokens`; sem ela o gateway recusa pela janela da C02), sem fatiar.
5. **Observação preexistente**: `throughSequence` é a posição na lista de mensagens da requisição, e o validador de sessão exige
   `throughSequence < sequence` do evento. O anfitrião precisa mapear para a sequência real do log; sem isso, uma sessão curta rejeita o evento.
6. **Pins**: um único bloco `user` com moldura de dado (não `system`).

## Gates

- harness+gateway+orchestrator+contracts: 62 arquivos / 962 testes passam; 1 `it.fails` esperado (retry de overflow, fatia 3).
- Cobertura por arquivo (`CVG_COVERAGE_PER_FILE=1`, include nos dois arquivos): `compaction.ts` e `model-compaction.ts` em 100%.
- Mutantes `mutations-slice2.json`: 26/26 mortos (`mutation-results-slice2.json`); os 8 da fatia 1 seguem mortos.
- typecheck, eslint, prettier, `skip:governance` verdes.
