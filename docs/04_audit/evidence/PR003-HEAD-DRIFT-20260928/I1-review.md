# PR-003 — crítica independente do desvio de HEAD — 28/09/2026

- Revisor independente Anscombe, somente leitura; não alterou o worktree ou
  os certificados. Executou uma repetição read-only de
  `certification:verify` após inspecionar os artefatos.
- Veredito: **`ACCEPT_REPRO`**, severidade alta e confiança alta para o
  negativo de desvio apenas de HEAD.

O [registro](reproduction.json) liga `before.log` e `after.log` por SHA-256.
O commit vazio `60bbf22` tem diff de árvore vazio contra seu pai `7ef74e7`.
O revisor recalculou os registros/ID do candidato (`47440863…`) e confirmou
que os bytes permanecem iguais. `result.commit`, `manifest.commit` e
`result.candidate.git.head` continuam em `7ef74e7`. Mesmo assim, o
verificador corrente saiu com código 0 e imprimiu `current candidate
qualified` após a mudança do HEAD.

O código em `scripts/phase10-verify.mjs` recalcula o ID dos arquivos, mas
não recusa o HEAD divergente; `computeCandidateId` em
`scripts/lib/certification-rules.mjs` não inclui o commit. A
[SPEC 0157](../../../02_spec/0157_certificate_live_head_binding.md)
define o reparo sob revisão humana T3. O caso demonstra aceitação indevida
após **drift somente de HEAD**; não demonstra aceitação de arquivo candidato
alterado ou evidência fabricada. O certificado original continua pertencendo
ao seu SHA `7ef74e7`; nenhum certificado qualifica `60bbf22` para release.
Produção permanece `NO_GO`.
