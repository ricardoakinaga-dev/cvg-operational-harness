# SPEC — AUD19-014 — Qualificação no runtime e supply chain alvo

- programa: `AUD-20260919-REMEDIATION`; onda: `W3`; dependências: W1+W2 ✅.
- aprovação técnica: prompt humano de 2026-09-19. Escopo: executar o
  catálogo, sem publicar artefato, sem dado real.

## Catálogo obrigatório (Node `v22.23.2`, mesmo candidato)

`npm ci` → `format:check` → `typecheck` → `lint` → `build` → `npm test` →
`test:coverage` → `test:postgres` (descartável, zero skips) → `test:e2e` →
`test:evals` → `test:chaos` → `test:worker:startup` → `verify:phase2` →
`verify:phase3` → `verify:phase4a` (com PG) → `audit:security` →
`licenses:check` → `sbom` → build+smoke da imagem não-root →
`certification:verify` (leitura honesta do drift pré-freeze) →
`git diff --check`.

## Critérios de aceite (congelados)

1. Todos os gates executados no mesmo candidato, sem skips obrigatórios
   (skips condicionais sem env documentados com contagem; gates com env com
   zero skips).
2. Imagem não-root constrói e responde ao smoke.
3. Hashes/freshness verificáveis (lockfile + `npm ci` limpo).

## Evidência

- `docs/04_audit/evidence/AUD-20260919/AUD19-014/` (logs por gate).
