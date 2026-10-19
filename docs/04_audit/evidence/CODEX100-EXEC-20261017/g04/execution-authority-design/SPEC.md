# Autoridade genérica de execução — contrato proposto

Task `DX100-G04:SPECIFY-EXECUTION-AUTHORITY`, preparação T1 de contrato futuro T3. **PROPOSED; BUILD não autorizado.** Esta unidade decide a costura CP04/CP09 para incorporação à SPEC completa CQ01–14. Não publica API, altera migration, importa produto ou concede qualificação funcional.

## 1. Invariante, fontes e elegibilidade

Uma execução durável só admite nova chamada ou write quando a autoridade nativa da composição confirma tenant, execução, worker, epoch, estado e validade. Autoridade de execução, tentativa do efeito, CAS do checkpoint e ownership da sessão têm funções distintas. Um resultado já confirmado permanece verdadeiro depois de perda de lease ou cancelamento.

Os [24 inputs](source-inputs.json) e [24 ranges únicos](source-spans.json) distinguem fonte atual `R`, contrato/decisão `A` e snapshot histórico do owner `O`. Nenhum snapshot ou compile equivale a aceitação runtime. `A02` é a0224; `A04` conserva decisões humanas0221/0225 e adiamento0226. Os limites e gates desses owners não são ampliados por esta proposta.

| Caminho            | CURRENT observado                                                                                                                                             | TARGET proposto                                                                                                           | Elegibilidade para BUILD nativo                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Standalone direto  | `createOperationalHarness.execute` recebe executionId, sem adquirir lease por essa chamada; CAS unbound não cria worker/ACK                                   | Execução standalone durável usa o mesmo coordenador genérico, com aquisição dirigida ao executionId exato                 | Nova costura/qualificação necessárias; uso efêmero não prova restart ou concorrência        |
| Worker neutro      | Claim/heartbeat/transição verificam attempt; journal e checkpoint são construídos separadamente; perda de heartbeat é sinalizada depois da chamada ao harness | Coordenador emite autoridade por claim e injeta portas de persistência/efeito ligadas a ela                               | Primitivas atuais são fonte de reuso; sua composição genérica continua não qualificada      |
| Bound do owner0217 | Snapshot valida parent, binding, fila, outer claim, sessão/pause e fase; journal contém restrição a uma operação específica                                   | Autoridade genérica interna **composta com** as guardas bound qualificadas; nunca substitui ou remove outer/fase/approval | Fonte/manifests/gate do owner obrigatórios; não adotar0226 nem ampliar matcher isoladamente |

As fontes `R01/R02/R03/R04` comprovam as fronteiras descritas; `A02:368–403` impede inferir lease pelo CAS; `O01/O03/O04` delimitam o reuso bound. Não se afirma que salvaguardas inexistem no sistema inteiro.

## 2. Escolha mínima e alternativas

**Selecionada para desenho:** um coordenador genérico no núcleo, usando as tabelas operacionais existentes e helpers transacionais do owner de persistência. Standalone e worker adquirem a mesma autoridade; portas de journal, checkpoint e efeito compartilham esse contexto. Acrescentar somente os bindings duráveis e guards necessários nas estruturas existentes, em migração futura própria. Não criar outro journal, log espelho, broker, tabela de leases ou outbox paralela.

| Alternativa                                                  | Decisão e motivo                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Só heartbeat/AbortSignal local                               | Insuficiente: sinal não é autoridade transacional nem impede processo pausado de voltar             |
| Usar apenas CAS ou advisory de sessão                        | Rejeitada: protegem estado/ownership da sessão, sem autorizar worker/efeito/ACK                     |
| Adotar factory published/fence específico                    | Rejeitada como atalho: depende de outer claim/fase/domínio e gate do owner                          |
| Novo serviço de lease com TTL próprio                        | Rejeitado: duplicaria autoridade já persistida em operational_executions                            |
| Coordenador único e bindings mínimos nos stores operacionais | Escolhida: reaproveita identidade/attempt/lease, explicita perda de autoridade e protege cada write |

Custo introduzido: um contexto por claim, guards curtos por write e metadados de ligação em tabelas existentes. Sem manter transação/row lock durante modelo, ferramenta, rede ou aprovação humana. Latência/capacidade de produção não foram medidas; os limites de fixture da seção9 não são SLO de produção.

