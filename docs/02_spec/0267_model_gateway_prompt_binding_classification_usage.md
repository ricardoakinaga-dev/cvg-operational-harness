# SPEC 0267 — Model gateway: vínculo prompt↔instrução, classificação efetiva e contabilização de uso

Data: 28/10/2026. Estado: **IMPLEMENTED_LOCAL** (era PROPOSED_FOR_HUMAN_T3_REVIEW; o Ricardo aprovou o BUILD T3 local e sintético em 28/10/2026 com as recomendações de Q1, Q2 e Q3, recibo `docs/04_audit/evidence/USER-DECISIONS-20261028/human-decisions-2.json`, vinculado ao sha256 `d0d8b19c…` desta SPEC antes da atualização de estado). Trilha T3 (policy/segurança). Produção continua NO_GO; esta SPEC não concede release, push nem PR.

Task: `AUD0625-MODEL-GATEWAY-D9-20261028`. Origem: auditoria 0625 (`docs/04_audit/0625_repository_score_audit_2026-10-28.md`) achados **F06 (P1)**, **F10 (P2)** e **F11 (P2)**. Base: `origin/main` 61e5cf8f.

Esta SPEC é **delta** da SPEC 0167, módulo **UP91-013** ("prompt aprovado e bytes renderizados"), que já define o renderer `literal-v1`, o shape V2 e o PromptBinding. Nota de rastreio: o pedido cita o cartão UP91-015, mas esse cartão trata de grounding/tenant do conhecimento; o cartão do prompt é **UP91-013** (backlog 0364). Este delta não substitui nem reaprova o módulo 013: aproveita o desenho dele e fixa o recorte mínimo no gateway atual. O que 0167/013 já decide e não é repetido aqui: shape V2 `governed-input-v1`, reresolução do registry por tentativa, revisão do registry multiworker.

## 1. Recon (CURRENT, arquivo:linha em 61e5cf8f)

| Fato                                                                                                                                                  | Onde                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `ModelInput` aceita `system` livre (≤16.000) e mensagens com role `system`; nada o relaciona ao registry                                              | `packages/model-gateway/src/contracts.ts:17-31`                                                                        |
| `generate` valida o wire, resolve o prompt só para checar status/tenant/efetividade/hash de referência e devolve o `PromptRecord`                     | `gateway.ts:164-177`, `#resolvePrompt` `:556-595`                                                                      |
| O provider recebe `input: request.input` (do caller) e `promptSha256: prompt.sha256` (do registry), lado a lado, sem vínculo                          | `gateway.ts:350-358`                                                                                                   |
| `ProviderRequest` não carrega conteúdo aprovado nem digest da instrução enviada; adapters montam `system` a partir de `request.input.system`          | `contracts.ts:81-94`, `providers/openai-compatible.ts:133-139`, `providers/ollama.ts` (idem)                           |
| O registry calcula `sha256(content)` e confere `reference.sha256` opcional, mas a referência vem do caller e só prova qual versão foi citada          | `prompt-registry.ts:55-57`, `:145-150`                                                                                 |
| `#resolvePrompt` calcula `strictest`, mas só o usa para negar quando o request é **mais amplo** que o prompt; o valor não é devolvido                 | `gateway.ts:569-583`                                                                                                   |
| A rota usa a classificação do request (`dataClassification` do wire, default `INTERNAL`)                                                              | `gateway.ts:173-182`, `router.ts:60-76`                                                                                |
| Adapters convertem uso ausente em zero                                                                                                                | `providers/openai-compatible.ts:238-241`, `providers/ollama.ts:209-211` (o `deterministic.ts:37` devolve 0/0 legítimo) |
| O gateway executa `#parseOutput` **antes** de validar/registrar usage, meter e settle; saída recusada lança antes de `meter.record` e `budget.settle` | `gateway.ts:367-386`                                                                                                   |
| `BudgetGuard` reserva a estimativa e só cobra diferença positiva em `settle`; nunca estorna                                                           | `budget.ts:140-152`                                                                                                    |
| Consumidores: runtime e adapters chamam `generate`; ver SPEC 0167/013 para a lista                                                                    | `packages/agent-runtime`, `packages/adapters/src/model-adapter.ts`, `products/shift-assistant/src/organizer.ts`        |

