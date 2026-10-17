# 0376 — Plano executivo de paridade integral com DeepSeek Harness

- Programa: `PARE100-20261014`. Pedido do usuário em 14/10/2026: plano executivo, roadmap e backlog para atingir 100% de pareamento, com remoção de arquivos legados e órfãos.
- Estado: `PLAN_READY`; implementação das novas capacidades `NOT_STARTED`. Limpeza local P100-001 executada em verificação. Produção `NO_GO`.
- Execução: [roadmap 0377](0377_roadmap_paridade_integral.md), [backlog 0378](0378_backlog_paridade_integral.md), [baseline 0611](../04_audit/0611_harness_deepseek_pairing_2026-10-14.md) e [evidência do planejamento/limpeza](../04_audit/0612_parity_plan_cleanup_2026-10-14.md).

## Resultado de negócio

O Centro Veterinário Guarapiranga passa a construir seus programas sobre um motor comum que fornece modelos, ferramentas, sessões, execução, autorização, auditoria e integrações. Cada produto conserva domínio, dados, processo, testes e release próprios. O núcleo nunca importa o produto, conforme ADR-010.

Hoje o núcleo governado existe, mas a plataforma ainda tem `CONTROLLED_RUNTIME` separado e o Assistente de Plantão chama o provider diretamente. A meta é que um consumidor use exports públicos ou SDK para executar o mesmo caminho governado, com resultado reconstruível, efeitos aprovados e recuperação demonstrada após falha.

## O significado verificável de 100%

**100% significa que toda capacidade funcional da referência congelada, incluída na matriz, possui implementação equivalente no CVG e evidência atual de aceite.** A comparação usa uma composição da referência com permissões controladas e cenários sintéticos. A governança adicional do CVG permanece obrigatória. Equivalência é de capacidade e comportamento contratado; não de quantidade de arquivos, linhas, bibliotecas ou bytes de código.

Esta meta amplia o escopo da avaliação 0611: interfaces, desktop, transportes externos, ferramentas avançadas, extensões e recursos experimentais distribuídos também entram. A estimativa anterior de aproximadamente 70% avaliava o motor com UI fora do denominador. **O percentual do escopo integral começa como `NOT_MEASURED`**; não transportar os 70% para a matriz ampliada.

Regras de medição:

1. P100-003 expande a matriz por ferramenta, serviço, evento, método de API/SDK, configuração relevante, perfil, backend e jornada de interface. Cada requisito tem ID, fonte com hash, owner, task, procedimento de teste e resultado esperado.
2. Todos os 318 manifests encontrados em 55 famílias devem ser rastreados; aplicativos, Python, backends nativos e configurações também entram. Pacotes utilitários/de infraestrutura comprovam fechamento de dependências e suportam requisitos; não são replicados apenas para igualar a contagem.
3. Numerador: requisitos obrigatórios com `PASS_CURRENT`. Denominador: todos os requisitos obrigatórios congelados. `PARTIAL`, `NOT_RUN`, `UNKNOWN`, `BLOCKED`, exceção funcional ou aprovação pendente não contam como PASS.
4. Requisito removido exige decisão registrada, nova versão de escopo e novo nome para a medida. Não declarar 100% integral depois de excluir silenciosamente uma capacidade difícil.
5. Um bloqueio de autorização, integridade, efeito duplicado, isolamento ou recuperação impede o aceite mesmo com porcentagem alta. Não usar média ponderada para compensar uma falha obrigatória.
6. Comparadores normalizam somente IDs aleatórios, timestamps e detalhes de transporte previamente declarados. Não normalizam ferramenta ausente, evento omitido, perda de informação, efeito extra, erro indevido, falta de cancelamento ou bypass de aprovação.
7. Depois do freeze, mudança do alvo DeepSeek gera delta separado. O alvo não avança automaticamente enquanto o CVG o alcança.

Interoperabilidade é um requisito explícito de adaptadores e protocolos, com fixtures e negociação de versão. O formato CVG não é renumerado para parecer v4, nem seus plugins passam a ser compatíveis com Cordis por declaração. A compatibilidade exata com todos os módulos Cordis exigiria outro contrato; este plano exige projeção funcional dos serviços e adaptadores documentados, sem importar código DeepSeek.

