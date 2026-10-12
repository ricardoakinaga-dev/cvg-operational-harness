# PDSH-031 — 100% per-file no núcleo (fatias) — 12/10/2026

- Task `PARE-DSH-20261011`, cartão [PDSH-031](../../../03_build/0375_plano_pareamento_motor_dsh.md) (Onda 4, T2). Estado: `IN_PROGRESS` — **32/35 fechados em produção** — todos os 31+1 arquivos de produção do baseline em 100% per-file; fatia 4 decidiu sobre os 3 arquivos de suporte (excluídos do gate, documentados); baseline e plano em [0607](../../0607_pdsh030_core_coverage_baseline_2026-10-12.md).
- Escopo da fatia 1: fechar os gaps pequenos de sessão/skills/compactação, canonical neutro e orquestradores — 9 dos 35 arquivos abaixo de 100% no baseline.
- Escopo da fatia 2a: `trajectory.ts`, `completion.ts`, `step-store.ts` — 3 arquivos fechados.
- Escopo da fatia 2b: `kernel/host.ts`, `context-engine.ts` — 2 arquivos fechados.
- Escopo da fatia 2c: `session/events.ts`, `kernel/controls.ts` — 2 arquivos fechados.
- Escopo da fatia 2d-1a: `kernel/pipeline.ts`, `createOperationalHarness.ts` — 2 arquivos fechados.
- Escopo da fatia 2d-1b: `kernel/kernel-runtime.ts` — 1 arquivo fechado.
- Escopo da fatia 2d-2: `effect-journal.ts`, `capability-boundary.ts` — 2 arquivos fechados.
- Escopo da fatia 2d-3a: `execution-spine.ts` — 1 arquivo fechado (com correção de defeito real: `WAITING_APPROVAL -> FAILED_TERMINAL`).
- Escopo da fatia 2d-3b: `iterative-dispatch.ts` — 1 arquivo fechado.
- Escopo da fatia 2d-3c: `iterative-runtime.ts` — 1 arquivo fechado (fatia 2d completa).
- Escopo da fatia 3a: `runtime-approval-request.ts`, `proposal.ts`, `effect-journal.ts` (agent-runtime) — 3 arquivos fechados, com **defeito real corrigido** (spin infinito do lock stale não-removível).
- Escopo da fatia 3b: `runtime-effect-recovery.ts` — 1 arquivo fechado.
- Escopo da fatia 3c: `composition.ts` — 1 arquivo fechado.
- Escopo da fatia 3d: `runtime-kernel-bridge.ts` — 1 arquivo fechado.
- Escopo da fatia 3e (i+ii): `runtime.ts` — 1 arquivo fechado (**fatia 3 completa**).
- Escopo da fatia 4: `contracts/execution-v2.ts` — 1 arquivo de produção fechado; **decisão registrada** sobre os 3 arquivos de suporte (evals/fixtures): excluídos do gate per-file, com justificativa versionada.

## Procedimentos observados

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda nova `pdsh-031-core-coverage.test.ts` (canonical, sessão, skills, orquestradores, controle de compactação) | PASS: 19 testes | [slice1-coverage-final.log](slice1-coverage-final.log) |
| Coverage focado (contracts+orchestrator+harness, v8 json) — 9 arquivos da fatia | **100% per-file** em statements/funções/branches para todos os 9 | [slice1-coverage-final.json](slice1-coverage-final.json) (sha256 `46d73e81ed6ec65e…`) |
| Suíte dos pacotes no mesmo run | PASS: 28 arquivos/299 testes | [slice1-coverage-final.log](slice1-coverage-final.log) |
| Typecheck/lint/prettier/diff | PASS | `npm run typecheck`; `eslint` nos arquivos novos; prettier; `git diff --check` |

Arquivos fechados (per-file 100%): `contracts/src/canonical-json.ts`, `harness/src/compaction.ts`, `harness/src/session/{kernel-log,format-migration,memory}.ts`, `harness/src/skills/{assert,loader}.ts`, `orchestrator/src/{scripted,hybrid-orchestrator}.ts` (fatia 1) e `harness/src/{trajectory,completion,step-store}.ts` (fatia 2a).

