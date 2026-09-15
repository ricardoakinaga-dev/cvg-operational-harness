# Handoff AAA-16 → coordenador (agent-1)

- Task: `AAA-16` — PostgreSQL descartável e gate sem skips. Status: **IMPLEMENTED_PENDING_INDEPENDENT_REVIEW**.
- Recurso: cluster descartável `127.0.0.1:55432`, database `cvg_aaa16_test`, diretório `/tmp/opencode/aaa-agent2-pg16` (PostgreSQL 16.15). Porta 5432 (runtime cvg-his-v4) e `DATABASE_URL` operacional nunca foram usadas.
- Resultado: `TEST_DATABASE_URL=postgres://ricardo@127.0.0.1:55432/cvg_aaa16_test npm run test:postgres` → **11 arquivos / 84 testes PASS, 0 falhas, 0 skips, exit 0**.
- Reprodução anterior preservada: primeira execução real do chaos falhou (2 execuções, exit 1) por defeitos preexistentes de harness; corrigido apenas o harness (`packages/chaos/src/__tests__/chaos-postgres.test.ts`, sha256 `a122ae51...`), sem afrouxar asserções.
- Evidência de aceite: names dos 84 testes no `test-postgres-verbose.log`; RLS FORCE, papéis runtime/migration, isolamento por tenant, duas conexões, rollback e cleanup mapeados no `manifest.json`.
- Review pedido: revisão independente do log e da instância; limitação declarada: prova local, não substitui P10-B01/homologação.
- Cleanup: `pg_ctl -D /tmp/opencode/aaa-agent2-pg16/data stop -m fast` e `rm -rf /tmp/opencode/aaa-agent2-pg16` quando a revisão terminar.
