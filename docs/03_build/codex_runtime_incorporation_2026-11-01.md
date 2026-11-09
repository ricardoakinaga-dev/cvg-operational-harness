# Execução das melhorias do núcleo Codex no CVG

Objetivo autorizado pelo usuário: **incorporar as melhorias à documentação e implementar todas as melhorias da documentação**. O escopo é o relatório de comparaçãoKR01–KR18, seus critérios positivos/negativos, a CLI proposta e a jornada integrada. Este é um roteiro de execução vinculado às carteiras existentes, sem substituir0380/PAR,0383/C100 ou0386/DX100.

## Escopo e condição de conclusão

Concluir exige implementação integrada dos18recortes, cada comportamento positivo e negativo com evidência atual pelo caminho público, a CLI necessária disponível, a jornadaCQ01–14 qualificada no candidato apropriado, regressões e revisão exigidas, e documentação/ledgers reconciliados. Entregar planejamento, fonte em branch, testes de uma função ou uma CLI apenas de diagnóstico não conclui o objetivo. O [registro integral de requisitos](../04_audit/evidence/CODEX-INCORPORATION-20261101/requirements.json) preserva o escopo e o estado de cada recorte.

O [roadmap0385](0385_roadmap_paridade_codex.md) incorpora os18recortes. O [relatório](../comparacao_nucleo_cvg_codex_2026-11-01.md), a [matriz com fontes e linhas](../04_audit/evidence/CODEX-REA-20261101/gap-matrix.json) e o [backlog0386](0386_backlog_paridade_codex.md) permitem localizar comportamento, dono, dependência e aceite. Nenhum cartão ou denominador novo é criado. O catálogo de paridade continua487funcionais+22controles; a nova inspeção de fonte não troca a referência8d9f6466.

## Candidatas e autoridade

O checkout compartilhado observado éce23da17; onda8c8be3a516, onda9 eK06 contêm avanços não equivalentes ao checkout. Antes de BUILD, fixar a candidata por SHA, conferir os módulos que serão reutilizados e identificar wiring/migrações e testes realmente integrados. Não copiar código sobre a main compartilhada antiga. Implementação longa será feita em candidata própria com claim explícito, preservando os recursos dos pares.

Os três ledgers99/20/30 e0386 estavam dirty de pares no início. Continuam readonly pela regra5; deltas para integração ficam no handoff. O claim original0385 está concluído e o arquivo estava clean: somente um bloco aditivo desta frente foi reservado. A ausência de resposta de outro agente não libera um caminho ativo.

O pedido do usuário autoriza avançar no objetivo e nas mudanças locais pertinentes. Cada nova API, policy, identidade, schema ou approval exige o contratoT3 concreto e seu gate. Os recibos já existentes não são reapresentados ao usuário como nova decisão. Não há autorização de produção, push, deploy, integração real ou dado real. SkillsEngineeringFramework/Orchestrate auxiliam o trabalho; a constituiçãoCVG e os recibos do projeto governam a transição.

## Critérios por recorte

Todos os critérios abaixo pertencem aos cartões referidos; a tabela organiza execução e não concede aceite.

### KR01 Kernel compartilhado e composição entre hosts

Reuso e dono proposto: DX100-K01, PAR-K01; L0/L1.

Entrega: Preservar essa fundação e qualificar a mesma semântica nos caminhos públicos. No Codex, o exec atual usa InProcessAppServerClient; a centralização inclui protocolo, sessões e lifecycle. Não confundir vários adapters com vários kernels, nem presença de imports com equivalência já provada.

- Positivo: A mesma fixture por API, worker e SDK produz decisões, efeitos e causas equivalentes sob regra aprovada.
- Negativo: Uma composição que contorne policy, approval ou journal deve ser rejeitada pelo qualificador.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR02 Loop de decisão e ferramentas nativas

Reuso e dono proposto: DX100-K01, DX100-M01, PAR-M01; L1/L2.

Entrega: O Codex consome stream de itens/chamadas, despacha ferramentas pelo router e continua quando há tool follow-up ou entrada pendente. Acrescentar um adapter tipado de itens/tool calls ao CVG pode reduzir conversões e chamadas de decisão. O custo/latência extras da estratégia atual são hipótese a medir, não defeito de desempenho já demonstrado.

- Positivo: Provider sintético emite tool call tipada; o resultado real entra no próximo pedido e na composição final.
- Negativo: Nome/argumentos inválidos não executam corpo; resultado de ferramenta não pode ser substituído por texto esperado no driver.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR03 Pedido efetivo e autoridade capturados

Reuso e dono proposto: DX100-K01, DX100-M01, PAR-M02, PAR-K05; L1/L2.

Entrega: O Codex retém StepContext/settings da chamada anunciada. Consolidar snapshots imutáveis de modelo, ferramentas, configuração e grants no momento de admissão; provar que reload/mutação posterior não troca a autoridade de uma chamada pendente.

- Positivo: A chamada usa o snapshot admitido e registra o pedido realmente entregue ao provider.
- Negativo: Mutação concorrente da configuração ou de uma definição de ferramenta não amplia a chamada em curso.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR04 Streaming do provider até o cliente

Reuso e dono proposto: DX100-M01, DX100-A03, DX100-D01, PAR-M01; L2.

Entrega: Eventos de sessão e streaming de deltas do modelo são capacidades distintas. Paridade exige itens incrementais, erros e um terminal coerente pela cadeia provider→kernel→log→transporte→cliente, com backpressure e cancelamento.

- Positivo: O cliente recebe um delta antes do provider terminar, e um único terminal com uso confirmado ou desconhecido explícito.
- Negativo: Falha após primeiro byte não vira resposta completa nem repetição silenciosa de inferência.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR05 Sessão, retomada e fork

