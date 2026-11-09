# SPEC0262 — autorização na escrita e revogação das sessões

R5,23/10/2026. Task `PROD0624-U04-AUTH-COMMIT-001`, pais
UP91-018/UP91-026, unidadeU04 do0399. Estado `PROPOSED_FOR_TECHNICAL_REVIEW`.
T3: autorização, sessão, schemaAuth e contrato interno. **Nenhum BUILD antes de revisão técnica sem obrigatórios e revisão humana
explícita deste hash.** Dependência0257 permanece;0246/0259 não são alteradas.

## 1. Evidência atual e escopo

Fonte `9a56a9c94db3e46291f2ba1de002763eee89ff39`. A caracterizaçãoU04
reproduz: snapshot lêgrantACTIVE, revogação pública confirma200, criação
retoma e confirma200/1task. Controle pré-revogado retorna404/0task. São
três caracterizações emmemória, não provaPG nem aceite do requisito.

SPEC0251 abrange seis mutações: criar task, criar journeytask, mudar status,
criar approvalrequest, decidir approvalrequest e decidir runtimeapproval.
As duas listas não são novas mutações. Takeover/input/cancel continuam sem
exigir grant de caso; nenhuma role ganha nova permissão.

Inventário factual de80rotas explícitas e37HEADs derivados em
`docs/04_audit/evidence/PROD0624-EXEC-20261023/u04/authscope/`. Das71rotas
protegidas porrole,51não consultam principal atual na composição; isso é o
resíduo de validade da role de sessão já documentado em0254, não51novas
vulnerabilidades independentes. As verificações apenas de projeção de
input/cancel não protegem a escrita e refletem o freio decidido em0176.

Authstorejátemreplace/switchIdentityatômicos, famíliarevogada e expiry por
request. Não reimplementar como ausentes. Existem pools/roles distintas para
Auth e dados; Authrole não podeUSAGEproduto e executa seis funções fechadas.
Host/database iguais não são premissa atual. Nenhuma atomicidade crosspool
pode ser presumida.

## 2. Invariantes propostos

- Nas seis mutações, decisão de principal/grant e a escrita têm uma unidade
  de falha e ordem de commit. Revogação que ganha essa ordem impede escrita;
  mutação que confirma primeiro pode concluir a resposta depois da revogação.
- Role, tenant, caso, principalativo/role/authorityVersion e vínculos continuam
  obrigatórios. Cookie não é prova de autoridade atual; body não define ator.
- Cookies emitidos sob revisão antiga do principal não voltam a ser válidos
  se a role for restaurada posteriormente. Revogação global é por tenant/
  operador e todas as famílias, sem depender da família apresentada.
- Login sem mudança de principal não invalida outras sessões apenas por login.
- Não aumentar privilégios de banco nem dar Authrole acesso ao dataplane.
- Requisição nova com principalrevogado é negada fora e dentro de caso.
  A cobertura de pedidos já em voo é explícita no§5, não retroativa.

## 3. Decisão mínima proposta: reutilizar principal.revision

`case_principals.revision` já é monotônica, com CAS e audit. O produtor
verificado `case-principal-producer.ts:decide`, row8, retorna none para login
com a mesma roleativa/mesmaauthorityVersion. Portanto reaproveitar essa revisão
como binding do cookie evita contador/tabela paralelos e não invalida todos
os browsers a cada login normal. Essa conclusão vem da leitura do produtor,
não da suposição de que applyVerifiedPrincipalState rode em todo login.

Adicionar `principalRevision` ao registro/input interno de sessão, sem campo
novo no DTOpúblico de OperatorIdentity e sem body/header de autenticação novo.
Criar cookie só depois de obter o principal verificado atual. Adaptar
produceVerifiedPrincipal para retornar o registro corrente: em none retorna o
principal lido; em write retorna o registro confirmado, mantendo as decisões
P4/P5, CASlimitado e motivos de recusa0254.

No request, o Authstore autentica cookie/família/expiração como hoje. O
principal é consultado pela pool de dados, não pelo Authrole. Além de ativo/
role/authorityVersion/source exigidos, comparar revision com a revisão emitida
no cookie, obtida do registro Auth e nunca do cliente. Outage é503 sem apagar
cookie; vínculo obsoleto é401 com limpeza do cookie. Logs constantes sem
cookie, token, digest de sessão, claims ou conteúdo.

Credencial primária HMAC direta continua sujeita ao principal atual, mas
revogar cookies não revoga a chave/credencial primária. Desativação do
principal/rotação da chave são controles distintos. OIDC mantém MFA/login
fresco e não ganha refreshsilencioso. Esta distinção integra a decisão humana.

