# AUD-0605 — reauditoria AUD-0604 e publicação autorizada — 06/10/2026

- Codex, task `AUD0605-REMEDIATION-PUBLISH-20261006`, AUDIT/T1 documental; candidata216e17c, dois commits recebidos após main5b098a7. [Parecer](04_audit/0605_reauditoria_aud0604_2026-10-06.md), [provas](04_audit/evidence/AUD0605-REMEDIATION-20261006/summary.md). Usuário autoriza auditoria/commit próprio/push normal, sem release.
- Originais F01/F02 fechados no escopo: perda PG antes de COMMIT na imagem503 sem cookie, API/live/ready vivos, antiga200/login novo200; job separado conclui migrations/grants antes do serving sem DDL, recusa URL/auto-migrate. Revisores pools38 testsPASS e job29 funcionaisPASS finais (+ambiente), matriz real catálogo/roles/negativos/idempotência/partial retry; sem novo finding material. Exposição obrigatória a ledgers históricos e erros de harness preservados/declarados.
- Worktree físico Node22.23.2/PG16.15 próprios: suíte360/2.953 PASS com cobertura, PG37/302, zero skips/todos/falhas. SKIP-PG-021 executou com disposable+required; contagem builder2952+1skip é outra configuração. Critical branches≥96,73%, mutation10/10, type/lint/formato/docs/audit0 PASS; imagem própria17721389, smoke22/22 e ampliado28/28 PASS, Gitleaks padrão0 e diff2 zero. Primeira construção web corrigida para --target runtime; erros do runner arquivados sem virar findings.
- Artefatos115 gzip com hashes conferidos, fonte/lock949 sem drift nas duas árvores. Own PG/fixtures/listeners/contêineres/redes removidos, reviewers encerrados. E2E/browser/certify/fullskip/SBOM/licenças/backup novo locais NOT_RUN; base CI37554311033/37554311044 PASS, atual ainda sem runs. Nenhuma implementação, política semanal, proteção concorrente ou deploy alterado; ledgers anteriores preservados.
- Próximo passo: commit explícito de registros próprios e push normal autorizado; confirmar main e CI por SHA, proteção pela frente responsável após CI, provisionamento externo. Produção NO_GO.

# PROD-0373 rodada 5 — AUD-0604 corrigida — 06/10/2026

