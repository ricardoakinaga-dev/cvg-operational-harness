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
