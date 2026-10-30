# PAR-C03 — DISCOVERY (spill de saídas grandes e poda de resultados)

Task `AUD0625-PAR-C03-D9-20261030`, 30/10/2026, Claude D9. Base `claude/aud0625-par-c01-d9` @ `5a715d4c5` (C01 aprovada; esta branch
`claude/aud0625-par-c03-d9` só acrescenta docs e um teste). Só leitura do código; sem BUILD. Sintético.

## 1. O que o cartão pede

[0380](../../../03_build/0380_backlog_paridade_100_deepseek.md) PAR-C03 (P1, M, T3, depende de PAR-S01): origem G1/SPILL-01, SPILL-02, COMP-03 e G2/SH-04;
absorve P100-021 e o spill proposto na SPEC0224. Entrega: armazenamento de texto grande com localizador opaco, prévia de cabeça e cauda e poda de
resultado de ferramenta. Aceite: o modelo recebe localizador e prévia com aviso de corte; falha de gravação nunca descarta conteúdo em silêncio.

Capacidades ligadas (inventário [G1](../PARE100-GAP-20261016/G1-nucleo-modelo-sessao.md) e [G2](../PARE100-GAP-20261016/G2-ferramentas-contencao.md)):

| Capacidade | Texto | Estado hoje |
| ---------- | ----- | ----------- |
| SPILL-01 | salvar texto grande por API pública, localizador opaco, contagem exata de bytes e orientação de leitura | AUSENTE |
| SPILL-02 | política que mantém resultado de tool e imagem no orçamento, com prévia de cabeça e cauda e caminho para o completo | AUSENTE |
| COMP-03 | poda de saída de tool acima do orçamento, com cabeça, marcador e cauda | AUSENTE |
| SH-04 | saída truncada com preview e caminho para o resto | PARCIAL (`maxOutputBytes` 1 MiB, teto 8 MiB, `truncated`; sem spill) |
| CX20-04 / CC100-06-04 | saídas grandes como artefatos com limites; referência expirada não é apresentada como disponível | PAR-C03 (+ PAR-T04) |

PAR-C04 (imagens antigas) depende deste cartão; fora de escopo aqui.

## 2. Onde uma saída grande entra hoje (provado em `aud0625-par-c03-spill-and-prune.test.ts`)

| Ponto | Limite | O que acontece com o excedente |
| ----- | ------ | ------------------------------ |
| Sandbox `runBounded` (`packages/sandbox/src/run.ts:38,143-157`) | 1 MiB por stream (default), teto 8 MiB (`shell-tool.ts:73`) | descartado; só `truncated: true`; **sem continuação** |
| Observação do laço iterativo, `payload.output` (`iterative-dispatch.ts:685`, `boundedPayload` `iterative-runtime.ts:295`) | 4 000 caracteres (`maxObservationPayloadChars`) | a saída vira uma **string** cortada na cabeça + `…[truncated]`; sem cauda, sem tamanho original, sem localizador |
| Observação, `summary` (`stringifySummary` `iterative-runtime.ts:1988`, corte a 500 em `:1617`) | 300 caracteres | cortado **sem aviso nenhum** |
| O que o modelo vê (`context-engine.ts:60`, `summarizeObservation`) | só o `summary` + proveniência (~400 caracteres por observação) | uma saída de ~115 KB chega como 300 caracteres de cabeça, sem marcador (medido: `summary` 300, `payload` 4 027, cauda ausente, item de contexto 397) |
| Log de sessão (`session-event-schemas.v1.json`) | `tool/result` = `correlationId`, `toolId`, `outcome`; `tool/call.input` livre; `message/*.text` ≤ 64 KiB; evento ≤ 1 MiB (`session/events.ts:31`) | a saída **nunca** entra no log de sessão (control do teste); a entrada da ferramenta é limitada só pelo teto do evento |
| Journal de efeitos (SPEC [0225](../../../02_spec/0225_pare100_complete_tool_result_journal.md)) | resultado completo ≤ 1 MiB de armazenamento | guarda o resultado de **efeitos** (WRITE); uma ferramenta READ não deixa o resultado em lugar nenhum |
| Redação de observabilidade (`observability/src/redaction.ts:20`) | strings de 2 000 caracteres | só para log/telemetria, não para o modelo |
| Kernel de turno único | `RuntimeResult.toolResult` | devolve o `ToolResult` ao chamador sem limite próprio |

Achados:

1. **Corte silencioso** — a única prova de que algo foi cortado é o `…[truncated]` dentro de um `payload` que o modelo não lê; o `summary` que ele lê
   é cortado sem marcador. Viola o aceite do cartão hoje.
2. **Perda irrecuperável** — nenhuma cópia do conteúdo completo de uma ferramenta de leitura sobrevive à observação.
3. **Nada a podar ainda** — como o modelo só vê ~300 caracteres por resultado, a poda (COMP-03) só ganha sentido quando o resultado completo entrar no
   contexto (SPEC [0224](../../../02_spec/0224_pare100_complete_tool_result_context.md), ainda não construída) ou no histórico `tool` que a compactação da
   C01 resume. O spill é o que torna segura uma redução: sem localizador, cortar é perder.
4. **A compactação C01 recebe o resultado inteiro** — no prefixo enviado ao resumidor (`model-compaction.ts`, `excerpt`) uma mensagem `tool` de 100 KB
   vai integral (RED R5): custo, janela e superfície de injeção maiores que o necessário.
5. **Sinal de origem se perde** — `truncated: true` do sandbox não chega ao modelo.

## 3. Relações

- **PAR-S01** (SPEC [0221](../../../02_spec/0221_pare100_public_session_persistence.md), construído em outra branch): `SessionPersistence` com dono, `append`
  contíguo e 1 MiB por evento. Serve de padrão (dono/tenant/sessão, erros distintos, `commit unknown`), **não** de depósito: eventos são trilha de
  auditoria e replay, não blobs.
- **K03 / journal** (0225): o journal é a autoridade do resultado de um efeito. O spill nunca o substitui nem o apaga (invariante I3 da SPEC 0293).
- **C01** ([0290](../../../02_spec/0290_model_compaction_under_pressure.md)): a poda roda antes do resumo; itens fixados (pins) e instruções governadas
  nunca são podados; o estimador é o único compartilhado (D5 da C01).
- **C02** ([0285](../../../02_spec/0285_model_gateway_attempt_usage_and_request_pressure.md)): a prévia é medida pelo mesmo estimador; `context_window`
  continua sendo o sinal de overflow.
- **0224**: define "completo ou recusa". A prévia + localizador **não** é "completo": para ferramentas marcadas como decisivas a falha de gravação recusa
  o turno; o caminho acima do limite de 0224 passa a ter uma terceira saída explícita (ler por fatias).

## 4. Limites do que se pode afirmar

Não há depósito, porta ou migration de spill; a SPEC 0293 propõe os três. Os testes RED usam um `FakeSpillStore` com a forma proposta e passam a opção
`spill` por cast (não existe). Nada foi executado fora do repositório; sem dado real.

## 5. R2 (revisão da 07)

A revisão não autora da 07 (`claude/aud0625-par-s04-07` @ `3126680ae`) confirmou as medições deste documento e pediu correções de especificação, tratadas na SPEC 0293 R2: `spill.read` fora do spill (P1), ponto de mudança do contexto, moldura não forjável, poda pura e estável, definição do orçamento, composição fail-closed e cinco P3. Nenhuma medição de §2 mudou.
