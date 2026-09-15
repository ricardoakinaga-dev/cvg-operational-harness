# Auditoria independente backend — 2026-09-13

Escopo somente leitura do produto, sem BUILD. Fatos CURRENT resultam de leitura do código atual; nenhuma nota/parecer anterior foi usada. Probe executado usa apenas banco PostgreSQL descartável `cvg_backend_probe`, porta loopback 55583, dados sintéticos. Gates globais e testes das bibliotecas serão executados/consolidados pelo líder; não afirmar PASS nesses testes a partir desta lane.

## Conclusão

Há implementação substancial de backend controlado, SQL para jornadas, outbox e journals, além de kernel governado com proposta imutável, autorização, execução e incerteza. Entretanto, o caminho público continua `API/worker -> executePublishedAgent -> platform.executeConfiguredAgent -> DeterministicModelProvider`; não compõe `GovernedAgentRuntime`, `ModelGateway`, journals governados e canal. O modelo ignora prompt e devolve fallback determinístico. Isso limita a aderência integrada mesmo quando as bibliotecas são sofisticadas.

## Notas independentes por dimensão (inputs, não certificação)

Escala solicitada: 0 ausente, 25 scaffold, 50 parcial, 75 funcional local limitado, 90 integrado com evidência forte, 100 integralmente demonstrado. As notas abaixo avaliam produto conectado; nota de biblioteca é contextual, não substitui produto. Ausência de execução completa nesta lane impede 90–100.

| Dimensão | Nota | Evidência e limite |
|---|---:|---|
| Arquitetura e runtime canônico | 50 | API chama executePublishedAgent (`apps/api/src/server.ts:3352`), que chama platform (`packages/agent-core/src/commands/execute-published-agent.ts:87`); kernel separado `packages/agent-runtime/src/runtime.ts:333`. AAA Q-A01 exige composição única. |
| Approval ligado ao efeito | 55 | Kernel (aprox. 75 local) revalida payload/hash (`runtime.ts:1113`, `1121`, `1145`), reserva antes do efeito (`1228`), usa payload armazenado (`1394`), confirma journal depois (`1502`). Entry point não usa este kernel. |
| Policy, default deny e ações bloqueadas | 70 | `packages/policy-engine/src/engine.ts:141` tenant mismatch, `181` action/capability mismatch, `373` DENY; plataforma possui policy própria. Draft SQL mantém confirmationBlocked=true (`journeys-postgres.ts:734`). |
| Identidade HTTP | 65 | API exige resolver fora de test (`server.ts:3746`), startup production sem resolver falha (`5113`); main.ts não injeta resolver. Resolver HMAC existe (`operator-identity.ts:56`), com replay local, não IdP integrado. |
| Isolamento tenant/SQL | 70 | API valida papéis/RLS (`server.ts:5150`, `5206`); withTenantContext limpa/destrói conexão (`tenant-scoped-postgres.ts:84`, `139`). Worker apenas confere flag (`postgres-controlled.ts:85`) e cria pool, sem inspecionar papel real. |
| Persistência de jornadas | 60 | Repositório PostgreSQL concreto composto (`server.ts:4923`) e UNIQUE tenant/idempotency (`journeys-postgres.ts:495`); falha audit deixa mutação persistida (probe abaixo). Não é mais somente memória. |
| Atomicidade/audit/replay | 55 | Outbox tem BEGIN/COMMIT explícito (`postgres.ts:370`); jornadas não compartilham transação de mutação/audit. Journals separados não equivalem à execução pública governada. |
| Worker durável/contínuo | 70 | Loop, concurrency, lease, backoff e stop reais (`continuous-worker.ts:131`, `394`, `566`); handlers inbound persistem conclusão (`postgres-controlled.ts:374`), outbound suprimido (`391`), sweeps não compostos (`main.ts:172`). |
| Canal e efeitos incertos | 55 | Biblioteca (aprox. 75 local) reserva (`channel-gateway/src/gateway.ts:202`), claim (`258`), send (`277`), confirma (`289`) e marca uncertain (`317`); SQL adapter existe. Worker público não envia. |
| Limites/modelo/execução | 55 | Kernel checa deadline/steps (`runtime.ts:490`, `521`) e custo (`752`); ModelGateway abort/reservas (`model-gateway/src/gateway.ts:259`, `296`). Runtime público usa fake (`platform/src/model-provider.ts:4`, `37`), sem composição destes controles. |
| RAG institucional | 55 | Plataforma exige binding fonte/versão habilitado (`platform/src/test-lab.ts:633`); ausência gera handoff (`298`). Catálogo local versionado existe (`rag/src/institutional-rag.ts:27`), mas resolver exige injeção (`server.ts:4963`); worker default não injeta fonte. Segurança de ausência funcional, resposta institucional integrada não demonstrada. |
| Integrações externas do MVP | 40 | Adapters/bibliotecas existem, mas runtime público deterministic + outbound suppressed; não demonstrado percurso HIS/Desk/CIP/canal externo. Ausência é deliberada no modo controlado, não autorização para integrar. |
| Observabilidade/readiness backend | 50 | Traces e métricas existem; `/ready` usa só flags (`readiness.ts:20`, `35`, `43`) e jamais consulta disponibilidade DB/journal. SPEC 0113 e Q-A14-02 exigem probe real. |

