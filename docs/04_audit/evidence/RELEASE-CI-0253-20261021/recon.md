# RELEASE-CI-0253 — recon da SPEC0253 (imagem do harness no GHCR por digest)

- Data: 21–22/10/2026. Task `RELEASE-CI-0253-20261021`, sessão CONT-20261018-D9EF.
- Base de leitura: worktree `/mnt/dados/cvg-work/cvg-d9ef-prodpath-20261021`, detached em `24cdb463faa1010da5fd78b6d923950ac2741713` (igual à `main` remota em 21/10, `compare` = `identical`).
- Autoridade: [decisão do usuário de 21/10](user-decision-20261021.json) e [decisões de produção de 16/10](../USER-DECISIONS-20261016/production-0374.json) (G6).
- Método: leitura de arquivos do worktree; chamadas `gh api` somente GET (sem escrita); um pedido anônimo de token ao GHCR. Nada foi construído, publicado ou alterado fora desta pasta.
- Dados de API reduzidos por `jq` em [api-snapshot-24cdb463.json](api-snapshot-24cdb463.json): dado público do repositório, sem token nem dado pessoal. Serve de base para os fixtures do BUILD.

## 1. Receita da imagem

| Fato | Onde |
| --- | --- |
| Receita única na raiz, quatro estágios: `build`, `prod-deps`, `runtime` (distroless, `USER cvg`, `CMD node apps/api/dist/main.js`) e `web` (nginx). | `Dockerfile:7,20,33,40,46,48` |
| Os quatro `FROM` estão pinados por digest. | `Dockerfile:7,20,33,48` |
| O frontend do BuildKit (`# syntax=docker/dockerfile:1.7`) não está pinado. No image-scan de 21/10 ele resolveu para `docker.io/docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e`. | `Dockerfile:1`; log do job 119142954357, linhas 234–238 |
| `npm ci --ignore-scripts` usa o lockfile no estágio `build`; as dependências de produção saem de `npm ci --omit=dev` (114 pacotes no log de 21/10). | `Dockerfile:16,24`; log, linhas 340–382 |
| O contexto exclui `.git`, `.github`, `docs`, `certification` e `.env*`, mas não cobre `.npmrc`. Os `COPY` copiam caminhos explícitos. | `.dockerignore:1-19`; `Dockerfile:10-15` |
| A imagem do produto tem receita própria (`products/shift-assistant/deploy/Dockerfile`). A pendência "build pela receita completa no CI e SBOM do artefato" da PISO-007/PISO-008 é dessa imagem. | [ledger-delta PISO-008](../AUD0621-PRODUCT-PISO008-20261021/ledger-delta.md) |

## 2. Gates de imagem e supply chain atuais

| Fato | Onde |
| --- | --- |
| O gate `image` da barra roda `docker build --pull --target runtime --tag cvg-operational-harness:ci-<run> .`, depois um smoke `docker run --rm --network none --read-only --tmpfs /tmp --cap-drop=ALL --security-opt no-new-privileges … node scripts/runtime-image-smoke.mjs` e `runtime-image-record.mjs`. | `scripts/ci-bar-contract.mjs:237-242`; `scripts/ci-bar.mjs:605-619` |
| O registro valida `cvg`, o `CMD`, o smoke 200/200 e a base pinada. Fica no runner e é descartado, com `repoDigests` vazio. `baseImageRef` só lê o `FROM … AS build`. | `scripts/runtime-image-contract.mjs:16-71`; `scripts/runtime-image-record.mjs:37-67`; `scripts/ci-bar.mjs:458-473` |
| O job `image-scan` reconstrói `--target runtime` sem `--pull` e roda Trivy por `aquasecurity/trivy-action@ed142fd0…` (v0.36.0): HIGH/CRITICAL com correção falham; o relatório completo é informativo. | `.github/workflows/security.yml:95-136` |
| O SBOM atual (`npm run sbom`) sai do `package-lock.json`. Inclui dependências de dev (marcadas `cvg:dev`) e usa CycloneDX 1.5. Não tem pacotes do SO, não tem o binário `node` e não se liga a digest. Roda no gate `sbom` e no job `supply-chain`. | `scripts/generate-sbom.mjs:1-71`; `scripts/ci-bar-contract.mjs:243-248`; `security.yml:86-93` |
| Nenhum workflow faz `docker login`/`push` nem pede `packages: write`. O teste do produto proíbe push. | `grep` em `.github/`; `tests/ci-workflow-contract.test.js:297` |
| A attestation sem segredo já funciona no repositório: o job `attest` usa `actions/attest@1e69f48a…` (v4) com `id-token`, `attestations` e `artifact-metadata: write`. `provenance-verify` usa `gh attestation verify --signer-workflow … --source-digest … --deny-self-hosted-runners`. | `.github/workflows/verify.yml:245-412` |
| Pins já revisados: checkout `11d5960a…`, setup-node `49933ea5…`, upload-artifact `ea165f8d…`, download-artifact `d3f86a10…`, attest `1e69f48a…`, trivy-action `ed142fd0…`. Não há action `docker/*`. | `verify.yml`, `security.yml` |
| O repositório não tem actionlint, zizmor nem parser YAML no lockfile. Os testes de workflow são textuais. Na máquina local há PyYAML 6.0.1 de sistema. | `package-lock.json`; `tests/ci-workflow-contract.test.js` |
| Os testes em `tests/**/*.test.js` entram em `test:core`. A cobertura mede só `.ts`/`.tsx` de `apps`, `packages` e `legacy`. | `vitest.config.mts:83-112`; `package.json:74` |

