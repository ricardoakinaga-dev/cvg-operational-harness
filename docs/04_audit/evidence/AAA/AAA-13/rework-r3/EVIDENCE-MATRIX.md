# AAA-13 / AAA13-C3-F01 — Matriz de evidência obrigatória por gate

- Task: `AAA-13` rework `R3`; finding: `AAA13-C3-F01` (P1).
- Base do rework: scripts revisados `certification-rules.mjs fdb816f6…`, `phase10-verify.mjs a60cdadb…`, `phase10-certify.mjs f95901f8…`.
- Resultado do rework: scripts `3b69b4df…`, `25f2a412…`, `46b024c8…` (hashes em `current-hashes.txt`).
- `package.json`/lockfile **não alterados** neste rework; `certification/` compartilhado não foi regenerado; certificado histórico byte-exact preservado.
- `diff-vs-head.patch` é o diff de `git` contra `HEAD` (inclui a entrega AAA-13 anterior, ainda não commitada, mais este rework); a identidade antes/depois deste rework está em `baseline-hashes.txt` × `current-hashes.txt`.

## 1. Objetivo e limite de confiança

O verificador público não pode qualificar um candidato apenas porque gates foram declarados `PASS`/`exit 0`. Cada gate obrigatório precisa de artefato bruto, vinculado ao mesmo `candidateId` e `runId`, e o resultado é **derivado** desses bytes.

**Limite de confiança (registrado):** hashes, `runId` e `candidateId` detectam alteração posterior e mistura de execuções; **não autenticam** um produtor que controla todos os arquivos do ambiente. Qualificação independente exige ambiente/processo separado ou autoridade humana. O verificador nunca produz signoff humano.

## 2. Matriz gate → evidência → parser → inventário → vínculo

| Gate                | Log obrigatório                         | Resultado bruto obrigatório            | Parser/derivação                                                                                         | Inventário/política de skip                                         |
| ------------------- | --------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| format              | `certification/logs/format.log`         | —                                      | `# exitCode` = 0                                                                                         | n/a                                                                 |
| typecheck           | `certification/logs/typecheck.log`      | —                                      | `# exitCode` = 0                                                                                         | n/a                                                                 |
| lint                | `certification/logs/lint.log`           | —                                      | `# exitCode` = 0                                                                                         | n/a                                                                 |
| build               | `certification/logs/build.log`          | —                                      | `# exitCode` = 0                                                                                         | n/a                                                                 |
| unit                | `certification/logs/unit.log`           | —                                      | resumo vitest: `Test Files`/`Tests`; falha > 0 ou 0 executados = reprovado                               | skips declarados + `skipJustification`; métricas conferem com o log |
| coverage            | `certification/logs/coverage.log`       | `coverage/coverage-summary.json`       | totais statements/branches/functions/lines derivados do JSON e iguais ao resultado                       | n/a                                                                 |
| security            | `certification/logs/security.log`       | —                                      | `found 0 vulnerabilities` + `# exitCode` 0                                                               | n/a                                                                 |
| worker_startup      | `certification/logs/worker_startup.log` | —                                      | `# exitCode` = 0                                                                                         | n/a                                                                 |
| e2e                 | `certification/logs/e2e.log`            | —                                      | resumo playwright `N passed/failed/skipped`                                                              | `skipPolicy: none` (qualquer skip reprova)                          |
| evals               | `certification/logs/evals.log`          | `certification/agent-eval-report.json` | veredicto recomputado de `metrics` × `thresholds`; `verdict` declarado tem de coincidir                  | n/a                                                                 |
| chaos               | `certification/logs/chaos.log`          | `certification/chaos-report.json`      | IDs `CHAOS-XX` únicos; executados ≥ 14; 0 falhas; contadores iguais ao resultado                         | n/a                                                                 |
| load                | `certification/logs/load.log`           | `certification/load-report.json`       | `events>0`, `processed=events`, `loss=0`, `duplicates=0`                                                 | n/a                                                                 |
| restore             | `certification/logs/restore.log`        | `certification/restore-report.json`    | `integrity.digestMatches=true`, `restoreMs` numérico                                                     | n/a                                                                 |
| sbom                | `certification/logs/sbom.log`           | `certification/sbom.cyclonedx.json`    | `bomFormat=CycloneDX`, componentes > 0                                                                   | n/a                                                                 |
| licenses            | `certification/logs/licenses.log`       | `certification/license-report.json`    | `deniedCount=0`, `unknownCount=0`, `unclassifiedCount=0`, `total>0`                                      | n/a                                                                 |
| postgres (ambiente) | `certification/logs/postgres.log`       | —                                      | vitest; `NOT_EXECUTED` permitido e mantém `CONDITIONAL_GO`; `PASS` exige inventário e `skipPolicy: none` | zero skips                                                          |

Vínculo obrigatório: o cabeçalho de cada log contém `# runId=… candidateId=… gate=… command=…` e `# exitCode=…`; esses valores têm de bater com `result.runId`/`manifest.runId`, `result.candidate.candidateId`/`manifest.candidateId` e o registro do gate. Cada item de evidência consta do manifesto com `sha256`/`size` iguais e `gateId` do dono.