Reuso e dono proposto: DX100-S01, DX100-S02, PAR-S01, PAR-S04, PAR-K03; L1/L2.

Entrega: O Codex separa ThreadManager, CodexThread, TurnContext e ThreadStore. Fechar wiring, migrações e recuperação pública do CVG antes de criar outro store. Retomar histórico não equivale a reconciliar efeito externo.

- Positivo: Outro processo retoma a sessão, preserva o pedido exato e reutiliza resultado confirmado sem repetir WRITE.
- Negativo: Escritor com fence antigo, commit sem confirmação ou fork com efeito incerto não produzem sucesso inventado.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR06 Agente vivo, steering e cancelamento

Reuso e dono proposto: DX100-K01, DX100-O02, PAR-K06; L4/L2.

Entrega: O Codex possui submission_loop, fila de entrada e prioridade de steering sobre mailbox. O CVG precisa ligar registro vivo, entrega no próximo passo, wait/idle e cancelamento com estado de efeito. Consumido pelo inbox não significa lido pelo modelo.

- Positivo: Steering aceito é entregue uma vez no próximo passo e aparece no pedido como entrada identificada.
- Negativo: Cancelamento disputa conclusão de forma determinística e nunca apaga efeito confirmado ou transforma uncertain em cancelado seguro.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR07 Supervisor e árvore de subagentes

Reuso e dono proposto: DX100-O01, PAR-O01, PAR-O02; L4/L1.

Entrega: O Codex expõe spawn, send, interrupt e reload com ownership; mantém registry/linhagem e distingue aceitação, publicação e execução. Implementar supervisor sobre o mesmo kernel, sem invocar um Codex externo como substituto da capacidade nativa.

- Positivo: Pai cria filho, envia entrada e recebe resultado com IDs/linhagem verificáveis.
- Negativo: Filho de outro tenant, alvo sem ownership e ferramenta fora do grant do pai são recusados.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR08 Budget e capacidade por árvore

Reuso e dono proposto: DX100-O01, DX100-K01, PAR-O01; L4/L1.

Entrega: O Codex tem limiter de execução e reserva de slots, com diferenças entre MAv1/MAv2; o limiter mostrado limita subagentes V2, não todo trabalho indistintamente. Para o CVG, reservar budget/depth/fanout atomicamente antes do spawn e contabilizar todo descendente no pai.

- Positivo: Dois spawns concorrentes respeitam a mesma reserva e custo/tokens agregados da árvore.
- Negativo: Erro durante spawn libera somente reserva não consumida; não permite oversubscription ou reutilizar approval do pai.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR09 Ferramentas paralelas e exclusivas

Reuso e dono proposto: DX100-K01, PAR-K07; L1.

Entrega: O Codex usa RwLock: ferramentas seguras entram com read, exclusivas com write, mantendo admissão cancelável. Copiar a regra de exclusividade e acrescentar teto explícito por sessão/tenant no CVG; RwLock por si só não é teto numérico de concorrência.

- Positivo: Duas READ seguras sobrepõem execução até o limite; uma WRITE exclusiva roda sozinha na ordem definida.
- Negativo: Cancelamento enquanto aguarda admissão não chama executor nem consome aprovação de outra chamada.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR10 Processos persistentes e terminal

Reuso e dono proposto: DX100-X01, DX100-R02, PAR-X01; L1/L4.

Entrega: O Codex unified_exec mantém processo, buffers, stdin e polling. Consumir o serviço único existente e demonstrar terminal/PTY, ownership, drenagem de saída e cleanup por árvore na superfície pública do CVG.

- Positivo: Processo sintético persistente produz saída incremental, recebe stdin e termina sob posse do chamador.
- Negativo: Timeout, cancel e queda do owner não deixam descendentes; overflow e cleanup falho preservam causa primária.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR11 Política de efeito e sandbox aplicado

Reuso e dono proposto: DX100-X02, DX100-X03, PAR-X02, PAR-X03, PAR-X04; L1.

Entrega: No Codex ToolOrchestrator coordena aprovação, sandbox e retry após negação. No CVG, qualificar a aplicação real e a autoridade de cada tentativa. Não generalizar o problema da base à candidata reparada nem conceder reexecução automática de efeito incerto.

- Positivo: Perfil aplica a contenção declarada; tentativa fora de root/destino é negada pelo mecanismo real.
- Negativo: Helper ausente/relatório adulterado ou mudança de autoridade no retry não permitem fallback permissivo.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR12 Aprovação, efeito incerto e handoff

Reuso e dono proposto: DX100-X03, PAR-K03, PAR-X04; L0/L1.

Entrega: A flexibilidade de modos de aprovação do Codex não substitui a autoridade institucional. Manter a intenção exata/hashes, a decisão humana quando exigida e o handoff no headless; revisão automática consultiva não equivale ao aceite institucional.

- Positivo: WRITE retida só executa após decisão válida e retoma a mesma intenção uma única vez.
- Negativo: Mudança de input, expiry, outro tenant ou resultado incerto não reutilizam a autorização.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR13 Encerramento com relatório de falhas

Reuso e dono proposto: DX100-K01, DX100-O01, DX100-X01, PAR-K04, PAR-X01; L1/L4.

Entrega: Codex AgentTreeShutdown.wait_detailed devolve relatório de falhas e aguarda operações admitidas. Acrescentar resultado de cleanup/quiescência no lifecycle CVG sem interromper a limpeza dos demais recursos, nem esconder o primeiro erro.