## 3. Actions de terceiros e de primeira parte (no SHA pinado)

| Fato | Fonte (SHA-256 do arquivo lido) |
| --- | --- |
| `actions/attest@1e69f48a…` aceita `subject-name`, `subject-digest`, `push-to-registry`, `sbom-path` (SPDX/CycloneDX até 16 MB), `create-storage-record` (padrão `true`) e `show-summary`. Sem predicado e sem `sbom-path`, gera proveniência SLSA. Repositório público usa o Sigstore público. Storage record só existe para repositório de organização. | `action.yml` `9e4a1b80…`; README `c513a2a2…` |
| O commit `ed142fd0…` de `aquasecurity/trivy-action` é verificado (22/04/2026), e a release v0.36.0 é imutável. A Trivy padrão é `v0.70.0`. Há o input `input` para tarball. `cache` (padrão `true`) restaura o banco por `actions/cache`. `token-setup-trivy` usa `github.token` como padrão e o repassa a `aquasecurity/setup-trivy@3fb12ec1…`. | `action.yaml` `c3cc09c5…`, linhas 13–16, 98–147 |

## 4. Proteção da main e execuções (API, 21/10)

| Fato | Onde |
| --- | --- |
| Proteção viva: 5 contextos (`REM21 CI bar (Node 22)`, `codeql`, `secret-scan`, `supply-chain`, `image-scan`), todos `app_id 15368`. Também: `strict: false`, `enforce_admins: true`, histórico linear, 0 aprovações, sem force push. Não há rulesets. | snapshot `branchProtectionMain`; [protection-final.json](../GIT-GH006-20261018/solo-merge/protection-final.json) |
| O merge é squash: `24cdb463` é o `merge_commit_sha` do PR #13 (head `b7519a38…`, 21 commits). O SHA da `main` nunca recebe checks de `pull_request`. | snapshot `pullsForMainSha` |
| `verify.yml` e `security.yml` também rodam em `push` na `main`. Em `24cdb463`, os 5 checks vieram das execuções de push: `REM21…` na suíte do Verify (107249000371) e os outros 4 na suíte do Security (107249000486). | `verify.yml:3-8`; `security.yml:3-10`; snapshot `mainCheckRuns`, `mainWorkflowRuns` |
| No head do PR há também `CodeQL` do app 57789 (code scanning), diferente do `codeql` obrigatório (app 15368). Por isso o casamento precisa usar o nome exato e o app. | snapshot `prHeadCheckRuns` |
| O Security de push dura 5–8 min. O Verify de push dura 2h03–2h44 (5 sucessos recentes). | `gh run list` de 19–21/10 |
| O Verify usa `cancel-in-progress: true` por ref. 3 das 8 últimas execuções de push foram canceladas pelo merge seguinte (`05d4a30a`, `6ff1a648`, `6324d551`). | `verify.yml:13-15`; `gh run list` |
| O Security também roda por `schedule` semanal na `main`. | `security.yml:9-10` |
| Configuração do repositório: permissão padrão de workflow `read`, `allowed_actions: all`, `sha_pinning_required: false`. | snapshot `actionsPermissions`, `workflowPermissions` |

