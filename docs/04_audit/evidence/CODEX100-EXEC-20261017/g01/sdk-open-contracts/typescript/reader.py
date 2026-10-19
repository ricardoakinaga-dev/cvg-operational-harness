#!/usr/bin/env python3
"""Local text/AST/Git metadata only; no target imports, builds or runtime probes."""
import copy
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if (p / 'docs/07_agents/AGENTS.md').is_file())
UP = Path('/tmp/cvg-rea-codex-20261017/upstream')
PIN = '8d9f6466ff0294785d56f55b1fe363d132fe4133'
NODE = '/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
BASE = HERE.parent.parent / 'sdk-language-contracts'
ALIASES = {
 'codex':'sdk/typescript/src/codex.ts', 'thread':'sdk/typescript/src/thread.ts',
 'exec':'sdk/typescript/src/exec.ts', 'schema':'sdk/typescript/src/outputSchemaFile.ts',
 'codexOptions':'sdk/typescript/src/codexOptions.ts', 'threadOptions':'sdk/typescript/src/threadOptions.ts',
 'turnOptions':'sdk/typescript/src/turnOptions.ts', 'index':'sdk/typescript/src/index.ts',
 'sdkPkg':'sdk/typescript/package.json', 'cliPkg':'codex-cli/package.json',
 'cli':'codex-cli/bin/codex.js',
 'proxy':'codex-rs/responses-api-proxy/npm/bin/codex-responses-api-proxy.js',
}

def sha(b): return hashlib.sha256(b).hexdigest()
def encoded(x): return (json.dumps(x, ensure_ascii=False, indent=2) + '\n').encode()
GIT_RECEIPTS = []
def git(*args):
 argv=['git', '-C', str(UP), *args]
 raw=subprocess.check_output(argv)
 GIT_RECEIPTS.append({'argv':argv,'exit_code':0,'stdout_sha256':sha(raw),'stdout_bytes':len(raw)})
 return raw
def ref(alias, first, last=None): return (alias, first, last if last is not None else first)
def b(name, condition, effect, *refs):
 return {'name':name, 'condition':condition, 'source_effect':effect, '_refs':list(refs)}

# These are bounded manual semantic annotations. AST site coverage below checks their
# lexical reach; it is explicitly not proof that predicates or outcomes are exhaustive.
DEFS = []
def c(cid, title, chain, refs, branches, future, limits, gap='GAP-TS-LANGUAGE', rules=()):
 DEFS.append({'id':cid,'title':title,'gap_id':gap,'_chain':chain,'_refs':refs,
  'branches':branches,'future_oracle':future,'external_limits':limits,'historical_rule_ids':list(rules)})

c('TS01','Entrada pública, defaults e início preguiçoso',
 [('package export',ref('index',26,40)),('Codex.constructor/startThread/resumeThread',ref('codex',15,38)),('Thread.constructor/runStreamed',ref('thread',48,74)),('CodexExec.constructor/run',ref('exec',75,95))],
 [ref('codex',15,38),ref('thread',48,81),ref('exec',75,95)], [
 b('constructor-default','options omitido','options={} e exec recebe codexPathOverride, env, config, configOverrides nessa ordem; this.options conserva referência.',ref('codex',15,19)),
 b('new-versus-resume','startThread(options={}) / resumeThread(id, options={})','Thread compartilha exec e options; _id começa null ou id informado, sem validação de id/persistência nesse caminho.',ref('codex',25,38),ref('thread',53,63)),
 b('override-truthiness','executablePath truthy / falsy','Truthy evita findCodexPath e zera pathDirs; falsy resolve imediatamente no construtor. Portanto construção pode lançar antes de qualquer turn.',ref('exec',75,92)),
 b('lazy-events','runStreamed chamado / events.next solicitado','runStreamed retorna events: async generator; criação de schema e spawn só ocorrem ao iterar. run() itera internamente; getter id apenas lê _id.',ref('thread',48,50),ref('thread',65,77),ref('thread',119,125))],
 'Verificar sem executar agora: construção com resolver faltante falha; override vazio cai no resolver; startThread/resumeThread não iniciam processo; runStreamed sem next não cria schema; mutação das referências options antes de next é observável.',
 ['L-NODE','L-PACKAGE','L-CONCURRENCY'])

c('TS02','Normalização literal da entrada e imagens',
 [('Thread.run/runStreamed',ref('thread',65,76)),('normalizeInput',ref('thread',145,159)),('CodexExec.run stdin/images',ref('exec',173,181)),('stdin.write',ref('exec',211,216))],
 [ref('thread',145,159),ref('exec',173,181),ref('exec',211,216)], [
 b('string','typeof input === string','Prompt idêntico, images=[]; string vazia preservada.',ref('thread',145,148)),
 b('list','lista; item.type text / local_image / outro','Textos entram em ordem e se unem por \\n\\n (dois LF); imagens mantêm ordem e paths literais; tipo desconhecido é ignorado; lista vazia dá prompt vazio.',ref('thread',149,159)),
 b('images-argv','images?.length positivo / zero','Cada imagem vira --image path depois de resume; stdin recebe prompt sem LF acrescido, write seguido de end; sem tratamento explícito de backpressure.',ref('exec',173,181),ref('exec',211,216)),
 b('invalid-input','entrada não iterável ou item null fora do tipo','Falha normal de JS na iteração/acesso, não erro de validação próprio; acontece antes do try de cleanup do thread.',ref('thread',74,98),ref('thread',151,156))],
 'Futuro fixture controlado deve comparar argv e bytes stdin para string, lista mista, lista vazia e tipos fora do contrato; incluir falha de normalização após schema temporário e não inventar sanitização/validação.',
 ['L-NODE','L-SCHEMA'], rules=['TS-INPUT-NORMALIZATION'])

c('TS03','Schema temporário: aceitação, escrita e limpeza suprimida',
 [('Thread.runStreamedInternal',ref('thread',70,76)),('createOutputSchemaFile/isJsonObject',ref('schema',10,40)),('fs.mkdtemp/writeFile/rm',ref('schema',19,35)),('thread finally',ref('thread',113,115))],
 [ref('schema',10,40),ref('thread',113,115)], [
 b('omitted','schema === undefined','Retorna cleanup async vazio e nenhum schemaPath.',ref('schema',10,13)),
 b('object-guard','object não-null não-array / resto','Aceita objeto pela condição rasa inclusive instâncias/protótipos; null,array,primitivos rejeitados com outputSchema must be a plain JSON object. Não valida JSON Schema.',ref('schema',15,17),ref('schema',38,40)),
 b('mkdtemp','mkdtemp resolve / rejeita','Diretório codex-output-schema-* em os.tmpdir, schema.json; falha de mkdtemp antecede definição de cleanup e try.',ref('schema',19,21)),
 b('write-or-serialize','JSON.stringify/writeFile resolve / lança','Escreve UTF8 sem LF acrescido e retorna path+cleanup; erro de stringify (ciclo/BigInt/getter) ou write chama cleanup e relança original.',ref('schema',29,35)),
 b('cleanup-failure','fs.rm resolve / lança','rm recursive:true force:true; catch suprime falhas, sem recibo de remoção bem sucedida.',ref('schema',21,27))],
 'Futuro oráculo isolado com fs sintético: undefined/null/array/objeto/protótipo/toJSON, ciclo, falha mkdtemp/write/rm; conferir path e bytes e preservação do erro primário; schema é pedido à CLI, não valida saída do modelo no SDK.',
 ['L-SCHEMA','L-NODE'], rules=['TS-STRUCTURED-OUTPUT'])

c('TS04','Fronteira do try do thread e retorno antecipado',
 [('Thread.run/runStreamed',ref('thread',65,74)),('schema then normalize then exec generator',ref('thread',74,98)),('JSONL loop and finally',ref('thread',98,115)),('exec finally',ref('exec',243,264))],
 [ref('thread',74,115),ref('exec',243,264)], [
 b('before-try','schema já criado; normalizeInput lança antes da linha98','Não há try envolvendo normalização: cleanup retornado pelo schema não é chamado nesse caminho; não corrigir o comportamento fonte.',ref('thread',74,98)),
 b('inside-try','erro JSONL/exec ou iteração concluída ou return após yield','finally do thread aguarda cleanup; for-await encerra iterador interno quando sai abruptamente. Duração/efetividade do kill/rm é externa.',ref('thread',98,115),ref('exec',243,264)),
 b('never-started-or-suspended','generator criado sem next / abandonado suspenso sem return','Sem next não aloca; sem protocolo de encerramento não há mecanismo fonte que garanta finally automático/por GC. Pending next/cancel é obrigação futura.',ref('thread',65,74),ref('thread',111,115))],
 'Futuro distinguir zero next, return após primeiro evento, throw no consumidor, abandono sem return e falha normalize depois de schema válido; instrumentar chamadas rm/kill e liveness, sem transformar finally lexical em garantia temporal.',
 ['L-NODE','L-SCHEMA','L-CONCURRENCY'])

