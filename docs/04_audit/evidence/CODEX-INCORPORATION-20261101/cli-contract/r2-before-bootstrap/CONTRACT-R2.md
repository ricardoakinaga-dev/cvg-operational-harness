# Anexo normativo R2 — superfície e traduções da CLI

Parte da SPEC0310. Preparação de contrato, sem implementação ou autorização de BUILD. Este anexo fecha as projeções de cliente; não substitui o contrato ainda pendente do bootstrap autenticado. Tipos de0239 e os contratos0221/0287/0295/0302 são referenciados pelas fontes pinadas, sem copiar outro motor.

## A. Gramática fechada

Somente os flags desta seção são aceitos. Não há abreviações, opção concatenada, flag repetida, valor implícito para flag com valor ou posição extra. `--` encerra opções e não cria entrada shell. `--help` é exclusivo, offline, sem IO de configuração; `--version` só no comando raiz, exclusivo e offline. As duas formas auxiliares também usam JSONL: Command adicional help/version e Resulthelp/version, sem inicializar bootstrap. `--json` é booleano idempotente no schema, mas repetição no argv é erro; default JSONL. `--config <absolute-path>` e `--json` são comuns aos doze comandos. A configuração só tem os campos declarados na SPEC.

| Comando           | Posições      | Flags adicionais aceitos                                                                                                                                                                                  |
| ----------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| doctor            | nenhuma       | nenhuma                                                                                                                                                                                                   |
| config validate   | nenhuma       | nenhuma                                                                                                                                                                                                   |
| config dump       | nenhuma       | `--redacted` obrigatório                                                                                                                                                                                  |
| run               | nenhuma       | `--input <path-ou->` obrigatório; `--profile <alias-ou-id>`, `--session <id>`, `--request-key <key>`, `--timeout-ms <decimal>`                                                                            |
| session list      | nenhuma       | `--limit <decimal>`, `--cursor <opaque>`, `--parent-session <id>`, `--origin subagent`, `--agent-preset <id>`, `--is-seeded true\|false`, `--created-after-ms <decimal>`, `--created-before-ms <decimal>` |
| session inspect   | `sessionId`   | nenhuma                                                                                                                                                                                                   |
| session resume    | `sessionId`   | `--execution <id>`, `--follow`, `--timeout-ms <decimal>`                                                                                                                                                  |
| session fork      | `sessionId`   | `--through-turn <correlationId>`                                                                                                                                                                          |
| execution inspect | `executionId` | nenhuma                                                                                                                                                                                                   |
| execution steer   | `executionId` | `--input <path-ou->` obrigatório; `--request-key <key>`                                                                                                                                                   |
| execution cancel  | `executionId` | `--reason <text>`, `--request-key <key>`, `--wait`, `--timeout-ms <decimal>`                                                                                                                              |
| events            | `sessionId`   | `--execution <id>`, `--after <cursor>`, `--follow`, `--limit <decimal>`, `--timeout-ms <decimal>`                                                                                                         |

`--timeout-ms` só é válido em run, resume com execution ou follow, cancel com wait e events com follow. Em resume, execution já implica observação; follow sem execution seleciona **session-v1**. Run não aceita follow porque sempre observa sua execução até uma condição de saída. Eventos sem execution selecionam **session-v1**; com execution selecionam **native-v1** e exigem vínculo autorizado entre os dois IDs. Um `--after` não é permitido em resume: o modo attach inicia no cursor0 sem reexecutar nenhum fato; a retomada de leitura com cursor é feita pelo comando events. Cancel sem wait devolve o receipt e termina.

Run seleciona perfil por: flag explícita, senão defaultProfile da configuração, senão erro INVALID_ARGUMENT antes de bootstrap. Resolver um único alias por lookup exato; o alvo é tratado como ID final, mesmo que também exista como chave no mapa. Não resolver recursivamente; exigir propriedade própria do mapa, sem lookup herdado por prototype. A autoridade do alvo é conferida pela composição, não pelo alias. Nenhum outro comando troca o perfil de uma sessão existente.

