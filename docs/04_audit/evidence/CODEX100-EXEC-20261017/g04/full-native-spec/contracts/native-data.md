# Dados, histórico e lifecycle0239 — contrato normativo proposto

Resolve R1-02. Tipos abaixo são especificação inerte; objetos são fechados salvo o domínio Json de dados. Campos sem `?` são obrigatórios; null significa ausência real, nunca referência fabricada. Identificadores internos1–200bytessemNUL, digest64hex, contagens inteiros seguros não negativos e USD finito não negativo arredondado a seis casas. Preservar o JSON lógico e os codecs dos owners.

## 1. Entrada, captura e reconstrução

```ts
type Json = null | boolean | number | string | Json[] | { [k: string]: Json }
type RuntimeStopReason = RuntimeResult['stopReason']
type TextElement = {
  byteRange: { start: number; end: number }
  placeholder?: string | null
}
type WireText = {
  type: 'text'
  text: string
  text_elements?: TextElement[]
}
type NativeTurnInput = { version: 1; content: WireText[] }
type StartTurn = {
  sessionId: string
  clientKey: string
  input: NativeTurnInput
}
```

O cliente não envia RuntimeInput, agente, tenant, profile, state, context, budget, resume, toolinvocation ou grants. O host constrói esses campos. AdapterCodex decodifica input text e passa o vetor selecionado a NativeTurnInput; outros campos conhecidos nãoimplementados continuam UNSUPPORTED_VARIANT antes de enqueue. Extras ignorados porSerde não se tornam authority. O decoder não converte text_elements em textElements: a primeira grafia pertence ao enum da fonte, enquanto byteRange pertence ao struct camelCase.

content1–64elementos; soma UTF8 de text<=65536bytes, até256TextElements no vetor inteiro; entrada canônica completa<=524288bytes, profundidade64/nós100000 e frameRPC1MiB. Range tem start/end inteiros0..65536, start<=end<=UTF8(text).length, extremos em fronteiras UTF8. placeholder ausente/null é OptionNone; string conserva bytes, limitada pelo cap agregado. text_elements ausente equivale a[], explícitonull é inválido para o Vec da fonte. Restrições além da referência permanecem variantes abertas, não prova literal de rejeição. NUL que o logv1não representa é recusado antes de enqueue para input; não se deduz suporte global pelo codec do journal.

Guardar o NativeTurnInput original validado **sem descartar presença/ordem/texto/anotações** em `operational_executions.request.nativeInput`, junto de `nativeInputDigest`=SHA256 dos seus bytes canônicos e versão1. requestHash inclui essa captura e bindings confiáveis. Não guardar RPCid como executionId. JSONB é admissível aqui porque números de ranges são seguros e NUL foi excluído neste caminho; os bytes de protocolo brutos continuam nas capturas de prova. Não reconstruir input pela concatenação de deltas ou por cache de A.

RuntimeInput.userMessage = JSON canônico `{type:'cvg.user-input/1',content:captured.content}`, ordem original e propriedades presentes conservadas. Seu cap interno é1MiBUTF8; essa serialização não altera o limite público de64KiB de texto. O modelo é informado pelo system confiável de que o envelope é dado de usuário. Não inserir separators inventados entre inputs nem promovê-los a instrução confiável. O formato da mensagem system/user da0224 permanece canônico e aplica seus limites de contexto, inclusive eventual CONTEXT_OVERFLOW antes de modelo.

Na projeção de UserMessage.content para read/resume, derivar do input persistido: manter ordem e text; emitir text_elements como vetor normalizado porSerde ([]quando ausente); TextElement.placeholder emite null quando ausente. A representação original continua disponível para prova de presença/ausência; history representa o DTO tipado da fonte. userMessage.clientId=null nesta seleção; variantes de correlação de clientId não implementadas não são inventadas. Dois inputs com ranges distintos precisam reaparecer em B, sem memória de A.

