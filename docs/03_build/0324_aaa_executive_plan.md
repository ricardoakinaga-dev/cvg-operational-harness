# 0324 — Plano executivo de qualidade State of Art / Triplo AAA

> Atualização operacional: [rodada 2 e prompts das três frentes](0327_aaa_round2_coordination.md). A configuração vigente, por instrução posterior do usuário, tem três agentes com revisão alternada. A topologia original de quatro slots e os estados iniciais abaixo são baseline histórico, não o estado corrente. Consultar backlog/ledger para prontidão e pareceres por task.

Programa: `AAA-20260912`. Data: 2026-09-12. Origem: solicitação de plano executivo, roadmap e backlog multiagente a partir da auditoria `AUD-20260912-001`.

**Entrega desta rodada: planejamento completo. Meta do programa: qualidade demonstrada por evidências atuais. Estado do produto: 60/100 consolidado, 20/100 em prontidão de produção, 15 achados abertos. Nenhuma implementação ou aprovação de produção decorre deste plano.**

## 1. Resultado executivo esperado

Transformar o programa controlado em um sistema integrado, verificável e operável, com isolamento por tenant, aprovação vinculada ao efeito correto, recuperação após falhas e experiência operacional consistente. Preservar o monólito modular enquanto for suficiente; não introduzir infraestrutura ou frameworks apenas para obter um rótulo de qualidade.

O relatório solicitado já está salvo: [auditoria completa 0558](../04_audit/0558_code_audit_2026-09-12.md), com [evidência 0559](../04_audit/0559_code_audit_evidence_2026-09-12.json). Esses artefatos históricos serão preservados. O plano cobre **20/20 dimensões e 15/15 achados**, inclusive melhorias que não possuem um finding próprio.

Três resultados diferentes devem permanecer explícitos:

| Resultado                                    | Condição                                                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qualidade controlada demonstrada             | Invariantes e fluxos integrados passam com PostgreSQL descartável, providers/canais falsos e evidência atual; sem autorização real.                                                               |
| Candidato AAA                                | Barra técnica atendida e revisão independente concluída, com pendências externas claramente declaradas; não equivale a produção.                                                                  |
| Triplo AAA demonstrado no escopo qualificado | Todas as 20 áreas atingem a barra congelada, comparações pertinentes são reproduzíveis, gates operacionais/externos/humanos aplicáveis são satisfeitos e nenhum bloqueador obrigatório permanece. |

“State of Art” e “Triplo AAA” são objetivos internos deste programa, não certificações oficiais. Um benchmark isolado ou nota atribuída pelo builder não autoriza a reivindicação. A disponibilidade ou segurança de produção real não pode ser afirmada com testes locais.

## 2. Autoridade e percurso CVG

Seguir `DISCOVERY → PRD → SPEC → BUILD → AUDIT`. O projeto já possui Discovery/PRD/SPEC históricos; não reiniciar todo o produto. Alterações de escopo, RF-011 e contratos novos devem receber adendos e gates próprios. Aprovações históricas não serão transplantadas para esta remediação.

- A solicitação atual autoriza salvar e preparar os documentos, revisar dependências e coordenar agentes para planejamento.
- Antes de código, registrar task, contrato aprovado e revisão humana conforme [AGENTS operacional](../07_agents/AGENTS.md). A preparação documental não está bloqueada por esses gates futuros.
- Nunca usar dados reais, confirmar/cancelar/reagendar consulta real automaticamente, executar ação clínica/financeira/prontuário definitivo ou responder RAG sem fonte institucional aprovada.
- Testes usam fixtures sintéticas e recursos descartáveis. Homologação externa exige autorização específica, credenciais apropriadas e dados sintéticos; nunca usar ambiente compartilhado por conveniência.
- Deploy/piloto real não está sendo solicitado ou executado nesta rodada. Decisão humana futura deve se referir ao candidato e ao escopo concreto, não ao objetivo genérico “AAA”.

## 3. Decisões pendentes e alternativas

