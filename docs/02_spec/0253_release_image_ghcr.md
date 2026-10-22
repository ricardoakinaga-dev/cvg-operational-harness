# SPEC0253 — Release da imagem do harness: build pela receita no CI, SBOM do artefato e publicação no GHCR privado por digest

**PROPOSTA T3 (segurança e cadeia de suprimento), revisão r4. O BUILD depende do APPROVE do crítico independente, sem obrigatórios**, conforme a [decisão do usuário de 21/10/2026](../04_audit/evidence/RELEASE-CI-0253-20261021/user-decision-20261021.json) e a [de 22/10/2026](../04_audit/evidence/RELEASE-CI-0253-20261021/user-decision-20261022.json) (o usuário cria uma vez o pacote privado; o release nunca cria o pacote). Premissa nova ou migração param a execução e voltam ao usuário. A primeira publicação real no GHCR só acontece a partir da `main`, com os 5 checks obrigatórios verdes, e sem deploy. Task `RELEASE-CI-0253-20261021`. Origem: decisão G6 de 16/10 ([production-0374.json](../04_audit/evidence/USER-DECISIONS-20261016/production-0374.json): GHCR privado, CI publica com digest, servidor baixa pelo digest) e item C9 da Fase C do [plano 0374](../03_build/0374_plano_producao_harness.md) ("mesmo digest da imagem em CI e em produção"). A pendência "build pela receita completa no CI e SBOM do artefato" da [PISO-007/PISO-008](../04_audit/evidence/AUD0621-PRODUCT-PISO008-20261021/ledger-delta.md) é da imagem do produto. Esta SPEC fecha a mesma lacuna para o harness e não fecha a do produto ([ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md)). Constituição: [D-12/T3](../07_agents/AGENTS.md). Fatos e hashes: [recon](../04_audit/evidence/RELEASE-CI-0253-20261021/recon.md) e [snapshot de API](../04_audit/evidence/RELEASE-CI-0253-20261021/api-snapshot-24cdb463.json).

Histórico de revisões:

- **r2** ([revisão r1](../04_audit/evidence/RELEASE-CI-0253-20261021/spec-review-r1/review.md), [correções](../04_audit/evidence/RELEASE-CI-0253-20261021/spec-review-r1/corrections.md)):
  - nenhum artefato com os bytes da imagem;
  - âncoras de integridade logo depois do `docker save`;
  - `already_published` só com a pós-condição inteira.
- **r3** ([revisão r2](../04_audit/evidence/RELEASE-CI-0253-20261021/spec-review-r2/review.md), [correções](../04_audit/evidence/RELEASE-CI-0253-20261021/spec-review-r2/corrections.md)):
  - a Trivy não tem nenhuma montagem gravável do host, e relatórios e SBOM saem pelo stdout para `evidence/`;
  - o banco é baixado num passo à parte, e as varreduras rodam sem rede;
  - o `gate` faz login de leitura no GHCR antes de verificar attestations;
  - a Trivy passa a ser a `0.75.0`, que já tem as correções dos advisories de 2026.
- **r4** ([revisão r3](../04_audit/evidence/RELEASE-CI-0253-20261021/spec-review-r3/review.md), [correções](../04_audit/evidence/RELEASE-CI-0253-20261021/spec-review-r3/corrections.md), [decisão de 22/10](../04_audit/evidence/RELEASE-CI-0253-20261021/user-decision-20261022.json)):
  - o release nunca cria o pacote: antes do push, o `gate` e o passo de publicação exigem pacote existente, privado e tag ausente com `MANIFEST_UNKNOWN`;
  - o pacote privado é criado uma única vez pelo usuário, fora do CI, com credencial própria e só uma imagem placeholder;
  - uma só chamada da Trivy tem rede (o download do banco), e os flags de versão e telemetria valem só para `trivy image`.

Base: `24cdb463faa1010da5fd78b6d923950ac2741713` (main remota em 21–22/10). Links relativos a `docs/02_spec`; âncoras de linha desta base. Fora desta SPEC: dado real, provider, canal, deploy, servidor, segredo novo e mudança na proteção da `main`.

## 1. CURRENT — problema e evidência

### 1.1 Nada publica a imagem

Nenhum workflow faz `docker login` ou `docker push`, e nenhum pede `packages: write`. O teste do workflow do produto chega a proibir push (`tests/ci-workflow-contract.test.js:297`). A imagem que a barra testa nasce e morre no runner: `certification/runtime-image.json` sai com `repoDigests` vazio (`scripts/runtime-image-record.mjs:59-60`). O compose de produção exige `${CVG_HARNESS_IMAGE_REPOSITORY}@${CVG_HARNESS_IMAGE_DIGEST}` para `migrate`, `api` e `worker` (`deploy/harness/compose.production.yaml:26,54,80,141`), e o on-prem usa a mesma referência no `alert-relay` (`compose.onprem.yaml:40`). Os placeholders apontam para `registry.example.invalid` (`.env.example:33-34`). A C9 do runbook descreve o caminho esperado: CI publica no GHCR privado, o servidor baixa por digest e o smoke compara os digests (`deploy/harness/README.md:52,304-330`). Esse caminho ainda não existe.

### 1.2 A receita e os gates existentes

- **Receita única:** `Dockerfile` na raiz, estágios `build` → `prod-deps` → `runtime` (distroless `nonroot`, `USER cvg`, `CMD ["node","apps/api/dist/main.js"]`) e `web` (`Dockerfile:7-51`). Os quatro `FROM` estão pinados por digest (7, 20, 33, 48).
- **Frontend sem pin:** `# syntax=docker/dockerfile:1.7` não tem digest (`Dockerfile:1`). O BuildKit baixa o frontend pela tag a cada build. No image-scan de 21/10 ele resolveu para `docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e`; os críticos r1 e r2 confirmaram o mesmo índice em 22/10.
- **Gate `image` da barra** (`scripts/ci-bar-contract.mjs:237-242`; comando em `scripts/ci-bar.mjs:605-619`): `docker build --pull --target runtime --tag <tag local> .`, smoke `docker run --rm --network none --read-only --tmpfs /tmp --cap-drop=ALL --security-opt no-new-privileges <tag> node scripts/runtime-image-smoke.mjs` e registro validado por `validateRuntimeImageManifest` (`scripts/runtime-image-contract.mjs:16-71`: usuário `cvg`, `CMD`, smoke 200/200, base pinada).
- **Job obrigatório `image-scan`** (`.github/workflows/security.yml:95-136`): reconstrói `--target runtime` sem `--pull` (110) e roda Trivy por `aquasecurity/trivy-action@ed142fd0…` v0.36.0 (112), que instala a Trivy `0.70.0`. HIGH/CRITICAL com correção publicada falham (115-118); o relatório completo é informativo (120-130).
- **Contrato da barra:** exige `FROM node:22…@sha256` (`ci-bar-contract.mjs:360-365`).

### 1.3 O SBOM atual não é do artefato

`npm run sbom` (`scripts/generate-sbom.mjs:1-71`) lê o `package-lock.json` e gera CycloneDX 1.5 com todas as dependências, inclusive as de dev (marcadas `cvg:dev`, 49-52). Roda no gate `sbom` (`ci-bar-contract.mjs:243-248`) e no job `supply-chain` (`security.yml:86-93`). Esse SBOM não lista os pacotes do SO do distroless nem o binário `node`, lista dependências que não estão na imagem e não se liga a nenhum digest.

### 1.4 O SHA da `main` não é o SHA testado no PR

**Proteção viva (21–22/10).**

- São 5 contextos, todos com `app_id 15368`, mais `strict: false`, `enforce_admins: true`, histórico linear, 0 aprovações e sem force push. Não há rulesets.
- `GET /repos/…/branches/main` devolve, até sem autenticação, `protected: true`, `protection.enabled: true` e `required_status_checks` com `enforcement_level: everyone` e os 5 `checks` (contexto e `app_id`).

**Merge por squash.** `24cdb463` é o `merge_commit_sha` do PR #13 (head `b7519a38…`, 21 commits). Os checks de `pull_request` ficam no head do PR e nunca chegam ao SHA da `main`.

- O head do PR tem as execuções `pull_request` Verify `39561779898` (suíte `107209420265`) e Security `39561779918` (suíte `107209420311`), ambas `success`.
- Tem também `CodeQL`, do app 57789 (code scanning), diferente do `codeql` obrigatório (app 15368).

**Checks no SHA da `main`.** Como `verify.yml` e `security.yml` também rodam em `push` na `main` (`verify.yml:3-8`, `security.yml:3-10`), o SHA da `main` recebe os mesmos 5 checks por execuções de push. Em `24cdb463`, `REM21 CI bar (Node 22)` está na suíte do Verify (`107249000371`) e os outros 4 na suíte do Security (`107249000486`).

**Tempos e cancelamentos.**

- O Security de push leva 5–8 min; o Verify de push leva 2h03–2h44.
- O Verify cancela a execução anterior da mesma ref (`verify.yml:13-15`). 3 das 8 últimas execuções de push na `main` foram canceladas pelo merge seguinte.
- O Security também roda por `schedule` semanal (`security.yml:9-10`), no mesmo grupo de concorrência do push na `main`, com `cancel-in-progress: true` (`security.yml:15-17`).
- `GET commits/{sha}/check-runs` usa `filter=latest` por padrão.

### 1.5 `workflow_run` e a identidade da execução

Um workflow disparado por `workflow_run` usa o arquivo e o `GITHUB_SHA` do último commit da branch padrão no momento do disparo, não o `head_sha` da execução que o disparou. A proveniência da `actions/attest` e o certificado do Sigstore registram esse `GITHUB_SHA` e essa ref. Se o release construísse `head_sha` com `GITHUB_SHA` diferente, a proveniência apontaria para outro commit. O filtro `branches: [main]` do `workflow_run` vale para o `head_branch` da execução disparadora. PRs internos de outra branch não criam execução; `schedule` na `main` e PR de fork com branch `main` criam.

### 1.6 Attestation, Trivy e actions já revisadas

- **Assinatura sem segredo já existe.** O job `attest` usa `actions/attest@1e69f48a…` (v4) com `id-token`, `attestations` e `artifact-metadata: write`. O `provenance-verify` confere com `gh attestation verify --signer-workflow … --source-digest … --deny-self-hosted-runners` (`verify.yml:245-412`).
- **`actions/attest` no SHA pinado:**
  - aceita `subject-name`, `subject-digest`, `push-to-registry`, `sbom-path` (SPDX/CycloneDX até 16 MB) e `create-storage-record`;
  - sem predicado, gera proveniência SLSA v1, e o SBOM vira predicado `https://cyclonedx.org/bom` sem edição;
  - com `push-to-registry`, lê a credencial do registro na config do Docker (`@sigstore/oci`);
  - com `create-storage-record: false`, não chama a API de storage record;
  - em repositório público, usa o Sigstore público.
