# PLAN0374-A-20261007 — Fase A do plano 0374

- Task `PLAN0374-A-20261007`, Claude Code, 07/10/2026. Commit de código `d98d9ce`.
- Plano: [0374 §6](../../../03_build/0374_plano_producao_harness.md). Runbook: [0803](../../../08_runtime/0803_runbook_gates_locais.md).

| Item | Resultado                                                                                                                                         | Prova                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| A1   | Proteção do `main`: `REM21 CI bar (Node 22)`, `codeql`, `secret-scan`, `supply-chain` obrigatórios; `enforce_admins`; sem force-push/exclusão; linear | [raw/branch-protection-main.json](raw/branch-protection-main.json) |
| A2   | 105 achados do scan semanal reproduzidos em git-mode com a config do repositório; todos sintéticos. Allowlist não aplicada (permissão da sessão); decisão do usuário | [raw/weekly-secret-scan-triage.json](raw/weekly-secret-scan-triage.json) |
| A4   | Job `image-scan` no Security (Trivy v0.36.0 pinado por SHA). Testes de contrato de workflow 10/10 e `ci:bar:contract` PASS                          | commit `d98d9ce`                                 |
| B4   | Prova de restore com espera robusta: 3/3 PASS. E2E em worktree limpo: 10/12 FAIL sem `test:e2e:prepare` (controle negativo), 12/12 PASS com ele     | [raw/restore-proof-runs.txt](raw/restore-proof-runs.txt), [raw/clean-worktree-verification.txt](raw/clean-worktree-verification.txt) |

Gitleaks (git-mode, `31dc1c3..d98d9ce`): 0 achados. Lockfile, `products/**` e kernel intactos. Push pendente de autorização do usuário; o primeiro run de `image-scan` ocorre no CI do SHA publicado.
