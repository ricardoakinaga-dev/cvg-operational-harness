# Resposta documental à crítica I10 — SPEC 0163

Data: 29/09/2026. Candidato revisado por I10: `b528f27f776cdf9796571ed4210c7bafda2fb38367e3bd1ff7244e4473aac77d`. I10 [REVISE](I10-review.md), SHA-256 `487c7a79b85d1df5792747bac5315f1bdc3b4421920e9ad5662aa85ad5e2e3d3`; prova [JSON](I10-proof.json), SHA-256 `e7629ae6128338eeb605b6c5025828c8031cb75a536eba82c83d4f7f8ffa453d`.

## I10-P2-01 — escopo da rastreabilidade histórica

O fecho da SPEC foi estreitado para distinguir relatórios de revisão de respostas autônomas. Há respostas separadas I5–I8; a reconciliação de estado I9 não é resposta técnica I9. Não existem arquivos de resposta autônoma I1–I4 ou I9. O texto e o pacote T3 agora deixam explícito que I1–I6 não foram revalidados integralmente por hash/conteúdo nesta rodada e que essa história não concede aceitação ao candidato atual.

O pacote T3 foi atualizado para vincular o candidato atual `5c2dd7c612c181b2e1d46e512c5d9eb134b0c8ef376bbc94993c47ee6e707ca4`, registrar que I9 aceitou somente `ec8d3950b96532f4af8a17a8aa98911791e385921ca78a80ac8b358661684f5f` e que I10 revisou somente `b528f27f776cdf9796571ed4210c7bafda2fb38367e3bd1ff7244e4473aac77d`. Não afirma que a cadeia antiga completa foi revalidada. A SPEC e o pacote T3 foram corrigidos apenas quanto à rastreabilidade e estado de revisão; o contrato técnico não mudou.

## Estado do gate

Resposta documental. O novo hash requer crítica independente I11 antes da revisão humana T3. Nenhuma aprovação histórica se transfere; BUILD sintético continua não autorizado. Sem teste, código, dados reais, provider/exporter externo, push, deploy ou produção. `NO_GO` permanece.
