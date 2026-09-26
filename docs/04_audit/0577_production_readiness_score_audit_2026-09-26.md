# AUD-0577 — auditoria de prontidão com nota por item — 26/09/2026

- Status: `COMPLETED_DOCUMENTARY`. Auditoria read-only; nenhum arquivo de
  código foi alterado. Produção `NO_GO`.
- Nota geral ponderada: **67/100** (arquitetura, código, segurança e testes
  com peso 2; demais itens com peso 1). Era 68 antes da inclusão do item 17.
- Desdobramento: plano executivo [0354](../03_build/0354_production_executive_plan_2026-09-26.md),
  roadmap [0355](../03_build/0355_production_roadmap_2026-09-26.md) e
  backlog [0356](../03_build/0356_production_backlog_2026-09-26.md).
- Relação com [AUD-0576](0576_repository_score_audit_2026-09-26.md): mesma
  data e conclusão próxima (69/100). Esta rodada acrescenta execução completa
  da suíte com cobertura e a divergência entre cobertura medida e certificada.

## Comandos executados

| Comando                                              | Resultado                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `npm run typecheck`                                  | exit 0                                                                  |
| `npm run lint`                                       | exit 0                                                                  |
| `npx prettier --check .`                             | exit 0                                                                  |
| `npm run test:coverage` (sem PostgreSQL, Node 24.20) | exit 0; 304 arquivos PASS / 20 skipped; 2 149 testes PASS / 146 skipped |
| Cobertura statements / branches / functions / lines  | 90,88 / 85,88 / 92,97 / 91,83                                           |
| `npm audit --audit-level=high`                       | 0 vulnerabilidades                                                      |
| `npm run docs:check-links`                           | `DOC_LINKS_OK`, `EVIDENCE_HYGIENE_OK`                                   |
| `node scripts/phase10-verify.mjs`                    | **exit 1, 11 falhas** (métricas e hash de cobertura divergentes)        |

Observação de ambiente: `.nvmrc` exige Node 22.23.2; o shell da auditoria
usou Node 24.20.0 e não havia `TEST_DATABASE_URL`. As duas condições podem
explicar parte da divergência de cobertura, mas isso não foi provado.

## Notas por item