## Fatia 2a — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice2a.test.ts` (trajectory, integridade/binding do step store, matriz ACTION_CONFIRMED do completion, juiz semântico indisponível) | PASS: 16 testes | [slice2a-coverage.log](slice2a-coverage.log) |
| Coverage focado — 3 arquivos da fatia 2a | **100% per-file** em statements/funções/branches | [slice2a-coverage-final.json](slice2a-coverage-final.json) (sha256 `d5de1a59fe527f24…`) |
| Suíte dos pacotes no mesmo run | PASS: 29 arquivos/315 testes | [slice2a-coverage.log](slice2a-coverage.log) |

- Refatoração mínima em `completion.ts`: `toolObservationIsEffect` passou a concentrar "sucesso + efeito" (a checagem de sucesso foi fundida no predicado de efeito, preservando a semântica de `hasConfirmedEffect`) — removeu ramos defensivos inalcançáveis e deixou todas as branches cobertas por teste real. Testes existentes do completion continuam passando.
- Supressões de coverage acumuladas (2 no total, ambas justificadas): `default` inalcançável do `typeof` em `canonical-json.ts`; fallback `?? ''` inalcançável do detalhe do juiz indisponível em `completion.ts` (todo COMPLETE determinístico carrega `detail`).

## Fatia 2b — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice2b.test.ts` (boot do host, sealing, disposers, wrap não-Error; context-engine com execução não vinculada, estado pendente e valores hostis) | PASS: 9 testes | [slice2b-coverage-final.log](slice2b-coverage-final.log) |
| Coverage focado — 2 arquivos da fatia 2b | **100% per-file** em statements/funções/branches | [slice2b-coverage-final.json](slice2b-coverage-final.json) (sha256 `b35b87f6d11ee192…`) |
| Suíte dos pacotes no mesmo run | PASS: 30 arquivos/323 testes | [slice2b-coverage-final.log](slice2b-coverage-final.log) |

- Refatorações mínimas em `kernel/host.ts` (mesma semântica, ramos defensivos inalcançáveis removidos): `visit(byName.get(owner) as KernelPlugin)` no ordering (o provedor sempre existe) e delete incondicional do serviço no disposer (chaves são únicas entre plugins). Total de supressões segue em **2**.
- Cobertura cobre: missing/duplicate service, `control_service_from_capability`, `guard_from_capability`, declaração sem provisão, `plugin_apply_failed` não-Error, host selado (`provide`/`on`/`guard`), disposers de listener/guarda com e sem remoção prévia, `execution_unbound`, `pendingApprovalId`/`pendingQuestion`/`lastEvaluation` no sumário e `safeString` com `undefined`/função/objeto circular.

## Fatia 2c — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice2c.test.ts` (orçamento de nós/profundidade do validador JSON, descritores de array/objeto, enum/string/número, envelope de append, regra de compactação, cap de 1 MiB) | PASS: 8 testes | [slice2c-events-coverage-final.log](slice2c-events-coverage-final.log) |
| Guarda `pdsh-031-slice2c-controls.test.ts` (stops de duração do orçamento/avaliação/reserva, `approval_unbound`, settle de todos os outcomes com port falhando, defaults de audit/telemetria, limites do log/ledger) | PASS: 10 testes | [slice2c-coverage-final.log](slice2c-coverage-final.log) |
| Coverage focado — 2 arquivos da fatia 2c | **100% per-file** em statements/funções/branches | [slice2c-coverage-final.json](slice2c-coverage-final.json) (sha256 `aed081b614585e36…`) |
| Regressão nos 14 arquivos já fechados | Sem gaps (checagem automática no mesmo JSON) | [slice2c-coverage-final.json](slice2c-coverage-final.json) |
| Suíte dos pacotes no mesmo run | PASS: 32 arquivos/341 testes | [slice2c-coverage-final.log](slice2c-coverage-final.log) |
| Boundary gate após edições em arquivos pinados | PASS: 0 diagnósticos; pins `pdsh-session-json-reflection`, `pdsh-neutral-canonical-reflection` e `-compiled` re-assinados | `node scripts/check-product-boundary.mjs` |

