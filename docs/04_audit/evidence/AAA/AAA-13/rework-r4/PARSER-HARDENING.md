# AAA-13 rework R4 — endurecimento dos parsers de resultado bruto

- Findings: `AAA13-C5-F01` (coverage) e `AAA13-C5-F02` (chaos); rework apenas destes parsers.
- Paths reservados alterados: `scripts/lib/certification-rules.mjs` e `scripts/phase10-verify.mjs`. `scripts/phase10-certify.mjs` **não** precisou de mudança (hash idêntico ao baseline).
- `package.json`/lockfile, contratos, produto de outras frentes e registros compartilhados **não** foram tocados. Nenhum full certify, Docker, benchmark ou deploy.
- `AAA13-C3-F01` (evidência ausente) permanece fechado; a matriz de evidência obrigatória foi preservada.

## 1. REDs reproduzidos (antes do fix)

Harness fiel ao `reproduce.py` do coordenador, porém gravando apenas em `rework-r4/` (os artefatos do coordenador não foram modificados).

- R1 — coverage `statements: {}` sem `pct`, métricas declaradas preservadas → CLI **aceitou**: `observed: ACCEPTED`, `failures: []`, exit 0. Causa: `Math.abs(declarado - undefined)` produzia `NaN` e a comparação de tolerância não detectava a ausência.
- R2 — 14 assertions `skipped`, métricas `executed=14, passed=0, failed=0` → CLI **aceitou**: `observed: ACCEPTED`, `failures: []`. Causa: `status !== 'pending'` contava `skipped` como execução e a ausência de `failed` era tratada como aprovação.
- Evidência RED: `red-r1r2.log` (saída do harness, exit 1 porque R1/R2 são ACCEPTED) e `adversarial-results.json` do coordenador (JSON completo preservado em `review-coordinator-rework-r3/`).

## 2. Correção aplicada

### 2.1 Coverage (`AAA13-C5-F01`)

Antes de qualquer comparação/tolerância, cada dimensão (`statements`, `branches`, `functions`, `lines`) passa por:

1. presença de objeto de dimensão → `coverage_raw_invalid:coverage:<key>:missing`;
2. `pct` finito (`Number.isFinite`) → `coverage_raw_invalid:coverage:<key>:not_finite`;
3. intervalo `0 ≤ pct ≤ 100` → `coverage_raw_invalid:coverage:<key>:out_of_range`.

Somente com `pct` válido os valores declarados são comparados: métrica do gate inválida → `coverage_gate_metrics_invalid:<key>`; divergência → `coverage_metrics_mismatch:coverage:<key>`; métrica do resultado inválida → `coverage_result_metrics_invalid:<key>`; divergência → `coverage_result_metrics_mismatch:<key>`. O gate só passa com `exitCode=0` e todas as quatro dimensões válidas (avisos não compensam falhas). Nenhum piso de qualidade foi alterado.

### 2.2 Chaos (`AAA13-C5-F02`)

- Conjunto obrigatório derivado da suíte real: **CHAOS-01, 02, 03, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16** (14 cenários); **CHAOS-04/05** são opcionais porque o arquivo `chaos-postgres.test.ts` só executa com PostgreSQL. O conjunto fixo substitui "quaisquer 14 IDs".
- Estados suportados: `passed`, `failed`, `pending`, `skipped`, `todo`. Somente `passed`/`failed` contam como execução. Estado ausente/desconhecido → `chaos_raw_invalid:unknown_status:<id>:<estado>`; ID fora do inventário → `chaos_raw_invalid:unknown_scenario:<id>`.
- Cenário obrigatório `skipped`/`pending`/`todo` → `chaos_raw_invalid:not_executed:<id>:<estado>` **e** `chaos_required_not_passed:<id>`; ausente → `chaos_raw_invalid:missing:<id>` + `chaos_required_not_passed:<id>`.
- Duplicata de ID → `chaos_raw_invalid:duplicate:<id>` (falha dominante preservada: qualquer `failed` entre duplicatas mantém o cenário como falho).
- Zero aprovados → `chaos_raw_invalid:zero_passed`; executados abaixo dos 14 obrigatórios → `chaos_below_minimum:<n>`; falhas → `chaos_failed:<n>`/`chaos_failed:<id>`.
- Contadores derivados (`executed`, `passed`, `failed`, `notExecuted`) comparados com as métricas declaradas → `chaos_metrics_mismatch:<campo>`.
- Aprovação exige `exitCode=0`, nenhum estado malformado, zero falhas, 14 obrigatórios aprovados e executados.

