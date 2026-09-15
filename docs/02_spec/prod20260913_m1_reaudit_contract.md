# PROD-20260913 — adendo de reauditoria M1

Data: 13/09/2026. Escopo: correções locais reversíveis solicitadas pelo usuário na reauditoria da entrega. Contrato anterior preservado em `prod20260913_m1_corrections_contract.md`; este adendo explicita casos de falha das mesmas invariantes, sem selecionar D01 nem ampliar autoridade de efeitos. Tasks existentes PROD-02/03/05/06 e AAA-22 serão reabertas apenas quando evidência corrente contradizer seu aceite.

## Barra e autoridade

Nenhum novo recurso externo, segredo, dado real, canal ou ação sensível. Candidato inicial identificado em manifesto independente. O usuário solicitou auditoria, atualização documental e próximas etapas; esta rodada corrige falhas locais demonstradas no escopo M1. Não concede produção, alteração do RF-011 ou homologação. Revisão independente após as correções é obrigatória para fechar o lote. Estados VERIFIED anteriores permanecem históricos no seu snapshot.

## RA-M1-01 — readiness deve falhar também quando o timeout destrói a conexão

Task AAA-22; owner líder; arquivos apps/api/src/server.ts, readiness.ts e testes de readiness. Probe independente: client.query rejeita quando release(error) destrói o cliente aos900ms; catch retorna sem erro, e /ready responde200 antes do timeout externo1s.

Aceite: conexão/admissão/query tardia ou falha nunca vira sucesso; /ready503 e /live200. Limitar timeout incluindo espera de pool.connect; múltiplos probes não acumulam admissões enquanto uma aquisição está pendente; cliente tardio é destruído uma vez. Timeout não deve devolver conexão ocupada ao pool. Erros são redigidos, timers limpos. Testes de sucesso, erro, rejeição após destruição, resolução tardia e aquisição bloqueada, com limite temporal controlado.

## RA-M1-02/03 — geração da jornada deve incluir sessão e limpar formulário

Task PROD-03; owner builder UI exclusivo; arquivos apps/web/src/features/journeys/index.tsx e testes da jornada. Client API somente se necessário, sem alterar contrato de autorização.

Aceite: tenant/ator/role/sessão/logout invalidam sucessos, erros e finally pendentes; request obsoleto é abortado, estado busy limpo. Dados digitados pertencentes à identidade anterior, inclusive patientName, não reaparecem quando a próxima identidade cria draft. Mudança de sessão deve limpar drafts/associações para impedir tarefa da sessão B ligada ao contexto A. Neutralizar a correção deve fazer os testes falharem. A busca atual autorizada continua funcional. Sem redesign nem ativação de fonte/canal real.

## Procedimento comum

1. Preservar reproduções independentes RED no candidato inicial e congelar este adendo antes das alterações.
2. Registrar task REWORK e arquivo exato antes do BUILD; nenhuma edição concorrente de server.ts/persistência/exports.
3. Implementar correção mínima; repetir os negativos e a regressão pertinente em Node22 com banco sintético descartável onde necessário.
4. Crítico fresco, distinto do builder, verifica artefatos e sentinel. Não reescrever manifests antigos para fazê-los corresponder ao código novo: produzir evidência sucessora.
5. Atualizar status, relatório, runtime/log/backlog com escopo/limitações; D01 pendente mantém PROD-04/AAA-06/21 bloqueados nos respectivos gates.

Rollback: somente diff desta rodada e quando reversível; preservar trabalho anterior. Não apagar dados ou evidências. A alteração de byte invalida aceites do candidato anterior; não reemitir selo global a partir de testes focados.

## RA-M1-04/05/08 — tarefas auditáveis e transação limpa

Tasks PROD-02/06, owner builder persistência. Evidência independente real PostgreSQL: tarefa HTTP persiste apesar de trigger de auditoria rejeitar; contexto confiável é descartado; duas inserções concorrentes iguais geram 25P02. Aceite: tarefa e evento de auditoria atômicos, ator/correlação confiáveis, replay concorrente retorna a mesma tarefa e um evento, paridade memória/PostgreSQL; regressões discriminantes. Corrigir recuperação de conflito sem consulta em transação abortada. Verificar reset do tenant também após rollback; resultado de verificação ausente ou não limpo destrói cliente. Este último caso é modelo de falha sintético, sem alegação de falha normal do PostgreSQL. Arquivos de persistência e seus testes; não editar server.ts.

## RA-M1-06/07 — preflight exige política efetiva e privilégios completos

Task PROD-05, owner builder worker. Evidência SQL real: política permissiva adicional permite tenant A ler B e passa preflight; revoke em outbox_effects também passa. Aceite: validar políticas esperadas de isolamento nas tabelas consumidas, rejeitar ampliação permissiva e privilégios ausentes nas tabelas efetivamente necessárias antes do claim; papel mínimo válido continua passando. Usar contrato SQL/migrations existente como fonte; não inventar política nova nem autoridade. Arquivos worker preflight e testes exclusivos.
