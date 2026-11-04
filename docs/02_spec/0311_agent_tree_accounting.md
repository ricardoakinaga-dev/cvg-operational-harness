# SPEC0311 — anexo de accounting por árvore (SC-L02)

Proposta T3, elaboração documental T1. Task `CODEX-INCORPORATION:SUPERVISOR-ACCOUNTING-SCL02`, recortes KR07/KR08 e cartões DX100-O01/PAR-O01/PAR-O02. **AUTHOR_DRAFT — algoritmo proposto, sem BUILD ou aceite**. Este anexo integra a [SPEC0311](0311_agent_supervisor_tree_budget.md); não substitui os pontos SC-L01, SC-L03 ou SC-L04. O resultado da revisão técnica e a futura revisão humana vinculam bytes exatos.

## 1. Reconciliação com o código e decisão proposta

As [sete fontes pinadas](../04_audit/evidence/CODEX-INCORPORATION-20261101/supervisor-accounting/source-inputs.json) pertencem a `4f86d71a4b5184e3d54a2a17e5cf5c51bd23d993`. O `TokenMeter` mede uso por turno e distingue `unreported`; o `BudgetGuard` mantém estimativas por request/session/tenant/agent/day em um store síncrono e conserva sobrecusto, sem refunds. Os contratos de loop usam `number`, tokens de entrada/saída e `costUsd`; esses formatos não provam reserva durável por árvore ou soma monetária exata. A pesquisa é de fontes selecionadas, não prova de ausência de todo mecanismo no repositório.

A proposta é manter esses controles locais e acrescentar uma autoridade de orçamento da árvore na admissão canônica. A chamada precisa passar por ambos; uma recusa local não autoriza bypass do agregado. Nenhum store local é promovido a banco transacional por trocar a implementação da interface síncrona. Nenhuma nova API, tabela, migration ou porta deste anexo está implementada.

Alternativas consideradas: somar counters após execução detecta excesso tarde; saldo independente por filho multiplica o orçamento; reserva global sem envelopes não limita o delegado; transações de banco abertas durante inferência retêm locks e não tornam a chamada externa atômica. A escolha é uma partição hierárquica durável, com transições curtas e serializáveis por árvore. O custo assumido é contenção por raiz. Sharding ou maior concorrência exigirão outra prova, sem alterar as invariantes.

## 2. Quantidades, preço e tempo

O vetor de limite e alocação tem dimensões de `steps`, `modelAttempts`, `toolAttempts`, `knowledgeCalls`, `verificationCalls`, `replans`, `decisionRepairs`, `totalTokens`, `costNanoUsd` e `activeDurationMs`. Toda dimensão existe, inclusive se o limite for zero; não há infinito implícito. Um perfil pode impor limites adicionais mais baixos. `modelAttempts` e `toolAttempts` contam admissões de tentativa, não inferências ou efeitos externamente comprovados.

Valores de configuração, alocação e reserva são inteiros não negativos até `2^63−1`, serializados como strings decimais canônicas: `0` ou dígito de1 a9 seguido por dígitos, sem sinal, expoente ou zeros à esquerda. A aritmética intermediária e os agregados de consumo usam inteiros arbitrários; nunca `number`, saturação ou wrap. O adapter não recusa persistir consumo observado apenas porque ele excedeu o limite configurado. O domínio de framing e os limites físicos dos registros continuam em SC-L03; entrada reportada que exceda o domínio representável não vira zero, mantém a evidência e bloqueia admissões com accounting incerto.

Tokens de entrada e saída medidos ficam separados na evidência; a dimensão limitada é sua soma exata. Não adicionar essa soma novamente como um terceiro consumo. Estimativa de contexto não é medição nem upper bound qualificado. Reservas de tokens exigem bound qualificado para a tentativa e para a entrada congelada; onde só houver estimativa, a integração continua não qualificada.

