# 0266 — Cliente MCP governado pelo kernel

Estado: **PROPOSTA T1 corrigida pelo autor após R1; contrato técnico final pendente; BUILD T3 não autorizado**. Task: `MCP-SPEC0266-81C4-20261027`. Não altera os estados de PAR-P01, C100-P01 ou C100-P02. A aprovação de publicar o commit ba81cca4 não cobre este contrato novo.

## Problema e resultado requerido

O planejamento exige MCP stdio e HTTP, com ferramentas externas submetidas ao mesmo kernel, policy, approval e journal das ferramentas locais. Na fonte ba81cca4, `CapabilityOrigin` admite `mcp`, mas o pacote adapters examinado não contém cliente MCP. Um registro de origem não prova transporte, isolamento, autorização ou interoperabilidade.

Esta proposta define o cliente de PAR-P01/C100-P01 e sua fronteira com C100-P02. O servidor MCP do host, resources/prompts/elicitação, OAuth completo e variantes adicionais continuam requisitos da carteira, com unidades próprias; não recebem aceite pelo cliente de ferramentas. O alvo completo inclui os dois transportes e compatibilidade versionada. Uma fatia stdio isolada não encerra o cartão.

Fontes canônicas: [backlog PAR](../03_build/0380_backlog_paridade_100_deepseek.md#par-p01--mcp-governado-stdio-e-http), [C100-P01/P02](../03_build/0383_backlog_paridade_claude_code.md#c100-p01--compatibilidade-de-transportes-e-configuração-mcp), [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md), [SPEC0181](0181_kernel_plugin_contract.md).

## Versões e três identidades diferentes

A revisão MCP `2026-07-28` mudou a arquitetura do protocolo. O cliente proposto terá codecs separados; não reaproveitará a máquina de handshake antiga para a versão nova.

| Dimensão                   | Proposta e evidência requerida                                                                                                                                        |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessão do harness          | Tenant, sessão/execução, grants, budgets e retomada pertencem ao núcleo e são duráveis conforme os contratos PAR. Não dependem de uma conexão MCP viva.               |
| Revisão 2026-07-28         | Metadados por request, descoberta via `server/discover` quando necessária, respostas tipadas e MRTR. Sem criar handshake obrigatório ou sessão de transporte.         |
| Compatibilidade 2025-11-25 | `initialize` e `notifications/initialized`, capabilities e versão negociadas, regras de sessão específicas do transporte. Sem misturar respostas com o codec moderno. |
| Conexão local do adapter   | Identidade interna de canal, geração e processo/socket pertencem ao host. Não são identidade de usuário nem autorização.                                              |

Referências primárias: [visão geral 2026](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/ccaf9102ec5eb656eab50ca8333ef49dcd259c26/docs/specification/2026-07-28/basic/index.mdx), [ciclo 2025](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/ccaf9102ec5eb656eab50ca8333ef49dcd259c26/docs/specification/2025-11-25/basic/lifecycle.mdx) e [anúncio dos mantenedores](https://blog.modelcontextprotocol.io/posts/2026-07-28/). Revisão upstream observada em 27/10: `ccaf9102ec5eb656eab50ca8333ef49dcd259c26`; os seis documentos oficiais estão vinculados por tamanho e SHA-256 no manifesto da tarefa; o crítico R1 conferiu os mesmos bytes.

O perfil de servidor declara as versões permitidas e a estratégia de descoberta. Somente controle de descoberta sem efeito pode escolher o codec. Erro de autenticação, TLS, schema ou timeout de uma chamada de ferramenta nunca aciona fallback nem reenvio. Versão desconhecida falha antes da admissão da ferramenta. Compatibilidade SSE legado/WebSocket só será prometida depois de capturar necessidade real da referência e especificar seus próprios oráculos; permanece pendência de C100-P01, sem equivalência presumida.

## Configuração confiável e admissão

O manifesto por tenant será fechado e versionado: ID de servidor, transporte, versões, origem/configuração, referência da credencial, destinos ou executável/argv permitidos, perfil de contenção, limites e mapeamento confiável de ferramentas. Seus nomes são semânticos nesta SPEC; o schema público final requer revisão T3 antes do código.

- Configuração explícita e normalizada; sem carregar automaticamente HOME, projeto ou settings de outro usuário, nem descobrir servidor por texto recebido. Escopos de usuário/projeto selecionados explicitamente são permitidos somente conforme o contrato de configuração abaixo. `strict-config` rejeita fonte implícita e campos desconhecidos. Nenhum shell é usado para interpretar argv.
- Executável/arquivo do servidor stdio tem caminho real, hash e versão confiáveis. Symlink ou bytes alterados após validação impedem lançamento; a solução de execução sem corrida deve ser especificada com o dono de PAR-X01 antes do BUILD.
- Origem HTTP é normalizada por esquema/host/porta/caminho e tenant. Referência de credencial não contém valor secreto. Resolver o valor para a origem/issuer autorizado em cada chamada; não transportar autorização por redirect. Não adicionar fluxo OAuth, browser ou concessão interativa por inferência.
- Nome remoto, instruções, annotations, ícones e schemas são dados externos. Não criam grant, classe de efeito, idempotência ou acesso à rede/arquivos. URLs de metadados não são buscadas automaticamente.
- Catálogo, cursores, páginas, contexto em voo e fingerprint de admissão ficam vinculados a tenant, servidor/origem, revisão do protocolo, versão do manifesto, hash dos schemas, principal autenticado efetivo, escopos/permissões efetivos e geração opaca da referência de credencial. Esses identificadores vêm da porta confiável de identidade/credenciais; nenhum segredo ou hash de token entra na chave. Um mesmo tenant pode ter vários principais com permissões diferentes. Misturar páginas ou respostas de contextos distintos é recusado. Rotação, revogação ou mudança de escopo invalida o catálogo e a admissão anteriores, exige nova descoberta e reavaliação de policy/approval antes de novo envio. Uma chamada já enviada mantém sua identidade histórica no journal; a rotação não autoriza repeti-la. A porta de credenciais precisa garantir que resolução da geração e admissão do dispatch não aceitem snapshot revogado; sem essa garantia, falha fechado. Refresh com principal/escopos comprovadamente iguais ainda revalida a geração e o catálogo. Colisão de nomes não sobrescreve ferramenta local. Mudança de schema exige nova geração e revalidação; grants anteriores não migram automaticamente.

## Configuração explícita de usuário e projeto — CC100-04-05

A unidade futura C100-P01/CONFIG deve implementar list/get/add/remove no serviço de configuração do host, com ator autenticado, tenant, escopo (usuário ou projeto autorizado), ID de servidor e revisão esperada. Não é ferramenta que o servidor remoto possa invocar. List/get mostram apenas os escopos autorizados e referências redigidas; add/remove usam conflito de versão explícito, sem sobrescrever atualização concorrente. A configuração efetiva registra de qual escopo veio cada campo.

Proposta de precedência: teto de segurança e allowlist do host são imutáveis por esses comandos; fontes explicitamente selecionadas de projeto prevalecem sobre as de usuário para o mesmo ID, dentro da interseção dos grants aplicáveis. Alterar origem, executável, credencial ou schema cria nova revisão e nova admissão, nunca herda automaticamente o grant da definição substituída. Sem autorização para o projeto, o conflito não expõe nem substitui a definição do outro escopo. Modo strict carrega exclusivamente os servidores explicitamente selecionados, mesmo quando o projeto está autorizado; diretório hostil não selecionado é ignorado. Remove fecha nova admissão e segue quiescência para os recursos próprios em voo. Schema/API e a decisão final dessa precedência permanecem PROPOSTOS até o gate T3; o requisito continua inteiro sob C100-P01.

## Uma execução pelo kernel

O adapter traduz cada entrada admitida para `CapabilityDescriptor` e implementação privada; `origin=mcp`, `providerId` e `providerVersion` vêm da configuração validada. Reutiliza `ToolDescriptor.risk/sideEffect/idempotent/requiresApproval/sandbox` existentes; não cria segundo motor de autorização. A classificação vem de manifesto aprovado localmente e deve ser conservadora; ausência ou divergência bloqueia.

Caminho requerido: chamada pública do harness → validação/registry → kernel → policy → approval quando aplicável → sandbox/egress → journal STARTED → um dispatch MCP → validação do resultado → settlement do journal → resultado do kernel. A ordem exata dos hooks será conciliada com SPEC0181 e os contratos já integrados, sem supor que um listener permite ignorar outro controle. `ToolDefinition.execute` só alcança o transporte após a autorização do kernel; listar catálogo não concede permissão de execução.

Approval deve continuar vinculado ao tenant, execução, ferramenta/versão, argumentos normalizados e composição aplicáveis no contrato existente. A implementação deve demonstrar como o fingerprint da configuração/schema participa dessa identidade; se o contrato atual não o comportar, esse delta público terá SPEC/gate próprio. Revogação, pausa e cancelamento são reavaliados no dispatch. Não aceitar aprovação enviada pelo servidor MCP, pelo texto do modelo ou por uma resposta humana não autenticada.

## Efeitos, timeout e retomada

| Situação observada                                   | Resultado proposto no núcleo                                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Negação antes de dispatch                            | `not_started`, zero request de ferramenta e zero corpo remoto observado.                                                                   |
| Resultado válido recebido e vinculado                | Settlement normal do journal; resultado conserva origem não institucional.                                                                 |
| EOF, resposta excedida, timeout ou cancel após envio | Efeito pode ter ocorrido: preservar estado incerto/STARTED segundo contrato vigente; não marcar `not_started` nem repetir automaticamente. |
| Reconnect ou restart                                 | Novo canal/processo e revalidação da configuração; recuperar a execução pelo journal. ID JSON-RPC não é chave de idempotência remota.      |
| READ declarada idempotente                           | Retry somente se policy, budget, evidência e contrato de idempotência aprovados permitirem. Nenhum retry implícito do SDK.                 |
| WRITE/EXTERNAL                                       | Sem replay automático após ambiguidade; reconciliar pelo resultado completo/recibo ou handoff humano.                                      |

Cancelamento cooperativo não prova desfazimento do efeito externo. Dispose deve impedir novos despachos, aguardar/encerrar recursos próprios e retornar só após quiescência comprovada. Chamadas concorrentes de dispose compartilham a mesma conclusão. Uma falha de cleanup não apaga a causa primária.

## Transportes

Stdio reutiliza o serviço de subprocessos PAR-X01: ambiente por allowlist, workspace e recursos próprios, sem credencial herdada do host. O framing é JSON-RPC por linha; stdout não é log. Cancelamento e shutdown seguem o codec escolhido; esgotamento de limite interrompe a admissão. Dispose fecha stdin, aguarda o prazo e escala apenas sobre a árvore própria, com PID/geração e prova de reap; nenhum kill por nome global. [Binding stdio oficial](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/ccaf9102ec5eb656eab50ca8333ef49dcd259c26/docs/specification/2026-07-28/basic/transports/stdio.mdx).

HTTP usa a porta de egress protegida de PAR-T12. Destinos, resolução DNS e conexão devem ficar vinculados; redirects/rebind/IPs privados fora do grant são recusados. TLS sempre verifica certificado/hostname. HTTP em loopback fica restrito à fixture sintética declarada. Aceitar JSON e SSE por request, verificar IDs e metadados da versão, e aplicar caps antes de acumular conteúdo. Headers de método/nome/parâmetros devem corresponder ao corpo e ao schema admitido; `x-mcp-header` não pode injetar header reservado ou valor não permitido. No codec 2026 não criar GET de sessão ou retomada SSE por cursor legado. [Binding HTTP oficial](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/ccaf9102ec5eb656eab50ca8333ef49dcd259c26/docs/specification/2026-07-28/basic/transports/streamable-http.mdx).

Para o codec legado, cabeçalhos e IDs de sessão são transportados somente à mesma origem e tenant e nunca concedem identidade. Tokens, cookies, corpos, requestState e instruções não entram nos logs de erro. Erros brutos são convertidos para categoria estável/redigida; diagnóstico guarda referência/hash, não segredo.

## Entrada adicional e fronteira com C100-P02

Em 2026, MRTR transporta pedidos de entrada dentro do resultado. `requestState` é opaco; não é interpretado nem transformado em grant. A resposta humana exige uma referência local autenticada, correlação à operação/tenant/servidor e consumo único. Cancel, expiração, troca de argumentos/servidor ou credencial e replay da resposta são recusados.

Uma operação de WRITE que recebe `input_required` pode já ter produzido efeito remoto. A retomada não pode reenviar cegamente a chamada: exige contrato de continuidade/idempotência comprovado do servidor e o journal da operação, ou handoff. Ampliar aprovação ou executar sampling/roots/resource por pedido remoto fica proibido. Recursos e prompts são dados não confiáveis; links/URLs não são seguidos automaticamente. O servidor MCP do host terá SPEC separada com identidade e grants próprios. [MRTR oficial](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/ccaf9102ec5eb656eab50ca8333ef49dcd259c26/docs/specification/2026-07-28/basic/patterns/mrtr.mdx).

## Limites propostos para a primeira campanha sintética

Estes valores são propostas locais, não defaults já aprovados: frame/request/resultado até 1 MiB cada; catálogo total 2 MiB, no máximo 32 páginas e 4096 ferramentas; schemas com profundidade 16, sem referências externas; stderr retido 64 KiB; quatro chamadas em voo por servidor e orçamento agregado por tenant; descoberta 10s, chamada 30s, operação total 60s incluindo entrada adicional; shutdown EOF 2s/TERM 2s/KILL 1s. Sem extensão por reconnect. O budget efetivo é sempre o menor entre esses valores e o restante do turno.

Overflow, profundidade excessiva, paginação cíclica ou cursor repetido falham com categoria própria; truncamento não transforma resultado inválido em sucesso. Faltam medição e parecer sobre estes valores. A campanha nativa terá contrato de recursos/deadline/cleanup registrado antes da execução; nenhum serviço ou teste é lançado por esta SPEC documental.

### Custo de compilação e validação de schema — correção R1-F01

Bytes e profundidade não limitam custo de regex ou composição. A porta proposta de validação deve executar compilação e validação fora do event loop do kernel, em processo próprio com isolamento, sem rede, carregamento remoto, módulos dinâmicos, coerção ou callbacks de schema. Não usar Promise.race em volta de trabalho síncrono no host. O validator e seu dialeto JSON Schema serão pinados e revisados; keywords/extensões não suportadas devem gerar recusa explícita, sem sucesso ou declaração de compatibilidade completa.

Para a primeira campanha, propor no máximo 4096 nós de schema, 1024 subschemas, 128 referências locais e 32 expressões de regex por schema; os contadores são conferidos por travessia iterativa limitada antes da compilação. O processo de QA recebe hard limit de CPU de 1 segundo e 128 MiB de memória; compilação tem teto de wall 250ms, validação 100ms e o processo inteiro 500ms, reduzidos ao budget restante. Enforcement e encerramento exigem mecanismo próprio selecionado e prova nativa; timeout do host sozinho não satisfaz esses limites. Até lá, esta porta está não admitida. Não publicar estes valores como defaults já medidos.

A admissão usa uma validação ativa por tenant e fila máxima 8, cobradas do orçamento agregado e dos slots de processos nativos já autorizados. Não amplia caps para acomodar o validator. Sem slot ou contenção efetiva, recusar antes de tools/call. Após deadline/overflow, aguardar encerramento/reap do recurso próprio e preservar causa; não reaproveitar worker possivelmente comprometido nem cair para validação síncrona. Regex/composição adversarial dentro dos limites estruturais precisa comprovar a recusa limitada, cancelamento do kernel responsivo e zero envio de ferramenta; schema válido conhecido deve passar no mesmo perfil. A arquitetura executável dessa porta, medição de caps e compatibilidade de dialetos ficam no gate final, não são prova produzida por este texto.

## Matriz de aceitação a executar depois do gate

Todos os casos estão **NOT_RUN**. Cada positivo precisa de um servidor sintético correto com bytes/protocolo fixados, captura independente do dispatch e identidade da candidata. Cada negativo usa mutação conhecida do mesmo cenário e um erro exato; timeout de infraestrutura não conta como recusa de segurança.

| ID   | Fronteira e positivo                                                              | Negativo ou falha discriminante                                                                                          |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| MC01 | Stdio2026 descobre e chama READ pelo kernel                                       | Versão/metadados inválidos: nenhum tools/call                                                                            |
| MC02 | HTTP2026 JSON e SSE concluem request                                              | Header/body ou ID divergente recusado                                                                                    |
| MC03 | Stdio2025 handshake seguido de chamada                                            | Chamada antes da inicialização negada                                                                                    |
| MC04 | HTTP2025 sessão válida na origem correta                                          | ID de outro tenant/origem não reaproveitado                                                                              |
| MC05 | Strict-config usa só manifesto explícito                                          | HOME/settings/projeto hostil ignorados e não executados                                                                  |
| MC06 | Ferramenta READ permitida entrega resultado                                       | Servidor desconhecido/classe ausente: corpo remoto zero                                                                  |
| MC07 | WRITE fica retida e retoma após approval vinculado                                | Resposta falsa/tenant ou argumentos trocados: zero dispatch                                                              |
| MC08 | Catálogo/schema fixados produzem capability correta                               | Nome colidente/schema alterado/grant antigo negados                                                                      |
| MC09 | JSON Schema local válido aceita dados esperados                                   | Ref externo, profundidade ou entrada incompatível negados                                                                |
| MC10 | Resultado válido normaliza saída e origem                                         | Malformado/excedido/outputSchema inválido não vira sucesso                                                               |
| MC11 | Destino HTTP autorizado e DNS fixado                                              | Redirect privado/rebind/hostname TLS inválido recusados                                                                  |
| MC12 | Referência de credencial correta e rotação                                        | Credencial de outro issuer/origem e segredo em log falham                                                                |
| MC13 | Cancel antes de dispatch preserva zero corpo                                      | Cancel após envio mantém incerteza; nunca replay cego                                                                    |
| MC14 | Queda após efeito e restart pelo journal                                          | Efeito contado duas vezes ou STARTED apagado falham                                                                      |
| MC15 | Dispose concorrente encerra árvore própria                                        | Filho/grandchild sobrevivente ou processo alheio afetado falham                                                          |
| MC16 | Resposta concorrente corresponde ao request                                       | ID duplicado, resposta tardia de geração antiga recusados                                                                |
| MC17 | Catálogo paginado termina dentro do cap                                           | Cursor cíclico/flood/overflow encerram conexão de forma limitada                                                         |
| MC18 | Ambiente/FS/rede seguem grants do subprocesso                                     | Leitura fora, env herdada, escape e ausência de enforcement falham                                                       |
| MC19 | Política/pausa/revogação prevalecem no dispatch                                   | SDK que tenta ignorar controle mantém corpo remoto zero                                                                  |
| MC20 | Entrada MRTR autenticada retoma uma vez                                           | Resposta duplicada/expirada/cross-tenant não libera efeito                                                               |
| MC21 | Alteração de catálogo cria geração e nova admissão                                | Ferramenta em voo não troca implementação silenciosamente                                                                |
| MC22 | Counters/budgets agregam chamadas concorrentes                                    | Limite por chamada não contorna limite por tenant                                                                        |
| MC23 | Texto/instrução externa permanece dado                                            | Prompt injection não cria grant ou ação fora da ferramenta                                                               |
| MC24 | HTTP/stdIO compatíveis com servidor de referência pinado                          | Ausência de referência não recebe etiqueta de paridade                                                                   |
| MC25 | List/get/add/remove nos escopos explícitos usuário/projeto e precedência indicada | Tenant sem grant, conflito de revisão ou projeto hostil não expõem nem sobrescrevem outro escopo                         |
| MC26 | Schema e entrada conhecidos válidos dentro do perfil isolado                      | Regex/composição de alto custo encontra limite exato, zero tools/call, kernel responsivo e recurso encerrado             |
| MC27 | Refresh autorizado revalida principal/escopos/geração e catálogo                  | Rotação para outro principal/escopo, paginação mista e resposta antiga não reutilizam catálogo ou approval privilegiados |

## Rastreabilidade dos onze requisitos CC18-04

Nenhum requisito foi removido, marcado N/A ou aceito funcionalmente. Todos os testes continuam NOT_RUN. A lista conserva os donos da carteira; propostas não mudam o numerador.

| Requisito   | Dono canônico | Cobertura proposta e trabalho ainda aberto                                                                               |
| ----------- | ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| CC100-04-01 | PAR-P01       | MC01/03/06/15, stdio governado e cleanup real                                                                            |
| CC100-04-02 | PAR-P01       | MC02/04/06/11, escopo HTTP autorizado                                                                                    |
| CC100-04-03 | C100-P01      | MC02/04/24; capturar referência e fechar compatibilidade SSE legado, sem inferência                                      |
| CC100-04-04 | C100-P01      | Decisão e prova específicas de WebSocket/add-json ainda abertas; não recebe crédito por HTTP                             |
| CC100-04-05 | C100-P01      | CONFIG e MC25; schema/API/precedência finais ainda sujeitos ao gate                                                      |
| CC100-04-06 | C100-P01      | MC05/25, exclusão de descoberta implícita                                                                                |
| CC100-04-07 | C100-P01      | MC12/18/27; OAuth completo e entrega segura de credencial ainda abertos                                                  |
| CC100-04-08 | PAR-P01       | MC01/08/09/21/26/27, identidade/schema/geração                                                                           |
| CC100-04-09 | C100-P02      | MC23 é controle de fronteira; SPEC resources/prompts/limites próprios permanece aberta                                   |
| CC100-04-10 | C100-P02      | MC20, identidade/consumo único e persistência MRTR ainda precisam contrato final                                         |
| CC100-04-11 | C100-P02      | SPEC e interoperabilidade do servidor MCP do host ainda abertas; handshake conforme a versão, sem confundir SDK JSON-RPC |

## Dependência proposta de subprocessos

O [contrato preparatório PAR-X01](../04_audit/evidence/CORE-X01-CONTRACT-41F8-20261027/PROPOSED-CONTRACT.md) concilia a implementação existente de0196/0198 e propõe admit/launch, stdin com backpressure, output limitado, stop/wait/dispose e ownership. É insumo T1, não SPEC adotada, SDK, BUILD ou contenção qualificada. As 12 provas propostas estão NOT_RUN. MCP stdio e o validator devem consumir um mecanismo comum, preservando as diferenças de framing e resultado do shell. Permanecem abertos mecanismo de cleanup de descendentes/crash/PID reuse, execução sem corrida, perfis de ambiente/executável, budgets e mapping com o kernel; nenhum destes contratos é suprido apenas pelo link.

## Construção futura e condições de admissão

1. L0/L1 conciliam PAR-K01/K03/K04, sessões e os donos do journal; aprovação existente de0225 não é aceite global. L4 fornece PAR-X01/X02/X03 com perfis reais, e L2/L3 conciliam PAR-T12/H03. As dependências das carteiras continuam obrigatórias.
2. L3 fecha schemas/erros, SDK e versão exata, mapeamento de approval/fingerprint, estratégia de execução stdio sem corrida, valores de limites e matriz de codecs; L5 revisa a suficiência dos oráculos. Registrar os pontos ainda PROPOSTOS abaixo antes do gate técnico.
3. Revisão técnica independente e revisão explícita T3 do contrato final, conforme [D-12](../07_agents/AGENTS.md#governança-proporcional-d-12-26092026); task/claim e candidata isolada antes do código.
4. Construir primeira jornada stdio READ→WRITE retida→approval→resultado→restart, com deny/mutantes e árvore encerrada. Construir a mesma jornada por HTTP, incluindo TLS/SSRF e os dois codecs. Não encerrar PAR-P01 por uma só perna.
5. Executar os gates T2/T3 aplicáveis no mesmo SHA, revisar o delta e atualizar ledgers/GBrain. Captura de referência, C100-P02, variantes ainda desconhecidas e aceite do destino continuam provas distintas.

R1 encontrou três correções obrigatórias (CPU de schemas, contexto autenticado do catálogo e configuração explícita por escopo). Esta rodada aplica uma correção documental agrupada pelo autor; o parecer R1 permanece vinculado ao hash anterior, e não constitui aprovação independente desta revisão. Não houve R2 automático.

Pontos abertos que impedem chamar esta proposta TECHNICALLY_SPECIFIED: contrato final da porta de subprocesso e execução sem corrida; contrato final de egress/credenciais; persistência e unicidade de MRTR/approval; SDK/codec pinado; medição dos caps e esquema público exato. Esta rodada não pergunta aprovação humana de um contrato ainda aberto e não inicia BUILD. Próxima ação concreta: revisão de desenho sobre o recorte de identidade, efeito ambíguo e compatibilidade2025/2026, então fechar as portas com os responsáveis e congelar uma SPEC revisável.
