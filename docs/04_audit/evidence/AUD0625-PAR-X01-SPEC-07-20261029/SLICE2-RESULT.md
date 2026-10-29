# PAR-X01 fatia 2 — motor do serviço de subprocesso (oneshot)

Base: SPEC 0286 aprovada (recibo 19). Código: `packages/sandbox/src/process-service/service.ts` (+ `procfs.ts`, e dois ganchos aditivos em `process-profile.ts`: `statusFd` e `env`).

## O que faz

`createProcessService({envAllowlist, caps, maxConcurrent, bwrapPath})`; `launch(request)` oneshot:

1. Valida tudo antes de reservar slot ou criar processo (consumidor, modo, argv, limites, env, stdin). Persistente devolve `unavailable` até a fatia 4.
2. `prepareProcessLaunch` com `--json-status-fd` num fd fixo e o env já validado; o ambiente do perfil sempre prevalece sobre o do consumidor. Spawn `detached` (grupo próprio).
3. Supervisão: o status (`child-pid`, `pid-namespace`, `exit-code`) vem só do canal privado (I6); stdout/stderr são dado. Primeira causa imutável (`exit`, `signal`, `timeout`, `startup_timeout`, `cancelled`, `output_limit`, `spawn_failed`); uma só tarefa de limpeza por lançamento, compartilhada por `stop`, abort, expiração e saída espontânea.
4. Limpeza em degraus: pedido gracioso (SIGTERM) ao payload, durante `graceMs`; SIGKILL ao grupo e ao init do namespace, só com identidade conferida (`starttime`); espera do reap; varredura de `/proc/*/ns/pid` até esvaziar ou até `cleanupMs`, matando o que a varredura ainda vê (re-verificado antes de cada kill). `clean` exige launcher reaped, 0 membros e 0 não verificados; senão `cleanup_failed` com contagens e `secondaryErrors`.
5. Resultado com `profile: 'namespace-observed'` e `ownerIndependent: false`; `exitCode` só existe para saída voluntária.

## Descobertas do BUILD (registradas porque mudam o que a SPEC supunha)

- O init do namespace do bwrap é um reaper do próprio bwrap (pid 1), e o payload é filho dele. SIGTERM ao launcher derruba o payload sem aviso (`--die-with-parent`), e SIGTERM ao init é ignorado. O pedido gracioso vai então **aos filhos diretos do init**; o SIGKILL continua no grupo e no init.
- Processos do mesmo uid podem esconder `/proc/<pid>/ns/pid` (não dumpáveis), comuns num host ocupado. Tratar todo ilegível como "não verificado" tornava tudo `cleanup_failed` (6 casos medidos). A varredura agora os coloca pelo `NSpid` (profundidade ≥ 2) e pela descendência do init (cadeia de `PPid`); só o que não se consegue colocar fica não verificado. Um membro escondido que desce do init conta como membro e é morto.
- O payload só enxerga fds de Node dentro do sandbox; a prova de que ele não escreve no fd de status ficou na sonda crua (`probe-status-fd-closed.mjs`), não num teste com Node (o número do fd colide com fds internos do Node).

## Provas

- `tests/par-x01-process-service.test.ts`: 36 testes em bubblewrap real, três rodadas seguidas verdes. Cobre exit code via canal privado, stderr `bwrap:` forjado sem efeito, env fechado, recusas antes de criar nada (env fora da lista, nome proibido, `http_proxy`, limite ausente, consumidor, argv, stdin, persistente), pré-abort, slots, abort em voo (árvore de 3 processos), expiração, saída espontânea com 5 netos, rajada de 12 filhos `detached`, `output_limit`, convergência (stop+abort+expiração: um resultado, primeira causa, um único SIGTERM), graça, falhas de launcher (sem status, lixo no canal, sinal), `cleanup_failed` por membro teimoso e por namespace desconhecido, kill de membro visto pelo observador, identidade (starttime trocado não recebe sinal; controle com a mesma identidade recebe), erro de spawn.
- 87 testes das peças puras (inclui o novo fallback de `/proc`).
- Mutação (`mutate-x.py s2`): 36 mutantes, 35 mortos, 1 equivalente justificado (`preabort`). Sete sobreviveram/não aplicaram na 1ª rodada: padrões de mutante quebrados pelo prettier (2) e testes que faltavam (primeira causa, limpeza única, exit code só em saída voluntária, erro de spawn): viraram testes.
- RED: o teste de existência de `createProcessService` passou a verde (marcador removido); os 3 RED restantes (abort via `runContained`, status forjado via `runContained`, `cleanup` no resultado de `runContained`) continuam vermelhos até a fatia 3.
- typecheck, eslint e prettier limpos; testes do perfil F02, preabort, shell e sandbox existentes verdes.

## Limites

Persistente, `dispose` do serviço e a guarda de fronteira ficam para as fatias 3 e 4. `ownerIndependent: false`: se o Node dono pausar, os prazos pausam (XM17 não reivindicado). Não limita CPU, memória nem pids.
