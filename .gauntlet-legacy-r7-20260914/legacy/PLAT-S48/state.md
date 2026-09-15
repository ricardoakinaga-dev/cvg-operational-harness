# Gauntlet state — CVG Agent Platform

## Goal

Deliver the modular CVG Agent Platform while preserving the legacy Secretary data plane, with a production-grade security and operational boundary. The current release remains controlled until real-data, identity, infrastructure and sensitive-action decisions are explicitly approved.

## Non-negotiable constraints

- No real data, credentials, external dispatch, real provider/channel calls or irreversible migration in this run.
- No automatic confirmation, cancellation or rescheduling of real appointments.
- No clinical, financial or definitive medical-record action.
- No RAG answer without an approved institutional source and version.
- Sensitive actions require approval or human handoff.
- Every material task is registered before BUILD and verified with executable evidence.

## Quality bar v1

| ID      | Criterion                                                           | Required evidence                                                          | Current state                              |
| ------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------ |
| CTRL-01 | Agent/version config is immutable and tenant-scoped                 | unit, API, E2E and PostgreSQL controlled gates                             | PASS controlled                            |
| CTRL-02 | Gateway, policy, approval and Test Lab fail closed                  | focused tests, trace redaction and independent review                      | PASS controlled                            |
| CTRL-03 | Legacy Secretary remains operational in fixture mode                | full verify, API/E2E and PostgreSQL smoke                                  | PASS controlled                            |
| PROD-01 | Trusted IdP identity is tenant-bound and RBAC is authoritative      | issuer/audience/key rotation and negative authorization evidence           | BLOCKED human/infra                        |
| PROD-02 | Legacy data plane is database-enforced tenant isolated              | versioned migration, forced RLS, pool context, cross-tenant negative tests | CONTROLLED PASS; real rollout blocked      |
| PROD-03 | Approval issuer/verifier is durable, scoped, expiring and revocable | persistent authority, replay/expiry/revocation tests and audit chain       | BLOCKED                                    |
| PROD-04 | Legacy ToolRegistry executes only through one capability gateway    | adapter contract, side-effect audit and deny-by-default tests              | BLOCKED                                    |
| PROD-05 | Distributed rate limit, replay/HMAC and host security are enforced  | Redis/edge configuration and integration evidence                          | BLOCKED human/infra                        |
| PROD-06 | Control plane has optimistic multi-operator conflict handling       | version/ETag conflict tests and UI recovery                                | CONTROLLED PASS; real coordination blocked |
| PROD-07 | Provider/channel adapters are durable, leased and compensating      | fake and contract tests plus human-approved activation boundary            | BLOCKED human/infra                        |
| PROD-08 | Audit, retention, purge and PII governance are operational          | tenant-aware append-only schema, purge evidence and signoff                | BLOCKED human                              |

## Quality bar v2 — PLAT-S05 controlled closure

| ID      | Criterion                                                                | Required evidence                                       | Current state   |
| ------- | ------------------------------------------------------------------------ | ------------------------------------------------------- | --------------- |
| CTRL-05 | Test Lab identifies sensitive veterinary medication requests safely      | red/green platform and legacy policy tests              | PASS controlled |
| CTRL-06 | Test Lab trace is investigation-complete without raw sensitive payloads  | trace contract, persistence, API/UI and redaction tests | PASS controlled |
| CTRL-07 | Capability gateway rejects malformed scope IDs before handler resolution | negative gateway tests and no handler invocation        | PASS controlled |
| CTRL-08 | Control Center preserves configured knowledge provenance                 | UI request regression and browser/API evidence          | PASS controlled |
| CTRL-09 | Legacy Secretary and controlled production boundary remain unchanged     | full verify, readiness, E2E and audit review            | PASS controlled |
| CTRL-10 | Development bootstrap exposes one immutable `CVG Secretary` preset       | preset lifecycle and API bootstrap tests                | PASS controlled |

## Stop rule

Do not claim `PRODUCTION_REAL_DATA_READY` while any PROD criterion lacks evidence or requires a human/infrastructure decision. Continue controlled construction through the remaining safe lanes and leave the goal active until the full bar is met or the same external blocker repeats for three consecutive goal turns.

## Continuity

- Canonical project state: `docs/99_runtime_state.md`, `docs/20_master_execution_log.md`, `docs/30_backlog_master.md`.
- Current task: `PLAT-S48_CONTROLLED_BASELINE_DETERMINISM`
  (`COMPLETED_CONTROLLED` in AUDIT; no production authorization changed).

## Quality bar v45 — PLAT-S48 controlled baseline determinism

| ID       | Criterion                                                    | Required evidence                                    | Current state   |
| -------- | ------------------------------------------------------------ | ---------------------------------------------------- | --------------- |
| CTRL-186 | Approval gateway and authority fixtures share one clock seam | focused gateway/authority regression                 | PASS controlled |
| CTRL-187 | Invalid, expired and replayed approvals remain fail-closed   | approval boundary negative tests                     | PASS controlled |
| CTRL-188 | API-backed timeline assertion is semantically scoped         | app regression with duplicate preview/timeline text  | PASS controlled |
| CTRL-189 | Controlled baseline is reproducible across all gates         | full verify, coverage, readiness, worker, PG and E2E | PASS controlled |

## Round 150 — PLAT-S48 discovery e registro

- O baseline atual falhou em dois pontos reproduzíveis: `CapabilityGateway`
  compara expiração com `Date.now()` enquanto a autoridade do fixture usa
  clock injetado; `app.test.tsx` busca globalmente texto que existe no preview
  e na timeline.
- PRD, SPEC, ExecPlan, backlog, task catalog e runtime state registraram as
  duas tasks antes do BUILD. O próximo passo obrigatório é RED focado.
- Review independente será tentado quando a infraestrutura de agentes
  permitir; indisponibilidade não será convertida em PASS. Produção segue
  `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## Round 151 — PLAT-S48 auditoria e fechamento controlado

- O clock de approval tornou-se injetável com default real; a mesma função é
  compartilhada entre gateway e autoridade nos fixtures. Clock inválido,
  lançando e expiração local falham fechado antes de `verifyAndConsume`, sem
  consumo nem handler.
- A asserção web passou a consultar somente a timeline selecionada. Verify:
  127 arquivos/537 testes PASS, 2 arquivos/19 skipped; coverage
  84.87/80.12/84.98/85.98; readiness 4/4; worker; PostgreSQL 8/72; E2E 4/4;
  build 158 módulos; audit 0; typecheck/lint/format/diff PASS.
- Evidência publicada em `docs/04_audit/0538_plat-s48_controlled_deterministic_clock_and_test_contract_evidence.md`;
  S48 está `COMPLETED_CONTROLLED`. Produção permanece
  `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## Quality bar v38 — PLAT-S41 controlled output safety

| ID       | Criterion                                                   | Required evidence                            | Current state   |
| -------- | ----------------------------------------------------------- | -------------------------------------------- | --------------- |
| CTRL-158 | Final output is typed, bounded and redacted                 | focused output-policy tests                  | PASS controlled |
| CTRL-159 | Unsafe clinical/financial/record/action output is rewritten | unsafe fixture and runtime integration tests | PASS controlled |
| CTRL-160 | Output rewrite preserves mode, handoff and event coherence  | lifecycle event/trace regression             | PASS controlled |

## Quality bar v39 — PLAT-S42 controlled trace provenance

| ID       | Criterion                                                  | Required evidence                                     | Current state   |
| -------- | ---------------------------------------------------------- | ----------------------------------------------------- | --------------- |
| CTRL-161 | Trace sinks persist/return only canonical allowlisted data | governance, sink and suite regressions                | PASS controlled |
| CTRL-162 | Provider identity and output policy remain fail-closed     | malformed provider/field and output consistency tests | PASS controlled |
| CTRL-163 | PostgreSQL reads reject corrupted trace JSON               | mapper/listing negative tests and no unsafe return    | PASS controlled |

## Quality bar v40 — PLAT-S43 controlled trace temporal integrity

| ID       | Criterion                                                       | Required evidence             | Current state   |
| -------- | --------------------------------------------------------------- | ----------------------------- | --------------- |
| CTRL-164 | Trace timestamps and latency are complete, ordered and coherent | temporal parser regression    | PASS controlled |
| CTRL-165 | Trace spans preserve canonical order and bounded total duration | ordinal/duration regression   | PASS controlled |
| CTRL-166 | Derived span statuses match policy/tools/handoff/delivery state | status consistency regression | PASS controlled |

## Quality bar v41 — PLAT-S44 controlled trace stage timing

| ID       | Criterion                                                    | Required evidence             | Current state   |
| -------- | ------------------------------------------------------------ | ----------------------------- | --------------- |
| CTRL-167 | Executed stages receive monotonic measured durations         | timing ledger/unit regression | PASS controlled |
| CTRL-168 | Skipped stages remain zero and total duration is bounded     | span integration regression   | PASS controlled |
| CTRL-169 | Clock/ledger failures cannot carry payload or enable effects | failure-boundary regression   | PASS controlled |

## Quality bar v42 — PLAT-S45 controlled tool invocation boundary

| ID       | Criterion                                                   | Required evidence                                 | Current state   |
| -------- | ----------------------------------------------------------- | ------------------------------------------------- | --------------- |
| CTRL-170 | Every compiled tool has server-side input/output validators | registry strictness and validator contract tests  | PASS controlled |
| CTRL-171 | Effective actor authorization ignores caller grants         | authorizer and least-privilege gateway regression | PASS controlled |
| CTRL-172 | Invalid input cannot consume durable approval/handler       | adversarial gateway/approval regression           | PASS controlled |
| CTRL-173 | Handler results are projected, bounded and redacted         | output schema/result boundary regression          | PASS controlled |
| CTRL-174 | Audit failure cannot replay an executed capability          | audit-unavailable execution regression            | PASS controlled |
| CTRL-175 | Hostile cycles, proxies and config fail closed              | boundary/config safety regression                 | PASS controlled |

## Quality bar v43 — PLAT-S46 controlled execution trace correlation

| ID       | Criterion                                                    | Required evidence                                   | Current state   |
| -------- | ------------------------------------------------------------ | --------------------------------------------------- | --------------- |
| CTRL-176 | One execution resolves exactly one valid trace identity      | kernel identity/early-boundary regression           | PASS controlled |
| CTRL-177 | Lifecycle events and tool audits carry the execution traceId | event bus/gateway propagation regression            | PASS controlled |
| CTRL-178 | Invalid injected trace IDs fail before runtime side effects  | early validation and no-event/no-handler regression | PASS controlled |
| CTRL-179 | Trace persistence preserves the parent without payload leak  | governance/sink and redaction regression            | PASS controlled |

## Quality bar v44 — PLAT-S47 controlled multi-agent creation and scope hardening

| ID       | Criterion                                                | Required evidence                             | Current state   |
| -------- | -------------------------------------------------------- | --------------------------------------------- | --------------- |
| CTRL-180 | `Novo agente` resets only selected-agent UI state        | Control Center interaction regression         | PASS controlled |
| CTRL-181 | Agent A/B can be created in one tenant/session via UI    | real UI/API journey and distinct snapshots    | PASS controlled |
| CTRL-182 | Existing-agent edits remain immutable version clones     | clone request and snapshot regression         | PASS controlled |
| CTRL-183 | Agent switching cannot leak derived versions/trace state | selection isolation and tenant-aware requests | PASS controlled |
| CTRL-184 | Admin suite/ledger reads require an agent scope          | API negative tests without `agentId`          | PASS controlled |
| CTRL-185 | Trace Viewer redacts and tolerates legacy payload shape  | client/UI redaction and malformed-span test   | PASS controlled |

## Round 148 — PLAT-S47 auditoria corretiva e gates integrados

- A crítica independente anterior encontrou o histórico do Trace Viewer
  visível sem agente selecionado, leituras de suites/ledger sem `agentId`,
  possível reutilização de escopo após A→B→A e exposição de texto sensível no
  cliente. O ciclo RED também reproduziu `spans: {}` quebrando o painel.
- As correções filtram o histórico pelo agente corrente, tornam `agentId`
  obrigatório na fronteira HTTP e no cliente, redigem traces recursivamente,
  normalizam spans legados e usam geração monotônica de escopo no App.
- Gates atuais: regressão `127 arquivos PASS/2 skipped`, `534 testes PASS/19
skipped`; coverage `84,86/80,12/84,97/85,97`; build `158 módulos`; E2E
  `4/4`; PostgreSQL `8 arquivos/72 testes`; readiness `4/4`; worker smoke;
  audit `0`; typecheck, lint, format e diff check PASS. A crítica
  independente compatível final foi registrada como `PASS_CONTROLLED`, sem
  P0/P1/P2/P3.
