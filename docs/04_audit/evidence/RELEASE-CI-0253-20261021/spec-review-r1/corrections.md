# SPEC0253 r2 — tratamento da revisão r1

- Revisão: [review.md](review.md) / [review.json](review.json). Veredito `REVISE`, alvo r1 SHA-256 `c3cd75e470522fd2254ed9cbb0fd1bbba9695fad67c4f247191c6a33aa951ca0`.
- Nova versão: [SPEC0253 r2](../../../../02_spec/0253_release_image_ghcr.md). O SHA-256 está na resposta ao coordenador e no registro do Lead.
- Instrução do coordenador (22/10): aplicar M1 pela opção (a), sem premissa nova, aplicar M2 e M3, e aplicar os opcionais que corrigem fato ou fecham caminho inseguro.
- Recon adicional: [recon.md §8](../recon.md) e [snapshot](../api-snapshot-24cdb463.json) (novos campos `prHeadWorkflowRuns`, `branchMainAnonymous`, `securitySuiteCheckRunsFilterAll` e `trivyImage`).

## Obrigatórios

| ID | Tratamento | Onde na r2 |
| --- | --- | --- |
| M1 | **Aplicado pela opção (a).** Os jobs `build` e `publish` viraram um único job `release`, na sequência build → smoke → `docker save` → âncoras → Trivy → login → push → attest. Nenhum `upload-artifact` leva bytes da imagem; o artefato do release só tem registro, SBOM, relatórios e bundles. A Trivy deixou de ser a trivy-action e passou a ser o contêiner `ghcr.io/aquasecurity/trivy:0.70.0@sha256:be1190af…`: tarball montado só leitura; sem token, variável do runner, socket do Docker ou credencial; antes do `docker login`. O banco da Trivy é baixado a cada release, sem credencial, pela própria Trivy, para um diretório vazio do `$RUNNER_TEMP` do job. Não há `actions/cache` nem nada que sobreviva ao runner efêmero; SBOM e relatório informativo usam `--skip-db-update`. A §8 diz agora que só os bytes são privados e lista logs, SBOM, relatórios e attestations (API e Rekor) como públicos (risco aceito, para ciência do usuário). Sem premissa nova: a imagem da Trivy é a mesma ferramenta e versão do `image-scan`, pinada por digest, e não é action. | R4, R8, §3.1, §3.3 (passos 4–18 e banco da Trivy), §6 P1/L2/L3, §8, §9 |
| M2 | **Aplicado.** O passo `id: anchors` (`release-image-record.mjs anchors`) roda logo depois do `docker save` e antes de qualquer código de terceiro. É o único que escreve `tarball_sha256` e `config_digest`. A conferência pós-Trivy (passo 9), o registro (passo 10), a checagem do manifesto publicado (passo 14) e o registro final só leem `steps.anchors.outputs` e comparam. O tarball tem `chmod 0444` e é montado com `readonly`. P1 verifica a ordem `docker save` < `anchors` < primeira `aquasecurity/trivy` < `docker login` < `docker push` < `actions/attest` e que só `anchors` escreve as saídas. Mutantes: "âncoras emitidas pelo registro", "`anchors` depois da Trivy" e "login antes da Trivy". P4 testa que `build`, `publish` e `verify` não escrevem em `GITHUB_OUTPUT`. L3 prova a montagem só leitura. | R5, §3.3 passos 4–14, §3.5, §6 P1/P4/L3 |
| M3 | **Aplicado.** `already_published` exige proveniência verificada (signer, `--source-digest S`, `--source-ref refs/heads/main`, `--deny-self-hosted-runners`), attestation `https://cyclonedx.org/bom` do mesmo signer para o mesmo digest e sonda anônima `DENIED`. Faltando qualquer uma, `refuse`. P3 ganhou "só proveniência dá `refuse`" e "duas attestations com pacote público dá `refuse`". A §4 não promete mais que a reexecução cobre falha transitória depois do push. A §8 ("Publicação incompleta") descreve o `refuse`, a parada do `release` na sondagem de tag e a recusa do digest pelo deploy (que exige as duas attestations). | R8, §3.2 regra 8, §3.4, §3.7, §4, §6 P3, §8 |