## 5. Runner, daemon e registro

| Fato | Onde |
| --- | --- |
| O image-scan de 21/10 rodou em `ubuntu-24.04` (imagem 20261012.334.1), com BuildKit no "docker driver" e store clássico ("writing image sha256:…"). O readme do runner traz Docker 28.0.4, Buildx 0.38.0 e Skopeo 1.13.3. | log do job, linhas 16–19, 224, 409; readme `ubuntu24/20261012.334` |
| Na máquina local: Docker 29.1.3 com containerd snapshotter e buildx 0.29.0. Nesse store o ID da imagem não é o digest da config, e o build pode anexar attestation (índice). A identidade não pode depender do store. | `docker info`; `docker buildx version` |
| O repositório é **público** e o dono é conta de usuário (`U_…`). Logs, artefatos e attestations deste repositório são legíveis publicamente. | `gh repo view` |
| Pedido anônimo de token de pull para `ricardoakinaga-dev/cvg-operational-harness` volta `DENIED`. É a mesma resposta de um nome inexistente; pacote público recebe token (`aquasecurity/trivy`). O token local não tem `read:packages`, então não deu para listar se o pacote já existe. | snapshot `ghcrAnonymousProbe` |

## 6. Consumo no deploy

| Fato | Onde |
| --- | --- |
| `migrate`, `api` e `worker` usam `${CVG_HARNESS_IMAGE_REPOSITORY}@${CVG_HARNESS_IMAGE_DIGEST}`. O `alert-relay` do on-prem usa a mesma referência. | `deploy/harness/compose.production.yaml:26,54,80,141`; `compose.onprem.yaml:40` |
| O `proxy` usa outra imagem, o alvo `web` (`CVG_HARNESS_WEB_IMAGE_*`). Ela não passa pelo gate `image` nem pelo `image-scan`. | `compose.production.yaml:186`; `.env.example:37-38` |
| Os placeholders são `registry.example.invalid/...`. Pela C9 do README, o CI publica no GHCR privado, o servidor baixa por digest, o token de leitura fica no Vault e o smoke compara os digests. | `.env.example:33-38`; `deploy/harness/README.md:52,304-330` |

## 7. SHA-256 dos arquivos lidos (base `24cdb463`)

