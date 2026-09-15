# Agente 2 — AAA-12: cobertura comportamental do canal

C4-F01 foi aprovado independentemente e está fechado. Execute uma única tarefa de qualificação local do AAA-12: eliminar o FAIL do subset do canal e cobrir os caminhos críticos do journal/gateway segundo a barra técnica AAA-04 v2. AAA-12 continua REVIEW, sem DONE.

## Escopo

Leia AGENTS, estado/log/backlog, contrato de qualidade congelado e parecer adjacente. Reserve somente testes em `packages/channel-gateway/src/__tests__/` e evidência própria em `docs/04_audit/evidence/AAA/AAA-12/coverage-hardening/`. Código do produto fica nos hashes aprovados nesta tarefa; se um teste revelar defeito, preserve RED e entregue diagnóstico para o coordenador antes de abrir correção. Sem SQL, migrations, AAA-21, @cvg/shared, package/lockfile, config/limiares globais ou registros compartilhados.

## Aceite e método

1. Reproduza o subset com comando explícito, include de todos os arquivos src do canal e exclusão apenas de testes conforme configuração vigente; grave reports em destino privado. Preserve baseline FAIL, percentuais por arquivo e lista de linhas/branches/funções descobertas. Não selecione apenas arquivos favoráveis ou complemente o subset com testes externos para mascarar o resultado.
2. A partir da evidência de coverage e dos contratos, escreva testes de comportamento observável, com entradas adversariais e controles positivos. Priorize journal memory/file, gateway, erros/timeout, fencing, concorrência, replay, espera/renovação, recuperação/incerteza, canonicalização e isolamento. Adapters externos somente com doubles locais; nenhum envio ou dado real. Não use testes que só chamam funções sem verificar resultados/efeitos.
3. Critérios da barra congelada: statements/lines/functions >=90%, branches gerais >=85%; branches dos módulos críticos do canal/journal >=95%. Relate por arquivo e no agregado, sem compensar arquivo crítico abaixo da barra com outro acima. O primeiro FAIL functions79,61 deve desaparecer; ultrapassar apenas80 não conclui a qualificação. Se algum ramo não for alcançável pelo contrato público, documente com evidência; não remova/exclua o ramo só para subir percentual.
4. Preserve regressões C4-F01, hashes de produto e todos os testes anteriores. Rode o subset, regressões próximas e gates disponíveis apropriados à alteração. Não execute PostgreSQL na instância de outra frente simultaneamente; esta tarefa deve ser local com doubles/file. Não reivindique mutação100%, durabilidade ou G_QUALITY sem suas provas próprias; esses critérios permanecem separados.
5. Registre mapa cenário→invariante→assertion→branch e comando reproduzível. Caso surja defeito ou seja necessário ampliar ownership, entregue bloqueio objetivo com RED e proposta mínima; não relaxe barra nem inicie outra task.

## Entrega

IMPLEMENTED_PENDING_INDEPENDENT_REVIEW (ou BLOCKED com causa objetiva), manifesto de testes e hashes de produto antes/depois, baseline→resultado, coverage JSON/logs privados, diff, comandos/exit codes, limitações. Não altere registros compartilhados, não se autoaprove DONE. O coordenador revisa o resultado e define a próxima tarefa.