- **`gh attestation verify oci://…`:** resolve o digest e busca referrers (`--bundle-from-oci`) com a keychain do Docker (`authn.DefaultKeychain`). `GH_TOKEN` não serve de credencial de registro, então pacote privado exige `docker login` antes.
- **`actions/upload-artifact@ea165f8d`:** segue symlinks (`followSymbolicLinks: true`).
- **Trivy:**
  - Advisories:
    - `GHSA-69fq-xp46-6x23` (crítico, 21/03/2026): comprometimento do ecossistema, com `trivy` 0.69.4, `trivy-action < 0.35.0`, `setup-trivy < 0.2.6` e imagens do Docker Hub afetados;
    - `GHSA-mcj4-mphf-j9ff` (alto, `< 0.71.1`): banco forjado escreve fora do destino;
    - `GHSA-q3fv-x8vg-qqm4` (médio no repositório, alto no banco global, `< 0.71.0`);
    - `GHSA-8rc5-4fr6-64pw` (médio, `< 0.72.0`).
  - A `0.70.0` do `image-scan` está no intervalo dos três últimos.
  - A release `v0.75.0` (01/10/2026) é imutável e já tem as correções dos três. Imagem: `ghcr.io/aquasecurity/trivy:0.75.0`, índice `sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa`; o manifesto `linux/amd64` é `sha256:9db09910…`. A config não declara `User`, então o contêiner roda como root (uid 0). O índice tem um bundle Sigstore anexado, com signer `aquasecurity/trivy/.github/workflows/reusable-release.yaml@refs/tags/v0.75.0` e commit `591e9799…`, lido pelo crítico r3 sem verificação criptográfica.
  - A `v0.76.1` (21/10) traz a mitigação do incidente da CA eMudhra (Go 1.27.3). Na `0.75.0`, o efeito se limita à confiança TLS do download do banco; a subida fica no cartão SEC-TRIVY (§4).
  - Na `0.75.0`, a documentação confirma `--input`, `--download-db-only`, `--skip-db-update`, `--skip-java-db-update`, `--offline-scan`, `--db-repository`, `--skip-version-check`, `--disable-telemetry` e `trivy version --format json`.
  - Sem `--skip-version-check` e `--disable-telemetry`, `trivy image` chama `check.trivy.dev`. Esses flags são só de `trivy image`; `trivy version` não os aceita e não faz essa chamada.
  - O banco padrão vem de `mirror.gcr.io/aquasec/trivy-db:2`, com reserva em `ghcr.io/aquasecurity/trivy-db:2`.
- **trivy-action pinada** (`ed142fd0…`): composite que repassa `github.token`, usa `actions/cache` e escreve no `GITHUB_PATH` e no workspace (`action.yaml:98-160`).
- **Pins já revisados no repositório:** checkout `11d5960a…`, setup-node `49933ea5…`, upload-artifact `ea165f8d…`, download-artifact `d3f86a10…`, attest `1e69f48a…`, trivy-action `ed142fd0…`.
- **Ausentes no repositório:** action `docker/*`, actionlint, zizmor e parser YAML no lockfile. Os testes de workflow são textuais. O repositório tem `sha_pinning_required: false`.

### 1.7 Daemon e visibilidade

- **Runner:** `ubuntu-24.04` (20261012.334.1) com BuildKit no "docker driver" e store clássico (log do image-scan: `writing image sha256:…`). O readme do runner traz Docker 28.0.4, Buildx 0.38.0 e Skopeo 1.13.3. O `docker login` grava a credencial em claro na config do Docker.
- **Máquina local:** Docker 29.1.3 com containerd snapshotter. Ali o ID da imagem não é o digest da config, e `docker build` pode anexar attestation (índice). A identidade da imagem precisa valer nos dois stores.
- **Visibilidade:** o repositório é **público**.
  - Logs e attestations são legíveis por qualquer pessoa.
  - A lista de artefatos de workflow é anônima, e qualquer conta GitHub autenticada baixa.
  - A attestation do manifesto da barra e os artefatos `cyclonedx-sbom` e `trivy-image-report` já são públicos hoje.
  - Um pedido anônimo de token de pull para `ricardoakinaga-dev/cvg-operational-harness` volta `DENIED`, seja o pacote privado ou inexistente. Pacote público recebe token.
- **Pacote no GHCR (documentação do GitHub, revisão r3):**
  - em "Publishing and installing a package with GitHub Actions": pacote criado por workflow com `GITHUB_TOKEN` "inherits the visibility and permissions model of the repository where the workflow is run". Este repositório é público, então um pacote criado pelo release nasceria público;
  - em "Configuring a package's access control and visibility": "Once you make a package public, you cannot make it private again."

## 2. Invariantes

- **R1 — Origem.** O release só publica o SHA `S` quando todas as condições abaixo valem:
  - (a) `S` é o `head_sha` de uma execução de `Verify` ou `Security` concluída com `success`, evento `push`, branch `main` e repositório igual a este;
  - (b) `S` é igual ao `github.sha` do release (§1.5);
  - (c) os 5 checks obrigatórios de `S` estão `completed/success`, com nome exato, `app.id 15368` e na suíte da única execução de push do workflow dono, que também concluiu com `success`;
  - (d) `S` é o `merge_commit_sha` de exatamente um PR mesclado na `main`, e o head desse PR tem os mesmos 5 checks `success` nas suítes das execuções de `pull_request` dos workflows donos;
  - (e) a proteção viva da `main` está ativa (`protected` e `enabled`), com `enforcement_level: everyone`, e exige exatamente o conjunto `REQUIRED_CHECKS` (contexto e `app_id`).

  Basta faltar um item para nada ser publicado.

- **R2 — Gatilho.** Só `workflow_run` `completed` de `Verify` e `Security`, com filtro `main`. Nunca `pull_request`, `pull_request_target`, `push`, `workflow_dispatch`, `schedule` nem tag.
- **R3 — Receita.** Mesma receita do gate `image`: `Dockerfile` da raiz em `S`, `--pull`, `--target runtime` e contexto `.` de um checkout limpo. Só três tipos de adição são permitidos:
  - `--provenance=false`;
  - `--sbom=false`;
  - dois `--label` OCI: `org.opencontainers.image.source` e `org.opencontainers.image.revision`.

  Sem `--build-arg`, `--secret`, `--ssh`, `--file`, `--network`, `--platform`, `--cache-from` ou `--cache-to`. Toda imagem que o build baixa fica pinada por digest, inclusive o frontend `# syntax`.

- **R4 — Privilégio e código de terceiro.**
  - **Escrita.** Só o job `release` tem escrita: `packages`, `id-token` e `attestations: write`.
  - **Proibições.** Nenhum job do caminho de release usa:
    - action de terceiro;
    - `actions/cache` ou `cache:` de `setup-node`;
    - `npm ci`, `npm install` ou `npx` no host.
  - **Scripts próprios.** Só importam módulos `node:` e os contratos locais.
  - **Trivy.** É o único código de terceiro fora do build. Roda como contêiner pinado por digest e nunca recebe:
    - variável do runner, token, socket do Docker ou credencial de registro;
    - montagem gravável de caminho do host.
  - **Entradas e saídas do contêiner:**
    - o tarball, montado como arquivo só leitura;
    - um volume Docker nomeado do próprio job para o banco, que o host nunca lê;
    - relatórios e SBOM saem só pelo stdout do contêiner, redirecionado pelo shell do host para `evidence/`, um diretório que nunca é montado em contêiner.
  - **Rede.** O download do banco roda num contêiner sem o tarball. Varredura, relatório e SBOM rodam com `--network none`. Tudo acontece antes do `docker login`.
  - **Build.** As dependências npm executadas pelo `npm run build:*` rodam dentro do BuildKit, sem o ambiente do runner nem segredo, como no gate `image` de hoje.
- **R5 — Identidade e âncoras.**
  - **Âncoras:** o passo `anchors`, logo depois do `docker save` e antes de qualquer código de terceiro, emite `tarball_sha256` e `config_digest`. Nenhum passo posterior as redefine; varredura, registro, push e attestation só conferem contra elas.
  - **Digest:** a identidade é o digest do manifesto no GHCR. O manifesto publicado é um image manifest único (não índice), e seu `config.digest` é a âncora. A config lista os `diff_ids` das camadas, então o conteúdo publicado é o que passou pelo smoke, pela Trivy e pelo SBOM.
  - **Tags:** a única tag de imagem criada pelo release é `sha-<S em 40 hex>`, criada uma vez. Nunca `latest`, semver ou outra tag móvel. Tag existente nunca é sobrescrita. As tags `sha256-<hex>` que a `actions/attest` pode criar no esquema de referrers não são tags de imagem. As tags `placeholder-*`, do usuário (§9), são ignoradas pelo gate e nunca são reescritas.
- **R6 — SBOM do artefato.** CycloneDX JSON gerado pela Trivy do contêiner pinado, sobre o tarball âncora. O SBOM:
  - tem `aquasecurity:trivy:ImageID` igual a `config_digest`;
  - tem componentes `pkg:deb` e `pkg:npm`;
  - não tem seção de vulnerabilidades;
  - é atestado no digest, a partir de `evidence/`, e não é editado depois de gerado.
- **R7 — Proveniência.** Proveniência SLSA v1 pela `actions/attest` já pinada, com subject `ghcr.io/<dono>/cvg-operational-harness` + digest, gravada no GHCR e no armazenamento de attestations do GitHub. Um job independente verifica signer workflow, source digest `S`, source ref `refs/heads/main` e ausência de runner self-hosted, para a proveniência e para o SBOM, pela API e pelo GHCR.
- **R8 — Privado.**
  - **O release nunca cria o pacote.** Só publica em pacote que já existe e é privado. Antes do push, o `gate` (regra 8) e o passo 14 do `release` exigem três coisas; qualquer outra resposta dá `refuse`, sem push:
    - `tags/list` autenticado com o token do job = 200 (pacote existe e o repositório tem acesso);
    - sonda anônima de token `DENIED` (privado);
    - tag `sha-S` ausente só com manifesto 404 `MANIFEST_UNKNOWN`.
  - Nenhum artefato, cache ou log do workflow contém os bytes ou as camadas da imagem por operação normal; eles só saem do runner para o GHCR.
  - Depois da publicação, a sonda anônima roda de novo, como defesa redundante. Se vier token, o release fica vermelho e a situação volta ao usuário, porque pacote público não volta a privado.
  - `already_published` só vale com a pós-condição inteira: proveniência e SBOM verificados pela API e pelo GHCR, e sonda anônima `DENIED`.
