# RELEASE-CI-0253 — proposta de texto para a C9 de `deploy/harness/README.md`

Proposta ao Lead, conforme a §3.7 e a §5 da [SPEC0253](../../../02_spec/0253_release_image_ghcr.md). O BUILD não alterou o README: não há claim próprio sobre o arquivo, e outro agente o edita nesta worktree. O texto abaixo segue o contrato da §3.7. Nada aqui implementa deploy.

## Linha C9 da tabela

> | C9 imagem | O workflow `release-image.yml` publica no GHCR privado `ghcr.io/ricardoakinaga-dev/cvg-operational-harness` só a tag `sha-<commit>` de um commit da `main` com os 5 checks obrigatórios verdes, com proveniência SLSA e SBOM CycloneDX atestados no digest. O servidor baixa por `CVG_HARNESS_IMAGE_DIGEST`, depois de verificar as duas attestations. O token de leitura do registro fica no Vault. |

## Seção "C9 — mesmo digest e smoke no destino": bloco novo antes do smoke

> **Qual digest.** O "digest registrado pela certificação/CI" é o `digest` de `release-image.json` (artefato `cvg-release-image-<run_id>-<tentativa>` do workflow Release image) ou, em `already_published`, o digest do resumo do gate e de `release-gate.json`. O `certification/runtime-image.json` não serve, porque sai com `repoDigests` vazio.
>
> **Env no `harness.env` renderizado pelo Vault:**
>
> ```sh
> CVG_HARNESS_IMAGE_REPOSITORY=ghcr.io/ricardoakinaga-dev/cvg-operational-harness
> CVG_HARNESS_IMAGE_DIGEST=<digest>
> ```
>
> A tag `sha-<commit>` serve só para leitura humana.
>
> **Antes do `hc pull`**, na máquina do operador ou no servidor, sempre depois de um `docker login ghcr.io` de leitura (token do Vault). Um digest sem as duas attestations não é implantável:
>
> ```sh
> gh attestation verify oci://ghcr.io/ricardoakinaga-dev/cvg-operational-harness@<digest> \
>   --repo ricardoakinaga-dev/cvg-operational-harness \
>   --signer-workflow ricardoakinaga-dev/cvg-operational-harness/.github/workflows/release-image.yml \
>   --source-ref refs/heads/main --source-digest <SHA certificado> \
>   --deny-self-hosted-runners --bundle-from-oci
> # o mesmo comando com --predicate-type https://cyclonedx.org/bom (SBOM)
> ```
>
> O `gh` precisa ter `attestation verify` com `--bundle-from-oci`, `--source-ref` e `--predicate-type`. O `gh` 2.45.0 da máquina local não tem `attestation`.
>
> **Checkout no mesmo commit** (C1), porque o compose monta arquivos do checkout.
>
> **Proteção e constante.** `REQUIRED_CHECKS` em `scripts/release-image-contract.mjs` precisa ser igual à proteção da `main`. Se a proteção mudar, a constante muda no mesmo PR; senão o gate do release recusa.
>
> **Proxy.** O `proxy` continua precisando da imagem `web`, fora deste release (cartão RELEASE-WEB).
