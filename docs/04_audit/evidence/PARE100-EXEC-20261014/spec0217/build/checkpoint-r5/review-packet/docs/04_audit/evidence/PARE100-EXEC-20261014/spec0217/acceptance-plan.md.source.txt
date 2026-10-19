# SPEC0217 — plano executável de aceitação antes do gate

Estado: **R3 PLANNED / NOT_RUN**, após R2 recheck REVISE N1; os quatro remédios originais são preservados; não é revisão independente nem gate aprovado. [SPEC](../../../../02_spec/0217_pare100_durable_kernel_composition.md). Este documento congela os oráculos, não executa BUILD. Comandos abaixo serão válidos **depois** de implementar os arquivos novos propostos e registrar claims/gate T3; não confundir path de teste planejado com teste existente.

## Fixtures e caminhos propostos de QA

| Path novo proposto | Oráculos e boundary |
| --- | --- |
| `packages/platform/src/__tests__/controlled-kernel-continuation.test.ts` | Reidratação real da fachada/factory, S0/S1/S2, normalização parse1, atestação, máscara,23stops, ausência de host local e host inválido. K02/K04/K06/K07/K09/K11. |
| `packages/persistence/src/__tests__/controlled-published-kernel-postgres.test.ts` | Banco real: admissão atômica, races, binding/digest, fences, queue isolation, state/seals, RLS, checksum, append-only, poison/close/cancel. K04/K05/K08/K09/K10. |
| `apps/api/src/__tests__/published-durable-kernel-postgres.test.ts` | buildApi real+PG e webhook sintético, contrato queued, correlação, cancel QUEUED200/active409, GET/trajectory sem toolResult de sucesso no turno falho; sem efeito inline. K01/K06/K11. |
| `apps/worker/src/__tests__/published-durable-kernel-restart.integration.test.ts` | API real e workers filhos distintos, SIGKILL e reentrega, S1 positivo/S3 replay, faults e competição. K01–K12. |
| `apps/worker/src/__tests__/fixtures/published-kernel-child.ts` | Entry de teste chama API/worker root/controlled dispatch/adapter claim+ACK reais; compositor/fábrica são alcançados pelo effect do ACK. Injeta apenas barreira de processo e clocks/observadores sintéticos nos ports declarados. Não substitui factory nem planner/handler por sucesso mockado. |

Manter todas as suites atuais0214, API/worker published, operational-harness/kernel antigo e public surfaces. Paths novos de produção e ownership futuro constam da seção7 da SPEC; esta lane não escreve testes nem fixtures executáveis agora.

## Preparação, isolamento e evidências

Lead reserva PG, Node22 e os comandos globais antes de executar. Um cluster/container local próprio, URL apenas loopback e credenciais sintéticas; nenhum DB/volume/porta do usuário reutilizado. Schema exclusivo `pare100_217_<nonce>` e role serving non-superuser/non-BYPASSRLS, sem DDL e sem desabilitar triggers. Admin de fixture só cria/migra/inspeciona/desmonta schema/role próprios; verificações de tenant devem passar também pela role serving.

Fixture aplica migrações operacionais até0027+0029 via `runPostgresMigrations` com lista explícita, sem0028 dedicado. Cadastra agentes/version/prompt/controlados sintéticos pelas APIs/repositórios existentes, mesma tool `find_available_slots` do plugin scheduling.controlled. Nada de copiar pacientes, consultas reais, chaves, providers, HOME do usuário ou reference runtime. Usar mensagem sintética de intenção scheduling sem confirmar/cancelar/reagendar consulta; resposta são apenas constantes do plugin.

Todas as chamadas ao modelo fake e ao handler atestado devem ter contagem observável em processo externo ao worker e persistida pela fixture, além dos intents/receipts de PG. Observer é test-only e não muda handler/validator/atestado; observar através do wrapper de boundary e conferir a referência original das funções. Isso evita um falso positivo onde faltam logs mas um segundo handler executou. Guardar PID, argv, env allowlist sem segredos, start/end UTC, exit code/signal, barrier e timeout por child. Interrupção por pipe/IPC de fixture em marco de persistência comprovado, não sleep probabilístico.

