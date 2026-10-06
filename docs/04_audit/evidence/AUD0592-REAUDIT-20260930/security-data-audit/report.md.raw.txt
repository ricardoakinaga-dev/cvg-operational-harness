# AUD0592 — segurança, dados e operação — I1

**Veredito: NO_GO.** Auditoria estática e planejamento de C22–C42 e G01–G13, sem produção liberada. As notas são provisórias; nenhuma equivale a PASS ou aprovação T3/T4.

21 critérios: média igualmente ponderada **55.4/100**. 13 gates: indicador separado **24.2/100**, **0 PASS**. 18 achados: 5 P0 de release, 11 P1 e 2 P2. Média não cancela bloqueio.

## Escopo, independência e proveniência

Fonte de produto: `/tmp/cvg-aud0592-20260930/repo`, selada e somente leitura. Saída exclusiva: esta lane. I1, mesma família, fresh-context desta sessão, depth1, zero descendentes. Não executados build, npm, certificação, testes, rede, banco, browser, carga, restore ou efeito externo. Checks atuais do Lead: **UNKNOWN / não recebidos**. Nenhum dado real ou certificado histórico usado como prova.

Método: seguir imports/composição do entrypoint API e worker até ingress/persistência/journal/sinks; confrontar contratos públicos com código, config, PRD/SPEC normativos e fontes de testes. Arquivo de teste comprova presença de caso, não seu resultado. UI/a11y avaliadas só por fontes.

Contrato originalHEAD `f8ccc845e6f177959bc5d40e0cec59c71e595b5b`; fingerprint selado HEAD `3085e865a1e467c7fcc6489c1772b2818dc7f4f9`. **Há diferença de identidade**: julguei os bytes selados, não equiparei checks/aprovações dos dois SHAs. Fingerprint base `7e8be0fcda7ab8ee36bcf5ece57370b763450837a5985571e6a7d5104a5126b0` em `2026-09-30T12:56:30Z`; comparação bounded de 801 arquivos sem diferenças, repetida ao escrever. Metadata base inclui worktree diff não vazio; não se declara checkout limpo ou candidato certificado.

Referências `path:linha` deste relatório resolvem relativamente à raiz do snapshot selado, nunca ao checkout concorrente. findings.json inclui SHA256/tamanho das fontes citadas e hash do contrato.

Leituras obrigatórias de coordenação/ledgers e do backlog normativo continham resumos históricos expostos durante a leitura. Essas declarações foram descartadas como prova; nenhum parecer anterior, nota de auditor anterior, histórico .gauntlet ou evidência UP91-EXEC foi aberto para julgamento. **Cegueira absoluta aos resumos embutidos não pode ser afirmada**; isso limita a independência informacional, sem transferir aceites anteriores. Não houve geração de descendentes.

Não alterei runtime state, execution log, backlog ou claim compartilhados: a restrição explícita de saída prevalece; o Lead deve integrar a continuidade sob ownership próprio.

## Caminho público e aderência

API: `apps/api/src/main.ts:12` → `buildServerFromEnv` → preflights PG/RLS (`apps/api/src/server.ts:5292`) → rotas. Webhook: verificador (`apps/api/src/server.ts:1428`) → receiveInboundMessage (`:1458`) → COMMIT mensagem/outbox (`packages/persistence/src/postgres-inbound.ts:342`) → audit → commit replay (`apps/api/src/server.ts:1583`). A mesma geração de replay não cerca o COMMIT inbound.

Sessão: `/v1/session` aceita cookie existente (`apps/api/src/server.ts:774`) mas troca por create/revoke (`:807`, `:825`); SQL replace (`packages/persistence/migrations/operator-session/0000_auth.sql:82`) existe separado. Console usa `createTrustedSessionBootstrap` (`apps/web/src/auth/session.ts:55`) e recusa sem token antes do GET. main não fornece store/OIDC; adapter isolado não prova login publicado.

Worker: perfil controlado e efeitos sintéticos (`apps/worker/src/kernel-composition.ts:119`, `apps/worker/src/main.ts:435`), preflight com least privilege e RLS (`apps/worker/src/postgres-role-preflight.ts:95`), store de execução com SKIP LOCKED (`packages/persistence/src/operational-execution-postgres.ts:479`) e recovery incerto (`packages/agent-runtime/src/runtime-effect-recovery.ts:130`). Há fonte de teste real de restart, cujo resultado atual não foi observado.

PRD candidato 0014 (`docs/01_prd/0014_up91_platform_prd_reconciliation.md:3`) está REVIEW_PENDING; usado como intenção proposta, sem promovê-lo a PRD aprovado. Pisos permanentes de AGENTS e 0354 permanecem. SPEC0160/0161/0162 descreve inbox/guard/recovery, mas migrations/default runner do snapshot terminam em 0026 (`packages/persistence/src/postgres-migrations.ts:46`): intenção/fatia isolada não prova integração. W13–W17 da reconciliação descrevem sessão, privacidade, console, efeitos e operação; os gaps abaixo indicam o que falta por contrato e por prova.

## Critérios C22–C42

| ID | Critério | Nota provisória |
| --- | --- | ---: |
| C22 | HMAC, replay e relógio | 62 |
| C23 | Isolamento tenant e RLS | 74 |
| C24 | Segredos, cofre e rotação | 35 |
| C25 | Dependências e segurança da cadeia de fornecimento | 62 |
| C26 | Schema, migrations e preflights | 69 |
| C27 | Atomicidade e integridade transacional | 63 |
| C28 | Recuperação de execução e concorrência | 70 |
| C29 | Retenção, eliminação e direitos operacionais | 30 |
| C30 | Suíte automatizada e integração PostgreSQL | 70 |
| C31 | Cobertura e denominador | 59 |
| C32 | Governança de skips e dependências entre workspaces | 65 |
| C33 | Certificação e vínculo ao candidato | 58 |
| C34 | CI remoto, atestação e proteção de branch | 58 |
| C35 | Fluxos, estados de erro e responsividade | 68 |
| C36 | Acessibilidade e teclado | 66 |
| C37 | Login e continuidade da sessão no produto | 38 |
| C38 | Providers, canais e efeitos externos | 45 |
| C39 | Conhecimento institucional e governança de prompts | 46 |
| C40 | Logs, métricas e observabilidade | 58 |
| C41 | Performance, capacidade e SLOs | 35 |
| C42 | Backup, PITR, incidentes e prontidão operacional | 32 |

### C22 — HMAC, replay e relógio — 62/100

HMAC-SHA256 sobre canal/evento/rawBody, comparação constante, janela inclusiva e reserva PG com geração/token estão ligados ao ingress. PG usa clock_timestamp sem high-water persistido e o commit replay sucede o COMMIT inbound; proteção temporal e crash safety permanecem incompletas.

Fontes: `apps/api/src/webhook-security.ts:210`; `apps/api/src/webhook-security.ts:391`; `apps/api/src/webhook-security.ts:483`; `apps/api/src/server.ts:1458`; `apps/api/src/server.ts:1583`.

