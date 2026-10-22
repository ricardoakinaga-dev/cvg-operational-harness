# SPEC0253 r3 — tratamento da revisão r2

- Revisão: [review.md](review.md) / [review.json](review.json). Veredito `REVISE`, alvo r2 SHA-256 `bdb058ae4a891a4f3b430e710d647c39b95fadab4ea7fe9cfc8029b919ce5142`.
- Nova versão: [SPEC0253 r3](../../../../02_spec/0253_release_image_ghcr.md). O SHA-256 está na resposta ao coordenador e no registro do Lead.
- Instrução do coordenador (22/10):
  - R2-M1: stdout para `evidence/`, o host nunca lê o cache, upload e attest só de `evidence/`, banco num passo à parte, varreduras sem rede, flags de versão e telemetria, `--db-repository` fixo;
  - R2-M2: login de leitura no `gate`, verificação pela API e por OCI, P1 com mutante e prova local com fixture;
  - opcionais baratos;
  - registro da ciência do usuário na §9.
- Recon adicional, só leitura: [recon.md §9](../recon.md) e [snapshot](../api-snapshot-24cdb463.json). Os campos `branchMainAnonymous` (agora com `protection` inteiro, `enabled` e `enforcement_level`) e `trivyRelease` são novos.
- Arquivos não tocados nesta rodada: `deploy/harness/README.md` e `deploy/harness/secrets/README.md`, que estão em edição por outro agente.

## Obrigatórios

| ID | Tratamento | Onde na r3 |
| --- | --- | --- |
| R2-M1 | **Aplicado pela opção (a), stdout.** A Trivy não tem nenhuma montagem gravável do host. O tarball entra como arquivo só leitura, e o banco fica num volume Docker nomeado do job, que o host nunca lê: nenhum `docker cp`, nenhum outro contêiner monta o volume, nenhuma leitura de `Mountpoint`. Versão, gate, relatório e SBOM saem pelo stdout do contêiner, redirecionado pelo shell do host para `evidence/` (criado com `0700`, nunca montado), sem `--output`. O host lê `evidence/` só por `readEvidenceFile`: lista exata de nomes, `lstat` de arquivo regular, `nlink = 1`, tamanho máximo, `O_NOFOLLOW` e `fstat` do mesmo inode. `sbom-path` aponta para `evidence/`. O upload usa a lista explícita de `EVIDENCE_FILES`, sem diretório nem glob. `docker logout` vem logo depois do último attest e antes do upload. O banco é baixado num contêiner com rede e sem o tarball (`--download-db-only`, `--db-repository ghcr.io/aquasecurity/trivy-db:2`). Versão, gate, relatório e SBOM rodam com `--network none --skip-db-update --skip-java-db-update --offline-scan`. Toda chamada leva `--skip-version-check --disable-telemetry`. R4, R8, R10 e §8 foram reescritos, e o resíduo agora é "falsear varredura e SBOM, gastar CPU e disco, e escrever no stdout ou no log bytes deriváveis do repositório; sem caminho para token". Provas: P1 (montagens, rede, flags, ordem por índice de passo, isolamento do volume, upload só de `evidence/`), P4 (`readEvidenceFile` recusa symlink, FIFO, diretório, hardlink, nome extra e excesso de tamanho) e L3 (controles de escrita em `/in`, de rede, de symlinks plantados no volume e em `/tmp` com stdout fixo, e de symlink plantado em `evidence/`). Mutantes: montagem `/out` gravável, `--output` com leitura posterior, leitura do volume por outro contêiner ou `docker cp`, upload de `release/` ou com glob, `sbom-path` fora de `evidence/` e leitor que segue symlink. | R4, R8, R10, §3.3 (diretórios, passos 4–23, banco), §3.5, §6 P1/P4/L2/L3, §8 |
| R2-M2 | **Aplicado.** Com a sondagem `present`, o `gate` usa `DOCKER_CONFIG` temporário, faz `docker login ghcr.io` com `github.token` (`packages: read`, já previsto) e roda quatro verificações (proveniência e `https://cyclonedx.org/bom`, cada uma pela API e por `--bundle-from-oci`), além da sonda anônima. Saída JSON e código de retorno de cada verificação vão para arquivo, e `evaluateReleaseGate` decide. O passo de limpeza com `if: always()` faz logout e remove a config. O `release-verify` também usa `DOCKER_CONFIG` temporário e verifica o SBOM pelos dois caminhos. Provas: P1 (login antes do primeiro `gh attestation verify`, quatro verificações; mutantes "gate sem login", "sem `cyclonedx`" e "sem `--bundle-from-oci`"), P3 (uma verificação `exit ≠ 0` ou subject divergente dá `refuse`) e o novo L5, que roda a CLI do gate de ponta a ponta sobre um fixture no layout de `$RUNNER_TEMP/release-gate/` e espera `already_published`, com variantes `refuse`. | §3.2 passos 4–5 e regra 8, §3.4, §6 P1/P3/L5 |

