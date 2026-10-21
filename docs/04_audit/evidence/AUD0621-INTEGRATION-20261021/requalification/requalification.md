# AUD0621-REQUALIFY-20261021 — requalificação crítica independente

- Task: `AUD0621-REQUALIFY-20261021` (filha de `AUD0621-REMEDIATION-20261020`).
- Candidata: `/mnt/dados/cvg-work/cvg-aud0621-integration-20261021`. A revisão foi feita na HEAD `97d436a6` (base `05d4a30a`) e reconferida na HEAD `a81a0d03`, o commit novo do lead que fecha M2 e M3.
- Data: 21/10/2026. Node 22.23.2 fixo, `--maxWorkers=1`. PostgreSQL 16 próprio (`cvg-aud0621-requalify-pg`, porta 56264), já removido.
- Nada foi editado na candidata nem no checkout principal. Todos os arquivos do crítico estão em `/mnt/dados/cvg-work/aud0621-int-runtime/critic/`.

## Veredito: REQUEST_CHANGES

Nenhum dos 26 defeitos do relatório 0621 reproduz na candidata. Na HEAD `97d436a6`, a integração das frentes tinha deixado quatro pendências locais que bloqueavam o PR. O commit `a81a0d03` do lead fechou M2 e M3. Seguem abertos:

- **M1:** teste vermelho;
- **M4:** registro dos resíduos nos ledgers, para que o PR não declare fechado o que não está.

**Conferência do `a81a0d03`:**
- M2: o catálogo agora tem 39 entradas, 0 com deriva de hash, e as contagens batem com a medição sem PostgreSQL (`out/nopg-skip-counts.json`).
- M3: a prova faz roll-forward da 0029 sobre a 0027. A lista de rollback cobre tudo o que a 0029 cria:
  - as 5 tabelas, que levam junto índices, triggers, policies, FKs, comentários e grants;
  - as 5 funções;
  - a constraint `audit_events_tenant_id_id_key`, que só a 0029 cria;
  - a ordem é válida: a FK de `case_audit_links` cai antes da constraint.
- A prova não foi reexecutada, conforme a orientação do lead.

## Obrigatórios (só itens locais que bloqueiam o PR)

**M1. Teste da frente 0250 vermelho na candidata integrada.**
- Arquivo: `apps/api/src/__tests__/task-status-atomicity.test.ts`. P1 falha em `:150` e P3 em `:194`; os dois recebem 0 eventos.
- Causa: o helper `statusEvents` (`:62-78`) lê `/v1/audit/sessions/:id`. Depois do `48c8607c` (SPEC0176), esse leitor só devolve eventos que o produtor vinculou à sessão (`apps/api/src/case-authorization/case-routes.ts:605`). O audit da transição de task não é vinculado.
- O delta do lead `553564ee` ajustou `task-lifecycle` e `critical-flows`, mas não este arquivo.
- Efeito colateral: a checagem "nenhum evento após a falha" do P3 ficou vazia e passaria mesmo com o defeito.
- Correção mínima: ler `/v1/observability/audit-evidence?sessionId=` como Supervisor, como o `48c8607c` fez em `task-lifecycle.test.ts`. A alternativa é vincular o audit da transição à sessão (opcional O2).

**M2. Deriva do catálogo de skips. RESOLVIDO em `a81a0d03`.**
- Arquivo: `scripts/skip-catalog.json`. Na base `05d4a30a` não havia deriva nenhuma; na candidata, 11 entradas têm `sourceSha256` divergente:
  - SKIP-PG-004, 007, 010, 012, 015, 017, 019, 027, 029, 032 e 035;
  - linhas 39, 72, 105, 127, 160, 182, 204, 292, 314, 347 e 380.
- O próprio `certification/skip-inventory.json` do working tree do lead já registra as 11 falhas `skip_catalog_source_drift`. As entradas 015 e 017 vêm do delta do lead (`553564ee`).
- Contagens sem PostgreSQL também mudaram (`expectedSkippedTests`):

| Entrada | Catálogo | Medido |
| --- | --- | --- |
| SKIP-PG-010 | 2 | 4 |
| SKIP-PG-012 | 4 | 5 |
| SKIP-PG-019 | 13 | 16 |
| SKIP-PG-027 | 2 | 3 |
| SKIP-PG-029 | 4 | 9 |