Nunca escrever `TEST_DATABASE_URL` no log. Teste PG sem variável definida ou describe.skip é **BLOCKED/NOT_RUN**, não PASS. Checagem de counts no relatório exige todos K01–K12 efetivamente exercitados; qualquer skip desses oráculos bloqueia aceite. Nenhum retries de runner escondendo corrida. Child timeout mata somente PID/process group próprios; finalmente fechar API/pools, filhos, sockets, role/schema/container da fixture e conferir zero recursos próprios ativos.

## Procedimento K02: restart positivo após modelo

1. API real com `durableInbound=true`, pool do schema próprio, tenant/verificador sintéticos trusted; webhook retorna o envelope atual queued. Persistir IDs/correlation do resultado e consultar row inbound/outbox.
2. Child A em published-agent + flag proposta postgres-v1, max eventos limitado e workerIdA. Ele usa o handler/factory e ACK externo reais. Esperar notificação **após COMMIT** de S1+checkpoint+snapshot+plano, ainda dentro do effect do ACK externo e antes de retornar o saveCheckpoint ao loop. Não chamar inboundProcess/compositor diretamente. Conferir via outra conexão: same exec/trace/correlation, model count1, tool count0, source/prompt/fingerprint e usage debitados, lease innerA e outerA vivos; phaseState=IDLE_SEALED, planSealed=true, planOutcome ready, nextPlannerStep=2, comandos canônicos/inputHash e planDigest conferidos; outbox_events processing e outbox_effects ausente.
3. SIGKILL A e esperar exit.signal. Usar o perfil servido **outer10000ms/inner10000ms/renew2000ms**, timeoutMs60000 e a mesma autoridade DB. Aguardar expiração natural dos dois leases (no máximo nominal10s desde último tick de A), observando por SELECT clock_timestamp/lease_until; B usa ordinary claimNextFenced/poll250ms. Nenhum SQL admin antecipa expiry, nenhum teste muda TTL/clock e nenhum reset de journal/checkpoint/deadline é permitido. Registrar o expiresAt original e provar folga real até completion.
4. Child B, PID e workerId diferentes; carregar mesmo inbound. Deve recuperar0016, tomar attempt+1 e reidratar S1. Não passar output/snapshot por memória/IPC de A para B; a única continuação é PG.
5. Asserir sucesso final seguro: model count global1, planTools1, prepare/inputParse1 e handler count global1; contadores não incrementam modelo/plano/transform em B, journal CONFIRMED1/proposal exata, outer attempts incrementou e owner A→B com nonce de instância distinto, outbox_effects1+processed commitados juntos, tool/result terminal1 por operationKey, same exec/trace/correlation, trace closed/completed, wrapper completed e externalEffects false, state0016 SUCCEEDED, inbound completed1, trace de execução1 e outbound sintético1. Correlacionar audit chain/mirror e source hash; nenhum output residual em falha. Exigir conhecida falha quando fixture experimental ignora state/gera novo trace/chama provider de novo.
6. Reentregar mensagem/evento mais uma vez: nenhuma nova factory/model/body e nenhum novo trace/outbound/consumo; ledger segue imutável.

## Procedimento K03/K04: conclusão e janelas inseguras