- Simplificações mínimas sem mudança de semântica: em `session/events.ts` uma cláusula morta foi removida (chave de índice de array é sempre < `length`) e três defensivas inalcançáveis ficaram sob `/* v8 ignore next */` (alvo ausente de `$ref`, `maximum` no teto safe-integer, guarda `if (schema.items)`); em `kernel/controls.ts` o `if (timer)` virou `clearTimeout` incondicional com atribuição definitiva (o executor da `Promise` roda sincronamente). Total de supressões: **5**.
- Cobertura cobre no validador: orçamento de 20k nós e profundidade 64, array com chave extra/holes, objeto com descritor não-enumerável/getter, enum/string/número (mínimo) inválidos, `$ref` aninhado com correlação divergente, teto de 1 MiB no append e no evento, `throughSequence` ≥ `sequence`; nos controles: `MAX_DURATION` em `beginModelRequest` e nos dois hooks, limites de log/ledger, falha não-Error de aprovação com `policyVersion` default, reserva sem port/vencida, e os seis outcomes do settle (incluindo catches de port).

## Fatia 2d-1a — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice2d-kernel.test.ts` (race/raceInvoked com abort, runGate não-Error, guards com throw/cause/sem cause, unrecordedBlock com approvalId, snapshot não-clonável, cancelamento no modelo e no dispatch, listener de dispatch falhando antes/depois do next, pós-execute falhando sobre succeeded e sobre failed, ledger fechando com falha, sandbox host-integrity, composição com todos os opcionais) | PASS: 14 testes | [slice2d-1a-coverage.log](slice2d-1a-coverage.log) |
| Coverage focado — 2 arquivos da fatia 2d-1a | **100% per-file** em statements/funções/branches | [slice2d-1a-coverage-final.json](slice2d-1a-coverage-final.json) (sha256 `e1d2bc16baf5f814…`) |
| Regressão nos 16 arquivos já fechados | Sem gaps (checagem automática no mesmo JSON) | [slice2d-1a-coverage-final.json](slice2d-1a-coverage-final.json) |
| Suíte dos pacotes no mesmo run | PASS: 33 arquivos/355 testes | [slice2d-1a-coverage.log](slice2d-1a-coverage.log) |
| Boundary gate após edições | PASS: 0 diagnósticos | `node scripts/check-product-boundary.mjs` |

- Simplificação mínima sem mudança de semântica em `kernel/pipeline.ts`: `onAbort` com atribuição definitiva e `removeEventListener` incondicional em `race`/`raceInvoked` (o executor da `Promise` roda sincronamente) — removeu os ramos defensivos inalcançáveis dos `if (onAbort)`.
- Cobertura cobre: sinal pré-abortado e abort em voo no modelo/dispatch, gate/listener/guard lançando não-Error, verdict com e sem `cause`, snapshot de payload não clonável, hook `beforeDispatch` com stop, host reportando gate de sandbox ilegível (fail-closed), ledger com falha no fechamento, e composição iterativa com todos os opcionais (incluindo capabilities+journal e o alias `run`).

## Fatia 2d-1b — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice2d-runtime.test.ts` (boot falho Error/definido, dispose nos três estados, turn/start e gate bloqueando, cancelamento pré/em planejamento, orçamento esgotado antes do plano, falha de planner Error/não-Error, fallbacks de ASK_USER/REQUEST_APPROVAL/HANDOFF/STOP/RETRIEVE, cancelamento do modelo, resultado não registrado, orçamento esgotado pós-modelo, cancelamento de tool com e sem reserva de aprovação, saídas string/símbolo/ausente, overrun de duração pós-tool, registro de fechamento perdido nos dois settled, listener turn/end lançando control/capability, fechamento de turno perdido em COMPLETED/parada igual/parada diferente) | PASS: 15 testes | [slice2d-1b-coverage.log](slice2d-1b-coverage.log) |
| Coverage focado — arquivo da fatia 2d-1b | **100% per-file** em statements/funções/branches | [slice2d-1b-coverage-final.json](slice2d-1b-coverage-final.json) (sha256 `25a92a15723424e8…`) |
| Regressão nos 18 arquivos já fechados | Sem gaps (checagem automática no mesmo JSON) | [slice2d-1b-coverage-final.json](slice2d-1b-coverage-final.json) |
| Suíte dos pacotes no mesmo run | PASS: 34 arquivos/370 testes | [slice2d-1b-coverage.log](slice2d-1b-coverage.log) |
| Boundary gate após edições | PASS: 0 diagnósticos | `node scripts/check-product-boundary.mjs` |

