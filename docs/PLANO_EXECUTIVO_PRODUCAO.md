> Atualização13/09/2026: [reauditoria M1](04_audit/0562_prod_m1_reaudit_2026-09-13.md) encontrou e corrigiu oito lacunas adicionais. Revisão CONDITIONAL PASS; tarefas afetadas REVIEW e produção NO-GO. [Pacote de decisões e sequência](02_spec/prod20260913_decision_packet.md). O conteúdo abaixo preserva o planejamento/diagnóstico histórico; estados atuais nos backlogs canônicos.

# Plano executivo — programa pronto para produção

Programa `PROD-20260913`; task documental `PLAN-PROD-20260913`; data 13/09/2026. Entrega deste turno: **planejamento**. Nenhum BUILD, correção, deploy ou aceite operacional foi executado ou concedido pelo plano.

## Resultado esperado e definição de pronto

Entregar a plataforma documentada como um programa instalável, governado, observável e operável no ambiente aprovado: API, worker contínuo, web, runtime canônico, workflows, PostgreSQL, aprovações duráveis, canais/providers e fontes autorizados, com migrações, testes, instalação, recuperação, suporte e dossiê vinculados ao mesmo candidato.

“Pronto para produção” exige simultaneamente: todos requisitos do escopo aprovado rastreados a evidências atuais; zero P0/P1 abertos; todos gates obrigatórios executados sem skips; requisitos de segurança/integridade satisfeitos; barra existente ≥97/100 em cada A01–A20 sem compensação; exercício operacional no ambiente relevante; imagem/digest e configuração identificados; autorização humana para aquele candidato/escopo. Nota alta ou suíte verde isolada não satisfaz a definição. “Implantado em produção” é estado posterior, dependente de autorização específica de deploy; não decorre da aprovação deste plano.

O escopo funcional permanece o PRD e seus adendos. Não confirmar/cancelar/reagendar consulta real automaticamente; ações clínicas, financeiras e prontuário definitivo permanecem bloqueadas. A aprovação de release não cria essas capacidades. Dados reais, fontes institucionais e integrações dependem decisões próprias. Funcionalidade adiada só pode sair do escopo por decisão explícita de produto, com impacto registrado; não remover requisito para elevar nota.

## Baseline e fontes canônicas

- [Relatório salvo na raiz de docs](RELATORIO_AUDITORIA_2026-09-13.md); [original e evidências](04_audit/0560_docs_implementation_audit_2026-09-13.md): 61/100, operação 20/100, NO-GO. Esta é a observação datada, não certificação do próximo commit.
- PostgreSQL de jornadas e worker contínuo já existem; corrigir e qualificar, não recriar. Há falhas SQL/audit, estado UI entre tenants e readiness. API/worker ainda usam modelo determinístico; gateways/kernel isolados não demonstram composição.
- [Roadmap](ROADMAP_PRODUCAO.md), [backlog de execução consolidado](BACKLOG_PRODUCAO.md), [42 tarefas AAA existentes](03_build/tracking/aaa_program_backlog.json) e [14 tarefas complementares](03_build/tracking/production_delta_backlog.json).
- [Matriz de requisitos auditados](04_audit/evidence/AUD-20260913-DOCS/requirements.md), [80 critérios de qualidade](03_build/tracking/production_quality_traceability.json), [barra AAA](02_spec/aaa_quality_contract.md), [decisões D01–D05](01_prd/aaa_decision_brief.md).

Este plano atualiza a ordem e os critérios de fechamento pós-auditoria. Não sobrescreve os estados históricos AAA. Cada ID tem uma única fonte de status: AAA no JSON existente; PROD no JSON complementar. O backlog Markdown é uma visão derivada. Os pré-requisitos adicionais de saída são cumulativos ao DAG antigo e devem ser observados mesmo que uma tarefa antiga esteja VERIFIED em snapshot anterior. Não declarar concluída novamente uma implementação existente; revalidar o que mudou e executar o delta necessário.

## Estratégia e arquitetura alvo