Reprodução (auditoria): `docs/04_audit/evidence/AUD-SCORE-20261028/audit0625-boundaries.test.ts.txt`. Reaproveitada e ampliada em `packages/model-gateway/src/__tests__/aud0625-binding-classification-usage.test.ts` (21 testes: 10 controles + 11 `it.fails` do comportamento-alvo). Evidência em `docs/04_audit/evidence/AUD0625-MODEL-GATEWAY-D9-20261028/`.

## 2. Invariantes

I1. A instrução que chega ao serializador do provider é o material aprovado (`PromptRecord.content`), ou derivada dele por renderer versionado e verificável. Hash aprovado nunca acompanha conteúdo divergente.
I2. Mensagens dinâmicas (`user`/`assistant`) são dados e seguem permitidas, em ordem, sem aprovação individual.
I3. Instrução divergente é recusada **antes** de qualquer chamada ao provider, sem reserva de orçamento além da já feita e sem retry.
I4. Digests informados pelo caller são ignorados; só valem os calculados pelo gateway.
I5. A classificação efetiva de um request é a mais restritiva entre a do registry e a do request; a mesma classificação decide a rota, o fallback e a substituição local.
I6. A classificação do caller nunca rebaixa a do registry. O default de schema (`INTERNAL`) não afrouxa um prompt mais restrito.
I7. Uso desconhecido nunca é representado como zero. Chamada executada e cobrável é contabilizada mesmo quando a saída é recusada.
I8. Contabilização é conservadora: nunca menor que a reserva; sem estorno.

## 3. Mudança proposta

### 3.1 F06 — vínculo instrução↔provider (recorte mínimo de UP91-013)

1. Renderer `literal-v1` conforme 0167/013: `system` final = `PromptRecord.content` UTF-8, sem trim, normalização ou interpolação.
2. Compatibilidade com o shape atual (sem introduzir ainda o V2): o request legado é aceito se `input.system` estiver ausente ou for byte-idêntico ao registry e se as mensagens `system` forem no máximo uma e byte-idêntica; a duplicata é removida e o gateway injeta um único `system` do registry. Qualquer outro `system` ou mensagem `system` nega com **`prompt_content_mismatch`** (novo código de erro, não retryável, sem fallback). Ordem: valida antes de roteamento/orçamento/provider.
3. `ProviderRequest` ganha `promptBinding: { promptId, promptVersion, registrySha256, rendererVersion:'literal-v1', instructionSha256, renderedInputSha256 }`, calculado pelo gateway. `renderedInputSha256 = SHA256(UTF8(JSON.stringify({rendererVersion, system, messages})))` com ordem fixa de chaves. `ModelResult` devolve o mesmo binding (sem texto de prompt).
4. Adapters (OpenAI-compatible, Ollama, determinístico) montam o body a partir do material e **conferem, antes do fetch**, que há exatamente um `system` byte-idêntico e as mensagens dinâmicas em ordem; falha local → `invalid_request`. Esta fase do BUILD não altera o transporte/SSRF.
5. Reresolução do registry por tentativa (revogação antes de retry/fallback) segue como em 0167/013-P4 e entra no BUILD; os testes dessa parte ficam para o BUILD porque dependem do mecanismo de revisão do registry.

**Impacto de compatibilidade (decidir em §6-Q3):** callers que hoje omitem `system` passam a receber o texto do registry. Isso é o objetivo de I1, mas muda o conteúdo enviado ao modelo. Callers que enviam `system` diferente do registry passam a falhar.

### 3.2 F10 — classificação efetiva

Semântica proposta (fixar na SPEC, ver Q1): a `classification` do registry é **a classe do conteúdo da própria instrução e também o teto de dados a que o prompt pode ser combinado**.

- `effective = max(registry, request)` na ordem `PUBLIC < INTERNAL < CONFIDENTIAL < CLINICAL < FINANCIAL < CREDENTIAL` (a de `classificationRank`, `gateway.ts:608`).
- Mantém-se a regra existente: `request > registry` → `policy_denied` ("exceeds the approved prompt class"). Logo `effective` só difere do request quando `registry > request`.
- `effective` alimenta `router.resolve`, a substituição local opt-in e o fallback; eventos de roteamento passam a registrar a classe efetiva usada.

### 3.3 F11 — uso desconhecido e saída recusada