- Nenhuma mudança no código de produção nesta fatia; a cobertura usou o fluxo real do `KernelRuntime` com plugins de controle/capability mínimos (serviços providos por plugin próprio), incluindo o fluxo de aprovação real (`approvalsControl`) para o cancelamento com reserva.

## Fatia 2d-2 — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice2d-boundary.test.ts` (journal: bounds de attemptId/operationKey, tabela de transições, re-reserva após FAILED, reserva presa por outro attempt, falha sem erro, incerteza com Error/não-Error; boundary: descriptors/origins/governança inválidos, duplicados e versões distintas, registry estrangeiro, resolução limitada, sort/fingerprint, input hostil — autoridade, profundidade, nós, bytes —, execução falha/resultados inválidos, validação de output hostil) | PASS: 16 testes | [slice2d-2-coverage.log](slice2d-2-coverage.log) |
| Coverage focado — 2 arquivos da fatia 2d-2 | **100% per-file** em statements/funções/branches | [slice2d-2-coverage-final.json](slice2d-2-coverage-final.json) (sha256 `8ffb518c87ed6d41…`) |
| Regressão nos 19 arquivos já fechados | Sem gaps (checagem automática no mesmo JSON) | [slice2d-2-coverage-final.json](slice2d-2-coverage-final.json) |
| Suíte dos pacotes no mesmo run | PASS: 35 arquivos/386 testes | [slice2d-2-coverage.log](slice2d-2-coverage.log) |
| Boundary gate após edição em `capability-boundary.ts` | PASS: 0 diagnósticos | `node scripts/check-product-boundary.mjs` |

- Simplificação mínima sem mudança de semântica em `capability-boundary.ts`: o comparador `sorted` perdeu o desempate por `providerId` (inalcançável, pois id@version é único por registro) — removeu ramos defensivos mortos.
- Cobertura cobre: transições ilegais/idempotentes do journal, fencing por attemptId, re-reserva de FAILED preservando criação, falha sem erro vira `tool failed`, incerteza com Error e não-Error; e no boundary: cada validação de descriptor, todos os operandos de risk/sideEffect, resolução com id/versão inválidos, execução com input escalar/nulo/hostil, output mutado/inválido e orçamentos de nós/bytes.

## Fatia 2d-3a — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice2d-spine.test.ts` (requeue de WAITING_APPROVAL, not_found, clockless recover/provideUserInput, ordenação de claims e janela de retry, rejeição idempotente sem/ com motivo, cancelamento sem motivo, fingerprint na submissão/visão e no runtime, heartbeat sem clock, fila vazia, retry claimado pelo worker, resume durável com journal options, heartbeat único/em falha, lease perdido com registro sumido, erro de store re-lançado, config não-Error, conflito de fingerprint sem audit) | PASS: 12 testes | [slice2d-3a-coverage.log](slice2d-3a-coverage.log) |
| **Defeito real corrigido** | `WAITING_APPROVAL` não permitia `FAILED_TERMINAL`; `resolveApproval(REJECTED)` sempre lançava `invalid_action`. Corrigido em `allowedTransitions`; o adaptador PG compartilha `isExecutionTransitionAllowed` e fica consistente — **rodar `test:postgres` no fechamento do cartão**. | `packages/harness/src/execution-spine.ts:277` |
| Coverage focado — arquivo da fatia 2d-3a | **100% per-file** em statements/funções/branches | [slice2d-3a-coverage-final.json](slice2d-3a-coverage-final.json) (sha256 `f0fd43136f9697e1…`) |
| Regressão nos 21 arquivos já fechados | Sem gaps | [slice2d-3a-coverage-final.json](slice2d-3a-coverage-final.json) |
| Suíte dos pacotes no mesmo run | PASS: 36 arquivos/398 testes | [slice2d-3a-coverage.log](slice2d-3a-coverage.log) |
| Boundary gate após edições | PASS: 0 diagnósticos | `node scripts/check-product-boundary.mjs` |

- Simplificações mínimas sem mudança de semântica em `execution-spine.ts`: `cloneFailure` sem guarda de `undefined` (call site exige falha), `eventType` por mapa exaustivo (remove fallback inalcançável), `leaseOwner` sem o fallback `CLAIMED` (claim sempre envia `changes.leaseOwner`) e `classifyRuntimeResult` com `result` obrigatório. Quatro blocos defensivos inalcançáveis ficaram sob `/* v8 ignore */` justificado (índice de idempotência inconsistente, dead-letter defensivo no claim, eventos já garantidos pelo submit, buffer de audit nunca vazio).

