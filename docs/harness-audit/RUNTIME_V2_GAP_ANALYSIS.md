# Agent Runtime V2 — gap analysis

## O que já existe

Policy determinística, approval pause/resume, proposta imutável, effect journal, idempotency, uncertainty/recovery, model gateway, trace/audit ports, cancel/deadline e budgets por step/model/tool/cost. Tudo isso reduz o risco de um loop futuro.

## Gaps para o loop alvo

| Gap                                        | Severidade | Condição de fechamento                                     |
| ------------------------------------------ | ---------- | ---------------------------------------------------------- |
| interpreter produzindo intent/plan tipado  | alta       | contract e adversarial evals                               |
| ciclo repetido Decision→Action→Observation | crítica    | tool result alimenta nova decisão em teste público         |
| evidence sufficiency                       | crítica    | evidence set/provenance e stop `insufficient_evidence`     |
| semantic retry/replan                      | alta       | nova hipótese, bounded e observável                        |
| durable checkpoint de iteração             | crítica    | restart no meio retoma sem duplicar effect                 |
| partial success/recoverable failure        | alta       | outcome algebra e repair ownership                         |
| approval resume pelo orchestrator          | alta       | checkpoint/continuation token, não caller ad hoc           |
| pause/resume geral                         | alta       | checkpoint durável para clarification, approval e retry    |
| human takeover                             | alta       | takeover vira stop/pause tipado e bloqueia resposta/effect |
| response composer + fact validator         | crítica    | claims mapeadas a sources                                  |
| tool timeout/cancel uniforme               | alta       | capability-level deadlines                                 |
| max iterations/loop detection              | alta       | contadores de iteração/estado repetido                     |
| latency budget total                       | alta       | deadline monotônico compartilhado por todas as iterações   |
| token budget total                         | alta       | contador de prompt/completion/context por turno            |
| cost budget total                          | alta       | reserva/consumo acumulados com stop determinístico         |
| stop reasons completos                     | alta       | enum persistido cobre success/wait/deny/budget/failure     |

Os atuais `LoopLimits` contam estágios de uma execução linear; não atendem max iterations. Readiness V2: **4/10**.

Sequência segura: preservar kernel single-turn como executor; adicionar state/checkpoint; implementar coordinator read-only; incluir tools de leitura; só então autorizar efeitos em múltiplos passos, sempre com proposal/approval/journal por step.