Limitações/gaps: Nenhum request HMAC/PG executado nesta lane; resultados atuais UNKNOWN. Regressão de relógio PG, takeover durante processamento e commit ambíguo não demonstrados; guard em memória não prova guarda durável.

### C23 — Isolamento tenant e RLS — 74/100

Produção recusa RLS desativado; verifica role sem bypass, separação runtime/migration, FORCE RLS e expressão de policies. withTenantContext limpa tenant/search_path e destrói conexão contaminada. Há composição estática consistente, sem validação dinâmica do isolamento no candidato.

Fontes: `apps/api/src/server.ts:5209`; `apps/api/src/server.ts:5292`; `apps/api/src/tenant-preflight.ts:490`; `packages/persistence/src/tenant-scoped-postgres.ts:84`; `apps/worker/src/postgres-role-preflight.ts:95`.

Limitações/gaps: Sem catálogo PG vivo, negative tests cross-tenant ou reuse de pool observados. Schemas globais de auth/replay/rate limit exigem fronteiras próprias; não equivalem a RLS de tenant.

### C24 — Segredos, cofre e rotação — 35/100

Há keyring local com kid/revogação/janela e secretRef tipado. Entrypoint lê valores em env e webhook configura um segredo. Não foi encontrado adapter de cofre gerenciado nem protocolo operacional de rotação para todas as famílias.

Fontes: `apps/api/src/operator-identity.ts:220`; `apps/api/src/operator-identity.ts:243`; `apps/api/src/server.ts:5452`; `.env.example:23`; `packages/platform/src/contracts.ts:61`; `docs/03_build/0354_production_executive_plan_2026-09-26.md:51`.

Limitações/gaps: Nenhum segredo real inspecionado; env example tem placeholders. Cofre externo, IAM e drills de rotação UNKNOWN; suporte local não fecha G06.

### C25 — Dependências e segurança da cadeia de fornecimento — 62/100

Lockfile, npm audit high, SBOM/licenças e actions pinadas estão presentes; secret scan conserva defaults com exceções por regra. Controles de cadeia são configurados, mas ausência de advisories e artefatos assinados no digest alvo não foi demonstrada.

Fontes: `package.json:31`; `package.json:46`; `.github/workflows/security.yml:24`; `.github/workflows/security.yml:67`; `.gitleaks.toml:10`; `.github/workflows/verify.yml:228`.

Limitações/gaps: Sem npm audit, install, rede, SBOM ou licenças nesta lane; advisories atuais UNKNOWN. Exceção genérica de fixture não prova ausência de segredo; não reutilizados resultados de scans históricos.

### C26 — Schema, migrations e preflights — 69/100

Runner aplica migrations ordenadas com checksum e lock transacional; preflight de webhook valida definição/validação/dependências built-in e policies tenant têm semântica. Rate limit confere nomes de constraints/índices, sem definições e vínculo suficiente ao objeto esperado. Serving mantém credencial de migration.

Fontes: `packages/persistence/src/postgres-migrations.ts:119`; `apps/api/src/tenant-preflight.ts:490`; `apps/api/src/tenant-preflight.ts:781`; `apps/api/src/tenant-preflight.ts:938`; `apps/api/src/server.ts:5267`; `apps/api/src/server.ts:5319`.

Limitações/gaps: Sem upgrade/rollback/PG negativos executados. Migrations efetivas terminam em 0026; SPEC futura de inbox/clock não é implementação.

### C27 — Atomicidade e integridade transacional — 63/100

Mensagem/idempotency/outbox são gravados na mesma conexão/transação e há store de sessão com função replace atômica. A rota /v1/session chama create e revoke separadamente; ingress/audit/replay também não compartilham um COMMIT único. Invariantes locais fortes não fecham todas as transições públicas.

Fontes: `packages/persistence/src/postgres-inbound.ts:118`; `packages/persistence/src/postgres-inbound.ts:323`; `packages/persistence/migrations/operator-session/0000_auth.sql:110`; `apps/api/src/server.ts:807`; `apps/api/src/server.ts:825`; `apps/api/src/server.ts:1583`.

Limitações/gaps: Atomicidade de sessão existe no componente, mas não é usada pela rota inspecionada. Sem fault injection em janelas create/revoke/commit; não afirmada duplicação externa efetiva.

### C28 — Recuperação de execução e concorrência — 70/100

Execution store usa FOR UPDATE/SKIP LOCKED, leases, checkpoints e journal incerto; recovery evita tratar incerteza como no_effect e retoma journal confirmado. Teste de processo tem SIGKILL e competição. Reconciler de ingress/clock e varreduras do worker contínuo não estão plenamente compostos.

Fontes: `packages/persistence/src/operational-execution-postgres.ts:479`; `packages/agent-runtime/src/runtime-effect-recovery.ts:130`; `packages/agent-runtime/src/runtime-effect-recovery.ts:180`; `apps/worker/src/main.ts:506`; `apps/worker/src/__tests__/operational-harness-process-restart.integration.test.ts:238`.

Limitações/gaps: Teste de restart lido, não executado; integração/concorrência atual UNKNOWN. Dedup externa exige receipt/destino; lease PG do replay não cerca por si só o processamento inbound.

### C29 — Retenção, eliminação e direitos operacionais — 30/100

Inventário reconhece categorias vinculáveis e política técnica de tratamento, mas RetentionLedger é memória e preserva audit indefinidamente. Não foi localizado purge físico abrangente ou fluxo de direitos na composição API/worker/persistência. TTL de sessão não elimina rows/famílias.

Fontes: `docs/platform/09-personal-data-inventory.md:3`; `packages/shared/src/data-classification.ts:38`; `packages/platform/src/retention-ledger.ts:48`; `packages/platform/src/retention-ledger.ts:102`; `packages/persistence/migrations/operator-session/0000_auth.sql:9`; `docs/08_runtime/data_governance_signoff.md:18`.

Limitações/gaps: Decisões por classe/tenant e controlador/DPO não comprovadas. Sem acesso a banco nem dados reais; retenção aplicada, direitos e reexpurgo pós-restore UNKNOWN.

### C30 — Suíte automatizada e integração PostgreSQL — 70/100

Suíte cobre isolamento, PG, atomicidade, replay, restart de processo, canais e E2E; job CI fornece PG e Node22. Há verificações comportamentais mais fortes que asserts de presença, porém execução corrente é tarefa do Lead e não foi recebida nesta lane.

Fontes: `package.json:12`; `package.json:15`; `.github/workflows/verify.yml:26`; `apps/api/src/__tests__/webhook-security.test.ts:532`; `apps/worker/src/__tests__/operational-harness-process-restart.integration.test.ts:238`; `tests/e2e/rem21-014-qualification.spec.ts:46`.

Limitações/gaps: Nenhum teste/typecheck/lint/build executado aqui; todos os resultados atuais UNKNOWN. Mocks/fixtures de bootstrap não provam IdP corporativo e requests reais.

### C31 — Cobertura e denominador — 59/100

Cobertura global usa thresholds 90/85 e crítico 95 por grupos, com validação numérica dos relatórios. Denominador exclui UI, entrypoints e vários adapters PG; grupos críticos incluem extrações do kernel, mas não toda a superfície pública. Falta união verificável das exclusões aos gates dedicados.

