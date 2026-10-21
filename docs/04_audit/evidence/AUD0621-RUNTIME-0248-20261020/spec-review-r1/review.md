# Crítica independente da SPEC0248 r1

- SPEC revisada: `materialized/0248_runtime_budget_cancel_limits.md.txt`, sha256 `b1f132128d7aa4b912d6683148eff162cd74287ef7019d462b72708646fdb54b`.
- Crítico: agente general-purpose novo, não-fork, só leitura, sem descendentes. Prompt autocontido; código base no worktree detached `6c9fc651`.
- Veredito: **REQUEST_CHANGES**, com 4 obrigatórios (R1-01 a R1-04) e 11 P3 (R1-05 a R1-15).

Transcrição fiel do parecer (registrado pelo lead da frente):

## Conferências do crítico

Todas as âncoras da §1 conferem contra `6c9fc651` (iterative-runtime 479–496, 648–653, 831, 937–1016, 944, 958–990, 991–1000, 1009–1011, 1352–1371, 1764–1778; pipeline 139–155 e 625; hybrid 144–147, 175–243, 196, 216–218, 236–239; gateway 262–283, 301–304, 416; contracts 59/120; budget 92–138; os ssrf-node; openai-compatible 161–182/198–204; ollama 140–161/177–183; http-errors 45–58; evolution 195–218/247–253; chatwoot 206–229/255–261). As sondas reproduzem a §1. O desenho runtime/orquestrador é coerente: usa `race` e `beginModelRequest`/`recordModelResult` do kernel; porta opcional definida no orquestrador; dependência harness→orchestrator já existente (`tests/architecture/dependency-direction.test.ts`); não toca `packages/contracts`; sem dupla contagem quando a porta é usada.

## Itens

- **R1-01 — OBRIGATÓRIO.** Conflito com a SPEC0180 aprovada (`docs/02_spec/0180_shared_transport_ci_security.md`, SHA 7971771c…, que cobre "F21 (produto e transporte)"): D009 (l.86–94, pré-abort, revalidação, listener, causa do prazo `TimeoutError`→`provider_timeout`) e D011 (l.102–151, HISO-011). A §3.5 contradiz a D011 em três pontos: não-2xx com corpo grande passaria a `response_too_large` em vez de `providerHttpError(status)` (l.125, R08 l.166); Content-Length acima do teto rejeitaria o fetch antes do status (l.117, l.127); 3xx com corpo grande mascararia a decisão do guard (l.124). Correção: (i) retirar o transporte de modelo e deixá-lo à HISO-011, ou (ii) declarar a §3.5 subconjunto compatível com a D011 (teto só para corpo 2xx; em não-2xx e 3xx preservar status e headers; CL acima do teto só falha corpo 2xx; itens fora do subconjunto abertos na HISO-011). Em qualquer caso, a §3.4.1 se declara subconjunto da D009, diz se adota a causa do prazo (`TimeoutError`, R15) e que o abort repassa o reason do caller.
- **R1-02 — OBRIGATÓRIO.** AC20 com código errado: pelo gateway o timer aborta sem reason e o resultado é `cancelled` (`tests/model-fault-server.test.ts` 241–260, MF02, afirma `['timeout','timeout','cancelled']`); pelo `provider.execute` é `kind: 'timeout'`. AC20 já é verde na base (experimento do crítico: `TimeoutError` em ~101 ms). Correção: AC20 no provider, sem first red; AC18/AC19 com a camada explícita.
- **R1-03 — OBRIGATÓRIO.** §3.2.5 soma antes de validar: `Math.max(0, NaN)` e `Math.max(0, ∞)` contaminam `run.usage`, resultado e checkpoint. Validar todo o uso relatado antes de somar (finito, ≥0, `modelCalls` inteiro, campos presentes), também na exceção.
- **R1-04 — OBRIGATÓRIO.** R6 "antes de qualquer despacho" não é entregue: entre `decide` e `dispatch` há `safeAudit('orchestrator.decided')` (873) e o `recordStep` da detecção de laço; STOP chega a `COMPLETED`. Correção preferida: checar o cancelamento logo antes de `this.dispatch(...)`, com AC de audit sink que aborta durante o append.
- **R1-05 — P3.** AC24 incompleto: `packages/agent-runtime`, `packages/persistence`, `packages/chaos`, `tests/consumers-*.test.ts`, `tests/architecture/dependency-direction.test.ts` (tokens proibidos em harness e orchestrator, inclusive testes) e as suítes do produto para detectar cedo.
- **R1-06 — P3.** §3.3 `beginCall`: a porta deve manter total próprio, acumulado na ordem do orquestrador; sugerido recusar com o turno abortado.
- **R1-07 — P3.** Cobertura 100%: revalidação pós-retorno só alcançável em janela de microtarefas; §3.2.1 redundante com `race`. Dizer como cobrir ou usar `v8 ignore` com justificativa (padrão 0610).
- **R1-08 — P3.** §3.2.7 sem AC.
- **R1-09 — P3.** `readBoundedText`: decodificar uma vez (UTF-8 dividido); `body === null` → vazio; definir o caso de Response falsa sem `body` (local-http-providers 230–250 e 375–395).
- **R1-10 — P3.** §7 incompleta: limite de reparos internos passa ao `maxDecisionRepairs` do runtime; mensagens de MAX_TOKENS/MAX_COST pela porta; `pdsh-031-slice2d-iterative` 390–412 pode ficar instável.
- **R1-11 — P3.** §3.4.2 e R8 divergem sobre não finitos; explicitar a fórmula e a mensagem.
- **R1-12 — P3.** AC04 com `toBeCloseTo`; AC06 "na exceção como hoje" está errado; §3.2.6 dizer como o uso da exceção é detectado.
- **R1-13 — P3.** DNS sem prazo no canal; registrar como residual.
- **R1-14 — P3.** Corpo 2xx grande continua `provider_rejected`; 5xx/429 grande no transporte vinculado viraria não retentável; considerar prioridade ao status.
- **R1-15 — P3.** R1 universal demais: vale para o `HybridOrchestrator` e quem usa a porta.

## O que o crítico conferiu e não conferiu

Conferiu a SPEC (sha), o código base, `shared/ssrf.ts`, `vitest.config.mts`, o manifesto crítico, `dependency-direction`, `consumers-public-surface`, os testes existentes afetados, o relatório 0621 e as sondas, as decisões do usuário, a SPEC0181, a SPEC0180 e sua nota de aprovação e o backlog 0370 (HISO-011). Experimento próprio em Node 22.23.2 com `fetchWithResolvedAddress` e corpo pendurado. Não rodou suítes, typecheck nem cobertura; não testou a alcançabilidade da revalidação pós-retorno nem os tempos de AC08–AC10.