### 2.3 Mesma classe nos demais parsers (item 4 do briefing)

| Parser              | Situação                                                                     | Ação                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| evals               | taxas comparadas com coerção de string (`"0.98" >= 0.85` passava)            | FIXADO: `scenarios` inteiro > 0; cada taxa finita em [0,1]; thresholds finitos; códigos `evals_raw_invalid:<campo>` e `evals_raw_invalid:threshold:<campo>` |
| load                | `events > 0` e `processed === events` aceitavam strings                      | FIXADO: inteiros não negativos; `load_raw_invalid:<campo>`                                                                                                  |
| restore             | `typeof restoreMs === 'number'` aceitava `NaN`/string em campos não checados | FIXADO: `Number.isFinite(restoreMs) && >= 0`; `restore_raw_invalid:restoreMs`                                                                               |
| licenses            | `total > 0` aceitava string; contadores sem validação de tipo                | FIXADO: inteiros não negativos; `licenses_raw_invalid:<campo>`                                                                                              |
| vitest / playwright | contadores derivados por regex; aprovação exige `passed>0` e `failed===0`    | sem defeito comprovado; débito registrado: o resumo playwright casa linhas em qualquer parte do log                                                         |
| sbom                | comparações estritas (`bomFormat`, `components.length`)                      | sem defeito de coerção; débito registrado: forma dos componentes não é validada                                                                             |
| security            | exige `exitCode=0` + texto `found 0 vulnerabilities`                         | sem defeito comprovado; débito registrado: depende de texto humano, não de JSON bruto de audit                                                              |
| exit_code           | somente `# exitCode` do cabeçalho                                            | sem defeito de coerção; limites de confiança já declarados                                                                                                  |

Débitos registrados sem correção nesta task (não comprovados por teste e fora do escopo).

## 3. GREEN

- Harness R1/R2 reexecutado nos bytes finais: R1 rejeitado com `coverage_raw_invalid:coverage:statements:not_finite` (+ `gate_raw_failure`, `gate_status_mismatch`); R2 rejeitado com `chaos_raw_invalid:not_executed:*`, `chaos_raw_invalid:missing:CHAOS-15/16`, `chaos_raw_invalid:zero_passed`, `chaos_below_minimum:0`; harness exit **0**, `verdict PASS`.
- Self-test completo: **37/37** checks (`N1–N9` helper, `C0` positivo, `C1–C9` R3, `C10–C17` coverage, `C18–C23` chaos, `C24–C27` demais parsers), exit 0.
- Controle positivo `C0`: fixture completa com formato real do runner (16 cenários chaos, 14 obrigatórios aprovados + 2 opcionais skipped) → CLI exit 0 / `current candidate qualified`.
- O `qualification-probe.mjs` do coordenador (AAA13-C3-F01) continua rejeitado: exit 1.
- Histórico: exit 0, 27 hashes, `HISTORICAL_COHERENCE`; certificado legado no modo atual: exit 1 (esperado).
- O marcador de injeção `const verdict = checks.every` foi preservado para o `reproduce.py` do coordenador continuar funcionando.

## 4. Casos e códigos