- Positivo: Shutdown bloqueia novas admissões, aguarda trabalho e publica resultado de todos os recursos próprios.
- Negativo: Um disposer lança: os demais ainda executam e o resultado final identifica cleanup incompleto.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR14 Contexto, compactação e saídas grandes

Reuso e dono proposto: DX100-C01, DX100-S02, PAR-C01, PAR-C02, PAR-C03, PAR-K03; L2/L1.

Entrega: O Codex compacta em limites de turno e acompanha pressão de contexto. A prova decisiva para o CVG é conservar decisões, efeitos, approval e resultado recuperável em todas as chamadas, inclusive RESPONSE. O defeito histórico G03 nessa rota exige revalidação na candidata integrada, não repetição automática do diagnóstico antigo.

- Positivo: Nonce gerado pelo corpo READ chega ao próximo pedido e à resposta final, inclusive após compactação/restart.
- Negativo: Prefixo de ferramenta hostil permanece dado; pin, resumo ou preview não criam autorização nem substituem resultado completo.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR15 RPC, eventos e requests do servidor

Reuso e dono proposto: DX100-A01, DX100-A03, DX100-D01; L2/L0.

Entrega: Construir camada de compatibilidade versionada sobre o mesmo kernel para initialize/thread/turn, server requests de aprovação, notifications, retomada e erros. Preservar i64 sem arredondar pelo Number de JavaScript. Não declarar wire parity por renomear métodos.

- Positivo: Cliente real da referência inicializa, acompanha itens e responde ao pedido de aprovação com o framing previsto.
- Negativo: ID além de Number seguro, evento duplicado e desconexão não perdem identidade nem fabricam ACK de notification.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR16 CLI e configuração operacional

Reuso e dono proposto: DX100-H01, DX100-H02, DX100-D02, PAR-H01, PAR-H02; L2/L0.

Entrega: O Codex tem exec/review/resume/fork, configuração por perfil, diagnóstico e saída estruturada. Começar uma CLI cvg como adapter do SDK/kernel, com doctor offline, config dump redigido e execução headless que se suspende para approval.

- Positivo: CLI produz JSONL versionado, IDs estáveis e exit/status coerentes; doctor não chama modelo e dump não vaza segredo.
- Negativo: stdin inválido, campo desconhecido ou ação sensível sem aprovação não são tratados como execução bem-sucedida.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR17 MCP, hooks e extensões sob controle

Reuso e dono proposto: DX100-P01, DX100-E01, DX100-F01, PAR-P01, PAR-K04, PAR-K09; L3/L1.

Entrega: O Codex integra exposição de tools, handlers, hooks, MCP e contextos da etapa. Fechar discovery/lifecycle/schema e o transporte sob as capabilities existentes. Reload não pode remover controle, trocar grants da chamada ou executar conteúdo de configuração como autoridade.

- Positivo: Tool MCP sintética anunciada passa por validação, policy, approval e journal do mesmo kernel.
- Negativo: Hook com erro/timeout e plugin malformado falham sem desativar política obrigatória ou deixar processo órfão.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

### KR18 Medição de paridade e mudança de referência

Reuso e dono proposto: DX100-G01, DX100-G02, DX100-G03, DX100-Q01, DX100-Q02; L0/L5.

Entrega: A referência canônica é8d9f6466. O fork pedido está ema0981298 e a CLI instalada é0.166.0, sem vínculo de build provado. Abrir delta de referência em DX100-G01/G02/G03; preservar denominador e recibos até decisão própria. Achados KR são recortes de investigação, não novas funções contadas.

- Positivo: Cada requisito/variante recebe candidata, fonte/binário, configuração, brutos, comparador e julgamento atuais.
- Negativo: Help verde, mocks, contagem de arquivos, recibo de outro pin e artefato adulterado não incrementam cobertura.
- Estado nesta incorporação: reconciliação em andamento; execução e integração ainda precisam de provas atuais.

## CLI e contratos externos

Os comandos propostos devem ser implementados sobre as mesmas portas do kernel/SDK, com versão, identidade autenticada e causas estáveis. A lista integral é:

```text
cvg doctor --json
cvg config validate
cvg config dump --redacted
cvg run --profile <perfil> --input <arquivo-ou-stdin> --json
cvg session list
cvg session inspect <id>
cvg session resume <id>
cvg session fork <id>
cvg execution inspect <id>
cvg execution steer <id> --input <arquivo-ou-stdin>
cvg execution cancel <id>
cvg events <session-id> --after <cursor> --follow
```

Doctor/config operam offline quando aplicável e nunca imprimem segredo. Headless distingue submissão aceita, espera deapproval, falha, cancelamento e efeito incerto; status/exit e JSONL pertencem à SPEC. Testes usam mensagens/providers/processos sintéticos e verificam stdout/stderr, primeiro delta antes do terminal, framing, schema e cancelamento. Resume/fork/steer/cancel não podem ter executor ou store próprios.

A [SPEC0310 da CLI](../02_spec/0310_cvg_operational_cli.md) materializa os doze comandos, a seleção de portas, configuração offline, saída JSONL/exit, input limitado, cursores e Q01–Q12. É proposta T3 em correção após REVISE técnico com seis P1, ainda sem autorização de BUILD e sem prontidão para gate humano. O anexo normativoR2 fecha traduções de cliente; bootstrap autenticado e wire202K06 continuam abertos. A facade nativa0239 permanece com seu gate já aprovado; steering e cancelamento duráveis usam a API autenticada de0302, que exclui sua adição ao SDK atual. O [mapa de comandos e critérios](../04_audit/evidence/CODEX-INCORPORATION-20261101/cli-contract/traceability.json) marca todas as implementações e provas CLI como NOT_BUILT/NOT_RUN; nenhuma recusa por dependência ausente concede conclusão do comando.