## 3. Identidades e contrato interno proposto

O tenant e o namespace de storage vêm da composição autenticada. `workerId` é identidade do processo emitida pelo host confiável; não vem de HTTP/modelo. `executionId`, request hash e capability fingerprint devem coincidir com o registro persistido. A próxima SPEC deve declarar os exports efetivos; os nomes abaixo são desenho inerte.

```text
type ExecutionAuthority = opaque
type EffectAdmission = opaque
type RecoveryAuthority = opaque

acquireExecution({ tenantId, executionId, workerId }): Promise<ExecutionAuthority>
renewAuthority(authority): Promise<void>
admitEffect(authority, durableIntent): Promise<EffectAdmission>
settleEffect(authority, admission, knownOutcome): Promise<void>
commitCheckpoint(authority, expectedCheckpoint, next): Promise<Applied | Conflict>
commitTerminal(authority, terminalIntent): Promise<TerminalReceipt>
requestCancellation(trustedActor, executionId): Promise<CancellationReceipt>
inspectRecovery(recoveryAuthority): Promise<RecoveryObservation>
closeAuthority(authority): Promise<ClosureObservation>
```

São capabilities privadas emitidas por factory confiável, sem construtor ou aceitação por duck typing. Cada capability guarda identidade física da composição e bindings imutáveis; clone/JSON/objeto forjado/outro tenant ou backend falha antes de IO. Não atravessa processo ou wire: um processo novo adquire nova autoridade a partir do banco. Referências públicas são diagnóstico, não permission tokens.

O epoch de execução é o `attempt` incrementado atomicamente pelo claim, sem segundo contador de lease. Inteiro positivo, sem wrap/reuso; esgotar o int4 existente recusa novo claim e exige intervenção. Renovação não incrementa epoch. O `attemptId` do journal continua uma identidade de tentativa de efeito diferente; preservar os dois bindings. O operationKey lógico é estável entre claims da mesma intenção, para permitir replay confirmado; o epoch não cria uma nova identidade de efeito.

No modo novo, derivar operationKey no runtime como `ea1:` seguido do SHA-256 hexadecimal do JSON canônico da tupla versionada `(tenant, executionId, logicalStepId, toolId, toolVersion)`. Essa representação tem68caracteres e não depende de parsing de delimitadores de IDs. Guardar os bindings duráveis e conferir proposta/input/fingerprint separadamente: hash e chave não concedem autoridade nem permitem que a mesma identidade receba outro input. O modo legado conserva sua derivação; não reinterpretar suas chaves como execuções novas.

`acquireExecution` dirigido é obrigatório para standalone: não chamar `claimNext` e aceitar qualquer item da fila. A aquisição deve selecionar o tenant/executionId exatos e atualizar execução/fila/epoch na mesma transação. Worker com descoberta de fila usa a mesma primitiva de mutação após seleção segura. APIs legadas não são silenciosamente redirecionadas ao modo novo.

## 4. Estado e bindings duráveis propostos

O modo novo é opt-in de composição confiável, vinculado ao schema/binário/roles no manifesto. Um campo persistido de modo identifica o contrato, mas não concede autoridade por seu valor: factory, guards, grants e identidade do registro precisam concordar. Cliente/modelo não escolhe modo nem fornece epoch/worker como autorização.

| Dono existente                    | Delta lógico proposto, a concretizar na SPEC/migration completa                                       | Regra                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| operational_executions            | Modo de autoridade, fechamento de dispatch, pedido de cancelamento e referência/digest do terminal    | Metadados imutáveis de composição; terminal único; não remover request/lease/attempt atuais      |
| operational_effect_journal        | executionId, logicalStepId e bindings de admissão: epoch, worker, intent/proposal digest              | FK tenant/execution e vínculo imutável por admissão; não inferir parent pela string operationKey |
| operational_execution_events      | Fatos de admissão, perda/recovery, pedido de cancelamento e terminal, com identidades/digests seguros | Pedido de cancelamento não é evento de terminal CANCELLED; não expor corpo/credenciais           |
| operational_execution_checkpoints | Codec/CAS/admissão completos do owner0224, ligados ao mesmo executionId e autoridade                  | Não criar codec novo, save simplesV2 ou transação paralela que contorne o guard                  |

