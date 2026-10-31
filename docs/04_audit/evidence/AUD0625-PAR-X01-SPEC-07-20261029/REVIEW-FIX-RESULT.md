# PAR-X01, correção dos achados F1-F4 da revisão independente (Codex, retorno 21601)

Task `AUD0625-PAR-X01-SPEC-07-20261029` (Claude Sonnet 5.5, sessão 07), 30/10/2026. Base: `f6236c0c4`. Revisão: `AUD0625-REVIEW-X01-F3F4-CODEX-20261029/REVIEW.md` (commit `6172cd6c9`, CHANGES_REQUESTED, F1-F3 P2 e F4 P3). Cada achado entrou primeiro como teste RED (9 falhas por assertiva, 0 por ambiente), depois a correção, depois mutantes. Sem push. SPEC 0286 e recibo 19 não foram editados.

## F1 (P2): a guarda I1 passa a ser sintática

`tests/par-x01-spawn-boundary.test.ts` deixa de usar regex sobre o texto e analisa cada arquivo com o compilador do TypeScript (`typescript`, já dependência do repositório). Qualquer literal de cadeia ou de template sem substituição igual a `child_process`, `node:child_process` ou `execa` é um sítio de criação de processo, **onde quer que apareça**: `from`, `import()`, `require()`, `import x = require()`, `export … from`, `process.getBuiltinModule()` com colchetes ou ponto, `createRequire()(…)`, com comentários no meio. `Bun.spawn`, `Bun.spawnSync` e `Bun['spawn']` seguem detectados por acesso à propriedade. Comentários nunca geram literal, então a menção em comentário não é falso positivo, nem o identificador `child_process` nem a cadeia `child_processing`.

Limite declarado: um nome montado em tempo de execução (`'child_' + 'process'`) não é visível a uma varredura estática; o serviço segue o único caminho revisado e a revisão continua olhando importações nativas novas. O inventário real (`packages/**`, `apps/**`) não mudou: só `capabilities.ts` e `service.ts`.

## F2 (P2): `outputOverflow: 'drop'` só para o shell oneshot

`checkRequest` recusa `drop` com `invalid_request` antes de qualquer lançamento quando o consumidor não é `shell` ou o modo não é `oneshot`. O padrão continua `terminate`; o oráculo legado de truncamento (pdsh-011) e o adaptador `runContained` seguem verdes.

## F3 (P2): teto efetivo da fila persistente, decisão explícita da I8

A fila persistente agora tem **teto duro**: os streams ficam em modo pausado e são lidos com `read()`; um bloco maior que o espaço restante é cortado no teto e o resto volta ao buffer do próprio stream (`unshift`), sem cópia além do teto e sem perda. Com `maxOutputBytes: 4` e um bloco de 65.536 bytes, nenhum pedaço entregue passa de 4 bytes e os 65.536 chegam inteiros ao leitor.

**Decisão registrada (para o DF levar ao registro do recibo 19, sem editar a SPEC):** no modo persistente a saída não é retida, então o teto é o da **fila**, não um teto cumulativo por stream. Um servidor persistente (MCP, LSP) emite bytes ao longo de toda a vida e morreria na primeira rodada de saída se o teto fosse cumulativo. O excesso se resolve por **backpressure**: um leitor parado segura o payload até o fim do prazo `lifetimeMs` (I7), que encerra com `timeout`, `truncated: false` e limpeza provada. `output_limit` e `truncated` continuam sendo do oneshot, onde a saída é retida. O teste "decisão" fixa esse comportamento. Se o Ricardo preferir um teto cumulativo ou um prazo de leitor parado, é uma decisão nova da SPEC.

## F4 (P3): o iterador é terminal depois de `return()`

`return()` resolve na hora todos os `next()` pendentes com `done: true` e um `next()` posterior também; o processo segue até `stop`/`dispose`/prazo.

## Verificação

| Gate | Resultado |
| --- | --- |
| RED antes da correção | 9 falhas por assertiva (6 F1, F2, F3, F4); o teste de decisão do F3 e os negativos do F1 já passavam |
| X01 (persistente, fronteira, serviço, RED) + `packages/sandbox` | 276/276 |
| 20 arquivos de teste que citam o sandbox (oráculos pdsh, F02, F05) | 323/323 |
| typecheck, eslint, prettier | 0 / limpos |
| mutação (`mutate-x5.py`, `mutations-x5.json`) | 13/13 mortos: F1 (4), F2 (3), F3 (4), F4 (2) |