- Faltam entradas novas para `apps/api/src/__tests__/case-assignment-authorization-postgres.test.ts` (8 skips) e `apps/api/src/__tests__/task-approval-postgres.test.ts` (3 skips).
- Prova: `out/nopg-skip-counts.json` e o recálculo de hashes em Python.

**M3. Prova `rem21-010` sem a 0029 no commit. RESOLVIDO em `a81a0d03`.** O texto abaixo descreve o estado da HEAD `97d436a6`.
- Na HEAD, `scripts/rem21-010-postgres-proof.ts:75` ainda faz roll-forward da `0027_worker_operations`, e a lista pré-roll-forward termina na 0026. A migração nova, 0029, fica fora do ensaio de restore e roll-forward.
- O working tree do lead já tem a correção (roll-forward 0029 e rollback das `case_*`), com evidência regenerada às 03:56Z, mas não está commitada.
- Ação: commitar a correção e a evidência na candidata do PR.

**M4. Registro nos ledgers, relatório e backlog. Não marcar como FIXED:**
- **F01, resíduo da mesma classe (P1):** `GET /v1/tasks` e `GET /v1/approvals` devolvem a Operator sem vínculo a descrição e o resumo com o marcador privado, e o `PATCH /v1/tasks/:id/status` de caso alheio responde 200 (sonda `api/api.test.ts#f01-trusted-configured`).
- **Modo trusted:** toda leitura de caso responde 503 até existir o produtor verificado de `case_principals` (SPEC0152). `buildServerFromEnv` nunca configura `casePrincipalAuthority` (`apps/api/src/server.ts:353,769`; `case-routes.ts:105-112`).
- **F25:** ficam abertos o backup/restore, o alerta e o stop próprios do produto (PISO-008), o firewall no host e a imagem pela receita no CI.
- **F21:** ficam abertos os resíduos da HISO-011.

## Tabela F01–F26

