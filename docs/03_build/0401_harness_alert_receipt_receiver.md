# 0401 — U13/SRV-01: receptor privado com recibo e entrega rastreável

23/10/2026. Task `GBRAIN-LOOP-U13-RCV`. **PROPOSED / SPEC**, sem BUILD autorizado
por este documento. Fonte9a56; emissor0400 aprovado apenas no componente local,
aggregate893088a2, contrato619c45d7. O programa continua sujeito à barra0373,
U10/U12/U16 e ao gateT4 para destino, segredo no Vault, segunda máquina e envio real.

## 1. Problema e escopo

[Recon reproduzida](../04_audit/evidence/GBRAIN-LOOP-20261023/u13/receiver-gap/REPORT.md):
o emissor real recebe401 do relay existente pelo timestamp epoch; com timestampISO
o mesmo corpo recebe400; o controle legado recebe200/outcome, sem recibo. O relay
atual não é receptor compatível nem deve receber um proxy que fabrique confirmação.

SRV-01 no0374 publicado9a56 exige contrato monitor–receptor com recibo e repasse
aoTelegram, com classificaçãoT2. Esta fatia propõe componente **privado de
operações**, sem alterar API da aplicação, tenant/roles/policy, contratos de
pacote, schema de negócio, relay legado ou o produto. Autenticação HMAC e arquivos
privados seguem os mecanismos vigentes. A revisão técnica deve confirmar a
classificação antes de código; ingresso público, política nova ou outro gatilhoT3
exige a autoridade correspondente. Nenhum socket público/servidor hospital,
segredo real ou Telegram real é autorizado por esta SPEC.

Novos módulos privados previstos em `deploy/harness/alert-receipt-receiver/**`,
testes `tests/deploy-harness-alert-receipt-receiver.test.js` e ensaio
`tests/deploy-harness-monitor-receiver.test.js`, somente numa candidata própria
futura. Não editar os seis fontes congelados da certificação559c34a7 em curso.
Nenhum import de `products/**`, alteração de dependência/lockfile, export público
ou instalação automática. Linux/Node22/flock/disco local; NFS não qualificado.

## 2. Significado do recibo e escolha de arquitetura

**HTTP201 comprova aceitação durável do evento no receptor.** Não comprova envio
aoTelegram nem leitura por Ricardo. A aceitação e a pendência de encaminhamento
são uma única publicação atômica, antes do201. O status de encaminhamento e o
messageId confirmado são evidências separadas e persistidas. SRV-01 só termina
quando o ensaio real comprovar a cadeia inteira, não apenas201.

Selecionado inbox/outbox pequeno no mesmo snapshot privado. Justificativa: o
emissor tem timeout2s e precisa de recibo repetível; Telegram pode demorar/falhar
e o processo pode cair depois do aceite. Aguardar o canal antes de persistir não
resolve receipt perdido, e memória não mantém a deduplicação após restart.
Rejeitados: proxy200→201, tradução readiness_unavailable→worker_down, importar
storage do produto e introduzir broker/banco para este conjunto pequeno.

Custo assumido: estado próprio, fila limitada, observação/reconciliação e novo
processo operacional. O receiver não deve depender da API observada para gravar
recibo ou despachar. Localização final e supervisão do próprio receiver são
aceitesT4; sua falha não pode ser declarada coberta por ele mesmo.

## 3. Configuração e entrada privada

`HARNESS_RECEIVER_STATE_DIR`, `HARNESS_RECEIVER_HMAC_FILE`,
`HARNESS_RECEIVER_BOT_TOKEN_FILE`, `HARNESS_RECEIVER_CHAT_ID_FILE` são caminhos
absolutos obrigatórios, até4096caracteres, sem NUL. O HMAC usa **exatamente** o
`loadSecret` do emissor0400: até4096bytes originais, UTF8 válido por roundtrip,
decode e `trimEnd()` ECMAScript, mínimo32 unidades de código UTF16 após trim,
sem NUL. Reusar a função privada congelada `loadSecret({secretFile:hmacFile})`
para não criar outro normalizador. SPACE+LF, CRLF, repetição de LF e whitespace
Unicode final seguem o mesmo `trimEnd()`; caracteres que ele não remove são
conservados nos dois lados. Chave curta após trim/UTF8 malformado/NUL/4097bytes
recusa antes de escutar. A regra não muda o mecanismo/bytes do emissor.

