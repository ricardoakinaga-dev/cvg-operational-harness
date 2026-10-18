# PDSH-024 — token meter no model-gateway — 12/10/2026

- Escopo: SPEC [0205](../../../02_spec/0205_pdsh024_token_meter.md). DONE_LOCAL; T2 aditivo. Não é certificação, revisão independente ou release.
- Decisão: `TokenMeter` (agrega `requests`/`inputTokens`/`outputTokens`/`totalTokens`, snapshot congelado e destacado, validação fail-closed) + `ModelGatewayOptions.meter` (uma gravação por chamada bem-sucedida; retry não duplica; falha não grava) + `model.call.completed` com `inputTokens`/`outputTokens` + guarda `provider_malformed_response` para usage inválida (antes virava custo `NaN` silencioso). `generate`, `ModelResult.usage`, preços, budget, retry/circuito e o caminho do kernel não mudaram.

## Procedimentos observados

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Foco PDSH-024 + suíte do pacote model-gateway | PASS: 7 arquivos/115 testes | (mesma execução da suíte; 7 files na pasta do pacote) |
| Suíte completa, Node 22.23.2, PG 16.15 próprio | PASS: 384 arquivos/3252 testes, 1 skip | [unit.log](unit.log) |
| `test:postgres` (gate padrão) | PASS: 37 arquivos/302 testes, zero skips | [postgres.log](postgres.log) |
| `test:postgres` + guarda PG de sessão (021) | PASS: 38 arquivos/311 testes, zero skips | [postgres-session.log](postgres-session.log) |
| E2E Chromium (portas próprias 3599/4599) | PASS: 12/12 | [e2e.log](e2e.log) |
| Fronteira ADR-010 | PASS, zero violações/diagnósticos/exceções ociosas | [boundary.log](boundary.log) |
| Typecheck/lint/catálogos/formato/diff | PASS | [static.log](static.log) |

## Self-review separada (não é aceite independente)

- Casos: agregação de três gravações com snapshot congelado e destacado; inválidos (negativo, fracionário, NaN, infinito, string, ausente, nulo) sem corromper contadores; guarda de estouro em `Number.MAX_SAFE_INTEGER`; usage de request exposta no `ModelResult` e no evento `model.call.completed`; agregação de duas chamadas sequenciais (total do turno); retry registra só a tentativa vencedora; falha não registra; provider com usage inválida falha fechado (`provider_malformed_response`) sem registrar.
- Limite honesto: "turno" é o ciclo do host com um meter; o teto de tokens continua no kernel (`MAX_TOKENS`); provider que não reporta usage continua registrando `0` (honesto, sem estimativa inventada). `TokenMeter` não entrou em PUBLIC_API/PINNED nesta rodada (exportado sem compromisso de superfície).

## Estado operacional e limites

- Contêiner próprio `opencode-pdsh024-pg-20261012` (127.0.0.1:32772, tmpfs 4 GiB) removido; portas 3599/4599/32772 sem listener. Nenhum recurso alheio tocado.
- Sem provider/dado real/commit/push/deploy/release; produção NO_GO. Próxima ação: PDSH-025 (compactação/pruning de contexto no ponto "antes do modelo") conforme plano 0375.
