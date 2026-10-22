# Crítica independente da SPEC0253, rodada 1

- Alvo: [`docs/02_spec/0253_release_image_ghcr.md`](../../../../02_spec/0253_release_image_ghcr.md), SHA-256 `c3cd75e470522fd2254ed9cbb0fd1bbba9695fad67c4f247191c6a33aa951ca0`.
- Base: worktree detached `/mnt/dados/cvg-work/cvg-d9ef-prodpath-20261021`, HEAD `24cdb463faa1010da5fd78b6d923950ac2741713`.
- Data: 22/10/2026. Crítico com contexto novo, sem participação na redação.
- Método: li os workflows, os scripts, o `Dockerfile`, o `.dockerignore`, os testes de contrato, o README de deploy, os composes, o recon, o snapshot e as duas decisões do usuário. Li também, no SHA pinado, `aquasecurity/trivy-action@ed142fd0` (`action.yaml` `c3cc09c5…`, `entrypoint.sh` `5d35de70…`), `aquasecurity/setup-trivy@3fb12ec1` e `actions/attest@1e69f48a` (`action.yml` `9e4a1b80…`, README `c513a2a2…`). Usei só `gh api` GET, `curl` anônimo GET/HEAD e `docker buildx imagetools inspect`. Nada foi construído, publicado nem alterado fora desta pasta.

## Veredito: `REVISE`

Três obrigatórios. O desenho de origem (R1, R2, regra `githubSha = head_sha`, casamento por nome, app e suíte, PR mesclado) está correto, e não achei caminho em que PR, fork, `schedule`, outro branch ou reexecução publique um SHA sem os 5 checks. Os problemas estão no transporte dos bytes, na âncora de integridade e na máquina de estados de `already_published`.

## O que conferi e está certo

- **Filtro do `workflow_run`.** O `if:` do `gate` barra PR de fork com branch `main` (`event == 'push'` e `head_repository`), PR com head `main` no próprio repositório e o `schedule` do Security (`security.yml:9-10`). A regra 3 reidentifica as execuções donas por `path`, então um workflow novo chamado `Verify` não ajuda ninguém.
- **Identidade da proveniência.** Com `githubSha = head_sha` (regra 2), o arquivo do workflow, o checkout e o `sha`/`ref` do token OIDC são o mesmo commit. A reexecução do release mantém o `GITHUB_SHA` original, e o gate relê a API viva.
- **Checks.** O casamento por nome exato, `app.id 15368` e `check_suite_id` da execução de push está certo. O snapshot mostra os 4 checks do Security na suíte `107249000486` e o REM21 na `107249000371`. No head do PR, `CodeQL` (app 57789) e `codeql` (15368) coexistem.
- **Pins e cache.** Todos os pins citados existem em `verify.yml`/`security.yml`. Com `cache: 'false'`, a trivy-action pula o `actions/cache` do banco (`action.yaml:140-147`) e repassa `cache` ao setup-trivy, que pula restore e save do binário (`setup-trivy` linhas 53-59 e 98-103). O `trivy_envs.txt` é recriado a cada chamada (`action.yaml:156-160`, `entrypoint.sh:11-13`), então os inputs de um passo não vazam para o SBOM. Sem `scanners`, o CycloneDX sai sem vulnerabilidades.
- **Releases imutáveis.** `aquasecurity/trivy` v0.70.0 e `trivy-action` v0.36.0 têm `immutable: true` (API, 22/10).
- **Frontend.** `docker/dockerfile:1.7` resolve hoje para o índice `sha256:a57df69d…` (`imagetools inspect`), o mesmo valor de §3.7.
- **Manifesto bruto.** `imagetools inspect --raw` preserva os bytes: o SHA-256 da saída é igual ao digest pedido (teste local com o índice acima).
- **attest.** `push-to-registry`, `create-storage-record` (só para organização) e `sbom-path` existem no SHA pinado. O modo SBOM exclui predicado próprio.
- **Regressões.** Nenhum teste existente enumera `.github/workflows` nem fixa a linha 1 do `Dockerfile`. `ci-bar-contract` só exige `FROM node:22…@sha256` (linhas 360-365), então P5 é plausível.