1. `ProviderResult.usage` torna-se `ProviderUsage | undefined`. OpenAI-compatible e Ollama retornam `undefined` quando o provider não reporta contadores; um zero **reportado** continua 0/0. O determinístico mantém 0/0 por construção.
2. Gateway com uso não reportado: a chamada não falha só por isso (hoje falha-fechado com `provider_malformed_response`, `gateway.ts:371-376`); o resultado traz **`usageStatus: 'unreported'`**, o custo é **`max(reserva, custo no teto de maxTokens do profile)`**, o `TokenMeter` conta a requisição em um contador separado `unreportedRequests` sem somar tokens, e o evento `model.call.completed` leva `detail: 'usage_unreported'`. Uso reportado → `usageStatus: 'reported'`.
3. Ordem no gateway: validar `usage` e calcular custo **antes** de `#parseOutput`. Saída recusada (`schema_invalid`, JSON inválido) ainda: `meter.record(usage)`, `budget.settle` pelo custo real (somente a diferença positiva, como hoje) e `model.call.failed` com `inputTokens`/`outputTokens`/`costUsd`. Os contadores continuam sem estorno.
4. O fallback (`#runCandidate` seguinte) é contado como nova chamada; a falha anterior já foi contabilizada.

Fora de escopo: preços, aprovação de provider externo, reconciliação financeira com fatura, mudança no `BudgetGuard`/store.

## 4. Critérios de pronto

- C1 (F06): provider fake e fetch fake capturam `system` == registry em 100% das chamadas; request com system B (ou `system` extra) nega com `prompt_content_mismatch` e zero chamadas; mensagens dinâmicas intactas e em ordem; binding presente no `ProviderRequest` e no `ModelResult`.
- C2 (F06): digests do caller ignorados; mutação do input entre preflight e fetch nega.
- C3 (F10): CLINICAL(registry)+INTERNAL(request) não alcança provider externo; substitui por local só com `allowLocalSubstitution`; default de schema não afrouxa; `request > registry` continua negado.
- C4 (F11): resposta sem usage → `usage` indefinido no adapter, `usageStatus:'unreported'` e custo ≥ reserva no gateway; zero reportado continua zero.
- C5 (F11): saída recusada registra usage no meter e custo real no orçamento.
- C6: nenhum teste existente enfraquecido; os 11 `it.fails` viram `it`; typecheck, lint e vitest do pacote verdes.
- C7: sem provider real, sem rede, sem dado real, sem migração SQL.

## 5. Testes

Fase atual (feita): `packages/model-gateway/src/__tests__/aud0625-binding-classification-usage.test.ts`.

| Teste                                                        | Tipo hoje  | Cobre |
| ------------------------------------------------------------ | ---------- | ----- |
| revoked → sem dispatch                                       | controle   | I3    |
| system idêntico entregue com hash e mensagens em ordem       | controle   | I1/I2 |
| dados dinâmicos diferentes continuam permitidos              | controle   | I2    |
| system divergente → `prompt_content_mismatch`, zero provider | `it.fails` | C1    |
| mensagem `system` divergente → `prompt_content_mismatch`     | `it.fails` | C1    |
| sem system → entrega o texto aprovado                        | `it.fails` | I1    |
| `promptBinding` com digests (instrução e material)           | `it.fails` | C1/C2 |
| CLINICAL request recusado antes do externo                   | controle   | I5    |
| INTERNAL/INTERNAL alcança externo                            | controle   | I5    |
| request amplo demais continua negado                         | controle   | I5    |
| CLINICAL registry + INTERNAL request em local                | controle   | I5    |
| CLINICAL registry + INTERNAL request recusado no externo     | `it.fails` | C3    |
| default de schema não afrouxa CLINICAL                       | `it.fails` | C3/I6 |
| substituição local pela classe efetiva                       | `it.fails` | C3    |
| usage reportado preservado; zero reportado preservado        | controle   | I7    |
| sem usage ≠ 0/0 no adapter                                   | `it.fails` | C4    |
| sem usage → `usageStatus` e custo ≥ reserva                  | `it.fails` | C4/I8 |
| saída recusada: meter registra usage                         | `it.fails` | C5    |
| saída recusada: orçamento cobra custo real                   | `it.fails` | C5    |
| schema_invalid continua rejeitando                           | controle   | —     |

Para o BUILD (ainda sem teste): revogação antes de retry/fallback; Ollama sem usage; mutação tardia do input; ordem de erros (`prompt_content_mismatch` antes de orçamento); eventos de roteamento com classe efetiva; multi-attempt com saída recusada.

