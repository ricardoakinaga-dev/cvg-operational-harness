# Decisões humanas P1-S1 — 2026-09-23

Hora de registro: `2026-09-23T11:36:16Z`.

## M07 — aprovação da SPEC e das propostas

- Resposta humana: “eu aprovo a Spec e as propostas”. Registro em
  `2026-09-23T20:46:09Z` (hora de registro; a resposta não carregava timestamp).
- Decisão: SPEC-M07-001 e as quatro propostas aprovadas somente para preparar
  o gate BUILD local M07-S1 e o baseline do candidato.
- Decisões: conjunto candidato público limitado a `@cvg/harness`,
  `@cvg/harness-orchestrator` e `@cvg/harness-contracts`; demais packages
  `UNKNOWN`. Project references exigidos somente para owners explicitamente
  nomeados em profile de build aprovado (nenhum profile foi aprovado aqui).
  Classificação explícita separa produção, teste, build-only, type-only e
  unresolved; role desconhecida falha fechado. Nenhuma exceção ativa por
  padrão; futuras exceções exigem aresta, owner role, motivo, referência de
  aprovação, escopo de candidato e gatilho de revisão/saída.
- Limite: não autoriza implementação, teste, build, typecheck, lint, serviços,
  bancos, rede, integração externa, dados reais, ações sensíveis ou produção.
  I1 continua `UNAVAILABLE`, Gauntlet `CONDITIONAL_PASS` e verificação
  integrada `NOT_RUN`.
- Evidência: [registro M07-SPEC](../M07-SPEC/human-decision-20260923.md).

## M07 — PRD

- Resposta humana: “Approve for SPEC”.
- Decisão: PRD 0028 aprovado para preparar a SPEC documental M07.
- Hora registrada após a resposta: `2026-09-23T12:27:40Z`.
- Limite: não autoriza BUILD, código, testes, build, typecheck, lint, serviços, bancos, integrações externas, dados reais ou produção.
- Revisão preservada: PRD Gauntlet `CONDITIONAL_PASS`; D1–D6 passaram apenas na revisão lead I0; I1 independente indisponível; verificação integrada `NOT_RUN`.
- Evidência: [registro do gate PRD](../M07-PRD/human-decision-20260923.md).

## M07 — Discovery

- Resposta humana: “Approve for PRD”.
- Decisão: M07 Discovery aprovada como base para elaboração do PRD documental.
- Limite: esta aprovação não autoriza SPEC, BUILD, teste, alteração de código,
  integração externa ou produção.
- Evidência conservada: a revisão independente final de M07 foi
  `CONDITIONAL_PASS`; D4 continua com limitação de proveniência porque o packet
  original não continha o log de comandos e alterações da rodada. A decisão
  humana não transforma essa lacuna em evidência retroativa.

## M05 — Discovery e escolha de rota

- Resposta humana: “Approve both; choose A (recommended)”.
- Decisão: M05 Discovery aprovada para a fase documental PRD quando a ordem
  P1-S1 chegar a M05; opção A selecionada.
- Rota canônica: `/v1/executions` → `PostgresOperationalExecutionStore` →
  `OperationalExecutionWorker` (`operational-harness`) →
  `createOperationalHarness()`.
- Par legado selecionado: `published-agent` versus `kernel`.
- Dimensões de paridade a formalizar no PRD M05, derivadas do pacote P1-S1:
  tenant, session, policy, approval, tool, journal e resposta. O PRD deverá
  definir resultados observáveis para essas dimensões; não se presume
  equivalência interna de implementação.
- Limite: nenhuma SPEC, BUILD, integração externa ou produção é aprovada por
  estas decisões.
