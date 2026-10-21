# SPEC0248 — Runtime: orçamento da decisão, cancelamento e limites de recepção

**PROPOSTA, revisão r3.** Task `AUD0621-RUNTIME-SPEC-0248-20261020`; BUILD proposto `AUD0621-RUNTIME-BUILD-0248-20261020`. Pela [decisão do usuário](../04_audit/evidence/AUD0621-REMEDIATION-20261020/user-decisions-20261020.json) (gate das SPECs 0248/0249/0250), o BUILD local começa quando o crítico independente aprovar sem obrigatórios; premissa nova, migração de esquema ou contrato público afrouxado param e voltam ao usuário. Origem: [relatório 0621](../04_audit/0621_critical_production_audit_2026-10-20.md), achados F02, F03, F04, F13, F14 e a parte de núcleo do F21. Autoridade: [constituição D-12](../07_agents/AGENTS.md) (T3: orçamento e cancelamento), [SPEC0181](0181_kernel_plugin_contract.md) §5 (I8 cancelamento obrigatório; I11 orçamento verificado num único lugar antes de cada chamada ao modelo), [SPEC0180](0180_shared_transport_ci_security.md) aprovada (D009 cancelamento e prazo do gateway; D011 teto durante a recepção, cartão HISO-011) e os contratos públicos `ExecutionBudget`, `RuntimeInput.signal`, `ModelRequest.signal` e `IterativeOrchestratorInput.signal` (`packages/contracts`), `GenerateRequest.signal`, `ModelGatewayRequest.maxCostUsd` e `ModelProfile.maxCostUsd` (`packages/model-gateway`).

A r2 corrige os quatro obrigatórios da [revisão r1](../04_audit/evidence/AUD0621-RUNTIME-0248-20261020/spec-review-r1/review.md) e aplica os onze P3. R1-01: o transporte de modelo e o pré-abort do gateway passam a ser subconjuntos declarados da D011 e da D009, com prioridade de status e o restante aberto na HISO-011 (§3.4, §3.5, §6). R1-02: AC20 no provider, sem first red. R1-03: o uso relatado é validado antes de qualquer soma (§3.2). R1-04: a revalidação do cancelamento fica logo antes do despacho (§3.2 item 6). A [revisão r2](../04_audit/evidence/AUD0621-RUNTIME-0248-20261020/spec-review-r2/review.md) deu os quatro como fechados e pediu um ajuste de texto (R2-01: o AC13 contradizia a §3.3) e cinco P3. A r3 aplica a correção proposta pelo próprio crítico para o R2-01 e os cinco P3, sem mudar o desenho e sem terceira rodada de revisão completa ([correções](../04_audit/evidence/AUD0621-RUNTIME-0248-20261020/spec-review-r2/r2-corrections.json)).

Base: `6c9fc651` (main). As âncoras de linha são dessa base. Evidência: [pasta da frente](../04_audit/evidence/AUD0621-RUNTIME-0248-20261020/). Esta SPEC só aperta controles que já existem. Não muda `packages/contracts`, não cria premissa, não migra esquema e não toca `apps/**`, `products/**`, `packages/persistence/**` nem `packages/shared/**`.

## 1. CURRENT — problema e evidência

As sondas do auditor estão em `AUD-CRITICAL-20261020`: [runtime](../04_audit/evidence/AUD-CRITICAL-20261020/runtime-probes.json), [integrações](../04_audit/evidence/AUD-CRITICAL-20261020/integration-probes.json) e [revisão de produto e transportes](../04_audit/evidence/AUD-CRITICAL-20261020/review-product-clarification.md).

### 1.1 F02 — decisão chama o modelo fora do orçamento e perde consumo em erro

- `packages/harness/src/iterative-runtime.ts` 937–1016 (`decide`): o runtime chama `orchestrator.decide` sem reservar chamada e só soma `turn.usage` no fim (1009–1010). `checkAfterUsage` (1352–1371) para depois que o gasto já ocorreu.
- `packages/orchestrator/src/hybrid-orchestrator.ts` 175–243: cada volta chama `decisionModel.complete` (196) sem consultar o orçamento. O reparo usa só o teto do construtor (144–147, limitado a 0..5) e ignora `ExecutionBudget.maxDecisionRepairs`. As exceções (216–218 e 236–239) não levam o uso acumulado.
- Sondas: `zero-model-budget` (`maxModelCalls` 0 → 1 chamada), `repair-overrun` (`maxModelCalls` 1, `maxDecisionRepairs` 0, orquestrador com 5 reparos → 6 chamadas) e `lost-orchestration-usage` (3 respostas inválidas → `INTERNAL_FAILURE` com chamadas, tokens e custo 0).
- Controles bons, que ficam: single-pass com limite 0 faz 0 chamadas, porque o kernel reserva antes (`beginModelRequest`, `iterative-runtime.ts` 479–496, `kernel/pipeline.ts` 625); regra determinística também faz 0.
- Contraria a I11 da SPEC0181: a reserva do kernel não cobre a chamada de decisão.

