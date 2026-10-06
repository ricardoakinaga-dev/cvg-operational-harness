# AUD-0590 — escopo e critérios congelados

Pedido: auditoria profunda da pasta docs e do sistema, com nota 0–100 por item.

Baseline: checkout eff8e0d mais alterações locais explicitadas em baseline.json; fonte congelada em /tmp/cvg-aud0590-20260928 e vinculada por SHA-256. Artefatos de outras revisões são evidência histórica, nunca execução atual.

Trilha T1: produzir relatório e provas; não implementar correções nem alterar autorizações de produto. Dados sintéticos e recursos descartáveis próprios.

Dimensões obrigatórias: produto/PRD, arquitetura/contratos/legado, qualidade/manutenibilidade, runtime/orquestração/budgets, política/approval/handoff, persistência/transações/tenants/migrations, identidade, webhook/replay, modelos/ferramentas/RAG/canais, frontend/acessibilidade, testes/cobertura/CI/certificação, observabilidade/performance/recuperação/deploy, privacidade/retenção, governança/documentação e prontidão integrada.

Rubrica por item: 0–19 ausente ou não demonstrado; 20–39 desenho/controle inicial; 40–59 parcial ou com lacunas críticas; 60–74 funcional local com limitações relevantes; 75–89 bem sustentado por código e testes no escopo; 90–100 completo no escopo, integrado e com evidência operacional suficiente. A nota é juízo de maturidade/evidência, não percentual de requisitos cumpridos. Cada nota deve trazer fundamento, restrição e confiança.

Índice geral: média aritmética das dimensões técnicas da tabela principal, arredondada para inteiro; pesos iguais declarados. Prontidão para produção é avaliação separada contra as 13 condições do plano 0354: nenhum escore compensa um bloqueio obrigatório. Não comparar numericamente com auditorias de rubrica distinta.

Evidência de aceitação: inventário completo de docs por hash; leitura crítica dos documentos canônicos e fontes conectadas; comandos reexecutados em Node 22 com logs/exit; rastreabilidade de achados para caminhos e linhas; limites de serviços externos e crítica independente explícitos. Cobertura automatizada do acervo não implica leitura crítica de cada linha.

A tentativa de revisão auxiliar foi bloqueada pela ferramenta, sem agente criado. Execução direta, com autorrevisão posterior distinta, sem alegação de independência.
