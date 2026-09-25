# Pedido de gate corretivo — M07-S1-R1-C1

## Decisão solicitada

Aprovar ou corrigir este gate para reparar o fixture do teste sintético que falhou em M07-S1-R1, gerar um novo candidato e repetir a matriz local de verificação. A aprovação R1 anterior não cobre esta nova edição/candidatura. Nenhum código ou teste deste gate foi executado. O [preview do fixture](correction-preview.md), SHA-256 `9d7fc894b728967aaa4f0949bc5dc8ae466d31ecc616fe9a902a58859ebb0c17`, mostra a alteração proposta, ainda não aplicada. Este hash integra o escopo solicitado pelo gate.

## Evidência e causa

- Gate anterior: SHA-256 `75a9967b1ad7dfc426fccd1a5cabb2a9e29f2a937188e33605e2ddb03c4b3fc1`.
- Candidato R1 preservado: `1038f996b0577e56ecd795f1f08b6e13bb3a752d454c80f3fc0601f51c045b5f`.
- Resultado R1: testes focados, suíte completa e coverage falharam em `reports in-flight, expired, raced, approval-waiting and conflicting claims`; typecheck/lint e pós-check passaram. O registro completo permanece em [final-gate-result.md](final-gate-result.md).
- Uma segunda solicitação fresh-context I1 foi recusada pelo serviço por limite de threads; [registro da tentativa](i1-attempt-02.md). I1 permanece `UNAVAILABLE`.
- A falha ocorre na retomada autenticada: o teste chama `claimExecution` com `approvalResume` válido, mas o `working_memory` sintético do session row não contém `pendingProposal` com estado `PENDING_APPROVAL` nem `pendingApproval` ligado ao mesmo approval, proposal hash, operation key e execution ID. `assertExecutionClaimFresh` então rejeita corretamente o resume com `STATE_CONFLICT`.

## Alteração proposta

Alterar somente o fixture do teste `packages/conversation/src/__tests__/postgres-store.unit.test.ts`, conforme o preview ligado acima. A sessão usada nos cenários de retomada deve conter uma proposta pendente e a aprovação correspondente, todos com IDs/hash/chave iguais aos argumentos do claim. Preservar o caso negativo de aprovação diferente e o caso positivo autenticado. A mudança corrige o estado do double de teste; não altera o adapter nem relaxa a validação de produção.

## Escopo autorizado se aprovado

1. Único path de teste/código editável: `packages/conversation/src/__tests__/postgres-store.unit.test.ts`.
2. Outputs e registros da nova tentativa: `docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/`, diretório novo e de uso único.
3. Antes de qualquer edição de código, registrar a task `A24-03-C1` em `docs/03_build/0344_reaudit_m07_backlog.md`, com este gate, o único path editável e seus critérios. Essa inclusão é autorizada somente após aprovação deste gate.
4. Depois dos checks, atualizar o resultado/evidências e reconciliar somente estes documentos: `docs/03_build/0343_reaudit_m07_roadmap.md`, `docs/03_build/0344_reaudit_m07_backlog.md`, `docs/30_backlog_master.md`, `docs/20_master_execution_log.md` e `docs/99_runtime_state.md`. Ordem final: evidências primeiro; roadmap e backlogs em seguida; execution log depois; runtime state por último.
5. Manter configuração, manifests, código de produto, CI, `.nvmrc`, barra histórica e evidências M07-S1/R1 inalterados. S2/S3/S4, M05, serviços, banco, rede, dados reais, ações sensíveis e produção seguem fora de escopo.

## Sequência proposta

1. Abrir shell novo com `/home/ricardo/.nvm/versions/node/v22.23.2/bin` no início do `PATH`, sem trocar o NVM default. Executar cada comando abaixo separadamente e registrar seu exit code imediatamente com `printf 'previous_exit=%s\n' "$?"`. Parar se Node não for `v22.23.2` ou se TypeScript local não resolver.

   ```sh
   node --version
   node -p "require('typescript').version"
   ```

2. Antes de editar, verificar o candidato R1 existente e confirmar que o diretório C1 ainda não existe. Em qualquer divergência, parar sem editar.

   ```sh
   node scripts/workspace-dependency-audit.mjs --verify-candidate docs/04_audit/evidence/AUD-20260923/M07-S1-R1/execution-candidate-manifest.json --npm-version-file docs/04_audit/evidence/AUD-20260923/M07-S1-R1/npm-version.txt
   test ! -e docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1
   ```