`costNanoUsd` é uma unidade de débito conservador do orçamento interno: `10^-9 USD`. O host fixa versão/digest de preço e perfil por tentativa. Preços são racionais decimais exatos por token; calcular a soma racional de entrada e saída e arredondar para cima uma única vez por tentativa. Guardar também essa soma racional, os tokens e a versão de preço. O arredondamento não é apresentado como cobrança financeira medida. O `costUsd:number` legado é projeção e não fonte exata para esta nova autoridade. Sem preço e bound qualificados, não afirmar garantia de custo; segurar reserva e recusar nova admissão dependente desse fato. Nenhuma conversão cambial, pagamento ou teto imposto fisicamente ao provider é autorizado aqui.

Consumo monetário reportado pelo provider, quando existir, é evidência distinta do débito calculado. Um overrun de tokens, débito ou cobrança reportada é conservado; não truncar o valor para caber na reserva. Uma divergência de preço/unidade não é reparada escolhendo o menor número. Sua reconciliação precisa do port qualificado e de um fato autorizado, com histórico preservado.

`activeDurationMs` soma intervalos de processamento atribuídos às tentativas, com a atribuição persistida que impede debitá-los também como tempo do pai aguardando o filho. Intervalos concorrentes de tentativas distintas são somados. O relógio monotônico local mede intervalo; a identidade da tentativa evita somar o mesmo intervalo após restart. Se não houver término conhecido, reter a reserva de duração. A duração máxima de parede da árvore é outro controle: `expiresAt`, fixado pela autoridade confiável antes da raiz e nunca estendido em resume. Sua fonte de tempo e integração transacional são SC-L01; não usar timestamp livre do cliente.

## 3. Partição e invariantes

Para cada nó `n` e dimensão `d`:

- `A(n,d)`: envelope delegado ao nó, que inclui consumo e obrigações de toda a sua subárvore; para a raiz é o limite fixado pelo host.
- `X(n,d)`: consumo confirmado diretamente atribuível ao nó, excluindo o consumo dos filhos.
- `R(n,d)`: soma dos saldos ainda retidos das reservas diretas do nó, incluindo uso desconhecido e despacho incerto.
- `children(n)`: filhos aceitos e persistidos, inclusive os fechados cujos gastos permanecem na vida da árvore.
- `F(n,d) = A(n,d) − X(n,d) − R(n,d) − Σ A(c,d)`, para `c` em `children(n)`.

Antes de qualquer nova admissão ou delegação, `F(n,d) ≥ 0` em todos os nós afetados e em todas as dimensões. Os envelopes filhos particionam o envelope do pai; não são somados novamente como gasto. O consumo conhecido da árvore é `Σ X(n,d)`, não `Σ A(n,d)`. A leitura de totais é uma projeção da mesma autoridade, não outro ledger de verdade.

O limite da raiz nunca aumenta por devolução, restart, retry, fechamento ou criação de netos. A delegação diminui o saldo livre do pai exatamente pelo envelope entregue ao filho. Um nó não pode emprestar saldo reservado a outro nó ou compensar excesso de uma dimensão com saldo de outra.

Um overrun pode tornar `F` negativo: preservar o número real, registrar `OVERDRAWN` e bloquear novas admissões em toda a árvore na mesma transição. Não rejeitar a gravação do consumo real para manter uma constraint artificial de `consumo ≤ limite`. Mesmo após uma devolução que recomponha saldo, o estado de stop permanece sticky; retomada exige reconciliação autorizada, fora da liquidação automática.

## 4. Reserva e despacho de tentativa

Cada reserva tem identidade imutável `(tenant, tree, node, execution, epoch, callId, attemptOrdinal, kind)`. `kind` distingue provider principal, retry, fallback, compactação, tool, knowledge e verificação. O host gera ou deriva esses valores dos fatos canônicos; JSON de cliente não cria autoridade. Não reutilizar uma identidade em uma nova tentativa externa.

