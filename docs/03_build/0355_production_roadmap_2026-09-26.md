# Roadmap — programa PROD-20260926 — produção controlada

- Status: `PROPOSED / WAITING_HUMAN_APPROVAL`. Nenhuma fase está autorizada.
- Plano executivo: [0354](0354_production_executive_plan_2026-09-26.md).
  Backlog: [0356](0356_production_backlog_2026-09-26.md). Baseline:
  [AUD-0577](../04_audit/0577_production_readiness_score_audit_2026-09-26.md).
- Semanas contadas a partir da aprovação do plano (S1). Durações são
  estimativas de planejamento e devem ser revistas no fim de F1.

## Visão geral

```txt
S1   S4   S8   S12  S16  S20  S24  S28  S32  S36
F0 ████
F1 ██████
F2      ██████████████
F3      ████████████
F4      ████████████
F6      ██████████████████████
F5              ████████████████
F7                              ████████████████
                                ^UAT  ^piloto  ^GA
```

## Caminho crítico

`F0 → F1 (D-03, D-05, D-06, D-09) → F3 (IdP) + F4 (RIPD, RLS) → F5
(provider, canal) → F7 (UAT → piloto → GA)`.

F6 não fica no caminho crítico se começar em S5; se atrasar, o staging de
F7 atrasa junto.

## F0 — Base verificável e higiene (S1–S4)

- Objetivo: qualquer pessoa reproduz o certificado a partir de um checkout
  limpo, e o repositório volta a ter tamanho e navegação razoáveis.
- Tasks: PR-001 a PR-009.
- Gate de saída `G-F0`: `git status` limpo; `certification:verify` exit 0 em
  CI com Node 22 e PostgreSQL; `npm test` sem skips com banco; índice git
  sem `state.json` do Gauntlet; ledgers vigentes com menos de 300 linhas.

## F1 — Decisões de produto e escopo (S1–S6)

- Objetivo: saber exatamente o que vai para produção, com quem e sob qual
  processo.
- Tasks: PR-101 a PR-109. Etapa CVG: DISCOVERY e PRD.
- Gate de saída `G-F1`: PRD adendo de produção aprovado; D-03 a D-13
  registradas; governança proporcional aprovada; M07-S1 fechada ou
  reclassificada.

## F2 — Fundação de engenharia (S5–S18)

- Objetivo: reduzir o risco de mudança antes de ligar integrações reais.
- Tasks: PR-201 a PR-207. Uma fatia por SPEC, sem mudança de
  comportamento.
- Gate de saída `G-F2`: nenhum arquivo de produção acima de 1 500 linhas;
  configuração validada no boot; dependências órfãs removidas; cobertura
  com denominador completo e margem de pelo menos 3 pp.

## F3 — Segurança e identidade (S5–S16)

- Objetivo: operador real autentica com IdP e MFA; segredos saem de env.
- Tasks: PR-301 a PR-307.
- Gate de saída `G-F3`: login OIDC com MFA em staging; rotação de segredos
  exercitada; imagens assinadas; threat model atualizado; pentest agendado.

## F4 — Dados, privacidade e LGPD (S5–S16)

- Objetivo: base legal e operação de dados sensíveis prontas antes do
  primeiro dado real.
- Tasks: PR-401 a PR-407.
- Gate de saída `G-F4`: RIPD aprovado pelo DPO; retenção aplicada; fluxo de
  direitos do titular testado; RLS obrigatório no boot; PITR com restore
  exercitado; contratos/DPA assinados.

## F5 — Integrações reais controladas (S12–S26)

- Objetivo: ligar provider, canal, RAG e agenda atrás de flags, com kill
  switch e evals, primeiro em staging com dados sintéticos.
- Tasks: PR-501 a PR-507. Cada integração exige PRD adendo e SPEC.
- Gate de saída `G-F5`: todas as integrações em staging, sintéticas, com
  evals acima da barra; testes negativos de agenda e de PII verdes; kill
  switch provado.

## F6 — Infraestrutura e operação (S5–S26)

- Objetivo: ambientes reproduzíveis e operação observável.
- Tasks: PR-601 a PR-608.
- Gate de saída `G-F6`: staging e produção criados por IaC; CD promove o
  mesmo digest; dashboards, alertas e SLOs ativos; runbooks revisados; drill
  de DR concluído; teste de carga no staging dentro do SLO.

## F7 — Homologação, piloto e GA (S24–S36)

- Tasks: PR-701 a PR-709.
- Marcos:
  - **M-UAT (S24–S27):** UAT com operadores e auditoria independente.
  - **M-PILOTO (S28–S32):** D-14 aprovado; um tenant, lista de contatos
    permitidos, horário comercial, approval em 100% das ações sensíveis,
    hypercare diário.
  - **M-GA (S33–S36):** D-15 aprovado; expansão gradual por tenant;
    auditoria de 30 dias.
- Critérios de saída do piloto: zero incidente de dado sensível; zero
  alteração de agenda sem approval; SLOs atingidos por 2 semanas
  consecutivas; taxa de handoff e satisfação dentro das metas de D-04.

## Regras de avanço

- Nenhuma fase começa sem o gate de entrada registrado nos ledgers.
- Gate reprovado mantém a fase aberta; não há compensação entre critérios.
- Mudança de escopo volta para F1.
- Qualquer incidente de dado sensível no piloto suspende o piloto (kill
  switch) até a análise ser concluída e registrada.