## 2. Referências e contabilidade

```ts
type CheckpointRef = { checkpointId: string; digest: string; version: 2 }
type InputRef = { kind: 'input'; inputDigest: string; version: 1 }
type JournalRef = {
  kind: 'journal'
  operationKey: string
  proposalDigest: string
  resultDigest: string
}
type ObservationRef = {
  kind: 'checkpoint'
  checkpointId: string
  digest: string
  observationId: string
}
type ResultRef = JournalRef | ObservationRef
type ResponseRef = { itemId: string; eventId: string; digest: string }
type Metrics = { inputTokens: number; outputTokens: number; costUsd: number }
type NativeAccounting = {
  status: 'KNOWN' | 'RESERVED_UNKNOWN'
  admissions: { model: number; tool: number }
  charged: Metrics
  measured: Metrics | null
  partialMeasured: Metrics | null
  unknownAdmissionIds: string[]
}
type EffectRef = {
  logicalStepId: string
  operationKey: string
  proposalDigest: string
  state: 'RESERVED' | 'EFFECT_STARTED' | 'CONFIRMED' | 'FAILED' | 'UNCERTAIN'
  resultRef: ResultRef | null
}
```

admissions conta admissões nativas, não declara que todo corpo reservado foi invocado. Contador real de body vem do observador/ledger de efeito, não desse nome. KNOWN exige unknownAdmissionIds=[], measured!=null, charged=measured e partialMeasured=null. RESERVED_UNKNOWN exige ao menos um ID pendente/incerto, measured=null, charged=uso conhecido+limites superiores desconhecidos; partialMeasured pode conter apenas soma comprovada das chamadas quitadas, ou null se indisponível. Não declarar medição0 de uma chamada sem resposta. Antes de claim, ausência comprovada de reservas/calls produz KNOWN com zeros reais, não UNKNOWN fabricado.

JournalRef só lê resultado confirmado sob os mesmos bindings. ObservationRef pode apontar ToolResult capturado no checkpoint, inclusive FAILED; não implica confirmação do efeito. Validar todos os refs por tenant/execução/manifest/digest e versão antes de ler ou projetar. resultDigest não substitui o valor útil. EffectRefs são únicos por operationKey, ordenados por logicalStep nativo; não reordenar efeitos para esconder causalidade. UNKNOWN permanece na contabilidade e no settlement mesmo se houver um diagnóstico de toolFAILED.

## 3. Terminal e eventos fechados

```ts
type TerminalSnapshot = {
  executionId: string
  state: 'SUCCEEDED' | 'FAILED_TERMINAL' | 'CANCELLED'
  stopReason: RuntimeStopReason
  causeCode: string | null
  settlement: 'KNOWN' | 'UNKNOWN'
  checkpointRef: CheckpointRef | null
  effectRefs: EffectRef[]
  accounting: NativeAccounting
  responseRef: ResponseRef | null
  startedAtMs: number | null
  completedAtMs: number
  durationMs: number | null
}
type NativeTerminal = TerminalSnapshot & { eventId: string; digest: string }
```

RuntimeStopReason usa o catálogo existente; não criar reason global UNKNOWN. SUCCEEDED exige checkpointRef/responseRef não nulos, settlementKNOWN/accountingKNOWN e obrigações quitadas. CANCELLED ou FAILED_TERMINAL podem ter refs nulos se os fatos nunca existiram. completedAtMs é tempo do banco persistido; startedAtMs só existe depois do start efetivo, durationMs só é definido quando existe start. Em espera/partial, nenhuma ausência vira string vazia ou UUIDnovo. eventId/digest são acrescentados pelo reader a partir do evento/coluna autenticados, não dentro do conteúdo hasheado.

