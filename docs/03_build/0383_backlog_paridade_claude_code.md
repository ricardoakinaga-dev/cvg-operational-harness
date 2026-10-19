# 0383 — Backlog de paridade funcional Claude Code

Task de planejamento `CLAUDE100-PLAN-20261017`. Estado do plano: `PROPOSED_FOR_EXECUTION`; direção de cobrir as 16 famílias solicitada pelo usuário em 17/10/2026. Não é aprovação de SPEC/BUILD.

Fontes: [plano executivo 0381](0381_plano_executivo_paridade_claude_code.md), [roadmap 0382](0382_roadmap_paridade_claude_code.md), [catálogo de aceites propostos](tracking/claude100_catalog_v1.json), [análise 0618](../04_audit/0618_claude_code_capabilities_2026-10-17.md).

## Autoridade, donos e estados

Este documento é a fonte de estado dos cartões **C100**. O [0380](0380_backlog_paridade_100_deepseek.md) continua sendo a fonte de estado dos **PAR**; suas linhas são referências de reuso, não novas tarefas. Não há cópia de status PAR aqui. O catálogo possui o contrato dos requisitos e receipts futuros, sem duplicar o estado de execução das tasks. O plan-index em evidências é somente projeção da edição documental.

`READY` nesta rodada só se aplica ao trabalho documental G01, não a código. `TODO` aguarda dependências, claim e gates; `IN_PROGRESS → VERIFY → DONE` exige prova/revisão atual. `BLOCKED` registra causa/dono/ação. `DONE_LOCAL` de outro programa não fecha um requisito Claude. Família só termina com todos os seus requisitos aprovados.

Cada cartão declara o que no título, onde, como, dependências, reuso, dono de função, gate, aceite e próxima ação. Nomes de novos paths são propostas a confirmar na SPEC. Para PAR reutilizado, acrescentar aceites na SPEC do dono quando compatível; ampliação exige novo gate. Não reconstruir seu executor em C100.

Estimativas ROM em dias de engenharia humana, por delta C100; incluem SPEC, implementação, testes e uma revisão, mas excluem espera humana/conta e execução pendente dos PAR. Faixas não são promessa de velocidade de agentes. Uma revisão independente por cartão, até dois retrabalhos; depois replanejar, sem fabricar aceite.

## Checkpoint técnico — 18/10/2026

Builder local2f0cc11f reaproveita exatamente a correção já commitada na raiz:
compilação fria20workspaces,914arquivos,65arestas e74entradas presentes;
3testes originais/tipagem/lint/formato passaram. Revisão independente
APPROVE_SCOPED_REUSE sem obrigatório; BR5/fullT2 continuam não qualificados,
43reds e bindings pendentes preservados. [Evidência](../04_audit/evidence/CLAUDE100-EXEC-20261017/runtime-build-closure-reuse/REPORT.md).

A [fundação0225 local](../04_audit/evidence/CLAUDE100-EXEC-20261017/journal0225-build/REPORT.md)
continua privada0b9357cd/sourceclean, produçãoceef0497. R1REVISE1/2 teve P1
reproduzido5REDnativos; decisão completa inicial agora canônica sem alterar
hashlegado,201nativos+184focaisPASS/type38lint20. Duas regressões de testes
corrigidas com18focais originais, sem alterar checker/manifests/lock. Suíte
completa anterior4950PASS/45FAIL/71pending+pré-condiçãofencefalha preservada;
ainda não reexecutada. Banco temporário e3roles próprias removidos;PGidle/22legacy0.
Grupo único de retrabalho1/1 continua: HOWJ07 fechado/6casos/14inputs;
implementação NÃO INICIADA,26claims/24produzidos. Próxima ação
`C100-FND-JOURNAL-0225-BUILD-001:GROUPED-REWORK-R1:J07-NATIVE-BUILD`,
conforme [checkpoint de sessão](../04_audit/evidence/CLAUDE100-EXEC-20261017/journal0225-build/session-restart-20261018/CHECKPOINT.md).
R2nãoiniciado/J16P0;
estadoPAR0380, SPEC0238aguarda resposta, zero crédito117/17.

## Registro de reuso e dependências herdadas

53 cartões PAR são referenciados diretamente. Fecho transitivo: 58 IDs únicos, com status e aprovação consultados exclusivamente no 0380. O fecho é uma estimativa conservadora de cartões completos; G03 deve reduzir o saldo por evidência atual e delimitar aceites comuns, sem somar o trabalho duas vezes.

| PAR                                                                  | Papel               | Dono/status                                                              |
| -------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------ |
| PAR-A01 — Stream de eventos na API com cursor                        | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-A02 — Controle ao vivo de turno e sessão pela API                | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-A04 — Controlador de jobs observáveis na API                     | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-A05 — Notificações push no SDK                                   | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-A07 — Pedidos do servidor ao cliente no SDK                      | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-C01 — Compactação por modelo sob pressão                         | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-C02 — Pressão de tokens antes do dispatch                        | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-C03 — Spill de saídas grandes e poda de resultados               | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-C05 — Compactação manual                                         | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-C06 — Instruções de workspace e referências a arquivos           | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-G01 — Consolidar o trabalho PARE100 em andamento                 | dependência herdada | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-H01 — CLI de operação                                            | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-H02 — Configuração tipada com dump e catálogo                    | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-H03 — Credenciais por referência e autorização humana            | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-H04 — Configurações por formulário e gestão de plugins           | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-I05 — Exportação de log de sessão por OTEL                       | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-K01 — Um só pipeline para API, worker e execução publicada       | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-K02 — Retirar as bibliotecas legadas ativas                      | dependência herdada | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-K03 — Checkpoint durável antes do modelo e do efeito             | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-K04 — Lifecycle de capabilities com quiescência                  | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-K05 — Perfis e presets declarativos validados                    | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-K06 — Agente vivo: steering, cancelamento e espera de ociosidade | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-K09 — Hooks configuráveis sob controle                           | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-K10 — Pontes de hooks do Claude Code e do Codex                  | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-M01 — Streaming no gateway com um resultado terminal             | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-M02 — Requisição congelada antes do adaptador                    | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-M05 — Modelo padrão e seleção por sessão                         | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-O01 — Subagentes com herança estrita de autoridade               | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-O02 — Filhos continuáveis com mailbox durável                    | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-O03 — Jobs de agente em segundo plano                            | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-O09 — Modo de planejamento e todos da sessão                     | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-P01 — MCP governado (stdio e HTTP)                               | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-Q01 — Congelar o catálogo de capacidades PAR-CAP v1              | dependência herdada | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-Q02 — Comparador diferencial keyless operando                    | dependência herdada | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-Q03 — Kit neutro de test-support                                 | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-Q04 — Servidor de falhas de modelo e replay de stream sintético  | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-Q05 — Medidor de paridade publicado                              | dependência herdada | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-Q06 — Gates de paridade no CI                                    | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-Q08 — Candidata reproduzível com SBOM e assinatura               | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-S01 — Persistência pública de sessão entre processos             | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-S02 — Projeções de sessão com cache                              | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-S03 — Estatísticas, esboço de turnos e título                    | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-S04 — Fork e retomada de sessão                                  | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-S05 — Consulta de sessões com rastreio                           | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-S07 — Formatos novos e export/import versionado                  | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-T01 — Arquivos: leitura antes de editar, faixas e replace_all    | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-T05 — Entregáveis com aprovação e resumo de mudanças             | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-T07 — Skills com origem, hash e catálogo                         | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-T09 — Registro de workspaces e sessões por tenant                | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-T10 — Shell com jobs em segundo plano e relatório de negação     | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-T11 — Perguntar ao humano com pausa e retomada                   | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-T12 — Web fetch e search com proteção SSRF                       | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-T14 — Terminais PTY persistentes                                 | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-U07 — Presets de permissão                                       | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-X01 — Serviço único de subprocesso e ambiente do filho           | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-X02 — Landlock real e relatório honesto de contenção             | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-X03 — Testes nativos de contenção e limites de recurso           | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |
| PAR-X04 — Enforcement por efeito e política de sandbox por sessão    | reuso direto        | [0380](0380_backlog_paridade_100_deepseek.md); owner original preservado |

## Distribuição e resumo

| Fase                                        | Cartões C100 | ROM delta (dias) |
| ------------------------------------------- | ------------ | ---------------- |
| F0 — Medida, referência e decisões          | 4            | 10–18            |
| F1 — Comparador e fundação reutilizada      | 1            | 10–20            |
| F2 — Sessão, streaming, contexto e modelos  | 6            | 38–78            |
| F3 — MCP, skills, plugins e avaliação       | 7            | 41–86            |
| F4 — Autonomia, hooks completos e operação  | 8            | 41–85            |
| F5 — Workspaces, terminais e rewind         | 3            | 18–37            |
| F6 — Cloud, controle remoto, IDE e gateway  | 4            | 45–96            |
| F7 — Qualificação, CI e aceite independente | 4            | 27–52            |
| Total                                       | 37           | 230–472          |

Dono é papel proposto; alocação nominal e paths disjuntos são fixados no claim. L0 é integrador, não sexta frente de implementação. L5 é verificação transversal dentro da mesma capacidade total de cinco frentes, sem presumir um sexto executor.

## F0 — Medida, referência e decisões

### C100-G01 — Validar e versionar o catálogo Claude