- Sem provider, canal, RAG, rede, dado real, segredo ou side effect; produção
  permanece `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## Round 149 — PLAT-S47 veredito independente e fechamento

- O revisor compatível, independente e read-only concluiu
  `PASS_CONTROLLED`: P0 `0`, P1 `0`, P2 `0`, P3 `0`; nenhum arquivo foi
  alterado pelo revisor.
- CTRL-180 a CTRL-185 estão `PASS controlled`; S47 foi marcado
  `COMPLETED_CONTROLLED` em `AUDIT` em runtime state, execution log, backlog,
  tracking, task catalog, phase plan, PRD, SPEC, ExecPlan, security boundary,
  evidência e Gauntlet.
- A próxima ação é uma nova `DISCOVERY -> PRD -> SPEC` controlada. Produção
  real continua `NO-GO`/`WAITING_HUMAN_APPROVAL` por gates de IdP/tenant,
  infraestrutura/RLS, limiter/replay distribuídos, host security,
  retenção/PII, providers/canais/RAG e decisões sensíveis.

## Round 146 — PLAT-S47 RED observed

- O focused `multi-agent-creation.test.tsx` executou 1 arquivo/1 teste e
  falhou como esperado: a UI não expõe `Novo agente` depois do primeiro
  agente, bloqueando A/B na mesma sessão.
- O BUILD permanece controlado ao estado local da UI, sem provider/canal,
  rede, dado real ou side effect.

## Round 147 — PLAT-S47 GREEN corrective

- O focused passou 4 arquivos/9 testes e o E2E real passou 1/1, cobrindo A/B,
  reset, re-seleção/clone, tenant headers e resposta tardia de suite.
- O token de escopo invalida respostas assíncronas antigas; ainda faltam
  regressão completa, coverage e gates operacionais antes do AUDIT.

## Round 145 — PLAT-S47 discovery and SPEC registration

- Discovery reproduziu que, depois do primeiro agente ser criado/selecionado,
  slug/nome/descrição ficam `readOnly`, a ação vira `Salvar nova versão` e não
  existe `Novo agente`.
- S47 foi registrado com gate `SPEC_APPROVED_CONTROLLED_BUILD` para adicionar
  modo explícito de criação e provar Agent A/B no mesmo Control Center. O
  próximo passo obrigatório é RED; produção real continua NO-GO.

## Round 144 — PLAT-S46 AUDIT e fechamento controlado

- S46 foi fechado como `COMPLETED_CONTROLLED` em `AUDIT`. O RED registrou 4
  arquivos/33 testes, com 8 falhas esperadas; o GREEN final passou 6
  arquivos/25 testes.
- A regressão passou 126 arquivos/523 testes, com 2 arquivos/19 testes
  skipped; coverage 85,07/80,06/85,95/86,10; PostgreSQL 8/72; readiness 4/4;
  worker smoke; E2E 4/4; build 70 módulos; audit 0; typecheck, lint, format e
  diff check PASS.
- A revisão independente compatível read-only retornou `PASS` sem P0/P1/P2;
  a tentativa especializada incompatível não foi tratada como aprovação.
- CTRL-176 a CTRL-179 estão PASS controlled. O escopo segue sem OTel/exporter,
  rede, provider/canal real, RAG, broker, deploy, dado real ou side effect;
  produção permanece NO-GO/WAITING_HUMAN_APPROVAL.

## Round 143 — PLAT-S46 discovery and SPEC registration

- A próxima lacuna controlada é a ausência de uma relação parental única entre
  o trace final, eventos de lifecycle e tool audits; os IDs locais não serão
  substituídos.
- S46 foi registrado com gate `SPEC_APPROVED_CONTROLLED_BUILD`; o próximo
  passo obrigatório é RED. O escopo permanece sem OTel/exporter, rede,
  provider/canal real, RAG, broker, deploy, dado real ou side effect.

## Round 142 — PLAT-S45 AUDIT e fechamento controlado

- A revisão independente compatível read-only retornou `PASS sem P0/P1` após
  as correções do BUILD. A tentativa especializada incompatível não foi
  tratada como aprovação.
- A evidência `docs/04_audit/0535_plat-s45_controlled_tool_invocation_boundary_evidence.md`
  foi fechada como `COMPLETED_CONTROLLED`; CTRL-170 a CTRL-175 estão PASS
  controlled.
- Format check documental e demais gates permanecem PASS. A próxima ação é
  nova discovery/SPEC controlada; produção real continua NO-GO e sem qualquer
  autorização de efeito externo.

## Round 141 — PLAT-S45 BUILD and controlled gates

- O BUILD implementou validators server-side de input/output por tool,
  authorizer efetivo, autoridade durável de approval, clone bounded, projeção
  de resultado e retorno explícito `audit_unavailable` sem replay.
- O focused passou 6 arquivos/41 testes; a regressão passou 125 arquivos/512
  testes, com 2 arquivos/19 testes skipped. Cobertura ficou em
  85,01/80,14/85,82/86,03 (statements/branches/functions/lines).
- Readiness 4/4, worker smoke, PostgreSQL 6/53 com 2/19 skipped, E2E 4/4,
  build 70 módulos, audit 0, typecheck, lint e diff check passaram. A revisão
  independente compatível ainda precisa registrar a decisão final.

## Round 140 — PLAT-S45 discovery and SPEC registration

- Discovery local e paralela confirmou que o Capability Gateway encaminha
  `unknown` diretamente ao handler, consome `actor.permissions` sem schema e
  devolve resultado bruto sem projeção.
- Registrado `PLAT-S45-001_CONTROLLED_TOOL_INVOCATION_BOUNDARY` em backlog,
  PRD, SPEC, ExecPlan, runtime state, execution log, tracking, task catalog e
  gauntlet. O contrato exige validator server-side por tool, actor/input
  bounded e resultado redigido/bounded antes do retorno; próximo passo RED.
- Escopo permanece sem import dinâmico, marketplace, provider/canal real,
  rede, RAG, broker, egress, deploy, dado real ou side effect.

## Round 135 — PLAT-S43 registrado antes do BUILD

- Discovery read-only encontrou `createTraceSpans` emitindo `durationMs: 0`
  estático e ausência de invariantes entre timestamps, latência, ordem e
  status derivado.
- Registrado `PLAT-S43-001_CONTROLLED_TRACE_TEMPORAL_INTEGRITY` em backlog,
  PRD, SPEC, ExecPlan, runtime state, execution log, tracking, task catalog e
  gauntlet. O contrato mantém telemetria opcional legada válida e permanece
  sem OTel/exporter, provider/canal real, rede, RAG ou side effect.
- Gate `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório: RED
  focado. Produção real continua `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## Round 139 — PLAT-S44 auditoria e fechamento controlado

- `PLAT-S44-001_CONTROLLED_TRACE_STAGE_TIMING` foi fechado como
  `COMPLETED_CONTROLLED` em `AUDIT`. Focused 2/17; regressão 124/501 com
  2/19 skipped; coverage 85,18/80,44/85,70/86,16; PostgreSQL 8/72; E2E 4/4;
  readiness 4/4; build 70 módulos; audit 0; checks estáticos PASS.
- O clock monotônico injetável e o ledger bounded alimentam os spans sem
  payload/export/efeito externo. A revisão independente final não rodou por
  incompatibilidade do modelo e não foi tratada como aprovação.
- Evidência: `docs/04_audit/0534_plat-s44_controlled_trace_stage_timing_evidence.md`.

## Round 138 — PLAT-S44 registrado antes do BUILD

- Discovery read-only confirmou que `createTraceSpans` ainda emite
  `durationMs: 0` estático e não recebe clock/ledger.
- Registrado `PLAT-S44-001_CONTROLLED_TRACE_STAGE_TIMING` em toda a
  rastreabilidade. O contrato exige clock monotônico injetável, ledger bounded,
  durações finitas, skipped zero, soma compatível com latência e nenhum
  payload/export/efeito externo.
- Gate `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório: RED
  focado. Produção real continua `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## Round 137 — PLAT-S43 auditoria e fechamento controlado

- `PLAT-S43-001_CONTROLLED_TRACE_TEMPORAL_INTEGRITY` foi fechado como
  `COMPLETED_CONTROLLED` em `AUDIT`. Focused 1/14; regressão 124/499 com
  2/19 skipped; coverage 85,08/80,41/85,45/86,08; PostgreSQL 8/72; E2E 4/4;
  readiness 4/4; build 70 módulos; audit 0; checks estáticos PASS.
- A revisão independente final não foi executada por incompatibilidade do
  modelo e não foi tratada como aprovação. A instrumentação monotônica real
  permanece próxima lane controlada; produção continua NO-GO.
- Evidência: `docs/04_audit/0533_plat-s43_controlled_trace_temporal_integrity_evidence.md`.

## Round 136 — PLAT-S43 RED e GREEN focado

- RED reproduziu 6 falhas em 1 arquivo/14 testes: timing parcial/invertido,
  latência incompatível, ordem/duração de spans e status derivado divergente
  eram aceitos.
- GREEN passou 1 arquivo/14 testes após implementar invariantes no parser;
  typecheck, lint e diff check PASS. Regressão e gates integrados continuam
  pendentes.

## Round 134 — PLAT-S42 auditoria e fechamento controlado

- `PLAT-S42-001_CONTROLLED_TRACE_PROVENANCE_BOUNDARY` foi fechado como
  `COMPLETED_CONTROLLED` em `AUDIT`. Focused final: 6 arquivos/76 testes PASS.
- Regressão: 124 arquivos/492 testes PASS, 2 arquivos/19 testes skipped;
  coverage 84,99% statements, 80,24% branches, 85,41% functions e 86,00%
  lines. PostgreSQL controlado: 8 arquivos/72 testes; E2E: 4/4; readiness:
  4/4; build: 70 módulos; audit: 0 vulnerabilidades; typecheck, lint, format
  e diff check PASS.
- A checagem de referências SQL agora confronta tenant/trace/agent/version/
  timestamp com o JSONB antes de retornar. A revisão independente final não
  foi executada por incompatibilidade do modelo e não foi tratada como
  aprovação; a inspeção local não deixou achado aberto conhecido no escopo.
- Evidência: `docs/04_audit/0532_plat_s42_controlled_trace_provenance_boundary_evidence.md`.
- Nenhum provider/canal real, rede, RAG, broker, outbox, egress, deploy, dado
  real ou side effect foi acionado. Próximo passo: novo discovery/SPEC
  controlado; produção continua `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## Round 132 — PLAT-S42 registrado antes do BUILD

- Discovery encontrou que a interface `TestRunTrace` não é um contrato runtime
  estrito: spreads preservam campos arbitrários, suites bypassam a sanitização
  de traces aninhados e listagens PostgreSQL não revalidam JSON.
- Registrado `PLAT-S42-001_CONTROLLED_TRACE_PROVENANCE_BOUNDARY` em backlog,
  PRD, SPEC, ExecPlan, runtime state, execution log, tracking, task catalog e
  gauntlet.
- O contrato exige projeção allowlist/bounded, provider
  `fake/deterministic-v1`, `externalCall: false`, redaction/output policy,
  falha fechada antes de INSERT/efeito/retorno e paridade entre InMemory,
  PostgreSQL e suite.
- Gate `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório: RED
  focused. Produção real continua `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## Round 133 — PLAT-S42 RED observado e GREEN focado

- RED reproduziu 9 falhas em 3 arquivos/16 testes: campos extras, provider
  externo, datas/estruturas inválidas, suite sem sanitização e row PostgreSQL
  corrompida atravessaram a boundary anterior.
- GREEN implementou projeção allowlist/bounded e aplicou a regra em sinks
  diretos, suite aninhada e listagens PostgreSQL. Provider é
  `fake/deterministic-v1`, `externalCall` é literalmente `false`, output
  policy é coerente, texto é redigido e datas JSON são canonicalizadas.
- Focused ampliado: 6 arquivos/76 testes PASS; typecheck e lint PASS. Regressão
  completa, revisão independente e gates integrados continuam pendentes.
- Nenhum provider/canal real, rede, RAG, broker, outbox, egress, deploy, dado
  real ou side effect foi acionado.

## Round 126 — PLAT-S41 registrado antes do BUILD

- Discovery confirmou que template/knowledge controlada vira `fallbackText`
  do provider determinístico e chega ao trace sem uma output policy formal.
- Registrado `PLAT-S41-001_CONTROLLED_OUTPUT_SAFETY_BOUNDARY` em backlog, PRD,
  SPEC, ExecPlan, runtime state, execution log, tracking, task catalog e
  gauntlet.
- O contrato limita-se a validação pós-modelo de tipo, tamanho, redaction e
  conteúdo inseguro, com fallback seguro e handoff coerente. Não haverá
  provider/canal real, RAG, broker, egress, deploy, dado real ou side effect.
- Gate `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório: RED focado.

## Round 127 — PLAT-S41 RED observado

- O focused executou 1 arquivo/7 testes e falhou como esperado porque o módulo
  `output-policy` ainda não existia; a integração reproduziu output inseguro de
  knowledge chegando ao trace.
- Nenhuma operação externa ocorreu. Próximo passo: GREEN mínimo e integração
  antes de `response.after`.

## Round 128 — PLAT-S41 GREEN focado

- O focused passou 3 arquivos/14 testes: módulo puro, integração de runtime e
  allowlist do event bus.
- Output inválido/inseguro é reescrito para fallback seguro; PII é redigida;
  eventos `policy.output.*` são bounded e o handoff final não duplica pedido.
- Typecheck e lint passaram. Regressão completa e gates operacionais continuam
  pendentes; produção real segue `NO-GO`.

## Round 129 — PLAT-S41 revisão independente e RED corretivo

- A revisão encontrou dois P0: detector bypassável por variantes de conteúdo e
  execução de tools/approval após output rejeitado; P1: motivo de handoff
  inconsistente, teste sem event bus real/ordem, falta de metadado bounded no
  trace e cobertura insuficiente de templates/provider malformado.
- As regressões corretivas reproduziram 11 falhas em 1 arquivo/21 testes antes
  da correção. A revisão especializada incompatível não iniciou e não foi
  considerada aprovação.

## Round 130 — PLAT-S41 GREEN corretivo

- O focused corretivo passou 4 arquivos/36 testes; typecheck, lint e diff check
  passaram. A implementação normaliza Unicode/confusáveis, bloqueia tools e
  approval após qualquer rewrite, dá precedência ao motivo de output rejeitado,
  usa event bus real e persiste output policy bounded no trace/clones/UI.
- Gates integrados e nova revisão independente suportada continuam pendentes;
  produção real permanece `NO-GO`.

## Round 131 — PLAT-S41 auditoria e fechamento controlado

- A revisão independente encontrou P0/P1 e os achados foram convertidos em
  regressões. O detector agora cobre normalização Unicode/confusáveis, provider
  malformado e risco/mode inválidos; output reescrito bloqueia tools/approval.
- Os sinks de trace e a API validam novamente a saída; a conclusão transacional
  PostgreSQL valida antes de handoff, outbound, auditoria ou marcação de
  inbound concluído. A tentativa final assíncrona não retornou no limite e não
  foi tratada como aprovação; inspeção estática local não encontrou achado
  aberto conhecido.
- Focused final 7 arquivos/76 testes; regressão 123 arquivos/483 testes com 2
  arquivos e 19 testes skipped; coverage 85,08/80,29/85,39/86,12; readiness
  4/4; worker smoke; PostgreSQL 8/72; E2E 4/4; build 70 módulos; typecheck,
  lint, format, audit 0 e diff check PASS.
- CTRL-158/159/160 = `PASS controlled`; S41 = `COMPLETED_CONTROLLED`.
  Produção real permanece `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## Quality bar v37 — PLAT-S40 controlled model provider identity

| ID       | Criterion                                                      | Required evidence                                       | Current state   |
| -------- | -------------------------------------------------------------- | ------------------------------------------------------- | --------------- |
| CTRL-155 | Controlled runtime resolves only compiled provider/model pair  | RED/GREEN registry and runtime boundary tests           | PASS controlled |
| CTRL-156 | Unknown model/provider and fallback fail before execution      | negative tests with no lifecycle/model events           | PASS controlled |
| CTRL-157 | Test Lab, published runtime and worker share the same resolver | focused runtime/worker regression and static inspection | PASS controlled |

## Round 125 — PLAT-S40 auditoria e fechamento controlado

- S40 foi fechado como `COMPLETED_CONTROLLED` após focused final de 4
  arquivos/19 testes, regressão de 121 arquivos/446 testes pass/19 skips e
  coverage 85,08/80,11/85,17/86,07.
- Readiness 4/4, worker smoke, PostgreSQL 8/72, E2E 4/4, build, typecheck,
  lint, format, audit 0 e diff check passaram.
- A revisão independente follow-up retornou `PASS sem achados estáticos`,
  incluindo registry defensivo e cobertura de fallback nos caminhos publicado
  e worker. Evidência: `docs/04_audit/0530_plat_s40_controlled_model_provider_identity_evidence.md`.
- Produção real permanece `NO-GO`; próximo passo é nova discovery/SPEC
  controlada.

## Round 124 — PLAT-S40 regressão focada

- A regressão ampliada cobriu provider boundary, Test Lab, runtime publicado e
  worker: 4 arquivos/18 testes PASS.
- Typecheck, lint e diff check passaram; o format check apontou somente os dois
  arquivos de teste novos, que foram formatados e serão rechecados.
- Nenhuma integração externa, dado real ou side effect ocorreu; próximos passos
  são format/readiness/smoke/E2E/PostgreSQL/audit/build e revisão independente.

## Round 123 — PLAT-S40 GREEN focado

- O registry compilado passou a autorizar somente `fake/deterministic-v1`;
  `resolveForConfig` rejeita fallback e identidade sem suporte.
- `executeConfiguredAgent` resolve antes de `message.received`; o trace continua
  com `externalCall: false` e identidade registrada.
- Focused GREEN: 2 arquivos/6 testes PASS. A regressão publicada/worker, gates
  operacionais e revisão continuam pendentes.

## Round 122 — PLAT-S40 RED observado

- O teste focado `npx vitest run packages/platform/src/__tests__/model-provider-boundary.test.ts`
  executou 1 arquivo/4 testes e falhou nos 4 casos esperados.
- A implementação atual aceitou provider/model não registrados, ignorou
  `fallbackProvider` e completou com `openrouter/external` após emitir eventos;
  nenhuma rede ou side effect ocorreu.
- O próximo passo é GREEN mínimo: registry compilado, correspondência exata,
  rejeição de fallback e validação antes de `message.received`.

## Round 121 — PLAT-S40 registrado antes do BUILD

- A discovery read-only confirmou que `ModelProviderRegistry` existe, mas o
  executor usa `createDryRunModelProvider` diretamente e não valida a identidade
  contra um catálogo compilado.
- `ModelConfigSchema` aceita provider/model arbitrários e `fallbackProvider`,
  embora nenhum fallback seja executado; isso pode deixar uma versão com
  identidade não executável ou um trace semanticamente enganoso.
- Registrado `PLAT-S40-001_CONTROLLED_MODEL_PROVIDER_IDENTITY_BOUNDARY` para
  resolver somente `fake/deterministic-v1`, rejeitar fallback e falhar antes dos
  eventos para identidades não suportadas.
- Limite congelado: sem provider/canal real, chamada de rede, fallback/retry
  operacional, secret manager, RAG, broker, egress, deploy, dado real ou side
  effect. O próximo passo obrigatório é RED focado.
- Os três scouts Spark falharam por limite de uso e não são considerados
  revisão independente.

## Quality bar v36 — PLAT-S39 release candidate lifecycle integrity

| ID       | Criterion                                                             | Required evidence                                 | Current state   |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------- | --------------- |
| CTRL-152 | Transition to VALIDATED revalidates gates and digest in both adapters | RED/GREEN lifecycle tests and PostgreSQL evidence | PASS controlled |
| CTRL-153 | Candidate creator cannot self-validate release evidence               | independent-validator negative tests              | PASS controlled |
| CTRL-154 | Corrupt PostgreSQL gate JSON fails closed without masking             | mapper negative test and repository evidence      | PASS controlled |

## Round 117 — PLAT-S39 RED observado

- Focused S39 executou 2 arquivos/6 testes: 4 PASS e 2 FAIL esperados.
- Digest adulterado ainda foi aceito na transição `DRAFT -> VALIDATED` em
  InMemory e PostgreSQL; o caso não produziu efeitos externos.