## 4. Unidade PG das seis mutações

APIcoordenador interno `runAuthorizedCaseCommand` recebe comando discriminado
pelos seis tipos: task.create, journeyTask.create, task.status,
approval.create, approval.decide, runtimeApproval.decide. IDs/corpo validados
aparecem UMAvez nesse comando; dele derivam tanto alvo autorizado quanto
writer. Ator, tenant, credentialkind e principalRevision vêm do contexto do
servidor, não do body. As permissões de role continuam as atuais e são
revalidadas pelo coordenador; não recebe callback de execução enviado porcliente.

Dono único: generalizar o helper transacional0257 para
withTenantMutationTransaction(pool,tenant,callback). Client exclusivo, BEGIN
ISOLATION LEVEL READ COMMITTED; tenant parametrizado; statement_timeout5s e
lock_timeout1s locais, como autoridade atual. Callback recebe contexto interno
ligado ao client/tenant/lifecycle. Factories scoped recusam contexto fechado,
outrotenant ou outroclient. Não recebem flags de modo por HTTP. Toda query
começada deve estar concluída antes de cleanup/COMMIT; trabalho pendente ou
uso depois de callback é recusado/rollback. Sem BEGIN/COMMIT no adapter scoped.

Fluxo e ordem de locks para TODOS os comandos:

1. Depois de validação/role/tenant, na unidade, SELECTprincipal do ator
   FOR SHARE. Exigir ativo, role/source/authorityVersion atuais e, para
   cookie, revision igual ao binding. Usar FOR SHARE, não KEY SHARE: a
   proteção deve conflitar com UPDATE dos campos não-chave/revision. Ausência
   ou divergência de principal é401; configuração/outage é503.
2. Resolver ligação recurso→sessão/execução→caso pelo banco do tenant. Para
   Operator/Approver exigir assignmentACTIVE do mesmo operador com FOR SHARE,
   mantido até COMMIT. Semroot/grant é404estático. Supervisor/Admin mantêm o
   escopo atual, incluindo sessão/execução semroot nos casos permitidos0251.
3. Para criação0257, lock da chave de operação vem DEPOIS de principal/grant,
   antes do recurso/receipt. Replay só começa depois da autorização atual.
   Mesmo namespace/payload diferentes mantêm409 depois dos guards.
4. Lock de recurso: task/approvalrequest FOR UPDATE quando existente; criação
   usa uniqueconstraint/inserted vs existing0257. Journey mantém source
   journey-r3, idempotência e audit nativos; não ganha receipt/header por
   associação. Revalidar o vínculo localizado antes do write, sem aceitar IDs
   alternativos do caller.
5. Runtimeapproval: execution FOR UPDATE antes de runtime_approvals FOR
   UPDATE. Conferir approvalId, executionRef, agent/version/correlation e
   estados atuais como o handler atual; depois aplicar ApprovalEngine/CAS,
   resolução da execução/outbox e audit no mesmo client. Nenhuma chamada de
   efeito externo/worker roda dentro da unidade. Revalidar efeito com workers
   concorrentes e manter ordens explícitas; deadlock/timeout aborta, nunca dá
   sucesso nem retry cego.
6. Limpar/verificar tenant, COMMIT e liberar uma vez. Falha de rollback/
   cleanup ou COMMITincerto destrói o client. Só confirmarHTTP/log apósACK.
   Nenhum retry automático com chave nova nem compensação/exclusão cega.

Revogação de assignment já usa FOR UPDATE da linha; principalchange e
invalidação global usam FOR UPDATE do principal. Assim, se uma revogação
confirmar primeiro, o READ COMMITTED após lock vê o estado novo e nega. Se
mutação ganhar primeiro, revogação espera seuCOMMIT. Conflitos/deadlocks são
falhas visíveis; não inferir ordem por timestamps de log.

### 4.1. Seams de implementação e compatibilidade

- RuntimeRepository: extrair versões client-owned de criação0257,
  transitionTaskStatusWithAudit e decideApprovalWithAudit. Métodos públicos
  anteriores continuam wrappers donos de sua unidade para outros callers;
  comando autorizado usa apenas o primitive scoped, sem chamar outro BEGIN.
- JourneyRepository: createJourneyTaskInTransaction(ctx,input) reaproveita
  boundedText/resolveJourneyContextScoped/appendJourneyAuditScoped. APIinjeta
  createAuthorizedJourneyTask no plugin; ele substitui o padrão anterior de
  authorizeTaskSession seguido de createJourneyTask separado. Em modo
  autenticado não existe fallback para esse padrão antigo.