- Estado: `DONE`. Prioridade: P0. Fase: F0. Trilha: T1. ROM: 2–4 dias.
- Dono proposto: L0 — Integrador (contratos, schema, gates e ledgers).
- Onde: tracking/claude100_catalog_v1.json e evidências da 0618.
- Como: Conferir cada requisito contra a referência pinada; manter itens não observados como pendentes; registrar deltas sem apagar IDs.
- Depende C100: nenhuma.
- Pré-requisitos/reuso PAR: nenhum; delta próprio. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: habilitador/qualificação transversal; não aumenta o numerador por concluir o cartão.
- Aceite: 16 famílias e todos os requisitos com fonte classificada; pin conferido; nenhum item removido para elevar percentual.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Resultado documental:134origens classificadas (71CLI/46documentais sem vínculo de versão/17propostasCVG), pin reconferido,0aceitesfuncionais. [Verificação](../04_audit/evidence/CLAUDE100-EXEC-20261017/g01-verification.json) e revisão independente aceitam somente inventário/proveniência; ambiguidades permanecem paraG02. [Execução integral](../../.agent/plans/claude100-exec-20261017.md).
- Próxima ação: terminal documental; C100-G02 define os oráculos sem tratar declaraçãoCLI como funcionalidade comprovada.

### C100-G02 — Definir oráculos e acesso à referência

- Estado: `DONE`. Prioridade: P0. Fase: F0. Trilha: T1. ROM: 3–5 dias.
- Dono proposto: L0 — Integrador (contratos, schema, gates e ledgers).
- Onde: evidências CLAUDE100 e futura suíte de comparação.
- Como: Especificar fixtures, normalizações permitidas e captura funcional; controles adicionais usam SPEC/prova CVG. Mapear acesso licenciado, sem criar conta nem executar ensaio remoto T4.
- Depende C100: C100-G01.
- Pré-requisitos/reuso PAR: nenhum; delta próprio. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: habilitador/qualificação transversal; não aumenta o numerador por concluir o cartão.
- Aceite: Todo requisito tem oráculo adequado à sua classe; acesso necessário de cloud/IDE/gateway mapeado com dono e pendências, sem exigir sua obtenção para iniciar a fatia local.
- Resultado documental:16protocolos/134vínculos e acesso com donos/pendências publicados; [parecerR1](../04_audit/evidence/CLAUDE100-EXEC-20261017/g02-g04-review-r1/verdict.json) aceitaG02somente documental. [Contratos/acessos](../04_audit/evidence/CLAUDE100-EXEC-20261017/G02-oracles-and-access.md). Congelamento executável porSPEC e capturas continuamNOT_RUN; nenhum crédito funcional.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Executar o levantamento documental descrito, registrar resultado e encaminhar uma única próxima ação com dono.

### C100-G03 — Reconciliar reuso, baseline e ownership PAR

- Estado: `DONE`. Prioridade: P0. Fase: F0. Trilha: T1. ROM: 2–4 dias.
- Dono proposto: L0 — Integrador (contratos, schema, gates e ledgers).
- Onde: 0380, 0383 e manifests das candidatas.
- Como: Conferir status e evidência no SHA corrente, inclusive trabalho PARE100; mapear um writer por path e migrations; descontar só entregas integradas e requalificadas.
- Depende C100: C100-G01.
- Pré-requisitos/reuso PAR: nenhum; delta próprio. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: habilitador/qualificação transversal; não aumenta o numerador por concluir o cartão.
- Aceite: Nenhuma tarefa de implementação duplicada; fila PAR preservada; saldo de esforço e dependências publicado.
- Resultado documental:58PARreconciliados,source/ranges/metadataexatos,donosoriginais e625diasnominaissem desconto porqualificação nãointegrada; [parecerR2](../04_audit/evidence/CLAUDE100-EXEC-20261017/g02-g04-review-r2/verdict.json) aceita snapshot e754adulteraçõesdocumentais rejeitadas. [Reconciliação](../04_audit/evidence/CLAUDE100-EXEC-20261017/G03-reuse-reconciliation.md). EstadosPARvivos continuam0380; snapshot não é auditoriafuncional dos58.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Executar o levantamento documental descrito, registrar resultado e encaminhar uma única próxima ação com dono.

### C100-G04 — Fechar Discovery/PRD inicial e pacote de decisões

- Estado: `DONE`. Prioridade: P0. Fase: F0. Trilha: T1. ROM: 3–5 dias.
- Dono proposto: L0 — Integrador (contratos, schema, gates e ledgers).
- Onde: docs/00_discovery, docs/01_prd, docs/02_spec (novos IDs a reservar).
- Como: Definir equivalências e escolhas conhecidas; preparar SPEC da primeira fatia. Memória, remoto, undo e demais decisões futuras permanecem vinculadas aos cartões afetados; não usar aprovação fora de hash/condição.
- Depende C100: C100-G02, C100-G03.
- Pré-requisitos/reuso PAR: nenhum; delta próprio. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: habilitador/qualificação transversal; não aumenta o numerador por concluir o cartão.
- Aceite: Discovery/PRD e gate da primeira fatia definidos/aprovados antes de Q01; gates futuros explicitamente pendentes nos respectivos cartões, sem bloquear pesquisa/BUILD local já especificado. Nenhuma conta/serviço escolhido silenciosamente.
- Resultado: usuárioaprovouBUILDlocaldaSPEC0229/SHAbb42eb61…em17/10/2026, apósrevisãoR2/zero findings; [autoridade exata](../04_audit/evidence/CLAUDE100-EXEC-20261017/spec0229-build/authority.json). Discovery0020/PRD0029/contratoinicial/gatedamecanismoinicialdefinidos. M1/Q01integral/CQ01–CQ08continuamabertos; novosPAR/contas/produção nãorecebemaprovaçãoporassociação. O [pacote solicitado](../04_audit/evidence/CLAUDE100-EXEC-20261017/spec0229-approval-request.md) permanecehistórico do pedido, respondido no registrodeautoridade.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Executar o levantamento documental descrito, registrar resultado e encaminhar uma única próxima ação com dono.

## F1 — Comparador e fundação reutilizada

### C100-Q01 — Validar o comparador e demonstrar a jornada M1

- Estado: `IN_PROGRESS`. Prioridade: P0. Fase: F1. Trilha: T3. ROM: 10–20 dias.
- Dono proposto: L5 — Oráculos, testes, medição e revisão.
- Onde: scripts de qualificação, tests/claude100 e boundaries públicos do harness.
- Como: Reusar test-support; driver Claude/CVG recebe a mesma entrada sintética. Exigir controle correto autenticado aceito e controles adulterados rejeitados. Executar M1: abrir sessão, READ, WRITE retida, approval autenticado, retomar e restart sem duplicação, com contenção real.
- Depende C100: C100-G04.
- Pré-requisitos/reuso PAR: PAR-Q03, PAR-Q04, PAR-K01, PAR-K03, PAR-S01, PAR-X01, PAR-X02, PAR-X03, PAR-X04. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: habilitador/qualificação transversal; não aumenta o numerador por concluir o cartão.
- Aceite: Par referência/CVG conhecido correto PASS; adulteração, tenant trocado e referência ausente FAIL; jornada M1 e controles obrigatórios qualificados no mesmo SHA. Sem isso, todos os consumidores permanecem bloqueados.
- Unidadeativa:C100-Q01-QUALIFIER-001,apenasmecanismolocaldaSPEC0229aprovada, candidata/branch próprias derivadasD80. KitQ03qualificado localmente com16gates/38hashes; noveinputs idênticos na candidataQ01. Comparador/CLI na candidatacff0e7c3 concluiuCQ01–CQ08locais:399testes+39cenáriosindependentes,16gates e38hashesatuais; [resultado](../04_audit/evidence/CLAUDE100-EXEC-20261017/spec0229-build/REPORT.md). Unidade0229concluída, Q01/M1integraisabertos. NenhumcréditodeM1oufechamentodasnove dependências. Captura real da referência e oráculos da jornada continuam pendentes.
- Unidade local concluída: `C100-Q01-REF-PORT-001`, [resultado SPEC0235](../04_audit/evidence/CLAUDE100-EXEC-20261017/spec0235-runtime/REPORT.md). Aprovação humana exata cumprida, fonte28811967 e candidato8ad65c01: NP01–NP10 locais aceitos, 16 gates e 38 hashes oficiais; unit4952/0/1pendingbaseline, PG302/302, E2E12/12. Claude2.1.302 real observado com três POST/503 e 13 controles; auditoria independente163/163 sem bloqueios. Integração de27novos paths privados byteidênticos e250/250focais no root; SPEC/sete protegidos intactos, recursos próprios removidos. OriginalBUILD235 e LEDGER FAILED preservados; recuperação ORIGIN aprovada. Zero crédito M1/funcional; Q01 continua IN_PROGRESS.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: reconciliar contrato/dono da qualificação de boundary e preparar HOW do fecho do builder e binding privado de recursos. [Checkpoint5e3b](../04_audit/evidence/CLAUDE100-EXEC-20261017/foundation-qualification-preparation/REPORT.md):2camposTSAPPROVE/0obrigatórios;56nativos antes pendentes+12E2E PASS atuais,tipagem/lint/formato verdes. Três suítes94:51PASS43FAIL,7pinsDRIFT/6files;15pendentes anteriores+fence não executados. P5/P0qualificação global aberta,nãoháfullcertnova ourootpromote;PGremovido/jobs0/portaslivres. Preservar5e3b,99c9 eoldFAILED,semrepin/waiver;117+17,M1/PAR,0029/0030 abertos,238pendinghumano.
- Gate pendente independente: `C100-Q01-REF-CAPTURE-001:AWAIT-HUMAN-T3` — aguardar resposta à decisão já enviada sobre o [pacote SPEC0238](../04_audit/evidence/CLAUDE100-EXEC-20261017/spec0238-decision/decision-packet.md), SHA48b270842ec83b422ecafeff2a4e802abd2194838ad3669becd2ebf825c464e6. Revisão independenteR2 APPROVE_SPEC/zero obrigatórios/43checks; retrabalho1/2 usado, R1preservada. Proposta de3cenários locaisSSE/Read/WriteDenied, semM1/adapterCVG/modelo/conta real. BUILD não autorizado até resposta explícita. SetePARM1 e117+17mantidos;0221/0225têm ajustes já aprovados e não serão reperguntados. Entrega da pergunta accepted:true não é aprovação; não reenviar nem iniciar BUILD por timeout.
- Atualização 19/10/2026 (CONT-20261018-D9EF): o gate acima está resolvido. A SPEC0238 recebeu as revisões r4 e r5, todas aprovadas pelo usuário; a SPEC vigente é [r5](../02_spec/0238_claude_scripted_reference_capture.md) (`73ab205e`). A única execução nativa da r5 (run3) capturou os três casos, com desfechos pré-registrados R1 e W1 ([estado](../04_audit/evidence/CLAUDE100-EXEC-20261017/ref-capture-build/r5-run/state.json)). O coletor está na `main` pelo PR #5. A captura é só referência (`REFERENCE_CAPTURE_ONLY`, revisão `PENDING`): sem crédito funcional, M1 ou PAR, e `semanticQualification` continua `NOT_GRANTED`. Seguem abertos o RC10 (gate externo), a verificação externa do RC11 e o comparador semântico do conteúdo do Read, que o cliente numera.

