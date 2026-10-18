# Crítica independente R1 — SPEC0239

**REVISE — mandatory_count: 5 (4 P1, 1 P2).** O desenho tem uma arquitetura integrada plausível, mas ainda não é um contrato de engenharia completo para a primeira jornada. Há decisões materiais de transformação e de prova deixadas ao implementador. Este parecer julga desenho documental; não exige runtime concluído e não concede BUILD, aprovação humana, crédito CQ ou mudança de estado do programa.

Sujeito: [SPEC0239](../../../../../../02_spec/0239_codex_native_journey.md), doravante **S**. Os números de linha abaixo são dos bytes congelados, não de uma revisão futura. **N** é o diretório pai deste review. Fontes R/A/W são cópias em `N/inputs`; fontes Sxx estão em `N/wire-scout/sources`. Seus caminhos originais estão nos manifests autenticados. [review.json](review.json) traz referências estruturadas com intervalos inclusivos.

Um crítico, nenhum descendente, 18 verificações substantivas, R1 deste orçamento novo. Nenhuma unidade anterior foi reaberta. Escrita restrita a este review. A skill engineering-framework orientou a suficiência de contratos/evidências, sem introduzir gates adicionais.

## Identidade e integridade

- Freeze recebido: `e6c032c546360fd32d68f0467b92041ce0577f63bfec211966e2a069be52c26d`, 105/105 arquivos exatos na entrada e na saída.
- Task SHA-256: `85ba841d758f4f8f70e858a4d6698d96b97b8281ac921c5052313e28f627b61b`.
- **Primeiro SHA do sujeito:** `4f35d44a2f39a5932453b305a197256d88b40bb687ecdb5da61e9890702b4b7d`.
- **Último SHA do sujeito:** `4f35d44a2f39a5932453b305a197256d88b40bb687ecdb5da61e9890702b4b7d`.
- 52 arquivos primários e 32 snapshots do scout autenticados; 32 excertos primários e 60 ranges do scout conferem nos arquivos arquivados. S02 foi autenticado pelo SHA inicial do snapshot. Seu path vivo de coordenação é concorrente e não foi declarado imutável.
- SPEC0231 foi consultada como contrato normativo suplementar do qualificador: SHA `e3af1f7f421e45f430d57c25702cae2aeed6bc248f12e053c066040cc5aee4af`, separado do freeze105 e conferido novamente na saída. Não houve rehash dos 2184 payloads anteriores.

[Inventário inicial](first-hash-inventory.json), [inventário final](last-hash-inventory.json), [checks documentais](static-checks.json) e [manifesto](manifest.json). Contagens e hashes comprovam integridade documental; não comprovam a viabilidade dos schedules.

## Achados obrigatórios

### R1-01 — P1 — Falta o contrato executável de tradução harness → gateway → provider

**Critérios:** FN01/FN03/FN07; CQ02/CQ03/CQ06/CQ08/CQ11. **Evidência:** S:19–29, 119–125, 139–145, 179–184; [R01](../inputs/R01.source.txt):256–291; [R28](../inputs/R28.source.txt):17–65, 76–109, 130–149; [R13](../inputs/R13.source.txt):475–526; [R29](../inputs/R29.source.txt):443–450; [A03](../inputs/A03.source.txt):261–279, 291–313.

S:141 exige uma transformação canônica, limitada e hash-bound, mas não define essa transformação nem o adapter que a possui. ModelRequest admite role `tool` e contexto separado; ModelInput aceita somente system/user/assistant, 64 mensagens e 32000 caracteres por mensagem. GenerateRequest exige tenant/request/prompt/profile e outros bindings ausentes do ModelRequest. ModelResult concreto tem `output.text`, `usage` e `providerId`; o port do harness tem `text`, contagens planas e `provider`. O retorno de `generateStream`/`executeStream` também não tem união especificada; só o stream do port do harness tem.