- PostgresApprovalAuthority: factory client-owned da mesma lógica de
  #mutateRecord/#insert/get, preservando ApprovalEngine, loadedrecord e CAS.
  Não simular pool.connect que entrega um client já emtransação para
  withTenantTransaction. Wrapperpool legado mantém semântica existente.
- PostgresOperationalExecutionStore: extrair resolveApprovalInTransaction
  com as mesmas consultas/invariantes; getscoped usa o mesmo client.
  Wrapperpúblico mantém a transação própria para callers normais.
- CaseAuthority: autorizar no contextoclient atual com a mesma política0176;
  módulo de persistência não importa apps/api nem legacy. APIcoordenador liga
  factories, incluindo a de journey no host. Nenhum import do consumidor.

A composição autenticada exige factories do mesmo DB/tenant/owner; injeção
sem capacidade scoped ou mistura de stores dá503antes dewrite, sem fallback
para readSnapshot separado. PGqueryable direto compartilhado passa a503
nessas seis mutações, inclusive Supervisor; isso altera explicitamente o
perfil legado de testes para revisãoT3. O schema do dataplane e a matriz de roles não mudam nesta parte; Authmuda§6.

Atomicidade de task/approvalcreation continua0257 e decisões/status0250;
runtimePG agora confirma decisão/resolução/audit juntos. Preservar self-
approval403, CAS409, causalidade, 202APPROVED/200REJECTED e projeção póscommit.
Takeover/input/cancel continuam sem exigir grant de caso.

### 4.2. Runtime approval: transição e convergência

Preservar a semântica do handler atual, que distingue a decisão nova do
replay de uma decisão persistida. Não substituir a convergência do handler
por #replayDecision do engine: este só admite estado exato APPROVED/REJECTED
pelo mesmo approver; o handler aceita também os estados avançados abaixo.
Todos os caminhos, inclusive replay, passam primeiro pelos guards atuais de
principal, role, tenant, grant e vínculo da execução na mesma unidade.

Após os locks execution→approval, aplicar nesta ordem:

1. Se execution não é WAITING_APPROVAL e approval é REQUESTED/PENDING,
   conflito409. Se execution é WAITING_APPROVAL e approval é
   RESERVED/EXECUTING/EXECUTED, conflito409. Não reparar esses pares por replay.
2. REQUESTED válido passa pelo submit do engine com operatorId ORIGINAL,
   na fase destacada descrita no§4.3, e depois pela decisão se chegar a PENDING.
   PENDING válido usa approve/reject com o ator atual autorizado, mantendo
   selfapproval, expiração e CAS. Sem refetch por outra conexão no catch:
   os estados foram lidos sob os locks do dono; erro segue§4.3.
3. Para decisão já persistida, usar esta matriz de convergência. “Outro ator”
   significa outro Approver/Supervisor atualmente autorizado sob os mesmos
   guards; não concede permissão nova a quem não os satisfaz.

| Approval persistido                                     | Verdict recebido | Mesmo ator da decisão | Outro ator autorizado | Ação do engine                                                |
| ------------------------------------------------------- | ---------------- | --------------------- | --------------------- | ------------------------------------------------------------- |
| APPROVED/RESERVED/EXECUTING/EXECUTED                    | APPROVED         | Convergir             | Convergir             | Não chamar approve/submit; nenhum CAS/evento novo do approval |
| APPROVED/RESERVED/EXECUTING/EXECUTED                    | REJECTED         | Conflito409           | Conflito409           | Nenhuma                                                       |
| REJECTED                                                | REJECTED         | Convergir             | Convergir             | Não chamar reject/submit; nenhum CAS/evento novo do approval  |
| REJECTED                                                | APPROVED         | Conflito409           | Conflito409           | Nenhuma                                                       |
| Outros estados, exceto REQUESTED/PENDING tratados acima | Qualquer         | Conflito409           | Conflito409           | Nenhuma                                                       |

Convergir exige approverId, decisionActorType, decisionCorrelationId e
decisionCommandKey já persistidos; falta de causalidade é409. Nunca preencher
com o ator, correlationId ou commandKey do retry. Reusar também decisionReason
original; note nova não altera a decisão nem o evento original.