Número/DDL e nomes físicos da expansão não são reservados nesta unidade. A SPEC completa precisa congelar o delta físico, constraints, grants e compatibilidade antes de BUILD, respeitando0029→0030→0031 já reservadas; não editar essas migrations para encaixar a proposta.

Um durableIntent é criado pelo runtime depois da decisão/admissão governada e persistido antes do corpo. Liga tenant/execution/logicalStep, tool/version, input/proposal digest, fingerprint e operationKey. Validar contra o checkpoint/step nativos; uma chave fornecida pelo modelo não registra uma intenção. Preservar o resultado completo e os limites da0224/0225; recibo/digest nunca substitui o output útil.

## 5. Linearização, transações e lock order

No modo genérico, claim, renew, cancel, recuperação, admissão, checkpoint e terminal devem compartilhar helpers do mesmo owner. O guard roda **no mesmo client e transação do write**, não como consulta anterior ou wrapper pool-backed. Conferir tempo do banco depois dos waits e revalidar antes do retorno do helper; sucesso só é publicado depois do COMMIT conhecido. Perda de ACK é resultado desconhecido, não rollback presumido.

Ordem alvo para operações de uma execução genérica: **execution row → fila operacional correspondente → checkpoint/step necessários → journal**, em ordem estável quando houver mais de um registro. O código atual não é declarado compatível por aproximação: sua seleção `FOR UPDATE OF q,e` e os caminhos cancel/recovery devem ser reconciliados/substituídos pelos mesmos helpers no modo novo. Seleção de candidato pode ocorrer sem ownership; a transação dirigida revalida tudo e não rouba trabalho de outra execução.

No caminho bound, conservar a ordem e as guardas completas do owner0217, inclusive outer/fase/sessão/pause. Não adquirir um subconjunto genérico em outra transação e chamar isso de bound. O manifesto de integração deve identificar um root transacional único e a ordem efetiva; enquanto essa composição não estiver qualificada, o caminho permanece impedido.

Para cada write, validar: modo admitido, tenant/execution/request/fingerprint, worker/epoch correntes, estado permitido, lease vivo segundo o banco e ausência de fechamento de dispatch quando for nova admissão. Settlement e terminal têm permissões específicas, não um booleano enviado pelo chamador. Falha de lock/guard/CAS não executa body e não dá retry automático de ação incerta. Deadlock/serialization rollback conhecido pode repetir somente a operação transacional sem efeito; COMMIT desconhecido nunca entra nesse retry.

O mesmo requisito vale antes de **chamada ao modelo**: reutilizar `decisionAdmission.reserve/settle` da0224 e seu CAS, com autoridade checada na mesma transação que persiste a reserva/cobrança. Sem reserva confirmada, zero chamada. Resultado tardio de provider sem autoridade não quita nem libera uma reserva alheia; conservar UNKNOWN e o débito superior. Não introduzir segundo journal de modelo ou usar a contagem de tokens como lease. Policy, aprovação de intenção exata, sandbox, pause, budget e cancelamento permanecem revalidações independentes antes do efeito; uma autoridade válida não as substitui.

As transações são locais. Journal confirmado, checkpoint, terminal e posição de entrega não se tornam atômicos por usarem o mesmo PostgreSQL. Reaproveitar o CAS do owner para estado/orçamento e ligar fatos persistidos por identidades verificáveis; o contrato de entrega da SPEC completa decide seu ACK/cursor sem anunciar sucesso antes dos fatos que ele afirma.

## 6. Admissão, perda de posse e efeito em curso

O início durável do efeito é a transição autorizada para EFFECT_STARTED, com intent e admissão ligados à autoridade, **antes do corpo**. Após COMMIT conhecido dessa admissão, o host revalida os sinais locais e invoca uma vez o executor. Essa ordem não elimina o intervalo entre commit, escalonamento e chamada externa.