| Arquivo | SHA-256 |
| --- | --- |
| `Dockerfile` | `71120934dc1af3bba7b0eb6ac8f1f59560feabc4afcc8591ec4dafa9fc34da44` |
| `.dockerignore` | `b95d39dec872f0b513ab38ac83ad3bf846b159aa3e66ea1e1bf04c7f70453c8f` |
| `.github/workflows/verify.yml` | `f980b6b91de3f46386fc0764c37bb92fcd023dfe0508e019819d060044ed4a0b` |
| `.github/workflows/security.yml` | `50b36e099eabfb84a97c26cfd90c2f0ed939097b144a0f44de8cc01cea4a5cee` |
| `.github/workflows/product-shift-assistant.yml` | `0c64096d9507196436a9cda2cd9658f56dbe34af4e250e8babfd772f0b00c41a` |
| `scripts/ci-bar-contract.mjs` | `30db91c78f3d147dab2ba0f2f09952366c4310ad9856eb686234d06871184e88` |
| `scripts/ci-bar.mjs` | `a08a8e3bbd8b63cd969f734e4485046f890237d1829e9fa7ffa184fe62340627` |
| `scripts/runtime-image-record.mjs` | `64b1a9b041fc4c1ad2517f1435cc510df667e70e93207840b6fbd3922f683d4d` |
| `scripts/runtime-image-contract.mjs` | `c010daeaf72a6320cd69dbda04ff932fecbda99b7f4232b2592cdcd34149ec75` |
| `scripts/runtime-image-smoke.mjs` | `c3af18d45f4af6815c3b42f22cf7101f49b4c670c71b7b3ca82c38b96ed1dc4e` |
| `scripts/generate-sbom.mjs` | `2adca965eb1608955309cc9bd5d31e00b2985bea272d31801e90c4c335d97370` |
| `tests/ci-workflow-contract.test.js` | `e555dc961cf59ce5815bd2dd72380bc9fb61745c4535971b28b46213319c3d29` |
| `tests/runtime-image-contract.test.js` | `f79f954fb373183c08d5379b88f129aa5fe6a042e4bf80a7b40bc7de93951da8` |
| `deploy/harness/README.md` | `dd88fef13c0fe0159493a6aa0f359f3a304fa7c26c4f5d1ef71e3d4e48ef40f6` |
| `deploy/harness/compose.production.yaml` | `395af0153f4d29d84df9f4c990c9d3da7450ef7215b4885585972e4fe958d990` |
| `deploy/harness/compose.onprem.yaml` | `82a4d5542c9a2801a42b43941806f1cf866793845fd9de2b8484263870f95f09` |
| `deploy/harness/.env.example` | `dae0e8442c21bcfb2d941acb8e62d4cd522b527fec94fbb7d467332b3ebef949` |
| `products/shift-assistant/deploy/Dockerfile` | `2965241f638717682c41244b233e3bdee03e887732655ed469029ceba383e2f7` |
| `docs/03_build/0374_plano_producao_harness.md` | `20db9430a1cbdac6042781b1d510cfdd120b54f9b66f5299c29d82538708cf67` |
| `docs/04_audit/evidence/USER-DECISIONS-20261016/production-0374.json` | `79fa6fbcd94486e061e22219780b2d32855a3d84c7fa24a489ef315098f359e8` |
| `docs/04_audit/evidence/RELEASE-CI-0253-20261021/user-decision-20261021.json` | `644d4de624d8163b3409943bf6c9aff3db122520bea2fcd04aeda334cc4ab77c` |
| `docs/04_audit/evidence/GIT-GH006-20261018/solo-merge/protection-final.json` | `7ff11483399a0ac9296241428629ff0a02b5dc4b3b86ea8123922eaf533d87f4` |
| `docs/04_audit/evidence/AUD0621-PRODUCT-PISO008-20261021/ledger-delta.md` | `b71b15ee545e37a3b57eb5bad1ab1d90f47586802f4120a102a4e97a4723337f` |
| `vitest.config.mts` | `d3b5e6480704d4a0d36a7e2f13f3b73256616be7c522eaf5d29ad80cac2012c5` |
| `package.json` | `48aabc0ffda3e6e203e9b3045a0699c76019de7f0aafb26b5e9a10cf6c522d66` |

## 8. Recon adicional para a r2 (22/10/2026)

Método igual ao das seções anteriores: `gh api` GET, `curl` anônimo GET e `docker buildx imagetools inspect`. Nada foi construído nem publicado.

| Fato | Onde |
| --- | --- |
| `GET /repos/…/branches/main` sem autenticação devolve `protected: true` e `protection.required_status_checks` com `enforcement_level: everyone` e os 5 `checks` (contexto e `app_id 15368`). O gate pode comparar a proteção viva com `REQUIRED_CHECKS`. | snapshot `branchMainAnonymous` |
| Execuções `pull_request` do head do PR #13 (`b7519a38`): Verify `39561779898` (suíte `107209420265`), Security `39561779918` (suíte `107209420311`) e Product `39561779902`, todas `success`. | snapshot `prHeadWorkflowRuns` |
| `check-suites/107249000486/check-runs?filter=all` lista os 4 checks do Security de push com `app 15368`. | snapshot `securitySuiteCheckRunsFilterAll` |
| `ghcr.io/aquasecurity/trivy:0.70.0` e `docker.io/aquasec/trivy:0.70.0` apontam para o índice `sha256:be1190afcb28352bfddc4ddeb71470835d16462af68d310f9f4bca710961a41e`; o manifesto `linux/amd64` é `sha256:85e87be1a96459c38a4eea47dc64eb2d342bb14cd4b4cef96adcf6ff03378b7c`. | snapshot `trivyImage` |
| O `schedule` do Security usa o mesmo grupo de concorrência do push na `main` (`github.ref`) e tem `cancel-in-progress: true`. | `.github/workflows/security.yml:15-17` |
| Em repositório público, a lista de artefatos de workflow é anônima, e o download fica liberado para qualquer conta autenticada. Constatado pelo crítico r1 com 253 artefatos listados. | [revisão r1](spec-review-r1/review.md), M1 |

