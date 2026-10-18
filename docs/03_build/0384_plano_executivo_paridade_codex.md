# 0384 — Plano executivo de paridade funcional com Codex

Data: 17/10/2026. Programa `CODEX100`. Task documental `CODEX100-PLAN-20261017`. Pedido: plano executivo, roadmap e backlog para incorporar 100% das funções do Codex ao Operational Harness.

Estado desta entrega: **planejamento concluído; execução proposta e não iniciada**. [Roadmap 0385](0385_roadmap_paridade_codex.md), [backlog 0386](0386_backlog_paridade_codex.md), [catálogo CODEX-CAP v1](tracking/codex100_catalog_v1.json) e [evidências](../04_audit/evidence/CODEX100-PLAN-20261017/README.md).

## Resultado pretendido

Incorporar as capacidades públicas do snapshot oficial `openai/codex` ao runtime, portas, adapters e hosts do Operational Harness. Cada capacidade precisa produzir um resultado equivalente para o usuário, com os controles CVG preservados. O executor CVG de produção deve funcionar sem o executável Codex: encaminhar todas as chamadas a outro runtime não demonstra incorporação. Compatibilidade de API, formatos e comandos pode ser oferecida por adapters.

O núcleo continua neutro. Interface terminal, IDE/desktop, pets e aplicações de engenharia ficam em hosts ou consumidores próprios, sem dependência inversa. O Assistente de Plantão conserva domínio, dados, deploy e backlog próprios, conforme [ADR-010](../architecture/adrs/ADR-010-harness-product-isolation.md). A meta não altera as regras de RAG, agenda real, prontuário, ações clínicas ou financeiras.

O aproveitamento pode combinar implementação nativa, adaptação de componentes existentes e incorporação de código licenciado após revisão de dependências, LICENSE e NOTICE. Não há decisão de reescrever o núcleo em Rust ou torná-lo dependente de um serviço proprietário.

## Fronteira dos 100%

O alvo é **toda funcionalidade pública implementada ou exposta pelo repositório oficial no commit `8d9f6466ff0294785d56f55b1fe363d132fe4133`**. Inclui CLI, TUI, app-server, SDK, ferramentas, extensões, estados, erros, recursos opt-in e variantes por plataforma. A meta vai além das 16 oportunidades selecionadas na [auditoria 0620](../04_audit/0620_codex_capabilities_2026-10-17.md).

