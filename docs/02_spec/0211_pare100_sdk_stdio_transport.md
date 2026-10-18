# SPEC 0211 — SDK entre processos por stdio JSON-RPC

- Task existente: AUD0611-G01; prepara os transportes básicos de P100-025, sem declarar o SDK Python ou a superfície inteira entregues.
- Trilha T3 (contrato público, validação em fronteira de processo e lifecycle). Estado: READY_FOR_USER_REVIEW_R2; BUILD depende de revisão explícita do usuário conforme docs/07_agents/AGENTS.md. O pedido de execução integral está registrado; esta SPEC concreta ainda precisa da revisão exigida.
- Baseline: SPEC0204 entrega sdk v1, createSdk/createSdkMinimal/createSdkClient/createSdkServer e apenas transporte em processo. Nenhum socket, provider real, authenticação de rede ou dado real neste escopo.

## Resultado e decisões

Um integrador TypeScript abre um processo filho autorizado pelo host e usa o mesmo sdk.hello/session.open/turn.send/session.events pela conexão stdio. O filho compõe o kernel governado e retorna fatos da sessão. Não é um segundo loop, não é código do DeepSeek, e nenhuma policy/approval/tenant vem do payload do cliente.

Selecionado: transporte stream em biblioteca própria sobre Readable/Writable e um exemplo neutro de processo filho. Alternativas rejeitadas nesta fatia: HTTP antes de autenticação/SPEC própria, trocar nomes/versão do protocolo v1, hostar tenant enviado pelo cliente, instalar um subprocesso arbitrário pelo modelo, ou importar implementação DeepSeek. HTTP/ACP/Python continuam nas tasks originais.

## API pública aditiva proposta

Em packages/sdk/src/stdio.ts, exportar:

```ts
interface StdioTransportOptions {
  readonly input: import('node:stream').Readable
  readonly output: import('node:stream').Writable
  readonly maxFrameBytes?: number
  readonly maxPendingRequests?: number
  readonly requestTimeoutMs?: number
  readonly expectedTenantId: string
  readonly maxLifetimeRequests?: number
  readonly maxBufferedBytes?: number
}

interface StdioSdkTransport extends SdkTransport {
  close(): Promise<void>
}

function createStdioSdkTransport(
  options: StdioTransportOptions
): StdioSdkTransport

interface StdioServerOptions {
  readonly input: import('node:stream').Readable
  readonly output: import('node:stream').Writable
  readonly server: SdkServer
  readonly maxFrameBytes?: number
  readonly maxQueuedRequests?: number
  readonly maxLifetimeRequests?: number
  readonly maxBufferedBytes?: number
  readonly closeTimeoutMs?: number
  readonly onError?: (failure: {
    readonly kind: 'frame' | 'transport' | 'limit' | 'invalid_response'
    readonly code: number
  }) => void
}

interface StdioSdkServer {
  readonly closed: Promise<void>
  close(): Promise<void>
}

function serveStdioSdk(options: StdioServerOptions): StdioSdkServer
```

## Ownership, framing e limites

Streams são exclusivos desta conexão, adquiridos e fechados pelo host. O adapter não faz spawn, não lê .env/home e não destrói os streams; o host mantém seu próprio listener de erro durante toda a vida deles, inclusive depois do detach do adapter. Listeners/timers do adapter saem ao fechar. O exemplo neutro é owner do child e de seus streams, espera no máximo1000ms de drain, envia SIGTERM, espera500ms e então SIGKILL com espera250ms; verifica exit/handles. Não matar processo que não pertence ao exemplo.

