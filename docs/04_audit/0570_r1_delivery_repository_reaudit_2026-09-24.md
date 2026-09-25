# Auditoria AUD29 — entrega M07-S1-R1 e repositório — 24/09/2026

## Escopo e método

Esta auditoria compara o relato do agente com os artefatos R1, o código corrente, o gate C1 e os ledgers CVG. Foram feitas leituras e verificações estáticas de SHA-256; **nenhum teste, scanner, build, coverage, serviço ou integração foi executado nesta rodada**. Os resultados de comandos R1 citados abaixo são declarações do [resultado R1](evidence/AUD-20260923/M07-S1-R1/final-gate-result.md), não uma nova execução. A worktree já tinha 330 entradas alteradas/não rastreadas quando inspecionada e foi preservada.

## Veredito sobre a entrega

**R1 = FAIL / M07-S1 OPEN.** O relato do agente está alinhado com o runtime state, o resultado R1 e o gate C1: nenhum C1 foi iniciado, I1 permanece `UNAVAILABLE` e não existe autorização inferível para executar a correção. O fato de um objetivo conversacional ter sido marcado `blocked` após continuações não muda o estado técnico CVG `WAITING_HUMAN_APPROVAL`; ambos descrevem a mesma dependência humana em níveis diferentes.

| Critério              | Observação verificável                                                                                                                                                                                                                          | Juízo                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Autoridade            | O pedido C1 tem SHA-256 `9d865f7db78b479dacaf69ca2de7dffcc03892eff061dd49ca90ec2035eb83f1`; o preview vinculado tem SHA-256 `9d7fc894b728967aaa4f0949bc5dc8ae466d31ecc616fe9a902a58859ebb0c17`. Não há registro de aprovação C1.                | Gate pendente; código/testes C1 não autorizados.                                                                                    |
| Integridade R1        | O manifesto tem 977 inputs; 977/977 arquivos atuais conferem com seus hashes. `sha256(stableStringify(fingerprint_basis))` reproduz `1038f996b0577e56ecd795f1f08b6e13bb3a752d454c80f3fc0601f51c045b5f`; o relatório contém o mesmo fingerprint. | Evidência estática forte de preservação do candidato. Não prova por si só os exit codes históricos.                                 |
| Inventário            | Relatório R1: 25 owners, 814 fontes, 206 arestas, 11 findings (9 `DEPENDENCY_CATEGORY_MISMATCH`, 2 `MISSING_DIRECT_DEPENDENCY`), zero gaps/unresolved, exit 1.                                                                                  | B3 `PASS_WITH_FINDINGS` na semântica aprovada; conformance de manifests continua aberta para S4.                                    |
| B6                    | Resultado R1 registra 24 testes focais passaram/1 falhou; suíte 2.136 passaram/146 ignorados/1 falhou; typecheck e lint passaram. Coverage saiu 1 por falha de teste e não produziu percentuais aprováveis.                                     | B6 `FAIL`. Os percentuais do run anterior não podem ser reciclados como coverage R1.                                                |
| Causa do teste        | O fixture corrente em `postgres-store.unit.test.ts` cria `sessionRow()` sem `pendingProposal`/`pendingApproval`; `assertExecutionClaimFresh` exige ambos para `approvalResume` autenticado. O preview C1 fornece os vínculos pendentes.         | Hipótese causal consistente por leitura; só o gate C1 e testes autorizados podem confirmá-la dinamicamente.                         |
| I1                    | `i1-attempt-02.md` registra recusa `agent thread limit reached`; nenhum parecer I1 foi produzido.                                                                                                                                               | `UNAVAILABLE`, jamais PASS independente.                                                                                            |
| Evidência de comandos | A pasta R1 contém resultado consolidado, manifesto, report, npm version e rollback, mas não contém logs brutos ou arquivo estruturado de exit code/duração por comando como `M07-BUILD-S1/command-records.json`.                                | Limita auditabilidade independente dos resultados declarados; o próximo run deve persistir registros por comando sem reescrever R1. |
| Fronteira             | Diretório `M07-S1-R1-C1` ausente; SHA do teste atual igual ao manifesto R1 (`26465125…cef66`).                                                                                                                                                  | Nenhuma execução C1 observada; M05, S2/S3/S4 e produção continuam fechados.                                                         |

O [pedido C1](evidence/AUD-20260923/M07-S1-R1/correction-gate-proposal.md) já é um pacote concreto para decisão humana. Não o editar: qualquer mudança em seus bytes exigiria novo SHA e nova decisão. O pacote prevê um único arquivo de teste, novo diretório de evidência, Node 22.23.2, checks e revisão I1. A correção do fixture continua proposta; não foi aplicada.

