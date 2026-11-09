# SPEC0257 — criação atômica de task/approval e seu audit

R2, 23/10/2026. Task `PROD0624-U03-CREATION-001`, cartão pai UP91-018,
recorte U03 de 0399. Estado `PROPOSED_FOR_TECHNICAL_REVIEW`. T3: contrato
público, persistência e auditoria. **Sem BUILD até revisão humana explícita
deste documento congelado.** Não concede U04, OIDC real, deploy ou piloto.

## 1. Recon e invariante

Fonte main `9a56a9c94db3e46291f2ba1de002763eee89ff39`:
`apps/api/src/server.ts:1818–1875,1964–2024` cria recurso e chama audit.append
depois. Falha do audit devolve500 com recurso persistido. Tasks já têm chave
de idempotência; approvals geram outroID por chamada e não têm chave HTTP.
SPEC0250 excluiu criação. Sua aprovação não cobre este delta.

Invariante das novas operações HTTP: recurso, recibo e exatamente um evento
de criação são confirmados juntos. Antes de COMMIT, falha deixa zero dos três.
Retry após COMMIT, inclusive resposta perdida, retorna o mesmoID sem novo
recurso/evento. Não há envio externo. A garantia durável vale no PostgreSQL;
memória é volátil e não promete recuperação após reinício do processo.

Fatos que orientam o HOW:

- `postgres.ts:createTask` usa `ON CONFLICT DO NOTHING` para a unicidade
  `(session_id,source,idempotency_key)` e retorna o vencedor sem chamar
  onCreated quando perdeu. Retornar esse recurso não comprova nova criação.
- `postgres-audit.ts:appendAudit` insere em audit_events. Não há cabeça/lock de
  cadeia nesse writer. Não importar o algoritmo distinto do kernel.
- `tenant-scoped-postgres.ts:withTenantTransaction` é dono de BEGIN/contexto/
  COMMIT/ROLLBACK em um client adquirido da pool; limpar contexto antes de
  COMMIT e verificar a limpeza faz parte do padrão existente.
- `tenant-preflight.ts` exige SELECT/INSERT/UPDATE para todo o inventário;
  `scripts/migrate-job.mjs` concede esses três. Recibo imutável exige um perfil
  específico e fechado em ambos, não apenas adicionar uma tabela ao array.
- Caller HTTP funcional observado: `apps/web/src/api/client.ts`, método
  requestAuditEvidenceExportApproval, invocado por `App.tsx`. Hoje não recebe
  chave e o retry genérico não retém uma identidade de operação.

## 2. Contrato HTTP e decisões para revisão humana

- POST /v1/tasks mantém corpo e chave idempotencyKey atualmente validados.
- POST /v1/approvals mantém corpo e exige `Idempotency-Key`: um único header,
  valor ASCII de8–200 caracteres `[A-Za-z0-9._:-]`. Contar ocorrências dos
  rawHeaders, sem diferenciar maiúsculas; arrays, duplicatas, vírgulas, espaços
  e ausência retornam400validation_failed antes de mutação. Não alterar o
  comando interno RequestHumanApproval para todos os usos do monorepo.
- Corte coordenado de servidor e callers; sem fallback de criação HTTP sem
  recibo. Inventário de callers/testes/docs integra o gate de BUILD (§7).
- Sucesso e replay retornam200 no envelope atual, mesmoID e estado atual do
  recurso, cache-control:no-store. Toda tentativa, inclusive replay, atravessa
  autenticação, tenant, role e autorização de caso vigentes antes de dados.
- Chave reutilizada no mesmo namespace com pedido/contexto diferente retorna
  409conflict, sem alteração. Não revelar chave, payload, digest ou erroSQL.
- Falha anterior ao COMMIT retorna500internal_error sem nova criação. COMMIT
  de resultado incerto também retorna erro visível; não compensar/excluir nem
  repetir automaticamente com chave nova. Retry explícito com a mesma chave
  em nova conexão resolve o recibo durável. Não há endpoint novo de consulta.
- Composição PostgreSQL sem pool transacional exclusiva para a operação não
  suporta estes dois POSTs: retorna503 antes de escrita. Client queryable
  compartilhado continua disponível para contratos anteriores; não executar
  BEGIN concorrente nele nem simular isolamento com mutex só desses POSTs.

Decisões propostas: P1header/corte e comportamento de retry do console;
P2migration/perfil imutável; P3pool obrigatória nos novos POSTs PG e503 nas
composições diretas. Aprovação desta SPEC cobre só BUILD local sintético.

## 3. Namespace e digest exatos, versão1

