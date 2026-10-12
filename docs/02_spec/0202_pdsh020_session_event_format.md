# 0202 — PDSH-020: formato versionado dos eventos de sessão

- Task `PARE-DSH-20261011`, cartão PDSH-020, Onda 3 do [plano 0375](../03_build/0375_plano_pareamento_motor_dsh.md), trilha T3.
- Autorização: execução integral T2/T3 do plano em 11/10, registrada na [coordenação](../08_runtime/agent_coordination.md). Este cartão define o contrato; BUILD de store/catalog é PDSH-021, evolução adjacente é PDSH-022.
- Invariantes ADR-010/011: núcleo neutro, log segue o spine existente, sem cópia do pipeline, dado real ou provider; produção NO_GO.

## 1. Recon e problema observado

`packages/harness/src/kernel/types.ts` já define `KernelLog` append-only e seis eventos discriminados: `turn/start`, `model/request`, `model/result`, `tool/call`, `tool/result`, `turn/end`. `model/request` omite signal; resultado registra provider/tokens, não texto da resposta. `KernelLog.append` é aguardado nos pontos governados: falha de gravação antes de tool/model impede dispatch; falha após efeito não vira sucesso.

Persistência atual tem `sessions`/`messages` (migração 0000), estado/checkpoints mutáveis e steps duráveis (0019), approvals e journals com estados próprios. Não existe `session_events` versionado com schema fingerprint. O catálogo atual de migrações termina em `0027_worker_operations`. O tenant existente usa `current_setting('cvg.tenant_id', true)` via infraestrutura `withTenantContext`, não uma nova identidade.

Necessidade: definir um log neutro de conversa/turno que sobreviva a restart, dê origem a projeções de contexto e exponha eventos pelo futuro SDK sem reescrever eventos passados. O log não substitui approval, effect journal, outbox ou checkpoint e não registra chain-of-thought.

## 2. Decisão mínima e alternativas

- Manter apenas checkpoints: insuficiente para histórico imutável/versionamento e replay.
- Alterar `KernelLogEvent` de modo destrutivo: quebra perfis/consumidores e duplica autoridade.
- Escolhido: **envelope versionado + port append/read**, catálogo de schemas fechado e adapter do `KernelLog` existente. `session_streams` mantém apenas identidade/cursor/versão; `session_events` mantém fatos imutáveis. Projeções de contexto são derivadas, nunca UPDATE dos eventos.

O schema é dado JSON determinístico (sem funções), fonte dos fingerprints. SHA-256 de `canonicalizeJson(schema)` do shared; algoritmo identificado como `sha256/shared-rfc8785-subset-v1`. Não usar hash de texto TS/arquivo nem serialização dependente de ordem do filesystem.

Recon executável021: `tests/architecture/dependency-direction.test.ts` proíbe harness→shared. A implementação canônica pura foi movida para contracts, shared a reexporta por compatibilidade e o harness importa de contracts. Não há segundo algoritmo, mudança de semântica ou relaxamento do gate. A identidade de `CanonicalJsonError` e os budgets/bytes permanecem iguais em ambos os entrypoints.

## 3. Envelope v1 fechado

| Campo                      | Regra/autoridade                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `formatVersion`            | inteiro literal `1`; versão desconhecida recusa antes do append                                           |
| `eventId`                  | string não vazia, até 200 chars, sem NUL; idempotência do produtor dentro de tenant/session               |
| `tenantId`, `sessionId`    | strings não vazias, até 200 chars, sem NUL; tenant autenticado pela composição, nunca inferido do payload |
| `sequence`                 | inteiro positivo seguro, alocado pelo store; não fornecido pelo agente/produtor                           |
| `type`                     | membro do catálogo v1; tipo desconhecido recusa                                                           |
| `schemaFingerprint`        | 64 hex lowercase, deve coincidir com o schema catalogado para versão/tipo                                 |
| `timestamp`                | instante ISO UTC válido, canônico; timestamp não define ordem, sequence define                            |
| `correlationId`, `traceId` | strings não vazias limitadas a 200 chars; contexto fornecido pela composição                              |
| `payload`                  | JSON canônico validado pelo schema do tipo; objetos fechados, limites de bytes e campos                   |

