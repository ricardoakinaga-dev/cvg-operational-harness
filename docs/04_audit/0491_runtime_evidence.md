# 0491 — Runtime Evidence

## Status

```txt
STATUS: CONTROLLED_CONSTRUCTION_ACTIVE
DATA: 2026-04-30T00:26:00-03:00
ESCOPO: runtime MVP enterprise controlado, sem automacao real sensivel
```

## Evidencia executada

| Gate                       | Comando                                                                                         | Resultado                                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Format                     | `npm run format:check`                                                                          | PASS — all matched files use Prettier style                                                                          |
| Typecheck                  | `npm run typecheck`                                                                             | PASS                                                                                                                 |
| Lint                       | `npm run lint`                                                                                  | PASS                                                                                                                 |
| Unit/integration/docs      | `npm test`                                                                                      | PASS — 41 test files, 97 passed, 2 skipped                                                                           |
| Construction readiness     | `npm run readiness`                                                                             | PASS — controlled construction score 100/100                                                                         |
| E2E critico                | `npm run test:e2e`                                                                              | PASS — inbound, approval, task e audit                                                                               |
| Coverage                   | `npm run test:coverage`                                                                         | PASS — statements 85.60%, branches 84.22%, functions 84.15%, lines 87.31%                                            |
| Security audit             | `npm run audit:security`                                                                        | PASS — 0 vulnerabilities                                                                                             |
| Verify integrado           | `npm run verify`                                                                                | PASS — inclui format, typecheck, lint, tests, coverage e audit                                                       |
| PostgreSQL smoke isolado   | `npm run test:postgres` sem `TEST_DATABASE_URL`                                                 | PASS — 2 files, 3 passed, 2 conditional skips                                                                        |
| PostgreSQL real efemero    | `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/cvg_test npm run test:postgres` | PASS — Docker `postgres:16-alpine`, 2 files, 5 passed, 0 skips                                                       |
| HTTP smoke                 | `PORT=3100 npx tsx apps/api/src/main.ts` + `/health` + webhook                                  | PASS — API respondeu `success=true` e criou conversa/sessao/mensagem                                                 |
| Release candidate boundary | `npx vitest run tests/release-candidate-boundary.test.js`                                       | PASS — boundary CC-S12 bloqueia piloto real, producao, canais reais, RAG real, export externo e automacoes sensiveis |

## Evidencia funcional coberta