Decimais são strings canônicas `0|[1-9][0-9]*`, sem sinal/expoente/espaço, e precisam caber em safeinteger. Limit tem1–100, default50, tanto para list quanto events. Created-after/before são epochms0–MAX*SAFE_INTEGER; se ambos presentes, after < before. Os filtros são os seis campos exatos0295; não adicionar filtro livre. Timeout100–3600000ms, default configuração ou300000. IDs têm1–200 caracteresASCII `[A-Za-z0-9.*:-]`; perfil/alias continuam1–120. O domínio CLI é declarado, não prova de todas as variantes de identificador da referência. Key tem8–120 caracteresASCII `[A-Za-z0-9._:-]`, sem trim silencioso. Omitida, gerar UUID antes de await; steering usa steerKey, run usa clientKey no startTurn e cancel usa Idempotency-Key. Fork/resume não aceitam --request-key e têm correlação local gerada apenas para diagnóstico, sem alegar dedup no port.

## B. Texto e admissão antes de efeitos

O cap físico de leitura de arquivo/stdin é1MiB, UTF8fatal, por contador sobre descriptor regular para arquivo. O domínio nativo de **run** é separado: texto0–65536bytesUTF8, semNUL; input exato `{version:1,content:[{type:'text',text:<bytes decodificados>,text_elements:[]}]}`. Texto vazio é permitido porque0239 não exige tamanho textual positivo; não inventar mensagem substituta. Não normalizar Unicode, CRLF ou whitespace. A captura canônica precisa caber em524288bytes e nos limites nativos; rejeitar se não couber, sem truncar. Todas essas verificações, schema/config/flags e a resolução sintática do perfil ocorrem **antes de createThread**. Autoridade/perfil real são conferidos antes de sua criação pela composição.

NUL produz INPUT_INVALID_TEXT; UTF8inválido produz INPUT_INVALID_UTF8; cap nativo/serialização produz INPUT_LIMIT, todos exit2/outcome not_dispatched. Casos obrigatórios:0,65535,65536,65537bytes; multibyte cujo número de caracteres cabe mas UTF8excede; NUL no começo/meio/fim; escapes que ultrapassem a captura; arquivo que cresce e FIFO. Steering aplica1–4096 pontos de código do contratoK06 ao texto completo e o cap de leitura físico; não usar a regra textual0239 para ampliar a caixaK06.

## C. Envelope e projeções de saída

Sem propriedades extras. Campos declarados nullable sempre aparecem como null quando não conhecidos; os demais são obrigatórios. Não retornar registro bruto do backend. `command` é um dos doze nomes literais da tabelaA, sem argumentos. Tipos referidos: SessionEventV1 é validado pelo catálogo aprovado0221; NativeEventV1, NativeTerminal e NativeAccounting têm o schema fechado native-data§2/§3 da aprovação0239, com hash pinado. Resultados não geram novas classes de evento de kernel.