Namespace de recibo: `(tenant_id,route,key_digest)`, onde route é literalmente
`/v1/tasks` ou `/v1/approvals`. Actor, sessão e source NÃO pertencem à chave
primária. Assim, dentro do tenant/rota, mesma chave com ator, sessão, source ou
conteúdo diferente conflita em vez de criar outra operação. Outros tenants e
rotas têm namespaces distintos, sempre protegidos pelos guards/RLS.

`key_digest = SHA256(UTF8(JSON.stringify(["api-creation-key-v1",key])))`, hex
minúsculo64. key é o valor validado, sem normalização adicional.
`request_digest = SHA256(UTF8(JSON.stringify(array)))`, array de ordem fixa:

- Task: `["api-creation-request-v1",tenant,route,actorType,actorId,sessionId,
source,title,description,priority]`.
- Approval: `["api-creation-request-v1",tenant,route,actorType,actorId,
sessionId,proposedAction,summary,riskLevel]`.

Usar valores após defaults/validação dos schemas existentes, antes de gerar
ID/data. Não incluir correlationId, chave, status posterior, data ou UUID novo.
Não fazer trim/case-fold/normalização clínica além do schema aprovado.
Actor vem da identidade resolvida; em teste não autenticado é System/api.
Memória semtenant usa namespace privado e explícito da instância, nunca tenant
fictício persistido em PG. digest não autentica e não contém segredo de sessão.

Task conserva a unicidade legada `(sessionId,source,idempotencyKey)`. O novo
primitive de inserção retorna discriminante `inserted` ou `existing`; só
inserted pode gerar audit/recibo. Se perder a unicidade sem encontrar recibo
correspondente do novo contrato, retorna409 e faz rollback sem audit/recibo.
Nunca usar createTask que devolve o vencedor como prova de inserted. Isso vale
inclusive quando um writer interno legado concorre sem adquirir nosso lock.

## 4. PostgreSQL: schema, propriedade da transação e replay

### 4.1. Migration e integridade

Nome reservado proposto `0030_api_creation_receipts.sql`; reconfirmar próximo
número livre antes de integrar. Não sobrescrever migrations publicadas ou a
fundação antiga0029–0031 de outra candidata. Base canônica atual termina0029.

Tabela api_creation_receipts; todas as colunas abaixo são NOT NULL salvo
nullable indicado:

| Coluna         | Tipo e regra                                                          |
| -------------- | --------------------------------------------------------------------- |
| tenant_id      | text, mesmo formato TenantId das tabelas de caso                      |
| route          | text, enum literal das duas rotas                                     |
| digest_version | smallint, CHECK =1                                                    |
| key_digest     | text, CHECK `^[0-9a-f]{64}$`                                          |
| request_digest | text, CHECK `^[0-9a-f]{64}$`                                          |
| actor_type     | text, enum System/Operator/Approver/Supervisor/Admin                  |
| actor_id       | text, não vazio; identidade resolvida, ou api no modo de teste        |
| session_id     | text, FK `(tenant_id,session_id)` para sessions                       |
| task_source    | text nullable, obrigatório não vazio só para rota tasks               |
| task_id        | text nullable, FK `(tenant_id,session_id,task_id)` para tasks         |
| approval_id    | text nullable, FK `(tenant_id,session_id,approval_id)` para approvals |
| audit_id       | text, FK `(tenant_id,audit_id)` para audit_events                     |
| created_at     | timestamptz, instante do primeiro commit                              |

PK `(tenant_id,route,key_digest)`. CHECK exato: tasks exige task_id/task_source
não nulos e approval_id nulo; approvals exige approval_id não nulo e task_id/
task_source nulos. UNIQUE `(tenant_id,task_id)`, `(tenant_id,approval_id)` e
`(tenant_id,audit_id)` impedem dois recibos para um recurso/evento. Adicionar
índices/constraints UNIQUE de suporte `(tenant_id,id)` em sessions e
`(tenant_id,session_id,id)` em tasks/approval_requests, somente se ausentes.
Audit `(tenant_id,id)` já tem constraint0029. Todas FKs sem cascade, com
NO ACTION: nenhuma remoção apaga recibo silenciosamente. Histórico sem vínculo
válido falha na migration em vez de ser remapeado ou copiado para outrotenant.

