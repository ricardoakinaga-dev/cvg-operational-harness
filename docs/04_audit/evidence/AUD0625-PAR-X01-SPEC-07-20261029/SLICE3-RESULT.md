# PAR-X01 fatia 3 — `runContained` como adaptador fino e guarda de fronteira

Base: fatias 1–2 aprovadas. Código: `packages/sandbox/src/run.ts`, `shell-tool.ts`, `capabilities.ts`; teste `tests/par-x01-spawn-boundary.test.ts`.

## O que mudou

- `runContained` mantém as recusas de antes do launch (abort prévio, `allowSubprocess`, argv vazio, cwd) e delega o resto ao `launch(oneshot)` do serviço (um serviço por `bwrapPath`, até 64 lançamentos). `exitCode` agora vem do canal privado:
  - `exit` → código do payload; `timeout` → `'timeout'`; `cancelled`/`dispose` → `'cancelled'` (novo); qualquer falha de contenção ou do launcher (`spawn_failed`, `startup_timeout`, `signal`) → `'spawn_failed'`, com o motivo do launcher no `stderr` quando o payload não escreveu nada. O texto do payload nunca mais classifica a contenção.
  - O resultado ganha `cause` e `cleanup` (aditivos).
  - Abort em voo, que antes era ignorado, agora derruba a árvore e devolve em tempo curto.
- O shell trata `'cancelled'` como efeito incerto (`effect_uncertain`), como já tratava o abort do chamador. A SPEC 0276 continua valendo: cancelamento não vira sucesso nem "limpeza provada" para o modelo.
- `outputOverflow: 'drop'` (campo novo do pedido ao serviço, **extensão da SPEC 0286 I8**): o shell sempre descartou o excesso e seguiu, e o oráculo `truncates output at the byte cap` exige `exitCode 0` com `truncated`. O padrão do serviço continua `terminate` (`output_limit`); só o adaptador usa `drop`. Registro para o DF.
- A sonda de capacidade (`capabilities.ts`) é uma das duas exceções nomeadas da guarda: ela roda antes de existir perfil revisado, então não pode passar pelo serviço (o serviço exige perfil). Em vez de migrá-la, ganhou `env: {}` e `cwd: '/'`. **Desvio do I1 como escrito** (a SPEC previa migrá-la); a outra exceção é o próprio `service.ts`.
- Guarda I1 (`tests/par-x01-spawn-boundary.test.ts`): varre `packages/**` e `apps/**` por `child_process` (import estático, require, import dinâmico, `Bun.spawn(Sync)`, `execa`), ignorando `__tests__`, `*.test.*`, `tests/`, `dist`, `node_modules` e `scripts/**` (decisão X-F). O repositório hoje tem exatamente dois sítios: `service.ts` e `capabilities.ts`.

## Os três RED de fase 1 ficaram verdes

Abort após o launch (de 6164 ms para uma devolução em segundos, `cause: cancelled`, árvore vazia), exit status do payload que imprime `bwrap:` (agora 3, não `spawn_failed`) e `cleanup` observado no resultado. Os `it.fails` foram removidos, sem afrouxar nenhuma asserção.

## Provas

- RED agora verdes (6), guarda (10 testes, inclui o scanner), shell (+1: `cancelled`), oráculos F02/F05/preabort/containment/pdsh-011/012/013 inalterados e verdes (273 + os novos).
- Mutação (`mutate-x.py s3`): 19 mutantes, 19 mortos. Três sobreviveram na 1ª rodada e viraram testes: o mapeamento `cancelled` do adaptador, a mensagem quando o serviço recusa o pedido, e o ambiente da sonda. O último achou uma regressão minha: com `env: {}` o `bwrap` deixava de ser procurado no `PATH` do chamador; a sonda agora repassa só o `PATH`.