### 1.2 F03 — montagem de contexto sem prazo

- `iterative-runtime.ts` 944: o restante é calculado antes de `contextEngine.build` (958–990), que é aguardado sem prazo e sem sinal. Depois, `withDeadline` (992–998) usa o restante antigo.
- Sonda `context-deadline`: build bloqueado, prazo de 40 ms e abort em 25 ms. Após 125 ms a execução segue pendente. Liberado o build, o orquestrador é chamado e o resultado é `COMPLETED`.

### 1.3 F04 — cancelamento não chega à decisão

- `iterative-runtime.ts` 648–653: o `controller` do turno segue `input.signal`. Em 991–998, a decisão recebe um `AbortController` próprio, abortado só no prazo (1000). `withDeadline` (1764–1778) não compete com o sinal do turno.
- Depois de `decide`, o laço ainda aguarda `safeAudit('orchestrator.decided')` (873) e, na detecção de laço, `recordStep` (856), antes de `dispatch` (878). STOP, HANDOFF e RESPOND com texto não olham o sinal; STOP chega a `COMPLETED` (1133–1141 e `evaluate` em `iterative-dispatch.ts` 1022–1028).
- Sonda `orchestrator-cancel`: depois do abort do caller, o sinal entregue ao orquestrador continua ativo e `execute` não termina. A decisão `STOP` liberada depois dá `COMPLETED`.
- O kernel já tem `race` (`kernel/pipeline.ts` 139–155), que compete prazo e cancelamento nas chamadas de modelo e ferramenta (I8). A decisão não o usa.

### 1.4 F13 — sinal já abortado não impede o provider

- `packages/model-gateway/src/gateway.ts` 301–304: `addEventListener('abort')` num sinal já abortado não dispara, e o provider recebe um sinal novo e ativo. A reserva do `BudgetGuard` (262–283) também acontece. O backoff (416) não observa o sinal.
- Sonda `gateway-pre-abort`: com `AbortSignal.abort()`, o provider roda 1 vez com sinal não abortado e devolve sucesso.
- A D009 da SPEC0180 (l. 86–94) já contrata pré-abort, revalidação e causa do prazo; o cartão HISO-011 está TODO.

### 1.5 F14 — tetos `maxCostUsd` da request e do perfil ignorados

- `packages/model-gateway/src/contracts.ts` 59 (`ModelGatewayRequest.maxCostUsd`) e 120 (`ModelProfile.maxCostUsd`) não são lidos por `gateway.ts`. As linhas 262–283 consultam só o `BudgetGuard` global opcional (`budget.ts` 92–138, escopos request/session/tenant/agent/day).
- Sonda `gateway-cost-ceiling`: request e perfil com teto 0 e estimativa 0,1. O provider roda e o custo devolvido é 0,002.

### 1.6 F21, núcleo — recepção sem teto efetivo e canais sem prazo

- Modelo: o transporte vinculado acumula todos os chunks sem teto (`model-gateway/src/providers/ssrf-node.ts` 167–171). Os providers não passam teto ao transporte (`openai-compatible.ts` 161–182, `ollama.ts` 140–161) e só medem depois de `response.text()` (`openai-compatible.ts` 198–204, `ollama.ts` 177–183, `http-errors.ts` 45–58). A D011 da SPEC0180 (l. 102–151) contrata a correção completa (stream com backpressure, cabeçalhos, compressão, prioridade de status, R01–R15).
- Canais: o transporte de canais já corta por chunk quando recebe `init.maxResponseBytes` (`channel-gateway/src/adapters/ssrf-node.ts` 167–181), e o `exam-egress` e o teste PDSH-016 dependem dessa rejeição. Mas `evolution.ts` 195–217 e `chatwoot.ts` 206–228 não passam teto nem `signal`: o envio pode esperar sem limite, inclusive no DNS do guard, e o corpo é lido inteiro (`evolution.ts` 247–253, `chatwoot.ts` 255–261) antes do teste de tamanho. `return this.#mapResponse(...)` sem `await` (evolution 218, chatwoot 229) deixa falha de leitura do corpo escapar do mapeamento do adaptador. A D011 declara que não altera o canal.
- Experimento local em Node 22.23.2: com o sinal ligado ao `ClientRequest`, como faz o transporte vinculado, o abort também interrompe um corpo pendente. O listener só sai no `close`, que vem depois do abort.
- A parte do produto (`products/shift-assistant/**`: WhatsApp, transcrição, fila e health) fica com a frente do produto e a SPEC0180.

