# F01 /0277 — implementação local

Normalização passa a validar sandbox como propriedade própria de dados, sem executar getter, e preserva os4modos nãoNONE antes do fingerprint. Ausência/undefined/NONE continuam omitidos, com o fingerprint legado98f036d6… idêntico. Lista/resolução/adapters existentes propagam o mesmo descriptor ao gate nativo; não foi criado outroenforcement ou alterado contrato público.

- 3REDoriginais dafase1agoraPASS. Matriz com4modos,2perfis reais e6resultados de gate; total69controles novos.27regressões de registry/seam:96/96PASS,0skips/expectedfails nos3arquivos.
- 5mutaçõesmortas: perdermodo, aceitarinválido, invocargetter, preservarNONEnohash e perdermodo noadapterexecutável. Todosrestaurados; receipts/logsJSONemf01.
- Node22.23.2: typecheck0/103.321s<120, lintfocal0/48.419s<60, testesfinais0/4.389s, formatter0. Carga dohost23explica apenas observação de lentidão, semtimeout/capraise/retrytest.
- Primeiroensaio da matriz usava perfiliterativo semorchestrator/stepStore e24checks paravamSTATE_CONFLICT antesdogate. Registro preservado, fixture corrigida parafábricapública+runtimeiterativo reais; novos96verdes. Nãoatribuir essas24falhas ao normalizer nem usar comoREDcausal. Os3REDoriginais e as5mutações atuais dão provas causais.

Somentecapability-boundary.ts foi alterado entre arquivos jáexistentes; lock/sourcepreimages restantes preservados. SPECs/REDtests aprovados importados da94987a47 paraesta base63fc; novosinputs possuemSHA no task.

Implementação verificada localmente, revisão independenteClaude eaceite/CI pendentes comDF. Não fecha0222gerenciado, X01,F02,F05 ouprodução. Sempublicação/PG/Docker/E2E/fullsuite.
