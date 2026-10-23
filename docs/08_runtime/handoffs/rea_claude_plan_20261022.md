# Handoff — roadmap e backlog das melhorias REA — 22/10/2026

Task `REA-CLAUDE-PLAN-20261022`, pedido do usuário “faz um roadmap e um backlog”. Entrega T1 documental: [roadmap 0394](../../03_build/0394_roadmap_melhorias_claude_rea.md) e [backlog 0395](../../03_build/0395_backlog_melhorias_claude_rea.md). Origem: relatório 0623, nove oportunidades CC22 e contrato SI01–SI12. Sem BUILD, código ou release.

## Estado, fonte e autoridade

- Fonte de planejamento: main 420b97b3373389f30ac82c4d4078a21b2363fdf9, Claude observado 308 e baseline canônica 302 preservada.
- M0–M6 ordenam demonstrações; 16 fichas usam IDs C100 existentes. Estados/donos/pré-requisitos continuam em 0383/0380; os novos documentos não criam fila concorrente nem fecham pais.
- Primeira ação documental recomendada: consolidar a SPEC da inspeção offline C100-T01/T02 a partir de SI01–SI12, com recon de dependências/reusos. BUILD só depois de Q01/M1, reusos e gate aplicáveis.
- `.agent/state.json` ainda aponta para o programa AUD0592; o plano Claude100 pertence a outro writer e foi lido apenas como contexto. Não sobrescrever nem “recuperar” esses controles usando o novo recorte. Os snapshots de estado consultado são observações datadas, não fontes alternativas de status.

## Entradas prontas para os ledgers

99/20/30 já estavam modificados por outra frente. Regra 5 de coordenação aplicada: preservação dos arquivos e entradas próprias abaixo para o integrador, sem reformatar ou sobrescrever o conteúdo existente.

### Runtime 99

- status: COMPLETED do planejamento REA-CLAUDE-PLAN-20261022; implementação dos cartões mantém seus estados canônicos.
- last_completed_action: roadmap 0394 com 7 marcos M0–M6, backlog 0395 com 16 fichas acionáveis sobre IDs C100 existentes, cobertura das 9 oportunidades CC22, dependências/reusos/gates/donos/aceites e próxima ação. Preservados pin 302/134 aceites e programas C100/PAR; nenhum crédito por planejamento. Validação em evidence/REA-CLAUDE-PLAN-20261022/verification.json.
- next_action: preparar SPEC da inspeção offline C100-T01/T02 com SI01–SI12 e gate próprio, conferindo os receipts de Q01/M1 e os reusos. Outras frentes seguem o DAG e seus owners; nenhuma implementação começa por tempo decorrido ou marco documental.

### Execution log 20

22/10/2026 — REA-CLAUDE-PLAN-20261022: planejamento solicitado após investigação REA do Claude 308. Criados 0394/0395 com nove oportunidades, 16 IDs canônicos e 7 marcos; fotografia de dependências C100/PAR e inputs hash-bound. Fichas incluem o quê/onde/como, dependências, positivos/negativos, provas, gate e ação seguinte. Preparação T1 separada de BUILD T3/T4; prazo de produção 0622 não reutilizado para este escopo. Sem fonte/lock/controller/estado canônico alterados.

### Backlog 30 / encaminhamento ao owner Claude100

- Anexar 0394/0395 como roteiro do recorte CC22, mantendo 0382 integral e 0383/0380 como fontes de status.
- Cards selecionados: Q01, T01, T02, E01, E02, S01, C02, H01, H02, B01, S02, P01, P02, K01, O01, K02. O01/H01/H02 aparecem por dependência/suporte canônico, não como nova carteira de capacidades.
- Recon de M0 deve descontar reuso já integrado com prova, sem reaplicar todos os 625 dias históricos nem prometer calendário baseado em ajuda CLI.
- Nenhum pai é marcado DONE por esta entrega. Nota do recorte, certificado, aceite B6, piloto e release do produto continuam decisões distintas.

## Recursos e validação

Somente novos documentos/evidências e seção própria de coordenação foram escritos. Sem app, teste de implementação, DB, container, porta, subagente, install, certify/E2E/SBOM/licenses, commit, push ou deploy. Os insumos preservados têm hashes em [inputs.json](../../04_audit/evidence/REA-CLAUDE-PLAN-20261022/inputs.json); resultados documentais em [verification.json](../../04_audit/evidence/REA-CLAUDE-PLAN-20261022/verification.json).