Fontes: `vitest.config.mts:35`; `vitest.config.mts:55`; `scripts/critical-coverage-manifest.json:4`; `scripts/critical-coverage-manifest.json:9`; `scripts/lib/certification-rules.mjs:755`; `scripts/lib/coverage-gate.mjs:83`.

Limitações/gaps: Percentuais/cobertura de branches atuais UNKNOWN; não inferidos de thresholds. Não se presume que exclusão justificada seja bug; requer inventário de denominador e prova por fronteira.

### C32 — Governança de skips e dependências entre workspaces — 65/100

Governança calcula candidateId e consome quatro relatórios, recusando inputs ausentes; policy classifica produção/teste/build/unresolved e workspaces incluem legado de forma explícita. Não demonstrados hashes/casos do catálogo nem conclusão do inventário no snapshot atual.

Fontes: `scripts/skip-inventory.mjs:16`; `scripts/skip-inventory.mjs:21`; `config/workspace-dependency-policy.json:29`; `config/workspace-dependency-policy.json:98`; `scripts/workspace-dependency-audit.mjs:31`; `package.json:6`.

Limitações/gaps: Não executado skip:governance nem audit de dependências. Dependência de teste não é defeito de runtime por inferência; catálogos precisam ser revalidados no candidato.

### C33 — Certificação e vínculo ao candidato — 58/100

Verificador confere candidateId de arquivos, hashes/relatórios e findings vinculados. computeCandidateId não inclui HEAD e o fluxo corrente não compara HEAD vivo aos campos de commit; bytes iguais podem manter candidateId após novo commit. Certificação presente não foi aceita como prova.

Fontes: `scripts/lib/certification-rules.mjs:328`; `scripts/phase10-verify.mjs:1615`; `scripts/phase10-verify.mjs:1649`; `scripts/phase10-verify.mjs:1694`; `scripts/lib/certification-rules.mjs:755`.

Limitações/gaps: Constatação estática; nenhuma adulteração/reprodução executada. certification:verify corrente, imagem/config/digest e negativos externos UNKNOWN.

### C34 — CI remoto, atestação e proteção de branch — 58/100

CI declara 34 gates, Node22/PG, upload imutável e job com OIDC atestando manifesto; contexto runner, hashes, identidade de producer são vinculados. YAML e implementação são fortes controles projetados; execução remota, atestação verificada e branch protection exigem prova externa.

Fontes: `.github/workflows/verify.yml:55`; `.github/workflows/verify.yml:205`; `.github/workflows/verify.yml:228`; `.github/workflows/verify.yml:264`; `scripts/ci-bar-provenance.mjs:32`; `scripts/ci-bar-provenance.mjs:75`.

Limitações/gaps: Rede proibida; nenhuma configuração GitHub, ruleset, check ou attestation consultada. Não declarado que proteção de branch está ausente; seu estado é UNKNOWN.

### C35 — Fluxos, estados de erro e responsividade — 68/100

Console modela loading/error/empty, conflito e ações ocupadas; cliente usa timeout/retry GET e dispara 401 handler. CSS adapta 1180/760px. Composição ainda expõe jornadas/branding Secretary e a continuidade trusted fica incompleta, afetando jornada operacional.

Fontes: `apps/web/src/App.tsx:36`; `apps/web/src/App.tsx:193`; `apps/web/src/api/client.ts:125`; `apps/web/src/styles.css:739`; `apps/web/src/App.tsx:837`; `apps/web/src/App.tsx:960`.

Limitações/gaps: Sem render/browser/screenshots atuais; overflow, responsividade e fluxo real UNKNOWN. Avaliação de UI exclusivamente por fontes; testes existentes não substituem observação.

### C36 — Acessibilidade e teclado — 66/100

Skip link, landmarks, labels, estados role=status e outline focus-visible estão no produto; testes axe WCAG e teclado existem. Isso sustenta intenção de acessibilidade integrada, mas não prova contraste, ordem/foco em mudanças assíncronas ou operação completa com leitor de tela.

Fontes: `apps/web/src/App.tsx:832`; `apps/web/src/App.tsx:954`; `apps/web/src/App.tsx:965`; `apps/web/src/styles.css:91`; `tests/e2e/ux-accessibility.spec.ts:17`; `tests/e2e/ux-accessibility.spec.ts:49`.

Limitações/gaps: Sem axe/teclado/render/leitor de tela nesta lane; conformidade runtime UNKNOWN. Asserts axe filtram serious/critical; não demonstram zero de todas as violações ou todos os fluxos trusted.

### C37 — Login e continuidade da sessão no produto — 38/100

Cliente envia cookies e API lê sessão existente; existe store PG e OIDC/PKCE isolados. Bootstrap trusted exige token antes de GET, main injeta resolver HMAC e telemetria sem compor store/OIDC; reautenticar repete bootstrap em vez de iniciar IdP. Continuidade cookie-only e login produto não fecham.

Fontes: `apps/web/src/auth/session.ts:55`; `apps/web/src/api/client.ts:751`; `apps/api/src/server.ts:770`; `apps/api/src/main.ts:12`; `apps/api/src/server.ts:4474`; `apps/api/src/oidc-login-transaction.ts:59`; `apps/web/src/App.tsx:884`.

Limitações/gaps: Sem IdP corporativo/MFA ou callback de browser observado. APIs de adapter não são login publicado; nenhum runtime histórico usado para provar sessão.

### C38 — Providers, canais e efeitos externos — 45/100

Adapters HTTP de modelo/canal têm SSRF/DNS, limites e fail-closed; journal e approvals organizam efeitos. Worker publicado está controlado/sintético, com provider determinístico e sem efeito externo; não há prova end-to-end de provider/canal escolhido, dedup destino ou kill switch real.

Fontes: `packages/model-gateway/src/providers/openai-compatible.ts:130`; `packages/channel-gateway/src/adapters/chatwoot.ts:78`; `packages/agent-runtime/src/runtime-effect-recovery.ts:130`; `apps/worker/src/kernel-composition.ts:12`; `apps/worker/src/kernel-composition.ts:119`; `apps/worker/src/main.ts:435`.

Limitações/gaps: Nenhuma chamada externa ou dado real; adapters não contam como integração operacional liberada. Escolha de provider/canal/DPA/tenant e capability gate T4 permanecem insumos específicos.

### C39 — Conhecimento institucional e governança de prompts — 46/100

Catalog tenant-scoped tem aprovação/revogação e PromptRegistry verifica status/version/hash. Runtime iterativo recebe resultado knowledge sem tenant/approval explícito e o registra como sucesso; ModelGateway valida referência mas envia request.input não ligado ao conteúdo do prompt aprovado.

Fontes: `packages/platform/src/control-plane-store.ts:532`; `packages/model-gateway/src/prompt-registry.ts:93`; `packages/model-gateway/src/gateway.ts:479`; `packages/model-gateway/src/gateway.ts:313`; `packages/contracts/src/execution-v2.ts:654`; `packages/harness/src/iterative-dispatch.ts:771`; `packages/harness/src/iterative-dispatch.ts:803`.

