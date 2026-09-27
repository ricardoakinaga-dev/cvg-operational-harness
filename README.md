# CVG Operational Harness

Plataforma de execução governada para agentes operacionais. O repositório contém runtime single-pass e iterativo, contratos públicos, policy, approvals, handoff, auditoria, persistência e console. A Esmeralda V2 é legado em isolamento; regras de produto pertencem aos consumidores da plataforma.

## Estado atual — 27/09/2026

- [Auditoria AUD-0578](docs/04_audit/0578_program_comprehensive_audit_2026-09-26.md): nota geral **67/100**, prontidão de produção **25/100**. Produção **`NO_GO`**; somente dados sintéticos e efeitos controlados.
- [Roadmap](docs/03_build/0358_aud0578_execution_roadmap.md), [índice de execução](docs/03_build/0359_aud0578_execution_backlog.md) e [backlog canônico](docs/03_build/0356_production_backlog_2026-09-26.md) organizam a remediação.
- Candidato R1 `5ee02e8`, digest `b1189914d12910b3012a2d1ac000ac138437ba046ef195b93fd9d17f12b37582`: certificação local 16/16 PASS, verificador 37 hashes PASS, decisão mecânica `CONDITIONAL_GO / AAA_CONTROLLED`. [Evidência](certification/phase10-result.json). O Verify remoto desse SHA falhou ao ler as métricas unitárias de texto no certificado; a [SPEC 0147](docs/02_spec/0147_certification_vitest_json_metrics.md) corrige essa leitura no candidato R2, ainda sem certificação integrada.
- Para o primeiro piloto, D-03 = **A, núcleo governado completo**. O primeiro consumidor continua indefinido, conforme [discovery PR-101](docs/00_discovery/0019_platform_first_consumer_pilot.md). Nenhum dado real, provider, canal ou deploy irrestrito foi autorizado.

## Navegação

- [Estado operacional](docs/99_runtime_state.md), [log de execução](docs/20_master_execution_log.md), [backlog mestre](docs/30_backlog_master.md) e [coordenação entre agentes](docs/08_runtime/agent_coordination.md).
- [Visão de arquitetura](docs/architecture/HARNESS_OVERVIEW.md), [API pública](docs/architecture/PUBLIC_API.md), [instruções para agentes](docs/07_agents/AGENTS.md) e [origem brownfield](docs/refoundation/BROWNFIELD_ORIGIN.md).
- [Plano executivo de produção](docs/03_build/0354_production_executive_plan_2026-09-26.md) e [pacote de decisões](docs/03_build/0357_production_decision_packet_2026-09-26.md).

## Verificação local

Use Node 22 e dados sintéticos. A suíte PostgreSQL e a certificação exigem uma instância descartável de teste configurada por `TEST_DATABASE_URL` e `DATABASE_URL`.

```bash
npm ci
npm run build
npm test
npm run docs:check-links
npm run certify
npm run certification:verify
```

O pipeline do repositório é `DISCOVERY → PRD → SPEC → BUILD → AUDIT`. Ações sensíveis exigem approval ou handoff; nenhuma consulta real é confirmada, cancelada ou reagendada automaticamente.

O README anterior foi preservado [byte a byte](docs/08_runtime/archive/2026-09-27-pr005-readme-source.txt), SHA-256 `06305cebe74116fa49802581b34b90b1e69e5d4e7e8c1cb182d65124f463b18c`.