## Etapas e trabalho concorrente

| Etapa                          | Resultado demonstrável                                                               | Estado inicial                          |
| ------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------- |
| Incorporação documental        | 18recortes e12interfaces rastreados no roadmap/plano, com links e critérios íntegros | Em verificação                          |
| Reconciliação de implementação | Fonte/candidata, recibo/gate, dono e saldo real para cadaKR                          | Em andamento                            |
| Núcleo durável e encerramento  | Mesma execução governada entre hosts; recuperação e cleanup observáveis              | Depende dos contratos/recibos canônicos |
| Interação contínua             | Sessão viva, steering, streaming, contexto e protocolo ligados                       | ReusaK06 e onda8/onda9                  |
| Supervisão e execução          | Filhos com grants/budget, mailbox, processos e concorrência limitada                 | Depende do supervisor aprovado          |
| CLI e extensões                | Comandos e MCP/hooks usam a autoridade existente                                     | Depende das portas qualificadas         |
| Qualificação integral          | Positivos/negativos, jornada, regressões e revisão por candidato                     | Pendente                                |

Nash reconcilia gates/reusos e Tesla mapeia lifecycle/callers, ambosreadonly, semfilhos e semteste deaplicação. O Lead integra resultados, escreve esta documentação e escolhe a próxima fatia com contrato executável. As frentesD9/K06,07/anexos/jobs e0410/CI003 não são redistribuídas por este plano.

## Prova e recuperação

Cada task registra o quê/onde/como/dependência/pronto e claim antes de código. Critérios são congelados antes de testar. Um provider pronto ou um teste que fabrica a resposta esperada não prova o fluxo. Guardar primeiroRED, correções, comandos/exit e hashes. Execução iniciada só é repetida após terminal e justificativa; efeito incerto exige reconciliação, sem retry cego.

Usar Node22 e testes apropriados ao delta; testes de concorrência/cleanup inspecionam a fronteira real. Gates amplos e lockfile precisam de claim próprio. Revisão independente vem de não autor quando a trilha exigir. Um revisor não implementa reparos da mesma unidade. Preservar limites, denegação, corpus, denominadores e causa primária.

## Estado e próximo passo

O objetivo permanece ACTIVE e incompleto. A [continuidade](../08_runtime/handoffs/codex_incorporation_20261101.md) e o estado próprio do pacote registram tarefas, observações e pendências de integração dos ledgers. Onde faltar um gate de contrato público, preparar a SPEC concreta e submetê-la ao responsável enquanto avança trabalho independente autorizado.

## Recuperação de contratos e primeira implementação — 02/11/2026

Para KR02, KR04 e KR15, a SPEC0239 e seus oito anexos já têm aprovação humana vinculada aos hashes. O [preflight registrado](../04_audit/evidence/CODEX-INCORPORATION-20261101/approved0239-preflight/result.json) conferiu esses bytes e recuperou o recibo de 18/10. Não é necessário reapresentar o mesmo contrato. A entrada na implementação composta depende da qualificação dos ports; as bases examinadas ainda integram somente os três tipos JSON de0224. A decisão17, posterior, não libera o restante de K03b. Journal e sessão já possuem fontes e migrations0033/0034: a renumeração não caracteriza uma ausência. O preflight documenta essa presença e a pendência concreta, sem conceder qualificação funcional.

Para KR13, a SPEC0222 aprovada com ajustes permite adaptar fielmente a primitive interna existente. O [HOW revisado](../04_audit/evidence/CODEX-INCORPORATION-20261101/kr13-reuse/HOW.md) recebeu aprovação técnica R2 e distingue uma candidata privada nova da promoção para fontes canônicas. O claim nominal foi registrado antes de criar a candidata própria, na base `c8be3a5168b1304ba4e3dc3d79a91c66ce494637`. A adaptação conserva a API pública, os controles da onda8 e o hook `model/overflow`; incorpora cleanup compartilhado entre observadores, ordem inversa, preservação da falha primária e relatório interno de falhas assentadas.

O [freeze da implementação](../04_audit/evidence/CODEX-INCORPORATION-20261101/kr13-reuse/code-freeze-r1/manifest.json) vincula os dois arquivos, o patch e os resultados: 19 testes focais, 100 testes de regressão, tipagem, lint, formatação e build passaram. A primeira falha de preparação e o RED funcional foram preservados. A [revisão de código independente](../04_audit/evidence/CODEX-INCORPORATION-20261101/kr13-reuse/code-review-r1/review.json) aprovou a unidade sem achados obrigatórios; a [entrega para integração](../04_audit/evidence/CODEX-INCORPORATION-20261101/kr13-reuse/INTEGRATION-HANDOFF.md) explicita base, patch e limites. Esses resultados qualificam somente a unidade privada: owner/gerações/leases, producer tracker real, fechamento de admissão, encerramento público da árvore e certificação da composição continuam pendentes. KR13 e os outros recortes mantêm seus critérios integrais.

## Transporte de assets e próximo delta do owner — 02/11/2026

A unidade interna de build foi implementada em candidata própria e registrada no commit local `a186f6e760971b86d8e6f4477cf778a7ca6b082c`. O builder transporta os assets declarados pelo layout `native/runtime/` dos20workspaces, preserva os fontesC existentes fora dessa área e mantém flags/manifests/composição. O [relatório da entrega](../04_audit/evidence/CODEX-INCORPORATION-20261101/native-assets/REPORT.md) vincula o patch de três arquivos, 19 testes, typecheck/lint/formato, build público20, atualização de hashes/remoção de lixo, rejeição pública de fonte proibido e consumidor físico do tarball. O import legado fez zero tentativas de carga nativa; o controle detectou a tentativa sintética. A revisão de código independente aprovou o componente para qualificação composta, sem obrigatórios. Fonte principal e claims dos holders permanecem preservados; ainda não há integração ou certificação global.

