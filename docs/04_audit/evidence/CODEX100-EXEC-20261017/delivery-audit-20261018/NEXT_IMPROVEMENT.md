# Próxima melhoria: autoridade genérica de execução

Prioridade **P0 antes do BUILD da jornada nativa**, vinculada aos gaps existentes **CP04 e CP09**, dentro de DX100-G04. Não acrescenta cartão ao programa nem muda os 14 aceites da jornada. A próxima unidade é de SPEC: `DX100-G04:SPECIFY-EXECUTION-AUTHORITY`. Seu resultado será incorporado à SPEC completa CQ01–14.

O objetivo é definir como o harness comprova que um processo ainda pode iniciar um efeito, gravar seu resultado e concluir uma execução depois de falha, retomada ou disputa por ownership. Evitar que a aplicação trate CAS de checkpoint, posse da sessão ou attempt do journal como autorização suficiente de worker.

## O que a inspeção atual demonstra

As [oito fontes capturadas](next-improvement-source.json) e os [nove trechos exatos](next-improvement-spans.json) fundamentam esta seleção; não foi executado teste de corrida nem demonstrado bypass em runtime.

- `OperationalExecutionWorker` passa o attempt ao claim/transition/heartbeat e à transição final. O heartbeat captura uma falha e a sinaliza depois da execução do harness; esse trecho não demonstra propagação de perda de lease como abort ou guarda durável em cada dispatch (NI01).
- O worker neutro compõe `PostgresOperationalEffectJournal` e `PostgresExecutionStepStore` sem um objeto de fence de execução (NI02). Os adapters atuais lidos têm controles de tentativa, estado e integridade, com fronteiras próprias; isso não prova uma autoridade comum de execução em todos os writes (NI03/NI04).
- O kernel oferece a costura `effects.started/finished` e revalidação antes do corpo (NI05/NI06). A existência dessas portas não comprova sua ligação a um lease durável; devem ser reconciliadas com a autoridade de execução efetiva.
- A SPEC0224 limita explicitamente o CAS standalone a estado/orçamento, preserva reserva alheia pendente como UNKNOWN e exige gate para compartilhar execução ou misturar versões (NI08).
- O [mapa anterior](../g04/persistence-port-decision/DECISION.md) já distingue o fence bound específico de ferramenta do caminho genérico e mantém epoch/worker UNKNOWN em CP09. Os guards históricos do owner não são automaticamente exports ou implementação elegível no Root.

São fatos de fonte e limitações da prova. Não se afirma ausência de todos os mecanismos de ownership no sistema, nem defeito novo no qualificador0231. A reconciliação seguinte deve aproveitar os controles existentes e localizar seu ponto exato de composição.

## Por que esta melhoria vem primeiro

| Candidata                                         | Impacto e dependência                                                                                          | Encaminhamento                                                                             |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Autoridade/fence genérico, CP04/CP09              | Condiciona CQ09/10/11/12, settlement e retomada; precisa ser resolvida antes de admitir processos concorrentes | Próxima unidade T1, owner integrador Codex com PAR                                         |
| Stream incremental e reconexão, CP05/CP06         | Essencial a CQ06/07; depende de semântica de cancelamento, terminal, ownership e persistência da composição    | Manter na SPEC completa; não trocar por polling nem dispensar prova incremental            |
| Sessão0031 e journal0030, CP01/CP02               | Dependências dos owners já em desenho/BUILD próprios                                                           | Acompanhar manifests, gates e compatibilidade; não iniciar implementação paralela          |
| Ampliar o qualificador ou executar mais variantes | O mecanismo já passou539testes atuais; ainda não há jornada nativa completa para qualificar                    | Manter os aceites existentes; não consumir tempo com novos controles sem hipótese concreta |

Essa ordem prioriza integridade e recuperabilidade. Não é estimativa de capacidade ou desempenho; custos de implementação ainda dependem da SPEC.

## Task concreta para a próxima rodada

**O que:** reconciliar e especificar a autoridade de execução para standalone e worker/bound, sem criar terceiro journal/store ou habilitar a rota published0226.

**Onde:** contratos e fontes canônicos dos owners, `execution-spine.ts`, composição neutra do worker, kernel `effects`, adapters operacionais e checkpoint. O resultado deve ficar em artefato de SPEC próprio sob o programa Codex; paths de código e eventual API são definidos e reclamados somente depois do gate aplicável.

**Como:** seguir o caminho claim→RUNNING→heartbeat→admissão do efeito→journal/checkpoint→terminal e identificar, para cada etapa, tenant, execução, composição, tentativa, worker, validade e transação. Comparar a implementação atual com os guards qualificados dos owners, marcando CURRENT, PROPOSED e UNKNOWN. Escolher a menor costura que preserve os contratos e os limites já aprovados.

**Critério de pronto da SPEC:**

1. Matriz por caminho standalone, worker genérico e bound: fontes/exports/manifests elegíveis, owner e limites de autoridade; CAS e advisory lock não concedem lease/ACK externo.
2. Contrato explícito para perda de lease, epoch/owner quando aplicável, validação antes do corpo e vínculo de journal/checkpoint/terminal ao mesmo contexto autorizado. Definir as fronteiras reais de transação e seus intervalos de falha.
3. Semântica para cancelamento e conclusão nas duas ordens de commit, preservando o efeito confirmado, a primeira causa, accounting e ACK durável. Reserva alheia pendente continua UNKNOWN; ausência de prova não permite retry.
4. Plano de prova com processos simultâneos e barreiras: A perde ownership, B assume, A tenta dispatch/write/settlement stale; observar corpos, journal, checkpoint, terminal e accounting. Teste futuro distingue perda de resposta de efeito repetido.
5. Compatibilidade, exclusividade de writer, versões mistas e reabertura de sessão definidas; nenhum componente WIP ou certificado de outra composição é tratado como qualificado.
6. Integração dos resultados à SPEC CQ01–14, revisão técnica e gate humano T3 do contrato concreto antes de implementação. A aprovação0231 e os ajustes0221/0225 permanecem resolvidos, sem novo pedido para esses mesmos assuntos.

O pronto desta próxima unidade será **contrato técnico revisável**, com prova runtime ainda NOT_RUN. Não significa que a jornada foi implementada ou que CP04/CP09 receberam aceite funcional.