Token e chatId têm regra **separada**: token ASCII16–512caracteres de
`[A-Za-z0-9:_-]`, chatId UTF8 não vazio até256bytes sem controles. Neles, remover
somente uma quebra final LF/CRLF, sem trim amplo nem alteração dos espaços
internos; validar UTF8 por roundtrip. Arquivos regulares0400/0600,
mesmoUID, nlink1, sem symlink final; lstat antes de open e fd revalidado com
O_NOFOLLOW/O_NONBLOCK antes da leitura limitada. Sem tokens/ChatId em argv/log.
Segredos lidos uma vez; rotação pelo procedimento operacional e restart.

Listener **fixo127.0.0.1**, sem override por Host/Origin/X-Forwarded-\*.
`HARNESS_RECEIVER_PORT` default8791, inteiro1024–65535; porta0 somente no perfil
de teste. Produção de rede requer proxyHTTPS interno/destino qualificadoT4, fora
do BUILD local. Não adicionar este listener ao compose do hospital nesta fatia.

`HARNESS_RECEIVER_INTERVAL_MS` default1000, inteiro100–60000;
`HARNESS_RECEIVER_TIMEOUT_MS` default5000, inteiro100–10000. Não há sobreposição de
dispatch: enviar um evento e depois esperar o intervalo. Perfil de teste exige
**ambos** `NODE_ENV=test` e `HARNESS_RECEIVER_TEST_HTTP=1`; permite mínimos10ms e
override de Telegram somente para URLHTTP loopback exata, sem query/fragmento,
userinfo ou redirects. Fora desse perfil a flag e o override são recusados e o
destino é fixoHTTPS `api.telegram.org`, método `sendMessage`. A implementação
local só executará os endpoints simulados explicitamente registrados nos testes.

Entrada: `POST /alert`, corpoUTF8 até4096bytes, chaves/IDs/datas/relações do evento
0400; rejeitar UTF8 malformado e extras. O SHA256 e o HMAC usam os bytes recebidos,
sem reserialização. `x-cvg-alert-timestamp` é o epoch-ms decimal canônico emitido
por0400: regex `^(0|[1-9][0-9]{0,15})$`, inteiroseguro, desvio máximo300000ms.
Assinaturahex64 lowercase de SHA256-HMAC(`${timestamp}.${body}`), comparação em
tempo constante. Headers duplicados/valores não escalares são inválidos.
Autenticar antes de revelar existência de evento ou recibo. Não aceitar o corpo
legado nem modificar sua rota/receiver como efeito colateral.

Deadline de headers/corpo2000ms, header máximo8192bytes/16campos, máximo16requisições
em voo e32conexões; recusas fecham a conexão sem eco do input. Códigos estáveis:
401 auth/timestamp;400 corpo/evento;409 conflito de identidade/episódio;413 corpo
grande;503 capacidade/persistência/indisponibilidade;404 caminho/método. Nunca
contabilizar erro de persistência como aceite. No201 responder somente
`{receiptId,payloadSha256}`, IDs válidos de0400, hashhex64 do corpo exato.

## 4. Identidade, ordem e limites

Identidade de entrega é eventIdUUIDv4; receiptIdUUIDv4 é criado uma vez no primeiro
aceite e conservado. Retry autenticado do mesmoeventId+mesmohash devolve201 com
mesmo recibo em qualquer status de encaminhamento, sem novo evento/dispatch.
MesmoeventId com outrohash retorna409, preservando o registro. Lookup e primeiro
commit são serializados: duas requisições concorrentes não recebem recibos novos
nem perdem a pendência aceita por outra requisição.

