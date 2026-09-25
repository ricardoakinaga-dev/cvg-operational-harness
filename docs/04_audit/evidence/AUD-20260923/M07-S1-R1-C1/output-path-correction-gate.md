# Gate proposto — alinhar outputs C1 ao allowlist do scanner (M07-S1-R1-C1E)

## Decisão solicitada

Aprovar ou corrigir este gate e o [preview](output-path-correction-preview.md) pelos seus SHAs integrais. A aprovação C1 anterior não cobre alterações no scanner, policy ou testes do scanner, nem uma nova tentativa. Até uma aprovação específica, não editar esses paths e não executar comandos de BUILD.

## Causa observada e previsão estática

- O gate C1 aprovado exige outputs em `docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1/`. O freeze executado dentro desse escopo terminou exit `64`; seu stderr está em [candidate-freeze.stderr.log](candidate-freeze.stderr.log).
- Em `scripts/workspace-dependency-audit.mjs:1835-1838`, `validateOutputPath` aceita somente `M07-BUILD-S1` e `M07-S1-R1`; `M07-S1-R1-C1` é rejeitado antes da gravação do candidate.
- Outra incompatibilidade, identificada apenas por leitura, está em `scripts/workspace-dependency-audit.mjs:1421-1423`: `validateExecutionCandidate` exige que o argumento e a policy usem `M07-S1-R1/npm-version.txt`, enquanto o gate C1 exige `M07-S1-R1-C1/npm-version.txt`. Esse erro não foi executado; após corrigir o primeiro allowlist, a entrada npm ainda seria recusada.
- A SPEC M07 define que o CLI grava em path de evidência explicitamente selecionado e não introduz serviço. O gate C1 escolheu um path seguro dentro do repositório. Este slice alinha a implementação a esse contrato, sem ampliar a capacidade além de um diretório nomeado ou relaxar os controles de symlink/traversal.

## Task e escopo

- Task proposta: `A24-03-C1E`; registrar em `docs/03_build/0344_reaudit_m07_backlog.md` somente após aprovação e antes de qualquer edição.
- Paths de código/configuração editáveis: `config/workspace-dependency-policy.json`, `scripts/workspace-dependency-audit.mjs`, `tests/workspace-dependency-audit.test.js`, conforme o [preview](output-path-correction-preview.md).
- O fixture já alterado em `packages/conversation/src/__tests__/postgres-store.unit.test.ts` permanece somente leitura neste gate e deve corresponder à correção preservada em [C1](final-gate-result.md).
- Evidências da nova tentativa: diretório novo e de uso único `docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/`; não reutilizar nem sobrescrever a tentativa C1 interrompida.
- Candidate esperado: 977 inputs; os mesmos quatro paths de delta aprovados em R1 (policy, scanner, teste do scanner e fixture conversacional); toolchain capturada no próprio diretório C1E. O inventário esperado permanece completo, com 11 findings visíveis e zero gaps/unresolved. Exit 1 de domínio é `PASS_WITH_FINDINGS` para B3, não conformance limpa.
- Sem alteração no adapter de produção, outros manifests, thresholds, configuração Vitest/coverage, CI, `.nvmrc`, histórico M07-S1/R1, dados reais, serviços, banco, rede, ações sensíveis ou produção.

## Procedimento condicionado à aprovação

1. Registrar `A24-03-C1E` em 0344, com a decisão e paths exatos, antes do código. Abrir shell novo com `/home/ricardo/.nvm/versions/node/v22.23.2/bin` no início do `PATH`; executar separadamente `node --version` e `node -p "require('typescript').version"`, registrando exits. Parar se Node não for `v22.23.2` ou TypeScript local não resolver.
2. Confirmar `test ! -e docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1E`. Criar a pasta única, registrar `npm --version`, criar `rollback-baseline`, copiar os três paths autorizados para snapshots e gerar `rollback-baseline.sha256`. Se a pasta existir ou qualquer comando falhar, parar e preservar tudo.
3. Aplicar exatamente o preview nos três paths. Não tocar no fixture C1 já corrigido. Congelar o candidate:

   ```sh
   node scripts/workspace-dependency-audit.mjs --candidate-only --npm-version-file docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/npm-version.txt --format json --output docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/execution-candidate-manifest.json
   ```

