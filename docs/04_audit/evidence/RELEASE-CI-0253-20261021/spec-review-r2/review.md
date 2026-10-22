# Crítica independente da SPEC0253, rodada 2

- Alvo: [`docs/02_spec/0253_release_image_ghcr.md`](../../../../02_spec/0253_release_image_ghcr.md), revisão r2, SHA-256 `bdb058ae4a891a4f3b430e710d647c39b95fadab4ea7fe9cfc8029b919ce5142` (conferido).
- Base: worktree detached `/mnt/dados/cvg-work/cvg-d9ef-prodpath-20261021`, HEAD `24cdb463faa1010da5fd78b6d923950ac2741713`. Em 22/10 a `main` remota ainda aponta para esse SHA (`GET branches/main` anônimo).
- Data: 22/10/2026. Crítico com contexto novo, sem participação na redação da r1, da r2 nem da revisão r1.
- Entradas lidas: SPEC r2 inteira, [recon](../recon.md), [snapshot](../api-snapshot-24cdb463.json), [revisão r1](../spec-review-r1/review.md), [correções](../spec-review-r1/corrections.md), [decisão de 21/10](../user-decision-20261021.json), [G6 de 16/10](../../USER-DECISIONS-20261016/production-0374.json), `verify.yml`, `security.yml`, `product-shift-assistant.yml`, `Dockerfile`, `.dockerignore`, `scripts/ci-bar.mjs`, `scripts/ci-bar-contract.mjs`, `scripts/runtime-image-*.mjs`, `scripts/phase3-candidate-digest.mjs`, `deploy/harness/.env.example` e os testes `ci-workflow-contract`, `runtime-image-contract`, `ci-bar-contract` e `security-scan-config`.
- Fontes externas, só leitura:
  - `gh api` GET em `cli/cli` (`pkg/cmd/attestation/artifact/oci/client.go`, último commit `a4f0de06`), `actions/upload-artifact@ea165f8d` (`src/shared/search.ts`), `actions/attest@1e69f48a` (`action.yml` `9e4a1b80…`, `src/main.ts`, `src/attest.ts`, `src/sbom.ts`) e `aquasecurity/trivy@v0.70.0` (`docs/guide/references/configuration/cli/trivy_image.md`, `docs/guide/advanced/telemetry.md`, `pkg/notification/notice.go`);
  - advisories de `aquasecurity/trivy` e lista de releases;
  - `curl` anônimo em `GET /repos/…/branches/main`;
  - `docker buildx imagetools inspect` de `ghcr.io/aquasecurity/trivy:0.70.0` e `docker/dockerfile:1.7`.

  Nada foi construído, executado em CI, publicado ou alterado fora desta pasta.

## Veredito: `REVISE`

São dois obrigatórios novos, os dois pequenos.

- A origem continua correta. Não achei caminho que publique um SHA sem os 5 checks. M2 está resolvido.
- O redesenho de M1 abriu um canal da Trivy para os tokens do job privilegiado. A Trivy roda em contêiner, mas grava em diretórios do host que os passos seguintes leem e publicam depois do `docker login` (R2-M1).
- A regra de M3 está certa, mas o `gate` não autentica no GHCR. Com isso, `already_published` nunca acontece (R2-M2).

## Status dos obrigatórios da r1

| ID | Status | Evidência |
| --- | --- | --- |
| M1 | **Parcial** | O transporte está resolvido: um job só, nenhum `upload-artifact` com `image.tar` (P1 e mutante), a Trivy em contêiner pinado por digest (conferi `sha256:be1190af…`, amd64 `sha256:85e87be1…`), o tarball em `chmod 0444` com montagem `readonly`, sem socket, sem `--env` do runner e com login depois (§3.3, passos 4–12). A propriedade "Trivy sem token" (R4, linhas 96–100) não se sustenta: ver R2-M1. |
| M2 | **Resolvido** | O passo `id: anchors` roda logo depois do `docker save` e antes do `docker pull` da Trivy (§3.3, passos 4–6). Saídas de passo ficam presas ao `id`, então nenhum passo posterior consegue redefini-las. A conferência pós-Trivy (passo 9), o registro (10) e o manifesto publicado (14) só comparam. P1 cobre a ordem `docker save` < `anchors` < Trivy < login < push < attest e quem escreve `tarball_sha256=`/`config_digest=`; P4 cobre `GITHUB_OUTPUT` intacto. Os bytes publicados saem do daemon, onde a Trivy não chega, e o `config.digest` do manifesto bruto (passo 14) amarra os `diff_ids`. |
| M3 | **Parcial** | A regra 8 e P3 exigem proveniência, attestation CycloneDX e sonda anônima `DENIED`, e o `refuse` vale para tag presente com publicação incompleta. Mas o passo 4 do `gate` não tem como verificar attestation de pacote privado: ver R2-M2. |