Um alertId tem exatamente um firing/sequence1 e no máximo um resolved/sequence2,
eventIds distintos. NovoeventId para uma sequência já existente é409. Resolved
exige firing retido, mesma instanceOpaqueId/firstObservedAt/reasonCode e
observedAt>=observedAt do firing. Digests podem diferir por upgrade, como0400.
Aceitar resolved na inbox enquanto firing espera canal é permitido; **encaminhar**
resolved exige firing confirmado noTelegram. Falha/incerteza do firing bloqueia
seu resolved, sem impedir episódios independentes de avançar.

Limite fixo1024eventos retidos e4MiB de snapshot, inclusive confirmados. Não há
TTL, eviction, truncamento ou reset automático que esqueça recibos. Capacidade
cheia recusa evento novo com503 antes do aceite; retries de IDs existentes ainda
devolvem o recibo original. OperaçãoT4 deve dimensionar/documentar manutenção
preservadora antes do limite; esta fatia não fornece comando de apagar/zerar
histórico. O aceite de produção inclui observar capacidade e demonstrar esse
procedimento, não reduzir o requisito de retenção para concluir o componente.

## 5. Estado, transações e recuperação

Snapshot privado v1 de formato fechado: version1, receiverIdUUIDv4, fingerprinthex64, records em
ordem de aceitação. Fingerprint vincula versão do protocolo e hash do destino
chatId/APIbase; credenciais de transporte podem rotacionar sem reescrever evento.
Cada record tem somente bodyUTF8, payloadSha256, receiptId, receivedAtISO,
status, attempts0–5, nextAtISO e telegramMessageId (null ou inteiropositivo seguro).
O body é a fonte única para eventId/alertId/sequence/instance; não manter projeções
divergentes. `telegramMessageId` só existe em statusdelivered. Statuses fechados:
pending, in_flight, delivered, failed, uncertain, blocked.

### Contabilidade fechada de bytes e reserva de transições

Encoding de snapshot fixo: UTF8 sem BOM/newline, JSON compacto gerado pela projeção
abaixo, nessa ordem de chaves. Não reserializar `body`: ele permanece a string de
bytes UTF8 recebidos/assinados, inclusive escapes e whitespace JSON válidos.
Arquivo carregado deve ser byte a byte igual à serialização canônica do estado
validado; não aceitar outra forma e normalizá-la silenciosamente.

```js
function snapshotProjection(s, reserve = false) {
  return {
    version: 1,
    receiverId: s.receiverId,
    fingerprint: s.fingerprint,
    records: s.records.map((r) => ({
      body: r.body,
      payloadSha256: r.payloadSha256,
      receiptId: r.receiptId,
      receivedAt: r.receivedAt,
      status: reserve ? 'in_flight' : r.status,
      attempts: reserve ? 5 : r.attempts,
      nextAt: reserve ? '9999-12-31T23:59:59.999Z' : r.nextAt,
      telegramMessageId: reserve ? Number.MAX_SAFE_INTEGER : r.telegramMessageId
    }))
  }
}
// A projeção reserve calcula um teto, não um estado válido a persistir.
const encode = (s, reserve = false) =>
  Buffer.from(JSON.stringify(snapshotProjection(s, reserve)), 'utf8')
```

Invariante antes do201, a cada commit e ao reabrir:
`encode(state).length <= encode(state,true).length <= 4194304`, records<=1024.
Na admissão, montar o candidato completo incluindo o novo registro/recibo e
medir sua **reserva**, não só o tamanho atual. Se exceder, responder503 sem
publicar/encaminhar/expor novo recibo. Retry de evento já existente mantém201
com seu recibo anterior, mesmo sem capacidade para outro evento.