**Contraexemplo:** 32001 caracteres ASCII cabem nos 64KiB anunciados em S:179, mas falham tanto no normalizador atual de ExecutionSubmission quanto em uma única ModelMessage concreta. A observação obrigatória de contexto também pode ultrapassar o limite de uma mensagem após wrappers. Reusar o parser atual de saída ainda pode truncar silenciosamente o texto a 32000 caracteres. Não há escolha congelada entre expandir contratos, representar em várias mensagens de modo fiel ou recusar na fronteira de admissão.

**Impacto:** o implementador precisa inventar representação, identidade de prompt, limites efetivos e local da contagem. Isso pode perder o resultado READ, contar um pedido diferente do transmitido, truncar resposta ou qualificar somente um pequeno nonce fácil.

**Correção mínima:** declarar o adapter/path/export e uma tabela de campos de entrada e saída, incluindo contexto UNTRUSTED, ordering/escaping, roles, signal/deadline, prompt/model/profile e autoridade de cada campo. Fixar as uniões do stream concreto e sua conversão ao port; cap de saída do provider e regra de contagem/reserva sobre os bytes efetivamente transmitidos; resolver os limites 32000/64KiB e o truncamento legado com compatibilidade explícita. Acrescentar positivos/negativos que atravessem essas fronteiras, preservando os dois ramos de resposta e os limites canônicos dos owners.

### R1-02 — P1 — DTOs de fonte não completam os mapeamentos nativos e de histórico selecionados

**Critérios:** FN01/FN02/FN04; CQ01/CQ07/CQ09/CQ10/CQ14. **Evidência:** S:40–61, 91–99, 167–171, 203–223; [R01](../inputs/R01.source.txt):177–209; [R13](../inputs/R13.source.txt):53–64; [S13](../wire-scout/sources/S13-turn.rs.source.txt):395–432, 455–489; [S14](../wire-scout/sources/S14-item.rs.source.txt):239–265, 362–373.

O scout estabelece a forma externa, mas S não fecha a transformação de todos os dados escolhidos. `UserInput.Text` é um vetor de inputs com `text_elements`/byte ranges; a entrada nativa é RuntimeInput.userMessage string e os eventos user têm apenas text. Não se define a captura durável desse vetor, sua conversão em texto de modelo e a reconstrução fiel em thread/read/resume. O mapeamento GOVERNED de ferramenta diz input/result reais, mas não fixa argumentos, contentItems/success/status nem a representação de output string versus null/objeto/número.

Há também um caso nativo central sem forma fechada: cancelamento de execução QUEUED antes de qualquer checkpoint ou item assistant. NativeTerminal exige checkpointRef/responseRef sem declarar a forma ausente, e accounting tem nomes de variantes, mas não campos/unidades fechados. Não basta o adapter saber que deve preservar a verdade; os dois consumidores precisam saber exatamente o que receberão.

**Contraexemplos:** processo B deve reconstruir dois inputs text com anotações distintas sem a memória de A; outro cliente cancela imediatamente após o receipt de start, antes de claim. As regras atuais permitem implementações incompatíveis ou refs fictícias. Mesmo uma fixture limitada a text simples ainda precisa de um terminal válido para cancel-before-claim.

**Impacto:** histórico e consumidores instalados podem discordar dos fatos duráveis, ou preencher defaults/refs inexistentes para satisfazer DTOs. Isso atinge a superfície selecionada, não exige suportar todas as variantes do programa.

**Correção mínima:** fechar schemas discriminados das entradas, saídas, accounting e referências ausentes, e tabela NativeEvent/estado → campos wire persistidos/derivados. Fixar a política dos inputs text compostos/anotados: armazenamento fiel ou recusa explícita antes do turno para a variante ainda aberta. Definir o encoding exato dos resultados tool GOVERNED. Incluir cold-read e cancel-before-claim com refs ausentes, sem reduzir CQ ou ampliar implicitamente o formato v1.

