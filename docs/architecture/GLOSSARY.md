# Glossário operacional / Operational glossary

Este glossário padroniza o vocabulário usado no processo CVG e na documentação
da plataforma. Ele esclarece termos que aparecem em mais de um contexto; não
altera contratos, enums, eventos, APIs ou estados de domínio. Use os
identificadores em inglês exatamente como definidos quando forem valores de
máquina e acompanhe-os da forma canônica em português na prosa.

## Termos canônicos

| Conceito       | Forma canônica em português                       | Termo canônico em inglês | Definição e distinções                                                                                                                                                                                                                                                                                                                              | Fonte de verdade                                                                                                                                                                                                       |
| -------------- | ------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approval       | aprovação (qualificada pelo contexto)             | approval                 | Decisão registrada por ator autorizado sobre uma solicitação com escopo definido. `Aprovação de gate` autoriza somente a etapa e os bytes/limites descritos no gate; `ApprovalRequest` é o fluxo de aprovação do produto. Uma solicitação `pending` não foi aprovada. Aprovar não executa a ação, publica uma versão nem libera produção por si só. | [governança e auditoria](../02_spec/0111_permissoes_governanca_e_auditoria.md), [máquina de estados](../02_spec/0105_maquina_de_estados_e_fluxos.md), [limite de release](../platform/08-security-release-boundary.md) |
| Handoff        | transferência para atendimento humano (`handoff`) | handoff                  | Pedido ou transição de controle para atendimento humano quando policy, risco ou necessidade operacional exige intervenção. Handoff não é approval e não prova que uma pessoa aceitou ou concluiu o atendimento; registrar a transição correspondente.                                                                                               | [máquina de estados](../02_spec/0105_maquina_de_estados_e_fluxos.md), [human takeover](../platform/human-takeover.md)                                                                                                  |
| Gate           | gate (portão de decisão)                          | gate                     | Verificação nomeada com pré-condições, escopo autorizado, critérios de aceite, evidências e regra de parada. Quando a regra exigir aprovação humana, a aprovação vale apenas para o gate e os limites identificados. Um resultado local positivo não libera outra etapa nem produção.                                                               | [constituição operacional](../07_agents/AGENTS.md), task e pacote de gate aplicáveis                                                                                                                                   |
| Candidate      | candidato congelado (de entrega)                  | candidate                | Conjunto fixado de arquivos e entradas de uma execução, identificado por manifesto, hash/fingerprint e run. Revisões e resultados devem apontar para o mesmo candidate. Isso não é automaticamente um `ReleaseCandidate` do produto e não autoriza publicação ou deploy.                                                                            | [SPEC de governança M07](../02_spec/0128_m07_package_dependency_governance.md), [versionamento de agentes](../platform/agent-versioning.md)                                                                            |
| Tenant         | tenant (escopo isolado da organização)            | tenant                   | Fronteira de isolamento dos dados e operações de uma organização/cliente. O tenant efetivo vem de contexto confiável do servidor; um valor enviado livremente pelo browser, job ou usuário não é autoridade. Tenant não é sinônimo de operador, usuário ou agente.                                                                                  | [security model](../platform/security-model.md), [control plane](../platform/control-plane.md)                                                                                                                         |
| Release        | liberação de versão (`release`)                   | release                  | Processo controlado de disponibilizar uma versão. No produto, `APPROVED`, `VALIDATED` e `PUBLISHED` são estados distintos; aprovação ou validação isolada não autoriza deploy/rollout de produção. Em texto, dizer explicitamente se release significa publicação controlada, deploy ou liberação para produção.                                    | [versionamento de agentes](../platform/agent-versioning.md), [limite de release](../platform/08-security-release-boundary.md)                                                                                          |
| State / status | estado / status (identificador preservado)        | state / status           | Estado é o valor atual de uma máquina de estados. Use os identificadores CVG abaixo para tarefas e execução do repositório. Estados de domínio do produto (por exemplo, `ApprovalRequest` ou `AgentVersion`) pertencem às suas próprias máquinas e não substituem os estados CVG.                                                                   | [constituição operacional](../07_agents/AGENTS.md), [máquina de estados](../02_spec/0105_maquina_de_estados_e_fluxos.md), [versionamento de agentes](../platform/agent-versioning.md)                                  |

## Estados oficiais de tarefa e execução CVG

Os identificadores abaixo são canônicos e não devem ser traduzidos em campos,
logs ou gates automatizados. A tradução serve para prosa em português.

| Identificador            | Forma canônica em português | Uso                                                                    |
| ------------------------ | --------------------------- | ---------------------------------------------------------------------- |
| `IN_PROGRESS`            | em andamento                | Trabalho autorizado está em execução.                                  |
| `READY_FOR_NEXT_STEP`    | pronto para a próxima etapa | A etapa atual foi concluída e a próxima dependência está identificada. |
| `BLOCKED`                | bloqueado                   | Erro, dependência ou informação crítica impede o avanço.               |
| `WAITING_HUMAN_APPROVAL` | aguardando aprovação humana | Uma decisão humana exigida ainda está pendente.                        |
| `COMPLETED`              | concluído                   | O ciclo foi finalizado conforme os critérios aplicáveis.               |

`BLOCKED` e `WAITING_HUMAN_APPROVAL` não são intercambiáveis: use o segundo
quando o próximo passo depende de uma decisão humana; use o primeiro para uma
dependência ausente, conflito ou erro que impede o trabalho.

## Resultados de gate e decisão de release

Estes valores descrevem resultado ou decisão, não substituem o estado CVG da
tarefa:

| Valor                | Leitura canônica          | Significado                                                                                                  |
| -------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `PASS`               | passou                    | Os critérios declarados para aquele gate foram satisfeitos. O alcance continua limitado ao gate.             |
| `PASS_WITH_FINDINGS` | passou com achados        | O resultado positivo mantém os achados registrados e os limites declarados; não equivale a ausência de gaps. |
| `FAIL / OPEN`        | falhou / permanece aberto | O gate não foi aceito e a etapa não está fechada.                                                            |
| `UNAVAILABLE`        | indisponível              | A revisão ou verificação não foi obtida; não é evidência de aprovação.                                       |
| `NO_GO`              | não liberar               | Decisão de não liberar a produção no estado avaliado.                                                        |

## Desambiguação dos estados do produto

`ApprovalRequest` usa os estados `pending`, `approved`, `rejected`, `expired` e
`assumed`; `AgentVersion` usa `DRAFT → TESTING → APPROVED → PUBLISHED →
ARCHIVED`. Esses são enums de domínio descritos na SPEC e na documentação da
plataforma. Não os rebatize para combinar com o fluxo CVG nem infira que
`APPROVED`, `VALIDATED` ou `PUBLISHED` concede autorização de produção.

Quando a palavra puder indicar mais de um fluxo, qualifique-a: `aprovação de
gate`, `decisão de ApprovalRequest` ou `estado APPROVED de AgentVersion`;
`candidate de entrega` ou `ReleaseCandidate`; `estado CVG` ou `estado da
conversa/versão`.
