# Reparo agrupado da SPEC0239 — registrado antes das mudanças

Task `DX100-G04:REPAIR-FULL-NATIVE-SPEC-R1`, dentro da mesma unidade de SPEC. [ParecerR1](review-r1/report.md): REVISE, quatroP1 e umP2,18checks. O contrato não está aprovado para BUILD nem pronto para pedido humano. Próxima ação executável: editar a SPEC e seus anexos normativos para resolver os cinco achados juntos, verificar o pacote e retomar **o mesmo críticoHalley** para a segunda/última rodada. Não abrir terceiro review, novo crítico ou orçamento substituto.

O sujeitoR1 e seus105inputs são reconstruíveis por `R1-preimages/map.json`; os bytes anteriores dos arquivos que poderão mudar estão em `.raw.txt`. O manifesto do parecer e os demais arquivos julgados permanecem intactos. As escolhas abaixo são propostas de reparo a detalhar e conferir contra a fonte, não contratos já aprovados ou implementação feita.

## R1-01 — ponte de modelo

Definir um adapter explícito `createNativeModelGatewayBridge` em `packages/adapters/src/native-model-gateway.ts`, export público do pacote e dependências/consumidor correspondente. Conservar os contratos legados de generate/complete; acrescentar um caminho nativo versionado que reutiliza os mesmos helpers de controle. Não reduzir o input anunciado ao nonce pequeno para evitar o limite32000.

Fechar tabela completa: identidade/prompt/profile/model/tenant/deadline/signal/pricing vêm da composição; request/correlation/purpose e contexto vêm do snapshot governado. Preservar mensagem, ordem e role original; roletool precisa de envelope UNTRUSTED explícito ao ser representado pelos roles aceitos pelo provider. ContextSnapshot/ToolResult completos não podem desaparecer nessa tradução. Escolher e congelar os limites UTF8 do ramo nativo e o seu validador de ExecutionSubmission, mantendo o ramo legado unchanged. O pedido preparado e contado deve ser exatamente o transmitido, após todos os controles; ligar requestSha do runtime e providerSha/counter ao mesmo receipt/CAS, sem contar uso duas vezes.

Declarar as uniões concretas ProviderStreamPart/GatewayStreamPart e sua conversão ao ModelStreamPart do harness, incluindo ModelResult.output.text/usage/providerId versus campos planos. O ramo nativo deve falhar por overflow em vez de chamar o parseOutput legado que faz slice32000. Congelar cap de resposta do provider, texto, envelopes e a relação entre budget e os bytes reais. Positivos32001caracteres/UTF8/contexto com budget suficiente e64KiB/limite+1 precisam atravessar o adapter real, não só schemas isolados; ambos os ramos de resposta permanecem obrigatórios.

## R1-02 — schemas, histórico e lifecycle

Fechar uma entrada NativeTurnInput de dados, sem permitir ao cliente fornecer RuntimeInput.agent/grants/budgets. Preservar o vetor UserInputtext e text_elements/byte ranges em request durável e reconstruí-lo em B. Escolher conversão determinística para o userMessage do modelo sem perder a representação original, com limite contando o envelope real. Variantes recusadas devem parar antes do turno e continuar abertas; não apagar anotações silenciosamente.

Schemas fechados de NativeTerminal/Accounting/refs/eventos e tabela de projeção por estado: cancel-before-claim não tem checkpoint ou itemresposta, portanto refs devem admitir ausência explícita sem inventar IDs. KNOWNzero exige prova de nenhum call/reserva; UNKNOWN mantém uppercharge e measured=null. Fixar output de tool governado como envelope JSON versionado com presença/tipo/valor de output, inclusive string/null/objeto/número, em contentItems textual exato. O mapper lê o valor confirmado, não substitui por digest.

Conferir a vida do hoststdio: desconectar o leitor não pode, por um close implícito, cancelar o executor que o contrato diz independente. Definir a composição concreta entre facade/worker/standalone, seus donos e joins, mantendo o mesmo motor e claim dirigido. Este esclarecimento está dentro do contrato de composição/lifecycle selecionado, não abre outra funcionalidade.

## R1-03 — provas de autoridade realizáveis

