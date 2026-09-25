# Pedido de gate corretivo — M07-S1-R1-C1F

## Decisão recebida

O usuário respondeu **“aprovo este gate”** após a proposta C1F e seu limite de quatro paths terem sido apresentados. A decisão e os hashes dos bytes persistidos estão em [decision-record.md](decision-record.md). A aprovação não fecha M07-S1, não substitui I1 e não libera S2/S3/S4, M05, produção ou qualquer ação externa.

## Motivo e limite

- C1E congelou o fingerprint `58dce96bb29255f77bc99c4f883f8205e4272c2a94cb26d34f10b395ab042501`, mas focused/full tests e coverage falharam no caso de resume com `approvalId='different-approval'`; I1 ficou `UNAVAILABLE`.
- O teste atual espera `WAITING_APPROVAL`, enquanto `assertExecutionClaimFresh` rejeita aprovação divergente com `STATE_CONFLICT` e `state.test.ts` já verifica rejeição para approval ID divergente.
- C1F muda apenas essa expectativa de teste. A alteração proposta mantém o caminho positivo de resume autenticado e não toca no runtime de produção.
- Como C1F usa pasta candidate nova, policy/scanner/teste do scanner também vinculam o npm version file e o allowlist ao path exato C1F. C1E e os paths históricos permanecem aceitos; nomes não aprovados, traversal e symlink continuam rejeitados.

## Task e escopo autorizado

- Task: `A24-03-C1F`, registrada em `docs/03_build/0344_reaudit_m07_backlog.md` antes de qualquer edição de código.
- Paths editáveis, conforme o [preview](correction-preview.md): `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs`, `tests/workspace-dependency-audit.test.js` e `packages/conversation/src/__tests__/postgres-store.unit.test.ts`.
- Outputs da rodada: somente `docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/`, incluindo snapshots e resultados.
- Candidate esperado: 977 inputs; os quatro paths acima são o delta de R1 aprovado. Toolchain observada localmente e npm version file ficam vinculados ao candidato C1F.
- Artefatos C1E, candidate R1, manifests e fixture histórico C1 são preservados. Nenhuma mudança em produto/runtime, outros manifests, lockfile, CI, `.nvmrc`, thresholds, Vitest config, serviços, banco, rede, dados reais, ações sensíveis ou produção.

## Sequência de execução

1. Abrir shell novo com `/home/ricardo/.nvm/versions/node/v22.23.2/bin` no início de `PATH`. Executar cada comando separadamente e capturar seu exit imediatamente:

   ```sh
   node --version
   node -p "require('typescript').version"
   npm --version
   ```

   Prosseguir somente com Node `v22.23.2` e TypeScript local resolvido.
2. Confirmar que `npm-version.txt`, `execution-candidate-manifest.json`, `workspace-dependency-report.json` e `rollback-baseline/` ainda não existem em `docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/`. A pasta contém este gate e o preview; isso não é evidência de execução. Se qualquer artefato de execução já existir, parar sem alterar código. Capturar npm e snapshots:

   ```sh
   npm --version > docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/npm-version.txt
   mkdir docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/rollback-baseline
   cp --parents config/workspace-dependency-policy.json scripts/workspace-dependency-audit.mjs tests/workspace-dependency-audit.test.js packages/conversation/src/__tests__/postgres-store.unit.test.ts docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/rollback-baseline/
   sha256sum docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/rollback-baseline/config/workspace-dependency-policy.json docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/rollback-baseline/scripts/workspace-dependency-audit.mjs docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/rollback-baseline/tests/workspace-dependency-audit.test.js docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/rollback-baseline/packages/conversation/src/__tests__/postgres-store.unit.test.ts > docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/rollback-baseline.sha256
   cp docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/capture_command.py docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/capture_command.py
   ```
