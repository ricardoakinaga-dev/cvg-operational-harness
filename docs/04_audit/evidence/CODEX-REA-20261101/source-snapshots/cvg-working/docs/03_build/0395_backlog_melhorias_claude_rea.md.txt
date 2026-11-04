# 0395 — Backlog de execução das melhorias identificadas pela REA

Task `REA-CLAUDE-PLAN-20261022`,22/10/2026. Recorte operacional das nove oportunidadesCC22; [roadmap0394](0394_roadmap_melhorias_claude_rea.md), [relatório0623](../04_audit/0623_claude_code_improvements_2026-10-22.md) e [matriz de origem](../04_audit/evidence/REA-CLAUDE-20261022/improvement-matrix.json).

Atualização documental `OPENCLAUDE-DOCS-20261101`,01/11/2026: incorporados o [relatório Open-ClaudeCode](../04_audit/evidence/OPENCLAUDE-REA-20261101/REPORT.md), suas dez contraprovas e o [caminho de produção0394](0394_roadmap_melhorias_claude_rea.md#caminho-crítico-até-produção). A origem adicional é estática, na revisão1f0fab6/CLI2.1.88; não substitui pin302, não altera estados dos pais e não demonstra defeitos equivalentes no CVG.

## Como usar este backlog

As16 fichas abaixo reutilizam IDs de cartões existentes. **Estado, dono e dependências canônicos continuam em0383/0380**; este arquivo não cria novos status ou outra fila. As descrições detalham a contribuição ao recorte. Concluir a contribuição não fecha automaticamente o cartão pai nem muda seus aceites. Confirme o estado atual e o claim do dono antes de trabalhar.

Snapshot de planejamento: main420b97b3373389f30ac82c4d4078a21b2363fdf9. Q01 observado IN_PROGRESS e demais selecionados TODO; isso é observação datada em [canonical-card-snapshot.json](../04_audit/evidence/REA-CLAUDE-PLAN-20261022/canonical-card-snapshot.json), não estado editável neste arquivo. Os quatro pré-requisitosG01–G04 ficam no pai/Q01; nenhum deles recebe novo aceite por este planejamento.

Cada ficha tem preparação documentalT1 possível dentro do claim e BUILD alvoT3, sujeito ao gate e à qualificação dos reusos. PRIORIDADE é a do pai no snapshot. Ordem na lista é uma leitura operacional, não autorização de antecipar dependências.

## Índice priorizado

| Cartão existente      | Prioridade do pai | Entrega neste recorte                                         | Origem                   |
| --------------------- | ----------------- | ------------------------------------------------------------- | ------------------------ |
| [C100-Q01](#c100-q01) | P0                | Fundação verificável e composição atual                       | Pré-requisito comum      |
| [C100-T01](#c100-t01) | P1                | Discovery leve e corpo de skill sob demanda                   | CC22-01, CC22-02         |
| [C100-T02](#c100-t02) | P1                | Inventário de plugin, perfil de validação e custo de contexto | CC22-01                  |
| [C100-E01](#c100-e01) | P1                | Avaliação pareada com/sem extensão e mocks padrão             | CC22-03                  |
| [C100-E02](#c100-e02) | P1                | Promoção de extensão vinculada à prova atual                  | CC22-03                  |
| [C100-S01](#c100-s01) | P1                | Continue/resume/fork recompõem o contexto correto             | CC22-05                  |
| [C100-C02](#c100-c02) | P1                | Snapshot efetivo de instruções/prompt por sessão              | CC22-04                  |
| [C100-H01](#c100-h01) | P0                | Perfis de permissão e modo restricted verificáveis            | CC22-04; Open-ClaudeCode |
| [C100-H02](#c100-h02) | P1                | Configuração efetiva, safe/bare e diagnóstico                 | CC22-04; Open-ClaudeCode |
| [C100-B01](#c100-b01) | P0                | Saldo durável e reservas concorrentes por árvore              | CC22-07                  |
| [C100-S02](#c100-s02) | P1                | Geração incremental com lifecycle, cursor e terminal único    | CC22-06                  |
| [C100-P01](#c100-p01) | P1                | Transporte/configuração de clienteMCP governado               | CC22-09                  |
| [C100-P02](#c100-p02) | P1                | Resources/prompts/entrada humana MCP correlacionados          | CC22-09                  |
| [C100-K01](#c100-k01) | P1                | Hooks declarativos no lifecycle existente                     | CC22-08                  |
| [C100-O01](#c100-o01) | P1                | Perfis de filhos com autoridade e budget herdados             | Dependência deCC22-07/08 |
| [C100-K02](#c100-k02) | P1                | Handlers de hooks contidos sob os mesmos limites              | CC22-08                  |

## Regras comuns de entrada e encerramento

1. Conferir o cartão pai em0383 e cadaPAR em0380; localizar receipts/gates na mesma fonte e respeitar claims ativos. Reuso integrado não exige reimplementação; receipt local antigo não certifica composição nova.
2. Definir WHAT/contrato/provas e revisão explícitaT3 antes do código; migrations/identidade/autoridade não são detalhe de implementação. Mudar o pin302 ou o denominador134 também exige decisão registrada.
3. Construir em candidata própria sobre fonte atual, com paths/DB/ports/gerados de ownership explícito; dados sintéticos. Não usar checkout compartilhado antigo como se fosse a main publicada.
4. Demonstrar caso positivo e negativo no boundary público e rodar gates proporcionais da constituição emNode22; revisão independente antes de aceitar o delta. Ao fim da rodada com código, certificação e claims pertinentes conforme regras do repositório.
5. Guardar fonte/hash, comando/exit, resultados brutos, limitações e decisão. Atualizar o cartão canônico, log e estado pelo integrador. Não promover `NOT_RUN`, `INCOMPLETE`, parser/ajudaCLI ou simulação a paridade funcional.

As fichas não autorizam provider/canal/dado real, shell ou rede livres, produção ou publicação de relatório. A barra do produto, D2/NO_MODEL, ADR010 e o gate de release permanecem separados.

## Contraprovas Open-ClaudeCode incorporadas

OC01–OC10 são identificadores de critérios derivados, **não novas tasks nem novos estados**. Fontes/linhas, Evidence IDs e limites estão no [relatório fixado](../04_audit/evidence/OPENCLAUDE-REA-20261101/REPORT.md#riscos-do-upstream-que-viram-contraprovas-para-o-cvg). Os critérios detalham falhas a exercitar nas SPECs/fatias existentes; não declaram implementação, revisão ou aceite. Preparação documental é T1; mudanças de contrato, persistência, identidade e autoridade continuam sob os gatesT3 dos pais. Controles que não fazem parte do release selecionado continuam nas carteiras, sem ativação implícita ou novo requisito geral de paridade para0373.

| Critério/origem upstream                          | Cartão canônico e dono de função                   | Prova positiva a registrar                                                                                  | Contraprova que deve impedir falso sucesso                                                                                             | Artefato e gate                                                                            |
| ------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| OC01 — tracker sem uso integrado                  | C100-B01/O01; L1/L4; RT01 como reuso               | Uso real cobrado uma vez, reserva atômica de dois filhos e saldo após restart                               | Provider sem reserva, cobrança dupla ou crédito fictício após efeito incerto                                                           | Request/usage/settlement correlacionados e saldo durável; T3, sem reimplementar RT01       |
| OC02 — stop entre etapas e await pendente         | C100-Q01/K02/O01; kernel/L1/L3/L4; RT02 como reuso | Porta cooperativa encerra e libera recursos dentro do prazo contratado                                      | Porta não cooperativa/cancelada não admite novo dispatch; efeito iniciado sem confirmação permanece incerto                            | Tempos, razão terminal, chamadas observadas e recibos de quiescência; contrato do pai/RT02 |
| OC03 — human gate posterior e reasoner conclusivo | C100-Q01/H01/P02; L1/L2/L5                         | Approval autenticado da operação exata permite um efeito e retomada                                         | `continue`, verify falho/desligado, timeout ou mensagem do modelo não marcam sucesso nem autorizam WRITE                               | Pedido/aprovação/efeito e negativo de corpo não iniciado; T3                               |
| OC04 — mailbox/corrupção mascarada como vazio     | C100-S01/O01 e PAR-O03; L1/L4                      | Mensagem persistida, lida e confirmada com identidade; limpeza concorrente é consistente                    | JSON truncado/residual, falha de leitura ou clear concorrente produz erro/recuperação explícitos, sem perder mensagem silenciosamente  | Estado antes/depois, erro e reconciliação; store/supervisor existentes, T3                 |
| OC05 — lote retirado antes de append falho        | C100-S01/Q01; L1/L5                                | Append confirmado fica recuperável no segundo processo                                                      | Falha antes/depois de write não deixa promessa sem terminal, lote perdido ou confirmação sem durabilidade                              | Injeção de falha, log bruto, resultado terminal e replay; T3                               |
| OC06 — input muda após classificação              | C100-H01/K01/K02/P01; L2/L3                        | Input final autorizado passa pelos controles antes do corpo                                                 | Hook que converte READ em WRITE/EXTERNAL invalida admissão anterior; deny/ask ou grant insuficiente bloqueia início                    | Argumentos/digests antes/depois e ordem do pipeline; T3                                    |
| OC07 — retry MCP após possível efeito             | C100-P01/P02; L3/L2; SPEC0266                      | Reconexão dentro do prazo restante; READ/replay seguro mantém correlação                                    | Queda após início de efeito não repete WRITE por padrão, não zera prazo/budget e não vira COMPLETED                                    | Tentativas/efeito/prazo e disposição de incerteza; SPEC0266 e gateT3 próprios              |
| OC08 — filho async desligado do pai               | C100-O01/K02 e PAR-K06/O03; L4/L3                  | Filho sob grant/budget herdados retorna resultado e recibo físico de término                                | Filho não amplia autoridade; cancelamento ou sobrevivência permitida é explícito e não se deduz de status do pai                       | Linhagem, reservas, cancelamento e recursos; reusar0302/0306, T3                           |
| OC09 — unsubscribe sem parar produtor             | C100-S02/P02 e PAR-M01/A05; L2                     | Chunks, cursor, reconexão e terminal único funcionam com consumidor lento e buffers limitados               | EOF, unsubscribe, replay ou parcial não provam cancelamento físico nem resposta final                                                  | Trace produtor/transporte/consumidor, buffer e terminal; T3                                |
| OC10 — sandbox/hook dependente de configuração    | C100-H01/H02/K01/K02/T01/T02 e PAR-X01–04; L2/L3   | Ferramenta/hook autorizado executa no confinamento exigido; configuração efetiva é inspecionável e redigida | Isolamento obrigatório indisponível, extensão sem grant ou egress proibido impede corpo; segredo/default permissivo não vaza para dump | Matriz de modos, origem/config e recibo do enforcement no caminho real; T3/T4 conforme pai |

O mapa complementar do relatório cobre runtime, stop/retry, tools, permissões, agentes/teams, MCP, contexto, sessão, stream, hooks/skills/plugins, sandbox/host, persistência/segredos, diagnóstico e SDK/CLI/UI/distribuição. SDK/UI/distribuição foram inventariados com limites explícitos; não recebem prova funcional por essa listagem. Copiar implementação recuperada, trocar o kernel ou criar outro store/supervisor não é requisito de nenhum critério.

### Seleção e encerramento de uma fatia

O executor registra no cartão/SPEC existente quais critériosOC se aplicam à fatia e por quê; fixa candidata, interfaces públicas, fonte de evidência, dono e gatilho de revalidação. Cada prova guarda command/exit/signal, logs brutos, hashes, denominador e limite. Replay, falha e caso pendente permanecem preservados. `NOT_RUN`/`INCOMPLETE` não podem virar `DONE` por edição documental.

CI002/CI003 e QA da [continuidade0410](0410_aud0627_followup_execution.md) permanecem com seus claims. A prova local já existente de [RT01/RT02](../04_audit/evidence/AUD0627-FOLLOWUP-CODEX-20261101/runtime-consumption/result.json) é reuso a conferir na composição final; OC01/OC02 não abrem outra task para os mesmos reparos. C100-B01 continua tratando durabilidade/concorrência por árvore, além do erro de contagemRT01. Pares0394/0395 não alteram a barra0373 nem as decisões de operação0374.

### Reusos por revisão a conferir antes de construir

Na onda8 `c8be3a5168b1304ba4e3dc3d79a91c66ce494637` existem `packages/harness/src/session/persistence.ts`, `session/projection-cache.ts`, `model-compaction.ts`, `spill/composition.ts` e `packages/model-gateway/src/stream.ts`. A [observação de identidade](../04_audit/evidence/OPENCLAUDE-DOCS-20261101/reuse-source-observation.json) confirma seus blobs, sem executar ou aceitar o comportamento. Os próximos HOWs de S01/S02/C02 devem consumir esses módulos e os recibos do owner antes de propor novo store, provider incremental ou compactador. As descrições da inspeção de22/10 abaixo são contexto de origem; não são inventário negativo da candidata atual.

Para agentes/jobs, reconciliar0302/0306 e os claims D9/07/DF. Para MCP, consumir o contrato0266 e sua autoridade própria; rascunho ou revisão estática não substitui os cenários executados. O catálogo e o pai0383 decidem o saldo remanescente; a origem Open-ClaudeCode não reatribui tarefas dos pares.

## C100-Q01

**Fundação verificável e composição atual.** Origem: Pré-requisito comum. Prioridade do pai: P0. Dono de função: L5 — Oráculos, testes, medição e revisão.

- **O quê/onde:** packages/harness, persistência e comparador de referência já existentes. Fundação das nove oportunidades; não é melhoria adicional.
- **Como:** Reconciliar unidades e receipts já integrados; compor a jornada mínima com os mesmos controles, sem reiniciar executores.
- **DependênciasC100, sem alteração:** C100-G04.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-Q03, PAR-Q04, PAR-K01, PAR-K03, PAR-S01, PAR-X01, PAR-X02, PAR-X03, PAR-X04. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-Q01`; controles comuns acima.
- **Critério de pronto do recorte:** Sessão → READ → WRITE retida → approval autenticado → retomada/restart; um efeito só. Comparador rejeita controle incorreto e prova adulterada.
- **Como provar:** Jornada pública e contraprovas atuais; distinguir suporte local de referência funcional e do fechamento do pai.
- **Próxima ação:** Conferir o saldo deQ01/M1 e os receipts da composição; preparar somente o HOW remanescente.

## C100-T01

**Discovery leve e corpo de skill sob demanda.** Origem: CC22-01, CC22-02. Prioridade do pai: P1. Dono de função: L3 — MCP, hooks, skills e plugins.

- **O quê/onde:** packages/harness/src/skills, SkillDefinition e composição de contexto. Primeira fatia recomendada: inspeção offline. Não inclui toda compatibilidade de skills/plugins do pai.
- **Como:** Especificar compatibilidadeMarkdown/JSON sem mudar o manifesto strict em silêncio; descrever metadados primeiro e adquirir corpo/referências por seleção autorizada.
- **DependênciasC100, sem alteração:** C100-Q01.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-T07, PAR-C06, PAR-K05. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-T01`; controles comuns acima.
- **Critério de pronto do recorte:** JSON válido e skillMarkdown suportada têm origem/digest; seleção carrega só o corpo escolhido. Symlink/traversal, hash divergente e tool sem grant são recusados.
- **Como provar:** SI01–SI12 do contrato0623, controles de leitura fora do root e corpus sintético; medir bytes/tokens por estágio sem executar conteúdo.
- **Próxima ação:** Consumir0255 já decidida e seus recibos; reconciliar Q01/M1/PAR-K05 e separar a inspeção existente da compatibilidade SKILL.md, discovery e aquisição seletiva. Especificar somente o delta remanescente de SI01–SI12, sem pedir de novo a mesma aprovação.

## C100-T02

**Inventário de plugin, perfil de validação e custo de contexto.** Origem: CC22-01. Prioridade do pai: P1. Dono de função: L3 — MCP, hooks, skills e plugins.

- **O quê/onde:** packages/platform/src/plugin-gateway.ts, schemas e hostCLI/console. Não copiar regras de ícone/README do marketplace; não enfraquecer PluginManifestSchema strict nem confundir inspeção com grant.
- **Como:** Projetar identidade, componentes, dependências, requisitos e footprint sobre registry existente; separar inventário, formato e admissão, sem auto-instalar.
- **DependênciasC100, sem alteração:** C100-T01.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-H04, PAR-K04, PAR-H02. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-T02`; controles comuns acima.
- **Critério de pronto do recorte:** Manifesto válido com requisito de admissão ausente permanece não admitido; custo permanente e invocação são separados/versionados. Cobertura incompleta, versão alterada ou upgrade concorrente não reutilizam aceite.
- **Como provar:** Fixtures válida/inválida/warning, estimativas por versão de método e contraexemplo de cobertura parcial; comparar apenas comportamento observado.
- **Próxima ação:** Fechar o contrato de relatório/perfis e sua origem em308, mantendo baseline302 até decisão específica.

## C100-E01

**Avaliação pareada com/sem extensão e mocks padrão.** Origem: CC22-03. Prioridade do pai: P1. Dono de função: L5 — Oráculos, testes, medição e revisão.

- **O quê/onde:** packages/agent-evals/src/runner.ts, evaluateRegressionGate e test-lab. FuncionalidadeClaude anunciada na ajuda, sem execução com modelo nesta investigação. Relatório local por default.
- **Como:** Reusar runner/medidores; fixar dataset, repetição, versão e braços pareados; servidores/scaffolds reais não entram por default.
- **DependênciasC100, sem alteração:** C100-T02, C100-Q01.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-Q03, PAR-Q04, PAR-T07. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-E01`; controles comuns acima.
- **Critério de pronto do recorte:** Dois braços da mesma fixture geram delta de qualidade/custo/latência. Braço ausente, timeout ou limite excedido é erro/INCOMPLETE; mock não inicia servidor real.
- **Como provar:** Caso que melhora e caso que piora de forma conhecida; orçamento/teto e ordenação sob repetição; separar indicador de skill invocada do escore.
- **Próxima ação:** Escrever SPEC do pareamento e do formato dos resultados a partir do runner existente.

## C100-E02

**Promoção de extensão vinculada à prova atual.** Origem: CC22-03. Prioridade do pai: P1. Dono de função: L5 — Oráculos, testes, medição e revisão.

- **O quê/onde:** catálogo/promoção de plugins, qualificação e CI existentes. Não publicar relatório externamente nem conceder release pelo escore; cartão pai pode ter aceites adicionais.
- **Como:** Vincular receipt aos hashes da extensão/dataset/grader/modelo/config; combinar regressão funcional com controles independentes.
- **DependênciasC100, sem alteração:** C100-E01.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-K04. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-E02`; controles comuns acima.
- **Critério de pronto do recorte:** Versão exata com evidência atual pode seguir o fluxo autorizado; nova versão invalida receipt antigo. Qualidade alta não compensa violação de grant/segredo/efeito.
- **Como provar:** Mutação de hash, fixture autocomplacente e falta de um braço devem impedir promoção; prova de custo por braço.
- **Próxima ação:** Definir contrato de receipt e relação com a aprovação de capability existente.

## C100-S01

**Continue/resume/fork recompõem o contexto correto.** Origem: CC22-05. Prioridade do pai: P1. Dono de função: L1 — Sessões, persistência, memória e snapshots.

- **O quê/onde:** composiçãoSDK, session events e checkpoint durável existentes. A origemCC22 examinou `packages/sdk/src/server.ts:274` em22/10; reconciliar a persistência/cache/fork já na candidata selecionada e provar a recomposição pública. Não construir segundo banco ou novo runtime.
- **Como:** Reconstruir estado/transcript autorizados no caminhoSDK; distinguir sessão, execução, fork e approval; reusar o store atual.
- **DependênciasC100, sem alteração:** C100-Q01.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-K03, PAR-S01, PAR-S02, PAR-S03, PAR-S04, PAR-S05, PAR-S07, PAR-H01. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-S01`; controles comuns acima.
- **Critério de pronto do recorte:** ProcessoB retoma fatos e pendências doA; fork ganha identidade e linhagem. Outrotenant, conteúdo opt-out e approval do original não são reutilizados.
- **Como provar:** Dois processos, restart e fork no boundary público; controle negativo entretenants e idempotência de efeito.
- **Próxima ação:** Conciliar persistência/projeção/fork e recibos da candidata; especificar apenas o delta público remanescente, incluindo OC04/OC05, sem confundir log persistido com sessão continuável.

## C100-C02

**Snapshot efetivo de instruções/prompt por sessão.** Origem: CC22-04. Prioridade do pai: P1. Dono de função: L1 — Sessões, persistência, memória e snapshots.

- **O quê/onde:** packages/platform/src/prompt-composer.ts, prompt-profile e contexto/compactação. Não é memória aprendidaC100-C01; esse cartão fica no programa integral fora do recorte.
- **Como:** Reusar checksums/blocos; definir origem, precedência, conteúdo/digest e fronteira de mudança no resume/compactação.
- **DependênciasC100, sem alteração:** C100-S01.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-C06, PAR-M02, PAR-K05, PAR-H02. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-C02`; controles comuns acima.
- **Critério de pronto do recorte:** Resume reproduz snapshot até fronteira explícita; origem proibida não entra. Compactação/override não removem obrigações nem elevam dados a instruções.
- **Como provar:** Dois launches com settings diferentes, resume e compactação; identidade do snapshot e contraprova de conteúdo não confiável.
- **Próxima ação:** Reconciliar model-compaction/spill e recibos existentes; fixar fontes do snapshot, preservação de obrigações/approval e fronteira legítima de versão no resume/compactação.

## C100-H01

**Perfis de permissão e modo restricted verificáveis.** Origem: CC22-04 e OC03/OC06/OC10. Prioridade do pai: P0. Dono de função: L2 — API/SDK/CLI, configuração e clientes.

- **O quê/onde:** kernel/policy, perfis do host e console/CLI, conforme C100-H01 do0383. Mantém prioridadeP0; configuração/precedência/diagnóstico ficam emH02.
- **Como:** Mapear allow/deny/manual/dontAsk/plan e restricted sobre o piso obrigatório de policy; tratar modos incompatíveis explicitamente e revalidar input final antes do corpo.
- **DependênciasC100, sem alteração:** C100-Q01.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-K05, PAR-U07, PAR-X04. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-H01`; controles comuns acima.
- **Critério de pronto do recorte:** READ permitido funciona; WRITE/EXTERNAL negado não inicia. Approval não é inferido de mensagem, timeout humano, resultado de modelo ou hook; regra cobre MCP e filhos.
- **Como provar:** Matriz de modos/permissões/restricted, grant insuficiente e input alterado por hook; provar zero entrada no corpo após negação, além do caso autorizado.
- **Próxima ação:** Reconciliar a matriz de modos/permissões com L1/L2 e os reusos existentes, preservando todos os controles obrigatórios.

## C100-H02

**Configuração efetiva, safe/bare e diagnóstico.** Origem: CC22-04 e OC10. Prioridade do pai: P1. Dono de função: L2 — API/SDK/CLI, configuração e clientes.

- **O quê/onde:** packages/shared/src/env.ts, configuração de hosts, prompt-composer e inspetor autenticado, conforme H02 do0383; reusar EnvSchema e snapshot existentes.
- **Como:** Declarar precedência user/project/local/managed, valor/origem e versão efetivos; safe/bare suprime customizações opcionais mantendo policy/approval e confinamento obrigatório. Restricted e a matriz de permissões pertencem aH01.
- **DependênciasC100, sem alteração:** C100-Q01, C100-C02.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-H02, PAR-M02, PAR-K05. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-H02`; controles comuns acima.
- **Critério de pronto do recorte:** Operador consulta valor efetivo/origem e snapshot; configuração inválida produz erro explícito. Sem auto-load indevido, elevação de grant ou segredo em dump/erro/log; safe/bare mantém controles.
- **Como provar:** Fontes conflitantes sintéticas, sessão retomada, hook/plugin/config e redigido; comparar dump com composição real, sem ler configuração pessoal. PAR-I03 permanece reuso opcional conforme pai.
- **Próxima ação:** Fechar contrato de precedência/diagnóstico e conjunto de customizações desligáveis sobre os componentes existentes, com snapshot/versão associados à sessão.

## C100-B01

**Saldo durável e reservas concorrentes por árvore.** Origem: CC22-07. Prioridade do pai: P0. Dono de função: L1 — Sessões, persistência, memória e snapshots.

- **O quê/onde:** packages/model-gateway/src/budget.ts, persistência e usage/checkpoints existentes. Mantém prioridadeP0; sem schema/migration antes do gate. Durabilidade em árvore é adaptaçãoCVG proposta, não comportamentoClaude comprovado.
- **Como:** Acrescentar reserva/settlement idempotentes e identidade pai/filho ao guard; não tratar consumo por execução como saldo global entreprocessos.
- **DependênciasC100, sem alteração:** C100-S01.
- **ReusosPAR obrigatórios do pai, sem alteração:** nenhum; delta próprio. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-B01`; controles comuns acima.
- **Critério de pronto do recorte:** Dois filhos disputam atomicamente o mesmo teto; restart preserva reservas/consumo. Recusa de reserva não chama provider; efeito incerto não devolve crédito fictício.
- **Como provar:** Concorrência real emPG sintético, crash antes/depois do settlement, replay e cancelamento; consumo reconciliado uma vez.
- **Próxima ação:** Especificar identidade da reserva, transação, expiração e recuperação sobre o gateway atual.

## C100-S02

**Geração incremental com lifecycle, cursor e terminal único.** Origem: CC22-06. Prioridade do pai: P1. Dono de função: L2 — API/SDK/CLI, configuração e clientes.

- **O quê/onde:** providersOpenAI/Ollama, packages/sdk/src/protocol.ts e stdio.ts:493. A referência anuncia stream-json; modelo real não rodou naREA. Usar protocolo de referência apenas com prova própria.
- **Como:** Ligar providers incrementais à projeção de eventos; preservar framing/backpressure/cancelamento e validar resultado terminal separado.
- **DependênciasC100, sem alteração:** C100-Q01.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-M01, PAR-A01, PAR-A02, PAR-A05, PAR-A07, PAR-H01. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-S02`; controles comuns acima.
- **Critério de pronto do recorte:** Chunks ordenados/correlacionados e exatamente um terminal; reconexão não duplica evento. EOF/corte/schema inválido não convertem parcial em resposta final.
- **Como provar:** Servidor sintético de falhas existente, consumidor lento, reconexão/cancelamento e verificação de buffers; não usar framingJSON como prova de streaming.
- **Próxima ação:** Consumir stream/transporte já implementados na candidata e conciliar seus owners; definir apenas envelopes/versionamento, limites e cancelamento fim a fim ainda sem prova, incluindo OC09.

## C100-P01

**Transporte/configuração de clienteMCP governado.** Origem: CC22-09. Prioridade do pai: P1. Dono de função: L3 — MCP, hooks, skills e plugins.

- **O quê/onde:** adapterMCP do ownerPAR-P01, packages/adapters e gateway existente. SDKJSON-RPC não é clienteMCP. Não conectar servidor real nem OAuth pessoal nesta fatia sintética.
- **Como:** Traduzir apenas transportes/escopos confirmados; strict-config, identidade do servidor/schema e credenciais por referência.
- **DependênciasC100, sem alteração:** C100-Q01.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-P01, PAR-X01, PAR-X02, PAR-X03, PAR-T12, PAR-H03. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-P01`; controles comuns acima.
- **Critério de pronto do recorte:** MCPREAD sintético funciona com grant; WRITE para emapproval. Discovery, schema drift, SSRF e credencial estrangeira não habilitam tool.
- **Como provar:** Servidor sintéticoREAD/WRITE, config estrita e cancelamento/cleanup; transportes fora do escopo ficam explicitamente não suportados.
- **Próxima ação:** Reconciliar contrato do cliente com PAR-P01/X02/T12 e fixar identidade do servidor/schema.

## C100-P02

**Resources/prompts/entrada humana MCP correlacionados.** Origem: CC22-09. Prioridade do pai: P1. Dono de função: L2 — API/SDK/CLI, configuração e clientes.

- **O quê/onde:** cliente/servidorMCP, packages/sdk e ports existentes deapproval/entrada. Não executar instruções vindas de resource e não confundir resposta humana com aprovação geral.
- **Como:** Expor apenas capabilities aprovadas e mapear resource/prompt como dados; elicitação passa pela identidade/autoridade da sessão.
- **DependênciasC100, sem alteração:** C100-P01, C100-S02.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-P01, PAR-A07, PAR-T11. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-P02`; controles comuns acima.
- **Critério de pronto do recorte:** Entrada humana legítima retoma uma vez; servidor e cliente sintéticos interoperam. Resposta falsa, URL hostil, excesso de bytes ou tenant/grant incorreto são recusados.
- **Como provar:** Boundary público cliente-servidor e replay/cancelamento; receipt autentica pessoa, sessão e pedido.
- **Próxima ação:** Definir mapeamento de elicitação para os ports atuais depois deP01 eS02.

## C100-K01

**Hooks declarativos no lifecycle existente.** Origem: CC22-08. Prioridade do pai: P1. Dono de função: L3 — MCP, hooks, skills e plugins.

- **O quê/onde:** packages/harness/src/kernel, packages/platform/src/event-bus.ts e bridgePAR. Hooks básicos podem avançar depois deQ01; handlers de agente/modelo pertencem aK02 e dependem do supervisor.
- **Como:** Inventariar eventos efetivamente confirmados e traduzir matcher/escopo/merge; reusar executor e audit existentes.
- **DependênciasC100, sem alteração:** C100-Q01.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-K04, PAR-K09, PAR-K10, PAR-X01. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-K01`; controles comuns acima.
- **Critério de pronto do recorte:** Evento público aciona hook uma vez com origem/versão e timeout; evento ausente/duplicado é detectado. Hook/output não amplia autoridade nem desliga controle.
- **Como provar:** Matriz finita de eventos com trigger público, precedência e contraprovas de timeout/conteúdo não confiável.
- **Próxima ação:** Preparar SPEC de configuração/lifecycle com os ownersK09/K10.

## C100-O01

**Perfis de filhos com autoridade e budget herdados.** Origem: Dependência deCC22-07/08. Prioridade do pai: P1. Dono de função: L4 — Subagentes, jobs, workspaces e hosts remotos.

- **O quê/onde:** supervisorPAR existente, packages/harness/contracts/platform. Incluído como pré-requisito canônico dos handlersK02, não como nova meta de todos os jobs/cloud/IDE.
- **Como:** Acoplar perfil/contexto/modelo/skills à interseção de grants, linhagem e teto reservado; não criar executor paralelo.
- **DependênciasC100, sem alteração:** C100-S01, C100-B01, C100-T01, C100-K01.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-O01, PAR-K06, PAR-S04, PAR-K05, PAR-M05. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-O01`; controles comuns acima.
- **Critério de pronto do recorte:** Filho autorizado executa e retorna resultado correlacionado; grants não ampliam, cancelamento chega àárvore e uso volta ao ledger.
- **Como provar:** Dois perfis, grant negado, teto compartilhado, cancelamento e restart; prova de lineage e idempotência.
- **Próxima ação:** Especificar perfis/linhagem só depois dos contratosS01/B01/T01/K01 qualificados.

## C100-K02

**Handlers de hooks contidos sob os mesmos limites.** Origem: CC22-08. Prioridade do pai: P1. Dono de função: L3 — MCP, hooks, skills e plugins.

- **O quê/onde:** adapters de hooks sobre model-gateway, egress, sandbox e supervisor existentes. Não executar callbacks/servidores reais nesta rodada; tipo sem prova de referência permaneceNOT_RUN/BLOCKED_REFERENCE para paridade.
- **Como:** Adicionar somente tipos confirmados na referência; HTTP, comando e modelo/agente compartilham grant/budget/cancelamento, com dono único.
- **DependênciasC100, sem alteração:** C100-K01, C100-O01, C100-P01.
- **ReusosPAR obrigatórios do pai, sem alteração:** PAR-K09, PAR-X01, PAR-X04. Consultar os estados/provas no0380; não estão presumidos como atendidos.
- **Gate:** preparaçãoT1; contrato/BUILD alvoT3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-K02`; controles comuns acima.
- **Critério de pronto do recorte:** Cada tipo adotado tem caminho positivo autorizado; comando fora da allowlist não inicia, egress inválido e timeout/cancelamento não viram sucesso.
- **Como provar:** Fixtures por tipo e negativos independentes; handlers de modelo/agente não recebem privilégio ou orçamento novo.
- **Próxima ação:** Reconciliar os tipos necessários e preparar SPEC apósK01/O01/P01 e reusos exigidos.

## Rastreabilidade das nove oportunidades

| OportunidadeREA                       | Fichas do recorte                    | Evidência/limite                                                                 |
| ------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| CC22-01 — inspeção/perfis/custo       | C100-T01/T02                         | Validação e inventário executados na referência; adaptaçãoCVG proposta           |
| CC22-02 — skill progressiva           | C100-T01                             | LoaderJSONCVGcontrastado comMarkdown; runtime lazy completo não provado noClaude |
| CC22-03 — eval com/sem extensão       | C100-E01/E02                         | CLI observada; execução com modeloNOT_RUN                                        |
| CC22-04 — config/prompt reproduzíveis | C100-C02/H01/H02                     | Checksums/tipos já existentes; integração e diagnóstico a completar              |
| CC22-05 — continuidade/fork           | C100-S01                             | Persistência já existe; recomposição noSDK a especificar                         |
| CC22-06 — streaming                   | C100-S02                             | Framing/cursor existem; providers examinados sem geração incremental             |
| CC22-07 — budget por árvore           | C100-B01; O01 como consumidor        | ExtensãoCVG transacional proposta; não presumir essa durabilidade noClaude       |
| CC22-08 — hooks                       | C100-K01/K02; O01 como pré-requisito | Event-bus existente; lifecycle/tipos precisam de provas específicas              |
| CC22-09 — MCP governado               | C100-P01/P02                         | GestãoMCP anunciada; MCP funcional realNOT_RUN nestaREA                          |

## Integração final do recorte

A composição deve demonstrar: abrir sessão → inspecionar/selecionar skill → READ permitido → WRITE retida → entrada humana autenticada → resposta incremental → cancelamento/reconexão → restart com contexto/usage preservados → avaliação com/sem extensão. Exercitar a mesma identidade de fonte/contratos e registrar os limites. Essa é a prova de integração das fichas, não nova task de status concorrente.

Nenhum item exige comprar conta ou abrir serviço externo nesta etapa documental. Para qualquer requisito de paridade cujo positivo dependa da referência real, manter o bloqueio explícito até autoridade/acesso/prova; um mockCVG não fecha sozinho o aceiteClaude. Não excluir cloud/IDE/memória/rewind do programa integral: estão fora deste recorte, permanecem no0382/0383.

## Próxima ação e handoff

**Próxima ação documental:** consumir0255 já decidida no recorte C100-T01/T02 e confrontar seu resultado com SI01–SI12, Q01/M1/PAR-K05 e os recibos atuais. O [contrato de origem](../04_audit/evidence/REA-CLAUDE-20261022/skill-preflight-proposal.md) orienta apenas o delta ainda necessário. Em paralelo, o integrador associa OC01–OC10 às fatias existentes e segue a ordem de integração/produção do0394. Não reabrir a mesma decisão humana nem declarar Q01/M1 fechado por inspeção.

[Incorporação Open-ClaudeCode](../08_runtime/handoffs/openclaude_docs_20261101.md) registra os arquivos efetivamente atualizados, a coordenação de navegação/ledgers e as verificações desta revisão documental. Implementação, revisão e aceite dos pais continuam separados.

[Handoff do planejamento](../08_runtime/handoffs/rea_claude_plan_20261022.md) contém as entradas prontas de estado/log/backlog para integração pelos donos dos ledgers. [Verificação](../04_audit/evidence/REA-CLAUDE-PLAN-20261022/verification.json) trata da qualidade deste planejamento, não de implantação das funcionalidades.
