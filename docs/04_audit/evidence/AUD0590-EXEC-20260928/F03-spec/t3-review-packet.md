# F03 — pacote de revisão humana T3

**Decisão futura:** aprovar ou rejeitar BUILD **sintético** da
[SPEC 0163](../../../../02_spec/0163_otel_redaction_boundary.md), candidato atual SHA-256
`5c2dd7c612c181b2e1d46e512c5d9eb134b0c8ef376bbc94993c47ee6e707ca4`.
I9 `ACCEPT_SPEC_REVIEW_READY` aplicou-se somente a `ec8d3950b96532f4af8a17a8aa98911791e385921ca78a80ac8b358661684f5f`;
I10 `REVISE`/1 P2 aplicou-se somente a `b528f27f776cdf9796571ed4210c7bafda2fb38367e3bd1ff7244e4473aac77d`.
O [I10 response](I10-response.md) estreita a afirmação histórica e registra que
I1–I6 não foram integralmente revalidados; a resposta não infere aceitação.
A crítica I11 do hash atual e a aprovação humana T3 permanecem **PENDING**.
O pacote lista apenas hashes pertinentes à decisão recente; cada parecer tem
seu próprio input hash. BUILD não autorizado.

| Item | Escopo submetido |
| --- | --- |
| Problema | A [sonda F03](../F03-redaction/proof.json) capturou marcador sintético em argumentos enviados ao tracer falso e ao buffer local. O contrato cobre também ingressos injetáveis, métricas HTTP e logs diretos que poderiam contornar o adapter. |
| Mudança permitida | Implementar o catálogo fechado `F03-C1`, validação antes de SDK/fallback/callback/exporter/buffer/JSON, DTOs independentes, falha sem eco e contexto de negócio apenas interno; admitir `recordLocalSpan`, `ControlledRequestMetrics`, telemetria injetada da API/worker e linhas diretas `PROCESS-L1` conforme a SPEC. |
| Limites de claim | `apps/api/src/server.ts` pertence à PR-L04; a parte F03 nesse arquivo só começa após liberação e claim próprio. Fatias disjuntas de `packages/observability/**`, runtime e worker podem avançar sob claims próprios após esta decisão. Alteração material da SPEC renova hash/revisão T3. |
| Prova exigida | SDK/tracer/meter e sinks falsos capturados **na entrada**; marcador em chave e valor proibidos, filhos, `setAttribute`, métricas, callbacks, stdout/stderr, fallback e buffer; mutação/Proxy/falha de sink; guarda BUILD/CI do grafo completo de rotas; positivos de eventos e números benignos; Node 22, tipos, lint, testes, PostgreSQL e E2E pertinentes no candidato integrado. |
| Exclusões | Somente dados sintéticos. Nenhum provider/canal real, dado clínico, resposta RAG sem fonte, efeito sensível, push, deploy, certificação sem claim ou autorização de produção/T4. |

A aprovação permite iniciar BUILD T3 **no escopo acima**, não fecha F03 nem
qualifica release. O aceite final requer revisão do diff e evidência no mesmo
SHA/digest candidato; caminhos compartilhados aguardam o dono atual do claim.