| ID | Veredito | Prova | O que falta |
| --- | --- | --- | --- |
| F01 | CLOSED_LOCAL_ONLY | Sonda do auditor dá 503 (falha fechada). Em trusted com autoridade configurada: lista vazia, timeline e auditoria 404; com grant, 200; depois do revoke, 404. Em simulação, Operator e Approver sem vínculo recebem 404. Testes: `case-read-authorization-f01` 2/2, `case-assignment-authorization` 14/14, `case-projections` 35/35, PG `case-assignment-authorization-postgres` 8/8. | Ambiente real: produtor verificado de `case_principals` (SPEC0152/IdP); sem ele, trusted dá 503. Resíduo P1 a registrar (M4): tasks, approvals e PATCH sem escopo por caso. |
| F02 | CLOSED | Sondas: `zero-model-budget` 0 chamadas; `repair-overrun` 1 chamada; `lost-orchestration-usage` com uso 22/24/0,10 preservado; `tokens-overrun` dá MAX_TOKENS em 1 chamada. Código: porta `decisionGate` em `iterative-runtime.ts:1157` e `hybrid-orchestrator.ts:224,315`. `aud0621-0248-decision-budget` 30/30. | Orquestrador de terceiros sem a porta segue limitado só pela parada pós-uso (declarado na SPEC0248 §6). |
| F03 | CLOSED | `context-deadline`: CANCELLED antes de liberar o build, 0 decisões. Só com prazo: MAX_DURATION "…while building the decision context." com 0 chamadas. `race` em `iterative-runtime.ts:1074`. | — |
| F04 | CLOSED | `orchestrator-cancel`: encerra no cancel e o sinal chega abortado. Prazo na decisão aborta o sinal. Checagem R6 antes do despacho em `:951`; `AbortSignal.any` em `:1094`. | — |
| F05 | CLOSED | Sonda `worker-rls-preflight`: o preflight recusa o journal sem RLS. Com RLS desligado, o sweep sob o tenant A deixa a linha de B em RESERVED (predicado em `effect-journal-postgres.ts:281,295`). Inventário completo em `postgres-role-preflight.ts:25`. `postgres-role-preflight` PG 16/16. | — |
| F06 | CLOSED | A sonda original já não roda: o token é obrigatório. Na adaptada, a tentativa velha com o mesmo workerId recebe `conflict` em fail e ack, a renovação dá null e o claim novo segue `processing`. PG `outbox-durability` AC03–AC05 e `continuous-worker-postgres` AC06. | Opcional: o adaptador em memória aceita ack/fail sem token (`outbox.ts:791,820`). |
| F07 | CLOSED | Sonda do auditor: continua pendente e é reenfileirada. Adaptada: tentativa e próximo horário persistidos, sobrevive a restart e é reprocessada; orçamento de 5 sem laço. `inbox-outbox-reliability`. | — |
| F08 | CLOSED | Rascunho sem tarefa nem lembrete; `ok` ativa as pendências na mesma linha (`assistant.ts:702`). `confirmation-reliability`. | Opcional: recibo do preview ou hash da revisão no `ok` simples (`assistant.ts:711`). |
| F09 | CLOSED | Homônimos sem ID pela ordem; confirmação bloqueada; memória só de notas confirmadas (sondas `homonym-*`). | SourceEvidence depende de D2 (NO_MODEL). |
| F10 | CLOSED | Recomposto sem A: 0 envios a A (destinatário revalidado em `assistant.ts:315-320`). | Opcional: estacionar de forma durável as tarefas do revogado (`assistant.ts:317`). |
| F11 | CLOSED | Três ticks sobrepostos: 1 envio. Pausa durante o envio impede o seguinte. Crash depois da reserva: 0 reenvios e estado incerto. `reminder-concurrency`. | Opcional: lock de escritor único no volume (`store.ts:147`). |
| F12 | CLOSED | `cookie-only-bootstrap`: `getSession` chamado sem 401 local. `cookie-session-restore` 5/5, `trusted-session-app` 5/5, `app` 15/15. | Lead: repetir o E2E `rem21-014` na candidata integrada (só rodou na candidata da frente). |
| F13 | CLOSED | Pré-abort: 0 chamadas ao provider, `cancelled` (`gateway.ts:262`); backoff cancelável (`:492`). `aud0621-0248-gateway-cancel-cost` 13/13; MF02 (`model-fault-server`) 41/41. | — |
| F14 | CLOSED | Teto 0 na request, no perfil ou nos dois nega antes do provider; dentro do teto, a chamada segue (`gateway.ts:268`). | — |
| F15 | PARTIAL | Código fechado: memória atômica e SQL `FOR UPDATE OF tasks` com CAS e audit na mesma transação (`postgres.ts:1155-1202`). Sondas: `[200,400]` com estado final `done`; com 4 concorrentes, 2×200 e 2×400. PG `task-approval-postgres` 3/3. | M1: o teste canônico da frente (`task-status-atomicity` P1) está vermelho na integrada. |
| F16 | PARTIAL | A sonda original perdeu efeito (o port que ela injeta já não é usado). Com a falha injetada em `AuditRepository.append`: 500, task segue `open`, 0 eventos; a nova tentativa dá 200 com 1 evento. PG P4 com rollback passa. | M1: P3 vermelho e com asserção vazia. Resíduo registrado: `POST /v1/tasks` e `POST /v1/approvals` ainda em dois passos. |
| F17 | CLOSED | Outbox: o claim 6 dá null e o evento vai a `dead_letter` com `lease_expired_exhausted`. Spine PG (`operational-execution-postgres.ts:1176`) e memória (`execution-spine.ts:1091`, lead): `FAILED_TERMINAL retry_exhausted`. PG AC09 e AC10; `execution-spine` 23/23. | — |
| F18 | CLOSED | Cauda truncada isolada em `recovery/*/tail.bin`, prefixo carregado e commits novos sobrevivem a 2 reinícios. `journal-reliability`. | Opcional: fsync do diretório na criação de `events.jsonl`. |
| F19 | CLOSED | Cursor por ledger com lotes transacionais e reconciliação (`kernel-composition.ts:528`). `kernel-audit-trail` 6/6; PG `kernel-composition-postgres` AC12 (falha no lote, reenvio exato, cadeia contígua) 11/11. | — |
| F20 | CLOSED | Renovação por CAS estende o lease vivo e dá null se expirado ou tomado (sonda `heartbeat-renew`). `continuous-worker.ts:277`; PG AC07 e AC08 (handler longo, lease renovado). | — |
| F21 | CLOSED_LOCAL_ONLY | Modelo: corte por chunk e teto passado ao transporte (`aud0621-0248-bounded-response` 15/15). Canais: prazo do DNS ao fim do corpo (`aud0621-0248-channel-bounds` 19/19). Produto: teto e prazo no download e no Whisper, `queue_full`, health 503, stop limitado (sondas `transport-bounds` e `queue-health`). | Ambiente real: providers, WhatsApp e Whisper reais (NOT_RUN). Resíduos HISO-011 (M4): DNS do guard compartilhado sem prazo nos providers de modelo, teto padrão do transporte, backpressure, cabeçalhos, compressão. |
| F22 | CLOSED | Painel com resumo redigido e caso por linha (`approvals/index.tsx:105-157`). `approval-context` 2/2, `approval-task-queue` 3/3. | Opcional: o painel mostra resumo e caso de todo o tenant para Operator/Approver sem vínculo (ligado ao resíduo do F01). |
| F23 | CLOSED | `limit=1&offset=100` dá `[]` com `pageInfo`; limites 1–100 e offset ≤10000 com 400. PG P5 com 101 itens. | — |
| F24 | CLOSED | O organizer só passa pelo gateway com CLINICAL fixo; `policy_denied` com 0 chamadas ao provider, inclusive na composição real (`compose.ts:98`). | Opcional: recusar `options.organizer` fora de teste (`compose.ts:95`); restringir `WHISPER_URL` (`config.ts:44`). |
| F25 | PARTIAL | Contrato da imagem distroless PASS (a receita antiga dá FAIL); compose `read_only`, sem capabilities e com rede interna; prova de egress interna PASS. | Local: provas próprias de backup/restore, alerta e stop do produto (PISO-008); imagem reconstruída da HEAD integrada (foi do bundle da candidata do produto). Ambiente real: nft no host com contadores, build pela receita no CI, SBOM. |
| F26 | CLOSED | O oracle aceita só firing assinado de `worker_down` depois do offset e do instante da parada (`production-stack-smoke.ts:167`). O teste com o histórico gravado nega o caso antigo (`production-stack-alert-oracle` 6/6). | Lead: rodar o smoke real com o oracle novo na qualificação da imagem. |