- Próximo passo: GREEN mínimo com asserção compartilhada, preservando lock/CAS
  e tenant scope.

## Round 118 — PLAT-S39 GREEN focado

- `assertReleaseCandidateEvidenceIntegrity` foi extraída para o módulo shared;
  publish e as transições dos dois adapters a reutilizam antes da mutação.
- Focused S39 passou 2 arquivos/6 testes; typecheck e lint PASS. Digest íntegro
  valida e digest adulterado permanece `DRAFT`.
- Próximo passo: regressão completa, gates operacionais e crítica independente.

## Round 119 — PLAT-S39 correção após crítica independente

- A crítica encontrou HIGH de autoatestação pelo criador e MEDIUM de
  `gate_results` PostgreSQL corrompido mascarado como lista vazia.
- O GREEN corretivo exige validador diferente de `createdBy`, usa parser shared
  fail-closed e separa os testes de digest, self-validation e JSON corrompido.
- Focused final 2 arquivos/8 testes PASS; os gates integrados devem ser
  repetidos antes de fechar CTRL-152..154.

## Round 120 — PLAT-S39 auditoria e fechamento controlado

- O focused final passou 7 arquivos/23 testes/1 skip; a regressão passou 120
  arquivos/438 testes/19 skips e coverage 85,08/80,16/85,18/86,08.
- PostgreSQL passou 8/72, E2E 4/4, readiness 4/4, worker smoke, build,
  typecheck, lint, format, audit 0 e diff check.
- A autoridade de publish/rollback agora rejeita RC auto-atestada já
  persistida; a migration `0009` impõe a mesma regra no PostgreSQL.
- Revisão independente final: `PASS sem achados`. CTRL-152, CTRL-153 e
  CTRL-154 estão `PASS controlled`; próximo passo é nova discovery/SPEC.

## Round 116 — PLAT-S39 registrado antes do BUILD

- Discovery read-only confirmou que InMemory e PostgreSQL aceitam `VALIDATED`
  após checar gates, sem recomputar o digest do registro.
- Registrado `PLAT-S39-001_CONTROLLED_RELEASE_CANDIDATE_LIFECYCLE_INTEGRITY`
  para aplicar asserção compartilhada antes de status/metadata.
- Scope congelado: somente ledger/lifecycle controlado; sem publish adicional,
  deploy, provider/canal, RAG, egress, broker, outbox, dado real ou side effect.
- Gate `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório: RED.

## Quality bar v34 — PLAT-S37 controlled publish evidence authority boundary

| ID       | Criterion                                                            | Required evidence                                  | Current state   |
| -------- | -------------------------------------------------------------------- | -------------------------------------------------- | --------------- |
| CTRL-145 | Publish requires a validated candidate bound to tenant/agent/version | focused RED/GREEN store and API tests              | PASS controlled |
| CTRL-146 | Digest and fixed PASS gates are revalidated server-side              | tamper/failed-gate and release ledger tests        | PASS controlled |
| CTRL-147 | Rollback cannot bypass source-version evidence authority             | rollback negative/positive and persistence tests   | PASS controlled |
| CTRL-148 | UI/PostgreSQL preserve the same controlled publish boundary          | E2E, PostgreSQL, integrated gates and static audit | PASS controlled |

## Quality bar v35 — PLAT-S38 worker knowledge input parity

| ID       | Criterion                                                                        | Required evidence                      | Current state   |
| -------- | -------------------------------------------------------------------------------- | -------------------------------------- | --------------- |
| CTRL-149 | Worker job reuses the shared strict/bounded knowledge schema                     | focused RED/GREEN worker boundary test | PASS controlled |
| CTRL-150 | Valid controlled knowledge reaches the pinned runtime without changing authority | forwarding/runtime trace test          | PASS controlled |
| CTRL-151 | Invalid knowledge fails before store/provider/tool                               | negative worker boundary test          | PASS controlled |

## Round 115 — PLAT-S38 fechamento controlado

- RED inicial: 3 testes/1 falha esperada; job válido com `approvedKnowledge`
  era rejeitado. Após a crítica, RED adicional reproduziu history 21 rejeitado
  pelo limite 20.
- GREEN final: 3 arquivos/14 testes PASS; schema shared, forwarding,
  contexto, history bounded em 50 e negativas de source externa/campo extra
  cobertos.
- Gates finais: npm test 120/432/19 skips; coverage 84,92/80,09/85,08/85,92;
  readiness 4/4; worker smoke, E2E 4/4, PostgreSQL 8/71, build, typecheck,
  lint, format, audit 0 e diff check PASS.
- Crítica independente sem CRITICAL/HIGH; MEDIUM e LOW corrigidos e
  revalidados. S38 = `COMPLETED_CONTROLLED`; produção real `NO-GO`.

## Round 114 — PLAT-S38 registrado antes do BUILD

- Discovery confirmou drift: o runtime publicado aceita `approvedKnowledge`,
  mas o job strict do worker ainda rejeita o campo e não o encaminha.
- Registrado `PLAT-S38-001` no backlog, PRD, SPEC, ExecPlan, runtime state,
  tracking, task catalog e gauntlet.
- Scope congelado: reutilizar o schema compartilhado e encaminhar fixture
  parseado ao executor pinned; sem broker, RAG, provider/canal, dado real,
  deploy ou side effect.
- Próximo gate obrigatório: RED focado.

## Round 113 — PLAT-S37 fechamento controlado

- RED focused: 2 arquivos/4 falhas esperadas antes do BUILD.
- GREEN focused: 2 arquivos/5 testes PASS; a autoridade shared valida
  `VALIDATED`, metadados, gates, digest e binding.
- Gates finais: 119/427/19 skips, coverage 84,92/80,08/85,08/85,92, readiness
  4/4, worker smoke, E2E 4/4, PostgreSQL 8/71, build, lint, format, audit 0 e
  diff check PASS.
- A crítica de subagente não ficou disponível por timeout/indisponibilidade;
  auditoria estática local foi registrada sem alegar revisão externa.
- S37 = `COMPLETED_CONTROLLED`; produção real permanece `NO-GO`.

## Quality bar v33 — PLAT-S36 controlled knowledge input provenance boundary

| ID       | Criterion                                                                  | Required evidence                      | Current state   |
| -------- | -------------------------------------------------------------------------- | -------------------------------------- | --------------- |
| CTRL-141 | Runtime validates approved knowledge payload at the internal boundary      | RED/GREEN runtime tests                | PASS controlled |
| CTRL-142 | API Test Lab and approval execution share the same bounded schema          | API negative/positive tests            | PASS controlled |
| CTRL-143 | Only `controlled://` source + exact configured binding can answer          | source-gating regression and audit     | PASS controlled |
| CTRL-144 | Invalid payload fails before model/tool execution without external effects | focused/full verify and boundary audit | PASS controlled |

## Round 109 — PLAT-S36 RED observado

- O focused S36 executou 4 testes: 2 falharam no comportamento ausente e 2
  passaram nos casos válidos.
- RED reproduziu que `validateApprovedKnowledge` não rejeita resposta acima de
  4.000/campo extra e que a API não limita source `controlled://` a 200.
- Próximo passo: GREEN mínimo compartilhado; CTRL-141..144 continuam
  `PENDING`; produção real segue `NO-GO`.

## Round 110 — PLAT-S36 GREEN focado

- `ApprovedKnowledgeForTestSchema` foi extraído para o contrato platform e
  reutilizado pelo runtime, Test Lab API e approval execution API.
- Focused passou 2 arquivos/4 testes, typecheck e lint; inválidos falham antes
  de model/tool e válidos mantêm source/version gating.
- CTRL-141..144 aguardam regressão e gates integrados; produção real segue
  `NO-GO`.

## Round 111 — PLAT-S36 AUDIT fechado

- `PLAT-S36-001_CONTROLLED_KNOWLEDGE_INPUT_PROVENANCE_BOUNDARY` foi fechado
  como `COMPLETED_CONTROLLED`.
- Verify passou 117 arquivos/422 testes/19 skips, coverage
  85,05/80,31/85,11/86,07, readiness 4/4, worker startup smoke, E2E 4/4,
  PostgreSQL controlado 8/71, audit 0, format, build, lint e diff check.
- A revisão independente não encontrou CRITICAL/HIGH. A chave `last_green`
  duplicada, o backlog mestre dessincronizado e a falta de teste negativo da
  execução de approval foram corrigidos; os gates focados foram repetidos.
- CTRL-141..144 = `PASS controlled`; source continua restrita a
  `controlled://`, sem RAG/ingestão/conteúdo real/provider/canal/egress,
  broker, outbox, dado real, deploy ou side effect. Produção permanece
  `NO-GO` / `WAITING_HUMAN_APPROVAL`.
- Evidência: `docs/04_audit/0526_plat_s36_controlled_knowledge_input_boundary_evidence.md`.

## Round 112 — PLAT-S37 registrado antes do BUILD

- S36 permanece `COMPLETED_CONTROLLED`; discovery e crítica independente
  encontraram que publish/rollback não exigem nem consomem um release
  candidate validado.
- Registrado `PLAT-S37-001_CONTROLLED_PUBLISH_EVIDENCE_AUTHORITY_BOUNDARY`
  para tornar `releaseCandidateId` obrigatório, validar status/digest/gates e
  binding exato no servidor, mantendo preflight crítico e rollback derivado.
- O candidato continua evidência controlada e não autoriza produção, dados
  reais, deploy, provider/canal, RAG, egress, broker, outbox ou side effect.