Preservar monólito modular salvo força demonstrada para mudar. Caminho a provar: identidade confiável→HTTP/webhook→persistência/outbox→worker→runtime canônico→policy→proposta/aprovação duráveis→journal→adapter autorizado→confirmação/UNCERTAIN→audit/timeline. Toda etapa carrega tenant, identidade da operação e correlação. Aprovação e journal precisam sobreviver ao mesmo tipo de falha/restart; não confundir contratos de duas autoridades distintas.

Transações locais curtas mantêm mutação e audit juntos; I/O externo fica fora da transação, protegido por outbox/journal e reconciliação. At-least-once exige efeito idempotente ou mecanismo explícito de incerteza. Não prometer exactly-once externo sem contrato/prova. UI não cria autoridade e invalida todas continuações por identidade/sessão. Runtime legado só permanece se D01 definir fronteira, sem bypass nem autoridades concorrentes.

LangGraph é requisito literal ainda pendente. O agente prepara ADR com alternativas existentes e impactos; Produto/responsável técnico resolvem D01 antes da mudança arquitetural. O texto antigo do brief que afirma cadeia já integrada deve ser corrigido em PROD-01 antes de apoiar a decisão.

## Decisões e dependências humanas

| Decisão           | Quem deve decidir                                | O que entregar para decidir                                                              | Trabalho seguro anterior                           |
| ----------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------- |
| D01 runtime/RF011 | Produto + responsável técnico                    | ADR, alternativas, compatibilidade, migração/recovery e prova de não-bypass planejada    | Atomicidade, corrida UI, contratos e probes locais |
| D02 draft/ações   | Produto + segurança/operação                     | Matriz recurso/capability/role, dados permitidos e limites                               | Fixtures e negações atuais                         |
| D03 operação      | Dono do serviço/operação                         | Perfil de carga, hardware, disponibilidade, p95, custo, RPO/RTO e janela de observação   | Medir laboratório com alvos marcados propostos     |
| D04 integrações   | Donos de IdP/canais/providers/fontes + segurança | Endpoints/egress, corpus/versões, roles, orçamento, ambiente e participantes autorizados | Contratos e simuladores locais                     |
| D05 dados/release | Donos de dados/operação/segurança                | Retenção, descarte, risco residual, exceções com validade e candidato específico         | Dossiê concreto e mecanismos técnicos              |

Não inventar nomes, datas de entrega, credenciais ou aceites. As decisões são independentes: D01 pode desbloquear composição antes de outras decisões; não aguardar fechar o pacote inteiro para avançar trabalho autorizado. Ausência de decisão bloqueia somente gates afetados. Reaproveitar aprovação existente apenas se seu escopo/hash/validade cobrir o passo atual.

## Governança de execução

Seguir DISCOVERY→PRD→SPEC→BUILD→AUDIT. Projeto já possui base; fazer Discovery/PRD adicionais somente para lacuna real. Antes de código: task registrada, contrato WHAT/HOW e testes negativos, paths/recursos reservados, SPEC/revisão/autorização aplicáveis. Esta solicitação prepara o plano; a autoridade de BUILD deve ser conferida no início da execução, sem pedir novamente se já houver autorização válida para o passo.

Um executor pode seguir o DAG sequencialmente. Delegação futura é opcional e depende autorização/instruções aplicáveis e capacidade do host. Se usada, separar persistência, UI e contratos; serializar server.ts, exports, migrations, lockfile e certificados. Revisor não aprova o próprio trabalho. Não iniciar instâncias por estado documental: verificar handles e processos reais.

Cada task entrega diff, hipótese, negativo antes/positivo depois, regressão da fronteira, hashes de fontes/config/lockfile/ferramentas, comandos/exit codes, inventário PASS/FAIL/SKIP, logs sanitizados, limitações e revisão. Builder termina IMPLEMENTED; revisão independente e integração autorizam VERIFIED/DONE. Duas tentativas da mesma hipótese sem progresso exigem diagnóstico/replanejamento, preservando falhas; nunca relaxar barra.

## Gates e aceite final