1. UTF-8 estrito, JSON-RPC2.0, um objeto por linha; fragmentação/coalescência e CRLF suportados. Não há batch/notification nesta fatia. Objeto, versão, método e params são validados antes do dispatch. Payload malformado e EOF parcial encerram a conexão sem dispatch; nada de recuperação heurística na cauda.
2. Frame inclui LF e todos os bytes UTF-8: default1MiB, opção128..4MiB. A cauda de um frame que excede o limite não é acumulada nem executada. Respostas também são serializadas/medidas integralmente ANTES da primeira escrita; não truncar eventos/strings. Resultado válido grande demais vira erro RPC limitado de código-32081 e mensagem fixa response_too_large; dispatch já aconteceu, portanto resultado é UNKNOWN para o cliente. Se nem este envelope couber, fechar sem escrita parcial deliberada.
3. IDs string não vazia1..200 ou número safe integer; identidade inclui tipo+valor. ID repetido durante QUALQUER momento da conexão é rejeitado sem segundo dispatch, inclusive depois de sucesso. Conjunto de IDs é limitado por maxLifetimeRequests(default4096, intervalo1..65536); atingir o limite recusa novas requests antes de escrita, sem replay/reconnect automático e preservando requests aceitas. IDs/resultados desconhecidos de resposta encerram a conexão. A conexão nova possui conjunto próprio, sem repetir efeito automaticamente.
4. maxPendingRequests/maxQueuedRequests default64, intervalo1..1024. maxBufferedBytes(default4MiB, intervalo maxFrameBytes..16MiB) limita SOMA dos bytes de frames completos pendentes/filas, excluindo a própria referência a streams do host; além disso há no máximo uma cauda<=maxFrameBytes e uma resposta ativa<=maxFrameBytes. Counts e bytes são debitados ao aceitar, devolvidos no settlement/discard; falta de espaço recusa antes do dispatch e fecha peer quando fila inbound ultrapassa bound. Declarações JSON e set de IDs têm limites próprios. Não manter clones de payload serializado em filas paralelas.
5. Servidor aceita fila limitada, executa UM dispatch por vez e só inicia o próximo após callback da escrita e drain quando write=false. Writable travado não inicia dispatch adicional; read não pode aumentar fila além dos limites. write throw/error/EOF encerra conexão e descarta fila ainda não despachada. Completion de dispatch após fechamento é observada com catch e descartada, sem escrever nem iniciar próximo.
6. Timer começa na aceitação de request, inclui espera na fila e escrita: default30s, intervalo1..300000ms. Timeout é TERMINAL da conexão: rejeitar todos os waiters uma vez, descartar frames ainda não escritos e remover timers/listeners. Resposta tardia não pode resolver outro waiter. QUEUED→WRITTEN ocorre imediatamente ANTES da primeira tentativa de output.write, inclusive se write lançar; conservadoramente a tentativa pode ter entregado bytes. Sem retry automático.
7. close é idempotente. Client close rejeita waiters segundo seus estados, descarta queue, desliga listeners/timers e resolve depois de cleanup. Server close impede novo dispatch imediatamente, descarta queue e aguarda active dispatch/write no máximo closeTimeoutMs(default1000,1..5000); depois desliga listeners e resolve mesmo que o dispatch externo ainda exista. Não há cancel implícito de execução/kernel. closed resolve uma vez ao concluir cleanup em fechamento normal OU falha; falha de I/O é reportada por erro limitado aos waiters e pelo callback onError do host quando configurado, com kind/code locais fixos e sem payload. Exceção síncrona no callback é isolada e não reabre a conexão nem impede cleanup. Não afirmar que closed prova fim de efeitos. Exemplo child aplica seu prazo/kill próprio.
8. stdout contém exclusivamente frames; logs no stderr. Não registrar payloads ou credenciais. Textos locais de erros são fixos/limitados; erro remoto exige code safe integer, message1..1024bytes e data dentro do frame. Nunca ecoar payload hostil em erros locais.

## Validação e resultado incerto