3. Aplicar exatamente o [preview](correction-preview.md). Não alterar fonte de produção nem outras expectativas. Congelar o candidate com este comando:

   ```sh
   node scripts/workspace-dependency-audit.mjs --candidate-only --npm-version-file docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/npm-version.txt --format json --output docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/execution-candidate-manifest.json
   ```

4. Executar separadamente os comandos de verificação, inventário e comparação. A semântica esperada de inventário é `PASS_WITH_FINDINGS`: completo, 11 achados (nove `DEPENDENCY_CATEGORY_MISMATCH`, dois `MISSING_DIRECT_DEPENDENCY`), `gaps=[]`, `unresolved=0`. Exit 1 é o exit de findings; exit 2/64, gaps ou resultado sem candidate reprovam.

   ```sh
   node scripts/workspace-dependency-audit.mjs --verify-candidate docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/execution-candidate-manifest.json --npm-version-file docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/npm-version.txt
   node scripts/workspace-dependency-audit.mjs --policy config/workspace-dependency-policy.json --profile inventory --format json --output docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/workspace-dependency-report.json
   node -e 'const fs=require("node:fs");const m=JSON.parse(fs.readFileSync("docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/execution-candidate-manifest.json","utf8"));const r=JSON.parse(fs.readFileSync("docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/workspace-dependency-report.json","utf8"));const expected=m.candidate_fingerprint_sha256;const actual=r.candidate?.fingerprint;console.log(JSON.stringify({expected,actual,match:expected===actual}));if(expected!==actual)process.exitCode=1;'
   ```
5. No mesmo candidate e sob Node 22.23.2, executar os comandos autorizados abaixo, cada um separadamente, com variáveis PostgreSQL removidas nos comandos de teste. Usar `capture_command.py` copiado para a pasta C1F (ou captura equivalente) para preservar stdout/stderr, timestamps, duração e exit code imediatamente; completar skips e revisão de sanitização em `command-records.json`:

   ```sh
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm test -- tests/workspace-dependency-audit.test.js tests/architecture/dependency-direction.test.ts packages/conversation/src/__tests__/postgres-store.unit.test.ts
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm test
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run typecheck
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run lint
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run test:coverage -- --coverage.reportsDirectory docs/04_audit/evidence/AUD-20260924/M07-S1-C1F/coverage
   ```

   Coverage thresholds remain statements ≥90%, branches ≥85%, functions ≥90%, lines ≥90%. No threshold reduction, exclusions, or skip changes are allowed.
6. Execute candidate post-check even if a local quality command fails, provided no drift or external access occurred. Compare post-check, inventory, coverage and command records to the exact candidate; preserve failures without patching evidence to force agreement.
7. Request a fresh-context, read-only I1 review of the frozen candidate and records. If unavailable, record `UNAVAILABLE`; no self-review substitutes. M07-S1 remains `FAIL / OPEN` if any critical criterion or I1 is unresolved.
8. Update evidence, then `0343`, `0344` and `docs/30_backlog_master.md`, then `docs/20_master_execution_log.md`, and `docs/99_runtime_state.md` last. Record the actual result; retain production `NO_GO`.

## Parada e recuperação

- Qualquer hash drift, falha de precondition, Node incorreto, saída inesperada ou tentativa de DB/serviço/rede externa interrompe a sequência dependente e fica registrada.
- Rollback local somente após verificar candidate/post-check e validar os hashes contra `rollback-baseline.sha256`; restaurar exclusivamente os quatro paths autorizados e confirmar byte a byte. Manter toda a evidência das tentativas.
- Sem `git checkout`, `git reset`, `git clean`, remoção de evidências, dados reais, ações sensíveis ou produção.

## Critério de aceite

Candidate/report/checks/post-check precisam corresponder ao mesmo fingerprint, os testes focados e completos, typecheck, lint e coverage precisam passar nos thresholds congelados e I1 precisa aceitar o mesmo candidate sem achado material. Qualquer falha mantém S1 `FAIL / OPEN` e exige nova decisão antes de outra mudança. G21-5/G21-6 continuam fechados.