1. Capturar request, digest, limites locais, perfil/preço/bounds e vínculo atual de autoridade antes de reservar. Revalidar autoridade, deadline, stop e orçamento dentro da transição transacional.
2. Criar `PREPARED` e reter o vetor `r` em `R(n)`, somente se todas as dimensões couberem em `F(n)`. Reserva duplicada com mesmo digest retorna o mesmo registro; digest diferente dá conflito sem novo saldo. O registro e a retenção compartilham o commit.
3. Antes de permitir o corpo, mudar atomicamente para `DISPATCH_AUTHORIZED`, ligando a reserva à admissão canônica. Consumir uma unidade da dimensão de tentativa, retirando essa unidade de `R` e adicionando a `X`. Essa unidade conta a admissão mesmo se o processo cair antes de enviar bytes. Tokens/custo/duração ainda não medidos permanecem reservados.
4. Executar fora da transação. O guard de entrada do corpo precisa rejeitar epoch antigo e autoridade revogada. O vínculo com esse guard e o writer de execução continua obrigatório em SC-L01; uma checagem só no chamador não satisfaz o contrato.
5. Depois de autorizar despacho, perda de processo, resposta ou COMMIT não prova que o corpo deixou de executar. Marcar `DISPATCH_UNKNOWN` quando o conhecimento for insuficiente. Não abrir nova tentativa, devolver reserva ou declarar execução física única por causa do receipt.

Falha comprovada antes de autorização do despacho pode cancelar `PREPARED` e devolver o vetor inteiro. Depois de autorização, somente evidência qualificada de que nenhum trabalho externo começou pode liquidar tokens/custo/duração como zero; a unidade de admissão continua consumida. Uma recusa do driver ou timeout local, sem essa evidência, não constitui tal prova.

Cada retry, fallback e compactação tem sua própria reserva antes do corpo. Qualquer caminho auxiliar que ignore esta autoridade reprova ST05/ST12, mesmo se o loop principal estiver correto. Esta proposta muda a admissão das tentativas e precisa de contrato/qualificação dos callers; não é garantia já disponível no `BudgetGuard` atual.

## 5. Uso parcial, final, desconhecido e idempotência

Eventos de uso pertencem à reserva e têm ordinal monotônico, digest e indicação explícita de parcial ou final. Guardar a evidência de origem. Mesmo ordinal/digest é idempotente; ordinal igual com digest diferente é conflito. Atualizações antigas não fazem o total recuar. A semântica cumulativa ou incremental do provider deve ser normalizada por seu adapter qualificado; não deduzir isso do número recebido.

Para cada dimensão, `q` é o consumo cumulativo confirmado da tentativa. Ao aceitar um novo fato, adicionar a `X(n)` somente `q_novo − q_anterior`. Em uso parcial, manter saldo retido `max(r_original − q_novo, 0)`. Portanto, uso parcial dentro do bound mantém `q + reserva_retida = r_original`; não há crédito liberado pela mera chegada de um chunk. Se `q > r_original`, preservar `q`, reter zero nessa dimensão e registrar overrun/stop. Se a dimensão ainda não foi medida, seu saldo original continua retido.

Uso `unreported` não é final medido com zeros. Pode haver final conhecido para uma dimensão e desconhecido para outra; o registro contém esse estado por dimensão. Uma dimensão só devolve seu excedente reservado depois de fato final qualificado que exclua consumo adicional daquela tentativa. Terminal de execução, receipt de entrega, fim de observação e cancelamento solicitado não substituem esse fato. Reservas incertas não expiram para o saldo livre.

Na liquidação final conhecida, transferir apenas o delta ainda não confirmado para `X` e remover o saldo retido da dimensão. O resíduo não consumido volta a `F(n)`, sem crédito adicional em `A(n)`. A mesma transação persiste o fato de liquidação; repetir o mesmo fato não repete débito ou refund. Finais conflitantes são conservados como evidências e bloqueiam admissão; não sobrescrever silenciosamente o primeiro.

Erro por conflito não descarta consumo comprovadamente maior que o já registrado. Reter a obrigação conservadora e marcar accounting incerto/overdraw conforme os fatos. A reconciliação de uma medição corrigida é uma operação autorizada, append-only e separada; não aceitar redução arbitrária de `X` pelo provider ou cliente.