Cancelamento QUEUED antes do claim: snapshot lê estado/fila/checkpoint/journal sob a ordem de locks; se não existem reservas nem efeitos, terminalCANCELLED/stopReasonCANCELLED, causeCode=null, checkpointRef=null,responseRef=null, effectRefs=[], accountingKNOWN/zeros, startedAtMs=null,durationMs=null. Apenas completedAtMs/eventId/digest reais são criados. Antes de devolver ACK terminal, commit conhecido do conjunto de fechamento. A presença de useritem já aceito não inventa um assistantitem.

### 3.1 Envelope comum, frame e erro governado

Esta seção é a única definição normativa dos campos comuns; não remete sua definição de volta à SPEC. Todos os objetos abaixo são fechados, com todos os campos presentes; propriedades extras, omissão e null fora das uniões explícitas são INVALID_INPUT antes de append/projeção. Nenhum campo vem de identidade ou grants fornecidos pelo cliente.

```ts
type NativeExecutionId = string // UUIDv7 canônico lowercase persistido do turno
type NativeSessionId = string // identidade exata da sessão vinculada, UTF8 1..120 bytes
type NativeEventId = string // ne_ + 64 caracteres hex lowercase, definido abaixo
type Sha256Hex = string // exatamente 64 caracteres [0-9a-f]
type NativeOrdinal = number // inteiro seguro 1..8192, contíguo por execução
type CanonicalUtcTimestamp = string // YYYY-MM-DDTHH:mm:ss.SSSZ, UTC, milissegundos

type NativeItemPayload = {
  itemId: string
  kind: 'user' | 'assistant' | 'tool'
  logicalStepId: string | null
  toolId: string | null
  toolVersion: string | null
  operationKey: string | null
  inputRef: InputRef | ObservationRef | null
  resultRef: ResultRef | null
  text: string | null
  responseProvenance: ResponseProvenance | null
}
type NativePayloadByType = {
  'turn.accepted': {
    requestDigest: Sha256Hex
    compositionDigest: Sha256Hex
    profileDigest: Sha256Hex
    inputRef: InputRef
  }
  'turn.started': {
    epoch: number
    workerId: string
    checkpointRef: CheckpointRef
  }
  'approval.waiting': {
    approvalId: string
    intentDigest: Sha256Hex
    logicalStepId: string
    operationKey: string
  }
  'approval.decided': {
    approvalId: string
    intentDigest: Sha256Hex
    decision: 'APPROVED' | 'DENIED' | 'EXPIRED'
  }
  'item.started': NativeItemPayload
  'text.delta': { itemId: string; delta: string }
  'item.completed': NativeItemPayload
  'execution.uncertain': {
    causeCode: string
    checkpointRef: CheckpointRef | null
    effectRefs: EffectRef[]
    accounting: NativeAccounting
  }
  'cancel.requested': { requestId: string; requestedAt: CanonicalUtcTimestamp }
  'turn.terminal': TerminalSnapshot
}
type NativeEventV1 = {
  [K in keyof NativePayloadByType]: {
    version: 1
    eventId: NativeEventId
    executionId: NativeExecutionId
    sessionId: NativeSessionId
    ordinal: NativeOrdinal
    type: K
    observedAt: CanonicalUtcTimestamp
    payload: NativePayloadByType[K]
  }
}[keyof NativePayloadByType]
type NativeFrame = {
  event: NativeEventV1
  digest: Sha256Hex
  cursor: string // token base64url canônico, UTF8 1..1024 bytes; contrato de cursor da SPEC7.2
}
type NativeErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'CAPACITY'
  | 'AUTHORITY_LOST'
  | 'STORAGE_UNAVAILABLE'
  | 'COMMIT_UNKNOWN'
  | 'CURSOR_INVALID'
  | 'CURSOR_UNAVAILABLE'
  | 'CONTEXT_OVERFLOW'
  | 'DELIVERY_LIMIT'
  | 'UNSUPPORTED_VARIANT'
type NativeErrorDataCVG = {
  cvg: {
    version: 1
    code: NativeErrorCode
    executionId: NativeExecutionId | null
    settlement: 'KNOWN' | 'UNKNOWN' | null
  }
}
```