- **R9 — Escopo.** Ficam como estão: `verify.yml`, `security.yml` (inclusive a Trivy `0.70.0` do `image-scan`), workflow do produto, `ci-bar*`, `runtime-image-*`, proteção da `main`, lockfile, compose, `.env.example` e código de app, pacote ou produto.
- **R10 — Release não é produção.** Publicar não concede deploy, produção nem release T4. O caminho de release só fala com:
  - GitHub, `ghcr.io` (pacote, imagem da Trivy e `ghcr.io/aquasecurity/trivy-db:2`) e Sigstore;
  - os registros que o build já usa (Docker Hub para `node` e o frontend, `gcr.io` para o distroless, npm).

  Não fala com `check.trivy.dev`, `mirror.gcr.io` nem `docker.io/aquasec`.

## 3. PROPOSED — contrato

### 3.1 Workflow `.github/workflows/release-image.yml`

```yaml
name: Release image
on:
  workflow_run:
    workflows: [Verify, Security]
    types: [completed]
    branches: [main]
permissions: {}
concurrency:
  group: release-image-${{ github.event.workflow_run.head_sha }}
  cancel-in-progress: false
jobs:
  gate: # contents, actions, checks, pull-requests, packages, attestations: read
    if: >-
      github.event.workflow_run.conclusion == 'success' &&
      github.event.workflow_run.event == 'push' &&
      github.event.workflow_run.head_branch == 'main' &&
      github.event.workflow_run.head_repository.full_name == github.repository &&
      github.ref == 'refs/heads/main'
    # outputs: decision, publish, sha
  release: # contents: read, packages: write, id-token: write, attestations: write
    needs: gate
    if: needs.gate.outputs.publish == 'true'
    # outputs: digest, artifact_name
  release-verify: # contents: read, packages: read, attestations: read
    needs: [gate, release]
```

**Regras gerais dos jobs:**

- `runs-on: ubuntu-24.04`, que é o que `ubuntu-latest` resolve hoje. Com o nome explícito, trocar de daemon exige PR.
- `timeout-minutes`: gate 15, release 60, verify 15.
- Checkout sempre com `persist-credentials: false`, e `actions/setup-node` com `node-version-file: .nvmrc`, sem `cache`.
- Nenhum `continue-on-error`.
- O `if:` de job de `release` e `release-verify` nunca usa `always()`, `!cancelled()` nem `failure()`.
- `if: always()` de passo só é permitido nos passos de limpeza nomeados:
  - `Cleanup gate registry login`, no `gate`;
  - `Cleanup release`, no `release`;
  - `Cleanup verify registry login`, no `release-verify`.

**Actions e expressões:**

- Só actions de primeira parte (`actions/*`), pinadas por SHA de 40 hex com comentário `# vN` e com o mesmo pin já usado em `verify.yml` ou `security.yml`. Nenhuma action de terceiro e nenhuma `aquasecurity/*` como `uses:`.
- Valor de `github.event.workflow_run.*` só entra em passo `run:` por `env:`, nunca interpolado no script.
- `TRIVY_IMAGE` só é declarado no `env:` dos passos que rodam a Trivy, nunca no nível do job ou do workflow.

**Nome da imagem:** `ghcr.io/${github.repository}` em minúsculas, isto é, `ghcr.io/ricardoakinaga-dev/cvg-operational-harness`, o nome que `.env.example` já espera.

O `concurrency` por SHA e sem cancelamento serializa os disparos do mesmo SHA (fim do Security e fim do Verify) e não interrompe uma publicação no meio.

### 3.2 Job `gate` e `scripts/release-image-gate.mjs`

**Passos:**

1. Checkout de `github.sha` e `setup-node`.
2. Leituras por `gh api`, só GET, com `GH_TOKEN: ${{ github.token }}`, salvas em `$RUNNER_TEMP/release-gate/`:
   - `branches/main` (proteção);
   - `actions/runs?head_sha=S&event=push`, paginado;
   - `check-suites/<suíte>/check-runs?filter=all`, paginado, para cada suíte dona do SHA;
   - `commits/S/pulls`;
   - `actions/runs?head_sha=<head do PR>&event=pull_request`;
   - `check-suites/<suíte>/check-runs?filter=all` para cada suíte dona do PR.
3. **Sondagem do pacote e da tag** por `curl`. O token nunca entra no argv: `GITHUB_ACTOR`/`github.token` (`packages: read`) chegam via `env:` e viram linhas de `curl --config -` lidas do stdin (`user = …` no pedido de token, `header = "Authorization: Bearer …"` nos demais). Os pedidos:
   - `GET https://ghcr.io/token?scope=repository:<nome>:pull`, autenticado;
   - `GET /v2/<nome>/tags/list`, autenticado, paginado por `Link`;
   - `GET https://ghcr.io/token?scope=repository:<nome>:pull`, **anônimo** (sem `--config`);
   - `GET /v2/<nome>/manifests/sha-S`, autenticado, com `Accept` de image manifest **e de índice**: Docker v2, OCI manifest, `application/vnd.oci.image.index.v1+json` e `application/vnd.docker.distribution.manifest.list.v2+json`.

   Status, código de erro, `Content-Type`, `Docker-Content-Digest` e a lista de tags vão para arquivo, e `classifyPackageProbe` classifica (regra 8).

4. **Pós-condição, só se a sondagem der `present`:**
   - `DOCKER_CONFIG="$RUNNER_TEMP/gate-docker"` (diretório novo) e `docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin` com `github.token` (`packages: read`). É credencial só de leitura.
   - Com essa config, quatro verificações, cada uma com saída JSON e código de retorno gravados em arquivo, sem quebrar o passo:
     - `gh attestation verify oci://ghcr.io/…@<digest>` com o predicado padrão (proveniência), pela API;
     - o mesmo com `--bundle-from-oci`;
     - `--predicate-type https://cyclonedx.org/bom`, pela API;
     - `--predicate-type https://cyclonedx.org/bom` com `--bundle-from-oci`.

     Todas usam os parâmetros de §3.4.

   - A sonda anônima de §3.4.
   - Passo `Cleanup gate registry login` (`if: always()`): `docker logout ghcr.io` e remoção de `$RUNNER_TEMP/gate-docker`.

5. `node scripts/release-image-gate.mjs` decide. Grava `decision`, `publish`, `sha` e, se houver, `digest` em `$GITHUB_OUTPUT`, mais `release-gate.json`, enviado como artefato.

**Funções puras exportadas, testadas com fixtures:**

```js
evaluateReleaseGate({
  repository, githubSha, githubRef, workflowRun,       // head_sha, event, head_branch, head_repository, conclusion
  branchProtection, pushRuns, mainSuiteCheckRuns, pulls, prRuns, prSuiteCheckRuns,
  probe,                                                // saída de classifyPackageProbe
  tag: { digest?, verifications?: { provenanceApi, provenanceOci, sbomApi, sbomOci }, anonymousPull? }
}) → { decision: 'publish' | 'wait' | 'superseded' | 'already_published' | 'refuse', reasons: string[], sha, pr, runs, checks, digest? }

classifyPackageProbe({ authToken, tagsList, anonymousToken, manifest, timedOut })
  → { package: 'ok' | 'missing_or_inaccessible' | 'public' | 'error', tag: 'absent' | 'present' | 'error' | 'not_checked', digest? }
```

A CLI lê exatamente os arquivos que o workflow grava em `$RUNNER_TEMP/release-gate/`: as respostas do `gh api`, a sondagem da tag e, para cada uma das quatro verificações, `<nome>.json` e `<nome>.exit`. Essa mesma estrutura de arquivos é usada como fixture em P3 e em L5.

`REQUIRED_CHECKS` (em `scripts/release-image-contract.mjs`) liga cada contexto ao workflow dono:

- `REM21 CI bar (Node 22)` → `.github/workflows/verify.yml`;
- `codeql`, `secret-scan`, `supply-chain` e `image-scan` → `.github/workflows/security.yml`.

Todos com `appId 15368`.

**Regras, na ordem:**

1. **Payload.** Dão `refuse`: evento diferente de `push`, branch diferente de `main`, repositório diferente deste ou `githubRef` diferente de `refs/heads/main`. É defesa redundante ao `if:` do job.
2. **Commit atual.** Se `githubSha ≠ workflowRun.head_sha`, a decisão é `superseded`: a `main` avançou, e o commit novo terá release próprio quando o Verify dele terminar.
3. **Proteção.** `protected` e `protection.enabled` precisam ser `true`, `enforcement_level` precisa ser `everyone`, e o conjunto `{contexto, app_id}` de `required_status_checks.checks` precisa ser igual a `REQUIRED_CHECKS`. Qualquer divergência dá `refuse`: a constante e a proteção mudam juntas, no mesmo PR.
4. **Execuções de push.** Para cada workflow dono, exige exatamente uma execução de push com `head_sha = S`, `head_branch = main`, `path` igual ao do dono e o mesmo repositório.
   - Se ela não terminou, `wait`.
   - Se terminou sem `success`, `refuse`.
   - Se houver zero ou mais de uma, `refuse`.
5. **Checks do SHA.** Para cada contexto obrigatório, lê os check-runs da suíte da execução dona com `filter=all` e pega o de maior `id` com nome exato (sensível a maiúsculas) e `app.id = 15368`. Ausente, ou diferente de `completed/success`, dá `refuse`. Um check com o mesmo nome em outra suíte, de outro app ou de uma execução por `schedule` não conta.
6. **PR.** Filtra `pulls` primeiro: `merged_at` preenchido, `base.ref = main`, `merge_commit_sha = S` e head do mesmo repositório. Depois conta, e o resultado precisa ser exatamente um. PR aberto ou fechado sem merge que contenha `S` é ignorado pelo filtro. Zero ou mais de um dá `refuse`.
7. **Checks do PR.** Para cada workflow dono, pega a execução `pull_request` de maior `id` com `head_sha` = head do PR, `path` do dono e o mesmo repositório. Ela precisa estar concluída com `success`, e a regra 5 vale nas suítes dela. Senão, `refuse`. Aqui não existe `wait`, porque o PR já foi mesclado.
8. **Pacote e tag.** `classifyPackageProbe` define o estado, na ordem:
   - **Pacote.**
     - `missing_or_inaccessible`: token autenticado `DENIED`, ou `tags/list` 401, 403 ou 404 (`NAME_UNKNOWN`). O pacote não existe ou o repositório não tem acesso.
     - `public`: `tags/list` = 200 e o pedido anônimo recebe token.
     - `ok`: `tags/list` = 200 e o pedido anônimo volta sem token (`DENIED`, 401/403). Com o pacote existente, isso significa privado.
     - `error`: 5xx, timeout ou corpo ilegível em qualquer um dos três pedidos.
   - **Tag `sha-S`** (só com pacote `ok`):
     - `absent`: só manifesto 404 com `MANIFEST_UNKNOWN`, e `sha-S` fora de `tags/list`;
     - `present`: manifesto 200, de qualquer `mediaType`, inclusive índice, com `Docker-Content-Digest`;
     - `error`: todo o resto, inclusive `NAME_UNKNOWN`, 401/403, 406, código desconhecido e `sha-S` listada com manifesto 404.
   - Tags `placeholder-*`, `sha256-*` e outras de `tags/list` não entram na decisão.

   Decisão:
   - pacote `missing_or_inaccessible`: `refuse` com motivo `package_missing_or_inaccessible`. O resumo diz: "pacote ausente ou sem acesso do Actions; ver o pré-requisito da §9". Nada é publicado.
   - pacote `public`: `refuse` (`package_public`). Pacote público não volta a privado, então a situação volta ao usuário.
   - pacote ou tag `error`: `refuse`.
   - pacote `ok` e tag `present` com as quatro verificações `exit = 0` (subject igual ao digest e predicate type esperado na saída JSON) e sonda anônima `DENIED`: `already_published`.
   - pacote `ok` e tag `present` faltando qualquer item: `refuse` (publicação incompleta ou estranha; triagem manual, §8).
   - pacote `ok` e tag `absent`: segue.