Limitações/gaps: Sem corpus institucional ou fonte real; nada deste relatório responde RAG. Ausência de enforcement na borda inspecionada; adapters específicos podem restringir, mas isso não garante contrato público reutilizável.

### C40 — Logs, métricas e observabilidade — 58/100

API/worker usam JSONL e CompositeExporter sanitiza antes do sink, com buffer bounded e falhas observáveis. OpenTelemetry encaminha atributos/names diretamente ao SDK, e hash ledger recebe payload sem redaction. Dashboards/alertas/on-call distribuídos não comprovados.

Fontes: `apps/api/src/main.ts:15`; `packages/observability/src/operational.ts:92`; `packages/observability/src/otel.ts:47`; `packages/observability/src/otel.ts:152`; `packages/observability/src/audit-ledger.ts:69`; `packages/agent-runtime/src/runtime.ts:296`.

Limitações/gaps: Sem exporter remoto/tráfego; risco de leak é caminho estático, não vazamento de dado real observado. OTel é adapter exportado, não comprovadamente o sink do main; redaction do JSONL não corrige esse adapter.

### C41 — Performance, capacidade e SLOs — 35/100

Existem budget/deadline/backoff e smoke de carga em memória com percentis; SPEC define SLOs conceituais. Não há workload representativo HTTP+PG+provider, soak, saturação/backlog, HA ou SLO operacional com owner comprovados.

Fontes: `packages/model-gateway/src/gateway.ts:257`; `packages/model-gateway/src/gateway.ts:296`; `scripts/phase10-load.ts:1`; `scripts/phase10-load.ts:30`; `scripts/phase10-load.ts:89`; `docs/02_spec/0113_observabilidade_runtime_e_operacao.md:50`.

Limitações/gaps: Nenhum benchmark executado; latência/throughput/capacidade/SLO atuais UNKNOWN. Smoke em memória não sustenta SLA nem percentil da jornada publicada.

### C42 — Backup, PITR, incidentes e prontidão operacional — 32/100

Snapshot restore preserva digest/audit em memória; há playbook controlado e gate CI PG backup/restore. G09 exige PITR e restore em staging, com RPO/RTO. Não foram encontradas infraestrutura de WAL/PITR ou prova de DR/segredo backup, failover e reexpurgo.

Fontes: `packages/persistence/src/restore.ts:22`; `packages/persistence/src/restore.ts:39`; `scripts/phase10-restore-check.ts:4`; `scripts/phase10-restore-check.ts:75`; `.github/workflows/verify.yml:118`; `docs/08_runtime/incident_playbook.md:5`; `docs/03_build/0354_production_executive_plan_2026-09-26.md:57`.

Limitações/gaps: Não executado restore/PG/drill; resultados atuais UNKNOWN. Backup externo pode existir fora do repo; não demonstrado neste pacote, não se declara ausência universal.

## Achados e remediação concreta

Prioridade P0 nesta lane identifica blocker de release, sem alegação de incidente real. P1 indica lacuna de segurança/integridade/contrato sustentada por código; nenhuma falha foi reproduzida aqui. P2 é dívida de qualificação/cobertura/UX. As prioridades não alteram G03 nem encerram tarefas.

### SD11 — P0 — G06 sem cofre/rotação gerenciados demonstrados

Prioridade P0 de release: há env/keyring/secretRef, mas não adapter operacional de cofre ou evidência de rotação de DB/provider/webhook/identity/rate-limit. Não representa segredo vazado observado.

Evidência: `apps/api/src/operator-identity.ts:243`; `apps/api/src/server.ts:5452`; `.env.example:23`; `docs/03_build/0354_production_executive_plan_2026-09-26.md:51`.

Remediação/aceite futuro: Escolher serviço/IAM/owner após ambiente aprovado, implementar resolução secretRef fora de imagem/arquivo e rotação/revogação por família. Em staging autorizado exercitar overlap bounded, kid antigo revogado, fail-closed do cofre, canário de ausência em logs/imagem e recuperação.

Mapeamento: UP91-029, UP91-034. Gate: T3 para contrato de segredo; T4 cofre/infra/rotação real; G06.

### SD12 — P0 — G08 sem retenção física, direitos e governança aplicada

Prioridade P0 de release: inventário DRAFT/DPO_PENDING e ledger de retenção em memória não eliminam dados PG ou audit. Schema de sessões tem expiry/revocation, sem purge de sessões/famílias; fluxo de direitos do titular não localizado nas fontes de serving.

Evidência: `docs/platform/09-personal-data-inventory.md:3`; `packages/platform/src/retention-ledger.ts:48`; `packages/platform/src/retention-ledger.ts:102`; `packages/persistence/migrations/operator-session/0000_auth.sql:9`; `docs/08_runtime/data_governance_signoff.md:18`.

Remediação/aceite futuro: Obter DP01–06/controlador/DPO/prazos e policy version/hash; implementar jobs mínimos de purge físico/filas/copias e direitos com audit minimizado. Provar TTL distinto de DELETE, corrida de sessão/bootstrap, cascatas, idempotência, autorização tenant/role e reexpurgo após restore sintético; sem dados reais antes de T4.

Mapeamento: UP91-030, UP91-031, UP91-032, UP91-036. Gate: T1 decisões documentais; T3 schema/jobs/direitos; T4 dados reais/staging; G08/G09.

### SD13 — P0 — G09 sem PITR/DR e RPO/RTO do ambiente alvo

Prioridade P0 de release: restore de memória mede integridade local; script explicitamente marca rpoMeasured false. Gate PG da CI é útil, mas não comprova WAL/PITR, topologia HA, acesso ao backup, RTO operacional ou ausência de ressuscitar dados eliminados.

Evidência: `scripts/phase10-restore-check.ts:4`; `scripts/phase10-restore-check.ts:75`; `packages/persistence/src/restore.ts:22`; `.github/workflows/verify.yml:118`; `docs/03_build/0354_production_executive_plan_2026-09-26.md:57`.

Remediação/aceite futuro: Provisionar backup/WAL/PITR criptografado com IAM próprio, prazos e owners definidos. Drill staging deve restaurar até timestamp, verificar schema/RLS/approvals/lease/incerteza/dados eliminados, medir perdas RPO e tempo de recuperação RTO, testar perda de região/credencial e conservar receipts/redigidos.

Mapeamento: UP91-034, UP91-036. Gate: T3 contrato de recovery/schema quando alterado; T4 infraestrutura/DR; G09.

### SD15 — P0 — G04/G11/G12/G13 não têm prova operacional atual nesta lane

Prioridade P0 de release: YAML de CI/atestação e templates não provam gates verdes no mesmo SHA/digest/config, branch protection, pentest externo, piloto concluído ou autorização humana desse candidato. Sem rede e sem execução, esses estados são UNKNOWN/PENDING, nunca PASS.

Evidência: `.github/workflows/verify.yml:228`; `.github/workflows/verify.yml:264`; `scripts/ci-bar-provenance.mjs:32`; `docs/03_build/0354_production_executive_plan_2026-09-26.md:48`; `docs/03_build/0354_production_executive_plan_2026-09-26.md:60`.