Chamar resolveApprovalInTransaction com a causalidade original, preservando
sua máquina atual: se execution ainda WAITING_APPROVAL e vinculada ao mesmo
approvalId, resolver para QUEUED (APPROVED) ou FAILED_TERMINAL/approval_rejected
(REJECTED); se já avançou, retornar a execução atual somente quando o
approvalId confere e a decisão APPROVED encontra estado diferente de
FAILED_TERMINAL, ou REJECTED encontra FAILED_TERMINAL/approval_rejected.
Os demais pares falham pelo mapper atual; não reabrir/resetar execução.
A convergência nunca enfileira efeito duplicado nem volta um worker avançado
para QUEUED. append do audit continua deduplicado por
(tenant,approvalId,decision), com ator e causalidade originais. Retry de estado
já resolvido e audit presente não cria nova transição/audit. Gap legado de
crash entre decisão/resolução/audit pode completar somente o que falta,
na mesma unidade e com a decisão original (AUD19-003); falha reverte o novo
trabalho, preservando o estado anterior. Nenhum provider é executado ali.

Manter os retornos atuais 202 para APPROVED e200 para REJECTED quando
convergência/resolução terminar, inclusive por outro ator autorizado. Não é
restrição nova de ator, nem autorização para uma segunda decisão.

### 4.3. Outcome explícito do ApprovalEngine e expiração

O writer atual #mutateRecord persiste alterações do engine e só lança erro
após confirmar: #assertNotExpired muda paraEXPIRED antes de lançar expired.
O primitive scoped não pode simplesmente lançar esse erro para o novo dono,
nem tratar qualquer erro como autorização deCOMMIT.

A fase de decisão nova (REQUESTED/PENDING após§4.2) é calculada primeiro em
InMemoryApprovalStore destacado com a linha carregada e bloqueada. Reusar
ApprovalEngine, incluindo a ordem nativa de expiração/selfapproval. NenhumSQL de alteração ou callbackexterno é
executado enquanto calcula a fase; eventos são coletados localmente.
O retorno discriminado é OK, COMMIT_EXPIRED ou ROLLBACK_ERROR:

- OK: persistir umCAS do estado final do approval, resolver execução/outbox e
  inserir o audit de decisão; todos ou nenhum na unidadePG. Só entãoCOMMIT.
- COMMIT_EXPIRED: permitido SOMENTE se o erro original é ApprovalError.expired,
  estado inicial era REQUESTED/PENDING, o final éEXPIRED e somente status/
  expiredAt mudaram no registro do engine. Deve haver exatamente esse approval
  alterado; nenhum dado de decisão/ator/commandKey novo. Descartar transição
  intermediária de submit calculada emmemória. Persistir só o CAS final de
  expiração e metadados normais de revisão/updatedAt; não resolver execução,
  não escrever audit de decisão nem log de sucesso. O dono confirma essa
  transição e apenas depois lança o mesmo ApprovalError para o mapper atual.
  O único evento de engine publicável desse resultado é approval.expired,
  depois do ACK; observador não pode despachar efeito externo.
- ROLLBACK_ERROR: validação, selfapproval não expirada, CAS, SQL, divergência
  de vínculo, exceção inesperada, estado inválido ou mudança não autorizada
  acima fazem rollback de tudo. Nenhum catch genérico promove erro aCOMMIT.
  Falha de resolução/audit no caminhoOK também reverte o approval gravado.

Se persistingCAS/cleanup/COMMIT da expiração falhar, não retornar como se a
expiração estivesse confirmada: erro operacional/incerteza visível, client
inibido, sem observabilidade falsa de sucesso. Decisão já persistida usa a
convergência do handler§4.2 antes desta fase e não chama o engine novamente:
não expirar, re-CAS ou rejeitar retroativamente uma decisão já tomada apenas
porque o clock avançou ou o ator autorizado do retry mudou.

Emmemória a mesma fase destacada publica só o approvalEXPIRED antes de
propagar o erro, deixando execução/auditdecisão intactos. No caminhoOK,
convergência multi-store§7 continua protegida pela fila de autorização.
Testar REQUESTED com submit intermediário e clock avançando, PENDINGexpirado,
replaydecidido, selfapproval não expirado, falhas deCAS/SQL/resolução/audit e
mutante que confirma qualqueroutcome de erro. O status/códigoHTTPexpired é o
mapper existente, não uma nova resposta200.

## 5. Cobertura do principal e sessões em voo

Novo guard preHandler em identityMode=trusted usa a composição real do
servidor. HTTPtarget/JSONparser, HTTPS/CORS/CSRF, cookie e readiness existentes
continuam antes dele; métodos respondidos antecipadamente não rodam handler.
Depois, principal atual precede a validaçãoZod/role interna do handler. Isso
pode trocar um400/403 por401/503 quando o principal já é inválido; é mudança
explícita desta proposta. Com principal válido, a matriz de roles/erros continua.

