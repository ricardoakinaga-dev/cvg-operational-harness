# Verificação do planejamento do núcleo e da paridade

Data: 27/10/2026. Pedido de Ricardo: verificar se paridade com DeepSeek Harness e Claude Code, kernel estável, runtime robusto, orquestração, policies, sessões, MCP e subagentes estão bem definidos e conduzem a construção do CVG Operational Harness.

**O planejamento estratégico está alinhado a esse objetivo. A passagem para execução ainda é parcial: os backlogs cobrem as capacidades e têm dependências coerentes, mas várias entregas continuam sem contrato executivo reconciliado, construção integrada ou aceite atual.** A prioridade central é o núcleo. O produto acima serve para exercitar e validar suas interfaces; login visual, homologação hospitalar e piloto têm escopo próprio.

Esta verificação cruza os planos de paridade, decisões arquiteturais, SPECs de fundação, recibos de aprovação e coordenação recente. Não cria outra carteira, não altera as prioridades canônicas P0/P1 dos cartões e não concede autorização técnica ou produção.

**O que foi conferido**

- DeepSeek: [roadmap0379](03_build/0379_roadmap_paridade_100_deepseek.md) e [backlog0380](03_build/0380_backlog_paridade_100_deepseek.md).
- Claude Code: [plano0381](03_build/0381_plano_executivo_paridade_claude_code.md), [roadmap0382](03_build/0382_roadmap_paridade_claude_code.md) e [backlog0383](03_build/0383_backlog_paridade_claude_code.md).
- Arquitetura: ADR002, ADR005, ADR010 e ADR011; contrato do kernel0181; SPECs0221/0222/0225 e decisões humanas de16/10.
- Planos de execução Claude100 e PROD0624, complemento de coordenação de27/10, claims e eventos recentes do GBrain.

Foram extraídos **148 cartões:111 PAR e37 C100**, com **326 relações explícitas de dependência/reuso obrigatório**. A verificação dessa estrutura não encontrou ciclos ou IDs de dependência inexistentes. Todas as dez áreas técnicas conferidas têm cartões e critérios de aceite. Isso demonstra cobertura documental e coerência do grafo declarado; não demonstra completude de cada SPEC nem funcionamento do software.

**Separação de responsabilidades que o plano precisa preservar**

O [kernel mínimo da ADR011](architecture/adrs/ADR-011-kernel-de-plugins-com-controles-obrigatorios.md) contém o loop, o host de plugins e seus pontos de interceptação. Policies, approvals, orçamento, auditoria, journal e pausa entram como controles obrigatórios do perfil. Ferramentas, providers e canais entram como capacidades.

Pela [ADR002](architecture/adrs/ADR-002-runtime-separated-orchestrator.md), o orquestrador decide o próximo passo e recebe descritores não executáveis. O runtime mantém a autoridade sobre orçamento, governança, execução e resultado. O orquestrador não chama uma ferramenta por fora do kernel.

Pela [ADR005](architecture/adrs/ADR-005-policy-governs-effects.md), a ordem é **policy → approval quando exigido → efeito**. Descobrir uma ferramenta, carregar uma skill, conectar MCP, aprovar um plano ou criar um subagente não concede autoridade adicional.

**Cobertura das prioridades e estado de preparação**

| Área prioritária        | Onde está planejada                         | O que já está definido                                                                                      | O que falta para considerar construída e aceita                                                                              |
| ----------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Kernel e runtime        | PAR-K01/K03/K04;C100-Q01                    | Pipeline único, checkpoint, lifecycle e jornada governada; SPECs de fundação existentes                     | Reconciliar deltas aceitos e pendentes, integrar a candidata e provar os perfis pela fronteira pública                       |
| Policies e controles    | ADR005/011;SPEC0181;PAR-K05;C100-H01/B01    | Controle obrigatório, negação monotônica, approval vinculado, budget e isolamento                           | Revalidar invariantes na composição final, incluindo extensões, filhos e recuperação; fechar perfis e budget agregado        |
| Orquestração            | ADR002;PAR-K06/O06/O08/O09/O13;C100-L01/O03 | Steering, workflow durável, goals, planos, mailbox e teams com dependências                                 | Contratos de estado e transição, owner efetivo, implementação e provas de cancelamento/restart sem efeito duplicado          |
| Sessões e contexto      | PAR-S01/S02/S04;C100-S01/C01/C02            | Persistência pública, ownership, projeções, fork e origem das instruções; SPEC0221 detalhada                | Aplicar o recorte aprovado, cumprir journal/migrations anteriores e provar retomada entre processos e isolamento             |
| Streaming e SDK         | PAR-M01/A01/A05;C100-S02                    | Resultado terminal único, cursor, backpressure e retomada                                                   | Implementar e verificar fluxo incremental; stdio ou leitura paginada isoladamente não encerram esses aceites                 |
| MCP                     | PAR-P01;C100-P01/P02                        | Cliente governado stdio/HTTP, configuração explícita, credenciais, resources, elicitação e servidor do host | SPEC de engenharia da fatia com interfaces/ownership/limites, construção do adaptador e testes de interoperabilidade e falha |
| Skills e hooks          | PAR-T07/K09/K10;C100-T01/K01/K02            | Discovery, origem/hash, lifecycle, handlers e proibição de ampliar grants                                   | Fechar contratos e dependências de perfis/lifecycle; provar carregamento progressivo e execução governada                    |
| Subagentes e background | PAR-O01/O02/O03;C100-O01/O02/O03            | Spawn/fork, grants por interseção, budget herdado, mailbox, attach/stop/respawn                             | SPEC do supervisor e ciclo de vida, construção integrada e provas de filho/neto, concorrência e recuperação                  |
| Contenção               | PAR-X01–X04                                 | Subprocesso único, ambiente permitido, Landlock real e testes nativos                                       | Implementar/qualificar os perfis declarados; existência de bubblewrap não encerra todas as obrigações                        |
| Medição e aceite        | PAR-Q01/Q05/Q06;C100-Q01/Q02/Q04/Q05        | Catálogos, negativos, mesma candidata e aceite por capacidade                                               | Publicar medidores e resultados atuais; kit de testes ou aprovação de componente não equivale a M1/paridade                  |