## 2. Invariantes

| ID  | Invariante                                                                                                                                                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | Pelo runtime iterativo, nenhuma chamada do modelo de decisão de um orquestrador que usa a porta (o `HybridOrchestrator`) começa sem reserva em `maxModelCalls`, feita pela mesma função de reserva do kernel (`beginModelRequest`). Recusa significa zero I/O. Orquestrador que ignora a porta fica sob a parada pós-uso (§6).       |
| R2  | O uso de cada chamada de decisão devolvida entra no orçamento logo após a chamada, pela mesma função de contabilização do kernel (`recordModelResult`). Estouro de tokens ou custo impede a próxima chamada.                                                                                                                         |
| R3  | Reparo interno do orquestrador consome o `maxDecisionRepairs` do runtime, num contador único (`usage.decisionRepairs`). Sem saldo, não há reparo.                                                                                                                                                                                    |
| R4  | Consumo já ocorrido não some do resultado. Exceção, prazo e cancelamento preservam as chamadas reservadas e o uso registrado. Uso relatado inválido nunca entra nos contadores.                                                                                                                                                      |
| R5  | Montagem de contexto e decisão competem com o prazo absoluto e com o cancelamento do turno. O restante é recalculado entre as duas. Prazo ou cancelamento encerram em `MAX_DURATION` ou `CANCELLED` sem esperar a dependência.                                                                                                       |
| R6  | O sinal entregue ao orquestrador aborta com o cancelamento do caller ou com o prazo. Um cancelamento que chega depois da decisão encerra em `CANCELLED` logo antes do despacho, depois da auditoria da decisão.                                                                                                                      |
| R7  | O model-gateway não reserva budget, não inicia tentativa ou fallback e não volta do backoff com sinal abortado. O sinal do provider herda o estado e o reason do caller. Subconjunto da D009 (§3.4).                                                                                                                                 |
| R8  | Teto de custo efetivo = mínimo entre `request.maxCostUsd`, quando presente, e `profile.maxCostUsd` do candidato. Teto ou estimativa não finitos, ou estimativa acima do teto, negam antes do provider e antes de qualquer reserva. O custo real continua contabilizado sem ser escondido.                                            |
| R9  | Os transportes de modelo e de canal param de receber assim que o corpo passa do teto em bytes, chunk a chunk, sem acumular o excesso, e o status HTTP conhecido tem prioridade sobre o erro de tamanho. Evolution e Chatwoot enviam com prazo, que vale do DNS ao fim do corpo. O transporte de modelo é subconjunto da D011 (§3.5). |
| R10 | Nada além do delta da §3 muda: contratos de `packages/contracts`, regras determinísticas, kernel single-pass, `BudgetGuard` global, o mapeamento atual do prazo do gateway (MF02) e as mensagens existentes ficam iguais.                                                                                                            |

## 3. Contrato (delta)

### 3.1 Porta de orçamento da decisão — `packages/orchestrator/src/hybrid-orchestrator.ts`

Tipos novos, exportados pelo pacote do orquestrador. O contrato `IterativeOrchestrator` de `packages/contracts` não muda. A porta é um campo opcional de uma extensão da entrada:

```ts
export interface DecisionModelGate {
  /** Reserva uma chamada antes do provider; false: a chamada não começa. */
  beginCall(): boolean
  /** Contabiliza uma chamada devolvida; false: nenhuma outra chamada começa. */
  recordCall(usage: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly costUsd: number
  }): boolean
  /** Reserva um reparo antes da chamada de reparo; false: sem reparo. */
  beginRepair(): boolean
}

export interface GovernedDecisionInput extends IterativeOrchestratorInput {
  readonly modelGate?: DecisionModelGate
}
```

`OrchestratorDecisionError` ganha o código `budget_exhausted` e o campo `usage: ModelUsage`, vazio por padrão. Toda exceção que o próprio `decide` lança leva o uso acumulado até ali. Uma exceção do modelo de decisão (`complete` ou o acesso ao resultado dele) sobe sem mudança, como hoje; com a porta, o uso dessas chamadas já está contado.

`HybridOrchestrator.decide(input: GovernedDecisionInput)`:

1. Regras determinísticas: sem mudança e sem tocar a porta.
2. Antes de cada `complete`: sinal abortado lança `orchestrator_unavailable` (atual), agora com `usage`. Com porta, `beginCall()` falso lança `budget_exhausted` ("Decision model budget is exhausted"), sem chamar o modelo.
3. Depois de cada `complete`: o uso é somado. Com porta, `recordCall(...)` falso lança `budget_exhausted`.
4. Resposta inválida: teto do construtor esgotado lança o erro atual (`decision_unparseable` ou `decision_invalid`) com `usage`. Com porta, `beginRepair()` falso lança o mesmo erro, com `usage`. O teto do construtor é consultado antes da porta.
5. Sem porta, o comportamento é o atual: o orquestrador escolhe ações e não autoriza orçamento (comentário atual das linhas 130–134). Só muda o `usage` nas exceções.
6. O `signal` recebido é repassado ao modelo sem troca (atual).

### 3.2 Runtime iterativo — `packages/harness/src/iterative-runtime.ts`

1. Restante ≤ 0 antes da decisão: `MAX_DURATION` com a mensagem atual.
2. Contexto: `race(turn, build)` do kernel, que nem começa o build se o turno já está cancelado. `CANCELLED` dá `CANCELLED` (`CANCELLED_RESPONSE`). `DEADLINE` dá `MAX_DURATION` com "Duration budget exhausted while building the decision context.". O build abandonado não é aguardado.
3. Decisão: porta nova (§3.3) e sinal `AbortSignal.any([sinal da decisão, sinal do turno])`, com `race(turn, decide)` sobre o restante recalculado. `DEADLINE` aborta o sinal da decisão e dá `MAX_DURATION` com a mensagem atual ("…while deciding the next step."). `CANCELLED` dá `CANCELLED`. A porta é fechada em todos os caminhos.
4. Retorno normal, nesta ordem:
   - o uso relatado (`turn.usage`, vazio se ausente) é validado antes de qualquer soma: os quatro campos presentes, finitos e ≥ 0, `modelCalls` inteiro; inválido dá `MODEL_FAILURE` com "Orchestrator reported invalid model usage.", sem tocar os contadores;
   - válido, soma campo a campo `max(0, relatado − já contado pela porta)`; um orquestrador que não usa a porta continua contado pelo relato, como hoje;
   - parada registrada pela porta dá essa parada (mensagens do kernel, por exemplo "Token budget exhausted before a response could be completed.");
   - `checkAfterUsage` dá a parada dele (mensagens atuais);
   - senão, a decisão segue para validação.
5. Exceção do orquestrador: o uso é lido do campo `usage` de um objeto não nulo lançado, com proteção contra getter que lança, e copiado; só conta se passar pela mesma validação; inválido, ausente ou ilegível é ignorado, e `throw null` ou de primitivo mantém a mensagem atual ("…: unknown failure."). Depois, pela mesma regra de soma: parada da porta dá essa parada (por exemplo `MAX_MODEL_CALLS` com "Model-call budget exhausted before the call was started."); `checkAfterUsage` dá a parada dele; senão a exceção é relançada e vira o `INTERNAL_FAILURE` atual, agora com o uso preservado.
6. R6 no laço: logo antes de `this.dispatch(...)`, depois de `safeAudit('orchestrator.decided')`, turno cancelado dá `CANCELLED`. Numa decisão nova, nenhum efeito começou. Numa decisão pendente retomada, vale o fechamento atual do passo em voo (`closePendingStep` fecha RUNNING como `unknown_effect`), igual à checagem do topo do laço.
7. `context.decisionRepair` passa a ser enviado só quando há erros de rejeição do runtime pendentes (`lastDecisionErrors` não vazio). Reparos contados pela porta não geram um aviso de reparo vazio nos passos seguintes. A rejeição pelo runtime continua igual.

### 3.3 Porta do runtime

A porta mantém um total próprio do que contou nesta decisão, acumulado na mesma ordem do orquestrador, e é esse total que entra no `max(…)` do item 4.

- `beginCall`: porta fechada, parada registrada ou turno cancelado dão falso. `turn.budget.beginModelRequest()` é a mesma reserva do kernel (I11) e já incrementa `modelCalls`. Recusa vira parada registrada e falso. Senão, o total próprio conta 1 chamada.
- `recordCall(u)`: porta fechada dá falso, sem contar. `u` inválido registra `MODEL_FAILURE` com "Orchestrator reported invalid model usage." e dá falso, sem contar. Senão, `recordModelResult(u)` contabiliza, o total próprio soma `u` e uma parada devolvida é registrada (a primeira parada vale); o retorno é falso se houver parada ou se o turno estiver cancelado. Com o turno cancelado e a porta ainda aberta, o uso válido de uma chamada já devolvida é contado (R4).
- `beginRepair`: porta fechada, parada registrada ou turno cancelado dão falso. `usage.decisionRepairs + 1 > (maxDecisionRepairs ?? 1)` dá falso, o mesmo padrão do runtime (linha 831). Senão, incrementa `usage.decisionRepairs`.
- Fechamento ao sair de `decide`: as três dão falso sem contar; um orquestrador abandonado não começa nova chamada. Uso tardio não entra no resultado; a chamada em voo já foi reservada, como no modelo do kernel sob prazo.

