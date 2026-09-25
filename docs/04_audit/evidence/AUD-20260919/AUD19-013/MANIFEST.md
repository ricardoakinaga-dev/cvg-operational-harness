# Manifesto de verificação — AUD19-013

- task: `AUD19-013`; onda: `W3`; status: `VERIFIED`.
- runtime: Node `v22.23.2`; browser Chromium (único declarado/suportado);
  Firefox/WebKit = residual explícito (não instalados, sem alegação).
- autorização: prompt humano de 2026-09-19 (gate `G0`); sem commit/push,
  sem produção, sem dado real (fixtures sintéticas).

## Entregas

1. `tests/e2e/ux-accessibility.spec.ts` (6 testes): axe 0 serious/critical
   (identidade + console), teclado (Tab/Enter/foco), estados
   (loading/erro/vazio/overflow), troca de tenant sem vazamento, 401/403/429/
   500 compreensíveis, reduced motion operável.
2. `axe-core` + `@axe-core/playwright` (devDeps) + screenshots de evidência.
3. Correção de tenant IDs do spec para o formato `TenantIdSchema`
   (achado honesto durante a execução).

## Provas

| Prova                                                     | Resultado  |
| --------------------------------------------------------- | ---------- |
| novo spec (Chromium)                                      | 6/6 PASS   |
| `npm run test:e2e` completo                               | 12/12 PASS |
| screenshots (`ux-authz/ux-error/ux-tenant-a/ux-tenant-b`) | capturados |
| `format:check` / `git diff --check`                       | PASS       |

## Arquivos desta evidência

`SPEC.md`, `MANIFEST.md` (este), `ux-*.png`, `typecheck.txt`, `lint.txt`,
`format-after.txt`, `diffcheck.txt`, `node-version.txt`.

## Limitações declaradas

- Firefox/WebKit não qualificados (fora do escopo declarado).
- 401 legado em approvals/tasks/audit no env de teste = baseline do HEAD.
- Produção `NO_GO`.