## O que conferi e está certo

- **Origem e gatilho (R1, R2, regras 1–7).**
  - O `if:` do `gate` barra `pull_request` de fork com branch `main`, o `schedule` e branch diferente de `main`.
  - A regra 2 (`githubSha = head_sha`) garante que o arquivo do workflow, o checkout, o token OIDC e a proveniência nomeiam o mesmo commit que passou nos checks. Reexecução de run antigo mantém o `GITHUB_SHA` original e, se ele foi `superseded` antes, continua `superseded`.
  - Os checks são casados por nome exato, `app.id 15368` e suíte da execução de push, com `filter=all` e maior `id`. Por isso `strict: false` e o squash não abrem brecha: o SHA da `main` precisa ter os próprios 5 checks.
  - Push direto sem PR cai na regra 6.
- **Proteção viva (O1 da r1).** `GET /repos/…/branches/main` anônimo devolve `protected: true` e `protection.enabled: true`. Em `required_status_checks`, traz `enforcement_level: everyone` e os 5 `checks` com `app_id 15368` (22/10). A regra 3 é implementável.
- **Pins.** Todas as actions do caminho são `actions/*` com o mesmo SHA de `verify.yml`/`security.yml`. `docker/dockerfile:1.7` resolve hoje para `sha256:a57df69d…` (conferido). Nenhum `actions/cache`. O `setup-node@49933ea5` (v4) não faz cache sem `cache:`.
- **`actions/attest@1e69f48a`.**
  - `push-to-registry` lê a credencial do registro pelo `getRegistryCredentials` do `@sigstore/oci`, que usa a config do Docker. Por isso o `docker login` do passo 12 antes dos passos 15–16 está certo.
  - Com `create-storage-record: false`, a action não chama a API de storage record, então `artifact-metadata: write` não faz falta (`src/attest.ts:70-100`).
  - O SBOM CycloneDX vira predicado `https://cyclonedx.org/bom` sem edição (`src/sbom.ts:52-110`).
- **Escopo e regressões.** Nenhum teste existente fixa a linha 1 do `Dockerfile`. `ci-bar-contract` só exige `FROM node:22…@sha256` (`scripts/ci-bar-contract.mjs:360-365`). `runtime-image-contract.mjs` não importa nada. P5 é plausível.
- **Privacidade dos bytes.** Os bytes não viram artefato nem cache. Repositório público, metadados públicos e Rekor estão em §8/§9. Resíduos estão em R2-M1 e nos opcionais 2 e 10.

## OBRIGATÓRIOS

### R2-M1. A Trivy grava em diretórios do host que o job privilegiado lê e publica depois do login

**Evidência.**

- **Montagens graváveis.** §3.3, passo 7 (linhas 268–277), monta `$RUNNER_TEMP/release/out` em `/out` e `$RUNNER_TEMP/release/trivy-cache` em `/cache`, os dois graváveis. O contêiner roda com o mesmo uid do runner. Ele pode criar ali qualquer entrada, inclusive symlink com alvo absoluto do host, como `/home/runner/.docker/config.json` ou `/proc/self/environ`, e FIFO.
- **O host consome esses diretórios sem barreira.**
  - O passo 10 lê SBOM e relatórios para o `build-record.json`.
  - O texto do banco (linha 299) manda registrar "o repositório de banco efetivamente usado" no `build-record.json`. O caminho natural é ler `trivy-cache/db/metadata.json`.
  - O passo 16 usa `sbom-path: out/sbom.cdx.json`.
  - O passo 17 sobe "o SBOM, os dois relatórios Trivy" no artefato `cvg-release-image-*`. O relatório informativo não é validado por contrato nenhum (§3.5).
