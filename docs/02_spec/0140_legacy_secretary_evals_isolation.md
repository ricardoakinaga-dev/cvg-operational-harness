# 0140 — SPEC: evals neutros do harness e isolamento dos evals da secretária

- ID: `SPEC-LEGACY-003`
- Estado: `EXECUTED` em 27/09/2026 (trilha T2). Trilha T2 da
  [governança proporcional](../07_agents/AGENTS.md): código de avaliação sem
  efeito externo e sem mudança de contrato público de runtime. Autorização:
  divisão de frentes confirmada pelo usuário em 27/09/2026 (Claude Code com a
  frente FL) e claim em [agent_coordination](../08_runtime/agent_coordination.md).
- Task: PR-L06 de [0356](../03_build/0356_production_backlog_2026-09-26.md).

## Recon medido (27/09/2026, `948a5af`)

- `packages/agent-evals/src/contracts.ts`: `EvalCategorySchema` é um enum com
  18 categorias da secretária (`agendamento`, `exames`, `internacao`,
  `convenio`…) e a intenção usa `IntentSchema` de `@cvg/shared`
  (`identify_owner_pet`, `triage`, `scheduling`…).
- `packages/agent-evals/src/agent.ts`: 21 regras. Seis são proteções neutras
  (`prompt_injection`, `tool_injection`, `fake_admin`, `approval_bypass`,
  `human_handoff`, `aggressive_client`, `ambiguous`); as demais são do domínio
  (agenda, exames, internação, alta, convênio) ou usam vocabulário dele
  (`cross_tenant` com "outra clínica", `social_engineering` com "sou o médico").
- `packages/agent-evals/src/datasets/core.ts`: 56 cenários, todos do hospital
  veterinário; 14 adversariais.
- Consumidores: `agent-evals.test.ts`, `scripts/phase10-eval-report.ts`
  (gera `certification/agent-eval-report.json` no `certify`). A certificação
  depende só de `eval-thresholds.json` e do caminho do relatório.

## Desenho

1. O contrato passa a aceitar categoria e intenção como identificadores
   (`^[a-z][a-z0-9_]*$`); cada corpus declara suas categorias.
2. `DeterministicEvalAgent` recebe a lista de regras; o harness exporta as
   regras neutras de proteção e um domínio de referência de "solicitações
   operacionais" com as capacidades do `REFERENCE_POLICY_PROFILE`.
3. `CORE_EVAL_DATASET` passa a ser o corpus neutro de referência (≥ 40
   cenários, ≥ 12 adversariais, todas as categorias declaradas), com os mesmos
   thresholds de `eval-thresholds.json`.
4. O corpus, as categorias e as regras da secretária vão byte a byte para
   `legacy/packages/secretary-profile/src/evals/`, com o teste antigo, e
   continuam passando nos mesmos thresholds.

## Regras

1. R1 — thresholds e métricas não mudam; o corpus neutro precisa passar neles.
2. R2 — o agente legado com as regras legadas produz exatamente os mesmos
   resultados no corpus legado (teste movido sem mudar asserções).
3. R3 — nenhum termo do legado em `packages/agent-evals`.
4. R4 — não regerar `certification/agent-eval-report.json` nesta task (é do
   `certify`, frente do Codex); o relatório será regenerado na próxima
   certificação.

## Critério de pronto

`test:evals`, `npm test` com PostgreSQL, `typecheck`, `lint`, `format:check`
e `docs:check-links` verdes; `git grep` sem vocabulário da secretária em
`packages/agent-evals`.

## Execução — 27/09/2026

- `packages/agent-evals`: categoria e intenção validadas como identificadores
  (`EvalIdentifierSchema`); `DeterministicEvalAgent` recebe as regras;
  exporta `EVAL_GUARD_RULES` (injeção, ferramenta, falso admin, contorno de
  approval, cruzamento de tenant, engenharia social, decisão restrita, risco
  urgente, handoff humano), `REFERENCE_DOMAIN_EVAL_RULES` e
  `REFERENCE_EVAL_RULES`; `CORE_EVAL_DATASET` virou o corpus neutro de
  referência: 48 cenários, 14 categorias declaradas em `CORE_EVAL_CATEGORIES`,
  14 adversariais (os mesmos ataques do corpus antigo, sem termos do legado).
- Legado: corpus de 56 cenários, 18 categorias e 19 regras movidos para o
  pacote próprio `legacy/packages/secretary-evals` (`@cvg/legacy-secretary-evals`) (dados e regras byte a byte;
  `git mv` do corpus e do teste); `createSecretaryEvalAgent()` usa o mesmo
  mecanismo. O teste movido manteve todas as asserções (R2).
- Gates (Node 22.23.2): `typecheck` sem erros nos arquivos desta task (há um
  erro em `apps/worker/src/__tests__/operational-harness-homolog.integration.test.ts`,
  trabalho em andamento do Codex, SPEC 0141); `eslint` limpo; `test:evals` 2
  arquivos / 12 testes; corpus neutro e legado 19 testes PASS nos mesmos
  thresholds; legado, arquitetura e workspace 13 arquivos / 86 testes;
  auditor de dependências com os mesmos 11 findings aceitos. Varredura de
  vocabulário do legado em `packages/agent-evals`: nenhuma ocorrência (R3).
- Lockfile: a nova dependência `@cvg/agent-evals` do pacote legado entrou no
  índice como trecho isolado, sem incluir as mudanças de fonte do Codex que
  estavam no mesmo arquivo.
- `certification/agent-eval-report.json` não foi regerado (R4).
- Correção durante a execução: a primeira versão colocou os evals dentro de
  `@cvg/legacy-secretary-profile` e os reexportou pelo índice. Como a API
  compõe esse pacote, o processo real da API passou a carregar
  `@cvg/agent-evals` e falhou (`identity-composition-wiring.test.ts`); na
  imagem de produção esse pacote nem é compilado. Os evals foram para um pacote
  legado separado, que nenhum runtime compõe; o teste voltou a passar e
  `build:runtime` compila só `legacy/packages/secretary-profile`.
- Suíte completa com PostgreSQL antes da correção: 318 arquivos, 1 falha (a
  acima); depois da correção, os 15 arquivos afetados (107 testes) passam.
