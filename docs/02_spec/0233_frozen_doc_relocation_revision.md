# SPEC0233 — Revisão documentada de alvo histórico

Task `CLAUDE100-BASELINE-DOC-001`,17/10/2026. T2 de regressão de documentação, sem contrato público, segurança, aplicação ou mudança de checker. Pedido de implementação autoriza corrigir a preparação/teste local necessário; não é rebaixamento de gateT3. O kitQ03 conserva sua SPEC0230 e seus nove pins. Esta unidade é separada, com revisão independente própria antes de qualquer fechamento.

## Recon reproduzido

Na candidata7ecc5b53+kitQ03, testeoriginal`tests/doc-source-moves.test.js` lê provaPARE100 ignorada/não embarcada emGit, ausente também na raiz. A prova existe na worktreePARE100 do owner: copiar seus bytes como fixture versionada é permitido, sem alterar a prova original. A lista de três copies coincide exatamente com os três movedTargets do registro vigente.

Dois alvos ainda têm SHAigual ao sha256Before. SPEC0207 tem SHAatual6f93660593d768d21ec51e6c20acf8eff0701259aea8b2f7053fd1314101cddb; seus primeiros4715bytes produzem exatamente o SHAantigob03badb2802d31a74eaa1347ee443763f38506493b43ab3853c2e136d24939d2. Os480bytes seguintes registram fechamento local de15/10 já presente no commit de baseline. A política canônica declara sha256Before como origem histórica, não checksum eterno do destino. O teste antigo equipara ambos e falha no append legítimo já integrado.

Não apagar o fechamento, mudar o hash histórico ou aceitar qualquer alvo novo. Preservar os4715bytes como identidade histórica e vincular o destino atual e o append por digests separados. A regra torna a cadeia verificável sem descartar a prova anterior.

## O que e onde

Somente na candidata própria: `tests/doc-source-moves.test.js`, `tests/fixtures/doc-relocations/pare100-original.json` (cópia byte-exata da prova existente) e `tests/fixtures/doc-relocations/pare100-revisions.json` (nova metadataT1 da revisão observada), além desta SPEC. Aplicação, scripts/checker, docs/doc-link-policy.json e SPEC0207 permanecem byte-intactos. Não tocar fixtures/goldens de runtime/replay nem catálogo de skips/thresholds.

Fixture de revisão fechada,versão1, sourceCommit de baseline, digest da prova original e lista finita de revisões; somente SPEC0207 recebe revisão. Cada revisão declara target,sha256Before,prefixBytes,sha256After,appendSha256 e título exato do append observado. Nenhum callback/código/URL ou path arbitrário. O teste confirma um registro único, sem duplicates/unknown, target que pertence à lista histórica e hashBefore igual ao registro canônico. Metadata não concede autoridade produtiva nem modifica status de programa.

## Regra e aceites

1. **DR01:** cópia da prova histórica byte-exata, digest verificado, disponível em checkout limpo sem evidência ignorada; as três correspondências old/new/sha256Before originais continuam iguais à política.
2. **DR02:** para alvo sem revisão, manter comparação exata anterior. Para SPEC0207, verificar bytes0..4715 contra o hash histórico, destino completo contra hashAfter e sufixo contra appendSha256; título e offset têm a versão congelada. Alterar prefixo, append, offset, metadata, duplicar revisão ou truncar destino falha. Nenhum hash antigo é reemitido sobre bytes diferentes.
3. **DR03:** todas as asserções anteriores de links/relocações persistem; somente leitura do artefato não embarcado e vínculo temporal são corrigidos. Novos controles adulterados devem rejeitar mudança no prefixo e no append, target desconhecido e metadata divergente.
4. **DR04:** teste completo do arquivo, regressões de fronteiras compiladas e novepinsQ03 íntegros; type/lint/formato e gatesT2/certificação atuais, sem exclusão de teste que falhou.
5. **DR05:** revisão independente do diff/fonte e cadeia hash-bound; sem self-DONE, até dois retrabalhos.

DR01–DR05`NOT_RUN` na emissão. O primeirocertifyfalho e a falha inicial do extratorG03 permanecem evidências separadas; esta correção não muda seus resultados históricos. PostgreSQL será reexecutado sem a variávelworkers que sobrepôs a serialização; arquivos compilados vêm das fontes próprias com tempdir exclusivo, sem copiar dist de outra candidata.

## Recuperação e conclusão

Claim antes de código, patch privado e checkpoint seletivo; recuperar apenas seus arquivos por novo patch, nunca restore/reset de terceiros. Preservar prova/cadeia/erros emCLAUDE100-EXEC-20261017/q03. Fechamento só com regra histórica preservada, adversários rejeitados, crítico e gates aplicáveis; nenhuma produção, paridade, novoaceiteB6 ou promoção de controleCVG decorre desta task.