| Momento da perda/erro                                | Comportamento obrigatório                                                                                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Antes de admitir                                     | Guard recusa; zero corpo e writes de efeito; sem recriar chave para contornar a recusa                                                                         |
| Admission COMMIT sem ACK                             | Não despachar. Classificar UNKNOWN e reconciliar o registro/settlement antes de nova ação                                                                      |
| Admissão confirmada, antes/durante o corpo           | A intenção já foi admitida; fechar novas admissões e sinalizar abort best effort. Não prometer que cancel/lease interrompe um alvo externo sem fencing próprio |
| Corpo retornou, worker já perdeu autoridade          | A capability antiga não confirma journal/checkpoint/terminal. Não transformar retorno em memória em commit; conservar fato/admissão e incerteza                |
| Journal confirmou, antes do checkpoint               | Novo owner pode recuperar o resultado autêntico sob os mesmos bindings, sem repetir corpo; avançar estado/accounting apenas por CAS válido                     |
| Efeito iniciado ou reserva de modelo alheia pendente | Recovery para e conserva UNKNOWN/limites; não quitar, cancelar reserva ou fazer nova chamada automaticamente                                                   |

Após falha de renovação, o contexto local sai de ACTIVE para SUSPECT e fecha dispatch novo; só renovação conhecida sob o mesmo epoch pode demonstrar continuidade. Lease expirado, outro epoch/worker, cancelamento ou terminal tornam a capability LOST/CLOSED; não reabrir silenciosamente. Um resultado tardio de renovação não revive um contexto já LOST. Toda decisão final continua no banco; abort local é contenção adicional.

`closeAuthority` encerra somente o contexto do claim, fecha admissões antes de aguardar e drena trabalho local admitido com prazo/join próprios. É idempotente e conserva resultados desconhecidos; não apaga journal/reserva nem declara que socket fechado prova rollback. Uma renovação tardia não o reabre. Não é shutdown global do serviço de sessões e não reintroduz a API adiada da0221.

O novo owner pode adquirir autoridade **de observação/recovery**, mas não ganha licença para repetir intenção pendente. A aquisição e a inspeção dos bindings/admissões precisam impedir dispatch enquanto houver reserva/efeito não resolvido. Não usar o `recoverExpired` legado como autorização automática de execução nesse modo. Reconciliar resultado confirmado e recuperar entrega são operações diferentes de readmitir o corpo.

Uma reserva de **efeito** ainda RESERVED pode ser reatribuída ao mesmo intent/key somente se, depois do fence, a transação provar que nunca houve EFFECT_STARTED e que nenhum writer antigo pode iniciar; emitir fato de recuperação. Sem essa prova, UNKNOWN. Essa exceção comprovadamente não iniciada não se aplica à reserva alheia de **modelo** da0224: esta continua UNKNOWN e não pode ser quitada ou refeita pelo processo novo. Também não se aplica a EFFECT_STARTED, a admission COMMIT desconhecido ainda sem settlement, ou a uma composição com writer legado não contido.

Não há exatamente-uma-vez genérico para efeito externo não transacional. Garantir que um alvo rejeite um processo antigo depois de admissão exige protocolo de fencing/idempotência aceito pelo alvo e prova própria. Para alvos sem isso, conservar UNKNOWN e handoff; a futura prova CQ12 diferencia **perdedor antes da admissão**, que não despacha, de **efeito validamente admitido antes da perda**, que não é apagado nem reexecutado. Não converter essa distinção em dispensa de CQ12 ou redução de paridade.

## 7. Settlement, reconciliação, cancelamento e ACK

`settleEffect` aceita apenas a admissão correspondente e a autoridade atual necessária ao write. Não permitir ao epoch antigo fazer settlement geral porque executou um corpo. Se o owner mudou ou o resultado é incerto, um reconciliador qualificado com autoridade própria e evidência durável pode resolver o fato; a capability antiga, uma string do cliente ou um resultado só em memória não são essa prova. Sem reconciliador qualificado, manter UNCERTAIN/UNKNOWN e handoff. Falha da reconciliação preserva a primeira causa e a obrigação pendente.

Uma saída negativa de ferramenta depois do início não prova ausência de efeito externo: FAILED retry-safe exige evidência nativa de não execução/rollback conhecido; nos demais casos, preservar UNCERTAIN e não repetir automaticamente. O codec1MiB do journal mantém null/tipo/valor e é independente de capture/checkpoint8MiB e contexto32KiB. Não passar novos campos de controle pelo output nem escrever corpo em JSONB incompatível para obter aparente sucesso.

