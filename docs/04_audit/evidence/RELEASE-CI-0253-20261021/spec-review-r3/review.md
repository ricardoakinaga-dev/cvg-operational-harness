# Crítica independente da SPEC0253, rodada 3

- Alvo: [`docs/02_spec/0253_release_image_ghcr.md`](../../../../02_spec/0253_release_image_ghcr.md), revisão r3, SHA-256 `6af7012ad72b98fdd6a56493cc51acfca97411f6f065570dd5947df54c17c820` (conferido).
- Base: worktree detached `/mnt/dados/cvg-work/cvg-d9ef-prodpath-20261021`, HEAD `24cdb463faa1010da5fd78b6d923950ac2741713`.
- Data: 22/10/2026. Crítico com contexto novo, sem participação na redação da SPEC nem nas revisões r1 e r2.
- Entradas lidas:
  - SPEC r3 inteira, [recon](../recon.md), [snapshot](../api-snapshot-24cdb463.json);
  - revisões e correções [r1](../spec-review-r1/review.md) ([correções](../spec-review-r1/corrections.md)) e [r2](../spec-review-r2/review.md) ([correções](../spec-review-r2/corrections.md));
  - [decisão de 21/10](../user-decision-20261021.json) e G6 de [production-0374.json](../../USER-DECISIONS-20261016/production-0374.json);
  - `verify.yml`, `security.yml`, `Dockerfile`, `.dockerignore`, `scripts/ci-bar.mjs`, `scripts/ci-bar-contract.mjs`, `scripts/runtime-image-contract.mjs`;
  - os testes `ci-workflow-contract`, `runtime-image-contract`, `ci-bar-contract` e `security-scan-config`.