Remediação/aceite futuro: Lead deve vincular checks atuais ao snapshot e, depois de correções autorizadas, congelar candidato/config/imagem; obter CI remoto/attestation validada/ruleset, pentest/UAT, decisões específicas de piloto, resultados de piloto e GO humano hash-bound. Rejeitar qualquer fechamento por certificado antigo/fixture/média.

Mapeamento: UP91-035, UP91-045, UP91-046, UP91-047, UP91-048, UP91-049, UP91-050. Gate: T4 em cada capacidade/release; G03 literal/G04/G11/G12/G13.

### SD17 — P0 — G10 e capacidade alvo não têm SLO/alerta/on-call demonstrados

Prioridade P0 de release: JSONL/health locais e buffer bounded são úteis; SPEC traz SLO conceitual, e carga Phase10 usa memória. Não há prova de pipeline remoto, alertas entregues, escalation owner, carga/soak HTTP+PG+provider ou capacidade failover.

Evidência: `apps/api/src/main.ts:15`; `packages/observability/src/operational.ts:92`; `docs/platform/operations-runbook.md:51`; `scripts/phase10-load.ts:30`; `docs/02_spec/0113_observabilidade_runtime_e_operacao.md:50`.

Remediação/aceite futuro: Definir owner/SLO/workload/tenant/custo com consumidor, configurar exporter/dashboards/alertas e drill de incidentes. Medir p95/p99 sob bursts, limites, retry, provider timeout, PG contention, backlog/soak e degradação; alertas devem chegar a responsável e runbook sustentar resposta.

Mapeamento: UP91-037, UP91-038, UP91-008. Gate: T3 para dados/contratos/SLO enforcement; T4 ambiente/exporter/carga real; G10.

### SD01 — P1 — Relógio PostgreSQL do replay não tem high-water durável

Reserve usa clock_timestamp, purge exclui rows expiradas e commit depende do relógio; a proteção monotônica sticky existe apenas no store em memória. Recuo temporal após exclusão/restart pode reabrir janela de assinatura sem memória durável do máximo observado. É risco inferido de código, sem reprodução nesta lane.

Evidência: `apps/api/src/webhook-security.ts:167`; `apps/api/src/webhook-security.ts:224`; `apps/api/src/webhook-security.ts:232`; `apps/api/src/webhook-security.ts:263`; `packages/persistence/src/postgres-migrations.ts:46`.

Remediação/aceite futuro: Concluir SPEC temporal no hash corrente e, após T3 explícito, integrar guard persistido/inbox ao ingress. Provar limites ts±T, regressão PG, restart, concorrência, futuro, takeover e UNKNOWN_COMMIT por HTTP+PG sintéticos; demonstrar que nenhum efeito/2xx sai sem decisão temporal/fence válido.

Mapeamento: UP91-027. Gate: T3 para contrato/migrations/segurança; T4 para serving/capacidade/release; G03/G07.

### SD02 — P1 — Fencing do replay não cerca o COMMIT da mensagem/outbox

Lease generation/token impede commit replay do holder antigo, mas receiveInboundMessage persiste antes de webhookLease.commit e não recebe a reserva. Holder antigo pode escrever inbound após takeover e só depois descobrir que perdeu o replay. Dedup inbound/outbox reduz duplicação; não fecha atomicidade/certeza do protocolo.

Evidência: `apps/api/src/server.ts:1458`; `apps/api/src/server.ts:1521`; `apps/api/src/server.ts:1583`; `apps/api/src/server.ts:1605`; `packages/persistence/src/postgres-inbound.ts:323`.

Remediação/aceite futuro: Integrar inbox com digest/estado/receipt e commitInbound fenced na mesma fronteira transacional pertinente; conservar outcome incerto e reconciler pendente. Injetar crash após COMMIT inbound, após audit e antes/depois de commit replay, takeover concorrente e conflito de conteúdo; verificar HTTP e outbox no vencedor sem presumir dedup externa.

Mapeamento: UP91-027. Gate: T3; T4 antes de efeito externo/release; G03/G07.

### SD03 — P1 — Preflight de rate limit aceita identidade nominal de constraints e índices

Consultas selecionam apenas conname/indexname no schema. Não verificam contype, conrelid, convalidated, definição nem chave/colunas/validade do índice. Objetos de mesmo nome com CHECK(true) ou índice incorreto podem satisfazer o preflight enquanto a semântica exigida diverge.

Evidência: `apps/api/src/tenant-preflight.ts:938`; `apps/api/src/tenant-preflight.ts:945`; `apps/api/src/tenant-preflight.ts:958`; `apps/api/src/server.ts:5340`.

Remediação/aceite futuro: Após SPEC T3, validar OIDs da relação, tipos/defaults/nullability, constraints built-in/validadas e PK/índices íntegros com colunas/predicado corretos. Produzir negativos PG com constraints isca, CHECK(true), NOT VALID, índice inválido/objeto em outra tabela e DML violador; boot deve recusar cada caso.

Mapeamento: UP91-028, UP91-033. Gate: T3 segurança/schema; T4 configuração serving; G03/G07.

### SD04 — P1 — Store durável e OIDC não são compostos pelo entrypoint publicado

main cria resolver de token HMAC local e injeta telemetry; não fornece operatorSessionStore nem OIDC. Em trusted sem store a resolução de identidade lança configuration_error. Componentes PG/OIDC existentes não tornam o login corporativo disponível.

Evidência: `apps/api/src/main.ts:12`; `apps/api/src/main.ts:18`; `apps/api/src/operator-identity.ts:243`; `apps/api/src/server.ts:4474`; `apps/api/src/oidc-login-transaction.ts:59`.

Remediação/aceite futuro: Compor store PG/preflight e OIDC issuer/MFA/roles/tenant aprovados no main/buildServerFromEnv, mantendo erros fechados. Exercitar o processo real com PG e IdP local HTTPS/MFA sintético, múltiplas réplicas, store indisponível, state replay, tenant/role divergente e cookies; staging corporativo só sob T4.

Mapeamento: UP91-025, UP91-026. Gate: T3 contrato/identidade; T4 IdP/ambiente real; G05/G07.

### SD05 — P1 — Rota de troca de sessão ignora replace atômico já disponível

/v1/session faz create, emite Set-Cookie e então revoke da anterior em operações distintas. Crash após create deixa sessão anterior ativa e nova row; rollback best effort pode falhar. A função SQL replace transaciona sob lock da família, mas não é chamada por essa rota.

Evidência: `apps/api/src/server.ts:807`; `apps/api/src/server.ts:819`; `apps/api/src/server.ts:825`; `apps/api/src/operator-session-postgres.ts:118`; `packages/persistence/migrations/operator-session/0000_auth.sql:110`.

Remediação/aceite futuro: Usar replace quando houver sessão anterior, só emitir cookie após confirmação, definir resultado em COMMIT ambíguo sem recuperar autoridade revogada. Testar pelo HTTP+PG crash/create/revoke, replace concorrente, logout concorrente e rollback; sessões incompatíveis/duplas não podem sobreviver ao protocolo aprovado.

Mapeamento: UP91-026. Gate: T3 identidade/atomicidade; T4 qualificação corporativa; G03/G05/G07.