c('TS05','Ordem dos overrides e ausência de precedência provada na CLI',
 [('Codex.constructor',ref('codex',15,18)),('Thread options projection',ref('thread',77,97)),('CodexExec.run',ref('exec',94,181)),('serializeConfigOverrides',ref('exec',268,272)),('spawn',ref('exec',203,206))],
 [ref('exec',94,181),ref('codexOptions',9,22)], [
 b('structured','config truthy / ausente','Antes de raw e opções específicas: serializeConfigOverrides produz pares --config override.',ref('exec',97,101)),
 b('raw','configOverrides truthy / ausente','Itera strings literais em ordem sem validar nem normalizar; cada uma vira --config. Array vazio não adiciona nada.',ref('exec',103,107)),
 b('managed-order','opções SDK/thread presentes','baseUrl,model,threadSource,sandbox,cd,add-dir,skip,output-schema,cyber,effort,network,web,approval,resume,images nesta ordem após raw; prefixo exec --experimental-json fixo.',ref('exec',94,181)),
 b('error-before-spawn','serializeConfigOverrides/toTomlValue lança','Nenhum child criado; thread já está dentro do try de iteração e chama cleanup; ordem argv não prova qual override repetido a CLI aplicará.',ref('exec',97,113),ref('exec',203,206),ref('thread',98,115))],
 'Futuro comparar vetor argv completo com chaves repetidas entre structured/raw/baseUrl/thread, depois avaliar precedência efetiva separadamente na CLI autorizada; erro de serialização deve acontecer sem spawn e com tentativa de cleanup do schema.',
 ['L-CLI','L-NODE'], rules=['TS-EXEC-LAUNCH'])

c('TS06','Flatten de config: prefixos, vazios e erros',
 [('Codex(config).Thread.run',ref('codex',15,18)),('exec.run structured config',ref('exec',97,101)),('serializeConfigOverrides→flattenConfigOverrides',ref('exec',268,312)),('toTomlValue',ref('exec',314,345))],
 [ref('exec',268,312),ref('exec',352,354)], [
 b('root-kind','!isPlainObject(value); prefix vazio / não-vazio','Raiz não-objeto lança Codex config overrides must be a plain object; prefix não-vazio renderiza leaf e retorna. Predicado plain é só object/non-null/non-array, sem teste de protótipo.',ref('exec',279,286),ref('exec',352,354)),
 b('empty','entries.length===0; prefix vazio / não-vazio','Raiz vazia emite nada; filho vazio emite prefix={}.',ref('exec',288,296)),
 b('key-and-undefined','!key / child===undefined / demais','Chave vazia lança mesmo se valor undefined; undefined é pulado depois da checagem; path concatena prefix.key sem escape de segmentos.',ref('exec',298,305)),
 b('recurse','child é object não-array / outro','Recursão para objetos; demais passam a toTomlValue. Chaves dotted/quotes não são escapadas no flatten; colisões são preservadas, sem detecção de ciclos nem limite de profundidade.',ref('exec',305,311))],
 'Futuro verificar raiz/filho vazio, undefined versus chave vazia, chaves com ponto/aspas, Date e objeto com protótipo, colisões e ciclo limitado por timeout no fixture; preservar a falha, sem instalar parser TOML nem inferir resultado CLI.',
 ['L-NODE','L-CLI'], rules=['TS-EXEC-LAUNCH'])

c('TS07','Renderização TOML e predicado raso de objetos',
 [('exec.run→serializeConfigOverrides',ref('exec',97,101)),('flattenConfigOverrides',ref('exec',298,311)),('toTomlValue→formatTomlKey/isPlainObject',ref('exec',314,354))],
 [ref('exec',314,354)], [
 b('primitive','string / number finito / boolean','String usa JSON.stringify; finito usa interpolação; boolean true/false. Number não-finito lança erro com path. Não há validação TOML downstream.',ref('exec',314,323)),
 b('array','Array.isArray(value)','Recursão indexada path[i], join vírgula+espaço entre colchetes; array com null/undefined explícito pode lançar; holes obedecem map nativo e não são validados aqui.',ref('exec',324,326)),
 b('inline-object','isPlainObject(value)','Object.entries; chave vazia lança, filho undefined pula; key bare só /^[A-Za-z0-9_-]+$/, demais JSON.stringify; objeto inline usa {key = valor}.',ref('exec',327,338),ref('exec',347,354)),
 b('null-and-unsupported','value===null / demais tipos','Null lança cannot be null com path; undefined/function/bigint/symbol lança Unsupported ... typeof. Tipos TypeScript não são guards runtime.',ref('exec',339,344))],
 'Futuro avaliar vetores de strings escapadas, -0, NaN/Infinity, arrays aninhados/sparse, objetos em arrays, null/undefined/BigInt e chave especial; capturar output ou mensagem/path exatos. Compatibilidade com parser TOML da CLI fica independente.',
 ['L-NODE','L-CLI'], rules=['TS-EXEC-LAUNCH'])

c('TS08','Guardas de opções, resume, network e web search',
 [('Thread.run options projection',ref('thread',77,97)),('CodexExec.run option argv',ref('exec',109,181)),('spawn',ref('exec',203,206))],
 [ref('exec',109,181),ref('threadOptions',1,30),ref('turnOptions',1,13)], [
 b('truthy-strings','baseUrl/model/sandboxMode/workingDirectory/outputSchemaFile/modelReasoningEffort/approvalPolicy truthy','Ausente ou string vazia suprime flag; baseUrl passa toTomlValue; effort/approval usam interpolação com aspas sem validação local de enum.',ref('exec',109,130),ref('exec',142,144),ref('exec',150,152),ref('exec',169,171)),
 b('thread-source-resume','threadSource !== undefined && !threadId; threadId truthy','Source vazio explícito é permitido ao criar; id truthy suprime source e acrescenta resume id depois das configs; id vazio não vira resume.',ref('exec',120,122),ref('exec',173,175)),
 b('repeat-dirs-skip','additionalDirectories?.length; skipGitRepoCheck truthy','Repete --add-dir em ordem literal; skip flag sem valor. Sem dedupe ou validação de existência.',ref('exec',132,140)),
 b('explicit-undefined','cyberAccessProgram/networkAccessEnabled !== undefined','Aceita valor explícito até vazio/falso (network false emite false); omitidos não geram flag. Sem default local de rede/cyber.',ref('exec',146,159)),
 b('web-precedence','webSearchMode truthy / legacy===true / legacy===false / resto','Mode explícito primeiro; caso contrário live/disabled só por booleans estritos; nenhuma flag no restante.',ref('exec',161,167)),
 b('images','images?.length','--image por elemento depois de resume; lista vazia suprime.',ref('exec',177,181))],
 'Futuro matriz undefined/vazio/false/true e enum fora do tipo para cada guarda; conferir ordem e multiplicidade, threadSource com id null/vazio/truthy e conflito webSearchMode/legacy; defaults da CLI não inferidos do SDK.',
 ['L-CLI','L-NODE'], rules=['TS-EXEC-LAUNCH'])

c('TS09','Ambiente: substituição integral, originator e API key',
 [('Codex.constructor env',ref('codex',15,18)),('CodexExec constructor stores env',ref('exec',89,92)),('run environment',ref('exec',183,206)),('prependPathDirs conditional',ref('exec',199,201))],
 [ref('exec',183,206),ref('codexOptions',23,27)], [
 b('override','this.envOverride truthy / falsy','Truthy inclusive {}: copia só override. Falsy: copia entries process.env cujo value não é undefined. Override não faz merge com process.env.',ref('exec',183,192)),
 b('originator','!env[CODEX_INTERNAL_ORIGINATOR_OVERRIDE]','Ausente/vazio/falsy recebe codex_sdk_ts; valor truthy mantém.',ref('exec',48,49),ref('exec',193,195)),
 b('credential','args.apiKey truthy / falsy','Truthy sobrescreve CODEX_API_KEY; vazio não apaga chave que já estava no env. Sem login/validação de token nesta fonte.',ref('exec',196,198)),
 b('pathdirs','this.pathDirs.length>0 / zero','Só diretórios vindos do resolver acionam prependPathDirs. Override do binário zera lista. spawn recebe env novo e signal; sem cwd/shell/stdio explícitos.',ref('exec',81,87),ref('exec',199,206))],
 'Futuro usar valores sintéticos e capturar env sem segredo real: override omitido/{}/parcial, originator vazio/presente, apiKey vazio/presente e PATH; verificar ausência de herança implícita e de cwd customizado em spawn.',
 ['L-NODE','L-AUTH'], rules=['TS-EXEC-LAUNCH'])