4. Executar separadamente, com logs stdout/stderr sanitizados, duração e exit imediato, os comandos restantes:

   ```sh
   node scripts/workspace-dependency-audit.mjs --verify-candidate docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/execution-candidate-manifest.json --npm-version-file docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/npm-version.txt
   node scripts/workspace-dependency-audit.mjs --policy config/workspace-dependency-policy.json --profile inventory --format json --output docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/workspace-dependency-report.json
   node -e 'const fs=require("node:fs");const m=JSON.parse(fs.readFileSync("docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/execution-candidate-manifest.json","utf8"));const r=JSON.parse(fs.readFileSync("docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/workspace-dependency-report.json","utf8"));const expected=m.candidate_fingerprint_sha256;const actual=r.candidate?.fingerprint;console.log(JSON.stringify({expected,actual,match:expected===actual}));if(expected!==actual)process.exitCode=1;'
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm test -- tests/workspace-dependency-audit.test.js tests/architecture/dependency-direction.test.ts packages/conversation/src/__tests__/postgres-store.unit.test.ts
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm test
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run typecheck
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run lint
   env -u DATABASE_URL -u TEST_DATABASE_URL -u PGHOST -u PGPORT -u PGDATABASE -u PGUSER -u PGPASSWORD npm run test:coverage -- --coverage.reportsDirectory docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/coverage
   node scripts/workspace-dependency-audit.mjs --verify-candidate docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/execution-candidate-manifest.json --npm-version-file docs/04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/npm-version.txt
   ```

   Remover as variáveis PostgreSQL nos comandos de teste. Thresholds imutáveis: statements ≥90%, branches ≥85%, functions ≥90%, lines ≥90%. Inventário exit 1 completo com 11 findings é esperado para B3; gaps/unresolved ou exits 2/64 reprovam.
5. Solicitar I1 fresh-context sobre o mesmo candidate e registros. Se indisponível, registrar `UNAVAILABLE`; manter S1 aberta. Após a tentativa, atualizar resultado/evidências, 0343/0344, `docs/30_backlog_master.md`, `docs/20_master_execution_log.md` e `docs/99_runtime_state.md` na ordem documentada. Produção continua `NO_GO`.

## Critérios de aceite e rollback

- O preview é a única mudança de conteúdo nos três paths autorizados. O candidate tem exatamente 977 inputs e os quatro paths de delta aprovados; seu fingerprint é recalculável e npm/Node/TypeScript estão vinculados à tentativa C1E.
- O path C1E passa sem enfraquecer rejeição de path traversal, symlink, extensão ou diretório não aprovado. O teste do scanner prova o diretório exato e rejeita um nome não aprovado.
- Report, comando, manifesto, checks e pós-check apontam ao mesmo candidate; coverage usa a barra 90/85/90/90; findings permanecem visíveis.
- Qualquer falha ou indisponibilidade de I1 mantém S1 `FAIL / OPEN`. Não reutilizar a pasta C1 original nem reduzir thresholds.
- Rollback local, se necessário: executar pós-check do candidate; somente se não houver drift, validar `sha256sum -c .../rollback-baseline.sha256`, restaurar os três paths a partir dos snapshots e comparar cada um com `cmp`. Preservar todos os outputs. O fixture conversacional C1 não faz parte do rollback deste gate.
- Sem `git checkout`, `git reset`, `git clean`, limpeza de evidências, serviço, banco, rede externa, dados reais ou produção.

## Confirmação requerida

Este gate exige aprovação específica do SHA-256 integral do proposal e do preview; a aprovação C1 anterior não cobre estes três paths. Resposta solicitada: **“Aprovo exatamente o gate M07-S1-R1-C1E, SHA-256 `<hash integral do proposal>`.”**