### SD06 — P1 — Console não restaura sessão apenas por cookie nem inicia login OIDC

load exige token e lança 401 antes de getSession; runtime provider consome/apaga o token global. Reload com cookie válido sem novo token não chega ao endpoint que já aceita cookie. Reautenticar chama o mesmo loader. E2E primeBootstrap injeta token via addInitScript, cobrindo composição diferente de cookie-only real.

Evidência: `apps/web/src/auth/session.ts:59`; `apps/web/src/auth/session.ts:81`; `apps/web/src/api/client.ts:751`; `apps/api/src/server.ts:774`; `apps/web/src/App.tsx:884`; `tests/e2e/rem21-014-qualification.spec.ts:46`.

Remediação/aceite futuro: Consultar sessão cookie-only primeiro, iniciar login OIDC quando necessário e manter CSRF/401/expiração/logout seguros. Criar prova browser sem token/initScript após reload, em hosts distintos com cookie real, além de reautenticação, revogação e foco; não usar token fixture como certificado de MFA.

Mapeamento: UP91-025, UP91-043. Gate: T3 sessão/contrato de login; T4 IdP corporativo; G05.

### SD07 — P1 — Adapter OpenTelemetry transmite dados antes de redaction

startSpan envia name e toOtelAttributes cru ao tracer; setAttribute e child enviam valores crus e métricas usam labels crus ao meter. Redaction em fallback/local ocorre tarde para o SDK; toOtelAttributes apenas copia.

Evidência: `packages/observability/src/otel.ts:47`; `packages/observability/src/otel.ts:62`; `packages/observability/src/otel.ts:152`; `packages/observability/src/otel.ts:158`; `packages/observability/src/otel.ts:201`; `packages/observability/src/redaction.ts:61`.

Remediação/aceite futuro: Sanitizar nomes, values, errorCode/status e atributos antes de tracer/meter, com allowlist de labels e cardinalidade bounded. Instrumentar fake SDK que observa bytes brutos e comprovar segredos sintéticos ausentes em root/child/setAttribute/metric/error; manter JSONL equivalente e falhas do exporter observáveis.

Mapeamento: UP91-017. Gate: T3 fronteira de dados/segurança; T4 exporter real; G03/G08/G10.

### SD08 — P1 — Hash do ledger de auditoria não minimiza o payload recebido

Runtime appendAudit repassa actor/action/payload ao HashChainedAuditLedger, cujo append preserva parsed.payload e records retorna referências. O hash permite verificar integridade mas não impede armazenar texto sensível vindo desses campos. Sink público não impõe sanitização prévia.

Evidência: `packages/agent-runtime/src/runtime.ts:296`; `packages/agent-runtime/src/runtime.ts:546`; `packages/observability/src/audit-ledger.ts:69`; `packages/observability/src/audit-ledger.ts:91`.

Remediação/aceite futuro: Definir sanitização antes do primeiro append e hash sobre representação sanitizada, preservando apenas metadata allowlisted e digests necessários. Provar sentinelas secretas em actor/action/reason/objetos nested, tampering detectável e ausência do segredo nos registros/sinks. Separar payload canônico de efeito da representação de auditoria.

Mapeamento: UP91-016. Gate: T3 minimização/contrato de auditoria; T4 dados reais; G03/G08/G10.

### SD09 — P1 — Prompt aprovado não vincula o texto efetivamente enviado ao provider

Gateway resolve promptId/version/hash, mas provider.execute recebe request.input sem comparação/construção a partir do conteúdo aprovado. promptSha256 acompanha a chamada sem atestar o input enviado; referência correta pode coexistir com system diferente.

Evidência: `packages/model-gateway/src/gateway.ts:479`; `packages/model-gateway/src/gateway.ts:313`; `packages/model-gateway/src/prompt-registry.ts:93`.

Remediação/aceite futuro: Definir contrato de render e bind entre bloco aprovado/digest e system/contexto enviados, preservando usuário/dados não confiáveis. Sob T3, negar conteúdo incompatível, prompt draft/revoked/expirado/cross-tenant; fake provider deve registrar payload efetivo e comprovar vínculo, não apenas metadata sha.

Mapeamento: UP91-013, UP91-039. Gate: T3 prompt/contrato/segurança; T4 provider/fonte real; G03/G02.

### SD10 — P1 — Borda genérica de knowledge não exige tenant e autoridade da fonte

KnowledgeSearchRequest não tem tenant obrigatório; results não têm approval/revocation/validity. dispatchKnowledge aceita result.items, registra SUCCEEDED e provenance resumida sem resolver catálogo aprovado por tenant. UNTRUSTED protege contra instrução, mas não prova fonte institucional aprovada.

Evidência: `packages/contracts/src/execution-v2.ts:654`; `packages/contracts/src/execution-v2.ts:671`; `packages/harness/src/iterative-dispatch.ts:771`; `packages/harness/src/iterative-dispatch.ts:803`; `packages/platform/src/control-plane-store.ts:532`.

Remediação/aceite futuro: Após contrato T3 explícito, incluir tenant e referências aprovadas/versionadas com vigência/revogação verificadas antes do uso e do checkpoint resume. Negar fonte ausente, draft, revogada, stale/cross-tenant ou provenance incompleta; testar provider adversarial pelo createOperationalHarness.run e handoff sem fonte.

Mapeamento: UP91-015, UP91-040. Gate: T3 contrato/autoridade; T4 corpus institucional; G03/G02/G08.

### SD14 — P1 — Verificação corrente não confere HEAD vivo aos metadados do certificado

CandidateId deriva só de files/path/hash/size/tracked. phase10-verify recalcula esse ID e valida bundle, mas não lê/compara git HEAD corrente com result.commit/manifest.commit/candidate.git.head. Novo commit com bytes iguais pode ser qualificado com metadados anteriores; inferência estática, não reprodução.

Evidência: `scripts/lib/certification-rules.mjs:328`; `scripts/phase10-verify.mjs:1615`; `scripts/phase10-verify.mjs:1694`.

Remediação/aceite futuro: Após gate T3 da SPEC0157 corrente, conferir SHA completo e exit de Git, igualdade dos quatro metadados e candidate manifest interno; separar historical de current. Negativos: commit vazio/excluded-only após run, SHA inválido/falso/faltante e bundle incoerente. Novo SHA final exige prova própria.

Mapeamento: UP91-045. Gate: T3 segurança do verificador; T4 candidato congelado/certificação; G03/G04.

### SD16 — P2 — Denominador global não demonstra cobertura das exclusões

UI, main e adapters PG ficam fora da unidade; threshold alto não mede essas bordas. Há gates dedicados e grupos críticos atualizados, mas falta união executável entre inventário de arquivos excluídos, casos mínimos e resultados correntes.

Evidência: `vitest.config.mts:55`; `scripts/critical-coverage-manifest.json:5`; `scripts/lib/coverage-gate.mjs:83`; `package.json:15`.

Remediação/aceite futuro: Inventariar included/excluded por risco; ligar cada exclusão a prova comportamental atual e impedir nova exclusão sem aceite. Publicar cobertura core e cobertura por fronteira separadas, negativos de arquivo vazio/ausente e regressões das extrações. Não declarar 90% como cobertura integral.