## OBRIGATÓRIOS

### M1. O tarball da imagem vira artefato público e contradiz G6 e a própria SPEC

- **Evidência.**
  - §3.3, passo 8, sobe `image.tar` como artefato `release-image-tar-<run>-<attempt>` (`retention-days: 1`, o mínimo), e §3.4 o baixa.
  - O repositório é público (snapshot `visibility: public`). A listagem de artefatos é anônima: `GET /repos/…/actions/artifacts` respondeu 253 artefatos, entre eles `cyclonedx-sbom` e `cvg-ci-bar-…`. O download anônimo responde `401`, mas qualquer conta GitHub autenticada tem leitura num repositório público e baixa o zip.
  - Com isso, os bytes da imagem de produção ficam disponíveis a qualquer pessoa logada por pelo menos 24 h a cada release.
  - Isso contradiz G6 ("GitHub Container Registry privado", `production-0374.json`), o objetivo de R8 e a frase de §8 "Os bytes da imagem ficam privados". O risco também não aparece na lista de "Metadados públicos".
- **Por que é obrigatório.** O BUILD implementaria um canal público para os bytes que o usuário decidiu manter privados. A regra do usuário é que premissa nova para e volta a ele.
- **Correção.** A SPEC escolhe uma das saídas e a registra:
  - **(a) Redesenhar o transporte, sem premissa nova.** Exemplo: um único job privilegiado faz `build → smoke → save`. A Trivy roda como contêiner pinado (`aquasec/trivy:0.70.0@sha256:…`, a mesma distribuição de L3), com o tarball montado só leitura, sem socket do Docker, sem env do runner e sem token. Depois vêm `docker login`, push e attest. O login só acontece depois da varredura. R4, §3.1, §3.3, §3.4, P1 e §8 mudam de acordo. Nesse desenho não sobra action de terceiro no caminho, e L3 passa a ser idêntico ao CI.
  - **(b) Manter os dois jobs e levar ao usuário,** como decisão explícita, a janela pública do tarball, corrigindo §8.

  Outros canais entre jobs (cache, por exemplo) não servem, porque R4 os proíbe com razão.

### M2. A âncora de integridade dos bytes não está fixada antes do código de terceiro

- **Evidência.** No desenho atual, a trivy-action (composite) roda no job `build` com acesso ao daemon Docker e ao disco. Ela altera os passos seguintes do mesmo job:
  - prefixa o próprio diretório no `GITHUB_PATH` (`action.yaml:148-152`);
  - o setup-trivy prefixa `trivy-bin` (linhas 90-92);
  - grava `trivy_envs.txt` e `.cache/trivy` no workspace (`action.yaml:56-59,156-160`).

  §3.3 diz que "o passo registra o SHA-256 do tarball" (passo 4) e lista as saídas `tarball_sha256`, `config_digest` e `build_record_sha256` (passo 8), mas não diz qual passo as emite. O caminho natural de implementação é emiti-las pelo `release-image-record.mjs build` (passo 7), que roda depois da Trivy. Nesse caso, um scanner comprometido, ou uma exploração de parser pela imagem ou pelo banco baixado, troca `image.tar`. O registro e as saídas passam a descrever os bytes trocados, a conferência de §3.4.1 passa, e o publish atesta bytes que não são os do build. R5 ("os bytes publicados vêm do tarball cujo SHA-256 foi registrado no build") fica vazio justamente contra o único código de terceiro do caminho. Hoje o pin e a release imutável reduzem a probabilidade, mas não o impacto.
- **Correção.**
  - `tarball_sha256` e `config_digest` são saídas de um passo com `id` que roda logo depois do `docker save` e antes de qualquer `uses:` de terceiro. Nenhum passo posterior as redefine.
  - O publish confere o tarball e o `config.digest` só contra essas saídas e revalida o `build-record` com o contrato a partir do próprio checkout.
  - P1 verifica a ordem (o passo que emite as âncoras vem antes do primeiro `aquasecurity/`), e um mutante "âncoras emitidas pelo passo de registro" precisa morrer.
  - Se M1 for resolvido por (a), a mesma regra vale com o tarball montado só leitura e hasheado antes de o contêiner da Trivy rodar.

