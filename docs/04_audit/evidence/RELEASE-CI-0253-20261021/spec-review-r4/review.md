# Crítica independente da SPEC0253, rodada 4

- Alvo: [`docs/02_spec/0253_release_image_ghcr.md`](../../../../02_spec/0253_release_image_ghcr.md), revisão r4, SHA-256 `e69dfe057ed4ce141f74ead3ac570837140e87a00948fbdeeecb23e3910c4109` (conferido com `sha256sum`).
- Base: worktree detached `/mnt/dados/cvg-work/cvg-d9ef-prodpath-20261021`, HEAD `24cdb463faa1010da5fd78b6d923950ac2741713`.
- Data: 22/10/2026. Crítico com contexto novo, sem participação na redação da SPEC nem nas rodadas r1–r3.
- Entradas lidas:
  - SPEC r4 inteira, [recon](../recon.md) e [snapshot](../api-snapshot-24cdb463.json);
  - revisões e correções [r1](../spec-review-r1/review.md), [r2](../spec-review-r2/review.md) e [r3](../spec-review-r3/review.md) (com os `corrections.md` de cada uma);
  - decisões [de 21/10](../user-decision-20261021.json), [de 22/10](../user-decision-20261022.json) e G6 de [production-0374.json](../../USER-DECISIONS-20261016/production-0374.json);
  - script do usuário `criar-pacote-ghcr.sh` no scratchpad da sessão (27 linhas, SHA-256 `b23bb991a9b973ef056776e2fe166df6dc4671e41c07052b1aa83e561b718a06`), só leitura;
  - `.github/workflows/{verify,security,product-shift-assistant}.yml`, `Dockerfile`, `scripts/ci-bar.mjs`, `scripts/ci-bar-contract.mjs`, `scripts/runtime-image-{contract,record}.mjs`;
  - os testes que leem workflows ou o `Dockerfile` (`ci-workflow-contract`, `ci-bar-contract`, `ci-bar-provenance`, `security-scan-config`, `construction-readiness`).