## F2 — Sessão, streaming, contexto e modelos

### C100-S01 — Mapear experiência de continuidade e seleção de sessão

- Estado: `TODO`. Prioridade: P1. Fase: F2. Trilha: T3. ROM: 6–12 dias.
- Dono proposto: L1 — Sessões, persistência, memória e snapshots.
- Onde: packages/harness/src/session, packages/persistence/src/session-events.ts, packages/sdk e host CLI.
- Como: Consumir sessões e fork PAR; adicionar seleção, nome, vínculo de contexto/PR, persistência opt-out e retenção sem outro store.
- Depende C100: C100-Q01.
- Pré-requisitos/reuso PAR: PAR-K03, PAR-S01, PAR-S02, PAR-S03, PAR-S04, PAR-S05, PAR-S07, PAR-H01. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-03-01, CC100-03-02, CC100-03-03, CC100-03-06, CC100-03-07, CC100-03-10.
- Aceite: Continuidade entre processos, seleção e fork pelo contrato público; approval não se transfere ao fork; opt-out não grava conteúdo recuperável.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-S02 — Completar contrato headless, schema e envelopes incrementais

- Estado: `TODO`. Prioridade: P1. Fase: F2. Trilha: T3. ROM: 7–15 dias.
- Dono proposto: L2 — API/SDK/CLI, configuração e clientes.
- Onde: packages/sdk, apps/api e host CLI sobre o gateway atual.
- Como: Reusar chunks e cursor PAR; definir entrada/saída text/json/stream, schema, parciais e replay de mensagem; manter erro final e EOF explícitos.
- Depende C100: C100-Q01.
- Pré-requisitos/reuso PAR: PAR-M01, PAR-A01, PAR-A02, PAR-A05, PAR-A07, PAR-H01. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-07-02, CC100-07-03, CC100-07-05, CC100-07-06, CC100-07-07, CC100-07-09.
- Aceite: CLI/SDK correspondem aos casos de referência; um terminal; JSON inválido e corte de stream nunca viram sucesso.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-C01 — Memória aprendida com revisão e proveniência

- Estado: `TODO`. Prioridade: P1. Fase: F2. Trilha: T3. ROM: 9–18 dias.
- Dono proposto: L1 — Sessões, persistência, memória e snapshots.
- Onde: packages/harness/src/context-engine.ts e adapter persistente de memória a especificar.
- Como: Separar regra aprovada, nota aprendida e resumo derivado; usar tenant/workspace, origem, validade, revisão, exclusão e precedência.
- Depende C100: C100-S01.
- Pré-requisitos/reuso PAR: PAR-C01, PAR-C02, PAR-C03, PAR-C05, PAR-C06. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-06-06, CC100-06-07, CC100-06-08, CC100-06-09.
- Aceite: Memória útil reaparece na sessão autorizada; expirada/cruzada não entra; nota não autoriza efeito nem substitui fonte institucional.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-C02 — Instruções por escopo e snapshot efetivo do prompt

- Estado: `TODO`. Prioridade: P1. Fase: F2. Trilha: T3. ROM: 6–12 dias.
- Dono proposto: L1 — Sessões, persistência, memória e snapshots.
- Onde: packages/platform/src/prompt-composer.ts, packages/harness/src/context-engine.ts e contratos.
- Como: Resolver origens aprovadas e precedência; carregar referências de arquivo dentro do workspace; registrar digest e semântica de snapshot/resume/compactação.
- Depende C100: C100-S01.
- Pré-requisitos/reuso PAR: PAR-C06, PAR-M02, PAR-K05, PAR-H02. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-06-05, CC100-14-05, CC100-14-06.
- Aceite: Prompt reproduzível por execução e versão; alteração durante resume respeita snapshot; instrução de origem negada não entra.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-B01 — Budget agregado persistente e reservas concorrentes

- Estado: `TODO`. Prioridade: P0. Fase: F2. Trilha: T3. ROM: 7–14 dias.
- Dono proposto: L1 — Sessões, persistência, memória e snapshots.
- Onde: packages/model-gateway/src/budget.ts e adapter PostgreSQL, contratos compartilhados pelo integrador.
- Como: Persistir reserva/consumo por árvore de execução; não somar duas vezes retries; reconciliar crash e efeitos incertos antes de liberar saldo.
- Depende C100: C100-S01.
- Pré-requisitos/reuso PAR: nenhum; delta próprio. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-10-01, CC100-10-02, CC100-10-03, CC100-10-08.
- Aceite: Dois filhos concorrentes e restart não ampliam teto agregado; expiração/cancelamento conservam contabilização sem conceder crédito fictício.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-B02 — Effort, seleção e fallback com rastreio explícito

- Estado: `TODO`. Prioridade: P1. Fase: F2. Trilha: T3. ROM: 3–7 dias.
- Dono proposto: L2 — API/SDK/CLI, configuração e clientes.
- Onde: packages/model-gateway/src/router.ts, contracts e host de configuração.
- Como: Mapear effort aos providers que o suportam; validar unsupported; registrar tentativas/fallback sem mudança silenciosa de localidade.
- Depende C100: C100-Q01.
- Pré-requisitos/reuso PAR: PAR-M05, PAR-K05, PAR-H02. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-10-05, CC100-10-06, CC100-10-07.
- Aceite: Perfil e effort efetivos visíveis; erro de capacidade explícito; indisponibilidade pode usar fallback autorizado, nunca egress proibido.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

## F3 — MCP, skills, plugins e avaliação

### C100-K01 — Mapear lifecycle completo e configurações de hooks

- Estado: `TODO`. Prioridade: P1. Fase: F3. Trilha: T3. ROM: 5–10 dias.
- Dono proposto: L3 — MCP, hooks, skills e plugins.
- Onde: packages/harness/src/kernel, packages/platform/src/event-bus.ts e adaptador de formatos.
- Como: Reusar executor e ponte PAR; inventariar eventos da referência; traduzir matcher/merge/escopo e razões; não criar segundo controle obrigatório.
- Depende C100: C100-Q01.
- Pré-requisitos/reuso PAR: PAR-K04, PAR-K09, PAR-K10, PAR-X01. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-01-01, CC100-01-02, CC100-01-04, CC100-01-07, CC100-01-08.
- Aceite: Todo evento incluído no catálogo tem trigger público e prova; timeout, origem e precedência tratados; hook não amplia grant.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-T01 — Compatibilidade SKILL.md e carregamento progressivo

- Estado: `TODO`. Prioridade: P1. Fase: F3. Trilha: T3. ROM: 4–9 dias.
- Dono proposto: L3 — MCP, hooks, skills e plugins.
- Onde: packages/harness/src/skills e catálogo aprovado.
- Como: Adaptar frontmatter e invocação nomeada; só descrições no discovery, corpo/referências sob demanda e confinados; reconciliar requiredTools com grant.
- Depende C100: C100-Q01.
- Pré-requisitos/reuso PAR: PAR-T07, PAR-C06, PAR-K05. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-05-01, CC100-05-02, CC100-05-03.
- Aceite: Skill é descoberta e invocada sem carregar todos os corpos; conteúdo fora do root/hash inválido ou ferramentas proibidas é recusado.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-T02 — Ciclo de plugins, dependências e custo de contexto

- Estado: `TODO`. Prioridade: P1. Fase: F3. Trilha: T3. ROM: 4–10 dias.
- Dono proposto: L3 — MCP, hooks, skills e plugins.
- Onde: packages/platform/src/plugin-gateway.ts, catálogo persistente e console/CLI.
- Como: Adicionar inventário, validação, config por schema, enable/disable/update e footprint; instalar só pacote revisado; upgrades respeitam quiescência.
- Depende C100: C100-T01.
- Pré-requisitos/reuso PAR: PAR-H04, PAR-K04, PAR-H02. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-05-05, CC100-05-07, CC100-05-08, CC100-05-09.
- Aceite: Versão/dependências efetivas e custo são inspecionáveis; update concorrente não troca execução em curso nem ativa plugin sem revisão.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-P01 — Compatibilidade de transportes e configuração MCP