## Opcionais

| ID | Tratamento |
| --- | --- |
| O1 | **Aplicado.** `--skip-version-check --disable-telemetry` em toda chamada; `--db-repository ghcr.io/aquasecurity/trivy-db:2` fixo no download; R10 lista `ghcr.io/aquasecurity/trivy-db:2` e exclui `check.trivy.dev`, `mirror.gcr.io` e `docker.io/aquasec`. `build-record.json` registra `VulnerabilityDB` (`Version`, `UpdatedAt`, `DownloadedAt`) a partir do stdout de `trivy version --format json`. O digest do artefato do banco não sai dessa saída, e o host não lê o volume para obtê-lo. |
| O2 | **Aplicado.** Banco em contêiner com rede e sem `/in`; varredura, relatório e SBOM com `--network none`. §8 cita o log e o stdout como resíduo. |
| O3 | **Aplicado, com troca de versão.** §1.6 registra `GHSA-69fq-xp46-6x23`, `GHSA-mcj4-mphf-j9ff`, `GHSA-q3fv-x8vg-qqm4` e `GHSA-8rc5-4fr6-64pw`. O release passa à Trivy `0.75.0` (release imutável de 01/10/2026, com as correções dos três últimos), pinada por `ghcr.io/aquasecurity/trivy:0.75.0@sha256:af6acf9a…`. A `0.76.1` de 21/10 ficou de fora por ter um dia de publicação. `docker.io/aquasec/trivy` está proibido no CI e nas provas locais (P1, L2). O `image-scan` fica na `0.70.0` (R9), e a linha de backlog SEC-TRIVY foi proposta em §4. |
| O4 | **Aplicado.** A proibição vale para o `if:` de job de `release`/`release-verify`. `if: always()` de passo só é permitido nos três passos de limpeza nomeados (§3.1), e P1 confere isso. |
| O5 | **Aplicado.** P1 mede a ordem por índice de passo (`docker pull`/`docker run "$TRIVY_IMAGE"`), e `TRIVY_IMAGE` só pode ser declarado no `env:` de passo. |
| O6 | **Aplicado.** R4 e P1 proíbem `npm ci`, `npm install` e `npx` nos três jobs; os scripts importam só `node:` e os contratos locais. |
| O7 | **Aplicado.** O snapshot recapturou `protection` inteiro (`enabled: true`, `enforcement_level: everyone`), e a regra 3 e P3 exigem os dois. |
| O8 | **Aplicado.** `Accept` da sondagem com os tipos de índice; manifesto 200 de índice é `present`; 406 é `error`. P3 e L4 cobrem. |
| O9 | **Aplicado.** O `release` publica `artifact_name` como saída; o `release-verify` baixa exatamente esse nome, sem `pattern`. P1 confere. |
| O10 | **Aplicado.** A §9 registra que o Lead comunicou ao usuário em 21/10, que ainda não houve confirmação explícita e que isso não bloqueia o BUILD. A §8 cita a permanência no Rekor. |

## Premissa nova

Nenhuma. As correções usam só o `github.token` já previsto (login de leitura), a imagem pinada da mesma ferramenta (`0.75.0`, release imutável, sem credencial para baixar) e o repositório público do banco do mesmo publicador. Não há segredo, conta, action nova nem mudança de proteção.