Campos adicionais no envelope/payload não são tolerados silenciosamente. Limite do evento serializado: 1 MiB; uma página de leitura: máximo 500 eventos, cursor `afterSequence` inteiro seguro ≥ 0. Conteúdo pode incluir texto sintético/provedor, mas nenhum objeto host (`AbortSignal`, Buffer, Date, função, BigInt, NaN), segredo ou memória interna do modelo. As fábricas validam configuração no boot; os stores validam cada append e cada linha lida.

Input append não contém sequence/fingerprint calculados pelo caller. O store calcula ambos com o schema v1. Replay compara digest do input canônico completo (inclui timestamp e contexto): mesmo eventId/input retorna o evento original; divergência gera `session_event_conflict`, sem nova sequência. O produtor deve conservar eventId/timestamp em retry. Identidades são tuplas estruturadas, não concatenação ambígua de strings.

## 4. Vocabulário v1 e semântica

| Tipo                | Payload fechado                                               | Origem/limite                                                                   |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `turn/start`        | `{ correlationId }`                                           | `KernelLogEvent` existente                                                      |
| `model/request`     | `{ correlationId, request }`                                  | request pública JSON, signal omitido; schema dos campos do ModelRequest vigente |
| `model/result`      | `{ correlationId, provider, inputTokens, outputTokens }`      | contagens inteiras não negativas; não persiste raciocínio                       |
| `tool/call`         | `{ correlationId, toolId, operationKey, input }`              | descriptor/input JSON já governados; gravado antes de dispatch                  |
| `tool/result`       | `{ correlationId, toolId, outcome }`                          | outcome fechado de `ToolOutcome['kind']` vigente                                |
| `turn/end`          | `{ correlationId, stopReason }`                               | StopReason fechado do contrato vigente                                          |
| `message/user`      | `{ text }`                                                    | input textual autenticado do SDK, até 64 KiB UTF-8                              |
| `message/assistant` | `{ text }`                                                    | resposta pública do turno, até 64 KiB UTF-8; não scratchpad                     |
| `context/compacted` | `{ throughSequence, summary, sourceDigest, strategyVersion }` | referência a prefixo imutável, resumo até 64 KiB, hash 64 hex; PDSH-025         |

Os seis primeiros tipos são derivados do spine real; os três últimos são extensões explícitas necessárias para o SDK e compactação, não eventos alegadamente já emitidos. `sourceDigest` identifica os eventos cobertos pela compactação. Projeção usa o último compaction válido mais eventos posteriores; as fontes não são apagadas. Summary não concede aprovação, fonte RAG ou autorização de efeito.

Adapter proposto `createSessionKernelLog`: recebe store + contexto de tenant/session/trace, aloca eventId/timestamp uma vez por append, repassa o evento existente como payload e aguarda o store. Falha propagada preserva os gates do kernel. Não faz bootstrap de sessão escondido nem decide policy/approval. Hook/plugin se compõe pelo port `log` existente, não por uma segunda cadeia de controles.

## 5. Store e fronteira transacional de PDSH-021

Port neutra em `packages/contracts` ou módulo de contratos de sessão sem runtime de negócio:

- `openSession`: cria/valida stream `(tenantId, sessionId, formatVersion)`; replay idêntico não altera identidade/versão.
- `append`: input validado → transação → lock da linha do stream → conferir eventId existente/digest → alocar próxima sequence → inserir evento e avançar cursor → COMMIT. Rollback não deixa evento nem consome cursor. Índices únicos `(tenant_id, session_id, sequence)` e `(tenant_id, session_id, event_id)` fecham concorrência.
- `read`: consulta paginada explicitamente por tenant/session/afterSequence, ASC sequence. Sem array compartilhado mutável, mesmo no adapter in-memory.

Implementações: in-memory para fixtures/replay, PostgreSQL para restart/multiprocessos. Usar pool/client com propriedade transacional explícita, não `BEGIN` sobre pool que troca conexão a cada query. `withTenantContext` reseta o tenant ao devolver conexão; stores não aceitam um client compartilhado entre tenants simultâneos.

Migração nova proposta `0028_session_events`: criação aditiva de `session_streams` e `session_events`, sem alterar/renomear tabelas históricas. Stream é identidade própria do harness e não FK para a `sessions` legada de mensagens de canal, para permitir consumidor neutro. FK de evento para stream usa tenant e session.

### Recon de integração PDSH-021 — 12/10/2026