- Estado: `TODO`. Prioridade: P1. Fase: F3. Trilha: T3. ROM: 7–15 dias.
- Dono proposto: L3 — MCP, hooks, skills e plugins.
- Onde: adaptador MCP a especificar em packages/adapters, contracts e host.
- Como: Estender cliente PAR apenas para transportes/escopos confirmados, incluindo SSE/WebSocket se presentes; OAuth por referência; strict-config sem autodiscovery.
- Depende C100: C100-Q01.
- Pré-requisitos/reuso PAR: PAR-P01, PAR-X01, PAR-X02, PAR-X03, PAR-T12, PAR-H03. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-04-03, CC100-04-04, CC100-04-05, CC100-04-06, CC100-04-07.
- Aceite: Transporte necessário funciona com servidor sintético; strict-config ignora fontes não explícitas; credencial, schema e egress inválidos são recusados.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-P02 — Recursos, prompts, elicitação e servidor MCP com identidade

- Estado: `TODO`. Prioridade: P1. Fase: F3. Trilha: T3. ROM: 10–20 dias.
- Dono proposto: L2 — API/SDK/CLI, configuração e clientes.
- Onde: adaptador MCP cliente/servidor, packages/sdk e rotas de approval/entrada.
- Como: Tratar instruções e resources como dados não confiáveis; entrada humana correlacionada e limites; expor sessão/ferramentas aprovadas pelo host como servidor MCP com handshake próprio, sem confundir com SDK JSON-RPC.
- Depende C100: C100-P01, C100-S02.
- Pré-requisitos/reuso PAR: PAR-P01, PAR-A07, PAR-T11. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-04-09, CC100-04-10, CC100-04-11.
- Aceite: MCP pede entrada e retoma uma vez; servidor do host interoperável; resposta humana falsa, URL hostil, conteúdo excedido ou cliente sem grant é negado.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-E01 — Evals com ablação, mocks e orçamento local

- Estado: `TODO`. Prioridade: P1. Fase: F3. Trilha: T3. ROM: 6–12 dias.
- Dono proposto: L5 — Oráculos, testes, medição e revisão.
- Onde: test-lab, packages/agent-evals e runner dedicado de extensão.
- Como: Rodar mesma fixture com/sem extensão e múltiplas repetições; mocks padrão; scripts/servidores reais só com grant; relatório local sem publicação implícita.
- Depende C100: C100-T02, C100-Q01.
- Pré-requisitos/reuso PAR: PAR-Q03, PAR-Q04, PAR-T07. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-15-01, CC100-15-02, CC100-15-03, CC100-15-04, CC100-15-05.
- Aceite: Mede delta de qualidade/custo/latência; threshold e teto falham quando excedidos; plugin adulterado não passa por fixture autocertificada.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-E02 — Promoção de extensão por evidência e regressão

- Estado: `TODO`. Prioridade: P1. Fase: F3. Trilha: T3. ROM: 5–10 dias.
- Dono proposto: L5 — Oráculos, testes, medição e revisão.
- Onde: qualificação, catálogo de plugins e pipeline de promoção.
- Como: Vincular resultados a hash/versão de plugin, fixture, grader e modelo; impedir que nota de qualidade compense regressão de controle.
- Depende C100: C100-E01.
- Pré-requisitos/reuso PAR: PAR-K04. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-15-06, CC100-15-07, CC100-15-08.
- Aceite: Nova versão invalida receipt antigo; extensão sem prova atual não promove; relatório prova footprint e custo por braço.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

## F4 — Autonomia, hooks completos e operação

### C100-K02 — Handlers de hook HTTP, comando e modelo/agente contidos

- Estado: `TODO`. Prioridade: P1. Fase: F4. Trilha: T3. ROM: 6–12 dias.
- Dono proposto: L3 — MCP, hooks, skills e plugins.
- Onde: adapter de hooks sobre kernel/model-gateway/subprocesso existentes.
- Como: Adicionar somente tipos confirmados na referência; mesmo budget e grants; HTTP pelo boundary de egress; modelos/filhos sem autoridade adicional.
- Depende C100: C100-K01, C100-O01, C100-P01.
- Pré-requisitos/reuso PAR: PAR-K09, PAR-X01, PAR-X04. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-01-05, CC100-01-06.
- Aceite: Cada tipo confirmado passa caso sintético e negativo; timeout/cancelamento bloqueiam conforme contrato; comandos fora da allowlist não iniciam.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-O01 — Manifestos e perfis de subagentes especializados

- Estado: `TODO`. Prioridade: P1. Fase: F4. Trilha: T3. ROM: 5–12 dias.
- Dono proposto: L4 — Subagentes, jobs, workspaces e hosts remotos.
- Onde: supervisor sobre packages/harness e contracts; composição de perfil em platform.
- Como: Reusar spawn/fork PAR; contextos independentes, perfil/modelo, skills, grants por interseção e resultado correlacionado; registrar limites herdados.
- Depende C100: C100-S01, C100-B01, C100-T01, C100-K01.
- Pré-requisitos/reuso PAR: PAR-O01, PAR-K06, PAR-S04, PAR-K05, PAR-M05. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-02-01, CC100-02-03, CC100-02-05, CC100-02-06.
- Aceite: Filho especializado roda no mesmo kernel; contexto não vaza; limite de profundidade/fanout e budget rejeita caso excedente.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-O02 — Attach, logs, stop e respawn de sessões background

- Estado: `TODO`. Prioridade: P1. Fase: F4. Trilha: T3. ROM: 4–9 dias.
- Dono proposto: L4 — Subagentes, jobs, workspaces e hosts remotos.
- Onde: apps/worker, apps/api e host CLI sobre jobs PAR.
- Como: Separar job de agente e subagente; mapear ID/nome, attach e retomada de versão com ownership e histórico durável. Consumir posse/cleanup W01 antes de remover sessão e worktree.
- Depende C100: C100-S01, C100-S02, C100-W01.
- Pré-requisitos/reuso PAR: PAR-O03, PAR-A04. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-11-02, CC100-11-03, CC100-11-04, CC100-11-06, CC100-11-07.
- Aceite: Operador dono acompanha e para job; respawn retoma sem efeito duplicado; remoção usa dono e conflito do W01; erro e saída parcial não são conclusão bem-sucedida.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-O03 — Steering, mailbox e cancelamento de árvore de agentes

- Estado: `TODO`. Prioridade: P1. Fase: F4. Trilha: T3. ROM: 6–12 dias.
- Dono proposto: L4 — Subagentes, jobs, workspaces e hosts remotos.
- Onde: supervisor, eventos de sessão e worker.
- Como: Integrar mensagens continuáveis ao cursor e reconciliar filhos vivos no restart; cancelar árvore, aguardar quiescência e preservar causa primária em cleanup.
- Depende C100: C100-O01, C100-O02, C100-B01.
- Pré-requisitos/reuso PAR: PAR-O02, PAR-K06. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-02-08, CC100-11-08.
- Aceite: Mailbox entrega uma vez; cancelamento alcança filho e neto; cleanup com falha não oculta erro original nem marca sucesso.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-L01 — Plano revisável e todos com transição governada

- Estado: `TODO`. Prioridade: P1. Fase: F4. Trilha: T3. ROM: 4–8 dias.
- Dono proposto: L2 — API/SDK/CLI, configuração e clientes.
- Onde: projeções de sessão, packages/platform e console/CLI.
- Como: Consumir modo plan PAR, versionar plano/todos e transição para execução; mensagens não servem como approval fora do canal próprio.
- Depende C100: C100-S01, C100-H01.
- Pré-requisitos/reuso PAR: PAR-O09, PAR-K05, PAR-T11. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-08-02, CC100-08-04, CC100-08-06.
- Aceite: Plano persiste, é revisável e consultável; executar sem gate permanece bloqueado; alteração de plano invalida a aprovação vinculada.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-H01 — Perfis de permissão e modo restricted verificáveis

- Estado: `TODO`. Prioridade: P0. Fase: F4. Trilha: T3. ROM: 4–8 dias.
- Dono proposto: L2 — API/SDK/CLI, configuração e clientes.
- Onde: kernel/policy, perfis de host e console/CLI.
- Como: Mapear allow/deny/manual/dontAsk/plan e restricted; manter piso de policy e matriz por ferramenta; tratar modo incompatível explicitamente.
- Depende C100: C100-Q01.
- Pré-requisitos/reuso PAR: PAR-K05, PAR-U07, PAR-X04. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-09-08.
- Aceite: READ permitido funciona; WRITE/EXTERNAL negado não inicia; aprovação não é inferida de mensagem ou resultado de modelo.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-H02 — Configuração efetiva, safe/bare e diagnóstico

- Estado: `TODO`. Prioridade: P1. Fase: F4. Trilha: T3. ROM: 5–10 dias.
- Dono proposto: L2 — API/SDK/CLI, configuração e clientes.
- Onde: configuração de hosts, prompt-composer e inspetor autenticado.
- Como: Declarar precedência user/project/local/managed; modos de diagnóstico removem personalizações sem retirar controles; expor dumps redigidos e erros.
- Depende C100: C100-Q01, C100-C02.
- Pré-requisitos/reuso PAR: PAR-H02, PAR-M02, PAR-K05. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: PAR-I03. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-14-01, CC100-14-02, CC100-14-03, CC100-14-04, CC100-14-08.
- Aceite: Sem auto-load indevido em modo explícito; safe/bare não desliga policy/approval; segredo não aparece em dump, erro ou log.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-W01 — Worktree gerenciado e diretórios adicionais por tarefa

- Estado: `TODO`. Prioridade: P1. Fase: F4. Trilha: T3. ROM: 7–14 dias.
- Dono proposto: L4 — Subagentes, jobs, workspaces e hosts remotos.
- Onde: adapter Git/workspace novo, contracts e host CLI.
- Como: Criar worktree em branch/raiz próprias com claim e dono; conceder add-dir validado; recuperar metadados e preparar limpeza com prova de alterações antes do remove de background O02.
- Depende C100: C100-S01, C100-H01.
- Pré-requisitos/reuso PAR: PAR-T09, PAR-X04. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-12-02, CC100-12-03, CC100-12-04, CC100-12-05.
- Aceite: Tarefa isolada executa no workspace certo; cleanup preserva alterações de terceiros; path/symlink fora do grant é negado.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

