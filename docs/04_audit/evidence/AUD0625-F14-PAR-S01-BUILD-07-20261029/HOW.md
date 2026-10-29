# PAR-S01 — HOW curto do BUILD (task `AUD0625-F14-PAR-S01-BUILD-07-20261029`)

Claude Sonnet, sessão 07. Autorização: recibo [human-decisions-14](../USER-DECISIONS-20261028/human-decisions-14.json)
(sha256 `3acd13ef56e7c32aad4d60ee5dca39f6f0b5cdc7e2d862272b2f6199b7b7e5b0`): BUILD local e sintético, em paralelo ao K03;
**integração na main só depois do K03**. Não autoriza produção, dado real nem release.

Fontes: SPEC 0221 (`1f9490cc…`), recomposição `f64a1b89` (primeira fatia), nota 0221b (migration **0034**).
Base: `claude/aud0625-wave3` (8a98de177). Barra de qualificação composta: 5 checks do PR + `test:postgres:proof`.

## Decisões de entrada

- Migration `0034` fica no esquema dedicado, **opt-in** como a `0028` (lista própria em `session-events.ts`), logo
  fora de `POSTGRES_MIGRATIONS`. Se algum dia entrar no default, `rem21-010` precisa de roll forward.
  Reconfirmar na fatia 2.
- `maxOpenWriters` é opção obrigatória da factory; fixture local: 2 escritores, 2 leitores, 1 slot de admin. Sem
  PgBouncer transaction mode. Nenhum número de produção presumido.
- Contratos em `@cvg/harness-contracts` (tipos), erros e validação de header em `@cvg/harness` (`session/persistence.ts`),
  backend em `@cvg/persistence`. Sem importar produto.
- Fora do primeiro BUILD: `stat`, `list`, flush agregado, `owner.shutdown`, ticket de recuperação.

## Fatias

| # | Conteúdo | Estado |
|---|----------|--------|
| 1 | Contratos, 12 classes de erro, validação de header/cut (captura única) | feita |
| 2 | Migration 0034 + guards + testes PG negativos | feita |
| 3 | Adaptador (lease físico), create/open/read, preflight | feita |
| 4 | append/flush/close, LOST, commit-unknown | |
| 5 | Ponte `sessionEventStoreForHandle` + teste SDK | |
| 6 | Testemunhos S1–S5 em processos distintos | |
| 7 | Mutação, campanha PG, rebind de catálogos, revisão | |
