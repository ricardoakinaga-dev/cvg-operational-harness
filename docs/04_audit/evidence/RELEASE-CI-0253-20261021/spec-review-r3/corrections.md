# SPEC0253 r4 — tratamento da revisão r3

- Revisão: [review.md](review.md). Veredito `REVISE`, alvo r3 SHA-256 `6af7012ad72b98fdd6a56493cc51acfca97411f6f065570dd5947df54c17c820`.
- Decisão do usuário que responde à premissa de R3-M1: [user-decision-20261022.json](../user-decision-20261022.json). O usuário cria uma vez o pacote privado, com credencial própria, publicando só uma imagem placeholder `placeholder-AAAAMMDD`. Depois confere `Private`, conecta o repositório e dá `Write` ao Actions. O release nunca cria o pacote. Essa é a única publicação fora da `main` autorizada.
- Nova versão: [SPEC0253 r4](../../../../02_spec/0253_release_image_ghcr.md). O SHA-256 está na resposta ao coordenador e no registro do Lead.
- Script do passo único do usuário: fornecido pelo Lead (`criar-pacote-ghcr.sh`, no scratchpad da sessão). Lido nesta rodada:
  - faz build de `FROM scratch` com um `README`, sem código do harness;
  - pede o token com `write:packages` por `read -s`, faz `docker login --password-stdin` e `docker push` de `placeholder-AAAAMMDD`;
  - roda a sonda anônima e imprime os dois passos nas configurações do pacote (conferir `Private` e dar `Write` em "Manage Actions access").

  A SPEC descreve o passo em §9 sem depender do caminho do script.
- Não tocados nesta rodada: `deploy/harness/README.md` e `deploy/harness/secrets/README.md`.

## Obrigatório

| ID | Tratamento | Onde na r4 |
| --- | --- | --- |
| R3-M1 | **Aplicado conforme a decisão de 22/10.** O release nunca cria o pacote. Antes do push, o `gate` (regra 8) e o novo passo `id: package-precondition` do `release` (passo 14) exigem: `tags/list` autenticado = 200 (existe e tem acesso), sonda anônima de token `DENIED` (privado) e tag `sha-S` ausente só com 404 `MANIFEST_UNKNOWN` (e fora de `tags/list`). Os demais casos dão `refuse` sem push: token autenticado `DENIED`, `tags/list` 401/403/404 (`package_missing_or_inaccessible`), anônimo com token (`package_public`), `NAME_UNKNOWN` ou outro erro na tag. O token `DENIED` deixou de valer `absent`. Tags `placeholder-*` são ignoradas pelo gate e nunca reescritas (R5, passo 16). O caminho "tornar privado e reexecutar" saiu de §3.4, §8 e §9. A sonda depois do push ficou como defesa redundante, sem recuperação no CI. §1.7 cita os dois trechos da documentação do GitHub. §8 e §9 descrevem o pré-requisito e o que acontece sem ele: `refuse` com mensagem que aponta para §9 e nada construído nem publicado. Provas: P1 (passo `package-precondition` antes do `docker login`, sem `continue-on-error`; sondagem com `tags/list` e sonda anônima; mutante "push cria o pacote"), P3 (pacote inexistente dá `refuse` e nunca `publish`; pacote público dá `refuse`; tag com outro erro dá `refuse`; `placeholder-*` não muda a decisão), L4 (`NAME_UNKNOWN` e `MANIFEST_UNKNOWN` no registro local) e L5 (variantes de pacote inexistente e público). | R5, R8, §1.7, §3.2 passo 3 e regra 8, §3.3 passos 14 e 16, §3.4, §3.5, §6, §8, §9 |

## Opcionais

| ID | Tratamento |
| --- | --- |
| O1 | **Aplicado.** `--skip-version-check`/`--disable-telemetry` só nas chamadas `trivy image`; `trivy version` fica sem eles, com `--network none` (§1.6, §3.3 passo 8). P1 e o mutante foram ajustados ("esses flags em `trivy version`" também mata). |
| O2 | **Aplicado.** P1 exige exatamente uma chamada da Trivy sem `--network none`, a de `--download-db-only`, antes de todas as outras. Mutante: "segunda chamada com rede, por exemplo depois das varreduras". |
| O3 | **Aplicado.** §8 cita o alcance do contêiner do banco pela ponte (host e metadados da nuvem, sem token do repositório). Todos os contêineres da Trivy levam `--pids-limit 512 --memory 4g`. A escrita é limitada por `head -c` (máximo + 1) com `pipefail`, e `readEvidenceFile` recusa o excesso. P1 confere. |
| O4 | **Aplicado.** "root (uid 0) da imagem, sem capabilities" (§1.6, §3.3 passo 7). |
| O5 | **Aplicado (registro).** §1.6 e o recon registram o bundle Sigstore do índice `af6acf9a…` (signer `reusable-release.yaml@refs/tags/v0.75.0`, commit `591e9799…`), lido pelo crítico sem verificação criptográfica. A verificação com `gh` recente fica opcional no BUILD, sem levar `cosign` ao CI. |
| O6 | **Aplicado.** §1.6 registra a `v0.76.1` (CA eMudhra) e por que a `0.75.0` basta. O cartão SEC-TRIVY inclui a subida das duas Trivy. |
| O7 | **Aplicado.** §8 separa os dois casos: falha de attestation ou manifesto dá `refuse`; falha só do registro ou do upload dá `already_published`, com o digest do deploy vindo do resumo do gate. |
| O8 | **Aplicado.** Os passos da Trivy não têm `id`, e P1 confere que ninguém consome saída deles. |
| O9 | **Aplicado.** A §9 torna a ciência explícita pré-condição do merge do PR do BUILD, não do BUILD, e cita a entrada da attestation do SBOM no Rekor. |
| O10 | **Parcial.** `GHSA-q3fv` virou "médio no repositório, alto no banco global". A âncora do smoke **foi mantida** em `scripts/ci-bar.mjs:615`: conferido com `grep -n`, a linha 614 é o `docker build` e a 615 é o `docker run … runtime-image-smoke.mjs`. |
| O11 | **Aplicado.** O token da sondagem entra por `curl --config -` lido do stdin, nunca por `-u`/`-H` no argv. P1 confere, e há mutante. |

## Premissa nova

Nenhuma além da decisão do usuário de 22/10, que já está registrada. O release continua só com `GITHUB_TOKEN`, Sigstore keyless e actions já pinadas. A criação do pacote é ato único do usuário, autorizado em `user-decision-20261022.json`. A imagem da Trivy `0.75.0` continua sem premissa, como confirmou o crítico r3.