## Fatia 2d-3b — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice2d-dispatch.test.ts` (validação de decisão sem seleção/knowledge, resumes de aprovação e user-input com todos os conflitos, orçamentos/tool indisponível, tool sem versão/input, pausa antes e depois do checkpoint, handoff com step aberto, policy_unsupported com registro perdido, approval pendente sem id, cancelamento/deadline com e sem reserva, failed/threw com e sem erro, knowledge limit/janela/provider, verificação com e sem orçamento, compose com todos os outcomes do modelo, evaluate com usage/afterUsage/COMPLETE-FAILED-INSUFFICIENT, pause sem id/step) | PASS: 21 testes | [slice2d-3b-coverage.log](slice2d-3b-coverage.log) |
| Coverage focado — arquivo da fatia 2d-3b | **100% per-file** em statements/funções/branches | [slice2d-3b-coverage-final.json](slice2d-3b-coverage-final.json) (sha256 `aaf0426b4ec5ef64…`) |
| Regressão nos 22 arquivos já fechados | Sem gaps | [slice2d-3b-coverage-final.json](slice2d-3b-coverage-final.json) |
| Suíte dos pacotes no mesmo run | PASS: 37 arquivos/419 testes | [slice2d-3b-coverage.log](slice2d-3b-coverage.log) |
| Boundary gate após edições | PASS: 0 diagnósticos | `node scripts/check-product-boundary.mjs` |

- Simplificações mínimas sem mudança de semântica em `iterative-dispatch.ts`: `failureStatus` explícito no ramo threw/failed (o literal `'FAILED'` era inalcançável: threw sempre é unknown effect) e a avaliação de revisão da resposta virou uma constante usada no estado e em `run.lastEvaluation` (o `?? null` era inalcançável).

## Fatia 2d-3c — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice2d-iterative.test.ts` (helpers: bind/map/bounded/stringify; id derivado e sinal pré-abortado; pergunta pendente re-pausada; pausa de operador; MAX_STEPS por replay; reparo de decisão; duração exata e excedida com relógio congelado; deadline de decisão; tipos permitidos com budgets opcionais e `maxReplans` 0; threshold idempotente; HANDOFF/STOP; claims com itens de tool/knowledge e itens sem identidade; VERIFY response-claims/evidence-coverage; fechamento de passo pendente em COMPLETED/CANCELLED/MAX_DURATION/erro do store; auditoria de fechamento pendurada; ferramenta falha; clamp de deadline em effects lentos; orçamento de modelo zero; falha crua do orquestrador) | PASS: 22 testes | [slice2d-3c-coverage.log](slice2d-3c-coverage.log) |
| Coverage focado — arquivo da fatia 2d-3c | **100% per-file** em statements/funções/branches | [slice2d-3c-coverage-final.json](slice2d-3c-coverage-final.json) (sha256 `8570a35f936e2bde…`) |
| Regressão nos 23 arquivos já fechados | Sem gaps | [slice2d-3c-coverage-final.json](slice2d-3c-coverage-final.json) |
| Suíte dos pacotes no mesmo run | PASS: 38 arquivos/441 testes | [slice2d-3c-coverage.log](slice2d-3c-coverage.log) |
| Boundary gate após edições | PASS: 0 diagnósticos | `node scripts/check-product-boundary.mjs` |

- Simplificações mínimas sem mudança de semântica em `iterative-runtime.ts`: guarda de pergunta pendente sem o ramo de resume inalcançável (o `applyResume` consome/recusa antes), threshold resolvendo direto o `toolId` garantido pela validação, `withDeadline` com atribuição definitiva do timer, `finalize` com `stopReason`/`response` obrigatórios do contrato e avaliação de revisão como constante.
- Supressões `v8 ignore` justificadas acumuladas no cartão: **17** (1 canonical, 1 completion, 3 sessão/events, 4 execution-spine, 8 iterative-runtime — todas defensivas com comentário no local e consolidadas no documento de justificativas do gate final).

