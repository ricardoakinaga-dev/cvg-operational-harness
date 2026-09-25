# Avaliação da documentação e da construção — 22/09/2026

## Escopo e método

Esta avaliação responde ao pedido de leitura da documentação e inspeção do que
está construído no `cvg-operational-harness`. No início da rodada foram
inventariados 2.980 arquivos em `docs` (811 Markdown, 471 JSON, 834 logs e
outros formatos); a leitura
humana foi dirigida aos documentos mestres de Discovery, PRD, SPEC, Build,
Audit, runtime, backlog, arquitetura, plataforma e às evidências correntes de
`REM21-019` e `REM21-009`. Não se afirma leitura linha a linha dos logs e
artefatos históricos. A implementação foi confrontada com entrypoints, rotas,
packages, migrations, workflow de CI e manifesto do candidato.

Não foram executados testes, serviços, containers, navegador ou integrações
nesta rodada. As métricas abaixo são **evidência registrada** pelo projeto,
não resultado de uma nova execução. Foi feita apenas uma checagem estática,
somente leitura, dos hashes dos 1.381 arquivos listados em
`certification/candidate-manifest.json`: 0 ausentes e 0 divergentes no momento
da inspeção. A worktree já tinha 306 entradas modificadas ou não rastreadas no
início da rodada; esta avaliação não confunde o candidato hash-bound com um
commit limpo.

O objetivo documentado é uma plataforma governada de atendimento hospitalar:
conversa, triagem operacional, jornada, tarefa, approval, handoff, auditoria e
painel, com ações sensíveis bloqueadas por policy e autoridade humana. O gate
vigente cobre apenas construção local, sintética e descartável (`G21-1`).
`G21-5`, `G21-6`, dados reais e produção continuam fechados.

## Notas por dimensão

Escala: 0 = ausente; 50 = parcial/fixture; 75 = implementado e verificado
localmente; 90 = robusto no escopo controlado; 100 = qualificado inclusive na
operação pertinente. As notas medem maturidade observável, não quantidade de
arquivos. A média ponderada usa os mesmos pesos declarados pela auditoria
`0566`; o cálculo atualizado é **78,4/100**, arredondado para **78/100**.
Essa média descreve o programa local; não substitui o gate binário de release.

| Item                           |   Nota | Evidência e limite principal                                                                                                                                                                                                                 |
| ------------------------------ | -----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Documentação e governança      | **68** | Pipeline, contratos, backlog e evidências extensos; `99_runtime_state` e `30_backlog_master` trazem a transição recente, mas `0300`, `0301`, `0302`, `0337` e `99_operational_index` ainda apresentam resumos antigos.                       |
| Arquitetura e modularidade     | **77** | Monorepo com API, worker, web e packages separados; composição real existe. `apps/api/src/server.ts` tem 5.857 linhas, `packages/persistence/src/postgres.ts` 3.354 e o runtime iterativo 2.455, aumentando custo de manutenção.             |
| Qualidade do código            | **78** | Contratos tipados, fronteiras e tratamento de erros têm implementações materiais; o tamanho dos arquivos centrais e caminhos legados/novos reduzem a clareza. Typecheck/lint verdes são evidência do candidato, não reexecução nesta rodada. |
| Testes e avaliação             | **91** | O certificado registra 2.262 testes unitários aprovados sem skips, 258 testes PostgreSQL, 12 E2E gerais, 15 cenários em Chromium/Firefox/WebKit, 56 evals e 10/10 mutantes mortos. São fixtures locais; não medem serviço real.              |
| Segurança e privacidade        | **80** | Sessão confiável no web padrão, replay, SSRF, tenant, RLS, redaction e gates de approval foram reforçados. IdP real, política externa de egress, privacy/signoff e operação com dados reais permanecem sem validação.                        |
| Dados, transações e migrations | **88** | Há 27 migrations numeradas (`0000`–`0026`), RLS, journals e outbox. Prova PostgreSQL descartável cobriu restore, 45 tabelas, checksums, isolamento e recuperação; RPO/RTO de produção não foi medido.                                        |
| Confiabilidade e concorrência  | **82** | Fencing, idempotência, outbox e readiness do worker homologado têm código e prova local. Worker controlado rejeita produção; carga de 10.000 eventos e recuperação local não qualificam operação real.                                       |
| Observabilidade                | **74** | Logs, métricas, correlação, exporter composto e alertas sintéticos existem. Retenção externa, dashboards, paging e SLOs medidos em ambiente operacional não têm prova.                                                                       |
| Frontend e UX                  | **83** | Conversas, jornadas, approvals, tarefas, auditoria e Control Center têm telas e APIs. Sessão confiável e acessibilidade passaram na matriz local de três browsers; IdP e uso por operadores reais não foram validados.                       |
| CI, certificação e release     | **88** | Workflow Node 22 lista 35 gates, imagem non-root, SBOM, segurança, PostgreSQL, navegador, cobertura, mutação e manifesto. O candidato local está íntegro, mas a revisão independente I1 é condicional e o certificado final está deferred.   |
| Prontidão operacional          | **67** | Existem runbooks, health/readiness e provas locais de imagem, restore e observabilidade. Faltam dependências externas aprovadas, ensaio operacional e recuperação/RPO/RTO no ambiente real.                                                  |
| Prontidão para produção        | **28** | `A21-F05`/`F06` seguem bloqueados externamente; `A21-F20` segue aberto por I1 não aceito. IdP, provider, canal, fonte institucional, signoff, piloto e produção permanecem `NO_GO`.                                                          |