- Gate `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório: RED.

## Quality bar v32 — PLAT-S35 controlled tool registry identity boundary

| ID       | Criterion                                                               | Required evidence                        | Current state   |
| -------- | ----------------------------------------------------------------------- | ---------------------------------------- | --------------- |
| CTRL-136 | Exact plugin version and unambiguous binding are required for execution | RED/GREEN gateway and regression tests   | PASS controlled |
| CTRL-137 | Test Lab plans only registered compiled tools by active config/intent   | planner tests and runtime trace          | PASS controlled |
| CTRL-138 | API approval resolves a registered tool and owns permission server-side | API negative/positive tests and audit    | PASS controlled |
| CTRL-139 | Catalog metadata cannot create a handler or execution authority         | catalog/runtime negative test and review | PASS controlled |
| CTRL-140 | Controlled handlers remain fixture-only with no external side effect    | focused/full verify and boundary audit   | PASS controlled |

## Round 103 — PLAT-S35 registrado antes do BUILD

- S34 permanece `COMPLETED_CONTROLLED`; a nova descoberta encontrou a
  assimetria entre bindings configuráveis e planner/API hardcoded.
- Registrado `PLAT-S35-001_CONTROLLED_TOOL_REGISTRY_IDENTITY_BOUNDARY` com
  gate `SPEC_APPROVED_CONTROLLED_BUILD`.
- Escopo: registry compilado, versão exata, planner por intent, deduplicação,
  colisão fail-closed e approval/API genérico validado server-side.
- O catálogo continua metadata-only; não haverá import, marketplace, provider,
  canal, egress, broker, outbox, dado real, deploy ou side effect.
- Próximo passo obrigatório: RED; CTRL-136..140 continuam `PENDING`.

## Round 104 — PLAT-S35 RED observado

- `npx vitest run packages/platform/src/__tests__/controlled-tool-registry.test.ts`
  executou 4 testes em `2026-08-26T00:00:58-03:00`: 3 falharam e 1 passou.
- RED reproduziu intents rejeitados pelo manifesto, resolução latest/primeiro
  binding no gateway e ausência de `planTools`; catalog-only permaneceu
  bloqueado sem handler/grant.
- Próximo passo: GREEN mínimo em contrato, registry/gateway e Test Lab;
  CTRL-136..140 continuam `PENDING`.

## Round 105 — PLAT-S35 GREEN e regressão próxima

- GREEN focado e regressão próxima passaram 10 arquivos/49 testes; typecheck
  também passou.
- O registry agora exige versão exata e rejeita ambiguidade, deduplica a mesma
  identidade, planeja por intent e mantém catálogo sem handler bloqueado.
- Test Lab, approval API, runtime publicado, adapter legado e UI controlada
  permanecem verdes; CTRL-136..140 aguardam verify e audit integrados.

## Round 106 — PLAT-S35 correção após crítica independente

- A crítica read-only retornou `NEEDS_CORRECTION`, sem CRITICAL/HIGH.
- Corrigidos: alias `latest` rejeitado em binding/manifest, `get(name)` sem
  versão removido da API pública de resolução, `getLatest(name)` explícito para
  inspeção e validação de plugins pré-carregados no construtor.
- Focused passou 3 arquivos/28 testes; typecheck e lint passaram. Verify e
  gates externos devem ser repetidos antes de qualquer fechamento.

## Round 107 — PLAT-S35 fechamento controlado

- A crítica final confirmou os invariantes de código e não encontrou
  CRITICAL/HIGH; o único ajuste pedido foi sincronizar os resultados mais
  recentes no tracking/evidência.
- Após a sincronização, os gates finais ficaram coerentes: verify 115/417/19
  skips, coverage 84,99/80,30/85,11/86,01, readiness 4/4, worker smoke, E2E
  4/4, PostgreSQL 8/71, audit 0 e diff check PASS.
- CTRL-136..140 = `PASS controlled`; S35 = `COMPLETED_CONTROLLED`.
- Evidência: `docs/04_audit/0525_plat_s35_controlled_tool_registry_identity_evidence.md`.
- `CONTROLLED_MVP_READY` permanece o teto; produção real segue `NO-GO`.

## Quality bar v31 — PLAT-S34 controlled CI gate parity

| ID       | Criterion                                                               | Required evidence                                   | Current state               |
| -------- | ----------------------------------------------------------------------- | --------------------------------------------------- | --------------------------- |
| CTRL-132 | Workflow has least-privilege/readability/concurrency guardrails         | workflow contract tests and YAML inspection         | PASS controlled             |
| CTRL-133 | CI calls every available unit/integration/security/migration/build gate | workflow contract plus controlled CI command matrix | PASS controlled             |
| CTRL-134 | Worker startup smoke rejects missing adapter safely                     | process smoke exit/status/JSON negative assertions  | PASS controlled             |
| CTRL-135 | Container scan is never falsely claimed without a container artifact    | explicit no-artifact boundary and release audit     | PASS boundary; scan not run |

## Round 99 — PLAT-S34 registrado antes do BUILD

- S33 foi fechado como `COMPLETED_CONTROLLED`; discovery comparou o workflow
  com o requisito mestre #88 e registrou `PLAT-S34-001_CONTROLLED_CI_GATE_PARITY`.
- Lacunas: readiness e worker startup não eram gates explícitos, `npm ci` não
  declarava `--ignore-scripts`, permissions/concurrency não estavam fixados e
  não existe Dockerfile/imagem para container scan.
- Gate: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório é RED dos
  contratos CI e startup smoke. Nenhum deploy, container, provider/canal, dado
  real ou side effect entra no lane.

## Round 100 — PLAT-S34 RED observado

- A suíte focada `tests/ci-workflow-contract.test.js` e
  `tests/worker-startup-smoke.test.js` executou em
  `2026-08-25T22:07:22-03:00` antes do BUILD.
- RED real: 3 testes falharam; workflow sem permissions/concurrency/
  `--ignore-scripts`/readiness/worker smoke e script de smoke ausente retornam
  falha de processo.
- Próximo passo: GREEN mínimo no script/workflow; CTRL-132..135 continuam
  `PENDING`.

## Round 101 — PLAT-S34 GREEN focado

- Implementados `scripts/worker-startup-smoke.mjs`,
  `npm run test:worker:startup` e workflow CI com permissions/concurrency,
  checkout sem credenciais persistentes, `npm ci --ignore-scripts`, readiness
  e smoke processual.
- Focado passou 2 arquivos/3 testes em `2026-08-25T22:09:23-03:00`; o comando
  smoke real passou com `worker.startup_smoke_passed` e
  `queue_adapter_missing`, sem bootstrap/stack/cause.
- CTRL-132..134 = `PASS controlled` em focused/inspection; CTRL-135 permanece
  `PASS boundary; scan not run` como limite de container sem artefato.

## Round 102 — PLAT-S34 fechamento integrado

- A regressão final passou: `npm run verify` com 114 arquivos/411 testes pass,
  19 skips e coverage 85,01/80,42/85,14/85,99; readiness 4/4; E2E 4/4;
  PostgreSQL 16 efêmero 8 arquivos/71 testes; audit 0; typecheck, lint, build,
  format e `git diff --check` pass.
- O workflow ganhou também um passo explícito de `git diff --check` depois de
  uma RED adicional da auditoria de continuidade; o focused final passou 2
  arquivos/3 testes.
- Crítica read-only independente aprovou os controles S34 e aceitou os
  resultados longos como evidência fornecida consistente; não repetiu verify ou
  PostgreSQL nessa leitura. GitHub Actions não foi executado e não há scan de
  container sem artefato. `CONTROLLED_MVP_READY` continua sendo o teto;
  produção real segue `NO-GO`/`WAITING_HUMAN_APPROVAL`.
- Próximo gap: nova descoberta/SPEC controlado, sem deploy, broker,
  provider/canal, RAG, dado real ou side effect.

## Round 97 — PLAT-S33 gates finais

- A suíte final passou 112 arquivos/408 testes com 19 skips; coverage passou
  com 85,01% statements, 80,42% branches, 85,14% functions e 85,99% lines.
- Readiness 4/4, E2E 4/4, PostgreSQL 8 arquivos/71 testes, typecheck, lint,
  build, format, audit 0 e diff check passaram sobre o estado final.
- CTRL-128..131 = `PASS controlled`; nenhum dado real, provider, canal, RAG,
  broker ou side effect foi utilizado.

## Round 98 — PLAT-S33 fechamento controlado

- `PLAT-S33-001_CONTROLLED_WORKER_RUNTIME_BOUNDARY` foi fechado como
  `COMPLETED_CONTROLLED` em `2026-08-25T21:58:18-03:00`.
- Evidência: `docs/04_audit/0523_plat_s33_controlled_worker_runtime_boundary_evidence.md`.
  Produção real permanece `NO-GO`/`WAITING_HUMAN_APPROVAL`; o próximo passo é
  uma nova descoberta controlada.

## Quality bar v29 — PLAT-S32 controlled session agent-version pinning

| ID       | Criterion                                                            | Required evidence                                            | Current state   |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------------------ | --------------- |
| CTRL-123 | New runtime sessions bind agent/version exactly once                 | memory/API focused tests and trace version assertions        | PASS controlled |
| CTRL-124 | Published v1 continuations remain on archived v1 after publishing v2 | integration/E2E publish-switch regression                    | PASS controlled |
| CTRL-125 | Binding is tenant-aware, pair-complete and race-safe                 | memory/PostgreSQL CAS, FK/RLS and negative tests             | PASS controlled |
| CTRL-126 | Invalid pinning fails closed without provider/tool/side effect       | runtime negative tests and audit inspection                  | PASS controlled |
| CTRL-127 | Existing Secretary and prior controlled boundaries remain green      | verify/readiness/E2E/PostgreSQL/audit/format/diff regression | PASS controlled |

## Round 90 — PLAT-S32 registered before BUILD

- A auditoria do prompt mestre e do runtime reproduziu a ausência de binding
  de sessão: `executePublishedAgent` chama `resolvePublished` para cada turno.
- Registrado `PLAT-S32-001_CONTROLLED_SESSION_AGENT_VERSION_PINNING` para
  migration aditiva 0008, binding `agentId`/`agentVersionId` tenant-scoped e
  execução pinned de snapshots `PUBLISHED`/`ARCHIVED`.
- Gate: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório é RED.
  Provider/canal, RAG, dados reais, IdP/RBAC, worker distribuído, deploy e
  side effect permanecem fora.

## Round 91 — PLAT-S32 RED observado

- A suíte focada de quatro arquivos executou em `2026-08-25T20:38:26-03:00`.
- RED real: 5 testes falharam e 7 passaram; a continuação usou a versão v2,
  o adapter ignorou `versionId`, `bindSessionAgentVersion` ainda não existe e
  a leitura da migration 0008 retornou `ENOENT`.
- Próximo passo: GREEN mínimo em contrato/persistência/adapter/runtime; CTRL-123..127
  continuam `PENDING`.

## Round 92 — PLAT-S32 GREEN focado

- A migration 0008, o binding monotônico em memória/PostgreSQL, o adapter
  pinned e a seleção de snapshot `ARCHIVED` foram implementados após RED.
- A suíte focada passou 4 arquivos/12 testes; a regressão próxima passou 3
  arquivos/34 testes com 10 skips condicionais; typecheck passou.
- O modo legado `0000_initial` continua explícito e não consulta as colunas de
  pinning ausentes. CTRL-123..127 aguardavam os gates integrados.

## Round 93 — PLAT-S32 fechamento controlado

- `PLAT-S32-001` foi fechado como `COMPLETED_CONTROLLED` após inspeção lead-only
  do diff e dos limites de segurança; não há runtime de subagentes disponível
  para revisão independente nesta sessão.
- `npm test`: 111 arquivos pass/2 skips, 402 testes pass/19 skips.
- Coverage: 85,01% statements, 80,37% branches, 85,11% functions e 85,99%
  lines; readiness 4/4; Playwright 4/4; PostgreSQL 8 arquivos/71 testes pass.
- Typecheck, lint, build, format, diff check e `npm audit --audit-level=high`
  passaram; audit encontrou 0 vulnerabilidades.
- O smoke PostgreSQL também corrigiu a compatibilidade do migration 0007 com
  PostgreSQL 16, trocando `jsonb_object_length` por JSONPath bounded.
- CTRL-123..127 = `PASS controlled`; evidência em
  `docs/04_audit/0522_plat_s32_controlled_session_version_pinning_evidence.md`.
  `CONTROLLED_MVP_READY` permanece e produção real segue `NO-GO`.

## Quality bar v28 — PLAT-S31 controlled approval decision note field boundary

| ID       | Criterion                                                                 | Required evidence                                            | Current state   |
| -------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------- |
| CTRL-120 | Approval decision note has an explicit bounded maximum at schema boundary | shared-schema tests for optional `note`                      | PASS controlled |
| CTRL-121 | Over-limit decision note fails before repository without state mutation   | API negative test with `approvals.save` and state assertions | PASS controlled |
| CTRL-122 | S30, decision/RBAC, Secretary and prior boundaries remain green           | full verify/readiness/E2E/PostgreSQL/audit/diff regression   | PASS controlled |

## Round 85 — PLAT-S31 registered before BUILD

- A descoberta efêmera reproduziu `note` com 5.000 caracteres atravessando
  `POST /v1/approvals/:approvalRequestId/decision` e persistindo a decisão
  `approved`; a nota não foi ecoada nem persistida.
- Registrado `PLAT-S31-001_CONTROLLED_APPROVAL_DECISION_NOTE_FIELD_BOUNDARY`
  para impor `note` 4.000 antes de `approvals.save`, preservando decisão,
  identidade do operador, approval state, handoff e não persistência atual.
- Gate: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório é RED.
  Auth, tenant, provider/canal, RAG, dado real, deploy e side effect permanecem
  fora.

## Round 86 — PLAT-S31 RED observado

- A suíte focada `apps/api/src/approval-decision-note-field-boundary.test.ts`
  produziu RED em `2026-08-25T19:55:57-03:00`: 3 testes, 1 PASS e 2 FAIL.
- `note` com 4.001 caracteres ainda atravessa o schema, a decisão retorna 200
  e alcança `approvals.save`; o valor no limite já é aceito.
- O próximo passo é GREEN mínimo em `ResolveApprovalSchema.note`; CTRL-120..122
  continuam `PENDING`.

## Round 87 — PLAT-S31 GREEN focado

- Foi adicionado somente `.max(4000)` ao `ResolveApprovalSchema.note`.
- A suíte focada passou 1 arquivo/3 testes em
  `2026-08-25T19:56:51-03:00`; nota excedente falha antes de
  `approvals.save`, approval permanece pending e nota no limite mantém a
  decisão `approved`.
- Regressão, verify e gates externos ainda são necessários; CTRL-120..122
  continuam `PENDING`.

## Round 88 — PLAT-S31 regressão próxima

- Regressão de S31/S30, approval actions, RBAC, tenant isolation, health,
  observability, audit evidence e `agent-core` passou 9 arquivos/31 testes em
  `2026-08-25T19:57:31-03:00`.
- Decisão válida, approval pending, handoff, identidade, tenant e Secretary
  permanecem verdes; verify e gates externos ainda são necessários.

## Round 89 — PLAT-S31 fechamento controlado

- `PLAT-S31-001_CONTROLLED_APPROVAL_DECISION_NOTE_FIELD_BOUNDARY` foi fechado
  como `COMPLETED_CONTROLLED` em `2026-08-25T20:06:15-03:00`.
- Verify passou com 109 arquivos/397 testes pass/18 skips; coverage
  85,45%/80,83%/85,26%/86,45%; readiness 4/4; E2E 3/3; PostgreSQL 51/18;
  audit 0; format, JSON e diff check PASS.
- CTRL-120..122 = `PASS controlled`; evidência em
  `docs/04_audit/0521_plat_s31_controlled_approval_decision_note_field_boundary_evidence.md`.
  `CONTROLLED_MVP_READY` permanece; produção segue `NO-GO`/
  `WAITING_HUMAN_APPROVAL`; próximo passo: novo SPEC controlado.

## Quality bar v27 — PLAT-S30 controlled approval request field boundary

| ID       | Criterion                                                                      | Required evidence                                          | Current state   |
| -------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------- |
| CTRL-117 | Approval request fields have explicit bounded maxima at the schema boundary    | shared-schema tests for all three fields                   | PASS controlled |
| CTRL-118 | Over-limit approval input fails before the repository without echo             | API negative tests with `approvals.save` call assertions   | PASS controlled |
| CTRL-119 | S29, approval decision, Secretary and prior controlled boundaries remain green | full verify/readiness/E2E/PostgreSQL/audit/diff regression | PASS controlled |

## Round 81 — PLAT-S30 registered before BUILD

- A descoberta reproduziu `POST /v1/approvals` aceitando e persistindo
  `summary` com 5.000 caracteres em fixture tenant-scoped; o
  `RequestHumanApprovalSchema` não tinha máximos de campo.
- Registrado `PLAT-S30-001_CONTROLLED_APPROVAL_REQUEST_FIELD_BOUNDARY` para
  impor `sessionId` 160, `proposedAction` 200 e `summary` 4.000 antes de
  `approvals.save`, preservando approval pending e decisão humana.
- Gate: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório é RED.
  Auth, tenant, handoff, provider/canal, RAG, dado real, deploy e side effect
  permanecem fora.

## Round 82 — PLAT-S30 RED observado

- A suíte focada `apps/api/src/approval-request-field-boundary.test.ts` produziu
  RED em `2026-08-25T19:30:53-03:00`: 5 testes, 1 PASS e 4 FAIL antes da
  implementação.
- Os três campos ainda aceitam valores acima do limite; `summary` e
  `proposedAction` chegam ao save e `sessionId` longo cai em `invalid_action`
  tardio. O próximo passo é GREEN mínimo somente no schema, mantendo
  CTRL-117..119 `PENDING`.

## Round 83 — PLAT-S30 GREEN focado

- Os máximos foram adicionados ao `RequestHumanApprovalSchema`; a suíte focada
  passou 1 arquivo/5 testes em `2026-08-25T19:31:49-03:00`.
- Cada campo excedente falha antes de `approvals.save`, valores nos limites são
  aceitos e approval permanece `pending`. Regressão, verify e gates externos
  ainda são necessários; CTRL-117..119 continuam `PENDING`.

## Round 84 — PLAT-S30 fechamento controlado

- `PLAT-S30-001_CONTROLLED_APPROVAL_REQUEST_FIELD_BOUNDARY` foi fechado como
  `COMPLETED_CONTROLLED` em `2026-08-25T19:40:47-03:00`.
- Verify passou com 108 arquivos/394 testes pass/18 skips e coverage
  85,45%/80,83%/85,26%/86,45%; readiness 4/4, E2E 3/3, PostgreSQL 51/18,
  audit 0, format e diff check também passaram.
- CTRL-117..119 = `PASS controlled`; evidência em
  `docs/04_audit/0520_plat_s30_controlled_approval_request_field_boundary_evidence.md`.
  `CONTROLLED_MVP_READY` permanece; produção segue `NO-GO`/
  `WAITING_HUMAN_APPROVAL`; próximo passo: novo SPEC controlado.

## Quality bar v26 — PLAT-S29 controlled internal task field boundary

| ID       | Criterion                                                                | Required evidence                                          | Current state   |
| -------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- | --------------- |
| CTRL-114 | Internal task fields have explicit bounded maxima at the schema boundary | shared-schema tests for all five fields                    | PASS controlled |
| CTRL-115 | Over-limit task input fails before the repository without echo           | API negative tests with `tasks.create` call assertions     | PASS controlled |
| CTRL-116 | S28, Secretary and prior controlled boundaries remain green              | full verify/readiness/E2E/PostgreSQL/audit/diff regression | PASS controlled |

## Round 77 — PLAT-S29 registered before BUILD

- A descoberta reproduziu `POST /v1/tasks` aceitando e persistindo
  `title`, `description`, `source` e `idempotencyKey` com 5.000 caracteres em
  fixture controlada; `CreateInternalTaskSchema` não tinha máximos de campo.
- Registrado `PLAT-S29-001_CONTROLLED_INTERNAL_TASK_FIELD_BOUNDARY` para impor
  `sessionId` 160, `title` 200, `description` 4.000, `source` 120 e
  `idempotencyKey` 200 antes de `tasks.create`, preservando o mínimo 8 da chave.
- Gate: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório é RED.
  Auth, tenant, identidade, Secretary, persistência estrutural, provider/canal,
  RAG, dado real, deploy e side effect permanecem fora.

## Round 78 — PLAT-S29 RED observado

- A suíte focada `apps/api/src/internal-task-field-boundary.test.ts` produziu
  RED em `2026-08-25T19:09:13-03:00`: 7 testes, 1 PASS e 6 FAIL antes da
  implementação.
- Os cinco campos ainda aceitam valores acima do limite; quatro campos de
  5.000 caracteres chegam à criação e `sessionId` longo falha tardiamente como
  `invalid_action`. O próximo passo é GREEN mínimo somente no schema, mantendo
  CTRL-114..116 `PENDING`.

## Round 79 — PLAT-S29 GREEN focado

- Os máximos foram adicionados ao `CreateInternalTaskSchema`; a suíte focada
  passou 1 arquivo/7 testes em `2026-08-25T19:10:24-03:00`.
- Cada campo excedente falha antes de `tasks.create`, valores nos limites são
  aceitos e nenhum conteúdo excedente é refletido. Regressão, verify e gates
  externos ainda são necessários; CTRL-114..116 continuam `PENDING`.

## Round 80 — PLAT-S29 fechamento controlado

- `PLAT-S29-001_CONTROLLED_INTERNAL_TASK_FIELD_BOUNDARY` foi fechado como
  `COMPLETED_CONTROLLED` em `2026-08-25T19:21:22-03:00`.
- Verify passou com 107 arquivos/389 testes pass/18 skips e coverage
  85,45%/80,83%/85,26%/86,45%; readiness 4/4, E2E 3/3, PostgreSQL 51/18,
  audit 0, format e diff check também passaram.
- CTRL-114..116 = `PASS controlled`; evidência em
  `docs/04_audit/0519_plat_s29_controlled_internal_task_field_boundary_evidence.md`.
  `CONTROLLED_MVP_READY` permanece; produção segue `NO-GO`/
  `WAITING_HUMAN_APPROVAL`; próximo passo: novo SPEC controlado.

## Quality bar v22 — PLAT-S25 controlled HTTP request-target boundary

| ID       | Criterion                                                             | Required evidence                                                   | Current state   |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- | --------------- |
| CTRL-101 | Request-target byte limit and route parameter cap are explicit        | Fastify config and focused boundary tests                           | PASS controlled |
| CTRL-102 | Unknown routes/methods return safe API envelopes without target echo  | not-found integration tests and response inspection                 | PASS controlled |
| CTRL-103 | Oversized path/query fails closed with bounded 414 and no target echo | path/query 414 negative tests                                       | PASS controlled |
| CTRL-104 | Secretary and prior controlled security/body boundaries remain green  | full verify/readiness/E2E/PostgreSQL/audit/diff regression evidence | PASS controlled |

## Round 59 — PLAT-S25 registered before BUILD

- A descoberta reproduziu 404 padrão do Fastify refletindo o request-target
  completo em rota desconhecida e aceitação de query extensa sem contrato local.
- Registrado `PLAT-S25-001_CONTROLLED_HTTP_TARGET_BOUNDARY` com limite de 8192
  bytes do target bruto, `maxParamLength` explícito de 100 e not-found envelope
  redaction-safe.
- Gate: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório é RED.
  Sem alteração de body/parser S24, auth, tenant, identidade, Secretary,
  provider/canal, RAG, dado real, deploy ou side effect.

## Round 60 — PLAT-S25 RED observado

- A suíte focada foi executada antes do BUILD em `2026-08-25T17:30:16-03:00`.
- RED esperado: `http-target-boundary.ts` ainda não existia; nenhum PASS foi
  inferido. A implementação continua limitada ao target/404/414 seguro.

## Round 61 — PLAT-S25 GREEN focado

- Implementados o classificador puro, target limit de 8192 bytes,
  `routerOptions.maxParamLength` de 100, not-found envelope e 414 bounded.
- Focused passou 8/8 em `2026-08-25T17:32:34-03:00`; typecheck, lint, format e
  `git diff --check` passaram. CTRL-101..104 aguardam verify e gates externos.

## Round 62 — PLAT-S25 crítica lead-only e correção

- O verify encontrou uma expectativa S22 antiga para 404 non-envelope em
  `2026-08-25T17:35:16-03:00`; isso falhou contra o contrato S25 de 404 seguro.
- A expectativa foi atualizada para paridade envelope/header, mantendo preflight
  204 sem header. Focused S25 + correlation passou 14/14 em
  `2026-08-25T17:38:16-03:00`.

## Round 63 — PLAT-S25 fechamento controlado

- `PLAT-S25-001_CONTROLLED_HTTP_TARGET_BOUNDARY` foi fechado como
  `COMPLETED_CONTROLLED` em `2026-08-25T17:47:28-03:00`.
- Verify passou com 103 arquivos/367 testes pass/18 skips e coverage
  85,41%/80,76%/85,24%/86,42%; readiness 4/4, E2E 3/3, PostgreSQL 51/18,
  audit 0, format, diff check, target smoke e startup smoke também passaram.
- Evidência: `docs/04_audit/0515_plat_s25_controlled_http_target_boundary_evidence.md`.
  O release controlado está pronto; produção real permanece `NO-GO`/
  `WAITING_HUMAN_APPROVAL` e o próximo passo é novo SPEC controlado.

## Quality bar v23 — PLAT-S26 controlled Prompt Profile error-message boundary

| ID       | Criterion                                                        | Required evidence                                          | Current state   |
| -------- | ---------------------------------------------------------------- | ---------------------------------------------------------- | --------------- |
| CTRL-105 | Dynamic Prompt Profile error messages do not echo payload values | unit/API negative tests and response inspection            | PASS controlled |
| CTRL-106 | Invalid clone remains fail-closed without creating a new version | API regression and version-count assertion                 | PASS controlled |
| CTRL-107 | S25, Secretary and prior controlled boundaries remain green      | full verify/readiness/E2E/PostgreSQL/audit/diff regression | PASS controlled |

## Round 64 — PLAT-S26 registered before BUILD

- A reprodução encontrou `error.message` contendo um `responseTemplates` key
  inválido enviado no payload (`token=fixture-secret<script>`).
- Registrado `PLAT-S26-001_CONTROLLED_PROMPT_PROFILE_ERROR_MESSAGE_BOUNDARY`
  para substituir somente mensagens interpoladas de chave/ID por mensagens
  constantes, preservando código, status, envelope, correlation e ausência de
  clone.
- Gate: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório é RED.
  Sem alteração de `toSafeError` global, auth, tenant, identidade, Secretary,
  persistência, provider/canal, RAG, dado real, deploy ou side effect.

## Round 65 — PLAT-S26 RED observado

- A suíte focada S26 falhou em 4/4 em `2026-08-25T18:01:30-03:00`, antes do
  BUILD, porque as mensagens atuais refletem chave/ID e a API devolve o sentinel.
- O GREEN fica limitado a `packages/platform/src/prompt-profile.ts`, mantendo
  código/status/envelope/correlation e ausência de clone/version.

## Round 66 — PLAT-S26 GREEN focado

- Mensagens interpoladas do Prompt Profile foram substituídas por constantes;
  focused passou 1 arquivo/4 testes em `2026-08-25T18:02:37-03:00`.
- A API permanece 400 `validation_failed`, sem sentinel e sem nova versão;
  regressão próxima e verify integrado ainda são necessários.

## Round 67 — PLAT-S26 crítica lead-only e correção

- A regressão próxima encontrou expectativa histórica para palavras
  interpoladas; o teste foi atualizado para a mensagem constante.
- S26 + control-plane + prompt-profile passaram 3 arquivos/21 testes em
  `2026-08-25T18:03:50-03:00`; typecheck, lint, format e diff check passaram.
- Revisão independente física indisponível; verify e gates externos ainda são
  necessários.

## Round 68 — PLAT-S26 fechamento controlado

- `PLAT-S26-001_CONTROLLED_PROMPT_PROFILE_ERROR_MESSAGE_BOUNDARY` foi fechado
  como `COMPLETED_CONTROLLED` em `2026-08-25T18:12:10-03:00`.
- Verify passou com 104 arquivos/371 testes pass/18 skips e coverage
  85,41%/80,77%/85,24%/86,42%; readiness 4/4, E2E 3/3, PostgreSQL 51/18,
  audit 0, format e diff check também passaram.
- Evidência: `docs/04_audit/0516_plat_s26_controlled_error_message_boundary_evidence.md`.
  `CONTROLLED_MVP_READY` permanece; produção real segue `NO-GO`/
  `WAITING_HUMAN_APPROVAL`; próximo passo: novo SPEC controlado.

## Quality bar v24 — PLAT-S27 controlled pagination offset boundary

| ID       | Criterion                                                 | Required evidence                                            | Current state   |
| -------- | --------------------------------------------------------- | ------------------------------------------------------------ | --------------- |
| CTRL-108 | Pagination offset is safe-integer and explicitly bounded  | unit/API boundary tests for conversations and audit evidence | PASS controlled |
| CTRL-109 | Invalid offsets fail before repository access             | API negative tests with repository-call assertion            | PASS controlled |
| CTRL-110 | S26, S25, Secretary and prior controlled boundaries green | full verify/readiness/E2E/PostgreSQL/audit/diff regression   | PASS controlled |

## Round 69 — PLAT-S27 registered before BUILD

- A descoberta reproduziu `offset=1e100` e `offset=9007199254740992` aceitos
  como 200 no endpoint de conversas; o valor também é usado em `OFFSET` SQL.
- Registrado `PLAT-S27-001_CONTROLLED_PAGINATION_OFFSET_BOUNDARY` com teto
  explícito de 10.000 e rejeição de valores não seguros em conversas e audit
  evidence.
- Gate: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório é RED.
  Limit/cursor, auth, tenant, identidade, Secretary, persistência estrutural,
  provider/canal, RAG, dado real, deploy e side effect permanecem fora.

## Round 70 — PLAT-S27 RED observado

- A suíte focada `apps/api/src/pagination-boundary.test.ts` falhou em
  `2026-08-25T18:22:35-03:00` antes da implementação porque
  `pagination-boundary.ts` ainda não existe; nenhum PASS foi inferido.
- O BUILD permanece restrito ao classificador de offset seguro e à validação
  bounded antes dos repositórios em conversas e audit evidence.
- Próximo passo: GREEN mínimo; CTRL-108..110 continuam `PENDING`.

## Round 71 — PLAT-S27 GREEN focado

- `pagination-boundary.ts` foi implementado e integrado aos parsers de
  conversas/audit evidence; focused passou 1 arquivo/5 testes em
  `2026-08-25T18:24:45-03:00`.
- O teto inclusivo 10.000 é aceito; offset negativo, fracionário, unsafe ou
  acima do teto falha com envelope seguro e sem chamar repositório.
- Regressão próxima, verify e gates externos ainda são necessários; CTRL-108..110
  continuam `PENDING`.

## Round 72 — PLAT-S27 fechamento controlado

- `PLAT-S27-001_CONTROLLED_PAGINATION_OFFSET_BOUNDARY` foi fechado como
  `COMPLETED_CONTROLLED` em `2026-08-25T18:36:17-03:00`.
- Verify passou com 105 arquivos/376 testes pass/18 skips e coverage
  85,43%/80,80%/85,25%/86,44%; readiness 4/4, E2E 3/3, PostgreSQL 51/18,
  audit 0, format e diff check também passaram.
- CTRL-108..110 = `PASS controlled`; evidência em
  `docs/04_audit/0517_plat_s27_controlled_pagination_offset_boundary_evidence.md`.
  `CONTROLLED_MVP_READY` permanece; produção segue `NO-GO`/
  `WAITING_HUMAN_APPROVAL`; próximo passo: novo SPEC controlado.

## Quality bar v25 — PLAT-S28 controlled audit filter duplicate boundary

| ID       | Criterion                                                   | Required evidence                                          | Current state   |
| -------- | ----------------------------------------------------------- | ---------------------------------------------------------- | --------------- |
| CTRL-111 | Audit evidence filters reject repeated query values         | unit/API tests for all four filter keys                    | PASS controlled |
| CTRL-112 | Ambiguous filters fail before summary/page repository calls | API negative tests with both repository-call assertions    | PASS controlled |
| CTRL-113 | S27, Secretary and prior controlled boundaries remain green | full verify/readiness/E2E/PostgreSQL/audit/diff regression | PASS controlled |

## Round 73 — PLAT-S28 registered before BUILD

- A descoberta reproduziu `sessionId=a&sessionId=b` aceito como 200 no audit
  evidence; `parseOptionalAuditFilter` escolheu `a` e o encaminhou ao
  repositório, sem contrato para a ambiguidade.
- Registrado `PLAT-S28-001_CONTROLLED_AUDIT_FILTER_DUPLICATE_BOUNDARY` para
  rejeitar arrays de `sessionId`, `correlationId`, `actorId` e `type` antes de
  summary/page.
- Gate: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório é RED.
  Filtro único, offset/limit, auth, tenant, identidade, Secretary, persistência,
  provider/canal, RAG, dado real, deploy e side effect permanecem fora.

## Round 74 — PLAT-S28 RED observado

- A suíte focada `apps/api/src/audit-filter-duplicate-boundary.test.ts` falhou
  em `2026-08-25T18:47:07-03:00` antes da implementação porque
  `audit-filter-duplicate-boundary.ts` ainda não existe; nenhum PASS foi
  inferido.
- O BUILD permanece restrito à classificação single-valued e à rejeição de
  filtros repetidos antes de summary/page; CTRL-111..113 continuam `PENDING`.

## Round 75 — PLAT-S28 GREEN focado

- `audit-filter-duplicate-boundary.ts` foi implementado e integrado a
  `parseOptionalAuditFilter`; focused passou 1 arquivo/6 testes em
  `2026-08-25T18:48:48-03:00`.
- Os quatro filtros repetidos falham com envelope 400 antes de summary/page;
  filtro único com paginação continua 200. Regressão, verify e gates externos
  ainda são necessários; CTRL-111..113 continuam `PENDING`.

## Round 76 — PLAT-S28 fechamento controlado

- `PLAT-S28-001_CONTROLLED_AUDIT_FILTER_DUPLICATE_BOUNDARY` foi fechado como
  `COMPLETED_CONTROLLED` em `2026-08-25T18:57:03-03:00`.
- Verify passou com 106 arquivos/382 testes pass/18 skips e coverage
  85,45%/80,83%/85,26%/86,45%; readiness 4/4, E2E 3/3, PostgreSQL 51/18,
  audit 0, format e diff check também passaram.
- CTRL-111..113 = `PASS controlled`; evidência em
  `docs/04_audit/0518_plat_s28_controlled_audit_filter_duplicate_boundary_evidence.md`.
  `CONTROLLED_MVP_READY` permanece; produção segue `NO-GO`/
  `WAITING_HUMAN_APPROVAL`; próximo passo: novo SPEC controlado.

## Quality bar v21 — PLAT-S24 controlled HTTP parse and payload boundary

| ID       | Criterion                                                        | Required evidence                                               | Current state   |
| -------- | ---------------------------------------------------------------- | --------------------------------------------------------------- | --------------- |
| CTRL-97  | HTTP request body parsing has an explicit bounded limit          | Fastify bodyLimit and parser-boundary tests                     | PASS controlled |
| CTRL-98  | Parse failures use safe API envelopes and server correlation ID  | invalid JSON/media-type integration tests                       | PASS controlled |
| CTRL-99  | Oversized input fails closed without raw payload/error details   | 413 negative test and response inspection                       | PASS controlled |
| CTRL-100 | Unknown request errors remain generic and prior boundaries green | classifier test plus verify/readiness/E2E/PostgreSQL/audit/diff | PASS controlled |

## Round 53 — PLAT-S24 registered before BUILD

- S23 foi fechado como `COMPLETED_CONTROLLED`; a descoberta seguinte
  reproduziu JSON inválido retornando o erro padrão não envelopado do Fastify
  e confirmou que `bodyLimit` não está declarado explicitamente.
- Registrado `PLAT-S24-001_CONTROLLED_HTTP_PARSE_PAYLOAD_BOUNDARY` com limite
  de 1 MiB, parser bounded, classificação de media type/body excessivo e
  error handler global com envelope/correlation ID.
- Gate: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo obrigatório é RED.
  Sem upload, streaming, provider/canal, RAG, dado real, deploy ou side effect.

## Round 54 — PLAT-S24 RED observado

- A suíte focada falhou em `2026-08-25T16:54:19-03:00` por import ausente de
  `http-request-boundary.ts`; o RED confirmou o harness antes do BUILD.

## Round 55 — PLAT-S24 GREEN focado

- O bodyLimit de 1 MiB, o classificador, o parser JSON e o error handler global
  foram implementados. Focused passou 6/6 em `2026-08-25T16:55:23-03:00`,
  com typecheck e lint ainda a seguir.

## Round 56 — PLAT-S24 crítica lead-only e correção

- Um error-like com getter defeituoso em `code` gerou RED em
  `2026-08-25T16:55:56-03:00`; leitura defensiva foi adicionada.
- Focused passou 7/7, typecheck e lint passaram em `2026-08-25T16:56:09-03:00`.
  CTRL-97..100 seguem pendentes até verify e gates externos.

## Round 57 — PLAT-S24 fechamento controlado

- Verify passou com 102 arquivos, 358 testes pass e 18 skips; coverage
  85,46% statements / 80,85% branches / 85,21% functions / 86,40% lines.
  Readiness 4/4, E2E 3/3, PostgreSQL 51 pass/18 skips, audit 0, format e
  `git diff --check` também passaram.
- O smoke e os testes do boundary confirmaram 400/415/413/500 seguros,
  correlation ID server-generated e ausência de raw body/stack/cause.
  CTRL-97..100 = `PASS controlled`.
- `PLAT-S24-001_CONTROLLED_HTTP_PARSE_PAYLOAD_BOUNDARY` =
  `COMPLETED_CONTROLLED`; evidência `docs/04_audit/0514_plat_s24_controlled_http_parse_payload_boundary_evidence.md`.
  `CONTROLLED_MVP_READY` permanece; produção segue `NO-GO`/
  `WAITING_HUMAN_APPROVAL`. Próximo passo: novo SPEC controlado.

## Round 58 — PLAT-S24 revalidação final da evidência

- O focused final foi reexecutado após o teste adicional de erro não tratado de
  rota e passou 8/8 em `2026-08-25T17:10:20-03:00`.
- O verify e os gates externos foram reexecutados: 102 arquivos, 359 testes
  pass e 18 skips; coverage 85,46% statements / 80,85% branches / 85,21%
  functions / 86,40% lines; readiness 4/4; E2E 3/3; PostgreSQL 51 pass/18
  skips; audit 0; format e diff check PASS; smoke controlado PASS.
- A evidência S24 foi atualizada para refletir esta revalidação. O lane segue
  `COMPLETED_CONTROLLED`, `CONTROLLED_MVP_READY`; produção permanece `NO-GO`/
  `WAITING_HUMAN_APPROVAL`.

## Quality bar v6 — PLAT-S09 controlled plugin manifest catalog

| ID      | Criterion                                                            | Required evidence                         | Current state   |
| ------- | -------------------------------------------------------------------- | ----------------------------------------- | --------------- |
| CTRL-22 | Catalog metadata is tenant-scoped and manifest identity is immutable | memory/repository lifecycle and RLS tests | PASS controlled |
| CTRL-23 | Duplicate name/version and stale transitions fail closed             | negative lifecycle/API/PostgreSQL tests   | PASS controlled |
| CTRL-24 | APPROVED metadata never grants handler or external execution         | API/boundary review and no-dispatch tests | PASS controlled |

- Repository snapshot is published on `main`; current changes remained scoped to the registered PLAT-S09 task and were verified before any publication.
- Parallel scout/reviewer dispatch was attempted for backend, frontend and security review, but the available child-agent models rejected execution due account usage/model limits. Lead-only deterministic audit is recorded as a limitation, not independent approval.

## Closure

- `docs/platform/final-technical-audit.md` is the current technical decision record for this checkout.
- Controlled release is `CONTROLLED_MVP_READY`; production release remains `WAITING_HUMAN_APPROVAL`/`NO-GO` until every PROD criterion has evidence and infrastructure signoff.
- PLAT-S06-001 is completed under controlled limits: persistent TestCase/TestSuite catalog, redacted evaluation history and A/B comparison only in Test Lab. PLAT-S07-001 is completed under controlled limits: stale lifecycle preconditions, HTTP 409 recovery and no success audit on conflict. No production authorization changed.

## Quality bar v3 — PLAT-S06 controlled suite catalog

| ID      | Criterion                                                      | Required evidence                                      | Current state   |
| ------- | -------------------------------------------------------------- | ------------------------------------------------------ | --------------- |
| CTRL-11 | Test suites are tenant/agent/version scoped and immutable      | store/API lifecycle and cross-tenant tests             | PASS controlled |
| CTRL-12 | Evaluation history is redacted and never dispatches externally | persistence/evaluation tests and `externalCall: false` | PASS controlled |
| CTRL-13 | A/B comparison validates same tenant/agent and remains dry-run | negative scope tests and API contract                  | PASS controlled |
| CTRL-14 | Legacy runtime and production boundary remain unchanged        | full verify, readiness, E2E and PostgreSQL smoke       | PASS controlled |

## PLAT-S06 controlled closure

- `PLAT-S06-001` = `COMPLETED_CONTROLLED`; evidence is `docs/04_audit/0496_plat_s06_suite_catalog_evidence.md`.
- Final controlled bar: 67 test files, 243 passing tests, 15 conditional skips; coverage 84.40% statements, 80.23% branches, 84.72% functions and 85.24% lines; PostgreSQL fixture 6 files/64 tests; E2E 1 flow; audit 0 vulnerabilities.
- No production authorization changed. `PRODUCTION_REAL_DATA_READY` remains blocked by the PROD criteria and human/infrastructure decisions.

## Quality bar v4 — PLAT-S07 optimistic conflict control

| ID      | Criterion                                               | Required evidence                                | Current state   |
| ------- | ------------------------------------------------------- | ------------------------------------------------ | --------------- |
| CTRL-15 | Stale lifecycle precondition cannot mutate a version    | memory/API negative tests and HTTP 409           | PASS controlled |
| CTRL-16 | PostgreSQL keeps compare-and-swap inside transaction    | repository/fixture conditional update evidence   | PASS controlled |
| CTRL-17 | Conflict emits no success audit or external side effect | API audit assertions and boundary review         | PASS controlled |
| CTRL-18 | Legacy calls and production boundary remain unchanged   | full verify, readiness, E2E and PostgreSQL smoke | PASS controlled |

## Quality bar v4 closure — PLAT-S07

- `PLAT-S07-001` = `COMPLETED_CONTROLLED`; evidence is `docs/04_audit/0497_plat_s07_optimistic_conflict_evidence.md`.
- Final controlled bar: 67 test files, 247 passing tests, 15 conditional skips; coverage 84.82% statements, 80.18% branches, 85.13% functions and 85.69% lines; readiness 4/4; E2E 1/1; PostgreSQL fixture 6 files/49 passed/15 skips; audit 0 vulnerabilities.
- No production authorization changed. Full distributed multi-operator coordination, IdP, HA, real RLS rollout, provider/channel operations, retention/PII and sensitive actions remain blocked.

## Quality bar v5 — PLAT-S08 plugin manifest integrity

| ID      | Criterion                                                              | Required evidence                                     | Current state   |
| ------- | ---------------------------------------------------------------------- | ----------------------------------------------------- | --------------- |
| CTRL-19 | Manifest collections and tool permissions are semantically consistent  | schema RED/GREEN tests                                | PASS controlled |
| CTRL-20 | Plugin versions are immutable and resolution is deterministic/pinnable | registry/gateway tests for pinned and legacy bindings | PASS controlled |
| CTRL-21 | Missing pinned version fails closed without handler or external effect | gateway negative test and boundary review             | PASS controlled |

## Quality bar v5 closure — PLAT-S08

- `PLAT-S08-001` = `COMPLETED_CONTROLLED`; evidence is `docs/04_audit/0498_plat_s08_plugin_manifest_versioning_evidence.md`.
- Final controlled bar: 68 test files, 250 passing tests, 15 conditional skips; coverage 84.88% statements, 80.17% branches, 85.22% functions and 85.74% lines; readiness 4/4; E2E 1/1; PostgreSQL fixture 6 files/49 passed/15 skips; audit 0 vulnerabilities.
- No production authorization changed. Marketplace, persistent plugin lifecycle, network-installed code, provider/channel operations, IdP, HA, retention/PII and sensitive actions remain blocked.

## Quality bar v6 closure — PLAT-S09

- `PLAT-S09-001` = `COMPLETED_CONTROLLED`; evidence is `docs/04_audit/0499_plat_s09_plugin_catalog_evidence.md`.
- Final controlled bar: 71 test files, 253 passing tests, 16 conditional skips; coverage 84.73% statements, 80.11% branches, 84.40% functions and 85.67% lines; readiness 4/4; E2E 1/1; PostgreSQL fixture 6 files/49 passed/16 skips; audit 0 vulnerabilities; format and diff check passed.
- No production authorization changed. Marketplace/installation of third-party code, persistent executable handlers, provider/channel operations, IdP, HA, retention/PII and sensitive actions remain blocked.

## Quality bar v7 — PLAT-S10 controlled plugin catalog Control Center

| ID      | Criterion                                                            | Required evidence                                 | Current state   |
| ------- | -------------------------------------------------------------------- | ------------------------------------------------- | --------------- |
| CTRL-25 | Catalog client sends identity and tenant scope on every request      | client contract tests and API boundary inspection | PASS controlled |
| CTRL-26 | UI lists/creates only validated metadata without secrets or code     | UI RED/GREEN tests and request body inspection    | PASS controlled |
| CTRL-27 | Approval/archive uses expectedStatus and surfaces stale conflict     | UI/API client tests with HTTP 409                 | PASS controlled |
| CTRL-28 | APPROVED remains metadata-only and cannot enable execution           | explicit UI warning, API/catalog boundary tests   | PASS controlled |
| CTRL-29 | Existing AgentVersion/Test Lab and release boundary remain unchanged | full verify, readiness, E2E and audit             | PASS controlled |

- No migration, handler, network install, provider/channel, real data or side effect is authorized by v7.

## Quality bar v7 closure — PLAT-S10

- `PLAT-S10-001` = `COMPLETED_CONTROLLED`; evidence is `docs/04_audit/0500_plat_s10_plugin_catalog_control_center_evidence.md`.
- Final controlled bar: 72 test files, 257 passing tests, 16 conditional skips; coverage 84.97% statements, 80.21% branches, 84.93% functions and 85.90% lines; readiness 4/4; E2E 1/1; PostgreSQL fixture 4 files/49 passed/16 skips; audit 0 vulnerabilities; format and diff check passed.
- No production authorization changed. Marketplace/installation, executable handlers, provider/channel operations, IdP, HA, retention/PII and sensitive actions remain blocked.

## Quality bar v9 — PLAT-S12 controlled prompt profile/templates

| ID      | Criterion                                                        | Required evidence                                  | Current state   |
| ------- | ---------------------------------------------------------------- | -------------------------------------------------- | --------------- |
| CTRL-36 | Prompt/template editor validates JSON, shape, limits and secrets | RED/GREEN parser and UI boundary tests             | PASS controlled |
| CTRL-37 | Protected system/safety/kernel blocks cannot be changed          | source/clone negative tests and backend inspection | PASS controlled |
| CTRL-38 | AgentVersion remains immutable authority for profile versions    | clone request and store snapshot tests             | PASS controlled |
| CTRL-39 | Operational templates work without weakening hard safety         | Test Lab response tests and kernel-path assertions | PASS controlled |
| CTRL-40 | Profile checksum/status are deterministic and trace-visible      | checksum/trace tests and UI rendering              | PASS controlled |
| CTRL-41 | Existing controlled boundary remains unchanged                   | full verify, readiness, E2E, PostgreSQL and audit  | PASS controlled |

## Round 18 — PLAT-S12 registered before BUILD

- A auditoria do Control Center confirmou que `promptBlocks` e
  `responseTemplates` eram preservados, mas não editáveis pela UI; o trace não
  carregava checksum/status do perfil.
- Registrado `PLAT-S12-001` no PRD, SPEC, ExecPlan, backlog da plataforma,
  backlog master e runtime state antes do código.
- Escopo congelado: editor JSON controlado sobre `AgentVersion`, proteção
  fail-closed de blocks system/safety/kernel, templates operacionais seguros,
  checksum/status no trace e Test Lab sem provider/canal/side effect.
- Não há autorização para catálogo mutável paralelo, migration, RAG
  institucional, dados reais, ações sensíveis ou produção irrestrita.

## Round 19 — PLAT-S12 implementation and controlled closure

- RED/GREEN fechou parser/serializer, limites, ids/kinds/prioridades, chaves
  reservadas, prototype keys, segredo, duplicidade, proteção de blocks e
  preservação do metadata `locked`.
- O backend valida integridade no store/repository e o clone API rejeita novos
  blocks protegidos sem criar versão. O Test Lab usa fallbacks operacionais
  somente em `low_confidence`, `no_knowledge`, `handoff` e scheduling sob
  evidência/approval; medicamento e bloqueios permanecem kernel-owned.
- O trace agora registra versão/status/checksum determinístico e a UI permite
  editar o profile sem catálogo paralelo; toda alteração cria nova
  `AgentVersion`.
- Gates finais: 77 arquivos/279 testes pass/16 skips; coverage 84,92%
  statements, 80,30% branches, 85,76% functions, 85,87% lines; typecheck,
  lint, format, build, readiness, E2E 1/1, PostgreSQL 49 pass/16 skips, audit
  0 vulnerabilidades e diff check PASS.
- Evidência: `docs/04_audit/0502_plat_s12_prompt_profile_template_control_center_evidence.md`.
- Fechamento lead-only; child agents não estavam disponíveis. Produção real
  permanece `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## Quality bar v10 — PLAT-S13 controlled Handoff Policy Studio

