# SPEC0286 — Serviço único de subprocesso e ambiente do filho (PAR-X01)

R0, 29/10/2026. Task `AUD0625-PAR-X01-SPEC-07-20261029` (Claude Sonnet 5.5, sessão 07), cartão PAR-X01 ([0380](../03_build/0380_backlog_paridade_100_deepseek.md) l.257; P0, relevância hospitalar alta). Estado `PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: muda a fronteira de execução de código externo. **Sem BUILD até revisão humana explícita deste documento.** Sem ação clínica, sem dado real, sem rede.

Evidência: [DISCOVERY](../04_audit/evidence/AUD0625-PAR-X01-SPEC-07-20261029/DISCOVERY.md), sonda `probe-pidns-membership.mjs` e testes RED `tests/aud0625-par-x01-red.test.ts`. Escopo: `packages/sandbox`. Estende a [SPEC0275](0275_aud0625_process_filesystem_environment.md) (perfil, ambiente) e fecha o que a [SPEC0276](0276_aud0625_shell_abort_signal.md) deixou para o X01 (descendentes, reap, stdio). O mecanismo mais forte proposto em `CORE-X01-MECHANISM-81C4` (cgroup, pidfd, guardião) **não é adotado nem descartado** aqui: é o nível B (§3).

## 1. Problema

1. O abort só vale antes do launch; depois, o runner espera o timeout (RED: 6164 ms contra 3000 ms).
2. O resultado não diz se a árvore ficou limpa. A limpeza hoje depende do kernel e ninguém a observa.
3. A contenção é inferida do texto do stderr do payload (`bwrap:`): ele pode forjar `spawn_failed` (RED), e uma falha real sem o prefixo vira "saída".
4. Não há contrato de ambiente por allowlist para consumidores futuros (MCP stdio, LSP, conversão de documentos), nem modo persistente, `wait`, `stop` e `dispose`.
5. Quando esses consumidores aparecerem sem um serviço único, cada um criará seu próprio spawn.

## 2. Invariantes

I1. **Um só caminho de criação de processo.** Em `packages/**` e `apps/**`, só o serviço importa `node:child_process`. Guarda estática em teste (fronteira), com exceção nomeada apenas para a sonda de capacidade, que passa a usar o mesmo serviço.

I2. **Ambiente fechado.** O filho recebe só o mapa que o perfil aprovou: nomes `[A-Z_][A-Z0-9_]{0,63}`, valores com teto, no máximo 64 entradas e 16 KiB. Nunca lê nem espalha `process.env`. Nomes de carregador e injeção (`LD_*`, `NODE_OPTIONS`, `DYLD_*`, `BASH_ENV`, `ENV`, `PYTHON*`, `PERL5OPT`, `*_PROXY`) são recusados mesmo se o consumidor pedir. Credencial entra só pelo mapa do consumidor, por nome declarado no perfil; o valor nunca vai a log, recibo ou erro.

I3. **Causa primária imutável.** A primeira causa (`exit`, `signal`, `timeout`, `startup_timeout`, `cancelled`, `dispose`, `output_limit`, `spawn_failed`) é registrada uma vez. Erros de limpeza são registrados à parte e nunca a substituem.

I4. **Convergência.** `stop`, abort, timeout, `dispose` e saída espontânea compartilham **uma** tarefa de limpeza por lançamento, idempotente. Chamadas concorrentes recebem o mesmo resultado.

I5. **Limpo só com prova.** O lançamento só passa a `CLOSED/clean` quando (a) o filho inicial foi reaped, (b) a varredura de `/proc` não encontra nenhum processo no PID namespace do lançamento e (c) os canais de stdio foram fechados. Caso contrário o resultado é `cleanup_failed`, com contagem e pids redigidos, sem declarar sucesso, sem matar por nome e sem reutilizar o slot como limpo.

I6. **Status de contenção por canal privado.** Falha de setup, `child-pid`, `pid-namespace` e `exit-code` vêm do `--json-status-fd` do bubblewrap (fd que o payload não herda), nunca de stdout/stderr. O texto do payload é dado, não sinal.

I7. **Prazos finitos e não renováveis.** `startupMs`, `lifetimeMs` e `cleanupMs` são obrigatórios e limitados pelo perfil. Bytes de entrada, saída ou controle não renovam nenhum deles. Servidor persistente que precisa de mais tempo é fechado e readmitido como novo lançamento.

I8. **Bytes antes de decodificar.** Tetos por stream (`maxOutputBytes`) e de stdin (`maxStdinBytes`) são aplicados sobre bytes; excesso encerra o lançamento com `output_limit` e `truncated`. Filas de leitura e escrita têm teto e backpressure.

I9. **Sem sinal sem identidade.** Nenhum `kill` por pid sem conferir que o pid ainda é o do lançamento (`starttime` de `/proc/<pid>/stat` capturado no spawn). O sinal vai ao grupo próprio (`detached` + `kill(-pgid)`) e ao init do namespace, nunca a um pid lido de entrada externa.

I10. **Dispose do serviço.** `ACTIVE → CLOSING → CLOSED`: fecha admissão (inclusive lançamentos ainda sem pid), para todos os lançamentos pela tarefa do I4 e devolve um relatório agregado (limpos, `cleanup_failed`). Um `dispose` repetido devolve o mesmo relatório.

## 3. Mecanismo e níveis honestos

**Nível A — `namespace-observed` (esta SPEC).** Reutiliza o perfil e o bubblewrap atuais (`--unshare-pid`, `--die-with-parent`, `--new-session`, fd fixado) e acrescenta:

- `--json-status-fd` num fd fixo da lista de fds do launch (I6);
- spawn `detached`, para existir um grupo próprio (I9);
- supervisor no processo dono: timers, abort, `stop`, `dispose` e o tick de limpeza;
- limpeza em degraus: pedido gracioso (SIGTERM ao grupo) durante `graceMs`; SIGKILL ao grupo e ao init do namespace; reap do bwrap; varredura de `/proc/*/ns/pid` contra `pid:[<inode>]` do primeiro documento de status até esvaziar ou até `cleanupMs`.

A varredura prova pertencimento ao namespace sem depender de pid reutilizado nem de ancestralidade (a sonda achou um neto com `setsid`). Entradas ilegíveis de outro uid são ignoradas; ilegíveis do mesmo uid contam como não verificadas e impedem `clean`.

O resultado carrega `profile: 'namespace-observed'` e `ownerIndependent: false`: **se o processo dono ficar pausado ou travado, os prazos do nível A param junto** (comparador conhecido da baseline 81C4; XM17 não é reivindicado). O nível A não limita CPU, memória nem número de processos; cap de pids e contabilidade agregada ficam para o B.

**Nível B — `cgroup-guardian` (fora deste BUILD).** Cgroup v2 próprio, `clone3`/pidfd, guardião PID1 e deadlines nativos, como em 81C4. Continua exigindo helper nativo, delegação de cgroup e decisão T3 própria. O contrato do §4 já reserva `profile` e `ownerIndependent` para que B entre sem mudar consumidores. Um perfil que exija B e não o encontre **recusa antes do payload**; nunca degrada para A em silêncio.

Versão mínima do bubblewrap: a que oferece `--json-status-fd` (0.9.0 verificada). Ausência do flag é `unavailable` antes do payload.

## 4. Contrato

```ts
type ProcessConsumer = 'shell' | 'mcp-stdio' | 'lsp' | 'document-conversion'
interface ProcessLaunchRequest {
  consumer: ProcessConsumer
  profile: ProcessContainmentProfile // F02, revisado pelo host
  argv: readonly string[] // argv puro; argv[0] no manifesto do perfil
  cwd?: string
  env?: Readonly<Record<string, string>> // I2
  mode: 'oneshot' | 'persistent'
  stdin?: Uint8Array // oneshot
  limits: {
    startupMs: number
    lifetimeMs: number
    cleanupMs: number
    graceMs: number
    maxOutputBytes: number
    maxStdinBytes: number
  }
  signal?: AbortSignal
}
interface ProcessHandle {
  readonly id: string
  readonly stdin?: {
    write(chunk: Uint8Array): Promise<void>
    end(): Promise<void>
  } // persistent
  readonly output: AsyncIterable<{
    stream: 'stdout' | 'stderr'
    bytes: Uint8Array
  }> // persistent
  wait(): Promise<ProcessOutcome>
  stop(reason?: string): Promise<ProcessOutcome>
}
interface ProcessOutcome {
  cause:
    | 'exit'
    | 'signal'
    | 'timeout'
    | 'startup_timeout'
    | 'cancelled'
    | 'dispose'
    | 'output_limit'
    | 'spawn_failed'
  exitCode: number | null
  signal: string | null
  stdout?: string
  stderr?: string
  truncated: boolean // oneshot
  cleanup: {
    state: 'clean' | 'cleanup_failed'
    observed: 'proc-pidns'
    leftover: number
    unverified: number
  }
  profile: 'namespace-observed'
  ownerIndependent: false
  secondaryErrors: readonly string[] // I3
}
interface ProcessService {
  launch(request: ProcessLaunchRequest): Promise<ProcessHandle>
  dispose(): Promise<ProcessDisposeReport>
}
declare function createProcessService(options: {
  /* host-owned: bwrap path, clock, /proc root for tests */
}): ProcessService
```

`launch` valida tudo (perfil, env, limites) antes de reservar slot ou criar processo; pedido inválido nunca spawna. `runContained` permanece exportado como adaptador fino sobre `launch(oneshot)`, com o mesmo formato de resultado mais `cleanup`; seu `exitCode` passa a vir do canal do I6.

## 5. Consumidores

| Consumidor              | Modo       | O que o serviço garante                                                                                     | Fica fora                                                |
| ----------------------- | ---------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Shell                   | oneshot    | abort em voo, causa única, limpeza observada; mapeamento de exit codes e `ShellLimits` do shell preservados | semântica do `effect_uncertain` (F05)                    |
| MCP stdio               | persistent | stdin aberto até `stop`/`dispose`, framing do consumidor sobre bytes, prazos não renováveis                 | credencial, egress e política do servidor MCP (SPEC MCP) |
| LSP                     | persistent | idem, com perfil de leitura do workspace                                                                    | escolha de servidores                                    |
| Conversão de documentos | oneshot    | sem rede, arquivos só no workspace, teto de saída                                                           | formatos suportados                                      |

Nenhum desses consumidores existe em código hoje; esta SPEC só impede que nasçam com spawn próprio (I1).

## 6. Aceite e provas

Cada prova tem controle negativo e mutação conhecida; observador sempre fora do workload (`/proc`), com marcador único por execução.

| ID   | Prova                                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XP01 | Abort, timeout, `stop` e `dispose` deixam 0 membros no namespace (varredura independente do serviço); controles hoje verdes: timeout e saída espontânea.    |
| XP02 | Abort **em voo** retorna em menos de 3 s com `cause: 'cancelled'` e árvore vazia (RED hoje: 6164 ms).                                                       |
| XP03 | Neto com `setsid`, fork em rajada e pipe herdado ficam dentro da prova; o fim do wrapper sozinho não encerra o lançamento.                                  |
| XP04 | Payload que imprime `bwrap: …` e sai com 3 devolve `exit 3` (RED hoje: `spawn_failed`); falha real de setup devolve `spawn_failed` mesmo com stderr limpo.  |
| XP05 | Resultado traz `cleanup` observado; leftover simulado (membro que não morre) vira `cleanup_failed`, nunca `clean`.                                          |
| XP06 | Ambiente: o sentinela do host e `LD_PRELOAD`/`NODE_OPTIONS` pedidos pelo consumidor não aparecem; entrada fora do mapa do perfil é recusada antes do spawn. |
| XP07 | Cancel, `stop` e `dispose` concorrentes compartilham uma limpeza; a primeira causa não muda; `dispose` repetido devolve o mesmo relatório.                  |
| XP08 | Persistent: stdin vive até `stop`; flood de saída, leitor lento e frame acima do teto encerram dentro do perfil sem fila ilimitada.                         |
| XP09 | Prazos: bytes e keepalive não renovam `lifetimeMs`; `startup_timeout` impede o payload.                                                                     |
| XP10 | `kill` só com identidade conferida: pid reutilizado (starttime diferente) não recebe sinal.                                                                 |
| XP11 | Guarda de fronteira (I1): `child_process` fora do serviço em `packages/**` e `apps/**` reprova o teste.                                                     |
| XP12 | Oráculos existentes (F02 perfil, F05 shell) continuam verdes; nenhum limite do shell muda.                                                                  |

Mutações no BUILD: sem varredura, varredura pelo pid em vez do namespace, status lido do stderr, sinal sem checar starttime, limpeza por consumidor, env com spread.

## 7. Fatiamento proposto do BUILD (após T3)

1. Núcleo: tipos, validação de env e limites, `launch` oneshot sobre o launch atual, causa única.
2. Supervisor e limpeza: grupo próprio, degraus de kill, `--json-status-fd`, varredura de `/proc`, resultado `cleanup`.
3. Migração do shell por `runContained` fino, status privado, abort em voo; guarda de fronteira (I1) com a sonda de capacidade migrada.
4. Modo persistente e `dispose` do serviço.

Cada fatia com testes, mutação, revisão independente e, se tocar arquivo catalogado, religação de `skip-catalog`/`mutation-manifest`.

## 8. Fora de escopo e limites declarados

Nível B (cgroup, guardião, deadlines independentes do dono, XM17), limites de CPU/memória/pids, outros sistemas operacionais, processos presos em estado ininterruptível do kernel (resultado honesto: `cleanup_failed`), `scripts/**` (CI e build), política de credencial/egress de MCP, hooks externos (SPEC 0280), qualquer afirmação de release ou de produção.

## 9. Decisões pedidas ao humano (T3)

| ID  | Pergunta                                                                                                                 | Recomendação                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| X-A | Entregar primeiro o nível A (`namespace-observed`) e manter o B como proposta separada?                                  | Sim: A cumpre o aceite do cartão e não depende de helper nativo nem de delegação de cgroup. |
| X-B | Exigir `--json-status-fd` (bwrap ≥ 0.9.0) e recusar `unavailable` sem ele?                                               | Sim; sem fallback para o stderr.                                                            |
| X-C | Ambiente por mapa fechado do perfil, com lista de nomes proibidos fixa em código?                                        | Sim.                                                                                        |
| X-D | `runContained` fica como adaptador fino e exportado, ou é removido do índice do pacote?                                  | Adaptador fino por uma versão, depois remoção.                                              |
| X-E | `cleanup_failed`: o serviço segue aceitando lançamentos de outros consumidores, marcado `degraded`, ou fecha a admissão? | Seguir `degraded` e exigir reconciliação do operador; sem kill global.                      |
| X-F | Guarda de fronteira I1 só para `packages/**` e `apps/**`?                                                                | Sim; `scripts/**` fica de fora.                                                             |

Aprovar esta SPEC não libera produção, release, servidor MCP real nem o nível B.