9. **Publica.** Passou por tudo: `publish`.

**Saídas:**

- `publish`: grava `publish=true` e `sha=S`.
- `wait`, `superseded` ou `already_published`: grava `publish=false`, sai com 0 e deixa aviso no resumo. Em `already_published`, o resumo e o `release-gate.json` trazem o digest e as verificações.
- `refuse`: sai com 1, e o run fica vermelho com os motivos.

### 3.3 Job `release` (`contents: read`, `packages: write`, `id-token: write`, `attestations: write`)

A ordem dos passos faz parte do contrato.

**Diretórios no runner:**

| Caminho                                                  | Uso                         | Montado em contêiner                           |
| -------------------------------------------------------- | --------------------------- | ---------------------------------------------- |
| `$RUNNER_TEMP/release/in/image.tar`                      | tarball                     | só como arquivo só leitura                     |
| `$RUNNER_TEMP/release/evidence/`                         | criado com `0700` pelo host | nunca                                          |
| volume Docker `cvg-release-trivy-<run_id>-<run_attempt>` | banco da Trivy              | só nos contêineres da Trivy; o host nunca o lê |

**Passos:**

1. Checkout de `needs.gate.outputs.sha` (via `env:`), com verificação de que `git rev-parse HEAD` é igual a `S`. Depois, `setup-node`.
2. Build:

   ```sh
   docker build --pull --target runtime --provenance=false --sbom=false \
     --label "org.opencontainers.image.source=https://github.com/${GITHUB_REPOSITORY}" \
     --label "org.opencontainers.image.revision=${S}" \
     --tag "cvg-operational-harness:release-${S}" .
   ```

   As adições em relação ao gate `image` são só metadados. `--provenance=false --sbom=false` evitam que o daemon com store containerd monte um índice com manifesto de attestation. O label `source` liga o pacote ao repositório no GHCR. A proveniência real vem da `actions/attest`.

3. Smoke com a mesma linha de `scripts/ci-bar.mjs:615`.
4. `docker save` da tag local para `in/image.tar` e `chmod 0444` no tarball. `install -d -m 0700` cria `evidence/`.
5. **`id: anchors`.** `node scripts/release-image-record.mjs anchors --tarball …` emite em `$GITHUB_OUTPUT` duas saídas, e é o único passo que as escreve:
   - `tarball_sha256`;
   - `config_digest`, lido do `manifest.json` do tarball: exatamente uma entrada, `Config` em `blobs/sha256/<hex>` e SHA-256 do blob igual a `<hex>`. Esse cálculo independe do store do daemon.
6. **Imagem da Trivy.** Pull anônimo, antes de qualquer login: `docker pull "$TRIVY_IMAGE"`, com `TRIVY_IMAGE=ghcr.io/aquasecurity/trivy:0.75.0@sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa`. `docker.io/aquasec/trivy` é proibido, também nas provas locais.
7. **Banco, com rede e sem a imagem.** `docker volume create` do volume do job e:

   ```sh
   docker run --rm --read-only --cap-drop=ALL --security-opt no-new-privileges --tmpfs /tmp \
     --mount type=volume,src="$TRIVY_VOLUME",dst=/cache \
     "$TRIVY_IMAGE" image --download-db-only --cache-dir /cache \
     --db-repository ghcr.io/aquasecurity/trivy-db:2 --skip-java-db-update \
     --skip-version-check --disable-telemetry --quiet
   ```

   Sem `/in`, sem stdout aproveitado e sem token. É a **única** chamada da Trivy com rede, e roda antes de todas as outras. O contêiner roda como root (uid 0) da imagem, sem nenhuma capability, e escreve só no volume nomeado. Todos os contêineres da Trivy levam também `--pids-limit 512 --memory 4g`.

8. **Metadados do banco, sem rede.**

   ```sh
   docker run --rm --network none --read-only --cap-drop=ALL \
     --security-opt no-new-privileges --tmpfs /tmp \
     --mount type=volume,src="$TRIVY_VOLUME",dst=/cache \
     "$TRIVY_IMAGE" version --format json --cache-dir /cache \
     > "$EVIDENCE/trivy-version.json"
   ```

   O arquivo traz a versão da Trivy e `VulnerabilityDB` (`Version`, `UpdatedAt`, `DownloadedAt`). `trivy version` não aceita `--skip-version-check`/`--disable-telemetry` e não chama `check.trivy.dev`; o `--network none` basta.

9. **Gate de vulnerabilidade, sem rede.** O prefixo `TRIVY_RUN` vale também para os passos 10 e 11. Cada passo repete o prefixo, ou os três ficam no mesmo passo de shell:

   ```sh
   TRIVY_RUN=(docker run --rm --network none --read-only --cap-drop=ALL \
     --security-opt no-new-privileges --tmpfs /tmp \
     --mount type=bind,src="$TARBALL",dst=/in/image.tar,readonly \
     --mount type=volume,src="$TRIVY_VOLUME",dst=/cache \
     "$TRIVY_IMAGE" image --input /in/image.tar --cache-dir /cache \
     --skip-db-update --skip-java-db-update --offline-scan \
     --skip-version-check --disable-telemetry --quiet)
   set -o pipefail
   "${TRIVY_RUN[@]}" --scanners vuln --severity HIGH,CRITICAL --ignore-unfixed \
     --exit-code 1 --format json | head -c "$((GATE_MAX + 1))" > "$EVIDENCE/trivy-gate.json"
   ```

   É a mesma política do `image-scan`. O `head -c` limita a escrita ao máximo de `EVIDENCE_FILES` mais um byte. Se a saída passar do limite, o arquivo fica com o byte a mais e `readEvidenceFile` recusa. Com `pipefail`, o código de saída da Trivy continua valendo. Os passos da Trivy não têm `id`, e nenhum passo consome saída deles.

10. **Relatório completo, informativo:** o mesmo prefixo, com `--scanners vuln --severity HIGH,CRITICAL --exit-code 0 --format json`, limitado por `head -c` para `"$EVIDENCE/trivy-full.json"`.
11. **SBOM:** o mesmo prefixo, com `--format cyclonedx`, limitado por `head -c` (16 MB + 1) para `"$EVIDENCE/sbom.cdx.json"`. Sem `--scanners`, a saída é só inventário.
12. **Conferência pós-Trivy.** `sha256sum` do tarball igual a `steps.anchors.outputs.tarball_sha256`.
13. `node scripts/release-image-record.mjs build …` recebe as âncoras por `env:` a partir de `steps.anchors.outputs`, só para conferir.
    - Lê só de `evidence/` e do checkout. Antes de abrir cada arquivo de `evidence/`, `lstat` confirma lista exata de nomes, arquivo regular, `nlink = 1` e tamanho máximo. A abertura usa `O_NOFOLLOW`.
    - Grava `evidence/build-record.json`, validado pelo contrato (§3.5), com o digest da imagem da Trivy, a versão e os metadados do banco tirados de `trivy-version.json`.
14. **`id: package-precondition`.** A sondagem completa de §3.2, passo 3, roda de novo com o token do job e `classifyPackageProbe`. Só pacote `ok` com tag `absent` segue; qualquer outro estado falha o job sem login e sem push, com o mesmo motivo do gate. É a barreira que impede o push de criar o pacote.
15. `docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin` com `github.token`, na config padrão do Docker, que é onde a `actions/attest` procura a credencial. É o primeiro passo com credencial de registro. Depois dele nenhum contêiner da Trivy roda.
16. `docker tag` da imagem local para `ghcr.io/…:sha-S` e `docker push` dessa única tag, com captura do digest. O push só alcança um pacote que o passo 14 viu existente e privado, e nunca toca as tags `placeholder-*`. Essa imagem nunca saiu do daemon, e nenhum contêiner da Trivy teve acesso ao socket.
17. `docker buildx imagetools inspect --raw ghcr.io/…@<digest>` traz o manifesto bruto. O passo exige três coisas:
    - SHA-256 dos bytes igual ao digest;
    - `mediaType` de image manifest (Docker v2 schema 2 ou OCI), nunca índice;
    - `config.digest` igual a `steps.anchors.outputs.config_digest`.

    Se algo divergir, o job falha antes de atestar. Digest sem attestation não passa no gate nem no deploy (§3.7).

18. **Proveniência:** `actions/attest` com `subject-name: ghcr.io/<dono>/cvg-operational-harness`, `subject-digest: <digest>`, `push-to-registry: true` e `create-storage-record: false` (o dono é conta de usuário).
19. **SBOM:** `actions/attest` com o mesmo subject, `sbom-path: ${{ runner.temp }}/release/evidence/sbom.cdx.json`, `push-to-registry: true` e `create-storage-record: false`.
20. `docker logout ghcr.io` logo depois do último attest.
21. `node scripts/release-image-record.mjs publish …`:
    - copia os dois bundles de `steps.<attest>.outputs.bundle-path`, escritos pela action de primeira parte, para `evidence/`, conferidos por `lstat`;
    - grava e valida `evidence/release-image.json`;
    - confere de novo cada arquivo da lista de upload (regular, `nlink = 1`, tamanho máximo).
22. `actions/upload-artifact` com nome `cvg-release-image-${{ github.run_id }}-${{ github.run_attempt }}`, que também é a saída `artifact_name`, e `retention-days: 90`. O `path:` é a lista explícita de arquivos de `evidence/`:
    - `build-record.json` e `release-image.json`;
    - `sbom.cdx.json`;
    - `trivy-gate.json`, `trivy-full.json` e `trivy-version.json`;
    - os dois bundles.

    Sem diretório, sem glob e **sem** `image.tar`. O resumo do job mostra o digest e as duas linhas de env do deploy (§3.7).

