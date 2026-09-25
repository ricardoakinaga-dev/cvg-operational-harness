# SPEC — AUD19-011 — Hotspots e dependências por workspace

- programa: `AUD-20260919-REMEDIATION`; onda: `W2`; dependências: `AUD19-003`–`010` ✅.
- aprovação técnica: prompt humano de 2026-09-19; escopo local/sintético,
  reversível. Sem mudança de comportamento (extrações + manifests).

## Desenho

A. **Manifests** (mecânico, sem código): declarar toda dependência direta
usada e remover as não usadas —

- `apps/api`: + `approval-engine`, `harness-contracts`, `platform`,
  `rag`, `fastify`, `pg`, `zod`; − `policy` (não importado).
- `apps/worker`: + `agent-runtime`, `approval-engine`,
  `harness-contracts`, `model-gateway`, `observability`, `platform`,
  `policy-engine`, `zod`; − `workflows`, `tools`, `policy`, `memory`.
- `apps/web`: + `react`, `react-dom`, `@tanstack/react-query`;
  dev + `vitest`, `@testing-library/react`.
- Trava futura: `tests/workspace-dependency-manifest.test.js` — varre
  imports diretos × manifests e falha em dependência não declarada.
  B. **Extrações pequenas com caracterização**:
- `server.ts` → `apps/api/src/tenant-preflight.ts` (listas + asserts +
  normalizador; re-export em `server.ts` para compatibilidade; testes
  existentes como caracterização).
- `platform/index.tsx` → extração de lógica pura idem (ver inspeção).
- `postgres.ts`: coeso como classe de repositório; extrações
  `outbox-content-hash` + `tenant-schema` já feitas neste programa.
  C. **Isolado**: `npm run build` por workspace afetado + suíte do workspace.

## Critérios de aceite (congelados)

1. Limites claros (módulos extraídos com dono e teste).
2. Toda dependência direta declarada no consumidor; teste-manifesto verde.
3. `typecheck`, `lint`, `format:check`, `git diff --check` PASS.

## Arquivos (congelados)

- editados: `apps/api|worker|web/package.json`, `apps/api/src/server.ts`,
  `apps/web/src/features/platform/index.tsx` (+ extração);
- novos: `apps/api/src/tenant-preflight.ts`,
  `tests/workspace-dependency-manifest.test.js`.

## Evidência

- `docs/04_audit/evidence/AUD-20260919/AUD19-011/`