c('TS10','Spawn e stdio antes do try/finally do exec',
 [('Thread.runStreamedInternal',ref('thread',77,99)),('CodexExec.run spawn',ref('exec',203,209)),('stdin/stdout checks',ref('exec',211,228)),('later try',ref('exec',230,264))],
 [ref('exec',203,264)], [
 b('spawn-throws','spawn lança sincronicamente','Não há try do exec instalado; finally do thread ainda tenta cleanup. Não inventar child ou kill nesse caso.',ref('exec',203,206),ref('thread',98,115)),
 b('error-event','child error','once armazena err em spawnError; não rejeita exitPromise aqui; será relançado só após readline terminar.',ref('exec',208,209),ref('exec',249,250)),
 b('no-stdin','!child.stdin','kill não protegido por try; depois lança Child process has no stdin. Se kill lançar, pode mascarar esse erro; sem removeAllListeners neste ramo.',ref('exec',211,214)),
 b('stdin-write','stdin presente','write(input),end() sem await/backpressure/error listener explícito do stream. Falha síncrona ocorre antes de try; sem garantia de kill/remoção de listeners por esse finally.',ref('exec',215,216),ref('exec',243,264)),
 b('no-stdout','!child.stdout','Depois de stdin.end chama kill e lança Child process has no stdout; kill também não protegido.',ref('exec',218,221)),
 b('stderr','child.stderr presente / ausente','Presente agrega Buffers sem limite via data; ausente mantém [] e mensagem final vazia. Listener de stderr não é removido por child.removeAllListeners().',ref('exec',222,228),ref('exec',252,258))],
 'Futuro faults finitos de spawn síncrono/error-event/stdin ausente/stdout ausente/write/end/kill e stderr; medir listeners e child liveness separado de erro reportado; não qualificar pelo nome de teste upstream.',
 ['L-NODE','L-CONCURRENCY'], rules=['TS-EXEC-LAUNCH'])

c('TS11','Readline, erro de processo e espera por exit',
 [('CodexExec.run',ref('exec',230,264)),('readline→yield string',ref('exec',238,247)),('Thread JSON.parse',ref('thread',99,105))],
 [ref('exec',230,264),ref('thread',99,105)], [
 b('readline','linhas disponíveis / EOF','createInterface stdout, crlfDelay Infinity; yield cada line sem filtro de linha vazia. Delimitação/UTF8/chunking ficam em Node readline.',ref('exec',238,247)),
 b('stored-spawn-error','spawnError truthy após loop','Lança o objeto armazenado antes de await exit; não precisa alcançar exitPromise nesse caminho.',ref('exec',249,250)),
 b('exit','code===0 && !signal / code!==0 || signal','Sucesso retorna sem valor; erro Buffer.concat(stderr), detail sinal tem prioridade, code null usa1; lança Codex Exec exited with ...: stderr UTF8.',ref('exec',230,236),ref('exec',250,255)),
 b('exit-only','exitPromise pendente / resolvida antes ou depois de EOF','Promise resolve só em exit, não error/close; source não aguarda close/drain final de stderr. Não prova entrega de stderr tardio nem ausência de hang.',ref('exec',230,255)),
 b('setup-before-try','readline.createInterface lança','O try só começa depois de criar rl; portanto o finally do exec não é instalado se criação falhar.',ref('exec',238,244))],
 'Futuro child sintético controlado: LF/CRLF/linha vazia/linha parcial/UTF8 dividido, EOF antes/depois de exit, signal com stderr, code null, error sem exit, stderr tardio e readline setup/error; usar timeout e registrar hangs sem promover expectativa de close.',
 ['L-NODE','L-CONCURRENCY'], rules=['TS-JSONL-DIALECT','TS-EXEC-LAUNCH'])

c('TS12','AbortSignal e cleanup literal do processo',
 [('TurnOptions.signal→Thread',ref('thread',89,97)),('spawn(signal)',ref('exec',203,209)),('exec finally',ref('exec',243,264)),('thread finally',ref('thread',113,115))],
 [ref('turnOptions',11,13),ref('exec',203,264),ref('thread',113,115)], [
 b('signal-delegation','signal omitido / pré-abortado / abort durante execução','SDK só passa args.signal a spawn; não adiciona listener próprio, timeout, escalonamento ou conversão para turn.failed. Classe/tempo de AbortError depende de Node.',ref('exec',203,209)),
 b('finally-order','loop sai normalmente/erro/return depois de iniciar try','rl.close(), child.removeAllListeners(), depois try if !child.killed kill; erro de kill suprimido, não aguarda exit/reap. killed não é prova de terminação.',ref('exec',243,264)),
 b('close-and-remove-throws','rl.close() ou removeAllListeners() lança','Ambas operações estão fora do try que suprime kill; falha impede operações seguintes e pode substituir erro primário.',ref('exec',256,263)),
 b('already-killed','child.killed truthy / falsy','Truthy pula kill, falsy tenta kill() sem signal explícito; sem retry, sem SIGKILL e sem remover listeners de streams.',ref('exec',258,264))],
 'Futuro Node pinado, processos sintéticos e recibo de PID/liveness: pré-abort, aborto antes de yield/durante next/apos EOF, return cedo, killed=true ainda vivo, child ignorando sinal, close/remove/kill failures; registrar prioridade de erros e eventual pendência. Sem presumir cleanup desejado.',
 ['L-NODE','L-CONCURRENCY'], rules=['TS-EXEC-LAUNCH'])

c('TS13','JSONL: parse não valida o schema de evento',
 [('Thread.runStreamed',ref('thread',65,68)),('exec lines',ref('exec',238,247)),('runStreamedInternal parse/yield',ref('thread',98,115))],
 [ref('thread',98,115)], [
 b('invalid-json','JSON.parse(item) lança','Novo Error Failed to parse item: <linha> com cause original; finally do thread tenta cleanup e encerra iterador exec.',ref('thread',99,115)),
 b('valid-json','JSON.parse bem sucedido','Cast as ThreadEvent é sintaxe TS sem validação de schema; número/string/array/objeto desconhecido podem seguir até yield; null falha ao ler parsed.type fora do catch de JSON.parse.',ref('thread',100,111)),
 b('blank-line','item string vazia','Não é ignorada por nenhuma camada aqui; JSON.parse lança e gera erro de parse. Não assumir que readline filtra.',ref('exec',244,247),ref('thread',101,105))],
 'Futuro injetar linha vazia, JSON truncado, objeto de tipo desconhecido, [],42,string,null e verificar eventos ou erro/cause exatos e cleanup; não impor validação institucional ausente nessa fonte.',
 ['L-NODE','L-CLI'], rules=['TS-JSONL-DIALECT'])

c('TS14','Mutação de id e usage antes de expor evento',
 [('Thread.runStreamedInternal→JSON.parse',ref('thread',99,105)),('thread.started / turn.completed branches',ref('thread',106,111)),('Thread.id / next run threadId',ref('thread',48,50))],
 [ref('thread',48,50),ref('thread',77,82),ref('thread',106,111)], [
 b('thread-started','parsed.type===thread.started','Atribui _id=parsed.thread_id antes de yield, sem validar tipo; evento repetido substitui id; próximo run usa esse valor.',ref('thread',106,107),ref('thread',77,82)),
 b('turn-completed','parsed.type===turn.completed','cache_write_input_tokens ??=0: ausente/null vira0, valores falsy não-null (0/false/string vazia) preservados; falta de usage provoca falha de acesso, sem wrapper de parse.',ref('thread',108,110)),
 b('other-events','demais tipos','Yield sem mutação; turn.failed no modo streamed é evento e não automaticamente Error; type error também não lança por si.',ref('thread',106,111))],
 'Futuro observar id no instante de yield, múltiplos thread.started e id ausente; turn.completed com usage válido/ausente/null e campo cache omitido/null/0/false; distinguir streamed turn.failed/error de run agregador.',
 ['L-NODE','L-CONCURRENCY'], rules=['TS-JSONL-DIALECT'])