| ID      | Criterion                                                           | Required evidence                             | Current state   |
| ------- | ------------------------------------------------------------------- | --------------------------------------------- | --------------- |
| CTRL-42 | Thresholds are bounded, relational and legacy-compatible            | schema/evaluator RED/GREEN and boundary tests | PASS controlled |
| CTRL-43 | UI validates and persists multiple destinations/priority by clone   | UI parser/API tests and E2E                   | PASS controlled |
| CTRL-44 | Runtime applies clarify/handoff thresholds without weakening safety | evaluator/Test Lab tests                      | PASS controlled |
| CTRL-45 | Trace exposes redacted destination/priority                         | trace contract and Test Lab tests             | PASS controlled |
| CTRL-46 | AgentVersion remains immutable and tenant-scoped                    | clone/API/store regression                    | PASS controlled |
| CTRL-47 | Existing controlled boundary remains green                          | verify/readiness/E2E/PostgreSQL/audit         | PASS controlled |

## Round 20 — PLAT-S13 registered before BUILD

- Recovery confirmou S12 como último lane validado e restaurou o checkpoint
  obrigatório `docs/platform/05-progress.md`.
- Registrado `PLAT-S13-001_HANDOFF_POLICY_STUDIO` no PRD, SPEC, ExecPlan,
  backlog, runtime state e execution log antes de qualquer código.