- S3: matar depois do close transacional, antes de completion. Child B lê o trace fechado, chama completion idempotente e ACK; não chama factory/model/tool. Matar novamente após completion antes do COMMIT final ACK e provar no terceiro child que runtime_status completed impede nova factory/body, mesmo sem marker externo; ACK final então grava marker+processed uma vez. Se marker/processed já existem, o ACK pode pular handler e compositor. Não exigir reentrada depois de marker válido. Se takeover vence, retorno paused/supressão existente, sem responder nem executar novamente.
- Parametrizar kill/fault: model/request sem S1; consumeBoundApproval COMMIT atômico com consumption audit+receipt antes de ACK de transporte; receipt ausente não é resultado válido dessa tx e deve ser simulado somente como integridade inválida/unbound externo; journal RESERVED; EFFECT_STARTED; depois do body antes de confirm; CONFIRMED antes de callback/settlement/checkpoint; audit intermediário rejeita e final aceita; close ACK perdido. Em cada caso, snapshot/evidence/parent states têm expected oracle explícito da SPEC6.1.
- Nunca usar CONFIRMED isolado para criar trace succeeded. Asserir facts privados preservados e projection failed/H, toolResults.output null, parent RuntimeResult sem toolResult de sucesso. Nenhum segundo body/consume; se resultado do ACK for ambíguo, handoff, não retry de capacidade.
- Erro de DB durante latch/close: job recebe erro seguro e não reporta runtime completed. Recovery compara último resume seal e fases/tail5.2: OPEN/PENDING/ACKED-sem-seal/FAULTED fecha failure; IDLE_SEALED após erro pré-op sem intent/noACK/op0 pode retomar. Não prometer persistência de fault só RAM. ACK perdido do próprio seal com IDLE íntegro é metadata commit comprovado, distinto de efeito PENDING. S2 completo pode finalizar sem modelo/body; não alegar recuperação de uma janela sem seal.

## Concorrência, cancel/deadline, tenancy e controles

- K05: dois workers/pools/processos, barreira de corrida real em admit/claim com mesmo inbound; uma row binding/queue e uma entrada de handler. Terceiro worker neutro não reclama/recoverExpired essas rows. Depois de lease perdido, A tenta recordStep/saveCheckpoint/markStarted/confirm/appendEvidence/close e todos os writes de autoridade falham sem alterar vencedor. DB trigger contra writer antigo é negativo adicional, não só unit test de if.
- K06: cancel pelo endpoint existente em QUEUED vence claim, state CANCELLED e nenhuma chamada. Cancel CLAIMED/RUNNING mantém409; asserir que não foi aceito. AbortSignal de composição durante espera de approval/pause veta entrada, inclusive depois do consume; não release/reissue. Restart ultrapassando expiresAt preserva limite e uso, não renew. Deadline inclui downtime; finalização200ms permite apenas evidência/fechamento, nunca handler tardio.
- K07: setPaused real tenantA antes e depois de admission, takeover por sessão, pause promise rejeitada/pendente e falha de consulta. Testar ausência da linha pause e corrida de insert/upsert. Observar a linearização especificada, sem alegar cancel/pause físico depois de permit commit. TenantB não interfere.
- K08: consumeBoundApproval com authority0002/helper compartilhado/client único/tx única real, issuer diferente de executor, expiry/revoke/tenant/actor/version/input/proposal trocados e dois consumes concorrentes; ≤1consumo/body. Sem adapter0015 substituto. Cenários de approval usam actor/authority sintéticos injetados no boundary suportado, sem criar approval automático em worker público.
- K09: spy de ordem ao redor de portas reais para exigir close local síncrono antes de await terminal/projeção/tool.after; depois de close, forçar ACK tardio e chamar wrapper novamente: body não entra. Falhar/hangar cada port obrigatório; latch não é apagado por audit final bom. Telemetry/eventBus opcional não concede êxito nem apaga falha de evidence sink.
- K10: RLS/reuse de conexão e IDs colidentes entre tenants; schema/digests/state/checkpoint/proposal/fingerprint/eventSequence alterados; state antigo com revisão/fence vencido; migration interrompida/reexecutada, checksums históricos iguais; UPDATE/DELETE/TRUNCATE de evidence negados pela role serving. Não rodar migration0028 em schema de conversations. Se não houver proteção mixed-writer provada, enable bloqueado.
- K11: gateway opaco/procedência trocada/duas tools/injeção de host no corpo negam antes de consume/body. parse transform1 na entrada inicial, reidratação não reaplica; source/handler/validators precisam estar atestados.23stops preservados. API inline/TestLab/approval execute e defaults anteriores mantêm shapes/reasons, inclusive400 quando turno falho após consumed/CONFIRMED. Novo perfil não habilita RAG ou ferramenta extra.
- K12: capturar hashes de fonte/config/testes e build usado antes/depois, com comparação. Artefatos de processo e query PG não são substituíveis por snapshots de Map. Critic novo precisa executar um positivo e negativos próprios contra candidata selada, além de ler código/migration.