c('TS15','Agregação de turn: último texto, último usage, falha e EOF',
 [('Thread.run',ref('thread',119,125)),('runStreamedInternal',ref('thread',98,115)),('aggregate branches',ref('thread',125,141)),('exec iterator finally',ref('exec',256,264))],
 [ref('thread',119,141)], [
 b('item-completed','event.type===item.completed','Acrescenta todo event.item, inclusive duplicados; só agent_message substitui finalResponse por text; updated/started não entram.',ref('thread',125,130)),
 b('completed','event.type===turn.completed','usage substituído pelo último event.usage; não faz break; eventos posteriores continuam processados.',ref('thread',131,132)),
 b('failed','event.type===turn.failed','Guarda event.error e break fecha gerador; só se truthy lança novo Error(message), sem cause. error null/undefined fora do tipo resulta retorno; objeto sem message pode Error vazio.',ref('thread',133,141)),
 b('ignored','type error ou qualquer outro','Não há branch para type error no agregador; ignora e continua. Não transformar erro de evento em exceção inexistente.',ref('thread',125,137)),
 b('no-terminal','EOF/exit0 sem turn.completed/failed','Retorna items acumulados, finalResponse inicialmente string vazia, usage inicialmente null; sem exigência de evento terminal.',ref('thread',121,141))],
 'Futuro sequências finitas: mensagens múltiplas/duplicadas, updated/started, dois completed, error com exit0, EOF sem terminal, failed truthy/null, falha após completed e erro exec após eventos; conferir últimos valores e cancelamento por break.',
 ['L-NODE','L-CLI','L-CONCURRENCY'], rules=['TS-TURN-AGGREGATION'])

PACK = 'GAP-PLATFORM-PACKAGING'
c('PK01','Seleção de target no resolver SDK',
 [('Codex.constructor',ref('codex',15,18)),('CodexExec.constructor',ref('exec',75,92)),('findCodexPath',ref('exec',356,431)),('package map',ref('exec',48,61))],
 [ref('exec',48,61),ref('exec',356,431)], [
 b('supported','linux/android x64/arm64; darwin x64/arm64; win32 x64/arm64','Linux e Android usam musl; Darwin apple-darwin; Windows pc-windows-msvc; cada triple aponta pacote @openai/codex-{linux,darwin,win32}-{x64,arm64}. Não detecta glibc, CPU features ou versão OS.',ref('exec',52,59),ref('exec',356,400)),
 b('unsupported','plataforma ou arch fora dos cases','targetTriple null leva Unsupported platform: platform (arch). Default de cada arch e plataforma não escolhe fallback.',ref('exec',356,404)),
 b('missing-map','!platformPackage após triple','Erro Unsupported target triple: ... separado; alcançabilidade sob mapa fixo é contrafactual (não cenário de plataforma suportada adicional).',ref('exec',406,409)),
 b('binary-name','process.platform===win32 / demais','Nome codex.exe / codex; resolução de pacote tem fluxo próprio no PK02.',ref('exec',423,431))],
 'Futuro fixtures de plataforma/arch pinados (8 pares válidos incluindo android e pelo menos dois inválidos); checar triple/pacote e erro. Artefatos instalados para cada triple precisam identidade/recibo próprios; não inferir binário executável pelo mapa.',
 ['L-PACKAGE','L-PLATFORM'], gap=PACK)

c('PK02','SDK: resolução de pacote, layout novo/legacy e estat',
 [('CodexExec.constructor→findCodexPath',ref('exec',75,92)),('createRequire/resolve',ref('exec',411,431)),('resolveNativePackage→existingDirs/isFile/isDirectory',ref('exec',434,461)),('native executable spawn',ref('exec',203,206))],
 [ref('exec',411,461),ref('exec',492,506)], [
 b('resolve','resolve @openai/codex/package.json; createRequire dele resolve pacote plataforma','vendorRoot ao lado package.json de plataforma; qualquer erro no try é substituído por Unable to locate ... Ensure @openai/codex is installed with optional dependencies. Sem vendor local de fallback aqui.',ref('exec',411,421)),
 b('new-layout','isFile(vendor/triple/bin/codex[.exe]) && isFile(vendor/triple/codex-package.json)','Prefere novo binário e pathDirs existentes de codex-path; só verifica arquivo de marker, não lê conteúdo/assinatura nem bit executável.',ref('exec',434,446)),
 b('legacy','novo layout não satisfaz; legacy vendor/triple/codex/codex[.exe] é arquivo','Retorna legacy e pathDirs existentes em path; ausência/inacessibilidade do marker novo pode cair em legacy.',ref('exec',448,454)),
 b('missing','nenhum layout retorna','resolveNativePackage retorna null; findCodexPath lança erro com triple. Sem tentativa de baixar, instalar, PATH lookup ou wrapper JS no resolver normal.',ref('exec',425,431),ref('exec',456,457)),
 b('stat','statSync isFile/isDirectory / erro','Segue semântica statSync (não lstat); erro vira false, diretório path ausente é omitido; symlink/permissions/TOCTOU externos. Não faz autenticação do payload.',ref('exec',459,461),ref('exec',492,506))],
 'Futuro árvore sintética novo/legacy/ambos/missing marker/missing bin/path absent/stat errors e resolução de dependências; provar caminho escolhido, permissões e hash real do executável no recibo antes de execução autorizada; CLI wrapper tem fallback distinto.',
 ['L-PACKAGE','L-PLATFORM','L-CONCURRENCY'], gap=PACK)

c('PK03','PATH SDK: chaves Windows, dedupe e delimitador do host',
 [('exec.run pathDirs',ref('exec',199,206)),('prependPathDirs→pathEnvKey',ref('exec',463,490)),('spawn env',ref('exec',203,206))],
 [ref('exec',463,490)], [
 b('non-windows','platform !== win32','pathEnvKey retorna PATH; outras grafias não são removidas.',ref('exec',483,486)),
 b('windows-key','matchingKeys inclui Path / senão última / nenhuma','Prefere Path exato; senão matchingKeys.at(-1); senão PATH. Remove outras chaves case-insensitive path antes de montar.',ref('exec',468,475),ref('exec',488,489)),
 b('prepend','existing PATH ausente/vazio/com dirs repetidos','Split por path.delimiter do host, remove entradas vazias e iguais a pathDirs, antepõe pathDirs; não deduplica duplicatas restantes ou de pathDirs; comparação string literal.',ref('exec',477,480)),
 b('platform-parameter','argumento platform omitido / fornecido','Default process.platform; parâmetro muda seleção de key, não path.delimiter importado. Simulação de win32 em host Linux não prova delimitador Windows.',ref('exec',463,480))],
 'Futuro fixtures chaves PATH/Path/pAtH e ordem de inserção, entries vazias/duplicadas, dirs repetidos e host Linux/Windows real; comparar env resultante e não alegar paridade Windows a partir de parâmetro platform em Linux.',
 ['L-NODE','L-PLATFORM'], gap=PACK)

c('PK04','CLI wrapper: seleção de plataforma e fallback de vendor',
 [('CLI package bin',ref('cliPkg',6,8)),('top-level platform map/switch',ref('cli',16,77)),('findCodexExecutable',ref('cli',79,112)),('spawn',ref('cli',241,244))],
 [ref('cli',16,112)], [
 b('platform','linux/android/darwin/win32 x64/arm64 / resto','Mesmo mapa de seis triples e oito pares; plataforma/arch inválido lança Unsupported platform; map ausente lança Unsupported target triple separado.',ref('cli',16,77)),
 b('vendor-choice','require.resolve plataforma/package.json resolve / lança','Resolve relativo ao wrapper; erro usa __dirname/../vendor. Se pacote resolveu mas bin faltou, não tenta vendor local em seguida.',ref('cli',79,86)),
 b('binary-exists','existsSync(vendor/triple/bin/codex[.exe]) true / false','True retorna caminho sem isFile, marker codex-package.json, auth ou legacy; false chama detectPackageManager e lança missing optional dependency com dica de reinstalação. Dica não é instalação executada.',ref('cli',88,110)),
 b('update-message','PM bun / pnpm / vite-plus / demais','Dicas bun install -g, pnpm add -g, vp install -g ou npm install -g @openai/codex@latest; não inferir versão pinada de @latest.',ref('cli',98,109))],
 'Futuro fixtures resolução opcional sucesso/falha, resolved-but-missing, vendor local, diretório no lugar de bin e só layout legacy; conferir erro/dica e diferença do SDK, sem executar comando sugerido.',
 ['L-PACKAGE','L-PLATFORM'], gap=PACK)