## F5 — Workspaces, terminais e rewind

### C100-W02 — Integração de terminal e tmux com posse

- Estado: `TODO`. Prioridade: P1. Fase: F5. Trilha: T3. ROM: 3–7 dias.
- Dono proposto: L4 — Subagentes, jobs, workspaces e hosts remotos.
- Onde: adapter PTY/tmux sobre subprocesso e jobs existentes.
- Como: Usar PTY persistente do PAR e multiplexador opcional; declarar suporte Linux da referência; detectar indisponibilidade sem fingir sessão criada.
- Depende C100: C100-W01, C100-O02.
- Pré-requisitos/reuso PAR: PAR-T14, PAR-T10, PAR-X01. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-12-06.
- Aceite: Attach, resize, EOF e stop funcionam com IDs próprios; falha de tmux é explícita; nenhum processo alheio é encerrado.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-U01 — Histórico de arquivos e rewind de código/conversa

- Estado: `TODO`. Prioridade: P1. Fase: F5. Trilha: T3. ROM: 8–16 dias.
- Dono proposto: L1 — Sessões, persistência, memória e snapshots.
- Onde: adapter de snapshots de artefatos e projeções de sessão.
- Como: Guardar versão base antes de edição própria; separar restaurar código, conversa ou ambos; resumo dirigido e fork conservam origem e trilha.
- Depende C100: C100-S01, C100-W01.
- Pré-requisitos/reuso PAR: PAR-S04, PAR-T01, PAR-T05. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-13-01, CC100-13-02, CC100-13-03, CC100-13-04.
- Aceite: Rewind restaura o conjunto selecionado e mantém histórico original; não reaproveita approval nem presume reverter efeito externo.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-U02 — Conflito de restore, retenção e limites de undo

- Estado: `TODO`. Prioridade: P1. Fase: F5. Trilha: T3. ROM: 7–14 dias.
- Dono proposto: L1 — Sessões, persistência, memória e snapshots.
- Onde: store de snapshots e boundary de ferramenta de arquivo.
- Como: Detectar mudança posterior por outro writer; definir retenção e exclusão; mostrar mudanças de shell/filho não cobertas pelo snapshot confirmado.
- Depende C100: C100-U01, C100-W02.
- Pré-requisitos/reuso PAR: PAR-T01, PAR-T05. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-13-05, CC100-13-06, CC100-13-07.
- Aceite: Restore com conflito é recusado com preview; snapshots expirados não geram sucesso falso; journal externo permanece intacto.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

## F6 — Cloud, controle remoto, IDE e gateway

### C100-R01 — Sessões cloud em ambiente controlado

- Estado: `TODO`. Prioridade: P1. Fase: F6. Trilha: T4. ROM: 15–30 dias.
- Dono proposto: L4 — Subagentes, jobs, workspaces e hosts remotos.
- Onde: host remoto/worker pool e control-plane a especificar; núcleo só portas.
- Como: Confirmar semântica cloud/environment da referência antes da SPEC; implementar criar/selecionar ambiente e anexar sessão via adapter autenticado, com estado e recuperação.
- Depende C100: C100-O02, C100-H02, C100-P01.
- Pré-requisitos/reuso PAR: PAR-H03. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: PAR-P04. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-16-01, CC100-16-02, CC100-16-03.
- Aceite: Criação/attach/retomada funcionam entre clientes com dados sintéticos; falha de ambiente não duplica execução; SSH sozinho não fecha o cartão.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-R02 — Controle remoto consentido e revogável

- Estado: `TODO`. Prioridade: P1. Fase: F6. Trilha: T4. ROM: 10–22 dias.
- Dono proposto: L2 — API/SDK/CLI, configuração e clientes.
- Onde: serviço de pareamento remoto e rotas do host a especificar.
- Como: Definir identidade/dispositivo, consentimento, canal seguro, expiração e revogação; cada comando continua sujeito aos controles do kernel.
- Depende C100: C100-R01, C100-S02, C100-H01.
- Pré-requisitos/reuso PAR: PAR-A02, PAR-H03. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-16-04, CC100-16-05.
- Aceite: Cliente aprovado acompanha/controla a própria sessão; revogado, replay, tenant errado e token expirado são recusados.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-R03 — Integração IDE e handoff para cliente desktop

- Estado: `TODO`. Prioridade: P1. Fase: F6. Trilha: T4. ROM: 10–22 dias.
- Dono proposto: L2 — API/SDK/CLI, configuração e clientes.
- Onde: adapter/extensão IDE e cliente desktop consumidor opcionais, fora do núcleo.
- Como: Confirmar superfícies da referência; ligar sessão/cwd, diffs, stream e aprovação ao editor; tratar zero/um/vários IDEs e handoff desktop.
- Depende C100: C100-R02, C100-W01.
- Pré-requisitos/reuso PAR: PAR-A07, PAR-H01. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: PAR-P03, PAR-U01. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-16-06, CC100-16-07, CC100-16-08.
- Aceite: IDE selecionado recebe a sessão correta, mostra diff e responde approval autenticado; conexão ambígua pede escolha, nunca conecta silenciosamente ao workspace errado.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-R04 — Gateway corporativo de autenticação e telemetria

- Estado: `TODO`. Prioridade: P1. Fase: F6. Trilha: T4. ROM: 10–22 dias.
- Dono proposto: L2 — API/SDK/CLI, configuração e clientes.
- Onde: adapter enterprise gateway e configuração YAML a especificar.
- Como: Resolver primeiro a capacidade anunciada apenas por help; congelar oráculo, IdP/protocolo e destino de telemetria; reutilizar model-gateway somente no papel que lhe compete.
- Depende C100: C100-R01, C100-H02.
- Pré-requisitos/reuso PAR: PAR-H03, PAR-I05. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: CC100-16-09, CC100-16-10.
- Aceite: Gateway de ambiente sintético aplica identidade, política de encaminhamento e telemetria sem segredo; config inválida e pedido sem identidade são recusados; oráculo real da referência obrigatório.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

## F7 — Qualificação, CI e aceite independente

### C100-Q02 — Qualificação completa das 16 famílias e controles CVG

- Estado: `TODO`. Prioridade: P0. Fase: F7. Trilha: T3. ROM: 10–18 dias.
- Dono proposto: L5 — Oráculos, testes, medição e revisão.
- Onde: suíte Claude100 e manifests da candidata.
- Como: Rodar resultados FUNCTIONAL_PARITY na referência e no CVG; rodar CVG_CONTROL contra a SPEC CVG aprovada, com positivos/negativos e trace bruto. Não exigir observação de mecanismos internos do Claude para controles exclusivos.
- Depende C100: C100-S02, C100-C01, C100-C02, C100-B02, C100-K02, C100-T02, C100-P02, C100-O03, C100-L01, C100-H02, C100-U02, C100-E02, C100-R03, C100-R04.
- Pré-requisitos/reuso PAR: nenhum; delta próprio. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: habilitador/qualificação transversal; não aumenta o numerador por concluir o cartão.
- Aceite: 117 resultados comparáveis e17controles adicionais atuais executados pelo contrato de sua classe; nenhum obrigatório ausente/skip, nenhum mock substituindo a referência funcional ou divergência sem decisão.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-Q03 — Recuperação, contenção e performance comparáveis

- Estado: `TODO`. Prioridade: P0. Fase: F7. Trilha: T3. ROM: 7–14 dias.
- Dono proposto: L5 — Oráculos, testes, medição e revisão.
- Onde: fixtures nativas, carga sintética e pipeline de recuperação.
- Como: Injetar crash, cancelamento, indisponibilidade, corrida e replay nos caminhos públicos; medir latência/recursos no workload congelado em G04.
- Depende C100: C100-Q02.
- Pré-requisitos/reuso PAR: PAR-X03. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: habilitador/qualificação transversal; não aumenta o numerador por concluir o cartão.
- Aceite: Nenhum vazamento, efeito duplicado ou grant expandido; SLOs aprovados satisfeitos; causa primária preservada em falha dupla.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-Q04 — Medidor Claude e bloqueio no CI da candidata

- Estado: `TODO`. Prioridade: P0. Fase: F7. Trilha: T4. ROM: 5–10 dias.
- Dono proposto: L5 — Oráculos, testes, medição e revisão.
- Onde: scripts de medição, workflow CI e manifests.
- Como: Reusar infraestrutura de CI PAR sem alterar o denominador DeepSeek; derivar percentual de requisitos e receipts íntegros vinculados ao mesmo SHA/digest.
- Depende C100: C100-Q02, C100-Q03.
- Pré-requisitos/reuso PAR: PAR-Q06, PAR-Q08. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: habilitador/qualificação transversal; não aumenta o numerador por concluir o cartão.
- Aceite: Receipts falsos, stale, exclusão de requisito, mudança de referência ou regressão derrubam check; imagem/SBOM vinculados à candidata.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

### C100-Q05 — Auditoria independente e aceite dos 100%