## Achados priorizados

### BACKEND-01 — P1 — Jornada pode persistir sem auditoria, e replay não repara (FAIL executado)

Invariante: mutação de jornada e evento auditável devem sobreviver juntos ou falhar juntos (SPEC 0124, seção Auditoria; 0109 auditoria/consistência).

`PostgresJourneyRepository.createOwnerDraft` usa `withTenantContext` (`packages/persistence/src/journeys-postgres.ts:205`). Esse wrapper (`tenant-scoped-postgres.ts:84`) configura tenant e limpa contexto, mas não abre transação. `createOwnerDraftScoped` faz INSERT em `491`, depois append audit em `523`. Se auditoria falha, o INSERT já foi commitado pelo PostgreSQL. Retry encontra existing e retorna em `467`, sem tentar reparar audit. O mesmo desenho aparece em criação patient/appointment (INSERT `637`/`742`, audit posterior).

Probe com código atual e PostgreSQL real: `/tmp/cvg-audit-backend-pg-probe.ts`; saída `/tmp/cvg-audit-backend-pg-probe.log`:

```json
{"firstError":"synthetic audit failure","draftsAfterFailedMutation":1,"replayStatus":"draft","auditRowsAfterReplay":0}
```

O probe aplicou migrations oficiais em banco exclusivo, instalou trigger sintético para falhar INSERT audit_events, tentou criar owner draft, removeu trigger e repetiu mesma idempotency key. A perda de atomicidade foi observada, não inferida apenas do código. Não testou cross-tenant nesse probe; conexão privilegiada foi usada somente para injeção no banco descartável.

Correção proposta para futura task BUILD: transação curta por mutação SQL + auditoria na mesma conexão; teste rollback e retry após falha audit; revisão dos demais métodos de jornada. Não usar transação ao redor de I/O externo.

### BACKEND-02 — P1 — Kernel AAA não integrado ao entrypoint (CURRENT estático)

AAA Q-A01-01/Q-A01-02 exigem identity→policy→approval→runtime→persistence→fake channel integrado e runtime canônico. `main.ts:7` chama buildServerFromEnv sem composição especial; server `3352` usa executePublishedAgent, que chama platform/test-lab `87`; `platform/src/test-lab.ts:206` resolve modelo controlado; `model-provider.ts:37` ignora prompt e retorna fallback. `GovernedAgentRuntime` existe, mas não é importado por API/worker. Não transportar resultados de testes desse kernel para a jornada pública.

Ações reais permanecem bloqueadas; o achado é aderência/composição, não evidência de ação real indevida. Próxima task deve decidir runtime canônico e provar percurso público inteiro em fixtures.

### BACKEND-03 — P1 — ApprovalStore do kernel é somente memória (CURRENT estático)

`packages/approval-engine/src/store.ts:26` é a única implementação encontrada da porta ApprovalStore; `engine.ts:118` usa esse default. Journals File/PostgreSQL são duráveis, mas aprovação/proposta/reservation do kernel desaparecem com recriação do processo/store. Persistência `PostgresCapabilityApprovalRepository` implementa outro contrato (`CapabilityApprovalAuthority` da plataforma), não ApprovalStore. Assim, persistir journal não demonstra recovery completo de approval→efeito após restart do kernel.

Próxima task: definir adapter persistente para a mesma autoridade do runtime canônico, com teste restart, estado EXECUTING/UNCERTAIN e replay. Não afirmar bug de duplicação observado; lacuna de composição/persistência.

### BACKEND-04 — P1 — Readiness não prova dependências (CURRENT estático)

