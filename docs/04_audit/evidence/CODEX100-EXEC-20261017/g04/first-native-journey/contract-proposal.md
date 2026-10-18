# G04 — proposta concreta da primeira jornada nativa Codex

Task `DX100-G04:CONCRETIZE-FIRST-NATIVE-JOURNEY-PROPOSAL`, T1. Estado **PROPOSED / NOT_APPROVED / NOT_IMPLEMENTED**. Este documento prepara o contrato para Discovery/PRD/SPEC e decisão aplicável; não registra validação desses gates nem inicia BUILD. G01, G02 e o aceite de reuso G03 permanecem abertos. O alvo integral continua22famílias/49cartões/dezfases/487obrigações funcionais+22controles, incluindo plataformas e serviços; esta é a primeira fatia da sequência, sem redução da meta.

## Resultado e evidência atual

Um integrador deve abrir uma sessão pela superfície pública do harness, solicitar uma operação, receber um READ real sintético, ver WRITE retida, obter decisão pelo approval nativo, retomar, consumir eventos incrementais e reiniciar o processo sem efeito extra ou perda de estado. O caminho deve funcionar sem executável Codex na implementação CVG. A referência fixada só produz o lado de comparação.

O [diagnóstico executado](../../g03/native-delivery-probe/REPORT.md) prova uma lacuna específica: com decisão RESPOND/responseIntent constante, o próximo StepContext contém o resultado real do READ, mas a chamada RESPONSE para compor a resposta não o recebe. Não prova que toda decisão ou todo caminho de resposta perde contexto. Uma decisão com responseText pode terminar sem essa chamada adicional e precisa de caso próprio. O gateway sintético é insumo controlado, não oráculo de paridade ou prova de qualidade de modelo.

O [reuso conferido](../../g03-native-gap-reuse-disposition.json) identifica a correção nativa opt-in complete-tool-v1/RESPONSE na candidata R19 de PAR0224; suas quatro fontes selecionadas conferem com o aceite de memória e diferem do ROOT. O dono canônico continua PAR. Não reimplementar o mesmo mecanismo; não copiar seu aceite de memória para PG/hosts/SDK/default nem adotar a0226 publicada/default adiada pelo usuário. A retomada durável exige os contratos e artefatos canônicos aplicáveis de0221/0225, sem roubar migrations ou inventar um store paralelo.

O SDK atual declara protocolo1 com sdk.hello/session.open/turn.send/session.events, seleciona single_pass e devolve um resultado completo. A factory genérica já suporta seleção iterativa, stepStore e portas nativas; o evento de sessão atual tem sequence e fingerprint. Essas interfaces não demonstram, por si, exclusão de escritores, cursor durável de stream ou retomada entre processos. ModelGateway tem complete; stream incremental real ainda precisa de contrato. Fontes e hashes estão em [task.json](task.json).

## Fronteira proposta de implementação

Propor uma composição SDK versionada e explicitamente selecionada para a nova jornada, consumindo createOperationalHarness/iterative e a correção PAR qualificada. Essa seleção não altera o default de consumidores publicados anteriores nem concede adoção0226. A meta posterior continua qualificar todos os hosts e seus caminhos efetivos; uma composição opcional não encerra K01/D01 nem a paridade.

Tenant, principal, grants, agent/profile e vínculos de execução vêm da composição/transport autenticados. O corpo JSON é dado: não pode definir policy, approval, custo confirmado, ambiente, fence, owner ou autoridade de retomada. IDs apresentados pelo cliente devem ser vinculados à identidade nativa antes de qualquer leitura, escrita ou cancelamento. Descobrir método/ferramenta não concede grant.

O fluxo de aprovação não ganha um mutador alternativo no SDK. O turno retido expõe somente referência/estado permitido; a decisão ocorre na porta institucional já autorizada. Retomar apenas recarrega e valida essa decisão, intenção, composição e fence. Pedido do cliente ou resultado de ferramenta com campo APPROVED não é aprovação.

Para stream, propor uma porta incremental do gateway preservando o caminho complete legado. O kernel continua responsável pelo pedido efetivo após controles, reserva de orçamento, cancelamento/deadline, causalidade, auditoria e um terminal. Texto, fragmentos de argumentos e sugestões de ferramenta são propostas não confiáveis; nenhum frame executa corpo ou concede permissão. Deltas textuais não são resposta final nem confirmação de efeito. Provider sem essa porta deve declarar indisponibilidade para stream real, sem fatiar uma resposta pronta e qualificar isso como incremental.

O contrato deve distinguir frames transitórios do provider, eventos nativos persistidos e entrega ao cliente. O cliente só recebe cursor de evento confirmado. Reconexão lê o log autorizado e não repete modelo/ferramenta. Duplicata de transporte mantém o mesmo evento/sequence; conteúdo diferente com a mesma identidade é conflito. Não emitir ACK durável antes de persistir. Mudança de owner invalida o escritor antigo por fence; não deduzir exclusão apenas de execução em um processo.

