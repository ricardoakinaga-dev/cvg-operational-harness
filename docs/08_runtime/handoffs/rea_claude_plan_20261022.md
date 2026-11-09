# Handoff — roadmap e backlog das melhoriasREA — 22/10/2026

Task `REA-CLAUDE-PLAN-20261022`, pedido do usuário “faz um roadmap e um backlog”. EntregaT1 documental: [roadmap0394](../../03_build/0394_roadmap_melhorias_claude_rea.md) e [backlog0395](../../03_build/0395_backlog_melhorias_claude_rea.md). Origem: relatório0623, nove oportunidadesCC22 e contratoSI01–SI12. Sem BUILD, código ou release.

## Estado, fonte e autoridade

- Fonte de planejamento: main420b97b3373389f30ac82c4d4078a21b2363fdf9, Claude observado308 e baseline canônica302 preservada.
- M0–M6 ordenam demonstrações;16 fichas usam IDsC100 existentes. Estados/donos/pré-requisitos continuam em0383/0380; os novos documentos não criam fila concorrente nem fecham pais.
- Primeira ação documental recomendada: consolidar a SPEC da inspeção offline C100-T01/T02 a partir deSI01–SI12, com recon de dependências/reusos. BUILD só depois deQ01/M1, reusos e gate aplicáveis.
- `.agent/state.json` ainda aponta para o programaAUD0592; o planoClaude100 pertence a outro writer e foi lido apenas como contexto. Não sobrescrever nem “recuperar” esses controles usando o novo recorte. Os snapshots de estado consultado são observações datadas, não fontes alternativas de status.

## Entradas prontas para os ledgers

99/20/30 já estavam modificados por outra frente. Regra5 de coordenação aplicada: preservação dos arquivos e entradas próprias abaixo para o integrador, sem reformatar ou sobrescrever o conteúdo existente.

### Runtime99

- status: COMPLETED do planejamentoREA-CLAUDE-PLAN-20261022; implementação dos cartões mantém seus estados canônicos.
- last_completed_action: roadmap0394 com7marcosM0–M6, backlog0395 com16 fichas acionáveis sobreIDsC100 existentes, cobertura das9oportunidadesCC22, dependências/reusos/gates/donos/aceites e próxima ação. Preservados pin302/134 aceites e programasC100/PAR; nenhum crédito por planejamento. Validação em evidence/REA-CLAUDE-PLAN-20261022/verification.json.
- next_action: preparar SPEC da inspeção offline C100-T01/T02 comSI01–SI12 e gate próprio, conferindo os receipts deQ01/M1 e os reusos. Outras frentes seguem o DAG e seus owners; nenhuma implementação começa por tempo decorrido ou marco documental.

### Execution log20

22/10/2026 — REA-CLAUDE-PLAN-20261022: planejamento solicitado após investigaçãoREA doClaude308. Criados0394/0395 com nove oportunidades,16IDs canônicos e7 marcos; fotografia de dependênciasC100/PAR e inputs hash-bound. Fichas incluem o quê/onde/como, dependências, positivos/negativos, provas, gate e ação seguinte. PreparaçãoT1 separada deBUILD T3/T4; prazo de produção0622 não reutilizado para este escopo. Sem fonte/lock/controller/estado canônico alterados.

### Backlog30 / encaminhamento ao ownerClaude100

- Anexar0394/0395 como roteiro do recorteCC22, mantendo0382integral e0383/0380como fontes de status.
- Cards selecionados: Q01,T01,T02,E01,E02,S01,C02,H01,H02,B01,S02,P01,P02,K01,O01,K02. O01/H01/H02 aparecem por dependência/suporte canônico, não como nova carteira de capacidades.
- Recon deM0 deve descontar reuso já integrado com prova, sem reaplicar todos os625 dias históricos nem prometer calendário baseado em ajudaCLI.
- Nenhum pai é marcadoDONE por esta entrega. Nota do recorte, certificado, aceiteB6, piloto e release do produto continuam decisões distintas.

## Recursos e validação

Somente novos documentos/evidências e seção própria de coordenação foram escritos. Sem app, teste de implementação, DB, container, porta, subagente, install, certify/E2E/SBOM/licenses, commit, push ou deploy. Os insumos preservados têm hashes em [inputs.json](../../04_audit/evidence/REA-CLAUDE-PLAN-20261022/inputs.json); resultados documentais em [verification.json](../../04_audit/evidence/REA-CLAUDE-PLAN-20261022/verification.json).