- **A ordem agrava.** O passo 17 roda depois do `docker login` (passo 12). No runner hospedado, o login grava `github.token` (com `packages: write`) em claro em `~/.docker/config.json`. O job tem `id-token: write`, então `ACTIONS_ID_TOKEN_REQUEST_TOKEN`/`_URL` e `ACTIONS_RUNTIME_TOKEN` estão no ambiente de toda action.
- **`upload-artifact` segue symlinks.** No SHA pinado `ea165f8d`, `src/shared/search.ts:14-21` usa `followSymbolicLinks: true`. Um `trivy-full.json` que seja symlink para `~/.docker/config.json` ou `/proc/self/environ` sobe o conteúdo do alvo. O artefato é baixável por qualquer conta GitHub autenticada, porque o repositório é público (§1.7).
- **O que um atacante faz no resto do job.** Com o token do registro, publica imagem no pacote. Com o token de pedido de OIDC, obtém certificado Sigstore com a identidade `release-image.yml@refs/heads/main` e assina proveniência falsa para qualquer digest. Essa proveniência passa no `gh attestation verify --signer-workflow … --source-digest S` de §3.7. A janela é curta, mas a SPEC afirma o contrário: R4 diz que a Trivy "não recebe … token … nem credencial de registro", e §8 (linhas 510–513) limita o resíduo de uma Trivy comprometida a "falsear o resultado da varredura ou o conteúdo do SBOM".
- **A ameaça é concreta.**
  - `GHSA-69fq-xp46-6x23` (crítico, 21/03/2026): o ecossistema Trivy foi comprometido com malware que rouba credencial de CI. Foram afetados `trivy` v0.69.4, 76 tags da `trivy-action`, o `setup-trivy` e imagens 0.69.5/0.69.6 no Docker Hub.
  - `GHSA-mcj4-mphf-j9ff` (alto, 15/06/2026, afeta `< 0.71.1`, portanto a `0.70.0` pinada): um artefato OCI de banco forjado escreve fora do destino. O próprio advisory cita "files consumed by subsequent steps in the same pipeline". O banco é baixado sem pin a cada release (linha 299), e o primeiro repositório padrão é `mirror.gcr.io/aquasec/trivy-db:2` (`trivy_image.md:49`).

**Por que é obrigatório.** O BUILD implementaria, ao pé da letra, um caminho em que código de terceiro, com histórico real de comprometimento, chega aos tokens do único job com `packages: write` e `id-token: write`. Isso contradiz R4 e §8. O caminho é inseguro.

**Correção (sem premissa nova, só com o que já está no runner).**

1. **Nenhum passo do host lê, escreve ou publica caminho gravável pelo contêiner.** Duas formas aceitáveis; a SPEC escolhe uma:
   - **(a) Sem montagem de saída.** Cada chamada da Trivy escreve o relatório no stdout (`--format json` ou `--format cyclonedx`, sem `--output`). O shell do host redireciona para arquivo novo em `$RUNNER_TEMP/release/evidence/`, diretório que nunca é montado em contêiner. `trivy --version --format json` sai do mesmo jeito e traz os metadados do banco. Nada é lido de `trivy-cache`.
   - **(b) Saneamento antes de qualquer leitura.** Logo depois da última chamada da Trivy, e antes do passo 10 e do login, o próprio código (`release-image-record.mjs`) confere `/out`: lista exata de nomes, cada entrada arquivo regular por `lstat` (sem symlink, FIFO ou device), `nlink = 1` e tamanho máximo. Depois copia os bytes com `O_NOFOLLOW` para `$RUNNER_TEMP/release/evidence/`. Qualquer desvio falha o job.
