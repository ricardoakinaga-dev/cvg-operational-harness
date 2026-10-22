# RELEASE-CI-0253 — relatório do BUILD local da SPEC0253

- **SPEC:** [0253 r4](../../../02_spec/0253_release_image_ghcr.md), SHA-256 `e69dfe057ed4ce141f74ead3ac570837140e87a00948fbdeeecb23e3910c4109`, aprovada sem obrigatórios ([aprovação](spec-approval.json)). A SPEC não foi alterada.
- **Base:** `cd0b50c1b`, worktree detached `/mnt/dados/cvg-work/cvg-d9ef-prodpath-20261021`, 22/10/2026, Node v22.23.2.
- **Commits locais:**
  - `b991d4d07`: implementação;
  - `6e313fb44`: provas mais estritas;
  - `059b27c5a`: opcionais da crítica r1, último código de produto;
  - `2f763b94f`: provas da crítica r2, só testes;
  - o commit desta evidência.
- Sem push, sem PR e sem login em registry. Nada foi publicado.

## O que mudou

| Arquivo | Mudança |
| --- | --- |
| `.github/workflows/release-image.yml` | Novo. Jobs `gate`, `release` e `release-verify`, no desenho da §3. |
| `scripts/release-image-contract.mjs` | Novo. Constantes da §3.5, `readEvidenceFile`, validadores de build, release e verificação. |
| `scripts/release-image-gate.mjs` | Novo. `evaluateReleaseGate` e `classifyPackageProbe` puras; CLI `collect`, `probe`, `precondition`, `anonymous` e `decide`. |
| `scripts/release-image-record.mjs` | Novo. CLI `anchors`, `build`, `trivy-summary`, `manifest`, `publish` e `verify`. |
| `tests/release-image-{workflow-contract,gate,record}.test.js` | Novos: P1/P2, P3/L5 e P4 (238 testes). |
| `tests/fixtures/release-image/**` | Respostas reais de `24cdb463` tiradas do [snapshot](api-snapshot-24cdb463.json), mais uma sondagem sintética e o overlay `already_published`. |
| `Dockerfile` | Só a linha 1: `# syntax=docker/dockerfile:1.7@sha256:a57df69d…`, conferido de novo em 22/10 ([frontend-pin.json](frontend-pin.json)). |

## Provas

O first red está em [first-red.json](first-red.json).

| Prova | First red | Verde |
| --- | --- | --- |
| P1 | módulo e depois arquivo ausente | 35 testes (com P2) |
| P2 | `# syntax` sem digest | incluído em P1 |
| P3/L5 | módulo ausente | 146 testes |
| P4 | módulo ausente | 57 testes |
| P5 | regressão | `ci-workflow-contract`, `runtime-image-contract`, `security-scan-config` e `ci-bar-contract` verdes sem mudança |

As provas locais estão em [local-proofs.json](local-proofs.json) e [l2-build-record.json](l2-build-record.json):

- **L1.** O PyYAML de sistema e o parser textual dos testes leem a mesma estrutura: 3 jobs, com 10, 23 e 9 passos. A única diferença é o comentário `# vN`.
- **L2.** Os passos 2–13 rodaram com o texto exato dos `run:`, em `b991d4d07`.
  - `ImageID` é igual ao `config_digest` `sha256:3135a6d9…`.
  - O SBOM tem 11 `pkg:deb` e 119 `pkg:npm`. Os 81 pacotes de produção do lockfile da imagem estão todos no SBOM.
  - O binário `node` não aparece no SBOM; a origem fica em `baseImageRefs`.
  - O único HIGH é o `CVE-2026-84782` (libssl3), sem correção.
  - Nenhum `docker.io/aquasec`.
- **L3.** Rodado como root no contêiner da Trivy:
  - (a) o tarball fica só leitura, com o hash igual;
  - (b) com `--network none`, só existe `lo`;
  - (c) os symlinks plantados não chegam a `evidence/`, e os bytes ficam iguais;
  - (d) um symlink em `evidence/` faz o registro falhar antes do login.