c('PK05','CLI wrapper: heurísticas de package manager e ownership',
 [('findCodexExecutable missing or top-level',ref('cli',98,106)),('detectPackageManager',ref('cli',177,220)),('isVitePlusOwnedCodexInstall/isPnpmOwnedCodexInstall',ref('cli',120,171)),('manager env',ref('cli',222,239))],
 [ref('cli',120,239)], [
 b('pnpm-owner','node_modules/.modules.yaml ausente / presente com realpath igual / erro ou diferente','Ausente false; realpath(@openai/codex) deve igualar codexPackageRoot; exceção vira false. Só arquivo marker presente não prova ownership.',ref('cli',120,133)),
 b('vite-owner','basename packages / demais; metadata name igual / diferente','Fora packages false; JSON lido de @openai/codex.json, nome deve ser @openai/codex; installId truthy ou vazio; # usa prefixo antigo, resto subdiretório; busca lib/node_modules e node_modules, exists+realpath igual; erro suprimido e false.',ref('cli',135,171)),
 b('ancestor-search','canonical package root e lexical entrypoint diferentes/iguais','new Set preserva ordem; cada ancestral não-root tenta vite antes de pnpm; raiz só tenta pnpm no node_modules; primeiro retorno encerra busca. realpath top-level do packageRoot não tem catch.',ref('cli',10,14),ref('cli',181,200)),
 b('bun-heuristics','nenhum owner; userAgent bun / execpath inclui bun / __dirname contém .bun global','Após owners: regex bun no UA, depois substring bun em npm_execpath, depois paths Unix/Windows .bun/install/global.',ref('cli',202,217)),
 b('fallback','userAgent truthy / vazio após nenhuma heurística','Retorna npm ou null. Chamadas antes da falha de binário e após sua descoberta; fs/metadata mutável pode mudar diagnóstico entre chamadas, sem snapshot.',ref('cli',98,106),ref('cli',219,230))],
 'Futuro árvores sintéticas com canonical/lexical diferentes, conflitos vite/pnpm/bun, marker falso, symlinks e realpath mismatch, metadata antiga #/nova/sem ID/malformada/nome diferente; root pnpm e fallback npm/null; capturar só identidades sintéticas.',
 ['L-PACKAGE','L-NODE','L-CONCURRENCY'], gap=PACK)

c('PK06','CLI wrapper: ambiente, spawn e encaminhamento de sinais',
 [('find binary',ref('cli',112,112)),('detect manager→env',ref('cli',222,239)),('spawn inherited stdio',ref('cli',241,253)),('forwardSignal/exit',ref('cli',259,295))],
 [ref('cli',222,295)], [
 b('managed-env','manager bun/pnpm/vite-plus/outro','Copia process.env; define CODEX_MANAGED_PACKAGE_ROOT canônico; remove quatro flags managed e define só escolhida=1; null usa NPM. Não altera PATH aqui.',ref('cli',222,239)),
 b('launch-error','spawn retorna child / lança sync / emite error','spawn binaryPath, argv.slice(2), stdio inherit e env; error handler console.error + process.exit(1); spawn sync throw não tem catch explícito.',ref('cli',241,253)),
 b('forward','SIGINT/SIGTERM/SIGHUP; child.killed / não','Killed retorna, senão child.kill(signal), erro suprimido; handlers persistem, sem timeout/retry/wait close; comentário não prova terminação previsível.',ref('cli',259,272)),
 b('exit','child exit sinal / código','Promise resolve type signal se signal truthy, senão code com null→1; signal: process.kill(process.pid,sameSignal), sem remover os handlers registrados; código: process.exit(exitCode). Reenvio ao próprio PID pode reencontrar handler e não garante morrer pelo sinal.',ref('cli',270,295))],
 'Futuro Node/OS pinados, processo sintético: argv/env/stdio, erro spawn, códigos0/1/null e sinais reais com limite temporal e observação externa do wrapper/PID; verificar explicitamente possível sobrevivência por self-signal e child.killed, não corrigir comportamento esperado.',
 ['L-NODE','L-PLATFORM','L-CONCURRENCY'], gap=PACK)

c('PK07','Proxy wrapper JS: target e layout isolados',
 [('proxy JS top-level',ref('proxy',8,11)),('determineTargetTriple',ref('proxy',11,42)),('vendor path',ref('proxy',44,58)),('spawn',ref('proxy',60,62))],
 [ref('proxy',8,62)], [
 b('targets','linux/android x64/arm64; darwin x64/arm64; win32 x64/arm64','Retorna os seis triples equivalentes ao mapa CLI; arch não suportada ou platform default retorna null.',ref('proxy',11,42)),
 b('unsupported','!targetTriple','Lança Unsupported platform: platform (arch). Sem mapa de pacote opcional ou instalação dinâmica neste wrapper.',ref('proxy',44,49)),
 b('layout','win32 / demais','__dirname/../vendor/triple/codex-responses-api-proxy/codex-responses-api-proxy[.exe]; não faz exists/stat nem fallback antes do spawn.',ref('proxy',51,62))],
 'Futuro oito pares suportados e inválidos, layout faltante e nome .exe; comparar path sem substituir por layout CLI bin/codex. Não invocar serviço proxy/rede para aceitar esta inferência estática.',
 ['L-PACKAGE','L-PLATFORM'], gap=PACK)

c('PK08','Proxy wrapper: spawn herdado, erros e self-signal',
 [('proxy path',ref('proxy',51,58)),('spawn/error',ref('proxy',60,67)),('forwardSignal',ref('proxy',69,81)),('exit/self-signal',ref('proxy',83,97))],
 [ref('proxy',60,97)], [
 b('launch','spawn retorna / lança sync / emite error','argv.slice(2), stdio inherit; env não é passado (depende de default Node), nenhum marcador managed é criado. Error event imprime err e process.exit(1); sync sem catch.',ref('proxy',60,67)),
 b('forward','SIGINT/SIGTERM/SIGHUP; !child.killed / killed','Se não killed tenta kill(signal) e suprime exceção; caso killed não faz nada; handlers sem remoção.',ref('proxy',69,81)),
 b('termination','exit com sinal / código null ou numérico','Signal resolve objeto e process.kill(process.pid, signal); handlers próprios ainda ativos. Código usa null→1 e process.exit. Não há finally de processo, close await, deadline ou teardown comprovado.',ref('proxy',79,97))],
 'Futuro child sintético sem tráfego proxy: ambiente herdado, argumentos, error event, códigos e SIGINT/SIGTERM/SIGHUP com monitor externo e timeout; observar se self-signal é absorvido pelo handler e se há processos restantes.',
 ['L-NODE','L-PLATFORM','L-CONCURRENCY'], gap=PACK)

c('PK09','Identidades Git, manifests e artefato distribuído',
 [('SDK manifest export',ref('sdkPkg',1,36)),('SDK src index',ref('index',26,40)),('CLI manifest bin',ref('cliPkg',1,22)),('CLI/SDK binary resolver',ref('exec',411,456)),('proxy vendor resolver',ref('proxy',51,62))],
 [ref('sdkPkg',1,36),ref('cliPkg',1,22),ref('index',26,40)], [
 b('sdk-declaration','manifest pinado','name @openai/codex-sdk; version 0.0.0-dev; ESM, engines node>=18, exports import dist/index.js e types dist/index.d.ts, files dist; src index exporta publicamente Codex/Thread mas não CodexExec. Dist/publicação/assinatura não inspecionados.',ref('sdkPkg',1,36),ref('index',26,40)),
 b('cli-declaration','manifest pinado','name @openai/codex; version 0.0.0-dev; bin codex:bin/codex.js; node>=16; files só bin/codex.js. Manifest fonte não declara optionalDependencies aqui, mesmo com wrapper esperando pacote plataforma.',ref('cliPkg',1,22)),
 b('no-artifact-equivalence','Git SHA e blobs disponíveis / pacote runtime/binário não adquirido','Git pin autentica texto selecionado, não runtime instalado, wheel, conteúdo codex-package.json, ABI, npm tarball ou proxy binário. Resolvers por path/stat/exists não verificam hash/assinatura.',ref('exec',411,456),ref('cli',79,96),ref('proxy',51,62))],
 'Obrigação futura exata: aquisição autorizada por plataforma e recibo de tarball/pacote binário com versão, hash, assinatura/procedência, resolução real dos paths e Node/OS; correlacionar Git/SDK/CLI/runtime sem equiparar 0.0.0-dev ao commit ou a versão Python. Lead mantém a outra metade Python/proveniência.',
 ['L-PACKAGE','L-PLATFORM'], gap=PACK)

LIMITS = {
 'L-NODE': 'UNKNOWN: sem executar Node APIs do alvo; semântica de async generators/readline/Abort/stdio/kill/exit depende de Node/OS. Futuro Node pinado com processo sintético supervisionado e timeout/PIDs/erro/cause/liveness em recibo.',
 'L-CLI': 'UNKNOWN: interpretação das flags/config, defaults efetivos e produção real dos eventos pela CLI não executadas. Futuro oráculo autorizado da CLI pinada separado do teste de formação de argv/JSONL; implementação nativa CVG não pode simplesmente encaminhar execução ao Codex instalado.',
 'L-SCHEMA': 'UNKNOWN: nenhuma criação/remoção de arquivo pelo SDK; falhas fs/serialização e liveness do temporário precisam fixture isolado com faults e inspeção antes/depois. Validar saída de modelo não é efeito deste helper.',
 'L-PACKAGE': 'UNKNOWN: sem resolução/import alvo, pacote instalado, tarball, wheel ou binário autenticado. Futuro recibo por artefato e plataforma com hash/versão/procedência, árvore de dependências/paths e vínculo explícito à fonte.',
 'L-PLATFORM': 'UNKNOWN: não foi simulada nem executada plataforma alvo; libc/ABI/CPU/permissões/Windows PATH e sinais exigem oráculos por host. Mapas de strings não são suporte funcional comprovado.',
 'L-CONCURRENCY': 'UNKNOWN: corridas abort/error/EOF/exit/close/return, concorrência no mesmo Thread, fs TOCTOU e self-signal não executadas. Futuro schedules finitos/barreiras/timeouts com processo monitor externo e estado antes/depois; registrar hangs e prioridades de erro literais.',
 'L-AUTH': 'UNKNOWN: formação de env com chaves sintéticas não prova autenticação/autorização da CLI/provider. Futuro teste autorizado com segredos sintéticos e servidor controlado; nenhuma conta/token real nesta coleta.',
}

