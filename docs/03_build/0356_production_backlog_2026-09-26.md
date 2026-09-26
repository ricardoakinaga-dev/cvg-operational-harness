# Backlog — programa PROD-20260926 — harness em produção controlada

- Status: PR-001, PR-002, PR-L01, PR-L02 e PR-L03 `COMPLETED` e PR-003
  `IN_PROGRESS` em 26/09/2026, sob a autorização do usuário ("então vamos
  avançar"); as demais continuam `PROPOSED`.
- Plano executivo: [0354](0354_production_executive_plan_2026-09-26.md).
  Roadmap e gates de fase: [0355](0355_production_roadmap_2026-09-26.md).
  Baseline: [AUD-0577](../04_audit/0577_production_readiness_score_audit_2026-09-26.md).
- Itens herdados mantêm o ID de origem entre parênteses: RA26 em
  [0353](0353_score_backlog_2026-09-26.md) e RA25 em
  [0351](0351_audit0573_backlog.md). Ao concluir, atualizar os dois registros.
- Etapa CVG: `DOC` (documental), `DISC` (discovery), `PRD`, `SPEC+BUILD`
  (SPEC curta e gate de BUILD próprios), `OPS` (operação/infra com gate
  próprio), `HUMAN` (decisão humana registrada com hash).
- Prioridade: P0 bloqueia a fase seguinte; P1 bloqueia o `GO`; P2 é melhoria
  que pode seguir após o piloto se assim for decidido em F1.

## F0 — Base verificável e higiene

### PR-001 — Resolver o worktree sujo (RA26-01) · P0 · DOC

- Estado: `COMPLETED` em 26/09/2026. O commit `f9f84c9` absorveu
  `postgres.ts` e `postgres-audit.ts`. Gates sobre `001fc6f` (que contém
  `f9f84c9`) em Node 22 com PostgreSQL: `typecheck` e `lint` exit 0; suíte
  completa 323 arquivos / 2 294 testes PASS; `test:postgres` 35 / 258 PASS.

### PR-002 — Fixar a toolchain em Node 22 · P0 · SPEC+BUILD

- Estado: `COMPLETED` em 26/09/2026.
- Fato: `package.json` já declarava `engines.node` `>=22 <23`, mas nada
  impedia rodar `verify`/`certify` em outra versão.
- Entregue: `scripts/node-version-preflight.mjs` lê o `.nvmrc`; major
  diferente aborta (exit 1), patch diferente só avisa. `verify` e `certify`
  passam a começar pelo preflight. Teste em
  `tests/node-version-preflight.test.js` (6 casos). Verificado: Node 22.23.2
  exit 0; Node 24.20.0 exit 1 com mensagem.

### PR-003 — Certificado reproduzível (RA26-02) · P0 · SPEC+BUILD

- Estado: `IN_PROGRESS / CAUSE_IDENTIFIED`.
- Causa da divergência, medida em 26/09: ambiente, não regressão. Sem
  PostgreSQL e em Node 24 a suíte pula 20 arquivos (146 testes) e a cobertura
  cai para 90,88/85,88/92,97/91,83. Em Node 22 com PostgreSQL descartável e
  `PHASE4A_DISPOSABLE_PG=1`: 0 skips e 92,41/87,48/94,79/93,40 sobre
  `001fc6f`; depois da PR-L02, 92,57/87,62/94,93/93,57.
- Falta: reemitir o certificado (`npm run certify` com `CI_RUN_ID` novo) em
  máquina ociosa, ou no CI, e confirmar `certification:verify` exit 0 em duas
  execuções seguidas.
- Pronto: duas execuções limpas seguidas geram as mesmas métricas;
  `certification:verify` exit 0.

### PR-004 — Tirar o estado Gauntlet do versionamento · P0 · HUMAN + DOC

- O que/onde: 17 `state.json` de ~6 MB em `.gauntlet/`, `.gauntlet-*` e
  `.gauntlet-archive/` (~100 MB).
- Como: D-02; mover para armazenamento de artefatos (release asset ou bucket)
  com manifesto de hashes versionado; `git rm --cached` e `.gitignore`.
  Não reescrever histórico sem decisão separada.
- Dependência: D-02.
- Pronto: `git ls-files | grep state.json` vazio fora do manifesto; hashes
  do manifesto conferem com os arquivos arquivados.

### PR-005 — Rotacionar ledgers e reescrever o README (RA26-03/04/06) · P1 · DOC

- O que/onde: `99_runtime_state.md` (3 764 linhas),
  `20_master_execution_log.md` (7 680), `30_backlog_master.md` (2 504);
  README como pilha de estados.
- Como: estado vigente em arquivo curto; ciclos encerrados em
  `docs/08_runtime/archive/<ciclo>.md`; README com uma seção única de
  estado atual e links; reconciliar status RA25 (RA26-03).
- Dependência: PR-001; aprovação de D-12.
- Pronto: cada ledger vigente com menos de 300 linhas; `docs:check-links`
  exit 0; nenhum conteúdo histórico perdido (hash do arquivo original no
  arquivo arquivado).

### PR-006 — Reconciliar arquivos vazios versionados · P2 · DOC

- Estado: `ABSORVIDA_POR_PR-004`.
- Fato: dos 242 vazios versionados, 231 já estão catalogados em
  `docs/04_audit/evidence/empty-artifact-status.json`; os 11 restantes são
  `artifacts.jsonl` vazios dos diretórios `.gauntlet*` e saem do índice com a
  PR-004. O inventário deles está no
  [manifesto Gauntlet](../04_audit/evidence/AUD-20260926/gauntlet-state-manifest.json).
- Pronto: PR-004 concluída; `evidence:check-hygiene` exit 0.

### PR-007 — Cobertura com denominador completo e lint type-aware (RA26-15) · P1 · SPEC+BUILD

- O que/onde: `vitest.config.mts` exclui `apps/web/src/**` e `*postgres*.ts`
  (~23% do código); branches com margem de 0,88 pp; `eslint.config.js` só com
  `recommended`.
- Como: segundo relatório de cobertura para web e adaptadores PostgreSQL com
  thresholds próprios; ativar `recommendedTypeChecked` em etapas
  (`no-floating-promises`, `no-misused-promises` primeiro).
- Dependência: PR-003.
- Pronto: dois relatórios verdes; margem ≥ 3 pp em todas as métricas;
  `npm run lint` exit 0 com as regras novas.

### PR-008 — Imagem web fixada e nome de imagem corrente · P2 · SPEC+BUILD

- O que/onde: `Dockerfile` usa `nginxinc/nginx-unprivileged:1.27-alpine` sem
  digest; comentário e tag ainda citam `cvg-agent-secretary`.
- Pronto: digest fixado; gate `image` verde; nome coerente com o projeto.

### PR-009 — Coerência do E2E e JUnit (RA26-16) · P2 · SPEC+BUILD

- Pronto: `playwright-results.xml` e o relatório E2E da certificação com o
  mesmo `runId`; specs para aprovações e jornada completa.

## FL — Limpeza e isolamento do legado

O legado é a Esmeralda V2 (`cvg-agent-secretary-v2`), secretária de hospital
veterinário da qual o harness foi extraído. Decisões DL-01 a DL-04 já foram
tomadas pelo usuário em 26/09/2026 ([0357](0357_production_decision_packet_2026-09-26.md)).
Regra de todas as tasks FL: o legado pode depender do harness; o harness
nunca depende do legado. Cada fatia de código tem SPEC curta e só fecha com
`typecheck`, `lint`, `npm test`, `test:postgres` e E2E verdes em Node 22.

### PR-L01 — Inventário e classificação do legado · P0 · DOC

- Estado: `COMPLETED` em 26/09/2026 — [`legacy/LEGACY_INVENTORY.md`](../../legacy/LEGACY_INVENTORY.md).

- O que/onde: todos os arquivos de `apps/`, `packages/`, `scripts/`, `tests/`,
  `docs/`, configuração e raiz.
- Como: classificar cada item em `HARNESS`, `LEGACY_ISOLATE` (vital hoje,
  vai para `legacy/`), `LEGACY_DELETE` (não vital, apagar) ou `HISTORY`
  (histórico vinculado por hash, fica no lugar e é marcado). Ponto de partida
  medido em 26/09: termos `secretary|esmeralda|tutor|pet|patient|appointment|veterin`
  em 40 arquivos de produção (~19,5 mil linhas, incluindo `server.ts`).
- Pronto: `legacy/LEGACY_INVENTORY.md` com cada item, classe, motivo e task
  de destino; revisado pelo usuário.

### PR-L02 — Apagar pacotes sem consumidor (DL-02) · P0 · SPEC+BUILD

- Estado: `COMPLETED` em 26/09/2026 sob [SPEC-LEGACY-001](../02_spec/0135_legacy_dead_packages_and_boundary.md).

- O que/onde: `packages/workflows` (266 linhas), `packages/tools` (395) e
  `packages/memory` (13), sem nenhum importador em `apps/` ou `packages/`.
- Como: remover os diretórios e as referências em `tsconfig.json`,
  `tsconfig.base.json`, `apps/worker/tsconfig.json`, `vitest.config.mts`,
  `scripts/phase3-candidate-digest.mjs` e `package-lock.json` (as entradas
  `packages/<nome>` do lock também precisam sair).
- Pronto: `git grep` sem referências fora do histórico; `npm ci`,
  `typecheck`, `lint`, `npm test` e `sbom` verdes.

### PR-L03 — Estrutura de `legacy/` e regra de dependência · P0 · SPEC+BUILD

- Estado: `COMPLETED` em 26/09/2026 sob [SPEC-LEGACY-001](../02_spec/0135_legacy_dead_packages_and_boundary.md). A inclusão de `legacy/packages/*` nos workspaces ficou para a PR-L04 (depende de D-13).

- Como: workspace `legacy/packages/*` com pacotes `@cvg/legacy-*`;
  `legacy/README.md` explica origem, regra e prazo de remoção; teste de
  arquitetura (extensão de `tests/architecture/dependency-direction.test.ts`)
  falha se `packages/` importar `legacy/` e se `apps/` importar `legacy/` fora
  de um único ponto de composição declarado.
- Pronto: teste de arquitetura verde e com caso negativo provado.

### PR-L04 — Isolar o domínio de jornadas (tutor, pet, consulta) (DL-01) · P0 · SPEC+BUILD

- O que/onde: `packages/persistence/src/journeys.ts` (998 linhas) e
  `journeys-postgres.ts` (1 148), rotas de jornada em
  `apps/api/src/server.ts`, `apps/web/src/features/journeys`, entradas de
  jornada em `restore.ts` e `tenant-schema.ts`.
- Como: mover para `legacy/packages/secretary-journeys` como plugin Fastify e
  módulo web registrados pelo ponto de composição; a migration
  `0014_journeys.sql` fica na cadeia (histórico de schema) marcada como
  `LEGACY`; a remoção das tabelas só acontece em PR-L11 com migration
  expand/contract e backup.
- Pronto: nenhuma referência a jornadas fora de `legacy/` exceto a
  migration marcada; `test:postgres` e E2E verdes.

### PR-L05 — Isolar o perfil da secretária (DL-01) · P0 · SPEC+BUILD

- O que/onde: `packages/platform/src/secretary-preset.ts`, grants da
  secretária em `packages/policy-engine/src/grants.ts` e `capabilities.ts`,
  resumo de handoff tutor/pet em
  `packages/agent-core/src/commands/create-handoff-summary.ts`, bootstrap da
  secretária na API (`apps/api/src/__tests__/secretary-bootstrap.test.ts`).
- Como: mover para `legacy/packages/secretary-profile`; o harness expõe só o
  mecanismo de perfil/preset e grants genéricos.
- Pronto: `platform`, `policy-engine` e `agent-core` sem vocabulário da
  secretária; testes verdes.

### PR-L06 — Isolar os datasets de evals da secretária (DL-01) · P1 · SPEC+BUILD

- O que/onde: `packages/agent-evals/src/datasets/core.ts` e cenários de
  evals do harness que usam tutor/pet/consulta.
- Como: mover os cenários para `legacy/`; criar dataset neutro para o gate
  `test:evals` cobrindo policy, approval, handoff, prompt injection e ação
  proibida.
- Pronto: `test:evals` verde só com o dataset neutro.

### PR-L07 — Fluxo de referência neutro · P0 · SPEC+BUILD

- O que: hoje o único fluxo ponta a ponta exercitado pelos testes, E2E e
  certificação é a jornada da secretária. Sem substituto, apagar o legado
  esvazia a certificação.
- Como: produto de referência sintético e neutro (ex.: "solicitação
  operacional" com coleta de dados, efeito externo em rascunho com approval,
  tarefa e handoff), escrito como consumidor do harness pelos contratos
  públicos, dentro de `examples/` ou de um pacote de referência.
- Pronto: E2E, `test:postgres`, `verify:phase2/3/4a` e certificação passam
  com o fluxo neutro, sem carregar `legacy/`.

### PR-L08 — Mover a documentação de produto para `legacy/docs` (DL-03) · P1 · DOC

- O que/onde: `docs/00_discovery/0001–0009`, `docs/01_prd/0010–0020` e
  `aaa_decision_brief.md`, `docs/blueprint/`, `docs/CODEX_MASTER_INSTRUCTIONS.md`
  e demais documentos de produto identificados em PR-L01.
- Como: `git mv` para `legacy/docs/` com índice; o histórico de auditoria
  (`docs/04_audit/**`, evidências com hash) fica no lugar, marcado como
  `HISTORY` no inventário. Ajustar `tests/docs-readiness.test.js` (lê
  `0013_requisitos_funcionais.md` e a matriz `0304`) e os links.
- Pronto: `docs:check-links` e `npm test` verdes; `docs/` vigente só com
  documentação do harness.

### PR-L09 — Constituição e instruções de agente do harness · P0 · DOC

- O que/onde: `AGENTS.md` da raiz (título `cvg-agent-secretary-v2`),
  `docs/07_agents/AGENTS.md` ("construir a Esmeralda V2"), skills em
  `.agents/`, `.codex/` e `.agent/` que citam o produto legado.
- Como: reescrever para o harness, preservando pipeline, estados e regras de
  segurança; a versão antiga vai para `legacy/docs`.
- Pronto: nenhuma instrução de agente vigente cita o legado como produto;
  aprovação humana da nova constituição registrada.

### PR-L10 — Resíduos de nome · P2 · SPEC+BUILD

- O que/onde: tag `cvg-agent-secretary:local` no `Dockerfile`, banco
  `cvg_agent_secretary_v2` no `.env.example`, chave
  `cvg-agent-secretary:migrations` do advisory lock em
  `packages/persistence/src/postgres-migrations.ts`, nomes de teste.
- Como: renomear; a chave do advisory lock só muda com janela de
  compatibilidade (as duas chaves adquiridas durante uma versão) para não
  permitir migrações concorrentes durante o deploy.
- Pronto: `git grep -i secretary` fora de `legacy/` e do histórico vazio.

### PR-L11 — Apagar o legado isolado (DL-05) · P1 · SPEC+BUILD

- O que: remover `legacy/packages/*` e as tabelas de jornada quando PR-L07
  estiver verde e DL-05 autorizar.
- Como: migration expand/contract para descartar as tabelas legadas, com
  backup verificado antes; `legacy/` fica só com README, inventário e
  `legacy/docs`.
- Pronto: build, testes, E2E e certificação verdes sem `legacy/packages`.

### PR-L12 — Guarda de CI contra resíduo do legado · P1 · SPEC+BUILD

- Como: gate `legacy-residue` em `scripts/ci-bar.mjs` que falha se termos do
  legado aparecerem fora de `legacy/` e de uma allowlist de histórico
  versionada; pacote sem consumidor também falha o gate.
- Pronto: gate no `verify.yml`, com caso negativo provado.

## F1 — Decisões de plataforma e escopo

### PR-101 — Discovery de plataforma · P0 · DISC

- O que: quais produtos vão consumir o harness, qual é o primeiro, que
  capacidades eles precisam (runtime, approvals, handoff, canal, conhecimento,
  efeito externo), volumes, operadores e restrições legais. O legado
  (Esmeralda V2) não é insumo de escopo.
- Pronto: documento em `docs/00_discovery/` e validação aprovada.

### PR-102 — PRD adendo de plataforma (D-03) · P0 · PRD

- O que: capacidades da plataforma liberadas para produção, contrato público
  que os produtos consomem, SLOs da plataforma, métricas de sucesso e
  não-objetivos permanentes do plano 0354. Substitui, para o harness, o PRD
  original da secretária, que vai para `legacy/docs` (PR-L08).
- Pronto: PRD adendo aprovado e `01_prd/0090_prd_validation.md` atualizado.

### PR-103 — Primeiro consumidor, tenant piloto e níveis de serviço (D-04) · P0 · HUMAN

- Pronto: produto consumidor do piloto, tenant, volume, horário de cobertura
  humana, SLA de handoff e metas numéricas de sucesso registrados.

### PR-104 — Provider de LLM (D-05) · P0 · HUMAN

- Critérios: DPA com retenção zero para dados de entrada, região de
  processamento, custo, latência, suporte a endpoint compatível com o gateway
  `openai-compatible` já existente.
- Pronto: decisão e contrato registrados.

### PR-105 — Canal (D-06) · P0 · HUMAN

- Opções: WhatsApp Business API oficial, Evolution, Chatwoot (os dois
  últimos já têm adapter em `packages/channel-gateway`).
- Pronto: decisão registrada com análise de risco de bloqueio de número,
  custo e termos de uso.

### PR-106 — Fontes de conhecimento aprovadas (D-07) · P1 · HUMAN

- Pronto: dono das fontes do primeiro consumidor, processo de
  publicação/revogação na plataforma e lista inicial aprovada.

### PR-107 — Nuvem, região e orçamento (D-08) · P0 · HUMAN

- Pronto: provedor, região (preferência Brasil), orçamento mensal e conta
  de produção separada registrados.

### PR-108 — Governança proporcional (D-12) · P0 · HUMAN + DOC

- O que: o processo atual exige gate hash-bound por edição e deixou C1L cair
  por drift de `0190_spec_validation.md`, que estava fora do escopo.
- Como: gate hash-bound por release candidate e por capacidade sensível;
  baselines de gate só com os inputs daquele gate; SPEC curta + CI + revisão
  para refatorações sem efeito externo. Atualizar `07_agents/AGENTS.md`.
- Pronto: constituição atualizada e aprovada; um exemplo de cada trilha.

### PR-109 — Encerrar M07-S1/C1M (RA26-17) · P0 · HUMAN

- Como: D-13; completar o packet C1M com baseline rederivada e executar, ou
  reclassificar M07-S1 com justificativa e riscos aceitos.
- Pronto: `final-gate-result.md` gravado ou reclassificação assinada;
  RA25-05 desbloqueado ou encerrado.

## F2 — Fundação de engenharia

### PR-201 — Decompor `apps/api/src/server.ts` (RA26-11) · P1 · SPEC+BUILD

- O que: 5 857 linhas e 74 handlers.
- Como: padrão RA25-07 (extração mecânica verificada byte a byte, uma fatia
  por SPEC); domínios candidatos: jornadas, admin/control plane, webhooks,
  aprovações.
- Pronto: nenhum módulo acima de 1 500 linhas; testes, cobertura e
  `test:postgres` sem queda.

### PR-202 — Decompor `runTurn` em `packages/agent-runtime/src/runtime.ts` · P1 · SPEC+BUILD

- O que: 2 603 linhas, com um `runTurn` de 2 233.
- Pronto: `runTurn` dividido em etapas nomeadas com testes por etapa; mesmo
  comportamento provado pela suíte de evals.

### PR-203 — Fatias 3 e 4 de `postgres.ts` (RA25-07) · P1 · SPEC+BUILD

- Dependência: PR-001.
- Pronto: `postgres.ts` abaixo de 1 500 linhas; `test:postgres` PASS.

### PR-204 — Configuração única validada no boot (RA26-08) · P0 · SPEC+BUILD

- O que/onde: `ENABLE_REAL_*` sem consumidor em `packages/shared/src/env.ts`;
  segredo do provider chamado `OPENAI_API_KEY` num gateway neutro;
  `POSTGRES_RLS_ENFORCEMENT` e `OUTBOX_DURABLE_INBOUND` opcionais.
- Como: um schema de configuração por processo, validado no boot, com perfil
  `production` que exige RLS, inbound durável, HTTPS, identidade `trusted`,
  keyrings e flags coerentes; renomear o segredo para `MODEL_PROVIDER_API_KEY`
  com compatibilidade temporária.
- Pronto: testes negativos provam que cada combinação inválida aborta o boot
  em produção.

### PR-205 — Dependências e duplicações (RA26-12/14) · P2 · SPEC+BUILD

- O que: `drizzle-orm`, `pino` e `dotenv` sem uso; `ssrf-node.ts` duplicado;
  fixture duplicado.
- Pronto: `npm ls` coerente; SBOM sem dependência órfã; uma única cópia do
  código SSRF.

### PR-206 — Destino de `conversation`, `rag`, `channel-gateway` e Drizzle (RA26-12/13, D-11) · P1 · HUMAN + SPEC+BUILD

- O que: `@cvg/conversation` (7 917 linhas, camada Phase 4A do harness, sem
  importador em apps), `@cvg/rag` e `@cvg/channel-gateway` sem consumidor de
  runtime; `drizzle-orm` sem uso. `workflows`, `tools` e `memory` saíram
  deste item: são legado e são apagados na PR-L02 (DL-02).
- Pronto: cada pacote `WIRED`, `SPEC_ONLY` ou `ARCHIVED`, conforme o PRD
  adendo de plataforma.

### PR-207 — Contrato de API publicado e versionado · P2 · SPEC+BUILD

- Como: gerar OpenAPI a partir dos schemas zod existentes; teste de contrato
  que falha em quebra não versionada.
- Pronto: documento OpenAPI gerado em CI e diff de contrato como gate.

## F3 — Segurança e identidade

### PR-301 — Autenticação de operador por OIDC com MFA na API (D-09) · P0 · SPEC+BUILD

- O que/onde: hoje a identidade é token HMAC por keyring
  (`apps/api/src/operator-identity.ts`).
- Como: validar tokens OIDC (issuer, audience, JWKS com cache e rotação);
  mapear grupos do IdP para papéis e tenants; manter o keyring só para
  tráfego serviço-a-serviço.
- Pronto: testes com IdP de teste para token expirado, audience errada,
  tenant ausente e MFA ausente; replay continua bloqueado.

### PR-302 — Login web por OIDC · P0 · SPEC+BUILD

- O que/onde: `apps/web/src/auth/session.ts` depende de
  `__CVG_OPERATOR_BOOTSTRAP_TOKEN__` injetado.
- Como: Authorization Code + PKCE, sessão com cookie `HttpOnly`/`Secure`/
  `SameSite`, logout e expiração.
- Pronto: E2E de login, expiração e logout em staging.

### PR-303 — Cofre de segredos e rotação · P0 · OPS + SPEC+BUILD

- O que: keyrings de identidade e rate limit, segredo de webhook, credenciais
  do banco e do provider.
- Pronto: nenhum segredo em env file ou imagem; rotação de cada segredo
  exercitada em staging sem downtime; runbook de rotação.

### PR-304 — Borda endurecida · P1 · OPS

- O que: TLS ponta a ponta (incluindo PostgreSQL), `API_REQUIRE_HTTPS=true`,
  CORS com allowlist de produção, proxies confiáveis corretos, WAF e limites
  de payload.
- Pronto: varredura de configuração TLS sem achado alto; testes de CORS e
  HTTPS em staging.

### PR-305 — Supply chain de release · P1 · SPEC+BUILD

- Como: assinatura de imagem (cosign), SBOM e proveniência anexados à
  release, atualização automática de dependências com revisão.
- Pronto: deploy recusa imagem sem assinatura válida.

### PR-306 — Threat model para integrações reais · P1 · DOC

- O que/onde: atualizar `docs/10_phase10/PHASE10_THREAT_MODEL.md` com canal,
  provider, RAG, agenda e IdP (prompt injection, exfiltração por ferramenta,
  spoofing de webhook, abuso de custo).
- Pronto: cada ameaça com controle e teste associado.

### PR-307 — Pentest externo · P0 · OPS

- Dependência: F5 em staging.
- Pronto: relatório sem crítico/alto aberto; médios com plano.

## F4 — Dados, privacidade e LGPD

### PR-401 — Inventário de dados pessoais da plataforma (D-10) · P0 · DOC + HUMAN

- O que: mapear que dado pessoal a plataforma guarda por tabela, log,
  telemetria, provider e canal (remetente, texto de mensagem, identidade de
  operador), independentemente do produto; cada produto consumidor declara
  as categorias que traz e a base legal. Tabelas do legado (jornadas) entram
  como `LEGACY` até a remoção.
- Pronto: inventário versionado; modelo de RIPD para produtos consumidores
  aprovado pelo DPO.

### PR-402 — Retenção e descarte aplicados · P0 · SPEC+BUILD

- O que: POL-EVIDENCE-001 registrada e não aplicada; não há retenção de
  dados operacionais.
- Pronto: jobs de expurgo com teste; retenção por categoria configurada;
  evidência de execução em staging.

### PR-403 — Minimização antes do provider e nos logs · P0 · SPEC+BUILD

- Como: redação/pseudonimização de PII antes do provider quando a finalidade
  permitir; logs e telemetria sem PII; teste negativo em CI com dados
  fictícios.
- Pronto: teste prova que CPF, telefone, e-mail e texto livre fictícios não
  chegam ao provider nem aos logs.

### PR-404 — Direitos do titular · P1 · SPEC+BUILD

- Pronto: acesso, correção e eliminação por titular, com registro em
  auditoria e prazo operacional definido.

### PR-405 — RLS obrigatório e roles separadas · P0 · SPEC+BUILD

- O que/onde: `POSTGRES_RLS_ENFORCEMENT` é `false` por padrão e só o worker
  de homologação exige `true`.
- Pronto: API e worker abortam em produção sem RLS; role de migração
  separada da role de aplicação; teste de isolamento entre tenants em
  staging.

### PR-406 — Backup, PITR, RPO e RTO · P0 · OPS

- Pronto: PITR gerenciado; RPO/RTO aprovados; restore exercitado em staging
  dentro do RTO, com evidência.

### PR-407 — Contratos, DPO e plano de incidente · P0 · HUMAN + DOC

- Pronto: DPA com provider, canal e nuvem; encarregado nomeado; plano de
  resposta a incidente com comunicação à ANPD e aos titulares conforme a
  regulamentação vigente.

## F5 — Integrações reais controladas

### PR-501 — Provider de LLM real no worker · P0 · PRD + SPEC+BUILD

- O que/onde: `apps/worker/src/kernel-composition.ts` compõe
  `DeterministicModelProvider`; o gateway `openai-compatible` existe, mas não
  é usado.
- Como: composição atrás de flag, com orçamento, circuit breaker, timeout e
  fallback para handoff; prompt versionado no registry; custo por turno
  medido.
- Dependência: PR-104, PR-204, PR-303, PR-403.
- Pronto: staging com dados sintéticos; falha do provider sempre gera
  handoff; custo e latência dentro das metas.

### PR-502 — Evals de produção e red team · P0 · SPEC+BUILD

- Como: golden set por intenção liberada, casos de prompt injection, pedido
  de ação proibida, pedido sem fonte; barra mínima definida na SPEC.
- Pronto: `test:evals` com provider real em staging acima da barra; gate de
  regressão antes de trocar modelo ou prompt.

### PR-503 — Canal real no worker (RA26-09) · P0 · PRD + SPEC+BUILD

- Como: adapter escolhido em D-06 instanciado atrás de flag; webhook assinado
  com replay fencing; idempotência e effect journal durável; lista de
  contatos permitidos no piloto.
- Dependência: PR-105, PR-303.
- Pronto: mensagens ponta a ponta em staging com número de teste;
  duplicidade e reentrega provadas sem efeito duplicado.

### PR-504 — Conhecimento com fonte aprovada (RA26-10) · P1 · PRD + SPEC+BUILD

- Pronto: resposta só com fonte publicada e citada; fonte revogada bloqueia;
  ausência de fonte gera handoff.

### PR-505 — Efeito externo genérico com rascunho e approval · P1 · PRD + SPEC+BUILD

- O que: a plataforma oferece aos produtos um padrão único para efeitos em
  sistemas externos (leitura livre; escrita sempre como rascunho com approval
  humano, idempotência e effect journal). Substitui o fluxo de agenda da
  secretária, que é legado (PR-L04).
- Pronto: teste negativo prova que nenhum efeito de escrita externo ocorre
  sem approval; exemplo de uso no fluxo de referência neutro (PR-L07).

### PR-506 — Handoff humano operacional · P0 · SPEC+BUILD

- Pronto: fila com SLA, notificação ao operador, takeover na UI, retorno ao
  agente; métricas de tempo até atendimento.

### PR-507 — Kill switch e modo degradado · P0 · SPEC+BUILD

- Pronto: desligamento global, por tenant e por capacidade em menos de 1
  minuto, sem deploy; modo degradado só com handoff; drill registrado.

## F6 — Infraestrutura e operação

### PR-601 — Infraestrutura como código (D-08) · P0 · OPS

- O que/onde: `deploy/` só contém `nginx.web.conf`.
- Pronto: dev, staging e produção criados por IaC revisado; nenhum recurso
  manual.

### PR-602 — Entrega contínua por digest · P0 · OPS

- Pronto: build único, promoção do mesmo digest entre ambientes, aprovação
  manual para produção, rollback em um comando testado.

### PR-603 — Migrações no pipeline · P1 · OPS

- Pronto: migrações com role dedicada, compatibilidade expand/contract,
  rollback documentado; `POSTGRES_AUTO_MIGRATE` desligado em produção.

### PR-604 — Observabilidade de produção · P0 · OPS + SPEC+BUILD

- Como: exportar OpenTelemetry para backend gerenciado; dashboards de API,
  worker, outbox, provider, canal e custo; alertas com dono.
- Pronto: SLOs de disponibilidade, latência, taxa de handoff, erro de
  provider e custo com alertas testados.

### PR-605 — Runbooks e on-call · P0 · DOC + OPS

- O que/onde: `docs/runbooks/` tem apenas dois runbooks de homologação.
- Pronto: runbooks de incidente, provider fora, canal fora, rotação de
  segredo, restore, kill switch e vazamento de dados; escala de on-call
  definida.

### PR-606 — Carga e soak em staging · P1 · OPS

- Pronto: perfil do piloto × 3 por 24 h dentro do SLO; capacity planning
  registrado.

### PR-607 — Drill de DR · P1 · OPS

- Pronto: perda de banco e de região simuladas em staging, dentro de RPO/RTO.

### PR-608 — Suporte e comunicação · P2 · DOC

- Pronto: canal de suporte, página de status e modelo de comunicação de
  incidente.

## F7 — Homologação, piloto e GA

### PR-701 — Staging completo com E2E da jornada de referência · P0 · OPS + SPEC+BUILD

- Pronto: jornada completa do fluxo de referência neutro (canal → agente →
  approval/handoff → resposta) em staging com dados sintéticos, automatizada,
  sem nenhum componente de `legacy/`.

### PR-702 — UAT e treinamento de operadores · P0 · HUMAN

- Pronto: roteiro de UAT do primeiro produto consumidor aprovado; operadores
  treinados; manual de uso da console do harness.

### PR-703 — Auditoria independente pré-piloto · P0 · AUDIT

- Pronto: auditoria de segurança, LGPD e aderência PRD/SPEC com evidência
  executável, conforme as regras de AUDIT da constituição.

### PR-704 — Go/no-go do piloto (D-14) · P0 · HUMAN

- Pronto: decisão registrada com hash do candidato, da configuração e do
  escopo.

### PR-705 — Piloto controlado · P0 · OPS

- Escopo: primeiro produto consumidor, um tenant, contatos permitidos,
  horário de operação com humano, approval em 100% das ações sensíveis,
  hypercare diário.
- Pronto: critérios de saída do roadmap 0355 atingidos por duas semanas.

### PR-706 — Avaliação do piloto · P0 · AUDIT

- Pronto: relatório com métricas, incidentes, feedback e backlog de
  correções priorizado.

### PR-707 — Go/no-go da produção controlada (D-15) · P0 · HUMAN

- Pronto: decisão registrada; plano de expansão aprovado.

### PR-708 — Expansão gradual por tenant · P1 · OPS

- Pronto: cada novo tenant com checklist de onboarding, RIPD revisado e
  janela de hypercare.

### PR-709 — Auditoria de 30 dias pós-GA · P1 · AUDIT

- Pronto: SLOs, custo, incidentes e qualidade revisados; roadmap seguinte
  proposto.

## Resumo

| Fase      | Tasks        | P0     | P1     | P2    |
| --------- | ------------ | ------ | ------ | ----- |
| F0        | PR-001 a 009 | 4      | 2      | 3     |
| FL        | PR-L01 a L12 | 7      | 4      | 1     |
| F1        | PR-101 a 109 | 8      | 1      | 0     |
| F2        | PR-201 a 207 | 1      | 4      | 2     |
| F3        | PR-301 a 307 | 4      | 3      | 0     |
| F4        | PR-401 a 407 | 6      | 1      | 0     |
| F5        | PR-501 a 507 | 5      | 2      | 0     |
| F6        | PR-601 a 608 | 4      | 3      | 1     |
| F7        | PR-701 a 709 | 7      | 2      | 0     |
| **Total** | **75**       | **46** | **22** | **7** |