23. **`Cleanup release`** (`if: always()`): `docker logout ghcr.io`, `docker volume rm` do volume da Trivy e remoção de `$RUNNER_TEMP/release`.

**Banco da Trivy, sem cache envenenável e sem token.** O banco é baixado a cada release pela própria Trivy, de `ghcr.io/aquasecurity/trivy-db:2` (repositório fixo, mesmo publicador da imagem), sem credencial. O destino é um volume Docker nomeado criado vazio neste job.

- Não há `actions/cache`, restauração de run anterior nem leitura do volume pelo host: nenhum `docker cp`, nenhum outro contêiner monta o volume e nenhum passo lê o seu `Mountpoint`.
- O runner é efêmero, e o passo de limpeza remove o volume.
- O contêiner com rede nunca vê o tarball. Os que veem o tarball não têm rede.
- Um banco forjado (classe do `GHSA-mcj4-mphf-j9ff`, corrigido na `0.75.0`) escreveria, no pior caso, dentro do próprio contêiner (raiz só leitura, `/tmp` em tmpfs) ou no volume.

### 3.4 Job `release-verify` (`contents: read`, `packages: read`, `attestations: read`)

Job independente, no mesmo padrão do `provenance-verify`:

1. Baixa **exatamente** o artefato `needs.release.outputs.artifact_name` do próprio run, sem padrão, `run-id` nem `github-token`. Usa `DOCKER_CONFIG` temporário, faz login de leitura com `github.token` e roda `docker pull ghcr.io/…@<digest>` (pull por digest).
2. **Proveniência:** `gh attestation verify oci://ghcr.io/…@<digest>` com:
   - `--repo "$GITHUB_REPOSITORY"`;
   - `--signer-workflow "$GITHUB_REPOSITORY/.github/workflows/release-image.yml"`;
   - `--source-digest S` e `--source-ref refs/heads/main`;
   - `--deny-self-hosted-runners` e `--format json`.

   O comando roda duas vezes: uma pela API do GitHub e outra com `--bundle-from-oci`, que prova que a attestation está no GHCR, onde o servidor vai buscá-la.

3. **SBOM:** os mesmos parâmetros com `--predicate-type https://cyclonedx.org/bom`, pela API e por OCI. O predicado verificado precisa ser igual, em JSON canônico, ao `sbom.cdx.json` do artefato.
4. **Privacidade:** pedido anônimo a `https://ghcr.io/token?scope=repository:<dono>/cvg-operational-harness:pull`. Precisa voltar sem token (`DENIED`); se vier token, o pacote é público e o job falha.
5. `node scripts/release-image-record.mjs verify …` grava `release-verification.json`, enviado como artefato.
6. **`Cleanup verify registry login`** (`if: always()`): logout e remoção do `DOCKER_CONFIG` temporário.

A privacidade é conferida antes do push (gate, regra 8, e `release`, passo 14) e de novo aqui, como defesa redundante. Se esta sonda receber token, alguém tornou o pacote público depois do push. Isso não tem recuperação no CI, porque pacote público não volta a privado: o job fica vermelho e a situação volta ao usuário. Um "Re-run all jobs" cai no gate, que faz login de leitura (§3.2, passo 4) e só dá `already_published` com as quatro verificações e a sonda `DENIED`.

### 3.5 Contrato e registro

`scripts/release-image-contract.mjs`, só com módulos `node:`:

- **Constantes:**
  - `RELEASE_IMAGE_CONTRACT = 'spec0253-v4'`;
  - `REQUIRED_CHECKS` (§3.2);
  - `RELEASE_IMAGE_NAME = 'cvg-operational-harness'` e `REGISTRY = 'ghcr.io'`;
  - `TAG_PATTERN = /^sha-[0-9a-f]{40}$/`;
  - `MANIFEST_MEDIA_TYPES` e `PROBE_ACCEPT` (com os tipos de índice);
  - `PROVENANCE_PREDICATE = 'https://slsa.dev/provenance/v1'` e `SBOM_PREDICATE = 'https://cyclonedx.org/bom'`;
  - `SIGNER_WORKFLOW = '.github/workflows/release-image.yml'`;
  - `ALLOWED_BUILD_FLAGS`;
  - `TRIVY_IMAGE = 'ghcr.io/aquasecurity/trivy:0.75.0@sha256:af6acf9a…'` e `TRIVY_DB_REPOSITORY = 'ghcr.io/aquasecurity/trivy-db:2'`;
  - `TAG_ABSENT_CODES = ['MANIFEST_UNKNOWN']`, `PACKAGE_MISSING_CODES` (`DENIED` no token autenticado, `NAME_UNKNOWN`, 401/403/404 em `tags/list`) e `PLACEHOLDER_TAG_PATTERN = /^placeholder-\d{8}$/`;
  - `EVIDENCE_FILES`, com nome e tamanho máximo de cada arquivo; SBOM até 16 MB, o limite da `actions/attest`.
- **`readEvidenceFile(dir, name)`:** recusa nome fora de `EVIDENCE_FILES`, `lstat` que não seja arquivo regular (symlink, FIFO, socket, device ou diretório), `nlink ≠ 1` e tamanho acima do limite. Abre com `O_RDONLY | O_NOFOLLOW` e confere por `fstat` que o descritor é o mesmo inode.
- **`validateBuildRecord(record, expected)`:**
  - `commitSha` de 40 hex e igual ao esperado;
  - `tarballSha256` e `configDigest` iguais às âncoras recebidas;
  - `configUser = 'cvg'` e `cmd` igual a `RUNTIME_IMAGE_ENTRYPOINT`, importado de `runtime-image-contract.mjs`;
  - label `revision = commitSha`;
  - `baseImageRefs` com todos os `FROM` do `Dockerfile` e o `# syntax`, cada um com `@sha256:`;
  - `trivyImage = TRIVY_IMAGE`, `trivyVersion = 0.75.0` e `trivyDb` com `UpdatedAt` e `DownloadedAt`;
  - SBOM CycloneDX com `ImageID = configDigest`, pelo menos um `pkg:deb` e um `pkg:npm`, e `vulnerabilities` ausente ou vazio;
  - `sbomSha256` igual ao SHA-256 do arquivo;
  - relatório do gate sem HIGH/CRITICAL com `FixedVersion`.
- **`validateReleaseImageRecord(record, expected)`:** tudo o que o build exige, mais:
  - `image = ghcr.io/<dono>/cvg-operational-harness`, sem tag;
  - `tag = sha-<commitSha>`;
  - digest bem formado e `manifestSha256` igual ao digest;
  - `manifestMediaType` permitido e `config.digest = configDigest`;
  - attestations de proveniência e de SBOM com predicate type certo e bundle com SHA-256;
  - `gate.checks` e `gate.protection` iguais a `REQUIRED_CHECKS`, todos `success`;
  - `gate.decision = 'publish'`.
- **`validateReleaseVerification`:** subject igual ao digest nos dois predicados, verificação por API e por OCI, `anonymousPull: 'DENIED'` e SBOM igual.

`scripts/release-image-record.mjs` é uma CLI com os subcomandos `anchors`, `build`, `publish` e `verify`. Importa só `node:` e os contratos locais.

- **`anchors`:** lê o tarball por `tar -xOf` e é o único que escreve em `$GITHUB_OUTPUT`.
- **`build`, `publish` e `verify`:** só leem as âncoras do ambiente e comparam. Se receberem `GITHUB_OUTPUT`, não escrevem nele. Leem `evidence/` só por `readEvidenceFile`.
- **Binário `node`:** se não aparecer como componente no SBOM, a origem fica em `baseImageRefs` (`node:22.23.2-bookworm-slim@sha256:48e4…`), e o SBOM atestado não é editado.

### 3.6 `Dockerfile`: frontend pinado

A linha 1 passa a `# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e`, o digest observado no CI em 21/10 e confirmado pelos críticos em 22/10. O BUILD confere de novo com `docker buildx imagetools inspect docker/dockerfile:1.7` e registra o resultado. Nenhuma outra linha muda. O gate `image`, o `image-scan` e o release passam a usar o mesmo frontend fixo. `Dockerfile.local-test` e a receita do produto ficam como estão.

### 3.7 Consumo pelo deploy on-prem (contrato; nada é implementado aqui)

- **Qual digest usar.** O "digest registrado pela certificação/CI" (README C9) passa a ser o `digest` de `release-image.json` (ou o do resumo do gate em `already_published`). O de `certification/runtime-image.json` não serve, porque tem `repoDigests` vazio.
- **Env no `harness.env` renderizado pelo Vault:** `CVG_HARNESS_IMAGE_REPOSITORY=ghcr.io/ricardoakinaga-dev/cvg-operational-harness` e `CVG_HARNESS_IMAGE_DIGEST=<digest>`. A tag `sha-S` serve só para leitura humana.
- **Antes do `hc pull`:** as duas verificações abaixo, na máquina do operador ou no servidor com `--bundle-from-oci`, sempre com `docker login` de leitura antes. Digest sem as duas attestations não é implantável.
  - proveniência: `gh attestation verify oci://ghcr.io/…@<digest> --repo ricardoakinaga-dev/cvg-operational-harness --signer-workflow ricardoakinaga-dev/cvg-operational-harness/.github/workflows/release-image.yml --source-ref refs/heads/main --source-digest <SHA certificado> --deny-self-hosted-runners`;
  - SBOM: o mesmo comando com `--predicate-type https://cyclonedx.org/bom`.
- **Versão do `gh`.** Exige uma versão que tenha `attestation verify` com `--bundle-from-oci`, `--source-ref` e `--predicate-type`. O `gh` 2.45.0 da máquina local não tem `attestation`.
- **Checkout:** no mesmo `S` (README C1), porque o compose monta arquivos do checkout.
- **C9:** o smoke compara `SMOKE_EXPECTED_IMAGE_DIGEST` com o digest implantado.
- **Login do servidor:** usa o token de leitura do Vault (G6). Emitir esse token é ato do usuário na fase de deploy, fora desta SPEC.
- **README:** o BUILD propõe a atualização da linha C9 e da seção C9 de `deploy/harness/README.md` com estes passos e com a regra de manter `REQUIRED_CHECKS` igual à proteção (§5).
- **Proxy:** o `proxy` continua precisando da imagem `web` (§4).

## 4. Fora de escopo