- Fontes externas, só leitura:
  - GitHub Docs: [visibilidade e acesso](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility), [publicar com Actions](https://docs.github.com/en/packages/managing-github-packages-using-github-actions-workflows/publishing-and-installing-a-package-with-github-actions), [conectar repositório](https://docs.github.com/en/packages/learn-github-packages/connecting-a-repository-to-a-package) e [cobrança do Packages](https://docs.github.com/en/billing/concepts/product-billing/github-packages);
  - `gh api` GET: `actions/permissions`, `actions/permissions/workflow`, `actions/permissions/fork-pr-contributor-approval`, `contributors`, dados do repositório e `action.yml` de `actions/attest@1e69f48a`;
  - `curl` anônimo ao GHCR (token, `tags/list` e manifesto de pacote público);
  - `docker buildx imagetools inspect` de `docker/dockerfile:1.7` e `ghcr.io/aquasecurity/trivy:0.75.0`.

Nada foi construído, executado em CI, publicado ou alterado fora desta pasta. Não rodei o script nem a Trivy.

## Veredito: `APPROVE`

Nenhum obrigatório. R3-M1 está resolvido. O release não cria o pacote em nenhum caminho que encontrei, e o caminho do usuário gera pacote privado pela documentação oficial.

Ficam opcionais. O1 deve entrar na ciência do usuário que a §9 já exige antes do merge; os demais podem ser tratados no BUILD ou pelo crítico de código.

## Status de R3-M1: **RESOLVIDO**

### O release nunca cria o pacote

- **Invariante.** R8 diz que o release só publica em pacote que já existe e é privado. Antes do push, o `gate` (regra 8) e o passo 14 do `release` exigem três coisas, e qualquer outra resposta dá `refuse` sem push:
  - `tags/list` autenticado = 200;
  - sonda anônima `DENIED`;
  - tag `sha-S` com manifesto 404 `MANIFEST_UNKNOWN` e fora da lista.
- **Classificação** (§3.2, regra 8). Token autenticado `DENIED` e `tags/list` 401/403/404 dão `missing_or_inaccessible`. Anônimo com token dá `public`. 5xx, timeout ou corpo ilegível dão `error`. `NAME_UNKNOWN`, 401/403, 406, código desconhecido ou `sha-S` listada com 404 são `error` na tag. Token `DENIED` deixou de valer `absent`.
- **Barreiras.**
  - O job `release` só roda com `publish == 'true'`.
  - O passo 14 roda sem `continue-on-error`, entre o registro e o `docker login`.
  - Nenhum passo depois de uma falha roda, exceto a limpeza.
- **`placeholder-*`.** R5 e o passo 16 dizem que essas tags são ignoradas e nunca reescritas. O push só toca `sha-S`, e só com a tag ausente.
- **Recuperação impossível removida.** `grep` em "tornar…privado"/"reexecut…" na r4 só acha recuperações válidas: apagar a versão incompleta, reexecutar o Security cancelado e o caso `superseded`. A sonda depois do push ficou como defesa redundante, sem recuperação no CI (§3.4, §8).
- **Provas e mutantes.**
  - **P1:** `package-precondition` antes do `docker login`, sem `continue-on-error`; sondagem com `tags/list` e sonda anônima. Mutantes: "push cria o pacote" (passo removido, com `continue-on-error` ou depois do push) e "sondagem sem `tags/list`/sem anônima".
  - **P3:**
    - pacote inexistente ou sem acesso dá `refuse` (`package_missing_or_inaccessible`) e nunca `publish`;
    - pacote público dá `package_public`;
    - 5xx ou timeout dão `refuse`;
    - os erros de tag dão `refuse`;
    - `placeholder-20261022` não muda a decisão.

    Mutantes: `DENIED`/`NAME_UNKNOWN` como `absent`, pacote público aceito, e 5xx/timeout/406 como `absent`.
  - **L4:** `NAME_UNKNOWN` e `MANIFEST_UNKNOWN` num `registry:2` local.
  - **L5:** CLI de ponta a ponta com pacote inexistente e público, com saída 1 e sem `publish=true`.

### A sonda distingue privado de inexistente?

- **Sozinha, não.** Conferi hoje, sem autenticação:
  - `ricardoakinaga-dev/cvg-operational-harness`: `403 {"errors":[{"code":"DENIED",…}]}`;
  - um nome aleatório inexistente no mesmo dono: o mesmo `403 DENIED`;
  - `aquasecurity/trivy` (público): recebe token.
- **No gate, sim.** `ok` exige `tags/list` autenticado 200, que prova existência e acesso. Só depois disso `DENIED` significa privado. A combinação está certa.
- **No script, sim, de forma indireta.** A sonda roda depois de `docker push` com `set -euo pipefail`. A existência fica provada pelo push que deu certo, e então `DENIED` significa privado. O script só imprime o código: um 200 não interrompe nada (opcional O9).
- **Semântica do GHCR conferida:** tag inexistente em pacote existente volta `404 MANIFEST_UNKNOWN` (pacote público, token anônimo). `tags/list` pagina por `Link: </v2/…?last=…&n=…>; rel="next"`.

### O script cria pacote privado de fato?

Sim, pela documentação.

- **Sem ligação ao repositório.** O script constrói `FROM scratch` + `README`, sem `LABEL org.opencontainers.image.source`, e faz push com a credencial do usuário (token do `gh` com `write:packages`), não com `GITHUB_TOKEN`. O pacote nasce não ligado ao repositório.
- **Visibilidade inicial.** GitHub Docs, "Configuring a package's access control and visibility": "When you first publish a package that is scoped to your personal account, the default visibility is private". A regra que tornaria o pacote público ("inherits the visibility … of the repository") vale só para pacote **criado** por workflow com `GITHUB_TOKEN`, justamente o caminho que a r4 bloqueia.
- **Credencial.** O token não aparece no argv: `read -rsp`, `printf` (builtin) para `--password-stdin` e `unset T`.

### A ligação posterior ao repositório pode mudar a visibilidade por herança?

Não.

- **O que é herdado.** A mesma página diz que, com repositório ligado, o pacote "inherits the access permissions (but not the visibility) of the linked repository".
- **Quando é herdado.** "A package only inherits the access permissions of a linked repository automatically if you link the repository to the package before you publish the package". O pacote do usuário já terá sido publicado (placeholder) antes de o primeiro push do release, com o label `source`, ligá-lo ao repositório. Por isso nem a herança de permissões é automática.
- **Única via para público.** Um admin muda a visibilidade à mão. Antes do push, o gate pega isso pela sonda anônima, para o SHA seguinte. Depois do push, quem pega é o `release-verify`.
- **"Manage Actions access" não liga o pacote.** As duas páginas dizem que adicionar o repositório ali "is different than connecting your package to a repository". O parêntese da §9, passo 3, está errado nesse ponto (O7). Isso não muda o resultado.

## O que conferi e está certo (tarefa 2)

- **Origem.** R1 e as regras 1–7 seguem corretas: `githubSha = head_sha`, checks por nome exato, `app.id 15368` e suíte da execução de push com `filter=all`, PR mesclado único com os checks do head, e a proteção viva igual a `REQUIRED_CHECKS`. O `workflow_run` não baixa artefato nem código da execução disparadora. O checkout é de `S = github.sha`, sem o padrão "pwn request".
- **Permissões.**
  - `permissions: {}` no topo e só leitura no `gate`.
  - No `release`: `packages`, `id-token` e `attestations: write`. `artifact-metadata` não é necessário, porque `create-storage-record: false` desliga a API de storage record (`action.yml` do pin `1e69f48a`: "Requires that push-to-registry is set to true. Defaults to true").
  - `release-verify` só com leitura.
- **Pins e cache.** Só `actions/*` já pinadas em `verify.yml`/`security.yml`. Nenhum `actions/cache`, `cache:` ou `--cache-*`. O frontend `docker/dockerfile:1.7` resolve hoje para `sha256:a57df69d…` e `ghcr.io/aquasecurity/trivy:0.75.0` para `sha256:af6acf9a…`, os dois conferidos agora.
- **Trivy isolada.**
  - **Token.** Nenhum caminho até token: `docker run` sem `-e`/`--env-file`, sem socket, e com o `docker login` depois do último contêiner.
  - **Bytes publicados.** Nenhum caminho que os altere: o tarball entra só leitura (`0444` e `readonly`), o push sai do daemon e a âncora `config_digest` é conferida no manifesto bruto.
  - **Rede.** Só o contêiner do banco tem rede, e ele não vê o tarball.
  - **Exfiltração.** Só por stdout ou stderr para `evidence/`/log públicos, com conteúdo derivável do repositório. É resíduo já aceito em §8.
- **Testes existentes.**
  - Nenhum teste varre `.github/workflows/*` de forma genérica: cada um lê o próprio arquivo, então P5 é plausível.
  - Só o teste do produto proíbe `docker push|login` (`tests/ci-workflow-contract.test.js:297`).
  - Nenhum teste fixa a linha 1 do `Dockerfile`.
  - As âncoras de linha citadas (`ci-bar.mjs:605-619`, `ci-bar-contract.mjs:237-242,360-365`, `runtime-image-record.mjs:59-60`, `compose.production.yaml:26`, `.env.example:33-34`) conferem.
- **Custo.** A documentação de cobrança diz hoje: "Container image storage and bandwidth for the Container registry is currently free". O risco de cota da §8 está bem dimensionado.
- **Metadados públicos.** A §9 trata a ciência explícita como pré-condição do merge do PR do BUILD, não do BUILD local. É coerente, porque o BUILD local não publica.

## OBRIGATÓRIOS

Nenhum.

## OPCIONAIS

### O1 (prioritário, entra na ciência pré-merge). Forks e outros workflows do repositório alcançam o pacote privado

- **Evidência.**
  - GitHub Docs ("Configuring a package's access control and visibility" e a tabela de "Publishing and installing a package with GitHub Actions"): "If you grant a public repository access to private packages, forks of the repository may be able to access the private packages."
  - O passo 3 da §9 dá `Write` ao repositório **público**.
  - API, hoje:
    - `fork-pr-contributor-approval = first_time_contributors`;
    - 1 contribuidor (o dono) e 0 forks;
    - `default_workflow_permissions = read`.
  - Um `pull_request` de fork usa o workflow do próprio PR, com token de leitura que pode pedir `packages: read`. Com o run aprovado, ele lê a imagem.
  - Com `Write` dado ao repositório, **qualquer** workflow do repositório pode pedir `packages: write`, inclusive de branch interna ou de PR interno. R4 ("Só o job `release` tem escrita") só vale dentro de `release-image.yml`.
- **Impacto.** Baixo. Os bytes são deriváveis do repositório público e não têm segredo (§8). A integridade do deploy não depende da ACL: depende das attestations com `--signer-workflow release-image.yml`, `--source-ref refs/heads/main` e `--source-digest` (§3.7, regra 8). Mesmo assim, "privado" em G6 e R8 fica mais fraco do que a SPEC sugere, e o usuário não decidiu isso de forma informada em 22/10.
- **Correção.**
  - Registrar em §8 como resíduo.
  - Ajustar R4: "dentro do workflow; a ACL do pacote dá `Write` ao repositório inteiro, e a integridade vem das attestations".
  - Incluir o resíduo na mesma ciência pré-merge da §9.
  - Recomendar, como decisão do usuário sobre a configuração do repositório, `approval_policy = all_external_contributors`.

### O2. Origem dos campos `gate.*` de `release-image.json`

- **Evidência.**
  - `validateReleaseImageRecord` exige `gate.checks`, `gate.protection` e `gate.decision` (§3.5, linhas 484–485).
  - O `gate` só exporta `decision`, `publish`, `sha` e `digest` (§3.1, linha 189; §3.2, passo 5).
  - O `release` não tem `actions`/`checks: read` (§3.3).
  - P1 limita `download-artifact` a `name: ${{ needs.release.outputs.artifact_name }}`.
- **Risco.** O BUILD não tem caminho especificado e pode preencher `gate.checks` com a própria constante `REQUIRED_CHECKS`, e aí a validação vira tautologia.
- **Correção.**
  - **Origem dos dados.** Uma de duas:
    - o `gate` exporta `gate_record`: JSON compacto com `decision`, `sha`, `pr`, `runs`, `checks` e `protection` tirados das respostas da API. O `release` repassa por `env:` ao `publish`;
    - P1 permite baixar no `release` exatamente o artefato do gate, pelo nome.
  - **Mutante (P4):** `publish` que monta `gate.checks` a partir da constante.

### O3. De onde o `build` lê usuário, `CMD` e label

- **Evidência.**
  - O passo 13 diz "Lê só de `evidence/` e do checkout".
  - `validateBuildRecord` exige `configUser`, `cmd` e o label `revision`.
  - Em `evidence/`, essa informação só existe na saída da Trivy (`Metadata.ImageConfig` do JSON), que é código de terceiro.
- **Correção.**
  - **Fonte:** o `build` lê o blob da config no tarball âncora (`blobs/sha256/<config_digest>`, conferindo o SHA-256), nunca a saída da Trivy.
  - **Mutante (P4):** usuário tirado de `trivy-gate.json`.

### O4. O passo 14 só tem prova textual

- **Evidência.** P1 confere presença e ordem do passo, e P3 testa a função pura.
- **Risco.** Uma implementação que classifica e sai com 0 sobrevive às duas.
- **Correção.** O passo 14 chama um modo da CLI (por exemplo `release-image-gate.mjs precondition`), e L5/P3 o rodam com os casos inexistente, público e erro, esperando saída ≠ 0. Mutante: "precondition sai 0 com pacote não `ok`".

### O5. Prova de existência mais forte e fixture de pior caso

- **Hoje.** `ok` depende só do `tags/list` 200. O comportamento do GHCR com credencial válida e nome inexistente não foi observado.
- **Correção.**
  - **Lista não vazia.** Exigir `tags/list` com pelo menos uma tag, de preferência uma `placeholder-\d{8}`, e documentar que apagar todas as versões desliga o release.
  - **Fixture de pior caso.** O fixture de "pacote inexistente" leva manifesto `404 MANIFEST_UNKNOWN`, para que o mutante "ignorar `tags/list`" chegue a `publish` e morra.
  - **P3.** Dizer que o fixture real de `24cdb463` dá `publish` com uma sondagem sintética `ok/absent`.

### O6. O corpo do token autenticado nunca é gravado

- **Evidência.**
  - `classifyPackageProbe({ authToken, … })` recebe algo chamado `authToken`.
  - A §3.2 lista o que vai para arquivo e não cita o token, mas também não o proíbe.
  - O artefato do gate é público.
- **Correção.**
  - **Entrada do classificador:** só status e código de erro.
  - **Token de registro:** fica em variável de shell, com `::add-mask::`.
  - **Artefatos:** nenhum campo `token` em `release-gate.json` nem em `$RUNNER_TEMP/release-gate/`.
  - **Provas:** P1/P4 conferem. Mutante: gravar o corpo da resposta de token.

### O7. Precisão de texto

- **§9, passo 3.** Trocar "(o repositório fica conectado ao pacote; …)" por: a ligação acontece no primeiro push do release, pelo label `source`; pela documentação, ligar depois da primeira publicação não herda permissões de forma automática e nunca herda a visibilidade.
- **§1.7.** Citar "default visibility is private" (pacote pessoal) e "but not the visibility".
- **§8, "Sem `Write` do Actions".** Com papel `Read`, o `tags/list` volta 200, o gate dá `publish` e o push falha com 403, sem criar nada. O `refuse` só vem sem acesso nenhum.
- **§3.2, passo 3.** Deixar claro que o `Bearer` é o token de registro devolvido pelo pedido autenticado.

### O8. Regra de P1 sobre o volume contra o passo de limpeza

- **Conflito.** P1 diz "fora dos passos da Trivy, nenhum passo cita o volume", mas o passo 23 faz `docker volume rm` do volume.
- **Correção.** Isentar o `docker volume rm` da limpeza, ou trocar a regra por "nenhum passo monta, inspeciona ou copia o volume".

### O9. Script do usuário (fora da SPEC)

- **(a)** Se a sonda anônima vier com 200, sair com código 1 e avisar para **não** dar acesso ao Actions.
- **(b)** Usar `DOCKER_CONFIG=$(mktemp -d)`, para não gravar a credencial em `~/.docker/config.json` nem apagar um login `ghcr.io` que já exista.
- **(c)** Depois do uso, tirar `write:packages` do token do `gh` (`gh auth refresh -h github.com -r write:packages`), ou usar um token clássico de vida curta e só com esse escopo. Hoje o token local tem `repo`, `workflow`, `read:org` e `gist`, e é o mesmo que os agentes desta máquina usam.
- **(d)** O Lead guarda na pasta de evidências uma cópia do script (SHA-256 `b23bb991…`) e a saída do usuário: tag, data e código da sonda. Isso dá o primeiro dado empírico de que pacote privado **existente** volta `DENIED`. Hoje a §1.7 só está provada para nome inexistente.

### O10. Diagnóstico de falha

- **Gate de vulnerabilidade.** Com `--quiet --format json` para arquivo e sem upload em caso de falha, um release vermelho por CVE não mostra o motivo no log.
- **Correção no release.** No mesmo passo, se a Trivy sair com 1, o host lê `trivy-gate.json` por `readEvidenceFile` e escreve os IDs no `$GITHUB_STEP_SUMMARY` antes de falhar.
- **No gate.** Garantir que `release-gate.json` sobe antes da saída 1 do `refuse`, ou dizer que o `refuse` deixa só o resumo.

## Premissa nova?

**Não.**

- **Recursos do release.** A r4 usa só:
  - o `GITHUB_TOKEN`, com o login de leitura no `gate` e no `release-verify`;
  - o Sigstore keyless, que o repositório já usa;
  - actions `actions/*` já pinadas;
  - a imagem pinada da Trivy `0.75.0`, que o crítico r3 já julgou sem premissa;
  - o GHCR do dono (G6).
- **Ato do usuário.** A criação do pacote privado com credencial própria, só com o placeholder, e o `Write` ao Actions estão autorizados na decisão de 22/10. O script fica dentro desse escopo.
- **Pendências que não são premissa nova.**
  - A ciência explícita dos metadados públicos continua pendente, mas a §9 a trata como pré-condição do merge, não do BUILD.
  - O resíduo de O1 (forks e outros workflows do repositório com acesso ao pacote) é consequência documentada do `Write` da decisão de 22/10. Não pede credencial, serviço nem concessão nova, mas deve entrar na mesma ciência pré-merge.

## Fatos verificados nesta rodada

- SHA-256 da SPEC r4 = `e69dfe05…4c109`; SHA-256 do script = `b23bb991…a06`.
- GHCR anônimo:
  - token para este pacote: `403 DENIED`;
  - token para um nome aleatório inexistente: `403 DENIED`;
  - token para `aquasecurity/trivy`: emitido, no formato `v1:<repo>:<id>`;
  - manifesto `sha-000…` em pacote público: `404 MANIFEST_UNKNOWN`;
  - `tags/list?n=2`: 200 com `Link … rel="next"`.
- Repositório:
  - `visibility: public`, `forks_count: 0`, 1 contribuidor;
  - `fork-pr-contributor-approval: first_time_contributors`;
  - `default_workflow_permissions: read`;
  - `sha_pinning_required: false`.
- `GET users/ricardoakinaga-dev/packages/container/cvg-operational-harness` deu 404, mas o token local não tem `read:packages`. Não dá para saber se o pacote já existe.
- `docker/dockerfile:1.7` = `sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e`; `ghcr.io/aquasecurity/trivy:0.75.0` = `sha256:af6acf9a6b85dfe389a1941505c0ce9efef52a4719635e1a962f022a3d855daa`.
- `actions/attest@1e69f48a`: `create-storage-record` (padrão `true`, exige `push-to-registry`), `sbom-path` (até 16 MB) e `subject-name`/`subject-digest`, com runtime `node24`.
- GitHub Docs:
  - pacote pessoal nasce privado;
  - repositório ligado transmite permissões "but not the visibility";
  - a herança automática só ocorre se a ligação vier antes da primeira publicação;
  - "Manage Actions access" não é ligação;
  - forks podem acessar pacote privado dado a repositório público;
  - pacote público não volta a privado;
  - armazenamento e banda do Container registry estão "currently free".
