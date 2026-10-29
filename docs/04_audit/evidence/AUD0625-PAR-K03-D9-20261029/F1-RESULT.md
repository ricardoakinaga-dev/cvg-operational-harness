# PAR-K03 f1 — codec do journal (SPEC 0225)

- `packages/persistence/src/operational-effect-result-codec.ts` e `__tests__/complete-effect-result-codec.test.ts`
  vindos do WIP `7e4ed139f` sem alteração (os imports já resolvem na cadeia atual depois da f0:
  `canonicalizeCompleteJson`/`CompleteJsonError` de `@cvg/harness-contracts`, `OperationalExecutionError` de `@cvg/harness`).
- Tetos congelados: 1 MiB de resultado, profundidade 64, 1 000 000 nós, `data` ≤ 1 398 104 caracteres.
- Escopo: componente (codec + scanner), 165 testes. Os J01–J04 nativos de PG dependem do adapter (f3) e ficam lá.
- Verificação: vitest 165/165 (Node 22.23.2), typecheck, eslint, prettier, `mutation:guard`, `skip:governance` PASS.
  Mutantes do codec: campanha na f5.
