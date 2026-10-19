# SPEC0235 — Probe contido da porta nativa do Claude

Task `C100-Q01-REF-PORT-001`, vinculada a C100-Q01/G04, preparação18/10/2026.
Trilha **T3**, segurança/identidade de execução e observação do cliente nativo.
Estado `DRAFT_FOR_INDEPENDENT_REVIEW / HUMAN_T3_REVIEW_PENDING / BUILD_NOT_AUTHORIZED`.

## Problema e vínculo com o programa

[PRD0029](../01_prd/0029_claude100_initial_qualification.md) exige captura real
da referência e M1. O mecanismo [0229](0229_claude100_initial_qualification.md)
está qualificado localmente; nenhum cliente Claude com prompt foi executado
por ele. A aprovação0229 exclui um driver presumidamente keyless. Este contrato
propõe descobrir uma porta local observando o binário real sob contenção, com
uma resposta HTTP de erro finita; não pressupõe que ele aceite essa configuração.

O [recon](../04_audit/evidence/CLAUDE100-EXEC-20261017/reference-driver-recon/README.md)
confirmou os mesmos bytes2.1.302 e encontrou configurações de origem HTTP.
A ajuda capturada declara `--bare`, `--print`, `--tools ""`, configuração MCP
estrita, settings explícitas e saída JSON. Declaração e strings não provam uso
da porta, autenticação aceita, isolamento ou ausência de efeitos.

Este probe não compara CVG, não fornece modelo, não responde semanticamente ao
prompt e não produz uma captura funcional apta ao comparador. O resultado
pretendido é uma observação verificável de POST nativo ao endpoint esperado,
ou um resultado honesto de porta não observada/bloqueio/infraestrutura.

## Escopo e pré-condições

Após aprovação humana desta SPEC exata, implementar somente
`tests/claude100/reference-port/**` e `scripts/claude100-reference-port.mjs` em
candidata própria. Sem root package/lock, instalação, atualização do Claude,
mudança em runtime/SDK/provider, produto, policy/approval ou schema público.
Reusar parser estrito/canonicalização já qualificados; não copiar normalizador.
Erro primário e cleanup devem permanecer na mesma cadeia de causas.

Antes de executar o alvo: kitQ03 e mecanismo0229 qualificados; suporteQ04
qualificado no mesmo conjunto de fontes se seu helper for importado; código do
probe congelado e revisto independentemente. Nenhuma execução nativa com prompt
antes de aprovação T3 e dessa revisão de código. Testes unitários do controlador
podem usar respostas Docker falsas declaradas; controles positivos de contenção
e porta exigem observações reais dos contêineres e do binário selecionado.

## Identidades fixas desta unidade

Os hashes foram lidos de arquivos selecionados, sem executar o Claude.
[Inventário](../04_audit/evidence/CLAUDE100-EXEC-20261017/reference-driver-recon/toolchain-static.json).

| Papel                   | Caminho/identidade                                                        | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Claude2.1.302           | `/home/ricardo/.local/share/claude/versions/2.1.302`                      | `60d7eb7f12fbb28a52533fe8be5884097403562aa02dc73991a021c7067e29a5` |
| Node22.23.2             | `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node`                      | `3517c2df0b2f8cd7f422b4b8450ef81c6889f08eb03e281d6de9079b15e6a327` |
| Docker CLI              | `/usr/bin/docker`                                                         | `7ed12b00293d64742419a6601ae97960a367a0ce97c88b06e3278cc0a409557b` |
| Imagem pública já local | `sha256:f1c3376c26f2609ab9f29f71f824103fe2fcd8ee0346485cb6122a4f93df6f94` | ID de conteúdo Docker, sem pull                                    |

Compatibilidade ELF/Node com a imagem não foi executada. Ausência, hash diferente
ou dependência incompatível bloqueia a execução; não baixar imagem, biblioteca,
engine ou nova versão automaticamente. Nenhum Ghidra/IDA/Hopper é requerido para
o probe. IDs, caminhos, perfil ou binário diferentes exigem revisão do contrato.

## Contenção e separação do coletor

Dois contêineres efêmeros próprios, criados por IDs novos com labels da task e
runId; comandos `execFile` com argv fixo, sem shell. O observador usa Node,
rede `none` e HTTP127.0.0.1:porta0. O cliente compartilha somente a rede do
observador (`container:<ID próprio>`), preservando PID/IPC/mount namespaces
separados. Não publicar portas ou conectar bridge/host/overlay.