## 9. Recon adicional para a r3 (22/10/2026)

Método: `gh api` GET em `aquasecurity/trivy` (releases, security-advisories, documentação da CLI em `v0.75.0`), `curl` anônimo GET em `branches/main` e `docker buildx imagetools inspect`. Nada foi construído nem publicado.

| Fato | Onde |
| --- | --- |
| A proteção lida sem autenticação traz `protection.enabled: true` e `required_status_checks.enforcement_level: everyone`, com os 5 `checks` e `app_id 15368`. | snapshot `branchMainAnonymous` |
| Advisories da Trivy: `GHSA-69fq-xp46-6x23` (crítico, ecossistema comprometido em 21/03/2026), `GHSA-mcj4-mphf-j9ff` (alto, `< 0.71.1`, banco forjado escreve fora do destino), `GHSA-q3fv-x8vg-qqm4` (médio, `< 0.71.0`) e `GHSA-8rc5-4fr6-64pw` (médio, `< 0.72.0`). | `gh api repos/aquasecurity/trivy/security-advisories` |
| Releases imutáveis recentes: v0.76.1 (21/10), v0.76.0 (14/10), v0.75.0 (01/10), v0.74.0 (14/08). `ghcr.io/aquasecurity/trivy:0.75.0` aponta para o índice `sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa`; o manifesto `linux/amd64` é `sha256:9db099105405c648166e6b94155eb32f8da12673cf1f455207f7385cc9a77283`. | snapshot `trivyRelease` |
| Na `v0.75.0`, `trivy image` documenta `--input`, `--download-db-only`, `--skip-db-update`, `--skip-java-db-update`, `--offline-scan`, `--db-repository` (padrão `[mirror.gcr.io/aquasec/trivy-db:2, ghcr.io/aquasecurity/trivy-db:2]`), `--skip-version-check` e `--disable-telemetry`. `trivy version` aceita `--format json`. | `docs/guide/references/configuration/cli/trivy_image.md` e `trivy_version.md` em `v0.75.0` |
| `ghcr.io/aquasecurity/trivy-db:2` existe como manifesto OCI (em 22/10: `sha256:9424f2c6…`), que muda a cada atualização do banco. | `docker buildx imagetools inspect` |

## 10. Fatos para a r4 (22/10/2026)

| Fato | Onde |
| --- | --- |
| Na seção "Default permissions and access settings for packages modified through workflows", o GitHub Docs diz: pacote criado por workflow com `GITHUB_TOKEN` "inherits the visibility and permissions model of the repository where the workflow is run". Em "Configuring a package's access control and visibility": "Once you make a package public, you cannot make it private again." O repositório é público. | [revisão r3](spec-review-r3/review.md), R3-M1 |
| Decisão do usuário: ele cria uma vez o pacote privado com credencial própria, com só uma imagem placeholder `placeholder-AAAAMMDD`, confere `Private` e dá `Write` ao Actions do repositório. O release nunca cria o pacote. | [user-decision-20261022.json](user-decision-20261022.json) |
| O índice `ghcr.io/aquasecurity/trivy:0.75.0@sha256:af6acf9a…` tem um referrer Sigstore (`application/vnd.dev.sigstore.bundle.v0.3+json`). O certificado traz SAN `https://github.com/aquasecurity/trivy/.github/workflows/reusable-release.yaml@refs/tags/v0.75.0` e source digest `591e9799316a602e703f0b484f6c6d7b234ec8f3`. O crítico r3 o leu sem verificar a assinatura. A config da imagem não declara `User`. | [revisão r3](spec-review-r3/review.md), seção Trivy |
| A `v0.76.1` (21/10) traz a mitigação do incidente da CA eMudhra (Go 1.27.3). | [revisão r3](spec-review-r3/review.md), opcional 6 |
| `scripts/ci-bar.mjs`: a linha 614 é o `docker build`, a 615 é o smoke `runtime-image-smoke.mjs` e a 616 é o registro. | `grep -n` na base `24cdb463` |