## Sondas do auditor contra a candidata

Cópias em `critic/probes/`, com os `../` trocados por caminhos absolutos da candidata, a saída apontada para `critic/out/`, o PostgreSQL apontado para 56264 e as configs importando o `vitest.config.mts` da candidata. Há um symlink de `node_modules` para a candidata. Asserções e lógica não mudaram. As sondas foram escritas para provar o defeito, então falhar a asserção significa que o defeito não reproduz; o motivo foi conferido nos JSONs de saída.

- **`probes.test.ts`:** as 5 sondas de defeito não reproduzem; os 2 controles bons continuam passando.
- **`integration.test.ts`, 13 sondas:**
  - nenhuma reproduz;
  - quatro sondas de produto ficaram vazias porque nenhuma tarefa nasce sem `ok`: o homônimo do F09, `revoked-member`, `overlapping-ticks` e `pause-during-tick`. Foram refeitas com nota confirmada em `probes/product/` e não reproduzem;
  - `task-audit-partial` ficou inconclusiva (o ponto de injeção não é mais usado); foi refeita em `probes/api/` e não reproduz.
- **`data.test.ts`, 3 sondas:**
  - `outbox-unbounded-crash-retry` e `worker-rls-preflight` não reproduzem;
  - `outbox-attempt-fence` ficou inconclusiva (token obrigatório); foi refeita em `pg-extra.test.ts` e não reproduz.
- **Sondas próprias:** `runtime-extra` 5/5, `pg-extra` 4/4, `worker-preflight-0029` 4/4, `product` 14/14 e `api` 5/5. Em todas o defeito não reproduz.

## Preflight do worker × 0029 (pedido 4)

Teste próprio `probes/worker-preflight-0029.test.ts`, contra o PostgreSQL próprio, com role `NOSUPERUSER NOBYPASSRLS` e os grants do `migrate-job`:

- `WORKER_CRITICAL_TABLES` contém as cinco `case_*`, além de `effect_journal` e `runtime_approvals`;
- o banco migrado até a 0029 passa no `assertPostgresWorkerPreflight` e no `assertPostgresKernelPrerequisites`;
- o banco sem a 0029 é recusado com "missing tenant-isolated tables";
- controle negativo: `case_assignments` sem RLS é recusado.

Resultado: PASS 4/4.

## Regressões de integração entre as frentes

