# PDSH-023 — SDK de integrador (JSON-RPC v1) — 12/10/2026

- Escopo: SPEC [0204](../../../02_spec/0204_pdsh023_sdk.md). DONE_LOCAL com gates completos; não é certificação, revisão independente ou release.
- Decisão: pacote neutro `@cvg/sdk` com protocolo JSON-RPC 2.0 v1 (`sdk.hello`, `session.open`, `turn.send`, `session.events`), servidor que nunca lança, cliente TS tipado, transporte em processo e composições `createSdk`/`createSdkMinimal`. Nenhum transporte de rede: o `SdkTransport` é do host.
- Integração: `turn.send` compõe `createOperationalHarness` por turno com `createSessionKernelLog` ligado ao stream; apenda `message/user` antes e `message/assistant` apenas quando o turno conclui `COMPLETED`; falha de modelo permanece `MODEL_FAILURE` fail-closed (nunca exceção). Tenant é vinculado na composição; policy/approvals/modelGateway explícitos.

## Procedimentos observados

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| Foco (SDK, consumidor, superfície, arquitetura, manifesto, CI, exemplo da recepção) | PASS: 7 arquivos/38 testes | [focused.log](focused.log) |
| Suíte completa, Node 22.23.2, PG 16.15 próprio | PASS: 383 arquivos/3245 testes, 1 skip | [unit.log](unit.log) |
| `test:postgres` (gate padrão) | PASS: 37 arquivos/302 testes, zero skips | [postgres.log](postgres.log) |
| `test:postgres` + guarda PG de sessão (021) | PASS: 38 arquivos/311 testes, zero skips | [postgres-session.log](postgres-session.log) |
| E2E Chromium (portas próprias 3599/4599) | PASS: 12/12 | [e2e.log](e2e.log) |
| Fronteira ADR-010 | PASS, zero violações/diagnósticos/exceções ociosas | [boundary.log](boundary.log) |
| Typecheck/lint/catálogos/formato/diff | PASS | [static.log](static.log) |

## Self-review separada (não é aceite independente)

- Casos: negociação de versão (v2 → 1001), envelope inválido/lote/sem id → -32600, método desconhecido → -32601, params inválidos → -32602, handler que lança → -32603 sem rejeitar, sessão não aberta → 1002, métodos de sessão na composição mínima → 1003, sequência imutável de seis eventos, paginação `afterSequence`, determinismo com clock/ids injetados, erro tipado do cliente (`SdkClientError.code/data`).
- Fallback fail-closed do runtime observado: provider que lança vira `MODEL_FAILURE` no `turn/end` e **não** gera `message/assistant` (só `COMPLETED` gera). Sem rede no exemplo neutro (fetch stubbed) e imports só de `@cvg/sdk`/`@cvg/harness-contracts`.
- Limite: protocolo validado em processo; transporte HTTP/stdio, autenticação e tenant real ficam com o host (fora de escopo). `message/assistant` registra a resposta pública, não raciocínio.

## Histórico de falhas preservado

- typecheck inicial falhou com TS2724 (`SessionEventStore` importado de `@cvg/harness`); é tipo de `@cvg/harness-contracts`. Corrigido no import, sem relaxar tipos.
- lint inicial falhou com 3 erros (`no-unused-vars` no import e `no-empty-object-type` em duas interfaces vazias); convertidas em aliases `= SdkServerOptions` / `= Omit<SdkServerOptions,'sessions'>`.
- primeira expectativa de guarda estava errada (esperava `internal_error` para provider que lança); o runtime real devolve `MODEL_FAILURE` fail-closed. Comportamento documentado na SPEC e guarda ajustada para o contrato real — nenhuma asserção foi removida, a expectativa ficou mais forte (sequência exata de `turn/end`).
- primeira execução focada abortou por diretório de evidência ausente; criado e reexecutado.

## Estado operacional e limites

- Lockfile: +hunks do novo workspace `packages/sdk` (link `node_modules/@cvg/sdk` + entrada do workspace); nenhuma dependência externa nova.
- Contêiner próprio `opencode-pdsh023-pg-20261012` (127.0.0.1:32771, tmpfs 4 GiB) removido; portas 3599/4599/32771 sem listener. Nenhum recurso alheio tocado.
- Sem provider/dado real/commit/push/deploy/release; produção NO_GO. Próxima ação: PDSH-024 (token meter no model-gateway) e PDSH-025/026 conforme plano 0375.