| Caso | Ataque                                 | Código esperado                                 | Observado         |
| ---- | -------------------------------------- | ----------------------------------------------- | ----------------- |
| C10  | coverage `statements` sem `pct` (R1)   | `coverage_raw_invalid:coverage:statements`      | REJECTED          |
| C11  | `pct` string numérica                  | `coverage_raw_invalid:coverage:statements`      | REJECTED          |
| C12  | `pct` null                             | `coverage_raw_invalid:coverage:statements`      | REJECTED          |
| C13  | `pct` objeto em branches               | `coverage_raw_invalid:coverage:branches`        | REJECTED          |
| C14  | `pct` negativo em functions            | `coverage_raw_invalid:coverage:functions`       | REJECTED          |
| C15  | `pct` > 100 em lines                   | `coverage_raw_invalid:coverage:lines`           | REJECTED          |
| C16  | métrica declarada do resultado diverge | `coverage_result_metrics_mismatch:statements`   | REJECTED          |
| C17  | métrica declarada do gate diverge      | `coverage_metrics_mismatch:coverage:statements` | REJECTED          |
| C18  | todos os chaos skipped (R2)            | `chaos_raw_invalid`                             | REJECTED          |
| C19  | cenário obrigatório pending            | `chaos_required_not_passed:CHAOS-02`            | REJECTED          |
| C20  | duplicata escondendo skip              | `chaos_raw_invalid:duplicate:CHAOS-01`          | REJECTED          |
| C21  | status desconhecido                    | `chaos_raw_invalid:unknown_status:CHAOS-01`     | REJECTED          |
| C22  | zero aprovados                         | `chaos_raw_invalid:zero_passed`                 | REJECTED          |
| C23  | métricas de chaos divergentes          | `chaos_metrics_mismatch:executed`               | REJECTED          |
| C24  | load `events` string                   | `load_raw_invalid:events`                       | REJECTED          |
| C25  | restore `restoreMs` string             | `restore_raw_invalid:restoreMs`                 | REJECTED          |
| C26  | evals `taskSuccessRate` string         | `evals_raw_invalid:taskSuccessRate`             | REJECTED          |
| C27  | licenses `total` string                | `licenses_raw_invalid:total`                    | REJECTED          |
| C0   | controle positivo completo             | `current candidate qualified`                   | ACCEPTED (exit 0) |

Todos os negativos usam o **CLI público** em fixture isolada com hashes coerentes; o caso só passa se o código esperado aparece (falha incidental não vale). N1–N9/`C1–C9` continuam PASS.

## 5. Comandos e exit codes

| Comando                                         | Exit | Resultado                                    |
| ----------------------------------------------- | ---- | -------------------------------------------- |
| `node …/rework-r4/reproduce-r1r2.mjs` (pré-fix) | 1    | R1/R2 ACCEPTED (RED)                         |
| `node …/rework-r4/reproduce-r1r2.mjs` (pós-fix) | 0    | R1/R2 REJECTED; 37/37                        |
| `npm run certification:self-test`               | 0    | 37/37; `verdict PASS`                        |
| `npm run certification:verify:historical`       | 0    | 27 hashes; histórico                         |
| `npm run certification:verify`                  | 1    | legado não vincula o candidato atual         |
| probe AAA13-C3-F01 (pós-fix)                    | 1    | contraexemplo de evidência ausente rejeitado |
| `npm run lint` / `npm run typecheck`            | 0    | —                                            |
| `npm test`                                      | 0    | 181 arquivos / 948 testes PASS; 4/27 skips   |
| `npm run test:coverage`                         | 0    | 86,66 / 81,77 / 90,01 / 87,74                |

## 6. Limitações

- Sem full certify, Docker, benchmark ou signoff humano; nenhum certificado atual foi gerado.
- Limite de confiança mantido: hashes e vínculo de execução detectam adulteração/mistura, não autenticam produtor que controla todos os arquivos.
- O conjunto obrigatório de chaos está fixado em código (`CHAOS_REQUIRED_SCENARIOS`); se a suíte mudar IDs, o conjunto precisa ser atualizado com nova evidência.
- Débitos registrados em §2.3 permanecem abertos e não foram ampliados nesta task.
- `diff-vs-head.patch` inclui as rodadas anteriores ainda não commitadas; a identidade desta rodada é `baseline-hashes.txt` × `current-hashes.txt`.