Mapeamento: UP91-004, UP91-021, UP91-045. Gate: T3 se alterar barra/contrato de gate; T2 para regressões neutras sob SPEC; G04.

### SD18 — P2 — UI/a11y provadas por fixture não cobrem login corporativo e jornada inteira

Fontes contêm labels/foco/responsividade e testes axe/teclado, porém qualification injeta bootstrap e axe filtra serious/critical. Branding/jornadas ainda específicas do legado aparecem no console; sem render atual não há resultado operacional.

Evidência: `apps/web/src/App.tsx:837`; `apps/web/src/App.tsx:960`; `tests/e2e/rem21-014-qualification.spec.ts:46`; `tests/e2e/ux-accessibility.spec.ts:24`; `apps/web/src/styles.css:739`.

Remediação/aceite futuro: Após compor sessão real, qualificar fluxo teclado/login/reload/approval/handoff/conflito/401/erro e leitor de tela, mobile/tablet/desktop e zoom/overflow; registrar todas as violações e adjudicar moderadas. Concluir neutralização sob SPEC/claim mantendo invariantes e comparar artefato renderizado atual.

Mapeamento: UP91-019, UP91-020, UP91-043. Gate: T2 para UI neutra; T3 para contrato/login; T4 UAT/session corporativa; G01/G05.

## Gates de produção 0354

Os 13 gates abaixo são separados da média dos critérios. Notas graduam material disponível; status distingue contradição estática (FAIL), blocker conhecido de composição/prova (BLOCKED) e resultado não observado (UNKNOWN). Nenhum status PASS. Todos devem valer no mesmo digest/configuração, conforme 0354:40.

**G03 literal: Zero itens P0/P1 abertos em 0356.** Não trocar por zero internos, por riscos aceitos ou por subset de backlog.

| Gate | Nota | Status | Condição literal |
| --- | ---: | --- | --- |
| G01 | 35 | FAIL | Nenhum código, configuração ou documento vigente específico do legado fora de `legacy/`; guarda de CI impede regressão. |
| G02 | 50 | UNKNOWN | Capacidades de plataforma liberadas para produção definidas e rastreadas a testes e evidências atuais. |
| G03 | 0 | BLOCKED | Zero itens P0/P1 abertos em 0356. |
| G04 | 35 | UNKNOWN | Todos os gates de CI verdes, sem skips, com Node 22 e PostgreSQL ativos, e `certification:verify` reproduzível em execução limpa. |
| G05 | 30 | BLOCKED | Operadores autenticados por IdP com MFA; RBAC por tenant verificado. |
| G06 | 25 | BLOCKED | Segredos em cofre gerenciado com rotação testada; nenhum segredo em arquivo ou imagem. |
| G07 | 65 | UNKNOWN | RLS obrigatório no boot de produção; roles separadas de migração e aplicação. |
| G08 | 20 | BLOCKED | Inventário de dados pessoais tratados pela plataforma, retenção aplicada e fluxo de direitos do titular disponível para os produtos consumidores. |
| G09 | 20 | BLOCKED | Backup com PITR, RPO/RTO definidos e restore exercitado em staging. |
| G10 | 35 | BLOCKED | Telemetria exportada, dashboards, alertas e SLOs com dono; runbooks de incidente e on-call escalonado. |
| G11 | 0 | UNKNOWN | Pentest externo sem achado crítico/alto aberto. |
| G12 | 0 | UNKNOWN | Piloto com o primeiro produto consumidor concluído com critérios de saída atingidos. |
| G13 | 0 | BLOCKED | Autorização humana registrada com hash do candidato e do escopo. |

### G01 — FAIL — 35/100

Código: API ainda importa/compoe jornadas e console tem Secretary/jornadas. Há isolamento por módulo, mas o literal de ausência fora de legacy não está satisfeito. Prova operacional: CI dessa fronteira não observada.

Fontes: `docs/03_build/0354_production_executive_plan_2026-09-26.md:43`; `apps/api/src/legacy-composition.ts:8`; `apps/web/src/App.tsx:6`; `apps/web/src/App.tsx:837`.

### G02 — UNKNOWN — 50/100

Código: perfis/approvals/runtime e testes existem; composição worker controlada. PRD candidato delimita deltas, não os aprova. Prova operacional: nenhuma matriz de capacidades do digest/config alvo qualificada nesta lane.

Fontes: `docs/03_build/0354_production_executive_plan_2026-09-26.md:45`; `docs/01_prd/0014_up91_platform_prd_reconciliation.md:3`; `apps/worker/src/kernel-composition.ts:119`; `tests/phase4a/public-harness-integration.test.ts:1`.

### G03 — BLOCKED — 0/100

Zero itens P0/P1 abertos em 0356. Literal preservado: não reduzir a zero internos, trocar aberto por risco aceito ou excluir bloqueios externos. Esta lane registra P0 de release e P1 estáticos; não atualiza nem adjudica fechamento do ledger canônico. Prova operacional/fechamento de 0356 não observados; nenhum PASS por média ou aceite implícito.

Fontes: `docs/03_build/0354_production_executive_plan_2026-09-26.md:47`; `docs/07_agents/AGENTS.md:122`; `apps/api/src/server.ts:807`; `apps/api/src/tenant-preflight.ts:938`; `scripts/phase10-verify.mjs:1615`.

### G04 — UNKNOWN — 35/100

Código: job Node22+PG, relatórios, hashes e skip guard presentes, porém HEAD binding incompleto. Prova operacional: checks atuais do Lead não recebidos; nenhum CI remoto ou certificação limpa executado/observado aqui.

Fontes: `docs/03_build/0354_production_executive_plan_2026-09-26.md:48`; `.github/workflows/verify.yml:55`; `scripts/skip-inventory.mjs:16`; `scripts/phase10-verify.mjs:1615`.

### G05 — BLOCKED — 30/100

Código: HMAC trusted resolver, adapter OIDC e PG store isolados; main não compõe OIDC/store; console não restaura cookie-only. Prova operacional: issuer/MFA corporativo, revogação e RBAC no processo publicado UNKNOWN.

Fontes: `docs/03_build/0354_production_executive_plan_2026-09-26.md:50`; `apps/api/src/main.ts:12`; `apps/api/src/server.ts:4474`; `apps/web/src/auth/session.ts:59`.

### G06 — BLOCKED — 25/100

Código: keyring/secretRef/env, sem cofre gerenciado conectado localizado. Prova operacional: IAM, rotação de todas as famílias e ausência em imagem/logs não verificados; placeholders não são segredos reais.

Fontes: `docs/03_build/0354_production_executive_plan_2026-09-26.md:51`; `apps/api/src/operator-identity.ts:243`; `apps/api/src/server.ts:5452`; `.env.example:23`.

### G07 — UNKNOWN — 65/100

Código: boot recusa RLS false e roles inadequadas, policies FORCE RLS semânticas, pool por tenant. Lacuna: serving mantém migrationPool e rate preflight nominal. Prova operacional: roles/catalog PG efetivos e negativos no candidato final não observados.