- Scope: thresholds/clarifications/destinations/priority no AgentVersion e
  Test Lab, sem canal/provider/RAG/migration/dado real/side effect.
- Gate atual: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo é TDD controlado.

## Round 21 — PLAT-S13 controlled closure

- RED/GREEN identificou e fechou validação de campos vazios, destinos
  duplicados/formato inválido, thresholds incoerentes e elevação de prioridade
  em risco crítico.
- Gates finais: 79 arquivos/284 testes pass/16 skips; coverage 84,98%
  statements, 80,44% branches, 86,00% functions, 85,92% lines; typecheck,
  lint, format, build, readiness, E2E 1/1, PostgreSQL 49 pass/16 skips, audit
  0 vulnerabilidades e diff check PASS.
- Evidência: `docs/04_audit/0503_plat_s13_handoff_policy_studio_evidence.md`;
  `PLAT-S13-001` = `COMPLETED_CONTROLLED`.
- Fechamento lead-only; produção real permanece `NO-GO`/
  `WAITING_HUMAN_APPROVAL`; próximo lane exige novo SPEC.

## Quality bar v8 — PLAT-S11 controlled event bus and hooks

| ID      | Criterion                                                       | Required evidence                                           | Current state   |
| ------- | --------------------------------------------------------------- | ----------------------------------------------------------- | --------------- |
| CTRL-30 | Event names are typed and allowlisted                           | RED/GREEN contract tests and negative unknown-event tests   | PASS controlled |
| CTRL-31 | Hook registration requires manifest declaration and tenant      | registry/bus tests for missing declaration and cross-tenant | PASS controlled |
| CTRL-32 | Event payloads are redacted and deeply immutable                | sensitive-payload and mutation-isolation tests              | PASS controlled |
| CTRL-33 | Hook errors are isolated and sanitized/audited                  | failure delivery and audit callback tests                   | PASS controlled |
| CTRL-34 | Test Lab emits representative lifecycle events                  | integration event assertions with dry-run boundary          | PASS controlled |
| CTRL-35 | Existing controlled behavior and release boundary are unchanged | full verify, E2E, audit and temporal diff review            | PASS controlled |

## Round 16 — PLAT-S11 registered before BUILD

- A auditoria do prompt identificou que `PluginManifest.hooks` existia apenas
  como metadata: não havia event bus nem inscrição tenant-aware no pipeline.
- Registrado `PLAT-S11-001` no PRD, SPEC, ExecPlan, backlog da plataforma,
  backlog master e runtime state antes de alterar código.
- O escopo congelado é um bus process-local e best-effort, com allowlist,
  payload redigido/imutável, erro isolado e integração observacional no Test
  Lab. O catálogo S09 continua metadata-only; broker, marketplace, provider,
  canal e produção real permanecem bloqueados.

## Round 17 — PLAT-S11 implementation and controlled closure

- RED/GREEN fechou o contrato do event bus, incluindo allowlist completa,
  declaração de manifest, tenant isolation, redaction/imutabilidade e falha
  isolada/auditada.
- `PluginRegistry` preserva handlers de hooks em cópias defensivas e o Test
  Lab emite eventos representativos sem incluir mensagem bruta ou alterar
  `externalCall: false`.
- Gates finais passaram: `npm run verify`, 74 arquivos/264 testes/16 skips,
  coverage 84,88% statements / 80,11% branches / 85,26% functions / 85,81%
  lines, readiness 4/4, E2E 1/1, PostgreSQL 49 pass/16 skips, audit 0
  vulnerabilidades, format e diff check.
