# Onda 6 — integração e gates (sessão 07)

Branch `claude/aud0625-wave6`, local e sem push, a partir de `claude/aud0625-wave5-pr` @ `97f81204d` (head do PR #36).
O SHA final está no commit que acrescenta esta evidência (`git log -1` da branch).

## Merges (ordem pedida)
1. `871c020ee` 0291, `claude/aud0625-approval-origin-07` @ `f6a079ddf` (revisão D9 `483e08096`, recibo 25, migração 0035). Sem conflito.
2. `5531357e1` C03, `claude/aud0625-par-c03-build-d9` @ `5927b1476` (inclui `1e6a92f79`, `2686896dd`; contém a 0290c `f3d6bd87c`, já na onda 5; revisões da Codex até a R2 `9962db7b7`; migração opt-in 0037). Conflitos: `package.json` (`test:postgres`: lista da onda 5 mais o teste PG da C03), `packages/persistence/src/index.ts` (as duas exportações), `postgres-migrations.ts` (lista padrão até a 0035 e comentário da 0037 opt-in), `scripts/skip-catalog.json` (união por id, 57 entradas) e os três ledgers (versão da onda 5; linhas reaplicadas depois).
3. `82a5cc769` reforço do prompt híbrido, `claude/aud0625-hybrid-prompt-d9` @ `ffa2ef8d2`. Sem conflito.

## Commits próprios depois dos merges
- `5614d42fa` religa os hashes do skip-catalog (SKIP-PG-004, SKIP-PG-044) e da fonte da mutação `approval-self-approval-comparator`.
- `16d8cec36` re-pin de `contracts.ts` em `contract_v1.json` (o diff desde o pin só traz `ToolExecutionContext.sessionId`, `ToolDescriptor.requiresCompleteResult` e `ModelCallPurpose` `COMPACTION`; o espelho Python expõe só `STOP_REASONS`, igual ao TypeScript); Python 33/33; débito P3 do REM21 sob PAR-A08 no 0380.
- `540c57295` conflitos semânticos achados pela suíte completa: fixtures da C03 registram hooks por `coreHook`; DSN de teste da C03 sem a palavra `postgres` (scan do `dependency-direction`); 5 snapshots de replay ganham `sessionId` sintético (`ToolExecutionContext.sessionId`); S6 de esquema legado inclui a 0035 (o store escreve as colunas de origem; falha fechada, não perde a origem).
- `1c2e5519a` religa `SKIP-PG-040` (5 pulados sem banco).
- `150f4c739` ledgers: linhas da C03 e do híbrido (script da D9), mais as da 0291 e da onda 6.

## Gates
- typecheck: PASS. eslint: PASS. prettier: PASS. `docs:check-links`: PASS (`EVIDENCE_HYGIENE_OK`).
- `skip:governance`: PASS (57 entradas, 0 divergências). `mutation:guard`: 10 mortos, 0 sobreviventes.
- gitleaks 8.28.0 sobre os commits novos (`97f81204d..`): sem vazamentos.
- Suíte completa com cobertura por arquivo (`npm run test:coverage:per-file`, PG 16.15 real de 4 GiB, `CVG_COVERAGE_PER_FILE=1`): 637 arquivos, 9551 testes, 0 falhas; `[core-coverage] PASS` (agregado stmts 93,88, branches 90,87, funções 95,25, linhas 94,87).
- `certification/` restaurada (git limpo).

## Ambiente (sem mudança de repositório)
Rodadas locais com `--testTimeout/--hookTimeout=240000` (a barra usa os valores da casa).
- Rodada 1: 2 testes de DDL do `postgres-persistence-mode` estouraram 120 s sob carga; passam isolados.
- Rodada 3: PG com `fsync=off` faz o preflight de durabilidade da S01 recusar o banco (115 falhas em 8 arquivos de sessão): o guarda funcionou; PG refeito com a durabilidade padrão.
- Rodada 5: `tests/claude100/reference-port/cli-entry.test.js` (SIGINT durante o import da CLI) falhou uma vez; o filho tem prazo de 3 s e o teste é sensível à carga (passou 1 de 3 sozinho com load de 6 a 7). Arquivo não tocado pela onda. A rodada 6 usou `--retry=1`, só local, e terminou verde sem novas falhas.