## 6. Spawn, devolução e recursos vivos

Spawn exige, no mesmo commit qualificado: deduplicação, alocação do envelope do filho, contabilização de slots, vínculo de sessão/nó e enqueue. Este anexo não atribui essa atomicidade a `createThread`0239. Sua obtenção é SC-L01. Se o COMMIT ficar desconhecido, consultar por key/digest na mesma autoridade; não reenviar criação cegamente. Enquanto não houver disposição autorizada, conservar a obrigação e a incerteza.

O pedido de envelope é uma redução limitada pelo host e precisa caber em `F(pai)` em todas as dimensões. Um neto recebe parte de `F(filho)`, nunca um novo limite da raiz. Dois processos que disputem o último saldo ou slot precisam ser serializados pela mesma autoridade; memória de processo, check-then-increment e mutex de um único host não satisfazem essa condição.

Devolver envelope do filho é reduzir `A(filho)` por `v`, nunca adicionar `v` ao limite da raiz ou subtrair gasto confirmado. Exigir `0 ≤ v ≤ F(filho)` e prova transacional de que o valor não está reservado ou prometido. A redução não invalida reservas existentes. Depois de fechado e realmente quiescente, um filho sem reservas pode devolver todo o saldo livre: seu envelope remanescente contém o gasto conhecido e os envelopes retidos de descendentes. O gasto permanece contabilizado depois do fechamento e não desaparece ao arquivar o nó.

Não devolver saldo de nó `CLOSING`, `UNCERTAIN`, com accounting conflitante ou com aquisição/trabalho original ainda não assentado. Um filho ocioso pode reduzir seu envelope somente pelo saldo comprovadamente livre e sob o mesmo fence; a operação não fecha o filho nem libera automaticamente slots. Arquivamento depende de tombstone/rollup qualificado que conserve IDs, dedup, consumo e obrigações; sem isso, conservar os registros originais.

Slots são contadores distintos dos vetores de gasto: raiz conta como um nó vivo e um nó total; profundidade da raiz é zero; fanout conta filhos diretos vivos; `maxConcurrentExecutions` conta execuções admitidas, incluindo a raiz. Aceite de um filho incrementa o total de nós para toda a vida da árvore. Fechar não devolve esse total, nem permite reusar seu ID. Nó reservado/aceito mas ainda não publicado continua ocupando seu slot.

Permit de execução e slot vivo só são liberados após assentamento real das aquisições e produtores correspondentes. `WAITING_APPROVAL` ou idle só libera permit quando o checkpoint e a quiescência comprovam ausência de trabalho ativo. `CLOSING`/`UNCERTAIN` não liberam por prazo, receipt ou promise de corrida. Limites de profundidade/fanout/nós/simultaneidade e seus domínios físicos ainda precisam do DTO fechado em SC-L03.

## 7. Fronteira transacional e recuperação

Toda transição de orçamento precisa ser linearizável no agregado da árvore e atomicamente ligada aos fatos canônicos que autoriza. O desenho mínimo propõe um guard durável da raiz e locks ordenados da linhagem, sem rede externa ou espera de consumidor dentro da transação. **Não está definido aqui um helper existente ou uma ordem global já compatível com K03b/0239/0302.** SC-L01 deve fechar essa ordem, o writer/epoch já possuído pelos callers, os CAS/constraints físicos e os schedules de deadlock. O algoritmo matemático não autoriza iniciar o adapter antes desse fechamento.

Revalidar tenant, caller, epoch, linhagem, deadline, grants e estado depois de obter os locks. Caso qualquer escrita do mesmo domínio possa ocorrer sem o guard, a integração reprova. Fences de árvore e de execução têm fatos canônicos distintos; um não é convertido no outro por igualdade de número.