Prova do teto: body/hash/recibo/receivedAt são imutáveis; version/receiverId/
fingerprint e ordem/cardinalidade não crescem numa transição sem admissão. Todos
os statuses têm no máximo9bytes ASCII, attempts0–5 têm1dígito, nextAtISO canônico
tem24bytes e messageId positivo seguro tem no máximo16dígitos (null tem4bytes).
A projeção de reserva usa o maior tamanho de cada campo, mesmo em combinação
que não é estado de runtime. Portanto transições/dispatch/confirmado/uncertain/
blocked e quarentena no restart cabem sem consumir margem nova. Não persistir a
projeção de reserva nem adulterar messageId para obtê-la. Mudança desse schema
exige rever a prova, não adicionar campo fora da reserva.

Testar último candidato que cabe e próximo que excede por1byte, com histórico
alcançável emFIFO e corpos legais com whitespace/escapes. Depois do aceite
próximo ao teto, provar todas as transições obrigatórias e quarentena após crash
sem ultrapassar4MiB/perder recibo. Um controle que admita só por tamanho atual
deve falhar. Snapshot cuja reserva não cabe é inválido, mesmo se os bytes atuais
ainda couberem; recusar/preservar em vez de zerar, evictar ou elevar os limites.

O bootstrap novo só completa antes de escutar: publica snapshot vazio e
`receiver.meta` fechado (version1/receiverId/fingerprint, até1024bytes,0600), com
fsync. Meta e snapshot devem coincidir. Meta existente com snapshot ausente é
corrupção, não primeiro boot; snapshot sem meta é inicialização incompleta e
recusa startup, preservando ambos para inspeção. Sem ambos, apenas diretório
próprio vazio (fora writer.lock) permite primeiro boot. Nunca houve201 antes de
ambos publicados. Testar crash/falha no bootstrap sem fabricar histórico válido.

Revalidar bytes/hashes, IDs únicos, relações dos episódios, datas, contadores,
cardinalidade e estados alcançáveis ao abrir. Corrupção, fingerprint divergente,
FIFO/link/hardlink/owner/permissão indevidos recusam startup sem reset. Diretório
0700, arquivo0600, limite antes da alocação/leitura. Um escritor com o flock
nativo já demonstrado0400 (FD herdado, programa/argv literais, sem shell).
Segundo escritor é recusado e SIGKILL libera a referência do kernel.

Commit: snapshot novo completo em arquivo exclusivo0600, fsync do arquivo,
rename e fsync do diretório; somente então publicar a memória/recibo. Falha ou
COMMIT local incerto interrompe o writer e recusa novos aceites; não iniciar
Telegram com estado não confirmado. Retry/restart trata o arquivo publicado
como autoridade, validado integralmente. Sem alteração manual automática para
"consertar" corrupção.

Todas as transições usam um único dono da memória/commit. Nunca manter mutex
durante rede; depois do await, reler a **memória atual** e aplicar transição apenas
aoeventId/hash esperado ainda in_flight. Não publicar clone antigo que apague um
POST concorrente. Leituras/status usam o último snapshot publicado.

## 6. Encaminhamento e falhas

| Origem               | Gatilho/guarda                                                                | Destino/efeito                                                                   |
| -------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Ausente              | POST válido/sem conflito/capacidade                                           | pending+recibo publicados atomicamente; depois201                                |
| pending              | Primeiro elegívelFIFO, prazo vencido, firing predecessor entregue se resolved | Persistir in_flight, attempts+1 e próxima data antes da única chamada aoTelegram |
| in_flight            | Resposta de sucesso validada                                                  | delivered+messageId persistidos antes de log de entrega                          |
| in_flight            | Negativa completa e inequívoca da API                                         | pending com backoff; quinta tentativa vira failed                                |
| in_flight            | Timeout/abort/queda/redirect/corpo inválido/resultado ambíguo                 | uncertain persistido; nenhuma repetição automática                               |
| in_flight no restart | Chamada anterior pode ter ocorrido                                            | Converter/persistir uncertain antes de escutar/despachar                         |
| resolved pending     | firing failed/uncertain                                                       | blocked persistido; demais episódios continuam                                   |