- **L4.** Num `registry:2` pinado, só em 127.0.0.1 e removido no fim:
  - o digest do push é igual ao SHA-256 do manifesto bruto (image manifest único) e ao `config.digest` da âncora, no store containerd;
  - repositório inexistente volta `tags/list` 404 `NAME_UNKNOWN`, mas o manifesto volta 404 `MANIFEST_UNKNOWN`. É o pior caso da O5, e o classificador dá `missing_or_inaccessible`.
- **L5.** A CLI `decide` sobre os fixtures:
  - `publish` no real;
  - `already_published` com `publish=false` no overlay;
  - `refuse` com saída 1, e sem `publish=true`, para verificação com `exit=1`, pacote público e pacote inexistente (com a mensagem da §9).
- **Depois da r1:**
  - o modo `anonymous`, com o `curl` real e sem credencial, recebeu `403 DENIED` do GHCR;
  - o `build` do código final aceita a evidência real do L2.

## Mutantes

São 129 mutantes, todos mortos, e todos com os bytes restaurados por SHA-256 ([mutants.json](mutants.json)):

- 108 de P1–P4, com todos os nomeados na §6 ("push cria o pacote", "âncoras emitidas pelo registro", "gate sem login", symlink plantado, permissões amplas, action sem pin, gatilho em PR) e outros;
- 6 das notas de BUILD (O2–O6);
- 11 do endurecimento da r1;
- 4 das provas da r2.

Dois mutantes da rodada 1 tiravam só uma de duas camadas redundantes e sobreviveram como equivalentes. Foram redefinidos para tirar as duas camadas e morreram.

## Gates (Node 22, `env -i`)

- `prettier --check` nos arquivos tocados: limpo. O `Dockerfile` não tem parser no prettier.
- `npm run -s lint`: 0. `npm run -s typecheck`: 0.
- `npm run -s docs:check-links`: `DOC_LINKS_OK` e `EVIDENCE_HYGIENE_OK`.
- Suítes de contrato de CI (11 arquivos): 281 testes verdes.
- Suíte unitária completa, comando do CI (`CVG_TEST_SCOPE=core npm run test:core`) em `059b27c5a`, o último código de produto: 466 arquivos verdes e 25 pulados; 6389 testes verdes, 235 pulados e 0 falhas; saída 0, em 31 min. Os pulados são as suítes de PostgreSQL sem `TEST_DATABASE_URL`, que o CI cobre no gate próprio. O `2f763b94f` só muda dois arquivos de teste, que passaram na rodada focal (238 testes).
- `actionlint`: não existe no repositório, então não rodou.

## Crítica de código independente

- **[r1](code-review-r1/review.md):** `APPROVE` sem obrigatórios. Aceitou os desvios (a)–(i). Os opcionais O1–O6 foram implementados em `059b27c5a`, com provas e mutantes. O O7 é este registro.
- **[r2](code-review-r2/review.md):** `APPROVE` sem obrigatórios, sobre o delta `6e313fb44..059b27c5a`.
  - R2-O1 e R2-O2 eram lacunas de prova, resolvidas só nos testes em `2f763b94f` e mortas por 4 mutantes. Esse delta é só de testes e ficou sem uma terceira rodada, pelo limite de duas.
  - R2-O3 fica para o Lead, porque mudaria código de produto depois da última rodada. Uma resposta 200 de `tags/list` sem a chave `tags` conta como página vazia.
    - Numa página única, isso dá `refuse`, porque `tags/list` vazio é `missing_or_inaccessible`.
    - Numa página do meio, enfraquece só a conferência cruzada "`sha-S` listada". O `absent` continua exigindo 404 `MANIFEST_UNKNOWN`.
    - A correção é aceitar só lista ou `null`.

## Notas de BUILD da aprovação