Pesos usados, na ordem da tabela: 8%, 10%, 8%, 12%, 14%, 10%, 10%, 7%,
6%, 6%, 5% e 4%. A pontuação local subiu em relação aos 67/100 da auditoria
de 21/09 porque o candidato `REM21-019` registra correções e uma barra local
mais ampla. Esta é uma reavaliação documental e estática dos bytes atuais;
não constitui nova certificação independente.

## Capacidades do programa construídas

| Capacidade                      |   Nota | Situação observada                                                                                                                                                         |
| ------------------------------- | -----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime e harness de agente     | **79** | Runtime governado single-pass e iterativo, contexto, avaliação de conclusão, limites, journal e composição pública; reuso em segundo produto não está demonstrado.         |
| Atendimento e jornadas          | **81** | APIs e telas para conversas, sessões, tutor/paciente em rascunho, slots, propostas de consulta, tarefas e takeover; dependências externas permanecem simuladas.            |
| Approval, handoff e policy      | **84** | Motor de approval, autoridade durável, reconciliação, handoff e bloqueio de ações sensíveis têm código e provas locais. A autoridade de negócio real ainda requer decisão. |
| Conhecimento institucional/RAG  | **55** | Catálogo versionado local exige publicação e faz handoff sem fonte; nenhuma fonte institucional real aprovada ou recuperação externa qualificada foi observada.            |
| Agent Platform e Control Center | **82** | Agentes/versionamento, prompt, policies, plugins, Test Lab, trace e release candidates têm rotas e UI controladas; publicação operacional depende de gates externos.       |
| Worker e integrações            | **69** | Worker homologado, adapters e providers têm contratos e proteção de egress; perfil produtivo, IdP, canal e provider reais seguem sem qualificação.                         |

## Achados que governam a decisão

1. O pacote `REM21-019` registra `35/35` gates locais `PASS`, candidato
   `8a889682d378c1d3e82a71c079c00390e98307ce4d6e5314f69f02c7c8cf3132`,
   23 achados `CLOSED_LOCAL`, 2 `EXTERNAL_BLOCKED` e 1 `OPEN_INTERNAL`.
   O parecer I1 é `CONDITIONAL_PASS`, sem aceitação final.
2. `REM21-009` concluiu somente preparação documental offline: schema,
   fixtures, matriz de autoridade e 12 casos negativos. O pacote não contém
   endpoint, credencial, owner externo ou aprovação; `G21-5` segue fechado.
3. Resumos derivados de Build e o índice operacional estão defasados perante
   `99_runtime_state`/`30_backlog_master`. Isso cria risco de um leitor iniciar
   pela tarefa errada; os ledgers recentes devem prevalecer até a
   reconciliação desses índices.
4. A separação entre evidência local e operação real está correta: o código do
   worker homologado rejeita `NODE_ENV=production`, e o catálogo RAG faz
   handoff sem fonte institucional publicada. Nenhuma nota autoriza afrouxar
   esses bloqueios.

**Parecer:** `CONDITIONAL_PASS` para a construção local e sintética; `NO_GO`
para produção. A próxima ação sob o programa é reconciliar os índices
derivados com o estado mestre e obter aceitação I1 limpa; qualificação externa
depende de decisão humana explícita sobre `G21-5`.

## Fontes principais

- `docs/00_discovery/0009_discovery_master.md`, `docs/01_prd/0020_prd_master.md`,
  `docs/02_spec/0120_spec_master.md` e seus gates `0090`/`0190`;
- `docs/07_agents/AGENTS.md`, `docs/99_runtime_state.md`,
  `docs/20_master_execution_log.md`, `docs/30_backlog_master.md`;
- `docs/04_audit/0566_comprehensive_repository_audit_2026-09-21.md` e
  `docs/04_audit/evidence/AUD-20260921/REM21-019/`;
- `docs/04_audit/evidence/AUD-20260921/REM21-009/`,
  `certification/phase10-result.json`, `certification/candidate-manifest.json`;
- `.github/workflows/verify.yml`, `apps/api/src/server.ts`,
  `apps/worker/src/homolog-worker.ts`, `apps/web/src/auth/session.ts`,
  `packages/harness/src/iterative-runtime.ts`,
  `packages/rag/src/institutional-rag.ts`.
