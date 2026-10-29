# PAR-K03 f0 — `complete-json.ts` (SPEC 0224 BUILD, só este arquivo)

Autorização: `receipts/human-decisions-17.json` (sha256 `3c79a02d…766e46`, Ricardo, 29/10/2026)
concede integrar **só** `packages/contracts/src/complete-json.ts` do BUILD 0224 byte a byte, com testes
e revisão independente. Recibo original da 0224: `receipts/spec0224-human-approval.json`
(sha256 `017124bc…a5d4`, BUILD local isolado, `rootRuntimeIntegrationAuthorized:false`) — continua valendo
para todo o resto (K03b), que NÃO foi integrado.

- `complete-json.ts` e `__tests__/complete-json.test.ts`: de `2f0cc11f7`, byte a byte
  (`complete-json.ts` sha256 `ea773ca6…888570`, igual ao recibo).
- **Desvio declarado:** `complete-json.ts` importa 3 tipos de `complete-tool-context.ts`
  (`CompleteJsonValue`, `CompleteJsonLimits`, `CompleteJsonErrorCode`). Esse arquivo inteiro (checkpoint,
  admissão de decisão) é K03b e não está autorizado; foi criado um `complete-tool-context.ts` contendo
  SÓ esses três tipos, copiados literalmente (sem runtime). O K03b o substitui pelo arquivo completo
  (superconjunto, sem conflito).
- Barrel `packages/contracts/src/index.ts` exporta ambos (como em `2f0cc11f7`).
- Verificação: vitest `packages/contracts` 25/25, typecheck, eslint, prettier PASS.
- **Superfície pública nova de `@cvg/harness-contracts`** (coberta pelo recibo 17): `canonicalizeCompleteJson`,
  `CompleteJsonError` e os tipos `CompleteJsonValue`, `CompleteJsonLimits`, `CompleteJsonErrorCode`.