### R1-03 — P1 — A prova de troca de epoch herdada é inviável com o writer físico retido

**Critérios:** FN01/FN04/FN06; CQ10/CQ12/CQ13. **Evidência:** S:67–79, 101–113, 227–229; [A04](../inputs/A04.source.txt):104–130; [A08](../inputs/A08.source.txt):36–79 e cenário EA19; [test-plan](../test-plan.json):193–203, 390–429.

S:69 exige adquirir o writer0221 antes de travar execução/fila e proíbe roubar a sessão física. A04 retém advisory lock na conexão exclusiva até sua liberação real. Entretanto EA03, incorporado sem ajuste, pausa A antes da admissão, expira somente a lease, manda B reclamar e depois retoma A e B concorrentemente. A04/S tornam esse B inelegível enquanto A continua com o backend. EA05 e EA19 também precisam concretizar como B observa/assume o fence sem contornar esse requisito. NJ16 não resolve o conflito: apenas afirma que A perde epoch.

**Schedule ruim concreto:** A mantém o backend PG e o advisory enquanto sua aplicação fica parada na barreira; o relógio real expira a lease; B tenta acquireExact. B deve falhar na aquisição do writer, antes de incrementar epoch. Se o ensaio prosseguir como se B tivesse reclamado, usou bypass/mocks ou violou a SPEC. Se encerrar na recusa de writer, não provou a disputa de epoch exigida.

**Impacto:** uma prova aparentemente concorrente pode só demonstrar exclusão de sessão; um guard de epoch defeituoso pode continuar mascarado. O cenário central CQ12 não está pronto para implementação/prova.

**Correção mínima:** adicionar reconciliação local dos 19EA, preservando-os intactos no pacote antigo. Distinguir lease expirada com backend vivo (B recusa) de perda real do backend/lock de A com processo A ainda vivo (B adquire; A tenta dispatch/write/settlement stale). Fixar barreiras, testemunhos de backend/epoch e negativos discriminantes para o guard de execução, sem remover o lock de sessão ou declarar dois workers sequenciais como contenda. Concretizar também EA05/EA19 sob a mesma ordem de aquisição; não mudar TTL artificialmente ou presumir fencing do alvo externo.

### R1-04 — P1 — CQ13 ainda não tem regra de comparação aplicável à jornada inteira

**Critérios:** FN01/FN02/FN06/FN07; CQ13/CQ14. **Evidência:** S:197, 211–223, 227–233; [test-plan](../test-plan.json):286–311; [governance-proposals](../governance-proposals.json):5–27; [A01](../inputs/A01.source.txt):80–97; [SPEC0231](../../../../../../02_spec/0231_codex100_initial_qualification.md):37–43, 61–81 (suplementar, SHA registrado).

NJ23 exige que o qualificador atual aceite positivos autênticos e rejeite adulterações, mas não define os cenários/bindings, a projeção comparável e as relações permitidas. EQ01–04 são tópicos de decisão, não regras fechadas. Faltam, por exemplo, o vínculo bijetivo dos UUIDs novos entre alvos, a relação de nonce nascida em cada corpo, quais ordens são causais obrigatórias, como comparar custo de modelos sintéticos distintos e quais fatos são invariantes CVG versus comportamento Codex.

**Contraexemplo:** comparar frames integrais inclui UUIDs, caminhos, tempos e branding diferentes e rejeita o positivo correto. Removê-los em um driver pode aceitar uma troca de identidade/efeito e viola a exigência de preservar os brutos e aplicar regra aprovada. Para frames com ID i64 não seguro, SPEC0231 exige EXACT_BYTES; projeção JSON rejeita esses tokens inclusive fora dos campos selecionados. S não escolhe um particionamento compatível nem especifica uma extensão lossless própria.

