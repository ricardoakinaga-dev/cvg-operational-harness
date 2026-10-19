# Construção de diagnóstico — replanejamento T1

Task `C100-FND-DIAGNOSTICS-REPLAN-001`. Estado: **PROPOSTA NÃO REVISADA**.
CodeBUILD=0, testes/probes/aplicação=0. A tentativa anterior
[C100-FND-TH06-RECOVERY-001](../foundation-th06-recovery/REPORT.md) continua
FAILED, congelada em b585b214, sem correções restantes. Este plano não a
reabre e não concede uma nova implementação.

## Causa demonstrada e superfície

RB-01 demonstrou duas perdas da primária: construir o argumento de diagnóstico
com `errorInfo(error)` acontece antes de entrar na função que protege somente
a escrita. `Object.create(null)` é a primária sintética; String(error) falha.
O grafo final conserva diagnóstico e end, mas perde a primária. São resultados
da revisão anterior e da confirmação já arquivada, não novas execuções.

O [mapa AST](diagnostic-source-map.json) leu os sete arquivos congelados, sem
importar ou executar seus corpos. Encontrou30sites:23chamadas de projeção,
quatro coerções nas definições de errorInfo e três substitutos de diagnóstico
nos testes. Ancestral lexical de try/catch não prova ownership; cada site
precisa de classificação de fluxo. O callback SQL já tem controle positivo
finito, enquanto sync/Promise falham. Os demais fluxos abaixo são avaliação
estática, não provas de runtime.

A causa material do replanejamento é o limite entre **construção** e
**execução** do diagnóstico. A proposta anterior combinava falhas de limpeza
e I/O, mas não capturava a primária antes de toda projeção. Não basta trocar
um valor por fallback ou passar um objeto já construído a outro helper.

## HOW proposto para revisão futura

Reusar exclusivamente a política de completeCleanupError e o ownership de
cleanupCompleteChildren existentes. Nenhuma mudança em runtime, SQL, API
pública, schema, policy, guards, limites, fixtures de ferramenta ou asserções.
Uma futura implementação deverá viver em candidata nova, com contrato e
orçamento próprios revisados. Não escrever patch na candidata b585.

Separar os papéis antes de escolher o tratamento:

- **Relançar falha nativa:** capturar o valor primário primeiro; executar
  diagnósticos preguiçosos dentro desse limite, tentar todos os independentes
  seguros e relançar a combinação. Metadados puramente síncronos mantêm seu
  fluxo síncrono; I/O assíncrono usa callbacks aguardados, sem transformar a
  API query inteira em async. As closures incluem errorInfo e construção do
  objeto, além da escrita. Falhas dependentes não executam com dados ausentes.
- **Observar rejeição esperada:** uma projeção bem-sucedida continua gerando
  o resultado observado, sem lançar a falha nativa que o teste já trata. Se
  a projeção falhar, lançar primária e diagnóstico juntos. Isso vale para
  finish/runResult e probes negativos de settlement.
- **Observador após CAS confirmado:** seu erro nunca pode substituir o
  resultado nativo já commitado. Conservar resultado/retorno, registrar a
  falha bruta em carrier privado ao caso e falhar o caso na sua finalização,
  depois das barreiras existentes. Se a projeção falhar, guardar ambas as
  causas nesse carrier; não fabricar ErrorInfo nem um PASS. O verdict
  existente deve permanecer UNPROVEN_FAILURE quando esse carrier tiver erro.
- **Primária encaminhada a finally:** atualizar o carrier com a combinação
  de primária e diagnóstico antes de relançar. Um finally que ainda recebe
  apenas a primária original apagaria o diagnóstico novamente.
- **Callback SQL:** conservar entrega exatamente uma vez e retorno normal;
  o controle atual já preserva primária/projeção. Não trocar o comportamento
  normal por rejeição assíncrona ou relançar um erro que o callback tratou.

### Operações e wiring propostos

Fixar duas operações privadas no fixture de testes, sem exportá-las no pacote
público. São interfaces propostas para revisão, não implementação:

```ts
declare function collectCompleteDiagnostics(
  primary: unknown,
  actions: readonly (() => void)[]
): { error: unknown }
declare function projectCompleteDiagnostic<T>(
  primary: unknown,
  project: () => T
): T
```

A primeira executa cada ação **síncrona** em try/catch, começa a lista de erros
com a primária bruta e retorna completeCleanupError dessa lista. Não lança
antes de tentar as outras ações independentes. Não recebe actions async ou
promessas: os callsites são código confiável e serão auditados por AST; I/O
assíncrono continua sob cleanupCompleteChildren, que aguarda os callbacks.
Não copiar a política de combinação/deduplicação/cause para outra função.

A segunda retorna project() normalmente; se a projeção lançar, lança a
combinação de primária e diagnóstico usando completeCleanupError. Não lança a
primária apenas porque ela existe: o chamador pode estar observando uma
rejeição esperada. Essa distinção mantém finish/probe negativos funcionando.

Wiring por classe do mapa semântico:

1. SQL sync/Promise: failed recebe a primária e uma closure de construção do
   record; o coletor engloba tanto record() quanto wire(record). A chamada não
   avalia errorInfo antes desse limite. Não transformar query inteira em async.
2. Catches de rethrow: closures incluem construção e emissão dos diagnósticos.
   Ações independentes (event e writes, por exemplo) ficam separadas para que
   uma falha não suprima a outra. Relançar o error retornado pelo coletor.
3. Public journal: coletar o push/projeção síncronos primeiro; encaminhar esse
   `{error}` ao owner assíncrono que ainda tenta trace. A falha do push não
   impede trace; ambas são retidas. Outros catches já lazy não são reescritos
   só por uniformidade.