“Definido no roadmap” significa resultado e aceite descritos. “Pronto para BUILD” também exige SPEC suficiente, dependências e autoridade aplicáveis, task e claim. “Construído” exige código conectado. “Aceito” exige a prova correspondente na candidata identificada. Esses estados não podem ser fundidos em um único percentual.

**Pontos que precisam de correção no acompanhamento**

1. **Execução recente concentrada na infraestrutura de evidência.** O complemento de coordenação atual organiza primeiro CI0261/N1 e depois contratos, OIDC, implantação e consumidor. N1 tem valor para a confiabilidade da qualificação, mas não substitui a entrega de sessões, MCP ou supervisor. O acompanhamento precisa explicitar a ligação de cada atividade de suporte ao próximo aceite do núcleo e a fila material que será retomada.
2. **Há descrições históricas que já não representam os avanços.** O PAR-K01 ainda afirma que `CONTROLLED_RUNTIME` executa fora do kernel, enquanto a main examinada no relatório de paridade já encaminha `test-lab` para `executeControlledKernel`. O texto antigo não deve ser usado para reconstruir uma implementação já entregue nem para fechar o cartão inteiro sem a prova restante.
3. **Aprovação existente e texto inicial de SPEC estão misturados.** SPECs0221/0222/0225 conservam estados iniciais de proposta, mas o recibo de16/10 concede aprovação com ajustes delimitados. A tarefa é aplicar e reconciliar exatamente esses recortes, não pedir a mesma decisão novamente nem tratar a aprovação como aceite integral. Os planos também precisam discriminar a fatia já construída da dependência que ainda falta integrar.
4. **MCP e subagentes têm bons aceites de roadmap, mas isso ainda não é projeto executivo completo.** Na busca dirigida das SPECs do núcleo não foi localizada uma SPEC dedicada do cliente/servidor MCP ou do supervisor com alcance dos cartões citados. Referências a MCP/subagentes em capturas Claude/Codex não são o contrato de execução desses serviços no CVG. A preparação dessas SPECs pode avançar sem iniciar BUILD dependente ou duplicar o runtime.
5. **Responsável de função não é sempre executor atual.** L1–L5 estão descritos no plano, mas os claims recentes mostram tarefas concretas na cadeia N1. Eventos de GBrain registraram espera por distribuição de nova tarefa; claims posteriores já deram trabalho específico a33E9 e7AD2. Portanto não se conclui que os agentes estejam parados. O ponto a corrigir é manter owner, próxima entrega, dependência e devolução de cada fatia do núcleo explícitos.
6. **O medidor de paridade ainda não comprova construção integral.** Os catálogos e estados examinados no relatório anterior continuam sem um conjunto de resultados completos atuais. Testes do mecanismo de evidência, o checklist65% e a nota arquitetural aproximada75 não substituem o aceite das capacidades.

Esses são achados de planejamento e rastreabilidade. Não são novos achados de vulnerabilidade ou autorização para dispensar gates. Os índices históricos e documentos congelados devem ser preservados; a reconciliação deve usar seus recibos e atualizações canônicas pelos responsáveis.

**Ordem de entrega coerente com a prioridade do núcleo**

A sequência abaixo reutiliza os marcos do0382. Não remove as famílias posteriores dos programas completos.