## Referência e baseline

| Objeto                         | Pin e evidência                                                                                                     | Uso                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| DeepSeek selecionado por `dsh` | `/home/ricardo/deepseek-harness-session-fixes`, commit `768fb1f3d3dcf9a16659ee354e927d05475f22dd`, CLI `0.2.0-rc.1` | Alvo funcional congelado, não o clone histórico `~/deepseek-harness`                               |
| CVG inicial                    | HEAD `ca565391ac52033d6f59b06237a45beb986e1c12` e alterações documentais próprias da AUD0611                        | Ponto de partida; os arquivos de implementação versionados não são alterados pela limpeza de emits |
| Inventário da referência       | `deepseek-workspaces.json` e `capability-family-map.json` na evidência PARE100                                      | 318 manifests/55 famílias, cada família ligada a owner e task                                      |
| Limpeza                        | SPEC 0207 e manifesto exato da evidência PARE100                                                                    | 348 resíduos de compilação removidos; biblioteca legada ativa não confundida com órfão             |

P100-003 também congela schemas, catálogos de ferramentas e eventos, exports, perfis/bundles, plugins opcionais, README de limitações e artefatos distribuídos. O inventário atual de manifests não substitui essa revisão semântica. Fixtures da referência são sintéticas/keyless; dados pessoais do usuário e sessões reais de `~/.dsh` ficam fora da coleta.

## Estratégia técnica selecionada

Evoluir o monorepo modular existente, com o kernel como caminho comum e capabilities substituíveis por portas públicas. SDK, hosts e produtos compõem essas portas; política, approval, budgets, journal, auditoria e pause continuam controles obrigatórios. Configuração é validada no boot; capacidades sensíveis exigem autorização vinculada à identidade e ao recurso.

| Alternativa                                                  | Decisão                | Motivo e consequência                                                                                                                   |
| ------------------------------------------------------------ | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Reimplementar padrões e capacidades sobre o CVG existente    | Selecionada            | Preserva PostgreSQL/RLS, approval/journal duráveis, contratos e direção das ADRs; exige matriz explícita e testes diferenciais          |
| Usar um fork DeepSeek como novo núcleo ou copiar suas fontes | Rejeitada neste plano  | Contraria ADR-011 e não conserva automaticamente as garantias institucionais ou os contratos CVG                                        |
| Apagar todo `legacy/` imediatamente                          | Rejeitada              | API, builds, tests e certificação ainda têm consumidores reais dessas bibliotecas; exige migração e retirada de contrato                |
| Criar microserviços por capacidade                           | Rejeitada como default | Não há evidência de necessidade de deploy/escalabilidade independentes; adicionaria falhas e transações distribuídas ao caminho crítico |

As bibliotecas mantidas de terceiros podem fornecer protocolos, parsing, subprocessos, renderização e backends. Cada dependência precisa reduzir código próprio, ter versão/closure verificável e respeitar licenças e budgets. Este plano não instala nem altera dependências.

## Frentes de entrega

| Frente                    | Resultado observável                                                                                  | Responsável proposto     |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------ |
| Base e retirada do legado | Um caminho governado; host neutro sem imports/workspaces legados; zero emits órfãos ativos            | Integração/backend       |
| Sessão, contexto e modelo | Reproduzir, retomar, consultar e compactar turnos sem perder vínculos, aprovações ou usage            | Runtime/persistência     |
| Ferramentas e contenção   | Arquivos, shell/PTY, documentos e processos com limits, grants reais e recuperação                    | Runtime/nativo/segurança |
| Protocolos e extensões    | SDK TS/Python, stdio/HTTP, ACP, MCP, SSH, LSP e interfaces externas contratadas                       | Integrações              |
| Orquestração              | Subagentes, PTC, workflows, goals, jobs, teams, schedule e webhooks com autoridade e budgets herdados | Orquestração             |
| Aplicações                | CLI/headless, console Web, desktop e guest runtime com jornadas equivalentes                          | Frontend/host            |
| Prova e distribuição      | Matriz 100% PASS_CURRENT, gates obrigatórios, pacote reproduzível e auditoria independente            | QA/integração/auditoria  |

Os papéis são planejamento, não agentes já contratados ou disponíveis. Um integrador é o único writer de ledgers e contratos compartilhados. Builders têm paths e recursos disjuntos; o revisor final não aceita sua própria implementação.