# Only selected edges used by the contracts, not a new function/export census.
EDGE_DEFS = [
 ('codex-constructor','Codex.constructor','CodexExec.constructor','codex',17,'CodexExec'),
 ('start-thread','Codex.startThread','Thread.constructor','codex',26,'Thread'),
 ('resume-thread','Codex.resumeThread','Thread.constructor','codex',37,'Thread'),
 ('stream-entry','Thread.runStreamed','Thread.runStreamedInternal','thread',67,'this.runStreamedInternal'),
 ('run-entry','Thread.run','Thread.runStreamedInternal','thread',120,'this.runStreamedInternal'),
 ('schema-call','Thread.runStreamedInternal','createOutputSchemaFile','thread',74,'createOutputSchemaFile'),
 ('normalize-call','Thread.runStreamedInternal','normalizeInput','thread',76,'normalizeInput'),
 ('exec-call','Thread.runStreamedInternal','CodexExec.run','thread',77,'this._exec.run'),
 ('jsonl-parse','Thread.runStreamedInternal','JSON.parse','thread',102,'JSON.parse'),
 ('thread-cleanup','Thread.runStreamedInternal finally','schema cleanup closure','thread',114,'cleanup'),
 ('exec-config','CodexExec.run','serializeConfigOverrides','exec',98,'serializeConfigOverrides'),
 ('config-flatten','serializeConfigOverrides','flattenConfigOverrides','exec',270,'flattenConfigOverrides'),
 ('flatten-recursive','flattenConfigOverrides','flattenConfigOverrides','exec',307,'flattenConfigOverrides'),
 ('config-toml','flattenConfigOverrides','toTomlValue','exec',309,'toTomlValue'),
 ('sdk-spawn','CodexExec.run','node:child_process.spawn','exec',203,'spawn'),
 ('exec-readline','CodexExec.run','node:readline.createInterface','exec',238,'readline.createInterface'),
 ('exec-kill','CodexExec.run finally','child.kill','exec',260,'child.kill'),
 ('find-binary','CodexExec.constructor','findCodexPath','exec',85,'findCodexPath'),
 ('native-layout','findCodexPath','resolveNativePackage','exec',424,'resolveNativePackage'),
 ('sdk-path','CodexExec.run','prependPathDirs','exec',200,'prependPathDirs'),
 ('path-key','prependPathDirs','pathEnvKey','exec',468,'pathEnvKey'),
 ('cli-find','CLI top-level','findCodexExecutable','cli',112,'findCodexExecutable'),
 ('cli-pm','CLI top-level','detectPackageManager','cli',222,'detectPackageManager'),
 ('cli-spawn','CLI top-level','node:child_process.spawn','cli',241,'spawn'),
 ('cli-kill','forwardSignal','child.kill','cli',264,'child.kill'),
 ('cli-self-signal','CLI exit handler continuation','process.kill','cli',292,'process.kill'),
 ('proxy-target','proxy top-level','determineTargetTriple','proxy',44,'determineTargetTriple'),
 ('proxy-spawn','proxy top-level','node:child_process.spawn','proxy',60,'spawn'),
 ('proxy-kill','proxy.forwardSignal','child.kill','proxy',72,'child.kill'),
 ('proxy-self-signal','proxy exit handler continuation','process.kill','proxy',94,'process.kill'),
]

# Literal guards that establish meaningful semantic joins beyond hashing. These do
# not purport to validate all JS effects; edits require manual review of annotation.
SEMANTIC_ANCHORS = [
 ('thread',102,'parsed = JSON.parse(item) as ThreadEvent;'),
 ('thread',109,'parsed.usage.cache_write_input_tokens ??= 0;'),
 ('thread',133,'event.type === "turn.failed"'),
 ('exec',184,'if (this.envOverride)'),
 ('exec',205,'signal: args.signal'),
 ('exec',232,'child.once("exit", (code, signal)'),
 ('exec',251,'if (code !== 0 || signal)'),
 ('exec',260,'if (!child.killed) child.kill();'),
 ('exec',441,'isFile(packageBinaryPath) && isFile(path.join(packageRoot, "codex-package.json"))'),
 ('cli',94,'if (existsSync(codexExecutable))'),
 ('cli',292,'process.kill(process.pid, childResult.signal);'),
 ('proxy',94,'process.kill(process.pid, childResult.signal);'),
]