| Marco existente                   | Prioridade técnica                                                                   | Demonstração para encerrar o marco                                                                                                                                               |
| --------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M1 — Jornada mínima governada** | Kernel/runtime, policies, checkpoint, sessão e contenção exigida pelo perfil         | Abrir sessão → READ → WRITE retida → approval autenticado → retomada → restart sem repetir efeito; conformidade e negativos na mesma candidata                                   |
| **M2 — Continuidade útil**        | Ownership entre processos, projeções, fork, contexto, streaming e budget persistente | Outro processo reconstrói estado e pendências; reconexão não perde/duplica eventos; fork não herda approval; concorrência não amplia saldo                                       |
| **M3 — Ecossistema governado**    | MCP, skills, hooks e plugins                                                         | Servidor sintético interoperável, ferramenta passando pelo mesmo pipeline; schema, credencial, destino, timeout e cancelamento inválidos recusados; lifecycle e cleanup provados |
| **M4 — Autonomia supervisionada** | Subagentes, workflows, mailbox, jobs e planejamento                                  | Filho usa subconjunto da autoridade; budget agregado limita pai/filhos; cancel alcança netos; restart não duplica mensagem/efeito; plano nunca substitui approval                |

Policies, auditoria, isolamento, budgets e cancelamento são exigências transversais desde M1. Não ficam para uma fase posterior à autonomia. Medição por capacidade e controles negativos acompanham cada entrega; não são uma atividade exclusivamente final.

Os contratos das próximas fases podem ser preparados em paralelo, com caminhos e donos conciliados. A implementação segue as dependências exatas dos cartões: a tabela de marcos não declara um grafo novo nem permite iniciar subagentes antes das fundações necessárias. M5–M7 e o restante da paridade original continuam no alvo, com suas condições próprias.

**Contratos que devem estar fechados antes da construção das próximas fatias**

- **Sessões:** identidade/tenant, único writer autorizado, create/open/read/append/flush/close, cursor/ordem, troca de processo, falha de commit, versão de configuração e distinção entre retomada e fork. Os aceites de ownership já estão detalhados na0221; projeções e experiência de continuidade pertencem aos cartões seguintes.
- **MCP:** responsabilidade de cliente e servidor; transportes realmente necessários; handshake/versionamento; registro/classificação de ferramenta e schema; credencial e destino autorizados; timeout/cancelamento/caps; reconnect; ownership de subprocesso; resources/instruções como dados não confiáveis; teste positivo real na fronteira e negativos conhecidos.
- **Subagentes/orquestração:** ID e linhagem; spawn/fork; autoridade por interseção; isolamento de contexto; profundidade/fanout; reserva e consumo agregados; estados e causas de término; mailbox; wait/stop/respawn; reconciliação no restart; cancelamento da árvore e descarte sem mascarar o erro primário.
- **Policies:** precedência de allow/deny/ask/handoff, guardas que só restringem, approval de uso único vinculado ao comando, falha fechada e trilha de auditoria. Hooks, instruções, descoberta e resultados do modelo não podem transformar dados em autorização.

Os números, APIs e detalhes ainda não decididos devem ser fixados nas SPECs do dono correspondente antes do BUILD. Esta lista confere o conteúdo esperado dos contratos e não escolhe esses detalhes no lugar da SPEC.

**Próxima ação concreta de coordenação**

O integrador responsável deve reconciliar os recibos e os estados de **PAR-K01/K03/K04/S01/X01–X04 e C100-Q01**, e publicar, nos planos e claims existentes, o próximo recorte material de M1: candidato/versão, fonte de autoridade, dependências atendidas ou pendentes, paths, executor, prova e responsável pelo aceite. As pendências de CI que realmente bloqueiam essa prova devem estar nomeadas.

Em paralelo, reservar responsáveis para preparar as SPECs MCP e supervisor e para reconciliar a0221 dentro do recorte já aprovado. O fechamento deve devolver a capacidade e sua evidência à carteira canônica, não apenas acrescentar outra rodada de diagnóstico. Não assumir leases de pares ou autorizar código por silêncio.

Esse ajuste dá visibilidade à prioridade reafirmada por Ricardo sem abandonar a governança, descartar os avanços existentes ou transformar o produto de validação em objetivo principal.

**Evidências e limite da conclusão**

- [Task, critérios e18 fontes pinadas](04_audit/evidence/PLAN-CORE-ALIGN-20261027-CODEX-81C4/task.json).
- [Grafo declarado:148 cartões e326 relações](04_audit/evidence/PLAN-CORE-ALIGN-20261027-CODEX-81C4/dependency-check.json).
- [Mapa das prioridades para cartões existentes](04_audit/evidence/PLAN-CORE-ALIGN-20261027-CODEX-81C4/priority-coverage.json).
- [Decisões humanas de16/10](04_audit/evidence/USER-DECISIONS-20261016/spec-gates.json).
- [Relatório de paridade do núcleo](relatorio_paridade_nucleo_deepseek_claude_2026-10-27.md), com fonte publicada e limites da comparação.
- [Coordenação de27/10](../.agent/plans/pending-closure-coordination-20261027.md) e [claims](08_runtime/agent_coordination.md).

A conclusão é documental: planejamento estratégico coerente, execução e rastreabilidade ainda parcialmente alinhadas. A busca dirigida de contratos e a análise do grafo não substituem revisão semântica completa nem testes do runtime. Não houve alteração de fonte, nova execução de agente, certificação ou aceite de produção. Os ledgers compartilhados ocupados por pares recebem deltas no recibo próprio desta verificação.