O preflight do host legado exige UPDATE em toda tabela do inventário de tenant (`apps/api/src/tenant-preflight.ts:1164`); os eventos exigem serving apenas SELECT/INSERT. Para conservar ambos os contratos e não editar hosts alheios, a migração0028 é **opt-in em schema dedicado**, via `runSessionEventMigrations`, usando o runner/checksums existente. Não entra no default do schema de aplicação legado. A migração recusa schema que contém tabelas legadas; stores recebem schema explícito e tenant vinculado, nunca o schema fornecido pelo agente. Grants do serving são aplicados pelo operador/job, não no caminho de requisição. Compatibilidade: hosts antigos não veem tabelas novas; SDK/consumidor novo compõe o store dedicado. Rollback de código deixa o schema e seus fatos íntegros. Nenhum backfill nem alteração do inventário legado.

Para a gramática neutra de tenant (strings até200), a implementação usa conexão exclusiva, transação e `set_config('cvg.tenant_id', ..., true)` **transaction-local**, em vez de impor `TenantIdSchema` do platform via `withTenantContext`. COMMIT/ROLLBACK removem o contexto; falha de rollback destrói a conexão. SQL é qualificado pelo schema de composição e limitado por statement_timeout/lock_timeout; falhas não recebem retries automáticos. O pool permanece propriedade do host.

`session_events`: ENABLE + FORCE RLS, política de SELECT/INSERT exige `tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')`. Contexto ausente recusa inserção e não retorna linhas. REVOKE PUBLIC; serving recebe apenas SELECT/INSERT de eventos. UPDATE/DELETE/TRUNCATE são recusados por privilégios e triggers (incluindo tabela vazia/TRUNCATE). Cursor do stream é metadado mutável transacional, não edição de fatos. Privilégio superuser/BYPASSRLS/DDL não pertence ao serving; testes de RLS devem usar papel non-BYPASSRLS, e não contar superuser como prova de isolamento.

O store e a role dedicada são a autoridade de sequência; inserts arbitrários de um papel de migração/administrador não são autenticidade de evento. Não confundir fingerprint/digest com assinatura institucional. Revalidação de schema na leitura e comparação de fingerprint são obrigatórias.

## 6. Evolução e recuperação — PDSH-022

Geração v1 nunca é renomeada ou sobrescrita. Registros com versão/fingerprint desconhecidos são erro explícito, não coerção. Migrações de formato são adjacentes vN→vN+1, funções puras e determinísticas que produzem uma **nova visão/geração**, conservando eventos vN. Nenhum UPDATE de payload histórico. Sem pular versões; ausência de transform bloqueia o consumidor. PDSH-022 documentará registry/compatibilidade e exemplo sintético v1→v2.

Não fabricar eventos para sessões legadas sem histórico. Adoção inicia stream novo com referência externa opcional em metadado explicitamente especificado depois; o presente contrato não afirma backfill. Rollback de deploy deixa tabelas/gerações intactas; não emitir DROP como rotina de rollback de formato. Limpeza por privacidade/retention exige decisão específica futura, não endpoint de deleção neste cartão.

## 7. Catálogo e integração pública

PDSH-021 cria fonte de schemas em `packages/contracts`, gera `docs/architecture/SESSION_EVENT_CATALOG.md` por script Node sem build prévio, e modo `--check` compara bytes/fingerprints sem mutar. PDSH-033 integra o gate no CI; uma falha de drift não vira warning opcional. Novo tipo/versão exige schema, fingerprint, guarda positiva/negativa e catálogo regenerado.

PUBLIC_API/consumer-surface devem publicar port/types, stores e adapter junto ao BUILD. Núcleo não importa PostgreSQL ou consumidores. SDK PDSH-023 usa a port pública e factory de composição; produto PDSH-026 exige coordenação própria.

## 8. Barra congelada de verificação

