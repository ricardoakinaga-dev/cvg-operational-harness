# GHCR placeholder — concluído em 23/10/2026

`status: COMPLETED`. Pedido de publicação da tag inicial e conferência de release atendido. [Resultado](../../04_audit/evidence/GHCR-PLACEHOLDER-20261023/completion.json).

## Entrada pronta para runtime state, execution log e backlog

- `last_completed_action`: placeholder `placeholder-20261022` publicado e resolvido remotamente, digest `sha256:f52e74956246073eeac044bafc37911765bbca2b8181d434a2ec795d400c5980`. Docker logout exit0, credencial GHCR ausente; nenhum segredo lido no chat ou pela ferramenta.
- Release do SHA `2feec903fec78d3e5aa67855e49c1af7e2221b51`: [run39911478714/attempt3](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/39911478714/attempts/3), três jobs SUCCESS: gate/publish, build/scan/atestação/push e verificação independente. Imagem `ghcr.io/ricardoakinaga-dev/cvg-operational-harness:sha-2feec903fec78d3e5aa67855e49c1af7e2221b51`, digest `sha256:faa1cacd22c2d5be88f77233d8f670059e6fe17de486d33b2aa23a435191495f`. Proveniência e SBOM: API e OCI quatro PASS; SBOM idêntico ao artefato; pull anônimo DENIED/pacote privado. Oito arquivos oficiais preservados e hashes do SBOM/dois bundles conferidos.
- Limite material: scanner do gate detectou zero HIGH/CRITICAL com correção disponível; relatório completo registra uma HIGH sem correção (`CVE-2026-84782`, `libssl3`), conforme política vigente. Publicar imagem não concede autorização de deploy/produção; nenhum deploy executado.
- `next_action`: usuário revoga o PAT temporário se ainda não o fez (orientação enviada, revogação não verificada). PR22/24 continuam OPEN/REM21 IN_PROGRESS na última consulta; manter seus próprios gates. Bloqueio de GHCR desta tarefa resolvido, sem alterar workflow/proteção/visibilidade ou mergear PR.

## Evidências

- [Push, inspeção remota e logout](../../04_audit/evidence/GHCR-PLACEHOLDER-20261023/push-result.json).
- [Gate aprovado](../../04_audit/evidence/GHCR-PLACEHOLDER-20261023/gate-attempt-3.json).
- [Release oficial](../../04_audit/evidence/GHCR-PLACEHOLDER-20261023/release-attempt-3/release-image.json).
- [Verificação independente oficial](../../04_audit/evidence/GHCR-PLACEHOLDER-20261023/release-verification-attempt-3.json).
- [Integridade dos artefatos](../../04_audit/evidence/GHCR-PLACEHOLDER-20261023/release-artifact-integrity.json).
- [Jobs finais](../../04_audit/evidence/GHCR-PLACEHOLDER-20261023/jobs-attempt-3-final.json).

Ledgers99/20/30 premodificados foram preservados conforme regra5 de coordenação; as entradas acima estão prontas para incorporação pelo dono. Sem mudança de código, lockfile ou fontes de pares; sem commit/push Git. A falha inicial do sumarizador (OCI index retornado como lista) foi corrigida a partir da inspeção preservada; o push, a inspeção Docker e o logout haviam retornado exit0.