### 3.4 Model gateway — `packages/model-gateway/src/gateway.ts`

1. Cancelamento (R7), subconjunto da D009:
   - sinal abortado antes de reservar budget, antes do primeiro e de cada candidato (inclusive fallback) e depois do backoff lança `ModelGatewayError('cancelled')`, sem started, retry ou fallback novos;
   - o backoff compete com o sinal, e o listener é removido ao sair;
   - o sinal do provider é `AbortSignal.any([timer da tentativa, sinal do caller])`, que nasce abortado se o caller já abortou e repassa o reason do caller;
   - cancelamento depois do backoff emite `model.call.failed` com código `cancelled`.
   - Fica com a HISO-011, por mudar o mapeamento afirmado em `tests/model-fault-server.test.ts` MF02 (fora do escopo desta frente): a causa do prazo do gateway (`TimeoutError` → `provider_timeout`, R15) e a preservação da primeira causa entre caller, pausa e prazo. O timer da tentativa continua abortando como hoje.
2. Teto (R8): `ceiling = min(profile.maxCostUsd, request.maxCostUsd ?? +∞)`, por candidato. Se não `Number.isFinite(ceiling) && Number.isFinite(estimate) && estimate <= ceiling`, emite `model.budget.denied` com código `cost_ceiling` e lança `budget_exceeded` com "Model call estimate exceeds the cost ceiling", que não é retentável e por isso não aciona fallback. A checagem vem antes do `BudgetGuard`, que segue igual.
3. Depois do resultado: o custo real é calculado e liquidado como hoje. Se passar do teto, `model.call.completed` leva `detail: 'cost_ceiling_exceeded'`. O resultado não é escondido nem descartado, como já acontece com o estouro do `BudgetGuard` (liquidação sem reembolso, `budget.ts` 140–150).

### 3.5 Transportes e canais

Modelo, subconjunto da D011 (mesmos erros e mesma prioridade de status; o transporte ainda junta o corpo aceito, até o teto):

1. `model-gateway/src/providers/ssrf-node.ts`, quando `init.maxResponseBytes` é número:
   - 2xx: `content-length` acima do teto não lê o corpo; chunk que cruza o teto não é guardado. Nos dois casos o socket é destruído e a `Response` sai com status e headers e um corpo que falha com `ResponseTooLargeError`. O fetch não é rejeitado.
   - Não 2xx, inclusive 3xx: ao cruzar o teto (ou com `content-length` acima dele), o socket é destruído e a `Response` sai com status e headers e corpo nulo. O provider mapeia por `providerHttpError(status)` e o guard decide o 3xx, como hoje.
   - Sem teto, HEAD, 204, 205 e 304: sem mudança (o transporte sem teto continua sem limite; os providers sempre passam o teto).
2. `model-gateway/src/providers/http-errors.ts`:
   - `readBoundedText(providerId, response, maxBytes, signal)` lê o stream sob o teto e o sinal, cancela o leitor ao passar do teto e decodifica uma vez no fim, como `Response.text()`;
   - `content-length` acima do teto falha antes de ler;
   - `body` nulo cai em `text()` com o teste de tamanho atual: dá texto vazio numa `Response` real e preserva o comportamento atual de um adaptador falso sem stream (falha de `text()` mapeada por `networkError`);
   - falhas: tamanho, inclusive o erro do corpo do transporte, dá `response_too_large` (não retentável) com a mensagem atual "Provider response exceeded <B> bytes"; abort e prazo, por `networkError` (`cancelled` e `timeout`); o resto, `connection`;
   - `networkError` mapeia `ResponseTooLargeError` para `response_too_large`.
3. `openai-compatible.ts` e `ollama.ts`: o teste de status vem antes da leitura (atual), e o ramo não 2xx cancela o corpo antes de lançar `providerHttpError`; passam `maxResponseBytes` ao transporte e trocam `response.text()` mais `assertResponseSize` por `readBoundedText` com o sinal da chamada.
4. Ficam abertos na HISO-011: teto padrão no próprio transporte quando o chamador não passa teto (D011 l. 108), `Response` antecipada com stream e backpressure (Q), teto de cabeçalhos (H), compressão, validação de B nos construtores, cancelamento do corpo de 3xx em `packages/shared`, causa do prazo e as provas R01–R15.

Canais (a D011 não altera o canal; vale o contrato do transporte de canais e do PDSH-016):