- Deploy, servidor, Vault, emissão do token de leitura do registro, Fase C e C10.
- **Imagem `web` (proxy).** Ela não passa pelo gate `image` nem pelo `image-scan`, e publicá-la agora soltaria bytes que nenhum check obrigatório cobriu. Linha de backlog proposta: "RELEASE-WEB — incluir o alvo `web` no `image-scan` com smoke próprio e depois no release; pré-requisito do deploy do proxy".
- **Trivy do `image-scan`.** Ela continua na `0.70.0`, dentro do intervalo dos advisories de §1.6. Linha de backlog proposta: "SEC-TRIVY — subir o `image-scan` para Trivy ≥ 0.72 (input `version` da action ou contêiner pinado) e avaliar a subida das duas Trivy para a `0.76.1` ou posterior (CA eMudhra)". É job obrigatório, então a mudança fica fora desta SPEC (R9).
- **Imagem do produto (PISO-007).** Fica com o backlog do produto (ADR-010). O desenho desta SPEC pode servir de modelo, sem import do núcleo.
- **Assinatura com chave própria (cosign/KMS).** Exigiria segredo novo. O Sigstore keyless já cobre.
- **SLSA Build L3** (workflow reutilizável isolado), build bit a bit reproduzível (`SOURCE_DATE_EPOCH`, `rewrite-timestamp`) e promoção sem rebuild da imagem do gate, que mudaria o contrato selado de 34 gates. Ficam como evolução.
- **Multiarquitetura.** Só `linux/amd64`. O requisito de servidor x86_64 vai para o documento 0393, que trata da compra do servidor.
- **Outras varreduras e configurações:**
  - varredura de segredo bloqueante na imagem; a C4 já prevê gitleaks no sistema de arquivos exportado no destino (`README.md:177-182`);
  - análise de workflows (zizmor ou CodeQL `actions`);
  - ligar `sha_pinning_required` no repositório, que é configuração do repositório e decisão do usuário (recomendado).
- Retenção e limpeza de versões no GHCR, tags semver e `latest`.
- Tornar o release check obrigatório (ele roda depois do merge), mudar a proteção da `main` e criar `workflow_dispatch`.
- Recuperação automática de publicação incompleta. Ela exige triagem manual (§8).

## 5. Conjunto de escrita (candidata)

- **Novos:**
  - `.github/workflows/release-image.yml`;
  - `scripts/release-image-contract.mjs`, `scripts/release-image-gate.mjs` e `scripts/release-image-record.mjs`;
  - `tests/release-image-workflow-contract.test.js`, `tests/release-image-gate.test.js` e `tests/release-image-record.test.js`;
  - `tests/fixtures/release-image/**`, derivados do [snapshot](../04_audit/evidence/RELEASE-CI-0253-20261021/api-snapshot-24cdb463.json), mais variantes sintéticas. Os fixtures cobrem:
    - as execuções `pull_request` do head do PR;
    - a proteção inteira lida sem autenticação, com `enabled` e `enforcement_level`;
    - os arquivos de sondagem e de verificação no layout de `$RUNNER_TEMP/release-gate/`.
- **Alterados:** `Dockerfile` (só a linha 1). Evidências vão para `docs/04_audit/evidence/RELEASE-CI-0253-20261021/`.
- **`deploy/harness/README.md` (só a linha e a seção C9).** Outro agente está editando esse arquivo nesta worktree. O BUILD só altera com claim próprio e depois de conferir o estado do arquivo; se houver conflito, o texto vai como proposta ao Lead.
- **Intocados:** `verify.yml`, `security.yml`, `product-shift-assistant.yml`, `scripts/ci-bar*.mjs`, `scripts/runtime-image-*.mjs`, `scripts/generate-sbom.mjs`, compose, `.env.example`, `deploy/harness/secrets/**`, `package.json`, lockfile, `apps/**`, `packages/**`, `legacy/**` e `products/**`.
- **Ledgers:** ficam com o Lead.

## 6. Provas

Cada teste novo falha na base (first red) e passa no BUILD. Os mutantes são mortos pelo teste indicado.