| ID  | Decisão                                                                                                             | Autoridade necessária                         | Preparação possível sem decisão                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| D01 | RF-011 pede LangGraph: cumprir requisito, alterá-lo formalmente ou definir convivência; selecionar runtime canônico | Produto + responsável técnico humano          | Corrigir invariantes isoladas de approval/idempotência, preservar runtime atual e preparar ADR comparativo. |
| D02 | Semântica de draft versus ação sensível/real, campos permitidos e retenção                                          | Produto + segurança/operação                  | Propor capabilities separadas mantendo ações reais negadas; nenhuma nova autoridade concedida.              |
| D03 | Perfil de carga, SLO, disponibilidade, retenção, RPO/RTO e janela de observação                                     | Operação + dono do serviço                    | Medir baseline sintético; usar alvos propostos como diagnóstico, sem alegar aceite operacional.             |
| D04 | IdP, provider, canal, fonte institucional, egress, orçamento e participantes de homologação                         | Donos das integrações/dados + segurança       | Adapters e simuladores locais, contratos, threat model e briefing de homologação.                           |
| D05 | Exceções de vulnerabilidade/licença, risco residual e signoff do candidato                                          | Autoridades técnicas/operacionais pertinentes | Relatório de exceções com owner, prazo, impacto e mitigação; nenhuma exceção aceita automaticamente.        |

Nenhum nome de responsável, aprovação, prazo contratual ou credencial foi inventado. `AAA-02` prepara o material de decisão; o lead registra as respostas e desbloqueia somente tasks afetadas. D01 não precisa paralisar F01–F05. D02 não pode ser interpretada como permissão implícita de ação real.

## 4. Gates de execução

Os gates são condições verificadas, não datas. Cada task pode exigir condições adicionais, além das dependências do DAG.

| Gate                  | Condição de entrada/saída                                                                                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G_PLAN                | Auditoria preservada, plano/backlog coerentes e task de planejamento/revalidação registrada. Autoriza somente a preparação explicitamente solicitada.                                                       |
| G_SPEC                | SPEC específica da task aprovada, contrato/hash congelado, revisão humana registrada e autorização de BUILD no escopo. Não está concedido por este documento.                                               |
| G_D01 / G_D01_SPEC    | D01 resolvida para a seleção/migração arquitetural; BUILD também exige G_SPEC.                                                                                                                              |
| G_SPEC_SOURCE_FIXTURE | G_SPEC com corpus sintético explicitamente marcado; não substitui D04 nem aprovação de fonte institucional.                                                                                                 |
| G_D03_SPEC            | G_SPEC e metas D03 aprovadas para aceitar medição operacional. Pode-se preparar/medir laboratório antes, registrando alvo como proposto.                                                                    |
| G_INTEGRITY           | F01–F05/F15 corrigidos, reproduções negativas e revisão independente passam; efeito, approval, replay e limites comprovados. Gate obrigatório antes de fechar composição AAA-21.                            |
| G_QUALITY             | Critérios de AAA-04/Quality Bar congelados, fontes atuais, gates locais/SQL/E2E/segurança sem skips obrigatórios e análise independente. Usado para qualificação, não como autorização retroativa de BUILD. |
| G_EXTERNAL            | G_QUALITY, D04 e autorização específica de testes externos; endpoints/custos/segredos/ambiente e dados sintéticos definidos.                                                                                |
| G_HUMAN               | D05 e autoridade humana identificada recebem dossiê concreto; ausência de decisão não equivale a aceite.                                                                                                    |
| G_EXTERNAL_HUMAN      | G_EXTERNAL + signoff do cenário supervisionado, janela, responsáveis e condições de abort.                                                                                                                  |
| G_FINAL               | Gates aplicáveis e observação operacional concluídos; comparações/nota reavaliadas sobre mesmo candidato; registrar veredicto limitado quando faltar evidência.                                             |

`NOT_RUN`, `SKIPPED`, `UNKNOWN` e `BLOCKED` nunca satisfazem um requisito obrigatório. A ausência de PostgreSQL não bloqueia planejamento, mas impede seu gate de execução. Zero falhas observadas em fixtures não prova risco zero.

