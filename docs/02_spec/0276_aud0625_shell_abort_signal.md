# 0276 — F05: ligação cooperativa do cancelamento ao shell

Estado: **PROPOSED_FOR_HUMAN_T3_REVIEW**. Task `AUD0625-SANDBOX-DISCOVERY-CODEX-20261028`, atribuição9520. Baseline `a69030d3fa3cc22eccfd7eb9e1cb2ae2c3df7867`; nenhuma correção executada.

## Problema e recorte

O [F05](../04_audit/0625_repository_score_audit_2026-10-28.md#f05--p1p2-cancelamento-e-prazo-não-cobrem-todo-o-trabalho) reúne várias lacunas de prazo/cancelamento. Esta proposta trata a menor fatia: `ToolExecutionContext.signal` não chega ao runner de `shell.run`; um sinal já abortado ainda permite iniciar o backend. O [teste novo](../../tests/aud0625-shell-cancellation-red.test.ts) confirma essas duas falhas com runner sintético, sem lançar subprocessos. **Não é prova de processo sobrevivente, término de árvore, owner pausado/crash ou cleanup nativo.**

K08-B possui o contrato proposto de cancelamento cooperativo e efeito incerto; X01 possui a supervisão nativa. Sua revisão de desenho não é implementação aceita. Esta fatia não reconstrói LoopRun, canal terminal, relógio global, advisory, leases ou os47 oráculos de K08. Fechá-la futuramente não encerra todo o F05 da auditoria.

## Contrato proposto

1. Adicionar `readonly signal?: AbortSignal` aos requests de runner do shell e de `runContained`. A factory deve encaminhar a **mesma referência** capturada de `context.signal` tanto ao runner injetado quanto ao default, sem criar um controlador desconectado. Requests sem signal preservam a semântica de timeout vigente.
2. Se o sinal já estiver abortado na admissão, devolver ToolResult REJECTED com causa estável `command_cancelled_before_launch` e zero chamadas ao runner/spawn. Não executar efeito para depois reportar cancelamento. Registrar somente tipo de causa; não serializar reason arbitrário potencialmente sensível.
3. O backend default assina abort antes de iniciar o payload, verifica de novo na fronteira de lançamento e remove listeners/timers uma vez ao terminar. O aborto pede encerramento do recurso próprio. Um `AbortError`, kill solicitado ou `child.killed` isolado não provam quiescência. [Documentação Node](https://nodejs.org/api/child_process.html#subprocesskillSignal) distingue sinal de término; o futuro BUILD deve qualificar a API da versão22 efetivamente instalada.
4. Propor resultados discriminados `cancelled` e `cleanup_incomplete` na fronteira do runner, além de number/timeout/spawn_failed. O shell mapeia ambos para FAILED com causas estáveis, sem inventar sucesso nem retentar comando não idempotente. `cancelled` exige confirmação do encerramento/cleanup do recurso pelo supervisor qualificado; se isso não é demonstrável no orçamento original, usar `cleanup_incomplete` e preservar a incerteza. Esse novo contrato/result union é T3, com atualização de todos os consumidores e testes antes de uso.
5. Corrida de conclusão: resultado SUCCEEDED só é entregue se fechamento e conclusão bem-sucedida forem confirmados antes do cancelamento vencer a linearização. Aborto já observado impede sucesso tardio. Reentrância/duplicidade de error/close/abort não pode duplicar settlement, auditoria ou cleanup. Não acrescentar prazo depois do deadline do chamador.

## Fronteira com K08 e X01

O kernel continua sendo dono do prazo e da decisão terminal. K08 define reserva de cleanup, efeito incerto e captura do sinal/clock; X01 é a autoridade de contenção/árvore/namespace. **Sinal cooperativo não promete deadline independente do event loop**, resistência a SIGSTOP, crash ou PID reuse. Nenhum desses mecanismos será reimplementado por um novo timer nesta fatia.

Para a implementação nativa dos resultados do item4, compor somente um supervisor cuja prova/contrato X01 confirme custody e término dos recursos sob o mesmo orçamento. Se ainda não existir composição aceita, a fatia pode entregar encaminhamento/pre-abort e testes de seam, mas não afirmar `cancelled` nativo, quiescência ou fechamento integral. Registrar o restante como dependência aberta, não um PASS substituto.

Paths futuros: `packages/sandbox/src/shell-tool.ts`, `run.ts`, tipos do backend e testes dos consumidores afetados. `ToolExecutionContext` já tem signal. A coordenação com 81C4/K08 antecede código nesses paths; integração sequencial com0275, sem tomar writers privados. K08 SPEC3 mantém seu gateT3 separado; esta proposta não o aprova implicitamente.

## Aceite e evidência

| ID    | Oráculo obrigatório                                                                                              | Evidência desta fase                         |
| ----- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| F05-A | Context.signal é a mesma referência nos runners injetado e default                                               | Injetado RED; default futuro NOT_RUN         |
| F05-B | Já abortado: nenhum runner/spawn, REJECTED e causa estável                                                       | Zero chamadas RED; mapeamento futuro NOT_RUN |
| F05-C | Sem signal: argv/cwd/handle/timeout e erro/saída existentes preservados                                          | Controle positivo injetado                   |
| F05-D | Abort após start, aborto simultâneo ao close, duplicatas e listeners sem vazamento                               | Testes futuros obrigatórios                  |
| F05-E | Timeout/cancelamento não dão sucesso tardio; efeito incerto e zero retry automático                              | Dependência e oráculos K08 a qualificar      |
| F05-F | Resource próprio/descendentes/PID identity/reap/stdio fechados antes de cancelled; falha vira cleanup_incomplete | Supervisão X01 obrigatória, NOT_RUN aqui     |

Testes reais de árvore deverão usar payloads/descendentes sintéticos próprios e supervisor separado com caps prospectivos; nenhum sinal em PID de peer ou alteração de limite para obter verde. Rodar regressões0198, ambos os adapters, tipos/lint e barra T3 atual antes de aceite. Provas de seam não substituem as de sistema operacional.

## Rollout, risco e decisão

Adicionar union exige exaustividade em todos os consumidores. Em incompatibilidade, recusar o perfil cancelável e conservar NO_GO; não anunciar cancelamento enquanto recurso continua ativo. Reverter o fio de signal restabelece a lacuna conhecida e não é rollback promovível. Log/audit sem limite global e demais waits do F05 continuam no backlog K08; esta proposta não os encerra.

Próximo: DF encaminhar SHA e recorte ao Ricardo; só após autoridade explícita registrar gate de BUILD, ACK de composição e as provas nativas faltantes. Produção, push/merge/deploy e T3K08 não são autorizados por esta fase.