### M3. `already_published` aceita publicação incompleta e mascara a falha

- **Evidência.** A regra 7 de §3.2 e o passo 4 rodam um único `gh attestation verify`, com o predicado padrão (proveniência SLSA). Em §3.4, a sequência é push → proveniência (passo 5) → SBOM (passo 6) → `release-image.json` (passo 7). §3.5 vem depois.
  - Se a proveniência passar e a attestation de SBOM falhar por erro transitório de Sigstore ou GHCR, o run fica vermelho.
  - A recuperação que a própria SPEC recomenda (§4: "A reexecução do próprio run cobre falha transitória") cai no gate com tag presente e proveniência válida. A decisão é `already_published`, o run fica verde e nada mais roda: falta a attestation de SBOM (R6), não existe `release-image.json` (§3.4.7, que o deploy de §3.8 consome) e o `release-verify` não roda (R7, R8).
  - O mesmo acontece se o pacote nascer público e o usuário escolher "Re-run all jobs" em vez de "Re-run failed jobs": verde sem sonda de privacidade.
  - O item "Publicação parcial" de §8 afirma que a reexecução dá `refuse`, o que só vale quando a falha foi na proveniência.
- **Correção.**
  - `already_published` exige a pós-condição inteira: proveniência verificada (signer, `--source-digest S`, `--source-ref refs/heads/main`, `--deny-self-hosted-runners`), attestation `https://cyclonedx.org/bom` do mesmo signer para o mesmo digest e sonda anônima `DENIED`. Tag presente com qualquer item faltando dá `refuse` e triagem manual.
  - P3 ganha as variantes "tag com só proveniência dá `refuse`" e "tag com as duas attestations e pacote público dá `refuse`".
  - §8 e o texto de §4 sobre reexecução são ajustados.

## OPCIONAIS

1. **Fato errado em §8 (lista de checks duplicada).** "O `GITHUB_TOKEN` não lê a proteção" não procede. `GET /repos/ricardoakinaga-dev/cvg-operational-harness/branches/main` devolve `protection.required_status_checks.checks` (contexto e `app_id`), inclusive sem autenticação (conferido em 22/10). O gate pode comparar esse conjunto com `REQUIRED_CHECKS` e dar `refuse` se divergirem, o que elimina a "regra de procedimento".
2. **`filter=all` nos check-runs.** `GET commits/S/check-runs` usa `filter=latest` por padrão. Um Security por `schedule` mais novo no mesmo SHA pode esconder os checks da suíte de push e dar `refuse` sem causa real. É falha fechada, mas confunde. Use `filter=all` ou `GET check-suites/{check_suite_id}/check-runs?filter=all` por suíte dona. Registre também em §8 que o `schedule` do Security compartilha o grupo de concorrência do push na `main` (`security.yml:15-17`, `cancel-in-progress: true`) e pode cancelar o Security de push. A recuperação é reexecutar o Security de push.
3. **Classificar "tag ausente".** No gate e no passo 3 de §3.4, só respostas explícitas de inexistência contam como ausente (`MANIFEST_UNKNOWN`, `NAME_UNKNOWN`, 404, ou o `DENIED` de pacote inexistente). Erro 5xx, timeout ou qualquer outro falha. Sem isso, dois erros transitórios seguidos levam a sobrescrever `sha-S` com outro digest, contra R5. Inclua a resposta real do GHCR na lista "só o primeiro run prova".
4. **Mutantes de P1 a acrescentar:**
   - `if: always()`, `!cancelled()` ou `failure()` em `build`, `publish` ou `release-verify`;
   - `actions/download-artifact` com `run-id` ou `github-token` (artefato do run disparador, o envenenamento clássico de `workflow_run`);
   - `${{ github.event.workflow_run.* }}` interpolado dentro de `run:` (passar por `env:`);
   - `docker tag`/`docker push` para qualquer tag além de `sha-S`;
   - `packages: write` no `gate`.