```ts
type Source = 'session-v1' | 'native-v1'
type Eligibility = 'V1_ONLY' | 'NATIVE_V1' | 'NOT_CHECKED'
type BackendState =
  | 'RECEIVED'
  | 'QUEUED'
  | 'CLAIMED'
  | 'RUNNING'
  | 'WAITING_APPROVAL'
  | 'WAITING_USER'
  | 'SUCCEEDED'
  | 'FAILED_RETRYABLE'
  | 'FAILED_TERMINAL'
  | 'CANCELLED'
type Status =
  | 'SUCCEEDED'
  | 'ATTACHED'
  | 'STATIC_VALID'
  | 'READY_OFFLINE'
  | 'ACCEPTED'
  | 'CANCEL_REQUESTED'
  | 'WAITING_APPROVAL'
  | 'WAITING_USER'
  | 'PENDING'
  | 'CANCELLED'
  | 'FAILED'
  | 'OUTCOME_UNKNOWN'
  | 'UNSUPPORTED_CAPABILITY'
  | 'INTERRUPTED'
type Phase =
  | 'parse'
  | 'config'
  | 'input'
  | 'bootstrap'
  | 'authorize'
  | 'create'
  | 'submit'
  | 'read'
  | 'resume'
  | 'fork'
  | 'steer'
  | 'cancel'
  | 'observe'
  | 'output'
  | 'cleanup'
type LocalCode =
  | 'INVALID_ARGUMENT'
  | 'INVALID_CONFIG'
  | 'INPUT_LIMIT'
  | 'INPUT_INVALID_UTF8'
  | 'INPUT_INVALID_TEXT'
  | 'UNSUPPORTED_CAPABILITY'
  | 'UNSUPPORTED_NATIVE_SNAPSHOT'
  | 'NOT_FOUND'
  | 'DENIED'
  | 'TRANSPORT_UNAVAILABLE'
  | 'STORAGE_UNAVAILABLE'
  | 'OUTCOME_UNKNOWN'
  | 'CONFLICT'
  | 'CAPACITY'
  | 'CONTEXT_OVERFLOW'
  | 'CURSOR_INVALID'
  | 'CURSOR_UNAVAILABLE'
  | 'DELIVERY_LIMIT'
  | 'INTERNAL_ERROR'
  | 'CLEANUP_UNCONFIRMED'
type NativeCode =
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
type Row = { schemaVersion: 1; command: Command } & (
  | {
      kind: 'request_prepared'
      requestKey: string
      keyUse: 'diagnostic' | 'clientKey' | 'steerKey' | 'http-idempotency'
      sessionId: string | null
      executionId: string | null
    }
  | { kind: 'thread_created'; sessionId: string; manifestDigest: string }
  | { kind: 'result'; data: Result }
  | {
      kind: 'execution_receipt'
      executionId: string
      sessionId: string | null
      state: BackendState
      requestDigest: string | null
      disposition: 'ACCEPTED' | 'DUPLICATE' | 'CANCEL_REQUESTED' | 'TERMINAL'
      steerKey: string | null
      seq: number | null
    }
  | {
      kind: 'session_event'
      source: 'session-v1'
      cursor: string
      event: SessionEventV1
    }
  | {
      kind: 'native_event'
      source: 'native-v1'
      cursor: string
      event: NativeEventV1
    }
  | {
      kind: 'error'
      code: LocalCode
      nativeCode: NativeCode | null
      phase: Phase
      outcome: 'not_dispatched' | 'unknown' | 'known'
      retryable: false
      sessionId: string | null
      executionId: string | null
    }
  | {
      kind: 'command_end'
      status: Status
      exitCode: number
      executionTerminal: boolean
      sessionId: string | null
      executionId: string | null
      lastCursor: string | null
      terminal: NativeTerminal | null
    }
)
type ExecutionView = {
  executionId: string
  state: BackendState
  attempt: number
  steps: number | null
  createdAt: string
  updatedAt: string
  cancelRequestedAt: string | null
  settlement: 'KNOWN' | 'UNKNOWN' | null
  accounting: NativeAccounting | null
}
type SessionView = {
  sessionId: string
  eligibility: Eligibility
  parentSession: string | null
  inheritedEventCount: number
  nativeThread: NativeThreadProjection | null
}
type NormalizedConfigV1 = {
  formatVersion: 1
  profileAliases: Record<string, string>
  defaultProfile: string | null
  output: { color: false }
  observationTimeoutMs: number
}
type Result =
  | {
      type: 'help'
      forCommand: Command12 | 'root'
      usage: string
      commands: Command12[]
    }
  | { type: 'version'; cliVersion: string; buildDigest: string }
  | {
      type: 'doctor'
      cliVersion: string
      buildDigest: string
      nodeVersion: string
      runtimeProbed: false
      failures: DoctorFailure[]
    }
  | { type: 'config_validation'; operationallyVerified: false }
  | {
      type: 'config_dump'
      operationallyVerified: false
      config: NormalizedConfigV1
    }
  | {
      type: 'session_page'
      items: SessionSummaryProjection[]
      nextCursor: string | null
      examined: number
      skippedUnadopted: number
    }
  | { type: 'session'; session: SessionView }
  | {
      type: 'fork'
      sourceSessionId: string
      sessionId: string
      format: 'canonical-v1'
      nativeEligible: false
      inheritedEventCount: number
      sourceDigest: string
      writerClosed: boolean
    }
  | { type: 'execution'; execution: ExecutionView }
  | {
      type: 'event_page'
      source: Source
      emitted: number
      lastCursor: string
      nativeTerminal: NativeTerminal | null
    }
type DoctorFailure =
  | 'NODE_UNSUPPORTED'
  | 'BUILD_METADATA_INVALID'
  | 'CONFIG_INVALID'
  | 'LOCAL_METADATA_UNAVAILABLE'
```

