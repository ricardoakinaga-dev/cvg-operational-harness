# PDSH-021 — eventos de sessão append-only — 12/10/2026

- DONE_LOCAL, SPEC [0202](../../../02_spec/0202_pdsh020_session_event_format.md), critérios S01–S08 verificados no escopo sintético; S09 pertence a PDSH-022. Não é certificado/review independente/release.
- Recon/recovery: o ponteiro persistido confirma PDSH-020 DONE documental. O resumo da sessão anterior que o dizia pendente era desatualizado. Árvore compartilhada preservada, somente caminhos do claim021 alterados.
- Design: schema JSON v1 fechado, port neutra, validação/hashing pelo shared canonical, stores in-memory e PostgreSQL, adapter do log existente (composição passou a repassar options.log, antes perdido). Migração0028 opt-in em schema dedicado conserva preflight/grants de hosts legados; tenant vinculado e contexto transaction-local; pool próprio do host.
- Evidência inicial: 3 arquivos/31 testes PASS; typecheck/lint PASS em Node22. Não é evidência final, certificação ou review independente.
- Falha inicial: 4 guardas usavam formatVersion extra no input de read; validador recusou corretamente. Fixtures passaram a fornecer só tenant/session/cursor, sem enfraquecer o contrato. Narrowing TS corrigido usando declaração de função never.

## Gates executados e evidência atual

| Procedimento | Resultado | Evidência |
| --- | --- | --- |
| npm test, Node22.23.2, PG16.15 próprio | PASS: 380 arquivos/3226 testes, 1 skip | [unit-complete.log](unit-complete.log) |
| test:postgres + guarda021 | PASS: 38 arquivos/311 testes, zero skips | [postgres-complete.log](postgres-complete.log) |
| E2E Chromium, ports3599/4599 próprias | PASS: 12/12, servidores encerrados | [e2e-verified.log](e2e-verified.log) |
| Build do consumidor por exports públicos, sem aliases | PASS, closure contracts/shared/model-gateway/produto | [product-build-verified.log](product-build-verified.log) |
| boundary:products após build publicado | PASS, zero violações/diagnósticos/lock drift/exceções ociosas | [boundary-published-build.log](boundary-published-build.log) |
| Typecheck/lint/formato/catálogos/diff | PASS; typecheck/lint reexecutados após builder corrigido | [static-complete.log](static-complete.log) |
| Foco S01–S08/arquitetura/públicos/negativos | 7 arquivos/186 PASS antes da guarda adicional de bytes; todos também na suíte final | [focused-verified.log](focused-verified.log) |

## Revisão separada do builder (self-review)

- Invariantes confrontadas com artefatos: schemas fechados inclusive chaves herdadas constructor/__proto__; getters/símbolos/objetos host e ciclos recusados; dados retornados destacados; hash/version/fingerprint conferidos em cada leitura. Limites1MiB/64KiB/cursor/página e grammar neutra não dependem de validação de UI.
- PostgreSQL real: duas pools concorrentes, replay/conflito sem consumo de seq; writer fechado e nova pool reconstrói eventos; trigger de cursor falha após INSERT e transação remove evento/cursor; RLS non-BYPASSRLS e ausência de contexto; privilégios/triggers recusam mutation mesmo como owner. Reader não aceita fingerprint desconhecido inserido por autoridade de migração.
- Modelo/tool: log é gravado antes do dispatch no kernel existente. Falha no request/call produz parada e zero invocações. Kernel request não persiste AbortSignal. Nenhum journal/policy/approval foi substituído.
- Maior gap encontrado na revisão: cap sobre record::text JSONB contava espaços extras e podia divergir do envelope canônico. Backstop físico2MiB com runtime1MiB + teste de evento denso entre essas duas representações passou no PG.
- Shared→contracts não é código duplicado: implementação pura movida, compatibilidade reexporta a mesma função e mesma classe de erro, com guarda de identidade/bytes. Teste de direção arquitetural original mantido.
- Reflexão necessária foi revisada em sítios exatos/source+compiled hashes; mutação do validador reabre os diagnósticos. Exceções não autorizam imports de produto nem substituem reauditoria HISO-005.

## Falhas intermediárias conservadas

- [unit.log](unit.log): 3220 PASS/2 FAIL porque tentativa harness→shared violava direção neutra. Resolvido movendo o serializador puro, sem relaxar a guarda.
- [unit-verified.log](unit-verified.log): 3224 PASS/1 FAIL porque nova closure do consumidor faltava nos filtros de CI. Adicionadas só duas entradas contracts no workflow local; nenhum job/check/permissão mudou.
- [product-build.log](product-build.log): TS6307; builder público não incluía JSON importado. Configuração temporária passou a incluir JSON; build real final acima validou emissão e bundle.
- boundary-initial/final/verified são capturas intermediárias (INCOMPLETE/reflexão/canonical compilado/exceções antigas ociosas); não são PASS final. A evidência válida é boundary-published-build.
- Comando encadeado build/boundary/types/lint foi interrompido pelo timeout120s depois de build/boundary/types; lint foi reexecutado isoladamente e passou. Não inferir o resultado do comando parcial.

## Estado operacional e limites

- Contêiner próprio opencode-pdsh021-pg-20261012 e volumes/tmpfs removidos. Porta32769 foi só loopback, password exclusivamente sintética. Portas E2E próprias3599/4599 confirmadas sem listener ao fim; traces/resultados em /tmp/opencode/pdsh021-e2e-results. Nenhum listener/PG alheio alterado.
- Migração0028 é opt-in num schema dedicado (recusa schema legado); deployment e grants reais ainda não executados. Serving autentica tenant na composição. Digest/fingerprint são integridade, não assinatura/autorização. Sem publisher real, backfill ou regra de retenção/destruição.
- Certificação completa e coverage nova NOT_RUN nesta fatia; registrar no fechamento da onda em candidata isolada. Um skip existente permanece na suíte completa; PG/E2E não têm skips. Fonte do produto, apps e legacy preservados; apenas filtro CI do consumidor atualizado pela nova dependência.
- Sem commit/push/deploy/release; produção NO_GO. Próxima ação: PDSH-022, transform registry adjacente com gerações antigas intactas.
