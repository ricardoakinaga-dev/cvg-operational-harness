# F05 — recon da SPEC 0164

- Data: 29/09/2026; claim `AUD0590-F05-SPEC-002`; task `A59-05`/`PR-205`.
- [SPEC 0164](../../../../../02_spec/0164_dependency_advisory_remediation.md)
  SHA-256 inicial formatado `d68013400db55a2309ad61589190ed0343fc5c4d20feef6a1c9ea1a90ea86d04`.
- [I1](I1-review.md) `REVISE` (2 P1/3 P2); resposta documental na SPEC
  SHA-256 `e485c7d37354ca33a9054ad47d05ec0aa8e601358f0f779cac70ed097705e6bd`.
- [I2](I2-review.md) `ACCEPT_SPEC_REVIEW_READY`, sem P0/P1/P2 no hash
  acima; revisão humana T3 ainda pendente.
- Fonte local: [triagem](../triage.md) e
  [audit produtivo bruto](../production-audit.json), lockfile SHA-256
  `3bcb581b47e69246c4905d922db8a5a235e0bfd1ec20f82ac4c70a1f59c4062e`.
- Fonte externa verificada: advisories GitHub de `fast-uri`
  [porta](https://github.com/advisories/GHSA-qw65-cvwx-89v3) e
  [host](https://github.com/advisories/GHSA-58mr-gqgx-xq4g), e
  [Undici](https://github.com/advisories/GHSA-3wwx-pv8p-q78v). Versões
  corrigidas indicadas: 3.1.7 e 7.29.1, respectivamente.

Revisão própria: a SPEC separa dependência produtiva alta de dependência
de desenvolvimento moderada, fixa alteração mínima/reprodutível,
regressões de URI sem rede, audit de árvore completa/produtiva e bloqueio
de release até candidato integrado. A exposição dos vetores no produto não
foi demonstrada. `package.json`/`package-lock.json` estão apenas em leitura
por claim PR-L04; nenhum `npm install`, BUILD, E2E ou certificação foi feito.

Estado: `SPEC_I2_ACCEPTED / HUMAN_T3_PENDING /
BUILD_NOT_AUTHORIZED / PRODUCTION_NO_GO`.
