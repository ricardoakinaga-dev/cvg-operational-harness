> Atualização13/09/2026: [reauditoria M1](04_audit/0562_prod_m1_reaudit_2026-09-13.md) encontrou e corrigiu oito lacunas adicionais. Revisão CONDITIONAL PASS; tarefas afetadas REVIEW e produção NO-GO. [Pacote de decisões e sequência](02_spec/prod20260913_decision_packet.md). O conteúdo abaixo preserva o planejamento/diagnóstico histórico; estados atuais nos backlogs canônicos.

# Roadmap para produção — PROD-20260913

[Plano executivo](PLANO_EXECUTIVO_PRODUCAO.md) · [Backlog](BACKLOG_PRODUCAO.md). Ordem por dependências e evidências, sem calendário prometido. Marcos M0–M6 são coordenação deste suplemento; não renumeram fases P0–P5 históricas AAA. Tarefa existente VERIFIED não qualifica automaticamente bytes novos.

| Marco                         | Entrega demonstrável                                                                                                                  | Tasks principais                                                            | Dependência e gate de saída                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| M0 — baseline e decisões      | Mapa de todo requisito→task→teste; candidato identificado; contratos das correções prontos; decisões separadas                        | PROD-01/14; AAA-01..06 conforme escopo atual                                | G_PLAN; G_SPEC por task. D01 só bloqueia escolha/composição; D03/04/05 só seus gates                                                        |
| M1 — integridade imediata     | Falha audit faz rollback; UI descarta resposta obsoleta; worker rejeita papel privilegiado; audit registra ator/correlação reais      | PROD-02/03/05/06; revalidar AAA-07..18 e readiness AAA-22 conforme contrato | Contratos aprovados; negativos SQL/UI/auth/replay verdes. AAA-22 completo conserva pré-requisito AAA-21; pode preparar probe/contrato antes |
| M2 — cadeia durável integrada | Identidade→HTTP→SQL→worker→runtime canônico→approval/journal→efeito falso→audit; restart e UNCERTAIN seguros                          | PROD-04; AAA-06/18/19/20/21/22/23/24                                        | D01 e SPEC; G_INTEGRITY e demonstração de G_COMPOSITION. Sweeps e outbound falso agora compostos, sem liberar efeito real                   |
| M3 — produto completo         | Jornadas/triagem/handoff/tasks/slots/approvals; drafts retomáveis; filas navegáveis; RAG citado; IA avaliada no entrypoint            | PROD-07..11; AAA-25..30; preflight/evals AAA-27                             | M2 e dependências locais do DAG; G_PRODUCT com todas linhas RF/RNF/UC/REM/plataforma, UX/keyboard/375/768/1440 e negativos                  |
| M4 — engenharia de release    | Imagem/instalação Node 22; carga SQL, restore, observabilidade e segurança; certificado vinculado ao candidato; documentação coerente | PROD-12; AAA-13/14/15/31..36/40                                             | G_QUALITY; performance aceita só com D03. Mutação/holdout/scan/SQL/skips inventariados. Candidato técnico não é homologação                 |
| M5 — homologação e auditoria  | Crítico fresco reavalia 20 áreas; integrações e fontes aprovadas exercitadas, com identidade e falhas                                 | PROD-14; AAA-41→AAA-37→AAA-38                                               | Qualidade integrada + D04/D05 + autorização de homologação; relatório externo separado de fixtures                                          |
| M6 — operação e prontidão     | Ensaio supervisionado, rollback/restore/alertas/on-call, dossiê por digest e signoff; pacote pronto para deploy autorizado            | AAA-39→PROD-13→AAA-42                                                       | G_RELEASE integral; nenhum P0/P1, ausência de gate impede alegação produção. Deploy exige autorização própria                               |

## Caminho crítico e frentes prontas

Caminho crítico técnico: PROD-01→contratos/D01→AAA-06→PROD-04+AAA-18/19/20→AAA-21→AAA-23/24→produto completo→qualificação→auditoria→homologação→operação. Caminho crítico externo: decisões D03/D04/D05 e disponibilidade de infraestrutura/autoridades. Esses caminhos convergem em G_RELEASE; atraso externo não pode ser mascarado por nota local.

PROD-02 e PROD-03 podem ser executadas em fronteiras distintas após seus gates; PROD-05 pode avançar em worker/roles isolados. PROD-06 sucede atomicidade e usa server.ts em janela exclusiva. PROD-07/08/09 compartilham frontend e devem ser serializadas ou particionadas por contrato. Extração de hotspots AAA-29 só depois de paridade funcional; não misturar refatoração ampla com correção P1. Certificação/coverage globais e geradores têm janela exclusiva.

Não desabilitar sweeps/outbound falso apenas para obter PASS do candidato integrado; também não ligar canal real para cumprir demonstração sintética. O alvo é o percurso aprovado completo, com autoridade e limites explícitos.

## Orçamento de planejamento e critérios de replanejamento

Tamanho S: um contrato local; M: fronteira e regressões; L: migração/composição/fluxo completo. Estimativas das tasks são aproximações técnicas, não duração garantida. Dimensionar horas/equipe somente após PROD-01, decisão D01 e acesso ao ambiente; não estabelecer data final antes das dependências humanas.

Após cada marco: mostrar fluxo ao revisor, atualizar mapa/risco/estimativa, identificar um próximo passo. Se cenário crítico falha, retornar à task de origem; se contrato está errado, voltar à SPEC/PRD; se falta decisão, manter somente dependentes bloqueadas. Nunca reduzir amostra, limite, escopo ou barra para concluir o marco.

## Demonstrações obrigatórias

- M1: draft/audit 0 após falha, retry 1+1; resposta A invisível sob B; bootstrap privilegiado rejeitado.
- M2: mensagem aceita persiste antes de processamento; dois workers/restart não duplicam efeito; proposta aprovada igual ao payload; crash após efeito→UNCERTAIN; readiness 503 e live 200 sob indisponibilidade.
- M3: conversa multietapa com tutor/pet ambíguos, reload, slot expirado, handoff e tarefa; todas decisões rastreáveis; RAG ausente/revogado→handoff; conteúdo adversarial não amplia grants.
- M4: instalação limpa da imagem/candidato; carga representativa SQL; falha/restauração reais no ambiente de teste; certificado rejeita fonte/log/hash/skip adulterado.
- M5/M6: sistema autorizado com provider/canal/IdP/fontes aprovados; timeout/erro/queda/rollback observados; responsáveis executam runbooks e assinam exatamente o digest avaliado.