Cancelamento é comando autenticado sobre tenant/execution, independente de o worker estar vivo. Sua transação fecha novas admissões e concorre com conclusão sobre o mesmo execution row. Se conclusão já commitou, cancelamento retorna o terminal existente, sem segundo terminal. Se cancelamento vence, conclusão posterior não publica SUCCEEDED. O pedido admitido tem receipt próprio; não confundi-lo com ACK terminal.

Terminal de cancelamento preserva os fatos anteriores do journal e declara explicitamente os efeitos confirmados ou ainda UNKNOWN; não afirma que todos os corpos foram interrompidos. Settlement posterior só pode atualizar o fato permitido por autoridade de reconciliação qualificada, sem mudar o terminal vencedor nem despachar outro corpo. A exceção especializada de cancelamento bound do owner não vira permissão genérica por analogia.

`commitTerminal` exige bindings, checkpoint/admissões consistentes e o guard/CAS do estado nativo. SUCCEEDED é proibido com obrigação incerta ou checkpoint/accounting não confirmado. Um terminal é persistido uma vez; resposta perdida pode levar à leitura/reentrega identificada desse fato, nunca nova execução. ACK durável só depois do COMMIT conhecido e com as referências de resultado/checkpoint/terminal exigidas pelo contrato. A semântica wire/cursor de entrega permanece na SPEC completa, não nasce do CAS nem deste contrato interno.

## 8. Compatibilidade, privilégios e operação

- Modo legado conserva seus contratos e não recebe aceite do modo novo. Não misturar writers antigos com execuções do novo modo. Isolar schema/principals, parar writers/dispatch antigos, drenar/reconciliar pendências e qualificar o cutover antes de ativar; regra compatível com0225, sem presumir contenção de credencial antiga com SQL arbitrário.
- A expansão será aditiva em tabelas existentes, sem reescrever dados históricos. Sem backfill de autoridade a partir de tags do usuário ou timestamps atuais; rows legadas continuam legadas. Compatibilidade do reader/codec e grants deve ser provada antes da abertura.
- Roles serving non-owner, RLS/tenant bound, sem DDL/desativação de triggers. Guard e preflight reais verificam schema/migration/constraints/grants/modo e durabilidade; divergência recusa a composição, sem fallback memória ou reconnect transparente. Capabilities não substituem confiança na credencial do backend.
- Rollback de app fecha dispatch e preserva as expansões/fatos; um reader antigo não assume execuçãoV2. Falha estrutural exige parar writers e roll-forward, não apagar journal/checkpoint para viabilizar rollback.
- Não importar consumidor `products/shift-assistant` ou adapters de domínio no core. O adapter bound do owner continua uma composição separada, sob seus próprios gates.
- Registrar operação/execução/epoch/worker, motivo de recusa, admissão/settlement, CAS, UNKNOWN e terminal por IDs/digests seguros. Não registrar SQL, credenciais ou corpo sensível. Métricas devem distinguir fence rejeitado, lease perdido, efeito pendente, replay de resultado e chamada nova.

## 9. Plano rejeitável de prova e gate seguinte

O [plano de testes](test-plan.json) contém cenários finitos de processos distintos, barreiras explícitas e known-bad; todos NOT_RUN nesta unidade. Fixture futura sintética: lease10s/heartbeat2s, operação DB2s, processos180s; prazos são guardas do teste, não relógio especial para permitir retomada. PostgreSQL/roles/portas/teardown só em recursos próprios reclamados antes de execução, sem tocar os bancos dos owners.

A prova deve observar dispatch real, journal, checkpoint/CAS, accounting e terminal no mesmo candidato/composição. Dois processos sequenciais ou mocks de lease/journal não provam a corrida. Cobrir ambas as ordens de cancel/conclusão e perda de ACK antes/depois do commit; confirmar que o qualificador rejeita artefato conhecido como errado. Só provider e efeitos sintéticos são controlados pela fixture; stores, coordenação e commits permanecem nativos.

Este contrato tem os critérios documentais EA-D01–07 da [task](task.json), revisão técnica independente e checks T1. **CP04/CP09 não recebem aceite funcional aqui.** O próximo passo é incorporar o desenho à SPEC completa CQ01–14, concretizar schema/exports/transações e integração dos owners, fechar wire/stream/limites e congelar um pacote revisável para o gate aplicável antes de BUILD. Aprovações0231/0221/0225 permanecem resolvidas no seu escopo, sem pedido repetido ou autorização estendida.