A tabela leva ENABLE/FORCE RLS e policy exata
`api_creation_receipts_tenant_isolation`, USING e WITH CHECK de igualdade a
`NULLIF(current_setting('cvg.tenant_id',true),'')`. Incluir entrada tenant-only
no TENANT_SCHEMA_INVENTORY; extensão explícita do tipo para perfil
`runtimePrivileges: 'read-insert'`, default preservado `read-insert-update`.
Migrate-job concede só SELECT/INSERT e revoga UPDATE/DELETE/TRUNCATE/TRIGGER/
REFERENCES dessa tabela do runtime. Sem grant PUBLIC ou role herdado; migração
é de outro proprietário. Preflight valida perfil exato, não relaxa as outras
tabelas. Tabela/policy/FK/constraint/perfil ausente ou excedente impede startup.
Closed-world inventory, manifests e fixtures PG devem refletir este perfil.

Recibo não é atualizável pelo runtime; retenção é indefinida nesta versão,
sem TTL/GC/adminendpoint. Não armazenar body/summary/chave nem credenciais.
O replay exige recurso e audit no tenant/sessão do recibo e verifica tipo de
audit, ator, IDs/session/source no payload sanitizado e versão/digests. Referência
inexistente/inconsistente ou recibo inválido é500internal_error e diagnóstico
constante, não404/criação nova/reparo. Não recomputar request_digest do estado
atual mutável do recurso: o recibo vincula o pedido inicial. As FKs protegem
referências e a validação detecta corrupção sem afirmar que audit_events seja
uma cadeia criptográfica ou que atores privilegiados não possam adulterar DB.

### 4.2. Uma transação, um proprietário

Composição pool produz `runCreationTransaction(tenant,operation)`; é a única
dona de BEGIN/tenant/COMMIT/ROLLBACK/release. Repositórios ligados ao client
recebido nunca chamam BEGIN, conectam à pool ou substituem contexto. Não chamar
withTenantTransaction dentro de withTenantContext nem aninhar transações.
O helper segue o padrão existente, com tratamento explícito de COMMIT incerto:

1. Adquirir client exclusivo, BEGIN e set_config parametrizado do tenant.
2. Adquirir pg_advisory_xact_lock parametrizado pelo hash64bits assinado do
   JSON de ordem fixa `["api-creation-lock-v1",tenant,route,key_digest]`.
   Colisão só serializa, nunca decide igualdade/autorização.
3. Ler recibo pela PK. Se existe, comparar request_digest/digest_version;
   diferença retorna409. Validar referências e devolver estado atual pelo
   client da transação; replay não cria audit/recibo. Erro aborta a transação.
4. Ausente: criar recurso pelo primitive com resultado inserted/existing.
   Taskexisting é409 conforme§3. Gerar/anexar audit canônico no MESMO client,
   inserir recibo completo e validar referências. Falha aborta os três.
5. Limpar tenant usando set_config('',false), verificar NULL como padrão
   atual, enviar COMMIT. Só depois de confirmação devolver200/logsucesso.
6. Antes de enviar COMMIT, erro faz ROLLBACK e limpeza verificada; conexão
   com rollback/limpeza falhos é destruída por release(error). Uma vez enviado
   COMMIT, erro/queda/resposta SQL incerta destrói o client, não o devolve à
   pool limpo por suposição. Nenhuma tentativa automática nessa conexão.
   Em todos os casos release é chamado exatamente uma vez.

Ordem de locks: operação, inserção/unicidade do recurso, audit INSERT, recibo.
Não existe lock de cabeça de audit a adquirir. Writer legado de task pode
esperar na unique constraint sem compartilhar lock de operação; o resultado
inserted/existing é a autoridade. Apenas callbacks de persistência no client
transacional; nenhum I/O remoto nem callback arbitrário dentro da transação.
U04 definirá depois a linearização dos grants, sem falsa garantia nesta etapa.

### 4.3. Legado e corte

Tasks legadas com chave mas sem recibo retornam409; continuam consultáveis.
Não fabricar audit retroativo. Approval antiga não tem chave de criação:
não há como reconhecer que uma nova requisição com chave seja retry daquela
operação. Logo a garantia NÃO cobre submissão anterior ao corte.

Antes de ativar novos callers: parar criação HTTP antiga, inventariar pedidos
approval em voo/resultado incerto e reconciliá-los manualmente por IDs/estado;
só depois publicar servidor+callers e reabrir criação. Não derivar dedupe de
summary/sessão, atribuir chave a legado ou reenviar pedido incerto com chave
nova. No ensaio sintético, provar essa limitação e o procedimento de corte;
qualquer ativação real continua fora desta SPEC/T4 pendente.

## 5. Ports e publicação em memória

Commands tipados CreateTaskWithAudit/CreateApprovalWithAudit recebem contexto
resolvido, pedido validado, correlationId e chave; retornam recurso/recibo e
`created|replayed`. API faz uma só chamada. Sem port atômico retorna503 antes
de mutação; não recorrer a create/save+append separados. Writer interno legado
continua sem recibo e não passa a prometer idempotência deste contrato HTTP.

