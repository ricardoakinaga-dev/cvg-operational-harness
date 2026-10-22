# Crítica independente do código do BUILD da SPEC0253, rodada 1

- **Alvo:** worktree detached `/mnt/dados/cvg-work/cvg-d9ef-prodpath-20261021`, commits `b991d4d07` (implementação) e `6e313fb44` (provas mais estritas), sobre a base `cd0b50c1b`.
- **Autoridade:**
  - [SPEC0253 r4](../../../../02_spec/0253_release_image_ghcr.md), SHA-256 `e69dfe057ed4ce141f74ead3ac570837140e87a00948fbdeeecb23e3910c4109`, conferido com `sha256sum`;
  - [aprovação](../spec-approval.json), com as notas de BUILD O2–O10;
  - decisões de [21/10](../user-decision-20261021.json) e [22/10](../user-decision-20261022.json);
  - [revisão r4 da SPEC](../spec-review-r4/review.md).
- **Data:** 22/10/2026.
- **Crítico:** contexto novo, sem participação na SPEC nem no BUILD.

## Como revisei

Só leitura no código e no git. Gravei apenas esta pasta, e os scripts de sondagem ficaram no scratchpad da sessão.

- **Leitura completa:**
  - `.github/workflows/release-image.yml`;
  - `scripts/release-image-{contract,gate,record}.mjs`;
  - os três testes novos e os fixtures;
  - o diff do `Dockerfile`;
  - `verify.yml` e `security.yml`, para comparar pins e nomes;
  - o snapshot de API e as provas locais do executor (L1–L5, mutantes e first red).
- **Testes, com Node 22 (`env -i`):**
  - `npx vitest run tests/release-image-*.test.js`: 223/223 verdes;
  - P5 (`ci-workflow-contract`, `runtime-image-contract`, `security-scan-config`, `ci-bar-contract`) e os outros que leem workflows ou o `Dockerfile` (`ci-bar-provenance`, `construction-readiness`): todos verdes;
  - `prettier --check` nos arquivos do BUILD: limpo.
- **Fidelidade dos fixtures:** comparei com `api-snapshot-24cdb463.json` por script (`python3 -I`).
  - `push-runs`, `pr-runs` e `pulls` são idênticos ao snapshot.
  - As suítes contêm exatamente os check-runs das suítes donas (Verify e Security).
  - Ficam de fora só as suítes do produto e a do `CodeQL` do app 57789, que o `collect` também não busca.
  - `branch-main.json` é a proteção anônima do snapshot.
- **Fonte das actions, por `gh api` GET:**
  - `src/main.ts` e `action.yml` de `actions/attest@1e69f48a` são idênticos às cópias usadas pelo executor;
  - `bundle-path` vem de `mkdtemp`, um arquivo por attest, e `create-storage-record` existe;
  - `actions/setup-node@49933ea5` é a tag `v4.4.0`, sem cache automático.
- **Sondagem com `curl` falso, no scratchpad:** exercitei `probePackage`/`classifyPackageProbe` em casos de borda, como corpo ilegível, página 2 ilegível, `100 Continue` e token com quebra de linha.

## Veredito: `APPROVE`

Não há obrigatórios. O workflow e os scripts seguem a SPEC r4 passo a passo, inclusive a ordem do `release`. Nenhuma das propriedades de segurança foi violada:

- token fora do argv;
- release que nunca cria o pacote;
- Trivy isolada;
- âncoras e identidade;
- `evidence/` lida só com `lstat`/`O_NOFOLLOW`;
- `gate.*` vindo do job `gate`.

Os testes matam os mutantes da §6. Os opcionais abaixo são endurecimento e lacunas de prova menores. Nenhum muda uma decisão de `publish`/`refuse` em caso realista.

## Desvios declarados pelo executor