- Evidência: `docs/04_audit/0501_plat_s11_event_bus_hooks_evidence.md`;
  `PLAT-S11-001` = `COMPLETED_CONTROLLED`. O fechamento é lead-only;
  produção permanece `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## Quality bar v11 — PLAT-S14 controlled safety publish preflight

| ID      | Criterion                                                      | Required evidence                                   | Current state   |
| ------- | -------------------------------------------------------------- | --------------------------------------------------- | --------------- |
| CTRL-48 | Critical cases are fixed, immutable and scope-bound            | preflight contract and negative caller-input tests  | PASS controlled |
| CTRL-49 | Publish/rollback cannot bypass the safety preflight            | API boundary tests and no-mutation failure evidence | PASS controlled |
| CTRL-50 | Preflight report/audit contains no raw payload                 | redacted summary and audit assertions               | PASS controlled |
| CTRL-51 | Medication and real appointment actions remain fail-closed     | policy/response/handoff regression cases            | PASS controlled |
| CTRL-52 | External calls remain disabled in every critical case          | `externalCall: false` assertions                    | PASS controlled |
| CTRL-53 | Existing lifecycle conflict and controlled boundary stay green | full verify/readiness/E2E/PostgreSQL/audit          | PASS controlled |

## Round 22 — PLAT-S14 registered before BUILD

- S13 foi encerrado com todos os gates controlados verdes e a auditoria
  técnica foi sincronizada para a base `f9e0096` + checkout não publicado.
- Registrado `PLAT-S14-001_CONTROLLED_SAFETY_PUBLISH_PREFLIGHT` no PRD, SPEC,
  ExecPlan, backlog, runtime state e execution log antes de qualquer código.
- Scope congelado: cases críticos fixos sobre o próprio snapshot, relatório
  redigido, endpoint de preflight e enforcement em publish/rollback; sem cases
  arbitrários, provider/canal/RAG/migration/dado real/side effect.
- Gate atual: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo é escrever RED.

## Round 23 — PLAT-S14 controlled closure

- RED/GREEN cobriu cases fixos, resumo sem payload, binding de escopo, endpoint,
  publish/rollback sem mutação em falha, bootstrap controlado e proteção de
  `externalCall`.
- Gates finais: 80 arquivos/289 testes pass/16 skips; coverage 85,06%
  statements, 80,38% branches, 85,97% functions, 85,98% lines; verify,
  readiness, E2E 1/1, PostgreSQL 49 pass/16 skips, audit 0 e diff check PASS.
- Evidência: `docs/04_audit/0504_plat_s14_controlled_safety_publish_preflight_evidence.md`;
  `PLAT-S14-001` = `COMPLETED_CONTROLLED`.
- Fechamento lead-only; produção permanece `NO-GO`/`WAITING_HUMAN_APPROVAL`;
  próximo lane exige novo SPEC.

## Quality bar v12 — PLAT-S15 controlled knowledge source catalog

| ID      | Criterion                                                   | Required evidence                                  | Current state   |
| ------- | ----------------------------------------------------------- | -------------------------------------------------- | --------------- |
| CTRL-54 | Source URI/version metadata is bounded and metadata-only    | schema RED/GREEN and secret/external URI negatives | PASS controlled |
| CTRL-55 | Catalog identity is tenant-scoped and unique                | memory/PostgreSQL unique and cross-tenant tests    | PASS controlled |
| CTRL-56 | Lifecycle and expectedStatus fail closed                    | transition matrix and HTTP 409/API tests           | PASS controlled |
| CTRL-57 | APPROVED metadata cannot produce RAG or mutate AgentVersion | API/UI/store boundary inspection and tests         | PASS controlled |
| CTRL-58 | Control Center exposes safe catalog operations              | client/UI tests and browser/API evidence           | PASS controlled |
| CTRL-59 | Existing controlled boundary remains green                  | full verify/readiness/E2E/PostgreSQL/audit         | PASS controlled |

## Round 24 — PLAT-S15 registered before BUILD

- S14 foi fechado com 80 arquivos/289 testes pass/16 skips, coverage acima de
  80%, E2E, PostgreSQL, audit e diff check verdes.
- Registrado `PLAT-S15-001_CONTROLLED_KNOWLEDGE_SOURCE_CATALOG` no PRD, SPEC,
  ExecPlan, backlog, runtime state e execution log antes de qualquer código.
- Scope congelado: identidade/versionamento/status de fontes `controlled://`,
  catálogo tenant-aware metadata-only, API/UI e PostgreSQL/RLS; sem conteúdo,
  ingestão, embeddings, vector store, RAG, URL externa ou side effect.
- Gate atual: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo é escrever RED.

## Round 25 — PLAT-S15 controlled closure

- RED/GREEN cobriu schema strict e bounded, URI externa/segredo, duplicidade,
  cópia defensiva, lifecycle, precondition stale, cross-tenant, API, audit,
  Control Center e adapter PostgreSQL com fixture stateful.
- A migration `0005_knowledge_source_catalog.sql` adiciona unique tenant/source/
  version, constraints de segredo, trigger de identidade/lifecycle, índice,
  `FORCE ROW LEVEL SECURITY` e política tenant-aware.
- Gates finais: 83 arquivos/294 testes pass/17 skips; coverage 85,03%
  statements, 80,26% branches, 85,41% functions, 85,88% lines; `npm run verify`,
  readiness, E2E 1/1, PostgreSQL 49 pass/17 skips, audit 0 e diff check PASS.
- Evidência: `docs/04_audit/0505_plat_s15_controlled_knowledge_source_catalog_evidence.md`;
  `PLAT-S15-001` = `COMPLETED_CONTROLLED`.
- APPROVED continua metadata-only: nenhuma mutação de AgentVersion, resposta
  RAG, provider, canal, dado real ou side effect; produção permanece
  `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## Quality bar v13 — PLAT-S16 controlled release-candidate evidence ledger

| ID      | Criterion                                                      | Required evidence                            | Current state   |
| ------- | -------------------------------------------------------------- | -------------------------------------------- | --------------- |
| CTRL-60 | Ledger shape/gates/refs are strict, bounded and secret-free    | schema RED/GREEN and negative input tests    | PASS controlled |
| CTRL-61 | Candidate is tenant/agent/version scoped with server digest    | store/repository uniqueness and digest tests | PASS controlled |
| CTRL-62 | Lifecycle/CAS and all-PASS validation fail closed              | transition matrix/API 409 tests              | PASS controlled |
| CTRL-63 | VALIDATED cannot mutate runtime or enable external execution   | store/API/UI boundary tests and diff audit   | PASS controlled |
| CTRL-64 | PostgreSQL RLS/immutability and existing boundary remain green | migration/smoke, verify/readiness/E2E/audit  | PASS controlled |

## Round 26 — PLAT-S16 registered before BUILD

- S15 foi encerrado com gates controlados verdes e `CONTROLLED_MVP_READY`,
  mantendo produção `NO-GO`/`WAITING_HUMAN_APPROVAL`.
- Registrado `PLAT-S16-001_CONTROLLED_RELEASE_CANDIDATE_EVIDENCE_LEDGER` no
  PRD, SPEC, ExecPlan, backlog, runtime state e execution log antes do código.
- Scope congelado: ledger metadata-only, quatro gates fixos, refs controladas,
  digest calculado pelo servidor, lifecycle/CAS, migration/RLS, API/UI e audit.
- Gate atual: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo é escrever RED.
- Proibições preservadas: deploy, rollout, IdP/RBAC real, assinatura externa,
  provider/canal, RAG, dados reais e side effects.

## Round 27 — PLAT-S16 RED observado

- Testes RED executados antes do código: 5 falhas esperadas em contrato/digest,
  store lifecycle e API (rota 404; exports/métodos ainda ausentes).
- Gate de BUILD mantido restrito a contratos, digest, store, PostgreSQL/RLS,
  API/UI e audit metadata-only; nenhuma ativação, deploy ou execução externa.

## Round 28 — PLAT-S16 controlled closure

- RED/GREEN fechou o ledger tenant-aware de quatro gates fixos, refs
  `controlled://evidence/...`, digest SHA-256 do servidor, vínculo
  agent/version, unique, cópia defensiva, lifecycle/CAS, cross-tenant,
  API/UI, audit redigido, migration 0006 e RLS.
- `VALIDATED` exige quatro gates `PASS` e permanece metadata-only: não muta
  `AgentVersion`/`activeVersionId`, não publica, não faz deploy e não libera
  provider, canal, RAG, dado real ou side effect.
- Gates finais: `npm run verify` PASS; 88 arquivos/303 testes pass/18 skips;
  coverage 84,81% statements / 80,03% branches / 84,87% functions / 85,65%
  lines; readiness 4/4; E2E 1/1; PostgreSQL 49 pass/18 skips; audit 0; format
  e diff check PASS.
- Evidência: `docs/04_audit/0506_plat_s16_controlled_release_candidate_evidence_ledger_evidence.md`;
  `PLAT-S16-001` = `COMPLETED_CONTROLLED`.
- Fechamento lead-only por indisponibilidade do runtime de child agents;
  produção permanece `NO-GO`/`WAITING_HUMAN_APPROVAL` e o próximo lane exige
  novo SPEC.

## Quality bar v14 — PLAT-S17 controlled audit evidence checkpoint

| ID      | Criterion                                                 | Required evidence                              | Current state   |
| ------- | --------------------------------------------------------- | ---------------------------------------------- | --------------- |
| CTRL-65 | Checkpoint input is strict, bounded and payload-free      | schema RED/GREEN and negative input tests      | PASS controlled |
| CTRL-66 | Event IDs/filter set is tenant-scoped and server-verified | repository/store cross-tenant and filter tests | PASS controlled |
| CTRL-67 | Digest is canonical and caller cannot choose it           | digest mutation and evidence-change tests      | PASS controlled |
| CTRL-68 | SEALED/ARCHIVED lifecycle and CAS fail closed             | transition matrix/API conflict tests           | PASS controlled |
| CTRL-69 | PostgreSQL RLS and existing audit boundary remain green   | migration/smoke, verify/readiness/E2E/audit    | PASS controlled |

## Round 29 — PLAT-S17 registered before BUILD

- S16 foi fechado com evidência executável e `CONTROLLED_MVP_READY`.
- Discovery identificou que a auditoria redigida/paginada não tinha checkpoint
  imutável do conjunto revisado; registrado `PLAT-S17-001` no PRD, SPEC,
  ExecPlan, backlogs, runtime e execution log antes do código.
- Scope congelado: IDs/filtros bounded, verificação tenant-scoped, digest
  server-side, `SEALED/ARCHIVED`, migration/RLS, API/client/UI e metadata-only.
- Gate atual: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo é escrever RED.
- Proibições preservadas: payload bruto, export externo, retenção real,
  alteração de eventos, provider/canal, RAG, dado real e side effect.

## Round 30 — PLAT-S17 RED observado

- Foram adicionados testes focados para contrato bounded, digest, lifecycle/CAS,
  cross-tenant, API, client e controles de Auditoria.
- O comando Vitest focado falhou conforme esperado: contrato/store ainda não
  existe, rotas retornam 404, client não possui o método e a UI não expõe os
  controles; cinco assertions/suites ficaram vermelhos.
- O estado avançou de SPEC para BUILD controlado. Próximo passo é implementar
  o contrato/digest/store sem persistir payload ou abrir qualquer side effect.

## Round 31 — PLAT-S17 implementation and controlled closure

- RED/GREEN fechou contrato strict/bounded, digest server-side, filtros e
  cross-tenant, lifecycle/CAS, memória/PostgreSQL, migration 0007/RLS,
  API/client/UI e audit metadata-only; nenhum payload bruto foi persistido ou
  exportado.
- Gates finais passaram: `npm run verify`, 95 arquivos/317 testes pass/18
  skips, coverage 84,95% statements / 80,00% branches / 84,52% functions /
  85,82% lines, readiness 4/4, E2E 2/2, PostgreSQL 51 pass/18 skips,
  audit 0 e `git diff --check`.
- Evidência: `docs/04_audit/0507_plat_s17_controlled_audit_evidence_checkpoint_evidence.md`;
  `PLAT-S17-001` = `COMPLETED_CONTROLLED`.
- `CONTROLLED_MVP_READY` permanece; produção real segue `NO-GO`/
  `WAITING_HUMAN_APPROVAL`. Fechamento lead-only, sem aprovação independente.

## Quality bar v15 — PLAT-S18 controlled HTTP security boundary

| ID      | Criterion                                                   | Required evidence                               | Current state   |
| ------- | ----------------------------------------------------------- | ----------------------------------------------- | --------------- |
| CTRL-70 | Origins are exact-match, normalized and never wildcard/null | parser/unit and API negative tests              | PASS controlled |
| CTRL-71 | CORS preflight is allowlisted and cannot execute a handler  | integration 204/403 and handler isolation tests | PASS controlled |
| CTRL-72 | HTTPS enforcement trusts only configured proxy hops         | transport/proxy tests and production boundary   | PASS controlled |
| CTRL-73 | Security headers are fixed; HSTS is HTTPS-only              | response header assertions                      | PASS controlled |
| CTRL-74 | Production bootstrap requires origins and explicit HTTPS    | env/factory negative tests                      | PASS controlled |

## Round 32 — PLAT-S18 registered before BUILD

- S17 foi fechado com `CONTROLLED_MVP_READY`; a auditoria apontou que o API
  ainda não tinha enforcement executável de Origin/CORS/preflight e HTTPS.
- Registrado `PLAT-S18-001_CONTROLLED_HTTP_SECURITY_BOUNDARY` no PRD, SPEC,
  ExecPlan, backlogs, runtime state e execution log antes do código.
- Scope congelado: normalização exact-match, CORS/preflight allowlisted,
  headers CSP/HSTS, HTTPS com `trustedProxyHops` explícito e bootstrap por env.
- Gate atual: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo é escrever RED.
- Proibições preservadas: host/proxy/IdP real, deploy, provider/canal, RAG,
  dado real, migration irreversível e side effect.

## Round 34 — PLAT-S18 implementation and controlled closure

- RED/GREEN fechou parser exact-match, CORS/preflight fail-closed com
  `GET/POST/PATCH/OPTIONS`, headers fixos, HTTPS/proxy explícito, HSTS
  HTTPS-only e bootstrap production por env.
- A revisão do diff detectou e corrigiu a compatibilidade do `PATCH` usado pelo
  fluxo atual de tarefas; o método continua allowlisted sem wildcard,
  credentials ou origin desconhecida.
- Gates finais: `npm run verify` PASS; 97 arquivos/330 testes pass/18 skips;
  coverage 85,16% statements / 80,44% branches / 84,75% functions /
  86,06% lines; readiness 4/4; E2E 3/3; PostgreSQL 51 pass/18 skips; audit
  0 e `git diff --check` PASS.
- Evidência: `docs/04_audit/0508_plat_s18_controlled_http_security_boundary_evidence.md`;
  `PLAT-S18-001` = `COMPLETED_CONTROLLED`.
- `CONTROLLED_MVP_READY` permanece; produção real segue `NO-GO`/
  `WAITING_HUMAN_APPROVAL`. Fechamento lead-only, sem aprovação independente.

## Quality bar v16 — PLAT-S19 controlled request observability metrics

| ID      | Criterion                                                      | Required evidence                                    | Current state   |
| ------- | -------------------------------------------------------------- | ---------------------------------------------------- | --------------- |
| CTRL-75 | Request metrics state is immutable and defensively snapshotted | collector unit tests and mutation negatives          | PASS controlled |
| CTRL-76 | Route/method cardinality is bounded and raw path is excluded   | route normalization and overflow tests               | PASS controlled |
| CTRL-77 | Status/latency aggregation covers route and security outcomes  | integration tests for route, 404 and boundary reject | PASS controlled |
| CTRL-78 | Health metrics endpoint is read-only and redaction-safe        | API envelope and no-sensitive-field assertions       | PASS controlled |
| CTRL-79 | Existing gates and no-side-effect boundary remain green        | verify/readiness/E2E/PostgreSQL/audit/diff           | PASS controlled |

## Round 35 — PLAT-S19 registered before BUILD

- S18 foi fechado com `CONTROLLED_MVP_READY`; a próxima lacuna segura é a
  ausência de visão agregada de respostas HTTP e latência sem depender de logs
  por domínio.
- Registrado `PLAT-S19-001_CONTROLLED_REQUEST_OBSERVABILITY_METRICS` no PRD,
  SPEC, ExecPlan, backlogs, runtime state e execution log antes do código.
- Scope congelado: collector process-local por substituição imutável de estado,
  templates de rota bounded, método/status/latência, fallback de rotas não
  casadas, snapshot defensivo e `/health/metrics` read-only.
- Gate atual: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo é escrever RED.
- Proibições preservadas: Prometheus/OTel/broker/storage distribuído, retenção,
  alerting, deploy, provider/canal, RAG, dado real e side effect.

## Round 36 — PLAT-S19 RED observado

- Testes focados do collector e endpoint `/health/metrics` foram escritos antes
  da implementação.
- RED confirmado: `request-metrics.ts` ainda não existe e não há integração de
  métricas no Fastify; a implementação deve começar pelo collector bounded e
  snapshot defensivo, sem dados sensíveis ou persistência.

## Round 37 — PLAT-S19 implementation and controlled closure

- GREEN implementou collector process-local por substituição imutável, métodos
  e buckets de status bounded, templates de rota com `__unmatched__` e
  `__other__`, latência total/máxima, snapshot defensivo e endpoint
  `/health/metrics` read-only/redaction-safe.
- A integração conta respostas normais, 404 de rota desconhecida e rejeição de
  boundary HTTP sem guardar path, query, body, header sensível ou identidade.