5. **Fixture real incompleto.** O snapshot não traz as execuções `pull_request` do head do PR, que a regra 6 usa. Por GET conferi que existem: Verify `39561779898` (suíte `107209420265`) e Security `39561779918` (suíte `107209420311`), ambas `success`, evento `pull_request`. O BUILD precisa capturá-las para o "fixture real" de P3 ser real.
6. **"Exatamente um item em `pulls`".** Diga se é filtrar e depois contar (`merged_at`, `base.ref = main`, `merge_commit_sha = S`, mesmo repositório) ou contar a resposta crua. PR aberto que contém `S` dá `refuse` ou é ignorado?
7. **Concorrência no topo do workflow.** Execuções de `workflow_run` vindas de PR ou `schedule` com o mesmo SHA entram no grupo antes do `if:`. Uma pendente mais nova cancela a pendente mais velha, inclusive a que publicaria. É improvável (o gate dura minutos) e se recupera com reexecução, mas vale registrar.
8. **Trivy em CI e em L3.** L3 usa o contêiner `aquasec/trivy:0.70.0`, e o CI usa a action (setup-trivy → `install.sh` → release v0.70.0). O mapeamento da composite (`input` vira `TRIVY_INPUT` com alvo posicional `.`, `entrypoint.sh:16-20,86`) só se prova no primeiro run, e isso deve entrar na lista. Registre também o SHA-256 do binário `trivy` no `build-record`. A opção (a) de M1 elimina essa diferença.
9. **Tags de referrers.** Se o GHCR não servir a API de referrers, `push-to-registry` usa o esquema de tag `sha256-<hex>`. Troque "A única tag é `sha-S`" (R5) por "a única tag de imagem criada pelo release" e registre as tags do pacote no primeiro run.
10. **Metadados públicos.** Registrar como risco aceito, de preferência com ciência do usuário, que SBOM, relatório Trivy, logs e attestations (API do GitHub e Rekor) são públicos e ligam o digest de produção ao release. O conteúdo já é derivável do repositório e segue o modelo atual (`cyclonedx-sbom`, `trivy-image-report`).
11. **Cota do GHCR privado.** Com uma publicação por SHA que sobrevive na ponta da `main`, o armazenamento cresce. Registre o limite do plano e que, com limite de gasto zerado, o push falha fechado.
12. **§3.8 (servidor).** Verificar também a attestation CycloneDX e exigir uma versão do `gh` com `attestation verify --bundle-from-oci --source-ref`. O `gh` local é 2.45.0 e não tem `attestation`.
13. **README C9.** Deixar explícito que o "digest registrado pela certificação/CI" passa a ser o de `release-image.json`, não o de `certification/runtime-image.json` (`repoDigests` vazio).
14. **Reexecução parcial.** Com o nome exato `release-image-tar-<run>-<attempt>`, "Re-run failed jobs" do `publish` não acha o artefato da tentativa anterior. A falha é fechada, mas convém documentar. O `release-verify` já usa padrão (`cvg-release-image-*`).

## Premissa nova?

**Sim, implícita, enquanto M1 não for resolvido por redesenho.** Publicar `image.tar` como artefato de workflow num repositório público expõe os bytes da imagem por pelo menos 24 h a qualquer conta GitHub. Isso contradiz G6 ("GHCR privado") e a afirmação de §8 de que os bytes ficam privados. Ou a SPEC muda o transporte, ou isso volta ao usuário como decisão.

Fora isso, não há premissa nova:

- o `GITHUB_TOKEN` é o único segredo;
- o Sigstore keyless já é usado;
- o GHCR do próprio dono é o da decisão G6;
- não há mudança na proteção;
- não há action nova: toda action tem o mesmo pin já revisado, e `gh`, `buildx` e `docker` já vêm no runner;
- as imagens `registry:2` e `aquasec/trivy` só entram nas provas locais.

O custo e a cota do GHCR privado cabem em G6, mas não foram dimensionados (opcional 11).