## 5. Barra de qualidade proposta e método de notas

**Alvo: pelo menos 97/100 em cada uma das 20 dimensões**, sem compensação entre áreas. A meta deverá ser congelada e detalhada por `AAA-04` antes de BUILD; não reduzir a barra para acomodar um resultado ruim.

Para tornar as notas auditáveis, cada dimensão recebe cinco subnotas 0–20: comportamento correto, falhas/ataques, integração pública/persistente, observabilidade/recuperação apropriada ao item e rastreabilidade/manutenção. Âncoras: 0 ausente; 5 declaração/plano; 10 implementação parcial com teste isolado; 15 comportamento integrado testado com lacunas; 18 evidência atual positiva/negativa e revisão; 20 critérios completos, reprodução independente e adequação operacional ao escopo. Notas intermediárias exigem justificativa do crítico. Total é a soma das cinco subnotas. A01–A20 não são CVSS nem estimativa de probabilidade.

Baseline 0558 usa julgamento por área; conservar suas notas históricas e repetir a avaliação inicial nesta nova rubrica, sem transformar mudança de método em “melhoria”. Critérios não aplicáveis precisam de justificativa congelada; jamais converter ausência de integração, operador ou banco em não aplicável para aumentar a nota.

| Área                 | Aceite obrigatório para a área; além do piso de nota                                                                                                                                                 |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A01 Arquitetura      | Entry point percorre identidade→policy→approval quando exigido→runtime→persistência→canal falso; runtime canônico decidido e nenhum bypass.                                                          |
| A02 Manutenibilidade | Hotspots divididos por responsabilidade com contratos explícitos; complexidade/acoplamento registrados antes/depois; extração preserva HTTP/UX. Linhas de código não são meta isolada.               |
| A03 Tipagem          | Strict preservado, zero erro typecheck/lint; todo input de rede/modelo/outbox validado em execução; casts não substituem verificação.                                                                |
| A04 HTTP             | Rotas críticas com casos válido/inválido, auth, tenant, conflito, limite, replay e abuso; erros redigidos e orçamento bounded.                                                                       |
| A05 Identidade       | Resolver confiável no entrypoint; token inválido/revogado/expirado, role/tenant adulterados e replay negados; rotação testada e console não simula autoridade no perfil qualificado.                 |
| A06 Tenant           | PostgreSQL sem skips, FORCE RLS e roles distintos; duas conexões/processos, contexto limpo após erro e pool reusado sem vazamento.                                                                   |
| A07 Approval         | Payload final aprovado é o executado; estados reservado/executando/confirmado/incerto não inventam sucesso; todas as fronteiras de crash e reuso testadas.                                           |
| A08 Policy           | Matriz perfil×role×capability×estado de approval; draft separado de real; ação clínica/financeira/consulta real continua proibida no escopo atual.                                                   |
| A09 Runtime          | Limites impedem começo de etapa excedente; deadline/cancelamento/custo aplicados; saída tardia ou dependência lenta não autoriza efeito subsequente.                                                 |
| A10 Assíncrono       | Reserva durável precede efeito; replay em duas instâncias/restart não duplica; resultado incerto segue reconciliação; consumidor contínuo e DLQ exercitados.                                         |
| A11 Persistência     | Jornadas via HTTP com paridade SQL, migration com dados anteriores, TTL/tenant/audit; restore íntegro com papéis e outbox.                                                                           |
| A12 RAG              | Resposta factual institucional sempre vinculada à fonte/versão aprovada; fonte ausente/revogada/conflitante exige handoff; conteúdo recuperado não amplia autoridade.                                |
| A13 Integrações      | Sucesso/429/5xx/timeout/payload inválido/replay exercitados no percurso integrado; SSRF/egress/budgets testados; homologação externa separada.                                                       |
| A14 Observabilidade  | Correlação completa em todos os cenários obrigatórios; logs redigidos e métricas protegidas; probe de dependência indisponível dá 503; alerta/runbook e ledger durável comprovados.                  |
| A15 Testes           | 100% dos gates obrigatórios executados; zero skips nesse escopo; cobertura por domínio com exclusões auditadas; mutação dos guards críticos detectada.                                               |
| A16 Evals            | Harness chama runtime integrado; holdout independente por categoria; zero ação proibida observada e sucesso de tarefa ≥97% no conjunto proposto; medir tempo/custo reais, amostra e incerteza.       |
| A17 Frontend         | Fluxos completos em teclado e 375/768/1440; foco, contraste, semântica, erros/retry/conflito; sem bloqueadores de acessibilidade; avaliação com operador autorizado usando cenário sintético.        |
| A18 Supply chain     | Node alvo reprodutível, lockfile/CI/build/imagem verdes; zero high/critical aberto e moderadas/licenças desconhecidas resolvidas ou exceções humanas explícitas com prazo.                           |
| A19 Evidência        | RF→SPEC→task→teste→artefato ligado ao hash do candidato; alteração de source/config/lockfile invalida qualificação; histórico não se confunde com estado atual.                                      |
| A20 Operação         | Metas aprovadas medidas no ambiente relevante, identidade/TLS/fontes/canais autorizados, alarmes/rollback/restore exercitados e signoff humano do escopo. Sem isso, sem alegação de produção pronta. |

