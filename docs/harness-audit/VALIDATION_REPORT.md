# Relatório de validação da auditoria

Data: 2026-09-13 (`America/Sao_Paulo`). Candidato: `HEAD 512bc11e80fbf7c7b8baf6263aacc811ff829309` mais o worktree local capturado. Nenhum resultado abaixo autoriza produção.

## Evidência executada nesta rodada

| Check                | Resultado                                                               | Evidência bruta efêmera                        | SHA-256                                                            |
| -------------------- | ----------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| `npm test`           | PASS: 240 files/1.680 tests passed; 9 files/105 tests skipped; 267,17 s | `/tmp/cvg-harness-npm-test.log` (27.097 bytes) | `145fcc7377d55e18c206655e9740380aaafb3ccaa9dd098c4d7d9e328073e106` |
| `npm run test:evals` | PASS: 1 file/8 tests; 1,46 s                                            | `/tmp/cvg-harness-test-evals.log` (354 bytes)  | `1f4209678a1f576c06fa0768fa010d81d457d3aac543c775fd6b0246f7228fc0` |
| `npm run typecheck`  | PASS, exit 0                                                            | `/tmp/cvg-harness-typecheck.log` (85 bytes)    | `8b0652334f8c18d7b8ab65ebb1c68eb5c3e9bfcdeee08c641f75418ba81efb8c` |

Os logs em `/tmp` não são artefatos duráveis do repositório; hashes permitem detectar alteração enquanto existirem. A saída agregada, o comando, o exit code e as limitações são preservados aqui. A quantidade de testes não comprova qualidade do runtime, PostgreSQL real, providers, E2E ou produção.

## Checks documentais

| Check                                                       | Resultado                                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 40 entregáveis obrigatórios presentes e não vazios          | PASS: 40/40, missing `[]`, empty `[]`                                                        |
| `AUDIT_RESULT.json` parseável e schema mínimo completo      | PASS: Python `json.loads`; campos mínimos e enums válidos                                    |
| `EXECUTIVE_REPORT.md` abaixo de 3.000 palavras              | PASS: 876 palavras por split conservador                                                     |
| 26 dimensões no scorecard                                   | PASS: 26/26 nomes, soma 120 e média reproduzida 4,6                                          |
| Inventário/boundary/tools/risks/roadmap estruturais         | PASS: 28/28 componentes alinhados; 9 tools + 1 plugin + 21 capabilities; 18 riscos; 14 fases |
| Referências locais completas resolvem para paths existentes | PASS: 106 paths únicos, 0 ausente; shorthand local exige contexto do relatório               |
| Prettier no diretório de auditoria                          | PASS: `npx prettier --check docs/harness-audit`                                              |
| Whitespace do worktree                                      | PASS: `git diff --check`                                                                     |
| Consistência de runtime/orchestrator/decisão/scores         | PASS: `single_pass`, `implicit`, `GO_WITH_PREREQUISITES`, produto 6/Harness 5/extração 4     |
| Percentuais conceituais                                     | PASS: `8/15 = 53,33%`; `3,75/15 = 25%`, com rubrica em `HARNESS_SCORECARD.md`                |

## Preservação do worktree e sentinel

- Fingerprint inicial, antes da criação dos relatórios: `b16f2b09d3c5968b7da5a0bac94dece202ec9a22cd1f53f38dd51c379042fd99`; snapshot `/tmp/cvg-harness-audit-pre.SOj3ib.json`.
- Primeiro candidato enviado ao crítico: `e1c990d303ec64455b750e07a1260ef9f218b41ddf496f05374a1189187fbd36`; o post-check retornou `match: true`.
- Primeiro crítico final: `final_critic_harness_audit`, independência I1, contexto novo, pacote selado, read-only; veredito `REJECT` por granularidade contratual insuficiente. Esse veredito não pode aprovar o candidato corrigido.
- A comparação byte a byte entre o snapshot inicial e o candidato reparado encontrou 46 paths alterados: 45 sob `docs/harness-audit/` e um cache gerado pelo Vitest, `node_modules/.vite/vitest/da39a3ee5e6b4b0d3255bfef95601890afd80709/results.json`. Nenhum source, config, banco, runtime state, execution log ou backlog mudou. O cache foi atualizado pelos checks autorizados e não é revertido/destruído para fingir imutabilidade.
- O candidato final deve ser fingerprinted somente depois deste relatório e antes do novo crítico. O Lead deve executar o post-check depois do veredito; esse digest/sentinel permanece evidência externa porque inseri-lo neste arquivo mudaria o próprio candidato. Aprovação sem `match: true` é inválida.

## Cobertura não executada

`NOT_RUN`: PostgreSQL real, E2E real, coverage, build, lint global, restore, load/performance, providers/canais externos, MCP, RAG institucional e produção. Os testes executados podem usar doubles/in-memory; os skips permanecem um limite explícito. A auditoria não usa dados reais e não executa effects externos.
