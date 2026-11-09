# Panorama da construção do CVG Operational Harness

Data de referência: 27/10/2026. Relatório apresentado a Ricardo e arquivado a seu pedido para consulta futura. Este documento preserva o panorama daquela consulta; avanços posteriores devem ser conferidos nos registros atuais.

Alinhamento explícito de Ricardo em 27/10/2026: **o objetivo principal do CVG Operational Harness é construir e validar seu núcleo, kernel e runtime. A aplicação acima existe para testar esse núcleo em jornadas concretas.** Login, telas, fluxo de uso e piloto da aplicação têm escopo próprio; sua conclusão não é a medida da construção do kernel.

**Temos uma base funcional do núcleo e avanços técnicos comprovados, mas a integração e a qualificação desse núcleo continuam incompletas. A homologação da aplicação consumidora é uma trilha própria. Produção permanece `NO_GO`.**

O projeto está na fase de construção, estabilização e validação. O principal desafio agora é reunir as peças aprovadas e demonstrar que funcionam juntas na mesma versão.

**O que estamos construindo**

O trabalho tem uma prioridade central e uma camada de validação, com responsabilidades e aprovações próprias:

- **Operational Harness, objetivo principal:** núcleo, kernel e runtime reutilizáveis, com contratos, orquestração, execução governada, políticas, aprovação humana, auditoria, persistência e integrações.
- **Assistente de Plantão, aplicação de validação:** consumidor usado para exercitar e validar o núcleo em mensagens, rascunhos e pendências da equipe, com validação humana. Continua com domínio e operação próprios.

A avaliação deve mostrar o que o núcleo consegue executar, como suas fronteiras públicas funcionam e quais propriedades foram demonstradas. A aplicação fornece evidência de consumo e integração; o núcleo também deve compilar e executar sem ela, conforme a [ADR-010](architecture/adrs/ADR-010-harness-product-isolation.md). Aprovação humana, auditoria e autorização reutilizáveis podem pertencer ao núcleo ou ao host; a tela de login e a experiência do produto não devem ser confundidas com essas capacidades.

A visão registrada na memória é servir agentes operacionais do hospital veterinário. Diagnóstico, prescrição e escrita definitiva de prontuário continuam fora da autorização.

| Frente                   | Situação encontrada                                          | O que falta                                                   |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------------------------------- |
| Núcleo e arquitetura     | Base funcional; versões anteriores passaram por certificação | Aceitar a composição atual e concluir provas de independência |
| CI e certificação        | Componentes recentes implementados, testados e revisados     | Concluir integração e certificação do conjunto                |
| Segurança e persistência | Controles existentes, com correções adicionais especificadas | Fechar atomicidade, revogação de sessão e outras pendências   |
| Console e login          | Login sintético implementado; PR #29 continua aberto         | Integração, dependências de autorização e identidade real     |
| Publicação de imagem     | Primeira imagem publicada no GHCR em 23/10                   | Qualificar a candidata atual, implantação e reversão          |
| Ambiente do hospital     | Receita e preparação documentadas                            | Disponibilizar e qualificar o servidor de destino             |
| Assistente de Plantão    | Implementação e testes parciais disponíveis                  | Confiabilidade completa, homologação e treinamento            |
| Piloto                   | Previsto no plano                                            | Autorização e execução acompanhada                            |

**Os avanços recentes são concretos.** A frente mais ativa é a integração da certificação, chamada CI0261/N1. Ela busca permitir o reaproveitamento de evidências sem aceitar resultados de outra versão ou arquivos sem autenticidade comprovada.

Os registros recentes do integrador mostram:

- 650 testes Python aprovados na composição verificada.
- 100 testes Node de modo e proveniência aprovados.
- 81 testes Node do vínculo com entradas nativas aprovados.
- Revisões independentes aprovadas para partes delimitadas dessas mudanças.

Esses números pertencem a verificações específicas e não devem ser somados como uma certificação global. Ainda faltam autenticação completa do código carregado, integração efetiva do fluxo e qualificação da candidata inteira. Uma pendência de segurança identificada é impedir que arquivos locais não autenticados sejam carregados durante a inicialização.

A coordenação atual concentra a integração em **41F8**, com entregas Node/Python e revisões distribuídas entre **33E9, 7AD2 e CCD3**.

**As pendências têm escopos distintos.** Integração, contratos e provas de independência afetam a avaliação do núcleo. Login deve ser discriminado entre autorização reutilizável, host e aplicação. Implantação no hospital, homologação e piloto dizem respeito ao perfil operacional correspondente e ao consumidor; não são automaticamente bloqueios de todo BUILD ou teste local do kernel.

