# DISCOVERY — PAR-X01, serviço único de subprocesso

Task `AUD0625-PAR-X01-SPEC-07-20261029` (Claude Sonnet 5.5, sessão 07), 29/10/2026, base `claude/aud0625-wave3` @ `834393633`. Só leitura de código e docs, mais um experimento descartável com bubblewrap próprio (`probe-pidns-membership.mjs`, saída ao lado) e os testes RED `tests/aud0625-par-x01-red.test.ts`. Sem dado real, sem rede, sem Docker.

## O que existe hoje

| Fato | Onde | Consequência |
| --- | --- | --- |
| Há **um** spawn de produto em `packages/` e `apps/`: `spawn(launch.executable, …)` em `runContained`. Único chamador: o shell tool. Não há código de MCP stdio, LSP, conversão de documentos nem hooks com subprocesso. | `packages/sandbox/src/run.ts:120`, `shell-tool.ts:171` | O serviço pode nascer antes dos consumidores: a regra "só o serviço cria processo" ainda é barata de impor. |
| `scripts/` tem ~35 arquivos com `child_process` (CI, build, smoke). | `scripts/**` | Fora do escopo: não são caminho de produto nem recebem entrada de modelo. Ficam sob a guarda de fronteira apenas para `packages/` e `apps/`. |
| O abort só vale **antes** do launch. Depois do spawn não há listener; o shell responde `effect_uncertain: cleanup_incomplete`. | `run.ts:65,111`; `shell-tool.ts:345-362`; SPEC 0276 | RED `abort após launch`: o runner só volta no timeout (6164 ms contra 3000 ms de orçamento). |
| Timeout mata só o pid do `bwrap` com SIGKILL; os descendentes morrem pelo kernel (`--unshare-pid`, `--die-with-parent`). | `run.ts:~140` | Funciona (controles verdes: árvore some depois de timeout e de saída normal), mas ninguém **observa** isso. |
| O resultado não carrega prova de limpeza: `exitCode`, `stdout`, `stderr`, `truncated`. | `ContainedRunResult` | RED `cleanup observado`. |
| `spawn_failed` por stderr começando com `bwrap:`. O payload escreve esse texto e o runner o trata como falha de contenção. | `run.ts` (handler de `close`) | RED `exit status forjado`: payload com `exit(3)` devolve `spawn_failed`. Em sentido inverso, uma falha real de setup que não imprima o prefixo passa por saída normal. |
| Ambiente do filho: fixo (`LANG`, `LC_ALL`, `TZ`, mais `HOME=/tmp`, `TMPDIR=/tmp`, `PATH=''`, `PWD`), `--clearenv`, sem spread de `process.env`. Mas **não existe API de allowlist**: um consumidor futuro (MCP precisa de credenciais estreitas, LSP de `PATH`) não tem como pedir variáveis. A sonda de capacidade (`execFileSync('bwrap', …)`) herda `process.env`. | `process-profile.ts:58-62,398-413`; `capabilities.ts:51` | Falta o contrato, não o comportamento atual. |
| Sem modo persistente (stdin aberto até o dispose), sem `wait`/`stop`/`dispose` próprios, sem teto de stdin. | — | RED `createProcessService`. |
| Nada verifica a árvore por `/proc`. | — | A exigência do cartão (0380 l.257) hoje só tem os testes F02 de fd e de leitura. |
| `bwrap 0.9.0` instalado oferece `--json-status-fd` e `--info-fd`. | `bwrap --help` | Canal privado de status, que o payload não escreve. |

## Experimento (descartável, próprio)

`bwrap --unshare-pid --die-with-parent --json-status-fd 3`, com um processo, um filho em segundo plano e um neto com `setsid` (grupo diferente).

- O primeiro documento do fd 3 traz `child-pid`, `mnt-namespace` e **`pid-namespace`** (o inode). Um segundo documento com `exit-code` chega quando o init sai por conta própria (visto numa primeira execução da sonda; no recorte salvo o init foi morto por SIGKILL e só o primeiro documento aparece).
- Varredura do host em `/proc/*/ns/pid` comparada a `pid:[<inode>]` encontrou os 3 membros, **inclusive o neto em outra sessão/grupo**. Depois de `kill(-pgid, SIGKILL)` e `close` do bwrap, a varredura voltou vazia em 10 ms.
- Conclusão: pertencimento ao namespace é uma prova de `/proc` independente de pid reutilizado e de ancestralidade, e o status privado dispensa ler o stderr do payload. Isso sustenta o nível A da SPEC 0286 sem cgroup delegado.

## Prior art lido

- `CORE-X01-MECHANISM-81C4` (DECISION.md): mecanismo **proposto**, não adotado: cgroup v2 próprio, `clone3`/pidfd, guardião PID1, deadlines nativos (XM01–XM17 NOT_RUN). Exige helper nativo e delegação de cgroup que o host e a imagem atuais não demonstram.
- SPECs 0275 (F02, perfil e ambiente), 0276 (F05, abort do shell; deixa descendentes, reap e stdio para X01), 0277, 0196 (base do sandbox local). Revisões F02/F05 do D9 e do Codex.
- Testes existentes: `aud0625-process-profile*.test.ts` (perfil, fd), `aud0625-process-containment-red.test.ts` (filesystem e ambiente), `aud0625-contained-preabort.test.ts`, `aud0625-shell-*.test.ts` (só pré-abort).

## O que a DISCOVERY não encontrou

Nenhum vazamento de descendentes reproduzido no runner atual (consistente com a baseline do 81C4). O problema é de **contrato e observação**: abort em voo sem efeito, status de contenção forjável, ausência de ambiente por allowlist, de modo persistente, de dispose e de prova de limpeza.
