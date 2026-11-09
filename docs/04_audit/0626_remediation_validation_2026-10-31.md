# AUD0626 — Implementação e validação funcional

As correções locais dos 18 itens foram implementadas ou receberam disposição explícita. A qualificação integrada final está registrada no [relatório de encerramento](evidence/AUD0626-REMEDIATION/FINAL_REPORT.md), que é a fonte do resultado final desta rodada. Este documento fixa o estado técnico anterior à execução dos gates completos. Produção permanece NO_GO.

## Versão e rastreabilidade

Candidata física: `/mnt/dados/cvg-work/aud0626-remediation/candidate`, baseada em `e92335c25e3e996f411dea2293babfbc6a72c61b`. Código próprio em branch local, sem integração ao main compartilhado. [Auditoria original](0626_full_functional_audit_2026-10-30.md), [plano](../03_build/0626_remediation_execution_plan.md), [contrato](../02_spec/0626_audit_remediation_contract.md), [carteira](evidence/AUD0626-REMEDIATION/backlog.json) e [estado](evidence/AUD0626-REMEDIATION/state.json) permitem conferir cada disposição. O relatório original e suas 213 entradas de manifesto permanecem imutáveis.

## Funcionamento e mudanças

O núcleo admite uma execução pela fábrica pública, verifica policy e orçamento, solicita aprovação quando exigida e registra intenção e resultado dos efeitos. A supervisão compartilha o prazo de encerramento, preserva dívida quando uma confirmação durável fica desconhecida e impede que uma continuação tardia recupere autoridade. Pré-cancelamento conserva abertura/encerramento sem iniciar modelo ou ferramenta; reserva confirmada interrompida antes de invocar intenção é encerrada explicitamente. A composição final passou por revisão independente, GBrain1546427, sem P1/P2 no escopo.

O gateway verifica localização efetiva do provider e orçamento a cada tentativa, conta o modelo uma vez e libera a aquisição do circuito quando a recusa ocorre antes de chamar o provider. A API revalida a revisão da identidade na seção protegida de escrita. O sandbox conserva causa, prazo e incerteza do cleanup; a prova local não qualifica host ou imagem de produção.

O Assistente de Plantão mantém domínio e persistência próprios: gerações impedem recibos antigos de alterar tarefas novas, correções suspendem tarefas ancestrais comprovadas, escritor único impede reserva concorrente e respostas a comandos possuem intenção durável recuperável. Falha de armazenamento impede a próxima parte; mesmo ID com payload divergente é conflito. Scheduler prioriza lembretes, revalida a elegibilidade no dispatch e suporta recibos sintéticos autenticados e duráveis. A revisão final1542914 aprovou o escopo, incluindo prazo por slot repetido e permissões privadas dos arquivos já existentes. Não representa qualificação de provedor real.

## Disposição dos itens

| Item          | Disposição local                                                                                                        |
| ------------- | ----------------------------------------------------------------------------------------------------------------------- |
| RT-01         | Contagem duplicada removida; 56 testes focais aprovados.                                                                |
| RT-02         | Supervisão, cancelamento, dívida e encerramento corrigidos; composição1672 testes/127 arquivos, oito alvos100% S/B/F/L. |
| RT-03 / RT-05 | Localização e orçamento por tentativa; 307 testes aprovados e revisãoR2.                                                |
| RT-04         | Cleanup nativo e diagnósticos conservadores; 370 regressões aprovadas e revisãoR3.                                      |
| POLICY-001    | Prova de sessão vinculada à identidade/revisão e revalidação nas escritas; controles unitários e suítePG existente.     |
| QUAL-CLI-01   | Fixture completa e falhas de setup/diagnóstico explícitas, sem interpretar erro de import como aceitação.               |
| PO-01 / PO-02 | Gerações e suspensão por correção com ancestralidade comprovada.                                                        |
| PO-03         | Lease exclusivo de escritor e encerramento conservador; recuperação manual exige evidência do processo parado.          |
| PO-04         | Intenção durável de resposta e retomada sem repetir prefixo aceito.                                                     |
| PO-05         | Scheduler, prazo por slot e recibos autenticados/duráveis; revisãoR2 aprovada.                                          |
| PO-06 / PO-07 | Guarda de armazenamento por parte e conflito de payload preservando o evento vencedor.                                  |
| PO-08         | Documentação alinhada a ModelGateway.generate e NO_MODEL.                                                               |
| Q01           | Disposição explícita de pendência: HISO005 aberto; nenhuma prova positiva de isolamento concedida.                      |
| Q02           | Nove disposições locais de CodeQL; controles de rotas e remoção de substituição inócua, sem dismissal remoto.           |
| Q03           | Gate exige exit0 e declaração literal de zero vulnerabilidades; audit-level=high isolado não concede aceite.            |

## Evidência funcional anterior à qualificação integrada

As contagens se sobrepõem e não devem ser somadas. Os hashes e recibos delimitam a revisão efetivamente testada; campanhas anteriores não são apresentadas como uma certificação atômica da versão final.

| Campanha                                | Resultado observado                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Núcleo, composição final selecionada    | 1672PASS/127 arquivos; oito alvos100% S/B/F/L; replay42PASS.                                       |
| Produto, versão final revisada          | 407PASS/30 arquivos; 13 regressões novas; 394 casos anteriores preservados.                        |
| Prova nativa do produto                 | 133,507s; 20 confirmações duráveis em até38,364s; controle sem recibo falha após60,006s.           |
| PostgreSQL existente, snapshot anterior | 430PASS/44 arquivos; nenhuma corrida HTTP/PG customizada executada.                                |
| Fronteiras nativas                      | 79PASS/3 arquivos,149,729s.                                                                        |
| Navegadores confiáveis                  | 18PASS/3 navegadores,96,228s; axe0 após preparo canônico.                                          |
| OIDC, três hosts sintéticos             | 15PASS/162,711s; axe0; 40 medições de pacing sem violação.                                         |
| Configuração de segredos                | 34PASS/75,640s, incluindo32 pares de controle.                                                     |
| Dependências, auditoria atual           | Produção0; árvore completa10 moderadas/0high/critical, derivadas de uma causa raiz. ZERO_ALL=FAIL. |

A primeira campanha global COREv1b falhou:8776PASS/12FAIL em8788 casos, três arquivos com falha de coleta e lacunas de cobertura por arquivo. Seus logs e mapas foram preservados; setup e bugs concretos foram tratados sem reduzir a barra. Falhas iniciais de navegador, configuração e provas negativas também permanecem no pacote.

## Limites e encaminhamento

A pesquisa de versões upstream não encontrou um caminho suportado que eliminasse a dependência vulnerável sem mudança adicional de arquitetura/dependências; não houve override, downgrade, waiver ou instalação para forçar verde. Isolamento HISO005, provedor real e imagem/host nativos de produção permanecem sem aceite. Provas locais não demonstram power-loss, NFS, capacidade de produção nem ações clínicas reais. Todos os dados utilizados são sintéticos.

Os ledgers99/20/30 da raiz estavam modificados por outros agentes. Foram preservados e receberam proposta concreta de atualização pelo [handoff](evidence/AUD0626-REMEDIATION/shared-ledger-handoff-request.md); as versões da candidata privada receberam entradas próprias sobre a baseline, com corpos históricos intactos. Não houve push, merge ou deploy. O [encerramento dinâmico](evidence/AUD0626-REMEDIATION/FINAL_REPORT.md) registra os comandos finais, falhas remanescentes, commit local, limpeza e readback do GBrain.
