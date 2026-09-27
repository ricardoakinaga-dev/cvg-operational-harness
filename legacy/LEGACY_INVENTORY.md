# Inventário do legado — Esmeralda V2 (`cvg-agent-secretary-v2`)

- Task: PR-L01 do backlog
  [0356](../docs/03_build/0356_production_backlog_2026-09-26.md), frente FL.
- Decisões: DL-01 a DL-04 em
  [0357](../docs/03_build/0357_production_decision_packet_2026-09-26.md).
- Data da medição: 26/09/2026, sobre `001fc6f`.
- Regra: o legado pode depender do harness; o harness nunca depende do
  legado. Este arquivo é atualizado a cada task FL concluída.

## Classes

| Classe           | Significado                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `HARNESS`        | Pertence ao harness; fica onde está                                                          |
| `HARNESS_REVIEW` | Pertence ao harness, mas usa vocabulário do legado (fixture, exemplo, texto); neutralizar    |
| `LEGACY_ISOLATE` | Específico do legado e vital hoje (testes, E2E, certificação dependem); mover para `legacy/` |
| `LEGACY_DELETE`  | Específico do legado e sem consumidor; apagar                                                |
| `HISTORY`        | Histórico vinculado por hash ou ledger; fica no lugar e é identificado                       |

## Método

Varredura dos termos `secretary|esmeralda|tutor|pet|patient|appointment|veterin|journey`
em `apps/`, `packages/`, `scripts/`, `tests/` e `examples/` (arquivos `.ts`,
`.tsx`, `.mjs`, `.sql`, `.json`, sem artefatos compilados): **170 arquivos**
com ocorrência. Cada ocorrência foi agrupada por domínio abaixo.

## Código

### `LEGACY_DELETE` — pacotes sem consumidor (PR-L02, removidos em 26/09/2026)

| Item                 | Linhas de produção | Consumidores | Situação                                                          |
| -------------------- | ------------------ | ------------ | ----------------------------------------------------------------- |
| `packages/workflows` | 266                | nenhum       | Workflows da secretária (intenção, triagem, agendamento, handoff) |
| `packages/tools`     | 395                | nenhum       | Tools de jornada (buscar tutor, criar draft de pet/consulta)      |
| `packages/memory`    | 13                 | nenhum       | Fatos de memória sem uso                                          |

### `LEGACY_ISOLATE` — domínio de jornadas tutor → pet → consulta (PR-L04)

| Onde                                                                                                                                                                                 | O quê                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `packages/persistence/src/journeys.ts` (998)                                                                                                                                         | Repositório em memória das jornadas                                                              |
| `packages/persistence/src/journeys-postgres.ts` (1 148)                                                                                                                              | Repositório PostgreSQL das jornadas                                                              |
| `packages/persistence/src/db.ts`, `schema.ts`, `index.ts`                                                                                                                            | Coleções e exports de `ownerDrafts`/`patientDrafts`/`appointmentDrafts`                          |
| `packages/persistence/src/restore.ts`, `tenant-schema.ts`                                                                                                                            | Tabelas de jornada no restore e no inventário de tenant                                          |
| `packages/persistence/migrations/0014_journeys.sql`                                                                                                                                  | Schema das jornadas — fica na cadeia de migrations, marcado `HISTORY`; tabelas só saem em PR-L11 |
| `apps/api/src/server.ts` (88 ocorrências)                                                                                                                                            | Rotas `/v1/journeys/**`                                                                          |
| `apps/api/src/tenant-preflight.ts`                                                                                                                                                   | Constraints das tabelas `journey_*` no preflight                                                 |
| `apps/web/src/features/journeys/`, `apps/web/src/api/client.ts`, `App.tsx`                                                                                                           | Tela e cliente de jornadas                                                                       |
| Testes: `journeys*.test.ts`, `journey-*.test.ts`, `journey-routes-coverage.test.ts`, `journeys-api-postgres.test.ts`, `journeys-identity-race.test.tsx`, `restore-integrity.test.ts` | Cobertura do domínio                                                                             |

### `LEGACY_ISOLATE` — perfil da secretária (PR-L05, isolado em 26/09/2026)

| Onde                                                         | O quê                                                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| `packages/platform/src/secretary-preset.ts` (+2 testes)      | Preset de agente da secretária                                    |
| `packages/policy-engine/src/capabilities.ts`, `grants.ts`    | Catálogo `appointment.*`, `patient.*` e grants da secretária      |
| `packages/agent-core/src/commands/create-handoff-summary.ts` | Resumo de handoff com campos de tutor e pet                       |
| `apps/api/src/__tests__/secretary-bootstrap.test.ts`         | Bootstrap da secretária na API                                    |
| `apps/worker/src/kernel-composition.ts`                      | Capacidade sintética de rascunho de consulta no kernel controlado |

### `LEGACY_ISOLATE` — evals (PR-L06, isolado em 27/09/2026)

| Onde                                        | O quê                                             |
| ------------------------------------------- | ------------------------------------------------- |
| `packages/agent-evals/src/datasets/core.ts` | Dataset de cenários da secretária                 |
| `packages/agent-evals/src/agent.ts`         | Agente de avaliação com vocabulário da secretária |

### `HARNESS_REVIEW` — guardas e fixtures do harness com vocabulário do legado