5. `channel-gateway/src/adapters/ssrf-node.ts`: continua rejeitando ao passar do teto (o `exam-egress` e o PDSH-016 dependem disso); o erro ganha o nome `ResponseTooLargeError` e o campo `status` da resposta; a mensagem fica igual.
6. `evolution.ts` e `chatwoot.ts`:
   - opção nova `timeoutMs`, inteiro de 1 a 120.000, padrão 20.000 (o mesmo padrão do `exam-egress`); valor inválido lança `invalid_config`;
   - `init` leva `signal: AbortSignal.timeout(timeoutMs)` e `maxResponseBytes`, e a chamada inteira, DNS do guard incluído, compete com o mesmo sinal; a promessa abandonada recebe `.catch`, sem rejeição não tratada;
   - o corpo 2xx é drenado sob teto e sinal, sem guardar o conteúdo;
   - `ResponseTooLargeError` com status 2xx, ou excesso na leitura, dá `provider_rejected` com a mensagem atual ("… response exceeded the size limit");
   - `ResponseTooLargeError` com status não 2xx é mapeado como esse status hoje seria (`provider_rejected` "… responded with status N", retentável em 5xx e 429): o status tem prioridade;
   - prazo ou falha de leitura dão `send_failed` retentável com `effectUnknown: true`, que já é o mapeamento de falha de rede;
   - `return await` faz o mapeamento valer também para o corpo.

## 4. Casos de aceite do BUILD

Cada caso nasce como teste do repositório no lugar canônico. Os marcados com "base" falham primeiro na base `6c9fc651` (first red) e passam depois; os marcados "regressão" já passam na base e guardam o comportamento. "Via harness" significa pela fábrica pública `createOperationalHarness`, como as sondas.