Há duas modalidades terminais válidas a qualificar: decisão final com responseText, mantendo proveniência do contexto usado na decisão, e responseIntent com composição final, que precisa receber os resultados completos admitidos. Ambas usam o kernel. O caso de responseIntent não pode desaparecer da matriz por o caminho direto passar.

## Requisitos da jornada

| ID   | Resultado obrigatório                                                               | Evidência que permitirá aceite                                                                                                          |
| ---- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| NJ01 | Superfície pública seleciona a composição nativa e registra identidade/capabilities | Dois clientes neutros, API/worker/SDK conforme o contrato congelado, mesmo executionRef e fingerprints; sem binárioCodex no PATH CVG    |
| NJ02 | READ percorre registry, policy, orçamento e observação nativos                      | Corpo real sintético gera nonce exclusivo, uma invocação e logs/checkpoint vinculados                                                   |
| NJ03 | WRITE fica retida antes do corpo                                                    | Contador de corpo/efeitos zero enquanto PENDING/DENIED; intenção e operationKey nativos preservados                                     |
| NJ04 | Aprovação permite somente a intenção revisada                                       | Mudança de input/profile/capability/tenant/fence torna retomada conflito, sem efeito                                                    |
| NJ05 | Tool results chegam completos a decisão e composição final quando admitidos         | Pedido real na fronteira do modelo contém o nonce/corpo exigido; summary, hash ou preview isolados não bastam                           |
| NJ06 | Respostas por responseText e responseIntent permanecem distintas e corretas         | Casos separados no runtime real; regressão vermelha atual é rejeitada pelo verificador                                                  |
| NJ07 | Stream é incremental e governado                                                    | Primeiro delta observado antes do terminal pelo gateway real sintético/servidor de falhas; negação e orçamento esgotado impedem chamada |
| NJ08 | Replay/cursor têm identidade, ordem e durabilidade                                  | Evento confirmado seguido de leitura em processo novo; cursor estrangeiro/adulterado recusado; duplicata sem corpo extra                |
| NJ09 | Cancelamento compete com conclusão em ponto definido                                | Ordem de commits observada decide um terminal; cancelamento após efeito conserva efeito/journal, sem fabricar rollback                  |
| NJ10 | Retomada entre processos não depende de memória do processo anterior                | ProcessoA encerrado; processoB usa stores/journal/fences nativos reais e reconstitui estado, eventos e accounting                       |
| NJ11 | WRITE confirmada nunca se repete por falta de resposta/ACK                          | Falha injetada após confirmação; contador durável permanece1 em restart/retry; estado incerto preserva causa e handoff                  |
| NJ12 | Concorrência não transfere autoridade a escritor antigo                             | Dois processos reais disputam execução; fence antigo falha em persistir/dispatch e não repete efeito                                    |
| NJ13 | O comparador identifica comportamento conhecido como errado                         | Resultado sem nonce, evento perdido/trocado, efeito extra, cursor de outrotenant e erro normalizado indevidamente são rejeitados        |
| NJ14 | Referência e candidata têm procedência e versões explícitas                         | Fonte8d9f6466,ELF/SDK/config/fixture/toolchain e candidata CVG hash-bound; skips/UNKNOWN/acesso ausente não produzem PASS               |

Os resultados NJ01–14 são **NOT_RUN** para esta proposta. O diagnóstico atual observa apenas um ramo de NJ02/NJ05/NJ06 e não concede seus aceites integrais. Reinício em memória não substitui NJ10–12. O primeiro SDK compatível não elimina os demais requisitos de D01/D02/A01 e do catálogo.

## Matriz inicial de estímulos e rejeitadores

