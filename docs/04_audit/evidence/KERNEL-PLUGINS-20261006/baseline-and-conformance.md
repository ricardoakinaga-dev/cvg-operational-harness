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

Probes temporários removidos. O PostgreSQL descartável foi removido depois de
cada rodada; o worktree isolado no scratchpad do Claude segue para os próximos
passos e é removido ao fim da task.

## KPLG-003 — kernel com host de plugins (06/10/2026)

BUILD autorizado pelo usuário em 06/10/2026 (SPEC 0181 `APPROVED`). Código em
`packages/harness/src/kernel/`:

| Arquivo | Conteúdo |
| --- | --- |
| `types.ts` | contrato de plugin, serviços, pontos de interceptação, guardas, log, pausa, ledger de efeitos e orçamento |
| `host.ts` | host: ordem por dependência, ciclo, serviço duplicado, classe do plugin, selagem após o boot, desmontagem em ordem inversa |
| `controls.ts` | controles `budget`, `pause`, `log`, `effects`, `policy`, `approvals`, `audit` e capacidades `planner`, `model`, `tools`, `telemetry` |
| `kernel-runtime.ts` | loop de um turno sobre o host, com o comportamento do single-pass |
| `profile.ts` | perfil padrão com todos os controles obrigatórios |

- `SinglePassGovernedRuntime` virou fachada fina do kernel (D-0181-3); mesmo nome
  e construtor, sem mudança para consumidores.
- `RuntimeInput` ganhou `signal?: AbortSignal` (compatível).
- Achado durante a paridade: o prazo restante precisa ser calculado **antes** de
  iniciar a operação. `withDeadline` passou a receber uma função; o teste
  `engine-prod-lifecycle` pegou a diferença.

Verificação no worktree isolado (`b659cc8` + estas mudanças), Node 22.23.2,
PostgreSQL 16.15 próprio (removido ao final):

| Gate | Resultado |
| --- | --- |
| `npm test` | 339 arquivos passaram, 1 pulado; 2.697 testes passaram, 4 falhas esperadas, 1 pulado; exit 0 |
| `npm run test:postgres` | 35 arquivos / 288 testes passaram |
| `npm run typecheck` | exit 0 |
| `eslint` | 1 erro (`no-this-alias` no host) corrigido; reexecução de lint, typecheck e testes do `harness` passou |

Conformidade depois do kernel: 51 testes passaram e 4 lacunas restam, todas
fora do kernel.

| Invariante | Kernel | Single-pass (fachada) | Iterativo | `GovernedAgentRuntime` |
| --- | --- | --- | --- | --- |
| I1 boot sem controle obrigatório recusado | PASS (C13) | PASS | — | — |
| I2 capacidade não registra guarda nem serviço de controle; host selado | PASS (C14) | PASS | — | — |
| I3 guarda monotônica; capacidade não desfaz negação | PASS (C02) | PASS | só política | — |
| I4 aprovação ausente vira negação | PASS | PASS | PASS | PASS |
| I5 chamada registrada antes de executar | PASS | PASS (lacuna fechada) | PASS | PASS |
| I6 requisição ao modelo registrada | PASS | PASS (lacuna fechada) | **LACUNA** | **LACUNA** |
| I7 exceção normalizada | PASS (listener) | PASS | PASS | **LACUNA** |
| I8 cancelamento por `signal` | PASS | PASS (lacuna fechada) | **LACUNA** | PASS |
| I9 porta de uso único | PASS | PASS | PASS | por desenho |
| I10 auditoria fail-closed | PASS | PASS | PASS | PASS |
| I11 orçamento num lugar só | PASS (controle `budget`) | PASS | em linha | — |
| I12 pausa antes do passo e antes do efeito | PASS (C12) | PASS | — | — |

As quatro lacunas restantes fecham no KPLG-004, quando o iterativo e o kernel
durável do worker passarem a rodar sobre o kernel.

## KPLG-004 (parte A) — iterativo sobre o kernel (06/10/2026)

- Novo `packages/harness/src/kernel/pipeline.ts`: pipeline de ferramenta e de
  modelo compartilhado. O loop do single-pass e o loop iterativo chamam as
  mesmas funções (`runToolCall`, `runModelCall`, `runGate`), então política,
  aprovação, guardas, pausa, cancelamento, log e ledger de efeitos têm uma
  implementação só.
- Aprovação em duas fases: decisão em `tool/pre-execute`; reserva de uso único em
  `tool/execute`, depois do checkpoint do iterativo e imediatamente antes do
  corpo. Preserva a ordem anti-crash do iterativo; guardas e pausa negam antes de
  qualquer reserva.
- Paradas têm `cause` (`policy_denied`, `approval_pending`, …) para o loop
  registrar o passo certo; `approval_pending` continua virando pausa durável.
- O iterativo checa cancelamento e `turn/before-step` (pausa) antes de cada
  passo, e mantém o orçamento de duração ativa entre retomadas por um adaptador
  de `TurnBudget`.
- Desfecho canônico (SPEC 0181 §10): exceção da política no iterativo passa de
  `POLICY_DENIED` para `INSUFFICIENT_EVIDENCE`, igual ao single-pass. Uma
  asserção de `iterative-runtime.test.ts` foi atualizada com a referência.

Verificação no worktree isolado (`b62f726` + estas mudanças), Node 22.23.2,
PostgreSQL 16.15 próprio (removido):

| Gate | Resultado |
| --- | --- |
| `npm test` | 2.709 passaram, 2 falhas esperadas, 1 pulado, **1 falha**: `tests/architecture/dependency-direction` achou o texto `pg` dentro do nome de variável `stepGate`. Variável renomeada; arquitetura + `harness` + conformidade reexecutados: 203 passaram, 2 falhas esperadas |
| `npm run test:postgres` | 35 arquivos / 288 testes passaram (inclui os testes iterativos do worker) |
| `npm run typecheck` | exit 0 |
| `eslint .` | exit 0 |

Conformidade: as lacunas I6 e I8 do iterativo fecharam; C12 (pausa) agora roda
nos três alvos. Restam 2 lacunas, ambas no `GovernedAgentRuntime` (I6 e I7), que
dependem da extração do Codex em `packages/agent-runtime` (KPLG-004 parte B).