- Estado: `TODO`. Prioridade: P0. Fase: F7. Trilha: T4. ROM: 5–10 dias.
- Dono proposto: L5 — Oráculos, testes, medição e revisão.
- Onde: pacote hash-bound Claude100 e relatório independente.
- Como: Auditor fresh-context reproduz amostra negativa de cada família e verifica todos os receipts/oráculos; decisão humana só no pacote concreto; produção segue 0374.
- Depende C100: C100-Q04.
- Pré-requisitos/reuso PAR: nenhum; delta próprio. A entrega correspondente precisa estar integrada e qualificada; plano/flag verde antigo não satisfaz dependência.
- Reuso opcional, sem bloquear a sequência: nenhum. Esses cartões só entram no caminho crítico/esforço se a SPEC escolher esse carrier ou interface.
- Requisitos diretamente atribuídos: habilitador/qualificação transversal; não aumenta o numerador por concluir o cartão.
- Aceite: Todos os requisitos PASS_CURRENT, 16 famílias completas, zero exceção aberta, controles verdes e decisão humana registrada; documentação sozinha não encerra.
- Prova: procedimentos positivos e negativos do catálogo nos boundaries públicos, manifesto com SHA/digests, log bruto e parecer independente; gate humano quando aplicável. Para T1, inspeção rastreável e checks documentais. Não executado nesta rodada.
- Próxima ação: Conferir fonte e oráculo; preparar ou reconciliar a SPEC com os donos PAR; só executar código após o gate da fatia.

## Matriz completa de aceites por família

**134 requisitos obrigatórios: 117 resultados comparáveis e 17 controles CVG adicionais; todos `NOT_RUN` nesta medida.** Só resultados comparáveis precisam de oráculo funcional Claude. Controles CVG exigem SPEC aprovada e testes CVG, sem impor observabilidade de mecanismos internos do Claude. Nenhum controle deixa de ser condição de conclusão. A revisão draft-r2 preserva todos os IDs anteriores e decompõe 03-08 em consulta, exportação03-09 e retenção03-10.
As fontes são classificadas no catálogo: help observado não é comportamento funcional ensaiado; detalhes CVG propostos dependem de G01/G02/G04. Cada título é o resultado observável a exercitar; o catálogo contém procedimento positivo, negativo, origem e contrato de evidência.

### CC18-01 — Hooks configuráveis

| Requisito   | Resultado observável                                                | Dono da implementação | Caso negativo obrigatório                          |
| ----------- | ------------------------------------------------------------------- | --------------------- | -------------------------------------------------- |
| CC100-01-01 | Eventos de início e fim de sessão acionam hooks                     | C100-K01              | Evento ausente ou duplicado é detectado            |
| CC100-01-02 | Chamadas de ferramenta têm eventos antes, depois e de falha         | C100-K01              | Ferramenta negada nunca aparece como executada     |
| CC100-01-03 | Matcher seleciona ferramenta ou evento correto                      | PAR-K09               | Padrão de outra ferramenta não dispara handler     |
| CC100-01-04 | Merge e escopo de hooks preservam regras obrigatórias               | C100-K01              | Configuração local não retira controle gerenciado  |
| CC100-01-05 | Handlers confirmados de comando e HTTP funcionam                    | C100-K02              | Comando sem grant e URL negada não iniciam         |
| CC100-01-06 | Handlers confirmados de modelo/agente retornam resultado controlado | C100-K02              | Filho/hook não concede approval ao pai             |
| CC100-01-07 | Timeout, cancelamento e exit codes produzem decisão documentada     | C100-K01              | Falha de handler nunca é convertida em autorização |
| CC100-01-08 | Eventos de subagente e compactação são correlacionados              | C100-K01              | Evento de outro tenant não chega ao hook           |
| CC100-01-09 | Importação de configuração Claude conserva semântica suportada      | PAR-K10               | Campo não suportado é recusado em vez de ignorado  |

### CC18-02 — Subagentes com autoridade herdada

| Requisito   | Resultado observável                                       | Dono da implementação | Caso negativo obrigatório                           |
| ----------- | ---------------------------------------------------------- | --------------------- | --------------------------------------------------- |
| CC100-02-01 | Definição nomeada de agente seleciona perfil e prompt      | C100-O01              | Nome desconhecido falha explicitamente              |
| CC100-02-02 | Subagente especializado usa contexto independente          | PAR-O01               | Conteúdo privado de outra sessão não é herdado      |
| CC100-02-03 | Fork herda somente contexto e identidade autorizados       | C100-O01              | Approval consumida do pai não autoriza filho        |
| CC100-02-04 | Ferramentas e permissões do filho são configuráveis        | PAR-O01               | Filho não amplia grant ou tenant                    |
| CC100-02-05 | Modelo, effort e skills são selecionáveis por filho        | C100-O01              | Modelo/skill fora do catálogo não é carregado       |
| CC100-02-06 | Resultado do filho retorna ao pai com identidade           | C100-O01              | Relatório do filho não altera política nem approval |
| CC100-02-07 | Mensagem e retomada do filho sobrevivem a restart          | PAR-O02               | Duplicata de mensagem não gera segundo efeito       |
| CC100-02-08 | Stop, wait e limite de profundidade/fanout são observáveis | C100-O03              | Pai cancelado não deixa execução autorizada órfã    |

### CC18-03 — Continuidade e fork de sessão

| Requisito   | Resultado observável                                         | Dono da implementação | Caso negativo obrigatório                               |
| ----------- | ------------------------------------------------------------ | --------------------- | ------------------------------------------------------- |
| CC100-03-01 | Continue seleciona a conversa recente do workspace           | C100-S01              | Workspace de outro tenant não é selecionado             |
| CC100-03-02 | Resume seleciona sessão por identidade e consulta            | C100-S01              | Sessão inexistente retorna erro ou escolha explícita    |
| CC100-03-03 | Session-id e nome têm identidade estável                     | C100-S01              | Colisão de identidade não sobrescreve sessão            |
| CC100-03-04 | Sessão persiste entre processos e hosts autorizados          | PAR-S01               | Restart não perde pendência de approval                 |
| CC100-03-05 | Fork cria linhagem preservando original                      | PAR-S04               | Fork não altera histórico do original                   |
| CC100-03-06 | Contexto ou PR associado permite localizar sessão            | C100-S01              | Associação manipulada não amplia acesso                 |
| CC100-03-07 | Modo sem persistência não deixa conversa retomável           | C100-S01              | Resume de conteúdo não persistido não tem sucesso falso |
| CC100-03-08 | Consulta e rastreio retornam o histórico autorizado          | PAR-S05               | Tenant cruzado não é retornado                          |
| CC100-03-09 | Exportação versionada preserva histórico e identidade        | PAR-S07               | Export de outro tenant não é permitido                  |
| CC100-03-10 | Retenção e exclusão impedem recuperação de conteúdo expirado | C100-S01              | Conteúdo removido ou expirado não reaparece no resume   |

### CC18-04 — MCP governado

| Requisito   | Resultado observável                                                   | Dono da implementação | Caso negativo obrigatório                                    |
| ----------- | ---------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| CC100-04-01 | Servidor stdio registra e executa ferramenta governada                 | PAR-P01               | Processo de servidor é encerrado no dispose                  |
| CC100-04-02 | Servidor HTTP é configurável por escopo                                | PAR-P01               | Servidor não aprovado não conecta                            |
| CC100-04-03 | SSE e transportes legados anunciados têm compatibilidade explícita     | C100-P01              | Transporte não implementado não recebe sucesso fictício      |
| CC100-04-04 | WebSocket anunciado em add-json tem decisão e prova de compatibilidade | C100-P01              | Compatibilidade não é inferida de suporte HTTP               |
| CC100-04-05 | List/get/add/remove respeitam configuração de usuário e projeto        | C100-P01              | Configuração de outro tenant não é listada                   |
| CC100-04-06 | Strict-config carrega somente servidores explícitos                    | C100-P01              | Servidor autodetectado fora da lista não inicia              |
| CC100-04-07 | OAuth, headers e ambiente são resolvidos por referência segura         | C100-P01              | Segredo não aparece em erro nem é herdado de outro servidor  |
| CC100-04-08 | Discovery valida identidade, schema e mudança de versão                | PAR-P01               | Ferramenta recém-descoberta não recebe grant automaticamente |
| CC100-04-09 | Resources, prompts e instruções são consumidos com limites             | C100-P02              | Prompt injection não muda instrução de controle              |
| CC100-04-10 | Elicitação humana usa identidade e cancelamento                        | C100-P02              | Resposta humana falsa ou replay não retoma execução          |
| CC100-04-11 | Host expõe servidor MCP com handshake e ferramentas aprovadas          | C100-P02              | Cliente sem grant não ganha ferramentas por se conectar      |

### CC18-05 — Skills progressivas e plugins verificáveis

| Requisito   | Resultado observável                                          | Dono da implementação | Caso negativo obrigatório                            |
| ----------- | ------------------------------------------------------------- | --------------------- | ---------------------------------------------------- |
| CC100-05-01 | Manifesto SKILL.md é validado e associado ao catálogo         | C100-T01              | Frontmatter hostil ou hash incorreto é recusado      |
| CC100-05-02 | Discovery carrega descrições sem todos os corpos              | C100-T01              | Catálogo não carrega referência fora do workspace    |
| CC100-05-03 | Invocação explícita carrega corpo e referências sob demanda   | C100-T01              | Skill desabilitada não é acionada implicitamente     |
| CC100-05-04 | RequiredTools, conhecimento e grants são reconciliados        | PAR-T07               | Skill não ganha ferramenta por declarar dependência  |
| CC100-05-05 | Plugin agrupa skills, agentes, hooks e servidores revisados   | C100-T02              | Instalar pacote não concede execução irrestrita      |
| CC100-05-06 | Gestão valida, instala, habilita e desabilita versão aprovada | PAR-H04               | Plugin não revisado não ativa                        |
| CC100-05-07 | Update/remove respeitam dependências e quiescência            | C100-T02              | Upgrade não muda execução já iniciada                |
| CC100-05-08 | Configuração de plugin usa schema e escopo visíveis           | C100-T02              | Valor inválido não altera configuração efetiva       |
| CC100-05-09 | Inventário e custo projetado de contexto são inspecionáveis   | C100-T02              | Estimativa sem base é identificada como desconhecida |