## Fatia 3a — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice3a.test.ts` (proposal: payload hostil não-Error → 'unknown error'; approval-request: falha crua → `proposal_invalid`, aprovação sem resource.id, com id e sem promptVersion; journal: get desconhecido, timeout com symlink quebrado, lock directory stale e lock fresco com poll) | PASS: 8 testes | [slice3a-coverage.log](slice3a-coverage.log) |
| **Defeito real corrigido** | `#withLockPath` girava para sempre quando um lock stale não podia ser removido (ex.: diretório no lugar do arquivo): o ramo stale fazia `continue` antes de checar o deadline. Agora o deadline é verificado após a tentativa de remoção. Guarda = teste “stale lock directory”. | `packages/agent-runtime/src/effect-journal.ts` |
| Coverage focado — 3 arquivos da fatia 3a (run com `packages/agent-runtime`) | **100% per-file** em statements/funções/branches | [slice3a-coverage-final.json](slice3a-coverage-final.json) (sha256 `8d55cb3c5c1b1e47…`) |
| Regressão nos 24 arquivos já fechados | Sem gaps | [slice3a-coverage-final.json](slice3a-coverage-final.json) |
| Suíte dos pacotes no mesmo run | PASS: 55 arquivos/735 testes | [slice3a-coverage.log](slice3a-coverage.log) |
| Boundary gate após edições | PASS: 0 diagnósticos | `node scripts/check-product-boundary.mjs` |

## Fatia 3b — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice3b.test.ts` (falha crua de tool → `effect_uncertain` com e sem approvalId; replay sem journal/sem hash; replay keyless recomputando a operation key; reserva sem journal → ok vazio; reserva sem hash → `proposal_missing` negado) | PASS: 4 testes | [slice3b-coverage.log](slice3b-coverage.log) |
| Coverage focado — arquivo da fatia 3b | **100% per-file** em statements/funções/branches | [slice3b-coverage-final.json](slice3b-coverage-final.json) (sha256 `e9d1eb6152bad058…`) |
| Regressão nos 27 arquivos já fechados | Sem gaps | [slice3b-coverage-final.json](slice3b-coverage-final.json) |
| Suíte dos pacotes no mesmo run | PASS: 56 arquivos/739 testes | [slice3b-coverage.log](slice3b-coverage.log) |
| Boundary gate | PASS: 0 diagnósticos | `node scripts/check-product-boundary.mjs` |

- Uma supressão nova (`?? null` de `record.proposalHash` em `#finishReplay`, com todos os quatro chamadores guardando o hash antes) — total no cartão: **18**.

## Fatia 3c — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice3c.test.ts` (resolução do coordinator: default/`governed-kernel` com espaços/desconhecido, frontier com adapter, sem adapter e adapter sem `planStep`; mapping de envelope completo e mínimo; composição com e sem opcionais; faltas de policy/toolExecutor/outbox e modos duráveis sem journal/atestado) | PASS: 5 testes | [slice3c-coverage.log](slice3c-coverage.log) |
| Coverage focado — arquivo da fatia 3c | **100% per-file** em statements/funções/branches | [slice3c-coverage-final.json](slice3c-coverage-final.json) (sha256 `b5a6893c1f1dda50…`) |
| Regressão nos 28 arquivos já fechados | Sem gaps | [slice3c-coverage-final.json](slice3c-coverage-final.json) |
| Suíte dos pacotes no mesmo run | PASS: 57 arquivos/744 testes | [slice3c-coverage.log](slice3c-coverage.log) |
| Boundary gate | PASS: 0 diagnósticos | `node scripts/check-product-boundary.mjs` |

- Sem mudanças de produção nesta fatia.

## Fatia 3d — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice3d.test.ts` (matrizes de `pauseCodeFromGate`/`modelGateStopCode`; pause switch ausente/falso/verdadeiro/lançando; gates de modelo `MAX_MODEL_CALLS`/`MAX_DURATION` na pré-chamada e no gate; deadline imediato e por timer real; modelo completado e não registrado; tool sucedida/`threw`/gate de duração/pausa; `stopReason` cancelado/estourado; dispose) | PASS: 6 testes | [slice3d-coverage.log](slice3d-coverage.log) |
| Coverage focado — arquivo da fatia 3d | **100% per-file** em statements/funções/branches | [slice3d-coverage-final.json](slice3d-coverage-final.json) (sha256 `8c4f43f5f28d8775…`) |
| Regressão nos 29 arquivos já fechados | Sem gaps | [slice3d-coverage-final.json](slice3d-coverage-final.json) |
| Suíte dos pacotes no mesmo run | PASS: 58 arquivos/750 testes | [slice3d-coverage.log](slice3d-coverage.log) |
| Boundary gate | PASS: 0 diagnósticos | `node scripts/check-product-boundary.mjs` |

