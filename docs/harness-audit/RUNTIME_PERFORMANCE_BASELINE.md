# Runtime performance baseline

## Estado da evidência

**Baseline de latência real: NOT_RUN.** A auditoria executou testes, não workload representativo; números históricos de outros candidatos não são reutilizados.

Análise estática do path default:

- exatamente 1 model call local/fake;
- 0 ou 1 knowledge resolver;
- 0..N tools pré-planejadas em `Promise.all` (`packages/platform/src/test-lab.ts:830-899`);
- policy única;
- DB roundtrips para context/timeline/version/bind/completion;
- version pode ser resolvida/pinada pelo worker e lida novamente por `executePublishedAgent`;
- knowledge é resolvido antes de policy bloquear;
- kernel faz journal e approval sweeps antes de cada turno.

## Budgets conceituais propostos

Não são SLO medidos. Cada classe deve ter budget por estágio e total ativo, excluindo espera humana:

| Classe            | Calls permitidas inicialmente          | Princípio                       |
| ----------------- | -------------------------------------- | ------------------------------- |
| conversa simples  | 1 model, 0 tool/retrieval              | fast path                       |
| knowledge answer  | 1–2 retrieval, 1 model, 1 verification | evidence first                  |
| tool action       | 1 plan/model, 1 tool, 1 verify         | deadline por capability         |
| tarefa multi-step | bounded iterations/tools/models        | stop por duration/cost/progress |

Antes de V2, medir p50/p95/p99, warm/cold, DB/query counts, tokens/cost, retries e cancellations com provider fake de latência controlada e depois ambiente aprovado.