Classificação fechada por método e rota REGISTRADA, sem prefixo deURL:

| Classe              | Rotas/métodos                                                | Tratamento                                                                                                                                  |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Probeindependente   | GET/HEAD /health, /live, /ready, /health/metrics             | Mantém autoridade própria e cookie velho não penaliza probe. Usar constantes reais do servidor para nomes exatos, conferidos no inventário. |
| Webhookindependente | POST /v1/webhooks/channels/:channel/messages (webhookRoute)  | Verificador próprio; guardprincipal não o substitui. Comportamento atual do cookiehook não é relaxado.                                      |
| BootstrapOIDC       | POST /v1/auth/oidc/start; GET /v1/auth/oidc/callback         | Origin/state/IdP e produtor0254; não exigir principal inexistente antes do primeirologin. Callbacknão geraHEAD.                             |
| Sessãogerida        | GET/HEAD /v1/session                                         | Handler especial descrito abaixo, não uma rota pública de identidade. Não há POST /v1/session na fonte atual.                               |
| Logout              | POST /v1/session/logout                                      | MantémCSRF/readiness e revokeatômico antes de limparcookie; admite cookie obsoleto para aposentarfamília.                                   |
| Operador            | Todas as demais rotas registradas, inclusive HEADs derivados | Exige identidade/principal atual; rota nova não ganha exceção por omissão.                                                                  |

Inventariar as80rotas atuais/37HEADs e registrar classificação efetiva em
runtime. Templates desconhecidos registrados são Operador; notfound não
registrado mantém404. OPTIONS já resolvido peloCORS não muda. Sem override por
headers/query/body. Hook só omite principal nos caminhos fechados acima.
Controlled de teste conserva seu perfil explicitamente; nunca fallbacktrusted.

Sessãogerida: no OIDC, restore só com cookie válido/binding atual. No HMAC,
restoresem token usa o cookie e seu binding; com bootstrap token não vazio,
validar pelo resolverprimário existente, mesmo com cookie antigo presente,
consultar principal e emitir novo binding corrente. Em rotas comuns cookie
presente continua tendo a precedência atual; token de outra identidade não
sobe privilégios. Toda criação/rotação de sessão passa essa checagem dentro do
handler especial, sem escapar pelo allowlist do guard.

Readiness trusted inclui autoridade configurada e dataplane disponível, além
Authstore. Sem authorityVersion não dizerready enquanto todos os handlers
protegidos dão503. Injeções sem reader compatível falhamfechado; não atribuir
principal/currentrevision a fixture por default.

Garantia temporal: nas seis mutações, principal/grant/binding são retidos até
COMMIT (§4). Nas demais, principal é precondição do request; request já emvoo
pode concluir sob a revisão lida. Logout/switchIdentity de família pertence ao
Authstore e não cancela retroativamente request já iniciado no dataplane.
Novo request com cookie revogado nunca passa; invalidação global pela revisão
do principal serializa com as seis mutações. Não prometer atomicidade entre
pools nem interrupção de efeito já iniciado. Essas diferenças vão ao pacoteT3.

## 6. Revogação global e schemaAuth

### 6.1. Operação interna, sem nova permissão de role

Novo port interno invalidateOperatorSessions recebe tenant, operatorId,
expectedRevision e referência opaca da aprovação/handoff operacional. Não
recebe role/active/source/authorityVersion para editar. Bloqueia principal
FOR UPDATE, confere revisão e incrementa SOMENTE revision, mantendo identidade
inalterada; audit policy_decision no mesmo client contém alvo/antes/depois,
ator de operação local e digest da prova. Principal ausente/conflito falha,
não cria cadastro nem repete cegamente. Invalida todas as famílias por binding,
sem procurar cookies ou escrever na poolAuth.

É exceção de escrita apenas de revision ao port de provisionamento0176;
atributos de identidade continuam exclusivos do adaptador verificado. Não
chamar applyVerifiedPrincipalState com identitySource inventado para simular
provisionamento. Nenhuma rotaHTTP, tool de agente/modelo ou nova permissão de
Supervisor/Admin expõe o port.

Caller operacional concreto: script local revoke-operator-sessions.ts com
--tenant, --operator-id, --expected-revision e --proof. Dry-run é default;
--apply exige a política e atestação local abaixo. Não é rotaHTTP, tool de
modelo nem um comando despachável pelo serving. Uso real segueT4 específico.