`Command12` é a enumeração literal deA; `Command` acrescenta help/version. Help usa textos fixos derivados da gramática e não argv/config/payload. NormalizedConfigV1 em dump materializa defaults locais: aliases{}, defaultProfilenull, colorfalse, timeout300000; inputCliConfigV1 não passa a aceitar null por isso. `SessionSummaryProjection` é exatamente0295 `{sessionId,createdAt,isSeeded,parentSession,origin,agentPreset,inheritedEventCount}` com campos opcionais do backend normalizados para null, mais eligibility sempre NOT_CHECKED; list não faz uma consulta adicional por sessão. `NativeThreadProjection` é a projeção0239/native-data validada de readThread, sem inventar metadata para streams v1. Inspect/attach são leitura de metadados: SessionView não materializa todo o log. NativeThreadProjection usa readThread(includeTurns:false), com os campos de presença/null/notLoaded previstos0239; v1 usa header canônico autorizado e nativeThreadnull. Eventos e histórico são lidos pelo comandoevents. Nenhum dump concatena toda a sessão para criar um frame gigante. Seleção da elegibilidade deve ser feita pelo port autenticado de bootstrap, não por presença de parentSession/isSeeded. Enquanto esse binding não existir, comandos online não são qualificados.

Run e resume--execution emitem prepared, zeroouum thread_created, receipt conhecido e eventos; não produzem um segundo Result com terminal reconstruído. List, inspect, attach e fork emitem um Result do tipo da operação. Steer/cancel emitem receipt; cancel--wait também pode emitir ExecutionView da releitura final. Events emite eventos e um Result event_page ao terminar a página/observação. Doctor/config emitem seu Result e command_end; falhasemitem error e command_endFAILED, exceto pipe impossível. Nenhum outro Result é admitido em um comando. `writerClosed:false` é fato de falha de cleanup, nunca fork bem-sucedido para fins de qualificação.

## D. Cursores e leitura cancelável

List usa o cursor0295 byteexato; native-v1 usa o cursor0239 byteexato. Session-v1 usa **projeção de cliente do número de sequência** do SDK existente, não um cursor nativo inventado. Formato `sc1.<base64url sem padding>` do UTF8JSON canônico com ordem fixa `{version:1,source:'session-v1',sessionId,contextFingerprint,sequence}`; sequence é string decimal canônica0–MAX_SAFE_INTEGER. Até1024 caracteres para este cursorCLI. Decodificar estritamente UTF8/JSON/keys/versão/canonicalidade, comparar sessionId e fingerprint confiável do contexto corrente, então converter **somente esse campo decimal validado** em afterSequence:number. Não converter o token opaco0239/0295. ContextFingerprint não é segredo nem grant; é digest da identidade/instalação/perfil autorizados pelo bootstrap e sua implementação permanece parte de F1. Alterar um cursor nunca concede permissão: o backend reautoriza a sessão em cada read. A sequência apenas escolhe uma posição já autorizada.

Ausência de after em session-v1 equivale a sequence0. SDKreadEvents(session,{afterSequence,limit}) continua sem método ou parâmetro novo. Validar eventos em ordem densa a partir de after+1; gap/catálogo inválido falha, sem pular. O cursor de cada evento contém sua sequência real. Página vazia conserva o cursor anterior; página não vazia termina no último write concluído. Não usar nextCursor:null para inferir um terminal a partir de página cheia/vazia de sessão. Sem follow, ler uma página; com follow, nova consulta de leitura após250ms canceláveis quando vazia. Não usar tail0296 com suas retries como se fosse semretry.

