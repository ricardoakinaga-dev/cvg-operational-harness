# 0395 — Backlog de execução das melhorias identificadas pela REA

Task `REA-CLAUDE-PLAN-20261022`, 22/10/2026. Recorte operacional das nove oportunidades CC22; [roadmap 0394](0394_roadmap_melhorias_claude_rea.md), [relatório 0623](../04_audit/0623_claude_code_improvements_2026-10-22.md) e [matriz de origem](../04_audit/evidence/REA-CLAUDE-20261022/improvement-matrix.json).

## Como usar este backlog

As 16 fichas abaixo reutilizam IDs de cartões existentes. **Estado, dono e dependências canônicos continuam em 0383/0380**; este arquivo não cria novos status ou outra fila. As descrições detalham a contribuição ao recorte. Concluir a contribuição não fecha automaticamente o cartão pai nem muda seus aceites. Confirme o estado atual e o claim do dono antes de trabalhar.

Snapshot de planejamento: main 420b97b3373389f30ac82c4d4078a21b2363fdf9. Q01 observado IN_PROGRESS e demais selecionados TODO; isso é observação datada em [canonical-card-snapshot.json](../04_audit/evidence/REA-CLAUDE-PLAN-20261022/canonical-card-snapshot.json), não estado editável neste arquivo. Os quatro pré-requisitos G01–G04 ficam no pai/Q01; nenhum deles recebe novo aceite por este planejamento.

Cada ficha tem preparação documental T1 possível dentro do claim e BUILD alvo T3, sujeito ao gate e à qualificação dos reusos. PRIORIDADE é a do pai no snapshot. Ordem na lista é uma leitura operacional, não autorização de antecipar dependências.

## Índice priorizado

