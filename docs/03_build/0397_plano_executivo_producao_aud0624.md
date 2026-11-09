# 0397 — Plano executivo para produção após a auditoria 0624

Data: 23/10/2026. Task: `PROD-PLAN-0624-20261023`. Entrega documental T1; programa de implantação proposto, ainda sem GO de produção. Documentos complementares: [roadmap 0398](0398_roadmap_producao_aud0624.md) e [backlog de execução 0399](0399_backlog_producao_aud0624.md).

## 1. Objetivo e resultado de negócio

Colocar o Operational Harness em produção interna controlada no hospital e preparar o Assistente de Plantão para seu piloto específico. A entrega esperada é uma versão identificada, utilizável pela equipe autorizada, que possa ser pausada, recuperada e revertida, com alertas recebidos e trilha íntegra.

Há **dois aceites diferentes**:

1. **Harness:** dez condições da barra 0373 comprovadas no mesmo commit, imagem e configuração de destino; decisão do responsável para o perfil interno aprovado.
2. **Assistente:** condições aplicáveis da barra 0368 no mesmo deploy, homologação e decisão específica de piloto com dois plantonistas por duas semanas. O piloto não é autorizado pelo GO do harness.

O Assistente standalone não depende automaticamente do login da API genérica. Seu piloto conserva a dependência canônica de independência HISO-014; não se adiciona, por este plano, uma dependência de toda a produção da API/OIDC. Os dois podem avançar em paralelo com processos, dados e releases próprios.

## 2. Baseline reconciliada

A [auditoria 0624](../04_audit/0624_repository_score_audit_2026-10-22.md) atribuiu 78/100 à qualidade geral e 55/100 à maturidade de evidência de prontidão do harness, com NO_GO. Essas notas não são percentual de requisitos cumpridos nem critério de liberação.

| Fonte                                           | Uso neste plano                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------------------ |
| Auditoria `1e96e365`                            | Evidência dos testes, achados e limites; relatório preservado                  |
| Main `9a56a9c94db3e46291f2ba1de002763eee89ff39` | Snapshot de planejamento; somente mudanças documentais após a revisão auditada |
| Checkout compartilhado `3704e3f8`               | Preservado; não é tomado como código publicado atual                           |
| Carteiras 0367, 0370, 0374 e PISO               | Donas de status, aceites e dependências; este pacote é um recorte executável   |

**Não reimplementar:** OIDC/principals da fatia 0254-A, correção do Fastify, tratamento Annex B/SPEC0252, workflows separados, recipe de release 0253, monitor/backup já entregues no produto e o aumento do Verify para 300 minutos. Todos já constam da fonte publicada. O S07 da auditoria foi encerrado; não há tarefa para corrigir novamente aquele advisory.

**Reconciliar, não repetir:** os ledgers publicados já receberam os merges pelo PR23. S10 passa a significar conferir os deltas remanescentes e manter os ponteiros atuais; não publicar de novo o mesmo resumo. O trabalho [0396](0396_gitleaks_deterministic_fixtures.md) e seu claim ativo são reutilizados para a instabilidade do scanner. O Verify da main observada estava em execução; não foi declarado aprovado ou novamente reprovado neste planejamento.

Provas da reconciliação: [manifesto](../04_audit/evidence/PROD-PLAN-0624-20261023/source-manifest.json), [fatos atuais](../04_audit/evidence/PROD-PLAN-0624-20261023/reconciled-facts.json) e [consulta de checks](../04_audit/evidence/PROD-PLAN-0624-20261023/remote-checks.json). Não houve nova auditoria de aplicação nesta rodada.

## 3. Escopo da primeira entrada

