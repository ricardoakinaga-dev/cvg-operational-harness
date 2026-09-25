# Manifesto de verificação — AUD19-011

- task: `AUD19-011`; onda: `W2`; status: `VERIFIED`; fecha W2.
- runtime: Node `v22.23.2`; sem mudança de comportamento (extrações +
  manifests).
- autorização: prompt humano de 2026-09-19 (gate `G0`); sem commit/push,
  sem produção.

## Entregas

1. **Manifests**: 42 violações mapeadas pelo guard novo → todas declaradas
   (api +7/−1, worker +8/−4, web +5 dev, +vitest onde testado, runtime
   achados em persistence/shared/tools/workflows, teste-achados em
   chaos/conversation/platform); `package-lock.json` ressincronizado
   (`npm install --dry-run` PASS).
2. **Trava futura**: `tests/workspace-dependency-manifest.test.js` (varre
   imports × manifests; falha em violação).
3. **Extrações**: `server.ts` −1002 linhas → `tenant-preflight.ts` (1029→931
   final) com re-export compatível; `platform/index.tsx` −447 linhas →
   `draft-helpers.ts`; `postgres.ts` já decomposto em W1
   (`outbox-content-hash`, `tenant-schema`).
4. **Isolado**: `build:web` PASS com deps declaradas.

## Provas

| Prova                                                      | Resultado                   |
| ---------------------------------------------------------- | --------------------------- |
| guard de manifests (novo)                                  | PASS (era 42 violações RED) |
| caracterização web platform antes/depois                   | 7 arq/19 testes idênticos   |
| api memory 57 arq/285 (pós-extração server)                | PASS                        |
| arquitetura + scripts + manifests                          | PASS                        |
| `build:web`                                                | PASS                        |
| `typecheck` / `lint` / `format:check` / `git diff --check` | PASS                        |

## Arquivos desta evidência

`SPEC.md`, `MANIFEST.md` (este), `web-platform-before.txt`,
`web-platform-after.txt`, `typecheck.txt`, `lint.txt`, `format-after.txt`,
`diffcheck.txt`, `node-version.txt`.

## Limitações declaradas

- `server.ts` segue volumoso (rotas); decomposição adicional é trabalho
  futuro fora deste programa.
- Produção `NO_GO`.
