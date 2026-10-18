# SPEC0224 — resultado completo no contexto de decisão

## 1. Estado, requisito e autoridade

Task `P100-004/P100-014/P100-020/P100-021/TOOL-RESULT-SPEC-001`.
16/10/2026. Estado inicial `DRAFT_FOR_TECHNICAL_REVIEW`; elaboração documental
T1 de uma mudança futura **T3**, sem BUILD autorizado. Esta SPEC atende ao gap
`OBS-I1-001` dentro dos 36 cartões do PARE100. Não redefine os critérios dos
cartões nem declara sua conclusão.

O [reconhecimento](../04_audit/evidence/PARE100-EXEC-20261014/context-result-recon-r1/report.md)
e suas 14 fontes autenticadas são o estado CURRENT. O
[aceite diferencial anterior](../04_audit/evidence/PARE100-EXEC-20261014/differential-tool-r3/lead-acceptance.json)
preserva três fixtures aceitas e um caso adicional vermelho de texto4096bytes.
Aqui se especifica PROPOSED, não comportamento já implementado ou medido.

A [constituição D-12](../07_agents/AGENTS.md#governança-proporcional-d-12-26092026)
exige revisão explícita desta SPEC pelo usuário antes do BUILD porque mudam
contratos públicos e a representação do checkpoint. A aprovação0217 não
autoriza esta extensão. As decisões0220/0221/0222 continuam independentes,
pendentes e não serão reenviadas por esta task. Esta SPEC não concede release,
acesso a provider real, produção, dados reais ou efeito externo real.

Os requisitos originais continuam na
[carteira0378](../03_build/0378_backlog_paridade_integral.md): P100-004 exige
comparador que rejeite resultado indevido; P100-014 exige contratos de
modelos/usage/errors; P100-020 exige ordem/vínculos e retomada; P100-021 exige
pressão/usage reconstruíveis e overflow sem provider. Suas dependências
originais não são declaradas concluídas por esta SPEC.

## 2. Invariantes e fatia vertical

1. Todo resultado necessário à próxima decisão chega completo ao modelo ou
   a decisão é recusada antes da chamada. Summary nunca substitui o original.
2. Conteúdo de ferramenta permanece UNTRUSTED; identidade, provenance,
   policy, approval, sandbox e settlement vêm das portas nativas, nunca do
   texto ou de campos homônimos devolvidos pela ferramenta.
3. A admissão mede o pedido efetivamente enviado, inclusive instruções,
   catálogo, usuário, resultados e reparos. Tokens, bytes e custo são medidas
   distintas. Uma estimativa de caracteres não é prova de janela do provider.
4. Overflow de contexto não transforma efeito confirmado em falha de corpo,
   nem permite repetir ferramenta ou fabricar confirmação de sucesso.
5. Resultado completo, completude, orçamento e estado de entrega sobrevivem
   à retomada quando sua gravação foi confirmada. Estado antigo truncado não
   pode ser promovido a completo por um digest válido.

A primeira fatia atravessa a fábrica pública `createOperationalHarness`, o
despacho real de ferramenta, o ContextEngine, HybridOrchestrator, a porta
de modelo sintética e o store real de checkpoint. Entrada explícita:
`OperationalHarnessOptions.toolResultContext = { version: 1 }`, também
disponível nas opções da classe iterative. Ausência mantém o protocolo
anterior durante a transição. `single_pass` não aceita essa opção: erro de
configuração antes de executar, em vez de ignorá-la.

O modo novo é denominado `complete-tool-v1`. A ativação é vinculada ao
checkpoint e não pode mudar no meio de uma execução. Sua prova isolada não
fecha os cartões: adoção pelo caminho padrão, SDKs, hosts e demais perfis
continua obrigação do programa integral. A mudança do default não faz parte
deste BUILD inicial e exigirá sua própria verificação de consumidores.

## 3. Donos, contratos e limites

O harness é dono da observação, retenção, checkpoint e orçamento. O
ContextEngine é dono da seleção. O orquestrador é dono da serialização do
pedido e da interpretação da proposta do modelo. O adaptador de modelo
qualificado é dono da contagem de entrada e do limite de saída. Policy,
approval, journal e sandbox conservam sua autoridade nativa.

As adições ficam nos contratos existentes, sem serviço, tabela, fila, store
de blob ou endpoint novo. Alterações previstas: contratos execution-v2/model,
fábrica e iterative-runtime/dispatch, context-engine, hybrid-orchestrator,
completion, step-store e adaptador PostgreSQL de checkpoint. Também testes
dessas fronteiras. Queries DML/SELECT e codecs desse adaptador podem mudar
conforme esta SPEC; DDL/migration não são previstos. Necessidade de schema
de banco novo exige revisão antes de executá-la.

Limites fixos do protocolo inicial, sem aumento silencioso por caller:

| Recurso                        | Limite e unidade                                                                                                                     | Consequência                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Output completo                | 32768 bytes UTF-8 da representação JSON canônica                                                                                     | Acima: UNAVAILABLE/RESULT_TOO_LARGE; sem corte de valor.                               |
| Estrutura JSON                 | Profundidade32 e10000nós, raiz contada como profundidade1; cada valor (objeto, array ou escalar) é um nó, chaves não contam como nós | Acima: UNAVAILABLE/RESULT_COMPLEXITY.                                                  |
| Metadados de identidade        | Cada campo textual até512unidades UTF-16; envelope de observação até4096bytes além do output                                         | Metadado nativo inválido: parar, sem confiar no payload para substituí-lo.             |
| Observações no checkpoint      | Máximo50, preservando todas as TOOL_RESULT da execução                                                                               | Sem espaço: recusar nova ferramenta antes de invocar seu corpo.                        |
| Checkpoint unsigned canônico   | 8388608bytes UTF-8                                                                                                                   | Preflight antes de ferramenta e de gravação; exceder interrompe, nunca grava truncado. |
| Mensagem system de decisão     | 16000unidades UTF-16                                                                                                                 | Não cabe: CONTEXT_OVERFLOW, zero chamadas.                                             |
| Mensagem user de decisão       | 32000unidades UTF-16                                                                                                                 | Mesmo tratamento; não fragmentar nem cortar JSON.                                      |
| Pedido de decisão serializado  | 131072bytes UTF-8, incluindo context/budget/purpose/IDs                                                                              | Mesmo tratamento; signal é controle local não serializável.                            |
| Reserva de saída por tentativa | 512tokens e limite expresso no ModelRequest                                                                                          | Recusar se não houver capacidade para a reserva completa.                              |

São limites PROPOSED de contenção desta fatia, não capacidade medida do
PostgreSQL ou do provider.32768bytes acomodam a serialização de uma string
de4096bytes UTF-8 inclusive escapes JSON de caracteres de controle. Isso
não garante admissão de qualquer combinação de usuário/catálogo/histórico:
o pedido completo ainda precisa caber. Bytes maiores, outros formatos e
offload permanecem fora desta prova; não se declara paridade desse domínio.

### 3.1 Valor JSON e observação versionada

Domínio completo: null, boolean, string sem surrogate isolado, número finito
diferente de -0, array denso de valores admissíveis ou objeto simples com
propriedades próprias de dados e valores admissíveis. Rejeitar undefined
inclusive em campos, BigInt, NaN/Infinity, ciclos, holes, accessor, symbol,
propriedades extras de array, instâncias com protótipo próprio e toJSON.
Não executar getters/toJSON para tentar obter um valor. Alias acíclico pode
ser serializado como valor repetido. Não se oferece isolamento contra Proxy
ou código JS hostil no mesmo processo; ferramentas instaladas são código
confiável e seus resultados são dados sem autoridade.

Canonicalização recursiva: chaves próprias de objeto em ordem lexicográfica,
array na ordem original, strings/chaves com escaping JSON determinístico,
números pela representação JSON do número JS admissível. Sem normalização
Unicode, trim, coercion ou alteração de tipo. Usar o mesmo algoritmo em
snapshot, digest, persistência e pedido. Verificação é por valor e também
pelos bytes canônicos. Não usar a ordem de inserção de objeto como contrato.

`Observation.payload` de TOOL_RESULT no modo novo passa a ter união explícita
`schemaVersion:1`, preservando `status`, `sideEffect`, `completion` e
`resultAvailability` separadamente. Ramos:

- `completion: COMPLETE`: `output` JSON admissível obrigatório,
  `outputBytes` e `outputSha256` calculados do valor completo. Somente quando
  o pipeline nativo retornou SUCCEEDED e a captura integral foi válida.
- `completion: UNAVAILABLE`: sem campo output, com motivo estável
  INVALID_JSON/RESULT_TOO_LARGE/RESULT_COMPLEXITY. `status` continua sendo o
  resultado do pipeline; não inventar FAILED quando ele confirmou SUCCEEDED.
  Sem digest do conteúdo que não foi integralmente validado. Tamanho pode
  ser um lower bound explicitamente rotulado, nunca um total inventado.
- Resultado nativo FAILED/REJECTED: envelope de diagnóstico versionado,
  `completion: NOT_APPLICABLE`, `resultAvailability: UNAVAILABLE`, sem output
  completo e com erro redigido; nunca elegível como evidência de
  efeito confirmado. O journal mantém sua classificação original.

`resultAvailability` indica AVAILABLE ou UNAVAILABLE; a condição de entrega
ao modelo fica no estado do contexto, não no texto do resultado. Nenhum
campo do output pode sobrescrever o envelope. `summary` continua prévia
limitada300unidades e não participa da prova de completude. Não aplicar
`boundedPayload` ao output ou envelope versionado. Conhecimento e outras
observações permanecem sob seus contratos atuais e não são promovidos a
fonte institucional aprovada por esta mudança.

SUCCEEDED sem campo output é INVALID_JSON, não sucesso completo. No modo1,
passar explicitamente a opção antiga maxObservationPayloadChars é erro de
configuração: não permitir que ela volte a truncar o envelope por acidente.

### 3.2 Checkpoint, retenção e efeito

V1 mantém o digest existente. Em V2, normalizar campos opcionais internos
ausentes pelo schema do checkpoint, sem alterar o output JSON estrito, e
calcular SHA-256 de `cvg.checkpoint.v2` seguido de newline e dos bytes
canônicos do unsigned. CheckpointId/createdAt ficam fora desse unsigned,
como no contrato anterior; tenant, execução, modo, estado e orçamento ficam
dentro. Ausência não declarada pelo schema é erro. O mesmo codec serve aos
stores e ao validador. Integridade não permite inventar dados de V1.

Checkpoint do novo modo usa `checkpointVersion:2` e carrega no estado
`toolResultContext:{version:1,deliveredThroughStep,pendingDecisionAdmission,decisionAdmissions}`.
decisionAdmissions retém os receipts nativos de todas as tentativas desta
execução: admissionId, tenant/execution/step/attempt/purpose, requestSha256,
contador/versão, limites reservados, status RESERVED/SETTLED/UNKNOWN e uso
real se SETTLED. pendingDecisionAdmission é nulo ou o ID do único RESERVED.
Receipts não são apagados pelo cursor; seu tamanho entra no limite8MiB e
uma nova tentativa é recusada se não houver espaço para seu receipt.
Repetição de settle de um receipt SETTLED com o mesmo digest/uso é no-op
idempotente; dados diferentes, receipt UNKNOWN ou binding diferente são
conflito. Não exigir que um receipt já SETTLED volte a ser o pendente.
`deliveredThroughStep` começa0, é monotônico e avança somente depois de uma
decisão de modelo válida admitida e aceita pelo runtime, até o maior passo
de TOOL_RESULT que o pedido continha. Reparos e decisões inválidas não
avançam; decisões só por regra não afirmam entrega ao modelo.

Todos os TOOL_RESULT da execução, inclusive já entregues, são obrigatórios
e retidos até o estado terminal, ordenados por stepNumber/observationId.
O cursor é somente recibo de entrega; não prova que um resultado deixou de
ser necessário para um modelo sem memória. Não expulsar nenhum TOOL_RESULT
pelo slice50, trimming ou avanço do cursor. Nesta primeira fatia não há
liberação semântica/compactação de resultados. Observações opcionais de
outros tipos podem sair inteiras; nunca remover o original de ferramenta.
Se não houver slot, parar antes da próxima ferramenta. O cursor e a decisão
aceita são gravados no mesmo checkpoint antes do próximo despacho. Se essa
gravação falhar, nenhum novo corpo é invocado.

Antes de invocar ferramenta, o runtime verifica um checkpoint prospectivo
com o estado atual, os campos nativos que serão adicionados e espaço para
um envelope de até36864bytes. Também reserva64KiB de folga para alterações
de estado do passo; não pode confiar apenas em `sizeAtual + outputBytes`.
Se não conseguir limitar os campos que mudarão, recusar a invocação. Após o
retorno, medir o checkpoint real antes de gravar. O limite do wrapper não
substitui a verificação final, nem a disponibilidade do banco.

Após resultado SUCCEEDED, o journal/settlement continua autoridade do efeito.
O checkpoint completo é gravado antes da próxima decisão de modelo. Se
output for indisponível, não cabe no contexto ou o save falhar depois do
efeito, interromper. Conservar operationKey, status nativo, provenance e
settlement, sem emitir ACTION_CONFIRMED com base em uma prévia. Falha da
serialização no próprio journal continua falha nativa/efeito incerto;
esta SPEC não pode convertê-la em confirmação.

Se o checkpoint não foi confirmado, a retomada usa a fronteira durável0217
e seu journal para resolver o efeito antes de qualquer novo despacho.
Resultado confirmado recuperado do journal precisa passar pela mesma
validação; não chamar o corpo novamente para reconstruir texto perdido.
Sem prova de settlement ou sem dado recuperável: handoff/estado incerto,
não replay. Nenhuma nova semântica de exatamente-uma-vez é concedida aqui.

### 3.3 Codec físico V2 para o state JSONB

O domínio lógico inclui U+0000 em valores e chaves. PostgreSQL JSONB não
aceita esse caractere decodificado, mesmo quando escrito como escape JSON;
a restrição está na [documentação oficial17, seção8.14](https://www.postgresql.org/docs/17/datatype-json.html).
Essa leitura é evidência documental, não teste do banco instalado.

O adaptador não grava state lógico diretamente em JSONB no modo2. Grava um
wrapper de chaves fixas ASCII: storageCodec=`cvg.checkpoint-state/2`,
encoding=`base64`, decodedBytes, decodedSha256 e data. data contém base64
canônico RFC4648 com padding dos bytes UTF-8 canônicos do state lógico.
O hash decodedSha256 é desses bytes; o digest geral do checkpoint continua
sendo do unsigned lógico com separação de domínio3.2. BudgetUsage tem schema
fechado de números/metadados nativos sem conteúdo arbitrário e permanece
na coluna existente. IDs/versões externos ao state recusam U+0000.

Limite lógico de8MiB inclui o unsigned inteiro, não só state. Para leitura,
limitar data a `4 * ceil(8388608 / 3)` caracteres ASCII e o wrapper físico a
esse total +512bytes. A query deve recusar linhas acima desse teto antes de
entregar JSON ao parser do driver; depois validar chaves/tipos/comprimentos,
padding e reencode base64 exato. Decodificar UTF-8 estrito, exigir bytecount
e hash, validar JSON limitado (profundidade total64 e1000000nós) e schema
V2, exigir reserialização canônica byte a byte igual e conferir digest do
checkpoint. Duplicatas de chave, lixo final, base64 permissivo ou Unicode
malformado são erro, não reparo silencioso. Limites se aplicam antes da
alocação/parse correspondente e novamente ao unsigned reconstruído.

Memória e PostgreSQL exercitam o mesmo encode/decode lógico V2; load devolve
ExecutionCheckpoint lógico, nunca o wrapper ao runtime/modelo. O protocolo
wire do modelo continua JSON lógico e não base64. Não há migração de coluna,
SQL dinâmico, compressão, blob externo ou endpoint de decode. Base64 não é
criptografia nem controle de acesso. V1 permanece no formato existente;
V2 sem wrapper ou com storageCodec desconhecido é recusado, sem autodetect
por chaves arbitrárias dentro de output. Não alterar a autoridade/formato
dos journals por supor que uma classe de digest-only seja store de output.
Falha nativa de journal anterior ao checkpoint mantém efeito incerto; o
codec não pode forjar uma confirmação ou reconstruir dado não recuperável.

## 4. Seleção única e pedido real

ContextBuildInput/StepContext recebem um campo opcional versionado
`toolResultContext`. No modo novo sua ausência ou inconsistência é erro;
não existe fallback silencioso para summary. O runtime valida a saída de
ContextEngine customizado, inclusive IDs/cursor, integridade do envelope e
conjunto obrigatório. HybridOrchestrator anuncia suporte ao protocolo1;
modo novo com orquestrador sem suporte é erro de composição antes de run.
Esse anúncio é contrato de código confiável, não isolamento de plugin hostil.

ContextEngine seleciona primeiro instruções/governança, objetivo/usuário e
todos os TOOL_RESULT da execução. Dados de usuário e ferramentas
são UNTRUSTED. Conhecimento/histórico opcionais são considerados em ordem
de prioridade já existente e só entram inteiros. A seleção retorna os IDs
e o valor completo de cada resultado; não usa summarizeObservation para
reconstruir payload nem lê uma segunda lista paralela para renderizar.

Formato wire interno: exatamente duas mensagens, ambas ModelMessage atual:

1. system: instruções de governança do host, instruções de agente confiáveis,
   esquema de decisão, tipos/reasons permitidos e catálogo registrado.
2. user: JSON versionado `cvg.decision-context/1` contendo objetivo do usuário,
   userMessage, estado descritivo, itens selecionados e dados de reparo.
   Cada item inclui contextId, prioridade, trust, source, observationId,
   provenance e o payload completo quando aplicável. Dados arbitrários não
   são interpolados no texto de system. Diagnóstico de erro do modelo é
   dado de reparo UNTRUSTED, não instrução do host.

O modelo pode propor, mas nenhum texto concede policy/approval/execução.
JSON framing evita ambiguidade sintática, sem promessa de resistência
semântica de LLM a prompt injection. Ambas as roles existem nos dois
contratos atuais; não se introduz role tool nem tool_call_id nesta fatia.
O gateway governado é rota distinta: testar diretamente ModelInputSchema
com as duas mensagens prova só compatibilidade do input. Não prova que
ModelRequest inteiro satisfaz ModelGatewayRequestSchema nem cria adaptação
de orçamento/maxOutputTokens entre essas rotas.

O orquestrador constrói um snapshot imutável do ModelRequest final, incluindo
messages, context, budget, correlationId, purpose e o novo campo opcional
`maxOutputTokens:512`. Faz validação de tamanho e contagem sobre esse mesmo
snapshot, calcula requestSha256 e envia os mesmos valores. O signal é
propagado separadamente. Mutação após admissão invalida a chamada.

## 5. Admissão e orçamento, inclusive reparos

### 5.1 Contagem qualificada

HybridOrchestrator recebe uma porta confiável `DecisionInputCounter` pareada
com o decisionModel. Ela recebe o snapshot final e devolve counterId/version,
identidade do modelo/formatação, inputUpperBoundTokens, contextWindowTokens
e costUpperBoundUsd incluindo a reserva de saída. O adaptador deve garantir
limite superior para todo input realmente enviado, inclusive wrappers do
provider. ModelRequest.maxOutputTokens precisa ser respeitado pelo par.

Sem esse par qualificado, sem janela conhecida, contagem inválida ou sem
limite de saída: ADMISSION_UNAVAILABLE, zero chamadas. Não usar o estimador
legado `ceil(text.length/4)` como substituto. Nesta fatia só se qualificam
pares sintéticos locais de contador/modelo; não se habilita provider real.
A contagem sintética é a regra declarada pelo modelo sintético, não medição
de tokenizer de modelo comercial ou local instalado.

Tentar remover apenas itens opcionais inteiros e reconstruir/medir de novo.
Nunca remover governança, usuário ou resultado obrigatório. A admissão exige:

- limites de bytes/unidades da seção3 e todas as fronteiras de schema;
- inputUpperBoundTokens <= tokenBudget do contexto (default4000 no modo1);
- inputUpperBoundTokens +512 <= janela declarada do par;
- a mesma soma <= saldo de maxTokens da execução;
- costUpperBoundUsd <= saldo de maxCostUsd, prazo ainda válido e saldo
  para uma chamada e, se necessário, um reparo de decisão.

Sem espaço após remover opcionais: CONTEXT_OVERFLOW ou motivo de orçamento
específico, sem chamada ao modelo. Contagem pura não consome slot de modelo.
Counter que não respeita deadline, lança ou devolve NaN/números negativos
faz a admissão falhar. Não há retry de counter nesta fatia.

### 5.2 Reserva persistida antes de cada tentativa

IterativeOrchestratorInput recebe, somente no modo1, a porta do runtime
`decisionAdmission` com reserve/settle. Há no máximo uma reserva pendente
por execução; exclusão atômica está definida em5.3. Fence da0217 é revalidado
quando a composição é publicada/bound; não é presumido em store unbound. A reserva
vincula tenant, execution, passo, attempt, purpose, requestSha256, contador,
limites e ID opaco nativo; IDs enviados pelo output não têm efeito.

`reserve` revalida saldos/deadline/cancelamento, cobra um modelCall e os
limites superiores de tokens/custo, registra repair quando purpose=REPAIR e
persiste checkpoint antes de retornar receipt. Falha desse save impede
complete. O orquestrador só chama o modelo com receipt do snapshot atual.

`settle` aceita apenas a reserva corrente, o digest correto e uso nativo
finito/não negativo dentro dos limites. Substitui a cobrança reservada pelo
uso real e persiste sua quitação. Repetição idêntica é idempotente; receipt
de outra execução/passo, resultado conflitante ou tentativa de quitar uma
reserva diferente são STATE_CONFLICT. Não baixar saldo de outra chamada.

Falha, timeout, cancelamento, perda de processo/lease ou resultado sem uso
validável conservam a cobrança superior. A reserva passa a UNKNOWN e a
execução interrompe; não repetir a chamada automaticamente nem liberar
saldo por falta de resposta. Na retomada, reserva pendente vira UNKNOWN
antes de qualquer despacho; resolução operacional futura não é autorização
para prosseguir nesta fatia. Resultado tardio após encerramento não muda
checkpoint, saldo ou decisão. Se settlement falhar no store, conservar a
reserva anterior como cobrança e interromper.

Uso acima do limite é ADMISSION_BREACH: não entregar resposta nem despachar
efeito, marcar par contador/modelo não qualificado e conservar diagnóstico
do uso observado. Não afirmar que a cobrança real ficou limitada quando o
adaptador violou o contrato. O caso é critério vermelho, não ajuste para PASS.

No modo1 a contabilidade de decisão pertence exclusivamente à porta do
runtime. O retorno novo contém decision e decisionAdmissionIds, a lista sem
repetições de todas as tentativas quitadas deste passo. usage legado deve
estar ausente; o runtime confere a lista com o ledger nativo desse passo e
não reaplica ModelUsage agregado. O runtime rejeita retorno com uso duplicado,
reserva UNKNOWN ou digest divergente. Chamadas de resposta do pipeline
mantêm sua contabilidade nativa; seu orçamento compartilha o saldo já
debitado. Não criar segundo gate no pipeline nem omitir seu uso.

Cada reparo produz snapshot/contagem/reserva próprios e repete a admissão
com os novos erros, prazo e saldos. A observação completa permanece obrigatória em todos os pedidos
posteriores até o término da execução, mesmo depois do avanço do cursor. Decisão inválida após
último reparo interrompe pelo erro nativo, com todas as chamadas cobradas.

### 5.3 Exclusão entre escritores e CAS do checkpoint

`ExecutionStepStore.saveCheckpoint` atual não prova exclusão de reservas.
O modo1 exige a extensão `compareAndSwapCheckpoint` com entrada lógica
`{tenantId,executionId,expected:{checkpointId,digest}|null,next}` e saída
APPLIED com token novo ou CONFLICT. Sem essa extensão a composição recusa
modo1 antes de qualquer corpo/modelo; não emular CAS com load seguido de
save. Toda escrita de checkpoint2, inclusive inicial, pre-dispatch, reserva,
settlement, cursor e terminal, usa a extensão. saveCheckpoint simples deve
recusar escrita2 e, no reader novo, impedir escrita1 sobre execução2.

CAS inicial é INSERT condicional se a linha não existir. Demais CAS são
UPDATE condicional de tenant/execution/checkpointId/digest esperados em uma
transação. next tem checkpointId novo a cada escrita, bindings válidos e o
mesmo modo; alteração zero linhas é conflito e não autoriza chamada. Isso
impede ABA de digest sem mudar schema. Store memória implementa a mesma
operação indivisível em seu estado compartilhado, sem await entre comparação
e troca. Stores que não conseguem cumprir o contrato não suportam modo1.

No adaptador PG, conferir autoridade nativa e fence quando bound, manter a
ordem de locks existente, checar saldos/reserva vigente e fazer CAS no mesmo
client/transaction. Não abrir transação aninhada/pool separado. Receipt só
sai após COMMIT. Não manter transação ou row lock durante chamada ao modelo.
Se dois processos disputarem a mesma reserva, apenas o CAS vencedor recebe
receipt; o perdedor retorna STATE_CONFLICT sem chamar modelo/corpo. Ao
carregar reserva alheia pendente, tratar como UNKNOWN conservador e parar;
não quitá-la, cancelá-la nem tentar outra chamada.

No caminho unbound, CAS serializa estado/orçamento, mas não cria lease de
worker/ACK externo. Esta fatia local não mistura writer antigo e novo na
mesma execução: reader1 é incompatível com escrita2 e a composição isolada
é o único owner autorizado dos IDs de teste. Deploy com binaries mistos,
integração nos hosts ou compartilhamento real dessa execução exige o gate
operacional apropriado; não afirmar que cliente legado arbitrário que já
tenha acesso direto de escrita ao banco é contido por um contrato novo.
Na composição bound valem também os fences existentes, sem mudá-los.

## 6. Estados, erros e informação ao operador

| Evento                                                         | Estado/ação                                          | stopReason e diagnóstico estável                                              |
| -------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| Output válido e disponível                                     | Capturar, persistir, selecionar e admitir            | Sem stop; nunca reconstruir de summary.                                       |
| JSON inválido ou tamanho/complexidade excedidos após SUCCEEDED | Envelope UNAVAILABLE, conservar efeito e interromper | INSUFFICIENT_EVIDENCE + RESULT_UNAVAILABLE.                                   |
| Resultado obrigatório ou instruções não cabem                  | Interromper antes do modelo                          | INSUFFICIENT_EVIDENCE + CONTEXT_OVERFLOW.                                     |
| Sem contador/par qualificado                                   | Interromper antes do modelo                          | INSUFFICIENT_EVIDENCE + ADMISSION_UNAVAILABLE.                                |
| Saldo insuficiente                                             | Interromper antes da tentativa                       | MAX_TOKENS/MAX_COST/MAX_MODEL_CALLS/MAX_DURATION ou limite nativo de reparos. |
| Checkpoint antigo com TOOL_RESULT sem completude               | Interromper antes de ferramenta/modelo               | INSUFFICIENT_EVIDENCE + LEGACY_RESULT_UNKNOWN.                                |
| Reserva não resolvida na retomada                              | Cobrança conservada, sem replay                      | INSUFFICIENT_EVIDENCE + DECISION_USAGE_UNKNOWN.                               |
| Binding/versão incompatível ou contrato corrompido             | Recusar retomada/settlement                          | STATE_CONFLICT + diagnóstico de checkpoint/admission.                         |

Diagnósticos constam em audit/telemetry e mensagem final redigida; não criam
novos StopReason globais. Incluir mode/version, IDs nativos, operationKey,
outputBytes/completion quando conhecidos, requestSha256, contador/versão,
limites/admissão e estado da reserva. Não repetir output, prompt integral,
segredo ou instrução arbitrária nos logs. Testes conservam o dado sintético
completo em evidência própria separada. Falha de audit/log segue o veto
nativo e não pode ser ignorada para continuar.

Completion usa o envelope tipado, nunca cast de uma prévia para objeto.
UNAVAILABLE e reserva UNKNOWN impedem declaração de conclusão completa.
Efeito confirmado pode constar no diagnóstico como fato nativo, sem dizer
que o objetivo ou a resposta do usuário foi concluído. Não enviar mensagem
a terceiros ou agenda real para materializar handoff nesta fatia.

## 7. Compatibilidade, migração e recuperação

| Writer/reader                          | Política                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Reader antigo / checkpoint1            | Comportamento legado.                                                                                         |
| Reader antigo / checkpoint2            | Rejeição de versão; não transformar em1.                                                                      |
| Reader novo / checkpoint1, modo legado | Comportamento legado, sem alegar completude.                                                                  |
| Reader novo / checkpoint1, modo1       | Sem TOOL_RESULT: upgrade validado de bindings/estado; com qualquer TOOL_RESULT antigo: LEGACY_RESULT_UNKNOWN. |
| Reader novo / checkpoint2              | Exigir modo1, versão do envelope, integridade, bindings, cursor e reservas consistentes.                      |

CHECKPOINT_VERSION legado não deve ser trocado globalmente para2 e quebrar
readers/writers antigos. A validação passa a aceitar versões por modo de
forma explícita; novos campos não são silenciosamente descartados. Stores
memória/PostgreSQL usam o mesmo validador e canônico, checando limite antes
de parse/gravação quando recebem bytes e estrutura depois do parse. Digest
de checkpoint é integridade, não autenticação nem autorização de tenant.

Cursor só aponta a passos existentes já entregues, sem pular resultado
pendente; IDs, digest e reservas são vinculados à execução. BudgetUsage
precisa ser compatível com os débitos reservados. Qualquer ambiguidade
recusa retomada. Tampering e cross-tenant não podem alcançar corpo ou modelo.

Rollout local: expandir contratos/leitores e testes; habilitar modo1 apenas
em fixtures e numa composição isolada; verificar persistência/restart e
regressão do modo legado. Sem alteração em dados reais ou backfill.
Após escrita2, rollback para reader1 não é recuperação segura: pausar essa
execução e fazer roll-forward com reader2. Não downgrade/reselar um
checkpoint ou reexecutar ferramenta para viabilizar rollback. A concessão
T3 não concede integração no root, promoção ou release T4.

## 8. Critérios rejeitáveis e verificação futura

Todos os itens abaixo estão **NOT_RUN** nesta elaboração. Validação da SPEC
não é aprovação do runtime. Capturar fonte/artefato exatos antes/depois,
requests reais, output do corpo, checkpoints, usage, journal e veto nativo;
preservar falhas e processos/cleanup da infraestrutura de teste.

| ID   | Procedimento exigido e observação que rejeita a implementação                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TR01 | Fábrica pública com capabilities e HybridOrchestrator reais, porta de modelo/counter sintéticos e eco puro: três fixtures anteriores +ASCII4096 +Unicode4096bytes +escapes. Provider deriva resposta somente do frame realmente recebido; valor/bytes/hash/provenance/output final exatos. Qualquer fixture externa usada para fabricar resposta rejeita.                                                                                                                                     |
| TR02 | JSON admissível nas fronteiras: null/boolean/número/objeto/array/string vazia; byte32768/32769, profundidade32/33, nós10000/10001, surrogate, -0, cycle, hole, accessor/toJSON. Valor transformado silenciosamente, getter executado ou envelope truncado rejeitam.                                                                                                                                                                                                                           |
| TR03 | System/usuário/catálogo/histórico/reparo grandes e múltiplos resultados: pedido real igual ao snapshot admitido; zero chamadas se obrigatório não cabe; opcionais removidos inteiros. Limites exato/mais um, contador inválido/ausente, janela e saída insuficientes. A17KiB entregue, decisão pedindo B17KiB e pedido posterior dependente de A+B: conservar ambos e recusar o pedido combinado; jamais admitir sóB por avanço do cursor.                                                    |
| TR04 | Alterar output, summary, hash, IDs, cursor, set obrigatório ou payload no ContextEngine customizado. O runtime deve rejeitar adulteração antes de modelo/corpo; JSON com instrução/approval forjados não concede autoridade. Modelo sintético não prova robustez semântica de LLM real.                                                                                                                                                                                                       |
| TR05 | Reserva antes do modelo, uma cobrança por tentativa e reparo, settlement idempotente e sem débito duplo; timeout/throw/cancel/uso inválido/falha de save/cross-tenant/late result. Falha de pre-save implica zero chamadas; UNKNOWN conserva limites e impede avanço. Disputar CAS inicial e reserva com dois processos, perder fence, repetir token antigo e tentar saveCheckpoint2 simples: um único receipt/call e nenhum bypass de CAS.                                                   |
| TR06 | Checkpoint2 com resultado completo: store memória e PostgreSQL sintético real, perda/recriação do processo e retomada sem novo corpo. Checkpoint1 legado e com/sem TOOL_RESULT, reader antigo, mudança de modo, digest/tenant/version/reserva corrompidos. Comparar valor/bytes/usage/settlement antes/depois, não apenas exit0. Incluir4096U+0000 e chaves comU+0000 no codec V2, base64/padding/hash/UTF-8/JSON inválidos, wrapper/dados grandes e retorno lógico idêntico nos dois stores. |
| TR07 | Efeito sintético confirmado seguido de overflow ou falha de save: um único corpo, operationKey/settlement conservados, objetivo não declarado completo e nenhum replay na retomada. Falha nativa do journal continua incerta. Sem efeito externo real.                                                                                                                                                                                                                                        |
| TR08 | Mais de50observações, várias ferramentas por regras antes do modelo e reserva de espaço próxima8MiB: nenhum TOOL_RESULT, entregue ou não, expulso; recusa pré-corpo quando não cabe; checkpoint jamais truncado.                                                                                                                                                                                                                                                                              |
| TR09 | Modo legado e single_pass, custom ports, SDK/worker consumidores: regressão explícita; opção incompatível falha cedo. Schema de gateway governado aceita a representação comum quando testada diretamente, sem alegar integração de rota que não foi implementada.                                                                                                                                                                                                                            |
| TR10 | Reexecutar diferencial real de dois motores para os novos casos e controles de admissão quando a infra qualificada permitir; preservar testemunho vermelho original. Prova CVG isolada não satisfaz equivalência dos dois motores nem os36cartões.                                                                                                                                                                                                                                            |

Fixtures de efeitos são in-memory/puramente sintéticas; usar PostgreSQL
dedicado e claim de recursos antes de execução. Counter/modelo são
substituições declaradas; fábrica, seleção, despacho, composição, journal,
store e retomada alegados devem ser reais. Uma unit test do serializador
não substitui a fatia pública. Injetar ao menos um pedido truncado e um
checkpoint/reservation adulterado para demonstrar rejeição do próprio
observador; controle positivo integral para evitar validador que rejeita tudo.

Depois de BUILD autorizado: Node22, typecheck/lint/unidades e regressões
pertinentes, PostgreSQL, E2E sob claims exclusivos e certificação exigida
pela constituição. Sem refrescar pins/checkers para fingir gates verdes:
alterações de contratos exigirão requalificar os pacotes que os pinam;
qualificações0220/0221/0222 não são aprovadas nem reescritas por esta SPEC.
Auditoria independente da candidata real antes de qualquer aceitação.

## 9. Sequência condicional e limites da decisão

1. Revisar tecnicamente esta proposta congelada, corrigir achados materiais,
   executar formato/links/higiene e obter revisão humana desta SPEC por hash.
2. Só após autoridade T3 registrada: registrar task BUILD e implementar a
   fatia vertical em worktree isolado. Expandir contratos/leitores antes de
   ativar modo1; uma única autoridade para arquivos compartilhados.
3. Executar TR01–TR09 e gates de regressão; executar TR10 sem substituir
   motores reais por reimplementação. Requalificar inputs alterados pelos
   gates apropriados, preservando o denominador e os36critérios originais.
4. Aceitar somente o escopo comprovado após crítica fresca; adoção do
   default, outros consumidores/perfis e paridade integral continuam abertos.

Desconhecidos operacionais: tokenizer, janela, preço, wire final e suporte
de saída dos providers reais; capacidade/latência do PostgreSQL; expansão
de resultados além dos limites. Não são preenchidos por suposição nem
necessários para habilitar uma porta real nesta fatia: portas reais estão
fora de sua autoridade. Sem par sintético que prove o contrato de contagem,
a fatia também não passa. Nenhuma decisão de produção foi tomada.

Complexidade admitida: envelope/seleção versionados, uma porta pura de
contagem, codec físico reversível e uma reserva serial de decisão com CAS
no checkpoint existente. Rejeitados:
remover só slice300, bypass de contextItems, resposta externa à observação,
offload/blobstore e infraestrutura distribuída sem necessidade medida.
A reserva antes da chamada se justifica pelo intervalo de perda de processo
entre admissão e contabilização; seu risco é coberto por TR05/TR06, não por
explicação. Esta proposta deixa a mudança pronta para revisão, não concede
PASS de execução, full parity ou release.