- **O2.** `gate.*` de `release-image.json` vem da saída `gate_record` do job `gate`, por `env:`. O validador exige que seja igual ao recebido (`gate_not_from_gate_job`).
- **O3.** Usuário, CMD e labels saem do blob da config do tarball âncora, nunca da saída da Trivy.
- **O4.** O passo 14 é `release-image-gate.mjs precondition`, que sai com código diferente de 0 nos casos inexistente, público, erro e tag presente.
- **O5.** `tags/list` precisa ser não vazio. O fixture de pior caso está coberto.
- **O6.** O token nunca é gravado.
- **O7.** Correção de texto da §9, passo 3: adicionar o repositório em "Manage Actions access" **não** liga o pacote ao repositório. A ligação acontece no primeiro push do release, pelo label `source`. Ligar depois da primeira publicação não herda permissões de forma automática e nunca herda a visibilidade.
- **O8.** Fora dos passos da Trivy, o volume só aparece no `docker volume rm` da limpeza.
- **O9.** É o script do usuário, fora do BUILD.
- **O10.** Em falha do gate da Trivy, os IDs vão para o resumo (`trivy-summary`). Em `refuse`, o `release-gate.json` não sobe como artefato, e o motivo fica no resumo e no stderr.

## Desvios em relação ao texto da SPEC

A crítica r1 aceitou todos.

- **(a) Leituras e sondagem no script.** As leituras `gh api` e a sondagem por `curl` ficaram em `release-image-gate.mjs`, com o token só no stdin (`--config -`), e não em shell inline. Por isso os mutantes de sondagem do P1 morrem no teste do gate, com `curl` falso, e o P1 proíbe `curl`/`wget` no YAML.
- **(b) Subcomandos extras.** `trivy-summary` atende a O10, e `manifest` implementa o passo 17.
- **(c)** `head -c` também em `trivy version`.
- **(d)** `tags/list` vazio dá `missing_or_inaccessible`.
- **(e)** Em `refuse`, o motivo fica só no resumo e no stderr.
- **(f)** O artefato `cvg-release-verification-<run>-<attempt>`.
- **(g)** `ImageID` igual à âncora também nos dois relatórios da Trivy.
- **(h)** O passo `paths` grava os caminhos em `$GITHUB_ENV`.
- **(i)** `decide` recusa `conclusion != success`.

## Só o primeiro run real na `main` prova

- O disparo por `workflow_run`: `wait` quando o Security termina e `publish` quando o Verify termina. Um segundo disparo do mesmo SHA dá `already_published`.
- `gh api --paginate --slurp` e a proteção e as suítes reais com `filter=all`.
- O GHCR real com o token do job, para o pacote existente e privado criado pelo usuário:
  - token autenticado;
  - `tags/list` com a tag `placeholder-*` e `Link`;
  - `MANIFEST_UNKNOWN` para `sha-S`;
  - sonda anônima `DENIED` antes e depois do push.
- `docker save` no store clássico do Docker 28 e o formato da linha `digest:` do `docker push`.
- O `GITHUB_TOKEN` com `Write` publicando no pacote existente.
- O banco vindo de `ghcr.io/aquasecurity/trivy-db:2`.
- As attestations na API e no GHCR, a saída JSON real do `gh attestation verify` e a igualdade canônica do SBOM.
- O pull por digest, o `release-image.json` com digest real, a duração e o tamanho.

## Para o Lead

- Proposta de texto para a C9 do README: [readme-c9-proposal.md](readme-c9-proposal.md). O README não foi alterado, porque o BUILD não tem claim e outro agente edita o arquivo.
- Ledgers, cartões e coordenação não foram tocados.
- Pendências antes do merge do PR, todas atos do usuário:
  - ciência dos metadados públicos e do resíduo O1 da r4, mais os resíduos listados na r1 (janela entre o passo 14 e o push, reexecução parcial, Trivy comprometida);
  - criação do pacote privado.