## R2 — contratos de corrida/phase e pares de crash obrigatórios

Este suplemento integra K01–K12; não substitui os negativos anteriores. Capturar contadores/eventos de **invocação** e os estados de PG por conexão serving separada. Publicar os snapshots antes/depois de cada barrier junto com attempts, owner, lease_until, expiresAt, sealId/consumedSealId, phaseState/revision, PENDING/ACKED/fault, receipt0002/consumptionAuditId, request/plan/checkpoint digests e outbox_effects. Sem inferir um fato privado pela resposta pública.

### R1 / K05 K06 K08 K10 — consumo execution-fenced

- Criar grant0002 real issued/unexpired com issuer≠executor e input canônico exato, exigido por requireCapabilityApproval do fixture trusted. Não alterar o único descriptor puro nem autoaprovar no worker público. Registrar fase approval.begin ACKed antes de entrar na transação de consumo.
- Corrida stale-before-root: bloquear A **antes de adquirir lock da execução** no novo consumeBoundApproval; conexões B/admin sintética fazem expirar e reclamar/fechar execução com attempt maior, ou cancelam QUEUED no recovery. Liberar A; state/fence guard deve falhar antes de mutação0002. Assert issued, consumedAt null, consumption-audit0/receipt-consumed0/body0 para A (intent PENDING anterior não conta como receipt de consumo).
- Corrida clock-after-wait: conexão C trava a row0002; A adquire execução/binding/outbox/sessão/pause e espera grant. Fazer expiresAt **kernel** ou lease inner/outer vencer, mantendo grant0002 ainda válido. B que tenta reclamar execução precisa esperar A; não alegar reclaim concorrente que passe por lock já retido. Liberar C; recheck DB de A depois do wait deve causar rollback/negação, issued sem consumption audit/receipt/body. B só reclama depois que o lock de A é solto. Variante lock de sessão/pause antes de grant cobre os demais waits.
- Corrida winner: todos os prazos vivos, A ganha locks, muta issued→consumed + audit + receipt/state + phase ACK no mesmo COMMIT. B não pode consumir nem executar body de A. Happy path tem1consumo≤1body; kill/ACK perdido pós-consumo tem receipt+consumed privados e segmento OPEN, recovery failed/handoff sem begin/body adicionais.
- Injetar rollback em consumo/audit/receipt/state/precommit deadline guard, separadamente: nenhum subconjunto de consumption audit/receipt/consumed persiste. Observar BEGIN/COMMIT/ROLLBACK **por operação**: tx de beginPhase já terminou; consumo tem exatamente uma raiz transacional, helper privado não abre BEGIN nem checkout, wrapper pool-backed não é chamado pelo branch bound. Contar total de transações do turno não substitui essa asserção.
- Exercitar public verifyAndConsume/get/issue/revoke unbound antes/depois de refactor: mesma assinatura/retornos/nulls, expiry e clock normalizados, consumo audit opcional,1uso e nenhum comportamento novo para callers antigos. Sem release/reissue ou flags HTTP executionFence.

### R2 / K02 K04 K11 — S1 com plano já selado

- Antes de plan.seal: model/result+guarded output conhecidos, checkpoint1 ainda não sealed; kill deixa segmento OPEN/model intent, sem S1. Após plano/parse e antes do COMMIT do seal: commands só locais e phase/tail persistido, também não S1. Ambos resultam failed/H em B, sem novo modelo/plano/body.
- Depois do seal: validar checkpoint1 real, RESPOND SUCCEEDED, planOutcome ready, command/inputHash/fingerprint/trace/correlation/nextStep2 e phaseState IDLE_SEALED. B resolve funções atestadas e valida canônico sem planTools/catalog de intenção/prepare/input parse novamente. Counting de planejamento e transformação é instrumentação no boundary original, sem trocar handler/validators nem fabricar atestação a partir de strings.
- Permitted vazio persiste ready/names[]/commands[]; invalid/opaco/N>1 persiste rejected sem comando executável; output rewritten/risk high/critical persiste suppressed, planSealed=true/outputAllowsTools=false e planning/consume/body0 inclusive em restart. Bootstrap não planeja. Rejeitar snapshot com planSealed false ou planDigest divergente em S1.