2. `trivy-cache` (ou um volume Docker do job) só é removido no fim, sem leitura pelo host.
3. Os passos 10, 14, 16 e 17 leem só de `evidence/`: `sbom-path` absoluto em `evidence/`, e upload por lista explícita de arquivos, nunca por diretório ou glob da montagem.
4. Recomendado: `docker logout ghcr.io` logo depois do último `actions/attest` e antes do upload.
5. **Ajustes de texto e provas:**
   - **R4 e §8:** o resíduo passa a ser "falsear varredura e SBOM, gastar CPU e disco e, por rede ou log, vazar bytes deriváveis do repositório; sem acesso a token".
   - **P1:** nenhum passo além da chamada da Trivy (e do saneador, em (b)) cita `release/out` ou `trivy-cache`; `sbom-path` e o `path:` do `upload-artifact` apontam para `evidence/`.
   - **P4:** com (b), o saneador recusa symlink, FIFO, entrada extra e hardlink.
   - **L3:** um contêiner de controle planta `trivy-full.json -> /proc/self/environ` e `sbom.cdx.json -> ~/.docker/config.json`; o job precisa falhar antes do login, ou o arquivo em `evidence/` precisa ser o stdout real.
   - **Mutantes:** upload de `release/out`, `sbom-path` em `out/`, e saneador que segue symlink.

### R2-M2. O `gate` não autentica no GHCR, e `already_published` fica inalcançável

**Evidência.**

- **O `gate` não faz login.** §3.2, passo 4 (linhas 187–189), roda `gh attestation verify oci://ghcr.io/…@<digest>` no `gate` sem `docker login`. O passo 3 só usa `curl` com token.
- **O `gh` exige a credencial do Docker.** No `cli/cli`, `pkg/cmd/attestation/artifact/oci/client.go`, `GetImageDigest` chama `remote.Get(name, remote.WithAuthFromKeychain(authn.DefaultKeychain))`, com o comentário "The user must already be authenticated with the container registry". `artifact/image.go` passa por esse caminho para todo `oci://`, mesmo com digest na referência. `GH_TOKEN` não entra no `DefaultKeychain`. A busca de referrers (`--bundle-from-oci`) usa a mesma keychain.
- **Resultado.**
  - Para o pacote privado que a SPEC exige, toda verificação do `gate` falha com `ErrRegistryAuthz`, e a regra 8 dá `refuse` ou o passo quebra. `already_published` nunca acontece.
  - Duas recuperações da própria SPEC ficam vermelhas: "Re-run all jobs" depois de tornar o pacote privado (§3.4, linha 318) e o disparo duplo do mesmo SHA.
  - A prova declarada em §6 ("Um segundo disparo do mesmo SHA … precisa dar `already_published`", linha 493) é impossível de cumprir.
  - Nenhuma prova local (L1–L4) toca esse caminho. O defeito só apareceria depois do merge e custaria outro PR com Verify de 2 h.
- **Contraste.** O `release-verify` faz "login de leitura" (§3.4, passo 1), e o `release` faz login antes do attest. Só o `gate` ficou sem.

**Por que é obrigatório.** O BUILD sairia com um estado que a SPEC declara e não consegue alcançar, e com uma prova impossível. É exatamente o mecanismo que M3 pediu.

**Correção.**

1. No `gate`, quando a sondagem der `present`, fazer `docker login ghcr.io -u "$GITHUB_ACTOR" --password-stdin` com `github.token` (`packages: read`, já previsto), de preferência com `DOCKER_CONFIG` temporário em `$RUNNER_TEMP`. Em seguida, `docker logout`, ou apagar o diretório.
2. Rodar as verificações com saída e código de retorno gravados em arquivo, sem quebrar o passo, para `evaluateReleaseGate` decidir.
3. Deixar explícito que o `gate` verifica os dois predicados (proveniência e `https://cyclonedx.org/bom`) pelos dois caminhos, API e `--bundle-from-oci`. O `already_published` então cobre também "gravada no GHCR" (R7), que é de onde o servidor busca (§3.7).
4. P1 confere o login no `gate` antes do primeiro `gh attestation verify`. Mutante: `gate` sem login.

## OPCIONAIS

1. **R10 contra a rede da Trivy.**
   - A Trivy 0.70.0 chama `https://check.trivy.dev/updates` a cada execução, com telemetria anônima. Só pula com `--skip-version-check` e `--disable-telemetry` juntos (`pkg/notification/notice.go:39,51-58`; `telemetry.md`). Esse host não está em R10.
   - O banco padrão vem de `mirror.gcr.io/aquasec/trivy-db:2`, com reserva em `ghcr.io/aquasecurity/trivy-db:2` (`trivy_image.md:49`). R10 fala em "o registro … do banco" sem nomear.
   - **Correção:** pôr os dois flags em toda chamada (P1 confere). Fixar `--db-repository` de forma explícita, de preferência `ghcr.io/aquasecurity/trivy-db:2`, no mesmo domínio de confiança da imagem. Registrar em `build-record.json` o digest e o `UpdatedAt` do banco, tirados do stdout de `trivy --version --format json`.