A documentação descreve rede `none` com apenas loopback e compartilhamento de
pilha por `container:`; isso orienta o desenho, não prova a estação.
[Docker none](https://docs.docker.com/engine/network/drivers/none/),
[container networks](https://docs.docker.com/engine/network/#container-networks).

Ambos: UID/GID1000:1000, rootfs somente leitura, `cap-drop=ALL`, no-new-privileges,
sem privileged/devices extras/docker socket/host PID ou IPC; cgroupns private.
PidsLimit64, nofile256,
CPU1 por contêiner; cliente768MiB e observador192MiB. Scratch/tmp são tmpfs
privados com limite agregado128MiB, nosuid/nodev/noexec, UID/GID1000 e modo0700.
A imagem declara /var/lib/postgresql/data; sobrescrever esse destino por bind
readonly de diretório próprio vazio com inventário vazio pinado, sem volume
anônimo. InspectMounts deve conter somente os binds declarados e tmpfs, nenhum
volumeRWadicional. Scratch cliente96MiB e observador32MiB totalizam128MiB.
Somente binários aprovados, bundle estático do probe/helpers e fixtures
sintéticas entram por mounts readonly. Nada do perfil real, repositório inteiro,
secret store, config real, workspace de outro agente ou saída host RW é montado.

O observador e o cliente iniciam primeiro wrappers Node confiáveis, sem iniciar
o Claude. O host confere os Docker inspect reais (IDs, labels, imagem, mounts,
User, recursos, readonly, CapDrop, SecurityOpt e namespaces) e preflight real dos
wrappers: UID, PID1, inodes PID distintos, inode de rede igual, interfaces/rotas
somente loopback e ausência de marcador sintético host que não foi montado.
Sem testes TCP contra destinos externos. Configuração impossível, campo ausente
ou divergente dá `BLOCKED_CONTAINMENT`; não usar fallback host/bridge.

O host só envia `START_NATIVE` para a fase de versão depois dessas verificações;
`START_PORT` exige versão encerrada e observador armado, conforme protocolo abaixo. Observador fica em outro namespace PID e não compartilha
diretórios ou stdout com o Claude. Request observado vem do callback HTTP desse
coletor protegido, não de texto impresso pelo alvo. O host captura pipes
separados do observador e cliente e escreve evidências fora dos mounts deles.

O controlador usa Docker local via unix socket preexistente e configDir vazio
próprio, com imagem local e pull=never. Não herdar contextos remotos, login helpers
ou credenciais. Criação/inspect/start/stop/remove somente dos IDs criados por
esta execução e conferidos pelos labels; nunca listas globais ou nome parcial.
O nome usa prefixo da task/role e16hex de hash(runId+nonce), abaixo de64bytes;
IDs e nonce não vêm do cliente. Hashes e stat dos binários são conferidos antes
da criação e depois do encerramento, mantendo handles durante a observação.
Drift invalida o resultado; isso não é atestação criptográfica da imagem carregada
nem proteção contra alteração host maliciosa entre as duas leituras.

## Entrada, ambiente e invocação fechados

CLI: `--manifest`, `--evidence-root`, `--out`, cada uma obrigatória uma vez,
sem posicionais. Manifesto JSON fechado: `{version:1,runId,fixtureId}`;
fixtureId literal `NATIVE_PORT_503_V1`, runId ASCII alfanumérico/underscore/hífen
de1–64caracteres. Arquivo64KiB, JSON estrito UTF-8/profundidade16/string4KiB,
sem duplicatas/campos extras. Não aceitar comando, módulo, URL, imagem, perfil,
credencial, diretório de mount ou prompt vindo do manifesto.

O input semântico único é o texto literal `CVG_SYNTHETIC_NATIVE_PORT_PROBE_V1`,
fornecido por stdin fechado após os bytes. Workspace sintético contém apenas
settings `{}` e MCP `{"mcpServers":{}}`, readonly; cwd `/workspace`. Wrappers
passam ao alvo env construído explicitamente: PATH da imagem, LANG=C.UTF-8,
TZ=UTC, HOME/CLAUDE_CONFIG_DIR sob scratch e ANTHROPIC_BASE_URL calculada como
`http://127.0.0.1:<porta observada>`. ANTHROPIC_API_KEY é somente o literal
`cvg-synthetic-native-probe-v1`. Sem spread/snapshot de env host no cliente,
sem OAuth, helper de chave, tokens/cookies reais ou proxy env.

Args nativos fixos: `--bare --print --output-format json --tools ""`
`--no-session-persistence --strict-mcp-config --mcp-config /workspace/mcp.json`
`--settings /workspace/settings.json --setting-sources ""`. Strings vazias são
elementos argv reais. Não usar skip-permissions ou flags não declaradas.
No máximo duas execuções sequenciais do binário, sob fases fechadas abaixo: primeiro `--version` deve
confirmar2.1.302; depois o probe. Nenhum comando impresso pelo alvo é executado.

## Observação HTTP e limites

O observador responde sempre503 com JSON de erro sintético fixo, sem redirect,
modelo, upstream, proxy ou handler controlado por dados. Limites:4requests,
512KiB por body/2MiB total, headers8KiB, stdout e stderr nativos1MiB cada,
artefatos agregados8MiB. Sem truncar e declarar completo; cap excedido termina
como falha explícita. Nenhuma compressão é descomprimida nesta unidade.

Antes de persistir body, conferir auth: somente x-api-key com o sentinel exato,
ou ausência de auth em requests não elegíveis a prova; outro auth/token/cookie
descarta body/valores e registra apenas uma violação não sensível. Auth nunca é
persistida. Requests elegíveis precisam POST, pathname `/v1/messages`, query
vazia ou exatamente `beta=true`, sentinel verificado e body dentro do limite.
Outras rotas recebem o mesmo erro finito, com pathname classificado como
UNSUPPORTED_PATH e sem gravar URL/query arbitrários. Nada vira instrução de replay.

O probe registra bytes brutos elegíveis, hashes, ordinal, monotonic timestamps,
content-type/content-encoding classificados e relação temporal com START_NATIVE.
JSON do body só é interpretado pelo parser estrito; formato não reconhecido ou
comprimido permanece opaco/incompleto. A presença do marker é check separado e
nunca é inferida de texto livre. Somente POST na fase `port`, armada após a versão, pode contar.

O sucesso desta unidade requer pelo menos um request elegível com resposta503
concluída localmente e todos os controles obrigatórios íntegros. A
rejeição503 é deliberada: exit/status/stdout do cliente são registrados como
observados, não convertidos em execução funcional bem-sucedida. Falta de porta,
auth recusada antes do request, erro de compatibilidade ou timeout mantém o
estado real; não procurar credencial real ou modificar o executável para passar.

Prazo20s para o cliente,30s total do controlador, cleanup separado≤5s. SIGTERM
seguido de SIGKILL/stop próprio em prazo finito, sem repetir efeito incerto ou
matar processo alheio. Cancelamento também fecha observador, sockets, timers e
ambos IDs próprios; erro primário e todos erros de cleanup ficam acessíveis.
Remoção não confirmada gera handoff explícito e falha; não há garantia de cleanup
incondicional durante indisponibilidade do daemon.

## Resultado e autoridade

Saída exclusiva nova sob evidence-root privado próprio; negar traversal,
symlink/arquivo especial e overwrite. Mantém brutos parciais como falha,
inventário de hashes e relatório fechado. Nenhum arquivo host de saída entra
no cliente/observador. Resultado parcial não pode aparecer como relatório
publicado, usando protocolo de publicação após IO/cleanup qualificados.

Reportv1 fechado: version, runId, fixtureId, verificationClass literal
REFERENCE_RECON_ONLY, status, exitCode, toolchainDigests, driverSha256,
profileSha256, containmentChecks, observations, nativeExecution, artifacts,
limitations, reviewStatus literalPENDING. status enum PORT_OBSERVED,
PORT_NOT_OBSERVED, BLOCKED_CONTAINMENT, INVALID_INPUT ou INFRA_FAILURE;
exit0somentePORT_OBSERVED, demais1, usoCLIinválido2. Sem campo PASS_CURRENT,
índice de confiança ou recibo funcional compatível com0229.

toolchainDigests tem somente expected e observed; cada um contém claudeSha256,
nodeSha256,dockerSha256,imageId. expected são os valores fixos acima, observed
são digest/ID conferidos ou null se ainda indisponíveis. driverSha256 e
profileSha256 são digests ou null se não calculáveis. runId e fixtureId podem
ser null somente na rejeição de input; verificationClass permanece fixa.
containmentChecks são `{id,status:PASS|FAIL|NOT_RUN,message≤512,artifactPaths}`; observations
são `{ordinal,method,path,bodySha256,bytes,markerVerified,encodingKnown,offsetMs,bodyPath,eventPath,responsePath,contentType,contentEncoding}`:
ordinal0–3, method literalPOST, path literal/v1/messages, digest/bytes de body
elegível0–512KiB, booleans e offsetMs inteiro0–35000. Contagem de rota/auth
rejeitadas fica em checks sem valores sensíveis. nativeExecution tem somente
versionObserved (2.1.302ou null), versionProbe e portProbe, cada probe com
startedAt/endedAt UTCou null se não iniciado, exitCode inteiro0–255ou null,
timeoutboolean e signal do conjunto fechado de sinais Linux definido abaixo ou null. Não inferir código do nativo de
texto livre ou do código de saída do wrapper; se não observado, fica null com
limitação. artifacts são `{role,path,sha256,bytes}`, preservando a ordem; brutos
nunca executados. Limitations não vazia inclui porta-only/erro503 deliberado,
SDK/protocolo ainda não qualificados e nenhum resultado de paridade.

Falha de manifesto/entrada/hash/cap de input→INVALID_INPUT; preflight ausente/divergente→
BLOCKED_CONTAINMENT antes do alvo; falha de toolchain/IO/cleanup/limite de
execução/cap durante observação→INFRA_FAILURE; execução íntegra sem POSTelegível→PORT_NOT_OBSERVED;
somente observação íntegra sob todos controles→PORT_OBSERVED. Checks de dependentes não executados ficam NOT_RUN; cleanup/DRIFT e publicação
são avaliados quando alcançáveis mesmo após falha, sem inventar PASS. Nenhum relatório autoriza M1 ou fecha requisito do catálogo.

## Vínculo de bytes e inventário obrigatório

`SHA(x)` sempre usa bytes integrais. `C(x)` é JSON canônicoUTF-8 do kitQ03,
sem newline, chavesUTF-16 e valores JSON finitos. Antes de Dockercreate, copiar
para snapshot privado exclusivo todos os insumos e consumir somente esse
snapshot: manifesto raw, stdin literal sem newline, settings/MCP exatos,
controlador/CLI, wrappers/observador e toda closure de helpers importados.
Imports dinâmicos/resolução fora da closure são proibidos; builtinsNode vêm de
allowlist fixa incluída no perfil. Máximo256fontes/1MiB agregado; a closure e
cada path relativo são revistos no código congelado antes do alvo.

`bundle-inventory.json` tem versão1 e entries `{path,sha256,bytes}` ordenadas
por pathUTF-16, sem duplicatas; cobre todas essas fontes, fixtures e templates
fixos de argv/env/settings/MCP/stdin. Não inclui a si mesmo, relatório ou o
manifesto fornecido pelo usuário. `driverSha256=SHA(C(bundleInventory))`.
Cada entry resolve aos bytes retidos sob `inputs/bundle/`, cujo digest/tamanho
é conferido antes/depois da cópia, antes do alvo e após cleanup. Alteração no
arquivo original depois da cópia também invalida o run; manter handles e
conferir path/stat/digests no fechamento, sem promessa contra host malicioso.

`consumed-inputs.json` v1 contém exatamente manifest, stdin, settings, mcp e
bundleInventory, cada um `{path,sha256,bytes}`; manifesto é vinculado pelos bytes
raw, mesmo se duas formatações tiverem igual semântica. `profile.json` contém
version1, runId, fixtureId, nonce128bit, driverSha256, consumedInputsSha256,
toolchainDigests, observer e client. Cada role tem id/name/labels/config Docker
resolvidos, paths do snapshot/mounts, argv/env/cwd resolvidos e role de cada pipe;
observer inclui porta observada e client URL calculada. A projeção config é fechada: imageId, entrypoint, cmd, workingDir, user,
readOnlyRootfs, capDrop, securityOpt, privileged, devices, pidMode, ipcMode,
cgroupnsMode, networkMode, portBindings, memoryBytes, nanoCpus, pidsLimit,
ulimits, logDriver, mounts, tmpfs. Valores são os fixos desta SPEC; cmd/entrypoint
são Node e wrapper pinados, sem shell; pid/ipc são private, portBindings/devices
vazios, capDrop=[ALL], securityOpt=[no-new-privileges]. ulimits tem somente
nofile{soft:256,hard:256}; mounts são registros fechados
{source,destination,readOnly:true,type:bind}, tmpfs são
{destination,bytes,uid:1000,gid:1000,mode:0700,flags:[nosuid,nodev,noexec]}.
O preflight versionado fica no trace: UID/GID/PID inteiros, namespaces strings
de inode, interfaces somente array[lo], routes array vazio ou apenas destinos
loopback, hostMarkerAbsent booleantrue. Campos extras/diferentes são rejeitados.
Nenhum valor pode ser escolhido pelo alvo. `profileSha256=SHA(C(profile))`.

Manifesto raw, stdin, settings, MCP, inventário consumido, inventário de bundle,
fontes do bundle e perfil canônico são artefatos obrigatórios com roles distintas
`manifest`, `stdin`, `settings`, `mcp`, `consumed-inputs`, `bundle-inventory`,
`bundle-source` e `profile`. Relatório vincula seus paths/digests; em PORT_OBSERVED
nenhum digest de toolchain/driver/profile pode ser null. Um exemplo documental
recomputável e mutações separadas de helper/manifesto/config/invocação devem
acompanhar o código futuro; não basta a igualdade dos valores semânticos.

## Protocolo fechado e prova do erro503

Host, wrappers e observador são software confiável revisto e congelado. O
sentinel público é guarda de fixture/rota, não autenticação de processo.
Canal stdout de cada wrapper é somente NDJSON estrito UTF-8, frame≤8KiB,
seq consecutivo desde0, máximo256frames por role/512KiB total. Frame tem apenas
`{version:1,runId,role,seq,type,payload}`. Comando host tem somente
`{version:1,runId,seq,type,payload}`. Tipos: CONFIGURE, START_NATIVE, ARM_PORT,
START_PORT, STOP; cada um no máximo uma vez por role aplicável. CONFIGURE é
somente para cliente e payload fechado`{port,profileSha256,envSha256}`; demais
payloads são`{}`. Port inteiro1–65535 e digestshex64; nenhum URL/env arbitrário.

Frames e payloads fechados:

| Origem     | type         | payload                                                                                                                     |
| ---------- | ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| ambas      | READY        | `{uid,gid,pid,pidNamespace,netNamespace,interfaces,routes,hostMarkerAbsent}` mais campos por role definidos no bootstrap    |
| cliente    | NATIVE_START | `{phase,pid,ppid,argvSha256,envSha256,stdinSha256}`; phase version ou port; PIDs positivos da API real de spawn             |
| cliente    | NATIVE_END   | `{phase,exitCode,signal,timeout}` obtidos dos eventos reais do child                                                        |
| observador | ARMED        | `{phase:port,port}`; porta igual à do profile                                                                               |
| observador | REQUEST      | `{phase:port,ordinal,method:POST,path:/v1/messages,bodySha256,bytes,markerVerified,contentType,contentEncoding}`            |
| observador | RESPONSE     | `{phase:port,ordinal,status:503,headersSha256,bodySha256,outcome}`; outcome FINISHED ou FAILED                              |
| observador | REJECTED     | `{reason,ordinal}`; reason EARLY_PHASE, UNSUPPORTED_ROUTE, MISSING_SENTINEL, FORBIDDEN_AUTH ou CAP; sem valor de header/URL |
| ambas      | CLOSED       | `{}`; após encerramento próprio normal                                                                                      |

Encoding classifications: contentType=JSON|OTHER|ABSENT, contentEncoding=
IDENTITY|OTHER|ABSENT; encodingKnown é true somente IDENTITYouABSENT. Ausência de sentinel em rota candidata gera MISSING_SENTINEL/nenhum crédito,
sem virar violação de segredo; auth/token/cookie não permitido é FORBIDDEN_AUTH. Requests
não elegíveis só geram REJECTED; seus bodies/headers/URL não são retidos.
`ordinal` é a posição da request entre todas as quatro permitidas; observações
podem ter lacunas, mas não duplicatas, ordenadas crescentemente0–3.

STOP é permitido a qualquer momento e termina a coleta com falha se a fase não
concluiu. Frames inválidos, repetidos, fora de ordem, origem/tipo errado ou EOF
antes do CLOSED esperado são INFRA_FAILURE; cancelamento preserva a causa.
Native stdout/stderr nunca entram no parserNDJSON. No pipe stderr do wrapper,
bytes do nativo são frames binários de magic literalCVGN1, fase1byte(0version,
1port), canal1byte(1stdout,2stderr), comprimento uint32BE≤4096 e payloadraw.
Observador usa magicCVGB1, ordinal1byte, comprimento uint32BE≤4096 e bodyraw.
Host demultiplexa por pipe confiável; nunca interpreta conteúdo raw como controle.
ErroCLI Docker no mesmo pipe que viole framing é infra, não evento do nativo.

Bootstrap normativo: criar ambos contêineres com wrappers e envDocker estáticos,
sem iniciar Claude; iniciar observador, que faz listen127.0.0.1:0 e emite READY
com os camposbase e **port** real de server.address().port. Nenhuma origem
alternativa, adivinhação ou scan fornece a porta. Host valida o frame/port e
resolve profile.json completo incluindo IDs já criados, P, URL e envnativo das
duas fases. O envDocker do wrapper permanece estático e distinto do envnativo.
Host persiste/sync/congela perfil/input inventories antes de CONFIGURE e confere
seus hashes; depois nenhuma mutação é admitida. Perfil não é arquivo mutável
montado no cliente, nem canal implícito de configuração.

Cliente inicia somente wrapper que espera CONFIGURE antes de READY. Host envia
CONFIGURE com P, profileSha256 e envSha256 previstos; wrapper valida P e deriva
internamente URL/envnativo com os templates fixos do bundle. Hash do envderivado
deve ser igual ao recebido; guarda os valores imutáveis. READY do cliente tem
camposbase mais **port**, **profileSha256**, **envSha256**; host exige igualdade
com o perfil congelado antes de qualquer START_NATIVE. As duas fases nativas
usam exatamente esse mesmo env; NATIVE_START/version e NATIVE_START/port vinculam
seu mesmo digest. CONFIGURE repetido é PROTOCOL/INFRA_FAILURE sem novo spawn.

READYobservador sem P/comPfora do domínio, CONFIGURE inválido ou framing ausente
é PROTOCOL/INFRA_FAILURE e nenhum nativefork. READYcliente com porta/hash que
diverge do perfil é CONTAINMENT/BLOCKED_CONTAINMENT antes do alvo. Perfil alterado
após congelamento é DRIFT_RUNTIME/INFRA_FAILURE; falta de confirmação/timeout é
PROTOCOLouTIMEOUT/INFRA_FAILURE, nunca usar porta default. Configuração não
validada deixa fases nativasNOT_RUN; testar zero spawn em cada negativo futuro.

Ordem: READYobservador/P → perfil congelado → CONFIGUREcliente → READYcliente →
inspect/preflightPASS → START_NATIVE no cliente →
NATIVE_START/version → NATIVE_END/version com2.1.302observada → verificar que
namespacePIDcliente tem somente wrapper/nenhum descendente da versão →
ARM_PORT no observador → ARMED → START_PORT no cliente → NATIVE_START/port e
REQUEST/RESPONSE protegidos → NATIVE_END/port → STOP/CLOSED/cleanup. Cada fase
nativa tem exatamente um START/END; requer PID/PPID reais e vínculo à argv/env/
stdin congelados. Não inventar exitCode a partir do wrapper. Nenhum request da
faseversion ou antes deARM_PORT conta; EARLY_PHASE é falha. A leitura de pipes
pode intercalar: não exigir ordem global de chegada entre START/port e REQUEST,
mas ambos devem estar no intervalo autorizadoSTART_PORT→STOP e existir no trace.

O host dá ordem total de recepção com contador crescente e offsetMs do seu
relógio monotônico desde a criação do controlador; registros incluem comandos
emitidos e role/seq recebido. Não comparar clocks de contêineres. Frames de
REQUEST/RESPONSE vinculam ordinal ao bodyraw; a observação referencia esses
registros e o START/END da faseport no trace. Eventos fora de janela são falha.

Resposta fixa: status503, headers `content-type: application/json`,
`content-length: 82`, `connection: close`, sem Date automático. BodyUTF-8 literal
sem newline: `{"type":"error","error":{"type":"overloaded_error","message":"CVG_SYNTHETIC_503"}}`.
A contagem82 deve ser calculada dos bytes pelo código/revisão; divergência impede
BUILD qualificado. HeadersSha é SHA(C dos três pares lowercase); bodySha é SHA
raw. FINISHED vem de ServerResponse.finish e nenhuma falha/closeprematuro pode
ter ocorrido antes; FAILED/error/abort impede PORT_OBSERVED. FINISHED prova
conclusão local do envio, não que o Claude consumiu a resposta.

## Recursos incertos, cleanup e limites de canais

Antes de cada create, persistir/sync intent `{runId,nonce,role,name,imageId,
configSha256,labels,attempted:true}` em `create-intents.json`. Se resposta de
create for perdida, não repetir create. Fazer no máximo um inspect pelo nome
exato registrado; adotar ID somente com nome, todos labels, imagem e projeção
config iguais. Ausência confirmada=nenhum recurso; mismatch=não tocar o recurso,
registrar conflito. Sem inventário global/adotar pelo prefixo. Segunda criação
falha exige cleanup da primeira pelos mesmos critérios.

Prazo30s é desde antes da primeira chamada Docker até fim da observação;
20s é orçamento conjunto dos dois filhos nativos, sem renovar entre fases.
Cada chamada Docker tem deadline≤2s e somente tempo restante, exceto stop/remove
usarem a janela conjunta cleanup≤5s. Máximo24chamadas totais, stdout≤64KiB e
stderr≤16KiB por chamada, agregadoDocker≤256KiB. Log driver `none` obrigatório
em ambos inspect, sem cópia de logs no daemon. Controles≤512KiB, nativos1MiB por
canal somando fases, bodies2MiB, bundle1MiB e tudo incluindo JSON≤8MiB. Estouro
encerra como infra; nenhum canal é ilimitado ou truncado como completo.

Cleanup precisa stop/remove/inspectfinalnãoexistente de cada identidade criada
ou recuperada. Se daemon/IO impedir confirmação, gerar `cleanup.json` com cada
intent/ID conhecido e statusREMOVED|NOT_CREATED|UNRESOLVED, causas e próxima ação
`reconciliar somente nome/labels/imagem/config exatos e remover ID comprovado`.
Não declarar NP07PASS nem PORT_OBSERVED. Controlador crash pode deixar apenas
intent e pending parciais: eles significam incomplete/INFRA_FAILURE, nunca report
completo; retomadaLead usa esses intents sem repetir create/execução nativa.
SIGINT/SIGTERM do controlador tenta cleanup finito; SIGKILL/powerloss não tem
cleanupgarantido. Sem escrever relatório final quando persistência falhar.

## Invariantes do relatório e precedência

Máximo512artefatos; paths relativos únicos sem symlink/traversal, tamanhos
inteiros0–8MiB, digestshex64 e roles conhecidas. Além dos inputs acima, roles
`inspect`, `preflight`, `control-trace`, `observer-trace`, `native-stdout`,
`native-stderr`, `request-body`, `create-intents`, `cleanup`, `failures`.
Inputs têm cardinalidade1 por role exceto bundle-source(1–256); inspector e
preflight uma entrada por role/container tentado, traces no máximo um por role,
request-body exatamente um por observação e nenhum body de rota rejeitada.
Toda observação deve resolver bodyPath/eventPath/responsePath para bytes e
registros correspondentes nos traces; sha/bytes/classificações/phase/ordinal/
503FINISHED devem concordar. Sharedpathtrace é permitido com seq específico
registrado na referência `path#seq`; artifactPathsemfragmento continua único.

Checks obrigatórios nesta ordem exata e sem duplicatas: INPUTS, TOOLCHAIN,
BUNDLE, CONTAINER_PROFILE, NAMESPACES, PHASES, NATIVE_VERSION, NATIVE_LINEAGE,
HTTP_EXCHANGE, PRIVACY_CAPS, DRIFT, CLEANUP, PUBLICATION_PREPARED. Cada um inclui
artifactPaths(0–16paths/seqrefs existentes); PASS exige sua evidência real:
INPUTS/TOOLCHAIN/BUNDLE→inventários; PROFILE/NAMESPACES→inspect+preflight;
PHASES/VERSION/LINEAGE→trace+nativepipes; HTTP→body+REQUEST/RESPONSE;
PRIVACY_CAPS→traces+contadores; DRIFT→inventários finais; CLEANUP→cleanup;
PUBLICATION_PREPARED→inventário de stagedIOfechado. Não exigir que um input
inválido produza evidência que não pôde criar; check correspondenteFAIL, demais
NOT_RUN. PORT_OBSERVED exige todosPASS, zero resourceUNRESOLVED e zero causes.
PORT_NOT_OBSERVED permite HTTP_EXCHANGEFAIL com motivoNO_ELIGIBLE_EXCHANGE;
demais controles precisam ser íntegros. Em nenhuma situação falta de evidência
se tornaPASS. Validador futuro rejeita omissão/duplicação/vínculo contraditório.

Sinais nativos usam conjunto fechado dos nomesLinux Node: SIGHUP,SIGINT,SIGQUIT,
SIGILL,SIGTRAP,SIGABRT,SIGBUS,SIGFPE,SIGKILL,SIGUSR1,SIGSEGV,SIGUSR2,SIGPIPE,
SIGALRM,SIGTERM,SIGCHLD,SIGCONT,SIGSTOP,SIGTSTP,SIGTTIN,SIGTTOU,SIGURG,
SIGXCPU,SIGXFSZ,SIGVTALRM,SIGPROF,SIGWINCH,SIGIO,SIGPWR,SIGSYS. Outro sinal
observado gera INFRA_FAILURE e classificaçãoUNKNOWN em failures; signalnull
com limitação explícita, nunca ocultar o raw confiável.

`failures.json` é lista ordenada de causas sanitizadas `{code,source,phase,
order,artifactRef}`; code pertence a enum dos casos da tabela, source=HOST|
DOCKER|CLIENT|OBSERVER e phase=INPUT|PREFLIGHT|VERSION|PORT|CLEANUP|PUBLICATION.
Preservar causa primária cronológica e adicionais; em empate usar ordem de
sourceHOST→DOCKER→CLIENT→OBSERVER. Internamente preservar objetosError.cause;
serialização não expõe mensagens/env/auth arbitrários. Sem causas para sucesso.

Seleção terminal por prioridade, independentemente de POST anterior:

| Prioridade/código                                              | Situação                                                                                                                        | Status/exit           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 1 IO/CLEANUP/PROTOCOL/PRIVACY/CAP/TIMEOUT/SIGNAL/DRIFT_RUNTIME | Falha de IO/publicação/cleanup, auth não sentinel, framing, cap, timeout nativo/controlador, sinal anormal ou drift após create | INFRA_FAILURE/1       |
| 2 TOOLCHAIN_UNAVAILABLE                                        | Toolchain ausente/incompatível, falha de spawn/toolchain não imputável ao input                                                 | INFRA_FAILURE/1       |
| 3 INPUT_INVALID/IDENTITY_MISMATCH                              | Manifesto/schema/cap/path/hash antes de create, bundle inválido ou versão diferente antes da faseport                           | INVALID_INPUT/1       |
| 4 CONTAINMENT                                                  | Inspect/preflight ausente ou divergente antes do alvo                                                                           | BLOCKED_CONTAINMENT/1 |
| 5 NO_ELIGIBLE_EXCHANGE                                         | Execução íntegra terminada sem exchange elegível completo                                                                       | PORT_NOT_OBSERVED/1   |
| 6 nenhuma                                                      | Exchange elegível503FINISHED + controles íntegros                                                                               | PORT_OBSERVED/0       |

UsoCLIinválido→2 antes de qualquer create, sem report se destino não validável.
Versão falha/exit anormal sem texto2.1.302 impede START_PORT; versão divergente
usa IDENTITY_MISMATCH. Exit nativo nãozero sem sinal/timeout é preservado;503
pode causá-lo e não impede PORT_OBSERVED se os controles e exchange estão
íntegros. Sem exchange/sem outra falha dá PORT_NOT_OBSERVED. Markerfalse ou body
opaco ainda pode darPORT_OBSERVED com booleans observados e limitação explícita;
não representa qualificação semântica. Headersauth inválidos sempre PRIVACY,
mesmo apósPOSTválido. Cleanupportariafallback não pode sobrepor prioridade1.
PreflightFAIL+cleanupFAIL→INFRA_FAILURE com ambas causas; POST+qualquer falha
prioridade1→INFRA_FAILURE. Publicação final falha nunca deixa reportcompleto:
retorno/exit1 e pending como evidência, sem alegar report salvo.

Reusar o protocolo qualificado de staging/closeantesdelink exclusivo de0229,
com domínio de caps deste probe; nenhum IO falível após publicar. Estes casos,
inclusive cada par de falhas, source/manifest/profilemutants e falha no envio503,
devem ter exemplos documentais com status/exit únicos e testes antes do alvo.

## Aceites congelados para futura implementação

| ID   | Critério rejeitável                                                             | Prova necessária                                                                                                         |
| ---- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| NP01 | Inputs/identidades/caps fechados; dados não escolhem executável/comando.        | Negativos de UTF-8/dup/schema/path/hash e zero Dockercreate antes da validação.                                          |
| NP02 | Perfil real sem hostdata/RW/bridge/privilégio.                                  | Docker inspect e preflight reais com hashes, namespaces/rotas/UID/mounts; falha bloqueia antes do Claude.                |
| NP03 | Coletor HTTP separado do PID/filesystem/stdout do alvo.                         | Inodes PID distintos/rede igual e IDs próprios; stdout fake do cliente não cria observation.                             |
| NP04 | Alvo só nasce depois dos controles; env/argv/input exatos.                      | Sequência START_NATIVE e negativos semfork; versão/process lineage/caps nativos observados.                              |
| NP05 | Porta é observada ou declarada ausente honestamente.                            | Claude real, bindsource antes/depois, POST503 real; timeout/auth/ELF falham sem credencial ou fallback.                  |
| NP06 | Header/body/output caps e privacidade sem truncamento silencioso.               | Limiteexato/+1, segredo inventado em auth descartado, stdout/route falsos não elegíveis.                                 |
| NP07 | Cleanup confirma remoção ou explicita recurso próprio não resolvido como falha. | Cancel/crash/dualfailure com identidade nativa quando viável; IDs/handles após encerramento.                             |
| NP08 | Brutos/hash/publicação reproduzíveis e histórico íntegro.                       | Alteração de qualquer insumo, overwrite e erro final de IO/cleanup sem relatório completo enganoso.                      |
| NP09 | Nenhum crédito automático ou conta/modelo real.                                 | Catálogo134IDs/classes/hash antes/depois, reportREFERENCE_RECON_ONLY e ausência de índice funcional.                     |
| NP10 | Revisão/gates atuais no mesmo candidato.                                        | Código congelado, crítico independente, tipo/lint/unit/PG/E2E/certifyNode22; revisão humanaT3 desta SPEC antes do BUILD. |

Todos NP são NOT_RUN. Mais do que dois retrabalhos exige diagnóstico/replanejamento
registrado; não reduzir a barra. Revisor de código julga fonte/negativos antes
do primeiro lançamento do alvo. Mudança de binário/toolchain/perfil/API de
observação ou necessidade de acesso real reabre o contrato/gate correspondente.

## Próxima decisão revisável

Preparar parecer documental independente e pacote com SHA-256 desta SPEC.
A decisão solicitável é somente BUILD local e probe nativo contido descritos
aqui, depois das pré-condições. Não inclui M1, resposta de modelo, adapter de
equivalência, serviço/conta remota, dado real, instalação, push, deploy ou release.
Sem decisão humana específica, continuar apenas documentação e trabalho
independente já autorizado, mantendo esta unidade sem código/executável lançado.