### R3 / K02 K04 K09 — estado distinguível e limite honesto

Executar o conjunto no mesmo tipo de API/worker/adapter e mesmo S1, com schemas/IDs isolados por caso. Não habilitar rede externa nem derrubar PG compartilhado para simular indisponibilidade; fixture controla somente suas conexões/transactions e prova COMMIT/ROLLBACK no banco próprio.

| Caso | Barrier/ação em A | PG depois de A morrer | Oráculo em B |
| --- | --- | --- | --- |
| P idle | Kill imediatamente depois de S1, antes de beginPhase completion.evaluate | IDLE_SEALED exato, sem tail/fault/intents | Continua pelo ACK real: model1/plan1/inputParse1/body1 total e sucesso fechado. |
| P0 noACK pré-op | beginPhase falha com rollback confirmado/sem ACK; não invocar evaluator/audit callback nem outra operação; poison/storage indisponível na tentativa; kill | Mesmo seal/cursor/revision idle, op-counter0, nenhum intent/poison | É attempt-local; A não retorna completed, B pode continuar como P. Não chamar isso de veto durável preservado. |
| N pending | beginPhase commit+ACK antes de evaluate; operação/audit posterior falha/rollback, poison indisponível; kill | consumedSealId + OPEN/PENDING persistidos | B não chama evaluator/body novamente; settlement-only registra recovery fault, fecha failed/H, zero body adicional. |
| N acked | beginPhase ACK e evento/receipt ACKED, depois falha antes de novo seal, poison indisponível; kill | OPEN/ACKED, sem novo seal | Não inferir sucesso a partir do ACK isolado: failed/H, sem novo body. |
| N ambiguous intent | beginPhase commitou, A não recebeu ACK e nunca chamou operação; kill | OPEN/PENDING | Conservador: failed/H; ausência de callback não apaga o intent. |
| N durable fault | Poison/dispatch_closed commitou, audit terminal depois aceita | FAULTED imutável | Sem reentrada/sucesso mesmo que audit final esteja saudável. |
| Seal rollback | saveResumePoint metadata falha sem COMMIT após progresso/plano ACKed | OPEN anterior, sem novo seal | Failed/H, sem reconstruir seal em memória. |
| Seal ACK perdido | saveResumePoint metadata commitou certificado snapshot/checkpoint/predecessors, resposta perdida antes de A continuar | IDLE_SEALED novo íntegro | Pode continuar somente daquele seal; não repetir capacidade/parse. Não é permissão para converter PENDING em seal. |

Known-bad obrigatório: versão da fixture/candidata que reseta OPEN/fault para snapshot anterior deve falhar N; versão fail-all deve falhar P/P0. Execução de callbacks antes de ACK beginPhase deve falhar contadores de P0. Alterar um ACK no log sem commit correspondendo é integridade inválida, nunca prova de safe resume. Verificar que o close local precede wrappers terminais **dentro** de execute, não só o finally da fachada.

### R4 / K01 K03 K05 K07 K12 — ACK externo real