A recuperação do HOW completo também revelou um gate diferente do já aprovado0222: a [proposta originalReturns R2 e decisão preparada](../04_audit/evidence/CODEX-INCORPORATION-20261101/original-returns-decision/DECISION.md) alteram a condição pública de composição de retornos opacos/manuais. O candidato contratual já passou por revisão técnica e seu hash foi conferido, mas sua adoção específica precisa de revisão humanaT3. Isso permite completar o HOW do owner; não é aceite de backend, adaptação, W8 ou quiescência. Os dois componentes privados precisam ser compostos/qualificados e os demais recortes permanecem inteiros.

## Proposta do supervisor e dos limites por árvore

Os recortes KR07/KR08 têm agora a [SPEC0311 em rascunho](../02_spec/0311_agent_supervisor_tree_budget.md), ligada aos cartões existentes DX100-O01/PAR-O01/PAR-O02. Ela propõe ownership e linhagem, redução de grants, aprovação própria do filho, distinção entre aceite e consumo, reservas compartilhadas e encerramento da subárvore com quiescência real. Os dez inputs estão pinados e os doze casos ST01–ST12 continuam NOT_RUN.

A proposta não está pronta para BUILD ou gate humano. Restam SC-L01 (integração transacional/autoridade nativa), SC-L02 (accounting exato), SC-L03 (schemas e limites fechados) e SC-L04 (owner gerenciado e ports qualificados). O contrato `originalReturns`, K03b e os gates de perfis conservam suas decisões próprias. Isto não encerra KR07/KR08 nem altera o escopo integral dos dezoito recortes, doze comandos e jornada CQ01–14.

## Qualidade interna do cleanup revisada; nova qualificação global pendente

Commit privado 4f86d71a4b5184e3d54a2a17e5cf5c51bd23d993 sobre bc863ac91: 18 casos novos, prefixo dos 19 anteriores intacto, dois continue inalcançáveis removidos e asserção de tipo apagada na emissão; ambos await originais preservados. Mesmos 319 testes/15 arquivos PASS sem skip, host100%S/B/F/L; types/lint/formato/build20/consumidor físico169arquivos/210exports/dtsiguais PASS. Descartes CODE_R1 APPROVE_SCOPED_CODE_FOR_GLOBAL_QUALIFICATION, zero obrigatórios; 3artefatos completos antes do prazo, 48inputs+suplemento PREPOST iguais, ator encerrado. Somente dois arquivos próprios no commit seletivo; sem push/promoção. Gates globais antigos pertencem a bc863; nova fonte aguarda gates globais/cobertura/certificação. Escopo integral18KR/12CLI/CQ01–14 ACTIVE; originalReturns já perguntado sem resposta, CLI e supervisor com pendências registradas; não fecha KR13 ou paridade. Ledgers99/20/30dirty de pares preservados, deltas locais conforme regra5.

## Certificação da nova fonte em execução isolada

A revisão 4f86d71a4b5184e3d54a2a17e5cf5c51bd23d993 foi materializada integralmente na candidata privada cleanup-certification-candidate (94494 arquivos tracked, 50 links internos de dependências, nenhum externo, Git limpo e lock idêntico). Preflight global de formato PASS em61.683s. npm run certify nativo em andamento UMA execução: sessão85574, PID668721/runner667831, candidateId d49f16a90a5d1d17b8e15b0867393a767668c22be20955be5d47c5032dc21c2d. Escopo core conforme ADR010 e contrato CI, sem filtros adicionais ou redução de barra; o runner nativo impõe cobertura por arquivo. PostgreSQL sintético próprio CID97b552523b290426746c95970dc548ed960cd8af87f1cdd90950a8fc46eb64d2/porta32775, rolepostgres, fsyncON, zero clientes antes; API35732/web45732 reservadas. Custo nativo máximo3600s por subgate/outer9000s; controlador conserva primeira falha e limpa somente CID próprio após terminal0clientes. Controles fora da worktree; não repetir por timeout de observação. Resultado final, gates globais e certificação ainda PENDENTES; gates antigos de bc863 não transferidos. Evidências cleanup-global-qualification/task.json, setup.json, certify-live.json, certify-native.log e current-checkpoint.json. Full18KR12CLI/CQ01–14ACTIVE; nenhum aceite de paridade, promoção, push ou produção.

## Accounting por árvore proposto; revisão sem parecer e certificação corrente observada

SC-L02 recebeu anexo0311_agent_tree_accounting.md com partição hierárquica de envelopes, matemática exata por dimensão, reserva antes de cada tentativa, uso parcial/final, refund idempotente, unknown/overdraw sticky, raiz/slots e recuperação. Sete fontes primárias4f86d71 pinadas e preimagem0311; doze casos AC01–AC12 NOT_RUN, nenhum código/schema/migration/teste de aplicação alterado. Hubble nonauthor leaf teve300s, encerrado300.036s inclclose, sem nenhum dos três outputs: NOT_ADMITTED_TIMEOUT_NO_OUTPUTS, achados UNKNOWN/nãozero; 10inputs PREPOSTparent iguais; nenhum recovery/reviewreset iniciado. AnexoAUTHOR_DRAFT e SPEC0311nãoBUILDready/nãohuman-gateready; SC-L01/03/04 e boundsprovider continuam pendentes. Nativecertify da fonte4f86d71 permanece UMA execução sessão85574/PID668721 birth7648293/runner667831, oito gerações de processo observadas vivas, pins iguais; gatesformat/types/lint/buildPASS, unit emandamento, semfinalcertificado. CIDown97b552porta32775/35732-45732 continua reservado para o produtor; não limpar nemreiniciarporobservationtimeout. CLI0310F1authtransporte/F5wire202owner e originalReturnsusergate permanecem pendentes/não repetidos. Escopo18KR12CLI/CQ01–14ACTIVE; pares/ledgers99-20-30dirtyreadonly, deltasown; nenhuma promoção/push/produção.

