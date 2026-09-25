# AUD39-DOC-002 — Preparação da SPEC do gerador L03

- Data: 24/09/2026.
- Resultado: `SPEC_DRAFT_PREPARED_FOR_REVIEW`; sem aprovação ou autoridade de BUILD.
- Task: L03/P3-S7; relacionada à automação ainda proposta em A29-10/A24-11.
- SPEC: [0129 — SPEC-DOC-001](../../../../02_spec/0129_l03_operational_index_generator.md), SHA-256 `91440473289ffb45b3336ec47eeccd4cd895cd1f5eb25de1df66c552d42385de`.
- Registro de validação: [0190](../../../../02_spec/0190_spec_validation.md); índice corrente: [99_operational_index](../../../../99_operational_index.md).

## Conteúdo proposto

A SPEC restringe o futuro utilitário à geração determinística de um bloco
marcado no índice. Ele lê fontes allowlisted, interrompe a leitura no primeiro
separador de histórico, valida links relativos e não copia nem infere status,
approval, gate, release ou acesso à produção. O write-set de código proposto é
um script, um teste sintético e o bloco delimitado do índice; qualquer BUILD
exige gate humano próprio, baseline e rollback.

## Verificação e limites

- Checker de links em oito documentos (`README`, SPEC, validação SPEC, índice,
  evidência e backlogs) — exit 0; `broken=[]`, `nonPortableAbsolute=[]`,
  `unallowlistedNonPortableAbsolute=[]`; `DOC_LINKS_OK`.
- Oito documentos sem trailing whitespace e com newline final; `git diff --check`
  passou nos documentos rastreados modificados.
- SHA-256 atual da SPEC conferido: `91440473289ffb45b3336ec47eeccd4cd895cd1f5eb25de1df66c552d42385de`.
- Nenhum script de geração, teste, typecheck, lint, coverage, CI ou comando do
  futuro gerador foi criado ou executado.
- A SPEC está `SPEC_DRAFT_FOR_REVIEW`; review humano e integrado: `NOT_RUN`.
- O pedido C1H continua independente, com SHA-256
  `d2e03fb29f0e95efdb418fa47e984ee2bcac4e77fbd244bb9f2b162caead046f` e sem
  comando iniciado.
- O status de L03 permanece parcial: reconciliação documental concluída, mas
  geração reproduzível ainda não demonstrada.
