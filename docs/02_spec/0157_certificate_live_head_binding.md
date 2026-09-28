# SPEC-PR003-006 — vínculo do certificado ao HEAD verificado

- Trilha: **T3**, pois altera o gate de qualificação de release.
- Task: fatia PR-003 no [backlog 0356](../03_build/0356_production_backlog_2026-09-26.md).
- Estado: `SPEC_READY_FOR_HUMAN_REVIEW`; BUILD depende de revisão humana explícita.
- Escopo: verificador local de Phase 10, com dados sintéticos e sem push,
  deploy, credencial ou promoção de produção.

## Recon e risco

O certificado isolado `7ef74e7` passou 16/16 gates e 38/38 hashes, com
`result.commit`, `manifest.commit`, `result.candidate.git.head` e HEAD
iguais por inspeção manual. O [parecer independente](../04_audit/evidence/PR003-COMPOSITE-20260928/proof.json)
apontou que `verifyQualification` só compara `candidateId` e hashes de
artefatos. O modo corrente de `phase10-verify.mjs` recalcula o `candidateId`
dos arquivos, mas não compara os três campos de commit com `git rev-parse
HEAD`. `computeCandidateId` usa caminhos, bytes, tamanho e estado tracked;
não inclui o commit. Um commit que preserve esses bytes pode portanto deixar
o candidato com o mesmo ID e metadados de commit vencidos. Este é um limite
do gate, não uma alegação de adulteração do certificado arquivado.

## Contrato de BUILD proposto

1. No modo **corrente**, ler `git rev-parse HEAD` com exit code checado e
   exigir SHA completo válido. Comparar o valor com `result.commit`,
   `manifest.commit` e `result.candidate.git.head`, exigindo também igualdade
   entre os três. Qualquer ausência, falha de Git ou divergência nega a
   qualificação com códigos de erro específicos. O certificado qualifica o
   **SHA final de fonte** usado no run. Os artefatos gerados de certificação
   ficam preservados no bundle imutável e na atestação externa, sem um commit
   posterior no checkout que será qualificado. Um commit posterior, mesmo
   apenas dos artefatos excluídos do `candidateId`, passa a exigir novo run
   para qualificar o novo HEAD; não repetir o ciclo de certificar e commitar
   saídas geradas no mesmo branch.
2. Exigir exatamente um registro de artefato no manifesto com caminho
   canônico `certification/candidate-manifest.json`; hash, tamanho e bytes
   precisam conferir. Interpretar seu conteúdo como `CandidateRecordSchema`
   e comparar `candidateId`, `git.head` e a lista ordenada de arquivos com
   `result.candidate`. Recalcular o ID a partir da lista registrada. Nenhum
   campo novo de manifesto é necessário: a entrada canônica obrigatória é
   a única referência. O certificado não poderá combinar um candidato de
   um run com metadados de outro.
3. No modo `--historical`, exigir coerência interna entre os campos de commit
   e o manifesto de candidato quando esses campos existem, sem coletar nem
   comparar **HEAD ou arquivos candidatos vivos** do checkout atual. Manter
   a mensagem explícita de que a verificação histórica não qualifica o
   checkout corrente. Compatibilidade com certificados legados sem candidato
   continua somente histórica.
4. Preservar a lógica de 16 gates, decisão `CONDITIONAL_GO`/`NO_GO`, catálogo
   de skips, hashes, `runId` e autenticação externa da SPEC 0147. Esta fatia
   não cria uma prova de CI remoto nem autoriza `GO` de produção.

## Negativos e aceite

- Fixture positiva: certificado sintético íntegro, HEAD igual nos quatro
  pontos, verificador corrente PASS.
- Negativos independentes: adulterar apenas cada campo de commit; adulterar
  os três juntos mantendo bytes do candidato; avançar o HEAD com commit
  vazio e com commit apenas de artefatos excluídos do `candidateId`; simular
  Git ausente/erro; omitir, duplicar ou renomear a entrada canônica de
  `candidate-manifest.json`; adulterar seu conteúdo com hashes reemitidos;
  declarar ID falsificado para a lista de arquivos. Cada caso deve falhar
  pela causa esperada, mesmo com hashes de artefatos coerentes no fixture.
- Histórico: bundle cujo **ID e arquivos candidatos diferem dos do checkout**
  passa apenas como `HISTORICAL_COHERENCE` se for internamente coerente;
  commits internos divergentes falham. Não reescrever o bundle histórico
  PR003.
- Após BUILD aprovado: testes focados, self-test do verificador, typecheck,
  lint, `npm test`, `test:postgres` e E2E em Node 22/PG descartável; revisão
  independente do diff e, no SHA final integrado, nova certificação completa
  sob claim exclusivo. Qualquer falha mantém `NO_GO`.

## Limite de confiança

Esta comparação detecta drift e metadados incompatíveis dentro do checkout.
Um produtor que controla código, artefatos e Git ainda pode fabricar uma
prova local coerente. O selo/atestação externos da [SPEC 0147](0147_ci_bar_external_provenance.md),
CI remoto no mesmo SHA, staging e decisão humana continuam necessários para
release.

## Revisão técnica

Crítica independente Schrodinger, leitura somente, 28/09/2026: primeira
rodada encontrou dois P1 (ciclo de commit dos artefatos e modo histórico
ainda vinculado ao candidato vivo) e um P2 (entrada de manifesto ambígua).
Os três pontos foram corrigidos acima. Segunda rodada:
`ACCEPT_SPEC_REVIEW_READY`, sem P1 restante. Revisão humana T3 ainda não
registrada; BUILD continua fechado.