Criar overlay local de todos19EA, com hash do plano herdado e tratamento explícito, sem editar o pacote antigo. Dois schedules obrigatórios: lease expira/backendA vivo → B recusa writer sem trocar epoch; backendA realmente perdido e lock liberado/processoA ainda vivo → B adquire writer/epoch novo, A tenta dispatch/write/settlement com autoridade antiga. Observar PID/starttime dos processos, PID PostgreSQL e lock real, clock/epoch, bodies e fatos; sem reduzir TTL artificialmente.

EA03/05/19 precisam do ponto de perda física concreto. Admissão anterior pode continuar no alvo; não prometer interrupção externa. A exclusão de sessão não deve mascarar o teste do guard de execução: incluir integração direta do mesmo helper transacional privado de validação de expectedworker/epoch/lease, em PG/role reais, com positivo atual e expectativa antiga negativa. Esse teste pode entrar abaixo do precheck local da capability, mas não substitui a disputa pública nem publica um bypass de produção. O sourcebinding deve provar que o caminho público chama o mesmo helper; um known-bad sem o predicado precisa ser rejeitado. Distinguir esse ensaio interno dos observáveis públicos de CQ12.

## R1-04 — contrato de comparação da jornada

Uma regra por cenário/variante, com<=32capturas por invocação0231, fonte/instituição, campos, unidades, bijeções, causalidade, domínio numérico e autoridade explícitos. Frames comi64não seguro/negativezero ficam opacos em EXACT_BYTES; escolher um cenário determinístico de erro que preserve o ID, sem metadata de ambiente variável, e só executar após HOW próprio. Não passar esses frames pelo JSON do qualificador nem removê-los em driver.

Nos casos JSON seguros, projetar identidade por nascimento/bijeção e verificar cada referência; trocar uma ocorrência deve falhar, renomeação global coerente é relação permitida declarada. Nonces frescos diferem entre alvos: provar nascimento no corpo e igualdade no dataflow de cada alvo, sem exigir o mesmo valor aleatório entre runs. Preservar grafo causal e efeitos, estados e uso/custo por counter/pricing reais; não apagar custo, ordem ou erro para comparar prompts diferentes.

Se for necessário um projetor relacional novo, definir seu contrato/hash/paths/inputs/caps/erros agora e incluí-lo no novo gate0239; ele é código confiável fora do mount gravável do alvo, com validação independente e recomputação dos brutos, não flagPASS emitida pelo driver. Especificar os artefatos canônicos comparáveis e o particionamento EXACT_JSON/EXACT_BYTES compatível com0231. O qualificador existente não ganha semântica nova por um nome de regra. Fixar um positivo autêntico futuro e rejeição específica para resposta, nonce, efeito, evento, ordem, erro, identidade, custo e input; separar tamper de integridade de mutante semântico. Capturas/HOW continuamNOT_RUN e brutos nunca são sobrescritos.

## R1-05 — quota entre execuções

Ampliar NJ26 mantendo seuID: dois processos, duas sessões e duas execuções do mesmo tenant, leituras concorrentes da última folga antes dos writes. Cobrir start/start, append/append, append/terminal e append/cancel. Exigir soma lógica<=cap após ambos os commits, ausência de evento/ACK de abortoSSI, no máximo uma repetição conhecida do helper e reserva substituída de forma atômica. Byte escaping/envelope e as últimas três posições de fechamento devem entrar no cálculo do conjunto<=64KiB. O known-bad READCOMMITTED sem protocolo agregado tem de produzir a violação que o observador rejeita; mutex de uma só execução não é essa prova.

## Saída única do reparo

1. Registrar escolhas exatas na SPEC/anexos e hashes normativos; atualizar test-plan/CQbindings apenas no que os achados exigem, sem omitir casos.
2. Verificar fontes/links/JSON/formato,19EA/30NJ e todos14CQ, recuperação105R1 e integridade dos pacotes anteriores. Não executar runtime de aplicação nesta preparaçãoT1.
3. Novo freezeR2, mesma barraFN01–08 e críticoHalley retomado. Somente aprovação técnica efetiva permite classificar o desenho como pronto; entrada de BUILD continua dependente de owners/ponte e decisão humanaT3 sobre o pacote completo. Não pedir essa decisão enquanto houver obrigatório aberto.