O binding selecionado deve fornecer SDKtransport com close possuído e testado, como createStdioSdkTransport, ou adapterHTTP qualificado de leitura com cancelamento efetivo. O façade in-process sem close/cancel não satisfaz essa condição. Signal/timeout fecha o waiter, cancela o request de leitura pelo recurso próprio, chama close no transporteSDK para rejeitar pending e junta a promessa original; não basta Promise.race e perder o handle. Nenhum SDKmethod novo. Operações remotas que sejam só leitura continuam sob ownership do servidor, não são cancelamento de execução. Um read que não assenta depois do fechamento resulta CLEANUP_UNCONFIRMED e reprova Q10.

Write de stdout mantém callback original e espera drain quando necessário. Signal/timeout/EPIPE remove somente listeners doCLI, destrói o pipe de saída próprio quando preciso para completar o callback e conserva lastCursor anterior para escrita não confirmada. Juntar o callback original antes de declarar cleanup confirmado. Não apagar todos os listeners de stream emprestado nem fechar worker/servidor. Deadline5s não libera ownership de uma promise que continua viva; residual/timeout é FAIL de qualificação, não quiescência. Fechar observação não chama cancel. O limite nativo porframe/página permanece menor que os caps de filaCLI e precisa ser verificado antes de buscar nova página.

## E. Estados, conhecimento e erros

Ordem de precedência obrigatória: (1) receipt/terminal conhecido nunca é apagado por falha posterior de observação; (2) settlementUNKNOWN/UNKNOWN_EFFECT/COMMIT_UNKNOWN ou resposta de mutação perdida/malformada depois do envio produz OUTCOME_UNKNOWN/exit7, sem retry; (3) só depois mapear recusa validada conhecida; (4) cleanup secundário preserva causa/exit inicial. Se a operação tinha sucesso e somente cleanup falhou, exit14. Erro desconhecido depois de escrita possivelmente enviada não pode virar um inofensivo INTERNAL_ERROR/exit14. Pode haver receipt conhecido antes do error/command_endPENDING; não descartar esse receipt.

| Fato real observado                                                    | Status/exit                                                                           | executionTerminal                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------ |
| SDK/native/API leitura bem-sucedida, configuração válida               | SUCCEEDED ou statusoffline/ATTACHED,0                                                 | false                                      |
| start/resume conhecido ainda ativo, observação expira ou perde conexão | PENDING,11; receipt anterior conservado                                               | false                                      |
| WAITING_APPROVAL                                                       | WAITING_APPROVAL,10; parar observação após escrever o fato/cursor, nunca aprovar      | false                                      |
| WAITING_USER                                                           | WAITING_USER,15; parar observação após escrever o fato/cursor                         | false                                      |
| RECEIVED/QUEUED/CLAIMED/RUNNING/FAILED_RETRYABLE durante observação    | continuar; no prazoPENDING,11                                                         | false                                      |
| NativeTerminalSUCCEEDED validado com settlement/accountingKNOWN        | SUCCEEDED,0                                                                           | true                                       |
| CANCELLED confirmado, sem prova de UNKNOWN                             | CANCELLED,12                                                                          | true, sem alegar rollback/quiescência      |
| FAILED_TERMINAL conhecido sem UNKNOWN                                  | FAILED,1                                                                              | true                                       |
| Terminal lógico com settlementUNKNOWN/UNKNOWN_EFFECT                   | OUTCOME_UNKNOWN,7; manter o terminal lógico e accounting real                         | true                                       |
| Cancel202ativo sem wait                                                | CANCEL_REQUESTED,0                                                                    | false                                      |
| Cancel200terminal com estado validado                                  | aplicar linhas terminais, não o HTTPstatus isolado                                    | conforme estado                            |
| SteerACCEPTED ouDUPLICATE                                              | ACCEPTED,0; disposition preserva DUPLICATE; nenhum consumo presumido                  | false                                      |
| wait.settled=true comWAITING_APPROVAL/USER                             | linha de espera acima, não CANCELLED                                                  | false                                      |
| wait.settled=false outrue com estado ativo/shape incompatível          | relerExecutionView autorizado; no prazoPENDING11; shape inválido é erro de observação | false                                      |
| SIGINT/SIGTERM no reader                                               | INTERRUPTED,130/143, após limpar recursos próprios                                    | sótrue se já havia fato terminal conhecido |