Oito campos comuns, dez discriminantes. executionId conserva o UUIDv7 do turno e sessionId conserva a identidade realmente vinculada ao serviço de sessão; não converter RPCid, global sequence ou itemId para qualquer um deles. O eventId nasce na transação de append como `ne_`+SHA256 dos bytes UTF8 canônicos de `{v:1,tenantId,executionId,ordinal}` usando o tenant autenticado. A chave é estável para releitura/idempotência e não concede autorização. Ordinal começa em1, avança sem buraco visível por execução no commit conhecido da mesma transação que grava evento/counters; transação abortada não publica evento, ordinal nem ACK. Os limites8192 e posições de fechamento reservadas continuam vigentes. epoch em turn.started é inteiro seguro positivo e checkpointRef inicial confirmado.

observedAt é o instante UTC observado no banco para esse append: capturar uma vez a hora do banco em milissegundos inteiros, domínio1970-01-01 até9999-12-31, e serializar estritamente como `YYYY-MM-DDTHH:mm:ss.SSSZ` com calendário válido. Capturar antes de construir/hashar native_record; o timestamp fica dentro desses bytes. A eventual coluna created_at é metadado SQL e não substitui nem recria observedAt na leitura. Reentrega/restart usa o mesmo texto persistido, nunca Date.now, novo eventId ou timestamp derivado do momento de leitura. requestedAt de cancel.requested é o instante já persistido do pedido de cancelamento nesse mesmo formato, podendo anteceder o append; não substituí-lo por observedAt. Os números \*AtMs/durationMs de TerminalSnapshot continuam milissegundos inteiros seguros nos domínios já definidos, e as unidades wire segundos/milissegundos continuam distintas.

Bindings físicos obrigatórios: version↔native_version; eventId↔native_event_id; executionId↔execution_id; sessionId↔native_session_id; ordinal↔native_ordinal; type↔event_type. observedAt/payload e todos os campos comuns estão no native_record; native_record_sha256 é SHA256 dos bytes UTF8 canônicos do **NativeEventV1 inteiro e somente dele**. O codec de captura canônico já exigido é usado antes de await, com escaping inteiro e sem truncamento. Leitor valida versão/shape/tipo-payload, digest e todos os mirrors contra a row autenticada; discrepância é corrupção recusada, nunca reescrita. A sequence SQL bigint não entra como ordinal ou Number. NativeFrame.digest repete o digest verificado; seu cursor vincula aquele evento/digest/manifest conforme o contrato específico, sem grant. Frame, digest e cursor externos não entram no domínio do hash do evento. Caps1MiBevento,16KiBdelta, limites integrais de frame/página e closure64KiB/3slots incluem serialização/escapes nos respectivos domínios, sem descontar overhead.

NativeErrorDataCVG é o formato exato de error.data **somente no erro wire governado**: `{cvg:{version:1,code,executionId,settlement}}`. executionId é null antes de haver execução identificada; settlement é null quando não existe fato de settlement, e KNOWN/UNKNOWN somente quando observado. Não omitir esses campos, fabricar uso0, revelar stack/SQL/credenciais/rawerror ou transportar grants/approval. No mapper governado code=-32600 e message é a string fixa `CVG:` seguida do NativeErrorCode; data segue o objeto acima. Erros Codex literais já definidos na fonte, como Already initialized, conservam seu envelope/mensagem e não são convertidos em erro governado. Tenant/execução/manifest/digest/versão dos refs continuam verificados antes de leitura/projeção.

Provas futuras adicionais NJ23/NJ24: persistir evento completo, encerrar processo e reler bytes/digest/observedAt/cursor idênticos; rejeitar observedAt ausente/extra/desconhecido, calendário/unidade inválida, ordinal fora do domínio/buraco, type/payload incompatíveis e mirrors/digest adulterados. Provar erro antes de claim com executionId/settlement nulos e erro após settlement com fatos reais; mutante que recria timestamp no reader deve falhar. São obrigações NOT_RUN, não testes executados por esta correção documental.