**Impacto:** um implementador pode produzir um qualificador que rejeita todo positivo ou normalize exatamente os erros que CQ13 exige detectar. Escrever “mutar custo/identidade” não congela o oráculo que distingue uma mutação indevida de uma diferença autorizada.

**Correção mínima:** congelar uma matriz finita de evidência/regra por cenário integrado: referência requerida ou SPEC CVG aplicável, campos comparados, relações/bijeções e ordem, unidades, diferenças GOVERNED, inputs e autoridade/revisão necessários. Escolher como usar os modos existentes do qualificador nos frames seguros/opacos; qualquer transformação nova precisa de contrato próprio vinculado aos brutos. Fixar um positivo autêntico futuro e a condição de rejeição para cada classe de mutação de CQ13/CQ14. Capturas e HOW operacional da referência podem continuar NOT_RUN; não se pede executá-los agora ou qualificar todas as variantes.

### R1-05 — P2 — O teste de quota não distingue oversubscription entre execuções

**Critérios:** FN03/FN06; CQ06/CQ07/CQ09/CQ12. **Evidência:** S:159–163, 167–169; [test-plan](../test-plan.json):193–203, 326–337; [A08](../inputs/A08.source.txt):36–49, 132–147.

O protocolo SERIALIZABLE de soma por tenant e reserva de fechamento é uma decisão de desenho concreta e coerente. Porém NJ26 só exige borda/+1 e reserva; as corridas de NJ16/EA se concentram na mesma execução, já serializada pelo executionrow. Elas não rejeitam uma implementação READ COMMITTED que passa todos os limites por execução e sobrealoca o saldo agregado entre execuções diferentes.

**Schedule ruim concreto:** duas execuções ea1 do mesmo tenant leem a mesma última folga de 64MiB, cada uma admite uma reserva/append menor que a folga individual e ambas commitam. Cada contador local e teste sequencial passa; a soma viola a quota. Outro schedule consome as últimas posições normais e tenta cancel.requested + uncertainty + terminal no fechamento, com escaping que eleva os bytes reais.

**Impacto:** o plano não demonstra a principal propriedade que motivou SSI nem a substituição atômica da reserva sob contenda. Isso é uma lacuna do oráculo de aceitação, não uma alegação de falha runtime.

**Correção mínima:** ampliar NJ26 com duas sessões/execuções e processos reais, barreiras após leituras concorrentes da soma e contenda start/start, append/append e append/terminal/cancel. Exigir ausência de evento/ACK de transação abortada, soma<=cap, retry conhecido limitado e fechamento completo<=64KiB/3 posições. Incluir known-bad sem SSI/protocolo agregado que precisa ser rejeitado. Não precisa executar a prova nesta revisão documental.

## Dezoito verificações substantivas

`ADEQUADO` abaixo significa suficiência de desenho somente no recorte citado. Não equivale a PASS funcional. As ressalvas/FNs também estão estruturadas em review.json.

