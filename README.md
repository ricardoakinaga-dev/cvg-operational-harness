# CVG Operational Harness

CVG Operational Harness is a governed runtime foundation for reusable
operational AI agents across the CVG ecosystem. The Esmeralda V2 secretary is
the legacy product being isolated under `legacy/`.

## Estado atual — 2026-10-03 — isolamento do consumidor

A direção vigente é a [ADR-010](docs/architecture/adrs/ADR-010-harness-product-isolation.md):
este repositório mantém o Operational Harness; o Assistente de Plantão é um
consumidor com configuração, dados, testes, deploy e backlog próprios.
A implementação integral do [roadmap 0369](docs/03_build/0369_harness_product_isolation_roadmap.md)
e [backlog 0370](docs/03_build/0370_harness_product_isolation_backlog.md) está em andamento.
O núcleo deve compilar e executar sem o consumidor; liberação e piloto são
gates separados. Decisões D1–D4 e barra 0368 continuam do assistente.

Ledgers e índice modificados por outras rodadas permanecem preservados por
coordenação; o claim HARNESS-ISO-EXEC identifica os caminhos e recursos próprios.
Nenhuma nota ou certificação histórica libera produção.

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
