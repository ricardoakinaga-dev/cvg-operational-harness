# Log de execução corrente — 27/09/2026

## AUD-0578 R1 — candidato certificado localmente

- Commits de remediação: `a67726b` (fonte visual e prontidão do worker), `dccc17c` (lockfile), `81bb91f` (build limpo) e `5ee02e8` (hash do catálogo de skips). As [SPECs 0139–0144](02_spec/0190_spec_validation.md) registram recon, regra e evidência.
- No commit `5ee02e8`, `npm run certify` passou 16/16 comandos em Node 22 com PostgreSQL descartável e run `run-aud0578-rebound-20260927`. O digest é `b1189914d12910b3012a2d1ac000ac138437ba046ef195b93fd9d17f12b37582`; `npm run certification:verify` passou, com 37 hashes conferidos. Artefatos commitados em `22ecf93`.
- Playwright 12/12; PostgreSQL e gates de fase passaram; quatro PNGs históricos mantiveram os SHA-256 registrados na [SPEC 0137](02_spec/0137_e2e_artifact_isolation.md). A [certificação](../certification/phase10-result.json) decidiu `CONDITIONAL_GO / AAA_CONTROLLED`; produção permanece `NO_GO`.
- Security remoto passou no SHA `5ee02e8` ([run 36298961238](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/36298961238)). Verify remoto do mesmo SHA ([run 36298961234](https://github.com/ricardoakinaga-dev/cvg-operational-harness/actions/runs/36298961234)) passou até a certificação; os 16 comandos internos saíram com código 0, mas a montagem de `metrics.unit` retornou `null` ao depender do log textual e o schema rejeitou o resultado. [SPEC 0147](02_spec/0147_certification_vitest_json_metrics.md) e teste de regressão cobrem o leitor JSON no candidato R2.

## PR-005 — início da rotação documental

- Os três ledgers originais foram copiados byte a byte para `docs/08_runtime/archive/`, com SHA-256 registrado nos arquivos históricos navegáveis. Os vínculos relativos da versão navegável foram recalculados; a cópia exata conserva os bytes originais.
- README antigo copiado para o mesmo arquivo histórico antes da reescrita. A branch R2 é um novo candidato e precisa de verificação própria.
- Próxima ação: conferir hashes/links/formatação da rotação, certificar R2 e seguir o backlog PR-007/009 conforme gates.

## PR-007 / PR-010 — cobertura adicional e falha de métricas

- [SPEC 0145](02_spec/0145_web_postgres_coverage_and_typed_lint.md): web 87/87 e PostgreSQL 258/258 testes, 13 arquivos fonte em cada relatório, thresholds com margem ≥3 pp e dois gates novos no CI. Lint tipado (`no-floating-promises`, `no-misused-promises`) e testes focados passaram. O núcleo principal ainda precisa confirmar margem de branches ≥3 pp.
- Um teste sintético de transporte fixado identificou `Invalid IP address: undefined` em ambos os módulos SSRF sob Node 22. A [SPEC 0146](02_spec/0146_pinned_ssrf_lookup_node22.md) permanece T3 em revisão, com [reprodução](04_audit/evidence/AUD-20260927/PR007-SSRF/repro.md); nenhum código de segurança foi alterado.
- [SPEC 0147](02_spec/0147_certification_vitest_json_metrics.md): leitor de métricas JSON e verificador atualizado; teste focado 4/4 e certificado local R1 verificado pelo novo leitor. Candidato R2 ainda sem certificação integral.

O histórico anterior está no [arquivo navegável](08_runtime/archive/2026-09-27-pr005-execution-log.md) e na [cópia exata](08_runtime/archive/2026-09-27-pr005-execution-log-source.txt), SHA-256 `220f706ff4f8840f37625a9f0b55d2393d369c6dbe99618dfec0ec08c98cf7bb`.