O alvo não significa reproduzir funções Rust privadas, pesos de modelo, infraestrutura privada ou telas de produtos fechados ausentes do repositório. Os contratos de integração expostos para modelos, serviços gerenciados, IDE e desktop continuam obrigatórios; sua prova exige referência e acesso adequados. A [documentação oficial da OpenAI](https://developers.openai.com/blog/codex-as-a-platform) distingue o harness aberto de acesso ao modelo e serviços gerenciados. Essa fronteira evita tratar código cliente como prova de um backend privado reproduzido.

O catálogo inicial contém **22 famílias, 379 obrigações funcionais e 22 controles institucionais adicionais**. As obrigações funcionais são 179 resultados por família e 200 entradas do protocolo: 105 requests de cliente, dez pedidos de servidor e 85 notificações. O inventário estrutural registra **657 entradas**: essas 200 entradas protocolares, 103 chaves principais de configuração, 81 variantes lexicais de CLI, 65 comandos TUI, 177 flags, um índice de exports do SDK, 13 módulos de especificação de ferramentas e 17 extensões.

**Este é um catálogo candidato aberto, não uma declaração de inventário completo.** DX100-G01 confere dispatch, aliases, condições de compilação, propriedades aninhadas, exports, componentes e combinações observáveis. Deve expandir variantes antes de congelar a medida. O índice dos 9.288 caminhos Git ajuda a evitar que o levantamento fique limitado aos arquivos da auditoria; indexar um caminho não comprova leitura, alcance público ou execução dele.

Cada capacidade terá fonte, variante, dono, oráculo, prova positiva e negativa e recibo de qualificação. Campo não observado, acesso ausente, comportamento parcial, skip ou evidência desatualizada permanece pendente. Recursos experimentais ou de baixa relevância hospitalar continuam na meta. Para flags `Removed`/`Deprecated`, verificar compatibilidade/no-op quando aplicável; para `UnderDevelopment`, distinguir comportamento executável, stub e mero gate de requisitos. Toda disposição fica registrada. Não inventar uma função por existir uma flag nem apagar função por estar desativada.

## Medida e equivalências

Publicar dois resultados, mantendo o mesmo denominador funcional congelado:

```text
Paridade literal = 100 × PASS_CURRENT_LITERAL / denominador funcional
Paridade governada = 100 × PASS_CURRENT com igualdade ou equivalência
                     governada explicitamente decidida / mesmo denominador

Conclusão = 100% funcional no rótulo escolhido
            E todas as superfícies e variantes cobertas
            E todos os controles CVG aprovados
            E fechamento de escopo e auditoria independente
            E incorporação nativa e decisão humana aplicável
```

Uma substituição de segurança nunca conta como igualdade literal. Flags de bypass, revisão automática de ação sensível ou uso de credenciais pessoais mantêm divergência e decisão pendente até uma especificação concreta estabelecer o resultado equivalente permitido. Se a diferença for irredutível, **não declarar 100% literal do Codex**. Se o usuário decidir excluir uma capacidade, preservar a história e renomear o resultado para “100% do escopo decidido”; não manter silenciosamente o rótulo original.

O estado inicial é **0/379 obrigações funcionais qualificadas e 0/22 controles adicionais qualificados**. Isso indica ausência de qualificação nesta nova régua, não ausência de funcionalidades implementadas. Schema, classe, flag, documentação, mock ou cartão concluído não qualificam um fluxo. Não somar porcentagens DeepSeek, Claude e Codex; cada referência possui sua medida e nenhuma média compensa família ou controle pendente.

Para `FUNCTIONAL_PARITY`, exigir referência funcional autenticada e execução CVG com variantes, estado, eventos, efeitos e erros comparáveis. Para `CVG_CONTROL`, exigir a regra/SPEC CVG aprovada e suas provas; não exigir que o Codex exponha um mecanismo interno proposto pelo CVG. A cobertura das superfícies é outro gate obrigatório, sem transformar linhas de schema em funcionalidades concluídas.

## Referência e prova

- Autoridade de escopo: fonte oficial no SHA acima. Mudanças futuras entram como deltas versionados, sem mover o alvo automaticamente.
- Executável complementar da 0620: `codex-cli 0.163.0`, SHA-256 `399ff69c431c066e40de318fba45c2b07f45a76b19939d247ee4828fc70c4215`. A rodada anterior preservou 14 capturas REA, duas avaliações sintéticas de policy e 318 schemas gerados.
- Os 200 nomes protocolares coincidem entre schema pinado e artefato observado. Isso não autentica todos os campos/semântica nem vincula o executável ao commit. G02 deve construir/vincular a referência exata ou registrar e requalificar um novo pin antes da comparação funcional.
- Para fluxos locais, usar o código real da referência com provider e dados sintéticos. Para serviços, identidade, voz e plataformas, definir acesso e ensaios autorizados. Mocks controlam insumos e falhas; não fabricam a resposta da referência nem fecham integração externa.
- Cada recibo registra requisito e variante; fonte/binário/configuração/ambiente da referência; SHA/digest da candidata CVG; fixture/testkit; entradas, eventos, efeitos e estado; resultado, oráculo, normalização, revisão e validade. Mutação aplicável torna o recibo `STALE`.

## Escopo por família

| Família | Cobertura obrigatória                     | Dono principal                           |
| ------- | ----------------------------------------- | ---------------------------------------- |
| CDX-01  | Kernel, execução e budgets                | DX100-K01; donos específicos no catálogo |
| CDX-02  | Threads, histórico e persistência         | DX100-S01; donos específicos no catálogo |
| CDX-03  | Contexto, instruções e memória            | DX100-C01; donos específicos no catálogo |
| CDX-04  | Modelos, providers e inferência           | DX100-M01; donos específicos no catálogo |
| CDX-05  | Arquivos, patches, busca e artefatos      | DX100-T01; donos específicos no catálogo |
| CDX-06  | Subprocessos, shell e PTY                 | DX100-X01; donos específicos no catálogo |
| CDX-07  | Permissões, sandbox e revisão             | DX100-X03; donos específicos no catálogo |
| CDX-08  | App-server e protocolo bidirecional       | DX100-A01; donos específicos no catálogo |
| CDX-09  | SDK e execução headless                   | DX100-D01; donos específicos no catálogo |
| CDX-10  | CLI, configuração e diagnósticos          | DX100-H01; donos específicos no catálogo |
| CDX-11  | Skills, plugins e extensões               | DX100-E01; donos específicos no catálogo |
| CDX-12  | Hooks e lifecycle                         | DX100-F01; donos específicos no catálogo |
| CDX-13  | MCP, apps e conectores                    | DX100-P01; donos específicos no catálogo |
| CDX-14  | Subagentes e comunicação                  | DX100-O01; donos específicos no catálogo |
| CDX-15  | Goals, planos, filas e autonomia          | DX100-O02; donos específicos no catálogo |
| CDX-16  | Workspaces, Git e revisão                 | DX100-W01; donos específicos no catálogo |
| CDX-17  | Interface terminal e preferências         | DX100-U01; donos específicos no catálogo |
| CDX-18  | Daemon, exec-server e superfícies remotas | DX100-R01; donos específicos no catálogo |
| CDX-19  | Mídia, realtime e automação visual        | DX100-I01; donos específicos no catálogo |
| CDX-20  | Identidade, conta e atestação             | DX100-N01; donos específicos no catálogo |
| CDX-21  | Observabilidade, avisos e feedback        | DX100-V01; donos específicos no catálogo |
| CDX-22  | Code mode, migração e distribuição        | DX100-T02; donos específicos no catálogo |

## Arquitetura e sequência de incorporação

1. Preservar os contratos neutros e a spine de execução existente. Checkpoint, journal, aprovação, budget e cancelamento precedem a ampliação de autonomia.
2. Implementar capabilities e adapters de provider, filesystem, processos, memória, mídia e conectores com ownership e grants explícitos. Configuração do consumidor não substitui controle institucional.
3. Adaptar contratos Codex ao SDK/API do CVG, gerando tipos e schemas de uma fonte canônica. CLI/TUI/IDE/remoto consomem essa mesma execução.
4. Demonstrar cedo: abrir sessão → READ → WRITE retida → aprovação → retomada → stream → restart sem efeito extra. Essa jornada deve reprovar um caso conhecido como errado.
5. Conectar skills, plugins, hooks, MCP e code mode à mesma fronteira de execução. Descoberta/importação não concede grant; filhos herdam autoridade por interseção e contabilização agregada.
6. Entregar remoto, mídia e clientes após os contratos locais, pesquisando acesso desde F0. Conta ou plataforma indisponível bloqueia a qualificação correspondente, sem excluir a capacidade.
7. Qualificar a candidata identificada e submetê-la a auditor independente. Aceite de paridade não concede produção: a trilha 0374 permanece separada.

## Carteira única de construção e reuso

O 0380 continua dono dos estados PAR; o 0383, dos C100; o 0386 é dono somente dos deltas DX100. O plano contém **49 cartões DX100**, 86 PAR diretos e **93 PAR no fecho**, além de 27 C100 diretos e **28 fatias técnicas C100 propostas no fecho**. Há um escritor por caminho e um responsável canônico por construção.

G03 precisa aceitar o recorte de cada fatia compartilhada, seu saldo, contrato e dependências. A estimativa usa o cartão inteiro de origem como reserva conservadora; isso não permite tomar seu ownership, mudar seu estado ou dispensar gates. Componentes comuns podem ser reaproveitados sem alcançar 100% de Claude/DeepSeek. Gates específicos da referência Claude não qualificam Codex: DX100-G04/Q01 estabelecem contratos e provas próprios, mantendo todas as obrigações de segurança.

O [modelo derivado](../04_audit/evidence/CODEX100-PLAN-20261017/plan-index.json) registra o DAG e as fatias propostas. Até G03 reconciliá-las, é um cenário de planejamento, não uma agenda autorizada. Se o recorte não for aceito, manter a dependência aberta e replanejar. Não alterar o driver PAR-Q02 ou C100-Q01 para fingir que já são comparadores Codex.

No orçamento global, calcular a união de IDs/fatias e descontar apenas trabalho integrado e requalificado. Não somar três vezes o núcleo compartilhado nem os orçamentos completos dos três programas.

## Investimento e capacidade

ROM significa estimativa inicial em dias de engenharia humana, sem velocidade observada. Inclui contrato, implementação, revisão e gates da fatia delimitada. Serviços, contas, hardware e espera externa não estão cotados ou autorizados.

| Parcela             | Faixa ou premissa                                     | Regra de leitura                                                                                 |
| ------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Deltas Codex        | 49 cartões; **522–1127 dias**                         | Complementos e qualificação Codex; não reimplementação automática de componentes compartilhados. |
| Reuso PAR           | 93 IDs; **1142 dias nominais**, com faixa de 65%–135% | Reserva conservadora por cartão completo, contada uma vez.                                       |
| Fatias C100         | 28 unidades propostas; **183–382 dias**               | Reserva pelo ROM integral; recorte e saldo dependem do G03.                                      |
| Envelope deste alvo | **1448–3051 dias**, nominal 2249                      | Não é custo incremental ou orçamento aprovado; variantes descobertas podem aumentar o saldo.     |

| Frentes totais compartilhadas | Semanas: mínima / nominal / máxima |
| ----------------------------- | ---------------------------------- |
| 1                             | 414 / 643 / 872                    |
| 3                             | 138 / 215 / 291                    |
| 5                             | 83 / 129 / 175                     |

Premissa: cinco dias por semana, com 70% de capacidade efetiva, resultando em 3,5 dias por frente/semana. O prazo é o máximo entre capacidade agregada e caminho crítico do DAG. Não é uma agenda nivelada por recursos ou compromisso de data. Cinco frentes são totais compartilhadas, sem cinco equipes adicionais para cada referência. L0 acumula integração; L5 é qualificação transversal dentro dessa capacidade, sem sexto executor invisível.

Não há data de início, equipe alocada, contratação ou compra aprovada. Reestimar no G03 e após dois sprints com throughput, retrabalho e espera observados. Acesso a serviços, gate humano e disponibilidade de plataforma podem dominar o calendário.

## Gates e decisões de execução

Seguir `DISCOVERY → PRD → SPEC → BUILD → AUDIT`. Esta entrega é T1. Cada BUILD exige tarefa, SPEC e gate aplicável. Alteração de contrato, schema, segurança, identidade, policy ou approval segue T3; integração sensível real e candidata seguem T4. As aprovações existentes só valem em seus hashes e condições. Certify, PostgreSQL, E2E, SBOM e licenças exigem claims/recursos próprios e Node 22 conforme a constituição.

Decisões a concretizar por G04 ou pela SPEC da capacidade: rótulo de paridade e equivalências de bypass/auto-review; referência executável vinculada; formatos e compatibilidade contratual; plataformas/arquiteturas e runners; identidade/provider/serviço; retenção de memória/mídia; consentimento para remoto/automação; licenças/assets e distribuição. A falta dessas decisões não impede a entrega deste plano, mas impede a execução dependente.

Barra comum: negação sem efeito; um terminal por turno; recursos próprios encerrados; causa original preservada; grants por interseção; budget agregado; audit íntegro; vínculo entre intenção, aprovação e efeito; recuperação sem duplicata; verificador rejeitando controle adulterado. Matrizes incluem sucesso, entrada/estado inválido, negação, cancelamento, restart, concorrência e plataforma quando aplicáveis.

G04 congela os alvos de carga antes dos resultados. Proposta inicial: dez sessões sintéticas, até dois filhos por sessão, 30 minutos, cliente lento, reconnect e restart; zero efeito extra, evento perdido ou vazamento, dentro dos limites de recursos. Para overhead determinístico no mesmo hardware/fixture: razão p95 até 1,25 e acréscimo até 100 ms quando a metodologia for válida. São alvos propostos, não SLA aprovado de modelo ou rede real. Método inválido exige revisão antes do aceite, não PASS por indisponibilidade.

## Riscos e respostas

| Risco                                      | Dono       | Resposta                                                                                     |
| ------------------------------------------ | ---------- | -------------------------------------------------------------------------------------------- |
| Catálogo inicial confundido com completude | L0/L5      | G01 expande variantes e fecha superfícies com revisão; não declarar paridade antes disso.    |
| Binário não corresponde à fonte            | L5         | G02 autentica o vínculo; nomes de método iguais não substituem essa prova.                   |
| Construção ou orçamento duplicado          | Integrador | União de IDs/fatias, claim único e saldo reconciliado em G03.                                |
| Função incompatível com regras CVG         | L0/L1      | Conservar divergência e separar rótulos literal/governado; decisão explícita por capacidade. |
| Flag/interface depende de backend externo  | L3/L4      | Acesso e oráculo reais; stub e mock não encerram a capacidade.                               |
| Plataforma/arquitetura indisponível        | L4/L5      | Reservar runner nativo autorizado; variante permanece `NOT_RUN`/`BLOCKED`.                   |
| Autonomia precede seus controles           | L1/L4      | Supervisor, checkpoint, contenção e budget antes de filhos/code mode/automação.              |
| ROM não captura esforço ou espera          | L0         | Recalcular após G03 e dois sprints; preservar escopo e mostrar espera separadamente.         |

## Recuperação e próxima ação

Na retomada, ler AGENTS, 99/20/30, coordenação, 0384/0385/0386 e catálogo. Conferir SHA, claims, configuração, gates e evidências antes de selecionar uma tarefa. Reverter conversa ou arquivos não desfaz automaticamente um efeito externo; recuperar por journal/checkpoint e ownership, conservando incertezas.

**Próxima ação: DX100-G01**, na trilha documental; depois G02/G03 e G04. O planejamento solicitado está entregue. Os ledgers compartilhados modificados na entrada têm deltas prontos no [handoff](../08_runtime/handoffs/codex100_plan_20261017.md), conforme a regra 5. Os estados dos programas de execução e produção permanecem em seus documentos canônicos.

## Atualizações concorrentes observadas

Durante a validação, outros claims atualizaram 99/20/30, 0370 e o backlog/catálogo Claude100. Esses arquivos permaneceram somente leitura nesta rodada. A primeira checagem que supunha hashes estáveis falhou e foi preservada; a entrega passou a registrar o [drift concorrente](../04_audit/evidence/CODEX100-PLAN-20261017/concurrent-drift.json) e a validar IDs e insumos efetivamente usados. O ROM usa o snapshot anterior de plan-index Claude100, sem copiar status atuais; G03 reconcilia o saldo com o estado corrente antes da execução. Nenhuma pendência histórica de outro programa é reimposta por este plano.