Pertencem ao harness porque implementam os não-objetivos permanentes (nenhuma
alteração de agendamento sem approval, nenhuma orientação clínica), mas o
texto é específico do hospital veterinário. Neutralizar junto com PR-L05:

| Onde                                                                                                                    | O quê                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/platform/src/critical-safety-preflight.ts`                                                                    | Regras `real-appointment-*` (guarda genérica de agendamento; manter, renomear)                    |
| `packages/platform/src/output-policy.ts`                                                                                | Padrões de agendamento e mensagem "médico-veterinário" (texto vai para o perfil)                  |
| `packages/shared/src/audit-governance.ts`                                                                               | Chave `patientname` na redação (manter como padrão de PII, generalizar)                           |
| Testes de `agent-runtime`, `approval-engine`, `model-gateway`, `chaos`, `observability`, `platform`, `policy`, `shared` | Fixtures usam `appointment.*` como capacidade de exemplo; trocar quando o catálogo neutro existir |
| `tests/e2e/*`, `tests/phase4a/*`, `examples/phase4a/service-desk.ts`                                                    | Poucas ocorrências de vocabulário em cenários sintéticos                                          |
| `scripts/phase4a-certify.mjs`, `scripts/rem21-010-postgres-proof.ts`, `scripts/skip-catalog.json`                       | Nomes de teste de jornada citados; atualizar junto com PR-L04                                     |

### `HARNESS_REVIEW` — achados da fatia 1 de SPEC-LEGACY-002 (26/09/2026)

A varredura original não incluía os termos `scheduling`, `find_available_slots`
e `confirm_appointment`. Com eles aparecem:

| Onde                                                       | O quê                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------ | ------------------ | ----------------------- |
| `packages/platform/src/policy-evaluator.ts`                | Regex `confirm_appointment                                         | cancel_appointment | reschedule_appointment` |
| `packages/platform/src/test-lab.ts`                        | Ação `confirm_appointment` no Test Lab                             |
| `packages/platform/src/contracts.ts` (`AgentConfigSchema`) | Flags `realPayments` e `realMedicalRecords`                        |
| `apps/web/src/features/platform/draft-helpers.ts`          | Plugin `scheduling.controlled` e tool `find_available_slots` fixos |

### `HARNESS` — confirmados neutros

`packages/contracts`, `packages/orchestrator`, `packages/harness` (teste de
arquitetura já proíbe `secretary`), `apps/worker/src/operational-harness-worker.ts`
(composição neutra declarada), `packages/conversation`, `packages/rag`,
`packages/channel-gateway`, `packages/adapters`, `packages/observability`
(produção), `packages/approval-engine` (produção).

## Documentação

| Classe           | Itens                                                                                                                                                                                    | Task   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `LEGACY_ISOLATE` | `docs/00_discovery/0000–0009`, `docs/01_prd/0010–0020`, `docs/01_prd/aaa_decision_brief.md`, `docs/blueprint/`, `docs/CODEX_MASTER_INSTRUCTIONS.md`                                      | PR-L08 |
| `LEGACY_ISOLATE` | Constituição `docs/07_agents/AGENTS.md` ("construir a Esmeralda V2") e `AGENTS.md` da raiz (título `cvg-agent-secretary-v2`); a versão antiga vai para `legacy/docs`                     | PR-L09 |
| `HARNESS_REVIEW` | `docs/00_discovery/0090_discovery_validation.md`, `docs/01_prd/0090_prd_validation.md` e `docs/01_prd/0013_requisitos_funcionais.md` (lidos por `tests/docs-readiness.test.js`)          | PR-L08 |
| `HISTORY`        | `docs/04_audit/**` (741 arquivos citam a secretária; evidências com hash), ledgers mestres, `docs/phase*`, `docs/harness-audit`, `docs/refoundation`, `docs/*PRODUCAO*.md`, `.gauntlet*` | —      |

## Configuração e nomes

| Onde                                              | Resíduo                                                                                 | Task   |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- | ------ |
| `Dockerfile`                                      | Tag `cvg-agent-secretary:local`                                                         | PR-L10 |
| `.env.example`                                    | Banco `cvg_agent_secretary_v2`                                                          | PR-L10 |
| `packages/persistence/src/postgres-migrations.ts` | Advisory lock `cvg-agent-secretary:migrations` (mudar só com janela de compatibilidade) | PR-L10 |

## Andamento

| Task                    | Estado      | Evidência                                                                                                                  |
| ----------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| PR-L01                  | `COMPLETED` | Este inventário                                                                                                            |
| PR-L02                  | `COMPLETED` | `workflows`, `tools` e `memory` removidos; [SPEC-LEGACY-001](../docs/02_spec/0135_legacy_dead_packages_and_boundary.md)    |
| PR-L03                  | `COMPLETED` | `legacy/README.md`, `legacy/packages/`, `tests/architecture/legacy-boundary.test.ts`                                       |
| PR-L05                  | `COMPLETED` | `legacy/packages/secretary-profile`; [SPEC-LEGACY-002](../docs/02_spec/0136_legacy_secretary_profile_isolation.md)         |
| PR-L06                  | `COMPLETED` | `legacy/packages/secretary-profile/src/evals`; [SPEC-LEGACY-003](../docs/02_spec/0140_legacy_secretary_evals_isolation.md) |
| PR-L04, PR-L07 a PR-L12 | `PROPOSED`  | —                                                                                                                          |
