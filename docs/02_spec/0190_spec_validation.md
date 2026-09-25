# 0190 — SPEC Validation

## L03 operational index generator — draft v0.4, not approved

- [SPEC-DOC-001](0129_l03_operational_index_generator.md), revision 0.4, SHA-256 `7a144a686d7a5ce7333efa50c7f476b662b9da4a6b97936f85a0bb07504bc0a9`, is `SPEC_DRAFT_FOR_REVIEW` for the internal documentation utility in L03/P3-S7. The L03 backlog is its originating requirement; no product-facing PRD applies to this tool-only scope.
- Revision 0.4 defines ordered stopping at the first current/history delimiter, line-oriented handling of list/quote prefixes, inline-code and indented-link behavior, link/title grammar, and strict UTF-8 scope for inputs and index target. The lead-only critique is [AUD49-DOC-001](../04_audit/evidence/AUD-20260924/L03-generator-spec/critique-and-revision-03.md); independent I1 creation was refused by the service (`agent thread limit reached`). Earlier revisions remain in [AUD39](../04_audit/evidence/AUD-20260924/L03-generator-spec/spec-preparation.md) and [AUD40](../04_audit/evidence/AUD-20260924/L03-generator-spec/critique-and-revision-02.md).
- Independent and human review, and integrated verification: `NOT_RUN`. This record does not approve BUILD, tests, or command execution. A separate hash-bound gate is required before implementing the generator; C1K, C1H and manual AUD38 approval scopes do not transfer.
- The SPEC limits the generator to a marked navigation block, reads only allowlisted current-ledger sections, and preserves all source ledgers and historical content. First marker bootstrap remains a separate gate/delta.

## SPECs do ciclo AUD-0573 — draft, não aprovadas

- [SPEC-DOC-002](0130_doc_link_checker_extraction.md) (RA25-03) e [SPEC-OPS-001](0131_worker_startup_error_redaction.md) (RA25-06) estão `SPEC_DRAFT_FOR_REVIEW`. Revisão independente e humana, e verificação integrada: `NOT_RUN`. Registros aqui não aprovam BUILD nem substituem os gates `SPEC_APPROVED_CONTROLLED_BUILD` abaixo.
- Os dois BUILD foram executados sob a instrução explícita do usuário de 2026-09-25 (“Implemente todo o conteúdo dos documentos planejados”) no ciclo [AUD-0573](../04_audit/0573_repository_audit_executed_gates_2026-09-24.md), a partir dos itens RA25-03 e RA25-06 de [0351](../03_build/0351_audit0573_backlog.md). A ausência de aprovação humana específica está declarada no veredito da rodada.
- Escopo: utilitário interno de documentação e redação de erro no entrypoint do worker. Nenhum gate de produção, dado real, integração externa, IdP ou canal é afetado; produção permanece `NO_GO`.

- [SPEC-CERT-001](0132_run_bound_closure_registry.md) (AUD53 / RA25-11) está `SPEC_DRAFT_FOR_REVIEW`. Revisão independente e humana, e verificação integrada: `NOT_RUN`. A distinção adjudicação imutável versus vínculo gerado foi aprovada pelo usuário em 2026-09-25 sobre o packet [0575](../04_audit/0575_aud53_closure_rebind_decision_packet.md) e verificada por `npm run certify` (16 gates) e `npm run certification:verify` (exit 0).

- [SPEC-STRUCT-001](0133_iterative_runtime_slice_extraction.md) (RA25-07) está `SPEC_DRAFT_FOR_REVIEW / BUILD_NOT_AUTHORIZED`: traz o recon medido de `packages/harness/src/iterative-runtime.ts` e o plano da primeira fatia, mas a extração não foi executada e exige gate de BUILD próprio. Revisão independente e humana: `NOT_RUN`.

## Gate específico P1-S1 / M07 SPEC — aprovado; M07-S1 BUILD aguarda decisão