Manter as decisões já tomadas: servidor no hospital, Docker Compose, PostgreSQL local, Vault, cópia no TrueNAS, console na LAN/VPN, túnel expondo apenas webhooks assinados, imagem do GHCR privado instalada por digest e alerta ao gestor pelo canal escolhido. A ficha de infraestrutura está no [0393 publicado](https://github.com/ricardoakinaga-dev/cvg-operational-harness/blob/9a56a9c94db3e46291f2ba1de002763eee89ff39/docs/03_build/0393_servidor_hospital_requisitos_e_instalacao.md); não se propõe comprar outro conjunto de equipamentos ou mudar a hospedagem.

Preservar poder zero, aprovação/handoff para efeito sensível e RAG somente com fonte institucional aprovada. HIS é N/A na fase 1 do produto já decidida. D2 continua NO_MODEL: a experiência autorizada deve ser demonstrada como tal. Se o uso desejado exigir organização clínica por modelo, essa decisão de escopo precisa ser resolvida antes do respectivo piloto; registro bruto não substitui essa funcionalidade.

O perfil de identidade do harness deve cumprir C8/D-09 e as fatias B/C da 0254. A dispensa genérica de IdP na barra proporcional não revoga a decisão posterior específica de OIDC/MFA para uso pela equipe. A 0254 adia a escolha/qualificação do IdP real até o servidor existir; a referência anterior a Keycloak não autoriza presumir essa decisão resolvida.

**Ficam fora do caminho obrigatório inicial:** paridade completa Claude/Codex/DeepSeek, novo marketplace, MCP/streaming adicionais, exposição pública do console, múltiplas organizações, escrita no HIS, refatoração ampla por tamanho de arquivo e requisitos enterprise antigos dispensados pelo perfil proporcional. Uma dependência concreta desses programas, se descoberta, deve ser demonstrada antes de entrar no caminho crítico.

## 4. Frentes e entregas

| Frente               | Entrega verificável                                                                                   | Unidades do backlog | Responsável por função                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------- |
| Correção e acesso    | Criação/audit atômicas, grant e escrita consistentes, console OIDC e perfil de identidade qualificado | U03/U04/U08/U09     | API, persistência e identidade; integração pelo holder        |
| Núcleo reutilizável  | Fronteira positiva, cancelamento DNS e variante sem o consumidor                                      | U05/U06/U07         | Mantenedor do harness e revisor do isolamento                 |
| CI e imagem          | Barra concluída, publicação verificada, admissão por digest/proveniência e rollback                   | U02/U15             | CI/release e operação                                         |
| Operação do hospital | Servidor, egress, Vault, monitor externo, backup e alerta de falha                                    | U10–U14             | TI/operação; Ricardo responde por acesso e decisões pendentes |
| Consumidor           | Preview/revisão, durabilidade, pausa, hardening, homologação e piloto próprios                        | U18–U23             | Engenharia/owner do produto e dois plantonistas               |
| Integração e aceite  | Evidências atuais, parecer por artefato e decisão específica                                          | U01/U16/U17         | Integrador, revisor e responsável pelo harness                |

Uma mesma pessoa pode acumular funções; a capacidade disponível deve refletir isso. Dois agentes no mesmo `main` não equivalem automaticamente a dois engenheiros dedicados. `server.ts`, persistência, lockfile, certifiers e recursos de teste têm um holder por vez. Preparação documental e infraestrutura podem avançar enquanto outro holder trata código disjunto.

## 5. Prazo, esforço e orçamento de planejamento

| Recorte                                                          |                                       Esforço estimado de engenharia/operação |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------: |
| Harness até decisão de entrada, U01–U17                          |                                                             27–54 dias-pessoa |
| Saldo incremental do produto até preparar/fechar piloto, U18–U23 |                                                            9,5–18 dias-pessoa |
| Manutenção posterior opcional, U24                               |                                                               2–4 dias-pessoa |
| Observação do piloto                                             | Duas semanas de calendário, além do preparo acima e do tempo dos plantonistas |

Estimativas propostas, confiança média-baixa, sem medição de velocidade da equipe. As faixas incluem incerteza local; não se somam novamente as correções já entregues. A fronteira U05 precisa de recon limitado a dois dias e reestimativa: não há compromisso de resolver análise genérica de JavaScript em dez dias.

**Cenário com duas frentes técnicas realmente disponíveis e TI acompanhando:** reservar aproximadamente **4–8 semanas para o candidato e aceite do destino**, mais **duas semanas de piloto** do consumidor quando seu gate estiver pronto. São janelas condicionais, não datas prometidas. Com execução essencialmente sequencial por uma pessoa, os 36,5–72 dias-pessoa anteriores ao fim do preparo levam aproximadamente **7–15 semanas úteis**, mais o piloto.

Compra/entrega do servidor, rede/certificado/TrueNAS/segunda máquina, escolha do IdP, aprovações e agenda da equipe têm duração ainda desconhecida e acrescentam espera. Não entram nos dias-pessoa nem estão ocultos na data final. O caminho ideal do grafo, com capacidade ilimitada e sem esperas, é apenas um limite inferior, não o cronograma contratado.

O orçamento financeiro precisa usar o custo-dia efetivo de cada função, compra conforme0393 e custos aprovados de operação. Este plano não contém cotação nem inventa preço. U01 registra disponibilidade/custo; U05 e U10 recalibram o compromisso antes de anunciar data externa.

## 6. Gates de decisão

| Gate do programa                     | Evidência para avançar                                                                                    | Decisão                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| G0 — baseline/escopo                 | Candidato, donos, decisões e saldo real reconciliados                                                     | Planejamento pode virar tasks próximas; não autoriza código sensível                            |
| G1 — contratos prontos               | WHAT/HOW/aceites e autoridade aplicável à fatia, com claims livres                                        | BUILD conforme T2/T3/T4 vigente; não repetir aprovação que já cubra os mesmos bytes/escopo      |
| G2 — engenharia qualificada          | Negativos da0624 fechados no perfil, isolamento positivo e regressão atual                                | Preparar composição integrada e evidência do candidato                                          |
| G3 — ambiente e release verificáveis | Servidor/identidade/rede/backup/alerta, imagem e admissão testados                                        | Executar a barra final e apresentar pacote de aceite                                            |
| GH — GO do harness                   | Dez condições0373 demonstradas no mesmo candidato/imagem/configuração; operação e retorno ensaiados       | Responsável decide o uso interno do harness                                                     |
| GP — piloto do produto               | Sete condições aplicáveis0368 provadas e HIS N/A justificado; homologação, D2/escopo e decisão específica | Owner autoriza duas semanas com dois plantonistas; decisão posterior de continuar/ajustar/parar |

A barra executável vigente, inclusive certificação onde o contrato de CI a exige, deve ser respeitada. As barras proporcionais não reintroduzem automaticamente os 13 gates enterprise legados, PITR formal ou um pentest externo como novas condições universais. Tampouco este recorte encerra todos os pais UP91 ou dispensa seus aceites aplicáveis. O pacote final explica qual perfil foi verificado e por qual autoridade.

P0-R neste backlog significa **bloqueio de liberação no perfil**, não vulnerabilidade P0. Não se exige eliminar todo P1 do repositório ou alcançar90/100: exige-se fechar os obrigatórios do uso escolhido, registrar resíduos não bloqueantes com dono e autoridade e obter prova atual.

## 7. Critérios de entrada, permanência e retorno

O pacote de aceite contém SHA, digests do core/produto quando aplicáveis, configuração saneada, migrations, manifesto de escopo, resultados brutos, limites, responsáveis, contatos de incidente e decisão humana. Uma correção relevante cria novo candidato e reabre as provas afetadas; não se congela toda a main por semanas nem se invalida gate por documento que não seja input dele.

Durante a operação/piloto, acesso indevido, efeito duplicado ou sensível não aprovado, perda de pendências, impossibilidade de pausar ou falta de integridade de backup são gatilhos de pausa imediata e reconciliação pelo responsável. Não apagar journal ou repetir envio incerto para tentar recuperar. Indisponibilidade de infraestrutura segue o runbook e a imagem anterior só é restaurada quando schema/estado forem compatíveis; incompatibilidade exige procedimento específico, não rollback cego.

Os limiares de alertas, capacidade e aceites por turno devem ser registrados com a operação/owner na preparação, sem números arbitrários tratados como aprovados. A expectativa de até5.000 mensagens/dia já registrada no0393 é insumo para medir a carga, não SLA prometido. Métricas mínimas: fila/progresso, tempo de alerta recebido, restore e pausa/retomada, decisões/efeitos auditados, erros e intervenções por turno.

## 8. Riscos e decisões ainda abertas

| Risco/dependência                             | Efeito no plano                                             | Tratamento e dono                                                                                |
| --------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Prova positiva HISO ainda INCOMPLETE          | Bloqueia o aceite de independência e dependências canônicas | U05: recon limitado, perfil explícito e replanejamento se necessário; mantenedor/revisor         |
| Servidor e serviços do hospital indisponíveis | Adia staging/IdP/ensaios reais                              | U10: inventário e agenda com TI; Ricardo responde por aquisição/acesso                           |
| Identidade real/console não qualificados      | Impede uso trusted do core pela equipe                      | U08/U09 e decisão do perfil; não usar NODE_ENV=test em produção                                  |
| CI/scanner ou GHCR sem recibo completo        | Imagem publicada/verificada ainda não demonstrada           | U02/U15; reusar0396 e claim existente, nunca afrouxar scanner para passar                        |
| D2 necessária ao uso clínico pretendido       | Pode limitar o valor funcional do piloto                    | U18/U22: mostrar escopo NO_MODEL e exigir decisão apenas se aquela capacidade for necessária     |
| Capacidade compartilhada/claims concorrentes  | Aumenta calendário e risco de integração                    | Um holder por fronteira e integração por unidades; não reescrever trabalho dos pares             |
| Cópia de backup no mesmo prédio               | Risco residual já registrado                                | Preservar decisão existente, registrar recuperação e não simular proteção geográfica inexistente |

## 9. Início recomendado

Primeira janela: U01 e preparação de U03/U05/U08; CI U02 é acompanhado pelo holder atual e U10 abre o levantamento de disponibilidade com TI. Nos primeiros dois dias úteis de engenharia, entregar o saldo da fronteira, a SPEC curta de atomicidade, o saldo da fatiaB e o inventário do ambiente. O resultado deve permitir escolher a próxima task com dependências satisfeitas e gate válido.

Este pacote conclui o planejamento pedido. Não iniciou BUILD, testes funcionais, publicação, provisionamento, uso real ou piloto. A continuidade e os deltas dos ledgers ocupados estão no [handoff](../08_runtime/handoffs/prod_plan_0624_20261023.md).