- Simplificações mínimas: `withDeadline` com timer definitivo (executor síncrono), `dispose` sem o `catch`/optional (boot interno fixo não falha), `readPause`/verdict sem o fallback inalcançável de código de pausa (pausado sempre registra código). Supressões novas: 5 (mapeamento defensivo de `failed`/`confirm_failed`/`not_started`, resultado de modelo sempre estocado, guarda de request e o spread de signal sempre presente) — **23** no cartão.

## Fatia 3e-i — procedimentos e decisões (runtime.ts em andamento)

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice3e1.test.ts` (pausa no gate e após o modelo, política que lança, orçamento de modelo zerado, deadline de modelo real e cancelamento pós-falha, pausa no guard do tool, deadline/cancelamento de tool, sucesso/falha de tool com cancelamento tardio) | PASS: 7 testes | [slice3e1-coverage.log](slice3e1-coverage.log) |
| **Defeito real corrigido no núcleo** | `raceInvoked` (kernel/pipeline.ts) iniciava a operação e, se o orçamento expirasse antes do race, abandonava a promise sem handler — uma rejeição tardia virava **unhandled rejection** (risco de crash no Node ≥15). Guarda: `void running.catch(() => undefined)`; teste de falha tardia de tool. | `packages/harness/src/kernel/pipeline.ts` |
| Coverage parcial — `runtime.ts` (região ≤1010) | **0 gaps** em statements/branches na região inicial do turno; restam **34 stmts/40 branches** na região de execução durável (>1010) para a 3e-ii | [slice3e1-coverage-final.json](slice3e1-coverage-final.json) (sha256 `ac3d6f938b92f0a6…`) |
| Regressão nos arquivos fechados (incl. `kernel/pipeline`) | Sem gaps | [slice3e1-coverage-final.json](slice3e1-coverage-final.json) |
| Suíte dos pacotes no mesmo run | PASS: 59 arquivos/757 testes | [slice3e1-coverage.log](slice3e1-coverage.log) |
| Boundary gate | PASS: 0 diagnósticos | `node scripts/check-product-boundary.mjs` |

- Simplificações mínimas: `endSpan` mantém o guard para spans opcionais das fases duráveis (ignore local), fallback de código de pausa removido (o controle de pausa é o único gate de before-step). Supressões novas nesta fatia: 10 (ramo inalcançável de budget no gate de modelo e tool, posts de stop após sucesso/falha/rejeição já decididos pelo race, e mapeamentos defensivos) — consolidar no documento do gate final.

## Fatia 3e-ii — procedimentos e decisões (fecha a fatia 3)

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice3e2.test.ts` (região durável: deadline durante a leitura de aprovação, pausa antes da reserva, pausa após efeito iniciado e antes do corpo, pausa no último guard antes do tool, mapeamento de journal/approval em cada outcome) | PASS: 4 testes | [slice3e2-coverage.log](slice3e2-coverage.log) |
| Coverage focado — `runtime.ts` completo | **100% per-file** em statements/funções/branches | [slice3e2-coverage-final.json](slice3e2-coverage-final.json) (sha256 `f1ba222d3a8c8010…`) |
| Regressão nos 30 arquivos fechados | Sem gaps | [slice3e2-coverage-final.json](slice3e2-coverage-final.json) |
| Suíte dos pacotes no mesmo run | PASS: 59 arquivos/761 testes | [slice3e2-coverage.log](slice3e2-coverage.log) |
| Boundary gate | PASS: 0 diagnósticos | `node scripts/check-product-boundary.mjs` |

- Supressões defensivas adicionais na região durável (aprovadas por composição: capacidades com aprovação exigem durabilidade; `preToolStop`/posts de stop já decididos pelo race; ids de aprovação sempre presentes no turno de execução) — consolidar no documento do gate final.

