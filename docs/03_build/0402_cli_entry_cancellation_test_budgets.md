# 0402 — Cancelamento da entrada CLI: fase correta e oráculo negativo

Task `GBRAIN-LOOP-CLI-CANCEL-20261023`, T2 somente teste. Fonte9a56.
A suíte ampla da candidata559c34a7 terminou7117PASS/2FAIL/zeroSKIP, ambos em
`tests/claude100/reference-port/cli-entry.test.js`; o monitor54PASS. Falhas e logs
originais preservados no pacoteGBRAIN-LOOP/u13. Nenhum código de runtime foi
identificado como defeituoso por esses dois asserts.

## Recon e regra preservada

O teste inicia um watchdog3000ms antes do freezeHostGraph (20fontes/pins/fsyncs),
mas só depois de um marker em import do controller pode enviarSIGINT/SIGTERM.
Duas repetições isoladas passaram;6diagnósticos no mesmo CLI imutado/fixture
inert morreramSIGKILL antes do marker/sinal. Com janela de observação12000ms
(apenasdiagnóstico), o marker apareceu4019/4408ms após spawn e os sinais reais
encerraram em567/661ms, código1/semcontroller/semresíduo. Isso comprova que
3000ms pode expirar na preparação; não atribuir automaticamente cada sintoma
original à mesma causa nem chamar o runamplo dePASS.

A SPEC0235 preserva cleanup separado≤5s e a segurança da cópia/pins. O teste
não deve substituir esse prazo por um watchdog que termina antes da precondição.
GateT2 interno: task/SPEC curta registrada, sem mudança de contrato público,
segurança/policy ou prazo de produção. Nenhum BUILD de aplicação, nova capability
ou operação de Claude/Docker/canal é autorizado.

## O quê e como

Mudar só cli-entry.test.js numa candidata própria, nunca os2355inputs do certify
ativo. Manter Node22/Linux, fs/proc reais, mesmas20fontes e cópia doCLI byteidêntica
nos positivos. A preparação deste caso usa diretório exclusivo0700 sob `/dev/shm`,
com statfs exigindo TMPFS_MAGIC (0x01021994). Ela é um snapshot volátil, removido
no fim, e o oráculo exige ausência de publicação; persistência em disco e tempo
físico de bootstrap não são propriedades que este teste comprova. Os mesmos
20arquivos, fsyncs, FDs, metadados, /proc e sinais continuam reais. Cenários que
exercitam publicação/durabilidade e seus diretórios não são alterados por este
patch. Ausência de tmpfs é falha de precondição, nunca skip/fallback silencioso.
Não montar/remontar nem apagar diretórios de terceiros; só mkdtemp próprio e
remoção desse diretório após os asserts. O limite8/5/15 permanece literal.

RevisãoR1 independente:2negativosPASS/2positivosFAILantesdomarker aos8.63/8.33s,
sem falha de cancelamento provada. Isso e as falhas anteriores ficam preservados;
o único retrabalho qualifica esta preparação volátil, sem aumentar deadline.

Substituir espera500ms do controllerinert por um import suspenso
até observar o sinal real, com listener instalado antes do marker. O latch daCLI
deve impedir runProbe depois que o import terminar. Não executar controllerreal.

Separar watchdog de precondição8000ms (marker ausente falha comoBOOTSTRAP) e
watchdog de cancelamento5000ms iniciado ao enviar o sinal (falhaCANCELLATION).
GlobaltestTimeout15000ms permanece:8000+5000 deixam2000 para setup/teardown;
se esse envelope for insuficiente, registrar falha real, não retry/skip/aumentar
silenciosamente. Medir o intervalo sinal→exit e exigir≤5000ms, código1, signalnull,
stdoutvazio, erroNativeport, nenhuma execução do controller/resultado publicado
ou diretório debootstrap restante. Fechar watchers/timers e somente filhos próprios.

Como o fixture também observa o sinal para liberar o import, adicionar um controle
ruim explícito: na cópia sintética apenas, remover a verificação de cancelamento
logo após o import. Esse CLIbad deve chegar ao runProbeinert e deixar marker
proibido, mesmo que o exitcode também seja1. Provar paraSIGINT eSIGTERM; não
aceitar sócódigo1 como detecção. A cópia ruim não é descrita como byteidêntica.

## Aceites congelados

| ID   | Prova                                                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| CE01 | PositivosSIGINT/SIGTERM executam CLI byteidêntico em checkout exclusivo e marker pré-sinal é realmente observado                              |
| CE02 | Sinal→exit≤5000ms, código1/signalnull/erro esperado; semcontroller/probe/bootstrapresíduo                                                     |
| CE03 | Precondição8000 e cancel5000 são fases diferentes, watchdog expirar nunca éPASS, global15s/semretry/skip intactos                             |
| CE04 | CLIbad semguard pós-import executa controllerinert/marker, detectado emambossinais; não mascarado pelo fixture                                |
| CE05 | Sóteste alterado; CLI/bootstrap/0235/lock/manifests/catálogos/demaisfontes byteidênticos                                                      |
| CE06 | Focais e regressão plausível, type/lint/formato/diff verdes, revisão fresca dosoráculos; fullunit/certfuturos não recebemPASS por subconjunto |

## Validação e continuidade

Executar2positivos+2controlesruins em recursos próprios, depois testes de entrada/
bootstrap conexos; semcomando deprobe nativo real/contêiner/modelo. Preservar
comparação da origem, oráculos de código/efeito/cleanup, logs/JSON/hashes e
limites do ensaio. Crítico distinto revisa código e reaiscontroles; globalqualificação
continua aberta até barra completa no candidato composto e integração autorizada.
Consulta/registroGBrainpor etapa; deltas dosledgersocupados nohandoff próprio.