| ID   | Achado | Caso                                                                                                                                                                                                                                                                                                                      |
| ---- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC01 | F02    | Via harness, `HybridOrchestrator` com modelo e `maxModelCalls` 0: 0 chamadas, `MAX_MODEL_CALLS` "…before the call was started.", `modelCalls` 0. Base: 1 chamada.                                                                                                                                                         |
| AC02 | F02    | `maxModelCalls` 1, `maxDecisionRepairs` 0, orquestrador com 5 reparos e respostas inválidas: 1 chamada; resultado com `modelCalls` 1 e os tokens e o custo dela. Base: 6.                                                                                                                                                 |
| AC03 | F02    | `maxModelCalls` 10, `maxDecisionRepairs` 1, orquestrador com 5 reparos e sempre inválido: 2 chamadas; checkpoint com `decisionRepairs` 1. Também sem `maxDecisionRepairs` no orçamento (padrão 1). Base: 6 chamadas.                                                                                                      |
| AC04 | F02    | `maxDecisionRepairs` 2, 3 respostas inválidas (11/12 tokens, US$ 0,05 cada): `INTERNAL_FAILURE` com `modelCalls` 3, tokens 33/36 e custo próximo de 0,15 (`toBeCloseTo`). Base: 0.                                                                                                                                        |
| AC05 | F02    | `maxTokens` ou `maxCostUsd` menor que a primeira resposta, que é inválida: 1 chamada, `MAX_TOKENS` ou `MAX_COST`; o reparo não chama o modelo. Base: 2 chamadas.                                                                                                                                                          |
| AC06 | F02    | Contagem única: com porta, `modelCalls` do resultado é igual às chamadas reais. Orquestrador sem porta: o uso do sucesso é contado como hoje; o `usage` válido de uma exceção é contado (base: perdido), e acima do orçamento dá a parada do orçamento.                                                                   |
| AC07 | F02    | Uso inválido (`NaN`, negativo, `modelCalls` fracionário, campo ausente) no sucesso dá `MODEL_FAILURE` com contadores intactos; na exceção é ignorado; em `recordCall` registra `MODEL_FAILURE` e nenhuma chamada nova começa.                                                                                             |
| AC08 | F03    | Build bloqueado, abort em 25 ms: `CANCELLED` antes de liberar o build; orquestrador com 0 chamadas. Base: pendente.                                                                                                                                                                                                       |
| AC09 | F03    | Build bloqueado e `maxDurationMs` 40, sem abort: `MAX_DURATION` "…while building the decision context." antes de liberar o build; orquestrador com 0 chamadas. Base: pendente.                                                                                                                                            |
| AC10 | F03    | Build de cerca de 200 ms com prazo de 300 ms e decisão pendurada: `MAX_DURATION` antes de 450 ms do início. Base: cerca de 500 ms.                                                                                                                                                                                        |
| AC11 | F04    | Abort durante a decisão: `CANCELLED` sem esperar; o sinal recebido pelo orquestrador fica abortado; um `STOP` liberado depois não muda o resultado. Base: pendente e depois `COMPLETED`.                                                                                                                                  |
| AC12 | F04    | Regressão: prazo durante a decisão aborta o sinal recebido e dá `MAX_DURATION` "…while deciding…".                                                                                                                                                                                                                        |
| AC13 | F04    | Porta fechada: orquestrador abandonado recebe falso em `beginCall`, `recordCall` e `beginRepair`, sem contar. Turno cancelado com a porta aberta (chamada no próprio listener de abort): `beginCall` e `beginRepair` dão falso; `recordCall` com uso válido conta e dá falso. Nenhuma chamada nova ao modelo.             |
| AC14 | F04    | R6: audit sink que aborta o caller durante o registro de `orchestrator.decided` de um `STOP`: `CANCELLED`, sem passo STOP. Base: `COMPLETED`.                                                                                                                                                                             |
| AC15 | —      | §3.2 item 7: depois de um reparo interno contado, os passos seguintes não levam `decisionRepair`; depois de rejeição do runtime, o passo seguinte leva os erros.                                                                                                                                                          |
| AC16 | F13    | `generate` com sinal já abortado: 0 chamadas ao provider, `cancelled`, nenhuma reserva no `BudgetGuard`, nenhum started. Base: 1 chamada.                                                                                                                                                                                 |
| AC17 | F13    | Abort durante o backoff (sono que não termina) e logo depois dele: sem segunda tentativa, `cancelled`, `model.call.failed` com `cancelled`. O sinal do provider segue o do caller.                                                                                                                                        |
| AC18 | F14    | Teto 0 na request e no perfil, estimativa 0,1: 0 chamadas, `budget_exceeded`, evento `cost_ceiling`, nada reservado. Base: 1 chamada. Também negam: só o teto da request, só o do perfil, estimativa da request acima do teto, teto ou estimativa `NaN`.                                                                  |
| AC19 | F14    | Estimativa dentro do teto: a chamada segue. Custo real acima do teto devolve o resultado com o custo real, o evento `cost_ceiling_exceeded` e a liquidação real. O candidato de fallback usa o próprio teto.                                                                                                              |
| AC20 | F21    | Transporte de modelo contra servidor HTTP local. Camada transporte: 2xx em chunks acima do teto devolve `Response` cujo corpo falha com `ResponseTooLargeError`, e o servidor vê a conexão fechar antes de terminar; `content-length` acima do teto não lê o corpo. Base: lê tudo.                                        |
| AC21 | F21    | Mesma fixture pela camada provider: `kind: 'response_too_large'` (OpenAI e Ollama), servidor fechado cedo; pela camada gateway: `provider_response_too_large`. 500 e 429 com corpo grande mantêm `providerHttpError`; 302 com corpo grande mantém `invalid_request`.                                                      |
| AC22 | F21    | Provider com `fetchImpl` e corpo em stream acima do teto: `response_too_large`, leitor cancelado, chunks puxados limitados (base: lê tudo). Corpo válido em chunks com UTF-8 multibyte dividido é decodificado igual a `Response.text()`.                                                                                 |
| AC23 | F21    | Regressão: servidor envia cabeçalho e pendura o corpo; `provider.execute` termina com `kind: 'timeout'` dentro do limite.                                                                                                                                                                                                 |
| AC24 | F21    | Evolution e Chatwoot: `init` com `signal` e `maxResponseBytes`; corpo ou cabeçalho pendurado e DNS pendurado dão `send_failed` com `effectUnknown` dentro do prazo; corpo 2xx grande dá `provider_rejected` (leitor cancelado); 5xx grande pelo transporte vinculado mantém o status. Zero rejeições não tratadas.        |
| AC25 | F21    | `timeoutMs` fora de 1..120.000 ou não inteiro: `invalid_config`. Transporte de canais: o erro de teto tem nome `ResponseTooLargeError`, `status` e a mensagem atual.                                                                                                                                                      |
| AC26 | todos  | Controles negativos: cada mutante (sem `beginCall`, sem `beginRepair`, sem `race` no contexto, sem sinal composto, sem a checagem antes do despacho, sem pré-abort, sem teto de custo, sem corte por chunk, sem `signal` no canal) é morto por um AC.                                                                     |
| AC27 | todos  | Regressão: suítes de `harness`, `orchestrator`, `model-gateway`, `channel-gateway`, `agent-runtime` e `chaos`; `tests/conformance`, `tests/architecture`, `tests/consumers-*` e `tests/model-fault-server.test.ts`; worker iterativo e kernel com PostgreSQL próprio; suíte do produto rodada só para detectar regressão. |
| AC28 | todos  | Cobertura por arquivo 100% nos arquivos tocados de `harness` e `orchestrator` (barra PDSH-031), sem `v8 ignore` novo; grupo `channel` do manifesto crítico ≥ 95% de ramos; `prettier`, `lint` e `typecheck` verdes em Node 22.                                                                                            |