| ID  | Teste                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | First red na base                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| P1  | Contrato textual do workflow, no estilo de `tests/ci-workflow-contract.test.js`, que separa os jobs e os passos por índice. Gatilho e permissões: `on:` só com `workflow_run` (`[Verify, Security]`, `completed`, `main`); `permissions: {}` no topo e o conjunto exato por job (§3.1); `concurrency` por `head_sha` sem cancelamento; o `if:` do gate com as cinco condições. Actions: todo `uses:` em `actions/*`, com pin de 40 hex igual ao de `verify.yml`/`security.yml`; nenhum `uses:` de terceiro; nenhum `cache:`; nenhum `npm ci`/`npm install`/`npx`. Regras de job: `persist-credentials: false` em todo checkout; `timeout-minutes` e `ubuntu-24.04` em todo job; nenhum `continue-on-error`; nenhum `always()`/`!cancelled()`/`failure()` no `if:` de job de `release`/`release-verify`; `if: always()` de passo só nos três passos de limpeza nomeados; nenhum `${{ github.event.workflow_run.` dentro de `run:`; `download-artifact` só com `name: ${{ needs.release.outputs.artifact_name }}`, sem `pattern`, `run-id` ou `github-token`. Gate: passo com `docker login` e `DOCKER_CONFIG` temporário antes do primeiro `gh attestation verify`; quatro verificações (padrão e `cyclonedx`, com e sem `--bundle-from-oci`); sondagem com `tags/list` autenticado, sonda anônima e `Accept` com os tipos de índice; token só por `curl --config -`, nunca em `-u`/`-H` no argv. **Pré-condição do push:** passo `id: package-precondition` no `release`, sem `continue-on-error`, entre o registro e o `docker login`. Build e push: o build usa só flags de `ALLOWED_BUILD_FLAGS`; `docker tag`/`docker push` só para `sha-${S}`; nenhum `latest`. **Ordem no job `release`, por índice de passo:** `docker save` < `id: anchors` < `docker pull "$TRIVY_IMAGE"` < download do banco < demais `docker run "$TRIVY_IMAGE"` < `docker login` < `docker push` < primeiro `actions/attest` < `docker logout` < `upload-artifact`; só o passo `anchors` escreve `tarball_sha256=`/`config_digest=` em `$GITHUB_OUTPUT`; nenhum `docker run "$TRIVY_IMAGE"` depois do `docker login`. **Contêiner da Trivy:** `TRIVY_IMAGE` igual à constante e declarado só no `env:` de passo; nenhuma montagem `type=bind` além do tarball com `readonly`; nenhum `-v`; cache só por `type=volume`; nada de `docker.sock`, `--privileged`, `--network host`, `--env`/`-e` nem `--env-file`; exatamente uma chamada da Trivy sem `--network none`, a de `--download-db-only`, antes de todas as outras; `--pids-limit` e `--memory` em toda chamada; `--skip-version-check` e `--disable-telemetry` em toda chamada `image` e em nenhuma `version`; passos da Trivy sem `id`; saídas por `head -c` com `set -o pipefail`; e `--db-repository ghcr.io/aquasecurity/trivy-db:2` no download; saída por `>` para `$EVIDENCE/`, sem `--output`. **Isolamento do host:** fora dos passos da Trivy, nenhum passo cita o volume, `docker cp`, `docker volume inspect` ou `Mountpoint`; nenhuma ocorrência de `docker.io/aquasec`. **`evidence/`:** `sbom-path` em `.../release/evidence/sbom.cdx.json`; o `path:` do upload é a lista exata de `EVIDENCE_FILES`, sem diretório, glob, `image.tar`, `release/in` ou caminho fora de `evidence/`. Attest e verify: `subject-digest`, `push-to-registry: true`, `create-storage-record: false` e um passo com `sbom-path`; verify com `--signer-workflow`, `--source-digest`, `--source-ref`, `--deny-self-hosted-runners`, `--bundle-from-oci`, `--predicate-type https://cyclonedx.org/bom` e a sonda anônima. Scripts: `release-image-*.mjs` só importam `node:` e `./release-image-contract.mjs`/`./runtime-image-contract.mjs`. | arquivo ausente                        |
| P2  | `Dockerfile`: todo `FROM` e o `# syntax` têm `@sha256:` de 64 hex.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `# syntax` sem digest (`Dockerfile:1`) |
| P3  | `evaluateReleaseGate` e `classifyPackageProbe` sobre fixtures no layout de `$RUNNER_TEMP/release-gate/`. O fixture real de `24cdb463` (execuções e suítes de push, PR #13 com as execuções `pull_request` do head, proteção inteira) dá `publish`. **Proteção:** contexto a mais, a menos ou com outro `app_id` dá `refuse`; `enabled: false` ou `enforcement_level` diferente de `everyone` dá `refuse`. **Checks e execuções:** cada um dos 5 checks ausente, `failure`, `cancelled`, `neutral`, `skipped`, `timed_out` ou `action_required` dá `refuse`; Security concluído com Verify aberto dá `wait`; tentativa nova (maior `id`) `failure` sobre uma antiga `success` dá `refuse`; check-run `success` de suíte de `schedule` não substitui o da suíte de push; só `CodeQL` do app 57789 dá `refuse`; `codeql` do app 15368 em outra suíte dá `refuse`; Verify `failure` com o check `success` dá `refuse`; duas execuções de push do mesmo dono dão `refuse`. **Payload:** evento `pull_request`, repositório de fork ou branch diferente de `main` dão `refuse`; `githubSha ≠ head_sha` dá `superseded`. **PR:** ausente, só aberto, não mesclado, com base diferente de `main`, `merge_commit_sha` diferente ou dois PRs mesclados válidos dão `refuse`; um PR aberto a mais que contém `S` é ignorado; execução `pull_request` do head ausente ou `failure` dá `refuse`. **Pacote:** token autenticado `DENIED` ou `tags/list` 401/403/404 (`NAME_UNKNOWN`), isto é, pacote inexistente ou sem acesso, dão `refuse` (`package_missing_or_inaccessible`) e nunca `publish`; `tags/list` 200 com sonda anônima que recebe token dá `refuse` (`package_public`); 5xx ou timeout em qualquer pedido dá `refuse`. **Tag:** com pacote `ok`, só manifesto 404 `MANIFEST_UNKNOWN` é `absent`; manifesto 200 com `mediaType` de índice é `present`; `NAME_UNKNOWN`, 5xx, timeout, 401/403, 406, código desconhecido ou `sha-S` listada com manifesto 404 são `error` e dão `refuse`; `tags/list` com `placeholder-20261022` e outras tags `sha-*` não muda a decisão sobre `sha-S`. **Pós-condição:** tag presente com só a proveniência, com uma das quatro verificações `exit ≠ 0`, com subject diferente do digest ou com a sonda anônima com token (público) dá `refuse`; com as quatro verificações e a sonda `DENIED` dá `already_published`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | módulo ausente                         |
| P4  | Registro e contrato com tarball sintético montado por `tar` no teste (`manifest.json` e blob de config), SBOM e relatórios sintéticos num `evidence/` temporário. Caso válido passa. `anchors` escreve as duas saídas em um `GITHUB_OUTPUT` temporário; `build`, `publish` e `verify` com `GITHUB_OUTPUT` definido deixam o arquivo intacto. **`readEvidenceFile`:** recusa `sbom.cdx.json` que seja symlink (para um arquivo fora, como um `config.json` sintético com credencial falsa), FIFO, diretório, hardlink (`nlink = 2`), nome extra ou faltando e arquivo acima do limite; o conteúdo do alvo do symlink nunca aparece no registro. Falham também: âncora recebida diferente do tarball; `ImageID` diferente de `configDigest`; SBOM com vulnerabilidades; SBOM sem `pkg:deb` ou sem `pkg:npm`; usuário diferente de `cvg`; `cmd` diferente; base ou syntax sem digest; `trivyImage` diferente de `TRIVY_IMAGE`; blob da config com hash diferente do nome; manifesto com `mediaType` de índice; `config.digest` divergente; tag diferente de `sha-<commit>` ou igual a `latest`; predicate type errado ou ausente; `gate.checks` ou `gate.protection` diferentes de `REQUIRED_CHECKS`; verificação com `anonymousPull` igual a `TOKEN`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | módulo ausente                         |
| P5  | Testes existentes continuam verdes sem mudança: `ci-workflow-contract`, `runtime-image-contract`, `security-scan-config` e `ci-bar-contract`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | não se aplica (regressão)              |

**Mutantes mínimos**, cada um morto pelo teste indicado:

- **P1, permissões:**
  - `permissions: write-all` ou `packages: write` no topo;
  - `packages: write` no `gate`;
  - `id-token: write` no `gate` ou no `release-verify`.
- **P1, actions e host:**
  - action com `@v4` ou SHA curto;
  - pin diferente do revisado;
  - `aquasecurity/trivy-action`, `docker/login-action` ou qualquer `uses:` de terceiro;
  - `actions/cache`, `cache: npm` ou `npx` num passo;
  - `download-artifact` com `pattern`, `run-id` ou `github-token`.
- **P1, gatilho e controle de fluxo:**
  - gatilho `pull_request`, `pull_request_target`, `push`, `workflow_dispatch` ou `schedule` acrescentado;
  - remoção de `event == 'push'` ou da comparação de `head_repository`;
  - `cancel-in-progress: true`;
  - `if: always()` no job `release` ou num passo que não seja de limpeza;
  - `continue-on-error: true`;
  - `${{ github.event.workflow_run.head_branch }}` dentro de `run:`.
- **P1, `gate`:**
  - `gate` sem `docker login` antes do `gh attestation verify`;
  - só a verificação padrão, sem `cyclonedx` ou sem `--bundle-from-oci`;
  - `Accept` sem os tipos de índice;
  - sondagem sem `tags/list` ou sem a sonda anônima antes do push;
  - token da sondagem em `curl -u` ou `-H` no argv.
- **P1, build, imagem e âncoras:**
  - `--build-arg`, `--secret` ou `--network host` no build;
  - tag `latest` ou `docker push` de uma segunda tag;
  - âncoras emitidas pelo passo de registro ou passo `anchors` depois da Trivy;
  - `docker login` antes de um contêiner da Trivy;
  - `TRIVY_IMAGE` no `env:` do job;
  - **push cria o pacote:** passo `package-precondition` removido, com `continue-on-error` ou depois do `docker push`.
- **P1, contêiner da Trivy e `evidence/`:**
  - montagem `type=bind` gravável (por exemplo `/out`);
  - `--output /out/sbom.cdx.json` com leitura posterior;
  - varredura com `/in` sem `--network none`;
  - uma segunda chamada da Trivy com rede, por exemplo depois das varreduras;
  - chamada `image` sem `--skip-version-check` ou sem `--disable-telemetry`, ou esses flags em `trivy version`;
  - saída da Trivy sem `head -c` ou sem `pipefail`;
  - passo da Trivy com `id` consumido depois;
  - download sem `--db-repository`;
  - `docker.io/aquasec/trivy`;
  - `-v /var/run/docker.sock:…` ou `-e GITHUB_TOKEN`;
  - referência da Trivy sem digest.
- **P1, leitura do cache e upload:**
  - `docker run --mount …$TRIVY_VOLUME… alpine cat …`;
  - `docker cp` do volume;
  - `upload-artifact` com `path: ${{ runner.temp }}/release` ou com glob;
  - `sbom-path` fora de `evidence/`;
  - `upload-artifact` com `image.tar`.
- **P1, attest e verify:**
  - attest sem `push-to-registry` ou sem o passo de SBOM;
  - verify sem `--source-digest`, sem o SBOM ou sem a sonda anônima.
- **P2:** `# syntax` sem digest.
- **P3:**
  - casar o nome sem diferenciar maiúsculas;
  - ignorar `app.id`;
  - ignorar a suíte;
  - aceitar `neutral` ou `skipped`;
  - pegar o check-run de menor `id`;
  - pular a regra do PR;
  - contar `pulls` antes de filtrar;
  - pular a regra `githubSha`;
  - pular a comparação com a proteção ou com `enforcement_level`;
  - classificar 5xx, timeout ou 406 como `absent`;
  - token autenticado `DENIED` ou `NAME_UNKNOWN` tratado como `absent` (o push criaria o pacote);
  - pacote público (sonda anônima com token) aceito antes do push;
  - `already_published` com só a proveniência, sem `--bundle-from-oci` ou sem a sonda anônima.
- **P4:**
  - `readEvidenceFile` que segue symlink (sem `O_NOFOLLOW`/`lstat`) ou aceita hardlink ou FIFO;
  - `build` escrevendo em `GITHUB_OUTPUT`;
  - aceitar índice;
  - não comparar `config.digest`;
  - não comparar `ImageID`;
  - não conferir a âncora do tarball.

**Provas locais do BUILD** (Node 22, Docker local, nada publicado):

- **L1.** Os testes P1–P5 e uma leitura estrutural do YAML com o PyYAML de sistema (`python3 -I`). Isso é só verificação local e não entra no repositório como dependência.
- **L2.** Os passos 2–13 de §3.3 com as mesmas linhas de comando, no SHA candidato. Isso cobre:
  - build, smoke, `docker save` e âncoras;
  - a Trivy pelo mesmo contêiner `ghcr.io/aquasecurity/trivy:0.75.0@sha256:af6acf9a…`: download do banco num contêiner sem `/in`, e versão, gate e SBOM com `--network none` e saída por stdout;
  - a conferência pós-Trivy e `release-image-record.mjs build`.

  O registro precisa ter `ImageID = configDigest` e componentes `pkg:deb` e `pkg:npm`, com a contagem de `pkg:npm` comparada às dependências de produção. Fica registrado se o binário `node` aparece. Nenhum `docker.io/aquasec`.

- **L3.** Contêineres de controle com as mesmas montagens e flags dos passos 7–11:
  - (a) tentar escrever em `/in/image.tar` falha, e o hash não muda;
  - (b) com o tarball montado e `--network none`, tentar acesso de rede falha;
  - (c) planta symlinks no volume e em `/tmp` (`trivy-full.json -> /proc/self/environ`, `sbom.cdx.json -> /root/.docker/config.json`) e imprime um JSON fixo no stdout. O arquivo em `evidence/` precisa ser um arquivo regular com exatamente esses bytes, nenhum caminho do host fora de `evidence/` muda, e `readEvidenceFile` aceita o arquivo;
  - (d) um symlink plantado à mão em `evidence/` faz o registro falhar antes do ponto equivalente ao login.
- **L4.** Registro descartável `registry:2`, pinado por digest, ligado só a `127.0.0.1` e removido no fim. Não é publicação. Sequência: tag e push da imagem local, `imagetools inspect --raw`, conferência de manifesto único, SHA-256 dos bytes igual ao digest e `config.digest` igual à âncora. A máquina local usa store containerd, então L4 prova que a regra de identidade não depende do store. A sondagem `classifyPackageProbe` roda contra esse registro para repositório inexistente (`tags/list` 404 `NAME_UNKNOWN`, que dá `missing_or_inaccessible`), tag inexistente num repositório existente (404 `MANIFEST_UNKNOWN`), tag presente com manifesto e tag presente com índice. O `registry:2` não tem a semântica de token anônimo do GHCR; os casos privado e público ficam em P3 e L5.
- **L5.** `node scripts/release-image-gate.mjs` como CLI, de ponta a ponta, sobre um diretório de fixture no layout de `$RUNNER_TEMP/release-gate/`: as respostas reais de `24cdb463`, a sondagem `present` e as quatro verificações com `.json` e `.exit`. O resultado é `decision=already_published` e `publish=false` num `GITHUB_OUTPUT` temporário. Variantes com uma verificação `exit=1`, com sonda anônima com token (pacote público) e com pacote inexistente (`tags/list` 404 e token autenticado `DENIED`) dão `refuse` e saída 1, sem `publish=true`. A assinatura real das attestations só existe no primeiro run.

**Só o primeiro run real na `main` prova** (depois do merge do PR do BUILD, pelos 5 checks; o Lead copia as evidências para esta pasta):

- o disparo por `workflow_run` com payload real: o Security termina primeiro e dá `wait`, o Verify termina depois e dá `publish`;
- a leitura real da proteção e das suítes com `filter=all`;
- as respostas reais do GHCR para tag inexistente num pacote existente (status e código de erro), que confirmam `TAG_ABSENT_CODES`;
- o pacote criado pelo usuário: `tags/list` 200 com o token do job, sonda anônima `DENIED` antes e depois do push, e a tag `placeholder-*` intacta;
- o `GITHUB_TOKEN` publicando em pacote existente, com o acesso `Write` dado ao repositório em "Manage Actions access";
- o banco baixado de `ghcr.io/aquasecurity/trivy-db:2` (`trivy-version.json`);
- as attestations gravadas na API e no GHCR, verificadas pelos dois caminhos, e as tags `sha256-<hex>` de referrers que aparecerem;
- o pull por digest;
- o `release-image.json` com digest real;
- a duração e o tamanho do pacote.

Um segundo disparo do mesmo SHA, por exemplo reexecutando o Security, precisa dar `already_published`, com o login de leitura do gate.

## 7. Gates de pronto

- Node 22; `npx prettier --check` nos arquivos tocados; `npm run -s lint`; `npm run -s typecheck`; `node scripts/check-doc-links.mjs` nesta SPEC e na pasta de evidências.
- Testes focais P1–P5 e `npm run test:core`. `test:postgres`, E2E e `certify` ficam com a barra do PR, porque nenhum arquivo dessas suítes muda.
- L1–L5 com evidência, mutantes registrados e first red dos testes novos na base.
- Crítico de código independente (não fork), até duas rodadas.
- A publicação real só acontece pelo fluxo da `main` protegida: o PR passa nos 5 checks, o usuário faz o merge e o release roda sozinho. O agente não faz push, PR nem publicação sem autorização do usuário. Nada aqui autoriza deploy, produção ou release T4.

## 8. Riscos e compatibilidade

- **Bytes privados, metadados públicos (risco aceito; ciência do usuário em §9).**
  - Por operação normal, os bytes e as camadas da imagem só existem no runner efêmero do job `release` e no GHCR privado: nenhum artefato, cache ou log os contém (R8, P1).
  - Como o repositório é público, são legíveis por qualquer pessoa: os logs do workflow, o artefato `cvg-release-image-*` (registro, SBOM, relatórios Trivy e bundles, com download para qualquer conta autenticada), as attestations (API do GitHub) e a entrada da proveniência no log público do Sigstore (Rekor). A entrada no Rekor é permanente.
  - Isso revela o digest de produção, o inventário de componentes e as vulnerabilidades sem correção, e liga o digest a este release. O conteúdo já é derivável do `Dockerfile`, do lockfile e de bases públicas, e repete o modelo atual (`cyclonedx-sbom`, `trivy-image-report`, attestation da barra).
  - Não há segredo nem dado.
- **Contêiner da Trivy no job privilegiado.**
  - **Mitigações:**
    - digest pinado de release imutável `0.75.0`, com as correções de 2026;
    - nenhum token, variável do runner, socket ou credencial de registro;
    - nenhuma montagem gravável do host; saída só por stdout para `evidence/`, lida com `lstat`/`O_NOFOLLOW`;
    - banco num volume que o host não lê;
    - varreduras sem rede;
    - tudo antes do login.
  - **Resíduo:** uma Trivy comprometida ou um banco forjado poderiam:
    - falsear a varredura e o SBOM;
    - gastar CPU e disco;
    - escrever no stdout ou no log (stderr) bytes da imagem, que são deriváveis do repositório e iriam para o artefato ou para o log públicos.

    O contêiner do banco tem rede (`bridge`), mas não vê a imagem. Pela ponte ele alcança a internet, serviços da máquina host e os endpoints de metadados da nuvem do runner, nenhum dos quais entrega token do repositório. Stdout ou memória exagerados derrubam o job (`head -c`, `--memory`, `--pids-limit`): é negação de serviço, não integridade. Nenhum caminho leva a token. O `ImageID` amarra o SBOM à âncora, e os limites de tamanho de `EVIDENCE_FILES` limitam o volume.

- **Versão da Trivy diferente do `image-scan`.** O release usa a `0.75.0`, e o `image-scan`, a `0.70.0`. A política (HIGH/CRITICAL com correção) é a mesma, mas os resultados podem divergir. O release decide sobre os bytes publicados. A atualização do `image-scan` fica no cartão SEC-TRIVY (§4).
- **SHA não publicado por cancelamento.** Quando o Verify de push é cancelado pelo merge seguinte (3 de 8 recentes), aquele SHA não é publicado. Só é publicado o SHA que continua na ponta da `main` durante o Verify inteiro (regra 2 de §3.2). Reexecutar o Verify de um SHA antigo dá `superseded`. Esse comportamento é intencional, porque a proveniência precisa nomear o commit construído.
- **Security de push cancelado pelo `schedule`.** O `schedule` semanal do Security divide o grupo de concorrência com o push na `main` (`security.yml:15-17`) e pode cancelar o Security de push. O gate dá `refuse` (execução dona `cancelled`). A recuperação é reexecutar o Security de push daquele SHA.
- **Concorrência do release.** Execuções de `workflow_run` vindas de `schedule` ou de PR de fork com branch `main` entram no grupo do `head_sha` antes do `if:`. Uma pendente mais nova cancela a pendente mais velha, inclusive uma que publicaria. É improvável (o gate dura minutos e o `schedule` é semanal) e se recupera com reexecução.
- **Rebuild.** O digest publicado não é o do `image-scan` nem o do gate `image`, porque o build não é bit a bit reproduzível. A mitigação é repetir o smoke e o gate Trivy sobre os bytes publicados e registrar o caminho tarball → config → digest. A reprodutibilidade bit a bit fica como evolução.
- **Banco da Trivy.** O banco muda a cada dia: o release pode falhar depois de o `image-scan` passar, se surgir CVE HIGH/CRITICAL com correção. É o comportamento certo (correção por PR). Falha de download ou limite de taxa de `ghcr.io/aquasecurity/trivy-db:2` se resolve com reexecução, sem cache nem repositório de reserva.
- **Pacote criado fora do CI (pré-requisito de operação).** Pela documentação do GitHub (§1.7), o pacote que o release criasse herdaria a visibilidade pública do repositório, sem volta. Por isso o release nunca cria o pacote, e o usuário o cria uma vez como privado (§9).
  - **Sem o passo do usuário:** o gate dá `refuse` com `package_missing_or_inaccessible` e a mensagem do pré-requisito; o run fica vermelho, e nada é construído nem publicado.
  - **Sem `Write` do Actions:** o mesmo `refuse`, porque `tags/list` volta 401/403.
  - **Pacote público por qualquer motivo:** `refuse` com `package_public`, sem push. Corrigir isso exige outro nome de pacote, que é decisão do usuário.
- **Pacote inacessível ao `GITHUB_TOKEN` no meio do run.** O push falha com 403 e o run fica vermelho. O label `source` liga o pacote ao repositório.
- **Publicação incompleta.**
  - **Faltou attestation ou o manifesto divergiu.** Se o push deu certo e o manifesto divergiu ou uma attestation falhou, o digest fica no GHCR sem a pós-condição inteira. O gate do próximo disparo dá `refuse` (regra 8). Uma reexecução do job `release` refaz o build e para no passo 14, sem push.
  - **Só faltou o registro ou o upload.** Se o push e as duas attestations deram certo, a pós-condição está completa. O próximo gate dá `already_published`, e o digest do deploy vem do resumo do gate e do `release-gate.json` (§3.7).
  - O deploy recusa esse digest, porque exige as duas attestations (§3.7).
  - A triagem é manual: o usuário apaga a versão `sha-S` no GHCR e reexecuta, ou espera o próximo SHA.
- **Cota e custo do GHCR privado.** Cada SHA que sobrevive na ponta da `main` gera uma versão. O limite de armazenamento e a cobrança de pacote privado seguem o plano da conta e a política vigente do GitHub Packages; o recon não confirmou os números. Com limite de gasto zerado, o push falha fechado. O primeiro run mede o tamanho, e a retenção vira cartão próprio.
- **Troca de daemon no runner** (store containerd) pode mudar o formato de saída. A regra de manifesto único falha fechada, e o runner fica fixado em `ubuntu-24.04`.
- **Erro de YAML** em workflow `workflow_run` só aparece depois do merge, porque esse gatilho lê o arquivo da branch padrão. A mitigação é P1 mais o L1 estrutural; a prova final é o primeiro run real.
- **Proteção e constante.** Se a proteção da `main` mudar, o gate dá `refuse` até `REQUIRED_CHECKS` mudar no mesmo PR (regra 3). A mudança da proteção continua sendo decisão do usuário.
- **Reexecução parcial.** "Re-run failed jobs" do `release` refaz o job inteiro (build novo, âncoras novas, volume novo), porque não há artefato de imagem entre jobs. O `release-verify` baixa exatamente o artefato cujo nome o `release` publicou como saída.

## 9. Premissas e decisões do usuário

- **Nenhuma premissa nova além da decisão de 22/10.** O release usa:
  - `GITHUB_TOKEN`, sem segredo, conta ou credencial novos; o login do `gate` e do `release-verify` é só de leitura com o mesmo token;
  - Sigstore keyless, que o repositório já usa;
  - o GHCR do próprio dono, como decidido em G6;
  - nenhuma mudança na proteção da `main`;
  - nenhuma action que já não esteja pinada no repositório; a `trivy-action` sai do caminho de release.
- **Imagem nova no CI, sem premissa.** A imagem de contêiner `ghcr.io/aquasecurity/trivy:0.75.0`, pinada por digest, é a mesma ferramenta que o `image-scan` já executa, numa release imutável mais nova, com as correções de 2026. Não é action, não recebe segredo e é baixada de registro público sem credencial, assim como o banco.
- **Pré-requisito de operação: o pacote privado, criado uma vez pelo usuário** ([decisão de 22/10](../04_audit/evidence/RELEASE-CI-0253-20261021/user-decision-20261022.json); é a única publicação fora da `main` autorizada). Fora do CI, com credencial própria (`write:packages`), o usuário:
  1. publica em `ghcr.io/ricardoakinaga-dev/cvg-operational-harness` só uma imagem placeholder (`FROM scratch` com um `README`, sem código do harness), com tag `placeholder-AAAAMMDD`. O script fornecido pelo Lead faz isso e roda a sonda anônima;
  2. confere em "Package settings" que a visibilidade é **Private**, sem mudá-la;
  3. em "Manage Actions access", adiciona o repositório `cvg-operational-harness` com papel **Write** (o repositório fica conectado ao pacote; o label `source` do release também conecta).

  Não concedido: publicar a imagem do harness fora da `main`, tornar o pacote público e deploy. Sem esse passo, o release fica vermelho com `package_missing_or_inaccessible`, e nada é publicado (§8). O passo pode vir antes ou depois do merge do PR do BUILD: até ele existir, cada release dá `refuse` sem efeito.

- **Ciência do usuário sobre metadados públicos.** O Lead comunicou ao usuário em 21/10 que logs, SBOM, relatórios e attestations do release ficam públicos porque o repositório é público, e que só os bytes da imagem ficam privados. A proveniência e a attestation do SBOM geram entradas permanentes no Rekor público. O usuário ainda não confirmou de forma explícita, e `user-decision-20261021.json` não registra essa ciência. Isso não bloqueia o BUILD, porque o padrão já existe no repositório. Mas é **pré-condição do merge do PR do BUILD**, porque depois do merge a publicação acontece sozinha. O Lead registra a confirmação.
- **Atos do usuário que esta SPEC não assume:**
  - criar o pacote privado (pré-requisito acima);
  - fazer o merge do PR do BUILD (a primeira publicação só acontece depois dele e do pré-requisito);
  - apagar uma versão incompleta no GHCR, se houver;
  - emitir o token de leitura do servidor, na fase de deploy (G6);
  - opcionalmente, ligar `sha_pinning_required` no repositório.
