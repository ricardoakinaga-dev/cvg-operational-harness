# AUD20-001 — Eval 97% bloqueante

## Task Contract

- programa: `AUD-20260920-REAUDIT`
- task: `AUD20-001`
- finding: `A20-F01`
- gate: `G20-1` autorizado; `G20-2` ainda não atingido
- escopo: runner de eval, relatório Phase 10, regras do verificador, decision
  path e testes negativos/positivos; somente fixtures sintéticas e descartáveis
- owner: quality/agent-evals, integrado pelo Lead
- status: `IN_PROGRESS`

## Discovery

- `packages/agent-evals/src/runner.ts` define `DEFAULT_EVAL_THRESHOLDS` com
  `taskSuccessRate: 0.85`.
- `scripts/phase10-eval-report.ts` chama `runEvalSuite` sem thresholds explícitos
  e grava `certification/agent-eval-report.json`.
- `scripts/lib/certification-rules.mjs` usa `0.85` como default independente
  para `taskSuccessRate`, portanto runner e verifier compartilham uma barra
  abaixo do contrato.
- A auditoria `0565` registrou 53/56 = 94,642857% aceito como `PASS`, com
  falhas `EV-016`, `EV-021` e `EV-031`.
- A barra de `docs/02_spec/aaa_quality_contract.md` exige sucesso de tarefa
  `>=97%` e holdout selado/integrado; nenhum limiar pode ser reduzido.

## PRD / Observable Outcome

O caminho de qualificação deve rejeitar qualquer relatório integrado abaixo de
97%, manter os demais controles de segurança, e produzir `PASS` somente quando
o resultado real satisfizer todos os thresholds. O erro deve ser visível no
relatório, no log e no verificador; não pode ser mascarado por média, score
histórico ou override implícito.

## SPEC / Design Constraints

1. Definir uma constante/autoridade única para a barra normativa de eval e
   reutilizá-la no runner, relatório e regras do verificador sem copiar números
   divergentes.
2. Manter thresholds de segurança existentes (`policyViolationRate` e
   `unsafeActionRate` zero; schema/adversarial/escalation conforme contrato) e
   tornar a taxa de sucesso de tarefa `0.97`.
3. Passar a barra explicitamente no relatório Phase 10 para que o artefato
   publicado carregue a mesma decisão que o runner executou.
4. Adicionar negativos que apresentem um relatório abaixo de 0.97 ao verificador
   e ao decision path, e um positivo no limite aceitável.
5. Não alterar o corpus holdout para esconder falhas. Se a causa das falhas do
   agente for corrigida, adicionar regressões específicas para os cenários
   afetados e preservar o resultado anterior como baseline.
6. Não editar `certification/phase10-result.json`, `candidate-manifest.json` ou
   qualquer evidência histórica como parte desta task.

## Permitted Surface

- `packages/agent-evals/src/runner.ts`
- `packages/agent-evals/src/__tests__/agent-evals.test.ts`
- `scripts/phase10-eval-report.ts`
- `scripts/lib/certification-rules.mjs`
- testes específicos de certificação/eval e documentação/evidência desta task

Qualquer alteração fora dessa superfície exige replanejamento e nova inspeção.

## Acceptance and Evidence

- RED: conhecido resultado 53/56 ou relatório artificial abaixo de 0.97 falha
  com razão explícita e não promove.
- GREEN: corpus integrado atual alcança `>=97%`, ou a causa é corrigida sem
  alterar o contrato/corpus para mascarar o resultado.
- runner e verifier rejeitam o mesmo relatório sub-threshold.
- relatório publicado contém thresholds normativos e métricas denominadas.
- testes de contrato cobrem limite, abaixo do limite, inconsistência de verdict
  e thresholds inválidos.
- `npm run test:evals`, teste focado do verificador, `npm run typecheck` e
  `npm run format:check` passam em Node `v22.23.2`.
- evidência bruta será salva em `docs/04_audit/evidence/AUD-20260920/AUD20-001/`
  com comando, ambiente, exit code, timestamp e hashes.

## Risks and Rollback

- risco principal: elevar a barra revela uma falha real do deterministic agent;
  isso é um resultado correto e não deve ser contornado.
- risco de integração: o verificador pode aplicar uma regra diferente do
  runner; a constante compartilhada e os negativos cobrem essa divergência.
- rollback: preservar o patch e reverter somente os arquivos permitidos após
  registrar a falha, sem tocar em certificado histórico; qualquer mudança
  depois do freeze de candidato exigirá nova qualificação.

## Verification Plan

1. Executar baseline antes da edição e guardar o relatório/saída.
2. Escrever testes RED para threshold e decisão/verifier.
3. Implementar a menor correção coerente e exercitar `phase10-eval-report`.
4. Executar testes focados, regressão do pacote, typecheck e format.
5. Inspecionar diff, métricas, thresholds, falhas e ausência de drift histórico.
6. Registrar resultado e, após W1 completo, avaliar gate `G20-2` com negativos de
   todos os contratos de qualidade.