### CC18-06 — Contexto preservado e memória com proveniência

| Requisito   | Resultado observável                                                | Dono da implementação | Caso negativo obrigatório                                      |
| ----------- | ------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------- |
| CC100-06-01 | Pressão de contexto é medida antes da chamada de modelo             | PAR-C02               | Overflow conhecido não segue ao provider sem tratamento        |
| CC100-06-02 | Compactação automática preserva fatos e pendências                  | PAR-C01               | Approval ou obrigação aberta não desaparece no resumo          |
| CC100-06-03 | Compactação manual/dirigida preserva o transcript original          | PAR-C05               | Cancelamento não grava resumo parcial                          |
| CC100-06-04 | Saídas grandes são podadas ou referenciadas de forma rastreável     | PAR-C03               | Referência expirada não é apresentada como conteúdo disponível |
| CC100-06-05 | Instruções de projeto têm escopo, origem e precedência              | C100-C02              | Arquivo não aprovado não entra como instrução                  |
| CC100-06-06 | Memória aprendida pode ser escrita, inspecionada e revisada         | C100-C01              | Nota aprendida não se torna policy obrigatória                 |
| CC100-06-07 | Memória reaparece somente no tenant e workspace autorizados         | C100-C01              | Outra sessão sem grant não lê a memória                        |
| CC100-06-08 | Validade, retenção e exclusão da memória são operáveis              | C100-C01              | Nota removida/expirada não reaparece no prompt                 |
| CC100-06-09 | Desativar memória mantém sessão funcional sem reaprender em segredo | C100-C01              | Opt-out impede escrita e carregamento de notas                 |

### CC18-07 — Headless, streaming e saída estruturada

| Requisito   | Resultado observável                                                   | Dono da implementação | Caso negativo obrigatório                               |
| ----------- | ---------------------------------------------------------------------- | --------------------- | ------------------------------------------------------- |
| CC100-07-01 | Headless aceita prompt e encerra com resultado/erro explícitos         | PAR-H01               | Erro de execução não termina como sucesso               |
| CC100-07-02 | Entrada e saída text/json são selecionáveis                            | C100-S02              | Envelope inválido é recusado                            |
| CC100-07-03 | Stream-json emite mensagens ordenadas e versionadas                    | C100-S02              | Versão incompatível falha explicitamente                |
| CC100-07-04 | Chunks de modelo têm exatamente um resultado terminal                  | PAR-M01               | Corte de conexão não publica parcial como final         |
| CC100-07-05 | Schema JSON valida o resultado solicitado                              | C100-S02              | Saída fora do schema não é entregue como validada       |
| CC100-07-06 | Replay de entrada confirma mensagens sem repetir efeitos               | C100-S02              | Mensagem repetida não duplica efeito aprovado           |
| CC100-07-07 | Eventos de hook e texto de filhos são correlacionáveis no stream       | C100-S02              | Conteúdo de outra sessão não é encaminhado              |
| CC100-07-08 | API/SDK reconectam por cursor com backpressure                         | PAR-A01               | Queda e consumidor lento não perdem nem duplicam evento |
| CC100-07-09 | Pedido de approval/entrada no host pausa e retoma com EOF/cancelamento | C100-S02              | EOF ou resposta não autenticada não autoriza ferramenta |

### CC18-08 — Planejamento somente leitura

| Requisito   | Resultado observável                                       | Dono da implementação | Caso negativo obrigatório                             |
| ----------- | ---------------------------------------------------------- | --------------------- | ----------------------------------------------------- |
| CC100-08-01 | Modo plan explora somente com ferramentas de leitura       | PAR-O09               | WRITE e EXTERNAL solicitados permanecem negados       |
| CC100-08-02 | Plano é visível, revisável e versionado                    | C100-L01              | Plano alterado não conserva aprovação de outra versão |
| CC100-08-03 | Todos têm estado, dono e persistência por sessão           | PAR-O09               | Concluir item não conclui objetivo sem evidência      |
| CC100-08-04 | Transição de planejamento para execução preserva controles | C100-L01              | Texto do plano não é canal de approval                |
| CC100-08-05 | Allow/deny restringem as ferramentas do perfil             | PAR-K05               | Deny obrigatório prevalece sobre configuração local   |
| CC100-08-06 | Resume conserva plano, pendências e modo efetivo           | C100-L01              | Restart não converte plan em execução com escrita     |

### CC18-09 — Contenção verificável por host

| Requisito   | Resultado observável                                              | Dono da implementação | Caso negativo obrigatório                             |
| ----------- | ----------------------------------------------------------------- | --------------------- | ----------------------------------------------------- |
| CC100-09-01 | Host informa modos de contenção realmente disponíveis             | PAR-X02               | Kernel sem mecanismo exigido não retorna allowed      |
| CC100-09-02 | Filesystem fica limitado aos roots concedidos                     | PAR-X04               | Leitura/escrita fora do grant é recusada              |
| CC100-09-03 | Rede/egress só alcançam destinos permitidos                       | PAR-X04               | Destino negado ou SSRF não alcança o serviço          |
| CC100-09-04 | Processo e ambiente do filho têm dono e allowlist                 | PAR-X01               | Credencial do host não é herdada indiscriminadamente  |
| CC100-09-05 | Timeout, CPU, memória, pids e saída têm limites explícitos        | PAR-X03               | Fork bomb e saída ilimitada não escapam do budget     |
| CC100-09-06 | Ausência de sandbox falha fechado                                 | PAR-X02               | Ferramenta contida não cai para execução sem proteção |
| CC100-09-07 | Symlink, hardlink e traversal não ampliam acesso                  | PAR-X03               | Probe nativa de fuga é negada no host suportado       |
| CC100-09-08 | Modo restricted remove superfícies sem grant e conserva controles | C100-H01              | Flag de usuário não desliga policy ou approval        |

### CC18-10 — Budget, effort e fallback explícitos

| Requisito   | Resultado observável                                       | Dono da implementação | Caso negativo obrigatório                                        |
| ----------- | ---------------------------------------------------------- | --------------------- | ---------------------------------------------------------------- |
| CC100-10-01 | Teto monetário encerra execução com motivo explícito       | C100-B01              | Exceder teto não retorna conclusão bem-sucedida                  |
| CC100-10-02 | Árvore de agentes compartilha budget agregado              | C100-B01              | Filhos concorrentes não reservam o mesmo saldo                   |
| CC100-10-03 | Reservas/consumo sobrevivem a restart e retry              | C100-B01              | Falha de settlement não produz crédito fictício                  |
| CC100-10-04 | Modelo e perfil são selecionáveis por sessão               | PAR-M05               | Modelo não aprovado não inicia                                   |
| CC100-10-05 | Effort suportado é aplicado e visível                      | C100-B02              | Provider sem suporte retorna erro ou tradução aprovada explícita |
| CC100-10-06 | Fallback percorre alternativas aprovadas quando necessário | C100-B02              | Fallback não muda localidade/classificação silenciosamente       |
| CC100-10-07 | Falha e backoff ficam rastreáveis no custo e na trajetória | C100-B02              | Retry não oculta primeira causa ou efeito incerto                |
| CC100-10-08 | Cancelamento reconcilia custo de pai e filhos              | C100-B01              | Cancelar não apaga consumo já realizado                          |

### CC18-11 — Supervisor de jobs em segundo plano

| Requisito   | Resultado observável                                          | Dono da implementação | Caso negativo obrigatório                      |
| ----------- | ------------------------------------------------------------- | --------------------- | ---------------------------------------------- |
| CC100-11-01 | Sessão pode iniciar em background e retornar identidade       | PAR-O03               | Start repetido não cria execução duplicada     |
| CC100-11-02 | Listagem filtra estado, workspace e sessões concluídas        | C100-O02              | Outro tenant não aparece na lista              |
| CC100-11-03 | Attach por ID ou nome retoma visualização/entrada             | C100-O02              | Nome ambíguo exige escolha explícita           |
| CC100-11-04 | Logs são consultáveis sem conceder controle de execução       | C100-O02              | Leitor sem grant de escrita não envia comandos |
| CC100-11-05 | Stop encerra o job preservando conversa e resultado real      | PAR-O03               | Parcial ou cancelado não aparece como sucesso  |
| CC100-11-06 | Respawn troca processo/versão conservando sessão              | C100-O02              | Restart não repete efeito confirmado           |
| CC100-11-07 | Remove só elimina sessão e worktree próprios quando permitido | C100-O02              | Sessão ativa ou path alheio não é destruído    |
| CC100-11-08 | Steering e notificações acordam o dono dentro do teto         | C100-O03              | Mensagem duplicada não cria rodada sem limite  |

### CC18-12 — Workspaces e worktrees por tarefa

| Requisito   | Resultado observável                                               | Dono da implementação | Caso negativo obrigatório                                        |
| ----------- | ------------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------- |
| CC100-12-01 | Workspace é registrado por tenant e sessão                         | PAR-T09               | Outro tenant não consulta ou concede o root                      |
| CC100-12-02 | Diretórios adicionais são normalizados e concedidos explicitamente | C100-W01              | Traversal/symlink não expande o grant                            |
| CC100-12-03 | Worktree por tarefa tem branch, caminho e dono próprios            | C100-W01              | Colisão com trabalho existente não sobrescreve arquivos          |
| CC100-12-04 | Worktree é recuperável após interrupção                            | C100-W01              | Metadata ausente não autoriza limpeza cega                       |
| CC100-12-05 | Cleanup detecta alterações e preserva trabalho de terceiros        | C100-W01              | Commit/arquivo alheio não é descartado                           |
| CC100-12-06 | Integração tmux/PTY é detectável e operável                        | C100-W02              | Indisponibilidade ou plataforma incompatível gera erro explícito |

