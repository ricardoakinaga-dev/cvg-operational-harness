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