Perda de COMMIT deixa conhecimento incerto, não saldo disponível. Reconsulta autorizada usa identidade/digest no store primário e versão atual. Mesmo registro confirmado retorna o fato existente; ausência conclusiva só autoriza outra transição depois de provar que a transação anterior não pode mais commitar. Timeout, réplica atrasada ou uma leitura vazia não são essa prova.

Restart relê envelopes, consumo, reservas, dedup e stops antes de admitir trabalho. Não reconstruir saldo de logs incompletos nem zerar tentativas do epoch anterior. Recuperar uma execução por outro processo exige a autoridade nativa qualificada e a disposição do trabalho anterior; lease vencida não prova quiescência ou ausência de efeito. A restrição posterior do recibo17 e o gate de `originalReturns` continuam vigentes.

## 8. Exemplos aritméticos e provas requeridas

Exemplo de uma dimensão: raiz com `A=100`, `X=10`, `R=20` e filho com envelope40 tem saldo livre30. O filho gasta12 e, após liquidação e quiescência de sua subárvore, devolve28: seu envelope passa a12; o saldo livre da raiz passa a58, enquanto o consumo conhecido da árvore é22. Não somar os40 delegados aos22 consumidos. Se uma reserva direta20 receber uso parcial7, ficam13 retidos; se o final for9, devolvem-se11. Se o final for25, o consumo25 é preservado, há overrun5 contra a reserva e o stop bloqueia novas admissões, mesmo que a raiz ainda tenha outro saldo livre.

Esses exemplos explicam a proposta; não são execução do programa ou teste de aceitação. As provas abaixo são **NOT_RUN**, complementam ST04–ST06/ST10–ST12 e não criam denominador de paridade.

| Caso | Observação positiva exigida                                                   | Controle que deve reprovar                                        |
| ---- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| AC01 | Dois processos disputam último saldo e slot, apenas um commit de aceite       | Check e débito separados admitem ambos                            |
| AC02 | Raiz, filho e neto consomem uma única partição, por dimensão                  | Somar delegação como gasto ou dar novo saldo ao neto              |
| AC03 | Mesmo reserve/final/refund repetido devolve o mesmo fato                      | Duplicar débito, consumo parcial ou devolução                     |
| AC04 | Uso parcial mantém obrigação e uso final conhecido devolve só o excedente     | Chunk, timeout ou unreported vira crédito livre                   |
| AC05 | Overrun real e conflito ficam persistidos e stop é sticky na árvore           | Clamp, rollback da medição maior ou retomada automática           |
| AC06 | COMMIT incerto permanece retido até disposição canônica conclusiva            | Leitura vazia/timeout inicia outro corpo ou spawn                 |
| AC07 | Retry, fallback, compactação e tools usam tentativas distintas antes do corpo | Caminho auxiliar chega ao provider sem reserva                    |
| AC08 | Restart/recovery conserva gastos, obrigações e dedup de epoch antigo          | Reset de saldo, lease vencida ou ID reutilizado amplia capacidade |
| AC09 | Fechamento quiescente devolve apenas saldo livre e conserva consumo           | Close pending/unknown ou arquivo removido libera slots e gasto    |
| AC10 | Tokens/racionais/preço e totais grandes são exatos sem double counting        | Float, overflow, expoente ou arredondamento para baixo cria saldo |
| AC11 | Prazos e tempo ativo mantêm atribuição após locks/restart/concorrência        | Tempo do filho é contado também como espera ativa do pai          |
| AC12 | Todas as admissões compartilham autoridade/guard, com lock schedules reais    | Outro host, writer antigo ou inversão de locks contorna a reserva |

## 9. Estado e próxima fronteira

Este documento define uma proposta verificável para SC-L02. Nenhum caso AC/ST foi executado, nenhum consumo real foi provocado e nenhum contrato público foi adotado. Integração e prova transacional SC-L01, DTOs/limites SC-L03, owner/quiescência SC-L04 e qualificação dos bounds/provider continuam abertos. A revisão técnica deste anexo pode julgar sua consistência; não concede aprovação da SPEC0311 completa, gate humano, BUILD, paridade ou produção.
