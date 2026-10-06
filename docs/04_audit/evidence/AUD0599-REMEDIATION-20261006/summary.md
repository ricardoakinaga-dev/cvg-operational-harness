# AUD0599-REMEDIATION — correções da AUD-0599 — 06/10/2026

- Task `AUD0599-REMEDIATION-20261006`, Claude Code, owner KERNEL-PLUGINS.
  Base `d893ea9`; identidade dos arquivos em
  [source-manifest.json](source-manifest.json).
- Pedido do usuário: "faça as correções apontadas nesses relatorios"
  ([AUD-0599](../../0599_auditoria_entrega_fable_2026-10-06.md) e levantamentos
  Opus arquivados em `AUD0599-FABLE-20261006`).

## Correções

| Achado                       | Correção                                                                                                                                                         | Prova                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| AUD0599-F01                  | `unrecordedBlock` no pipeline; o single-pass compõe a falha de log com o motivo do bloqueio depois da reserva                                                     | Sonda do lead: motivo presente, body 0, aprovação FAILED, 1 encerramento                 |
| AUD0599-F02                  | O pipeline devolve `blocked` (decisão original); o iterativo fecha a etapa aberta como FAILED com o código da decisão, também quando o checkpoint a abriu         | Sonda do lead: WAITING e RUNNING viram FAILED (`policy_denied`, `approval_denied`)       |
| Verify `zod` antes do install | Parsers de log movidos para `scripts/lib/test-log-summaries.mjs`, sem dependências; `certification-rules.mjs` reexporta                                         | `ci-bar.mjs init` sem `node_modules`: exit 0; teste do grafo de imports                  |
| `source-map-js` high         | Lockfile 1.2.1 → 1.2.2, só essa entrada                                                                                                                          | `npm audit --audit-level=high`: 0 vulnerabilidades                                       |
| CodeQL #17                   | Aliases com mais de um `*` ou sem alvo viram `TSCONFIG_PATHS_INVALID` (regras TS5061/5062/5066); expansão por fatia, sem `replace`                                | Dois testes novos falham no script anterior e passam no novo                             |
| CodeQL #1/#2/#4/#9           | `withoutTrailingSlashes` linear em `@cvg/shared` (`url.ts`); `ssrf.ts`, preso ao manifesto de mutação REM21-013, fica byte-exato                                  | 200 mil barras abaixo de 1 s                                                             |
| CodeQL #8                    | Espaços colapsados antes do teste; padrão só com espaços literais                                                                                                | 300 mil frases aleatórias sem divergência; 50 mil espaços: 1,5 s antes, 0 ms depois      |

## Gates

- Suíte completa, Node 22.23.2, PostgreSQL 16 descartável próprio
  (`claude-aud0599r-pg`, loopback 55730, removido), `PHASE4A_PG_REQUIRED=1`:
  352 arquivos, 2.844 PASS + 2 falhas esperadas (`GovernedAgentRuntime`
  I6/I7), zero skips.
- `test:postgres`: 35 arquivos, 288 PASS.
- Typecheck, lint, Prettier e `docs:check-links`: PASS.
- A primeira rodada completa falhou em `tests/mutation-guard.test.js` (deriva
  do hash de `ssrf.ts`); o helper foi movido para `url.ts` e a rodada foi
  repetida inteira.
- [Sonda do lead da AUD-0599](aud0599-lead-probe-rerun.mjs.txt) reexecutada
  sem as asserções que fixavam os defeitos:
  [resultado](aud0599-lead-probe-rerun.json), 12 cenários.

## Fora do escopo

- Alertas #6/#7 (rate limit), configuração do CodeQL para evidências
  históricas e proteção do `main`: decisão do usuário.
- Condições 4, 7, 8 e 9 da barra 0373 e parte B do kernel: construção, não
  correção. Bootstrap de sessão continua no claim HARNESS-ISO do Codex.
- Sem push, deploy, certify ou E2E. Produção `NO_GO`; CI remoto não verificado
  neste SHA.