- Gates finais: `npm run verify` PASS; 98 arquivos/333 testes pass/18 skips;
  coverage 85,24% statements / 80,63% branches / 84,99% functions /
  86,16% lines; readiness 4/4; E2E 3/3; PostgreSQL 51 pass/18 skips;
  audit 0, format e `git diff --check` PASS.
- Evidência: `docs/04_audit/0509_plat_s19_controlled_request_observability_metrics_evidence.md`;
  `PLAT-S19-001` = `COMPLETED_CONTROLLED`.
- `CONTROLLED_MVP_READY` permanece; produção real segue `NO-GO`/
  `WAITING_HUMAN_APPROVAL`. O próximo lane exige novo SPEC controlado.

## Quality bar v30 — PLAT-S33 controlled worker published-runtime boundary

| ID       | Criterion                                                               | Required evidence                                    | Current state   |
| -------- | ----------------------------------------------------------------------- | ---------------------------------------------------- | --------------- |
| CTRL-128 | Worker aceita somente job strict, bounded e tenant/agent/version scoped | focused contract tests and validation negative path  | PASS controlled |
| CTRL-129 | Job válido delega ao runtime pinned sem provider/canal/side effect      | worker trace and external-call-negative test         | PASS controlled |
| CTRL-130 | Entrypoint sem queue adapter falha fechado sem bootstrap fictício       | startup guard test and controlled process inspection | PASS controlled |
| CTRL-131 | S32 e boundaries anteriores permanecem verdes                           | regression, verify, E2E, PostgreSQL and audit gates  | PASS controlled |

## Round 94 — PLAT-S33 RED observado

- A suíte focada `apps/worker/src/__tests__/published-worker-runtime.test.ts`
  executou em `2026-08-25T21:23:51-03:00` antes da implementação.
- RED real: 4 testes falharam; o worker legado ignorou o contrato pinned e
  tentou `runAgentTurn`, aceitou o payload `{ sessionId, triggerMessageId }`,
  não retornou `pinned_version_missing` e não possuía startup guard de fila.
- Próximo passo: GREEN mínimo com schema bounded, delegação explícita ao
  `executePublishedAgent` e entrypoint fail-closed; CTRL-128..131 continuam
  `PENDING`.

## Round 95 — PLAT-S33 GREEN focado

- O job strict/bounded, a delegação ao `executePublishedAgent` com
  `versionId` explícito e o startup guard sem bootstrap hardcoded foram
  implementados.
- A suíte focada passou 2 arquivos/5 testes em `2026-08-25T21:27:01-03:00`;
  typecheck, lint e smoke do `dev:worker` também passaram. O smoke encerrou
  com código 1 e somente `queue_adapter_missing` redigido.
- CTRL-128..130 = `PASS controlled` em focused/inspection; CTRL-131 aguarda
  regressão e gates integrados.

## Round 96 — PLAT-S33 correção de boundary de dependências

- A primeira suíte completa encontrou 1 falha estrutural: `apps/worker` não
  pode depender diretamente de `@cvg/platform` segundo o target repository.
- O contrato bounded/parse foi movido para `packages/agent-core`, que já
  possui a superfície de plataforma; o worker voltou às dependências
  permitidas sem reduzir validação, pinning ou fail-closed.
- O teste estrutural e os focused worker passaram 3 arquivos/7 testes em
  `2026-08-25T21:35:16-03:00`; CTRL-128..130 permanecem `PASS controlled` e
  CTRL-131 aguarda a suíte integral.

## Quality bar v20 — PLAT-S23 controlled startup failure redaction

| ID      | Criterion                                                     | Required evidence                                     | Current state   |
| ------- | ------------------------------------------------------------- | ----------------------------------------------------- | --------------- |
| CTRL-93 | Startup failures use a bounded structured output              | formatter tests and entrypoint integration inspection | PASS controlled |
| CTRL-94 | Secrets, credentials, tokens and PII never enter startup logs | redaction-negative tests with representative messages | PASS controlled |
| CTRL-95 | Unknown/configuration failures do not expose stack or cause   | Zod/unknown and stack/cause negative tests            | PASS controlled |
| CTRL-96 | Exit/fail-closed and prior controlled boundaries stay intact  | full verify/readiness/E2E/PostgreSQL/audit/diff       | PASS controlled |

## Round 47 — PLAT-S23 registered before BUILD

- S22 foi fechado com `CONTROLLED_MVP_READY`; a descoberta seguinte encontrou
  `console.error(error)` bruto no catch de `apps/api/src/main.ts`.
- Registrado `PLAT-S23-001_CONTROLLED_STARTUP_FAILURE_REDACTION` no PRD, SPEC,
  ExecPlan, backlogs, runtime state e execution log antes do código.
- Scope congelado: formatter puro, saída JSON mínima, redaction de credenciais,
  tokens e PII, newline/truncamento bounded, sem stack/cause e sem alteração de
  exit code ou ordem do bootstrap.
- Gate atual: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo é escrever RED.
- Proibições preservadas: logger distribuído, persistência, alerting, IdP,
  tenant binding, provider/canal, RAG, dado real, deploy e side effect.

## Round 48 — PLAT-S23 RED observado

- A suíte focada falhou em `2026-08-25T16:19:41-03:00` por import ausente de
  `startup-failure.ts`, conforme esperado antes do BUILD.
- O RED confirmou o harness e preservou todos os gates anteriores.

## Round 49 — PLAT-S23 GREEN focado

- O formatter e o catch seguro do `main` foram implementados; a suíte focada
  passou 7/7 em `2026-08-25T16:21:58-03:00`.
- CTRL-93..95 seguem pendentes até a verificação integrada; CTRL-96 ainda não
  foi avaliado. Produção continua `NO-GO`/`WAITING_HUMAN_APPROVAL`.

## Round 50 — PLAT-S23 crítica lead-only

- Foi reproduzido um `Error`-like com `message` não-string que quebrava o
  redactor antes do output seguro. RED em `2026-08-25T16:32:01-03:00`.

## Round 51 — PLAT-S23 correção e focused retest

- O formatter agora valida `typeof message === "string"` e usa fallback
  genérico. Focused 8/8, typecheck, lint e format passaram em
  `2026-08-25T16:32:19-03:00`.
- A barra permanece pendente até novo verify e gates externos.

## Round 52 — PLAT-S23 fechamento controlado

- O verify completo passou com 101 arquivos, 351 testes pass e 18 skips;
  coverage 85,42% statements / 80,84% branches / 85,16% functions /
  86,33% lines. Readiness 4/4, E2E 3/3, PostgreSQL 51 pass/18 skips,
  audit 0, format e `git diff --check` também passaram.
- O smoke controlado do entrypoint encerrou com exit 1 e emitiu somente
  JSON redigido, sem stack/cause. CTRL-93..96 = `PASS controlled`.
- `PLAT-S23-001_CONTROLLED_STARTUP_FAILURE_REDACTION` =
  `COMPLETED_CONTROLLED`; evidência `docs/04_audit/0513_plat_s23_controlled_startup_failure_redaction_evidence.md`.
  `CONTROLLED_MVP_READY` permanece; produção segue `NO-GO`/
  `WAITING_HUMAN_APPROVAL`. O próximo passo é novo SPEC controlado.

## Quality bar v17 — PLAT-S20 controlled rate-limit memory safety

| ID      | Criterion                                                       | Required evidence                                 | Current state   |
| ------- | --------------------------------------------------------------- | ------------------------------------------------- | --------------- |
| CTRL-80 | Rate-limit policies and keys validate within explicit bounds    | focused invalid policy/key tests                  | PASS controlled |
| CTRL-81 | Local bucket cardinality is bounded with deterministic eviction | expiry/capacity/eviction tests and snapshot count | PASS controlled |
| CTRL-82 | Rate-limit snapshots never export keys or mutate internal state | snapshot redaction and defensive-copy tests       | PASS controlled |
| CTRL-83 | 429 preserves envelope/retry contract and is not cacheable      | API integration response header assertions        | PASS controlled |
| CTRL-84 | Existing safety and external-side-effect boundaries stay green  | verify/readiness/E2E/PostgreSQL/audit/diff        | PASS controlled |

## Round 38 — PLAT-S20 registered before BUILD

- S19 foi fechado com `CONTROLLED_MVP_READY`; a próxima lacuna segura é o
  crescimento potencialmente ilimitado do mapa do limiter process-local.
- Registrado `PLAT-S20-001_CONTROLLED_RATE_LIMIT_MEMORY_SAFETY` no PRD, SPEC,
  ExecPlan, backlogs, runtime state e execution log antes do código.
- Scope congelado: `maxBuckets` bounded, purge/evicção determinística,
  validação de policy/key, snapshot sem chaves e `Cache-Control: no-store` no
  429, preservando o contrato do Secretary.
- Gate atual: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo é escrever RED.
- Proibições preservadas: Redis/edge/limiter distribuído, HA, IdP, provider,
  canal, RAG, dado real, deploy, migration e side effect.

## Round 39 — PLAT-S20 RED observado

- Testes focados foram escritos antes do código para opções bounded, policy/key
  inválidas, evicção, snapshot sem chaves e 429 sem cache.
- RED reproduzido: 3 testes falharam como esperado; os dois testes legados
  continuam passando. A implementação deve permanecer local, bounded e sem
  alteração de identidade, tenant binding ou efeitos externos.

## Round 40 — PLAT-S20 implementation and controlled closure

- GREEN implementou limites explícitos de policy/key/maxBuckets, purge de
  expirados, evicção determinística pelo menor `resetAt`, snapshot somente com
  contagem/capacidade e `Cache-Control: no-store` no 429.
- A suíte focada passou 5/5 e os testes legados de allow/deny, expiração e
  envelope continuam verdes; nenhuma chave ou identidade entra na resposta.
- Gates finais: `npm run verify` PASS; 98 arquivos/335 testes pass/18 skips;
  coverage 85,31% statements / 80,72% branches / 85,07% functions /
  86,23% lines; readiness 4/4; E2E 3/3; PostgreSQL 51 pass/18 skips;
  audit 0, format e `git diff --check` PASS.
- Evidência: `docs/04_audit/0510_plat_s20_controlled_rate_limit_memory_safety_evidence.md`;
  `PLAT-S20-001` = `COMPLETED_CONTROLLED`.
- `CONTROLLED_MVP_READY` permanece; produção real segue `NO-GO`/
  `WAITING_HUMAN_APPROVAL`. O próximo lane exige novo SPEC controlado.

## Quality bar v18 — PLAT-S21 controlled metrics exposure boundary

| ID      | Criterion                                                    | Required evidence                                | Current state   |
| ------- | ------------------------------------------------------------ | ------------------------------------------------ | --------------- |
| CTRL-85 | Metrics route is available only in controlled environments   | test/development and unknown-environment tests   | PASS controlled |
| CTRL-86 | Production cannot re-enable metrics through build options    | production fail-closed override-negative test    | PASS controlled |
| CTRL-87 | Disabled and enabled responses are no-store and redacted     | header/404/envelope/snapshot-negative assertions | PASS controlled |
| CTRL-88 | Health endpoint and prior safety boundaries remain unchanged | health regression and full controlled gate suite | PASS controlled |

## Round 41 — PLAT-S21 registered before BUILD

- S20 foi fechado com `CONTROLLED_MVP_READY`; a próxima lacuna segura é a
  exposição pública de `/health/metrics` fora de fixtures.
- Registrado `PLAT-S21-001_CONTROLLED_METRICS_EXPOSURE_BOUNDARY` no PRD, SPEC,
  ExecPlan, backlogs, runtime state e execution log antes do código.
- Scope congelado: rota somente em `NODE_ENV=test/development`, opção apenas
  para desabilitar em ambientes controlados, 404 genérico sem snapshot fora
  deles e `Cache-Control: no-store`.
- Gate atual: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo é escrever RED.
- Proibições preservadas: auth/IdP operacional, edge/allowlist de rede,
  Prometheus/OTel, broker, HA, provider, canal, RAG, dado real e side effect.

## Round 42 — PLAT-S21 RED observado

- Testes focados foram escritos antes do código para disable controlled-only,
  production/staging/unknown fail-closed e `Cache-Control: no-store`.
- RED reproduzido: 3 assertions falharam como esperado; a implementação deve
  permanecer limitada ao endpoint de métricas, sem alterar `/health`, collector,
  identidade, persistência ou efeitos externos.

## Round 43 — PLAT-S21 implementation and controlled closure

- GREEN implementou o gate `NODE_ENV=test/development`, a opção
  `requestMetricsEnabled` somente para desabilitação controlada, 404 genérico
  sem snapshot fora desses ambientes e `Cache-Control: no-store` em ambas as
  respostas.
- Production, staging, QA e ambientes desconhecidos não podem reabilitar a
  rota por opção de build; `/health`, collector e Secretary permaneceram
  inalterados.
- Gates finais: `npm run verify` PASS; 99 arquivos/337 testes pass/18 skips;
  coverage 85,33% statements / 80,74% branches / 85,07% functions /
  86,25% lines; readiness 4/4; E2E 3/3; PostgreSQL 51 pass/18 skips;
  audit 0, format e `git diff --check` PASS.
- Evidência: `docs/04_audit/0511_plat_s21_controlled_metrics_exposure_boundary_evidence.md`;
  `PLAT-S21-001` = `COMPLETED_CONTROLLED`.
- `CONTROLLED_MVP_READY` permanece; produção real segue `NO-GO`/
  `WAITING_HUMAN_APPROVAL`. O próximo lane exige novo SPEC controlado.

## Quality bar v19 — PLAT-S22 controlled correlation response boundary

| ID      | Criterion                                                        | Required evidence                                   | Current state   |
| ------- | ---------------------------------------------------------------- | --------------------------------------------------- | --------------- |
| CTRL-89 | Envelope correlation ID is copied exactly to the response header | API/header parity tests                             | PASS controlled |
| CTRL-90 | External correlation headers are never reflected or trusted      | spoofing-negative request test                      | PASS controlled |
| CTRL-91 | Approved CORS exposes only the correlation response header       | CORS expose-header assertion                        | PASS controlled |
| CTRL-92 | Preflight/non-envelope and prior safety boundaries stay intact   | preflight regression and full controlled gate suite | PASS controlled |

## Round 44 — PLAT-S22 registered before BUILD

- S21 foi fechado com `CONTROLLED_MVP_READY`; a próxima lacuna segura é
  transportar o correlation ID já presente nos envelopes para um header de
  resposta, sem obrigar clientes a decodificar cada body.
- Registrado `PLAT-S22-001_CONTROLLED_CORRELATION_RESPONSE_BOUNDARY` no PRD,
  SPEC, ExecPlan, backlogs, runtime state e execution log antes do código.
- Scope congelado: header `X-Correlation-Id` derivado exclusivamente de
  `meta.correlationId`, exposição somente em CORS aprovado e ausência segura
  em preflight/non-envelope; nenhuma entrada externa é autoridade.
- Gate atual: `SPEC_APPROVED_CONTROLLED_BUILD`; próximo passo é escrever RED.
- Proibições preservadas: tracing distribuído/OTel, broker, logging de payload,
  auth/IdP, provider/canal, RAG, dado real, deploy e side effect.

## Round 45 — PLAT-S22 RED observado

- Testes focados foram escritos antes do código para paridade envelope/header,
  CORS aprovado, preflight/non-envelope, não-reflexão de header externo e erro
  do boundary.
- RED reproduzido: 4 assertions falharam como esperado; a implementação deve
  permanecer restrita ao pre-serialization e à exposição CORS do header, sem
  alterar envelope, identidade, tenant ou efeitos externos.

## Round 46 — PLAT-S22 implementation and controlled closure

- GREEN implementou `readResponseCorrelationId` com `CorrelationIdSchema`,
  hook `preSerialization` não-mutante e `Access-Control-Expose-Headers`
  somente após allowlist exact-origin.
- A suíte focada passou 6/6; o header coincide com o envelope, não reflete
  entrada, erros do boundary são correlacionáveis e preflight/non-envelope não
  inventam header.
- Gates finais: `npm run verify` PASS; 100 arquivos/343 testes pass/18 skips;
  coverage 85,37% statements / 80,81% branches / 85,10% functions /
  86,29% lines; readiness 4/4; E2E 3/3; PostgreSQL 51 pass/18 skips;
  audit 0, format e `git diff --check` PASS.
- Evidência: `docs/04_audit/0512_plat_s22_controlled_correlation_response_boundary_evidence.md`;
  `PLAT-S22-001` = `COMPLETED_CONTROLLED`.
- `CONTROLLED_MVP_READY` permanece; produção real segue `NO-GO`/
  `WAITING_HUMAN_APPROVAL`. O próximo lane exige novo SPEC controlado.
