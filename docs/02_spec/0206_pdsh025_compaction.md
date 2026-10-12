# 0206 — PDSH-025: compactação/pruning de contexto antes do modelo

- Task `PARE-DSH-20261011`, cartão PDSH-025, Onda 3 do [plano 0375](../03_build/0375_plano_pareamento_motor_dsh.md), trilha T3.
- Dependências `DONE_LOCAL`: PDSH-021 (log de sessão, evento `context/compacted` já no catálogo v1) e PDSH-024 (token meter). Reusa o hook `model/before-call` e o `plugins` extra de `standardKernelPlugins`.
- Invariantes: ADR-010/011, determinismo (sem modelo para resumir), fail-closed, nada de efeito externo, sem dado real, `products/**` intocado, produção `NO_GO`.

## 1. Recon

- `kernel/pipeline.ts runModelCall` executa `model/before-call` como waterfall e, no comentário I6, **espera que os controles ajustem a request**: a request ajustada é a mesma enviada a `host.get('model').complete(full)` e é o que o `model/request` loga (`snapshot(effective)`).
- `standardKernelPlugins` aceita `plugins?: readonly KernelPlugin[]` montados após o perfil padrão — o seam de composição não precisa de mecanismo novo.
- O catálogo de sessão (0202) já define `context/compacted` com payload fechado `{ throughSequence, summary, sourceDigest, strategyVersion }` e valida `throughSequence < sequence do evento` — o evento é a prova auditável da compactação.
- O token meter (024) mede usage _pós-chamada_; a compactação é pré-chamada e por isso usa um estimador determinístico próprio (documentado), sem chamar modelo nem provider.

## 2. Decisão

Módulo `packages/harness/src/compaction.ts`, aditivo e determinístico:

1. `estimateContextTokens(messages)` — heurística fixa `ceil(caracteres / 4)` por mensagem; só decide o gatilho, nunca é apresentada como medição do provider.
2. `compactConversation(messages, options)` — puro: se `tokens ≤ maxInputTokens` ou há menos de 2 mensagens, devolve cópia sem compactar; senão descarta o prefixo mais antigo mantendo `keepRecentMessages` (clamp ≥ 1 e ≥ 1 descartada), gera `summary` limitado por `summaryMaxChars`, `sourceDigest` SHA-256 canônico das mensagens descartadas, `throughSequence` da última descartada e a **visão** `[mensagem de sistema com o resumo, ...recentes]`. Nunca muta a entrada; mesma entrada → mesma saída canônica.
3. `createCompactionControl(options)` — `KernelPlugin` de controle no `model/before-call`: quando compacta, chama `onCompacted(result)` (o host grava o evento de sessão) e só então substitui `call.request.messages` pela visão; callback que falha → stop `INSUFFICIENT_EVIDENCE` **antes** do modelo (fail-closed). Quando não compacta, passa direto sem tocar na request.
4. `createSessionCompactionRecorder(options)` — liga o resultado ao log de sessão: apenda `context/compacted` com o payload do catálogo via `SessionEventStore` (PDSH-021), no-op para resultado não compactado.

Não muda: pipeline, controles padrão, budget, orçamento de tokens, provider, SDK. `onCompacted`/`recorder` são a fronteira de auditoria; nada de efeito externo.

## 3. Critérios de pronto

- [x] Engine determinístico com estimador, clamp, digest canônico, resumo limitado e entrada imutável.
- [x] Controle no `model/before-call` ajustando a request antes do log/modelo; fail-closed quando o registro falha; pass-through quando não compacta.
- [x] Recorder grava `context/compacted` validado pelo catálogo e é no-op fora de compactação.
- [x] Guarda `pdsh-025-compaction.test.ts` (engine, bordas, integração no kernel single-pass, auditoria no store).
- [x] Verdes: foco, suíte completa, `test:postgres`, E2E, typecheck, lint, prettier, catálogos, fronteira.

## 4. Verificação

- `npx vitest run packages/harness/src/__tests__/pdsh-025-compaction.test.ts`.
- Gates padrão da rodada em Node 22.23.2 com PG descartável próprio; evidência em `docs/04_audit/evidence/PDSH-025-20261012/`.

## 5. Fora de escopo

PDSH-026 (produto), compactação com modelo real (jamais: resumo é determinístico), pruning por relevância/semântica, orçamento de tokens novo (teto continua no kernel), fiação no bridge durável/worker (o controle é composto por quem monta plugins; o caminho do worker fica para o consumo de PDSH-026), PUBLIC_API (exportado sem compromisso de superfície nesta rodada).

## 6. Fechamento — 12/10/2026

`DONE_LOCAL`, T3 sob a autorização do plano. [Evidência](../04_audit/evidence/PDSH-025-20261012/summary.md).

- Engine + controle + recorder implementados e verificados no kernel single-pass; evento `context/compacted` gravado no store da PDSH-021 e validado pelo catálogo (a própria regra `throughSequence < sequence` foi exercitada).
- Gates Node 22.23.2: pacote 25 arquivos/267 testes; suíte completa 385 arquivos/3261 testes +1 skip; `test:postgres` 37/302 e +sessão 38/311, zero skips; E2E 12/12; fronteira PASS; typecheck/lint/catálogos/formato/diff PASS; `docs:check-links` no fechamento.
- Limites: resumo textual determinístico (não semântico); controle composto via `plugins` (bridge durável fica para PDSH-026); PUBLIC_API inalterado. Produção `NO_GO`; próximo PDSH-026/W4.
