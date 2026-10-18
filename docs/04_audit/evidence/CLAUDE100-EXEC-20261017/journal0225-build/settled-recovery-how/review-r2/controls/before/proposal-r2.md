# Recuperação após passo concluído — HOW R2

Estado PROPOSED_R2_TECHNICAL_REVIEW. Uma correção documental agrupada dos
HOW-R1-01/02/03; originais, R1 e código de runtime intactos. WHAT continua
0225 §7/J11 aprovado. Nenhuma API pública, opção, assinatura, migration,
barrel ou expectativa do teste0224 é alterada por esta proposta.

## Aplicabilidade e nova prova

O witness native-1792324184586 inclui agora a linha nativa TOOL/SUCCEEDED, attempt1,
stepId/ref/completedAt, além de CONFIRMED/version1/output completo e checkpoint
pendente. Antes/depois da retomada a linha é idêntica; o teste estrito falha
por observação ausente. CPusage.steps0, primeiro writer em memória.steps1.
InMemory/legacy/custom sem qualificação mantém o handoff0224 exato; baseline
focal1PASS,74NOT_SELECTED. Não chamar o conservador handoff de recuperação.

## 1. Leitura nativa qualificada e protocolo interno

Apenas get nativo mode1 poderá marcar um registro: readiness no cliente real,
rowversion1/CONFIRMED, resultSQLNULL/errorNULL, decode íntegro, output próprio e
prova de leitura sem xid de escrita atribuído à transação atual. Na própria
SELECT de get mode1 acrescentar alias privado booleano calculado por
pg_current_xact_id_if_assigned() IS NULL. Somente true permite marca; false,
ausência ou formato desconhecido não qualificam recuperação. Isso recusa ler
própria escrita não commitada como prova durável; não faz COMMIT/ROLLBACK de
transação do caller. O get continua devolvendo seu valor normal sem a marca.
Mode0 não recebe o alias; confirm/reserve/outros retornos não atestam commit
por essa marca. Nenhuma coluna persistida ou campo público novo.

A prova PostgreSQL local settled-read-transaction-probe.json observou true em
SELECT autocommit e BEGIN sem xid, false após atribuir xid, true após rollback.
Isso prova o sinal local, não uma leitura de journal ou privilégio do role de
serviço; ambos serão positivos/negativos nativos obrigatórios na implementação.

No mapper, depois dessa validação, definir no objeto retornado a chave
Symbol.for('cvg.journal.validated-result.v1'), valor número1, own data descriptor
com enumerable:false, writable:false, configurable:false. Testar os quatro
valores exatos via Object.getOwnPropertyDescriptor, sem getter. Getters, outro
valor/flags, chave textual, ausência ou marca perdida por serialização falham
fechado. Campo/símbolo no output não marca o registro; o codec recusa símbolo.

Essa chave global não autentica código instalado: a fronteira confiável é o
journal injetado pela composição e o executor nativo, como na0225 §4. Campos
HTTP/modelo/JSON/GUC/application_name não ativam modo ou callback. Não alegar
proteção contra código instalado hostil, expressamente fora do domínio.

O wrapper journaledTool adiciona callback em OUTRO Symbol privado local ao
módulo, como own data function property enumerable:true. Definir inicialmente
writable:false/configurable:false; cópias nativas por spread preservam chave e
função fechada, mas não suas flags de imutabilidade. O leitor exige own data
function e enumerable:true, não flags falsas depois de uma cópia. Não aceitar
chave textual, herança ou accessor. Provar tanto resolve do wrapper original
quanto prepareCompleteToolRegistry aplicado ao wrapper, que usa spread. list
sem executor qualificado não passa a ser uma fonte de recuperação.

O callback fecha sobre tool original, journal e fingerprint já capturado.
Usa apenas get; jamais execute/reserve/confirm/fail/markUncertain. No registro,
ler por próprios data descriptors os campos de identidade/estado/output;
validar marca exata, tenant/operationKey, CONFIRMED, proposalHash da função
nativa existente (input/tool/version/provider/fingerprint), attemptId string
não vazia/bounded/semNUL e output próprio, inclusive null. Não comparar esse
UUID com o attempt numérico do passo nem substituir o attempt. Validar domínio
JSON com os limites do journal antes de retornar {output}; erro propaga para
parada explícita do runtime. Helper é interno, sem export no barrel.

## 2. Predicado de elegibilidade nativo exato

Todos os requisitos abaixo são AND, depois da validação existente do checkpoint:

- checkpoint-v2; pendingStepNumber p inteiro positivo é state.stepNumber+1;
  pendingDecision CALL_TOOL ou REQUEST_APPROVAL; toolId/version e toolInput
  preservados do checkpoint confiável; binding de composição atual já aceito.
- acceptedDecision presente, stepNumber p, decisão canônica igual à pendente;
  IDs únicos apontam exatamente aos receipts SETTLED desse passo, com mesmos
  tenant/execution/purpose válidos, sem pendingDecisionAdmission ou UNKNOWN.
  IDs vazios só são consistentes se não há receipt modelado para esse passo.
- Exatamente uma linha nativa do passo TOOL desse tenant/execution/p. Ela é
  SUCCEEDED, attempt===1 como o writer atual, sideEffecting===true,
  stepId===`step_${executionId}_${p}_tool`, decisionType/reasonCode iguais aos
  da decisão pendente. Duplicata/mismatch é recusa; não escolher o primeiro.
- completedAt obrigatório: string UTC ISO válida, exatamente igual à
  Date.toISOString, >=startedAt válido. Não usar now ou updatedAt, que não
  existe em ExecutionStep. Timestamp da observação reconstruída é completedAt,
  declarado como origem durável do passo, não timestamp perdido recuperado.