ResponseProvenance é `{kind:'DIRECT_DECISION',decisionStepId,decisionAdmissionIds:string[]}` ou `{kind:'MODEL_RESPONSE',responseAdmissionId,requestSha256,providerPayloadSha256}`. DIRECT_DECISION preserva decisão nativa quitada sem fabricar RESPONSE; MODEL_RESPONSE exige a reserva/uso quitados do pedido efetivo. itemuser usa inputRef, text/result/provenance=null; tool usa tool/version/key e refs reais, text/provenance=null; assistant usa text (vazio em started), provenance quando conhecida e refs nãoaplicáveisnull. Sem dado obrigatório ou com tipo impossível, recusar append/projeção, não preencher default falso.

ItemId nasce antes de seu primeiro evento e persiste: `ni_`+SHA256 de `{v:1,tenant,execution,kind,logicalStepId}`; logicalStepId='user' para input, ID de resposta para assistant e step real para tool. O hash dá estabilidade, não grants. StartTurn persiste captura/fila/execução e turn.accepted + lifecycle do useritem no mesmo commit; a reserva64KiB/3slots de fechamento continua intacta. Resume não cria outro item para o mesmo step. As linhas do evento guardam os refs, não uma segunda autoridade do resultado.

## 4. Mapeamento fechado para Thread/Turn/Item

Thread: metadata persistida em native_thread_record/header; status/updatedAt/preview derivados da última execução/eventos da sessão. preview é texto dos inputs da primeira mensagem na ordem, unido por LF **somente para esse campo de apresentação**, nunca usado para reconstruir input ou contexto. turn list é obtida por `(tenant,native_session_id)` e ordenada por createdAt,id; consultar eventos/refs reais, sem modelo/tool. historyModelegacy e ausência de paginação no recorte não permitem truncar: se a resposta completa excede o cap, erro explícito de limite e variante sem crédito.

Sem execução ativa e sem threadheld incerto, Thread.status é idle; terminal com UNKNOWN/threadheldtrue produz systemError e a superfícieCVGexplica a incerteza. Quando emitido pelo filtroexperimental qualificado, canAcceptDirectInput só é true se o slot estiver livre e a autoridade vigente permitir; false não é nova autorização. Metadata de uma conexão morta não substitui a consulta no primário.

Turn: id=executionIdpersistido UUIDv7; rootTurnId=null para a raiz sem steer/fork; startedAt/completedAt=floor(ms/1000) quando existem, durationMs copiado emms. Resposta inicial de turn/start mantém os null/notLoaded da fonte, mesmo que a execução avance depois; ela é um receipt de aceitação. Read com includeTurnsfalse e thread/started retornam turns=[]; readtrue/resume retornam itens persistidos completos e itemsViewfull. turn/completednotification usa últimoagentMessage emsummary, ou[]/notLoaded se inexiste, preservando essa diferença em relação ao histórico completo.

| Estado/fato nativo                  | Wire selecionado                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QUEUED/CLAIMED/RUNNING              | TurnstatusinProgress, errornull; threadactive, activeFlags[]                                                                                                  |
| WAITING_APPROVAL/WAITING_USER       | inProgress, errornull; threadactive com waitingOnApproval/waitingOnUserInput, sem inventar terminal                                                           |
| SUCCEEDED                           | completed/errornull; assistantmessage concluída verdadeira                                                                                                    |
| CANCELLED, inclusive antes de claim | interrupted/errornull; sem assistantfabricado; refs ausentes continuam somente na superfícieCVG                                                               |
| FAILED_TERMINAL/UNKNOWN             | failed; TurnError com message=códigoCVGseguro e codexErrorInfo/additionalDetails/misalignmentnull; a superfície nativa preserva settlement/accounting/efeitos |
| useritem                            | `{type:'userMessage',id,clientId:null,content:decodeSerde(captured.content)}`                                                                                 |
| assistantitem                       | `{type:'agentMessage',id,text,phase:null,memoryCitation:null,delivery:null,questions:null}`                                                                   |
| toolitem governado                  | DynamicToolCall descrito abaixo, sem solicitar execução ao cliente                                                                                            |

