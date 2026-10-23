# SPEC0260 — Verify da main sem cancelamento por novas revisões

Task CLOSE-CI-LOCAL-20261023, subunidadeC01. T2 de agendamento; pedido do usuário parafecharcancelamentosdeCI. Não muda fontesexecutadas, contrato público, identidade, policy, aprovação, nomes dechecks, proveniência oulimiar. Fonteobservada9a56.

## Problema e WHAT

Hoje .github/workflows/verify.yml agrupa porPR ouref e cancel-in-progress:true. Novospushesmaincancelamrunemcurso; mesmo cancel-in-progress:false comgroupcompartilhado permite substituirrunpendente. Cada pushmain precisa grupo único; revisões do mesmoPR continuam supersedendoanteriores.

## HOW

Grupo `verify-${{ github.workflow }}-${{ github.event_name }}-${{ github.event.pull_request.number || github.run_id }}`. Cancelamento `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. Workflow só recebe pull_request e pushesmain/master; portanto PR comnúmeroestávelagrupa, pushcomrun_idúniconãocolide. Mudar sóessasduaslinhas easserçãoexistente do contrato deworkflow.

## Aceite e prova

1. Dois pushesmain comrunIDsdistintos têm gruposdistintos; cancelamentofalse. Masterigual.
2. Duasrevisõesdo mesmoPR têmgrupoigual e cancelamentotrue. PRsdistintosnãocolidem.
3. Gates, steps, permissões, comandos, outputs e timeout iguais àbaseline. Testeexistente decontrato ajustado e regressões deCI/proveniência/verificador nativosverdes.
4. Semcancelarrunsatuais. NovaCIqualificaHEADdestePR; Verifyrealmain sófecha apósmerge protegido e runmainfinalSUCCESS, não porassertlocal.

## Riscos e compatibilidade

Maisrunsmainpodemexecutaraomesmotempo; custo/filanãomedidos. Corridas depublicação continuamcontidaspelogatederelease e tagimutável. NenhumPASStransferidoentreSHA. Rollback=novareversãododiffporPR, semcancelamento manual dosruns emcurso. NãoalteraworkflowSecurity/produto/release.

## Gate

Taskregistrada eSPECcurta antesdecódigo pela trilhaT2 D12; nãoexigeT3nova porseragendamentosemcontratodesegurançamodificado. Autorevisãotécnica echecks focaislocais; barracompletaNode22/PG/E2E/certify emCI antesdeintegração, comclaimpróprio remoto. Semaceitedeprodução.

## Fonte de semântica GitHub

[Controle de concorrência](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) e [sintaxe de workflow](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax), consultados em23/10/2026. Grupos distintos permitem manter cada run; `event_name` separa os espaços de nomes numéricos de PR e run.

## Composição aprovada de timeout

A candidata começa na base9a56 e carrega o commit4cfd9dbb do PR24 (150min, decisão humana já existente) antes do delta de agendamento. Esse ajuste não é nova decisão deste cartão. A qualificação final considera o HEAD composto exato.