def derive():
 assert git('rev-parse','HEAD').decode().strip() == PIN
 previous = json.loads((BASE/'typescript/inventory.json').read_bytes())
 accepted = json.loads((BASE/'integration.json').read_bytes())
 historical = {x['id']: x for x in accepted['mandatory_gaps']} if 'mandatory_gaps' in accepted else {}
 # Select authoritative gap records by shape, not a new catalog entry.
 def collect(x):
  if isinstance(x,dict):
   if x.get('id') in ('GAP-TS-LANGUAGE',PACK) and 'required_source_obligation' in x:
    historical[x['id']] = x
   for v in x.values(): collect(v)
  elif isinstance(x,list):
   for v in x: collect(v)
 collect(accepted)
 assert all('required_source_obligation' in historical[g] for g in ('GAP-TS-LANGUAGE',PACK))
 assert previous['counts']['root_exports']==34 and previous['counts']['functions_and_signatures']==36
 assert len(previous['source_rules'])==5 and previous['counts']['TS_modules']==10
 inputs=[]
 for p in [HERE.parent/'task.json', BASE/'typescript/inventory.json',BASE/'typescript/README.md',BASE/'integration.json']:
  raw=p.read_bytes(); inputs.append({'path':str(p.relative_to(ROOT)),'sha256':sha(raw),'bytes':len(raw)})
 parser_files=[]
 for f in previous['analysis_tool']['files'][:2]:
  p=Path(f['resolved_path']); raw=p.read_bytes(); assert sha(raw)==f['sha256']
  parser_files.append({'resolved_path':str(p),'sha256':sha(raw),'bytes':len(raw)})
 data={}; sources=[]; archives={}
 for alias,path in ALIASES.items():
  raw=git('show',f'{PIN}:{path}')
  assert raw==(UP/path).read_bytes(), f'worktree differs from pinned blob: {path}'
  raw.decode('utf8', errors='strict')
  blob=git('rev-parse',f'{PIN}:{path}').decode().strip()
  assert hashlib.sha1(b'blob '+str(len(raw)).encode()+b'\0'+raw).hexdigest()==blob
  row=git('ls-tree',PIN,'--',path).decode().strip()
  archive=f'archives/{alias}.source.txt'; archives[archive]=raw
  data[alias]=raw
  sources.append({'alias':alias,'path_git':path,'pin':PIN,'git_blob':blob,
   'sha256':sha(raw),'bytes':len(raw),'lines':len(raw.splitlines()),
   'git_tree_entry':row,'archive':archive,'archive_sha256':sha(raw)})
 def span(r):
  alias,start,end=r; raw=data[alias]; lines=raw.splitlines(keepends=True)
  assert 1<=start<=end<=len(lines), (alias,start,end,len(lines))
  begin=sum(map(len,lines[:start-1])); stop=sum(map(len,lines[:end])); content=raw[begin:stop]
  return {'path_git':ALIASES[alias],'file_sha256':sha(raw),'git_blob':next(s['git_blob'] for s in sources if s['alias']==alias),
   'start_line':start,'end_line':end,'start_byte':begin,'end_byte_exclusive':stop,
   'sha256':sha(content),'text':content.decode('utf8')}
 payload={'parser_files':parser_files,'parser_module':parser_files[1]['resolved_path'],
  'sources':[{'path':ALIASES[a],'text':raw.decode()} for a,raw in data.items()]}
 ast_input=encoded(payload)
 ast_output=subprocess.check_output([NODE,str(HERE/'inspect-control-flow.mjs')],input=ast_input)
 ast=json.loads(ast_output)
 ast_receipt={'argv':[NODE,str(HERE/'inspect-control-flow.mjs')], 'exit_code':0,
  'stdin_sha256':sha(ast_input),'stdout_sha256':sha(ast_output),'stdout_bytes':len(ast_output),
  'scope':'LOCAL_PARSER_EXECUTED_ONLY; input is text, no target import/evaluation'}
 contracts=[]
 for d in DEFS:
  row={k:copy.deepcopy(v) for k,v in d.items() if not k.startswith('_') and k!='branches'}
  hist=historical[row['gap_id']]
  row.update({'owner':hist['owner'],'variant_obligation_id':hist['required_source_obligation']['variant_obligation_id'],
   'existing_owner_requirements':hist['required_source_obligation']['existing_owner_requirements'],
   'historical_rule_requirements':sorted({req for rule in previous['source_rules'] if rule['id'] in row['historical_rule_ids'] for req in rule['requirements']}),
   'gap_status':'OPEN','source_status':'IMPLEMENTED_SOURCE_CONTRACTS','qualification':'NOT_RUN','receipt':None,
   'source_excerpts':[span(r) for r in d['_refs']],
   'chain':[{'step':label,'source':span(r),'binding':'LEXICAL_SOURCE_CANDIDATE_NO_TYPECHECK_OR_RUNTIME_DISPATCH'} for label,r in d['_chain']],
   'expectation':{'text':d['future_oracle'],'qualification':'NOT_RUN','receipt':None}})
  del row['future_oracle']
  row['branches']=[]
  for i,br in enumerate(d['branches'],1):
   row['branches'].append({'id':f"{d['id']}.B{i:02d}",'name':br['name'],'condition':br['condition'],
    'source_excerpts':[span(r) for r in br['_refs']],
    'expectation':{'text':br['source_effect'],'kind':'LITERAL_SOURCE_OBLIGATION_TO_CHECK_IN_FUTURE','qualification':'NOT_RUN','receipt':None}})
  contracts.append(row)
 edges=[]
 for eid,caller,callee,alias,line,lexical in EDGE_DEFS:
  candidates=[x for x in ast['calls'] if x['path']==ALIASES[alias] and x['start_line']==line and x['callee']==lexical]
  assert len(candidates)==1,(eid,candidates)
  call=candidates[0]
  raw=data[alias][call['start_byte']:call['end_byte_exclusive']]
  edges.append({'id':eid,'caller':caller,'callee_candidate':callee,'lexical_callee':lexical,
   'qualification':'NOT_RUN','receipt':None,'binding':'SOURCE_CALL_SYNTAX_NOT_TYPECHECKED',
   'source':{**{k:v for k,v in call.items() if k not in ('path','callee')},
    'path_git':call['path'],'file_sha256':sha(data[alias]),'sha256':sha(raw)}})
 # Exact byte spans of branch predicates/loops/catches/finally markers, not hits
 # in comments/regex. Coverage means linked annotation, never branch execution.
 sites=[]
 for i,site in enumerate(ast['sites'],1):
  alias=next(a for a,p in ALIASES.items() if p==site['path']); raw=data[alias]
  matched=[]
  for row in contracts:
   for br in row['branches']:
    if any(s['path_git']==site['path'] and s['start_byte']<=site['start_byte'] and s['end_byte_exclusive']>=site['end_byte_exclusive'] for s in br['source_excerpts']):matched.append(br['id'])
  sites.append({**{k:v for k,v in site.items() if k!='path'},'path_git':site['path'],
   'id':f'CF{i:03d}','sha256':sha(raw[site['start_byte']:site['end_byte_exclusive']]),
   'annotation_branch_ids':matched,'status':'LINKED_ANNOTATION_NOT_RUNTIME_COVERAGE' if matched else 'INCOMPLETE_NO_ANNOTATION'})
 incomplete=[s['id'] for s in sites if not s['annotation_branch_ids']]
 for alias,line,literal in SEMANTIC_ANCHORS:
  assert literal in data[alias].decode().splitlines()[line-1],(alias,line,literal)
 src={'schema_version':'cvg.codex100.sdk-open-contracts.typescript.sources.v1','task':'DX100-G01:RECONCILE-OPEN-SDK-CONTRACTS',
  'pin':PIN,'source_root':str(UP),'method':'PINNED_GIT_BLOB_AND_UTF8_SPANS_WITH_LOCAL_TYPESCRIPT_SYNTAX_ONLY',
  'selected_sources':sources,'metadata_inputs':inputs,'parser_files':parser_files,
  'parser_version':ast['parser_version'],'ast_parser_receipt':ast_receipt,'git_command_receipts':GIT_RECEIPTS,'control_flow_sites':sites,
  'coverage_limits':{'unannotated_control_flow_site_ids':incomplete,
   'lexical_annotation_completeness':'INCOMPLETE' if incomplete else 'ALL_SELECTED_AST_SITES_LINKED',
   'semantic_branch_exhaustiveness':'NOT_PROVEN_MANUAL_GROUPS_INCLUDE_BOTH_ARMS_EXTERNALS_UNKNOWN',
   'control_flow_scope':'if/switch/case/default/conditional/&&/||/??/??=/loop-header/catch/finally in the selected 12 files; not CFG, runtime reachability, implicit exceptions, typechecking or branch coverage',
   'runtime_branch_coverage':'NOT_RUN'}}
 result={'schema_version':'cvg.codex100.sdk-open-contracts.typescript.contracts.v1',
  'task':'DX100-G01:RECONCILE-OPEN-SDK-CONTRACTS','pin':PIN,'status':'IMPLEMENTED_SOURCE_CONTRACTS',
  'qualification':'NOT_RUN','receipt':None,'functional_receipts':0,'full_g01_closure':False,
  'historical_preservation':{'input':str((BASE/'typescript/inventory.json').relative_to(ROOT)),
   'root_exports':34,'functions_and_signatures':36,'TS_modules':10,'source_rules':5,
   'statement':'Historical counts are unchanged inputs; this packet adds branch obligations, not a new export/function census.'},
  'gaps':[historical[g] for g in ('GAP-TS-LANGUAGE',PACK)],'contracts':contracts,'selected_call_relations':edges,
  'external_limits':[{'id':k,'status':'UNKNOWN','qualification':'NOT_RUN','receipt':None,'future_obligation':v} for k,v in LIMITS.items()],
  'coverage_limits':src['coverage_limits'],'handoff':{'last_completed_action':'12 pinned text sources archived and branch/chain obligations derived; static verification only',
   'next_action':'Lead integrates Python/generated/provenance and all six gap joins, then independent review in own budget. Future runtime fixtures need separate authorized execution; no new human question requested by this scout.',
   'status':'IMPLEMENTED_SOURCE_CONTRACTS','masters_coord_catalog_spec_written':False}}
 return src,result,archives,ast