## Opcionais

| ID | Tratamento |
| --- | --- |
| O1 | **Aplicado (corrige fato).** O gate lê `GET branches/main` e exige `protected`, `enforcement_level: everyone` e o conjunto `{contexto, app_id}` igual a `REQUIRED_CHECKS`; senão `refuse` (R1(e), regra 3). A frase "o `GITHUB_TOKEN` não lê a proteção" saiu da §8. |
| O2 | **Aplicado.** O gate lê `check-suites/<suíte dona>/check-runs?filter=all` e pega o de maior `id` (regra 5). A colisão de concorrência entre o `schedule` e o push do Security (`security.yml:15-17`) está em §1.4 e §8, com a recuperação. |
| O3 | **Aplicado.** `classifyTagProbe` só aceita `absent` com resposta explícita de inexistência (token `DENIED`, ou manifesto 404 com `MANIFEST_UNKNOWN`/`NAME_UNKNOWN`). 5xx, timeout, 401/403 no manifesto e código desconhecido são `error` e dão `refuse`. Vale no gate e de novo no `release` antes do push. Por que o `DENIED` no token é seguro: sem acesso, o push também é negado. As respostas reais do GHCR estão na lista do primeiro run. |
| O4 | **Aplicado.** Mutantes de P1: `always()`/`!cancelled()`/`failure()` em `release`/`release-verify`; `download-artifact` com `run-id`/`github-token`; `${{ github.event.workflow_run.* }}` em `run:`; `docker tag`/`push` além de `sha-S`; `packages: write` no `gate`. As regras também estão em §3.1. |
| O5 | **Aplicado.** O snapshot ganhou as execuções `pull_request` do head do PR (Verify `39561779898`, Security `39561779918`). O fixture real de P3 as usa. |
| O6 | **Aplicado.** A regra 6 filtra (mesclado, base `main`, `merge_commit_sha = S`, mesmo repositório) e depois conta; PR aberto que contém `S` é ignorado. P3 cobre os dois casos. |
| O7 | **Aplicado (registro).** Risco "Concorrência do release" na §8. O filtro `branches: [main]` já impede execuções de PR interno de outra branch (§1.5). |
| O8 | **Resolvido por M1(a).** CI e L2 usam o mesmo contêiner pinado. `build-record.json` registra o digest da imagem e `trivy --version`. |
| O9 | **Aplicado.** R5 diz "a única tag de imagem criada pelo release" e trata as tags `sha256-<hex>` de referrers. A lista do primeiro run as registra. |
| O10 | **Aplicado.** Risco aceito na §8, para ciência do usuário (§9). |
| O11 | **Aplicado (registro).** Cota e custo na §8, sem números não confirmados; push falha fechado com limite de gasto zerado; o primeiro run mede o tamanho. |
| O12 | **Aplicado.** §3.7 verifica também a attestation CycloneDX e exige `gh` com `attestation verify --bundle-from-oci --source-ref --predicate-type`; o `gh` local 2.45.0 não tem `attestation`. |
| O13 | **Aplicado.** §3.7 diz que o digest de CI passa a ser o de `release-image.json`, não o de `certification/runtime-image.json`. O README C9 do BUILD inclui isso. |
| O14 | **Não se aplica mais.** Sem artefato de imagem entre jobs, "Re-run failed jobs" refaz o `release` inteiro. O `release-verify` baixa por padrão de nome. Registrado na §8. |

## Premissa nova

Nenhuma. A causa apontada pela r1 (tarball em artefato público) foi removida pelo redesenho. Sem segredo, conta ou credencial novos e sem mudança na proteção da `main`. Nenhuma action fora dos pins já revisados; a `trivy-action` sai do caminho de release. A imagem de contêiner da Trivy é dependência nova de CI, pinada por digest, da mesma ferramenta e versão do `image-scan`, baixada sem credencial. A §9 registra isso de forma explícita.