Cinco tentativas de negativas conhecidas: primeira imediata, depois30s/2min/10min/
30min, agenda persistida. FIFO aguarda o prazo da primeira pendência elegível;
failed/uncertain/blocked não impedem novos episódios. `blocked` nunca encobre um
resolved que falhou por si; esse continua failed. Reinício não reinicia attempts.

Telegram recebe texto fixo sem parse_mode, sem campos de pagamento/paid broadcast,
com código readiness_unavailable, state, eventId/alertId/instance/digest/datas do
evento validado. Nunca incluir texto de health, URL/segredo ou dado de paciente.
Mensagem no máximo2048caracteres; body de resposta no máximo16KiB, sem redirects,
deadline incluindo conexão/headers/stream. Somente HTTP2xx+JSON `ok:true`+
`result.message_id` inteiroseguro>0 confirma. ID0, resultado ausente e resposta
malformada são uncertain, não sucesso nem negativa conhecida. Negativa conhecida
exige HTTP4xx eJSON `ok:false`, error_code inteiro correspondente ao status;
description não é usada como texto/URL/comando. Para429 com parameters.retry_after
inteiro1–604800, nextAt deve ser o maior entre o backoff e esse prazo; persistir
o ajuste, sem antecipar retry no restart. Se parameters/migrate_to_chat_id ou um
retry_after presente for inválido/fora do limite, conservar uncertain e handoff,
sem trocar destino nem tentar antes do prazo desconhecido. Não seguir conteúdo
de resposta como URL/comando. Demais resultados, inclusive5xx, são uncertain. Defaults/decisões desta fatia não autorizam envio real.