| Cartão existente      | Prioridade do pai | Entrega neste recorte                                         | Origem                    |
| --------------------- | ----------------- | ------------------------------------------------------------- | ------------------------- |
| [C100-Q01](#c100-q01) | P0                | Fundação verificável e composição atual                       | Pré-requisito comum       |
| [C100-T01](#c100-t01) | P1                | Discovery leve e corpo de skill sob demanda                   | CC22-01, CC22-02          |
| [C100-T02](#c100-t02) | P1                | Inventário de plugin, perfil de validação e custo de contexto | CC22-01                   |
| [C100-E01](#c100-e01) | P1                | Avaliação pareada com/sem extensão e mocks padrão             | CC22-03                   |
| [C100-E02](#c100-e02) | P1                | Promoção de extensão vinculada à prova atual                  | CC22-03                   |
| [C100-S01](#c100-s01) | P1                | Continue/resume/fork recompõem o contexto correto             | CC22-05                   |
| [C100-C02](#c100-c02) | P1                | Snapshot efetivo de instruções/prompt por sessão              | CC22-04                   |
| [C100-H01](#c100-h01) | P0                | Configuração tipada, origem e precedência explicáveis         | Suporte a CC22-04         |
| [C100-H02](#c100-h02) | P1                | Modo de diagnóstico seguro e snapshot inspecionável           | CC22-04                   |
| [C100-B01](#c100-b01) | P0                | Saldo durável e reservas concorrentes por árvore              | CC22-07                   |
| [C100-S02](#c100-s02) | P1                | Geração incremental com lifecycle, cursor e terminal único    | CC22-06                   |
| [C100-P01](#c100-p01) | P1                | Transporte/configuração de cliente MCP governado              | CC22-09                   |
| [C100-P02](#c100-p02) | P1                | Resources/prompts/entrada humana MCP correlacionados          | CC22-09                   |
| [C100-K01](#c100-k01) | P1                | Hooks declarativos no lifecycle existente                     | CC22-08                   |
| [C100-O01](#c100-o01) | P1                | Perfis de filhos com autoridade e budget herdados             | Dependência de CC22-07/08 |
| [C100-K02](#c100-k02) | P1                | Handlers de hooks contidos sob os mesmos limites              | CC22-08                   |

## Regras comuns de entrada e encerramento

1. Conferir o cartão pai em 0383 e cada PAR em 0380; localizar receipts/gates na mesma fonte e respeitar claims ativos. Reuso integrado não exige reimplementação; receipt local antigo não certifica composição nova.
2. Definir WHAT/contrato/provas e revisão explícita T3 antes do código; migrations/identidade/autoridade não são detalhe de implementação. Mudar o pin 302 ou o denominador 134 também exige decisão registrada.
3. Construir em candidata própria sobre fonte atual, com paths/DB/ports/gerados de ownership explícito; dados sintéticos. Não usar checkout compartilhado antigo como se fosse a main publicada.
4. Demonstrar caso positivo e negativo no boundary público e rodar gates proporcionais da constituição em Node 22; revisão independente antes de aceitar o delta. Ao fim da rodada com código, certificação e claims pertinentes conforme regras do repositório.
5. Guardar fonte/hash, comando/exit, resultados brutos, limitações e decisão. Atualizar o cartão canônico, log e estado pelo integrador. Não promover `NOT_RUN`, `INCOMPLETE`, parser/ajuda CLI ou simulação a paridade funcional.

As fichas não autorizam provider/canal/dado real, shell ou rede livres, produção ou publicação de relatório. A barra do produto, D2/NO_MODEL, ADR010 e o gate de release permanecem separados.

## C100-Q01

**Fundação verificável e composição atual.** Origem: Pré-requisito comum. Prioridade do pai: P0. Dono de função: L5 — Oráculos, testes, medição e revisão.

- **O quê/onde:** packages/harness, persistência e comparador de referência já existentes. Fundação das nove oportunidades; não é melhoria adicional.
- **Como:** Reconciliar unidades e receipts já integrados; compor a jornada mínima com os mesmos controles, sem reiniciar executores.
- **Dependências C100, sem alteração:** C100-G04.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-Q03, PAR-Q04, PAR-K01, PAR-K03, PAR-S01, PAR-X01, PAR-X02, PAR-X03, PAR-X04. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-Q01`; controles comuns acima.
- **Critério de pronto do recorte:** Sessão → READ → WRITE retida → approval autenticado → retomada/restart; um efeito só. Comparador rejeita controle incorreto e prova adulterada.
- **Como provar:** Jornada pública e contraprovas atuais; distinguir suporte local de referência funcional e do fechamento do pai.
- **Próxima ação:** Conferir o saldo de Q01/M1 e os receipts da composição; preparar somente o HOW remanescente.

## C100-T01

**Discovery leve e corpo de skill sob demanda.** Origem: CC22-01, CC22-02. Prioridade do pai: P1. Dono de função: L3 — MCP, hooks, skills e plugins.

- **O quê/onde:** packages/harness/src/skills, SkillDefinition e composição de contexto. Primeira fatia recomendada: inspeção offline. Não inclui toda compatibilidade de skills/plugins do pai.
- **Como:** Especificar compatibilidade Markdown/JSON sem mudar o manifesto strict em silêncio; descrever metadados primeiro e adquirir corpo/referências por seleção autorizada.
- **Dependências C100, sem alteração:** C100-Q01.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-T07, PAR-C06, PAR-K05. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-T01`; controles comuns acima.
- **Critério de pronto do recorte:** JSON válido e skill Markdown suportada têm origem/digest; seleção carrega só o corpo escolhido. Symlink/traversal, hash divergente e tool sem grant são recusados.
- **Como provar:** SI01–SI12 do contrato 0623, controles de leitura fora do root e corpus sintético; medir bytes/tokens por estágio sem executar conteúdo.
- **Próxima ação:** Consolidar SI01–SI12 numa SPEC de aquisição/inspeção e mapear os campos não inferíveis de Markdown.

## C100-T02

**Inventário de plugin, perfil de validação e custo de contexto.** Origem: CC22-01. Prioridade do pai: P1. Dono de função: L3 — MCP, hooks, skills e plugins.

- **O quê/onde:** packages/platform/src/plugin-gateway.ts, schemas e host CLI/console. Não copiar regras de ícone/README do marketplace; não enfraquecer PluginManifestSchema strict nem confundir inspeção com grant.
- **Como:** Projetar identidade, componentes, dependências, requisitos e footprint sobre registry existente; separar inventário, formato e admissão, sem auto-instalar.
- **Dependências C100, sem alteração:** C100-T01.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-H04, PAR-K04, PAR-H02. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-T02`; controles comuns acima.
- **Critério de pronto do recorte:** Manifesto válido com requisito de admissão ausente permanece não admitido; custo permanente e invocação são separados/versionados. Cobertura incompleta, versão alterada ou upgrade concorrente não reutilizam aceite.
- **Como provar:** Fixtures válida/inválida/warning, estimativas por versão de método e contraexemplo de cobertura parcial; comparar apenas comportamento observado.
- **Próxima ação:** Fechar o contrato de relatório/perfis e sua origem em 308, mantendo baseline 302 até decisão específica.

## C100-E01

**Avaliação pareada com/sem extensão e mocks padrão.** Origem: CC22-03. Prioridade do pai: P1. Dono de função: L5 — Oráculos, testes, medição e revisão.

- **O quê/onde:** packages/agent-evals/src/runner.ts, evaluateRegressionGate e test-lab. Funcionalidade Claude anunciada na ajuda, sem execução com modelo nesta investigação. Relatório local por default.
- **Como:** Reusar runner/medidores; fixar dataset, repetição, versão e braços pareados; servidores/scaffolds reais não entram por default.
- **Dependências C100, sem alteração:** C100-T02, C100-Q01.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-Q03, PAR-Q04, PAR-T07. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-E01`; controles comuns acima.
- **Critério de pronto do recorte:** Dois braços da mesma fixture geram delta de qualidade/custo/latência. Braço ausente, timeout ou limite excedido é erro/INCOMPLETE; mock não inicia servidor real.
- **Como provar:** Caso que melhora e caso que piora de forma conhecida; orçamento/teto e ordenação sob repetição; separar indicador de skill invocada do escore.
- **Próxima ação:** Escrever SPEC do pareamento e do formato dos resultados a partir do runner existente.

## C100-E02

**Promoção de extensão vinculada à prova atual.** Origem: CC22-03. Prioridade do pai: P1. Dono de função: L5 — Oráculos, testes, medição e revisão.

- **O quê/onde:** catálogo/promoção de plugins, qualificação e CI existentes. Não publicar relatório externamente nem conceder release pelo escore; cartão pai pode ter aceites adicionais.
- **Como:** Vincular receipt aos hashes da extensão/dataset/grader/modelo/config; combinar regressão funcional com controles independentes.
- **Dependências C100, sem alteração:** C100-E01.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-K04. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-E02`; controles comuns acima.
- **Critério de pronto do recorte:** Versão exata com evidência atual pode seguir o fluxo autorizado; nova versão invalida receipt antigo. Qualidade alta não compensa violação de grant/segredo/efeito.
- **Como provar:** Mutação de hash, fixture autocomplacente e falta de um braço devem impedir promoção; prova de custo por braço.
- **Próxima ação:** Definir contrato de receipt e relação com a aprovação de capability existente.

## C100-S01

**Continue/resume/fork recompõem o contexto correto.** Origem: CC22-05. Prioridade do pai: P1. Dono de função: L1 — Sessões, persistência, memória e snapshots.

- **O quê/onde:** packages/sdk/src/server.ts:274, session events e checkpoint durável existentes. Cobrir o caminho SDK hoje single_pass/contexto novo; não construir segundo banco ou novo runtime.
- **Como:** Reconstruir estado/transcript autorizados no caminho SDK; distinguir sessão, execução, fork e approval; reusar o store atual.
- **Dependências C100, sem alteração:** C100-Q01.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-K03, PAR-S01, PAR-S02, PAR-S03, PAR-S04, PAR-S05, PAR-S07, PAR-H01. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-S01`; controles comuns acima.
- **Critério de pronto do recorte:** Processo B retoma fatos e pendências do A; fork ganha identidade e linhagem. Outro tenant, conteúdo opt-out e approval do original não são reutilizados.
- **Como provar:** Dois processos, restart e fork no boundary público; controle negativo entre tenants e idempotência de efeito.
- **Próxima ação:** Especificar a projeção de histórico e as identidades sem confundir log persistido com sessão continuável.

## C100-C02

**Snapshot efetivo de instruções/prompt por sessão.** Origem: CC22-04. Prioridade do pai: P1. Dono de função: L1 — Sessões, persistência, memória e snapshots.

- **O quê/onde:** packages/platform/src/prompt-composer.ts, prompt-profile e contexto/compactação. Não é memória aprendida C100-C01; esse cartão fica no programa integral fora do recorte.
- **Como:** Reusar checksums/blocos; definir origem, precedência, conteúdo/digest e fronteira de mudança no resume/compactação.
- **Dependências C100, sem alteração:** C100-S01.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-C06, PAR-M02, PAR-K05, PAR-H02. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-C02`; controles comuns acima.
- **Critério de pronto do recorte:** Resume reproduz snapshot até fronteira explícita; origem proibida não entra. Compactação/override não removem obrigações nem elevam dados a instruções.
- **Como provar:** Dois launches com settings diferentes, resume e compactação; identidade do snapshot e contraprova de conteúdo não confiável.
- **Próxima ação:** Definir quais fontes compõem o snapshot e quando uma nova versão é legítima.

## C100-H01

**Configuração tipada, origem e precedência explicáveis.** Origem: Suporte a CC22-04. Prioridade do pai: P0. Dono de função: L2 — API/SDK/CLI, configuração e clientes.

- **O quê/onde:** packages/shared/src/env.ts e host de configuração existente. Mantém prioridade P0 do pai. Não copiar o comportamento anunciado de ignorar configuração inválida no headless.
- **Como:** Reconciliar catálogo, tipos e fontes explícitas; dump redigido e perfil efetivo devem refletir a configuração que realmente governa a execução.
- **Dependências C100, sem alteração:** C100-Q01.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-K05, PAR-U07, PAR-X04. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-H01`; controles comuns acima.
- **Critério de pronto do recorte:** Operador vê valor efetivo/origem; versão/config inválida tem erro explícito. Campo oculto, variável indevida e segredo não entram em dump/log.
- **Como provar:** Conflitos entre fontes sintéticas e controles de redigido; comparar dump com composição real sem ler configuração pessoal.
- **Próxima ação:** Preparar contrato de precedência e diagnóstico sobre EnvSchema, sem criar outro sistema de settings.

## C100-H02

**Modo de diagnóstico seguro e snapshot inspecionável.** Origem: CC22-04. Prioridade do pai: P1. Dono de função: L2 — API/SDK/CLI, configuração e clientes.

- **O quê/onde:** host CLI, config tipada, prompt snapshot e controles do kernel. Não reproduzir bypassPermissions; nomes dos modos podem ser próprios, com semântica explícita.
- **Como:** Projetar safe/bare/restricted como supressão explícita de customizações opcionais, mantendo controles obrigatórios.
- **Dependências C100, sem alteração:** C100-Q01, C100-C02.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-H02, PAR-M02, PAR-K05. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-H02`; controles comuns acima.
- **Critério de pronto do recorte:** Diagnóstico identifica a personalização que alterou a composição; execução preserva policy/approval. Modo diagnóstico nunca amplia grant ou revela segredo.
- **Como provar:** Matriz de modos com hook/plugin/config sintéticos; provar ausência de auto-load indevido e presença dos controles obrigatórios.
- **Próxima ação:** Especificar o conjunto exato de customizações desligáveis e a evidência do modo efetivo.

## C100-B01

**Saldo durável e reservas concorrentes por árvore.** Origem: CC22-07. Prioridade do pai: P0. Dono de função: L1 — Sessões, persistência, memória e snapshots.

- **O quê/onde:** packages/model-gateway/src/budget.ts, persistência e usage/checkpoints existentes. Mantém prioridade P0; sem schema/migration antes do gate. Durabilidade em árvore é adaptação CVG proposta, não comportamento Claude comprovado.
- **Como:** Acrescentar reserva/settlement idempotentes e identidade pai/filho ao guard; não tratar consumo por execução como saldo global entre processos.
- **Dependências C100, sem alteração:** C100-S01.
- **Reusos PAR obrigatórios do pai, sem alteração:** nenhum; delta próprio. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-B01`; controles comuns acima.
- **Critério de pronto do recorte:** Dois filhos disputam atomicamente o mesmo teto; restart preserva reservas/consumo. Recusa de reserva não chama provider; efeito incerto não devolve crédito fictício.
- **Como provar:** Concorrência real em PG sintético, crash antes/depois do settlement, replay e cancelamento; consumo reconciliado uma vez.
- **Próxima ação:** Especificar identidade da reserva, transação, expiração e recuperação sobre o gateway atual.

## C100-S02

**Geração incremental com lifecycle, cursor e terminal único.** Origem: CC22-06. Prioridade do pai: P1. Dono de função: L2 — API/SDK/CLI, configuração e clientes.

- **O quê/onde:** providers OpenAI/Ollama, packages/sdk/src/protocol.ts e stdio.ts:493. A referência anuncia stream-json; modelo real não rodou na REA. Usar protocolo de referência apenas com prova própria.
- **Como:** Ligar providers incrementais à projeção de eventos; preservar framing/backpressure/cancelamento e validar resultado terminal separado.
- **Dependências C100, sem alteração:** C100-Q01.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-M01, PAR-A01, PAR-A02, PAR-A05, PAR-A07, PAR-H01. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-S02`; controles comuns acima.
- **Critério de pronto do recorte:** Chunks ordenados/correlacionados e exatamente um terminal; reconexão não duplica evento. EOF/corte/schema inválido não convertem parcial em resposta final.
- **Como provar:** Servidor sintético de falhas existente, consumidor lento, reconexão/cancelamento e verificação de buffers; não usar framing JSON como prova de streaming.
- **Próxima ação:** Definir envelopes/versionamento, limites e dono do cancelamento fim a fim.

## C100-P01

**Transporte/configuração de cliente MCP governado.** Origem: CC22-09. Prioridade do pai: P1. Dono de função: L3 — MCP, hooks, skills e plugins.

- **O quê/onde:** adapter MCP do owner PAR-P01, packages/adapters e gateway existente. SDK JSON-RPC não é cliente MCP. Não conectar servidor real nem OAuth pessoal nesta fatia sintética.
- **Como:** Traduzir apenas transportes/escopos confirmados; strict-config, identidade do servidor/schema e credenciais por referência.
- **Dependências C100, sem alteração:** C100-Q01.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-P01, PAR-X01, PAR-X02, PAR-X03, PAR-T12, PAR-H03. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-P01`; controles comuns acima.
- **Critério de pronto do recorte:** MCP READ sintético funciona com grant; WRITE para em approval. Discovery, schema drift, SSRF e credencial estrangeira não habilitam tool.
- **Como provar:** Servidor sintético READ/WRITE, config estrita e cancelamento/cleanup; transportes fora do escopo ficam explicitamente não suportados.
- **Próxima ação:** Reconciliar contrato do cliente com PAR-P01/X02/T12 e fixar identidade do servidor/schema.

## C100-P02

**Resources/prompts/entrada humana MCP correlacionados.** Origem: CC22-09. Prioridade do pai: P1. Dono de função: L2 — API/SDK/CLI, configuração e clientes.

- **O quê/onde:** cliente/servidor MCP, packages/sdk e ports existentes de approval/entrada. Não executar instruções vindas de resource e não confundir resposta humana com aprovação geral.
- **Como:** Expor apenas capabilities aprovadas e mapear resource/prompt como dados; elicitação passa pela identidade/autoridade da sessão.
- **Dependências C100, sem alteração:** C100-P01, C100-S02.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-P01, PAR-A07, PAR-T11. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-P02`; controles comuns acima.
- **Critério de pronto do recorte:** Entrada humana legítima retoma uma vez; servidor e cliente sintéticos interoperam. Resposta falsa, URL hostil, excesso de bytes ou tenant/grant incorreto são recusados.
- **Como provar:** Boundary público cliente-servidor e replay/cancelamento; receipt autentica pessoa, sessão e pedido.
- **Próxima ação:** Definir mapeamento de elicitação para os ports atuais depois de P01 e S02.

## C100-K01

**Hooks declarativos no lifecycle existente.** Origem: CC22-08. Prioridade do pai: P1. Dono de função: L3 — MCP, hooks, skills e plugins.

- **O quê/onde:** packages/harness/src/kernel, packages/platform/src/event-bus.ts e bridge PAR. Hooks básicos podem avançar depois de Q01; handlers de agente/modelo pertencem a K02 e dependem do supervisor.
- **Como:** Inventariar eventos efetivamente confirmados e traduzir matcher/escopo/merge; reusar executor e audit existentes.
- **Dependências C100, sem alteração:** C100-Q01.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-K04, PAR-K09, PAR-K10, PAR-X01. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-K01`; controles comuns acima.
- **Critério de pronto do recorte:** Evento público aciona hook uma vez com origem/versão e timeout; evento ausente/duplicado é detectado. Hook/output não amplia autoridade nem desliga controle.
- **Como provar:** Matriz finita de eventos com trigger público, precedência e contraprovas de timeout/conteúdo não confiável.
- **Próxima ação:** Preparar SPEC de configuração/lifecycle com os owners K09/K10.

## C100-O01

**Perfis de filhos com autoridade e budget herdados.** Origem: Dependência de CC22-07/08. Prioridade do pai: P1. Dono de função: L4 — Subagentes, jobs, workspaces e hosts remotos.

- **O quê/onde:** supervisor PAR existente, packages/harness/contracts/platform. Incluído como pré-requisito canônico dos handlers K02, não como nova meta de todos os jobs/cloud/IDE.
- **Como:** Acoplar perfil/contexto/modelo/skills à interseção de grants, linhagem e teto reservado; não criar executor paralelo.
- **Dependências C100, sem alteração:** C100-S01, C100-B01, C100-T01, C100-K01.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-O01, PAR-K06, PAR-S04, PAR-K05, PAR-M05. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-O01`; controles comuns acima.
- **Critério de pronto do recorte:** Filho autorizado executa e retorna resultado correlacionado; grants não ampliam, cancelamento chega à árvore e uso volta ao ledger.
- **Como provar:** Dois perfis, grant negado, teto compartilhado, cancelamento e restart; prova de lineage e idempotência.
- **Próxima ação:** Especificar perfis/linhagem só depois dos contratos S01/B01/T01/K01 qualificados.

## C100-K02

**Handlers de hooks contidos sob os mesmos limites.** Origem: CC22-08. Prioridade do pai: P1. Dono de função: L3 — MCP, hooks, skills e plugins.

- **O quê/onde:** adapters de hooks sobre model-gateway, egress, sandbox e supervisor existentes. Não executar callbacks/servidores reais nesta rodada; tipo sem prova de referência permanece NOT_RUN/BLOCKED_REFERENCE para paridade.
- **Como:** Adicionar somente tipos confirmados na referência; HTTP, comando e modelo/agente compartilham grant/budget/cancelamento, com dono único.
- **Dependências C100, sem alteração:** C100-K01, C100-O01, C100-P01.
- **Reusos PAR obrigatórios do pai, sem alteração:** PAR-K09, PAR-X01, PAR-X04. Consultar os estados/provas no 0380; não estão presumidos como atendidos.
- **Gate:** preparação T1; contrato/BUILD alvo T3. Contrato completo e autoridade em [0383](0383_backlog_paridade_claude_code.md), cartão `C100-K02`; controles comuns acima.
- **Critério de pronto do recorte:** Cada tipo adotado tem caminho positivo autorizado; comando fora da allowlist não inicia, egress inválido e timeout/cancelamento não viram sucesso.
- **Como provar:** Fixtures por tipo e negativos independentes; handlers de modelo/agente não recebem privilégio ou orçamento novo.
- **Próxima ação:** Reconciliar os tipos necessários e preparar SPEC após K01/O01/P01 e reusos exigidos.

## Rastreabilidade das nove oportunidades

| Oportunidade REA                      | Fichas do recorte                    | Evidência/limite                                                                      |
| ------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| CC22-01 — inspeção/perfis/custo       | C100-T01/T02                         | Validação e inventário executados na referência; adaptação CVG proposta               |
| CC22-02 — skill progressiva           | C100-T01                             | Loader JSON CVG contrastado com Markdown; runtime lazy completo não provado no Claude |
| CC22-03 — eval com/sem extensão       | C100-E01/E02                         | CLI observada; execução com modelo NOT_RUN                                            |
| CC22-04 — config/prompt reproduzíveis | C100-C02/H01/H02                     | Checksums/tipos já existentes; integração e diagnóstico a completar                   |
| CC22-05 — continuidade/fork           | C100-S01                             | Persistência já existe; recomposição no SDK a especificar                             |
| CC22-06 — streaming                   | C100-S02                             | Framing/cursor existem; providers examinados sem geração incremental                  |
| CC22-07 — budget por árvore           | C100-B01; O01 como consumidor        | Extensão CVG transacional proposta; não presumir essa durabilidade no Claude          |
| CC22-08 — hooks                       | C100-K01/K02; O01 como pré-requisito | Event-bus existente; lifecycle/tipos precisam de provas específicas                   |
| CC22-09 — MCP governado               | C100-P01/P02                         | Gestão MCP anunciada; MCP funcional real NOT_RUN nesta REA                            |

## Integração final do recorte

A composição deve demonstrar: abrir sessão → inspecionar/selecionar skill → READ permitido → WRITE retida → entrada humana autenticada → resposta incremental → cancelamento/reconexão → restart com contexto/usage preservados → avaliação com/sem extensão. Exercitar a mesma identidade de fonte/contratos e registrar os limites. Essa é a prova de integração das fichas, não nova task de status concorrente.

Nenhum item exige comprar conta ou abrir serviço externo nesta etapa documental. Para qualquer requisito de paridade cujo positivo dependa da referência real, manter o bloqueio explícito até autoridade/acesso/prova; um mock CVG não fecha sozinho o aceite Claude. Não excluir cloud/IDE/memória/rewind do programa integral: estão fora deste recorte, permanecem no 0382/0383.

## Próxima ação e handoff

**Primeira ação documental:** preparar a SPEC da inspeção offline C100-T01/T02 com SI01–SI12, confrontando o [contrato proposto](../04_audit/evidence/REA-CLAUDE-20261022/skill-preflight-proposal.md) e as dependências. Isso não declara Q01/M1 fechado nem torna o BUILD disponível por calendário.

[Handoff do planejamento](../08_runtime/handoffs/rea_claude_plan_20261022.md) contém as entradas prontas de estado/log/backlog para integração pelos donos dos ledgers. [Verificação](../04_audit/evidence/REA-CLAUDE-PLAN-20261022/verification.json) trata da qualidade deste planejamento, não de implantação das funcionalidades.