**Fronteira de confiança escolhida: atestação do operador local autorizado.**
O programa não prova criptograficamente que Ricardo falou ou assinou uma
aprovação: confia no administradorOS autorizado que instala a decisão em
repositório privado. Isso é premissa explícita para a revisão humana; um
arquivo correspondente fora dessa fronteira é apenas input não confiável.
Não há autorização deduzida de texto livre ou do digest.

Lançamento real só com euid0 e política fixa
/etc/cvg/operator-action-policy.json, regular/nofollow/root:0600. Serving e
worker não recebem acesso à política/decisões/credencial de operação; script
não é empacotado como tool de agente. Não existe flag/env para trocar o path
dessa política no lançamento real. Política strictv1 fixa: operation
invalidate_operator_sessions, approvedDecisionsDir absoluto root-owned0700,
installedArtifactSha256, perfil do datastore e caminho do arquivo privado de
conexão da role de dados já autorizada. Nenhuma credencial de migração/Auth;
nenhumDATABASE_URL do shell escolhe outro alvo. Conferir artefato instalado e
perfil host/port/database/user, mais current_database/current_user após
conectar; mismatch nega antes dewrite. Não expor URL/segredo em output.

Prova strictJSON, até4KiB, regular/nofollow/root:0600, sob o diretório de
decisões aprovado, com pais semsymlink/não graváveis poroutros:

| Campo                                          | Regra                                                                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| v                                              | 1                                                                                                                             |
| decisionId                                     | UUID, coincide com nome do arquivo                                                                                            |
| operation                                      | invalidate_operator_sessions                                                                                                  |
| state                                          | APPROVED_FOR_EXECUTION ou HANDOFF_AUTHORIZED_FOR_EXECUTION                                                                    |
| tenantId/operatorId/expectedRevision           | Alvo exato e revisão segura iguais à chamada                                                                                  |
| authority                                      | local_operator_attestation_v1                                                                                                 |
| operator                                       | Identificador limitado do administrador que atesta; provenance do euid0 e política instalada, não identidade recebida porHTTP |
| decisionRef                                    | Referência opaca à decisão/handoff humano sob responsabilidade desse administrador                                            |
| issuedAt/expiresAt                             | UTC válidos, issuedAt≤now≤expiresAt, janela máxima30min                                                                       |
| reason                                         | Texto limitado1–500, sem dado real/credencial; só digest/prova privada na trilha pública                                      |
| installedArtifactSha256/datastoreProfileSha256 | Iguais à política local e artefato efetivo                                                                                    |

PlainHANDOFF/PENDING/REJECTED/DRAFT não autorizam. CLI compara todos os bindings,
mas a autoridade vem da instalação pelo operadorOS confiável. Ameaça de um
administradorOS autorizado que mente/reescreve a política não é resolvida por
esta atestação; não alegar que ela valida a decisão humana independentemente.
Arquivo falso de outro usuário/path, root/path errado, uid não autorizado,
prova vencida, operação/perfil/artefato/alvo/revisão divergentes recusam. Sem
relaxar ownership para fazê-lo passar emteste.

Provas locais separam: parser/binding com fixtures; lançamento real não-root
recusado; primitivePG sob recursos sintéticos; lançamento positivo root/OS e
perfil real NOT_RUN até ambienteT4, se não disponível. Uma injeção de teste de
UID não conta como provaOS. Main deprodução usa caminho fixo e verificações
reais, sem --test/--force. CasoCOMMIT fique incerto, registrarUNKNOWN e
reconciliar pela revisão/audit/provadigest; não incrementar de novo com outra
revisão automaticamente. CAS impede repetir a mesma decisão de revisãoantiga.

### 6.2. Authmigration e seis funções permitidas

Migration proposta operator-session/0002_principal_revision.sql, número livre
a reconfirmar. Adicionar principal_revision bigint NOT NULL DEFAULT0,
CHECK entre0e9007199254740991. Zero é marcador de linha legada, nunca revisão
corrente por fallback. Só sessões novas com revisão1..MAX_SAFE_INTEGER são
criadas. Data usa case_principals.revision já existente; sem contador/tabela
ou migration do dataplane por esse binding.

Superfície nova exata de seis funçõesSECURITYDEFINER:

| Função                      | Argumentos                                    | Retorno                                                                                           |
| --------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| operator_session_create_v2  | bytea,text,text,text,bigint,timestamptz       | void                                                                                              |
| operator_session_get_v2     | bytea                                         | TABLE(tenant_id text,operator_id text,role text,principal_revision bigint,expires_at timestamptz) |
| operator_session_replace_v2 | bytea,bytea,text,text,text,bigint,timestamptz | void                                                                                              |
| operator_session_revoke     | bytea                                         | void, contrato atual                                                                              |
| oidc_state_reserve          | bytea,timestamptz                             | boolean, contrato atual                                                                           |
| oidc_state_consume          | bytea                                         | boolean, contrato atual                                                                           |

