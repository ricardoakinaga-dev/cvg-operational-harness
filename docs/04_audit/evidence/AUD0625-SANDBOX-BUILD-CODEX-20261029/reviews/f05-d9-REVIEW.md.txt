# Revisão independente — F05 / SPEC 0276 (fio cooperativo do cancelamento ao shell), commit `3e1602f49`

Revisora: sessão Claude D9. Revisão do **commit** `3e1602f497bd6263350f0bab5966e6698f792543` (diff `e6a701ca9..3e1602f49`, branch `codex/aud0625-sandbox-build-20261029`) numa cópia detached; a working tree do Codex (que está no F02) não foi tocada. Node 22.23.2, `--maxWorkers=2`, carga 9–11, sem PG/Docker. Sem push. Produção segue `NO_GO`; esta revisão não fecha o F05 global, o K08 nem o X01.

## Veredito: APPROVE (sem obrigatórios; 1 P3 de teste e 3 observações)

O código faz o recorte autorizado e **não promete mais do que ele**: o mesmo `signal` chega ao runner injetado e ao default, o pré-abort recusa antes de lançar, e uma conclusão depois do abort vira `FAILED` com `effect_uncertain: cleanup_incomplete after cancellation`, sem sucesso e sem retry. Não há união `cancelled`, não há abort em voo no `runContained`, nenhum listener foi criado e nenhum timer novo foi acrescentado.

## Foco pedido

1. **O mesmo `signal` ao runner injetado e ao default.** `shell-tool.ts` passa `...(signal ? { signal } : {})` ao runner; o runner default repassa `request.signal` a `runContained`. Os testes comparam por identidade (`toBe(controller.signal)`) e o seam default é observado por um double do módulo. Mutações mortas: runner injetado sem signal (X1), default sem signal (X2), signal clonado com `AbortSignal.any` (X8).
2. **Pré-abort recusa antes de lançar.** Três camadas: o shell confere na entrada (`REJECTED command_cancelled_before_launch`) e de novo logo antes de chamar o runner (nenhum `await` entre a conferência e a chamada), e `runContained` devolve `spawn_failed` com a causa estável antes de montar o `bwrap`. Cada camada sozinha é redundante (X3, X4 sobrevivem), mas **sem as duas do shell, ou sem as três, os testes morrem** (X3+X4, X3+X4+X10: 2 falhas), e sem a do backend morre (X10). Causa renomeada (X7) e pré-abort virando `FAILED` em vez de `REJECTED` (X9) morrem.
3. **Conclusão tardia nunca vira sucesso nem retry.** Depois do runner, `signal.aborted` ⇒ `FAILED effect_uncertain: cleanup_incomplete after cancellation`, também quando o runner lança depois do abort (a mensagem do erro não é ecoada). Mutações: deixar o sucesso tardio passar (X5) e repetir o runner (X12) morrem (2 falhas cada). A sonda ([probe-out.txt](proofs/probe-out.txt)) mostra: abort e retorno ⇒ `FAILED` uncertain; abort e lançamento ⇒ `FAILED` uncertain; um sinal que muda na 3ª leitura ⇒ runner chamado **uma** vez e `FAILED` uncertain.
4. **Listeners.** A sonda mostra `getEventListeners(signal, 'abort') = 0` em todos os caminhos (normal, abort e retorno, abort e lançamento, lançamento sem abort): o código **não assina** o sinal, só lê `aborted`. Logo a cláusula "listeners sem vazamento" (F05-D) não tem o que vazar, e a SPEC §3 (backend que "assina abort") não foi entregue, como o `F05-RESULT.md` já admite. A mutação que acrescenta um listener sem remoção (X11) **sobrevive**: nenhum teste conta listeners (P3).
5. **Fronteira.** `runContained` ganhou só o campo `signal` com o comentário "in-flight tree supervision belongs to X01" e a recusa de pré-abort; `ShellRunResult` e `ContainedRunResult` não mudaram, então não existe `cancelled`/`cleanup_incomplete` como valor do runner, apenas a causa textual no `FAILED` do shell. Nada de timers, advisory, lease ou K08 foi tocado. Controle: chamador sem `signal` preserva o request exato (sem a chave `signal`).

## Testes

Os arquivos do F05 (`aud0625-shell-cancellation-red`, `aud0625-contained-preabort`, `aud0625-shell-default-signal`) mais `pare100-shell-handle` e `pdsh-011-sandbox-local`: **5 arquivos, 47 testes passam** ([base-tests.txt](proofs/base-tests.txt)). 12 mutações próprias + 2 combinadas: 9 mortas isoladamente, 4 sobrevivem (X3, X4, X6, X11), as duas combinadas morrem ([mutations.txt](proofs/mutations.txt)).

## P3 (teste)

- **X6:** nenhum teste cobre "o runner lança depois do abort". Sem o ramo do `catch` (que devolve `effect_uncertain`), o shell responderia `shell runner failed: <mensagem>` e perderia a marca de incerteza, e **todos os testes passam**. Um caso com `abort()` seguido de `throw` no runner fixa o ramo. A sonda mostra o comportamento atual correto.
- X11 (e F05-D): um teste que conte `getEventListeners` depois dos quatro caminhos protegeria a promessa "sem listener" quando o supervisor de verdade (X01) for composto.

## Observações (não bloqueiam)

- **O1:** se o abort cai entre a última conferência do shell e a recusa do backend, o `runContained` recusa o lançamento (`spawn_failed`), mas o shell, que vê `aborted` depois do retorno, responde `effect_uncertain: cleanup_incomplete`. É conservador (diz "incerto" mesmo sabendo que nada partiu), não perigoso.
- **O2:** um comando que terminou com sucesso antes do abort, mas cujo abort chega antes de o shell ler o resultado, também vira `FAILED` uncertain. Segue o §5 da SPEC ("aborto já observado impede sucesso tardio").
- **O3:** o abort em voo não encurta nada: o shell só devolve quando o runner devolve (até o timeout existente). É o limite explícito; só vale não vender isso como "cancelamento" ao chamador.
- Fora do F05, e anterior a ele: quando o runner lança sem abort, o texto da exceção vai para o `error` do resultado (`shell runner failed: boom ...`).

Pode seguir para o F02. Nada aqui exige correção do Codex.