Memória: InMemoryDatabase passa a manter ponteiro privado para DatabaseState
com getter state. Operação de criação é síncrona, sem await, Promise ou I/O:
validar entrada JSON simples e copiar tudo antes do trecho crítico; obter estado
atual, produzir estado destacado com recurso/audit/recibo e publicar por UMA
atribuição do ponteiro após todas validações. Usar rotinas canônicas síncronas
de validação/sanitização de audit sobre estado destacado, nunca append no DB
vivo. Se o sanitizador/serialização falha, nada é publicado.

Repositórios continuam resolvendo db.state a cada acesso. Inventariar aliases
persistentes de arrays/state no BUILD: não permitir writer com referência
retida ao estado substituído. Nenhuma callback de aplicação é executada entre
snapshot e publicação; guard privada recusa criação reentrante. Para fault
injection síncrona, comparar identidade e conteúdo do estado vivo capturado
antes de publicar; mutação reentrante de outro writer faz abortar a criação
sem desfazer/perder a mutação concorrente. Testar auditappend/statuswriter nesse
ponto. Dois handlers assíncronos chegam a trechos síncronos sequenciais no
mesmo eventloop: o segundo resolve receipt atual, não publica clone antigo.

Leituras dos ports novos devolvem cópias; falha não tenta desfazer arrays vivos.
Memória conserva recibos na instância, mas reinício apaga todos os dados;
AC de restart durável são obrigatórios em PG e explicitamente N/A em memória,
não simulados como PASS. Semtenant só no perfil de teste isolado já existente.

## 6. Audit e autorização

Preservar eventos atuais: task `integration_event`, payload comsessionId/
taskId/source/tenantId; approval `approval_decision` comsessionId/
approvalRequestId/status/tenantId. Nesta criação approval NÃO é o evento de
decisão com payload.approvalId/decision usado pelo dedupe existente; não
confundir ambos. correlationId e data são do primeiro commit; replay não os
reescreve. Ator autenticado vem da identidade resolvida/role, teste éSystem/api;
não usar ator informado no body. O evento atual de taskSystem/api passa a
registrar o ator autenticado nesta proposta, mudança explícita para revisão.
Sem descrição/summary/chave/digest em logs de diagnóstico.

Reusar guards0176/0251 e preflights. **Grant→commit permanece saldoU04**; não
prometer revogação linearizável. Replay semgrant, principalinativo, role
insuficiente ou tenant divergente é recusado antes de divulgar dados. Configuração
do port atômico não desliga nenhum guard e não oferece rota de fallback.

## 7. Escrita e inventário obrigatório após gate

Áreas: APIserver/ports/bootstrap; schemaHTTP de headerapproval; persistence
commands/db/schema/repositories/postgres/tenantadapter/exports; migration
reservada; tenant-schema/tenant-preflight e migrate-job/perfis de grants;
console client/App e helper de operação lógica; docs0107/0305 e testes/callers.
Semlockfile, produto, canal/provider, consoleOIDC ou regra de scanner.

Caller funcional: requestAuditEvidenceExportApproval deve RECEBER uma chave
obrigatória de seu chamador, nunca criar UUID a cada execução da função.
App mantém registro da operação lógica por tenant/operator/session/ação, com
chave aleatória criada por crypto.randomUUID ANTES do primeiro fetch e gravada
em sessionStorage. Guardar só metadados de idempotência/estado local; não
persistir JWT/cookie, summary ou corpo clínico. Falha de storage impede despacho
com mensagem de recuperação; não cair em chave volátil silenciosamente.

Timeout, erro de rede,500, navegação/reload ou resposta perdida mantêm a mesma
chave; botão de tentar novamente repete essa operação. Bloquear clique duplo
enquanto em voo. Sucesso mantém chave+ID e marca operação resolvida para que
refresh/duplo clique não criem nova aprovação. Uma nova solicitação exige ação
explícita após resolução conhecida; só então gerar outra chave. Logout/tenant
change impede envio e acesso ao registro do outro escopo, sem reenviar incerteza
com novoID. Sessão do navegador encerrada pode perder sessionStorage: pedido
incerto nesse corte exige reconciliação manual, não promessa de dedupe global.
Não permitir escolher nova chave para contornar409 de operação pendente.