| Check | Veredito e evidência examinada | Resultado e schedule desafiado |
| --- | --- | --- |
| C01 · FN08 | ADEQUADO · freeze105, manifests52+32, 32+60 ranges; inventários | Bytes autenticados antes/depois; nenhuma conclusão do implementador foi usada como aprovação. S02 vivo excluído de imutabilidade. |
| C02 · FN01/FN08 | ADEQUADO · S:7–15; A01:24–58, 84–97; task:7–16 | CQ01–14 permanecem integrados; 487+22, 22 famílias/49 cartões/10 fases intactos. Não confundir 30NJ/19EA com resultado executado. |
| C03 · FN07 | ADEQUADO condicional · S:19–32, 189, 233–235; R15/R16/R23/R24/R27 | Exports instalados propostos, entrada SDK separada, sem Codex backend/import de produto. Ausência de owner/bridge bloqueia factory/BUILD; não transforma gate pendente em defeito de desenho por si só. |
| C04 · FN02/FN04 | REVISE R1-02 · S:40–61, 167; R01:177–209 | Cancel antes de claim não tem checkpoint/item final; falta schema inequívoco para esse terminal e para dados text do histórico. |
| C05 · FN04/FN05 | ADEQUADO condicional · S:101–113; A04:31–64, 104–139 | Ponte é privada, mesma conexão/fila; create sessão+metadata é um commit conhecido. Rejeitar create seguido de UPDATE em outra transação, read handle estrangeiro e pool com reconnect. Precisa de qualificação futura própria do owner. |
| C06 · FN04 | ADEQUADO no protocolo · S:67–79, 101–113; A06:76–109 | Writer antes de rowlock; relógio DB após waits; nenhum lock durante corpo; SUSPECT fecha admissão e LOST não revive. Cancel controla em outra conexão sem esperar writer. A divergência de teste desse mecanismo está em C16. |
| C07 · FN04/FN05 | ADEQUADO condicional · S:85–99, 115–119; R20:7–84; R22:11–39 | Delta aditivo, FK terminal/execution, unicidades e defaults legados especificados; mesma DB com schemas qualificados. Hash de formato não é autenticação/conteúdo. Não exige copiar DDL WIP dos owners. |
| C08 · FN05/FN07 | ADEQUADO condicional · S:115–119, 187–189, 233; A04:141–161; A05 | Non-owner/RLS/preflight e cutover exclusivo; mixed writer rejeitado; rollback pós-ea1 é roll-forward. NUL confirmado não passa a significar sucesso do log v1. |
| C09 · FN01/FN04 | ADEQUADO condicional · S:123–133, 219; R34:34–114; R35:181–255 | PENDING/DENIED/EXPIRED corpo0; approve institucional distinto de RPC; intent/key estável e bindings revalidados. Falhar entre approve e enqueue exige resume idempotente, sem segunda WRITE. Integração transacional da autoridade ainda terá de ser qualificada. |
| C10 · FN04/FN06 | ADEQUADO condicional · S:123–133; A03:156–181, 320–358; A06:92–117 | CONFIRMED antes de CAS é recuperável em B sem corpo; EFFECT_STARTED e reserva de modelo alheia ficam UNKNOWN. Não usar retorno em memória, hash ou lease expirada como autorização de retry. |
| C11 · FN01/FN03/FN07 | REVISE R1-01 · S:139–147, 179–184; R01/R28/R13/R29 | Stream do port é verdadeiro e os dois ramos são distintos; falta fechar sua composição concreta e a preservação do pedido/uso nas fronteiras reais. |
| C12 · FN03/FN04 | ADEQUADO condicional · S:123–125, 139–147, 167–171; A03:329–352 | Uma reserva persistida por tentativa, UNKNOWN conserva débito, sem somar uso legado novamente. Ordem delta/completed, EOF inválido e validação cruzando chunks estão exigidos. Não há crédito runtime por isso; R1-01 ainda impede compor o contrato integral. |
| C13 · FN03/FN04 | ADEQUADO no desenho · S:149–163 | Cursor validado no primário, subscribe não termina pelo terminal de uma página posterior; leitor lento fecha apenas leitor. Soma agregada e reserva<=64KiB/3 posições estão explicitadas; sua prova discriminante falta em C18. |
| C14 · FN04/FN06 | ADEQUADO no protocolo · S:101–105, 165–171; A06:113–123; S22:1622–1683; S25:190–196, 1581–1594 | Cancel e sucesso linearizam no mesmo row; cancel em curso pode declarar UNKNOWN, sem semântico turn/end falso. ACK de pedido não é terminal. Interrupt admitido enquanto ativo pode responder após sucesso concorrente; fonte também rejeita interrupt já inativo, distinção que deve ser preservada por S:199. Não se exige retorno {} para pedido já inativo. |
| C15 · FN02 | REVISE R1-02/R1-04 · S:193–223; S12/S13/S14/S23 e W01–W06 | Framing/ID lossless e direção estão concretos. Variantes não suportadas permanecem abertas e EQ01–04 são propostas honestas; isso não fornece o mapeamento de valores e comparador dos casos selecionados. |
| C16 · FN01/FN04/FN06 | REVISE R1-03 · S:69–73, 227–229; A04:104–124; A08:36–79, EA19 | Lease expira com backend vivo: B não pode reclamar o writer. Dois processos na lista não provam um novo epoch concorrente. Precisa de schedule realizável e negativo que não fique mascarado por exclusão de sessão. |
| C17 · FN01/FN02/FN06/FN07 | REVISE R1-04 · S:227–233; NJ23/24; EQ01–04; SPEC0231:61–81 | Brutos/índices/autoridade e NOT_RUN são honestos, mas regra precisa aceitar positivo real antes de rejeitar os nove tipos de mutação. JSON com i64 inseguro não pode ser normalizado silenciosamente pelo mecanismo atual. |
| C18 · FN03/FN06 | REVISE R1-05 · S:159–163; NJ26 versus NJ16/EA03 | Exigir contenda entre execuções distintas para rejeitar write skew de quota; limites sequenciais e mutex da mesma execução não distinguem a implementação errada. |

