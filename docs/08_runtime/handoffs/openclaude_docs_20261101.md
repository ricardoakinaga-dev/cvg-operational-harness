# Handoff — incorporação Open-ClaudeCode na documentação

Task `OPENCLAUDE-DOCS-20261101`,01/11/2026; trilhaT1, pedido explícito de incorporar a investigação à documentação principal e orientar construção/produção. [Contrato/pré-imagens](../../04_audit/evidence/OPENCLAUDE-DOCS-20261101/task.json), [estado](../../04_audit/evidence/OPENCLAUDE-DOCS-20261101/state.json), [verificações](../../04_audit/evidence/OPENCLAUDE-DOCS-20261101/verification.json).

## Alterações efetivamente aplicadas

| Documento                                                          | Incorporação                                                                                                                                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Roadmap0394](../../03_build/0394_roadmap_melhorias_claude_rea.md) | Origem fixa/limites do REA, considerações centrais, ordem de integração/qualificação até0373/0374 e separação entre produção e paridade; continuidade0255 atualizada |
| [Backlog0395](../../03_build/0395_backlog_melhorias_claude_rea.md) | Dez critérios OC01–OC10 ligados a cartões/donos/gates existentes, provas positivas/negativas, reusos por revisão e correção H01/permissões versus H02/configuração   |
| [Página principal da documentação](../../README.md)                | Bloco novo no topo com roadmap, backlog, prioridades, origem e limites; histórico e blocoAUD0627 preservados                                                         |
| [Índice operacional](../../99_operational_index.md)                | Mesmo acesso à incorporação e caminho de produção, com autoridade/certificação separadas                                                                             |

O ACK explícito do Lead0410, entradaGBrain1834679, cedeu somente a inserção aditiva em docs/README e índice durante esta unidade. O [recibo](../../04_audit/evidence/OPENCLAUDE-DOCS-20261101/navigation-owner-ack.json) e a [prova de reconstrução dos corpos originais](../../04_audit/evidence/OPENCLAUDE-DOCS-20261101/navigation-insertions.json) delimitam o intervalo. O ACK não transferiu README da raiz,99/20/30, plano0410 ou qualquer fonte/QA de pares.

As dez contraprovas cobrem uso/budget, cancelamento durante porta pendente, decisão humana, mailbox, falha de append, input modificado, retryMCP, filhos async, streaming e sandbox/hooks. O mapa completo de15 elementos continua acessível no [relatório de origem](../../04_audit/evidence/OPENCLAUDE-REA-20261101/REPORT.md); as fontes e evidências congeladas da investigação foram preservadas.

## Efeito sobre a execução

Produção segue a barra0373 e o plano0374 na mesma candidata/imagem, com decisão específica. As prioridades são consumir reparos existentes e concluir qualificação CI/runtime, segurança/isolamento e operação. Paridade completa continua programa próprio; capacidades fora do release não são ativadas por este plano. Nenhum estado de cartão C100/PAR foi marcado concluído, nem dependência ou gate foi removido.

RT01/RT02 são reusos com prova local já existente. CI002/CI003/QA continuam com o Lead0410 e seus recursos. S01/S02/C02 devem conferir persistência/cache/stream/compactação/spill da onda8 antes de construir outra implementação.0255 já decidida deve ser consumida; a incorporação não pede novamente a mesma aprovação. Fonte2.1.88, mapa e extensõesOpen-ClaudeCode não substituem o pinClaude302 ou suas provas.

## Inserções prontas para os holders — regra5

README da raiz e99/20/30 permaneciam dirty de pares. O [patch aditivo](../../04_audit/evidence/OPENCLAUDE-DOCS-20261101/shared-prefixes.patch) e o [conteúdo estruturado](../../04_audit/evidence/OPENCLAUDE-DOCS-20261101/shared-prefixes.json) estão preparados, sem aplicação nesses quatro arquivos. O holder confere pré-imagem/estado e seu intervalo, atualiza os fatos se a fonte avançou e aplica somente o próprio bloco; não sobrescreve o restante. Nenhum ACK desses paths foi inferido por silêncio.

### Runtime99

- status: COMPLETED da incorporação documental `OPENCLAUDE-DOCS-20261101`; construção e produção do harness continuam com seus critérios e tarefas existentes.
- last_completed_action:0394/0395 atualizados com fonteOpen1f0fab6/46arquivosestáticos, limitesmapa/bundle,10contraprovasOC ligadas aos16cartões existentes, H01permissões/H02config, consumo0255 e reusosRT01RT02/sessão/stream/contexto. Navegação docsREADME/índice aplicada sob ACK1834679, corpos originais preservados. Nenhum código ou aceite funcional novo.
- next_action: Lead0410 conclui CI/QA e concilia candidata final; holders C100/PAR aplicam os critériosOC às fatias relevantes e reaproveitam os recibos atuais. HolderREADME/99-20-30 integra blocos prontos em intervalo exclusivo. ProduçãoNO_GO até0373/0374/gateT4 específico.

### Execution log20

01/11/2026 — OPENCLAUDE-DOCS-20261101: por pedido do usuário, relatório REAOpen-ClaudeCode incorporado de fato aos roadmaps/backlogs0394/0395 e navegação docsREADME/índice. Corrigida divergência H01/H02 com0383 e próxima ação0255; adicionados10critérios com positivos/negativos/owner/gate e caminho crítico de produção separado de paridade. Pré-imagens, hashes e reconstrução dos corpos de navegação preservados; checks documentais no pacote. RootREADME/99-20-30 dirty não sobrescritos; patch pronto para seus holders. Nenhum runtime/contrato de aplicação/código/teste global ou release alterado.

### Backlog30

- Incorporação documental concluída em0394/0395; origemOpen-ClaudeCode ligada aos cartões existentes, sem nova fila de status.
- Usar OC01–OC10 nas SPECs/fatias relevantes, com candidato e evidência atual; fonte estática não fecha cenário executável. Q01/S01/S02/B01/C02/H01/H02/P01/P02/K01/K02/O01/T01/T02 e reusosPAR conservam seus pais.
- Prioridade de produção segue0410/F01, consumo/integraçãoRT01RT02, segurança/isolamento/medição e a barra0373/0374; não exigir toda a paridade para um release que não inclua essas capacidades.
- H01 volta a permissões/restricted; H02 concentra configuração efetiva/safe/bare/diagnóstico. Consumir0255 e recibos atuais, sem repetir gate já decidido ou implementar store/supervisor paralelo.

## Continuidade e limites

Esta rodada entrega documentação aplicada e integração coordenada de navegação. O patch dos quatro arquivos ocupados continua pendente dos holders. Checks verdes de Markdown/JSON/links não são testes de runtime; não houve código, instalação, banco, serviço, certificação, commit, push ou deploy. Antes da próxima unidade, reler GBrain/claims e conferir revisão/recibos atuais. O [estado próprio](../../04_audit/evidence/OPENCLAUDE-DOCS-20261101/state.json) registra resultado real e pendências sem promover o programa a produção.