- Todos os processos usam createControlledWorker/processNext ou continuous root com dispatch real, adapter PG tenant-scoped e effect real; APIs aceitam a mensagem. Testes que chamam inboundProcess/compositor diretamente não são K01/K02/K03. Incluir postgres-outbox.ts, postgres.ts, tenant-scoped wrappers, takeover/transaction/content/sanitizer helpers e este acceptance-plan no próximo packet de crítica.
- Em S1/S3 antes do ACK final: outbox_events processing/ownerA/attemptsN, outbox_attempts aberto e outbox_effects0. Matar A; para o positivo obrigatório, provar ambos leases naturalmente expirados sob o perfil real10s/2s, sem SQL admin de expiry nem TTL test-only. B claim externo increments attemptsN+1 e marca attempt antigo lease_expired, entra pelo ACK prep commitado e chega ao compositor com mesma identity inner. Se inner ainda leased, erro busy → fail/backoff, sem processed/marker/completed; não retornar normal busy.
- Kill após inner close antes de completion: B lê S3, zero factory/model/body adicionais e completa1. Kill após completion antes de COMMIT ACK final: B pode devolver already_completed sem compositor, depois marker+processed uma vez. Fault/rollback em insert de marker, update processed ou audit ACK deve reverter esses fatos juntos; o trace/completion inner já commitados permanecem e não provocam reexecução.
- Marker já existente com processing/processed correto exige skip de handler pelo ACK; marker event_id diferente ou processed sem marker é erro, não sucesso. Takeover em qualquer read autoritativo mantém supressão dead_letter/handoff e não cria marker de êxito falso nem retomada automática. Caso trace falho já pediu handoff durante completion, essa supressão final é o resultado externo esperado.
- Pool/lease/workerId: testar configuração nova concurrency1/poolmax4 e erro fechado se pool/perfil incompleto. ACK segura uma conexão fora da tx; provar que inner usa outro client sem nested tx e que pool1 não é aceito. Processo B recebe nonce diferente mesmo com a mesma base CVG_WORKER_ID; ACK/fail antigos de A não afetam ownerB. O heartbeat PG atual não renova; o perfil novo exige métodos fenced NOVOS e registry único descritos na SPEC2.3. Provar renovação10s/2s efetiva nos dois routes, sem cast heartbeatClaim sem expectedAttempt; guardas mantêm ambos fences mesmo após tick bom.

## R3 / N1 — lease real, renovação, lifecycle e timelines

Este bloco é obrigatório em K02/K05/K06/K09/K10/K11/K12 e preserva todos os pares/corridas R2. Fixtures usam **o mesmo perfil servido** outer10000ms, inner10000ms, tick2000ms, concurrency1/pool4 e timeoutMs60000. Não há options de fixture reduzindo TTL, clock independente, alteração administrativa de lease para demonstrar liveness, bypass de claim/ACK ou extensão de kernel deadline. Instrumentação só observa/segura o barrier S1/ports de falha test-only; não altera port authority/atestado.

### N1-P — positive SIGKILL/S1 pelo claim real

1. Parametrizar controlled e continuous com root/new registry e ports fenced reais; mesma base CVG_WORKER_ID em A/B para conferir nonce distinto. API recebe inbound sintético, A chega pelo ACK real a S1 IDLE_SEALED model1/plan1/inputParse1/body0. Esperar ao menos um tick pareado real e guardar DBnow, owner/attempt, ambos lease_until e expiresAt (fixado por startPrepared).
2. Em fixture saudável alvo t≈2s após claim/S1, SIGKILL A e aguardar exit.signal. Heartbeat morre com o processo; nenhum lease é liberado antecipadamente. Iniciar B (readiness≤5000ms) e deixar poll250ms/ordinary claim recusarem a row até expiry. Observar que não houve reentry antes de outerLeaseUntil.
3. Após aproximadamente10s desde último tick, B reclama outer, increments attempt, reclama inner com active_outer binding novo, attach/renew antes de kernel e reidrata S1 sem novo plan/model/input parse. Asserir completion DB antes do expiresAt **original** (no exemplo dentro de60s, geralmente t≈14–17s). Tempo real observado faz parte do aceite; números da SPEC não são resultado atual.
4. Conferir closed trace,1body/model/plan/inputParse total, ids estáveis, callbacks/audits/masks já definidos, outbox marker+processed e expected attempts. Não aceitar fail-all, deadline reset, TTL reduzido ou compositor chamado diretamente como esse positivo.

### N1-L / N1-E — live renewal e esgotamento honesto