Remover antigas create/get/replace e grants correspondentes na migration;
não manter overload/alias permissivo. Preserve funçõeseRLS/owner/searchpath/
parâmetros/expiração de15min como0000, statecomo0001. Grant apenasEXECUTE nas
seis assinaturas novas ao sessionrole eUSAGEAuth; semPUBLIC/tabelasdiretas,
semUSAGEproduto. Preflight fixa nomes, assinaturas, bodies/grants/RLS e coluna/
constraint novas; objetoisca, overload ou grant extra recusa serving.

create_v2 valida revisão positiva e persiste junto ao restante da sessão.
get_v2 filtra legado0, expiração e famíliarevogada; mapper recusa bigint não
inteiro/seguro, não arredonda. Parser do principal também valida a revisão
antes de converterstringPG; corrupção/overflow dá503, sem cookie novo.
replace_v2 mantém família e lock atual, mas exige oldtenant/operator/role/
principal_revision iguais ao próximo binding. Mudança de revisão usa
switchIdentity, não herda uma família de revisãoantiga.

switchIdentity mantém BEGIN→revokeantiga→create_v2→COMMIT no Authclient como
jáexiste. Erro/COMMITincerto descarta client e não emitecookie. Não depende de
transação de dados aberta. Antes de Set-Cookie, reler principal por dados:
revisão/role/active/versionmudou =>revoke da NOVAfamília e erro redigido, nunca
emitir umcookie conscientemente obsoleto. Se essa aposentadoria falhar,503sem
cookie e a família sem token divulgado fica retida; não compensar principal.
Mudança posterior à última checagem pode invalidar cookie já emitido: guard
em todo request detecta, sem alegação de login linearizável crosspool.

Corte: drenar servingantigo; aplicar migrations de dados necessárias/novoAuth;
recriar serving com preflightv2; cookies0 exigemlogin. Sem modo misto alegado
seguro. AntigoAPI pode ignorar binding: nãoadmiti-lo após ativação, mesmo se a
imagem estiver assinada. Rollforward/recuperação de candidato emU15/T4;
nenhum downgrade cego ou execução real nestaSPEC.

## 7. Memória e integração

InMemoryCaseAuthority.runAuthorizedMutation usa a MESMAfila que
readSnapshot/putAssignment/applyVerifiedPrincipalState/invalidate. O callback
recebe snapshot interno sem reenfileirar readSnapshot; validação de principal,
grant e comando ocorre ali, writer fica dentro da fila até resolver/rejeitar.
Nenhuma query/portremoto é aceito como store de memória; mistura/injeção sem
unidade compatível é503 antes de efeitos. Não basta mutex novo só no handler.

Task/approvalcreation0257 preservam publicação destacada; status/decisão0250
preservam atomicidade/audit/CAS. Runtime emmemória mantém sua convergência
idempotente de múltiplos stores, com autorização protegida durante TODA a
sequência, inclusive se falhar. Não anuncia atomicidade única desses stores:
autorização de cada write fica anterior à revogação que espera na fila. EmPG
essa sequência é uma transação, como§4. Falha não pode criar nenhum efeito
sem a autorização já validada. Preservar os testes existentes de recuperação
de decisão/audit e nunca trocar falha por sucesso ou executar provider remoto.

Memória do Authstore implementa famílias/replace/switchIdentity/revoke com
estado destacado e publicação síncrona após todasvalidações; falha no create
não aposenta a família antiga. Registros levam principalRevision validada,
sem default1. Reinício continua volátil, não há alegação de durabilidade.

Arquivos futuros: APIcoordenador/hook/principalreader/session/producer/
preflight/rotas e testes; persistence caseauthority/scopedprimitives; journey;
Authmigration/migrator/scripts de invalidação; docs0107/0305. Semlockfile,
produto ouCI. Shared server.ts/operator-session-hook.ts/callers com0259 são
integrados um delta porvez/rebase e novo teste conjunto; não editar aSPECdoClaude.
U04 não édispensada porB1 e nenhummock do console certifica autoridade real.

## 8. Aceites reprováveis