## Decisões e gates

- Direção autorizada agora: produzir os três documentos e limpar resíduos sem consumidor com backup, seguindo T2. O pedido não autoriza executar todas as novas capacidades, publicar, usar dados reais ou fazer efeitos externos.
- T1: inventário, plano, matriz, ledgers e decisões documentais com links/formatação verdes.
- T2: remoções/refatorações que preservam contrato; task e SPEC curta, typecheck/lint/unit/PG/E2E atuais. Ausência de gate permanece dívida explícita.
- T3: SPEC concreta revisada pelo usuário antes de mudança de schema, contrato, identidade, segurança, policy, approval, SDK público ou retirada de export/rota legada.
- T4: provider/canal/conhecimento/efeito real ou release requer candidato congelado, certificação completa, pacote hash-bound e decisão humana. O programa 0374 continua dono do gate produtivo.

Questões que P100-003/012/040 devem fechar em SPEC: lifecycle das capabilities com quiescência, preservando os controles; gerenciamento de plugins revisados sem instalação automática de registro público em runtime; uso seguro das extensões dinâmicas. Uma diferença funcional ainda aberta fica `BLOCKED` na matriz, sem waiver implícito. Um plugin não pode liberar o que um controle negou.

## Ordem e orçamento de esforço

Executar F0 → F1; depois paralelizar somente sobre contratos congelados. Sessão/SDK habilitam interfaces; contenção habilita tools/PTC/subagentes; ambas habilitam workflows e teams. A retirada do legado depende da migração, não antecede a migração. O [roadmap](0377_roadmap_paridade_integral.md) define as demonstrações e gates por fase.

Hipótese de planejamento para o escopo integral: **16–24 sprints de duas semanas**, com integração/backend, frontend, contenção nativa e QA ativos, e auditoria separada ao final. É estimativa inicial de 8–12 meses, não prazo garantido. Reestimar após F0 e dois sprints com throughput, requisitos expandidos, disponibilidade e dependências medidos. Com um único executor, usar o caminho sequencial e recalcular; não manter o mesmo calendário por suposição.

Não há orçamento financeiro aprovado. Custo e datas dependem da composição real da equipe, dos providers e ambientes de homologação autorizados. Cada sprint encerra uma demonstração pequena e recuperável, sem tentar construir todas as famílias simultaneamente.

## Barra de conclusão

- Matriz integral congelada, zero requisito obrigatório sem owner/task/prova e zero diferença funcional aberta.
- Consumidores passam pelo motor público; nenhuma autoridade sensível vem do modelo, do payload ou de plugin de capacidade.
- Legado retirado de rotas, exports, workspaces, aliases, lock, builds e imagem após compatibilidade demonstrada; arquivos históricos e migrations preservados.
- Eventos/protocolos versionados; restart, replay, cancelamento, duplicata, crash no efeito e troca de tenant demonstrados.
- Gates locais e CI da candidata PASS; package/build closure, SBOM/licenses, supply-chain e plataforma suportada com evidência própria.
- Auditoria independente reexecuta amostra crítica e negativos de cada família e verifica a matriz completa. Sem revisão independente, estado `AUDIT_PENDING`, nunca 100% aceito.
- Percentual integral de paridade e release ficam em registros separados. Paridade 100% não concede produção hospitalar.

## Continuidade

Progresso atual: inventário estrutural da referência e remoção local de emits concluídos; gates de limpeza em verificação. O lint já revela um helper não usado no `HEAD` da PDSH-031, e o resultado não será ocultado. Os status finais da rodada estão em 0612 e nos ledgers.

Próxima ação executável do programa: P100-003 — expandir e congelar a matriz funcional com fontes e procedimentos por requisito. Fechar a dívida de lint/validação de P100-001 em coordenação com o owner de PDSH-031, sem iniciar uma SPEC T3 por inércia.

Para recuperar: ler 99/20/30, coordenação, 0612, 0376/0377/0378; conferir pins e árvore; selecionar uma task com dependências prontas e claim próprio; revalidar evidências antes de reutilizar PASS. Backup de emits serve apenas à fatia 0207 e não é backup de dados ou rollback de produto.
