# PAR-C03 — correções da revisão do DF às fatias 1 e 2 (P2 + P3)

Branch `claude/aud0625-par-c03-build-d9`, commit próprio antes da fatia 3. Local, sintético, sem push, produção `NO_GO`.

## P2 — fatias de leitura partiam caracteres UTF-8 (corrigido)

`read` agora alinha a janela a **ponto de código** com a função pura `alignUtf8Slice` (usada pelo depósito em memória e pelo PostgreSQL): um início que cai em byte de continuação avança até a próxima fronteira; um
fim que parte um caractere recua até o último inteiro (se nem um cabe, devolve esse caractere inteiro, para a leitura sempre progredir). `SpillSlice` ganhou `skippedBytes` (0 quando o offset já era fronteira);
`offset` é o início efetivo e `bytesRead` conta só pontos de código inteiros, então a próxima leitura continua em `offset + bytesRead`, exata. O PostgreSQL busca `length + 4` bytes para olhar além do fim.
Provas: remontagem exata de conteúdo com caracteres de 2, 3 e 4 bytes caindo nas fronteiras de 32 KiB (4 fatias), em vários tetos de leitura no depósito em memória, offset no meio de um caractere,
janela menor que o caractere. Mutantes C1–C6, C15 mortos.

## P3

- **(a) saída não serializável**: vira `[saída não serializável]` (`UNSERIALIZABLE_OUTPUT`) em vez de texto vazio. C10 morto.
- **(b) HMAC**: a entrada passa a ser `lengthPrefixed` (4 bytes de tamanho + bytes de cada campo). Como os campos já não podem conter NUL (`put` recusa campo vazio ou com NUL, antes só o tamanho era validado), a
  troca é defesa em profundidade; o mutante que volta ao separador NUL é **equivalente** com a validação ligada (declarado). Provas: injetividade do enquadramento, recusa de NUL (C8 morto).
- **(c) `SET LOCAL search_path = pg_catalog, <schema>`** em toda transação, como a S01; teste por gravação das consultas. C9 morto.
- **(d) o inline entrava sem moldura, e a montagem achata o texto.** Confirmado: o `HybridOrchestrator` monta o prompt de decisão com `- [fonte/tipo] <resumo>` por observação, unidas por quebra de linha, e **nem lê
  `contextItems`**; logo a prévia da fatia 1 não chegava a esse orquestrador, e um resultado com `\n- [TOOL/...]` podia imitar a linha de outro. Corrigido em duas partes: (1) o resultado que cabe também é emoldurado
  (`[resultado de ferramenta:<marcador>] ferramenta=… bytes=… sha256=…`, delimitadores `--- início/fim:<marcador> ---`), com teste de conteúdo hostil que reproduz cabeçalho e delimitadores; (2) o prompt do
  `HybridOrchestrator` usa `rendering.text` (via `renderedObservationText`, novo em harness-contracts, também usado pelo motor de contexto) **somente enquanto o motor de contexto manteve o item** dentro do orçamento
  dele; se o item foi descartado, cai no `summary` marcado de 300 caracteres. Assim a pressão de tokens não explode no orquestrador. C11–C14 mortos.
- **(e) `wrote` conta o `put` idempotente na cota do turno**: lado conservador, registrado, sem mudança.

## Gates

- harness+contracts+orchestrator: 763 testes (+3 `it.fails` esperados da fatia 3 e 4); cobertura por arquivo 100% em `contracts/src/{spill,observation-text}.ts`, `harness/src/spill/*`, `harness/src/context-engine.ts`,
  `orchestrator/src/hybrid-orchestrator.ts`. PostgreSQL 16.15 descartável: 21/21 (`SKIP-PG-C03-001` agora com 21 pulados e `sourceSha256` reatado). `packages` + `apps`: 4260 verdes.
- Mutantes `mutations-slice2-review.json`: 15/15 mortos (C4 precisou de ajuste de texto do mutante, não de teste novo).
- typecheck, eslint, prettier, `docs:check-links`, `skip:governance`.

## Observação para a revisão

Os 3 `it.fails` que restam seguem a ordem da SPEC: `spill.read` e a estabilidade/poda do prefixo (fatias 3 e 4). A mudança do prompt do `HybridOrchestrator` é a única que toca outro pacote além de contracts/harness/persistence.