Antes do BUILD, gravar inventário por caminho/linha/hash de TODO literal ou
construção de POST às duas rotas em apps/packages/tests/scripts/docs. Separar
caller real, factory/fixture, teste negativo e documento; não modificar todos
os GETs nem rotas de decisão. A busca deve contemplar URL absoluta/baseURL e
helpers (método POST separado da URL). Conhecidos: apps/web/client+App acima,
apps/api testes de approval-request-field-boundary/approval-decision-note,
case-scope/tasks-approvals, postgres-persistence-mode, observability, lifecycle,
identity/RBAC; tests/e2e/critical-flows e fixtures de cenários de API. Preservar
testes que exigem400 semheader, atualizar positivos e mocks para chave estável.
Inventário fechado e diffs de callers são saída de BUILD, não declaração de que
a lista abreviada deste documento já é exaustiva.

## 8. Aceites reprováveis

| ID   | Positivo                                                 | Negativo obrigatório                                                                 |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| AC01 | Cada criação deixa1recurso+1audit+1recibo juntos         | Falhaaudit/serialização/recibo deixa0dos3, memória ePG                               |
| AC02 | Replay mesmoID/estado sob guards atuais                  | Mesmo tenant/rota/key com outro ator/sessão/source/body409; tenant/rota separados    |
| AC03 | Duas requisições mesmaop convergem                       | Taskperde para writerlegado:409/zeroaudit/recibo, sem retorno vencedor comosucesso   |
| AC04 | Retry após200perdido e COMMITACK perdido recupera        | Antescommit zero; COMMITincerto semclientreutilizado/compensação/chavenova           |
| AC05 | Ator/tenant/caso válidos atravessam guards               | Replayapósrevogação, principalinativo, semgrant e roleindevida recusados             |
| AC06 | Approvalcomheaderúnico e consolecomopestável cria/replay | Ausente/duplicado/inválido400; timeout/reload/clickduplo não trocamchave             |
| AC07 | Migration0029+nova, RLS/FKs/perfilcorretos               | SQLtenantcruzado/receiptsemrefs/version/PK/check, privilégios amais/tabelaausente    |
| AC08 | Auditcanônico consistente após concorrência/restartPG    | Audit/receiptforatx/bypassport ou confiança em cabeça de cadeia inexistente          |
| AC09 | Taskslegadas consultáveis e409criação semrecibo          | Approvalpré-corte semchave não é falsamente deduplicada ou reenviada automaticamente |
| AC10 | Memóriapublica1snapshot semperderoutroswriters           | Falhaaudit/recibo/reentrância/statusappendintercalado não deixaestado parcial        |
| AC11 | Pool/contexto/liberação corretos no caminho público      | Clientdireto503anteswrite; nestedBEGIN, falhalimpeza/rollback destroemclient         |

Provas obrigatórias separadas: (a) respostaHTTP perdida APÓS COMMIT conhecido;
(b) servidor semACK do próprio COMMIT, provando por conexão independente se
houvecommit e repetindo em conexão nova com a mesma chave; (c) crash antes e
depois do commit; (d) falhaINSERTrecibo após recurso+audit; (e) falha de limpeza
do tenant antes de COMMIT; (f) corrida taskcontra primitive legado; (g) memória
com outro writer síncrono e concorrência entre handlers; (h) references/RLS
via SQL real sob papéis runtime/migrator; (i) console reload/timeout e resolução.
Contar independentemente recurso/audit/recibo e confirmar tenant/IDs/eventos,
sem confiar só no retorno do port. Semmockar a fronteira transacional julgada.

Mutantes: audit/reciboautocommit, remove requestdigest/guard/lock, insere após
existing, retorna antesCOMMIT, libera clientincerto, storage novoUUID porretry,
publica memória antesaudit. Firstred reproduz baseline0624 e novos negativos.
Depois Node22,typecheck/lint,npmtest,PG,E2E/certify aplicáveis sob claim próprio.
Nenhum subconjunto substitui os gates T2/T3 completos.

## 9. Revisão, gate e próxima ação

R2 resolve as sete lacunas da críticaR1 com decisões propostas verificáveis:
F1namespace+insertloser§3; F2dono/pool/COMMIT§4.2; F3schema/perfil§4.1;
F4caller§7; F5memória§5; F6falhas§8; F7legado/corte§4.3.
Isso é autoavaliação de cobertura, não aprovação independente.

Próximo: crítico fresco do contratoR2 e confronto com os ports/callers reais;
resolver obrigatórios; congelar SHA; revisão humanaT3 explícita; claimdepaths/
recursos e taskBUILD. Nenhuma aprovação0179/0250/0251/plano0397 substitui
este gate novo. BUILD0257 continua bloqueado enquanto faltar esse passo.