4. Capacity catch externo: atribuir **a combinação retornada** a primary antes
   de relançar. O finally recebe esse carrier atualizado, inclusive a falha da
   construção de observation.error; nunca apenas a primária anterior.
5. Observador CAS: carrier bruto separado e privado ao caso. O coletor engloba
   criação de fault, push e event dependentes; sua combinação entra nesse
   carrier. A função devolve o mesmo resultado/token nativo, sem rejeitar um
   CAS já commitado. Na finalização, um callback seguro lança os erros brutos
   desse carrier e os demais callbacks ainda são tentados. Antes dos saves,
   presença desse erro mantém observation.verdict=UNPROVEN_FAILURE, sem um
   ErrorInfo fictício ou novo campo de sucesso. O assert observerErrors=[]
   existente continua intacto; o novo guard impede PASS se a projeção falhou
   antes de produzir um registro nesse array.
6. Finish/runResult e probe de erro esperado: envolver toda a construção e
   emissão do diagnóstico em projectCompleteDiagnostic, retornando a projeção
   normal ou lançando primária+falha de projeção. Não promover a rejeição nativa
   esperada a erro do caso quando os diagnósticos funcionam.
7. Callback SQL e cinco closures já lazy: manter o wiring atual e verificar
   novamente com projeção real. A avaliação estática não os declara PASS.

Os carriers do observador não mudam fixture, SQL, resultado nativo nem
asserções; são estado privado de ownership de falhas do próprio teste. O
verdict existente muda para falha quando havia diagnóstico não resolvido,
nunca para sucesso. Essas escolhas e todos os23sites precisam de revisão
antes de uma futura candidata nova.

As definições de errorInfo e seus formatos normais permanecem iguais. Tratar
coerção como infalível, substituir a primária por string, engolir a falha de
projeção ou alterar o helper para produzir um diagnóstico de sucesso não
satisfaz o contrato. Preservar identidade de valores falsy/undefined e grafo
transitivo de todas as falhas distintas, sem depender de error.json para
reconstituir o erro lançado.

## Prova necessária antes de novo aceite

A próxima proposta precisa de Quality Bar e orçamento delimitados antes de
código, além de crítica independente do HOW. A implementação anterior não
recebe uma rodada extra por este documento.

A prova deverá executar funções/catches/callbacks reais extraídos dos
consumidores com o errorInfo real. As sondas anteriores que substituíam esse
helper por um stub ocultavam precisamente RB-01. Stubbar somente DB/runtime
pesado e I/O, nunca a projeção sob julgamento. Usar Error comum, primária
opaca sem conversão e falha de accessor de Error; sucesso de diagnóstico e
falhas de construção/escrita/close distinguíveis. Classificar resultados como
controles finitos, sem alegar PG ou M1.

O observador CAS deve manter o mesmo objeto/token retornado pela chamada
nativa, mesmo quando leitura/projeção falha; o caso ainda precisa falhar com
as causas alcançáveis. Provar também erro esperado observado sem falha de
projeção, sem promover esse caminho normal a erro do teste. Catches com
finally devem conservar primária e diagnóstico; callback SQL uma vez;
callbacks independentes seguros todos tentados; nenhum DB após join não
confirmado; nenhum verdict PASS depois de falha do observador.

Manter os75testes atuais e suas expectativas, além das302expectativas/SQL/fixtures originais por AST,
sete inputs protegidos e controle de ownership de processos. Após revisão
positiva, gates T2 completos seriam necessários em candidata própria antes
de integração. Todos esses passos estão NOT_RUN nesta preparação.

## Autoridade e próximo passo

T1 apenas, pela governança D-12. Não há novo pedido humano: qualquer futuro
T2 privado depende de task/HOW/orçamento válidos, e mudança de contrato ou
segurança teria gate próprio. Os117resultados/17controles, M1 e PAR continuam
abertos. Próxima ação proposta: revisar o mapa semântico dos23sites e congelar
um HOW finito que rejeite as perdas demonstradas, antes de qualquer novo
ciclo de implementação.

## Quality Bar proposta da futura implementação

- DG01: a primária opaca de RB-01 continua alcançável em sync e Promise, junto
  com diagnóstico e eventual end; controles com errorInfo real.
- DG02: API query mantém sync/Promise/callback e callback uma vez; rejeição
  esperada com projeção normal não vira falha nova.
- DG03: observador conserva identidade do resultado/token CAS e falha o caso
  na finalização com as causas brutas; nenhum PASS ou mudança do nativo.
- DG04: falha de projeção no catch e outra no finally ficam ambas no grafo.
  Usar coerção sintética que lança objetos D1/D2 distintos para não aceitar
  um teste que perde D1 e passa porque somente D2 permaneceu.
- DG05: todas as ações independentes seguras são tentadas; joins/DB, deadlines,
  cleanup de HOME, finalização global e formatos normais permanecem preservados.
- DG06: classificar os23sites e testar os escopos alterados com projeção real;
  negativos não podem trocar errorInfo por stub permissivo. Os controles já
  existentes podem continuar, mas não são a única prova dessa fronteira.
- DG07:75testes atuais continuam verdes/sem novo skip, expectativas e fixtures
  preservadas; prefixo original de50regressões e sete protegidos continuam
  idênticos. Binding de novos helpers no compilador dos controles é adaptação
  permitida, sem alterar assert, fixture ou mascarar falha de projeção.
- DG08: nenhum aceite de integração antes de revisão independente do código,
  gates T2 e certify/verificador atuais em candidata própria com recursos
  registrados. Nenhum certificado de b585 ou da SPEC235 é transferido.
- DG09: unidades anteriores FAILED continuam fechadas e congeladas; este
  replanejamento não concede código nem redefine seu orçamento. Qualquer
  futuro BUILD recebe task/escopo/orçamento novos antes de começar.