| Desvio                                                                                                      | Julgamento                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) `gh api` e `curl` dentro de `release-image-gate.mjs` (`collect`/`probe`/`precondition`/`anonymous`)     | **Aceito.** A SPEC fixa o quê (GET, token só no stdin com `curl --config -`, `Accept` com índice, paginação), não onde o shell fica. Os tokens passam de `env:` para o stdin do `curl` (`gate.mjs:582-585`), e o argv só leva URL, `--config -` e `Accept`. A prova ficou comportamental (curl falso que registra argv e stdin), mais forte que a textual. Efeito colateral: P1 deixou de enxergar `curl` no YAML (ver O5). |
| (b) subcomandos `trivy-summary` e `manifest`                                                                | **Aceito.** Nenhum escreve em `$GITHUB_OUTPUT`. `manifest` implementa o passo 17. `trivy-summary` atende a O10 e só escreve no resumo.                                                                                                                                                                                                                                                                                         |
| (c) `head -c` também em `trivy version`                                                                     | **Aceito.** É mais estrito, e `VERSION_MAX` é igual ao limite de `EVIDENCE_FILES` (64 KiB).                                                                                                                                                                                                                                                                                                                                      |
| (d) `tags/list` 200 vazio = `missing_or_inaccessible`                                                       | **Aceito.** É a nota O5 aprovada e falha fechado (`refuse`).                                                                                                                                                                                                                                                                                                                                                                     |
| (e) em `refuse`, `release-gate.json` não sobe; o motivo fica no resumo e no stderr                          | **Aceito.** É uma das duas opções de O10, e não precisa de `always()` fora da limpeza. Registrar no relatório do BUILD.                                                                                                                                                                                                                                                                                                          |
| (f) `release-verification.json` como artefato `cvg-release-verification-<run_id>-<attempt>`                 | **Aceito.** É o que a §3.4, passo 5, pede. O nome com `attempt` evita colisão em reexecução.                                                                                                                                                                                                                                                                                                                                     |
| (g) `Metadata.ImageID` = âncora em `trivy-gate.json` e `trivy-full.json`                                    | **Aceito.** É mais estrito, e o L2 real mostra o mesmo `ImageID` nos três arquivos.                                                                                                                                                                                                                                                                                                                                              |
| (h) `RELEASE_DIR`/`TARBALL`/`EVIDENCE`/`IMAGE` em `$GITHUB_ENV`; saídas `image`/`artifact_name`             | **Aceito.** Os valores vêm do runner (`$RUNNER_TEMP`, `GITHUB_REPOSITORY`), sem dado de terceiro nem quebra de linha, e nenhum nome de variável afeta ferramenta (`NODE_OPTIONS`, `LD_*` etc.).                                                                                                                                                                                                                                  |
| (i) `decide` recusa `workflow_run.conclusion != success`                                                    | **Aceito.** É redundância a favor da segurança e tem teste.                                                                                                                                                                                                                                                                                                                                                                      |

## O que conferi (itens 1–12 do pedido)

