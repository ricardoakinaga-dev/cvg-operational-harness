# C100-G02 — Oráculos e acesso

17/10/2026. Projeto de verificação documental; execução funcional `NOT_RUN`. O [inventário](oracle-contracts.json) vincula os 134 IDs atuais a 16 protocolos e aos seus casos negativos, sem alterar títulos, donos, classes ou denominadores do catálogo. Cada protocolo define fixture sintética, boundary, observações e adulterações. A versão executável de cada cenário e suas variantes será congelada na SPEC da tarefa antes de BUILD; este projeto não é uma suíte pronta.

## Regra de comparação

Os 117 resultados funcionais precisam de uma captura real da referência e uma execução CVG. Os 17 controles adicionais usam SPEC CVG aprovada e execução real do CVG; não se inventa um mecanismo equivalente no Claude. Recusas de controle CVG não substituem o caminho positivo autorizado. Exemplo: WRITE retida não demonstra edição; a retomada autorizada precisa produzir exatamente uma edição.

Capturar bytes e eventos nativos, resultado/erro, estado persistido, identidades relacionadas, chamadas e efeitos. Registrar hash de fixture, driver, grader, configuração e candidata; referência local usa o SHA do executável, serviço remoto também precisa de versão/data/região e cliente. Guarda de integridade rejeita arquivo ausente/extra, hash divergente, origem não autenticada ou resultado de outra execução. Um pacote autocertificado não autentica a própria referência.

Comparação padrão é identidade. Projeções entre contratos diferentes exigem caminhos e predicados enumerados na SPEC: nada de apagar eventos, ordenar chamadas, parafrasear respostas ou normalizar tenant, erro, approval, efeito, operação e custo. IDs de transporte podem ser renomeados apenas preservando igualdade, distinção e relações por namespace; timestamps só nas posições aprovadas. O bruto sempre acompanha a projeção e governa os controles de autoridade/efeito.

Modelo determinístico pode substituir a porta externa de modelo quando a referência realmente suporta tal configuração e o driver comprova a chamada. Não pode substituir o motor de referência nem devolver o resultado esperado sem executá-lo. Na falta dessa porta, usar um predicado observável congelado e a sessão real autorizada, com orçamento/gate aplicável. Conteúdo do modelo não é normalizado para forçar igualdade.

## Acesso e pendências

| Perfil                | Recurso necessário                                                      | Situação observada e dono da resolução                                         | Condição antes de execução                                                     |
| --------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| CLI informativa       | Binário 2.1.302 pinado                                                  | L0: versão/help capturados por REA, G01; não prova modelo ou features          | Home/config sintéticas; sem conta                                              |
| Sessões locais/modelo | Porta de modelo configurável da referência ou conta de teste autorizada | L5/L2: compatibilidade keyless não demonstrada; não ler credenciais do usuário | Recon/captura da porta; se conta/provider real, gate T4 e orçamento explícitos |
| MCP/plugins/config    | Servidores e pacotes sintéticos próprios                                | L3: fixtures a implementar; nenhum servidor externo presumido                  | Claim de portas/processos; transporte/auth definidos na SPEC                   |
| Contenção             | Host Linux, backend realmente disponível e árvore própria               | Dono PAR-X01–X04: disponibilidade e enforcement ainda não qualificados         | SPEC de segurança T3; probes nativas limitadas; ausência falha fechado         |
| Worktree/PTY/rewind   | Repositório temporário, terminal e arquivos próprios                    | L4: nenhum repositório real entra no ensaio                                    | SPEC da tarefa; ownership e recuperação demonstrados                           |
| Cloud/self-hosted     | Conta/plano/região, serviço e ambiente autorizado                       | C100-R01/L2: `NOT_PROVISIONED`; usuário fornece escolha/acesso no gate futuro  | Pacote T4 com identidade do serviço; não criar conta/comprar por inferência    |
| Controle remoto       | Dois clientes autorizados, consentimento, revogação e host              | C100-R02/L2: `NOT_PROVISIONED`; autenticação e cliente a confirmar             | SPEC T3 e ensaio T4; nenhuma sessão real existente                             |
| IDE/desktop           | Editor/extension e desktop de referência pinados, workspace sintético   | C100-R03/L2: `NOT_PROVISIONED`; CLI anunciada não prova extensão instalada     | Identidades dos clientes e acesso autorizado; positivos/negativos próprios     |
| Gateway corporativo   | Contrato/configuração e endpoint de teste autorizado                    | C100-R04/L2: `UNKNOWN_CONTRACT`; requer recon da função anunciada              | Oráculo confirmado, SPEC T3 e gate T4 antes de endpoint real                   |

Perfis ainda sem acesso mantêm seus IDs no denominador. Não precisam estar provisionados para implementar suporte privado local, mas bloqueiam a qualificação dependente. Simuladores CVG só ajudam desenvolvimento; não fecham comparação com SaaS/IDE/gateway.

## Discrepâncias sem equivalência presumida

`CC100-03-04` precisa provar a extensão entre hosts; `03-09` tem exportação documental em texto, distinta do formato versionado CVG; `06-04` não tem spill/poda demonstrado; `08-02` não tem plano persistido/versionado demonstrado; `04-04` anuncia WebSocket sem handshake ensaiado. O inventário preserva essas pendências. G04 deve especificar a primeira medida sem declarar resolvidos esses pontos; as tasks afetadas só recebem PASS após decisão de equivalência e prova.

## Resultado e próxima ação

Projeto G02 pronto para revisão documental, sem capturas funcionais, equivalências aprovadas, credenciais inspecionadas ou serviços provisionados. Próximo: revisar a cobertura dos 134 vínculos e preparar a SPEC inicial de qualificação. O congelamento de cada oráculo executável permanece requisito antes do BUILD correspondente.
