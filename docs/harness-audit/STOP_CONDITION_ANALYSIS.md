# Stop conditions

## Existentes

O outcome do kernel é apenas `executed | approval_required | denied | shadowed` (`packages/agent-runtime/src/contracts.ts:65-70`). Reasons cobrem policy/takeover, cancel, deadline, step/model/tool/cost budget, gateway/schema, approval/proposal/journal, tool e outbox (`runtime.ts:488-563`, `:659-1013`).

| Alvo                     | Estado                                                |
| ------------------------ | ----------------------------------------------------- |
| completed                | presente como `executed`                              |
| needs_user_input         | fora do kernel/partial em template                    |
| approval_required        | presente                                              |
| human_takeover           | reason/denial, não outcome próprio                    |
| policy_denied            | presente como reason                                  |
| insufficient_evidence    | ABSENT; knowledge missing vira handoff fora do kernel |
| max_steps/cost/duration  | presentes                                             |
| max_iterations           | ABSENT; maxSteps não conta iterações                  |
| tool/model failure       | presentes como reasons                                |
| unsafe_request           | partial via policy/safety                             |
| cancelled                | reason/denial, não outcome próprio                    |
| uncertain/reconciliation | lifecycle presente, stop algebra ausente              |

Alvo: enum versionado com classes `COMPLETED`, `PAUSED`, `DENIED`, `FAILED`, `EXHAUSTED`, `UNCERTAIN`; reason code fechado, retryability, checkpoint/continuation token, evidence summary e effect certainty. Loop detection deve comparar normalized decision/state e parar repetição sem progresso.