1. Abrir sessão sintética, READ cujo nonce nasce no corpo, decidir novamente e compor via responseIntent. Inspecionar pedido real de composição, eventos e resultado; nenhum nonce no input inicial ou decisões fixas.
2. Repetir a jornada pelo ramo responseText, com decisão produzida a partir do contexto real. Não exigir uma chamada RESPONSE inexistente nem usar esse caso para dispensar o anterior.
3. READ com resultado JSON/string/Unicode/NUL/limite/excesso/inválido. Preservar o domínio completo autorizado pela dependência PAR; indisponibilidade é explícita, sem truncamento silencioso ou repetição do corpo.
4. Propor WRITE; interromper antes da decisão humana. Corpo zero. DENIED continua zero; PENDING não pode se tornar sucesso por timeout.
5. Aprovar a intenção exata pela porta nativa e retomar. Corpo/efeito uma vez. Alterar qualquer campo de intenção ou composição antes de retomar deve falhar antes do corpo.
6. Capturar primeiro delta antes de liberar o terminal no provider sintético. Comparar pedido e eventos reais de referência/CVG; um array de chunks criado depois de complete não satisfaz esse caso.
7. Stream com cliente lento, desconexão e reconnect pelo último cursor confirmado. Não executar novamente modelo/ferramenta para reconstruir a entrega. Buffer/pressão têm limite e resultado definido antes dos testes.
8. Provider emite erro sem cancelamento; provider fica pendente sem emitir erro até deadline; caller cancela antes do terminal. Três casos independentes, com primeira causa preservada.
9. Cancelamento e conclusão em duas ordens de commit; dois terminais, evento terminal perdido ou resposta depois de cancelamento vencedor devem reprovar.
10. Encerrar processoA depois de journal CONFIRMED e antes de entregar resposta/ACK; processoB retoma. Contador de efeito durável permanece1; recuperar conversa não apaga fato de efeito.
11. Falha de persistência após início de efeito e antes de confirmação. UNKNOWN/UNCERTAIN não vira sucesso ou autorização de retry automático; preservar a primeira causa, referência e handoff.
12. Dois processos/mesmo executionRef, perda de lease e escritor antigo. Portas reais de ownership/fence, sem mutex de fixture usado como prova de exclusão distribuída.
13. Tenant/principal/execução/cursor/approvalRef estrangeiros, malformados ou alterados. Nenhuma exposição parcial de evento/resultado/efeito antes da recusa.
14. Adulterar uma propriedade observável por vez: nonce ausente, efeito extra, evento removido/duplicado, sequence reordenada, erro substituído. O comparador precisa rejeitar cada artefato adulterado antes de confiar em verdes reais.

Todas as fixtures são sintéticas. Um servidor de falhas controla os insumos do provider e as falhas de transporte; as saídas da referência devem vir do código real, não de mock que fabrica respostas esperadas. Normalizações limitam-se a campos declarados e não podem apagar erro, evento, chamada, efeito, confiança, identidade ou ordem relevante. Referência em falta continua NOT_RUN.

## Decisões que ainda precisam ser fechadas no contrato canônico

| ID   | Decisão necessária antes de código dependente                                 | Encaminhamento concreto e autoridade                                                                                                                              |
| ---- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ND01 | Vincular ELF e configuração da referência ao pin                              | G02: concluir o mesmo job e atestar artefato; depois contrato separado de sondas keyless/fixtures. CLI não qualifica automaticamente outros binários/plataformas  |
| ND02 | Fatia PAR0224 que será integrada e como será requalificada                    | G03: manter dono do mecanismo, source bindings e exclusões; não transferir aceite de memória nem autorização de default0226                                       |
| ND03 | Porta durável de owner/fence/checkpoint/journal e semântica de claim          | Reconciliar os contratos canônicos0221/0225/0030 antes de escolher adapter ou DDL; não inventar um store alternativo por conveniência                             |
| ND04 | Nome/versão e envelopes públicos da composição SDK e dos eventos incrementais | G04/SPEC futuraT3: tipos, compatibilidade e capability negotiation exatos; SDKv1/fingerprints/consumidores precisam de prova própria                              |
| ND05 | Ponto de linearização de terminal/cancelamento e ACK                          | Definir a transação/CAS nativa e falhas de persistência com o owner canônico; log em memória não concede durabilidade                                             |
| ND06 | Limites de frame/evento/buffer/replay e admission por bytes/tokens            | Congelar unidades, política de overflow/backpressure e accounting antes de executar carga; não confundir tamanho de texto com janela do provider                  |
| ND07 | Submatriz de referência funcional/serviço/plataforma                          | G02/G04: primeiro fixture local real/keyless; acessos externos/plataformas mantêm seus gatesT4 e owners, sem removê-los do escopo                                 |
| ND08 | Validação de Discovery/PRD/SPEC e gate de BUILD da fatia                      | Esta proposta não os substitui. Levar um pacote concreto revisado ao gate aplicável; não pedir aprovação de SPEC ainda inexistente ou dessas decisões incompletas |

Essas pendências são decisões de desenho/integração, não autorização para o builder escolher silenciosamente. Enquanto abertas, esta proposta melhora o WHAT e os aceites e não se apresenta como SPEC pronta para aprovaçãoT3. Trabalho independente de referência e reuso pode continuar.

## Ordem e critério de saída desta preparação

Concluir a procedência executável G02, reconciliar a fatia técnica G03 e então derivar o pacote canônico de G04 com nomes/tipos/transações/limites decididos e revisão independente. Antes de BUILD, task registrada, SPEC exata e revisão humana aplicável; depois gates Node22, testes de runtime/PG/E2E pertinentes e crítica da candidata, com claims próprios. Nenhuma certificação global ou produção decorre deste documento.

Artefatos esperados da primeira jornada: contratos e adapters nativos integrados; driver Codex separado; fixtures/servidor de falhas compartilhados qualificados para o uso Codex; transcripts e registros de estado/efeitos; recibos atuais por capacidade/variante; fontes e candidata identificadas; revisão independente e pendências explícitas. Todos os demais cartões do0386 continuam obrigatórios, sem média de percentuais PAR/Claude/Codex e sem função concluída por contagem de documentos ou código.