## 6. Riscos e perguntas para decisão T3

Riscos: (R1) o texto do registry passa a ser enviado ao modelo onde antes era ignorado → comportamento de callers muda; (R2) `ModelResult`/`ProviderResult` mudam de forma (campos opcionais novos, `usage` opcional no provider) → consumidores tipados precisam de ajuste, incluindo `TokenMeter.recordModelResult`; (R3) custo conservador para uso ausente pode esgotar orçamento mais rápido (efeito desejado, mas visível); (R4) o registry em memória não dá revogação distribuída (limite herdado de 0167/013).

Perguntas que mudam rumo (recomendação em negrito):

- **Q1 (F10).** A classificação do prompt é teto + classe do conteúdo, com `effective = max` e `request > registry` negado? **Sim (recomendado)**; alternativa: tratá-la só como teto (então F10 vira "contrato", sem mudança de rota).
- **Q2 (F11).** Uso ausente: aceitar a chamada com `usageStatus:'unreported'` e custo conservador (**recomendado**), ou recusar sempre com `provider_malformed_response` (comportamento atual no gateway; o adapter ainda não devolve 0/0)?
- **Q3 (F06).** O gateway injeta o texto do registry como `system` quando o caller não envia (**recomendado**, é o pré-requisito de I1), ou exige `system` presente e idêntico?

## 7. Fora de escopo e não-aprovações

Sem implementação nesta fase; sem push/PR/merge; sem lockfile, certify, E2E, Postgres ou Docker; sem provider, canal ou dado real; sem alterar `packages/sandbox`, `packages/harness/src/capability-boundary.ts` ou `kernel/`. A aprovação desta SPEC pelo Ricardo é condição para o BUILD; esta entrega não é aceite.

## 8. Resultado do BUILD (AUD0625-MODEL-GATEWAY-BUILD-D9-20261028)

Conteúdo normativo das seções 1 a 7 inalterado; só a linha de estado e esta seção mudaram. Implementado no commit local desta branch, evidência em `docs/04_audit/evidence/AUD0625-MODEL-GATEWAY-BUILD-D9-20261028/`.

Escolhas de implementação dentro da SPEC:

- `PromptBinding` e o renderer ficam em `src/prompt-binding.ts`. `ProviderRequest.promptBinding` é opcional no tipo, para não quebrar chamadores diretos de adapter; o gateway sempre o preenche e os adapters (OpenAI-compatible, Ollama, determinístico) conferem system único e os dois digests antes do wire quando ele existe.
- Novo código `prompt_content_mismatch` (não retryável). O gateway resolve de novo o registry antes de **cada** tentativa; prompt revogado ou alterado bloqueia retry e fallback.
- Classe efetiva: `request > registry` segue negado; senão o registry governa a rota. Como CLINICAL/FINANCIAL/CREDENTIAL são `NO_MODEL` e CONFIDENTIAL é `LOCAL_ONLY`, um prompt CLINICAL não alcança mais nenhum provider.
- Uso ausente: o adapter omite `usage` (OpenAI-compatible e Ollama exigem os dois contadores). `ModelResult.usage` continua obrigatório; com `usageStatus: 'unreported'` ele carrega o **limite superior de contabilização** (bytes UTF-8 da entrada renderizada como tokens de entrada e `maxTokens` como saída), não uma medição. Custo = `max(reserva, custo desse limite)`. `TokenMeter.unreportedRequests` conta à parte e não soma tokens.
- Ordem: o uso é validado, medido e liquidado no orçamento **antes** do parse da saída; saída recusada continua cobrada e o evento `model.call.failed` leva tokens e custo. O circuito só registra sucesso depois do parse. A liquidação cobre a reserva só na primeira tentativa contabilizada; as seguintes são cobradas integralmente (hoje inalcançável, porque só `schema_invalid` falha depois da contabilização e não é retryável).

Testes: os 11 `it.fails` viraram `it`. Ajustes nos testes de caracterização da fase 1 (meus): o pedido padrão passou a trazer o `system` aprovado; o controle "CLINICAL registry + INTERNAL request em provider local" foi trocado por CONFIDENTIAL, e a substituição local usa CONFIDENTIAL, porque CLINICAL é NO_MODEL (a fase 1 supunha local permitido). Testes antigos ajustados: ver `evidence/.../existing-tests-adjusted.md`.