### CC18-13 — Rewind de arquivos e conversa

| Requisito   | Resultado observável                                    | Dono da implementação | Caso negativo obrigatório                            |
| ----------- | ------------------------------------------------------- | --------------------- | ---------------------------------------------------- |
| CC100-13-01 | Edição própria possui snapshot anterior ligado ao turno | C100-U01              | Snapshot ausente não produz undo fictício            |
| CC100-13-02 | Rewind pode restaurar somente código                    | C100-U01              | Histórico da conversa não é apagado por acidente     |
| CC100-13-03 | Rewind pode restaurar somente conversa ou ambos         | C100-U01              | Aprovação/efeito externo não é desfeito por rewind   |
| CC100-13-04 | Resumo dirigido libera contexto mantendo transcript     | C100-U01              | Resumo falho/cancelado não substitui estado válido   |
| CC100-13-05 | Restore valida conflitos de versão e escopo             | C100-U02              | Mudança posterior de outro writer bloqueia overwrite |
| CC100-13-06 | Retenção e expiração de snapshots são claras            | C100-U02              | Snapshot expirado gera indisponibilidade explícita   |
| CC100-13-07 | Limites para shell e filhos são visíveis ao operador    | C100-U02              | Sistema não promete desfazer mudança não capturada   |

### CC18-14 — Configuração efetiva, modo diagnóstico e prompt congelado

| Requisito   | Resultado observável                                         | Dono da implementação | Caso negativo obrigatório                                      |
| ----------- | ------------------------------------------------------------ | --------------------- | -------------------------------------------------------------- |
| CC100-14-01 | Settings têm schema e fontes user/project/local/managed      | C100-H02              | Fonte inválida não entra silenciosamente na execução           |
| CC100-14-02 | Precedência e origem efetiva podem ser inspecionadas         | C100-H02              | Override local não baixa controle gerenciado                   |
| CC100-14-03 | Safe-mode remove customizações preservando controles         | C100-H02              | Modo diagnóstico não vira bypass                               |
| CC100-14-04 | Bare-mode depende apenas de contexto/configuração explícitos | C100-H02              | Hook/MCP descoberto implicitamente não é carregado             |
| CC100-14-05 | System prompt admite substituição e acréscimo autorizados    | C100-C02              | Prompt do consumidor não remove política do host               |
| CC100-14-06 | Snapshot do prompt rege reuse/resume até fronteira definida  | C100-C02              | Resume com texto novo não altera snapshot sem decisão prevista |
| CC100-14-07 | Configuração e modelo efetivos ficam vinculados a digest     | PAR-M02               | Configuração divergente invalida receipt da execução           |
| CC100-14-08 | Dump, debug e diagnóstico redigem segredos                   | C100-H02              | Credencial não aparece em log ou mensagem de erro              |

### CC18-15 — Avaliação com e sem extensão

| Requisito   | Resultado observável                                             | Dono da implementação | Caso negativo obrigatório                              |
| ----------- | ---------------------------------------------------------------- | --------------------- | ------------------------------------------------------ |
| CC100-15-01 | Runner aceita suites/casos e emite relatório verificável         | C100-E01              | Caso não executado não recebe score de sucesso         |
| CC100-15-02 | Ablação com/sem plugin usa a mesma entrada e versão              | C100-E01              | Braços com fixtures diferentes não são comparados      |
| CC100-15-03 | Repetições e concorrência preservam ordem e orçamento            | C100-E01              | Corrida não excede o grant agregado                    |
| CC100-15-04 | Mocks são padrão e acesso real exige opt-in e gate               | C100-E01              | Servidor/script real não inicia implicitamente         |
| CC100-15-05 | Threshold e limite de custo retornam falha ou parcial explícitos | C100-E01              | Custo excedido não gera relatório verde                |
| CC100-15-06 | Relatório local contém qualidade, custo, latência e footprint    | C100-E02              | Publicação externa não acontece implicitamente         |
| CC100-15-07 | Plugin, grader, modelo e fixture são ligados por hash            | C100-E02              | Alteração de qualquer insumo invalida receipt antigo   |
| CC100-15-08 | Promoção preserva veto por regressão de controle                 | C100-E02              | Nota alta de qualidade não compensa falha de segurança |

### CC18-16 — Cloud, IDE, controle remoto e gateway corporativo

| Requisito   | Resultado observável                                                 | Dono da implementação | Caso negativo obrigatório                               |
| ----------- | -------------------------------------------------------------------- | --------------------- | ------------------------------------------------------- |
| CC100-16-01 | Criar sessão cloud devolve identidade e estado rastreável            | C100-R01              | Ambiente indisponível não cria sucesso falso            |
| CC100-16-02 | Attach e continuação cloud preservam sessão e efeitos                | C100-R01              | Reconexão não duplica execução                          |
| CC100-16-03 | Ambiente self-hosted é selecionável por identidade aprovada          | C100-R01              | Ambiente de outro tenant não é endereçável              |
| CC100-16-04 | Controle remoto exige pareamento e consentimento                     | C100-R02              | Cliente sem consentimento não observa nem controla      |
| CC100-16-05 | Revogação e expiração encerram autoridade do cliente remoto          | C100-R02              | Token antigo ou replay não retoma o controle            |
| CC100-16-06 | IDE detecta/seleciona conexão e workspace corretos                   | C100-R03              | Vários clientes não provocam conexão silenciosa errada  |
| CC100-16-07 | IDE acompanha stream/diffs e responde approval autenticado           | C100-R03              | Mensagem do editor sem identidade não autoriza efeito   |
| CC100-16-08 | Handoff desktop preserva sessão e identidade                         | C100-R03              | Abrir cliente não duplica execução nem transfere grant  |
| CC100-16-09 | Gateway corporativo carrega configuração validada                    | C100-R04              | YAML inválido ou segredo inline proibido é recusado     |
| CC100-16-10 | Gateway aplica autenticação e telemetria conforme oráculo confirmado | C100-R04              | Sem identidade ou sem trilha exigida o pedido não segue |

## Evidência necessária para fechar um requisito

Para FUNCTIONAL_PARITY, receipt aponta requisito, cenário/fixture, app de referência e seu digest/ambiente, captura funcional ou resultado bruto, SHA e imagem CVG, configuração/grants/schema/modelo, teste positivo, negativo, revisão, equivalência decidida e gate aplicável. Para CVG_CONTROL, a fonte normativa é a regra/SPEC CVG aprovada e a prova executa os seus positivos/negativos no CVG; não se exige acesso a mecanismos internos do Claude. Logs de ajuda só satisfazem identidade/superfície anunciada. Mock de cloud ou transcript inventado não satisfaz o lado comparativo da referência.

Mudança de input invalida os receipts afetados. O medidor é derivado dos registros válidos, nunca de um campo PASS digitado no JSON. Toda família exige negativos de tenant, cancelamento, recuperação e limite de autoridade aplicáveis; o gate CVG é adicional ao percentual.

## Ordem executável imediata

1. C100-G01: conferir fontes e pin, resolver semânticas propostas e revisar o catálogo, preservando todos os IDs e famílias.
2. C100-G02 e G03: preparar contratos de oráculo/acesso e reconciliar o saldo PAR em paralelo documental.
3. C100-G04: consolidar Discovery/PRD e encaminhar SPECs concretas para os gates correspondentes. Q01 e implementação só depois.

Pendências de produção continuam na 0374. O backlog não autoriza push, deploy, dados reais, execução clínica/financeira ou alteração automática de agenda.

### C100-Q01-REF-LEDGER-001 — recuperação explícita de integridade

PreparaçãoT1;originalBUILD235SCOPED_FAILED_QUALITY_BAR/R3-01,orçamento2/2esgotado,nãoresetado. [Plano limitado](../04_audit/evidence/CLAUDE100-EXEC-20261017/spec0235-ledger-recovery/plan.md) propõe somente report.mjs/controller.test.js,guardacompleta/ordenadadecausas e negativosexatos, sobmesmaSPEC235/autoridadehumana. Críticofrescodesenhoantesdequalquerfonte;uma implementação/umreviewfinalsemcorreçãopreautorizada. ParentQ01/M1eprograma134seguemabertos. NenhumNative/gatesnovosoucréditofuncional.

### C100-Q01-REF-ORIGIN-001 — recuperação de origem física

LedgerRECOVERY58f8fb6dSCOPED_FAILED_QUALITY_BAR/LRPOST-01,umaimplementaçãoesgotada,semreset. [Desenho explícito](../04_audit/evidence/CLAUDE100-EXEC-20261017/spec0235-origin-recovery/plan.md): vincularrefaoarquivodetracefísicocorretoantesdeuniroseventos,doispaths,mesmaSPEC235/autoridadeexistente. DesenhoACCEPTantesdefonte;28811967codificado/250focaisPASS/33pinsimutáveis,umpostreviewemcurso/zerocorreçõespreautorizadas;parentQ01/M1ativo,Native/gatesfinais/134NOT_RUN.

- Preparação independente0221 concluídaT1: [delta dos cinco ajustes](../04_audit/evidence/CLAUDE100-EXEC-20261017/foundation0221-recomposition/REPORT.md) aprovado porHegel/0obrigatórios,27inputs+14outputs exatos. Não repetir decisãohumana; BUILD continua impedido por0029/0030/qualificaçãocomposta. Nenhum estadoPAR ou117+17 foi fechado.
