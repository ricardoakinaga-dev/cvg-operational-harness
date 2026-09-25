# 0109 — Dados e Persistencia

## Entidades persistidas

- conversations
- messages
- sessions
- agent_runs
- tool_calls
- approval_requests
- handoff_events
- tasks
- contacts
- patient_links
- memory_facts
- safety_events
- integration_events

## Estrategia geral

Banco proprio da agente como fonte operacional inicial. Sistemas externos sao sincronizados ou consultados por adapters, sem serem pre-requisito para o MVP.

## Leitura e escrita

- Escritas de auditoria sao append-only quando possivel.
- Estados operacionais usam transicoes controladas.
- Timeline de conversa deve ser montada por leitura agregada.

## Consistencia transacional

- Recebimento de mensagem deve persistir mensagem e sessao de forma atomica.
- Tool call deve registrar pedido e resultado.
- Approval decision deve atualizar request e registrar evento auditavel.

## Auditoria

- Tool calls, safety events e integration events nao devem ser apagados.
- Dados sensiveis devem ter acesso restrito e mascaramento quando expostos no painel.
- Eventos sensiveis devem registrar actor, actorType, policyVersion, correlationId e requestId quando existir.
- Auditoria deve ser append-only; correcao deve ocorrer por evento compensatorio, nao por sobrescrita silenciosa.

## Classificacao de dados

| Classe                | Exemplos                                         | Regra                                                     |
| --------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| Operacional           | status de sessao, filas, tarefas                 | acesso por papel operacional                              |
| Dado pessoal          | telefone, nome do tutor, identificadores         | minimizacao, mascaramento e trilha de acesso              |
| Dado sensivel/clinico | sintomas, historico, anexos, observacoes medicas | handoff preferencial, acesso restrito e retencao aprovada |
| Auditoria             | tool calls, policy decisions, safety events      | append-only e acesso de supervisao                        |
| Configuracao          | policy, adapters, autonomy level                 | versionamento e auditoria de mudanca                      |

## Versionamento de dados

- Payloads de tools, workflows e policies devem registrar versao.
- Mudancas de schema devem preservar leitura de historico.

## Retencao

Politica final depende de decisao de governanca. Ate la, nenhum rollout com dados reais deve ocorrer.

## Retencao provisoria

- Ambiente local/dev: usar dados ficticios/sinteticos. Dados reais sao
  proibidos em qualquer ambiente, inclusive anonimizados ou com alegada
  autorizacao parcial (regra do repositorio em `AGENTS.md`; reconciliado em
  `AUD19-012`, 2026-09-20). "Autorizado", neste repositorio, significa
  fixture sintetica aprovada em gate — nunca dado real.
- Piloto controlado: exige tabela de retencao aprovada antes do primeiro atendimento real.
- Mensagens e dados pessoais: reter pelo menor periodo compativel com operacao e auditoria.
- Eventos de auditoria: reter conforme exigencia legal/operacional aprovada, com acesso restrito.
- Memory facts: gravar apenas fatos aprovados, versionados e com base legal/operacional.
- Expurgo: deve gerar evento auditavel com escopo, motivo, ator e timestamp.
