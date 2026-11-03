# Bootstrap da CLI — fechamento de arquitetura e reconciliação da autenticação

Continuação do R2 autor da SPEC0310. Este documento não concede BUILD nem fecha sozinho F1. O objetivo continua sendo executar os doze comandos pelo serviço durável, com a mesma identidade e autoridade dos demais consumidores.

## Modo proposto

A CLI será cliente de um serviço existente. Esta é a opção adotada pelo autor após a pergunta opcional de preferência permanecer sem resposta; foi declarada ao usuário durante a continuação. A decisão não equivale à aprovação humana T3 do contrato. A CLI recebe operações de cliente; a composição que executa o trabalho permanece no serviço.

O bootstrap deve entregar uma conexão lógica única e fechável, ligada a um destino autenticado. As portas de sessão, facade nativa0239 e controles HTTP0302 precisam alcançar essa mesma composição e o mesmo principal. Comparar strings de tenant, perfil ou manifestDigest não estabelece o vínculo. A prova deve exercitar o transporte e a composição reais, incluindo troca de credencial, serviço incompatível e vínculo cruzado de sessão/execução.

## Fontes observadas

O [manifesto](host-source-pins/manifest.json) conserva sete fontes da candidata `bc863ac9147e80b30f38a0614c8a8eb35e9447f4`, incluindo o servidor, as fronteiras de sessão, o SDK e a SPEC0254. O [adendo](host-source-pins/oidc-routes-addendum.json) acrescenta a oitava fonte, `oidc-routes.ts`, localizada pelo import real do servidor. O primeiro manifesto registra um nome alternativo não encontrado; essa tentativa foi preservada e não indica ausência do login OIDC.

| Fato na fonte selecionada                                                                         | Consequência para a CLI                                                                                |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET /v1/session` restaura a sessão por cookie no modo OIDC e responde identidade e validade      | A leitura não é um novo login nem prova do destino dos ports nativos                                   |
| O modo OIDC recusa `x-cvg-operator-token`; o HMAC de bootstrap pertence ao caminho legacy         | Um token HMAC não pode ser apresentado como login universal da CLI                                     |
| Cookie de produção usa `__Host-cvg_operator_session`; há nome legacy distinto                     | Nome e perfil precisam vir da composição qualificada, sem downgrade automático                         |
| Mutações com cookie no modo OIDC exigem `Origin` único e igual à origem configurada               | O transporte CLI deve conservar o contrato CSRF; omitir ou escolher outra origem não concede acesso    |
| A sessão OIDC tem validade limitada e não tem renovação silenciosa                                | Expiração interrompe a operação; não gera novo login, retry de mutação ou criação automática de sessão |
| `createSdk` instancia servidor e cliente em processo; o transporte básico do SDK não abre conexão | Importar o SDK não liga automaticamente a CLI ao serviço durável ou à identidade da API                |
| Roleclient0239 exige identidade, storefacade, sessão e manifesto/perfil fornecidos pelo host      | Esses valores não podem ser construídos a partir de campos livres da configuraçãoCLI                   |

## Contrato de entrada e saída que precisa fechar F1

Antes do review final, a proposta deve fixar os itens abaixo juntos. Este quadro define critérios de fechamento; não declara factories, endpoints ou credenciais já implementados.

| Fronteira       | Resultado exigido                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entrada local   | Referência explícita à conexão/credencial provisionada, com schema, limites de leitura e origem definidos; doctor/config/help/version continuam offline       |
| Provisionamento | Processo exato que fornece a credencial, relação com o login institucional, validade, revogação e ausência de segredo em argv/log/JSONL                       |
| Transporte      | Entry point estático do host, destino e validação TLS/origem, política de redirects e schema request/response; sem módulo ou executável indicado pelo payload |
| Principal/caso  | Identidade derivada no serviço e authorizeCaseMutation/readExecutionForCaller preservados; tenant e grants não vêm da configuraçãoCLI                         |
| Perfil          | Resolução autorizada e vínculo efetivo com o manifesto e o snapshot da sessão existente; incompatibilidade recusa antes de create/submit                      |
| Portas          | Mesmo serviço autenticado para sessão0221/0287/0295, client0239 e HTTP0302; formato de transporte de cada operação explicitado                                |
| Ownership       | Quem abre e fecha conexão, leitor, writer de fork e pedidos em curso; o worker independente continua tendo seu próprio lifecycle                              |
| Falhas          | Erro antes de dispatch separado de resultado desconhecido depois de mutação; nenhum retry automático ou sucesso derivado de receipt                           |

O contrato atual não descreve um endpoint que entregue todos esses ports por uma mesma conexão autenticada. Uma API nova, um fluxo novo de emissão de credencial ou uma extensão do SDK é mudança T3: deve ser proposta como tal, reconciliada com os holders e aprovada antes de BUILD. A SPEC0310 não tratará uma factory ou um atestado fictício como dependência já disponível. A restrição posterior do recibo17 sobre K03b permanece independente.

## Provas obrigatórias do bootstrap

- Composição real autentica uma vez e os doze comandos observam o mesmo principal/tenant/instalação e a autorização específica de cada recurso.
- Perfil incompatível com sessão, token de outro destino, caso não atribuído, cookie expirado, resposta de identidade malformada e serviço com capacidades incompatíveis recusam antes de efeitos adicionais.
- Trocar só IDs ou digests no arquivo local não transforma a composição incompatível em compatível.
- O comando offline não lê credenciais nem inicializa transporte. Entrada inválida de run é recusada antes de createThread.
- Sinal, timeout e pipe fechado encerram apenas os recursos de cliente, com prova de ausência de handles residuais; a execução independente conserva seu estado real.
- Os caminhos de sucesso usam os ports qualificados reais. Uma dependência ausente continua NOT_BUILT/NOT_QUALIFIED e não recebe crédito por retornar unsupported.

F1 continua **OPEN: provisionamento e transporte autenticado exatos**. A decisão de modo e as restrições de autenticação estão agora documentadas; não substituir esse saldo por uma nova pergunta de preferência ou alegar que a pergunta anterior foi respondida. F5 conserva a dependência de schema HTTP202 qualificado do ownerK06. Os outros itens do R2 autor e R1 histórico permanecem íntegros.

## Alternativa autoral de provisionamento

O [anexo de conexão autenticada](../../../../02_spec/0310_cli_connection_auth.md) propõe um fluxo concreto de consentimento OIDC e credencial opaca CVG, com wire de emissão/revogação, expiração, armazenamento local privado, concorrência e doze contraprovas AF01–AF12 NOT_RUN. Auth login/logout são dois comandos auxiliares novos propostos, além dos doze operacionais. Nada dessa superfície existe ou recebeu aprovação por esta preparação. A alternativa ainda exige revisão técnica/segurança e gate T3; não substitui o binding conjunto das portas ou o wire202 de F5. F1 permanece aberto, agora com a parte de provisionamento descrita como alvo explícito, em vez de pressupor token ou factory disponíveis.
