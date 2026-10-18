# Delta de ledgers proposto ao Lead — CONT-20261018-D9EF / CODEX100

Este texto é uma proposta. O executor não editou nenhum dos arquivos abaixo: eles são
compartilhados e readonly para ele. O Lead integra cada trecho no lugar indicado. Todos os
caminhos são relativos à raiz do repositório.

Fontes do delta:

- unidade: `docs/04_audit/evidence/CODEX100-EXEC-20261017/g02/sdk-observation-drivers/`;
- relatório: `REPORT.md`; validação: `validation-r2.json`; congelamento: `source-freeze-r2.json`;
- commits na branch própria `codex/codex100-sdk-observation-drivers-20261018`, worktree
  `/mnt/ia/cvg-codex100-exec-20261017/sdk-drivers-candidate`. Os SHAs estão em
  `commit-receipt.json`. Nada foi promovido ao root.

## docs/99_runtime_state.md (entrada no topo da seção CODEX100)

> **CODEX100 — DX100-G02:IMPLEMENT-SDK-OBSERVATION-DRIVERS: COMPLETED_LOCAL_WITH_DECLARED_GAPS
> (18/10/2026, Claude Code sob CONT-20261018-D9EF).** O checkpoint de reinício foi retomado com o
> runtime movido para `/mnt/ia/cvg-codex100-exec-20261017/sdk-observation-drivers` (o `/tmp` foi
> apagado; não houve reinstalação nem download).
>
> - Helpers completos: Node (canal, adapter, peer, driver, loader restrito, transpile preparado) e
>   Python (canal, adapter, peer, driver), mais supervisor e observador independentes do host.
>   `interface-v1` está intacta, com suplemento de vínculos.
> - Autotestes 115/115 (Python) e 98/98 (Node). 10 diagnósticos constantes em serviço, todos com o
>   veredito esperado (12/12 serviços).
> - Revisão: R1 REVISE (7 P2), um reparo agrupado e R2 APPROVE (0 obrigatórios). Orçamento fechado
>   sem reset.
> - Só a última tentativa roda exatamente a identidade R2. Os caminhos TS reparados foram
>   qualificados por autotestes e revisão estática.
> - SDK, Pydantic e compilador: `NOT_RUN`; 19 casos `NOT_RUN`; 0 recibos; 0 crédito de paridade.
>   Catálogo 487+22 inalterado. SPEC0239 segue `REQUESTED_PENDING_USER`.
> - Próxima ação proposta: `DX100-G02:ADMIT-SDK-PROFILE-AND-ACCEPTANCE`, com claim e orçamento
>   novos.

## docs/20_master_execution_log.md (nova linha de execução)

> 2026-10-18 — CODEX100/DX100-G02 drivers de observação SDK. Retomada pelo checkpoint (2.945
> arquivos do manifesto do programa e 23 do checkpoint, 0 divergências; baseline com 2.914
> imutáveis PASS).
>
> 1. Implementação e autotestes puros.
> 2. Diagnósticos constantes em `systemd-run --user` + `bwrap` (MemoryMax 512 MiB, TasksMax 32,
>    RuntimeMaxSec 45): PY-RPC PASS, TS-ECHO PASS, TS-ABORT KNOWN_SIGNAL_TERMINATION,
>    TS-LARGE PASS, PY-TERM (gatilho fraco, anotado) e PY-TERM no meio do stream
>    KNOWN_SIGNAL_TERMINATION, PY-STALL INVALID_CAPTURE (revelou o defeito do frame terminal,
>    anotado), PY-KILL INVALID_CAPTURE, PY-STALL INVALID_CAPTURE com INVALID declarado.
> 3. Crítico fresco R1: REVISE com 7 P2.
> 4. Reparo agrupado único.
> 5. Último serviço: PY-TERM com fontes R2, KNOWN_SIGNAL_TERMINATION, entrega→END ≤100 ms.
> 6. R2: APPROVE.
>
> Recursos liberados: 12 unidades coletadas, 0 cgroups e 0 processos. Commits na candidata
> própria, sem push.

## docs/30_backlog_master.md (linha do item CODEX100 / DX100-G02)

> DX100-G02 drivers de observação SDK: **COMPLETED_LOCAL_WITH_DECLARED_GAPS**. Próximo item:
> `DX100-G02:ADMIT-SDK-PROFILE-AND-ACCEPTANCE`. Pré-condições:
>
> - predicados de aceitação por caso;
> - staging selado do perfil SDK;
> - `recv_ns` por frame e errata R2-F01;
> - requalificação TS, PY-RPC e loader na identidade nova;
> - reaquisição de dados dos 7 artefatos sob autorização própria.
>
> Os 19 casos e a paridade seguem abertos.