## Nova avaliação do repositório

Escala: 0 = ausente; 50 = parcial; 75 = demonstrado localmente; 90 = robusto no escopo controlado; 100 = qualificado para o uso pertinente. Notas são estimativas de maturidade e não substituem gates binários. Média simples das 11 dimensões locais abaixo = **78/100** (77,6 arredondado). Prontidão para produção = **28/100, NO_GO**.

| Dimensão                       | Nota | Base e limite                                                                                                                     |
| ------------------------------ | ---: | --------------------------------------------------------------------------------------------------------------------------------- |
| Documentação e governança      |   72 | Gate C1 rastreável e ledgers reconciliados; índices ainda expunham A24-04 como “próxima etapa” histórica sem marcação suficiente. |
| Arquitetura e modularidade     |   76 | 25 owners inventariados; fronteiras públicas e 11 relações de dependência permanecem abertas.                                     |
| Qualidade do código            |   78 | Fingerprint R1 agora é reproduzível; fixture de retomada incorreto mantém regressão focal.                                        |
| Testes e avaliação             |   78 | R1 falhou em teste focal/suíte; coverage sem percentual válido; 146 testes ignorados no resultado registrado.                     |
| Segurança e privacidade        |   80 | Política fail-closed observada no contrato de retomada; sem qualificação externa nova.                                            |
| Dados, transações e migrations |   88 | Evidência local histórica permanece; esta auditoria não executou banco nem restore.                                               |
| Confiabilidade e concorrência  |   82 | Provas locais anteriores preservadas; sem prova operacional nova nesta rodada.                                                    |
| Observabilidade                |   74 | Sem evidência nova de SLO, alerting/paging externo ou telemetria em operação.                                                     |
| Frontend e UX                  |   83 | Nenhum novo ensaio com operador ou alteração visual auditada.                                                                     |
| CI, certificação e release     |   76 | Node 22 e fingerprint R1 corrigem duas lacunas anteriores; B6/I1 falham e scanner ainda não é gate CI aceito.                     |
| Prontidão operacional          |   67 | Runbooks e snapshots locais; ambiente/identidade/canais externos ainda não qualificados.                                          |

Esta é uma reauditoria dirigida, não inventário integral dos mais de 3 mil arquivos em `docs` nem recertificação do produto. O repositório continua com mudanças preexistentes numerosas. `package.json` exige Node `>=22 <23`, `.nvmrc` fixa `22.23.2` e o workflow `verify.yml` usa `.nvmrc`; isso sustenta a escolha Node 22 para C1. Os thresholds em `vitest.config.mts` permanecem 90/85/90/90. G21-5/G21-6 continuam fechados; não há dado real, ação sensível ou liberação de produção autorizada.

## Achados e nova rodada

1. **A29-F01, alta:** R1 falhou no fixture de aprovação, bloqueando B6 e coverage; tratar por A24-03-C1 somente após aprovação exata do gate já proposto.
2. **A29-F02, alta:** R1 não tem logs/registro estruturado dos comandos na pasta de evidência; exigir proveniência por comando no próximo candidato e separar resultado declarado de replay independente.
3. **A29-F03, alta:** coverage R1 não possui percentuais aprováveis; medir somente em execução C1 autorizada, diagnosticar eventual déficit por arquivo e pedir novo gate se outra edição for necessária.
4. **A29-F04, alta:** I1 continua indisponível; preparar pacote legível e rota de revisor independente, sem transformar indisponibilidade em aprovação.
5. **A29-F05, média:** 11 findings visíveis ainda requerem contratos/manifestos por lote M07-S4; nenhum deles pode ser apagado por exceção genérica.
6. **A29-F06, média:** navegação herdada aponta A24-04/R1 como próxima etapa; atualizar índices correntes sem alterar o histórico.
7. **A29-F07, média:** scanner ainda fora do CI bar aceito; integrar só após S1/S4 e perfil de conformance fechados.

O [roadmap 0346](../03_build/0346_aud29_roadmap.md), [backlog 0347](../03_build/0347_aud29_backlog.md) e [handoff 0348](../03_build/0348_next_stage_c1_decision.md) detalham dependências, gates, evidências e a próxima ação singular. Eles são delta de A24 e da carteira original de 50 melhorias, sem duplicar a autoridade dos gates existentes.
