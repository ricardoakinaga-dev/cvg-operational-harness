# 0205 — PDSH-024: token meter no model-gateway

- Task `PARE-DSH-20261011`, cartão PDSH-024, Onda 3 do [plano 0375](../03_build/0375_plano_pareamento_motor_dsh.md), trilha T2.
- Dependência `DONE`: nenhuma (o orçamento do gateway já existe). Não altera contrato público suportado; mudanças no resultado/eventos são aditivas.
- Invariantes: ADR-010/011, fail-closed, sem provider real (determinístico nos testes), sem dado real, `products/**` intocado, produção `NO_GO`.

## 1. Recon

- Fluxo atual medido: provider devolve `ProviderUsage { inputTokens, outputTokens }` (adapters validam por zod; ausente → 0); `ModelGateway.#runCandidate` calcula custo pela tabela de preços, devolve `ModelResult.usage` por request e o `model.call.completed` expõe só `costUsd`.
- No harness, a ponte mapeia `usage` → `ModelResult` do kernel e `GovernedTurnBudget.recordModelResult` soma por turno, gate `MAX_TOKENS`/`MAX_COST` e expõe `RuntimeResult.usage`. Ou seja: por request e total do turno já existem no caminho do kernel; falta no **pacote gateway** (usado por hosts diretos, worker/duradero e SDK) uma agregação explícita e a exposição dos tokens no evento.

## 2. Decisão

Aditivo e mínimo:

1. `TokenMeter` (`packages/model-gateway/src/token-meter.ts`): agrega `requests`/`inputTokens`/`outputTokens`/`totalTokens` com validação fail-closed (inteiros seguros ≥ 0; estouro de soma → erro) e `snapshot()` destacado e congelado. `recordModelResult(result)` é o atalho para o resultado do gateway.
2. `ModelGatewayOptions.meter?`: registra a usage de cada chamada **bem-sucedida** (uma vez por request; retries que falham não contam; fallback conta só o resultado que respondeu).
3. Exposição por request: `model.call.completed` ganha `inputTokens`/`outputTokens` (campos opcionais aditivos em `ModelGatewayEvent`).
4. Guarda fail-closed: usage inválida do provider (negativa, não inteira, não finita) deixa de virar custo `NaN` silencioso e vira `ModelGatewayError('provider_malformed_response')` antes de settle/meter.

Não muda: assinatura de `generate`, `ModelResult` (que já carrega `usage`), preços, budget de custo, retry/circuito/fallback, nem o caminho do kernel.

## 3. Critérios de pronto

- [x] `TokenMeter` com agregação, snapshot destacado e validação fail-closed (`TokenMeterError.invalid_usage`), incluindo guarda de estouro.
- [x] `meter` integrado ao gateway: usage registrada por request bem-sucedido; retry não duplica; falha não registra; usage inválida falha fechado sem settle.
- [x] `model.call.completed` com `inputTokens`/`outputTokens`; `ModelResult.usage` inalterado.
- [x] Guarda `pdsh-024-token-meter.test.ts` (unit do meter + integração gateway/turno/retry/inválido).
- [x] Verdes: foco, suíte completa, `test:postgres`, E2E, typecheck, lint, prettier, catálogos, fronteira.

## 4. Verificação

- `npx vitest run packages/model-gateway/src/__tests__/pdsh-024-token-meter.test.ts` + suíte do pacote.
- Gates padrão da rodada em Node 22.23.2 com PG descartável próprio; evidência em `docs/04_audit/evidence/PDSH-024-20261012/`.

## 5. Fora de escopo

PDSH-025 (compactação), PDSH-026 (produto), budget de tokens no gateway (o teto de tokens continua no kernel), estimativa de tokens quando o provider não reporta (0 é honesto), PUBLIC_API (exportado sem compromisso de superfície nesta rodada).

## 6. Fechamento — 12/10/2026

`DONE_LOCAL`, T2 aditivo sob a autorização do plano. [Evidência](../04_audit/evidence/PDSH-024-20261012/summary.md).

- `TokenMeter` + integração no gateway (meter opcional, evento com tokens, guarda de usage inválida) e guarda dedicada; `generate`/`ModelResult`/preços/budget/retry/circuito/kernel inalterados.
- Gates Node 22.23.2: pacote 7 arquivos/115 testes; suíte completa 384 arquivos/3252 testes +1 skip; `test:postgres` 37/302 e +sessão 38/311, zero skips; E2E 12/12; fronteira PASS; typecheck/lint/catálogos/formato/diff PASS; `docs:check-links` no fechamento.
- Limites: turno depende do host criar o meter; sem estimativa quando o provider não reporta; sem superfície pública comprometida. Produção `NO_GO`; próximo PDSH-025.