Cancel--wait consulta wait com min(30000, prazo restante) e **sempre relê o registro autorizado**; wait é otimização, não terminalACK. Aguardarsósettled=true não fecha a operação. Se houver espera de approval/user, sair nos códigos definidos; não disparar decisão/retomada. Para registroK06 sem NativeTerminal, failure.kindUNKNOWN_EFFECT basta paraUNKNOWN; ausência dessa marca **não** fabrica accountingKNOWN. ExecutionView mantém settlement/accountingnull quando a fonte não os fornece. Terminal lógico não significa exatamente uma execução de efeito nem cancelamento físico do provider.

Cada requestHTTP leva credencial obtida da porta autenticada, sem log. Cancel leva `Idempotency-Key:<key8–120>` e body `{}` ou `{reason}`. Steer leva `{steerKey:key,text}` e também o header com o mesmo valor, sem atribuir dedup adicional ao header; a dedupK06 é pelo steerKey. Não enviar actorId/tenant ou nullreason. O host valida origem, conexão e autoridade conforme F1; nenhum flag de credencial/env arbitrário é adicionado. Cancelrequest idempotente não faz retry automático em caso de resposta perdida.

Mapeamentos conhecidos (a precedência de conhecimento acima continua valendo):

| Código/classe validado                                                                             | Local/exit                                                                   |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| NativeINVALID_INPUT ou HTTPvalidation_failed                                                       | INVALID_ARGUMENT,2                                                           |
| NativeNOT_FOUND; HTTPnot_found/steer_not_found; SessionPersistenceNotFoundError                    | NOT_FOUND,4                                                                  |
| NativeAUTHORITY_LOST ou HTTPunauthorized/forbidden autenticado                                     | DENIED,5                                                                     |
| NativeCONFLICT; HTTPconflict/steer_not_running; SessionAlreadyExists/AlreadyOwned/AppendConflict   | CONFLICT,8                                                                   |
| NativeCAPACITY; HTTPsteer_limit/wait_limit                                                         | CAPACITY,9                                                                   |
| NativeUNSUPPORTED_VARIANT; HTTPsteer_unsupported; SessionFormatUnsupported/MigrationRequired       | UNSUPPORTED_CAPABILITY,3                                                     |
| NativeSTORAGE_UNAVAILABLE ou SessionStorageUnavailableError durante leitura comprovada             | STORAGE_UNAVAILABLE,6                                                        |
| NativeCOMMIT_UNKNOWN, SessionCommitUnknownError, efeito incerto ou mutação sem conclusão conhecida | OUTCOME_UNKNOWN,7                                                            |
| NativeCURSOR_INVALID; HTTPinvalid_cursor; CLIsc1inválido                                           | CURSOR_INVALID,2                                                             |
| NativeCURSOR_UNAVAILABLE                                                                           | CURSOR_UNAVAILABLE,6                                                         |
| NativeCONTEXT_OVERFLOW/DELIVERY_LIMIT                                                              | código homônimo,1; false sem terminal real                                   |
| HTTPsteer_text_too_large/invalid_steer_key; SessionHeaderValidation                                | INVALID_ARGUMENT,2 se recusa pré-efeito comprovada                           |
| SessionReadOnly/OwnershipLost/HandleClosed/Corruption e outros erros não classificados             | INTERNAL_ERROR,14 se leitura ou não envio comprovado; senãoOUTCOME_UNKNOWN,7 |