Targets técnicos propostos para congelamento: cobertura global do denominador acordado ≥90% statements/lines/functions e ≥85% branches; branches de módulos críticos ≥95%; matriz de falhas de integridade e mutações selecionadas 100% detectadas. Reportar separadamente web, bootstrap e PostgreSQL em vez de excluí-los para inflar cobertura. Se algum alvo for tecnicamente inadequado, decidir isso antes do BUILD com razão/evidência, preservando a versão anterior.

Para performance: rampa 10k→100k eventos, carga/concorrência/hardware definidos em D03; p95 persistência ≤2s e ack ≤10s conforme SPEC 0113, zero perda de eventos aceitos e zero efeito duplicado observado. Proposta inicial de soak: 24h em laboratório antes de operação supervisionada; janela e amostra operacionais definitivas dependem de D03. RPO ≤5min, RTO ≤30min e disponibilidade 99,9% são **propostas históricas Phase 10**, não metas humanas aprovadas ou resultados medidos.

Para “State of Art”: `AAA-04` congela protocolo comparativo, alternativas e partição do dataset antes do holdout executado em `AAA-27`; `AAA-40` executa a comparação já definida. Usar mesmo ambiente, workload, custo e critérios, comparar baseline e alternativas relevantes, reportar trade-offs e intervalos quando adequados. Não escolher critérios após observar resultados. Sem comparação executável válida, declarar somente o nível técnico observado, sem título de superioridade.

## 6. Governança multiagente

Topologia padrão nos quatro slots disponíveis: **1 lead/integrador + 2 builders + 1 crítico fresco reservado**. Se não houver duas tasks prontas/disjuntas, usar um builder; ocupar slots não é meta. Somente o lead pode autorizar redelegação e ajustar a distribuição.

- Lead controla backlog canônico, gates, autorizações, contratos, alocação de arquivos/recursos, integração e registros operacionais.
- Builder recebe task completa, inputs, versão/hash da SPEC, ownership, dependências verificadas e aceite. Entrega `IMPLEMENTED`, diff, testes/exit codes e evidências; nunca autoaprova `DONE`.
- Crítico recebe critérios originais e candidato congelado; inspeciona código e executa cenários adversariais, sem editar a lane julgada. Seu parecer técnico não substitui signoff humano.
- Integrador verifica diff e evidência, incorpora mudanças sem descartar trabalho do usuário e roda regressão sobre o conjunto. Mudança relevante posterior invalida a revisão afetada.

Regras de escrita: `runtime.ts` tem um dono em AAA-09→10→11; `server.ts`/entrypoint e manifests compartilhados têm integrador único. Migrations/schema/exports recebem reserva exclusiva. Dois agentes nunca executam `npm install`, format global, coverage ou certificação no mesmo destino simultaneamente. Banco/schema, portas, fila, fixtures e diretórios de evidência pertencem à task. Worktree isolado reduz colisão, mas não resolve conflito semântico de schema/contrato.