## Snapshot do gateway corrigido e revisado; qualificação da fonte sucessora

Commit privado5be0ca7078ceda425a7335eca3c36243dd146ee1 sobre4f86d71 corrige snapshot dos perfis primário/fallback e preços antes da espera pelo provider. O consumidor real reproduziu divergência entre payload e modelo anunciado (8/9); o mesmo oráculo congelado passa9/9 no pacote corrigido. Três regressões novas preservam prefixo dos16testes existentes; RED2FAIL17PASS, GREEN329/19files e19focaisPASS; types/lint/formato/build20PASS;38exports/19declarações iguais; revisão Jason APPROVE_SCOPED_CODE_FOR_GLOBAL_QUALIFICATION/zero obrigatórios,40inputs estáveis e actor encerrado282.106s. Commit somente gateway.ts e teste existente, sem root/push/promoção. A campanha anterior4f86/85574 foi encerrada deliberadamente após format/types/lint/build/unit10487PASS690files0pendentes; cobertura e restante interrompidos sem aceite. PIDsgone/CID97b552removido0clientes/portaslivres; sessão85574terminal, não retomar. Nova campanha request-snapshot-global-qualification aponta5be com cleanworktree/PG próprios; preparação inicial da cópia de dependências excedeu100s antes de qualquer runtime e foi conservada. Cópia física corrigida possui conferência completa antes de iniciarcertify; gates globais da nova fonte permanecem pendentes. O escopo18KR/12CLI/CQ01–14 permanece ACTIVE, com decisões OriginalReturns/K03b/CLI e supervisor pendentes e sem aceite funcional/paridade.

## Certificação da fonte5be em execução com recursos próprios

Qualificação nativa da fonte revisada5be0ca7078ceda425a7335eca3c36243dd146ee1 iniciada UMA execução, sessão96143/PID1120744 birth8111266/runner1120066. CandidateIde22cd0bd6ed27b6327dc9d52f1fd92c8278e84946f960e3a1ab0f6ddf51319c1,2744inputs,dirtyfalse; fullcheckout94494tracked,13sourcepins,17605dependencyfiles/239100365bytes+50internallinks conferidos porbytes/modes e17655paths iguais/zeroextras/externos. SetupR1rsync100stimeoutbeforeanyapp/PG preservado; correçãoPREPARAÇÃOcp-a--reflink=auto+verificação19.277s,nãorepetiuteste/afrouxouoráculo. PostgreSQL próprio9d4f965ad9fc8664acb811699e7f8e0b4d64628d3498237c3946c059617cc171/32776/defaultpostgres/fsyncON/0clientsbefore,API35733web45733; coreADR010/nativerunner/3600child9000outer, semrealdata/providers/install/lockchange. EstadoRUNNING, semresultadofinal/certificado. Old85574TERMINAL_SUPERSEDEDapós5PASSgatesunit10487/690/0pending,PIDCID97b552gone/portsfree; não retomaroutransferircert. Full18KR12CLI/CQ01–14ACTIVE;publicgatesOriginalReturns/K03b/CLI/Supervisorpendentes, semrootpromotion/push/produção.

## Port seletivo para base publicada — revisão em curso

Port privado em main publicadaa2f por7hunks próprios, não branchinteira127deltas/54produto. Baselinegateway17PASS2FAIL; 374focais20files+11regressão2files=385PASS; fulltypes após15examplesoriginais materializados/lint/formato/build20PASS. Cinco tarballs byteconferidos/consumidor físico semlinks, mesmooráculo9PASS. ClasseKernelHost/barrel/exports públicos preservados; declaração internaadicionaseams jáprevistos, rawcomparisonexit1preservado. Targetlocke1ff e415identidades conservados. Freeze71inputs c7afba9e; EulerCODE_R1 leaf300s RUNNING. Mainportsemcommit oufullT2/cert/promoção; source5benative96143/PID1120744birth8111266 continua mesmaexecução, format/types/lint/buildPASS/unitRUNNING. 18KR12CLI/CQ01–14ACTIVE, gatespúblicos eholderspendentes; rootledgersreadonly/deltasown, nãopush/prod.

Evidência: `current-main-intake/REPORT.md`, SPEC0312, freeze71inputs e `code-review-task.json`. Ação singular: admitir parecer CODE antes do commit dos sete paths; campanha96143 independente permanece viva.

## Port na base publicada implementado e revisado

Port seletivo implementado no commit privado 9ccb933fa7887f8775ea33f4aa61cab0b2c26037, diretamente sobre a main publicada a2f. Exatamente sete arquivos dos três componentes próprios; demais deltas de produto, segurança e dependências preservados. Passaram 385 testes/22 arquivos, typecheck, lint, formato, build de 20 workspaces e os nove cenários do consumidor físico original. Euler ratificou APPROVE_SCOPED_CODE_FOR_GLOBAL_QUALIFICATION, zero correções obrigatórias: R1 chegou 4,411s tarde e continua não admitida; recuperação final pelo mesmo revisor em 86,384s/120s, 85 registros PRE/POST estáveis, ator encerrado. Commit e checkout completo limpos; 89.163 arquivos tracked, dependências físicas conferidas e lock do alvo e1ff preservado. Nova campanha global ainda não iniciada. A certificação existente da fonte5be na sessão96143/PID1120744 birth8111266 permanece viva: formato/tipos/lint/build/unit PASS, 10.490 testes unitários/690 arquivos/zero pendências; cobertura em execução sob PID1426338 birth8435181. Artefatos tracked antigos de cobertura não representam resultado desta execução. Fontes13pins estáveis. Objetivo integral18KR/12CLI/CQ01–14 ACTIVE, sem promoção canônica, push, produção ou transferência de certificado; contratos públicos e integração dos ledgers pelos holders permanecem pendentes.