`apps/api/src/readiness.ts:35` marca PostgreSQL ok só porque modo é postgres; `43` marca durabilidade ok pelo boolean. `/ready` (`server.ts:445`) não executa query nem verifica worker/queue/journal. Uma indisponibilidade após startup não altera esse resultado. Exigências explícitas: SPEC 0113 Health checks e Q-A14-02.

### BACKEND-05 — P2 — Startup worker não verifica papel/RLS reais (CURRENT estático)

`worker.ts:120` e `postgres-controlled.ts:85` conferem apenas POSTGRES_RLS_ENFORCEMENT=true; `postgres-controlled.ts:98` cria Pool e wrappers, sem consultas a pg_roles/schema. API possui essas verificações (`server.ts:5150`). Um DATABASE_URL privilegiado não é recusado por esse entrypoint. Não é prova de vazamento ocorrido; é defesa ausente em fronteira configurável. Worker permanece restrito a controlled/non-production. Validar papel efetivo e policies antes de consumir, reutilizando contrato de bootstrap.

### BACKEND-06 — P2 — Auditoria de jornadas perde ator/correlação da chamada (CURRENT estático)

`journeys-postgres.ts:1053` fixa actor System/journey-r3; `1062` fabrica correlation ID do resource ID. As rotas recebem identidade/correlation, mas contrato da mutação não as passa ao audit. SPEC 0111 requer quem executou e SPEC 0113 correlação webhook→efeito. A linha auditável fica semanticamente incompleta mesmo no sucesso.

### BACKEND-07 — P2 — Sweeps/RAG/outbound não compostos no worker (CURRENT estático)

`apps/worker/src/main.ts:172` registra sweeps disabled; `postgres-controlled.ts:352` chama executePublishedAgent sem resolver knowledge; `391` outbound suppressed. Há bibliotecas/test seams, mas expiração periódica integrada, RAG institucional e entrega não são comportamentos atuais deste entrypoint. Manter limites explícitos e provar composição controlada antes de ampliar claims.

## Fronteiras, padrões e limites

Baseline selecionada para orientação: monólito modular + transações locais curtas + outbox/journal; rejeitados como desnecessários microserviços e transação distribuída. Invariantes: efeito igual à proposta; nenhum falso EXECUTED; replay não duplica; tenant autorizado no servidor; mutação auditada; fonte ausente faz handoff. Não implementado nada nesta rodada. Arquivo journal usa write+rename (`effect-journal.ts:791`) e lock local; não extrapolar para durabilidade entre hosts ou pane de máquina sem fsync comprovado.

Provas executadas: migrations oficiais em banco descartável + injeção PostgreSQL audit-failure + leitura persistente/replay. NOT_RUN nesta lane: suites completas do kernel, concorrência SQL, crash real de processo, harness HTTP completo, carga, providers externos. Um primeiro ensaio com SQL mock parou na validação do tenant inválido e não foi usado como evidência; foi substituído pelo probe PostgreSQL válido.

## Documentos e skill lidos

- `docs/07_agents/AGENTS.md` integral.
- `docs/99_runtime_state.md`, `docs/20_master_execution_log.md`, `docs/30_backlog_master.md`: somente estrutura/trechos procedurais de continuidade; não usar notas/pareceres históricos como verdade nesta auditoria. Atualização cabe ao líder, esta lane não edita repo.
- `docs/02_spec/0101_visao_arquitetural.md`, `0109_dados_e_persistencia.md`, `0110_consistencia_integridade_e_migracoes.md`, `0111_permissoes_governanca_e_auditoria.md`, `0112_integracoes_externas.md`, `0113_observabilidade_runtime_e_operacao.md`, `0124_rem0539_r3_contract.md`.
- `docs/02_spec/aaa_execution_contract.md`, `aaa_data_api_contract.md`: contratos normativos; saída conjunta extensa truncou parte intermediária, portanto não alego revisão de todas as cláusulas.
- `docs/02_spec/aaa_quality_contract.md`: rubrica/IDs normativos como referência da avaliação; pontuação final 5x20 cabe líder.
- `/home/ricardo/.codex/skills/backend-patterns/SKILL.md`, `references/pattern-index.md`, `references/transaction-patterns.md` (trecho orientador).

Hashes dos arquivos ligados ao probe/caminho: `/tmp/cvg-audit-backend-hashes.txt`. Sem auditoria anterior aberta. Sem dados reais, alteração de produto, autorização operacional ou qualificação de produção.