| ID  | Prova necessária em PDSH-021/022                                            | Caso que deve falhar                                               |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| S01 | envelope/schema v1 validado; round-trip dos 9 tipos                         | extra field, tipo/versão/fingerprint desconhecido, objeto não-JSON |
| S02 | append concorrente monotônico e replay em dois pools                        | mesmo id/payload divergente; sequence do caller                    |
| S03 | rollback/cursor sem consumo e restart com leitura equivalente               | falha entre INSERT e COMMIT, store indisponível                    |
| S04 | RLS com role non-BYPASSRLS e contexto ausente                               | tenant A lendo/inserindo no B                                      |
| S05 | UPDATE/DELETE/TRUNCATE recusados pelo DB                                    | DML por serving e trigger como defesa em profundidade              |
| S06 | catálogo determinístico e drift exit 1 em cópia temporária                  | novo tipo/schema sem regenerar                                     |
| S07 | integração KernelLog em turno sintético, dispatch bloqueado se append falha | tool/model alcançado antes de log                                  |
| S08 | leitura/projeção não mutam fontes                                           | caller alterando objeto devolvido afeta store                      |
| S09 | transform adjacente determinístico mantendo v1                              | pular geração, schema/fingerprint errado, mutação da origem        |

Gates: foco unitário, integração PG própria, conformidade, typecheck/lint/format/docs, superfície pública, fronteira e regressão completa no fechamento da onda. Sem provider real. Esta SPEC não contém PASS de BUILD ainda não executado.

## 9. Fechamento do cartão PDSH-020

- [x] Recon dos eventos reais e persistência registrado com paths.
- [x] Envelope v1, vocabulário fechado, imutabilidade, versão, RLS e limites especificados.
- [x] Transação/idempotência/concorrência/restart/unknown-version e migração adjacente definidos.
- [x] Evidência requerida para PDSH-021/022 congelada; pontos de integração sem spine paralelo definidos.
- Links/formato e registros de estado devem passar antes de marcar 020 DONE documental. Código ainda não implementado por este cartão.

Próxima ação executável: PDSH-021, implementar schemas/port + store e migração 0028 em uma fatia verificável, com guardas sintéticas e PG próprio.

## 10. Fechamento PDSH-021 — 12/10/2026

`DONE_LOCAL`, trilha T3 (contrato/schema), sob a autorização do plano. [Evidência](../04_audit/evidence/PDSH-021-20261012/summary.md).

- S01/S02/S08: schemas v1 em JSON imutável de contracts, validador fail-closed, port e store in-memory com snapshots, replay/conflito e sequência. Fingerprints incluem schema do tipo e todas as definições referenciadas.
- S02–S05: `PostgresSessionEventStore` tenant/schema-bound, transação exclusiva com tenant transaction-local, lock por stream, evento/cursor atômicos, validação na leitura e digest de input. Migração0028 dedicada, checks/uniqueness/FK/RLS e triggers de imutabilidade; serving non-BYPASSRLS apenas SELECT/INSERT em eventos, SELECT/INSERT/UPDATE em cursor. O limite físico JSONB é2MiB para seus espaços de formatação; ambos os stores continuam limitando os bytes canônicos a1MiB.
- S06: catálogo gerado de nove tipos, drift-check usa o mesmo serializador puro e SHA-256 sem build prévio. `session-catalog`/`session-catalog:check` publicados; gate CI fica PDSH-033.
- S07: `createSessionKernelLog` no port existente; composição repassa log aos perfis. Guardas executam logs de modelo/tool e negam dispatch se gravação prévia falhar. PUBLIC_API e PINNED atualizados.
- Recon de integração: canonical puro movido shared→contracts, shared reexporta o mesmo objeto/erro; arquitetura neutra preservada sem editar sua guarda. Closure de CI do consumidor ganhou contracts (só filtros); builder público agora inclui JSON na configuração temporária, sem aliases. Código do produto preservado.

Gates Node22.23.2: suíte com PG **380 arquivos/3226 PASS +1 skip**; PG padrão + guarda021 **38/311 PASS, zero skips**; E2E Chromium **12/12**; build público do consumidor PASS, fronteira PASS sem diagnósticos, typecheck/lint/formato/catálogos verdes. Fonte/compiled canonical e reflexão JSON estão em exceções restritas byte-pinned; self-review não concede aceite independente HISO-005.

Limites: schema dedicado não provisionado em destino real; binding tenant/role/pool cabe à composição. Migração não altera schemas legados nem faz backfill; rollback de deploy conserva fatos. Certificação completa/coverage nova ficam no fechamento da onda em candidata isolada (checkout compartilhado não sobrescreve certification alheia). Sem dados reais/provider/push/release; NO_GO. S09 fica PDSH-022; próximo: registro de transforms adjacentes de formato, sem mutar v1.
