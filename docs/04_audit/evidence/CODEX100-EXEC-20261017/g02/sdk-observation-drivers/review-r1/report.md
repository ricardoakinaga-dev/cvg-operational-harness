# Revisão R1: sdk-observation-drivers

> Transcrição literal pelo executor do Lead do conteúdo devolvido pelo crítico fresco no
> handback: o harness bloqueou a escrita de relatório `.md` pelo subagente. O registro
> estruturado do próprio crítico é [review.json](review.json).

**Veredito: REVISE.** Há 7 achados obrigatórios (P2) e 10 recomendações (P3); nenhum P1.

Objeto: `source-freeze-r1.json` (sha256 `3ff69a68…e06c`). Os 27 arquivos congelados bateram em sha256 e modo no início e no
fim da revisão.

## Verificações executadas

- `node --check` passou nos 7 fontes Node.
- `python3 -I python/selftest_python.py`: Python 96/96, Node 83/83, rc 0.
- Leitura completa das fontes e dos contratos, e comparação com as fontes SDK pinadas: as chamadas de `run_sdk`/`sdk_py07` e
  `sdkCase` estão corretas, e o catch da API está isolado da telemetria.
- Reconciliação das 9 tentativas: `result.json`, eventos, ações, rc do `systemd-run` e `host_sources`; diff das cópias de
  perfil executadas contra o freeze.

## Achados obrigatórios

| id | local | resumo |
|---|---|---|
| R1-F01 | python/observer.py:447 | KNOWN_SIGNAL_TERMINATION ignora o status do peer (MISSING/NO_TERMINAL/INVALID aceitos); supervisor.py:715 aceita peer INVALID como "sinal recebido". |
| R1-F02 | node/adapter-typescript:41 | O timer de 90 ms escreve END com um writeChunk ainda em voo: o write pode ter chegado ao SO sem commit, e o observer aceita (commit desconhecido deveria ser INVALID). |
| R1-F03 | python/adapter-python.py:140 | O sinal só é checado no topo do laço; ainda há leituras novas e emits bloqueáveis até o prazo, e o observer mede só SIGNAL→END. Os 100 ms a partir da entrega não são impostos nem verificados. |
| R1-F04 | python/supervisor.py:656 | O rc do driver (propagado: 125/255) não entra no veredito; falhas depois do END (close, controle não consumido) saem como PASS. O ramo Python não confere a saída do adapter. |
| R1-F05 | source-freeze-r1.json:147 | A tabela omite a deriva do supervisor do host (3 tentativas diferem; PY-RPC e TS-ECHO não registram e o snapshot diverge). H05, H08 e TS só foram provados com identidades anteriores. |
| R1-F06 | python/channel.py:27 | `case_artifacts` (2 MiB por caso) virou 2 MiB por papel, sem soma entre papéis; a saída do serviço é truncada em 64 KiB sem marca. |
| R1-F07 | node/extension-loader.mjs:121 | Os módulos emitidos são liberados só pelo nome: o hash de `emitted` nunca é comparado, não há fechamento de `/profile/sdk-emitted/`, e os builtins liberados vão além de `SDK_BUILTINS`. |

## Recomendações (P3)

| id | resumo |
|---|---|
| F08 | O TS não tem barreira final antes do END; o plano de TS02/03/07/08 ignora o `child.kill()` do finally do SDK; `role_done` aceita SIGNAL sozinho. |
| F09 | Escrita parcial nunca exercitada (inalcançável com ≤ PIPE_BUF) e stderr do peer Python não exercitado. |
| F10 | Truncamento por caracteres, validação por bytes UTF-8. |
| F11 | Sinal engolido depois de finalized ou do fim do laço; re-raise sem saída de recurso (SIGPIPE no Node). |
| F12 | PASS não exige `complete=true` no END do driver e do peer. |
| F13 | O rótulo da ação de DIAG-PY-TERM diverge do gatilho real (≥16384). |
| F14 | Faltam os predicados de aceitação dos 19 casos e o staging recursivo do perfil SDK. |
| F15 | Os FIFOs não autenticam o escritor por papel. |
| F16 | Exceções do supervisor terminam sem `result.json` nem parada da unidade. |
| F17 | `createRequire` (CJS) contorna o loader ESM; o pico de TasksMax no TS foi 24/32. |

## Critérios

- **ATENDIDO:** H02, H06, H10 (R1), H12.
- **PARCIAL:** H01, H03, H04, H05, H07, H08.
- **NÃO ATENDIDO:** H09.
- **PENDENTE:** H11 (Lead).

## Evidência honesta, com ressalvas

- A anotação de a7a36bffa213 descreve corretamente que esse PY-TERM não qualifica o SIGTERM no meio do stream.
- O freeze declara NOT_YET para o adapter TS.
- Ressalva (R1-F05): o freeze não registra a deriva do supervisor do host.
- Só 6a2a2a432465 (PY-KILL) e b491ac832d0f (PY-STALL) rodaram fontes de papel e de host congeladas.

## Reparo agrupado sugerido

Corrija F01, F04, F06 e as guardas de F02 e F03 no observer e no supervisor, sem gastar serviço. Depois ajuste os adapters
(F02 Node, F03 Python), o `ts-driver` e o loader (F07) e corrija o freeze (F05). Use o único serviço restante para requalificar
o caminho de sinal com as fontes pós-reparo. Ele não cobre TS e PY ao mesmo tempo, e isso precisa ficar declarado.

## Limites

- Não executei serviços, SDK, Pydantic nem o compilador.
- A ordem de fases do libuv (F02) e a semântica de saída do bwrap/systemd (F08) foram analisadas estaticamente.
- O diff `c9e094…` → `d97a6cd4…` do supervisor não está disponível.