Validators internos reutilizáveis validam request/envelope/resultado. Stdio transport faz TODA validação correlacionada ANTES de remover o pending e retornar response: qualquer resultado inválido encerra a conexão e rejeita também os outros pending. createSdkClient reutiliza os validators para in-process sem exigir close na interface SdkTransport; no stdio o check adicional é redundante e não é o owner do fechamento. Somente quatro SDK_METHODS registrados podem ser despachados: usar Map ou Object.hasOwn, nunca lookup de propriedade herdada; toString/constructor/**proto** retornam method_not_found sem handler/body.

Predicados dos resultados, sem casts cegos:

- hello: protocolVersion exatamente1; capabilities.sessions/events boolean; methods array sem duplicatas e somente SDK_METHODS; sdk.hello/turn.send obrigatórios; session.open/session.events presentes se e somente se sessions/events true e events implica sessions. Não aceitar versão incompatível.
- session.open: sessionId exatamente o ID pedido; formatVersion exatamente1.
- turn.send: stopReason deve pertencer ao array STOP_REASONS público existente do CVG; response string; modelCalls/toolCalls e inputTokens/outputTokens são safe integers>=0; costUsd finite>=0. sessionId exatamente o ID pedido quando enviado e ausente quando não enviado. Não mudar o protocolo string já publicado; impor seu vocabulário no validator.
- session.events: objeto com events array<=limit solicitado(default100); cada item passa validateSessionEvent existente, formatVersion1/fingerprint válido; sessionId igual ao pedido, tenantId igual a expectedTenantId do host no transporte (ID válido1..200, nunca adquirido do peer). sequence safe integer >afterSequence(default0) e estritamente crescente, sem exigir contiguidade se read filtra; eventId não repetido na página. Nenhuma normalização de identidade/ordem/payload.

Exportar aditivamente SdkWireError extends SdkClientError com kind(frame|timeout|transport|closed|limit|invalid_response|remote_error), requestId:string|number, method:string, outcome:'not_dispatched'|'unknown', retrySafe:boolean. code/data originais de erro remoto conservados. Erro local possui códigos em SDK_TRANSPORT_ERROR_CODES próprios(-32080 framing,-32081 response_too_large,-32082 timeout,-32083 transport,-32084 limit,-32085 invalid_response), sem remover códigos v1. outcome not_dispatched/retrySafe=true SOMENTE se nenhum byte foi tentado escrever para ESTA request; UNKNOWN/retrySafe=false se WRITTEN, erro remoto (inclusive invalid_params/internal_error), resultado inválido ou overflow de resposta. Nunca afirmar que erro RPC prova ausência de efeito: turn.send pode executar e falhar no append assistant. Quando falha coletiva fechar conexão, classificar cada waiter pelo seu estado próprio. Consumidor deve consultar sessão/journal/handoff para resultado incerto; sem reenvio automático.

## Autoridade e estado

Tenant e portas policy/approvals/audit/tools/sessions continuam construídos pelo host em SdkServerOptions. Stdio peer não altera tenant, actor, policy, budget ou descriptors. O servidor real existente valida params e compõe createOperationalHarness. Quaisquer tools sensíveis conservam seu approval/handoff e journal; o exemplo serve somente modelo/tool determinístico neutro e não ativa efeito externo.

Estados do client: OPEN → CLOSING → CLOSED; falha vai CLOSED. Request: QUEUED → WRITTEN → RESOLVED ou FAILED/UNKNOWN_OUTCOME; fechamento impede transição de volta a OPEN. Pending IDs não sobrevivem reconnect; nenhum replay automático de turns. Fechar transporte não equivale a cancelar efeito já iniciado: sessão/journal/controle do kernel são autoridade do resultado. Cancel/resume/approval wire adicionais pertencem à expansão P100-025 e não são inventados aqui.

## Implementação e integração

- packages/sdk/src/stdio.ts e validators internos do cliente; exports aditivos em index.ts. Não remover createInProcessTransport ou mudar SDK_PROTOCOL_VERSION1/métodos existentes.
- Tests novos stdio sob packages/sdk/src/**tests**, incluindo processo filho real usando exemplo sob examples/consumers/sdk-stdio. Fonte/compile closure por builder público já existente, sem import privado do consumidor.
- Atualizar PUBLIC_API e pin tests/public-surface, manifesto do SDK só se necessário a dep interna já existente; lockfile só sob claim explícito. O adapter usa Node stdlib, sem lib nova de rede/instalação.
- Guardas e exemplos unitários continuam sintéticos, com home/portas/processos próprios. Não iniciar provider real, automatizar clínica ou publicar pacote.

## Critérios de aceite rejeitáveis

| ID      | Target/prova                                                                                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SDK-W01 | Cliente em processo pai executa hello/open/send/read em child real; stop/result/eventos/counters correspondem ao kernel e SessionEventStore reais                                                                                                    |
| SDK-W02 | Frames fragmentados UTF-8/CRLF e múltiplos frames preservam bytes/ordem; inválido/oversized/EOF parcial nunca executa body                                                                                                                           |
| SDK-W03 | ID duplicado pendente/resolvido, inherited methods, response inesperada/corrompida, versão/shape/session/tenant/sequence inválidas e limites de pending/queue/lifetime/bytes falham fechado antes do settlement                                      |
| SDK-W04 | Timeout terminal com resposta tardia e outro pending, queued timeout descartado; EOF/error/close/write travado não deixam timers/listeners/pending ou child; prazo de active dispatch e completion tardia testados, zero replay e outcome por estado |
| SDK-W05 | Backpressure/write failure e resultado válido maior que frame mantêm bounds; segundo dispatch só após write/drain; overflow sem truncar/duplicar; execução seguida de falha no append assistant produz UNKNOWN/retrySafe=false                       |
| SDK-W06 | Tenant de payload não muda tenant composto; tool negada/approval ausente executa zero corpo pelo caminho real                                                                                                                                        |
| SDK-W07 | in-process v1 e imports públicos existentes preservados; types/lint/unit/PG/E2E/build/check-boundary verdes, snapshot/replay do wire novo                                                                                                            |

Fixtures conhecidas-boas e adversariais são inputs distintos; alterar result/evento/id deve rejeitar, sem normalizar a diferença. Self-review não é crítica independente. Reviewer fresh I1 valida o desenho; usuário revisa esta SPEC antes de BUILD T3; a candidata implementada passa por critic diferente e gates reais.

## Recuperação e limites

Reverter somente arquivos próprios desta adição se ela falhar, sem tocar sessões/migrations/contracts v1 e sem limpar trabalho de outro agente. No erro após envio, não repetir chamada real: consultar autoridade de sessão/journal e fazer handoff conforme o perfil. Não prometer compatibilidade com o protocolo DeepSeek inteiro, SDK Python, HTTP autenticado ou release por fechar G01.

## Revisão R2

Responde aos seis gaps da crítica independente: owner de validação, timeout/ID lifetime, shutdown/streams/child, resposta oversized/bytes, erro público e resultado incerto, dispatch seguro contra prototypes. Esta revisão continua documental; nenhum BUILD T3 aprovado ou implementado. Exige nova crítica e revisão explícita desta versão pelo usuário.

Revisão de prontidão documental: os seis gaps I1 R1 foram tratados nesta versão e onError possui assinatura explícita. A reavaliação I1 R2 falhou por capacidade do modelo e não produziu parecer; isso não equivale a ACCEPT. O BUILD aprovado continua sujeito a I1 de código, gates e rejeição de falhas; nenhuma produção real integra esta fatia.
