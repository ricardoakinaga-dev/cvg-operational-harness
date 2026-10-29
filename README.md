# CVG Operational Harness

CVG Operational Harness is a governed runtime foundation for reusable
operational AI agents across the CVG ecosystem. The Esmeralda V2 secretary is
the legacy product being isolated under `legacy/`.

## Estado atual — 28/10/2026 — harness e consumidor

Em 28/10/2026 a `main` está em `8429019b` (PR #29, OIDC do console, fatia B1)
e a produção continua `NO_GO`. A [auditoria 0625](docs/04_audit/0625_repository_score_audit_2026-10-28.md)
deu média 72 e prontidão 45 e abriu as frentes de remediação F01–F20. As SPECs
0267, 0268, 0270, 0272 (SHA final `e5c1c732`) e 0273 estão implementadas e revisadas em
branches locais, a 0269 também. A imagem com base Debian 13 está com o Codex (API,
worker e TLS passam; ainda não qualificada). A publicação é a da onda: primeiro o PR da
imagem, depois um PR único da onda AUD0625.
Donos, estados e os recibos das decisões do Ricardo estão no
[estado de execução](docs/99_runtime_state.md), no
[log](docs/20_master_execution_log.md) e no [backlog](docs/30_backlog_master.md).
O image-scan obrigatório reprova PRs até a troca da base para Debian 13.

### Direção vigente (17/10/2026)

A direção vigente é a [ADR-010](docs/architecture/adrs/ADR-010-harness-product-isolation.md):
este repositório mantém o Operational Harness; o Assistente de Plantão é um
consumidor com configuração, dados, testes, deploy e backlog próprios.
A implementação integral do [roadmap 0369](docs/03_build/0369_harness_product_isolation_roadmap.md)
e [backlog 0370](docs/03_build/0370_harness_product_isolation_backlog.md) está em andamento.
O núcleo deve compilar e executar sem o consumidor; liberação e piloto são
gates separados. Decisões D1–D4 e barra 0368 continuam do assistente.

O [produto](products/shift-assistant/README.md) mantém suas
[docs e backlog canônico](products/shift-assistant/docs/README.md). Para o harness,
a [barra 0373](docs/03_build/0373_barra_producao_harness.md) e o
[plano 0374](docs/03_build/0374_plano_producao_harness.md) governam a prontidão;
a barra 0368 não certifica o núcleo.

A [SPEC0228 foi concluída na candidata local `f11f762f`](docs/04_audit/evidence/B6-0228-BUILD-20261017/REPORT.md):
retira falsos PASS da fronteira, que permanece INCOMPLETE. Esse código não foi
integrado automaticamente ao checkout principal. A prova positiva de isolamento,
o CI remoto e o aceite de produção continuam nas respectivas trilhas.

Estado vigente nos [ledgers](docs/99_runtime_state.md) e no
[índice operacional](docs/99_operational_index.md); mudanças concorrentes e
evidências históricas permanecem preservadas. Nenhuma certificação local libera produção.

## Histórico — 2026-09-27 — PROD-20260926

- O programa está `IN_PROGRESS`; produção permanece `NO_GO`. O
  [plano executivo](docs/03_build/0354_production_executive_plan_2026-09-26.md)
  define 13 condições de GO, o
  [roadmap](docs/03_build/0355_production_roadmap_2026-09-26.md) ordena as fases
  e o [backlog](docs/03_build/0356_production_backlog_2026-09-26.md) acompanha
  as tasks. Nenhuma nota ou certificação histórica libera produção.
- A [AUD-0579](docs/04_audit/0579_current_candidate_deep_audit_2026-09-27.md)
  encontrou `skip:governance` e `certification:verify` em falha no candidato
  local, além da sessão confiável indisponível no entrypoint publicado. Verify
  e Security remotos passaram apenas no SHA anterior `8ee6fa2`.
- PR-005 rotacionou os três ledgers, preservando o histórico integral e os
  hashes originais em `docs/08_runtime/archive/`. Consulte o
  [estado operacional](docs/99_runtime_state.md), o
  [log](docs/20_master_execution_log.md), o
  [backlog mestre](docs/30_backlog_master.md) e a
  [coordenação entre agentes](docs/08_runtime/agent_coordination.md).
- Continuam vedados dado real, provider ou canal externo, ação sensível
  automática, deploy e liberação irrestrita sem os gates e decisões humanas
  documentados.

## Purpose and architecture

The harness provides neutral contracts, governed runtime sequencing and ports
for models, tools, policy, approvals, audit, telemetry, state, knowledge and
channels. Products provide profiles and adapters. Policy precedes approval,
and approval precedes governed effects.

See the [architecture overview](docs/architecture/HARNESS_OVERVIEW.md),
[public API](docs/architecture/PUBLIC_API.md),
[documentation index](docs/README.md) and
[brownfield origin](docs/refoundation/BROWNFIELD_ORIGIN.md).

## Histórico

The [AUD-0578](docs/04_audit/0578_program_comprehensive_audit_2026-09-26.md),
[AUD-0576](docs/04_audit/0576_repository_score_audit_2026-09-26.md) and the
[archived execution log](docs/08_runtime/archive/prod20260926_execution_log_history.md)
preserve prior assessments, decisions and command evidence.