- Live: manter A em S1 por **25s**, sem matar nem abrir fase seguinte, com modelo budget60s. Pelo menos duas TTLs de10s passam; consultar várias vezes DB antes/depois de ticks para provar que **ambos** lease_until avançam e attempts/owners/phase/seal/expiresAt não mudam. B ordinary claim não pode obter o evento; liberar barrier deixa A completar1body. Repetir controlled e continuous para detectar timer ausente num route e loop duplo no outro.
- Exhausted: mesmo perfil/budget60s e kill S1; iniciar B somente após DB clock_timestamp>expiresAt+1000ms, com elapsed real observado. Não mudar linhas ou relógio. B pode reclamar transporte e fazer settlement-only, mas nenhum renew/factory/consume/body reativa kernel expirado. Assert MAX_DURATION/failed/H e counters model/plan/inputParse iguais a A e body0. O timeout do runner deve comportar60s+setup/reclaim/cleanup; usar120000ms por caso, sem skip silencioso.
- Unbound/default: métodos/callers antigos continuam nos seus clocks/ports e sem registry opt-in. Perfil novo sem port fenced ou attempt PG positivo/owner/lease recusa antes de capacidade. Unknown expectedAttempt não vira0 e optional cast legado não é prova de renewal. Produção continua recusada, uma tool pura e assinatura local0214 preservadas.

### N1-R — renovação autoritativa e stale attempts

- Outer renew real em conexão separada: tenant/id/owner/expectedOuterAttempt/live lease/status exatos; row locked→DBclock fresco→UPDATE CAS. Manter lock numa terceira conexão até **depois** de lease_until; liberar. Renew deve negar, sem acrescentar10s a lease vencido. Capturar begin/commit/rollback por operação para excluir nested BEGIN/client split. Injetar stop após cleanup tenant e antes de COMMIT no novo runner guardado: deve rollback/cleanup, não commitar só porque o helper público atual não tem hook; o caminho unbound desse helper permanece igual.
- Casos tenant errado, owner antigo, attempts antigo com owner propositalmente igual, expectedAttemptRowId histórico mesmo se requeue resetou contador e owner voltou a coincidir, processing reclaimed por B, failed/dead_letter/processed e S3/closed inner negam. Não reutilizar o método sem attempt do fallback. Uma tentativa A bloqueada no checkout/row lock não pode renovar o evento reclamado por B quando sua promise for liberada.
- Paired renew é atômico: injetar falha no UPDATE execução, queue inner, outer e no COMMIT/ACK separadamente. Rollback mantém TTLs anteriores juntos; ACK ambíguo aborta A e não agenda outro tick. Não modifica expiresAt/usage/fingerprint/phase/cursor/attempt. Ganhar renewal vivo legítimo aumenta leases10s sem interferir nos intents5.2.
- Perda de outer **ou** inner após último tick bom deve ainda barrar consumo0002/permit/checkpoint/close em guardas DB, inclusive antes do próximo tick. Nenhuma capacidade é autorizada só por cached lastRenewal.

### N1-C — um owner, cancel/join/detach e pool4