1. **Integração técnica:** concluir N1, revisar a composição congelada e executar os gates sobre essa mesma candidata.
2. **Contratos pendentes:** a última conferência registra cinco pacotes sem recibo humano correspondente: 0257R2, 0258R1, 0262R5, 0264FORMAT_R2 e 0265R3. A aprovação de N1 já existe e não cobre esses outros pacotes.
3. **Login e autorização:** a consulta direta confirmou que o [PR #29](https://github.com/ricardoakinaga-dev/cvg-operational-harness/pull/29) permanece aberto. Mesmo integrado, ele ainda deixa dependências para concluir a unidade de login.
4. **Infraestrutura:** os últimos registros continuam indicando servidor indisponível. Identidade corporativa, Vault, restrições de rede, backup, alerta externo e rollback precisam ser demonstrados no destino.
5. **Produto:** confirmação humana, fidelidade das informações, recuperação após falha, transporte e operação ainda têm aceites pendentes. Uma revisão final de confiabilidade terminou por timeout, sem parecer admitido.
6. **Uso pela equipe:** faltam homologação, treinamento e o piloto previsto de duas semanas com dois plantonistas.

A [matriz de pendências de 27/10](04_audit/evidence/C27-PENDING-CLOSURE-AUDIT-CCD3-20261027T1018/REPORT.md) cobre as 24 unidades e os 42 critérios do recorte combinado de núcleo, operação e consumidor. Esse total não é um denominador de conclusão do kernel. Os requisitos e gates existentes mantêm seu escopo; este alinhamento não cancela cartões ou concede aceite.

**Sobre quanto está pronto: ainda não existe um percentual confiável de conclusão.**

O indicador publicado de **65%** significa 13 de 20 atividades executadas no checklist. Inclui diagnósticos e revisões rejeitadas; algumas caixas abertas representam entregas grandes.

A auditoria de 22–23/10 atribuiu **78/100 à engenharia** e **55/100 à prontidão demonstrada para implantação**. São avaliações históricas daquela revisão, não porcentagens atuais de construção nem notas específicas de paridade do kernel. Fonte: [Auditoria 0624](04_audit/0624_repository_score_audit_2026-10-22.md).

A paridade com o DeepSeek Harness também é uma trilha separada, de prazo maior. O levantamento antigo de aproximadamente 18% não foi atualizado nesta consulta e não deve ser usado como progresso atual.

**O próximo marco central é uma candidata do núcleo integrada, rastreável e qualificada.** A sequência é fechar a integração atual, resolver os contratos aplicáveis ao núcleo e demonstrar suas capacidades e independência pela fronteira pública. A aplicação consumidora deve ser usada para os testes de integração pertinentes. Qualificação do ambiente hospitalar e homologação do Assistente seguem suas trilhas, conforme dependências e gates próprios.

Há também uma dificuldade de acompanhamento: os ledgers centrais ainda apresentam um corte antigo no topo, enquanto os avanços recentes estão distribuídos entre GBrain, candidatas isoladas e handoffs. Isso dificulta enxergar o progresso consolidado.

O panorama foi registrado no GBrain, com leitura de confirmação. A rodada foi documental; não executou nova certificação.

**Fontes para consulta futura**

- [Evidências da consulta original](04_audit/evidence/PANORAMA-20261027-CODEX-81C4/evidence.json), com referências, hashes e confirmação de sincronização no GBrain, evento 557679.
- [Plano executivo 0397](03_build/0397_plano_executivo_producao_aud0624.md), [roadmap 0398](03_build/0398_roadmap_producao_aud0624.md) e [backlog de execução 0399](03_build/0399_backlog_producao_aud0624.md).
- [Handoff do plano compartilhado](08_runtime/handoffs/plano_compartilhado_20261027.md) e [coordenação entre agentes](08_runtime/agent_coordination.md).
- [Contrato do Assistente de Plantão](../products/shift-assistant/docs/spec.md).
- [Roadmap de paridade 0379](03_build/0379_roadmap_paridade_100_deepseek.md).
- [Registro do alinhamento de prioridade do núcleo](04_audit/evidence/DIRECAO-NUCLEO-20261027-CODEX-81C4/receipt.json).

Os documentos vinculados podem receber atualizações. As evidências da consulta original conservam os hashes das fontes usadas no corte deste relatório.