## docs/03_build/0386_backlog_paridade_codex.md (cartão DX100-G02)

> Subunidade "drivers de observação SDK" concluída localmente (R2 APPROVE; H01, H02, H06, H07,
> H10 e H12 ATENDIDO; H03, H04, H05, H08 e H09 PARCIAL; H11 local). O cartão G02 continua aberto.
> Faltam a admissão concreta, o freeze, a qualificação do compilador e a execução única dos 19
> casos, sem crédito funcional.

## .agent/plans/codex100-exec-20261017.md

- Progress: marcar `[x] (2026-10-18) DX100-G02:IMPLEMENT-SDK-OBSERVATION-DRIVERS
  COMPLETED_LOCAL_WITH_DECLARED_GAPS — ver g02/sdk-observation-drivers/REPORT.md`. Acrescentar
  `[ ] DX100-G02:ADMIT-SDK-PROFILE-AND-ACCEPTANCE`.
- Concrete Steps, passo 1: substituir pela ordem de
  `g02/sdk-observation-drivers/next-task.json#/implementation_order`.
- Surprises & Discoveries:
  - Node 24 usa de 7 a 12 threads por processo. Com TasksMax 32, os papéis Node não podem usar o
    threadpool do libuv (pico medido de 24/32).
  - O SIGTERM disparado no primeiro commit de stdout acertou a resposta do `initialize`; o gatilho
    precisa ser posicional.
  - Frames terminais barrados pelo prazo do caso impediam declarar INVALID; corrigido.
- Decision Log: o executor do Lead não editou ledgers compartilhados. O delta fica neste arquivo.

## docs/08_runtime/handoffs/codex100_exec_20261017.md (cabeçalho de estado)

> Programa `IN_PROGRESS`. Unidade `DX100-G02:IMPLEMENT-SDK-OBSERVATION-DRIVERS`
> COMPLETED_LOCAL_WITH_DECLARED_GAPS. Checkpoint canônico:
> `g02/sdk-observation-drivers/SESSION_CHECKPOINT.md`. Próxima tarefa:
> `g02/sdk-observation-drivers/next-task.json`.

## docs/08_runtime/agent_coordination.md (seção CODEX100-EXEC-20261017)

> - ENCERRADO REFERENCE-HELPERS DX100-G02:IMPLEMENT-SDK-OBSERVATION-DRIVERS (18/10/2026, Claude
>   Code sob CONT-20261018-D9EF). Runtime transferido para
>   `/mnt/ia/cvg-codex100-exec-20261017/sdk-observation-drivers/**`.
> - Unidades `cvg-codex100-sdkdiag-*` 12/12 usadas e coletadas. Crítico 2/2 e reparo 1/1, sem
>   reset.
> - Candidata própria `/mnt/ia/cvg-codex100-exec-20261017/sdk-drivers-candidate`, branch
>   `codex/codex100-sdk-observation-drivers-20261018`. Commits apenas do caminho da unidade; sem
>   push e sem promoção ao root.
> - Recursos liberados. Os diretórios de tentativa ficam preservados como proveniência.

## docs/04_audit/evidence/CODEX100-EXEC-20261017/{state.json, continuation.json, execution-log.jsonl}

Estes arquivos ficam fora do escopo de escrita deste executor (`g02/**`). Proposta:

- `state.json.active_action_id` passa a `DX100-G02:ADMIT-SDK-PROFILE-AND-ACCEPTANCE`, com
  `READY_PENDING_LEAD_CLAIM`.
- `continuation.json` aponta para `g02/sdk-observation-drivers/next-task.json`.
- `execution-log.jsonl` recebe um evento `UNIT_COMPLETED_LOCAL` com o sha256 de
  `validation-r2.json` e de `source-freeze-r2.json`.

## Observação para o Lead

O commit de Fase 0 do root (`44971c60`, 15:13) capturou versões **intermediárias** de
`g02/sdk-observation-drivers/node/adapter-typescript` e `node/channel.cjs`, além de `ts-driver.mjs`
e `fixture-cli.mjs` de antes do reparo. Elas não são qualificadas. As versões finais estão apenas
na branch própria acima, e o working tree do root contém as mesmas versões finais, sem commit.