A [documentação oficial](https://core.telegram.org/bots/api#making-requests) exige
HTTPS e descreve ok/result como envelope da resposta; sendMessage retorna Message
no sucesso. O [identificador0](https://core.telegram.org/bots/api#message) pode
representar mensagem ainda não utilizável. A classificação restritiva acima é
decisão proposta do harness; não afirma leitura humana nem exactly-once externo.

Não existe retry automático de uncertain, limpeza de failed ou reenvio por
restart. Emitir `RECONCILIATION_REQUIRED` com eventId/receiptId/hash e estado, sem
segredo. O runbookT4 exige operador conferir o eventId no canal, registrar a
conclusão e executar somente recuperação explicitamente aprovada; não oferecer
reset/resend silencioso nesta fatia. Este handoff e o SLA devem ser qualificados
para operar, e não considerados resolvidos só por haver um log.

## 7. Processo, diagnóstico e implantação

CLI serve/status. Status é readonly, sem rede, sem criar arquivos nem ler token;
valida meta/snapshot e retorna códigos/contagens/IDs opacos; configMatch é
NOT_EVALUATED, pois não lê o destino/segredos para recalcular o fingerprint. `GET /healthz` apenas
processo; `GET /ready` devolve200 se writer saudável/capacidade livre/sem registros
failed/uncertain/blocked ou pending com attempts>0,503 caso contrário, sem dados do destino/corpo. O snapshot
de diagnóstico não é recibo de entrega aoTelegram.

SIGTERM/SIGINT param novos aceites e abortam espera/requests; in_flight deve virar
uncertain antes de fechar. Se o commit não concluir, o registro antigo in_flight
continua conservador no restart. Deadline de término do próprio processo5000ms,
inclusive stdout bloqueado, sem terminar pares. Exemplo systemd privado com
LoadCredential/StateDirectory/UMask0077, sem instalação automática. Rollback para
receiver antigo não é compatível com esta inbox: parar/preservar estado e manter
eventos pendentes no emissor, nunca redirecionar para200 legado como confirmação.

## 8. Aceites congelados propostos

| ID   | Evidência necessária, incluindo controle ruim que deve ser rejeitado                                                                                                                                                                                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RC01 | Config/segredos/caminhos/flags e listenerloopback; FIFO/link/hardlink/owner/mode/size inválidos recusados antes de rede; HMAC igual ao loader0400 para LF/CRLF/SPACE+LF/LFrepetido/whitespaceUnicode, limites/UTF8/NUL                                                          |
| RC02 | Emissor0400 real→POST→201 hash/recibo corretos; legacybody/ISOtimestamp/badHMAC/skew/extras/oversize não aceitam                                                                                                                                                                |
| RC03 | Dois POSTs concorrentes do mesmoevento→mesmorecibo/umregistro; mesmoID/hashdiferente409 semalteração                                                                                                                                                                            |
| RC04 | ACK perdido e restart→mesmobodyHash/receiptId/umforward; negativo em memória volátil deve falhar                                                                                                                                                                                |
| RC05 | Firing/resolved vinculados, ordem de envio e bloqueio corretos; resolvedsemfiring/IDsequênciaduplicada/metadata divergente409                                                                                                                                                   |
| RC06 | Commit falho antes do201→zeroTelegram/zeroaceite falso; pós-receipt/postsendcommitfalho não emite sucesso indevido                                                                                                                                                              |
| RC07 | in_flightpersistido observado antes da rede; SIGKILL real durante envio→restartuncertain/zeroauto-reenvio                                                                                                                                                                       |
| RC08 | Envio suspenso+POSTconcorrente→retorno do envio não apaga a nova inbox/recibo                                                                                                                                                                                                   |
| RC09 | TelegramJSONsucesso/IDpositivo confirma;200HTML/okfalse/ID0/corpoexcessivo/redirect/hang ficam no estado definido                                                                                                                                                               |
| RC10 | Cinco negativas conhecidas, agenda/restart/filaFIFO e contagem; uncertain não repete; failedresolved não vira blocked                                                                                                                                                           |
| RC11 | Limites1024/4MiB com reserva canônica para todas as transições: último que cabe/próximo+1byte; rawbodywhitespace/escapes eFIFOalcançável; retryexistente conserva recibo; corrupção relacional/hash/meta, reserva inválida ou snapshot ausente após bootstrap não são resetados |
| RC12 | Dois writers/SIGKILL/reabertura, SIGTERM sob headers/body/envio e stdoutbloqueado; filhos próprios encerrados                                                                                                                                                                   |
| RC13 | Logs/status finitos e privacidade; ready503 e handoff visível para failed/uncertain/blocked/capacidade; zero URL/token/chatId/payload livre                                                                                                                                     |
| RC14 | E2E local entre emissor/receptor/TelegramHTTPsimulado, shutdown/restart/retorno, provas brutas e hashes; controles positivos não simulam a fronteira testada                                                                                                                    |
| RC15 | Relay/API/worker/produto/lockfile antigos intactos; sóbuiltins/arquivos próprios; regressões0400/relay preservadas                                                                                                                                                              |
| RC16 | Type/lint/npmtest/PG/E2E/certificação aplicáveis reais; separar qualificação local de envio real/segundohost/U10/U12/T4 e dos critérios completos deSRV01                                                                                                                       |

## 9. Próxima ação e limites do gate

Revisão independente de classificação, protocolo, FSM, persistência e aceites,
no hash exato. Nenhum BUILD antes de resolver obrigatórios e autoridade aplicável.
Depois: tarefa e candidata próprias, provaRED/GREEN onde houver defeito de ligação,
implementação vertical e revisão fresca do código. A certificação atual do emissor
não certifica este receiver futuro nem será reiniciada só por este documento.
Toda etapa consulta/atualizaGBrain; ledgers ocupados recebem deltas no handoff.