- Task `PROD-0373-20261006`, Claude Code; `status: DONE_LOCAL / CONDITION_5_PENDING_PUSH`. [Resumo](04_audit/evidence/PROD-0373-20261006/summary.md#rodada-5--aud-0604).
- F01: o `pg` emite `error` no cliente em uso quando a conexão morre e o pg-pool só escuta clientes ociosos; guard novo em `packages/persistence/src/pool-errors.ts` aplicado aos pools de dados, sessão e alerta da API e aos dois pools do worker. Regressão PostgreSQL com os papéis do bootstrap (lock + `pg_terminate_backend` no meio da troca) e controle sem o guard reproduzindo o erro não tratado.
- F02: serving de produção sem credencial DDL (SPEC 0144): recusa `DATABASE_MIGRATION_URL`/`POSTGRES_AUTO_MIGRATE=true`, `assertMigrationOwnerFromCatalog` no lugar das conexões de migração, bootstrap de sessão sem a variável, job `scripts/migrate-job.mjs` copiado para a imagem; smoke passa a migrar pelo job e prova a recusa.
- Verificação: Checkout compartilhado sem mudanças de outros agentes, commit `142a170`: suíte com cobertura 360 arquivos/2.952 PASS (1 skip catalogado SKIP-PG-021, do gate phase4a), PostgreSQL 37/302, cobertura crítica e global, skips, mutação, docs, formato/lint/typecheck PASS; smoke 22/22 e inspeção PASS (gitleaks 0) na imagem `sha256:70d995bd…`.

# AUD-0604 — reauditoria AUD-0603 e publicação autorizada — 06/10/2026

- Codex, task `AUD0604-REMEDIATION-PUBLISH-20261006`, AUDIT/T1 documental; candidato5111ad6 com sete commits recebidos sobre main4aa4d8f. [Parecer](04_audit/0604_reauditoria_aud0603_2026-10-06.md), [evidências](04_audit/evidence/AUD0604-REMEDIATION-20261006/summary.md). Usuário autoriza commit/push normal dos registros próprios e histórico recebido.
- Originais AUD0603-F01/F02 confirmados por rollback/predecessor em composição real quatro roles e imagem. Revisão de contrato79 PASS e matriz PG17 checks PASS; nova prova adversarial da imagem FAIL: conexão de sessão interrompida antes de create/COMMIT encerra API por evento pg não tratado. AUD0604-F01 P1 regressão; AUD0604-F02 P2 herdado, URL DDL exigida contradiz SPEC0144. Não houve efeito externo ou comprometimento demonstrado.
- Suíte359/2.948 e PG37/301 PASS, zero skips; global cobertura91,94/93,05/94,21/87,52; critical branches≥96,73%, mutation10/10, type/lint/formato/docs/audit0 PASS. Canonical smoke18/18 e ampliado23/23 PASS na imagem e3d9d558; cinco checks adicionados provam sessão, ausentes dos18 originais. Scan padrão imagem/diff7 zero; semanal105 histórico não reexecutado nem alterado.
- Scripts/receipts brutos97 compactados/hash conferido; erros instrumentação anteriores preservados separadamente da reprodução final FAIL. Revisor PG bloqueado automaticamente por possível risco de cibersegurança; lead confirmou na própria imagem. Revisor contrato declarou exposição inicial a ledgers históricos. Fonte/lock946 preservados; own PG/smokes/roles/listeners removidos, reviewers encerrados. Sem certify/E2E/novo backup/proteção/deploy; CI atual e ambiente real pendentes, NO_GO.
- Somente relatórios/evidências próprios AUD0603/AUD0604 e novas entradas99/20/30/coordenação serão commitados; trabalho alheio e histórico não reescritos. Recibo de publicação registrado após push.

- Publicação DONE: commit5dad651 e os sete recebidos publicados por push normal; main remoto confirmado. [Recibo](04_audit/evidence/AUD0604-REMEDIATION-20261006/publication.json). Verify/Security inicial em andamento/pendente; follow-up do recibo exclusivamente documental terá CI próprio. F01/F02 novos permanecem OPEN, produção NO_GO.

# PROD-0373 rodada 4 — AUD-0603 corrigida — 06/10/2026

- Task `PROD-0373-20261006`, Claude Code; `status: DONE_LOCAL / CONDITION_5_PENDING_PUSH`. [Resumo](04_audit/evidence/PROD-0373-20261006/summary.md#rodada-4--aud-0603).
- `last_completed_action`: AUD0603-F01 (criação falhando após revogação derrubava a sessão anterior; regressão de `7088342`) e F02 (cookie predecessor deixava a sucessora viva; herdado) corrigidos com troca de identidade atômica no store PostgreSQL e aposentadoria da linhagem do cookie apresentado.
- `verification_state`: worktree isolado: suíte com cobertura 359/2.948 PASS, PostgreSQL 37/301, cobertura crítica, skips, mutação, docs; smoke 18/18 e inspeção PASS na imagem `sha256:4115fad6…`.
- `next_action`: push pelo usuário; Verify/Security no SHA; proteção do `main`; reauditoria. Decisão do usuário pendente sobre a varredura semanal de segredos (105 achados heurísticos, 11 fora das evidências). Ambiente real fora do repositório; `NO_GO` até lá.

# AUD-0603 — reauditoria dos cinco commits da rodada 3 — 06/10/2026

- Task `AUD0603-REMEDIATION-REAUDIT-20261006`, Codex; candidata `9b85d5b4c6c1f4fb7eee4b1bb4c6e67db3f44e04`, base4aa4d8f; [parecer](04_audit/0603_reauditoria_aud0602_2026-10-06.md) e [evidências](04_audit/evidence/AUD0603-REMEDIATION-20261006/summary.md).
- P1 original confirmado corrigido: última leitura async + cancel/deadline dá corpo0, APPROVED/EFFECT_FAILED, retomada1 e replay1. Revogação503 original também corrigida. Dois P2 de sessão: regressão ao perder cookie/sessão se create falha após revoke; família antiga permanece ativa em troca com predecessor. Reviewer e lead PG real/quatro papéis reproduzem.
- Node22.23.2/PG16.15:359 arquivos/2.946 PASS com cobertura; PG37/299; zero falhas/skips. Type/lint/formato/docs/critical/mutation/audit PASS; branches críticos mínimos96,73%, mutation10/10, audit0. Fonte946 inputs sem drift; contador358/2.943 recebido não descreve a medição final atual.
- CI4aa4d8f FAIL confirmado: ANSI→metrics.unit=null e checkout raso/-1→104 achados. Parser em três logs reais e schema passam no novo código; push5commits zero. Schedule completo105 genéricos (94 evidências,11outros), sem triagem universal ou allowlist nova. E2E12/browser15 históricos não certificam candidata; full E2E/certify atuais NOT_RUN.
- Parecer PARTIAL_TWO_P2, produção NO_GO. Propostas ampliadas de certeza/precedência não viraram P2 sem contrato. Revisores encerrados e recursos PG/listeners próprios removidos; arquivos recebidos e entradas anteriores preservados. Sem alteração de código/lock, commit/push, dismissals, proteção ou deploy.

# PROD-0373 rodada 3 — AUD-0602, secret-scan e certificação corrigidos — 06/10/2026

- Task `PROD-0373-20261006`, Claude Code; `status: DONE_LOCAL / CONDITION_5_PENDING_PUSH`. [Resumo](04_audit/evidence/PROD-0373-20261006/summary.md#rodada-3--aud-0602-e-ci-de-4aa4d8f).
- `last_completed_action`: AUD0602-F01 (cancelamento/prazo durante a última leitura da pausa) e F02 (troca de identidade revoga a família anterior antes de emitir cookie) corrigidos. CI de `4aa4d8f`: secret-scan falhava por checkout raso (árvore inteira revarrida) — `fetch-depth: 0`; certificação quebrava com `metrics.unit` nulo porque o resumo do Vitest vem colorido no Actions — parser remove ANSI.
- `verification_state`: worktree isolado do HEAD: suíte com cobertura 358/2.943 PASS, PostgreSQL 37/299, cobertura crítica, skips, mutação, docs, startup do worker; varredura de segredos do intervalo do push: zero; certify local monta o resultado (unit lido do resumo colorido) e o verificador só acusa o E2E visual desta máquina (o E2E passou no CI de `4aa4d8f`).
- `next_action`: push pelo usuário; Verify e Security verdes no SHA; proteção do `main`; reauditoria. Ambiente real de produção continua fora do repositório; `NO_GO` até lá.

# AUD-0602 — reauditoria e publicação autorizada — 06/10/2026

- Codex, task `AUD0602-REMEDIATION-PUBLISH-20261006`; congelado81f01e8,11 commits recebidos; follow-up concorrente8652319 inspecionado separadamente. [Parecer](04_audit/0602_reauditoria_aud0601_2026-10-06.md), [provas](04_audit/evidence/AUD0602-REMEDIATION-20261006/summary.md). Casos originais confirmados; PARTIAL/NO_GO por um P1 de cancelamento/deadline e um P2 herdado de troca de identidade503. Pedido atual autoriza commit/push normal; não concede produção.
- Node22.23.2, own deps/PG16.15:358 arquivos/2.940 PASS com cobertura,37 arquivos/298 PASS PG, zero skips/falhas; type/lint/formato PASS; mutation10/10 killed, audit0; branches críticos≥96,48%, barra95% só branches. Corrigida interpretação da AUD0601: funções channel94,59% são informativas, não causa adicional do Verify anterior. 12 arquivos/119 PASS channel e typecheck no follow-up.
- Smoke reconstruído18/18/API e worker healthy, imagem distroless uid10001/read-only e gitleaks0 no escopo padrão. Backup/rollback0027 PASS, restore cadeia16 eventos PASS/tamper payload+metadado, perfil ausente recusado. PGpausa lead body0/APPROVED→resume1/EXECUTED→replay1; restore de controle21 eventos. HTTPS14inject+3socket e seis cenários cadeia/âncoras PASS.
- Dois revisores independentes: sessão13cenários,10 conformes/três variantes de um P2 +ambiente/cleanup; lead repetiu15registros. Worker35sondas27PASS/8FAIL brutos; dois FAIL suportam P1, seis não promovidos; lead confirma corpo1 após cancel/deadline na leitura final. Liquidação com dependência falha body0 sem replay inseguro; TTL/shutdown não certificados. Rodadas de runner inválidas preservadas e excluídas.
- Apenas artefatos/entradas próprias alterados; registros/implementação/lock preservados, own PG/smokes removidos e revisores encerrados. Fontes antigas sintéticas com falsos positivos foram compactadas byte-exatas e mapeadas; sem alteração de scanner. Commit seletivo publica também AUD0600/AUD0601 pendentes. Sem E2E/certify/SBOM/licenças locais, proteção remota ou deploy; CI final/infraestrutura permanecem pendentes.

- Publicação executada: git push origin HEAD:main exit0, dc4a3cb→d76691c, remoto igual HEAD verificado por ls-remote.12 commits recebidos mais96ff418/d76691c. [Recibo](04_audit/evidence/AUD0602-REMEDIATION-20261006/publication.json); CI observado queued/in_progress, não PASS. Primeiro commit dos artefatos entrou antes de corrigir whitespace de diffs; bytes foram conservados em gzip e staged check passou no follow-up, sem reescrever histórico. Recibo/ledgers finais são documentação subsequente.

# PROD-0373 rodada 2 — Verify publicado e AUD-0601 corrigidos — 06/10/2026

- Task `PROD-0373-20261006`, Claude Code; `status: DONE_LOCAL / CONDITION_5_PENDING_PUSH`. [Resumo](04_audit/evidence/PROD-0373-20261006/summary.md#rodada-2--verify-publicado-e-aud-0601).
- `last_completed_action`: Verify de `dc4a3cb` falhou em cobertura crítica (`channel` 94,85%); gates pulados rodados localmente revelaram catálogo de skips, prova rem21-010 e link de docs desatualizados — todos corrigidos. AUD-0601 (Codex) F01–F07 corrigidos: pausa relida antes do corpo, rotação de sessão na mesma família, cookie limpo só após revogação, healthcheck do worker, heartbeat serializado, verificação estrita de payload com âncoras e perfil explícito da prova de restore. Extra: sonda `/live` da imagem recebia 426 com HTTPS obrigatório.
- `verification_state`: 25 gates locais no worktree isolado do HEAD PASS — suíte 358 arquivos/2.939 PASS, PostgreSQL 37/298 PASS, cobertura crítica ≥ 96,48% por grupo, skips, rem21-010, caos, fases, docs, licenças, SBOM, audit; smoke 18/18 e inspeção PASS na imagem `sha256:a0f647b1…`. E2E/browser/certify só no CI.
- `next_action`: push pelo usuário, Verify/Security verdes no SHA, proteção do `main` com `REM21 CI bar (Node 22)`, `codeql`, `secret-scan`, `supply-chain`; reauditoria. Implantação real (ambiente, segredos, papéis, proxy TLS, backup agendado) continua fora do repositório. Produção `NO_GO` até lá.

# AUD-0601 — auditoria independente da entrega publicada e operação — 06/10/2026

- Codex, task `AUD0601-PRODUCTION-DELIVERY-20261006`; congelado `dc4a3cb`, documentação local `210d8e1`. [Parecer](04_audit/0601_auditoria_entrega_producao_2026-10-06.md) e [provas](04_audit/evidence/AUD0601-PRODUCTION-20261006/summary.md). Entrega parcial; núcleo NO_GO por dois P1 reproduzidos, Verify FAIL e implantação não comprovada.
- Worktree/dependências/PG próprios, Node22.23.2: 358 arquivos/2.925 PASS, PostgreSQL 37 arquivos/296 PASS, zero skips/falhas esperadas; typecheck/lint/formato PASS. Imagem recebida smoke16/16 e reconstruída endurecimento/scan sem achados; restore real passa com NODE_ENV=test, receita sem perfil falha401. Alerta sem URL registra disabled e readiness200, conforme decisão declarada.
- Revisão de sessão: 47 PASS/1 FAIL próprio, PostgreSQL real um teste FAIL com duas asserções contratuais. A→B/logoutA200 deixa B200; revoke indisponível limpa cookie em503 embora sessão continue válida. Revisão worker: 33 sondas,24 PASS/9 FAIL brutos; quatro falhas sustentam pausa/progresso, cinco não promovidas. Lead confirma pausa pós-reserva com PostgreSQL (paused=true, corpo1, EXECUTED) e heartbeat sobreposto soma3 para evento1. Worker funcional fica unhealthy pela sonda API; cadeia payload adulterado retorna valid=true/mismatch1. Primeira instrumentação com assinatura errada preservada como erro do runner, depois corrigida.
- GitHub somente leitura: Security37524247232 PASS e zero high aberto; Verify37524247242 FAIL critical_coverage_below_threshold:channel, funções94,59%/branches94,85%<95%. Mutação/PG/backup/E2E/imagem não recebem PASS nesse run; main dc4a3cb desprotegido, environments/deployments zero. Sem configuração remota, publicação ou deploy.
- Apenas report/evidências próprios e entradas novas de ledgers/coordenação. Registros anteriores, fonte e lock preservados; own PG/smokes removidos, revisores encerrados. Sem certify/E2E/SBOM/licenças locais. Remediações entregues ao owner como backlog, sem implementação concorrente.

# PROD-0373 — AUD-0600 corrigida e barra 0373 executada — 06/10/2026

- Task `PROD-0373-20261006`, Claude Code; `status: DONE_LOCAL / CONDITION_5_PENDING_PUSH`. Pedido do usuário: "avalia as colocações do auditor e faz as correções necessárias para colocar o programa em produção". [Resumo](04_audit/evidence/PROD-0373-20261006/summary.md), [operação](08_runtime/0802_harness_production_operations.md).
- `last_completed_action`: AUD-0600 F01/F02 corrigidos (motivo preservado com `turn/end` perdido; etapa pendente fechada em toda parada terminal, pausa estaciona como `WAITING`, `RUNNING` vira `unknown_effect`). Barra 0373: I6/I7/I12 no `GovernedAgentRuntime` (zero `it.fails`); bootstrap de sessão PostgreSQL em produção (condição 4, assumida do claim GREEN por decisão do usuário); imagem distroless sem shell com API e worker; migração 0027 com heartbeat e interruptor de pausa; monitor de parada com webhook HMAC na API; verificador da cadeia de auditoria a partir do banco; CodeQL sem evidências históricas e #6/#7 dispensados no GitHub.
- `verification_state`: suíte completa 358 arquivos/2.925 PASS, zero falhas, skips ou `it.fails`; PostgreSQL 37 arquivos/296 PASS; typecheck/lint/formato PASS. Smoke da pilha real 16/16 na imagem `sha256:416d227e…`; restore com cadeia íntegra e adulteração detectada; gitleaks na imagem 0 achados; `npm audit` 0.
- `next_action`: push para `origin/main` (bloqueado pela permissão do terminal nesta sessão), CI Verify/Security verdes no mesmo SHA, novo scan CodeQL sem high aberto e proteção do `main`. Limiares/destino reais do alerta: decisão de operação. Produção do núcleo fica `GO_PENDING_CONDITION_5`; nenhum produto liberado.

# AUD-0600 — reauditoria independente dos três commits — 06/10/2026

- Codex, task `AUD0600-REMEDIATION-REAUDIT-20261006`; SHA congelado `5c97b40`, base `d893ea9`. [Parecer](04_audit/0600_reauditoria_remediacao_aud0599_2026-10-06.md) e [provas](04_audit/evidence/AUD0600-REMEDIATION-20261006/summary.md): cenários originais F01/F02 e correções locais de CI/dependência/CodeQL confirmados; aderência integral parcial, dois P2 remanescentes, produção `NO_GO`.
- Worktree/dependências/PG próprios, Node 22.23.2, PostgreSQL obrigatório: suíte completa 352 arquivos/2.844 PASS ordinários + duas falhas esperadas, zero skips; exclusiva PG 35 arquivos/288 PASS. Typecheck, lint, formato, links e audit completo PASS. Bootstrap antes do install exit 0; base falha por zod. Regex comparada em 300 mil entradas + 234 variações; parsers/aliases e negativos da base registrados.
- Revisão independente: 31 cenários (26 PASS/5 FAIL) e dois suplementares FAIL; 12 cenários anteriores PASS pelo lead. Lead confirma cinco casos próprios e reexecuta suplemento: log inteiro indisponível apaga a negação; retomada/cancelamento/conflito/prazo terminaliza checkpoint mantendo etapa aberta. São lacunas preexistentes; não observados corpo nem efeito nesses casos. Artefatos arquivados em texto/logs compactados, fora da coleta geral.
- Somente documentos/evidências próprios alterados; ledgers anteriores preservados. Revisor encerrado, PG próprio removido. Sem implementação, commit, push, E2E, certify ou deploy. GitHub consultado somente leitura: main d893ea9 sem proteção, nenhum run do candidato; fechamento oficial dos alertas depende de novo scan.

# AUD0599-REMEDIATION — correções da AUD-0599 — 06/10/2026

- Task `AUD0599-REMEDIATION-20261006`, Claude Code (owner KERNEL-PLUGINS); `status: DONE_LOCAL`. Pedido do usuário: "faça as correções apontadas nesses relatorios". [Evidência](04_audit/evidence/AUD0599-REMEDIATION-20261006/summary.md).
- `last_completed_action`: AUD0599-F01 (single-pass preserva o motivo após reserva e log perdido) e F02 (iterativo fecha a etapa aberta como FAILED com o código da decisão, também com log saudável quando o checkpoint a abriu), adendo §12 da SPEC 0181; CI sem `zod` antes do install (`scripts/lib/test-log-summaries.mjs`); `source-map-js` 1.2.2 no lockfile; CodeQL ativos #17, #1/#2/#4/#9 e #8 corrigidos com testes.
- `verification_state`: suíte completa com PostgreSQL obrigatório 352 arquivos, 2.844 PASS + 2 falhas esperadas, zero skips; `test:postgres` 288 PASS; typecheck/lint/formato/links PASS; `npm audit` completo 0; sonda do lead AUD-0599 reexecutada, 12 cenários com os dois P2 fechados.
- `next_action`: reauditoria independente de F01/F02; push e CI remoto só com autorização do usuário; decisões pendentes: alertas #6/#7, config CodeQL para evidências históricas, proteção do `main`. Condições 4/7/8/9 e parte B continuam abertas. Produção `NO_GO`.

# AUD-0599 — entrega Fable auditada e publicação autorizada — 06/10/2026

- Task `AUD0599-FABLE-DELIVERY-20261006`, Codex; `status: COMPLETED_AUDIT_AND_PUBLICATION`. Auditoria [AUD-0599](04_audit/0599_auditoria_entrega_fable_2026-10-06.md) concluída; aceite integral da parte A `REJECT_TWO_P2`; produção `NO_GO`.
- `last_completed_action`: oito arquivos recebidos revisados; sete byte-exatos e somente Prettier no teste de retomada. Dois handbacks Opus recuperados e arquivados; parte B sem entrega. R01–R03 fechados nos cenários verificados; R04 parcial e fechamento de etapa com falha de log abertos. Hume revisou 12 cenários próprios, reproduzidos pelo lead; porta release com PostgreSQL real passou dois cenários adicionais, sem alegação de pausa/crash integral com PostgreSQL.
- `verification_state`: 349 arquivos; 2.830 PASS ordinários + 2 falhas esperadas do worker, zero skips; PostgreSQL 35 arquivos/288 PASS, zero skips; foco 109 PASS ordinários + 2 falhas esperadas, sondas anteriores 8+5 PASS; 31 regressões PASS; catálogo/manifests 4 PASS; typecheck/lint/formato PASS. Gitleaks da entrega/evidências zero achados; npm audit produção zero e audit completo high em source-map-js de desenvolvimento. Primeiro FAIL geral por sonda temporária no workspace preservado e não imputado à entrega.
- `publication_state`: entrega `28ffc26` e sete commits anteriores publicados por fast-forward em `origin/main`, confirmado por ls-remote. [Recibo](04_audit/evidence/AUD0599-FABLE-20261006/publication.json). PostgreSQL próprio removido e revisor encerrado; nenhum deploy. Verify do SHA publicado falhou por zod antes de install (run 37502885930); Security em execução na captura, sem aceite remoto.
- `next_action`: owner KERNEL-PLUGINS remediar AUD0599-F01/F02 e repetir as sondas no próximo candidato. Bootstrap, parte B e demais condições 0373 continuam pendentes; registros anteriores permanecem históricos e byte-exatos.

# SYNC-20261006 — pendências auditadas e commitadas — 06/10/2026

- Claude Code, pedido do usuário: "verifica o que tem mais de código não commitado, faz uma auditoria e sincroniza tudo". As 174 pendências do checkout compartilhado foram auditadas num worktree isolado idêntico: typecheck, lint, links/higiene, build do produto e Prettier PASS; suíte completa 2.810 PASS + 2 falhas esperadas (`GovernedAgentRuntime` I6/I7), com 1 arquivo (`test-suite-catalog`) sem rodar por timeout de worker na máquina sobrecarregada; `boundary:products` 0 violações e `INCOMPLETE` por diagnósticos já conhecidos do HISO-005. Varredura gitleaks local: 105 falsos positivos (hashes, marcadores sintéticos), nenhum segredo.
- Commits: `25881f3` extração do produto, `4950a27` extração do `agent-runtime` (Codex), `adb9679` correção AUD-0589, `347a622` documentação/evidência, mais este de ledgers. Ficaram de fora, por pedido da sessão Fable (`cvg-operational-harness-c6`), os arquivos da remediação AUD-0598 em andamento.
- `next_action`: rodar `test:postgres` e o `test-suite-catalog` quando a máquina sair da sobrecarga (load ~650, 53 contêineres de outros projetos) e só então dar push para `origin/main`.

# AUD0598 — reauditoria de 2356a25 — 06/10/2026

- Task `AUD0598-KPLG004-REAUDIT-20261006`, Codex, auditoria documental `COMPLETED`. Pedido atual: reauditar a entrega em `2356a25`; barra I5/I6/I8/I12 e recovery da SPEC 0181 mantida. [AUD-0598](04_audit/0598_reauditoria_kplg004_2026-10-06.md) e evidências arquivadas, código compartilhado somente leitura.
- Resultado `REJECT` integral: R01 P1 (pausa após reserva torna aprovação FAILED e resume INTERNAL_FAILURE), R02 P1 (retomada após aprovação pendente retorna MAX_TOOL_CALLS), R03 P2 (checkpoint rejeitado deixa tool/call sem resultado), R04 P2 (erro ao registrar chamada negada retorna POLICY_DENIED). Oito reproduções anteriores passam sem mudanças, hash preservado; mocks não equivalem ao adaptador durável.
- Verificação isolada Node 22/PostgreSQL 16 sintético: 2733 PASS + 2 falhas esperadas do worker, zero skips; PostgreSQL 288 PASS; typecheck/lint PASS; oito sondas originais e 13 regressões PASS; cinco sondas adicionais: 1 PASS/4 FAIL. As duas falhas esperadas não são conformidade atendida. Sondas adicionais usam adaptador/máquina de estados reais com store de memória; PG separado. A tentativa intermediária cujo callback não disparou foi corrigida e preservada como diagnóstico, sem achado de produto.
- Revisão independente Aquinas `REJECT`, dois P1/dois P2; agente read-only encerrado. Banco descartável próprio removido após as verificações. Relatório/ledgers próprios preparados para commit seletivo local; sem push, certify, E2E, SBOM, licenças ou deploy. `last_completed_action`: relatório, quatro cartões e evidências; `next_action`: remediação owner KERNEL-PLUGINS e reauditoria no SHA final.

# AUD-KPLG004 — auditoria de ee7b3f9 — 06/10/2026

- Task `AUD-KPLG004-20261006`, Codex, `COMPLETED` para a auditoria documental. Pedido do usuário: auditar `ee7b3f9`, commit e push para `ricardoakinaga-dev/cvg-operational-harness`. Relatório [AUD-0597](04_audit/0597_auditoria_kplg004_2026-10-06.md) e manifesto de evidências arquivados; nenhum código do produto ou alterações concorrentes incluídos nos artefatos próprios.
- Resultado: cinco P1 e um P2; oito sondas 1 PASS/7 FAIL; dois testes diferenciais passam em `b62f726` e falham no candidato. Crítico read-only Planck confirmou a regressão de resultado após guarda e preservação do ordering checkpoint/reserva; Node 24 no crítico, duas regressões reexecutadas pelo lead em Node 22.
- Verificação final no SHA: 2711 testes PASS + 2 falhas esperadas de conformidade, zero skips; PostgreSQL 288 PASS; typecheck/lint PASS. A primeira suíte falhou em quatro testes porque a cópia comparativa própria ficou dentro do worktree e causou `git ENOBUFS`; movida para fora, reteste 4 PASS e suíte completa final PASS. Primeira falha e correção do contexto preservadas, sem mudar o código.
- Artefatos preparados para commit seletivo e push normal autorizado a `refs/heads/main`; o branch local observado é `aud0578-remediation-20260926`, não `main`. Destino remoto confirmado e ancestral; 423 commits anteriores à auditoria ainda não estavam em `origin/main`. Nenhum force, deploy ou release. Produção `NO_GO`.
- `last_completed_action`: auditoria, evidências e seis cartões F01–F06; `next_action`: remediação coordenada sob SPEC 0181 e reauditoria, sem fechar a parte A pelo verde da suíte existente.

# KERNEL-PLUGINS — auditoria do motor e direção de kernel de plugins — 06/10/2026

- Task `KERNEL-PLUGINS-20261006` (Claude Code); `status: IN_PROGRESS`. Usuário definiu: o produto é o Operational Harness; o Assistente de Plantão existe para validá-lo; o motor serve agentes hospitalares semiautônomos (tudo menos diagnóstico e prescrição); linha de referência DeepSeek Harness (cópia local `~/deepseek-harness`). Medido: motor 31/520 PASS, assistente 2/37 PASS, typecheck PASS, `npm audit` 0. Correções ENG-001–018 já commitadas em `73669b8`. Produção `NO_GO`.
- `last_completed_action`: remediação da [AUD-0597](04_audit/0597_auditoria_kplg004_2026-10-06.md) (Codex): F01–F06 e recontagem na retomada corrigidos sem mudar contrato; sondas originais 8/8 (antes 1/7), 13 regressões novas, suíte 2.732 PASS, PostgreSQL 288 PASS, typecheck/lint PASS ([evidência](04_audit/evidence/KERNEL-PLUGINS-20261006/baseline-and-conformance.md)). `next_action`: reauditoria independente da remediação; KPLG-004 parte B aguarda o commit da extração do Codex em `packages/agent-runtime`.

# HARNESS-ISO-GREEN — checkpoint 62 — 05/10/2026

- Task `HARNESS_ISO_GREEN_20261004`; `status: IN_PROGRESS`. R56 certificação terminou FAIL_ENOSPC: 5792/414 unit PASS zero skip; coverage/PG/E2E sem certificação válida. R58 e R61 REJECT por integridade de backup retido e restart pós-truncamento; R63 corrigido isoladamente, R65 payload aguardando freeze. R64 REJECT reproduziu falso PASS module-sync; R70 recusa contexto não comprovado e passou 89/2 focados zero skip, types/lint/sintaxe/formato; crítico R72 novo ativo. R66 cópia8354 exata+overlayR63+deps17394/48 preparada sem promoção. R50 gates locais/neutral finite aceitos parcialmente, N2 histórico INCOMPLETE; sem herdar inventário global. Liberadas apenas dependências próprias inativas R69/R71 com source/lock MATCH. GLOBAL FAIL, produção NO_GO, só HISO001 DONE; NO_MODEL e nenhum provider/push/dado real.
- `last_completed_action`: R70 89 testes focados PASS, R72 crítico novo ativo; R64 REJECT preservado e recursos próprios liberados. `next_action`: concluir R65 freeze/R72 e integrar R66; certificar novamente com PostgreSQL/E2E e críticos novos; promoção/T4 separados.
- [Evidência do checkpoint](04_audit/evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-62-module-sync-and-storage-continuation.json).

# AP-LOCAL-20261001 — execução local solicitada pelo usuário — 01/10/2026

Executada a demo da entrega `d46ab74` em Node 22, exit 0. Iniciado sandbox persistente com a composição real do assistente e simuladores HTTP existentes, sem alterar produto. Console temporário em http://127.0.0.1:3401 aberto pelo navegador; dez verificações PASS: ajuda, áudio/nota/exames, confirmação, texto/pendências, lembrete, conclusão, adiamento, pausa/retomada, listagem e tela móvel. Health saudável; processo permanece disponível.

Helpers, documentos, logs, PID, evidências e comandos de parada/reinício no [handoff local](08_runtime/handoffs/ap_local_20261001.md). Somente dados fictícios e loopback; sem integração real, Docker, instalação, lockfile, certify, commit ou push.

# PR301-WEBHOOK-CLOCK-GUARD — I11 aceita; decisão humana T3 pendente — 28/09/2026

- A revisão independente fresh-context I11 verificou o SHA-256 exato `c33410876ef204faa655e41c663630bed127a9d9df274c50fd9427f86a07e53e` antes de ler a SPEC e retornou `ACCEPT`, sem findings. Parecer em [I11-review](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I11-review.md).
- Estado `INDEPENDENT_SPEC_ACCEPTED / HUMAN_T3_REVIEW_PENDING / BUILD_NOT_AUTHORIZED / NO_GO`. O usuário exigiu nova crítica antes do BUILD; esse gate foi satisfeito. Falta aprovação humana T3 específica da SPEC 0162; sem migration 0028, código, SQL, testes comportamentais, BUILD, push ou deploy. Produção segue `NO_GO`.

# PR301-WEBHOOK-CLOCK-GUARD — resposta documental I10 — 28/09/2026

- I10 fresh-context verificou o SHA `9a262565656c935aa8217a094bbdef7a05ba1a74ecf289ff90d1ae681a938ed9` e retornou `REVISE` (5 P1/2 P2). Resposta documental atualizou a SPEC 0162 para `c33410876ef204faa655e41c663630bed127a9d9df274c50fd9427f86a07e53e`: ACL única via SECURITY DEFINER; formato UTC de microssegundos; assinatura HMAC/raw-body conforme 0160; protocolo de reconciliação; bound chrony/PG; rotação de attest; leases de serving por instância/boot. Evidência em [I10](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I10-review.md) e [resposta](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I10-response.md).
- Estado `I10_REVISE_RESPONDED / I11_REQUIRED / HUMAN_T3_REVIEW_NOT_REQUESTED / BUILD_NOT_AUTHORIZED / NO_GO`. O usuário exigiu nova crítica independente antes do BUILD. Prettier direcionado, links/higiene e diff PASS; `format:check` global aponta somente o arquivo não reivindicado AUD-0590, que não foi alterado. Sem migration, código, testes comportamentais, SQL, BUILD, push ou deploy. B3, D-06, integração root/CI/staging e produção seguem abertos.

# PR301-WEBHOOK-CLOCK-GUARD — resposta documental I9 — 28/09/2026

- I9 fresh-context verificou o SHA 433c46bb7fe0c66c1b2926ed8592cca023209b3374439af8de5d603b04fae40a e retornou REVISE (3 P1, sem P0): conflito statement_timestamp/sample, bootstrap baseline em retry/crash e readiness antes de RECOVERY_REBASE. A [resposta](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I9-response.md) produziu o candidato 9a262565656c935aa8217a094bbdef7a05ba1a74ecf289ff90d1ae681a938ed9, com attestation one-use do receipt exato, baseline/revisões consistentes e sequência RECOVERY_REBASE/readback/GATE_OPEN. Nenhum código, SQL, migration 0028, teste comportamental ou BUILD. I10 fresh-context read-only está em andamento; aprovação humana T3 segue pendente e produção NO_GO. [I9](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I9-review.md), [SPEC](02_spec/0162_webhook_clock_highwater_marker.md), [prova](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/proof.json).

# PR301-WEBHOOK-CLOCK-GUARD — resposta documental ao I8 — 28/09/2026

- I8 fresh-context verificou `08892d7328ce6a7ce45943f5316f3e9de270fe21b11aeb18a55934469e520646` e retornou `REVISE` sem P0 (2 P1/1 P2). A resposta está na [matriz I8](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I8-response.md); o novo candidato 0162 tem SHA-256 `433c46bb7fe0c66c1b2926ed8592cca023209b3374439af8de5d603b04fae40a` e I9 read-only está em andamento antes de revisão humana T3. [I8](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I8-review.md), [prova](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/proof.json). Nenhuma migration/código/BUILD 0028; produção `NO_GO`.

# AUD-0589 — fronteira de sessão e probes públicas — 28/09/2026

- No root `eff8e0d`, a sonda Fastify registrou 61 templates/108 pares; 98 pares protegidos responderam 401 nos três cenários negativos, com três controles de cookie válido em 200. Um cookie inexistente causava 401 nas oito probes GET/HEAD públicas; patch em `operator-session-hook.ts` e teste cobrindo `/health`, `/health/metrics`, `/live` e `/ready` corrigem isso sem alterar `server.ts` da PR-L04. Suíte root 307 arquivos/2.241 testes PASS, 20/162 PG skipped; foco 27/27, typecheck/lint/formato/links PASS. Duas tentativas de crítica independente não retornaram veredito; escopo local `CONDITIONAL`, produção `NO_GO`. [Relatório](04_audit/0589_root_session_route_boundary_2026-09-28.md), [prova](04_audit/evidence/AUD0589-ROOT-SESSION-ROUTES-20260928/proof.json).
- Suplemento `AUD-0589-PG`: no worktree isolado do HEAD `eff8e0d` com o patch AUD-0589 byte-matched, Node 22.23.2 + PostgreSQL descartável passaram 326/2.401 testes sem skips; barra PG 35/258, sessão 18/18, Phase4A 1/1, foco 27/27, typecheck/lint PASS. Ambiente removido. O teste persistido não compõe o entrypoint root, que segue no claim PR-L04. [Verificação](04_audit/evidence/AUD0589-ROOT-SESSION-ROUTES-20260928/pg-20260928/verification.md).

# AUD-0588 — cobertura HTTP das rotas de execução — 28/09/2026

- Claim registrado antes das alterações. Scanner estático sobre `server.ts` encontrou 60 paths literais e 3 paths de health por constante; 61/63 tinham referências de teste antes desta fatia. Os dois sem referência eram input e trajectory.
- Adicionados testes sintéticos: retomada de execução WAITING_USER, isolamento tenant com 404 e estado inalterado, trajetória limitada a metadados com igualdade estrita da etapa e sem `observationRefs`. Scanner reproduzível encontra 63/63 referências estáticas após a mudança.
- Testes focados 2/2, suíte root 306/2.233 PASS com 20/162 skipped sem PostgreSQL; typecheck, ESLint, Prettier, `format:check`, links/hygiene PASS. A suíte root começou antes da asserção estrita; o teste focado foi repetido na versão final. I1 foi respondido limitando o scanner a referências estáticas; I2 `ACCEPT_SCOPE` e o pedido de igualdade estrita foi resolvido e retestado. Evidências hash-bound em [AUD-0588](04_audit/0588_execution_route_coverage_2026-09-28.md). `server.ts` não foi alterado; sem PostgreSQL, IdP, dado real, push ou deploy. Produção `NO_GO`.

# PR301-WEBHOOK-CLOCK-GUARD — resposta à crítica I6 — 28/09/2026

- A crítica fresh-context I6 revisou o hash `215f5146eec6ecac8b07c9561f34487e1a33da5e030965c83af6b9ab4d6bc4a3` e retornou `REVISE` (4 P1/2 P2, sem P0): exceção autorizada do trigger para break-glass, identidade única da standby, testemunha monotônica para latest ledger head, caminho de restart primário sem `pg_last_wal_replay_lsn`, fence WAL por COMMIT e ordem do receipt PREPARED.
- A resposta documental cobre os seis achados; candidato formatado SHA-256 `ee949d17daa04241131bae402bd49f5c28e61f4dcda38a5e81b772d2d497bc8e`. Duas tentativas independentes I7 não retornaram parecer; sentinel confirmou ausência de mutação durante as leituras. Formato e links/higiene finais passaram, mas SPEC continua sem aceitação, revisão humana ou BUILD 0028.
- O gate do código webhook segue `I2_REVISE` (3 P1), sem alteração de `server.ts` por claim ativo PR-L04. Dados sintéticos, nenhum deploy/push; produção `NO_GO`.

# PR301-WEBHOOK-REPLAY-FIX — fechamento da rodada local — 28/09/2026

- Commit isolado `aad04d9ace6ed5b6d9c9902f4ddcad67b87a4abc` contém apenas cinco arquivos do claim de precisão/preflight/testes; não foi integrado nem enviado.
- Suíte completa com PostgreSQL 341/2.594, `test:postgres` 36/273, typecheck, lint, build web sintético e teste de fencing em dois processos passaram, sem skips. Crítica I2 mantém três P1; veja [verificação](04_audit/evidence/PR301-WEBHOOK-REPLAY-FIX-20260928/verification.md) e [parecer](04_audit/evidence/PR301-WEBHOOK-REPLAY-FIX-20260928/I2-independent-review.md).
- Container PG16 descartável e porta 55499 foram removidos/liberados. Sem mudança em `server.ts`, migration 0028, produção, push ou deploy.

# PR301-WEBHOOK-REPLAY-FIX — rodada de verificação e crítica I2 — 28/09/2026

- No worktree `/tmp/cvg-pr301-webhook-replay-20260928`, a suíte PostgreSQL passou 36 arquivos/273 testes e a suíte completa com PostgreSQL obrigatório passou 341 arquivos/2.594 testes, ambos sem skips. Logs preservados em [full-suite.log](04_audit/evidence/PR301-WEBHOOK-REPLAY-FIX-20260928/full-suite.log) e [postgres-suite.log](04_audit/evidence/PR301-WEBHOOK-REPLAY-FIX-20260928/postgres-suite.log). Typecheck, lint integral e build web de produção com origins HTTPS sintéticos passaram; digest do build `d972d26245690a3bece1970db670888b40813c44df4f67cdf8c4e5fec53e5b7f`. Vite mostrou aviso de externalização de `node:dns/promises`; bundle web inspecionado sem referência DNS/SSRF.
- A revisão independente I2 aceitou as correções de precisão, hash completo do trigger, RLS/preflight e corrida de lease em processos distintos, mas retornou `REVISE` com três P1: high-water durável; reconciliador interno de pending após expiração HTTP; e resolução de COMMIT final incerto. `server.ts` segue reivindicado por PR-L04; o primeiro item depende da SPEC 0162/0028 ainda sem autorização.
- A [decisão de fronteira B3/UNKNOWN_COMMIT](04_audit/evidence/PR301-WEBHOOK-REPLAY-FIX-20260928/recovery-boundary-decision.md) registra que o reconciliador deve compartilhar o mesmo serviço/finalizador transacional da rota; worker paralelo duplicaria a regra. Nenhuma implementação foi iniciada enquanto `server.ts` segue no claim PR-L04.
- A SPEC 0162 recebeu resposta à crítica I5 no hash `215f5146eec6ecac8b07c9561f34487e1a33da5e030965c83af6b9ab4d6bc4a3`; I6 fresh-context está em andamento. PostgreSQL 16.15 descartável permanece ativo até os gates documentais finais. Sem dados/credenciais/provider reais, integração, push ou deploy. Produção `NO_GO`. [Verificação](04_audit/evidence/PR301-WEBHOOK-REPLAY-FIX-20260928/verification.md), [I2](04_audit/evidence/PR301-WEBHOOK-REPLAY-FIX-20260928/I2-independent-review.md), [resposta I5](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I5-response.md).

# PR-301-WEBHOOK — correções focadas e crítica I4 — 28/09/2026

- No worktree isolado aprovado pelas SPECs 0160/0161, corrigi a rejeição de amostras PostgreSQL com precisão submilissegundo e o preflight agora compara SHA-256 da função completa de trigger, com regressão que mantém comentários enganosos. Node 22.23.2: inbox PostgreSQL 16 descartável 6/6; preflight/trigger enfraquecido 1/1; typecheck, ESLint dos quatro arquivos e Node version preflight PASS. `format:check`, links/higiene e `git diff --check` PASS. Container removido e ausência confirmada.
- I4 fresh-context da SPEC 0162 retornou `REVISE` (2 P1/2 P2): avanço high-water não estava persistido com a decisão; reserva e efeitos inbound conflitaram; faltavam gates de continuidade em failover/restore e identidades/trust root verificáveis. O candidato `fed7a46bce4dfcfd8fc97d63cc2655340e52b839d9b0e76cdbc1f274b993f822` responde com high-water+reserva/receipt no mesmo COMMIT, finalização em outra transação, failover fail-closed e identities/sink autenticados. Checks e I5 pendentes; [I4](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I4-review.md).
- Primeiro I1 do patch foi `BLOCKED` porque o crítico abriu checkout errado; um novo I1 com caminho absoluto do worktree `/tmp/cvg-pr301-webhook-replay-20260928` está pendente. As alterações isoladas não foram integradas nem publicadas. Sem banco/dados/provider real, push ou deploy; produção `NO_GO`.

# PR-301-WEBHOOK-CLOCK-GUARD — revisão I3 e reparo documental SPEC 0162 — 28/09/2026

- I1 da SPEC 0162 deu `REVISE` (4 P1/1 P2), I2 `REVISE` (3 P1/2 P2), I3 `REVISE` (5 P1/1 P2), e I4 `REVISE` (2 P1/2 P2). I4 exigiu persistir sample/high-water com reserve/receipt antes do comando, separar a transação final fenced, tratar failover/restore com continuidade comprovada e ancorar identidade/export fora do banco. O candidato responde; links/formato/higiene e crítica I5 pendentes. Sem aprovação T3/BUILD 0028. [SPEC 0162](02_spec/0162_webhook_clock_highwater_marker.md), [I1](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I1-review.md), [I2](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I2-review.md), [I3](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I3-review.md), [I4](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/I4-review.md), [prova](04_audit/evidence/PR301-WEBHOOK-CLOCK-SPEC-20260928/proof.json).

# PR-301-WEBHOOK-REPLAY-SCHEMA — BUILD local SPEC 0161 — 28/09/2026

- A migration aditiva 0027 e o inbox tenant-scoped cifrado foram concluídos no commit isolado `737e9c1` após aprovação T3 sintética. [Prova e limites](04_audit/evidence/PR301-WEBHOOK-REPLAY-BUILD-20260928/report.md): suíte Node 22/PostgreSQL 16 com 341 arquivos/2.592 testes sem skips, E2E 12/12 e gate crítico RLS 96,09% PASS. Nenhum banco/dado/canal real; PostgreSQL descartável removido.

# PR-301-WEBHOOK-REPLAY — BUILD sintético T3 — 28/09/2026

- O commit `737e9c17b5246ab623ff9e7bdcf33a16f9ba0844` corrige e testa validade de replay, reserva tenant-scoped, cifragem AES-GCM, fencing de lease, transação inbound/outbox/auditoria e comparação do relógio com decisão no PostgreSQL. Cobertura crítica PASS; inbox próprio está em 72,79% de branches. O BUILD não completa a SPEC 0160: faltam marcador durável de relógio, reconciliador interno de pendências e contrato de retenção/provedor; crítica independente indisponível. [Prova](04_audit/evidence/PR301-WEBHOOK-REPLAY-BUILD-20260928/proof.json). Root/CI/atestação/staging não integrados; produção `NO_GO`.

# AUD-0587 — HMAC/replay do webhook — 28/09/2026

- [16/16 testes](04_audit/evidence/AUD0587-WEBHOOK-20260928/vitest-pg.log) e [sete casos HTTP](04_audit/evidence/AUD0587-WEBHOOK-20260928/http-probe.json) passaram no candidato isolado `7ef74e7`, Node 22/PostgreSQL 16. Crítica [I1](04_audit/evidence/AUD0587-WEBHOOK-20260928/I1-review.md) encontrou dois P1 não cobertos: replay de assinatura futura após expiração do registro e takeover de lease após 30 s. [Negativos executados](04_audit/evidence/AUD0587-WEBHOOK-20260928/proof.json) confirmaram aceitação repetida e duas requisições no resolver, segunda 200/primeira 500; sem efeito externo duplicado demonstrado. PG próprio limpo, contêiner/porta removidos. Task PR-301-WEBHOOK-REPLAY registrada no 0356; SPEC T3 e aprovação humana antes do código. Produção `NO_GO`.

# PR-011-CODEQL — contrato T3 em revisão — 28/09/2026

- [SPEC 0159](02_spec/0159_codeql_active_source_remediation.md) proposta a partir de AUD-0585/0586: auditor de alias fail-closed, custo linear em quatro URLs e filtro de instrução, provas de rate limit autenticado/PG e disposição dos sete arquivos históricos. Sem código, deploy, push ou alertas remotos alterados. [I1/I2](04_audit/evidence/PR011-CODEQL-SPEC-20260928/I1-I2-review.md) corrigiu 2 P1/3 P2 e aceitou a SPEC para revisão humana; aprovação T3 pendente, produção `NO_GO`.

# AUD-0586 — triagem CodeQL high — 28/09/2026

- [Relatório](04_audit/0586_codeql_alert_triage_2026-09-28.md) e [evidências](04_audit/evidence/AUD0586-CODEQL-20260928/alerts.json): 15 alertas abertos no `main` remoto, sete em snapshots históricos e oito em paths ativos. Auditor de aliases retornou PASS para target de dois `*`, enquanto TypeScript deu TS5062; regex sintética sem match mostrou custo crescente; publish/rollback devolveram 429 no 301º POST via hook global, sem sessão/handler funcional. Críticos independentes revisaram fluxos de regex e rate limit em leitura. Triagem não fecha alertas nem prova exploit; PR-011-CODEQL precisa SPEC T3 e CI no SHA final. Produção `NO_GO`.

# AUD-0585 — CI remoto e barra de release — 28/09/2026

- Consulta `gh` em leitura capturou [prova](04_audit/evidence/AUD0585-REMOTE-CI-20260928/proof.json) de `main` `02f586b`, PR #1 draft `8ee6fa2`, root local `f53dd1c` e isolado certificado `7ef74e7`. Verify `36309111340` e Security `36309111343` concluíram com sucesso no PR antigo, porém o check CodeQL `108591838851` falhou com um high em `scripts/workspace-dependency-audit.mjs:921`; o SHA do `main` tem `secret-scan` failure. Branch protection `404`, rulesets `[]` e 15 alertas high abertos no `main` remoto. [AUD-0585](04_audit/0585_remote_ci_release_bar_2026-09-28.md) registra limites e ações; sem push/deploy/teste real, produção `NO_GO`.

# AUD-0584 — RBAC de `/v1/admin` — 28/09/2026

- No SHA isolado `7ef74e7`, Node 22/servidor OIDC local e sessões sintéticas pré-criadas, [sonda](04_audit/evidence/AUD0584-ADMIN-RBAC-20260928/summary.json) percorreu 48 pares admin com role `Operator`: 45×403 e 3×400 em `GET`/`HEAD` capability approval e `POST execute` após permissões que a matriz concede. Controle funcional: `Supervisor` emitiu approval, `Operator` executou a ferramenta controlada uma vez (200) e replay falhou (400); tenant B e role falsificada não atravessaram o escopo. Prefixo `/v1/admin` não define por si a permissão; [AUD-0584](04_audit/0584_isolated_admin_rbac_2026-09-28.md), crítica [I2 `ACCEPT`](04_audit/evidence/AUD0584-ADMIN-RBAC-20260928/I2-review.md). Callback/IdP corporativo ainda pendente; produção `NO_GO`.

# AUD-0583 — negativas de autenticação por rota — 28/09/2026

- `buildServer` no SHA isolado limpo `7ef74e7` (Node 22.23.2, OIDC local sintético, `NODE_ENV=development`) registrou 111 pares rota/método, todos conferidos por `app.hasRoute`. Sonda sem cookie em três cenários: sem Origin, Origin permitido, Origin com headers/token falsificados. Os 98 pares protegidos retornaram 401 nos três; controles com sessão válida `session`, `tasks` e `admin/agents` deram 200. [Pacote e hashes](04_audit/evidence/AUD0583-ROUTES-20260928/summary.json).
- Logout público idempotente sem cookie devolveu 200 com Origin permitido e zero `revoke`; revisão estática independente não confirmou bypass de rota protegida. Crítica [I2](04_audit/evidence/AUD0583-ROUTES-20260928/I2-review.md) `ACCEPT_SCOPE`, sem P0/P1 local, após três ajustes P2 de precisão. Webhook, positivo funcional completo, IdP corporativo/produção, root/PR-L04 e CI/IAM/staging ainda não são qualificados por esta prova; [AUD-0583](04_audit/0583_isolated_route_authentication_2026-09-28.md), produção `NO_GO`.

# AUD20-008 — I1 fresco com packet e sentinel — 28/09/2026

- Novo [packet](04_audit/evidence/AUD20-008-I1-20260928/packet.json) vinculou oito arquivos de fencing ao manifesto de 1.503 arquivos e ao bundle certificado de `7ef74e7`, candidato `47440863…`, run `run-pr003-composite-r2-20260928`. O worktree estava limpo; hashes dos oito arquivos e do bundle conferiram antes da crítica.
- Hypatia revisou código, SQL e testes reais do candidato e retornou [I1 `APPROVE`](04_audit/evidence/AUD20-008-I1-20260928/I1-review.md) sem P0/P1; a evidência arquivada mostra PG 261/261 sem skips. P2 novo: preflight checa nomes de constraints de fencing, sem semântica. Nenhum teste foi reexecutado por essa revisão.
- O [sentinel final](04_audit/evidence/AUD20-008-I1-20260928/sentinel.json) retornou `MATCH` nos oito arquivos, 1.503 registros do candidato, HEAD limpo e bundle; Hypatia [reconferiu](04_audit/evidence/AUD20-008-I1-20260928/sentinel-review.md) em leitura. O run histórico `579d2100` continua rejeitado e `A21-F20` segue aberto no registro até nova adjudicação/certificação do SHA final. Produção `NO_GO`.

# PR-003 — reprodução do desvio de HEAD — 28/09/2026

- No worktree isolado do certificado `7ef74e7`, `npm run certification:verify` passou antes do teste. Um `git commit --allow-empty` criou `60bbf22` sem alterar árvore; a repetição do verificador também saiu 0 e declarou `current candidate qualified` para o mesmo ID `47440863…` e 38 artefatos, embora três campos de commit continuem no pai. [Pacote](04_audit/evidence/PR003-HEAD-DRIFT-20260928/reproduction.json) liga hashes dos logs e diff vazio.
- Anscombe confirmou em crítica independente [I1 `ACCEPT_REPRO`](04_audit/evidence/PR003-HEAD-DRIFT-20260928/I1-review.md), severidade/confiança altas, e repetiu o verificador em leitura. O caso prova drift de HEAD, sem alegar fraude de artefatos ou alteração de arquivos candidatos. SPEC 0157 T3 em revisão humana; nenhum BUILD de segurança, push ou deploy. Produção `NO_GO`.

# PR-301 — positivo OIDC local com API e PostgreSQL — 28/09/2026

- Em worktree isolado de `7ef74e7`, Keycloak local com OTP, Chromium, API Fastify HTTP e PostgreSQL 16 sintético foram executados juntos. O primeiro script retornou PASS, mas Noether rejeitou três P1 de evidência: sem replay do cookie operacional, sem inventário de limpeza no script e sem consulta pré-MFA da API/PG. O roteiro corrigido passou em Node 22.23.2 e [I2](04_audit/evidence/PR301-LOCAL-ENTRYPOINT-20260928/I2-review.md) aceitou o escopo local.
- [Pacote](04_audit/evidence/PR301-LOCAL-ENTRYPOINT-20260928/proof.json): comando/exit 0, script/log/compose/realm e limpeza com 10/10 hashes. Após OTP errado, API 401 e zero sessões; OTP válido gerou callback 303, sessão 200 e linha PostgreSQL. State consumido e replay com cookie restaurado 401; cookie antigo após logout 401 e família revogada. Usuários, roles, schemas, contêineres e portas próprios terminaram em zero.
- O harness externo ao commit e o console sintético são limites P2; produção corporativa, CI, root/PR-L04, IAM/staging e 0354 permanecem `NO_GO`.

# PR-003 / AUD20-008 — crítica de proveniência e I1 — 28/09/2026

- Inspeção de `computeCandidateId` e `verifyQualification` confirmou que o ID é baseado em arquivos e o verificador não compara commits registrados com Git HEAD. [SPEC 0157](02_spec/0157_certificate_live_head_binding.md) T3 define positivo e negativos, histórico separado e bundle no SHA final. Schrodinger rejeitou rascunho com 2 P1/1 P2; após correção, `ACCEPT_SPEC_REVIEW_READY`. BUILD depende de aprovação humana.
- Mencius fez I1 independente somente leitura de `AUD20-008` e retornou [REJECT](04_audit/evidence/AUD-20260920/AUD20-008/I1-20260928.md): `sha256sum --check` passou os seis arquivos da task e falhou em 33 artefatos compartilhados, inclusive certificado/candidato. Código e relatório PostgreSQL 253/253 apoiam fencing funcional, sem provar o candidato histórico. Sentinel pendente; `A21-F20` aberto.
- `docs:check-links`/higiene, Prettier e `git diff --check` PASS; nenhum BUILD, certificação, push ou deploy. Produção `NO_GO`.

# PR-003 — certificado interino hash-bound do OIDC/RLS — 28/09/2026

- `npm run certify` no SHA isolado `ae0344f` e PostgreSQL 16 teve 14/16 gates PASS; build falhou sem `VITE_CVG_CONSOLE_ORIGIN`/`VITE_CVG_API_ORIGIN` HTTPS e smoke antigo falhou porque o preflight exige `NODE_ENV`. O verificador rejeitou os dois gates, confirmou 38 hashes e `NO_GO`.
- Sob [SPEC 0156](02_spec/0156_worker_startup_smoke_node_env.md), commit `7ef74e7` definiu `NODE_ENV=test` somente nos filhos dos smokes; build web recebeu `https://console.cvg.example.test` e `https://api.cvg.example.test`. Nova certificação no SHA limpo passou 16/16; 340/2.582 unit, PG 35/261, E2E 12/12, zero skips, crítico RLS 191/197. `certification:verify` qualificou candidato `47440863…` e verificou 38/38 hashes. Ambos os bundles arquivados também passaram 38/38 [na inspeção direta](04_audit/evidence/PR003-COMPOSITE-20260928/proof.json).
- Decisão mecânica **local** `AAA_CONTROLLED / CONDITIONAL_GO`; Lorentz aceitou evidência do SHA isolado, com P2 de commit binding automático e finding I1 ainda aberto. Root/PR-L04, CI remoto/atestação, IAM/staging, provider/canal e decisão humana continuam `NO_GO` para produção.

# PR-301 — composição OIDC/RLS e reparo isolado do catálogo — 28/09/2026

- Merge preview `c78a64a` entre root `40eb3ed` e branch OIDC/RLS `42e69f4` não teve conflitos. Typecheck, lint, build, 32 focados e cobertura 340/2.582 passaram; guard RLS 191/197 (96,95%). Arendt encontrou P1 no catálogo e P2 no inventário versionado.
- [SPEC 0155](02_spec/0155_isolated_skip_catalog_rebind_004_006.md) autorizou somente no worktree isolado a troca dos hashes de `SKIP-PG-004/006` e a contagem 4→7 do segundo, após prova 8/7 sem PostgreSQL. Commit `ae0344f`; revisor fechou P1. [Prova](04_audit/evidence/PR301-COMPOSITE-20260928/proof.json) vincula 340/2.582 `npm test`, PG 35/261, E2E 12/12, tipo/lint/formato/links PASS no commit final; zero skips e zero objetos sintéticos residuais.
- `skip:governance` PASS contra catálogo e relatórios disponíveis, mas estes relatórios são anteriores ao SHA final. P2 de evidência permanece; não houve `certify`, push ou deploy. Código root, CI/atestação, staging corporativo/IAM e 13 condições 0354 abertos; produção `NO_GO`.

# PR-301 — cobertura crítica RLS fechada localmente — 28/09/2026

- Sob [SPEC 0154](02_spec/0154_rls_preflight_negative_coverage.md), commit isolado `42e69f4` acrescentou negativos PostgreSQL de catálogo/policy/RLS forçado, privilégios da role de serving e owner de migração; cada mutação foi observada no catálogo e revertida. Revisor independente `ACCEPT`, sem P1/P2 remanescente no diff.
- [Prova](04_audit/evidence/PR301-RLS-20260928/proof.json): cobertura e `npm test` 340 arquivos/2.581 testes sem skips; PG 35/261; E2E 12/12; typecheck, lint e formato PASS. `coverage:critical` PASS em 191/197 branches RLS (96,95%, piso 95%) sem redução do denominador; zero roles/schemas sintéticos residuais.
- `skip:governance` ainda falha por `SKIP-PG-004` preexistente e `SKIP-PG-006` alterado por esta fatia; catálogo sob claim PR-L04. Código root, CI/atestação, staging corporativo/IAM e certificado final pendentes. Produção `NO_GO`.

# PR-301/302 — crítica pós-BUILD fechada localmente — 28/09/2026

- Em `ed012a4`, o branch T3 isolado passou a exigir mesmo site HTTPS para console/API, a aceitar host corporativo de autorização distinto sob cookie seguro, a recusar cookies operacionais legados/malformados no callback e a limitar espera DNS. Hume identificou as quatro lacunas; Noether aceitou a revisão após correções.
- [Gates de código](04_audit/evidence/PR301-CORP-I1-20260928/proof.json): 340/2.578 testes sem skips, PostgreSQL 35/258 e Chromium 12/12, Node 22, tipo/lint/formato/links e cobertura global PASS. Cobertura crítica `FAIL` no grupo RLS (83,76% branches para piso 95%). [Navegador HTTPS](04_audit/evidence/PR302-HTTPS-BROWSER-20260928/proof.json): imagem NGINX e bundle reais, hook HTTP da API, sessão/IdP sintéticos, cookies/CORS/CSRF/CSP/401/503 observados. O gate de skips falha por catálogo com hash vencido sob PR-L04; root integrado, IAM/staging, CI/atestação/certificado seguem abertos. Produção `NO_GO`.

# PR-301/302/204 — BUILD T3 sintético isolado — 28/09/2026

- Sob as SPECs 0150/0152 aprovadas pelo usuário, commit isolado `7019422` compôs OIDC corporativo, sessão PostgreSQL e transporte do console em hosts HTTPS distintos; rejeita modo local/HMAC/overrides em produção. [Prova](04_audit/evidence/PR301-CORP-T3-20260928/proof.json).
- Node 22: suíte 319/2.410 PASS com 21/164 skips sem serviços externos; PostgreSQL 16 próprio 35/258 PASS; OIDC/sessão PG 2/20; web focado 2/35; tipo/lint/formato/build runtime e web PASS. A primeira rodada ampla/PG revelou somente fixtures antigas de erro de boot, corrigidas e repetidas verdes. Contêiner próprio removido.
- Positivo do entrypoint `NODE_ENV=production` com issuer público HTTPS e E2E Chromium no mesmo digest `NOT_RUN`; root/CI/certificado/atestação e IAM real pendentes. Sem dados reais, deploy ou push; produção `NO_GO`.

# PR-204 — aviso B2 preparado no branch isolado — 28/09/2026

- Commit `643f6ad` acrescenta `providerKeyMigrationNotice` e log estruturado sem valor no entrypoint. No release atual B1, a função não emite aviso e a fase não pode ser trocada por env. A [prova](04_audit/evidence/PR204-B2-PREP-20260928/proof.json) registra suíte 333/2.478, PG 35/258, Chromium 12/12, cobertura acima dos thresholds, imagem Docker API B1 viva e negativo de spoof antes de listener, sem vazamento.
- Crítica read-only `REJECT_B2_RELEASE`: não há imagem B2 pinada nem prova de rollback. Isto fecha apenas preparação local, não migração operacional ou certificação do SHA integrado. Contêineres PostgreSQL sintéticos removidos; produção `NO_GO`.

# PR-301/204 — AUD-0582 e SPEC 0152 de autoridade corporativa — 28/09/2026

- Código isolado PR‑204 fecha boot produtivo sem OIDC corporativo; [AUD-0582](04_audit/0582_corporate_oidc_boot_gap_2026-09-27.md) registra o gap. [SPEC 0152](02_spec/0152_corporate_oidc_authority_contract.md) define parâmetros IAM, separação local/corporativo, client secreto, MFA/grupo/tenant, prova sintética no entrypoint e Chromium do mesmo digest, schema compatível e drenagem integral para rollback.
- Revisões independentes I1–I3 `REJECT` localizaram lacunas P1; a revisão as corrigiu e I4 `ACCEPT_SPEC_REVIEW_READY` sem editar artefatos. Links, higiene e formato documentais PASS. Nenhum BUILD corporativo nem integração real autorizado; revisão T3 humana e issuer/claims ainda pendentes. Produção `NO_GO`.

# PR-204 — BUILD T3 sintético de boot, gateway e bundle — 27/09/2026

- Sob [SPEC 0151](02_spec/0151_production_boot_configuration_contract.md) aprovada, branch isolado `codex/pr204-boot-20260927` (`99692e3`) valida configuração uma vez no boot da API, fecha produção sem autoridade OIDC corporativa, recusa worker sem perfil/seletor, impede provider externo sem chave e sela o bundle web. Imagem Docker remove os arquivos padrão do Nginx e preserva UID 101.
- [Prova](04_audit/evidence/PR204-BUILD-20260927/proof.json): Node 22, suíte 333/2.477 e PostgreSQL 35/258 sem skips, Chromium 12/12, build Docker web e verificação independente dos 10 arquivos PASS. Cobertura 333/2.477 PASS (92,28% statements, 87,45% branches, 95,06% funções, 93,27% linhas); testes negativos e gates locais resumidos na prova.
- Críticas independentes I1–I3 tiveram P1 corrigidos. Integração root, B2 operacional, IdP corporativo, cross-origin SPEC 0150, CI remoto/atestação e certificado do SHA final ainda pendentes. Sem dado real, push ou deploy; produção `NO_GO`.

# PR-203 — fatia 4 de PostgreSQL validada em branch isolado — 27/09/2026

- Commit `9e949d7` extraiu sete métodos de inbound/sessão e dois helpers para `postgres-inbound.ts` (813 linhas), reduzindo `postgres.ts` a 1.455. AST 9/9 e assinaturas 7/7 preservados; crítica pós-código `ACCEPT`, sem P0/P1. [Prova](04_audit/evidence/PR203-20260927/proof.json).
- Node 22/PostgreSQL 16: cinco arquivos focados/65, suíte inicial 325/2.391, suíte final com cobertura 325/2.392, PG 35/258 e Chromium 12/12, zero skips; tipo/lint/formato/links PASS. Teste novo valida rejeição de correlation ID inválido antes de qualquer query.
- Cherry-pick `7b3871d` integrou a fatia ao root; os três arquivos têm SHA-256 igual ao branch isolado. Tipo/lint/negativo focado PASS no checkout compartilhado. Composição com OIDC/PR-L04, certificação e CI no SHA final permanecem; produção `NO_GO`.

# PR-204 — AUD-0581 e SPEC 0151 de boot de produção — 27/09/2026

- Sondas Node 22 em valores sintéticos: `parseEnv` aceitou produção sem identidade explícita/keyrings, inbound não durável e `ENABLE_REAL_CHANNELS=true`; rejeitou identidade `simulation`. `getWorkerStartupFailure` aceitou `NODE_ENV` ausente e `unknown` com `controlled-memory`, rejeitou `production`. Inspeção confirmou guards adicionais na API e worker atual proibido em produção; não houve demonstração de ação externa ou bypass de boot completo. [AUD-0581](04_audit/0581_production_boot_configuration_gap_2026-09-27.md).
- [SPEC 0151](02_spec/0151_production_boot_configuration_contract.md) traz snapshots por processo, positivos/negativos de entrypoint, bundle web, seleção exclusiva OIDC sem HMAC legado, provider externo autenticado e migração A/B1/B2 de `OPENAI_API_KEY` para `MODEL_PROVIDER_API_KEY`. Crítica I1 rejeitou quatro P1; revisão corrigiu e I2 `ACCEPT_SPEC_REVIEW_READY`. Links/higiene/formato PASS. Revisão humana T3, BUILD e certificação permanecem pendentes; produção `NO_GO`.

# PR-301 — integração OIDC isolada, prova local — 27/09/2026

- Claim `PR-301-ROOT-INTEGRATION-PREVIEW`: merge limpo `dd954ab` de root `d43d3f5` com `codex/pr301-oidc-client` `85c2c7d`, em worktree próprio. O commit isolado `0b4a95b` tornou a porta da API configurável no E2E e atualizou apenas hashes do catálogo `SKIP-PG-004/014`; nenhum código root sob PR-L04 foi alterado.
- [Evidência](04_audit/evidence/PR301-ROOT-INTEGRATION-20260927/proof.json): Node 22 com PostgreSQL 16, 331/2.437 na suíte total e 35/258 no gate PG, zero skips; catálogo, tipo, lint, formato, links/higiene PASS. E2E Chromium/Keycloak MFA real em API 3215/web 4189 provou OTP inválido negado, cookie e callback entre sites, replace, logout e replay 401. Banco e IdP sintéticos foram limpos. A primeira suíte teve um skip por `PHASE4A_DISPOSABLE_PG` ausente; a final foi repetida com o ambiente completo.
- O branch e a prova são locais. PR-L04, SPEC 0149/0150 T3, IdP corporativo, certificação e atestação remota do SHA integrado permanecem abertos; produção `NO_GO`.

# PR-009-PROV — GH_TOKEN no verificador independente — 27/09/2026

- A [documentação oficial do GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-github-cli) exige `GH_TOKEN` no passo Actions que invoca `gh`. O job `provenance-verify` chamava `gh attestation verify` sem essa variável; commit `cae1c2a` a fornece somente nesse passo e o teste de contrato passa a exigir o vínculo. Negativo retirou a linha em cópia descartável, obteve falha do teste e restaurou o workflow byte a byte.
- [Evidência](04_audit/evidence/PR009-GH-TOKEN-20260927/proof.json): Node 22, 16 focados, typecheck/lint/actionlint/formato PASS; suíte 305 arquivos/2.229 testes PASS, 20/162 skipped sem banco; PostgreSQL 35/258 PASS; E2E Chromium 12/12 PASS após compilar runtime no worktree isolado. A primeira tentativa E2E foi interrompida por dist ausente de `@cvg/shared`, sem mudança de produto. Prova local, sem run remoto, atestação, push ou deploy; `NO_GO`.

# PR-009-PROV — recon da prova CI remota — 27/09/2026

- Consulta read-only ao GitHub confirmou Verify [run 36309111340](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/36309111340) e Security [run 36309111343](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/36309111343) verdes no mesmo SHA `8ee6fa2`. O download do único artefato Verify trouxe manifesto `aud0578-pr007-v1` com 37/37 gates PASS, 60/60 arquivos listados presentes e hash `51bdfe6d6aa4cd3591978b49c273a9e03814a09e402c59cf50251ea247fdb923`.
- [Prova](04_audit/evidence/PR009-REMOTE-AUDIT-20260927/proof.json): esse run não contém jobs `attest`/`provenance-verify` nem bundle; seu SHA diverge do checkout atual. `main` retornou proteção 404 e rulesets vazios. `gh` local 2.45.0 não tem subcomando `attestation`, portanto não houve verificação criptográfica por essa CLI. Não houve push, deploy nem alteração de configuração externa. SPEC 0147 continua sem prova remota do candidato integrado; `NO_GO`.

# PR-301 — prova Chromium da semântica HTTPS de cookies — 27/09/2026

- Claim próprio `PR-301-CROSS-ORIGIN-BROWSER-PROBE`. Em Node 22/Chromium 147, quatro servidores HTTPS descartáveis em `api.example.test`, `console.example.test`, `sibling.example.test` e `idp.other.test` verificaram escopo host-only, CORS com credenciais, `SameSite=Strict` operacional, cookie pendente `Lax` no callback e rejeição de injeção `__Host-` por host irmão. [Prova e resultado](04_audit/evidence/PR301-CROSS-ORIGIN-PROBE-20260927/proof.json), SHA-256 do resultado `7c1a30960d993590a6c9e443c96a008cc7d20053381055a9b8d59721f889a76f`.
- Diagnóstico preservado: navegação direta de Playwright a um endpoint do IdP que redirecionou imediatamente enviou `Strict` ao callback; a prova final carregou documento do IdP e clicou um link para iniciar a navegação entre sites. Isso valida a semântica observada do navegador nesse cenário, sem provar o fluxo OIDC do produto. Nenhum código de aplicação, dado real ou deploy foi alterado. SPEC 0150 T3, BUILD, E2E integrado e produção continuam pendentes; `NO_GO`.

# PR-301/302 — AUD-0580 e SPEC 0150 de hosts distintos — 27/09/2026

- No branch isolado `85c2c7d`, `apps/web/src/api/client.ts` usa `fetch(path)` com `credentials: include`; Vite e `deploy/nginx.web.conf` fazem proxy de `/v1` no hostname do console. Com `Fastify.inject` real do `http-security.ts` em Node 22.23.2, origem `https://console.example.test` e cookie sintético: GET `/v1/session` 200 e OPTIONS 204 emitiram ACAO/Vary, mas `Access-Control-Allow-Credentials=null`. [AUD-0580](04_audit/0580_cross_origin_oidc_gap_2026-09-27.md) vincula fontes por SHA-256; nenhuma chamada externa, dado real ou browser foi usada nessa sonda.
- [SPEC 0150](02_spec/0150_cross_origin_operator_console.md) compara proxy no mesmo host, hosts HTTPS distintos e BFF; escolhe hosts distintos no mesmo site com API origin fixada no bundle, CORS com credenciais só à origem do console, Origin obrigatório para mutações com cookie/início OIDC, cookies `__Host-` no HTTPS, `/v1/**` `private, no-store` com bypass CDN, NGINX sem proxy `/v1`, CSP verificável e rollback sem bundle relativo. I27/I28 rejeitaram a proposta inicial por injeção de cookie único por domínio irmão, cache entre tenants, rollback inválido e CSP sem teste. Após correção, ambos `ACCEPT_SPEC_REVIEW_READY`; revisão documental, sem BUILD.
- Links, formato e higiene documental serão rechecados no fechamento. T3 humano, implementação, browser em hosts HTTPS sintéticos, issuer corporativo, integração após PR-L04 e certificação do mesmo SHA continuam pendentes. Produção `NO_GO`.

# PR-301/402 — I25 rollout de purge e I26 rotas OIDC — 27/09/2026

- Recon do preflight no branch isolado `85c2c7d`: ele exige exatamente quatro relações e seis funções; um binário já iniciado não repete a checagem automaticamente. A [SPEC 0149](02_spec/0149_operator_auth_purge.md) agora exige release compatível A1 antes de `0002`, prova de zero réplicas antigas, runner com alvo explícito, migration/grants transacionais, restart gradual para revalidar A2, certificação do candidato final em staging e rollback só ao release compatível.
- I25 rejeitou o primeiro desenho por não haver como API/job lerem a policy sem `SELECT` e o segundo por snapshot velho em `REPEATABLE READ`. A revisão definiu função de attest `SECURITY DEFINER` só de leitura, purge com comparação dos valores esperados antes de excluir, `READ COMMITTED` obrigatório, funções `VOLATILE` e `LOCK TABLE ... SHARE` antes da leitura. Rechecagem I25 `ACCEPT_SPEC_REVIEW_READY`; observação de redação corrigida. É revisão documental, não BUILD nem prova PostgreSQL.
- I26 auditou código e 51 testes focados Node 22 no branch isolado; após confrontar a SPEC 0144, retirou o achado de logout por cookie antigo como defeito, pois revogar a família por digest anterior é contrato aprovado contra corrida de replace/logout. Manteve P3 local: Vite e API em portas distintas do mesmo hostname recebem o cookie host-only. A composição OIDC local recusa produção. Backlog exige hosts HTTPS distintos no mesmo site e prova de navegador de cookie só na API antes de GO; código não foi alterado. Produção `NO_GO`, sem dados reais ou deploy.

# PR-301/402 — recon de retenção e SPEC 0149 — 27/09/2026

- Leitura estática das migrations de autenticação confirmou `oidc_login_states` sem purge de reservas expiradas e `operator_sessions`/`operator_session_families` sem descarte físico. O lookup ignora expirados, mas o digest antigo deve sobreviver enquanto houver sucessora ativa para que logout revogue a família. [DB-09](platform/09-personal-data-inventory.md) foi acrescentada ao inventário; nenhum banco ou dado real foi consultado.
- [SPEC 0149](02_spec/0149_operator_auth_purge.md) propõe policy singleton sem default, função `SECURITY DEFINER` acessível só à role de purge, 1.000 exclusões por chamada, job a cada dez minutos, métricas agregadas, rollout em duas versões de preflight e teste PITR. I24 inicialmente rejeitou domínio/cardinalidade insuficientes e retenção indefinida por `replace` repetido; a revisão adicionou `CHECK`s, falha antes de `DELETE`, DP-06 para idade da família e alerta de linhas antigas bloqueadas. Rechecagem `ACCEPT_SPEC_REVIEW_READY`, somente leitura e sem aprovação de BUILD.
- Faltam decisão DP-01 a DP-06 do controlador/DPO, contrato de troca de família, revisão humana T3, implementação, testes e staging. A proposta não altera o candidato nem autoriza purge ou produção. Programa `IN_PROGRESS`, produção `NO_GO`.

# PR-301 — serving sem credencial DDL, I23 ACCEPT_LOCAL — 27/09/2026

- Sob SPEC 0144 aprovada e claim isolado, commit `85c2c7d` separou job de migração do processo API: produção recusa URL DDL/auto-migration; preflight de produto só lê catálogos, exige login direto, owner separado e sem privilégios amplos, inventário de ownership, `CREATE ON DATABASE` ausente nas duas roles e nenhum schema persistente criável pela runtime. O negativo de `CREATE` em `public` veio da crítica I23; rechecagem `ACCEPT_LOCAL` sem rerodar testes pelo crítico.
- Node 22/PostgreSQL 16 descartável: suíte 331/2.437 sem skips, `test:postgres` 35/258, foco e Phase 4A PASS, tipo/lint/formato/links/higiene PASS. E2E Chromium/Keycloak MFA entre sites PASS na porta web 4187; 4173 pertencia a outro agente e a tentativa inicial não iniciou Vite. Verificador confirmou zero roles/schemas sintéticos e serviços/contêineres removidos. [Prova no branch isolado: `docs/04_audit/evidence/PR301-PROD-STARTUP-20260927/proof.json`].
- `git merge-tree --write-tree HEAD codex/pr301-oidc-client` retornou sem conflito no HEAD consultado; não houve merge, push ou deploy. Teste de startup usa store de sessão sintético e não prova entrypoint corporativo. Integração após PR-L04, IdP corporativo, retenção/purga, rollout compatível e certificado/CI do SHA integrado seguem abertos; produção `NO_GO`.

# PR-301/302 — I22 ACCEPT_LOCAL_PROOF e gate de limpeza — 27/09/2026

- I22 rechecagem independente somente leitura aceitou o commit `8b0f92d`: o verificador retorna 401 ao reapresentar o cookie salvo após logout; no callback entre Keycloak `localhost` e API `127.0.0.1`, observa pending Lax presente e cookie operacional Strict ausente, cria nova sessão e rejeita o cookie anterior. O crítico não rerodou o browser; sua observação restante era apenas a expressão “família antiga”, alterada para “sessão antiga”.
- Na repetição após essa edição, um listener de callback com timeout curto rejeitou antes de terminar a espera por outro OTP e deixou quatro roles/dois schemas **sintéticos** no PostgreSQL descartável. Foram removidos manualmente e checados em zero. O commit `0b57416` aumentou o timeout, tratou a rejeição e moveu `PASS` para depois da remoção de usuário e da consulta que exige zero roles/schemas. E2E final Node 22.23.2 passou nesse código; inventário zero conferido também fora do script; contêineres removidos. [Prova no branch isolado: `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json`].
- Os logs anteriores são diagnósticos; o manifesto final distingue a execução entre sites aceita. Integração, IdP corporativo, dados/rollout, serving sem DDL e certificação remota do SHA integrado seguem pendentes. Produção `NO_GO`.

# PR-301/302 — crítica I22 e correção da prova — 27/09/2026

- I22, revisão independente somente leitura, encontrou dois falsos positivos possíveis no E2E anterior: logout apagava cookie no browser antes da verificação, e IdP/API usavam o mesmo site. Nenhum bypass concreto no código de autenticação foi encontrado; o veredito da prova anterior foi `REJECT_LOCAL_PROOF`.
- Commit isolado `8b0f92d` adicionou perfil de Keycloak em `localhost:8087` com API/web em `127.0.0.1`, segunda autenticação com sessão antiga, asserção de cookie temporário Lax presente e operacional Strict ausente no callback, troca de cookie e replay da sessão antiga 401. O teste agora reutiliza o cookie salvo antes do logout para exigir 401 diretamente da API após revogação. Node 22.23.2, Keycloak/Chromium/PostgreSQL descartável: execução final PASS. O segundo OTP espera novo intervalo porque Keycloak recusa reutilização do código; roles/schemas e contêineres removidos. Prova/hashes no branch isolado em `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json`; rechecagem I22 solicitada.
- Logs do E2E no mesmo host são diagnósticos históricos e não comprovam os dois pontos corrigidos. Integração, IdP corporativo, política de dados, rollout e CI/certificado do SHA final continuam pendentes; produção `NO_GO`.

# PR-301/302 — E2E confiável local completo — 27/09/2026

- Sob SPEC 0144 e claim isolado, `deploy/local-oidc/verify-full.mjs` cria roles/schemas e operador sintéticos, sobe API e web, navega via Keycloak real e OTP, comprova que OTP errado não emite sessão, completa callback com OTP correto, confirma cookie HttpOnly/Strict, recarga da mesma identidade sem token/header de operador e revogação no logout. Commit isolado `cb943e8`; nenhuma credencial real, deploy ou push.
- Primeiro E2E encontrou pacotes internos não compilados para Vite; `npm run build:runtime` preparou o runtime. Outro ciclo encontrou erro na instrumentação de cookie pelo Playwright, não no produto; a prova passou após usar a restauração real da identidade e atributos do cookie. Execuções finais Node 24.20.0 e Node 22.23.2 PASS. No Node 22, `typecheck`, `lint`, `build:web`, links e higiene PASS. Banco PostgreSQL 16 descartável terminou com zero roles/schemas de teste; browser, API, web, usuário e contêineres removidos. Prova/hashes em `docs/04_audit/evidence/PR301-302-TRUSTED-E2E-20260927/proof.json` no branch isolado.
- Revisão independente, integração `main`, certificado/CI do mesmo SHA, IdP corporativo, retenção/purge, rollout e preflight read-only de produção ainda pendentes. Produção `NO_GO`.

# PR-302-WEB-OIDC — BUILD web isolado e regressões — 27/09/2026

- Sob SPEC 0144 aprovada, commits isolados `531ef2a` e `1c1ae32`: cliente web inicia OIDC por POST com cookie, valida esquema da URL de navegação, recarrega sessão por cookie sem token, trata 401 inicial sem callback global de expiração, trata 503 com retry e mantém a identidade local se o logout falha. Revisão interna corrigiu o retry do início após 503; não equivale a crítica independente.
- Suíte web final 26 arquivos/96 testes PASS; `typecheck`, `lint`, `build:web`, `docs:check-links`, formato e hashes PASS. A primeira execução de links coincidiu com logs ainda vazios e falhou em higiene; a execução final após conclusão de todos os comandos passou. Prova em `docs/04_audit/evidence/PR302-OIDC-WEB-20260927/proof.json` no branch isolado.
- E2E confiável integrado, crítica adversarial independente, integração no checkout compartilhado, IdP corporativo, política de dados e certificado do mesmo SHA pendentes. Produção `NO_GO`.

# PR-301-OIDC-ROUTES — BUILD/AUDIT HTTP local isolado — 27/09/2026

- SPEC 0144/D-09 aprovadas e usuário escolheu IdP OIDC local com MFA. Branch `codex/pr301-oidc-client`, commit `b41cff2`: composição em `buildServerFromEnv` com preflight read-only de roles/schema/RLS e stores PostgreSQL; rotas `POST /v1/auth/oidc/start` e `GET /v1/auth/oidc/callback`; sessão operacional opaca, reload somente por cookie, replace atômico e logout com revogação confirmada. Sem dado real nem deploy.
- I19 rejeitou leitura do cookie `SameSite=Strict` no callback entre sites e bootstrap HMAC; a revisão vinculou a sessão antiga verificada ao state em cookie pendente cifrado, exigiu Origin/limiter e desativou o bootstrap no modo OIDC. I20 rejeitou logout com cookie duplicado/malformado e contrato `replace` opcional; ambos corrigidos. I19/I20: `ACCEPT_LOCAL`.
- PostgreSQL 16 descartável e emissor sintético assinado: servidor real testado em start/callback/reload/replay/logout. `test:postgres` 35/258 PASS; suíte geral final com banco 330/2.428 PASS sem skips; Keycloak/Chromium OTP real, troca criptográfica e replay negado PASS; typecheck, lint, formato, links e `npm audit --audit-level=high` PASS. Evidência e hashes no branch isolado em `docs/04_audit/evidence/PR301-OIDC-ROUTES-20260927/proof.json`. Containers descartáveis removidos.
- Código ainda fora de `main` por claim PR-L04; web, IdP corporativo, purge/retensão, rollout, preflight sem DDL em produção e certificação no SHA integrado permanecem pendentes. Produção `NO_GO`.

# PR-301-OIDC-CLIENT — BUILD e AUDIT isolados — 27/09/2026

- Sob SPEC 0144 aprovada, branch `codex/pr301-oidc-client` commit `30d3ca4`: cliente `openid-client` 6.8.8 com issuer/endpoints locais fixos, PKCE, callback vinculado a state/nonce e verificação de assinatura/JWKS. Um negativo inicial mostrou assinatura falsa aceita sem `enableNonRepudiationChecks`; ativei a validação e o negativo passou. Keycloak real com navegador provou senha+OTP, code exchange, identidade de tenant/papel e replay negado; usuário sintético e container removidos. I18 `ACCEPT_LOCAL`. Evidência no branch isolado em `docs/04_audit/evidence/PR301-OIDC-CLIENT-20260927/proof.json`: 41/41 focados, 306/2.240 suíte geral sem banco (20/162 skipped), typecheck/lint/audit/links PASS. Primeiro ciclo da suíte falhou por allowlist de dependência, corrigida no branch e rerodada verde. PR-L04 mantém os caminhos necessários à integração no checkout compartilhado; produção `NO_GO`.

# PR-301-OIDC-STATE-PG — BUILD local e críticas I16/I17 — 27/09/2026

- Sob [SPEC 0144](02_spec/0144_trusted_operator_session_production.md) aprovada e claim próprio, executei migration incremental `0001`, reserve/consume atomicamente no PostgreSQL e endureci preflight e limite de pool. I16 rejeitou rollback/relógio e aceitou o desenho revisado; I17 rejeitou FK extra e pool sem timeout, corrigidos e aceitos. [Prova](04_audit/evidence/PR301-OIDC-STATE-PG-20260927/proof.json): Node 22, PostgreSQL focado 26/26, suíte geral com banco 325/2.391 sem skips, `test:postgres` 35/258, typecheck/lint PASS. Banco sintético removido. Composição/API/web, cliente OIDC, purge, migração real e certificação permanecem abertos; produção `NO_GO`.

# PR-301-OIDC-TRANSACTION — BUILD local e crítica I15 — 27/09/2026

- Sob SPEC 0144 aprovada e claim próprio, implementei o início do login OIDC com PKCE S256, state e nonce ligados a cookie temporário autenticado, e callback com consumo atômico obrigatório de digest de state. I15 rejeitou replay e redirect divergente; corrigi, e a rechecagem aceitou a fatia local. [Prova](04_audit/evidence/PR301-OIDC-TRANSACTION-20260927/proof.json): Node 22, 6/6 focados, 305 arquivos/2.226 testes unitários PASS (20/154 skipped sem banco), PostgreSQL descartável 35/258 PASS, typecheck/lint PASS. Container removido. Store distribuído real, discovery/JWKS, token exchange, rotas/web e E2E seguem abertos; produção `NO_GO`.

# PR-003-INTERIM — certificação isolada — 27/09/2026

- Claim próprio e worktree detached limpo `c634fcd`; PostgreSQL 16 descartável, Node 22, API/web em portas exclusivas. `npm run certify` executou 16 comandos exit 0, mas adjudicou 15 PASS/1 FAIL: unit tinha 2.373 testes PASS e um Phase 4A skip por ambiente diagnóstico sem `PHASE4A_DISPOSABLE_PG=1`; o inventário rejeitou `SKIP-PG-014` por `sourceSha256` vencido. `certification:verify` exit 1 com 38 hashes PASS e decisão `NO_GO` coerente. E2E em simulação 12/12 e PostgreSQL 35/258 PASS. Repetição focada do Phase 4A e suíte unitária inteira com banco habilitado passaram 1/1 e 324/2.374, zero skips, sem alterar o certificado. [Prova](04_audit/evidence/PR003-INTERIM-20260927/proof.json): bundle comprimido íntegro 38/38, I14 `ACCEPT_FACTS` após encontrar e corrigir regeneração posterior do inventário no worktree. Catálogo segue no claim PR-L04; nenhum GO.

# PR-301-PG-INDEX — preflight de índices de autenticação — 27/09/2026

- Sob [SPEC 0144](02_spec/0144_trusted_operator_session_production.md) aprovada e claim próprio, acrescentei inventário exato dos cinco índices de autenticação ao preflight. Negativos reais no PostgreSQL 16 para índice ausente, chave trocada, predicado parcial e índice extra foram rejeitados; Node 22: 9/9 focados, suíte geral 304 arquivos/2.220 testes e PostgreSQL completo 35 arquivos/258 testes PASS. Crítica I13 `ACCEPT_LOCAL`; [prova](04_audit/evidence/PR301-PG-INDEX-20260927/proof.json). API/OIDC/web e produção seguem `NO_GO`.

# PR-301-OIDC-MAP — vínculo dos claims verificados — 27/09/2026

- Sob [SPEC 0144](02_spec/0144_trusted_operator_session_production.md) aprovada e claim próprio, implementei o mapeador de identidade com MFA `pwd`+`otp`, autenticação recente, issuer/audience/`azp`, subject opaco e um único grupo tenant/papel. Keycloak local em Chromium confirmou os claims reais e limpou o usuário sintético. Node 22: focados 22/22, suíte geral 304 arquivos/2.220 testes e PostgreSQL descartável 35 arquivos/258 testes PASS; tipo/lint/formato PASS. I12 `ACCEPT_LOCAL` encontrou incompatibilidade de audience em lista unitária, corrigida/testada e aceita na rechecagem. [Prova](04_audit/evidence/PR301-OIDC-MAP-20260927/proof.json). Sem verificação JWT/JWKS/nonce no callback nem integração API/web; produção `NO_GO`.

# PR-301-OIDC-LOCAL — prova do IdP local — 27/09/2026

- D-09 do usuário direcionou IdP OIDC local com MFA para desenvolvimento/homologação, sem login próprio. Claim próprio antes de editar `deploy/local-oidc/**`. Keycloak 26.7.4 iniciou via Compose em loopback, importou realm com fluxo senha+OTP `REQUIRED`, client PKCE S256 e mappers AMR/grupo. Um primeiro import com subflow `form-flow` devolveu 400 no navegador; corrigido para `basic-flow` após leitura de logs e nova importação. O [verificador em navegador](04_audit/evidence/PR301-OIDC-LOCAL-20260927/proof.json) criou e removeu usuário sintético: discovery, PKCE ausente e redirect inválido negativos, setup OTP obrigatório, OTP errado recusado e token após OTP válido com `amr: otp` e grupo `Supervisor` PASS. I11 `ACCEPT_LOCAL`; container descartável removido. API/web ainda sem OIDC integrado, assinatura/nonce ficam no gate da API; produção `NO_GO`.

# PR-301 — implementação isolada do store PostgreSQL — 27/09/2026

- Usuário definiu IdP OIDC local com MFA para desenvolvimento/homologação e identidades sintéticas, mantendo issuer corporativo pendente para produção. Decisão [D-09](03_build/0357_production_decision_packet_2026-09-26.md) SHA-256 `0309ca28394c2499f0a47b60b90281b8ceca214d27066be8fd420ab1bcb15460`. Claim PR-301 ativo antes da edição. Migration em schema de autenticação próprio, role API separada, funções `SECURITY DEFINER`, digest do cookie, substituição e revogação transacional por família, adapter e preflight de objetos vivos implementados. PostgreSQL 16 descartável: 8/8 testes do store e 16/16 focados com hook/sessão PASS. I7 `REJECT` apontou cliente DDL não fixado, produto opcional e constraint de expiração sem verificação; corrigidos com recusa de `Pool`, schema de produto obrigatório e seis constraints `CHECK` vivas. I8 `REJECT` apontou login mascarado por `SET ROLE`, herança da role e schema de produto opcional no runner; corrigidos com `session_user`, contagem bidirecional de membership e parâmetro obrigatório antes de DDL. I9 `REJECT` apontou trigger capaz de elevar o papel gravado; preflight rejeita triggers/regras inesperadas, com negativo real. I10 `ACCEPT_LOCAL` para a fatia isolada. [Prova](04_audit/evidence/PR301-PG-20260927/proof.json): `typecheck`, lint, formato, links/higiene e focados PASS; suíte geral intermediária 303/2.198 PASS, 20/151 skipped, não certifica o diff final. Sem alteração de `server.ts`/web da PR-L04, sem IdP ou release; `NO_GO`.

# PR-301/302 — falha do store e crítica da recarga — 27/09/2026

- Usuário aprovou [SPEC 0144](02_spec/0144_trusted_operator_session_production.md) e D-09. Claim antes da edição, sem tocar `server.ts`/`client.ts`/`App.tsx` do outro agente. `apps/api/src/operator-session-hook.ts` responde 503 sem enviar `Set-Cookie` ao falhar o store. A tentativa web de chamar `getSession(null)` foi testada, mas a crítica I2 `REJECT` mostrou que o `App.tsx` apresenta estados incorretos para 401/503; o código web e seu teste foram retirados. Suíte intermediária 303 arquivos/2.199 PASS, 20/146 skipped sem banco; não certifica o diff final. [Prova local](04_audit/evidence/PR301-20260927/proof.json) registra teste final do hook. Revisão de segurança I1 encontrou owner/schema/preflight pendentes, troca não atômica e logout que limpa cookie antes de revogar; registrados na SPEC. IdP sem parâmetros; `NO_GO`.

# PR-009-PROV — início do BUILD T3 aprovado — 27/09/2026

- Usuário aprovou a [SPEC 0147](02_spec/0147_ci_bar_external_provenance.md) para BUILD. Claim `77397a1` cobre script, workflow, testes e ledgers. `ci-bar` emite selo fora do diretório mutável para 34 gates; finalizador compara bytes de log/snapshots e entry/state ao output do runner, distingue `LOCAL_UNSEALED` de `GITHUB_STEP_OUTPUT_SEALED` e publica hash do manifesto em output.
- Workflow de Verify passou a ter job de atestação com permissão própria, verificação independente do bundle, sujeito, signer workflow e SHA, e job final de política que falha se qualquer dependência for skipped/fail. I1 `REJECT`: hashes de todos os arquivos, runtime e política de fork adicionados. I2 `REJECT`: gate extra/duplicado agora invalida o inventário. I3 `REJECT`: job independente passou a fixar conjunto de 34 gates e versão do contrato; teste executa seu Python contra substituição coerente. I4 `ACCEPT_LOCAL` para o modelo aprovado. [Prova local e logs](04_audit/evidence/PR009-PROV-20260927/proof.json): testes focados 4/24, `typecheck`, lint, build, actionlint 1.7.12, links/higiene/formato PASS; suíte completa repetida 301 arquivos/2.196 testes PASS, 20/146 skipped sem banco. Leitura GitHub: `main` sem branch protection (404) e sem rulesets. Sem prova remota ou certificado integrado; produção `NO_GO`.

# PR-401 — inventário pessoal e RIPD proposto — 27/09/2026

- Claim exclusivo `PR-401` registrado antes de editar. Duas inspeções independentes somente leitura cobriram schema PostgreSQL e superfícies de API, worker, canal, modelo, logs, telemetria, caches e CI. Nenhum banco foi consultado e nenhum dado real, provider externo ou canal real foi usado.
- [Inventário](platform/09-personal-data-inventory.md) delimita categorias potenciais DB-01–08, LEG-01–02 e FLOW-01–07, diferencia `cvg_conversation_*` de tabelas Secretary, aponta dados vinculáveis e expõe lacunas de retenção/minimização/OTel. [Modelo RIPD](platform/10-ripd-template.md) está vazio para produto consumidor e remete hipótese legal, alto risco e aprovação ao controlador/DPO. Crítica I1 `REJECT` identificou IDs brutos confundidos com digest, stores omitidos, anexos e sessão superestimados, e escopo de RIPD prescrito; texto corrigido. I2 `REJECT` identificou quarentena sem tenant/RLS omitida e decisão legal atribuída ao DPO em vez do controlador; DB-07 e responsabilidade do controlador adicionadas. I3 `REJECT` encontrou `schema_migrations.baseline_actor/reference` com `SELECT` público; DB-08 adicionada. I4 `ACCEPT` para exatidão documental; `docs:check-links`, higiene, `format:check` e `git diff --check` PASS. DPO ainda não aprovou; produção `NO_GO`.

# PR-007 — recon e SPEC de cobertura/lint — 27/09/2026

- `vitest.config.mts` exclui web e adapters PostgreSQL do denominador principal; `eslint.config.js` usa `recommended` sem tipos. A [SPEC 0148](02_spec/0148_coverage_denominator_and_typed_lint.md) separa inventário/relatórios, mantém pisos 90/85/90/90 e 95% crítico, exige margem de 3 pp e investiga a variação histórica antes de elevar thresholds. Fonte técnica: documentação oficial Vitest e typescript-eslint vinculada na SPEC.
- Somente documentação: `vitest.config.mts` no claim PR-L04 e PR-003 sem candidato certificado impedem BUILD integrado. Sem alteração em `coverage/**`, `certification/**` ou código; produção `NO_GO`.

# PR-306 — revisão documental das ameaças de integração — 27/09/2026

- [Modelo de ameaças](10_phase10/PHASE10_THREAT_MODEL.md) reescrito para ligar canal, provider, RAG, agenda, identidade, ferramentas e CI a controles, testes negativos e prova faltante. Um inventário independente de código/testes confirmou os caminhos citados.
- Crítica factual I1 retornou `REJECT`: handoff sem fonte superestimado no fluxo de conversa, teste SSRF interpretado como minimização de payload, teste de reagendamento superestimado e exfiltração por tool ausente. O documento foi corrigido: conversa sem fonte fica `ACTIVE` com texto de indisponibilidade; classificação declarada e SSRF não provam segredo mal classificado; reagendamento com capability correspondente e política de destino de tool constam como testes pendentes. `docs:check-links` PASS após correção. I2 somente leitura retornou `ACCEPT` para o inventário local, sem aprovar integração real. PR-504/505 receberam as lacunas executáveis; nenhuma integração foi ativada.

# PR-009-PROV — recon da fronteira de CI e SPEC T3 — 27/09/2026

- `verify.yml` usa `CI_RUN_ID` derivado do contexto GitHub, executa os gates num job e envia o diretório mutável depois da finalização. O repositório remoto está público; a documentação oficial do GitHub descreve outputs de passos e atestações. A [SPEC 0147](02_spec/0147_ci_bar_external_provenance.md) propõe selo externo dos hashes/IDs por gate, finalização vinculada ao runner e atestação do manifesto/digest, com limites da ameaça declarados.
- Sem mudança em workflow ou código, sem push e sem certificação. A revisão T3 pelo usuário precede BUILD; produção `NO_GO`.

# PR-008/009 — BUILD T2 e crítica I3–I5 — 27/09/2026

- Código `4b47d81` sob SPEC 0145/0146: digest web pinado; finalizador exige dois hashes E2E, hash/comprovante do log e identidade de run/candidato/Node/exit em gates executados. Testes focados 16/16 PASS; I3/I4 detectaram lacunas corrigidas, I5 detectou mistura de runs corrigida e manteve REJECT para substituição coerente de todo o diretório mutável, que exige âncora externa sob gate de segurança.
- Node 22.23.2 no candidato `2a11435`: `typecheck`, lint, formato, links, build, `audit:security` PASS (0 vulnerabilidades); `npm test` 300 arquivos/2.182 PASS, 20 arquivos/146 skipped sem banco; `test:postgres` em PostgreSQL 16 descartável próprio 35/258 PASS. Banco removido após a execução.
- Worktree detached com `npm ci --ignore-scripts`, `build:runtime`, portas 3210/4184: `ci-bar gate e2e` PASS, Chromium 12/12, UUID `eb8a8c2c-a9ec-441f-a485-3d43157096a7`, sem `outputFailures`; `ci-bar gate image` PASS, runtime `/live` e `/ready` 200. [Par/log/hashes r3](04_audit/evidence/PR009-20260927-r3/proof.json), [imagem](04_audit/evidence/PR008-20260927/proof.json). `ci-bar finalize` parcial saiu 1 pelos 80 itens de outros gates ausentes, sem falha E2E/imagem.
- Build web com digest OCI PASS; HTTP 200 para HTML estático sob opções endurecidas e alias sintético. Sem alias, NGINX saiu 1 por `secretary-api` não resolvido no arquivo de deploy, dependência PR-L10. Certificação completa/CI remoto no SHA integrado e decisão T3 de identidade pendentes; produção `NO_GO`.

# PR-008 — recon e SPEC da imagem web — 27/09/2026

- Dockerfile: estágio web com tag `nginxinc/nginx-unprivileged:1.27-alpine` sem digest e comentário `cvg-agent-secretary:local`. O registry retornou índice OCI multiarch `sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0`.
- [SPEC-PR008-001](02_spec/0146_web_image_digest_and_name.md) registrada sob T2; BUILD ainda não executado. Produção `NO_GO`.

# PR-009 I2 — gate E2E do ci-bar e negativo de snapshot — 27/09/2026

- Worktree detached `1413809`, Node 22.23.2, `npm ci --ignore-scripts`, `build:runtime`, portas próprias 3209/4183. `ci-bar init` gerou candidato `16136c55…`; `ci-bar gate e2e` PASS, Chromium 12/12, UUID `2309ccef-a58c-4dbd-b590-1ac47ea6c00d`, `outputFailures=[]`. Log e snapshots arquivados em [prova I2](04_audit/evidence/PR009-20260927-r2/proof.json), hashes revalidados após cópia.
- Negativo: XML snapshot adulterado apenas em cópia do diretório do ci-bar; `finalize` exit 1 com `e2e_snapshot_hash_mismatch:playwright-results.xml`. Os demais gates foram intencionalmente omitidos na prova isolada, logo o manifesto completo não qualifica produção. E2E compartilhado da PR-L04 não foi tocado.

# PR-009 fatia 3 — correção da crítica I2 — 27/09/2026

- I2 read-only: `REJECT` para o vínculo de `executionId` no certificado, captura de bytes do `certify` e validação dos snapshots do ci-bar. A troca conjunta de UUID em JSON/JUnit era aceita pela verificação anterior.
- Corrigido: comprovante único no log, UUID no gate/manifesto, comparação dentro do verificador, buffers validados e usados para hash pelo `certify`, snapshots validados e hash-bound no estado/finalização do ci-bar. Self-test C30–C32 e 12 testes focados PASS.
- Node 22.23.2: `typecheck`, `lint`, `format:check`, `npm test` 299/2.178 e `test:postgres` 35/258 PASS; banco descartável próprio removido. E2E/ci-bar do código corrigido e nova crítica I2 pendentes. Produção `NO_GO`.

# PR-009 fatia 3 — prova E2E isolada — 27/09/2026

- Worktree detached no commit `6bc3bfc`, Node 22.23.2, dependências de lockfile. Tentativa 1 interrompida após falhas de Vite por `@cvg/shared` sem `dist/`; `npm run build:runtime` em seguida PASS, servidores próprios encerrados antes do retry.
- Tentativa 2 em portas 3209/4183: Chromium 12/12 PASS, `runId=run-pr009-isolated-20260927`, `executionId=f75f3b25-3545-413d-bb5a-6adb530dc095`; wrapper validou JSON/JUnit internos. [Par bruto e manifesto hash](04_audit/evidence/PR009-20260927/proof.json). Fonte e artefatos do diretório compartilhado não foram tocados; certificado integrado ainda pendente.

# PR-009 fatia 3 — BUILD e regressões locais — 27/09/2026

- [SPEC-PR009-003](02_spec/0145_e2e_junit_json_run_binding.md): comando único de Playwright com JSON/JUnit, `executionId` por tentativa, validação interna do par no ci-bar/certificado/verificador. Casos negativos para JSON `{}` e XML de outra tentativa passaram no self-test.
- Node 22.23.2: testes focados 18/18, `typecheck`, `lint`, `format:check`, `docs:check-links` PASS. Primeira `npm test`: 2.176 PASS/1 FAIL por contrato documental da PR-005; corrigi a leitura da decisão histórica para o arquivo arquivado. Segunda `npm test`: 299 arquivos/2.177 PASS, 20 arquivos/146 testes pulados sem banco. `test:postgres`: 35 arquivos/258 PASS em PostgreSQL 16 descartável próprio, removido após o gate.
- Artefato versionado `certification/negative-validation.json` regravado pelo self-test foi restaurado aos bytes do HEAD. E2E real/recertificação ainda pendentes por claim PR-L04 no diretório compartilhado; nenhum dado real, deploy, push ou efeito externo.

# PR-009 fatia 3 — recon e SPEC — 27/09/2026

- Recon read-only: JSON E2E gerado às 02:51:05Z e JUnit às 03:57:02Z; 12 testes em ambos, sem identificadores internos. `PLAYWRIGHT_JSON_OUTPUT_NAME` seleciona JSON e omite JUnit; o verificador atual aceita fixture `{}` e infere E2E do log.
- [SPEC-PR009-003](02_spec/0145_e2e_junit_json_run_binding.md) fixa `executionId` único, `runId`/`candidateId` internos, par da mesma tentativa, inventário/totais e regressões negativas. BUILD T2 ainda não executado; sem alteração de artefatos E2E neste registro.

# Log de execução vigente — PROD-20260926

## 27/09/2026 — PR-005: rotação íntegra dos ledgers

- Gate: task PR-005 em [0356](03_build/0356_production_backlog_2026-09-26.md), classe T1 documental e claim no [quadro de coordenação](08_runtime/agent_coordination.md).
- Fontes originais na revisão `4aac877e5e0c504940c8ef2856928e43a1a5ed2a`: `99_runtime_state.md` 3.853 linhas, SHA-256 `d8092246cb5f597dc32a469c937268b90afbfa2da7d5701e100d9f1a2544b10f`; `20_master_execution_log.md` 7.762 linhas, SHA-256 `576ac3f766e7d9b930bb47f11583c5bb088e8f8526b9b977c5c4ff08c5d8609e`; `30_backlog_master.md` 2.569 linhas, SHA-256 `fedc1c99cfe9333f80c8aad864df0a310995e1d1d5c5c26c427e276dd332f937`.
- Os corpos completos foram preservados em [arquivo do estado](08_runtime/archive/prod20260926_runtime_state_history.md), [arquivo do log](08_runtime/archive/prod20260926_execution_log_history.md) e [arquivo do backlog](08_runtime/archive/prod20260926_backlog_history.md). Apenas os links relativos do corpo foram rebaseados para a nova pasta; a reversão reproduz os SHA-256 originais.
- Estado de produção: `NO_GO`. A rotação documental não altera autorização de produção, resultado de certificação ou estado de gates. Verificação PR-005: `docs:check-links` PASS, `format:check` PASS e três reconstruções SHA-256 PASS.

## Rodada anterior

- [AUD-0579](04_audit/0579_current_candidate_deep_audit_2026-09-27.md) auditou `5c0b791`, registrou `skip:governance` e `certification:verify` em falha, o defeito da sessão confiável no entrypoint e a SPEC T3 correspondente.
- O [log integral anterior](08_runtime/archive/prod20260926_execution_log_history.md) preserva os comandos, resultados, decisões e evidências de todos os ciclos anteriores; SHA-256 dos bytes de origem `576ac3f766e7d9b930bb47f11583c5bb088e8f8526b9b977c5c4ff08c5d8609e`.

# PR-202 — primeira fatia integrada; gates T3 de OIDC/HTTPS aprovados — 28/09/2026

- Sob [SPEC 0153](02_spec/0153_pr202_approval_request_slice.md), branch `f787ad9` e root `69d08d3` moveram somente as três instruções do ramo `REQUIRE_APPROVAL` para helper privado. I1 encontrou releitura mutável de `#options` após aguardar modelo; referências capturadas e teste de mutação corrigiram; I2 `ACCEPT`, sem P0/P1/P2. AST 3/3 igual e hashes de fonte iguais entre branch e root.
- [Prova](04_audit/evidence/PR202-SLICE-20260928/proof.json): Node 22, 13/275 focados, suíte 325/2.393, PostgreSQL 35/258, Chromium 12/12 e cobertura 92,53% statements, 87,66% branches, 95,10% functions, 93,56% lines; tipo/lint/formato PASS. Primeira tentativa E2E sem dist de `@cvg/shared` falhou na preparação isolada; após `build:runtime`, 12/12 PASS. Os três PostgreSQL sintéticos foram removidos.
- `skip:governance` falhou por `SKIP-PG-014` com hash de fonte vencido (`apps/worker/...homolog.integration.test.ts`) sob claim PR-L04; não houve teste ignorado nos gates executados. PR‑202 completa e certificação do SHA composto seguem abertas. O usuário aprovou BUILD T3 sintético das [SPEC 0150](02_spec/0150_cross_origin_operator_console.md) e [0152](02_spec/0152_corporate_oidc_authority_contract.md); sem IdP real, push, deploy ou GO.

# PR-301 — catálogo de fencing e SPEC 0158 — 28/09/2026

- PostgreSQL 16.15 descartável: probe transacional reproduziu que a consulta atual por namespace/nome aceita `webhook_replay_events_fencing_check` em `decoy_fencing` após remover a constraint real, e aceita a constraint homônima `CHECK (true)` na tabela alvo. `ROLLBACK` e consulta confirmaram zero schema residual. [SQL/log/hashes](04_audit/evidence/PR301-FENCING-PREFLIGHT-SPEC-20260928/proof.json).
- [SPEC 0158](02_spec/0158_webhook_fencing_constraint_preflight.md) T3 registra OID/tipo/validação/definição/nulabilidade, PK/índice, durabilidade e objetos de DML. [I1](04_audit/evidence/PR301-FENCING-PREFLIGHT-SPEC-20260928/I1-review.md) rejeitou quatro P1/três P2; texto corrigido e [I2](04_audit/evidence/PR301-FENCING-PREFLIGHT-SPEC-20260928/I2-review.md) `ACCEPT_SPEC_REVIEW_READY`. Nenhum código de segurança alterado; revisão humana e CI/IAM/staging/certificação do SHA final pendentes, produção `NO_GO`.