`SPEC_APPROVED_FOR_M07_S1_GATE_PREPARATION`: em 2026-09-23, o usuário respondeu “eu aprovo a Spec e as propostas”. Isso aprova SPEC-M07-001 e suas quatro recomendações para preparar o pedido e baseline do gate local M07-S1. A revisão lead I0 está registrada; a crítica independente I1 ficou `UNAVAILABLE` porque o serviço rejeitou nova thread por limite de agentes, então o veredito permanece `CONDITIONAL_PASS`; a verificação integrada continua `NOT_RUN`. Esta decisão não autoriza código, testes, builds, typecheck, lint ou execução de BUILD. O pedido concreto [M07-S1 BUILD](../04_audit/evidence/AUD-20260923/M07-BUILD-S1/build-gate-request.md) está `PENDING_HUMAN_M07_S1_BUILD_GATE`; é necessária nova aprovação humana do escopo, candidato e comandos. Evidências: [registro da decisão humana](../04_audit/evidence/AUD-20260923/M07-SPEC/human-decision-20260923.md), [pedido SPEC](../04_audit/evidence/AUD-20260923/M07-SPEC/spec-gate-request.md) e [M07-SPEC](../04_audit/evidence/AUD-20260923/M07-SPEC/). G21-5/G21-6 permanecem fechados e produção NO_GO.

## Gate incremental REM-0539 R2 — 2026-09-05

`SPEC_APPROVED_CONTROLLED_BUILD`: [0123_rem0539_r2_contract.md](0123_rem0539_r2_contract.md). REM-08 e a prova PostgreSQL foram fechadas; o usuário autorizou o BUILD local controlado. Integrações externas, dados reais e produção permanecem bloqueados.

## Gate incremental REM-0539 R3/R4/R5 — 2026-09-05

`SPEC_APPROVED_CONTROLLED_BUILD`: [0124_rem0539_r3_contract.md](0124_rem0539_r3_contract.md), [0125_rem0539_r4_integrations_ops.md](0125_rem0539_r4_integrations_ops.md) e [0126_rem0539_r5_qualification.md](0126_rem0539_r5_qualification.md). A autorização cobre somente BUILD/AUDIT controlado com fixtures e adapters locais.

## Gate incremental REM-0539 R1 — 2026-09-05T10:35:31.994051+00:00

`SPEC_APPROVED_CONTROLLED_BUILD`: [0122_rem0539_r1_contract.md](0122_rem0539_r1_contract.md). Execução local autorizada pelo usuário; contratos corretivos registrados antes de BUILD. Não altera gates de dados reais, integração externa ou piloto.

## Histórico anterior

## Alinhamento com PRD

- [x] Toda decisao tecnica deriva do PRD ou blueprint.
- [x] Nenhum desvio de produto foi introduzido sem registro.
- [x] Casos de uso principais cobertos.

## Arquitetura

- [x] Estilo arquitetural definido.
- [x] Justificativas claras.
- [x] Fronteiras do sistema claras.

## Dominio

- [x] Entidades definidas.
- [x] Estados definidos.
- [x] Invariantes registradas.

## Modulos

- [x] Responsabilidades claras.
- [x] Dependencias aceitaveis.
- [x] Riscos de acoplamento registrados.

## Contratos

- [x] Contratos de aplicacao definidos.
- [x] Contratos de API definidos.
- [x] Eventos assincronos definidos.

## Dados

- [x] Persistencia definida.
- [x] Integridade e migracao consideradas.
- [x] Auditoria considerada.

## Seguranca e governanca

- [x] Permissoes coerentes.
- [x] Acoes sensiveis auditaveis.
- [x] Segregacao de responsabilidades tratada.

## Integracoes

- [x] Integracoes justificadas.
- [x] Falhas previstas.
- [x] Contingencia definida.

## Operacao

- [x] Observabilidade minima definida.
- [x] Criterios operacionais claros.

## Build

- [x] Plano de build faseado.
- [x] Backlog estruturado.
- [x] Matriz de dependencia coerente.

## Resultado do gate

```txt
STATUS: CONDITIONAL_READY_FOR_PHASE_0_PLANNING
CONDICAO: Phase 0 pode preparar fundacao tecnica; fluxos funcionais sensiveis seguem bloqueados ate decisao humana de agenda, autonomia, RAG institucional e retencao
```

## Nao autorizado por este gate

- Uso com dados reais.
- Rollout com operadores.
- Confirmacao automatica de consulta.
- RAG institucional sem fonte aprovada.
- Qualquer acao clinica, financeira ou de prontuario sem approval e policy versionada.

## Exigencias antes de codar funcionalidades

- Testes, lint e typecheck executaveis desde Phase 0.
- Contratos compartilhados versionados antes de API/worker/web.
- Policy fail-closed implementada antes de qualquer tool sensivel.
- Auditoria append-only antes de integracoes externas.
- Documentar decisao humana para agenda, autonomia, RAG e retencao.