Fonte canônica de status e DAG: [tracking/aaa_program_backlog.json](tracking/aaa_program_backlog.json). O [backlog legível](0326_aaa_backlog.md) é derivado; o master apenas aponta para ele. O JSON é **planejamento**, não um ledger vivo de processos. Ao iniciar BUILD, criar ledger vivo no schema da skill instalada, com identificação do agente/processo, contratos congelados e evidências, e validá-lo pelo validador da skill.

Todo retorno inclui `taskId`, candidato/hash, contrato/hash, paths modificados, comandos com exit code, resultado, artifact/hash, limitações e risco residual. Evidência bruta sanitizada em `docs/04_audit/evidence/AAA/AAA-XX/`; manifesto local vincula inputs, contrato e observação. Campo vazio nunca é aprovação. Não compartilhar segredos ou payload real em logs.

## 7. Controle de esforço, riscos e recuperação

O [roadmap](0325_aaa_roadmap.md) organiza fases/sprints; cada sprint é uma unidade de aceite, não promessa de prazo. Estimativas iniciais M indicam 2–4 sessões de trabalho delimitadas por task e devem ser recalibradas após AAA-01–06. Tasks que ultrapassarem uma entrega verificável devem ser subdivididas antes de começar; não usar uma estimativa genérica como compromisso financeiro.

Riscos principais: integração prematura do kernel; conflito de escritores; cobertura ilusória; evidência desatualizada; indisponibilidade de PostgreSQL; decisões humanas não emitidas; efeito externo incerto; migração sem recuperação. Contenção: gate de integridade, ownership exclusivo, casos negativos, manifesto, recursos descartáveis, dependências de autoridade explícitas e reconciliação.

Duas tentativas corretivas por hipótese como limite inicial de coordenação. Persistindo a falha, preservar logs e teste negativo, revisar causa/contrato e replanejar. Não repetir sem nova evidência, mascarar skip ou reduzir threshold. Incidente de integridade suspende apenas a superfície afetada e devolve a task a REWORK/BLOCKED com causa e próxima dependência.

Para retomar: ler AGENTS, runtime/log, este plano, JSON e evidências da última task; conferir working tree e hashes; validar dependências e autoridade reais; alocar uma task pronta e recursos exclusivos. Em rollback, desfazer apenas diff da task quando seguro; migração requer plano de roll-forward/restore e nunca sobrescreve banco compartilhado. Artefatos históricos e falhas permanecem.

## 8. Próxima ação, progresso e entrega

Planejamento registrado em 2026-09-12 com contribuição de dois scouts e revisão documental independente concluída. O primeiro parecer apontou a dependência ausente do contrato do worker e o congelamento tardio do protocolo comparativo; ambos foram corrigidos e o segundo parecer foi APPROVE documental. Os refinamentos adicionais de prontidão e credenciais foram conferidos pelo lead. Tasks de implementação permanecem pendentes. Os adendos SPEC de AAA-03–06 ainda devem ser produzidos/revisados e aprovados, não foram fabricados nesta rodada.

Validação do planejamento: `python3 docs/03_build/tracking/validate_aaa_plan.py`. Para regenerar a visão Markdown após alterar o JSON: executar o mesmo comando com `--render`, depois `npx prettier --write docs/03_build/0326_aaa_backlog.md`. O validador confere estrutura/DAG/cobertura e não qualifica o código do produto. Evidência da revisão e dos checks: `docs/04_audit/evidence/AAA-20260912-PLAN/`.

Próxima ação executável: `AAA-01`, revalidar o candidato e reproduções em leitura/testes sintéticos; em seguida preparar AAA-02/03/04. Quando houver contratos concretos e revisão humana aplicável, liberar apenas as tasks de BUILD correspondentes. A produção continua NO-GO até gates do escopo real.