Fontes: `docs/03_build/0354_production_executive_plan_2026-09-26.md:53`; `apps/api/src/server.ts:5209`; `apps/api/src/server.ts:5292`; `apps/api/src/server.ts:5363`; `apps/api/src/tenant-preflight.ts:490`.

### G08 — BLOCKED — 20/100

Código/documento: inventário técnico draft, política técnica e retention ledger em memória; purge/direitos abrangentes não localizados. Prova operacional: DP/DPO, retenção física/direitos e reexpurgo pós-restore não comprovados.

Fontes: `docs/03_build/0354_production_executive_plan_2026-09-26.md:55`; `docs/platform/09-personal-data-inventory.md:3`; `packages/platform/src/retention-ledger.ts:48`; `docs/08_runtime/data_governance_signoff.md:18`.

### G09 — BLOCKED — 20/100

Código: snapshot em memória e gate de backup/restore PG úteis. Prova operacional: PITR/WAL/DR em staging e RPO/RTO medidos não observados; não equivaler restore em memória a G09.

Fontes: `docs/03_build/0354_production_executive_plan_2026-09-26.md:57`; `scripts/phase10-restore-check.ts:4`; `scripts/phase10-restore-check.ts:75`; `.github/workflows/verify.yml:118`.

### G10 — BLOCKED — 35/100

Código: JSONL e buffers locais, redaction no Composite, OTel com risco antes de SDK; runbook controlado. Prova operacional: entrega de alertas, dashboards, SLO owner/medição, on-call/drill e carga alvo UNKNOWN.

Fontes: `docs/03_build/0354_production_executive_plan_2026-09-26.md:58`; `apps/api/src/main.ts:15`; `packages/observability/src/otel.ts:47`; `docs/platform/operations-runbook.md:51`; `docs/08_runtime/incident_playbook.md:5`.

### G11 — UNKNOWN — 0/100

Código/CI de segurança não é pentest externo. Prova operacional: nenhum relatório externo do SHA/digest/config alvo ou fechamento validado foi fornecido/consultado nesta lane; não afirmar ausência de altos.

Fontes: `docs/03_build/0354_production_executive_plan_2026-09-26.md:60`; `.github/workflows/security.yml:36`.

### G12 — UNKNOWN — 0/100

Código: consumidores sintéticos/exemplos; PRD candidato informa consumidor não selecionado. Prova operacional: piloto com produto definido/resultados/saída não fornecido; fixture não fecha gate.

Fontes: `docs/03_build/0354_production_executive_plan_2026-09-26.md:61`; `docs/01_prd/0014_up91_platform_prd_reconciliation.md:7`; `examples/phase4a/README.md:1`.

### G13 — BLOCKED — 0/100

Código/documentos podem preparar candidato, mas esta auditoria não aprova T3/T4. Prova operacional: decisão humana do candidato/config/escopo alvo não fornecida; pedido renovado e silêncio não transferem hashes anteriores.

Fontes: `docs/03_build/0354_production_executive_plan_2026-09-26.md:63`; `docs/07_agents/AGENTS.md:122`; `docs/01_prd/0014_up91_platform_prd_reconciliation.md:68`.

## Planejamento para o Lead

Sequência por dependência e risco. Planejar/inspecionar não aprova execução sensível. Respeitar holders/claims; cada BUILD de contrato/schema/segurança exige SPEC no hash corrente e revisão explícita T3, cada ambiente/capacidade/release T4 exige seu pacote hash-bound. Gates propostos abaixo são verificações futuras, não resultados.

1. **T1: consolidar e preservar** — UP91-001, UP91-002, UP91-030. Lead integrar este julgamento com checks atuais e demais lanes; registrar discrepância originalHEAD/snapshot; atualizar ledgers/backlogs sob claim próprio. Preservar G03 literal e evidência de falhas, sem renumerar tarefas nem presumir fechamento.

2. **T3: segurança e dados, com hash aprovado** — UP91-013, UP91-015, UP91-016, UP91-017, UP91-025, UP91-026, UP91-027, UP91-028, UP91-031, UP91-032, UP91-033, UP91-045. Recon por paths/holder e SPEC hash atual; revisão explícita humana antes de BUILD quando exigida. Priorizar ingress/clock/fencing, sessão/entrypoint/cookie, sink redaction, prompt/knowledge e preflight semântico. Após cada fatia autorizada, produzir negativos discriminantes pelo caminho público com PG sintético e regressões do blast radius.

3. **T2/T3: evidência local e console** — UP91-004, UP91-019, UP91-020, UP91-021, UP91-043, UP91-044. Mapear denominador a provas por fronteira; qualificar browser corrente com cookie-only e a11y/estados completos; conservar histórico como histórico. Gate T3 se contrato/login/barra mudar; simples refatoração/UI neutra segue T2 com SPEC/gates pertinentes.

4. **T4: ambiente e capacidades reais** — UP91-008, UP91-029, UP91-034, UP91-035, UP91-036, UP91-037, UP91-038, UP91-039, UP91-040, UP91-041, UP91-042. Definir consumidor/tenant/owners/infra/IdP/DPO/retention e escopos provider/canal/fontes; cofre/rotação, PITR/DR, alertas/on-call e carga representativa em staging autorizado. Não inserir dado real ou ativar capacidade por aceites sintéticos.

5. **T4: release, piloto e decisão** — UP91-045, UP91-046, UP91-047, UP91-048, UP91-049, UP91-050. Congelar SHA/digest/config, qualificar checks/CI/atestação/branch protection e independente no candidato; pentest/UAT; pacote GO/NO_GO piloto, resultado piloto, depois decisão de produção controlada hash-bound. Todas as 13 condições de 0354 juntas; G03 literal continua sem waiver implícito.

## Verificações, limites e handoff

Executado: inspeção estática; confirmação de existência/linha de cada fonte citada; hashes das fontes/contrato; comparação de 801 fontes/config/PRD/SPEC contra fingerprint base. Validação documental dos dois artefatos: schema exigido presente, 21 IDs únicos C22–C42, 13 G01–G13, notas inteiras 0–100, G03 literal e nenhum PASS. Isso não é teste do produto.

Não executado/observado: runtime completo, HTTP real, Node22 checks, PG/schema/upgrade, concurrence/crash, browser/axe/keyboard, CI remoto/attestação/ruleset, secret manager, dados/retenção, PITR/DR, SLO/carga/soak, pentest, piloto ou decisão humana corrente. Não usar resultados de testes históricos como prova do runtime.

Maior próximo gap técnico: ligar sessão/store/OIDC e corrigir as fronteiras de ingress/fencing/tempo com prova HTTP+PG no candidato autorizado; em paralelo qualificar minimização antes de sinks e semântica de schema. Maior próximo gap de release: ambiente/owners/retention/cofre/PITR e provas externas dos 13 gates. O Lead deve adjudicar estes achados contra seus checks atuais, integrar o plano/ledgers e solicitar a decisão pertinente somente sobre pacote concreto.

**Fecho: NO_GO mantido. Nenhuma correção de produto, aprovação presumida, push, deploy ou produção liberada.**
