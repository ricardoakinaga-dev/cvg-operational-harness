# KERNEL-PLUGINS-20261006 — linha de base e conformidade do núcleo

- Data: 06/10/2026. Claude Code. Dados sintéticos, só loopback; nenhum
  provider externo, push ou deploy.
- Referência de arquitetura: DeepSeek Harness, `~/deepseek-harness`, commit
  `280156b0a9`.

## KPLG-001 — linha de base

- Commit `a7dd030`, worktree isolado (`git worktree add --detach`), sem as
  alterações não commitadas do checkout compartilhado.
- Node 22.23.2; `npm ci --ignore-scripts`; PostgreSQL 16.15 descartável próprio
  (`claude-kplg-pg`, 127.0.0.1:55720), `TEST_DATABASE_URL` configurado.

| Gate | Resultado |
| --- | --- |
| `npm test` | 337 arquivos passaram, 1 pulado; 2.646 testes passaram, 1 pulado; exit 0 |
| `npm run test:postgres` | 35 arquivos / 288 testes passaram; exit 0 |
| `npm run typecheck` | exit 0 |
| `eslint .` | exit 0 |

## KPLG-002 — suíte de conformidade (SPEC 0181)

Arquivos: `tests/conformance/harness-runtimes.conformance.test.ts` e
`tests/conformance/agent-runtime.conformance.test.ts`. Resultado igual no commit
isolado e no checkout compartilhado: 2 arquivos, 26 testes passaram e 7 falhas
esperadas (`it.fails`, lacunas confirmadas), sem testes pulados. Lint, Prettier e
typecheck passaram.

| Invariante (dsh) | Single-pass | Iterativo | `GovernedAgentRuntime` |
| --- | --- | --- | --- |
| I1 boot recusado sem controle obrigatório | sem host de plugins | sem host de plugins | sem host de plugins |
| I3 negação não é desfeita | PASS para política única; guardas inexistentes | PASS para política única; guardas inexistentes | guardas inexistentes |
| I4 aprovação ausente vira negação; uso único e vínculo | PASS (C03) | PASS (C03) | PASS (C03, C04) |
| I5 chamada registrada antes de executar | **LACUNA** | PASS | PASS (`journal.effect_started`) |
| I6 requisição ao modelo reconstruível pelo log | **LACUNA** | **LACUNA** | **LACUNA** (`model.completed` só tem metadados) |
| I7 exceção vira desfecho normalizado | PASS | PASS | **LACUNA**: exceção da política escapa de `runTurn`, sem auditoria |
| I8 cancelamento antes do despacho | **LACUNA**: `RuntimeInput` sem `signal` | **LACUNA** | PASS (`cancelSignal`) |
| I9 escrita aprovada exige porta de uso único | PASS (C09) | PASS (C09) | por desenho (`reserve`/`markExecuting`) |
| I10 auditoria falha após efeito ≠ sucesso | PASS | PASS | PASS (exceção escapa; ver I7) |
| I11 orçamento num lugar só | PASS no comportamento; mais de 20 checagens em linha | PASS no comportamento | não exercitado |
| I12 pausa | inexistente | inexistente | inexistente |

### Inconsistências entre runtimes (mesma falha, desfechos diferentes)

| Falha injetada | Single-pass | Iterativo | `GovernedAgentRuntime` |
| --- | --- | --- | --- |
| Canal de aprovação lança exceção | `INSUFFICIENT_EVIDENCE` | `APPROVAL_REQUIRED` (sugere espera, mas o canal caiu) | `denied` / `approval_invalid` |
| Política lança exceção | `INSUFFICIENT_EVIDENCE` | `POLICY_DENIED` | exceção propagada |
| Ferramenta lança exceção | `TOOL_FAILURE` | `TOOL_FAILURE` | `denied` / `effect_uncertain` |

O `GovernedAgentRuntime` responde `denied` quando a ferramenta chegou a rodar e o
efeito ficou incerto. O dsh pede reportar fatos ortogonais separadamente
(`docs/defensive-patterns.md`): negação e efeito incerto são fatos distintos.

### Achado estrutural

Os dois runtimes do `packages/harness` usam `@cvg/harness-contracts`
(`PolicyEngine.evaluate`, `ApprovalEngine.request`, `execute(RuntimeInput)`). O
`GovernedAgentRuntime` usa outra pilha: `@cvg/policy-engine`,
`@cvg/approval-engine`, `ModelGateway.generate` e `runTurn(GovernedTurnInput)`.
Há dois contratos de governança, não só três implementações.

## Limpeza

Probes temporários removidos. O worktree e o PostgreSQL descartável seguem
ativos para os próximos passos e são removidos ao fim da task.