DynamicToolCall: namespace=null, tool=toolIdregistrado, arguments=inputJSONexato da intenção capturada (não a preview), id=itemIddurável. Em started: statusinProgress, contentItems=null,success=null,durationMs=null. Em completedCONFIRMED: statuscompleted,success=true,durationMs medido e contentItems com um `inputText`. Esse texto é JSON canônico do envelope `{version:1,status:logicalToolResult.status,outputPresent:boolean,output:Json|null}`; ausência é outputPresentfalse/outputnull, outputnullpresente é true/null, string permanece string JSON com aspas, objeto/número mantêm tipo. Não usar String(output) ou resumo. O ToolResult completo permanece no journal/checkpoint canônicos, incluindo metadata fora dessa projeção governada.

Falha conhecida/UNKNOWN: statusfailed,success=false; se há ToolResultdiagnóstico capturado, o mesmo envelope é projetado por ObservationRef; se nenhum valor recuperável existe, contentItems=null. durationMs só quando medido, senãonull. successfalse não afirma rollback ou ausência de efeito. Erro de leitura/ref/frame faz falhar a projeção, sem criar resultado de tool. Cada campo e diferença governada precisa de comparação aplicável; literalclientexecution continua requisito aberto do catálogo.

## 5. Donos de processo, reader e executor

Factory nativa recebe `role:'client'|'executor'` como opção confiável, nunca de RPC. roleclient publica a facade create/read/startTurn/resumeExecution/readEvents/subscribe/cancel; startTurn apenas enfileira e retorna receipt; resumeExecution apenas revalida/enfileira uma retomada já autorizada, sem conceder approval ou executar corpo. ClientOptions não recebe tool/model/orchestrator/approve, apenas a fachada de store/identidade/sessão e manifesto; executor recebe as capacidades de execução. A factory de store publica as portas mínimas por role, preservando RLS e sem SQL de cliente. roleexecutor integra o mesmo motor existente e publica ao host `runExact(executionId)`/`runNext()` e close/dispose porclaim. A composição instalada deve qualificar os dois papéis e a mesma identidade de stores/manifesto; facade e executor não são dois motores.

Hoststdio é roleclient; worker operacional independente é roleexecutor. EOF/close do stdio fecha leitores/streams/recursos daquela facade e não chama cancel nem close no executor de outro processo. O worker pode continuar e persistir fatos para uma nova conexão. Standalone durável compõe facade+executor no mesmo processo confiável: executar exige runExactexplícito após startTurn, não claimNextcego; fechar apenas uma subscription não fecha o executor. Close do standalone inteiro interrompe novas admissões locais e drena suas claims; processo morto deixa recovery/UNKNOWN conforme as fronteiras, sem prometer continuidade em memória inexistente.

Não existe cancelamento automático por disconnect de reader. Se o usuário solicita cancel, usar a porta de controle autenticada e a arbitragem nativa. Perder o processo executor não é desconexão de leitor; testes/capturas registram esses eventos separadamente. A API de lifecycle porclaim não introduz SessionPersistence.shutdown agregado adiado.

NJ11/28 acrescentam cold-read de dois textinputs anotados, literal-presence/null/default e todos os campos acima; NJ13/28 acrescentam cancel-after-receipt/before-claim e refs ausentes. NJ07/08/20 acrescentam outputs string/null/objeto/número/ausente e erros de refs. O mesmo candidato deve demonstrar os consumidores instalados, não apenas tipos TypeScript.