- observationRefs array denso com exatamente uma string não vazia <=512 e sem
  controles/NUL. Essa ref não colide com nenhuma observação já salva. Step/ref
  permanecem byteiguais. Nunca inventar ref/stepId ou reescrever o passo.
- Ausência total de TOOL_RESULT desse passo. Resultado salvo UNAVAILABLE,
  incompleto ou conflitante mantém a recusa original; não reconstruir por cima.
- Callback nativo resolve o get qualificado com todos os bindings acima.
  Não inferir autoridade por classe, campo privado ou flag nova. Proposal
  diferente/legado0/dado incerto/não recuperável continua handoff.

## 3. Estado proposto e CAS, com falha explícita

Leitura, validação e controles são bounded por remainingDuration existente;
qualquer erro/timeout dá parada preserveCheckpoint:true antes de mutar run,
sem corpo/modelo nem escrita de finalização. Honrar signal cancelado e usar o
mesmo gate turn/before-step para pause; revalidar sinal/duração/gate depois da
leitura e imediatamente antes da gravação. Os guards bound continuam no CAS.

Construir observação por completeToolPayload/assertCompleteToolObservation:
TOOL/UNTRUSTED, ref única do passo, stepId/p nativos, sourceId/version da tool,
operationKey/effectRef nativos, completedAt. Limites de contexto inalterados;
output fora deles vira SUCCEEDED/UNAVAILABLE e não admite próximo modelo.

Preparar um LoopRun separado apenas como projeção de checkpoint, com cópias
de state/observations/usage/countedSteps. Não registrar novo turno/WeakMap,
reabrir passo ou chamar dispatch. Inserir a observação, incrementar APENAS
usage.steps em1 para a SUCCEEDED ainda não reconhecida pelo checkpoint sem
observação; esse incremento é o feito por recordStep antes do save perdido.
Preservar modelCalls/toolCalls/tokens/custo/demais contadores e todos os receipts.
No ramo existente com resultado já salvo, NÃO incrementar steps nem alterar
qualquer comportamento. A diferença vem da escrita nativa do writer atual:
nenhum save intermediário reconhece esse SUCCEEDED sem a observação completa.

No estágio: stepNumber e state.stepNumber=p; inFlightCounted=false;
countedSteps contém p; lastToolObservation=observação; limpar pendingDecision,
pendingStepNumber, pendingApprovalId e acceptedDecision consumidos; selectedTool
usa o campo real selectedCapability; adicionar decisionSignature uma vez,
respeitando maxSignatures. state.observations referencia o array novo. Contador
steps+1 precisa continuar inteiro seguro, sem inventar outro uso perdido.

Usar persistCheckpoint EXISTENTE sobre o run projetado: mesmo token carregado,
mesmo schema/codec/expected APPLIED e token retornado, mesmos guards0029/outer/
fence do store. Somente após APPLIED válido transferir projeção e token para
run vivo. Não depender de WeakMap do run projetado: persistCheckpoint somente
usa dados do checkpoint e store, sem kernel/gateway. Ignorar o ramo comum de
resultado já salvo para não duplicar assinatura ou contador.

Esse CAS é a etapa anterior ao pre-runLoop CAS já existente. Ele precisa de
catch explícito próprio: erro, lease, conflito, APPLIED inválido ou ack perdido
retornam finalize no run original com preserveCheckpoint:true. Nenhum segundo
save genérico, re-read que conceda retry, modelo, corpo ou escrita de settlement.
A escrita pode ter commitado com ack perdido; não alegar rollback. Outro
processo resolverá somente o checkpoint que de fato ficou durável. Transferência
em memória ocorre após prova, nunca antes. Depois do sucesso, o fluxo normal
continua com controles e pre-runLoop CAS existentes; uma falha posterior também
não autoriza modelo. UNAVAILABLE para com checkpoint da observação preservado.

## 4. Oráculos e escopo de implementação após aceite técnico

O teste estrito atual continua obrigatório; após correção, novo reader entrega
output real e ref nativa ao modelo, bodytotal1, journal e passo/ref/attempt
imutáveis, timestamp=completedAt, primeiro modelo1+segundo1, receipts/usage exatos.
No witness pequeno, contador final steps2: um TOOL restaurado e um RESPOND novo.
Rerun completo ou ramo com observação já salva nunca soma outro TOOL.

Testes focais cobrem cada predicado negativo, accessor sem invocação, marca
textual/ausente/valor/flags errados, legado/InMemory/custom sem marca, null versus
ausência, get não commitado/xid atribuído, erro get, deadline/pause/cancel e CAS
conflitante/ack perdido sem segunda escrita/modelo/corpo. Positivo íntegro real
passa. Repetir toda a regressão0224,66crashpoints,11contextos sem filtro após
correção,19nativos ampliados; J13 exige guards bound reais, não mocks/unbound.

Paths adicionais propostos: effect-journal.ts, iterative-runtime.ts e novo teste
focal. Adapter/testes da candidata já reclamados. Antes de editar, claim e
pré-imagens reais, sem alterar index.ts/contratos/manifests/exports/migrations
ou teste0224 congelado. Assinaturas EffectJournal não mudam. Sem porta/flag
nova, import reverso, nova authority, promoção, repin ou134crédito. Se a revisão
não aceitar esta distinção/protocolo, registrar os obrigatórios; não inferir
aceite ou repetir a aprovação humana existente. Codecritic0/2 ainda reservado.
