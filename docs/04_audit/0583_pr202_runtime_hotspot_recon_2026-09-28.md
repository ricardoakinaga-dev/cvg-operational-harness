# AUD-0583 — recon da PR-202 no runtime de turnos

- Data: 28/09/2026. Baseline: `2e7e9ee`, [runtime.ts](../../packages/agent-runtime/src/runtime.ts) SHA-256 `0834639780a3c8c6a73d1d05edc5551d3a5ff432b9c921f83c4c285f8c849bf8`.
- Escopo: inspeção somente leitura de tamanho, limites de métodos e testes. Não há mudança de comportamento, dado real ou decisão de produção nesta recon.
- Estado: `RECON / SPEC_T2_PENDING / PRODUCTION_NO_GO`.

## Medição atual

O [backlog PR-202](../03_build/0356_production_backlog_2026-09-26.md) registra o dado histórico de `runTurn` com 2.233 linhas. O arquivo atual tem **2.609 linhas**, mas `runTurn` vai da linha 374 à 1.028, cerca de **655 linhas**. A classe já extraiu uma etapa privada de execução (`#runExecutionTurn`, linhas 1.036–1.664, cerca de 629), além de recuperação de reserva ativa (2.155–2.433, cerca de 279), falha de ferramenta, replay e reserva no journal. Portanto, não se deve planejar a fatia como se o `runTurn` inteiro ainda estivesse monolítico.

O risco remanescente concentra-se nas transições de approval/effect journal, certeza de não efeito, replay, orçamento por turno e fecho de spans. `#runExecutionTurn` chama outros métodos privados e `this.#options`; movê-lo mecanicamente para outro módulo exige contrato explícito de contexto/callbacks e prova de equivalência, sem afrouxar visibilidade ou controle de efeitos. Uma fatia menor pode ter melhor relação entre risco e redução, a definir na SPEC.

Baseline executável: `npx vitest run packages/agent-runtime/src/__tests__ packages/agent-evals/src/__tests__ --reporter=dot` em Node 22 passou **13 arquivos / 274 testes** (log local `/tmp/cvg-pr202-baseline-focused.log`). A suíte expõe 228 chamadas textuais a `runTurn` nos testes do pacote, mas contagem de chamadas não equivale a cobertura de cada transição. Antes de BUILD, mapear os negativos necessários, preservar assinaturas/ordem de side effects e estabelecer comparação estrutural da fatia movida.

A primeira fatia proposta é o ramo de solicitação de approval nas linhas 814–892 de `runTurn`: termina o turno em todos os caminhos, não lê `this.#` diretamente e já possui testes de proposal, request, falha e binding em `runtime-kernel-coverage`, `runtime-binding` e `agent-runtime`. Os testes de `agent-evals` usam outro agente determinístico e **não** exercitam `runTurn`; seu PASS é regressão lateral, não prova desta fatia. A [SPEC 0153](../02_spec/0153_pr202_approval_request_slice.md) delimita a extração e a comparação.

## Próximo gate

Registrar SPEC T2 curta com a fatia exata, dependências, limites de API privada, invariante de SQL/efeito e testes públicos/estruturais. Só então editar em worktree isolado, executar Node 22 (`typecheck`, `lint`, formato, `npm test`, PostgreSQL, E2E e evals) e crítica independente. PR‑L04 continua com API/web no checkout compartilhado; a fatia da PR‑202 não toca seus caminhos.
