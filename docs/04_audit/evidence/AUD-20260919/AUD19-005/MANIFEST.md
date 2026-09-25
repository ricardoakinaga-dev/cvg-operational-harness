# Manifesto de verificação — AUD19-005

- task: `AUD19-005`; onda: `W1`; status: `VERIFIED`.
- runtime: Node `v22.23.2`; PostgreSQL descartável `postgres:16-alpine`
  (container `aud19-pg`, porta 5434, sintético).
- autorização: prompt humano de 2026-09-19 (gate `G0`); sem commit/push,
  sem produção.

## Reparos (causas estruturais)

1. `TENANT_SCHEMA_INVENTORY` (`@cvg/persistence`, 40 tabelas tenant-scoped
   de dados + `outbox_quarantine` em ramo de quarentena separado): autoridade
   única consumida pelo preflight (exceção de expressão derivada, sem lista
   hardcoded).
2. Migration `0022_conversation_policy_standardization` (transacional,
   idempotente): 5 políticas `cvg_*` renomeadas para `*_tenant_isolation`.
3. Preflight estendido: versões `0020`/`0021`/`0022`, ~70 constraints e ~34
   indexes com nomes exatos do catálogo vivo (extraídos, nunca chutados).
4. `appendAudit` não-isolado com sonda cacheada da coluna `tenant_id`
   (compat 0000-only + fail-closed moderno).
5. Fixture `postgres-persistence-mode` deriva grants do inventário
   (não diverge mais).

## Provas

| Prova                                                                                         | Resultado  |
| --------------------------------------------------------------------------------------------- | ---------- |
| mundo fechado: 41 tabelas com `tenant_id` == inventário + quarentena; preflight integral PASS | PASS       |
| negativos: tabela removida → falha; `0022` ausente → falha; papel sem grants → falha          | 3/3 PASS   |
| `postgres-persistence-mode` (25, inclui papéis separados e RLS)                               | 25/25 PASS |
| `postgres-role-preflight` worker (13)                                                         | 13/13 PASS |
| `test:phase4a` com cadeia até `0022` (78)                                                     | 78/78 PASS |
| api memory (56 arq/280)                                                                       | PASS       |
| `typecheck` / `lint` / `format:check` / `git diff --check`                                    | PASS       |

## Arquivos desta evidência

`SPEC.md`, `MANIFEST.md` (este), `typecheck.txt`, `lint.txt`,
`format-after.txt`, `diffcheck.txt`, `node-version.txt`.

## Limitações declaradas

- Composição server+schema-completo para writes legados além de auditoria
  (ex.: sessions sem tenant no modo `kind:postgres`) é gap conhecido → W2.
- `BYPASSRLS`/superuser nunca usados nos papéis de teste desta task.
- Produção `NO_GO`.