- API Fastify inicia contrato de health e endpoints `/v1`.
- `buildServerFromEnv` ativa PostgreSQL somente com `API_PERSISTENCE_MODE=postgres` e `DATABASE_URL`, falhando fechado quando a URL nao existe.
- Webhook cria conversa, sessao e mensagem com idempotencia por `channel + externalMessageId`.
- PostgreSQL protege idempotencia de inbound com chave transacional `inbound:<channel>:<externalMessageId>` em `idempotency`.
- Mesmo `externalMessageId` em canal diferente permanece permitido por contrato controlado.
- Migration `packages/persistence/migrations/0000_initial.sql` foi aplicada em schema PostgreSQL isolado.
- Repository PostgreSQL controlado persistiu conversa, sessao, mensagem e audit event com `correlationId`.
- API runtime executou inbound, timeline, approval, decision, task e audit contra PostgreSQL efemero.
- API runtime executou inbound duplicado no mesmo canal com `accepted=false` contra PostgreSQL efemero.
- API runtime expõe listagem paginada de conversas em memoria e PostgreSQL com `items` e `pageInfo`.
- Timeline retorna historico persistido em memoria.
- Tasks internas sao criadas com chave de idempotencia.
- Tasks internas podem transicionar status por API/console com auditoria e `effect: internal_task_state_only`.
- Approval request nasce `pending`; decisao por `Operator` e bloqueada; decisao por `Approver` e permitida.
- Decisao `assumed` por `Supervisor` registra handoff controlado com `correlationId` e `effect: handoff_only`.
- Auditoria registra eventos de integracao, task e approval por sessao.
- Logs estruturados cobrem inbound, approval, task e audit com `correlationId`.
- Smoke HTTP real confirmou `success=true` em `/health` e webhook WhatsApp.
- Worker processa agent turn conservador com policy aplicada.
- Web console renderiza conversas, aprovacoes, tarefas e auditoria via API client, com loading, empty e error states.
- Web console removeu IDs de bootstrap visual e carrega timeline/audit a partir da conversa selecionada na listagem da API.
- Web console permite aprovar, rejeitar e assumir handoff apenas via API de approval decision, sem chamar integracao externa.
- Web console permite iniciar, concluir e cancelar tarefas internas apenas via API de task lifecycle, sem chamar integracao externa.
- Web console revisa audit evidence com faixa de pagina e navegacao anterior/proxima.
- Export de audit evidence permanece pedido de aprovacao humana interna, sem `/export` externo.
- RAG institucional sem fonte aprovada retorna handoff.
- Triagem bloqueia diagnostico, prescricao, remedio e tratamento.
- Agenda permanece `draft-only`; confirmacao/cancelamento real continuam bloqueados.
- Release candidate boundary em `docs/08_runtime/release_candidate_boundary.json` permite apenas auditoria controlada e mantem `realPilotAllowed=false`, `productionAllowed=false`, `externalChannelsAllowed=false`, `realRagAllowed=false`, `externalAuditExportAllowed=false` e `sensitiveAutomationAllowed=false`.
- Runbook, rollback, incident, staging checklist, data governance signoff, pilot report template e remediation loop foram registrados para CC-S12 sem aprovar dados reais ou canais reais.

## Resultado de hardening

- Dependencias LangChain/LangGraph/Qdrant nao utilizadas foram removidas para eliminar vulnerabilidades transitivas moderadas.
- `npm audit --audit-level=high` passou com 0 vulnerabilidades reportadas.
- Coverage minima global de 80% foi configurada no `vitest.config.ts`.
- Typecheck passou a usar `tsconfig.typecheck.json` com `noEmit`, evitando artefatos gerados no repositorio.
- CI reproduz `npm ci`, `npm run verify` e `npm run test:e2e` em `.github/workflows/verify.yml`.
- `npm run verify` agora executa `npm run format:check` antes de typecheck/lint/testes.
- CI passou a subir `postgres:16-alpine` e executar `npm run test:postgres` com `TEST_DATABASE_URL`.
- `npm run test:postgres` cobre persistence smoke e API PostgreSQL mode.
- Migration inicial PostgreSQL deixou de ser placeholder e passou a criar as tabelas operacionais principais.
- Traceability matrix agora e executavel: `tests/docs-readiness.test.js` valida arquivos de teste listados em `required_tests`.
- Gate `npm run readiness` bloqueia regressao abaixo de 95%.

## Limite de rollout

Este baseline esta aprovado para release candidate controlado com dados ficticios, anonimizados ou explicitamente autorizados.
Piloto real permanece bloqueado ate signoff humano de retencao, RBAC real, fonte RAG, canal real e politica de acoes sensiveis.
Nao esta aprovado para:

- confirmar, cancelar ou reagendar consultas reais automaticamente;
- responder RAG com fonte nao versionada/aprovada;
- operar com dados reais sem politica de retencao assinada;
- executar acoes clinicas, financeiras ou de prontuario definitivo;
- dispensar aprovacao humana em acoes sensiveis.

## Nota AUD19-012 — 2026-09-20 (aditiva; original preservado)

O "release candidate controlado com dados ficticios, anonimizados ou
explicitamente autorizados" acima é lido, por supersessão explícita, como
fixtures sintéticas aprovadas em gate. Dados reais — inclusive anonimizados —
são proibidos pela regra do repositório (`AGENTS.md`).