1. **0176 × 0250, vermelho (M1):** o leitor de auditoria de sessão passou a filtrar por vínculo do produtor, e a transição de task não é vinculada.
2. **Todas as frentes e o lead (M2):** deriva do `skip-catalog`, que quebrava o `certify` e o `skip:governance`. Resolvido em `a81a0d03`.
3. **0176 × migração (M3):** a prova `rem21-010` commitada não cobria a 0029; o `pg_restore --clean` quebrava nas FKs `case_*`. Resolvido em `a81a0d03`.
4. **0176 × 0250, comportamento:** eventos de task e approval sumiram de `/v1/audit/sessions` e da auditoria de caso do console. Continuam na auditoria completa do tenant.
5. **0176 × 0250/F22, exposição:** listas de tasks e approvals sem escopo por caso, e o painel novo mostra resumo e caso de todo o tenant. Não é regressão de API (a main já devolvia), mas o F22 passou a exibir.
6. **0176 × E2E:** em trusted, `/v1/conversations` e os outros leitores de caso respondem 503. O `rem21-014` e o browser-proof precisam rodar de novo na integrada.
7. **0249 × 0029:** sem regressão. O preflight do worker aceita o banco com a 0029 e recusa o banco sem ela (seção acima). Worker mais novo que o banco recusa a partida (já registrado pela frente).
8. **`server.ts` e `postgres.ts`:** sem conflito de merge. Os trechos de 0250 e 0176 não se sobrepõem; `postgres.ts` só foi tocado pela 0250.
9. **Gates rodados:** typecheck integral `tsc -p tsconfig.typecheck.json` com exit 0. Testes PG das frentes:

| Rodada | Arquivos | Testes |
| --- | --- | --- |
| Run 1 (inclui `continuous-worker-entrypoint` e `operator-session-postgres`, fora do `test:postgres`) | 9 | 81/81 |
| Run 2 | 7 | 98/98 |
| Regressão dos leitores de auditoria | 14 | 47/47 |
| Focais 0248/0249 | 12 | 171 PASS, 9 skip sem PG |

## Delta do lead

- **`553564ee`: correto, mas incompleto.**
  - As trocas para Supervisor nos demos e nos testes do worker são legítimas pela SPEC0176. Nos dois testes `synthetic-effect` foi acrescentado o 404 do Operator sem vínculo, o que é bom.
  - O `test:postgres` passou a incluir o PG da 0176.
  - Faltou `task-status-atomicity.test.ts` (M1) e a atualização do `skip-catalog`; SKIP-PG-015 e 017 derivam deste commit (M2).
  - Nos testes `iterative`, o `x-operator-id` 'operator.phase3' ficou com role Supervisor; é cosmético.
- **`a81a0d03`: correto e mínimo.**
  - Toca só `scripts/rem21-010-postgres-proof.ts` e `scripts/skip-catalog.json`.
  - Fecha M2 e M3 (conferência no topo).
  - Não fecha M1: `task-status-atomicity.test.ts` não mudou.
- **`97d436a6`: correto e mínimo.**
  - Espelha a regra do store PostgreSQL (exaustão na recuperação, `FAILED_TERMINAL retry_exhausted`, evento com workerId null).
  - Coberto por teste novo que falha sem a correção. Não toca a fila em memória, que não existe nesse store.

## Opcionais

1. Escopo por caso em `GET /v1/tasks`, `GET /v1/approvals` e no PATCH de task, em SPEC própria (UP91-018).
2. Vincular à sessão o audit de criação e de transição de task e de approval, na mesma unidade.
3. O adaptador de outbox em memória exige token quando o claim tem token (`outbox.ts:791,820`).
4. `terminateExhaustedRecovery` do PostgreSQL lança `conflict` se faltar o par na fila (`operational-execution-postgres.ts`, cerca da l. 1262) e trava toda a recuperação do lote. Avaliar se deve isolar a linha.
5. Os resíduos de produto do fork:
   - `ok` com recibo do preview;
   - estacionar as tarefas do revogado;
   - lock de escritor único;
   - `WHISPER_URL` local;
   - `options.organizer` só em teste;
   - testes de `inbox_stalled` e `job_deadline_exceeded`;
   - envio `not_sent` permanente sem orçamento (`assistant.ts:353`);
   - imagem a partir da HEAD integrada.
6. O role de runtime tem INSERT/UPDATE em `case_principals`, embora a SPEC diga "só pelo adaptador verificado". Avaliar um grant mais estreito.
7. Verificações do lead antes do merge: suíte integral, `certify`, `test:e2e`/`rem21-014` na integrada, smoke de produção com o oracle novo (F26) e imagem do produto da HEAD integrada (F25).

Nota: o working tree da candidata tem modificações que não são do crítico: `certification/*.json`, `scripts/rem21-010-postgres-proof.ts` e `docs/02_spec/0107…`. Vêm das rodadas do lead. O `skip-inventory.json` ali está com `failures: 11` e não deve ser commitado assim.