## 5. Critérios de parada

1. Achado que não reproduz na base: registra a evidência e não corrige.
2. Necessidade de mudar `packages/contracts` ou `packages/shared`, criar migração ou tocar `apps/**`, `products/**` ou `packages/persistence/**`: para e reporta a pergunta exata.
3. Conflito com a SPEC0180 aprovada além do subconjunto declarado: para e reporta.
4. Teste existente que falha: só muda se codificar o defeito de um achado, com justificativa registrada; senão, corrige o código.
5. Qualquer controle afrouxado, mensagem trocada fora da §3 ou caminho novo para `COMPLETED`: para.
6. Crítico do código ainda pedindo mudança de código na segunda rodada: para e reporta.

## 6. Fora de escopo e residuais

- Produto (`products/shift-assistant/**`): WhatsApp, transcrição, fila serial e health de progresso. É da frente do produto, SPEC0180.
- HISO-011, além do subconjunto da §3.4 e da §3.5: stream com backpressure, cabeçalhos, compressão, validação de B, cancelamento de 3xx no guard, causa do prazo do gateway e R01–R15.
- Registro no log do kernel (I6) das chamadas de decisão: o modelo de decisão é do orquestrador, não o serviço `model` do kernel. A SPEC une reserva e contabilização (I11), não o log.
- Orquestrador de terceiros que ignore a porta: limitado pela parada pós-uso atual e pelo sinal composto. A porta não pode forçar quem não a chama.
- Teto de custo pelo pior caso de `maxTokens` antes da chamada: não muda; vale a estimativa (R8).
- DNS do guard nos providers de modelo: o prazo do provider não o cobre (`packages/shared` fora do escopo). Nos canais, a corrida com o sinal (§3.5 item 6) limita a espera.
- Classificação do canal: corpo 2xx grande continua `provider_rejected` sem `effectUnknown`, embora o provider possa ter aceitado o envio (comportamento atual preservado).
- Prazo e cancelamento de `turn/before-step`, checkpoint, step store e auditoria: não fazem parte dos achados.
- Semântica do `BudgetGuard` global e do `normalize` de entrada dos canais: sem mudança.

## 7. Compatibilidade

- Superfície pública nova e aditiva: `DecisionModelGate`, `GovernedDecisionInput`, `OrchestratorDecisionError.usage` e o código `budget_exhausted` (`@cvg/harness-orchestrator`), `readBoundedText` (`@cvg/model-gateway`, por `http-errors.ts`, não exportado no index) e `timeoutMs` em `EvolutionAdapterOptions` e `ChatwootAdapterOptions`.
- Desfechos que mudam, todos mais restritivos:
  - pelo runtime, o limite de reparos internos do `HybridOrchestrator` passa a ser o `maxDecisionRepairs` do runtime (padrão 1), não só o do construtor (até 5);
  - parada de tokens ou custo pela porta usa as mensagens do kernel ("…before a response could be completed."); pelo relato, as atuais;
  - decisão sem saldo para antes de chamar o modelo; contexto e decisão encerram por prazo ou cancelamento; o build passa a contar no mesmo prazo da decisão (o teste de 30 ms em `pdsh-031-slice2d-iterative` 390–412 usa contexto padrão e deve seguir estável; instabilidade para a promoção);
  - cancelamento depois da decisão e antes do despacho dá `CANCELLED`;
  - `generate` com sinal abortado ou acima do teto não chama o provider;
  - resposta de modelo grande é cortada ao cruzar o teto, com o status preservado;
  - canal sem resposta termina em 20 s por padrão; 3xx com corpo acima do teto no canal não é seguido e vira `provider_rejected` pelo status.
- Nenhum teste existente deve mudar. Os testes diretos de `HybridOrchestrator` sem porta (inclusive o limite 0..5 com contexto de `maxModelCalls` 3) seguem válidos, porque sem porta o orquestrador não autoriza orçamento. MF02 segue com `cancelled` no prazo do gateway.

## 8. Autoridade e decisão

O delta toca orçamento e cancelamento (T3) e só aperta controles que a SPEC0181, a SPEC0180 (D009 e D011, como subconjunto) e os contratos públicos já prometem. Não tem premissa nova nem migração. A superfície nova é aditiva e não afrouxa contrato. Pela decisão do usuário, o BUILD local começa com APPROVE do crítico sem obrigatórios, e o usuário revê no PR. Esta SPEC não autoriza produção, release, dado real, provider ou canal real, push nem deploy.
