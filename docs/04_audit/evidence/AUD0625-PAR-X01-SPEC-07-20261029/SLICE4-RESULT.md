# PAR-X01 fatia 4 — modo persistente e `dispose` do serviço

Código: `packages/sandbox/src/process-service/service.ts`, `types.ts`; teste `tests/par-x01-process-persistent.test.ts`.

## O que faz

- **Persistente** (`mode: 'persistent'`, consumidores MCP stdio/LSP): `ProcessHandle` ganha `stdin` (`write`/`end`) e `output` (`AsyncIterable` de pedaços `stdout`/`stderr`, consumidor único). `stdin` é limitado em bytes **para o lançamento inteiro** (`maxStdinBytes`); escrita acima do teto, depois do `end` ou com valor que não é `Uint8Array` é recusada sem matar o processo. Stdin inicial não existe em persistente. O resultado não acumula `stdout`/`stderr`.
- **Backpressure** (I8, XP08): a fila de saída tem teto `maxOutputBytes`; ao chegar nele os streams do filho são pausados (o payload é segurado pelo próprio pipe) e retomam abaixo da metade. Consumidor que sai (`return()`) faz o serviço descartar o resto em vez de acumular. O teardown libera streams segurados, então uma saída parada não trava a limpeza. Em persistente `output_limit` não existe: o teto é de memória, o tempo continua limitado pelo `lifetimeMs`, que escrita, leitura ou keepalive não renovam (XP09).
- **`dispose()`** (I10): fecha a admissão (`service_closed`), manda toda a lista de lançamentos vivos pela mesma tarefa de limpeza com causa `dispose` e devolve `{stopped, clean, cleanupFailed}`; chamadas repetidas devolvem o mesmo relatório; `stop` e `dispose` concorrentes compartilham um resultado.
- **Namespace conhecido antes de matar** (correção achada pelo teste do `dispose`): um `stop`/`dispose` logo depois do launch matava o launcher antes do `child-pid` chegar e o resultado saía `clean` sem prova. A limpeza agora espera até 250 ms (dentro do `cleanupMs`) o documento de status; se ainda assim o namespace for desconhecido, o resultado é `cleanup_failed` (`namespace_unknown`), salvo o launcher que saiu sozinho sem nunca nomear filho (nada começou).

## Provas

- 15 testes persistentes/dispose em bubblewrap real (echo bidirecional, tetos de stdin, árvore com neto parada por `stop`, lifetime não renovado por saída nem por escrita, flood segurado e retomado, stop com saída segurada, consumidor que sai, dispose com dois lançamentos e árvore provada vazia, dispose vazio/repetido/concorrente, `cleanupFailed` separado) + 36 do motor (+1: stop logo após o launch fica `clean`).
- Mutação (`mutate-x.py s4`): 20 mutantes, 18 mortos, 2 equivalentes justificados (`pers-stdin-ended`: depois do `end` o stream já rejeita a escrita; `teardown-release`: o Node retoma stdio pausado na saída do filho, o `resume` explícito é defesa em profundidade).