3. Preparar outputs de uso único e snapshot do único arquivo editável. Executar cada linha separadamente; se qualquer uma falhar, preservar a pasta parcial e parar.

   ```sh
   mkdir docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1
   npm --version > docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/npm-version.txt
   mkdir docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/rollback-baseline
   cp packages/conversation/src/__tests__/postgres-store.unit.test.ts docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/rollback-baseline/postgres-store.unit.test.ts
   sha256sum docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/rollback-baseline/postgres-store.unit.test.ts > docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/rollback-baseline.sha256
   ```

4. Corrigir somente o fixture autorizado, depois congelar um manifesto novo. Deve conter exatamente 977 inputs, os mesmos quatro paths de delta aprovados para R1 e toolchain candidate-bound.

   ```sh
   node scripts/workspace-dependency-audit.mjs --candidate-only --npm-version-file docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/npm-version.txt --format json --output docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/execution-candidate-manifest.json
   ```

5. Verificar o JSON persistido, gerar inventário completo e comparar fingerprints; executar cada comando separadamente e capturar exit imediatamente.

   ```sh
   node scripts/workspace-dependency-audit.mjs --verify-candidate docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/execution-candidate-manifest.json --npm-version-file docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/npm-version.txt
   node scripts/workspace-dependency-audit.mjs --policy config/workspace-dependency-policy.json --profile inventory --format json --output docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/workspace-dependency-report.json
   node -e 'const fs=require("node:fs");const m=JSON.parse(fs.readFileSync("docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/execution-candidate-manifest.json","utf8"));const r=JSON.parse(fs.readFileSync("docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/workspace-dependency-report.json","utf8"));const expected=m.candidate_fingerprint_sha256;const actual=r.candidate?.fingerprint;console.log(JSON.stringify({expected,actual,match:expected===actual}));if(expected!==actual)process.exitCode=1;'
   ```

   Preservar o resultado esperado `VIOLATION` com nove relações realmente test-only e dois vínculos ausentes visíveis; exit 1 completo é `PASS_WITH_FINDINGS` para B3, nunca conformidade limpa. Gap/unresolved ou exit 2/64 reprova B3.

6. Com as variáveis PostgreSQL removidas, executar cada comando separadamente no mesmo candidato e registrar stdout/stderr sanitizados, duração, skips e exit code imediato. Thresholds imutáveis: statements ≥90%, branches ≥85%, functions ≥90%, lines ≥90%.

   ```sh
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm test -- tests/workspace-dependency-audit.test.js tests/architecture/dependency-direction.test.ts packages/conversation/src/__tests__/postgres-store.unit.test.ts
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm test
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run typecheck
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run lint
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run test:coverage -- --coverage.reportsDirectory docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/coverage
   ```

7. Executar o pós-check mesmo que um check de qualidade falhe, desde que continue local e sem deriva.

   ```sh
   node scripts/workspace-dependency-audit.mjs --verify-candidate docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/execution-candidate-manifest.json --npm-version-file docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/npm-version.txt
   ```

   Comparar candidate/report/commands pelo mesmo fingerprint e registrar os resultados sem corrigir artefatos para forçar concordância.

8. Solicitar I1 fresh-context sobre o candidato e registros C1. Se o revisor estiver indisponível, registrar `UNAVAILABLE`; nenhuma revisão própria substitui I1. O M07-S1 permanece aberto/condicional sem aceite independente.
9. Atualizar os cinco documentos CVG listados acima na ordem indicada, registrando o resultado real, o próximo gate singular, histórico FAIL preservado e produção `NO_GO`.

## Critérios de parada e aceite

- Qualquer drift, Node incorreto, saída inesperada ou tentativa de acesso a DB/serviço/rede externa interrompe a etapa dependente e é registrada; não contornar o limite.
- A correção só passa se teste focal, suíte, typecheck, lint, todos os thresholds de coverage, comparação report/manifest e pós-check passarem no mesmo candidato, com I1 aceito. `UNAVAILABLE` mantém M07 aberto.
- Se qualquer check falhar, preservar R1 e C1, atualizar documentos CVG com o resultado real e preparar nova decisão; não marcar S1 como concluído nem avançar para M07-S2/S3/S4 ou M05.
- G21-5/G21-6 permanecem fechados e produção `NO_GO`.

## Confirmação

Este pedido deve ser aprovado pelo seu SHA-256 integral. A resposta necessária é: **“Aprovo exatamente o gate M07-S1-R1-C1, SHA-256 `<hash integral>`.”**