## 3. Códigos de rejeição (derivados, não declarados)

`no_run_binding`, `run_id_mismatch_result_manifest`, `no_candidate_binding`, `candidate_id_mismatch_result_manifest`, `gate_log_missing:<gate>`, `gate_log_path_unexpected`, `gate_result_artifact_missing:<gate>:<path>`, `gate_evidence_not_manifested`, `gate_evidence_hash_mismatch`, `gate_evidence_wrong_owner`, `gate_log_hash_mismatch`, `gate_log_run_mismatch`, `gate_log_candidate_mismatch`, `gate_log_gate_mismatch`, `gate_log_exit_missing`, `gate_exit_code_mismatch`, `gate_status_mismatch`, `gate_raw_failure`, `gate_inventory_unparsable`, `gate_metrics_mismatch`, `mandatory_skip`, `undeclared_skips`, `duplicate_gate`, `duplicate_artifact`, `manifest_artifact_orphan`, `missing_environment_gate`, `security_raw_failure`, `coverage_totals_missing`, `coverage_metrics_mismatch`, `coverage_result_metrics_mismatch`, `evals_verdict_mismatch`, `evals_result_verdict_mismatch`, `chaos_failed`, `chaos_below_minimum`, `chaos_metrics_mismatch`, `load_inconsistent`, `load_metrics_mismatch`, `restore_integrity_failed`, `restore_metrics_mismatch`, `sbom_invalid`, `licenses_unresolved`, `unknown_gate`, `unknown_gate_kind`, `required_gate_not_pass`.

## 4. RED / GREEN e mapa finding → teste

- **RED (antes do fix):** `red-probe.out.txt` — CLI público saiu **0** e imprimiu `current candidate qualified` com `executedProductGates: 0`, `manifestArtifacts: 0`, `gateLogs: 0`. `--self-test` antigo passava (N1–N9). Baseline em `baseline-hashes.txt`.
- **GREEN (depois do fix):** `green-probe.out.txt` — CLI público saiu **1** e imprimiu `no_run_binding`, `gate_log_missing:<gate>` para todos os 15 gates e `missing_environment_gate:postgres`; o probe do coordenador falha a asserção porque o contraexemplo mudou.
- Self-test atual: `negative-validation.green.json` — **19/19** (`N1–N9` helper + `C0` controle positivo + `C1–C9` CLI), exit 0.

| Finding / ataque                              | Teste                                             |
| --------------------------------------------- | ------------------------------------------------- |
| `AAA13-C3-F01` — PASS declarado sem evidência | `C1` (manifesto vazio/evidência ausente)          |
| gate/log ausente                              | `C2`, `N5`                                        |
| status PASS com dados brutos de falha         | `C3`                                              |
| skip obrigatório escondido                    | `C4`, `N6`                                        |
| exit divergente                               | `C5`, `N7`                                        |
| evidência antiga (outro run)                  | `C6`, `N8`                                        |
| candidato divergente                          | `C7`                                              |
| gate/artefato duplicado                       | `C8`, `C9`                                        |
| fonte/config/contrato alterado                | `N1`, `N2`, `N3`, `N9`                            |
| controle positivo completo                    | `C0` (CLI exit 0 + `current candidate qualified`) |

Nenhum teste usa o certificado compartilhado: as fixtures são diretórios temporários com cópia real dos scripts, `git init` e `node_modules` linkado. O modo histórico não passou pela matriz e continua verificando o certificado Phase 10 preservado.

## 5. Comandos e exit codes

| Comando                                                          | Exit | Resultado                                                   |
| ---------------------------------------------------------------- | ---- | ----------------------------------------------------------- |
| `node …/review-coordinator-r3/qualification-probe.mjs` (pré-fix) | 0    | falso aceite reproduzido                                    |
| `node …/review-coordinator-r3/qualification-probe.mjs` (pós-fix) | 1    | contraexemplo rejeitado                                     |
| `npm run certification:self-test`                                | 0    | 19/19 checks, `verdict PASS`                                |
| `npm run certification:verify:historical`                        | 0    | 27 hashes, `HISTORICAL_COHERENCE`                           |
| `npm run certification:verify`                                   | 1    | certificado legado não vincula o candidato atual (esperado) |
| `npm run lint`                                                   | 0    | —                                                           |
| `npm run typecheck`                                              | 0    | —                                                           |
| `npm test`                                                       | 0    | 177 arquivos / 904 testes PASS; 4/27 skips                  |
| `npm run test:coverage`                                          | 0    | 86,44 / 81,55 / 89,72 / 87,53                               |

## 6. Limitações

- Não executado: `npm run certify` completo (proibido nesta rodada), build Docker, benchmark/holdout, signoff humano.
- A matriz exige evidência; as métricas AAA-04 v2 (pisos de coverage/mutação e performance) continuam critérios de qualificação, não reavaliados aqui.
- Os logs de `certification/logs/` serão reescritos na próxima execução de `certify`; a versão atual é do artefato histórico e não foi alterada por este rework.