2. **Separar rede de dados.** Baixar o banco com `trivy image --download-db-only`, num contêiner com rede e sem `/in`. Rodar gate, relatório e SBOM com `--network none --skip-db-update`. Assim uma Trivy comprometida ou um banco forjado não tem rede para levar os bytes da imagem (R8). Sobra o log, que §8 deve citar como resíduo.
3. **Versão da Trivy.**
   - Registrar em §1.6/§8 os advisories `GHSA-69fq-xp46-6x23` e `GHSA-mcj4-mphf-j9ff`.
   - Sobre o primeiro: imagem por digest não foi afetada, e o Docker Hub `aquasec` foi. A SPEC deve proibir `docker.io/aquasec/trivy` também em L2, e citar o Docker Hub só como "mesmo digest" em §1.6.
   - Sobre o segundo: ou justificar a 0.70.0 (configuração padrão não afetada; R4 impede override por env ou arquivo; `--db-repository` explícito), ou subir para ≥ 0.71.1 pinada por digest. A última release imutável é a v0.76.1, de 21/10. É a mesma ferramenta, sem premissa nova; o `image-scan` fica na 0.70.0 até cartão próprio.
4. **Contradição sobre `always()`.** §3.1 (linha 157), P1 e o mutante proíbem `always()` em `release`, mas o passo 18 exige `if: always()` no logout e na limpeza. A regra deve valer para o `if:` do job e listar a única exceção de passo permitida. Sem isso o BUILD precisa escolher.
5. **Ordem em P1.** "Primeira menção a `aquasecurity/trivy`" quebra se o BUILD declarar `TRIVY_IMAGE` no `env:` do job. Medir a ordem pelo índice do passo que faz `docker pull`/`docker run` da Trivy, ou proibir a declaração no nível do job.
6. **Sem npm no host.** Proibir `npm ci`, `npm install` e `npx` nos três jobs, e exigir que `release-image-*.mjs` importem só `node:` e os contratos locais, que já não importam nada. P1 confere. R4 implica, mas não diz.
7. **Fixture da proteção.** `branchMainAnonymous` no snapshot não tem `enabled` nem `enforcement_level`, que a regra 3 exige. O BUILD precisa recapturar `protection` inteiro: em 22/10 vieram `enabled: true` e `enforcement_level: everyone`.
8. **`Accept` da sondagem.** Incluir os tipos de índice (`application/vnd.oci.image.index.v1+json` e `application/vnd.docker.distribution.manifest.list.v2+json`). Assim, uma tag `sha-S` que aponte para índice é `present`. Sem isso, um 404 por `Accept` incompatível vira `absent` e o push sobrescreve a tag, contra R5.
9. **Download no `release-verify`.** O padrão `cvg-release-image-*` pode casar artefatos de tentativas anteriores do mesmo run. Exigir exatamente um, o da tentativa que publicou, ou falhar.
10. **Ciência do usuário.** §8/§9 pedem ciência sobre logs, SBOM, relatórios e attestations públicos, mas `user-decision-20261021.json` não registra isso. Não é premissa nova, porque o padrão já existe (`cyclonedx-sbom`, `trivy-image-report`, attestation da barra), e não bloqueia o BUILD. O Lead deve repassar no relatório da rodada, dizendo que a entrada no Rekor é permanente e liga o digest de produção a este repositório.

## Premissa nova?

**Não**, desde que R2-M1 e R2-M2 sejam corrigidos como proposto:

- stdout ou saneamento com o próprio código;
- `docker login` de leitura com o `github.token` já previsto.

Nenhuma das duas correções traz segredo, conta, credencial, ferramenta, action ou mudança de proteção. A imagem da Trivy pinada por digest é a mesma ferramenta e versão do `image-scan`. `registry:2` e PyYAML ficam só nas provas locais.

Duas observações, sem nenhuma que precise voltar ao usuário antes do BUILD:

- a chamada a `check.trivy.dev` (opcional 1) é saída de rede que R10 não lista e que se desliga por flag;
- a ciência sobre metadados públicos (opcional 10) é informativa.