1. G_PLAN: fontes e contratos/ordem validados; autoriza preparação.
2. G_SPEC: contrato da task, revisão e autorização de BUILD registradas.
3. G_INTEGRITY: SQL/audit, UI identity, approval/journal, RLS, replay e limites negativos corrigidos no candidato.
4. G_COMPOSITION: percurso público HTTP→SQL→worker→efeito falso→audit provado com restart/falhas e runtime D01.
5. G_PRODUCT: RF/RNF/UC/REM/plataforma completos, UI acessível, RAG e evals do entrypoint.
6. G_QUALITY: Node 22 instalação limpa/build/imagem, testes/SQL/E2E, security/licenças, coverage/mutação, carga/restore e documentação atuais. Critério obrigatório não executado impede passagem.
7. G_EXTERNAL: autorização por integração e ambiente; homologação com limites/custos/dados definidos. Local fake não substitui externo.
8. G_RELEASE: candidato/digest/config imutáveis, operação supervisionada, runbooks/plantão/rollback, SLO aprovados medidos e signoff humano. Mudança posterior invalida o vínculo e exige requalificação proporcional.

Manter pisos da barra: statements/lines/functions≥90%, branches≥85%, branches críticos≥95%, 100% mutações selecionadas detectadas; reportar web/bootstrap/SQL separadamente. Meta por área≥97 não pode compensar falha mandatória. p95 2s/ack 10s, disponibilidade 99,9%, RPO 5min/RTO 30min e soak 24h são propostas históricas até D03, não promessas nem medições atuais. Metas finais e tamanho/amostragem do holdout devem ser congelados antes dos resultados.

## Riscos, recuperação e operação

D01, infraestrutura Docker e homologações podem dominar o prazo; planejar por gate, sem data prometida. Replanejar estimativas após cada demonstração. Preservar alterações do usuário; usar candidato isolado para certificar, banco sintético exclusivo e portas próprias. Queda/timeout do observador não prova parada; verificar processo antes de reiniciar. Em falha: preservar contexto, não repetir efeito incerto, manter bloqueio e conduzir reconciliação auditada.

Toda migração precisa compatibilidade com versão anterior, dados sintéticos prévios, checksum, ensaio de interrupção e roll-forward/restore validado. Rollback de release não significa apagar migrations/dados; retornar ao último artefato compatível e restaurar apenas pelo procedimento aprovado. Delimitar retenção dos journals maior que janelas de replay aprovadas; purga nunca permite efeito duplicado.

Após produção autorizada: dono/on-call definidos; observar SLO/erros/filas/custo/safety; revisão de vulnerabilidades e acessos; backup/restore exercitado na frequência D03; holdout e regressões por mudança; rollback por critérios aprovados. Nenhuma cadência provisória vira compromisso sem dono.

## Progresso e próxima ação

13/09/2026: relatório preservado e três artefatos executivos produzidos; planejamento validado mecanicamente. Revisão desta entrega é do próprio autor (I0), não gate independente de produto. Implementação e aceites operacionais não executados nesta rodada.

Próxima ação única: **PROD-01 — revalidar o candidato atual e preparar/congelar os contratos das correções locais**, usando o relatório e os probes preservados; encaminhar revisão/gate antes de código. Em paralelo lógico, preparar decisões D01–D05 sem bloquear as correções que independem delas.

## Passos concretos de retomada

1. Ler AGENTS, runtime/log/backlog e executar PROD-01 com comparação de hashes, estado das tasks e recursos reais.
2. Seguir o roadmap e o DAG cumulativo do backlog; reservar a primeira fronteira pronta e obter somente a autoridade que ainda faltar.
3. Implementar, testar, obter crítica, integrar e atualizar evidências/task, backlog, log e estado nessa ordem.
4. Fechar AAA-42 somente com PROD-13 e todos gates do candidato; emitir resultado limitado quando houver dependência pendente, mantendo produção NO-GO.

A revalidação inicial é proporcional: conferir bytes, contratos e os negativos afetados. Não repetir a auditoria completa nem todas as suítes sem mudança de candidato, falha nova ou dúvida concreta de cobertura. A leitura dos índices e a comparação de hashes devem preservar a evidência utilizável.