def validate(src,result,archives,ast):
 assert len(src['selected_sources'])==12
 assert result['pin']==PIN and result['status']=='IMPLEMENTED_SOURCE_CONTRACTS'
 assert result['qualification']=='NOT_RUN' and result['receipt'] is None
 assert result['functional_receipts']==0 and result['full_g01_closure'] is False
 assert [x['id'] for x in result['contracts']]==[x['id'] for x in DEFS]
 assert len(result['contracts'])==24
 sources={s['path_git']:s for s in src['selected_sources']}
 def check_span(s):
  row=sources[s['path_git']]; raw=archives[row['archive']]
  assert len(raw)==row['bytes'] and sha(raw)==row['sha256']
  piece=raw[s['start_byte']:s['end_byte_exclusive']]
  assert piece.decode('utf8')==s['text'] and sha(piece)==s['sha256']
  assert raw[:s['start_byte']].count(b'\n')+1==s['start_line']
  assert raw[:s['end_byte_exclusive']-1].count(b'\n')+1==s['end_line']
  if 'file_sha256' in s:assert s['file_sha256']==row['sha256']
  if 'git_blob' in s:assert s['git_blob']==row['git_blob']
 gaps={g['id']:g for g in result['gaps']}; assert set(gaps)=={'GAP-TS-LANGUAGE',PACK}
 branch_ids=set()
 for row,d in zip(result['contracts'],DEFS):
  g=gaps[row['gap_id']]
  assert row['gap_id']==d['gap_id']
  assert row['owner']==g['owner']==('DX100-Z02' if row['gap_id']==PACK else 'DX100-D01')
  assert row['existing_owner_requirements']==g['required_source_obligation']['existing_owner_requirements']
  assert row['variant_obligation_id']==g['required_source_obligation']['variant_obligation_id']
  assert row['gap_status']=='OPEN' and row['qualification']=='NOT_RUN' and row['receipt'] is None
  assert row['expectation']['qualification']=='NOT_RUN' and row['expectation']['receipt'] is None
  assert len(row['branches'])==len(d['branches'])
  assert [br['name'] for br in row['branches']]==[br['name'] for br in d['branches']]
  for s in row['source_excerpts']:check_span(s)
  assert [step['step'] for step in row['chain']]==[label for label,_ in d['_chain']]
  for step in row['chain']:check_span(step['source'])
  for br in row['branches']:
   assert br['id'] not in branch_ids;branch_ids.add(br['id'])
   assert br['expectation']['qualification']=='NOT_RUN' and br['expectation']['receipt'] is None
   assert br['condition'] and br['expectation']['text'] and br['source_excerpts']
   for s in br['source_excerpts']:check_span(s)
 assert [e['id'] for e in result['selected_call_relations']]==[d[0] for d in EDGE_DEFS]
 for e,d in zip(result['selected_call_relations'],EDGE_DEFS):
  check_span(e['source'])
  assert (e['caller'],e['callee_candidate'],e['lexical_callee'])==(d[1],d[2],d[5])
  assert any(call['path']==e['source']['path_git'] and call['start_byte']==e['source']['start_byte'] and call['end_byte_exclusive']==e['source']['end_byte_exclusive'] and call['callee']==e['lexical_callee'] for call in ast['calls'])
 for site in src['control_flow_sites']:
  check_span(site)
  expected=[br['id'] for row in result['contracts'] for br in row['branches'] if any(s['path_git']==site['path_git'] and s['start_byte']<=site['start_byte'] and s['end_byte_exclusive']>=site['end_byte_exclusive'] for s in br['source_excerpts'])]
  assert site['annotation_branch_ids']==expected
  assert set(expected)<=branch_ids
 incomplete=[s['id'] for s in src['control_flow_sites'] if not s['annotation_branch_ids']]
 assert incomplete==src['coverage_limits']['unannotated_control_flow_site_ids']
 assert result['coverage_limits']==src['coverage_limits']
 assert all(l in LIMITS for row in result['contracts'] for l in row['external_limits'])
 for inp in src['metadata_inputs']:
  raw=(ROOT/inp['path']).read_bytes();assert sha(raw)==inp['sha256'] and len(raw)==inp['bytes']


def negative_controls(src,result,archives,ast):
 controls=[]
 def reject(name,mutator):
  s,r,a=copy.deepcopy(src),copy.deepcopy(result),copy.deepcopy(ast)
  mutator(s,r,a)
  try:validate(s,r,archives,a)
  except (AssertionError,KeyError,IndexError):controls.append({'id':name,'result':'REJECTED_STATIC_DATA_MUTATION','runtime':'NOT_RUN'});return
  raise AssertionError(f'negative control accepted: {name}')
 reject('wrong-gap-owner',lambda s,r,a:r['contracts'][0].update(owner='DX100-Z02'))
 reject('wrong-existing-requirement-join',lambda s,r,a:r['contracts'][0].update(existing_owner_requirements=['CDX100-22-08']))
 reject('omit-normalize-before-try-branch',lambda s,r,a:r['contracts'][3]['branches'].pop(0))
 reject('drop-schema-cleanup-chain-step',lambda s,r,a:r['contracts'][3]['chain'].pop())
 reject('wrong-jsonl-callee-binding',lambda s,r,a:next(e for e in r['selected_call_relations'] if e['id']=='jsonl-parse').update(callee_candidate='JSON.stringify'))
 reject('omit-exec-signal-call',lambda s,r,a:r['selected_call_relations'].pop(14))
 reject('detach-predicate-annotation',lambda s,r,a:s['control_flow_sites'][0].update(annotation_branch_ids=[]))
 reject('corrupt-excerpt-lines',lambda s,r,a:r['contracts'][0]['source_excerpts'][0].update(start_line=1))
 reject('false-runtime-credit',lambda s,r,a:r['contracts'][0]['expectation'].update(qualification='PASS',receipt='synthetic'))
 # Contraprova syntax: replacing the actual parse callee in the AST fact table,
 # while retaining the annotated callee, must fail the source/call join.
 reject('source-call-fact-json-parse-to-stringify',lambda s,r,a:next(x for x in a['calls'] if x['path']==ALIASES['thread'] and x['start_line']==102 and x['callee']=='JSON.parse').update(callee='JSON.stringify'))
 return controls


def main():
 assert sys.argv[1:] in (['--write'],['--check']), 'Use --write or --check'
 src,result,archives,ast=derive(); validate(src,result,archives,ast)
 negatives=negative_controls(src,result,archives,ast)
 verification={'status':'PASS_STATIC_WITH_EXPLICIT_LIMITS','qualification':'NOT_RUN','receipt':None,
  'checks':['Git HEAD and pinned blob/worktree byte equality','Git blob SHA-1 and file SHA-256/size','UTF8 exact byte/line/excerpt joins','existing gap-owner-requirement joins','historical 34 exports/36 signatures/10 modules/5 rules unchanged input; original rule requirements kept separately from mandatory gap joins','selected public-to-helper-call lexical AST joins','AST control-site annotation joins; missing sites reported explicitly','no runtime credit allowed','prior metadata inputs hash/size','regeneration bytes and manifest outputs during --check'],
  'negative_controls':negatives,'selected_sources':len(src['selected_sources']),
  'contract_scenarios':len(result['contracts']),'unannotated_control_flow_sites':src['coverage_limits']['unannotated_control_flow_site_ids'],
  'semantic_exhaustiveness':'NOT_PROVEN','runtime_tests':'NOT_RUN','functional_receipts':0,
  'tooling':{'python':'stdlib text/json/hash/pathlib/subprocess(Git and local TypeScript parser only)',
   'node':NODE,'typescript_parser_version':ast['parser_version'],'target_imports':0,'target_exec':0,'typecheck':False,'emit':False}}
 generated={'sources.json':encoded(src),'contracts.json':encoded(result),'verification.json':encoded(verification),**archives}
 if '--write' in sys.argv:
  for name,raw in generated.items():(HERE/name).write_bytes(raw)
 else:
  for name,raw in generated.items():assert (HERE/name).read_bytes()==raw, f'output differs: {name}'
 # Hash the reader, parser and prose too. Manifest itself is not self-hashed.
 payloads=sorted([*generated,'reader.py','inspect-control-flow.mjs','report.md'])
 manifest={'schema_version':'cvg.codex100.sdk-open-contracts.typescript.manifest.v1',
  'task':result['task'],'status':'IMPLEMENTED_SOURCE_CONTRACTS','pin':PIN,
  'qualification':'NOT_RUN','receipt':None,'source_inputs':src['selected_sources'],
  'metadata_inputs':src['metadata_inputs'],'parser_files':src['parser_files'],
  'git_command_receipts':src['git_command_receipts'],'ast_parser_receipt':src['ast_parser_receipt'],
  'outputs':[{'path':p,'sha256':sha((HERE/p).read_bytes()),'bytes':(HERE/p).stat().st_size} for p in payloads],
  'manifest_self_hash':'EXCLUDED_TO_AVOID_SELF_REFERENCE; lead may bind this file in parent manifest',
  'commands':[
   'git -C /tmp/cvg-rea-codex-20261017/upstream rev-parse HEAD',
   'git -C /tmp/cvg-rea-codex-20261017/upstream ls-tree -r --name-only HEAD (filtered locally for wrappers/proxy)',
   'git -C /tmp/cvg-rea-codex-20261017/upstream show PIN:PATH; rev-parse PIN:PATH; ls-tree PIN -- PATH (each of selected sources)',
   'nl -ba/read-only text inspection of selected source files',
   'python3 '+str(HERE.relative_to(ROOT)/'reader.py')+' --write',
   'python3 '+str(HERE.relative_to(ROOT)/'reader.py')+' --check',
   NODE+' '+str(HERE.relative_to(ROOT)/'inspect-control-flow.mjs')+' < in-memory JSON pinned source text (launched by reader; no target import)'],
  'proofs':'verification.json','control_flow_limits':src['coverage_limits'],
  'forbidden_operations_executed':[],'functional_receipts':0}
 raw=encoded(manifest)
 if '--write' in sys.argv:(HERE/'manifest.json').write_bytes(raw)
 else:assert (HERE/'manifest.json').read_bytes()==raw,'manifest differs'
 print(json.dumps({'status':'IMPLEMENTED_SOURCE_CONTRACTS','sources':len(src['selected_sources']),
  'scenarios':len(result['contracts']),'negative_controls_rejected':len(negatives),
  'unannotated_control_flow_site_ids':src['coverage_limits']['unannotated_control_flow_site_ids'],
  'runtime':'NOT_RUN','semantic_exhaustiveness':'NOT_PROVEN'},ensure_ascii=False))

if __name__=='__main__': main()