O enum `nativeCode` só admite os12códigos da uniãoC ou null. Session classes e HTTPcodes não são inseridos nesse campo. SDKnumeric readonly:1001/1003/-32601→UNSUPPORTED_CAPABILITY3;1002→NOT_FOUND4;-32600/-32602→INVALID_ARGUMENT2;-32700/-32603/-32080/-32081/-32084/-32085→INTERNAL_ERROR14;-32082/-32083→TRANSPORT_UNAVAILABLE6. Código/shape não anunciado em leitura viraINTERNAL_ERROR14, sem texto externo. O bodyHTTP observado é ApiEnvelope{success,data,error,meta.correlationId} das fontes pinadas. Pares observados: unauthorized401/forbidden403/not_found404/conflict409/rate_limited429/payload_too_large413/unsupported_media_type415/request_uri_too_long414/configuration_error503/internal_error500; demais codes atuais retornam400. Código só entra na tradução específica se pertencer à lista deste anexo e o par corresponder ao perfil observado. Status401semconclusão de escrita confirma recusa de autenticação; falha500de uma escrita não confirma ausência de commit. O cancel200 observado traz data{execution,processing:terminal,cancelled:boolean}. O wire202 deS2/S3K06 ainda não está implementado na ref pinada e **permanece obrigatório aberto**: receber do owner o schema/pairs exatos e seu gate antes de fecharF5 ou anunciar compatibilidade202. Não inventar processingactive como se estivesse em fonte. Discrepância de perfil após mutação potencialmente enviada é OUTCOME_UNKNOWN; em leitura é erro de compatibilidade sem execuçãoTerminal. Ver wire-observation.json para proveniência. Nenhum adapter seleciona outroperfil automaticamente após erro. Nenhum erroK06negativo conta como funcionalidade positiva do comando.

## F. Streams v1, threads nativas e fork

List0295 pode trazer sessões v1 comuns. Não chamar todas elas de thread nativa. Inspect/attach v1 usam leitura autorizada canônica e fecham seu handle read; native usa readThread0239. Se a composição não puder determinar a classe sob a mesma autorização, UNSUPPORTED_CAPABILITY, não adotar por isSeeded ou adivinhar por NOT_FOUND de outro principal. Run com --session e resume--execution exigem snapshotNATIVE_V1 qualificado e a associação exata session/execution; V1_ONLY produz UNSUPPORTED_NATIVE_SNAPSHOT/exit3 **antes de enqueue**, sem metadata fabricada. Perfil/version/digest devem coincidir com o binding persistido; uma seleção de perfil incompatível não atualiza a sessão.

Fork deste contrato executa **o fork canônico v1**0287 e o declara no Result: formatcanonical-v1/nativeEligiblefalse. Ele pode herdar o prefixo concluído válido mesmo quando há sufixo aberto; não recusar todo source por existir sufixo. A fronteira --through-turn precisa ser conhecida/herdável. Erros fork_nothing_to_inherit/fork_cut_not_inheritable/fork_cut_unknown_turn/fork_target_is_source/fork_too_large/fork_depth_exceeded são CONFLICT8 conhecidos quando recusados antes de efeito; não devolver o texto da exceção. O header e o prefixo são montados pela implementação canônica, não pelo CLI.

O writer retornado por fork é sempre owned pela chamada: depois do commit conhecido, ler somente a projeção segura necessária e chamar close no original. Reportar writerClosedtrue só após close assentado; desconhecimento de commit ou de cleanup permanece separado. Close não é rollback e não autoriza repetirfork. Filho é inspecionável/reattachable como sessão v1; não passa a ser elegível para readThread/startTurn só porque herdou texto. A interoperabilidade **fork nativo com novo snapshot autorizado**, quando necessária ao objetivoKR05, é dependência canônica separada, ainda não implementada/aprovada por estaCLI. Ela permanece integral no saldo da incorporação: este limite não concede paridade de fork nativo nem fecha KR05.

Q04/Q05 precisam provar ambas as classes, recusa nativa semsnapshot e retomada de execução realmente nativa. Q06 precisa provar prefixo canônico com sufixo aberto, writerfechado, UNKNOWN preservado e ausência de adoção implícita. Os casos positivos de interoperabilidade nativa continuam NOT_RUN/pendentes do contrato correspondente, sem substituir esse requisito por uma recusa verde.
