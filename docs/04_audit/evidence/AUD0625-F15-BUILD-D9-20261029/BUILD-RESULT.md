# AUD0625-F15-BUILD-D9 — SPEC 0271 R1: o pré-check da 0021 só conta o que o índice deduplica

Branch `claude/aud0625-f15-d9` sobre a fase 1 `43deb9def` (wave3 `f38bfafc4`). SPEC 0271 R1 sha256 `17c69d1b2fe91fff1f0195e6b9f204d4ba018f6e24d4d7222955d21bb726102d`, aprovada pelo Ricardo com D1 = A e D2 = não nesta SPEC, em `human-decisions-10.json` (sha256 `767104d9d76aa5426d71be13da37f7b2456e89d059d6d7ef666f437e9f64474f`, copiado byte a byte e conferido). BUILD T3 local e sintético, Node 22.23.2, sem push, produção `NO_GO`.

## Mudança

- `migrations/0021_approval_decision_audit_dedupe.sql`: o pré-check ganha `AND payload->>'approvalId' IS NOT NULL AND payload->>'decision' IS NOT NULL`. Índice, validação de definição e mensagem iguais. sha256 novo `512cfa98…2f00`; o anterior é `038de370…adb7e`.
- `postgres-migrations.ts`: `supersededMigrationChecksums` (só a 0021, com o checksum anterior) e `isAcceptedMigrationChecksum(version, recorded, current)`, exportados por `@cvg/persistence`. Aceita o checksum atual ou um da lista da **mesma** versão; ausente ou vazio é recusado.
- Os comparadores de checksum de `schema_migrations` passam a usá-lo: o runner (`runPostgresMigrations`), `assertTenantIsolationMigrationState` (`apps/api/src/tenant-preflight.ts`) e o preflight do worker (`apps/worker/src/postgres-role-preflight.ts`, `requiredMigrations`). Nada é regravado no banco.
- **Desvio da SPEC §3.2:** o texto cita `baselineLegacyPostgresMigration` como terceiro comparador; ele só calcula o checksum da `0000_initial` para gravá-lo (nunca compara a 0021). O terceiro comparador real é o preflight do worker, que a SPEC não listava; está coberto aqui. `operator-session-*` usa outra lista e não envolve a 0021.

## Provas

- O `it.fails` da fase 1 virou `it` (histórico misto: harness + 2 eventos de atendimento por tenant): a 0021 aplica e o índice existe.
- Testes PG novos em `aud0625-f15-migration-0021-precheck.test.ts` (10 no arquivo, PostgreSQL 16 em contêiner próprio): banco que aplicou a 0021 **antiga** (texto do `f38bfafc4` como fixture `fixtures/0021_approval_decision_audit_dedupe.pre-0271.sql`, sha256 conferido) segue sem erro, com o checksum antigo intacto, aplica 0022 a 0031 e é idempotente; banco parado na 0021 pelo defeito aplica 0021 a 0031 numa rodada e grava o checksum novo; checksum desconhecido continua `checksum mismatch` e ausente continua `checksum missing`; duplicata real continua bloqueando; eventos com **uma só** parte nula não formam grupo.
- `apps/api/src/__tests__/aud0625-f15-preflight-checksum.test.ts` (4, sem banco): o preflight aceita o checksum atual e o anterior da 0021, recusa desconhecido e ausente, e a exceção não vale para outra migration.
- `apps/worker/src/__tests__/postgres-role-preflight.test.ts` (+1, PG): o preflight do worker aceita o checksum anterior da 0021 e recusa um desconhecido (restaura o original no `finally`).
- Regressão PG: `approval-decision-atomicity-postgres`, `audit-decision-dedupe`, `postgres-persistence-mode`, `tenant-schema-inventory-postgres`, `postgres-migration-smoke`, `conversation-intelligence-migration` e os três acima: 9 arquivos, 146/146.
- Mutações ([mutations.txt](proofs/mutations.txt)): filtro de `approvalId` e de `decision` removidos (sobreviveram na 1ª rodada, porque o seed só tinha pares `NULL/NULL`; o teste de uma parte nula os mata), lista de checksums vazia, aceitar qualquer checksum, não aceitar o atual, lista valendo para toda versão, runner/preflight da API/preflight do worker de volta ao `!==`: todas mortas.
- Skip-catalog religado no mesmo commit: `SKIP-PG-019` (`postgres-role-preflight`, 16 → 17) e `SKIP-PG-043` (5 → 9) com novos hashes; `skip:governance` PASS e `certification/skip-inventory.json` restaurado.

## Hashes e manifestos da 0021

O arquivo mudou de bytes. Nenhum teste fixa o sha da 0021 (o `grep` em `scripts`, `tests`, `apps`, `packages` e `.github` só acha o checksum antigo que esta SPEC acrescenta). `certification/candidate-manifest.json` e `certification/phase10-result.json` guardam o hash antigo, mas já estão defasados (não listam as migrations 0029 e 0030) e são regenerados pelo `certify`, que só roda com claim próprio; as pastas de evidência históricas (`HISO005-*`, `B6-*`, `AUD0590-*`) são fotografias. O `docs:check-links` e o `mutation-guard` não leem esses hashes (nenhuma fonte do `scripts/mutation-manifest.json` foi tocada).

## Limites

- Quem aplicou a 0021 antiga mantém o checksum antigo para sempre; a lista de superados é permanente por desenho.
- Eventos de atendimento seguem sem chave de dedupe própria (D2).