## Fatia 4 — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Guarda `pdsh-031-slice4.test.ts` no contrato (não-objeto, enums inválidos, opcionais string/array inválidos, decisões sem seleção, ASK_USER em todas as formas inválidas, válidos e guard `isLoopDecision`) | PASS: 5 testes | [slice4-coverage.log](slice4-coverage.log) |
| Coverage focado — `execution-v2.ts` | **100% per-file** em statements/funções/branches | [slice4-coverage-final.json](slice4-coverage-final.json) (sha256 `db8c6bc49d36cd6c…`) |
| Regressão nos 31 arquivos de produção fechados | Sem gaps | [slice4-coverage-final.json](slice4-coverage-final.json) |
| Suíte dos pacotes no mesmo run | PASS: 59 arquivos/766 testes | [slice4-coverage.log](slice4-coverage.log) |
| Boundary gate | PASS: 0 diagnósticos | `node scripts/check-product-boundary.mjs` |

- **Decisão da fatia 4 (registrada):** `harness/src/evals/phase3-fixtures.ts`, `harness/src/evals/loop-evals.ts` e `harness/src/__tests__/fixtures/phase3-fixtures.ts` são código de suporte a teste/eval (não runtime de produção) e ficam **excluídos da obrigação de 100% per-file**, com justificativa no documento versionado do gate final; seguem exercitados indiretamente pelas suítes que os consomem. Com isso, todos os arquivos de produção do baseline estão fechados; falta apenas o gate per-file + documento de justificativas e o fechamento do cartão.

## Gate per-file — procedimentos e decisões

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Gate implementado em `vitest.config.mts` (flag `CVG_COVERAGE_PER_FILE=1`, globs 100% per-file para os quatro pacotes, `perFile: true`), script `npm run test:coverage:per-file`, exclusão dos 3 arquivos de suporte documentada no config | PASS no run completo | [0610](../../0610_pdsh031_per_file_justifications_2026-10-12.md) |
| Run completo do gate (suíte inteira) | **0 erros de threshold**; 404 arquivos (381 passed, 23 skipped), 3249 testes passed; globais S 90.27/B 86.75/F 92.32/L 91.07 | [per-file-gate-full.log](per-file-gate-full.log); [per-file-gate-coverage-summary.json](per-file-gate-coverage-summary.json) (sha256 `df85b608fee5bf43…`) |
| Dependência de workspace | `vitest` adicionado a `packages/contracts` (o pacote passou a ter teste) — gate de manifesto de workspaces PASS | `tests/workspace-dependency-manifest.test.js` |
| Documento de justificativas | criado com gate, exclusões de suporte, 47 regiões de supressão `v8 ignore` e reprodução | [0610](../../0610_pdsh031_per_file_justifications_2026-10-12.md) |

## Método e decisões

- Gaps cobertos com testes de contrato reais (erros de boot do registry, correlação errada do log de sessão, leitura de stream não aberto, manifesto inválido/`JSON.parse` não-Error, limite de nós do canonical, profondidade/ciclo/NaN/bigint/function/symbol, orquestrador estático limitado, gateway scriptado esgotado, resposta do modelo sem JSON, regras que abstêm, `maxDecisionRepairs` NaN e falha não-Error no parse).
- **Uma única supressão de coverage:** o `default:` do switch de `typeof` em `canonical-json.ts` é inalcançável (o `typeof` esgota todos os casos) e ficou sob `/* v8 ignore start/stop */` com comentário de justificativa. Nenhum comportamento mudou.
- Sem mudanças de contrato público; nenhum arquivo de `products/**`, `apps/**` ou `legacy/**` tocado; sem commit/push.

## Restante (próximas fatias)

- Fatia 2d: `kernel/{kernel-runtime,pipeline}`, `effect-journal`, `capability-boundary`, `iterative-{dispatch,runtime}`, `execution-spine`, `createOperationalHarness`.
- Fatia 3: `agent-runtime` (bridge, runtime, recovery, composition, journals) — os worst offenders de branches.
- Fatia 4: `contracts/execution-v2.ts` (maior gap concentrado) e decisão sobre fixtures/evals (`harness/src/evals/*`, `__tests__/fixtures/*`).
- Fechamento: gate per-file no `vitest.config.mts` + documento de justificativas + suíte completa/PG/E2E e ledgers.