Evidências: [resultado da etapa](../04_audit/evidence/CODEX-INCORPORATION-20261101/current-main-intake/STAGE-RESULT.md). Próxima ação concreta: observar o produtor existente96143; qualificação da nova fonte preparada, sem campanha concorrente.

## Contrato de certificação do alvo conferido

Pré-condições estáticas da campanha9ccb concluídas: AST TS6.0.3 extraiu os16comandos nativos, iguais aos da fonte5be;22fontes capturadas com SHA. Treze pins/HEAD/árvore limpa do alvo conferidos. Confirmados100% por arquivo nos quatro pacotes neutros, checagem agregada90/85/90/90 e manifesto crítico19paths/6grupos/95branches,47arquivosPG, E2E comUUID/JSON/JUnit/uma tentativa real. Cinco insumos diferem entre as bases: lock/certifier/regras/ci-bar/contrato. O producer de segurança difere no diagnóstico/momento da validação, mas o verifier final conserva exit0 e found0vulnerabilities. Não importar scripts ou certificado do donor. Catálogo, fontes e proposta de campanha preparados, portas/PG ainda não atribuídos; nenhum app/teste/cert novo executado. Falha inicial do coletor ENOENT registrada e corrigida pelo import real. Campanha existente96143/PID1120744 birth8111266 confirmada viva em cobertura, unit10490PASS690files0pendências; nenhuma reexecução. Objetivo18KR/12CLI/CQ01–14ACTIVE; decisões públicas e integração canônica pendentes.

Evidência em `current-main-qualification/certifier-preflight/REPORT.md` e `campaign-proposal.json`. Próxima ação continua observar a sessão96143; a proposta não reserva recursos ou inicia campanha.

## Proposta de credencial e consentimento da CLI

SPEC0310 ganhou anexo AUTHOR_DRAFT de conexão autenticada: credencial CVG opaca com consentimento OIDC, wire de enrollment/poll/revoke, validade900s semrefresh, proteção de arquivo POSIX, buckets persistidos antes de lookup, CAS de entrega e revogação, COMMIT/response perdidos e framing/saída/exits dos dois auxiliares propostos auth login/logout. Os12comandos operacionais originais permanecem obrigatórios; os2auxiliares são ampliação proposta, não comandos existentes/aprovados. Oito fontes auth pinadas contra Git e referências RFC8628/7009 conferidas. AF01–AF12 NOT_RUN; revisão é somente autoral, nenhum review técnicoR2/Herschel ou gate T3 concedido/resetado. F1 conserva commonnative/session/K06binding e ownership/rate-limit/migrations/retention; F5wire202owner continuaOPEN. NenhumAPI/auth/schema/store/app/test/login/PG/provider novo executado. Campanha5be96143 segue mesmafonte e mesmaexecução emcoverage, sem cert final;9ccbglobal preparado ainda não iniciado. Full18KR12CLI/CQ01–14ACTIVE, originalReturns jáperguntadoaguardauser semrepetição e ledgerssharedreadonly.

Artefato: `docs/02_spec/0310_cli_connection_auth.md`; evidências/preimagens em `cli-connection-auth`. Nenhuma mudança na condição de conclusão dos12comandos; próxima etapa independente é fechar binding/wire/ownership e só então admitir review técnico final e gate humanoT3. A ação do produtor existente continua observação96143.

## Publicação autorizada pelo usuário

Publicação solicitada explicitamente pelo usuário paraorigin ricardoakinaga-dev/cvg-operational-harness, branch própria codex/runtime-incorporation-20261102, basecódigo9ccb filha da maina2f. Sete fontes revisadas+documentação/evidências próprias selecionadas; worktree separada preserva source/QA e recursos de pares. DezDocsatuais linksPASS; corpus histórico congelado80linksrelativos/16absolutos fora do contexto permanecemFAIL/não reescritos. Gitleaks8.28sameworkflow/currentpolicy scan922files encontrou3operationKeys sintéticos/não credenciais; triagem explícita, scannerFINDINGpreservado/policyinalterada. BranchWIP, global/publicgatespendentes. Próximo commit seletivo/push nãoforçado/readback SHA. Depois de publicar, alvo da futuraQA deve ser ponta publicada exata comDocs, não transferir certificado9ccb/5be.

## Commit e push concluídos

Commit e push autorizados concluídos emorigin ricardoakinaga-dev/cvg-operational-harness, branch codex/runtime-incorporation-20261102, ponta f2c10eba4684777299661daad8cfb54c1811a9e6 confirmada por ls-remote e GitHub. Inclui commit9ccb7fontes revisadas+931docs/evidências próprios. Main remota permanecea2f, root/peer/source/QA9ccb preservados. PublicaçãoWIP:10Docslinks/formatoPASS; frozencontext80linksrel/16abs ewhitespace bruto preservadosFAIL;3achados Gitleaks8.28 identificados como operationKeys sintéticos/não credenciais, policyinalterada/scanFINDINGnãogreen. Nenhuma afirmação de prontidão de merge/produção. Native5be96143 terminouexit0/7087.269s/16gatesPASS/CONDITIONAL_GO;13pinsestáveis/PID1120744 e1120066gone/PG9d4f removidoapós0clientes. Inspeção inicial terminal registrada; auditoria detalhada de certificado/relatórios/portas ainda pendente. Não repollar96143 nemtransferircertificaçãoaof2c. Próximaqualificação devevincularponta publicadaexata comDocs apósauditoria/cleanup eclaims, nãorodar9ccpreparado e depoisrepetirporDocdelta. Full18KR12CLI/CQ01–14ACTIVE/publicgates/holderspendentes.