## Critérios congelados e prontidão

| Critério | Veredito documental | Fundamento |
| --- | --- | --- |
| FN01 | REVISE | Caminho integral e 14CQ preservados; R1-01/02/03/04 impedem contrato/prova completos. |
| FN02 | REVISE | Shapes de fonte e IDs preservados; falta transformação dos dados selecionados e regra aplicável, R1-02/04. |
| FN03 | REVISE | Limites/stream/cursor/SSI explícitos; a costura de modelo e a prova de quota ainda estão incompletas, R1-01/05. |
| FN04 | REVISE | Autoridades/transações/UNKNOWN coerentes no nível de invariantes; faltam schemas de casos sem refs e reconciliação do schedule físico, R1-02/03. |
| FN05 | ADEQUADO_DESENHO_CONDICIONAL | Delta físico, privilégios, migração e elegibilidade definidos; owner/source qualification continua bloqueio de entrada, sem crédito transferido. |
| FN06 | REVISE | Todos19EA retidos e 30NJ NOT_RUN; viabilidade/discriminação de contenda, regra e quota ainda precisam de reparo, R1-03/04/05. |
| FN07 | REVISE | Slice vertical, exports e compatibilidade propostos; contrato do adapter e integração com qualificador precisam fechar, R1-01/04. |
| FN08 | ADEQUADO_DESENHO | Review independente delimitado; integridade atual confirmada e nenhuma execução/autoridade funcional inferida. |

**Design readiness:** REVISE pelos cinco achados, separadamente de dependências. **Implementation readiness:** BLOCKED por fonte/export/manifest e qualificação dos owners/ponte, revisão humana T3 nova sobre SHA e preparação dos recursos/candidata conforme S:233. Resolver os achados não autoriza BUILD nem reapresenta aprovações0221/0225/0231 resolvidas. As demais variantes do programa permanecem abertas; nenhuma foi dispensada para este parecer.

Procedimentos realizados: leitura estática, JSON/hash/text, conferência dos excertos e análise manual dos schedules. Não houve import de aplicação, execução de runtime/helper/alvo, PG, Docker, rede, instalação, migration ou gate/teste amplo. Uma falha inicial no script de inventário por diferença de nome de campo do manifest scout foi corrigida; o inventário completo foi emitido antes do julgamento substantivo, sem alterar qualquer input. Não houve teste runtime falho ou omitido rotulado PASS.

Próxima ação do Lead: um único reparo agrupado dos cinco achados, preservando estes bytes R1 e os pacotes herdados. Eventual R2 é do mesmo crítico e do orçamento atual, sobre novo freeze; nenhuma terceira rodada automática. O crítico não implementou reparos ou mutações de status/crédito/ledgers.