- Instrumentar factory/registry/job para provar um handle por claim, um único timer, no máximo um renewal inFlight e **zero** startHeartbeat legado no continuous opt-in; compositor não cria timer inner próprio. Controlled e continuous passam o mesmo signal até as guardas/model/tool. Referências vêm do claim PG, outbox_attempts.id retornado pelo modo fenced e dos fences, nunca corpo HTTP. Assert que old envelope sem attemptRowId é recusado pelo perfil e que renew/ACK/fail atualizam só a row de attempt exata.
- Rejection, timeout, malformed return, wrong owner/attempt/status, lost renewal ACK e pool checkout que excede budget fixam primeiro failure e abortam attemptController imediatamente. Segurar fake provider/audit/approval até o erro e depois liberar: A não entra em novo body/consume, late ACK não limpa falha nem reinicia loop. Contadores/fatos privados e pares P/P0/N5.2 continuam válidos; heartbeat metadata não apaga fase OPEN.
- Parar enquanto tick espera checkout, lock, query e COMMIT/ACK. requestStop limpa timer/cancela geração; promise fica rastreada até rollback/cleanup/release. Liberar callback tardio depois de STOPPING e comprovar que não começa novo SQL e não há renewal depois de close/ACK/fail/pool.end. Caso cancel esperado deve ser distinguido de erro real concorrente, que continua veto. Não aceitar Promise.race que devolve stopped deixando inFlight pendurado.
- Final saudável: primeiro wrapper terminal fecha local sincronicamente/requestStop, junta renewal real antes de close PG; beforeFinalAck roda fora da tx e junta o mesmo handle. Error/busy: parar/juntar e apenas job chama failClaim uma vez. Post-inner close remove target da renovação sem reattach/loop outer restante. S3 replay em novo claim não renova execução fechada e para transporte antes de completion/finalACK. SQL CAS fechado é defesa mesmo contra tick atrasado.
- Shutdown controlled e continuous com claim em aquisição e com handler em voo: registry stopClaims cancela ambos, não perde slot, nenhum fail paralelo legado, join de renewals antes de settlement/jobdrain/pool.end. Se join/drain não pode ser confirmado, shutdown é erro e não reporte completed/stopped saudável. Main controlled não pode apenas await drain sem abort; continuous não executa release loop velho sobre handlers ativos no perfil novo.
- Pool max4 real: ACK retém um client sem tx; foreground inner usa um; tick pareado usa um; cleanup/liveness tem o quarto. Com artificial query delay observar não sobreposição/nested checkout sob tx; nenhum lock externo é mantido ao obter inner client. Todo timeout retorna conexão limpa ou destruída, zero timers/promises/clients próprios no fim. Global stopAndDrain não é chamado de dentro do job que ele aguarda; handle.stopAndJoin junta apenas renewal.

Os casos120s são futuros; esta lane não espera timers nem executa app/PG. Focar source/gates de certificação ou Python não contribui para este desenho e continua fora do escopo.

## Comandos planejados após BUILD aprovado

Executar do worktree, Node22. `TEST_DATABASE_URL` deve ser injetada pelo dono do recurso; os testes criam isolamento e validam serving role, não expor valor. O bloqueio explícito por ausência da variável evita suite PG silenciosamente skipada.

```sh
set -eu
node scripts/node-version-preflight.mjs
npm run typecheck
npm run lint
node_modules/.bin/vitest run packages/platform/src/__tests__/controlled-kernel-continuation.test.ts --no-file-parallelism --maxWorkers=1
test -n "$TEST_DATABASE_URL"
node_modules/.bin/vitest run packages/persistence/src/__tests__/controlled-published-kernel-postgres.test.ts apps/api/src/__tests__/published-durable-kernel-postgres.test.ts apps/worker/src/__tests__/published-durable-kernel-restart.integration.test.ts --testTimeout=120000 --no-file-parallelism --maxWorkers=1 --reporter=json --outputFile=docs/04_audit/evidence/PARE100-EXEC-20261014/spec0217/build-future/focused-results.json
```

O Lead cria diretório build-future somente na rodada de BUILD autorizada, valida exit code/counts de cada teste/K, e preserva stdout/stderr inclusive falhas; não gerar arquivos vazios sem sidecar explícito. Publicar relatório JSON não é aceite automático.

Regressão obrigatória da candidata estável, com claims próprios de recursos/outputs globais e sem encadear BUILD nesta lane:

```sh
npm test
npm run test:postgres
npm run test:e2e
npm run test:coverage
npm run test:coverage:per-file
npm run build:harness
npm run build:runtime
npm run boundary:products
npm run docs:check-links
```

Acrescentar os testes novos PG ao script test:postgres fica com o Lead/manifests em rodada futura, não assumido existente. Build/smoke dos exports platform/API/worker deve usar o processo atual de build público e provar o mesmo binding/mascaramento nos emits; não modificar checker/qualificações0215/0216 para esconder novos sites. Certify/SBOM/licenses só pelo Lead com claim, na candidata estável quando aplicável; não são comandos desta lane.

Gate final desta fatia: todos K01–K12, pares/corridas R2 e N1-P/L/E/R/C acima executados, zero oráculo obrigatório skipado, atual candidatura/hashes conferidos e crítica independente favorável. Falha/unknown não é PASS parcial. Mesmo um aceite local completo desses oráculos não fecha P100-010 nem autoriza produção, dado real, provider, release ou ferramentas sensíveis.