## Certificação5be auditada e recursos limpos

Auditoria nativa5be concluída:16gatesPASS/exit0/7087.269s, schemas+38artefatos+2744inputs semdrift;10490unit/690arquivos/0pendentes;482PG/exatos47files/0pendentes;12E2E/12tentativas/0retryflakyskip/UUIDJSONJUnit;81arquivosneutros100%S/B/F/L egeral95.06/92.22/96.06/95.92;mutação10/10,evals48,chaos16,carga10000semperda. AAA_CONTROLLED/CONDITIONAL_GO limitadoafonte5be;provider/canal/identidadeexternosnão validados/humansignoffPENDING.45artefatosarquivados, CIDs/PIDs/gruposausentes/32776-35733-45733bindfree/credencialremovida/TMPownremovidoapós0FD. Nenhum teste repetido. Recibo36/SPEC0302SHArecuperado: S2/S3proibidosantesPAR-K01aceito;K01canonicalIN_PROGRESS, nãorepedir0302neminventar202. Próximo publicar somente evidências próprias e resolvercontextosfrozennaf2c antescampanhaexata. HOWDOC003 existenteéDRAFT0reviews/nãobuildadmitidona531por39inputs ausentes; novaFontef2ce dadospróprios precisamreconciliação específica, semimportarinputsdepares oumudarpolicyparafingirverde.

Relatório: `source5be-terminal-audit/REPORT.md`. A publicação de evidências não modifica os inputs de aplicação ou os gates humanos pendentes.

## Evidências de certificação publicadas; contexto documental em reconciliação

Auditoria5be finalizada e publicada emd4f72acb3f028aa6d92164491744131e8ed4fb2e parentf2c, somente75arquivos próprios de evidência, zeroalteraçãoAPP/config/contratos; gitpushnãoforçado/readbackexato. Novo loteGitleaks8.28zeroachados/currentpolicyinalterada;3achadosoperationKeyhistóricos continuamtriados/scannerglobalnãoverde. StageR1falhoupor2provasarquivadasignoradas(coverageSummary/JUnit); preservado, forceaddsomente2pathsownsemalterarignorepolicy. Cert5be38artefatos/2744inputssemDrift/16PASS/10490unit482PG12E2E81neutral100/recursoslimpos/AAAcontrolledconditional; nãotransferívelaopublicado. Sessão96143TERMINALnão repollar. Recibo36verificadoaprova0302mascondicionaS2/S3aPAR-K01aceito;canonicalK01IN_PROGRESS, não reabriraprovação0302. Próximaaçãoconcreta: inventariarproveniência/contexto/recibosdas80refsrel/16abs nafrozenFontepublicadad4f; HOWDOC0030reviews/DRAFTbloqueadona531por39inputs ausentes, nãoautorizaBUILDnemimportdepares; novaFonteprópriaprecisapacotereviewableantescódigo. Full18KR12CLI/CQ01–14ACTIVE/semaceiteparidade/prod.

## Contexto documental publicado — inventário e gate técnico

Reexecução Node22 do checker na fonte d4f confirmou80relativos/16absolutos em12arquivos. Matriz própria concluída em `docs/04_audit/evidence/CODEX-INCORPORATION-20261101/frozen-context-reconciliation/disposition-matrix.json`:2cópias com recibo literal,2originais em lugar,demais situações separadas. Nenhum mapa aplicado nem arquivo congelado modificado. HOW T2 próprio em revisão independente KantR1; BUILD não admitido. Próxima ação: dispor parecer e, somente após admissão, criar candidata própria com RED causal. Escopo18KR12CLI/CQ01–14 e gatespúblicos mantidos; sem aceiteglobal/produção.

## Correção de contexto documental — implementação e retrabalho

Candidata própria `doc-context-candidate` baseada em d4f: quatro caminhos internos de tooling, dois mapas literais de aquisição, nenhum Markdown congelado alterado. HOW KantR1 aprovado; CODE AmpereR1 REVISE com três obrigatórios, entrega observada em487s/480 e sem admissão. Um retrabalho corrige travessia antes da normalização, tipagem do perfil e diagnóstico de moved-target. RED5FAIL64PASS, GREEN137PASS/3files/0pending; fullformat/types/lint/build PASS novamente. Corpus80→74relativos/16absolutos,12hashes históricos preservados. CODE R2FINAL no mesmo ator,300s, orçamento2rodadas/1retrabalho sem reset. Qualificação nativa16gates preparada, não iniciada; sem certificado transferido, sem produção ou paridade integral. Próxima ação: dispor R2, commit seletivo se admitido e claim próprio para qualificação exata.

CODE R2FINAL aprovado: zero obrigatórios,63probes independentes,11inputs estáveis PRE/POST, entrega final observada212s/300; ator encerrado. Commit seletivo `de36d462f8c1bfd3042783d56c782c01c0e89d0b` com quatro caminhos. Próximo: qualificação nativa da candidata com documentação vinculada ao HEAD final; nenhum certificado anterior transferido.