- Fontes externas, só leitura:
  - `gh api` GET em `aquasecurity/trivy`: release `v0.75.0`, lista de releases, advisories do repositório e do banco global, notas da `v0.76.x`. Também o código em `v0.75.0`: `pkg/flag/options.go`, `pkg/version/version.go`, `pkg/commands/app.go`, `pkg/commands/artifact/run.go`, `pkg/sbom/io/encode.go` e a documentação da CLI (`trivy_image.md`, `trivy_version.md`);
  - `actions/attest@1e69f48a` (`src/main.ts`) e `actions/setup-node@49933ea5` (`action.yml`);
  - `docker buildx imagetools inspect` de `ghcr.io/aquasecurity/trivy:0.75.0`, da referência `sha256-<índice>` e de `docker/dockerfile:1.7`;
  - o bundle Sigstore anexado ao índice da Trivy, só para ler o certificado;
  - `curl` anônimo ao endpoint de token do GHCR;
  - documentação do GitHub Packages:
    - [publicar com Actions](https://docs.github.com/en/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions);
    - [visibilidade e acesso](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility);
    - [permissões](https://docs.github.com/en/packages/learn-github-packages/about-permissions-for-github-packages).

Nada foi construído, executado em CI, publicado ou alterado fora desta pasta. Não rodei contêiner da Trivy.

## Veredito: `REVISE`

Fica um obrigatório, e ele volta ao usuário.

- R2-M1 e R2-M2 estão resolvidos. Não achei caminho para o contêiner da Trivy chegar a token, nem para alterar o que é publicado ou atestado.
- A troca para a Trivy `0.75.0` está correta: o digest e a release existem e são imutáveis, e os advisories conferem.
- O problema novo é o pacote. Pela documentação oficial do GitHub, um pacote criado por `GITHUB_TOKEN` num workflow herda a visibilidade do repositório. Este repositório é público. A mesma documentação diz que um pacote público não volta a ser privado. A SPEC deixa o primeiro run criar o pacote e conta com a recuperação "o usuário torna o pacote privado e reexecuta", que segundo a documentação é impossível (R3-M1).

## Status dos obrigatórios da r2

| ID | Status | Evidência |
| --- | --- | --- |
| R2-M1 | **Resolvido** | Ver a análise abaixo. Nenhuma montagem gravável do host: o tarball entra como arquivo `readonly` (`0444`), e o banco fica em volume nomeado que o host não lê (§3.3, tabela e passos 7–11). Relatórios e SBOM saem pelo stdout para `evidence/` (`0700`, nunca montado). A leitura passa por `readEvidenceFile`: lista exata, `lstat`, `nlink = 1`, tamanho máximo, `O_NOFOLLOW` e `fstat` (§3.5). `sbom-path` e upload usam só `evidence/`, por lista explícita (passos 19 e 22). O banco é baixado num passo à parte, sem `/in`. Versão, gate, relatório e SBOM rodam com `--network none --skip-db-update --offline-scan`. O login vem depois de toda a Trivy (passo 15). P1, P4, L3 e os mutantes cobrem cada ponto. |
| R2-M2 | **Resolvido** | Com a sondagem `present`, o `gate` usa `DOCKER_CONFIG` temporário, faz `docker login` de leitura e roda quatro verificações (proveniência e CycloneDX, cada uma pela API e por `--bundle-from-oci`), além da sonda anônima, com a limpeza em `if: always()` (§3.2, passo 4). A regra 8 exige as quatro com `exit = 0`, subject igual ao digest e `DENIED`. `release-verify` faz o mesmo (§3.4). L5 roda a CLI do gate de ponta a ponta sobre o layout de `$RUNNER_TEMP/release-gate/` (`already_published`, mais variantes `refuse`). O `gh` lê a credencial pelo `DefaultKeychain`, que respeita `DOCKER_CONFIG`. A assinatura real só existe no primeiro run, e a SPEC diz isso. |

### Análise de R2-M1: pode a Trivy, comprometida ou com banco forjado, alterar o publicado ou chegar a token?

- **Bytes publicados.**
  - O push sai do daemon (passo 16), que nenhum contêiner da Trivy alcança: não há socket nem `/var/lib/docker`.
  - O passo 17 compara o `config.digest` do manifesto bruto com a âncora do passo 5, gravada antes de qualquer código de terceiro.
  - Saídas de passo ficam presas ao `id`. Mesmo um `::set-output` emitido pela Trivy no stderr só define saídas do próprio passo da Trivy, nunca de `steps.anchors`.
  - `::set-env` e `::add-path` estão desligados no runner.
- **Token.**
  - `docker run` sem `-e`/`--env-file` não repassa variável do host. O `/proc` do contêiner é do namespace dele: `/proc/self/environ` só tem `PATH`, `HOSTNAME` e `HOME`.
  - O `~/.docker/config.json` com credencial só nasce no passo 15, depois do último contêiner. Os bundles do `actions/attest` vão para `mkdtemp($RUNNER_TEMP)` (`src/main.ts:99,234-241`), fora de qualquer montagem.
- **Volume nomeado.**
  - Só contêineres da Trivy o montam.
  - Symlink plantado nele resolve dentro do contêiner que o monta, e lá o tarball é só leitura.
  - `docker volume rm` não segue symlink.
- **Rede no passo do banco.** O contêiner do download (rede `bridge`) roda antes de qualquer contêiner com o tarball e não o vê. Pela ponte ele alcança a internet, serviços da máquina host e os endpoints de metadados da nuvem do runner. Nenhum deles entrega token do repositório. É resíduo aceitável e cabe numa linha em §8 (opcional 3).
- **Stdout grande ou com escapes.**
  - O arquivo em `evidence/` nunca é interpretado como terminal. Só o próprio código o lê, com `JSON.parse`.
  - Stdout gigante enche o disco e derruba o job: é negação de serviço, não integridade.
  - O stderr vai para o log público. A §8 já cita isso como resíduo.
- **Raiz do contêiner.** A config da imagem não declara `User` (conferido nas quatro plataformas), então o contêiner roda como uid 0 sem capabilities. A montagem só leitura é imposta pelo kernel, e sem `CAP_SYS_ADMIN` não há remontagem. A SPEC diz "usuário padrão da imagem"; vale escrever que é root (opcional 4).

## O que conferi e está certo

- **Origem (R1, R2, regras 1–7).** Continua correta. A regra 2 (`githubSha = head_sha`) amarra checkout, OIDC e proveniência ao commit verificado. Checks casam por nome exato, `app.id 15368` e suíte da execução de push, com `filter=all`. PR, fork, `schedule` e reexecução não publicam SHA sem os 5 checks.
- **Permissões mínimas.**
  - `permissions: {}` no topo.
  - `gate` só com leitura.
  - `release` com `packages`, `id-token` e `attestations: write`. Com `create-storage-record: false`, não precisa de `artifact-metadata`.
  - `release-verify` só com leitura. O `download-artifact` do mesmo run usa o token de runtime.
- **Pins e cache.**
  - Só actions `actions/*`, com os SHAs já revisados.
  - `setup-node@49933ea5` é a v4.4.0, que não tem cache automático: só com `cache:`.
  - O frontend `docker/dockerfile:1.7` resolve hoje para `sha256:a57df69d…` (conferido).
  - Nenhum teste existente fixa a linha 1 do `Dockerfile` (P5 plausível).
- **SBOM.** Na `0.75.0`, `--format cyclonedx` sem `--scanners` zera os scanners e liga só o inventário (`pkg/flag/options.go:504-523`). R6 ("sem vulnerabilidades") vale. O `ImageID` sai de `Metadata.ImageID` (`pkg/sbom/io/encode.go:109-110`).
- **`trivy version --format json --cache-dir`.** Lê o metadado do banco do cache (`pkg/version/version.go:31-96`) e não dispara checagem de atualização (`pkg/commands/app.go:1448-1475`).
- **`actions/attest`.** Cada chamada grava o bundle num `mkdtemp` próprio. Os dois bundles não colidem.

## Trivy 0.75.0 (tarefa 2)

- **Release.** `v0.75.0` existe, publicada em 2026-10-01T13:34:13Z, com `immutable: true`, sem ser rascunho ou pré-release. O tag aponta para o commit `591e9799316a602e703f0b484f6c6d7b234ec8f3`.
- **Imagem.**
  - `ghcr.io/aquasecurity/trivy:0.75.0` é o índice `sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa`; o SHA-256 dos bytes brutos confere. O manifesto `linux/amd64` é `sha256:9db099105405c648166e6b94155eb32f8da12673cf1f455207f7385cc9a77283`.
  - As configs têm `org.opencontainers.image.revision = 591e9799…` e `version = 0.75.0`, criadas às 13:32Z, dois minutos antes da release.
  - O digest é imutável por construção.
- **Assinatura.** O índice tem um referrer `application/vnd.dev.sigstore.bundle.v0.3+json` com predicado `https://sigstore.dev/cosign/sign/v1`, cujo subject é o próprio índice. O certificado traz:
  - SAN `https://github.com/aquasecurity/trivy/.github/workflows/reusable-release.yaml@refs/tags/v0.75.0`;
  - source digest `591e9799…`;
  - ref `refs/tags/v0.75.0`.

  Só li o certificado. Não verifiquei a assinatura criptograficamente, porque não há `cosign` e o `gh` local é o 2.45.0.
- **Advisories.** Os quatro citados existem (API do repositório e banco global):

  | Advisory | Severidade | Afeta | Corrigido em |
  | --- | --- | --- | --- |
  | `GHSA-69fq-xp46-6x23` | crítico | `trivy = 0.69.4`, `trivy-action < 0.35.0`, `setup-trivy < 0.2.6` | — |
  | `GHSA-mcj4-mphf-j9ff` | alto | `< 0.71.1` | `0.71.1` |
  | `GHSA-q3fv-x8vg-qqm4` | médio no repositório, alto no banco global | `< 0.71.0` | `0.71.0` |
  | `GHSA-8rc5-4fr6-64pw` | médio | `< 0.72.0` | `0.72.0` |

  A `0.75.0` está fora de todos os intervalos. Não há advisory publicado contra a `0.75.0`.
- **`v0.76.1` (21/10).** Traz um "Security update: eMudhra CA incident": binários com Go 1.27.3 e mitigação de distrust de certificado. A `0.75.0` não tem isso. O efeito aqui se limita à confiança TLS do download do banco. Não muda a escolha; vale registrar (opcional 6).
- **Premissa?** Não. É a mesma ferramenta, do mesmo publicador, numa release mais nova, pinada por digest. Muda o canal: a imagem de contêiner do GHCR assinada pelo workflow de release da Aqua, em vez do binário instalado pela `setup-trivy`. `ghcr.io/aquasecurity/trivy-db:2` já é a reserva padrão do banco que o `image-scan` usa. Não há segredo, conta nem action nova. O crítico r2 já tinha apontado a subida para ≥ 0.71.1 como sem premissa.
- **`image-scan` na `0.70.0`.** Não leva a BUILD errado.
  - R9 e §5 deixam `security.yml` intocado, e P5 garante os testes.
  - O release repete a mesma política sobre os bytes publicados, com Trivy e banco mais novos.
  - Divergência só pode deixar o release vermelho com o `image-scan` verde, o que é falha fechada e se corrige por PR.
  - O `image-scan` na faixa do `GHSA-mcj4` roda em outro runner, só com `contents: read`, e não alcança o release.
  - O cartão SEC-TRIVY (§4) cobre a atualização.

## OBRIGATÓRIOS

### R3-M1. O primeiro run cria o pacote, que nasce público pela documentação oficial e não volta a ser privado

**Evidência.**

- **Visibilidade herdada.** O GitHub Docs, em "Publishing and installing a package with GitHub Actions", seção "Default permissions and access settings for packages modified through workflows", diz que, quando um workflow cria um pacote com `GITHUB_TOKEN`, "The package inherits the visibility and permissions model of the repository where the workflow is run". A regra vale para registros com permissões granulares, e o Container registry é um deles ("About permissions for GitHub Packages"). Este repositório é **público** (SPEC §1.7; snapshot `visibility: public`).
- **Sem volta.** "Configuring a package's access control and visibility" diz: "Once you make a package public, you cannot make it private again."
- **A SPEC deixa o CI criar o pacote.**
  - Regra 8 do gate: token `DENIED` vale como `absent`, e segue para o push (linhas 274–287).
  - Passo 16: o push cria o pacote.
- **A SPEC conta com uma recuperação impossível.**
  - §3.4, linha 425: "O usuário torna o pacote privado e reexecuta o job que falhou".
  - §8, linha 669: "a troca para privado é ato do usuário. Até lá fica exposto…".
  - §9, linha 693: "tornar o pacote privado, se ele nascer público".
  - O recon não confirmou a visibilidade inicial (§8, linha 669). A documentação oficial responde à pergunta, e responde contra a SPEC.
- **Consequência, se a documentação valer.**
  - Os bytes e as camadas da imagem de produção ficam públicos e anônimos para sempre desde o primeiro push. Isso contradiz G6 ("GitHub Container Registry privado") e R8.
  - O `release-verify` fica vermelho sem recuperação.
  - Todo SHA seguinte publica no mesmo pacote público e também fica vermelho.
  - É o mesmo defeito do M1 da r1 (bytes públicos, contra G6), agora permanente.
- **A detecção da SPEC chega tarde.** A sonda anônima só roda depois do push e das attestations (§3.4, passo 4). Antes do push ela não distingue "privado" de "inexistente" (§1.7).

**Por que é obrigatório.** Com a SPEC como está, o BUILD implementa um fluxo que provavelmente torna públicos, de forma irreversível, os bytes que o usuário decidiu manter privados. A recuperação declarada não existe. É BUILD inseguro diante de G6. Não há como corrigir sem um ato do usuário fora do CI, por isso o item volta ao usuário (ver "Premissa nova?").

**Correção.**

1. **O release nunca cria o pacote.** A nova invariante, em R8 e R5, é: só se publica em pacote que já existe e é privado. A pré-condição é checada no `gate` (regra 8) e de novo no passo 14 do `release`, antes do push:
   - **Existência e acesso:** `GET https://ghcr.io/v2/<nome>/tags/list` com o token do job. 200 significa que o pacote existe e o repositório tem acesso. Token `DENIED` autenticado, 401/403 ou 404 `NAME_UNKNOWN` dão `refuse` (`package_missing_or_inaccessible`). Token `DENIED` deixa de valer `absent`.
   - **Privacidade antes do push:** pedido anônimo de token para o pacote. Com o pacote existente, `DENIED` significa privado; token emitido dá `refuse` (`package_public`).
   - **Tag:** só manifesto 404 `MANIFEST_UNKNOWN` de `sha-S` é `absent`.
   - `classifyTagProbe`, P3, L4 e P1 ganham esses casos. Mutantes:
     - push com o pacote inexistente;
     - token `DENIED` autenticado tratado como `absent`;
     - push sem a sonda anônima prévia.
2. **Texto.**
   - §3.4, §8 e §9: tirar a recuperação "tornar privado e reexecutar".
   - §1.7 e §8: registrar os dois trechos da documentação.
   - A sonda depois do push continua, como defesa redundante.
3. **Decisão do usuário antes do BUILD,** levada pelo Lead:
   - **(a)** O usuário cria o pacote privado antes do primeiro run, fora do CI e com credencial própria (`write:packages`).
     - Exemplo: push de uma imagem mínima com tag `bootstrap` e label `org.opencontainers.image.source` deste repositório.
     - Depois, em "Manage Actions access", dar `Write` ao repositório e conferir "Private".
     - Isso é publicação fora da `main`, que a decisão de 21/10 lista em `notGranted`, então precisa de autorização explícita.
   - **(b)** Aceitar pacote público, o que muda G6 e R8.
   - **(c)** Outro registro, que é premissa nova.

   A SPEC registra a escolha e o ato correspondente em §9.

## OPCIONAIS

1. **`trivy version` não aceita `--skip-version-check` nem `--disable-telemetry`.**
   - Na `v0.75.0`, esses flags são do `trivy image` (`trivy_image.md:55,163`). O `version` só tem `--format` mais os globais (`trivy_version.md`), e não dispara checagem de atualização (`pkg/commands/app.go:1448-1475`).
   - P1 (linha 526) exige os dois "em toda chamada", e o mutante "sem `--skip-version-check` ou sem `--disable-telemetry`" reforça. O passo 8 (linhas 339–347) não os usa, e acrescentá-los faria o comando falhar com "unknown flag".
   - **Correção:** limitar a regra às chamadas `image`. A chamada `version` continua com `--network none`.
   - L2 pegaria a contradição, então não leva a BUILD errado, mas vale corrigir junto com R3-M1.
2. **Um só contêiner com rede.**
   - P1 exige `--network none` só "em toda chamada com `/in`" e a ordem "download < demais". O volume é um canal: um contêiner de varredura comprometido pode deixar ali bytes da imagem, e qualquer chamada posterior com rede que monte o volume pode levá-los embora.
   - **Correção:** P1 exige exatamente uma chamada da Trivy sem `--network none`, a de `--download-db-only`, antes de qualquer outra. Mutante: chamada com rede depois das varreduras.
3. **§8, resíduos de rede e recurso.**
   - Citar que o contêiner do banco, na rede `bridge`, alcança serviços da máquina host e os endpoints de metadados da nuvem do runner, sem token do repositório.
   - Para negação de serviço, considerar:
     - `--pids-limit` e `--memory` nos contêineres da Trivy;
     - limitar o stdout já na escrita, com `head -c` e `pipefail`, além do limite na leitura.
4. **Usuário do contêiner.** Trocar "usuário padrão da imagem" (linha 337) por "root (uid 0) da imagem, sem capabilities". A config da imagem `0.75.0` não declara `User`.
5. **Assinatura da imagem da Trivy.** Registrar no recon o bundle Sigstore do índice `af6acf9a…`: signer `aquasecurity/trivy/.github/workflows/reusable-release.yaml@refs/tags/v0.75.0`, commit `591e9799…`. Se possível, verificar uma vez com `gh` recente, sem levar `cosign` ao CI.
6. **`v0.76.1`.** Registrar em §1.6 que ela traz a mitigação do incidente da CA eMudhra (Go 1.27.3), e por que a `0.75.0` basta: o efeito se limita ao TLS do download do banco. Pôr no cartão SEC-TRIVY a subida das duas Trivy.
7. **Publicação incompleta (§8, linhas 671–674).** Se o push e as duas attestations deram certo e depois falharam o registro ou o upload, o próximo gate dá `already_published`, não `refuse`. Ajustar o texto e dizer que, nesse caso, o digest do deploy vem do resumo do gate (§3.7).
8. **Comandos de workflow no stderr.** Os passos que rodam `$TRIVY_IMAGE` não têm `id`, ou ninguém consome as saídas deles. P1 confere isso. Hoje é inócuo, porque `::set-output` só afeta o próprio passo.
9. **Ciência sobre metadados públicos (§9, linha 690).** A publicação acontece sozinha depois do merge. Por isso a ciência explícita deve ser pré-condição do merge do PR do BUILD, não "quando vier". Pode ir na mesma pergunta de R3-M1. Citar também que a attestation do SBOM, além da proveniência, gera entrada no Rekor público.
10. **Âncoras de linha.**
    - O smoke está em `scripts/ci-bar.mjs:614`, não em `:615` (linha 321 da SPEC); a 615 é a do registro.
    - `GHSA-q3fv` é "alto" no banco global e "médio" no repositório (linha 77).
11. **Credencial no `curl`.** Passar o token da sondagem por cabeçalho lido do stdin ou por `--config -`, em vez de `-u usuário:token` na linha de comando.

## Premissa nova?

**Sim, por R3-M1.**

- Pela documentação oficial, o fluxo como escrito não cumpre G6 ("privado"): o pacote criado por `GITHUB_TOKEN` herda a visibilidade pública do repositório, e a mudança não tem volta.
- Para manter o pacote privado, o usuário precisa criá-lo antes, fora do CI, com credencial própria. Isso é publicação fora da `main`, que a decisão de 21/10 não concede.
- A alternativa é aceitar pacote público, o que muda G6.
- Qualquer das duas volta ao usuário antes do BUILD.

A troca para a Trivy `0.75.0`, sozinha, **não** é premissa nova: mesma ferramenta, mesmo publicador, release imutável pinada por digest e assinada pelo workflow de release da Aqua.