1. **Tokens.**
   - Os tokens chegam aos passos só por `env:`.
   - Em `docker login`, a senha vai por `printf` (builtin) para `--password-stdin` no `gate`, no `release` e no `release-verify`.
   - O `curl` recebe `user = "…"` e `header = "Authorization: Bearer …"` só pelo stdin. Os valores são validados como ASCII imprimível, sem `"` nem `\` (`gate.mjs:560-568`).
   - O token de registro recebe `::add-mask::` (`gate.mjs:674`) e nunca vai para `probe.json`, `release-gate.json` nem `anonymous-pull.json`. O teste confere argv, stdin e arquivos.
   - `DOCKER_CONFIG` é temporário (`0700`) no `gate` e no `release-verify`. O `release` usa a config padrão, como a SPEC exige para a `actions/attest`.
   - Há logout no passo 20 e na limpeza. `if: always()` aparece só nos três passos nomeados, e o teste conta exatamente três `always()`.
   - O `gh` recebe `GH_TOKEN` por env e só `api --method GET …` no argv.
2. **Injeção.**
   - Não há `${{ }}` em nenhum `run:` (o teste confere para todos os passos). O payload do `workflow_run` entra só por `env:` (`RUN_*`) e é gravado com `JSON.stringify` em `context.json`.
   - `$GITHUB_OUTPUT` só recebe valores validados:
     - enums;
     - SHA de 40 hex e digest por regex;
     - hex das âncoras;
     - `gate_record` por `JSON.stringify`, que nunca emite quebra de linha crua. Os nomes de check vêm da constante depois do casamento exato.
   - Strings de rede, como o código de erro do GHCR e a `conclusion` da API, aparecem cruas só no `$GITHUB_STEP_SUMMARY` (Markdown, não é canal de comando) e no stderr de passos que já falham (ver O2).
   - Os valores da config do `curl` não podem ter aspas, barras invertidas nem controles.
3. **Gatilho e origem.**
   - `on:` tem só `workflow_run` (`Verify`, `Security`, `completed`, `main`), e o `if:` do `gate` tem as cinco condições.
   - Regras 1–9 implementadas na ordem (`gate.mjs:201-418`):
     - `superseded` por `githubSha ≠ head_sha`;
     - proteção (`protected`, `enabled`, `everyone`, conjunto `{context, app_id}` = `REQUIRED_CHECKS`);
     - exatamente uma execução de push por dono (path, branch, repositório);
     - `wait` só com o dono em andamento;
     - check de maior `id` com nome exato, `app.id 15368`, suíte da execução dona e `head_sha`;
     - PR filtrado antes da contagem;
     - execução `pull_request` mais nova do head;
     - checks nas suítes do PR.
   - Os nomes `Verify`/`Security` conferem com `verify.yml:1` e `security.yml:1`.
4. **Pacote (R8 e decisão de 22/10).**
   - `classifyPackageProbe` segue a regra 8, inclusive O5.
   - `package-precondition` fica imediatamente antes do `docker login`, sem `if`/`continue-on-error`, e sai com 1 em todo estado diferente de `ok/absent`. O4 tem prova executável com `curl` falso: inexistente, `NAME_UNKNOWN`, público, 500, timeout e tag presente.
   - O `Accept` tem os quatro tipos literais, e `placeholder-*`/`sha256-*` são ignorados.
   - O `Link` de paginação só é seguido dentro de `/v2/<nome>/tags/list?` em `ghcr.io`, então o bearer não sai do host.
5. **Trivy.**
   - `TRIVY_IMAGE` aparece só no `env:` dos quatro passos e é igual à constante pinada por índice.
   - São cinco chamadas. Só o download do banco tem rede, e ele não monta `/in`. As outras rodam com `--network none`, `--offline-scan` e `--skip-db-update`.
   - Todas levam `--read-only`, `--cap-drop=ALL`, `no-new-privileges`, `--tmpfs /tmp`, `--pids-limit` e `--memory`.
   - Não há `-v`/`-e`/`--env*`/socket/`--privileged`/`--output`. O único bind é o tarball `readonly`, e o volume nomeado não é lido pelo host (só `docker volume rm` na limpeza, conforme O8).
   - A saída passa por `head -c "$((MAX + 1))"` com `pipefail`, e os passos da Trivy não têm `id`.
   - Não aparecem `docker.io/aquasec` nem `mirror.gcr.io`, e `--db-repository ghcr.io/aquasecurity/trivy-db:2` está presente.
   - **Comandos de workflow:** a Trivy comprometida pode escrever no stderr do passo. O runner trata comandos por passo, e os passos da Trivy não têm `id`, então ela não consegue produzir saída consumível. Sobra negação de serviço (por exemplo, `::add-mask::` em valores de saída), um resíduo já aceito na §8.
6. **Âncoras e identidade.**
   - Só o passo `anchors` escreve as âncoras. `config_digest` sai do `manifest.json` do tarball (`tar -xOf`), com entrada única, `Config` em `blobs/sha256/<hex>` e hash do blob = `<hex>`.
   - `build`/`publish` refazem o hash do tarball contra as âncoras recebidas por `env:`.
   - O passo 17 (`manifest`) exige SHA-256 dos bytes = digest, `mediaType` de image manifest, ausência de `manifests` e `config.digest` = âncora, e vem antes do attest.
   - Usuário, `Cmd`, labels e `diff_ids` vêm do blob da config do tarball (O3). O teste mostra que a saída da Trivy não influi.
   - Pelo L4 local, `--raw` imprime os bytes exatos (SHA-256 = digest).
7. **`readRegularFile`/`readEvidenceFile`.**
   - A leitura faz `lstat` (arquivo regular, `nlink = 1`, tamanho), `open(O_RDONLY|O_NOFOLLOW|O_NONBLOCK)`, `fstat` com mesmo `ino`/`dev` e `nlink`, e lê com limite durante a leitura.
   - `assertEvidenceInventory` exige a lista exata de nomes.
   - O upload é a lista explícita de `EVIDENCE_FILES`, sem diretório, glob, `image.tar` ou `release/in`.
   - `publish` confere a lista inteira de novo logo antes do upload.
8. **Gate record (O2).**
   - `gate_record` é saída do job `gate`, só em `publish`, montada a partir das respostas da API.
   - O `release` a recebe por `env:` (`GATE_RECORD`), e `publish` a copia sem recalcular.
   - `gateRecordFailures` valida decisão, SHA, proteção e checks = `REQUIRED_CHECKS`, `success`, uma execução por dono e evento, e `checkSuiteId` da check igual ao da execução. Não é tautológico.
   - A igualdade canônica `gate_not_from_gate_job` mata o mutante "checks montados da constante".
9. **Attest e verify.**
   - Os dois `actions/attest` usam `subject-name` (`ghcr.io/<dono>/cvg-operational-harness`), `subject-digest`, `push-to-registry: true` e `create-storage-record: false`. O de SBOM usa `sbom-path` em `evidence/`.
   - O SBOM real do L2 tem `serialNumber`, que a action exige para CycloneDX.
   - O `release-verify`:
     - baixa exatamente o artefato nomeado;
     - faz login de leitura temporário e pull por digest;
     - roda as quatro verificações com `--signer-workflow`, `--source-digest "$S"`, `--source-ref refs/heads/main` e `--deny-self-hosted-runners`;
     - faz a sonda anônima;
     - grava o registro com o SBOM do predicado igual, em JSON canônico, ao artefato.
10. **Escopo.**
    - `git diff --name-only cd0b50c1b..6e313fb44` traz só o conjunto de escrita, e o `Dockerfile` muda só na linha 1.
    - `verify.yml`, `security.yml`, `ci-bar*`, `runtime-image-*`, lockfile, compose e `.env.example` ficaram intocados.
    - O pin do frontend foi reconferido (`frontend-pin.json`) e aparece resolvido pelo digest no log do BuildKit do L2.
11. **Shell e YAML.**
    - O PyYAML reproduz a estrutura (23 passos no `release`, 10 no `gate`, 9 no `release-verify`).
    - Nos passos sem `shell:` explícito vale `bash -e {0}`. Todo passo com pipe relevante tem `set -euo pipefail`. Os demais só têm `||` ou pipe cujo status final é o comando certo (`printf | docker login`, `$(sha256sum | cut)`).
    - `mapfile` com process substitution é seguido de `test "${#digests[@]}" -eq 1`, que fecha o caso sem match.
    - `gh api --paginate --slurp` funciona nos dois formatos (objeto paginado e lista).
    - Reexecução: os artefatos levam `run_attempt`, e o volume também.
12. **Qualidade das provas.**
    - First red documentado.
    - São 114 mutantes, todos mortos. Os dois redefinidos (timeout como `absent` e hardlink) removem camadas redundantes de verdade (`requestFailed` e `nlink` do `fstat`), e a redefinição é legítima.
    - Os fixtures são fiéis ao snapshot.
    - Não achei prova vácua de invariante da §6. As lacunas menores estão em O6.

## OBRIGATÓRIOS

Nenhum.

## OPCIONAIS

### O1. Resposta `tags/list` 200 com corpo ilegível vira lista vazia ou página omitida, e não `error`

- **Evidência:**
  - `scripts/release-image-gate.mjs:735` (`const pageTags = body?.tags ?? []`);
  - SPEC §3.2, regra 8: "`error`: 5xx, timeout ou corpo ilegível em qualquer um dos três pedidos".
- **Reprodução com `curl` falso (scratchpad):**
  - página única com corpo HTML: `missing_or_inaccessible` (`package_tags_empty`), e o resumo aponta o pré-requisito da §9 de forma enganosa;
  - página 2 com `garbage` ou `{"tags":null}`: `ok/absent`, com a lista parcial.
- **Risco: baixo.**
  - Página única falha fechado, só com o motivo errado.
  - Com várias páginas, enfraquece só a conferência cruzada "`sha-S` listada com manifesto 404 → `error`". O `absent` continua exigindo manifesto 404 `MANIFEST_UNKNOWN`, então não há push sobre tag existente nem criação de pacote.
  - Nenhum teste cobre o caso, e um mutante sobreviveria.
- **Correção:**
  - corpo que não é JSON, ou `tags` que não é lista nem `null`, marca `unreadable: true` (→ `error`) em qualquer página;
  - acrescentar casos P3/L5 com `curl` falso (HTML na página 1 e na página 2), esperando `package=error`.

### O2. Higiene de strings de rede no log: `::add-mask::` antes da validação e motivos crus no stderr

- **Evidência:**
  - `scripts/release-image-gate.mjs:673-681`: `mask(issued)` roda antes de `curlConfigValue(issued)`;
  - `gate.mjs:971-972` e `gate.mjs:1047` mandam `reasons` crus para o stderr, e os motivos incluem `errors[0].code` do GHCR e `conclusion`/`status` da API (`gate.mjs:84`, `99`, `153`, `288`, `355`).
- **Reprodução:** com um token `abc\ndef`, o runner mascararia só `abc` e imprimiria `def` em claro.
- **Risco: muito baixo.**
  - As fontes são GHCR e API do GitHub sob TLS, e o token GHCR é base64 sem CR/LF.
  - Os passos que imprimem motivos crus já falham, e as saídas deles vêm de arquivo.
- **Correção:**
  - validar o token, como ASCII imprimível sem CR/LF, antes de emitir `::add-mask::`; se for inválido, não imprimir nada;
  - emitir os motivos no stderr com `JSON.stringify(reasons)`, ou sanear `\r\n` dos códigos vindos da rede.

### O3. `curl` sem `-q` como primeiro argumento

- **Evidência:** `scripts/release-image-gate.mjs:571-582`. Sem `-q`/`--disable` na primeira posição, o `curl` lê `~/.curlrc` (e `$CURL_HOME`/`$XDG_CONFIG_HOME`).
- **Risco: baixo.**
  - O runner hospedado não tem `.curlrc`, e só passos anteriores do próprio job poderiam criá-lo.
  - Um `.curlrc` com `user=`/`proxy=` mudaria a semântica da sonda "anônima", que hoje falha fechado (`public`/`error`).
- **Correção:** argv começando por `-q`, mais `--proto =https`. Um teste confere `argv[0] === '-q'`.

### O4. O tamanho de `build-record.json` e `release-image.json` só é conferido depois do push

- **Evidência:**
  - `scripts/release-image-record.mjs:280-283`: `build` grava sem reler pelo limite;
  - `scripts/release-image-contract.mjs:102-103` tem limites de 1 MiB;
  - `release-image.json` contém o `build-record` inteiro, inclusive `fullReport.findings`;
  - a primeira leitura com limite acontece em `publish` (`record.mjs:346-353`), depois do push e dos dois attest.
- **Risco: baixo.** Com muitos HIGH/CRITICAL sem correção, o registro passa de 1 MiB e `publish` falha depois do push: publicação incompleta, que exige a triagem da §8. Não há impacto de integridade.
- **Correção:** em `build`, conferir o tamanho antes de gravar (ou `readEvidenceFile` logo depois) e garantir margem para `release-image.json`. Uma alternativa é limitar ou resumir `findings`.

### O5. P1 deixou de enxergar `curl`/`wget` no workflow

- **Evidência:**
  - `tests/release-image-workflow-contract.test.js` não tem asserção sobre `curl`/`wget`. As proibições de host estão em `:271-274`;
  - com o desvio (a), o mutante "token em `curl -u`/`-H`" só existe no script e é morto no teste do gate.
- **Risco: baixo.** Um `curl -H "Authorization: Bearer $REGISTRY_TOKEN"` acrescentado depois no YAML passaria em P1.
- **Correção:** P1 exige ausência de `curl`/`wget` em todo `run:` do workflow, já que a sondagem é do script.

### O6. Lacunas de prova menores, sem invariante de segurança descoberto

- **`wait` e `superseded` pela CLI.** Nenhum teste L5 roda `decide` nesses casos esperando saída 0 e `publish=false` (`gate.mjs:1023-1050`). Hoje só P3 cobre a decisão. Um mutante "`wait` sai com 1" deixaria o run vermelho sem motivo.
- **Paginação do `collect`.** O teste não confere `--paginate --slurp` nos endpoints de lista (`tests/release-image-gate.test.js:1204-1207`, `gate.mjs:833`). Um mutante sem paginação sobrevive.
- **Inode no `fstat`.** A conferência `ino`/`dev` de `readRegularFile` (`contract.mjs:221-229`) não tem teste. Dá para provar com stub de `fs.lstatSync` devolvendo outro `ino`.

### O7. Registro do BUILD

- **Evidência:**
  - os arquivos `first-red.json`, `frontend-pin.json`, `l2-build-record.json`, `local-proofs.json`, `mutants.json` e `readme-c9-proposal.md` estão não rastreados na pasta de evidências;
  - não achei o relatório do BUILD com os desvios (a)–(i).
- **Correção:**
  - o relatório do BUILD registra os desvios (a)–(i) e a correção de texto O7 da r4 (parêntese da §9, passo 3: "Manage Actions access" não liga o pacote);
  - registra que os mutantes de sondagem de P1 passaram para o teste do gate com `curl` falso;
  - registra os resíduos abaixo;
  - o Lead versiona as evidências.

## Resíduos, para a ciência pré-merge

- **Janela entre o passo 14 e o push.** Se o pacote for apagado nesses segundos, o push o recria herdando a visibilidade pública. É improvável e não tem correção no CI. O `release-verify` detecta pela sonda anônima e fica vermelho.
- **Reexecução parcial** ("Re-run failed jobs" do `release`). Reaproveita a decisão do `gate`, com proteção e checks da primeira tentativa, e reavalia só pacote e tag no passo 14. É coerente com a §8.
- **Trivy comprometida.** Pode emitir comandos de workflow no stderr do próprio passo, como `::add-mask::` sobre valores de saída (negação de serviço). Não consegue integridade nem token, porque os passos não têm `id`, o runner trata comandos por passo e não há env, socket nem montagem gravável.

## Só o primeiro run real prova

- Formato do `docker save` no store clássico do Docker 28 (`Config: blobs/sha256/…`) e a igualdade `config.digest` = âncora no GHCR.
- Respostas reais do GHCR: token autenticado, `tags/list`, `Link`, `MANIFEST_UNKNOWN` e a sonda anônima `DENIED` para pacote privado **existente**.
- Saída JSON real do `gh attestation verify`: `verificationResult.statement.predicate` com o SBOM inteiro e a igualdade canônica com o artefato.
- Push e digest do `docker push`, `imagetools --raw`, `bundle-path` das duas attestations e referrers `sha256-<hex>`.
- O par `wait` → `publish` nos dois disparos, e `already_published` num segundo disparo do mesmo SHA.