| ID  | Evidência obrigatória                                                                                                                                                                                                                                                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R01 | Cada uma das seis rotas: grant/principalrevogado antes da unidade nega semwrite/audit; válido confirma sob as roles existentes.                                                                                                                                                                                                                                                     |
| R02 | BarreirasPG nas duas ordens: mutationlock antesrevoke mantém ordem; revokecommit anteswrite faz negar. Semvalidar sótimestamps.                                                                                                                                                                                                                                                     |
| R03 | Desconectar client dono após grant/read impede commit parcial e não deixa outra conexão gravar permissivamente.                                                                                                                                                                                                                                                                     |
| R04 | Replay0257 apósrevogação não devolve recurso; key/context409 só depois dos guards atuais.                                                                                                                                                                                                                                                                                           |
| R05 | Matriztenant/actor/source/role/authorityVersion e lifecycle mantém401/403/404/409/503 definidos.                                                                                                                                                                                                                                                                                    |
| R06 | Runtimeapproval e journey mantêm positivos/CAS/selfapproval/idempotência; mutante de port foratx falha.                                                                                                                                                                                                                                                                             |
| R07 | Login sem alteração de principal não revoga outros browsers; revisão aumentada invalida todas famílias antigas e nova sessão válida funciona.                                                                                                                                                                                                                                       |
| R08 | Role restaurada não reativa cookie antigo; outrotenant e primarycredential têm semântica explicitamente distinta.                                                                                                                                                                                                                                                                   |
| R09 | Inventário de rotastrusted/defaultdeny/HEAD/CORS/exceções; POSTwebhookRoute /v1/webhooks/channels/:channel/messages funciona com verificador próprio sem operador, preservando validação de channel e cookiehook.                                                                                                                                                                   |
| R10 | Authschema/papéis/funções/legado/preflight objetos-isca; nenhum novo acesso direto entre schemas.                                                                                                                                                                                                                                                                                   |
| R11 | Memória guarda a mesma ordem sem fila reentrante, estado perdido ou autorização transferida de snapshot encerrado.                                                                                                                                                                                                                                                                  |
| R13 | Expiração confirma somenteEXPIRED e erro original; validação/selfapproval/CAS/SQL/downstream falhos não confirmam alterações indevidas.                                                                                                                                                                                                                                             |
| R14 | Prova/uid/path/política/artefato/perfil/alvo/tempo/revisão adulterados não executam invalidação; fixture não conta como aprovação nem como testeOS.                                                                                                                                                                                                                                 |
| R15 | Matriz§4.2: retries do mesmo/outro Approver ou Supervisor autorizado em APPROVED/RESERVED/EXECUTING/EXECUTED e REJECTED; mesmo verdict converge, oposto409; ator/causalidade/reason originais intactos, sem novo CAS/evento de approval ou efeito duplicado. Incluir pares execution incompatíveis, causalidade ausente409 e gap legado decisão/resolução/audit com falha/rollback. |
| R12 | Cookie antigo/novo após replace/switchIdentity e crash/COMMITincerto revalida o contrato existente; health não é penalizado por cookie velho.                                                                                                                                                                                                                                       |

Firstred3caracterizações está preservada, mas não substitui os novos negativos.
Node22/typecheck/lint/npmtest/PG/E2E/certify e crítico fresco completos antes de
integrar, sob claims próprios. Sem provider/dado real/deploy/piloto nesta etapa.

## 9. Decisões propostas e gate

P1: seis comandos numa unidade de autorização/escritaPG, recusa503 do modo
queryable compartilhado e factories incompatíveis, sem mudar rolematrix.
P2: principal atual em todos os pathsoperadortrusted e a ordem de erro§5;
fora das seis mutações precondição de request, sem cancelamento retroativo.
P3: binding de cookie à revisão existente, invalidação globalrevision-only e
Authprotocolv2/corte que exige novologin, sem acesso entre schemas.
P4: ferramenta interna com approval/handoff e dry-run; não criar autoridade
administrativa porAPI/tool de modelo. Uso real permaneceT4.
P5: diferenças memória/PG§7 e temporalidade/logout/crosspool§5/§6 explícitas;
nenhuma prova de durabilidade ou atomicidade que a fronteira não ofereça.

R5 fixa a matriz de convergência compatível com o handler, além da exceção
pelo template registrado e dos outcomes de expiração. Fecha o HOW proposto
para crítica; não demonstra implementação. Próximo:
crítico fresco do contrato e confrontocomfonte; resolver obrigatórios,
congelarhash e pedir revisão humanaT3 dessasdecisões. Somente depoisBUILD,
claims de recursos e testes reais. Aprovações0144/0254 não são repetidas;
novas premissas de0262 não herdam os gates anteriores.

U04/U08 permanecem abertos;0257/0258 têm suas próprias decisões pendentes.