| #   | Item                             | Nota | Evidência principal                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Arquitetura e modularidade       | 78   | Dependências na direção correta (`contracts`/`shared` sem dependência interna; `harness` só de contracts/orchestrator; nenhum pacote importa `apps/`). Hotspots: `apps/api/src/server.ts` 5 857 linhas, `packages/agent-runtime/src/runtime.ts` 2 603.                                                                                                                                                         |
| 2   | Qualidade de código e tipagem    | 86   | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`; zero `any`, `@ts-ignore`, `eslint-disable`, TODO/FIXME em produção. ESLint só `recommended`, sem regras type-aware.                                                                                                                                                                                                                        |
| 3   | Testes                           | 82   | 93 mil linhas de teste para 83 mil de código; caos, carga, restore, evals, mutação e E2E. 38 skips condicionais a PostgreSQL; sem banco, 146 testes somem em silêncio no `npm test`.                                                                                                                                                                                                                           |
| 4   | Cobertura                        | 70   | Margem de branches 0,88 pp sobre o threshold 85. ~18,9 mil linhas (~23%) fora do denominador (`apps/web/src/**`, `*postgres*.ts`, repositórios de plataforma). Medido abaixo do ledger (92,6/87,71).                                                                                                                                                                                                           |
| 5   | Segurança da aplicação           | 85   | Rate limit fail-closed, `simulation` proibido em produção, replay de token distribuído, validação de schema antes de SQL dinâmico, queries parametrizadas, redação. Sem segredo real versionado.                                                                                                                                                                                                               |
| 6   | CI e supply chain                | 88   | 29 gates em `verify.yml`, actions fixadas por SHA, `persist-credentials: false`, Gitleaks, CodeQL, SBOM, licenças. Timeout de 180 min.                                                                                                                                                                                                                                                                         |
| 7   | Container e deploy               | 80   | Multi-stage, non-root, digest fixado, healthcheck. `nginx-unprivileged:1.27-alpine` sem digest; nome de imagem legado; `deploy/` só contém `nginx.web.conf` (sem IaC).                                                                                                                                                                                                                                         |
| 8   | Dependências                     | 84   | 0 vulnerabilidades; atualizações menores pendentes. `drizzle-orm`, `pino` e `dotenv` sem uso real (ver RA26-12/14).                                                                                                                                                                                                                                                                                            |
| 9   | Documentação técnica             | 58   | ADRs e arquitetura existem; README virou pilha de estados e declara as próprias seções Scope/Non-goals/Roadmap como históricas.                                                                                                                                                                                                                                                                                |
| 10  | Volume e higiene documental      | 35   | `docs/` com 3 560 arquivos, ~1 milhão de linhas e 54 MB (~12:1 sobre o código); `99_runtime_state.md` 3 764 linhas; `20_master_execution_log.md` 7 680; 242 arquivos vazios versionados.                                                                                                                                                                                                                       |
| 11  | Higiene do repositório           | 40   | 17 `state.json` de ~6 MB versionados em `.gauntlet*` (~100 MB); nove diretórios `.gauntlet-*` na raiz; `.git` com 64 MB.                                                                                                                                                                                                                                                                                       |
| 12  | Histórico git                    | 50   | 40 commits para 4 601 arquivos; commits em lote (`c57c330` 2 454 arquivos, `8b7cf88` 1 057, `c791ee4` 154). Commits RA25-07 já são pequenos e descritivos.                                                                                                                                                                                                                                                     |
| 13  | Reprodutibilidade e certificação | 45   | `phase10-verify` falha em execução fresca; ledger registra flake SIGTERM sob carga e dependência de "máquina ociosa"; toolchain local divergente; no momento da medição, `postgres-audit.ts` não estava rastreado (depois absorvido por `f9f84c9`).                                                                                                                                                            |
| 14  | Governança e processo            | 62   | Rastreabilidade excelente (task, SPEC, gate, hash), mas custo desproporcional: drift de `0190_spec_validation.md` derrubou C1L fora do escopo; várias rodadas documentais por mudança de código.                                                                                                                                                                                                               |
| 15  | Observabilidade                  | 75   | Logs estruturados, correlation ID, métricas HTTP/worker, gate de prova de SLO. Sem backend, dashboards ou alertas de produção. Gate de observabilidade não reexecutado nesta rodada.                                                                                                                                                                                                                           |
| 16  | Prontidão para produção          | 25   | Declarado `NO_GO`. Provider de modelo determinístico no worker; canal e RAG sem consumidor de runtime; web sem login de IdP (token de bootstrap injetado); sem IaC, LGPD operacional, on-call ou piloto.                                                                                                                                                                                                       |
| 17  | Isolamento do legado             | 30   | O produto legado (Esmeralda V2, `cvg-agent-secretary-v2`) continua misturado ao harness: `legacy/` só tem um README; `workflows`, `tools` e `memory` sem consumidor; jornadas tutor/pet/consulta em `persistence`, API e web; `secretary-preset`; grants da secretária; docs de produto e constituição ainda falam em "construir a Esmeralda V2". Item acrescentado na revisão de 26/09 por pedido do usuário. |

## Lacunas bloqueantes para produção

1. **Integrações reais inexistentes no caminho de runtime.** O worker compõe
   `DeterministicModelProvider` (`apps/worker/src/kernel-composition.ts`);
   os providers `openai-compatible`/`ollama` e os adapters Evolution/Chatwoot
   não são instanciados fora de teste; `packages/rag` só é importado por teste.
2. **Identidade de operador sem IdP.** A API valida tokens HMAC por keyring
   (`apps/api/src/operator-identity.ts`) e a web depende de
   `__CVG_OPERATOR_BOOTSTRAP_TOKEN__` (`apps/web/src/auth/session.ts`); não há
   OIDC, MFA nem ciclo de vida de usuários.
3. **Flags de produção sem efeito.** `ENABLE_REAL_*` em
   `packages/shared/src/env.ts` sem consumidor de boot (RA26-08); o segredo do
   provider se chama `OPENAI_API_KEY` mesmo sendo o gateway neutro.
4. **Infraestrutura e operação ausentes.** Sem IaC, CD com promoção de digest,
   backend de telemetria, alertas, runbooks de produção (só dois de
   homologação) ou drill de restore em ambiente real.
5. **Privacidade.** A plataforma guarda remetente e texto de mensagens, e
   o texto livre pode conter dado pessoal sensível (LGPD art. 11). Não há
   inventário de dados, modelo de RIPD para produtos consumidores, fluxo de
   direitos do titular nem política de retenção aplicada (POL-EVIDENCE-001
   segue pendente de aplicação).
6. **Resíduo do legado.** Código, dados e documentos da Esmeralda V2 seguem
   fora de `legacy/`; ver item 17 e a frente FL do plano 0354.
7. **Certificação não reproduzível** e margem de cobertura mínima.
8. **Governança bloqueante:** M07-S1 `FAIL / OPEN`, C1M incompleto, revisão
   humana das SPECs `NOT_RUN`.

## Pontos fortes a preservar

- Fronteira fail-closed em identidade, rate limit, approval e redação.
- Contratos neutros com direção de dependência limpa.
- Barra de CI ampla, com gates de caos, carga, restore e evals.
- Rastreabilidade ponta a ponta entre decisão, SPEC, commit e evidência.
