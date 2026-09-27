# AGENTS.md — Constituicao Operacional CVG

Para a tradução e desambiguação canônica de `approval`, `handoff`, `gate`,
`candidate`, `tenant`, `release` e estados, consulte o
[glossário operacional](../architecture/GLOSSARY.md). Esta constituição
continua sendo a fonte de verdade dos estados CVG e do processo operacional.

## Proposito

Este repositorio segue o padrao CVG de engenharia orientada por documentacao, gates e execucao controlada. O Codex deve operar como agente de engenharia disciplinado para construir a Esmeralda V2, nao como gerador solto de codigo.

## Working Agreements

- Ler esta constituicao antes de agir.
- Respeitar a estrutura do repositorio.
- Seguir o pipeline CVG.
- Nao improvisar solucoes fora do processo.
- Manter documentacao viva e consistente.
- Persistir estado, log e backlog.

## Pipeline oficial

```txt
DISCOVERY -> PRD -> SPEC -> BUILD -> AUDIT
```

- Discovery define o problema.
- PRD define o produto.
- SPEC define a engenharia.
- BUILD executa.
- AUDIT valida a realidade.

## Regras de transicao

- Nao iniciar PRD sem `docs/00_discovery/0090_discovery_validation.md` aprovado.
- Nao iniciar SPEC sem `docs/01_prd/0090_prd_validation.md` aprovado.
- Nao iniciar BUILD real sem `docs/02_spec/0190_spec_validation.md` aprovado e revisao humana.
- Nao iniciar AUDIT real antes de sistema funcional.
- Usar runtime-controller para continuidade operacional.

## Uso das skills

- `discovery-engine`: usar para ideia, dor, gargalo ou oportunidade mal definida. Nao usar se discovery ou PRD ja estiver aprovado.
- `prd-engine`: usar quando discovery estiver aprovado e for necessario transformar problema em produto. Nao usar se discovery estiver incompleto.
- `spec-engine`: usar quando PRD estiver aprovado e for necessario transformar produto em engenharia. Nao usar se PRD estiver incompleto.
- `build-engine`: usar quando SPEC estiver aprovada e for necessario executar construcao faseada. Nao usar sem SPEC validada.
- `audit-engine`: usar quando houver sistema funcional em dev, staging ou producao. Nao usar antes de runtime observavel.
- `runtime-controller`: usar apos qualquer etapa para atualizar estado, log, backlog e proximo passo.

## Estado e continuidade

O Codex deve sempre ler e atualizar:

- `docs/99_runtime_state.md`
- `docs/20_master_execution_log.md`

Quando aplicavel, atualizar:

- `docs/30_backlog_master.md`

Antes de encerrar qualquer rodada:

- atualizar estado;
- registrar `last_completed_action`;
- registrar `next_action`;
- definir `status`;
- atualizar log;
- atualizar backlog quando houver impacto.

## Estados oficiais

- `IN_PROGRESS`: execucao ativa.
- `READY_FOR_NEXT_STEP`: etapa concluida e proxima acao definida.
- `BLOCKED`: execucao impedida por gate, falta de dado ou erro.
- `WAITING_HUMAN_APPROVAL`: decisao humana necessaria.
- `COMPLETED`: ciclo finalizado corretamente.

## Regras de bloqueio

Marcar `BLOCKED` quando houver falta de informacao critica, conflito entre documentos, dependencia ausente, erro nao recuperavel ou gate nao aprovado.

Ao bloquear, registrar causa raiz, impacto, acao necessaria e proxima dependencia.

## Aprovacao humana

Marcar `WAITING_HUMAN_APPROVAL` quando houver decisao de negocio, alteracao de escopo, conflito entre PRD e SPEC, risco critico ou acao irreversivel.

O Codex nao pode assumir silenciosamente decisoes de negocio.

## Governança proporcional (D-12, 26/09/2026)

Decisão do usuário registrada no
[pacote 0357](../03_build/0357_production_decision_packet_2026-09-26.md). O
rigor do gate acompanha o risco da mudança. As regras de segurança desta
constituição (sem dado real, sem produção irrestrita, sem ação clínica,
financeira ou de agenda automática, approval ou handoff para ação sensível)
não mudam.

| Trilha | Quando se aplica                                                                                         | O que exige                                                                                                                                                                            |
| ------ | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1     | Documentação, ledgers, planos, inventários                                                               | Links e formatação verdes; atualizar estado, log e backlog                                                                                                                             |
| T2     | Refatoração, remoção ou isolamento de código sem efeito externo e sem mudança de contrato público        | Task registrada, SPEC curta (recon, regras, critério de pronto), `typecheck`, `lint`, `npm test`, `test:postgres` e E2E verdes em Node 22; registro do resultado na SPEC e nos ledgers |
| T3     | Mudança de contrato público, schema ou migration, segurança, identidade, policy ou approval              | T2 + revisão explícita da SPEC pelo usuário antes do BUILD                                                                                                                             |
| T4     | Capacidade sensível (provider, canal, conhecimento, efeito externo real, dado real) ou release candidate | Gate hash-bound: pacote de decisão com SHA-256, candidato congelado, certificação completa e decisão humana registrada                                                                 |

Regras de baseline:

1. A baseline de um gate T4 inclui só os arquivos que são input daquele gate.
   Mudança em documento que não é input não invalida o gate.
2. A certificação (`npm run certify`) é reemitida por release candidate e ao
   fim de cada rodada com código, não a cada edição documental.
3. Uma trilha só pode ser rebaixada por decisão humana registrada; em dúvida,
   usar a trilha mais alta.

## Regras de Build

BUILD deve sempre comecar por:

- `docs/03_build/0300_build_engineer_master.md`
- `docs/03_build/0301_roadmap.md`
- `docs/03_build/0302_backlog_master.md`

Seguir:

```txt
PHASE -> SPRINT -> TASK
```

Cada task deve conter o que, onde, como, dependencia e criterio de pronto.

Antes de encerrar sprint com codigo, executar os gates disponiveis:

- `npm test`
- typecheck
- lint
- coverage quando configurado

Se qualquer gate estiver ausente numa sprint com codigo funcional, registrar debito P0 ou bloquear encerramento.

## Regras de Audit

AUDIT deve produzir analise de aderencia ao PRD, aderencia a SPEC, runtime analysis, logs audit, metrics audit, integrations audit, data integrity audit, gap analysis, remediation plan e audit report.

AUDIT nao pode marcar sistema como enterprise se nao houver evidencia executavel. Documento bom nao substitui runtime, teste, log, metrica, trilha de auditoria e experiencia operacional real.

## Regras de qualidade

- Preferir mudancas pequenas e coerentes.
- Preservar arquitetura.
- Evitar acoplamento.
- Manter rastreabilidade.
- Nao criar arquivos desnecessarios.
- Nao quebrar convencoes do repositorio.
- Documentar mudancas relevantes em `docs/`.

## Definicao de pronto

Uma tarefa esta pronta quando atende a etapa correta do pipeline, respeita gates, atualiza estado/log, entrega artefatos esperados, registra ambiguidade e define proximo passo.

## Anti-patterns

- Comecar codigo sem Discovery, PRD e SPEC quando aplicavel.
- Inventar produto durante SPEC.
- Fazer build sem roadmap e backlog.
- Encerrar sem atualizar estado.
- Ignorar bloqueios.
- Ignorar backlog.
- Ignorar skills existentes.
- Resumir sem persistir.

## Conclusao operacional

Este repositorio nao usa o Codex como gerador solto de codigo. Este repositorio usa o Codex como operador de um sistema de engenharia controlado.
